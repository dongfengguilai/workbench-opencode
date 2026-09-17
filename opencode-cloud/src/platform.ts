import https from 'node:https';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import { IntranetAuthClient,sessionDigest,readCookie,InvalidCredentialsError } from './auth.ts';
import {forward,upgrade,error,readBody} from './native-proxy.ts';
type User={password:string,displayName:string,enabled:boolean,environment:string,nativePassword:string};
type Config={origin:string,sessionTtl:number,users:Record<string,User>};
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
const loginHtml=`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenCode Cloud · 登录</title><link rel="stylesheet" href="/__platform/style.css"><main><h1>OpenCode Cloud</h1><p>登录后进入本人的独立云端项目。</p><form id="login"><label>账号<input name="username" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button>进入工作台</button><p id="error" role="alert"></p></form><small>代码、提示词和工具输出会发送到批准的 luna 模型。项目与会话保存在本人的云端环境。</small></main><script src="/__platform/login.js"></script></html>`;
const server=https.createServer({key:readFileSync('/trusted/tls.key'),cert:readFileSync('/trusted/tls.crt')},async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 if(req.headers.host!==origin.host){error(res,400,'Unrecognized platform origin');return;}
 const p=new URL(req.url!,origin).pathname;
 if(!['GET','HEAD'].includes(req.method!)&&req.headers.origin!==origin.origin){error(res,403,'Same-origin request required');return;}
 try{
  if(['/__platform/style.css','/__platform/login.js','/__platform/shell.js'].includes(p)&&req.method==='GET'){
   const name=p.split('/').pop()!;res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync('/public/'+name));return;
  }
  if((p==='/__platform/login'||p==='/api/auth/login')&&req.method==='GET'){
   res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'");res.end(loginHtml);return;
  }
  if(p==='/api/auth/login'&&req.method==='POST'){
   const body=await readBody(req);const cfg=config();const name=typeof body?.username==='string'?body.username.trim():'';const user=cfg.users[name];
   if(!user?.enabled){error(res,401,'Invalid credentials');return;}
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
  const opts={target:identity.user.environment,password:identity.user.nativePassword,register:register(identity.hash)};
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
 try{const identity=current(req);if(!identity||req.headers.origin!==origin.origin||req.headers.host!==origin.host){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
 upgrade(req,socket,head,{target:identity.user.environment,password:identity.user.nativePassword,register:register(identity.hash)});
 }catch{socket.destroy();}
});
server.listen(8443,'0.0.0.0',()=>console.log('OpenCode Cloud HTTPS platform listening'));
