import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';

const upstream = new URL(process.env.MODEL_UPSTREAM || 'http://192.168.142.130:8317');
const master = process.env.MODEL_MASTER_KEY;
const token = process.env.ENV_MODEL_TOKEN;
if (!master || !token) throw new Error('Missing MODEL_MASTER_KEY or ENV_MODEL_TOKEN');
if (upstream.protocol !== 'http:' || upstream.pathname !== '/' || upstream.search || upstream.username || upstream.password) {
  throw new Error('This fixed gateway requires an administrator configured HTTP origin');
}
// Two explicitly approved fixed routes, never an upstream chosen by a request.
const targets=new Map([['gpt-5.6-luna',{upstream,master}]]);
if(process.env.QWEN_UPSTREAM||process.env.QWEN_MASTER_KEY){
 const qwen=new URL(process.env.QWEN_UPSTREAM!);const key=process.env.QWEN_MASTER_KEY;
 if(!key||qwen.protocol!=='http:'||qwen.pathname!=='/'||qwen.search||qwen.username||qwen.password)throw Error('Invalid trusted Qwen route');
 targets.set('Qwen3.6-35B-A3B',{upstream:qwen,master:key});
}
const budgetFile=process.env.MODEL_BUDGET_FILE||'/gateway-state/budget.json';
const requestLimit=Number(process.env.MODEL_DAILY_REQUEST_LIMIT||250);
if(!Number.isSafeInteger(requestLimit)||requestLimit<1)throw new Error('Invalid fixed request budget');
mkdirSync(path.dirname(budgetFile),{recursive:true});
function reserve(){
 const day=new Date().toISOString().slice(0,10);let state={day,count:0};
 try{const saved=JSON.parse(readFileSync(budgetFile,'utf8'));if(saved.day===day){if(!Number.isSafeInteger(saved.count)||saved.count<0)throw new Error('Invalid budget state');state=saved;}}
 catch(e:any){if(e.code!=='ENOENT')throw e;}
 if(state.count>=requestLimit)return false;
 state.count++;writeFileSync(budgetFile+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(budgetFile+'.tmp',budgetFile);return true;
}
let active = 0;
function reply(res: http.ServerResponse, code: number, message: string) {
  res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:{message}}));
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') { res.end('ok'); return; }
  const received = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) { reply(res,401,'Unauthorized'); return; }
  if (req.url === '/v1/models' && req.method === 'GET') {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({object:'list',data:[...targets.keys()].map(id=>({id,object:'model',owned_by:'approved-gateway'}))})); return;
  }
  if (req.method !== 'POST' || !['/v1/chat/completions','/v1/responses'].includes(req.url || '')) { reply(res,404,'Unsupported route'); return; }
  if (active >= 2) { reply(res,409,'Model gateway is busy; no automatic retry'); return; }
  active++;
  let completed = false;
  const finish = () => { if (!completed) { completed=true; active--; } };
  res.once('close', finish);
  let size=0;
  const chunks:Buffer[]=[];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16*1024*1024) { reply(res,413,'Request too large'); return; }
      chunks.push(chunk);
    }
    let body=Buffer.concat(chunks);
    let data:Record<string,unknown>;
    try { data=JSON.parse(body.toString()); } catch { reply(res,400,'Invalid JSON'); return; }
    const target=typeof data?.model==='string'?targets.get(data.model):undefined;
    if (!target) { reply(res,403,'Only approved configured models are allowed'); return; }
    if(data.model==='Qwen3.6-35B-A3B'&&req.url==='/v1/responses'){reply(res,404,'Qwen supports the approved chat completions route only');return;}
    for(const name of ['max_tokens','max_completion_tokens','max_output_tokens'])if(data[name]!==undefined&&(!Number.isSafeInteger(data[name])||Number(data[name])<1||Number(data[name])>16000)){reply(res,403,'Output limit exceeds approved 16000 token cap');return;}
    if(req.url==='/v1/responses')data.max_output_tokens=16000;
    else if(data.max_completion_tokens===undefined)data.max_tokens=data.max_tokens||16000;
    body=Buffer.from(JSON.stringify(data));
    try{if(!reserve()){reply(res,403,'Environment daily request budget exhausted; no automatic retry');return;}}
    catch{reply(res,424,'Model budget state unavailable; request not forwarded');return;}
    const request=http.request(new URL(req.url!,target.upstream), {
      method:'POST',headers:{'Authorization':'Bearer '+target.master,'Content-Type':'application/json','Content-Length':body.length},
    }, response => {
      if((response.statusCode||502)>=500||response.statusCode===429){response.resume();reply(res,424,'Approved model unavailable; no automatic retry');return;}
      res.writeHead(response.statusCode || 502, {
        'Content-Type':response.headers['content-type'] || 'application/json',
        'Cache-Control':'no-store','X-Accel-Buffering':'no',
      });
      response.pipe(res);
      response.on('error',()=>res.destroy());
    });
    const deadline=setTimeout(()=>request.destroy(new Error('model deadline')),300000);
    res.once('close',()=>{clearTimeout(deadline);request.destroy();});
    request.on('error',()=>{ if (!res.headersSent) reply(res,424,'Approved model unavailable; no automatic retry'); else res.destroy(); });
    request.end(body);
  } catch { if (!res.headersSent && !res.destroyed) reply(res,400,'Invalid request'); }
  finally { if (res.writableEnded || res.destroyed) finish(); }
});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT || 8318),'0.0.0.0',()=>console.log('single-model gateway listening'));
