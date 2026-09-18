#!/usr/bin/env python3
"""Maintainer-only, explicit identity deployment. Never calls legacy initialization."""
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
        protected(staging/'deployment.json',json.dumps({'schema':1,'installPath':str(ROOT),'identity':'mj33kd','host':host,'baseline':baseline,'composeProject':'workbench-v1','nativeQuotaBytes':4*1024**3,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
        staging.rename(runtime)
    except BaseException:
        # No data is silently erased after a failed initialization.
        print('Initialization did not complete; preserved staging: '+str(staging), file=sys.stderr)
        raise


def admin_installed():
    folder=ROOT/'runtime/admin'
    if not folder.exists():return False
    marker=folder/'deployment.json'
    if folder.is_symlink() or not marker.is_file():raise RuntimeError('Unknown administrator data; refusing overwrite')
    cfg=json.loads(marker.read_text())
    if cfg.get('schema')!=1 or cfg.get('identity')!='admin' or cfg.get('installPath')!=str(ROOT):
        raise RuntimeError('Unknown administrator deployment')
    return True


def configure_compose():
    override=str(ROOT/'compose.v1-admin.json')
    COMPOSE[:]=['docker','compose','-p','workbench-v1','-f',str(ROOT/'compose.v1.json')]
    if admin_installed():COMPOSE.extend(['-f',override])


def administrator_password_hash():
    first=getpass.getpass('New local admin password (12+ characters; hidden): ')
    second=getpass.getpass('Confirm local admin password (hidden): ')
    if first!=second or len(first)<12 or len(first)>1024:
        raise RuntimeError('Passwords must match and contain 12 to 1024 characters; no changes made')
    salt=secrets.token_bytes(16)
    key=hashlib.scrypt(first.encode(),salt=salt,n=32768,r=8,p=1,dklen=64,maxmem=64*1024*1024)
    return 'scrypt$32768$8$1$'+salt.hex()+'$'+key.hex()


def administrator_browser_config(runtime):
    # Playwright CLI's proxy is a Chromium launch option, not a browser option.
    # Validate before prompting or stopping the existing engineer environment.
    config=json.loads((runtime/'browser.json').read_text())
    browser=config.get('browser')
    launch=browser.get('launchOptions') if isinstance(browser,dict) else None
    proxy=launch.get('proxy') if isinstance(launch,dict) else None
    if not isinstance(proxy,dict) or not isinstance(proxy.get('server'),str):
        raise RuntimeError('Expected browser.launchOptions.proxy in the fixed Playwright CLI configuration; no changes made')
    proxy['server']='http://admin-web-egress:8320'
    return config


def ip_entry_configuration(config):
    if config.get('auth',{}).get('mode')!='mixed' or set(config['users'])!={'mj33kd','admin'}:
        raise RuntimeError('IP entries require the recognized local-admin and NetID deployment')
    cfg=json.loads(json.dumps(config))
    host=str(ipaddress.IPv4Address(deployment()['host']))
    cfg['publicOrigins']={'mj33kd':{'workbench':f'https://{host}:8443','preview':f'https://{host}:8445'},'admin':{'workbench':f'https://{host}:8447','preview':f'https://{host}:8449'}}
    cfg['cookieNames']={'mj33kd':{'session':'agent_session','preview':'workbench_preview'},'admin':{'session':'agent_session_admin','preview':'workbench_preview_admin'}}
    return cfg


def check_admin_entry_ports():
    for port,service in [(8447,'admin-edge-workbench'),(8449,'admin-edge-preview')]:
        if output(COMPOSE+['ps','--status','running','-q',service]):continue
        with socket.socket() as probe:
            try:probe.bind(('0.0.0.0',port))
            except OSError as error:raise RuntimeError(f'Administrator entry port {port} is occupied; no changes made') from error


def use_ip_entries():
    runtime=ROOT/'runtime'
    cfg=json.loads((runtime/'platform.json').read_text())
    if not admin_installed():raise RuntimeError('Install the independent administrator first; no changes made')
    candidate=ip_entry_configuration(cfg)
    edge=json.loads((runtime/'edge.json').read_text())
    if all(current.get('publicOrigins')==candidate['publicOrigins'] and current.get('cookieNames')==candidate['cookieNames'] for current in [cfg,edge]):
        print('IP entries already configured; identities and data retained');start();return
    check_admin_entry_ports();idle()
    # Stop and preserve both environments before changing only ingress settings.
    backup(restart=False)
    try:
        edge['publicOrigins']=candidate['publicOrigins'];edge['cookieNames']=candidate['cookieNames']
        protected(runtime/'platform.json',json.dumps(candidate,indent=2)+'\n')
        protected(runtime/'edge.json',json.dumps(edge,indent=2)+'\n')
        start()
        print('Administrator: '+candidate['publicOrigins']['admin']['workbench']+'/\nPreview is authorized from WorkBench; no client hosts changes required.')
    except BaseException:
        print('IP entry migration failed; retained both environments and cold backup. Inspect the reported error before retrying; never reinitialize projects.',file=sys.stderr)
        raise


def add_admin():
    cfg=json.loads((ROOT/'runtime/platform.json').read_text())
    if admin_installed():
        if cfg.get('auth',{}).get('mode')!='mixed' or cfg.get('users',{}).get('admin',{}).get('authProvider')!='local-admin':
            raise RuntimeError('Administrator installation is incomplete; restore the pre-change backup instead of resetting data')
        print('Administrator already installed; password and data retained')
        start();return
    if set(cfg['users'])!={'mj33kd'} or cfg.get('auth',{}).get('mode')!='netid':
        raise RuntimeError('Expected recognized single-NetID source configuration')
    runtime=ROOT/'runtime'
    browser=administrator_browser_config(runtime)
    check_admin_entry_ports()
    idle()
    password_hash=administrator_password_hash()
    # A complete cold backup is required before installing a second identity.
    backup()
    folder=runtime/'admin'
    staging=Path(tempfile.mkdtemp(prefix='.admin-initializing-',dir=runtime))
    os.umask(0o077)
    try:
        (staging/'project').mkdir();(staging/'state').mkdir()
        (staging/'project/README.md').write_text('# Administrator independent project\n\nWeb applications live in web/.\n')
        (staging/'project/.gitignore').write_text((runtime/'project/.gitignore').read_text())
        checked(['git','init','-q',str(staging/'project')])
        checked(['git','-C',str(staging/'project'),'add','README.md','.gitignore'])
        checked(['git','-C',str(staging/'project'),'-c','user.name=WorkBench','-c','user.email=workbench@invalid','commit','-qm','Initial independent administrator project'])
        (staging/'project').chmod(0o755)
        for p in (staging/'project').rglob('*'):
            p.chmod(0o755 if p.is_dir() else stat.S_IMODE(p.stat().st_mode)|0o044)
        baseline=output(['git','-C',str(staging/'project'),'rev-parse','HEAD'])
        for name in ['gateway-state','disks','state/browser-home','state/browser-config','state/browser-cache']:(staging/name).mkdir(parents=True,exist_ok=True)
        scope,native_password=[secrets.token_urlsafe(32) for _ in range(2)]
        gateway=dict(line.split('=',1) for line in (runtime/'gateway.env').read_text().splitlines() if '=' in line)
        gateway['ENV_MODEL_TOKEN']=scope;gateway['MODEL_DAILY_REQUEST_LIMIT']='100000'
        protected(staging/'gateway.env',''.join(k+'='+v+'\n' for k,v in gateway.items()))
        protected(staging/'native.env',f'OPENCODE_SERVER_PASSWORD={native_password}\nENV_MODEL_TOKEN={scope}\nPROJECT_BASELINE={baseline}\nOPENCODE_CLIENT=app\n')
        native=json.loads((runtime/'opencode.json').read_text())
        native['provider']['approved']['options']['baseURL']='http://admin-model-gateway:8318/v1'
        native['provider']['approved']['options']['apiKey']=scope
        protected(staging/'opencode.json',json.dumps(native,indent=2)+'\n')
        protected(staging/'browser.json',json.dumps(browser,indent=2)+'\n')
        protected(staging/'deployment.json',json.dumps({'schema':1,'identity':'admin','installPath':str(ROOT),'baseline':baseline})+'\n')
        cfg['auth']['mode']='mixed'
        cfg['users']['mj33kd'].update(authProvider='netid',role='engineer')
        cfg['users']['admin']={'displayName':'管理员','enabled':True,'authProvider':'local-admin','role':'admin','passwordHash':password_hash,'environment':'http://admin-native:4096','nativePassword':native_password}
        cfg=ip_entry_configuration(cfg)
        edge=json.loads((runtime/'edge.json').read_text());edge['publicOrigins']=cfg['publicOrigins'];edge['cookieNames']=cfg['cookieNames']
        # Commit only after all initialization succeeds. Failures retain cold backup
        # and staging; recovery is explicit, never an automatic project reset.
        staging.rename(folder)
        quota(runtime=folder)
        protected(runtime/'platform.json',json.dumps(cfg,indent=2)+'\n')
        protected(runtime/'edge.json',json.dumps(edge,indent=2)+'\n')
        configure_compose()
        # No force-recreate and no updates to the engineer native service spec.
        checked(COMPOSE+['up','-d','--no-build','--wait','--wait-timeout','180'])
        checked(COMPOSE+['restart','edge-workbench','edge-preview','admin-edge-workbench','admin-edge-preview'])
        print('Administrator installed: '+cfg['publicOrigins']['admin']['workbench']+'/\nNo client hosts changes required. NetID project preserved; actual two-identity acceptance remains required.')
    except BaseException:
        if folder.exists():
            print('Administrator installation failed after committing administrator data; retained data and cold backup. Restore before retrying.')
        else:
            print('Administrator installation failed before committing administrator data; engineer configuration unchanged. Retained staging and cold backup; fix the reported error and retry without resetting data.')
        raise


def maintenance(script, runtime=None):
    runtime=runtime or ROOT/'runtime'
    checked(['docker','run','--rm','--user','0:0','--network','none','--cap-drop','ALL',
             '--cap-add','SYS_ADMIN','--cap-add','DAC_OVERRIDE','--cap-add','CHOWN','--cap-add','MKNOD',
             '--device','/dev/loop-control','--device-cgroup-rule','b 7:* rwm','--security-opt','apparmor=unconfined',
             '--mount',f'type=bind,src={runtime}/disks,dst=/disks,bind-propagation=rshared',
             '--entrypoint','sh',IMAGE,'-c',script])


def quota_bytes(runtime):
    if runtime==ROOT/'runtime/admin':return 1024**3
    value=json.loads((runtime/'deployment.json').read_text()).get('nativeQuotaBytes',1024**3)
    if value not in [1024**3,4*1024**3]:raise RuntimeError('Unapproved engineer quota capacity')
    return value


def quota(unmount=False, runtime=None):
    runtime=runtime or ROOT/'runtime'; disks=runtime/'disks'; disk=disks/'native.img'; dest=disks/'native'
    dest.mkdir(exist_ok=True)
    mounted=subprocess.run(['mountpoint','-q',str(dest)]).returncode==0
    if unmount:
        if mounted:
            maintenance('set -eu; sync; dev=$(findmnt -n -o SOURCE /disks/native); case "$dev" in /dev/loop[0-9]*) ;; *) exit 2 ;; esac; test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; umount /disks/native; losetup -d "$dev"', runtime)
        return
    expected=quota_bytes(runtime)
    if not disk.exists():
        if any(dest.iterdir()):raise RuntimeError('Unknown quota destination data')
        checked(['fallocate','-l',str(expected),str(disk)]);checked(['mkfs.ext4','-q','-F',str(disk)])
    if disk.stat().st_size!=expected:raise RuntimeError('Quota image differs from recorded approved capacity')
    if not mounted:
        if any(dest.iterdir()):raise RuntimeError('Unbounded quota destination contains data; refusing mount')
        maintenance('set -eu; dev=$(losetup -f); test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; losetup "$dev" /disks/native.img; mount -o rw,nosuid,nodev "$dev" /disks/native; mkdir -p /disks/native/project /disks/native/state; chown 1000:1000 /disks/native/project /disks/native/state', runtime)
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
    cfg=deployment();configure_compose();quota()
    if admin_installed():quota(runtime=ROOT/'runtime/admin')
    checked(COMPOSE+['up','-d','--no-build','--wait','--wait-timeout','180'])
    context=ssl.create_default_context(cafile=str(ROOT/'runtime/ca.crt'))
    with urllib.request.urlopen(f'https://{cfg["host"]}:8443/__platform/login',context=context,timeout=10) as response:
        if response.status!=200:raise RuntimeError('HTTPS login page unavailable')
    print(f'WorkBench: https://{cfg["host"]}:8443/\nNetID: mj33kd (no local fallback)\nClient root certificate: {ROOT}/runtime/ca.crt\nBrowser trust and actual NetID login: NOT_YET_ACCEPTED')


def idle():
    configure_compose()
    for prefix in ['', 'admin-'] if admin_installed() else ['']:
        idle_environment(prefix)


def idle_environment(prefix):
    if not output(COMPOSE+['ps','--status','running','-q',prefix+'native']):return
    script="fetch('http://127.0.0.1:4030/session/status',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('status');const s=await r.json();process.exit(Object.values(s).some(x=>x.type!=='idle')?3:0)}).catch(()=>process.exit(2))"
    checked(COMPOSE+['exec','-T',prefix+'native-guard','node','-e',script])


def backup(restart=True):
    deployment();configure_compose();idle();checked(COMPOSE+['stop'])
    folder=ROOT/'backups';folder.mkdir(exist_ok=True)
    name=folder/('runtime-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.tar.gz')
    try:
        quota(unmount=True)
        if admin_installed():quota(unmount=True,runtime=ROOT/'runtime/admin')
        with tarfile.open(name,'w:gz',dereference=False,compresslevel=3) as archive:archive.add(ROOT/'runtime',arcname='runtime')
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
            deployment();configure_compose();idle();checked(COMPOSE+['stop']);quota(unmount=True)
            if admin_installed():quota(unmount=True,runtime=ROOT/'runtime/admin')
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
        if admin_installed() and not (candidate/'compose.v1-admin.json').is_file():raise RuntimeError('Single-identity artifacts cannot run a dual-identity runtime; use a compatible release')
        if json.loads((ROOT/'runtime/platform.json').read_text()).get('cookieNames') and 'sessionCookieName' not in (candidate/'src/preview-origin.mjs').read_text():raise RuntimeError('Old artifacts cannot run IP entries with isolated credential cookies; use a compatible release or restore its matching configuration first')
        if deployment().get('nativeQuotaBytes',1024**3)==4*1024**3 and 'nativeQuotaBytes' not in (candidate/'scripts/v1-deploy.py').read_text():raise RuntimeError('Old artifacts cannot run the approved 4 GiB runtime; use a capacity-compatible release')
        backup(restart=False)
        saved=ROOT/'backups'/('artifacts-'+secrets.token_hex(4));saved.mkdir()
        names={p.name for p in ROOT.iterdir()}-{'runtime','backups','.deployment.lock',Path(directory).name}
        for name in names:(ROOT/name).rename(saved/name)
        for item in candidate.iterdir():item.rename(ROOT/item.name)
        load_images(manifest);start()
        print('Previous artifacts retained: '+str(saved)+'; project and sessions restored unchanged')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',nargs='?',default='start',choices=['start','status','stop','backup','restore','rollback','add-admin','use-ip-entries'])
    parser.add_argument('--host',default='10.243.117.57')
    parser.add_argument('--model-key-file')
    parser.add_argument('--archive');parser.add_argument('--sha256')
    args=parser.parse_args()
    os.chdir(ROOT);verify_location()
    lock=os.open(ROOT/'.deployment.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('Another deployment operation is active')
    manifest=verify_bundle()
    configure_compose()
    if args.action=='add-admin':
        deployment();load_images(manifest);add_admin();return
    if args.action=='use-ip-entries':
        deployment();use_ip_entries();return
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
