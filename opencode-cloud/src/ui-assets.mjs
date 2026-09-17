import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.json':'application/json','.ttf':'font/ttf'};
export function loadUi(root) {
  const manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
  const files=new Map();
  for(const [path,digest] of Object.entries(manifest)) {
    if(!/^\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').some(s=>s==='..'||s==='.')||path==='/manifest.json')throw Error('Invalid build path');
    let parent=root;for(const segment of path.slice(1).split('/')){parent+='/'+segment;if(lstatSync(parent).isSymbolicLink())throw Error('Invalid build path: symlink');}
    const body=readFileSync(root+path);if(createHash('sha256').update(body).digest('hex')!==digest)throw Error('Build digest mismatch: '+path);
    const ext=path.slice(path.lastIndexOf('.'));files.set(path,{body,type:mime[ext]||'application/octet-stream'});
  }
  if(!files.has('/index.html'))throw Error('UI entry missing');
  return files;
}
export function uiPage(path) {
  if(/^\/(api|global|session|pty|auth|__platform|experimental|mcp)\//.test(path))return false;
  return path==='/'||path==='/new-session'||/^\/server\/[A-Za-z0-9_-]+\/session\/ses_[\w-]+$/.test(path)||/^\/[A-Za-z0-9_-]+\/session(?:\/ses_[\w-]+)?$/.test(path);
}
