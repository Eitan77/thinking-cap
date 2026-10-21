import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechSentences} from '../server/speech-stream';
import {WindowsAI} from '../src/windows';

test('speech sentences stream before completion without splitting decimals or abbreviations',()=>{
  const chunks:string[]=[];const stream=new SpeechSentences(text=>chunks.push(text));
  stream.push('Dr. Smith measured 2.');assert.equal(chunks.length,0);
  stream.push('41 gigahertz. Next');assert.deepEqual(chunks,['Dr. Smith measured 2.41 gigahertz.']);
  stream.push(' sentence.');
  assert.equal(stream.finish(),'Dr. Smith measured 2.41 gigahertz. Next sentence.');
  assert.deepEqual(chunks,['Dr. Smith measured 2.41 gigahertz.','Next sentence.']);
});

test('silent, invalid and cited text never leak raw speech',()=>{
  const chunks:string[]=[];
  const silent=new SpeechSentences(text=>chunks.push(text));silent.push('SIL');silent.push('ENT');assert.equal(silent.finish(),'SILENT');assert.equal(chunks.length,0);
  const link=new SpeechSentences(text=>chunks.push(text));link.push('See [source](https://example.com). More');assert.equal(chunks.length,0);
  link.push(' detail.');link.finish();assert.deepEqual(chunks,['See. More detail.']);
  const invalid=new SpeechSentences(()=>assert.fail('invalid text must not speak'));invalid.push('SILENT but answer. ');assert.throws(()=>invalid.finish());
  assert.throws(()=>new SpeechSentences(()=>{}).push('x'.repeat(1201)));
});

test('browser reads split stream frames, rejects incomplete/error streams, and forwards cancellation',async()=>{
  const originalFetch=globalThis.fetch;const chunks:string[]=[];const ai=new WindowsAI();ai.model='test';
  const turn={id:'test',question:'Explain gravity',script:'Short answers',history:[]};
  const ac=new AbortController();
  try {
    globalThis.fetch=async(_url,init)=>{
      assert.equal(init?.signal,ac.signal);
      const data='{"type":"speech","text":"First sentence."}\n{"type":"result","result":{"text":"First sentence.","firstTokenMs":1,"totalMs":2}}\n';
      return new Response(new ReadableStream({start(controller){for(const part of [data.slice(0,9),data.slice(9,49),data.slice(49)])controller.enqueue(new TextEncoder().encode(part));controller.close();}}));
    };
    const result=await ai.ask(turn,ac.signal,text=>chunks.push(text));assert.equal(result.text,'First sentence.');assert.deepEqual(chunks,['First sentence.']);
    globalThis.fetch=async()=>new Response('{"type":"speech","text":"First sentence."}\n');
    await assert.rejects(ai.ask(turn,ac.signal),/before completion/);
    globalThis.fetch=async()=>new Response('{"type":"error","error":"Disconnected"}\n');
    await assert.rejects(ai.ask(turn,ac.signal),/Disconnected/);
    ac.abort();await assert.rejects(ai.ask(turn,ac.signal),{name:'AbortError'});
  } finally {globalThis.fetch=originalFetch;}
});
