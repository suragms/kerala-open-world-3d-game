import { useMemo, useRef, useEffect } from "react";
import { Navigation, Compass, MapPin } from "lucide-react";
import type {
  DistrictCollection,
  Region,
  Snapshot,
  Tile,
  StateNetwork,
  Place,
  LonLat,
} from "../types";
import { toLocal } from "../data/geography";

export function DistrictMap({
  boundaries,
  regions,
  selected,
  onSelect,
  current,
  network,
  destination,
  places,
  route,
  access,
}: {
  boundaries: DistrictCollection;
  regions: Region[];
  selected?: string;
  onSelect?: (id: string) => void;
  current?: { lat: number; lon: number };
  network?: StateNetwork;
  destination?: { lat: number; lon: number; name: string };
  places?: Place[];
  route?: LonLat[];
  access?: [LonLat,LonLat][];
}) {
  const project = (lon: number, lat: number) => [
    (lon - 74.8) * 158 + 118,
    (12.86 - lat) * 160 + 30,
  ];
  const paths = useMemo(
    () =>
      boundaries.features.map((f) => {
        const polygons =
          f.geometry.type === "Polygon"
            ? [f.geometry.coordinates as number[][][]]
            : (f.geometry.coordinates as number[][][][]);
        return {
          id: f.properties.id,
          name: f.properties.shapeName,
          d: polygons
            .map((rings) =>
              rings
                .map(
                  (r) =>
                    r
                      .map(
                        (p, i) =>
                          `${i ? "L" : "M"}${project(p[0], p[1])
                            .map((v) => v.toFixed(1))
                            .join(",")}`,
                      )
                      .join("") + "Z",
                )
                .join(""),
            )
            .join(""),
        };
      }),
    [boundaries],
  );
  const [x, y] = current ? project(current.lon, current.lat) : [0, 0];
  const networkPaths = useMemo(
    () =>
      ["road", "rail"].map((kind) => ({
        kind,
        d:
          network?.features
            .filter((f) => f.kind === kind)
            .map((f) =>
              f.points
                .map(
                  (p, i) =>
                    `${i ? "L" : "M"}${project(p[0], p[1])
                      .map((v) => v.toFixed(1))
                      .join(",")}`,
                )
                .join(""),
            )
            .join("") ?? "",
      })),
    [network],
  );
  return (
    <div className="district-map">
      <svg
        viewBox="0 0 700 850"
        role="img"
        aria-label="Geographic Kerala map with fourteen district boundaries"
      >
        <defs>
          <pattern
            id="mapgrid"
            width="55"
            height="55"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M55 0H0V55"
              fill="none"
              stroke="currentColor"
              strokeWidth=".5"
              opacity=".12"
            />
          </pattern>
          <filter id="mapshadow">
            <feDropShadow
              dx="0"
              dy="12"
              stdDeviation="15"
              floodColor="#244e3b"
              floodOpacity=".14"
            />
          </filter>
          <clipPath id="kerala-network-clip">
            {paths.map((p) => (
              <path key={p.id} d={p.d} fillRule="evenodd" />
            ))}
          </clipPath>
        </defs>
        <rect width="700" height="850" fill="url(#mapgrid)" />
        <text
          x="130"
          y="490"
          className="ocean-label"
          transform="rotate(-55 130 490)"
        >
          A R A B I A N S E A
        </text>
        <g filter="url(#mapshadow)">
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              className={`district-shape ${selected === p.id ? "selected" : ""}`}
              fillRule="evenodd"
              onClick={() => onSelect?.(p.id)}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? "button" : undefined}
              aria-label={`Select ${p.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect?.(p.id);
              }}
            >
              <title>{p.name}</title>
            </path>
          ))}
        </g>
        <g
          clipPath="url(#kerala-network-clip)"
          fill="none"
          pointerEvents="none"
        >
          {networkPaths.map((p) => (
            <path
              key={p.kind}
              d={p.d}
              stroke={p.kind === "road" ? "#858c67" : "#a08b6f"}
              strokeWidth={p.kind === "road" ? 0.65 : 0.5}
              strokeDasharray={p.kind === "rail" ? "2 1" : undefined}
              opacity=".65"
            />
          ))}
        </g>
        {/* Tourist landmark dots — playable tiles only */}
        {places
          ?.filter((p) => p.kind === "landmark" && p.tile)
          .map((p) => {
            const [px, py] = project(p.lon, p.lat);
            return (
              <g
                key={p.id}
                transform={`translate(${px},${py})`}
                pointerEvents="none"
              >
                <circle r="3.5" fill="#b89854" opacity=".75" />
                <title>{p.name}</title>
              </g>
            );
          })}
        {/* Airport markers */}
        {places
          ?.filter((p) => p.kind === "airport")
          .map((p) => {
            const [px, py] = project(p.lon, p.lat);
            return (
              <g
                key={p.id}
                transform={`translate(${px},${py})`}
                pointerEvents="none"
              >
                <circle
                  r="6"
                  fill="#e9ebd9"
                  stroke="#78907a"
                  strokeWidth=".6"
                />
                <path
                  d="M-4 0L4-1M0-4L0 4M-2 3L2 3"
                  stroke="#476b5d"
                  strokeWidth="1"
                />
                <title>{p.name}</title>
              </g>
            );
          })}
        {regions.map((r) => {
          const [mx, my] = project(r.lon, r.lat);
          return (
            <g
              key={r.id}
              onClick={() => onSelect?.(r.id)}
              className={`map-label ${selected === r.id ? "selected" : ""}`}
            >
              <circle cx={mx} cy={my} r={selected === r.id ? 6 : 3.5} />
              <text
                x={mx + (r.id === "kottayam" ? 14 : 12)}
                y={my + (r.id === "alappuzha" ? 15 : 4)}
              >
                {r.name}
              </text>
              {selected === r.id ? (
                <circle cx={mx} cy={my} r="12" fill="none" strokeWidth="1" />
              ) : null}
            </g>
          );
        })}
        {route?.length ? <polyline data-testid="network-route" points={route.map(p=>project(...p).join(",")).join(" ")} fill="none" stroke="#b89854" strokeWidth="2.4" pointerEvents="none"><title>Imported network route</title></polyline>:null}
        {access?.map(([a,b],i)=><polyline key={i} points={[a,b].map(p=>project(...p).join(",")).join(" ")} fill="none" stroke="#b89854" strokeWidth="1.4" strokeDasharray="4 3" pointerEvents="none"><title>Approximate endpoint access</title></polyline>)}
        {/* Player position dot with pulse animation */}
        {current ? (
          <g transform={`translate(${x},${y})`} className="player-map-marker">
            <circle r="13" opacity=".18" />
            <circle
              r="9"
              fill="none"
              stroke="#4a9e7f"
              strokeWidth="1.2"
              className="player-pulse"
            />
            <circle r="5" fill="#4a9e7f" stroke="#fff" strokeWidth="1.8" />
          </g>
        ) : null}
        {destination ? (
          <g
            transform={`translate(${project(destination.lon, destination.lat).join(",")})`}
            pointerEvents="none"
          >
            <circle r="11" fill="#c18b52" opacity=".2" />
            <circle r="4" fill="#b37d44" stroke="#fff4d6" strokeWidth="1.3" />
            <title>{destination.name}</title>
          </g>
        ) : null}
        <g transform="translate(615,70)">
          <path d="M0-20L-6 4 0 0 6 4Z" fill="#315447" />
          <text x="0" y="23" textAnchor="middle" fontSize="12" fill="#315447">
            N
          </text>
        </g>
        <path d="M78 773H150M78 768V778M150 768V778" stroke="#66806d" />
        <text x="114" y="797" textAnchor="middle" fontSize="11" fill="#66806d">
          ≈ 50 km
        </text>
        <text x="600" y="804" textAnchor="end" className="map-note">
          8° N — 13° N · 75° E — 78° E
        </text>
      </svg>
    </div>
  );
}
export function Minimap({
  tile,
  snapshot,
  region,
  onOpen,
}: {
  tile: Tile;
  snapshot: Snapshot;
  region: Region;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const size = 220,
      scale = 0.65;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#e0ddc6";
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const p = snapshot.position;
    for (const f of tile.features) {
      const t = f.tags;
      if (!t.highway && !t.waterway && t.natural !== "water" && !t.railway)
        continue;
      const points = f.points.map((v) => toLocal(v, tile.origin));
      if (
        !points.some(
          (q) => Math.abs(q.x - p.x) < 250 && Math.abs(q.z - p.z) < 250,
        )
      )
        continue;
      ctx.beginPath();
      points.forEach((q, i) => {
        const x = (q.x - p.x) * scale,
          y = (q.z - p.z) * scale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = t.highway
        ? "#a9aa96"
        : t.railway
          ? "#8a7668"
          : "#80a79b";
      ctx.lineWidth = t.highway ? 4 : t.railway ? 1 : 8;
      ctx.stroke();
    }
    if (snapshot.path.length) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      snapshot.path.forEach((q) =>
        ctx.lineTo((q.x - p.x) * scale, (q.z - p.z) * scale),
      );
      ctx.strokeStyle = "#b88935";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const landmark = toLocal([region.lon, region.lat], tile.origin);
    ctx.fillStyle = "#a48644";
    ctx.beginPath();
    ctx.arc(
      (landmark.x - p.x) * scale,
      (landmark.z - p.z) * scale,
      4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (snapshot.destination) {
      ctx.fillStyle = "#b5693e";
      ctx.beginPath();
      ctx.arc(
        (snapshot.destination.x - p.x) * scale,
        (snapshot.destination.z - p.z) * scale,
        5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.rotate(snapshot.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fillStyle = "#214d40";
    ctx.fill();
    ctx.strokeStyle = "#fffce8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }, [tile, snapshot, region]);
  return (
    <button className="minimap" onClick={onOpen} aria-label="Open world map">
      <canvas ref={ref} width="220" height="220" />
      <span className="mini-north">N</span>
      <span className="mini-caption">
        <Compass size={13} />
        <span>{snapshot.locality ?? region.town}</span>
        <kbd>M</kbd>
      </span>
    </button>
  );
}
