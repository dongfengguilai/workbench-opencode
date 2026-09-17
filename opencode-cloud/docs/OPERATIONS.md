# 固定试用部署

所有命令从仓库的 `opencode-cloud` 目录执行。Linux x86_64、Docker/Compose >=2.40（!override）、Git、Python3、OpenSSL、util-linux/e2fsprogs、共享传播宿主挂载、loop 设备为真实要求。Docker 控制权限只在维护者侧，平台和工作容器没有 Socket。旧 agent_platform 不参与运行。

## 新部署

模型是固定 `http://192.168.142.130:8317/v1` 的 gpt-5.6-luna。维护者把已授权 Key 放入 owner-only 单行文件；不在命令行写 Key。先验证模型真实可用，不能用开发响应替代。

```sh
python3 scripts/fetch-upstream.py
# 仅构建时使用已有网络代理；没有代理则去掉 build-arg。
docker build --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy -t opencode-cloud/native:1.18.31-managed-v0 .
python3 scripts/build-browser.py
python3 scripts/initialize.py --project /ABS/AUTHORIZED/PROJECT --baseline FULL_COMMIT_SHA --origin https://TRIAL_HOST:8443 --model-key-file /ABS/PROTECTED/MODEL_KEY
python3 scripts/quota.py --migrate-stopped
python3 scripts/build-ui.py
# 新批准的 Qwen Key 同样仅放入 owner-only 文件
python3 scripts/configure-qwen.py --key-file /ABS/PROTECTED/QWEN_KEY
./scripts/start.sh
./scripts/status.sh
```

initialize 拒绝非空 runtime。clone 为新副本，不重置用户目录，移除 remote，不注入 SSH 或仓库凭据。真实 local-admin 分支复用旧登录代码；NetID 客户端保留但没有正式配置/验证，不能声称 NetID 已验收。生成两个真实本地试用账号，不使用 Mock。证书为 30 天自签试用证书；受信任 HTTPS 应由维护者替换 runtime/tls.key、tls.crt，并匹配 origin。密钥文件 0600，runtime 不入 Git。

固定 OpenCode v1.18.31，commit 014614d35b397775e5d397a490fc72368c894ec2，制品 SHA256 b283e8dbe9e6fc224bb4b79992ce3bd2174b8b7b0c3e7d1b4e6024a1d11edc84。官方原生二进制不变；WorkBench 前端从同一固定源码构建，只修改品牌、布局和必要导航。原内嵌 UI 保留作维护者回滚。资源受控：CPU2、内存2GiB、PID256、临时目录256MiB；每身份项目和完整原生状态共享独立 1GiB ext4 文件系统。scope 模型凭据只访问固定路由，最多并发2、输出16000 Token、UTC 日管理员100,000次／普通用户250次上游请求（包括失败），计数在各自 gateway-state 持久化；主 Key 仅在可信网关。

quota.py 的短暂维护容器仅用于新 loop 文件系统：SYS_ADMIN/DAC_OVERRIDE/CHOWN/MKNOD、AppArmor unconfined、无网络，不是工作容器。工作容器始终非 root、所有能力删除、只读系统、内部独立网络。脚本验证实际 bounded ext4 挂载，条件不满足则退出，不能退回宿主无限磁盘。迁移要求停机及冷备，原项目/状态目录保留 .prequota-*；不删除。宿主重启后运行 start.sh 会恢复 loop 挂载；不可绕过脚本启动到未挂载目录。

固定模型上游当前自身依赖 localhost:7890。model-repair profile 的真实 TCP bridge 只绑定宿主 127.0.0.1:7890，转发到已有 192.168.56.1:7890；并非模拟模型。若外部代理变更，需要维护者更新固定配置并重新做真实模型验收。不能静默切换模型。

