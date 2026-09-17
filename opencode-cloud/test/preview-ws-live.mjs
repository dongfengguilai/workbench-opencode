import http from 'node:http';import {randomBytes} from 'node:crypto';
import {request} from './delivery-client.mjs';
export async function previewWebSocket(preview){
 const client=await request('/@vite/client',{preview:true,previewOrigin:preview.origin,cookie:preview.cookie});if(client.status!==200)throw Error('Actual Vite client unavailable');
 const token=client.text.match(/const wsToken = "([^"]+)"/)?.[1];if(!token)throw Error('Actual Vite WS token missing');
 return new Promise((resolve,reject)=>{
  const r=http.request({hostname:'127.0.0.1',port:8445,path:'/?token='+encodeURIComponent(token),headers:{Host:new URL(preview.origin).host,Origin:preview.origin,Cookie:preview.cookie,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':randomBytes(16).toString('base64'),'Sec-WebSocket-Protocol':'vite-hmr'}});
  r.on('upgrade',(response,socket)=>{if(response.statusCode!==101){socket.destroy();reject(Error('WS status '+response.statusCode));return;}socket.on('error',()=>{});socket.resume();resolve(socket);});
  r.on('response',s=>{s.resume();reject(Error('WS rejected '+s.statusCode));});r.on('error',reject);r.setTimeout(10000,()=>r.destroy(Error('WS timeout')));r.end();
 });
}
export function ping(socket){const data=Buffer.from('{"type":"ping"}'),mask=randomBytes(4),frame=Buffer.alloc(6+data.length);frame[0]=0x81;frame[1]=0x80|data.length;mask.copy(frame,2);for(let i=0;i<data.length;i++)frame[6+i]=data[i]^mask[i%4];socket.write(frame);}
