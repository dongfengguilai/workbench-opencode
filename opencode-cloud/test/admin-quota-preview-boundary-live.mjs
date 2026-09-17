// Real running identities, native PTYs and previews. Fixtures are disposable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,chmodSync} from 'node:fs';
import {request,login,claimPreview} from './delivery-client.mjs';
import {previewOrigin} from '../src/preview-origin.mjs';
const sid='ses_f507ead15ffeUbQJZrsiTj0FYz',result={status:'IN_PROGRESS',checks:[]};
let a,b,foreign;const cfgFile='runtime/platform.json',cfgText=readFileSync(cfgFile,'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
 a=await login();b=await login('trial-b');
 const pa=await claimPreview(a),pb=await claimPreview(b);
 assert.equal(pa.origin,previewOrigin('admin'));assert.equal(pb.origin,previewOrigin('trial-b'));assert.notEqual(pa.origin,pb.origin);
 const app=(p,v,extra={})=>request(p,{preview:true,previewOrigin:v.origin,cookie:v.cookie,...extra});
 for(const v of [pa,pb]) {
  assert.match(v.setCookie,/HttpOnly/);assert.match(v.setCookie,/SameSite=Lax/);assert.doesNotMatch(v.setCookie,/Domain=/i);
  assert.equal((await request(v.initialPath,{preview:true})).status,401);
  assert.equal((await request(v.childPath,{preview:true,previewOrigin:v.origin})).status,401);
  assert.equal((await app('/',v)).status,200);
  assert.equal((await request('/',{preview:true,cookie:v.cookie})).status,401);
 }
 assert.match((await app('/',pa)).text,/文本统计器/);assert.match((await app('/',pb)).text,/trial-b boundary fixture/);
 assert.equal((await app('/',pa,{previewOrigin:pb.origin})).status,401);
 assert.equal((await app('/',pb,{previewOrigin:pa.origin})).status,401);
 assert.equal((await app('/',pa,{headers:{Host:'arbitrary.localhost:8445'}})).status,403);
 assert.equal((await app('/',pa,{headers:{Origin:pb.origin}})).status,403);
 assert.equal((await app('/',pa,{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await app('/__platform/source.zip',pa)).status,403);
 for(const p of ['/@fs/trusted/opencode.json','/@fs/workspace/project/.env.a05-acceptance','/@fs/workspace/project/.git/config'])assert.notEqual((await app(p,pa)).status,200);
 for(const p of ['/__platform/source.zip','/__platform/preview/status'])assert.equal((await request(p)).status,401);
 assert.notEqual((await request('/__platform/preview/verification?session='+sid,{cookie:b})).status,200);
 assert.notEqual((await request('/__platform/preview/screenshot?session='+sid+'&name=react-result-verified.png',{cookie:b})).status,200);
 assert.equal((await request('/__platform/source.zip?userId=admin',{cookie:b})).status,403);
 assert.equal((await request('/global/dispose',{cookie:a,method:'POST'})).status,403);
 result.checks.push('two-hop one-use tickets, fixed distinct owned origins, host-only cookie, forged host/origin and cross-user credential/session/screenshot/source routing denied');
 const initial=(await request('/__platform/preview/ticket',{cookie:a,method:'POST'})).json().url;
 await sleep(31000);assert.equal((await request(new URL(initial).pathname+new URL(initial).search,{preview:true})).status,401);
 result.checks.push('actual 30-second entry ticket expired');
 await request('/__platform/preview/stop',{cookie:b,method:'POST'});
 const created=await request('/pty',{cookie:b,method:'POST',body:{command:'/bin/bash',args:['-lc',`exec node -e "require('http').createServer((q,r)=>r.end('FOREIGN_PORT_MARKER')).listen(5173,'127.0.0.1')"`],title:'WorkBench disposable port-conflict acceptance'}});assert.equal(created.status,200);foreign=created.json().id;
 for(let i=0;i<30;i++){if((await app('/',pb)).text==='FOREIGN_PORT_MARKER')break;await sleep(100);}
 assert.equal((await app('/',pb)).text,'FOREIGN_PORT_MARKER');
 assert.equal((await request('/__platform/preview/start',{cookie:b,method:'POST'})).status,409);
 assert.equal((await app('/',pb)).text,'FOREIGN_PORT_MARKER');
 await request('/pty/'+foreign,{cookie:b,method:'DELETE'});foreign=undefined;await sleep(200);
 const index='runtime/project/web/index.html',indexText=readFileSync(index);
 try{unlinkSync(index);assert.equal((await request('/__platform/preview/start',{cookie:b,method:'POST'})).status,409);}finally{writeFileSync(index,indexText);chmodSync(index,0o644);}
 const pkg='runtime/project/web/package.json';
 try{writeFileSync(pkg,JSON.stringify({scripts:{dev:'node'}}));assert.equal((await request('/__platform/preview/start',{cookie:b,method:'POST'})).status,409);const log=(await request('/__platform/preview/log',{cookie:b})).json();assert.ok(log.output.length);}finally{unlinkSync(pkg);}
 const start=await request('/__platform/preview/start',{cookie:b,method:'POST'});assert.equal(start.status,200,start.text);const twice=await request('/__platform/preview/start',{cookie:b,method:'POST'});assert.equal(twice.status,200);assert.equal(twice.json().pty,start.json().pty);
 result.checks.push('actual foreign port refused without replacing process; missing index and wrong dev script fail; start restored and repeated start reuses native PTY');
 const cfg=JSON.parse(cfgText);cfg.users['trial-b'].enabled=false;
 try{writeFileSync(cfgFile,JSON.stringify(cfg,null,2)+'\n');await sleep(2500);assert.equal((await app('/',pb)).status,401);assert.equal((await request('/__platform/me',{cookie:b})).status,401);}finally{writeFileSync(cfgFile,cfgText);}
 result.checks.push('actual identity disable revokes preview and platform session; original config restored');
 await request('/api/auth/logout',{cookie:a,method:'POST'});assert.equal((await app('/',pa)).status,401);
 result.checks.push('parent logout revokes own preview');result.status='PASS';console.log('PASS actual preview boundaries and native lifecycle faults');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally {
 writeFileSync(cfgFile,cfgText);if(foreign&&b)await request('/pty/'+foreign,{cookie:b,method:'DELETE'});
 for(const c of [a,b])if(c)await request('/api/auth/logout',{cookie:c,method:'POST'});
 writeFileSync('evidence/admin-quota-preview-boundary-result.json',JSON.stringify(result,null,2)+'\n');
}
