/** Vite supplies BASE_URL; Node regression tests default to domain root. */
export function dataUrl(file: string, base = import.meta.env?.BASE_URL ?? "/") {
  if (!/^[a-zA-Z0-9_-]+\.(json|geojson|md)$/.test(file)) throw new Error("Invalid geographic asset name.");
  return `${base.endsWith("/") ? base : `${base}/`}data/${file}`;
}

export async function fetchJson<T>(file: string, validate: (value: unknown) => boolean = () => true): Promise<T> {
  const url = dataUrl(file);
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (attempt === 0 && (response.status >= 500 || response.status === 429)) continue;
        throw new Error(`Could not load ${file} (${response.status}). Please retry.`);
      }
      let value: unknown;
      try { value = await response.json(); }
      catch { throw new Error(`The geographic dataset ${file} is not valid JSON. Please retry.`); }
      if (!validate(value)) throw new Error(`The geographic dataset ${file} has an invalid structure. Please retry.`);
      return value as T;
    } catch (error) {
      if (attempt === 0 && (error instanceof TypeError || controller.signal.aborted)) continue;
      throw error instanceof Error ? error : new Error(`Could not load ${file}. Please retry.`);
    } finally { clearTimeout(timeout); }
  }
  throw new Error(`Could not load ${file} after two attempts. Please retry.`);
}

export const object = (v: unknown): v is Record<string, any> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export const coordinate = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)
  && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
export const features = (v: unknown): boolean => Array.isArray(v) && v.every(f => object(f) && Number.isFinite(f.id)
  && typeof f.type === "string" && object(f.tags) && Object.values(f.tags).every(t => typeof t === "string")
  && Array.isArray(f.points) && f.points.every(coordinate));
export const validTile = (v: unknown): boolean => object(v) && typeof v.id === "string" && coordinate(v.origin)
  && Number.isFinite(v.radius) && v.radius > 75 && features(v.features);
