// Relay policy unit test: no upstream or real login is represented as passing.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createLocalBrowser} from '../src/local-browser.mjs';
test('same-IP sibling ports cannot load authenticated resources through no-cors elements',async()=>{
 const server=createLocalBrowser({origin:'https://192.168.142.130:8443',cert:Buffer.alloc(0),fingerprint:'0'.repeat(64),browserKey:'unit-policy-only',port:0});
 try{
  await once(server,'listening');const port=server.address().port;
  for(const site of ['same-site','cross-site'])for(const dest of ['image','script','empty']){
   const status=await new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port,path:'/__platform/preview/screenshot?session=unit&name=unit.png',headers:{'Sec-Fetch-Site':site,'Sec-Fetch-Mode':'no-cors','Sec-Fetch-Dest':dest}},reply=>{reply.resume();reply.once('end',()=>resolve(reply.statusCode));});request.once('error',reject);request.setTimeout(5000,()=>request.destroy(Error('timeout')));});
   assert.equal(status,403,site+' '+dest);
  }
 }finally{const closed=once(server,'close');server.shutdown();await closed;}
});
