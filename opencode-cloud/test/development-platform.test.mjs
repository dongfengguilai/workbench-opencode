// Actual HTTPS API fixture, not the installed engineer or a real coding task.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,scryptSync,randomBytes} from 'node:crypto';
import https from 'node:https';

test('developer API selects local engineer and preserves the old administrator session',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'wb-dev-api-'));let container;
 const password='offline-https-fixture-password';
 const hash=()=>{const salt=randomBytes(16);return 'scrypt$32768$8$1$'+salt.toString('hex')+'$'+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');};
 const origin=name=>'http://workbench.u-'+createHash('sha256').update(name).digest('hex').slice(0,40)+'.localhost:8444';
 try{
  for(const dir of ['trusted','public','state'])mkdirSync(join(temp,dir));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=platform','-addext','subjectAltName=DNS:platform','-keyout',join(temp,'trusted/tls.key'),'-out',join(temp,'trusted/tls.crt')],{stdio:'ignore'});
  const cfg={origin:'https://platform:8443',sessionTtl:3600,previewRelayKey:'offline-fixture-relay-key',auth:{mode:'development'},users:{admin:{authProvider:'local-admin',role:'admin',passwordHash:hash(),enabled:true,displayName:'Admin fixture',nativePassword:'fixture',environment:'http://unused.invalid'},'engineer-b':{authProvider:'local-engineer',role:'engineer',passwordHash:hash(),enabled:true,displayName:'Engineer fixture',projectName:'learn',nativePassword:'fixture',environment:'http://unused.invalid'}}};
  writeFileSync(join(temp,'trusted/platform.json'),JSON.stringify(cfg));writeFileSync(join(temp,'public/login.html'),'<html id="login">fixture</html>');writeFileSync(join(temp,'public/workbench-guard.js'),'// authorized fixture');
  const adminToken=randomBytes(32).toString('base64url');
  writeFileSync(join(temp,'state/sessions.json'),JSON.stringify({[createHash('sha256').update(adminToken).digest('hex')]:{user:'admin',expires:Date.now()+3600000}}));
  const root=resolve(import.meta.dirname,'..');
  container=execFileSync('docker',['run','-d','--user',`${process.getuid()}:${process.getgid()}`,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','-p','127.0.0.1::8443','-e','WORKBENCH_AUTH_PROFILE=development','--mount',`type=bind,src=${root}/src,dst=/app,readonly`,'--mount',`type=bind,src=${temp}/trusted,dst=/trusted,readonly`,'--mount',`type=bind,src=${temp}/public,dst=/public,readonly`,'--mount',`type=bind,src=${temp}/state,dst=/platform-state`,'opencode-cloud/native:1.18.31-managed-v0','node','--experimental-transform-types','/app/platform.ts'],{encoding:'utf8'}).trim();
  const port=Number(execFileSync('docker',['inspect','--format','{{(index (index .NetworkSettings.Ports "8443/tcp") 0).HostPort}}',container],{encoding:'utf8'}).trim()),ca=readFileSync(join(temp,'trusted/tls.crt'));
  const request=(path,entry,{cookie='',method='GET',body,extraHeaders={}}={})=>new Promise((resolve,reject)=>{
   const headers={Host:'platform:8443',Origin:cfg.origin,Cookie:cookie,'x-workbench-browser-relay':cfg.previewRelayKey,'x-workbench-browser-origin':entry,...(body?{'Content-Type':'application/json'}:{}),...extraHeaders};
   const req=https.request({hostname:'127.0.0.1',servername:'platform',port,path,ca,method,headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  for(let attempt=0;;attempt++){try{await request('/__platform/login-info',origin('admin'));break;}catch(error){if(attempt===30)throw error;await new Promise(done=>setTimeout(done,100));}}
  const adminCookie='agent_session='+adminToken,adminInfo=await request('/__platform/login-info','http://127.0.0.1:8444');assert.equal(adminInfo.status,200);assert.equal(JSON.parse(adminInfo.text).method,'local-admin');assert.equal(JSON.parse(adminInfo.text).alternativeLoginUrl,origin('engineer-b')+'/__platform/login');
  const info=JSON.parse((await request('/__platform/login-info',origin('engineer-b'))).text);assert.equal(info.method,'local-engineer');assert.equal(info.username,'engineer-b');assert.equal(info.profile,'development');
  assert.equal((await request('/api/auth/login',origin('engineer-b'),{method:'POST',body:{username:'engineer-b',password:'wrong'}})).status,401);
  assert.equal((await request('/api/auth/login',origin('admin'),{method:'POST',body:{username:'engineer-b',password}})).status,403);
  const login=await request('/api/auth/login',origin('engineer-b'),{method:'POST',body:{username:'engineer-b',password}});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);assert.doesNotMatch(login.headers['set-cookie'][0],/Domain=/);
  assert.equal((await request('/__platform/workbench-guard.js',origin('engineer-b'),{cookie})).status,200);
  assert.equal((await request('/__platform/workbench-guard.js',origin('admin'),{cookie})).status,401);
  assert.equal((await request('/__platform/workbench-guard.js',origin('admin'),{cookie:adminCookie})).status,200);
  // Real HTTPS API fixture and wall-clock wait; does not change installed accounts or mint their sessions.
  const previewOrigin=origin('engineer-b').replace('workbench.','').replace(':8444',':8445');
  const preview=(url,previewCookie='')=>request('/__preview'+new URL(url,previewOrigin).pathname+new URL(url,previewOrigin).search,origin('engineer-b'),{cookie:previewCookie,extraHeaders:{'x-workbench-preview-relay':cfg.previewRelayKey,'x-workbench-preview-origin':previewOrigin}});
  const issue=async()=>{const r=await request('/__platform/preview/ticket',origin('engineer-b'),{method:'POST',cookie});assert.equal(r.status,200);const t=JSON.parse(r.text);assert.equal(t.expiresIn,30);return t.url};
  const consumed=await issue(),claimed=await preview(consumed);assert.equal(claimed.status,303);
  const previewCookie=claimed.headers['set-cookie'][0].split(';')[0];assert.match(claimed.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);assert.doesNotMatch(claimed.headers['set-cookie'][0],/Domain=/);
  assert.equal((await preview(consumed)).status,401);
  assert.equal((await request('/__platform/me',origin('engineer-b'),{cookie:previewCookie})).status,401);
  const expiring=await issue(),start=Date.now();await new Promise(done=>setTimeout(done,31000));assert.ok(Date.now()-start>=30000);
  assert.equal((await preview(expiring)).status,401);
  cfg.users['engineer-b'].enabled=false;writeFileSync(join(temp,'trusted/platform.json'),JSON.stringify(cfg));
  assert.equal((await request('/__platform/workbench-guard.js',origin('engineer-b'),{cookie})).status,401);
  assert.equal((await preview('/')).status,401);
  assert.equal((await preview('/',previewCookie)).status,401);
  assert.equal((await request('/__platform/workbench-guard.js',origin('admin'),{cookie:adminCookie})).status,200);
  cfg.users['engineer-b'].enabled=true;writeFileSync(join(temp,'trusted/platform.json'),JSON.stringify(cfg));
  assert.equal((await request('/api/auth/logout',origin('engineer-b'),{method:'POST',cookie})).status,204);
  assert.equal((await request('/__platform/workbench-guard.js',origin('engineer-b'),{cookie})).status,401);
  assert.equal((await request('/__platform/workbench-guard.js',origin('admin'),{cookie:adminCookie})).status,200);
 }finally{if(container)execFileSync('docker',['rm','-f',container],{stdio:'ignore'});rmSync(temp,{recursive:true,force:true});}
});
