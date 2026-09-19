#!/usr/bin/env python3
"""Reproduce the T4 ZIP and patch in new directories without touching the source index."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile

LAB = pathlib.Path('/home/vmware/Workspace/programs/WorkBench/acceptance/v2-checkpoint')
PROJECT = LAB / 'project'
ARTIFACTS = LAB / 't4-private-artifacts'
ROOT = LAB / 't4-reproduction'
EVIDENCE = pathlib.Path(__file__).with_name('t4-delivery-reproduction.json')
LOG = pathlib.Path(__file__).with_name('t4-delivery-reproduction.log')


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(cwd: pathlib.Path, *args: str) -> dict:
    proc = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=600)
    LOG.write_text(LOG.read_text() + f"$ {' '.join(args)}\n{proc.stdout}{proc.stderr}\n")
    if proc.returncode:
        raise RuntimeError(f"command failed ({proc.returncode}): {args[0]} {args[1] if len(args)>1 else ''}")
    return {"command": list(args), "exitCode": proc.returncode, "outputSha256": hashlib.sha256((proc.stdout + proc.stderr).encode()).hexdigest()}


def main() -> int:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    ROOT.mkdir(mode=0o700)
    LOG.write_text('')
    source_zip, patch = ARTIFACTS / 'source.zip', ARTIFACTS / 'changes.patch'
    index_before = digest(PROJECT / '.git/index')

    unzip_root = ROOT / 'zip'
    unzip_root.mkdir()
    with zipfile.ZipFile(source_zip) as archive:
        for info in archive.infolist():
            target = (unzip_root / info.filename).resolve()
            if not target.is_relative_to(unzip_root.resolve()):
                raise RuntimeError('ZIP path escapes reproduction directory')
        archive.extractall(unzip_root)
    source = unzip_root / 'source'
    zip_steps = [
        run(source / 'web', 'npm', 'ci'),
        run(source / 'web', 'npm', 'test'),
        run(source / 'web', 'npm', 'run', 'build'),
    ]

    patched = ROOT / 'patch'
    run(ROOT, 'git', 'clone', '--no-hardlinks', '--quiet', str(PROJECT), str(patched))
    baseline = subprocess.check_output(['git', '-C', str(PROJECT), 'rev-parse', 'HEAD'], text=True).strip()
    run(patched, 'git', 'checkout', '--quiet', baseline)
    patch_steps = [
        run(patched, 'git', 'apply', '--check', str(patch)),
        run(patched, 'git', 'apply', str(patch)),
        run(patched / 'web', 'npm', 'ci'),
        run(patched / 'web', 'npm', 'test'),
        run(patched / 'web', 'npm', 'run', 'build'),
    ]
    index_after = digest(PROJECT / '.git/index')
    report = {
        'schemaVersion': 1,
        'capturedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'environment': 'fresh directories under isolated workbench-v2-checkpoint',
        'baseline': baseline,
        'sourceZip': {'bytes': source_zip.stat().st_size, 'sha256': digest(source_zip)},
        'changesPatch': {'bytes': patch.stat().st_size, 'sha256': digest(patch)},
        'zipSteps': zip_steps,
        'patchSteps': patch_steps,
        'sourceIndexBefore': index_before,
        'sourceIndexAfter': index_after,
        'sourceIndexUnchanged': index_before == index_after,
        'status': 'PASS' if index_before == index_after else 'FAIL',
        'privateReproductionDirectory': str(ROOT),
    }
    EVIDENCE.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'zip': report['sourceZip'], 'patch': report['changesPatch']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
