// Local boundary tests only; these do not represent real NetID acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {configureOrigins,sessionCookieName,previewCookieName,scopedCookieHeader} from '../src/preview-origin.mjs';
import {appCookie} from '../src/preview-proxy.mjs';
const origins={mj33kd:{workbench:'https://10.243.117.57:8443',preview:'https://10.243.117.57:8445'},admin:{workbench:'https://10.243.117.57:8447',preview:'https://10.243.117.57:8449'}};
const cookies={mj33kd:{session:'agent_session',preview:'workbench_preview'},admin:{session:'agent_session_admin',preview:'workbench_preview_admin'}};
test('shared IP requires complete, unique, maintained credential names',()=>{
 try{
  assert.throws(()=>configureOrigins(origins));
  assert.throws(()=>configureOrigins(origins,{mj33kd:cookies.mj33kd}));
  assert.throws(()=>configureOrigins(origins,{...cookies,admin:cookies.mj33kd}));
  assert.throws(()=>configureOrigins(origins,{...cookies,admin:{...cookies.admin,session:'unsafe; Domain=x'}}));
  configureOrigins(origins,cookies);
  for(const [name,pair] of Object.entries(origins)){
   assert.equal(sessionCookieName(pair.workbench),cookies[name].session);
   assert.equal(previewCookieName(pair.preview),cookies[name].preview);
  }
  assert.equal(sessionCookieName(origins.admin.preview),undefined);
  assert.equal(sessionCookieName('https://10.243.117.57:9999'),undefined);
 }finally{configureOrigins();}
});
test('each relay retains only its own credential and applications receive none',()=>{
 const header='agent_session=engineer; agent_session_admin=administrator; workbench_preview=e-preview; workbench_preview_admin=a-preview; ui=light';
 for(const name of Object.values(cookies).flatMap(pair=>Object.values(pair))){
  const retained=scopedCookieHeader(header,name).split(';').map(s=>s.trim());
  assert.equal(retained.length,2);
  assert.ok(retained.some(s=>s.startsWith(name+'=')));
  assert.ok(retained.includes('ui=light'));
 }
 assert.equal(appCookie(header).trim(),'ui=light');
 assert.equal(appCookie('AGENT_SESSION_ADMIN=secret; WORKBENCH_PREVIEW_ADMIN=secret'),'');
});
test('legacy separate hosts and local loopback keep original cookie names',()=>{
 try{
  configureOrigins({mj33kd:origins.mj33kd,admin:{workbench:'https://admin.workbench.internal:8443',preview:'https://preview.admin.workbench.internal:8445'}});
  assert.equal(sessionCookieName('https://admin.workbench.internal:8443'),'agent_session');
  configureOrigins();assert.equal(sessionCookieName('http://127.0.0.1:8444'),'agent_session');
 }finally{configureOrigins();}
});
