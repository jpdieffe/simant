import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4183),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4183/?debug&memory');await page.locator('#start').click();
  await page.waitForFunction(()=>window.__simant?.game.ci,{},{timeout:60000});await page.waitForTimeout(5000);
  const r=await page.locator('#game').boundingBox();
  for(const[x,y]of [[320,240],[320,280],[360,160]]){await page.mouse.click(r.x+x,r.y+y,{delay:120});await page.waitForTimeout(700);}
  await page.waitForTimeout(1000);
  const initial=await page.evaluate(async()=>{
    const {Colony}=await import('./colony.js');const c=window.testColony=new Colony(window.__simant.game);
    await c.start();await c.addPlayer();return [c.info(0),c.info(1)];
  });
  console.log('Two native ants',initial);
  assert.equal(initial[0].layer,2);assert.equal(initial[1].layer,2);
  assert.notDeepEqual([initial[0].x,initial[0].y],[initial[1].x,initial[1].y]);
  const result=await page.evaluate(async()=>{
    const c=window.testColony,b=c.mem.globals,before=c.mem.word(b+0xf08);
    c.order(0,32,0,2);c.order(1,34,9,2);
    const trail=[];
    for(let i=0;i<35;i++){await c.tick();if(i%5===0)trail.push([c.info(0),c.info(1)]);}
    const after=c.mem.word(b+0xf08),outputs=[document.createElement('canvas'),document.createElement('canvas')];
    for(const canvas of outputs){canvas.style.width='480px';canvas.style.height='auto';document.querySelector('main').append(canvas);}
    await c.render(0,outputs[0]);await c.render(1,outputs[1]);
    document.querySelector('#player').hidden=true;document.querySelector('main').style.display='flex';document.querySelector('main').style.gap='8px';
    const pixels=outputs.map(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data).reduce((a,v,i)=>(a+v*(i%17+1))%1000000007,0));
    return {before,after,players:[c.info(0),c.info(1)],views:c.views,pixels,trail};
  });
  console.log('Result',JSON.stringify(result));
  assert.equal((result.after-result.before+4097)%4097,35,'Colony advances once per tick');
  assert.equal(result.players[0].layer,1,'Player one exits the original nest');
  assert.equal(result.players[1].layer,2,'Player two independently remains underground');
  assert.notDeepEqual([result.players[1].x,result.players[1].y],[initial[1].x,initial[1].y],'Player two followed its own movement order');
  assert.notEqual(result.pixels[0],result.pixels[1],'Views contain different original game pixels');
  await page.screenshot({path:'test-results/two-native-ants.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Native two-ant movement, shared simulation, and independent view checks passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