用户于 2026-09-17 批准公开 HTTPS 访问。每环境独立 web-egress/admin-web-egress，只有本人内部网络与可信 model-egress 外连网络，无宿主发布端口、无模型密钥。工作容器依然只有 internal 网络，不能直接访问公网或现有外部代理。Compose 固定设置两种大小写 HTTP(S)_PROXY；ALL_PROXY 为空，NO_PROXY 只有回环及本人模型网关，不对用户开放配置。Bun 内嵌在原 v1.18.31 中，已以真实 Luna/原生 Webfetch 查询 wttr.in 并读取 Bun 文档证明环境变量生效，不修改工具或二进制。

网关仅接受公开目标 443 的 CONNECT，每次检查全部解析地址、优先 IPv4，再通过现有 192.168.56.1:7890 代理 CONNECT 已验证字面 IP；不把域名交给上游重新解析。IPv6 必须属于 2000::/3 且不在特殊地址清单，实际可达性取决于外部代理。IANA 全部特殊地址块保守拒绝（包括少量全球可达例外），另拒绝 IPv4 多播。来源 CSV、派生清单和 SHA256 在 src/egress-policy；启动校验摘要，更新时必须维护者复核来源、重生成清单并重新做网络验收，不自动下载更新。原生自己验证目标 TLS；网关不解密、不改证书校验、不重试。每环境 4 隧道、连接10秒、空闲120秒，日志仅目标/结果/拒绝原因，不含 URL 查询、Header 或内容。普通 HTTP 与非 443 不支持。

新增网关健康是原生服务启动前置条件，status.sh 检查两者。只修改网关源码时可在任务空闲后 `docker compose restart web-egress admin-web-egress`；更改原生代理配置必须用完整 start.sh 同时重建 native/guard/UID 防火墙。缺少真实外部代理时如实报告上游连接错误，不改用模拟响应或开放直连。

当前网络修复验证：`node --test test/web-egress.test.mjs`（局部安全测试）；`node test/web-egress-live.mjs`（真实两个容器、TLS 网站和直接/代理拒绝）；`node test/web-egress-regression.mjs`（真实账号、原生工具记录、下载及新副本应用）。最后一个依赖已完成的浏览器天气会话，会创建新独立验证目录，不改现有项目。宿主 /usr/bin/node 虽为22.22.1但无 TypeScript 支持，补丁回归因此在实际部署的相同镜像 ID 中以无网络、只读新副本运行，不降低断言。可见浏览器操作必须使用当前 Codex 的浏览器控制工具；下方历史 Playwright 脚本不能代替这次内置浏览器证据。

## 启停、身份与配置

```sh
./scripts/stop.sh
./scripts/start.sh
./scripts/status.sh
```

只 stop，不 down -v。start 同时重建 native、防火墙及 guard，避免 network namespace 换新后 UID 管理端口防火墙丢失。不得只 recreate native。正常工作进程 UID1000 不能直连4030，UID1001可信 guard 在同网络命名空间代理4096；只有平台8443发布公网。环境内部模型 route 8318，没有原生服务公网映射。

运行时更改 platform.json 时原文件原位写入（单文件只读 bind 不追踪原子 rename 的新 inode），或者正常重建平台。enabled=false/会话过期每2秒撤销已有 SSE/WS，写操作每次验证。配置不可读时请求503、关闭长连接。注销只撤销该浏览器登录，不抹除原生会话。模型撤销可停对应 gateway 或轮换该 scope token，更新两个对应配置后受控重启；不会给用户提供主 Key。

## 验证

```sh
./scripts/native-smoke.sh
node test/platform-live.mjs
node test/export-live.mjs
# Playwright 和 Chromium 必须是真实可用依赖；当前维护机使用记录的 bundled Node/Playwright。
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/persistence-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/isolation-live.mjs
node test/admission-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/native-terminal-ui-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/faults-live.mjs
```

浏览器测试使用真实 HTTPS/local credentials/容器/模型，只有自签证书校验在试用测试中显式关闭。config-live.mjs、browser-flow.mjs 会创建验收数据、发真实模型任务；首次基线断言不可绕过，重复执行需维护者提供新的独立验收副本，不重置现有工作。单元测试 test/model-gateway.test.mjs 使用不可达上游，仅验证边界，不能替代模型验收。失败日志保留，不把退出成功当作全部必需场景通过。

