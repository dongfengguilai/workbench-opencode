import {PreviewSessions,sameSecret} from './preview-sessions.mjs';
import {previewProxy,previewUpgrade} from './preview-proxy.mjs';
import {readCookie} from './auth.ts';
import {error} from './native-proxy.ts';
import {previewOrigin,workbenchOrigin,formalOrigins} from './preview-origin.mjs';
export function previewPlatform({parent,register,closeSession,relayKey}:{parent:(hash:string)=>any,register:(hash:string)=>any,closeSession:(hash:string)=>void,relayKey:()=>string}){
 const access=new PreviewSessions({parent,close:(key:string)=>closeSession('preview:'+key)});
 setInterval(()=>access.sweep(),1000).unref();
 const local='http://localhost:8445';
 function identity(req:any){if(!sameSecret(req.headers['x-workbench-preview-relay'],relayKey()))return;const id=access.current(readCookie(req.headers.cookie,'workbench_preview'));return id&&req.headers['x-workbench-preview-origin']===previewOrigin(id.username)?id:undefined;}
 function registrations(req:any,id:any){return (close:()=>void)=>{const a=register(id.hash)(close);const b=register(access.connectionKey(readCookie(req.headers.cookie,'workbench_preview')))(close);return()=>{a();b();};};}
 function appPath(req:any){const p=req.url.slice('/__preview'.length);if(!p.startsWith('/')||p.startsWith('//')||/^\/(?:__platform|api\/auth)(?:\/|$)/.test(p))throw Error('Preview namespace only');return '/__preview-app'+p;}
 return {
  ticket(hash:string,embedded=false){const id=parent(hash);return {url:((embedded||formalOrigins())?previewOrigin(id.username):local)+'/__workbench/claim?ticket='+access.issue(hash),expiresIn:30};},
  handle(req:any,res:any){
   if(!sameSecret(req.headers['x-workbench-preview-relay'],relayKey())){error(res,403,'Owned loopback preview relay required');return;}
   const url=new URL(req.url,'http://fixed');
   if(url.pathname==='/__preview/__workbench/claim'&&req.method==='GET'){
    const pending=access.ticketIdentity(url.searchParams.get('ticket'));
    if(pending&&req.headers['x-workbench-preview-origin']===local){
     const entry=access.takeTicket(url.searchParams.get('ticket'));
     if(!entry){error(res,401,'Preview parent expired');return;}
     res.writeHead(303,{'Location':previewOrigin(pending.username)+'/__workbench/claim?ticket='+access.issue(entry.hash),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;
    }
    if(pending&&req.headers['x-workbench-preview-origin']!==previewOrigin(pending.username)){error(res,401,'Preview ticket belongs to another origin');return;}
    const token=access.claim(url.searchParams.get('ticket'));
    if(!token){error(res,401,'Preview ticket expired or already used; reopen from WorkBench');return;}
    res.writeHead(303,{'Location':'/','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':`workbench_preview=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`});res.end();return;
   }
   const id=identity(req);if(!id){error(res,401,'Preview authorization expired; reopen from WorkBench');return;}
   try{previewProxy(req,res,{target:id.user.environment,pathname:appPath(req),password:id.user.nativePassword,register:registrations(req,id),frameAncestor:workbenchOrigin(id.username)});}catch{error(res,403,'Preview namespace only');}
  },
  upgrade(req:any,socket:any,head:Buffer){const id=identity(req);if(!id){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}try{previewUpgrade(req,socket,head,{target:id.user.environment,pathname:appPath(req),password:id.user.nativePassword,register:registrations(req,id)});}catch{socket.destroy();}}
 };
}
