"""Synthetic microphone regression: ordinary, conversational, and quiet questions."""
import asyncio
import json
import time
from speech_smoke import synthesize
from websockets.asyncio.client import connect

async def main():
    cases=[('Um, what is twenty one squared?', ['squared'],1.0),('What is the capital of Japan?', ['japan'],1.0),('What do I want for lunch?', ['lunch'],0.2),('What is the date today?', ['date','day'],1.0)]
    results=[]
    async with connect('ws://127.0.0.1:4317/speech',origin='http://127.0.0.1:4317',max_size=128000) as ws:
        assert json.loads(await ws.recv())['type']=='ready'
        await ws.send(json.dumps({'type':'configure','silenceMs':500,'vadThreshold':0.35}))
        ids=set()
        for text,keyword,volume in cases:
            samples=await asyncio.to_thread(synthesize,text)
            samples=(samples.astype('float32')*volume).astype('<i2')
            async def send():
                for start in range(0,len(samples),1024):
                    await ws.send(samples[start:start+1024].tobytes())
                    await asyncio.sleep(0.064)
            sender=asyncio.create_task(send())
            try:
                while True:
                    event=json.loads(await asyncio.wait_for(ws.recv(),30))
                    assert event['type']!='error',event
                    if event.get('type')=='transcript' and event['isFinal']:
                        # Day/date is a known acoustic ambiguity; clock context
                        # intentionally returns weekday + date for either wording.
                        assert any(word in event['text'].lower() for word in keyword),event
                        assert event['utteranceId'] not in ids
                        ids.add(event['utteranceId'])
                        results.append({'text':event['text'],'sttMs':event.get('sttMs'),'endpointMs':event.get('endpointMs'),'volume':volume})
                        break
            finally:
                await sender
        print(json.dumps({'result':'PASS','cases':results}))

asyncio.run(main())
