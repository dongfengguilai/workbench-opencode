# 本地管理员＋真实 NetID 工程师

固定服务器 aisvr@10.243.117.57，安装目录 /home/aisvr/mnt/sda/programs/WorkBench-v1。本轮不是第二个真实 NetID；管理员通过真实本地认证，mj33kd 通过单位 NetID 认证。没有 NetID 失败时的本地回退，不新增通用管理后台。

## 设置本地管理员

由维护者在自己的服务器终端运行，不把新密码发送给助手：

```sh
ssh aisvr@10.243.117.57
cd /home/aisvr/mnt/sda/programs/WorkBench-v1
./deploy.sh add-admin
```

两次隐藏输入独立新密码，12–1024 字符，不复用 SSH／NetID 密码。仅保存 scrypt 摘要与随机盐。命令先确认原生任务空闲并冷备，然后新增 admin 独立项目／原生状态／1 GiB ext4／模型网关／HTTPS 出口／guard／防火墙，沿用已安装固定镜像。不会复制 mj33kd 项目或清零其请求计数。mj33kd 持久空间已获批准扩大到4 GiB，管理员仍1 GiB；管理员和 mj33kd 均暂保留日额度100,000、并发2、输出16000。

已有合法管理员时重复执行保留密码、项目和会话；未知数据或不完整安装会拒绝继续，不自动重置。安装失败时保留 staging、配置及完整冷备，按维护者恢复流程处理，不删除目录后重试。

## 浏览器地址

工程师旧入口不变：https://10.243.117.57:8443/ 。预览由工作台授权到 IP 的8445。

管理员入口：https://admin.workbench.internal:8443/ 。预览：https://preview.admin.workbench.internal:8445/ 。两身份使用不同主机名隔离 Cookie 和存储；只开放维护者固定地址，不根据请求增加目标。

在使用管理员的电脑 hosts 文件添加一行（需要本机管理员权限）：

```text
10.243.117.57 admin.workbench.internal preview.admin.workbench.internal
```

Windows：用管理员权限打开记事本，打开 `C:\Windows\System32\drivers\etc\hosts` 后添加。Linux／macOS：编辑 `/etc/hosts`。不覆盖原有条目，若已有同名映射先核对。企业 IT 可改为内部 DNS。服务器启动不需要修改客户端 hosts，但客户端浏览器访问管理员必须正确解析名称。

现有 WorkBench 根证书保持不变，仅新增入口证书名称，已经信任根证书的电脑无需重新导入。仍未信任的电脑按 V1-INTRANET.md 安装公开 ca.crt，不分发私钥、不关闭 TLS 校验。localhost:8445 是历史本机入口，不是此服务器入口。

## 使用与维护

登录页区分“管理员登录”和“工程师登录 · NetID”，可切换到另一固定入口。admin 只有自己的工作空间，不获得读取工程师文件或会话的特权。工程师仍自行输入本人 NetID 密码，平台不保存。

```sh
./deploy.sh status
./deploy.sh stop
./deploy.sh
./deploy.sh backup
```

双身份部署时启动恢复两份限额挂载，停止／冷备检查两个原生环境均空闲。备份包含两份工作数据、管理员密码摘要和其他受保护材料，权限0600；不得上传 GitHub。恢复／回滚需要已核对的归档摘要。制品回滚必须与该版本支持的 runtime 身份数量匹配；不能将双身份 runtime 直接配给不支持管理员的旧单身份制品。

## 验收状态

实际结果以 STATUS.md 和 evidence/dual-identity-* 为准。认证协议 fixture 不算真实 NetID 登录；维护者直接原生访问不算 UI 登录。管理员密码尚未设置时，不宣称管理员已经可用；真实 NetID、双身份浏览器存储／预览／截图／下载隔离和任务验收逐项记录，不代替用户 A10 签收。
