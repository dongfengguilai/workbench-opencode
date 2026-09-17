# 当前交付状态

- 日期：2026-09-17。状态：`READY_FOR_USER_ACCEPTANCE`，不是 DELIVERED。
- A01–A09 已实际通过；A10 等待用户真实试用和明确签收，Agent 不代签。
- 独立新工程 opencode-cloud；旧 agent_platform 未改动或启动，未执行旧三阶段包。
- 入口：https://192.168.142.130:8443（真实 HTTPS、自签试用证书）。
- Codex 内置浏览器本机验证入口：http://127.0.0.1:8444，已实际打开、登录并完成原生模型示例；只监听当前宿主机回环，免浏览器证书配置。
- 按用户明确决定使用真实本地管理员认证；账号 admin，密码仅在未入库保护文件 opencode-cloud/runtime/ADMIN_LOGIN.txt。第二个真实身份 trial-b 使用独立环境。
- 指定仓库：git@github.com:dongfengguilai/workbench-opencode.git；此前发布证据见 opencode-cloud/evidence/publication.json、git-push.log。此前公开 HTTPS 修复实现 commit ddd7bd2 已推送 main 并核对远端；结果见 web-egress-result.json，提交与推送结果见 web-egress-publication.json。

- 本次 WorkBench UI / Qwen 实现 commit 0d318da25a1c873cb952072843510adcb2446d97 已推送 main 并核对远端；真实发布记录见 opencode-cloud/evidence/workbench-ui-publication.json。用户参考图保持原样、未纳入提交。

## 实际版本与基线

原生 OpenCode v1.18.31 / 014614d35b397775e5d397a490fc72368c894ec2。官方二进制与内嵌固定 UI 摘要见 source-provenance.json；Settings 的 Desktop 版本显示为官方制品实际值 v1.18.30，未篡改文字或取 rolling UI。用户最新批准新增并默认使用 Qwen3.6-35B-A3B，保留原 gpt-5.6-luna 精确路由；通过本人固定受限网关，两个主 Key 均不在工作环境。当前 WorkBench UI 从同一 v1.18.31 固定源码、原始 bun.lock 和 Bun1.3.14构建，出处/补丁/951制品摘要见 workbench-ui-build.json。

真实产品任务：实现完整 Git 补丁导出。两个独立未修复工作副本均从 9320d7bdc9f2f1e87c865646952c86f239a57d9b 开始。A01 的原生任务 Session 为 ses_f5298a8dbffeKFpwTjYXgYE2F2；平台重跑 Session 为 ses_f52850e1affeIcfvPF0rynZtLI。任务、尝试、补充、失败及独立验证完整保留。维护者未预写目标核心或降低测试。

## 验收记录

以下证据均相对仓库的 opencode-cloud/evidence；总表 acceptance-summary.json。

