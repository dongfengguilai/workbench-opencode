// Real deployed platform, native environments, credentials, and ZIPs; no mock.
import assert from 'node:assert/strict';import {writeFileSync,readFileSync} from 'node:fs';import {request,login,config,claimPreview} from './delivery-client.mjs';import https from 'node:https';
const sid='ses_f507ead15ffeUbQJZrsiTj0FYz',result={status:'IN_PROGRESS',checks:[]};let a,b,pc;
try{
 for(const p of ['/__platform/source.zip','/__platform/preview/status','/__platform/preview/verification?session='+sid])assert.equal((await request(p)).status,401);
 a=await login();b=await login('trial-b');
 for(const p of ['/config','/mcp','/global/dispose'])assert.equal((await request(p,{cookie:a,method:'PATCH',body:{model:'other'}})).status,403);
 assert.equal((await request('/__platform/preview/start',{cookie:a,method:'POST',body:{target:'http://other:9999'}})).status,403);
 assert.equal((await request('/__platform/preview/status?url=https://evil.example',{cookie:a})).status,403);
 assert.equal((await request('/__platform/source.zip?userId=admin',{cookie:b})).status,403);
 const av=await request('/__platform/preview/verification?session='+sid,{cookie:a});assert.equal(av.status,200);assert.equal(av.json().session,sid);
 assert.notEqual((await request('/__platform/preview/verification?session='+sid,{cookie:b})).status,200);
 assert.notEqual((await request('/__platform/preview/screenshot?session='+sid+'&name=static-result.png',{cookie:b})).status,200);
 const bz=await request('/__platform/source.zip',{cookie:b});assert.equal(bz.status,200);writeFileSync((process.argv[2]||'evidence/delivery-boundary-live-result.json').replace(/\.json$/, '-user-b-source.zip'),bz.buffer);
 result.checks.push('anonymous export/control denied; management/routing arguments denied; B cannot access A session or screenshot; B ZIP independently exported');
 const owned=await claimPreview(a),path=owned.initialPath;pc=owned.cookie;assert.match(owned.setCookie,/HttpOnly/);assert.match(owned.setCookie,/SameSite=Lax/);assert.doesNotMatch(owned.setCookie,/Secure/);
 assert.equal((await request(path,{preview:true})).status,401);
 assert.equal((await request('/',{preview:true})).status,401);
 assert.equal((await request('/',{preview:true,cookie:a})).status,401);
 const page=await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc});assert.equal(page.status,200);assert.match(page.text,/文本统计器/);
 assert.equal((await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc,headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}})).status,200);
 for(const headers of [{Host:'127.0.0.1:8445'},{Origin:'http://127.0.0.1:8444'},{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'}])assert.equal((await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc,headers})).status,403);
 assert.equal((await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc,method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await request('/__platform/source.zip',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,403);
 assert.notEqual((await request('/@fs/workspace/project/.env.a05-acceptance',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,200);
 assert.notEqual((await request('/@fs/trusted/opencode.json',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,200);
 assert.notEqual((await request('/@fs/workspace/project/.git/config',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,200);
 const direct=await new Promise((resolve,reject)=>{https.get(config.origin+'/__preview/',{ca:readFileSync('runtime/tls.crt'),headers:{Cookie:pc}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)});assert.equal(direct,403);
 result.checks.push('one-use ticket; separate-origin cookie; anonymous/agent-cookie preview denied; top-level claim navigation works; bad Host/Origin/cross-site write denied; platform namespace and out-of-web Vite filesystem denied; direct HTTPS app namespace denied');
 await request('/api/auth/logout',{method:'POST',cookie:a});assert.equal((await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,401);
 result.checks.push('logout immediately revokes linked preview credential');
 a=await login();const exp=(await request('/__platform/preview/ticket',{method:'POST',cookie:a})).json().url;await new Promise(r=>setTimeout(r,31000));assert.equal((await request(new URL(exp).pathname+new URL(exp).search,{preview:true})).status,401);result.checks.push('real 30-second preview ticket expiry');
 result.status='PASS';console.log('PASS actual preview and ZIP boundaries');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{if(a)await request('/api/auth/logout',{method:'POST',cookie:a});if(b)await request('/api/auth/logout',{method:'POST',cookie:b});writeFileSync(process.argv[2]||'evidence/delivery-boundary-live-result.json',JSON.stringify(result,null,2)+'\n')}
