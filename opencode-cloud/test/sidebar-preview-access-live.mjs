import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {login,request} from './delivery-client.mjs';
import {previewOrigin,workbenchOrigin} from '../src/preview-origin.mjs';
const main=workbenchOrigin('admin'),own=previewOrigin('admin');
const cookie=await login();
const ticket=await request('/__platform/preview/ticket',{method:'POST',cookie,headers:{Host:new URL(main).host,Origin:main}});
assert.equal(ticket.status,200);const url=new URL(ticket.json().url);
const metadata={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'iframe',Origin:''};
const claim=await request(url.pathname+url.search,{preview:true,previewOrigin:own,headers:metadata});assert.equal(claim.status,303);
const pc=claim.headers['set-cookie'][0].split(';')[0];
const page=await request('/',{preview:true,previewOrigin:own,cookie:pc,headers:metadata});assert.equal(page.status,200);assert.match(page.text,/root/);assert.ok(page.headers['content-security-policy'].includes('frame-ancestors '+main));
const checks=['real cross-site redirected iframe claim303 and authenticated document200; exact owned ancestor CSP'];
for(const [name,opts,status] of [
 ['anonymous iframe',{cookie:'',headers:metadata},401],
 ['wrong user host',{previewOrigin:previewOrigin('trial-b'),headers:metadata},401],
 ['foreign Origin',{headers:{...metadata,Origin:'https://evil.example'}},403],
 ['cross-site subresource',{headers:{...metadata,'Sec-Fetch-Mode':'no-cors','Sec-Fetch-Dest':'script'}},403],
 ['cross-site write',{method:'POST',headers:{...metadata,Origin:own}},403],
 ['unapproved Host',{headers:{...metadata,Host:'evil.localhost:8445'}},403],
 ['root legacy iframe',{previewOrigin:'http://localhost:8445',headers:metadata},403],
 ['platform route',{path:'/__platform/me',headers:metadata},403],
]){const result=await request(opts.path||'/',{preview:true,previewOrigin:own,cookie:pc,...opts});assert.equal(result.status,status,name);checks.push(name+' rejected '+status);}
assert.equal((await request('/',{preview:true,previewOrigin:own,cookie:pc,headers:{...metadata,'Sec-Fetch-Dest':'document'}})).status,200);checks.push('copied canonical preview root real top-level document200');
assert.equal((await request(url.pathname+url.search,{preview:true,previewOrigin:own,headers:metadata})).status,401);checks.push('consumed ticket still401');
await request('/api/auth/logout',{method:'POST',cookie});
assert.equal((await request('/',{preview:true,previewOrigin:own,cookie:pc,headers:metadata})).status,401);checks.push('own parent logout revokes preview credential401');
writeFileSync('evidence/sidebar-preview-access-live-result.json',JSON.stringify({status:'PASS',kind:'real_running_platform_requests_with_reported_browser_fetch_metadata',time:new Date().toISOString(),checks},null,2)+'\n');console.log('PASS',checks.length);
