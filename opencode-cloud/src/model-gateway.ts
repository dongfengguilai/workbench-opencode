import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const upstream = new URL(process.env.MODEL_UPSTREAM || 'http://192.168.142.130:8317');
const master = process.env.MODEL_MASTER_KEY;
const token = process.env.ENV_MODEL_TOKEN;
if (!master || !token) throw new Error('Missing MODEL_MASTER_KEY or ENV_MODEL_TOKEN');
if (upstream.protocol !== 'http:' || upstream.pathname !== '/' || upstream.search || upstream.username || upstream.password) {
  throw new Error('This fixed gateway requires an administrator configured HTTP origin');
}
const model = 'gpt-5.6-luna';
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
    res.end(JSON.stringify({object:'list',data:[{id:model,object:'model',owned_by:'approved-gateway'}]})); return;
  }
  if (req.method !== 'POST' || !['/v1/chat/completions','/v1/responses'].includes(req.url || '')) { reply(res,404,'Unsupported route'); return; }
  if (active >= 2) { reply(res,429,'Model gateway is busy'); return; }
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
    const body=Buffer.concat(chunks);
    let data:Record<string,unknown>;
    try { data=JSON.parse(body.toString()); } catch { reply(res,400,'Invalid JSON'); return; }
    if (!data || data.model !== model) { reply(res,403,'Only the approved model is allowed'); return; }
    const request=http.request(new URL(req.url!,upstream), {
      method:'POST',headers:{'Authorization':'Bearer '+master,'Content-Type':'application/json','Content-Length':body.length},
    }, response => {
      res.writeHead(response.statusCode || 502, {
        'Content-Type':response.headers['content-type'] || 'application/json',
        'Cache-Control':'no-store','X-Accel-Buffering':'no',
      });
      response.pipe(res);
      response.on('error',()=>res.destroy());
    });
    const deadline=setTimeout(()=>request.destroy(new Error('model deadline')),300000);
    res.once('close',()=>{clearTimeout(deadline);request.destroy();});
    request.on('error',()=>{ if (!res.headersSent) reply(res,502,'Approved model unavailable; no automatic retry'); else res.destroy(); });
    request.end(body);
  } catch { if (!res.headersSent && !res.destroyed) reply(res,400,'Invalid request'); }
  finally { if (res.writableEnded || res.destroyed) finish(); }
});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT || 8318),'0.0.0.0',()=>console.log('single-model gateway listening'));
