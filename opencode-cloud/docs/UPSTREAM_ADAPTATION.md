# v1.18.31 托管适配记录

官方原生二进制及其内嵌 UI 未改。tag/commit/校验值见 source-provenance.json、upstream-release.json。没有修改 Agent 循环、上下文、工具执行或原生 SQLite 存储。

平台必要改动：同 origin 登录和固定身份映射；native-proxy 保留原始 HTTP/SSE/WS，方法路径/body 固定允许清单，敏感 metadata 字段去除；仅 HTML head 注入 shell.js/style.css，保留原生 Prompt、tool、question、Diff、stop、session。shell 裁剪管理入口、增加项目/导出/注销及只读状态查证的待确认提醒，不制造成功记录。

官方支持的固定控制项经本版源码核验：OPENCODE_DISABLE_PROJECT_CONFIG、OPENCODE_DISABLE_DEFAULT_PLUGINS、OPENCODE_PURE、OPENCODE_DISABLE_EXTERNAL_SKILLS、OPENCODE_DISABLE_MODELS_FETCH、OPENCODE_DISABLE_AUTOUPDATE。HOME/受信任 XDG_CONFIG 只读，所有可写原生数据/XDG_STATE/cache 在独立 /state。OPENCODE_CLIENT=app 保留原生 question 工具，不重写审批。

同 UID 工作代码可以知道自己的 instance/model scope token，所以不能只靠外层平台隐藏管理 API。原生4030仅loopback，独立网络 namespace 的 OUTPUT UID1000 防火墙禁止工作代码直连，UID1001只读可信 guard 固定允许4096。模型主 Key 不在工作容器，scope只能经自己的固定 gateway访问批准模型。所有正常工作容器无 root/cap/socket，防火墙和 bounded FS 的能力只在短暂运维 helper。

busy 提交检查和短暂内存 admission 防重只处理 HTTP 入口，不控制执行循环；重启后的消息查证来自原生 messageID/status。未确认回执显示待确认，不自动重发。网关把批准路由 5xx/429/网络故障转为424，避免原生按可重试上游错误无限等待；正常流格式原样保留。

升级时必须重新核验这些 flags、配置发现、OpenAPI 路径、Web 请求和内部loopback边界，不能仅换 rolling latest。

实际内嵌 UI 的 Settings 页面显示 Desktop v1.18.30；资源仍是已校验的官方 v1.18.31 二进制自带同一份固定制品，并非滚动网站或另选 UI。该显示值如实保留在 a07-management-ui-before.json，不修改版本文字。

原生 PTY 在只读/noexec 临时目录中的额外适配：Bun 把内嵌 bun-pty FFI 库解包到 /tmp，Docker tmpfs noexec 导致 dlopen 失败。锁定原生 bun.lock 的 bun-pty 0.4.8，核对包 SHA512 及解包库 SHA256（a135c3d9...），与二进制实际内嵌解包文件相同；镜像只读目录复制相同库并设置依赖原生支持的 BUN_PTY_LIB。保持 /tmp noexec、native 非 root/cap_drop 不变，未替换或重写 PTY 实现。

2026-09-17 用户批准公开 HTTPS 443 后的网络适配：每环境增加独立只读 CONNECT 网关，原生仅设置其 Bun 已支持的 HTTP(S)_PROXY/NO_PROXY；原工作网络继续 internal。网关固定现有外部代理，解析并验证所有目标地址后只转发字面公网 IP，不解密 TLS、不重试、不替换原生 Webfetch。对应当前天气 Transport error 阻塞及 A03/A06/A08；真实 Luna/原生 Webfetch 两站 completed 的证据见 web-egress-native-messages.json，原二进制摘要复核及全流程结果见 web-egress-result.json。该批准变更不是普通用户修改平台配置的入口。
