// Actual default 30-minute lifetime, no clock override or shortened TTL.
import {writeFileSync,existsSync} from 'node:fs';import assert from 'node:assert/strict';
import {login,request,claimPreview} from './delivery-client.mjs';
import {previewWebSocket,ping} from './preview-ws-live.mjs';
const result={status:'IN_PROGRESS',kind:'actual_default_1800_second_credential_expiry',startedAt:new Date().toISOString(),checks:[]};
let cookie,socket,timer;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=()=>writeFileSync('evidence/admin-quota-expiry-live-result.json',JSON.stringify(result,null,2)+'\n');
try {
 cookie=await login();const start=Date.now(),p=await claimPreview(cookie);result.issuedAt=new Date(start).toISOString();result.deadline=new Date(start+1800000).toISOString();output();
 assert.equal((await request('/',{preview:true,previewOrigin:p.origin,cookie:p.cookie})).status,200);
 console.log('Actual 1800-second credential issued; wait for native release signal before opening WS');
 while(!existsSync('runtime/admin-quota-release-ready')){if(Date.now()-start>1500000)throw Error('Release not ready before expiry checkpoint');await sleep(1000);}
 socket=await previewWebSocket(p);let closedAt;socket.once('close',()=>{closedAt=Date.now();});timer=setInterval(()=>{if(!socket.destroyed)ping(socket);},20000);
 while(Date.now()-start<1800000){assert.ok(!socket.destroyed,'WS closed before actual expiry');const elapsed=Date.now()-start;if(Math.floor(elapsed/1000)%60<5)console.log('Actual expiry waiting elapsedSeconds='+Math.floor(elapsed/1000));await sleep(Math.min(5000,1800000-(Date.now()-start)));}
 let status;for(let i=0;i<20;i++){status=(await request('/',{preview:true,previewOrigin:p.origin,cookie:p.cookie})).status;if(status===401)break;await sleep(250);}
 assert.equal(status,401);assert.equal((await request('/__platform/me',{cookie})).status,200,'Parent must remain active so refusal is credential expiry');
 for(let i=0;i<20&&!socket.destroyed;i++)await sleep(250);assert.ok(socket.destroyed,'Expired preview WS was not closed');assert.ok(closedAt>=start+1800000&&closedAt<=start+1800000+6000,'Unexpected WS close time');
 result.status='PASS';result.elapsedMs=Date.now()-start;result.wsClosedAt=new Date(closedAt).toISOString();result.checks=['actual default30min credential refuses HTTP401','parent platform session still active200','previously live WS closed on credential expiry'];console.log('PASS actual default 30-minute credential HTTP and established WS expiry');
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{clearInterval(timer);socket?.destroy();if(cookie)await request('/api/auth/logout',{cookie,method:'POST'});result.finishedAt=new Date().toISOString();output();}
