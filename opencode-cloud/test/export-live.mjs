import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {request,login} from './live-client.mjs';
const root='runtime/admin-project';const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8'});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const baseline=git(['rev-parse','HEAD']).trim();
const staged='opencode-cloud-v0/README.md',deleted='opencode-cloud/evidence/smoke-task.txt';
const added='acceptance-a05.txt',binary='acceptance-a05.bin';
if(!existsSync(root+'/'+added)) {
writeFileSync(root+'/'+staged,readFileSync(root+'/'+staged)+'\nA05 staged work\n');git(['add','--',staged]);
writeFileSync(root+'/'+staged,readFileSync(root+'/'+staged)+'\nA05 unstaged work\n');rmSync(root+'/'+deleted);
writeFileSync(root+'/'+added,'A05 authorized new work\n');writeFileSync(root+'/'+binary,Buffer.from([0,1,128,255,0,20]));
}
const excluded='A05_EXCLUDED_CREDENTIAL_73ac4';writeFileSync(root+'/.env.a05-acceptance',excluded);mkdirSync(root+'/runtime',{recursive:true});writeFileSync(root+'/runtime/a05-state.json',excluded);
const before=hash(root+'/.git/index');const cookie=await login();
const r=await request('/__platform/download',{cookie});
writeFileSync('evidence/a05-download-result.json',JSON.stringify({status:r.status,detail:r.status===200?'patch_received':r.body,baseline,indexBefore:before,indexAfter:hash(root+'/.git/index')},null,2));
assert.equal(r.status,200,r.body);assert.equal(before,hash(root+'/.git/index'));assert.ok(!r.body.includes(excluded));
writeFileSync('evidence/a05-platform.patch',r.body);
const manifest=await request('/__platform/changes',{cookie});assert.equal(manifest.status,200);writeFileSync('evidence/a05-manifest.json',manifest.body);
const clean=process.env.A05_CLEAN||'runtime/a05-applied';assert.ok(!existsSync(clean));git(['clone','--no-hardlinks','--quiet',process.cwd()+'/'+root,process.cwd()+'/'+clean],process.cwd());git(['reset','--hard',baseline],clean);
git(['apply','--check',process.cwd()+'/evidence/a05-platform.patch'],clean);git(['apply',process.cwd()+'/evidence/a05-platform.patch'],clean);
assert.ok(readFileSync(clean+'/'+staged,'utf8').includes('A05 staged work\n\nA05 unstaged work'));assert.ok(!existsSync(clean+'/'+deleted));assert.deepEqual(readFileSync(clean+'/'+binary),readFileSync(root+'/'+binary));
console.log('PASS actual HTTPS download and clean baseline application; index unchanged');
