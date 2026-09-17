// Presentation-only trigger; native SDK remains the task/session source of truth.
export class PreviewTrigger {
 session:string|undefined;baseline:string|null|undefined;armed=false;running=false;generation=0;
 enter(session:string|undefined){this.session=session;this.baseline=undefined;this.armed=false;this.running=false;return ++this.generation}
 seed(generation:number,fingerprint:string|null){if(generation===this.generation&&this.baseline===undefined)this.baseline=fingerprint}
 state(running:boolean){const finished=this.armed&&this.running&&!running;if(running&&!this.running&&this.baseline!==undefined)this.armed=true;this.running=running;if(finished)this.armed=false;return finished}
 changed(generation:number,available:boolean,fingerprint:string|null,environmentBusy:boolean){if(generation!==this.generation||this.running||environmentBusy||this.baseline===undefined)return false;const previous=this.baseline;this.baseline=fingerprint;return available&&!!fingerprint&&previous!==fingerprint}
}
