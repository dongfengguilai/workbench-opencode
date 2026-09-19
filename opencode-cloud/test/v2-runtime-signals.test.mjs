import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const image='node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90';
test('fixed Node behind Docker init exits after SIGTERM without timeout escalation',async()=>{
 let cid;
 try{
  cid=execFileSync('docker',['run','-d','--init','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--label','workbench.v2.signal-test=true',image,'node','-e','setInterval(()=>{},1000)'],{encoding:'utf8'}).trim();
  const inspect=()=>JSON.parse(execFileSync('docker',['inspect',cid],{encoding:'utf8'}))[0];assert.equal(inspect().HostConfig.Init,true);
  execFileSync('docker',['kill','--signal=SIGTERM',cid],{stdio:'ignore'});
  const start=Date.now();while(inspect().State.Running&&Date.now()-start<10000)await new Promise(r=>setTimeout(r,100));
  const result=inspect();assert.equal(result.State.Running,false,'no force kill allowed; retain unknown group instead');assert.notEqual(result.State.ExitCode,137,'no SIGKILL');
 }finally{
  if(cid){const i=JSON.parse(execFileSync('docker',['inspect',cid],{encoding:'utf8'}))[0];if(!i.State.Running)execFileSync('docker',['rm',cid],{stdio:'ignore'});}
 }
});
