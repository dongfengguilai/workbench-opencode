import {mkdtemp,readdir,realpath,readlink,lstat,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {snapshotGit,watchExportSource} from './snapshot-git.ts';

const run=promisify(execFile);
import {exportPolicy,assertExportContent,type ExportExclusion} from './export-policy.ts';

// Validate the captured tree too: a working-tree link may change after walking.
export function validateSnapshotLinks(entries:{path:string;mode:string;target?:string}[],excluded=exportPolicy()) {
 const files=new Set(entries.map(e=>e.path)),directories=new Set(['']);
 const links=new Map(entries.filter(e=>e.mode==='120000').map(e=>[e.path,e.target!]));
 for(const file of files)for(let d=path.posix.dirname(file);d!=='.';d=path.posix.dirname(d))directories.add(d);
 for(const [file,target] of links) {
  const fail=()=>{throw Error('Unsafe snapshot symlink: '+file)};
  if(!target||path.posix.isAbsolute(target)||target.includes('\0'))fail();
  let pending=(path.posix.dirname(file)+'/'+target).split('/'),resolved:string[]=[],followed=0;
  while(pending.length) {
   const part=pending.shift()!;if(!part||part==='.')continue;
   if(part==='..'){if(!resolved.length)fail();resolved.pop();continue;}
   resolved.push(part);const current=resolved.join('/'),link=links.get(current);
   if(link!==undefined){if(++followed>40||!link||path.posix.isAbsolute(link)||link.includes('\0'))fail();resolved.pop();pending=link.split('/').concat(pending);continue;}
   if(!files.has(current)&&!directories.has(current))fail();
   if(pending.length&&!directories.has(current))fail();
  }
  const final=resolved.join('/');if(excluded(final)||(!files.has(final)&&!directories.has(final)))fail();
 }
}

export async function exportSource({directory,baseline,secrets=[],ownedPaths=[]}:{directory:string;baseline:string;secrets?:string[];ownedPaths?:string[]}) {
 const excluded=exportPolicy(ownedPaths);
 const exclusions:ExportExclusion[]=[];
 if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(baseline))throw Error('Invalid baseline');
 const root=await realpath(directory);
 const assertUnchanged=await watchExportSource(root,excluded);
 const selected:string[]=[];
 let selectedBytes=0;
 async function validate(current:string) {
  for(const entry of await readdir(current,{withFileTypes:true})) {
   const filename=path.join(current,entry.name);const relative=path.relative(root,filename).split(path.sep).join('/');
   const reason=excluded(relative);if(reason){exclusions.push({path:relative,reason});continue;}
   if(entry.isSymbolicLink()) {
    if(path.isAbsolute(await readlink(filename)))throw Error('Unsafe absolute symlink: '+relative);
    const target=path.relative(root,await realpath(filename));
    if(target==='..'||target.startsWith('../')||path.isAbsolute(target)||excluded(target))throw Error('Unsafe symlink: '+relative);
    selected.push(relative);
   }else if(entry.isDirectory())await validate(filename);else if(entry.isFile())selected.push(relative);else throw Error('Unsupported source entry: '+relative);
   if(selected.length>4096)throw Error('Source archive exceeds 4096 files');
   if(!entry.isDirectory()){selectedBytes+=(await lstat(filename)).size;if(selectedBytes>32*1024*1024)throw Error('Source archive exceeds 32 MiB');}
  }
 }
 await validate(root);
 const temporary=await mkdtemp(path.join(tmpdir(),'workbench-source-'));
 try {
  const {head,git}=await snapshotGit(root,temporary);
  await git(['cat-file','-e',baseline+'^{commit}']);
  await git(['read-tree','--empty']);
  for(let i=0;i<selected.length;i+=100)await git(['add','--force','--',...selected.slice(i,i+100)]);
  const entries=(await git(['ls-files','--stage','-z'])).toString().split('\0').filter(Boolean);
  if(entries.length>4096)throw Error('Source archive exceeds 4096 files');
  let bytes=0;
  const files=[];
  const captured=[];
  for(const entry of entries) {
   const match=/^(\d+) ([a-f0-9]+) \d\t([\s\S]+)$/.exec(entry)!;
   if(match[1]==='160000')throw Error('Source archive does not support submodules');
   const content=await git(['cat-file','blob',match[2]]);bytes+=content.length;
   if(bytes>32*1024*1024)throw Error('Source archive exceeds 32 MiB; dependencies and verification artifacts must remain excluded');
   assertExportContent(match[3],content,secrets);
   files.push({path:match[3],bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),mode:match[1]});
   captured.push({path:match[3],mode:match[1],target:match[1]==='120000'?content.toString():undefined});
  }
  validateSnapshotLinks(captured,excluded);
  const tree=(await git(['write-tree'])).toString().trim();
  const zip=await git(['archive','--worktree-attributes','--format=zip','--prefix=source/',tree],true);
  const archive=path.join(temporary,'source.zip');await writeFile(archive,zip);
  const manifest={baseline,head,tree,exportedAt:new Date().toISOString(),files,excluded:exclusions.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(path.join(temporary,'run.md'),'# WorkBench source export\n\nThe complete deliverable source is in source/. No baseline checkout is needed.\n\nFor a Vite/React project: cd source/web; npm ci --maxsockets=2 --fetch-retries=0; npm test; npm run build; npm run dev -- --host 127.0.0.1 --port 5173 --strictPort.\nFor plain HTML/CSS/JS: cd source/web; npx --yes vite@7.3.6 --host 127.0.0.1 --port 5173 --strictPort (downloads this fixed version if unavailable).\nRead the project README for its actual tests. An export is not proof that builds or tests passed.\nDependencies, credentials, browser state and verification artifacts are excluded; obtain dependencies from the lockfile.\n');
  await run('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"a",compression=zipfile.ZIP_DEFLATED); z.write(sys.argv[2],"WORKBENCH_EXPORT.json"); z.write(sys.argv[3],"WORKBENCH_RUN.md"); z.close()',archive,path.join(temporary,'manifest.json'),path.join(temporary,'run.md')]);
  const result=await readFile(archive);
  await assertUnchanged();
  return {...manifest,sha256:createHash('sha256').update(result).digest('hex'),zip:result};
 }finally{await rm(temporary,{recursive:true,force:true});}
}
