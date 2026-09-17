#!/usr/bin/env python3
"""Extract cold backup to a NEW independent path only. No live volume writes."""
import argparse,tarfile,hashlib,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('destination');a=p.parse_args();archive=Path(a.archive).resolve();dest=Path(a.destination).resolve()
if dest.exists():raise SystemExit('Refusing restore: destination already exists')
expected=archive.with_suffix(archive.suffix+'.sha256').read_text().strip()
if hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=expected:raise SystemExit('Backup checksum mismatch')
os.umask(0o077);dest.mkdir(parents=True)
with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
print('Restored validated cold backup to new independent directory; no current data replaced')
