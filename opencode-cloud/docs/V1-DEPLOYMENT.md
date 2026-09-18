# WorkBench V1 新服务器：当前预检结果

目标：`aisvr@10.243.117.57`，安装目录 `/home/aisvr/mnt/sda/programs/WorkBench-v1`，Compose 项目 `workbench-v1`。只允许真实 NetID `mj33kd`，管理员日额度 100,000；使用同机现有 Qwen，不迁移旧数据、不改其他业务。

**当前尚未完成一键部署包或安装。** 2026-09-18 已执行只读基础条件预检，在缺少正式 HTTPS 材料处停止；现有 `initialize.py`、`start.sh` 是旧本机试用流程，不能拿它们到目标目录初始化 V1，也不能当成 NetID 部署命令。

## 已实际检查

- 安装目录不存在；父目录可写，无符号链接，位于 `/dev/sda1` 的 ext4、shared 挂载，空余 926,755,151,872 字节。
- Docker 29.6.2、Compose 5.3.1 可用，loop-control 存在。需要提权的挂载操作尚未执行；sudo 需要交互密码，不把密码写入脚本或压缩包。
- 同机 `127.0.0.1:4003/v1/models` 返回 200，含 `Qwen3.6-35B-A3B`；这不是容器内真实推理验收。
- 现有运行容器的 ID、镜像与启动时间在预检前后相同，没有启动、停止或重建容器。
- NetID 旧接口只做无密码 GET 探测，重定向后返回 500；不是协议规定的 POST 登录，不能宣称 NetID 可用或不可用。实际登录待正式入口就绪后由用户完成。

完整真实结果：`evidence/v1-target-preflight-20260918.json`。本地六项目录保护测试在 `evidence/v1-preflight-safety-tests-20260918.*`，不代替服务器或浏览器验收。

## 当前需要的材料，用白话说

请服务器／单位网络管理员提供：

1. **这台机器的正式域名和 HTTPS 证书。** 域名需指向 `10.243.117.57`，证书需覆盖工作台与独立预览所需的名称，并能被实际试用浏览器信任；同时提供证书链文件与私钥文件。私钥留在服务器、权限仅维护者可读，不发到聊天或 Git。当前未提供基础域名，也未发现已配置的正式 HTTPS 入口；不能凭 IP 自签证书宣布通过。
2. **单位批准的出站根证书。** 访问 `wttr.in` 和 `playwright.dev` 实际收到 `O=Aptiv, CN=internet.aptiv.com` 签发的链，而系统报告 `self-signed certificate in certificate chain`。需要管理员从单位可信渠道提供根证书文件并确认摘要；网络对端发来的证书不能自动成为信任依据。

观测到的根证书 DER SHA256 为 `3c81f93d51736da44e21621715dd65dd8ff42cc191e3b3b814dc1e41ceffe67b`，仅供管理员核对，**不代表已批准信任**。预检参数 `--egress-ca-sha256` 比较的是提供的证书文件字节 SHA256（PEM 文件摘要与 DER 摘要不同）。批准后只用于 WorkBench 所需信任链，不修改 Codex 的全局校验。

## 重复预检

预检只读，首次安装要求目标目录不存在或为空；任何未知非空目录、目录符号链接都会阻止继续。它不创建目录、项目、凭据或数据卷，也不保存 NetID 密码。

把 `scripts/v1-preflight.py` 作为 Python 标准输入在目标机运行，或在维护者指定的其他目录执行：

```sh
python3 v1-preflight.py
```

收到管理员材料后，实际文件名代入以下参数；不要使用示例占位值：

```sh
python3 v1-preflight.py \
  --base-domain YOUR_APPROVED_BASE_DOMAIN \
  --tls-cert /ABS/APPROVED_FULL_CHAIN.pem \
  --tls-key /ABS/PRIVATE_KEY.pem \
  --tls-hostname YOUR_WORKBENCH_HOST \
  --tls-hostname YOUR_OWN_WORKBENCH_HOST \
  --tls-hostname YOUR_OWN_PREVIEW_HOST \
  --egress-ca /ABS/IT_APPROVED_EGRESS_CA.pem \
  --egress-ca-sha256 IT_CONFIRMED_FILE_SHA256
```

缺失条件时输出 JSON 并退出 2。即使基础检查全部通过，也只叫 `INFRASTRUCTURE_CHECKS_PASS`，不等于部署、NetID、浏览器或 A10 通过。

下一步只解除正式入口和出站 TLS 条件阻塞。固定镜像压缩包、NetID-only 接入、远程来源改造、幂等启停备份恢复和新服务器真实闭环尚未交付；不把原本机历史证据移作新服务器成功记录。A10 仍由用户实际试用签收，第二真实 NetID 提供前双 NetID 隔离不标通过。
