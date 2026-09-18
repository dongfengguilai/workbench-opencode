import {readFileSync} from 'node:fs';import {createLocalBrowser} from './local-browser.mjs';
import {previewOrigin} from './preview-origin.mjs';
import {pathToFileURL} from 'node:url';import path from 'node:path';
const runtime=process.env.WORKBENCH_LOCAL_RUNTIME?pathToFileURL(path.resolve(process.env.WORKBENCH_LOCAL_RUNTIME)+'/'):new URL('../runtime/',import.meta.url);const config=JSON.parse(readFileSync(new URL('platform.json',runtime)));
if(!config.previewRelayKey)throw Error('Missing owned preview relay credential');
const server=createLocalBrowser({origin:config.origin,approvedOrigin:config.auth?.mode==='development'?'https://127.0.0.1:8443':undefined,cert:readFileSync(new URL('tls.crt',runtime)),port:8445,previewKey:config.previewRelayKey,previewOrigins:Object.keys(config.users).map(previewOrigin)});
server.on('listening',()=>console.log('Owned preview entry http://localhost:8445'));server.on('error',e=>{console.error(e.code||'Preview relay failed');process.exitCode=1;});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.shutdown());
