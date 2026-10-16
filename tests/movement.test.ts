import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, Vector3 } from "three";
import { Human } from "../src/game/character";
import { DEFAULT_AVATAR } from "../src/types";
import { CollisionWorld, findPath, distance } from "../src/game/navigation";
import { resolveCamera, resolveFollowCamera } from "../src/game/camera";

test("Both avatar bodies fit their declared standing collision dimensions and animate every joint", () => {
  for (const gender of ["male", "female"] as const) {
    const h = new Human({ ...DEFAULT_AVATAR, gender, outfit: "field" });
    h.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(h.root);
    assert.ok(
      bounds.min.y >= -0.035 && bounds.min.y < 0.04,
      String(bounds.min.y),
    );
    assert.ok(bounds.max.y <= h.dimensions.height + 0.02);
    assert.ok(bounds.max.x < h.dimensions.radius);
    const knees = new Set<number>();
    for (let i = 1; i < 70; i++) {
      h.animate(i / 60, 2.8, 0);
      knees.add(Math.round(h.leftKnee.rotation.x * 100));
    }
    assert.equal(h.motion, "walk");
    assert.ok(knees.size > 10);
    h.animate(1.2, 5.8, 0);
    assert.equal(h.motion, "run");
    h.animate(1.3, 5.8, 0.5, 3);
    assert.equal(h.motion, "jump");
    for (let i = 90; i < 180; i++) h.animate(i / 60, 0, 0);
    assert.equal(h.motion, "idle");
    assert.ok(Math.abs(h.leftElbow.rotation.x + 0.13) < 0.01);
  }
});

test("Camera sweep respects walls at eye height, clears rooftops, and never crosses terrain", () => {
  const world = new CollisionWorld();
  world.add(
    [
      { x: -3, z: 3 },
      { x: 3, z: 3 },
      { x: 3, z: 4 },
      { x: -3, z: 4 },
    ],
    false,
    0,
    3,
  );
  const target = new Vector3(0, 1.3, 0);
  const close = resolveCamera(target, new Vector3(0, 2, 8), world, () => 0);
  assert.ok(close.z < 2.71 && close.z > 2.5);
  assert.ok(!world.blocked(close, 0.3, true, close.y));
  const high = resolveCamera(
    new Vector3(0, 5, 0),
    new Vector3(0, 6, 8),
    world,
    () => 0,
  );
  assert.equal(high.z, 8);
  const low = resolveCamera(target, new Vector3(0, -2, -8), world, () => 0);
  assert.ok(low.y >= 0.3);
  const ridge = resolveCamera(target, new Vector3(0, 2, -8), world, (_x, z) =>
    z < -4 ? 3 : 0,
  );
  assert.ok(ridge.z > -4);
  const wallTarget = new Vector3(0, 1.25, 2.6);
  const tight = resolveFollowCamera(
    wallTarget,
    new Vector3(0, 3, 9),
    world,
    () => 0,
  );
  assert.ok(tight.y >= wallTarget.y + 2);
  assert.ok(tight.distanceTo(wallTarget) > 2);
  assert.ok(!world.blocked(tight, 0.3, true, tight.y));
});

test("Pathfinding handles a non-grid starting position, thin unclosed walls and both avatar radii", () => {
  const world = new CollisionWorld();
  world.add([
    { x: 1, z: -4 },
    { x: 1.1, z: -4 },
    { x: 1.1, z: 4 },
    { x: 1, z: 4 },
  ]);
  for (const radius of [0.35, 0.38]) {
    let previous = { x: 0.43, z: 0.71 };
    const target = { x: 8, z: 0.71 };
    const path = findPath(previous, target, world, radius);
    assert.ok(path.length > 1);
    assert.ok(distance(path.at(-1)!, target) < 0.01);
    for (const point of path) {
      assert.ok(world.segmentClear(previous, point, radius));
      previous = point;
    }
    assert.ok(world.blocked({ x: 0.8, z: 0 }, radius));
  }
});

test("The full vehicle footprint stops its bumper at a thin wall and cannot rotate into it", () => {
  const world = new CollisionWorld();
  world.add([
    { x: -8, z: -5 },
    { x: 8, z: -5 },
    { x: 8, z: -5.1 },
    { x: -8, z: -5.1 },
  ]);
  const stopped = world.moveBox(
    { x: 0, z: 0 },
    { x: 0, z: -30 },
    0,
    1.13,
    2.25,
  );
  assert.ok(stopped.z >= -2.75);
  assert.ok(!world.boxBlocked(stopped, 0, 1.13, 2.25));
  assert.ok(world.boxBlocked({ x: 0, z: -3 }, 0, 1.13, 2.25));
  assert.ok(!world.boxBlocked({ x: 0, z: -3 }, Math.PI / 2, 1.13, 2.25));
});

test("Rotated parked vehicle bodies block their bumpers and leave real door clearance", () => {
  const world = new CollisionWorld(),
    yaw = 0.65;
  world.boxes = [
    {
      center: { x: 0, z: 0 },
      yaw,
      halfWidth: 1.13,
      halfLength: 2.25,
      minY: 0,
      maxY: 2.1,
    },
  ];
  const front = { x: Math.sin(yaw) * 2.15, z: -Math.cos(yaw) * 2.15 };
  assert.ok(world.blocked(front, 0.38));
  assert.ok(
    !world.blocked({ x: Math.cos(yaw) * 2.3, z: Math.sin(yaw) * 2.3 }, 0.38),
  );
  assert.ok(!world.blocked(front, 0.3, true, 3));
  assert.ok(world.boxBlocked({ x: 0, z: 2 }, 0, 1, 2));
  assert.ok(!world.boxBlocked({ x: 8, z: 0 }, Math.PI / 2, 1, 2));
});

test("The entire character footprint respects the playable boundary", () => {
  const world = new CollisionWorld();
  world.walkableAt = (p) => Math.abs(p.x) < 10 && Math.abs(p.z) < 10;
  assert.ok(world.blocked({ x: 9.8, z: 0 }, 0.38));
  const safe = world.closestValid({ x: 9.8, z: 0 }, 0.38)!;
  assert.ok(!world.blocked(safe, 0.38));
});

test("Walking plants the foot as it travels backward and lifts it for the forward swing", () => {
  const h = new Human({ ...DEFAULT_AVATAR });
  const planted: number[] = [],
    swing: number[] = [];
  let previous = new Vector3();
  for (let i = 1; i < 240; i++) {
    h.animate(i / 60, 2.8, 0);
    h.root.updateMatrixWorld(true);
    const foot = h.leftFoot.getWorldPosition(new Vector3());
    if (i > 60) {
      if (foot.z - previous.z < -0.002) planted.push(foot.y);
      if (foot.z - previous.z > 0.002) swing.push(foot.y);
    }
    previous = foot;
  }
  const mean = (values: number[]) =>
    values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(
    mean(swing) > mean(planted) + 0.04,
    JSON.stringify({ planted: mean(planted), swing: mean(swing) }),
  );
});
