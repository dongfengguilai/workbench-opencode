import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('single model boundary rejects unauthorized, management and model override requests', async () => {
  const budgetDir=await mkdtemp(path.join(tmpdir(),'gateway-budget-'));
  const proc = spawn(process.execPath, ['--experimental-strip-types', 'src/model-gateway.ts'], {
    env: { ...process.env, PORT: '18319', MODEL_BUDGET_FILE:path.join(budgetDir,'budget.json'),MODEL_DAILY_REQUEST_LIMIT:'2', MODEL_UPSTREAM: 'http://127.0.0.1:1', MODEL_MASTER_KEY: 'unit-test-only', QWEN_UPSTREAM:'http://127.0.0.1:2',QWEN_MASTER_KEY:'unit-qwen-only', ENV_MODEL_TOKEN: 'unit-test-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let output = '';
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', b => { output += b; if (output.includes('listening')) resolve(); });
      proc.once('exit', () => reject(new Error('gateway exited before listening')));
      setTimeout(() => reject(new Error('gateway readiness timeout')), 5000).unref();
    });
    const base = 'http://127.0.0.1:18319';
    assert.equal((await fetch(base + '/v1/models')).status, 401);
    const headers = { Authorization: 'Bearer unit-test-token', 'Content-Type': 'application/json' };
    assert.deepEqual((await (await fetch(base+'/v1/models',{headers})).json()).data.map(x=>x.id),['gpt-5.6-luna','Qwen3.6-35B-A3B']);
    assert.equal((await fetch(base+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'Qwen3.6-35B-A3B'})})).status,404);
    assert.equal((await fetch(base + '/v1/config', { headers })).status, 404);
    assert.equal((await fetch(base + '/v1/chat/completions?url=http://example.com', { method:'POST', headers, body:JSON.stringify({model:'gpt-5.6-luna'}) })).status, 404);
    assert.equal((await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:JSON.stringify({model:'other-model', messages:[]}) })).status, 403);
    assert.equal((await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:'{' })).status, 400);
    const unavailable = await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:JSON.stringify({model:'gpt-5.6-luna', messages:[]}) });
    assert.equal(unavailable.status, 424);
    assert.ok(!(await unavailable.text()).includes('unit-test-only'));
    const qwen=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'Qwen3.6-35B-A3B',messages:[]})});
    assert.equal(qwen.status,424);assert.ok(!(await qwen.text()).includes('unit-qwen-only'));
    const over=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:'gpt-5.6-luna',messages:[]})});
    assert.equal(over.status,403);assert.match(await over.text(),/budget/i);
    assert.equal(JSON.parse(await readFile(path.join(budgetDir,'budget.json'),'utf8')).count,2);
  } finally { if (proc.exitCode === null) { proc.kill(); await once(proc, 'exit'); } await rm(budgetDir,{recursive:true,force:true}); }
});

test('raising a gateway limit preserves its already consumed daily budget', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'gateway-limit-'));
  const budgetFile=path.join(dir,'budget.json');
  const day=new Date().toISOString().slice(0,10);
  await writeFile(budgetFile,JSON.stringify({day,count:250}));
  try {
    for(const [limit,status,count] of [[100000,424,251],[250,403,251]]) {
      const proc=spawn(process.execPath,['--experimental-strip-types','src/model-gateway.ts'],{
        env:{...process.env,PORT:'18320',MODEL_BUDGET_FILE:budgetFile,MODEL_DAILY_REQUEST_LIMIT:String(limit),MODEL_UPSTREAM:'http://127.0.0.1:1',MODEL_MASTER_KEY:'unit-only',ENV_MODEL_TOKEN:'unit-token',QWEN_UPSTREAM:'',QWEN_MASTER_KEY:''},
        stdio:['ignore','pipe','pipe'],
      });
      try {
        await new Promise((resolve,reject)=>{
          proc.stdout.on('data',b=>{if(b.toString().includes('listening'))resolve();});
          proc.once('exit',()=>reject(Error('Gateway exited before ready')));
          setTimeout(()=>reject(Error('Gateway readiness timeout')),5000).unref();
        });
        const response=await fetch('http://127.0.0.1:18320/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer unit-token','Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',messages:[]})});
        assert.equal(response.status,status);
        assert.deepEqual(JSON.parse(await readFile(budgetFile,'utf8')),{day,count});
      } finally {if(proc.exitCode===null){proc.kill();await once(proc,'exit');}}
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
