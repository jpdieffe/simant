import {PcmAudio} from './audio.js';
const dosboxConf = `[sdl]\nfullscreen=false\n[dosbox]\nmachine=svga_s3\nmemsize=16\n[cpu]\ncore=auto\ncycles=fixed 6000\n[mixer]\nrate=22050\nblocksize=1024\nprebuffer=30\n[sblaster]\nsbtype=sb16\n[autoexec]\n@echo off\nmount c .\nc:\ncd SIMANT~1\nsimant.exe\n`;

export class DosGame {
  constructor(canvas, status) {
    this.canvas=canvas; this.status=status; this.context=canvas.getContext('2d',{alpha:false});
    this.audio=null;this.muted=false;this.frameNumber=0;this.frameListeners=new Set();
  }
  async start(savedFiles) {
    this.audio=new AudioContext({latencyHint:'playback'});
    const resumed=this.audio.resume();
    this.audioStream=this.audio.createMediaStreamDestination();
    this.pcm=new PcmAudio(this.audio,this.audioStream,{bufferSeconds:.3,maxSeconds:.8});
    await Promise.all([resumed,this.pcm.init()]);this.pcm.setMuted(this.muted);
    const response=await fetch('game/simant.zip');
    if(!response.ok) throw new Error('The original SimAnt game files are missing.');
    const init=[new Uint8Array(await response.arrayBuffer())];
    if(savedFiles)init.push(savedFiles);
    init.push({dosboxConf,jsdosConf:{version:'8'}});
    emulators.pathPrefix=new URL('vendor/',location.href).href;
    this.ci=await emulators.dosboxDirect(init);
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
      this.frameNumber++;
      for(const listener of this.frameListeners)listener();
    });
    this.ci.events().onSoundPush(samples=>this.sound(samples));
    this.ci.events().onMessage((type,...args)=>{if(type==='panic')this.status(args.join(' '));});
    this.ci.events().onExit(()=>this.status('The DOS game has closed. Reload to play again.'));
    this.status('Choose Quick Game, Full Game, or load your colony.');
    return this.ci;
  }
  get muted(){return this._muted||false;}
  set muted(value){this._muted=!!value;this.pcm?.setMuted(this._muted);}
  sound(samples){this.pcm?.push(samples,this.ci.soundFrequency());}
  async close(){await this.ci?.exit();this.pcm?.close();await this.audio?.close();}
}
