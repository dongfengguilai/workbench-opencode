# 当前交付状态

- 日期：2026-09-17。状态：`READY_FOR_USER_ACCEPTANCE`，不是 DELIVERED。
- A01–A09 已实际通过；A10 等待用户真实试用和明确签收，Agent 不代签。
- 独立新工程 opencode-cloud；旧 agent_platform 未改动或启动，未执行旧三阶段包。
- 入口：https://192.168.142.130:8443（真实 HTTPS、自签试用证书）。
- Codex 内置浏览器本机验证入口：http://127.0.0.1:8444，已实际打开、登录并完成原生模型示例；只监听当前宿主机回环，免浏览器证书配置。
- 按用户明确决定使用真实本地管理员认证；账号 admin，密码仅在未入库保护文件 opencode-cloud/runtime/ADMIN_LOGIN.txt。第二个真实身份 trial-b 使用独立环境。
- 已提交并推送指定仓库：git@github.com:dongfengguilai/workbench-opencode.git；实现 commit 03d034c，远端核对与推送证据见 opencode-cloud/evidence/publication.json、git-push.log。

## 实际版本与基线

原生 OpenCode v1.18.31 / 014614d35b397775e5d397a490fc72368c894ec2。官方二进制与内嵌固定 UI 摘要见 source-provenance.json；Settings 的 Desktop 版本显示为官方制品实际值 v1.18.30，未篡改文字或取 rolling UI。批准模型为 gpt-5.6-luna，通过固定受限网关，主 Key 不在工作环境。

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
| A06 双用户隔离 | PASS | a06-result.json、a06-container-boundary.json、a06-network-denials.jsonl、a06-browser-B.png、final-runtime-disk-ipv6-boundary.log | B 伪造 Session/路由/目录/Header/下载标识不越权；不能访问 A、宿主管理、主模型端点、元数据及公网 IP；同浏览器切换无 A 缓存 |
| A07 平台配置约束 | PASS | a07-result.json、a07-effective-config.json、a07-native-regression.json、a07-management-ui-result.json、bun-pty-provenance.json | 项目 config/MCP/plugin/agent 注入在重载后不生效；管理 API/body/loopback 绕过拒绝；管理快捷入口隐藏，正常原生测试回归通过 |
| A08 故障与不盲重试 | PASS | a08-admission-result.json、a08-faults-result.json、a08-outcome-warning-result.json、a08-interrupted-native.json | 真实不可用模型与未就绪环境明确报错；丢弃真实回执按原生 ID 查证；重复/并发拒绝；硬中断未当成功，待确认提示可见、不重放 |
| A09 部署/备份/恢复 | PASS | initialize-real-fresh.log、initialize-refusal.log、start-missing-config.log、native-pty-start.log、a09-cold-backup-first.log、a09-restore-result.json、restore-existing-refusal.log、quota-migration.log、quota-enforcement-after.log | 真实部署与停启、冷备恢复到独立 Compose 环境，同会话与代码摘要，真实续聊测试 3 PASS；原目录保留、磁盘边界 ENOSPC 验证 |
| A10 实际用户签收 | NOT_RUN | — | 尚无人记录完整真实试用并明确签收，不能标为 DELIVERED |

## 用户现在能做什么

登录 → 点击授权项目 → 在本人独立云端完整 OpenCode 中提出需求、查看流式工具与 Diff、回答提问、停止/继续、执行代码测试 → 检查并下载变更 → 刷新、重登及正常重启后继续同一原生会话和文件。用户不需要配置模型 Key、服务器或 Runtime。

2026-09-17 新增本机入口并在可见 Codex 内置浏览器完整演示：真实 Luna 为 normalizeWhitespace 新增实现与标准库测试，原生工具与页面终端均 4 PASS；查看 Last turn changes 的两个文件、实际清单并触发浏览器补丁下载，注销/重登后重新打开同一会话，原生消息 ID 和两个文件 SHA256 完全一致。导出补丁实际应用到新的干净基线副本，独立 4 PASS。既有 Git 状态保留，本次仅增加两个目标文件。未重启原生环境、未重发代码任务。证据总表 opencode-cloud/evidence/local-browser-demo-result.json，含终端/Diff/重进截图、原生完整消息、实际补丁与独立测试日志。浏览器下载事件成功，支持 API 不提供下载文件路径；保存的补丁字节另由真实平台 API 核对，不冒称浏览器文件路径。

