#!/usr/bin/env node
/**
 * WorkBench v1 export contract. Runs real export functions against temporary
 * repositories only; no Docker, network, model credentials, or production data.
 * Usage: node --experimental-strip-types .../export-contract.mjs --repo . [--out report.json]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function options(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--repo', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: --repo /path/to/development-checkout [--out /path/to/report.json]');
    }
    out[args[i].slice(2)] = path.resolve(args[++i]);
  }
  if (!out.repo) throw new Error('--repo is required; point it at a development checkout, not a live runtime');
  return out;
}
const opts = options(process.argv.slice(2));
const src = path.join(opts.repo, 'opencode-cloud', 'src');
for (const name of ['patch-export.ts', 'source-export.ts', 'snapshot-git.ts']) await access(path.join(src, name));
const { exportPatch } = await import(pathToFileURL(path.join(src, 'patch-export.ts')).href);
const { exportSource } = await import(pathToFileURL(path.join(src, 'source-export.ts')).href);
assert.equal(typeof exportPatch, 'function', 'Missing exportPatch; adapt the call site if the real API changed');
assert.equal(typeof exportSource, 'function', 'Missing exportSource; adapt the call site if the real API changed');

const env = { ...process.env };
for (const name of Object.keys(env)) if (name.startsWith('GIT_')) delete env[name];
Object.assign(env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
});
function command(bin, args, cwd, input) {
  return execFileSync(bin, args, { cwd, env, input, maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
}
function git(cwd, ...args) { return command('git', args, cwd).toString('utf8'); }
command('git', ['--version'], opts.repo);
command('python3', ['--version'], opts.repo);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function write(root, file, value) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
}
async function fixture(files = { 'src/main.ts': 'export const value = 1;\n' }) {
  const base = await mkdtemp(path.join(tmpdir(), 'workbench-v1-contract-'));
  const repo = path.join(base, 'project');
  await mkdir(repo);
  git(repo, 'init', '--quiet', '--template=');
  git(repo, 'config', 'user.name', 'WorkBench Contract');
  git(repo, 'config', 'user.email', 'contract@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false');
  await write(repo, '.gitignore', 'node_modules/\n');
  for (const [file, value] of Object.entries(files)) await write(repo, file, value);
  git(repo, 'add', '.'); git(repo, 'commit', '--quiet', '-m', 'fixture baseline');
  const baseline = git(repo, 'rev-parse', 'HEAD').trim();
  return { base, repo, baseline, close: () => rm(base, { recursive: true, force: true }) };
}
async function withFixture(files, fn) {
  const f = await fixture(files);
  try { return await fn(f); } finally { await f.close(); }
}
async function archiveEntries(base, zip) {
  assert.ok(Buffer.isBuffer(zip) || zip instanceof Uint8Array, 'Source export must provide actual ZIP bytes');
  const file = path.join(base, 'export.zip'); await writeFile(file, zip);
  const program = [
    'import zipfile,json,base64,sys',
    'with zipfile.ZipFile(sys.argv[1]) as z:',
    ' assert len(z.namelist()) == len(set(z.namelist())), "duplicate archive names"',
    ' assert sum(i.file_size for i in z.infolist()) < 8*1024*1024, "oversize test archive"',
    ' print(json.dumps({i.filename:base64.b64encode(z.read(i.filename)).decode() for i in z.infolist() if not i.is_dir()}))',
  ].join('\n');
  const entries = JSON.parse(command('python3', ['-c', program, file], base).toString());
  return Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, Buffer.from(bytes, 'base64')]));
}
const innocentPaths = ['src/main.ts', 'src/db/query.ts', 'src/state/store.ts', 'src/runtime/worker.ts', 'src/credentials.ts'];
const initialInnocent = Object.fromEntries(innocentPaths.map(p => [p, 'export const value = 1;\n']));
async function changeInnocent(repo) {
  for (const p of innocentPaths) await write(repo, p, 'export const value = 2;\n');
}
const fakePrivate = {
  '.npmrc': '//registry.example.invalid/:_authToken=FAKE_TEST_NPM_TOKEN_NO_REAL_ACCOUNT\n',
  '.netrc': 'machine example.invalid login fixture password FAKE_TEST_NETRC_PASSWORD\n',
  '.env': 'SERVICE_KEY=FAKE_TEST_SERVICE_KEY\n',
  'id_ed25519': 'FAKE_TEST_PRIVATE_KEY_MATERIAL\n',
};
async function addPrivate(repo) { for (const [p, text] of Object.entries(fakePrivate)) await write(repo, p, text); }
function explicitSecurityRefusal(error) {
  return /^EXPORT_(SENSITIVE|SECRET|POLICY)/.test(String(error?.code || '')) ||
    /protected.*credential|sensitive.*(?:file|content)|credential.*(?:blocked|forbidden)|secret.*(?:detected|forbidden)/i.test(String(error?.message || ''));
}
async function getOrSecurityRefusal(fn) {
  try { return await fn(); } catch (error) {
    assert.ok(explicitSecurityRefusal(error), 'Sensitive fixture failed for an unrelated reason: ' + error.message);
    return null;
  }
}
function assertPrivateAbsent(text) {
  for (const value of Object.values(fakePrivate)) assert.ok(!text.includes(value.trim()), 'Protected fixture bytes escaped into patch');
}
async function indexHash(repo) { return digest(await readFile(path.join(repo, '.git', 'index'))); }

const tests = [
 ['E01', 'patch retains innocent business source paths', () => withFixture(initialInnocent, async f => {
   await changeInnocent(f.repo);
   const before = await indexHash(f.repo);
   const result = await exportPatch({ directory: f.repo, baseline: f.baseline });
   const missing = innocentPaths.filter(p => !result.files.includes(p));
   assert.deepEqual(missing, [], 'Legitimate modified sources silently missing from patch');
   assert.equal(await indexHash(f.repo), before, 'Export changed the real Git index');
 })],
 ['E02', 'ZIP retains actual bytes of innocent business source paths', () => withFixture(initialInnocent, async f => {
   await changeInnocent(f.repo);
   const result = await exportSource({ directory: f.repo, baseline: f.baseline });
   const entries = await archiveEntries(f.base, result.zip);
   const missing = innocentPaths.filter(p => !entries['source/' + p]);
   assert.deepEqual(missing, [], 'Legitimate sources silently missing from ZIP');
   for (const p of innocentPaths) assert.equal(entries['source/' + p].toString(), 'export const value = 2;\n');
 })],
 ['E03', 'patch excludes or explicitly blocks credential-bearing config fixtures', () => withFixture(undefined, async f => {
   await write(f.repo, 'src/main.ts', 'export const value = 2;\n'); await addPrivate(f.repo);
   const result = await getOrSecurityRefusal(() => exportPatch({ directory: f.repo, baseline: f.baseline }));
   if (result === null) return;
   assertPrivateAbsent(result.patch);
   assert.ok(result.files.includes('src/main.ts'), 'Valid changes disappeared along with sensitive files');
   for (const p of Object.keys(fakePrivate)) assert.ok(!result.files.includes(p), 'Sensitive fixture path exported: ' + p);
 })],
 ['E04', 'ZIP excludes or explicitly blocks credential-bearing config fixtures', () => withFixture(undefined, async f => {
   await addPrivate(f.repo);
   const result = await getOrSecurityRefusal(() => exportSource({ directory: f.repo, baseline: f.baseline }));
   if (result === null) return;
   const entries = await archiveEntries(f.base, result.zip);
   assert.ok(entries['source/src/main.ts'], 'ZIP omitted ordinary source');
   for (const p of Object.keys(fakePrivate)) assert.ok(!entries['source/' + p], 'Sensitive file in ZIP: ' + p);
   const payload = Object.values(entries).map(b => b.toString('utf8')).join('\n');
   assertPrivateAbsent(payload);
 })],
 ['E05', 'patch applies staged, unstaged, deleted and binary files without mutating source', () => withFixture({
   'src/main.ts': 'export const value = 1;\n', 'src/delete.txt': 'remove me\n',
 }, async f => {
   await write(f.repo, 'src/main.ts', 'staged\n'); git(f.repo, 'add', 'src/main.ts');
   await write(f.repo, 'src/main.ts', 'final unstaged\n'); await rm(path.join(f.repo, 'src/delete.txt'));
   const binary = Buffer.from([0, 255, 42, 0, 128]); await write(f.repo, 'src/add.bin', binary);
   const before = await indexHash(f.repo);
   const result = await exportPatch({ directory: f.repo, baseline: f.baseline });
   assert.equal(await indexHash(f.repo), before, 'Index changed');
   assert.equal((await readFile(path.join(f.repo, 'src/main.ts'))).toString(), 'final unstaged\n');
   const clean = path.join(f.base, 'clean'); await mkdir(clean);
   git(clean, 'init', '--quiet', '--template='); git(clean, 'fetch', '--quiet', f.repo, f.baseline);
   git(clean, 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
   command('git', ['apply', '--check', '-'], clean, result.patch);
   command('git', ['apply', '--binary', '-'], clean, result.patch);
   assert.equal((await readFile(path.join(clean, 'src/main.ts'))).toString(), 'final unstaged\n');
   assert.deepEqual(await readFile(path.join(clean, 'src/add.bin')), binary);
   await assert.rejects(access(path.join(clean, 'src/delete.txt')), { code: 'ENOENT' });
 })],
 ['E06', 'ZIP content and manifest agree; source index unchanged', () => withFixture(undefined, async f => {
   const binary = Buffer.from([0, 1, 2, 255]); await write(f.repo, 'src/add.bin', binary);
   const before = await indexHash(f.repo);
   const result = await exportSource({ directory: f.repo, baseline: f.baseline });
   const entries = await archiveEntries(f.base, result.zip);
   assert.deepEqual(entries['source/src/add.bin'], binary);
   assert.equal(await indexHash(f.repo), before, 'Index changed');
   const manifest = JSON.parse(entries['WORKBENCH_EXPORT.json']?.toString() || '{}');
   assert.equal(manifest.baseline, f.baseline, 'Missing or wrong baseline');
   assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'Missing real manifest');
   for (const file of manifest.files) {
     assert.ok(entries['source/' + file.path], 'Manifest references missing file: ' + file.path);
     assert.equal(digest(entries['source/' + file.path]), file.sha256, 'Manifest hash mismatch: ' + file.path);
   }
 })],
 ['E07', 'both formats reject outside-project symlink without index mutation', () => withFixture(undefined, async f => {
   await write(f.base, 'outside.txt', 'FIXTURE_OUTSIDE_PROJECT\n');
   await symlink('../../outside.txt', path.join(f.repo, 'src/outside-link'));
   const before = await indexHash(f.repo);
   await assert.rejects(exportPatch({ directory: f.repo, baseline: f.baseline }), /symlink|outside|escape|unsafe/i);
   await assert.rejects(exportSource({ directory: f.repo, baseline: f.baseline }), /symlink|outside|escape|unsafe/i);
   assert.equal(await indexHash(f.repo), before);
 })],
];
const report = { kind: 'targeted_export_contract', developmentVersion: 'v1',
  timestamp: new Date().toISOString(), node: process.version,
  productionTouched: false, sourceSha256: {}, tests: [] };
for (const name of ['patch-export.ts', 'source-export.ts', 'snapshot-git.ts']) {
  report.sourceSha256[name] = digest(await readFile(path.join(src, name)));
}
for (const [id, name, run] of tests) {
  try { await run(); report.tests.push({ id, name, status: 'PASS' }); console.log('PASS', id, name); }
  catch (error) { report.tests.push({ id, name, status: 'FAIL', detail: error.message }); console.log('FAIL', id, name, '\n ', error.message); }
}
report.summary = { total: tests.length, passed: report.tests.filter(t => t.status === 'PASS').length,
  failed: report.tests.filter(t => t.status === 'FAIL').length };
report.status = report.summary.failed ? 'FAIL' : 'PASS';
if (opts.out) {
  await mkdir(path.dirname(opts.out), { recursive: true });
  await writeFile(opts.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log('Report:', opts.out);
}
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.failed ? 1 : 0;
