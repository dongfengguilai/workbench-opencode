import importlib.util,tempfile,unittest,json,time,threading
from pathlib import Path
script=Path(__file__).resolve().parents[1]/'scripts/lifecycle-helper.py';spec=importlib.util.spec_from_file_location('lifecycle_helper',script);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Runtime:
 def __init__(self):self.running=False;self.busy=False;self.starts=0;self.stops=0;self.drained=False;self.initializes=0;self.init_failure=False;self.capacity_ok=True;self.preview_stops=0
 def observe(self,space):return {'complete':self.running,'partial':False,'members':4 if self.running else 0}
 def start(self,space):self.starts+=1;self.running=True
 def initialize(self,space):
  self.initializes+=1
  if self.init_failure:raise RuntimeError('controlled init failure')
 def preflight(self,space):return {'safe':not self.busy,'blockers':['native-task'] if self.busy else []}
 def drain(self,space,on):self.drained=on
 def stop(self,space):self.stops+=1;self.running=False;return {'forced':False}
 def capacity(self,space):return {'safe':self.capacity_ok,'blockers':[] if self.capacity_ok else ['insufficient-free-space']}
 def stop_managed_preview(self,space):self.preview_stops+=1
class MultiRuntime:
 def __init__(self):self.running={x:False for x in 'abc'};self.starts=[];self.stops=[]
 def observe(self,space):return {'complete':self.running[space],'partial':False,'members':4 if self.running[space] else 0}
 def initialize(self,space):pass
 def start(self,space):self.starts.append(space);self.running[space]=True
 def preflight(self,space):return {'safe':True,'blockers':[]}
 def drain(self,space,on):pass
 def stop(self,space):self.stops.append(space);self.running[space]=False;return {'forced':False}
 def capacity(self,space):return {'safe':True,'blockers':[]}
