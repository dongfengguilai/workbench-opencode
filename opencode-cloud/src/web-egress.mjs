// Network adapter only: native OpenCode still owns fetch, TLS, tools and sessions.
import http from 'node:http';
import net from 'node:net';
import {lookup as dnsLookup} from 'node:dns/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const policyRoot=new URL('./egress-policy/',import.meta.url);
const sources=JSON.parse(readFileSync(new URL('sources.json',policyRoot)));
const sha=data=>createHash('sha256').update(data).digest('hex');
for(const source of sources.sources){
 if(sha(readFileSync(new URL(`iana-ipv${source.family}.csv`,policyRoot)))!==source.sha256) throw Error('IANA source integrity failure');
}
const policyBytes=readFileSync(new URL('blocked-ranges.json',policyRoot));
if(sha(policyBytes)!==sources.derivedSha256) throw Error('IANA derived policy integrity failure');
// Separate families: BlockList treats IPv4 as mapped IPv6 when checking IPv6 rules.
const blocked={4:new net.BlockList(),6:new net.BlockList()};
for(const [family,ranges] of Object.entries(JSON.parse(policyBytes))){
 for(const cidr of ranges){const [address,prefix]=cidr.split('/');blocked[family].addSubnet(address,Number(prefix),family==='4'?'ipv4':'ipv6');}
}
blocked[4].addSubnet('224.0.0.0',4,'ipv4');
const globalV6=new net.BlockList();globalV6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(address){
 const family=net.isIP(address);
 if(!family || address.includes('%')) return false;
 if(family===6 && !globalV6.check(address,'ipv6')) return false;
 return !blocked[family].check(address,family===4?'ipv4':'ipv6');
}
export function parseAuthority(authority){
 if(typeof authority!=='string' || authority.length>270) throw Error('invalid_authority');
 const match=/^(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+):443$/.exec(authority);
 if(!match) throw Error('https_443_only');
 const host=match[1].replace(/^\[|\]$/g,'').toLowerCase();
 if(!net.isIP(host)){
  const labels=host.split('.');
  if(labels.length<2 || host.length>253 || !/[a-z]/.test(labels.at(-1)) ||
     labels.some(label=>!/^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label)) ||
     /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw Error('invalid_hostname');
 }
 return {host,port:443};
}
export async function resolvePublicTarget(host,lookup=h=>dnsLookup(h,{all:true,verbatim:true})){
 const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host);
 if(!Array.isArray(addresses)||!addresses.length) throw Error('dns_empty');
 // Check ALL answers, including unused families. No hostname is passed upstream.
 if(addresses.some(item=>!isPublicAddress(item.address))) throw Error('non_public_address');
 return addresses.find(item=>net.isIP(item.address)===4) ?? addresses[0];
}

export function createEgressGateway({proxyHost,proxyPort=7890,direct=false,lookup,maxConcurrent=4,connectTimeout=10000,idleTimeout=120000,log=entry=>console.log(JSON.stringify(entry))}={}){
 if(!direct&&(!net.isIP(proxyHost)||!Number.isInteger(proxyPort)||proxyPort<1||proxyPort>65535)) throw Error('Fixed administrator proxy IP/port required');
 const sockets=new Set();let active=0;
 const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
  if(req.method==='GET'&&req.url==='/health'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ready:true,active,maxConcurrent,policySha256:sources.derivedSha256}));return;
  }
  log({result:'denied',reason:'https_connect_only'});
  res.writeHead(403,{'Content-Type':'text/plain','Connection':'close'});res.end('https_connect_only\n');
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
 server.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
 server.on('clientError',(_err,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 server.on('connect',async(req,client,head)=>{
  client.pause();let host,address,upstream,established=false,finished=false,admitted=false,timer;
  const fail=(status,reason)=>{
   if(finished||client.destroyed) return;
   finished=true;clearTimeout(timer);upstream?.destroy();
   log({...(host?{host}:{}),...(address?{address}:{}),port:443,result:status>=500?'error':'denied',reason});
   if(established){client.destroy();return;}
   const body=reason+'\n';const message=http.STATUS_CODES[status]??'Error';
   client.end(`HTTP/1.1 ${status} ${message}\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,()=>client.destroy());
  };
  client.once('close',()=>{finished=true;clearTimeout(timer);upstream?.destroy();if(admitted)active--;});
  // HTTP CONNECT hands over a half-open socket. A browser FIN must release
  // the tunnel immediately instead of retaining a slot until idle timeout.
  client.once('end',()=>{upstream?.destroy();client.destroy();});
  try{
   ({host}=parseAuthority(req.url));
   if(req.headers['proxy-authorization'] || req.headers['transfer-encoding'] || (req.headers['content-length']&&req.headers['content-length']!=='0')) throw Error('invalid_connect_headers');
   if(active>=maxConcurrent){fail(429,'environment_tunnel_limit');return;}
   active++;admitted=true;
   timer=setTimeout(()=>fail(504,'connect_timeout'),connectTimeout);
   const target=await resolvePublicTarget(host,lookup);address=target.address;
   if(finished||client.destroyed) return;
   const authority=(net.isIP(address)===6?`[${address}]`:address)+':443';
   upstream=net.connect(direct?{host:address,port:443,family:net.isIP(address)}:{host:proxyHost,port:proxyPort});
   upstream.once('end',()=>client.end());
   upstream.on('error',()=>fail(502,'upstream_connection_error'));
   upstream.once('close',()=>{if(!finished&&(!established||!upstream.readableEnded))fail(502,'upstream_closed');});
   function establish(remaining){
    if(finished||client.destroyed)return;
    upstream.pause();clearTimeout(timer);established=true;
    log({host,address,port:443,result:'connected'});
    client.setTimeout(idleTimeout,()=>fail(504,'tunnel_idle_timeout'));
    upstream.setTimeout(idleTimeout,()=>fail(504,'tunnel_idle_timeout'));
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if(head.length)upstream.write(head);
    if(remaining?.length)upstream.unshift(remaining);
    client.pipe(upstream);upstream.pipe(client);client.resume();upstream.resume();
   }
   upstream.once('connect',()=>direct?establish():upstream.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
   let buffer=Buffer.alloc(0);
   const receive=part=>{
    buffer=Buffer.concat([buffer,part]);const end=buffer.indexOf('\r\n\r\n');
    if((end<0&&buffer.length>16384)||end>16384){fail(502,'upstream_invalid_response');return;}
    if(end<0)return;
    const status=/^HTTP\/1\.[01] (\d{3})(?: |\r\n)/.exec(buffer.toString('latin1',0,end+4));
    if(!status||Number(status[1])<200||Number(status[1])>=300){fail(502,'upstream_connect_rejected');return;}
    upstream.off('data',receive);establish(buffer.subarray(end+4));
    buffer=undefined;
   };
   if(!direct)upstream.on('data',receive);
  }catch(error){fail(['non_public_address','invalid_authority','https_443_only','invalid_hostname','invalid_connect_headers'].includes(error.message)?403:502,error.message==='dns_empty'?'dns_empty':error.code?'dns_lookup_failed':error.message);}
 });
 server.shutdown=()=>{for(const socket of sockets)socket.destroy();server.close();};
 return server;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const server=createEgressGateway({proxyHost:process.env.UPSTREAM_PROXY_HOST,proxyPort:Number(process.env.UPSTREAM_PROXY_PORT||7890),direct:process.env.EGRESS_MODE==='direct-public'});
 server.listen(8320,'0.0.0.0',()=>console.log(JSON.stringify({result:'ready',port:8320,policySha256:sources.derivedSha256})));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.shutdown());
}
