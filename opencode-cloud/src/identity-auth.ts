import {scrypt,timingSafeEqual} from 'node:crypto';
import {IntranetAuthClient,InvalidCredentialsError, type IntranetRequester} from './auth.ts';
export type AuthProfile='production'|'development';
export type Account = {authProvider:'local-admin'|'local-engineer'|'netid';role:'admin'|'engineer';displayName:string;passwordHash?:string;password?:string};
export function validateAccount(name:string,account:Account,profile:AuthProfile='production'){
 if(!name||!['local-admin','local-engineer','netid'].includes(account.authProvider)||!['admin','engineer'].includes(account.role)||account.password)throw Error('Explicit account authentication required');
 if(account.authProvider!=='netid'){
  const correctRole=account.authProvider==='local-admin'?name==='admin'&&account.role==='admin':profile==='development'&&name!=='admin'&&account.role==='engineer';
  if(!correctRole||!/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(account.passwordHash||''))throw Error('Invalid local account or authentication profile');
 }else if(account.passwordHash)throw Error('NetID cannot have a local password');
}
export function authenticationProfile(config:{auth?:{mode:string}},requested?:string):AuthProfile{
 if(requested!==undefined&&!['production','development'].includes(requested))throw Error('Invalid authentication profile');
 if(config.auth?.mode==='development'){
  if(requested!=='development')throw Error('Development authentication requires an explicit development launch');
  return 'development';
 }
 if(requested==='development')throw Error('Development launch requires a separate development configuration');
 return 'production';
}
export async function authenticateAccount(name:string,password:unknown,account:Account,baseUrl:string,requester?:IntranetRequester,profile:AuthProfile='production'){
 validateAccount(name,account,profile);
 if(typeof password!=='string'||!password||password.length>1024)throw new InvalidCredentialsError('Invalid credentials');
 if(account.authProvider!=='netid'){
  const parts=account.passwordHash!.split('$');
  const actual:Buffer=await new Promise((resolve,reject)=>scrypt(password,Buffer.from(parts[4],'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));
  if(!timingSafeEqual(actual,Buffer.from(parts[5],'hex')))throw new InvalidCredentialsError('Invalid credentials');
  return {provider:account.authProvider,subject:name,displayName:account.displayName};
 }
 const verified=await new IntranetAuthClient({intranetBaseUrl:baseUrl,intranetTimeoutSeconds:10,intranetVerifyTls:true,localAdminEnabled:false,localAdminUsername:'',localAdminPassword:'',localAdminDisplayName:'',requireExplicitSubject:true},requester).authenticate(name,password);
 if(verified.provider!=='intranet'||verified.subject!==name)throw new InvalidCredentialsError('Invalid credentials');
 return verified;
}
