import {readFileSync,writeFileSync} from "node:fs";
import type {BusRouteData,BusStation,BusService,Tile,TerrainGrid,Vec2,GeoFeature} from "../src/types";
import {toLocal,insideRing} from "../src/data/geography";
import {routeLengths,sampleRoute,projectRoute} from "../src/game/bus";
import {sampleTerrain,validTerrain} from "../src/game/terrain";
const read=<T>(file:string)=>JSON.parse(readFileSync(`public/data/${file}`,"utf8")) as T;
const registry=read<{stations:BusStation[];routes:BusService[]}>("bus-services.json");
const audit=registry.routes.map(service=>{
  const route=read<BusRouteData>(service.file),stations=[service.from,service.to].map(id=>registry.stations.find(s=>s.id===id)!);
  const origin=stations[0].coordinate,points=(route.drivingPoints??route.points).map(p=>toLocal(p,origin)),lengths=routeLengths(points),total=lengths.at(-1)!;
  const terrain=read<TerrainGrid>(`elevation-corridor-${service.id}.json`);
  if(!validTerrain(terrain))throw new Error(`Invalid terrain: ${service.id}`);
  const source=new Map<string,GeoFeature>();
  for(const f of [...stations.flatMap(s=>read<Tile>(`${s.tile}.json`).features),...route.features])source.set(`${f.type}:${f.id}`,f);
  const features=[...source.values()].map(f=>({source:f,points:f.points.map(p=>toLocal(p,origin))}));
  const polygons=features.filter(f=>f.points.length>3 && (f.source.tags.building && !["construction","roof"].includes(f.source.tags.building) && Number(f.source.tags.layer??0)<=0 || f.source.tags.natural==="water" || f.source.tags.water)).map(f=>({...f,minX:Math.min(...f.points.map(p=>p.x)),maxX:Math.max(...f.points.map(p=>p.x)),minZ:Math.min(...f.points.map(p=>p.z)),maxZ:Math.max(...f.points.map(p=>p.z))}));
  const bridges=features.filter(f=>f.source.tags.highway && f.source.tags.bridge && f.points.length>1).map(f=>({...f,lengths:routeLengths(f.points)}));
  const flags=new Map<string,{source:string;type:string;metres:number;bridge:boolean}>();
  let missingHeights=0,maxGrade=0,lastHeight:number|undefined,samples=0,minHeight=Infinity,maxHeight=-Infinity;
  for(let d=0;d<=total;d+=10){
    const p=sampleRoute(points,lengths,d,Number(process.argv[2]??(route.drivingPoints?0:-1.6))),height=sampleTerrain(terrain,p.x,p.z);samples++;
    if(height!==undefined){minHeight=Math.min(minHeight,height);maxHeight=Math.max(maxHeight,height);}
    if(height===undefined)missingHeights++;
    else if(lastHeight!==undefined)maxGrade=Math.max(maxGrade,Math.abs(height-lastHeight)/10);
    lastHeight=height;
    for(const f of polygons){
      if(p.x<f.minX||p.x>f.maxX||p.z<f.minZ||p.z>f.maxZ||!insideRing([p.x,p.z],f.points.map(q=>[q.x,q.z])))continue;
      const bridge=bridges.some(b=>projectRoute(p,b.points,b.lengths).separation<12);
      const type=f.source.tags.building?"building footprint overlap":"water polygon crossing";
      const key=`${f.source.type}/${f.source.id}`;
      if(!flags.has(key))flags.set(key,{source:`https://www.openstreetmap.org/${key}`,type,metres:Math.round(d),bridge});
    }
  }
  return {id:service.id,origin:stations[0].name,destination:stations[1].name,sourceDistance:service.distance,localGeometryMetres:Math.round(total),samples,minimumTerrainHeight:Number(minHeight.toFixed(1)),maximumTerrainHeight:Number(maxHeight.toFixed(1)),maximumSampledGrade:Number(maxGrade.toFixed(3)),missingTerrainSamples:missingHeights,flags:[...flags.values()],scope:"10m lane-centre sampling against imported endpoint/corridor footprints and coarse DEM. OSM extraction is incomplete; this does not certify legal bus access or surveyed deck heights."};
});
writeFileSync("public/data/bus-route-audit.json",JSON.stringify({generatedAt:new Date().toISOString(),routes:audit},null,2));
console.log(JSON.stringify(audit,null,2));
if(audit.some(a=>a.missingTerrainSamples))throw new Error("A bus corridor leaves its imported elevation coverage");
