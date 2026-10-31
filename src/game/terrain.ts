import type { TerrainGrid } from "../types";

export function validTerrain(grid: TerrainGrid) {
  return Number.isInteger(grid.width) && grid.width >= 2 && Number.isInteger(grid.height) && grid.height >= 2
    && grid.width * grid.height === grid.values.length && grid.values.length < 2_000_000
    && Number.isFinite(grid.step) && grid.step > 0 && Number.isFinite(grid.scale) && grid.scale > 0
    && grid.values.every(v => Number.isFinite(v) && v / grid.scale >= -500 && v / grid.scale <= 4000);
}

/** Matches the diagonal used by Three.js PlaneGeometry, so feet and road surfaces share the rendered terrain. */
export function sampleTerrain(grid: TerrainGrid, x: number, z: number): number | undefined {
  const u=(x-grid.minX)/grid.step, v=(z-grid.minZ)/grid.step;
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || v < 0 || u > grid.width-1 || v > grid.height-1) return undefined;
  const ix=Math.min(grid.width-2,Math.floor(u)), iz=Math.min(grid.height-2,Math.floor(v));
  const fx=u-ix, fz=v-iz, index=iz*grid.width+ix;
  const a=grid.values[index], b=grid.values[index+grid.width], c=grid.values[index+grid.width+1], d=grid.values[index+1];
  return (fx+fz <= 1 ? a+(d-a)*fx+(b-a)*fz : c+(b-c)*(1-fx)+(d-c)*(1-fz))/grid.scale;
}
