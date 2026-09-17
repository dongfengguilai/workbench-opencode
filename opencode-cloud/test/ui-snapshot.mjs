// Read-only native/project evidence, before cutover and after verification.
import {login,request} from './live-client.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const output={kind:'real_readonly_ui_snapshot',date:new Date().toISOString(),repository:execFileSync('git',['status','--porcelain=v1'],{encoding:'utf8'}),environments:{}};
for(const [name,folder,service] of [['admin','admin-project','admin-native'],['trial-b','project','native']]){
 const cookie=await login(name);const states=await request('/session/status',{cookie});if(states.status!==200)throw Error('status '+states.status);
 const idle=Object.values(JSON.parse(states.body)).every(s=>s.type==='idle');if(!idle)throw Error(name+' currently busy; no cutover');
 const response=await request('/session',{cookie});if(response.status!==200)throw Error('session '+response.status);
 const sessions=[];
 for(const s of JSON.parse(response.body)){const r=await request('/session/'+s.id+'/message',{cookie});if(r.status!==200)throw Error('messages '+r.status);sessions.push({id:s.id,title:s.title,messagesSha256:hash(JSON.stringify(JSON.parse(r.body)))});}
 const project='runtime/'+folder;const files={};
 function walk(rel=''){for(const entry of readdirSync(project+'/'+rel)){if(entry==='.git'||entry==='runtime'||entry==='node_modules'||entry==='.env.a05-acceptance')continue;const key=rel+entry;const stat=lstatSync(project+'/'+key);if(stat.isDirectory())walk(key+'/');else if(stat.isFile())files[key]=hash(readFileSync(project+'/'+key));}}
 walk();const id=execFileSync('docker',['compose','ps','-q',service],{encoding:'utf8'}).trim();const container=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];
 output.environments[name]={idle,containerId:id,startedAt:container.State.StartedAt,sessions,files,gitStatus:execFileSync('git',['status','--porcelain=v1'],{cwd:project,encoding:'utf8'}),indexSha256:hash(readFileSync(project+'/.git/index'))};
 await request('/api/auth/logout',{method:'POST',cookie});
}
writeFileSync(process.argv[2]||'evidence/workbench-ui-before.json',JSON.stringify(output,null,2)+'\n');console.log('Saved real snapshot:',Object.fromEntries(Object.entries(output.environments).map(([k,v])=>[k,{sessions:v.sessions.length,files:Object.keys(v.files).length,idle:v.idle,containerId:v.containerId}])));
