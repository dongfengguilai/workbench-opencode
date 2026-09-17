// Method/path allowlist inspected from v1.18.31 /doc. No generic upstream URL routing.
export const directory='/workspace/project';
const gets=[/^\/(global\/(health|event|config)|api\/(health|reference|session)|experimental\/resource|event|config|config\/providers|provider|provider\/auth|path|vcs|vcs\/(status|diff|diff\/raw)|project|project\/current|command|agent|skill|lsp|formatter|mcp|permission|question|session|session\/status|file|file\/(content|status)|find|find\/(file|symbol)|pty|pty\/shells)$/,
 /^\/session\/ses_[\w-]+(?:\/(children|todo|diff|message)|\/message\/msg_[\w-]+)?$/,
 /^\/pty\/[\w-]+(?:\/connect)?$/];
const posts=[/^\/session$/,/^\/session\/ses_[\w-]+\/(message|prompt_async|abort|summarize|fork|revert|unrevert|shell)$/,/^\/(question|permission)\/[\w-]+\/(reply|reject)$/,/^\/pty$/,/^\/pty\/[\w-]+\/connect-token$/];
const patches=[/^\/session\/ses_[\w-]+$/];
const deletes=[/^\/session\/ses_[\w-]+$/,/^\/pty\/[\w-]+$/];
function safePath(value:string) {
 let p=value;
 if(p.startsWith('file:')) {const u=new URL(p);if(u.host)throw new Error('Unsafe path');p=decodeURIComponent(u.pathname);}
 if(p.includes('\0')||p.includes('\\')||p.split('/').includes('..'))throw new Error('Unsafe path');
 if(p.startsWith('/')&&p!==directory&&!p.startsWith(directory+'/'))throw new Error('Unsafe path');
}
function overrides(body:unknown) {
 if(!body||typeof body!=='object')return;
 for(const [k,v] of Object.entries(body)) {
  if(['system','tools','permission','permissions','provider','server','baseURL','apiKey','workspace'].includes(k))throw new Error('Configuration override forbidden');
  if(k==='model'&&v!==undefined) {
   const m=v as Record<string,unknown>;
   if(!m||m.providerID!=='approved'||!['gpt-5.6-luna','Qwen3.6-35B-A3B'].includes(m.modelID as string))throw new Error('Unapproved model');
  }
  if(k==='agent'&&typeof v==='string'&&!['build','plan','general','explore'].includes(v))throw new Error('Unapproved agent override');
  if(k==='variant'&&v&&v!=='default')throw new Error('Variant override forbidden');
  if(k==='url'&&typeof v==='string') {
   if(v.startsWith('file:'))safePath(v);
   else if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(v))throw new Error('Remote file URL forbidden');
  }
  if(k==='cwd'||k==='directory') {if(v!==directory)throw new Error('Unapproved directory');}
  if(v&&typeof v==='object')overrides(v);
 }
}
export function checkRequest(method:string,url:URL,body?:any,websocket=false) {
 const p=url.pathname;
 const staticUI=method==='GET'&&(p==='/'||/^\/assets\/[\w.-]+$/.test(p)||/^\/(favicon[\w.-]*|apple-touch-icon[\w.-]*|site.webmanifest|social-share.png)$/.test(p)||/^\/server\/[A-Za-z0-9_-]+\/session\/ses_[\w-]+$/.test(p)||(!/^\/(api|global|session|pty|auth|__platform|experimental|mcp)\//.test(p)&&/^\/(new-session|[A-Za-z0-9_-]+\/session(?:\/ses_[\w-]+)?)$/.test(p)));
 const list=method==='GET'?gets:method==='POST'?posts:method==='PATCH'?patches:method==='DELETE'?deletes:method==='PUT'?[/^\/pty\/[\w-]+$/]:[];
 if(!staticUI&&!list.some(re=>re.test(p)))throw new Error('Route forbidden');
 if(websocket&&!/^\/pty\/[\w-]+\/connect$/.test(p))throw new Error('WebSocket route forbidden');
 for(const [k,v] of url.searchParams) {
  if(k.toLowerCase().includes('directory')&&v!==directory)throw new Error('Unapproved directory');
  if(k==='location') {let loc:any;try{loc=JSON.parse(v);}catch{throw new Error('Location override forbidden');}if(loc.directory!==directory||loc.workspace||Object.keys(loc).some(k=>k!=='directory'))throw new Error('Location override forbidden');}
  if(k.toLowerCase().includes('workspace'))throw new Error('Workspace override forbidden');
  if(['workspace','server','url','host','envId','userId'].includes(k))throw new Error('Routing override forbidden');
  if(k==='path')safePath(v);
 }
 if(!staticUI)url.searchParams.set('directory',directory);
 if(body) {
  overrides(body);
  if(p==='/pty') {
   if(body.env&&Object.keys(body.env).length)throw new Error('Environment override forbidden');
   if(body.command&&!['bash','sh','/bin/bash','/usr/bin/bash','/bin/sh','/usr/bin/sh'].includes(body.command))throw new Error('Shell override forbidden');
   body.cwd=directory;
  }
  if(p==='/session'&&Object.keys(body).some(k=>!['title','parentID'].includes(k)))throw new Error('Session configuration override forbidden');
  if(method==='PATCH'&&p.startsWith('/session/')&&Object.keys(body).some(k=>!['title','time'].includes(k)))throw new Error('Session configuration override forbidden');
 }
}
export function redactConfig(value:any):any {
 if(Array.isArray(value))return value.map(redactConfig);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['apiKey','api_key','token','password','headers'].includes(k)).map(([k,v])=>[k,redactConfig(v)]));
 return value;
}
