// Version-specific research bridge for the supplied DOS executable.
// No multiplayer behavior is enabled by this module alone.
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export class SimAntMemory {
  constructor(ci){
    this.ci=ci;this.heap=ci.transport?.module?.HEAPU8;
    if(!this.heap)throw new Error('Memory investigation requires the direct DOSBox backend.');
    const candidates=[];
    for(let i=0xffff0;i<this.heap.length-16;i++){
      const h=this.heap;
      if(h[i]===0xea&&h[i+5]===48&&h[i+7]===47&&h[i+10]===47&&h[i+14]===0xfc&&h[i+15]===0x55){
        const base=i-0xffff0;
        if(h[base+0x400]===0xf8&&h[base+0x401]===3)candidates.push(base);
      }
    }
    if(candidates.length!==1)throw new Error('Could not uniquely identify DOS guest RAM.');
    this.base=candidates[0];this.ram=this.heap.subarray(this.base,this.base+0x100000);
    const programs=[];
    for(let p=0x1000;p<0x90000;p+=16){
      if(this.ram[p]!==0xcd||this.ram[p+1]!==0x20)continue;
      if(String.fromCharCode(...this.ram.subarray(p-8,p-2))!=='SIMANT')continue;
      if(this.word(p-15)!==p/16)continue;
      const load=p/16+16,hook=(load+0x15f8)*16+0x313,ds=(load+0x55b3)*16;
      const expected=[0x33,0xc0,0x9a,0xcc,2,(load+0x29f4)&255,(load+0x29f4)>>8,0xcb];
      if(equal(this.ram.slice(hook,hook+8),expected)&&String.fromCharCode(...this.ram.subarray(ds+8,ds+19))==='MS Run-Time')programs.push({psp:p,load,hook,ds});
    }
    if(programs.length!==1)throw new Error('This loaded executable does not match the supported SimAnt layout.');
    Object.assign(this,programs[0]);
  }
  word(address,value){if(value!==undefined){this.ram[address]=value&255;this.ram[address+1]=(value>>8)&255;}return this.ram[address]|(this.ram[address+1]<<8);}
  get globals(){const segment=this.word(this.ds+0x8952);if(segment<0x100||segment>0x9000)throw new Error('Invalid SimAnt globals segment.');return segment*16;}
  ant(){const b=this.globals;return {x:this.word(b+0x47c),y:this.word(b+0x48a),layer:this.word(b+0x48c),direction:this.word(b+0x496),body:this.word(b+0x4c2)};}
  autoTrack(enabled){
    // The original yellow-ant mover checks this option before recentering.
    // Options live in their own segment, not the colony's globals segment.
    const segment=this.word(this.ds+0x897e),address=segment*16+0x7a8;
    if(segment<0x100||segment>0x9000||this.word(address)>1)throw new Error('The original camera setting is not ready.');
    if(enabled!==undefined)this.word(address,enabled?1:0);
    return this.word(address)===1;
  }
  async until(test,timeout=60000){const start=performance.now();let notified=false;try{while(!test()){const elapsed=performance.now()-start;if(elapsed>1500&&!notified){notified=true;this.onWait?.(true);}if(elapsed>timeout)throw new Error('The original game did not reach the expected update boundary.');await delay(5);}}finally{if(notified)this.onWait?.(false);}}
  async installGate(){
    if(this.gate)return;
    if(this.allocation){
      const gate=this.allocation,segment=gate/16;
      this.ci.pause();await delay(60);this.ram[gate+0x22]=0;this.ram.set([0x2e,0xc6],gate+6);this.ram.set([0x9d,0xcb],gate+20);
      this.ram.set([0xea,0,0,segment&255,segment>>8],this.hook);this.ci.resume();
      await this.until(()=>this.ram[gate+0x22]===1);this.gate=gate;return {segment,ant:this.ant()};
    }
    this.ci.pause();await delay(60);
    const savedPSP=this.ram.slice(this.psp+0x60,this.psp+0x100),original=this.ram.slice(this.hook,this.hook+8);
    this.originalHook=original;
    // Temporary trampoline allocates an owned DOS memory block, preserving registers.
    const code=[0x9c,0x50,0x53,0x51,0x52,0x56,0x57,0x55,0x06,0x1e,
      0xbb,0x08,0x00,0xb4,0x48,0xcd,0x21,0x2e,0xa3,0xf0,0x00,
      0x9c,0x5b,0x2e,0x89,0x1e,0xf4,0x00,0x2e,0xc6,0x06,0xf2,0x00,0x01,
      0x2e,0x80,0x3e,0xf2,0x00,0x00,0x75,0xf8,
      0x1f,0x07,0x5d,0x5f,0x5e,0x5a,0x59,0x5b,0x58,0x9d,
      0xea,0x00,0x00,0x00,0x00];
    this.ram.fill(0,this.psp+0x60,this.psp+0x100);this.ram.set(code,this.psp+0x60);
    this.ram.set([0xea,0x60,0x00,(this.psp/16)&255,(this.psp/16)>>8],this.hook);
    this.ci.resume();
    await this.until(()=>this.ram[this.psp+0xf2]===1);
    if(this.word(this.psp+0xf4)&1){
      // Allocation failed: return directly from the temporary trampoline.
      this.ram[this.psp+0x60+code.length-5]=0xcb;
      this.ram.set(original,this.hook);this.ram[this.psp+0xf2]=0;
      await delay(60);this.ram.set(savedPSP,this.psp+0x60);
      throw new Error('DOS could not allocate the update-boundary gate.');
    }
    const segment=this.word(this.psp+0xf0),gate=segment*16;
    if(gate<0x1000||gate+128>0xa0000)throw new Error('DOS returned an invalid gate allocation.');
    this.ram.fill(0,gate,gate+128);
    const stub=[0x9c,0x2e,0xff,0x06,0x20,0x00,0x2e,0xc6,0x06,0x22,0x00,0x01,
      0x2e,0x80,0x3e,0x22,0x00,0x00,0x75,0xf8,0x9d,0xcb];
    this.ram.set(stub,gate);this.word(this.psp+0x60+code.length-2,segment);
    this.ram[this.psp+0xf2]=0;
    await this.until(()=>this.ram[gate+0x22]===1);
    this.ram.set([0xea,0x00,0x00,segment&255,segment>>8],this.hook);
    this.ram.set(savedPSP,this.psp+0x60);this.gate=gate;this.allocation=gate;
    return {segment,ant:this.ant()};
  }
  async step(){if(!this.gate)throw new Error('No simulation gate installed.');const count=this.word(this.gate+0x20);this.ram[this.gate+0x22]=0;await this.until(()=>this.ram[this.gate+0x22]===1&&this.word(this.gate+0x20)!==count);return this.ant();}
  async call(relativeSegment,offset,args=[],ax){
    if(!this.gate||this.ram[this.gate+0x22]!==1||args.length>6)throw new Error('Native calls require a stopped update boundary and at most six arguments.');
    const code=[0x50,0x53,0x51,0x52,0x56,0x57,0x55,0x06,0x1e];
    if(ax!==undefined){if(!Number.isInteger(ax)||ax<0||ax>65535)throw new Error('Invalid native AX argument.');code.push(0xb8,ax&255,ax>>8);}
    for(const arg of [...args].reverse())code.push(0x68,arg&255,(arg>>8)&255);
    const segment=this.load+relativeSegment;
    code.push(0x9a,offset&255,offset>>8,segment&255,segment>>8,0x83,0xc4,args.length*2,
      0x2e,0xa3,0x24,0x00,0x2e,0x89,0x16,0x26,0x00,
      0x1f,0x07,0x5d,0x5f,0x5e,0x5a,0x59,0x5b,0x58);
    const relative=6-(0x40+code.length+3);code.push(0xe9,relative&255,(relative>>8)&255);
    if(code.length>64)throw new Error('Native call exceeds the allocated trampoline.');
    this.ram.set(code,this.gate+0x40);this.ram.set([0xeb,0x2a],this.gate+20);this.ram[this.gate+0x22]=0;
    try{await this.until(()=>this.ram[this.gate+0x22]===1);}
    finally{if(this.gate)this.ram.set([0x9d,0xcb],this.gate+20);}
    return {ax:this.word(this.gate+0x24),dx:this.word(this.gate+0x26)};
  }
  release(){if(!this.gate)return;this.ram.set(this.originalHook,this.hook);this.ram.set([0x9d,0xcb],this.gate+20);this.ram.set([0xeb,0x0c],this.gate+6);this.ram[this.gate+0x22]=0;this.gate=null;}
}
