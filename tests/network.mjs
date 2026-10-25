import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4184),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const host=await browser.newPage({viewport:{width:1100,height:850}}),guestContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),guest=await guestContext.newPage(),errors=[];
 for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
 await host.goto('http://127.0.0.1:4184/?debug');await host.locator('#host-button').click();
 await host.waitForFunction(()=>document.querySelector('#code').textContent.length===2&&window.__simant.game.ci,{},{timeout:60000});
 const code=await host.locator('#code').textContent();assert.equal(code.length,2);console.log('Room',code);
 await host.waitForTimeout(5000);const bounds=await host.locator('#game').boundingBox();
 for(const[x,y]of[[320,240],[320,280],[360,160]]){await host.mouse.click(bounds.x+x,bounds.y+y,{delay:120});await host.waitForTimeout(700);}
 await host.waitForTimeout(1000);
 await guest.goto(`http://127.0.0.1:4184/?debug#room=${code}`);await guest.locator('#join-button').click();
 await host.waitForTimeout(8000);
 console.log('Connection state',await host.evaluate(()=>({status:document.querySelector('#status').textContent,accepted:window.__simant.room?.accepted,colony:!!window.__simant.colony,running:window.__simant.colony?.running,players:window.__simant.colony?.players.map((_,i)=>window.__simant.colony.info(i)),views:window.__simant.colony?.views})),await guest.locator('#status').textContent());
 await host.screenshot({path:'test-results/network-start-host.png',fullPage:true});await guest.screenshot({path:'test-results/network-start-guest.png',fullPage:true});
 await host.waitForFunction(()=>window.__simant.colony?.players[1]&&window.__simant.colony.views[1],{},{timeout:20000});
 await guest.waitForFunction(()=>document.querySelector('#remote-video').videoWidth>0&&document.querySelector('#overlay').hidden,{},{timeout:60000});
 console.log('Connected',await host.evaluate(()=>[window.__simant.colony.info(0),window.__simant.colony.info(1)]));
 // Guest orders travel through PeerJS; host stays at the current nest position.
 const hostBefore=await host.evaluate(()=>window.__simant.colony.info(0));
 await guest.locator('#outside').tap();
 await host.waitForFunction(()=>window.__simant.colony.info(1).layer===1,{},{timeout:30000});
 const after=await host.evaluate(()=>[window.__simant.colony.info(0),window.__simant.colony.info(1)]);
 assert.equal(after[0].layer,hostBefore.layer);assert.equal(after[1].layer,1);
 await guest.waitForFunction(()=>document.querySelector('#location').textContent==='On the surface');
 // Check actual decoded video pixels, not just camera metadata or a live track.
 const expectedView=await host.evaluate(()=>window.__simant.guestCanvas.toDataURL());
 await guest.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=c.height=64;const context=c.getContext('2d');context.drawImage(image,0,0,64,64);const expected=context.getImageData(0,0,64,64).data;window.viewDifference=()=>{context.drawImage(document.querySelector('#remote-video'),0,0,64,64);const actual=context.getImageData(0,0,64,64).data;let sum=0;for(let i=0;i<actual.length;i++)if(i%4!==3)sum+=Math.abs(actual[i]-expected[i]);return sum/(64*64*3);};},expectedView);
 await guest.waitForFunction(()=>window.viewDifference()<8,{},{timeout:15000});
 console.log('Decoded remote view matches the guest canvas',await guest.evaluate(()=>window.viewDifference()));
 console.log('Guest moved outside independently; host stayed underground');
 await guest.locator('#sound').tap();
 const tracks=await guest.evaluate(()=>({audio:document.querySelector('#remote-video').srcObject.getAudioTracks().length,video:document.querySelector('#remote-video').srcObject.getVideoTracks().length,muted:document.querySelector('#remote-video').muted}));
 assert.equal(tracks.audio,1);assert.equal(tracks.video,1);assert.equal(tracks.muted,false);
 await host.screenshot({path:'test-results/network-host.png',fullPage:true});await guest.screenshot({path:'test-results/network-guest-phone.png',fullPage:true});
 const third=await browser.newPage();await third.goto(`http://127.0.0.1:4184/#room=${code}`);await third.locator('#join-button').click();await third.waitForFunction(()=>document.querySelector('#status').textContent.includes('already has two'),{},{timeout:30000});await third.close();console.log('Third player rejected');
 // Verify lost connection releases a held direction and the same ant can rejoin.
 await guest.keyboard.down('ArrowRight');await host.waitForFunction(()=>window.__simant.colony.masks[1]===8);await guest.close();await host.waitForFunction(()=>window.__simant.colony.masks[1]===0);
 await host.waitForFunction(()=>!window.__simant.room.accepted&&!window.__simant.colony.pending[1]&&!window.__simant.colony.info(1).moving);
 const position=await host.evaluate(()=>window.__simant.colony.info(1));const rejoin=await guestContext.newPage();await rejoin.goto(`http://127.0.0.1:4184/?debug#room=${code}`);await rejoin.locator('#join-button').click();
 try{await rejoin.waitForFunction(()=>document.querySelector('#remote-video').videoWidth>0&&document.querySelector('#overlay').hidden,{},{timeout:45000});}catch(error){
 console.log('Rejoin failure',await host.evaluate(()=>({status:document.querySelector('#status').textContent,accepted:window.__simant.room.accepted,running:window.__simant.colony.running,players:window.__simant.colony.players.map((_,i)=>window.__simant.colony.info(i)),gate:window.__simant.colony.mem.gate,ready:window.__simant.colony.mem.ram[window.__simant.colony.mem.gate+0x22]})),await rejoin.evaluate(()=>({status:document.querySelector('#status').textContent,accepted:window.__simant.room.accepted,width:document.querySelector('#remote-video').videoWidth,overlay:document.querySelector('#overlay').textContent,hidden:document.querySelector('#overlay').hidden})));
 await host.screenshot({path:'test-results/rejoin-failure-host.png',fullPage:true});await rejoin.screenshot({path:'test-results/rejoin-failure-guest.png',fullPage:true});throw error;}
 const restored=await host.evaluate(()=>window.__simant.colony.info(1));assert.equal(restored.layer,position.layer);assert.equal(restored.x,position.x);assert.equal(restored.y,position.y);console.log('Disconnect stops input; rejoin preserves the second ant');
 assert.deepEqual(errors,[]);
 await host.locator('#game-menu').click();await host.waitForFunction(()=>!window.__simant.colony);await host.waitForTimeout(500);
 await host.locator('#resume-coop').click();await host.waitForFunction(()=>window.__simant.colony?.players[1]&&window.__simant.colony.views[1],{},{timeout:30000});console.log('Original game controls and co-op resume passed');
 console.log('Real two-browser WebRTC, independent views, mobile controls, media and recovery checks passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
