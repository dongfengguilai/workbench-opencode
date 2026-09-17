import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {exportSource,validateSnapshotLinks} from '../src/source-export.ts';

test('captured links stay within the exported tree even after directory-link resolution',()=>{
 const files=[{path:'main.js',mode:'100644'},{path:'d/file.js',mode:'100644'},{path:'d/root',mode:'120000',target:'..'}];
 assert.doesNotThrow(()=>validateSnapshotLinks([...files,{path:'d/valid',mode:'120000',target:'../main.js'}]));
 assert.throws(()=>validateSnapshotLinks([...files,{path:'d/escape',mode:'120000',target:'root/../outside'}]),/Unsafe snapshot symlink/);
 assert.throws(()=>validateSnapshotLinks([...files,{path:'d/absolute',mode:'120000',target:'/etc/passwd'}]),/Unsafe snapshot symlink/);
 assert.throws(()=>validateSnapshotLinks([...files,{path:'d/missing',mode:'120000',target:'../missing'}]),/Unsafe snapshot symlink/);
 assert.throws(()=>validateSnapshotLinks([...files,{path:'d/a',mode:'120000',target:'b'},{path:'d/b',mode:'120000',target:'a'}]),/Unsafe snapshot symlink/);
});

test('immutable ZIP contains current source, binary additions and metadata; excludes every credential/cache; keeps original index',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'source-export-'));
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8'}).trim();
 try {
  git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Export Test');
  await writeFile(path.join(directory,'a.txt'),'before');await writeFile(path.join(directory,'deleted.txt'),'delete');await writeFile(path.join(directory,'.env'),'tracked credential');
  git('add','.');git('commit','-qm','baseline');const baseline=git('rev-parse','HEAD');
  await writeFile(path.join(directory,'a.txt'),'after');await rm(path.join(directory,'deleted.txt'));await writeFile(path.join(directory,'new.bin'),Buffer.from([0,255,1,0]));
  await mkdir(path.join(directory,'.workbench-artifacts'));await writeFile(path.join(directory,'.workbench-artifacts','trace.json'),'private verification state');
  const before=await readFile(path.join(directory,'.git/index'));const result=await exportSource({directory,baseline});
  assert.deepEqual(await readFile(path.join(directory,'.git/index')),before);
  const file=path.join(directory,'export.zip');await writeFile(file,result.zip);
  const entries=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).hex() for n in z.namelist() if not n.endswith("/")}))',file],{encoding:'utf8'}));
  assert.equal(entries['source/a.txt'],Buffer.from('after').toString('hex'));assert.equal(entries['source/new.bin'],'00ff0100');
  assert.equal(entries['source/deleted.txt'],undefined);assert.equal(entries['source/.env'],undefined);assert.equal(entries['source/.workbench-artifacts/trace.json'],undefined);
  const manifest=JSON.parse(Buffer.from(entries['WORKBENCH_EXPORT.json'],'hex').toString());assert.equal(manifest.baseline,baseline);assert.match(manifest.tree,/^[a-f0-9]{40}$/);assert.ok(manifest.files.some(f=>f.path==='new.bin'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('source export refuses outward links without reading target content',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'source-export-link-'));
 try{
  execFileSync('git',['init','-q'],{cwd:directory});execFileSync('git',['config','user.email','test@example.invalid'],{cwd:directory});execFileSync('git',['config','user.name','Test'],{cwd:directory});
  await writeFile(path.join(directory,'file'),'safe');execFileSync('git',['add','.'],{cwd:directory});execFileSync('git',['commit','-qm','base'],{cwd:directory});
  const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim();await symlink('/etc/passwd',path.join(directory,'escape'));
  await assert.rejects(exportSource({directory,baseline}),/symlink/i);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('source snapshot includes ignored source and ignores project Git execution/configuration and archive exclusions',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'source-export-config-'));
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8'}).trim();
 try{git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Test');await writeFile(path.join(directory,'file.txt'),'baseline');git('add','.');git('commit','-qm','base');const baseline=git('rev-parse','HEAD');
 await writeFile(path.join(directory,'.gitignore'),'ignored.mjs\n');await writeFile(path.join(directory,'ignored.mjs'),'export const value=1');await writeFile(path.join(directory,'.gitattributes'),'file.txt filter=evil export-ignore\n');
 git('config','filter.evil.clean','touch '+path.join(directory,'executed'));git('config','filter.evil.required','true');
 const result=await exportSource({directory,baseline});assert.ok(result.files.some(f=>f.path==='ignored.mjs'));assert.ok(result.files.some(f=>f.path==='file.txt'));
 await assert.rejects(readFile(path.join(directory,'executed')),/ENOENT/);
 const file=path.join(directory,'export.zip');await writeFile(file,result.zip);const names=JSON.parse(execFileSync('python3',['-c','import sys,zipfile,json;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',file],{encoding:'utf8'}));assert.ok(names.includes('source/file.txt'));assert.ok(names.includes('source/ignored.mjs'));
 }finally{await rm(directory,{recursive:true,force:true})}
});
