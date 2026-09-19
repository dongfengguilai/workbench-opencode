export class LifecycleBarrier {
 private draining=false;
 private readonly writableConnections=new Set<()=>void>();
 drain(){
  this.draining=true;
  for(const close of [...this.writableConnections]){this.writableConnections.delete(close);try{close();}catch{}}
 }
 resume(){this.draining=false;}
 state(){return this.draining?'DRAINING':'READY';}
 allows(method:string|undefined,pathname:string){
  if(!this.draining)return true;
  if(method==='GET'||method==='HEAD')return true;
  return method==='POST'&&(pathname==='/__preview-control/stop'||pathname==='/__lifecycle/resume'||pathname==='/__lifecycle/drain');
 }
 register(close:()=>void){
  if(this.draining){close();return()=>{};}
  this.writableConnections.add(close);
  return()=>this.writableConnections.delete(close);
 }
}
