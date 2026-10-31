import type { BusPlan, BusSnapshot, JourneyRecord, Vec2 } from "../types";
import { toLocal } from "../data/geography";
import { distance, nearestOnSegment } from "./navigation";
import { BUS_SPECS } from "./busSpecs";

export const BUS_CAMERAS = ["Passenger seat", "Window view", "Exterior bus", "Forward view"] as const;
export interface RouteStop { name: string; point: Vec2; distance: number; district: string; }
export function routeLengths(points: Vec2[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  return cumulative;
}
export function sampleRoute(points: Vec2[], lengths: number[], metres: number, offset = 0) {
  const d = Math.max(0, Math.min(lengths.at(-1) ?? 0, metres));
  let lo = 1, hi = points.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < d) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo), a = points[i - 1], b = points[i];
  const length = distance(a, b) || 1, t = Math.max(0, Math.min(1, (d - lengths[i - 1]) / length));
  const unit = (from: Vec2,to: Vec2) => { const n = distance(from,to) || 1; return {x:(to.x-from.x)/n,z:(to.z-from.z)/n}; };
  const edge = unit(a,b);
  const average = (u: Vec2,v: Vec2) => { const n = Math.hypot(u.x+v.x,u.z+v.z); return n > 0.001 ? {x:(u.x+v.x)/n,z:(u.z+v.z)/n} : v; };
  const start = i > 1 ? average(unit(points[i-2],a),edge) : edge;
  const end = i+1 < points.length ? average(edge,unit(b,points[i+1])) : edge;
  const blend = Math.min(6,length/2);
  const nearStart = Math.max(0,1-t*length/blend), nearEnd = Math.max(0,1-(1-t)*length/blend);
  const tangent = { x: edge.x+(start.x-edge.x)*nearStart+(end.x-edge.x)*nearEnd,
    z: edge.z+(start.z-edge.z)*nearStart+(end.z-edge.z)*nearEnd };
  const n = Math.hypot(tangent.x,tangent.z) || 1;
  return { x: a.x + (b.x - a.x) * t - tangent.z/n * offset,
    z: a.z + (b.z - a.z) * t + tangent.x/n * offset,
    yaw: Math.atan2(tangent.x,-tangent.z), segment: i };
}
export function projectRoute(point: Vec2, points: Vec2[], lengths: number[]) {
  let best = { distance: 0, separation: Infinity, point: points[0] };
  for (let i = 1; i < points.length; i++) {
    const p = nearestOnSegment(point, points[i - 1], points[i]), separation = distance(point, p);
    if (separation < best.separation) best = { point: p, separation, distance: lengths[i - 1] + distance(points[i - 1], p) };
  }
  return best;
}
export function validateBusGeometry(points: Vec2[], expectedDistance: number) {
  if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return false;
  const lengths = routeLengths(points), total = lengths.at(-1)!;
  return total > 100 && Math.abs(total - expectedDistance) < Math.max(100, expectedDistance * 0.08)
    && points.slice(1).every((p, i) => distance(p, points[i]) < 500);
}

