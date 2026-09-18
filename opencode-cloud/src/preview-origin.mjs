import {createHash} from 'node:crypto';
let maintained;
let maintainedCookies;
// Only server-owned configuration sets formal origins, never request arguments.
export function configureOrigins(origins,cookieNames){
 if(!origins){maintained=undefined;maintainedCookies=undefined;return;}
 if(cookieNames&&Object.keys(cookieNames).sort().join('\n')!==Object.keys(origins).sort().join('\n'))throw Error('Cookie mapping must match maintained identities');
 const addresses=new Set();const hostnameOwners=new Map();
 for(const [identity,pair] of Object.entries(origins)){
  if(!identity||!pair?.workbench||!pair?.preview)throw Error('Incomplete public origin mapping');
  for(const value of [pair.workbench,pair.preview]){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||u.username||u.password)throw Error('Fixed HTTPS origin required');}
  if(pair.workbench===pair.preview)throw Error('Preview must have a separate origin');
  for(const value of [pair.workbench,pair.preview]){if(addresses.has(value))throw Error('Origins must be globally unique');addresses.add(value);}
  if(cookieNames&&(!/^agent_session(?:_[a-z0-9_]+)?$/.test(cookieNames[identity]?.session)||!/^workbench_preview(?:_[a-z0-9_]+)?$/.test(cookieNames[identity]?.preview)))throw Error('Invalid maintained credential cookie names');
  for(const value of [pair.workbench,pair.preview]){const host=new URL(value).hostname;let owners=hostnameOwners.get(host);if(!owners){owners=new Set();hostnameOwners.set(host,owners);}owners.add(identity);}
 }
 for(const owners of hostnameOwners.values())if(owners.size>1){const names=new Set();for(const identity of owners){if(!cookieNames)throw Error('Shared cookie hosts require isolated credential names');for(const kind of ['session','preview']){const name=cookieNames[identity][kind];if(names.has(name))throw Error('Shared cookie hosts require unique credential names');names.add(name);}}}
 maintained=structuredClone(origins);
 maintainedCookies=cookieNames&&structuredClone(cookieNames);
}
export function formalOrigins(){return !!maintained;}
function credentialName(value,kind){
 const fallback=kind==='workbench'?'agent_session':'workbench_preview';
 if(!maintained)return fallback;
 const identity=Object.keys(maintained).find(name=>maintained[name][kind]===value);
 return identity?maintainedCookies?.[identity]?.[kind==='workbench'?'session':'preview']||fallback:undefined;
}
export function sessionCookieName(value){return credentialName(value,'workbench');}
export function previewCookieName(value){return credentialName(value,'preview');}
export function isCredentialCookie(value){return /^\s*(?:agent_session|workbench_preview)(?:_[a-z0-9_]+)?=/i.test(value);}
export function scopedCookieHeader(header,name){return String(header||'').split(';').filter(value=>!isCredentialCookie(value)||(name&&value.trim().startsWith(name+'='))).join(';');}
// Fixed local port; labels derive only from maintainer-managed identities.
export function previewOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved preview origin');return maintained[username].preview;}return 'http://u-'+createHash('sha256').update(username).digest('hex').slice(0,40)+'.localhost:8445';}
export function workbenchOrigin(username){if(maintained){if(!maintained[username])throw Error('Identity has no approved workbench origin');return maintained[username].workbench;}return previewOrigin(username).replace('http://','http://workbench.').replace(':8445',':8444');}
