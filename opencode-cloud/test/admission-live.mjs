import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {login,request} from './live-client.mjs';
const cookie=await login('admin');let sid;const result={status:'IN_PROGRESS'};
try{
 const created=await request('/session',{method:'POST',body:{title:'A08 duplicate admission controlled test'},cookie});assert.equal(created.status,200);sid=JSON.parse(created.body).id;
 const messageID='msg_'+randomBytes(16).toString('hex');const body={messageID,model:{providerID:'approved',modelID:'gpt-5.6-luna'},parts:[{type:'text',text:'Run exactly sleep 120 with Bash, without writing any file. This harmless task tests duplicate submission and stop.'}]};
 const r=await Promise.all([request('/session/'+sid+'/prompt_async',{method:'POST',body,cookie}),request('/session/'+sid+'/prompt_async',{method:'POST',body,cookie})]);result.duplicateStatuses=r.map(x=>x.status);result.session=sid;result.message=messageID;
 const cr=await request('/session',{method:'POST',body:{title:'A08 blocked second top task'},cookie});const sid2=JSON.parse(cr.body).id;
 result.secondTopStatus=(await request('/session/'+sid2+'/prompt_async',{method:'POST',cookie,body:{messageID:'msg_'+randomBytes(16).toString('hex'),parts:[{type:'text',text:'Report no work; do not write files.'}]}})).status;
 assert.deepEqual(result.duplicateStatuses.sort(),[204,409]);assert.equal(result.secondTopStatus,409);result.status='PASS';console.log('PASS duplicate admission and second top task denied');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{const st=await request('/session/status',{cookie});if(st.status===200)for(const id of Object.keys(JSON.parse(st.body)))await request('/session/'+id+'/abort',{method:'POST',cookie});writeFileSync('evidence/a08-admission-result.json',JSON.stringify(result,null,2));}
