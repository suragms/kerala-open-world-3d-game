import type { Vec2 } from '../types';
import { routeLengths, sampleRoute } from './bus';
import { distance, type CollisionWorld, type RoadNetwork } from './navigation';

export type TaxiPhase = 'pickup'|'boarding'|'riding'|'stopping'|'blocked'|'arrived'|'exited';
export interface TaxiSnapshot { phase:TaxiPhase; attached:boolean; destination:string; remaining:number; speed:number; canBoard:boolean; canExit:boolean; pickup:Vec2; }
export class TaxiJourney {
  phase:TaxiPhase='pickup'; attached=false; metres=0; speed=0; timer=0;
  private requestedStop=false;
  lengths:number[]; position:Vec2; yaw:number; pickup:Vec2; exit:Vec2; destination:string;
  constructor(readonly points:Vec2[], pickup:Vec2, exit:Vec2, destination:string) {
    this.lengths=routeLengths(points);const pose=sampleRoute(points,this.lengths,0);
    this.position={x:pose.x,z:pose.z};this.yaw=pose.yaw;this.pickup=pickup;this.exit=exit;this.destination=destination;
  }
  get total(){return this.lengths.at(-1)??0;}
  board(position:Vec2){if(this.phase!=='pickup'||distance(position,this.pickup)>3)return false;this.attached=true;this.phase='boarding';this.timer=0;return true;}
  stop(){if(this.attached&&this.phase!=='arrived'){this.requestedStop=true;this.phase='stopping';}}
  update(dt:number,world:CollisionWorld,limit=8){
    if(this.phase==='blocked'&&!this.requestedStop){this.timer+=dt;if(this.timer>=2){this.timer=0;this.phase='riding';}else return;}
    if(this.phase==='boarding'){this.timer+=dt;if(this.timer>=1)this.phase='riding';return;}
    if(!['riding','stopping'].includes(this.phase))return;
    const remaining=this.total-this.metres,target=this.phase==='stopping'?0:Math.min(limit,Math.sqrt(Math.max(0,remaining)*4));
    this.speed=Math.max(0,this.speed+Math.max(-4*dt,Math.min(2*dt,target-this.speed)));
    const nextMetres=Math.min(this.total,this.metres+this.speed*dt),pose=sampleRoute(this.points,this.lengths,nextMetres);
    if(world.boxBlocked(this.position,pose.yaw,1.13,2.25)||distance(world.moveBox(this.position,pose,pose.yaw,1.13,2.25),pose)>.01){this.speed=0;this.phase='blocked';return;}
    this.position={x:pose.x,z:pose.z};this.yaw=pose.yaw;this.metres=nextMetres;
    if(this.total-this.metres<.15){this.speed=0;this.phase='arrived';}
    if(this.phase==='stopping'&&this.speed<.05){this.speed=0;this.phase='blocked';}
  }
  snapshot(player:Vec2):TaxiSnapshot{return {phase:this.phase,attached:this.attached,destination:this.destination,remaining:Math.max(0,this.total-this.metres),speed:this.speed*3.6,canBoard:this.phase==='pickup'&&distance(player,this.pickup)<3,canExit:this.attached&&this.speed<.05&&['arrived','blocked'].includes(this.phase),pickup:this.pickup};}
}
/** Endpoints are snapped to the road; no off-road connector is driven. Validate the entire swept body before booking. */
export let taxiFailure="";
export function taxiRoute(network:RoadNetwork,world:CollisionWorld,from:Vec2,to:Vec2){
  const a=network.nearest(from),b=network.nearest(to);
  if(!a||!b||distance(from,a.point)>90||distance(to,b.point)>90){taxiFailure="snap too far";return undefined;}
  const center=network.route(a.point,b.point).filter((p,i,ps)=>!i||distance(p,ps[i-1])>.02);
  if(center.length<2){taxiFailure="disconnected";return undefined;}
  const lengths=routeLengths(center),total=lengths.at(-1)!;
  if(total<5||total>8000){taxiFailure="length "+total;return undefined;}
  const points:Vec2[]=[];
  for(let m=0;m<total;m+=1){const p=sampleRoute(center,lengths,m,-.7);points.push({x:p.x,z:p.z});}
  const end=sampleRoute(center,lengths,total,-.7);points.push({x:end.x,z:end.z});
  let previous=points[0];
  for(let i=0;i<points.length;i++){const pose=sampleRoute(points,routeLengthsCached(points),i===points.length-1?routeLengthsCached(points).at(-1)!:routeLengthsCached(points)[i]);
    if(world.boxBlocked(pose,pose.yaw,1.13,2.25)||distance(world.moveBox(previous,pose,pose.yaw,1.13,2.25),pose)>.01){taxiFailure="blocked "+i+" / "+points.length+" at "+JSON.stringify(pose);return undefined;}previous=pose;
  }
  return points;
}
const cached=new WeakMap<Vec2[],number[]>();
function routeLengthsCached(points:Vec2[]){let value=cached.get(points);if(!value){value=routeLengths(points);cached.set(points,value);}return value;}
