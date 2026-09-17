import https from 'node:https';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import { IntranetAuthClient,sessionDigest,readCookie,InvalidCredentialsError } from './auth.ts';
import {forward,upgrade,error,readBody} from './native-proxy.ts';
import {loadUi,uiPage} from './ui-assets.mjs';
import {checkRequest} from './access-policy.ts';
import {previewPlatform} from './preview-platform.ts';
import {workbenchOrigin,previewOrigin} from './preview-origin.mjs';
import {WorkbenchHandoff} from './workbench-handoff.mjs';
import {sameSecret} from './preview-sessions.mjs';
type User={password:string,displayName:string,enabled:boolean,environment:string,nativePassword:string};
type Config={origin:string,sessionTtl:number,previewRelayKey?:string,users:Record<string,User>};
type Session={user:string,expires:number};
const configPath=process.env.PLATFORM_CONFIG||'/trusted/platform.json';
function config():Config{return JSON.parse(readFileSync(configPath,'utf8'));}
const initial=config();
const origin=new URL(initial.origin);
if(origin.protocol!=='https:')throw new Error('HTTPS origin required');
mkdirSync('/platform-state',{recursive:true});
const sessionFile='/platform-state/sessions.json';
let sessions:Record<string,Session>={};
try{sessions=JSON.parse(readFileSync(sessionFile,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
function persist(){const p=sessionFile+'.tmp';writeFileSync(p,JSON.stringify(sessions),{mode:0o600});renameSync(p,sessionFile);}
const connections=new Map<string,Set<()=>void>>();
function closeSession(hash:string){for(const close of connections.get(hash)||[])close();connections.delete(hash);}
function register(hash:string){return (close:()=>void)=>{let group=connections.get(hash);if(!group){group=new Set();connections.set(hash,group);}group.add(close);return()=>{group!.delete(close);if(!group!.size)connections.delete(hash);};};}
function current(req:any){
 const token=readCookie(req.headers.cookie,'agent_session');if(!token)return;
 const hash=sessionDigest(token);const s=sessions[hash];
 if(!s||s.expires<=Date.now()){closeSession(hash);return;}
 const user=config().users[s.user];if(!user?.enabled){closeSession(hash);return;}
 return {hash,session:s,user,username:s.user};
}
setInterval(()=>{try{const cfg=config();for(const [h,s] of Object.entries(sessions))if(s.expires<=Date.now()||!cfg.users[s.user]?.enabled){closeSession(h);delete sessions[h];persist();}}catch{for(const h of connections.keys())closeSession(h);}},2000).unref();
function json(res:any,status:number,body:any){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
const loginHtml=readFileSync('/public/login.html');
const hostedUi=process.env.PLATFORM_UI==='workbench'?loadUi('/public/workbench-ui'):undefined;
const anonymousAssets:Record<string,string>={'login.css':'text/css','login.js':'application/javascript','theme.js':'application/javascript','logo.svg':'image/svg+xml','logo-dark.svg':'image/svg+xml','favicon.svg':'image/svg+xml'};
const previews=previewPlatform({parent:hash=>{const s=sessions[hash];const user=s&&config().users[s.user];return s&&s.expires>Date.now()&&user?.enabled?{hash,user,username:s.user}:undefined;},register,closeSession,relayKey:()=>config().previewRelayKey||''});
const handoff=new WorkbenchHandoff({current:hash=>{const s=sessions[hash];return s&&s.expires>Date.now()&&config().users[s.user]?.enabled?s:undefined;}});
function browserOrigin(req:any){return sameSecret(req.headers['x-workbench-browser-relay'],config().previewRelayKey||'')?req.headers['x-workbench-browser-origin']:undefined;}
function ownedBrowser(req:any,username:string){const b=browserOrigin(req);return !b||b==='http://127.0.0.1:8444'||b===workbenchOrigin(username);}
const server=https.createServer({key:readFileSync('/trusted/tls.key'),cert:readFileSync('/trusted/tls.crt')},async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 if(req.headers.host!==origin.host){error(res,400,'Unrecognized platform origin');return;}
 const p=new URL(req.url!,origin).pathname;
 if(p.startsWith('/__preview/')){previews.handle(req,res);return;}
 if(!['GET','HEAD'].includes(req.method!)&&req.headers.origin!==origin.origin){error(res,403,'Same-origin request required');return;}
 try{
  if(p==='/__platform/workbench/claim'&&req.method==='GET'){
   const b=browserOrigin(req);const entry=b&&handoff.take(new URL(req.url!,origin).searchParams.get('ticket'),b);
   if(!entry){error(res,401,'Workbench authorization expired or belongs to another origin');return;}
   const session=sessions[entry.hash];const ttl=Math.max(0,Math.floor((session.expires-Date.now())/1000));
   res.writeHead(303,{'Location':entry.path,'Referrer-Policy':'no-referrer','Set-Cookie':`agent_session=${entry.token}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`});res.end();return;
  }
  const publicName=p.startsWith('/__platform/')?p.slice('/__platform/'.length):'';
  if(Object.hasOwn(anonymousAssets,publicName)&&req.method==='GET'){
   res.setHeader('Content-Type',anonymousAssets[publicName]);res.end(readFileSync('/public/'+publicName));return;
  }
  if((p==='/__platform/login'||p==='/api/auth/login')&&req.method==='GET'){
   res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'");res.end(loginHtml);return;
  }
  if(p==='/api/auth/login'&&req.method==='POST'){
   const body=await readBody(req);const cfg=config();const name=typeof body?.username==='string'?body.username.trim():'';const user=cfg.users[name];
   if(!user?.enabled){error(res,401,'Invalid credentials');return;}
   if(!ownedBrowser(req,name)){error(res,403,'Identity belongs to another workbench origin');return;}
   const auth=new IntranetAuthClient({intranetBaseUrl:'',intranetTimeoutSeconds:5,intranetVerifyTls:true,localAdminEnabled:true,localAdminUsername:name,localAdminPassword:user.password,localAdminDisplayName:user.displayName});
   try{await auth.authenticate(name,body.password);}catch(e){error(res,e instanceof InvalidCredentialsError?401:503,'Authentication failed');return;}
   const previous=current(req);if(previous){delete sessions[previous.hash];closeSession(previous.hash);}
   const token=randomBytes(32).toString('base64url');sessions[sessionDigest(token)]={user:name,expires:Date.now()+cfg.sessionTtl*1000};persist();
   res.setHeader('Set-Cookie',`agent_session=${token}; Path=/; Max-Age=${cfg.sessionTtl}; HttpOnly; Secure; SameSite=Lax`);
   json(res,200,{user_id:name,display_name:user.displayName});return;
  }
  if(p==='/api/auth/logout'&&req.method==='POST'){
   const token=readCookie(req.headers.cookie,'agent_session');if(token){const h=sessionDigest(token);delete sessions[h];closeSession(h);persist();}
   res.setHeader('Set-Cookie','agent_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');res.setHeader('Clear-Site-Data','"cache", "storage"');res.writeHead(204);res.end();return;
  }
  const identity=current(req);
  if(!identity){if(req.method==='GET'&&req.headers.accept?.includes('text/html')){res.writeHead(302,{Location:'/__platform/login'});res.end();}else error(res,401,'Authentication required');return;}
  if(!ownedBrowser(req,identity.username)){error(res,403,'Identity belongs to another workbench origin');return;}
  if(browserOrigin(req)==='http://127.0.0.1:8444'&&req.method==='GET'&&req.headers.accept?.includes('text/html')&&uiPage(p)){
   const b=workbenchOrigin(identity.username);const path=req.url!.replace(/^\/server\/[A-Za-z0-9_-]+\/session\//,'/server/'+Buffer.from(b).toString('base64url')+'/session/');res.writeHead(303,{'Location':handoff.issue({token:readCookie(req.headers.cookie,'agent_session'),origin:workbenchOrigin(identity.username),path}),'Referrer-Policy':'no-referrer'});res.end();return;
  }
  const browser=browserOrigin(req);const route=p.match(/^\/server\/([A-Za-z0-9_-]+)\/session\/(ses_[\w-]+)$/);
  if(browser===workbenchOrigin(identity.username)&&req.method==='GET'&&route&&route[1]!==Buffer.from(browser).toString('base64url')){res.writeHead(303,{'Location':'/server/'+Buffer.from(browser).toString('base64url')+'/session/'+route[2]});res.end();return;}
  const opts={target:identity.user.environment,password:identity.user.nativePassword,register:register(identity.hash)};
  if(p==='/__platform/preview/ticket'&&req.method==='POST'){if(new URL(req.url!,origin).search||Object.keys(await readBody(req)||{}).length){error(res,403,'Preview takes no routing arguments');return;}json(res,200,previews.ticket(identity.hash,browserOrigin(req)===workbenchOrigin(identity.username)));return;}
  if(/^\/__platform\/preview\/(status|start|stop|log|verification|screenshot)$/.test(p)){
   const action=p.split('/').pop()!;if(!((['start','stop'].includes(action)&&req.method==='POST')||(!['start','stop'].includes(action)&&req.method==='GET'))){error(res,403,'Fixed preview method required');return;}
   const u=new URL(req.url!,origin);if([...u.searchParams.keys()].some(k=>!['session','name'].includes(k))){error(res,403,'Fixed preview arguments required');return;}
   if(req.method==='POST'&&Object.keys(await readBody(req)||{}).length){error(res,403,'Preview takes no routing arguments');return;}
   const response=await fetch(new URL('/__preview-control/'+action+u.search,opts.target),{method:req.method,headers:{Authorization:'Basic '+Buffer.from('opencode:'+opts.password).toString('base64')},signal:AbortSignal.timeout(20000)});
   const body=Buffer.from(await response.arrayBuffer());res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store'});res.end(body);return;
  }
  if(p==='/__platform/source.zip'&&req.method==='GET'){
   if(new URL(req.url!,origin).search){error(res,403,'Source export takes no routing arguments');return;}
   const response=await fetch(new URL('/__source',opts.target),{headers:{Authorization:'Basic '+Buffer.from('opencode:'+opts.password).toString('base64')},signal:AbortSignal.timeout(60000)});
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store',...(response.ok?{'Content-Disposition':'attachment; filename="WorkBench-source.zip"'}:{})});res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(['/__platform/style.css','/__platform/shell.js','/__platform/workbench-guard.js'].includes(p)&&req.method==='GET'){
   const name=p.split('/').pop()!;res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync('/public/'+name));return;
  }
  if(hostedUi&&req.method==='GET'){
   // The verified fixed native binary implements V1. Unsupported V2 probes
   // must be an actual 404, not its embedded frontend's HTML catch-all.
   if(/^\/api\/(health|reference|session)$/.test(p)){error(res,404,'V2 API unavailable in fixed native server; use native V1 SDK');return;}
   const page=uiPage(p);const asset=hostedUi.get(page?'/index.html':p);
   if(asset){
    if(p==='/index.html'){error(res,403,'Use authorized UI routes');return;}
    if(page){try{checkRequest('GET',new URL(req.url!,origin));}catch{error(res,403,'UI route forbidden');return;}}
    res.setHeader('Content-Type',asset.type);
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; frame-src ${browserOrigin(req)===workbenchOrigin(identity.username)?previewOrigin(identity.username):"'none'"}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    res.end(asset.body);return;
   }
   if(p.startsWith('/assets/')||p==='/manifest.json'||p==='/oc-theme-preload.js'){error(res,404,'Build resource not listed');return;}
  }
  if(p==='/__platform/me'&&req.method==='GET'){
   const health=await fetch(new URL('/global/health',opts.target),{headers:{Authorization:'Basic '+Buffer.from('opencode:'+opts.password).toString('base64')},signal:AbortSignal.timeout(5000)});
   json(res,200,{user_id:identity.username,display_name:identity.user.displayName,project:'workbench-opencode',directory:'/workspace/project',ready:health.ok,project_url:'/L3dvcmtzcGFjZS9wcm9qZWN0/session'});return;
  }
  if(['/__platform/download','/__platform/changes'].includes(p)&&req.method==='GET'){
   const response=await fetch(new URL('/__export',opts.target),{headers:{Authorization:'Basic '+Buffer.from('opencode:'+opts.password).toString('base64')},signal:AbortSignal.timeout(60000)});
   if(!response.ok){error(res,response.status,(await response.json() as any).detail||'Export failed');return;}
   const result=await response.json() as any;
   if(p.endsWith('/changes'))json(res,200,{baseline:result.baseline,files:result.files});
   else{res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="workbench-opencode.patch"'});res.end(result.patch);}
   return;
  }
  await forward(req,res,{...opts,html:html=>html.replace('</head>','<link rel="stylesheet" href="/__platform/style.css"><script defer src="/__platform/shell.js"></script></head>')});
 }catch{error(res,503,'Platform or environment unavailable; task outcome must be checked before resubmission');}
});
server.on('upgrade',(req,socket,head)=>{
 if(req.headers.host===origin.host&&req.url?.startsWith('/__preview/')){previews.upgrade(req,socket,head);return;}
 try{const identity=current(req);if(!identity||!ownedBrowser(req,identity.username)||req.headers.origin!==origin.origin||req.headers.host!==origin.host){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
 upgrade(req,socket,head,{target:identity.user.environment,password:identity.user.nativePassword,register:register(identity.hash)});
 }catch{socket.destroy();}
});
// Upgraded/rejected WebSocket clients may reset TLS before proxy setup finishes.
// A transport reset closes that connection, never the shared platform process.
server.on('secureConnection',socket=>socket.on('error',()=>socket.destroy()));
server.listen(8443,'0.0.0.0',()=>console.log('OpenCode Cloud HTTPS platform listening'));
