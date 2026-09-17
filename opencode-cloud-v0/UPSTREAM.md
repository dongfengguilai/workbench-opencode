# 上游与事实来源：核实后再使用，不猜接口

核查日期：2026-09-17。来源读取不等于构建、部署或安全审计。除下述已读文档/源码外，本包没有验证模型效果和运行兼容性。

## 固定起始候选

| 项目 | 记录 |
|---|---|
| OpenCode 仓库 | anomalyco/opencode |
| 读取 releases/latest 得到的非预发布 tag | v1.18.31 |
| 发布时间 | 2026-09-14T17:47:30Z |
| 单独读取该 tag 引用得到的 commit | 014614d35b397775e5d397a490fc72368c894ec2 |
| 是否实际运行 | 否；需要 Codex 在目标环境验证 |

Release 的 `target_commitish` 不一定是 tag 当前解析结果；以上 commit 来自 tags ref，不从 release 标题或分支猜测。正式下载核对 tag、commit、对应架构的 release asset 摘要，并记录实际镜像 digest。无法对应时停止，不能假装已经固定版本。

本包不要求 Codex 实施时仍追逐“最新”。以上是可验证的起始基线，选择并验证后冻结。若必须更新，记录原因与全部相关回归结果。

## 已核实的事实与设计之间的分界

### S1 — 发布与 tag

已读官方 release 元数据和 tag 引用。这里只证明版本存在和引用，不证明它适用于企业托管。

```text
https://api.github.com/repos/anomalyco/opencode/releases/latest
https://github.com/anomalyco/opencode/releases/tag/v1.18.31
https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.18.31
```

### S2 — Server

官方文档提供独立 `opencode serve`、原生 OpenAPI、会话/消息/事件和配置等接口。`OPENCODE_SERVER_PASSWORD` 为服务端 Basic Auth，并不构成企业用户和项目授权。

```text
https://opencode.ai/docs/server/
```

不要照抄在线文档中所有路由到固定版本。部署后读取它自己的 `/doc` 和实际注册路由，保存版本相关的允许清单。实验接口不是首版前提。

### S3 — Web

官方文档提供 `opencode web`；已读取 `v1.18.31` 的 `packages/opencode/src/cli/cmd/web.ts`，它启动 Server 并打开 Web 入口。CLI 注释也表明请求目录上下文会从请求确定，不能只依赖启动 cwd 做权限隔离。

```text
https://opencode.ai/docs/web/
https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/cli/cmd/web.ts
```

尚未验证该 tag 的前端资源分发、全部网络访问、受托管裁剪与代理兼容。Codex 必须查实际源码并实跑；不能假定任意 base path 或前端离线自托管天然可用。

### S4 — Config

官方在线文档描述配置合并顺序、Linux `/etc/opencode/` 的管理员设置、禁用共享和自动更新等配置。高优先级主要覆盖冲突键，不自动移除所有低层新增项。

```text
https://opencode.ai/docs/config/
```

这些在线说明不替代固定 tag 的实际 schema/loader。需要验证项目自动加载、动态管理接口、每次消息覆盖以及实例内部调用。受控加载补丁是本方案允许的最小改造，不声称上游已满足全部平台限制。

### S5 — 安全声明

固定 tag 的 SECURITY 明确声明：OpenCode 自身不提供 Agent 沙箱，其权限提示是用户交互能力，不是安全隔离；真正隔离需在容器/虚拟机侧建立。

```text
https://github.com/anomalyco/opencode/blob/v1.18.31/SECURITY.md
```

### S6 — Docker 安全

官方安全文档说明 Docker daemon 权限等风险。平台业务与工作负载不直接获得宿主机 daemon 控制权，是本方案的部署约束。

```text
https://docs.docker.com/engine/security/
```

### S7 — 旧工程只作为认证来源

已读旧工程 README，它列出旧的 API/Dispatcher/Worker/Sandbox Controller，并说明当时真实内网 NetID E2E 为 WAITING_EXTERNAL。此次没有读取其完整认证实现，也没有验证内网认证现在是否可用。

```text
https://github.com/dongfengguilai/agent_platform/blob/main/README.md
```

Codex 要在实际可访问源码中定位认证实现与测试，记录所用 commit，保留机制而非猜协议。不保留旧运行时架构，不拿“源码有登录”当作真实认证通过。

## 用户材料的采用范围

参考用户提供的 `Vibe_Coding_Agent_Platform_Architecture.md`：采用纵向交付、模块化单体、范围控制与真实可用性原则。

不采用其中预设的多 Runtime、Session/Run 自研体系及 Code/Work/Research 阶段。这些被本次更晚的明确决策替代。该材料不是产品源码，也不证明 OpenCode 的部署接口。

## 执行前必须补齐的证据

将结果写入实际项目 `evidence/baseline.md`：

- 二进制、Web 和源码确切版本对应，制品/镜像摘要。
- 目标模型真实工具调用，固定项目上的代码工作结果。
- API/前端资源路径、事件流与必要 WebSocket 的真实接入结果。
- 原生数据实际存储路径、正常重启和中断后的实际语义。
- 托管配置的全部生效路径、管理 API 与 shell/loopback 绕过检查。
- 真实认证与可独立操作的目标入口。

这些是当前主线的验证，不是启动新一轮选型研究。已固定 OpenCode，不比较 OMP/Harness，不开发第二个 Runtime。


## 2026-09-17 用户批准的固定前端与模型增量

WorkBench UI 从同一 v1.18.31 固定源码构建，原 bun.lock + Bun1.3.14。精确改动见 opencode-cloud/ui/upstream.patch；覆盖文件及制品摘要见 opencode-cloud/evidence/workbench-ui-build.json，真实边界与原生代码任务见 workbench-ui-regression-result.json。官方二进制和原生 Agent/工具/会话未改。用户最新明确批准新增并默认使用 Qwen3.6-35B-A3B（http://10.243.117.57:4003/v1），Luna 原批准路由保留；不扩大到任意模型、URL或用户环境配置。
