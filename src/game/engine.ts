import * as THREE from "three";
import type {
  AvatarStyle,
  Place,
  Region,
  SaveData,
  Settings,
  Snapshot,
  Tile,
  Vec2,
} from "../types";
import { toGeo, toLocal } from "../data/geography";
import {
  aircraft,
  disposeGroup,
  Human,
  material,
  VehicleModel,
} from "./assets";
import type { VehicleKind } from "./assets";
import { InputManager } from "./input";
import { AudioManager } from "./audio";
import { distance, findPath } from "./navigation";
import { World } from "./world";
import { TrafficManager } from "./traffic";
import { resolveFollowCamera } from "./camera";

export interface EngineCallbacks {
  snapshot: (snapshot: Snapshot) => void;
  action: (action: string) => void;
  notice: (message: string) => void;
}
interface ParkedVehicle {
  model: VehicleModel;
  position: Vec2;
  yaw: number;
  speed: number;
}
export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, 1, 0.12, 2800);
  world: World;
  player: Human;
  position: Vec2;
  playerYaw = 0;
  cameraYaw = 0;
  private cameraPitch = 0.2;
  private cameraDistance: number;
  private cameraTarget = new THREE.Vector3();
  private orbitUntil = 0;
  runEnabled = false;
  private actualSpeed = 0;
  private pathStuck = 0;
  input: InputManager;
  audio = new AudioManager();
  traffic: TrafficManager;
  vehicles: ParkedVehicle[] = [];
  driving?: ParkedVehicle;
  paused = false;
  visited: string[];
  discovered: string[];
  travelled = 0;
  private sun = new THREE.DirectionalLight("#ffe4b5", 3.1);
  private fill = new THREE.DirectionalLight("#c8ddd7", 0.9);
  private lampPool = [
    new THREE.PointLight("#ffdb91", 0, 38, 1.4),
    new THREE.PointLight("#ffdb91", 0, 38, 1.4),
    new THREE.PointLight("#ffdb91", 0, 38, 1.4),
  ];
  private hemi = new THREE.HemisphereLight("#cfdfdb", "#6b6950", 2.1);
  private sky: THREE.Mesh;
  private skyUniforms: {
    top: { value: THREE.Color };
    bottom: { value: THREE.Color };
  };
  private rain: THREE.Points;
  private rainPositions: Float32Array;
  private aircraft?: THREE.Group;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private elapsedHud = 0;
  private frameTimes: number[] = [];
  private velocity = { x: 0, z: 0 };
  private verticalSpeed = 0;
  private jumpHeight = 0;
  private marker: THREE.Mesh;
  private path: Vec2[] = [];
  private destination?: Vec2;
  private destinationTolerance = 0.65;
  private near = "";
  private collided = false;
  private disposed = false;
  private resize: ResizeObserver;
  private visibilityHandler: () => void;
  private pathLine?: THREE.Line;
  private clickTime = 0;
  private mouseGround?: { x: number; y: number };
  private lastSaveNotice = 0;
  constructor(
    public host: HTMLDivElement,
    tile: Tile,
    public region: Region,
    public avatar: AvatarStyle,
    public settings: Settings,
    public callbacks: EngineCallbacks,
    save?: SaveData,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.quality !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Kerala 3D world. Arrow keys move, Shift runs, Space jumps, E interacts, M opens the map.",
    );
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.hemi, this.sun, this.sun.target, ...this.lampPool);
    this.fill.position.set(50, 70, 90);
    this.scene.add(this.fill);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.035;
    this.skyUniforms = {
      top: { value: new THREE.Color("#638e95") },
      bottom: { value: new THREE.Color("#dfcfab") },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader:
        "varying vec3 vWorld; void main(){ vec4 p=modelMatrix*vec4(position,1.);vWorld=position;gl_Position=projectionMatrix*viewMatrix*p;}",
      fragmentShader:
        "varying vec3 vWorld; uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(vWorld).y*1.25,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    });
    skyMat.userData.transient = true;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 16), skyMat);
    this.scene.add(this.sky);
    this.world = new World(this.scene, tile, region, settings);
    this.position =
      save?.region === region.id &&
      (!save.area || save.area === tile.id) &&
      !this.world.collisions.blocked(save.position, 0.6)
        ? { ...save.position }
        : { ...this.world.spawn };
    this.player = new Human(avatar);
    this.scene.add(this.player.root);
    this.playerYaw =
      save?.yaw ??
      Math.atan2(
        this.world.landmarkPosition.x - this.position.x,
        -this.world.landmarkPosition.z + this.position.z,
      );
    this.cameraYaw = this.playerYaw;
    this.cameraDistance = settings.distance;
    this.visited = save
      ? [...new Set([...save.visited, region.id])]
      : [region.id];
    this.discovered = save ? [...save.discovered] : [];
    this.travelled = save?.distance ?? 0;
    const road = this.world.network.nearest(this.position),
      a = road?.road.points[road.index - 1],
      b = road?.road.points[road.index];
    const roadYaw = a && b ? Math.atan2(b.x - a.x, -b.z + a.z) : 0;
    for (let i = 0; i < 5; i++) {
      const kind: VehicleKind = (
          [
            "Hatchback",
            "Jeep",
            "Scooter",
            "Motorcycle",
            "Auto rickshaw",
          ] as VehicleKind[]
        )[i],
        start = {
          x:
            this.position.x +
            Math.sin(roadYaw) * (i ? 5 + i * 8 : 3.5) +
            Math.cos(roadYaw) * (i ? 6 + i * 2 : 3),
          z:
            this.position.z -
            Math.cos(roadYaw) * (i ? 5 + i * 8 : 3.5) +
            Math.sin(roadYaw) * (i ? 6 + i * 2 : 3),
        };
      this.updateVehicleColliders();
      this.world.collisions.circles = [{ center: this.position, radius: 0.65 }];
      const body = vehicleDimensions(kind);
      const point =
        this.world.collisions.closestValid(
          start,
          Math.hypot(body.halfWidth, body.halfLength),
        ) ?? start;
      const model = new VehicleModel(
        kind,
        ["#d7cbaa", "#4c6c5b", "#b8724b", "#586f75", "#d9a735"][i],
      );
      const parked = { model, position: point, yaw: roadYaw, speed: 0 };
      model.root.position.set(
        point.x,
        this.world.height(point.x, point.z),
        point.z,
      );
      model.root.rotation.y = -roadYaw;
      this.vehicles.push(parked);
      this.scene.add(model.root);
    }
    this.world.collisions.circles = [];
    this.updateVehicleColliders();
    this.traffic = new TrafficManager(this.world);
    if (region.theme === "airport" && this.world.runways.length) {
      this.aircraft = aircraft();
      this.aircraft.scale.setScalar(0.85);
      this.scene.add(this.aircraft);
    }
    const markerMat = new THREE.MeshBasicMaterial({
      color: "#e6ce7b",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    markerMat.userData.transient = true;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), markerMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.rainPositions = new Float32Array(1600 * 3);
    for (let i = 0; i < this.rainPositions.length; i += 3) {
      this.rainPositions[i] = (Math.random() - 0.5) * 80;
      this.rainPositions[i + 1] = Math.random() * 45;
      this.rainPositions[i + 2] = (Math.random() - 0.5) * 80;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    const rainMat = new THREE.PointsMaterial({
      color: "#d8e0dd",
      size: 0.09,
      transparent: true,
      opacity: 0.6,
    });
    rainMat.userData.transient = true;
    this.rain = new THREE.Points(rainGeo, rainMat);
    this.scene.add(this.rain);
    this.input = new InputManager(
      this.renderer.domElement,
      settings,
      () => !this.paused,
      {
        action: (name) => this.action(name),
        click: (x, y) => this.groundClick(x, y),
        track: (x, y) => {
          this.mouseGround = { x, y };
        },
        orbit: (dx, dy) => {
          this.orbitUntil = this.elapsed + 2;
          this.cameraYaw -= dx * 0.004 * this.settings.sensitivity;
          this.cameraPitch = THREE.MathUtils.clamp(
            this.cameraPitch +
              dy *
                0.003 *
                this.settings.sensitivity *
                (this.settings.invert ? -1 : 1),
            -0.12,
            0.95,
          );
        },
        zoom: (delta) => {
          this.cameraDistance = THREE.MathUtils.clamp(
            this.cameraDistance + delta * 0.009,
            3,
            22,
          );
        },
      },
    );
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(host);
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.input.clear();
        this.previous = 0;
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.applySettings(settings);
    this.resizeCanvas();
    this.audio.start();
    this.cameraTarget.set(
      this.position.x,
      this.world.height(this.position.x, this.position.z) + 1.25,
      this.position.z,
    );
    this.updateCamera(1);
    this.emitSnapshot();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
  private resizeCanvas() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        this.settings.quality === "low"
          ? 0.8
          : this.settings.quality === "medium"
            ? 1.25
            : 1.8,
      ),
    );
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  applySettings(settings: Settings) {
    const qualityChanged = this.settings.quality !== settings.quality;
    if (this.settings.movement !== settings.movement) {
      this.cancelWalk();
      this.runEnabled = false;
      this.velocity = { x: 0, z: 0 };
      this.input.clear();
    }
    if (this.settings.distance !== settings.distance)
      this.cameraDistance = settings.distance;
    this.settings = settings;
    this.input.settings = settings;
    this.world.updateSettings(settings);
    if (qualityChanged) {
      disposeGroup(this.traffic.root);
      this.traffic = new TrafficManager(this.world);
    }
    const shadowSize =
      settings.quality === "low"
        ? 512
        : settings.quality === "medium"
          ? 1024
          : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.renderer.shadowMap.enabled = settings.quality !== "low";
    const night = settings.time === "night",
      cloud = settings.weather !== "sunny",
      evening = settings.time === "evening";
    const top = night
        ? "#081526"
        : cloud
          ? "#788e91"
          : evening
            ? "#739ca2"
            : "#76a7bb",
      bottom = night
        ? "#283b43"
        : cloud
          ? "#aeb6ab"
          : evening
            ? "#e4c798"
            : "#dae1ca";
    this.skyUniforms.top.value.set(top);
    this.skyUniforms.bottom.value.set(bottom);
    this.sun.color.set(evening ? "#ffdc9f" : "#f2f3df");
    this.sun.intensity = night ? 0.2 : cloud ? 1.15 : 3.1;
    this.hemi.intensity = night ? 0.55 : 1.8;
    this.fill.intensity = night ? 0.06 : 0.9;
    const glow = material("#f4dc9a");
    glow.emissive.set(night ? "#ffd999" : "#000000");
    glow.emissiveIntensity = night ? 2 : 0;
    if (!night) this.lampPool.forEach((l) => (l.intensity = 0));
    this.hemi.color.set(night ? "#6c8aaf" : "#cbdcd5");
    const density =
      settings.weather === "foggy"
        ? 0.006
        : settings.weather === "monsoon"
          ? 0.004
          : settings.weather === "rainy"
            ? 0.0024
            : settings.quality === "low"
              ? 0.002
              : 0.0011;
    this.scene.fog = new THREE.FogExp2(bottom, density);
    this.rain.visible = ["rainy", "monsoon"].includes(settings.weather);
    this.scene.background = new THREE.Color(bottom);
    material("#51534d").roughness = this.rain.visible ? 0.3 : 0.92;
    this.resizeCanvas();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.input.clear();
    if (paused && !this.driving) this.velocity = { x: 0, z: 0 };
    this.previous = 0;
    if (!paused) this.renderer.domElement.focus();
  }
  action(action: string) {
    if (this.paused) return;
    if (!this.paused) this.renderer.domElement.focus();
    if (action === "run") return; // Keyboard run is held, the on-screen button is a toggle.
    if (action === "toggleRun") {
      if (!this.driving) this.runEnabled = !this.runEnabled;
      this.emitSnapshot();
      return;
    }
    if (action === "stop") {
      this.cancelWalk();
      this.input.clear();
      this.velocity = { x: 0, z: 0 };
      return;
    }
    if (action === "jump") {
      if (!this.driving && this.jumpHeight === 0) this.verticalSpeed = 5;
      return;
    }
    if (action === "interact") {
      this.interact();
      return;
    }
    if (action === "camera") {
      this.cameraDistance =
        this.cameraDistance < 6 ? 9 : this.cameraDistance < 12 ? 15 : 3.5;
      return;
    }
    if (["map", "pause"].includes(action)) this.callbacks.action(action);
  }
  private groundClick(x: number, y: number) {
    if (this.driving) return;
    const rect = this.renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.world.groundHit(ray);
    if (hit) {
      if (distance(hit, this.position) > 240) {
        this.callbacks.notice(
          "Choose a point closer to you. Use the map for longer journeys.",
        );
        return;
      }
      this.setDestination(hit, false);
    }
    this.mouseGround = { x, y };
  }
  setDestination(point: Vec2, roadRoute = true) {
    if (!this.paused) this.renderer.domElement.focus();
    let valid = this.world.collisions.closestValid(
      point,
      this.player.dimensions.radius + 0.08,
    );
    if (!valid) {
      this.callbacks.notice("There is no walkable ground at this destination.");
      return;
    }
    if (roadRoute) {
      const route = this.world.network.route(this.position, valid);
      this.drawRoute(route);
      if (!route.length)
        this.callbacks.notice(
          "No connected road route in this extract. A destination marker is shown.",
        );
    } else {
      this.path = findPath(
        this.position,
        valid,
        this.world.collisions,
        this.player.dimensions.radius,
      );
      this.pathStuck = 0;
      if (!this.path.length) {
        this.callbacks.notice(
          "That point is blocked. Choose open ground nearby.",
        );
        return;
      }
      if (distance(this.path[this.path.length - 1], valid) > 0.15) {
        valid = this.path[this.path.length - 1];
        this.callbacks.notice("Walking to the closest reachable point.");
      }
      this.drawRoute(this.path);
    }
    this.destinationTolerance = roadRoute ? 2.5 : 0.65;
    this.destination = valid;
    this.marker.position.set(
      valid.x,
      this.world.height(valid.x, valid.z) + 0.15,
      valid.z,
    );
    this.marker.visible = true;
  }
  private cancelWalk() {
    this.path = [];
    this.destination = undefined;
    this.marker.visible = false;
    if (this.pathLine) disposeGroup(this.pathLine);
    this.pathLine = undefined;
    this.pathStuck = 0;
  }
  controlDiagnostics() {
    return {
      avatar: this.avatar,
      dimensions: this.player.dimensions,
      animation: this.player.motion,
      playerForward: new THREE.Vector3(0, 0, 1).applyQuaternion(
        this.player.root.quaternion,
      ),
      vehicleForward: this.driving
        ? new THREE.Vector3(0, 0, -1).applyQuaternion(
            this.driving.model.root.quaternion,
          )
        : undefined,
      joints: {
        hip: this.player.leftLeg.rotation.x,
        knee: this.player.leftKnee.rotation.x,
        elbow: this.player.leftElbow.rotation.x,
      },
      cameraYaw: this.cameraYaw,
      cameraPitch: this.cameraPitch,
      cameraDistance: this.cameraDistance,
      cameraBodyDistance: this.camera.position.distanceTo(this.cameraTarget),
      cameraClear: !this.world.collisions.blocked(
        this.camera.position,
        0.29,
        true,
        this.camera.position.y,
      ),
      terrainClearance:
        this.camera.position.y -
        this.world.height(this.camera.position.x, this.camera.position.z),
      markerVisible: this.marker.visible,
      pathLength: this.path.length,
      runEnabled: this.runEnabled,
      held: {
        left: this.input.leftHeld,
        right: this.input.rightHeld,
        keys: [...this.input.keys],
      },
      nearbyObstacles: this.world.collisions.obstacles
        .filter(
          (o) =>
            !o.water &&
            Math.hypot(
              (o.minX + o.maxX) / 2 - this.position.x,
              (o.minZ + o.maxZ) / 2 - this.position.z,
            ) < 100,
        )
        .map((o) => ({ points: o.points, minY: o.minY, maxY: o.maxY })),
      projectGround: (point: Vec2) => {
        const p = new THREE.Vector3(
          point.x,
          this.world.height(point.x, point.z),
          point.z,
        ).project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((p.x + 1) * rect.width) / 2,
          y: rect.top + ((1 - p.y) * rect.height) / 2,
          visible: p.z > -1 && p.z < 1,
        };
      },
    };
  }
  perfDiagnostics() {
    const mem = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
      }
    ).memory;
    return {
      fps: this.frameTimes.length
        ? Math.round(
            this.frameTimes.length /
              this.frameTimes.reduce((a, b) => a + b, 0),
          )
        : 0,
      memoryMB: mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : undefined,
      totalMemoryMB: mem
        ? Math.round(mem.totalJSHeapSize / (1024 * 1024))
        : undefined,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      chunks: this.world.chunks.size,
      quality: this.settings.quality,
    };
  }
  navigateTo(place: Place) {
    this.setDestination(
      toLocal([place.lon, place.lat], this.world.tile.origin),
    );
  }
  private drawRoute(points: Vec2[]) {
    if (this.pathLine) disposeGroup(this.pathLine);
    this.pathLine = undefined;
    if (!points.length) return;
    const mat = new THREE.LineBasicMaterial({
      color: "#e3c878",
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    mat.userData.transient = true;
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        points.map(
          (p) =>
            new THREE.Vector3(p.x, this.world.height(p.x, p.z) + 0.18, p.z),
        ),
      ),
      mat,
    );
    this.scene.add(this.pathLine);
  }
  interact() {
    if (this.paused) return;
    if (!this.paused) this.renderer.domElement.focus();
    if (this.driving) {
      const car = this.driving;
      if (Math.abs(car.speed) > 2) {
        this.callbacks.notice("Slow to a stop before stepping out.");
        return;
      }
      const exits = [-1, 1].map((side) => ({
        x: car.position.x + Math.cos(car.yaw) * 2.3 * side,
        z: car.position.z + Math.sin(car.yaw) * 2.3 * side,
      }));
      const point = exits.find((p) => !this.world.collisions.blocked(p, 0.55));
      if (!point) {
        this.callbacks.notice("Both doors are blocked. Move to an open area.");
        return;
      }
      this.position = { ...point };
      car.speed = 0;
      this.driving = undefined;
      this.player.root.visible = true;
      this.input.driving = false;
      this.verticalSpeed = this.jumpHeight = 0;
      this.velocity = { x: 0, z: 0 };
      this.cancelWalk();
      this.callbacks.notice("Back on foot. The scenic route is yours.");
      return;
    }
    const closest = this.vehicles.reduce((a, b) =>
      distance(b.position, this.position) < distance(a.position, this.position)
        ? b
        : a,
    );
    if (distance(closest.position, this.position) < 5.5) {
      if (this.jumpHeight > 0.05) return;
      this.driving = closest;
      this.input.driving = true;
      this.input.clear();
      this.runEnabled = false;
      this.player.root.visible = false;
      this.cancelWalk();
      this.velocity = { x: 0, z: 0 };
      this.orbitUntil = this.elapsed + 0.4;
      this.callbacks.notice(
        `${closest.model.kind} · arrow keys accelerate, brake and steer.`,
      );
      return;
    }
    if (
      this.traffic.agents.some(
        (a) =>
          a.model.kind === "Bus" &&
          distance(a.model.root.position, this.position) < 8,
      ) ||
      this.traffic.train?.children.some(
        (c) => distance(c.position, this.position) < 12,
      )
    ) {
      this.callbacks.action("transport");
      return;
    }
    const npc = this.traffic.pedestrians.find(
      (p) => distance(p.human.root.position, this.position) < 4,
    );
    if (npc) {
      this.callbacks.notice(
        `${npc.name}: Welcome to ${this.region.town}! ${this.region.landmark} is nearby. Open the map to plan your next stop.`,
      );
      return;
    }
    if (distance(this.position, this.world.landmarkPosition) < 65) {
      this.discover();
      this.callbacks.action(
        ["airport", "station", "hub"].includes(this.region.theme)
          ? "transport"
          : "landmark",
      );
      return;
    }
    this.callbacks.notice(
      "Walk closer to a parked vehicle, person or landmark to interact.",
    );
  }
  recover() {
    if (this.driving) {
      this.driving.position = { ...this.world.spawn };
      this.driving.speed = 0;
      this.driving.model.root.position.set(
        this.world.spawn.x,
        this.world.height(this.world.spawn.x, this.world.spawn.z),
        this.world.spawn.z,
      );
    }
    this.position = { ...this.world.spawn };
    this.velocity = { x: 0, z: 0 };
    this.verticalSpeed = this.jumpHeight = 0;
    this.cancelWalk();
    this.runEnabled = false;
    this.input.clear();
    this.playerYaw = Math.atan2(
      this.world.landmarkPosition.x - this.position.x,
      this.position.z - this.world.landmarkPosition.z,
    );
    this.cameraYaw = this.playerYaw;
    this.cameraTarget.set(
      this.position.x,
      this.world.height(this.position.x, this.position.z) + 1.25,
      this.position.z,
    );
    this.updateCamera(1);
    this.callbacks.notice("Returned to the district arrival point.");
  }
  private discover() {
    if (!this.discovered.includes(this.world.tile.id)) {
      this.discovered.push(this.world.tile.id);
      this.callbacks.notice(
        `Discovered ${this.region.landmark} · ${this.discovered.length} places in your field notes`,
      );
    }
  }
  private updateVehicleColliders() {
    this.world.collisions.boxes = this.vehicles
      .filter((v) => v !== this.driving)
      .map((v) => {
        const body = vehicleDimensions(v.model.kind),
          base = this.world.height(v.position.x, v.position.z);
        return {
          center: v.position,
          yaw: v.yaw,
          halfWidth: body.halfWidth,
          halfLength: body.halfLength,
          minY: base,
          maxY: base + body.height,
        };
      });
  }
  private updatePlayer(dt: number) {
    this.input.driving = Boolean(this.driving);
    this.updateVehicleColliders();
    const old = { ...this.position };
    this.collided = false;
    const forward = this.input.axis("backward", "forward", "KeyS", "KeyW"),
      right = this.input.axis("left", "right", "KeyA", "KeyD");
    if (this.driving) {
      const car = this.driving;
      let throttle = forward;
      const mouseDriving =
        this.settings.mouseSteering &&
        this.settings.movement === "mouse" &&
        (this.input.leftHeld || this.input.rightHeld);
      if (mouseDriving)
        throttle = Number(this.input.leftHeld) - Number(this.input.rightHeld);
      const handbrake = this.input.keys.has(this.settings.bindings.jump),
        steering = mouseDriving
          ? (Math.sign(this.input.mouseX) *
              Math.max(0, Math.abs(this.input.mouseX) - 0.12)) /
            0.88
          : right;
      const braking = (throttle < 0 && car.speed > 0) || handbrake;
      car.speed += throttle * (braking ? 13 : throttle < 0 ? 5 : 7.5) * dt;
      car.speed *= Math.exp(
        -(handbrake ? 4 : throttle === 0 ? 0.85 : 0.14) * dt,
      );
      car.speed = THREE.MathUtils.clamp(car.speed, -7, 28);
      if (Math.abs(car.speed) < 0.035) car.speed = 0;
      const { halfWidth, halfLength } = vehicleDimensions(car.model.kind);
      const oldYaw = car.yaw;
      car.yaw +=
        (steering * car.speed * 0.055 * dt) / (1 + Math.abs(car.speed) * 0.055);
      if (
        this.world.collisions.boxBlocked(
          car.position,
          car.yaw,
          halfWidth,
          halfLength,
        )
      )
        car.yaw = oldYaw;
      const desired = {
        x: car.position.x + Math.sin(car.yaw) * car.speed * dt,
        z: car.position.z - Math.cos(car.yaw) * car.speed * dt,
      };
      const next = this.world.collisions.moveBox(
        car.position,
        desired,
        car.yaw,
        halfWidth,
        halfLength,
      );
      if (distance(next, desired) > 0.01) {
        car.speed *= 0.35;
        this.collided = true;
      }
      car.position = next;
      this.position = { ...next };
      car.model.root.position.set(
        next.x,
        this.world.height(next.x, next.z),
        next.z,
      );
      car.model.root.rotation.y = -car.yaw;
      car.model.animate(car.speed, braking, dt);
      this.playerYaw = car.yaw;
      if (
        Math.abs(car.speed) > 0.5 &&
        this.elapsed > this.orbitUntil &&
        !this.input.rightHeld
      )
        this.cameraYaw = angleLerp(
          this.cameraYaw,
          car.yaw,
          1 - Math.exp(-dt * 2.7),
        );
    } else {
      let dx =
          right * Math.cos(this.cameraYaw) + forward * Math.sin(this.cameraYaw),
        dz =
          right * Math.sin(this.cameraYaw) - forward * Math.cos(this.cameraYaw),
        amount = Math.hypot(dx, dz);
      const running =
          this.runEnabled ||
          this.input.keys.has(this.settings.bindings.run) ||
          this.input.keys.has("ShiftRight"),
        speed = running ? 5.8 : 2.8;
      if (amount) {
        if (this.path.length) this.cancelWalk();
        dx /= amount;
        dz /= amount;
      } else if (this.path.length) {
        const target = this.path[0],
          d = distance(this.position, target);
        if (d < 0.18) this.path.shift();
        else {
          dx = (target.x - this.position.x) / d;
          dz = (target.z - this.position.z) / d;
          amount = 1;
        }
      }
      // Slow into each corner so inertia cannot cut across a building footprint.
      let moveSpeed = speed;
      if (this.path.length)
        moveSpeed = Math.min(speed, distance(this.position, this.path[0]) * 5);
      if (!amount) {
        dx = 0;
        dz = 0;
      }
      this.velocity.x = THREE.MathUtils.damp(
        this.velocity.x,
        dx * moveSpeed,
        9,
        dt,
      );
      this.velocity.z = THREE.MathUtils.damp(
        this.velocity.z,
        dz * moveSpeed,
        9,
        dt,
      );
      const target = {
          x: this.position.x + this.velocity.x * dt,
          z: this.position.z + this.velocity.z * dt,
        },
        next = this.world.collisions.move(
          this.position,
          target,
          this.player.dimensions.radius,
        );
      this.collided = distance(next, target) > 0.001;
      this.position = next;
      const motion = distance(old, next) / dt;
      this.actualSpeed = motion;
      if (this.collided) {
        this.velocity.x = (next.x - old.x) / dt;
        this.velocity.z = (next.z - old.z) / dt;
      }
      this.pathStuck =
        this.path.length && motion < 0.1 ? this.pathStuck + dt : 0;
      if (this.pathStuck > 0.7 && this.destination) {
        this.path = findPath(
          this.position,
          this.destination,
          this.world.collisions,
          this.player.dimensions.radius,
        );
        this.pathStuck = 0;
        if (!this.path.length) {
          this.cancelWalk();
          this.callbacks.notice(
            "The way is blocked. Choose another destination.",
          );
        }
      }
      if (motion > 0.15)
        this.playerYaw = angleLerp(
          this.playerYaw,
          Math.atan2(this.velocity.x, -this.velocity.z),
          1 - Math.exp(-dt * 9),
        );
      this.verticalSpeed -= 14 * dt;
      this.jumpHeight = Math.max(0, this.jumpHeight + this.verticalSpeed * dt);
      if (this.jumpHeight === 0) this.verticalSpeed = 0;
      this.player.root.position.set(
        this.position.x,
        this.world.height(this.position.x, this.position.z) + this.jumpHeight,
        this.position.z,
      );
      this.player.root.rotation.y = Math.PI - this.playerYaw;
      this.player.animate(
        this.elapsed,
        motion,
        this.jumpHeight,
        this.verticalSpeed,
      );
    }
    const radius = this.world.tile.radius - 75;
    const x = THREE.MathUtils.clamp(this.position.x, -radius, radius),
      z = THREE.MathUtils.clamp(this.position.z, -radius, radius);
    if (x !== this.position.x || z !== this.position.z) {
      this.position = { x, z };
      if (this.driving) {
        this.driving.position = { x, z };
        this.driving.speed = 0;
      }
      if (this.elapsed - this.lastSaveNotice > 8) {
        this.callbacks.notice(
          "You reached the local data boundary. Open the map to travel to another region.",
        );
        this.lastSaveNotice = this.elapsed;
      }
    }
    this.travelled += Math.min(distance(old, this.position), 5);
    if (
      this.destination &&
      distance(this.position, this.destination) < this.destinationTolerance
    ) {
      this.marker.visible = false;
      this.destination = undefined;
      this.path = [];
      if (this.pathLine) {
        disposeGroup(this.pathLine);
        this.pathLine = undefined;
      }
      this.callbacks.notice("Destination reached. Take a moment to explore.");
    }
    const car = this.vehicles.find(
        (v) => distance(v.position, this.position) < 5.5,
      ),
      person = this.traffic.pedestrians.find(
        (p) => distance(p.human.root.position, this.position) < 4,
      ),
      nearBus = this.traffic.agents.some(
        (a) =>
          a.model.kind === "Bus" &&
          distance(a.model.root.position, this.position) < 8,
      ),
      nearTrain = this.traffic.train?.children.some(
        (c) => distance(c.position, this.position) < 12,
      );
    this.near = this.driving
      ? "Exit vehicle"
      : nearBus
        ? "Board bus · travel"
        : nearTrain
          ? "Board train · travel"
          : car
            ? `Enter ${car.model.kind}`
            : person
              ? "Talk to local"
              : distance(this.position, this.world.landmarkPosition) < 65
                ? ["airport", "station", "hub"].includes(this.region.theme)
                  ? "Board / travel services"
                  : "About this landmark"
                : "";
    if (distance(this.position, this.world.landmarkPosition) < 65)
      this.discover();
  }
  private updateCamera(dt: number) {
    const target = new THREE.Vector3(
      this.position.x,
      this.world.height(this.position.x, this.position.z) +
        (this.driving ? 1.3 : 1.25) +
        this.jumpHeight * 0.65,
      this.position.z,
    );
    this.cameraTarget.lerp(target, 1 - Math.exp(-dt * 14));
    if (
      this.world.collisions.blocked(
        this.cameraTarget,
        0.3,
        true,
        this.cameraTarget.y,
      )
    )
      this.cameraTarget.copy(target);
    const distance = this.cameraDistance + (this.driving ? 3 : 0);
    const desired = this.cameraTarget
      .clone()
      .add(
        new THREE.Vector3(
          -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * distance,
          Math.sin(this.cameraPitch) * distance + 0.75,
          Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * distance,
        ),
      );
    const height = (x: number, z: number) => this.world.height(x, z);
    const safe = resolveFollowCamera(
      this.cameraTarget,
      desired,
      this.world.collisions,
      height,
      this.driving ? 2.8 : 1.2,
    );
    const candidate = this.camera.position
      .clone()
      .lerp(safe, 1 - Math.exp(-dt * 8));
    // Re-sweep after interpolation: orbiting around a corner must never lerp through it.
    this.camera.position.copy(
      resolveFollowCamera(
        this.cameraTarget,
        candidate,
        this.world.collisions,
        height,
        this.driving ? 2.8 : 1.2,
      ),
    );
    this.camera.position.y = Math.max(
      this.camera.position.y,
      height(this.camera.position.x, this.camera.position.z) + 0.3,
    );
    this.camera.lookAt(this.cameraTarget);
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(
      this.position.x - 75,
      this.world.height(this.position.x, this.position.z) +
        (this.settings.time === "afternoon" ? 140 : 90),
      this.position.z - 60,
    );
    this.sun.target.position.set(
      this.position.x,
      this.world.height(this.position.x, this.position.z),
      this.position.z,
    );
  }
  private tick(now: number) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
    if (document.hidden) {
      this.previous = 0;
      return;
    }
    const raw = this.previous ? (now - this.previous) / 1000 : 1 / 60;
    this.previous = now;
    const dt = Math.min(raw, 0.05);
    this.frameTimes.push(raw);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (!this.paused) {
      this.elapsed += dt;
      this.updatePlayer(dt);
      this.traffic.update(dt, this.elapsed, this.position);
      this.world.updateStreaming(this.position);
      this.updateCamera(dt);
      if (this.aircraft) {
        const points = this.world.runways[0],
          a = points[0],
          b = points[points.length - 1],
          phase = (this.elapsed % 65) / 65,
          taxiPhase = 0.38,
          t = Math.min(1, phase * 1.3);
        const yOffset =
          phase < taxiPhase
            ? 0
            : Math.max(0, (phase - taxiPhase) / (1 - taxiPhase)) * 290;
        this.aircraft.position.set(
          a.x + (b.x - a.x) * t,
          this.world.height(a.x, a.z) + 2 + yOffset,
          a.z + (b.z - a.z) * t,
        );
        this.aircraft.rotation.y = Math.atan2(a.x - b.x, -b.z + a.z);
        this.aircraft.rotation.x =
          phase < taxiPhase ? 0 : -Math.max(0, phase - taxiPhase) * 0.2;
        this.aircraft.visible = phase < 0.96;
      }
      this.marker.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.08);
      if (this.rain.visible) {
        this.rain.position.set(
          this.position.x,
          this.world.height(this.position.x, this.position.z),
          this.position.z,
        );
        for (let i = 1; i < this.rainPositions.length; i += 3) {
          this.rainPositions[i] -=
            dt * (this.settings.weather === "monsoon" ? 28 : 19);
          if (this.rainPositions[i] < 0) this.rainPositions[i] = 45;
        }
        (
          this.rain.geometry.getAttribute("position") as THREE.BufferAttribute
        ).needsUpdate = true;
      }
      if (
        this.settings.movement === "mouse" &&
        this.input.leftHeld &&
        !this.driving &&
        this.mouseGround &&
        this.elapsed - this.clickTime > 0.45
      ) {
        this.clickTime = this.elapsed;
        this.groundClick(this.mouseGround.x, this.mouseGround.y);
      }
    }
    this.audio.update(
      this.settings,
      this.driving?.speed ?? 0,
      Boolean(this.driving),
      this.paused,
      this.elapsed,
    );
    this.renderer.render(this.scene, this.camera);
    this.elapsedHud += raw;
    if (this.elapsedHud > 0.25) {
      this.elapsedHud = 0;
      this.emitSnapshot();
    }
  }
  private emitSnapshot() {
    if (this.settings.time === "night") {
      const lamps = [...this.world.streetlights.values()]
        .flat()
        .sort(
          (a, b) => distance(a, this.position) - distance(b, this.position),
        );
      this.lampPool.forEach((lamp, i) => {
        const p = lamps[i];
        if (p && distance(p, this.position) < 100) {
          lamp.position.set(p.x, this.world.height(p.x, p.z) + 7.3, p.z);
          lamp.intensity = 38;
        } else lamp.intensity = 0;
      });
    }
    this.callbacks.snapshot(this.snapshot());
  }
  snapshot(): Snapshot {
    const geo = toGeo(this.position, this.world.tile.origin);
    return {
      position: { ...this.position },
      yaw: this.playerYaw,
      lat: geo[1],
      lon: geo[0],
      speed: Math.abs(this.driving?.speed ?? this.actualSpeed) * 3.6,
      driving: Boolean(this.driving),
      vehicle: this.driving?.model.kind ?? "",
      near: this.near,
      fps: this.frameTimes.length
        ? Math.round(
            this.frameTimes.length / this.frameTimes.reduce((a, b) => a + b, 0),
          )
        : 0,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      chunks: this.world.chunks.size,
      distance: this.travelled,
      discovered: [...this.discovered],
      visited: [...this.visited],
      path: [...this.path],
      destination: this.destination,
      groundY: this.jumpHeight,
      motion: this.driving
        ? "driving"
        : this.jumpHeight > 0.02
          ? "jumping"
          : this.actualSpeed > 3.6
            ? "running"
            : this.actualSpeed > 0.2
              ? "walking"
              : "idle",
      collision: this.collided,
      traffic: this.traffic.agents.length,
      pedestrians: this.traffic.pedestrians.length,
      runEnabled: this.runEnabled,
    };
  }
  save(): SaveData {
    return {
      version: 1,
      avatar: this.avatar,
      region: this.region.id,
      area: this.world.tile.id,
      position: { ...this.position },
      yaw: this.playerYaw,
      visited: [...this.visited],
      discovered: [...this.discovered],
      distance: this.travelled,
      savedAt: new Date().toISOString(),
    };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.input.dispose();
    this.resize.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.audio.dispose();
    this.world.dispose();
    disposeGroup(this.traffic.root);
    if (this.aircraft) disposeGroup(this.aircraft);
    for (const car of this.vehicles) disposeGroup(car.model.root);
    disposeGroup(this.player.root);
    disposeGroup(this.sky);
    disposeGroup(this.rain);
    disposeGroup(this.marker);
    if (this.pathLine) disposeGroup(this.pathLine);
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
function angleLerp(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function vehicleDimensions(kind: VehicleKind) {
  if (kind === "Scooter" || kind === "Motorcycle")
    return { halfWidth: 0.48, halfLength: 1.18, height: 1.6 };
  if (kind === "Auto rickshaw")
    return { halfWidth: 0.8, halfLength: 1.35, height: 2.2 };
  if (kind === "Bus") return { halfWidth: 1.4, halfLength: 4.7, height: 3.2 };
  return { halfWidth: 1.13, halfLength: 2.25, height: 2.1 };
}
