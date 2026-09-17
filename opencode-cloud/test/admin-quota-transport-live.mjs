import tls from 'node:tls';import {readFileSync,writeFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {request,login,claimPreview,config} from './delivery-client.mjs';import {previewWebSocket} from './preview-ws-live.mjs';
const result={status:'IN_PROGRESS',checks:[]},cfgFile='runtime/platform.json',original=readFileSync(cfgFile,'utf8');let cookie,socket;
try {
 const u=new URL(config.origin);
 for(let i=0;i<24;i++)await new Promise(resolve=>{const s=tls.connect({host:u.hostname,port:u.port,ca:readFileSync('runtime/tls.crt')});s.on('error',resolve);s.once('secureConnect',()=>{s.write(`GET /__preview/ HTTP/1.1\r\nHost: ${u.host}\r\nOrigin: ${u.origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`);setTimeout(()=>s.destroy(),2)});s.once('close',resolve)});
 assert.equal((await request('/__platform/login')).status,200);result.checks.push('24 actual verified TLS aborts do not terminate platform');
 for(const [name,mode] of [['admin','logout'],['trial-b','disable']]) {
  cookie=await login(name);const preview=await claimPreview(cookie);socket=await previewWebSocket(preview);
  const closed=new Promise((resolve,reject)=>{socket.once('close',resolve);setTimeout(()=>reject(Error('Revocation failed to close actual WS')),5000).unref();});
  if(mode==='logout')await request('/api/auth/logout',{cookie,method:'POST'});else{const c=JSON.parse(original);c.users[name].enabled=false;writeFileSync(cfgFile,JSON.stringify(c,null,2)+'\n');}
  await closed;assert.equal((await request('/',{preview:true,previewOrigin:preview.origin,cookie:preview.cookie})).status,401);
  writeFileSync(cfgFile,original);result.checks.push(name+' actual owned Vite WS101; '+mode+' closes established WS and rejects HTTP401');socket.destroy();socket=undefined;
  await request('/api/auth/logout',{cookie,method:'POST'});cookie=undefined;
 }
 result.status='PASS';console.log('PASS actual TLS, both owned WS origins, logout and disable revocation');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{writeFileSync(cfgFile,original);socket?.destroy();if(cookie)await request('/api/auth/logout',{cookie,method:'POST'});writeFileSync('evidence/admin-quota-transport-result.json',JSON.stringify(result,null,2)+'\n');}
