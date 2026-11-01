import * as THREE from "three";
import type { Theme } from "../types";
import { box,cylinder,material,palette,roof } from "./assets";

/** Reference-informed silhouettes only. Dimensions and architectural details remain Level C. */
export function addRegionalLandmarkDetail(group:THREE.Group,theme:Theme,name:string) {
  const lower=name.toLowerCase();
  if(theme==="temple"&&/vadakk|vadak|vadakkumn/.test(lower)){
    for(const [x,z,yaw]of [[0,-10,Math.PI],[-11.5,-1,-Math.PI/2],[11.5,-1,Math.PI/2]]){
      const gate=new THREE.Group();gate.position.set(x,0,z);gate.rotation.y=yaw;
      for(let i=0;i<2;i++){
        box(gate,i?palette.wood:palette.wall,0,1.4+i*2.6,0,4.6-i,2.6,3.2-i*.5);
        roof(gate,0,2.7+i*2.6,0,6-i*1.2,4.4-i*.5,1.1);
      }
      box(gate,palette.dark,0,1.25,1.63,1.6,2.2,.05);group.add(gate);
    }
    group.userData.architecturalReference="Four cardinal gateways; Incredible India. Approximate Level C exterior.";
  }
  if(theme==="fort"&&lower.includes("bekal")){
    const stone=material("#956344");cylinder(group,stone,0,3.6,-1,3.4,7.2);
    for(let i=0;i<10;i++)box(group,stone,0,.15+i*.32,10-i*.8,3,.3,1);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box(group,stone,Math.cos(a)*3.25,7.5,-1+Math.sin(a)*3.25,.6,.8,.6);}
    group.userData.architecturalReference="Observation tower and broad steps; Kerala Tourism. Approximate Level C exterior.";
  }
  if(theme==="fort"&&lower.includes("palakkad")){
    const water=material("#5f8b80",.28),edge=material("#747b70");
    for(const x of [-26,26]){box(group,water,x,.025,0,4,.04,34);box(group,edge,x+Math.sign(x)*2.2,.15,0,.35,.3,35);}
    box(group,water,0,.025,-16,55,.04,4);box(group,water,0,.025,18,55,.04,4);
    box(group,palette.wood,0,.12,18,4,.25,5.5);
    group.userData.architecturalReference="Granite enclosure, moat and entrance bridge; Kerala Tourism. Approximate Level C exterior.";
  }
}
export function landmarkSolidBounds(theme:Theme) {
  if(theme==="fort")return {halfWidth:30,near:-19,far:21};
  if(theme==="airport")return {halfWidth:48,near:-18,far:18};
  if(theme==="mall")return {halfWidth:33,near:-21,far:21};
  if(theme==="station")return {halfWidth:30,near:-8,far:8};
  if(theme==="stadium")return {halfWidth:51,near:-41,far:41};
  return {halfWidth:15,near:-14,far:12};
}
