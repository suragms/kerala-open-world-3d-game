import * as THREE from "three";
import type { BusStation, Vec2 } from "../types";
import { toLocal } from "../data/geography";
import { distance } from "./navigation";
import { disposeGroup, Human, bake, busStop } from "./assets";
import { stationModel } from "./busModels";
import type { World } from "./world";

export class BusStationManager {
  stations: { data: BusStation; point: Vec2; waiting: Vec2; yaw: number }[];
  loaded = new Map<string, THREE.Group>();
  private people = new Map<string, { human: Human; from: Vec2; to: Vec2; phase: number }[]>();
  constructor(public world: World, stations: BusStation[]) {
    this.stations = stations.map(data => {
      const point = toLocal(data.coordinate, world.tile.origin), nearest = world.network.nearest(point);
      const road = nearest && distance(nearest.point, point) < 80 ? nearest : undefined;
      const a = road?.road.points[road.index - 1], b = road?.road.points[road.index];
      const yaw = a && b ? Math.atan2(b.x - a.x, a.z - b.z) : 0;
      const start = road ? { x: road.point.x - Math.cos(yaw) * (road.road.width / 2 + 2), z: road.point.z - Math.sin(yaw) * (road.road.width / 2 + 2) } : point;
      const size = world.settings.quality === "low" ? 0.65 : 1;
      const base=world.height(point.x,point.z);
      if (Math.abs(point.x) < world.tile.radius && Math.abs(point.z) < world.tile.radius) world.collisions.add([
        {x:point.x-12.5*size,z:point.z+4*size}, {x:point.x+12.5*size,z:point.z+4*size},
        {x:point.x+12.5*size,z:point.z+8*size}, {x:point.x-12.5*size,z:point.z+8*size},
      ], false, base, base+5.5);
      return { data, point, yaw, waiting: world.collisions.closestValid(start, 0.65) ?? world.collisions.closestValid(point, 0.65) ?? point };
    }).filter(s => Math.abs(s.point.x) < world.tile.radius && Math.abs(s.point.z) < world.tile.radius);
  }
  nearby(position: Vec2, range = 22) {
    return this.stations.filter(s => distance(position, s.waiting) < range).sort((a,b) => distance(a.waiting, position) - distance(b.waiting, position))[0];
  }
  update(position: Vec2, dt: number, elapsed: number, door?: Vec2) {
    for (const station of this.stations) {
      const d = distance(position, station.point);
      if (d < 360 && !this.loaded.has(station.data.id)) {
        const group = new THREE.Group(), local = stationModel(station.data, this.world.settings.quality === "low");
        // Facility location is sourced; architectural layout is explicitly Level C.
        local.position.set(station.point.x, this.world.height(station.point.x, station.point.z), station.point.z);
        group.add(local);
        busStop(group, station.waiting.x, this.world.height(station.waiting.x, station.waiting.z), station.waiting.z);
        const people: { human: Human; from: Vec2; to: Vec2; phase: number }[] = [];
        for (let i = 0; i < (this.world.settings.quality === "low" ? 2 : 5); i++) {
          const size=this.world.settings.quality==="low"?.65:1;
          const from = this.world.collisions.closestValid(i===0?{x:station.point.x-8*size,z:station.point.z+1.9}:{ x: station.waiting.x + (i - 2) * 1.7, z: station.waiting.z + 2 }, 0.5);
          const to = from && this.world.collisions.closestValid({ x: from.x + 2, z: from.z + 4 }, 0.5);
          if (!from || !to || !this.world.collisions.segmentClear(from, to, 0.45)) continue;
          const human = new Human({ gender: i % 2 ? "female" : "male", skin: "#a96c48", shirt: ["#a47059", "#d8c894", "#5e8582"][i % 3], pants: "#434c40", shoes: "#302d27", hair: i % 2 ? "long" : "short" });
          human.root.position.set(from.x, this.world.height(from.x, from.z), from.z);
          group.add(human.root); people.push({ human, from, to, phase: i });
        }
        this.people.set(station.data.id, people);
        this.world.scene.add(group); this.loaded.set(station.data.id, group);
      } else if (d > 480 && this.loaded.has(station.data.id)) {
        disposeGroup(this.loaded.get(station.data.id)!); this.loaded.delete(station.data.id); this.people.delete(station.data.id);
      }
      for (const p of this.people.get(station.data.id) ?? []) {
        const phase = (elapsed + p.phase * 3) % 18, walking = phase < 5 || phase>=9 && phase<14;
        const target = door && distance(door, p.from) < 18 ? door : p.to;
        const t = phase<5?phase/5:phase<9?1:phase<14?1-(phase-9)/5:0;
        const desired = { x: p.from.x + (target.x - p.from.x) * t, z: p.from.z + (target.z - p.from.z) * t };
        const before=p.human.root.position,delta=distance(before,desired),step=Math.min(delta,Math.max(0,dt)*1.1);
        const bounded=delta?{x:before.x+(desired.x-before.x)*step/delta,z:before.z+(desired.z-before.z)*step/delta}:desired;
        const next = this.world.collisions.move(before, bounded, 0.45),moved=distance(before,next);
        p.human.root.position.set(next.x, this.world.height(next.x, next.z), next.z);
        p.human.root.rotation.y = Math.atan2(target.x - p.from.x, target.z - p.from.z);
        p.human.animate(elapsed, walking && dt>0 ? moved/dt : 0, 0, 0);
        if(p.phase===0 && phase>=14 && !door){
          p.human.leftLeg.rotation.x=p.human.rightLeg.rotation.x=-1.3;
          p.human.leftKnee.rotation.x=p.human.rightKnee.rotation.x=1.3;
          p.human.root.position.y-=.02;
        }
      }
    }
    void dt;
  }
  dispose() { for (const g of this.loaded.values()) disposeGroup(g); this.loaded.clear(); this.people.clear(); }
}