/** Deterministic passenger simulation. All advances are distance along sourced road geometry. */
export class PassengerJourney {
  points: Vec2[]; lengths: number[]; stops: RouteStop[];
  phase = "arriving";
  door = 0; speed = 0; travelled = 0; seconds = 0; timer = 0;
  stopIndex = 0; seat: number | null = null; attached = false; requestStop = false;
  camera = 0; mode: "full" | "fast" = "full";
  occupied = new Set([1, 3, 6, 10, 13]);
  private resumePhase = "travelling";
  constructor(public plan: BusPlan, origin: [number, number], public dwellSeconds = 8) {
    this.dwellSeconds = Math.max(6, Math.min(30, dwellSeconds));
    this.occupied = new Set([...this.occupied].filter(i => i < BUS_SPECS[plan.type].seats));
    this.points = (plan.route.drivingPoints ?? plan.route.points).map(p => toLocal(p, origin));
    this.lengths = routeLengths(this.points);
    if (!validateBusGeometry(this.points, plan.route.service.distance)) throw new Error("Bus route geometry is incomplete or disconnected.");
    const start = Math.min(55, this.lengths.at(-1)! * 0.05);
    this.stops = [{ name: plan.stations[0].name, point: sampleRoute(this.points, this.lengths, start), distance: start, district: plan.stations[0].district }];
    for (const stop of plan.route.stops) {
      const projected = projectRoute(toLocal(stop.coordinate, origin), this.points, this.lengths);
      if (projected.separation < 35 && projected.distance > this.stops.at(-1)!.distance + 350 && projected.distance < this.lengths.at(-1)! - 350)
        this.stops.push({ name: stop.name, point: projected.point, distance: projected.distance, district: stop.district });
    }
    this.stops.push({ name: plan.stations[1].name, point: this.points.at(-1)!, distance: this.lengths.at(-1)!, district: plan.stations[1].district });
  }
  poseAt(metres:number) { return sampleRoute(this.points,this.lengths,metres,this.plan.route.drivingPoints?0:-1.6); }
  get pose() { return this.poseAt(this.travelled); }
  get target() { return this.stops[this.stopIndex]; }
  get canExit() { return this.attached && this.speed < 0.05 && this.door > 0.98 && ["select-seat", "seated", "dwelling", "arrived"].includes(this.phase); }
  canBoard(doorDistance: number) {
    return !this.attached && this.phase === "waiting" && this.door > 0.98 && this.speed < 0.05 && doorDistance < 4;
  }
  board(doorDistance: number) {
    if (!this.canBoard(doorDistance)) return false;
    this.attached = true; this.phase = "boarding"; this.timer = 0;
    return true;
  }
  chooseSeat(index: number) {
    const count = BUS_SPECS[this.plan.type].seats;
    if (!this.attached || !["select-seat", "seated"].includes(this.phase) || !Number.isInteger(index) || index < 0 || index >= count || this.occupied.has(index)) return false;
    this.seat = index; this.phase = "seated"; return true;
  }
  depart() {
    if (this.phase !== "seated" || this.seat === null) return false;
    this.phase = "closing"; this.resumePhase = "travelling"; this.stopIndex = 1; this.timer = 0; return true;
  }
  requestNextStop() {
    if (!this.attached || this.phase === "arrived") return;
    this.requestStop = true;
  }
  exit() {
    if (!this.canExit) return false;
    this.attached = false; this.phase = "exited"; return true;
  }
  /** Explicit fast travel, available only once safely seated. It never pretends to be continuous. */
  fastForward() {
    if (!this.attached || this.seat === null || !["travelling", "closing", "dwelling"].includes(this.phase)) return false;
    this.mode = "fast";
    this.seconds += Math.max(0, this.lengths.at(-1)! - this.travelled) / 11;
    this.travelled = this.lengths.at(-1)!; this.stopIndex = this.stops.length - 1;
    this.speed = 0; this.door = 0; this.phase = "opening"; this.resumePhase = "arrived"; this.timer = 0;
    return true;
  }
  update(dt: number, obstructed = false, redSignal = false) {
    if (dt <= 0 || !Number.isFinite(dt)) return;
    // Bounded integration keeps braking and door transitions stable under accelerated tests.
    let remaining = Math.min(dt, 60);
    while (remaining > 0) { const step = Math.min(1 / 30, remaining); this.step(step, obstructed, redSignal); remaining -= step; }
  }
  private step(dt: number, obstructed: boolean, redSignal: boolean) {
    if (this.attached && this.phase !== "exited") this.seconds += dt;
    this.timer += dt;
    if (["opening", "waiting", "boarding", "select-seat", "seated", "dwelling", "arrived"].includes(this.phase)) this.door = Math.min(1, this.door + dt / 1.1);
    if (this.phase === "opening" && this.door >= 1) { this.phase = this.resumePhase; this.timer = 0; }
    if (this.phase === "boarding" && this.timer >= 1.2) { this.phase = "select-seat"; this.timer = 0; }
    if (this.phase === "dwelling" && this.timer >= this.dwellSeconds && !this.requestStop) { this.stopIndex++; this.phase = "closing"; this.timer = 0; }
    if (this.phase === "closing") {
      this.door = Math.max(0, this.door - dt / 1.1);
      if (this.door === 0 && this.timer > 1.5) this.phase = "travelling";
    }
    if (!["arriving", "travelling"].includes(this.phase)) { this.speed = 0; return; }
    const remaining = Math.max(0, this.target.distance - this.travelled);
    const a = sampleRoute(this.points, this.lengths, this.travelled + 4);
    const b = sampleRoute(this.points, this.lengths, this.travelled + 24);
    const turn = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
    const maximum = this.phase === "arriving" ? 4 : this.plan.type === "mini" ? 12 : this.plan.type === "fast" || this.plan.type === "coach" ? 15 : 13;
    const cornerLimit = Math.sqrt(1.35 * 20 * 9.2 / BUS_SPECS[this.plan.type].length / Math.max(0.08, turn));
    const targetSpeed = obstructed || redSignal ? 0 : Math.min(maximum, cornerLimit, Math.sqrt(2 * 1.6 * remaining));
    this.speed += Math.max(-2.6 * dt, Math.min(1.15 * dt, targetSpeed - this.speed));
    this.travelled = Math.min(this.target.distance, this.travelled + Math.max(0, this.speed) * dt);
    if (remaining < 0.08 && this.speed < 0.7) {
      this.travelled = this.target.distance; this.speed = 0; this.phase = "opening";
      this.resumePhase = this.stopIndex === 0 ? "waiting" : this.stopIndex === this.stops.length - 1 ? "arrived" : "dwelling";
      this.timer = 0;
      if (this.stopIndex > 0) {
        this.occupied.delete((this.stopIndex * 3) % BUS_SPECS[this.plan.type].seats);
        const next = (this.stopIndex * 7) % BUS_SPECS[this.plan.type].seats;
        if (next !== this.seat) this.occupied.add(next);
      }
    }
  }
  record(): JourneyRecord {
    return { route: this.plan.route.service.id, from: this.plan.stations[0].name,
      to: this.target.name, distance: Math.max(0, this.travelled - this.stops[0].distance), seconds: this.seconds,
      completedAt: new Date().toISOString(), mode: this.mode, completed: this.stopIndex === this.stops.length - 1 };
  }
  snapshot(doorDistance = Infinity): BusSnapshot {
    const total = this.lengths.at(-1)!;
    return { attached: this.attached, phase: this.phase, door: this.door, speed: this.speed * 3.6,
      from: this.plan.stations[0].name, to: this.plan.stations[1].name,
      nextStop: this.target.name, remaining: Math.max(0, total - this.travelled), total,
      seconds: this.seconds, progress: this.travelled / total, seated: this.seat !== null,
      seat: this.seat, occupied: [...this.occupied], requestStop: this.requestStop,
      canBoard: this.canBoard(doorDistance), canExit: this.canExit, camera: BUS_CAMERAS[this.camera],
      route: this.plan.route.service.id, type: this.plan.type, passengers: this.occupied.size,
      mode: this.mode };
  }
}
