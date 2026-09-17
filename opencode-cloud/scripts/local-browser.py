#!/usr/bin/env python3
"""Manage only the owned host-loopback browser relay; never restart user environments."""
import json, os, signal, socket, subprocess, sys, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
entry=root/'src/local-browser.mjs'
record=root/'runtime/local-browser-process.json'
def owned():
    try:
        data=json.loads(record.read_text()); pid=data['pid']
        argv=Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
        stamp=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[19]
        return pid if str(entry).encode() in argv and stamp==data['starttime'] else None
    except (OSError,ValueError,KeyError): return None
def healthy():
    try:
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8444/__platform/login',timeout=2) as response:
            return response.status==200 and b'id="login"' in response.read(65536)
    except OSError:return False
action=sys.argv[1] if len(sys.argv)==2 else ''
if action not in ('start','stop','status'):sys.exit('Usage: local-browser.py start|stop|status')
if action=='stop':
    pid=owned()
    if pid:
        os.kill(pid,signal.SIGTERM)
        for _ in range(50):
            if not owned():break
            time.sleep(.1)
        if owned():os.kill(pid,signal.SIGKILL)
    record.unlink(missing_ok=True)
    print('Owned local browser entry stopped')
elif action=='status':
    ok=bool(owned()) and healthy()
    print('http://127.0.0.1:8444 '+('ready' if ok else 'not ready'))
    sys.exit(0 if ok else 1)
else:
    if owned():
        if not healthy():sys.exit('Owned relay running, but verified upstream is not ready; no restart or resend performed')
    else:
        with socket.socket() as probe:
            probe.settimeout(1)
            if probe.connect_ex(('127.0.0.1',8444))==0:
                sys.exit('Port 8444 is already occupied by an unowned listener; nothing was stopped or replaced')
        log=root/'runtime/local-browser.log'
        fd=os.open(log,os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600)
        with os.fdopen(fd,'ab') as out:
            child=subprocess.Popen(['node',str(entry)],cwd=root,stdin=subprocess.DEVNULL,stdout=out,stderr=out,start_new_session=True)
        stamp=Path(f'/proc/{child.pid}/stat').read_text().rsplit(')',1)[1].split()[19]
        fd=os.open(record,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as out:json.dump({'pid':child.pid,'starttime':stamp},out)
        for _ in range(30):
            if child.poll() is not None:
                record.unlink(missing_ok=True);sys.exit('Relay failed; see protected runtime/local-browser.log')
            if healthy():break
            time.sleep(.1)
        else:sys.exit('Relay started, but verified upstream is not ready; inspect runtime/local-browser.log')
    print('Local browser ready: http://127.0.0.1:8444')