使用说明：opencode-cloud/docs/USER_GUIDE.md；构建/启动/状态/原生 smoke/浏览器/冷备/恢复命令：opencode-cloud/docs/OPERATIONS.md。补丁要在 manifest 记录的固定基线上应用。A05 的维护者边界测试数据（README 暂存/未暂存、删除旧 smoke 说明、新文本/二进制、排除标记）仅覆盖导出行为，不冒充 Agent 完成的产品核心修改。

## 用户还不能做什么与残余限制

仅供受控试用：真实本地管理员分支是用户选择，未宣称 NetID 或受信任生产 HTTPS 已通过。证书为自签 30 天，生产证书仍需真实提供。一类 Node 标准库/Git 项目、一个模型、预分配一项目一环境；无批准外部依赖源，默认禁止外连。无本地连接器、用户环境配置、插件平台、任意预览、仓库写凭据、push/自动 PR 或部署。

本机 HTTP 验证入口仅当前运行 Codex 的宿主机可访问，不用于远程生产登录。代理后端继续校验 HTTPS 链/地址/有效期及准确叶证书指纹；错误 CA/指纹拒绝，5 项真实平台连接测试 PASS。仅本机响应的登录 Cookie 移除 Secure，HttpOnly/SameSite/有效期/注销保持，原 HTTPS Cookie Secure 实测保持。Codex 全局证书校验与证书数据库未改动。外部设备仍需私网可达并使用 HTTPS；本机入口不代表生产 HTTPS 验收通过。重新进入本次示例可使用 USER_GUIDE 中保存的会话地址。

每身份项目+完整原生状态共享独立 1GiB 有界文件系统，内存/CPU/PID/临时空间受限；模型 UTC 日250次请求、输出16000、并发2。工作容器非 root/只读系统/cap_drop ALL，无 Docker Socket 或宿主 namespace。资源准备与防火墙能力仅在短暂维护 helper。

进程中断后原生工具可能保留未完成记录，平台基于原生 idle+未完成记录显示结果待确认，不改 DB、不重发。无任意命令无损续跑或外部副作用 exactly-once 承诺。未承诺所有语言/子模块项目或任意恶意多租户安全证明。原生循环、上下文、会话和工具执行均未重写。

## 真实失败与修正

完整保留早期模型代理缺失、构建网络失败、浏览器等待条件误判、只读导出临时对象写失败、双击重复、异步回执先于 busy、管理快捷键和 PTY noexec 等失败记录。修正限于当前验收：受限模型代理、临时 Git 对象目录、入口 admission 与原生状态查证、托管 UI、相同固定原生 FFI 库在只读镜像加载；没有用 Mock 替代模型或正式身份。

## 下一步只修哪个阻塞

只做 A10：用户通过已启动的 http://127.0.0.1:8444 入口实际试用自己的需求、检查/下载变更并重新进入，然后明确反馈能否用于试用。内置浏览器证书阻塞已由用户批准的回环 HTTP 验证入口解除；真实演示 PASS，但不替用户签收。早期 ERR_CERT_AUTHORITY_INVALID 与导航拦截失败仍保留为历史证据，见 user-demo-browser-blocker.json、local-browser-navigation-before-fix.txt；当前成功证据见 local-browser-demo-result.json。若用户发现问题，下一步仅修该反馈阻塞，不开启其他业务线。

## 最终签收

- 实际入口：已运行，见上。
- A01–A09：PASS，自动化与维护者实际操作证据完整。
- 实际用户试用/日期：尚未记录。
- A10：NOT_RUN。
- 是否允许称为 DELIVERED：否。
