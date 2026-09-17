#!/usr/bin/env python3
"""Scan publishable files for ACTUAL protected credential values; print paths only."""
from pathlib import Path
import subprocess,json,base64
root=Path(__file__).resolve().parents[2];r=root/'opencode-cloud';files=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=root).decode().split('\0');values=[]
for p in (r/'runtime').glob('*.env'):
 for line in p.read_text().splitlines():
  if '=' in line:
   k,v=line.split('=',1)
   if any(x in k for x in ['PASSWORD','KEY','TOKEN']) and v:values.append(v)
c=json.loads((r/'runtime/platform.json').read_text())
for v in c['users'].values():values += [v['password'],v['nativePassword'],base64.b64encode(('opencode:'+v['nativePassword']).encode()).decode()]
hits=[]
for name in set(files):
 p=root/name
 if name and p.is_file() and any(s.encode() in p.read_bytes() for s in values):hits.append(name)
report={'status':'FAIL' if hits else 'PASS','filesChecked':len(set(files)),'actualCredentialValueMatches':len(hits),'affectedPaths':hits}
(r/'evidence/secret-scan-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));raise SystemExit(1 if hits else 0)
