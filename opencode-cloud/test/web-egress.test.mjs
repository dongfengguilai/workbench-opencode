import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {createEgressGateway, parseAuthority, isPublicAddress, resolvePublicTarget} from '../src/web-egress.mjs';

test('private, reserved, multicast and IPv6 transition addresses fail closed',()=>{
 for(const ip of ['0.0.0.0','10.2.3.4','100.64.1.2','127.0.0.1','169.254.169.254','172.20.0.1','192.168.142.130','192.0.0.9','198.18.0.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:8.8.8.8','64:ff9b::808:808','2001:db8::1','2002:0808:0808::1','fd00::1','fe80::1','ff02::1','3fff::1']) assert.equal(isPublicAddress(ip),false,ip);
 for(const ip of ['5.9.243.187','1.1.1.1','8.8.8.8','2606:4700:4700::1111']) assert.equal(isPublicAddress(ip),true,ip);
});
test('authority accepts only canonical host/IP and port 443',()=>{
 for(const target of ['localhost:443','example.com:80','example.com:0443','example.com:443/path','user@example.com:443','https://example.com:443','2130706433:443','0177.0.0.1:443','0x7f000001:443','127.1:443','example%2ecom:443','[fe80::1%eth0]:443','evil\r\nHost:x:443']) assert.throws(()=>parseAuthority(target),undefined,target);
 assert.deepEqual(parseAuthority('Example.com:443'),{host:'example.com',port:443});
 assert.deepEqual(parseAuthority('[2606:4700:4700::1111]:443'),{host:'2606:4700:4700::1111',port:443});
});
test('all DNS answers checked; fresh resolution prevents cached rebinding; selects IPv4',async()=>{
 let answers=[{address:'2606:4700:4700::1111',family:6},{address:'5.9.243.187',family:4}];let calls=0;
 const lookup=async()=>{calls++;return answers;};
 assert.equal((await resolvePublicTarget('wttr.in',lookup)).address,'5.9.243.187');
 answers=[{address:'5.9.243.187',family:4},{address:'127.0.0.1',family:4}];
 await assert.rejects(resolvePublicTarget('wttr.in',lookup),/non_public_address/);
 assert.equal(calls,2);
 await assert.rejects(resolvePublicTarget('empty.example',async()=>[]),/dns_empty/);
 assert.equal((await resolvePublicTarget('8.8.8.8',async()=>{throw Error('must not resolve literal')})).address,'8.8.8.8');
});
async function setup(upstreamHandler,options={}){
 const upstreams=new Set();
 const proxy=net.createServer(s=>{upstreams.add(s);s.once('close',()=>upstreams.delete(s));upstreamHandler(s);});proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 const server=createEgressGateway({proxyHost:'127.0.0.1',proxyPort:proxy.address().port,lookup:async()=>[{address:'5.9.243.187',family:4}],log:()=>{},...options});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,proxy,async close(){server.shutdown();for(const s of upstreams)s.destroy();await new Promise(r=>proxy.close(r));}};
}
function connect(server,target='wttr.in:443',method='CONNECT',headers=''){
 return new Promise((resolve,reject)=>{
  const socket=net.connect(server.address().port,'127.0.0.1',()=>socket.write(`${method} ${target} HTTP/1.1\r\nHost: ${target}\r\n${headers}\r\n`));
  let text='';const receive=b=>{text+=b.toString();if(text.includes('\r\n\r\n')){socket.off('data',receive);resolve({socket,text});}};
  socket.on('data',receive);socket.on('error',reject);
 });
}
test('connects pinned literal IP, streams tunnel bytes, and cleans client disconnect',async()=>{
 let seen;let targetSocket;
 const env=await setup(s=>{targetSocket=s;s.once('data',b=>{seen=b.toString();s.write('HTTP/1.1 200 Connection Established\r\n\r\n');s.on('data',data=>s.write(data));});});
 try{
  const {socket,text}=await connect(env.server);assert.match(text,/200 Connection Established/);assert.match(seen,/^CONNECT 5\.9\.243\.187:443 HTTP\/1\.1/);assert.ok(!seen.includes('wttr.in'));
  socket.write('opaque TLS bytes');const [reply]=await once(socket,'data');assert.equal(reply.toString(),'opaque TLS bytes');
  const closed=once(targetSocket,'close');socket.destroy();await closed;
 }finally{await env.close();}
});
test('denies private DNS, HTTP, non443, proxy authentication and excessive concurrency',async()=>{
 let dials=0;
 const env=await setup(s=>{dials++;s.once('data',()=>s.write('HTTP/1.1 200 Connection Established\r\n\r\n'));},{maxConcurrent:1});
 try{
  for(const [target,method] of [['127.0.0.1:443','CONNECT'],['169.254.169.254:443','CONNECT'],['example.com:22','CONNECT'],['http://example.com/','GET']]){const r=await connect(env.server,target,method);assert.match(r.text,/403/);r.socket.destroy();}
  assert.equal(dials,0);
  const auth=await connect(env.server,'wttr.in:443','CONNECT','Proxy-Authorization: unexpected\r\n');assert.match(auth.text,/403/);auth.socket.destroy();assert.equal(dials,0);
  const a=await connect(env.server);assert.match(a.text,/200/);
  const b=await connect(env.server);assert.match(b.text,/429/);b.socket.destroy();a.socket.destroy();
 }finally{await env.close();}
});
test('rejected clients release slots without client cooperation; IPv6 pinned in brackets',async()=>{
 let seen;const logs=[];
 const env=await setup(s=>s.once('data',b=>{seen=b.toString();s.write('HTTP/1.1 200 OK\r\n\r\n');}),{maxConcurrent:1,lookup:async h=>[{address:h==='blocked.example'?'10.0.0.1':'2606:4700:4700::1111',family:h==='blocked.example'?4:6}],log:e=>logs.push(e)});
 try{
  const denied=await connect(env.server,'blocked.example:443');assert.match(denied.text,/403/);await once(denied.socket,'close');
  const allowed=await connect(env.server);assert.match(allowed.text,/200/);assert.match(seen,/^CONNECT \[2606:4700:4700::1111\]:443/);allowed.socket.destroy();
  assert.ok(logs.some(e=>e.reason==='non_public_address'));
 }finally{await env.close();}
});
test('large streamed tunnel survives a paused reader without losing bytes',async()=>{
 const payload=Buffer.alloc(3*1024*1024,17);
 const env=await setup(s=>s.once('data',()=>{s.write('HTTP/1.1 200 OK\r\n\r\n');s.on('data',b=>s.write(b));}));
 try{
  const {socket}=await connect(env.server);socket.pause();socket.write(payload);
  const received=await new Promise((resolve,reject)=>{let total=0;const chunks=[];socket.on('error',reject);socket.on('data',b=>{total+=b.length;chunks.push(b);if(total>=payload.length)resolve(Buffer.concat(chunks));});setTimeout(()=>socket.resume(),30);});
  assert.deepEqual(received,payload);socket.destroy();
 }finally{await env.close();}
});
test('upstream failure is returned once; pending connection and slow headers bounded',async()=>{
 let dials=0;
 const env=await setup(s=>{dials++;s.once('data',()=>s.end('HTTP/1.1 503 Unavailable\r\n\r\n'));});
 try{const r=await connect(env.server);assert.match(r.text,/502/);r.socket.destroy();assert.equal(dials,1);}finally{await env.close();}
 const slow=await setup(()=>{},{connectTimeout:50});
 try{const r=await connect(slow.server);assert.match(r.text,/504/);r.socket.destroy();}finally{await slow.close();}
});
test('client FIN frees an established CONNECT slot without waiting for an upstream FIN or idle timeout',async()=>{
 const env=await setup(s=>s.once('data',()=>s.write('HTTP/1.1 200 OK\r\n\r\n')),{maxConcurrent:1,idleTimeout:120000});
 try{const a=await connect(env.server);assert.match(a.text,/200/);const closed=once(a.socket,'close');a.socket.end();await closed;const b=await connect(env.server);assert.match(b.text,/200/);b.socket.destroy();}finally{await env.close();}
});
