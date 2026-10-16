import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  closestDistrictBoundary,
  districtAt,
  haversine,
} from "../src/data/geography";
import type { DistrictCollection, Place, Region, Tile } from "../src/types";
const read = <T>(name: string) =>
  JSON.parse(readFileSync(`public/data/${name}`, "utf8")) as T;
const boundaries = read<DistrictCollection>("districts.geojson"),
  regions = read<Region[]>("regions.json");
const raw = read<Place[]>("places-raw.json");
const edgeCases: unknown[] = [];
function validatedDistrict(lon: number, lat: number, expected?: string) {
  const inside = districtAt([lon, lat], boundaries);
  if (inside) return inside;
  const nearest = closestDistrictBoundary([lon, lat], boundaries);
  if (expected && nearest.id === expected && nearest.metres <= 250) {
    edgeCases.push({
      lon,
      lat,
      district: nearest.id,
      boundaryDistance: Math.round(nearest.metres),
      reason:
        "Known coastal landmark within 250m of generalized boundary; source coordinate retained.",
    });
    return nearest.id;
  }
}
const places: Place[] = [];
const excluded: unknown[] = [];
for (const place of raw) {
  const district = validatedDistrict(place.lon, place.lat);
  if (district) {
    if (place.kind === "station" && ["idukki", "wayanad"].includes(district)) {
      excluded.push({
        name: place.name,
        reason:
          "No operational railway station in district; source may describe proposed or disused infrastructure.",
      });
      continue;
    }
    places.push({ ...place, id: `osm-${place.id}`, district });
  }
}
const localKinds = (t: Record<string, string>) =>
  t.railway === "station"
    ? "station"
    : t.highway === "bus_stop"
      ? "bus_stop"
      : t.amenity === "bus_station"
        ? "bus_stop"
        : t.tourism
          ? "attraction"
          : (t.place ?? "");
for (const region of regions) {
  const actual = validatedDistrict(region.lon, region.lat, region.id);
  if (actual !== region.id)
    throw new Error(
      `Landmark ${region.landmark} is in ${actual}, expected ${region.id}`,
    );
  if (region.verification.includes("unverified"))
    throw new Error(`Unverified landmark: ${region.landmark}`);
  places.push({
    id: `landmark-${region.id}`,
    name: region.landmark,
    lat: region.lat,
    lon: region.lon,
    district: region.id,
    kind: "landmark",
    source: region.source,
    playable: true,
  });
  const tile = read<Tile>(`${region.id}.json`);
  for (const f of tile.features) {
    const t = f.tags,
      name = t["name:en"] ?? t.name,
      kind = localKinds(t);
    if (!name || !kind || !f.points.length) continue;
    const point = f.points[Math.floor(f.points.length / 2)],
      district = validatedDistrict(point[0], point[1]);
    if (district !== region.id) continue;
    const id = `osm-${f.id}`;
    if (places.some((p) => p.id === id)) continue;
    places.push({
      id,
      name,
      lat: point[1],
      lon: point[0],
      district,
      kind,
      source: `https://www.openstreetmap.org/${f.type}/${f.id}`,
    });
  }
}
for (const p of places) {
  const region = regions.find((r) => r.id === p.district)!;
  p.playable = haversine([p.lon, p.lat], region.origin) < 1100;
}
const extras = existsSync("public/data/extra-areas.json")
  ? read<Place[]>("extra-areas.json")
  : [];
for (const extra of extras) {
  const actual = validatedDistrict(extra.lon, extra.lat, extra.district);
  if (actual !== extra.district)
    throw new Error(
      `Extra area ${extra.name} is in ${actual}, expected ${extra.district}`,
    );
  if (!extra.tile || !existsSync(`public/data/${extra.tile}.json`))
    throw new Error(`Missing playable extract: ${extra.tile}`);
  extra.verification = "source-and-district-checked";
  extra.asset = "original-procedural-exterior";
  extra.approximation =
    "Artist interpretation; source roads and footprints retain horizontal coordinates. Not a surveyed or photogrammetric reconstruction.";
  const existing = places.findIndex((p) => p.id === extra.id);
  if (existing >= 0)
    places[existing] = { ...places[existing], ...extra, playable: true };
  else places.push({ ...extra, playable: true });
}
const airports = places.filter(
  (p) =>
    p.kind === "airport" && ["TRV", "COK", "CCJ", "CNN"].includes(p.iata ?? ""),
);
for (const [iata, district] of Object.entries({
  TRV: "thiruvananthapuram",
  COK: "ernakulam",
  CCJ: "malappuram",
  CNN: "kannur",
})) {
  const airport = airports.find((p) => p.iata === iata);
  if (!airport) throw new Error(`Missing airport ${iata}`);
  if (airport.district !== district)
    throw new Error(`${iata} in ${airport.district}, expected ${district}`);
}
const report = {
  generatedAt: new Date().toISOString(),
  boundaryEdgeCases: edgeCases,
  districts: regions.length,
  landmarks: regions.map((r) => ({
    name: r.landmark,
    district: r.id,
    lat: r.lat,
    lon: r.lon,
    source: r.source,
    status: r.verification,
  })),
  totalPlaces: places.length,
  airports,
  stations: places.filter((p) => p.kind === "station").length,
  excluded,
  coverage: regions.map((r) => {
    const tile = read<Tile>(`${r.id}.json`);
    return {
      district: r.id,
      roads: tile.features.filter((f) => f.tags.highway).length,
      buildings: tile.features.filter((f) => f.tags.building).length,
      features: tile.features.length,
    };
  }),
};
writeFileSync("public/data/places.json", JSON.stringify(places));
writeFileSync("public/data/extra-areas.json", JSON.stringify(extras, null, 2));
writeFileSync(
  "public/data/validation-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...report,
      boundaryEdgeCases: edgeCases.length,
      landmarks: report.landmarks.length,
      airports: airports.map((p) => ({ iata: p.iata, district: p.district })),
      excluded: excluded.length,
    },
    null,
    2,
  ),
);
