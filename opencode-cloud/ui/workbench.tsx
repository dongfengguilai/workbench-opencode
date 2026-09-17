import { createContext, createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, useContext, type ParentProps } from "solid-js"
import { useNavigate, useLocation } from "@solidjs/router"
import { useTheme } from "@opencode-ai/ui/theme"
import { useCommand } from "@/context/command"
import { useTabs } from "@/context/tabs"
import { ServerConnection } from "@/context/server"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeSessionsController } from "@/pages/home/home-sessions-controller"
import "./workbench.css"
import {Deliverables} from "./deliverables"

type Identity = { user_id: string; display_name: string; project: string; directory: string; ready: boolean }
async function identity(): Promise<Identity> {
  const response = await fetch('/__platform/me')
  if (response.status === 401) { location.replace('/__platform/login'); throw new Error('请重新登录。') }
  if (!response.ok) throw new Error('无法连接本人云端环境，请稍后重试。')
  const me = await response.json()
  if (me.directory !== '/workspace/project') throw new Error('授权项目不匹配。')
  return me
}
function createWorkbench() {
  const home = createHomeController()
  const sessions = createHomeSessionsController(home)
  const tabs = useTabs()
  const [me, actions] = createResource(identity)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  createEffect(() => {
    const user = me(); const ctx = home.server.focusedContext(); const conn = home.server.focused()
    if (!user?.ready || !ctx || !conn) return
    ctx.projects.open(user.directory)
    home.selection.set({ server: ServerConnection.key(conn), directory: user.directory })
  })
  async function newSession() {
    if (busy()) return
    setBusy(true); setError('')
    try {
      const user = await actions.refetch()
      if (!user?.ready) throw new Error('云端环境尚未就绪，请稍后重试。')
      const conn = home.server.focused(); const ctx = home.server.focusedContext()
      if (!conn || !ctx || !tabs.ready()) throw new Error('项目正在加载，请稍后重试。')
      ctx.projects.open(user.directory); ctx.projects.touch(user.directory)
      await tabs.newDraft({ server: ServerConnection.key(conn), directory: user.directory })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return { me, busy, error, newSession, sessions, reload: actions.refetch }
}
const WorkbenchContext = createContext<ReturnType<typeof createWorkbench>>()
function useWorkbench() { const value = useContext(WorkbenchContext); if (!value) throw new Error('WorkBench context missing'); return value }
function ThemeSwitch() {
  const theme = useTheme()
  createEffect(() => {
    const saved = document.cookie.match(/(?:^|;\s*)workbench_theme=(light|dark)(?:;|$)/)?.[1]
    theme.setColorScheme(saved === 'light' || saved === 'dark' ? saved : 'system')
  })
  function toggle() {
    const mode = theme.mode() === 'dark' ? 'light' : 'dark'
    document.cookie = `workbench_theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    theme.setColorScheme(mode)
  }
  return <button class="wb-icon" aria-label="切换主题" title="切换主题" onClick={toggle}>◐</button>
}
export function WorkBenchShell(props: ParentProps) {
  const command = useCommand()
  const wb = createWorkbench()
  const navigate = useNavigate(); const route = useLocation()
  const [collapsed, setCollapsed] = createSignal(false)
  const [drawer, setDrawer] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [changes, setChanges] = createSignal<{ baseline: string; files: string[] }>()
  const [changesLoading, setChangesLoading] = createSignal(false)
  const [actionError, setActionError] = createSignal('')
  const [deliverables, setDeliverables] = createSignal(false)
  const records = createMemo(() => wb.sessions.data.records().filter(r => r.session.title.toLowerCase().includes(query().toLowerCase())))
  createEffect(() => { route.pathname; route.search; setDrawer(false) })
  const escape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setDrawer(false); setChanges(undefined); setDeliverables(false) }
    if (e.key === 'Tab' && (changes() || deliverables() || drawer())) {
      const scope = document.querySelector(changes() || deliverables() ? '.wb-dialog' : '.wb-sidebar')
      const controls = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input') ?? [])
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }
  createEffect(() => { if (changes()) queueMicrotask(() => document.querySelector<HTMLElement>('.wb-dialog button')?.focus()) })
  createEffect(() => { if (drawer()) queueMicrotask(() => document.querySelector<HTMLElement>('.wb-sidebar .wb-brand')?.focus()) })
  document.addEventListener('keydown', escape); onCleanup(() => document.removeEventListener('keydown', escape))
  createEffect(() => { if (deliverables()) queueMicrotask(() => document.querySelector<HTMLElement>('.wb-deliverables button')?.focus()) })
  async function inspect() {
    if (changesLoading()) return
    setChangesLoading(true); setActionError('')
    try { const r = await fetch('/__platform/changes'); if (!r.ok) throw new Error('检查变更失败，请确认环境状态。'); setChanges(await r.json()) }
    catch (e) { setActionError(String(e)) } finally { setChangesLoading(false) }
  }
  async function logout() { const r = await fetch('/api/auth/logout', { method: 'POST' }); if (r.ok) location.replace('/__platform/login'); else setActionError('注销失败，请重试。') }
  return <WorkbenchContext.Provider value={wb}>
    <div class="wb-shell" classList={{ 'wb-collapsed': collapsed(), 'wb-drawer-open': drawer() }}>
      <Show when={drawer()}><button class="wb-backdrop" aria-label="关闭导航" onClick={() => setDrawer(false)} /></Show>
      <aside class="wb-sidebar" aria-label="工作台导航">
        <div class="wb-brand-row"><a href="/" class="wb-brand"><span class="wb-logo"/>WorkBench</a><button class="wb-icon" aria-label="折叠侧栏" onClick={() => { setCollapsed(!collapsed()); setDrawer(false) }}>☷</button></div>
        <nav><button class="wb-nav" onClick={wb.newSession} disabled={wb.busy()}><span>＋</span>{wb.busy() ? '正在准备…' : '新建会话'}</button><button class="wb-nav" classList={{ active: route.pathname === '/' }} onClick={() => navigate('/')}><span>▦</span>项目</button></nav>
        <label class="wb-search"><span>⌕</span><input aria-label="搜索会话" placeholder="搜索会话" value={query()} onInput={e => setQuery(e.currentTarget.value)}/></label>
        <div class="wb-history"><p class="wb-eyebrow">最近会话</p><Show when={!wb.sessions.data.loading()} fallback={<p class="wb-muted">正在加载会话…</p>}><For each={records()}>{r => <button class="wb-session-link" classList={{ active: route.pathname.endsWith('/' + r.session.id) }} title={r.session.title} onClick={() => { wb.sessions.session.open(r.session); setDrawer(false) }}>{r.session.title}</button>}</For><Show when={!records().length}><p class="wb-muted">{query() ? '没有匹配的会话' : '开启你的第一个会话'}</p></Show></Show></div>
        <div class="wb-account"><div class="wb-avatar">{wb.me()?.display_name?.slice(0,1) || 'W'}</div><div class="wb-user"><strong>{wb.me()?.display_name || '正在加载'}</strong><span>独立云端空间</span></div><ThemeSwitch/><button class="wb-icon" aria-label="退出登录" title="退出登录" onClick={logout}>↪</button></div>
      </aside>
      <section class="wb-content">
        <header class="wb-toolbar"><div class="wb-toolbar-title"><button class="wb-icon wb-menu" aria-label="打开导航" onClick={() => { setCollapsed(false); setDrawer(true) }}>☷</button><span>{route.pathname === '/' ? '项目' : 'workbench-opencode'}</span><span class="wb-state" classList={{ ready: wb.me()?.ready }}>● {wb.me.loading ? '连接中' : wb.me()?.ready ? '环境就绪' : '环境未就绪'}</span></div><div id="opencode-titlebar-center" class="wb-native-search"/><div class="wb-actions"><div id="opencode-titlebar-right" class="wb-native-controls"/><Show when={route.pathname !== "/"}><button onClick={() => command.trigger("terminal.toggle")}>终端</button><button onClick={() => command.trigger("fileTree.toggle")}>文件</button></Show><button onClick={inspect} disabled={changesLoading()}>{changesLoading() ? '检查中…' : '检查变更'}</button><button onClick={() => setDeliverables(true)}>项目成果</button></div></header>
        <Show when={wb.error() || wb.me.error || actionError()}><div class="wb-error" role="alert">{wb.error() || wb.me.error?.message || actionError()}<button onClick={() => wb.reload()}>重试连接</button></div></Show>
        <main class="wb-native">{props.children}</main>
      </section>
      <Show when={deliverables()}><div class="wb-modal-layer" onClick={e => { if (e.target === e.currentTarget) setDeliverables(false) }}><Deliverables session={route.pathname.match(/\/session\/(ses_[\w-]+)/)?.[1]} close={() => setDeliverables(false)}/></div></Show>
      <Show when={changes()}>{data => <div class="wb-modal-layer" onClick={e => { if (e.target === e.currentTarget) setChanges(undefined) }}><section class="wb-dialog" role="dialog" aria-modal="true" aria-label="检查变更"><header><h2>检查变更</h2><button autofocus={true} class="wb-icon" aria-label="关闭变更" onClick={() => setChanges(undefined)}>×</button></header><p class="wb-muted">相对固定基线 {data().baseline.slice(0,12)}</p><div class="wb-change-list"><For each={data().files}>{file => <div><code>{file}</code></div>}</For><Show when={!data().files.length}><p>当前没有变更</p></Show></div><p class="wb-muted">代码内容与 Diff 请在原生会话的变更区域查看。</p><a class="wb-primary" href="/__platform/download" download="workbench-opencode.patch" rel="external" onClick={e => { e.preventDefault(); location.assign('/__platform/download') }}>下载完整补丁 ↓</a></section></div>}</Show>
    </div>
  </WorkbenchContext.Provider>
}
export function WorkBenchProjects() {
  const wb = useWorkbench()
  const latest = () => wb.sessions.data.records()[0]
  return <div class="wb-projects"><div class="wb-page-heading"><div><p class="wb-eyebrow">你的云端工作空间</p><h1>项目</h1><p class="wb-muted">从一个想法开始，继续创造。</p></div><button class="wb-primary" onClick={wb.newSession} disabled={wb.busy()}>{wb.busy() ? '正在准备…' : '＋ 新建会话'}</button></div>
    <div class="wb-section-label">已授权项目 <span>01</span></div>
    <article class="wb-project-card"><div class="wb-project-icon">▦</div><div class="wb-project-info"><h2>{wb.me()?.project || 'workbench-opencode'}</h2><p>本人独立环境 · 项目与会话持续保存</p><span class="wb-state" classList={{ ready: wb.me()?.ready }}>● {wb.me()?.ready ? '云端环境就绪' : '正在连接云端环境'}</span></div><button class="wb-outline" disabled={wb.busy()} onClick={wb.newSession}>进入项目 →</button></article>
    <div class="wb-section-label">最近活动</div><Show when={!wb.sessions.data.loading()} fallback={<p class="wb-muted">正在加载…</p>}><For each={wb.sessions.data.records().slice(0,8)}>{r => <button class="wb-activity" onClick={() => wb.sessions.session.open(r.session)}><span><strong>{r.session.title}</strong><small>workbench-opencode</small></span><time>{new Date(r.session.time.updated || r.session.time.created).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</time><span>↗</span></button>}</For><Show when={!latest()}><p class="wb-muted wb-empty">还没有会话。创建一个真实代码任务吧。</p></Show></Show>
    <p class="wb-project-note">代码、提示词与工具输出会发送到批准的 Qwen / Luna 模型。</p>
  </div>
}
