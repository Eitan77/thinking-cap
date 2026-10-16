# AI Hat — Project Specification

**Version:** 0.1 (implementation planning)  
**Updated:** October 16, 2026  
**Platform:** Windows development → iPhone with Expo / React Native  
**Primary use:** Personal, wearer-controlled audio assistant  
**Status:** Design spec, not a claim that iOS authentication/background audio already work

## 1. Product summary

Build a discreet, low-latency AI assistant that listens through the **host device's microphone**, identifies completed spoken questions, sends **text** to a GPT model, and privately plays a minimal answer through bone-conduction transducers in a hat.

**Signature interaction**

- User: “What's the square root of 481?”
- Hat: “21.93.”
- **Not:** “The square root of 481 is approximately 21.93.”

A second example:

- User: “What time is my next class?”
- Hat: “11 AM.” **Only if a permitted, current calendar source actually establishes that answer.**
- User: “What do I want for lunch?”
- Hat: **silence** (it cannot infer the wearer's current preference).

The same app must support rapid development on Windows using local PC STT/TTS and final use on iPhone using local Apple STT/TTS. The intended budget is **no recurring software charges beyond Apple Developer Program**, subject to account eligibility, free-tier limits, and the feasibility of Sign in with ChatGPT (SIWC) on iOS.

### Core design principles

1. **One GPT request per complete, candidate question.** GPT both decides whether to answer and produces the shortest useful response. Do not add a second LLM classification call in v0.1.
2. **Local audio processing.** Raw microphone audio stays on the device; only recognized question text and explicitly permitted context go to GPT.
3. **No unnecessary speech.** Use a reserved `SILENT` output when GPT cannot or should not answer.
4. **Fast feedback, cautious triggering.** Recognition runs incrementally, but submit a question only when sufficiently complete. Avoid accidental or duplicate requests.
5. **Platform adapters.** Keep question detection, GPT prompts, modes, state machine, output policy, and instrumentation in shared TypeScript. Substitute audio and auth backends per platform.
6. **User control.** Passive listening is explicitly enabled and visibly indicated. Off means the microphone is released; no persistent recording by default.

## 2. Scope and modes

| Mode | Behavior | Trigger for GPT | Typical output |
|---|---|---|---|
| **Off** | Mic disabled; no processing | None | None |
| **Auto Answer** | During an explicitly enabled listening session, detect the wearer's completed questions and submit them automatically | Question endpoint detector | Minimal answer or `SILENT` |
| **Assistant** | Wearer explicitly activates a listening turn using an in-app button; optional wake phrase later | End of activated utterance | Brief answer; follow-ups allowed |
| **Debug / Test** | Text entry, transcript inspection, model selection, latency metrics, simulated speech events | Manual or simulated | Full visibility into result and timing |

**Deferred mode:** Conversation Assist may later distinguish wearer from other speakers and decide whether nearby questions are relevant. It is **not required for the first build**. The initial SIWC-supported flow is for the authenticated user's own activities / authorized processes. Do not assume a third party may trigger usage of the wearer's plan.

### Settings

- Current mode, microphone on/off, obvious listening status.
- Answer style: `minimal` (default), `brief` (Assistant only).
- Silence timeout, transcript-stability window, minimum trigger confidence, response cooldown.
- TTS voice, rate, and volume (within conservative hardware limits).
- Connected ChatGPT account, model selected from the actual account's authorized list, session limit.
- Calendar permission and whether calendar facts may be supplied to GPT.
- Optional debug transcript logging (off by default), one-click clear history.

## 3. End-to-end processing

```text
Device microphone
  → local audio capture + voice activity detection (VAD)
  → local streaming / incremental speech-to-text (STT)
  → shared TypeScript utterance builder + question endpoint detector
  → optional short, permitted factual context (e.g., cached next calendar event)
  → one SIWC-authorized streamed GPT text request
  → validate output (`SILENT` or concise answer)
  → local TTS
  → OS audio route → headphones / Bluetooth hat
```

### Detailed lifecycle

1. **IDLE:** Wait for speech while listening mode is explicitly active.
2. **HEARING:** Consume partial transcripts; tentatively detect question structure. Track the latest stable words.
3. **ENDPOINTING:** Combine VAD silence, stable transcript and syntactic completeness. Starting test window: ~400–600 ms silence, adjustable; this is **not a proven optimum**.
4. **DEDUPLICATE:** Suppress repeats of the same utterance from STT revision/restarts; assign `questionId` and cancel stale pending turns.
5. **SEND:** Supply the finalized question, mode, answer-style instructions, limited recent context, and permitted contextual facts as a **single GPT request**.
6. **RECEIVE:** Stream events; buffer minimal response. In v0.1, do **not speak until the decision text is validated**—avoids accidentally speaking `SILENT` or an incomplete answer. Later optimize phrase-level playback if tests warrant.
7. **SPEAK or IGNORE:** If `SILENT` or error, do not speak. Otherwise synthesize locally and play through current system output.
8. **COOLDOWN:** Temporarily prevent recognizer output from the hat's own TTS from retriggering. Restore listening; handle interruptions gracefully.

For v0.1, **all candidate questions go to GPT**, including math. A local calculator shortcut can be added later only if profiling shows it materially reduces latency; don't implement that as a second hidden logic path now.

### Triggering requirements

- Detect interrogative constructions, spoken question intonation only insofar as local audio logic supports it, and conversational alternatives (“Tell me the capital of Japan”).
- Do not rely only on question-mark punctuation from STT.
- Never submit unstable partial text or fire twice for revised transcripts.
- Do not prematurely answer: “What's the square root of 481 ... rounded down?” must wait for the qualifier.
- If unclear/incomplete, remain silent rather than guessing.
- Initially avoid any always-on wake-word dependency. Explicitly start the listening session in-app; test a voice wake phrase later, only when microphone access and wearer verification are reliable.

## 4. GPT behavior

### Prompt contract

Use one short developer instruction template. The goal is to decide **answerability + content + minimum words** in one model pass:

```text
You are a discreet audio assistant for the authenticated wearer.
You receive recognized speech from a user-controlled listening session.

Answer if the question can be reliably answered using general knowledge,
reasoning, calculation, or factual data explicitly provided in context.
Do not invent personal preferences, intentions, feelings, commitments,
private facts, schedule entries, or current events not established by data.

If answerable, return only the shortest complete answer suitable for speaking.
Prefer a number, name, date, location, or very short explanation. Include
units or qualifications only when needed to avoid ambiguity. Never begin
with 'Sure', 'The answer is', or repeat the question.

If unanswerable, ambiguous, requires the user's own subjective choice,
or lacks necessary authorized data, output exactly: SILENT

No Markdown, JSON, or extra commentary.
```

**Important:** This is prompt guidance, not a guarantee of accurate classification. Build a regression suite of answer/silence examples and inspect errors. GPT may hallucinate or mishandle ambiguous questions; user can set conservative behavior.

### Examples (tests)

| Transcript | Required behavior |
|---|---|
| What's 21 squared? | `441` |
| What's the square root of 481? | `21.93` (chosen rounding convention) |
| What's the capital of Japan? | `Tokyo` |
| What do I want for lunch? | `SILENT` |
| Are you coming tonight? | `SILENT` unless explicitly established by authorized context |
| What's my next class? | Short result **only if** relevant calendar data is supplied |
| Where's my next class? | Location **only if** supplied by calendar data |
| Who's the president right now? | Answer only if the model has reliable sufficiently current information or a permitted search tool |
| I was talking about... | No request; no GPT call |

### Current-context / calendar data

GPT cannot access the phone's calendar or ChatGPT personal memory automatically through SIWC. In v0.1, the app may request iOS Calendar permission, fetch the next few events locally, and supply a minimal structured summary when a question references schedule information. If absent, use `SILENT`. Never fabricate event details. Cache and refresh event summaries; never send entire private calendars by default.

### Conversation context

Maintain a short, bounded session context (e.g., last 3–5 answered turns). Do not store full ambient transcripts persistently. For SIWC HTTP requests, provide necessary history in `input`, not an assumed persistent ChatGPT conversation.

## 5. Windows PC development stack (first implementation)

**Goal:** Real end-to-end testing using the Windows PC microphone and speakers, no Apple build and no per-minute cloud speech fees.

| Layer | Selection | Notes |
|---|---|---|
| App/UI | Expo + React Native Web + TypeScript | One cross-platform interface and shared app logic |
| Mic capture | Browser `getUserMedia` + AudioWorklet | Streams PCM to local companion service via WebSocket |
| VAD | Silero VAD (local CPU) | Pre-roll, adaptive silence endpointing; keep configurable |
| STT | `faster-whisper`, English small/base initially | Local NVIDIA GPU inference via Python service; benchmark accuracy/latency; CTranslate2 CUDA dependencies on Windows |
| TTS | Piper, persistent local HTTP/Python service | Fast, offline, preloaded voice; no restart/model load per response |
| GPT auth | Official SIWC local DevKit with Node.js helper | Local OAuth callback and OS-protected token storage, **eligibility required** |
| Speech transport | Localhost WebSocket / HTTP | Bounded PCM frames, incremental transcript events, synthesized WAV/audio |
| Audio output | Browser audio playback | Default PC speakers/headphones; Bluetooth hat may be paired as ordinary system output |

**Important:** `faster-whisper` is not magically a low-latency streaming recognizer. The local service must implement VAD, rolling audio windows or utterance segmentation, partial transcript updates, and finalization. The web app must not freeze the UI during inference. Benchmark before selecting base versus small model.

Avoid running the Python speech model inside JavaScript/Expo Web. Use a localhost service. When moving to iPhone, replace the speech adapters but preserve the same interfaces and orchestration.

## 6. iPhone production stack

| Layer | Selection | Status |
|---|---|---|
| App | Expo / React Native / TypeScript | Planned |
| Native build | EAS cloud development build → TestFlight | Supported workflow from Windows |
| Audio capture | Swift `AVAudioEngine` in focused Expo native module | To implement/test |
| STT | Apple `SpeechAnalyzer` + `SpeechTranscriber` | Primary target; availability varies by iOS/device/locale |
| TTS | Native `AVSpeechSynthesizer` | Primary target; configure audio session correctly for Bluetooth and silent mode |
| Alternate TTS (early smoke test) | `expo-speech` | Convenient, but Expo documents physical-iPhone silent-mode caveat |
| Audio output | System Bluetooth A2DP route | Hat behaves as a standard audio receiver; no special BLE protocol in v0.1 |
| GPT | Same shared client interface + SIWC if viable on iOS | **High-priority proof of concept / not yet verified** |
| Local calendar | `expo-calendar` if enabled | Data permission and accurate refresh required |

**Do not assume Expo Go can execute custom Swift speech modules.** Install a custom Expo development build. Most TypeScript changes can then hot-reload; changes to native Swift or configuration require another native build.

### iOS-specific risks

- **SIWC OAuth:** Official examples emphasize local Node.js desktop execution. iOS needs validation of loopback callback, browser authorization, token refresh, token storage in Keychain, and plan-backed Responses requests. Do not promise this works until demonstrated on an actual iPhone.
- **Background execution:** Enabling background audio recording does **not** automatically guarantee continuous SpeechAnalyzer processing, GPT network calls, and TTS with phone locked. Evaluate on physical device early; native scheduling may be needed; Apple review rules apply.
- **Microphone placement:** Phone in pocket may fail to hear nearby speech. Test on table, in hand, and in pocket. No external mic is assumed in hat v0.1.
- **Audio route:** Need phone mic capture while playing A2DP audio. Test interruptions, reconnect, volume, silent switch, echo/retrigger, and latency.
- **Model availability:** Newer Apple speech support depends on iOS version, device, locale, and downloaded language assets.

## 7. Sign in with ChatGPT integration

**Desired:** Use the wearer's authorized ChatGPT plan for text-only inference, with no separate usage-based API billing within eligible plan limits.

**Documented constraints as of this spec:**

- The self-service ChatGPT plan-usage material targets **open-source, locally hosted** clients; a private personal project is not automatically eligible merely because only one person uses it.
- Obtain explicit user authorization. Requests must arise from the authenticated person's activity or expressly authorized automations/background processes. A different person's activity must not trigger requests to the wearer's plan.
- Local token custody is required. Use OAuth with PKCE, stable host ID, token refresh, and OS-protected encrypted storage; never store bearer/refresh tokens in client-side web bundles or logs.
- Use the authorized **public Responses API** (`POST https://api.openai.com/v1/responses`), with `stream: true`, `store: false`, and models discovered from the account's available catalog. Do **not** rely on ChatGPT's private web endpoints.
- Supply `instructions` or developer message and `input` history. SIWC preview excludes parameters including `max_output_tokens`, `temperature`, and `previous_response_id` for HTTP. Enforce concise output by prompting and client validation, not unsupported request options.
- Stream events to completion; treat `response.failed`, `response.incomplete`, and account usage limits as separate failure paths. Don't begin audio on incomplete/malformed results.
- SIWC does **not** automatically expose a user's ChatGPT memory, conversations, Google Calendar, or consumer voice service.

**Priority gate:** Before relying on SIWC for iOS release, build a bare-minimum iPhone PoC: `Sign in → account model list → one streamed text response → logout/refresh`. If unsupported, keep a provider adapter for a separately authorized API (metered) or limited local-model fallback. The $99/year-only objective is **conditional on this gate**.

**Official references:**
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://openai.com/policies/sign-in-with-chatgpt-terms/
- https://github.com/openai/sign-in-with-chatgpt-devkit

## 8. TypeScript contracts

```ts
export type AppMode = 'off' | 'auto' | 'assistant' | 'debug';

export type TranscriptEvent = {
  sessionId: string;
  utteranceId: string;
  text: string;
  isFinal: boolean;
  timestampMs: number;
};

export interface SpeechRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(handler: (event: TranscriptEvent) => void): () => void;
}

export interface Speaker {
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): boolean;
}

export interface AIProvider {
  isConnected(): Promise<boolean>;
  getAvailableModels(): Promise<{ id: string; label: string }[]>;
  ask(question: string, context: string, instructions: string): Promise<
    { kind: 'answer'; text: string } | { kind: 'silent' } | { kind: 'error'; reason: string }
  >;
}

export type HatState =
  | 'OFF' | 'LISTENING' | 'HEARING' | 'FINALIZING'
  | 'THINKING' | 'SPEAKING' | 'COOLDOWN' | 'ERROR';
```

Implement adapters such as `WindowsLocalSTT`, `WindowsPiperTTS`, `AppleSTT`, `AppleTTS`, `SIWCProvider`, `MockAIProvider`. **Only the Windows/iOS adapters change**; the central controller consumes the same contracts.

## 9. User interface

**Home:** large mode toggle, obvious mic/listening state, connected audio route, connected ChatGPT account status, current/last answer, interrupt button.

**Settings:** STT silence timeout and endpoint sensitivity, TTS voice/rate, minimal/brief answer length, model selection, calendar permission, session controls, privacy and account disconnect.

**Debug:** live partial transcript, finalized question, raw model output, whether response was spoken or suppressed, six timing markers, error codes, one-click copy/export of **non-sensitive** debug results.

**Always available:** manual mute/Off, TTS cancel, explicit sign-out; no autonomous recording started immediately upon first launch.

## 10. Performance targets and measurements

These are *engineering targets to test*, not established benchmarks:

| Metric | Initial target / method |
|---|---|
| STT usability | Partial transcript during speech; measure word errors and finalization |
| End-of-utterance | Tune ~400–600 ms idle window to avoid clipping question endings |
| GPT time | Track request initiation, first token, completed valid answer |
| TTS first sound | Track playback callback; optionally measure physical audio output with separate test mic |
| End of question → first audible answer | Aim ~1–3 seconds for short, network-backed answers in favorable conditions; record P50/P95 |
| Double-trigger rate | Zero repeated requests in scripted test suite |
| False answer rate | Prioritize precision over auto-answer recall |
| Audio privacy | No audio transmitted to cloud STT/TTS; no retained raw recordings by default |

**Optimizations:** keep speech models warm; VAD gate idle recognition; don't upload PCM to GPT; send the shortest authorized context; one GPT request; avoid a second summarizer call; cache calendar facts; prevent self-echo. When streaming an LLM answer, wait for validated non-`SILENT` text before speech in MVP.

## 11. Hardware and physical audio

Target hat is a **Bluetooth audio accessory only**, not a standalone computer:

- Bluetooth stereo amplifier / receiver board (previously selected Icstation 2×5 W class of board).
- Two small bone-conduction transducers (previously selected Dayton BCE-1, 4 Ω / 1 W class).
- Single-cell protected LiPo, matching charge/protection board, on/off switch.
- Initial series output resistors and wiring as chosen in prior hardware discussion; verify resistor rating, thermal behavior, and amplifier output before wearing.
- iPhone mic provides input; audio output is Bluetooth A2DP. No hat microphone, onboard STT, MCU, or Wi-Fi required in v0.1.

**Hardware validation is mandatory:** independently verify LiPo/JST polarity, LiPo charging and protection scheme, amplifier power rating and current demand, bridged output wiring (never tie amp channel negatives together), sound exposure, resistor dissipation, mechanical comfort, insulation, and charging behavior. Do not depend on phone software volume as the only protection for 1 W transducers. Avoid charging or bench testing high-output audio while wearing the hat.

## 12. Privacy, reliability, and safety

- The user must explicitly start listening; show state visibly and allow one-tap Off.
- Keep local rolling buffer short; no persistent ambient recordings by default; debug transcripts opt-in and delete-able.
- Treat overheard speech as sensitive. Do not silently send other people's speech to the authenticated user's GPT plan; comply with platform recording requirements and applicable consent laws.
- Use an explicit small allowlist for personal context (e.g., upcoming class time/location only). Avoid transmitting unrelated private calendar details.
- Never auto-send messages, buy things, change calendar entries, or make consequential actions based solely on ambient questions in v0.1.
- On lost network, permission denied, auth expiry, GPT quota, Bluetooth disconnect, or mic interruption: recover cleanly; do not speak stale or speculative answers.
- TTS playback must not trigger a fresh response. Enable a configurable playback lockout; barge-in/echo cancellation is a future feature.

## 13. Development milestones and acceptance tests

### Phase 0 — No native build required

- [ ] Create Expo + TypeScript project with web and iOS targets.
- [ ] Implement state machine, modes, settings, prompt, mocks, and Debug screen.
- [ ] Build text-input → mock/GPT response → shortest answer or `SILENT` test suite.

### Phase 1 — Local Windows voice demo

- [ ] Local `faster-whisper` + Silero VAD service accepts PC mic PCM through localhost.
- [ ] Local Piper service outputs speech to browser.
- [ ] Verify partial/final transcripts, question endpointing, and no duplicate triggers.
- [ ] Integrate official SIWC DevKit with local secure credentials and stream one real answer (if authorized).
- [ ] Run 30+ scripted questions: objective, calendar-based, subjective, incomplete, math, background noise.

### Phase 2 — Early iOS risk validation (do not defer)

- [ ] EAS development build installed on physical iPhone from Windows.
- [ ] SpeechTranscriber → AVSpeechSynthesizer → paired Bluetooth hat produces one response.
- [ ] SIWC iOS PoC: login, refresh, model list, one streamed response, logout; document blocker if impossible.
- [ ] Test phone screen locked: mic capture, transcription, GPT request, TTS playback; verify what remains scheduled.
- [ ] Test device in pocket and at different speaker distances; test Bluetooth reconnection.

### Phase 3 — Full iPhone personal prototype

- [ ] Shared TypeScript controller uses Apple native audio adapters.
- [ ] Local permitted calendar lookup (optional).
- [ ] Minimal auto-answer style and Assistant mode.
- [ ] Latency dashboard and practical P50/P95 benchmarks.
- [ ] TestFlight standalone build; operates without a development PC.

### Acceptance criteria for a usable v0.1

1. After user explicitly enables a session, a clearly stated wearer question triggers exactly one AI request.
2. “What's the square root of 481?” elicits only “21.93” or equivalent chosen rounding.
3. “What do I want for lunch?” generates no spoken response.
4. Missing calendar data never produces a fabricated class time.
5. Local PC STT/TTS works without cloud speech services.
6. iOS native STT/TTS works through Bluetooth; any locked-screen restrictions are documented, not hidden.
7. Every request has measurable latency; failures never produce stale spoken answers.
8. User can mute, stop, interrupt speech, clear session context, and sign out.

## 14. Costs and caveats

| Item | Expected charge |
|---|---|
| Expo / React Native / TypeScript, PC local speech | $0 software subscription |
| EAS cloud builds | Free within the current plan allowance; verify quota at build time |
| Apple Developer Program / TestFlight | $99/year for the normal individual developer enrollment; TestFlight included |
| Apple speech APIs | No per-request API fee |
| SIWC ChatGPT plan usage | No separate per-token charge *if eligible and within plan usage limits*; existing ChatGPT subscription is separate |
| Hosting / backend | No paid hosting necessary for the planned single-user, localhost-based architecture |
| Hardware | Separate one-time component purchases |
| API fallback if SIWC iOS fails | May incur usage charges |

**Cost objective, not promise:** Aim for Apple Developer Program as the only additional recurring expense. This depends especially on SIWC iOS feasibility, qualifying account/application use, EAS free-tier usage, and not enabling paid search/API fallbacks.

## 15. Unresolved decisions / technical gates

- Exact iPhone model and iOS version (speech model support, background behavior, performance).
- Does SIWC registration/login, refresh, and plan usage work in an actual standalone Expo iOS app under the current program rules?
- Does foreground recognition continue through locked-screen/background operation, or require a different native architecture?
- Does the iPhone microphone capture nearby questions sufficiently when pocketed?
- What silence/stability parameters maximize speed without truncating qualifiers?
- What is the physical end-to-end Bluetooth playback latency, and what are safe output levels through the chosen transducers?
- Are included ChatGPT model response times and plan limits adequate for personal use?

**Priority:** Validate SIWC on the iPhone and locked-screen audio early; these are the two biggest risks to the intended product and $99/year-only additional-cost goal.

## 16. Useful documentation

- SIWC plan usage: https://developers.openai.com/siwc/token-sharing-open-source
- SIWC model calls: https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- SIWC preview constraints: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- SIWC DevKit: https://github.com/openai/sign-in-with-chatgpt-devkit
- SIWC terms: https://openai.com/policies/sign-in-with-chatgpt-terms/
- Expo native modules: https://docs.expo.dev/workflow/customizing/
- Expo TTS: https://docs.expo.dev/versions/latest/sdk/speech/
- Expo audio/background: https://docs.expo.dev/versions/latest/sdk/audio/
- Apple SpeechAnalyzer: https://developer.apple.com/documentation/speech/speechanalyzer
- Windows local STT: https://github.com/SYSTRAN/faster-whisper
- Windows local TTS: https://github.com/OHF-Voice/piper1-gpl

---

**Implementation rule:** Build one Expo application with shared orchestration and platform-specific audio/auth adapters. Make the Windows demo real first, but prove iPhone SIWC and background audio before treating them as solved. Minimize cost, latency, hallucinations, accidental triggers, and retained audio.
