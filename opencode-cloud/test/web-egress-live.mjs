// Actual running Docker environments and external websites. No substitute server.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const results=[];
const protectedServices=['native','admin-native','model-gateway','admin-model-gateway','platform','upstream-proxy-bridge'];
const serviceAddresses=Object.fromEntries(protectedServices.map(name=>{
 const id=execFileSync('docker',['compose','ps','-q',name],{encoding:'utf8'}).trim();
 const cfg=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];
 return [name,Object.values(cfg.NetworkSettings.Networks).map(n=>n.IPAddress).filter(Boolean)];
}));
const code=String.raw`
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';
const proxy=new URL(process.env.HTTPS_PROXY);
const tunnel=(target,method='CONNECT')=>new Promise((resolve,reject)=>{
 const req=http.request({host:proxy.hostname,port:proxy.port,method,path:target,headers:{Host:target},timeout:12000},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
 req.on('connect',(res,socket)=>{socket.destroy();resolve(res.statusCode)});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));req.end();
});
const website=url=>new Promise((resolve,reject)=>{
 const agent=new https.Agent();
 agent.createConnection=(options,done)=>{
  const req=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:options.host+':443',headers:{Host:options.host+':443'},timeout:12000});
  req.on('connect',(res,socket,head)=>{if(res.statusCode!==200){socket.destroy();done(Error('CONNECT '+res.statusCode));return;}if(head.length)socket.unshift(head);const secure=tls.connect({socket,servername:options.host,rejectUnauthorized:true});secure.once('secureConnect',()=>done(null,secure));secure.once('error',done);});
  req.on('error',done);req.on('timeout',()=>req.destroy(Error('connect timeout')));req.end();
 };
 const req=https.get(url,{agent,timeout:30000},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>{agent.destroy();resolve({status:res.statusCode,body:Buffer.concat(parts).toString().slice(0,150),tlsVerified:true})});res.on('error',reject)});
 req.on('error',e=>{agent.destroy();reject(e)});req.on('timeout',()=>req.destroy(Error('website timeout')));
});
const attempt=async fn=>{try{return await fn()}catch(e){return {error:e.code||e.message}}};
const denyTargets=['127.0.0.1:443','10.0.0.1:443','192.168.142.130:443','169.254.169.254:443','192.168.56.1:443','[::1]:443','[::ffff:8.8.8.8]:443','[2001:db8::1]:443','2130706433:443','wttr.in:80','wttr.in:8317','admin-model-gateway:443','model-gateway:443'];
denyTargets.push(...Object.values(protectedAddresses).flat().map(ip=>ip+':443'));
const denials=[];for(const target of denyTargets)denials.push({target,status:await attempt(()=>tunnel(target))});
denials.push({target:'http://wttr.in/Shanghai?format=3',status:await tunnel('http://wttr.in/Shanghai?format=3','GET')});
const direct=[];
for(const target of [{host:'5.9.243.187',port:443},{host:'192.168.56.1',port:7890},{host:'192.168.142.130',port:8317},{host:'169.254.169.254',port:80},{host:'2606:4700:4700::1111',port:443},...protectedAddresses[otherNative].map(host=>({host,port:4096}))]){
 const outcome=await new Promise(resolve=>{const s=net.connect(target);s.setTimeout(1500,()=>{s.destroy();resolve('timeout')});s.on('connect',()=>{s.destroy();resolve('CONNECTED')});s.on('error',e=>resolve(e.code))});direct.push({...target,outcome});
}
console.log(JSON.stringify({proxy:proxy.hostname,denials,direct,weather:await attempt(()=>website('https://wttr.in/Shanghai?format=3')),docs:await attempt(()=>website('https://bun.sh/docs/runtime/networking/fetch'))}));
`;
try{
 for(const service of ['admin-native','native']){
  const prefix=`const protectedAddresses=${JSON.stringify(serviceAddresses)};const otherNative=${JSON.stringify(service==='native'?'admin-native':'native')};\n`;
  const output=execFileSync('docker',['compose','exec','-T',service,'node','--input-type=module','-e',prefix+code],{encoding:'utf8',timeout:100000});
  const data=JSON.parse(output);results.push({service,...data});
  for(const r of data.denials)assert.equal(r.status,403,JSON.stringify(r));
  for(const r of data.direct)assert.notEqual(r.outcome,'CONNECTED',JSON.stringify(r));
  assert.equal(data.weather.status,200,JSON.stringify(data.weather));assert.match(data.weather.body,/Shanghai:/);
  assert.equal(data.docs.status,200,JSON.stringify(data.docs));assert.equal(data.docs.tlsVerified,true);
 }
 // Inspect actual port publication and network membership, independently of YAML.
 for(const name of ['web-egress','admin-web-egress']){
  const id=execFileSync('docker',['compose','ps','-q',name],{encoding:'utf8'}).trim();
  const cfg=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];
  assert.deepEqual(cfg.HostConfig.PortBindings,{});assert.equal(Object.keys(cfg.NetworkSettings.Networks).length,2);
  results.push({service:name,hostPorts:cfg.HostConfig.PortBindings,networks:Object.keys(cfg.NetworkSettings.Networks),health:cfg.State.Health.Status});
  assert.equal(cfg.State.Health.Status,'healthy');
 }
 writeFileSync('evidence/web-egress-live-result.json',JSON.stringify({kind:'actual_containers_and_public_https_verified_tls',status:'PASS',results},null,2)+'\n');console.log('PASS both environments: real HTTPS, TLS, protected destinations, direct IPv4/IPv6 denial, no gateway published port');
}catch(e){writeFileSync('evidence/web-egress-live-result.json',JSON.stringify({status:'FAIL',error:e.message,results},null,2)+'\n');throw e;}
