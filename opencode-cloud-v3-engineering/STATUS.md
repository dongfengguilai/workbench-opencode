# v3 工程任务质量增强 · 当前状态

- 产品版本：v3
- 路线：v3-engineering-quality
- v0/v1/v2 基线：USER_CONFIRMED_ACCEPTED
- 产品目标模型：approved/gpt-5.6-luna
- 非默认维护者回退模型：approved/Qwen3.6-35B-A3B
- 当前产品状态：READY_FOR_USER_ACCEPTANCE
- Luna 候选：r5，清单 SHA-256 7ba23322041152a9ead9620edd25dea90523fae158538e4f6ebb728cb2293bb4
- 当前运行制品：已恢复用户签收的 v2，工程师空间为 STOPPED
- v3 用户签收：NOT_RUN

## 用户新增能做什么

Luna 产品配置已固定：OpenCode 的默认模型与 small_model 都是 Luna，Qwen 只保留为维护者控制的非默认回退；界面无需手动选模型。

快速技术验收已通过：

- C01 由 WorkBench 内的原生 OpenCode 完成真实缺陷修复；20/20 次请求全部路由到 Luna。独立验证确认 CON.pdf 被拒绝、report.pdf 可用、94/94 测试和构建通过。
- C05 从精确 T0 开始，原生 OpenCode 真实验证后没有修改源码；23/23 次请求全部路由到 Luna。独立验证确认上传、改名为 report.pdf、刷新后保留，并重新渲染一个 918×1188 的 PDF Canvas；94/94 测试和构建通过。
- 两案均未点击模型选择器，实际提交模型是 approved/gpt-5.6-luna，低于预先冻结的每案 32 次 Luna 分发上限。

已签收的 v2 仍可按原方式使用；本次候选没有更改入口、OpenCode 版本、项目数据、会话或部署资源名称。

## 尚不能做什么

Luna r5 尚未由用户签收，也未作为当前运行制品发布。隔离验收完成后已安全恢复 v2 停止态；没有修改生产环境，也没有恢复退役远程服务器。

历史 Qwen 平台对照仍保持 NO_CHANGE_RECOMMENDED。本次结论是“固定 Luna 产品配置通过代表性技术验收”，不把旧 Qwen 结果改写成 r4 平台自身的因果收益。

## 检查点

| 检查点 | 状态 | 结果与证据 |
|---|---|---|
| T0—T2 历史 Qwen 对照 | COMPLETE / NO CHANGE | 原比较保持不变；evidence/comparison.json、evidence/benefit-review.json |
| Luna 探索 | COMPLETE | C02—C04 在原 24 次上限内通过；旧 C05 功能通过但超原上限；输入测试差异已更正；evidence/luna-exploration-result.json |
| Luna 产品目标协议 | FROZEN | r5 运行前冻结默认模型、两代表案例、32 次模型专属上限；evidence/luna-product-acceptance-protocol.json 及 amendment |
| Luna 快速技术验收 | PASS | C01 20 次、C05 23 次；默认路由、浏览器、94 测试和构建通过；evidence/luna-product-acceptance-result.json |
| 安全回退 | PASS | 候选正常停止；v2 Compose、生命周期助手与共享网关恢复；空间 STOPPED，未决分发为 0 |
| 用户签收 | NOT_RUN | 等待用户确认同一 r5 Luna 候选 |

## 真实证据

公开脱敏记录位于 opencode-cloud-v3-engineering/evidence/。完整原生消息、网关日志、测试、构建、浏览器日志、截图、源差异和回退状态位于：

/home/vmware/Workspace/programs/WorkBench/acceptance/v3-engineering-private/luna-product-acceptance/

协议在首个 r5 运行前发现并更正了旧探索遗留的一条额外测试：精确 T0 是 94 项测试。旧证据没有被覆盖，C03—C05 的旧输入差异已明确记录。

## 当前唯一阻塞与下一步

唯一阻塞是用户尚未签收 r5 Luna 候选。下一步只记录用户对候选清单 7ba233...bb4 的实际签收；在签收前不发布、不进入 v4。

## 范围与保护

没有升级 OpenCode，没有改 Agent 内核，没有增加多机、插件平台、用户模型配置或本地连接器。隔离候选已停止，当前容器标签已核对为 v2 compose.release.json，共享模型网关没有未决请求。
