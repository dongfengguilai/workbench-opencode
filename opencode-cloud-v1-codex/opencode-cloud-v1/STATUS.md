# WorkBench v1 当前状态

- 更新时间：2026-09-18。
- v0：**USER_CONFIRMED_ACCEPTED**，继承用户完整验收，不重开旧验收。
- 实际 HEAD：`4643999fc02192116d94aa28d4489c63deec8bc6`。增量工作区未提交，原有未提交任务包、参考图和数据保留。
- v1：**IN_PROGRESS**。本轮是已批准的本机 `admin`＋`engineer-b`，不代表第二个真实 NetID 或两位真人签收。

## 用户新增能做什么

本轮原管理员本人登录及工程师重新登录均完成；真实注销回归主动退出了管理员，工程师仍登录可继续工作。原密码此前保留；管理员新密码由用户自行运行维护命令重置。

本机安装目录 `/home/vmware/Workspace/programs/WorkBench`。维护者已完成工程师密码隐藏输入；`./workbench.sh dev start` 实际退出0。入口 `http://127.0.0.1:8444/` 提供工程师切换链接；`engineer-b` 使用自行设置的密码，无需根证书。管理员密码和环境绑定保留。重复 setup 已确认不重置配置、项目、会话或计数。

工程师拥有独立原生状态、项目、预算、模型网关、guard、HTTPS 出口和1GiB限额磁盘。项目 `learn` 是用户授权 `/home/vmware/Workspace/projects/learn` 的独立副本；固定基线 `a9b4de9354832cc41a2d84ad44c2be45a9f95be8`，容器目录 `/workspace/project`。原始 HTML 与 DOCX 摘要仍与实施前一致。

按用户简化后的需求，真实原生 OpenCode 1.18.31＋Qwen 已完成 PDF 上传、canvas 第一页预览与页面内改名，保留下载、删除和 IndexedDB。可见内置浏览器实际上传有效两页 PDF，第一页 canvas450×300显示正确；空名称拒绝、保存改名和重新进入后的文件保留通过。独立固定 Playwright 浏览器实际下载改名 PDF，字节SHA与上传完全相同。

用户已自行重新登录，原 `learn`、会话历史、源码和上传 PDF 保留。同一原生会话 `ses_f4cb7c6d6ffeHxXuJcNeFmuqs0` 完成第二轮锁文件修复；十项补写值与真实 npm 官方工具输出逐项一致，全部依赖版本不变。原生任务现已空闲，没有重发未知结果或重写会话/Agent。

最新鉴权 ZIP 与补丁已真实取得并在两个全新副本独立验证：ZIP文件清单摘要一致；补丁在固定干净基线 check/apply退出0；两边分别安装锁定依赖、51/51测试及Vite构建均退出0。12个交付文件完全一致，导出未改变原生Git索引。

## 当前检查点与阻塞

**普通浏览器实际下载与独立复现已通过。**已检查 `/home/vmware/下载/WorkBench-source (3).zip` 和 `/home/vmware/下载/workbench-opencode (5).patch`，实际文件对应learn基线/捕获。ZIP SHA-256 `4acd0c4f1cdf752e3106a05a25823b559e923734f4d414631044d610a26086bc`；补丁 `ab547ac3a60399f50395c03f75a28671c5646e64ad0259853bd5ed9482266677`。从这两份实际浏览器文件新建副本、锁定安装、51测试及构建，两边均退出0；补丁固定基线check/apply成功，12个源码文件与清单一致，原生索引未变。没有复用旧guard制品日志；只复用经验证的npm包缓存，未复制node_modules，复现容器网络关闭。Codex内置浏览器下载限制仍单独记录，不视为产品导出故障。

实际后台写入验证发现ZIP在107次源码写入期间仍返回200。已只增加共同的源码变化检测：持续写入时本人ZIP与补丁均409/EXPORT_SOURCE_CHANGED（182/188次写入）；停止写入后均200，运行中的Vite及排除制品不造成误报。修改/新增/删除/权限/链接变化回归通过；22项相关回归及7项导出契约通过。只检查空闲后重启工程师guard，原生容器、平台和原用户guard均未重启；私有精确代码回滚备份保留。不承诺全盘原子快照。此前测试断言误用了错误消息中通用before单词，5项失败日志保留，修正为明确源码标记后15/15通过；原有7项回归另外通过。

