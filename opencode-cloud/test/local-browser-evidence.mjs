// Operator API corroboration of the visible-browser demonstration. No UI automation.
import {readFileSync,writeFileSync} from 'node:fs';
import https from 'node:https';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const runtime=new URL('../runtime/',import.meta.url), evidence=new URL('../evidence/',import.meta.url);
const cfg=JSON.parse(readFileSync(new URL('platform.json',runtime),'utf8'));
const local='http://127.0.0.1:8444',sid='ses_f52403502ffeaGvtr8uvfQZ8W5';
const data=JSON.stringify({username:'admin',password:cfg.users.admin.password});
const mode=process.argv[2];assert.ok(['before','after'].includes(mode));
const secureLogin=await new Promise((resolve,reject)=>{
 const req=https.request(cfg.origin+'/api/auth/login',{method:'POST',ca:readFileSync(new URL('tls.crt',runtime)),headers:{Origin:cfg.origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
  res.resume();res.on('end',()=>resolve({status:res.statusCode,cookie:res.headers['set-cookie']?.[0]}));
 });req.on('error',reject);req.end(data);
});
assert.equal(secureLogin.status,200);assert.match(secureLogin.cookie,/; Secure;/);
// Revoke this independent verification login immediately; browser login is untouched.
await new Promise((resolve,reject)=>{
 const req=https.request(cfg.origin+'/api/auth/logout',{method:'POST',ca:readFileSync(new URL('tls.crt',runtime)),headers:{Origin:cfg.origin,Cookie:secureLogin.cookie.split(';')[0]}},res=>{res.resume();res.on('end',resolve);});req.on('error',reject);req.end();
});
const login=await fetch(local+'/api/auth/login',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:data});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.doesNotMatch(cookie,/;\s*Secure(?:;|$)/i);
const headers={Cookie:cookie.split(';')[0]};
try {
 const response=await fetch(local+'/session/'+sid+'/message',{headers});assert.equal(response.status,200);
 const messages=await response.json();writeFileSync(new URL('local-browser-native-messages.json',evidence),JSON.stringify(messages,null,2)+'\n');
 const hashes=Object.fromEntries(['opencode-cloud/src/demo-text.mjs','opencode-cloud/test/demo-text.test.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(new URL('admin-project/'+p,runtime))).digest('hex')]));
 const snapshot={session:sid,messageIDs:messages.map(m=>m.info.id),hashes};
 if(mode==='before'){
  writeFileSync(new URL('local-browser-demo-before.json',evidence),JSON.stringify(snapshot,null,2)+'\n');
  const manifest=await fetch(local+'/__platform/changes',{headers});assert.equal(manifest.status,200);writeFileSync(new URL('local-browser-manifest.json',evidence),JSON.stringify(await manifest.json(),null,2)+'\n');
  const patch=await fetch(local+'/__platform/download',{headers});assert.equal(patch.status,200);assert.match(patch.headers.get('content-disposition'),/workbench-opencode.patch/);
  const bytes=Buffer.from(await patch.arrayBuffer());writeFileSync(new URL('local-browser-demo.patch',evidence),bytes);
  const text=bytes.toString();assert.match(text,/demo-text.mjs/);assert.match(text,/demo-text.test.mjs/);
  assert.ok(messages.some(m=>m.parts.some(p=>p.type==='tool'&&p.tool==='bash'&&p.state.status==='completed'&&p.state.input.command==='node --test opencode-cloud/test/demo-text.test.mjs'&&/pass 4/.test(p.state.output))));
  const stream=await fetch(local+'/event',{headers,signal:AbortSignal.timeout(5000)});assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const reader=stream.body.getReader();const first=await reader.read();assert.match(Buffer.from(first.value).toString(),/data:/);await reader.cancel();
  writeFileSync(new URL('local-browser-api-result.json',evidence),JSON.stringify({status:'PASS',httpsCookieSecure:true,localCookieHttpOnly:true,localCookieSameSite:'Lax',localCookieSecure:false,realSSE:true,downloadStatus:200,downloadSHA256:createHash('sha256').update(bytes).digest('hex'),session:sid},null,2)+'\n');
 }else{
  const before=JSON.parse(readFileSync(new URL('local-browser-demo-before.json',evidence),'utf8'));assert.deepEqual(snapshot,before);
  writeFileSync(new URL('local-browser-persistence-result.json',evidence),JSON.stringify({status:'PASS',...snapshot},null,2)+'\n');
 }
} finally{
 const logout=await fetch(local+'/api/auth/logout',{method:'POST',headers:{...headers,Origin:local}});assert.equal(logout.status,204);
 assert.equal((await fetch(local+'/__platform/me',{headers})).status,401);
}
console.log('Real platform evidence '+mode+': PASS (no credentials printed)');
