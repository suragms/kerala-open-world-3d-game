import { test } from "node:test";
import assert from "node:assert/strict";
import { TrafficStopDwell } from "../src/game/trafficStops";

test("Background bus dwell expires once without endlessly restarting at the same stop",()=>{
  const dwell=new TrafficStopDwell(),bus={};
  assert.equal(dwell.waiting(bus,"road-1:2:forward",false,0),false);
  assert.equal(dwell.waiting(bus,"road-1:2:forward",true,1),true);
  assert.equal(dwell.waiting(bus,"road-1:2:forward",true,4.9),true);
  for(let time=5;time<30;time++)assert.equal(dwell.waiting(bus,"road-1:2:forward",true,time),false);
  assert.equal(dwell.waiting(bus,"road-1:3:forward",false,30),false);
  assert.equal(dwell.waiting(bus,"road-1:2:forward",true,35),true);
  assert.equal(dwell.waiting({},"road-1:2:forward",true,35),true);
});
