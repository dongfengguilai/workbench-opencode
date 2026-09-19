# v3 工程任务质量增强 · 最终校验报告

校验日期：2026-09-19。版本 v3，路线 `v3-engineering-quality`，包修订 `engineering-r1`。

## 实际执行

- `python3 -m unittest opencode-cloud-v3-engineering/tests/test_kit_guard.py`：18/18 通过，见 [checker-tests.log](checker-tests.log)。
- `python3 opencode-cloud-v3-engineering/scripts/check_kit.py`：结构、JSON 和 28 个本地链接通过，见 [structure-check.log](structure-check.log)。
- v2 共享网关回归：Node 3/3 通过；v2 生命周期回归：Python 19/19 通过。候选代码因无收益已撤回，仓库运行代码保持 v2。
- 五个真实案例的正式 baseline/candidate 尝试均已执行并保留；C01 候选两次通过，C02 行为失败，C03—C05 超预算；见 [comparison](../evidence/comparison.json)。
- r4 只在隔离环境运行，随后真实回退 v2；重新进入看到 46 个原生会话，指定实验会话仍在，项目源文件无变化，最终无强制停止；见 [rollback](../evidence/rollback-to-v2.json)。

## 发布检查

最终 `check_kit.py --release --evidence-root opencode-cloud-v3-engineering/evidence` 返回 2（`RELEASE_BLOCKED`），见 [final-release-check.log](final-release-check.log) 和 [退出码](final-release-check.exit)。这是正确结果：产品状态为 `NO_CHANGE_RECOMMENDED`，A12/A13/A14 未通过，没有用户签收，比较结论也不是 `BENEFIT_DEMONSTRATED`。

检查器只验证记录结构，不能替代真实模型、浏览器行为、业务判断或真人签收。完整私有日志保留在授权的本机证据目录，未写入仓库。

## 重复检查

```bash
python3 opencode-cloud-v3-engineering/scripts/check_kit.py
python3 -m unittest opencode-cloud-v3-engineering/tests/test_kit_guard.py
python3 opencode-cloud-v3-engineering/scripts/check_kit.py \
  --release \
  --evidence-root opencode-cloud-v3-engineering/evidence
```

前两项应通过；第三项应继续拒绝发布，除非未来启动新的、独立冻结的候选并满足全部验收。不得修改本轮记录把失败包装为通过。
