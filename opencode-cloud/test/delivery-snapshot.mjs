import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';import {request,login,config} from './delivery-client.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');const result={at:new Date().toISOString(),users:{}};
for(const name of Object.keys(config.users)){
 const cookie=await login(name),directory=path.resolve(name==='admin'?'runtime/admin-project':'runtime/project');
 const call=async p=>{const r=await request(p,{cookie});if(r.status!==200)throw Error('Native snapshot failed '+r.status);return r.json()};
 const state=await call('/session/status');if(Object.keys(state).length)throw Error('Native task is busy; maintenance refused');
 const sessions={};for(const s of await call('/session'))sessions[s.id]=hash(Buffer.from(JSON.stringify(await call('/session/'+s.id+'/message'))));
 const files={};function walk(d){for(const n of readdirSync(d)){if(/^(\.git|node_modules|runtime|state|vendor|\.cache|\.playwright|\.playwright-cli|\.workbench-artifacts|dist)$/.test(n))continue;const p=path.join(d,n),s=lstatSync(p);if(s.isDirectory())walk(p);else if(s.isFile())files[path.relative(directory,p)]=hash(readFileSync(p));}}walk(directory);
 result.users[name]={sessions,files,status:execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:directory,encoding:'utf8'}),index:hash(readFileSync(path.join(directory,'.git/index')))};
 await request('/api/auth/logout',{method:'POST',cookie});
}
writeFileSync(process.argv[2]||'evidence/delivery-maintenance-before.json',JSON.stringify(result,null,2)+'\n');console.log('Saved actual idle native sessions, source hashes and Git index for both identities');
