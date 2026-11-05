import { ArrowLeft, ArrowRight, Check, MapPin, Search } from "lucide-react";
import type { Geography, Place, Region } from "../types";
import { placesInRegion } from "../data/geography";
import { DistrictMap } from "./Map";

export function LocationSetup({
  geography,
  district,
  selectedRegion,
  startPlace,
  locationQuery,
  ml,
  onDistrictChange,
  onLocationQueryChange,
  onPlaceChange,
  onBack,
  onStart,
}: {
  geography: Geography;
  district: string;
  selectedRegion: Region;
  startPlace: Place | null;
  locationQuery: string;
  ml: boolean;
  onDistrictChange: (id: string) => void;
  onLocationQueryChange: (query: string) => void;
  onPlaceChange: (place: Place | null) => void;
  onBack: () => void;
  onStart: (place?: Place) => void;
}) {
  const localStarts = [
    {
      id: `landmark-${district}`,
      name: selectedRegion.landmark,
      lat: selectedRegion.lat,
      lon: selectedRegion.lon,
      district,
      kind: "landmark" as const,
      source: selectedRegion.source,
    },
    ...geography.places.filter(
      (place) => place.district === selectedRegion.id && place.tile,
    ),
    ...placesInRegion(geography.places, selectedRegion).filter(
      (place) => place.kind !== "landmark" && !place.tile,
    ),
  ].filter((place) =>
    place.name.toLowerCase().includes(locationQuery.toLowerCase()),
  ).slice(0, 12);

  const activePlace = startPlace ?? localStarts[0];
  const hasExplicitPlace = Boolean(startPlace);

  const changeDistrict = (id: string) => {
    onDistrictChange(id);
    onPlaceChange(null);
    onLocationQueryChange("");
  };

  return (
    <main className="setup-screen location-screen">
      <section className="setup-form setup-rail">
        <button className="text-button back-link" onClick={onBack}>
          <ArrowLeft size={16} /> Back to character
        </button>
        <div className="step-label" aria-label="Setup progress">
          <span className="step-complete">01</span>
          <span className="muted">YOUR CHARACTER</span>
          <i />
          <span className="step-current">02</span>
          <span>YOUR STARTING POINT</span>
        </div>
        <div className="setup-heading">
          <span className="eyebrow">CHOOSE YOUR FIRST HORIZON</span>
          <h1>
            Where will your
            <br />
            story begin?
          </h1>
          <p className="lead">
            Choose a district, then pick the first place you want to see.
            <br />
            The road opens from there.
          </p>
        </div>

        <div className="location-brief" aria-live="polite">
          <div className="location-brief-top">
            <span className="eyebrow">SELECTED DISTRICT</span>
            <span className="location-brief-index">{selectedRegion.name}</span>
          </div>
          <h2>{selectedRegion.town}</h2>
          <p>{selectedRegion.description}</p>
          <div className="location-brief-meta">
            <span>{selectedRegion.biome}</span>
            <span>{selectedRegion.lat.toFixed(3)}° N · {selectedRegion.lon.toFixed(3)}° E</span>
          </div>
        </div>

        <label className="field-label" htmlFor="district">
          YOUR STARTING DISTRICT
        </label>
        <div className="district-select">
          <MapPin size={19} aria-hidden="true" />
          <select
            id="district"
            aria-label="Starting district"
            value={district}
            onChange={(event) => changeDistrict(event.target.value)}
          >
            {geography.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        <div className="starting-point-heading">
          <div>
            <span className="field-label">FIRST STOP</span>
            <p>{hasExplicitPlace ? "Selected arrival" : "Suggested arrival"}</p>
          </div>
          <span className="starting-point-count">{localStarts.length} nearby</span>
        </div>
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search starting locations"
            value={locationQuery}
            onChange={(event) => onLocationQueryChange(event.target.value)}
            placeholder="Find a starting location…"
          />
        </label>
        <div className="starting-list" aria-label="Starting locations">
          {localStarts.length ? (
            localStarts.map((place, index) => {
              const active = activePlace?.id === place.id;
              return (
                <button
                  className={active ? "active" : ""}
                  key={place.id}
                  aria-pressed={active}
                  onClick={() => onPlaceChange(place)}
                >
                  <span className="starting-place-icon"><MapPin size={16} aria-hidden="true" /></span>
                  <span className="starting-place-copy">
                    <strong>{place.name}</strong>
                    <small>
                      {place.kind === "landmark"
                        ? index === 0 && !locationQuery
                          ? "LANDMARK ARRIVAL · SUGGESTED"
                          : "LANDMARK ARRIVAL"
                        : place.kind.replaceAll("_", " ")}
                    </small>
                  </span>
                  <span className="radio-ring" aria-hidden="true">
                    {active ? <Check size={12} /> : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="empty-state">No starting points match. Try the landmark name.</p>
          )}
        </div>
        <button className="primary wide setup-cta" onClick={() => onStart(startPlace ?? undefined)}>
          {ml ? "കളി തുടങ്ങാം" : "Start game"}
          <ArrowRight size={19} />
        </button>
        <p className="selection-note">
          <Check size={12} /> Real local roads. Original scenery. A journey of your own.
        </p>
      </section>
      <section className="location-map-stage" aria-label="Kerala district map">
        <div className="stage-title">
          <div>
            <span className="eyebrow">THE STATE IS YOURS TO DISCOVER</span>
            <strong>Choose your first district</strong>
          </div>
          <span className="pill">14 DISTRICTS</span>
        </div>
        <DistrictMap
          boundaries={geography.boundaries}
          regions={geography.regions}
          selected={district}
          onSelect={changeDistrict}
        />
        <div className="map-stage-legend" aria-hidden="true">
          <span><i className="legend-swatch selected" /> Selected district</span>
          <span><i className="legend-swatch" /> Other districts</span>
        </div>
        <div className="location-map-caption">
          <span className="status-dot" />
          <strong>{selectedRegion.name}</strong>
          <span>{selectedRegion.lat.toFixed(4)}° N, {selectedRegion.lon.toFixed(4)}° E</span>
        </div>
      </section>
    </main>
  );
}
