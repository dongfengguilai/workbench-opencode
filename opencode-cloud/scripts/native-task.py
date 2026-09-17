"""Run the recorded real product task via unmodified native OpenCode."""
from pathlib import Path
import subprocess, json, hashlib, sys

root=Path(__file__).resolve().parents[1]
evidence=root/'evidence'
task=(evidence/'a01-task.txt').read_text()
attempt=1
while (evidence/f'a01-attempt-{attempt}.jsonl').exists(): attempt+=1
def run(args,name,timeout=60):
    with (evidence/name).open('w') as f:
        try: result=subprocess.run(args,cwd=root,stdout=f,stderr=subprocess.STDOUT,timeout=timeout)
        except subprocess.TimeoutExpired:
            f.write('\nMAINTAINER: client timeout; native task outcome requires state inspection, NOT automatically retried.\n')
            return 124
    return result.returncode
compose=['docker','compose','exec','-T','native']
before=run(compose+['node','--experimental-strip-types','--test','opencode-cloud/test/patch-export.test.mjs'],f'a01-attempt-{attempt}-before.log')
if before==0: raise SystemExit('Clean baseline unexpectedly passes; refusing a pre-repaired task')
code=run(compose+['opencode','run','--attach','http://localhost:4096','--dir','/workspace/project','--format','json','--model','approved/gpt-5.6-luna',task],f'a01-attempt-{attempt}.jsonl',600)
events=[]
for line in (evidence/f'a01-attempt-{attempt}.jsonl').read_text().splitlines():
    try: events.append(json.loads(line))
    except ValueError: pass
sessions=sorted({e['sessionID'] for e in events if 'sessionID' in e})
tools=[e for e in events if e.get('type')=='tool_use']
project=root/'runtime/project'
test=Path('opencode-cloud/test/patch-export.test.mjs')
unchanged=(project/test).read_bytes()==(root/'test/patch-export.test.mjs').read_bytes()
diff=subprocess.check_output(['git','diff','--binary'],cwd=project)
source=project/'opencode-cloud/src/patch-export.ts'
if source.exists():
    # Capture the new source without altering the user's Git index.
    addition=subprocess.run(['git','diff','--no-index','--binary','--','/dev/null','opencode-cloud/src/patch-export.ts'],cwd=project,capture_output=True)
    diff+=addition.stdout
(evidence/f'a01-attempt-{attempt}.patch').write_bytes(diff)
summary={'kind':'real_product_feature','attempt':attempt,'native_exit':code,'session_ids':sessions,'tool_events':len(tools),'tests_unchanged':unchanged,'implementation_exists':source.exists(),'patch_sha256':hashlib.sha256(diff).hexdigest()}
(evidence/f'a01-attempt-{attempt}-result.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
sys.exit(0 if code==0 and sessions and tools and unchanged and source.exists() else 1)
