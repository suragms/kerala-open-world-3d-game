import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Theme, Vec2 } from "../types";

export function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}
export const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string, roughness = 0.85, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    );
  return materials.get(key)!;
}
export const palette = {
  grass: material("#53633d"),
  sand: material("#c7b48e"),
  wall: material("#dfd1ae"),
  stone: material("#665b4b"),
  wood: material("#48372a"),
  roof: material("#8d4d34"),
  dark: material("#222d2a"),
  white: material("#e8e4cc"),
  gold: material("#b99954", 0.4, 0.45),
  leaf: material("#395f31"),
  leafLight: material("#55793e"),
  trunk: material("#79705a"),
  asphalt: material("#51534d"),
};
function textured(
  base: THREE.MeshStandardMaterial,
  kind: "ground" | "roof" | "road" | "wall",
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!,
    rng = seeded(123);
  ctx.fillStyle =
    kind === "ground" ? "#ddddda" : `#${base.color.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const n = rng();
    ctx.fillStyle = n > 0.5 ? "rgba(255,255,229,.07)" : "rgba(0,0,0,.09)";
    ctx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 2);
  }
  if (kind === "roof") {
    ctx.strokeStyle = "rgba(26,18,12,.25)";
    for (let x = 0; x < 256; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y < 256; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
  if (kind === "wall") {
    ctx.strokeStyle = "rgba(38,28,19,.2)";
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
      for (let x = y % 64 ? 16 : 0; x < 256; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  base.map = texture;
  base.color.set("#ffffff");
  base.needsUpdate = true;
  return base;
}
let texturesReady = false;
export function initTextures() {
  if (texturesReady) return;
  texturesReady = true;
  textured(palette.grass, "ground");
  textured(palette.roof, "roof");
  textured(palette.stone, "wall");
  textured(palette.asphalt, "road");
}
const boxGeometry = new THREE.BoxGeometry(1, 1, 1),
  sphereGeometry = new THREE.SphereGeometry(1, 12, 8),
  cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
export function mesh(
  group: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
export const box = (
  group: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) => mesh(group, boxGeometry, mat, x, y, z, w, h, d);
export const sphere = (
  group: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) => mesh(group, sphereGeometry, mat, x, y, z, w, h, d);
export const cylinder = (
  group: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
) => mesh(group, cylinderGeometry, mat, x, y, z, r, h, r);
export function beam(
  group: THREE.Object3D,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
) {
  const m = cylinder(
    group,
    mat,
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    (a.z + b.z) / 2,
    r,
    a.distanceTo(b),
  );
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return m;
}
export function roofGeometry(w: number, d: number, h: number) {
  const v = [
    [-w / 2, 0, -d / 2],
    [w / 2, 0, -d / 2],
    [w / 2, 0, d / 2],
    [-w / 2, 0, d / 2],
    [0, h, -d * 0.23],
    [0, h, d * 0.23],
  ];
  const faces = [
      [0, 1, 4],
      [1, 2, 5],
      [1, 5, 4],
      [2, 3, 5],
      [3, 0, 4],
      [3, 4, 5],
      [3, 2, 1],
      [3, 1, 0],
    ],
    pos: number[] = [],
    uv: number[] = [];
  for (const f of faces)
    for (const i of [...f].reverse()) {
      pos.push(...v[i]);
      uv.push(v[i][0] / 3, v[i][2] / 3 + v[i][1] / 3);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
export function roof(
  group: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  mat: THREE.Material = palette.roof,
) {
  return mesh(group, roofGeometry(w, d, h), mat, x, y, z);
}

/** Bake static props by material. Mesh bounds remain per geographic chunk. */
export function bake(group: THREE.Group) {
  for (const _step of bakeSteps(group)) { /* Startup/static models can finish synchronously. */ }
  return group;
}
export function* bakeSteps(group: THREE.Group): Generator<void> {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    rootInverse = group.matrixWorld.clone().invert();
  const remove: THREE.Object3D[] = [];
  const fronds = new Map<THREE.Material, THREE.Matrix4[]>();
  const objects: THREE.Object3D[] = [];
  group.traverse(obj => objects.push(obj));
  const scratch = new Set<THREE.BufferGeometry>();
  try {
  for (const obj of objects) {
    yield;
    if (
      !(obj instanceof THREE.Mesh) ||
      Array.isArray(obj.material) ||
      obj.userData.keep
    )
      continue;
    if (obj.geometry === frondGeometry) {
      const matrices = fronds.get(obj.material) ?? [];
      matrices.push(rootInverse.clone().multiply(obj.matrixWorld));
      fronds.set(obj.material, matrices);
      remove.push(obj);
      continue;
    }
    const g = obj.geometry.index
      ? obj.geometry.toNonIndexed()
      : obj.geometry.clone();
    scratch.add(g);
    for (const attribute of Object.keys(g.attributes))
      if (!["position", "normal", "uv"].includes(attribute))
        g.deleteAttribute(attribute);
    g.applyMatrix4(rootInverse.clone().multiply(obj.matrixWorld));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (!g.getAttribute("uv"))
      g.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(g.getAttribute("position").count * 2),
          2,
        ),
      );
    const list = byMaterial.get(obj.material) ?? [];
    list.push(g);
    byMaterial.set(obj.material, list);
    remove.push(obj);
  }
  for (const obj of remove) {
    obj.removeFromParent();
    if (
      obj instanceof THREE.Mesh &&
      ![boxGeometry, sphereGeometry, cylinderGeometry, frondGeometry].includes(
        obj.geometry,
      )
    )
      obj.geometry.dispose();
  }
  for (const [mat, matrices] of fronds) {
    yield;
    const instanced = new THREE.InstancedMesh(
      frondGeometry,
      mat,
      matrices.length,
    );
    matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    group.add(instanced);
  }
  for (const [mat, list] of byMaterial) {
    yield;
    const geometry = mergeGeometries(list, false);
    list.forEach((g) => { g.dispose(); scratch.delete(g); });
    if (geometry) {
      const m = new THREE.Mesh(geometry, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  const empty: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o !== group && o instanceof THREE.Group && o.children.length === 0)
      empty.push(o);
  });
  empty.forEach((o) => o.removeFromParent());
  } finally { scratch.forEach(g => g.dispose()); }
}
export function disposeGroup(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const transient = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.Line
    ) {
      if (
        obj.geometry !== boxGeometry &&
        obj.geometry !== sphereGeometry &&
        obj.geometry !== cylinderGeometry &&
        obj.geometry !== frondGeometry
      )
        geometries.add(obj.geometry);
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.userData.transient) transient.add(m);
      });
    }
  });
  geometries.forEach((g) => g.dispose());
  transient.forEach((m) => {
    if ("map" in m) (m as THREE.MeshBasicMaterial).map?.dispose();
    m.dispose();
  });
  root.removeFromParent();
}

const frondGeometry = (() => {
  const p: number[] = [],
    uv: number[] = [],
    segments = 11;
  for (let i = 0; i < segments; i++) {
    const t = i / segments,
      u = (i + 1) / segments;
    const pt = (v: number, side: number) => [
      side * Math.sin(v * Math.PI) * 0.45 * (v > 0.8 ? 0.5 : 1),
      Math.sin(v * Math.PI) * 0.75 - v * v * 0.75,
      v * 4.2,
    ];
    const a = pt(t, -1),
      b = pt(t, 1),
      c = pt(u, -1),
      d = pt(u, 1);
    p.push(...a, ...b, ...c, ...b, ...d, ...c);
    uv.push(0, t, 1, t, 0, u, 1, t, 1, u, 0, u);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
})();
palette.leaf.side = THREE.DoubleSide;
palette.leafLight.side = THREE.DoubleSide;
export function palm(
  group: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scale = 1,
  seed = 1,
) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  const rng = seeded(seed);
  const lean = (rng() - 0.5) * 1.5;
  for (let i = 0; i < 6; i++)
    beam(
      g,
      palette.trunk,
      new THREE.Vector3(lean * (i / 6) ** 2, i * 1.2, 0),
      new THREE.Vector3(lean * ((i + 1) / 6) ** 2, (i + 1) * 1.2, 0),
      0.21 - i * 0.014,
    );
  for (let i = 0; i < 9; i++) {
    const leaf = mesh(
      g,
      frondGeometry,
      i % 2 ? palette.leaf : palette.leafLight,
      lean,
      7.15,
      0,
    );
    leaf.rotation.y = (i * Math.PI * 2) / 9 + rng() * 0.15;
    leaf.rotation.x = (rng() - 0.5) * 0.5;
    leaf.scale.setScalar(0.85 + rng() * 0.3);
  }
  for (let i = 0; i < 4; i++)
    sphere(
      g,
      palette.wood,
      lean + Math.sin(i) * 0.24,
      6.98,
      Math.cos(i) * 0.22,
      0.18,
      0.22,
      0.18,
    );
  group.add(g);
  return g;
}
export function broadleaf(
  group: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  s = 1,
  seed = 1,
) {
  cylinder(group, palette.trunk, x, y + 2.5 * s, z, 0.22 * s, 5 * s);
  const rng = seeded(seed);
  for (let i = 0; i < 4; i++)
    sphere(
      group,
      i % 2 ? palette.leafLight : palette.leaf,
      x + (rng() - 0.5) * 3 * s,
      y + (4 + rng() * 2) * s,
      z + (rng() - 0.5) * 3 * s,
      2.3 * s,
      1.8 * s,
      2.3 * s,
    );
}
export function banana(group: THREE.Object3D, x: number, y: number, z: number) {
  cylinder(group, palette.leafLight, x, y + 1.5, z, 0.13, 3);
  for (let i = 0; i < 5; i++) {
    const m = mesh(
      group,
      frondGeometry,
      palette.leaf,
      x,
      y + 2.8,
      z,
      0.85,
      0.7,
      0.6,
    );
    m.rotation.y = i * 1.25;
    m.rotation.x = -0.25;
  }
}

export function sign(
  group: THREE.Object3D,
  text: string,
  x: number,
  y: number,
  z: number,
  w = 5,
  subtitle = "",
  color = "#1b493b",
  angle = 0,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 768, 256);
  ctx.strokeStyle = "#c8bd91";
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 744, 232);
  ctx.fillStyle = "#f3efdb";
  ctx.textAlign = "center";
  ctx.font = `600 ${text.length > 24 ? 32 : 44}px system-ui`;
  ctx.fillText(text, 384, subtitle ? 109 : 145, 710);
  if (subtitle) {
    ctx.font = "25px system-ui";
    ctx.fillStyle = "#d4c9a4";
    ctx.fillText(subtitle, 384, 171, 710);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
  mat.userData.transient = true;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = angle;
  const m = mesh(g, new THREE.PlaneGeometry(w, w / 3), mat);
  m.userData.keep = true;
  box(g, palette.wood, 0, -w / 6 - 1.2, 0, 0.13, 2.5, 0.13);
  group.add(g);
  return g;
}

export function keralaHouse(
  group: THREE.Object3D,
  w: number,
  d: number,
  h: number,
  seed: number,
  shop = false,
) {
  const rng = seeded(seed),
    walls = ["#d3c09a", "#dcd4b6", "#a5bbb2", "#ca9d7c", "#c5c6ae", "#e4d7be"];
  const wall = material(walls[Math.floor(rng() * walls.length)]);
  box(group, palette.stone, 0, 0.3, 0, w + 0.5, 0.6, d + 0.5);
  box(group, wall, 0, h / 2 + 0.5, 0, w, h, d);
  roof(group, 0, h + 0.5, 0, w + 1.9, d + 1.9, Math.min(3, w * 0.28));
  const count = Math.max(1, Math.floor(w / 3.5));
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / count;
    box(group, palette.wood, x, 2.2, d / 2 + 0.055, 1.25, 1.5, 0.12);
    box(
      group,
      material("#52645b", 0.28, 0.1),
      x,
      2.2,
      d / 2 + 0.14,
      1.02,
      1.25,
      0.04,
    );
    box(group, palette.wall, x, 2.2, d / 2 + 0.2, 0.06, 1.25, 0.05);
    box(group, palette.wall, x, 2.2, d / 2 + 0.2, 1.02, 0.06, 0.05);
  }
  box(group, palette.wood, 0, 1.55, d / 2 + 0.1, 1.1, 2.15, 0.15);
  box(group, palette.stone, 0, 0.25, d / 2 + 1, 3, 0.3, 2);
  if (shop) {
    box(group, material("#b77a46"), 0, 3.5, d / 2 + 1.5, w, 0.15, 3);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2])
      cylinder(group, palette.dark, x, 1.8, d / 2 + 2.7, 0.07, 3.6);
    for (let i = 0; i < 5; i++) {
      box(
        group,
        palette.wood,
        -w / 2 + 1 + i * 1.2,
        0.65,
        d / 2 + 1.5,
        0.9,
        1.2,
        0.8,
      );
      sphere(
        group,
        material(i % 2 ? "#a6993f" : "#ac7c3e"),
        -w / 2 + 1 + i * 1.2,
        1.35,
        d / 2 + 1.5,
        0.35,
        0.25,
        0.3,
      );
    }
  }
}

export function landmarkModel(theme: Theme, name: string) {
  const g = new THREE.Group();
  if (theme === "junction") {
    sign(g, name.toUpperCase(), -10, 3, 8, 10, "KUNDANNOOR · KOCHI");
  } else if (theme === "airport") {
    box(g, palette.wall, 0, 4, 0, 90, 8, 28);
    box(g, material("#668b8c", 0.18, 0.35), 0, 4.2, 14.1, 84, 6, 0.15);
    roof(g, 0, 8, 0, 96, 33, 5);
    roof(g, -31, 8.8, 0, 25, 35, 4);
    roof(g, 31, 8.8, 0, 25, 35, 4);
    for (let x = -42; x <= 42; x += 7)
      cylinder(g, palette.white, x, 4.5, 18, 0.25, 9);
    box(g, palette.white, 0, 8.8, 19, 94, 0.3, 10);
    for (let x = -35; x < 36; x += 7)
      box(g, palette.dark, x, 1.8, 14.23, 3, 3.5, 0.08);
    box(g, palette.stone, 0, 0.1, 25, 110, 0.2, 20);
    sign(
      g,
      name.toUpperCase(),
      -30,
      3.5,
      35,
      13,
      "PUBLIC TERMINAL · SIMULATED TRAVEL",
    );
    const tower = new THREE.Group();
    box(tower, palette.wall, 0, 9, 0, 5, 18, 5);
    box(tower, material("#426a6e", 0.2, 0.3), 0, 19, 0, 8, 3, 8);
    roof(tower, 0, 20.6, 0, 9, 9, 2);
    tower.position.set(66, 0, -15);
    g.add(tower);
  } else if (theme === "station") {
    box(g, palette.wall, 0, 2.8, 0, 55, 5.6, 12);
    roof(g, 0, 5.6, 0, 59, 16, 3);
    box(g, material("#a76443"), 0, 0.3, 12, 74, 0.6, 14);
    for (let x = -28; x <= 28; x += 7) {
      box(g, palette.dark, x, 2.1, 6.1, 3, 3.5, 0.15);
      cylinder(g, palette.wood, x, 2.2, 15, 0.15, 4.4);
    }
    roof(g, 0, 4.5, 14, 68, 10, 1.8);
    sign(
      g,
      name.toUpperCase(),
      -24,
      3.4,
      24,
      12,
      "RAILWAY ARRIVAL · SIMPLIFIED GAME SERVICE",
    );
  } else if (theme === "mall") {
    const glass = material("#829b94", 0.2, 0.3);
    box(g, palette.wall, 0, 9, 0, 65, 18, 40);
    box(g, glass, 0, 9, 20.05, 55, 14, 0.1);
    for (let x = -28; x <= 28; x += 8)
      box(g, palette.white, x, 9, 20.18, 0.5, 17, 0.2);
    box(g, palette.stone, 0, 0.2, 28, 72, 0.4, 18);
    box(g, palette.wood, 0, 16, 20.3, 38, 3, 0.3);
    sign(g, name.toUpperCase(), -19, 4.1, 33, 12, "PUBLIC EXTERIOR · KOCHI");
    for (let i = 0; i < 7; i++) palm(g, -38 + i * 13, 0, 37, 0.8, i);
  } else if (theme === "stadium") {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const section = box(
        g,
        palette.wall,
        Math.cos(a) * 45,
        6,
        Math.sin(a) * 35,
        10,
        12,
        10,
      );
      section.rotation.y = -a;
      const seat = box(
        g,
        material(i % 2 ? "#51786c" : "#b6a86c"),
        Math.cos(a) * 39,
        7,
        Math.sin(a) * 30,
        7,
        1,
        10,
      );
      seat.rotation.y = -a;
      beam(
        g,
        palette.dark,
        new THREE.Vector3(Math.cos(a) * 49, 0, Math.sin(a) * 39),
        new THREE.Vector3(Math.cos(a) * 49, 19, Math.sin(a) * 39),
        0.22,
      );
    }
    sign(g, "JAWAHARLAL NEHRU STADIUM", -39, 3, 53, 10, "KALOOR · KOCHI");
  } else if (theme === "hub") {
    box(g, palette.stone, 0, 0.12, 0, 90, 0.25, 55);
    for (let x = -30; x <= 30; x += 15) {
      roof(g, x, 5, 0, 12, 35, 2);
      for (const z of [-12, 12]) cylinder(g, palette.white, x, 2.5, z, 0.2, 5);
      box(g, palette.wall, x, 0.4, 0, 10, 0.8, 35);
    }
    sign(
      g,
      name.toUpperCase(),
      -27,
      4,
      32,
      14,
      "BUS TERMINAL · SIMULATED TRAVEL",
    );
  } else if (theme === "temple") {
    box(g, palette.stone, 0, 0.3, 0, 32, 0.6, 40);
    box(g, palette.wall, 0, 2.1, -12, 28, 3.6, 1);
    for (const x of [-14, 14]) box(g, palette.wall, x, 1.9, 0, 1, 3.2, 24);
    // Original layered Kerala gopuram exterior; no access to the religious interior.
    for (let level = 0; level < 3; level++) {
      const w = 11 - level * 2.5,
        h = 3 - level * 0.2,
        y = 0.6 + level * 3.2;
      box(
        g,
        level === 0 ? palette.wall : palette.wood,
        0,
        y + h / 2,
        8,
        w,
        h,
        5.4 - level,
      );
      roof(g, 0, y + h, 8, w + 3, 7.6 - level, 1.6 - level * 0.2);
      if (level === 0) {
        box(g, palette.dark, 0, 2, 10.73, 3.3, 3.1, 0.12);
        for (let x = -4.5; x <= 4.5; x += 1.5) {
          box(g, palette.wood, x, 2.2, 10.85, 0.18, 3.1, 0.25);
          box(g, palette.gold, x, 3.7, 10.9, 0.4, 0.2, 0.3);
        }
      } else
        for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2)
          box(
            g,
            palette.gold,
            x,
            y + h * 0.5,
            10 - level * 0.5,
            0.2,
            1.3,
            0.15,
          );
    }
    cylinder(g, palette.gold, 0, 12.2, 8, 0.12, 2);
    sphere(g, palette.gold, 0, 13.25, 8, 0.23, 0.3, 0.23);
    roof(g, 0, 4, -7, 14, 13, 3.2);
    box(g, palette.wood, 0, 2, -7, 11, 4, 10);
    roof(g, 0, 7, -7, 9, 9, 2.6);
    for (let x = -12; x <= 12; x += 3) {
      cylinder(g, palette.wood, x, 2.1, -11.3, 0.12, 3);
    }
    for (let i = 0; i < 7; i++)
      box(g, palette.stone, 0, 0.08 + i * 0.06, 14 - i * 0.5, 8, 0.16, 1);
    sign(g, name.toUpperCase(), -20, 2.4, 18, 6, "EXTERIOR HERITAGE VIEW");
  } else if (theme === "fort") {
    const fort = material("#826b4d");
    box(g, fort, 0, 2.2, -12, 46, 4.4, 3);
    for (const x of [-22, 22]) {
      box(g, fort, x, 2.2, 0, 3, 4.4, 28);
      const tower = cylinder(g, fort, x, 2.5, 13, 5, 5);
      tower.geometry = new THREE.CylinderGeometry(5, 5.8, 5, 16);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        box(
          g,
          fort,
          x + Math.cos(a) * 4.8,
          5.3,
          13 + Math.sin(a) * 4.8,
          0.8,
          1,
          0.8,
        );
      }
    }
    for (let x = -21; x < 23; x += 2.5) box(g, fort, x, 4.8, -12, 1.2, 1.1, 3);
    box(g, palette.dark, 0, 1.6, -10.4, 4, 3.2, 0.15);
    box(g, fort, 0, 0.3, 1, 40, 0.6, 23);
    sign(g, name.toUpperCase(), 0, 2.6, 20, 9, "COASTAL HERITAGE · EXTERIOR");
  } else if (theme === "fishing") {
    for (let i = 0; i < 3; i++) {
      const x = i * 18 - 18;
      const a = new THREE.Vector3(x, 0, 0),
        b = new THREE.Vector3(x, 12, -5);
      beam(g, palette.wood, a, b, 0.23);
      beam(g, palette.wood, new THREE.Vector3(x - 7, 0, 4), b, 0.15);
      beam(g, palette.wood, new THREE.Vector3(x + 7, 0, 4), b, 0.15);
      beam(g, palette.wood, b, new THREE.Vector3(x, 5, -18), 0.14);
      const netMat = new THREE.MeshStandardMaterial({
        color: "#958c6d",
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      netMat.userData.transient = true;
      const net = mesh(
        g,
        new THREE.PlaneGeometry(14, 14, 12, 12),
        netMat,
        x,
        1,
        -18,
      );
      net.rotation.x = -Math.PI / 2;
      for (const z of [-4, 3]) box(g, palette.wood, x, 0.2, z, 15, 0.4, 1.3);
    }
    sign(g, "FORT KOCHI", 0, 3, 10, 9, "CHINESE FISHING NETS");
  } else if (theme === "dam") {
    box(g, palette.stone, 0, 2.5, -12, 85, 5, 13);
    box(g, palette.white, 0, 5.3, -12, 85, 0.25, 14);
    for (let x = -40; x < 42; x += 3)
      box(g, palette.white, x, 6.1, -5.5, 0.15, 1.6, 0.15);
    box(g, palette.white, 0, 6.7, -5.5, 84, 0.12, 0.15);
    sign(g, name.toUpperCase(), 0, 3.1, 10, 11, "RESERVOIR VIEWPOINT");
  } else if (theme === "tea") {
    keralaHouse(g, 17, 11, 5, 17);
    sign(g, "MUNNAR TEA MUSEUM", 0, 3, 10, 10, "WESTERN GHATS · IDUKKI");
  } else if (theme === "backwater") {
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Group();
      b.position.set(i * 15 - 10, 0.4, -18 - i * 7);
      box(b, palette.wood, 0, 0.7, 0, 4, 1.4, 15);
      roof(b, 0, 3.1, 0, 4.7, 10, 1.7, material("#9c865a"));
      box(b, material("#d0b880"), 0, 2, 0, 3.5, 2, 9);
      for (let z = -3; z <= 3; z += 2)
        box(b, palette.dark, 1.79, 2, z, 0.1, 1.1, 1.2);
      g.add(b);
    }
    box(g, palette.wood, 0, 0.2, 4, 4, 0.4, 22);
    sign(g, "KUMARAKOM", 0, 3, 12, 9, "VEMBANAD BACKWATERS");
  } else if (theme === "park") {
    for (let i = 0; i < 8; i++) {
      box(g, palette.stone, 0, i * 0.25, -i * 1.5, 12, 0.25, 2);
      broadleaf(g, (i % 2 ? 1 : -1) * 12, 0, -i * 5, 1.2, i + 1);
    }
    roof(g, 0, 4, -25, 10, 10, 3);
    for (const x of [-3, 3])
      for (const z of [-28, -22]) cylinder(g, palette.wall, x, 2, z, 0.18, 4);
    sign(g, "KOTTAKKUNNU", 0, 3, 7, 10, "MALAPPURAM · HILLTOP PARK");
  } else {
    // Promenade props, pavilion, benches and fishing skiffs; actual water geometry comes from OSM.
    box(g, palette.sand, 0, 0.01, 0, 35, 0.1, 24);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      b.position.set(-12 + i * 8, 0, -10);
      box(b, material("#40584c"), 0, 0.3, 0, 2.2, 0.6, 6);
      b.rotation.y = 0.15 * i;
      g.add(b);
    }
    roof(g, 0, 3.3, 6, 8, 8, 2);
    for (const x of [-2.8, 2.8])
      for (const z of [3.2, 8.8])
        cylinder(g, palette.wood, x, 1.7, z, 0.13, 3.4);
    sign(g, name.toUpperCase(), 0, 3, 15, 10, "ARABIAN SEA · KERALA");
  }
  return g;
}

export { Human } from "./character";

export type VehicleKind =
  | "Hatchback"
  | "Jeep"
  | "Scooter"
  | "Motorcycle"
  | "Auto rickshaw"
  | "Bus";
export class VehicleModel {
  root = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  brakes: THREE.Mesh[] = [];
  kind: VehicleKind;
  constructor(kind: VehicleKind = "Hatchback", color = "#d8c9a9") {
    this.kind = kind;
    const body = material(color, 0.33, 0.25),
      glass = material("#476065", 0.13, 0.45),
      rubber = material("#252624"),
      chrome = material("#9caaa5", 0.3, 0.65);
    if (kind === "Scooter" || kind === "Motorcycle") {
      box(this.root, body, 0, 0.7, 0, 0.6, 0.45, 1.8);
      box(this.root, rubber, 0, 1.02, 0.2, 0.55, 0.16, 1.15);
      beam(
        this.root,
        chrome,
        new THREE.Vector3(0, 0.5, -0.8),
        new THREE.Vector3(0, 1.5, -0.65),
        0.06,
      );
      box(this.root, chrome, 0, 1.45, -0.65, 0.85, 0.06, 0.08);
      sphere(this.root, material("#fff3c8"), 0, 1.2, -0.82, 0.18, 0.18, 0.08);
      for (const z of [-0.8, 0.8]) this.wheel(0, 0.36, z, 0.36, 0.15);
      return;
    }
    if (kind === "Auto rickshaw") {
      box(this.root, material("#d9a837"), 0, 0.8, 0, 1.45, 1, 2.5);
      box(this.root, rubber, 0, 1.7, 0.3, 1.5, 0.8, 1.8);
      box(this.root, glass, 0, 1.6, -0.91, 1.25, 0.7, 0.08);
      for (const x of [-0.65, 0.65]) this.wheel(x, 0.36, 0.8, 0.34, 0.2);
      this.wheel(0, 0.36, -0.9, 0.34, 0.2);
      return;
    }
    const bus = kind === "Bus",
      jeep = kind === "Jeep",
      w = bus ? 2.6 : 1.85,
      length = bus ? 9.2 : 4.25;
    mesh(
      this.root,
      new RoundedBoxGeometry(w, 0.78, length, 2, 0.12),
      body,
      0,
      0.85,
      0,
    );
    box(this.root, rubber, 0, 0.44, 0, w * 0.88, 0.22, length * 0.9);
    if (bus) {
      box(this.root, body, 0, 2, 0, w, 1.8, length);
      box(
        this.root,
        material("#c6b989"),
        0,
        1.4,
        0,
        w + 0.02,
        0.3,
        length + 0.02,
      );
      for (let z = -3.7; z < 4; z += 1.2)
        for (const x of [-1, 1])
          box(this.root, glass, x * (w / 2 + 0.015), 2.3, z, 0.05, 0.9, 1);
      box(this.root, glass, 0, 2.2, -length / 2 - 0.02, 2.3, 1.1, 0.05);
    } else {
      mesh(
        this.root,
        new RoundedBoxGeometry(w * 0.88, 0.85, jeep ? 2.6 : 2.2, 2, 0.15),
        jeep ? body : glass,
        0,
        1.5,
        0.15,
      );
      box(this.root, body, 0, 1.94, 0.15, w * 0.88, 0.08, jeep ? 2.6 : 2);
      for (const x of [-1, 1]) {
        box(this.root, body, x * 0.82, 1.53, 0.12, 0.06, 0.82, 0.09);
        box(this.root, body, x * 0.83, 1.11, 0.15, 0.06, 0.08, 2.1);
        box(
          this.root,
          glass,
          x * 0.84,
          1.55,
          jeep ? -0.65 : -0.45,
          0.03,
          0.53,
          0.8,
        );
        box(this.root, body, x * 1.02, 1.45, -0.72, 0.22, 0.13, 0.22);
      }
      box(this.root, glass, 0, 1.55, jeep ? -1.17 : -0.99, 1.4, 0.58, 0.04);
    }
    for (const x of [-w * 0.49, w * 0.49])
      for (const z of [bus ? -3.1 : -1.28, bus ? 3.05 : 1.25])
        this.wheel(x, 0.46, z, bus ? 0.55 : 0.4, bus ? 0.3 : 0.23);
    for (const x of [-w * 0.35, w * 0.35]) {
      const brakeMaterial = material("#9c3128",0.35).clone();
      brakeMaterial.userData.transient = true;
      box(
        this.root,
        material("#f7e9b2", 0.3),
        x,
        0.92,
        -length / 2 - 0.02,
        0.35,
        0.18,
        0.035,
      );
      this.brakes.push(
        box(
          this.root,
          brakeMaterial,
          x,
          0.93,
          length / 2 + 0.02,
          0.35,
          0.19,
          0.04,
        ),
      );
    }
    box(this.root, chrome, 0, 0.6, -length / 2 - 0.08, w * 0.8, 0.13, 0.13);
    box(this.root, palette.white, 0, 0.7, length / 2 + 0.045, 0.5, 0.13, 0.015);
  }
  private wheel(x: number, y: number, z: number, r: number, width: number) {
    const wheel = mesh(
      this.root,
      new THREE.CylinderGeometry(r, r, width, 16),
      material("#252624"),
      x,
      y,
      z,
    );
    wheel.rotation.z = Math.PI / 2;
    this.wheels.push(wheel);
    const rim = mesh(
      this.root,
      new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.015, 12),
      material("#9caaa5", 0.25, 0.7),
      x,
      y,
      z,
    );
    rim.rotation.z = Math.PI / 2;
    this.wheels.push(rim);
  }
  animate(speed: number, braking: boolean, dt: number) {
    for (const wheel of this.wheels) wheel.rotateY((-speed * dt) / 0.4);
    for (const brake of this.brakes)
      (brake.material as THREE.MeshStandardMaterial).emissive.set(
        braking ? "#8e190b" : "#000000",
      );
    this.root.rotation.z =
      Math.sin(speed * 0.2) * Math.min(0.01, Math.abs(speed) * 0.001);
  }
}

export function aircraft() {
  const g = new THREE.Group(),
    white = material("#ececdf", 0.4, 0.2);
  sphere(g, white, 0, 0, 0, 2, 2, 15);
  box(g, white, 0, 0, 1, 29, 0.3, 5);
  box(g, material("#24564c"), 0, 2, 12, 0.3, 6, 5);
  box(g, white, 0, 0.5, 11, 10, 0.2, 3);
  for (const x of [-7, 7]) {
    const e = mesh(
      g,
      new THREE.CylinderGeometry(1, 1, 5, 12),
      white,
      x,
      -1.3,
      1,
    );
    e.rotation.x = Math.PI / 2;
  }
  return g;
}

export function busStop(group: THREE.Object3D, x: number, y: number, z: number) {
  cylinder(group, palette.dark, x, y + 2.2, z, 0.06, 4.4);
  box(group, material("#1b4d3e"), x, y + 4.6, z, 0.9, 0.45, 0.06);
  box(group, material("#9b9786", 0.5), x, y + 3.0, z + 0.5, 2.2, 0.08, 1.2);
  box(group, material("#d4ccb0"), x, y + 2.2, z + 1.05, 2.2, 1.6, 0.07);
  box(group, palette.wood, x, y + 0.55, z + 0.85, 1.8, 0.12, 0.38);
  for (const bx of [x - 0.7, x + 0.7])
    cylinder(group, palette.dark, bx, y + 0.27, z + 0.85, 0.04, 0.55);
}

export function airportGate(group: THREE.Object3D, x: number, y: number, z: number) {
  for (const dx of [-3, 3])
    box(group, palette.wall, x + dx, y + 2.0, z, 0.3, 4.0, 0.3);
  box(group, palette.wall, x, y + 4.1, z, 6.5, 0.28, 0.3);
  box(group, material("#5a7f82", 0.2, 0.35), x, y + 2.0, z + 0.15, 5.8, 3.5, 0.06);
  sign(group, "GATE", x, y + 3.8, z + 0.3, 3.5);
  for (let i = -2; i <= 2; i++)
    box(group, material("#4a6a6e"), x + i * 1.1, y + 0.55, z + 2.5, 0.95, 0.22, 0.5);
}

export function platformCanopy(group: THREE.Object3D, points: Vec2[], height: (x:number,z:number)=>number = ()=>0) {
  if (points.length < 2) return;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i],
      b = points[i + 1];
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const angle = Math.atan2(a.z-b.z,b.x-a.x), base=height(mx,mz);
    const slab = box(group, material("#9b9786"), mx, base+4.2, mz, len, 0.18, 4.0);
    slab.rotation.y = angle;
    for (const side of [-1.6, 1.6]) {
      cylinder(
        group,
        palette.dark,
        mx + (-(b.z-a.z)/(len||1)) * side,
        base+2.1,
        mz + ((b.x-a.x)/(len||1)) * side,
        0.1,
        4.2,
      );
    }
  }
}
