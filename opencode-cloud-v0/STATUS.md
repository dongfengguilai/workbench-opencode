# 当前交付状态：IN_PROGRESS

2026-09-18 本地管理员＋真实NetID安装程序和固定WorkBench UI已实际发布到10.243.117.57，**当前等待用户在本人服务器终端设置admin密码；管理员尚未创建，双身份完整验收仍未通过**。工程师已按用户明确批准从1GiB扩到4GiB，剩余约3GiB；全部源码／索引／模型计数102及2会话／104消息／449消息片段的逻辑摘要在扩容和发布前后均完全不变。Native保持原容器ID，发布UI时未重启Native、guard或模型。

- 用户现在能做：继续使用mj33kd旧HTTPS入口与NetID登录方式；在服务器固定安装目录执行`./deploy.sh add-admin`，两次隐藏输入独立新密码（12–1024字符），脚本完成独立admin环境与1GiB持久空间配置。只保存带随机盐的scrypt摘要，不需要向助手提供密码。重复合法安装保留密码和数据，未知目录拒绝覆盖；两个身份额度均100,000、并发2、输出16000。
- 尚不能做：admin实际环境／登录和双身份真实任务、浏览器存储／预览／截图／ZIP／补丁隔离均NOT_RUN；用户尚未设置管理员密码或hosts。本地认证5项、维护者保护5项与固定UI构建／类型检查通过，不能替代实际NetID或管理员登录。没有伪造NetID、没有通用管理后台、未自动开放更多账号，A10未签收。
- 真实证据：opencode-cloud/evidence/dual-identity-capacity-recovery-result.json、artifacts-publication.json、capacity-first-restart-rejection.json、before.json、paused-state.json、coldbackup-first-failure.json、native-restart-first-failure.json、storage-blocker.json、auth-check-final.log、deploy-check-final.log及dual-identity-ui-*。缩写前缀均为dual-identity-。旧本机代理测试因旧平台未运行503的失败在first-check-result.json保留；扩容首次启动子命令被维护者部署锁拦截，释放后恢复通过，不隐藏失败。
- 保护与回滚：原1GiB完整冷备为目标backups/runtime-20260918-112940.tar.gz，SHA256 e28383d89bf2b592008311961f0602c9a4073f84c5f46f3be3ab1588e1e51116。扩容保护目录backups/capacity-4g-20260918-123255；发布原源码／UI／checksums在backups/dual-ui-release-20260918-123641。回滚旧制品必须兼容实际容量与身份数量，脚本拒绝不兼容包，不重置数据。用户图片与未提交修改保留。
- 完整离线包：/home/vmware/Workspace/projects/experiments/Workbench_space/releases/workbench-v1-20260918-dual-identity-rc3.tar.gz，1,044,630,207字节，SHA256 7685ccc91b23899af1b3062c7e7fac966e84c66ca85ae73ed6003d45678b4ed0；固定原生／浏览器镜像、951个UI资源、源码及逐项摘要，不含现存数据／管理员密码／NetID密码。操作说明opencode-cloud/docs/DUAL-IDENTITY.md。
- 下一步只完成管理员密码设置检查点：用户在本人终端执行add-admin后告知完成或错误，不发送密码。之后检查新环境、两网关真实额度、原工程师数据及本人hosts（10.243.117.57 admin.workbench.internal preview.admin.workbench.internal），再继续用户亲自参与的认证与隔离验收。工程师旧IP入口保持，根证书保持不变。不能因已发布代码标记READY或完整双身份通过。

## 本轮之前的单NetID部署历史

2026-09-18 企业内网 V1 已实际部署并启动：目录 `/home/aisvr/mnt/sda/programs/WorkBench-v1`，Compose `workbench-v1`，全新独立数据，只有 NetID `mj33kd`，Qwen-only，管理员日上限100,000。用户仅开放外网，没有重启。**当前等待本人安装根证书并实际 NetID 登录；尚未标记完整闭环通过或 A10 签收。** 无需公网域名，未更改 Codex 的全局 TLS／证书数据库。

