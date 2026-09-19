# v3 工程任务质量增强 · 当前状态

- 产品版本：v3
- 路线：`v3-engineering-quality`
- 包修订：`engineering-r1`
- v0/v1/v2 基线：`USER_CONFIRMED_ACCEPTED`
- 旧 Shared v3 路线：`SHELVED_BY_USER`
- 当前产品状态：`NO_CHANGE_RECOMMENDED`
- 本轮起始 HEAD：`c7a9baa7a82679744791aa00afc4fc0012a23dd2`
- 最终实验候选：r4，清单 SHA-256 `7d1031b62ed7e9a969c57670608c53f50900a1f6c3882a375e9dd2d0fbe37caa`
- 当前运行制品：已再次恢复到用户签收的 v2，工程师空间为 `STOPPED`
- v3 用户签收：`NOT_RUN`（没有发布候选）

## 用户现在能做什么

用户继续使用已签收的 v2：本机单机按需进入、有界运行、安全停止和原地继续。v3 实验没有改变现有入口、OpenCode 版本、项目数据、会话或资源名称。

新增的 Luna 探索评估证明，在相同 T0 输入、相同 r4 候选和原生 OpenCode 1.18.31 下：

- C02 在 15 次分发内修复实际 Vite 页面，浏览器拒绝 `CON.pdf` 并接受 `report.pdf`；
- C03 在 22 次分发内确认 Canvas PDF 预览正常；
- C04 在 21 次分发内确认 `report.pdf` 下载字节与上传文件一致；
- C05 的刷新持久化和 Canvas 预览功能也通过，但使用 28 次分发，超过冻结的 24 次上限。

C02—C05 均有 95/95 测试、构建和独立浏览器证据。目标项目源码只由 WorkBench 内的 OpenCode 修改；C03—C05 无源码修改，C02 的实验修改在下一案例前恢复为 T0。

## 尚不能做什么

不能据此发布 v3 或宣称 r4 平台增强已证明收益。原冻结比较使用 Qwen，正式结论仍是：C01 两次通过、C02 行为失败、C03—C05 超预算，两个 holdout 未通过。

Luna 探索改变了模型变量，只支持“此前部分失败与模型有关”。四个案例中只有 C02—C04 同时通过功能与成本门槛；C05 功能通过但仍超预算，而且本切片未用 Luna 重跑 C01。因此不能把这组结果解释成 r4 相对 v2 的独立平台收益。

## 检查点

| 检查点 | 状态 | 结果与证据 |
|---|---|---|
| T0 真实任务与基线 | PASS | 冻结真实缺陷、输入、模型和预算；`evidence/t0-case.json`、`evidence/t0-inventory.json` |
| T1 首条闭环 | PASS（实验） | 原生 OpenCode 完成修复、浏览器行为、测试、构建、ZIP／补丁干净复现；`evidence/t1-result.json` |
| T2 原 Qwen 成对比较 | COMPLETE / NO BENEFIT | 五案例正式比较保持不变；`evidence/comparison.json`、`evidence/case-c01.json` 至 `case-c05.json` |
| Luna C02—C03 | COMPLETE | 两案均在 24 次分发内通过；`evidence/luna-exploration-protocol.json`、`evidence/luna-exploration-result.json` |
| Luna C04—C05 | COMPLETE / PARTIAL COST | C04 通过；C05 功能通过但 28 次分发超限；`evidence/luna-exploration-c04-c05-protocol.json`、`evidence/luna-exploration-result.json` |
| T3 处置 | ROLLED_BACK | 候选仅在隔离栈运行；v2 制品已恢复，空间安全停止且网关无未决请求；`evidence/luna-exploration-result.json`、`evidence/rollback-to-v2.json` |

## 真实证据

公开脱敏记录位于 `opencode-cloud-v3-engineering/evidence/`。完整消息、工具输出、网关日志、失败尝试、截图和回退日志位于：

`/home/vmware/Workspace/programs/WorkBench/acceptance/v3-engineering-private/`

C04 独立复核保留了两次被生命周期回收预览后的 `ERR_CONNECTION_REFUSED`，随后通过受控活动续期与预览启动完成字节一致性复核。C05 在观测到超过 24 次后中止，不自动重试；所有 28 次分发均已结束，网关无未决请求。

## 当前阻塞与下一步

当前唯一发布阻塞是：现有证据未隔离“模型变化”和“r4 平台变化”，且 Luna 的 C05 仍超过成本门槛。只有用户明确要求继续 v3 时，下一步才冻结一份完整的 Luna 对照协议并从 C01 开始重跑；本轮不自动扩大评估，也不进入下一版。

## 范围与保护

没有修改生产环境，没有恢复退役远程部署，没有升级 OpenCode，没有改名或重建现有部署资源，也没有触碰 v0 正式本机容器。隔离候选已安全停止，检查点已恢复用户签收的 v2 Compose 和生命周期助手。
