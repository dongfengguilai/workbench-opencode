#!/usr/bin/env python3
"""Build fixed browser tools with a small context; never read runtime secrets."""
from pathlib import Path
import shutil, subprocess, tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='workbench-browser-build-') as name:
    context = Path(name)
    (context/'browser-tools').mkdir()
    for item in ['package.json', 'package-lock.json']:
        shutil.copyfile(root/'browser-tools'/item, context/'browser-tools'/item)
    shutil.copyfile(root/'Dockerfile.browser', context/'Dockerfile')
    subprocess.run(['docker', 'build', '--build-arg', 'http_proxy', '--build-arg', 'https_proxy', '--build-arg', 'no_proxy', '-t', 'opencode-cloud/native:1.18.31-browser-v1', str(context)], check=True)
