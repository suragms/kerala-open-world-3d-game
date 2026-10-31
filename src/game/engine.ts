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
  BusPlan,
  BusStation,
  JourneyRecord,
  DistrictCollection,
} from "../types";
import { toGeo, toLocal, districtAt } from "../data/geography";
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
import { PassengerJourney, BUS_CAMERAS, projectRoute, routeLengths, sampleRoute } from "./bus";
import { PassengerBusModel, seatPosition } from "./busModels";
import { BUS_SPECS, busScale } from "./busSpecs";
import { BusStationManager } from "./terminals";
import { controller, vibrate } from "./gamepad";
import { mouseSteering, smoothSteering, vehicleThrottle } from "./vehicle";
import { InteractionManager } from "./interactions";
import { TRAIN_CAMERAS } from "./rail";

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
  terminals: BusStationManager;
  bus?: PassengerJourney;
  busModel?: PassengerBusModel;
  trainPassenger = false;
  private trainCamera = 0;
  journeys: JourneyRecord[] = [];
  discoveredStations: string[] = [];
  private safeLocation?: SaveData["safeLocation"];
  private cameraMode = 0;
  private steering = 0;
  reverse = false;
  handbrake = false;
  private pendingInteraction?: { point: Vec2; run: () => void };
  private pendingVehicleExit = false;
  private lastBusPhase = "";
  interactions = new InteractionManager();
  private hovered = "";
  private hoveredId?: string;
  private hoverTime = 0;
  private fastTransition = 0;
  private boardingStart?: Vec2;
  private signals: Vec2[] = [];
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
  private walkingWaypoints: Vec2[] = [];
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
    stations: BusStation[] = [],
    busPlan?: BusPlan,
    private boundaries?: DistrictCollection,
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
    this.signals = this.world.localFeatures.filter(f => f.source.tags.highway === "traffic_signals").map(f => f.center);
    this.terminals = new BusStationManager(this.world, stations);
    this.journeys = save?.journeys ?? [];
    this.discoveredStations = save?.discoveredStations ?? [];
    this.safeLocation = save?.safeLocation;
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
    if(save?.cameraState){this.cameraYaw=save.cameraState.yaw;this.cameraPitch=save.cameraState.pitch;this.cameraDistance=save.cameraState.distance;}
    this.visited = save
      ? [...new Set([...save.visited, region.id])]
      : [region.id];
    this.discovered = save ? [...save.discovered] : [];
    this.travelled = save?.distance ?? 0;
    const road = this.world.network.nearest(this.position),
      a = road?.road.points[road.index - 1],
      b = road?.road.points[road.index];
    const roadYaw = a && b ? Math.atan2(b.x - a.x, -b.z + a.z) : 0;
    const reservedRoute = busPlan?.route.points.map(p => toLocal(p, tile.origin));
    const reservedLengths = reservedRoute ? routeLengths(reservedRoute) : undefined;
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
      let point =
        this.world.collisions.closestValid(
          start,
          Math.hypot(body.halfWidth, body.halfLength),
        ) ?? start;
      if (reservedRoute && reservedLengths && projectRoute(point, reservedRoute, reservedLengths).separation < 9) {
        let safe: Vec2 | undefined;
        for (let radius = 12; radius <= 65 && !safe; radius += 8) for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
          const candidate = { x: start.x + Math.cos(angle) * radius, z: start.z + Math.sin(angle) * radius };
          if (projectRoute(candidate, reservedRoute, reservedLengths).separation > 9 && !this.world.collisions.boxBlocked(candidate, roadYaw, body.halfWidth, body.halfLength)) { safe = candidate; break; }
        }
        if (!safe) continue;
        point = safe;
      }
      const model = new VehicleModel(
        kind,
        ["#d7cbaa", "#4c6c5b", "#b8724b", "#586f75", "#d9a735"][i],
      );
      model.root.rotation.order="YXZ";
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
    if (busPlan) {
      this.bus = new PassengerJourney(busPlan, tile.origin, settings.busDwell);
      this.busModel = new PassengerBusModel(busPlan.type, busPlan.stations[1].name, settings.quality === "low");
      this.scene.add(this.busModel.root);
      this.updateBus(0);
      this.drawBusNotice("Bus dispatched. Walk to the marked passenger door and wait for it to stop.");
    }
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
          if (this.elapsed - this.hoverTime > 0.1 && !this.driving && !this.bus?.attached) { this.hoverTime = this.elapsed; this.hoverInteraction(x, y); }
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
    if (this.bus) this.bus.dwellSeconds=settings.busDwell;
    this.input.settings = settings;
    this.world.updateSettings(settings);
    if (qualityChanged) {
      const railState=this.trainPassenger&&this.traffic.rail?{distance:this.traffic.rail.distance,speed:this.traffic.rail.speed,direction:this.traffic.rail.direction,dwell:this.traffic.rail.dwell,held:this.traffic.rail.held}:undefined;
      disposeGroup(this.traffic.root);
      this.traffic = new TrafficManager(this.world);
      if(railState&&this.traffic.rail){Object.assign(this.traffic.rail,railState);this.traffic.update(0,this.elapsed,this.position);}
      if(this.bus&&this.busModel){
        const previous=this.busModel;this.busModel=new PassengerBusModel(this.bus.plan.type,this.bus.plan.stations[1].name,settings.quality==="low");
        this.busModel.root.position.copy(previous.root.position);this.busModel.root.rotation.copy(previous.root.rotation);this.scene.add(this.busModel.root);disposeGroup(previous.root);
      }
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
    this.input.setContext(paused ? "MENU_OPEN" : this.trainPassenger ? "TRAIN_PASSENGER" : this.bus?.attached ? "BUS_PASSENGER" : this.driving ? "IN_VEHICLE" : "ON_FOOT");
    if (paused && !this.driving) this.velocity = { x: 0, z: 0 };
    this.previous = 0;
    if (!paused) this.renderer.domElement.focus();
  }
  action(action: string) {
    if (this.paused) return;
    if (!this.paused) this.renderer.domElement.focus();
    if (action === "run") return; // Keyboard run is held, the on-screen button is a toggle.
    if (action === "sprintDestination") { if (!this.driving && !this.bus?.attached) this.runEnabled = true; return; }
    if (action === "lookAround") { this.input.lookAround = !this.input.lookAround; this.input.clear(); return; }
    if (action === "handbrake") { this.handbrake = !this.handbrake; return; }
    if (action === "reverse") {
      if (this.driving && Math.abs(this.driving.speed) < 0.5) this.reverse = !this.reverse;
      else this.callbacks.notice("Stop before changing gear.");
      return;
    }
    if (action.startsWith("seat:")) { this.bus?.chooseSeat(Number(action.slice(5))); this.emitSnapshot(); return; }
    if (action === "departBus") { if (this.bus?.depart()) this.audio.cue("departure"); return; }
    if (action === "requestStop") { this.bus?.requestNextStop(); this.audio.cue("bell"); vibrate(this.settings.gamepadVibration); return; }
    if (action === "exitBus") { this.exitBus(); return; }
    if (action === "walkTrain") {
      const point=this.traffic.rail?.boardingPoint;
      if(point)this.walkToDestination(this.world.collisions.closestValid(point,.6)??point);
      return;
    }
    if (action === "boardTrain") { this.boardTrain(); return; }
    if (action === "exitTrain") { this.exitTrain(); return; }
    if (action === "requestTrainStop") { if(this.traffic.rail)this.traffic.rail.held=true; this.audio.cue("bell"); return; }
    if (action === "fastBus") {
      if (this.bus?.attached && this.bus.seat !== null) { this.fastTransition = this.elapsed + 1.4; this.callbacks.notice("Fast Journey · advancing to the destination during this travel transition."); }
      return;
    }
    if ((this.bus?.attached || this.trainPassenger) && ["jump", "toggleRun", "stop"].includes(action)) return;
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
      if(this.trainPassenger){this.exitTrain();return;}
      this.interact();
      return;
    }
    if (action === "camera") {
      if(this.trainPassenger){this.trainCamera=(this.trainCamera+1)%TRAIN_CAMERAS.length;this.emitSnapshot();return;}
      if (this.bus?.attached) { this.bus.camera = (this.bus.camera + 1) % BUS_CAMERAS.length; this.emitSnapshot(); return; }
      if (this.driving) { this.cameraMode = (this.cameraMode + 1) % 3; this.input.lookAround = false; return; }
      this.cameraDistance =
        this.cameraDistance < 6 ? 9 : this.cameraDistance < 12 ? 15 : 3.5;
      return;
    }
    if (["map", "pause", "transport"].includes(action)) this.callbacks.action(action);
  }
  private groundClick(x: number, y: number) {
    if (this.driving || this.bus?.attached || this.trainPassenger) return;
    const rect = this.renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const objects: { root: THREE.Object3D; point: Vec2; run: () => void }[] = [
      ...this.vehicles.map((v,i) => ({ root: v.model.root, point: v.position, run: () => this.interact(`car-${i}`) })),
      ...this.traffic.pedestrians.map((p,i) => ({ root: p.human.root, point: p.human.root.position, run: () => this.interact(`npc-${i}`) })),
      ...this.terminals.stations.flatMap(s => { const root = this.terminals.loaded.get(s.data.id); return root ? [{ root, point: s.waiting, run: () => this.interact(`terminal-${s.data.id}`) }] : []; }),
      ...(this.busModel && this.bus?.phase !== "exited" ? [{ root: this.busModel.root, point: this.busDoorPoint()!, run: () => this.interact("bus") }] : []),
      ...(this.traffic.train?.children.map((root,i)=>({root,point:root.position,run:()=>this.interact(`train-${i}`)}))??[]),
    ];
    const picked = objects.map(o => ({ ...o, hit: ray.intersectObject(o.root, true)[0] })).filter(o => o.hit).sort((a,b) => a.hit.distance - b.hit.distance)[0];
    const occluder = picked ? ray.intersectObject(this.world.root, true)[0] : undefined;
    if (picked && (!occluder || picked.hit.distance <= occluder.distance + 0.2)) {
      if (distance(this.position, picked.point) < 4.5) picked.run();
      else { this.setDestination(picked.point, false); this.pendingInteraction = { point: picked.point, run: picked.run }; }
      return;
    }
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
  private hoverInteraction(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), this.camera);
    const targets = [
      ...this.vehicles.map((v,i) => ({ root: v.model.root, text: `Enter ${v.model.kind}`, id: `car-${i}` })),
      ...this.traffic.pedestrians.map((p,i) => ({ root: p.human.root, text: "Talk to local", id: `npc-${i}` })),
      ...this.terminals.stations.flatMap(s => { const root = this.terminals.loaded.get(s.data.id); return root ? [{ root, text: `Bus station · ${s.data.name}`, id: `terminal-${s.data.id}` }] : []; }),
      ...(this.busModel && this.bus?.phase !== "exited" ? [{ root: this.busModel.root, text: "Board bus · wait at passenger door", id: "bus" }] : []),
    ];
    const selected = targets.map(t => ({ text: t.text, id: t.id, hit: ray.intersectObject(t.root, true)[0] })).filter(t => t.hit).sort((a,b) => a.hit.distance - b.hit.distance)[0];
    const occluder = selected ? ray.intersectObject(this.world.root, true)[0] : undefined;
    const visible = selected && (!occluder || selected.hit.distance <= occluder.distance + 0.2);
    this.hovered = visible ? selected.text : ""; this.hoveredId = visible ? selected.id : undefined;
    this.renderer.domElement.style.cursor = this.hovered ? "pointer" : this.settings.movement === "mouse" ? "crosshair" : "default";
  }
  setDestination(point: Vec2, roadRoute = true) {
    this.cancelWalk();
    this.walkingWaypoints = [];
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
    this.walkingWaypoints = [];
    this.destination = undefined;
    this.pendingInteraction = undefined;
    this.marker.visible = false;
    if (this.pathLine) disposeGroup(this.pathLine);
    this.pathLine = undefined;
    this.pathStuck = 0;
  }
  setMouseDriveDirection(direction: -1 | 0 | 1) {
    if (direction !== 0) this.pendingVehicleExit = false;
    this.input.setMouseDriveDirection(direction);
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
      controller: controller.frame.id,
      inputContext: this.input.context,
      terminals: this.terminals.stations.map(s => ({ id: s.data.id, name: s.data.name, point: s.point, waiting: s.waiting, distance: distance(this.position, s.waiting) })),
      steering: this.steering,
      bus: this.bus ? { ...this.bus.snapshot(distance(this.position, this.busDoorPoint()!)), pose: this.bus.pose, doorPoint: this.busDoorPoint(), stops: this.bus.stops, travelled: this.bus.travelled, attached: this.bus.attached } : undefined,
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
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      terminalModels: this.terminals.loaded.size,
      busPassengers: this.busModel?.passengers.length ?? 0,
      streaming: this.world.streamingStats(),
    };
  }
  navigateTo(place: Place) {
    this.setDestination(
      toLocal([place.lon, place.lat], this.world.tile.origin),
    );
  }
  walkToDestination(point: Vec2) {
    const route = this.world.walkingNetwork.route(this.position, point);
    if (!route.length || distance(this.position, point) < 80) { this.setDestination(point, false); return; }
    this.cancelWalk();
    const waypoints: Vec2[] = [];
    let previous = this.position;
    for (const target of route) {
      const steps = Math.max(1, Math.ceil(distance(previous, target) / 45));
      for (let i = 1; i <= steps; i++) waypoints.push({ x: previous.x + (target.x-previous.x)*i/steps, z: previous.z + (target.z-previous.z)*i/steps });
      previous = target;
    }
    this.walkingWaypoints = waypoints;
    this.destination = { ...point }; this.destinationTolerance = 1.5;
    this.marker.position.set(point.x, this.world.height(point.x,point.z)+0.15,point.z); this.marker.visible = true;
    this.drawRoute(route); this.renderer.domElement.focus();
    this.callbacks.notice("Walking along connected streets and paths to the bus station. You can stop or take control at any time.");
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
  private refreshInteractions() {
    const open = () => !this.driving && !this.bus?.attached;
    this.interactions.targets = [
      ...this.vehicles.map((v,i) => ({ id: `car-${i}`, label: `Enter ${v.model.kind}`, point: v.position, range: 5.5, available: open, execute: () => this.performInteraction(`car-${i}`) })),
      ...this.traffic.pedestrians.map((p,i) => ({ id: `npc-${i}`, label: "Talk to local", point: p.human.root.position, range: 4, available: () => open() && p.human.root.visible, execute: () => this.performInteraction(`npc-${i}`) })),
      ...this.terminals.stations.map(s => ({ id: `terminal-${s.data.id}`, label: `Bus station · ${s.data.name}`, point: s.waiting, range: 22, available: open, execute: () => this.callbacks.action("transport") })),
      ...this.traffic.agents.filter(a => a.model.kind === "Bus").map((a,i) => ({ id: `traffic-bus-${i}`, label: "View bus services", point: a.model.root.position, range: 8, available: open, execute: () => this.callbacks.action("transport") })),
      ...(this.traffic.train?.children.map((c,i) => ({ id: `train-${i}`, label: this.traffic.rail?.atStation ? "Board local train" : "Wait for local train", point: c.position, range: 12, available: open, execute: () => this.boardTrain() })) ?? []),
      { id: "landmark", label: ["airport", "station", "hub"].includes(this.region.theme) ? "Board / travel services" : "About this landmark", point: this.world.landmarkPosition, range: 65, available: open, execute: () => { this.discover(); this.callbacks.action(["airport", "station", "hub"].includes(this.region.theme) ? "transport" : "landmark"); } },
      ...(this.bus && this.bus.phase !== "exited" ? [{ id: "bus", label: this.bus.canBoard(distance(this.position, this.busDoorPoint()!)) ? "Board bus" : "Wait for bus · passenger door", point: this.busDoorPoint()!, range: 8, available: open, execute: () => this.performInteraction("bus") }] : []),
      ...(this.driving ? [{ id: "driving", label: "Exit vehicle", point: this.position, range: 1, available: () => true, execute: () => this.performInteraction("driving") }] : []),
      ...(this.bus?.attached ? [{ id: "passenger", label: this.bus.canExit ? "Exit at stop" : "Bus passenger", point: this.position, range: 1, available: () => true, execute: () => this.performInteraction("passenger") }] : []),
    ];
  }
  interact(targetId?: string) {
    if (this.paused) return;
    this.refreshInteractions();
    const id = targetId ?? (this.input.device === "mouse" ? this.hoveredId : undefined);
    if (this.interactions.interact(this.position, id)) return;
    const target = id ? this.interactions.targets.find(t => t.id === id && t.available()) : undefined;
    if (target) { this.setDestination(target.point, false); this.pendingInteraction = { point: target.point, run: () => this.interact(id) }; }
    else this.callbacks.notice("Walk closer to a parked vehicle, person, station or landmark to interact.");
  }
  private performInteraction(targetId: string) {
    if (this.paused) return;
    if (!this.paused) this.renderer.domElement.focus();
    if (targetId.startsWith("npc-")) {
      const npc = this.traffic.pedestrians[Number(targetId.slice(4))];
      if (npc) this.callbacks.notice(`${npc.name}: Welcome to ${this.region.town}! ${this.region.landmark} is nearby. Open the map to plan your next stop.`);
      return;
    }
    if (this.bus?.attached) { if (this.bus.canExit) this.exitBus(); else this.callbacks.notice("Request the next stop and wait for the doors to open."); return; }
    if (targetId === "bus" && this.bus && !this.driving && distance(this.position, this.busDoorPoint()!) < 8) {
      if (this.jumpHeight > 0.05) { this.callbacks.notice("Land before boarding the bus."); return; }
      this.boardingStart = { ...this.position };
      if (this.bus.board(distance(this.position, this.busDoorPoint()!))) {
        this.cancelWalk(); this.input.clear(); this.input.setContext("BUS_PASSENGER"); this.velocity = { x: 0, z: 0 };
        this.cameraYaw = this.bus.pose.yaw; this.cameraPitch = 0.06; this.orbitUntil = 0;
        this.safeLocation = { region: this.region.id, area: this.world.tile.id, position: { ...this.position }, coordinate: toGeo(this.position, this.world.tile.origin) };
        this.callbacks.notice("Boarding through the passenger door. Select an available seat.");
        vibrate(this.settings.gamepadVibration);
      } else this.callbacks.notice("Wait at the passenger door. Boarding is available only when the bus has stopped and the doors are fully open.");
      return;
    }
    if (this.driving) {
      if (Math.abs(this.driving.speed) > 0.5) {
        this.pendingVehicleExit = true;
        this.input.clear();
        this.callbacks.notice("Braking to a safe stop before you exit.");
        return;
      }
      this.exitVehicleNow();
      return;
    }
    const closest = targetId.startsWith("car-") ? this.vehicles[Number(targetId.slice(4))] : this.vehicles.reduce((a, b) =>
      distance(b.position, this.position) < distance(a.position, this.position)
        ? b
        : a,
    );
    if (closest && distance(closest.position, this.position) < 5.5) {
      if (this.jumpHeight > 0.05) return;
      this.driving = closest;
      this.hovered = "";
      this.hoveredId = undefined;
      this.input.driving = true;
      this.input.setContext("IN_VEHICLE"); this.reverse = this.handbrake = false; this.steering = 0; this.input.neutral = this.input.mouseX; this.cameraMode = 0;
      this.input.clear();
      this.runEnabled = false;
      this.player.root.visible = false;
      this.cancelWalk();
      this.velocity = { x: 0, z: 0 };
      this.orbitUntil = this.elapsed + 0.4;
      this.callbacks.notice(
        `${closest.model.kind} · ${this.settings.movement === "mouse" ? "Forward / Reverse buttons or hold left to drive; right mouse brakes; move the cursor to steer." : "arrows, WASD or controller to drive."}`,
      );
      return;
    }
    if (this.terminals.nearby(this.position)) { this.callbacks.action("transport"); return; }
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
  private exitVehicleNow() {
    const car = this.driving;
    if (!car) return false;
    const body = vehicleDimensions(car.model.kind);
    const forward = { x: Math.sin(car.yaw), z: -Math.cos(car.yaw) };
    const right = { x: Math.cos(car.yaw), z: Math.sin(car.yaw) };
    const sideDistance = body.halfWidth + this.player.dimensions.radius + 0.2;
    const endDistance = body.halfLength + this.player.dimensions.radius + 0.2;
    const exits: Vec2[] = [];
    for (const side of [-1, 1]) {
      for (const along of [0, body.halfLength * 0.45, -body.halfLength * 0.45]) {
        exits.push({
          x: car.position.x + right.x * sideDistance * side + forward.x * along,
          z: car.position.z + right.z * sideDistance * side + forward.z * along,
        });
      }
    }
    exits.push(
      { x: car.position.x + forward.x * endDistance, z: car.position.z + forward.z * endDistance },
      { x: car.position.x - forward.x * endDistance, z: car.position.z - forward.z * endDistance },
    );
    const point = exits.find((p) => !this.world.collisions.blocked(p, this.player.dimensions.radius));
    if (!point) {
      this.pendingVehicleExit = false;
      this.callbacks.notice("There is no safe space beside this vehicle. Move to an open area and try again.");
      return false;
    }
    car.speed = 0;
    this.position = { ...point };
    this.playerYaw = car.yaw;
    this.driving = undefined;
    this.hovered = "";
    this.hoveredId = undefined;
    this.pendingVehicleExit = false;
    this.input.driving = false;
    this.input.setContext("ON_FOOT");
    this.input.clear();
    this.reverse = this.handbrake = false;
    this.cameraMode = 0;
    this.verticalSpeed = this.jumpHeight = 0;
    this.velocity = { x: 0, z: 0 };
    this.cancelWalk();
    this.player.root.visible = true;
    this.player.root.position.set(point.x, this.world.height(point.x, point.z), point.z);
    this.player.root.rotation.y = Math.PI - this.playerYaw;
    this.cameraYaw = this.playerYaw;
    this.cameraTarget.set(point.x, this.world.height(point.x, point.z) + 1.25, point.z);
    this.callbacks.notice("Back on foot. The scenic route is yours.");
    return true;
  }
  busDoorPoint() {
    if (!this.bus) return undefined;
    const p = this.bus.pose, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const doorZ=3.5*busScale(this.bus.plan.type);
    return { x: p.x - 2.2 * c + doorZ * s, z: p.z - 2.2 * s - doorZ * c };
  }
  walkToBusDoor() {
    if (!this.bus) return;
    const bus = this.bus;
    if (["arriving", "waiting", "opening"].includes(bus.phase) && bus.stopIndex === 0) {
      const p = bus.poseAt(bus.stops[0].distance);
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const doorZ=3.5*busScale(bus.plan.type);
      this.setDestination({ x: p.x - 2.7 * c + doorZ * s, z: p.z - 2.7 * s - doorZ * c }, false);
    } else { const point = this.busDoorPoint(); if (point) this.setDestination(point, false); }
  }
  private drawBusNotice(message: string) { this.callbacks.notice(message); }
  private boardTrain() {
    const rail=this.traffic.rail, coach=this.traffic.train?.children[0];
    if(!rail?.atStation || !coach || this.driving || this.bus?.attached || distance(this.position,coach.position)>14) {this.callbacks.notice("Wait beside the mapped station until the local shuttle has stopped.");return;}
    this.safeLocation={region:this.snapshot().district??this.region.id,area:this.world.tile.id,position:{...this.position},coordinate:toGeo(this.position,this.world.tile.origin)};
    this.trainPassenger=true; this.trainCamera=0;this.cancelWalk();this.input.clear();this.input.setContext("TRAIN_PASSENGER");
    this.callbacks.notice("Local rail shuttle · seated travel on this imported rail segment. Request the next mapped station to exit. This is a game simulation.");
    this.emitSnapshot();
  }
  private exitTrain() {
    const rail=this.traffic.rail, coach=this.traffic.train?.children[0];
    if(!this.trainPassenger || !rail?.atStation || !coach){this.callbacks.notice("Request a station stop and wait until the train is stationary.");return;}
    const pose=rail.pose,point=this.world.collisions.closestValid({x:pose.x-Math.cos(pose.yaw)*3.8,z:pose.z-Math.sin(pose.yaw)*3.8},.6);
    if(!point){this.callbacks.notice("The platform exit is blocked.");return;}
    this.trainPassenger=false;rail.held=false;this.position=point;this.player.root.visible=true;this.input.clear();this.input.setContext("ON_FOOT");this.actualSpeed=0;this.velocity={x:0,z:0};
    this.cameraTarget.set(point.x,this.world.height(point.x,point.z)+1.25,point.z);this.callbacks.action("arrivalSave");
    this.emitSnapshot();
  }
  private exitBus() {
    if (!this.bus?.canExit) { this.callbacks.notice("Wait until the bus is stopped and the doors are open."); return; }
    const pose = this.bus.pose, door = this.busDoorPoint()!;
    // Check the curbside exit with the bus's physical footprint still present.
    this.world.collisions.boxes.push({ center: pose, yaw: pose.yaw, halfWidth: 1.4, halfLength: BUS_SPECS[this.bus.plan.type].length/2+0.2 });
    const point = this.world.collisions.closestValid({ x: door.x - Math.cos(pose.yaw) * 1.5, z: door.z - Math.sin(pose.yaw) * 1.5 }, 0.6);
    if (!point) { this.callbacks.notice("The passenger exit is blocked. Stay seated."); return; }
    const record = this.bus.record();
    this.bus.exit(); this.journeys.push(record); this.travelled += record.distance;
    this.position = { ...point }; this.playerYaw = pose.yaw; this.player.root.visible = true;
    this.velocity = { x: 0, z: 0 }; this.jumpHeight = this.verticalSpeed = this.actualSpeed = 0;
    this.input.clear(); this.input.setContext("ON_FOOT"); this.cancelWalk();
    this.cameraYaw = this.playerYaw; this.cameraTarget.set(point.x, this.world.height(point.x, point.z) + 1.25, point.z);
    this.safeLocation = { region: this.bus.target.district, area: this.world.tile.id, position: point, coordinate: toGeo(point, this.world.tile.origin) };
    if (!this.visited.includes(this.bus.target.district)) this.visited.push(this.bus.target.district);
    this.callbacks.notice(`${record.completed ? "ARRIVED AT DESTINATION" : "Arrived at stop"} · ${record.to} · ${this.bus.target.district} · ${(record.distance / 1000).toFixed(1)} km · ${Math.round(record.seconds / 60)} in-game minutes · ${record.route}`);
    this.callbacks.action("arrivalSave"); this.emitSnapshot(); vibrate(this.settings.gamepadVibration);
  }
  private updateBus(dt: number) {
    if (!this.bus || !this.busModel) return;
    const bus = this.bus;
    if (this.fastTransition && this.elapsed >= this.fastTransition) {
      this.fastTransition = 0;
      if (bus.fastForward()) { this.world.updateStreaming(bus.pose, true, bus.pose); this.audio.cue("door"); }
    }
    const pose = bus.pose;
    const forward = { x: Math.sin(pose.yaw), z: -Math.cos(pose.yaw) };
    const obstruction = this.vehicles.some(v => {
      const dx = v.position.x - pose.x, dz = v.position.z - pose.z;
      return dx * forward.x + dz * forward.z > 0 && dx * forward.x + dz * forward.z < 11 && Math.abs(dx * forward.z - dz * forward.x) < 2.4;
    });
    const signal = this.signals.some(p => distance(p, pose) < 16 && (p.x - pose.x) * forward.x + (p.z - pose.z) * forward.z > 0 && this.elapsed % 22 < 9);
    bus.update(dt, obstruction, signal);
    const next = bus.pose;
    this.busModel.root.position.set(next.x, this.world.height(next.x, next.z), next.z);
    this.busModel.root.rotation.y = -next.yaw;
    this.busModel.root.rotation.order="YXZ";
    const front=this.world.height(next.x+Math.sin(next.yaw)*3.1,next.z-Math.cos(next.yaw)*3.1);
    const back=this.world.height(next.x-Math.sin(next.yaw)*3.1,next.z+Math.cos(next.yaw)*3.1);
    this.busModel.root.rotation.x=THREE.MathUtils.damp(this.busModel.root.rotation.x,Math.atan2(front-back,6.2),4,dt);
    const ahead=bus.poseAt(bus.travelled+18),turn=Math.atan2(Math.sin(ahead.yaw-next.yaw),Math.cos(ahead.yaw-next.yaw));
    this.busModel.update(bus.door, bus.speed, bus.phase === "opening" || bus.speed < 1, dt, bus.occupied,turn);
    if (this.lastBusPhase !== bus.phase) {
      if (bus.phase === "opening") {this.audio.cue("brake");this.audio.cue("door");}
      if (bus.phase === "travelling") this.audio.cue("departure");
      if (bus.phase === "dwelling" || bus.phase === "arrived") {
        vibrate(this.settings.gamepadVibration);
        if (bus.attached) {
          const exit = this.busDoorPoint()!;
          this.safeLocation = { region: bus.target.district, area: this.world.tile.id, position: exit, coordinate: toGeo(exit, this.world.tile.origin) };
        }
      }
      this.lastBusPhase = bus.phase;
    }
    if (bus.attached) {
      this.position = { x: next.x, z: next.z }; this.playerYaw = next.yaw;
      if (!this.visited.includes(bus.target.district) && bus.phase === "arrived") this.visited.push(bus.target.district);
      this.cameraYaw = this.elapsed > this.orbitUntil ? angleLerp(this.cameraYaw, next.yaw, 1 - Math.exp(-dt * 2)) : this.cameraYaw;
    }
  }
  recover() {
    if(this.trainPassenger){this.callbacks.notice("Leave the train at a mapped station before returning to the arrival point.");return;}
    if (this.bus?.attached) { this.callbacks.notice("Request a stop or use Fast Journey before leaving the bus."); return; }
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
    if (this.bus && this.busModel && !this.bus.attached) this.world.collisions.boxes.push({ center: this.bus.pose,
      yaw: this.bus.pose.yaw, halfWidth: 1.35, halfLength: BUS_SPECS[this.bus.plan.type].length/2+0.1, minY: this.world.height(this.bus.pose.x,this.bus.pose.z), maxY: this.world.height(this.bus.pose.x,this.bus.pose.z)+3.3 });
  }
  private updatePlayer(dt: number) {
    if(this.trainPassenger){this.player.root.visible=false;this.jumpHeight=this.verticalSpeed=0;this.actualSpeed=this.traffic.rail?.speed??0;this.near="Train passenger";return;}
    if (this.bus?.attached) {
      this.updateVehicleColliders();
      if (this.bus.phase === "boarding" && this.boardingStart) {
        const bus = this.bus, pose = bus.pose, door = this.busDoorPoint()!;
        const t = Math.min(1,bus.timer / 1.2), inside = Math.max(0,(t-0.45)/0.55);
        const entry = { x: door.x + Math.cos(pose.yaw)*1.3*inside, z: door.z + Math.sin(pose.yaw)*1.3*inside };
        const approach = Math.min(1,t/0.45);
        this.position = { x: this.boardingStart.x+(entry.x-this.boardingStart.x)*approach, z: this.boardingStart.z+(entry.z-this.boardingStart.z)*approach };
        this.jumpHeight = inside * 1.05;
        this.player.root.visible = true;
        this.player.root.position.set(this.position.x,this.world.height(this.position.x,this.position.z)+this.jumpHeight,this.position.z);
        this.player.root.rotation.y = Math.PI - pose.yaw;
        this.player.animate(this.elapsed,1.4,0,0);
        this.actualSpeed = 0; this.near = "Boarding bus"; return;
      }
      this.jumpHeight = this.verticalSpeed = 0;
      this.position = { x: this.bus.pose.x, z: this.bus.pose.z }; this.playerYaw = this.bus.pose.yaw;
      this.player.root.visible = false; this.actualSpeed = this.bus.speed; this.near = this.bus.canExit ? "Exit at stop" : "Bus passenger";
      this.input.setContext("BUS_PASSENGER"); return;
    }
    this.input.driving = Boolean(this.driving);
    this.updateVehicleColliders();
    const old = { ...this.position };
    this.collided = false;
    const forward = this.input.axis("backward", "forward", "KeyS", "KeyW"),
      right = this.input.axis("left", "right", "KeyA", "KeyD");
    if (this.driving) {
      const car = this.driving;
      let throttle = forward;
      const mouseDriving = this.settings.movement === "mouse" && this.input.device !== "gamepad";
      const pad = controller.frame;
      const handbrake = this.handbrake || this.input.keys.has(this.settings.bindings.jump) || pad.handbrake;
      const targetSteering = mouseDriving && this.settings.mouseSteering && !this.input.lookAround
        ? mouseSteering(this.input.mouseX, this.input.neutral, this.settings.steeringSensitivity, this.settings.steeringDeadzone)
        : right;
      this.steering = smoothSteering(this.steering, targetSteering, car.speed, dt, this.settings.steeringAssist);
      const steering = this.steering;
      const mouseDirection = this.input.mouseDriveDirection;
      if (mouseDriving && mouseDirection !== 0 && Math.abs(car.speed) < 0.5)
        this.reverse = mouseDirection < 0;
      const desiredDirection = mouseDirection || (this.reverse ? -1 : 1);
      const mouseAccelerating = this.input.leftHeld || mouseDirection !== 0;
      const changingDirection = mouseDriving && mouseAccelerating && car.speed * desiredDirection < -0.15;
      const accelerator = this.pendingVehicleExit
        ? 0
        : mouseDriving
          ? Number(mouseAccelerating && !this.input.lookAround && !changingDirection)
          : pad.accelerate || Math.max(0, throttle);
      const brake = this.pendingVehicleExit
        ? 1
        : mouseDriving
          ? Number((this.input.rightHeld && !this.input.lookAround) || changingDirection)
          : pad.brake || (throttle < 0 && car.speed > 0.2 ? -throttle : 0);
      const braking = brake > 0 || handbrake;
      const keyboardReverse = !mouseDriving && throttle < 0 && car.speed <= 0.2;
      car.speed = vehicleThrottle(car.speed, keyboardReverse ? -throttle : accelerator, brake, keyboardReverse || this.reverse, handbrake, dt);
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
        if (this.elapsed - this.lastSaveNotice > 0.7) { vibrate(this.settings.gamepadVibration, 0.6); this.lastSaveNotice = this.elapsed; }
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
      const front = this.world.height(next.x + Math.sin(car.yaw) * halfLength, next.z - Math.cos(car.yaw) * halfLength);
      const back = this.world.height(next.x - Math.sin(car.yaw) * halfLength, next.z + Math.cos(car.yaw) * halfLength);
      car.model.root.rotation.x = THREE.MathUtils.damp(car.model.root.rotation.x, Math.atan2(front - back, halfLength * 2), 5, dt);
      if (["Motorcycle", "Scooter"].includes(car.model.kind)) car.model.root.rotation.z = -steering * Math.min(0.25, Math.abs(car.speed) * 0.02);
      this.playerYaw = car.yaw;
      if (
        Math.abs(car.speed) > 0.5 &&
        this.elapsed > this.orbitUntil &&
        !(this.input.rightHeld && this.input.lookAround)
      )
        this.cameraYaw = angleLerp(
          this.cameraYaw,
          car.yaw,
          1 - Math.exp(-dt * 2.7),
        );
      if (this.pendingVehicleExit && Math.abs(car.speed) <= 0.5) {
        car.speed = 0;
        this.exitVehicleNow();
        return;
      }
    } else {
      if (!this.path.length && this.walkingWaypoints.length) {
        while (this.walkingWaypoints.length && distance(this.position,this.walkingWaypoints[0]) < 1.2) this.walkingWaypoints.shift();
        const next = this.walkingWaypoints[0];
        if (next) {
          const segment = findPath(this.position,next,this.world.collisions,this.player.dimensions.radius);
          if (!segment.length) { this.cancelWalk(); this.callbacks.notice("This street connection is blocked. Choose open ground to continue."); }
          else { this.path = segment; this.walkingWaypoints.shift(); }
        }
      }
      let dx =
          right * Math.cos(this.cameraYaw) + forward * Math.sin(this.cameraYaw),
        dz =
          right * Math.sin(this.cameraYaw) - forward * Math.cos(this.cameraYaw),
        amount = Math.hypot(dx, dz);
      const running =
          this.runEnabled ||
          this.input.keys.has(this.settings.bindings.run) ||
          this.input.keys.has("ShiftRight") || controller.frame.sprint,
        analogAmount = Math.min(1, amount),
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
      let moveSpeed = speed * (amount && !this.path.length ? analogAmount : 1);
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
    const station = this.terminals.nearby(this.position);
    if (!this.driving && station) {
      this.near = `Bus station · ${station.data.name}`;
      if (!this.discoveredStations.includes(station.data.id)) this.discoveredStations.push(station.data.id);
    }
    if (this.bus && this.bus.phase !== "exited" && !this.driving && distance(this.position, this.busDoorPoint()!) < 8) this.near = this.bus.canBoard(distance(this.position, this.busDoorPoint()!)) ? "Board bus" : "Wait for bus · passenger door";
    if (this.pendingInteraction && distance(this.position, this.pendingInteraction.point) < 3.8) {
      const run = this.pendingInteraction.run; this.pendingInteraction = undefined; this.cancelWalk(); run();
    }
    this.refreshInteractions();
    this.near = this.interactions.resolve(this.position)?.label ?? "";
    if (distance(this.position, this.world.landmarkPosition) < 65)
      this.discover();
  }
  private updateCamera(dt: number) {
    const coach=this.trainPassenger?this.traffic.train?.children[0]:undefined;
    if(coach && this.trainCamera!==2){
      coach.updateWorldMatrix(true,false);
      const window=this.trainCamera===1,eye=coach.localToWorld(new THREE.Vector3(window?-1.19:-.85,2.5,-2.8));
      this.camera.position.copy(eye);
      const relative=this.cameraYaw-(this.traffic.rail?.pose.yaw??0)+(window?-Math.PI/2:0);
      this.camera.lookAt(eye.clone().add(new THREE.Vector3(Math.sin(relative),-Math.sin(this.cameraPitch)*.4,-Math.cos(relative)).transformDirection(coach.matrixWorld)));
      this.sky.position.copy(eye);this.updateSun();return;
    }
    const passenger = this.bus?.attached && this.bus.phase !== "boarding" ? this.bus : undefined;
    if (passenger && passenger.camera !== 2) {
      const pose = passenger.pose, seat = seatPosition(passenger.seat ?? 0);
      const local = passenger.camera === 1 ? { x: seat.x < 0 ? -1.12 : 1.12, z: seat.z } : passenger.camera === 3 ? { x: -0.25, z: -3.5 } : seat;
      const interior=this.busModel!.chassis.root;
      interior.updateWorldMatrix(true,false);
      const eye = interior.localToWorld(new THREE.Vector3(local.x,2.48,local.z));
      this.camera.position.copy(eye);
      const yaw = this.cameraYaw + (passenger.camera === 1 ? (seat.x < 0 ? -Math.PI / 2 : Math.PI / 2) : 0);
      const relative=yaw-pose.yaw;
      const direction=new THREE.Vector3(Math.sin(relative)*Math.cos(this.cameraPitch),-Math.sin(this.cameraPitch)*0.4,-Math.cos(relative)*Math.cos(this.cameraPitch)).transformDirection(interior.matrixWorld);
      this.camera.lookAt(eye.clone().add(direction));
      this.sky.position.copy(eye); this.updateSun(); return;
    }
    if (this.driving && this.cameraMode === 2) {
      const car = this.driving;
      car.model.root.updateWorldMatrix(true,false);
      const eye = car.model.root.localToWorld(new THREE.Vector3(0,1.88,-1.6));
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(new THREE.Vector3(0,-0.2,-15).transformDirection(car.model.root.matrixWorld)));
      this.sky.position.copy(eye); this.updateSun(); return;
    }
    const target = new THREE.Vector3(
      this.position.x,
      this.world.height(this.position.x, this.position.z) +
        (passenger ? 2 : this.driving ? 1.3 : 1.25) +
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
    const distance = passenger || this.trainPassenger ? Math.max(16, this.cameraDistance) : this.driving ? (this.cameraMode === 1 ? 5.5 : this.cameraDistance + 3 + Math.abs(this.driving.speed) * 0.08) : this.cameraDistance;
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
    this.updateSun();
  }
  private updateSun() {
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
  private simulate(dt: number) {
    this.elapsed += dt;
    const pad = controller.frame;
    if (Math.abs(pad.lookX) + Math.abs(pad.lookY) > 0.01) {
      this.input.device = "gamepad"; this.orbitUntil = this.elapsed + 2;
      this.cameraYaw -= pad.lookX * dt * 2 * this.settings.sensitivity;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + pad.lookY * dt * 1.3 * (this.settings.invert ? -1 : 1), -0.12, 0.95);
    }
    if (pad.accelerate || pad.brake || Math.abs(pad.moveX) + Math.abs(pad.moveY) > 0.01) this.input.device = "gamepad";
    this.updateBus(dt);
    this.updatePlayer(dt);
    this.traffic.update(dt, this.elapsed, this.position);
    if(this.trainPassenger&&this.traffic.rail){const pose=this.traffic.rail.pose;this.position={x:pose.x,z:pose.z};this.playerYaw=pose.yaw;if(this.elapsed>this.orbitUntil)this.cameraYaw=angleLerp(this.cameraYaw,pose.yaw,1-Math.exp(-dt*2));}
    const lookahead = this.bus?.attached ? this.bus.points[Math.min(this.bus.points.length - 1, this.bus.pose.segment + 6)] : undefined;
    this.world.updateStreaming(this.position, false, lookahead);
    this.terminals.update(this.position, dt, this.elapsed, this.bus?.door === 1 ? this.busDoorPoint() : undefined);
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
      !this.bus?.attached && !this.trainPassenger &&
      this.mouseGround &&
      this.elapsed - this.clickTime > 0.45
    ) {
      this.clickTime = this.elapsed;
      this.groundClick(this.mouseGround.x, this.mouseGround.y);
    }
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
    if (!this.paused) this.simulate(dt);
    this.audio.update(
      this.settings,
      this.driving?.speed ?? (this.bus?.attached ? this.bus.speed : 0),
      Boolean(this.driving || this.bus?.attached),
      this.paused,
      this.elapsed,
      {theme:this.region.theme,nearStation:!!this.terminals.nearby(this.position,45),market:["mall","junction","hub"].includes(this.region.theme),trainSpeed:this.trainPassenger?this.traffic.rail?.speed:this.traffic.train&&distance(this.position,this.traffic.train.children[0].position)<110?this.traffic.rail?.speed:0},
    );
    this.renderer.render(this.scene, this.camera);
    this.elapsedHud += raw;
    if (this.elapsedHud > 0.25) {
      this.elapsedHud = 0;
      this.emitSnapshot();
    }
  }
  /** Development-only deterministic integration. It advances the same simulation used by animation frames. */
  advanceVerification(seconds: number) {
    if (!import.meta.env.DEV || this.paused || !Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error("Verification stepping requires an active development session and 0–30 seconds.");
    const steps = Math.ceil(seconds * 30), dt = seconds / steps;
    let maxStep = 0, previous = { ...this.position };
    const phases = new Set<string>();
    for (let i = 0; i < steps; i++) {
      this.simulate(dt);
      maxStep = Math.max(maxStep,distance(previous,this.position)); previous = { ...this.position };
      if (this.bus) phases.add(this.bus.phase);
    }
    this.renderer.render(this.scene,this.camera); this.emitSnapshot(); this.previous = 0;
    return { maxStep, phases:[...phases], snapshot:this.snapshot(), perf:this.perfDiagnostics() };
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
    const currentDistrict = this.boundaries ? districtAt(geo,this.boundaries) : undefined;
    const station = this.terminals.nearby(this.position,40);
    return {
      position: { ...this.position },
      yaw: this.playerYaw,
      lat: geo[1],
      lon: geo[0],
      speed: Math.abs(this.driving?.speed ?? this.actualSpeed) * 3.6,
      driving: Boolean(this.driving),
      vehicle: this.driving?.model.kind ?? "",
      near: this.driving
        ? "Exit vehicle"
        : this.hovered && this.input.device === "mouse"
          ? this.hovered
          : this.near,
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
      motion: this.trainPassenger ? "train passenger" : this.bus?.attached ? "bus passenger" : this.driving
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
      bus: this.bus ? { ...this.bus.snapshot(distance(this.position, this.busDoorPoint()!)), transitioning: this.fastTransition > 0 } : undefined,
      inputDevice: this.input.device,
      controller: controller.frame.connected ? controller.frame.id : "",
      cameraMode: this.trainPassenger ? TRAIN_CAMERAS[this.trainCamera] : this.bus?.attached ? BUS_CAMERAS[this.bus.camera] : this.driving ? ["Chase", "Close chase", "Hood"][this.cameraMode] : "Third-person",
      rail:this.traffic.rail?{attached:this.trainPassenger,speed:this.traffic.rail.speed*3.6,stopped:this.traffic.rail.atStation,canBoard:this.traffic.rail.atStation&&distance(this.position,this.traffic.rail.pose)<14,canExit:this.trainPassenger&&this.traffic.rail.atStation,nextStop:this.traffic.rail.target.name,camera:TRAIN_CAMERAS[this.trainCamera],hasStation:!!this.traffic.rail.boardingPoint}:undefined,
      steering: this.steering,
      reverse: this.reverse,
      handbrake: this.handbrake,
      locality: this.bus?.phase === "exited" || this.bus?.phase === "arrived" ? this.bus.target.name : this.bus?.attached ? this.world.nearestRoadName(this.position) : this.region.town,
      district: currentDistrict ?? (this.bus?.phase === "exited" || this.bus?.phase === "arrived" ? this.bus.target.district : this.region.id),
      nearStation: station ? { id: station.data.id, name: station.data.name, distance: distance(this.position,station.waiting) } : undefined,
    };
  }
  save(): SaveData {
    return {
      version: 2,
      avatar: this.avatar,
      region: this.snapshot().district ?? this.region.id,
      area: this.world.tile.id,
      position: { ...this.position },
      yaw: this.playerYaw,
      visited: [...this.visited],
      discovered: [...this.discovered],
      distance: this.travelled,
      savedAt: new Date().toISOString(),
      safeLocation: this.bus?.attached || this.trainPassenger ? this.safeLocation : { region: this.snapshot().district??this.region.id, area: this.world.tile.id, position: { ...this.position }, coordinate: toGeo(this.position, this.world.tile.origin) },
      checkpoint: this.trainPassenger?"last-transport-stop":this.bus?.attached ? "last-bus-stop" : "on-foot",
      journeys: [...this.journeys],
      discoveredStations: [...this.discoveredStations],
      controls: this.settings,
      currentVehicle: this.driving?.model.kind,
      cameraMode: this.cameraMode,
      cameraState:{yaw:this.cameraYaw,pitch:this.cameraPitch,distance:this.cameraDistance},
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
    this.terminals.dispose();
    if (this.busModel) disposeGroup(this.busModel.root);
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
