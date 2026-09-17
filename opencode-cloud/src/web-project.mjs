import {readdir,lstat,readFile,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
const ignored=new Set(['node_modules','dist','coverage','test-results','playwright-report','.vite','.cache','.git','.playwright','.playwright-cli','.workbench-artifacts']);
export async function webProject(root='/workspace/project/web'){
 try{
  if(await realpath(root)!==root)return {available:false,present:true,reason:'网页目录不能是链接'};
  const index=await lstat(path.join(root,'index.html'));if(!index.isFile()||index.isSymbolicLink())return {available:false,present:true,reason:'缺少真实 web/index.html'};
  let kind='static',pkg;
  try{pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(pkg){if(pkg.scripts?.dev!=='vite')return {available:false,present:true,reason:'只支持锁定的 Vite 项目，dev 必须为 vite'};try{const lock=await lstat(path.join(root,'package-lock.json'));if(!lock.isFile()||lock.isSymbolicLink())throw Error('Vite 项目需要真实锁文件');}catch{return {available:false,present:true,reason:'Vite 项目缺少真实 package-lock.json'};}kind='vite';}

  const h=createHash('sha256');let count=0,bytes=0;
  async function visit(dir){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(ignored.has(e.name)||e.name.startsWith('.env'))continue;const file=path.join(dir,e.name),s=await lstat(file);if(s.isSymbolicLink())throw Error('网页源码含链接，自动预览未确认');if(s.isDirectory()){await visit(file);continue;}if(!s.isFile())continue;if(++count>2000||(bytes+=s.size)>32*1024*1024)throw Error('网页源码超过自动检查范围');h.update(path.relative(root,file)+'\0');h.update(await readFile(file));h.update('\0');}}
  await visit(root);return {available:true,present:true,kind,fingerprint:h.digest('hex')};
 }catch(e){if(e.code==='ENOENT')return {available:false,present:false,reason:'尚无网页项目'};return {available:false,present:true,reason:e.message};}
}
