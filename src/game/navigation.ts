import { insideRing, haversine } from "../data/geography";
import type { Vec2, LonLat, StateNetwork } from "../types";
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
  add(points: Vec2[], water = false, minY = -Infinity, maxY = Infinity) {
    if (points.length < 3) return;
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
  const clearance = radius + 0.08;
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
    for (const road of this.roads)
      for (let i = 1; i < road.points.length; i++) {
        const q = nearestOnSegment(p, road.points[i - 1], road.points[i]),
          d = distance(p, q);
        if (d < best) {
          best = d;
          result = { point: q, road, index: i };
        }
      }
    return result;
  }
  route(from: Vec2, to: Vec2): Vec2[] {
    const a = this.nearest(from),
      b = this.nearest(to);
    if (!a || !b) return [];
    if (a.road === b.road) {
      if (a.road.oneway) {
        const point = a.road.points[a.index - 1],
          next = a.road.points[a.index];
        if (
          b.index < a.index ||
          (b.index === a.index &&
            (b.point.x - a.point.x) * (next.x - point.x) +
              (b.point.z - a.point.z) * (next.z - point.z) <
              0)
        )
          return [];
      }
      const lo = Math.min(a.index, b.index),
        hi = Math.max(a.index, b.index);
      const pts = a.road.points.slice(lo, hi);
      return [
        from,
        a.point,
        ...(a.index <= b.index ? pts : pts.reverse()),
        b.point,
        to,
      ];
    }
    const start = this.key(a.road.points[a.index]),
      end = this.key(b.road.points[b.index]);
    const costs = new Map([[start, 0]]),
      previous = new Map<string, string>(),
      queue = [start],
      visited = new Set<string>();
    while (queue.length) {
      queue.sort((a, b) => costs.get(a)! - costs.get(b)!);
      const k = queue.shift()!;
      if (k === end) break;
      if (visited.has(k)) continue;
      visited.add(k);
      for (const edge of this.graph.get(k)?.edges ?? []) {
        const cost = costs.get(k)! + edge.weight;
        if (cost < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, cost);
          previous.set(edge.to, k);
          queue.push(edge.to);
        }
      }
    }
    if (!costs.has(end)) return [];
    const path = [to, b.point];
    let k: string | undefined = end;
    while (k) {
      path.unshift(this.graph.get(k)!.point);
      k = previous.get(k);
    }
    return [from, a.point, ...path];
  }
}

export class StateRouter {
  private graph = new Map<
    string,
    { lonlat: LonLat; edges: { to: string; weight: number }[] }
  >();
  constructor(network: StateNetwork) {
    for (const feat of network.features) {
      const points = feat.points;
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        const k1 = `${p1[0].toFixed(4)},${p1[1].toFixed(4)}`;
        const k2 = `${p2[0].toFixed(4)},${p2[1].toFixed(4)}`;
        if (!this.graph.has(k1)) this.graph.set(k1, { lonlat: p1, edges: [] });
        if (!this.graph.has(k2)) this.graph.set(k2, { lonlat: p2, edges: [] });
        const weight = haversine(p1, p2);
        this.graph.get(k1)!.edges.push({ to: k2, weight });
        this.graph.get(k2)!.edges.push({ to: k1, weight });
      }
    }
  }
  private nearestKey(p: LonLat): string {
    let best = Infinity,
      bestKey = "";
    for (const [k, node] of this.graph) {
      const d = haversine(node.lonlat, p);
      if (d < best) {
        best = d;
        bestKey = k;
      }
    }
    return bestKey;
  }
  estimate(from: LonLat, to: LonLat): { distanceKm: number; minutes: number } {
    const startKey = this.nearestKey(from);
    const endKey = this.nearestKey(to);
    if (!startKey || !endKey) {
      const d = haversine(from, to);
      return { distanceKm: Math.round(d), minutes: Math.round(d * 1.5) };
    }
    if (startKey === endKey) {
      const d = haversine(from, to);
      return { distanceKm: Math.round(d), minutes: Math.round(d * 1.5) };
    }
    const costs = new Map([[startKey, 0]]);
    const previous = new Map<string, string>();
    const queue = [startKey];
    const visited = new Set<string>();
    while (queue.length) {
      queue.sort((a, b) => costs.get(a)! - costs.get(b)!);
      const k = queue.shift()!;
      if (k === endKey) break;
      if (visited.has(k)) continue;
      visited.add(k);
      for (const edge of this.graph.get(k)?.edges ?? []) {
        const cost = costs.get(k)! + edge.weight;
        if (cost < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, cost);
          previous.set(edge.to, k);
          queue.push(edge.to);
        }
      }
    }
    const dist = costs.get(endKey) ?? haversine(from, to);
    return { distanceKm: Math.round(dist), minutes: Math.round(dist * 1.4) };
  }
}

let cachedRouter: StateRouter | null = null;
export function estimateJourney(
  from: LonLat,
  to: LonLat,
  mode: "road" | "rail" | "air",
  network?: StateNetwork,
): { distanceKm: number; minutes: number; label: string } {
  const straight = haversine(from, to);
  if (mode === "air") {
    const km = Math.max(25, Math.round(straight * 1.15));
    const mins = Math.max(35, Math.round(km * 0.85 + 45));
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    const timeLabel = hrs ? `${hrs}h ${m}m flight incl. check-in` : `${m}m flight`;
    return { distanceKm: km, minutes: mins, label: `~${km} km · ~${timeLabel}` };
  }
  if (network) {
    if (!cachedRouter) cachedRouter = new StateRouter(network);
    const est = cachedRouter.estimate(from, to);
    const speedFactor = mode === "rail" ? 75 : 45;
    const mins = Math.max(10, Math.round((est.distanceKm / speedFactor) * 60));
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    const timeLabel = hrs ? `${hrs}h ${m}m` : `${m}m`;
    return { distanceKm: est.distanceKm, minutes: mins, label: `~${est.distanceKm} km · ~${timeLabel}` };
  }
  const km = Math.round(straight * 1.25);
  const mins = Math.round(km * 1.3);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return { distanceKm: km, minutes: mins, label: `~${km} km · ~${hrs ? `${hrs}h ${m}m` : `${m}m`}` };
}
