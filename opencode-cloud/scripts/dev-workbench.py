#!/usr/bin/env python3
"""Maintainer-only local profile. Never format existing disks or invoke old initialization."""
import argparse, datetime, getpass, hashlib, json, os, re, secrets, shutil, signal, socket, subprocess, sys, tarfile, time
import urllib.request, fcntl
from pathlib import Path

REPO=Path(__file__).resolve().parents[2]
CLOUD=REPO/'opencode-cloud'
INSTALL=Path('/home/vmware/Workspace/programs/WorkBench')
RUNTIME=INSTALL/'runtime'
RELEASE=INSTALL/'releases/increment-v1'
OLD=CLOUD/'runtime'
IMAGE='opencode-cloud/native:1.18.31-managed-v0'
MARKER={'kind':'workbench-local-development','schema':1,'sourceRepository':str(REPO)}
SERVICES=['model-gateway','web-egress','native','native-firewall','native-guard','admin-model-gateway','admin-web-egress','admin-native','admin-native-firewall','admin-native-guard','engineer-b-model-gateway','engineer-b-web-egress','engineer-b-native','engineer-b-native-firewall','engineer-b-native-guard','platform']

def run(args,**kwargs):
    return subprocess.run([str(a) for a in args],check=True,**kwargs)

def capture(args,**kwargs):
    return subprocess.check_output([str(a) for a in args],text=True,**kwargs).strip()

def protected(path,content):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(content)

def json_write(path,value):protected(path,json.dumps(value,indent=2,ensure_ascii=False)+'\n')

def password_hash(password):
    salt=secrets.token_bytes(16)
    key=hashlib.scrypt(password.encode(),salt=salt,n=32768,r=8,p=1,dklen=64,maxmem=64*1024*1024)
    return 'scrypt$32768$8$1$'+salt.hex()+'$'+key.hex()

def env_read(path):
    result={}
    for line in path.read_text().splitlines():
        if line and not line.startswith('#'):
            key,sep,value=line.partition('=')
            if not sep or not re.fullmatch('[A-Z_0-9]+',key):raise RuntimeError('Unsupported protected environment format')
            result[key]=value
    return result

def env_write(path,values):
    if any('\n' in value or '\r' in value for value in values.values()):raise RuntimeError('Multiline environment value refused')
    protected(path,''.join(key+'='+value+'\n' for key,value in values.items()))

def inventory(project,limit_bytes=128*1024*1024):
    if not project.is_dir() or project.is_symlink():raise RuntimeError('P2 must be an existing ordinary project directory')
    result={}
    for path in sorted(project.rglob('*')):
        relative=path.relative_to(project)
        if any(p in {'.git','node_modules','.cache','.workbench-artifacts'} for p in relative.parts):continue
        if path.is_symlink():raise RuntimeError('P2 import refuses symlinks; originals remain untouched')
        if path.is_file():
            with path.open('rb') as stream:result[relative.as_posix()]={'bytes':path.stat().st_size,'sha256':hashlib.file_digest(stream,'sha256').hexdigest()}
        elif not path.is_dir():raise RuntimeError('Unsupported P2 entry')
    if not result:raise RuntimeError('P2 has no existing source files; refusing a substitute project')
    if limit_bytes is not None and sum(v['bytes'] for v in result.values())>limit_bytes:raise RuntimeError('P2 import exceeds configured size limit')
    return result

def inspect_container(service):
    result=subprocess.run(['docker','inspect','opencode-cloud-v0-'+service+'-1'],capture_output=True,text=True)
    if result.returncode:
        if 'no such object' in result.stderr.lower() or 'no such container' in result.stderr.lower():return None
        raise RuntimeError('Cannot inspect existing deployment')
    return json.loads(result.stdout)[0]

