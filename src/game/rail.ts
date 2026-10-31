import type { Vec2 } from "../types";
import { projectRoute, routeLengths, sampleRoute } from "./bus";

export const TRAIN_CAMERAS=["Train passenger", "Train window", "Exterior train"] as const;
/** Local reversible shuttle over one connected imported rail alignment. No service timetable. */
export class RailShuttle {
  lengths: number[];
  distance: number;
  speed=0;
  direction=1;
  dwell=0;
  held=false;
  private targetIndex=1;
  stops: {distance:number; station:boolean; name:string}[];
  constructor(public points:Vec2[], stations:{point:Vec2;name:string}[]) {
    this.lengths=routeLengths(points);
    const total=this.lengths.at(-1)!;
    const mapped=stations.map(s=>({...projectRoute(s.point,points,this.lengths),name:s.name})).filter(s=>s.separation<150);
    this.stops=[{distance:28,station:false,name:"Track limit"},...mapped.map(s=>({distance:Math.max(28,Math.min(total,s.distance)),station:true,name:s.name})),{distance:total,station:false,name:"Track limit"}]
      .sort((a,b)=>a.distance-b.distance || Number(b.station)-Number(a.station)).filter((s,i,a)=>i===0 || s.distance-a[i-1].distance>5);
    const first=this.stops.find(s=>s.station);
    this.distance=first?Math.max(28,first.distance-60):28;
    this.targetIndex=first?this.stops.indexOf(first):1;
  }
  get pose(){return sampleRoute(this.points,this.lengths,this.distance);}
  get target(){return this.stops[this.targetIndex];}
  get atStation(){return this.speed<.05 && this.dwell>0 && this.stops.some(s=>s.station&&Math.abs(s.distance-this.distance)<1);}
  get boardingPoint(){const s=this.stops.find(s=>s.station);if(!s)return undefined;const p=sampleRoute(this.points,this.lengths,s.distance);return {x:p.x-Math.cos(p.yaw)*3.5,z:p.z-Math.sin(p.yaw)*3.5};}
  update(dt:number){
    if(this.dwell>0){
      const station=this.atStation;
      this.dwell=Math.max(0,this.dwell-dt);if(this.held&&station)this.dwell=Math.max(.1,this.dwell);return;
    }
    const target=this.target, remaining=Math.abs(target.distance-this.distance);
    const desired=Math.min(8,Math.sqrt(2*.9*remaining));
    this.speed+=Math.max(-1.5*dt,Math.min(.7*dt,desired-this.speed));
    this.distance+=this.direction*Math.min(remaining,this.speed*dt);
    if(remaining<.05&&this.speed<.5){
      this.distance=target.distance;this.speed=0;this.dwell=target.station?18:5;
      if(this.targetIndex===this.stops.length-1)this.direction=-1;
      if(this.targetIndex===0)this.direction=1;
      this.targetIndex+=this.direction;
    }
  }
}
