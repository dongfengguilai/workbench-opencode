import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function fixture(){
 const events=[],active={qwen:0,luna:0},maximum={qwen:0,luna:0};
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);const backend=req.headers.authorization==='Bearer master-qwen'?'qwen':'luna';active[backend]++;maximum[backend]=Math.max(maximum[backend],active[backend]);events.push({backend,model:data.model,authorization:req.headers.authorization});
  req.once('aborted',()=>events.push({backend,aborted:true}));await new Promise(r=>setTimeout(r,Number(data.fixtureDelay||20)));active[backend]--;if(!res.destroyed){res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'fixture',choices:[{message:{role:'assistant',content:'ok'}}]}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return{server,events,active,maximum,origin:`http://127.0.0.1:${server.address().port}`};
}
function config(origin,overrides={}){return{
 totalConcurrency:2,userConcurrency:1,maxQueue:2,waitMs:250,
 backends:{qwen:{concurrency:1},luna:{concurrency:2}},
 models:{'qwen-primary':{backend:'qwen',upstream:origin+'/',masterEnv:'FIXTURE_QWEN_KEY'},'qwen-alias':{backend:'qwen',upstream:origin+'/',masterEnv:'FIXTURE_QWEN_KEY'},luna:{backend:'luna',upstream:origin+'/',masterEnv:'FIXTURE_LUNA_KEY'}},
 scopes:{alpha:{token:'scope-alpha',models:['qwen-primary','qwen-alias','luna'],dailyLimits:{'qwen-primary':20,'qwen-alias':20,luna:2}},beta:{token:'scope-beta',models:['qwen-primary','qwen-alias','luna'],dailyLimits:{'qwen-primary':20,'qwen-alias':20,luna:20}}},...overrides};}
