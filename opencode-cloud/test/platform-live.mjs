import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync,writeFileSync } from 'node:fs';
const cfg=JSON.parse(readFileSync('runtime/platform.json','utf8'));
function request(path,method='GET',body,cookie,origin=cfg.origin){return new Promise((resolve,reject)=>{const req=https.request(cfg.origin+path,{method,rejectUnauthorized:false,headers:{...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
const results=[];
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
let a,b;
try{
 await check('anonymous native read denied',async()=>assert.equal((await request('/session')).status,401));
 await check('bad local password rejected',async()=>assert.equal((await request('/api/auth/login','POST',{username:'admin',password:'wrong'})).status,401));
 await check('actual local admin login',async()=>{const r=await request('/api/auth/login','POST',{username:'admin',password:cfg.users.admin.password});assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/HttpOnly.*Secure/);a=r.headers['set-cookie'][0].split(';')[0];});
 await check('identity bound ready environment',async()=>{const r=await request('/__platform/me','GET',undefined,a);assert.equal(r.status,200);assert.equal(JSON.parse(r.body).user_id,'admin');assert.equal(JSON.parse(r.body).ready,true);});
 await check('fixed model and management API boundaries',async()=>{assert.equal((await request('/config','PATCH',{model:'other'},a)).status,403);assert.equal((await request('/mcp','POST',{name:'unsafe',config:{}},a)).status,403);assert.equal((await request('/session/ses_invalid/prompt_async','POST',{parts:[],system:'override'},a)).status,403);assert.equal((await request('/file/content?path=/etc/passwd','GET',undefined,a)).status,403);assert.equal((await request('/session?directory=/state','GET',undefined,a)).status,403);});
 await check('same-origin write boundary',async()=>assert.equal((await request('/session','POST',{},a,'https://other.invalid')).status,403));
 await check('native config does not reveal instance token',async()=>{const r=await request('/config','GET',undefined,a);assert.equal(r.status,200);const c=JSON.parse(r.body);assert.equal(c.model,'approved/gpt-5.6-luna');assert.ok(!r.body.includes('apiKey'));assert.ok(!r.body.includes(cfg.users.admin.nativePassword));});
 await check('second actual local identity binds independently',async()=>{const r=await request('/api/auth/login','POST',{username:'trial-b',password:cfg.users['trial-b'].password});assert.equal(r.status,200);b=r.headers['set-cookie'][0].split(';')[0];const me=await request('/__platform/me','GET',undefined,b);assert.equal(JSON.parse(me.body).user_id,'trial-b');});
 await check('logout revokes subsequent reads and download',async()=>{assert.equal((await request('/api/auth/logout','POST',undefined,a)).status,204);assert.equal((await request('/session','GET',undefined,a)).status,401);assert.equal((await request('/__platform/download','GET',undefined,a)).status,401);});
 writeFileSync('evidence/platform-live-result.json',JSON.stringify({kind:'real_local_accounts_real_containers',tls:'self-signed trial certificate; verification disabled only in this test',results},null,2)+'\n');
}catch(e){results.push({status:'FAIL',error:e.message});writeFileSync('evidence/platform-live-result.json',JSON.stringify({results},null,2));throw e;}
