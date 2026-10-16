import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MemoryStore} from '../server/memory';
import {encryption} from '../server/dpapi';
test('memory is encrypted, account scoped, persistent and clearable',{skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'thinking-cap-memory-'));
  try {
    const store=new MemoryStore(directory,encryption);
    assert.deepEqual(await store.read('account-a'),{notes:'',enabled:false});
    await store.save('account-a',{notes:'Synthetic preference: metric units.',enabled:true});
    assert.equal((await readFile(join(directory,'account-a.json'),'utf8')).includes('metric'),false);
    assert.deepEqual(await new MemoryStore(directory,encryption).read('account-a'),{notes:'Synthetic preference: metric units.',enabled:true});
    assert.deepEqual(await store.read('account-b'),{notes:'',enabled:false});
    await store.save('account-a',{notes:'',enabled:false});assert.deepEqual(await store.read('account-a'),{notes:'',enabled:false});
    await assert.rejects(()=>store.read('../other'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
