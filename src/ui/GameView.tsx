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
                <span>{region.name.toUpperCase()} DISTRICT</span>
                <strong>{region.town}</strong>
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
                  onClick={() => engine.current?.interact()}
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
                  <div className="control-line">
                    <Mouse size={14} />
                    <span>
                      {snapshot.driving &&
                      settings.mouseSteering &&
                      settings.movement === "mouse"
                        ? "Hold left · drive & steer / right · brake"
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
            {!snapshot.driving ? (
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
            <button
              disabled={snapshot.driving}
              onClick={() => engine.current?.action("jump")}
              aria-label="Jump"
            >
              <ArrowUp size={17} /> Jump
            </button>
            <button
              onClick={() => engine.current?.interact()}
              aria-label="Interact"
            >
              E · Interact
            </button>
          </div>
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