**原登录阻塞已解除；受控制品回退已通过，尚未完成整体验收。**用户本人重新登录engineer-b后，同一内置浏览器同时显示admin的workbench-opencode/Markdown与engineer-b的learn/PDF，各自会话、最近活动和iframe来源独立。猜测对方会话未读到内容；管理员真实注销后本人4条已观察guard连接全部关闭，工程师3条原有连接仍在，工程师原会话及868B PDF可刷新继续预览（450×300 Canvas）。新增真实配置/PTY拒绝18项、Origin/Host7项、模型作用域4项通过；双方模型网关日额度100000、token及计数目录独立，代码/索引/计数与源learn摘要不变。原生PTY写入独占审计夹具时ZIP/补丁409 EXPORT_SOURCE_CHANGED，清理后稳定补丁200且tree/摘要与已验下载相同。夹具初始0600不可读与即时稳定检查409历史保留，未修改业务文件权限或重写导出。

本轮已完成工程师guard受控制品回退并恢复候选：旧制品及恢复后的候选会话/消息均200，稳定导出基线及tree一致；双方源码、索引、会话/消息摘要、预算计数、配置以及原用户服务ID/启动时间不变。只重建工程师guard，不恢复数据备份。首次旧备份0600导致EACCES，候选已恢复且数据核对通过；随后只将隔离暂存副本代码调整为0644，重验通过，保留首次失败记录。未用票据到期等PARTIAL项仍待补证；v1尚未达到整体签收门槛。核验源码归档私有保存于 `/home/vmware/Workspace/programs/WorkBench/acceptance/p2-browser-files-20260918T162115/`，不提交GitHub。

## 真实证据

- [本轮同浏览器隔离回归](../../opencode-cloud/evidence/increment-v1/dual-browser-isolation-regression.json)、[双方数据保护](../../opencode-cloud/evidence/increment-v1/dual-browser-regression-data-preservation.json)。
- [原生PTY持续写入拒绝](../../opencode-cloud/evidence/increment-v1/native-pty-export-audit.json)、[配置及终端边界18项](../../opencode-cloud/evidence/increment-v1/installed-config-pty-audit.json)。
- [入口Origin/Host7项](../../opencode-cloud/evidence/increment-v1/installed-relay-origin-isolation.json)、[模型作用域4项与实际额度](../../opencode-cloud/evidence/increment-v1/installed-model-and-config-scope.json)。
- [注销前](../../opencode-cloud/evidence/increment-v1/dual-browser-revocation-before.json)、[注销后](../../opencode-cloud/evidence/increment-v1/dual-browser-revocation-after-logout.json)真实连接记录。最初保留全部短连接的subset断言过严；其中3条原有工程师连接实测仍在，不能将所有tuple直接分类为SSE/PTY。

- [管理员实际登录与工程师登录过期](../../opencode-cloud/evidence/increment-v1/admin-login-isolation-browser-checkpoint.json)。
- [真实安装后台30项隔离检查](../../opencode-cloud/evidence/increment-v1/admin-engineer-installed-guard-isolation.json)，初始Diff状态预期错误独立保留。

- [管理员密码维护命令与非交互拒绝核验](../../opencode-cloud/evidence/increment-v1/admin-password-reset-ready.json)，离线6/6和维护回归9/9；实际轮换未执行。

- [实际普通浏览器文件核验](../../opencode-cloud/evidence/increment-v1/p2-browser-clean-result.json)。
- [后台写入修复后真实拒绝](../../opencode-cloud/evidence/increment-v1/export-background-write-after.json)、[仅工程师guard发布](../../opencode-cloud/evidence/increment-v1/export-source-change-publication-result.json)。
- [原管理员密码未改变的安全核对](../../opencode-cloud/evidence/increment-v1/admin-credential-preservation.json)。

证据索引：[increment-v1/README.md](../../opencode-cloud/evidence/increment-v1/README.md)，逐项状态：[evidence/acceptance.json](evidence/acceptance.json)。

