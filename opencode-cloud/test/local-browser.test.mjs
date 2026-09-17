import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createLocalBrowser} from '../src/local-browser.mjs';

// These transport tests use the running real platform, never a replacement server.
const cert=readFileSync(new URL('../runtime/tls.crt',import.meta.url));
const origin='https://192.168.142.130:8443';
async function relay(extra={}) {
 const server=createLocalBrowser({origin,cert,port:0,...extra});await once(server,'listening');return server;
}
async function request(server,{method='GET',path='/__platform/login',headers={}}={}) {
 return await new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,method,path,headers},response=>{
   let body='';response.on('data',part=>body+=part);response.on('end',()=>resolve({status:response.statusCode,body}));
  });req.on('error',reject);req.end();
 });
}
test('real verified platform loads; anonymous project stays protected',async()=>{
 const server=await relay();try {
  assert.equal(server.address().address,'127.0.0.1');
  const result=await request(server);assert.equal(result.status,200);assert.match(result.body,/OpenCode Cloud/);
  assert.equal((await request(server,{path:'/__platform/me'})).status,401);
 }finally{server.shutdown();}
});
test('wrong Host, external Origin, cross-site, missing write Origin and absolute target refused',async()=>{
 const server=await relay();try {
  for(const input of [{headers:{Host:'evil.example'}},{headers:{Origin:'https://evil.example'}},{headers:{'Sec-Fetch-Site':'cross-site'}},{method:'POST',path:'/api/auth/login'},{path:'https://evil.example/'},{path:'//evil.example/'}])
   assert.equal((await request(server,input)).status,403);
 }finally{server.shutdown();}
});
test('CONNECT and forged WebSocket origin refused',async()=>{
 const server=await relay();try {
  for(const verb of ['CONNECT','GET']) {
   const result=await new Promise((resolve,reject)=>{
    const socket=net.connect(server.address().port,'127.0.0.1',()=>socket.write(`${verb} /pty/fake/connect HTTP/1.1\r\nHost: 127.0.0.1:${server.address().port}\r\nOrigin: https://evil.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
    socket.on('data',data=>{resolve(data.toString());socket.destroy();});socket.on('error',reject);
   });assert.match(result,verb==='CONNECT'?/405/:/403/);
  }
 }finally{server.shutdown();}
});
test('wrong fingerprint cannot connect to real platform',async()=>{
 const server=await relay({fingerprint:'0'.repeat(64)});try{assert.equal((await request(server)).status,503);}finally{server.shutdown();}
});
test('untrusted CA cannot connect to real platform',async()=>{
 const wrongCA=readFileSync('/etc/ssl/certs/ISRG_Root_X1.pem');
 const server=await relay({cert:wrongCA});try{assert.equal((await request(server)).status,503);}finally{server.shutdown();}
});
