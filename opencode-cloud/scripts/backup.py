#!/usr/bin/env python3
"""Idle consistent cold backup. Never delete volumes or restore over live data."""
import subprocess,os,json,tarfile,hashlib,sys
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1];os.chdir(root)
if len(sys.argv)!=2:raise SystemExit('Usage: python3 scripts/backup.py NEW_ARCHIVE_PATH')
output=Path(sys.argv[1]).resolve()
if output.exists():raise SystemExit('Refusing to overwrite archive')
for service in ['native-guard','admin-native-guard']:
 code="fetch('http://localhost:4096/session/status',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')}}).then(async r=>{if(!r.ok||Object.keys(await r.json()).length)process.exit(1)}).catch(()=>process.exit(1))"
 subprocess.run(['docker','compose','exec','-T',service,'node','-e',code],check=True)
# Stop admissions first, then normal stop of native servers flushes their databases.
subprocess.run(['docker','compose','stop','platform','native-guard','admin-native-guard','native','admin-native'],check=True)
os.umask(0o077);output.parent.mkdir(parents=True,exist_ok=True)
try:
 with tarfile.open(output,'w:gz') as tar:
  for name in ['project','state','admin-project','admin-state','platform-state','gateway.env','native.env','opencode.json','admin-gateway.env','admin-native.env','admin-opencode.json','platform.json','tls.key','tls.crt','ADMIN_LOGIN.txt','TRIAL_B_LOGIN.txt','gateway-state','admin-gateway-state']:
   p=root/'runtime'/name
   if not p.exists():raise RuntimeError('Missing backup input '+name)
   tar.add(p.resolve(),arcname=name,recursive=True)
 digest=hashlib.file_digest(output.open('rb'),'sha256').hexdigest();output.with_suffix(output.suffix+'.sha256').write_text(digest+'\n')
 print(json.dumps({'archive':str(output),'sha256':digest,'date':datetime.now(timezone.utc).isoformat(),'kind':'idle_cold_backup_includes_protected_credentials'}))
finally:
 subprocess.run(['docker','compose','--profile','model-repair','up','-d','--no-build','--force-recreate'],check=True)