class Lifecycle(unittest.TestCase):
 def manager(self,rt):
  t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);return m.LifecycleManager(Path(t.name)/'state.json',{'a':{}},2,rt)
 def test_status_never_starts(self):
  rt=Runtime();x=self.manager(rt);self.assertEqual(x.apply('a','status',None)['state'],'STOPPED');self.assertEqual(rt.starts,0)
 def test_status_recovers_completed_start_once(self):
  rt=Runtime();x=self.manager(rt);doc=x._read();doc['spaces']['a']['state']='STARTING';x._write(doc);rt.running=True
  first=x.apply('a','status',None);second=x.apply('a','status',None);self.assertEqual(first['state'],'READY');self.assertEqual(first['generation'],1);self.assertEqual(second['generation'],1)
 def test_lazy_initialization_only_on_first_enter(self):
  rt=Runtime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{'a':{'existing':False}},2,rt)
  self.assertEqual(x.apply('a','status',None)['initialization'],'PENDING');self.assertEqual(rt.initializes,0)
  x.apply('a','enter','r1');self.assertEqual(rt.initializes,1);x.apply('a','enter','r2');self.assertEqual(rt.initializes,1)
 def test_failed_initialization_is_visible_and_retryable(self):
  rt=Runtime();rt.init_failure=True;t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{'a':{'existing':False}},2,rt)
  with self.assertRaises(RuntimeError):x.apply('a','enter','r1')
  self.assertEqual(x.apply('a','status',None)['initialization'],'FAILED');self.assertFalse(rt.running)
  rt.init_failure=False;x.apply('a','enter','r2');self.assertEqual(rt.initializes,2)
 def test_three_spaces_two_slots_queue_deduplicate_cancel(self):
  rt=MultiRuntime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'abc'},2,rt,2,60)
  x.apply('a','enter','a1');x.apply('b','enter','b1');queued=x.apply('c','enter','c1');again=x.apply('c','enter','c1');self.assertEqual(queued['state'],'QUEUED');self.assertEqual(queued['queuePosition'],1);self.assertTrue(again['deduplicated']);self.assertEqual(rt.starts,['a','b'])
  cancelled=x.apply('c','cancel','cx');self.assertEqual(cancelled['state'],'STOPPED');self.assertEqual(rt.starts,['a','b'])
 def test_stopping_one_space_promotes_one_waiter(self):
  rt=MultiRuntime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'abc'},2,rt,2,60)
  x.apply('a','enter','a1');x.apply('b','enter','b1');x.apply('c','enter','c1');x.apply('a','stop','a2');self.assertEqual(x.apply('c','status',None)['state'],'READY');self.assertEqual(rt.starts,['a','b','c']);self.assertFalse(rt.running['a'])
 def test_queue_is_bounded_and_expired_entry_does_not_start(self):
  rt=MultiRuntime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'abc'},1,rt,1,.01)
  x.apply('a','enter','a1');self.assertEqual(x.apply('b','enter','b1')['state'],'QUEUED')
  with self.assertRaisesRegex(RuntimeError,'queue is full'):x.apply('c','enter','c1')
  time.sleep(.02);self.assertEqual(x.apply('b','status',None)['state'],'STOPPED');x.apply('a','stop','a2');self.assertEqual(rt.starts,['a'])
 def test_partial_failed_start_holds_slot_and_cancel_cannot_release_it(self):
  class Broken(MultiRuntime):
   def start(self,space):self.starts.append(space);self.running[space]=True;raise RuntimeError('health boundary failed')
  rt=Broken();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'ab'},1,rt,2,60)
  with self.assertRaisesRegex(RuntimeError,'health boundary failed'):x.apply('a','enter','a1')
  self.assertEqual(x.apply('a','status',None)['state'],'UNKNOWN')
  self.assertEqual(x.apply('b','enter','b1')['state'],'QUEUED');x.apply('a','cancel','a-cancel');self.assertTrue(rt.running['a']);self.assertEqual(x.apply('b','status',None)['state'],'QUEUED')
 def test_concurrent_duplicate_enter_starts_one_generation(self):
  class Slow(Runtime):
   def start(self,space):self.starts+=1;time.sleep(.03);self.running=True
  rt=Slow();x=self.manager(rt);results=[]
  def enter():results.append(x.apply('a','enter','same'))
  threads=[threading.Thread(target=enter) for _ in range(2)]
  for thread in threads:thread.start()
  for thread in threads:thread.join()
  self.assertEqual(rt.starts,1);self.assertEqual({r['generation'] for r in results},{1});self.assertEqual(sum(bool(r.get('deduplicated')) for r in results),1)
 def test_enter_idempotent_one_generation(self):
  rt=Runtime();x=self.manager(rt);a=x.apply('a','enter','r1');b=x.apply('a','enter','r1');self.assertEqual(rt.starts,1);self.assertEqual(a['generation'],b['generation']);self.assertEqual(b['state'],'READY')
 def test_busy_stop_restores_ready_without_signal(self):
  rt=Runtime();x=self.manager(rt);x.apply('a','enter','r1');rt.busy=True;r=x.apply('a','stop','s1');self.assertEqual(r['state'],'READY');self.assertEqual(r['blockers'],['native-task']);self.assertEqual(rt.stops,0);self.assertFalse(rt.drained)
 def test_safe_stop_drains_rechecks_and_never_forces(self):
  rt=Runtime();x=self.manager(rt);x.apply('a','enter','r1');r=x.apply('a','stop','s1');self.assertEqual(r['state'],'STOPPED');self.assertEqual(rt.stops,1);self.assertFalse(r['forced'])
 def test_activity_only_renews_ready_and_status_does_not(self):
  rt=Runtime();x=self.manager(rt);x.apply('a','activity');self.assertIsNone(x.apply('a','status')['lastActivityAt']);x.apply('a','enter','r1');before=x.apply('a','status')['lastActivityAt'];time.sleep(.01);x.apply('a','status');self.assertEqual(x.apply('a','status')['lastActivityAt'],before);x.apply('a','activity');self.assertGreater(x.apply('a','status')['lastActivityAt'],before)
 def test_idle_sweep_stops_managed_preview_but_busy_work_blocks(self):
  rt=Runtime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{'a':{}},1,rt,idle_seconds=.01);x.apply('a','enter','r1');time.sleep(.02);rt.busy=True;self.assertEqual(x.sweep(),[]);self.assertTrue(rt.running);self.assertEqual(rt.preview_stops,0);rt.busy=False;self.assertEqual(x.sweep(),['a']);self.assertEqual(rt.preview_stops,1);self.assertFalse(rt.running)
 def test_recovery_requires_queued_confirmation_and_delays_ready_reaping(self):
  rt=MultiRuntime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'ab'},1,rt,idle_seconds=.01);x.apply('a','enter','a1');x.apply('b','enter','b1');x.recover();self.assertEqual(x.apply('b','status')['state'],'STOPPED');self.assertIn('confirmation',x.apply('b','status')['lastError']);self.assertEqual(x.sweep(),[]);self.assertTrue(rt.running['a'])
 def test_storage_refusal_never_initializes_or_marks_ready(self):
  rt=Runtime();rt.capacity_ok=False;t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{'a':{'existing':False}},1,rt)
  with self.assertRaisesRegex(RuntimeError,'Storage admission refused'):x.apply('a','enter','r1')
  row=x.apply('a','status');self.assertEqual(row['state'],'STOPPED');self.assertEqual(row['initialization'],'PENDING');self.assertEqual(rt.initializes,0)
 def test_interrupted_stop_with_members_is_unknown(self):
  rt=Runtime();x=self.manager(rt);x.apply('a','enter','r1');doc=x._read();doc['spaces']['a']['state']='STOPPING';x._write(doc);x.recover();self.assertEqual(x.apply('a','status')['state'],'UNKNOWN')
 def test_recovery_grace_prevents_stale_clock_immediate_stop(self):
  rt=Runtime();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{'a':{}},1,rt,idle_seconds=10);x.apply('a','enter','r1');doc=x._read();doc['spaces']['a']['lastActivityAt']=1;doc['spaces']['a']['autoStopNotBefore']=1;x._write(doc);x.recover();self.assertEqual(x.sweep(),[]);self.assertTrue(rt.running)
 def test_capacity_is_rechecked_inside_the_admission_lock(self):
  class OneStart(MultiRuntime):
   def capacity(self,space):return {'safe':len(self.starts)<1,'blockers':[] if len(self.starts)<1 else ['insufficient-free-space']}
  rt=OneStart();t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);x=m.LifecycleManager(Path(t.name)/'state.json',{n:{} for n in 'ab'},2,rt);errors=[]
  def enter(n):
   try:x.apply(n,'enter',n+'1')
   except RuntimeError as e:errors.append(str(e))
  threads=[threading.Thread(target=enter,args=(n,)) for n in 'ab']
  for thread in threads:thread.start()
  for thread in threads:thread.join()
  self.assertEqual(len(rt.starts),1);self.assertEqual(len(errors),1);self.assertIn('Storage admission refused',errors[0]);self.assertEqual(sorted(x.apply(n,'status')['state'] for n in 'ab'),['READY','STOPPED'])
if __name__=='__main__':unittest.main(verbosity=2)