- 用户现在能做：取得完整离线包与专用公开根证书；工作台 `https://10.243.117.57:8443/` 已启动，服务器侧及当前机器用专用根证书正常校验链／IP并取得登录页 HTTP200。安装客户端信任后可尝试本人 NetID 登录，不保存 NetID 密码、没有本地账号回退。操作说明 `opencode-cloud/docs/V1-INTRANET.md`。本人静态网页已由真实 Qwen 创建并通过原生 Bash 的3项标准库测试，预览经原生PTY健康启动；这些为维护者原生验证，不能冒充用户登录或浏览器预览通过。
- 真实保护与状态：上传前确认目录不存在、无符号链接且可写，包摘要核对后才解压；原有八个业务容器 ID／镜像／启动时间未变，不重启同机模型。新环境索引与 README／.gitignore 在真实任务前后不变，仅新增 web/ 四文件；9次真实模型请求计数保留。再次 `./deploy.sh` 退出0，Native容器／全部消息／源码／索引／计数均完全不变，无初始化或force-recreate。旧本机环境／用户图片未发布、重启或覆盖。
- 尚不能宣称通过：真实 NetID 正确／错误密码和主体返回尚 NOT_RUN，用户浏览器信任／右侧iframe、HMR／WS、鉴权下载ZIP／补丁与干净复现、原生CLI浏览器截图，以及目标机停止／冷备／恢复／制品回滚和维护重启的真实验收均待登录检查点通过后继续。本轮按用户要求只复测两项网络条件及必要部署／真实任务／重复启动，不跑大矩阵。双NetID尚无第二身份，IP入口显式限制单身份，不标多用户隔离通过。
- 真实证据：`v1-network-opened-recheck-20260918.json`（两项200，早先出站链失败原样保留）、`v1-target-upload-result.json`、`v1-target-first-deploy.log`与`v1-target-first-deploy-result.json`、`v1-target-client-https-result.json`、`v1-real-native-api-task.jsonl`、`v1-target-repeat-start-preview-result.json`；UI构建／类型检查 `v1-intranet-ui-*`。原生CLI附着返回Session not found且未调模型的失败在`v1-real-native-qwen-task*`保留；其会话创建契约带guard禁止字段，未放宽guard，使用工作台同样的原生V1会话接口完成真实Qwen任务。第一次SSH交互stdin问题在`v1-deploy-first-invocation-interrupted.json`保留，修正终端输入后同一包首次部署成功。初始Git索引stat缓存刷新发生在维护者第一次git status，未修改暂存内容；后续保护快照采用no-optional-locks。
- 制品：`/home/vmware/Workspace/projects/experiments/Workbench_space/releases/workbench-v1-20260918-rc2.tar.gz`，1,044,615,904字节，SHA256 `ad9102e7d88d0b14747a67132f132eb6627e07babb15384f1ff4b6f32b5b67b2`；见`opencode-cloud/evidence/v1-bundle-result.json`。完整源码／固定OpenCode1.18.31及CLI0.1.20镜像／951个UI资源／原源码归档与Bun来源均在包内，源文件与制品逐项摘要，不含已有数据、模型私密配置或登录密码。首次开发候选包另保留，不作为本次部署包。公开根证书 `releases/WorkBench-v1-root.crt`，文件摘要 `ba55ae5804689f070b19255a51ec2d7ebc1219987cd7cda30c3dabb09ca6d2b4`，私钥只保存在目标runtime，不分发。
- 下一步只解除真实 NetID 登录检查点：由用户按说明信任受控部署生成的根证书，用mj33kd与本人NetID密码登录；不要在聊天提供密码。成功或具体错误反馈后再继续该用户的预览／下载／持久化验收。A10仍由用户签收。


## 已解决的部署前置阻塞历史（以下不是当前状态）

2026-09-18 用户补充：产品只面向企业内网，无现成域名／入口证书。公网域名不是必要条件，此前把基础域名作为唯一部署路径过于严格。后续以支持内网 IP 的单 NetID 部署为候选，工作台与预览仍保持不同来源；可生成 WorkBench 专用私有 CA 与含 IP SAN 的入口证书，但客户端必须明确安装／信任该 CA，不能把自签证书自动当成已被浏览器信任。此模式尚未实现或验收，不修改 Codex 的全局校验或证书数据库。用户正准备重启服务器更新网络；等待其完成通知后再复测 SSH、原有容器／Qwen 和出站 TLS。服务器出站网络信任与用户浏览器入口信任是两项独立条件。

2026-09-18 WorkBench V1 新服务器实施检查：已实现只读预检并通过 SSH 在 `aisvr@10.243.117.57` 实际运行，退出 2，在正式 HTTPS 条件阻塞处停止。**尚未安装产品，尚未完成一键压缩包或 NetID 接入，不能标记交付。** 最新需求是全新数据，不执行下方历史记录中的旧数据迁移方案。

