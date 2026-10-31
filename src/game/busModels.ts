import * as THREE from "three";
import type { BusStation, BusType } from "../types";
import { bake, box, cylinder, material, palette, roof, sign, VehicleModel, Human, disposeGroup } from "./assets";
import { BUS_SPECS, busScale } from "./busSpecs";

/** Original Kerala-inspired body, open window apertures and a usable passenger interior. */
export class PassengerBusModel {
  root = new THREE.Group();
  door = new THREE.Group();
  chassis: VehicleModel;
  passengers: { root: THREE.Group; sitting: THREE.Group; walker: Human; seat: number; phase: "inactive" | "seated" | "boarding" | "leaving"; progress: number }[] = [];
  private initialized = false;
  private time = 0;
  private indicators: {material:THREE.MeshStandardMaterial;side:number}[]=[];
  constructor(type: BusType, destination: string, low: boolean) {
    const { color, seats: count, label } = BUS_SPECS[type];
    this.chassis = new VehicleModel("Bus", color);
    // Retain the common wheel/chassis implementation. Replace opaque cabin with a real interior.
    const root = this.chassis.root;
    const remove = root.children.filter(o => o instanceof THREE.Mesh && o.position.y > 1.1);
    for (const mesh of remove) disposeGroup(mesh);
    this.root.add(root);
    const body = material(color, 0.45, 0.15), seat = material(type === "coach" ? "#355269" : "#39705f"), rail = material("#adb5a3", 0.3, 0.7);
    box(root, material("#797866"), 0, 1.12, 0, 2.5, 0.12, 9.0);
    box(root, palette.white, 0, 3.12, 0, 2.65, 0.15, 9.2);
    for (const x of [-1.28, 1.28]) {
      if (x > 0) box(root, body, x, 1.55, 0, 0.08, 0.8, 9.1);
      else box(root, body, x, 1.55, 0.75, 0.08, 0.8, 7.6);
      for (let z = -4.4; z <= 4.4; z += 1.1) box(root, body, x, 2.45, z, 0.075, 1.3, 0.07);
      cylinder(root, rail, x * 0.55, 2.87, 0, 0.035, 0.3);
      box(root, rail, x * 0.55, 2.9, 0, 0.045, 0.045, 8.5);
    }
    box(root, body, 0, 1.55, -4.55, 2.55, 0.8, 0.08);
    box(root, body, 0, 1.7, 4.55, 2.55, 1.1, 0.08);
    for (const x of [-1.23, 1.23]) box(root, body, x, 2.4, -4.55, 0.1, 1.3, 0.1);
    box(root, body, 0, 2.95, -4.55, 2.55, 0.25, 0.1);
    box(root, material("#313f3b"), 0, 1.7, -3.95, 2.2, 0.35, 0.6);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 16), palette.dark);
    wheel.position.set(0.72, 1.95, -3.68); wheel.rotation.x = -0.8; root.add(wheel);
    for (let i = 0; i < count; i++) {
      const p = seatPosition(i);
      box(root, seat, p.x, 1.5, p.z, 0.85, 0.2, 0.7);
      box(root, seat, p.x, 1.93, p.z + 0.33, 0.85, 0.82, 0.13);
      if (!low) for (const x of [-0.3, 0.3]) cylinder(root, rail, p.x + x, 1.32, p.z, 0.035, 0.3);
    }
    for (const z of [-2.4, 0, 2.4]) for (const x of [-0.47, 0.47]) cylinder(root, rail, x, 2.1, z, 0.035, 1.9);
    // Curbside door on the left for Kerala's left-hand traffic.
    this.door.position.set(-1.3, 1.18, -3.5);
    box(this.door, body, 0, 0.9, 0, 0.06, 1.8, 1.0);
    box(this.door, material("#60887e", 0.22), -0.02, 1.2, 0, 0.03, 0.7, 0.8);
    root.add(this.door);
    for (let i = 0; i < 3; i++) box(root, palette.stone, -1.0 - i * 0.15, 0.45 + i * 0.22, -3.5, 0.35, 0.16, 1);
    const board = sign(root, destination, 0, 2.96, -4.62, 2.25, "SIMULATED · കേരളം", "#152d24", Math.PI);
    // Destination board is a vehicle prop; no ground-mounted signpost.
    const post = board.children.find(o => o.position.y < -0.5); if (post) board.remove(post);
    for(const side of [-1,1]){
      const lamp=material("#75451c").clone();lamp.userData.transient=true;
      this.indicators.push({material:lamp,side});
      for(const z of [-4.63,4.63]){const m=box(root,lamp,side*1.12,1.5,z,.22,.14,.08);m.userData.keep=true;}
    }
    // Distinct silhouettes and liveries, without copying an operator's proprietary artwork.
    for (const x of [-1.33,1.33]) {
      box(root, palette.white, x, type === "private" ? 1.7 : 1.3, 0.5, 0.04, type === "private" ? 0.24 : 0.12, 7.5);
      if (type === "fast") box(root,palette.white,x,1.58,1.5,0.04,0.18,4);
      if (type === "coach") box(root,material("#2e4d5a"),x,2.48,0,0.04,0.58,7.2);
    }
    if (type === "coach") box(root,material("#bac3bd"),0,3.35,1.5,1.5,0.35,2.4);
    sign(root,label,0,1.7,4.62,1.8,"ORIGINAL GAME DESIGN");
    this.door.traverse(o => { if (o instanceof THREE.Mesh) o.userData.keep = true; });
    for (const o of [...this.chassis.wheels, ...this.chassis.brakes]) o.userData.keep = true;
    bake(root);
    const driver = new Human({ gender: "male", skin: "#a96c48", shirt: "#aa9c72", pants: "#504b3c", shoes: "#302b24", hair: "short" });
    bake(driver.root);
    driver.root.position.set(0.72, 1.28, -3.7); driver.root.scale.setScalar(0.8); driver.root.rotation.y = Math.PI; root.add(driver.root);
    for (let i = 0; i < (low ? 3 : 7); i++) {
      const style = { gender: i % 2 ? "female" as const : "male" as const, skin: "#a96c48", shirt: ["#cead73", "#96739b", "#659f96"][i % 3], pants: "#493e35", shoes: "#302b24", hair: i % 2 ? "long" as const : "short" as const };
      const human = new Human(style), walker = new Human(style), group = new THREE.Group();
      human.leftLeg.rotation.x = -1.3; human.rightLeg.rotation.x = -1.3;
      human.leftKnee.rotation.x = 1.3; human.rightKnee.rotation.x = 1.3;
      bake(human.root);
      human.root.scale.setScalar(0.8); human.root.rotation.y = Math.PI;
      walker.root.scale.setScalar(0.8); walker.root.visible=false;
      group.add(human.root,walker.root); root.add(group);
      this.passengers.push({ root: group, sitting: human.root, walker, seat: -1, phase: "inactive", progress: 0 });
    }
    root.scale.z = busScale(type);
    // Preserve doors, wheels and passenger joints as independently animated objects.
  }
  update(door: number, speed: number, braking: boolean, dt: number, occupied: Set<number>, turn=0) {
    this.time += dt;
    this.door.position.z = -3.5 + door * 1.05;
    this.chassis.animate(speed, braking, dt);
    for(const lamp of this.indicators){const on=Math.abs(turn)>.12 && Math.sign(turn)===lamp.side && this.time%.9<.45;lamp.material.emissive.set(on?"#ff9500":"#000000");lamp.material.emissiveIntensity=on?2:0;}
    for (const p of this.passengers) if (p.phase !== "inactive" && p.phase !== "leaving" && !occupied.has(p.seat)) { p.phase="leaving"; p.progress=0; }
    for (const seat of occupied) if (!this.passengers.some(p=>p.seat===seat && p.phase!=="inactive" && p.phase!=="leaving")) {
      const p=this.passengers.find(p=>p.phase==="inactive");
      if (p) { p.seat=seat; p.phase=this.initialized?"boarding":"seated"; p.progress=0; }
    }
    this.initialized=true;
    for (const p of this.passengers) {
      p.root.visible=p.phase!=="inactive"; if (!p.root.visible) continue;
      const seat=seatPosition(p.seat);
      p.sitting.visible=p.phase==="seated"; p.walker.root.visible=!p.sitting.visible;
      p.sitting.position.set(seat.x,1.0,seat.z);
      if (p.phase==="seated") continue;
      if (door>.98 || p.progress>0.25) p.progress=Math.min(1,p.progress+dt/5);
      const t=p.phase==="boarding"?p.progress:1-p.progress;
      // Curb → passenger steps → centre aisle → allocated seat.
      const route=[new THREE.Vector3(-2.7,0,-3.5),new THREE.Vector3(-1,1.15,-3.5),new THREE.Vector3(0,1.23,-3.1),new THREE.Vector3(0,1.23,seat.z),new THREE.Vector3(seat.x,1.23,seat.z)];
      const segment=Math.min(3,Math.floor(t*4)), fraction=t*4-segment;
      p.walker.root.position.copy(route[segment]).lerp(route[segment+1],fraction);
      const delta=route[segment+1].clone().sub(route[segment]).multiplyScalar(p.phase==="boarding"?1:-1);
      p.walker.root.rotation.y=Math.atan2(delta.x,delta.z); p.walker.animate(this.time,0.8,0);
      if (p.progress>=1) p.phase=p.phase==="boarding"?"seated":"inactive";
    }
  }
}
export function seatPosition(index: number) { return { x: index % 2 ? 0.86 : -0.86, z: -2.6 + Math.floor(index / 2) * 0.73 }; }