## 冷备与独立恢复

```sh
python3 scripts/backup.py runtime/backups/NEW_NAME.tar.gz
python3 scripts/restore.py runtime/backups/NEW_NAME.tar.gz runtime/NEW_RESTORE_PATH
```

backup 先实际检查两个原生状态 idle，停止 admissions 与原生进程，保存项目、原生 DB/WAL/快照/日志/XDG state、平台登录摘要和配置；然后安全重启全部实例。备份含真实秘密，0600，不入 Git、不对浏览器提供。restore 校验 SHA256，只接受不存在的新目标，拒绝覆盖当前卷。

恢复功能验证由 test/restore-live.mjs 在新的 Compose 项目和内部网络实际启动恢复副本，检查同一 Session/文件摘要，再由原生模型执行测试。恢复环境仍使用 UID 防火墙和 guard；临时环境停止后保留恢复数据。不要只验证文件存在，也不要以聊天文本导出代替 SQLite 会话。

当前部署与证据参考 evidence/baseline.md、各验收 result.json 及 STATUS.md；A10 必须实际用户签收。

## Codex 内置浏览器本机入口

在运行 Codex 的当前宿主机执行（需要 Node 22 或以上）：

```sh
python3 scripts/local-browser.py start
python3 scripts/local-browser.py status
python3 scripts/local-browser.py stop
```

只启动本机代理，复用运行中的平台与原生环境，不重启容器、不重发任务。浏览器打开 `http://127.0.0.1:8444`；该端口只绑定宿主机回环，不提供远程 HTTP 登录。代理固定连接当前批准的 HTTPS 平台，使用 runtime/tls.crt 校验地址、证书链、有效期及准确叶证书 SHA256，不使用 rejectUnauthorized=false。证书更换后需重启本机代理。HTTP/SSE/原生终端 WebSocket/下载均直接转发；仅本机响应中的 agent_session 移除 Secure，HttpOnly/SameSite/注销保持，原 HTTPS 入口不变。

完整启动时可用 `sh scripts/start.sh --local-browser`；完整 stop 同时停止代理。代理 PID/starttime 与日志在忽略的 runtime 内，仅停止核对为本脚本的进程，遇到他人占用 8444 拒绝启动。`LOCAL_BROWSER_TRACE=1 python3 scripts/local-browser.py start` 可临时记录方法、无查询字符串的路径和状态，不记录 Header、Cookie、密码、请求内容或模型 Key。默认不启用逐请求日志。

## 原生浏览器、源码与独立预览

固定工具在 `Dockerfile.browser`、`browser-tools/package-lock.json`：Microsoft `@playwright/cli@0.1.20`，Playwright/core `1.64.0-alpha-2026-09-14`，Chromium revision1244／154.0.8037.0，Vite7.3.6。构建时安装全部浏览器和依赖，不在任务中下载安装 latest。原生 OpenCode 二进制 SHA256 不变。版本、实际镜像和两种 Chromium 可执行文件摘要在 `evidence/delivery-browser-image.json`。

原固定 managed 镜像作为基础，`python3 scripts/build-browser.py` 使用小型无密钥构建上下文。构建前按现有部署条件设置维护者代理环境变量。Debian 构建依赖使用带签名验证的 TUNA 镜像；该构建网络不是用户工作容器网络。已冷备并部署 npm 最大2连接／不重试镜像 sha256:264c89bb377c3fdd2d6c88ba857c3abe6ff20864314f31bc8e3717f42cb3fcd3，运行标签为 browser-v1。原镜像保留为 opencode-cloud/native:1.18.31-browser-rollback-before-npm2。真实Qwen、29测试、公开HTTPS／重定向／原生Webfetch与预览WS回归证据分别见 admin-quota-network-native-result.json、admin-quota-release-transport-result.json。两身份会话、源码、Git状态和索引维护前后完全一致，见 admin-quota-release-result.json。回滚时先确认idle并冷备，将回滚镜像重标 browser-v1，只协调重建 native/admin-native、对应guard和防火墙，保留所有持久数据；不要初始化。

