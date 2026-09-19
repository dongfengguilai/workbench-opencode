# 开发包校验报告

生成参考日期：2026-09-19。开发包：OpenCode Cloud v2 · 单机按需工作空间。

## 已实际执行的检查

| 项目 | 结果 |
|---|---|
| 必需文件与文档结构 | PASS：18 个文件 |
| 本地 Markdown 链接 | PASS：36 处 |
| 检查点顺序 | PASS：T0 → T1 → T2 → T3 → T4 |
| 验收编号和任务映射 | PASS：V2-A01—V2-A16，16 组 |
| v0/v1 基线继承 | PASS：均为 USER_CONFIRMED_ACCEPTED |
| 示例资源策略 | PASS：明确 testOnly，禁止自动强杀、读操作唤醒和重放已派发请求 |
| Python 脚本语法 | PASS：3 个文件，标准库 |
| 检查器单元自测 | PASS：16 项；其中正向发布样例为临时合成数据 |
| 初始发布检查 | EXPECTED_REJECTION：退出码 2，NOT_RELEASE_READY |
| ZIP 归档 | 最终打包流程验证 CRC、18 个文件及解压后逐文件字节一致 |

执行环境：Python 3.13.5。检查脚本要求 Python 3.10+。

自测覆盖缺失文档、失效链接、未知/重复验收编号、危险示例配置、初始记录拒绝发布、合成完整记录格式、缺失/错误摘要、证据路径越界、fixture 冒充真实模型、部署缺失、用户签收缺失、制品不一致及基线被重新打开。

## 这些结果不代表什么

没有实现或启动 WorkBench v2，没有构建 OpenCode，没有访问企业内网或模型，没有使用 Docker，没有操作远程服务器和用户工作数据。没有运行产品的 16 组增量验收，没有完成用户签收。

[产品验收记录](../evidence/acceptance.json) 全部保持 NOT_RUN；[资源报告](../evidence/RESOURCE_REPORT.md) 全部保持未测。产品状态 NOT_STARTED。

`check_release.py` 只校验证据记录完整性和文件摘要，不能验证真实性；不能凭检查器返回 0 就替代真实用户验收。自测中的合成 PASS 记录仅创建在临时目录，结束后删除，没有写入正式验收记录。

## 复验命令

在解压后的包目录运行：

```bash
python3 scripts/check_package.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/check_release.py
```

初始包最后一条必须返回 2，原因是产品尚未实施。将来实际运行并填写真实证据后再复验，不为使其通过而生成虚假 PASS 记录。
