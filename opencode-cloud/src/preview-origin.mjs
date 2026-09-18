import {createHash} from 'node:crypto';
let maintained;
// Only server-owned configuration sets formal origins, never request arguments.
export function configureOrigins(origins){
 if(!origins){maintained=undefined;return;}
 const addresses=new Set();const hostnameOwners=new Map();
 for(const [identity,pair] of Object.entries(origins)){
  if(!identity||!pair?.workbench||!pair?.preview)throw Error('Incomplete public origin mapping');
  for(const value of [pair.workbench,pair.preview]){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.username||u.password)throw Error('Fixed HTTPS origin required');}
  if(pair.workbench===pair.preview)throw Error('Preview must have a separate origin');
  for(const value of [pair.workbench,pair.preview]){if(addresses.has(value))throw Error('Origins must be globally unique');addresses.add(value);}
  for(const value of [pair.workbench,pair.preview]){const host=new URL(value).hostname;const owner=hostnameOwners.get(host);if(owner&&owner!==identity)throw Error('Identities require separate cookie hosts');hostnameOwners.set(host,identity);}
 }
 maintained=structuredClone(origins);
}
export function formalOrigins(){return !!maintained;}
// Fixed local port; labels derive only from maintainer-managed identities.
export function previewOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved preview origin');return maintained[username].preview;}return 'http://u-'+createHash('sha256').update(username).digest('hex').slice(0,40)+'.localhost:8445';}
export function workbenchOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved workbench origin');return maintained[username].workbench;}return previewOrigin(username).replace('http://','http://workbench.').replace(':8445',':8444');}
