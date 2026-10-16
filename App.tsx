import React,{useEffect,useRef,useState} from 'react';
import {Platform,View,Text} from 'react-native';
import {Controller,DEFAULT_SCRIPT,type Mode,type HatState} from './src/core';
import {WindowsAI,WindowsMic,WindowsSpeaker,request} from './src/windows';

const css=`
*{box-sizing:border-box}body{margin:0;background:#f3f3ed;color:#202522;font-family:Inter,Segoe UI,sans-serif}button,input,textarea,select{font:inherit}button{cursor:pointer;border:1px solid #cbd0c6;background:#fff;border-radius:9px;padding:11px 15px;color:#26382e}button:hover{background:#edf2e9}button:disabled{opacity:.45;cursor:default}button.primary{background:#285844;color:#fff;border-color:#285844}button.danger{color:#993f36}a{color:#285844}main{max-width:1160px;margin:auto;padding:32px 30px 60px}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px}.brand{font-size:21px;font-weight:750;letter-spacing:-.6px}.brand span{font-weight:400;color:#798176;margin-left:12px;font-size:13px}.tag{font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#667561}.layout{display:grid;grid-template-columns:1.15fr 1fr;gap:22px}.card{background:#fff;border:1px solid #d9ded3;border-radius:16px;padding:24px;margin-bottom:20px}h1{font-size:34px;line-height:1.15;letter-spacing:-1.3px;margin:9px 0 15px}h2{font-size:17px;margin:0 0 15px;letter-spacing:-.25px}p{line-height:1.6;color:#687368;font-size:13px}.modes{display:flex;background:#f0f2eb;padding:5px;border-radius:11px;gap:5px;margin:24px 0}.modes button{flex:1;background:transparent;border-color:transparent}.modes button.selected{background:#fff;border:1px solid #b5c4ae;box-shadow:0 1px 4px #18361b12}.status{display:flex;gap:9px;align-items:center;font-size:12px;color:#5b6c59}.dot{width:8px;height:8px;background:#9ba497;border-radius:100%}.dot.on{background:#63994b;box-shadow:0 0 0 4px #eaf3e5}.visual{height:104px;display:flex;align-items:center;justify-content:center;gap:5px}.visual i{display:block;width:5px;background:#c5d5bd;border-radius:5px;height:12px}.visual.on i{animation:wave 1.2s infinite alternate}.visual i:nth-child(3n){height:44px;animation-delay:.2s}.visual i:nth-child(2n){height:26px;animation-delay:.5s}.visual i:nth-child(5n){height:64px;animation-delay:.8s}@keyframes wave{to{transform:scaleY(.3)}}.answer{font-size:27px;font-weight:600;letter-spacing:-.7px;min-height:44px;overflow-wrap:anywhere}.label{font-size:11px;color:#788573;text-transform:uppercase;letter-spacing:1.2px;margin:10px 0}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row.spread{justify-content:space-between}textarea,input,select{width:100%;border:1px solid #d5dbcf;background:#fcfdf9;color:#283b2d;padding:12px;border-radius:8px}textarea{resize:vertical;font-family:Consolas,monospace;font-size:12px;line-height:1.6}select{margin:7px 0 12px}.help{font-size:12px;line-height:1.6;color:#788573}.error{background:#fff1eb;border:1px solid #e8c0ab;padding:14px;border-radius:9px;color:#863c27;font-size:13px;margin-bottom:18px}.notice{background:#eef3e8;padding:12px;border-radius:8px;font-size:12px;color:#4b6546;line-height:1.6}.metric{font:12px Consolas,monospace;color:#71816b}.transcript{min-height:35px;color:#66775d;font-size:14px;line-height:1.6}details{border-top:1px solid #e5e9df;padding-top:12px;margin-top:16px}summary{cursor:pointer;font-size:12px;color:#687560}.turn{border-top:1px solid #edf0e7;padding:12px 0;font-size:13px}.turn p{margin:5px 0}.small{font-size:11px;color:#87927f}footer{font-size:11px;color:#89927f;margin-top:10px}label{font-size:12px;color:#61715c}.full{grid-column:1/-1}@media(max-width:800px){.layout{grid-template-columns:1fr}main{padding:22px 16px}.brand span{display:none}h1{font-size:29px}}
`;
type Log={question:string;answer:string;total:number;first:number|null;at:string};
function WebApp(){
  const ai=useRef(new WindowsAI()).current;
  const speaker=useRef(new WindowsSpeaker()).current;
  const mic=useRef(new WindowsMic()).current;
  const controller=useRef(new Controller(ai,speaker)).current;
  const [mode,setMode]=useState<Mode>('off'),[state,setState]=useState<HatState>('OFF');
  const [script,setScript]=useState(DEFAULT_SCRIPT),[applied,setApplied]=useState(DEFAULT_SCRIPT);
  const [session,setSession]=useState<any>({status:'disconnected'}),[profiles,setProfiles]=useState<any[]>([]);
  const [authBusy,setAuthBusy]=useState(false),[models,setModels]=useState<any[]>([]),[model,setModel]=useState('');
  const [health,setHealth]=useState<any>({ready:false}),[error,setError]=useState('');
  const [transcript,setTranscript]=useState(''),[answer,setAnswer]=useState('Ready when you are.');
  const [logs,setLogs]=useState<Log[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[silence,setSilence]=useState('700');
  const [armed,setArmed]=useState(false),armedRef=useRef(false),generation=useRef(0);
  const [ttsMs,setTtsMs]=useState<number|null>(null),[logging,setLogging]=useState(false),loggingRef=useRef(false);
  const modelLoaded=useRef('');const lastFinalAt=useRef<number|null>(null),[endToSound,setEndToSound]=useState<number|null>(null);
  const turnTimeout=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  function disarm(){armedRef.current=false;setArmed(false);if(controller.mode==='assistant')mic.sending=false;clearTimeout(turnTimeout.current);}
  function off(){generation.current++;mic.stop();controller.setMode('off');setMode('off');disarm();setBusy(false);setTranscript('');}
  useEffect(()=>{
    controller.onState=s=>{
      setState(s);const blocked=s==='SPEAKING'||s==='COOLDOWN';mic.suppress(blocked);
      mic.sending=!blocked&&(controller.mode==='auto'||armedRef.current);
    };
    controller.onError=setError;
    controller.onResult=(question,result,timing)=>{
      setAnswer(result.kind==='answer'?result.text:result.kind==='silent'?'SILENT — no audio':result.reason);
      if(loggingRef.current)setLogs(old=>[{question,answer:timing.text,total:timing.totalMs,first:timing.firstTokenMs,at:new Date().toLocaleTimeString()},...old].slice(0,30));
    };
    speaker.onSound=ms=>{setTtsMs(ms);if(lastFinalAt.current)setEndToSound(Math.round(performance.now()-lastFinalAt.current));};
    mic.onTranscript=event=>{
      setTranscript(event.text);
      if(event.isFinal){lastFinalAt.current=performance.now();const wasArmed=armedRef.current;if(controller.mode==='assistant'){mic.stop();disarm();}controller.transcript(event,wasArmed);}
      else controller.transcript(event,armedRef.current);
    };
    mic.onError=message=>{off();setError(message);};
    let stopped=false;
    async function poll(){
      try {
        const data=await request('session');if(stopped)return;
        setSession(data.session);setProfiles(data.profiles);setAuthBusy(data.authBusy);if(data.authError)setError(data.authError);
        const key=data.session.status==='connected'&&data.session.sharing?data.session.profileId??'active':'';
        if(key&&modelLoaded.current!==key){modelLoaded.current=key;try{const list=await request('models');if(stopped)return;setModels(list);setModel(list[0]?.slug??'');ai.model=list[0]?.slug??'';}catch(e){modelLoaded.current='';setError((e as Error).message);}}
        if(!key){modelLoaded.current='';setModels([]);setModel('');ai.model='';if(controller.mode!=='off')off();}
        const status=await request('health');if(!stopped)setHealth(status);
      }catch{if(!stopped)setHealth({ready:false,error:'Local helper is unavailable. Run the start script.'});}
    }
    void poll();const interval=setInterval(()=>void poll(),4000);
    return()=>{stopped=true;clearInterval(interval);clearTimeout(turnTimeout.current);mic.stop();controller.setMode('off');};
  },[]);
  async function changeMode(next:Mode){
    if(next==='off'){off();return;}
    const epoch=++generation.current;mic.stop();controller.setMode('off');disarm();setBusy(true);setError('');
    try {
      if(next==='auto')await mic.start(device,Number(silence));
      if(epoch!==generation.current)return;
      if(next==='auto')setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'));
      setMode(next);controller.setMode(next);mic.sending=next==='auto';
    }catch(e){if(epoch===generation.current){off();setError((e as Error).message);}}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  async function auth(action:string,data:unknown={}){off();setError('');try{await request(action,data);}catch(e){setError((e as Error).message);}}
  async function arm(){
    const epoch=++generation.current;setBusy(true);setError('');controller.interrupt();
    try{
      await mic.start(device,Number(silence));if(epoch!==generation.current)return;
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'));
      mic.command({type:'arm'});armedRef.current=true;setArmed(true);mic.sending=true;setTranscript('');
      turnTimeout.current=setTimeout(()=>{mic.stop();disarm();setError('No completed turn received within 30 seconds.');},30000);
    }catch(e){if(epoch===generation.current){mic.stop();setError((e as Error).message);}}
    finally{if(epoch===generation.current)setBusy(false);}
  }
  function flush(){mic.sending=false;mic.command({type:'flush'});}
  async function enableAudio(){
    try{const context=new AudioContext();await context.resume();const osc=context.createOscillator(),gain=context.createGain();gain.gain.value=.015;osc.connect(gain);gain.connect(context.destination);osc.frequency.value=440;osc.start();osc.stop(context.currentTime+.08);setTimeout(()=>void context.close(),200);}catch(e){setError((e as Error).message);}
  }
  function apply(){controller.applyScript(script);mic.command({type:'reset'});disarm();setApplied(script);setTranscript('');setAnswer('Instructions applied. Fresh conversation.');}
  const connected=session.status==='connected'&&session.sharing;
  return <><style>{css}</style><main>
    <header><div className="brand">◒ Thinking Cap <span>Windows voice studio</span></div><div className="tag">Prototype / 0.1</div></header>
    {error&&<div className="error" role="alert">{error} <button onClick={()=>setError('')}>Dismiss</button></div>}
    <div className="layout"><section>
      <div className="card"><div className="tag">Listen. Think. Answer.</div><h1>A little less searching.<br/>A little more knowing.</h1><p>Give your assistant instructions, choose a mode, and speak naturally.</p>
        <div className="modes" aria-label="Listening mode">{(['off','auto','assistant'] as Mode[]).map(m=><button key={m} aria-pressed={mode===m} className={mode===m?'selected':''} disabled={m!=='off'&&(busy||!connected||(m==='auto'&&!health.ready))} onClick={()=>void changeMode(m)}>{m==='off'?'Off':m==='auto'?'Auto':'Button turn'}</button>)}</div>
        <div className="row spread"><div className="status"><span className={'dot '+(mode==='auto'||armed?'on':'')}/>{busy?'Starting microphone…':state.replaceAll('_',' ')}</div><span className="small">{mode==='auto'||armed?'Microphone active':'Microphone released'}</span></div>
        <div className={'visual '+(state==='HEARING'||state==='SPEAKING'?'on':'')} aria-hidden="true">{Array.from({length:27},(_,i)=><i key={i}/>)}</div>
        {mode==='auto'&&<div className="notice">Auto sends each completed question detected by this microphone to GPT. Local detection can miss questions or misclassify speech. Use it where people know you are listening. Audio capture is suppressed during answers and cooldown.</div>}
        {mode==='assistant'&&<button className="primary" disabled={busy||!health.ready||state==='THINKING'||state==='SPEAKING'} onClick={armed?flush:()=>void arm()}>{armed?'Finish turn':'Listen for one turn'}</button>}
        <div className="label">Latest transcript</div><div className="transcript">{transcript||'Your speech will appear here during this session.'}</div>
        <div className="label">Answer</div><div className="answer" aria-live="polite">{answer}</div>
        <div className="row" style={{marginTop:22}}><button onClick={()=>{controller.interrupt();mic.command({type:'reset'});if(controller.mode==='assistant')mic.stop();disarm();}}>Interrupt answer</button><button className="danger" onClick={off}>Mute / Off</button><button onClick={()=>void enableAudio()}>Enable audio ↗</button></div>
        <p className="help">Output follows your Windows default speakers, headphones, or paired Bluetooth device.</p>
      </div>
      <div className="card"><h2>ChatGPT connection</h2><div className="status"><span className={'dot '+(connected?'on':'')}/>{session.identity?.email??session.status}{connected?' · Plan access enabled':''}</div>
        <div className="row" style={{marginTop:16}}><button className="primary" disabled={authBusy} onClick={()=>void auth('signin',{reconsent:session.status==='connected'&&!session.sharing})}>{authBusy?'Waiting for sign-in…':connected?'Reconnect ChatGPT':'Continue with ChatGPT'}</button>{authBusy&&<button onClick={()=>void auth('cancel-signin')}>Cancel</button>}{session.status==='connected'&&<button onClick={()=>void auth('signout')}>Sign out</button>}</div>
        {profiles.length>0&&<><label>Saved account</label><select value={session.profileId??''} onChange={e=>void auth('profile',{id:e.target.value})}>{profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select><button disabled={authBusy} onClick={()=>void auth('signin',{newProfile:true})}>Add account</button></>}
        <label htmlFor="model">Model</label><select id="model" value={model} disabled={!connected} onChange={e=>{controller.clear();setModel(e.target.value);ai.model=e.target.value;}}><option value="">{connected?'Select a model':'Connect to load available models'}</option>{models.map(m=><option key={m.slug} value={m.slug}>{m.displayName}</option>)}</select>
        <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage ChatGPT usage & access ↗</a><p className="help">Uses eligible ChatGPT plan access. Credentials are encrypted for your Windows user. No API billing fallback is enabled.</p>
      </div>
    </section><section>
      <div className="card"><div className="row spread"><h2>Session instructions</h2><span className="tag">{script===applied?'Applied':'Unsaved changes'}</span></div><p>Precondition the assistant here. These instructions accompany every question, along with the last four answered turns.</p>
        <label htmlFor="script">Instruction script</label><textarea id="script" rows={12} value={script} maxLength={12000} onChange={e=>setScript(e.target.value)} spellCheck={false}/>
        <div className="row" style={{marginTop:12}}><button className="primary" disabled={!script.trim()} onClick={apply}>Apply & start fresh</button><button onClick={()=>setScript(DEFAULT_SCRIPT)}>Load default</button><button onClick={()=>{controller.clear();mic.command({type:'reset'});disarm();setTranscript('');setLogs([]);setAnswer('Conversation cleared.');}}>Clear conversation</button></div>
        <p className="help">Scripts and conversation are memory-only. Paste a script each launch. Applying a script cancels pending answers and clears conversation history.</p>
      </div>
      <div className="card"><h2>Audio & timing</h2><div className="status"><span className={'dot '+(health.ready?'on':'')}/>{health.ready?'Local speech ready':'Local speech warming up'}</div>{health.error&&<p>{health.error}</p>}
        <div style={{marginTop:16}}><label htmlFor="mic">Microphone</label><select id="mic" value={device} disabled={mode!=='off'} onChange={e=>setDevice(e.target.value)}><option value="">Windows default input</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Microphone'}</option>)}</select></div>
        <label htmlFor="silence">Pause before finalizing a question</label><select id="silence" value={silence} disabled={mode!=='off'} onChange={e=>setSilence(e.target.value)}>{[500,700,1000,1500].map(ms=><option key={ms} value={ms}>{ms} ms</option>)}</select>
        <p className="metric">TTS to playback: {ttsMs===null?'—':ttsMs+' ms'}<br/>Final transcript to sound: {endToSound===null?'—':endToSound+' ms'}</p><p className="help">Local CPU transcription · Silero VAD · Piper voice. Playback timing is a browser callback, not physical Bluetooth latency.</p>
      </div>
    </section>
    <section className="card full"><div className="row spread"><h2>Debug bench</h2><label><input style={{width:'auto'}} type="checkbox" checked={logging} onChange={e=>{setLogging(e.target.checked);loggingRef.current=e.target.checked;if(!e.target.checked)setLogs([]);}}/> Keep recent turns in this page</label></div>
      <div className="row"><input aria-label="Test question" placeholder="Type a question to test instructions and GPT…" value={input} maxLength={4000} onChange={e=>setInput(e.target.value)} style={{flex:1}}/><button className="primary" disabled={!connected||mode==='off'||!input.trim()} onClick={()=>{controller.manual(input);setInput('');}}>Send test</button><button onClick={()=>setLogs([])}>Clear debug</button></div><p className="help">Choose an active mode to submit tests. Debug text stays in page memory; no transcript files are written.</p>
      {logs.map((log,i)=><div className="turn" key={i}><span className="small">{log.at}</span><p>{log.question}</p><strong>{log.answer}</strong><p className="metric">First token {log.first??'—'} ms · GPT complete {log.total} ms</p></div>)}
    </section></div><footer>Thinking Cap · Local audio processing. Only submitted text and session instructions go to GPT. Off releases the microphone.</footer>
  </main></>;
}
export default function App(){return Platform.OS==='web'?<WebApp/>:<View><Text>The Windows MVP runs in your PC browser. Native iOS audio adapters are planned.</Text></View>;}
