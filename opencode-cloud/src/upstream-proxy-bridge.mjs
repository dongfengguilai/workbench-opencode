// Repair the existing model service's configured but absent loopback proxy.
// This is a real TCP relay to the host's already configured proxy, not a model response stub.
import net from 'node:net';
const proxyHost=process.env.UPSTREAM_PROXY_HOST;
const proxyPort=Number(process.env.UPSTREAM_PROXY_PORT || '7890');
if (!proxyHost) throw new Error('Missing administrator UPSTREAM_PROXY_HOST');
net.createServer(client=>{
 const target=net.connect({host:proxyHost,port:proxyPort});
 const close=()=>{client.destroy();target.destroy();};
 client.on('error',close);target.on('error',close);
 client.setTimeout(300000,close);target.setTimeout(300000,close);
 target.once('connect',()=>{client.pipe(target);target.pipe(client);});
 client.once('close',()=>target.destroy());target.once('close',()=>client.destroy());
}).listen(7890,'0.0.0.0',()=>console.log('upstream proxy TCP bridge listening'));
