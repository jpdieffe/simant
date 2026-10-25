import {SimAntMemory} from './dos-memory.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Human state and orders, separate from the original colony's arrays/counters.
export const ANT_FIELDS=[0x47c,0x48a,0x48c,0x496,0x4c2,0x4c4,0x4e2,0x7c0,0x84e,0x8da,0x8e2,0x9f0,0xa06,0xa8e,0xaa0,0xab6,0xac6,0xad6,0xae8,0xaf8,0xc22,0xc3e,0xf42,0xf78,0xf7e,0xfb8,0xfba,0xffc,0x1006,0x1044,0x1058];

export class Colony {
  constructor(game){this.game=game;this.mem=game.memoryBridge??=new SimAntMemory(game.ci);this.players=[];this.views=[];this.running=false;this.active=0;this.pending=[null,null];this.masks=[0,0];this.connected=false;}
  capture(){const b=this.mem.globals;return Object.fromEntries(ANT_FIELDS.map(o=>[o,this.mem.word(b+o)]));}
  restore(state){const b=this.mem.globals;for(const o of ANT_FIELDS)this.mem.word(b+o,state[o]);}
  info(index){const s=this.players[index];return s&&{x:s[0x47c],y:s[0x48a],layer:s[0x48c],body:s[0x4c2],health:s[0xf78],targetX:s[0xad6],targetY:s[0xae8],moving:s[0xaa0]};}
  async place(s){return this.mem.call(0x10f7,0xa44,[s[0x48c],s[0x47c],s[0x48a],s[0x4c2],s[0x496],255]);}
  async remove(s){return this.mem.call(0x10f7,0x9a8,[s[0x48c],s[0x47c],s[0x48a],s[0x4c2],s[0x496]]);}
  async start(){
    const body=this.mem.ant().body&0xf0;
    if(body!==16&&body!==32)throw new Error('Use the original controls to establish your nest and select a worker or soldier before starting co-op.');
    await this.mem.installGate();this.players[0]=this.capture();
    if(this.players[0][0x48c]<1||this.players[0][0x48c]>3)throw new Error('Start a colony in SimAnt before opening multiplayer.');
    this.mem.word(this.mem.globals+0x47e,0);
    return this.info(0);
  }
  async addPlayer(){
    if(this.players[1])return this.info(1);
    const host=this.players[0],guest={...host};
    // Find a passable, unoccupied neighboring cell using the original map lookup.
    let position;
    for(let radius=1;radius<=6&&!position;radius++)for(let dx=-radius;dx<=radius&&!position;dx++)for(let dy=-radius;dy<=radius;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
      const x=host[0x47c]+dx,y=host[0x48a]+dy;
      if(x<0||x>=(host[0x48c]===1?128:64)||y<0||y>63)continue;
      const result=await this.mem.call(0x10f7,0x7c7,[host[0x48c],x,y]);
      if(result.ax===65535){
        const terrain=await this.mem.call(0x10f7,0x850,[host[0x48c],x,y]);
        if(terrain.ax<4){position={x,y};break;}
      }
    }
    if(!position)throw new Error('There is no clear ground beside your ant. Move into an open area and retry.');
    guest[0x47c]=position.x;guest[0x48a]=position.y;guest[0x4c2]=16;guest[0x496]=0;
    for(const o of [0x4c4,0x4e2,0xaa0,0xa06,0xa8e,0x1006,0x1044,0x1058])guest[o]=0;
    guest[0xf78]=100;guest[0xad6]=position.x;guest[0xae8]=position.y;guest[0xaf8]=guest[0x48c];
    this.players[1]=guest;await this.place(guest);this.restore(host);return this.info(1);
  }
  order(index,x,y,layer){
    if(!this.players[index]||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(layer)||x<0||x>127||y<0||y>63||layer<1||layer>3)return false;
    this.pending[index]={x,y,layer};return true;
  }
  applyOrder(index){const order=this.pending[index];if(!order)return;this.pending[index]=null;const b=this.mem.globals;
    if(order.stop){this.mem.word(b+0xaa0,0);return;}
    for(const[o,v]of[[0xaa0,1],[0xa8e,0],[0xad6,order.x],[0xae8,order.y],[0xaf8,order.layer],[0x8e2,order.x],[0x9f0,order.y]])this.mem.word(b+o,v);
  }
  async advancePlayer(index){this.restore(this.players[index]);this.applyOrder(index);await this.mem.call(0x2cff,0x279a);this.players[index]=this.capture();}
  setInput(index,mask){this.masks[index]=mask&15;}
  stop(index){this.masks[index]=0;this.pending[index]={stop:true};if(this.players[index])this.players[index][0xaa0]=0;}
  directionalOrder(index){const s=this.players[index],m=this.masks[index];if(!s||!m)return;const x=s[0x47c]+((m&8)?1:0)-((m&4)?1:0),y=s[0x48a]+((m&2)?1:0)-((m&1)?1:0);this.order(index,x,y,s[0x48c]);}
  async tick(){
    this.directionalOrder(0);this.restore(this.players[0]);this.applyOrder(0);
    await this.mem.call(0x894,0xe); // One original colony simulation update, including player one.
    this.players[0]=this.capture();
    if(this.players[1]){
      this.directionalOrder(1);this.restore(this.players[1]);this.applyOrder(1);
      await this.mem.call(0x2cff,0x27a4); // Player two's own health/carrying/body update.
      await this.mem.call(0x2cff,0x279a); // Player two's own original pathfinding/movement update.
      this.players[1]=this.capture();
      // The DOS mover removes its old yellow marker. Restore both footprints
      // after updates so crossing the same cell does not erase the other ant.
      await this.place(this.players[0]);await this.place(this.players[1]);
    }
  }
  async render(index,canvas){
    const state=this.players[index];if(!state)return;
    this.restore(state);const b=this.mem.globals;
    const columns=this.mem.word(b+0x10e0)||22,rows=this.mem.word(b+0x10de)||21;
    const x=Math.max(0,Math.min((state[0x48c]===1?128:64)-columns,state[0x47c]-Math.floor(columns/2)));
    const y=Math.max(0,Math.min(64-rows,state[0x48a]-Math.floor(rows/2)));
    this.mem.word(b+0x32e,state[0x48c]);this.mem.word(b+0x508,x);this.mem.word(b+0x50a,y);
    const frame=this.game.frameNumber;
    await this.mem.call(0x250,0xe91);
    // VGA emits changed frames only. Identical views must not stall the game.
    const started=performance.now();
    while(this.game.frameNumber===frame&&performance.now()-started<40)await sleep(5);
    const left=this.mem.word(b+0x110c),top=this.mem.word(b+0x110e),right=this.mem.word(b+0x1110),bottom=this.mem.word(b+0x1112);
    const width=right-left,height=bottom-top;
    if(width<64||height<64||right>this.game.canvas.width||bottom>this.game.canvas.height)throw new Error('The original game viewport is not ready.');
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    canvas.getContext('2d').drawImage(this.game.canvas,left,top,width,height,0,0,width,height);
    this.views[index]={x,y,layer:state[0x48c],columns,rows,tileWidth:width/columns,tileHeight:16};
  }
  async run(canvases,onFrame,onError){
    this.running=true;this.loop=(async()=>{
      try{while(this.running){const started=performance.now();
        if(this.connected&&!this.players[1])await this.addPlayer();
        await this.tick();
        await this.render(0,canvases[0]);
        if(this.players[1])await this.render(1,canvases[1]);
        onFrame?.();await sleep(Math.max(0,100-(performance.now()-started)));
      }}catch(error){this.running=false;onError?.(error);}
    })();return this.loop;
  }
  async close(){this.running=false;await this.loop;if(this.mem.gate){if(this.players[1])await this.remove(this.players[1]);this.restore(this.players[0]);await this.mem.call(0x250,0xe91);this.mem.release();}}
}
