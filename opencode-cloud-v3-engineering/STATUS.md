# v3 工程任务质量增强 · 当前状态

- 产品版本：v3
- 路线：v3-engineering-quality
- v0/v1/v2 基线：USER_CONFIRMED_ACCEPTED
- 产品目标模型：approved/gpt-5.6-luna
- 非默认维护者回退模型：approved/Qwen3.6-35B-A3B
- 当前产品状态：DELIVERED
- 正式签收候选：r5，清单 SHA-256 7ba23322041152a9ead9620edd25dea90523fae158538e4f6ebb728cb2293bb4
- 当前本机运行配置：v3 Luna，工程师空间为 STOPPED
- v3 用户签收：ACCEPTED（2026-09-19T19:11:20+08:00）

## 用户新增能做什么

本机 WorkBench 下一次按需进入时，OpenCode 默认模型和 small_model 都是 Luna；无需手动选择。Qwen 仍存在于统一配置中，但仅为维护者控制的非默认回退。

快速验收与正式发布均已完成：

- C01 使用 20 次 Luna 分发完成真实修复；独立验证确认 CON.pdf 被拒绝、report.pdf 可用、94/94 测试和构建通过。
- C05 使用 23 次 Luna 分发完成真实验证；上传、改名、刷新持久化及 918×1188 PDF Canvas 预览通过，源文件相对精确 T0 无变化。
- 正式发布后再次进入空间，只读配置确认 model 与 small_model 均为 approved/gpt-5.6-luna；随后正常停止，没有运行额外模型任务。
- 原项目、会话、额度、入口和 Compose 项目名保持；共享网关健康，未决模型请求为 0。

## Qwen 记录的解释

原始请求数、超预算和行为结果继续保留，避免改写历史。产品结论已弱化并重新归因：这些结果表示 Qwen 在本任务集合中的模型能力与成本范围不匹配，不表示 OpenCode Agent、工具链或平台架构失败。

相同 OpenCode 1.18.31、Agent 路径和工具在 Luna 下通过代表性案例，支持该模型能力归因。产品因此选择 Luna，不再以旧 Qwen 对照阻止 v3 交付。

## 尚不能做什么

本次签收只覆盖本机单机 v3。它不恢复或发布到已退役远程服务器，也不增加用户模型选择、插件平台、多机、多 Runtime、动态调度或本地连接器。

Luna 仍受外部服务额度限制；Qwen 仍可由维护者用于回退，但不作为本版默认工程模型。

## 检查点

| 检查点 | 状态 | 结果与证据 |
|---|---|---|
| 历史 Qwen 测量 | RETAINED | 原始记录保留；解释为模型能力不匹配；evidence/comparison.json、evidence/benefit-review.json |
| Luna 产品目标协议 | PASS | 默认模型、代表案例与每案 32 次上限在运行前冻结 |
| Luna 快速技术验收 | PASS | C01 20 次、C05 23 次；真实 OpenCode、浏览器、94 项测试与构建通过 |
| 用户签收 | PASS | 用户原文及范围见 evidence/human-acceptance-luna.json |
| 本机受控发布 | PASS | 精确签收制品已提升为只读发布源；发布后默认配置与安全停止通过 |
| 发布门禁 | PASS | 允许经用户批准的 Luna 产品目标协议，同时保留历史 Qwen 对照，不冒充平台因果收益 |

## 真实证据

公开脱敏记录位于 opencode-cloud-v3-engineering/evidence/。主要结论：

- evidence/luna-product-acceptance-result.json
- evidence/human-acceptance-luna.json
- evidence/luna-product-release.json

完整原生消息、网关日志、测试、构建、浏览器日志、截图和发布状态位于：

/home/vmware/Workspace/programs/WorkBench/acceptance/v3-engineering-private/luna-product-acceptance/

## 当前阻塞与下一步

v3 当前没有验收阻塞，工作在本版结束。不自动进入 v4。后续只有在用户提出新的版本目标时才开启新任务。

## 范围与保护

没有升级 OpenCode，没有改 Agent 内核，没有重建项目或会话，没有更改资源名称，没有修改生产环境，也没有恢复退役远程部署。正式发布使用实际验收的同一候选清单，发布源已移除写权限。