export function stationModel(station: BusStation, compact: boolean) {
  const root = new THREE.Group();
  const size = compact ? 0.65 : 1;
  box(root, palette.stone, 0, 0.08, 0, 32 * size, 0.16, 20 * size);
  box(root, palette.wall, 0, 2, 6 * size, 25 * size, 4, 4 * size);
  roof(root, 0, 4.05, 6 * size, 27 * size, 6 * size, 1.4);
  for (let i = -1; i <= 1; i++) {
    const x = i * 8 * size;
    box(root, material("#c7bd98"), x, 0.2, -1, 7 * size, 0.2, 8 * size);
    box(root, palette.wood, x, 0.65, 2, 3 * size, 0.15, 0.6);
    box(root, palette.wood, x, 1, 2.3, 3 * size, 0.6, 0.12);
    for (const dx of [-2.8, 2.8]) cylinder(root, palette.dark, x + dx * size, 1.8, 1, 0.09, 3.6);
    box(root, material("#7b4c3c"), x, 3.6, 0, 7 * size, 0.14, 6 * size);
    sign(root, `BAY ${i + 2}`, x, 2.8, -2, 2.2, "SIMULATED DEPARTURES");
    box(root, palette.white, x - 3 * size, 0.22, -4, 0.08, 0.02, 4);
  }
  sign(root, station.name.toUpperCase(), 0, 5.1, 3.9 * size, 14 * size, station.localName);
  sign(root, "TICKETS · INFORMATION", -8 * size, 2.3, 3.85 * size, 4 * size, "ടിക്കറ്റ് · വിവരങ്ങൾ");
  sign(root, "TEA · ചായ", 8 * size, 2.3, 3.85 * size, 3 * size, "LOCAL SHOP");
  sign(root, "IN-GAME SERVICES", 0, 2.3, 3.85 * size, 4 * size, "Select destination at the bay");
  for (const x of [-15, 15]) {
    cylinder(root, palette.dark, x * size, 4, -3, 0.08, 8);
    box(root, material("#ead8a1"), x * size, 8, -3, 0.7, 0.12, 0.4);
  }
  const auto = new VehicleModel("Auto rickshaw"); auto.root.position.set(14 * size, 0, 5 * size); root.add(auto.root);
  bake(root);
  return root;
}
