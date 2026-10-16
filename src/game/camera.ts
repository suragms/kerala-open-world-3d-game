import { Vector3 } from "three";
import type { CollisionWorld } from "./navigation";

/** Sweep the camera sphere, including its near plane, from the look target. */
export function resolveCamera(
  target: Vector3,
  desired: Vector3,
  world: CollisionWorld,
  height: (x: number, z: number) => number,
  radius = 0.3,
) {
  const length = target.distanceTo(desired);
  const steps = Math.max(1, Math.ceil(length / 0.18));
  const p = new Vector3();
  const blocked = (t: number) => {
    p.copy(target).lerp(desired, t);
    return (
      p.y - radius < height(p.x, p.z) || world.blocked(p, radius, true, p.y)
    );
  };
  let safe = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(t)) {
      let high = t,
        low = safe;
      for (let j = 0; j < 8; j++) {
        const mid = (low + high) / 2;
        if (blocked(mid)) high = mid;
        else low = mid;
      }
      return target
        .clone()
        .lerp(desired, Math.max(0, low - 0.02 / Math.max(length, 0.01)));
    }
    safe = t;
  }
  return desired.clone();
}

export function resolveFollowCamera(
  target: Vector3,
  desired: Vector3,
  world: CollisionWorld,
  height: (x: number, z: number) => number,
  bodyClearance = 1.2,
) {
  const safe = resolveCamera(target, desired, world, height);
  if (target.distanceTo(safe) >= bodyClearance) return safe;
  // At a wall, lift above the shoulders instead of placing the lens inside the avatar.
  const overhead = target.clone().lerp(safe, 0.45);
  overhead.y = target.y + Math.max(2.4, bodyClearance + 0.6);
  return resolveCamera(target, overhead, world, height);
}
