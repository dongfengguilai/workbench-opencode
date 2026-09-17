# 发现基线（2026-09-17）

- 初始工作目录只有 `opencode-cloud-v0` 说明包，没有 Git 仓库、登录服务或实现代码。实现新增于 `opencode-cloud`；旧系统未修改或启动。
- 用户授权新仓库 `git@github.com:dongfengguilai/workbench-opencode.git`，远端初查无 refs。本次产品功能任务为完整变更导出，原任务、固定失败测试和 commit 见 `a01-task.txt`、`a01-baseline.json`。
- 原生 OpenCode 固定 `v1.18.31` / `014614d35b397775e5d397a490fc72368c894ec2`。GitHub tags ref 与说明包一致，官方 Linux x64 baseline 制品已校验 SHA-256；完整原始元数据见 `upstream-release.json`，源码/二进制摘要见 `source-provenance.json`。未修改原生循环、会话、上下文或工具。
- 模型发现实际列出 `gpt-5.6-luna`。批准来源为用户提供的 `http://192.168.142.130:8317/v1/models`；OpenAI 兼容请求将经只允许固定模型及必要路径的转发。主凭据仅在忽略且 0600 的 `runtime/gateway.env`，工作环境得到独立随机 token。未将凭据写入镜像或 Git。
- 认证来源：旧 `agent_platform` commit `7832582b9976f20d1bd4d80e3b812c2bf9afc407`，无未提交修改。实际实现为 POST `/api/app/user/login`，字段 `userName/password`、可信 HTTP 响应中的 JWT 身份，以及本地管理员分支；平台会话随机 token、SHA-256 存储、HttpOnly cookie、注销删除。初查 NetID 路由 HTTP 500，未尝试编造身份。用户已要求先设置管理员使用。
- 当前主机 Linux x86_64、Docker 29.1.3、Compose 2.40.3，可使用新容器/目录。原始 `docker ps` 无运行服务。网关与主机同地址；目标正式 HTTPS/证书未提供。
- 原生容器计划使用非 root 1000、只读根文件系统、cap_drop ALL、no-new-privileges、2 CPU/2 GiB/256 PID；仅挂独立项目、原生状态及只读受控配置。无 Docker Socket、SSH 凭据和仓库 remote。
- 构建依赖需已有主机代理的小写 `http_proxy/https_proxy` build args；直接容器下载超时，失败尝试保存在 `container-build*.log`。代理只用于构建，不注入工作环境。
- 练习 CSV fixture 仅 smoke，尚未执行，不计入真实项目 A01。

这份发现基线不宣称部署或 A01 已通过。所有实际结果另存执行证据。

## 实际实施补充（2026-09-17）

- 已实际部署 https://192.168.142.130:8443，30 天自签试用证书；真实 local-admin 认证按用户明确决定启用，第二个真实本地身份 trial-b。受信任生产证书/NetID 尚未验收，不把它们计入通过声明。
- 原生基线 9320d7bdc9f2f1e87c865646952c86f239a57d9b；授权新产品真实任务为实现补丁导出核心，无维护者预修。A01 Session ses_f5298a8dbffeKFpwTjYXgYE2F2，平台独立干净重跑 Session ses_f52850e1affeIcfvPF0rynZtLI；所有失败尝试和需求补充保留。
- 官方制品内嵌 UI 的固定 assets 如 source-provenance.json；Settings 界面显示 Desktop v1.18.30，这是 v1.18.31 已验证二进制内的实际显示值，不另取 rolling UI。
- 实际非 root/只读/cap_drop、独立网络与卷以及管理 loopback UID 防火墙均已启动和测试；每身份项目+完整原生 /state 已迁移到独立 1GiB ext4，原目录保留。无 SSH、remote、Docker Socket 或主 Key 工作环境挂载。
- 主 Key 仅在 trusted model-gateway；固定 route、scope token、并发2、输出16000及 UTC 日250次请求限额，计数持久化。原生会话 DB、WAL/快照、XDG_STATE 均在 /state。
- 冷备 SHA256 3796e27a06b08ce8c24ba26de1a8be4962518050c1cca249b32f01c8ecbd8343；恢复到独立临时 Compose 网络/目录后，相同原生会话和代码摘要保留，真实 Luna 续聊执行测试 3 PASS。
