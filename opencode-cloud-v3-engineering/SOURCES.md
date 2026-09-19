# 来源与设计假设

核查日期：2026-09-19。以下事实、用户决定和建议设计分开。

## 用户决定与提供材料

- 用户确认 v0、v1、v2 完成，最新要求将共享受限业务助手版 v3 搁置，恢复工程任务质量方向。
- 用户提供《WorkBench 双模式 OpenCode 平台架构总结》中的 Shared + Dedicated 主张：本包仅用于识别搁置范围，不作为当前实现任务。
- 用户提供《Vibe Coding Agent 平台开发方案》核心原则“先做一个真正可用的 Agent，再逐步演进成平台”“纵向切业务闭环，横向抽象复用能力”：本包采用开发纪律，不继承其通用 Runtime 抽象、固定阶段或模块清单。
- 对首个案例、指标、配置加载与证据设计的要求，是本包提出的增量开发方案，不是用户文件已经证明的事实。

## 本轮直接核查的仓库资料

1. 参考分支及提交：
   https://api.github.com/repos/dongfengguilai/workbench-opencode/branches/main
   本轮返回 `883659621264f7943758c022f0a35718ada1ac64`；不是后续工作副本必须回退到的版本。
2. v2 已签收状态与能力范围：
   https://github.com/dongfengguilai/workbench-opencode/blob/883659621264f7943758c022f0a35718ada1ac64/opencode-cloud-v2/STATUS.md
   记录单机按需空间、原生会话、共享模型网关和成果验证；本包未再次运行其产品测试。
3. 已有源码目录：
   https://api.github.com/repos/dongfengguilai/workbench-opencode/contents/opencode-cloud/src?ref=883659621264f7943758c022f0a35718ada1ac64
   可见原生代理、导出和 lifecycle 等现有模块；名称是阅读线索，实际调用路径需核实。
4. 固定原生版本和托管适配：
   https://github.com/dongfengguilai/workbench-opencode/blob/883659621264f7943758c022f0a35718ada1ac64/opencode-cloud/docs/UPSTREAM_ADAPTATION.md
   记录受控配置、关闭部分自动发现、原生执行机制不变以及已有成果面板；其中历史故障描述不能推翻新的 v2 签收。

## 官方参考：说明可能的扩展入口，不构成固定版本兼容承诺

- https://opencode.ai/docs/rules/ ：文档说明指令文件与 `instructions` 入口。
- https://opencode.ai/docs/commands/ ：自定义命令是可选的提示模板机制；本包不要求使用，也不要求为了它开放当前禁止的 API。
- https://opencode.ai/docs/custom-tools/ ：可在原生工具之外增加自定义工具；本包只在真实缺口存在时考虑局部辅助。

这些页面是滚动文档。实际生效必须以受验收固定版本的源码、配置和运行结果核实；不要从文档存在某功能直接推导当前托管策略已经允许它。

## 本包未做的事情

没有重新搭建平台、调用实际模型、选择真实缺陷、执行修复、测量质量提升、重新验收 v2 或修改远程仓库。包中的模板与验收是待实施要求。检查脚本的成功只证明包和记录结构，不证明产品安全、测试质量或用户价值。
