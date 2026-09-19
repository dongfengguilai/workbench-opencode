#!/usr/bin/env python3
"""Trusted single-host lifecycle controller for fixed WorkBench spaces."""
import argparse,fcntl,http.server,json,os,pathlib,socketserver,subprocess,tempfile,threading,time

class LifecycleManager:
 def __init__(self,state_path,spaces,max_running,runtime,max_queued=8,max_wait_seconds=600,idle_seconds=0):
  self.path=pathlib.Path(state_path);self.spaces=spaces;self.max=max_running;self.runtime=runtime;self.max_queued=max_queued;self.max_wait=max_wait_seconds;self.idle=max(0,idle_seconds);self.path.parent.mkdir(parents=True,exist_ok=True)
  if not self.path.exists():self._write({'schemaVersion':2,'queue':[],'spaces':{n:self._new_row(cfg) for n,cfg in spaces.items()}})
  else:
   doc=json.loads(self.path.read_text());doc.setdefault('queue',[]);changed=False
   for n,cfg in spaces.items():
    if n not in doc['spaces']:doc['spaces'][n]=self._new_row(cfg);changed=True
   if changed:self._write(doc)
 def _new_row(self,cfg):return {'generation':0,'state':'STOPPED','requestIds':[],'initialization':'READY' if cfg.get('existing',True) else 'PENDING','lastActivityAt':None,'autoStopNotBefore':None}
 def _read(self):
  doc=json.loads(self.path.read_text());doc.setdefault('queue',[])
  for name,row in doc['spaces'].items():
   row.setdefault('initialization','READY' if self.spaces[name].get('existing',True) else 'PENDING');row.setdefault('requestIds',[]);row.setdefault('lastActivityAt',None);row.setdefault('autoStopNotBefore',None)
  return doc
 def _write(self,value):
  fd,name=tempfile.mkstemp(dir=self.path.parent,prefix='.lifecycle-',text=True);os.fchmod(fd,0o600)
  with os.fdopen(fd,'w') as f:json.dump(value,f,separators=(',',':'));f.flush();os.fsync(f.fileno())
  os.replace(name,self.path)
 def _locked(self):
  lock=open(str(self.path)+'.lock','a+');os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX);return lock
 def _view(self,doc,space,row,observed=None):
  result={**row}
  if observed is not None:result['runningMembers']=observed['members']
  if row['state']=='QUEUED':result['queuePosition']=next((i+1 for i,x in enumerate(doc['queue']) if x['space']==space),None)
  return result
 def _expire(self,doc):
  now=time.time();keep=[]
  for item in doc['queue']:
   if now-item['queuedAt']>self.max_wait:doc['spaces'][item['space']].update(state='STOPPED',lastError='Enter request expired',queuedAt=None)
   else:keep.append(item)
  doc['queue']=keep
 def _capacity(self,space):return self.runtime.capacity(space) if hasattr(self.runtime,'capacity') else {'safe':True,'blockers':[]}
 def _initialize_and_start(self,space,row,doc):
  capacity=self._capacity(space)
  if not capacity['safe']:
   message='Storage admission refused: '+','.join(capacity['blockers']);row.update(state='STOPPED',lastError=message,blockers=capacity['blockers']);self._write(doc);raise RuntimeError(message)
  if row['initialization']!='READY':
   row.update(initialization='INITIALIZING',lastError=None);self._write(doc)
   try:self.runtime.initialize(space);row['initialization']='READY';self._write(doc)
   except Exception as e:row.update(initialization='FAILED',lastError=str(e),state='STOPPED');self._write(doc);raise
  row.update(state='STARTING',lastError=None,queuedAt=None,blockers=[]);self._write(doc)
  try:
   self.runtime.start(space);now=time.time();row.update(state='READY',generation=row['generation']+1,lastActivityAt=now,autoStopNotBefore=now+self.idle)
  except Exception as e:row.update(state='UNKNOWN',lastError=str(e));self._write(doc);raise
 def _occupied(self):return sum(1 for name in self.spaces if (lambda x:x['complete'] or x['partial'])(self.runtime.observe(name)))
 def _promote(self,doc):
  occupied=self._occupied()
  while doc['queue'] and occupied<self.max:
   item=doc['queue'].pop(0);row=doc['spaces'][item['space']]
   if row['state']!='QUEUED':continue
   try:self._initialize_and_start(item['space'],row,doc);occupied+=1
   except Exception:continue
 def _reconcile_row(self,row,observed):
  if observed['partial']:row.update(state='UNKNOWN',lastError='Partial runtime group requires maintainer review')
  elif observed['complete']:
   if row['state']=='STARTING':row.update(state='READY',generation=row['generation']+1,lastError=None)
   elif row['state'] not in ['READY','DRAINING','STOPPING']:row.update(state='UNKNOWN',lastError='Unexpected running environment requires review')
  elif row['state']!='QUEUED':row['state']='STOPPED'
 def recover(self):
  with self._locked():
   doc=self._read();now=time.time();doc['queue']=[]
   for space,row in doc['spaces'].items():
    previous=row['state']
    try:observed=self.runtime.observe(space)
    except Exception:row.update(state='UNKNOWN',lastError='Runtime observation failed during controller recovery');continue
    if previous=='QUEUED':row.update(state='STOPPED',queuedAt=None,lastError='Queued enter requires confirmation after controller restart')
    elif previous=='STARTING':
     if observed['complete']:row.update(state='READY',generation=row['generation']+1,lastError=None)
     elif observed['partial']:row.update(state='UNKNOWN',lastError='Partial start requires maintainer review')
     else:row.update(state='STOPPED',lastError='Interrupted start did not leave running members')
    elif previous in ['DRAINING','STOPPING']:
     if observed['complete'] or observed['partial']:row.update(state='UNKNOWN',lastError='Interrupted stop requires maintainer review')
     else:row.update(state='STOPPED',lastError=None)
    elif previous=='READY':
     if observed['partial']:row.update(state='UNKNOWN',lastError='Partial runtime group requires maintainer review')
     elif not observed['complete']:row.update(state='STOPPED',lastError='Runtime disappeared while controller was offline')
    elif observed['complete'] or observed['partial']:row.update(state='UNKNOWN',lastError='Orphan runtime requires maintainer review')
    if row['state']=='READY':row['autoStopNotBefore']=now+self.idle
   self._write(doc)
 def _stop_locked(self,space,row,doc,automatic=False):
  if automatic and hasattr(self.runtime,'stop_managed_preview'):
   initial=self.runtime.preflight(space)
   if not initial['safe'] and any(x not in ['terminal','unknown-process'] for x in initial['blockers']):
    row['blockers']=initial['blockers'];self._write(doc);return row
   try:self.runtime.stop_managed_preview(space)
   except Exception as e:row.update(blockers=['managed-preview-stop-failed'],lastError=str(e));self._write(doc);return row
  first=self.runtime.preflight(space)
  if not first['safe']:row['blockers']=first['blockers'];self._write(doc);return row
  row.update(state='DRAINING',blockers=[]);self._write(doc)
  try:self.runtime.drain(space,True)
  except Exception as e:row.update(state='UNKNOWN',lastError='Drain barrier failed: '+str(e));self._write(doc);raise
  second=self.runtime.preflight(space)
  if not second['safe']:
   self.runtime.drain(space,False);row.update(state='READY',blockers=second['blockers']);self._write(doc);return row
  row['state']='STOPPING';self._write(doc)
  try:
   result=self.runtime.stop(space)
   if result.get('forced'):raise RuntimeError('Force stop forbidden')
   row.update(state='STOPPED',lastError=None,blockers=[],autoStopNotBefore=None)
  except Exception as e:row.update(state='UNKNOWN',lastError=str(e));self._write(doc);raise
  self._promote(doc);self._write(doc);return {**row,'forced':False,'automatic':automatic}
 def apply(self,space,action,request_id=None):
  if space not in self.spaces or action not in ['status','enter','stop','cancel','activity']:raise ValueError('Fixed registered space/action required')
  with self._locked():
   doc=self._read();self._expire(doc);row=doc['spaces'][space];observed=self.runtime.observe(space);self._reconcile_row(row,observed)
   if action=='status':self._write(doc);return self._view(doc,space,row,observed)
   if action=='activity':
    if request_id is not None:raise ValueError('Activity takes no request id')
    if row['state']=='READY':row['lastActivityAt']=time.time()
    self._write(doc);return self._view(doc,space,row,observed)
   if not request_id or len(request_id)>96:raise ValueError('Bounded request id required')
   seen=row['requestIds']
   if request_id in seen:return {**self._view(doc,space,row),'deduplicated':True}
   seen.append(request_id);row['requestIds']=seen[-16:]
   if action=='cancel':
    if row['state']=='QUEUED':doc['queue']=[x for x in doc['queue'] if x['space']!=space];row.update(state='STOPPED',queuedAt=None,lastError='Enter request cancelled')
    self._write(doc);return self._view(doc,space,row)
   if action=='enter':
    if row['state']=='READY':self._write(doc);return row
    if row['state']=='QUEUED':self._write(doc);return self._view(doc,space,row)
    if row['state']!='STOPPED':raise RuntimeError('Space state does not permit start')
    if self._occupied()>=self.max:
     if len(doc['queue'])>=self.max_queued:raise RuntimeError('Enter queue is full')
     row.update(state='QUEUED',queuedAt=time.time(),lastError=None);doc['queue'].append({'space':space,'requestId':request_id,'queuedAt':row['queuedAt']});self._write(doc);return self._view(doc,space,row)
    self._initialize_and_start(space,row,doc);self._write(doc);return row
   if row['state']=='STOPPED':self._write(doc);return row
   if row['state']!='READY':raise RuntimeError('Space state does not permit stop')
   return self._stop_locked(space,row,doc,False)
 def sweep(self):
  if not self.idle:return []
  stopped=[]
  with self._locked():
   doc=self._read();self._expire(doc);now=time.time()
   for space,row in doc['spaces'].items():
    if row['state']!='READY':continue
    last=row.get('lastActivityAt');not_before=row.get('autoStopNotBefore')
    if not isinstance(last,(int,float)):last=now
    if not isinstance(not_before,(int,float)):not_before=now
    if now<not_before or now-last<self.idle:continue
    observed=self.runtime.observe(space)
    if not observed['complete']:self._reconcile_row(row,observed);continue
    try:
     result=self._stop_locked(space,row,doc,True)
     if result.get('state')=='STOPPED':stopped.append(space)
    except Exception:pass
   self._write(doc)
  return stopped

