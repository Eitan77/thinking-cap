import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Controller,questions,validateAnswer,type Turn,type Result,type TranscriptEvent} from '../src/core';
const wait=()=>new Promise(r=>setTimeout(r,10));
function event(text:string,id='u1',isFinal=true):TranscriptEvent{return {sessionId:'s',utteranceId:id,text,isFinal,timestampMs:Date.now()};}
function fixture(){const turns:Turn[]=[],spoken:string[]=[];let result='SILENT';const c=new Controller({async ask(t){turns.push(t);return{text:result,firstTokenMs:1,totalMs:2};}},{async speak(text){spoken.push(text);},stop(){}});return{c,turns,spoken,setResult:(s:string)=>result=s};}
test('36-case question corpus detects candidates (expected model answers require live evaluation)',()=>{
  const corpus=JSON.parse(readFileSync(new URL('./question-corpus.json',import.meta.url),'utf8')) as {text:string;candidate:boolean}[];
  assert.equal(corpus.length,36);
  for(const sample of corpus)assert.equal(questions(sample.text).length>0,sample.candidate,sample.text);
});
test('detects questions without punctuation and skips ordinary/incomplete statements',()=>{
  for(const text of ["What's 21 squared",'How far is the moon','Can you explain gravity','Tell me the capital of Japan','What do I want for lunch?','Are you coming tonight?'])assert.equal(questions(text).length,1,text);
  for(const text of ['I was talking about...','I went to the store.',"What's the square root of",''])assert.equal(questions(text).length,0,text);
  assert.deepEqual(questions('What time is it? Where is Tokyo?'),['What time is it?','Where is Tokyo?']);
});
test('only exact SILENT is silent; malformed output never speaks',()=>{
  assert.deepEqual(validateAnswer(' SILENT\n'),{kind:'silent'});
  for(const text of ['','SILENT because I do not know.','x'.repeat(1201)])assert.equal(validateAnswer(text).kind,'error');
  assert.deepEqual(validateAnswer('21.93'),{kind:'answer',text:'21.93'});
});
test('off and partial revisions never request; one final ID only submits once',async()=>{
  const{c,turns}=fixture();c.transcript(event('What is two plus two?'));assert.equal(turns.length,0);
  c.setMode('auto');c.transcript(event('What is two', 'u1',false));assert.equal(turns.length,0);
  c.transcript(event('What is two plus two?'));c.transcript(event('What is two plus two?'));await wait();assert.equal(turns.length,1);
});
test('real repeated questions in distinct utterances are submitted separately',async()=>{
  const{c,turns}=fixture();c.setMode('auto');c.transcript(event('What is two plus two?','1'));c.transcript(event('What is two plus two?','2'));await wait();assert.equal(turns.length,2);
});
test('subjective questions still reach GPT once, silence produces no TTS',async()=>{
  const{c,turns,spoken}=fixture();c.setMode('auto');c.transcript(event('What do I want for lunch?'));await wait();assert.equal(turns.length,1);assert.equal(spoken.length,0);
});
test('button turn submits activated statements, ignores unactivated finals',async()=>{
  const{c,turns}=fixture();c.setMode('assistant');c.transcript(event('Explain gravity','1'));c.transcript(event('Explain gravity','2'),true);await wait();assert.equal(turns.length,1);
});
test('applying script cancels an old answer and supplies new instructions',async()=>{
  let resolve!:(r:Result)=>void;const spoken:string[]=[];const turns:Turn[]=[];
  const c=new Controller({ask(t){turns.push(t);if(turns.length===1)return new Promise(r=>resolve=r);return Promise.resolve({text:'SILENT',firstTokenMs:1,totalMs:2});}},{async speak(t){spoken.push(t);},stop(){}});
  c.setMode('auto');c.transcript(event('What is one?','1'));c.applyScript('Answer in Spanish.');c.transcript(event('What is two?','2'));resolve({text:'Stale answer',firstTokenMs:1,totalMs:2});await wait();
  assert.equal(spoken.length,0);assert.equal(turns[1].script,'Answer in Spanish.');assert.deepEqual(turns[1].history,[]);
});
test('off cancels queued questions and stale playback',async()=>{
  let resolve!:(r:Result)=>void;let calls=0;const spoken:string[]=[];
  const c=new Controller({ask(){calls++;return new Promise(r=>resolve=r);}},{async speak(t){spoken.push(t);},stop(){}});
  c.setMode('auto');c.transcript(event('What is one?','1'));c.transcript(event('What is two?','2'));c.setMode('off');resolve({text:'1',firstTokenMs:1,totalMs:2});await wait();assert.equal(calls,1);assert.equal(spoken.length,0);assert.equal(c.state,'OFF');
});
test('provider errors clear backlog, surface error, and never speak',async()=>{
  let calls=0;let error='';const c=new Controller({async ask(){calls++;throw new Error('quota');}},{async speak(){assert.fail('must not speak');},stop(){}});c.onError=e=>error=e;c.setMode('auto');c.transcript(event('What is one?','1'));c.transcript(event('What is two?','2'));await wait();assert.equal(calls,1);assert.equal(error,'quota');
});
