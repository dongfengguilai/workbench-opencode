import {previewWebSocket} from './preview-ws-live.mjs';
import tls from 'node:tls';import http from 'node:http';import {readFileSync,writeFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';import {request,login,config,claimPreview} from './delivery-client.mjs';
const result={status:'IN_PROGRESS',checks:[]};const u=new URL(config.origin);let c,socket;
try{
 for(let i=0;i<24;i++)await new Promise(resolve=>{const s=tls.connect({host:u.hostname,port:u.port,ca:readFileSync('runtime/tls.crt')});s.on('error',()=>resolve());s.once('secureConnect',()=>{s.write(`GET /__preview/ HTTP/1.1\r\nHost: ${u.host}\r\nOrigin: ${u.origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`);setTimeout(()=>s.destroy(),2)});s.once('close',resolve)});
 assert.equal((await request('/__platform/login')).status,200);result.checks.push('24 real verified TLS upgrade/disconnects do not terminate platform');
 c=await login();const owned=await claimPreview(c),pc=owned.cookie;socket=await previewWebSocket(owned);
 result.checks.push('actual authenticated Vite WebSocket 101 through separate origin and own guard');
 const closed=new Promise((resolve,reject)=>{socket.once('close',resolve);setTimeout(()=>reject(Error('Logout failed to close actual preview WS')),5000).unref()});await request('/api/auth/logout',{method:'POST',cookie:c});await closed;assert.equal((await request('/',{preview:true,previewOrigin:owned.origin,cookie:pc})).status,401);result.checks.push('logout closes established preview WS and revokes subsequent HTTP');
 result.status='PASS';console.log('PASS actual TLS disconnect, Vite WS and logout revoke');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{socket?.destroy();if(c)await request('/api/auth/logout',{method:'POST',cookie:c});writeFileSync(process.argv[2]||'evidence/delivery-transport-live-result.json',JSON.stringify(result,null,2)+'\n')}
