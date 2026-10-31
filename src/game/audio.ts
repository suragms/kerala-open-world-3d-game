import type { Settings, Theme } from "../types";
/** Original synthesized audio. No third-party recordings are included. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private engineGain?: GainNode;
  private motor?: OscillatorNode;
  private noise?: AudioBufferSourceNode;
  private filter?: BiquadFilterNode;
  private birdTime = 0;
  private atmosphereTime=0;
  cue(kind: "door" | "bell" | "departure" | "brake" | "rail" | "airport" | "market") {
    const ctx = this.context; if (!ctx || !this.master) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = kind === "door" || kind === "brake" ? "sawtooth" : kind === "rail" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(kind === "bell" ? 880 : kind === "door" ? 120 : kind === "rail" ? 65 : kind === "airport" ? 520 : kind === "market" ? 210+Math.random()*90 : kind === "brake" ? 1800 : 330, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "bell" ? 660 : kind === "door" ? 50 : 440, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    oscillator.connect(gain).connect(this.master); oscillator.start(); oscillator.stop(ctx.currentTime + 0.45);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  start() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    try {
      const ctx = (this.context = new AudioContext());
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.master.gain.value = 0;
      this.ambience = ctx.createGain();
      this.ambience.connect(this.master);
      this.engineGain = ctx.createGain();
      this.engineGain.connect(this.master);
      this.engineGain.gain.value = 0;
      this.motor = ctx.createOscillator();
      this.motor.type = "sawtooth";
      this.motor.frequency.value = 45;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 280;
      this.motor.connect(low).connect(this.engineGain);
      this.motor.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
        data = buffer.getChannelData(0);
      let b = 0;
      for (let i = 0; i < data.length; i++) {
        b = (b + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = b * 3;
      }
      this.noise = ctx.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 500;
      this.noise.connect(this.filter).connect(this.ambience);
      this.noise.start();
    } catch {
      /* Browser audio may be unavailable. Gameplay stays functional. */
    }
  }
  update(
    settings: Settings,
    speed: number,
    driving: boolean,
    paused: boolean,
    time: number,
    environment: { theme?:Theme; nearStation?:boolean; market?:boolean; trainSpeed?:number } = {},
  ) {
    if (
      !this.context ||
      !this.master ||
      !this.ambience ||
      !this.engineGain ||
      !this.motor
    )
      return;
    const ctx = this.context;
    this.master.gain.setTargetAtTime(
      paused ? 0 : settings.master,
      ctx.currentTime,
      0.15,
    );
    const rain = settings.weather === "rainy" || settings.weather === "monsoon";
    const coast=["beach","fishing","backwater"].includes(environment.theme??""), mountain=environment.theme==="tea" || environment.theme==="dam";
    const waves=coast?.18+Math.sin(time*.6)*.08:mountain?.2+Math.sin(time*.3)*.05:.15;
    this.ambience.gain.setTargetAtTime(
      settings.ambience * (rain ? 0.65 : waves),
      ctx.currentTime,
      0.1,
    );
    if (this.filter)
      this.filter.frequency.setTargetAtTime(
        rain ? 2400 : coast ? 950 : mountain ? 650 : 450,
        ctx.currentTime,
        0.3,
      );
    this.engineGain.gain.setTargetAtTime(
      driving ? settings.engine * 0.045 : 0,
      ctx.currentTime,
      0.1,
    );
    this.motor.frequency.setTargetAtTime(
      35 + Math.abs(speed) * 3.3,
      ctx.currentTime,
      0.1,
    );
    if(!paused && time>this.atmosphereTime){
      if((environment.trainSpeed??0)>.5){this.cue("rail");this.atmosphereTime=time+Math.max(.18,1.8/(environment.trainSpeed??1));}
      else if(environment.theme==="airport"){this.cue("airport");this.atmosphereTime=time+18;}
      else if(environment.nearStation||environment.market){this.cue("market");this.atmosphereTime=time+3+Math.random()*3;}
      else this.atmosphereTime=time+1;
    }
    if (!paused && !rain && settings.time !== "night" && time > this.birdTime) {
      this.birdTime = time + 6 + Math.random() * 7;
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1700, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        2800,
        ctx.currentTime + 0.09,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        1300,
        ctx.currentTime + 0.2,
      );
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        settings.ambience * 0.025,
        ctx.currentTime + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      oscillator.connect(gain).connect(this.master);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.26);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
  }
  dispose() {
    this.motor?.stop();
    this.noise?.stop();
    void this.context?.close();
  }
}
