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
import { DestinationBrowser } from "./DestinationBrowser";
import { travelCapabilities } from "../game/travel";
import { DistrictMap } from "./Map";
export function WorldMapPanel({
  geography,
  currentRegion,
  currentArea,
  snapshot,
  onClose,
  onTravel,
  onNavigate, onTaxi, onReachable,
}: {
  geography: Geography;
  currentRegion?: Region;
  currentArea?: string;
  snapshot?: Snapshot;
  onClose: () => void;
  onTravel: (region: Region, place?: Place) => void;
  onNavigate?: (place: Place) => void;
  onTaxi?: (place: Place) => void;
  onReachable?: (place: Place) => boolean;
}) {
  const [routeMode,setRouteMode]=useState<"auto"|"road"|"rail"|"air">("auto");
  const [selectedRegion,setSelectedRegion]=useState(currentRegion??geography.regions.find(r=>r.id==='thrissur')!);
  const [place,setPlace]=useState<Place|null>(()=>geography.places.find(p=>p.tile===currentArea)??null);
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
  const caps=travelCapabilities(selected,district,currentRegion&&currentArea?{region:currentRegion,area:currentArea,snapshot,reachable:onReachable?.(selected)}:undefined);
  const dist = snapshot
    ? haversine([snapshot.lon, snapshot.lat], [selected.lon, selected.lat])
    : 0;
  const journeyMode = routeMode!=="auto" ? routeMode :
    selected.kind === "airport"
      ? "air"
      : selected.kind === "station"
        ? "rail"
        : "road";
  const fromLon=snapshot?.lon,fromLat=snapshot?.lat;
  const journey = useMemo(()=> fromLon!==undefined && fromLat!==undefined
    ? estimateJourney(
        [fromLon, fromLat],
        [selected.lon, selected.lat],
        journeyMode,
        geography.network,
      )
    : null,[fromLon,fromLat,selected.lon,selected.lat,journeyMode,geography.network]);
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
        <DestinationBrowser geography={geography} selectedId={selected.id} onSelect={p=>{setPlace(p);setSelectedRegion(geography.regions.find(r=>r.id===p.district)!);}}/>
        <div className="map-selection">
          <span className="eyebrow">NEXT STOP</span>
          <h3>{selected.name}</h3>
          <label>Route by <select aria-label="Route transport mode" value={routeMode} onChange={e=>setRouteMode(e.target.value as typeof routeMode)}>
            <option value="auto">Suggested mode</option><option value="road">Road</option><option value="rail">Rail</option><option value="air">Air transfer</option>
          </select></label>
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
          <p className="travel-coverage">{caps.covered?'Playable destination':'Map location only'}{caps.reason?` · ${caps.reason}`:''}</p>
          <div className="travel-options">
            {onNavigate&&<button disabled={!caps.gps} onClick={()=>{onNavigate(selected);onClose();}}>Set GPS</button>}
            <button disabled={!caps.quickTravel} onClick={()=>onTravel(district,selected)}>{currentRegion?'Quick travel':'Start here'}</button>
            {onTaxi&&<button disabled={!caps.taxi} onClick={()=>onTaxi(selected)}>Request taxi</button>}
          </div>
          <p className="fine-note">Quick travel changes scenes. Full bus journeys depart from supported bus stands. Gold follows imported route geometry; dashed access links are approximate.</p>
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
          route={journey?.path}
          access={journey?.access}
          destination={selected}
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
