#!/usr/bin/env python3
"""Read-only existing-deployment inventory; isolated checkpoint construction is explicit."""
import argparse,datetime,hashlib,json,os,pathlib,secrets,shutil,subprocess,zipfile,time
ROOT=pathlib.Path(__file__).resolve().parents[2];CLOUD=ROOT/'opencode-cloud'; INSTALL=pathlib.Path('/home/vmware/Workspace/programs/WorkBench');LAB=INSTALL/'acceptance/v2-checkpoint';EV=CLOUD/'evidence/v2'
def run(args,**kwargs):
 p=subprocess.run([str(x) for x in args],text=True,capture_output=True,**kwargs)
 if p.returncode:raise RuntimeError('Controlled command failed; output withheld: '+str(args[0]))
 return p.stdout.strip()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def protected(p,text):p.write_text(text);p.chmod(0o600)
def inventory():
 containers=[]
 for cid in run(['docker','ps','-aq','--filter','label=com.docker.compose.project=opencode-cloud-v0']).splitlines():
  i=json.loads(run(['docker','inspect',cid]))[0];containers.append({'id':i['Id'],'name':i['Name'].lstrip('/'),'imageId':i['Image'],'started':i['State']['StartedAt'],'running':i['State']['Running'],'restartPolicy':i['HostConfig']['RestartPolicy']['Name'],'namespace':i['HostConfig']['NetworkMode'],'mounts':[{k:m[k] for k in ['Source','Destination','RW']} for m in i['Mounts']]})
 disks=[]
 for p in [CLOUD/'runtime/disks/admin.img',CLOUD/'runtime/disks/native.img',INSTALL/'runtime/disks/engineer-b.img']:
  s=p.stat();disks.append({'path':str(p),'logicalBytes':s.st_size,'allocatedBytes':s.st_blocks*512})
 return {'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':run(['git','rev-parse','HEAD']),'dirty':run(['git','status','--porcelain']).splitlines(),'dockerVersion':run(['docker','version','--format','{{.Server.Version}}']),'composeVersion':run(['docker','compose','version','--short']),'cpuLogical':os.cpu_count(),'memory':pathlib.Path('/proc/meminfo').read_text(),'disk':dict(zip(['blockSize','blocks','availableBlocks'],[os.statvfs(ROOT).f_frsize,os.statvfs(ROOT).f_blocks,os.statvfs(ROOT).f_bavail])),'containers':containers,'disks':disks,'existingConfigSHA256':{str(p):digest(p) for p in [INSTALL/'runtime/platform.json',INSTALL/'runtime/engineer-b-opencode.json',INSTALL/'runtime/compose.dev.yaml']},'modelBackground':'Approved Qwen on external existing server; GPU RAM/inflight and other consumers NOT_OBSERVED; no remote writes','originalOperations':'inventory only; no existing service/config/data modifications'}