- [用户重登、实际页面与成果区](../../opencode-cloud/evidence/increment-v1/p2-browser-relogin-and-delivery.json)。
- [真实原生消息与工具记录](../../opencode-cloud/evidence/increment-v1/p2-round1-messages.json)（含授权项目内容，提交前必须脱敏，不能默认公开大体量原始记录）。
- [实际PDF下载字节一致](../../opencode-cloud/evidence/increment-v1/p2-rename-download-integrity.json)、[原生CLI浏览器截图](../../opencode-cloud/evidence/increment-v1/p2-pdf-canvas.png)。截图属于独立CLI证据，不能当作内置浏览器截图。
- [锁文件逐项官方校验](../../opencode-cloud/evidence/increment-v1/p2-round2-lock-audit.json)、[此前单字符错误](../../opencode-cloud/evidence/increment-v1/p2-round2-lock-audit-failure.json)。
- [最新真实捕获](../../opencode-cloud/evidence/increment-v1/p2-round2-delivery-capture.json)、[两份干净复现](../../opencode-cloud/evidence/increment-v1/p2-round2-clean-result.json)、[源目录与交付文件完整性](../../opencode-cloud/evidence/increment-v1/p2-round2-final-integrity.json)。对应六份 `p2-round2-clean-*-*.log/json` 保留实际命令和退出码。
- [浏览器下载诊断](../../opencode-cloud/evidence/increment-v1/p2-browser-download-diagnosis.json)。
- 启动、loop只读身份修复、导出契约7/7、相关回归15/15、开发认证5/5、维护脚本9/9、固定Bun UI构建与管理员受影响导出回归的既有新证据保持。
- 历史真实失败保持：复杂候选测试失败、有效PDF误拒绝、原生prompt不支持、离线缓存未命中、锁摘要复制错误；未覆盖为PASS。

## 原有用户与发布保护

没有重命名既有资源、格式化/迁移/初始化原用户数据、清零计数或覆盖原配置。本轮新增核验只使用工程师自身环境及限时验证容器，不重建原生环境/平台/持久卷，不重启模型。正式NetID仍不回退本地账号。原管理员受影响ZIP导出已返回200、摘要一致、索引不变；其余受影响隔离回归尚未完成。

私有原runtime冷备保留：`/home/vmware/Workspace/programs/WorkBench/backups/20260918T063410Z/original-runtime.tar.gz`，权限0600，禁止提交Git。远程WorkBench继续退役；本轮仅调用已批准Qwen接口，未部署远程或修改其他业务。

## 本轮快速签收汇总（2026-09-19）

已批准的本机核心闭环：READY_FOR_USER_ACCEPTANCE；原任务包的更广完整契约保持IN_PROGRESS/PARTIAL，不冒充已全部通过。当前用户新增可用结果：engineer-b在独立learn项目完成真实PDF修改、51项测试、实际普通浏览器ZIP/补丁下载及两份干净副本安装/测试/构建；重登继续同一原生会话、第二轮锁文件修复，成果与文件仍在。原管理员的功能及数据保护回归和受控制品回退已通过。

本轮相关29项测试、维护配置9项、密码维护6项通过；实际HTTPS临时测试容器验证真实31秒未用票据到期401、重放401、预览凭据不能用于平台401、停用fixture身份401且admin不受影响。后者明确属于隔离fixture，不冒充在装用户停用/票据到期实测；未修改安装账号或安全时限。strip-only调用错误和测试相对URL错误保留失败日志，修复验证命令/测试辅助函数后通过，未修改产品实现。

本轮真实内置浏览器：用户私下重登engineer-b，打开原SID ses_f4cb7c6d6ffeHxXuJcNeFmuqs0；本人iframe仍显示868B PDF，点击后实际Canvas450×300。未再提交慢模型任务，未读取密码，未重启原用户/native/model。

真实证据：[本机签收汇总](../../opencode-cloud/evidence/increment-v1/v1-local-signoff-summary.json)。原更广HTTP/认证重放矩阵等PARTIAL项目按原acceptance.json保留；没有新增本机核心产品故障。原生消息业务内容、密码与冷备留本机，不默认公开。

## 下一步只做

请负责人明确签收“本机admin＋engineer-b、learn项目真实工作及成果交付”范围。收到明确确认后记录该范围ACCEPTED并停止，不启动v2，不把两位真实NetID/生产HTTPS或原更广契约改成通过。若要求原任务包更广整体契约签收，仍须补其PARTIAL项目，不能以“快速”代替证据。