- 用户现在能做：继续使用现有本机第一版功能；新脚本 `opencode-cloud/scripts/v1-preflight.py` 可重复检查部署条件。本机六项保护测试通过，确认未知非空目录、符号链接和文件均被拒绝，预检不创建目录或覆盖文件。
- 目标实测：固定安装目录 `/home/aisvr/mnt/sda/programs/WorkBench-v1` 不存在，父目录可写；实际 `/dev/sda1` ext4 挂载为 shared，空余约 863 GiB。Docker 29.6.2／Compose 5.3.1 可用，loop-control 存在，提权挂载尚未执行。同机模型列表 HTTP 200 且含 Qwen3.6-35B-A3B；容器内真实推理未验。预检前后现有运行容器 ID、镜像及启动时间一致；未创建目录、环境或卷，未改模型、旧系统或用户参考图。
- 现在仍不能做：在新服务器登录 NetID、运行正式工作台／预览或完成 V1 签收。基础域名与受信入口证书未提供；访问 wttr.in／playwright.dev 真实 TLS 失败，链由 Aptiv / internet.aptiv.com 签发，系统不信任。观测根证书摘要仅供维护者核对，不自动信任，也未关闭 TLS 校验。NetID 无密码 GET 探测重定向后 500，不是协议要求的 POST 登录；真实登录、错误密码与未授权身份验收均 NOT_RUN。
- 真实证据：`opencode-cloud/evidence/v1-target-preflight-20260918.json`（含严格校验的 SSH 主机指纹、源脚本摘要、目录／模型／TLS 与容器前后清单）；`v1-preflight-safety-tests-20260918.json` 与 `.log` 仅为本地保护测试。操作说明 `opencode-cloud/docs/V1-DEPLOYMENT.md`。历史本机成功和本轮新服务器失败明确分开。
- 下一步只修 HTTPS 部署前置阻塞：由单位／服务器管理员提供指向该机器的基础域名、覆盖工作台与独立预览的受信证书链／服务器私钥，以及从单位可信渠道取得并确认摘要的出站根证书。拿到后先重复真实预检，再继续固定制品打包、单 mj33kd NetID-only／日额度100,000 接入和新服务器闭环。A10仍由用户签收；第二真实身份未提供，双 NetID 验收不标通过。

---

以下为历史本机交付及此前迁移检查，不代表新服务器 V1 已通过。

2026-09-18 迁移交付检查：当前可作为本机第一版试用成果，尚未证明另一服务器上的登录、远程工作台与网页预览可用。实际本地账号认证与原生Qwen闭环已有证据；NetID未正式配置或验收，A10未签收。

- 用户现在能做：使用现有本机入口登录、编程、预览、查看验证与下载源码。最新说明改善已发布到be4155d。
- 迁移后仍不能保证：代码中本人工作台／预览来源为localhost、本机relay上游限定旧IP，公开HTTPS出口依赖旧私网代理；直接复制部署不能作为远程预览通过证据。新主机访问模型及受控出口尚未实测。
- 真实证据：`opencode-cloud/evidence/migration-readiness-20260918.json`记录只读代码检查；现有功能证据仍在sidebar-preview-address-*与此前交付总表中，不冒充新服务器证据。
- 下一步只处理迁移部署阻塞：取得新服务器受控连接及域名／证书，先验证现有模型和出口可达，然后适配真实HTTPS工作台与独立预览来源，打包固定镜像／UI并在空闲窗口冷备恢复全部原生数据。之后在目标服务器实测登录、真实任务、iframe／WS、下载、双用户隔离与重启持久化，最后由用户签收A10。当前未停机、未执行迁移、未改认证或现存数据。


2026-09-18 预览地址交付改善已实施并发布：预览栏持续说明“5173 是容器内部地址”，展开“预览地址与访问说明”可查看并复制本人正式根地址；地址只读且不含一次性票据，复制失败提供手动选中提示。明确仅当前电脑、已授权浏览器可用，另一浏览器先登录工作台再点击预览。

