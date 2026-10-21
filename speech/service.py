"""Loopback-only local speech. No raw audio files or transcript logs are written."""
import asyncio
import io
import json
import os
import time
import uuid
import wave
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import Response
from faster_whisper import WhisperModel
from piper import PiperVoice
from silero_vad import load_silero_vad

ROOT = Path(__file__).resolve().parents[1]
WHISPER_MODEL = os.environ.get('THINKING_CAP_WHISPER_MODEL', 'base.en')
KEY = os.environ.get('THINKING_CAP_SPEECH_KEY')
if not KEY:
    raise RuntimeError('Start speech through the Thinking Cap helper.')
model = None
recognizers = {}
voice = None
ready = False
failure = None
inference_lock = asyncio.Lock()
voice_lock = asyncio.Lock()


def load_recognizer(name):
    return WhisperModel(name, device='cpu', compute_type='int8', cpu_threads=max(2, min(4, os.cpu_count() or 2)), num_workers=1, download_root=str(ROOT / '.local/models/whisper'))


def load_models():
    global model, voice, ready, failure
    try:
        torch.set_num_threads(1)
        model = load_recognizer(WHISPER_MODEL)
        recognizers[WHISPER_MODEL] = model
        voice = PiperVoice.load(str(ROOT / '.local/models/en_US-lessac-medium.onnx'))
        # Warm the ONNX VAD cache before accepting microphone connections.
        load_silero_vad(onnx=True)
        ready = True
        print('Local STT, VAD and Piper ready (CPU).', flush=True)
    except Exception as exc:
        failure = type(exc).__name__ + ': speech model initialization failed. Check downloads/setup.'
        print(failure, flush=True)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(asyncio.to_thread(load_models))
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)


def authorize(headers):
    if headers.get('x-speech-key') != KEY:
        raise HTTPException(403, 'Use the local app.')


@app.get('/health')
async def health(request: Request):
    authorize(request.headers)
    return {'ready': ready, 'error': failure, 'recognitionMode': 'fast' if WHISPER_MODEL == 'tiny.en' else 'quality', 'stt': f'faster-whisper {WHISPER_MODEL} / CPU int8', 'tts': 'Piper lessac', 'vad': 'Silero ONNX'}


@app.post('/recognition-mode')
async def recognition_mode(request: Request):
    global model, WHISPER_MODEL
    authorize(request.headers)
    data = await request.json()
    name = {'fast': 'tiny.en', 'quality': 'base.en'}.get(data.get('mode'))
    if name is None:
        raise HTTPException(400, 'Choose Fast or Quality recognition.')
    if not ready:
        raise HTTPException(503, 'Wait for local speech to finish starting.')
    # Use the same lock as transcription so the active recognizer cannot change mid-job.
    async with inference_lock:
        if name not in recognizers:
            try:
                recognizers[name] = await asyncio.to_thread(load_recognizer, name)
            except Exception:
                raise HTTPException(503, 'Could not load the recognizer. Previous mode is still active.')
        model = recognizers[name]
        WHISPER_MODEL = name
    return await health(request)


@app.post('/tts')
async def tts(request: Request):
    authorize(request.headers)
    if not ready:
        raise HTTPException(503, 'Models not ready')
    data = await request.json()
    text = data.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 1200:
        raise HTTPException(400, 'Invalid text')
    def synthesize():
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            voice.synthesize_wav(text, wav)
        return output.getvalue()
    async with voice_lock:
        audio = await asyncio.to_thread(synthesize)
    return Response(audio, media_type='audio/wav', headers={'Cache-Control': 'no-store'})


def transcribe(audio):
    segments, _ = model.transcribe(audio, language='en', beam_size=1, condition_on_previous_text=False, temperature=0, vad_filter=False, no_speech_threshold=0.6)
    return ' '.join(segment.text.strip() for segment in segments).strip()


