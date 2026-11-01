import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {TrafficManager} from "../src/game/traffic";
import {LaneMotion,trafficBody,trafficConnections,trafficNodeKey,CorridorReservation} from "../src/game/trafficLogic";
import {CollisionWorld,RoadNetwork,distance,type Road} from "../src/game/navigation";
import {VehicleModel,disposeGroup} from "../src/game/assets";
import {DEFAULT_SETTINGS} from "../src/types";
import type {World} from "../src/game/world";

const road=(id:number,points:{x:number;z:number}[]):Road=>({id,points,width:10,name:"Fixture",kind:"primary",oneway:false});
function fixture(roads:Road[],prepare?:(world:CollisionWorld)=>void){
  const collisions=new CollisionWorld();prepare?.(collisions);
  const world={scene:new THREE.Scene(),settings:DEFAULT_SETTINGS,region:{id:"thrissur",theme:"temple"},roads,
    spawn:{x:300,z:300},localFeatures:[],collisions,network:new RoadNetwork(roads),railways:[],metroTracks:[],
    busStopPositions:[],tile:{features:[]},height:()=>0} as unknown as World;
  const traffic=new TrafficManager(world),initialPedestrians=traffic.pedestrians;traffic.pedestrians=[];traffic.agents=[];
  const add=(r:Road,metres:number,direction=1)=>{
    const model=new VehicleModel("Hatchback"),motion=new LaneMotion(r,metres,direction,trafficBody("Hatchback"));
    const agent={road:r,segment:1,t:0,speed:7,direction,model,motion};traffic.agents.push(agent);traffic.root.add(model.root);return agent;
  };
  return {traffic,world,add,initialPedestrians};
}
test("Traffic continues through a shared sourced junction with bounded movement",()=>{
  const a=road(1,[{x:0,z:0},{x:0,z:-80},{x:0,z:-150}]),b=road(2,[{x:0,z:-150},{x:20,z:-190},{x:50,z:-230}]);
  const {traffic,add}=fixture([a,b]),agent=add(a,149.5);let previous={...agent.motion.position};
  for(let i=0;i<300;i++){traffic.update(1/30,i/30,{x:300,z:300});assert.ok(distance(previous,agent.motion.position)<.3);previous={...agent.motion.position};}
  assert.equal(agent.road,b);assert.ok(agent.motion.metres>15);disposeGroup(traffic.root);
});
test("A close parallel endpoint does not fabricate a traffic connection",()=>{
  const a=road(1,[{x:0,z:0},{x:0,z:-80},{x:0,z:-150}]),b=road(2,[{x:.1,z:-150},{x:.1,z:-190},{x:.1,z:-230}]);
  const {traffic,add}=fixture([a,b]),agent=add(a,145);
  for(let i=0;i<900;i++)traffic.update(1/30,i/30,{x:300,z:300});
  assert.equal(agent.road,a);assert.ok(agent.motion.metres<150);assert.equal(agent.motion.speed,0);disposeGroup(traffic.root);
});
test("Only explicitly derived duplicate source geometry receives a bounded rounding allowance",()=>{
  const a=road(1,[{x:0,z:0},{x:0,z:-80},{x:0,z:-150}]),b={...road(2,[{x:.04,z:-150.03},{x:20,z:-190},{x:50,z:-230}]),derived:true};
  const links=trafficConnections([a,b]);assert.ok(links.get(trafficNodeKey(a.points.at(-1)!))!.some(c=>c.road===b));
  b.layer="bridge";assert.ok(!trafficConnections([a,b]).get(trafficNodeKey(a.points.at(-1)!))!.some(c=>c.road===b));
  b.layer="ground";b.points[0].x=.3;assert.ok(!trafficConnections([a,b]).get(trafficNodeKey(a.points.at(-1)!))!.some(c=>c.road===b));
});
test("Following traffic brakes behind a vehicle stopped by a solid footprint",()=>{
  const r=road(1,[{x:0,z:0},{x:0,z:-80},{x:0,z:-180}]);
  const {traffic,world,add}=fixture([r]),lead=add(r,80),follower=add(r,57);
  world.collisions.add([{x:-5,z:-88},{x:1,z:-88},{x:1,z:-90},{x:-5,z:-90}]);
  for(let i=0;i<900;i++)traffic.update(1/30,i/30,{x:300,z:300});
  assert.ok(distance(lead.motion.position,follower.motion.position)>4.5);
  assert.equal(follower.motion.speed,0);assert.ok(["following","blocked"].includes(follower.motion.phase));disposeGroup(traffic.root);
});
test("Full Journey priority keeps crossing traffic outside the bus envelope without a bypass",()=>{
  const r=road(1,[{x:-40,z:-50},{x:0,z:-50},{x:40,z:-50}]);
  const {traffic,world,add}=fixture([r]),car=add(r,10),reservation=new CorridorReservation([{x:0,z:0},{x:0,z:-100}]);
  for(let i=0;i<600;i++){
    world.collisions.boxes=reservation.near(car.motion.position);
    traffic.update(1/30,i/30,{x:300,z:300});
  }
  assert.ok(car.motion.position.x+car.motion.body.halfLength< -7,JSON.stringify(car.motion.position));assert.equal(car.motion.speed,0);assert.equal(car.motion.phase,"blocked");
  const remote=reservation.near({x:1000,z:1000});assert.equal(remote.length,0);disposeGroup(traffic.root);
});
test("Pedestrians only spawn on paths whose entire walking segment is clear",()=>{
  const r=road(1,[{x:0,z:0},{x:0,z:-80},{x:0,z:-180}]);
  const {traffic,world,initialPedestrians}=fixture([r],c=>{
    for(const z of [-40,-130])c.add([{x:5,z:z-15},{x:9,z:z-15},{x:9,z:z+15},{x:5,z:z+15}]);
  });
  assert.ok(initialPedestrians.length>0);
  for(const p of initialPedestrians)assert.ok(world.collisions.segmentClear(p.a,p.b,.45),"An NPC path crosses a building despite clear endpoints");
  disposeGroup(traffic.root);
});
