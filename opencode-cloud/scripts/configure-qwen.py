#!/usr/bin/env python3
"""Maintain the one newly approved Qwen route; never initialize/reset projects."""
from pathlib import Path
import argparse, json, os, stat, shutil, datetime
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--key-file',required=True);a=p.parse_args()
keyfile=Path(a.key_file).resolve()
if stat.S_IMODE(keyfile.stat().st_mode)&0o077:p.error('Owner-only key file required')
key=keyfile.read_text().strip()
if not key or '\n' in key or '\r' in key:p.error('One-line credential required')
os.umask(0o077)
backup=root/'runtime/backups'/('pre-qwen-config-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True,mode=0o700)
for prefix in ['','admin-']:
    envfile=root/'runtime'/(prefix+'gateway.env');configfile=root/'runtime'/(prefix+'opencode.json')
    env=envfile.read_text();config=json.loads(configfile.read_text())
    assert config['enabled_providers']==['approved']
    assert 'MODEL_MASTER_KEY=' in env and 'ENV_MODEL_TOKEN=' in env
    for f in [envfile,configfile]:shutil.copyfile(f,backup/f.name);(backup/f.name).chmod(0o600)
    lines=[line for line in env.splitlines() if not line.startswith(('QWEN_UPSTREAM=','QWEN_MASTER_KEY='))]
    lines+=['QWEN_UPSTREAM=http://10.243.117.57:4003','QWEN_MASTER_KEY='+key]
    envfile.write_text('\n'.join(lines)+'\n');envfile.chmod(0o600)
    provider=config['provider']['approved'];provider['name']='Approved Qwen / Luna'
    provider['models']['Qwen3.6-35B-A3B']={'name':'Qwen3.6-35B-A3B','limit':{'context':131072,'output':16000},'modalities':{'input':['text','image'],'output':['text']},'tool_call':True,'reasoning':True}
    config['model']=config['small_model']='approved/Qwen3.6-35B-A3B'
    # Overwrite the existing inode so the readonly single-file bind sees the
    # new administrator configuration. Native data and per-user token unchanged.
    configfile.write_text(json.dumps(config,indent=2)+'\n');configfile.chmod(0o600)
print('Added fixed approved Qwen route/default; protected previous config:',backup.relative_to(root))
