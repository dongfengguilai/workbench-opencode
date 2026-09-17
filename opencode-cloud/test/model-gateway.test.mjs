import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('single model boundary rejects unauthorized, management and model override requests', async () => {
  const proc = spawn(process.execPath, ['--experimental-strip-types', 'src/model-gateway.ts'], {
    env: { ...process.env, PORT: '18319', MODEL_UPSTREAM: 'http://127.0.0.1:1', MODEL_MASTER_KEY: 'unit-test-only', ENV_MODEL_TOKEN: 'unit-test-token' },
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
    assert.equal((await fetch(base + '/v1/config', { headers })).status, 404);
    assert.equal((await fetch(base + '/v1/chat/completions?url=http://example.com', { method:'POST', headers, body:JSON.stringify({model:'gpt-5.6-luna'}) })).status, 404);
    assert.equal((await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:JSON.stringify({model:'other-model', messages:[]}) })).status, 403);
    assert.equal((await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:'{' })).status, 400);
    const unavailable = await fetch(base + '/v1/chat/completions', { method:'POST', headers, body:JSON.stringify({model:'gpt-5.6-luna', messages:[]}) });
    assert.equal(unavailable.status, 502);
    assert.ok(!(await unavailable.text()).includes('unit-test-only'));
  } finally { if (proc.exitCode === null) { proc.kill(); await once(proc, 'exit'); } }
});
