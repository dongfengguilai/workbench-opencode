// Independent reproduction of actual authenticated downloads, not Agent proof.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const network=readFileSync('runtime/admin-quota-reproduce/network','utf8').trim();
const image='sha256:264c89bb377c3fdd2d6c88ba857c3abe6ff20864314f31bc8e3717f42cb3fcd3';
const script=`set -e
node --experimental-strip-types --test opencode-cloud/test/patch-export.test.mjs opencode-cloud/test/demo-text.test.mjs opencode-cloud/test/ui-demo-initials.test.mjs
cd web
npm ci --ignore-scripts --maxsockets=2 --fetch-retries=0
npm test
npm run build
./node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort >/tmp/preview.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid"' EXIT
node --input-type=module -e 'for(let i=0;i<50;i++){try{const r=await fetch("http://127.0.0.1:5173");if(r.ok){const s=await fetch("http://127.0.0.1:5173/static.html");if(!s.ok||!(await s.text()).includes("文本统计器"))throw Error("Static entry missing");console.log("CLEAN_STATIC_HTTP_PASS");break}}catch(e){if(i===49)throw e}await new Promise(r=>setTimeout(r,100))}'
cd /workspace/project
playwright-cli -s=clean open http://127.0.0.1:5173 --config /trusted/browser.json
playwright-cli -s=clean run-code "async (page) => { if(!(await page.locator('body').innerText()).includes('WorkBench：实时预览验收完成'))throw Error('React entry missing latest task'); await page.goto('http://127.0.0.1:5173/static.html'); await page.getByRole('textbox',{name:'输入文本'}).fill('hello one two cat'); await page.getByRole('button',{name:'统 计',exact:true}).click(); const n=await page.locator('#wordCount').innerText(); if(n!=='4')throw Error('Word count '+n); await page.getByRole('button',{name:'清 空',exact:true}).click(); if((await page.locator('textarea').inputValue())!=='')throw Error('Clear failed'); return 'CLEAN_REACT_AND_STATIC_DOM_PASS'; }"
playwright-cli -s=clean close
`;
const result={status:'IN_PROGRESS',kind:'real_downloads_clean_copies',image,checks:[]};
try {
 for(const kind of ['zip','patch']) {
  const base=path.resolve('runtime/sidebar-preview-reproduce/'+kind),project=kind==='zip'?base+'/source':base;
  const args=['run','--rm','--name','workbench-sidebar-reproduce-'+kind,'--init','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1000:1000','--memory','2g','--cpus','2','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--network',network,'-e','HTTPS_PROXY=http://admin-web-egress:8320','-e','HTTP_PROXY=http://admin-web-egress:8320','-e','NO_PROXY=127.0.0.1,localhost','-v',project+':/workspace/project','-v',path.resolve('runtime/sidebar-preview-reproduce/'+kind+'-state')+':/state','-v',path.resolve('runtime/admin-browser.json')+':/trusted/browser.json:ro','-w','/workspace/project',image,'bash','-lc',script];
  let output;try{output=execFileSync('docker',args,{encoding:'utf8',timeout:240000});}catch(e){writeFileSync('evidence/sidebar-preview-clean-'+kind+'-final.log',String(e.stdout||'')+String(e.stderr||''));throw e;}
  writeFileSync('evidence/sidebar-preview-clean-'+kind+'-final.log',output);
  assert.match(output,/# pass 15/);assert.match(output,/# pass 29/);assert.match(output,/# fail 0/);assert.match(output,/CLEAN_STATIC_HTTP_PASS/);assert.match(output,/### Result\s+"CLEAN_REACT_AND_STATIC_DOM_PASS"/);assert.ok(!output.includes('### Error'));
  result.checks.push({kind,status:'PASS',originalTests:15,webTests:29,buildExit:0,reactDOM:'latest file-upload application and release hint present',staticDOM:'4 words and clear empty',staticHTTP:200});
  console.log('PASS clean',kind,'15 original +29 web tests,build,staticHTTP and actual React DOM');
 }
 result.status='PASS';
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{writeFileSync('evidence/sidebar-preview-clean-result.json',JSON.stringify(result,null,2)+'\n');}
