import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GameEngine } from "../src/game/engine";
import { CollisionWorld } from "../src/game/navigation";
import { DEFAULT_SETTINGS } from "../src/types";

test("Explicit blocked-exit recovery avoids a vehicle that occupies the saved checkpoint",()=>{
  // Exercise the engine transition without constructing WebGL or a browser.
  const game=Object.create(GameEngine.prototype) as any,collisions=new CollisionWorld();
  const trafficRoot=new THREE.Group();trafficRoot.position.set(-8,0,0);trafficRoot.visible=false;
  const bus={attached:true,phase:"arrived",pose:{x:0,z:0,yaw:0},plan:{type:"public"},target:{name:"Test stop",district:"thrissur"},
    get canExit(){return this.attached;},exit(){this.attached=false;this.phase="exited";return true;},
    record:()=>({route:"test",to:"Test stop",from:"Origin",distance:100,seconds:10,completed:true,mode:"full",completedAt:"2026-10-31"})};
  let released=0;
  Object.assign(game,{bus,world:{collisions,height:()=>0,tile:{id:"corridor-test",origin:[76,10]}},
    traffic:{clearReservation(){released++;},agents:[{model:{root:trafficRoot,kind:"Hatchback"}}]},safeLocation:{area:"corridor-test",region:"thrissur",position:{x:-8,z:0}},
    player:{root:new THREE.Group(),dimensions:{radius:.35}},position:{x:0,z:0},journeys:[],travelled:0,visited:[],
    cameraTarget:new THREE.Vector3(),settings:{...DEFAULT_SETTINGS,gamepadVibration:false},input:{clear(){},setContext(){}},
    callbacks:{notice(){},action(){}},safeBusExit:()=>undefined,updateVehicleColliders(){},cancelWalk(){},emitSnapshot(){}});
  game.exitBus(true);
  const probe=collisions.withAdditionalBoxes([{center:trafficRoot.position,yaw:0,halfWidth:1.13,halfLength:2.25}]);
  assert.equal(probe.blocked(game.position,.47),false,"Recovery spawned inside a moving traffic vehicle");
  assert.equal(game.journeys.length,1);game.exitBus(true);assert.equal(game.journeys.length,1);
  assert.equal(released,1,"Exit must release the traffic corridor exactly once");
});
