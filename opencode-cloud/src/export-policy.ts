import path from 'node:path';

export type ExportExclusion = {path:string;reason:string};
// These locations belong to platform tooling, not to ordinary business modules.
const platformRoots=new Set(['.git','.opencode','.state','.workbench-artifacts','.playwright','.playwright-cli','.ssh','.aws','.kube','.cache']);
const outputRoots=new Set(['dist','coverage','test-results','playwright-report']);
const credentialName=/^(?:\.env(?:\..*)?|\.npmrc|\.netrc|id_rsa|id_ed25519|id_ecdsa|id_dsa)$/i;
const credentialExtension=/\.(?:key|pem|p12|pfx|jks|keystore)$/i;

export function exportPolicy(ownedPaths:string[]=[]){
 const owned=ownedPaths.map(value=>{
  if(!value||path.posix.isAbsolute(value)||value.includes('\\')||value.includes('\0')||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid platform-owned export path');
  return value;
 });
 return (file:string):string|undefined=>{
  const parts=file.split('/');
  if(parts.includes('.git'))return 'git-metadata';
  if(owned.some(p=>file===p||file.startsWith(p+'/')))return 'platform-owned';
  if(platformRoots.has(parts[0]))return 'platform-state-or-credential-store';
  if(parts.includes('node_modules'))return 'installed-dependencies';
  if(outputRoots.has(parts[0])||/^web\/(?:dist|\.vite)(?:\/|$)/.test(file))return 'build-or-test-output';
  if(credentialName.test(parts.at(-1)!)||credentialExtension.test(parts.at(-1)!))return 'credential-file';
 };
}

export function assertExportContent(file:string,content:Buffer,secrets:string[]=[]){
 const known=secrets.some(s=>s&&s.length>=8&&content.includes(Buffer.from(s)));
 // Detect explicit private-key/credential formats; do not treat names such as
 // credentials.ts or business variables named secret as evidence of a secret.
 const text=content.toString('utf8');
 const formatted=/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(text)||
  /(?:^|\n)\s*(?:\/\/[^\s]+\/)?(?:_authToken|_password)\s*=\s*[^\s]+/.test(text)||
  /\bmachine\s+\S+\s+login\s+\S+\s+password\s+\S+/.test(text);
 if(known||formatted){const error:any=Error('Sensitive credential content blocked in source file: '+JSON.stringify(file));error.code='EXPORT_SENSITIVE_CONTENT';throw error;}
}
