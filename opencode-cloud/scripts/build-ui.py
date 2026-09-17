"""Build only the pinned native frontend; never alter native environments/data."""
from pathlib import Path
import hashlib, json, shutil, subprocess, os, difflib, urllib.request, tarfile, zipfile
root = Path(__file__).resolve().parents[1]
source = root / 'vendor/workbench-ui-source'
upstream = root / 'vendor/opencode-1.18.31'
provenance = json.loads((root/'evidence/source-provenance.json').read_text())
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def fetch(url, target, expected):
    if not target.exists():
        target.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(url,timeout=60) as response: target.write_bytes(response.read())
    assert digest(target)==expected, 'Archive digest mismatch: '+str(target)
archive=root/'vendor/opencode-v1.18.31.tar.gz'
fetch('https://codeload.github.com/anomalyco/opencode/tar.gz/refs/tags/v1.18.31',archive,provenance['source_archive_sha256'])
if not upstream.exists():
    with tarfile.open(archive) as t: t.extractall(root/'vendor',filter='data')
if not source.exists(): shutil.copytree(upstream,source)
bun = root/'vendor/bun-1.3.14/bun-linux-x64/bun'
fetch('https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip',bun.parent.parent/'bun.zip','951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f')
if not bun.exists():
    bun.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(bun.parent.parent/'bun.zip') as z: bun.write_bytes(z.read('bun-linux-x64/bun'))
    bun.chmod(0o755)
assert subprocess.check_output([bun,'--version'],text=True).strip() == '1.3.14'
assert digest(source/'bun.lock') == digest(upstream/'bun.lock'), 'Original lock required'
changes = {}
def edit(name, transform):
    original = (upstream/name).read_text()
    result = transform(original)
    (source/name).write_text(result)
    changes[name] = (original, result)
def replace(text, old, new):
    assert old in text, 'Pinned source mismatch: '+old[:70]
    return text.replace(old,new,1)
for name, overlay in [('packages/app/src/pages/layout-new.tsx','layout-new.tsx'),('packages/app/src/pages/home.tsx','home.tsx')]:
    edit(name, lambda _, overlay=overlay: (root/'ui'/overlay).read_text())
for name in ['workbench.tsx','workbench.css']:
    shutil.copyfile(root/'ui'/name, source/'packages/app/src'/name)
edit('packages/app/src/context/settings.tsx', lambda s: replace(s,'const newLayoutDesigns = createMemo(() => {','const newLayoutDesigns = createMemo(() => {\n      return true // Fixed hosted WorkBench layout; no user runtime configuration.'))
def entry(s):
    s = replace(s,'const lsDefault = readDefaultServerUrl()', 'const lsDefault = null // Hosted origin is fixed by the platform.')
    s = replace(s,'const stored = readDefaultServerUrl()', 'const stored = null')
    s = replace(s,'const auth = authFromToken(new URLSearchParams(location.search).get("auth_token"))','const auth = {} // Browser-supplied native credentials are disabled.')
    s = replace(s,'authToken: !!auth,','authToken: false,')
    return replace(s,'<AppBaseProviders locale={locale}>','<AppBaseProviders locale="zh">')
edit('packages/app/src/entry.tsx',entry)
def home_index(s):
    start=s.index('const index = await loadHomeSessionIndex(')
    end=s.index('\n      cache.complete',start)
    s = s[:start]+'''const response = await ctx.sdk.client.session.list({ directory: "/workspace/project" }, { signal })
      const index = {
        sessions: (response.data ?? []).filter(session => !session.parentID && !session.time.archived),
        eventSequence,
      }'''+s[end:]
    s = replace(s,'enabled: false,\n  }))','enabled: false,\n  }), () => homeSessions().queryClient)')
    return replace(s,'refetchOnReconnect: true,\n  }))','refetchOnReconnect: true,\n  }), () => homeSessions().queryClient)')
