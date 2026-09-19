#!/usr/bin/env python3
"""Check release-record completeness and evidence hashes; does not verify truth."""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from check_package import CASE_MODES, check, read_json

SHA256 = re.compile(r'[a-f0-9]{64}')
DIGEST = re.compile(r'sha256:[a-f0-9]{64}')
COMMIT = re.compile(r'(?:[a-f0-9]{40}|[a-f0-9]{64})')


def verify_evidence(root: Path, refs, label: str, errors: list[str]) -> set[str]:
    modes: set[str] = set()
    if not isinstance(refs, list) or not refs:
        errors.append(f'{label}: missing evidence')
        return modes
    for item in refs:
        if not isinstance(item, dict):
            errors.append(f'{label}: evidence reference must be an object')
            continue
        name, digest = item.get('path'), item.get('sha256')
        if not isinstance(name, str) or not name:
            errors.append(f'{label}: missing evidence path')
            continue
        relative = Path(name)
        resolved = (root / relative).resolve()
        if (relative.is_absolute() or '..' in relative.parts or not relative.parts
                or relative.parts[0] != 'evidence'
                or not resolved.is_relative_to((root / 'evidence').resolve())):
            errors.append(f'{label}: evidence path escapes evidence/: {name}')
            continue
        if any((root.joinpath(*relative.parts[:i])).is_symlink() for i in range(1, len(relative.parts) + 1)):
            errors.append(f'{label}: symlinked evidence path: {name}')
            continue
        if resolved == (root / 'evidence/acceptance.json').resolve():
            errors.append(f'{label}: status record cannot serve as its own evidence')
            continue
        if not resolved.is_file() or resolved.stat().st_size == 0:
            errors.append(f'{label}: absent/empty evidence: {name}')
            continue
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            errors.append(f'{label}: missing/invalid SHA256: {name}')
            continue
        hasher = hashlib.sha256()
        with resolved.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                hasher.update(chunk)
        if hasher.hexdigest() != digest:
            errors.append(f'{label}: evidence digest mismatch: {name}')
            continue
        if isinstance(item.get('mode'), str):
            modes.add(item['mode'])
    return modes


def check_release(root: Path) -> list[str]:
    root = root.resolve()
    errors, _ = check(root)
    record = read_json(root / 'evidence/acceptance.json', errors)
    if not isinstance(record, dict):
        return errors or ['Invalid acceptance record']
    commit, artifact = record.get('implementationCommit'), record.get('artifactDigest')
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
        errors.append('actual implementationCommit missing')
    if not isinstance(artifact, str) or not DIGEST.fullmatch(artifact):
        errors.append('actual artifactDigest missing')
    for row in record.get('cases', []) if isinstance(record.get('cases'), list) else []:
        if not isinstance(row, dict):
            continue
        cid = row.get('id', '?')
        if row.get('status') != 'PASS':
            errors.append(f'{cid}: not passed ({row.get("status")})')
            continue
        if not row.get('environment') or not row.get('observedResult'):
            errors.append(f'{cid}: actual environment/result missing')
        modes = verify_evidence(root, row.get('evidence'), cid, errors)
        if not CASE_MODES.get(cid, set()).issubset(modes):
            errors.append(f'{cid}: required evidence modes missing')
    deployment = record.get('deployment', {})
    if not isinstance(deployment, dict):
        errors.append('deployment must be an object')
    else:
        if deployment.get('status') != 'PASS' or not deployment.get('authorizedTarget'):
            errors.append('authorized deployment not verified')
        if deployment.get('verifiedArtifactDigest') != artifact or artifact is None:
            errors.append('deployment artifact does not match verified artifact')
        verify_evidence(root, deployment.get('evidence'), 'deployment', errors)
    human = record.get('humanAcceptance', {})
    if not isinstance(human, dict):
        errors.append('humanAcceptance must be an object')
    else:
        if human.get('status') != 'ACCEPTED' or not human.get('acceptedBy') or not human.get('acceptedAt'):
            errors.append('real human acceptance not recorded')
        verify_evidence(root, human.get('evidence'), 'humanAcceptance', errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = check_release(args.root)
    if errors:
        print('NOT_RELEASE_READY')
        print('\n'.join('- ' + error for error in errors))
        return 2
    print('RELEASE_RECORD_COMPLETE; human review must still establish evidence authenticity.')
    print('No tests, deployments or user acceptance were performed by this checker.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
