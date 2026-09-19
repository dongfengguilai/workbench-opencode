# 来源与核验边界

本开发包生成参考日期：2026-09-19。需求由当前对话确定，代码事实来自固定提交。新 API、状态机和参数均为 v2 契约建议，不冒充上游已有实现。

## S0 · 用户确认与方法

当前对话中用户明确：v0 已本人企业内网登录并运行整套部署和完整验收，之后 v1 已完成；选用完整 OpenCode；单用户独立实例；不开放用户环境配置；取消本地连接器。

最近一次已确定的 v2 安排：单机按需进入、有界运行、安全停止、原地继续；T0—T4 顺序；必要的模型总并发和磁盘保护；不深改内核、不做多机和存储迁移。

用户材料 `Vibe_Coding_Agent_Platform_Architecture.md` 第5—6、109—117、267—273、346—348行支持可用性、纵向交付、范围限制。其其他 Runtime/领域/阶段建议未被本包采纳。这里不复制整份文件，避免把旧设想当新要求。

## S1 · 仓库参考

GitHub 连接器本次读取 main：

- 仓库：`dongfengguilai/workbench-opencode`
- 提交：`4643999fc02192116d94aa28d4489c63deec8bc6`
- 提交时间：`2026-09-18T05:43:35Z`
- [固定源码树](https://github.com/dongfengguilai/workbench-opencode/tree/4643999fc02192116d94aa28d4489c63deec8bc6)

这是参考，不强制开发副本回退。未来读取日期和 HEAD 以实施者实际结果为准。

## S2 · 远程部署状态

[STATUS.md](https://github.com/dongfengguilai/workbench-opencode/blob/4643999fc02192116d94aa28d4489c63deec8bc6/opencode-cloud-v0/STATUS.md)

本次读取开头记录：远程试用已退役并冷备；后续默认在开发机推进，下一次远程部署需要明确要求。文档对旧验收的历史措辞不推翻用户随后对 v0/v1 的完成确认；部署是否在线与版本是否完成是两回事。

## S3 · 现有部署方式

[v1-deploy.py](https://github.com/dongfengguilai/workbench-opencode/blob/4643999fc02192116d94aa28d4489c63deec8bc6/opencode-cloud/scripts/v1-deploy.py)

[compose.v1.json](https://github.com/dongfengguilai/workbench-opencode/blob/4643999fc02192116d94aa28d4489c63deec8bc6/opencode-cloud/compose.v1.json)

上下文已读取固定版本的 start/quota/idle：整体 Compose 启动、loop ext4 容量限制、原生 session/status 空闲检查。不同 UID guard、防火墙与 native namespace 有依赖。v2 需要逐组处理，不能只增加 UI 定时器。具体文件行号、实际运行挂载和配额，实施者按 HEAD 核对。

## S4 · 当前模型计数

[model-gateway.ts](https://github.com/dongfengguilai/workbench-opencode/blob/4643999fc02192116d94aa28d4489c63deec8bc6/opencode-cloud/src/model-gateway.ts)

本次读取确认：一个 ENV_MODEL_TOKEN、进程内 active、默认进程并发2、按日持久预算、res.close 释放处理、固定批准上游和模型路由。复制进程不会形成同一模型后端的统一计数。

## S5 · Docker 停止语义

[Docker container stop 官方文档](https://docs.docker.com/reference/cli/docker/container/stop/)

本次核验：默认先发退出信号，宽限期后强制终止；timeout=-1 可不设强杀截止。自动回收不能把默认 stop 当作无限优雅等待。本包要求独立的有界观察及失败状态，这是本项目设计约束。

## S6 · Docker 重启策略

[Docker 自动启动官方文档](https://docs.docker.com/engine/containers/start-containers-automatically/)

本次核验：Docker 有 no/on-failure/always/unless-stopped 等策略；与宿主级管理器同时控制可能冲突。本包建议执行组由单一生命周期管理者负责，不由多个机制绕过名额。

## S7 · 镜像与数据占用

[Docker storage drivers 官方文档](https://docs.docker.com/engine/storage/drivers/)

本次核验：多个容器可以共享只读镜像层；不能相加所有 virtual size；日志和卷等需另算。文档也提示新 Engine 安装可能使用 containerd image store，应以实际宿主方式采集。

## 没有验证的事项

本包生成过程中未启动 WorkBench、未编译 OpenCode、未访问企业内网、未执行真实模型任务、未操作 Docker 或恢复私人备份。验证仅限生成文件、相互引用、检查脚本和归档。产品结果全部留作实施后的真实验收。
