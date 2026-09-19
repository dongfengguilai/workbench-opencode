# v3 工程任务质量增强 · 当前状态

- 产品版本：v3
- 路线：`v3-engineering-quality`
- 包修订：`engineering-r1`
- v0/v1/v2 基线：`USER_CONFIRMED_ACCEPTED`
- 旧 Shared v3 路线：`SHELVED_BY_USER`
- 当前产品状态：`NO_CHANGE_RECOMMENDED`
- 实际实施 HEAD：`883659621264f7943758c022f0a35718ada1ac64`
- 最终实验候选：r4，清单 SHA-256 `7d1031b62ed7e9a969c57670608c53f50900a1f6c3882a375e9dd2d0fbe37caa`
- 当前运行制品：已回退到用户签收的 v2
- v3 用户签收：`NOT_RUN`（没有发布候选）

## 用户现在能做什么

用户继续使用已签收的 v2：本机单机按需进入、有界运行、安全停止和原地继续。v3 实验没有改变现有入口、OpenCode 版本、项目数据、会话或资源名称。

本轮已证明 WorkBench 内的原生 OpenCode 能在真实项目中独立修复 `CON.pdf` 改名缺陷，连续两次在 13／18 次模型请求内通过浏览器、94 个测试和构建；这些是候选实验事实，不代表已发布新能力。

## 尚不能做什么

不能宣称 v3 带来稳定的工程质量提升。冻结的五案例比较中：

- C01 两次通过；
- C02 修改了未被实际预览使用的独立页面，真实浏览器仍接受直接上传的 `CON.pdf`；
- C03、C04、C05 分别使用 31、35、31 次模型请求，超过每次 24 次上限；
- 两个 holdout 均未通过，因此不满足预先发布规则。

## 检查点

| 检查点 | 状态 | 结果与证据 |
|---|---|---|
| T0 真实任务与基线 | PASS | 冻结真实缺陷、输入、模型和预算；`evidence/t0-case.json`、`evidence/t0-inventory.json` |
| T1 首条闭环 | PASS（实验） | 原生 OpenCode 完成修复、浏览器行为、测试、构建、ZIP／补丁干净复现；`evidence/t1-result.json` |
| T2 成对比较 | COMPLETE / NO BENEFIT | 五个真实案例、主案例双跑、两个 holdout 和全部失败；`evidence/comparison.json`、`evidence/case-c01.json` 至 `case-c05.json` |
| T3 处置 | ROLLED_BACK | r4 仅在隔离栈运行；已恢复 v2、重新进入确认 46 个会话且预期会话仍在，再安全停止；`evidence/rollback-to-v2.json` |

## 真实证据

公开脱敏记录位于 `opencode-cloud-v3-engineering/evidence/`。完整消息、工具输出、网关日志、截图和回退日志位于授权的本机私有目录：

`/home/vmware/Workspace/programs/WorkBench/acceptance/v3-engineering-private/`

私有证据不提交仓库。C04 取消产生的一条不确定派发没有自动重试；在使用认证的 Qwen `/slots` 连续确认空闲后，按运维流程精确清除并恢复网关。

## 当前阻塞与下一步

当前阻塞是 r4 未满足已冻结的收益与成本门槛，因此本版停止发布并保留 v2。当前切片没有后续实施项；只有用户明确启动新的版本或批准新的改善假设与新协议后，才开展下一轮，不自动进入 v4。

## 范围与保护

目标项目代码修改全部由 WorkBench 内的 OpenCode 完成；开发 Codex 只实现平台候选、编排实验和独立验收。没有修改生产环境，没有恢复退役远程部署，没有改名或重建现有部署资源，也没有触碰 v0 正式本机容器。
