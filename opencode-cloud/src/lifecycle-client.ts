import http from 'node:http';

export type SpaceState={state:'STOPPED'|'STARTING'|'READY'|'DRAINING'|'STOPPING'|'UNKNOWN',generation:number,blockers?:string[],lastError?:string,runningMembers?:number,deduplicated?:boolean,forced?:boolean};

export class LifecycleClient {
 private readonly socketPath:string;
 constructor(socketPath:string){this.socketPath=socketPath;}
 apply(space:string,action:'status'|'enter'|'stop'|'cancel'|'activity',requestId?:string):Promise<SpaceState>{
  if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(space))return Promise.reject(new Error('Invalid space'));
  if(!['status','enter','stop','cancel','activity'].includes(action))return Promise.reject(new Error('Invalid action'));
  if(!['status','activity'].includes(action)&&(!requestId||requestId.length>96||!/^[A-Za-z0-9_-]+$/.test(requestId)))return Promise.reject(new Error('Invalid request id'));
  if(action==='activity'&&requestId)return Promise.reject(new Error('Activity takes no request id'));
  const body=JSON.stringify({space,action,...(requestId?{requestId}:{})});
  return new Promise((resolve,reject)=>{
   const request=http.request({socketPath:this.socketPath,path:'/lifecycle',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
    let raw='';response.setEncoding('utf8');response.on('data',chunk=>{if(raw.length<8192)raw+=chunk;});response.on('end',()=>{
     if(response.statusCode!==200){reject(new Error(response.statusCode===409?'Lifecycle action refused':'Lifecycle controller unavailable'));return;}
     try{resolve(JSON.parse(raw));}catch{reject(new Error('Invalid lifecycle response'));}
    });
   });
   request.setTimeout(120000,()=>request.destroy(new Error('Lifecycle controller timeout')));
   request.on('error',()=>reject(new Error('Lifecycle controller unavailable')));request.end(body);
  });
 }
}
