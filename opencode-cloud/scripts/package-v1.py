#!/usr/bin/env python3
"""Offline artifacts + source bundle. Live runtime and user data never enter it."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import tarfile
import tempfile
import datetime

ROOT=Path(__file__).resolve().parents[1]


def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--reuse-image-bundle')
    parser.add_argument('--reuse-sha256')
    args=parser.parse_args();out=Path(args.output).resolve()
    if out.exists():raise SystemExit('Refusing to overwrite an existing release')
    out.parent.mkdir(parents=True,exist_ok=True)
    buildPath=ROOT/'evidence/dual-identity-ui-build.json'
    if not buildPath.exists():buildPath=ROOT/'evidence/v1-intranet-ui-build.json'
    build=json.loads(buildPath.read_text())
    for name,expected in build['overlaySha256'].items():
        if sha(ROOT/'ui'/name)!=expected:raise SystemExit('UI build is stale: '+name)
    with tempfile.TemporaryDirectory(prefix='workbench-v1-bundle-',dir=out.parent) as temp:
        package=Path(temp)/'WorkBench-v1';package.mkdir()
        def copy(source,relative):
            source=Path(source);dest=package/relative
            if source.is_symlink() or not source.is_file():raise RuntimeError('Only regular artifact files allowed')
            dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
        for name in ['src','scripts','ui','test','docs','browser-tools']:
            for source in sorted((ROOT/name).rglob('*')):
                if source.is_file() and '__pycache__' not in source.parts:copy(source,source.relative_to(ROOT))
        for name in ['Dockerfile','Dockerfile.browser','package.json','compose.yaml','compose.v1.json','compose.v1-admin.json','deploy.sh','.gitignore']:
            if (ROOT/name).is_file():copy(ROOT/name,name)
        for source in (ROOT/'public').iterdir():
            if source.is_file():copy(source,source.relative_to(ROOT))
        for name,expected in build['files'].items():
            source=ROOT/'public/workbench-ui'/name.lstrip('/')
            if sha(source)!=expected:raise RuntimeError('Built UI file checksum mismatch')
            copy(source,'public/workbench-ui/'+name.lstrip('/'))
        copy(ROOT/'public/workbench-ui/manifest.json','public/workbench-ui/manifest.json')
        for name in ['opencode-v1.18.31.tar.gz','bun-1.3.14/bun.zip','build-ca.crt']:
            if (ROOT/'vendor'/name).is_file():copy(ROOT/'vendor'/name,'vendor/'+name)
        for name in ['source-provenance.json',buildPath.name]:
            copy(ROOT/'evidence'/name,'provenance/'+name)
        for source in (ROOT.parent/'opencode-cloud-v0').glob('*.md'):
            copy(source,'delivery/'+source.name)
        cached={}
        if args.reuse_image_bundle:
            previous=Path(args.reuse_image_bundle)
            if not args.reuse_sha256 or sha(previous)!=args.reuse_sha256:raise RuntimeError('Previous bundle digest mismatch')
            with tarfile.open(previous,mode='r|gz') as archive:
                for member in archive:
                    if member.name=='WorkBench-v1/bundle-manifest.json':
                        cached={image['archive']:image for image in json.load(archive.extractfile(member))['images']}
                    if member.name.startswith('WorkBench-v1/images/') and member.isfile():
                        relative=member.name.removeprefix('WorkBench-v1/')
                        if relative not in cached or relative not in ['images/native.tar','images/managed.tar','images/node.tar']:raise RuntimeError('Unexpected cached image')
                        destination=package/relative;destination.parent.mkdir(exist_ok=True)
                        with destination.open('wb') as stream:shutil.copyfileobj(archive.extractfile(member),stream)
                        if sha(destination)!=cached[relative]['sha256']:raise RuntimeError('Cached image checksum mismatch')
        images=[]
        for role,tag in [('native','opencode-cloud/native:1.18.31-browser-v1'),('managed','opencode-cloud/native:1.18.31-managed-v0'),('node','node:22.19.0-bookworm-slim')]:
            image=json.loads(subprocess.check_output(['docker','image','inspect',tag],text=True))[0]
            archive='images/'+role+'.tar';(package/'images').mkdir(exist_ok=True)
            if archive in cached and cached[archive]['id']==image['Id'] and (package/archive).is_file():pass
            else:subprocess.run(['docker','save','-o',str(package/archive),tag],check=True)
            images.append({'role':role,'tag':tag,'id':image['Id'],'archive':archive,'sha256':sha(package/archive)})
        manifest={'schema':1,'opencode':'1.18.31','playwrightCLI':'0.1.20','bun':'1.3.14','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceIncludesWorkingChanges':bool(subprocess.check_output(['git','status','--porcelain','--','.'],cwd=ROOT,text=True).strip()),'images':images,'liveDataIncluded':False,'netidPasswordIncluded':False}
        (package/'bundle-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        # Scan plaintext artifacts against actual protected values, not regex-only guesses.
        values=[]
        for env in (ROOT/'runtime').glob('*.env'):
            for line in env.read_text().splitlines():
                if '=' in line:
                    key,value=line.split('=',1)
                    if value and any(s in key for s in ['PASSWORD','KEY','TOKEN']):values.append(value.encode())
        platform=ROOT/'runtime/platform.json'
        if platform.is_file():
            for user in json.loads(platform.read_text())['users'].values():
                values.extend(user[key].encode() for key in ['password','nativePassword'] if user.get(key))
        for source in package.rglob('*'):
            if source.is_file() and source.relative_to(package).parts[0] not in ['images','vendor']:
                if any(value in source.read_bytes() for value in values):raise RuntimeError('Protected secret in publishable artifact: '+str(source.relative_to(package)))
        checks=[sha(source)+'  '+source.relative_to(package).as_posix() for source in sorted(package.rglob('*')) if source.is_file()]
        (package/'checksums.sha256').write_text('\n'.join(checks)+'\n')
        with tarfile.open(out,'w:gz',compresslevel=3) as archive:archive.add(package,arcname='WorkBench-v1')
    out.with_suffix(out.suffix+'.sha256').write_text(sha(out)+'  '+out.name+'\n')
    report={'bundle':str(out),'bytes':out.stat().st_size,'sha256':sha(out),'manifest':manifest}
    (ROOT/'evidence/dual-identity-bundle-result.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
