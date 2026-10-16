import type {
  DistrictCollection,
  StateNetwork,
  Geography,
  LonLat,
  Place,
  Region,
  Tile,
  Vec2,
} from "../types";
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
async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Could not load ${url} (${response.status}). Please retry.`,
    );
  return response.json();
}
let geographyPromise: Promise<Geography> | undefined;
export function loadGeography(): Promise<Geography> {
  return (geographyPromise ??= Promise.all([
    json<Region[]>("/data/regions.json"),
    json<Place[]>("/data/places.json"),
    json<DistrictCollection>("/data/districts.geojson"),
    json<StateNetwork>("/data/state-network.json"),
  ])
    .then(([regions, places, boundaries, network]) => {
      const geo = { regions, places, boundaries, network };
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
export async function loadTile(id: string): Promise<Tile> {
  if (tiles.has(id)) return tiles.get(id)!;
  const tile = await json<Tile>(`/data/${id}.json`);
  tiles.set(id, tile);
  if (tiles.size > 3) tiles.delete(tiles.keys().next().value!);
  return tile;
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