- 用户现在能做：点击顶部“预览”，在说明中复制实际用户入口；实际复制按钮反馈成功，正式地址在用户已有标签25重载后真实应用正常。319像素窄栏无横向溢出。原生只读说明已同步到两个现存容器；真实Qwen回答明确指出不能从用户电脑访问容器5173，转而引导点击工作台预览。
- 仍不能做：直接从宿主机或其他设备访问容器127.0.0.1:5173；未放开端口。此前用户“problem loading page”原网址／浏览器仍未收到，不能把当前正式地址成功作为该未知链接已修复证明。复制按钮的 Clipboard API 成功已观察，剪贴板内容未另行读取。
- 真实证据：`sidebar-preview-address-browser-result.json`、`address-narrow.png`、`address-native-task.json`、`address-native-messages.json`、`address-native-result.json`、`address-ui-build.json`及build/typecheck日志。第一次维护者漏传原生messageID被400拒绝，保留`address-native-first-failure.json`；更正完整原生schema后同一新会话真实模型通过。
- 保护验证：`sidebar-preview-address-before.json`、`prepublish.json`、`after.json`、`persistence-result.json`。两个项目文件／索引／Git状态及全部已有会话消息完全不变；仅新增一个只读提示验证会话。Native及guard容器ID／镜像／启动时间不变，只重启平台载入已构建UI。旧UI与说明保护备份在`runtime/backups/preview-address-*/ui-instructions.tar.gz`，不入Git。
- 下一步唯一阻塞仍是原复制链接报错的具体用户路径核验；其余本轮提示改善通过。A10由用户实际试用签收，本机结果不等于远程生产HTTPS验收。


2026-09-18 用户试用回归：已捕获用户 iframe 跳转的实际 `Sec-Fetch-Site: cross-site`、`navigate`、`iframe` 请求，原代理误返回403。已修复并重载本机预览代理：仅固定本人预览地址的 GET 文档导航可经过认证与本人 CSP 检查，普通跨站资源、写入、外部 Origin、错误 Host 仍拒绝。原生容器、源码、索引和会话不重建或初始化。

- 现在可做：已在可见内置浏览器重新登录、进入同一原生会话、点击预览，真实应用加载；正式本人预览根地址新标签直接打开、用户已有标签22重新加载也成功。新实证 `sidebar-preview-access-fixed.png`、`direct.png`、`browser-result.json`。
- 仍未确认：用户原“problem loading page”所用完整网址与浏览器尚待回复；不能根据另一条可用打开路径宣告该报错已修复。新标签按钮点击未在 CUA 标签列表观察到新增标签，具体弹窗行为也保留未确认。
- 拒绝与认证实证：`sidebar-preview-access-reported-failure.json`、`access-live-result.json`、`access-live.log`、`access-transport.log`；测试首次误带 Cookie 的失败另保留 `access-test-first-failure.log`，修正测试输入后实连通过，不作为安全缺陷通过证据。
- 下一步只定位：用户报错的实际复制链接／浏览器路径，补齐用户普通操作的打开证据。A10仍待用户签收。以下历史 READY 记录不代替本次用户回归验收。

2026-09-18：已实际实现、发布并通过本轮右侧预览与按任务展示成果维护者验收。A10仍等待用户签收，不能称 DELIVERED。总表：`opencode-cloud/evidence/sidebar-preview-result.json`。

## 用户现在能做什么

- 本机旧入口 `http://127.0.0.1:8444` 登录后自动进入本人固定 `workbench.u-身份摘要.localhost:8444` 工作台。旧会话链接仍兼容；30秒一次性交接复制现有 host-only HttpOnly 认证凭据，不创建第二套身份或会话。
- 桌面聊天＋右侧本人网页默认各半，支持拖动、方向键调宽、刷新、关闭、停止、新标签打开；窄屏使用“会话／预览／变更”，复用原生 Diff 和终端。右侧 iframe 与本人预览为同站、不同来源，CSP只允许本人配对，sandbox禁止顶层跳转和默认弹窗；应用不能读平台 DOM 或凭据。
- 当前会话实际原生任务 busy→idle、本人环境空闲且真实网页摘要变化后，服务健康通过才自动启动／首次展开。真实Qwen的React修改和第二用户首次静态网页均实测；普通代码任务、刷新、搜索和旧会话切换不触发。关闭后后续网页任务不强制弹出，手动预览恢复；显示偏好为本人 host-only Cookie，不授予权限。
- 兼容React文字更新实测保留已选文件状态，采用项目已锁定官方 @vitejs/plugin-react 4.7.0；服务与 iframe授权复用。首次整页刷新失败保留，未改原生Agent或二进制，也未共享Playwright浏览器状态。
- 继续查看文件、真实测试／工具输出、Diff、源码ZIP、补丁和本人会话截图。普通代码成果无需浏览器。真实原生Playwright断言与截图通过；最新ZIP和补丁分别在干净副本安装、15＋29测试、构建、React与静态DOM断言通过。
- 原有23＋7会话的消息摘要和两项目Git索引完全不变；只改批准的两处旧网页提示、为第二用户新增三个网页文件。原有未提交修改和参考图片保留。两Native工作容器ID、启动时间与镜像完全不变；只重载平台／guard／代理，持久卷不重建。
- 管理员日上限100,000次、普通用户250次保持，计数未清零；公开HTTPS经原受控网关，私网、元数据、其他环境及直接外连仍拒绝。天气实连通过，Bun站点当次IPv6连接复位保留；定位后两环境实际复验通过，不增加请求自动重试。

