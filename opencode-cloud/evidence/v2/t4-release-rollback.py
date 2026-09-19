#!/usr/bin/env python3
"""Controlled immutable-artifact release, rollback, and final redeploy in the isolated stack."""
from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import subprocess
import time
import uuid

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('t4_flow', HERE / 't4-three-space-acceptance.py')
flow = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(flow)

LAB = pathlib.Path('/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint')
REPO = pathlib.Path(__file__).resolve().parents[3]
MANIFEST = json.loads((LAB / 'releases/t4-artifact-manifest.json').read_text())
ORIGINAL_COMPOSE = LAB / 'compose.json'
RELEASE_COMPOSE = LAB / 'compose.release.json'
ORIGINAL_LIFECYCLE = LAB / 'lifecycle.json'
RELEASE_LIFECYCLE = LAB / 'lifecycle.release.json'
SOCKET = LAB / 'lifecycle/lifecycle.sock'
PID_FILE = LAB / 'lifecycle/helper.pid'
OUTPUT = HERE / 't4-release-rollback.json'
LOG = HERE / 't4-release-rollback.log'


def run(args: list[str], timeout: float = 180) -> str:
    proc = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    with LOG.open('a') as stream:
        stream.write('$ ' + ' '.join(args[:3]) + (' ...' if len(args) > 3 else '') + '\n')
        stream.write(f'exit={proc.returncode}\n')
    if proc.returncode:
        raise RuntimeError(f'controlled command failed ({proc.returncode}): {args[0]}')
    return proc.stdout


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def helper_pids() -> list[int]:
    rows = []
    for proc in pathlib.Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            cmd = (proc / 'cmdline').read_bytes().replace(b'\0', b' ').decode()
        except (OSError, UnicodeDecodeError):
            continue
        if 'lifecycle-helper.py' in cmd and str(LAB) in cmd:
            rows.append(int(proc.name))
    return rows


def stop_helper() -> None:
    pids = helper_pids()
    if len(pids) != 1:
        raise RuntimeError(f'expected one lifecycle helper, found {len(pids)}')
    os.kill(pids[0], signal.SIGTERM)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            if os.waitpid(pids[0], os.WNOHANG)[0] == pids[0]:
                break
        except ChildProcessError:
            pass
        if not pathlib.Path(f'/proc/{pids[0]}').exists():
            break
        time.sleep(.2)
    if pathlib.Path(f'/proc/{pids[0]}').exists():
        raise RuntimeError('lifecycle helper did not stop after SIGTERM')
    SOCKET.unlink(missing_ok=True)


def start_helper(config: pathlib.Path, script: pathlib.Path, label: str) -> int:
    log = (LAB / f'lifecycle/{label}-helper.log').open('ab', buffering=0)
    proc = subprocess.Popen(
        ['python3', str(script), '--config', str(config), '--socket', str(SOCKET)],
        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    PID_FILE.write_text(str(proc.pid) + '\n')
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f'{label} lifecycle helper exited during startup')
        if SOCKET.exists():
            time.sleep(.25)
            if proc.poll() is None:
                return proc.pid
        time.sleep(.2)
    raise RuntimeError(f'{label} lifecycle socket did not appear')


