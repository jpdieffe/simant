const dosboxConf = `[sdl]\nfullscreen=false\n[dosbox]\nmachine=svga_s3\nmemsize=16\n[cpu]\ncore=auto\ncycles=fixed 6000\n[mixer]\nrate=22050\nblocksize=1024\nprebuffer=30\n[sblaster]\nsbtype=sb16\n[autoexec]\n@echo off\nmount c .\nc:\ncd SIMANT~1\nsimant.exe\n`;

export class DosGame {
  constructor(canvas, status) {
    this.canvas=canvas; this.status=status; this.context=canvas.getContext('2d',{alpha:false});
    this.audio=null;this.nextAudio=0;this.nodes=new Set();this.muted=false;
  }
  async start(savedFiles) {
    this.audio=new AudioContext();
    await this.audio.resume();
    const response=await fetch('game/simant.zip');
    if(!response.ok) throw new Error('The original SimAnt game files are missing.');
    const init=[new Uint8Array(await response.arrayBuffer())];
    if(savedFiles)init.push(savedFiles);
    init.push({dosboxConf,jsdosConf:{version:'8'}});
    emulators.pathPrefix=new URL('vendor/',location.href).href;
    this.ci=await (new URLSearchParams(location.search).has('memory') ? emulators.dosboxDirect(init) : emulators.dosboxWorker(init));
    this.ci.events().onFrameSize((width,height)=>{this.canvas.width=width;this.canvas.height=height;this.frame=this.context.createImageData(width,height);});
    this.ci.events().onFrame((rgb,rgba)=>{
      if(!this.frame||this.frame.width!==this.ci.width()||this.frame.height!==this.ci.height()) {
        this.canvas.width=this.ci.width();this.canvas.height=this.ci.height();
        this.frame=this.context.createImageData(this.canvas.width,this.canvas.height);
      }
      if(rgba)this.frame.data.set(rgba);
      else if(rgb)for(let i=0,j=0;i<rgb.length;i+=3,j+=4){this.frame.data[j]=rgb[i];this.frame.data[j+1]=rgb[i+1];this.frame.data[j+2]=rgb[i+2];this.frame.data[j+3]=255;}
      else return;
      this.context.putImageData(this.frame,0,0);
    });
    this.ci.events().onSoundPush(samples=>this.sound(samples));
    this.ci.events().onMessage((type,...args)=>{if(type==='panic')this.status(args.join(' '));});
    this.ci.events().onExit(()=>this.status('The DOS game has closed. Reload to play again.'));
    this.status('Original SimAnt · Single-player preview');
    return this.ci;
  }
  sound(samples) {
    if(this.muted||this.audio.state!=='running')return;
    const buffer=this.audio.createBuffer(2,samples.length/2,this.ci.soundFrequency());
    for(let c=0;c<2;c++){const channel=buffer.getChannelData(c);for(let i=0;i<channel.length;i++)channel[i]=samples[i*2+c];}
    const now=this.audio.currentTime;
    if(this.nextAudio<now||this.nextAudio>now+.3)this.nextAudio=now+.02;
    const node=this.audio.createBufferSource();node.buffer=buffer;node.connect(this.audio.destination);this.nodes.add(node);
    node.onended=()=>{node.disconnect();this.nodes.delete(node);};
    node.start(this.nextAudio);this.nextAudio+=buffer.duration;
  }
  async close(){await this.ci?.exit();for(const node of this.nodes)node.stop();this.nodes.clear();await this.audio?.close();}
}
