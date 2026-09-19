import http from 'node:http';
import {timingSafeEqual,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {lookup} from 'node:dns/promises';

type Scope={token:string,dailyLimits:Record<string,number>,models:string[],sourceHosts?:string[]};
type Model={backend:string,upstream:string,masterEnv:string};
type Config={totalConcurrency:number,userConcurrency:number,maxQueue:number,waitMs:number,backends:Record<string,{concurrency:number}>,models:Record<string,Model>,scopes:Record<string,Scope>};
const configPath=process.env.SHARED_MODEL_CONFIG||'/trusted/model-scopes.json';
const stateDir=process.env.SHARED_MODEL_STATE||'/gateway-state';
const config:Config=JSON.parse(readFileSync(configPath,'utf8'));
if(!Number.isSafeInteger(config.totalConcurrency)||config.totalConcurrency<1||!Number.isSafeInteger(config.userConcurrency)||config.userConcurrency<1||!Number.isSafeInteger(config.maxQueue)||config.maxQueue<0||!Number.isSafeInteger(config.waitMs)||config.waitMs<1)throw Error('Invalid shared gateway limits');
for(const [name,scope] of Object.entries(config.scopes)){
 if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)||!scope.token||!Array.isArray(scope.models)||!scope.models.length)throw Error('Invalid fixed model scope');
 if(scope.sourceHosts&&(!scope.sourceHosts.length||scope.sourceHosts.some(x=>!/^[a-z0-9][a-z0-9-]{0,62}$/.test(x))))throw Error('Invalid fixed scope source');
 for(const model of scope.models)if(!Number.isSafeInteger(scope.dailyLimits?.[model])||scope.dailyLimits[model]<1)throw Error('Invalid fixed model budget');
}
const targets=new Map<string,{backend:string,upstream:URL,master:string}>();
for(const [id,model] of Object.entries(config.models)){
 const upstream=new URL(model.upstream);const master=/^[A-Z][A-Z0-9_]+$/.test(model.masterEnv)?process.env[model.masterEnv]:undefined;
 if(!config.backends[model.backend]||upstream.protocol!=='http:'||upstream.pathname!=='/'||upstream.search||upstream.username||upstream.password||!master)throw Error('Invalid trusted model route');
 targets.set(id,{backend:model.backend,upstream,master});
}
mkdirSync(stateDir,{recursive:true});const budgetFile=path.join(stateDir,'budgets.json'),dispatchFile=path.join(stateDir,'dispatches.json');
function atomic(file:string,value:unknown){const temp=file+'.tmp';writeFileSync(temp,JSON.stringify(value),{mode:0o600});renameSync(temp,file);}
function load<T>(file:string,fallback:T):T{try{return JSON.parse(readFileSync(file,'utf8'));}catch(e:any){if(e.code==='ENOENT')return fallback;throw e;}}
let dispatches=load<any[]>(dispatchFile,[]);if(!Array.isArray(dispatches))throw Error('Invalid dispatch state');
const suspended=new Set(dispatches.map(x=>x.backend));
let activeTotal=0;const activeBackend=new Map<string,number>(),activeScope=new Map<string,number>();
type Waiter={scope:string,backend:string,resolve:(v:Lease|undefined)=>void,timer:NodeJS.Timeout,closed:boolean};const queue:Waiter[]=[];
type Lease={release:()=>void};
function audit(event:string,data:Record<string,unknown>={}){console.log(JSON.stringify({time:new Date().toISOString(),event,...data}));}
function available(scope:string,backend:string){return !suspended.has(backend)&&activeTotal<config.totalConcurrency&&(activeBackend.get(backend)||0)<config.backends[backend].concurrency&&(activeScope.get(scope)||0)<config.userConcurrency;}
function grant(scope:string,backend:string):Lease{activeTotal++;activeBackend.set(backend,(activeBackend.get(backend)||0)+1);activeScope.set(scope,(activeScope.get(scope)||0)+1);let done=false;return{release(){if(done)return;done=true;activeTotal--;activeBackend.set(backend,(activeBackend.get(backend)||1)-1);activeScope.set(scope,(activeScope.get(scope)||1)-1);drain();}};}
function drain(){for(let i=0;i<queue.length;){const q=queue[i];if(q.closed){queue.splice(i,1);continue;}if(!available(q.scope,q.backend)){i++;continue;}queue.splice(i,1);clearTimeout(q.timer);q.resolve(grant(q.scope,q.backend));}}
function acquire(scope:string,backend:string,req:http.IncomingMessage,res:http.ServerResponse):Promise<Lease|undefined>{
 if(suspended.has(backend))return Promise.resolve(undefined);if(available(scope,backend))return Promise.resolve(grant(scope,backend));
 if(queue.length>=config.maxQueue||queue.some(x=>x.scope===scope&&!x.closed))return Promise.resolve(undefined);
 return new Promise(resolve=>{let waiter:Waiter;const cancel=()=>{if(!waiter||waiter.closed)return;waiter.closed=true;clearTimeout(waiter.timer);const index=queue.indexOf(waiter);if(index>=0)queue.splice(index,1);resolve(undefined);drain();};waiter={scope,backend,resolve,timer:setTimeout(cancel,config.waitMs),closed:false};queue.push(waiter);req.once('aborted',cancel);res.once('close',()=>{if(!res.writableEnded)cancel();});});
}
const sourceCache=new Map<string,{expires:number,addresses:Set<string>}>();
function normalized(address:string){return address.startsWith('::ffff:')?address.slice(7):address;}
async function approvedSource(name:string,scope:Scope,address:string){
 if(!scope.sourceHosts)return true;
 let cached=sourceCache.get(name);
 if(!cached||cached.expires<Date.now()){
  let values;
  try{values=await Promise.all(scope.sourceHosts.map(host=>lookup(host,{all:true,verbatim:true})));}catch{return false;}
  cached={expires:Date.now()+2000,addresses:new Set(values.flat().map(x=>normalized(x.address)))};sourceCache.set(name,cached);
 }
 return cached.addresses.has(normalized(address));
}
async function authenticate(value:string|undefined,address:string){const received=Buffer.from(value||'');for(const [name,scope] of Object.entries(config.scopes)){const expected=Buffer.from('Bearer '+scope.token);if(received.length===expected.length&&timingSafeEqual(received,expected))return await approvedSource(name,scope,address)?{name,scope}:undefined;}}
function reserve(scopeName:string,model:string){const day=new Date().toISOString().slice(0,10);let state=load<any>(budgetFile,{day,counts:{}});if(state.day!==day)state={day,counts:{}};if(!state.counts||typeof state.counts!=='object')throw Error('Invalid budget state');const key=scopeName+':'+model,count=state.counts[key]||0;if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid budget state');if(count>=config.scopes[scopeName].dailyLimits[model])return false;state.counts[key]=count+1;atomic(budgetFile,state);return true;}
function reply(res:http.ServerResponse,code:number,message:string){if(res.headersSent||res.destroyed)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{message}}));}
function record(entry:any){dispatches.push(entry);atomic(dispatchFile,dispatches);}
function complete(id:string){dispatches=dispatches.filter(x=>x.id!==id);atomic(dispatchFile,dispatches);}
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'&&req.method==='GET'){res.end('ok');return;}
 const identity=await authenticate(req.headers.authorization,req.socket.remoteAddress||'');if(!identity){reply(res,401,'Unauthorized');return;}
 if(req.url==='/v1/models'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:identity.scope.models.map(id=>({id,object:'model',owned_by:'approved-shared-gateway'}))}));return;}
 if(req.url==='/v1/workbench/status'&&req.method==='GET'){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({queued:queue.filter(x=>!x.closed&&x.scope===identity.name).length,active:activeScope.get(identity.name)||0,unresolved:dispatches.filter(x=>x.scope===identity.name).length}));return;
 }
 if(req.method!=='POST'||!['/v1/chat/completions','/v1/responses'].includes(req.url||'')){reply(res,404,'Unsupported route');return;}
 let size=0,chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024){reply(res,413,'Request too large');return;}chunks.push(chunk);}
 let data:any;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{reply(res,400,'Invalid JSON');return;}
 const target=typeof data.model==='string'&&identity.scope.models.includes(data.model)?targets.get(data.model):undefined;if(!target){reply(res,403,'Model is not approved for this identity');return;}
 if(data.model==='Qwen3.6-35B-A3B'&&req.url==='/v1/responses'){reply(res,404,'Qwen supports the approved chat completions route only');return;}
 for(const name of ['max_tokens','max_completion_tokens','max_output_tokens'])if(data[name]!==undefined&&(!Number.isSafeInteger(data[name])||data[name]<1||data[name]>16000)){reply(res,403,'Output limit exceeds approved 16000 token cap');return;}
 const lease=await acquire(identity.name,target.backend,req,res);if(!lease){audit('admission-rejected',{scope:identity.name,backend:target.backend,reason:suspended.has(target.backend)?'unresolved':'capacity'});reply(res,suspended.has(target.backend)?424:409,suspended.has(target.backend)?'Model backend has an unresolved dispatched request; maintainer review required':'Model capacity wait ended; no automatic retry');return;}
 if(req.aborted||res.destroyed){lease.release();return;}
 try{if(!reserve(identity.name,data.model)){lease.release();audit('budget-rejected',{scope:identity.name,model:data.model});reply(res,403,'Identity model daily request budget exhausted; no automatic retry');return;}}catch{lease.release();reply(res,424,'Model budget state unavailable; request not forwarded');return;}
 if(req.url==='/v1/responses')data.max_output_tokens=16000;else if(data.max_completion_tokens===undefined)data.max_tokens=data.max_tokens||16000;const body=Buffer.from(JSON.stringify(data));const id=randomBytes(16).toString('hex');record({id,scope:identity.name,backend:target.backend,model:data.model,dispatchedAt:new Date().toISOString()});let normal=false,uncertainRecorded=false;
 audit('dispatched',{id,scope:identity.name,backend:target.backend,model:data.model});
 const upstream=http.request(new URL(req.url!,target.upstream),{method:'POST',headers:{Authorization:'Bearer '+target.master,'Content-Type':'application/json','Content-Length':body.length}},response=>{
  if((response.statusCode||502)>=500||response.statusCode===429){audit('upstream-rejected',{id,scope:identity.name,backend:target.backend,status:response.statusCode||502});response.resume();reply(res,424,'Approved model unavailable; no automatic retry');}
  else{res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/json','Cache-Control':'no-store','X-Accel-Buffering':'no'});response.pipe(res);}
  response.once('end',()=>{normal=true;complete(id);lease.release();audit('completed',{id,scope:identity.name,backend:target.backend,status:response.statusCode||502});});response.once('error',()=>res.destroy());
 });
 const uncertain=()=>{if(normal||uncertainRecorded)return;uncertainRecorded=true;suspended.add(target.backend);audit('uncertain',{id,scope:identity.name,backend:target.backend});try{atomic(dispatchFile,dispatches);}catch{}};
 req.once('aborted',()=>{upstream.destroy();uncertain();});res.once('close',()=>{if(!res.writableEnded){upstream.destroy();uncertain();}});upstream.once('error',()=>{uncertain();reply(res,424,'Approved model unavailable; dispatch outcome requires maintainer review');});upstream.end(body);
});
server.requestTimeout=30000;server.listen(Number(process.env.PORT||8318),'0.0.0.0',()=>console.log('shared model gateway listening'));
