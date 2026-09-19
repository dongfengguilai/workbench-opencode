#!/usr/bin/env python3
"""Offline development-kit/record checks. Never runs WorkBench or attests truth."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys

TRACK = 'v3-engineering-quality'
CHECK_IDS = [f'V3E-A{i:02d}' for i in range(1, 15)]
REQUIRED = [
    'README.md', 'BASELINE.md', 'PLAN.md', 'TASKS.md', 'CODEX_TASK.md',
    'STATUS.md', 'IMPLEMENTATION.md', 'EVALUATION.md', 'OPERATIONS.md',
    'ACCEPTANCE.md', 'SOURCES.md', 'templates/PROJECT_CONTEXT.md',
    'templates/ENGINEERING_GUIDANCE.md', 'templates/CASE_RECORD.json',
    'evidence/acceptance.json', 'evidence/comparison.json',
    'scripts/check_kit.py', 'tests/test_kit_guard.py', 'validation/REPORT.md',
]
SHA256 = re.compile(r'^[0-9a-f]{64}$', re.I)
PRODUCT_STATES = {'NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_USER_ACCEPTANCE',
                  'DELIVERED', 'BLOCKED_EXTERNAL', 'FAILED', 'NO_CHANGE_RECOMMENDED'}
CHECK_STATES = {'NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'}


def read_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError(f'{path.name}: top-level object required')
    return data


def evidence_path(root: Path, ref: object) -> Path:
    """Accept only nonempty regular files below an explicitly supplied root."""
    if not isinstance(ref, str) or not ref.strip() or '\\' in ref or '\x00' in ref:
        raise ValueError('invalid evidence reference')
    pure = PurePosixPath(ref)
    if pure.is_absolute() or '..' in pure.parts or '://' in ref:
        raise ValueError('evidence reference must be a bounded relative path')
    root = root.resolve()
    current = root
    for part in pure.parts:
        current /= part
        if current.is_symlink():
            raise ValueError('evidence symlinks are not permitted')
    try:
        current.resolve().relative_to(root)
    except ValueError as exc:
        raise ValueError('evidence outside authorized root') from exc
    if not current.is_file() or current.stat().st_size == 0:
        raise ValueError('evidence file missing or empty')
    return current


def validate_records(acceptance: dict, comparison: dict) -> list[str]:
    errors: list[str] = []
    if acceptance.get('version') != 'v3' or acceptance.get('track') != TRACK:
        errors.append('acceptance: wrong version/active track')
    if comparison.get('track') != TRACK:
        errors.append('comparison: wrong active track')
    if acceptance.get('baseline') != 'USER_CONFIRMED_ACCEPTED_V0_V1_V2':
        errors.append('accepted v0/v1/v2 baseline must be inherited')
    if acceptance.get('shelvedTrack') != 'shared-business-assistant':
        errors.append('Shared proposal must remain shelved')
    if acceptance.get('productStatus') not in PRODUCT_STATES:
        errors.append('invalid product status')
    checks = acceptance.get('checks')
    if not isinstance(checks, list) or not all(isinstance(x, dict) for x in checks):
        errors.append('checks must be an array of objects')
    else:
        if sorted(x.get('id', '') for x in checks) != CHECK_IDS:
            errors.append('all fourteen unique acceptance IDs required')
        for check in checks:
            if check.get('status') not in CHECK_STATES:
                errors.append(f"{check.get('id')}: invalid check status")
            if not isinstance(check.get('evidenceRefs'), list):
                errors.append(f"{check.get('id')}: evidenceRefs must be an array")
    if not isinstance(acceptance.get('humanAcceptance'), dict):
        errors.append('humanAcceptance must be an object')
    return errors


def validate_release(acceptance: dict, comparison: dict, root: Path) -> list[str]:
    """Check required evidence plumbing, not business validity or authenticity."""
    errors = validate_records(acceptance, comparison)

    def ref(value: object, label: str) -> Path | None:
        try:
            return evidence_path(root, value)
        except (ValueError, OSError) as exc:
            errors.append(f'{label}: {exc}')
            return None

    if acceptance.get('productStatus') in {'NOT_STARTED', 'BLOCKED_EXTERNAL', 'FAILED', 'NO_CHANGE_RECOMMENDED'}:
        errors.append('product is not a release candidate')
    if not isinstance(acceptance.get('actualHead'), str) or not re.fullmatch(r'[a-f0-9]{40}|[a-f0-9]{64}', acceptance['actualHead'], re.I):
        errors.append('actual implementation commit required')
    artifact = acceptance.get('candidateArtifactSha256', '')
    if not isinstance(artifact, str) or not SHA256.fullmatch(artifact):
        errors.append('candidate artifact SHA256 required')
    for check in acceptance.get('checks', []):
        if not isinstance(check, dict):
            continue
        if check.get('status') != 'PASS':
            errors.append(f"{check.get('id')}: not PASS")
        refs = check.get('evidenceRefs', [])
        if not isinstance(refs, list) or not refs:
            errors.append(f"{check.get('id')}: evidence required")
        else:
            for item in refs:
                ref(item, str(check.get('id')))

    human = acceptance.get('humanAcceptance', {})
    if not isinstance(human, dict):
        human = {}
    if human.get('status') != 'ACCEPTED':
        errors.append('human acceptance is not recorded')
    for key in ('quote', 'timestamp', 'scope'):
        if not isinstance(human.get(key), str) or not human[key].strip():
            errors.append(f'human acceptance {key} required')
    if human.get('artifactSha256') != artifact:
        errors.append('human acceptance must refer to the candidate artifact')
    ref(human.get('evidenceRef'), 'human acceptance')

    if comparison.get('status') != 'COMPLETE':
        errors.append('comparison is not complete')
    protocol = comparison.get('protocol', {})
    if not isinstance(protocol, dict):
        protocol = {}
    if protocol.get('frozenBeforeCandidateRuns') is not True:
        errors.append('protocol was not declared frozen before candidate runs')
    for key in ('frozenAt', 'primaryMetric', 'benefitRule', 'costGuardrails'):
        if not isinstance(protocol.get(key), str) or not protocol[key].strip():
            errors.append(f'protocol {key} required')
    protocol_file = ref(protocol.get('evidenceRef'), 'frozen protocol')
    if protocol_file and hashlib.sha256(protocol_file.read_bytes()).hexdigest() != protocol.get('sha256'):
        errors.append('frozen protocol SHA256 mismatch')
    comparable = comparison.get('comparability', {})
    if not isinstance(comparable, dict):
        comparable = {}
    for key in ('sameInputsAndModel', 'allAttemptsRetained', 'holdoutUseDisclosed'):
        if comparable.get(key) is not True:
            errors.append(f'comparison {key} not confirmed')
    ref(comparable.get('evidenceRef'), 'comparability review')
    product_target = acceptance.get('productTargetAcceptance', {})
    target_decision = comparison.get('productTargetDecision', {})
    target_scope = (isinstance(product_target, dict)
                    and product_target.get('status') == 'PASS'
                    and isinstance(target_decision, dict)
                    and target_decision.get('status') in {'READY_FOR_USER_ACCEPTANCE', 'DELIVERED'})
    if target_scope:
        protocol_path = ref(product_target.get('protocolRef'), 'product-target protocol')
        amendment_path = ref(product_target.get('protocolAmendmentRef'), 'product-target protocol amendment')
        result_path = ref(product_target.get('resultRef'), 'product-target result')
        if result_path:
            try:
                result = read_json(result_path)
            except (ValueError, OSError) as exc:
                errors.append(f'product-target result invalid: {exc}')
                result = {}
            if result.get('status') != 'PASS':
                errors.append('product-target technical acceptance is not PASS')
            if result.get('candidateArtifactSha256') != artifact:
                errors.append('product-target result must refer to the candidate artifact')
            recorded = result.get('protocol', {})
            if not isinstance(recorded, dict):
                recorded = {}
            if protocol_path and hashlib.sha256(protocol_path.read_bytes()).hexdigest() != recorded.get('sha256'):
                errors.append('product-target protocol SHA256 mismatch')
            if amendment_path and hashlib.sha256(amendment_path.read_bytes()).hexdigest() != recorded.get('amendmentSha256'):
                errors.append('product-target amendment SHA256 mismatch')
            routing = result.get('routing', {})
            if not isinstance(routing, dict) or routing.get('manualModelSelection') is not False or routing.get('submittedModel') != 'gpt-5.6-luna':
                errors.append('product-target default Luna routing not confirmed')
            cases = result.get('cases', [])
            if not isinstance(cases, list) or len(cases) < 2:
                errors.append('product-target representative cases missing')
            else:
                for case in cases:
                    gateway = case.get('gateway', {}) if isinstance(case, dict) else {}
                    if (not isinstance(case, dict) or case.get('outcome') != 'SATISFIED'
                            or case.get('executionOrigin') != 'workbench_native_opencode'
                            or case.get('humanSolutionHints') != 0 or case.get('humanSourceEdits') != 0
                            or not isinstance(gateway, dict) or gateway.get('withinCap') is not True
                            or not isinstance(gateway.get('dispatched'), int)
                            or not isinstance(gateway.get('completed'), int)
                            or gateway['dispatched'] != gateway['completed']
                            or gateway['dispatched'] > gateway.get('cap', -1)):
                        errors.append(f"product-target case {case.get('caseId') if isinstance(case, dict) else '?'} is not independently within limits")
            runtime = result.get('runtimeAfterAcceptance', {})
            if (not isinstance(runtime, dict) or runtime.get('candidateStoppedGracefully') is not True
                    or runtime.get('unresolvedModelDispatches') != 0):
                errors.append('product-target safe runtime handoff not confirmed')
    else:
        summary = comparison.get('summary', {})
        if not isinstance(summary, dict):
            summary = {}
        if summary.get('conclusion') != 'BENEFIT_DEMONSTRATED':
            errors.append('benefit has not been demonstrated')
        for key in ('primaryMetricImproved', 'noMaterialRegression', 'withinCostGuardrails'):
            if summary.get(key) is not True:
                errors.append(f'benefit {key} not confirmed')
        ref(summary.get('summaryRef'), 'benefit report')

    selection = comparison.get('selection', {})
    if not isinstance(selection, dict):
        selection = {}
    refs = comparison.get('caseRecords', [])
    if not isinstance(refs, list):
        refs = []
        errors.append('caseRecords must be an array')
    if selection.get('actualCaseCount') != len(refs) or len(refs) == 0:
        errors.append('actual case count must match nonempty case records')
    if not 5 <= len(refs) <= 8:
        if selection.get('scopeChangeRef'):
            ref(selection['scopeChangeRef'], 'approved case-scope change')
        else:
            errors.append('5–8 cases required unless a scope change is recorded')
    ref(selection.get('selectionRef'), 'case selection')
    seen: set[str] = set()
    holdouts = 0
    repeated_pair = False
    for item in refs:
        case_path = ref(item, 'case record')
        if not case_path:
            continue
        try:
            case = read_json(case_path)
        except (ValueError, OSError) as exc:
            errors.append(f'case record invalid: {exc}')
            continue
        cid = case.get('caseId')
        if not isinstance(cid, str) or not cid.strip() or cid in seen:
            errors.append('case IDs must be nonempty and unique')
        else:
            seen.add(cid)
        if case.get('kind') != 'real':
            errors.append(f'{cid}: synthetic examples do not count as real tasks')
        details = case.get('selection', {})
        if not isinstance(details, dict):
            details = {}
        for key in ('originRef', 'authorizedProject', 'expectedBehavior', 'userPrompt'):
            if not isinstance(details.get(key), str) or not details[key].strip():
                errors.append(f'{cid}: real task {key} required')
        if case.get('split') == 'holdout':
            holdouts += 1
            if details.get('holdoutNotUsedForTuning') is not True:
                errors.append(f'{cid}: holdout use must be disclosed honestly')
        ref(details.get('acceptanceRef'), f'{cid}: independent behavior criteria')
        runs = case.get('runs', [])
        if not isinstance(runs, list):
            runs = []
        arms = {arm: [r for r in runs if isinstance(r, dict) and r.get('arm') == arm]
                for arm in ('baseline', 'candidate')}
        if not all(arms.values()):
            errors.append(f'{cid}: both baseline and candidate runs required')
        repeated_pair |= all(len(values) >= 2 for values in arms.values())
        for run in runs:
            if not isinstance(run, dict):
                errors.append(f'{cid}: invalid run')
                continue
            if run.get('executionOrigin') != 'workbench_native_opencode' or not run.get('nativeSessionId'):
                errors.append(f'{cid}: WorkBench native execution identity required')
            if run.get('outcome') not in {'SATISFIED', 'UNSATISFIED', 'BLOCKED', 'UNKNOWN'}:
                errors.append(f'{cid}: actual run outcome required')
            evidence = run.get('evidenceRefs')
            if not isinstance(evidence, list) or not evidence:
                errors.append(f'{cid}: actual run evidence required')
            else:
                for value in evidence:
                    ref(value, f'{cid}: run')
            if run.get('independentCompletion') is True:
                if run.get('outcome') != 'SATISFIED' or any(run.get(k) != 0 for k in ('solutionHints', 'humanSourceEdits', 'environmentRescues')):
                    errors.append(f'{cid}: independent completion conflicts with outcome/assistance')
    if holdouts < 1:
        errors.append('at least one disclosed holdout case is required')
    if not repeated_pair:
        errors.append('repeat the primary case in both arms at least once')
    return errors


def check_structure(root: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    count = 0
    for name in REQUIRED:
        if not (root / name).is_file():
            errors.append(f'missing required file: {name}')
    for path in root.rglob('*.json'):
        try:
            read_json(path)
        except (ValueError, OSError) as exc:
            errors.append(str(exc))
    for path in root.rglob('*.md'):
        text = path.read_text(encoding='utf-8')
        if len(re.findall(r'^```', text, re.M)) % 2:
            errors.append(f'{path.name}: unmatched fenced code block')
        for target in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', text):
            if target.startswith(('https://', 'http://', 'mailto:', '#')):
                continue
            dest = target.split('#', 1)[0]
            if not dest:
                continue
            count += 1
            candidate = (path.parent / dest).resolve()
            try:
                candidate.relative_to(root.resolve())
            except ValueError:
                errors.append(f'{path.name}: unbounded local link: {dest}')
                continue
            if not candidate.is_file():
                errors.append(f'{path.name}: broken local link: {dest}')
    try:
        errors += validate_records(read_json(root / 'evidence/acceptance.json'),
                                   read_json(root / 'evidence/comparison.json'))
    except (ValueError, OSError) as exc:
        errors.append(str(exc))
    return errors, count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--evidence-root', type=Path, help='Explicit authorized root for evidence refs; defaults to kit root')
    args = parser.parse_args()
    root = args.root.resolve()
    errors, links = check_structure(root)
    if errors:
        for issue in errors:
            print('ERROR:', issue)
        return 1
    print(f'KIT_STRUCTURE_OK: {links} local links checked. Product implementation is not evaluated.')
    if args.release:
        try:
            errors = validate_release(read_json(root / 'evidence/acceptance.json'),
                                      read_json(root / 'evidence/comparison.json'),
                                      args.evidence_root or root)
        except (ValueError, OSError, TypeError) as exc:
            print('RELEASE_RECORD_ERROR:', exc)
            return 2
        if errors:
            print('RELEASE_BLOCKED: record checks failed; no deployment was attempted.')
            for issue in errors:
                print('-', issue)
            return 2
        print('RELEASE_RECORDS_COMPLETE: human review of evidence truth/quality is still required. This is not deployment authorization.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
