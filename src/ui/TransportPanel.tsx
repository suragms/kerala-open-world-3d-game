import { useState } from "react";
import {
  X,
  Plane,
  TrainFront,
  BusFront,
  ArrowRight,
  MapPin,
} from "lucide-react";
import type { Geography, Place, Region } from "../types";
export function TransportPanel({
  geography,
  region,
  onTravel,
  onClose,
}: {
  geography: Geography;
  region: Region;
  onTravel: (r: Region, p?: Place) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"bus" | "rail" | "air">(
    region.theme === "airport"
      ? "air"
      : region.theme === "station"
        ? "rail"
        : "bus",
  );
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
        <div className="transport-destinations">
          {destinations.map((d) => {
            const destReg = geography.regions.find((r) => r.id === d.district);
            const flightNum = `KW${((d.name.charCodeAt(0) * 31 + (destReg?.name.charCodeAt(0) ?? 0)) % 900) + 100}`;
            const subtitle =
              mode === "air"
                ? `${flightNum} · ${region.town} → ${d.name}`
                : mode === "rail"
                  ? `${region.town} → ${d.name} · Rail`
                  : `${destReg?.name ?? ""} District`;
            const pillText =
              mode === "air"
                ? flightNum
                : mode === "rail"
                  ? "TRAIN"
                  : "BUS";
            return (
              <button
                key={d.id}
                onClick={() => onTravel(destReg!, d.place)}
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
