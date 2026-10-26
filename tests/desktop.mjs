import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4186),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4186/?debug');await page.locator('#start').click();
  await page.waitForFunction(()=>window.__simant?.game.ci,{},{timeout:60000});await page.waitForTimeout(5000);
  const r=await page.locator('#game').boundingBox();
  for(const[x,y]of[[320,240],[320,280],[360,160]]){await page.mouse.click(r.x+x*r.width/640,r.y+y*r.height/480,{delay:120});await page.waitForTimeout(700);}
  try{await page.waitForFunction(()=>document.body.classList.contains('dashboard')&&window.__simant.desktop?.running,{},{timeout:30000});}
  catch(error){console.log('Dashboard failure',await page.locator('#status').textContent());await page.screenshot({path:'test-results/dashboard-failure.png',fullPage:true});throw error;}
  console.log('Native panels',await page.evaluate(()=>window.__simant.desktop.rects));
  await page.screenshot({path:'test-results/dashboard-initial.png',fullPage:true});
  assert(await page.evaluate(()=>document.querySelector('#dash-main').getBoundingClientRect().width>document.querySelector('#dash-map').getBoundingClientRect().width*2),'Main view receives most of the available width');
  assert(await page.evaluate(()=>window.__simant.desktop.canvases.main.width>=600),'Original main window is enlarged before display');
  async function panelPoint(name,x,y){
    const point=await page.evaluate(({name,x,y})=>{const d=window.__simant.desktop,canvas=d.canvases[name],r=canvas.getBoundingClientRect(),native=d.rects[name];const scale=Math.min(r.width/canvas.width,r.height/canvas.height);return{x:r.left+(r.width-canvas.width*scale)/2+(x-native.left)*scale,y:r.top+(r.height-canvas.height*scale)/2+(y-native.top)*scale};},{name,x,y});
    return point;
  }
  async function panelClick(name,x,y){const p=await panelPoint(name,x,y);await page.mouse.click(p.x,p.y,{delay:120});}
  async function dragTriangle(name,from,to){
    const a=await panelPoint(name,...from),b=await panelPoint(name,...to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();
    await page.waitForFunction(()=>window.__simant.desktop.pointer?.started);
    await page.mouse.move(b.x,b.y,{steps:10});await page.waitForTimeout(200);await page.mouse.up();
    await page.waitForTimeout(1500);
  }
  const panelPixels=name=>page.evaluate(name=>{const canvas=window.__simant.desktop.canvases[name];return canvas.toDataURL();},name);
  // Change both actual native triangles, checking their displayed percentages.
  await panelClick('behavior',108,327);await page.waitForTimeout(1200);
  const behaviorBefore=await panelPixels('behavior');
  await dragTriangle('behavior',[191,380],[177,409]);
  assert.notEqual(await panelPixels('behavior'),behaviorBefore,'Native Behavior triangle responds to dragging');
  await panelClick('caste',364,328);await page.waitForTimeout(1200);
  const casteBefore=await panelPixels('caste');
  await dragTriangle('caste',[437,439],[445,399]);
  assert.notEqual(await panelPixels('caste'),casteBefore,'Native Caste triangle responds to dragging');
  await page.screenshot({path:'test-results/dashboard-triangles.png',fullPage:true});
  // Walk using clicks on the enlarged, remapped main panel.
  const state=()=>page.evaluate(()=>{const m=window.__simant.game.memoryBridge,b=m.globals;return {...m.ant(),view:{x:m.word(b+0x508),y:m.word(b+0x50a),left:m.word(b+0x110c),top:m.word(b+0x110e)}};});
  async function clickTile(x,y){const {view}=await state();await panelClick('main',view.left+(x-view.x)*16+8,view.top+(y-view.y)*16+8);}
  await clickTile(32,0);
  await page.waitForFunction(()=>window.__simant.game.memoryBridge.ant().layer===1,{},{timeout:25000});
  await page.waitForFunction(()=>{const m=window.__simant.game.memoryBridge;return !m.word(m.globals+0xaa0);});
  const before=await state(),target=before.view.x+2;
  await clickTile(target,before.y);
  await page.waitForFunction(x=>window.__simant.game.memoryBridge.ant().x<=x,target,{timeout:25000});
  const after=await state();assert(after.view.x<before.view.x,'AutoTrack follows movement through the enlarged main panel');
  console.log('Dashboard movement',before.x,after.x,'camera',before.view.x,after.view.x);
  // Use the actual original map's Surface button through the remapped canvas.
  await panelClick('map',128,355);await page.waitForTimeout(1200);
  console.log('After map click',await page.evaluate(()=>{const m=window.__simant.game.memoryBridge;return{view:m.word(m.globals+0x32e),current:window.__simant.desktop.current};}));
  assert.equal(await page.evaluate(()=>{const m=window.__simant.game.memoryBridge;return m.word(m.globals+0x32e);}),1,'Map controls change the original game view');
  for(const viewport of[{width:1440,height:900},{width:844,height:390},{width:393,height:852}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(1000);
    const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,panels:[...document.querySelectorAll('#dashboard canvas')].map(c=>{const r=c.getBoundingClientRect();return{id:c.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};})}));
    assert(!layout.overflow);for(const p of layout.panels){assert(p.width>0&&p.height>0);assert(p.x>=0&&p.y>=0&&p.right<=layout.width+1&&p.bottom<=layout.height+1,`${p.id} fits without scrolling`);}
    await page.screenshot({path:`test-results/dashboard-${viewport.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});await page.locator('#workspace-toggle').click();await page.waitForFunction(()=>!window.__simant.desktop&&!document.body.classList.contains('dashboard'));
  await page.locator('#workspace-toggle').click();try{await page.waitForFunction(()=>window.__simant.desktop?.running&&document.body.classList.contains('dashboard'),{},{timeout:20000});}catch(error){console.log('Reopen failed',await page.locator('#status').textContent(),await page.evaluate(()=>({desktop:!!window.__simant.desktop,running:window.__simant.desktop?.running,gate:window.__simant.game.memoryBridge.gate,ready:window.__simant.game.memoryBridge.ram[window.__simant.game.memoryBridge.gate+0x22]})));await page.screenshot({path:'test-results/dashboard-reopen-failure.png',fullPage:true});throw error;}
  // Function-key menus need the full original desktop, outside panel captures.
  await page.locator('#dash-main').focus();await page.keyboard.press('F1',{delay:150});
  await page.waitForFunction(()=>!window.__simant.desktop&&!document.body.classList.contains('dashboard'));
  await page.waitForTimeout(1000);await page.screenshot({path:'test-results/dashboard-menu.png',fullPage:true});
  await page.locator('[data-key="256"]').click();
  await page.locator('#workspace-toggle').click();
  await page.waitForFunction(()=>document.body.classList.contains('dashboard')&&window.__simant.desktop?.running,{},{timeout:20000});
  assert.deepEqual(errors,[]);console.log('Dashboard fits all four original panels; original desktop and dashboard switching passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
