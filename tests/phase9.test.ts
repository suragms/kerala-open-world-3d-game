import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CollisionWorld, StateRouter, estimateJourney } from "../src/game/navigation";
import { curbsideExit } from "../src/game/exits";
import { MinHeap } from "../src/game/priorityQueue";
import { DEFAULT_AVATAR, DEFAULT_SETTINGS, type StateNetwork, type LonLat } from "../src/types";
import { validateSave, readSave, writeSave, sanitizeSettings, bindingConflict } from "../src/game/save";
import { fetchJson, dataUrl } from "../src/data/loading";
import { loadGeography, loadTerrain, loadTile } from "../src/data/geography";
import { validTerrain } from "../src/game/terrain";
import { vehicleThrottle, smoothSteering } from "../src/game/vehicle";

const a: LonLat = [76,10], b: LonLat = [76.01,10], c: LonLat = [76.02,10];
const network = (kind="road", points=[a,b,c]): StateNetwork => ({ source:"test",license:"test", features:[{id:1,kind,name:"test",ref:"",points}] });
test("Binary heap orders priorities with stable equal-priority entries", () => {
  const heap=new MinHeap<number>(); const numbers=Array.from({length:1000},(_,i)=>(i*317)%1000);
  for(const n of numbers)heap.push(n,n); assert.deepEqual(numbers.sort((a,b)=>a-b),Array.from({length:1000},()=>heap.pop()!.value));
  assert.equal(heap.pop(),undefined); heap.push(1,0);heap.push(2,0);assert.equal(heap.pop()!.value,1);
});
test("Road geometry never supplies railway routes and disconnected paths are unavailable", () => {
  assert.equal(new StateRouter(network(),"rail").estimate(a,c).available,false);
  const broken=network();broken.features.push({...broken.features[0],id:2,points:[[76.2,10],[76.21,10]]});
  assert.equal(new StateRouter(broken).estimate(a,[76.21,10]).available,false);
  assert.equal(new StateRouter(network()).estimate([NaN,10],c).distanceKm,null);
  assert.equal(new StateRouter(network()).estimate([80,10],c).available,false);
});
test("Routing cache separates network identity, version and transportation mode", () => {
  const first=network(),second=network("rail");
  assert.equal(estimateJourney(a,c,"road",first).available,true);
  assert.equal(estimateJourney(a,c,"road",second).available,false);
  assert.equal(estimateJourney(a,c,"rail",second).available,true);
  first.features=[]; first.version=2;
  assert.equal(estimateJourney(a,c,"road",first).available,false);
});
test("Directional state edges and close parallel lines never create false links", () => {
  const one=network();one.features[0].oneway=true;
  assert.equal(new StateRouter(one).estimate(a,c).available,true);assert.equal(new StateRouter(one).estimate(c,a).available,false);
  one.features[0].oneway="-1"; assert.equal(new StateRouter(one).estimate(c,a).available,true);
  const parallel=network("rail",[a,b]);parallel.features.push({...parallel.features[0],id:2,points:[[76.01001,10],[76.02,10]]});
  assert.equal(new StateRouter(parallel,"rail").estimate(a,c).available,false);
});
test("Imported representative routes use only their selected mode or explicitly reject incomplete coverage", () => {
  const imported=JSON.parse(readFileSync("public/data/state-network.json","utf8")) as StateNetwork;
  const places=JSON.parse(readFileSync("public/data/places.json","utf8"));
  const pairs=[["Thrissur","Guruvayur"],["Thrissur","Ernakulam"],["Ernakulam","Aluva"],["Kozhikode","Kannur"],["Kottayam","Ernakulam"]];
  for(const [from,to] of pairs) for(const mode of ["road","rail"] as const) {
    const find=(name:string)=>places.find((p:any)=>p.kind==="station" && p.name.toLowerCase().includes(name.toLowerCase()));
    const start=find(from),end=find(to);assert.ok(start&&end,`${from}/${to}`);
    const route=estimateJourney([start.lon,start.lat],[end.lon,end.lat],mode,imported);
    if(route.available){assert.ok(route.distanceKm!>0);assert.match(route.label,new RegExp(`imported ${mode}`));}
    else {assert.equal(route.distanceKm,null);assert.match(route.label,/unavailable/);}
  }
});
test("Every imported bus corridor also supplies a connected directional road estimate",()=>{
  const imported=JSON.parse(readFileSync("public/data/state-network.json","utf8")) as StateNetwork;
  const registry=JSON.parse(readFileSync("public/data/bus-services.json","utf8"));
  for(const service of registry.routes){
    const a=registry.stations.find((s:any)=>s.id===service.from),b=registry.stations.find((s:any)=>s.id===service.to);
    const route=estimateJourney(a.coordinate,b.coordinate,"road",imported);
    assert.equal(route.available,true,service.id);assert.ok(Math.abs(route.distanceKm!*1000-service.distance)<service.distance*.1);
  }
});
test("Curbside exits never mutate live boxes or cross the bus, buildings, vehicles or world boundaries", () => {
  const world=new CollisionWorld(),bus={center:{x:0,z:0},yaw:0,halfWidth:1.35,halfLength:4.7};
  world.walkableAt=p=>Math.abs(p.x)<20&&Math.abs(p.z)<20;
  const original=world.boxes;
  const exit=curbsideExit(world,bus,3.5,.5,()=>0)!; assert.ok(exit.x< -1.85);assert.equal(world.boxes,original);assert.equal(world.boxes.length,0);
  const probe=world.withAdditionalBoxes([bus]);assert.equal(probe.blocked(exit,.5),false);assert.equal(probe.blocked({x:0,z:0},.5),true);
  world.add([{x:-5,z:-7},{x:-1.5,z:-7},{x:-1.5,z:0},{x:-5,z:0}]);
  for(let i=0;i<10;i++)assert.equal(curbsideExit(world,bus,3.5,.5,()=>0),undefined);
  assert.equal(world.boxes.length,0);
  const clear=new CollisionWorld();assert.equal(curbsideExit(clear,bus,3.5,.5,()=>0,[{...bus,center:{x:-3,z:-3.5}}]),undefined);
  clear.walkableAt=p=>p.x>-1.7;assert.equal(curbsideExit(clear,bus,3.5,.5,()=>0),undefined);
});
test("Exit validation follows rotated buses and rejects an unsafe cliff", () => {
  for(const yaw of [0,.8,Math.PI,-Math.PI/2]){
    const bus={center:{x:10,z:5},yaw,halfWidth:1.35,halfLength:4.7};const exit=curbsideExit(new CollisionWorld(),bus,3.5,.5,(x,z)=>x*.05+z*.05)!;
    assert.ok((exit.x-10)*Math.cos(yaw)+(exit.z-5)*Math.sin(yaw)<-1.8);
  }
  assert.equal(curbsideExit(new CollisionWorld(),{center:{x:0,z:0},yaw:0,halfWidth:1.35,halfLength:4.7},3.5,.5,x=>x < -2 ? -20:0),undefined);
});
const save={version:2,avatar:DEFAULT_AVATAR,region:"thrissur",area:"thrissur",position:{x:0,z:0},yaw:0,distance:10,visited:["thrissur"],discovered:[],savedAt:new Date().toISOString()};
test("Save rejects malformed transport checkpoints and incomplete cameras while preserving both avatars",()=>{
  assert.equal(validateSave({...save,cameraState:{}})?.cameraState,undefined);
  assert.equal(validateSave({...save,checkpoint:"last-bus-stop",safeLocation:{position:{x:0,z:0}}}),null);
  assert.equal(validateSave({...save,area:"../unknown"}),null);
  for(const gender of ["male","female"]){const restored=validateSave({...save,avatar:{...DEFAULT_AVATAR,gender},checkpoint:"last-transport-stop",safeLocation:{region:"ernakulam",area:"station-ernakulam",position:{x:2,z:3}}})!;assert.equal(restored.avatar.gender,gender);assert.deepEqual(restored.position,{x:2,z:3});}
});
test("Corrupt current save recovers a validated backup or legacy save",()=>{
  const data=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  data.set("kow.save.v1",JSON.stringify({...save,version:1}));data.set("kow.save.v2",JSON.stringify({version:2}));
  assert.equal(readSave()?.version,2);assert.ok(writeSave(save as any));assert.ok(writeSave({...save,distance:20} as any));
  data.set("kow.save.v2","{");assert.equal(readSave()?.distance,10);
});
test("Saved mappings recover duplicates and reserve arrow/WASD aliases",()=>{
  assert.deepEqual(sanitizeSettings({bindings:{interact:"ArrowUp"}}).bindings,DEFAULT_SETTINGS.bindings);
  assert.deepEqual(sanitizeSettings({bindings:{jump:"KeyF",interact:"KeyF"}}).bindings,DEFAULT_SETTINGS.bindings);
  assert.match(bindingConflict(DEFAULT_SETTINGS.bindings,"interact","KeyW")!,/reserved/);
  assert.equal(bindingConflict(DEFAULT_SETTINGS.bindings,"interact","KeyF"),undefined);
});
test("Base-aware asset URLs cannot escape a static deployment",()=>{
  assert.equal(dataUrl("regions.json","/kerala/"),"/kerala/data/regions.json");
  assert.throws(()=>dataUrl("../secrets.json"));assert.throws(()=>dataUrl("https://elsewhere/data.json"));
});
test("Data requests bound retries, reject malformed JSON and recover poisoned terrain cache",async()=>{
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async()=>{calls++;throw new TypeError("Offline");};
    await assert.rejects(loadTerrain("thrissur"));assert.equal(calls,2);
    globalThis.fetch=async input=>{calls++;return new Response(readFileSync(`public${String(input)}`,"utf8"),{status:200});};
    assert.ok(validTerrain((await loadTerrain("thrissur"))!));
    let attempts=0;globalThis.fetch=async()=>{attempts++;return new Response("{}",{status:503});};
    await assert.rejects(fetchJson("places.json"));assert.equal(attempts,2);
    globalThis.fetch=async()=>new Response("<html>",{status:200});await assert.rejects(fetchJson("places.json"),/not valid JSON/);
    globalThis.fetch=async()=>new Response("{}",{status:200});await assert.rejects(loadGeography(),/invalid structure/);
    globalThis.fetch=async input=>new Response(readFileSync(`public${String(input)}`,"utf8"),{status:200});
    assert.equal((await loadGeography()).regions.length,14);
    const [one,two]=await Promise.all([loadTile("thrissur"),loadTile("thrissur")]);assert.equal(one,two);assert.ok(one.terrain);
  }finally{globalThis.fetch=original;}
});
test("Vehicle acceleration and steering remain consistent across 30, 60 and variable frame intervals",()=>{
  const simulate=(steps:number[])=>{let speed=0,steer=0;for(const dt of steps){speed=vehicleThrottle(speed,1,0,false,false,dt);steer=smoothSteering(steer,1,speed,dt);}return {speed,steer};};
  const a=simulate(Array(300).fill(1/30)),b=simulate(Array(600).fill(1/60)),c=simulate(Array.from({length:400},(_,i)=>i%2?.01:.04));
  assert.ok(Math.abs(a.speed-b.speed)<.12&&Math.abs(a.speed-c.speed)<.12);assert.ok(Math.abs(a.steer-b.steer)<.03);
});