class DockerRuntime:
 def __init__(self,cfg):self.cfg=cfg
 def _run(self,args,input=None):
  try:p=subprocess.run([str(x) for x in args],input=input,text=True,capture_output=True,timeout=45)
  except subprocess.TimeoutExpired:raise RuntimeError('Controlled runtime command timed out')
  if p.returncode:raise RuntimeError('Controlled runtime command failed')
  return p.stdout.strip()
 def _space(self,name):return self.cfg['spaces'][name]
 def _service(self,name,role):
  s=self._space(name);defaults={'gateway':'engineer-b-model-gateway','egress':'engineer-b-web-egress','native':'engineer-b-native','firewall':'engineer-b-native-firewall','guard':'engineer-b-native-guard'}
  return s.get('roles',{}).get(role,defaults[role])
 def _container(self,name,role):return self._space(name)['containers'][self._service(name,role)]
 def _roles(self,name):return self._space(name).get('groupRoles',['gateway','egress','native','guard'])
 def capacity(self,name):
  space=self._space(name);root=pathlib.Path(str(space.get('storagePath',self.cfg.get('storagePath',self.cfg['statePath']))));minimum=int(space.get('minFreeBytesBeforeStart',self.cfg.get('minFreeBytesBeforeStart',0)))
  try:
   if not root.exists() or root.is_symlink():return {'safe':False,'blockers':['storage-path-unavailable']}
   stat=os.statvfs(root);available=stat.f_frsize*stat.f_bavail
  except OSError:return {'safe':False,'blockers':['storage-observation-unknown']}
  return {'safe':available>=minimum,'blockers':[] if available>=minimum else ['insufficient-free-space'],'availableBytes':available,'requiredBytes':minimum}
 def initialize(self,name):
  s=self._space(name)
  if s.get('existing',True):return
  command=s.get('initializer');marker=pathlib.Path(s.get('initializationMarker',''))
  if not command or not marker.is_absolute():raise RuntimeError('Registered initializer is incomplete')
  self._run(command)
  if not marker.is_file() or marker.is_symlink():raise RuntimeError('Initialization marker missing')
 def _inspect(self,n):
  p=subprocess.run(['docker','inspect',n],text=True,capture_output=True)
  if p.returncode:return None
  return json.loads(p.stdout)[0]
 def observe(self,name):
  space=self._space(name);states=[]
  for role in self._roles(name):
   service=self._service(name,role);container=space['containers'][service];i=self._inspect(container)
   if i and (i['Config']['Labels'].get('com.docker.compose.project')!=self.cfg['composeProject'] or i['Config']['Labels'].get('com.docker.compose.service')!=service):raise RuntimeError('Runtime ownership mismatch')
   states.append(bool(i and i['State']['Running']))
  return {'complete':all(states),'partial':any(states) and not all(states),'members':sum(states)}
 def _node(self,name,code):return self._run(['docker','exec','-i',self._container(name,'native'),'node'],code)
 def start(self,name):
  s=self._space(name);roles=self._roles(name)
  if any(self._inspect(self._container(name,role)) is None for role in roles):self._run(s['compose']+['create','--no-build']+[self._service(name,role) for role in roles])
  if any(self._inspect(self._container(name,role)) is None for role in roles):raise RuntimeError('Registered environment members were not created')
  ordered=[r for r in ['gateway','egress','native'] if r in roles];self._run(['docker','start']+[self._container(name,r) for r in ordered]);self._run(s['compose']+['run','--rm','--no-deps',self._service(name,'firewall')]);self._run(['docker','start',self._container(name,'guard')])
  health="const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');fetch('http://127.0.0.1:4096/global/health',{headers:{Authorization:a},signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  for _ in range(60):
   try:
    self._node(name,health);gateway=s.get('sharedModelGateway')
    if gateway:
     model_health="const c=require('/trusted/opencode.json'),k=c.provider.approved.options.apiKey;fetch('http://"+gateway+":8318/v1/models',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(2000)}).then(async r=>{let v=await r.json();let ids=new Set((v.data||[]).map(x=>x.id));process.exit(r.ok&&ids.has('Qwen3.6-35B-A3B')&&ids.has('gpt-5.6-luna')?0:1)}).catch(()=>process.exit(1))"
     self._node(name,model_health)
    return
   except Exception:time.sleep(.5)
  raise RuntimeError('Complete environment group did not become healthy')
 def _guard_status(self,name):
  code="const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');fetch('http://127.0.0.1:4096/__lifecycle/status',{headers:{Authorization:a},signal:AbortSignal.timeout(2000)}).then(async r=>{if(!r.ok)throw 0;console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))"
  return json.loads(self._node(name,code))
 def preflight(self,name):
  code="const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');(async()=>{let b=[];for(const [p,label] of [['/session/status?directory=/workspace/project','native-task'],['/question?directory=/workspace/project','question'],['/permission?directory=/workspace/project','permission'],['/pty?directory=/workspace/project','terminal']]){let r=await fetch('http://127.0.0.1:4096'+p,{headers:{Authorization:a}});if(!r.ok)throw 0;let v=await r.json();if((Array.isArray(v)?v.length:Object.keys(v).length)>0)b.push(label)}console.log(JSON.stringify(b))})().catch(()=>process.exit(1))"
  try:
   blockers=json.loads(self._node(name,code));guard=self._guard_status(name)
   if guard.get('exporting'):blockers.append('export')
  except Exception:return {'safe':False,'blockers':['state-observation-unknown']}
  gateway=self._space(name).get('sharedModelGateway')
  if gateway:
   code="const c=require('/trusted/opencode.json'),k=c.provider.approved.options.apiKey;fetch('http://"+gateway+":8318/v1/workbench/status',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(2000)}).then(async r=>{if(!r.ok)throw 0;console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))"
   try:
    model=json.loads(self._node(name,code))
    if model.get('queued',0)>0:blockers.append('model-queued')
    if model.get('active',0)>0 or model.get('unresolved',0)>0:blockers.append('model-dispatch')
   except Exception:return {'safe':False,'blockers':['model-observation-unknown']}
  native=self._container(name,'native');top=self._run(['docker','top',native,'-eo','pid,comm']).splitlines()[1:];commands=[x.split(None,1)[1].strip() for x in top if len(x.split(None,1))==2];unknown=[x for x in commands if x not in ['docker-init','opencode']]
  if unknown:blockers.append('unknown-process')
  return {'safe':not blockers,'blockers':sorted(set(blockers))}
 def drain(self,name,on):
  action='drain' if on else 'resume';code="const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');fetch('http://127.0.0.1:4096/__lifecycle/"+action+"',{method:'POST',headers:{Authorization:a}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";self._node(name,code)
 def stop_managed_preview(self,name):
  status=self._guard_status(name)
  if not status.get('preview',{}).get('running'):return
  code="const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');fetch('http://127.0.0.1:4096/__preview-control/stop',{method:'POST',headers:{Authorization:a}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";self._node(name,code)
 def stop(self,name):
  self.stop_managed_preview(name)
  for role in [r for r in ['guard','native','gateway','egress'] if r in self._roles(name)]:
   n=self._container(name,role);self._run(['docker','kill','--signal=SIGTERM',n]);deadline=time.monotonic()+self.cfg['stopObserveSeconds']
   while time.monotonic()<deadline:
    i=self._inspect(n)
    if i and not i['State']['Running']:
     if i['State']['ExitCode']==137:raise RuntimeError('SIGKILL observed')
     break
    time.sleep(.25)
   else:raise RuntimeError('Graceful stop observation timeout; no SIGKILL issued')
  return {'forced':False}

