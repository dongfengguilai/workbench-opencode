import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
const execute=promisify(execFile);
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
