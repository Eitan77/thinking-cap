import type {AIProvider,Speaker,TranscriptEvent,Turn} from './core';
export const API = typeof location!=='undefined'&&location.port==='8081'?'http://127.0.0.1:4317':'';
export async function request(path:string,data?:unknown,signal?:AbortSignal){
  const response=await fetch(API+'/api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:signal??AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error??'Local helper request failed.');return result;
}
export class WindowsAI implements AIProvider {
  model='';
  effort='';
  webSearch=true;
  ask(turn:Turn,signal:AbortSignal){if(!this.model)throw new Error('Connect ChatGPT and select a model first.');return request('ask',{...turn,model:this.model,effort:this.effort,webSearch:this.webSearch,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},signal);}
}
export class WindowsSpeaker implements Speaker {
  private audio?:HTMLAudioElement; private url?:string; private finish?:()=>void;
  onSound:(ms:number)=>void=()=>{};
  stop(){this.audio?.pause();this.finish?.();this.finish=undefined;this.audio=undefined;if(this.url)URL.revokeObjectURL(this.url);this.url=undefined;}
  async speak(text:string,signal:AbortSignal){
    this.stop(); const started=performance.now();
    const response=await fetch(API+'/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal});
    if(!response.ok)throw new Error('Local TTS failed. Check speech service status.');
    const blob=await response.blob();if(signal.aborted)return;
    this.url=URL.createObjectURL(blob);const audio=new Audio(this.url);this.audio=audio;
    await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{signal.removeEventListener('abort',abort);this.finish=undefined;};
      const done=()=>{cleanup();resolve();};const abort=()=>{audio.pause();done();};
      this.finish=done;signal.addEventListener('abort',abort,{once:true});
      audio.onplaying=()=>this.onSound(Math.round(performance.now()-started));
      audio.onended=done;audio.onerror=()=>{cleanup();reject(new Error('Audio playback failed.'));};
      audio.play().catch(()=>{cleanup();reject(new Error('Browser blocked audio. Click Enable audio, then try again.'));});
    });
    if(this.audio===audio)this.stop();
  }
}
export class WindowsMic {
  private stream?:MediaStream;private context?:AudioContext;private source?:MediaStreamAudioSourceNode;private worklet?:AudioWorkletNode;private socket?:WebSocket;
  sending=false;private suppressed=false;private generation=0;onTranscript:(e:TranscriptEvent)=>void=()=>{};onError:(text:string)=>void=()=>{};onStatus:(text:string)=>void=()=>{};
  async start(deviceId:string,silenceMs:number,vadThreshold=0.35){
    this.stop();
    const generation=this.generation;
    const check=()=>{if(generation!==this.generation)throw new DOMException('Microphone start cancelled.','AbortError');};
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());check();}this.stream=stream;
      stream.getAudioTracks()[0].onended=()=>this.onError('Microphone was disconnected or interrupted.');
      const socket=new WebSocket((API||location.origin).replace(/^http/,'ws')+'/speech');this.socket=socket;
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>{socket.close();reject(new Error('Speech service did not become ready.'));},10000);
        socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}};
        socket.onerror=()=>{clearTimeout(timer);reject(new Error('Speech service connection failed.'));};
      });
      check();
      socket.onmessage=e=>{const event=JSON.parse(e.data);if(event.type==='transcript')this.onTranscript(event);if(event.type==='error')this.onError(event.message);if(event.type==='status')this.onStatus(event.message);};
      socket.onclose=()=>{if(this.socket===socket)this.onError('Speech service disconnected.');};
      this.command({type:'configure',silenceMs,vadThreshold});
      const context=new AudioContext();this.context=context;await context.audioWorklet.addModule('/pcm-worklet.js');check();await context.resume();check();
      this.source=context.createMediaStreamSource(stream);this.worklet=new AudioWorkletNode(context,'thinking-cap-pcm');
      const mute=context.createGain();mute.gain.value=0;
      this.worklet.port.onmessage=e=>{if(this.sending&&socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>128000){this.onError('Audio processing fell behind. Restart listening.');return;}socket.send(e.data);}};
      this.source.connect(this.worklet);this.worklet.connect(mute);mute.connect(context.destination);
    }catch(e){if(generation===this.generation)this.stop();throw e;}
  }
  command(data:unknown){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(data));}
  suppress(value:boolean){if(this.suppressed!==value){this.suppressed=value;this.command({type:'suppress',value});}}
  stop(){this.generation++;this.sending=false;this.suppressed=false;const socket=this.socket;this.socket=undefined;socket?.close();this.worklet?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=undefined;void this.context?.close().catch(()=>{});this.context=undefined;}
}
