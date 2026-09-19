from pathlib import Path
import subprocess,json,time,hashlib,datetime,sqlite3
lab=Path('/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint');ev=Path('opencode-cloud/evidence/v2');prefix='workbench-v2-checkpoint-';services=['engineer-b-native-guard','engineer-b-native','engineer-b-model-gateway','engineer-b-web-egress']
def run(args,stdin=None):
 p=subprocess.run(args,input=stdin,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Isolated command failed, output withheld')
 return p.stdout
native=prefix+'engineer-b-native-1'
probe="const auth='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');(async()=>{for(const p of ['/session/status?directory=/workspace/project','/question?directory=/workspace/project','/permission?directory=/workspace/project']){const r=await fetch('http://127.0.0.1:4096'+p,{headers:{Authorization:auth}});if(!r.ok||Object.keys(await r.json()).length)throw Error('Busy/unknown')}const r=await fetch('http://127.0.0.1:4096/__preview-control/stop',{method:'POST',headers:{Authorization:auth}});if(!r.ok)throw Error('Preview stop unknown');console.log('Own task/approval/questions idle; managed preview stopped')})().catch(()=>process.exit(1))"
run(['docker','exec','-i',native,'node'],probe)
before=hashlib.sha256((lab/'project/.git/index').read_bytes()).hexdigest();rows=[]
for service in services:
 name=prefix+service+'-1';i=json.loads(run(['docker','inspect',name]))[0]
 if i['Config']['Labels'].get('com.docker.compose.project')!='workbench-v2-checkpoint':raise RuntimeError('Unknown resource retained')
 if i['State']['Running']:run(['docker','kill','--signal=SIGTERM',name])
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  after=json.loads(run(['docker','inspect',name]))[0]
  if not after['State']['Running']:break
  time.sleep(.25)
 else:raise RuntimeError('Graceful timeout; no SIGKILL; permit must remain occupied')
 rows.append({'service':service,'containerId':i['Id'],'runningAfter':after['State']['Running'],'exitCode':after['State']['ExitCode'],'signal':'SIGTERM only','forced':False})
original=json.loads((ev/'t0-inventory.json').read_text());same=[]
for i in original['containers']:
 now=json.loads(run(['docker','inspect',i['id']]))[0];same.append(now['Id']==i['id'] and now['State']['StartedAt']==i['started'] and now['State']['Running']==i['running'])
checks=[]
for p in (lab/'state').rglob('*.db'):
 if 'npm-cache' in p.parts:continue
 db=sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True);checks.append({'database':str(p.relative_to(lab)),'integrity':db.execute('pragma integrity_check').fetchone()[0]});db.close()
report={'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Isolated T0 measurement only; manual diagnostic stop is NOT a shipped lifecycle API','rows':rows,'allPrivateGroupMembersStopped':all(not r['runningAfter'] for r in rows),'allOriginalContainerIDsStartTimesAndStatesUnchanged':all(same),'originalConfigSHA256Unchanged':all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in original['existingConfigSHA256'].items()),'cloneGitIndexUnchanged':hashlib.sha256((lab/'project/.git/index').read_bytes()).hexdigest()==before,'sqliteIntegrity':checks,'modelTaskObservation':'t0-task-observation.json'}
(ev/'t0-stop-measurement.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if isinstance(v,bool)}))