@app.websocket('/listen')
async def listen(ws: WebSocket):
    if ws.headers.get('x-speech-key') != KEY:
        await ws.close(code=1008)
        return
    await ws.accept()
    if not ready:
        await ws.send_json({'type': 'error', 'message': failure or 'Speech models are warming up. Try again shortly.'})
        await ws.close()
        return
    session = str(uuid.uuid4())
    vad = await asyncio.to_thread(load_silero_vad, onnx=True)
    frames = []
    preroll = deque(maxlen=8)  # 256ms at 16kHz
    pending = np.empty(0, dtype=np.float32)
    samples = 0
    silence = 0
    speech_frames = 0
    utterance = str(uuid.uuid4())
    suppressed = False
    silence_ms = 400
    vad_threshold = 0.35
    revision = 0
    transcript_queue = asyncio.Queue(maxsize=8)

    def reset(invalidate=True):
        nonlocal frames, samples, silence, speech_frames, utterance, revision, pending
        frames = []; samples = 0; silence = 0; speech_frames = 0
        utterance = str(uuid.uuid4())
        if invalidate:
            revision += 1
        pending = np.empty(0, dtype=np.float32); preroll.clear(); vad.reset_states()

    async def inference_worker():
        while True:
            audio, uid, rev, queued_at, endpoint_ms = await transcript_queue.get()
            try:
                if rev != revision:
                    continue
                started = time.monotonic()
                async with inference_lock:
                    if rev != revision:
                        continue
                    text = await asyncio.to_thread(transcribe, audio)
                if rev != revision:
                    continue
                await ws.send_json({'type': 'transcript', 'sessionId': session, 'utteranceId': uid, 'text': text, 'isFinal': True, 'timestampMs': int(time.time()*1000), 'sttMs': round((time.monotonic()-queued_at)*1000), 'inferenceMs': round((time.monotonic()-started)*1000), 'endpointMs': endpoint_ms})
            except asyncio.CancelledError:
                raise
            except Exception:
                await ws.send_json({'type':'error','message':'Transcription failed. Restart listening.'})
            finally:
                transcript_queue.task_done()

    worker = asyncio.create_task(inference_worker())
    await ws.send_json({'type': 'ready', 'sessionId': session})

    async def finish():
        nonlocal frames, samples, silence, speech_frames, utterance
        if speech_frames >= 3 and frames:
            audio = np.concatenate(frames).copy()
            # Long endpoint silence need not be decoded again by Whisper.
            if silence > 3200:
                audio = audio[:len(audio)-silence+3200]
            if transcript_queue.full():
                await ws.send_json({'type':'error','message':'Speech processing fell behind. Stop and restart listening.'})
                raise RuntimeError('Speech backlog')
            transcript_queue.put_nowait((audio, utterance, revision, time.monotonic(), round(silence*1000/16000)))
            await ws.send_json({'type':'status','message':'Question ended — transcribing final audio…'})
        frames = []; samples = 0; silence = 0; speech_frames = 0
        utterance = str(uuid.uuid4()); preroll.clear()

    try:
        while True:
            msg = await ws.receive()
            if msg['type'] == 'websocket.disconnect':
                break
            if msg.get('text') is not None:
                command = json.loads(msg['text'])
                action = command.get('type')
                if action == 'configure':
                    silence_ms = max(400, min(2000, int(command.get('silenceMs', 400))))
                    vad_threshold = max(0.2, min(0.8, float(command.get('vadThreshold', 0.35))))
                elif action == 'arm':
                    reset()
                elif action == 'suppress':
                    suppressed = bool(command.get('value')); reset(invalidate=False)
                elif action == 'flush':
                    await finish()
                elif action == 'reset':
                    reset()
                continue
            raw = msg.get('bytes')
            if not raw or suppressed or len(raw) > 64000:
                continue
            # The frontend only sends data in auto mode or an explicitly armed turn.
            audio = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
            pending = np.concatenate((pending, audio))
            while len(pending) >= 512:
                frame = pending[:512].copy(); pending = pending[512:]
                probability = vad(torch.from_numpy(frame), 16000).item()
                speaking = probability >= vad_threshold
                preroll.append(frame)
                if not frames:
                    if not speaking:
                        continue
                    frames = list(preroll); samples = len(frames)*512; speech_frames = 1
                    await ws.send_json({'type':'status','message':'Hearing speech…'})
                else:
                    frames.append(frame); samples += 512
                    if speaking: speech_frames += 1
                silence = 0 if speaking else silence + 512
                # Limit each utterance to 30 seconds; do not silently submit truncated speech.
                if samples >= 30*16000:
                    reset()
                    await ws.send_json({'type':'error','message':'Utterance exceeded 30 seconds. Please use shorter questions.'})
                    break
                # Decode once at the endpoint. Rolling whole-utterance partials
                # consumed the same CPU/lock and could delay the final result.
                if silence*1000/16000 >= silence_ms:
                    await finish()
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception:
        try:
            await ws.send_json({'type':'error','message':'Local speech processing failed. Restart listening.'})
        except Exception:
            pass
    finally:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=4318, log_level='warning', access_log=False)
