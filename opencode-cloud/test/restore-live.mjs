import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const run=promisify(execFile),root=process.cwd();
const archive='runtime/backups/before-quota-20260917.tar.gz',restore='runtime/restore-a09';assert.ok(!existsSync(restore),'Restoration must use a NEW directory');
const result={status:'IN_PROGRESS',checks:[]},pass=n=>{result.checks.push(n);console.log('PASS',n);};
await run('python3',['scripts/restore.py',archive,restore]);
const prefix=path.resolve(restore),src=path.resolve('src'),image='opencode-cloud/native:1.18.31-managed-v0';
const sec={read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],mem_limit:'2g',pids_limit:256};
const compose={services:{
 'admin-model-gateway':{...sec,image,command:['node','--experimental-strip-types','/app/model-gateway.ts'],user:'1000:1000',env_file:prefix+'/admin-gateway.env',volumes:[src+'/model-gateway.ts:/app/model-gateway.ts:ro',prefix+'/admin-gateway-state:/gateway-state'],networks:['internal','egress'],mem_limit:'256m'},
 'admin-native':{...sec,image,init:true,command:['opencode','serve','--hostname','127.0.0.1','--port','4030'],env_file:prefix+'/admin-native.env',volumes:[prefix+'/admin-project:/workspace/project',prefix+'/admin-state:/state',prefix+'/admin-opencode.json:/trusted/opencode.json:ro'],networks:['internal'],tmpfs:['/tmp:rw,nosuid,nodev,size=256m'],cpus:2},
 'firewall':{image,user:'0:0',network_mode:'service:admin-native',cap_drop:['ALL'],cap_add:['NET_ADMIN'],read_only:true,depends_on:['admin-native'],command:['sh','-c','iptables -I OUTPUT 1 -p tcp --dport 4030 -m owner --uid-owner 1000 -j REJECT']},
 'guard':{...sec,image,user:'1001:1001',command:['node','--experimental-strip-types','/app/environment-guard.ts'],network_mode:'service:admin-native',env_file:prefix+'/admin-native.env',environment:{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'safe.directory',GIT_CONFIG_VALUE_0:'/workspace/project'},volumes:[src+':/app:ro',prefix+'/admin-project:/workspace/project:ro'],tmpfs:['/tmp:rw,nosuid,nodev,size=128m'],depends_on:{firewall:{condition:'service_completed_successfully'}},mem_limit:'256m'}
},networks:{internal:{internal:true},egress:{}}};
const file='runtime/restore-a09-compose.json';writeFileSync(file,JSON.stringify(compose,null,2));
const args=['compose','-p','opencode-cloud-v0-restore','-f',file];
async function cli(tail){const r=await run('docker',[...args,...tail],{timeout:120000});return r.stdout+r.stderr;}
async function query(route,body){const code="const route=process.argv[1],body=process.argv[2];fetch('http://localhost:4096'+route,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'),...(body?{'Content-Type':'application/json'}:{})},body:body||undefined,signal:AbortSignal.timeout(5000)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>{console.log(e.message);process.exit(1)});";const r=await run('docker',[...args,'exec','-T','guard','node','-e',code,route,...(body?[JSON.stringify(body)]:[])],{timeout:10000});return JSON.parse(r.stdout);}
const sid=JSON.parse(readFileSync('evidence/browser-flow-result.json')).session;result.session=sid;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 writeFileSync('evidence/a09-restore-start.log',await cli(['up','-d','--no-build']));
 let ready=false;for(let i=0;i<30;i++){try{const r=await query('/global/health');if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'Independent restored native instance ready');
 const before=JSON.parse(readFileSync('evidence/platform-native-messages.json'));const messages=await query('/session/'+sid+'/message');assert.equal(messages.status,200);assert.deepEqual(JSON.parse(messages.body).map(m=>m.info.id),before.map(m=>m.info.id));
 const oldHash=hash('runtime/admin-project/opencode-cloud/src/patch-export.ts');const restoredHash=hash(restore+'/admin-project/opencode-cloud/src/patch-export.ts');assert.equal(restoredHash,oldHash);result.fileHash=restoredHash;result.backupSha256=readFileSync(archive+'.sha256','utf8').trim();pass('cold restored SQLite has same native session/messages and identical product source');
 const task='Continue this restored native session. Run node --experimental-strip-types --test opencode-cloud/test/patch-export.test.mjs without modifying files. Report the real result.';writeFileSync('evidence/a09-restored-continuation-task.txt',task+'\n');
 const r=await query('/session/'+sid+'/prompt_async',{messageID:'msg_'+randomBytes(16).toString('hex'),model:{providerID:'approved',modelID:'gpt-5.6-luna'},parts:[{type:'text',text:task}]});assert.equal(r.status,204);
 let final;const end=Date.now()+300000;while(Date.now()<end){await new Promise(r=>setTimeout(r,2000));const state=await query('/session/status');if(state.status===200&&Object.keys(JSON.parse(state.body)).length===0){const m=await query('/session/'+sid+'/message');const list=JSON.parse(m.body);if(list.slice(before.length).some(m=>m.parts?.some(p=>p.type==='tool'&&p.tool==='bash'&&p.state.status==='completed'&&p.state.output.includes('# pass 3')&&p.state.output.includes('# fail 0')))){final=list;break;}}}
 assert.ok(final,'Restored genuine native conversation must continue and execute successful tests');writeFileSync('evidence/a09-restored-native-messages.json',JSON.stringify(final,null,2));assert.equal(hash(restore+'/admin-project/opencode-cloud/src/patch-export.ts'),restoredHash);pass('same restored native session continues with genuine Luna Bash and 3 original tests PASS');result.status='PASS';
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{writeFileSync('evidence/a09-restore-result.json',JSON.stringify(result,null,2));writeFileSync('evidence/a09-restore-stop.log',await cli(['stop']));}
