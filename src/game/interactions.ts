import type { Vec2 } from "../types";
import { distance } from "./navigation";

export interface InteractionTarget {
  id: string; label: string; point: Vec2; range: number;
  available: () => boolean; execute: () => void;
}
/** Mouse, keyboard and controller resolve the same targets and eligibility checks. */
export class InteractionManager {
  targets: InteractionTarget[] = [];
  resolve(position: Vec2, id?: string) {
    return this.targets.filter(t => (!id || t.id === id) && t.available() && distance(position, t.point) <= t.range)
      .sort((a,b) => distance(position,a.point) - distance(position,b.point))[0];
  }
  interact(position: Vec2, id?: string) {
    const target = this.resolve(position, id);
    if (!target) return false;
    target.execute(); return true;
  }
}
