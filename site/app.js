import { DosGame } from './dos.js';
const $=selector=>document.querySelector(selector);
const canvas=$('#game');
const game=new DosGame(canvas,message=>$('#status').textContent=message);
let right=false;let activePointer=null;let activeButton=0;const held=new Set();
async function start(savedFiles){
  $('#start').disabled=true;$('#intro').hidden=true;$('#player').hidden=false;document.body.classList.add('playing');
  try{await game.start(savedFiles);canvas.focus();}catch(e){$('#status').textContent=`Could not start: ${e.message}`;$('#intro').hidden=false;$('#start').disabled=false;}
}
$('#start').onclick=()=>start();
const keys={Escape:256,Enter:257,Tab:258,Backspace:259,Insert:260,Delete:261,ArrowRight:262,ArrowLeft:263,ArrowDown:264,ArrowUp:265,PageUp:266,PageDown:267,Home:268,End:269,F1:290,F2:291,F3:292,F4:293,F5:294,F6:295,F7:296,F8:297,F9:298,F10:299,F11:300,F12:301,ShiftLeft:340,ControlLeft:341,AltLeft:342,ShiftRight:344,ControlRight:345,AltRight:346,Space:32};
function keyCode(e){return keys[e.code]??(/^Key[A-Z]$/.test(e.code)?e.code.charCodeAt(3):/^Digit[0-9]$/.test(e.code)?e.code.charCodeAt(5):undefined);}
document.addEventListener('keydown',e=>{if(!game.ci||e.target!==canvas||e.metaKey)return;const code=keyCode(e);if(code!==undefined){e.preventDefault();held.add(code);game.ci.sendKeyEvent(code,true);}});
document.addEventListener('keyup',e=>{const code=keyCode(e);if(held.delete(code)){e.preventDefault();game.ci?.sendKeyEvent(code,false);}});
function release(){for(const code of held)game.ci?.sendKeyEvent(code,false);held.clear();if(activePointer!==null){game.ci?.sendMouseButton(activeButton,false);activePointer=null;}}
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
function move(e){const r=canvas.getBoundingClientRect();game.ci?.sendMouseMotion(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)));}
canvas.addEventListener('pointerdown',e=>{if(activePointer!==null||!game.ci)return;e.preventDefault();canvas.focus();activePointer=e.pointerId;activeButton=right||e.button===2?1:0;canvas.setPointerCapture(e.pointerId);move(e);game.ci.sendMouseButton(activeButton,true);game.audio?.resume();});
canvas.addEventListener('pointermove',e=>{if(activePointer===null||e.pointerId===activePointer)move(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(activePointer===e.pointerId)release();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
for(const button of document.querySelectorAll('[data-key]'))button.onclick=()=>game.ci?.simulateKeyPress(Number(button.dataset.key));
$('#right-click').onclick=()=>{right=!right;$('#right-click').textContent=`Right click: ${right?'on':'off'}`;$('#right-click').setAttribute('aria-pressed',right);};
$('#sound').onclick=async()=>{game.muted=!game.muted;if(!game.muted)await game.audio?.resume();$('#sound').textContent=game.muted?'Sound off':'Sound on';};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#player').requestFullscreen();await screen.orientation?.lock?.('landscape');}catch{$('#status').textContent='Turn your phone sideways for landscape play.';}};
$('#save').onclick=async()=>{try{if(!game.ci)return;const data=await game.ci.persist(true);if(!data)throw new Error('Save inside SimAnt first.');const url=URL.createObjectURL(new Blob([data],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download='simant-save-files.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#status').textContent='Save files downloaded. These contain in-game saves, not a running snapshot.';}catch(e){$('#status').textContent=e.message;}};
$('#load').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024){$('#status').textContent='Save file is too large.';return;}try{release();await game.close();await start(new Uint8Array(await file.arrayBuffer()));}catch(err){$('#status').textContent=err.message;}e.target.value='';};
if(new URLSearchParams(location.search).has('debug'))window.__simant={game};
