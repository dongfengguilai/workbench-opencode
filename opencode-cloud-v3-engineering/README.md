# WorkBench v3 · 工程任务质量增强开发包

> 让工程师更愿意把真正的工作交给它：在已有项目中，少一些人工反复指导，完成可靠的修改、验证和成果交付。

| 项目 | 本包约定 |
|---|---|
| 产品版本 | **v3**，不是 v4 |
| 当前路线标识 | `v3-engineering-quality` |
| 包修订 | `engineering-r5-luna` · 2026-09-19 |
| 实施仓库 | `dongfengguilai/workbench-opencode` |
| 已接受基线 | v0、v1、v2 均继承；v2 按需运行和容量保护保持 |
| 搁置路线 | 上一个 v3「共享受限业务助手／Shared + Dedicated」包 |
| 当前产品状态 | `READY_FOR_USER_ACCEPTANCE`；固定 Luna 产品候选已通过快速技术验收，尚待用户签收 |

## 唯一主线

工程师进入本人空间 → 描述真实缺陷 → 原生 OpenCode 理解项目与复现问题 → 完成必要修改 → 验证原问题及相关回归 → 用户检查变更、证据和实际下载成果 → 安全停止、再进入继续工作。

首个场景：**一个现有、获授权的 Node／Vite／React 项目中的真实缺陷修复，优先选择需要理解多个文件的缺陷**。不要求新增项目管理能力。项目类型是为了复用现有执行环境的初始选择，不宣称已经找到真实案例。

## 怎么使用

将本目录放入开发工作副本，交给 Codex 阅读 [实施指令](CODEX_TASK.md)。先读取 [基线与搁置决定](BASELINE.md)，再按 [开发检查点](TASKS.md) 推进。

不要同时执行旧 `opencode-cloud-v3/` 中的任务。旧包不删除、不覆盖；若仓库已有 Shared 相关未提交改动，先保留并识别，不能直接重置代码或删除运行数据。

必要参考：[方案](PLAN.md)、[实现边界](IMPLEMENTATION.md)、[任务对照方法](EVALUATION.md)、[验收](ACCEPTANCE.md)、[发布与回退](OPERATIONS.md)。事实依据与设计取舍分开记录于 [来源](SOURCES.md)。

## 必须形成的交付

一个可直接使用的工程修复路径；经实测生效的最小项目指引或其他必要增强；需求相关的验证证据；与验证版本对应的可下载成果；相对 v2 的任务对照与用户签收。

新增内容以真实缺口为依据：现有工具或成果面板已经满足的部分只复用，不重复建设。只写评测报告或提示词、没有工作台中的真实使用结果，不算完成。

## 不做

不做共享多用户 OpenCode、普通业务助手、EDM 等业务 Skill 迁移；不做多机、共享项目、动态扩容、存储迁移、自动 PR、企业知识库、多 Agent 编排、用户配置中心或通用评测平台；不把深入改造 OpenCode 内核当成版本目标。

v2 的共享**模型网关**保留。这与已搁置的共享**Agent 实例**是不同概念，不得误删。

## 包自身检查

```bash
python3 opencode-cloud-v3-engineering/scripts/check_kit.py
python3 -m unittest discover -s opencode-cloud-v3-engineering/tests -v
# 实施后检查证据文件的完整性；新包应当拒绝发布。
python3 opencode-cloud-v3-engineering/scripts/check_kit.py --release
```

检查器不调用模型、不执行产品命令、不部署、不证明证据真实。格式正确与文件存在不能代替实际验收。当前真实状态、Luna 候选和签收边界见 [状态](STATUS.md)。