| 验收 | 状态 | 真实证据 | 结果 |
|---|---|---|---|
| A01 原生 coding 基线 | PASS | a01-final-result.json、a01-final-native.patch、a01-independent-final.log、a01-interventions.json、final-native-smoke.jsonl | 原生模型读/写/测试产品代码；独立 5 项测试 PASS；最终镜像原生 CLI 测试回归 3 PASS |
| A02 登录到本人环境 | PASS | platform-live-result.json、browser-first.png、a06-result.json、a03-terminal-result.json | 真实管理员登录、固定绑定、匿名/注销/停用拒绝、已有 SSE 与 WS 有界关闭 |
| A03 浏览器完整交互 | PASS | browser-flow-result.json、platform-native-messages.json、a03-final-result.json、a03-native-terminal-ui-result.json、final-ui-result.json | 另一干净副本同任务；真实提问 Yes、需求补充、执行中 Bash 停止、恢复编码、独立 5 PASS；原生 UI 终端创建/票据/WS/Bash 实跑通过 |
| A04 重进与持久化 | PASS | a04-result.json、browser-active-refresh.json、a08-faults-result.json、final-ui-result.json | 空闲与执行中刷新/关闭重进、注销重登、正常重启，同会话/文件/消息；没有自动重发 |
| A05 成果可复用 | PASS | a05-download-result.json、a05-platform.patch、a05-manifest.json、a05-applied-independent-tests.log、a05-post-quota-final.log | 实际下载，在独立 clean baseline 应用；包含新增/删除/暂存/未暂存/二进制；索引不变，独立 5 PASS，无密钥/状态数据 |
| A06 双用户隔离 | PASS | a06-result.json、a06-container-boundary.json、a06-network-denials.jsonl、a06-browser-B.png、final-runtime-disk-ipv6-boundary.log；新增 web-egress-live-result.json、web-egress-regression-result.json | B 不越权；2026-09-17 用户批准公开 HTTPS 443 经本人受控网关访问；直接公网 IPv4/IPv6、外部代理、A/B/平台实际私网 IP、宿主管理、主模型端点、元数据、HTTP 与非443目标仍拒绝；历史全公网拒绝证据保留 |
| A07 平台配置约束 | PASS | a07-result.json、a07-effective-config.json、a07-native-regression.json、a07-management-ui-result.json、bun-pty-provenance.json | 项目 config/MCP/plugin/agent 注入在重载后不生效；管理 API/body/loopback 绕过拒绝；管理快捷入口隐藏，正常原生测试回归通过 |
| A08 故障与不盲重试 | PASS | a08-admission-result.json、a08-faults-result.json、a08-outcome-warning-result.json、a08-interrupted-native.json | 真实不可用模型与未就绪环境明确报错；丢弃真实回执按原生 ID 查证；重复/并发拒绝；硬中断未当成功，待确认提示可见、不重放 |
| A09 部署/备份/恢复 | PASS | initialize-real-fresh.log、initialize-refusal.log、start-missing-config.log、native-pty-start.log、a09-cold-backup-first.log、a09-restore-result.json、restore-existing-refusal.log、quota-migration.log、quota-enforcement-after.log | 真实部署与停启、冷备恢复到独立 Compose 环境，同会话与代码摘要，真实续聊测试 3 PASS；原目录保留、磁盘边界 ENOSPC 验证 |
| A10 实际用户签收 | NOT_RUN | 用户已开始试用并反馈会话入口及 Webfetch 问题；web-egress-result.json 为维护者修复验证 | 用户接受先点击授权项目；天气阻塞已实际修复。尚无完整闭环的明确签收，不能标为 DELIVERED |

## 用户现在能做什么

登录 → 点击授权项目 → 在本人独立云端完整 OpenCode 中提出需求、查看流式工具与 Diff、回答提问、停止/继续、执行代码测试 → 检查并下载变更 → 刷新、重登及正常重启后继续同一原生会话和文件。用户不需要配置模型 Key、服务器或 Runtime。

2026-09-17 新增本机入口并在可见 Codex 内置浏览器完整演示：真实 Luna 为 normalizeWhitespace 新增实现与标准库测试，原生工具与页面终端均 4 PASS；查看 Last turn changes 的两个文件、实际清单并触发浏览器补丁下载，注销/重登后重新打开同一会话，原生消息 ID 和两个文件 SHA256 完全一致。导出补丁实际应用到新的干净基线副本，独立 4 PASS。既有 Git 状态保留，本次仅增加两个目标文件。未重启原生环境、未重发代码任务。证据总表 opencode-cloud/evidence/local-browser-demo-result.json，含终端/Diff/重进截图、原生完整消息、实际补丁与独立测试日志。浏览器下载事件成功，支持 API 不提供下载文件路径；保存的补丁字节另由真实平台 API 核对，不冒称浏览器文件路径。

2026-09-17 按用户明确批准增加每环境受控公开 HTTPS 出口，解决原生天气 Webfetch Transport error。保持原 v1.18.31 二进制 SHA256 f9dab32248695e9ebd56b16a1921798fd85112cf5a69c7dfd0cabc1e17be4a11，与 source-provenance 完全一致；没有改工具、循环、会话或 TLS 校验。真实 Luna 在用户原会话 ses_f5236b382ffeAgB48sLtafH7Qy 使用原生 Webfetch 取得 wttr.in 上海天气及 Bun Fetch 文档，两个工具均 completed；历史 Failed 保留。浏览器注销重登后同一结果仍在。可通过 USER_GUIDE 中原会话地址查看后面的成功结果，直接提出新的天气或公开文档查询。

