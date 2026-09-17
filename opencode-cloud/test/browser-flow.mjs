import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const cfg=JSON.parse(readFileSync('runtime/platform.json','utf8'));
const old=JSON.parse(readFileSync('evidence/browser-native-question.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox']});
const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
const page=await ctx.newPage();const network=[];const errors=[];
page.on('response',r=>network.push({method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()}));page.on('pageerror',e=>errors.push(e.message));
const result={status:'IN_PROGRESS',steps:[]};
async function record(name){await page.screenshot({path:'evidence/'+name+'.png',fullPage:true});writeFileSync('evidence/'+name+'.json',JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),network,errors},null,2));result.steps.push(name);writeFileSync('evidence/browser-flow-result.json',JSON.stringify(result,null,2));console.log(name);}
async function idle(timeout=600000){const end=Date.now()+timeout;while(Date.now()<end){const r=await ctx.request.get(cfg.origin+'/session/status');assert.equal(r.status(),200);if(Object.keys(await r.json()).length===0)return;await new Promise(r=>setTimeout(r,2000));}throw new Error('Native task remained busy past bounded test deadline');}
async function send(text){await page.getByRole('textbox',{name:'Prompt',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
try{
 await page.goto(cfg.origin+'/__platform/login');await page.locator('input[name=username]').fill('admin');await page.locator('input[name=password]').fill(cfg.users.admin.password);await page.locator('#login button').click();await page.waitForURL(cfg.origin+'/');
 await page.goto(old.url);
 const initialSid=old.url.split('/').pop();
 const before=await ctx.request.get(cfg.origin+'/session/'+initialSid+'/message');const initialMessages=await before.json();
 assert.ok(initialMessages.some(m=>m.parts?.some(p=>p.type==='tool'&&p.tool==='question'&&p.state?.status==='completed'&&p.state?.output?.includes('Yes'))),'Existing native question must contain actual Yes answer');
 writeFileSync('evidence/platform-question-native-state.json',JSON.stringify(initialMessages,null,2));
 await idle(15000);await record('browser-question-answered');
 assert.ok(!existsSync('runtime/admin-project/opencode-cloud/src/patch-export.ts'),'A03 coding starts from unrepaired baseline');
 const stopTask='Run exactly the Bash command sleep 120 as a harmless stop verification task. Do not read secrets or edit any file. After it finishes report completion.';
 writeFileSync('evidence/platform-stop-task.txt',stopTask+'\n');await send(stopTask);
 await page.getByRole('button',{name:/stop/i}).first().waitFor({timeout:60000});
 // Wait for actual native Bash activity rather than stopping only the first model token.
 const sid=page.url().split('/').pop();
 const end=Date.now()+90000;let bashRunning=false;
 while(Date.now()<end){const r=await ctx.request.get(cfg.origin+'/session/'+sid+'/message');const messages=await r.json();bashRunning=messages.some(m=>m.parts?.some(p=>p.type==='tool'&&p.tool==='bash'&&p.state?.status==='running'&&p.state.input?.command?.includes('sleep 120')));if(bashRunning)break;await new Promise(r=>setTimeout(r,1000));}
 assert.ok(bashRunning,'Actual Bash sleep must be running before stop');await record('browser-bash-running');
 await page.getByRole('button',{name:/stop/i}).first().click();await idle(15000);await record('browser-stop-verified');
 const task=`Implement the actual patch download core for OpenCode Cloud V0 in this clean authorized project. Read opencode-cloud/test/patch-export.test.mjs first. Create opencode-cloud/src/patch-export.ts exporting async exportPatch({directory,baseline}) -> {baseline,files,patch}. Use only Node standard library and Git. Require full baseline SHA matching HEAD. Capture final working tree changes (staged plus unstaged, new files, deletion, binary) without changing the real Git index; use a temporary index outside the repository. Obey gitignore for untracked files. Exclude credential/key/.env, runtime/state/DB/cache/dependency paths whether added, modified OR DELETED, restoring excluded tracked paths to baseline and removing excluded additions. Reject external or broken symlinks. Handle file names literally. Do not modify tests, commit or access network/secrets. Run node --experimental-strip-types --test opencode-cloud/test/patch-export.test.mjs. Explain the actual diff and tests. You already have my Yes answer that newly-created and deleted tracked secret files must both be excluded.`;
 writeFileSync('evidence/platform-coding-task.txt',task+'\n');await send(task);await record('browser-coding-start');
 await new Promise(r=>setTimeout(r,2000));await page.reload();await record('browser-active-refresh');
 await idle();await record('browser-coding-complete');
 const messages=await ctx.request.get(cfg.origin+'/session/'+sid+'/message');writeFileSync('evidence/platform-native-messages.json',JSON.stringify(await messages.json(),null,2));
 result.session=sid;result.status='CODING_FINISHED_REQUIRES_INDEPENDENT_VERIFICATION';writeFileSync('evidence/browser-flow-result.json',JSON.stringify(result,null,2));
}catch(e){result.status='FAIL';result.error=e.message;await record('browser-flow-failure');throw e;}
finally{await browser.close();}