async function launch(dir,cfg){const port=await freePort(),file=join(dir,'config.json'),name='shared-gateway-test-'+process.pid+'-'+port;writeFileSync(file,JSON.stringify(cfg),{mode:0o600});const source=new URL('../src/shared-model-gateway.ts',import.meta.url).pathname;const child=spawn('docker',['run','--rm','--name',name,'--network','host','--user',`${process.getuid()}:${process.getgid()}`,'-v',`${source}:/app/shared-model-gateway.ts:ro`,'-v',`${dir}:/state`,'-e',`PORT=${port}`,'-e','SHARED_MODEL_CONFIG=/state/config.json','-e','SHARED_MODEL_STATE=/state','-e','FIXTURE_QWEN_KEY=master-qwen','-e','FIXTURE_LUNA_KEY=master-luna','node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90','node','--experimental-strip-types','/app/shared-model-gateway.ts'],{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr||'gateway start timeout')),5000);child.stdout.on('data',x=>{if(String(x).includes('listening')){clearTimeout(timer);resolve();}});child.once('exit',c=>reject(Error(`gateway exited ${c}: ${stderr}`)));});return{child,name,origin:`http://127.0.0.1:${port}`};}
async function stop(gateway){if(!gateway)return;const p=spawn('docker',['stop','-t','1',gateway.name],{stdio:'ignore'});await new Promise(r=>p.once('exit',r));if(gateway.child.exitCode===null)await Promise.race([new Promise(r=>gateway.child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);}
async function command(file,args){const p=spawn(file,args,{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);const code=await new Promise(r=>p.once('exit',r));return{code,out,err};}
async function call(origin,token,model,delay=20,signal){return fetch(origin+'/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'fixture'}],fixtureDelay:delay}),signal});}

test('shared limits merge aliases, isolate identities, bound queues, and persist per-model budgets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shared-gateway-')),up=await fixture();let gateway;
 try{
  gateway=await launch(dir,config(up.origin));
  assert.equal((await fetch(gateway.origin+'/v1/models')).status,401);
  const models=await fetch(gateway.origin+'/v1/models',{headers:{authorization:'Bearer scope-alpha'}});assert.equal(models.status,200);assert.deepEqual((await models.json()).data.map(x=>x.id),['qwen-primary','qwen-alias','luna']);
  const [a,b]=await Promise.all([call(gateway.origin,'scope-alpha','qwen-primary',130),call(gateway.origin,'scope-beta','qwen-alias',130)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(up.maximum.qwen,1,'aliases sharing a backend must share capacity');
  const before=Date.now();const [same1,same2]=await Promise.all([call(gateway.origin,'scope-alpha','qwen-primary',100),call(gateway.origin,'scope-alpha','luna',100)]);assert.equal(same1.status,200);assert.equal(same2.status,200);assert.ok(Date.now()-before>=180,'same identity must serialize at concurrency one');
  const [l1,l2]=await Promise.all([call(gateway.origin,'scope-alpha','luna',100),call(gateway.origin,'scope-beta','luna',100)]);assert.equal(l1.status,200);assert.equal(l2.status,200);assert.equal(up.maximum.luna,2);
  const exhausted=await call(gateway.origin,'scope-alpha','luna');assert.equal(exhausted.status,403,'local Luna allowance is per identity and model');
  const qwenStillWorks=await call(gateway.origin,'scope-alpha','qwen-primary');assert.equal(qwenStillWorks.status,200);
  assert.ok(up.events.every(x=>x.aborted||x.authorization===`Bearer master-${x.backend}`),'only trusted upstream credentials may be sent');
  await stop(gateway);gateway=await launch(dir,config(up.origin));assert.equal((await call(gateway.origin,'scope-alpha','luna')).status,403,'budget must survive gateway restart');
  const budget=JSON.parse(readFileSync(join(dir,'budgets.json'),'utf8'));assert.equal(budget.counts['alpha:luna'],2);assert.ok(budget.counts['alpha:qwen-primary']>0);
 }finally{if(gateway)await stop(gateway);await new Promise(r=>up.server.close(r));rmSync(dir,{recursive:true,force:true});}
});

test('queued cancellation is not dispatched and an uncertain dispatched request suspends its backend across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shared-gateway-')),up=await fixture();let gateway;
 try{
  gateway=await launch(dir,config(up.origin,{totalConcurrency:2,userConcurrency:1,maxQueue:1,waitMs:120}));
  const active=call(gateway.origin,'scope-alpha','qwen-primary',300);
  await new Promise(r=>setTimeout(r,40));
  const queuedController=new AbortController();const queued=call(gateway.origin,'scope-beta','qwen-alias',20,queuedController.signal).catch(e=>e);await new Promise(r=>setTimeout(r,30));queuedController.abort();await queued;
  const waitStarted=Date.now(),full=await call(gateway.origin,'scope-beta','qwen-alias');assert.equal(full.status,409);assert.ok(Date.now()-waitStarted>=100,'cancelled waiter must free the bounded queue slot for a new bounded wait');
  assert.equal((await active).status,200);await new Promise(r=>setTimeout(r,30));assert.equal(up.events.filter(x=>x.model==='qwen-alias').length,0,'cancelled/expired queued work must not reach upstream');
  const dispatchedController=new AbortController();const dispatched=call(gateway.origin,'scope-alpha','qwen-primary',1000,dispatchedController.signal).catch(e=>e);while(up.events.filter(x=>x.model==='qwen-primary').length<2)await new Promise(r=>setTimeout(r,10));dispatchedController.abort();await dispatched;await new Promise(r=>setTimeout(r,30));
  assert.equal((await call(gateway.origin,'scope-beta','qwen-alias')).status,424,'uncertain backend must reject new work');
  assert.equal((await call(gateway.origin,'scope-beta','luna')).status,200,'an unrelated backend remains usable');
  for(let i=0;i<20&&JSON.parse(readFileSync(join(dir,'dispatches.json'),'utf8')).length!==1;i++)await new Promise(r=>setTimeout(r,10));
  const unresolved=JSON.parse(readFileSync(join(dir,'dispatches.json'),'utf8'));assert.equal(unresolved.length,1);assert.equal(unresolved[0].backend,'qwen');
  await stop(gateway);gateway=await launch(dir,config(up.origin,{totalConcurrency:2,userConcurrency:1,maxQueue:1,waitMs:120}));
  assert.equal((await call(gateway.origin,'scope-beta','qwen-alias')).status,424,'unresolved dispatch survives restart');
  await stop(gateway);gateway=undefined;
  const reconcile=await command('python3',[new URL('../scripts/shared-gateway-reconcile.py',import.meta.url).pathname,'--state-dir',dir,'--confirm-ended',unresolved[0].id,'--gateway-stopped']);assert.equal(reconcile.code,0,reconcile.err);
  gateway=await launch(dir,config(up.origin,{totalConcurrency:2,userConcurrency:1,maxQueue:1,waitMs:120}));assert.equal((await call(gateway.origin,'scope-beta','qwen-alias')).status,200,'explicit stopped-gateway reconciliation restores admission');
 }finally{if(gateway)await stop(gateway);await new Promise(r=>up.server.close(r));rmSync(dir,{recursive:true,force:true});}
});

test('a valid bearer token is still rejected outside its registered execution source',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shared-gateway-')),up=await fixture();let gateway;
 try{
  const cfg=config(up.origin);cfg.scopes.alpha.sourceHosts=['source-that-does-not-exist'];
  gateway=await launch(dir,cfg);
  assert.equal((await fetch(gateway.origin+'/v1/models',{headers:{authorization:'Bearer scope-alpha'}})).status,401);
  assert.equal((await fetch(gateway.origin+'/health')).status,200,'a DNS miss must not terminate the shared gateway');
  assert.equal((await fetch(gateway.origin+'/v1/models',{headers:{authorization:'Bearer scope-beta'}})).status,200);
 }finally{if(gateway)await stop(gateway);await new Promise(r=>up.server.close(r));rmSync(dir,{recursive:true,force:true});}
});
