// Local protocol/boundary fixtures only; NOT real NetID login acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {IntranetAuthClient,IntranetAuthUnavailableError} from '../src/auth.ts';
import {configureOrigins,workbenchOrigin,previewOrigin} from '../src/preview-origin.mjs';
test('formal origins are maintained, separate, and never fall back for an unknown identity',()=>{
 try{
  configureOrigins({'mj33kd':{workbench:'https://10.243.117.57:8443',preview:'https://10.243.117.57:8445'}});
  assert.equal(workbenchOrigin('mj33kd'),'https://10.243.117.57:8443');
  assert.equal(previewOrigin('mj33kd'),'https://10.243.117.57:8445');
  assert.throws(()=>previewOrigin('other'));
  assert.throws(()=>configureOrigins({mj33kd:{workbench:'http://10.243.117.57',preview:'https://10.243.117.57'}}));
  assert.throws(()=>configureOrigins({mj33kd:{workbench:'https://10.243.117.57',preview:'https://10.243.117.57'}}));
 }finally{configureOrigins();}
});
test('NetID-only adapter sends the old protocol and rejects an absent real subject',async()=>{
 const options={intranetBaseUrl:'http://10.132.17.137:44327',intranetTimeoutSeconds:10,intranetVerifyTls:true,localAdminEnabled:false,localAdminUsername:'mj33kd',localAdminPassword:'unused-local-fixture',localAdminDisplayName:'unused',requireExplicitSubject:true};
 for(const payload of [{name:'mj33kd',displayName:'NetID'},{}]){
  const client=new IntranetAuthClient(options,async(url,body)=>{
   assert.equal(url.href,'http://10.132.17.137:44327/api/app/user/login');
   assert.deepEqual(body,{userName:'mj33kd',password:'unit-protocol-fixture'});
   return {status:200,body:Buffer.from(JSON.stringify({code:200,data:{token:'fixture.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.fixture'}}))};
  });
  if(payload.name)assert.equal((await client.authenticate('mj33kd','unit-protocol-fixture')).provider,'intranet');
  else await assert.rejects(client.authenticate('mj33kd','unit-protocol-fixture'),IntranetAuthUnavailableError);
 }
});
