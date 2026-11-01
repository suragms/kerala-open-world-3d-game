import type { Vec2 } from "../types";
import type { Road, CollisionWorld,CollisionBox } from "./navigation";
import { distance,nearestOnSegment } from "./navigation";
import { routeLengths, sampleRoute } from "./bus";

export type TrafficPhase = "cruising" | "following" | "signal" | "yielding" | "crossing" | "blocked" | "road-end" | "bus-stop";
export interface TrafficBody { halfWidth:number; halfLength:number; height:number; }
export function trafficBody(kind:string):TrafficBody {
  if(kind==="Scooter"||kind==="Motorcycle")return {halfWidth:.48,halfLength:1.18,height:1.6};
  if(kind==="Auto rickshaw")return {halfWidth:.8,halfLength:1.35,height:2.2};
  if(kind==="Bus")return {halfWidth:1.4,halfLength:4.7,height:3.2};
  if(kind==="Truck")return {halfWidth:1.25,halfLength:3.5,height:3.5};
  if(kind==="Delivery van"||kind==="Tourist van")return {halfWidth:1.1,halfLength:2.65,height:2.7};
  return {halfWidth:1.13,halfLength:2.25,height:2.1};
}
export function safeApproachSpeed(gap:number, leadSpeed=0, braking=3) {
  return Math.sqrt(Math.max(0,leadSpeed*leadSpeed+2*braking*Math.max(0,gap)));
}
export function signalIsRed(time:number,point:Vec2) {
  const offset=((Math.floor(point.x/64)+Math.floor(point.z/64)*7)%22+22)%22;
  return (time+offset)%22<9;
}
export function relativeTraffic(from:Vec2,yaw:number,to:Vec2) {
  const dx=to.x-from.x,dz=to.z-from.z;
  return {ahead:dx*Math.sin(yaw)-dz*Math.cos(yaw),side:dx*Math.cos(yaw)+dz*Math.sin(yaw)};
}
export function crossingClear(point:Vec2, vehicles:{position:Vec2;yaw:number;speed:number;body:TrafficBody}[], seconds=3) {
  return vehicles.every(v=>{
    const p=relativeTraffic(v.position,v.yaw,point);
    return Math.abs(p.side)>v.body.halfWidth+2 || p.ahead< -v.body.halfLength-1 || p.ahead>v.body.halfLength+Math.max(3,v.speed*seconds);
  });
}
const routeCache=new WeakMap<Road,number[]>();
export function laneLengths(road:Road) {
  let lengths=routeCache.get(road);if(!lengths){lengths=routeLengths(road.points);routeCache.set(road,lengths);}return lengths;
}
export function lanePose(road:Road,metres:number,direction:number) {
  const pose=sampleRoute(road.points,laneLengths(road),metres,-Math.min(2,road.width*.24)*direction);
  return {...pose,yaw:pose.yaw+(direction<0?Math.PI:0)};
}
export const trafficNodeKey=(p:Vec2)=>`${p.x.toFixed(3)},${p.z.toFixed(3)}`;
export interface TrafficConnection {road:Road;metres:number;direction:number;}
/** OSRM rounds duplicate OSM coordinates to six decimals (~11 cm). Only explicitly derived,
 * same-name, same-layer duplicates get this precision allowance; independent nearby ways stay disconnected. */
export function trafficConnections(roads:Road[]) {
  const result=new Map<string,TrafficConnection[]>(),cells=new Map<string,{point:Vec2;road:Road;entries:TrafficConnection[]}[]>();
  for(const road of roads){const lengths=laneLengths(road);road.points.forEach((point,index)=>{
    const entries:TrafficConnection[]=[];
    if(index<road.points.length-1)entries.push({road,metres:lengths[index],direction:1});
    if(index>0&&!road.oneway)entries.push({road,metres:lengths[index],direction:-1});
    const key=trafficNodeKey(point);result.set(key,[...result.get(key)??[],...entries]);
    const cell=`${Math.floor(point.x)},${Math.floor(point.z)}`,list=cells.get(cell)??[];list.push({point,road,entries});cells.set(cell,list);
  });}
  for(const nodes of cells.values())for(const node of nodes){
    const x=Math.floor(node.point.x),z=Math.floor(node.point.z),key=trafficNodeKey(node.point),entries=result.get(key)!;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const other of cells.get(`${x+dx},${z+dz}`)??[]){
      if(node.road===other.road || !(node.road.derived||other.road.derived) || node.road.name!==other.road.name || (node.road.layer??"ground")!==(other.road.layer??"ground") || distance(node.point,other.point)>.16)continue;
      for(const entry of other.entries)if(!entries.some(e=>e.road===entry.road&&e.metres===entry.metres&&e.direction===entry.direction))entries.push(entry);
    }
  }
  return result;
}
/** Conservative simulation priority for an active Full Journey's checked lane track.
 * Spatial indexing keeps other traffic outside its swept envelope without fabricating bypass roads. */
