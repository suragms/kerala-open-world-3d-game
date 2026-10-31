import * as THREE from "three";
import { toLocal } from "../data/geography";
import type { GeoFeature, Region, Settings, Tile, Vec2 } from "../types";
import {
  bake,
  bakeSteps,
  banana,
  box,
  broadleaf,
  busStop,
  cylinder,
  disposeGroup,
  initTextures,
  keralaHouse,
  landmarkModel,
  material,
  mesh,
  palette,
  palm,
  platformCanopy,
  roof,
  seeded,
  sign,
} from "./assets";
import {
  CollisionWorld,
  distance,
  RoadNetwork,
  nearestOnSegment,
} from "./navigation";
import type { Road } from "./navigation";
import { sampleTerrain } from "./terrain";

export interface LocalFeature {
  source: GeoFeature;
  points: Vec2[];
  center: Vec2;
}
const SIZE = 160;
const roadWidths: Record<string, number> = {
  motorway: 18,
  trunk: 15,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  unclassified: 6,
  service: 4,
  living_street: 5,
  track: 3.6,
  footway: 1.7,
  path: 1.4,
  pedestrian: 4,
  steps: 2,
};
export const isDriveable = (kind: string) =>
  !["footway", "path", "steps", "cycleway", "pedestrian"].includes(kind);
