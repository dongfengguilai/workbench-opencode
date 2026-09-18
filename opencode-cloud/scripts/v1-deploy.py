#!/usr/bin/env python3
"""Maintainer-only, fresh one-NetID deployment. Never calls legacy initialization."""
from pathlib import Path
import argparse
import datetime
import getpass
import hashlib
import ipaddress
import json
import os
import secrets
import shutil
import stat
import subprocess
import tarfile
import tempfile
import urllib.request
import ssl
import sys
import fcntl
import socket

ROOT = Path(__file__).resolve().parents[1]
TARGET = Path('/home/aisvr/mnt/sda/programs/WorkBench-v1')
IMAGE = 'opencode-cloud/native:1.18.31-managed-v0'
COMPOSE = ['docker', 'compose', '-p', 'workbench-v1', '-f', str(ROOT / 'compose.v1.json')]


def checked(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def protected(path, text):
    Path(path).write_text(text)
    Path(path).chmod(0o600)


def verify_bundle(root=ROOT):
    manifest = json.loads((root / 'bundle-manifest.json').read_text())
    if manifest['schema'] != 1 or manifest['opencode'] != '1.18.31' or manifest['playwrightCLI'] != '0.1.20':
        raise RuntimeError('Not the approved fixed V1 bundle')
    for line in (root / 'checksums.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or (root / relative).is_symlink():
            raise RuntimeError('Unsafe artifact path')
        if digest(root / relative) != expected:
            raise RuntimeError('Artifact checksum mismatch: ' + name)
    return manifest


def verify_location():
    if ROOT != TARGET or ROOT.resolve() != TARGET:
        raise RuntimeError('Install exactly at ' + str(TARGET) + '; symlink aliases are not allowed')
    if any(p.is_symlink() for p in [ROOT, *ROOT.parents]):
        raise RuntimeError('Installation path has a symlink component')
    if os.getuid() != 1000:
        raise RuntimeError('This fixed image requires installation by UID 1000; do not initialize as root')
    mount = json.loads(output(['findmnt', '-J', '-T', str(ROOT), '-o', 'TARGET,FSTYPE,PROPAGATION']))['filesystems'][0]
    if mount['fstype'] != 'ext4' or mount['propagation'] != 'shared':
        raise RuntimeError('Writable ext4 / shared mount required')
    if shutil.disk_usage(ROOT).free < 4 * 1024**3 or not Path('/dev/loop-control').exists():
        raise RuntimeError('At least 4 GiB free and loop-control are required')
    # The archive extractor checks an empty destination before extraction. Also
    # refuse unrelated files inserted after extraction, rather than claiming them.
    allowed = {Path(line.split('  ', 1)[1]).parts[0] for line in (ROOT / 'checksums.sha256').read_text().splitlines()}
    allowed |= {'checksums.sha256', 'runtime', 'backups', '.deployment.lock'}
    unknown = sorted(p.name for p in ROOT.iterdir() if p.name not in allowed)
    if unknown:
        raise RuntimeError('Unknown installation data; refusing to overwrite: ' + ', '.join(unknown))


def load_images(manifest):
    for image in manifest['images']:
        found = subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image['tag']], capture_output=True, text=True)
        if found.returncode or found.stdout.strip() != image['id']:
            checked(['docker', 'load', '-i', str(ROOT / image['archive'])], stdout=subprocess.DEVNULL)
        if output(['docker', 'image', 'inspect', '--format', '{{.Id}}', image['tag']]) != image['id']:
            raise RuntimeError('Loaded image differs from approved artifact: ' + image['tag'])


