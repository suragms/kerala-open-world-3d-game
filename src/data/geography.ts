import type {
  DistrictCollection,
  StateNetwork,
  Geography,
  LonLat,
  Place,
  Region,
  Tile,
  Vec2,
  BusStation,
  BusService,
  BusPlan,
  BusRouteData,
  TerrainGrid,
} from "../types";
import { validTerrain } from "../game/terrain";
import { fetchJson as json, object, coordinate, features as validFeatures, validTile } from "./loading";
export { dataUrl } from "./loading";
export const METRES_LAT = 111320;
export function toLocal(coordinate: LonLat, origin: LonLat): Vec2 {
  return {
    x:
      (coordinate[0] - origin[0]) *
      METRES_LAT *
      Math.cos((origin[1] * Math.PI) / 180),
    z: -(coordinate[1] - origin[1]) * METRES_LAT,
  };
}
export function toGeo(p: Vec2, origin: LonLat): LonLat {
  return [
    origin[0] + p.x / (METRES_LAT * Math.cos((origin[1] * Math.PI) / 180)),
    origin[1] - p.z / METRES_LAT,
  ];
}
export function haversine(a: LonLat, b: LonLat): number {
  const r = Math.PI / 180,
    dlat = (b[1] - a[1]) * r,
    dlon = (b[0] - a[0]) * r;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function insideRing(
  point: LonLat | [number, number],
  ring: number[][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function districtAt(
  point: LonLat,
  data: DistrictCollection,
): string | undefined {
  for (const f of data.features) {
    const polygons =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as number[][][]]
        : (f.geometry.coordinates as number[][][][]);
    for (const rings of polygons)
      if (
        insideRing(point, rings[0]) &&
        !rings.slice(1).some((r) => insideRing(point, r))
      )
        return f.properties.id;
  }
}
export function closestDistrictBoundary(
  point: LonLat,
  data: DistrictCollection,
): { id: string; metres: number } {
  let best = { id: "", metres: Infinity };
  for (const f of data.features) {
    const polygons =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as number[][][]]
        : (f.geometry.coordinates as number[][][][]);
    for (const rings of polygons)
      for (const ring of rings)
        for (let i = 1; i < ring.length; i++) {
          const a = toLocal(ring[i - 1] as LonLat, point),
            b = toLocal(ring[i] as LonLat, point),
            dx = b.x - a.x,
            dz = b.z - a.z,
            t = Math.max(
              0,
              Math.min(1, (-a.x * dx - a.z * dz) / (dx * dx + dz * dz || 1)),
            ),
            d = Math.hypot(a.x + t * dx, a.z + t * dz);
          if (d < best.metres) best = { id: f.properties.id, metres: d };
        }
  }
  return best;
}
// ---------------------------------------------------------------------------
// Accuracy report
// ---------------------------------------------------------------------------
export interface AccuracyReportRegion {
  id: string;
  name: string;
  boundaryMatch: boolean;
  coordinateSource: string;
  approximation: string;
}
export interface AccuracyReportAirport {
  iata: string;
  name: string;
  declaredDistrict: string;
  detectedDistrict: string | undefined;
  boundaryVerified: boolean;
  note?: string;
}
export interface AccuracyReport {
  generatedAt: string;
  dataSources: { name: string; license: string; url: string }[];
  regions: AccuracyReportRegion[];
  airports: AccuracyReportAirport[];
  warnings: string[];
}

let cachedReport: AccuracyReport | null = null;

export function buildAccuracyReport(geo: Geography): AccuracyReport {
  const boundaryIds = new Set(geo.boundaries.features.map((f) => f.properties.id));
  const warnings: string[] = [];

  const regions: AccuracyReportRegion[] = geo.regions.map((r) => {
    const match = boundaryIds.has(r.id);
    if (!match)
      warnings.push(`Region "${r.id}" has no matching district boundary feature.`);
    return {
      id: r.id,
      name: r.name,
      boundaryMatch: match,
      coordinateSource: r.source,
      approximation: r.approximation,
    };
  });

  const airports: AccuracyReportAirport[] = geo.places
    .filter((p) => p.kind === "airport" && p.iata)
    .map((p) => {
      const detected = districtAt([p.lon, p.lat], geo.boundaries);
      const verified = detected === p.district;
      if (!verified)
        warnings.push(
          `Airport ${p.iata} declared district "${p.district}" but boundary check found "${detected ?? "none"}".`,
        );
      return {
        iata: p.iata!,
        name: p.name,
        declaredDistrict: p.district,
        detectedDistrict: detected,
        boundaryVerified: verified,
        note: verified ? undefined : `Check district assignment in places.json`,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    dataSources: [
      {
        name: "OpenStreetMap",
        license: "ODbL 1.0",
        url: "https://www.openstreetmap.org/copyright",
      },
      {
        name: "geoBoundaries IND ADM2 (Pathways Data / lgdirectory.gov.in)",
        license: "ODbL 1.0",
        url: "https://www.geoboundaries.org/",
      },
      {
        name: "Kerala Tourism (Aranmula temple coordinate)",
        license: "Public reference",
        url: "https://www.keralatourism.org/",
      },
    ],
    regions,
    airports,
    warnings,
  };
}

export function getAccuracyReport(): AccuracyReport | null {
  return cachedReport;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
let geographyPromise: Promise<Geography> | undefined;
export function loadGeography(): Promise<Geography> {
  return (geographyPromise ??= Promise.all([
    json<Region[]>("regions.json", v => Array.isArray(v) && v.length > 0 && v.every(r => object(r) && typeof r.id === "string" && typeof r.name === "string" && coordinate(r.origin) && coordinate([r.lon,r.lat]))),
    json<Place[]>("places.json", v => Array.isArray(v) && v.every(p => object(p) && typeof p.id === "string" && typeof p.name === "string" && typeof p.district === "string" && coordinate([p.lon,p.lat]))),
    json<DistrictCollection>("districts.geojson", v => object(v) && Array.isArray(v.features) && v.features.length > 0 && v.features.every(f => object(f) && object(f.properties) && typeof f.properties.id === "string" && object(f.geometry) && ["Polygon","MultiPolygon"].includes(f.geometry.type) && Array.isArray(f.geometry.coordinates))),
    json<StateNetwork>("state-network.json", v => object(v) && Array.isArray(v.features) && v.features.every(f => object(f) && ["road","rail"].includes(f.kind) && Array.isArray(f.points) && f.points.length >= 2 && f.points.every(coordinate))),
    json<{ stations: BusStation[]; routes: BusService[] }>("bus-services.json", v => object(v) && Array.isArray(v.stations) && v.stations.every(s => object(s) && typeof s.id === "string" && typeof s.name === "string" && typeof s.district === "string" && typeof s.tile === "string" && coordinate(s.coordinate)) && Array.isArray(v.routes) && v.routes.every(r => object(r) && typeof r.id === "string" && typeof r.file === "string" && Number.isFinite(r.distance) && r.distance > 0)),
  ])
    .then(([regions, places, boundaries, network, buses]) => {
      const stationPlaces: Place[] = buses.stations.map(s => ({ id: s.id, name: s.name, localName: s.localName,
        lon: s.coordinate[0], lat: s.coordinate[1], district: s.district, kind: "bus_station", source: s.source,
        tile: s.tile, theme: "hub", fidelity: s.fidelity, asset: "C — Original procedural terminal", approximation: "Mapped location; terminal architecture is a procedural approximation." }));
      const enrichedPlaces = places.map(p => {
        const station = stationPlaces.find(s => s.source === p.source);
        return station ? { ...p, ...station, id: p.id } : p;
      });
      const geo = { regions, places: [...enrichedPlaces, ...stationPlaces.filter(s => !places.some(p => p.source === s.source))], boundaries, network, busStations: buses.stations, busRoutes: buses.routes };
      cachedReport = buildAccuracyReport(geo);
      if (cachedReport.warnings.length)
        console.warn("[KOW GEO] Accuracy warnings:\n" + cachedReport.warnings.join("\n"));
      return geo;
    })
    .catch((error) => {
      geographyPromise = undefined;
      throw error;
    }));
}
const tiles = new Map<string, Tile>();
let terrainIndex: Promise<{ areas: Record<string,{file:string}> }> | undefined;
export async function loadTerrain(id: string): Promise<TerrainGrid | undefined> {
  const index=await (terrainIndex ??= json<{areas:Record<string,{file:string}>}>("terrain-index.json", v => object(v) && object(v.areas) && Object.values(v.areas).every(r => object(r) && typeof r.file === "string"))
    .catch(error => { terrainIndex = undefined; throw error; }));
  const record=index.areas[id]; if (!record) return undefined;
  const grid=await json<TerrainGrid>(record.file, v => object(v) && validTerrain(v as TerrainGrid));
  if (!validTerrain(grid)) throw new Error(`The elevation grid for ${id} is invalid. Please retry.`);
  return grid;
}
const pendingTiles = new Map<string, Promise<Tile>>();
export function loadTile(id: string): Promise<Tile> {
  const cached = tiles.get(id);
  if (cached) { tiles.delete(id); tiles.set(id,cached); return Promise.resolve(cached); }
  const pending = pendingTiles.get(id);
  if (pending) return pending;
  const request = loadTileData(id).finally(() => pendingTiles.delete(id));
  pendingTiles.set(id, request); return request;
}
async function loadTileData(id: string): Promise<Tile> {
  const [source,terrain] = await Promise.all([json<Tile>(`${id}.json`,validTile),loadTerrain(id)]);
  if (source.id !== id || terrain && (Math.abs(source.origin[0]-terrain.origin[0]) > .000001 || Math.abs(source.origin[1]-terrain.origin[1]) > .000001)) throw new Error(`Geographic origin mismatch for ${id}. Please retry.`);
  const tile={...source,terrain};
  tiles.set(id, tile);
  if (tiles.size > 3) tiles.delete(tiles.keys().next().value!);
  return tile;
}
export async function loadBusPlan(service: BusService, geography: Geography, type: BusPlan["type"]): Promise<{ plan: BusPlan; tile: Tile }> {
  const [route,terrain] = await Promise.all([json<BusRouteData>(service.file, v => object(v) && object(v.service) && v.service.id === service.id && Array.isArray(v.points) && v.points.length >= 2 && v.points.every(coordinate) && (!v.drivingPoints || Array.isArray(v.drivingPoints) && v.drivingPoints.length >= 2 && v.drivingPoints.every(coordinate)) && validFeatures(v.features) && Array.isArray(v.stops) && v.stops.every(s => object(s) && typeof s.name === "string" && coordinate(s.coordinate))),loadTerrain(`corridor-${service.id}`)]);
  const stations = [service.from, service.to].map(id => geography.busStations.find(s => s.id === id)!);
  if (stations.some(s => !s) || route.points.length < 2) throw new Error("The bus corridor is unavailable.");
  const origin = stations[0].coordinate;
  const endpoints = await Promise.all([...new Set(stations.map(s => s.tile))].map(loadTile));
  const features = new Map<string, Tile["features"][number]>();
  for (const feature of [...endpoints.flatMap(t => t.features), ...route.features]) features.set(`${feature.type}:${feature.id}`, feature);
  const radius = Math.max(...route.points.map(p => { const q = toLocal(p, origin); return Math.max(Math.abs(q.x), Math.abs(q.z)); })) + 2200;
  return { plan: { route, stations, type }, tile: { id: `corridor-${service.id}`, origin, radius,
    source: "OpenStreetMap / OSRM derived road corridor", license: "ODbL-1.0", features: [...features.values()], terrain } };
}
export function placesInRegion(places: Place[], region: Region): Place[] {
  return places.filter(
    (p) =>
      p.district === region.id &&
      haversine([p.lon, p.lat], region.origin) < 1100,
  );
}
export const formatDistance = (metres: number) =>
  metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
