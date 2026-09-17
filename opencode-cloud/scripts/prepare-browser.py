#!/usr/bin/env python3
"""Only prepare new controlled browser/relay configuration. Never initialize projects."""
import json,secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1];runtime=root/'runtime'
for prefix,gateway in [('', 'web-egress'),('admin-', 'admin-web-egress')]:
 state=runtime/(prefix+'state')
 if not (state.is_dir() and (runtime/(prefix+'project')/'.git').is_dir()):raise SystemExit('Original persistent project/state missing; refusing initialization')
 for name in ['browser-home','browser-config','browser-cache']:(state/name).mkdir(exist_ok=True)
 data={'browser':{'browserName':'chromium','isolated':True,'launchOptions':{'channel':'chromium','headless':True,'chromiumSandbox':False,'args':['--proxy-bypass-list=<-loopback>;127.0.0.1:5173'],'env':{'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/state/browser-home','XDG_CONFIG_HOME':'/state/browser-config','XDG_CACHE_HOME':'/state/browser-cache','LANG':'C.UTF-8','TMPDIR':'/tmp'},'proxy':{'server':f'http://{gateway}:8320','bypass':'<-loopback>;127.0.0.1:5173'}}},'outputDir':'/workspace/project/.workbench-artifacts'}
 (runtime/(prefix+'browser.json')).write_text(json.dumps(data,indent=2)+'\n')
 native=runtime/(prefix+'opencode.json');config=json.loads(native.read_text());config['instructions']=list(dict.fromkeys(config.get('instructions',[])+['/trusted/BROWSER_USAGE.md']));native.write_text(json.dumps(config,indent=2)+'\n')
platform=runtime/'platform.json';config=json.loads(platform.read_text());config.setdefault('previewRelayKey',secrets.token_urlsafe(32));platform.write_text(json.dumps(config,indent=2)+'\n');platform.chmod(0o600)
print('Prepared controlled browser configuration; original projects and sessions untouched')
