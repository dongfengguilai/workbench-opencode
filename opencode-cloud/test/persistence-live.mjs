import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cfg,request,login} from './live-client.mjs';
import {chromium} from '/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const run=promisify(execFile);const sid=JSON.parse(readFileSync('evidence/browser-flow-result.json')).session;
const url=cfg.origin+'/server/'+Buffer.from(cfg.origin).toString('base64url')+'/session/'+sid;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const file='runtime/admin-project/opencode-cloud/src/patch-export.ts';const beforeHash=hash(file);
let cookie=await login();const getMessages=async()=>{const r=await request('/session/'+sid+'/message',{cookie});assert.equal(r.status,200);return JSON.parse(r.body).map(m=>m.info.id);};
const before=await getMessages();assert.equal((await request('/session/status',{cookie})).body,'{}');
const browser=await chromium.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox']});
const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
async function enter(){const page=await ctx.newPage();await page.goto(cfg.origin+'/__platform/login');await page.locator('input[name=username]').fill('admin');await page.locator('input[name=password]').fill(cfg.users.admin.password);await page.locator('#login button').click();await page.waitForURL(cfg.origin+'/');await page.goto(url);await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor();return page;}
const steps=[];
try{
 let page=await enter();await page.reload();await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor();steps.push('idle_refresh');await page.close();
 page=await ctx.newPage();await page.goto(url);await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor();steps.push('browser_close_reenter');
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.waitForURL(cfg.origin+'/__platform/login');await page.close();page=await enter();steps.push('logout_login_same_native_session');
 assert.deepEqual(await getMessages(),before);assert.equal(hash(file),beforeHash);
 const {stdout,stderr}=await run('docker',['compose','--profile','model-repair','up','-d','--no-build','--force-recreate','admin-native','admin-native-firewall','admin-native-guard'],{timeout:120000});writeFileSync('evidence/a04-restart.log',stdout+stderr);
 let ready=false;for(let i=0;i<40;i++){try{const r=await request('/__platform/me',{cookie});if(r.status===200&&JSON.parse(r.body).ready){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'Restored native instance must be ready');
 await page.reload();await page.getByRole('textbox',{name:'Prompt',exact:true}).waitFor({timeout:60000});assert.deepEqual(await getMessages(),before);assert.equal(hash(file),beforeHash);steps.push('idle_normal_restart_same_session_files_no_resend');
 await page.screenshot({path:'evidence/a04-restored.png',fullPage:true});
 writeFileSync('evidence/a04-result.json',JSON.stringify({status:'PASS',session:sid,steps,fileHashBefore:beforeHash,fileHashAfter:hash(file),messageIdsBefore:before,messageIdsAfter:await getMessages(),activeRefreshEvidence:'browser-active-refresh.json'},null,2));console.log('PASS',steps.join(', '));
}catch(e){writeFileSync('evidence/a04-result.json',JSON.stringify({status:'FAIL',steps,error:e.message},null,2));throw e;}finally{await browser.close();}
