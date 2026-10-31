import { useState } from "react";
import {
  X,
  Plane,
  TrainFront,
  BusFront,
  ArrowRight,
  MapPin,
} from "lucide-react";
import type { Geography, Place, Region, BusService, BusType, Snapshot } from "../types";
import { haversine, formatDistance } from "../data/geography";
export function TransportPanel({
  geography,
  region,
  onTravel,
  onClose,
  onBook,
  onWalkToStation,
  snapshot,
}: {
  geography: Geography;
  region: Region;
  onTravel: (r: Region, p?: Place, mode?: "bus" | "rail" | "air") => void;
  onClose: () => void;
  onBook: (service: BusService, type: BusType) => void;
  onWalkToStation: (id: string) => void;
  snapshot?: Snapshot;
}) {
  const [mode, setMode] = useState<"bus" | "rail" | "air">(
    region.theme === "airport"
      ? "air"
      : region.theme === "station"
        ? "rail"
        : "bus",
  );
  const [busType, setBusType] = useState<BusType>("public");
  const [destinationDistrict, setDestinationDistrict] = useState("all");
  const services = geography.busRoutes.filter(r => {
    const from = geography.busStations.find(s => s.id === r.from), to = geography.busStations.find(s => s.id === r.to);
    return from?.district === (snapshot?.district ?? region.id) && (destinationDistrict === "all" || to?.district === destinationDistrict);
  });
  const destinations =
    mode === "bus"
      ? geography.regions.map((r) => ({
          id: r.id,
          name: r.town,
          district: r.id,
          place: undefined as Place | undefined,
        }))
      : geography.places
          .filter(
            (p) =>
              p.tile && p.kind === (mode === "air" ? "airport" : "station"),
          )
          .map((p) => ({
            id: p.tile!,
            name: p.name,
            district: p.district,
            place: p,
          }));
  return (
    <div className="modal-shade">
      <section
        className="modal transport-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transport-title"
      >
        <div className="modal-top">
          <div>
            <span className="eyebrow">THE NEXT CHAPTER IS A JOURNEY AWAY</span>
            <h2 id="transport-title">Let’s go somewhere.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close travel"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="tabs">
          {(
            [
              ["bus", "District bus", BusFront],
              ["rail", "Railway", TrainFront],
              ["air", "Airport", Plane],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={mode === id ? "active" : ""}
              onClick={() => setMode(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div className="transport-origin">
          <MapPin size={16} />
          <span>
            Departing from <strong>{region.town}</strong>
          </span>
        </div>
        <p className="fine-note">
          Simplified game service · choose your arrival. Travel skips the
          journey between local scenes. These are fictional services, with no
          live schedules or ticket purchases.
        </p>
        {mode === "bus" ? <div className="bus-services">
          <h3>Take a passenger bus</h3>
          <p>Walk to the departure station, wait for the arriving bus, board at its door and choose a seat.</p>
          <div className="bus-service-filters">
            <label>Destination district<select aria-label="Bus destination district" value={destinationDistrict} onChange={e => setDestinationDistrict(e.target.value)}><option value="all">All connected districts</option>{geography.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label>Bus type<select aria-label="Bus type" value={busType} onChange={e => setBusType(e.target.value as BusType)}><option value="public">Kerala public bus</option><option value="private">Private local bus</option><option value="fast">Fast passenger</option><option value="coach">Air-conditioned coach</option><option value="mini">Mini bus</option></select></label>
          </div>
          {services.map(service => {
            const from = geography.busStations.find(s => s.id === service.from)!, to = geography.busStations.find(s => s.id === service.to)!;
            const metres = snapshot ? haversine([snapshot.lon, snapshot.lat], from.coordinate) : Infinity;
            return <article className="bus-service" key={service.id}>
              <strong>{from.name} → {to.name}</strong>
              <p>{formatDistance(service.distance)} · connected OSM road corridor · simulated in-game service</p>
              <small>Original terminal model · fidelity C · live timetable unavailable</small>
              <div className="bus-buttons"><button onClick={() => onWalkToStation(from.id)}>Walk to departure station{Number.isFinite(metres) ? ` · ${formatDistance(metres)}` : ""}</button><button className="primary" onClick={() => onBook(service, busType)} disabled={snapshot?.driving || Boolean(snapshot?.bus && snapshot.bus.phase !== "exited")}>Wait for this bus</button></div>
              <a href={from.source} target="_blank" rel="noreferrer">Station location source</a>
            </article>;
          })}
          {!services.length ? <p>No full bus corridor is imported for this departure and destination. The map and fast scene travel remain available.</p> : null}
          <p className="fine-note">Road connections are from the OSM-derived driving profile. Bus access restrictions, terrain elevations and current operating services have not been independently surveyed. Routes and departures are game simulations.</p>
          <h3>Fast travel between local scenes</h3>
        </div> : null}
        <div className="transport-destinations">
          {destinations.map((d) => {
            const destReg = geography.regions.find((r) => r.id === d.district);
            const subtitle =
              mode === "air"
                ? `Simulated transfer · ${region.town} → ${d.name}`
                : mode === "rail"
                  ? `${region.town} → ${d.name} · Rail`
                  : `${destReg?.name ?? ""} District`;
            const pillText =
              mode === "air"
                ? "AIR"
                : mode === "rail"
                  ? "TRAIN"
                  : "BUS";
            return (
              <button
                key={d.id}
                onClick={() => onTravel(destReg!, d.place, mode)}
              >
                <span className="place-icon">
                  {mode === "air" ? (
                    <Plane size={17} />
                  ) : mode === "rail" ? (
                    <TrainFront size={17} />
                  ) : (
                    <BusFront size={17} />
                  )}
                </span>
                <span>
                  <strong>{d.name}</strong>
                  <small>{subtitle}</small>
                </span>
                <span className="pill">{pillText}</span>
                <ArrowRight size={15} />
              </button>
            );
          })}
        </div>
        {mode === "rail" ? (
          <p className="fine-note">
            Only imported station areas are offered. No railway stations are
            created in Idukki or Wayanad; use the district bus service to reach
            their road-connected arrival areas.
          </p>
        ) : null}
      </section>
    </div>
  );
}
