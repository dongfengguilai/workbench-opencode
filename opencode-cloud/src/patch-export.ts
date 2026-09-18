import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {snapshotGit,watchExportSource} from './snapshot-git.ts';
import {createHash} from 'node:crypto';
import {exportPolicy,assertExportContent,type ExportExclusion} from './export-policy.ts';
import {validateSnapshotLinks} from './source-export.ts';

const execFileAsync = promisify(execFile);
const fullSha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

async function assertSafeSymlinks(directory: string,isExcluded:ReturnType<typeof exportPolicy>): Promise<void> {
  const root = await realpath(directory);
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' && current === directory) continue;
      const entryPath = path.join(current, entry.name);
      if(isExcluded(path.relative(root,entryPath).split(path.sep).join('/')))continue;
      if (entry.isSymbolicLink()) {
        let target: string;
        try {
          target = await realpath(entryPath);
        } catch {
          throw new Error(`Unsafe symlink: ${path.relative(directory, entryPath)}`);
        }
        const relative = path.relative(root, target);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)||isExcluded(relative.split(path.sep).join('/'))) {
          throw new Error(`Unsafe symlink: ${path.relative(directory, entryPath)}`);
        }
      } else if (entry.isDirectory()) {
        await visit(entryPath);
      }
    }
  }
  await visit(directory);
}

async function git(directory: string, index: string, args: string[]): Promise<Buffer> {
  const result = await execFileAsync('git', args, {
    cwd: directory,
    env: { ...process.env, GIT_INDEX_FILE: index },
    maxBuffer: Number.POSITIVE_INFINITY,
    encoding: 'buffer',
  });
  return result.stdout as Buffer;
}

function nulSeparated(output: Buffer): string[] {
  return output.toString('utf8').split('\0').filter(Boolean);
}

export async function exportPatch({ directory, baseline,secrets=[],ownedPaths=[] }: { directory: string; baseline: string;secrets?:string[];ownedPaths?:string[] }): Promise<{
  baseline: string;
  files: string[];
  patch: string;
  head:string;tree:string;exportedAt:string;sha256:string;excluded:ExportExclusion[];
}> {
  const isExcluded=exportPolicy(ownedPaths);
  if (!fullSha.test(baseline)) throw new Error('Invalid baseline: a full commit SHA is required');

  const repository = path.resolve(directory);
  let head: string;
  try {
    head = (await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repository })).stdout.trim();
  } catch {
    throw new Error('Invalid repository: unable to read HEAD');
  }
  if (head !== baseline) throw new Error(`Baseline mismatch: requested ${baseline}, repository HEAD is ${head}`);

  const assertUnchanged=await watchExportSource(repository,isExcluded);
  await assertSafeSymlinks(repository,isExcluded);

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'opencode-patch-index-'));
  const index = path.join(temporaryDirectory, 'index');
  try {
    const snapshot=await snapshotGit(repository,temporaryDirectory);
    const git=(_directory:string,_index:string,args:string[])=>snapshot.git(args);
    await git(repository, index, ['read-tree', baseline]);
    await git(repository, index, ['add', '-A', '--', '.']);

    const baselineFiles = nulSeparated(await git(repository, index, ['ls-tree', '-r', '--name-only', '-z', baseline]));
    const indexedFiles = nulSeparated(await git(repository, index, ['ls-files', '-z']));
    const excluded = [...new Set([...baselineFiles, ...indexedFiles].filter(isExcluded))];
    if (excluded.length > 0) {
      const excludedBaseline = excluded.filter(file => baselineFiles.includes(file));
      for (let i=0;i<excludedBaseline.length;i+=100) await git(repository, index, ['reset', baseline, '--', ...excludedBaseline.slice(i,i+100)]);
      const excludedAdditions = excluded.filter(file => !baselineFiles.includes(file));
      for (let i=0;i<excludedAdditions.length;i+=100) await git(repository, index, ['update-index', '--force-remove', '--', ...excludedAdditions.slice(i,i+100)]);
    }

    const files = nulSeparated(await git(repository, index, ['diff', '--cached', '--name-only', '-z', baseline, '--']));
    if(files.length>4096)throw Error('Patch exceeds 4096 changed files');
    let bytes=0;
    for(const file of files){
      const refs=[...(baselineFiles.includes(file)?[baseline+':'+file]:[]),...(indexedFiles.includes(file)?[':'+file]:[])];
      for(const ref of refs){
        const content=await git(repository,index,['cat-file','blob',ref]);
        bytes+=content.length;if(bytes>64*1024*1024)throw Error('Patch source exceeds 64 MiB including baseline and captured content');
        assertExportContent(file,content,secrets);
      }
    }
    const captured=[];
    for(const entry of nulSeparated(await git(repository,index,['ls-files','--stage','-z']))){
      const m=/^(\d+) ([a-f0-9]+) \d\t([\s\S]+)$/.exec(entry)!;
      if(isExcluded(m[3]))continue;
      if(m[1]==='160000')throw Error('Patch does not support submodules');
      captured.push({path:m[3],mode:m[1],target:m[1]==='120000'?(await git(repository,index,['cat-file','blob',m[2]])).toString():undefined});
    }
    validateSnapshotLinks(captured,isExcluded);
    const tree=(await git(repository,index,['write-tree'])).toString().trim();
    const patch = (await git(repository, index, ['diff', '--cached', '--binary', '--full-index', baseline, '--'])).toString('utf8');
    await assertUnchanged();
    return { baseline, head:snapshot.head,tree,exportedAt:new Date().toISOString(),files, patch,sha256:createHash('sha256').update(patch).digest('hex'),excluded:excluded.map(path=>({path,reason:isExcluded(path)!})) };
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
