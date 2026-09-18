// Fixed HTTPS ingress; reuses the tested streaming / WebSocket proxy.
import {readFileSync} from 'node:fs';
import {createLocalBrowser} from './local-browser.mjs';
const cfg=JSON.parse(readFileSync('/trusted/edge.json'));
const preview=process.env.EDGE_ROLE==='preview';
if(!['preview','workbench'].includes(process.env.EDGE_ROLE))throw Error('Fixed ingress role required');
const pairs=Object.values(cfg.publicOrigins);
if(pairs.length!==1)throw Error('V1 IP ingress is limited to one assigned NetID');
const origins=pairs.map(p=>preview?p.preview:p.workbench);
const port=Number(new URL(origins[0]).port||443);
const server=createLocalBrowser({origin:cfg.origin,approvedOrigin:cfg.origin,cert:readFileSync('/trusted/ca.crt'),fingerprint:cfg.platformFingerprint,port,bindHost:'0.0.0.0',
 httpsServer:{key:readFileSync('/trusted/edge.key'),cert:readFileSync('/trusted/edge.crt')},
 ...(preview?{previewKey:cfg.previewRelayKey,previewOrigins:origins}:{browserKey:cfg.previewRelayKey,browserOrigins:origins})});
server.on('listening',()=>console.log('Fixed HTTPS '+process.env.EDGE_ROLE+' ingress ready'));
server.on('error',e=>{console.error(e.code||'Ingress failed');process.exitCode=1});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.shutdown());
