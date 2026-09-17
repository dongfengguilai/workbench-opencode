// Run after the visible browser actually logs out, logs in and reopens the session.
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const before=JSON.parse(readFileSync('evidence/web-egress-pre-relogin.json'));
const cfg=JSON.parse(readFileSync('runtime/platform.json'));
const ca=readFileSync('runtime/tls.crt');
const request=(route,{method='GET',body,cookie}={})=>new Promise((resolve,reject)=>{
 const req=https.request(cfg.origin+route,{method,ca,rejectUnauthorized:true,headers:{Origin:cfg.origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})}},res=>{
  let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));res.on('error',reject);
 });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});
try{
 const login=await request('/api/auth/login',{method:'POST',body:{username:'admin',password:cfg.users.admin.password}});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0];
 const response=await request('/session/'+before.session+'/message',{cookie});assert.equal(response.status,200);const messages=JSON.parse(response.body);
 assert.deepEqual(messages.map(m=>m.info.id),before.messageIds);assert.equal(createHash('sha256').update(JSON.stringify(messages)).digest('hex'),before.messagesSha256);
 for(const [name,hash] of Object.entries(before.files))assert.equal(createHash('sha256').update(readFileSync('runtime/'+name)).digest('hex'),hash,name);
 await request('/api/auth/logout',{method:'POST',cookie});
 writeFileSync('evidence/web-egress-relogin-result.json',JSON.stringify({status:'PASS',session:before.session,messageIds:before.messageIds,messagesSha256:before.messagesSha256,filesChecked:Object.keys(before.files).length,visibleBrowserEvidence:'web-egress-browser-reentered.txt',outcome:'Same native messages including completed real webfetch and same project files; no task resubmission'},null,2)+'\n');console.log('PASS same native messages and '+Object.keys(before.files).length+' file hashes after visible browser logout/login');
}catch(e){writeFileSync('evidence/web-egress-relogin-result.json',JSON.stringify({status:'FAIL',error:e.message},null,2)+'\n');throw e;}
