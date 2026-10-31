export type Vec2 = { x: number; z: number };
export type LonLat = [number, number];
export type Theme =
  | "temple"
  | "beach"
  | "backwater"
  | "tea"
  | "fishing"
  | "fort"
  | "park"
  | "dam"
  | "airport"
  | "station"
  | "mall"
  | "stadium"
  | "hub"
  | "junction";
export interface Region {
  fidelity?: LandmarkFidelity;
  id: string;
  name: string;
  town: string;
  landmark: string;
  lat: number;
  lon: number;
  origin: LonLat;
  theme: Theme;
  biome: string;
  description: string;
  source: string;
  verification: string;
  asset: string;
  approximation: string;
}
export interface Place {
  fidelity?: LandmarkFidelity;
  id: string;
  name: string;
  localName?: string;
  lat: number;
  lon: number;
  district: string;
  kind: string;
  source: string;
  iata?: string;
  playable?: boolean;
  tile?: string;
  theme?: Theme;
  terminalSource?: string;
  verification?: string;
  asset?: string;
  approximation?: string;
}
export interface GeoFeature {
  id: number;
  type: string;
  tags: Record<string, string>;
  points: LonLat[];
}
export interface Tile {
  id: string;
  origin: LonLat;
  radius: number;
  features: GeoFeature[];
  source: string;
  license: string;
  terrain?: TerrainGrid;
}
export interface TerrainGrid {
  origin: LonLat; minX: number; minZ: number; width: number; height: number;
  step: number; scale: number; values: number[];
  source: string; reference: string; attribution: string; retrieved: string;
  processing: string; sourceResolutionMetres: number;
}
export interface DistrictFeature {
  type: string;
  properties: { id: string; shapeName: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
export interface DistrictCollection {
  type: string;
  features: DistrictFeature[];
}
export interface Geography {
  regions: Region[];
  places: Place[];
  boundaries: DistrictCollection;
  network: StateNetwork;
  busStations: BusStation[];
  busRoutes: BusService[];
}
export type LandmarkFidelity = "A" | "B" | "C";
export interface BusStation {
  id: string; name: string; localName: string; district: string;
  coordinate: LonLat; source: string; reference?: string;
  fidelity: LandmarkFidelity; status: string; tile: string;
  type?: "public_terminal" | "private_terminal" | "mobility_hub" | "bus_station";
  verifiedAt?: string;
  verification?: string;
}
export interface BusService {
  id: string; from: string; to: string; file: string; distance: number;
  source: string; simulation: true;
}
export interface BusRouteData {
  service: BusService; points: LonLat[]; features: GeoFeature[];
  drivingPoints?: LonLat[];
  clearance?: { halfWidth: number; halfLength: number; sampleMetres: number; scope: string };
  stops: { name: string; coordinate: LonLat; source: string; district: string }[];
}
export type BusType = "public" | "private" | "fast" | "coach" | "mini";
export interface BusPlan { route: BusRouteData; stations: BusStation[]; type: BusType; }
export interface JourneyRecord {
  route: string; from: string; to: string; distance: number; seconds: number;
  completedAt: string; mode: "full" | "fast"; completed: boolean;
}
export interface BusSnapshot {
  attached: boolean;
  phase: string; door: number; speed: number; from: string; to: string;
  nextStop: string; remaining: number; total: number; seconds: number;
  progress: number; seated: boolean; seat: number | null; occupied: number[];
  requestStop: boolean; canBoard: boolean; canExit: boolean;
  acknowledgedStop?: string | null;
  camera: string; route: string; type: BusType; passengers: number; mode: "full" | "fast";
  transitioning?: boolean;
}
export interface StateNetwork {
  version?: string | number;
  source: string;
  license: string;
  features: {
    id: number;
    kind: string;
    ref: string;
    name: string;
    points: LonLat[];
    oneway?: boolean | "yes" | "no" | "-1";
  }[];
}
export type Gender = "male" | "female";
export interface AvatarStyle {
  gender: Gender;
  skin: string;
  shirt: string;
  pants: string;
  shoes: string;
  hair: "short" | "curly" | "long";
  outfit?: "casual" | "field";
}
export type MovementMode = "arrows" | "mouse" | "wasd";
export interface Settings {
  movement: MovementMode;
  sensitivity: number;
  distance: number;
  mouseSteering: boolean;
  invert: boolean;
  quality: "low" | "medium" | "high" | "ultra";
  weather: "sunny" | "cloudy" | "rainy" | "monsoon" | "foggy";
  time: "morning" | "afternoon" | "evening" | "night";
  master: number;
  ambience: number;
  engine: number;
  language: "en" | "ml";
  bindings: Record<string, string>;
  steeringSensitivity: number;
  steeringDeadzone: number;
  steeringAssist: boolean;
  gamepadDeadzone: number;
  gamepadVibration: boolean;
  gamepadButtons: Record<string, number>;
  gamepadAxes: number[];
  busDwell: number;
}
export interface SaveData {
  version: 1 | 2;
  avatar: AvatarStyle;
  region: string;
  area?: string;
  position: Vec2;
  yaw: number;
  visited: string[];
  discovered: string[];
  distance: number;
  savedAt: string;
  safeLocation?: { region: string; area: string; position: Vec2; coordinate?: LonLat };
  journeys?: JourneyRecord[];
  discoveredStations?: string[];
  controls?: Settings;
  checkpoint?: "on-foot" | "last-bus-stop" | "last-transport-stop";
  currentVehicle?: string;
  cameraMode?: number;
  cameraState?: {yaw:number;pitch:number;distance:number};
}
export interface Snapshot {
  position: Vec2;
  yaw: number;
  lat: number;
  lon: number;
  speed: number;
  driving: boolean;
  vehicle: string;
  near: string;
  fps: number;
  calls: number;
  triangles: number;
  chunks: number;
  distance: number;
  discovered: string[];
  visited: string[];
  path: Vec2[];
  destination?: Vec2;
  groundY: number;
  motion: string;
  collision: boolean;
  traffic: number;
  pedestrians: number;
  runEnabled: boolean;
  bus?: BusSnapshot;
  inputDevice?: string;
  controller?: string;
  cameraMode?: string;
  steering?: number;
  reverse?: boolean;
  handbrake?: boolean;
  locality?: string;
  district?: string;
  nearStation?: { id: string; name: string; distance: number };
  rail?: { attached: boolean; speed: number; stopped: boolean; canBoard: boolean; canExit: boolean; nextStop: string; camera: string; hasStation: boolean };
}
export const DEFAULT_AVATAR: AvatarStyle = {
  gender: "male",
  skin: "#a96c48",
  shirt: "#e8dfc5",
  pants: "#40544b",
  shoes: "#3a2e27",
  hair: "short",
  outfit: "casual",
};
export const DEFAULT_SETTINGS: Settings = {
  movement: "arrows",
  sensitivity: 1,
  distance: 8,
  mouseSteering: false,
  steeringSensitivity: 1,
  steeringDeadzone: 0.12,
  steeringAssist: true,
  gamepadDeadzone: 0.16,
  gamepadVibration: true,
  gamepadButtons: { jump: 0, back: 1, interact: 2, camera: 3, map: 8, pause: 9, run: 10, transport: 4, brake: 6, accelerate: 7, up: 12, down: 13, left: 14, right: 15 },
  gamepadAxes: [0, 1, 2, 3],
  busDwell: 8,
  invert: false,
  quality: "medium",
  weather: "sunny",
  time: "evening",
  master: 0.45,
  ambience: 0.4,
  engine: 0.35,
  language: "en",
  bindings: {
    forward: "ArrowUp",
    backward: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    run: "ShiftLeft",
    jump: "Space",
    interact: "KeyE",
    map: "KeyM",
    camera: "KeyC",
    pause: "Escape",
    transport: "KeyT",
  },
};