def wait_services() -> None:
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        platform = json.loads(run(['docker', 'inspect', 'workbench-v2-checkpoint-platform-1']))[0]
        gateway = json.loads(run(['docker', 'inspect', 'workbench-v2-checkpoint-shared-model-gateway-1']))[0]
        if platform['State']['Running'] and gateway['State']['Running'] and gateway['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('platform/shared gateway did not become ready')


def switch(compose: pathlib.Path, lifecycle: pathlib.Path, script: pathlib.Path, label: str) -> dict:
    stop_helper()
    run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--no-deps', '--force-recreate', 'platform', 'shared-model-gateway'])
    wait_services()
    pid = start_helper(lifecycle, script, label)
    acceptance = flow.Acceptance(LAB, HERE / '.unused.json')
    states = {s: acceptance.lifecycle(s, 'status') for s in ('engineer-b', 'lazy-c', 'lazy-d')}
    if any(x['state'] != 'STOPPED' for x in states.values()):
        raise RuntimeError('artifact switch unexpectedly started a private execution group')
    inspected = {
        name: json.loads(run(['docker', 'inspect', name]))[0]
        for name in ('workbench-v2-checkpoint-platform-1', 'workbench-v2-checkpoint-shared-model-gateway-1')
    }
    mounts = {name: {m['Destination']: m['Source'] for m in row['Mounts']} for name, row in inspected.items()}
    return {'label': label, 'helperPid': pid, 'states': {k: v['state'] for k, v in states.items()}, 'mounts': mounts}


def protected_hashes() -> dict[str, str]:
    paths = [
        LAB / 'platform.json', LAB / 'shared-model/model-scopes.json',
        LAB / 'native.env', LAB / 'scope.env', LAB / 'lazy-c/native.env', LAB / 'lazy-c/scope.env',
        LAB / 'lazy-d/native.env', LAB / 'lazy-d/scope.env',
        pathlib.Path('/home/vmware/Workspace/programs/WorkBench/runtime/tls.crt'),
        pathlib.Path('/home/vmware/Workspace/programs/WorkBench/runtime/tls.key'),
    ]
    return {str(p): digest(p) for p in paths if p.is_file()}


def v0_runtime() -> dict:
    names = [x for x in run(['docker', 'ps', '--format', '{{.Names}}']).splitlines() if x.startswith('opencode-cloud-v0-')]
    out = {}
    for name in names:
        row = json.loads(run(['docker', 'inspect', name]))[0]
        out[name] = {'id': row['Id'], 'startedAt': row['State']['StartedAt']}
    return out


def budget_summary() -> dict:
    path = LAB / 'shared-model/state/budgets.json'
    data = json.loads(path.read_text())
    return {'sha256': digest(path), 'bytes': path.stat().st_size, 'scopes': sorted(data) if isinstance(data, dict) else [], 'rawType': type(data).__name__}


def main() -> int:
    LOG.write_text('')
    acceptance = flow.Acceptance(LAB, HERE / '.unused.json')
    initial = {s: acceptance.lifecycle(s, 'status') for s in ('engineer-b', 'lazy-c', 'lazy-d')}
    if any(x['state'] != 'STOPPED' for x in initial.values()):
        raise RuntimeError('release refused because a private execution group is active')
    dispatches = json.loads((LAB / 'shared-model/state/dispatches.json').read_text())
    if dispatches:
        raise RuntimeError('release refused because a model dispatch is unresolved')
    before = {
        'protected': protected_hashes(), 'budget': budget_summary(), 'project': acceptance.manifest(LAB / 'project'),
        'v0': v0_runtime(), 'states': {k: v['state'] for k, v in initial.items()},
    }
    release_script = pathlib.Path(MANIFEST['releaseDirectory']) / 'opencode-cloud/scripts/lifecycle-helper.py'
    deployed = switch(RELEASE_COMPOSE, RELEASE_LIFECYCLE, release_script, 'release')

    acceptance = flow.Acceptance(LAB, HERE / '.unused.json')
    acceptance.lifecycle('engineer-b', 'enter', 't4-release-work-enter-' + uuid.uuid4().hex[:8])
    session, message = acceptance.submit('engineer-b', "Create /workspace/project/T4_RELEASE_ROLLBACK.txt containing exactly 'created after v2 artifact deployment; preserve across rollback' plus a newline. Run node --test /workspace/project/test/t4-label.test.mjs and report the actual result. Do not modify other files.")
    acceptance.wait({'engineer-b': (session, message)}, timeout=900)
    post_release_project = acceptance.manifest(LAB / 'project')
    post_release_budget = budget_summary()
    marker = LAB / 'project/T4_RELEASE_ROLLBACK.txt'
    if not marker.is_file():
        raise RuntimeError('post-release work marker missing')
    marker_hash = digest(marker)
    acceptance.lifecycle('engineer-b', 'stop', 't4-release-work-stop-' + uuid.uuid4().hex[:8])

    original_script = REPO / 'opencode-cloud/scripts/lifecycle-helper.py'
    rolled_back = switch(ORIGINAL_COMPOSE, ORIGINAL_LIFECYCLE, original_script, 'rollback')
    acceptance = flow.Acceptance(LAB, HERE / '.unused.json')
    acceptance.lifecycle('engineer-b', 'enter', 't4-rollback-verify-enter-' + uuid.uuid4().hex[:8])
    rolled_observation = acceptance.observe('engineer-b', session, message)
    rollback_project = acceptance.manifest(LAB / 'project')
    rollback_budget = budget_summary()
    acceptance.lifecycle('engineer-b', 'stop', 't4-rollback-verify-stop-' + uuid.uuid4().hex[:8])

    final_release = switch(RELEASE_COMPOSE, RELEASE_LIFECYCLE, release_script, 'final-release')
    after = {
        'protected': protected_hashes(), 'budget': budget_summary(), 'project': acceptance.manifest(LAB / 'project'),
        'v0': v0_runtime(),
    }
    assertions = {
        'immutableArtifactDigestVerified': digest(pathlib.Path(MANIFEST['artifact'])) == MANIFEST['artifactSha256'],
        'releaseUsedImmutableMounts': MANIFEST['releaseDirectory'] in deployed['mounts']['workbench-v2-checkpoint-platform-1'].get('/app', '') and MANIFEST['releaseDirectory'] in deployed['mounts']['workbench-v2-checkpoint-shared-model-gateway-1'].get('/app/shared-model-gateway.ts', ''),
        'rollbackUsedPreviousMounts': str(REPO) in rolled_back['mounts']['workbench-v2-checkpoint-platform-1'].get('/app', ''),
        'postReleaseWorkSurvivedRollback': marker.is_file() and digest(marker) == marker_hash and rollback_project == post_release_project and rolled_observation.get('completed') and not rolled_observation.get('errorName'),
        'latestBudgetSurvivedRollback': rollback_budget == post_release_budget,
        'protectedConfigCredentialsCertificatesUnchanged': before['protected'] == after['protected'],
        'v0ContainersUntouched': before['v0'] == after['v0'],
        'finalCandidateRedeployed': MANIFEST['releaseDirectory'] in final_release['mounts']['workbench-v2-checkpoint-platform-1'].get('/app', ''),
        'allPrivateGroupsStopped': all(x == 'STOPPED' for x in final_release['states'].values()),
    }
    report = {
        'schemaVersion': 1, 'capturedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'environment': 'authorized isolated workbench-v2-checkpoint; no production or retired remote deployment',
        'artifact': MANIFEST, 'before': before, 'deployed': deployed,
        'postReleaseWork': {'session': session, 'message': message, 'markerSha256': marker_hash, 'modelResult': acceptance.results.get(f'engineer-b:{message}') or {'completedBeforeRollback': True}, 'project': post_release_project, 'budget': post_release_budget},
        'rollback': rolled_back, 'rollbackObservation': rolled_observation, 'rollbackProject': rollback_project, 'rollbackBudget': rollback_budget,
        'finalRelease': final_release, 'after': after, 'assertions': assertions,
        'rollbackScope': 'Artifact mount and trusted lifecycle/compose routing only; data, sessions, counters, identity config, credentials and TLS were never restored from backup.',
        'status': 'PASS' if all(assertions.values()) else 'FAIL',
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'artifactSha256': MANIFEST['artifactSha256'], 'session': session, 'assertions': assertions}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
