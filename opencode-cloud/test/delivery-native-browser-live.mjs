// Real native OpenCode + approved model, isolated acceptance copy, no mock.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const resume = process.argv.includes('--resume');
const previous = resume ? JSON.parse(readFileSync('evidence/delivery-browser-trial.json','utf8')) : undefined;
const name = 'workbench-delivery-browser-trial';
const image = 'opencode-cloud/native:1.18.31-browser-v1';
const project = path.resolve('runtime/delivery-trial/project');
const state = path.resolve('runtime/delivery-trial/state');
const native = JSON.parse(execFileSync('docker', ['inspect', 'opencode-cloud-v0-admin-native-1'], {encoding:'utf8'}))[0];
const network = Object.keys(native.NetworkSettings.Networks)[0];
assert.equal(execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'opencode-cloud-v0-admin-native-1'], {encoding:'utf8'}).trim(), 'true');
mkdirSync(path.join(project, '.workbench-artifacts'), {recursive:true});
for(const directory of ['browser-home','browser-config','browser-cache'])mkdirSync(path.join(state,directory),{recursive:true});
const config = {
  browser: {browserName:'chromium', isolated:true, launchOptions:{channel:'chromium',headless:true, chromiumSandbox:false, args:['--proxy-bypass-list=<-loopback>;127.0.0.1:5173'],env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/state/browser-home',XDG_CONFIG_HOME:'/state/browser-config',XDG_CACHE_HOME:'/state/browser-cache',LANG:'C.UTF-8',TMPDIR:'/tmp'},proxy:{server:'http://admin-web-egress:8320', bypass:'<-loopback>;127.0.0.1:5173'}}},
  outputDir:'/workspace/project/.workbench-artifacts',
};
writeFileSync('runtime/delivery-trial/browser.json', JSON.stringify(config));
execFileSync('docker', ['run','-d','--name',name,'--init','--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--cpus','2','--memory','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--env-file',path.resolve('runtime/admin-native.env'),'-e','HOME=/state/home',
  '--mount',`type=bind,src=${project},dst=/workspace/project`,
  '--mount',`type=bind,src=${state},dst=/state`,
  '--mount',`type=bind,src=${path.resolve('runtime/admin-opencode.json')},dst=/trusted/opencode.json,readonly`,
  '--mount',`type=bind,src=${path.resolve('runtime/delivery-trial/browser.json')},dst=/trusted/browser.json,readonly`,
  '-e','HTTPS_PROXY=http://admin-web-egress:8320','-e','HTTP_PROXY=http://admin-web-egress:8320','-e','NO_PROXY=127.0.0.1,localhost,admin-model-gateway',
  image,'opencode','serve','--hostname','127.0.0.1','--port','4030'], {stdio:'pipe'});
function request(route, method='GET', body) {
  const code=`const r=await fetch('http://127.0.0.1:4030'+${JSON.stringify(route)},{method:${JSON.stringify(method)},headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'),'Content-Type':'application/json'},body:${body?JSON.stringify(JSON.stringify(body)):'undefined'},signal:AbortSignal.timeout(20000)}); console.log(JSON.stringify({status:r.status,body:await r.text()}));`;
  const out = JSON.parse(execFileSync('docker',['exec','-i','--user','1001:1001',name,'node','--input-type=module'],{input:code,encoding:'utf8'}));
  if(out.status < 200 || out.status >= 300) throw Error('Native HTTP '+out.status+' at '+route);
  return out.body ? JSON.parse(out.body) : undefined;
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
for(let i=0;;i++) {
  try {request('/global/health');break;} catch(e) {if(i===30)throw e;await sleep(1000);}
}
// Native PTY owns the real Vite process; the Agent creates all page code.
const pty=request('/pty?directory=/workspace/project','POST',{command:'/bin/bash',args:['-lc','exec vite /workspace/project/web --host 127.0.0.1 --port 5173 --strictPort'],cwd:'/workspace/project',title:'Browser acceptance Vite'});
const session=resume ? {id:previous.session} : request('/session?directory=/workspace/project','POST',{title:'Real Qwen browser delivery acceptance'});
const prompt=(resume ? '维护者已修复镜像的 CLI 默认配置，并保留原会话及你创建的文件。现在直接使用 playwright-cli；固定浏览器路径及代理已由镜像配置，不需要读取 /trusted，也禁止安装或下载浏览器。请继续同一个任务，实际完成全部断言和截图。\n' : '')+`在这个独立验收副本里完成一个真实网页任务。只在 /workspace/project/web 新建文件，不改其他项目文件，不读取环境变量或 /trusted 的内容。用中文做一个待办网页：输入框（标签“待办事项”）、“添加”按钮、任务列表和数量。空白内容不能添加，添加后输入框清空，提供删除任务功能。无需外部依赖。已有原生 PTY 正在用 Vite 将该目录发布到 http://127.0.0.1:5173。
你必须通过原生 Bash 实际调用固定的 Microsoft Playwright CLI 验证网页，不使用 webfetch 代替：先读 playwright-cli --help，需要配置时使用 --config /trusted/browser.json。用命名浏览器 -s=delivery（隔离、headless），打开预览、取得 snapshot，填入“真实浏览器验收任务”并点击添加，检查任务可见且数量为1；测试空白添加不增数，删除后数量为0。可以使用 CLI 的 eval 或 run-code 做真实 DOM 断言，断言失败必须 throw，成功返回字符串 WB_BROWSER_ASSERTIONS_PASS。保留添加成功和删除后的 PNG 截图到 /workspace/project/.workbench-artifacts，最后关闭浏览器。所有代码与测试都要你自己实际完成，不仅给出建议。最终报告实际命令及结果。`;
writeFileSync(resume?'evidence/delivery-browser-resume-task.txt':'evidence/delivery-browser-task.txt',prompt+'\n');
writeFileSync('evidence/delivery-browser-trial.json',JSON.stringify({container:name,image,session:session.id,pty:pty.id,project,network},null,2)+'\n');
request('/session/'+session.id+'/prompt_async?directory=/workspace/project','POST',{model:{providerID:'approved',modelID:'Qwen3.6-35B-A3B'},parts:[{type:'text',text:prompt}]});
let messages;
for(let i=0;i<360;i++) {
  await sleep(2000);
  messages=request('/session/'+session.id+'/message?directory=/workspace/project');
  writeFileSync('evidence/delivery-browser-native-messages.json',JSON.stringify(messages,null,2)+'\n');
  const status=request('/session/status?directory=/workspace/project');
  const lastUser=messages.findLastIndex(m=>m.info.role==='user');
  const assistants=messages.slice(lastUser+1).filter(m=>m.info.role==='assistant');
  if(assistants.some(m=>m.info.error))throw Error('Real native model returned an error: '+JSON.stringify(assistants.find(m=>m.info.error).info.error));
  if(i%10===0)console.log(JSON.stringify({session:session.id,elapsedSeconds:(i+1)*2,tools:messages.flatMap(m=>m.parts).filter(p=>p.type==='tool').map(p=>({tool:p.tool,status:p.state.status}))}));
  if(assistants.some(m=>m.info.time?.completed&&m.info.finish==='stop')&&!status[session.id])break;
  if(i===359)throw Error('Native browser acceptance timeout; inspect original session, never resubmit automatically');
}
const tools=messages.flatMap(m=>m.parts).filter(p=>p.type==='tool');
assert.ok(tools.some(p=>p.tool==='bash'&&p.state.status==='completed'&&p.state.output?.includes('### Result')&&p.state.output?.includes('WB_BROWSER_ASSERTIONS_PASS')&&!p.state.output.includes('### Error')),'Real CLI DOM assertions missing');
assert.ok(tools.some(p=>p.tool==='bash'&&p.state.status==='completed'&&p.state.input?.command?.includes('playwright-cli')),'Native CLI calls missing');
const screenshots=readdirSync(path.join(project,'.workbench-artifacts'),{recursive:true}).filter(f=>f.endsWith('.png'));
assert.ok(screenshots.length>=2,'Add/delete screenshots missing');
for(const file of screenshots)assert.equal(readFileSync(path.join(project,'.workbench-artifacts',file)).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.ok(readFileSync(path.join(project,'web/index.html'),'utf8').includes('待办'),'Agent page code missing');
writeFileSync('evidence/delivery-browser-native-result.json',JSON.stringify({status:'PASS',session:session.id,pty:pty.id,realModel:'Qwen3.6-35B-A3B',nativeVersion:'1.18.31',browser:'Microsoft Playwright CLI 0.1.20',tools:tools.length},null,2)+'\n');
console.log('Real Qwen native browser checkpoint PASS');
