import test from 'node:test';
import assert from 'node:assert/strict';
import {listModels} from '../vendor/siwc-local/src/models';
import {streamResponse} from '../vendor/siwc-local/src/responses';
test('account catalog efforts survive parsing and selected effort reaches Responses',async()=>{
  const original=globalThis.fetch;let sent:any;
  globalThis.fetch=async(input,init)=>{
    if(String(input).endsWith('/models'))return Response.json({models:[{slug:'gpt-6.1-sol',display_name:'GPT-6.1-Sol',visibility:'list',default_reasoning_level:'low',supported_reasoning_levels:[{effort:'low'},{effort:'medium'}]}]});
    sent=JSON.parse(typeof init?.body==='string'?init.body:await (input as Request).clone().text());
    return new Response('data: {"type":"response.output_text.delta","delta":"441"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',{headers:{'Content-Type':'text/event-stream'}});
  };
  try{
    const models=await listModels('synthetic-credential',new AbortController().signal);
    assert.deepEqual(models[0].supportedEfforts,['low','medium']);assert.equal(models[0].defaultEffort,'low');
    const result=await streamResponse('synthetic-credential',{model:'gpt-6.1-sol',effort:'low',input:'What is 21 squared?'},new AbortController().signal);
    assert.equal(result.text,'441');assert.deepEqual(sent.reasoning,{effort:'low'});assert.equal(sent.store,false);
  }finally{globalThis.fetch=original;}
});
test('web search forwards the tool and preserves source annotations',async()=>{
  const original=globalThis.fetch;let sent:any;
  globalThis.fetch=async(input,init)=>{
    sent=JSON.parse(typeof init?.body==='string'?init.body:await(input as Request).clone().text());
    const events=[{type:'response.web_search_call.completed'},{type:'response.output_text.delta',delta:'A current fact.'},{type:'response.output_text.annotation.added',annotation:{type:'url_citation',url:'https://example.com/fact',title:'Source'}},{type:'response.completed',response:{output:[]}}];
    return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
  };
  try{const result=await streamResponse('synthetic-credential',{model:'gpt-6.1-sol',effort:'low',webSearch:true,input:'Current fact?'},new AbortController().signal);assert.deepEqual(sent.tools,[{type:'web_search'}]);assert.equal(result.searched,true);assert.deepEqual(result.sources,[{url:'https://example.com/fact',title:'Source'}]);}
  finally{globalThis.fetch=original;}
});
