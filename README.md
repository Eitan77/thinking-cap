# Thinking Cap

A Windows voice-assistant prototype with editable session instructions, local speech recognition and speech output, and official Sign in with ChatGPT plan access.

## Run on Windows

Requires Node.js 22+, pnpm 11+, Python 3.11/3.12, and an eligible ChatGPT account. Setup downloads CPU speech dependencies, a Whisper model, and a Piper voice. No cloud speech account or API key is needed. The scripts also discover the bundled Codex runtimes on this development machine.

```powershell
./scripts/setup.ps1
./scripts/start.ps1
```

Open **http://127.0.0.1:4317**. The local speech models warm up on startup; the first Whisper startup downloads its model. The helper starts the Python speech service automatically. Leave the terminal running; Ctrl+C stops it. Only one instance can use these ports.

1. In **Connect ChatGPT**, click **Continue with ChatGPT**, then **Open ChatGPT sign-in** when the link appears. Complete authorization and return to the app. The model picker loads your account's actual catalog. Identity-only sign-in does not enable inference. Cancel sign-in is available throughout.
2. In **Tell it how to respond**, edit the instructions and click **Save instructions**, or keep the ready default. The applied script is sent with every question; the last four answered turns supply bounded conversation context. Saving persists the script in this browser, cancels pending work and clears context.
3. In **Ask something**, try a typed question, click **Speak once**, or choose **Auto**. The page explains missing prerequisites when you click a control. **Stop / mic off** cancels everything.
4. **Check your audio** has independent speaker and 15-second microphone tests, usable before sign-in. These tests never call GPT. Allow microphone access when requested. The transcript appears under Heard.

### Modes

- **Off:** microphone released; active/queued requests and playback cancelled.
- **Auto:** microphone audio goes to the localhost speech service. Each completed question detected locally is sent once as its own GPT prompt, including subjective questions. GPT follows your script and decides what to answer. Ordinary statements do not trigger inference. Multiple questions are queued in order. There is no speaker identification: use Auto only in an appropriate, user-controlled setting.
- **One question at a time:** microphone opens only when **Speak once** is clicked. A silence endpoint or **Finish & send** submits that utterance, including non-question instructions, then releases the microphone. Typed questions also work without microphone access or selecting a mode first.

The default script asks for minimal answers and exactly `SILENT` when information is missing. You may replace it. Exact `SILENT` is never spoken; empty, malformed, incomplete, failed, and oversized responses are suppressed. Audio capture is locked out while an answer plays and for 250 ms afterwards. Speech during that interval is not captured for later submission. This MVP has no barge-in or wearer recognition.

### Model effort and latency

The model and **Reasoning effort** selectors use your account's live catalog. Both selections are saved in this browser. GPT-6.1 Sol defaults to its fastest listed effort, currently **Low** for this connection. This is not an Instant/no-reasoning mode; unsupported values are rejected before inference. The DevKit extension forwards the selected `reasoning.effort` to Responses without changing authentication or encrypted token custody.

The initial endpoint pause is now 500 ms, with sensitive local VAD for quiet speech. Both are adjustable under microphone settings. Partial transcriptions are limited to one queued/running job; final transcriptions get priority and skip trailing endpoint silence. Completed questions that arrive late from STT during playback stay queued. Live audio remains suppressed during playback and a 250 ms cooldown.

The question panel reports the last trigger/silence decision and separate pause, local transcription, GPT, and voice timings. **Edit / resend heard text** lets you correct recognition or retry a skipped question. A SILENT result is a model decision under the applied script, not a transcription miss. Measurements are local software timing, not a physical Bluetooth benchmark.

Each request includes the current device-clock date/time formatted for the browser's timezone. This makes questions such as “What is the date today?” answerable without web search. It does not provide calendar access or establish other current events.

**Auto detection is heuristic, not guaranteed recognition of every question.** It uses local VAD, a configurable silence window, partial transcript stability, question syntax and punctuation. A long hesitation can still split a question; try a longer pause setting if qualifiers are clipped. Utterances over 30 seconds are rejected rather than silently truncated. English is the initial language.