`prepare-browser.py` 只针对存在的项目和原生状态，缺原数据即拒绝，不初始化。本人浏览器配置、代理和浏览器专用 XDG 目录由维护者固定；`/trusted/BROWSER_USAGE.md` 只读，追加到原生 instructions。CLI 打开时必须显式 `--config /trusted/browser.json`，避免项目配置优先级覆盖。采用同一官方 bundle 的 headless shell，避免完整 Chrome 的 Google 后台连接占满本人4隧道。网关 FIN 清理释放断开连接，仍保留4连接／10秒连接／120秒空闲边界。浏览器非 root、本人容器内，无 Docker socket 或宿主浏览器连接。

原生 PTY 承载唯一预览，固定 `web/` 与127.0.0.1:5173。静态网页用镜像固定 Vite；React 用锁文件安装的 Vite及 `dev: vite`，受控配置采用 automatic JSX，不加载项目 Vite 插件配置。守护程序不接受命令／URL／目录／端口参数；端口占用拒绝，删除的只是本人明确标题的预览 PTY，不杀任意进程。Native PTY 生命周期不持久化，环境重启后需点启动，源码／会话／PNG仍持久化。

```sh
python3 scripts/local-preview.py start
python3 scripts/local-preview.py status
python3 scripts/local-preview.py stop
```

预览入口仅127.0.0.1:8445监听，浏览器通过 `http://localhost:8445` 一次性入口跳到固定本人 u-摘要.localhost:8445 子来源，有限清单由保护身份配置生成，不接受任意主机。应用存储与host-only预览Cookie按身份来源隔离。同一标签页A→B的local/sessionStorage、Cookie、CacheStorage实测无串用；与工作台 `http://127.0.0.1:8444` 分开。Cookie不按端口隔离，必须使用不同回环主机名。完整 `start.sh --local-browser` 同时检查并启动两入口；只启动 relay 不重建原生服务。独立预览 relay 固定转发HTTPS平台 `/__preview`，验证CA、地址、有效期、准确指纹；额外使用保护配置中的 relayKey，拒绝直接在工作台同源进入预览。普通用户无该配置入口。

平台会话签发30秒一次性票据，换取预览专用30分钟HttpOnly/SameSite=Lax Cookie；原HTTPS保持Secure，只在本机预览响应移除预览Cookie的Secure。票据／凭据仅在内存中，重启平台后重新打开预览。凭据绑定原平台会话及启用身份；每请求检查，扫除失效连接间隔1秒，注销调用原连接撤销流程。平台Cookie、Authorization与内部凭据不送应用；预览不能进入平台管理 namespace。页面、资源和Vite WebSocket经本人guard固定5173转发，不接受任意上游。

`/__platform/source.zip` 使用隔离的临时 Git 元数据、原对象只读alternate和临时索引，捕获全部选定当前源码写入不可变tree后生成ZIP，保留原索引。禁用原项目Git filters/hooks/配置与export-ignore/subst规则；除忽略清单外的合法源码即使被.gitignore忽略也导出。已捕获Git tree中的链接再次按目录链接解析检查，拒绝越界／绝对／缺失目标／循环；子模块、越界/绝对链接、特殊文件、超过4096文件／32MiB明确拒绝。凭据文件、已知工作凭据内容、原生数据、浏览器资料、缓存、依赖、构建、验证制品排除；不是任意秘密识别系统。

验证接口从本人原生session读取Bash输入、状态、metadata.exit及原始输出；不维护第二份业务验证状态，也不根据模型总结给PASS。PNG限本人有效session、固定持久目录、真实路径和8MiB。新版本实际测试命令见 `test/source-export.test.mjs`、`test/preview-sessions.test.mjs`、`test/delivery-boundary-live.mjs`、`test/delivery-transport-live.mjs`；后两者必须运行真实平台。测试使用支持原生TypeScript的Node22.19+构建或已验证的bundled Node24，不能用缺该功能的宿主Node宣布成功。

