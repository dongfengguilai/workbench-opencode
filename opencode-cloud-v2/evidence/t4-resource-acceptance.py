#!/usr/bin/env python3
"""Measure the T0 representative task under the final v2 lifecycle."""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import pathlib
import time
import uuid

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('t4_flow', HERE / 't4-three-space-acceptance.py')
flow = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(flow)

LAB = pathlib.Path('/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint')
OUTPUT = HERE / 't4-resource-comparison.json'
T0 = HERE / 't0-measurement-summary.json'
THREE = HERE / 't4-three-space-flow.json'


def main() -> int:
    acceptance = flow.Acceptance(LAB, HERE / '.unused.json')
    before = acceptance.lifecycle('engineer-b', 'status')
    if before['state'] != 'STOPPED':
        raise RuntimeError('resource run requires engineer-b stopped')
    stopped = acceptance.sample('resource-stopped-before')
    start = time.monotonic()
    ready = acceptance.lifecycle('engineer-b', 'enter', 't4-resource-enter-' + uuid.uuid4().hex[:8])
    cold = round(time.monotonic() - start, 3)
    idle = acceptance.sample('resource-single-idle')
    preview = json.loads(acceptance.node('engineer-b', r"""
const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
fetch('http://127.0.0.1:4096/__preview-control/start',{method:'POST',headers:{Authorization:a}}).then(async r=>{if(!r.ok)throw Error(String(r.status));console.log(JSON.stringify(await r.json()))}).catch(e=>{console.error(e.message);process.exit(1)});
"""))
    prompt = '仅在这个隔离的授权 learn 副本执行 v2 资源回归，不修改任何项目源码、测试或锁文件，也不要安装依赖。使用原生 Bash 执行：1. cd /workspace/project/web && npm test；2. cd /workspace/project/web && npm run build；3. 使用已安装的固定 playwright-cli 和 /trusted/browser.json 打开 http://127.0.0.1:5173/，snapshot，确认页面标题或上传控件，截图保存到 /workspace/project/.workbench-artifacts/v2-t4-resource.png，最后关闭本次浏览器。固定预览已由平台启动，不要重复启动。记录真实退出状态。'
    session, message = acceptance.submit('engineer-b', prompt)
    acceptance.wait({'engineer-b': (session, message)}, timeout=900)
    preview_cleanup = json.loads(acceptance.node('engineer-b', r"""
const a='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
fetch('http://127.0.0.1:4096/__preview-control/stop',{method:'POST',headers:{Authorization:a}}).then(async r=>{if(!r.ok)throw Error(String(r.status));console.log(JSON.stringify(await r.json()))}).catch(e=>{console.error(e.message);process.exit(1)});
"""))
    stop = acceptance.lifecycle('engineer-b', 'stop', 't4-resource-stop-' + uuid.uuid4().hex[:8])
    stopped_after = acceptance.sample('resource-stopped-after')

    t0 = json.loads(T0.read_text())
    three = json.loads(THREE.read_text())
    task_samples = [x for x in acceptance.samples if x['label'] == 'real-model-work']
    peak_private = max(x['privateMemoryBytes'] for x in task_samples)
    peak_persistent = max(x['persistentMemoryBytes'] for x in task_samples)
    report = {
        'schemaVersion': 1,
        'capturedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'environment': 'same isolated learn project, fixed OpenCode 1.18.31, approved Qwen; finite Docker CLI samples',
        't0V1Baseline': {
            'singleGroupIdleMiB': next(x['memoryMiB'] for x in t0['samples'] if x['label'] == 'isolated-idle'),
            'singleGroupMaximumObservedMiB': t0['maximumObservedGroupMiB'],
            'stoppedGroupMiB': next(x['memoryMiB'] for x in t0['samples'] if x['label'] == 'isolated-group-confirmed-stopped'),
            'taskEvidence': 't0-task-observation.json',
        },
        'v2': {
            'stoppedPrivateMiB': round(stopped['privateMemoryBytes'] / 1048576, 2),
            'singleGroupIdleMiB': round(idle['privateMemoryBytes'] / 1048576, 2),
            'singleGroupTaskPeakPrivateMiB': round(peak_private / 1048576, 2),
            'persistentPlatformAndSharedGatewayPeakMiB': round(peak_persistent / 1048576, 2),
            'singleTaskPeakIncludingPersistentMiB': round((peak_private + peak_persistent) / 1048576, 2),
            'coldStartSeconds': cold,
            'previewStarted': bool(preview.get('running')),
            'previewCleanup': preview_cleanup,
            'realModel': 'Qwen3.6-35B-A3B',
            'session': session,
            'modelResult': acceptance.results[f'engineer-b:{message}'],
            'safeStop': stop,
            'stoppedAfterPrivateMiB': round(stopped_after['privateMemoryBytes'] / 1048576, 2),
        },
        'twoSlotObservation': {
            'twoGroupsIdleMiB': round(next(x['privateMemoryBytes'] for x in three['samples'] if x['label'] == 'two-spaces-idle-ready') / 1048576, 2),
            'twoGroupsTaskPeakMiB': round(max(x['privateMemoryBytes'] for x in three['samples']) / 1048576, 2),
            'registeredThirdQueuedWithoutRunningContainer': three['assertions']['twoRunningOneQueued'],
        },
        'tradeoffs': [
            'Stopped private execution memory reached zero, while the platform and shared model gateway remain resident.',
            'Cold entry adds measured startup delay; host page cache is not claimed as instantly reclaimed.',
            'Persistent project, session and legitimate user data continue to consume disk as work grows.',
            'Finite event samples are not an absolute peak or a user-capacity promise.',
        ],
        'samples': acceptance.samples,
        'status': 'PASS' if stop['state'] == 'STOPPED' and stopped_after['privateMemoryBytes'] == 0 else 'FAIL',
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'coldStartSeconds': cold, 'peakIncludingPersistentMiB': report['v2']['singleTaskPeakIncludingPersistentMiB']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