class Handler(http.server.BaseHTTPRequestHandler):
 def do_POST(self):
  try:
   if self.path!='/lifecycle':raise ValueError('Fixed endpoint required')
   length=int(self.headers.get('content-length','0'))
   if length>4096:raise ValueError('Lifecycle request too large')
   data=json.loads(self.rfile.read(length))
   if set(data)-{'space','action','requestId'}:raise ValueError('Unknown lifecycle fields')
   body=self.server.manager.apply(data.get('space'),data.get('action'),data.get('requestId'))
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
  except ValueError as e:self.send_error(403,str(e))
  except RuntimeError as e:self.send_error(409,str(e))
 def log_message(self,*_):pass
class UnixServer(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):daemon_threads=True

def main():
 p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--socket',required=True);p.add_argument('--check',action='store_true');a=p.parse_args();cfg=json.loads(pathlib.Path(a.config).read_text());runtime=DockerRuntime(cfg);manager=LifecycleManager(cfg['statePath'],cfg['spaces'],cfg['maxRunning'],runtime,cfg.get('maxQueued',8),cfg.get('maxWaitSeconds',600),cfg.get('idleSeconds',0))
 if a.check:
  for n in cfg['spaces']:manager.apply(n,'status')
  print('Lifecycle configuration and owned runtime state valid');return
 controller_lock=open(str(cfg['statePath'])+'.controller.lock','a+');os.chmod(controller_lock.name,0o600)
 try:fcntl.flock(controller_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:raise SystemExit('Another lifecycle controller owns this state')
 manager.recover();sock=pathlib.Path(a.socket);sock.parent.mkdir(parents=True,exist_ok=True)
 if sock.exists():sock.unlink()
 server=UnixServer(str(sock),Handler);server.manager=manager;os.chmod(sock,0o600);stop=threading.Event()
 def reaper():
  while not stop.wait(max(1,float(cfg.get('sweepIntervalSeconds',5)))):
   try:manager.sweep()
   except Exception:pass
 thread=threading.Thread(target=reaper,daemon=True);thread.start()
 try:server.serve_forever()
 finally:stop.set();server.server_close();sock.unlink(missing_ok=True);controller_lock.close()
if __name__=='__main__':main()