2026-09-17 用户明确批准管理员日额度提高为100,000次；普通用户250次、并发2、输出16000保持。仅更新保护文件 runtime/admin-gateway.env 的 MODEL_DAILY_REQUEST_LIMIT，再执行 docker compose up -d --no-deps --force-recreate admin-model-gateway；restart 不重新加载 env_file。保留 gateway-state/budget.json 日计数，不清零、不换身份。新环境由 initialize.py 写入分别默认值；现有环境禁止重新初始化。配置备份仅在owner-only runtime/backups，不能提交或输出密钥。真实调整与会话／文件／索引不变证据见admin-quota-result.json；原250次403失败仍保留，额度配置通过不等于新增闭环通过。

发布前保存双用户idle会话／文件／索引摘要并冷备；用固定镜像或 `WORKBENCH_NATIVE_IMAGE` 明确指定已验证镜像，协调原生、guard与UID防火墙重建，保留持久卷。当前发布停止点的保护冷备及摘要在 `delivery-blocked-backup.json`，前后持久化比较在 `delivery-blocked-persistence.json`。只读核对不替代完整恢复演练。

回滚原生入口：`WORKBENCH_NATIVE_IMAGE=opencode-cloud/native:1.18.31-managed-v0 sh scripts/start.sh --local-browser`，保留卷，不运行initialize；该镜像没有CLI/Vite，新增浏览器／预览能力不可用。UI回滚使用下面 `PLATFORM_UI=embedded` 方式；发布前UI归档 `runtime/workbench-ui-before-delivery.tar.gz` 亦保留。不要为了回滚还原用户源码目录、删卷或清空原生状态。

`node --test test/local-browser.test.mjs` 使用实际正在运行的平台检查本机绑定、认证、Origin/Host/CONNECT/WS 与错误证书拒绝；缺少真实平台时失败，不启动替代服务器。可见内置浏览器示例证据见 evidence/local-browser-demo-result.json。这是维护者本机验证入口，不代表远程生产证书验收通过。


## WorkBench UI 与固定 Qwen 路由

从原始 v1.18.31 源码及 bun.lock，用 Bun 1.3.14 执行 `python3 scripts/build-ui.py`；构建脚本校验源归档、Bun 归档及锁文件摘要。补丁与覆盖文件在 ui/，制品清单及 SHA256 在 evidence/workbench-ui-build.json。匿名资源仅登录明确清单；951个工作台资源按构建清单加载且要求身份，未知页面和资源拒绝。没有任意文件服务或宽泛 SPA 回退。

仅更新 UI 时确认两个原生环境空闲，按既有流程冷备并保存 test/ui-snapshot.mjs 输出；构建通过后只执行 `docker compose up -d --no-deps --no-build --force-recreate platform`。不要使用会重建原生的 start.sh 发布 UI。维护者回滚：`PLATFORM_UI=embedded docker compose up -d --no-deps --no-build --force-recreate platform`；恢复新 UI 用 PLATFORM_UI=workbench 的同一命令。均不改持久卷。主题 Cookie 只含 light/dark，无认证数据。

新增 Qwen 由用户于2026-09-17明确批准。固定上游 http://10.243.117.57:4003/v1，精确模型 Qwen3.6-35B-A3B，context131072/output16000，使用原生 OpenAI-compatible chat completions；不模拟 Responses。configure-qwen.py 保存 owner-only 原配置冷备，原位更新受控配置，不初始化项目；Qwen主Key只在两个可信模型网关，原生容器仍只持本人scope Key。网关仅允许Qwen及此前Luna，按模型精确路由，不接受请求选择URL；各环境共享其Qwen/Luna日额度：管理员100,000次、普通用户250次，UTC日结；并发2，不自动回退或重试。

现有运行实例增加模型时，确认两环境 idle 后仅重建两个 model-gateway、重启两个 native-guard。维护者在 guard 的 UID1001 通过原始4030 Basic认证调用原生 POST /global/dispose 使配置重新读取；不重建 native、不重置数据库或持久卷。该管理操作不在平台用户路由清单中。记录真实模型、会话和文件摘要；浏览器中确认输入区模型标签与实际消息 modelID 为Qwen。原生 /config 的 model 与 small_model 已设Qwen，历史会话可能保留先前选择，需明确切换。

