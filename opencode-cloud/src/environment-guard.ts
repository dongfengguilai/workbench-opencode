import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {forward,upgrade,error} from './native-proxy.ts';
import {exportPatch} from './patch-export.ts';
import {exportSource} from './source-export.ts';
import {previewRuntime} from './preview-runtime.ts';
import {previewProxy,previewUpgrade} from './preview-proxy.mjs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const password=process.env.OPENCODE_SERVER_PASSWORD;
const baseline=process.env.PROJECT_BASELINE;
if(!password||!baseline)throw new Error('Missing instance secrets or fixed project baseline');
function authorized(req:http.IncomingMessage) {
 const a=Buffer.from(req.headers.authorization||'');const b=Buffer.from('Basic '+Buffer.from('opencode:'+password).toString('base64'));
 return a.length===b.length&&timingSafeEqual(a,b);
}
const target='http://127.0.0.1:4030';
const preview=previewRuntime('Basic '+Buffer.from('opencode:'+password).toString('base64'));
let exporting=false;
const server=http.createServer(async(req,res)=>{
 if(!authorized(req)){error(res,401,'Instance authentication required');return;}
 if(req.url?.startsWith('/__preview-app/')){previewProxy(req,res,{target:'http://127.0.0.1:5173',pathname:req.url.slice('/__preview-app'.length)});return;}
 if(req.url?.startsWith('/__preview-control/')){
  try{const p=new URL(req.url,'http://fixed');const action=p.pathname.slice('/__preview-control/'.length);
   if(action==='screenshot'&&req.method==='GET'){const png=await preview.screenshot(p.searchParams.get('session')||'',p.searchParams.get('name')||'');res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(png);return;}
   const result=action==='status'&&req.method==='GET'?await preview.status():action==='start'&&req.method==='POST'?await preview.start():action==='stop'&&req.method==='POST'?await preview.stop():action==='log'&&req.method==='GET'?{output:await preview.log()}:action==='verification'&&req.method==='GET'?await preview.verification(p.searchParams.get('session')||''):undefined;
   if(result===undefined){error(res,403,'Fixed preview action required');return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
  }catch(e:any){error(res,409,e.message);}return;
 }
 if(['/__export','/__source'].includes(req.url||'')&&req.method==='GET'){
  if(exporting){error(res,409,'Another export is in progress');return;}
  exporting=true;
  let temporary:string|undefined;
  try{
   const status=await fetch(target+'/session/status?directory=/workspace/project',{headers:{Authorization:req.headers.authorization!},signal:AbortSignal.timeout(5000)});
   if(!status.ok)throw new Error('Native state unavailable');
   if(Object.keys(await status.json()).length){error(res,409,'Stop or finish the native task before exporting');return;}
   temporary=await mkdtemp(path.join(tmpdir(),'cloud-export-'));
   await mkdir(path.join(temporary,'objects'));
   process.env.GIT_OBJECT_DIRECTORY=path.join(temporary,'objects');
   process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES='/workspace/project/.git/objects';
   process.env.GIT_LITERAL_PATHSPECS='1';
   const source=req.url==='/__source';
   const result=source?await exportSource({directory:'/workspace/project',baseline,secrets:[password,process.env.ENV_MODEL_TOKEN||'']}):await exportPatch({directory:'/workspace/project',baseline});
   delete process.env.GIT_OBJECT_DIRECTORY;delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;delete process.env.GIT_LITERAL_PATHSPECS;
   await rm(temporary,{recursive:true,force:true});temporary=undefined;exporting=false;
   res.writeHead(200,{'Content-Type':source?'application/zip':'application/json','Cache-Control':'no-store'});res.end(source?(result as any).zip:JSON.stringify(result));
  }catch(e:any){error(res,409,e.message);}
  finally{delete process.env.GIT_OBJECT_DIRECTORY;delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;delete process.env.GIT_LITERAL_PATHSPECS;if(temporary)await rm(temporary,{recursive:true,force:true});exporting=false;}
  return;
 }
 await forward(req,res,{target,password,checkFiles:true,busy:true});
});
server.on('upgrade',(req,socket,head)=>{if(!authorized(req)){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}if(req.url?.startsWith('/__preview-app/')){previewUpgrade(req,socket,head,{target:'http://127.0.0.1:5173',pathname:req.url.slice('/__preview-app'.length)});return;}upgrade(req,socket,head,{target,password});});
server.listen(4096,'0.0.0.0',()=>console.log('fixed native environment guard listening'));
