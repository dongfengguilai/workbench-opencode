import subprocess,json,pathlib,hashlib,shutil,datetime,time
ROOT=pathlib.Path.cwd(); CLOUD=ROOT/'opencode-cloud'; INSTALL=pathlib.Path('/home/vmware/Workspace/programs/WorkBench'); EV=CLOUD/'evidence/increment-v1'
meta=json.loads((EV/'export-source-change-publication-prepared.json').read_text()); old=pathlib.Path(meta['rollbackCodeDirectory'])
def run(args,input=None):
 p=subprocess.run(args,input=input,text=True,capture_output=True)
 if p.returncode: raise RuntimeError('Command failed: '+args[0]+'; protected command output withheld')
 return p.stdout

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inspect(n):return json.loads(run(['docker','inspect',n]))[0]
natives=['opencode-cloud-v0-native-1','opencode-cloud-v0-admin-native-1','opencode-cloud-v0-engineer-b-native-1']; guard='opencode-cloud-v0-engineer-b-native-guard-1'
probe=r'''const fs=require('node:fs'),crypto=require('node:crypto');(async()=>{const h={Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'),Connection:'close'};async function get(p){let r=await fetch('http://127.0.0.1:4096'+p,{headers:h,signal:AbortSignal.timeout(30000)});let b=Buffer.from(await r.arrayBuffer());return {status:r.status,sha256:crypto.createHash('sha256').update(b).digest('hex'),data:JSON.parse(b)}}const idle=await get('/session/status?directory=/workspace/project');if(idle.status!==200||Object.keys(idle.data).length)throw Error('Task active');let sid=process.env.AUDIT_SID;let session=await get('/session/'+sid+'?directory=/workspace/project'),messages=await get('/session/'+sid+'/message?directory=/workspace/project');const out={idle:true,sessionStatus:session.status,messageStatus:messages.status,sessionHash:session.sha256,messageHash:messages.sha256};if(process.env.AUDIT_EXPORT==='1'){let e=await get('/__export');out.export={status:e.status,tree:e.data.tree,baseline:e.data.baseline};if(e.status!==200)throw Error('Export failed')}console.log(JSON.stringify(out));})().catch(()=>process.exit(1))'''
def check(n,sid,export=False):return json.loads(run(['docker','exec','-i','-e','AUDIT_SID='+sid,'-e','AUDIT_EXPORT='+('1' if export else '0'),n,'node'],probe))
def snapshot():
 result={'containers':{},'files':{},'sessions':{}}
 for n in natives+['opencode-cloud-v0-platform-1','opencode-cloud-v0-admin-native-guard-1','opencode-cloud-v0-native-guard-1','opencode-cloud-v0-admin-model-gateway-1','opencode-cloud-v0-engineer-b-model-gateway-1']:
  i=inspect(n);result['containers'][n]={'id':i['Id'],'started':i['State']['StartedAt']}
 for n,sid in [(natives[1],'ses_f4f7bcc24ffenu1OPoS7DnWsde'),(natives[2],'ses_f4cb7c6d6ffeHxXuJcNeFmuqs0')]:
  result['sessions'][n]=check(n,sid)
  mount=next(x['Source'] for x in inspect(n)['Mounts'] if x['Destination']=='/workspace/project');base=pathlib.Path(mount)
  for rel in ['.git/index','web/index.html','web/package-lock.json']:
   p=base/rel
   if p.is_file():result['files'][str(p)]=sha(p)
 for p in [INSTALL/'runtime/platform.json',INSTALL/'runtime/compose.dev.yaml',INSTALL/'runtime/engineer-b-gateway-state/budget.json',CLOUD/'runtime/admin-gateway-state/budget.json']:
  result['files'][str(p)]=sha(p)
 return result
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'); stage=INSTALL/'backups'/('controlled-artifact-rollback-'+stamp);stage.mkdir(mode=0o700)
report={'time':stamp,'scope':'Engineer guard artifact only; no data restore, native/model/platform rebuild or original guard restart','privateStage':str(stage),'pass':False}
base=['docker','compose','--project-directory',str(CLOUD),'-f',str(CLOUD/'compose.yaml'),'-f',str(INSTALL/'runtime/compose.dev.yaml')]
changed=False
try:
 before=snapshot();report['before']=before
 # All native environments must be idle, including preserved trial runtime.
 run(['docker','exec','-i',natives[0],'node'],probe.replace("let sid=process.env.AUDIT_SID;", "console.log(JSON.stringify({idle:true}));return;let sid=process.env.AUDIT_SID;"))
 for name,digest in meta['candidateCodeSHA256'].items():
  if sha(CLOUD/'src'/name)!=digest:raise RuntimeError('Candidate changed; rollback rejected')
 for name,digest in meta['beforeCodeSHA256'].items():
  if sha(old/name)!=digest:raise RuntimeError('Backup provenance mismatch')
 shutil.copytree(CLOUD/'src',stage/'candidate');shutil.copytree(stage/'candidate',stage/'previous')
 for name in meta['beforeCodeSHA256']:
  shutil.copy2(old/name,stage/'previous'/name)
  (stage/'previous'/name).chmod(0o644)
 override=stage/'rollback.json';override.write_text(json.dumps({'services':{'engineer-b-native-guard':{'volumes':[str(stage/'previous')+':/app:ro']}}}));override.chmod(0o600)
 run(base+['-f',str(override),'config','--quiet'])
 # Recheck task idle immediately before the only service change.
 snapshot();changed=True
 run(base+['-f',str(override),'up','-d','--no-deps','--force-recreate','engineer-b-native-guard'])
 for _ in range(30):
  if inspect(guard)['State'].get('Health',{}).get('Status')=='healthy':break
  time.sleep(1)
 else:raise RuntimeError('Rollback guard not healthy')
 i=inspect(guard);assert next(m['Source'] for m in i['Mounts'] if m['Destination']=='/app')==str(stage/'previous')
 report['previousArtifact']=check(natives[2],'ses_f4cb7c6d6ffeHxXuJcNeFmuqs0',True);report['rollbackGuardID']=i['Id']
finally:
 if changed:
  run(base+['up','-d','--no-deps','--force-recreate','engineer-b-native-guard'])
  for _ in range(30):
   if inspect(guard)['State'].get('Health',{}).get('Status')=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Candidate restore not healthy; inspect retained stage')
  i=inspect(guard);assert next(m['Source'] for m in i['Mounts'] if m['Destination']=='/app')==str(CLOUD/'src')
  report['restoredCandidate']=check(natives[2],'ses_f4cb7c6d6ffeHxXuJcNeFmuqs0',True);report['restoredGuardID']=i['Id']
  after=snapshot();report['after']=after;report['dataConfigCountersAndOriginalServicesUnchanged']=before==after
  report['candidateSourceUnchanged']=all(sha(CLOUD/'src'/n)==d for n,d in meta['candidateCodeSHA256'].items())
  report['pass']=before==after and report['candidateSourceUnchanged'] and report.get('previousArtifact',{}).get('export')==report['restoredCandidate']['export'] and report['restoredCandidate']['export']['tree']=='79a2a0657116049b171998c7ea8e7402fbad5c5b'
 (EV/'controlled-artifact-rollback.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'pass':report['pass'],'onlyServiceRecreated':guard,'evidence':str(EV/'controlled-artifact-rollback.json')}))
if not report['pass']:raise SystemExit(1)
