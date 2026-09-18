// Isolated HTTP/authentication fixture. Seeded engineer tokens are NOT NetID login evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,scryptSync,randomBytes} from 'node:crypto';
import https from 'node:https';
test('same-IP sessions, logout and preview tickets remain bound to their entry',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'wb-ip-auth-'));let container;
 try{
  for(const directory of ['trusted','public','state'])mkdirSync(join(temp,directory));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=platform','-addext','subjectAltName=DNS:platform','-keyout',join(temp,'trusted/tls.key'),'-out',join(temp,'trusted/tls.crt')],{stdio:'ignore'});
  const origins={mj33kd:{workbench:'https://10.243.117.57:8443',preview:'https://10.243.117.57:8445'},admin:{workbench:'https://10.243.117.57:8447',preview:'https://10.243.117.57:8449'}};
  const cookieNames={mj33kd:{session:'agent_session',preview:'workbench_preview'},admin:{session:'agent_session_admin',preview:'workbench_preview_admin'}};
  const secret='isolated-admin-fixture',salt=randomBytes(16),key=scryptSync(secret,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const cfg={origin:'https://platform:8443',sessionTtl:3600,previewRelayKey:'isolated-relay-fixture',auth:{mode:'mixed',baseUrl:'http://unused.invalid'},publicOrigins:origins,cookieNames,users:{mj33kd:{displayName:'Engineer fixture',enabled:true,authProvider:'netid',role:'engineer',environment:'http://unused.invalid',nativePassword:'fixture'},admin:{displayName:'Admin fixture',enabled:true,authProvider:'local-admin',role:'admin',passwordHash:'scrypt$32768$8$1$'+salt.toString('hex')+'$'+key.toString('hex'),environment:'http://unused.invalid',nativePassword:'fixture'}}};
  writeFileSync(join(temp,'trusted/platform.json'),JSON.stringify(cfg));
  writeFileSync(join(temp,'public/login.html'),'<html>fixture</html>');
  writeFileSync(join(temp,'public/workbench-guard.js'),'// authenticated fixture asset');
  const engineerToken=randomBytes(32).toString('base64url');const digest=token=>createHash('sha256').update(token).digest('hex');
  writeFileSync(join(temp,'state/sessions.json'),JSON.stringify({[digest(engineerToken)]:{user:'mj33kd',expires:Date.now()+3600000}}));
  const root=resolve(import.meta.dirname,'..');
  container=execFileSync('docker',['run','-d','--user',`${process.getuid()}:${process.getgid()}`,'--network','bridge','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','-p','127.0.0.1::8443','--mount',`type=bind,src=${root}/src,dst=/app,readonly`,'--mount',`type=bind,src=${temp}/trusted,dst=/trusted,readonly`,'--mount',`type=bind,src=${temp}/public,dst=/public,readonly`,'--mount',`type=bind,src=${temp}/state,dst=/platform-state`,'node:22.19.0-bookworm-slim','node','--experimental-transform-types','/app/platform.ts'],{encoding:'utf8'}).trim();
  const port=Number(execFileSync('docker',['inspect','--format','{{(index (index .NetworkSettings.Ports "8443/tcp") 0).HostPort}}',container],{encoding:'utf8'}).trim());
  const ca=readFileSync(join(temp,'trusted/tls.crt'));
  const request=(path,entry,{cookie='',method='GET',body,preview=false}={})=>new Promise((resolve,reject)=>{
   const headers={Host:'platform:8443',Origin:cfg.origin,Cookie:cookie,...(preview?{'x-workbench-preview-relay':cfg.previewRelayKey,'x-workbench-preview-origin':entry}:{'x-workbench-browser-relay':cfg.previewRelayKey,'x-workbench-browser-origin':entry})};
   if(body)headers['Content-Type']='application/json';
   const req=https.request({hostname:'127.0.0.1',servername:'platform',port,path,ca,method,headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  for(let attempt=0;;attempt++){try{await request('/__platform/login-info',origins.admin.workbench);break;}catch(error){if(attempt===30){console.error(execFileSync('docker',['logs',container],{encoding:'utf8'}));throw error;}await new Promise(done=>setTimeout(done,100));}}
  const login=await request('/api/auth/login',origins.admin.workbench,{method:'POST',body:{username:'admin',password:secret}});
  assert.equal(login.status,200);const adminCookie=login.headers['set-cookie'][0].split(';')[0];assert.match(adminCookie,/^agent_session_admin=/);assert.match(login.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);assert.doesNotMatch(login.headers['set-cookie'][0],/Domain=/);
  const both='agent_session='+engineerToken+'; '+adminCookie;
  for(const pair of Object.values(origins))assert.equal((await request('/__platform/workbench-guard.js',pair.workbench,{cookie:both})).status,200);
  assert.equal((await request('/__platform/source.zip',origins.admin.workbench,{cookie:'agent_session_admin='+engineerToken})).status,401);
  assert.equal((await request('/api/auth/login',origins.mj33kd.workbench,{method:'POST',body:{username:'admin',password:secret}})).status,403);
  assert.equal((await request('/api/auth/logout',origins.admin.workbench,{method:'POST',cookie:'agent_session_admin='+engineerToken})).status,204);
  assert.equal((await request('/__platform/workbench-guard.js',origins.mj33kd.workbench,{cookie:both})).status,200);
  const ticket=await request('/__platform/preview/ticket',origins.admin.workbench,{method:'POST',cookie:both});assert.equal(ticket.status,200);const url=new URL(JSON.parse(ticket.text).url);assert.equal(url.origin,origins.admin.preview);
  assert.equal((await request('/__preview'+url.pathname+url.search,origins.mj33kd.preview,{preview:true})).status,401);
  const claim=await request('/__preview'+url.pathname+url.search,origins.admin.preview,{preview:true});assert.equal(claim.status,303);assert.match(claim.headers['set-cookie'][0],/^workbench_preview_admin=/);
  const previewCookie=claim.headers['set-cookie'][0].split(';')[0];
  const logout=await request('/api/auth/logout',origins.admin.workbench,{method:'POST',cookie:both});assert.equal(logout.status,204);assert.match(logout.headers['set-cookie'][0],/^agent_session_admin=;/);
  assert.equal((await request('/__platform/workbench-guard.js',origins.admin.workbench,{cookie:both})).status,401);
  assert.equal((await request('/__platform/workbench-guard.js',origins.mj33kd.workbench,{cookie:both})).status,200);
  assert.equal((await request('/__preview/',origins.admin.preview,{preview:true,cookie:previewCookie})).status,401);
 }finally{if(container)execFileSync('docker',['rm','-f',container],{stdio:'ignore'});rmSync(temp,{recursive:true,force:true});}
});
