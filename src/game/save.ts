import { DEFAULT_SETTINGS } from "../types";
import type { AvatarStyle, SaveData, Settings } from "../types";
const read = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
export function readSettings(): Settings {
  return sanitizeSettings(read("kow.settings.v1"));
}
export function sanitizeSettings(value: unknown): Settings {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Settings = { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings }, gamepadButtons: { ...DEFAULT_SETTINGS.gamepadButtons }, gamepadAxes: [...DEFAULT_SETTINGS.gamepadAxes] };
  const enums = { movement: ["arrows", "mouse", "wasd"], quality: ["low", "medium", "high", "ultra"], weather: ["sunny", "cloudy", "rainy", "monsoon", "foggy"], time: ["morning", "afternoon", "evening", "night"], language: ["en", "ml"] };
  for (const [key, values] of Object.entries(enums)) if (values.includes(String(saved[key]))) Object.assign(result, { [key]: saved[key] });
  for (const key of ["mouseSteering", "invert", "steeringAssist", "gamepadVibration"] as const) if (typeof saved[key] === "boolean") result[key] = saved[key];
  for (const [key, bounds] of Object.entries({ sensitivity: [0.2, 2.5], distance: [3, 22], steeringSensitivity: [0.3, 2.5], steeringDeadzone: [0, 0.4], gamepadDeadzone: [0.05, 0.5], busDwell: [6, 30], master: [0, 1], ambience: [0, 1], engine: [0, 1] })) {
    const n = saved[key]; if (typeof n === "number" && Number.isFinite(n)) Object.assign(result, { [key]: Math.max(bounds[0], Math.min(bounds[1], n)) });
  }
  if (saved.bindings && typeof saved.bindings === "object") for (const key of Object.keys(result.bindings)) {
    const binding = (saved.bindings as Record<string, unknown>)[key]; if (typeof binding === "string" && /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Escape|Tab|Enter|[A-Z][a-z]+|F\d{1,2})$/.test(binding)) result.bindings[key] = binding;
  }
  if (saved.gamepadButtons && typeof saved.gamepadButtons === "object") for (const key of Object.keys(result.gamepadButtons)) {
    const index = (saved.gamepadButtons as Record<string, unknown>)[key]; if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= 31) result.gamepadButtons[key] = index;
  }
  if (Array.isArray(saved.gamepadAxes) && saved.gamepadAxes.length === 4 && saved.gamepadAxes.every(n => Number.isInteger(n) && n >= 0 && n <= 15)) result.gamepadAxes = [...saved.gamepadAxes];
  return result;
}
export function writeSettings(settings: Settings) {
  try {
    localStorage.setItem("kow.settings.v1", JSON.stringify(settings));
  } catch {
    /* Storage may be disabled by the browser. */
  }
}
export function readSave(): SaveData | null {
  return validateSave(read("kow.save.v2") ?? read("kow.save.v1"));
}
export function validateSave(value: unknown): SaveData | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as SaveData;
  const finitePoint = (p: SaveData["position"]) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < 2000000 && Math.abs(p.z) < 2000000;
  const list = (a: unknown) => Array.isArray(a) && a.every(s => typeof s === "string") && a.length < 10000;
  if (![1, 2].includes(saved.version) || !saved.avatar || !["male", "female"].includes(saved.avatar.gender) || !finitePoint(saved.position) || !Number.isFinite(saved.yaw) || !Number.isFinite(saved.distance) || saved.distance < 0 || typeof saved.region !== "string" || !list(saved.visited) || !list(saved.discovered)) return null;
  for (const key of ["skin", "shirt", "pants", "shoes"] as const) if (typeof saved.avatar[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(saved.avatar[key])) return null;
  if (!["short", "curly", "long"].includes(saved.avatar.hair)) return null;
  const result = { ...saved, version: 2 as const, currentVehicle: undefined,
    journeys: Array.isArray(saved.journeys) ? saved.journeys.filter(j => j && typeof j.route === "string" && Number.isFinite(j.distance) && Number.isFinite(j.seconds)).slice(-100) : [],
    discoveredStations: list(saved.discoveredStations) ? saved.discoveredStations : [] };
  if(saved.cameraState && Object.values(saved.cameraState).every(Number.isFinite)) result.cameraState={yaw:saved.cameraState.yaw,pitch:Math.max(-.12,Math.min(.95,saved.cameraState.pitch)),distance:Math.max(3,Math.min(22,saved.cameraState.distance))};
  else result.cameraState=undefined;
  if (["last-bus-stop","last-transport-stop"].includes(saved.checkpoint ?? "") && saved.safeLocation && finitePoint(saved.safeLocation.position)) {
    result.position = { ...saved.safeLocation.position }; result.region = saved.safeLocation.region; result.area = saved.safeLocation.area;
  }
  return result;
}
export function writeSave(save: SaveData): boolean {
  try {
    localStorage.setItem("kow.save.v2", JSON.stringify({ ...save, version: 2 }));
    return true;
  } catch {
    return false;
  }
}
export function readAvatar(): AvatarStyle | null {
  const avatar = read("kow.avatar.v1");
  return avatar?.gender === "male" || avatar?.gender === "female"
    ? avatar
    : null;
}
export function writeAvatar(avatar: AvatarStyle) {
  try {
    localStorage.setItem("kow.avatar.v1", JSON.stringify(avatar));
  } catch {
    /* Optional preferences. */
  }
}