edit('packages/app/src/pages/home/home-sessions-controller.tsx',home_index)
edit('packages/app/src/context/global-sync/home-session-index.ts',lambda s: replace(s,'return {\n    indexKey,','return {\n    queryClient, // Reuse the same native cache client in the hosted sidebar.\n    indexKey,'))
def session_layout(s):
    s = replace(s,'const desktopTerminalOpen = createMemo(() => isDesktop() && terminalOpen())','const desktopTerminalOpen = createMemo(() => false) // Hosted terminal occupies the bottom, not the review column.')
    s = replace(s,'isDesktop() ? desktopV2PanelLayout().visible : terminalOpen()','isDesktop() && desktopV2PanelLayout().visible')
    start=s.index('              <Show when={desktopV2PanelLayout().stacked}>')
    end=s.index('\n            </div>',start)
    s=s[:start]+s[end:]
    bottom='''      <Show when={newSessionDesign() && terminalOpen()}>
        <div class="min-h-0 shrink-0 px-2 pb-2">
          <Show when={isDesktop()}>
            <div class="relative h-2 shrink-0" onPointerDown={() => size.start()}>
              <ResizeHandle direction="vertical" size={layout.terminal.height()} min={100}
                max={window.innerHeight * 0.6} collapseThreshold={50}
                onResize={(height) => { size.touch(); layout.terminal.resize(height) }}
                onCollapse={() => view().terminal.close()} />
            </div>
          </Show>
          <TerminalPanelV2 stacked={true} />
        </div>
      </Show>
'''
    return replace(s,'      <Show when={!newSessionDesign()}>\n        <TerminalPanel />',bottom+'      <Show when={!newSessionDesign()}>\n        <TerminalPanel />')
edit('packages/app/src/pages/session.tsx',session_layout)
def index(s):
    s = replace(s,'lang="en"','lang="zh-CN"')
    s = replace(s,'<title>OpenCode</title>','<title>WorkBench</title>')
    s = replace(s,'<link rel="icon" type="image/svg+xml" href="/favicon-v3.svg" />','<link rel="icon" type="image/svg+xml" href="/__platform/favicon.svg" />')
    # Avoid inherited favicon/remote sharing metadata and keep theme preload external.
    s = '\n'.join(line for line in s.splitlines() if not any(x in line for x in ['favicon-96x96','favicon-v3.ico','apple-touch-icon','rel="manifest"','social-share']))+'\n'
    return replace(s,'<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>','<script src="/oc-theme-preload.js"></script>\n    <script defer src="/__platform/workbench-guard.js"></script>')
edit('packages/app/index.html',index)
edit('packages/app/public/oc-theme-preload.js',lambda s: replace(s,'var scheme = localStorage.getItem("opencode-color-scheme") || "system"','var scheme = document.cookie.match(/(?:^|;\\s*)workbench_theme=(light|dark)(?:;|$)/)?.[1] || "system"'))
patch = ''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+name,tofile='b/'+name)) for name,(a,b) in changes.items())
(root/'ui/upstream.patch').write_text(patch)
env = dict(os.environ, PATH=str(bun.parent)+os.pathsep+os.environ['PATH'], OPENCODE_CHANNEL='prod')
with (root/'evidence/workbench-ui-install-final.log').open('w') as log:
    subprocess.run([bun,'install','--frozen-lockfile'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
with (root/'evidence/workbench-ui-typecheck.log').open('w') as log:
    subprocess.run([bun,'run','--cwd','packages/app','typecheck'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
with (root/'evidence/workbench-ui-build.log').open('w') as log:
    subprocess.run([bun,'run','--cwd','packages/app','build'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
dist = source/'packages/app/dist'
files = { '/'+p.relative_to(dist).as_posix(): digest(p) for p in sorted(dist.rglob('*')) if p.is_file() and not p.name.endswith('.map') and p.name != '_headers' }
out = root/'public/workbench-ui'
out.mkdir(exist_ok=True)
for path in files:
    target = out/path[1:]; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(dist/path[1:],target)
(out/'manifest.json').write_text(json.dumps(files,indent=2)+'\n')
(root/'evidence/workbench-ui-build.json').write_text(json.dumps({'tag':provenance['tag'],'commit':provenance['commit'],'sourceSha256':provenance['source_archive_sha256'],'bun':'1.3.14','bunArchiveSha256':digest(bun.parent.parent/'bun.zip'),'lockSha256':digest(source/'bun.lock'),'patchSha256':digest(root/'ui/upstream.patch'),'overlaySha256':{p.name:digest(p) for p in (root/'ui').glob('*') if p.is_file()},'command':'bun run --cwd packages/app build','files':files},indent=2)+'\n')
print('Built pinned WorkBench UI:',len(files),'allowlisted files; native/data unchanged')
