import test from 'node:test';
import assert from 'node:assert/strict';
import {spokenText} from '../server/spoken-text';

test('removes the reported domain citation while retaining the GPU fact and source metadata',()=>{
  const sources=[{url:'https://www.nvidia.com/en-au/geforce/graphics-cards/50-series/rtx-5090/?utm_source=openai',title:'GeForce RTX 5090 Graphics Cards for Gamers and Creators | NVIDIA'}];
  const answer=`The RTX 5090’s reference boost clock is 2.41 GHz. ([nvidia.com](${sources[0].url}))`;
  assert.equal(spokenText(answer,sources),'The RTX 5090’s reference boost clock is 2.41 GHz.');
  assert.equal(sources.length,1);
});

test('removes citation forms without discarding linked answer text',()=>{
  assert.equal(spokenText('[Tokyo](https://example.com/tokyo) is the capital. citeturn0search0'),'Tokyo is the capital.');
  assert.equal(spokenText('2.41 GHz. [Source](https://example.com/spec_(GPU))'),'2.41 GHz.');
  assert.equal(spokenText('2.41 GHz. ([Specs](https://example.com))',[{url:'https://example.com',title:'Specs'}]),'2.41 GHz.');
  assert.equal(spokenText('2.41 GHz. (https://example.com/spec)'),'2.41 GHz.');
  assert.equal(spokenText('SILENT'),'SILENT');
});
