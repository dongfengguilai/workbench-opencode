import {readFileSync,writeFileSync} from 'node:fs';import {request} from './delivery-client.mjs';
const kind=process.argv[2],s=JSON.parse(readFileSync('runtime/sidebar-preview-'+kind+'-submission.json'));let observed=false;
for(let i=0;i<180;i++){
 const r=await request('/session/'+s.sid+'/message',{cookie:s.cookie});if(r.status!==200)throw Error('Native messages inaccessible '+r.status);const m=r.json(),start=m.findIndex(x=>x.info.id===s.body.messageID);const scoped=start<0?[]:m.slice(start);writeFileSync('evidence/sidebar-preview-'+kind+'-native-messages.json',JSON.stringify(scoped,null,2)+'\n');
 const statuses=await request('/session/status',{cookie:s.cookie});if(statuses.status!==200)throw Error('Native state inaccessible');const busy=statuses.json()[s.sid]?.type&&statuses.json()[s.sid].type!=='idle';if(busy)observed=true;
 if(scoped.some(x=>x.info.role==='assistant'&&x.info.time?.completed)&&!busy){const tools=scoped.flatMap(x=>x.parts||[]).filter(p=>p.type==='tool');writeFileSync('evidence/sidebar-preview-'+kind+'-native-result.json',JSON.stringify({status:scoped.some(x=>x.info.error)?'FAIL_NATIVE_ERROR':'TASK_COMPLETED_REQUIRES_ASSERTIONS',session:s.sid,observedBusy:observed,tools:tools.map(p=>({tool:p.tool,state:p.state.status,command:p.state.input?.command,exit:p.state.metadata?.exit??null,error:p.state.error})),model:'approved/Qwen3.6-35B-A3B'},null,2)+'\n');console.log('Native task finished',s.sid);process.exit(0)}
 await new Promise(r=>setTimeout(r,2000));
}throw Error('Native task did not finish within observation window');
