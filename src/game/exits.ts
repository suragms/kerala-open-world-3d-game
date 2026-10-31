import type { Vec2 } from "../types";
import { CollisionWorld, type CollisionBox, distance } from "./navigation";

/** Search only the left curb beside the passenger door, with a clear swept approach. */
export function curbsideExit(world: CollisionWorld, bus: CollisionBox, doorAlong: number, radius: number,
  height: (x: number, z: number) => number, vehicles: CollisionBox[] = []): Vec2 | undefined {
  const probe = world.withAdditionalBoxes([bus, ...vehicles]);
  const c = Math.cos(bus.yaw), s = Math.sin(bus.yaw);
  const point = (out: number, along: number) => ({
    x: bus.center.x - c * out + s * along,
    z: bus.center.z - s * out - c * along,
  });
  const start = point(bus.halfWidth + radius + .08, doorAlong);
  if (probe.blocked(start, radius)) return undefined;
  for (const out of [bus.halfWidth + radius + .25, 2.7, 3.4, 4.2]) for (const along of [0, -.6, .6, -1.2, 1.2]) {
    const candidate = point(out, doorAlong + along);
    if (!probe.segmentClear(start, candidate, radius)) continue;
    const steps = Math.max(1, Math.ceil(distance(start, candidate) / .25));
    let previous = height(start.x, start.z), safe = Number.isFinite(previous);
    for (let i = 1; i <= steps && safe; i++) {
      const y = height(start.x + (candidate.x - start.x) * i / steps, start.z + (candidate.z - start.z) * i / steps);
      safe = Number.isFinite(y) && Math.abs(y - previous) <= .35; previous = y;
    }
    if (safe) return candidate;
  }
}
