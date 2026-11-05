import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {World} from "../src/game/world";
import {PassengerBusModel,seatPosition} from "../src/game/busModels";
import {DEFAULT_SETTINGS,type BusType} from "../src/types";
import {disposeGroup} from "../src/game/assets";

test("Zero-length source road edges cannot create nonfinite street furniture",()=>{
  const world=Object.create(World.prototype) as any,group=new THREE.Group();
  Object.assign(world,{region:{id:"thrissur"},tile:{origin:[76,10]},root:new THREE.Group(),settings:{...DEFAULT_SETTINGS,quality:"low"},
    featureChunks:new Map([["0,0",[{source:{type:"way",id:1,tags:{highway:"primary"}},points:[{x:0,z:0},{x:0,z:0}],center:{x:0,z:0}}]]]),
    collisions:{blocked:()=>true},height:()=>0,network:{nearest:()=>undefined},landmarkPosition:{x:0,z:0},
    streetlights:new Map(),chunks:new Map(),chunkBusStops:new Map(),createdChunks:0});
  for(const _ of world.createChunk("0,0",group)){}
  group.traverse(o=>{if(o instanceof THREE.Mesh)assert.ok([...o.geometry.getAttribute("position").array].every(Number.isFinite));});
  assert.deepEqual(world.streetlights.get("0,0"),[]);disposeGroup(group);
});
test("Every passenger bus has an open side-window ray from the first seat",()=>{
  const context=new Proxy({}, {get:()=>()=>{}});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
  for(const type of ["public","private","fast","mini","coach"] as BusType[]){
    const bus=new PassengerBusModel(type,"Fixture destination",true);bus.root.updateMatrixWorld(true);
    const origin=bus.chassis.root.localToWorld(new THREE.Vector3(-1.12,2.48,seatPosition(0).z));
    const ray=new THREE.Raycaster(origin,new THREE.Vector3(-1,0,0),0,.5);
    assert.equal(ray.intersectObject(bus.root,true).length,0,`${type} has opaque geometry across its window`);disposeGroup(bus.root);
  }
});
