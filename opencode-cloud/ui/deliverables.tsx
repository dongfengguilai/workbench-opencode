import type {createPreview} from './preview-panel'
import {createSignal,For,onMount,Show} from 'solid-js'
export function Deliverables(props:{preview:ReturnType<typeof createPreview>;session?:string;close:()=>void}) {
 const [status,setStatus]=createSignal<any>();const [busy,setBusy]=createSignal(false);const [error,setError]=createSignal('');const [log,setLog]=createSignal('');const [records,setRecords]=createSignal<any>();const [link,setLink]=createSignal('')
 async function api(action:string,method='GET'){const r=await fetch('/__platform/preview/'+action,{method});const b=await r.json();if(!r.ok)throw Error(b.detail||'环境操作失败');return b}
 async function run(fn:()=>Promise<void>){if(busy())return;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 const refresh=()=>run(async()=>{setStatus(await api('status'));setLog((await api('log')).output);if(props.session)setRecords(await api('verification?session='+encodeURIComponent(props.session)))})
 onMount(refresh)

 async function download(path:string,name:string){await run(async()=>{const r=await fetch(path);if(!r.ok){const b=await r.json();throw Error(b.detail||'下载失败')}await r.body?.cancel();const a=document.createElement('a');a.href=path;a.download=name;a.rel='external';document.body.append(a);a.click();a.remove()})}
 return <section class="wb-dialog wb-deliverables" role="dialog" aria-modal="true" aria-label="项目成果"><header><h2>项目成果</h2><button class="wb-icon" aria-label="关闭成果" onClick={props.close}>×</button></header>
 <p class="wb-muted">源码与会话持续保存 · 网页项目支持本人独立预览</p><Show when={error()}><p class="wb-error" role="alert">{error()}</p></Show>
 <Show when={props.preview.status()?.web?.available}><div class="wb-result-actions"><button class="wb-outline" disabled={props.preview.busy()} onClick={()=>{props.close();void props.preview.show()}}>在右侧预览</button></div><p class="wb-muted">{props.preview.status()?.running?'网页运行中，支持实时更新':'网页尚未启动；打开预览将启动本人服务。'}</p></Show>
<Show when={props.preview.status()?.web?.present&&!props.preview.status()?.web?.available}><p class="wb-error">{props.preview.status()?.web?.reason}</p></Show>
 <details open><summary>运行日志</summary><pre class="wb-result-output">{log()||'暂无运行日志。首次启动需要 web/index.html。'}</pre></details>
 <div class="wb-result-actions"><button class="wb-primary" disabled={busy()} onClick={()=>download('/__platform/source.zip','WorkBench-source.zip')}>下载源码 ZIP ↓</button><button class="wb-outline" disabled={busy()} onClick={()=>download('/__platform/download','workbench-opencode.patch')}>下载补丁 ↓</button></div><p class="wb-muted">ZIP 包含当前完整源码和运行说明；依赖、密钥、缓存与浏览器制品不导出。任务运行时请先停止或等待完成。</p>
 <h3>当前会话验证结果</h3><Show when={props.session} fallback={<p class="wb-muted">请进入一个原生会话查看命令和截图。</p>}><p class="wb-muted">{props.session} · 原生工具命令、退出码和输出。退出 0 不等同于网页断言通过，缺少可信退出码显示“未确认”。</p><For each={records()?.screenshots}>{name=><a class="wb-screenshot" href={'/__platform/preview/screenshot?session='+encodeURIComponent(props.session!)+'&name='+encodeURIComponent(name)} target="_blank" rel="noopener"><img alt={'原生浏览器截图 '+name} src={'/__platform/preview/screenshot?session='+encodeURIComponent(props.session!)+'&name='+encodeURIComponent(name)}/><span>{name} ↗</span></a>}</For><For each={records()?.commands}>{c=><details><summary>{c.result} · {c.command.slice(0,110)}</summary><pre class="wb-result-output">{c.command+'\n\n退出码：'+(c.exit===null?'未确认':c.exit)+'\n'+c.output}</pre></details>}</For><Show when={!records()?.commands?.length}><p class="wb-muted">当前会话尚无原生 Bash 验证记录。</p></Show></Show>
 </section>
}