def assert_idle(require_stopped=False):
    for service in ['native','admin-native','engineer-b-native']:
        container=inspect_container(service)
        if not container or not container['State']['Running']:continue
        if require_stopped:raise RuntimeError('Cold setup requires stopped native services; found '+service+' running')
        script="fetch('http://127.0.0.1:4096/session/status?directory=/workspace/project',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('State unavailable');process.exit(Object.keys(await r.json()).length?2:0)}).catch(()=>process.exit(3))"
        result=subprocess.run(['docker','exec',container['Id'],'node','-e',script],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode:raise RuntimeError('Native task active or state unknown in '+service+'; no service stopped')

def check_owner(create=False):
    marker=INSTALL/'.workbench-development.json'
    if INSTALL.exists():
        if INSTALL.is_symlink() or not marker.is_file() or json.loads(marker.read_text())!=MARKER:raise RuntimeError('Unknown installation content: refusing overwrite')
    elif create:
        INSTALL.mkdir(mode=0o700);json_write(marker,MARKER)
    if INSTALL.exists() and (INSTALL.stat().st_uid!=os.getuid() or INSTALL.stat().st_mode&0o077):raise RuntimeError('Installation must belong to current maintainer with mode 0700')

def preflight(project):
    if os.getuid()!=1000:raise RuntimeError('Existing deployment is bound to maintainer UID 1000')
    check_owner()
    if not INSTALL.parent.is_dir() or not os.access(INSTALL.parent,os.W_OK):raise RuntimeError('Installation parent not writable')
    if shutil.disk_usage(INSTALL.parent).free<4*1024**3:raise RuntimeError('At least 4 GiB free space required')
    mount=json.loads(capture(['findmnt','-J','-T',INSTALL.parent,'-o','FSTYPE,PROPAGATION']))['filesystems'][0]
    if mount['fstype']!='ext4' or not mount['propagation'].startswith('shared'):raise RuntimeError('Requires ext4 with existing shared mount propagation; no host remount performed')
    for label in ['admin','native']:
        if not (OLD/'disks'/(label+'.img')).is_file():raise RuntimeError('Original quota image missing; initialization forbidden')
        for suffix in ['project','state']:
            original=OLD/(('admin-' if label=='admin' else '')+suffix)
            if not original.is_symlink() or original.resolve()!=OLD/'disks'/label/suffix:raise RuntimeError('Unexpected original data binding')
    for file in ['admin-gateway.env','admin-opencode.json','admin-browser.json','platform.json','admin-native.env']:
        if not (OLD/file).is_file():raise RuntimeError('Original controlled configuration missing')
    gateway=env_read(OLD/'admin-gateway.env')
    if gateway.get('QWEN_UPSTREAM','').rstrip('/')!='http://10.243.117.57:4003' or not gateway.get('QWEN_MASTER_KEY'):raise RuntimeError('Approved Qwen route missing; no replacement credential guessed')
    for image in [IMAGE,'opencode-cloud/native:1.18.31-browser-v1']:capture(['docker','image','inspect','--format','{{.Id}}',image])
    return inventory(project)

def verify_loop_identity(disk,source):
    # lo_file_name is relative to the setup helper's mount namespace. Verify
    # kernel device/inode instead (Linux UAPI loop_info64 / LOOP_GET_STATUS64).
    if not re.fullmatch(r'/dev/loop[0-9]+',source):raise RuntimeError('Quota mount is not a whole loop device')
    query="import os,fcntl,struct,json; fd=os.open('/dev/verified-loop',os.O_RDONLY); data=fcntl.ioctl(fd,0x4C05,bytes(232)); device,inode,unused,offset,limit=struct.unpack_from('=5Q',data); number=struct.unpack_from('=I',data,40)[0]; os.close(fd); print(json.dumps({'device':device,'inode':inode,'offset':offset,'sizelimit':limit,'number':number}))"
    identity=json.loads(capture(['docker','run','--rm','--user','0:0','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--device',source+':/dev/verified-loop:r','--entrypoint','python3',IMAGE,'-c',query]))
    expected=disk.stat()
    if identity['device']!=expected.st_dev or identity['inode']!=expected.st_ino or identity['offset']!=0 or identity['sizelimit']!=0 or identity['number']!=int(source.removeprefix('/dev/loop')):raise RuntimeError('Quota loop backing image does not match')
    return identity

def mount_disk(disk,dest):
    if not disk.is_file() or disk.is_symlink():raise RuntimeError('Existing ordinary image missing; never recreate it')
    dest.mkdir(exist_ok=True)
    if subprocess.run(['mountpoint','-q',dest]).returncode:
        if any(dest.iterdir()):raise RuntimeError('Unknown files in unmounted quota target; refusing to hide or overwrite them')
        script='set -eu; dev=$(losetup -f); test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; losetup "$dev" /disks/'+disk.name+'; trap \'losetup -d "$dev"\' EXIT; mount -o rw,nosuid,nodev "$dev" /disks/'+dest.name+'; trap - EXIT'
        run(['docker','run','--rm','--user','0:0','--network','none','--cap-drop','ALL','--cap-add','SYS_ADMIN','--cap-add','DAC_OVERRIDE','--cap-add','MKNOD','--device','/dev/loop-control','--device-cgroup-rule','b 7:* rwm','--security-opt','apparmor=unconfined','--mount',f'type=bind,src={disk.parent},dst=/disks,bind-propagation=rshared','--entrypoint','sh',IMAGE,'-c',script],stdout=subprocess.DEVNULL)
    data=json.loads(capture(['findmnt','-J','-T',dest,'-o','TARGET,SOURCE,FSTYPE,OPTIONS']))['filesystems'][0]
    if Path(data['target'])!=dest or data['fstype']!='ext4' or not {'rw','nosuid','nodev'}<=set(data['options'].split(',')):raise RuntimeError('Bounded mount verification failed')
    return dict(data,identity=verify_loop_identity(disk,data['source']))

def validate_resume_stage(project,files):
    # This recovery is deliberately limited to the mounted, empty new-disk
    # checkpoint. A partial imported project/config is retained for inspection.
    if not RUNTIME.is_dir() or set(p.name for p in RUNTIME.iterdir())-{'disks','.setup-state.json'}:raise RuntimeError('Unknown or later setup stage; retained for inspection')
    disks=RUNTIME/'disks';dest=disks/'engineer-b';disk=disks/'engineer-b.img'
    if not disks.is_dir() or set(p.name for p in disks.iterdir())!={'engineer-b','engineer-b.img'} or disk.stat().st_size!=1024**3:raise RuntimeError('Unexpected staged quota files; no initialization performed')
    if subprocess.run(['mountpoint','-q',dest]).returncode:raise RuntimeError('Staged quota disk is not mounted; explicit repair required')
    mount_disk(disk,dest)
    if set(p.name for p in dest.iterdir())!={'lost+found'}:raise RuntimeError('Staged project data exists; refusing overwrite')
    query="import os; print(len(os.listdir('/staging/lost+found')))"
    count=capture(['docker','run','--rm','--user','0:0','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',f'type=bind,src={dest},dst=/staging,readonly','--entrypoint','python3',IMAGE,'-c',query])
    if count!='0':raise RuntimeError('Recovered files exist on staged disk; refusing overwrite')
    authorization=json.loads((INSTALL/'p2-authorization.json').read_text())
    if authorization['projectSource']!=str(project) or authorization['sourceFiles']!=files:raise RuntimeError('P2 source differs from authorized setup checkpoint')
    for label in ['admin','native']:
        if subprocess.run(['mountpoint','-q',OLD/'disks'/label]).returncode==0:raise RuntimeError('Original disk mounted; no cold-stage recovery performed')
    candidates=list((INSTALL/'backups').glob('*/manifest.json'))
    if len(candidates)!=1:raise RuntimeError('Ambiguous cold backup; explicit selection required')
    backup=candidates[0].parent;manifest=json.loads(candidates[0].read_text());archive=backup/'original-runtime.tar.gz'
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=manifest['sha256']:raise RuntimeError('Cold backup SHA-256 mismatch')
    with tarfile.open(archive) as stored:
        if not {'runtime/disks/admin.img','runtime/disks/native.img','runtime/platform.json'}<=set(stored.getnames()):raise RuntimeError('Cold backup incomplete')
    for label in ['admin','native']:
        with (OLD/'disks'/(label+'.img')).open('rb') as stream:
            if hashlib.file_digest(stream,'sha256').hexdigest()!=manifest['nativeImages'][label]:raise RuntimeError('Original disk changed since cold backup')
    for name in ['src','public']:
        if inventory(RELEASE/name,limit_bytes=None)!=inventory(CLOUD/name,limit_bytes=None):raise RuntimeError('Staged release differs from verified source/artifacts')
    state_file=RUNTIME/'.setup-state.json';state=json.loads(state_file.read_text()) if state_file.exists() else {}
    if state and (state.get('projectSource')!=str(project) or state.get('backup')!=str(backup) or not re.fullmatch(r'scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}',state.get('passwordHash',''))):raise RuntimeError('Invalid protected setup state')
    return {'backup':str(backup),'passwordHash':state.get('passwordHash')}

def cold_backup():
    assert_idle(require_stopped=True)
    for label in ['admin','native']:
        if subprocess.run(['mountpoint','-q',OLD/'disks'/label]).returncode==0:raise RuntimeError('Original image mounted; use an explicit cold-backup window before setup')
    directory=INSTALL/'backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    directory.mkdir(parents=True,mode=0o700)
    archive=directory/'original-runtime.tar.gz'
    fd=os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as output:
        run(['tar','-czf','-','--',OLD.name],cwd=OLD.parent,stdout=output)
    digest=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
    with tarfile.open(archive) as backup:
        names=set(backup.getnames())
        if not {'runtime/disks/admin.img','runtime/disks/native.img','runtime/platform.json'}<=names:raise RuntimeError('Cold backup incomplete')
    json_write(directory/'manifest.json',{'sha256':digest,'bytes':archive.stat().st_size,'scope':'private original runtime; never commit','nativeImages':{label:hashlib.file_digest((OLD/'disks'/(label+'.img')).open('rb'),'sha256').hexdigest() for label in ['admin','native']}})
    return str(directory)

def compose_file():
    native_env={key:'http://engineer-b-web-egress:8320' for key in ['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy']}
    native_env.update(ALL_PROXY='',all_proxy='',NO_PROXY='localhost,127.0.0.1,::1,engineer-b-model-gateway',no_proxy='localhost,127.0.0.1,::1,engineer-b-model-gateway')
    mounts=[str(RUNTIME/'disks/engineer-b/project')+':/workspace/project',str(RUNTIME/'disks/engineer-b/state')+':/state',str(RUNTIME/'engineer-b-opencode.json')+':/trusted/opencode.json:ro',str(RUNTIME/'engineer-b-browser.json')+':/trusted/browser.json:ro']+[str(CLOUD/'browser-tools'/name)+':/trusted/'+name+':ro' for name in ['vite.config.mjs','start-preview.sh','BROWSER_USAGE.md']]
    services={
      'engineer-b-model-gateway':{'extends':{'service':'model-gateway'},'env_file':['OVERRIDE',str(RUNTIME/'engineer-b-gateway.env')],'volumes':['OVERRIDE',str(CLOUD/'src/model-gateway.ts')+':/app/model-gateway.ts:ro',str(RUNTIME/'engineer-b-gateway-state')+':/gateway-state'],'networks':['OVERRIDE','native-engineer-b','model-egress']},
      'engineer-b-web-egress':{'extends':{'service':'web-egress'},'environment':{'EGRESS_MODE':'direct-public'},'networks':['OVERRIDE','native-engineer-b','model-egress']},
      'engineer-b-native':{'extends':{'service':'native'},'env_file':['OVERRIDE',str(RUNTIME/'engineer-b-native.env')],'environment':native_env,'volumes':['OVERRIDE']+mounts,'networks':['OVERRIDE','native-engineer-b'],'depends_on':{'engineer-b-model-gateway':{'condition':'service_healthy'},'engineer-b-web-egress':{'condition':'service_healthy'}}},
      'engineer-b-native-firewall':{'extends':{'service':'native-firewall'},'network_mode':'service:engineer-b-native','depends_on':['OVERRIDE','engineer-b-native']},
      'engineer-b-native-guard':{'extends':{'service':'native-guard'},'network_mode':'service:engineer-b-native','env_file':['OVERRIDE',str(RUNTIME/'engineer-b-native.env')],'volumes':['OVERRIDE',str(CLOUD/'src')+':/app:ro',str(RUNTIME/'disks/engineer-b/project')+':/workspace/project:ro'],'depends_on':{'engineer-b-native-firewall':{'condition':'service_completed_successfully'}}},
      'platform':{'environment':{'WORKBENCH_AUTH_PROFILE':'development'},'ports':['OVERRIDE','127.0.0.1:8443:8443'],'networks':['frontend','native','native-admin','native-engineer-b'],'volumes':[str(RELEASE/'src')+':/app:ro',str(RELEASE/'public')+':/public:ro',str(RUNTIME/'platform.json')+':/trusted/platform.json:ro',str(RUNTIME/'tls.key')+':/trusted/tls.key:ro',str(RUNTIME/'tls.crt')+':/trusted/tls.crt:ro'],'depends_on':{'engineer-b-native-guard':{'condition':'service_healthy'}}}}
    for service in services.values():
        if 'extends' in service:service['extends']['file']=str(CLOUD/'compose.yaml')
    # JSON scalar quoting is valid YAML, and !override avoids inheriting old envs,
    # network attachments or namespace dependencies into the new engineer.
    def yaml(value,indent=0):
        if isinstance(value,dict):return '\n'.join(' '*indent+json.dumps(k)+':'+(('\n'+yaml(v,indent+2)) if isinstance(v,dict) else ' '+yaml(v)) for k,v in value.items())
        if isinstance(value,list) and value and value[0]=='OVERRIDE':return '!override '+json.dumps(value[1:])
        return json.dumps(value)
    # Mapping merges for depends_on/environment retain originals unless explicitly
    # overridden; new native must depend only on its own gateways/firewall.
    text=yaml({'services':services,'networks':{'native-engineer-b':{'internal':True}}})+'\n'
    # Convert the three namespace-specific mappings to YAML !override mappings.
    for service,key in [('engineer-b-native','environment'),('engineer-b-native','depends_on'),('engineer-b-native-guard','depends_on')]:
        section=text.index('  '+json.dumps(service)+':\n');offset=text.index('    '+json.dumps(key)+':\n',section)
        text=text[:offset]+text[offset:].replace('    '+json.dumps(key)+':\n','    '+json.dumps(key)+': !override\n',1)
    return text

def setup(project,check=False,resume=False):
    files=preflight(project)
    if check:
        print(json.dumps({'scope':'read-only preflight','project':str(project),'files':files,'installation':str(INSTALL),'readyConfiguration':(RUNTIME/'deployment.json').is_file()},ensure_ascii=False,indent=2));return
    if (RUNTIME/'deployment.json').is_file():
        manifest=json.loads((RUNTIME/'deployment.json').read_text())
        if manifest['projectSource']!=str(project):raise RuntimeError('Existing P2 binding differs; refusing reinitialization')
        print('Existing developer profile retained; password, files, sessions and counters not reset.');return
    if RUNTIME.exists() and not resume:raise RuntimeError('Incomplete setup retained. Use dev setup --resume for the verified empty-disk checkpoint; other stages require inspection')
    build_file=CLOUD/'evidence/increment-v1-dev-build.json'
    if not build_file.is_file():raise RuntimeError('Verified development UI build missing')
    build=json.loads(build_file.read_text())
    for name,digest in build['overlaySha256'].items():
        if hashlib.sha256((CLOUD/'ui'/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('UI source differs from verified build; rebuild before setup')
    for name,digest in build['files'].items():
        if hashlib.sha256((CLOUD/'public/workbench-ui'/name.lstrip('/')).read_bytes()).hexdigest()!=digest:raise RuntimeError('UI artifact digest mismatch')
    assert_idle(require_stopped=True)
    previous=validate_resume_stage(project,files) if resume else {}
    hashed=previous.get('passwordHash')
    if not hashed:
        if not sys.stdin.isatty():raise RuntimeError('Run dev setup in your terminal to enter engineer-b password privately; do not paste it into chat')
        password=getpass.getpass('设置 engineer-b 密码（隐藏输入，不复用企业或 SSH 密码）：')
        if len(password)<12 or password!=getpass.getpass('再次输入确认：'):raise RuntimeError('Password must be at least 12 characters and confirmations must match')
        hashed=password_hash(password);del password
    check_owner(create=True)
    if resume:
        backup=previous['backup'];disks=RUNTIME/'disks'
    else:
        backup=cold_backup()
        RELEASE.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        RELEASE.mkdir(mode=0o700)
        shutil.copytree(CLOUD/'src',RELEASE/'src');shutil.copytree(CLOUD/'public',RELEASE/'public')
        shutil.copyfile(build_file,RELEASE/'ui-build.json');shutil.copyfile(CLOUD/'ui/upstream.patch',RELEASE/'upstream.patch')
        RUNTIME.mkdir(mode=0o700);disks=RUNTIME/'disks';disks.mkdir(mode=0o700)
    if not (RUNTIME/'.setup-state.json').exists():json_write(RUNTIME/'.setup-state.json',{'projectSource':str(project),'backup':backup,'passwordHash':hashed})
    disk=disks/'engineer-b.img'
    if not resume:
        run(['fallocate','-l','1G',disk]);run(['mkfs.ext4','-q','-F',disk])
    mount_disk(disk,disks/'engineer-b')
    target=disks/'engineer-b/project';state=disks/'engineer-b/state'
    # Mount root is root-owned; ownership changes apply ONLY to this new disk.
    run(['docker','run','--rm','--network','none','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--mount',f'type=bind,src={disks / "engineer-b"},dst=/new','--entrypoint','sh',IMAGE,'-c','mkdir /new/project /new/state; chown 1000:1000 /new/project /new/state'],stdout=subprocess.DEVNULL)
    for relative in files:
        destination=target/relative;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(project/relative,destination)
    if inventory(project)!=files or inventory(target)!=files:raise RuntimeError('P2 changed during import; staging retained, no original files modified')
    git_env={key:value for key,value in os.environ.items() if not key.startswith('GIT_')}
    git_env.update(GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_SYSTEM='/dev/null',GIT_CONFIG_GLOBAL='/dev/null',GIT_CONFIG_COUNT='1',GIT_CONFIG_KEY_0='core.hooksPath',GIT_CONFIG_VALUE_0='/dev/null')
    for args in [['init','--quiet','--template='],['config','user.name','WorkBench P2 Baseline'],['config','user.email','local@workbench.invalid'],['add','--force','--','.'],['commit','--quiet','-m','Authorized P2 initial snapshot']]:run(['git']+args,cwd=target,env=git_env,stdout=subprocess.DEVNULL)
    baseline=capture(['git','-C',target,'rev-parse','HEAD'],env=git_env);nativepw=secrets.token_urlsafe(32);scope=secrets.token_urlsafe(32)
    env_write(RUNTIME/'engineer-b-native.env',{'OPENCODE_SERVER_PASSWORD':nativepw,'ENV_MODEL_TOKEN':scope,'PROJECT_BASELINE':baseline,'OPENCODE_CLIENT':'app'})
    gateway=env_read(OLD/'admin-gateway.env');gateway.update(ENV_MODEL_TOKEN=scope,MODEL_ROUTE_MODE='qwen-only',MODEL_DAILY_REQUEST_LIMIT='100000')
    env_write(RUNTIME/'engineer-b-gateway.env',gateway);(RUNTIME/'engineer-b-gateway-state').mkdir(mode=0o700)
    config=json.loads((OLD/'admin-opencode.json').read_text());config['model']=config['small_model']='approved/Qwen3.6-35B-A3B'
    config['provider']['approved']['options'].update(baseURL='http://engineer-b-model-gateway:8318/v1',apiKey=scope)
    json_write(RUNTIME/'engineer-b-opencode.json',config)
    browser=json.loads((OLD/'admin-browser.json').read_text());browser.setdefault('browser',{}).setdefault('proxy',{})['server']='http://engineer-b-web-egress:8320'
    json_write(RUNTIME/'engineer-b-browser.json',browser)
    platform=json.loads((OLD/'platform.json').read_text());development_auth={'mode':'development'}
    if platform.get('auth',{}).get('baseUrl'):development_auth['baseUrl']=platform['auth']['baseUrl']
    platform.update(origin='https://127.0.0.1:8443',auth=development_auth)
    platform.pop('publicOrigins',None);platform.pop('cookieNames',None)
    for name,user in platform['users'].items():
        if not user.get('authProvider'):
            original_password=user.pop('password',None)
            if not original_password:raise RuntimeError('Cannot preserve original local credentials')
            user.update(authProvider='local-admin' if name=='admin' else 'local-engineer',role='admin' if name=='admin' else 'engineer',passwordHash=password_hash(original_password));del original_password
    platform['users']['engineer-b']={'authProvider':'local-engineer','role':'engineer','passwordHash':hashed,'displayName':'工程师 B','projectName':project.name,'enabled':True,'environment':'http://engineer-b-native:4096','nativePassword':nativepw}
    if not platform.get('previewRelayKey'):raise RuntimeError('Original protected preview relay key missing')
    json_write(RUNTIME/'platform.json',platform)
    run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','90','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',RUNTIME/'tls.key','-out',RUNTIME/'tls.crt'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);(RUNTIME/'tls.key').chmod(0o600)
    protected(RUNTIME/'compose.dev.yaml',compose_file())
    # Parse and resolve without printing the controlled credentials from config.
    run(compose()+['config','--quiet'],stdout=subprocess.DEVNULL)
    validation="import {readFileSync} from 'node:fs';import {validateAccount,authenticationProfile} from '/app/identity-auth.ts';const c=JSON.parse(readFileSync('/trusted/platform.json'));const p=authenticationProfile(c,'development');for(const [name,user] of Object.entries(c.users))validateAccount(name,user,p);"
    run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',f'type=bind,src={RELEASE / "src"},dst=/app,readonly','--mount',f'type=bind,src={RUNTIME / "platform.json"},dst=/trusted/platform.json,readonly','--entrypoint','node',IMAGE,'--experimental-transform-types','--input-type=module','-e',validation],stdout=subprocess.DEVNULL)
    json_write(RUNTIME/'deployment.json',{'kind':MARKER['kind'],'projectSource':str(project),'projectName':project.name,'baseline':baseline,'sourceFiles':files,'backup':backup,'release':str(RELEASE),'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalConfigSha256':hashlib.sha256((OLD/'platform.json').read_bytes()).hexdigest()})
    (RUNTIME/'.setup-state.json').unlink(missing_ok=True)
    print('Developer profile ready; original data/config unchanged. Run ./workbench.sh dev start')

def compose():return ['docker','compose','--project-directory',str(CLOUD),'-f',str(CLOUD/'compose.yaml'),'-f',str(RUNTIME/'compose.dev.yaml')]

def configured():
    check_owner()
    if not (RUNTIME/'deployment.json').is_file():raise RuntimeError('Developer setup not complete; run ./workbench.sh dev setup in your terminal')

def replace_protected(path,content):
    temporary=path.with_name(path.name+'.reset-'+secrets.token_hex(8))
    try:
        protected(temporary,content)
        with temporary.open('rb') as stream:os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:temporary.unlink(missing_ok=True)

def entry_healthy():
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(10):
        try:
            with opener.open('http://127.0.0.1:8444/__platform/login',timeout=2) as response:
                if response.status==200 and b'id="login"' in response.read(65536):return
        except OSError:pass
        time.sleep(.5)
    raise RuntimeError('Local platform entry not healthy')

def reset_admin_password():
    configured()
    if not sys.stdin.isatty():raise RuntimeError('Run reset-admin-password in your own terminal for hidden password input')
    lock=RUNTIME/'.admin-password-reset.lock'
    fd=os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as held:
        try:fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Another administrator password reset is running')
        config_file=RUNTIME/'platform.json';session_file=OLD/'platform-state/sessions.json'
        for path in [config_file,session_file]:
            if path.is_symlink() or not path.is_file() or path.stat().st_uid!=os.getuid():raise RuntimeError('Unknown authentication file ownership; retained unchanged')
        checked_config=config_file.read_text();cfg=json.loads(checked_config);admin=cfg.get('users',{}).get('admin',{})
        if cfg.get('auth',{}).get('mode')!='development' or admin.get('authProvider')!='local-admin' or admin.get('role')!='admin':raise RuntimeError('Reset is only supported for the installed local development administrator')
        platform=inspect_container('platform')
        if not platform or not platform['State']['Running']:raise RuntimeError('Start the development platform before resetting the password')
        labels=platform['Config'].get('Labels',{});mounts={m['Destination']:m['Source'] for m in platform['Mounts']}
        if labels.get('com.docker.compose.project')!='opencode-cloud-v0' or labels.get('com.docker.compose.service')!='platform' or mounts.get('/trusted/platform.json')!=str(config_file) or mounts.get('/platform-state')!=str(session_file.parent):raise RuntimeError('Platform does not belong to this development profile; no service stopped')
        assert_idle();entry_healthy()
        password=getpass.getpass('设置新的 admin 密码（隐藏输入，至少12个字符）：')
        confirmation=getpass.getpass('再次输入确认：')
        if not 12<=len(password)<=1024 or password!=confirmation:raise RuntimeError('Password must contain 12–1024 characters and confirmations must match')
        hashed=password_hash(password);del password,confirmation
        assert_idle()
        if config_file.read_text()!=checked_config:raise RuntimeError('Authentication configuration changed during password input; retry without overwriting it')
        # Stop only the platform so its in-memory session store cannot overwrite
        # revocation. Native services, projects and budgets remain untouched.
        original_config=config_file.read_text();original_sessions=None;stopped=False
        backup=INSTALL/'backups'/('admin-password-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        try:
            run(['docker','stop','--time','10',platform['Id']],stdout=subprocess.DEVNULL);stopped=True
            assert_idle()
            original_sessions=session_file.read_text();sessions=json.loads(original_sessions)
            if not isinstance(sessions,dict) or any(not isinstance(s,dict) or not isinstance(s.get('user'),str) for s in sessions.values()):raise RuntimeError('Unknown session format; authentication retained')
            backup.mkdir(parents=True,mode=0o700)
            protected(backup/'platform.json',original_config);protected(backup/'sessions.json',original_sessions)
            admin['passwordHash']=hashed;admin.pop('password',None)
            replace_protected(config_file,json.dumps(cfg,indent=2,ensure_ascii=False)+'\n')
            replace_protected(session_file,json.dumps({k:s for k,s in sessions.items() if s['user']!='admin'})+'\n')
            run(['docker','start',platform['Id']],stdout=subprocess.DEVNULL)
            mounted_digest=capture(['docker','exec',platform['Id'],'node','-e',"const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('/trusted/platform.json')).digest('hex'))"])
            if mounted_digest!=hashlib.sha256(config_file.read_bytes()).hexdigest():raise RuntimeError('Platform did not load the updated authentication configuration')
            entry_healthy()
        except BaseException:
            if stopped:
                run(['docker','stop','--time','10',platform['Id']],stdout=subprocess.DEVNULL)
                replace_protected(config_file,original_config)
                if original_sessions is not None:replace_protected(session_file,original_sessions)
                run(['docker','start',platform['Id']],stdout=subprocess.DEVNULL)
            raise
        print('管理员密码已重置。请用 admin 和新密码重新登录；工程师密码、项目、原生会话与计数未修改。')
        print('受保护的认证备份：'+str(backup))

def owned_relay(label):
    record=RUNTIME/(label+'-process.json')
    try:
        data=json.loads(record.read_text());pid=data['pid'];proc=Path('/proc')/str(pid)
        start=proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]
        argv=proc.joinpath('cmdline').read_bytes().split(b'\0');entry=CLOUD/'src'/(label+'.mjs')
        return pid if start==data['starttime'] and str(entry).encode() in argv else None
    except (OSError,KeyError,ValueError):return None

def relay(label,port):
    if owned_relay(label):return
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1',port))==0:raise RuntimeError('Port '+str(port)+' occupied; no listener replaced. Stop the old owned relay explicitly first.')
    env=dict(os.environ,WORKBENCH_LOCAL_RUNTIME=str(RUNTIME))
    log=RUNTIME/(label+'.log');fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
    with os.fdopen(fd,'ab') as output:
        child=subprocess.Popen(['node',str(CLOUD/'src'/(label+'.mjs'))],stdin=subprocess.DEVNULL,stdout=output,stderr=output,env=env,start_new_session=True)
    time.sleep(.2)
    if child.poll() is not None:raise RuntimeError('Owned relay failed; inspect protected '+log.name)
    record=RUNTIME/(label+'-process.json');record.unlink(missing_ok=True)
    json_write(record,{'pid':child.pid,'starttime':Path('/proc',str(child.pid),'stat').read_text().rsplit(')',1)[1].split()[19]})

def start():
    configured();assert_idle()
    for label in ['admin','native']:mount_disk(OLD/'disks'/(label+'.img'),OLD/'disks'/label)
    mount_disk(RUNTIME/'disks/engineer-b.img',RUNTIME/'disks/engineer-b')
    # Preserve existing native/container settings; only platform needs the profile
    # override. Existing data and original service names are retained.
    run(compose()+['up','-d','--no-recreate']+[s for s in SERVICES if s!='platform' and not s.endswith('-guard') and not s.endswith('-firewall')])
    # A previous completed firewall helper is not proof that rules survived a
    # namespace restart. Reapply to the current namespace before starting guards.
    for service in ['native-firewall','admin-native-firewall','engineer-b-native-firewall']:
        run(compose()+['run','--rm','--no-deps',service])
    run(compose()+['up','-d','--no-recreate','native-guard','admin-native-guard','engineer-b-native-guard'])
    run(compose()+['up','-d','--no-deps','platform'])
    relay('local-browser',8444);relay('local-preview',8445)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(10):
        try:
            with opener.open('http://127.0.0.1:8444/__platform/login',timeout=2) as response:
                if response.status==200 and b'id="login"' in response.read(65536):break
        except OSError:pass
        time.sleep(.5)
    else:raise RuntimeError('Verified local platform entry not healthy; no native request retried. Inspect protected relay log and platform container status')
    print('WorkBench: http://127.0.0.1:8444/ ; choose the local engineer login link. No browser root certificate needed.')

def stop():
    configured();assert_idle()
    for label in ['local-browser','local-preview']:
        pid=owned_relay(label)
        if pid:os.kill(pid,signal.SIGTERM)
        (RUNTIME/(label+'-process.json')).unlink(missing_ok=True)
    run(compose()+['stop']+SERVICES)
    print('Stopped without deleting disks, files, credentials, sessions or counters.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['setup','start','status','stop','reset-admin-password']);parser.add_argument('--project',default='/home/vmware/Workspace/projects/learn');parser.add_argument('--check',action='store_true');parser.add_argument('--resume',action='store_true');args=parser.parse_args()
    if args.check and args.action!='setup':raise RuntimeError('--check is only supported for read-only setup preflight')
    if args.resume and args.action!='setup':raise RuntimeError('--resume is only supported for setup recovery')
    if args.action=='setup':setup(Path(args.project).resolve(),args.check,args.resume)
    elif args.action=='start':start()
    elif args.action=='stop':stop()
    elif args.action=='reset-admin-password':reset_admin_password()
    else:
        configured();run(compose()+['ps']);print('Owned relays:',{label:bool(owned_relay(label)) for label in ['local-browser','local-preview']})

if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,ValueError,subprocess.CalledProcessError) as error:
        # Do not print subprocess arguments/config content: they can carry secrets.
        print('Developer operation stopped: '+(str(error) if isinstance(error,RuntimeError) else type(error).__name__),file=sys.stderr);sys.exit(1)
