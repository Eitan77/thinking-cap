export type Mode = 'off' | 'auto' | 'assistant';
export type HatState = 'OFF' | 'LISTENING' | 'HEARING' | 'THINKING' | 'SPEAKING' | 'COOLDOWN' | 'ERROR';
export type TranscriptEvent = {sessionId:string; utteranceId:string; text:string; isFinal:boolean; timestampMs:number};
export const DEFAULT_SCRIPT = `You are a discreet audio assistant. Answer reliably using general knowledge, reasoning, calculation, or facts supplied in this conversation.
Return only the shortest complete answer suitable for speaking. Include necessary units. Do not repeat the question or begin with filler. Round non-integer square roots to two decimal places.
Do not invent personal preferences, intentions, private facts, calendar entries, or current facts that are not established by reliable context. If unanswerable, ambiguous, subjective, or missing necessary data, output exactly SILENT.
No Markdown or extra commentary.`;

// Local candidate detection, not another model call. Punctuation alone is insufficient.
export function questions(text:string):string[] {
  const parts = text.trim().match(/[^?]+\?+|[^?]+$/g) ?? [];
  return parts.map(x => x.trim()).filter(x => {
    if (!x || /(?:\b(?:of|the|a|an|to|and|or|but|with|about|from|what|which|whose|where)|\.\.\.)\s*\??$/i.test(x)) return false;
    return /\?$/.test(x) || /^(?:(?:hey|okay|so|please)[, ]+)*(?:who|what|when|where|why|how|which|whose|whom|is|are|am|was|were|do|does|did|can|could|would|will|should|has|have|had|tell me|calculate|compute|explain|give me)\b/i.test(x);
  });
}
export function validateAnswer(raw:string):{kind:'answer';text:string}|{kind:'silent'}|{kind:'error';reason:string} {
  const text = raw.trim();
  if (text === 'SILENT') return {kind:'silent'};
  if (!text || /\bSILENT\b/i.test(text) || text.length > 1200 || /[\u0000-\u0008]/.test(text)) return {kind:'error',reason:'Response was empty, too long, or malformed; audio suppressed.'};
  return {kind:'answer',text};
}
export type Message = {role:'user'|'assistant';content:string};
export type Result = {text:string;firstTokenMs:number|null;totalMs:number};
export type Turn = {id:string;question:string;script:string;history:Message[]};
export interface AIProvider { ask(turn:Turn, signal:AbortSignal):Promise<Result> }
export interface Speaker { speak(text:string,signal:AbortSignal):Promise<void>; stop():void }

/** Queue finalized questions in order. Epoch cancellation prevents stale answers after Off/reset. */
export class Controller {
  mode:Mode = 'off'; state:HatState = 'OFF'; script = DEFAULT_SCRIPT;
  history:Message[] = []; private seen = new Set<string>(); private queue:{id:string;question:string}[]=[];
  private active?:AbortController; private epoch=0; private draining=false;
  onState:(state:HatState)=>void = ()=>{};
  onResult:(question:string,result:ReturnType<typeof validateAnswer>,timing:Result)=>void = ()=>{};
  onError:(message:string)=>void=()=>{};
  constructor(private ai:AIProvider,private speaker:Speaker) {}
  private set(state:HatState) { this.state=state; this.onState(state); }
  setMode(mode:Mode) { this.cancel(); this.mode=mode; this.set(mode==='off'?'OFF':'LISTENING'); }
  applyScript(script:string) { this.cancel(); this.script=script; this.history=[]; this.set(this.mode==='off'?'OFF':'LISTENING'); }
  clear() { this.applyScript(this.script); }
  cancel() { this.epoch++; this.active?.abort(); this.speaker.stop(); this.queue=[]; this.seen.clear(); }
  interrupt() { this.cancel(); this.set(this.mode==='off'?'OFF':'LISTENING'); }
  transcript(event:TranscriptEvent,activated=false) {
    if(this.mode==='off'||this.state==='SPEAKING'||this.state==='COOLDOWN')return;
    if(!event.isFinal){ if(!this.draining)this.set('HEARING'); return; }
    const key=event.sessionId+':'+event.utteranceId;
    if(this.seen.has(key))return;
    this.seen.add(key); if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value!);
    const candidates=this.mode==='auto'?questions(event.text):activated?[event.text.trim()].filter(Boolean):[];
    candidates.forEach((question,i)=>this.queue.push({id:key+':'+i,question}));
    if(!this.draining)void this.drain();
  }
  manual(question:string) {
    if(this.mode==='off'||!question.trim())return;
    this.queue.push({id:'manual:'+crypto.randomUUID(),question:question.trim()});
    if(!this.draining)void this.drain();
  }
  private async drain() {
    this.draining=true;
    try {
      while(this.queue.length&&this.mode!=='off') {
        const item=this.queue.shift()!; const epoch=this.epoch;
        const ac=new AbortController(); this.active=ac;
        try {
          this.set('THINKING');
          const timing=await this.ai.ask({...item,script:this.script,history:[...this.history]},ac.signal);
          if(ac.signal.aborted||epoch!==this.epoch)continue;
          const result=validateAnswer(timing.text); this.onResult(item.question,result,timing);
          if(result.kind==='error')throw new Error(result.reason);
          if(result.kind==='answer') {
            this.history=[...this.history,{role:'user',content:item.question},{role:'assistant',content:result.text}].slice(-8) as Message[];
            this.set('SPEAKING'); await this.speaker.speak(result.text,ac.signal);
            if(ac.signal.aborted||epoch!==this.epoch)continue;
            this.set('COOLDOWN');
            await new Promise<void>(resolve=>{const t=setTimeout(resolve,650);ac.signal.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});});
          }
        } catch(e) { if(!ac.signal.aborted&&epoch===this.epoch){this.set('ERROR');this.onError(e instanceof Error?e.message:'Request failed.');this.queue=[];} }
        finally { if(epoch===this.epoch){this.active=undefined;if((this.mode as Mode)!=='off')this.set('LISTENING');} }
      }
    } finally {this.draining=false;if(this.queue.length&&this.mode!=='off')void this.drain();}
  }
}
