import {chromium,devices} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from '../scripts/serve.mjs';
const simant=JSON.parse(await readFile(new URL('../package.json',import.meta.url))).name.startsWith('simant');
const port=simant?4222:4223,base=process.env.GAME_URL||`http://127.0.0.1:${port}/`,server=process.env.GAME_URL?null:createServer(port);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),key=simant?'__simant':'__chex';
try{
 const page=await browser.newPage({...devices['Pixel 7'],viewport:{width:844,height:390}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?debug');await page.locator(simant?'#start':'#solo').tap();await page.waitForFunction(k=>window[k]?.game?.ci,key,{timeout:60000});
 if(simant){
  await page.waitForTimeout(5000);const r=await page.locator('#game').boundingBox();
  for(const [x,y]of [[320,240],[320,280],[360,160]]){await page.touchscreen.tap(r.x+x*r.width/640,r.y+y*r.height/480);await page.waitForTimeout(700);}
  await page.waitForFunction(()=>window.__simant.desktop?.running,{},{timeout:30000});
 }else await page.waitForFunction(()=>window.__chex.game.playing,{},{timeout:60000});
 await page.waitForTimeout(1500);
 await page.evaluate(k=>{const g=window[k].game;window.soundAudit={samples:0,peak:0,started:g.audio.currentTime};const original=g.sound.bind(g);g.sound=s=>{soundAudit.samples+=s.length;for(const v of s)soundAudit.peak=Math.max(soundAudit.peak,Math.abs(v));original(s);};},key);
 const before=await page.evaluate(k=>window[k].game.pcm.stats,key);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.evaluate(()=>{window.audioStress=setInterval(()=>{const until=performance.now()+90;while(performance.now()<until){}},700);});
 await page.waitForTimeout(8000);await page.evaluate(()=>clearInterval(window.audioStress));await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await page.waitForTimeout(1200);
 const after=await page.evaluate(k=>({stats:window[k].game.pcm.stats,audit:soundAudit,elapsed:window[k].game.audio.currentTime-soundAudit.started,frames:window[k].game.frames??window[k].game.frameNumber}),key);
 console.log(simant?'SimAnt':'Chex Quest',{before,...after});
 assert.equal(after.stats.backend,'worklet');assert.ok(after.audit.samples>100000);assert.ok(after.audit.peak>0,'the actual game supplies non-silent sound');
 assert.equal(after.stats.underruns-before.underruns,0,'no audio underruns during simulated phone CPU/UI delays');assert.equal(after.stats.overruns-before.overruns,0,'no dropped audio from queue overflow');
 assert.ok(after.stats.outputSamples>before.outputSamples);assert.ok(after.stats.queuedMs<500);
 await page.evaluate(k=>{window[k].game.muted=true;},key);await page.waitForTimeout(100);assert.ok(await page.evaluate(k=>window[k].game.pcm.gain.gain.value<.001,key));
 await page.evaluate(k=>{window[k].game.muted=false;},key);await page.waitForTimeout(100);assert.ok(await page.evaluate(k=>window[k].game.pcm.gain.gain.value>.99,key));
 await page.evaluate(k=>window[k].game.close(),key);assert.deepEqual(errors,[]);
 console.log('PASS: correct mono PCM, continuous worklet playback under phone-sized CPU/UI stress, mute and cleanup. No sound drivers required.');
}finally{await browser.close();server?.close();}
