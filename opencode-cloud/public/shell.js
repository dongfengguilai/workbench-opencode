// Same-tag native UI remains intact; only hosted controls and management affordances are adapted.
fetch('/__platform/me').then(r=>r.json()).then(me=>{const bar=document.createElement('nav');bar.id='platform-bar';const label=document.createElement('span');label.textContent=me.display_name+' · '+me.project+' · '+(me.ready?'云端环境就绪':'环境未就绪');bar.append(label);for(const [text,url] of [['授权项目',me.project_url],['变更清单','/__platform/changes'],['下载变更','/__platform/download']]){const a=document.createElement('a');a.textContent=text;a.href=url;if(url.startsWith('/__platform/')){a.rel='external';a.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();location.assign(url);});if(url.endsWith('/download'))a.download='workbench-opencode.patch';}bar.append(a);}const logout=document.createElement('button');logout.textContent='退出登录';logout.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.replace('/__platform/login');};bar.append(logout);document.body.prepend(bar);});
function trim(){for(const el of document.querySelectorAll('button,[role="menuitem"],[role="tab"],[role="option"],a')){if(el.closest('#platform-bar'))continue;const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim();if(/^(Open settings|Add project|Open project|New project|Desktop|Server|Agents|Skills|MCP|Plugins|Connect provider|Connect a provider|Add provider|Add server|Manage models|Settings|Share session|Share|Select server|Providers|Servers|Models|连接提供商|添加服务器|设置|分享)$/.test(label))el.setAttribute('data-cloud-hidden','');}}
new MutationObserver(trim).observe(document.documentElement,{childList:true,subtree:true});trim();
// Read-only reconciliation: never change native messages or replay a prompt.
const warning=document.createElement('aside');warning.id='platform-warning';warning.setAttribute('role','status');warning.hidden=true;document.body.append(warning);
let checking=false;
async function checkNativeOutcome(){
 const sid=location.pathname.match(/\/session\/(ses_[\w-]+)$/)?.[1];if(!sid||checking){if(!sid)warning.hidden=true;return;}
 checking=true;
 try{
  const st=await fetch('/session/status');if(!st.ok)throw new Error('unavailable');const states=await st.json();
  const r=await fetch('/session/'+sid+'/message');if(!r.ok)throw new Error('unavailable');const messages=await r.json();
  if(!location.pathname.endsWith('/'+sid))return;
  const last=messages.filter(m=>m.info?.role==='assistant').at(-1);
  const unfinished=last?.parts?.some(p=>p.type==='tool'&&['running','pending'].includes(p.state?.status));
  const idle=!states[sid]||states[sid].type==='idle';
  warning.hidden=!(idle&&unfinished);
  if(!warning.hidden)warning.textContent='原生实例当前空闲，但此会话仍有未完成的工具记录：结果待确认。请检查文件与测试后再明确提交新任务；不会自动重发。';
 }catch{if(location.pathname.endsWith('/'+sid)){warning.hidden=false;warning.textContent='云端环境暂不可用：任务结果待确认。恢复后请检查原会话，不要盲目重复发送。';}}
 finally{checking=false;}
}
setInterval(checkNativeOutcome,5000);checkNativeOutcome();

window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();event.stopImmediatePropagation();}},true);
