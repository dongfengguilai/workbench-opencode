import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const cfg=JSON.parse(readFileSync('runtime/platform.json'));
const ca=readFileSync('runtime/tls.crt');
const sid='ses_f5236b382ffeAgB48sLtafH7Qy';
const request=(route,{method='GET',body,cookie,origin=cfg.origin}={})=>new Promise((resolve,reject)=>{
 const req=https.request(cfg.origin+route,{method,ca,rejectUnauthorized:true,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})}},res=>{
  const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));res.on('error',reject);
 });req.on('error',reject);req.setTimeout(30000,()=>req.destroy(Error('platform timeout')));req.end(body?JSON.stringify(body):undefined);
});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const results=[];let cookie;
try{
 assert.equal((await request('/session')).status,401);
 const login=await request('/api/auth/login',{method:'POST',body:{username:'admin',password:cfg.users.admin.password}});assert.equal(login.status,200);cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/Secure/);
 assert.equal(JSON.parse((await request('/__platform/me',{cookie})).body).ready,true);results.push('real admin login, original HTTPS Cookie Secure, ready');
 const messages=await request('/session/'+sid+'/message',{cookie});assert.equal(messages.status,200);writeFileSync('evidence/web-egress-native-messages.json',messages.body+'\n');
 const parsed=JSON.parse(messages.body);const completed=parsed.flatMap(m=>m.parts).filter(p=>p.type==='tool'&&p.tool==='webfetch'&&p.state.status==='completed');
 assert.ok(completed.some(p=>p.state.input.url==='https://wttr.in/Shanghai?format=3'&&p.state.output.includes('Shanghai:')));
 assert.ok(completed.some(p=>p.state.input.url==='https://bun.sh/docs/runtime/networking/fetch'&&p.state.output.includes('Fetch')));
 assert.ok(parsed.flatMap(m=>m.parts).some(p=>p.type==='tool'&&p.tool==='webfetch'&&p.state.status==='error'));
 results.push('fixed native v1.18.31 Webfetch completed both websites; historical error preserved');
 for(const [route,method,body] of [['/config','PATCH',{model:'other'}],['/mcp','POST',{name:'unsafe',config:{}}]])assert.equal((await request(route,{method,body,cookie})).status,403);
 assert.equal((await request('/session',{method:'POST',body:{},cookie,origin:'https://evil.example'})).status,403);results.push('management and cross-origin boundaries retained');
 const b=await request('/api/auth/login',{method:'POST',body:{username:'trial-b',password:cfg.users['trial-b'].password}});assert.equal(b.status,200);const other=b.headers['set-cookie'][0].split(';')[0];
 assert.equal((await request('/session/'+sid+'/message',{cookie:other})).status,404);await request('/api/auth/logout',{method:'POST',cookie:other});results.push('second real user cannot read admin session');
 const project='runtime/admin-project';const indexBefore=hash(project+'/.git/index');
 const manifest=await request('/__platform/changes',{cookie});assert.equal(manifest.status,200);writeFileSync('evidence/web-egress-manifest.json',manifest.body+'\n');
 const patch=await request('/__platform/download',{cookie});assert.equal(patch.status,200);writeFileSync('evidence/web-egress-platform.patch',patch.body);
 assert.equal(hash(project+'/.git/index'),indexBefore);
 const applied=mkdtempSync(path.resolve('runtime/web-egress-applied-'));
 execFileSync('git',['clone','--quiet','--no-hardlinks',path.resolve(project),applied],{stdio:'pipe'});
 const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim();assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:applied,encoding:'utf8'}).trim(),baseline);
 execFileSync('git',['apply','--check',path.resolve('evidence/web-egress-platform.patch')],{cwd:applied});execFileSync('git',['apply',path.resolve('evidence/web-egress-platform.patch')],{cwd:applied});
 const nativeId=execFileSync('docker',['compose','ps','-q','admin-native'],{encoding:'utf8'}).trim();
 const imageId=JSON.parse(execFileSync('docker',['inspect',nativeId],{encoding:'utf8'}))[0].Image;
 const args=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1000:1000','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--mount',`type=bind,source=${applied},target=/workspace/project,readonly`,imageId,'node','--experimental-strip-types','--test','opencode-cloud/test/patch-export.test.mjs','opencode-cloud/test/demo-text.test.mjs'];
 let tests;try{tests=execFileSync('docker',args,{encoding:'utf8'});}catch(e){writeFileSync('evidence/web-egress-applied-tests.log',String(e.stdout||'')+String(e.stderr||''));throw e;}
 writeFileSync('evidence/web-egress-applied-tests.log',tests);assert.match(tests,/# fail 0/);
 results.push('actual manifest/download, index unchanged, patch applied to NEW clean baseline, existing tests pass');
 const persistence={session:sid,messageIds:parsed.map(m=>m.info.id),messagesSha256:createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),files:{}};
 const before=JSON.parse(readFileSync('evidence/web-egress-before.json'));
 for(const [environment,state] of Object.entries(before.environments)){
  const folder=environment==='admin-'?'admin-project':'project';
  for(const [name,digest] of Object.entries(state.files)){assert.equal(hash('runtime/'+folder+'/'+name),digest);persistence.files[folder+'/'+name]=digest;}
  assert.equal(execFileSync('git',['status','--porcelain=v1'],{cwd:'runtime/'+folder,encoding:'utf8'}),state.gitStatus);assert.equal(hash('runtime/'+folder+'/.git/index'),state.indexSha256);
 }
 writeFileSync('evidence/web-egress-pre-relogin.json',JSON.stringify(persistence,null,2)+'\n');results.push('all existing project files and Git statuses still unchanged');
 await request('/api/auth/logout',{method:'POST',cookie});assert.equal((await request('/session',{cookie})).status,401);
 writeFileSync('evidence/web-egress-regression-result.json',JSON.stringify({status:'PASS',kind:'real_platform_verified_TLS_native_data_clean_patch_application',baseline,independentTestImage:imageId,results},null,2)+'\n');console.log('PASS',results.join('; '));
}catch(e){writeFileSync('evidence/web-egress-regression-result.json',JSON.stringify({status:'FAIL',results,error:e.message},null,2)+'\n');throw e;}
