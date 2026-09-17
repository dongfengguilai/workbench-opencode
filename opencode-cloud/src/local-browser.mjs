import http from 'node:http';
import https from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createHash, X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {uiPage} from './ui-assets.mjs';

const hop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function filtered(headers) {
  const blocked = new Set([...hop, ...String(headers.connection || '').toLowerCase().split(',').map(x=>x.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([k])=>!blocked.has(k)));
}
export function createLocalBrowser({origin, cert, fingerprint, port=8444, previewKey,previewOrigins=[],browserKey,browserOrigins=[]}) {
  const target = new URL(origin);
  if (target.origin !== 'https://192.168.142.130:8443') throw new Error('Unapproved upstream');
  const expected = fingerprint || createHash('sha256').update(new X509Certificate(cert).raw).digest('hex');
  const sockets = new Set();
  const server = http.createServer();
  const localOrigin = ()=>`http://${previewKey?'localhost':'127.0.0.1'}:${server.address().port}`;
  const origins=()=>new Set([localOrigin(),...(previewKey?previewOrigins:browserOrigins)]);
  const requestOrigin=req=>{const incoming='http://'+req.headers.host;return origins().has(incoming)?incoming:undefined;};
  function permitted(req) {
    const own=requestOrigin(req);
    const navigation=req.method==='GET' && req.headers['sec-fetch-mode']==='navigate';
    // Redirected iframe navigations can retain cross-site Fetch Metadata even
    // between our paired localhost hosts. Only authenticated preview documents
    // on the fixed allowlist are eligible; the upstream enforces owner-bound CSP.
    const previewNavigation=previewKey && (req.url?.startsWith('/__workbench/claim?') ||
      (navigation && (req.headers['sec-fetch-dest']==='document' ||
        (req.headers['sec-fetch-dest']==='iframe' && previewOrigins.includes(own)))));
    const browserNavigation=!previewKey && browserKey && (req.url?.startsWith('/__platform/workbench/claim?') ||
      (navigation && req.headers['sec-fetch-dest']==='document' &&
        (req.url==='/__platform/login' || (browserOrigins.includes(own) && uiPage(new URL(req.url,target).pathname)))));
    return !!own &&
      req.url?.startsWith('/') && !req.url.startsWith('//') &&
      (!req.headers.origin || req.headers.origin===own) &&
      (req.headers['sec-fetch-site']!=='cross-site' || (req.method==='GET' && (previewNavigation || browserNavigation))) &&
      (['GET','HEAD'].includes(req.method) || req.headers.origin===own) &&
      !['CONNECT','TRACE'].includes(req.method);
  }
  function options(req, websocket=false) {
    const headers = filtered(req.headers);
    delete headers.authorization;
    delete headers['x-workbench-browser-relay']; delete headers['x-workbench-browser-origin'];
    if(browserKey){headers['x-workbench-browser-relay']=browserKey;headers['x-workbench-browser-origin']=requestOrigin(req);}
    if(previewKey){headers.cookie=String(headers.cookie||'').split(';').filter(s=>!/^\s*agent_session=/i.test(s)).join(';');headers['x-workbench-preview-relay']=previewKey;headers['x-workbench-preview-origin']=requestOrigin(req);}
    for (const k of Object.keys(headers)) if (k.startsWith('x-forwarded-') || k === 'forwarded') delete headers[k];
    headers.host = target.host;
    if (req.headers.origin) headers.origin = target.origin;
    if (websocket) {headers.connection='Upgrade'; headers.upgrade='websocket';}
    return {hostname:target.hostname, port:target.port, path:(previewKey?'/__preview':'')+req.url, method:req.method,
      headers, ca:cert, rejectUnauthorized:true, agent:false,
      checkServerIdentity(host, peer) {
        const error = checkServerIdentity(host,peer);
        if (error) return error;
        if (createHash('sha256').update(peer.raw).digest('hex') !== expected) return new Error('Upstream certificate fingerprint mismatch');
      }};
  }
  function responseHeaders(headers,req) {
    const out = filtered(headers);
    if (out['set-cookie']) out['set-cookie']=out['set-cookie'].map(value=>
      (previewKey?/^workbench_preview=/:/^agent_session=/).test(value) ? value.replace(/;\s*Secure(?=;|$)/ig,'') : value);
    if (out.location) {
      const location = new URL(out.location,target);
      if((previewKey||browserKey)&&origins().has(location.origin)){out.location=location.href;return out;}
      if (location.origin !== target.origin) throw new Error('External redirect refused');
      out.location = requestOrigin(req)+location.pathname+location.search+location.hash;
    }
    return out;
  }
  server.on('request',(req,res)=>{
    if(process.env.LOCAL_BROWSER_TRACE==='1')console.log('incoming',req.method,new URL(req.url,target).pathname);
    if (!permitted(req)) {if(process.env.LOCAL_BROWSER_TRACE==='1')console.log('denied',JSON.stringify({host:req.headers.host,origin:req.headers.origin,site:req.headers['sec-fetch-site'],mode:req.headers['sec-fetch-mode'],dest:req.headers['sec-fetch-dest'],path:new URL(req.url,target).pathname}));res.writeHead(403,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Local browser origin required');req.resume();return;}
    const upstream=https.request(options(req),reply=>{
      if(process.env.LOCAL_BROWSER_TRACE==='1')console.log(req.method,new URL(req.url,target).pathname,reply.statusCode);
      try {res.writeHead(reply.statusCode,responseHeaders(reply.headers,req));}
      catch {reply.destroy();res.writeHead(502);res.end('Unexpected redirect');return;}
      reply.on('error',()=>res.destroy());
      reply.pipe(res);
    });
    upstream.on('error',()=>{if(res.headersSent)res.destroy();else{res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Verified platform connection unavailable; check native outcome before resubmitting');}});
    upstream.setTimeout(360000,()=>upstream.destroy());
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>upstream.destroy());
    req.pipe(upstream);
  });
  server.on('upgrade',(req,socket,head)=>{
    if (!permitted(req) || req.method !== 'GET' || req.headers.origin !== requestOrigin(req) || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    const upstream=https.request(options(req,true));
    upstream.on('upgrade',(reply,remote,remoteHead)=>{
      socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(reply.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
      if(remoteHead.length)socket.write(remoteHead);if(head.length)remote.write(head);
      socket.pipe(remote);remote.pipe(socket);
      remote.on('error',()=>socket.destroy());remote.on('close',()=>socket.destroy());
      socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
    });
    upstream.on('response',reply=>{socket.end(`HTTP/1.1 ${reply.statusCode} Rejected\r\nConnection: close\r\n\r\n`);reply.resume();});
    upstream.on('error',()=>socket.destroy());
    socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
    upstream.setTimeout(360000,()=>upstream.destroy());upstream.end();
  });
  server.on('connect',(_req,socket)=>socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n'));
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.shutdown=()=>{for(const socket of sockets)socket.destroy();server.close();};
  server.listen(port,'127.0.0.1');
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime=new URL('../runtime/',import.meta.url);
  const config=JSON.parse(readFileSync(new URL('platform.json',runtime),'utf8'));
  const {workbenchOrigin}=await import('./preview-origin.mjs');
  const {origin}=config;
  const server=createLocalBrowser({origin,cert:readFileSync(new URL('tls.crt',runtime)),browserKey:config.previewRelayKey,browserOrigins:Object.keys(config.users).map(workbenchOrigin)});
  server.on('listening',()=>console.log('Local browser entry: http://127.0.0.1:8444 (verified HTTPS upstream)'));
  server.on('error',error=>{console.error(error.code || 'Local entry failed');process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.shutdown());
}
