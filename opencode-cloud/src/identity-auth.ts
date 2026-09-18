import {scrypt,timingSafeEqual} from 'node:crypto';
import {IntranetAuthClient,InvalidCredentialsError, type IntranetRequester} from './auth.ts';
export type Account = {authProvider:'local-admin'|'netid';role:'admin'|'engineer';displayName:string;passwordHash?:string;password?:string};
export function validateAccount(name:string,account:Account){
 if(!name||!['local-admin','netid'].includes(account.authProvider)||!['admin','engineer'].includes(account.role)||account.password)throw Error('Explicit account authentication required');
 if(account.authProvider==='local-admin'){
  if(name!=='admin'||account.role!=='admin'||!/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(account.passwordHash||''))throw Error('Invalid local administrator hash');
 }else if(account.passwordHash)throw Error('NetID cannot have a local password');
}
export async function authenticateAccount(name:string,password:unknown,account:Account,baseUrl:string,requester?:IntranetRequester){
 validateAccount(name,account);
 if(typeof password!=='string'||!password||password.length>1024)throw new InvalidCredentialsError('Invalid credentials');
 if(account.authProvider==='local-admin'){
  const parts=account.passwordHash!.split('$');
  const actual:Buffer=await new Promise((resolve,reject)=>scrypt(password,Buffer.from(parts[4],'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));
  if(!timingSafeEqual(actual,Buffer.from(parts[5],'hex')))throw new InvalidCredentialsError('Invalid credentials');
  return {provider:'local-admin' as const,subject:name,displayName:account.displayName};
 }
 const verified=await new IntranetAuthClient({intranetBaseUrl:baseUrl,intranetTimeoutSeconds:10,intranetVerifyTls:true,localAdminEnabled:false,localAdminUsername:'',localAdminPassword:'',localAdminDisplayName:'',requireExplicitSubject:true},requester).authenticate(name,password);
 if(verified.provider!=='intranet'||verified.subject!==name)throw new InvalidCredentialsError('Invalid credentials');
 return verified;
}
