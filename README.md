# WorkBench

独立云端托管完整 OpenCode v1.18.31，默认使用用户批准的 Qwen3.6-35B-A3B，保留此前批准的 Luna。平台只提供真实登录、本人预分配环境、固定授权项目、受控代理和变更下载；原生 Agent、工具、SQLite 会话保持不变；固定原生前端经 WorkBench 品牌、双主题及布局适配。

- 实际交付状态：[STATUS.md](opencode-cloud-v0/STATUS.md)
- 用户使用：[USER_GUIDE.md](opencode-cloud/docs/USER_GUIDE.md)
- 构建、部署、启停、冷备与恢复：[OPERATIONS.md](opencode-cloud/docs/OPERATIONS.md)
- 固定版本托管适配：[UPSTREAM_ADAPTATION.md](opencode-cloud/docs/UPSTREAM_ADAPTATION.md)
- 真实证据：[evidence](opencode-cloud/evidence)

源码在 opencode-cloud。runtime/vendor 包含受保护运行数据/依赖，不入 Git。不覆盖旧 agent_platform，不提供本地连接器、插件平台、调度、自动 push 或 PR。
