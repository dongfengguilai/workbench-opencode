#!/usr/bin/env python3
"""Inspect or explicitly reconcile shared gateway dispatches while its service is stopped."""
import argparse,json,os,pathlib,tempfile

def write_atomic(path,value):
 fd,name=tempfile.mkstemp(dir=path.parent,prefix='.dispatches-',text=True);os.fchmod(fd,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,separators=(',',':'));f.flush();os.fsync(f.fileno())
 os.replace(name,path)

def main():
 p=argparse.ArgumentParser();p.add_argument('--state-dir',required=True);p.add_argument('--confirm-ended');p.add_argument('--gateway-stopped',action='store_true');a=p.parse_args()
 root=pathlib.Path(a.state_dir).resolve();file=root/'dispatches.json'
 if not root.is_dir() or file.is_symlink():raise SystemExit('Invalid protected gateway state directory')
 rows=json.loads(file.read_text() if file.exists() else '[]')
 if not isinstance(rows,list):raise SystemExit('Invalid dispatch journal')
 if not a.confirm_ended:
  print(json.dumps({'unresolved':[{'id':x.get('id'),'scope':x.get('scope'),'backend':x.get('backend'),'model':x.get('model'),'dispatchedAt':x.get('dispatchedAt')} for x in rows]},indent=2));return
 if not a.gateway_stopped:raise SystemExit('Refusing mutation: stop the shared gateway and pass --gateway-stopped')
 matches=[x for x in rows if x.get('id')==a.confirm_ended]
 if len(matches)!=1:raise SystemExit('Exact unresolved dispatch id required')
 write_atomic(file,[x for x in rows if x.get('id')!=a.confirm_ended])
 print(json.dumps({'confirmedEnded':a.confirm_ended,'remaining':len(rows)-1}))
if __name__=='__main__':main()
