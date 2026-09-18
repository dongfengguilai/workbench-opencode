import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {exportPatch} from '../src/patch-export.ts';
import {exportSource} from '../src/source-export.ts';
import {exportPolicy} from '../src/export-policy.ts';
async function fixture(fn){
 const directory=await mkdtemp(path.join(tmpdir(),'export-policy-'));
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8'}).trim();
 const write=async(file,value)=>{await mkdir(path.dirname(path.join(directory,file)),{recursive:true});await writeFile(path.join(directory,file),value);};
 try{git('init','-q','--template=');git('config','user.email','test@example.invalid');git('config','user.name','Policy Test');await write('main.txt','baseline');git('add','.');git('commit','-qm','base');await fn({directory,git,write,baseline:git('rev-parse','HEAD')});}
 finally{await rm(directory,{recursive:true,force:true});}
}
const hash=b=>createHash('sha256').update(b).digest('hex');

test('business directories and credential-named source are deliverable at root and nested levels',async()=>fixture(async({directory,write,baseline})=>{
 const paths=['db/query.ts','state/store.ts','runtime/worker.ts','vendor/library.js','src/vendor/library.js','src/cache/read.ts','src/database/schema.ts','src/credentials.ts','src/secrets.ts'];
 for(const p of paths)await write(p,'export const value=1;\n');
 const before=await readFile(path.join(directory,'.git/index'));
 const patch=await exportPatch({directory,baseline});const zip=await exportSource({directory,baseline});
 for(const p of paths){assert.ok(patch.files.includes(p),p);assert.ok(zip.files.some(f=>f.path===p),p);}
 assert.deepEqual(await readFile(path.join(directory,'.git/index')),before);
 assert.equal(patch.sha256,hash(patch.patch));assert.equal(zip.sha256,hash(zip.zip));
 assert.ok(patch.tree);assert.ok(zip.tree);
}));

test('tracked credentials including deletions never escape either format; exclusions have reasons',async()=>fixture(async({directory,write,git})=>{
 const privatePaths=['.npmrc','.netrc','id_rsa','id_ed25519','nested/.env.production'];
 for(const p of privatePaths)await write(p,'FAKE_TEST_CREDENTIAL_BEFORE');
 git('add','.');git('commit','-qm','private fixture baseline');const baseline=git('rev-parse','HEAD');
 await write('main.txt','new source');
 for(const p of privatePaths)await write(p,'FAKE_TEST_CREDENTIAL_AFTER');
 await rm(path.join(directory,'.netrc'));
 const patch=await exportPatch({directory,baseline});const zip=await exportSource({directory,baseline});
 assert.ok(!patch.patch.includes('FAKE_TEST_CREDENTIAL'));
 assert.deepEqual(patch.files,['main.txt']);
 for(const p of privatePaths){assert.ok(!zip.files.some(f=>f.path===p));assert.ok(patch.excluded.some(e=>e.path===p&&e.reason==='credential-file'));}
 assert.ok(zip.excluded.some(e=>e.path==='.npmrc'&&e.reason==='credential-file'));
}));

test('renamed private PEM content is explicitly refused without printing sensitive bytes',async()=>fixture(async({directory,write,baseline})=>{
 const body='-----BEGIN PRIVATE KEY-----\nFAKE_PRIVATE_PAYLOAD_NOT_REAL\n-----END PRIVATE KEY-----\n';await write('ordinary.txt',body);
 for(const fn of [exportPatch,exportSource])await assert.rejects(fn({directory,baseline}),e=>e.code==='EXPORT_SENSITIVE_CONTENT'&&!e.message.includes('FAKE_PRIVATE_PAYLOAD_NOT_REAL'));
}));

test('patch checks deleted binary baseline bytes against protected credentials',async()=>fixture(async({directory,write,git})=>{
 const secret='FAKE_PROTECTED_BINARY_TOKEN_123';await write('data.bin',Buffer.concat([Buffer.from([0,255]),Buffer.from(secret)]));git('add','.');git('commit','-qm','binary fixture');const baseline=git('rev-parse','HEAD');await rm(path.join(directory,'data.bin'));
 await assert.rejects(exportPatch({directory,baseline,secrets:[secret]}),e=>e.code==='EXPORT_SENSITIVE_CONTENT'&&!e.message.includes(secret));
 const zip=await exportSource({directory,baseline,secrets:[secret]});assert.ok(!zip.files.some(f=>f.path==='data.bin'));
}));

test('links cannot alias excluded credentials into source',async()=>fixture(async({directory,write,baseline})=>{
 await write('.npmrc','FAKE_TEST_AUTH_TOKEN');await mkdir(path.join(directory,'src'));await symlink('../.npmrc',path.join(directory,'src/alias.txt'));
 for(const fn of [exportPatch,exportSource])await assert.rejects(fn({directory,baseline}),/symlink/i);
}));

test('explicit platform ownership excludes only the configured subtree',()=>{
 const excluded=exportPolicy(['private-platform/state']);
 assert.equal(excluded('private-platform/state/session.db'),'platform-owned');
 assert.equal(excluded('src/state/store.ts'),undefined);
 assert.equal(excluded('private-platform/stateful.ts'),undefined);
 for(const p of ['../state','/state','state/../src','state\\src',''])assert.throws(()=>exportPolicy([p]),/Invalid/);
});
