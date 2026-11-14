// 16 kHz PCM, 50 ms frames. VAD is a local interruption aid, not speech recognition.
class Capture extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.phase=0;this.started=false;this.loud=0;this.quiet=0;this.frames=0;this.preroll=[];}
  process(inputs){
    const input=inputs[0]?.[0];if(!input)return true;
    for(const x of input){this.phase+=16000;if(this.phase>=sampleRate){this.phase-=sampleRate;this.samples.push(Math.max(-1,Math.min(1,x)));}}
    while(this.samples.length>=800){
      const f=this.samples.splice(0,800),rms=Math.sqrt(f.reduce((a,x)=>a+x*x,0)/800);
      this.loud=rms>.018?this.loud+1:0;this.quiet=rms>.018?0:this.quiet+1;
      const pcm=new Int16Array(f.map(x=>Math.round(x*32767)));
      if(!this.started){
        this.preroll.push(pcm);if(this.preroll.length>3)this.preroll.shift();
        if(this.loud<2)continue;
        this.started=true;this.frames=0;this.port.postMessage({type:'start'});
        for(const frame of this.preroll)this.port.postMessage({type:'audio',buffer:frame.buffer},[frame.buffer]);
        this.preroll=[];
      }else this.port.postMessage({type:'audio',buffer:pcm.buffer},[pcm.buffer]);
      this.frames++;if(this.quiet>=14||this.frames>=300){this.started=false;this.port.postMessage({type:'end'});}

    }
    return true;
  }
}
registerProcessor('partition-capture',Capture);