真实回归：`node test/ui-regression-live.mjs`（使用现有 admin/trial-b、验证平台TLS，检查原生Qwen工具结果和授权审批，真实下载后在新的干净基线副本应用，使用同部署镜像无网络运行15测试）。不替代可见Codex浏览器的交互证据或A10用户签收。

### 本轮下载与 Diff 修正

下载先查真实接口错误，再使用同源服务器附件链接触发浏览器标准下载；不使用Blob临时URL。补丁临时索引中被排除的依赖／制品每100个路径批处理，不写用户索引。托管UI的Git Diff列表过滤node_modules、dist、coverage、测试与浏览器制品目录；保留原生SDK返回的源码Diff及其组件。原生Bash工具和会话中的原始记录仍保留。固定构建证据为admin-quota-diff-ui-build.json／build.log／typecheck.log，旧构建证据没有覆盖；旧UI冷备在runtime/backups/admin-quota-ui-before/ui.tar.gz，仅维护者可回滚，切换UI不重建原生环境。

原生总Diff上限可能被无.gitignore项目内生成的依赖占满。本轮管理员仅在.git/info/exclude追加/web/node_modules/、/web/dist/、/web/.vite/、/.workbench-artifacts/，保留原内容。回滚元数据可从owner-only runtime/backups/admin-quota-git-exclude-before恢复原文件；不触碰源码／索引／持久数据，但大量依赖Diff可能再次占满上限。最终未开放项目子目录API或改原生Vcs实现，根目录Diff原生源码与双布局均实测通过。默认30分钟授权已实际等待1,801秒验证，见admin-quota-expiry-live-result.json。

## 本人工作台地址与右侧预览

本机代理只允许保护配置中两个身份的固定 `workbench.u-摘要.localhost:8444` 地址和原 127.0.0.1 入口；仍只绑定回环并验证固定 HTTPS 上游证书。身份与 Host 必须一致。旧入口用30秒一次性交接票据复制同一现有 host-only HttpOnly 认证 Cookie，长期凭据不进 URL。代理签名标记来源并覆盖客户端伪造标记；平台验证后仅签发本人直接预览 claim。

允许跨站 GET 的新增例外仅为有限本人工作台地址上的顶层 document/navigate 页面和授权 claim，以兼容完整登录重定向；iframe 嵌入平台、外部 Origin、跨来源写入和任意 Host 仍拒绝。工作台 frame-src 只含本人预览，应用 frame-ancestors 只含本人工作台；iframe sandbox 仅允许脚本、表单及自身存储。

任务触发使用原生当前会话 busy→idle、网页真实摘要变化以及后端原生环境空闲确认。初次进入／刷新／旧会话切换不触发。关闭偏好是本人工作台 host-only 的显示 Cookie，不授予权限；手动预览清除偏好。网页根目录、链接、文件类型、锁文件、dev 脚本与摘要检查由本人 guard 执行。

本轮发布仅重新加载 platform、两个 guard 与本机代理；Native 环境及卷不重建。UI 构建采用 WORKBENCH_BUILD_EVIDENCE=独立前缀 python3 scripts/build-ui.py 保存独立记录。回滚：停止本人本机代理，将 runtime/backups/sidebar-preview-* 保护快照中的 src/ui/public 与 platform.json 按需恢复，重新加载 platform/guard 并启动代理；不要执行初始化或重建 Native。同一持久项目数据不回滚。维护者也可 PLATFORM_UI=upstream 切回原固定原生 UI，不重置会话和文件。保护快照含密钥与会话，仅600权限本地保存，不能入库。

React 配置仅从本人项目锁定依赖加载官方 @vitejs/plugin-react 4.7.0，校验声明、安装版本和锁文件一致。无需更新工作镜像或下载运行时；失败如实显示启动日志，不允许项目提供任意插件配置。