本次冷备后协调重建 native/guard/UID 防火墙，重启前后24个已有会话的完整消息摘要、两个项目67个文件、Git状态和索引完全一致。天气验证不改项目文件；原生页面终端现有测试7 PASS，真实补丁下载并应用到新的干净基线副本后7 PASS。网关安全单元测试8 PASS（混合DNS/重绑定等仅局部测试）；两个真实容器访问两个公开 HTTPS 站点200且 TLS验证正常，受保护地址及直接/绕代理IPv4/IPv6拒绝。真实 SSE 200且首事件在流关闭前到达；真实不可用TCP上游返回502，不用响应Mock替代外站。总表 web-egress-result.json，细项 web-egress-live-result.json、web-egress-native-messages.json、web-egress-restart-persistence.json、web-egress-regression-result.json、web-egress-relogin-result.json、web-egress-real-upstream-fault.json，浏览器截图 web-egress-browser-weather.png、web-egress-browser-terminal.png、web-egress-browser-reentered.png。

使用说明：opencode-cloud/docs/USER_GUIDE.md；构建/启动/状态/原生 smoke/浏览器/冷备/恢复命令：opencode-cloud/docs/OPERATIONS.md。补丁要在 manifest 记录的固定基线上应用。A05 的维护者边界测试数据（README 暂存/未暂存、删除旧 smoke 说明、新文本/二进制、排除标记）仅覆盖导出行为，不冒充 Agent 完成的产品核心修改。


2026-09-17 WorkBench完整UI及最新Qwen实现：登录居中品牌/错误与加载、中文项目首页、侧栏会话搜索与历史、受控新草稿、双主题、窄栏抽屉及原生聊天／变更切换均可用；原生工具/输入/审批/Diff/文件/终端复用。可在输入区批准模型按钮选择Qwen或Luna，鼠标与键盘已实测；现有历史保留此前选择，必要时明确切Qwen。新的原生草稿默认Qwen（第二个真实用户也验证）。品牌SVG浅深色与favicon在public/。平台仅切换UI，没有重建原生环境或数据。

真实Qwen Agent在 ses_f51f0193effe59hdD5mXjOT6EO 创建 initials 模块与标准库测试；原生question真实确认，首版7项通过后发现非BMP Unicode首字符缺陷，明确让同一原生Agent修正并补测试，最终8PASS；随后由Qwen把混合空白用例扩展到Tab/换行/回车/NBSP和第三词，再实际8PASS。原生终端旧+新测试15PASS；可见浏览器查看真实Diff、检查清单和下载事件，真实API字节另保存补丁（浏览器接口不返回下载路径）；新干净固定基线副本git apply检查/应用成功，无网络同镜像15PASS。原生停止点击实际中断Qwen请求（工具尚未执行），随后明确只读继续完成，不宣称中断Bash。注销后真实B身份只见本人6会话，回管理员搜索并重进原代码会话；相同会话、工具测试结果及文件保留。

冷备先确认两环境idle、暂停并保存真实持久卷后原容器恢复；原有24会话完整消息与66文件摘要及Git索引完全一致，容器ID/启动时间不变，仅管理员新增两文件及两个连续创建会话。两个scope及原native受控HTTPS仍隔离；真实公开站点/TLS/受保护目标拒绝证据已重新回归。Qwen短探针128token耗尽思考，1024token得到真实标准tool_calls；随后完整原生Agent工具及测试成功。图片/多模态仅采用端点声明，本次未做独立图像验收。没有修改前的原生前端生产性能benchmark，不宣称性能基准回归PASS。

证据总表：opencode-cloud/evidence/workbench-ui-result.json；原生完整任务/停止记录 workbench-ui-qwen-native-messages.json、workbench-ui-stop-native-messages.json；真实干净补丁回归 workbench-ui-regression-result.json、workbench-ui-applied-tests.log（15PASS）、workbench-ui-platform.patch；保留校验 workbench-ui-persistence.json（24会话/66文件）、真实网络 workbench-ui-network-live-result.json；固定前端类型/构建日志及摘要 workbench-ui-typecheck.log、workbench-ui-build.log、workbench-ui-build.json；边界单元12PASS、原生首页索引单元9PASS（与真实模型证据区分）。截图 workbench-ui-login-final-light/dark.png、workbench-ui-final-light/dark.png、workbench-ui-qwen-terminal-final-tests.png、workbench-ui-inspect.png、workbench-ui-native-diff.png、workbench-ui-reentered-codex-narrow.png、workbench-ui-trial-b-isolated.png。

## 用户还不能做什么与残余限制

