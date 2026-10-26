import {SimAntMemory} from './dos-memory.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const PANEL_IDS={main:0,map:0x100,behavior:0x1200,caste:0x1300};

// Display the original DOS windows in separate browser panels. The original
// main loop, window painters, mouse handlers, and simulation remain in control.
export class Desktop {
  constructor(game,canvases,events={}){
    this.game=game;this.mem=game.memoryBridge??=new SimAntMemory(game.ci);
    this.canvases=canvases;this.events=events;this.rects={};this.current=null;
    this.running=false;this.pointer=null;this.keys=[];this.fallback=false;
    this.frame=()=>{if(this.running&&this.current&&this.pointer?.started)this.copy(this.current);};
  }
  async rectangle(name){
    const id=PANEL_IDS[name],m=this.mem;
    await m.call(0x23ae,0x377,[],id); // Lock, including windows stored in EMS.
    try{
      const p=await m.call(0x2505,6,[id]);
      // Copy through DOS so EMS page-frame pointers are resolved by the CPU.
      await m.call(0x29f4,0x281a,[0x28,m.gate/16,p.ax,p.dx,8]);
      const [left,top,right,bottom]=Array.from({length:4},(_,i)=>m.word(m.gate+0x28+i*2));
      if(right<=left||bottom<=top||left>640||top>480||right>660||bottom>500)throw new Error('The original game windows are not ready.');
      return {left,top,right,bottom};
    }finally{await m.call(0x23ae,0x1db,[],id);}
  }
  async focus(name){
    if(this.current===name&&this.mem.word(this.mem.ds+0x5702)===PANEL_IDS[name])return;
    await this.mem.call(0x20e8,0x4b6,[PANEL_IDS[name]]);
    this.current=name;
  }
  copy(name){
    const r=this.rects[name],canvas=this.canvases[name];if(!r)return;
    const width=r.right-r.left,height=r.bottom-r.top;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    canvas.getContext('2d').drawImage(this.game.canvas,r.left,r.top,width,height,0,0,width,height);
  }
  async capture(name){
    const changed=this.current!==name||this.mem.word(this.mem.ds+0x5702)!==PANEL_IDS[name];
    await this.focus(name);
    // Activation paints window chrome first. Let the game's normal main loop
    // paint its map, numbers, and controls before capturing the new front window.
    if(changed)await this.mem.step();
    const frame=this.game.frameNumber;
    const start=performance.now();while(this.game.frameNumber===frame&&performance.now()-start<40)await sleep(5);
    this.copy(name);
  }
  async drag(from,to){
    const ci=this.game.ci;
    ci.sendMouseMotion(from[0]/640,from[1]/480);await this.mem.step();
    ci.sendMouseButton(0,true);
    const progress=(async()=>{for(let i=0;i<5;i++)await this.mem.step();})();
    await sleep(150);ci.sendMouseMotion(to[0]/640,to[1]/480);
    await sleep(150);ci.sendMouseButton(0,false);await progress;
  }
  async start(){
    await this.mem.installGate();await this.focus('main');
    let main=await this.rectangle('main');
    if(main.right-main.left<600){
      await this.drag([main.left+130,main.top+10],[130,main.top+10]);
      main=await this.rectangle('main');
      await this.drag([main.right-11,main.bottom-10],[635,475]);
    }
    for(const name of Object.keys(PANEL_IDS)){
      const r=await this.rectangle(name);
      // Browser headings replace native title bars; omit frame/depth gadgets.
      this.rects[name]={left:Math.max(0,r.left+2),top:r.top+18,right:Math.min(640,r.right-2),bottom:Math.min(480,r.bottom-2)};
      await this.capture(name);
    }
    await this.capture('main');
    this.mem.onWait=waiting=>{
      if(waiting&&this.pointer)return;
      this.fallback=waiting;this.events.fallback?.(waiting);
    };
    this.game.frameListeners.add(this.frame);this.running=true;
  }
  position(name,event){
    const canvas=this.canvases[name],bounds=canvas.getBoundingClientRect(),r=this.rects[name];if(!r)return null;
    const scale=Math.min(bounds.width/canvas.width,bounds.height/canvas.height);
    const x=(event.clientX-bounds.left-(bounds.width-canvas.width*scale)/2)/scale;
    const y=(event.clientY-bounds.top-(bounds.height-canvas.height*scale)/2)/scale;
    if(!Number.isFinite(x)||x<0||y<0||x>=canvas.width||y>=canvas.height)return null;
    return {x:r.left+x,y:r.top+y};
  }
  down(name,event,button=0){
    if(this.pointer)return;const point=this.position(name,event);if(!point)return;
    this.pointer={name,...point,button,started:false,ended:false};
  }
  move(name,event){
    const p=this.pointer,point=this.position(name,event);if(!p||p.name!==name||!point)return;
    Object.assign(p,point);if(p.started)this.game.ci.sendMouseMotion(p.x/640,p.y/480);
  }
  up(){
    const p=this.pointer;if(!p)return;p.ended=true;
    if(p.started)this.releasePointer(p);
  }
  releasePointer(p){
    if(p.releasing)return;p.releasing=true;
    setTimeout(()=>{this.game.ci.sendMouseButton(p.button,false);if(this.pointer===p)this.pointer=null;},Math.max(0,100-(performance.now()-p.at)));
  }
  key(code,down){
    if(this.waitingStep)this.game.ci.sendKeyEvent(code,down);
    else this.keys.push({code,down});
  }
  press(code){if(this.waitingStep)this.game.ci.simulateKeyPress(code);else this.keys.push({code,press:true});}
  async run(){
    this.loop=(async()=>{
      let lastPanels=0;
      try{
        while(this.running){
          const p=this.pointer;
          if(p&&!p.started){
            await this.focus(p.name);this.game.ci.sendMouseMotion(p.x/640,p.y/480);
            this.game.ci.sendMouseButton(p.button,true);p.started=true;p.at=performance.now();
            if(p.ended)this.releasePointer(p);
          }
          if(this.keys.length){await this.focus('main');for(const key of this.keys.splice(0)){if(key.press)this.game.ci.simulateKeyPress(key.code);else this.game.ci.sendKeyEvent(key.code,key.down);}}
          this.waitingStep=true;try{await this.mem.step();}finally{this.waitingStep=false;}
          if(!this.running)break;
          if(this.pointer){this.copy(this.current);continue;}
          if(performance.now()-lastPanels>750){
            for(const name of ['map','behavior','caste']){if(this.pointer||!this.running)break;await this.capture(name);}
            lastPanels=performance.now();
          }
          if(!this.pointer)await this.capture('main');
        }
      }catch(error){this.running=false;this.events.error?.(error);}
    })();return this.loop;
  }
  async close(){
    this.running=false;this.up();await this.loop;
    this.game.frameListeners.delete(this.frame);this.mem.onWait=null;
    if(this.mem.gate){try{await this.focus('main');}finally{this.mem.release();}}
  }
}
