import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4185),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4185/?desktop=original&debug');await page.locator('#start').click();
  await page.waitForFunction(()=>window.__simant?.game.ci,{},{timeout:60000});await page.waitForTimeout(5000);
  async function clickDOS(x,y){const r=await page.locator('#game').boundingBox();await page.mouse.click(r.x+x*r.width/640,r.y+y*r.height/480,{delay:120});}
  for(const[x,y]of[[320,240],[320,280],[360,160]]){await clickDOS(x,y);await page.waitForTimeout(700);}
  await page.waitForFunction(()=>!document.querySelector('#follow-ant').disabled);
  const state=()=>page.evaluate(()=>{const m=window.__simant.game.memoryBridge,b=m.globals;return {...m.ant(),view:{x:m.word(b+0x508),y:m.word(b+0x50a),layer:m.word(b+0x32e),columns:m.word(b+0x10e0),rows:m.word(b+0x10de),left:m.word(b+0x110c),top:m.word(b+0x110e)},following:m.autoTrack(),moving:m.word(b+0xaa0),targetX:m.word(b+0xad6),targetY:m.word(b+0xae8)};});
  async function clickTile(x,y){const {view}=await state();await clickDOS(view.left+(x-view.x)*16+8,view.top+(y-view.y)*16+8);}
  assert.equal((await state()).following,true,'Solo enables the original AutoTrack option');
  await clickTile(32,0);
  await page.waitForFunction(()=>window.__simant.game.memoryBridge.ant().layer===1,{},{timeout:20000});
  await page.waitForFunction(()=>{const m=window.__simant.game.memoryBridge;return !m.word(m.globals+0xaa0);},{},{timeout:10000});
  const initial=await state();console.log('Solo surface',initial);
  const visited=[];
  for(let i=0;i<2;i++){
    const before=await state(),target=before.view.x+2;
    await clickTile(target,before.y);
    try{await page.waitForFunction(x=>{const p=window.__simant.game.memoryBridge.ant();return p.layer===1&&p.x<=x;},target,{timeout:20000});}catch(error){console.log('Movement failure',{before,target,after:await state()});await page.screenshot({path:'test-results/solo-camera-failure.png',fullPage:true});throw error;}
    await page.waitForFunction(()=>{const m=window.__simant.game.memoryBridge;return !m.word(m.globals+0xaa0);});
    const after=await state();assert(after.view.x<before.view.x,'Native camera scrolls with the ant');visited.push(after);
  }
  assert(visited.at(-1).x<initial.view.x,'Ant reaches ground beyond the initial screen');
  console.log('Crossed the original screen edge',visited.map(p=>({x:p.x,y:p.y,cameraX:p.view.x})));
  await page.locator('#follow-ant').click();assert.equal((await state()).following,false);
  await page.locator('#follow-ant').click();assert.equal((await state()).following,true);
  for(const viewport of[{width:844,height:390},{width:393,height:852}]){
    await page.setViewportSize(viewport);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`test-results/solo-follow-${viewport.width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Solo native movement, scrolling across screens, Follow ant toggle, and mobile layouts passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
