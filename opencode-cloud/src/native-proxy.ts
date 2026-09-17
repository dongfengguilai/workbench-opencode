import http from 'node:http';
import { checkRequest,redactConfig,directory } from './access-policy.ts';
import { realpath,lstat } from 'node:fs/promises';
import path from 'node:path';
// Admission only: native status and message records remain the source of truth.
const admissions=new Set<string>();
const submitted=new Map<string,Set<string>>();
export function error(res:http.ServerResponse,status:number,message:string) {
 if(res.headersSent){res.destroy();return;}
 res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({detail:message}));
}
export async function readBody(req:http.IncomingMessage) {
 let size=0;const chunks:Buffer[]=[];
 for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw new Error('Request too large');chunks.push(chunk);}
 const buffer=Buffer.concat(chunks);
 if(!buffer.length)return undefined;
 return JSON.parse(buffer.toString());
}
export async function verifyPaths(url:URL,body:any) {
 const paths:string[]=[];
 const p=url.searchParams.get('path');if(p)paths.push(p);
 for(const part of body?.parts||[])if(part.url?.startsWith('file:'))paths.push(decodeURIComponent(new URL(part.url).pathname));
 for(const value of paths) {
  const absolute=path.resolve(directory,value);
  let segment=directory;
  for(const part of path.relative(directory,absolute).split('/').filter(Boolean)) {
   segment=path.join(segment,part);
   try{if((await lstat(segment)).isSymbolicLink())throw new Error('File API symlinks forbidden');}
   catch(e:any){if(e.code!=='ENOENT')throw e;}
  }
  try {
   const resolved=await realpath(absolute);
   if(resolved!==directory&&!resolved.startsWith(directory+'/'))throw new Error('Path escapes authorized project');
  }catch(e:any){if(e.code!=='ENOENT')throw e;}
 }
}
export async function forward(req:http.IncomingMessage,res:http.ServerResponse,opts:{target:string,password:string,register?:(close:()=>void)=>()=>void,html?:(body:string)=>string,checkFiles?:boolean,busy?:boolean}) {
 const url=new URL(req.url!,'http://fixed');
 let body:any;
 try {body=await readBody(req);checkRequest(req.method!,url,body);if(opts.checkFiles)await verifyPaths(url,body);}
 catch(e:any){error(res,403,e.message);return;}
 const authorization='Basic '+Buffer.from('opencode:'+opts.password).toString('base64');
 let release=()=>{};
 if(opts.busy&&req.method==='POST'&&/^\/session\/[^/]+\/(message|prompt_async|shell)$/.test(url.pathname)) {
  const session=url.pathname.split('/')[2];
  if(admissions.has(opts.target)){error(res,409,'A native submission is being checked; inspect its message before retrying');return;}
  if(!/^msg_[\w-]+$/.test(body?.messageID||'')){error(res,400,'A native messageID is required for outcome verification');return;}
  if(submitted.get(opts.target)?.has(body.messageID)){error(res,409,'This message was submitted; check native outcome instead of resending');return;}
  admissions.add(opts.target);let released=false;release=()=>{if(!released){released=true;admissions.delete(opts.target);}};
  try {
   const existing=await fetch(new URL('/session/'+session+'/message/'+body.messageID+'?directory='+encodeURIComponent(directory),opts.target),{headers:{Authorization:authorization},signal:AbortSignal.timeout(5000)});
   if(existing.ok){release();error(res,409,'This native message already exists; check its outcome instead of resubmitting');return;}
   if(existing.status!==404)throw new Error('message outcome unavailable');
   const response=await fetch(new URL('/session/status?directory='+encodeURIComponent(directory),opts.target),{headers:{Authorization:authorization},signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw new Error('state unavailable');
   const states=await response.json() as Record<string,any>;
   if(Object.values(states).some(s=>s.type!=='idle')){release();error(res,409,'Environment is busy with a native task; stop or finish it before another submission');return;}
  }catch{release();error(res,503,'Native task state unavailable; not submitted');return;}
 }
 if(opts.busy&&req.method==='POST'&&/^\/session\/[^/]+\/(message|prompt_async|shell)$/.test(url.pathname)){
  let ids=submitted.get(opts.target);if(!ids){ids=new Set();submitted.set(opts.target,ids);}
  if(ids.size>=10000){release();error(res,409,'Submission admission cache is full; maintainer restart required after checking native outcomes');return;}
  ids.add(body.messageID);
 }
 const payload=body===undefined?undefined:Buffer.from(JSON.stringify(body));
 const ticketHeaders=url.pathname.endsWith('/connect-token')&&req.headers['x-opencode-ticket']==='1'?{Origin:new URL(opts.target).origin,'x-opencode-ticket':'1'}:{};
 const upstream=http.request(new URL(url.pathname+url.search,opts.target),{method:req.method,headers:{Authorization:authorization,Accept:req.headers.accept||'*/*',...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{}),...ticketHeaders,'x-opencode-directory':directory}},async response=>{
  // Native prompt_async acknowledges before its job becomes visible. Keep this
  // admission exclusive until native reports busy or a settled assistant reply.
  if(opts.busy&&req.method==='POST'&&url.pathname.endsWith('/prompt_async')&&response.statusCode===204){
   let confirmed=false;const sid=url.pathname.split('/')[2];
   try{for(let i=0;i<40;i++){
    const state=await fetch(new URL('/session/status?directory='+encodeURIComponent(directory),opts.target),{headers:{Authorization:authorization},signal:AbortSignal.timeout(2000)});
    if(!state.ok)throw new Error('state unavailable');
    if(Object.values(await state.json() as Record<string,any>).some(s=>s.type!=='idle')){confirmed=true;break;}
    const m=await fetch(new URL('/session/'+sid+'/message?directory='+encodeURIComponent(directory),opts.target),{headers:{Authorization:authorization},signal:AbortSignal.timeout(2000)});
    if(!m.ok)throw new Error('message unavailable');const list=await m.json() as any[];
    const at=list.findIndex(m=>m.info?.id===body.messageID);
    if(at>=0&&list.slice(at+1).some(m=>m.info?.role==='assistant'&&(m.info.error||m.info.time?.completed))){confirmed=true;break;}
    await new Promise(r=>setTimeout(r,250));
   }}catch{}
   if(!confirmed){release();response.resume();error(res,503,'Native admission outcome uncertain; check the original message, do not resubmit');return;}
  }
  response.once('end',release);response.once('close',release);
  if(response.headers.location){error(res,502,'Unexpected upstream redirect');response.resume();return;}
  const type=String(response.headers['content-type']||'application/octet-stream');
  const headers:Record<string,string>={'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'};
  if(response.headers['content-security-policy'])headers['Content-Security-Policy']=String(response.headers['content-security-policy']).replace(/connect-src[^;]*/,"connect-src 'self' data: blob:");
  const metadata=/^\/(global\/config|config(?:\/providers)?|provider(?:\/auth)?)$/.test(url.pathname)&&type.includes('json');
  if(metadata||(opts.html&&type.includes('text/html'))) {
   const chunks:Buffer[]=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){upstream.destroy();error(res,502,'Oversized native metadata');}else chunks.push(chunk);});
   response.on('end',()=>{
    try {const text=Buffer.concat(chunks).toString();const result=metadata?JSON.stringify(redactConfig(JSON.parse(text))):opts.html!(text);res.writeHead(response.statusCode||502,headers);res.end(result);}
    catch{error(res,502,'Invalid native metadata');}
   });
  }else {res.writeHead(response.statusCode||502,headers);response.pipe(res);}
  response.on('error',()=>res.destroy());
 });
 const unregister=opts.register?.(()=>{upstream.destroy();res.destroy();});
 res.once('close',()=>{release();unregister?.();upstream.destroy();});
 upstream.on('error',()=>{release();error(res,503,'Native environment unavailable; outcome must be checked before resubmission');});
 upstream.setTimeout(360000,()=>upstream.destroy());
 upstream.end(payload);
}
export function upgrade(req:http.IncomingMessage,socket:any,head:Buffer,opts:{target:string,password:string,register?:(close:()=>void)=>()=>void}) {
 const url=new URL(req.url!,'http://fixed');
 try{checkRequest('GET',url,undefined,true);}catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
 const request=http.request(new URL(url.pathname+url.search,opts.target),{headers:{Authorization:'Basic '+Buffer.from('opencode:'+opts.password).toString('base64'),Origin:new URL(opts.target).origin,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Key':req.headers['sec-websocket-key']!,'Sec-WebSocket-Version':'13','x-opencode-directory':directory}});
 request.on('upgrade',(response,target,upstreamHead)=>{
  const headers=['HTTP/1.1 101 Switching Protocols','Connection: Upgrade','Upgrade: websocket','Sec-WebSocket-Accept: '+response.headers['sec-websocket-accept']];
  socket.write(headers.join('\r\n')+'\r\n\r\n');if(upstreamHead.length)socket.write(upstreamHead);if(head.length)target.write(head);
  target.pipe(socket);socket.pipe(target);
  const off=opts.register?.(()=>{target.destroy();socket.destroy();});
  socket.on('close',()=>{off?.();target.destroy();});target.on('close',()=>socket.destroy());target.on('error',()=>socket.destroy());socket.on('error',()=>target.destroy());
 });
 request.on('response',r=>{socket.end('HTTP/1.1 '+r.statusCode+' Rejected\r\nConnection: close\r\n\r\n');r.resume();});
 request.on('error',()=>socket.destroy());socket.once('close',()=>request.destroy());request.end();
}
