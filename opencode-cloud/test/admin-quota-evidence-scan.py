# Scan new public artifacts against actual protected credentials without displaying them.
from pathlib import Path
import json,zipfile,io
root=Path('.');cfg=json.loads((root/'runtime/platform.json').read_text());secrets={u['password'] for u in cfg['users'].values() if u.get('password')};secrets.add(cfg.get('previewRelayKey',''))
for name in ['admin-gateway.env','gateway.env','admin-native.env','native.env']:
 for line in (root/'runtime'/name).read_text().splitlines():
  key,sep,value=line.partition('=')
  if sep and any(x in key for x in ['KEY','TOKEN','PASSWORD']):secrets.add(value)
secrets={x.encode() for x in secrets if len(x)>=8};hits=[];scanned=0
for pattern in ['admin-quota*','delivery-admin-quota*']:
 for p in (root/'evidence').glob(pattern):
  if not p.is_file():continue
  payloads=[p.read_bytes()]
  if p.suffix=='.zip':
   with zipfile.ZipFile(io.BytesIO(payloads[0])) as z:payloads += [z.read(n) for n in z.namelist() if not n.endswith('/')]
  scanned+=1
  if any(s in data for s in secrets for data in payloads):hits.append(str(p))
result={'status':'PASS' if not hits else 'FAIL','filesScanned':scanned,'credentialHits':hits,'secretValuesPrinted':False};(root/'evidence/admin-quota-evidence-scan.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(bool(hits))
