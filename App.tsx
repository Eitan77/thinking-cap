import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Controller, DEFAULT_SCRIPT, type HatState, type Mode } from './src/core';
import { WindowsAI, WindowsMic, WindowsSpeaker, request } from './src/windows';
import { SETUP_CSS } from './src/setup-style';

type Session = { status: string; sharing: boolean; profileId?: string; identity?: { email?: string } };
type Model = { slug: string; displayName: string; supportedEfforts: string[]; defaultEffort?: string };
type Log = { question: string; answer: string; total: number; first: number | null };
const SCRIPT_KEY = 'thinking-cap-instructions';
function savedScript() {
  try { return localStorage.getItem(SCRIPT_KEY) || DEFAULT_SCRIPT; } catch { return DEFAULT_SCRIPT; }
}
function message(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No microphone found. Plug one in or check Windows sound settings.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function WebApp() {
  const ai = useRef(new WindowsAI()).current;
  const speaker = useRef(new WindowsSpeaker()).current;
  const mic = useRef(new WindowsMic()).current;
  const controller = useRef(new Controller(ai, speaker)).current;
  const [mode, setMode] = useState<Mode>('off');
  const [state, setState] = useState<HatState>('OFF');
  const [script, setScript] = useState(savedScript);
  const [applied, setApplied] = useState(savedScript);
  const [session, setSession] = useState<Session>({ status: 'disconnected', sharing: false });
  const [profiles, setProfiles] = useState<{ id: string; label: string }[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [sources, setSources] = useState<{url:string;title:string}[]>([]);
  const [searched, setSearched] = useState(false);
  const [memoryNotes, setMemoryNotes] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [helperReady, setHelperReady] = useState<boolean | null>(null);
  const [speechReady, setSpeechReady] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const [scriptSaved, setScriptSaved] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [silence, setSilence] = useState('500');
  const [vadThreshold, setVadThreshold] = useState('0.35');
  const [decision, setDecision] = useState('');
  const [lastTiming, setLastTiming] = useState<{endpoint?:number;stt?:number;gpt?:number;local?:boolean}>({});
  const [logging, setLogging] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const generation = useRef(0);
  const armedRef = useRef(false);
  const testingRef = useRef(false);
  const loggingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const loadedProfile = useRef('');
  const authErrorSeen = useRef('');
  const soundAbort = useRef<AbortController | undefined>(undefined);
  const connected = session.status === 'connected' && session.sharing;
  const canAsk = connected && !!model && helperReady === true;

  function disarm() {
    clearTimeout(timer.current);
    armedRef.current = false;
    setArmed(false);
    if (controller.mode === 'assistant') mic.sending = false;
  }
  function stop() {
    generation.current++;
    testingRef.current = false;
    setTestingMic(false);
    mic.stop();
    soundAbort.current?.abort();
    setTestingSound(false);
    controller.setMode('off');
    setMode('off');
    disarm();
    setBusy(false);
  }
  function jump(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function requireConnection() {
    if (helperReady !== true) { setError('The local app is disconnected. Click Check connection below, or restart scripts/start.ps1.'); return false; }
    if (!connected) { setNotice('First connect ChatGPT in step 1. You can test your microphone and speakers without signing in.'); jump('connect'); return false; }
    if (!model) { setNotice('Your model list hasn’t loaded. In step 1, click Retry model list.'); jump('connect'); return false; }
    return true;
  }
  async function loadModels() {
    try {
      const list: Model[] = await request('models');
      setModels(list);
      let saved: {model?:string;effort?:string} = {};
      try { saved = JSON.parse(localStorage.getItem('thinking-cap-model') || '{}'); } catch {}
      const selected = list.find(m => m.slug === saved.model) || list.find(m => m.slug === 'gpt-6.1-sol') || list[0];
      const nextEffort = selected?.supportedEfforts?.includes(saved.effort || '') ? saved.effort! : selected?.supportedEfforts?.[0] || '';
      setModel(selected?.slug || ''); ai.model = selected?.slug || '';
      setEffort(nextEffort); ai.effort = nextEffort;
      if (!list.length) setAuthNotice('Your account returned no available models. Check plan access or reconnect.');
    } catch (e) { setAuthNotice(message(e)); }
  }
  useEffect(() => {
    controller.applyScript(savedScript());
    controller.onState = s => {
      setState(s);
      const blocked = s === 'SPEAKING' || s === 'COOLDOWN';
      mic.suppress(blocked);
      mic.sending = !blocked && (testingRef.current || controller.mode === 'auto' || armedRef.current);
    };
    controller.onError = setError;
    controller.onDecision = text => { setDecision(text); setNotice(text); };
    controller.onResult = (question, result, timing) => {
      setSources(timing.sources || []); setSearched(timing.searched || false);
      setAnswer(result.kind === 'answer' ? result.text : result.kind === 'silent' ? 'No spoken answer — GPT returned SILENT.' : result.reason);
      setNotice(result.kind === 'answer' ? timing.local ? 'Calculated locally. Playing the number now.' : 'Answer received. Playing it now.' : result.kind === 'silent' ? 'GPT returned SILENT. Check what was heard and your instructions below.' : result.reason);
      setLastTiming(old => ({...old,gpt:timing.totalMs,local:timing.local}));
      setDecision(result.kind === 'silent' ? 'GPT chose SILENT. Check the transcript or adjust your instructions.' : result.kind === 'answer' ? timing.local ? 'Calculated locally.' : 'Answer received.' : result.reason);
      if (loggingRef.current) setLogs(old => [{ question, answer: timing.text, total: timing.totalMs, first: timing.firstTokenMs }, ...old].slice(0, 30));
    };
    speaker.onSound = setTtsMs;
    mic.onTranscript = event => {
      setTranscript(event.text);
      if (testingRef.current) { setNotice('Microphone works. This transcript stays local; nothing was sent to GPT.'); return; }
      if (event.isFinal) setLastTiming({endpoint:event.endpointMs,stt:event.sttMs});
      const activated = armedRef.current;
      if (event.isFinal && controller.mode === 'assistant') { mic.stop(); disarm(); }
      controller.transcript(event, activated);
    };
    mic.onError = text => { stop(); setError(text); };
    mic.onStatus = text => { if (!testingRef.current) setDecision(text); };
    let disposed = false;
    let polling = false;
    async function poll() {
      if (polling || disposed) return;
      polling = true;
      try {
        const data = await request('session');
        if (disposed) return;
        setHelperReady(true);
        setSession(data.session);
        setProfiles(data.profiles);
        setAuthBusy(data.authBusy);
        setAuthUrl(data.authUrl || '');
        if (data.authError && data.authError !== authErrorSeen.current) { setAuthNotice(data.authError); authErrorSeen.current = data.authError; }
        const key = data.session.status === 'connected' && data.session.sharing ? data.session.profileId || 'active' : '';
        if (key && key !== loadedProfile.current) {
          loadedProfile.current = key; setAuthNotice(''); await loadModels();
          try { const saved=await request('memory'); if(!disposed){setMemoryNotes(saved.notes);setMemoryEnabled(saved.enabled);} } catch(e) {if(!disposed)setError(message(e));}
        }
        if (!key) {
          loadedProfile.current = ''; setModels([]); setModel(''); setEffort(''); ai.model = ''; ai.effort = '';
          setMemoryNotes('');setMemoryEnabled(false);
          if (controller.mode !== 'off') stop();
        }
        const health = await request('health');
        if (!disposed) { setSpeechReady(health.ready); setSpeechError(health.error || ''); }
      } catch {
        if (!disposed) { setHelperReady(false); setSpeechReady(false); if (controller.mode !== 'off' || testingRef.current) stop(); }
      } finally { polling = false; }
    }
    pollRef.current = poll;
    void poll();
    const interval = setInterval(() => void poll(), 1200);
    return () => { disposed = true; clearInterval(interval); clearTimeout(timer.current); mic.stop(); soundAbort.current?.abort(); controller.setMode('off'); };
  }, []);

  async function auth(action: string, data: unknown = {}) {
    stop(); setError(''); setAuthNotice(''); setTranscript(''); setAnswer(''); setSources([]); setSearched(false); authErrorSeen.current = '';
    if (action === 'signin') { setAuthBusy(true); setAuthNotice('Preparing your sign-in link…'); }
    try { await request(action, data); await pollRef.current(); }
    catch (e) { setAuthBusy(false); setAuthNotice(message(e)); }
  }
  async function refreshDevices() {
    setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'));
  }
  async function selectMode(next: Mode) {
    if (next === 'off') { stop(); setNotice('Stopped. The microphone is off.'); return; }
    if (!requireConnection()) return;
    if (next === 'auto' && !speechReady) { setNotice('Local speech is still starting. Try a typed question while you wait.'); return; }
    stop(); setError(''); setNotice('');
    const epoch = generation.current;
    if (next === 'assistant') { controller.setMode(next); setMode(next); setNotice('Click Speak once, ask your question, then pause.'); return; }
    setBusy(true);
    try {
      await mic.start(device, Number(silence), Number(vadThreshold));
      if (epoch !== generation.current) return;
      await refreshDevices(); controller.setMode(next); setMode(next); mic.sending = true;
      setNotice('Auto is listening. Ask a question and pause. Stop switches the microphone off.');
    } catch (e) { if (epoch === generation.current) { stop(); setError(message(e)); } }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  async function speakOnce() {
    if (!requireConnection()) return;
    if (!speechReady) { setNotice('Local speech is still starting. Try a typed question instead.'); return; }
    stop(); controller.setMode('assistant'); setMode('assistant'); setBusy(true); setError('');
    const epoch = generation.current;
    try {
      await mic.start(device, Number(silence), Number(vadThreshold));
      if (epoch !== generation.current) return;
      await refreshDevices(); mic.command({ type: 'arm' }); armedRef.current = true; setArmed(true); mic.sending = true;
      setTranscript(''); setNotice('Listening. Speak now, then pause. You can also click Finish & send.');
      timer.current = setTimeout(() => { mic.stop(); disarm(); setNotice('No completed question received. Click Speak once to try again.'); }, 30000);
    } catch (e) { if (epoch === generation.current) { stop(); setError(message(e)); } }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  async function testMic() {
    if (testingRef.current) { stop(); setNotice('Microphone test stopped. Nothing was sent to GPT.'); return; }
    if (!speechReady) { setError('Local speech is still starting. Click Check connection and try again when it says Ready.'); return; }
    stop(); setBusy(true); setError(''); setTranscript('');
    const epoch = generation.current;
    try {
      await mic.start(device, Number(silence), Number(vadThreshold));
      if (epoch !== generation.current) return;
      await refreshDevices(); testingRef.current = true; setTestingMic(true); mic.sending = true;
      setNotice('Microphone test: say a sentence. Your words will appear below. Nothing goes to GPT.');
      timer.current = setTimeout(() => { stop(); setNotice('Microphone test finished. Nothing was sent to GPT.'); }, 15000);
    } catch (e) { if (epoch === generation.current) { stop(); setError(message(e)); } }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  async function testSound() {
    if (!speechReady) { setError('Local speech is still starting. Please try again when it says Ready.'); return; }
    stop(); setError(''); setTestingSound(true);
    const ac = new AbortController(); soundAbort.current = ac;
    setNotice('Playing a sample through your Windows speakers or headphones…');
    try { await speaker.speak('Thinking Cap is ready.', ac.signal); if (!ac.signal.aborted) setNotice('Sample finished. If you heard “Thinking Cap is ready,” your output works.'); }
    catch (e) { if (!ac.signal.aborted) setError(message(e)); }
    finally { if (soundAbort.current === ac) { soundAbort.current = undefined; setTestingSound(false); } }
  }
  function saveInstructions() {
    if (!script.trim()) { setNotice('Write some instructions or click Use default.'); return; }
    stop(); controller.applyScript(script); setApplied(script); setScriptSaved(true); setAnswer(''); setTranscript(''); setSources([]); setSearched(false);
    try { localStorage.setItem(SCRIPT_KEY, script); setNotice('Instructions saved on this browser and applied. Your next question will use them.'); }
    catch { setNotice('Instructions applied for this session. Browser storage is unavailable.'); }
  }
  function sendTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) { setNotice('Type a question first.'); return; }
    if (!requireConnection()) return;
    if (script !== applied) { setNotice('Save your changed instructions in step 2 first, or keep the currently applied script.'); jump('instructions'); return; }
    if (controller.mode === 'off' || testingRef.current) { stop(); controller.setMode('assistant'); setMode('assistant'); }
    setError(''); setNotice('Sending your typed question…'); setTranscript(input.trim()); controller.manual(input); setInput('');
  }
  const status = busy ? 'Opening microphone…' : testingMic ? 'Testing microphone (local only)' : testingSound ? 'Playing test audio…' : state === 'THINKING' ? 'Waiting for GPT…' : state === 'SPEAKING' ? 'Speaking answer…' : armed ? 'Listening to your question…' : mode === 'auto' ? 'Auto is listening' : mode === 'assistant' ? 'Ready for one question' : 'Off — microphone released';
  function chooseModel(slug: string) {
    stop(); controller.clear();
    const selected = models.find(m => m.slug === slug);
    const nextEffort = selected?.supportedEfforts?.[0] || '';
    setModel(slug); ai.model = slug; setEffort(nextEffort); ai.effort = nextEffort;
    try { localStorage.setItem('thinking-cap-model', JSON.stringify({model:slug,effort:nextEffort})); } catch {}
    setNotice('Model changed. Using its fastest listed reasoning effort. Conversation cleared.');
  }
  function chooseEffort(value: string) {
    stop(); controller.clear(); setEffort(value); ai.effort = value;
    try { localStorage.setItem('thinking-cap-model', JSON.stringify({model,effort:value})); } catch {}
    setNotice('Reasoning effort saved. Start listening again when ready.');
  }
  const selectedModel = models.find(m => m.slug === model);
  async function saveMemory(clear=false) {
    if(!requireConnection())return;
    stop();controller.clear();setMemoryBusy(true);setError('');
    try{
      const saved=await request('memory',{notes:clear?'':memoryNotes,enabled:clear?false:memoryEnabled});
      setMemoryNotes(saved.notes);setMemoryEnabled(saved.enabled);
      setNotice(clear?'Saved memory cleared for this account.':saved.enabled?'Memory saved. These notes will accompany your GPT questions.':'Memory saved but disabled. Notes will stay on this PC.');
    }catch(e){setError(message(e));}finally{setMemoryBusy(false);}
  }
  return <><style>{SETUP_CSS}</style><main>
    <header><h1>Thinking Cap</h1><p>Your Windows setup. Start at step 1.</p></header>
    <div className="servicebar"><span><i className={helperReady ? 'good' : ''} />App: {helperReady === null ? 'checking…' : helperReady ? 'running' : 'disconnected'}</span><span><i className={speechReady ? 'good' : ''} />Local speech: {speechReady ? 'ready' : 'starting…'}</span><button onClick={() => { setNotice('Checking the local app and speech service…'); void pollRef.current().then(() => setNotice('Status checked. See App and Local speech above.')); }}>Check connection</button></div>
    {helperReady === false && <div className="warning">The local app stopped. Run <code>scripts/start.ps1</code>, then click Check connection.</div>}
    {error && <div className="warning" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <div className="feedback" role="status" aria-live="polite">{notice || (canAsk ? 'You’re connected. Save any instructions, then try a question in step 3.' : 'First, connect your ChatGPT account below. You can test audio at any time.')}</div>

    <section id="connect" className="step"><div className="step-title"><b className="number">1</b><div><h2>Connect ChatGPT</h2><p>{connected ? 'Connected. Your questions will use this account.' : 'Sign in once so Thinking Cap can send your questions.'}</p></div><span className={'badge ' + (connected ? 'done' : '')}>{connected ? 'Connected' : 'Start here'}</span></div>
      {connected ? <div className="account"><strong>{session.identity?.email || 'ChatGPT account connected'}</strong><button onClick={() => void auth('signout')}>Sign out</button></div> : <>
        <div className="actions"><button className="primary" disabled={authBusy} onClick={() => void auth('signin', { reconsent: session.status === 'connected' && !session.sharing })}>{authBusy ? authUrl ? 'Sign-in link ready below' : 'Preparing sign-in…' : 'Continue with ChatGPT'}</button>{authBusy && <button onClick={() => { void auth('cancel-signin'); setNotice('Sign-in cancelled. You can try again whenever you’re ready.'); }}>Cancel sign-in</button>}</div>
        {authBusy && authUrl && <div className="signin"><a className="button primary" href={authUrl} target="_blank" rel="noreferrer">Open ChatGPT sign-in ↗</a><p>Open this link, finish signing in, then return here. This page updates automatically.</p></div>}
        {authBusy && !authUrl && <p className="hint">Getting a secure sign-in link. This should take a few seconds.</p>}
        {authNotice && !authUrl && <p className="hint" role="status">{authNotice}</p>}
        {session.status === 'connected' && !session.sharing && <p className="warning">You signed in, but plan access isn’t enabled. Reconnect and approve ChatGPT plan usage.</p>}
      </>}
      {connected && <div className="model"><label htmlFor="model">Model</label><div className="inline"><select id="model" value={model} onChange={e => chooseModel(e.target.value)}><option value="">{models.length ? 'Choose a model' : 'No models loaded'}</option>{models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}</select><button onClick={() => void loadModels()}>Retry model list</button></div>
        <label htmlFor="effort" style={{marginTop:12}}>Reasoning effort</label><select id="effort" value={effort} onChange={e => chooseEffort(e.target.value)}><option value="">Model default</option>{selectedModel?.supportedEfforts?.map((level,index) => <option key={level} value={level}>{level === 'low' ? 'Low' : level} {index === 0 ? '— fastest available' : ''}</option>)}</select>
        {model === 'gpt-6.1-sol' && !selectedModel?.supportedEfforts?.includes('none') && <p className="hint">This connection lists Low as the fastest GPT-6.1 Sol effort. Instant / no-reasoning is not offered for this model.</p>}
        {authNotice && <p className="hint">{authNotice}</p>}</div>}
      <details><summary>Account options</summary>{profiles.length > 0 && <><label htmlFor="account">Saved account</label><select id="account" value={session.profileId || ''} onChange={e => void auth('profile', { id: e.target.value })}>{profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></>}<div className="actions"><button disabled={authBusy} onClick={() => void auth('signin', { newProfile: true })}>Add another account</button><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">ChatGPT usage & access ↗</a></div></details>
    </section>

    <section id="instructions" className="step"><div className="step-title"><b className="number">2</b><div><h2>Tell it how to respond</h2><p>Edit the script, or keep the default for short answers.</p></div><span className="badge">{script !== applied ? 'Changes not applied' : scriptSaved ? 'Saved' : 'Ready'}</span></div>
      <label htmlFor="script">Your instructions</label><textarea id="script" rows={6} value={script} maxLength={12000} onChange={e => { setScript(e.target.value); setScriptSaved(false); }} spellCheck={false} />
      <div className="actions"><button className="primary" onClick={saveInstructions}>Save instructions</button><button onClick={() => { setScript(DEFAULT_SCRIPT); setScriptSaved(false); setNotice('Default instructions loaded. Click Save instructions to apply them.'); }}>Use default</button></div><p className="hint">Saved only in this browser. Saving starts a fresh conversation. Every GPT request includes the applied script.</p>
      <details><summary>Memory — facts to remember between sessions</summary><p className="hint">This is Thinking Cap’s memory for your connected account. It cannot read or sync existing ChatGPT memories. You can paste selected memories here. Only notes you save are retained; conversations and ambient speech are not automatically memorized.</p>
        <label htmlFor="memory">Facts you want it to remember</label><textarea id="memory" rows={5} maxLength={6000} value={memoryNotes} onChange={e=>setMemoryNotes(e.target.value)} placeholder="For example: My preferred units are metric. My school is…" />
        <label className="check"><input type="checkbox" checked={memoryEnabled} onChange={e=>setMemoryEnabled(e.target.checked)}/>Include saved notes in my GPT requests</label><div className="actions"><button disabled={memoryBusy} onClick={()=>void saveMemory()}>Save memory</button><button disabled={memoryBusy} onClick={()=>void saveMemory(true)}>Clear saved memory</button></div><p className="hint">Save applies both the notes and the switch. Stored encrypted on this PC, separately per connected account. Enabled notes are sent to GPT with each question.</p>
      </details>
    </section>

    <section id="listen" className="step"><div className="step-title"><b className="number">3</b><div><h2>Ask something</h2><p>Try typing first, or choose how you want to listen.</p></div></div>
      {!canAsk && <div className="prerequisite">{connected ? 'Choose a model in step 1 to send questions.' : 'Connect ChatGPT in step 1 to get answers. Audio tests below work without it.'}</div>}
      <form onSubmit={sendTyped}><label htmlFor="question">Try a typed question</label><div className="inline"><input id="question" placeholder="What is 21 squared?" value={input} maxLength={4000} onChange={e => setInput(e.target.value)} /><button type="submit" className="primary">Send question</button></div></form>
      <label className="check"><input type="checkbox" checked={webSearch} onChange={e=>{stop();setWebSearch(e.target.checked);ai.webSearch=e.target.checked;setNotice(e.target.checked?'Web lookup enabled. GPT can search for current information.':'Web lookup disabled. Current questions may return SILENT.');}}/>Allow web lookup for current information</label><p className="hint">Search can add latency. Source links appear when the provider supplies them. Uses this ChatGPT connection; no paid API fallback is enabled.</p>
      <div className="mode-grid" aria-label="Listening mode">{([{ id: 'off', name: 'Off', description: 'Microphone released.' }, { id: 'assistant', name: 'One question at a time', description: 'Click Speak once when ready.' }, { id: 'auto', name: 'Auto', description: 'Send each detected question.' }] as { id: Mode; name: string; description: string }[]).map(m => <button key={m.id} aria-pressed={mode === m.id} className={mode === m.id ? 'selected' : ''} onClick={() => void selectMode(m.id)}><strong>{m.name}</strong><small>{m.description}</small></button>)}</div>
      <div className="actions"><button className="primary" disabled={busy} onClick={() => armed ? (mic.sending = false, mic.command({ type: 'flush' }), setNotice('Finishing your question…')) : void speakOnce()}>{armed ? 'Finish & send' : busy ? 'Opening microphone…' : 'Speak once'}</button><button className="stop" onClick={() => { stop(); setNotice('Stopped. Microphone and audio are off.'); }}>Stop / mic off</button></div>
      <div className="listen-status" role="status"><i className={armed || mode === 'auto' || testingMic ? 'good' : ''} />{status}</div>
      {decision && <p className="hint" role="status">{decision}</p>}
      {(lastTiming.stt !== undefined || lastTiming.gpt !== undefined) && <p className="hint">Pause {lastTiming.endpoint ?? '—'} ms · Transcription {lastTiming.stt ?? '—'} ms · {lastTiming.local ? 'Local math' : 'GPT'} {lastTiming.gpt ?? '—'} ms · Voice {ttsMs ?? '—'} ms</p>}
      {mode === 'auto' && <p className="hint">Ask a question and pause. Auto uses everything this microphone hears; it doesn’t identify speakers. Listening pauses during spoken answers.</p>}
      <div className="output"><label>Heard</label><div>{transcript || 'Your words will appear here.'}</div><label>Answer</label><div className="answer" aria-live="polite">{answer || 'Your answer will appear here.'}</div></div>
      {searched && <div className="hint">Web lookup used · {sources.length?sources.map((source,i)=><React.Fragment key={source.url}>{i>0?' · ':''}<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></React.Fragment>):'The provider returned no source links for this lookup.'}</div>}
      <div className="actions"><button disabled={!transcript.trim()} onClick={() => { setInput(transcript); setNotice('Transcript copied into the question box. Edit it if needed, then Send question.'); document.getElementById('question')?.focus(); }}>Edit / resend heard text</button><button className="text-button" onClick={() => { stop(); controller.clear(); setTranscript(''); setAnswer(''); setDecision(''); setLastTiming({}); setLogs([]); setNotice('Conversation cleared. Your saved instructions are still applied.'); }}>Clear conversation</button></div>
    </section>

    <section className="step audio"><h2>Check your audio</h2><p>These tests work before signing in. Nothing is sent to GPT.</p><div className="actions"><button disabled={busy} onClick={() => void testSound()}>{testingSound ? 'Restart speaker test' : 'Test speakers'}</button><button disabled={busy} onClick={() => void testMic()}>{testingMic ? 'Stop microphone test' : 'Test microphone'}</button></div>{testingMic && <p className="hint">Say a sentence. The transcript appears in “Heard” above. Test ends after 15 seconds.</p>}{speechError && <p className="hint">{speechError}</p>}<p className="hint">Sound uses your Windows default speakers or headphones.</p>
      <details><summary>Microphone & pause settings</summary><label htmlFor="mic">Microphone</label><select id="mic" value={device} onChange={e => { stop(); setDevice(e.target.value); setNotice('Microphone changed. Click Speak once, Auto, or Test microphone to use it.'); }}><option value="">Windows default input</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select><label htmlFor="silence">How long to wait after speech</label><select id="silence" value={silence} onChange={e => { stop(); setSilence(e.target.value); setNotice('Pause setting updated. Start listening again when ready.'); }}>{[500, 700, 1000, 1500].map(ms => <option key={ms} value={ms}>{ms} ms</option>)}</select><label htmlFor="sensitivity">Voice detection</label><select id="sensitivity" value={vadThreshold} onChange={e => { stop(); setVadThreshold(e.target.value); setNotice('Voice sensitivity updated. Start listening again when ready.'); }}><option value="0.35">Sensitive — better for quiet speech</option><option value="0.5">Normal — less background pickup</option></select><p className="hint">A longer pause helps if it cuts off the end of your question. Sensitive detection may pick up more background speech.</p></details>
    </section>
    <details className="debug"><summary>Debug details</summary><p className="hint">Speaker preparation: {ttsMs === null ? '—' : `${ttsMs} ms`}. Transcript and answer history is off by default.</p><label className="check"><input type="checkbox" checked={logging} onChange={e => { setLogging(e.target.checked); loggingRef.current = e.target.checked; if (!e.target.checked) setLogs([]); }} />Keep recent turns in this page</label><button onClick={() => setLogs([])}>Clear debug history</button>{logs.map((log, i) => <div className="turn" key={i}><p>{log.question}</p><strong>{log.answer}</strong><p className="hint">First token {log.first ?? '—'} ms · GPT complete {log.total} ms</p></div>)}</details>
    <footer>Basic math is calculated on this PC and returns only the number. Other questions, your script, enabled memory and recent answered turns go to GPT. Audio stays on this PC.</footer>
  </main></>;
}
export default function App() { return Platform.OS === 'web' ? <WebApp /> : <View><Text>The Windows demo runs in your PC browser.</Text></View>; }
