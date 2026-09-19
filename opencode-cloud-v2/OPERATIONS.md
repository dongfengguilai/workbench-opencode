# 开发、发布与回退边界

## 1. 默认工作位置

先在开发工作副本和获授权测试宿主运行。旧远程试用已退役 [S2]；本包没有授权登录旧服务器写入、自动恢复试用、更新模型或修改宿主网络。

保留用户未提交代码、参考图片、原生状态、私有冷备和证书。包可存入新目录，不能覆盖当前项目根或生产目录。

## 2. T0 清点

记录实际 HEAD/dirty state、OpenCode/UI/镜像摘要、配置版本、Docker/Compose 版本、当前有效入口和认证方式。代码早期文档的端口/账号/容量不能直接当成当前事实。

在 [RESOURCE_REPORT](evidence/RESOURCE_REPORT.md) 中列出资源归属：常驻平台、每用户私有执行组、持久空间、共享模型、同机其他业务。只读采样不能扫描或输出 secrets。

对于涉及模型的真实回归，先确认批准的端点、余额/额度和可接受调用范围。使用已有受控配置，不让用户在聊天粘贴密码或 Key。

## 3. 启停所有权迁移

现有部署脚本可能一次启动所有已配置组 [S3]。v2 应把“启动平台基础服务”与“启动某空间组”分开：基础服务启动成功不再意味着拉起所有用户环境。

修改执行组 restart policy 前先枚举影响对象，仅限当前产品；不修改模型与其他业务。映射每个空间到固定 Compose service 集，不接受来自 HTTP 的服务名称。测试冷启动、防火墙和 network namespace 重建。

不要复制整个部署系统。可以保留原入口并为受控子集增加动作；实际命令要由实现后测试确认并写入本节。当前文档没有声称 `deploy.sh start-space` 等命令已经存在。

## 4. 单机控制权限

轻量平台不直接暴露 Docker daemon。需要容器管理时使用受信任宿主 helper，固定动作、固定标签、固定数据根和调用者身份。网关/助手/生成网页不能使用该管理能力。

采用单一控制者和可靠管理锁。锁丢失/状态损坏时不启动新组；不以删除锁文件、清空状态或重建用户空间作自动恢复。

故障演练在专用测试栈/测试 daemon 进行；不得对共享宿主整体重启 Docker 来运行一个测试。没有隔离演练条件，则将该验收精确标为受外部条件阻塞。

## 5. 数据与磁盘

当前文件系统布局、loop 镜像容量、项目及原生状态保持。新增空间的重资源延迟到首次进入；已有标记缺数据时报错，禁止初始化覆盖。

磁盘报告区分逻辑配额、宿主实际分配、文件系统可用空间、真实数据。镜像共享层计一次，持久卷和日志另算 [S7]。容量阈值基于宿主剩余、预分配需要和并发增长余量；仅有一个 `df` 百分比不足以承诺永不 ENOSPC。

低空间时拒绝新建或唤醒可能写入的工作，保留登录/诊断。实际空间耗尽时如实失败，不伪造成功；控制状态应有独立可用空间预算，恢复后核对会话完整性。

只按路径归属清理平台创建的过期临时文件和轮转日志。依赖缓存不在每次休眠删除；不自动清除源码、原生历史、未提交改动、未知目录或备份。

## 6. 模型网关切换

先在测试栈验证共享网关。发布时停止新模型准入，等待/核对旧在途请求，再迁移身份凭证与用量。切换两个环境的固定地址和受控网络，验证工作负载无法绕过。

不要为测试改动同机推理服务配置；后端必要能力缺失需报告。旧网关不能仍保留第二条可绕过总限额的工作路径。回退前保存切换后新增用量，避免恢复旧计数。

## 7. 增量发布

发布包固定 OpenCode 与工作镜像版本；界面只增加轻量状态和操作。部署配置/制品标识记录为新版本，不重命名旧 Compose、目录、卷或证书。

发布前准备受影响对象清单、备份、无数据重置验证及回退方案。真实部署需单独明确授权；没有授权时输出可部署制品和已验证开发记录，不能声称线上交付。

## 8. 回退

回退的不只是 UI 或代码，还包括执行组重启策略、模型路由、用户 scope 和管理元数据。旧启动脚本可能拉起全部组，不能用回退瞬间突破安全容量。

先关闭新准入，等待安全边界，保留当前原生数据与计数；只替换兼容制品/受控配置。恢复旧备份会丢失备份后的新工作，不能默认采用。若状态格式不兼容，要有明确转换或保持待恢复，不清空数据。

回退后只启动容量允许且明确需要运行的组，记录实际状态并由用户验证。禁止 `down -v`、全局 prune、删除生产目录或为了版本命名新建空卷。

## 9. 必须补出的实际操作说明