def compose():return ['docker','compose','-p','workbench-v2-checkpoint','-f',LAB/'compose.json']
def setup():
 if LAB.exists():
  if not (LAB/'owner.json').is_file():raise RuntimeError('Unknown checkpoint directory retained')
  print('Existing checkpoint retained; no reinitialization');return
 LAB.mkdir(mode=0o700);(LAB/'owner.json').write_text(json.dumps({'kind':'v2-isolated-checkpoint','source':'authorized learn normal-browser ZIP','purpose':'T0/T1 local tests, no original data restore'}))
 for n in ['project','state','shared-model','shared-model/state']: (LAB/n).mkdir(mode=0o700 if n.startswith('shared-model') else 0o755)
 source=INSTALL/'acceptance/p2-browser-files-20260918T162115/source.zip'
 if digest(source)!='4acd0c4f1cdf752e3106a05a25823b559e923734f4d414631044d610a26086bc':raise RuntimeError('Authorized source capture changed')
 with zipfile.ZipFile(source) as archive:
  for entry in archive.infolist():
   p=pathlib.PurePosixPath(entry.filename)
   if p.parts[0]!='source':continue
   relative=pathlib.Path(*p.parts[1:])
   if '..' in relative.parts or relative.is_absolute():raise RuntimeError('Unsafe source archive')
   target=LAB/'project'/relative
   if entry.is_dir():target.mkdir(parents=True,exist_ok=True)
   else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(entry))
 for args in [['init','-q'],['config','user.name','WorkBench isolated validation'],['config','user.email','validation@example.invalid'],['add','.'],['commit','-qm','Authorized learn capture checkpoint baseline']]:run(['git','-C',LAB/'project',*args])
 baseline=run(['git','-C',LAB/'project','rev-parse','HEAD']);scope=secrets.token_urlsafe(32);pw=secrets.token_urlsafe(32)
 config=json.loads((INSTALL/'runtime/engineer-b-opencode.json').read_text());config['provider']['approved']['options'].update(apiKey=scope,baseURL='http://shared-model-gateway:8318/v1');protected(LAB/'opencode.json',json.dumps(config))
 shared={'totalConcurrency':2,'userConcurrency':1,'maxQueue':4,'waitMs':15000,'backends':{'qwen-local':{'concurrency':1},'luna-limited':{'concurrency':2}},'models':{'Qwen3.6-35B-A3B':{'backend':'qwen-local','upstream':'http://10.243.117.57:4003/','masterEnv':'QWEN_MASTER_KEY'},'gpt-5.6-luna':{'backend':'luna-limited','upstream':'http://192.168.142.130:8317/','masterEnv':'MODEL_MASTER_KEY'}},'scopes':{'engineer-b':{'token':scope,'sourceHosts':['engineer-b-native'],'models':['Qwen3.6-35B-A3B','gpt-5.6-luna'],'dailyLimits':{'Qwen3.6-35B-A3B':100000,'gpt-5.6-luna':250}}}}
 protected(LAB/'shared-model/model-scopes.json',json.dumps(shared,separators=(',',':')));protected(LAB/'shared-model/state/budgets.json',json.dumps({'day':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'counts':{}},separators=(',',':')));protected(LAB/'shared-model/state/dispatches.json','[]')
 shutil.copyfile(INSTALL/'runtime/engineer-b-browser.json',LAB/'browser.json');(LAB/'browser.json').chmod(0o600)
 protected(LAB/'native.env',f'OPENCODE_SERVER_PASSWORD={pw}\nENV_MODEL_TOKEN={scope}\nPROJECT_BASELINE={baseline}\nOPENCODE_CLIENT=app\n')
 protected(LAB/'scope.env',f'ENV_MODEL_TOKEN={scope}\nMODEL_DAILY_BUDGET=100000\n')
 node='node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90';common={'init':True,'restart':'no','read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'logging':{'driver':'json-file','options':{'max-size':'5m','max-file':'2'}}}
 services={
 'shared-model-gateway':{**common,'image':node,'user':'1000:1000','command':['node','--experimental-strip-types','/app/shared-model-gateway.ts'],'env_file':[str(INSTALL/'runtime/engineer-b-gateway.env')],'environment':{'SHARED_MODEL_CONFIG':'/trusted/model-scopes.json','SHARED_MODEL_STATE':'/gateway-state'},'volumes':[str(CLOUD/'src/shared-model-gateway.ts')+':/app/shared-model-gateway.ts:ro',str(LAB/'shared-model/model-scopes.json')+':/trusted/model-scopes.json:ro',str(LAB/'shared-model/state')+':/gateway-state'],'networks':['private','egress'],'mem_limit':'256m','pids_limit':64,'healthcheck':{'test':['CMD','node','-e',"fetch('http://127.0.0.1:8318/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'2s','timeout':'2s','retries':15}},
 'engineer-b-web-egress':{**common,'image':node,'user':'1000:1000','command':['node','/app/web-egress.mjs'],'environment':{'EGRESS_MODE':'direct-public'},'volumes':[str(CLOUD/'src/web-egress.mjs')+':/app/web-egress.mjs:ro',str(CLOUD/'src/egress-policy')+':/app/egress-policy:ro'],'networks':['private','egress'],'mem_limit':'128m','pids_limit':32},
 'engineer-b-native':{**common,'image':'opencode-cloud/native:1.18.31-browser-v1','init':True,'command':['opencode','serve','--hostname','127.0.0.1','--port','4030'],'env_file':[str(LAB/'native.env')],'environment':{**{k:'http://engineer-b-web-egress:8320' for k in ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']},'NO_PROXY':'localhost,127.0.0.1,::1,shared-model-gateway','no_proxy':'localhost,127.0.0.1,::1,shared-model-gateway','ALL_PROXY':'','all_proxy':''},'networks':['private'],'volumes':[str(LAB/'project')+':/workspace/project',str(LAB/'state')+':/state',str(LAB/'opencode.json')+':/trusted/opencode.json:ro',str(LAB/'browser.json')+':/trusted/browser.json:ro']+[str(CLOUD/'browser-tools'/n)+':/trusted/'+n+':ro' for n in ['vite.config.mjs','start-preview.sh','BROWSER_USAGE.md']],'tmpfs':['/tmp:rw,nosuid,nodev,size=256m'],'mem_limit':'2g','cpus':2,'pids_limit':256},
 'engineer-b-native-firewall':{**common,'image':'opencode-cloud/native:1.18.31-managed-v0','user':'0:0','network_mode':'service:engineer-b-native','cap_add':['NET_ADMIN'],'command':['sh','-c','iptables -C OUTPUT -p tcp --dport 4030 -m owner --uid-owner 1000 -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -p tcp --dport 4030 -m owner --uid-owner 1000 -j REJECT']},
 'engineer-b-native-guard':{**common,'image':'opencode-cloud/native:1.18.31-managed-v0','user':'1001:1001','command':['node','--experimental-strip-types','/app/environment-guard.ts'],'network_mode':'service:engineer-b-native','env_file':[str(LAB/'native.env')],'environment':{'GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'safe.directory','GIT_CONFIG_VALUE_0':'/workspace/project'},'volumes':[str(CLOUD/'src')+':/app:ro',str(LAB/'project')+':/workspace/project:ro'],'tmpfs':['/tmp:rw,nosuid,nodev,size=128m'],'mem_limit':'256m','pids_limit':64}}
 protected(LAB/'compose.json',json.dumps({'name':'workbench-v2-checkpoint','services':services,'networks':{'private':{'internal':True},'egress':{}}},indent=2))
 # Host owner is the same fixed1000 user; permissions affect only new checkpoint copies.
 if os.getuid()!=1000:raise RuntimeError('Checkpoint ownership requires fixed uid1000; no original ownership changed')
 for name in ['opencode.json','browser.json']:(LAB/name).chmod(0o644)
 run(compose()+['config','--quiet']);print('Isolated authorized checkpoint prepared; no existing service modified')
def start():
 run(compose()+['up','-d','--no-deps','shared-model-gateway','engineer-b-web-egress','engineer-b-native'])
 run(compose()+['run','--rm','--no-deps','engineer-b-native-firewall']);run(compose()+['up','-d','--no-deps','engineer-b-native-guard']);print('Isolated full environment started; validate health before task')
def sample(label):
 stats=run(['docker','stats','--no-stream','--format','{{json .}}']);rows=[json.loads(line) for line in stats.splitlines()]
 rows=[x for x in rows if x['Name'].startswith(('opencode-cloud-v0-','workbench-v2-checkpoint-'))]
 detail=[]
 for cid in run(['docker','ps','-q','--filter','label=com.docker.compose.project=workbench-v2-checkpoint']).splitlines():
  script="const fs=require('node:fs');const procs=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).flatMap(p=>{try{const t=fs.readFileSync('/proc/'+p+'/status','utf8');return [{pid:p,name:t.match(/^Name:\\s+(.*)$/m)?.[1],rssKiB:Number(t.match(/^VmRSS:\\s+(\\d+)/m)?.[1]||0)}]}catch{return []}});console.log(JSON.stringify({memoryCurrent:fs.readFileSync('/sys/fs/cgroup/memory.current','utf8').trim(),memoryStat:fs.readFileSync('/sys/fs/cgroup/memory.stat','utf8'),processes:procs}))"
  try:detail.append({'container':cid,'observed':json.loads(run(['docker','exec',cid,'node','-e',script]))})
  except RuntimeError:detail.append({'container':cid,'observation':'unknown or exited'})
 p=EV/'t0-samples.jsonl'
 with p.open('a') as f:f.write(json.dumps({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'label':label,'metric':'Docker stats current memory (cgroup working set excluding inactive file cache), not RSS or peak RAM','rows':rows,'cgroupAndProcesses':detail})+'\n')
 print('Actual sample saved: '+label)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('action',choices=['inventory','setup','start','sample']);a.add_argument('--label',default='baseline');args=a.parse_args();EV.mkdir(exist_ok=True)
 if args.action=='inventory':(EV/'t0-inventory.json').write_text(json.dumps(inventory(),indent=2)+'\n');print('Existing deployment inventory saved; no secrets emitted')
 elif args.action=='setup':setup()
 elif args.action=='start':start()
 else:sample(args.label)
