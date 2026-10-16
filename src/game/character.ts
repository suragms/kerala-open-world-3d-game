import * as THREE from "three";
import type { AvatarStyle } from "../types";

export type CharacterMotion = "idle" | "walk" | "run" | "jump";
export function characterDimensions(gender: AvatarStyle["gender"]) {
  return gender === "female"
    ? { radius: 0.35, height: 1.77, scale: 0.94 }
    : { radius: 0.38, height: 1.88, scale: 1 };
}

/** Original articulated character. Metres, feet at zero, facing local +Z. */
export class Human {
  root = new THREE.Group();
  body = new THREE.Group();
  chest = new THREE.Group();
  head = new THREE.Group();
  leftArm = new THREE.Group();
  rightArm = new THREE.Group();
  leftElbow = new THREE.Group();
  rightElbow = new THREE.Group();
  leftLeg = new THREE.Group();
  rightLeg = new THREE.Group();
  leftKnee = new THREE.Group();
  rightKnee = new THREE.Group();
  leftFoot = new THREE.Group();
  rightFoot = new THREE.Group();
  motion: CharacterMotion = "idle";
  readonly dimensions;
  private phase = 0;
  private previous = 0;
  private blend = 0;
  private runBlend = 0;
  private airBlend = 0;
  private landing = 0;
  private wasAirborne = false;
  constructor(public style: AvatarStyle) {
    this.dimensions = characterDimensions(style.gender);
    this.root.scale.setScalar(this.dimensions.scale);
    this.root.userData.character = { gender: style.gender, ...this.dimensions };
    const female = style.gender === "female",
      field = style.outfit === "field";
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = (color: string, roughness = 0.85, metalness = 0) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      m.userData.transient = true;
      return m;
    };
    const skin = mat(style.skin, 0.64),
      cloth = mat(style.shirt),
      pants = mat(style.pants),
      shoes = mat(style.shoes, 0.58),
      hair = mat("#241e1a", 0.93),
      seam = mat(new THREE.Color(style.shirt).multiplyScalar(0.72).getStyle()),
      sole = mat("#d8d1be", 0.9),
      eye = mat("#f0e8da", 0.45),
      iris = mat("#33261f", 0.3);
    const part = (
      parent: THREE.Object3D,
      material: THREE.Material,
      p: number[],
      s: number[],
      geometry: THREE.BufferGeometry = sphere,
    ) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(s[0], s[1], s[2]);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const limb = (
      parent: THREE.Object3D,
      m: THREE.Material,
      length: number,
      top: number,
      bottom: number,
    ) => {
      const geometry = new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, -length - 0.01),
          new THREE.Vector2(bottom * 0.75, -length),
          new THREE.Vector2(bottom, -length + 0.045),
          new THREE.Vector2(top, -0.07),
          new THREE.Vector2(top * 0.82, 0.012),
          new THREE.Vector2(0, 0.024),
        ],
        24,
      );
      return part(parent, m, [0, 0, 0], [1, 1, 1], geometry);
    };
    this.root.add(this.body);
    this.body.position.y = 0.9;
    this.body.add(this.chest);
    this.chest.position.y = 0.02;
    const shoulder = female ? 0.205 : 0.235;
    const torso = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.19, 0),
        new THREE.Vector2(female ? 0.165 : 0.19, 0.16),
        new THREE.Vector2(female ? 0.19 : 0.22, 0.36),
        new THREE.Vector2(shoulder, 0.48),
        new THREE.Vector2(0.185, 0.54),
        new THREE.Vector2(0.075, 0.58),
      ],
      32,
    );
    part(this.chest, cloth, [0, 0, 0], [1, 1, 0.7], torso);
    part(
      this.body,
      pants,
      [0, -0.025, 0],
      [female ? 0.205 : 0.19, 0.13, 0.135],
    );
    part(this.chest, mat("#4c4033"), [0, 0.005, 0], [0.193, 0.027, 0.14]);
    part(
      this.chest,
      mat("#b8ac89", 0.3, 0.7),
      [0, 0.005, 0.142],
      [0.043, 0.027, 0.012],
      box,
    );
    // Folded collar, placket, buttons and sewn pockets read at preview distance.
    for (const side of [-1, 1]) {
      const collar = part(
        this.chest,
        cloth,
        [side * 0.058, 0.54, 0.075],
        [0.066, 0.075, 0.025],
        box,
      );
      collar.rotation.z = side * 0.36;
      if (field || side === -1) {
        part(
          this.chest,
          seam,
          [side * 0.108, 0.33, 0.145],
          [0.09, 0.112, 0.013],
          box,
        );
        part(
          this.chest,
          cloth,
          [side * 0.108, 0.34, 0.155],
          [0.078, 0.096, 0.012],
          box,
        );
        if (field)
          part(
            this.chest,
            seam,
            [side * 0.108, 0.39, 0.167],
            [0.084, 0.024, 0.01],
            box,
          );
      }
    }
    part(this.chest, seam, [0, 0.27, 0.155], [0.018, 0.46, 0.012], box);
    for (let y = 0.1; y < 0.53; y += 0.085)
      part(this.chest, mat("#c6b99c"), [0, y, 0.168], [0.007, 0.007, 0.004]);
    part(this.chest, skin, [0, 0.6, 0], [0.062, 0.085, 0.06]);
    this.chest.add(this.head);
    this.head.position.y = 0.75;
    part(this.head, skin, [0, 0.012, 0], [0.119, 0.157, 0.113]);
    part(this.head, skin, [0, -0.065, 0.025], [0.087, 0.075, 0.086]);
    part(this.head, hair, [0, 0.121, -0.019], [0.123, 0.065, 0.113]);
    part(this.head, hair, [0, 0.052, -0.083], [0.118, 0.1, 0.052]);
    for (const side of [-1, 1]) {
      part(this.head, skin, [side * 0.119, 0, -0.008], [0.018, 0.03, 0.02]);
      part(this.head, eye, [side * 0.046, 0.035, 0.103], [0.024, 0.01, 0.01]);
      part(
        this.head,
        iris,
        [side * 0.046, 0.035, 0.112],
        [0.008, 0.009, 0.004],
      );
      const brow = part(
        this.head,
        hair,
        [side * 0.046, 0.063, 0.104],
        [0.026, 0.005, 0.008],
      );
      brow.rotation.z = side * -0.1;
      if (style.hair === "long")
        part(
          this.head,
          hair,
          [side * 0.112, -0.025, -0.025],
          [0.031, 0.183, 0.083],
        );
    }
    part(this.head, skin, [0, -0.001, 0.116], [0.019, 0.028, 0.024]);
    part(this.head, mat("#8a5449"), [0, -0.058, 0.106], [0.028, 0.005, 0.008]);
    if (style.hair === "long")
      part(this.head, hair, [0, -0.03, -0.1], [0.123, 0.216, 0.055]);
    if (style.hair === "curly")
      for (let i = 0; i < 22; i++) {
        const a = i * 2.399;
        part(
          this.head,
          hair,
          [Math.sin(a) * 0.1, 0.135 + (i % 3) * 0.012, Math.cos(a) * 0.087],
          [0.044, 0.041, 0.043],
        );
      }
    for (const side of [-1, 1]) {
      const arm = side === -1 ? this.leftArm : this.rightArm,
        elbow = side === -1 ? this.leftElbow : this.rightElbow,
        leg = side === -1 ? this.leftLeg : this.rightLeg,
        knee = side === -1 ? this.leftKnee : this.rightKnee,
        foot = side === -1 ? this.leftFoot : this.rightFoot;
      this.chest.add(arm);
      arm.position.set(side * shoulder, 0.47, 0);
      arm.rotation.z = side * 0.055;
      limb(arm, skin, 0.28, 0.064, 0.048);
      limb(arm, cloth, field ? 0.28 : 0.17, 0.079, field ? 0.057 : 0.068);
      arm.add(elbow);
      elbow.position.set(side * 0.015, -0.275, 0);
      limb(elbow, skin, 0.22, 0.047, 0.032);
      if (field) part(elbow, seam, [0, -0.03, 0], [0.059, 0.05, 0.059]);
      part(elbow, skin, [0, -0.245, 0.01], [0.044, 0.064, 0.027]);
      part(elbow, skin, [side * -0.033, -0.23, 0.026], [0.017, 0.034, 0.018]);
      this.body.add(leg);
      leg.position.set(side * 0.103, -0.01, 0);
      limb(leg, pants, 0.4, 0.102, 0.073);
      leg.add(knee);
      knee.position.y = -0.4;
      limb(knee, pants, 0.385, 0.073, 0.059);
      knee.add(foot);
      foot.position.y = -0.4;
      part(foot, shoes, [0, -0.025, 0.058], [0.083, 0.065, 0.144]);
      part(foot, sole, [0, -0.072, 0.054], [0.085, 0.014, 0.147]);
      for (let z = 0.02; z < 0.09; z += 0.023)
        part(foot, sole, [0, 0.02, z], [0.09, 0.008, 0.007], box);
    }
    this.animate(0, 0, 0);
  }
  animate(time: number, speed: number, jump: number, verticalSpeed = 0) {
    const dt = Math.max(0, Math.min(0.05, time - this.previous || 1 / 60));
    this.previous = time;
    const airborne = jump > 0.015;
    if (this.wasAirborne && !airborne) this.landing = 0.06;
    this.wasAirborne = airborne;
    this.landing = THREE.MathUtils.damp(this.landing, 0, 12, dt);
    this.blend = THREE.MathUtils.damp(
      this.blend,
      Math.min(1, speed / 0.7),
      12,
      dt,
    );
    this.runBlend = THREE.MathUtils.damp(
      this.runBlend,
      speed > 3.6 ? 1 : 0,
      9,
      dt,
    );
    this.airBlend = THREE.MathUtils.damp(
      this.airBlend,
      airborne ? 1 : 0,
      20,
      dt,
    );
    this.phase += speed * dt * (2.9 - this.runBlend * 0.7);
    this.motion = airborne
      ? "jump"
      : speed > 3.6
        ? "run"
        : speed > 0.2
          ? "walk"
          : "idle";
    const b = this.blend * (1 - this.airBlend),
      r = this.runBlend;
    const bob = (Math.cos(this.phase * 2) * 0.014 - 0.03) * b - this.landing;
    this.body.position.y = 0.9 + bob + Math.sin(time * 1.8) * 0.003 * (1 - b);
    this.chest.rotation.x = -0.055 * b - 0.09 * r * b;
    this.chest.rotation.y = Math.sin(this.phase) * 0.045 * b;
    this.head.rotation.y = Math.sin(time * 0.65) * 0.045 * (1 - b);
    for (const [i, leg, knee, foot, arm, elbow] of [
      [
        0,
        this.leftLeg,
        this.leftKnee,
        this.leftFoot,
        this.leftArm,
        this.leftElbow,
      ],
      [
        1,
        this.rightLeg,
        this.rightKnee,
        this.rightFoot,
        this.rightArm,
        this.rightElbow,
      ],
    ] as const) {
      const phase = this.phase + i * Math.PI;
      const z = Math.cos(phase) * (0.22 + r * 0.16) * b;
      const lift = Math.max(0, -Math.sin(phase)) * (0.105 + r * 0.14) * b;
      const y = -0.8 + lift - bob;
      const d = THREE.MathUtils.clamp(Math.hypot(y, z), 0.12, 0.799);
      const bend = Math.acos(
        THREE.MathUtils.clamp((d * d - 0.32) / 0.32, -1, 1),
      );
      const hip = Math.atan2(-z, -y) - bend * 0.5;
      const tuck = verticalSpeed > 0 ? 0.38 : 0.16;
      leg.rotation.x = THREE.MathUtils.lerp(hip, -tuck, this.airBlend);
      knee.rotation.x = THREE.MathUtils.lerp(bend, tuck * 1.7, this.airBlend);
      foot.rotation.x = -leg.rotation.x - knee.rotation.x;
      arm.rotation.x =
        Math.cos(phase) * (0.3 + r * 0.45) * b - this.airBlend * 0.7;
      elbow.rotation.x = -0.13 - r * 0.95 * b - this.airBlend * 0.65;
      arm.rotation.z = (i === 0 ? -1 : 1) * (0.065 + this.airBlend * 0.18);
    }
    this.root.userData.motion = this.motion;
  }
}
