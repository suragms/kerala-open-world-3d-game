import * as THREE from "three";
import type { GeoFeature, Settings, Vec2 } from "../types";
import { box, material, mesh, palette, roof } from "./assets";
import { facadeSlots, footprintFrame, type RegionalProfile } from "./regional";

/** Source polygons remain intact; roofs, shades and facades are approximate Level C detail. */
export function buildingExterior(group:THREE.Group,source:GeoFeature,points:Vec2[],center:Vec2,profile:RegionalProfile,
  quality:Settings["quality"],height:(x:number,z:number)=>number) {
  const frame=footprintFrame(points);if(frame.width<1||frame.depth<1||frame.width>100||frame.depth>100)return;
  const tags=source.tags,seed=Math.abs(source.id),levels=Math.max(1,Math.min(7,Number(tags["building:levels"])||1+seed%2));
  const elevations=points.map(p=>height(p.x,p.z)),base=Math.min(...elevations),top=Math.max(...elevations);
  const buildingHeight=Math.max(2,Number.isFinite(Number(tags.height)) && Number(tags.height)>0 ? Number(tags.height) : levels*3.2)+top-base;
  const shape=new THREE.Shape(frame.ring.map(p=>new THREE.Vector2(p.x-center.x,-p.z+center.z)));
  const walls=new THREE.ExtrudeGeometry(shape,{depth:buildingHeight,bevelEnabled:false});walls.rotateX(-Math.PI/2);
  mesh(group,walls,material(profile.walls[seed%profile.walls.length]),center.x,base,center.z);
  const pitched=frame.rectangularity>.9&&frame.width<32&&frame.depth<35&&levels<=3;
  if(pitched){
    const r=roof(group,frame.center.x,base+buildingHeight,frame.center.z,frame.width+.8,frame.depth+.8,Math.min(3,Math.min(frame.width,frame.depth)*.3),material(profile.roof));
    r.rotation.y=frame.yaw;
  }else{
    const topGeo=new THREE.ShapeGeometry(shape);topGeo.rotateX(-Math.PI/2);
    mesh(group,topGeo,palette.wall,center.x,base+buildingHeight+.025,center.z);
  }
  const budget=quality==="low"?4:quality==="medium"?16:quality==="high"?24:40;
  for(const slot of facadeSlots(points,levels,budget)){
    const surround=box(group,palette.wood,slot.point.x,top+slot.y,slot.point.z,1.12,1.35,.07);surround.rotation.y=slot.yaw;
    const nx=Math.sin(slot.yaw),nz=Math.cos(slot.yaw);
    const pane=box(group,material(seed%3?"#526b66":"#607d7a",.3,.1),slot.point.x+nx*.045,top+slot.y,slot.point.z+nz*.045,.91,1.12,.025);pane.rotation.y=slot.yaw;
    if(quality!=="low"){
      const shade=box(group,palette.wall,slot.point.x+nx*.24,top+slot.y+.78,slot.point.z+nz*.24,1.5,.1,.62);shade.rotation.y=slot.yaw;
    }
  }
  if((tags.shop||tags.building==="retail")&&quality!=="low"){
    const slot=facadeSlots(points,1,1)[0];if(slot){
      const awning=box(group,material(seed%2?"#b07a48":"#547f72"),slot.point.x+Math.sin(slot.yaw)*.65,top+2.7,slot.point.z+Math.cos(slot.yaw)*.65,2.4,.12,1.3);awning.rotation.y=slot.yaw;
      const shutter=box(group,material("#6c807b"),slot.point.x,top+1.1,slot.point.z,1.8,2.1,.08);shutter.rotation.y=slot.yaw;
    }
  }
}
