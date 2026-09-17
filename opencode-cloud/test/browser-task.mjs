import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const cfg=JSON.parse(readFileSync('runtime/platform.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox']});
const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
const page=await ctx.newPage();const network=[];const errors=[];
page.on('response',r=>network.push({method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()}));page.on('pageerror',e=>errors.push(e.message));
async function snapshot(name){await page.screenshot({path:'evidence/'+name+'.png',fullPage:true});writeFileSync('evidence/'+name+'.json',JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),network,errors},null,2));}
try{
 await page.goto(cfg.origin+'/__platform/login');await page.locator('input[name=username]').fill('admin');await page.locator('input[name=password]').fill(cfg.users.admin.password);await page.locator('#login button').click();await page.waitForURL(cfg.origin+'/');await page.getByRole('link',{name:'授权项目',exact:true}).click();
 const prompt='Before changing any file, use the native question tool to ask me whether the patch exporter must exclude both newly created secret files and deleted tracked secret files. Provide choices Yes and No. Wait for my answer; do not edit yet.';
 writeFileSync('evidence/platform-question-task.txt',prompt+'\n');
 await page.getByRole('textbox',{name:'Prompt',exact:true}).fill(prompt);await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForTimeout(2000);await snapshot('browser-question-start');
 await page.getByText('Yes',{exact:true}).first().waitFor({timeout:180000});await snapshot('browser-native-question');
 console.log('Native question visible');
 // First verify the stop operation against a genuinely pending native task.
 const stop=page.getByRole('button',{name:/stop/i}).first();
 if(await stop.count()){await stop.click();console.log('Clicked native stop');}
 else throw new Error('Native stop control missing while question is pending');
 await page.waitForTimeout(1000);await snapshot('browser-stopped');
 const state=await ctx.request.get(cfg.origin+'/session/status');assert.equal(state.status(),200);assert.deepEqual(await state.json(),{});
 console.log('Native task is idle after browser stop');
 writeFileSync('evidence/platform-interaction-result.json',JSON.stringify({status:'PASS',question_visible:true,stop_verified_native_idle:true,url:page.url()},null,2));
}catch(e){await snapshot('browser-task-failure');writeFileSync('evidence/platform-interaction-result.json',JSON.stringify({status:'FAIL',error:e.message},null,2));throw e;}
finally{await browser.close();}
