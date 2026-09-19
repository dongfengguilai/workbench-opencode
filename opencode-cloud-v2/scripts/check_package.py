#!/usr/bin/env python3
"""Read-only structural checks for this specification package, NOT product tests."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

REQUIRED_FILES = (
    'README.md', 'CODEX_TASK.md', 'BASELINE.md', 'PLAN.md', 'TASKS.md',
    'LIFECYCLE.md', 'MODEL_GATEWAY.md', 'ACCEPTANCE.md', 'OPERATIONS.md',
    'STATUS.md', 'SOURCES.md', 'examples/resource-policy.example.json',
    'evidence/acceptance.json', 'evidence/RESOURCE_REPORT.md',
    'scripts/check_package.py', 'scripts/check_release.py',
    'tests/test_package_checks.py', 'validation/REPORT.md',
)
CASE_MODES = {
    'V2-A01': {'measurement'}, 'V2-A02': {'live_runtime'},
    'V2-A03': {'live_model'}, 'V2-A04': {'live_runtime'},
    'V2-A05': {'live_runtime'}, 'V2-A06': {'live_runtime'},
    'V2-A07': {'live_runtime'}, 'V2-A08': {'live_runtime'},
    'V2-A09': {'live_runtime'}, 'V2-A10': {'fixture', 'live_model'},
    'V2-A11': {'fixture', 'live_runtime'}, 'V2-A12': {'live_runtime'},
    'V2-A13': {'fixture', 'live_runtime'}, 'V2-A14': {'measurement'},
    'V2-A15': {'live_runtime'}, 'V2-A16': {'live_model'},
}
CASE_STATUSES = {'NOT_RUN', 'PASS', 'FAIL', 'BLOCKED_EXTERNAL'}
PRODUCT_STATUSES = {
    'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED_EXTERNAL', 'READY_FOR_DEPLOYMENT',
    'READY_FOR_USER_ACCEPTANCE', 'DELIVERED',
}
LINK = re.compile(r'(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)')


def read_json(path: Path, errors: list[str]):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeError, ValueError) as exc:
        errors.append(f'{path.name}: cannot read JSON: {exc}')
        return None


def check(root: Path) -> tuple[list[str], int]:
    root = root.resolve()
    errors: list[str] = []
    count = 0
    for name in REQUIRED_FILES:
        path = root / name
        if not path.is_file() or path.is_symlink():
            errors.append(f'missing or symlinked required file: {name}')

    for path in root.rglob('*.md'):
        try:
            text = path.read_text(encoding='utf-8')
        except (OSError, UnicodeError) as exc:
            errors.append(f'{path.name}: unreadable text: {exc}')
            continue
        text = re.sub(r'```.*?```', '', text, flags=re.S)
        for raw in LINK.findall(text):
            target = raw.strip().strip('<>')
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            count += 1
            resolved = (path.parent / unquote(parsed.path)).resolve()
            if not resolved.is_relative_to(root):
                errors.append(f'{path.name}: local link escapes package: {target}')
            elif not resolved.exists():
                errors.append(f'{path.name}: broken local link: {target}')

    record = read_json(root / 'evidence/acceptance.json', errors)
    if isinstance(record, dict):
        if record.get('productVersion') != 'v2' or record.get('schemaVersion') != 1:
            errors.append('wrong acceptance version')
        if record.get('status') not in PRODUCT_STATUSES:
            errors.append('invalid product status')
        if record.get('baselines') != {
            'v0': 'USER_CONFIRMED_ACCEPTED', 'v1': 'USER_CONFIRMED_ACCEPTED',
        }:
            errors.append('v0/v1 user-confirmed baselines must be preserved')
        cases = record.get('cases', [])
        if not isinstance(cases, list):
            errors.append('cases must be a list')
            cases = []
        ids = [row.get('id') for row in cases if isinstance(row, dict)]
        if len(ids) != len(CASE_MODES) or set(ids) != set(CASE_MODES):
            errors.append('case set must contain V2-A01..V2-A16 exactly once')
        for row in cases:
            if not isinstance(row, dict):
                errors.append('invalid case record')
                continue
            cid = row.get('id')
            if row.get('status') not in CASE_STATUSES:
                errors.append(f'{cid}: invalid case status')
            modes = row.get('requiredEvidenceModes')
            if not isinstance(modes, list) or set(modes) != CASE_MODES.get(cid, set()):
                errors.append(f'{cid}: required modes changed')
            if not isinstance(row.get('evidence'), list):
                errors.append(f'{cid}: evidence must be a list')
    elif record is not None:
        errors.append('acceptance record must be an object')

    for name in ('TASKS.md', 'ACCEPTANCE.md'):
        path = root / name
        if path.is_file():
            text = path.read_text(encoding='utf-8')
            ids = set(re.findall(r'V2-A\d{2}', text))
            if ids != set(CASE_MODES):
                errors.append(f'{name}: incomplete/unknown case references: {sorted(ids)}')
    tasks = root / 'TASKS.md'
    if tasks.is_file():
        points = re.findall(r'^## (T\d)\b', tasks.read_text(encoding='utf-8'), re.M)
        if points != ['T0', 'T1', 'T2', 'T3', 'T4']:
            errors.append('TASKS must preserve the ordered T0..T4 checkpoints')

    policy = read_json(root / 'examples/resource-policy.example.json', errors)
    if isinstance(policy, dict):
        if policy.get('testOnly') is not True or policy.get('purpose') != 'test-example-not-runtime-config':
            errors.append('policy example must remain explicitly test-only')
        env, model, storage = (policy.get(k, {}) for k in ('environments', 'model', 'storage'))
        if not all(isinstance(x, dict) for x in (env, model, storage)):
            errors.append('invalid policy sections')
            return errors, count
        for section, names in (
            (env, ('maxRunning', 'maxQueued', 'maxQueueWaitSeconds', 'idleSeconds',
                   'startObserveTimeoutSeconds', 'stopObserveTimeoutSeconds')),
            (model, ('globalPerBackend', 'perIdentity', 'maxQueuedPerBackend', 'maxQueueWaitSeconds')),
            (storage, ('minFreeBytesBeforeStart',)),
        ):
            for key in names:
                if type(section.get(key)) is not int or section[key] <= 0:
                    errors.append(f'policy {key} must be a positive integer')
        for section, names in (
            (env, ('autoForceKill', 'restartExecutionGroupsAutomatically', 'wakeOnRead')),
            (model, ('replayDispatchedRequests',)),
            (storage, ('migrateExistingData', 'truncateQuotaImages', 'cleanupUserSource')),
        ):
            for key in names:
                if section.get(key) is not False:
                    errors.append(f'unsafe example setting: {key}')
    elif policy is not None:
        errors.append('policy must be an object')
    return errors, count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors, links = check(args.root)
    if errors:
        print('\n'.join('FAIL: ' + item for item in errors))
        return 2
    print(f'PACKAGE_STRUCTURE_OK: {len(REQUIRED_FILES)} required files; {links} local links; 16 cases; T0..T4.')
    print('This is NOT a WorkBench runtime, model or user acceptance result.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
