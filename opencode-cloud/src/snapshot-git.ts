import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';import {mkdir,writeFile,readdir,lstat,readlink} from 'node:fs/promises';import {createHash} from 'node:crypto';
const execute=promisify(execFile);
// Detect ordinary concurrent writes without following links or reading secrets.
// This is a change detector, not a claim of a filesystem-wide atomic snapshot.
export async function watchExportSource(directory:string,excluded:(file:string)=>string|undefined){
 const changed=()=>{const error:any=Error('EXPORT_SOURCE_CHANGED: stop source writers before exporting');error.code='EXPORT_SOURCE_CHANGED';return error;};
 async function state(){
  const hash=createHash('sha256');
  async function visit(current:string){
   const entries=(await readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
   for(const entry of entries){
    const filename=path.join(current,entry.name),relative=path.relative(directory,filename).split(path.sep).join('/');
    if(excluded(relative))continue;
    const stat=await lstat(filename,{bigint:true});
    // Excluded build/cache children can change a parent's timestamps. The
    // included child inventory detects additions/deletions without that noise.
    if(stat.isDirectory()){hash.update(JSON.stringify([relative,'directory',String(stat.mode)]));await visit(filename);}
    else hash.update(JSON.stringify([relative,String(stat.dev),String(stat.ino),String(stat.mode),String(stat.size),String(stat.mtimeNs),String(stat.ctimeNs),stat.isSymbolicLink()?await readlink(filename):'']));
   }
  }
  try{await visit(directory);}catch(error:any){if(['ENOENT','ENOTDIR','ELOOP'].includes(error.code))throw changed();throw error;}
  return hash.digest('hex');
 }
 const before=await state();
 return async()=>{if(before!==await state())throw changed();};
}
// Never execute a project's .git/config filters, hooks, diff or archive drivers
// as the network guard UID. Only its immutable objects are shared as alternates.
export async function snapshotGit(directory:string,temporary:string){
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',GIT_LITERAL_PATHSPECS:'1'};
 for(const name of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete (env as any)[name];
 const head=(await execute('git',['-c','safe.directory='+directory,'rev-parse','--verify','HEAD'],{cwd:directory,env})).stdout.trim();
 const repository=path.join(temporary,'repository');await execute('git',['init','--bare','--quiet',repository],{env});
 await writeFile(path.join(repository,'info/attributes'),'* -export-ignore -export-subst\n');
 await mkdir(path.join(temporary,'empty'));
 const settings={...env,GIT_DIR:repository,GIT_WORK_TREE:directory,GIT_INDEX_FILE:path.join(temporary,'index'),GIT_ALTERNATE_OBJECT_DIRECTORIES:path.join(directory,'.git/objects')};
 const git=async(args:string[],archive=false)=>{const r=await execute('git',args,{cwd:directory,env:archive?{...settings,GIT_WORK_TREE:path.join(temporary,'empty')}:settings,encoding:'buffer',maxBuffer:64*1024*1024});return r.stdout as Buffer;};
 return {head,git};
}