## 用户现在还不能做什么

- 仅支持固定 web/ 与5173的静态HTML/CSS/JS和锁定Vite/React；不支持任意地址栏、网站、端口、Next、数据库、插件或共享远程桌面。静态页面或不兼容结构变化可能整页刷新，不承诺任意源码变动都保留应用状态。
- 受信任远程生产HTTPS／NetID尚不由本机iframe验收证明。维护者原HTTPS入口保留新标签预览方式；本机入口只绑定回环。
- 浏览器ZIP／补丁按钮已有真实下载事件，接口实际字节及独立复现另有证据；自动化工具不提供本地保存路径，A10需用户确认真实保存。无可信退出状态的终端命令仍不标记测试通过。

## 真实证据在哪里

均在 `opencode-cloud/evidence/`，历史失败记录原样保留。

| 内容 | 本轮独立证据 |
|---|---|
| 保护备份／原数据前后 | sidebar-preview-backup-result.json、before.json、prepublish.json、after.json、persistence-result.json |
| 固定源码、Bun1.3.14、原锁文件及UI构建 | sidebar-preview-stop-recovery-ui-build.json、stop-recovery-ui-typecheck.log、ui/upstream.patch |
| 本人iframe登录、实际资源／交互／WS | sidebar-preview-iframe-checkpoint-result.json、auth-live-result.json、navigation-boundary-result.json |
| 真实Qwen任务结束后自动展开 | sidebar-preview-release-native-messages.json、release-browser-result.json、release-browser.png；first-native-messages.json、first-browser-result.json |
| 热更新状态、纯代码不展开、关闭偏好 | sidebar-preview-hmr-fixed-browser-result.json、hmr-fixed.png、code-result.json、closed-result.json |
| 桌面调宽／492窄屏原生Diff／终端 | sidebar-preview-layout-result.json、resize.png、narrow-diff.png、terminal-result.json、terminal.png |
| 原生CLI真实断言／本人截图 | sidebar-preview-first-cli-native-messages.json、first-artifact-native-messages.json、first-artifact-result.json、first-native.png |
| ZIP／补丁字节、摘要及独立复现 | sidebar-preview-final-export-result.json、final-source.zip、final.patch、clean-result.json；download-browser-result.json |
| 实际故障页面／UI停止恢复／原文件不变 | sidebar-preview-stop-gui-result.json、unhealthy-stop-result.json、stop-recovery-persistence-result.json |
| 双用户同浏览器、边界／故障、实际过期 | sidebar-preview-second-login-result.json、boundary-result.json、handoff-expiry-live-result.json |
| 出口／直接外连拒绝／重登／新标签 | sidebar-preview-egress-recheck-result.json、reentry-result.json、new-tab-result.json |

上表文件前缀均为 sidebar-preview-；完整实际文件名以总表为准。UI补丁实际位置 `opencode-cloud/ui/upstream.patch`。原源码、构建／代理保护回滚方式见 OPERATIONS；回滚不重置用户文件或会话。

## 下一步只修哪个阻塞

唯一下一步：用户A10实际试用并签收，确认右侧交互与下载文件实际保存。不代签、不扩大新业务。本轮主实现 `4326bf3558a7ae8a7d24dc9d05e8e082da892b8a` 已推送并核对远端。最终实现 `94862fc0875955f87033c05770caa2627077a24c` 已推送并核对远端；发布记录 `opencode-cloud/evidence/sidebar-preview-publication.json`。最终可见交付截图为 sidebar-preview-final-visible.png。

---

# 先前源码交付／额度验收历史：READY_FOR_USER_ACCEPTANCE

