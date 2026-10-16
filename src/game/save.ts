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
  const saved = read("kow.settings.v1");
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    bindings: { ...DEFAULT_SETTINGS.bindings, ...saved?.bindings },
  };
}
export function writeSettings(settings: Settings) {
  try {
    localStorage.setItem("kow.settings.v1", JSON.stringify(settings));
  } catch {
    /* Storage may be disabled by the browser. */
  }
}
export function readSave(): SaveData | null {
  const saved = read("kow.save.v1");
  return saved?.version === 1 &&
    saved.avatar &&
    saved.position &&
    typeof saved.region === "string" &&
    Array.isArray(saved.visited) &&
    Array.isArray(saved.discovered)
    ? saved
    : null;
}
export function writeSave(save: SaveData): boolean {
  try {
    localStorage.setItem("kow.save.v1", JSON.stringify(save));
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
