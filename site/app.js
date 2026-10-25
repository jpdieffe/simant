import {DosGame} from './dos.js';
import {Colony} from './colony.js';
import {SimAntMemory} from './dos-memory.js';
import {Room} from './room.js';
import {parseRoomCode} from './protocol.js';
const $=selector=>document.querySelector(selector),canvas=$('#game'),local=$('#local-view'),video=$('#remote-video');
const guestCanvas=document.createElement('canvas');guestCanvas.width=352;guestCanvas.height=320;
const game=new DosGame(canvas,status);let room,colony,mode='lobby',busy=false,startingCoop=false,menu=false,stream,lastCode,remoteView,remotePlayer,wakeLock,readyTimer;
let right=false,activePointer=null,activeButton=0,cameraReady=false;const held=new Set(),directions=new Map();
function status(message){$('#status').textContent=message;$('#lobby-status').textContent=message;}
function failure(error){status(error?.message||String(error));if(mode==='guest'){$('#retry').hidden=false;$('#overlay').hidden=false;$('#overlay').textContent=error?.message||String(error);}}
function settings(){return {turn:$('#turn').value.trim(),username:$('#turn-user').value,credential:$('#turn-password').value,host:$('#peer-host').value.trim(),path:$('#peer-path').value.trim()||'/'};}
async function wake(){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}}
function showPlayer(){document.body.classList.add('playing');$('#intro').hidden=true;$('#player').hidden=false;wake();}
function coopUI(active){document.body.classList.toggle('coop',active);canvas.hidden=active||mode==='guest';local.hidden=!active||mode==='guest';video.hidden=mode!=='guest';$('#original-controls').hidden=active||mode==='guest';$('#coop-controls').hidden=!active;$('#game-menu').hidden=mode==='guest';$('#ant-name').textContent=mode==='guest'?'Ant two':'Ant one';$('#hint').textContent=active?'Tap the ground to move, or use the arrows / WASD. Your friend has their own ant and view.':'Follow ant keeps the original camera with your ant as it walks. Turn it off to look around. Hold on your ant for its original menu.';}
function placeholder(message){const c=guestCanvas.getContext('2d');c.fillStyle='#17251c';c.fillRect(0,0,352,320);c.fillStyle='#d8e6bb';c.font='16px system-ui';c.textAlign='center';c.fillText(message,176,150);}
function sendStream(){if(!room?.accepted||!game.ci)return;stream?.getVideoTracks().forEach(t=>t.stop());stream=guestCanvas.captureStream(12);for(const track of game.audioStream.stream.getAudioTracks())stream.addTrack(track);room.stream(stream);}
function updateHUD(player,view){if(!player)return;$('#health').textContent=`Health ${player.health}`;$('#location').textContent=view?.layer===1?'On the surface':view?.layer===2?'Black nest':'Red nest';}
function handleAction(index,data){if(!colony)return;if(data.action==='stop')colony.stop(index);else if(data.action==='move')colony.order(index,data.x,data.y,data.layer);}
function createRoom(){const instance=new Room({
  status:message=>{status(message);if(mode==='guest'&&!video.videoWidth){$('#overlay').hidden=false;$('#overlay').textContent=message;}},error:failure,
  connected:()=>{if(room!==instance)return;$('#retry').hidden=true;if(mode==='host'){status('Friend connected. Choose a game in SimAnt to begin.');placeholder('Waiting for the host’s colony…');sendStream();if(colony)colony.connected=true;else activateWhenReady();}else{status('Connected. Waiting for your own ant’s view…');$('#overlay').textContent='Waiting for the host’s colony…';}},
  input:mask=>colony?.setInput(1,mask),action:data=>handleAction(1,data),
  view:data=>{remoteView=data.view;remotePlayer=data.player;updateHUD(data.player,data.view);$('#overlay').hidden=true;status('Connected. Your ant has its own view.');},
  stream:async media=>{if(video.srcObject!==media){video.srcObject=media;video.muted=true;$('#sound').textContent='Enable sound';}try{await video.play();}catch(error){if(error.name!=='AbortError')failure('Tap Enable sound to start the game video.');}},
  disconnected:()=>{if(mode==='host'){if(colony){colony.connected=false;colony.stop(1);}status('Your friend left. They can rejoin with the same code.');}else failure('The host disconnected. Tap Retry when their game is ready.');},
  mediaClosed:()=>{if(mode==='guest')failure('The game stream stopped. Tap Retry to reconnect.');}
},settings());return instance;}
async function hostRoom(){mode='host';placeholder('Waiting for the host’s colony…');room=createRoom();const code=await room.open(true);$('#code').textContent=code;$('#room-label').hidden=false;$('#invite').hidden=false;$('#open-room').hidden=true;status(`Room ${code} is open. Choose a game, then your friend can join.`);}
async function start(wanted='solo',savedFiles){if(busy)return;busy=true;mode=wanted;showPlayer();coopUI(false);try{cameraReady=false;await game.start(savedFiles);canvas.focus();if(wanted==='host'&&!room)await hostRoom();else if(wanted==='host'&&room?.accepted){menu=false;sendStream();activateWhenReady();}}catch(error){failure(error);$('#intro').hidden=false;}finally{busy=false;}}
// Enable SimAnt's own AutoTrack for solo play and hosts awaiting a friend.
// Afterwards reflect the native option, so changes in the DOS menu still work.
function updateCameraControl(){
  if(!game.ci||mode==='guest')return;
  try{
    const mem=game.memoryBridge??=new SimAntMemory(game.ci),ant=mem.ant();
    if(ant.layer<1||ant.layer>3)return;
    if(!cameraReady){mem.autoTrack(true);cameraReady=true;}
    const enabled=mem.autoTrack(),button=$('#follow-ant');
    button.disabled=false;button.textContent=`Follow ant: ${enabled?'on':'off'}`;button.setAttribute('aria-pressed',String(enabled));
  }catch{$('#follow-ant').disabled=true;}
}
setInterval(updateCameraControl,500);
$('#follow-ant').onclick=()=>{try{const mem=game.memoryBridge;mem.autoTrack(!mem.autoTrack());updateCameraControl();canvas.focus();}catch(error){failure(error);}};
function activateWhenReady(){clearInterval(readyTimer);const check=async()=>{
  if(startingCoop||colony||menu||!room?.accepted||!game.ci)return;
  try{const mem=game.memoryBridge??=new SimAntMemory(game.ci),ant=mem.ant();if(ant.layer<1||ant.layer>3||mem.word(mem.globals+0xf78)<=0)return;
    if(![16,32].includes(ant.body&0xf0)){const message='Host: establish your nest and select a worker or soldier in the original game. Co-op starts then.';status(message);room.broadcast(message);return;}
    clearInterval(readyTimer);startingCoop=true;colony=new Colony(game);await colony.start();colony.connected=true;
    colony.mem.onWait=waiting=>{coopUI(!waiting);if(waiting){status('The original game needs the host’s attention. Use the game screen to continue.');room.broadcast('The host is responding to the original game.');canvas.focus();}};
    coopUI(true);status('Two ants, one colony. Tap the ground to move.');$('#overlay').hidden=true;let lastReport=0;
    colony.run([local,guestCanvas],()=>{updateHUD(colony.info(0),colony.views[0]);if(room?.accepted&&colony.players[1]&&colony.views[1]&&performance.now()-lastReport>150){room.send({type:'view',view:colony.views[1],player:colony.info(1)});lastReport=performance.now();}},error=>{recoverColony(error);});
  }catch(error){await recoverColony(error);}finally{startingCoop=false;}
};readyTimer=setInterval(check,500);check();}
async function recoverColony(error){
  const failed=colony;menu=true;clearInterval(readyTimer);
  try{await failed?.close();}catch{failed?.mem.release();}finally{if(colony===failed)colony=null;}
  coopUI(false);$('#resume-coop').hidden=false;canvas.focus();
  failure(`${error?.message||error} Use Game controls and Resume co-op to retry, or reload if the original game is unresponsive.`);
  room?.broadcast('Co-op paused. The host is recovering the original game.');
}
async function join(code){if(busy)return;busy=true;mode='guest';lastCode=code;showPlayer();coopUI(true);$('#sound').textContent='Enable sound';$('#overlay').hidden=false;$('#overlay').textContent='Connecting to your friend…';try{room=createRoom();await room.open(false,code);$('#code').textContent=code;$('#room-label').hidden=false;}catch(error){failure(error);}finally{busy=false;}}
$('#start').onclick=()=>start();$('#host-button').onclick=()=>start('host');$('#open-room').onclick=()=>hostRoom().catch(failure);
$('#join-form').onsubmit=e=>{e.preventDefault();const code=parseRoomCode($('#room-code').value);if(!code){status('Enter the two-character room code.');return;}join(code);};
$('#retry').onclick=()=>{if(busy||!lastCode)return;clearControls();const previous=room;room=null;previous?.close();video.pause();video.srcObject=null;remoteView=null;join(lastCode);};
$('#invite').onclick=async()=>{const url=new URL(location.href);url.search='';url.hash=`room=${room.code}`;try{await navigator.clipboard.writeText(url.href);status(`Invite link copied. Room ${room.code}.`);}catch{status(`Invite: ${url.href}`);}};
$('#leave').onclick=()=>{clearControls();room?.close();location.href=location.pathname;};
$('#game-menu').onclick=async()=>{if(!colony||menu)return;menu=true;clearControls();room.broadcast('The host is using the original game controls.');try{await colony.close();colony=null;coopUI(false);$('#resume-coop').hidden=false;status('Original game controls. Resume co-op brings your friend back beside you.');canvas.focus();}catch(error){failure(error);}};
$('#resume-coop').onclick=()=>{menu=false;$('#resume-coop').hidden=true;activateWhenReady();};
function action(action,values={}){if(mode==='guest')room?.action(action,values);else handleAction(0,{action,...values});}
$('#stop-ant').onclick=()=>action('stop');$('#outside').onclick=()=>{const p=mode==='guest'?remotePlayer:colony?.info(0);if(p&&p.layer!==1)action('move',{x:32,y:0,layer:p.layer});};$('#home').onclick=()=>action('move',{x:32,y:6,layer:2});
function tapMove(e){const view=mode==='guest'?remoteView:colony?.views[0];if(!view)return;const r=e.currentTarget.getBoundingClientRect(),width=mode==='guest'?video.videoWidth:local.width,height=mode==='guest'?video.videoHeight:local.height;if(!width||!height)return;const scale=Math.min(r.width/width,r.height/height),left=r.left+(r.width-width*scale)/2,top=r.top+(r.height-height*scale)/2,px=(e.clientX-left)/scale,py=(e.clientY-top)/scale;if(px<0||py<0||px>=width||py>=height)return;action('move',{x:view.x+Math.floor(px/(width/view.columns)),y:view.y+Math.floor(py/16),layer:view.layer});}
for(const target of [local,video])target.addEventListener('pointerdown',e=>{e.preventDefault();target.focus?.();tapMove(e);});
function sendDirections(){let mask=0;for(const value of directions.values())mask|=value;if(mode==='guest')room?.setInput(mask);else colony?.setInput(0,mask);}
for(const button of document.querySelectorAll('[data-direction]')){button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);directions.set(`p${e.pointerId}`,Number(button.dataset.direction));sendDirections();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{directions.delete(`p${e.pointerId}`);sendDirections();});}
const arrowKeys={ArrowUp:1,KeyW:1,ArrowDown:2,KeyS:2,ArrowLeft:4,KeyA:4,ArrowRight:8,KeyD:8};
const keys={Escape:256,Enter:257,Tab:258,Backspace:259,Insert:260,Delete:261,ArrowRight:262,ArrowLeft:263,ArrowDown:264,ArrowUp:265,PageUp:266,PageDown:267,Home:268,End:269,F1:290,F2:291,F3:292,F4:293,F5:294,F6:295,F7:296,F8:297,F9:298,F10:299,F11:300,F12:301,ShiftLeft:340,ControlLeft:341,AltLeft:342,ShiftRight:344,ControlRight:345,AltRight:346,Space:32};
function keyCode(e){return keys[e.code]??(/^Key[A-Z]$/.test(e.code)?e.code.charCodeAt(3):/^Digit[0-9]$/.test(e.code)?e.code.charCodeAt(5):undefined);}
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.metaKey)return;if(document.body.classList.contains('coop')){if(arrowKeys[e.code]){e.preventDefault();directions.set(e.code,arrowKeys[e.code]);sendDirections();}else if(e.code==='Space'){e.preventDefault();action('stop');}return;}if(!game.ci||e.target!==canvas)return;const code=keyCode(e);if(code!==undefined){e.preventDefault();held.add(code);game.ci.sendKeyEvent(code,true);}});
document.addEventListener('keyup',e=>{if(directions.delete(e.code)){e.preventDefault();sendDirections();}const code=keyCode(e);if(held.delete(code)){e.preventDefault();game.ci?.sendKeyEvent(code,false);}});
function clearControls(){directions.clear();sendDirections();for(const code of held)game.ci?.sendKeyEvent(code,false);held.clear();if(activePointer!==null){game.ci?.sendMouseButton(activeButton,false);activePointer=null;}}
window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{if(document.hidden){clearControls();if(mode==='host')room?.broadcast('Keep the host’s game visible to continue.');}else wake();});
function move(e){const r=canvas.getBoundingClientRect();game.ci?.sendMouseMotion(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)));}
canvas.addEventListener('pointerdown',e=>{if(activePointer!==null||!game.ci)return;e.preventDefault();canvas.focus();activePointer=e.pointerId;activeButton=right||e.button===2?1:0;canvas.setPointerCapture(e.pointerId);move(e);game.ci.sendMouseButton(activeButton,true);game.audio?.resume();});canvas.addEventListener('pointermove',e=>{if(activePointer===null||e.pointerId===activePointer)move(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(activePointer===e.pointerId)clearControls();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
for(const button of document.querySelectorAll('[data-key]'))button.onclick=()=>game.ci?.simulateKeyPress(Number(button.dataset.key));
$('#right-click').onclick=()=>{right=!right;$('#right-click').textContent=`Right click: ${right?'on':'off'}`;$('#right-click').setAttribute('aria-pressed',right);};
$('#sound').onclick=async()=>{if(mode==='guest'){video.muted=!video.muted;try{await video.play();}catch(error){failure(error);}$('#sound').textContent=video.muted?'Enable sound':'Sound on';}else{game.muted=!game.muted;if(!game.muted)await game.audio?.resume();$('#sound').textContent=game.muted?'Sound off':'Sound on';}};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#player').requestFullscreen();await screen.orientation?.lock?.('landscape');}catch{status('Turn your phone sideways for landscape play.');}};
$('#save').onclick=async()=>{try{if(!game.ci)return;const data=await game.ci.persist(true);if(!data)throw new Error('Save inside SimAnt first.');const url=URL.createObjectURL(new Blob([data],{type:'application/zip'}));const a=document.createElement('a');a.href=url;a.download='simant-save-files.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Save files downloaded. Save inside SimAnt first to preserve your colony.');}catch(error){failure(error);}};
$('#load').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024){failure('Save file is too large.');return;}try{clearControls();if(colony){await colony.close();colony=null;}await game.close();game.memoryBridge=null;await start(mode,new Uint8Array(await file.arrayBuffer()));}catch(error){failure(error);}e.target.value='';};
const invite=parseRoomCode(new URLSearchParams(location.hash.slice(1)).get('room')||'');if(invite)$('#room-code').value=invite;
if(new URLSearchParams(location.search).has('debug'))window.__simant={game,get colony(){return colony;},get room(){return room;},guestCanvas,local,action};
