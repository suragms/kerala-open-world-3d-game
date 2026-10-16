import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  closestDistrictBoundary,
  districtAt,
  haversine,
  toGeo,
  toLocal,
} from "../src/data/geography";
import {
  CollisionWorld,
  distance,
  findPath,
  RoadNetwork,
} from "../src/game/navigation";
import type { DistrictCollection, Place, Region } from "../src/types";
const boundaries = JSON.parse(
  readFileSync("public/data/districts.geojson", "utf8"),
) as DistrictCollection;
const places = JSON.parse(
  readFileSync("public/data/places.json", "utf8"),
) as Place[];
const regions = JSON.parse(
  readFileSync("public/data/regions.json", "utf8"),
) as Region[];
test("All fourteen source landmarks are within their district or the documented coastal tolerance", () => {
  assert.equal(regions.length, 14);
  assert.equal(new Set(regions.map((r) => r.id)).size, 14);
  for (const r of regions) {
    assert.ok(r.source.startsWith("https://"));
    const district = districtAt([r.lon, r.lat], boundaries);
    if (district !== r.id) {
      const nearest = closestDistrictBoundary([r.lon, r.lat], boundaries);
      assert.equal(nearest.id, r.id);
      assert.ok(nearest.metres < 250);
    }
  }
});
test("Karipur airport is in Malappuram and all four airports are correctly assigned", () => {
  for (const [code, district] of Object.entries({
    CCJ: "malappuram",
    COK: "ernakulam",
    CNN: "kannur",
    TRV: "thiruvananthapuram",
  })) {
    const a = places.find((p) => p.kind === "airport" && p.iata === code);
    assert.ok(a);
    assert.equal(a.district, district);
  }
});
test("No operational stations are invented in Idukki or Wayanad", () => {
  assert.ok(places.filter((p) => p.kind === "station").length > 18);
  assert.equal(
    places.filter(
      (p) => p.kind === "station" && ["idukki", "wayanad"].includes(p.district),
    ).length,
    0,
  );
});
test("Geographic coordinates survive local-origin rebasing with metre-scale distances", () => {
  const origin: [number, number] = [76.2145, 10.5244],
    position = { x: 271.28, z: -399.82 },
    geo = toGeo(position, origin),
    local = toLocal(geo, origin);
  assert.ok(distance(position, local) < 0.000001);
  assert.ok(
    Math.abs(haversine(origin, geo) - Math.hypot(position.x, position.z)) < 1,
  );
});
test("Continuous swept collisions prevent a fast vehicle tunnelling through a wall", () => {
  const world = new CollisionWorld();
  world.add([
    { x: 4, z: -5 },
    { x: 5, z: -5 },
    { x: 5, z: 5 },
    { x: 4, z: 5 },
    { x: 4, z: -5 },
  ]);
  const end = world.move({ x: 0, z: 0 }, { x: 30, z: 0 }, 1);
  assert.ok(end.x < 3.1);
  assert.ok(!world.blocked(end, 1));
});
test("Parked vehicle collision volumes block walking and respect safe exits", () => {
  const world = new CollisionWorld();
  world.circles = [{ center: { x: 0, z: 0 }, radius: 1.8 }];
  assert.ok(world.blocked({ x: 1, z: 0 }, 0.42));
  assert.ok(!world.blocked({ x: 2.3, z: 0 }, 0.42));
  const end = world.move({ x: -5, z: 0 }, { x: 5, z: 0 }, 0.42);
  assert.ok(end.x < -2);
});
test("Sourced bridges allow crossing water while riverbanks stay blocked", () => {
  const world = new CollisionWorld();
  world.waterAt = (p) => p.z > 0;
  world.bridgeAt = (p) => Math.abs(p.x) < 2;
  assert.equal(world.blocked({ x: 0, z: 4 }), false);
  assert.equal(world.blocked({ x: 5, z: 4 }), true);
  assert.equal(world.blocked({ x: 5, z: 4 }, 0.4, true), false);
});
test("Road GPS rejects travel backwards on a one-way road", () => {
  const network = new RoadNetwork([
    {
      id: 1,
      name: "One way",
      width: 6,
      kind: "primary",
      oneway: true,
      points: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
  ]);
  assert.deepEqual(network.route({ x: 18, z: 0 }, { x: 4, z: 0 }), []);
  assert.ok(network.route({ x: 1, z: 0 }, { x: 18, z: 0 }).length);
});
test("Mouse pathfinding walks around an impassable building rather than crossing it", () => {
  const world = new CollisionWorld();
  world.add([
    { x: 6, z: -5 },
    { x: 12, z: -5 },
    { x: 12, z: 5 },
    { x: 6, z: 5 },
    { x: 6, z: -5 },
  ]);
  const route = findPath({ x: 0, z: 0 }, { x: 20, z: 0 }, world);
  assert.ok(route.length > 1);
  assert.ok(distance(route.at(-1)!, { x: 20, z: 0 }) < 1);
  let p = { x: 0, z: 0 };
  for (const q of route) {
    for (let i = 0; i <= 10; i++)
      assert.ok(
        !world.blocked(
          { x: p.x + ((q.x - p.x) * i) / 10, z: p.z + ((q.z - p.z) * i) / 10 },
          0.42,
        ),
      );
    p = q;
  }
});
test("Clicking inside a building finds nearby valid ground", () => {
  const world = new CollisionWorld();
  world.add([
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
    { x: 0, z: 0 },
  ]);
  const route = findPath({ x: -5, z: 5 }, { x: 4, z: 5 }, world);
  assert.ok(route.length);
  assert.ok(!world.blocked(route.at(-1)!, 0.42));
});
test("Road GPS respects connectivity and does not invent a link between extracts", () => {
  const roads = new RoadNetwork([
    {
      id: 1,
      name: "A",
      width: 6,
      kind: "residential",
      oneway: false,
      points: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
    },
    {
      id: 2,
      name: "B",
      width: 6,
      kind: "residential",
      oneway: false,
      points: [
        { x: 10, z: 0 },
        { x: 10, z: 10 },
        { x: 10, z: 20 },
      ],
    },
    {
      id: 3,
      name: "C",
      width: 6,
      kind: "residential",
      oneway: false,
      points: [
        { x: 100, z: 100 },
        { x: 110, z: 100 },
      ],
    },
  ]);
  assert.ok(roads.route({ x: 1, z: 0 }, { x: 10, z: 18 }).length > 3);
  assert.deepEqual(roads.route({ x: 0, z: 0 }, { x: 105, z: 100 }), []);
});
