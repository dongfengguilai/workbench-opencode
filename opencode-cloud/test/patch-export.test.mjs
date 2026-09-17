import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportPatch } from '../src/patch-export.ts';

function git(dir, ...args) { return execFileSync('git',args,{cwd:dir}).toString(); }
async function fixture() {
 const dir=await mkdtemp(path.join(tmpdir(),'cloud-export-'));
 git(dir,'init','-q');git(dir,'config','user.name','Test');git(dir,'config','user.email','test@invalid');
 await mkdir(path.join(dir,'src'));
 await writeFile(path.join(dir,'.gitignore'),'node_modules/\n.env\n');
 await writeFile(path.join(dir,'src/changed.txt'),'original\n');
 await writeFile(path.join(dir,'src/deleted.txt'),'delete me\n');
 git(dir,'add','.');git(dir,'commit','-qm','baseline');
 return {dir,baseline:git(dir,'rev-parse','HEAD').trim()};
}
test('complete binary patch applies staged, unstaged, new and deleted files without changing index',async()=>{
 const {dir,baseline}=await fixture();const target=await mkdtemp(path.join(tmpdir(),'cloud-apply-'));
 try {
  await writeFile(path.join(dir,'src/changed.txt'),'staged\n');git(dir,'add','src/changed.txt');
  await writeFile(path.join(dir,'src/changed.txt'),'unstaged final\n');
  await rm(path.join(dir,'src/deleted.txt'));
  await writeFile(path.join(dir,'src/new.txt'),'new source\n');
  const binary=Buffer.from([0,1,255,0,100]);await writeFile(path.join(dir,'src/new.bin'),binary);
  await writeFile(path.join(dir,'.env'),'SECRET=do-not-export\n');
  await mkdir(path.join(dir,'node_modules'));await writeFile(path.join(dir,'node_modules/cache'),'do-not-export');
  const index=await readFile(path.join(dir,'.git/index'));
  const result=await exportPatch({directory:dir,baseline});
  assert.equal(result.baseline,baseline);
  assert.deepEqual(result.files.sort(),['src/changed.txt','src/deleted.txt','src/new.bin','src/new.txt']);
  assert.deepEqual(await readFile(path.join(dir,'.git/index')),index);
  assert.ok(!result.patch.includes('do-not-export'));
  git(target,'init','-q');git(target,'fetch',dir,baseline);git(target,'checkout','-q','FETCH_HEAD');
  execFileSync('git',['apply','--binary','-'],{cwd:target,input:result.patch});
  assert.equal(await readFile(path.join(target,'src/changed.txt'),'utf8'),'unstaged final\n');
  assert.equal(await readFile(path.join(target,'src/new.txt'),'utf8'),'new source\n');
  assert.deepEqual(await readFile(path.join(target,'src/new.bin')),binary);
  await assert.rejects(readFile(path.join(target,'src/deleted.txt')));
 } finally {await rm(dir,{recursive:true,force:true});await rm(target,{recursive:true,force:true});}
});
test('tracked secret paths are excluded and baseline mismatch fails explicitly',async()=>{
 const {dir,baseline}=await fixture();
 try {
  await writeFile(path.join(dir,'.env'),'old-secret');git(dir,'add','-f','.env');git(dir,'commit','-qm','tracked secret');
  const head=git(dir,'rev-parse','HEAD').trim();await writeFile(path.join(dir,'.env'),'new-secret');
  const result=await exportPatch({directory:dir,baseline:head});
  assert.ok(!result.patch.includes('secret'));assert.ok(!result.files.includes('.env'));
  await assert.rejects(exportPatch({directory:dir,baseline}),/baseline/i);
  await assert.rejects(exportPatch({directory:dir,baseline:'HEAD;echo unsafe'}),/baseline/i);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('untracked external symlink is rejected without modifying the index',async()=>{
 const {dir,baseline}=await fixture();
 try {
  const index=await readFile(path.join(dir,'.git/index'));
  await symlink('/etc/passwd',path.join(dir,'src/outside'));
  await assert.rejects(exportPatch({directory:dir,baseline}),/symlink/i);
  assert.deepEqual(await readFile(path.join(dir,'.git/index')),index);
 } finally {await rm(dir,{recursive:true,force:true});}
});
