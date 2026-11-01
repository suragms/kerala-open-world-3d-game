import { test } from "node:test";
import assert from "node:assert/strict";
import { REGIONAL_PROFILES, facadeSlots, footprintFrame, regionalPlant } from "../src/game/regional";
import { AdaptiveResolution } from "../src/game/performance";
import { insideRing } from "../src/data/geography";

test("Every district has bounded, explicitly procedural regional art direction",()=>{
  assert.equal(Object.keys(REGIONAL_PROFILES).length,14);
  for(const profile of Object.values(REGIONAL_PROFILES)){assert.ok(profile.plants.length);assert.ok(profile.walls.every(c=>/^#[0-9a-f]{6}$/i.test(c)));}
  assert.equal(regionalPlant(REGIONAL_PROFILES.kottayam,0),"rubber");
  assert.equal(regionalPlant(REGIONAL_PROFILES.kollam,.1,{crop:"tea"}),"tea");
});
test("Windows follow actual rotated and concave building edges in either winding",()=>{
  for(const points of [[{x:0,z:8},{x:8,z:0},{x:16,z:8},{x:8,z:16}], [{x:0,z:0},{x:14,z:0},{x:14,z:5},{x:5,z:5},{x:5,z:14},{x:0,z:14}]])for(const ring of [points,[...points].reverse()]){
    const slots=facadeSlots([...ring,ring[0]],3,16);assert.ok(slots.length>0&&slots.length<=16);
    for(const slot of slots){assert.equal(insideRing([slot.point.x,slot.point.z],ring.map(p=>[p.x,p.z])),false);assert.ok(Number.isFinite(slot.yaw));}
  }
});
test("Oriented roof frames preserve a rotated rectangular footprint",()=>{
  const ring=[{x:0,z:5},{x:5,z:0},{x:15,z:10},{x:10,z:15}];const frame=footprintFrame(ring);
  assert.ok(Math.abs(frame.rectangularity-1)<.000001);assert.ok(Math.abs(frame.area-100)<.000001);
});
test("Adaptive resolution responds to sustained load and recovers gradually",()=>{
  const adaptive=new AdaptiveResolution();
  for(let i=0;i<600;i++)adaptive.update(40,.04,true);assert.equal(adaptive.scale,.65);
  for(let i=0;i<3600;i++)adaptive.update(16.67,1/60,true);assert.equal(adaptive.scale,1);
  adaptive.update(NaN,1/60,true);assert.equal(adaptive.scale,1);
  for(let i=0;i<240;i++)adaptive.update(40,.04,true);assert.ok(adaptive.scale<1);adaptive.update(40,.04,false);assert.equal(adaptive.scale,1);
});
