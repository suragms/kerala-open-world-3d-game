import { useMemo, useState } from "react";
import {
  X,
  Search,
  MapPin,
  ArrowRight,
  Navigation,
  Plane,
  TrainFront,
  BusFront,
  TreePalm,
  ExternalLink,
} from "lucide-react";
import type { Geography, Place, Region, Snapshot } from "../types";
import { formatDistance, haversine, placesInRegion } from "../data/geography";
import { estimateJourney } from "../game/navigation";
import { DistrictMap } from "./Map";
export function WorldMapPanel({
  geography,
  currentRegion,
  currentArea,
  snapshot,
  onClose,
  onTravel,
  onNavigate,
}: {
  geography: Geography;
  currentRegion?: Region;
  currentArea?: string;
  snapshot?: Snapshot;
  onClose: () => void;
  onTravel: (region: Region, place?: Place) => void;
  onNavigate?: (place: Place) => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [selectedRegion, setSelectedRegion] = useState(
      currentRegion ?? geography.regions.find((r) => r.id === "thrissur")!,
    ),
    [place, setPlace] = useState<Place | null>(
      () => geography.places.find((p) => p.tile === currentArea) ?? null,
    );
  const results = useMemo(
    () =>
      geography.places
        .filter(
          (p) =>
            (category === "all" || p.kind === category) &&
            (!query ||
              `${p.name} ${p.localName ?? ""} ${p.district} ${p.iata ?? ""}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        )
        .sort(
          (a, b) =>
            Number(b.kind === "landmark") - Number(a.kind === "landmark"),
        )
        .slice(0, 35),
    [geography, query, category],
  );
  const selected = place ?? {
    name: selectedRegion.landmark,
    district: selectedRegion.id,
    lat: selectedRegion.lat,
    lon: selectedRegion.lon,
    source: selectedRegion.source,
    kind: "landmark",
    id: `landmark-${selectedRegion.id}`,
  };
  const district =
    geography.regions.find((r) => r.id === selected.district) ?? selectedRegion;
  const local =
    (!("tile" in selected && selected.tile) || selected.tile === currentArea) &&
    currentRegion?.id === district.id &&
    haversine([selected.lon, selected.lat], currentRegion.origin) < 1100;
  const covered =
    ("tile" in selected && Boolean(selected.tile)) ||
    haversine([selected.lon, selected.lat], district.origin) < 1100;
  const dist = snapshot
    ? haversine([snapshot.lon, snapshot.lat], [selected.lon, selected.lat])
    : 0;
  const journeyMode =
    selected.kind === "airport"
      ? "air"
      : selected.kind === "station"
        ? "rail"
        : "road";
  const journey = snapshot
    ? estimateJourney(
        [snapshot.lon, snapshot.lat],
        [selected.lon, selected.lat],
        journeyMode,
        geography.network,
      )
    : null;
  return (
    <div
      className="map-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-title"
    >
      <div className="map-sidebar">
        <div className="modal-top">
          <div>
            <span className="eyebrow">TAKE THE SCENIC ROUTE</span>
            <h2 id="map-title">Your Kerala.</h2>
          </div>
          <button
            className="icon-button mobile-close"
            aria-label="Close map"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search places"
            placeholder="A town, landmark or a little detour…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </label>
        <div className="map-filters">
          {(
            [
              ["all", "All places", MapPin],
              ["landmark", "Landmarks", TreePalm],
              ["station", "Rail", TrainFront],
              ["airport", "Airports", Plane],
              ["bus_stop", "Bus stops", BusFront],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={category === id ? "active" : ""}
              onClick={() => setCategory(id)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        <div className="search-results" aria-label="Place search results">
          {results.length ? (
            results.map((p) => (
              <button
                className={`place-result ${place?.id === p.id ? "active" : ""}`}
                key={p.id}
                onClick={() => {
                  setPlace(p);
                  setSelectedRegion(
                    geography.regions.find((r) => r.id === p.district)!,
                  );
                }}
              >
                <span className="place-icon">
                  {p.kind === "airport" ? (
                    <Plane size={17} />
                  ) : p.kind === "station" ? (
                    <TrainFront size={17} />
                  ) : (
                    <MapPin size={17} />
                  )}
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {geography.regions.find((r) => r.id === p.district)?.name} ·{" "}
                    {p.kind.replaceAll("_", " ")}
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))
          ) : (
            <p className="empty-state">
              No places found. Try a district name or “airport”.
            </p>
          )}
        </div>
        <div className="map-selection">
          <span className="eyebrow">NEXT STOP</span>
          <h3>{selected.name}</h3>
          <p>
            {district.name}{" "}
            {journey ? `· ${journey.label}` : dist ? `· ${formatDistance(dist)} straight-line` : ""}
          </p>
          <div className="place-coordinates">
            {selected.lat.toFixed(5)}° N &nbsp; {selected.lon.toFixed(5)}° E{" "}
            <a
              href={selected.source}
              target="_blank"
              rel="noreferrer"
              aria-label="View geographic source"
            >
              <ExternalLink size={12} />
            </a>
          </div>
          {local && onNavigate ? (
            <button
              className="primary wide"
              onClick={() => {
                onNavigate(selected);
                onClose();
              }}
            >
              <Navigation size={16} /> Set destination <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="primary wide"
              onClick={() => onTravel(district, covered ? selected : undefined)}
            >
              {covered
                ? "Explore this location"
                : `Explore ${district.town} area`}
              <ArrowRight size={16} />
            </button>
          )}
          {!covered ? (
            <p className="fine-note">
              This place is mapped. Its detailed scene is not built yet; travel
              takes you to the {district.landmark} area.
            </p>
          ) : (
            <p className="fine-note">
              Local roads use OpenStreetMap. Long journeys use instant district
              travel.
            </p>
          )}
        </div>
      </div>
      <div className="map-canvas">
        <div className="map-canvas-top">
          <span>
            <i className="status-dot" /> 14 DISTRICTS · ONE EXTRAORDINARY STATE
          </span>
          <button
            className="icon-button"
            aria-label="Close world map"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <DistrictMap
          network={geography.network}
          destination={place ?? undefined}
          places={geography.places}
          boundaries={geography.boundaries}
          regions={geography.regions}
          selected={selectedRegion.id}
          onSelect={(id) => {
            setSelectedRegion(geography.regions.find((r) => r.id === id)!);
            setPlace(null);
          }}
          current={
            snapshot ? { lat: snapshot.lat, lon: snapshot.lon } : undefined
          }
        />
        <div className="map-legend">
          <span>
            <i className="legend-dot green" /> District arrival area
          </span>
          <span>
            <i className="legend-dot gold" /> Selected destination
          </span>
          <span>
            <i className="legend-dot amber" /> Tourist landmark
          </span>
          <span>── National Highway</span>
          <span>╌╌ Railway line</span>
          <span>Click a district to explore</span>
        </div>
        <div className="map-attribution">
          Boundaries: geoBoundaries / Pathways Data (2021) ·{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
        </div>
      </div>
    </div>
  );
}
