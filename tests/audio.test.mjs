import test from 'node:test';
import assert from 'node:assert/strict';
import {PcmQueue} from '../site/pcm-queue.js';
import {PcmAudio} from '../site/audio.js';
test('mono PCM retains duration and pitch at 44.1 and 48 kHz device rates',()=>{
 for(const outputRate of [44100,48000]){
  const queue=new PcmQueue(outputRate,{maxSeconds:2,adaptive:false});
  queue.push(Float32Array.from({length:22050},(_,i)=>.5*Math.sin(2*Math.PI*440*i/22050)),22050);
  const output=new Float32Array(outputRate*.9);queue.render(output);
  let crossings=0;for(let i=1000;i<output.length;i++)if(output[i-1]<=0&&output[i]>0)crossings++;
  assert.ok(Math.abs(crossings/((output.length-1000)/outputRate)-440)<2,'the original 440 Hz tone must not become 880 Hz');
  assert.ok(queue.stats().queuedMs>90&&queue.stats().queuedMs<120,'900 ms output consumes 900 ms of mono input');assert.equal(queue.underruns,0);
 }
});
test('buffer absorbs a 90 ms delivery delay without gaps, and starvation refills before resuming',()=>{
 const queue=new PcmQueue(48000);queue.push(new Float32Array(22050*.18).fill(.3),22050);
 queue.render(new Float32Array(48000*.09));assert.equal(queue.underruns,0);
 queue.push(new Float32Array(22050*.09).fill(.3),22050);queue.render(new Float32Array(48000*.09));assert.equal(queue.underruns,0);
 const tail=new Float32Array(48000*.3);queue.render(tail);assert.equal(queue.underruns,1);assert.equal(tail.at(-1),0);
 queue.push(new Float32Array(512).fill(.3),22050);queue.render(new Float32Array(128));assert.equal(queue.started,false);
 queue.push(new Float32Array(4000).fill(.3),22050);queue.render(new Float32Array(128));assert.equal(queue.started,true);
});
test('long stalls stay bounded and resetting discards stale buffered audio',()=>{
 const queue=new PcmQueue(48000);queue.push(new Float32Array(22050),22050);
 assert.ok(queue.stats().overruns>0);assert.ok(queue.stats().queuedMs<=650);queue.reset();assert.equal(queue.bufferedFrames(),0);
 const output=new Float32Array(128).fill(1);queue.render(output);assert.ok(output.every(v=>v===0));
});
test('emulator clock drift is corrected without dropping chunks or raising music pitch',()=>{
 const queue=new PcmQueue(48000,{bufferSeconds:.3,maxSeconds:.8});let input=0,debt=0;
 const feed=n=>{queue.push(Float32Array.from({length:n},()=>.5*Math.sin(2*Math.PI*440*input++/22050)),22050);};
 feed(6615);const lastSecond=[];
 for(let i=0;i<3750;i++){
  debt+=128/48000*22050*1.09;const n=Math.floor(debt);debt-=n;feed(n);
  const output=new Float32Array(128);queue.render(output);if(i>=3375)lastSecond.push(...output);
 }
 let crossings=0;for(let i=1;i<lastSecond.length;i++)if(lastSecond[i-1]<=0&&lastSecond[i]>0)crossings++;
 assert.ok(Math.abs(crossings-440)<3,`pitch was ${crossings} Hz`);
 assert.equal(queue.underruns,0);assert.equal(queue.stats().overruns,0);assert.ok(queue.stats().queuedMs<600);
});
test('fallback schedules complete mono chunks, streams before local mute, and releases sources',async()=>{
 const sources=[],stream={},context={state:'running',currentTime:1,destination:{},addEventListener(){},removeEventListener(){},
  createGain(){return{connect(){},disconnect(){},gain:{setTargetAtTime(v){this.value=v;}}};},
  createBuffer(channels,length,rate){assert.equal(channels,1);return{duration:length/rate,copyToChannel(s,c){assert.equal(s.length,length);assert.equal(c,0);}};},
  createBufferSource(){const node={connections:[],connect(to){this.connections.push(to);},disconnect(){},stop(){this.stopped=true;},start(t){this.started=t;}};sources.push(node);return node;}};
 const audio=new PcmAudio(context,stream);await audio.init();const samples=new Float32Array(2048);audio.push(samples,22050);audio.push(samples,22050);
 assert.ok(Math.abs(sources[1].started-sources[0].started-2048/22050)<1e-9);assert.equal(audio.stats.backend,'scheduled');
 audio.setMuted(true);assert.equal(audio.gain.gain.value,0);assert.ok(sources[0].connections.includes(stream));
 context.state='suspended';audio.onState();assert.ok(sources.every(n=>n.stopped));assert.equal(audio.next,0);
 audio.close();assert.equal(audio.nodes.size,0);
});
