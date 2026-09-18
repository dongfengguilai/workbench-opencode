import {createHash} from 'node:crypto';
let maintained;
// Only server-owned configuration sets formal origins, never request arguments.
export function configureOrigins(origins){
 if(!origins){maintained=undefined;return;}
 for(const [identity,pair] of Object.entries(origins)){
  if(!identity||!pair?.workbench||!pair?.preview)throw Error('Incomplete public origin mapping');
  for(const value of [pair.workbench,pair.preview]){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.username||u.password)throw Error('Fixed HTTPS origin required');}
  if(pair.workbench===pair.preview)throw Error('Preview must have a separate origin');
 }
 maintained=structuredClone(origins);
}
export function formalOrigins(){return !!maintained;}
// Fixed local port; labels derive only from maintainer-managed identities.
export function previewOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved preview origin');return maintained[username].preview;}return 'http://u-'+createHash('sha256').update(username).digest('hex').slice(0,40)+'.localhost:8445';}
export function workbenchOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved workbench origin');return maintained[username].workbench;}return previewOrigin(username).replace('http://','http://workbench.').replace(':8445',':8444');}
