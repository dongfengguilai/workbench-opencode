import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,unlink,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {watchExportSource} from '../src/snapshot-git.ts';
import {exportPolicy} from '../src/export-policy.ts';

for(const scenario of ['edit','add','delete','mode','link'])test('source change detection: '+scenario,async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'wb-source-change-'));
 try{
  await writeFile(path.join(root,'source.txt'),'SOURCE_BYTES_NOT_AN_ERROR_REPORT_28a2');await writeFile(path.join(root,'other.txt'),'other');
  await symlink('source.txt',path.join(root,'link.txt'));
  const unchanged=await watchExportSource(root,exportPolicy());
  if(scenario==='edit')await writeFile(path.join(root,'source.txt'),'SOURCE_BYTES_NOT_AN_ERROR_REPORT_28a3');
  if(scenario==='add')await writeFile(path.join(root,'new.txt'),'new');
  if(scenario==='delete')await unlink(path.join(root,'source.txt'));
  if(scenario==='mode')await chmod(path.join(root,'source.txt'),0o755);
  if(scenario==='link'){await unlink(path.join(root,'link.txt'));await symlink('other.txt',path.join(root,'link.txt'));}
  await assert.rejects(unchanged(),e=>e.code==='EXPORT_SOURCE_CHANGED'&&!e.message.includes('SOURCE_BYTES_NOT_AN_ERROR_REPORT'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('excluded runtime/build writes do not reject a stable deliverable',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'wb-source-stable-'));
 try{
  await mkdir(path.join(root,'web'));await writeFile(path.join(root,'web/index.html'),'stable');
  const unchanged=await watchExportSource(root,exportPolicy());
  await mkdir(path.join(root,'web/dist'));await writeFile(path.join(root,'web/dist/index.html'),'build output');
  await mkdir(path.join(root,'.workbench-artifacts'));await writeFile(path.join(root,'.workbench-artifacts/log'),'log');
  await unchanged();
 }finally{await rm(root,{recursive:true,force:true});}
});
