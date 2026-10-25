import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4182);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')console.log('Browser:',msg.text());});
  await page.goto('http://127.0.0.1:4182/?debug');
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__simant?.game.ci,{},{timeout:60000});
  await page.waitForFunction(async()=> (await window.__simant.game.ci.getRunningProgram()).toLowerCase().includes('simant'),{},{timeout:60000});
  console.log('DOSBox has launched SIMANT.EXE');
  await page.waitForTimeout(5000);
  assert.match(await page.evaluate(()=>window.__simant.game.ci.getRunningProgram()),/^simant$/i,'Game remains running after boot');
  console.log('Runtime',await page.evaluate(async()=>({program:await window.__simant.game.ci.getRunningProgram(),width:window.__simant.game.ci.width(),height:window.__simant.game.ci.height(),status:document.querySelector('#status').textContent})));
  await page.screenshot({path:'test-results/original-boot.png',fullPage:true});
  const bounds=await page.locator('#game').boundingBox();
  for(const [x,y] of [[320,240],[320,280],[360,160]]){
    await page.mouse.click(bounds.x+x,bounds.y+y);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  assert.match(await page.evaluate(()=>window.__simant.game.ci.getRunningProgram()),/^simant$/i);
  await page.screenshot({path:'test-results/original-quick-game.png',fullPage:true});
  console.log('Started original Quick Game using browser mouse controls');
  assert.deepEqual(errors,[]);
  for(const viewport of [{width:844,height:390},{width:393,height:852}]){
    await page.setViewportSize(viewport);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    await page.screenshot({path:`test-results/mobile-${viewport.width}.png`,fullPage:true});
  }
  console.log('Browser boot and mobile layout checks passed. Multiplayer is not implemented.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
