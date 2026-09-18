// Offline exporter integration test; this is not the user's P2 or browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {exportSource} from '../src/source-export.ts';
import {exportPatch} from '../src/patch-export.ts';

test('actual ZIP bytes and binary patch reproduce tests in independent clean directories',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'export-reproduction-'));
 const source=path.join(temp,'original'),unzipped=path.join(temp,'unzipped'),patched=path.join(temp,'patched');
 // Child project tests must actually execute, rather than inherit node:test's
 // recursive-run suppression from this integration test process.
 const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
 const run=(cwd,command,args)=>execFileSync(command,args,{cwd,encoding:'utf8',env:childEnv});
 const git=(cwd,...args)=>run(cwd,'git',args).trim();
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{
  await mkdir(source);git(source,'init','-q','--template=');git(source,'config','user.name','Export Test');git(source,'config','user.email','test@example.invalid');
  await mkdir(path.join(source,'src/runtime'),{recursive:true});
  await writeFile(path.join(source,'src/runtime/normalize.mjs'),'export const normalize = value => value;\n');
  await writeFile(path.join(source,'obsolete.txt'),'remove me');
  await writeFile(path.join(source,'data.bin'),Buffer.from([0,255,1]));
  git(source,'add','.');git(source,'commit','-qm','offline fixture baseline');const baseline=git(source,'rev-parse','HEAD');
  await writeFile(path.join(source,'src/runtime/normalize.mjs'),'export const normalize = value => value.trim().replace(/\\s+/g, " ");\n');
  await writeFile(path.join(source,'normalize.test.mjs'),"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {normalize} from './src/runtime/normalize.mjs';\ntest('whitespace normalization',()=>assert.equal(normalize('  a   b  '),'a b'));\n");
  await rm(path.join(source,'obsolete.txt'));await writeFile(path.join(source,'data.bin'),Buffer.from([0,254,2,3]));
  const indexBefore=await readFile(path.join(source,'.git/index'));
  const patch=await exportPatch({directory:source,baseline}),zip=await exportSource({directory:source,baseline});
  await writeFile(path.join(temp,'source.zip'),zip.zip);await writeFile(path.join(temp,'changes.patch'),patch.patch);
  await mkdir(unzipped);
  run(temp,'python3',['-c','import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',path.join(temp,'source.zip'),unzipped]);
  const zipSource=path.join(unzipped,'source');
  git(temp,'clone','-q','--no-hardlinks',source,patched);git(patched,'checkout','-q','--detach',baseline);
  git(patched,'apply','--check',path.join(temp,'changes.patch'));git(patched,'apply',path.join(temp,'changes.patch'));
  const outputs=[];
  for(const directory of [zipSource,patched]){
   outputs.push(run(directory,process.execPath,['--test','normalize.test.mjs']));
   assert.deepEqual(await readFile(path.join(directory,'data.bin')),Buffer.from([0,254,2,3]));
   await assert.rejects(readFile(path.join(directory,'obsolete.txt')),e=>e.code==='ENOENT');
   // The retained assertion must detect a broken implementation.
   await writeFile(path.join(directory,'src/runtime/normalize.mjs'),'export const normalize = value => value;\n');
   assert.throws(()=>run(directory,process.execPath,['--test','normalize.test.mjs']));
  }
  assert.deepEqual(await readFile(path.join(source,'.git/index')),indexBefore);
  assert.equal(zip.sha256,hash(zip.zip));assert.equal(patch.sha256,hash(patch.patch));
  if(process.env.EXPORT_REPRODUCTION_EVIDENCE){
   const evidence=process.env.EXPORT_REPRODUCTION_EVIDENCE;
   await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'fixture-source.zip'),zip.zip);await writeFile(path.join(evidence,'fixture-changes.patch'),patch.patch);
   await writeFile(path.join(evidence,'export-reproduction.json'),JSON.stringify({scope:'OFFLINE_EXPORTER_FIXTURE_NOT_P2_OR_BROWSER_ACCEPTANCE',baseline,patch:{sha256:patch.sha256,tree:patch.tree,files:patch.files},zip:{sha256:zip.sha256,tree:zip.tree,files:zip.files},sourceIndexUnchanged:true,zipTestsExitCode:0,patchCheckExitCode:0,patchTestsExitCode:0,brokenImplementationRejectedInBoth:true,outputs},null,2)+'\n');
  }
 }finally{await rm(temp,{recursive:true,force:true});}
});
