// Maintainer-owned configuration; never load project Vite config or plugin lists.
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const root='/workspace/project/web';const require=createRequire(root+'/package.json');const plugins=[];
if(existsSync(root+'/package.json')){
 const pkg=JSON.parse(readFileSync(root+'/package.json','utf8'));
 if(pkg.dependencies?.react){
  if(pkg.devDependencies?.['@vitejs/plugin-react']!=='4.7.0')throw Error('React state-preserving preview requires locked official @vitejs/plugin-react 4.7.0');
  const installed=JSON.parse(readFileSync(root+'/node_modules/@vitejs/plugin-react/package.json','utf8'));
  const lock=JSON.parse(readFileSync(root+'/package-lock.json','utf8'));
  if(installed.version!=='4.7.0'||lock.packages?.['node_modules/@vitejs/plugin-react']?.version!=='4.7.0')throw Error('React refresh dependency version does not match maintainer pin');
  const plugin=require('@vitejs/plugin-react');plugins.push((plugin.default||plugin)());
 }
}
export default {root,plugins,esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:5173,strictPort:true,allowedHosts:['localhost','127.0.0.1'],fs:{strict:true,allow:[root],deny:['**/.env','**/.env.*','**/*.{pem,key,p12,pfx}','**/.git/**','**/.workbench-artifacts/**']}}};
