/** Hysteresis prevents resolution oscillation. This does not change world fidelity or gameplay speed. */
export class AdaptiveResolution {
  scale=1;
  private samples:number[]=[];
  private sinceChange=0;
  update(milliseconds:number, dt:number, enabled:boolean) {
    if(!enabled){this.reset();return false;}
    if(!Number.isFinite(milliseconds)||milliseconds<=0||!Number.isFinite(dt)||dt<=0)return false;
    this.sinceChange+=dt;this.samples.push(milliseconds);
    if(this.samples.length<120)return false;
    const sorted=this.samples.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];
    this.samples.length=0;
    let next=this.scale;
    if(p95>28&&this.sinceChange>=4-1e-6)next=Math.max(.65,this.scale-.1);
    else if(p95<19&&this.sinceChange>=8-1e-6)next=Math.min(1,this.scale+.05);
    next=Math.round(next*100)/100;
    if(next===this.scale)return false;
    this.scale=next;this.sinceChange=0;return true;
  }
  reset(){const changed=this.scale!==1;this.scale=1;this.samples.length=0;this.sinceChange=0;return changed;}
}