- 2026-09-17 本轮已实际实施并通过新增闭环维护者验收；A10仍未签收，不能称DELIVERED。
- 管理员日上限100,000次，普通用户250次。仅重建管理员模型网关加载额度，保留原250计数；真实Qwen任务后计数297。并发2／输出16000保持，新部署默认同步；现有环境未初始化。
- 同一Qwen React会话完成原生Bash＋固定Playwright CLI输入／点击／实际DOM断言及PNG、29测试和构建。最新ZIP和补丁在各自干净副本按锁文件安装、15＋29测试、构建、运行和浏览器断言通过。
- 工作台 http://127.0.0.1:8444；http://localhost:8445只为一次性授权入口，应用跳到本人固定u-摘要.localhost:8445来源。同一浏览器标签切A→B的存储／Cookie／缓存无串用，平台凭据不转给应用。
- 两跳票据一次性、各30秒真实过期；默认预览凭据实际1,801秒后HTTP401，父会话仍200，已建立WS关闭。跨用户预览／截图／源码拒绝、注销／停用及WS撤销、端口冲突／启动失败／重复启动通过。
- npm限2连接／不重试镜像已冷备部署并回归真实Qwen、原生终端29通过、公开HTTPS／重定向／私网元数据拒绝／Webfetch、直接外连拒绝与预览WS。两身份会话／源码／Git状态／索引在维护重建前后完全一致；最终原源码、索引与旧消息前缀仍完全保留。
- 真实Diff依赖过多造成的加载失败已修复并复验桌面及492像素窄栏App.jsx实际52行差异。原生二进制不变。仅在管理员.git/info/exclude追加四个生成目录规则，原文件保护备份保留，源码与索引不改；原始Git状态保存，隐藏的是依赖／缓存／构建／浏览器制品。尝试的只读目录放行未解决固定原生空补丁问题，已全部撤回，最终子目录请求仍403。新部署同步这四个Git metadata默认规则，现有部署未初始化。
- 实际内置浏览器静态及React网页操作均9／4，日志、原生验证记录和PNG可见；注销重登同一会话仍在。两个下载按钮触发真实下载事件，独立保存的接口字节已核验并复现；自动化工具不提供本地保存路径，需用户确认实际文件保存。
- 本机入口只供受控试用，不代表生产HTTPS／NetID通过；旧历史失败及验收保留。

## 用户现在能做什么

- 使用真实管理员登录，进入本人原生环境／已有会话；既有源码、未提交修改、暂存索引、原生会话与用户参考图均保留，未初始化或覆盖原系统。
- “项目成果”已接入预览启动／停止／打开、运行日志、完整源码 ZIP、原补丁下载、本人原生 Bash 命令／退出码／输出和会话截图。固定 web/、127.0.0.1:5173、一个原生 PTY；重复启动已实测同PTY，不发布任意端口。
- 管理员示例会话 `ses_f507ead15ffeUbQJZrsiTj0FYz` 保存真实 Qwen 编写的文本统计器：静态版本 web/static.html，React版本web/。原生 npm构建退出0，标准库29测试通过。React预览配置修正为automatic JSX后，在可见内置浏览器实点示例／统计得到字符9、单词4；空白词数0、清空正常。平台配置修正为维护者介入，不冒充原生 Agent 完成浏览器断言。
- 最新源码ZIP真实HTTP200、61,769字节，见admin-quota-source.zip及admin-quota-exports-result.json；原索引不变。ZIP与补丁分别在干净副本通过锁定安装、15＋29测试、构建及网页断言。包排除密钥、原生状态、缓存、依赖、构建和浏览器制品，附基线／摘要／时间／运行说明。内置浏览器两个下载事件已确认；工具不提供本地保存路径，仍需用户确认。此前等待超时作为历史失败保留。
- 原生固定 OpenCode1.18.31 二进制未改。CLI0.1.20、固定Playwright/core及Chromium1244在本人非root容器内通过原生Bash调用，不连接宿主浏览器。独立验收副本已由真实Qwen完成网页输入／点击／增删断言／PNG，生产静态页面亦有真实原生CLI断言和截图。

## 用户现在还不能做什么

- 原250次403与所有历史失败保留；本轮已解除额度阻塞，当前限制见顶部真实检查点。
- 内置浏览器下载事件已确认，工具不提供本地保存路径；实际保存位置需用户确认。远程受信任生产HTTPS／NetID仍未作为本机闭环验收。
- npm默认限2连接／不重试镜像已部署并实际回归。只支持静态与Vite/React试用；不加载项目自己的Vite插件配置，不承诺Next、数据库、任意端口／运行时、浏览器实时共享或自动部署。

