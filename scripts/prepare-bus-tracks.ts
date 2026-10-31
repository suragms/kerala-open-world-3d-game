import {readFileSync,writeFileSync} from "node:fs";
import type {BusRouteData,BusStation,BusService,Tile,Vec2,GeoFeature} from "../src/types";
import {toLocal,toGeo} from "../src/data/geography";
import {routeLengths,sampleRoute,projectRoute} from "../src/game/bus";
import {CollisionWorld} from "../src/game/navigation";
const read=<T>(file:string)=>JSON.parse(readFileSync(`public/data/${file}`,"utf8")) as T;
const registry=read<{stations:BusStation[];routes:BusService[]}>("bus-services.json");
const reports=[];
for(const service of registry.routes){
  const route=read<BusRouteData>(service.file),stations=[service.from,service.to].map(id=>registry.stations.find(s=>s.id===id)!);
  const origin=stations[0].coordinate,sourcePoints=route.points.map(p=>toLocal(p,origin)),sourceLengths=routeLengths(sourcePoints),sourceTotal=sourceLengths.at(-1)!;
  // Round a junction's centre path before assigning its lane. A long vehicle cannot
  // rotate in place at the zero-radius corner of a routing polyline.
  const sampled=Array.from({length:Math.ceil(sourceTotal/2)+1},(_,i)=>sampleRoute(sourcePoints,sourceLengths,Math.min(sourceTotal,i*2)));
  const points=sampled.map((p,i)=>{
    const radius=Math.min(10,i,sampled.length-1-i);let x=0,z=0,weight=0;
    for(let j=-radius;j<=radius;j++){const w=radius+1-Math.abs(j);x+=sampled[i+j].x*w;z+=sampled[i+j].z*w;weight+=w;}
    return {x:x/weight,z:z/weight};
  });
  const lengths=routeLengths(points),total=lengths.at(-1)!;
  const sources=new Map<string,GeoFeature>();
  for(const f of [...stations.flatMap(s=>read<Tile>(`${s.tile}.json`).features),...route.features])sources.set(`${f.type}:${f.id}`,f);
  const features=[...sources.values()].map(f=>({source:f,points:f.points.map(p=>toLocal(p,origin))}));
  const world=new CollisionWorld();
  for(const f of features){const t=f.source.tags;
    if(t.building && !["construction","roof"].includes(t.building) && Number(t.layer??0)<=0 && Number(t.min_height??0)<3.5 && Number(t["building:min_level"]??0)<1)world.add(f.points);
    if((t.natural==="water"||t.water)&&f.points.length>3)world.add(f.points,true);
  }
  const bridges=features.filter(f=>f.source.tags.highway&&f.source.tags.bridge&&f.points.length>1).map(f=>({...f,lengths:routeLengths(f.points)}));
  world.bridgeAt=p=>bridges.some(b=>projectRoute(p,b.points,b.lengths).separation<10);
  const offsets=Array.from({length:21},(_,i)=>Number((-4+i*.4).toFixed(1)));
  const plan=(width:number,length:number,checkEdges:boolean)=>{
  const failed:{metres:number;coordinate:number[]}[]=[];let defaultBlocked=0;
  const step=2,count=Math.ceil(total/step)+1, costs:Float64Array[]=[],previous:Int16Array[]=[];
  let priorPoses:ReturnType<typeof sampleRoute>[]=[];
  for(let i=0;i<count;i++){
    const d=Math.min(total,i*step);
    const poses=offsets.map(offset=>sampleRoute(points,lengths,d,offset));
    const clear=poses.map(p=>!world.boxBlocked(p,p.yaw,width,length));
    if(!clear[offsets.indexOf(-1.6)])defaultBlocked++;
    if(!clear.some(Boolean))failed.push({metres:Math.round(d),coordinate:toGeo(sampleRoute(points,lengths,d),origin)});
    const row=new Float64Array(offsets.length).fill(Infinity),parents=new Int16Array(offsets.length).fill(-1);
    for(let j=0;j<offsets.length;j++)if(clear[j]){
      const preference=(offsets[j]+1.6)**2+(offsets[j]>0?8:0);
      if(!i){row[j]=preference;continue;}
      for(let k=Math.max(0,j-1);k<=Math.min(offsets.length-1,j+1);k++){
        if(!Number.isFinite(costs[i-1][k]))continue;
        const a=priorPoses[k],b=poses[j],yaw=Math.atan2(b.x-a.x,a.z-b.z);
        if(checkEdges&&(world.boxBlocked(a,yaw,width,length)||world.boxBlocked(b,yaw,width,length)))continue;
        const cost=costs[i-1][k]+preference+(j===k?0:3);
        if(cost<row[j]){row[j]=cost;parents[j]=k;}
      }
    }
    costs.push(row);previous.push(parents);priorPoses=poses;
  }
  let selected=costs.at(-1)!.indexOf(Math.min(...costs.at(-1)!));
  const connected=Number.isFinite(costs.at(-1)![selected]);
  const track:Vec2[]=[];
  if(connected){
    for(let i=count-1;i>=0;i--){track[i]=sampleRoute(points,lengths,Math.min(total,i*step),offsets[selected]);selected=previous[i][selected];}
    // Check the resulting vehicle heading, including the lane transition, rather than
    // checking only the original road tangent used during planning.
    const trackLengths=routeLengths(track);let collisions=0;
    for(let d=0;d<trackLengths.at(-1)!;d+=1){const p=sampleRoute(track,trackLengths,d);if(world.boxBlocked(p,p.yaw,1.35,5.4))collisions++;}
    if(collisions)return {track:undefined,defaultBlocked,failed,collisions};
  }
  return {track:connected?track:undefined,defaultBlocked,failed,collisions:0};
  };
  let result=plan(1.5,5.7,true);
  if(!result.track)result=plan(1.45,5.5,false);
  const {track,defaultBlocked,failed}=result;
  if(!track)throw new Error(`${service.id}: no lane track satisfies the final bus footprint checks ${JSON.stringify(result)}`);
  {
    route.drivingPoints=track.map(p=>toGeo(p,origin));
    route.clearance={halfWidth:1.35,halfLength:5.4,sampleMetres:1,scope:"Derived lane track within 4m of the sourced road centreline, with wider turning clearance at tight bends, checked against imported ground-level building and water polygons; sourced bridge crossings allowed. OSM coverage and road dimensions are incomplete. Not a legal bus-access or survey certificate."};
    writeFileSync(`public/data/${service.file}`,JSON.stringify(route));
  }
  reports.push({id:service.id,defaultBlockedSamples:defaultBlocked,connected:true,finalFootprintCollisions:0,unresolved:failed});
}
writeFileSync("output/bus-clearance-research.json",JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(r=>({...r,unresolved:r.unresolved.length,examples:r.unresolved.slice(0,8)})),null,2));