仅供受控试用：真实本地管理员分支是用户选择，未宣称 NetID 或受信任生产 HTTPS 已通过。证书为自签 30 天，生产证书仍需真实提供。一类 Node 标准库/Git 项目、两个精确批准模型、预分配一项目一环境；已批准公开 HTTPS 443 经受控网关外连，额外依赖及语言栈未单独验收。普通 HTTP、其他公网端口、私网和 IANA 特殊地址（含少量全球可达例外）不开放；每次检查全部 DNS 结果并以字面IP连接现有外部代理，外部代理/DNS/站点不可用仍会真实失败。IPv6仅允许非特殊全球单播，可达性取决于外部代理，不以直接IPv6拒绝测试冒称全部IPv6站点可用。CONNECT是环境级HTTPS通道，不限制加密隧道内的方法。无本地连接器、用户环境配置、插件平台、任意预览、仓库写凭据、push/自动 PR 或部署。

WorkBench 新项目首页和“新建会话”已修复此前缓存依赖；旧会话地址兼容。没有用户Key、URL、模型提供商或环境配置入口。

本机 HTTP 验证入口仅当前运行 Codex 的宿主机可访问，不用于远程生产登录。代理后端继续校验 HTTPS 链/地址/有效期及准确叶证书指纹；错误 CA/指纹拒绝，5 项真实平台连接测试 PASS。仅本机响应的登录 Cookie 移除 Secure，HttpOnly/SameSite/有效期/注销保持，原 HTTPS Cookie Secure 实测保持。Codex 全局证书校验与证书数据库未改动。外部设备仍需私网可达并使用 HTTPS；本机入口不代表生产 HTTPS 验收通过。重新进入本次示例可使用 USER_GUIDE 中保存的会话地址。

每身份项目+完整原生状态共享独立 1GiB 有界文件系统，内存/CPU/PID/临时空间受限；模型 UTC 日250次请求、输出16000、并发2。工作容器非 root/只读系统/cap_drop ALL，无 Docker Socket 或宿主 namespace。资源准备与防火墙能力仅在短暂维护 helper。

进程中断后原生工具可能保留未完成记录，平台基于原生 idle+未完成记录显示结果待确认，不改 DB、不重发。无任意命令无损续跑或外部副作用 exactly-once 承诺。未承诺所有语言/子模块项目或任意恶意多租户安全证明。原生循环、上下文、会话和工具执行均未重写。

## 真实失败与修正

完整保留早期模型代理缺失、构建网络失败、浏览器等待条件误判、只读导出临时对象写失败、双击重复、异步回执先于 busy、管理快捷键和 PTY noexec 等失败记录。修正限于当前验收：受限模型代理、临时 Git 对象目录、入口 admission 与原生状态查证、托管 UI、相同固定原生 FFI 库在只读镜像加载；没有用 Mock 替代模型或正式身份。

本次保留初始缺网关的失败断言、BlockList跨地址族误拒绝公网的单元测试失败、宿主Node未编译TypeScript导致独立补丁回归失败。分别修正为独立地址族规则和使用同部署镜像ID的无网络只读新副本运行测试；没有删测试或改既有项目。见 web-egress-unit-before.log、web-egress-unit-family-failure.log、web-egress-regression-initial-failure.log。


本次保留首次依赖安装PATH缺Bun、类型构建失败、首页错误V2路由/查询缓存空历史、单元运行器只读tmp和验证脚本302/403预期误判/平台启动未就绪等真实失败日志。前端输入区z70挡住body菜单z60使鼠标选择无效，最终用外壳isolation修正并恢复原生模型选择代码，不改Agent或模型存储。Luna上游500实际内容为访问chatgpt.com的TLS handshake EOF，见 workbench-ui-model-probe-body.json；不删除失败会话、不冒充稳定。用户随后提供并批准Qwen，默认模型切换后真实修改、测试及继续成功。

## 下一步只修哪个阻塞

WorkBench登录／工作台及Qwen切换已实施并真实验证，当前没有未解决的本次交互阻塞。唯一下一步是A10：用户在已启动的 http://127.0.0.1:8444 用自己的代码需求完成一次闭环并明确签收。维护者不能代签。若用户发现新问题，只处理该反馈阻塞，不扩展业务线。Luna仍存在真实外部TLS故障，默认Qwen已完成代码闭环，不自动回退或重试。

## 最终签收

- 实际入口：已运行，见上。
- A01–A09：PASS，自动化与维护者实际操作证据完整。
- 实际用户试用/日期：2026-09-17 已收到试用反馈；完整代码闭环与明确签收尚未记录。
- A10：NOT_RUN。
- 是否允许称为 DELIVERED：否。
