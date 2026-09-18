import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportPatch } from '../src/patch-export.ts';
test('untracked credentials and state are excluded even without gitignore rules',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cloud-export-independent-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir}).toString();
 try {
  git('init','-q');git('config','user.name','Independent');git('config','user.email','independent@invalid');
  await mkdir(path.join(dir,'src'));await writeFile(path.join(dir,'src/original.txt'),'base');
  git('add','.');git('commit','-qm','clean');const baseline=git('rev-parse','HEAD').trim();
  await writeFile(path.join(dir,'src/new.txt'),'legitimate source');
  await writeFile(path.join(dir,'src/private-key.pem'),'NOT_A_REAL_SECRET_sentinel');
  await writeFile(path.join(dir,'.env.production'),'NOT_A_REAL_SECRET_sentinel');
  await mkdir(path.join(dir,'state'));await writeFile(path.join(dir,'state/session.db'),'NOT_A_REAL_SECRET_sentinel');
  const result=await exportPatch({directory:dir,baseline,ownedPaths:['state']});
  assert.deepEqual(result.files,['src/new.txt']);
  assert.ok(!result.patch.includes('NOT_A_REAL_SECRET_sentinel'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('deleted tracked secrets are restored to baseline in temporary index',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cloud-export-deleted-secret-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir}).toString();
 try {
  git('init','-q');git('config','user.name','Independent');git('config','user.email','independent@invalid');
  await writeFile(path.join(dir,'.env'),'NOT_A_REAL_SECRET_deleted_sentinel');
  await writeFile(path.join(dir,'source.txt'),'base');git('add','.');git('commit','-qm','baseline');
  const baseline=git('rev-parse','HEAD').trim();await rm(path.join(dir,'.env'));
  await writeFile(path.join(dir,'source.txt'),'changed');
  const result=await exportPatch({directory:dir,baseline});
  assert.deepEqual(result.files,['source.txt']);
  assert.ok(!result.patch.includes('NOT_A_REAL_SECRET_deleted_sentinel'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
