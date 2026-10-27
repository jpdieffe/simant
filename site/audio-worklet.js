import {PcmQueue} from './pcm-queue.js';
class DosPcmProcessor extends AudioWorkletProcessor {
 constructor(options){
  super();this.queue=new PcmQueue(sampleRate,options.processorOptions);this.frames=0;this.closed=false;
  this.port.onmessage=({data})=>{
   if(data.type==='pcm')this.queue.push(data.samples,data.rate);
   else if(data.type==='reset')this.queue.reset();
   else if(data.type==='close')this.closed=true;
  };
 }
 process(inputs,outputs){
  if(this.closed)return false;
  const channels=outputs[0];if(!channels?.length)return true;
  this.queue.render(channels[0]);for(let c=1;c<channels.length;c++)channels[c].set(channels[0]);
  this.frames+=channels[0].length;if(this.frames>=sampleRate){this.frames=0;this.port.postMessage(this.queue.stats());}
  return true;
 }
}
registerProcessor('dos-mono-pcm',DosPcmProcessor);
