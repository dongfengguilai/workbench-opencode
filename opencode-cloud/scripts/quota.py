#!/usr/bin/env python3
"""Operator-only preparation of TWO new bounded filesystems, no host remounts."""
from pathlib import Path
import subprocess,os,argparse,shutil,json,time
root=Path(__file__).resolve().parents[1];os.chdir(root)
p=argparse.ArgumentParser();p.add_argument('--migrate-stopped',action='store_true');a=p.parse_args()
disks=root/'runtime/disks';disks.mkdir(exist_ok=True)
image='opencode-cloud/native:1.18.31-managed-v0'
for label in ['admin','native']:
 disk=disks/(label+'.img');dest=disks/label;dest.mkdir(exist_ok=True)
 if not disk.exists():
  subprocess.run(['fallocate','-l','1G',str(disk)],check=True);subprocess.run(['mkfs.ext4','-q','-F',str(disk)],check=True)
 mounted=subprocess.run(['mountpoint','-q',str(dest)]).returncode==0
 if not mounted:
  # Isolated maintenance helper only. These capabilities are never added to work containers.
  command='set -eu; dev=$(losetup -f); test -b "$dev" || mknod "$dev" b 7 "${dev#/dev/loop}"; losetup "$dev" /disks/'+label+'.img; mount -o rw,nosuid,nodev "$dev" /disks/'+label+'; mkdir -p /disks/'+label+'/project /disks/'+label+'/state; chown 1000:1000 /disks/'+label+'/project /disks/'+label+'/state'
  subprocess.run(['docker','run','--rm','--user','0:0','--network','none','--cap-drop','ALL','--cap-add','SYS_ADMIN','--cap-add','DAC_OVERRIDE','--cap-add','CHOWN','--cap-add','MKNOD','--device','/dev/loop-control','--device-cgroup-rule','b 7:* rwm','--security-opt','apparmor=unconfined','--mount',f'type=bind,src={disks},dst=/disks,bind-propagation=rshared','--entrypoint','sh',image,'-c',command],check=True)
 data=json.loads(subprocess.check_output(['findmnt','-J','-T',str(dest),'-o','TARGET,SOURCE,FSTYPE,OPTIONS'],text=True))['filesystems'][0]
 if Path(data['target'])!=dest or data['fstype']!='ext4' or 'rw' not in data['options'].split(','):raise SystemExit('Bounded writable mount missing; refusing to start on host filesystem')
 if a.migrate_stopped:
  service='admin-native' if label=='admin' else 'native'
  running=subprocess.run(['docker','inspect','-f','{{.State.Running}}','opencode-cloud-v0-'+service+'-1'],capture_output=True,text=True)
  needs_migration=any(not (root/'runtime'/('admin-'+s if label=='admin' else s)).is_symlink() for s in ['project','state'])
  if needs_migration and running.returncode==0 and running.stdout.strip()!='false':raise SystemExit('Stop native and guard before migration; take an idle cold backup first')
  if running.returncode!=0 and 'No such object' not in running.stderr:raise SystemExit('Cannot verify deployment is stopped')
  for suffix in ['project','state']:
   original=root/'runtime'/('admin-'+suffix if label=='admin' else suffix);target=dest/suffix
   if original.is_symlink():
    if original.resolve()!=target:raise SystemExit('Unexpected existing symlink')
    continue
   if any(target.iterdir()):raise SystemExit('Refusing to overwrite quota destination')
   shutil.copytree(original,target,dirs_exist_ok=True,symlinks=True)
   preserved=original.with_name(original.name+'.prequota-'+str(int(time.time())))
   original.rename(preserved);original.symlink_to(target.relative_to(original.parent),target_is_directory=True)
   print('Migrated stopped',original.name,'; original retained at',preserved.name)
 print('Verified bounded filesystem',label,data['source'])
