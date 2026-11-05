import { test } from "node:test";
import assert from "node:assert/strict";
import { CollisionWorld, type Road } from "../src/game/navigation";
import { LaneMotion, lanePose, safeApproachSpeed, trafficBody, crossingClear } from "../src/game/trafficLogic";
const road:Road={id:1,name:"Fixture road",kind:"residential",width:7,oneway:false,points:[{x:0,z:0},{x:0,z:-40},{x:0,z:-80}]};
test("Traffic occupies the left lane in both directions",()=>{assert.ok(lanePose(road,20,1).x<0);assert.ok(lanePose(road,20,-1).x>0);});
test("Traffic stops at a source endpoint without wrapping or teleporting",()=>{
  const car=new LaneMotion(road,60,1,trafficBody("Hatchback"));const world=new CollisionWorld();let previous=car.position;
  for(let i=0;i<1500;i++){car.update(1/30,8,world);assert.ok(Math.hypot(car.position.x-previous.x,car.position.z-previous.z)<=8/30+.01);previous={...car.position};}
  assert.ok(car.metres>79&&car.metres<=80);assert.equal(car.speed,0);
});
test("Swept traffic bodies cannot cross buildings or blocked water",()=>{
  const world=new CollisionWorld();world.add([{x:-8,z:-25},{x:8,z:-25},{x:8,z:-26},{x:-8,z:-26}]);
  const car=new LaneMotion(road,5,1,trafficBody("Truck"));for(let i=0;i<500;i++)car.update(1/30,10,world);
  assert.ok(car.position.z>-22);assert.equal(car.phase,"blocked");
  const water=new CollisionWorld();water.waterAt=p=>p.z< -25;
  const second=new LaneMotion(road,5,1,trafficBody("Bus"));for(let i=0;i<500;i++)second.update(1/30,10,water);assert.ok(second.position.z> -21);
});
test("Approach speeds respect braking distance and pedestrians wait for approaching traffic",()=>{
  assert.equal(safeApproachSpeed(0),0);assert.ok(safeApproachSpeed(10)<safeApproachSpeed(40));
  const car={position:{x:0,z:0},yaw:0,speed:10,body:trafficBody("Hatchback")};
  assert.equal(crossingClear({x:0,z:-20},[car]),false);assert.equal(crossingClear({x:0,z:10},[car]),true);
  assert.equal(crossingClear({x:0,z:-20},[{...car,speed:0}]),true);
});