Codex 实施后在仓库相应文档补：如何启动基础平台；进入/停止空间；检查名额和队列；核对 UNKNOWN；管理模型不确定请求；查看磁盘和资源报告；部署和回退；如何取得真实证据。所有命令必须在相应环境实际运行过，未运行项明确标注。

## 10. T2 已验证的共享模型操作

本机候选栈将共享网关作为常驻轻量服务，各空间仍分别启动出口、OpenCode 和 guard。OpenCode 的默认模型与 `small_model` 都是 `Qwen3.6-35B-A3B`；需要更快模型时在原生模型选择中显式选择 `gpt-5.6-luna`。网关不会在两者之间自动回退。每个空间只持有自己的 scope，主密钥只挂载到共享网关。

维护者可用固定 helper 的 `status`、`enter`、`cancel` 和 `stop` 动作查看或改变空间状态。实际测试配置使用 Unix socket，请求体只接受已登记空间、固定动作和有界 request ID。工作容器内的 `GET /v1/workbench/status` 只返回本 scope 的排队、在途和未决数量；安全停止会把 `model-queued` 或 `model-dispatch` 显示为阻塞原因。

派发后连接中断会把对应后端标为 UNKNOWN，并在 `dispatches.json` 中保留不含提示词的记录。维护者先核对后端实际结束，再停止共享网关并执行：

```text
python3 opencode-cloud/scripts/shared-gateway-reconcile.py \
  --state-dir <受保护共享网关状态目录> \
  --confirm-ended <精确请求ID> \
  --gateway-stopped
```

脚本未收到精确 ID 或网关停止声明时拒绝修改。恢复网关后再次执行空间停止。不能用本地 HTTP timeout、浏览器断连或经验等待代替后端结束确认。

当前本机验证中 Qwen 已完成真实 OpenCode 测试驱动修改。Luna 的模型发现接口可达，但聊天接口由其服务返回 HTTP 500，原因是该服务自身的 `127.0.0.1:7890` 上游代理未运行；WorkBench 返回不可重试的 424，并且没有改用 Qwen。修复应发生在 Luna 服务宿主，不能在 WorkBench 中关闭校验或伪造成功。

## 11. T4 已运行的本机候选操作

最终本机候选制品提交为 `cba249137c43c4b68162bf5bddf6ccf3f6b338d1`，归档 SHA-256 为 `07b02dd95ddc77d3f1ee8c61ec26ab9f395e916d806aeca29c53cef6154a4153`。归档包含固定源码、脚本、测试、浏览器工具和已构建 `workbench-ui`；第一次漏装被忽略的 UI 制品时平台明确失败，恢复原挂载后修正，失败证据保留。

实际候选配置位于：

```text
/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/compose.release.json
/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle.release.json
```

维护者在确认三个空间均为 `STOPPED`、队列为空且 `shared-model/state/dispatches.json` 没有未决请求后，实际执行的增量切换是：

```text
docker compose -f /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/compose.release.json \
  up -d --no-deps --force-recreate platform shared-model-gateway

python3 /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/releases/cba249137c43c4b68162bf5bddf6ccf3f6b338d1/opencode-cloud/scripts/lifecycle-helper.py \
  --config /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle.release.json \
  --socket /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle/lifecycle.sock
```

状态、进入和停止通过固定 Unix socket 调用；请求只接受登记身份与固定动作：

```text
curl --unix-socket /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle/lifecycle.sock \
  -H 'Content-Type: application/json' \
  -d '{"space":"engineer-b","action":"status"}' http://localhost/lifecycle

curl --unix-socket /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle/lifecycle.sock \
  -H 'Content-Type: application/json' \
  -d '{"space":"engineer-b","action":"enter","requestId":"维护者生成的唯一短ID"}' http://localhost/lifecycle

curl --unix-socket /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle/lifecycle.sock \
  -H 'Content-Type: application/json' \
  -d '{"space":"engineer-b","action":"stop","requestId":"维护者生成的唯一短ID"}' http://localhost/lifecycle
```

返回 `UNKNOWN` 时不得删除状态或强启另一代；先检查整个登记组、原生任务/问题/审批/PTY、共享网关未决请求和 controller 日志。模型未决请求仍使用第 10 节的精确核销流程。

本次实际回退只切换平台、共享网关和 helper 的制品挂载与受控配置，未恢复数据备份：

```text
docker compose -f /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/compose.json \
  up -d --no-deps --force-recreate platform shared-model-gateway

python3 opencode-cloud/scripts/lifecycle-helper.py \
  --config /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle.json \
  --socket /home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint/lifecycle/lifecycle.sock
```

回退后核对发布后新增文件、同一原生会话和最新 `budgets.json`，再部署同一不可变制品。禁止用旧数据目录覆盖、`down -v` 或旧整体启动脚本。资源实测及残留成本见 [RESOURCE_REPORT](evidence/RESOURCE_REPORT.md)；最终制品、回退和三空间证据见 `evidence/t4-*.json`。
