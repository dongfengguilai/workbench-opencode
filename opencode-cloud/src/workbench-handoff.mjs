import {randomBytes,createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s||'').digest('hex');
export class WorkbenchHandoff {
 constructor({current,now=Date.now}){this.current=current;this.now=now;this.pending=new Map();}
 issue({token,origin,path}){this.sweep();const hash=digest(token);if(!this.current(hash))throw Error('Platform session expired');const ticket=randomBytes(32).toString('base64url');this.pending.set(digest(ticket),{token,hash,origin,path,expires:this.now()+30000});return origin+'/__platform/workbench/claim?ticket='+ticket;}
 take(ticket,origin){const key=digest(ticket),entry=this.pending.get(key);this.pending.delete(key);if(!entry||entry.origin!==origin||entry.expires<=this.now()||!this.current(entry.hash))return;return entry;}
 sweep(){for(const [key,e] of this.pending)if(e.expires<=this.now()||!this.current(e.hash))this.pending.delete(key);}
}