本轮新增闭环总表：opencode-cloud/evidence/admin-quota-acceptance-result.json。

本轮实现及真实证据提交 `54a70e6a457f4f53dc667ddf3fa4de9c09685262` 已推送指定仓库main并核对远端一致；发布记录见opencode-cloud/evidence/admin-quota-publication.json。用户参考图未提交，原样保留。

## 真实证据（相对 opencode-cloud/evidence）

| 内容 | 证据 | 实际结论 |
|---|---|---|
| 原数据恢复／预检／冷备 | delivery-preflight.json、delivery-baseline.json、delivery-release-backup.json、delivery-headless-backup.json、delivery-blocked-backup.json | 原卷恢复；保护冷备不入库 |
| 双用户重建持久化 | delivery-release-persistence.json、delivery-headless-persistence.json、delivery-blocked-persistence.json | 会话／源码／Git索引前后比较，不是新完整闭环恢复演练 |
| 固定镜像／工具出处 | delivery-browser-image.json、delivery-browser-tools.json、delivery-browser-production-image-build.log、delivery-running-release.json | 原二进制、锁文件和Chromium摘要；当前及候选镜像分别记录 |
| 首检查点原生浏览器 | delivery-browser-native-result.json、delivery-browser-native-messages.json、delivery-browser-native-added.png、delivery-browser-native-deleted.png | 独立验收副本真实Qwen+Bash+CLI断言与PNG通过；初始失败保留 |
| 平台静态／真实停止／继续 | delivery-platform-static-browser-messages.json、delivery-platform-static-native.png、delivery-stop-native-result.json、delivery-browser-native-question.png | 真实原生任务、提问、停止及继续；静态CLI操作可查 |
| 历史React／额度失败 | delivery-platform-react-browser-messages.json、delivery-platform-react-browser-live.log、delivery-current-result.json | 原生29测试和构建退出0；最后HTTP403，不是完成；本轮后续通过见下方新证据 |
| 内置浏览器独立预览 | delivery-browser-static-preview.png、delivery-browser-react-initial-blank.png、delivery-browser-react-preview.png、delivery-browser-react-reentered.png、delivery-react-jsx-preview-start.json | 原始空白失败保留，平台JSX配置修正后真实示例9／4；非Agent续验通过 |
| 历史源码与验证记录 | delivery-current-source.zip、delivery-current-export-result.json、delivery-snapshot-source.zip、delivery-snapshot-export-result.json、delivery-current-verification.json | 当时真实接口下载／原索引不变；当时干净包未验，本轮新包通过见下 |
| 预览授权／隔离／拒绝 | delivery-boundary-live-result.json、delivery-preview-lifecycle.json | 真实一次性／30秒过期、注销、跨用户截图／导出限制、固定目录／端口／Host／Origin；不是全部边界完成 |
| TLS断开／实际Vite WS | delivery-platform-tls-reset-initial-failure.log、delivery-transport-live-result.json | 真实崩溃保留；修正后24次TLS断开不崩、WS101、注销关闭WS |
| 单元与固定UI构建 | delivery-export-unit-safe.log、delivery-export-unit-snapshot.log、delivery-boundary-unit-final.log、delivery-egress-unit.log、delivery-ui-typecheck.log、delivery-ui-build.json | 本地Git导出／链接／恶意filters／时钟／FIN测试与类型构建；不冒充真实模型／外站证据 |

## 下一步只修哪个阻塞

唯一下一步：用户A10实际试用签收，确认需求→代码→预览→验证记录→源码保存→重登持久化。无已知维护者验收阻塞；不得代签或扩新业务。

# 先前登录／工作台验收历史（不代表新增网页闭环通过）

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

每身份项目+完整原生状态共享独立 1GiB 有界文件系统，内存/CPU/PID/临时空间受限；模型 UTC 日管理员100,000次／普通用户250次请求、输出16000、并发2。工作容器非 root/只读系统/cap_drop ALL，无 Docker Socket 或宿主 namespace。资源准备与防火墙能力仅在短暂维护 helper。

进程中断后原生工具可能保留未完成记录，平台基于原生 idle+未完成记录显示结果待确认，不改 DB、不重发。无任意命令无损续跑或外部副作用 exactly-once 承诺。未承诺所有语言/子模块项目或任意恶意多租户安全证明。原生循环、上下文、会话和工具执行均未重写。

## 真实失败与修正

