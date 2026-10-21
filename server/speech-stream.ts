import {validateAnswer} from '../src/core.js';
import {spokenText} from './spoken-text.js';

/** Only plain, complete sentences may leave before the response completes.
 * Links/markup are held for final citation-aware cleanup. */
export class SpeechSentences {
  private raw='';
  private consumed=0;
  constructor(private emit:(text:string)=>void){}
  push(delta:string){
    this.raw+=delta;
    if(this.raw.length>1200)throw new Error('Response was too long; remaining audio suppressed.');
    if(/\bSILENT\b/i.test(this.raw)||/[\u0000-\u0008]/.test(this.raw))return;
    const rest=this.raw.slice(this.consumed);
    for(const match of rest.matchAll(/[.!?]["”']?(?=\s)/g)){
      const end=match.index!+match[0].length;
      const sentence=rest.slice(0,end);
      // Avoid splitting titles, initials, decimals, URLs, or citation syntax.
      if(/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)|\b[A-Z])\.$/i.test(sentence))continue;
      if(/[\[\]<>`*_【】]|https?:|www\./i.test(sentence))return;
      const checked=validateAnswer(sentence);
      if(checked.kind!=='answer')return;
      this.consumed+=end;
      this.emit(checked.text);
      this.push('');
      return;
    }
  }
  finish(sources:{url:string;title:string}[]=[]){
    const full=spokenText(this.raw,sources);
    const checked=validateAnswer(full);
    if(checked.kind==='error')throw new Error(checked.reason);
    if(checked.kind==='answer'){
      const tail=spokenText(this.raw.slice(this.consumed),sources);
      if(tail){const part=validateAnswer(tail);if(part.kind!=='answer')throw new Error('Invalid remaining speech.');this.emit(part.text);}
    }
    return full;
  }
}
