import { insideRing, haversine } from "../data/geography";
import type { Vec2, LonLat, StateNetwork } from "../types";
import { MinHeap } from "./priorityQueue";
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return { x: a.x + t * dx, z: a.z + t * dz };
}
export interface Obstacle {
  points: Vec2[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  water?: boolean;
  minY: number;
  maxY: number;
}
export interface CollisionBox {
  center: Vec2;
  yaw: number;
  halfWidth: number;
  halfLength: number;
  minY?: number;
  maxY?: number;
}
function boxCorners(
  p: Vec2,
  yaw: number,
  halfWidth: number,
  halfLength: number,
) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => ({
    x: p.x + x * halfWidth * c - z * halfLength * s,
    z: p.z + x * halfWidth * s + z * halfLength * c,
  }));
}
function boxesOverlap(a: Vec2[], b: Vec2[]) {
  for (const shape of [a, b])
    for (let i = 0; i < 2; i++) {
      const u = shape[i],
        v = shape[i + 1],
        axis = { x: -(v.z - u.z), z: v.x - u.x };
      const pa = a.map((p) => p.x * axis.x + p.z * axis.z),
        pb = b.map((p) => p.x * axis.x + p.z * axis.z);
      if (
        Math.max(...pa) < Math.min(...pb) ||
        Math.max(...pb) < Math.min(...pa)
      )
        return false;
    }
  return true;
}
export class CollisionWorld {
  obstacles: Obstacle[] = [];
  boxes: CollisionBox[] = [];
  circles: { center: Vec2; radius: number; minY?: number; maxY?: number }[] =
    [];
  walkableAt?: (p: Vec2) => boolean;
  waterAt?: (p: Vec2) => boolean;
  bridgeAt?: (p: Vec2) => boolean;
  private cells = new Map<string, Obstacle[]>();
  indexMilliseconds = 0;
  /** Read-only probe view: shares static indexing, owns its dynamic lists. */
  withAdditionalBoxes(boxes: CollisionBox[]) {
    const view = new CollisionWorld();
    view.obstacles = this.obstacles; view.cells = this.cells;
    view.boxes = [...this.boxes, ...boxes]; view.circles = this.circles;
    view.walkableAt = this.walkableAt; view.waterAt = this.waterAt; view.bridgeAt = this.bridgeAt;
    return view;
  }
  add(points: Vec2[], water = false, minY = -Infinity, maxY = Infinity) {
    if (points.length < 3) return;
    const began = performance.now();
    const o = {
      points,
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minZ: Math.min(...points.map((p) => p.z)),
      maxZ: Math.max(...points.map((p) => p.z)),
      water,
      minY,
      maxY,
    };
    this.obstacles.push(o);
    for (let x = Math.floor(o.minX / 32); x <= Math.floor(o.maxX / 32); x++)
      for (let z = Math.floor(o.minZ / 32); z <= Math.floor(o.maxZ / 32); z++) {
        const key = `${x},${z}`;
        const list = this.cells.get(key) ?? [];
        list.push(o);
        this.cells.set(key, list);
      }
    this.indexMilliseconds += performance.now() - began;
  }
  blocked(p: Vec2, radius = 0.45, ignoreWater = false, y?: number) {
    const overBridge = this.bridgeAt?.(p) ?? false;
    if (
      !ignoreWater &&
      this.walkableAt &&
      [
        p,
        { x: p.x - radius, z: p.z },
        { x: p.x + radius, z: p.z },
        { x: p.x, z: p.z - radius },
        { x: p.x, z: p.z + radius },
      ].some((q) => !this.walkableAt!(q))
    )
      return true;
    if (!ignoreWater && !overBridge && this.waterAt?.(p)) return true;
    for (const box of this.boxes) {
      if (
        y !== undefined &&
        (y + radius < (box.minY ?? -Infinity) ||
          y - radius > (box.maxY ?? Infinity))
      )
        continue;
      const c = Math.cos(box.yaw),
        s = Math.sin(box.yaw),
        dx = p.x - box.center.x,
        dz = p.z - box.center.z;
      if (
        Math.hypot(
          Math.max(0, Math.abs(dx * c + dz * s) - box.halfWidth),
          Math.max(0, Math.abs(-dx * s + dz * c) - box.halfLength),
        ) < radius
      )
        return true;
    }
    if (
      this.circles.some(
        (c) =>
          (y === undefined ||
            (y + radius >= (c.minY ?? -Infinity) &&
              y - radius <= (c.maxY ?? Infinity))) &&
          distance(p, c.center) < c.radius + radius,
      )
    )
      return true;
    const found = new Set<Obstacle>();
    for (
      let x = Math.floor((p.x - radius) / 32);
      x <= Math.floor((p.x + radius) / 32);
      x++
    )
      for (
        let z = Math.floor((p.z - radius) / 32);
        z <= Math.floor((p.z + radius) / 32);
        z++
      )
        for (const o of this.cells.get(`${x},${z}`) ?? []) found.add(o);
    for (const o of found) {
      if (o.water && (overBridge || ignoreWater)) continue;
      if (y !== undefined && (y + radius < o.minY || y - radius > o.maxY))
        continue;
      if (
        p.x < o.minX - radius ||
        p.x > o.maxX + radius ||
        p.z < o.minZ - radius ||
        p.z > o.maxZ + radius
      )
        continue;
      if (
        insideRing(
          [p.x, p.z],
          o.points.map((q) => [q.x, q.z]),
        )
      )
        return true;
      for (let i = 0; i < o.points.length; i++)
        if (
          distance(
            p,
            nearestOnSegment(
              p,
              o.points[i],
              o.points[(i + 1) % o.points.length],
            ),
          ) < radius
        )
          return true;
    }
    return false;
  }
  segmentClear(from: Vec2, to: Vec2, radius = 0.45) {
    const steps = Math.max(
      1,
      Math.ceil(distance(from, to) / Math.min(0.2, radius * 0.5)),
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (
        this.blocked(
          { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
          radius,
        )
      )
        return false;
    }
    return true;
  }
  boxBlocked(p: Vec2, yaw: number, halfWidth: number, halfLength: number) {
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const local = (q: Vec2) => ({
      x: (q.x - p.x) * c + (q.z - p.z) * s,
      z: -(q.x - p.x) * s + (q.z - p.z) * c,
    });
    const corners = boxCorners(p, yaw, halfWidth, halfLength);
    if (
      this.boxes.some((b) =>
        boxesOverlap(
          corners,
          boxCorners(b.center, b.yaw, b.halfWidth, b.halfLength),
        ),
      )
    )
      return true;
    if (
      [p, ...corners].some(
        (q) =>
          (this.walkableAt && !this.walkableAt(q)) ||
          (this.waterAt?.(q) && !this.bridgeAt?.(q)),
      )
    )
      return true;
    for (const circle of this.circles) {
      const q = local(circle.center);
      if (
        Math.hypot(
          Math.max(0, Math.abs(q.x) - halfWidth),
          Math.max(0, Math.abs(q.z) - halfLength),
        ) < circle.radius
      )
        return true;
    }
    const radius = Math.hypot(halfWidth, halfLength),
      found = new Set<Obstacle>();
    for (
      let x = Math.floor((p.x - radius) / 32);
      x <= Math.floor((p.x + radius) / 32);
      x++
    )
      for (
        let z = Math.floor((p.z - radius) / 32);
        z <= Math.floor((p.z + radius) / 32);
        z++
      )
        for (const o of this.cells.get(`${x},${z}`) ?? []) found.add(o);
    const cross = (a: Vec2, b: Vec2, q: Vec2) =>
      (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
    for (const o of found) {
      if (o.water && this.bridgeAt?.(p)) continue;
      if (
        corners.some((q) =>
          insideRing(
            [q.x, q.z],
            o.points.map((v) => [v.x, v.z]),
          ),
        )
      )
        return true;
      if (
        o.points.some((q) => {
          const v = local(q);
          return Math.abs(v.x) <= halfWidth && Math.abs(v.z) <= halfLength;
        })
      )
        return true;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < o.points.length; j++) {
          const a = corners[i],
            b = corners[(i + 1) % 4],
            u = o.points[j],
            v = o.points[(j + 1) % o.points.length];
          if (
            cross(a, b, u) * cross(a, b, v) < 0 &&
            cross(u, v, a) * cross(u, v, b) < 0
          )
            return true;
        }
    }
    return false;
  }
  moveBox(
    from: Vec2,
    to: Vec2,
    yaw: number,
    halfWidth: number,
    halfLength: number,
  ) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 0.2));
    let safe = { ...from };
    for (let i = 1; i <= steps; i++) {
      const q = {
        x: from.x + ((to.x - from.x) * i) / steps,
        z: from.z + ((to.z - from.z) * i) / steps,
      };
      if (this.boxBlocked(q, yaw, halfWidth, halfLength)) break;
      safe = q;
    }
    return safe;
  }
  move(from: Vec2, to: Vec2, radius = 0.45): Vec2 {
    const steps = Math.max(
        1,
        Math.ceil(distance(from, to) / Math.max(0.25, radius * 0.6)),
      ),
      dx = (to.x - from.x) / steps,
      dz = (to.z - from.z) / steps;
    let p = { ...from };
    for (let i = 0; i < steps; i++) {
      const next = { x: p.x + dx, z: p.z + dz };
      if (!this.blocked(next, radius)) {
        p = next;
        continue;
      }
      const x = { x: next.x, z: p.z },
        z = { x: p.x, z: next.z };
      if (!this.blocked(x, radius)) p = x;
      else if (!this.blocked(z, radius)) p = z;
    }
    return p;
  }
  closestValid(p: Vec2, radius = 0.45): Vec2 | undefined {
    if (!this.blocked(p, radius)) return p;
    for (let r = 1; r < 45; r += 1.5)
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
        if (!this.blocked(q, radius)) return q;
      }
  }
}
interface PathNode {
  x: number;
  z: number;
  g: number;
  f: number;
  parent?: PathNode;
}
export function findPath(
  from: Vec2,
  target: Vec2,
  world: CollisionWorld,
  radius = 0.45,
): Vec2[] {
  // Planning margin must not trap a body that already fits beside a wall or a stopped bus.
  const clearance = world.blocked(from,radius + 0.08) ? radius : radius + 0.08;
  const destination = world.closestValid(target, clearance);
  if (!destination || world.blocked(from, radius)) return [];
  if (world.segmentClear(from, destination, clearance)) return [destination];
  // Anchor the grid to the exact character position; rounded starts can be inside walls.
  const cell = 1.5;
  const point = (x: number, z: number) => ({
    x: from.x + x * cell,
    z: from.z + z * cell,
  });
  const end = {
    x: (destination.x - from.x) / cell,
    z: (destination.z - from.z) / cell,
  };
  const start: PathNode = { x: 0, z: 0, g: 0, f: 0 };
  const open = [start],
    best = new Map<string, number>(),
    closed = new Set<string>();
  let closest = start,
    reached = false;
  for (let iteration = 0; open.length && iteration < 9000; iteration++) {
    let index = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].f < open[index].f) index = i;
    const node = open.splice(index, 1)[0],
      key = `${node.x},${node.z}`;
    if (closed.has(key)) continue;
    closed.add(key);
    if (
      Math.hypot(node.x - end.x, node.z - end.z) <
      Math.hypot(closest.x - end.x, closest.z - end.z)
    )
      closest = node;
    const current = point(node.x, node.z);
    if (
      distance(current, destination) < cell * 1.5 &&
      world.segmentClear(current, destination, clearance)
    ) {
      closest = node;
      reached = true;
      break;
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const x = node.x + dx,
          z = node.z + dz,
          k = `${x},${z}`,
          g = node.g + Math.hypot(dx, dz);
        if (closed.has(k) || (best.get(k) ?? Infinity) <= g) continue;
        if (!world.segmentClear(current, point(x, z), clearance)) continue;
        best.set(k, g);
        open.push({
          x,
          z,
          g,
          f: g + Math.hypot(x - end.x, z - end.z),
          parent: node,
        });
      }
  }
  const raw: Vec2[] = [];
  let node: PathNode | undefined = closest;
  while (node?.parent) {
    raw.unshift(point(node.x, node.z));
    node = node.parent;
  }
  if (reached) raw.push(destination);
  // Pull visible corners only after checking the entire swept character footprint.
  const result: Vec2[] = [];
  let previous = from,
    i = 0;
  while (i < raw.length) {
    let next = i;
    while (
      next + 1 < raw.length &&
      world.segmentClear(previous, raw[next + 1], clearance)
    )
      next++;
    if (!world.segmentClear(previous, raw[next], radius)) break;
    previous = raw[next];
    result.push(previous);
    i = next + 1;
  }
  return result;
}
export interface Road {
  id: number;
  points: Vec2[];
  width: number;
  name: string;
  kind: string;
  oneway: boolean;
}
export class RoadNetwork {
  roads: Road[];
  private segmentCells = new Map<string, { road: Road; index: number }[]>();
  private graph = new Map<
    string,
    { point: Vec2; edges: { to: string; weight: number }[] }
  >();
  constructor(roads: Road[]) {
    this.roads = roads;
    for (const road of roads) {
      for (let i = 0; i < road.points.length; i++) {
        const p = road.points[i],
          key = this.key(p);
        if (!this.graph.has(key)) this.graph.set(key, { point: p, edges: [] });
        if (i) {
          const segmentStart = road.points[i - 1], segmentEnd = p;
          for (let x = Math.floor(Math.min(segmentStart.x,segmentEnd.x) / 128); x <= Math.floor(Math.max(segmentStart.x,segmentEnd.x) / 128); x++)
            for (let z = Math.floor(Math.min(segmentStart.z,segmentEnd.z) / 128); z <= Math.floor(Math.max(segmentStart.z,segmentEnd.z) / 128); z++) {
              const cell = `${x},${z}`, segments = this.segmentCells.get(cell) ?? [];
              segments.push({ road, index: i }); this.segmentCells.set(cell, segments);
            }
          const previous = road.points[i - 1],
            a = this.key(previous),
            weight = distance(p, previous);
          this.graph.get(a)!.edges.push({ to: key, weight });
          if (!road.oneway) this.graph.get(key)!.edges.push({ to: a, weight });
        }
      }
    }
  }
  private key(p: Vec2) {
    return `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
  }
  nearest(p: Vec2): { point: Vec2; road: Road; index: number } | undefined {
    let best = Infinity,
      result;
    const cx = Math.floor(p.x / 128), cz = Math.floor(p.z / 128);
    const candidates = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) candidates.push(...this.segmentCells.get(`${cx+x},${cz+z}`) ?? []);
    const inspect = (road: Road, i: number) => {
        const q = nearestOnSegment(p, road.points[i - 1], road.points[i]),
          d = distance(p, q);
        if (d < best) {
          best = d;
          result = { point: q, road, index: i };
        }
    };
    for (const { road, index } of candidates) inspect(road, index);
    if (best < 128) return result;
    for (const road of this.roads) for (let i = 1; i < road.points.length; i++) inspect(road, i);
    return result;
  }
  route(from: Vec2, to: Vec2): Vec2[] {
    const a = this.nearest(from), b = this.nearest(to);
    if (!a || !b) return [];
    if (a.road === b.road) {
      const start = a.road.points[a.index-1], end = a.road.points[a.index];
      const forward = b.index > a.index || b.index === a.index &&
        (b.point.x-a.point.x)*(end.x-start.x)+(b.point.z-a.point.z)*(end.z-start.z) >= -0.00001;
      if (!a.road.oneway || forward) {
        const pts = a.road.points.slice(Math.min(a.index,b.index),Math.max(a.index,b.index));
        return [from,a.point,...(a.index <= b.index ? pts : pts.reverse()),b.point,to];
      }
    }
    // Virtual endpoint connectors respect the direction of BOTH snapped road edges.
    const starts = [a.road.points[a.index]];
    if (!a.road.oneway || distance(a.point,a.road.points[a.index-1]) < 0.01) starts.push(a.road.points[a.index-1]);
    const ends = [b.road.points[b.index-1]];
    if (!b.road.oneway || distance(b.point,b.road.points[b.index]) < 0.01) ends.push(b.road.points[b.index]);
    const endCosts = new Map(ends.map(p => [this.key(p),distance(p,b.point)]));
    const costs = new Map<string,number>(), previous = new Map<string,string>();
    const queue = new MinHeap<string>(), visited = new Set<string>();
    for (const p of starts) {
      const key = this.key(p), cost = distance(a.point,p);
      if (cost < (costs.get(key) ?? Infinity)) { costs.set(key,cost); queue.push(key,cost); }
    }
    let bestEnd: string | undefined, bestCost = Infinity;
    while (queue.size) {
      const { value: key, priority: cost } = queue.pop()!;
      if (cost !== costs.get(key)) continue;
      if (cost > bestCost) break;
      if (visited.has(key)) continue;
      visited.add(key);
      const connector = endCosts.get(key);
      if (connector !== undefined && cost+connector < bestCost) { bestEnd=key; bestCost=cost+connector; }
      for (const edge of this.graph.get(key)?.edges ?? []) {
        const next = cost+edge.weight;
        if (next < (costs.get(edge.to) ?? Infinity)) { costs.set(edge.to,next); previous.set(edge.to,key); queue.push(edge.to,next); }
      }
    }
    if (!bestEnd) return [];
    const path: Vec2[] = [];
    let key: string | undefined = bestEnd;
    while (key) { path.unshift(this.graph.get(key)!.point); key = previous.get(key); }
    return [from,a.point,...path,b.point,to];
  }

}

export type NetworkMode = "road" | "rail";
export interface RouteEstimate {
  available: boolean;
  distanceKm: number | null;
  minutes: number | null;
  reason?: string;
}
export const validCoordinate = (p: LonLat) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
  && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const unavailable = (reason: string): RouteEstimate => ({ available: false, distanceKm: null, minutes: null, reason });

/** Imported connectivity only: nearby but distinct coordinates never create an invented junction. */
export class StateRouter {
  private graph = new Map<string, { lonlat: LonLat; edges: { to: string; weight: number }[] }>();
  private cells = new Map<string, string[]>();
  constructor(network: StateNetwork, public mode: NetworkMode = "road") {
    const key = (p: LonLat) => `${p[0]},${p[1]}`;
    for (const feat of network.features) {
      if (feat.kind !== mode || !feat.points.every(validCoordinate)) continue;
      const points = feat.oneway === "-1" ? [...feat.points].reverse() : feat.points;
      for (const p of points) {
        const k = key(p);
        if (this.graph.has(k)) continue;
        this.graph.set(k, { lonlat: p, edges: [] });
        const cell = `${Math.floor(p[0] / .02)},${Math.floor(p[1] / .02)}`;
        const list = this.cells.get(cell) ?? []; list.push(k); this.cells.set(cell, list);
      }
      for (let i = 1; i < points.length; i++) {
        const a = key(points[i - 1]), b = key(points[i]), weight = haversine(points[i - 1], points[i]);
        if (!weight) continue;
        this.graph.get(a)!.edges.push({ to: b, weight });
        if (![true, "yes", "-1"].includes(feat.oneway ?? false)) this.graph.get(b)!.edges.push({ to: a, weight });
      }
    }
  }
  private nearest(p: LonLat) {
    let best = Infinity, key = "";
    const cx = Math.floor(p[0] / .02), cy = Math.floor(p[1] / .02);
    // Search all cells intersecting the maximum permitted endpoint access distance.
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++)
      for (const k of this.cells.get(`${x},${y}`) ?? []) {
        const metres = haversine(this.graph.get(k)!.lonlat, p);
        if (metres < best) { best = metres; key = k; }
      }
    return { key, metres: best };
  }
  estimate(from: LonLat, to: LonLat): RouteEstimate {
    if (!validCoordinate(from) || !validCoordinate(to)) return unavailable("Invalid destination coordinates");
    const a = this.nearest(from), b = this.nearest(to), limit = this.mode === "rail" ? 1000 : 2000;
    if (!a.key || !b.key || a.metres > limit || b.metres > limit) return unavailable(`No imported ${this.mode} connection near these endpoints`);
    const costs = new Map([[a.key, 0]]), queue = new MinHeap<string>();
    queue.push(a.key, 0);
    while (queue.size) {
      const { value: key, priority: cost } = queue.pop()!;
      if (cost !== costs.get(key)) continue;
      if (key === b.key) {
        const km = (cost + a.metres + b.metres) / 1000;
        return { available: true, distanceKm: Math.round(km * 10) / 10,
          minutes: Math.max(1, Math.round(km / (this.mode === "rail" ? 75 : 45) * 60)) };
      }
      for (const edge of this.graph.get(key)!.edges) {
        const next = cost + edge.weight;
        if (next < (costs.get(edge.to) ?? Infinity)) { costs.set(edge.to, next); queue.push(edge.to, next); }
      }
    }
    return unavailable(`Imported ${this.mode} network is disconnected between these locations`);
  }
}

// Network objects are immutable between revisions. Callers that edit geometry must bump version.
const routers = new WeakMap<StateNetwork, { version: StateNetwork["version"]; modes: Map<NetworkMode, StateRouter> }>();
export function estimateJourney(from: LonLat, to: LonLat, mode: NetworkMode | "air", network?: StateNetwork): RouteEstimate & { label: string } {
  if (mode === "air") {
    if (!validCoordinate(from) || !validCoordinate(to)) return { ...unavailable("Invalid coordinates"), label: "Transfer unavailable" };
    const km = Math.round(haversine(from, to) / 1000);
    return { available: true, distanceKm: km, minutes: null, label: `Simulated scene transfer · ${km} km straight-line · no operational flight implied` };
  }
  if (!network) return { ...unavailable("No imported network"), label: "Route unavailable · geographic network not loaded" };
  let cached = routers.get(network);
  if (!cached || cached.version !== network.version) {
    cached = { version: network.version, modes: new Map() }; routers.set(network, cached);
  }
  let router = cached.modes.get(mode);
  if (!router) { router = new StateRouter(network, mode); cached.modes.set(mode, router); }
  const est = router.estimate(from, to);
  if (!est.available) return { ...est, label: `Route unavailable · ${est.reason}` };
  const mins = est.minutes!, hrs = Math.floor(mins / 60), m = mins % 60;
  return { ...est, label: `~${est.distanceKm} km · ~${hrs ? `${hrs}h ${m}m` : `${m}m`} · imported ${mode} geometry, simulated timing` };
}
