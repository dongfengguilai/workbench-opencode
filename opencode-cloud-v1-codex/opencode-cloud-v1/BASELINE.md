# 基线、版本和事实来源

编制日期：2026-09-18。以下区分用户已确认的结果、仓库静态事实和本包提出的新要求。

## 1. 最新用户确认是当前验收状态依据

用户原话：

> 我已经使用个人id企业内网成功登陆，也运行整套部署和完整验收测试，之前的开发包序号是v0，所以现在是v1，给出v1的开发包

据此记录：

| 对象 | 状态 | 依据 |
|---|---|---|
| 现有 v0 的本人企业内网登录 | 已由用户确认完成 | 本轮明确确认 |
| 现有 v0 的整套部署和完整验收 | 已由用户确认完成 | 本轮明确确认 |
| 新的 v1 第二位真实用户/第二个项目 | 尚未实施或验收 | 不从 v0 结果推断 |
| 新的 v1 导出回归与安全增量 | 待在实际开发 HEAD 核验 | 本包任务 |

**禁止**因为仓库历史 STATUS 还写 `NOT_RUN` 或等待登录，就再次要求用户证明 v0 已经通过、重新安装证书或从零跑整套旧验收。

允许补记已有证据的索引与说明；无法找到旧日志时标注“用户确认，旧日志未定位”，不得编造文件。维护者可以验证本次实际改变的认证、路由、预览等行为；这是增量回归，不是否定原验收。

## 2. 产品编号不等于历史部署名

| 名称 | 本包如何解释 |
|---|---|
| `opencode-cloud-v0/` | 已完成的上一开发包 |
| 旧部署目录 `WorkBench-v1`、Compose `workbench-v1` | 历史资源标识，属于现在已接受的 v0 基线 |
| 旧 `compose.v1.json`、`docs/V1-INTRANET.md`、`evidence/v1-*` | 已存在文件，不全局替换、不改写旧事实 |
| 本次 `opencode-cloud-v1/` | 新的 v1 开发规格与验收记录 |
| v1 新执行记录 | 建议 `opencode-cloud/evidence/increment-v1/`；避免覆盖旧 `v1-*` |

禁止为了让名称“更整齐”重建 Compose 项目、移动数据卷、初始化原生数据库或替换现用证书。只新增版本映射说明。新部署的资源 ID 由现有工具查重后确定，不从文档编号机械推导。

## 3. 仓库参考基线，不是生产锁死指令

- 仓库：`dongfengguilai/workbench-opencode`。
- 本次连接器复核的 `main`：`7aefcee24ad7dc59a7ae316023ff081e633629ed`。
- 提交日期：2026-09-18。
- 固定原生 OpenCode：仓库记录为 `1.18.31`；沿用实际已验收部署，不升级 `latest`。
- 本包没有远程登录用户服务器，也没有自行重新运行其整套验收。

Codex 开始时记录实际 HEAD、未提交改动、已部署制品摘要。HEAD 已更新就读取差异，不能强制 checkout 到上述提交、丢掉后续修复或工作区改动。用户实际部署比仓库快时，查明差异后基于用户当前工作继续。

上一轮审阅指出的两个导出反例是“当前 HEAD 待复核项”，不是要求重复修复已经修好的代码：合法 `src/db`、`src/state`、`src/runtime`、`src/credentials.ts` 可能被静默排除；补丁与 ZIP 对 `.npmrc` 的处理不一致。本包附真实实现回归，不靠文档描述判断通过。

## 4. 当前可借用的实现与约束

- `platform.ts` 已有身份到环境的绑定和原生代理；`access-policy.ts` 固定 `/workspace/project`。
- `environment-guard.ts`、内部网络与原生环境构成现有执行边界；继续复用。
- `patch-export.ts`、`source-export.ts`、`snapshot-git.ts` 是现有导出路径。
- 预览目前面向 `web/` 和内部 5173；本次不扩成任意端口发布。
- 当前模型入口和额度保持管理员配置，不开放用户 URL/Key/MCP/插件修改。
- NetID 协议和现有信任条件已经被用户实际使用。不得擅自重写 SSO；如果新增部署改变认证传输路径或扩大暴露范围，记录新增风险并交由授权维护者确认，不自动重置 v0 验收。

## 5. 来源索引

以下只用于追溯已有事实，不要求开发前重读上游全部文档。

- **S1 仓库与提交**：[固定提交](https://github.com/dongfengguilai/workbench-opencode/commit/7aefcee24ad7dc59a7ae316023ff081e633629ed)
- **S2 已有托管边界**：[UPSTREAM_ADAPTATION.md](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/docs/UPSTREAM_ADAPTATION.md)
- **S3 身份与环境映射**：[platform.ts](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/src/platform.ts)
- **S4 导出源码**：[patch-export.ts](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/src/patch-export.ts)、[source-export.ts](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/src/source-export.ts)、[snapshot-git.ts](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/src/snapshot-git.ts)
- **S5 单身份历史部署边界**：[V1-INTRANET.md](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/docs/V1-INTRANET.md)、[compose.v1.json](https://github.com/dongfengguilai/workbench-opencode/blob/7aefcee24ad7dc59a7ae316023ff081e633629ed/opencode-cloud/compose.v1.json)
- **S6 浏览器安全事实**：[RFC 6265](https://httpwg.org/specs/rfc6265.html) §1、§8.5：Cookie 不以端口隔离；[MDN 同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)：Origin 由协议、主机、端口组成。不同端口不是独立 Cookie 域。
- **S7 用户方法论材料**：已提供的 `Vibe_Coding_Agent_Platform_Architecture.md` 的纵向交付、限制范围与不提前抽象原则。仅采用这些纪律，不采用其多 Runtime 与新 Run 模型建议。

来源优先级：最新用户明确要求 → 当前实际代码/部署与新增证据 → 本包设计 → 旧任务包中的过时路线。不得借此覆盖安全要求或伪造事实。
