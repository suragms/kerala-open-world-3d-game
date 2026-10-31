import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { sampleTerrain, validTerrain } from "../src/game/terrain";
import type { TerrainGrid } from "../src/types";

const field:TerrainGrid={origin:[76,10],minX:-80,minZ:-80,width:3,height:3,step:80,scale:10,
  values:[100,500,80,400,700,150,10,600,200],source:"Deterministic test field",reference:"test",attribution:"test",retrieved:"2026-10-23",processing:"test",sourceResolutionMetres:30.9};
test("Terrain interpolation uses finite metre heights and rejects points outside its sourced coverage",()=>{
  assert.ok(validTerrain(field));assert.equal(sampleTerrain(field,-80,-80),10);assert.equal(sampleTerrain(field,0,0),70);
  assert.equal(sampleTerrain(field,81,0),undefined);assert.equal(sampleTerrain(field,NaN,0),undefined);
  assert.equal(validTerrain({...field,width:4}),false);assert.equal(validTerrain({...field,values:[NaN,...field.values.slice(1)]}),false);
});
test("Physics terrain heights match actual rendered ground triangles",()=>{
  const geometry=new THREE.PlaneGeometry(160,160,4,4);geometry.rotateX(-Math.PI/2);
  const vertices=geometry.getAttribute("position");
  for(let i=0;i<vertices.count;i++)vertices.setY(i,sampleTerrain(field,vertices.getX(i),vertices.getZ(i))!);
  geometry.computeVertexNormals();const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ground=new THREE.Mesh(geometry,material);ground.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let x=-75;x<80;x+=17)for(let z=-75;z<80;z+=19){ray.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(ground)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-sampleTerrain(field,x,z)!)<.00001);}
  geometry.dispose();material.dispose();
});
test("All imported local scenes and bus corridors retain attributed, valid geographic elevation grids",()=>{
  const index=JSON.parse(readFileSync("public/data/terrain-index.json","utf8"));
  assert.ok(Object.keys(index.areas).length>=44);
  for(const [id,record] of Object.entries(index.areas) as [string,{file:string}][]){
    const grid=JSON.parse(readFileSync(`public/data/${record.file}`,"utf8")) as TerrainGrid;
    assert.ok(validTerrain(grid),id);assert.ok(grid.reference.startsWith("https://registry.opendata.aws/"));assert.ok(grid.processing.includes("No vertical exaggeration"));
    if(!id.startsWith("corridor-")){const tile=JSON.parse(readFileSync(`public/data/${id}.json`,"utf8"));assert.deepEqual(grid.origin,tile.origin,id);}
  }
  const munnar=JSON.parse(readFileSync("public/data/elevation-idukki.json","utf8")) as TerrainGrid;
  const wayanad=JSON.parse(readFileSync("public/data/elevation-wayanad.json","utf8")) as TerrainGrid;
  assert.ok(sampleTerrain(munnar,0,0)!>1400);assert.ok(sampleTerrain(wayanad,0,0)!>700);
});
