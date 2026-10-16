import test from 'node:test';
import assert from 'node:assert/strict';
import {encryption} from '../server/dpapi';
test('real Windows DPAPI encrypts synthetic secrets and rejects corruption',{skip:process.platform!=='win32'},async()=>{
  const secret='synthetic-test-token-not-a-real-credential';const encrypted=await encryption.encrypt(secret);
  assert.equal(Buffer.from(encrypted).includes(Buffer.from(secret)),false);assert.equal(await encryption.decrypt(encrypted),secret);
  await assert.rejects(()=>Promise.resolve(encryption.decrypt(Buffer.from('corrupted'))));
});
