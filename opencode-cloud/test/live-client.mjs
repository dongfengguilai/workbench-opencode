import https from 'node:https';
import {readFileSync} from 'node:fs';
export const cfg=JSON.parse(readFileSync('runtime/platform.json','utf8'));
export function request(path,{method='GET',body,cookie,headers={}}={}){return new Promise((resolve,reject)=>{const r=https.request(cfg.origin+path,{method,rejectUnauthorized:false,headers:{Origin:cfg.origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});}
export async function login(name='admin'){const r=await request('/api/auth/login',{method:'POST',body:{username:name,password:cfg.users[name].password}});if(r.status!==200)throw new Error('Actual login failed: '+r.status);return r.headers['set-cookie'][0].split(';')[0];}
