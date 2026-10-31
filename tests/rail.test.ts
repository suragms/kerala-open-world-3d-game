import {test} from "node:test";
import assert from "node:assert/strict";
import {RailShuttle,TRAIN_CAMERAS} from "../src/game/rail";

test("A requested rail stop waits at a mapped station, never at a track reversal",()=>{
  const rail=new RailShuttle([{x:0,z:0},{x:0,z:-500}],[{point:{x:5,z:-200},name:"Mapped station"}]);
  for(let i=0;i<3000&&!rail.atStation;i++)rail.update(1/30);
  assert.ok(rail.atStation);assert.equal(rail.speed,0);
  for(let i=0;i<600;i++)rail.update(1/30);
  rail.held=true;
  let departed=false,returned=false;
  for(let i=0;i<15000;i++){rail.update(1/30);if(rail.speed>1)departed=true;if(departed&&rail.atStation){returned=true;break;}}
  assert.ok(returned);
  const stop=rail.distance;
  for(let i=0;i<3000;i++)rail.update(1/30);
  assert.equal(rail.distance,stop);assert.equal(rail.speed,0);assert.ok(rail.atStation);
  assert.equal(new Set(TRAIN_CAMERAS).size,3);
});

test("A station-free rail segment never offers passenger boarding",()=>{
  const rail=new RailShuttle([{x:0,z:0},{x:0,z:-500}],[]);
  assert.equal(rail.boardingPoint,undefined);
  for(let i=0;i<6000;i++){rail.update(1/30);assert.equal(rail.atStation,false);}
});
