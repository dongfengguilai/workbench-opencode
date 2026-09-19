import test from 'node:test';
import assert from 'node:assert/strict';
import {LifecycleBarrier} from '../src/lifecycle-barrier.ts';

test('draining rejects mutable traffic while keeping observation and preview stop available',()=>{
 const barrier=new LifecycleBarrier();
 assert.equal(barrier.allows('POST','/session/ses_x/message'),true);
 barrier.drain();
 assert.equal(barrier.allows('GET','/session/status'),true);
 assert.equal(barrier.allows('GET','/question'),true);
 assert.equal(barrier.allows('POST','/__preview-control/stop'),true);
 assert.equal(barrier.allows('POST','/session/ses_x/message'),false);
 assert.equal(barrier.allows('POST','/pty'),false);
 assert.equal(barrier.allows('POST','/permission/answer'),false);
 barrier.resume();
 assert.equal(barrier.allows('POST','/session/ses_x/message'),true);
});

test('drain closes every registered writable connection',()=>{
 const barrier=new LifecycleBarrier();let a=0,b=0;
 const unregister=barrier.register(()=>a++);barrier.register(()=>b++);unregister();
 barrier.drain();
 assert.equal(a,0);assert.equal(b,1);
 barrier.register(()=>a++);
 assert.equal(a,1,'connections registered while draining close immediately');
});
