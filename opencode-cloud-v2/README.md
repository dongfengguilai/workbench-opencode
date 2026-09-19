# OpenCode Cloud v2 · Codex 开发包

**版本目标：单机按需工作空间。**

用户保留独立空间；实际进入才启动完整 OpenCode；容量不足时等待；安全停止后释放运行资源；再次进入继续原生会话和项目。

这是开发规格、实施指令和验收约定，不是已经实现的 v2 平台。包内 Python 脚本只检查开发包及证据记录，不启动 Docker、不连接模型、不部署服务器。

## 从这里开始

将整个 `opencode-cloud-v2/` 放到 `workbench-opencode` 的开发工作副本，不要解压到生产目录，不覆盖仓库根 `AGENTS.md`。

交给 Codex：

```text
请读取 opencode-cloud-v2/CODEX_TASK.md 及它引用的文件，实际实施 v2。
继承我已确认完成的 v0/v1，不重新打开旧验收。
本轮只完成单机“按需进入 → 有界运行 → 安全停止 → 原地继续”。
先推进 T0，再纵向完成 T1；当前检查点未过，只修当前阻塞。
不要升级 OpenCode、改 Agent 内核、做多机调度或重新规划三阶段。
不要自动恢复已退役的远程试用部署。真实部署必须有单独明确授权。
不要只返回计划；实现代码、在允许的开发环境启动、验证并记录真实结果。
每次结束更新本包 STATUS.md。缺失外部条件时精确报告，不用 Mock 冒充真实通过。
```

## 必读文件

| 文件 | 用途 |
|---|---|
| [CODEX_TASK.md](CODEX_TASK.md) | 执行指令、权限与范围纪律 |
| [BASELINE.md](BASELINE.md) | v0/v1 已验收基线、版本编号及真实部署状态 |
| [PLAN.md](PLAN.md) | 唯一产品目标、架构取舍及影响范围 |
| [TASKS.md](TASKS.md) | T0—T4 同一切片内的实施顺序 |
| [LIFECYCLE.md](LIFECYCLE.md) | 生命周期、名额、停止竞争及恢复契约 |
| [MODEL_GATEWAY.md](MODEL_GATEWAY.md) | 统一网关、全局并发、取消与未知结果 |
| [ACCEPTANCE.md](ACCEPTANCE.md) | 16 组增量验收与签收终点 |
| [OPERATIONS.md](OPERATIONS.md) | 单机开发、发布、回退及数据保护 |
| [STATUS.md](STATUS.md) | 当前状态；初始为 NOT_STARTED |
| [SOURCES.md](SOURCES.md) | 需求来源、固定参考代码和技术事实 |

测试配置只用于说明行为：[resource-policy.example.json](examples/resource-policy.example.json)。它不是当前程序已经支持的配置文件，不得覆盖 `runtime/platform.json`。

## 检查开发包

在包目录执行，要求 Python 3.10+，只使用标准库：

```bash
python3 scripts/check_package.py
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/check_release.py
```

最后一条在初始包上应返回退出码 2：v2 尚未实施、无产品验收证据。这是正确结果。

记录分别保存在 [验收记录](evidence/acceptance.json) 和 [资源报告模板](evidence/RESOURCE_REPORT.md)。包自身的检查结果见 [validation/REPORT.md](validation/REPORT.md)，不能用它代替产品测试。

## 完成即停止

三个空间、两个运行名额：A/B 工作，C 等待，A 安全停止，C 进入；A 再进入继续原会话和修改，成果可复现。加上容量、隔离和故障验收即可交付，不自动扩展 v3。