### Instructions and privacy

Instructions are stored in this browser's local storage only when Save instructions is clicked and restored on reload. Transcripts, answers and conversation history stay in page memory and disappear on reload. Recent debug turns are opt-in (maximum 30) and can be cleared. Clearing conversation clears debug turns and pending requests too; saved instructions remain applied. There is no persistent raw audio recording or transcript log. No personal script, token, audio model, or personal debug output belongs in Git.

Only finalized submitted text, the applied instruction script, and bounded answered-turn context go to OpenAI. Audio is processed locally. No calendar, web-search tool, paid API fallback, wake phrase, iPhone audio, or external action integration is enabled.

OAuth tokens and account labels live under `%LOCALAPPDATA%/ThinkingCap/chatgpt`, outside the repository, encrypted with **Windows DPAPI CurrentUser**. The official DevKit handles PKCE, nonce/state checking, token validation, refresh and disconnect. Tokens never go to the browser. Sign-out removes local tokens and attempts remote revocation; check ChatGPT settings if it reports a revocation failure. User scripts are not a security boundary for model behavior.

The Node helper binds to `127.0.0.1:4317`. Its HTTP and WebSocket interfaces validate hosts/origins; mutations require JSON from the app origin. The Python service binds to `127.0.0.1:4318` and requires a random per-launch credential passed only in its environment and the private local proxy. Do not expose either port on a network.

### Troubleshooting

- **Local speech warming up:** allow initial downloads to finish. The status will change to Local speech ready. Inspect terminal errors if it stays unavailable.
- **No plan access/models:** the account must grant ChatGPT plan usage and be eligible; reconnect or inspect [ChatGPT usage settings](https://chatgpt.com/settings/usage). There is no automatic switch to API billing.
- **Microphone missing:** browser settings must allow localhost microphone access. Windows privacy settings must permit desktop microphone access. The device picker populates after the first microphone permission grant.
- **No sound:** click Test speakers and check the Windows default output, volume and Bluetooth connection.
- **CPU slow:** the initial recognizer uses `base.en` / int8 on CPU. Set `THINKING_CAP_WHISPER_MODEL=tiny.en` before startup to trade accuracy for speed. Models stay warm; inference runs outside the UI thread.
- **Port occupied:** stop the prior instance. A speech service from another launch deliberately rejects the new helper's credential.

## Development and checks

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm start
# With the local helper running and speech ready (synthetic audio, no microphone):
./.venv/Scripts/python.exe tests/speech_smoke.py
```

`pnpm dev` runs Expo Web at localhost:8081; also run `pnpm server` for speech/auth. Production export is served directly by the same Node helper. The Expo project includes an iOS target, but native audio and auth adapters are not implemented in this Windows milestone.

Tests cover local candidate detection, one request per utterance, real repeated questions, script replacement, cancellation/stale responses, queue clearing, silence/output validation, and actual Windows encryption with synthetic credentials. The speech smoke check exercises Piper → PCM → Silero/faster-whisper → finalized transcript over the real local WebSocket proxy. Live ChatGPT and physical microphone/output checks require the user's account/device; mocked controller tests do not establish those.

## Structure

- `App.tsx`: Windows UI hosted through Expo Web.
- `src/core.ts`: shared modes, prompt, question detector, history, cancellation and orchestration.
- `src/windows.ts`: browser microphone, local AI bridge and audio playback adapters.
- `server/`: loopback helper, official SIWC adapter and Windows DPAPI encryption.
- `speech/`: local CPU Whisper/Silero and Piper service.
- `public/pcm-worklet.js`: bounded 16 kHz PCM capture/resampling.
- `vendor/siwc-local/`: pinned official DevKit source and its separate license/notices.
- `docs/AI_Hat_Project_Spec_v0_1.md`: original project specification.

The vendored OpenAI DevKit is governed by its own **Noncommercial License v1.0**, preserved in `vendor/siwc-local/LICENSE`; third-party dependencies and downloaded voices have their own licenses. The Piper voice is `en_US-lessac-medium` from [Piper voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium). No speech model binaries are committed.
