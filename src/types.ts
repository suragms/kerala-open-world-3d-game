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
}
export interface StateNetwork {
  source: string;
  license: string;
  features: {
    id: number;
    kind: string;
    ref: string;
    name: string;
    points: LonLat[];
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
}
export interface SaveData {
  version: 1;
  avatar: AvatarStyle;
  region: string;
  area?: string;
  position: Vec2;
  yaw: number;
  visited: string[];
  discovered: string[];
  distance: number;
  savedAt: string;
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
  },
};
