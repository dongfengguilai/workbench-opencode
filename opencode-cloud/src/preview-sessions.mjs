import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function sameSecret(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return !!y.length&&x.length===y.length&&timingSafeEqual(x,y);}
// Ephemeral access credentials only. Files, sessions and evidence remain native.
export class PreviewSessions {
 constructor({parent,close,now=Date.now,ticketTtl=30000,credentialTtl=1800000}){Object.assign(this,{parent,close,now,ticketTtl,credentialTtl});this.tickets=new Map();this.credentials=new Map();}
 issue(hash){this.sweep();if(!this.parent(hash))throw Error('Expired platform session');const token=randomBytes(32).toString('base64url');this.tickets.set(digest(token),{hash,expires:this.now()+this.ticketTtl});return token;}
 ticketIdentity(token){const entry=this.tickets.get(digest(token||''));return entry&&entry.expires>this.now()?this.parent(entry.hash):undefined;}
 takeTicket(token){const key=digest(token||'');const entry=this.tickets.get(key);this.tickets.delete(key);if(!entry||entry.expires<=this.now()||!this.parent(entry.hash))return;return entry;}
 claim(token){const entry=this.takeTicket(token);if(!entry)return;const credential=randomBytes(32).toString('base64url');this.credentials.set(digest(credential),{hash:entry.hash,expires:this.now()+this.credentialTtl});return credential;}
 current(token){const entry=this.credentials.get(digest(token||''));if(!entry||entry.expires<=this.now())return;const identity=this.parent(entry.hash);return identity?{...identity,credentialExpires:entry.expires}:undefined;}
 sweep(){for(const [key,e] of this.tickets)if(e.expires<=this.now()||!this.parent(e.hash))this.tickets.delete(key);for(const [key,e] of this.credentials)if(e.expires<=this.now()||!this.parent(e.hash)){this.credentials.delete(key);this.close(key);}}
 revokeParent(hash){
  for(const [key,e] of this.tickets)if(e.hash===hash)this.tickets.delete(key);
  for(const [key,e] of this.credentials)if(e.hash===hash){this.credentials.delete(key);this.close(key);}
 }
 connectionKey(token){return 'preview:'+digest(token||'');}
}
