# 固定试用部署

所有命令从仓库的 `opencode-cloud` 目录执行。Linux x86_64、Docker/Compose >=2.40（!override）、Git、Python3、OpenSSL、util-linux/e2fsprogs、共享传播宿主挂载、loop 设备为真实要求。Docker 控制权限只在维护者侧，平台和工作容器没有 Socket。旧 agent_platform 不参与运行。

## 新部署

模型是固定 `http://192.168.142.130:8317/v1` 的 gpt-5.6-luna。维护者把已授权 Key 放入 owner-only 单行文件；不在命令行写 Key。先验证模型真实可用，不能用开发响应替代。

```sh
python3 scripts/fetch-upstream.py
# 仅构建时使用已有网络代理；没有代理则去掉 build-arg。
docker compose build --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy native
python3 scripts/initialize.py --project /ABS/AUTHORIZED/PROJECT --baseline FULL_COMMIT_SHA --origin https://TRIAL_HOST:8443 --model-key-file /ABS/PROTECTED/MODEL_KEY
python3 scripts/quota.py --migrate-stopped
./scripts/start.sh
./scripts/status.sh
```

initialize 拒绝非空 runtime。clone 为新副本，不重置用户目录，移除 remote，不注入 SSH 或仓库凭据。真实 local-admin 分支复用旧登录代码；NetID 客户端保留但没有正式配置/验证，不能声称 NetID 已验收。生成两个真实本地试用账号，不使用 Mock。证书为 30 天自签试用证书；受信任 HTTPS 应由维护者替换 runtime/tls.key、tls.crt，并匹配 origin。密钥文件 0600，runtime 不入 Git。

固定 OpenCode v1.18.31，commit 014614d35b397775e5d397a490fc72368c894ec2，制品 SHA256 b283e8dbe9e6fc224bb4b79992ce3bd2174b8b7b0c3e7d1b4e6024a1d11edc84。官方二进制自带同版本 Web UI；未修改原生源码。资源受控：CPU2、内存2GiB、PID256、临时目录256MiB；每身份项目和完整原生状态共享独立 1GiB ext4 文件系统。scope 模型凭据只访问固定路由，最多并发2、输出16000 Token、UTC 日250次上游请求（包括失败），计数在各自 gateway-state 持久化；主 Key 仅在可信网关。

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

`node --test test/local-browser.test.mjs` 使用实际正在运行的平台检查本机绑定、认证、Origin/Host/CONNECT/WS 与错误证书拒绝；缺少真实平台时失败，不启动替代服务器。可见内置浏览器示例证据见 evidence/local-browser-demo-result.json。这是维护者本机验证入口，不代表远程生产证书验收通过。
