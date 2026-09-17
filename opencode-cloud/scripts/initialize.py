#!/usr/bin/env python3
"""Prepare ONLY a new empty trial deployment. Never reset existing work."""
from pathlib import Path
import argparse,json,os,secrets,subprocess,re,stat
from urllib.parse import urlparse
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--baseline',required=True);p.add_argument('--origin',required=True);p.add_argument('--model-key-file',required=True);a=p.parse_args()
runtime=root/'runtime'
if runtime.exists() and any(runtime.iterdir()):raise SystemExit('Refusing initialization: runtime is not empty. Existing files remain untouched.')
project=Path(a.project).resolve();keyfile=Path(a.model_key_file).resolve();u=urlparse(a.origin)
if not re.fullmatch('[0-9a-f]{40}',a.baseline):p.error('Full fixed baseline commit required')
if u.scheme!='https' or u.path not in ('','/') or u.username or u.query or u.fragment:p.error('One HTTPS origin required')
if stat.S_IMODE(keyfile.stat().st_mode)&0o077:p.error('Model key file must be owner-only')
key=keyfile.read_text().strip()
if not key or '\n' in key:p.error('One-line model credential required')
subprocess.run(['git','-C',str(project),'cat-file','-e',a.baseline+'^{commit}'],check=True)
runtime=root/'runtime'
if runtime.exists() and any(runtime.iterdir()):raise SystemExit('Refusing initialization: runtime is not empty. Existing files remain untouched.')
os.umask(0o077);runtime.mkdir(exist_ok=True)
def protected(name,text):
 f=runtime/name;f.write_text(text);f.chmod(0o600)
users={}
for name,prefix,folder,native,gateway in [('admin','admin-','admin-project','admin-native','admin-model-gateway'),('trial-b','','project','native','model-gateway')]:
 clone=runtime/folder;subprocess.run(['git','clone','--no-hardlinks','--no-checkout',str(project),str(clone)],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['git','-C',str(clone),'checkout','--detach',a.baseline],check=True,stdout=subprocess.DEVNULL);subprocess.run(['git','-C',str(clone),'remote','remove','origin'],check=True)
 exclude=clone/'.git/info/exclude'
 exclude.write_text(exclude.read_text()+'\n# WorkBench generated dependencies, build output and browser evidence\n/web/node_modules/\n/web/dist/\n/web/.vite/\n/.workbench-artifacts/\n')
 for f in [clone,*clone.rglob('*')]:
  if not f.is_symlink():f.chmod(0o755 if f.is_dir() else stat.S_IMODE(f.stat().st_mode)|0o044)
 scope=secrets.token_urlsafe(32);nativepw=secrets.token_urlsafe(32);password=secrets.token_urlsafe(24)
 (runtime/(prefix+'gateway-state')).mkdir(mode=0o700)
 daily_limit=100000 if name=='admin' else 250
 protected(prefix+'gateway.env',f'MODEL_UPSTREAM=http://192.168.142.130:8317\nMODEL_MASTER_KEY={key}\nENV_MODEL_TOKEN={scope}\nMODEL_DAILY_REQUEST_LIMIT={daily_limit}\n')
 protected(prefix+'native.env',f'OPENCODE_SERVER_PASSWORD={nativepw}\nENV_MODEL_TOKEN={scope}\nPROJECT_BASELINE={a.baseline}\nOPENCODE_CLIENT=app\n')
 c={'$schema':'https://opencode.ai/config.json','model':'approved/gpt-5.6-luna','small_model':'approved/gpt-5.6-luna','enabled_providers':['approved'],'autoupdate':False,'share':'disabled','provider':{'approved':{'npm':'@ai-sdk/openai-compatible','name':'Approved Luna','options':{'baseURL':f'http://{gateway}:8318/v1','apiKey':scope},'models':{'gpt-5.6-luna':{'name':'Luna','limit':{'context':196000,'output':16000}}}}},'permission':{'*':'allow','external_directory':'deny'}}
 protected(prefix+'opencode.json',json.dumps(c,indent=2)+'\n');(runtime/(prefix+'state')).mkdir(mode=0o700)
 protected('ADMIN_LOGIN.txt' if name=='admin' else 'TRIAL_B_LOGIN.txt',f'URL: {a.origin}\nUsername: {name}\nPassword: {password}\n')
 users[name]={'password':password,'displayName':name,'enabled':True,'environment':f'http://{native}:4096','nativePassword':nativepw}
protected('platform.json',json.dumps({'origin':a.origin.rstrip('/'),'sessionTtl':3600,'users':users},indent=2)+'\n');(runtime/'platform-state').mkdir(mode=0o700)
san=('IP:' if re.fullmatch('[0-9.]+',u.hostname or '') else 'DNS:')+u.hostname
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout',str(runtime/'tls.key'),'-out',str(runtime/'tls.crt'),'-subj','/CN='+u.hostname,'-addext','subjectAltName='+san],check=True,stderr=subprocess.DEVNULL)
(runtime/'tls.key').chmod(0o600)
print('New trial prepared; credentials in protected runtime files. No existing deployment modified.')
