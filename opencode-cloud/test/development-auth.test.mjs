import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,scryptSync} from 'node:crypto';
import {validateAccount,authenticateAccount,authenticationProfile} from '../src/identity-auth.ts';
const password='isolated-development-test-password',salt=randomBytes(16);
const passwordHash='scrypt$32768$8$1$'+salt.toString('hex')+'$'+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
const account={authProvider:'local-engineer',role:'engineer',displayName:'Engineer B',passwordHash};
test('local engineering authentication requires an explicit development profile and never contacts NetID',async()=>{
 const never=()=>{throw Error('NetID must not be called for a local engineer');};
 assert.throws(()=>validateAccount('engineer-b',account),/profile/);
 assert.equal((await authenticateAccount('engineer-b',password,account,'https://unused.invalid',never,'development')).subject,'engineer-b');
 await assert.rejects(authenticateAccount('engineer-b','wrong',account,'',never,'development'),/Invalid credentials/);
 assert.throws(()=>validateAccount('admin',account,'development'),/profile/);
 assert.throws(()=>validateAccount('engineer-b',{...account,role:'admin'},'development'),/profile/);
 assert.throws(()=>validateAccount('engineer-b',{...account,password:'plaintext'},'development'),/Explicit/);
});
test('production launch rejects development configuration even when it contains valid hashes',()=>{
 assert.throws(()=>authenticationProfile({auth:{mode:'development'}}),/explicit development/);
 assert.throws(()=>authenticationProfile({auth:{mode:'development'}},'production'),/explicit development/);
 assert.throws(()=>authenticationProfile({auth:{mode:'mixed'}},'development'),/separate/);
 assert.throws(()=>authenticationProfile({},'automatic'),/Invalid/);
 assert.equal(authenticationProfile({auth:{mode:'development'}},'development'),'development');
 assert.equal(authenticationProfile({auth:{mode:'mixed'}}),'production');
});
