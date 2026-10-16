// Resample any hardware sample rate to 16 kHz, then emit bounded PCM16 frames.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.sum=0;this.count=0;this.phase=0;this.buffer=new Int16Array(1024);this.used=0; }
  process(inputs) {
    const channel=inputs[0]?.[0];if(!channel)return true;
    for(const sample of channel){
      this.sum+=sample;this.count++;this.phase+=16000;
      if(this.phase>=sampleRate){
        this.phase-=sampleRate;
        this.buffer[this.used++]=Math.round(Math.max(-1,Math.min(1,this.sum/this.count))*32767);
        this.sum=0;this.count=0;
        if(this.used===1024){const output=this.buffer;this.port.postMessage(output.buffer,[output.buffer]);this.buffer=new Int16Array(1024);this.used=0;}
      }
    }
    return true;
  }
}
registerProcessor('thinking-cap-pcm',PCMProcessor);
