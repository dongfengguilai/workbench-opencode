# v2 当前状态：DELIVERED（本机 v2 已由用户签收）

- 更新时间：2026-09-19T04:05:28Z。
- 用户确认：`确认签收本机 v2`。
- 实现提交：`cba249137c43c4b68162bf5bddf6ccf3f6b338d1`。
- 技术验收提交：`f2b682467fef494c4fec6440cd95e0964c0c5d42`。
- 已验证制品：`sha256:07b02dd95ddc77d3f1ee8c61ec26ab9f395e916d806aeca29c53cef6154a4153`。
- v0/v1：继续继承用户已确认验收；旧本机容器 ID 与启动时间在发布和回退前后完全一致。退役远程服务器未操作。

## 用户新增能做什么

本机 WorkBench 现在支持三个登记空间竞争两个运行名额：查看和登录不会唤醒 OpenCode；明确进入后启动完整原生工作环境；第三个空间进入等待队列；已有空间安全停止后只提升一个等待空间；主动停止或确认空闲后释放私有执行资源；再次进入保留项目、未提交修改和同一原生会话。

共享模型网关提供 Qwen 和 Luna 的模型发现，不自动回退。Qwen 已在三个空间完成真实任务。停止、排队提升、同会话继续、源码 ZIP 与补丁下载均已实测；ZIP 和补丁分别在全新目录完成锁定依赖安装、94/94 测试和构建，源项目 Git 索引未被验证过程改变。

不可变候选制品已完成本机隔离部署、发布后真实 Qwen 工作、受控制品回退、会话与计数核对，以及相同摘要重新部署。本机 v2 的“按需进入 → 有界运行 → 安全停止 → 原地继续”已经由用户明确签收。

## 尚不能做什么

Luna 的模型发现可用，但其外部聊天服务在本轮实测中返回 500；平台不会以 Qwen 自动回退冒充 Luna 成功。

本轮只交付用户授权的本机单机 v2。没有恢复退役远程部署，没有扩展到多机，也没有开始 v3。

## 当前阻塞

无。v2 已交付并结束。

## 真实证据

- `evidence/t4-human-acceptance.json`：用户本次明确签收的时间、原文和范围。
- `evidence/t4-three-space-flow.json`：两运行名额、第三空间排队、真实 Qwen、同会话继续及最终全停。
- `evidence/t4-delivery-reproduction.json`：ZIP 与补丁 SHA-256、干净安装、94/94 测试、构建和源索引不变。
- `evidence/t4-resource-comparison.json`、`evidence/RESOURCE_REPORT.md`：T0 同任务对比、冷启动和停止后的残留成本。
- `evidence/t4-release-rollback.json`：不可变制品部署、发布后工作、回退保持、再部署及 v0 未触碰。
- `evidence/t4-final-state.json`：最终制品挂载、共享网关健康、唯一 lifecycle helper 和三个停止空间。
- `evidence/t4-model-uncertain-recovery.json`：首次 Qwen 不确定派发按 llama.cpp 槽位状态核销，没有自动重放。
- `evidence/t4-final-lifecycle-tests.log`、`evidence/t4-final-node-tests.log`：生命周期 19/19、相关 Node 测试 7/7 通过。
- `evidence/acceptance.json`：V2-A01—A16 全部 PASS，`humanAcceptance=ACCEPTED`，产品状态为 `DELIVERED`。

最终候选保持平台和共享模型网关运行，三个私有执行组均为 `STOPPED`。

## 下一步只做

v2 到此结束。只有收到用户新的明确指令后才开展后续版本；不自动进入 v3。