export class CorridorReservation {
  private cells=new Map<string,CollisionBox[]>();
  constructor(points:Vec2[]){
    const lengths=routeLengths(points),total=lengths.at(-1)??0;
    // A square enclosing the longest coach in every heading also covers tight-bend rotation
    // between samples. This intentionally reserves more than a normal lane at junctions.
    for(let d=0;d<=total+2;d+=2){const pose=sampleRoute(points,lengths,Math.min(d,total));
      const box:CollisionBox={center:pose,yaw:0,halfWidth:7,halfLength:7};
      const key=`${Math.floor(pose.x/32)},${Math.floor(pose.z/32)}`,list=this.cells.get(key)??[];list.push(box);this.cells.set(key,list);
    }
  }
  near(point:Vec2){const result:CollisionBox[]=[],x=Math.floor(point.x/32),z=Math.floor(point.z/32);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)result.push(...this.cells.get(`${x+dx},${z+dz}`)??[]);
    return result;
  }
}
/** Small kinematic controller. Logical progress commits only when the swept body can move. */
export class LaneMotion {
  speed=0;
  phase:TrafficPhase="cruising";
  position:Vec2;
  yaw:number;
  segment=1;
  t=0;
  private offset:number;
  constructor(public road:Road,public metres:number,public direction:number,public body:TrafficBody) {
    this.offset=-Math.min(2,road.width*.24)*direction;
    const pose=lanePose(road,metres,direction);this.position={x:pose.x,z:pose.z};this.yaw=pose.yaw;this.sync();
  }
  private sync(){const lengths=laneLengths(this.road),pose=lanePose(this.road,this.metres,this.direction);this.segment=pose.segment;
    this.t=(this.metres-lengths[this.segment-1])/(lengths[this.segment]-lengths[this.segment-1]||1);}
  update(dt:number,targetSpeed:number,world:CollisionWorld,reason:TrafficPhase="cruising") {
    if(!Number.isFinite(dt)||dt<=0)return;
    const total=laneLengths(this.road).at(-1)!,remaining=this.direction>0?total-this.metres:this.metres;
    const endLimit=safeApproachSpeed(Math.max(0,remaining-.3),0,2.5);
    const ahead=lanePose(this.road,Math.max(0,Math.min(total,this.metres+this.direction*12)),this.direction);
    const turn=Math.abs(Math.atan2(Math.sin(ahead.yaw-this.yaw),Math.cos(ahead.yaw-this.yaw)));
    const target=Math.max(0,Math.min(targetSpeed,endLimit,Math.sqrt(2.2*12/Math.max(.08,turn))));
    this.speed+=Math.max(-4*dt,Math.min(1.8*dt,target-this.speed));if(this.speed<.025)this.speed=0;
    const nextMetres=Math.max(0,Math.min(total,this.metres+this.direction*this.speed*dt));
    const base=sampleRoute(this.road.points,laneLengths(this.road),nextMetres,this.offset);
    const pose={...base,yaw:base.yaw+(this.direction<0?Math.PI:0)},delta=distance(this.position,pose),step=Math.min(delta,this.speed*dt);
    const point=delta>0?{x:this.position.x+(pose.x-this.position.x)*step/delta,z:this.position.z+(pose.z-this.position.z)*step/delta}:this.position;
    const yaw=this.yaw+Math.atan2(Math.sin(pose.yaw-this.yaw),Math.cos(pose.yaw-this.yaw))*(1-Math.exp(-dt*7));
    if(world.boxBlocked(this.position,yaw,this.body.halfWidth,this.body.halfLength)) {this.speed=0;this.phase="blocked";return;}
    const safe=world.moveBox(this.position,point,yaw,this.body.halfWidth,this.body.halfLength);
    if(distance(safe,point)>.001){this.position=safe;this.speed=0;this.phase="blocked";return;}
    this.position={...safe};this.yaw=yaw;
    // Commit progress from the physical location so curves and lane changes cannot build up logical drift.
    let best=Infinity,projected=this.metres;const lengths=laneLengths(this.road);
    for(let i=Math.max(1,pose.segment-2);i<=Math.min(this.road.points.length-1,pose.segment+2);i++){
      const point=nearestOnSegment(safe,this.road.points[i-1],this.road.points[i]),gap=distance(safe,point);
      if(gap<best){best=gap;projected=lengths[i-1]+distance(this.road.points[i-1],point);}
    }
    this.metres=projected;this.sync();
    this.phase=remaining<.5?"road-end":target<.1&&reason!=="cruising"?reason:reason;
  }
  continueOn(road:Road,metres:number,direction:number){this.road=road;this.metres=metres;this.direction=direction;this.offset=-Math.min(2,road.width*.24)*direction;this.sync();}
}
