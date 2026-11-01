import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {bakeSteps,disposeGroup} from "../src/game/assets";
import {StateRouter,collisionBoxesOverlap} from "../src/game/navigation";
import {PassengerJourney} from "../src/game/bus";
import {safeApproachSpeed} from "../src/game/trafficLogic";
import {validateSave} from "../src/game/save";
import {vehicleThrottle,vehicleAttitude} from "../src/game/vehicle";
import {DEFAULT_AVATAR,type StateNetwork,type BusPlan} from "../src/types";

test("Route preview preserves the sourced bend, separates access and rejects disconnected modes",()=>{
  const points:[number,number][]=[[76,10],[76.01,10.01],[76.02,10]];
  const network:StateNetwork={source:"fixture",license:"fixture",features:[{id:1,kind:"road",name:"bend",ref:"",points}]};
  const result=new StateRouter(network).estimate([75.999,10],points[2]);
  assert.deepEqual(result.path,points);assert.deepEqual(result.access?.[0],[[75.999,10],points[0]]);
  assert.equal(new StateRouter(network,"rail").estimate(points[0],points[2]).path,undefined);
});
test("Material baking yields bounded batches without dropping transformed triangles",()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),mat=new THREE.MeshStandardMaterial();mat.userData.transient=true;
  for(let i=0;i<1900;i++){const m=new THREE.Mesh(geometry,mat);m.position.x=i;root.add(m);}
  const steps=bakeSteps(root);let yields=0;for(const _ of steps)yields++;
  const meshes=root.children.filter((m):m is THREE.Mesh=>m instanceof THREE.Mesh);
  assert.ok(yields>1900);assert.equal(meshes.length,2);
  assert.equal(meshes.reduce((n,m)=>n+m.geometry.getAttribute("position").count,0),1900*36);
  assert.ok(meshes.every(m=>m.geometry.getAttribute("position").count<=60000));
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);assert.equal(bounds.max.x,1899.5);
  disposeGroup(root);
});
test("Reverse selection brakes forward motion before changing direction; braking wins over acceleration",()=>{
  let speed=10;
  speed=vehicleThrottle(speed,1,0,true,false,.1);assert.ok(speed>0&&speed<10);
  assert.ok(vehicleThrottle(10,1,1,false,false,.1)<vehicleThrottle(10,0,0,false,false,.1));
  for(let i=0;i<100;i++)speed=vehicleThrottle(speed,1,0,true,false,.1);assert.ok(speed<0&&speed>=-7);
  const a=vehicleAttitude(0,0,2,-2,10,false,.016);assert.ok(a.pitch>0&&a.pitch<.32&&a.roll<0&&a.roll>-.22);
});
test("Checkpoint names survive validated restoration and malformed labels are discarded",()=>{
  const base={version:2,avatar:DEFAULT_AVATAR,region:"thrissur",area:"thrissur",position:{x:0,z:0},yaw:0,distance:0,visited:[],discovered:[],savedAt:"test",locality:"Thrissur"};
  const restored=validateSave({...base,checkpoint:"last-bus-stop",safeLocation:{region:"thrissur",area:"corridor-thrissur-guruvayur",position:{x:10,z:12},name:"Guruvayur KSRTC"}})!;
  assert.equal(restored.locality,"Guruvayur KSRTC");assert.deepEqual(restored.position,{x:10,z:12});
  assert.equal(validateSave({...base,locality:"bad\u0000name"})?.locality,undefined);
});
test("Predictive bus braking stops before a red line and accelerates after its release",()=>{
  const registry=JSON.parse(readFileSync("public/data/bus-services.json","utf8")),service=registry.routes.find((s:any)=>s.id==="thrissur-guruvayur");
  const plan:BusPlan={route:JSON.parse(readFileSync(`public/data/${service.file}`,"utf8")),stations:[service.from,service.to].map(id=>registry.stations.find((s:any)=>s.id===id)),type:"public"};
  const bus=new PassengerJourney(plan,plan.stations[0].coordinate);bus.phase="travelling";bus.attached=true;bus.seat=0;bus.stopIndex=1;bus.travelled=1000;bus.speed=13;
  const line=1080;
  for(let i=0;i<900;i++){bus.update(1/30,false,false,safeApproachSpeed(line-bus.travelled-6,0,2));assert.ok(bus.travelled<line-5.5);}
  assert.ok(bus.speed<.02);const stopped=bus.travelled;bus.update(10);assert.ok(bus.travelled>stopped+10);
});
test("Traffic outside a turning bus path is not mistaken for a blocked lane",()=>{
  const bus={center:{x:0,z:0},yaw:0,halfWidth:1.45,halfLength:5.4};
  const adjacent={center:{x:3,z:-7},yaw:1.2,halfWidth:.48,halfLength:1.18};
  assert.equal(collisionBoxesOverlap(bus,adjacent),false);
  assert.equal(collisionBoxesOverlap(bus,{...adjacent,center:{x:0,z:-3}}),true);
});
