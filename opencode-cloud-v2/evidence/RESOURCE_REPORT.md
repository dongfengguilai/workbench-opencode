# T0 资源基线（完成）

实际HEAD `09e0c6d24c418d04fbebe1ee1e29e753a2d2c2e9`，本机获准开发，v0/v1用户签收继承。固定OpenCode1.18.31、Playwright CLI0.1.20；镜像ID、Docker/Compose、namespace、挂载及重启策略见t0-inventory.json。CPU 2逻辑核；内存约20.06GB，采样时available约12.04GB；磁盘余量约105.61GB。原用户服务继续运行，不操作远程模型主机；外部QwenGPU/实际后端并发和其他使用方未知。

独立诊断栈workbench-v2-checkpoint复用已实际下载的授权learn源码ZIP，重新建立独立测试基线，不复制原用户原生会话。诊断数据在`/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint`，普通ext4测试目录，尚非v2延迟配额初始化实现。原用户三个1GiB配额镜像逻辑长度及实际分配见inventory；共享镜像按imageId识别，不按用户重复相加。原备份不删除/不上传。

代表流程：原生Qwen会话`ses_f492d11b9ffe7ptlGuGIwvoCec`，8次真实Bash（具体列表见observation），npm test51/51、Vite构建、固定CLI打开页面/快照/截图/关闭；截图已实际查看，页面上传控件正常。模型工具原始记录仅存在私有state/v2-t0，公开证据只保存退出状态、输出摘要及有限命令信息。

指标：DockerCLI内存扣除inactive_file，不是进程RSS；额外保存cgroup memory.current/memory.stat和逐进程RSS，观察器短暂进程及共享页重复计数不应当作净工作量。来源：[Dockerstats说明](https://docs.docker.com/reference/cli/docker/container/stats/)。

| 事件 | 实测私有组工作集MiB | 进程及线程数 |
|---|---:|---:|
| isolated-idle | 390.34 | 31 |
| real-model-task | 646.36 | 71 |
| accepted-real-model-task | 676.55 | 72 |
| accepted-task-observation | 716.05 | 72 |
| observed-model-and-tools | 804.68 | 102 |
| real-tools-observation | 891.83 | 73 |
| after-failed-stop-attempt | 677.11 | 38 |
| after-failed-stop-attempt | 677.39 | 37 |

观测最大值891.83MiB，仅有限事件样本，不冒充绝对峰值。无init guard收到SIGTERM30秒未退出；没有发送SIGKILL，没有取得停止后0进程证据。原有用户容器ID、启动时间、状态及保护配置摘要全部不变。

测试候选容量2个名额，每组配置上限2688MiB（native2048+guard256+出口128+当前诊断模型网关256）；两个总上限5.25GiB在当时约12GB available内保留余量。该值不是观测峰值或生产人数承诺；共享网关将在T2切片重新计常驻成本。空闲、队列与启动截止参数待T1实测，不照抄样例。

授权后仅清理并重建四个新诊断计算容器，源码/会话/计数保留；init:true完整组实际重进后同一真实会话、51测试、构建及截图仍在，四成员随后仅SIGTERM全部退出，无137/SIGKILL，停止后运行成员与进程为0。初始失败证据保留。T0通过，容量2仅作为后续测试参数。

## T4 同宿主收益与代价（实测）

最终候选仍在同一宿主、同一 `learn` 隔离副本、固定 OpenCode 1.18.31 和批准的 Qwen 上运行 T0 的代表流程：`npm test`、Vite 构建和固定 Playwright CLI 页面检查。以下均为有限时点的 Docker CLI memory working-set 样本，不是 RSS 精确加总、绝对峰值或人数承诺。

| 状态 | v1/T0 私有组 | v2 私有执行组 | v2 常驻平台＋共享网关 | 说明 |
|---|---:|---:|---:|---|
| 单组空闲就绪 | 390.34 MiB | 285.55 MiB | 约 140–151 MiB | 常驻成本会被多个空间共同承担；单用户总量不一定下降 |
| 同代表任务有限峰值 | 891.83 MiB | 966.52 MiB | 150.52 MiB | v2 本次总样本峰值 1117.04 MiB，高于 T0；不宣称活跃任务节省 |
| 两组空闲就绪 | 未在 T0 同时采样 | 574.62 MiB | 140.23 MiB | 第三个空间排队且没有执行容器 |
| 两组任务期有限峰值 | 未在 T0 同时采样 | 970.73 MiB | 约 140–153 MiB | Qwen 实际只有一个 llama.cpp 槽位，模型请求串行完成 |
| 全部空间停止 | 0 MiB | 0 MiB | 140.77 MiB | 项目、原生会话和合法数据继续占磁盘 |

冷启动实测为 5.509 秒和 8.178 秒；同一空间再次进入为 9.167 秒。同代表任务的独立资源轮次冷启动为 8.403 秒。收益发生在空闲期：停止后每个私有执行组没有运行容器或进程，同时保持约 141 MiB 的平台和共享模型网关常驻成本。代价是进入等待、共享控制组件内存，以及工作期间并未降低的峰值。

两个已实际使用的容量测试空间目录当前约 4.9 MiB 和 5.0 MiB；真实项目目录约 127 MiB。它们会随源码、依赖缓存和会话增长，不能宣传零存储。此前 `t1-lazy-status-no-init.json` 已证明仅登记、未进入时不创建整套执行负载或重型项目数据；T4 没有为凑数字再创建虚假用户。

原始数据见 `t4-resource-comparison.json`、`t4-three-space-flow.json`。首次同任务停止被平台管理的预览 PTY 阻塞，系统未强杀；调用固定预览停止后再次安全停止，私有内存回到 0。这个代价和恢复过程保留在证据中。
