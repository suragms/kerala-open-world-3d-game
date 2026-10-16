import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  bake,
  box,
  disposeGroup,
  Human,
  initTextures,
  keralaHouse,
  landmarkModel,
  material,
  palette,
  palm,
  seeded,
} from "../game/assets";
import type { AvatarStyle } from "../types";
import { DEFAULT_AVATAR } from "../types";
import type { CharacterMotion } from "../game/character";

export function ScenePreview({
  avatar,
  backdrop = false,
  animation = "idle",
  rotation = 0.2,
}: {
  avatar?: AvatarStyle | null;
  backdrop?: boolean;
  animation?: CharacterMotion;
  rotation?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const playback = useRef({ animation, rotation });
  playback.current = { animation, rotation };
  const dragYaw = useRef(0);
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  useEffect(() => {
    if (!host.current) return;
    const div = host.current;
    delete div.dataset.ready;
    delete div.dataset.unavailable;
    div.setAttribute("aria-busy", "true");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: !backdrop,
        powerPreference: "low-power",
      });
    } catch {
      div.dataset.unavailable = "true";
      return;
    }
    initTextures();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    div.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(backdrop ? 43 : 34, 1, 0.1, 1200);
    scene.add(
      new THREE.HemisphereLight(
        backdrop ? "#aac4bf" : "#e5f3e5",
        "#6c6251",
        2.5,
      ),
    );
    const sun = new THREE.DirectionalLight("#ffe2ac", 3.4);
    sun.position.set(-30, 45, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    scene.add(sun);
    if (!backdrop) {
      sun.position.set(-3, 5, 4);
      Object.assign(sun.shadow.camera, {
        left: -3,
        right: 3,
        top: 4,
        bottom: -3,
      });
      sun.shadow.normalBias = 0.015;
      const rim = new THREE.DirectionalLight("#d2e8f0", 2.5);
      rim.position.set(3, 3, -3);
      scene.add(rim);
      const fill = new THREE.DirectionalLight("#fff3de", 0.8);
      fill.position.set(2, 2, 4);
      scene.add(fill);
    }
    const root = new THREE.Group();
    scene.add(root);
    const humans: Human[] = [];
    let appearance = "";
    const updateCharacters = () => {
      const current = avatarRef.current;
      const signature = JSON.stringify(current);
      if (appearance === signature) return;
      appearance = signature;
      humans.forEach((h) => disposeGroup(h.root));
      humans.length = 0;
      if (current) {
        const h = new Human(current);
        humans.push(h);
        root.add(h.root);
      } else
        for (const gender of ["male", "female"] as const) {
          const h = new Human({
            ...DEFAULT_AVATAR,
            gender,
            hair: gender === "female" ? "long" : "short",
            shirt: gender === "female" ? "#a67054" : "#e7dfc5",
          });
          h.root.position.x = gender === "male" ? -0.48 : 0.48;
          humans.push(h);
          root.add(h.root);
        }
    };
    if (backdrop) {
      scene.background = new THREE.Color("#9fbbb2");
      scene.fog = new THREE.FogExp2("#afbeb0", 0.0035);
      const ground = box(
        root,
        material("#456d63", 0.25, 0.12),
        0,
        -0.6,
        0,
        1600,
        1,
        1600,
      );
      ground.receiveShadow = true;
      const landShape = new THREE.Shape();
      landShape.moveTo(-240, 200);
      landShape.bezierCurveTo(-100, 160, -130, 55, -95, 10);
      landShape.bezierCurveTo(-45, -45, 120, -45, 240, -95);
      landShape.lineTo(300, -300);
      landShape.lineTo(-400, -300);
      landShape.closePath();
      const landGeo = new THREE.ExtrudeGeometry(landShape, {
        depth: 2.6,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 3,
        bevelThickness: 1,
      });
      landGeo.rotateX(-Math.PI / 2);
      const land = new THREE.Mesh(landGeo, material("#707c4f"));
      land.position.y = -1;
      land.receiveShadow = true;
      root.add(land);
      const rng = seeded(9183);
      for (let i = 0; i < 65; i++) {
        const x = -200 + rng() * 450,
          z = -30 - rng() * 200;
        if (x > -90 && z > 0) continue;
        palm(root, x, 1, z, 0.8 + rng() * 1.6, i + 4);
      }
      for (let i = 0; i < 15; i++) {
        const home = new THREE.Group();
        keralaHouse(home, 8 + rng() * 8, 10, 4 + rng() * 2, i);
        home.position.set(-180 + i * 24, 1, -75 - (i % 3) * 22);
        home.rotation.y = 0.13;
        root.add(home);
      }
      const temple = landmarkModel("temple", "KERALA HERITAGE");
      temple.position.set(-20, 1, -28);
      temple.scale.setScalar(1.3);
      root.add(temple);
      for (let i = 0; i < 3; i++) {
        const boat = new THREE.Group();
        box(boat, material("#4e3727"), 0, 0, 0, 5, 1.5, 19);
        box(boat, material("#b29a6b"), 0, 2, 0, 4.6, 3, 14);
        const cabin = box(boat, material("#826e4a"), 0, 3.9, 0, 5.5, 0.5, 15);
        cabin.rotation.z = 0.02;
        for (let z = -4; z <= 4; z += 2.6)
          box(boat, material("#344943"), 2.35, 2.3, z, 0.06, 1.5, 1.5);
        boat.position.set(-5 + i * 45, 0.4, 70 - i * 10);
        boat.rotation.y = -0.65;
        root.add(boat);
      }
      for (let i = 0; i < 10; i++) {
        const hill = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 10),
          material(i % 2 ? "#5b776c" : "#718c7d"),
        );
        hill.position.set(-380 + i * 95, 15, -400 - (i % 3) * 90);
        hill.scale.set(160, 75 + (i % 3) * 20, 130);
        root.add(hill);
      }
      bake(root);
      camera.position.set(145, 65, 180);
      camera.lookAt(-25, 0, -40);
    } else {
      const pedestal = meshPedestal();
      root.add(pedestal);
      updateCharacters();
      camera.position.set(0, 1.25, 4.1);
      camera.lookAt(0, 0.98, 0);
    }
    const resize = () => {
      const w = div.clientWidth,
        h = div.clientHeight;
      if (w && h) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(div);
    resize();
    let dragging = false,
      lastX = 0;
    const down = (e: PointerEvent) => {
      if (backdrop) return;
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (dragging) {
        dragYaw.current += (e.clientX - lastX) * 0.012;
        lastX = e.clientX;
      }
    };
    const up = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    let frame = 0,
      previous = 0,
      elapsed = 0;
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      const dt = previous ? Math.min(0.05, (time - previous) / 1000) : 0;
      previous = time;
      elapsed += dt;
      if (!backdrop) {
        updateCharacters();
        root.rotation.y = playback.current.rotation + dragYaw.current;
        div.dataset.rotation = root.rotation.y.toFixed(3);
        const motion = avatarRef.current ? playback.current.animation : "idle";
        const t = elapsed % 1.7;
        const jump =
          motion === "jump" && t < 0.72 ? Math.max(0, 5 * t - 7 * t * t) : 0;
        humans.forEach((h) => {
          h.root.position.y = jump;
          h.animate(
            elapsed,
            motion === "run" ? 5.8 : motion === "walk" ? 2.8 : 0,
            jump,
            5 - 14 * t,
          );
        });
        div.dataset.motion = motion;
        if (div.dataset.ready !== "true") {
          div.dataset.ready = "true";
          div.setAttribute("aria-busy", "false");
        }
      } else {
        camera.position.x = 145 + Math.sin(elapsed * 0.035) * 12;
        camera.lookAt(-25, 0, -40);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      disposeGroup(root);
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [backdrop]);
  return (
    <div
      className={backdrop ? "scene-backdrop" : "avatar-preview"}
      ref={host}
      aria-label={
        backdrop
          ? "Original Kerala-inspired 3D landscape"
          : "Rotating 3D character preview"
      }
    >
      {!backdrop ? (
        <span className="preview-loading" role="status">
          Preparing your 3D character…
        </span>
      ) : null}
    </div>
  );
}
function meshPedestal() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.4, 0.12, 64),
    material("#b2b9a4"),
  );
  m.position.y = -0.1;
  m.receiveShadow = true;
  g.add(m);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.3, 0.012, 8, 80),
    material("#e9ddae", 0.4, 0.3),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.04;
  g.add(ring);
  return g;
}
