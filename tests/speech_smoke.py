"""Real local speech integration with synthetic audio; never opens the microphone."""
import asyncio
import io
import json
import time
import urllib.request
import wave
import numpy as np
from websockets.asyncio.client import connect

ORIGIN='http://127.0.0.1:4317'

def synthesize(text):
    req=urllib.request.Request(ORIGIN+'/api/tts',data=json.dumps({'text':text}).encode(),headers={'Content-Type':'application/json','Origin':ORIGIN})
    with urllib.request.urlopen(req,timeout=60) as response:
        raw=response.read()
    assert raw[:4]==b'RIFF', 'TTS did not produce WAV'
    with wave.open(io.BytesIO(raw),'rb') as wav:
        assert wav.getsampwidth()==2 and wav.getnchannels()==1
        samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)
        rate=wav.getframerate()
    resampled=np.interp(np.arange(0,len(samples),rate/16000),np.arange(len(samples)),samples)
    return np.concatenate([np.zeros(8000),resampled,np.zeros(20000)]).astype('<i2')

async def main():
    with urllib.request.urlopen(ORIGIN+'/api/health') as response:
        assert json.load(response)['ready'], 'Wait for local speech models to warm up'
    samples=await asyncio.to_thread(synthesize,'What is the capital of Japan?')
    started=time.monotonic()
    async with connect('ws://127.0.0.1:4317/speech',origin=ORIGIN,max_size=128000) as ws:
        ready=json.loads(await ws.recv());assert ready['type']=='ready', ready
        async def send():
            for start in range(0,len(samples),1024):
                await ws.send(samples[start:start+1024].tobytes())
                await asyncio.sleep(0.064)
        sender=asyncio.create_task(send())
        partials=0
        try:
            while True:
                event=json.loads(await asyncio.wait_for(ws.recv(),40))
                assert event['type']!='error',event
                if event.get('type')=='transcript':
                    if event['isFinal']:
                        assert 'capital' in event['text'].lower() and 'japan' in event['text'].lower(),event
                        print(json.dumps({'result':'PASS','transcript':event['text'],'partialEvents':partials,'elapsedSeconds':round(time.monotonic()-started,2)}))
                        break
                    partials+=1
        finally:
            sender.cancel()
            try: await sender
            except asyncio.CancelledError: pass

asyncio.run(main())
