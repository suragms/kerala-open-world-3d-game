import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS, DEFAULT_AVATAR } from "../src/types";
import type { BusPlan, BusRouteData, BusStation, BusService, Settings } from "../src/types";
import { PassengerJourney, sampleRoute, routeLengths, validateBusGeometry, BUS_CAMERAS } from "../src/game/bus";
import { GamepadInputController, deadzone } from "../src/game/gamepad";
import { mouseSteering, smoothSteering, vehicleThrottle } from "../src/game/vehicle";
import { sanitizeSettings, validateSave } from "../src/game/save";
import { toLocal, districtAt } from "../src/data/geography";
import { CollisionWorld, findPath } from "../src/game/navigation";

const registry = JSON.parse(readFileSync("public/data/bus-services.json", "utf8")) as { stations: BusStation[]; routes: BusService[] };
const loadPlan = (id = "thrissur-guruvayur"): BusPlan => {
  const service = registry.routes.find(r => r.id === id)!;
  const route = JSON.parse(readFileSync(`public/data/${service.file}`, "utf8")) as BusRouteData;
  return { route, stations: [service.from, service.to].map(id => registry.stations.find(s => s.id === id)!), type: "public" };
};
const create = () => { const plan = loadPlan(); return new PassengerJourney(plan, plan.stations[0].coordinate); };
function wait(bus: PassengerJourney, predicate: () => boolean, max = 10000) {
  let seconds = 0;
  while (!predicate() && seconds++ < max) bus.update(1);
  assert.ok(predicate(), `State ${bus.phase}, position ${bus.travelled}, stop ${bus.stopIndex} did not reach expected state`);
}
function board(bus: PassengerJourney) {
  wait(bus, () => bus.phase === "waiting"); assert.ok(bus.board(2));
  bus.update(2); assert.equal(bus.phase, "select-seat");
  assert.ok(bus.chooseSeat(0)); assert.ok(bus.depart());
}
test("Mouse steering has a configurable neutral point and dead zone", () => {
  assert.equal(mouseSteering(0.2, 0.2, 1, 0.12), 0);
  assert.equal(mouseSteering(0.25, 0.2, 1, 0.12), 0);
  assert.ok(mouseSteering(0.8, 0.2, 1, 0.12) > 0.4);
  assert.ok(mouseSteering(-0.8, 0, 1, 0.12) < -0.7);
});
test("A player beside a bus can pathfind away without requiring extra starting clearance", () => {
  const world=new CollisionWorld();
  world.boxes=[{center:{x:0,z:0},yaw:0,halfWidth:1.35,halfLength:4.7}];
  const from={x:1.72,z:0},to={x:-2.7,z:-3.5};
  assert.equal(world.blocked(from,.35),false);
  assert.equal(world.blocked(from,.43),true);
  const path=findPath(from,to,world,.35);
  assert.ok(path.length>1);
  assert.ok(Math.hypot(path.at(-1)!.x-to.x,path.at(-1)!.z-to.z)<.1);
  let last=from;
  for(const point of path){assert.ok(world.segmentClear(last,point,.35));last=point;}
});
test("Steering is progressive, speed-sensitive and returns smoothly to neutral", () => {
  const low = smoothSteering(0, 1, 2, 1 / 60), high = smoothSteering(0, 1, 25, 1 / 60);
  assert.ok(high < low && low < 0.12);
  assert.ok(smoothSteering(0.7, 0, 10, 1 / 60) < 0.7);
});
test("Mouse and controller brakes stop without accidentally reversing", () => {
  let speed = 15; for (let i = 0; i < 300; i++) speed = vehicleThrottle(speed, 0, 1, false, false, 1/60);
  assert.equal(speed, 0);
  assert.ok(vehicleThrottle(0, 1, 0, true, false, 1) < 0);
  assert.equal(vehicleThrottle(0.1, 0, 0, false, true, 1), 0);
});
function pad(axes = [0,0,0,0], buttons: Record<number, number> = {}, mapping: GamepadMappingType = "standard") {
  return { id: "Test controller", index: 0, connected: true, mapping, axes,
    buttons: Array.from({ length: 18 }, (_, i) => ({ value: buttons[i] ?? 0, pressed: (buttons[i] ?? 0) > .5, touched: false })) };
}
test("Controller supports analog movement and triggers with standard button edges", () => {
  const input = new GamepadInputController(), frame = input.sample(pad([.8,-.8,.5,.4], { 0:1, 7:.75 }), DEFAULT_SETTINGS);
  assert.ok(frame.moveX > .7 && frame.moveY > .7 && frame.lookX > .3);
  assert.equal(frame.accelerate, .75); assert.ok(frame.pressed.has("jump"));
  assert.equal(input.sample(pad([], { 0:1 }), DEFAULT_SETTINGS).pressed.has("jump"), false);
});
test("Controller disconnect resets every held input and allows reconnection", () => {
  const input = new GamepadInputController(); input.sample(pad([1,1], {7:1, 2:1}), DEFAULT_SETTINGS);
  const disconnected = input.sample(null, DEFAULT_SETTINGS);
  assert.equal(disconnected.moveX, 0); assert.equal(disconnected.accelerate, 0); assert.equal(disconnected.connected, false);
  assert.ok(input.sample(pad([], {2:1}), DEFAULT_SETTINGS).pressed.has("interact"));
});
test("Nonstandard layouts honor editable button and axis mappings", () => {
  const input = new GamepadInputController(), settings: Settings = { ...DEFAULT_SETTINGS, gamepadButtons: { ...DEFAULT_SETTINGS.gamepadButtons, interact: 5 }, gamepadAxes: [2,3,0,1] };
  const frame = input.sample(pad([0,0,1,-1], {5:1}, ""), settings);
  assert.equal(frame.standard, false); assert.equal(frame.moveX, 1); assert.equal(frame.moveY, 1); assert.ok(frame.pressed.has("interact"));
});
test("Controller dead zones reject drift and invalid analog values", () => {
  assert.equal(deadzone(.1, .16), 0); assert.equal(deadzone(NaN, .16), 0); assert.equal(deadzone(-1, .16), -1);
});
test("Every offered bus corridor has connected finite geometry and matches its sourced distance", () => {
  assert.ok(registry.routes.length >= 4);
  for (const service of registry.routes) {
    const plan = loadPlan(service.id), origin = plan.stations[0].coordinate;
    assert.ok(plan.stations.every(s => s.source.startsWith("https://www.openstreetmap.org/")));
    assert.ok(validateBusGeometry(plan.route.points.map(p => toLocal(p, origin)), service.distance), service.id);
    assert.equal(service.simulation, true);
    const bus = new PassengerJourney(plan, origin); assert.ok(bus.stops.length >= 2);
  }
});
test("Disconnected and corrupted bus geometry is rejected", () => {
  assert.equal(validateBusGeometry([{x:0,z:0},{x:1000,z:0}], 1000), false);
  assert.equal(validateBusGeometry([{x:NaN,z:0},{x:1,z:1}], 100), false);
});
test("Bus boarding requires a complete stop, an open door and proximity", () => {
  const bus = create(); assert.equal(bus.board(1), false);
  wait(bus, () => bus.phase === "waiting");
  assert.equal(bus.canBoard(8), false); assert.equal(bus.canBoard(2), true); assert.equal(bus.board(2), true); assert.equal(bus.board(2), false);
});
test("Bus seats reject occupied or invalid selections; departure requires a seat", () => {
  const bus = create(); assert.equal(bus.depart(), false);
  wait(bus, () => bus.phase === "waiting"); bus.board(1); bus.update(2);
  assert.equal(bus.chooseSeat(1), false); assert.equal(bus.chooseSeat(100), false); assert.equal(bus.chooseSeat(NaN), false);
  assert.equal(bus.chooseSeat(0), true); assert.equal(bus.depart(), true);
});
test("Doors close before the bus accelerates", () => {
  const bus = create(); board(bus); bus.update(.5);
  assert.ok(bus.door > 0); assert.equal(bus.speed, 0);
  bus.update(3); assert.equal(bus.door, 0); assert.ok(bus.speed > 0);
});
test("Full journey remains continuous along the road and arrives without fast travel", () => {
  const bus = create(); board(bus);
  let previous = bus.pose, ticks = 0;
  while (bus.phase !== "arrived" && ticks++ < 12000) {
    bus.update(1); const p = bus.pose;
    assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z) < 20, "Unexpected movement discontinuity");
    assert.ok(bus.speed <= 15); if (bus.speed > .1) assert.equal(bus.door, 0);
    previous = p;
  }
  assert.equal(bus.phase, "arrived"); assert.ok(bus.canExit); assert.equal(bus.mode, "full");
  assert.ok(bus.record().completed); assert.ok(bus.exit()); assert.equal(bus.attached, false);
});
test("Requested intermediate stops acknowledge, allow safe exit and depart if the passenger stays", () => {
  const bus = create();
  const midpoint = sampleRoute(bus.points, bus.lengths, 400);
  bus.stops.splice(1, 0, { name: "Deterministic test stop", point: midpoint, distance: 400, district: "thrissur" });
  board(bus); bus.requestNextStop(); wait(bus, () => bus.phase === "dwelling");
  assert.equal(bus.requestStop,false); assert.equal(bus.acknowledgedStop,"Deterministic test stop");
  assert.equal(bus.speed,0); assert.ok(bus.canExit);
  assert.equal(bus.exit(),true); assert.equal(bus.record().completed,false);
  const continuing=create(); continuing.stops.splice(1,0,{name:"Continue stop",point:midpoint,distance:400,district:"thrissur"});
  board(continuing); continuing.requestNextStop(); wait(continuing,()=>continuing.phase==="dwelling");
  continuing.update(12); assert.equal(continuing.phase,"travelling"); assert.equal(continuing.stopIndex,2); assert.equal(continuing.door,0); assert.ok(continuing.speed>0);
});
test("An unrequested intermediate stop dwells and resumes without open-door driving", () => {
  const bus = create(), point = sampleRoute(bus.points, bus.lengths, 350);
  bus.stops.splice(1,0,{name:"Test dwell stop", point, distance:350, district:"thrissur"});
  board(bus); wait(bus, () => bus.phase === "dwelling"); bus.update(7); assert.equal(bus.phase,"dwelling"); bus.update(4); assert.equal(bus.phase,"travelling"); assert.equal(bus.door,0);
});
test("Repeated and cancelled bus stop requests cannot lock dwell or restart a finished journey",()=>{
  const bus=create();
  for(const d of [300,700])bus.stops.splice(bus.stops.length-1,0,{name:`Stop ${d}`,point:sampleRoute(bus.points,bus.lengths,d),distance:d,district:"thrissur"});
  bus.stops.sort((a,b)=>a.distance-b.distance);
  assert.equal(bus.requestNextStop(),false);board(bus);
  assert.ok(bus.requestNextStop());assert.ok(bus.cancelStopRequest());assert.equal(bus.requestStop,false);
  for(let i=0;i<2;i++){
    assert.ok(bus.requestNextStop());assert.ok(bus.requestNextStop());wait(bus,()=>bus.phase==="dwelling");
    assert.equal(bus.requestStop,false);assert.ok(bus.acknowledgedStop);assert.equal(bus.requestNextStop(),false);
    bus.update(bus.dwellSeconds+2);assert.equal(bus.phase,"travelling");assert.equal(bus.door,0);
  }
  wait(bus,()=>bus.phase==="arrived");assert.equal(bus.depart(),false);assert.equal(bus.fastForward(),false);assert.equal(bus.requestNextStop(),false);
  assert.ok(bus.exit());assert.equal(bus.exit(),false);assert.equal(bus.board(1),false);
});
test("Bus brakes for obstacles and simulated red signals", () => {
  const bus = create(); board(bus); bus.update(20); assert.ok(bus.speed > 2);
  bus.update(10, true); assert.equal(bus.speed,0); const at = bus.travelled;
  bus.update(5, false, true); assert.equal(bus.travelled, at);
  bus.update(4); assert.ok(bus.travelled > at);
});
test("Fast Journey is explicit, safe and recorded separately from full travel", () => {
  const bus = create(); assert.equal(bus.fastForward(),false); board(bus); assert.ok(bus.fastForward());
  assert.equal(bus.mode,"fast"); bus.update(2); assert.equal(bus.phase,"arrived"); assert.equal(bus.speed,0); assert.equal(bus.door,1);
});
test("All four bus cameras have distinct user-facing modes", () => {
  assert.equal(new Set(BUS_CAMERAS).size,4); assert.ok(BUS_CAMERAS.includes("Passenger seat"));
});
test("Route sampling clamps distance and keeps the left-hand lane", () => {
  const pts=[{x:0,z:0},{x:0,z:-100}], lengths=routeLengths(pts);
  const p=sampleRoute(pts,lengths,50,-1.6); assert.equal(p.x,-1.6); assert.equal(p.z,-50); assert.equal(sampleRoute(pts,lengths,999).z,-100);
});
test("Repeated route vertices and single-point probes never produce NaN poses",()=>{
  const points=[{x:0,z:0},{x:0,z:0},{x:0,z:-10}];
  for(const d of [0,.001,10])assert.ok(Object.values(sampleRoute(points,routeLengths(points),d)).every(Number.isFinite));
  assert.ok(Object.values(sampleRoute([{x:1,z:2}],[0],0)).every(Number.isFinite));
});
test("A bus lane and heading stay continuous across a road corner", () => {
  const points=[{x:0,z:0},{x:0,z:-30},{x:30,z:-30}], lengths=routeLengths(points);
  const before=sampleRoute(points,lengths,29.999,-1.6), after=sampleRoute(points,lengths,30.001,-1.6);
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.01);
  assert.ok(Math.abs(after.yaw-before.yaw)<.01);
});
test("Versioned saves migrate v1 and restore a bus passenger at their last safe stop", () => {
  const base = { version:1, avatar:DEFAULT_AVATAR, region:"thrissur", area:"thrissur", position:{x:0,z:0}, yaw:0, distance:10, visited:["thrissur"], discovered:[], savedAt:new Date().toISOString() };
  assert.equal(validateSave(base)?.version,2);
  const restored=validateSave({...base,version:2,checkpoint:"last-bus-stop",position:{x:500,z:0},currentVehicle:"Bus",safeLocation:{region:"thrissur",area:"corridor-thrissur-guruvayur",position:{x:10,z:12}}});
  assert.deepEqual(restored?.position,{x:10,z:12}); assert.equal(restored?.currentVehicle,undefined);
  assert.equal(validateSave({...base,position:{x:NaN,z:0}}),null); assert.equal(validateSave({version:99}),null);
});
test("Malformed settings cannot corrupt steering, controller maps or graphics", () => {
  const settings=sanitizeSettings({quality:"unknown",distance:Infinity,steeringDeadzone:9,gamepadAxes:[99],gamepadButtons:{interact:-5}});
  assert.equal(settings.quality,DEFAULT_SETTINGS.quality); assert.equal(settings.distance,DEFAULT_SETTINGS.distance);
  assert.equal(settings.steeringDeadzone,.4); assert.deepEqual(settings.gamepadAxes,[0,1,2,3]); assert.equal(settings.gamepadButtons.interact,2);
});
test("Terminal coordinates retain valid district membership and explicit procedural fidelity", () => {
  const boundaries=JSON.parse(readFileSync("public/data/districts.geojson","utf8"));
  for(const station of registry.stations){ assert.equal(districtAt(station.coordinate,boundaries),station.district,station.name); assert.equal(station.fidelity,"C"); assert.ok(station.status); }
});
