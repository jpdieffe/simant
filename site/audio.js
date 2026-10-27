// One persistent audio stream, independent of drawing and browser UI callbacks.
export class PcmAudio {
 constructor(context,streamTarget=null,{bufferSeconds=.18,maxSeconds=.65}={}){
  this.bufferSeconds=bufferSeconds;this.maxSeconds=maxSeconds;
  this.context=context;this.streamTarget=streamTarget;this.nodes=new Set();this.next=0;
  this.gain=context.createGain();this.gain.connect(context.destination);
  this.stats={backend:'loading',underruns:0,overruns:0,inputSamples:0};
  this.onState=()=>{if(context.state!=='running')this.reset();};context.addEventListener('statechange',this.onState);
 }
 async init(){
  try{
   if(!this.context.audioWorklet||typeof AudioWorkletNode==='undefined')throw Error('AudioWorklet unavailable');
   await this.context.audioWorklet.addModule(new URL('./audio-worklet.js',import.meta.url));
   this.node=new AudioWorkletNode(this.context,'dos-mono-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{bufferSeconds:this.bufferSeconds,maxSeconds:this.maxSeconds}});
   this.node.connect(this.gain);if(this.streamTarget)this.node.connect(this.streamTarget);
   this.node.port.onmessage=({data})=>{this.stats={...data,backend:'worklet'};};this.stats.backend='worklet';
  }catch(error){this.stats.backend='scheduled';this.fallbackReason=error.message;}
 }
 setMuted(muted){this.gain.gain.setTargetAtTime(muted?0:1,this.context.currentTime,.005);}
 push(samples,rate){
  if(this.closed||this.context.state!=='running'||!samples.length)return;
  if(this.node){const copy=new Float32Array(samples);this.node.port.postMessage({type:'pcm',samples:copy,rate},[copy.buffer]);return;}
  // Older browsers retain correct mono duration and enough scheduling headroom.
  const now=this.context.currentTime;
  if(!this.next||this.next<now){if(this.next)this.stats.underruns++;this.next=now+this.bufferSeconds;}
  if(this.next>now+this.maxSeconds){this.stats.overruns++;return;}
  const buffer=this.context.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);
  const node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.gain);if(this.streamTarget)node.connect(this.streamTarget);
  this.nodes.add(node);node.onended=()=>{node.disconnect();this.nodes.delete(node);};node.start(this.next);this.next+=buffer.duration;
  this.stats.inputSamples+=samples.length;
 }
 reset(){this.node?.port.postMessage({type:'reset'});for(const node of this.nodes){node.stop();node.disconnect();}this.nodes.clear();this.next=0;}
 close(){this.closed=true;this.context.removeEventListener('statechange',this.onState);this.reset();this.node?.port.postMessage({type:'close'});this.node?.disconnect();this.node?.port.close();this.gain.disconnect();}
}