function offsetPolyline(points: Vec2[], offset: number) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      length = distance(a, b) || 1;
    return {
      x: p.x - ((b.z - a.z) / length) * offset,
      z: p.z + ((b.x - a.x) / length) * offset,
    };
  });
}
export class World {
  root = new THREE.Group();
  collisions = new CollisionWorld();
  roads: Road[] = [];
  railways: Vec2[][] = [];
  metroTracks: Vec2[][] = [];
  runways: Vec2[][] = [];
  streetlights = new Map<string, Vec2[]>();
  network: RoadNetwork;
  walkingNetwork: RoadNetwork;
  landmark: THREE.Group;
  landmarkPosition: Vec2;
  spawn: Vec2;
  localFeatures: LocalFeature[] = [];
  busStopPositions: Vec2[] = [];
  private chunkBusStops = new Map<string,Vec2[]>();
  chunks = new Map<string, THREE.Group>();
  private featureChunks = new Map<string, LocalFeature[]>();
  private createdChunks = 0;
  private disposedChunks = 0;
  private maxChunkMilliseconds = 0;
  private lastChunk = "";
  private lastLookahead = "";
  private building?: { key: string; group: THREE.Group; work: Generator<void | string>; cpu: number; stage: string };
  private maxSliceMilliseconds = 0;
  private completedCpu: number[] = [];
  private cancelledChunks = 0;
  private stageMilliseconds: Record<string,number> = {};
  private terrainMilliseconds = 0;
  private maxTerrainMilliseconds = 0;
  private queue: string[] = [];
  private wanted = new Set<string>();
  private ground: THREE.Mesh;
  private groundBase={x:0,z:0};
  private waterMaterial: THREE.MeshPhysicalMaterial;
  constructor(
    public scene: THREE.Scene,
    public tile: Tile,
    public region: Region,
    public settings: Settings,
  ) {
    initTextures();
    const walkRoads: Road[] = [];
    scene.add(this.root);
    this.landmarkPosition = toLocal([region.lon, region.lat], tile.origin);
    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: "#679d93",
      roughness: 0.28,
      metalness: 0,
      clearcoat: 1,
      transparent: true,
      opacity: 0.92,
    });
    // Shared by independently unloaded water chunks; the World owns its disposal.
    this.waterMaterial.userData.transient = false;
    for (const source of tile.features) {
      const points = source.points.map((p) => toLocal(p, tile.origin));
      if (!points.length) continue;
      const center = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        z: points.reduce((s, p) => s + p.z, 0) / points.length,
      };
      const f = { source, points, center };
      this.localFeatures.push(f);
      const tags = source.tags;
      if (tags.highway && source.type !== "node") {
        const kind = tags.highway,
          width = roadWidths[kind] ?? 5;
        const road = {
          id: source.id,
          points: tags.oneway === "-1" ? [...points].reverse() : points,
          width,
          name: tags["name:en"] ?? tags.name ?? kind.replaceAll("_", " "),
          kind,
          oneway: ["yes", "-1"].includes(tags.oneway),
        };
        if (isDriveable(kind)) this.roads.push(road);
        walkRoads.push({ ...road, oneway: false });
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
          const steps = Math.max(1, Math.ceil(distance(a, b) / 70));
          for (let j = 0; j < steps; j++) {
            const start = { x: a.x + (b.x-a.x)*j/steps, z: a.z + (b.z-a.z)*j/steps };
            const end = { x: a.x + (b.x-a.x)*(j+1)/steps, z: a.z + (b.z-a.z)*(j+1)/steps };
            this.assign({ source, points: [start, end], center: { x: (start.x+end.x)/2, z: (start.z+end.z)/2 } });
          }
        }
      } else if (tags.railway) {
        if (!tags.service && tags.railway === "rail")
          this.railways.push(points);
        if (["subway", "light_rail"].includes(tags.railway))
          this.metroTracks.push(points);
        this.assign(f);
      } else if (tags.aeroway === "runway") {
        if (distance(points[0], points[points.length - 1]) > 1)
          this.runways.push(points);
        this.assign(f);
      } else {
        this.assign(f);
        if (tags.building && !(tags.amenity === "bus_station" && tags.building === "construction") && distance(center, this.landmarkPosition) > 28) {
          const elevations=points.map(p=>this.height(p.x,p.z));
          const base = Math.min(...elevations), top=Math.max(...elevations);
          this.collisions.add(
            points,
            false,
            base,
            top +
              (Number(tags.height) ||
                Math.max(1, Math.min(7, Number(tags["building:levels"]) || 2)) *
                  3.2) +
              1,
          );
        }
        if (
          (tags.natural === "water" || tags.water) &&
          points.length > 3 &&
          distance(points[0], points[points.length - 1]) < 1
        )
          this.collisions.add(points, true);
        if (["river", "canal"].includes(tags.waterway))
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i],
              length = distance(a, b) || 1,
              w = tags.waterway === "river" ? 11 : 2,
              ox = (-(b.z - a.z) / length) * w,
              oz = ((b.x - a.x) / length) * w;
            this.collisions.add(
              [
                { x: a.x + ox, z: a.z + oz },
                { x: a.x - ox, z: a.z - oz },
                { x: b.x - ox, z: b.z - oz },
                { x: b.x + ox, z: b.z + oz },
                { x: a.x + ox, z: a.z + oz },
              ],
              true,
            );
          }
      }
    }
    const bridges = this.localFeatures.filter(
      (f) => f.source.tags.highway && f.source.tags.bridge,
    );
    this.collisions.bridgeAt = (p) =>
      bridges.some((f) =>
        f.points
          .slice(1)
          .some(
            (b, i) =>
              distance(p, nearestOnSegment(p, f.points[i], b)) <
              (roadWidths[f.source.tags.highway] ?? 5) * 0.45,
          ),
      );
    this.network = new RoadNetwork(this.roads);
    this.walkingNetwork = new RoadNetwork(walkRoads);
    const nearRoad = this.network.nearest({
      x: this.landmarkPosition.x,
      z: this.landmarkPosition.z + 35,
    });
    const initial = nearRoad
      ? nearRoad.point
      : { x: this.landmarkPosition.x + 8, z: this.landmarkPosition.z + 35 };
    const scenicArrival = {
      x: this.landmarkPosition.x,
      z: this.landmarkPosition.z + (this.region.theme === "stadium" ? 125 : 43),
    };
    this.spawn =
      this.collisions.closestValid(scenicArrival, 1.2) ??
      this.collisions.closestValid(initial, 1.2) ??
      initial;
    this.collisions.walkableAt = (p) =>
      Math.abs(p.x) < tile.radius - 75 && Math.abs(p.z) < tile.radius - 75;
    if (region.asset !== "bus-terminal") this.collisions.add(
      [
        { x: this.landmarkPosition.x - 15, z: this.landmarkPosition.z - 14 },
        { x: this.landmarkPosition.x + 15, z: this.landmarkPosition.z - 14 },
        { x: this.landmarkPosition.x + 15, z: this.landmarkPosition.z + 12 },
        { x: this.landmarkPosition.x - 15, z: this.landmarkPosition.z + 12 },
        { x: this.landmarkPosition.x - 15, z: this.landmarkPosition.z - 14 },
      ],
      false,
      this.height(this.landmarkPosition.x, this.landmarkPosition.z),
      this.height(this.landmarkPosition.x, this.landmarkPosition.z) + 24,
    );
    const terrainBegan=performance.now();
    const gridStep=tile.terrain ? tile.terrain.step/(settings.quality === "low" ? 1 : settings.quality === "medium" ? 2 : 4) : 5200/256;
    const halfExtent=Math.ceil(2600/gridStep)*gridStep, divisions=Math.round(halfExtent*2/gridStep);
    const geometry = new THREE.PlaneGeometry(halfExtent*2, halfExtent*2, divisions, divisions);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.getAttribute("position");
    const colors: number[] = [];
    const rng = seeded(region.id.length * 918);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      const color = new THREE.Color(
        region.theme === "beach"
          ? "#92916a"
          : region.theme === "tea"
            ? "#526849"
            : "#68704c",
      );
      color.multiplyScalar(0.86 + rng() * 0.27);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const groundMat = palette.grass.clone();
    groundMat.map = palette.grass.map!.clone();
    groundMat.map.repeat.set(520, 520);
    groundMat.vertexColors = true;
    groundMat.color.set("#ffffff");
    groundMat.userData.transient = true;
    this.ground = new THREE.Mesh(geometry, groundMat);
    this.ground.receiveShadow = true;
    this.root.add(this.ground);
    this.terrainMilliseconds=performance.now()-terrainBegan; this.maxTerrainMilliseconds=this.terrainMilliseconds;
    this.landmark = region.asset === "bus-terminal" ? new THREE.Group() : landmarkModel(region.theme, region.landmark);
    this.landmark.position.set(
      this.landmarkPosition.x,
      this.height(this.landmarkPosition.x, this.landmarkPosition.z),
      this.landmarkPosition.z,
    );
    bake(this.landmark);
    this.root.add(this.landmark);
    this.addLandmarkSurroundings();
    this.addWater();
    this.addAirfield();
    const safe = this.collisions.closestValid(this.spawn, 1.2);
    if (safe) this.spawn = safe;
    else {
      const candidates = this.roads
        .flatMap((r) => r.points)
        .filter((p) => !this.collisions.blocked(p, 1.2))
        .sort(
          (a, b) =>
            distance(a, this.landmarkPosition) -
            distance(b, this.landmarkPosition),
        );
      if (candidates[0]) this.spawn = candidates[0];
    }
    this.updateStreaming(this.spawn, true);
  }
  height(x: number, z: number) {
    if (this.tile.terrain) { const sourced=sampleTerrain(this.tile.terrain,x,z); if (sourced !== undefined) return sourced; }
    if (this.region.theme === "tea" || this.region.id === "wayanad")
      return (
        Math.sin(x * 0.003) * 8 +
        Math.sin(z * 0.004) * 5 +
        Math.sin((x + z) * 0.001) * 15
      );
    return 0;
  }
  private assign(feature: LocalFeature) {
    const key = `${Math.floor(feature.center.x / SIZE)},${Math.floor(feature.center.z / SIZE)}`;
    const list = this.featureChunks.get(key) ?? [];
    list.push(feature);
    this.featureChunks.set(key, list);
  }
  private polygon(
    points: Vec2[],
    height = 0.02,
    mat: THREE.Material = palette.grass,
  ) {
    if (points.length < 3) return;
    const shape = new THREE.Shape(
        points.map((p) => new THREE.Vector2(p.x, -p.z)),
      ),
      geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++)
      p.setY(i, this.height(p.getX(i), p.getZ(i)) + height);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }
  private addLandmarkSurroundings() {
    const g = new THREE.Group(),
      p = this.landmarkPosition,
      y = this.height(p.x, p.z);
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2,
        range = 42 + (i % 3) * 8;
      const point={x:p.x+Math.cos(angle)*range,z:p.z+Math.sin(angle)*range}, road=this.network.nearest(point);
      if (this.collisions.blocked(point,2) || road && distance(point,road.point)<road.road.width/2+3) continue;
      palm(
        g,
        point.x,
        this.height(point.x,point.z),
        point.z,
        0.95 + (i % 4) * 0.12,
        i + 12,
      );
    }
    for (const side of [-1, 1]) {
      const bench = new THREE.Group();
      bench.position.set(p.x + side * 24, this.height(p.x+side*24,p.z+25), p.z + 25);
      box(bench, palette.wood, 0, 0.6, 0, 2.3, 0.15, 0.6);
      box(bench, palette.wood, 0, 1, 0.28, 2.3, 0.7, 0.13);
      for (const x of [-0.9, 0.9])
        box(bench, palette.dark, x, 0.3, 0, 0.1, 0.6, 0.55);
      g.add(bench);
    }
    bake(g);
    this.root.add(g);
    if (!this.tile.terrain && (this.region.theme === "tea" || this.region.id === "wayanad")) {
      const hills = new THREE.Group();
      const rng = seeded(873);
      for (let i = 0; i < 22; i++) {
        const a = (i * Math.PI * 2) / 22,
          r = 1200 + rng() * 600;
        const mountain = mesh(
          hills,
          new THREE.ConeGeometry(260 + rng() * 350, 220 + rng() * 270, 16),
          material(i % 2 ? "#597368" : "#6f8577"),
          Math.cos(a) * r,
          90,
          Math.sin(a) * r,
        );
        mountain.scale.z = 1.5;
      }
      bake(hills);
      this.root.add(hills);
    }
  }
  private addWater() {
    const g = new THREE.Group(),
      coast = this.localFeatures.filter(
        (f) => f.source.tags.natural === "coastline",
      );
    if (coast.length) {
      const segments = coast.flatMap((f) =>
        f.points.slice(1).map((b, i) => ({ a: f.points[i], b })),
      );
      const waterAt = (p: Vec2) => {
        let nearest = Infinity,
          water = false;
        for (const { a, b } of segments) {
          const q = nearestOnSegment(p, a, b),
            d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
          if (d < nearest) {
            nearest = d;
            water = (b.x - a.x) * (p.z - q.z) - (b.z - a.z) * (p.x - q.x) > 0;
          }
        }
        return water;
      };
      this.collisions.waterAt = waterAt;
      // Sea geometry is generated with nearby chunks. A district-length corridor must
      // never allocate an ocean mesh across its entire rectangular bounding box.
      for (const f of coast)
        this.ribbon(f.points, 8, material("#c7b693"), g, 0.025);
    }
    for (const f of this.localFeatures) {
      const t = f.source.tags;
      if (t.natural === "water" || t.water) {
        const lake = this.polygon(f.points, 0.15, this.waterMaterial);
        if (lake) g.add(lake);
      } else if (t.waterway && t.waterway !== "dam")
        this.ribbon(
          f.points,
          t.waterway === "river" ? 22 : 4,
          this.waterMaterial,
          g,
          0.14,
        );
    }
    this.root.add(g);
  }
  private ribbon(
    points: Vec2[],
    width: number,
    mat: THREE.Material,
    group: THREE.Group,
    lift = 0.08,
  ) {
    const expanded: Vec2[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        steps = Math.max(1, Math.ceil(distance(a, b) / 8));
      if (i === 1) expanded.push(a);
      for (let j = 1; j <= steps; j++)
        expanded.push({
          x: a.x + ((b.x - a.x) * j) / steps,
          z: a.z + ((b.z - a.z) * j) / steps,
        });
    }
    points = expanded;
    const positions: number[] = [],
      uv: number[] = [];
    let travel = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        len = distance(a, b);
      if (len < 0.01) continue;
      const dx = (b.x - a.x) / len,
        dz = (b.z - a.z) / len,
        ox = (-dz * width) / 2,
        oz = (dx * width) / 2;
      const corners = [
        [a.x + ox, a.z + oz],
        [a.x - ox, a.z - oz],
        [b.x + ox, b.z + oz],
        [b.x - ox, b.z - oz],
      ];
      for (const [n, u, v] of [
        [0, 0, travel / 4],
        [2, 0, (travel + len) / 4],
        [1, 1, travel / 4],
        [1, 1, travel / 4],
        [2, 0, (travel + len) / 4],
        [3, 1, (travel + len) / 4],
      ]) {
        const c = corners[n];
        positions.push(c[0], this.height(c[0], c[1]) + lift, c[1]);
        uv.push((u * width) / 4, v);
      }
      travel += len;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  private addAirfield() {
    const g = new THREE.Group();
    for (const feature of this.localFeatures) {
      const t = feature.source.tags;
      if (
        t.aeroway === "runway" &&
        distance(feature.points[0], feature.points[feature.points.length - 1]) <
          1
      ) {
        const surface = this.polygon(feature.points, 0.08, palette.asphalt);
        if (surface) g.add(surface);
        continue;
      }
      if (t.aeroway === "runway" || t.aeroway === "taxiway") {
        this.ribbon(
          feature.points,
          t.aeroway === "runway" ? Number(t.width) || 45 : 15,
          palette.asphalt,
          g,
          0.09,
        );
        if (t.aeroway === "runway")
          for (let i = 1; i < feature.points.length; i++) {
            const a = feature.points[i - 1],
              b = feature.points[i],
              length = distance(a, b),
              dx = (b.x - a.x) / length,
              dz = (b.z - a.z) / length;
            for (let d = 0; d < length; d += 40) {
              const x = a.x + dx * d,
                z = a.z + dz * d,
              m = box(g, palette.white, x, this.height(x,z)+0.12, z, 0.6, 0.02, 15);
              m.rotation.y = Math.atan2(dx, dz);
              for (const side of [-1, 1])
                cylinder(
                  g,
                  material("#f4dc9a"),
                  x + dz * 24 * side,
                  this.height(x+dz*24*side,z-dx*24*side)+0.2,
                  z - dx * 24 * side,
                  0.15,
                  0.35,
                );
            }
          }
      } else if (t.aeroway === "apron") {
        const surface = this.polygon(feature.points, 0.06, material("#a3a394"));
        if (surface) g.add(surface);
      }
    }
    bake(g);
    this.root.add(g);
  }
  private *createChunk(key: string, group: THREE.Group): Generator<void | string> {
    const [cx, cz] = key.split(",").map(Number);
    group.name = `Geographic chunk ${key}`;
    const lights: Vec2[] = [];
    const stops: Vec2[] = [];
    const rng = seeded(cx * 72847 + cz * 3143 + 9191);
    const features = this.featureChunks.get(key) ?? [];
    for (const f of features) {
      const t = f.source.tags;
      yield t.highway ? "roads" : t.building ? "buildings" : t.railway ? "rail" : "other-features";
      if (t.highway && f.source.type !== "node") {
        const width = roadWidths[t.highway] ?? 5;
        if (width >= 6)
          this.ribbon(
            f.points,
            width + 2.4,
            material("#9b9786"),
            group,
            t.bridge ? 0.2 : 0.045,
          );
        this.ribbon(
          f.points,
          width,
          isDriveable(t.highway) ? palette.asphalt : material("#b6ac91"),
          group,
          t.bridge ? 0.24 : 0.07,
        );
        if (width >= 7) {
          const a = f.points[0],
            b = f.points[1],
            length = distance(a, b),
            dx = (b.x - a.x) / length,
            dz = (b.z - a.z) / length;
          for (let d = 1; d < length - 1; d += 9) {
            const x = a.x + dx * d,
              z = a.z + dz * d,
              m = box(
                group,
                material("#cbc6a8"),
                x,
                this.height(x, z) + 0.095,
                z,
                0.1,
                0.015,
                Math.min(3, length - d),
              );
            m.rotation.y = Math.atan2(dx, dz);
          }
          for (const side of [-1, 1]) {
            const offset = {
              x: -dz * (width / 2 - 0.2) * side,
              z: dx * (width / 2 - 0.2) * side,
            };
            this.ribbon(
              f.points.map((p) => ({ x: p.x + offset.x, z: p.z + offset.z })),
              0.1,
              material("#c8c5ad"),
              group,
              0.1,
            );
          }
        }
        if (width >= 6 && rng() > 0.62) {
          const a = f.points[0],
            b = f.points[1],
            length = distance(a, b),
            ox = (-(b.z - a.z) / length) * (width / 2 + 1.6),
            oz = ((b.x - a.x) / length) * (width / 2 + 1.6);
          const x = f.center.x + ox,
            z = f.center.z + oz;
          const y = this.height(x, z);
          lights.push({ x: x + 1.2, z });
          cylinder(group, palette.dark, x, y + 3.8, z, 0.09, 7.6);
          box(group, palette.dark, x + 0.7, y + 7.5, z, 1.5, 0.09, 0.12);
          box(group, material("#f4dc9a"), x + 1.2, y + 7.4, z, 0.5, 0.05, 0.22);
        }
      } else if (t.building && !(t.amenity === "bus_station" && t.building === "construction") && distance(f.center, this.landmarkPosition) > 32) {
        const minX = Math.min(...f.points.map((p) => p.x)),
          maxX = Math.max(...f.points.map((p) => p.x)),
          minZ = Math.min(...f.points.map((p) => p.z)),
          maxZ = Math.max(...f.points.map((p) => p.z)),
          w = maxX - minX,
          d = maxZ - minZ;
        if (w > 100 || d > 100 || w < 1 || d < 1) continue;
        const levels = Math.max(
            1,
            Math.min(
              7,
              Number(t["building:levels"]) || 1 + Math.floor(rng() * 2),
            ),
          ),
          floorHeight = Number(t.height) || levels * 3.2,
          elevations=f.points.map(p=>this.height(p.x,p.z)),
          base = Math.min(...elevations),
          foundationTop = Math.max(...elevations),
          h = floorHeight+foundationTop-base;
        const shape = new THREE.Shape(
          f.points.map(
            (p) => new THREE.Vector2(p.x - f.center.x, -p.z + f.center.z),
          ),
        );
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: h,
          bevelEnabled: false,
        });
        geo.rotateX(-Math.PI / 2);
        const walls = ["#d7c8a6", "#b4bfb0", "#c7b394", "#d1cdb9", "#bfb09b"];
        mesh(
          group,
          geo,
          material(walls[f.source.id % walls.length]),
          f.center.x,
          base,
          f.center.z,
        );
        if (w < 30 && d < 35)
          roof(
            group,
            f.center.x,
            base + h,
            f.center.z,
            w + 1,
            d + 1,
            Math.min(3, Math.min(w, d) * 0.3),
          );
        else
          box(
            group,
            palette.wall,
            f.center.x,
            base + h + 0.12,
            f.center.z,
            w,
            0.25,
            d,
          );
        for (let floor = 0; floor < Math.min(4, levels); floor++)
          for (let x = minX + 1.7; x < maxX - 1; x += 3) {
            box(
              group,
              palette.wood,
              x,
              foundationTop + floor * 3.2 + 1.9,
              maxZ + 0.04,
              1.05,
              1.35,
              0.06,
            );
            box(
              group,
              material("#53665c", 0.35),
              x,
              foundationTop + floor * 3.2 + 1.9,
              maxZ + 0.08,
              0.88,
              1.15,
              0.04,
            );
          }
        if (rng() > 0.75 && w < 20) banana(group, maxX + 1, base, maxZ + 1);
      } else if (["rail", "light_rail", "subway"].includes(t.railway)) {
        const elevated =
            ["subway", "light_rail"].includes(t.railway) &&
            (!!t.bridge || Number(t.layer) > 0),
          lift = elevated ? 7.5 : 0;
        this.ribbon(
          f.points,
          elevated ? 6 : 3.5,
          material("#9a9e92"),
          group,
          lift + 0.1,
        );
        for (const side of [-1, 1])
          this.ribbon(
            offsetPolyline(f.points, side * 0.75),
            0.09,
            material("#858986", 0.4, 0.6),
            group,
            lift + 0.22,
          );
        if (elevated)
          for (let i = 1; i < f.points.length; i++) {
            const a = f.points[i - 1],
              b = f.points[i],
              length = distance(a, b),
              steps = Math.ceil(length / 24);
            for (let j = 0; j < steps; j++) {
              const x = a.x + ((b.x - a.x) * j) / steps,
                z = a.z + ((b.z - a.z) * j) / steps;
              cylinder(
                group,
                palette.wall,
                x,
                this.height(x, z) + lift / 2,
                z,
                0.65,
                lift,
              );
            }
          }
      } else if (t.railway === "platform") {
        platformCanopy(group, f.points, (x,z)=>this.height(x,z));
      } else if (t.highway === "bus_stop" && f.source.type === "node") {
        const p = f.points[0];
        if (p) {
          const y = this.height(p.x, p.z);
          busStop(group, p.x, y, p.z);
          stops.push({ x: p.x, z: p.z });
        }
      } else if (t.landuse || t.leisure) {
        const poly = this.polygon(
          f.points,
          0.016,
          t.landuse === "farmland" ? material("#7b854c") : material("#52623b"),
        );
        if (poly) group.add(poly);
      }
    }
    const count =
      this.settings.quality === "low"
        ? 7
        : this.settings.quality === "medium"
          ? 14
          : 23;
    for (let i = 0; i < count; i++) {
      yield "vegetation";
      const p = { x: cx * SIZE + rng() * SIZE, z: cz * SIZE + rng() * SIZE };
      if (
        distance(p, this.landmarkPosition) < 50 ||
        this.collisions.blocked(p, 3)
      )
        continue;
      const nearest = this.network.nearest(p);
      if (nearest && distance(p, nearest.point) < nearest.road.width / 2 + 3)
        continue;
      const y = this.height(p.x, p.z);
      if (this.region.theme === "tea") {
        for (let j = 0; j < 6; j++) {
          const x = p.x + j * 2;
          const plant = mesh(
            group,
            new THREE.SphereGeometry(1, 6, 4),
            palette.leaf,
            x,
            this.height(x, p.z) + 0.5,
            p.z,
            1.3,
            0.6,
            1.5,
          );
          plant.rotation.y = rng();
        }
      } else if (i % 4 === 0)
        broadleaf(group, p.x, y, p.z, 1 + rng() * 0.4, i + cx * 13);
      else palm(group, p.x, y, p.z, 0.7 + rng() * 0.6, i + cz * 13);
    }
    // Low-cost grass tufts add close-ground detail without alpha-heavy foliage.
    if (this.settings.quality !== "low")
      for (let i = 0; i < 45; i++) {
        yield "vegetation";
        const x = cx * SIZE + rng() * SIZE,
          z = cz * SIZE + rng() * SIZE,
          p = { x, z };
        if (this.collisions.blocked(p) || distance(p, this.spawn) < 8) continue;
        const n = this.network.nearest(p);
        if (n && distance(p, n.point) < n.road.width / 2 + 1) continue;
        const m = mesh(
          group,
          new THREE.ConeGeometry(0.15, 0.5, 3),
          palette.leafLight,
          x,
          this.height(x, z) + 0.2,
          z,
        );
        m.rotation.z = (rng() - 0.5) * 0.4;
      }
    if (this.collisions.waterAt) {
      const [cx,cz]=key.split(",").map(Number), vertices:number[]=[];
      const step=16;
      for(let x=cx*SIZE;x<(cx+1)*SIZE;x+=step) for(let z=cz*SIZE;z<(cz+1)*SIZE;z+=step) {
        if (this.collisions.waterAt({x:x+step/2,z:z+step/2})) vertices.push(x,.1,z,x,.1,z+step,x+step,.1,z,x+step,.1,z,x,.1,z+step,x+step,.1,z+step);
      }
      if(vertices.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry,this.waterMaterial));}
    }
    yield "bake-and-instancing";
    yield* bakeSteps(group);
    this.root.add(group);
    this.streetlights.set(key, lights);
    this.chunks.set(key, group);
    this.createdChunks++;
    this.chunkBusStops.set(key,stops);
    this.busStopPositions = [...this.chunkBusStops.values()].flat();

  }
  updateStreaming(position: Vec2, immediate = false, lookahead?: Vec2) {
    if (this.tile.id.startsWith("corridor-")) {
      const block=this.tile.terrain ? this.tile.terrain.step*4 : 512;
      const x=Math.floor(position.x/block)*block, z=Math.floor(position.z/block)*block;
      if (x!==this.groundBase.x || z!==this.groundBase.z) {
        const terrainBegan=performance.now();
        this.groundBase={x,z}; this.ground.position.set(x,0,z);
        if (this.tile.terrain) {
          const p=this.ground.geometry.getAttribute("position");
          for(let i=0;i<p.count;i++)p.setY(i,this.height(p.getX(i)+x,p.getZ(i)+z));
          p.needsUpdate=true;this.ground.geometry.computeVertexNormals();this.ground.geometry.computeBoundingSphere();
        }
        const cost=performance.now()-terrainBegan;this.terrainMilliseconds+=cost;this.maxTerrainMilliseconds=Math.max(this.maxTerrainMilliseconds,cost);
      }
    }
    const cx = Math.floor(position.x / SIZE),
      cz = Math.floor(position.z / SIZE),
      key = `${cx},${cz}`,
      range = this.settings.quality === "low" ? 1 : 2;
    const aheadKey = lookahead ? `${Math.floor(lookahead.x / SIZE)},${Math.floor(lookahead.z / SIZE)}` : "";
    if (key !== this.lastChunk || aheadKey !== this.lastLookahead || immediate) {
      this.lastLookahead = aheadKey;
      this.lastChunk = key;
      this.wanted.clear();
      for (let dx = -range; dx <= range; dx++)
        for (let dz = -range; dz <= range; dz++) {
          const k = `${cx + dx},${cz + dz}`;
          this.wanted.add(k);
        }
      if (lookahead) {
        const ax = Math.floor(lookahead.x / SIZE), az = Math.floor(lookahead.z / SIZE);
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) this.wanted.add(`${ax+x},${az+z}`);
      }
      if (this.building && !this.wanted.has(this.building.key)) this.cancelBuild();
      for (const [k, g] of this.chunks)
        if (!this.wanted.has(k)) {
          disposeGroup(g);
          this.chunks.delete(k);
          this.streetlights.delete(k);
          this.chunkBusStops.delete(k);
          this.busStopPositions = [...this.chunkBusStops.values()].flat();
          this.disposedChunks++;
        }
      this.queue = [...this.wanted]
        .filter((k) => !this.chunks.has(k) && k !== this.building?.key)
        .sort((a, b) => {
          const [ax, az] = a.split(",").map(Number),
            [bx, bz] = b.split(",").map(Number);
          return Math.hypot(ax - cx, az - cz) - Math.hypot(bx - cx, bz - cz);
        });
    }
    // Soft time budget with an operation cap; single geometry operations cannot be preempted.
    const began = performance.now(), budget = immediate ? 8 : 4;
    for (let operations = 0; operations < 256 && performance.now() - began < budget; operations++) {
      if (!this.building) {
        const next = this.queue.shift(); if (!next) break;
        if (this.chunks.has(next) || !this.wanted.has(next)) continue;
        const group = new THREE.Group();
        this.building = { key: next, group, work: this.createChunk(next,group), cpu: 0, stage: "preparation" };
      }
      const build = this.building, stepStart = performance.now();
      const result = build.work.next(), cost = performance.now() - stepStart; build.cpu += cost;
      this.stageMilliseconds[build.stage]=(this.stageMilliseconds[build.stage]??0)+cost;
      if (typeof result.value === "string") build.stage=result.value;
      if (result.done) {
        this.maxChunkMilliseconds = Math.max(this.maxChunkMilliseconds,build.cpu);
        this.completedCpu.push(build.cpu); if (this.completedCpu.length > 256) this.completedCpu.shift();
        this.building = undefined;
      }
    }
    this.maxSliceMilliseconds = Math.max(this.maxSliceMilliseconds,performance.now()-began);
  }
  nearestRoadName(position: Vec2) {
    return this.network.nearest(position)?.road.name ?? this.region.town;
  }
  private cancelBuild() {
    if (!this.building) return;
    this.building.work.return(undefined); disposeGroup(this.building.group); this.building = undefined; this.cancelledChunks++;
  }
  streamingStats() { return { created: this.createdChunks, disposed: this.disposedChunks, queued: this.queue.length + Number(Boolean(this.building)),
    stageMilliseconds: { ...this.stageMilliseconds }, terrainMilliseconds:this.terrainMilliseconds, maxTerrainMilliseconds:this.maxTerrainMilliseconds,
    collisionIndexMilliseconds:this.collisions.indexMilliseconds,
    cancelled: this.cancelledChunks, wanted: [...this.wanted], building: this.building?.key,
    maxChunkMilliseconds: Math.round(this.maxChunkMilliseconds * 100)/100,
    maxSliceMilliseconds: Math.round(this.maxSliceMilliseconds * 100)/100,
    meanChunkMilliseconds: this.completedCpu.length ? this.completedCpu.reduce((a,b)=>a+b,0)/this.completedCpu.length : 0 }; }
  groundHit(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.ground)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : undefined;
  }
  updateSettings(settings: Settings) {
    const changed = settings.quality !== this.settings.quality;
    this.settings = settings;
    if (changed) {
      this.cancelBuild(); this.queue = []; this.wanted.clear();
      for (const g of this.chunks.values()) disposeGroup(g);
      this.chunks.clear();
      this.streetlights.clear();
      this.chunkBusStops.clear(); this.busStopPositions = [];
      this.lastChunk = "";
    }
  }
  dispose() {
    this.cancelBuild(); this.queue = []; this.wanted.clear(); this.streetlights.clear();
    disposeGroup(this.root);
    this.waterMaterial.dispose();
    this.chunks.clear();
    this.chunkBusStops.clear(); this.busStopPositions = [];
  }
}
