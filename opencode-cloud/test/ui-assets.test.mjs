import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadUi, uiPage } from '../src/ui-assets.mjs';
test('only listed immutable build files and exact native page routes are hosted', () => {
  const dir=mkdtempSync(tmpdir()+'/workbench-ui-');mkdirSync(dir+'/assets');
  writeFileSync(dir+'/index.html','<html>UI</html>');writeFileSync(dir+'/assets/app.js','app');
  const hash=s=>createHash('sha256').update(s).digest('hex');
  writeFileSync(dir+'/manifest.json',JSON.stringify({'/index.html':hash('<html>UI</html>'),'/assets/app.js':hash('app')}));
  const ui=loadUi(dir);assert.equal(ui.get('/assets/app.js').body.toString(),'app');
  for(const path of ['/manifest.json','/assets/../index.html','/unknown','/assets/unlisted.js'])assert.equal(ui.get(path),undefined);
  for(const path of ['/','/new-session','/L3dvcmtzcGFjZS9wcm9qZWN0/session','/server/YQ/session/ses_abc'])assert.equal(uiPage(path),true);
  for(const path of ['/config','/session','/api/session','/global/session','/no-page','/assets/a.js','/server/YQ/session/not-an-id'])assert.equal(uiPage(path),false);
  writeFileSync(dir+'/assets/app.js','tampered');assert.throws(()=>loadUi(dir),/digest/);
});
test('manifest path traversal and symlinks fail closed',()=>{
  const dir=mkdtempSync(tmpdir()+'/workbench-ui-');writeFileSync(dir+'/manifest.json',JSON.stringify({'/../secret':'bad'}));
  assert.throws(()=>loadUi(dir),/path/);
});
