from pathlib import Path
import subprocess, json, sys, hashlib, shutil

root = Path(__file__).resolve().parents[1]
evidence = root / 'evidence'
task = (evidence / 'smoke-task.txt').read_text()
attempt = 1
while (evidence / f'smoke-attempt-{attempt}.jsonl').exists(): attempt += 1
compose = ['docker','compose']
def run(args, name, timeout=60):
    with (evidence / name).open('w') as f:
        result = subprocess.run(args, cwd=root, stdout=f, stderr=subprocess.STDOUT, timeout=timeout)
    return result.returncode

before = run(compose+['exec','-T','native','npm','test'],f'smoke-attempt-{attempt}-before.log')
if before == 0: raise SystemExit('Expected a failing clean baseline; refusing already repaired fixture')
code = run(compose+['exec','-T','native','opencode','run','--attach','http://localhost:4096','--dir','/workspace/project','--format','json','--model','approved/gpt-5.6-luna',task],f'smoke-attempt-{attempt}.jsonl',600)
events = []
for line in (evidence / f'smoke-attempt-{attempt}.jsonl').read_text().splitlines():
    try: events.append(json.loads(line))
    except ValueError: pass
sessions = sorted({e['sessionID'] for e in events if 'sessionID' in e})
tools = [e for e in events if e.get('type') == 'tool_use']
verification = root / 'runtime/independent-smoke'
if verification.exists(): raise SystemExit('Refusing to overwrite prior verification')
verification.mkdir()
shutil.copy(root / 'runtime/project/csv.mjs',verification / 'csv.mjs')
shutil.copy(evidence / 'smoke-verification.test.mjs',verification / 'csv.test.mjs')
independent = run(['node','--test',str(verification / 'csv.test.mjs')],f'smoke-attempt-{attempt}-independent.log')
diff = subprocess.check_output(['git','diff','--binary'],cwd=root / 'runtime/project')
(evidence / f'smoke-attempt-{attempt}.patch').write_bytes(diff)
summary = {'kind':'practice_smoke_not_A01','attempt':attempt,'native_exit':code,'session_ids':sessions,'tool_events':len(tools),'independent_test_exit':independent,'patch_sha256':hashlib.sha256(diff).hexdigest()}
(evidence / f'smoke-attempt-{attempt}-result.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
sys.exit(0 if code == 0 and independent == 0 and sessions and tools and diff else 1)