def certs(runtime, host):
    # Private CA key stays in runtime, never mounted into any service or bundle.
    quiet = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    checked(['openssl', 'req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-days', '1825',
             '-keyout', str(runtime/'ca.key'), '-out', str(runtime/'ca.crt'), '-subj', '/CN=WorkBench V1 private root',
             '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], **quiet)
    for name, cn, san in [('edge', host, 'IP:'+host), ('tls', 'platform', 'DNS:platform')]:
        checked(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(runtime/(name+'.key')),
                 '-out', str(runtime/(name+'.csr')), '-subj', '/CN='+cn], **quiet)
        ext = runtime/(name+'.ext')
        ext.write_text('basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName='+san+'\n')
        checked(['openssl', 'x509', '-req', '-in', str(runtime/(name+'.csr')), '-CA', str(runtime/'ca.crt'),
                 '-CAkey', str(runtime/'ca.key'), '-CAcreateserial', '-days', '365', '-sha256', '-extfile', str(ext),
                 '-out', str(runtime/(name+'.crt'))], **quiet)
        (runtime/(name+'.key')).chmod(0o600)
        (runtime/(name+'.csr')).unlink(); ext.unlink()
    (runtime/'ca.key').chmod(0o600)


def initialize(host, key):
    runtime = ROOT/'runtime'
    if runtime.exists():
        raise RuntimeError('Existing runtime is unrecognized; no automatic initialization or repair')
    if output(['docker','ps','-aq','--filter','label=com.docker.compose.project=workbench-v1']):
        raise RuntimeError('Unknown existing workbench-v1 containers; refusing initialization')
    for port in [8443,8445]:
        with socket.socket() as probe:
            probe.bind(('0.0.0.0',port))
    # All initialization occurs in a new directory, then is committed once.
    staging = Path(tempfile.mkdtemp(prefix='.v1-initializing-', dir=ROOT))
    os.umask(0o077)
    try:
        project = staging/'project'; project.mkdir()
        (project/'README.md').write_text('# WorkBench project\n\nYour independent project. Supported web applications live in `web/`.\n')
        (project/'.gitignore').write_text('/web/node_modules/\n/web/dist/\n/web/.vite/\n/.workbench-artifacts/\n')
        checked(['git', 'init', '-q', str(project)])
        checked(['git', '-C', str(project), 'add', 'README.md', '.gitignore'])
        checked(['git', '-C', str(project), '-c', 'user.name=WorkBench', '-c', 'user.email=workbench@invalid', 'commit', '-qm', 'Initial independent project'])
        baseline = output(['git', '-C', str(project), 'rev-parse', 'HEAD'])
        for path in [project, *project.rglob('*')]:
            path.chmod(0o755 if path.is_dir() else stat.S_IMODE(path.stat().st_mode)|0o044)
        state = staging/'state'; state.mkdir()
        for name in ['browser-home','browser-config','browser-cache']:(state/name).mkdir()
        for name in ['gateway-state','platform-state','disks']:(staging/name).mkdir()
        scope, password, relay = [secrets.token_urlsafe(32) for _ in range(3)]
        protected(staging/'gateway.env', f'MODEL_ROUTE_MODE=qwen-only\nQWEN_UPSTREAM=http://10.243.117.57:4003\nQWEN_MASTER_KEY={key}\nENV_MODEL_TOKEN={scope}\nMODEL_DAILY_REQUEST_LIMIT=100000\n')
        protected(staging/'native.env', f'OPENCODE_SERVER_PASSWORD={password}\nENV_MODEL_TOKEN={scope}\nPROJECT_BASELINE={baseline}\nOPENCODE_CLIENT=app\n')
        native={'$schema':'https://opencode.ai/config.json','model':'approved/Qwen3.6-35B-A3B','small_model':'approved/Qwen3.6-35B-A3B','enabled_providers':['approved'],'autoupdate':False,'share':'disabled','instructions':['/trusted/BROWSER_USAGE.md'],'provider':{'approved':{'npm':'@ai-sdk/openai-compatible','name':'Approved Qwen','options':{'baseURL':'http://model-gateway:8318/v1','apiKey':scope},'models':{'Qwen3.6-35B-A3B':{'name':'Qwen3.6-35B-A3B','limit':{'context':131072,'output':16000},'modalities':{'input':['text','image'],'output':['text']},'tool_call':True,'reasoning':True}}}},'permission':{'*':'allow','external_directory':'deny'}}
        protected(staging/'opencode.json', json.dumps(native,indent=2)+'\n')
        browser={'browser':{'browserName':'chromium','isolated':True,'launchOptions':{'channel':'chromium','headless':True,'chromiumSandbox':False,'args':['--proxy-bypass-list=<-loopback>;127.0.0.1:5173'],'env':{'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/state/browser-home','XDG_CONFIG_HOME':'/state/browser-config','XDG_CACHE_HOME':'/state/browser-cache','LANG':'C.UTF-8','TMPDIR':'/tmp'},'proxy':{'server':'http://web-egress:8320','bypass':'<-loopback>;127.0.0.1:5173'}}},'outputDir':'/workspace/project/.workbench-artifacts'}
        protected(staging/'browser.json',json.dumps(browser,indent=2)+'\n')
        pairs={'mj33kd':{'workbench':f'https://{host}:8443','preview':f'https://{host}:8445'}}
        cfg={'origin':'https://platform:8443','sessionTtl':3600,'previewRelayKey':relay,'publicOrigins':pairs,'auth':{'mode':'netid','baseUrl':'http://10.132.17.137:44327'},'users':{'mj33kd':{'displayName':'mj33kd','enabled':True,'environment':'http://native:4096','nativePassword':password}}}
        protected(staging/'platform.json',json.dumps(cfg,indent=2)+'\n')
        certs(staging,host)
        der = subprocess.check_output(['openssl','x509','-in',str(staging/'tls.crt'),'-outform','DER'])
        protected(staging/'edge.json',json.dumps({'origin':cfg['origin'],'previewRelayKey':relay,'publicOrigins':pairs,'platformFingerprint':hashlib.sha256(der).hexdigest()},indent=2)+'\n')
        protected(staging/'deployment.json',json.dumps({'schema':1,'installPath':str(ROOT),'identity':'mj33kd','host':host,'baseline':baseline,'composeProject':'workbench-v1','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
        staging.rename(runtime)
    except BaseException:
        # No data is silently erased after a failed initialization.
        print('Initialization did not complete; preserved staging: '+str(staging), file=sys.stderr)
        raise


def maintenance(script):
    checked(['docker','run','--rm','--user','0:0','--network','none','--cap-drop','ALL',
             '--cap-add','SYS_ADMIN','--cap-add','DAC_OVERRIDE','--cap-add','CHOWN','--cap-add','MKNOD',
             '--device','/dev/loop-control','--device-cgroup-rule','b 7:* rwm','--security-opt','apparmor=unconfined',
             '--mount',f'type=bind,src={ROOT}/runtime/disks,dst=/disks,bind-propagation=rshared',
             '--entrypoint','sh',IMAGE,'-c',script])


def quota(unmount=False):
    runtime=ROOT/'runtime'; disks=runtime/'disks'; disk=disks/'native.img'; dest=disks/'native'
    dest.mkdir(exist_ok=True)
    mounted=subprocess.run(['mountpoint','-q',str(dest)]).returncode==0
    if unmount:
        if mounted:
            maintenance('set -eu; sync; dev=$(findmnt -n -o SOURCE /disks/native); case "$dev" in /dev/loop[0-9]*) ;; *) exit 2 ;; esac; test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; umount /disks/native; losetup -d "$dev"')
        return
    if not disk.exists():
        if any(dest.iterdir()):raise RuntimeError('Unknown quota destination data')
        checked(['fallocate','-l','1G',str(disk)]);checked(['mkfs.ext4','-q','-F',str(disk)])
    if disk.stat().st_size!=1024**3:raise RuntimeError('Quota image is not the approved 1 GiB size')
    if not mounted:
        if any(dest.iterdir()):raise RuntimeError('Unbounded quota destination contains data; refusing mount')
        maintenance('set -eu; dev=$(losetup -f); test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; losetup "$dev" /disks/native.img; mount -o rw,nosuid,nodev "$dev" /disks/native; mkdir -p /disks/native/project /disks/native/state; chown 1000:1000 /disks/native/project /disks/native/state')
    mount=json.loads(output(['findmnt','-J','-T',str(dest),'-o','TARGET,FSTYPE,OPTIONS']))['filesystems'][0]
    if Path(mount['target'])!=dest or mount['fstype']!='ext4' or 'rw' not in mount['options'].split(','):
        raise RuntimeError('Bounded ext4 mount not verified')
    for name in ['project','state']:
        original=runtime/name; target=dest/name
        if original.is_symlink():
            if original.resolve()!=target:raise RuntimeError('Unexpected persistent-data symlink')
            continue
        if not original.is_dir() or any(target.iterdir()):raise RuntimeError('Refusing quota initialization over existing data')
        shutil.copytree(original,target,dirs_exist_ok=True,symlinks=True)
        original.rename(runtime/(name+'.initial-seed'))
        original.symlink_to(target.relative_to(runtime),target_is_directory=True)


def deployment():
    cfg=json.loads((ROOT/'runtime/deployment.json').read_text())
    if cfg['schema']!=1 or cfg['installPath']!=str(ROOT) or cfg['identity']!='mj33kd' or cfg['composeProject']!='workbench-v1':
        raise RuntimeError('Unrecognized runtime; refusing automatic reset')
    return cfg


def start():
    cfg=deployment();quota()
    checked(COMPOSE+['up','-d','--no-build','--wait','--wait-timeout','180'])
    context=ssl.create_default_context(cafile=str(ROOT/'runtime/ca.crt'))
    with urllib.request.urlopen(f'https://{cfg["host"]}:8443/__platform/login',context=context,timeout=10) as response:
        if response.status!=200:raise RuntimeError('HTTPS login page unavailable')
    print(f'WorkBench: https://{cfg["host"]}:8443/\nNetID: mj33kd (no local fallback)\nClient root certificate: {ROOT}/runtime/ca.crt\nBrowser trust and actual NetID login: NOT_YET_ACCEPTED')


def idle():
    if not output(COMPOSE+['ps','--status','running','-q','native']):return
    script="fetch('http://127.0.0.1:4030/session/status',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('status');const s=await r.json();process.exit(Object.values(s).some(x=>x.type!=='idle')?3:0)}).catch(()=>process.exit(2))"
    checked(COMPOSE+['exec','-T','native-guard','node','-e',script])


def backup(restart=True):
    deployment();idle();checked(COMPOSE+['stop']);quota(unmount=True)
    folder=ROOT/'backups';folder.mkdir(exist_ok=True)
    name=folder/('runtime-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.tar.gz')
    try:
        with tarfile.open(name,'w:gz',dereference=False) as archive:archive.add(ROOT/'runtime',arcname='runtime')
        name.chmod(0o600);protected(name.with_suffix(name.suffix+'.sha256'),digest(name)+'\n')
        print('Cold backup (includes protected credentials): '+str(name))
    finally:
        if restart:start()


def safe_archive(archive, namespace):
    for item in archive.getmembers():
        path=Path(item.name)
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!=namespace or item.isdev() or item.isfifo():
            raise RuntimeError('Unsafe archive entry')
        if item.issym() or item.islnk():
            link=Path(item.linkname)
            if link.is_absolute() or '..' in link.parts:raise RuntimeError('Unsafe archive link')


def restore(path, expected):
    if digest(path)!=expected:raise RuntimeError('Backup digest mismatch')
    with tempfile.TemporaryDirectory(prefix='.restore-',dir=ROOT) as directory:
        with tarfile.open(path) as archive:
            safe_archive(archive,'runtime');archive.extractall(directory,filter='data')
        candidate=Path(directory)/'runtime'
        cfg=json.loads((candidate/'deployment.json').read_text())
        if cfg.get('installPath')!=str(ROOT) or cfg.get('identity')!='mj33kd':raise RuntimeError('Backup belongs to another deployment')
        if (ROOT/'runtime').exists():
            deployment();idle();checked(COMPOSE+['stop']);quota(unmount=True)
            backups=ROOT/'backups';backups.mkdir(exist_ok=True)
            (ROOT/'runtime').rename(backups/('runtime.pre-restore-'+secrets.token_hex(4)))
        candidate.rename(ROOT/'runtime')
    start()


def rollback(path, expected):
    if digest(path)!=expected:raise RuntimeError('Artifact archive digest mismatch')
    with tempfile.TemporaryDirectory(prefix='.rollback-',dir=ROOT) as directory:
        with tarfile.open(path) as archive:
            safe_archive(archive,'WorkBench-v1')
            if any(item.issym() or item.islnk() for item in archive.getmembers()):raise RuntimeError('Artifact links are not allowed')
            archive.extractall(directory,filter='data')
        candidate=Path(directory)/'WorkBench-v1';manifest=verify_bundle(candidate)
        if (candidate/'runtime').exists() or (candidate/'backups').exists():raise RuntimeError('Artifact package must not contain live data')
        backup(restart=False)
        saved=ROOT/'backups'/('artifacts-'+secrets.token_hex(4));saved.mkdir()
        names={p.name for p in ROOT.iterdir()}-{'runtime','backups','.deployment.lock',Path(directory).name}
        for name in names:(ROOT/name).rename(saved/name)
        for item in candidate.iterdir():item.rename(ROOT/item.name)
        load_images(manifest);start()
        print('Previous artifacts retained: '+str(saved)+'; project and sessions restored unchanged')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',nargs='?',default='start',choices=['start','status','stop','backup','restore','rollback'])
    parser.add_argument('--host',default='10.243.117.57')
    parser.add_argument('--model-key-file')
    parser.add_argument('--archive');parser.add_argument('--sha256')
    args=parser.parse_args()
    os.chdir(ROOT);verify_location()
    lock=os.open(ROOT/'.deployment.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('Another deployment operation is active')
    manifest=verify_bundle()
    if args.action=='status':
        deployment();checked(COMPOSE+['ps']);return
    if args.action=='stop':
        deployment();idle();checked(COMPOSE+['stop']);return
    if args.action=='backup':backup();return
    if args.action=='restore':
        if not args.archive or not args.sha256:parser.error('restore requires --archive and --sha256')
        load_images(manifest);restore(Path(args.archive),args.sha256);return
    if args.action=='rollback':
        if not args.archive or not args.sha256:parser.error('rollback requires --archive and --sha256')
        rollback(Path(args.archive),args.sha256);return
    load_images(manifest)
    if not (ROOT/'runtime').exists():
        host=str(ipaddress.IPv4Address(args.host))
        if args.model_key_file:
            keyfile=Path(args.model_key_file)
            if keyfile.stat().st_mode&0o077:raise RuntimeError('Model key file must be owner-only')
            key=keyfile.read_text().strip()
        else:key=getpass.getpass('Model API key (hidden; never a NetID password): ').strip()
        if not key or '\n' in key or '\r' in key:raise RuntimeError('One-line model credential required')
        initialize(host,key)
    start()


if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,subprocess.CalledProcessError) as error:
        print('Deployment stopped: '+str(error),file=sys.stderr);raise SystemExit(2)