完整保留早期模型代理缺失、构建网络失败、浏览器等待条件误判、只读导出临时对象写失败、双击重复、异步回执先于 busy、管理快捷键和 PTY noexec 等失败记录。修正限于当前验收：受限模型代理、临时 Git 对象目录、入口 admission 与原生状态查证、托管 UI、相同固定原生 FFI 库在只读镜像加载；没有用 Mock 替代模型或正式身份。

本次保留初始缺网关的失败断言、BlockList跨地址族误拒绝公网的单元测试失败、宿主Node未编译TypeScript导致独立补丁回归失败。分别修正为独立地址族规则和使用同部署镜像ID的无网络只读新副本运行测试；没有删测试或改既有项目。见 web-egress-unit-before.log、web-egress-unit-family-failure.log、web-egress-regression-initial-failure.log。


本次保留首次依赖安装PATH缺Bun、类型构建失败、首页错误V2路由/查询缓存空历史、单元运行器只读tmp和验证脚本302/403预期误判/平台启动未就绪等真实失败日志。前端输入区z70挡住body菜单z60使鼠标选择无效，最终用外壳isolation修正并恢复原生模型选择代码，不改Agent或模型存储。Luna上游500实际内容为访问chatgpt.com的TLS handshake EOF，见 workbench-ui-model-probe-body.json；不删除失败会话、不冒充稳定。用户随后提供并批准Qwen，默认模型切换后真实修改、测试及继续成功。

## 当前下一步（覆盖先前 A10 等待结论）

当前以顶部与“下一步只修哪个阻塞”为准；历史失败结论保留在历史证据中。

## 先前范围的签收记录

- 实际入口：已运行，见上。
- A01–A09：PASS，自动化与维护者实际操作证据完整。
- 实际用户试用/日期：2026-09-17 已收到试用反馈；完整代码闭环与明确签收尚未记录。
- A10：NOT_RUN。
- 是否允许称为 DELIVERED：否。

## 本轮独立真实证据（opencode-cloud/evidence）

- 额度：admin-quota-result.json；原计数保留与模型继续增长：admin-quota-react-checkpoint-result.json。
- Qwen React原生工具与全部失败尝试：delivery-admin-quota-react-resumed-messages.json、delivery-admin-quota-react-ui-messages.json；裁剪范围：admin-quota-observer-scope.json。原始历史未删除。
- 实际ZIP／补丁及摘要：admin-quota-source.zip、admin-quota.patch、admin-quota-exports-result.json；独立副本：admin-quota-clean-result.json及clean-zip/patch-final.log。
- 浏览器真实下载事件：admin-quota-download-browser-result.json；本地保存路径未确认。真实可见预览／结果／终端：admin-quota-react-visible.png、static-visible.png、results-panel.png、terminal-tests.png。
- 隔离真实初始失败与修正：admin-quota-isolation-initial-result.json、isolation-fixed-result.json、isolation-same-tab-fixed.png。故障矩阵：admin-quota-preview-boundary-result.json、transport-result.json、child-ticket-expiry.json。
- 维护冷备／双用户完整摘要：admin-quota-release-backup.json、release-before/after.json、release-result.json；运行后边界与WS：admin-quota-release-boundary/transport-result.json。
- 双工作容器网络：admin-quota-web-egress-live-result.json；新镜像真实Qwen工具／浏览器／Webfetch：admin-quota-network-native-result.json、delivery-admin-quota-network-messages.json。
- 普通用户原生CLI截图与本人下载边界：admin-quota-b-native-result.json。该项是维护者原生Shell测试，未冒充模型任务，Shell接口不记录退出码。
- 默认30分钟凭据实际到期：admin-quota-expiry-live-result.json（真实1,801秒，PASS；父会话未到期）。

- 最终原生与可见源码Diff：admin-quota-diff-native-final-result.json、diff-browser-final-result.json、native-diff-final.png、native-diff-narrow.png；Git metadata规则与回滚：admin-quota-git-exclude-result.json。
- 新UI固定构建：admin-quota-diff-ui-build.json／build.log／typecheck.log；原UI保留：admin-quota-ui-stage-result.json。最初Diff失败、原生子目录空补丁及撤回规则：admin-quota-diff-initial-result.json、diff-scope-initial-result.json。
- 最终持久化与真实重登：admin-quota-persistence-result.json、browser-relogin-result.json／png；原生工具完整范围：admin-quota-observer-scope.json。实际运行后二类预览：admin-quota-release-visible-result.json及release-react/static-preview.png。
