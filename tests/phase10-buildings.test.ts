import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import * as THREE from "three";
import {buildingExterior} from "../src/game/buildings";
import {REGIONAL_PROFILES} from "../src/game/regional";
import {disposeGroup} from "../src/game/assets";
import {toLocal} from "../src/data/geography";
import type {GeoFeature} from "../src/types";

test("Imported building exteriors contain finite positions and transforms",()=>{
  const seen=new Set<string>();let checked=0;
  for(const file of readdirSync("public/data").filter(p=>p.endsWith(".json"))){
    const data=JSON.parse(readFileSync(`public/data/${file}`,"utf8"));
    if(!Array.isArray(data.features))continue;
    for(const feature of data.features as GeoFeature[]){
      if(!feature.tags?.building||!feature.points?.length)continue;
      const key=JSON.stringify([feature.type,feature.id,feature.points]);if(seen.has(key))continue;seen.add(key);
      const points=feature.points.map(p=>toLocal(p,[76,10])),center={x:points.reduce((n,p)=>n+p.x,0)/points.length,z:points.reduce((n,p)=>n+p.z,0)/points.length};
      const group=new THREE.Group();buildingExterior(group,feature,points,center,REGIONAL_PROFILES.thrissur,"medium",()=>0);
      group.traverse(o=>{if(o instanceof THREE.Mesh){
        assert.ok([...o.geometry.getAttribute("position").array].every(Number.isFinite),`${file} ${feature.id} has invalid vertices`);
        assert.ok([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite),`${file} ${feature.id} has invalid transform`);
      }});
      disposeGroup(group);checked++;
    }
  }
  assert.ok(checked>1000);
});
