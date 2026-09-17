# 固定试用部署

所有命令从仓库的 `opencode-cloud` 目录执行。Linux x86_64、Docker/Compose >=2.40（!override）、Git、Python3、OpenSSL、util-linux/e2fsprogs、共享传播宿主挂载、loop 设备为真实要求。Docker 控制权限只在维护者侧，平台和工作容器没有 Socket。旧 agent_platform 不参与运行。

## 新部署

模型是固定 `http://192.168.142.130:8317/v1` 的 gpt-5.6-luna。维护者把已授权 Key 放入 owner-only 单行文件；不在命令行写 Key。先验证模型真实可用，不能用开发响应替代。

```sh
python3 scripts/fetch-upstream.py
# 仅构建时使用已有网络代理；没有代理则去掉 build-arg。
docker compose build --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy native
python3 scripts/initialize.py --project /ABS/AUTHORIZED/PROJECT --baseline FULL_COMMIT_SHA --origin https://TRIAL_HOST:8443 --model-key-file /ABS/PROTECTED/MODEL_KEY
python3 scripts/quota.py --migrate-stopped
./scripts/start.sh
./scripts/status.sh
```

initialize 拒绝非空 runtime。clone 为新副本，不重置用户目录，移除 remote，不注入 SSH 或仓库凭据。真实 local-admin 分支复用旧登录代码；NetID 客户端保留但没有正式配置/验证，不能声称 NetID 已验收。生成两个真实本地试用账号，不使用 Mock。证书为 30 天自签试用证书；受信任 HTTPS 应由维护者替换 runtime/tls.key、tls.crt，并匹配 origin。密钥文件 0600，runtime 不入 Git。

固定 OpenCode v1.18.31，commit 014614d35b397775e5d397a490fc72368c894ec2，制品 SHA256 b283e8dbe9e6fc224bb4b79992ce3bd2174b8b7b0c3e7d1b4e6024a1d11edc84。官方二进制自带同版本 Web UI；未修改原生源码。资源受控：CPU2、内存2GiB、PID256、临时目录256MiB；每身份项目和完整原生状态共享独立 1GiB ext4 文件系统。scope 模型凭据只访问固定路由，最多并发2、输出16000 Token、UTC 日250次上游请求（包括失败），计数在各自 gateway-state 持久化；主 Key 仅在可信网关。

quota.py 的短暂维护容器仅用于新 loop 文件系统：SYS_ADMIN/DAC_OVERRIDE/CHOWN/MKNOD、AppArmor unconfined、无网络，不是工作容器。工作容器始终非 root、所有能力删除、只读系统、内部独立网络。脚本验证实际 bounded ext4 挂载，条件不满足则退出，不能退回宿主无限磁盘。迁移要求停机及冷备，原项目/状态目录保留 .prequota-*；不删除。宿主重启后运行 start.sh 会恢复 loop 挂载；不可绕过脚本启动到未挂载目录。

固定模型上游当前自身依赖 localhost:7890。model-repair profile 的真实 TCP bridge 只绑定宿主 127.0.0.1:7890，转发到已有 192.168.56.1:7890；并非模拟模型。若外部代理变更，需要维护者更新固定配置并重新做真实模型验收。不能静默切换模型。

## 启停、身份与配置

```sh
./scripts/stop.sh
./scripts/start.sh
./scripts/status.sh
```

只 stop，不 down -v。start 同时重建 native、防火墙及 guard，避免 network namespace 换新后 UID 管理端口防火墙丢失。不得只 recreate native。正常工作进程 UID1000 不能直连4030，UID1001可信 guard 在同网络命名空间代理4096；只有平台8443发布公网。环境内部模型 route 8318，没有原生服务公网映射。

运行时更改 platform.json 时原文件原位写入（单文件只读 bind 不追踪原子 rename 的新 inode），或者正常重建平台。enabled=false/会话过期每2秒撤销已有 SSE/WS，写操作每次验证。配置不可读时请求503、关闭长连接。注销只撤销该浏览器登录，不抹除原生会话。模型撤销可停对应 gateway 或轮换该 scope token，更新两个对应配置后受控重启；不会给用户提供主 Key。

## 验证

```sh
./scripts/native-smoke.sh
node test/platform-live.mjs
node test/export-live.mjs
# Playwright 和 Chromium 必须是真实可用依赖；当前维护机使用记录的 bundled Node/Playwright。
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/persistence-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/isolation-live.mjs
node test/admission-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/native-terminal-ui-live.mjs
/home/vmware/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/faults-live.mjs
```

浏览器测试使用真实 HTTPS/local credentials/容器/模型，只有自签证书校验在试用测试中显式关闭。config-live.mjs、browser-flow.mjs 会创建验收数据、发真实模型任务；首次基线断言不可绕过，重复执行需维护者提供新的独立验收副本，不重置现有工作。单元测试 test/model-gateway.test.mjs 使用不可达上游，仅验证边界，不能替代模型验收。失败日志保留，不把退出成功当作全部必需场景通过。

## 冷备与独立恢复

```sh
python3 scripts/backup.py runtime/backups/NEW_NAME.tar.gz
python3 scripts/restore.py runtime/backups/NEW_NAME.tar.gz runtime/NEW_RESTORE_PATH
```

backup 先实际检查两个原生状态 idle，停止 admissions 与原生进程，保存项目、原生 DB/WAL/快照/日志/XDG state、平台登录摘要和配置；然后安全重启全部实例。备份含真实秘密，0600，不入 Git、不对浏览器提供。restore 校验 SHA256，只接受不存在的新目标，拒绝覆盖当前卷。

恢复功能验证由 test/restore-live.mjs 在新的 Compose 项目和内部网络实际启动恢复副本，检查同一 Session/文件摘要，再由原生模型执行测试。恢复环境仍使用 UID 防火墙和 guard；临时环境停止后保留恢复数据。不要只验证文件存在，也不要以聊天文本导出代替 SQLite 会话。

当前部署与证据参考 evidence/baseline.md、各验收 result.json 及 STATUS.md；A10 必须实际用户签收。
