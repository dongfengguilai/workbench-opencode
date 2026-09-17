"""Explicit practice fixture. Never claims to satisfy real-project A01."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
project = root / 'runtime/project'
project.mkdir(parents=True, exist_ok=True)
if any(project.iterdir()):
    raise SystemExit('Refusing to overwrite nonempty project')
(project / 'package.json').write_text('{"private":true,"type":"module","scripts":{"test":"node --test"}}\n')
(project / 'csv.mjs').write_text('export function parseCSV(input) {\n  return input.split("\\n").map(line => line.split(","));\n}\n')
tests = '''import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from './csv.mjs';
test('quoted comma and escaped quote', () => {
  assert.deepEqual(parseCSV('name,note\\nAlice,"hello, world"\\nBob,"say ""yes"""'),
    [['name','note'],['Alice','hello, world'],['Bob','say "yes"']]);
});
test('CRLF, multiline quotes, trailing newline and empty fields', () => {
  assert.deepEqual(parseCSV('a,b,c\\r\\n"first\\r\\nsecond",,3\\r\\n'),
    [['a','b','c'],['first\\r\\nsecond','','3']]);
});
test('empty input and trailing empty field', () => {
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('a,'), [['a','']]);
});
test('invalid quote syntax is rejected', () => {
  assert.throws(() => parseCSV('"unfinished'), SyntaxError);
  assert.throws(() => parseCSV('ab"cd,ef'), SyntaxError);
  assert.throws(() => parseCSV('"ok"x,y'), SyntaxError);
});
'''
(project / 'csv.test.mjs').write_text(tests)
(root / 'evidence/smoke-verification.test.mjs').write_text(tests)
for args in [['init'], ['config','user.name','Cloud Smoke'], ['config','user.email','cloud-smoke@invalid'], ['add','.'], ['commit','-m','Known failing CSV practice baseline']]:
    subprocess.run(['git', *args], cwd=project, check=True, capture_output=True)
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=project,text=True).strip()
(root / 'evidence/smoke-baseline.txt').write_text(commit+'\n')
task = '''This is a practice smoke task, not a business project acceptance.
Fix parseCSV in csv.mjs so the existing tests pass. Support CSV quoted fields, escaped double quotes, commas inside quotes, CRLF and LF row endings, multiline quoted fields, empty fields and empty input. Do not include a spurious final row for a trailing row terminator. Reject unclosed quotes, quotes in unquoted fields and non-delimiter text after a closing quote with SyntaxError. Preserve line endings within quoted content. Read the project first, make the source changes yourself, and run npm test. Do not delete or weaken tests, do not commit, and do not access network or environment secrets. Explain the diff and test result.'''
(root / 'evidence/smoke-task.txt').write_text(task+'\n')
print('Practice fixture prepared:',commit)
