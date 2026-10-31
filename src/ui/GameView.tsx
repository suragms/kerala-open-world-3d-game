import { useEffect, useRef, useState } from "react";
import {
  Map,
  Settings2,
  Pause,
  Save,
  Sun,
  CloudRain,
  Moon,
  Navigation,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerUpRight,
  Footprints,
  MapPin,
  Trophy,
  Compass,
  Mouse,
  CarFront,
  BusFront,
} from "lucide-react";
import type {
  AvatarStyle,
  Region,
  SaveData,
  Settings,
  Snapshot,
  Tile,
  BusPlan,
  BusStation,
  DistrictCollection,
} from "../types";
import { GameEngine } from "../game/engine";
import { distance, nearestOnSegment } from "../game/navigation";
import { formatDistance } from "../data/geography";
import { Minimap } from "./Map";
export interface GamePayload {
  region: Region;
  tile: Tile;
  avatar: AvatarStyle;
  save?: SaveData;
  busPlan?: BusPlan;
  busStations?: BusStation[];
  boundaries?: DistrictCollection;
}
export function GameView({
  payload,
  settings,
  paused,
  onReady,
  onAction,
  onNotice,
  onSnapshot,
  onError,
}: {
  payload: GamePayload;
  settings: Settings;
  paused: boolean;
  onReady: (engine: GameEngine | null) => void;
  onAction: (action: string) => void;
  onNotice: (message: string) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<GameEngine | null>(null),
    latest = useRef({ onReady, onAction, onNotice, onSnapshot, onError });
  latest.current = { onReady, onAction, onNotice, onSnapshot, onError };
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [showGuide, setShowGuide] = useState(true);
  useEffect(() => {
    if (!host.current) return;
    try {
      const game = new GameEngine(
        host.current,
        payload.tile,
        payload.region,
        payload.avatar,
        settings,
        {
          action: (action) => latest.current.onAction(action),
          notice: (message) => latest.current.onNotice(message),
          snapshot: (s) => {
            setSnapshot(s);
            latest.current.onSnapshot(s);
          },
        },
        payload.save,
        payload.busStations,
        payload.busPlan,
        payload.boundaries,
      );
      engine.current = game;
      latest.current.onReady(game);
      (window as unknown as { __KOW__?: unknown }).__KOW__ = {
        snapshot: () => game.snapshot(),
        controls: () => game.controlDiagnostics(),
        projectGround: (point: { x: number; z: number }) =>
          game.controlDiagnostics().projectGround(point),
        simulationAudit: () => ({
          trafficOffRoad: game.traffic.agents.filter(
            (a) =>
              Math.min(
                ...a.road.points
                  .slice(1)
                  .map((b, i) =>
                    distance(
                      a.model.root.position,
                      nearestOnSegment(
                        a.model.root.position,
                        a.road.points[i],
                        b,
                      ),
                    ),
                  ),
              ) >
              a.road.width / 2 + 0.2,
          ).length,
          trafficWrongSide: game.traffic.agents.filter((a) => {
            const start = a.road.points[a.segment - 1],
              end = a.road.points[a.segment],
              dx = end.x - start.x,
              dz = end.z - start.z;
            const center = nearestOnSegment(a.model.root.position, start, end);
            return (
              (dx * (a.model.root.position.z - center.z) -
                dz * (a.model.root.position.x - center.x)) *
                a.direction >
              0.2
            );
          }).length,
          blockedVisiblePedestrians: game.traffic.pedestrians.filter(
            (p) =>
              p.human.root.visible &&
              game.world.collisions.blocked(p.human.root.position, 0.45),
          ).length,
          pedestrians: game.traffic.pedestrians.map((p) => ({
            x: p.human.root.position.x,
            z: p.human.root.position.z,
            visible: p.human.root.visible,
          })),
          trainOffRail:
            game.traffic.train?.children.filter(
              (c) =>
                Math.min(
                  ...[
                    ...game.world.railways,
                    ...game.world.metroTracks,
                  ].flatMap((points) =>
                    points
                      .slice(1)
                      .map((b, i) =>
                        distance(
                          c.position,
                          nearestOnSegment(c.position, points[i], b),
                        ),
                      ),
                  ),
                ) > 0.3,
            ).length ?? 0,
        }),
        diagnostics: () => ({
          region: game.region.id,
          area: game.world.tile.id,
          roads: game.world.roads.length,
          features: game.world.tile.features.length,
          spawn: game.world.spawn,
          blocked: game.world.collisions.blocked(
            game.position,
            game.player.dimensions.radius,
          ),
          obstacles: game.world.collisions.obstacles.length,
          landmark: game.world.landmarkPosition,
          runways: game.world.runways.length,
          railways: game.world.railways.length,
          metro: game.world.metroTracks.length,
          train: Boolean(game.traffic.train),
          vehicles: game.vehicles.map((v) => ({
            kind: v.model.kind,
            position: v.position,
          })),
          camera: {
            x: game.camera.position.x,
            y: game.camera.position.y,
            z: game.camera.position.z,
          },
        }),
        perf: () => game.perfDiagnostics(),
        journey: () => game.controlDiagnostics().bus,
        advanceJourney: import.meta.env.DEV ? (seconds: number) => game.advanceVerification(seconds) : undefined,
      };
      return () => {
        engine.current = null;
        latest.current.onReady(null);
        delete (window as unknown as { __KOW__?: unknown }).__KOW__;
        game.dispose();
      };
    } catch (e) {
      latest.current.onError(
        e instanceof Error ? e.message : "The 3D renderer could not start.",
      );
    }
  }, [payload]);
  useEffect(() => {
    engine.current?.applySettings(settings);
  }, [settings]);
  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);
  const region = payload.region,
    weather = settings.weather,
    time =
      settings.time === "morning"
        ? "08:30"
        : settings.time === "afternoon"
          ? "14:00"
          : settings.time === "evening"
            ? "17:20"
            : "21:00";
  return (
    <main className="game-screen">
      <div className="game-canvas" ref={host} />
      {snapshot ? (
        <div className="game-hud">
          <div className="hud-top">
            <div className="location-chip" title={region.town}>
              <span className="location-icon">
                <MapPin size={21} strokeWidth={1.5} />
              </span>
              <div>
                <span>{(snapshot.district ?? region.name).toUpperCase()} DISTRICT</span>
                <strong>{snapshot.locality ?? region.town}</strong>
              </div>
              <span className="live-badge">EXPLORING</span>
            </div>
            <div className="hud-toolbar">
              <button
                className="weather-chip"
                onClick={() => onAction("settings")}
              >
                {settings.time === "night" ? (
                  <Moon size={17} />
                ) : ["rainy", "monsoon"].includes(weather) ? (
                  <CloudRain size={17} />
                ) : (
                  <Sun size={17} />
                )}
                <strong>{time}</strong>
                <span>{weather}</span>
              </button>
              <button
                className="hud-icon"
                aria-label="Save game"
                onClick={() => onAction("save")}
              >
                <Save size={18} />
              </button>
              <button
                className="hud-icon"
                aria-label="Open world map"
                onClick={() => onAction("map")}
              >
                <Map size={18} />
              </button>
              <button
                className="hud-icon"
                aria-label="Travel by bus, rail or air"
                onClick={() => onAction("transport")}
              >
                <BusFront size={18} />
              </button>
              <button
                className="hud-icon"
                aria-label="Open settings"
                onClick={() => onAction("settings")}
              >
                <Settings2 size={18} />
              </button>
              <button
                className="hud-icon"
                aria-label="Pause game"
                onClick={() => onAction("pause")}
              >
                <Pause size={18} />
              </button>
            </div>
          </div>
          <div className="discovery-card">
            <div className="eyebrow">
              <Compass size={14} /> THE JOURNEY IS THE DESTINATION
            </div>
            <h3>
              {snapshot.discovered.includes(payload.tile.id)
                ? "A little closer to Kerala."
                : `Discover ${region.town}.`}
            </h3>
            <button
              onClick={() => {
                engine.current?.setDestination(
                  engine.current.world.landmarkPosition,
                );
                onNotice(
                  "Destination set. Follow the gold route or find your own way.",
                );
              }}
            >
              <span>{region.landmark}</span>
              <CornerUpRight size={16} />
            </button>
          </div>
          {snapshot.nearStation && !snapshot.bus?.attached && !snapshot.driving ? <button className="station-arrival" onClick={() => onAction("transport")}><small>BUS STATION</small><strong>{snapshot.nearStation.name}</strong><span>View destinations and simulated departures →</span></button> : null}
          <div className="hud-bottom">
            <div className="minimap-cluster">
              <Minimap
                tile={payload.tile}
                region={region}
                snapshot={snapshot}
                onOpen={() => onAction("map")}
              />
              <div className="journey-mini">
                <Footprints size={13} />
                {formatDistance(snapshot.distance)} travelled
                <span /> {snapshot.visited.length}/14 districts
              </div>
            </div>
            <div className="hud-center">
              {snapshot.near ? (
                <button
                  className="interact-prompt"
                  onClick={() => engine.current?.interact(snapshot.driving ? "driving" : undefined)}
                >
                  <kbd>{settings.bindings.interact.replace("Key", "")}</kbd>
                  <span>{snapshot.near}</span>
                </button>
              ) : (
                <div className="free-roam">
                  <span className="status-dot" /> TAKE YOUR TIME. YOU’RE IN
                  KERALA.
                </div>
              )}
              {snapshot.driving ? (
                <div className="speedometer">
                  <CarFront size={16} />
                  <strong>
                    {Math.round(snapshot.speed).toString().padStart(2, "0")}
                  </strong>
                  <span>
                    KM/H<small>{snapshot.vehicle}</small>
                  </span>
                  <div className="speed-bar">
                    <i style={{ width: `${Math.min(100, snapshot.speed)}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="control-card">
              <div className="controls-heading">
                <span>{snapshot.driving ? "ON THE ROAD" : "ON FOOT"}</span>
                <button
                  onClick={() => {
                    setShowGuide((v) => !v);
                    engine.current?.renderer.domElement.focus();
                  }}
                  aria-label={showGuide ? "Hide controls" : "Show controls"}
                >
                  {showGuide ? "−" : "+"}
                </button>
              </div>
              {showGuide ? (
                <>
                  <div className="control-line">
                    <span className="key-group">
                      <kbd>↑</kbd>
                      <kbd>←</kbd>
                      <kbd>↓</kbd>
                      <kbd>→</kbd>
                    </span>
                    <span>
                      {snapshot.driving ? "Drive" : "Move"}{" "}
                      <small>/ WASD</small>
                    </span>
                  </div>
                  <div className="control-line">
                    <kbd>{snapshot.driving ? "SPACE" : "SHIFT"}</kbd>
                    <span>{snapshot.driving ? "Handbrake" : "Run"}</span>
                    <kbd>{snapshot.driving ? "E" : "SPACE"}</kbd>
                    <span>{snapshot.driving ? "Exit" : "Jump"}</span>
                  </div>
                  <div className="control-line control-line--mouse">
                    <Mouse size={14} />
                    <span>
                      {snapshot.driving &&
                      settings.mouseSteering &&
                      settings.movement === "mouse"
                        ? "Cursor steers · Forward/Reverse · Right click brakes"
                        : "Right drag · look / Scroll · zoom"}
                    </span>
                  </div>
                  {settings.movement === "mouse" && !snapshot.driving ? (
                    <div className="control-line">
                      <span>Click ground · walk / Hold · follow cursor</span>
                    </div>
                  ) : null}
                  <div className="movement-switch">
                    <button
                      className={
                        settings.movement === "arrows" ||
                        settings.movement === "wasd"
                          ? "active"
                          : ""
                      }
                      onClick={() => onAction("arrows")}
                    >
                      Arrow keys
                    </button>
                    <button
                      className={settings.movement === "mouse" ? "active" : ""}
                      onClick={() => onAction("mouse")}
                    >
                      Mouse movement
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="mouse-actions">
            {!snapshot.driving && !snapshot.bus?.attached && !snapshot.rail?.attached ? (
              <>
                <button
                  onClick={() => engine.current?.action("toggleRun")}
                  aria-label="Toggle run"
                  aria-pressed={snapshot.runEnabled}
                >
                  <Footprints size={17} />{" "}
                  {snapshot.runEnabled ? "Run on" : "Run"}
                </button>
                {snapshot.destination ? (
                  <button
                    onClick={() => engine.current?.action("stop")}
                    aria-label="Stop moving"
                  >
                    Stop
                  </button>
                ) : null}
              </>
            ) : null}
            {snapshot.driving ? <>
              {settings.movement === "mouse" ? <>
                <button
                  className="mouse-drive-control"
                  aria-label="Drive forward"
                  title="Hold to move forward"
                  onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setMouseDriveDirection(1); }}
                  onPointerUp={() => engine.current?.setMouseDriveDirection(0)}
                  onPointerCancel={() => engine.current?.setMouseDriveDirection(0)}
                  onLostPointerCapture={() => engine.current?.setMouseDriveDirection(0)}
                >Forward</button>
                <button
                  className="mouse-drive-control"
                  aria-label="Drive in reverse"
                  title="Hold to back up"
                  onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setMouseDriveDirection(-1); }}
                  onPointerUp={() => engine.current?.setMouseDriveDirection(0)}
                  onPointerCancel={() => engine.current?.setMouseDriveDirection(0)}
                  onLostPointerCapture={() => engine.current?.setMouseDriveDirection(0)}
                >Reverse</button>
              </> : null}
              <button onClick={() => engine.current?.action("handbrake")} aria-pressed={snapshot.handbrake}>Handbrake</button>
              <button onClick={() => engine.current?.action("reverse")} aria-pressed={snapshot.reverse} title="Toggle gear while nearly stopped">{snapshot.reverse ? "Reverse gear" : "Forward gear"}</button>
              <button onClick={() => engine.current?.action("lookAround")}>Look around</button>
              <button onClick={() => engine.current?.interact("driving")}>Exit vehicle</button>
              <div className="steering-indicator" aria-label="Steering indicator"><i style={{ transform: `translateX(${(snapshot.steering ?? 0) * 35}px)` }} />{snapshot.reverse ? "R" : "D"}</div>
            </> : null}
            <button onClick={() => engine.current?.action("camera")} aria-label="Change camera">{snapshot.cameraMode} · Camera</button>
            <button
              disabled={snapshot.driving || snapshot.bus?.attached || snapshot.rail?.attached}
              onClick={() => engine.current?.action("jump")}
              aria-label="Jump"
            >
              <ArrowUp size={17} /> Jump
            </button>
            {!snapshot.bus?.attached ? <button
              onClick={() => engine.current?.interact()}
              aria-label="Interact"
            >
              E · Interact
            </button> : null}
          </div>
          {snapshot.bus && snapshot.bus.phase !== "exited" ? <BusJourneyHUD snapshot={snapshot} action={name => engine.current?.action(name)} walk={() => engine.current?.walkToBusDoor()} map={() => onAction("map")} /> : null}
          {snapshot.rail?.hasStation && !snapshot.driving && (!snapshot.bus || snapshot.bus.phase==="exited") ? <section className="bus-journey" aria-label="Local train journey">
            <div className="eyebrow">LOCAL RAIL SHUTTLE · SIMULATION</div>
            <h3>{snapshot.rail.attached?"Train passenger":"Mapped railway"}</h3>
            <p>{snapshot.rail.nextStop} · {Math.round(snapshot.rail.speed)} km/h</p>
            <p>{snapshot.rail.stopped?"Stopped at station":"Following imported rail alignment"}</p>
            <div className="bus-buttons">{snapshot.rail.attached?<>
              <button onClick={()=>engine.current?.action("camera")}>Cycle train camera</button>
              <button onClick={()=>engine.current?.action("requestTrainStop")}>Request station stop</button>
              <button disabled={!snapshot.rail.canExit} onClick={()=>engine.current?.action("exitTrain")}>Leave train at station</button>
            </>:<>
              <button onClick={()=>engine.current?.action("walkTrain")}>Walk to rail boarding area</button>
              <button disabled={!snapshot.rail.canBoard} onClick={()=>engine.current?.action("boardTrain")}>Board local train</button>
            </>}</div>
            <small>{snapshot.rail.camera} · Local segment only; no real service or timetable.</small>
          </section>:null}
          {snapshot.bus?.transitioning ? <div className="bus-travel-transition" role="status"><BusFront size={35} /><h2>Fast Journey</h2><p>Advancing to {snapshot.bus.to}…</p><small>The intervening journey is skipped.</small></div> : null}
          <div className="input-status">{snapshot.controller ? "Controller connected · " : ""}{snapshot.inputDevice} · {snapshot.cameraMode}</div>
          <div className="performance-pill">
            {snapshot.fps} FPS <span /> {settings.quality.toUpperCase()}{" "}
            <span /> {snapshot.chunks} CHUNKS
          </div>
          <a
            className="game-attribution"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            Roads & footprints © OpenStreetMap contributors
          </a>
        </div>
      ) : (
        <div className="renderer-loading">Preparing your arrival…</div>
      )}
    </main>
  );
}

function BusJourneyHUD({ snapshot, action, walk, map }: { snapshot: Snapshot; action: (name: string) => void; walk: () => void; map: () => void }) {
  const bus = snapshot.bus!;
  const selecting = ["select-seat", "seated"].includes(bus.phase);
  const attached = ["boarding", "select-seat", "seated", "closing", "travelling", "dwelling", "arrived"].includes(bus.phase);
  return <section className="bus-journey" aria-label="Bus journey">
    <div className="eyebrow">{bus.mode === "fast" ? "FAST JOURNEY" : "BUS JOURNEY"} · SIMULATED SERVICE</div>
    <h3>{bus.to}</h3>
    <p>From: {bus.from}</p>
    <p>Next stop: <strong>{bus.nextStop}</strong></p>
    <div className="journey-progress"><i style={{ width: `${bus.progress * 100}%` }} /></div>
    <div className="bus-stats"><span>{formatDistance(bus.remaining)} remaining</span><span>{Math.round(bus.speed)} km/h</span><span>~{Math.ceil(bus.remaining / 650)} min</span></div>
    <p className="bus-phase" role="status">{bus.phase.replaceAll("-", " ")} · Doors {bus.door > 0.98 ? "open" : bus.door < 0.02 ? "closed" : "moving"} · {bus.passengers} passengers</p>
    {!attached ? <div className="bus-buttons"><button onClick={walk}>Walk to passenger door</button><button disabled={!bus.canBoard} onClick={() => action("interact")}>Board bus</button></div> : null}
    {bus.phase === "boarding" ? <p>Entering through the passenger door…</p> : null}
    {selecting ? <div className="seat-picker" role="dialog" aria-label="Choose a passenger seat" aria-modal="true">
      <p>Choose a passenger seat · front ↑</p>
      <div className="seat-grid">{Array.from({ length: bus.type === "mini" ? 12 : 20 }, (_, i) => <button key={i} disabled={bus.occupied.includes(i)} aria-label={`Seat ${i + 1}${bus.occupied.includes(i) ? " occupied" : " available"}`} aria-pressed={bus.seat === i} onClick={() => action(`seat:${i}`)}>{i + 1}</button>)}</div>
      <p>Travel is seated. Free walking inside the moving bus is unavailable.</p>
      <button className="primary" disabled={!bus.seated} onClick={() => action("departBus")}>Begin full journey</button>
      <button onClick={() => action("exitBus")}>Leave bus before departure</button>
    </div> : null}
    {attached && !selecting && bus.phase !== "boarding" ? <div className="bus-buttons">
      <button onClick={() => action("lookAround")}>Look around</button>
      <button onClick={() => action("camera")}>Change camera</button>
      <button aria-pressed={bus.requestStop} disabled={bus.phase === "arrived"} onClick={() => action("requestStop")}>{bus.requestStop ? "Stop requested" : "Get off at next stop"}</button>
      <button disabled={bus.phase === "arrived"} onClick={() => action("fastBus")}>Fast Journey</button>
      <button onClick={map}>View route</button>
      <button disabled={!bus.canExit} onClick={() => action("exitBus")}>Exit at stop</button>
    </div> : null}
    <small>{bus.camera} · Original bus design · road routing, no real timetable</small>
  </section>;
}
