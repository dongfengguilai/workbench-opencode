#!/usr/bin/env python3
"""Initialize one pre-registered persistent space exactly once from a fixed source ZIP."""
import argparse,hashlib,json,os,pathlib,shutil,stat,subprocess,tempfile,zipfile
def main():
 p=argparse.ArgumentParser();p.add_argument('--config',required=True);a=p.parse_args();cfg=json.loads(pathlib.Path(a.config).read_text());root=pathlib.Path(cfg['root']).resolve();marker=root/'.workbench-space.json'
 if marker.exists():
  current=json.loads(marker.read_text())
  if current.get('sourceSha256')!=cfg['sourceSha256'] or not (root/'project/.git').is_dir():raise RuntimeError('Existing space marker mismatch')
  return
 for name in ['project','state','gateway-state']:
  if (root/name).exists():raise RuntimeError('Unmarked space data exists; refusing overwrite')
 source=pathlib.Path(cfg['sourceZip']);actual=hashlib.sha256(source.read_bytes()).hexdigest()
 if actual!=cfg['sourceSha256']:raise RuntimeError('Source artifact digest mismatch')
 created=[]
 try:
  for name in ['project','state','gateway-state']:(root/name).mkdir(parents=True);created.append(root/name)
  with zipfile.ZipFile(source) as archive:
   for info in archive.infolist():
    parts=pathlib.PurePosixPath(info.filename).parts
    if not parts or parts[0]!='source' or any(x in ['', '.', '..'] for x in parts) or stat.S_ISLNK(info.external_attr>>16):continue
    relative=pathlib.Path(*parts[1:])
    if not relative.parts:continue
    target=root/'project'/relative
    if info.is_dir():target.mkdir(parents=True,exist_ok=True)
    else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(info))
  subprocess.run(['git','init','-q'],cwd=root/'project',check=True);subprocess.run(['git','add','-A'],cwd=root/'project',check=True);env={**os.environ,'GIT_AUTHOR_NAME':'WorkBench','GIT_AUTHOR_EMAIL':'workbench@localhost','GIT_COMMITTER_NAME':'WorkBench','GIT_COMMITTER_EMAIL':'workbench@localhost'};subprocess.run(['git','commit','-qm','Authorized project baseline'],cwd=root/'project',env=env,check=True);baseline=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root/'project',text=True).strip()
  native_env=pathlib.Path(cfg['nativeEnv']).resolve()
  if native_env.parent!=root or not native_env.is_file():raise RuntimeError('Native environment template is outside the registered space')
  lines=native_env.read_text().splitlines();lines=[('PROJECT_BASELINE='+baseline) if line.startswith('PROJECT_BASELINE=') else line for line in lines]
  native_env.write_text('\n'.join(lines)+'\n');os.chmod(native_env,0o600)
  fd,tmp=tempfile.mkstemp(dir=root,prefix='.space-',text=True);os.fchmod(fd,0o600)
  with os.fdopen(fd,'w') as f:json.dump({'schemaVersion':1,'sourceSha256':actual,'baseline':baseline},f);f.flush();os.fsync(f.fileno())
  os.replace(tmp,marker)
 except Exception:
  for path in reversed(created):shutil.rmtree(path,ignore_errors=True)
  raise
if __name__=='__main__':main()
