// Protocol fixtures are not real NetID acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync,randomBytes} from 'node:crypto';
import {authenticateAccount,validateAccount} from '../src/identity-auth.ts';
import {InvalidCredentialsError,IntranetAuthUnavailableError} from '../src/auth.ts';
import {configureOrigins} from '../src/preview-origin.mjs';
const salt=randomBytes(16),secret='local-auth-unit-fixture';
const hash='scrypt$32768$8$1$'+salt.toString('hex')+'$'+scryptSync(secret,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
const admin={authProvider:'local-admin',role:'admin',displayName:'Admin',passwordHash:hash};
const engineer={authProvider:'netid',role:'engineer',displayName:'Engineer'};
test('administrator succeeds locally and wrong password never calls NetID',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('must not be called')};
 assert.equal((await authenticateAccount('admin',secret,admin,'http://unused',request)).provider,'local-admin');
 await assert.rejects(authenticateAccount('admin','wrong',admin,'http://unused',request),InvalidCredentialsError);
 assert.equal(calls,0);
});
test('NetID requires exact verified subject and never uses local credentials',async()=>{
 for(const payload of [{name:'mj33kd'},{name:'other'},{}]){
  let calls=0;const request=async(url,body)=>{calls++;assert.equal(body.userName,'mj33kd');return {status:200,body:Buffer.from(JSON.stringify({code:200,data:{token:'fixture.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.fixture'}}))}};
  const result=authenticateAccount('mj33kd','netid-unit-fixture',engineer,'http://unit.test',request);
  if(payload.name==='mj33kd')assert.equal((await result).provider,'intranet');else await assert.rejects(result);
  assert.equal(calls,1);
 }
 await assert.rejects(authenticateAccount('mj33kd',secret,engineer,'http://unit.test',async()=>{throw new IntranetAuthUnavailableError('unavailable')}),IntranetAuthUnavailableError);
});
test('invalid hash, mixed credentials and account collisions fail closed',()=>{
 assert.throws(()=>validateAccount('admin',{...admin,passwordHash:'scrypt$999999999$8$1$bad$bad'}));
 assert.throws(()=>validateAccount('admin',{...admin,password:'not allowed'}));
 assert.throws(()=>validateAccount('mj33kd',{...engineer,passwordHash:hash}));
 assert.throws(()=>validateAccount('mj33kd',admin));
 const a={workbench:'https://10.243.117.57:8443',preview:'https://10.243.117.57:8445'};
 try{
  assert.throws(()=>configureOrigins({a,b:a}));
  assert.throws(()=>configureOrigins({a,b:{workbench:'https://10.243.117.57:9443',preview:'https://10.243.117.57:9445'}}));
  assert.throws(()=>configureOrigins({a,b:{workbench:'https://admin.workbench.internal:8443',preview:'https://10.243.117.57:9445'}}));
  configureOrigins({mj33kd:a,admin:{workbench:'https://admin.workbench.internal:8443',preview:'https://preview.admin.workbench.internal:8445'}});
 }finally{configureOrigins()}
});
