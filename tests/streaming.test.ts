import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World } from "../src/game/world";
import { bakeSteps, disposeGroup } from "../src/game/assets";
import { DEFAULT_SETTINGS } from "../src/types";

function fixture() {
  const world=Object.create(World.prototype) as World;
  Object.assign(world,{tile:{id:"test"},settings:DEFAULT_SETTINGS,root:new THREE.Group(),chunks:new Map(),streetlights:new Map(),
    chunkBusStops:new Map(),wanted:new Set(),queue:[],lastChunk:"",lastLookahead:"",createdChunks:0,disposedChunks:0,cancelledChunks:0,maxChunkMilliseconds:0,maxSliceMilliseconds:0,completedCpu:[],stageMilliseconds:{},collisions:{indexMilliseconds:0}});
  (world as any).createChunk=function*(key:string,group:THREE.Group){for(let i=0;i<700;i++)yield;world.chunks.set(key,group);world.root.add(group);};
  return world;
}
test("Lookahead refreshes inside the same chunk and queued work stays bounded",()=>{
  const world=fixture();world.updateStreaming({x:0,z:0},false,{x:700,z:0});
  assert.ok(world.streamingStats().wanted.includes("4,0"));
  world.updateStreaming({x:0,z:0},false,{x:-700,z:0});
  assert.ok(world.streamingStats().wanted.includes("-5,0"));assert.ok(!world.streamingStats().wanted.includes("4,0"));
  assert.ok(world.streamingStats().queued<=34);
});
test("Streaming cancels incomplete work on relocation and disposes loaded chunks",()=>{
  const world=fixture();world.updateStreaming({x:0,z:0});assert.ok(world.streamingStats().building);
  world.updateStreaming({x:3000,z:0});assert.equal(world.streamingStats().cancelled,1);
  for(let i=0;i<110;i++)world.updateStreaming({x:3000,z:0});
  assert.equal(world.chunks.size,25);assert.equal(world.streamingStats().queued,0);
  const old=[...world.chunks.values()];world.updateStreaming({x:0,z:3000});assert.equal(world.chunks.size,0);assert.ok(old.every(g=>g.parent===null));
  assert.equal(world.streamingStats().disposed,25);
});
test("Interrupted geometry baking disposes scratch buffers without harming shared originals",()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),mat=new THREE.MeshStandardMaterial();mat.userData.transient=true;
  for(let i=0;i<20;i++)root.add(new THREE.Mesh(geometry,mat));
  const work=bakeSteps(root);for(let i=0;i<12;i++)work.next();work.return(undefined);
  assert.equal(root.children.length,20);disposeGroup(root);assert.equal(root.parent,null);
});
