import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {cfg,request,login} from './live-client.mjs';
import {chromium} from '/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const result={status:'IN_PROGRESS',checks:[]};const pass=n=>{result.checks.push(n);console.log('PASS',n);};
const sid=JSON.parse(readFileSync('evidence/browser-flow-result.json')).session;
const a=await login('admin'),b=await login('trial-b');
const markerA='A06_ADMIN_ONLY_93b81',markerB='A06_TRIAL_B_ONLY_64821';
for(const [dir,marker] of [['admin-project',markerA],['project',markerB]]){const p='runtime/'+dir+'/acceptance-a06.txt';if(existsSync(p))assert.equal(readFileSync(p,'utf8'),marker+'\n');else writeFileSync(p,marker+'\n');}
const ar=await request('/session/'+sid,{method:'PATCH',body:{title:markerA},cookie:a});assert.equal(ar.status,200);
const br=await request('/session',{method:'POST',body:{title:markerB},cookie:b});assert.equal(br.status,200);const bsid=JSON.parse(br.body).id;
async function stream(cookie){return new Promise((resolve,reject)=>{const req=https.get(cfg.origin+'/event',{rejectUnauthorized:false,headers:{Cookie:cookie}},res=>{res.resume();let closed=false;res.on('close',()=>closed=true);resolve({req,res,isClosed:()=>closed});});req.on('error',reject);});}
let browser;
const original=readFileSync('runtime/platform.json');
try{
 assert.equal((await request('/session/'+sid+'/message',{cookie:b})).status,404);pass('B cannot read A native session ID');
 assert.equal((await request('/file/content?path=acceptance-a06.txt',{cookie:b,headers:{'x-opencode-directory':'/state','x-user-id':'admin',Authorization:'Bearer irrelevant'}})).body.includes(markerA),false);pass('headers cannot change user binding');
 for(const path of ['/session?directory=/state','/file/content?path=/state/data/opencode/opencode.db','/__platform/download?envId=admin']){const r=await request(path,{cookie:b});if(path.startsWith('/__platform'))assert.ok(!r.body.includes(markerA));else assert.equal(r.status,403);}pass('directory and file path override rejected; download remains B');
 const download=await request('/__platform/download',{cookie:b});assert.equal(download.status,200);assert.ok(download.body.includes(markerB));assert.ok(!download.body.includes(markerA));pass('B export contains only B work');
 const s=await stream(b);assert.equal(s.res.statusCode,200);await request('/api/auth/logout',{method:'POST',cookie:b});for(let i=0;i<30&&!s.isClosed();i++)await new Promise(r=>setTimeout(r,100));assert.ok(s.isClosed());pass('logout closes existing actual SSE within 3 seconds');
 const bc=await login('trial-b');const s2=await stream(bc);const changed=JSON.parse(original);changed.users['trial-b'].enabled=false;writeFileSync('runtime/platform.json',JSON.stringify(changed),{mode:0o600});for(let i=0;i<40&&!s2.isClosed();i++)await new Promise(r=>setTimeout(r,100));assert.ok(s2.isClosed());assert.equal((await request('/session',{cookie:bc})).status,401);pass('disable closes SSE within 4 seconds and revokes reads');writeFileSync('runtime/platform.json',original,{mode:0o600});
 const names=['native','admin-native','platform'];const inspect=JSON.parse(execFileSync('docker',['inspect',...names.map(n=>'opencode-cloud-v0-'+n+'-1')],{encoding:'utf8'}));
 const evidence=inspect.map(x=>({name:x.Name,user:x.Config.User,ports:x.NetworkSettings.Ports,mounts:x.Mounts.map(m=>({destination:m.Destination,source:m.Source,rw:m.RW})),networks:Object.fromEntries(Object.entries(x.NetworkSettings.Networks).map(([n,v])=>[n,{ip:v.IPAddress,ipv6:v.GlobalIPv6Address}])),privileged:x.HostConfig.Privileged,readonly:x.HostConfig.ReadonlyRootfs,capDrop:x.HostConfig.CapDrop,memory:x.HostConfig.Memory,pids:x.HostConfig.PidsLimit}));
 writeFileSync('evidence/a06-container-boundary.json',JSON.stringify(evidence,null,2));
 const aip=Object.values(inspect[1].NetworkSettings.Networks)[0].IPAddress;
 const code=`const urls=${JSON.stringify(['http://'+aip+':4096/global/health','http://192.168.142.130:22','http://192.168.142.130:8317/v1/models','http://169.254.169.254/','https://1.1.1.1/'])};for(const url of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});console.log(JSON.stringify({url,status:r.status}));process.exitCode=1}catch{console.log(JSON.stringify({url,result:'network_denied'}));}}`;
 const out=execFileSync('docker',['compose','exec','-T','native','node','--input-type=module','-e',code],{encoding:'utf8'});writeFileSync('evidence/a06-network-denials.jsonl',out);pass('B container cannot reach A, host management/model master, metadata or direct external IP');
 assert.ok(evidence[0].mounts.every(m=>!m.source.includes('admin-project')&&!m.destination.includes('docker.sock')));assert.equal(evidence[0].privileged,false);assert.equal(evidence[0].user,'node');pass('independent mount and nonprivileged boundaries');
 browser=await chromium.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox']});const ctx=await browser.newContext({ignoreHTTPSErrors:true});const page=await ctx.newPage();
 async function uiLogin(name){await page.goto(cfg.origin+'/__platform/login');await page.locator('input[name=username]').fill(name);await page.locator('input[name=password]').fill(cfg.users[name].password);await page.locator('#login button').click();await page.waitForURL(cfg.origin+'/');}
 await uiLogin('admin');await page.goto(cfg.origin+'/server/'+Buffer.from(cfg.origin).toString('base64url')+'/session/'+sid);await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor();assert.ok((await page.locator('body').innerText()).includes(markerA));
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.waitForURL(cfg.origin+'/__platform/login');await uiLogin('trial-b');await page.goto(cfg.origin+'/server/'+Buffer.from(cfg.origin).toString('base64url')+'/session/'+bsid);await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor();const text=await page.locator('body').innerText();assert.ok(text.includes(markerB));assert.ok(!text.includes(markerA));await page.screenshot({path:'evidence/a06-browser-B.png',fullPage:true});pass('same browser A logout then B login shows only B native history');
 result.status='PASS';
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{writeFileSync('runtime/platform.json',original,{mode:0o600});writeFileSync('evidence/a06-result.json',JSON.stringify(result,null,2));if(browser)await browser.close();}
