# WorkBench V1 企业内网一键部署

> 2026-09-18：此远程试验部署已退役，旧入口不可用。源码与私密冷备保留在本机，详见 [退役记录](REMOTE-RETIREMENT.md)。以下说明保留供历史版本维护使用。

固定目标 `aisvr@10.243.117.57`，目录 `/home/aisvr/mnt/sda/programs/WorkBench-v1`，Compose 项目 `workbench-v1`。不需要购买公网域名，不迁移旧数据，不改同机模型和其他业务。默认首次只允许 NetID `mj33kd`；可按 [双身份说明](DUAL-IDENTITY.md) 使用 `./deploy.sh add-admin` 增加独立本地管理员。日额度 100,000、并发 2、输出 16,000。

## 安装与恢复运行

先核对压缩包旁 `.sha256`。指定目录必须不存在或为空，不能向未知非空目录解压。离线包包含源码、固定镜像、构建 UI 和摘要，无旧运行数据或登录密码。解压后以 UID 1000 的 aisvr 执行：

```sh
cd /home/aisvr/mnt/sda/programs/WorkBench-v1
./deploy.sh
```

首次隐藏输入模型 API Key，**不是 NetID 或 SSH 密码**。维护者也可用 `--model-key-file /ABS/OWNER_ONLY_FILE` 指定 0600 单行文件。模型只有同机现存 `10.243.117.57:4003` 的 Qwen3.6-35B-A3B；不使用 Luna 或旧主机代理。

脚本检查包摘要、位置、未知文件、UID、ext4/shared、loop、镜像和首次空闲端口，原子生成独立 Git 项目与受保护配置，准备工程师 4 GiB 项目＋原生状态文件系统（旧部署按标记保留原容量）并启动。已有 runtime 必须有匹配的部署标记；未知数据不自动修复或初始化。失败 staging 保留并报告位置。

再次执行只恢复挂载／服务，保留项目、会话、证书、模型令牌和今日计数。维护命令使用独立 compose.v1.json，不用旧 compose／initialize／start 脚本。

## 一次性信任内网证书

工作台 `https://10.243.117.57:8443/`，预览 `https://10.243.117.57:8445/`；从工作台“预览”授权进入。两个端口是不同来源。5173 仍是容器内部端口。 本地管理员使用同IP的8447工作台／8449预览，无需客户端hosts；安装与旧入口转换见DUAL-IDENTITY.md。

安装自动生成 WorkBench 私有 CA 和含 IP SAN 的证书。维护者只将公开 `runtime/ca.crt` 复制为 `WorkBench-v1-root.crt` 交给试用者；**不分发 ca.key、edge.key、tls.key**。

Windows Chrome／Edge：双击维护者提供的根证书 → 安装证书 → 当前用户 → 将所有证书放入“受信任的根证书颁发机构”。核对来源／指纹后确认，重新打开浏览器访问工作台。企业 IT 也可按制度分发。只信任受控部署生成的证书，不自动信任网络对端提供的根证书。

服务器能生成证书，不能替所有电脑安装信任。其他浏览器及 Codex 内置浏览器仍须实测，不关闭 TLS 校验或修改 Codex 全局证书数据库。服务器自身验证成功不等于用户浏览器已验收。

使用自己的 NetID 密码登录。沿用旧接口 `http://10.132.17.137:44327/api/app/user/login` 的 POST userName/password 协议；返回 token 必须有真实 name，且等于 mj33kd。没有本地账号回退，不保存 NetID 密码；网络或服务失败如实返回。

## 维护

```sh
./deploy.sh status
./deploy.sh stop
./deploy.sh                    # 停止／服务器重启后恢复
./deploy.sh backup
./deploy.sh restore --archive /ABS/runtime-TIMESTAMP.tar.gz --sha256 VERIFIED_BACKUP_SHA256
./deploy.sh rollback --archive /ABS/PREVIOUS_BUNDLE.tar.gz --sha256 VERIFIED_BUNDLE_SHA256
```

停止、冷备、恢复／回滚检查原生环境空闲，运行任务时拒绝中断。冷备停止服务、sync／卸载本部署 loop 文件系统，保存 runtime 后恢复运行。备份包含模型凭据、认证状态及私钥，权限 0600，按企业密钥材料保管。

恢复核对摘要／身份，旧 runtime 保留到 backups；制品回滚先冷备，保留原制品再切换固定包，项目和会话不初始化。这些命令只操作本目录和 Compose 项目，使用互斥锁。

## 范围与真实证据

原 IP 入口只支持 mj33kd；新增本地管理员使用独立固定内部主机名和本人预览，不能追加第二身份共享同一 IP Cookie。两身份的真实验收状态见 STATUS.md。原生 Agent／审批／会话不改，工作容器非 root、内部网络、无 Docker Socket。公开 HTTPS 443 经检查全部 DNS 后连接字面 IP 的 CONNECT 网关；私网／元数据／非 443／普通 HTTP及工作容器直接外连仍拒绝。

有限 Host／Origin、签名元数据、一次性票据、注销撤销、CSP 和 WebSocket 代理保持；平台 Cookie 不转发到生成应用。只支持 web/ 静态 HTML/CSS/JS 和锁定 Vite/React，不新增环境配置入口。

包固定 OpenCode1.18.31／Playwright CLI0.1.20／浏览器镜像，附原源码、Bun1.3.14 来源、锁文件、UI 及制品摘要。维护者用 scripts/package-v1.py 构建离线包。实际最新部署／验收结果见仓库 STATUS.md 与 evidence/v1-*；本地 fixture 不算真实 NetID 登录。用户开放外网后的两项复测均200，早先 TLS 失败原样保留。A10由用户实际试用签收。
