# v2 当前状态：READY_FOR_USER_ACCEPTANCE（T4 技术验收完成）

- 更新时间：2026-09-19T03:48:36Z。
- 实现提交：`cba249137c43c4b68162bf5bddf6ccf3f6b338d1`。
- 已验证制品：`sha256:07b02dd95ddc77d3f1ee8c61ec26ab9f395e916d806aeca29c53cef6154a4153`。
- v0/v1：继续继承用户已确认验收；旧本机容器 ID 与启动时间在发布/回退前后完全一致。退役远程服务器未操作。

## 用户新增能做什么

本机候选现支持三个登记空间竞争两个运行名额：查看和登录不唤醒 OpenCode；明确进入后开始完整原生工作；第三个空间看到队列；已有空间安全停止后只提升一个等待空间；主动停止或确认空闲后释放私有执行资源；再次进入保留项目、未提交修改和同一原生会话。

共享模型网关同时提供 Qwen 和 Luna 的模型发现，不自动回退。Qwen 已在 A/B/C 三个空间完成真实工作。A 停止后 C 获得名额；A 再进入同一会话新增代码和测试。ZIP 与补丁已实际导出，并分别在全新目录完成依赖安装、94/94 测试和构建；源项目 Git 索引未被验证过程改变。

不可变候选制品已在隔离栈完成部署、发布后真实 Qwen 工作、回退、数据/会话/最新计数核对及同摘要再部署。最终平台和共享网关运行，三个私有执行组均为 `STOPPED`。

## 尚不能做什么

v2 还不能标为 `DELIVERED`：真实用户尚未在最终候选上签收“进入 → 工作 → 停止 → 再进入”。`humanAcceptance` 保持 `PENDING`，技术证据不会代替用户确认。

Luna 的模型发现仍可用，但其外部聊天服务此前返回 500。T4 没有伪造 Luna 成功，也没有回退到 Qwen 冒充。

本轮只部署到用户已授权的本机隔离 `workbench-v2-checkpoint`，没有发布到旧 v0 入口或远程服务器。

## 当前唯一阻塞

仅等待用户实际试用最终本机候选并明确签收。没有剩余 T4 实现或技术验收阻塞；不自动进入 v3。

## 真实证据

- `evidence/t4-three-space-flow.json`：一位既有本地身份和两个明确标注的容量测试身份，两个名额、第三个排队、真实 Qwen、同会话继续及最终全停。
- `evidence/t4-delivery-reproduction.json`：ZIP 与补丁的 SHA-256、干净安装、94/94 测试、构建和源索引不变。
- `evidence/t4-resource-comparison.json`、`evidence/RESOURCE_REPORT.md`：T0 同任务对比、冷启动和残留成本。停止后私有执行内存为 0，平台＋共享网关约 141 MiB 常驻；活跃任务峰值没有下降，未宣传虚假节省比例。
- `evidence/t4-release-rollback.json`：不可变制品部署、发布后工作、回退保持、再部署及 v0 未触碰。
- `evidence/t4-final-state.json`：最终制品挂载、共享网关健康、唯一 helper 和三个 STOPPED 空间。
- `evidence/t4-model-uncertain-recovery.json`：首次 Qwen 不确定派发按 llama.cpp 槽位状态精确核销，没有自动重放。
- `evidence/t4-final-lifecycle-tests.log`、`t4-final-node-tests.log`：生命周期 19/19、Node 7/7 相关测试通过；宿主 TypeScript 运行器失败日志单独保留，固定 Node 22.19 镜像重跑通过。

`evidence/acceptance.json` 已将 V2-A01—A16 全部标记为 PASS，产品状态为 `READY_FOR_USER_ACCEPTANCE`。发布检查器仍会因 `humanAcceptance=PENDING` 拒绝 `DELIVERED`，这是预期保护。

## 下一步只做

用户在最终候选完成一次实际进入、查看会话、停止和再进入后，记录其明确签收并运行最终发布记录检查；随后结束 v2，不扩建 v3。
