import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LifecycleClient} from '../src/lifecycle-client.ts';

test('client sends only fixed identity, action, and bounded request id over unix socket',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lifecycle-client-'));const socket=join(dir,'helper.sock');let seen;
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{seen={path:req.url,body:JSON.parse(body)};res.setHeader('content-type','application/json');res.end(JSON.stringify({state:'STOPPED',generation:2}));});});
 await new Promise(ok=>server.listen(socket,ok));
 try{
  const client=new LifecycleClient(socket);
  assert.deepEqual(await client.apply('engineer-b','status'),{state:'STOPPED',generation:2});
  assert.deepEqual(seen,{path:'/lifecycle',body:{space:'engineer-b',action:'status'}});
  assert.deepEqual(await client.apply('engineer-b','activity'),{state:'STOPPED',generation:2});
  assert.deepEqual(seen,{path:'/lifecycle',body:{space:'engineer-b',action:'activity'}});
  await assert.rejects(()=>client.apply('engineer-b','activity','x'),/Activity takes no request/);
  await assert.rejects(()=>client.apply('../admin','enter','x'),/Invalid space/);
  await assert.rejects(()=>client.apply('engineer-b','enter','x'.repeat(97)),/Invalid request/);
 }finally{await new Promise(ok=>server.close(ok));rmSync(dir,{recursive:true,force:true});}
});
