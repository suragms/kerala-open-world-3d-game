import { useCallback, useEffect, useRef, useState } from "react";
import {
  TreePalm,
  ArrowRight,
  ArrowLeft,
  Compass,
  Map,
  Settings2,
  Volume2,
  VolumeX,
  MapPin,
  Search,
  Check,
  X,
  Play,
  Save,
  BookOpen,
  RefreshCcw,
  ChevronDown,
  Mountain,
  Waves,
  Navigation,
  ExternalLink,
} from "lucide-react";
import type {
  AvatarStyle,
  Gender,
  Geography,
  Place,
  Region,
  Settings,
  Snapshot,
} from "./types";
import { DEFAULT_AVATAR } from "./types";
import {
  loadGeography,
  loadTile,
  placesInRegion,
  toLocal,
  getAccuracyReport,
} from "./data/geography";
import {
  readAvatar,
  readSave,
  readSettings,
  writeAvatar,
  writeSave,
  writeSettings,
} from "./game/save";
import type { GameEngine } from "./game/engine";
import { ScenePreview } from "./ui/ScenePreview";
import { CharacterSetup } from "./ui/CharacterSetup";
import { DistrictMap } from "./ui/Map";
import { SettingsPanel } from "./ui/SettingsPanel";
import { WorldMapPanel } from "./ui/WorldMapPanel";
import { GameView } from "./ui/GameView";
import { TransportPanel } from "./ui/TransportPanel";
import type { GamePayload } from "./ui/GameView";

type Screen = "home" | "character" | "location" | "game";
type Overlay =
  | "map"
  | "settings"
  | "pause"
  | "credits"
  | "landmark"
  | "transport"
  | null;
export default function App() {
  const [geography, setGeography] = useState<Geography | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(""),
    [screen, setScreen] = useState<Screen>("home"),
    [overlay, setOverlay] = useState<Overlay>(null),
    [settings, setSettings] = useState(readSettings),
    [avatar, setAvatar] = useState<AvatarStyle>(
      () => readAvatar() ?? DEFAULT_AVATAR,
    ),
    [gender, setGender] = useState<Gender | null>(null),
    [district, setDistrict] = useState("thrissur"),
    [locationQuery, setLocationQuery] = useState(""),
    [startPlace, setStartPlace] = useState<Place | null>(null),
    [payload, setPayload] = useState<GamePayload | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [saved, setSaved] = useState(readSave),
    [notice, setNotice] = useState("");
  const engine = useRef<GameEngine | null>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    loadVersion = useRef(0);
  const ml = settings.language === "ml";
  const notify = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6500);
  }, []);
  useEffect(() => {
    loadGeography()
      .then((geo) => {
        setGeography(geo);
        (window as unknown as Record<string, unknown>).__KOW_GEO_REPORT__ =
          getAccuracyReport();
      })
      .catch((e) => setError(e.message));
    return () => {
      clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    writeSettings(settings);
  }, [settings]);
  const changeSettings = (value: Settings) => setSettings(value);
  const saveGame = useCallback(() => {
    const save = engine.current?.save();
    if (save) {
      const ok = writeSave(save);
      if (ok) setSaved(save);
      notify(
        ok
          ? "Journey saved. Kerala will be right here when you return."
          : "Your browser could not save. Check available storage.",
      );
      if (engine.current && !engine.current.paused)
        engine.current.renderer.domElement.focus();
    }
  }, [notify]);
  useEffect(() => {
    if (screen !== "game") return;
    const timer = setInterval(() => {
      const save = engine.current?.save();
      if (save && writeSave(save)) setSaved(save);
    }, 30000);
    const unload = () => {
      const save = engine.current?.save();
      if (save) writeSave(save);
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
    };
  }, [screen]);
  useEffect(() => {
    if (!overlay) return;
    const before = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const button = dialog?.querySelector<HTMLElement>("button");
      button?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.code === "Escape") {
        setOverlay(null);
        e.preventDefault();
        return;
      }
      if (e.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        const controls = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.offsetParent !== null);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, [overlay]);
  const start = async (region: Region, place?: Place, continuing = false) => {
    const version = ++loadVersion.current;
    setNotice("");
    clearTimeout(noticeTimer.current);
    setError("");
    setLoading(`Travelling to ${region.town}…`);
    engine.current?.setPaused(true);
    try {
      const tile = await loadTile(place?.tile ?? region.id);
      const activeRegion = place?.tile
        ? {
            ...region,
            landmark: place.name,
            town: place.name,
            lat: place.lat,
            lon: place.lon,
            origin: tile.origin,
            theme: place.theme ?? region.theme,
            source: place.terminalSource ?? place.source,
          }
        : region;
      if (version !== loadVersion.current) return;
      let save = continuing
        ? saved
        : screen === "game"
          ? engine.current?.save()
          : undefined;
      const selectedAvatar = continuing && save ? save.avatar : avatar;
      if (save && !continuing)
        save = {
          ...save,
          region: region.id,
          position: place
            ? toLocal([place.lon, place.lat], tile.origin)
            : { x: NaN, z: NaN },
        };
      if (place && !continuing) {
        save = {
          version: 1,
          avatar: selectedAvatar,
          region: region.id,
          position: toLocal([place.lon, place.lat], tile.origin),
          yaw: 0,
          visited: save?.visited ?? [],
          discovered: save?.discovered ?? [],
          distance: save?.distance ?? 0,
          savedAt: new Date().toISOString(),
        };
      }
      // A district change without a selected local point must use the new world's safe arrival point.
      if (
        save &&
        (!Number.isFinite(save.position.x) || !Number.isFinite(save.position.z))
      )
        save = { ...save, region: "__new_arrival__" };
      setPayload({
        region: activeRegion,
        tile,
        avatar: selectedAvatar,
        save: save ?? undefined,
      });
      setScreen("game");
      setOverlay(null);
      setSnapshot(null);
      writeAvatar(selectedAvatar);
      setLoading("");
    } catch (e) {
      setLoading("");
      setError(
        e instanceof Error ? e.message : "This region could not be loaded.",
      );
      engine.current?.setPaused(false);
    }
  };
  const action = useCallback(
    (name: string) => {
      if (name === "save") {
        saveGame();
        return;
      }
      if (name === "mouse" || name === "arrows") {
        setSettings((s) => ({ ...s, movement: name }));
        engine.current?.renderer.domElement.focus();
        notify(
          name === "mouse"
            ? "Mouse movement · click the ground to walk. Right drag looks around."
            : "Arrow key movement · arrows or WASD to walk, Shift to run.",
        );
        return;
      }
      if (["map", "settings", "pause", "landmark", "transport"].includes(name))
        setOverlay(name as Overlay);
    },
    [notify, saveGame],
  );
  const selectedRegion = geography?.regions.find((r) => r.id === district);
  const localStarts =
    geography && selectedRegion
      ? [
          {
            id: `landmark-${district}`,
            name: selectedRegion.landmark,
            lat: selectedRegion.lat,
            lon: selectedRegion.lon,
            district,
            kind: "landmark",
            source: selectedRegion.source,
          },
          ...geography.places.filter(
            (p) => p.district === selectedRegion.id && p.tile,
          ),
          ...placesInRegion(geography.places, selectedRegion).filter(
            (p) => p.kind !== "landmark" && !p.tile,
          ),
        ]
          .filter((p) =>
            p.name.toLowerCase().includes(locationQuery.toLowerCase()),
          )
          .slice(0, 12)
      : [];
  return (
    <div
      className={`app ${screen === "home" ? "on-home" : ""} ${screen === "game" ? "in-game" : ""}`}
    >
      {screen !== "game" ? (
        <header className="site-header">
          <button
            className="brand"
            onClick={() => {
              setScreen("home");
              setOverlay(null);
            }}
            aria-label="Kerala Open World home"
          >
            <span className="brand-icon">
              <TreePalm size={29} strokeWidth={1.25} />
            </span>
            <span>
              KERALA<small>OPEN WORLD</small>
            </span>
          </button>
          <nav aria-label="Main navigation">
            <button onClick={() => setOverlay("map")}>
              <Map size={15} /> {ml ? "ഭൂപടം" : "Explore the map"}
            </button>
            <button onClick={() => setOverlay("credits")}>
              <BookOpen size={15} /> Field notes
            </button>
            <button onClick={() => setOverlay("settings")}>
              <Settings2 size={15} />
              <span>{ml ? "ക്രമീകരണങ്ങൾ" : "Settings"}</span>
            </button>
            <span className="nav-divider" />
            <button
              className="icon-button"
              aria-label={settings.master ? "Mute audio" : "Unmute audio"}
              onClick={() =>
                setSettings((s) => ({ ...s, master: s.master ? 0 : 0.45 }))
              }
            >
              {settings.master ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
          </nav>
        </header>
      ) : null}
      {screen === "home" ? (
        <>
          <ScenePreview backdrop />
          <div className="home-vignette" />
          <main className="home-content">
            <div className="home-eyebrow">
              <span className="status-dot" /> AN OPEN-WORLD JOURNEY THROUGH
              KERALA
            </div>
            <h1>
              Some places
              <br />
              feel like <em>home.</em>
            </h1>
            <p className="home-subtitle">Explore God’s Own Country.</p>
            <p className="home-description">
              From the quiet backwaters to the misty Ghats.
              <br />
              Fourteen districts. Countless little discoveries.
              <br />A whole world, waiting at your own pace.
            </p>
            <div className="home-actions">
              <button
                className="primary light-primary"
                disabled={!geography}
                onClick={() => {
                  setNotice("");
                  setGender(null);
                  setScreen("character");
                }}
              >
                {ml ? "യാത്ര തുടങ്ങാം" : "Begin your journey"}
                <ArrowRight size={19} />
              </button>
              {saved && geography ? (
                <button
                  className="continue-button"
                  onClick={() => {
                    const r = geography.regions.find(
                      (r) => r.id === saved.region,
                    );
                    if (r)
                      void start(
                        r,
                        geography.places.find((p) => p.tile === saved.area),
                        true,
                      );
                  }}
                >
                  <Play size={15} /> Continue exploring
                </button>
              ) : null}
            </div>
            <div className="home-facts">
              <span>
                <Compass size={17} />
                <strong>14</strong> districts
              </span>
              <i />
              <span>
                <Waves size={17} /> One beautiful state
              </span>
              <i />
              <span>Your own pace</span>
            </div>
          </main>
          <aside className="home-location">
            <div className="location-heading">
              <span className="tiny-line" /> A GOOD PLACE TO BEGIN{" "}
              <span>01 / 14</span>
            </div>
            <div className="home-location-info">
              <span className="location-outline">
                <MapPin size={26} strokeWidth={1.2} />
              </span>
              <div>
                <h3>Thrissur</h3>
                <p>The cultural heart of Kerala.</p>
              </div>
              <button
                className="round-button"
                aria-label="Choose Thrissur starting location"
                onClick={() => {
                  setDistrict("thrissur");
                  setNotice("");
                  setGender(null);
                  setScreen("character");
                }}
              >
                <ArrowRight size={19} />
              </button>
            </div>
            <div className="location-coordinates">
              10.5244° N &nbsp; 76.2145° E <span>SWARAJ ROUND</span>
            </div>
          </aside>
          <footer className="home-footer">
            <span>
              KERALA OPEN WORLD <i /> EXPLORATION BUILD 0.1
            </span>
            <span>
              <span className="status-dot" /> BUILT FOR THE WANDERER IN YOU
            </span>
          </footer>
        </>
      ) : screen === "character" ? (
        <CharacterSetup
          avatar={avatar}
          gender={gender}
          onGender={(g) => {
            setGender(g);
            const value = {
              ...avatar,
              gender: g,
              hair:
                g === avatar.gender
                  ? avatar.hair
                  : g === "female"
                    ? "long"
                    : "short",
            } as AvatarStyle;
            setAvatar(value);
            writeAvatar(value);
          }}
          onChange={(a) => {
            setAvatar(a);
            writeAvatar(a);
          }}
          onBack={() => setScreen("home")}
          onContinue={() => {
            if (gender) setScreen("location");
          }}
        />
      ) : screen === "location" && geography && selectedRegion ? (
        <main className="setup-screen location-screen">
          <section className="setup-form">
            <button
              className="text-button back-link"
              onClick={() => setScreen("character")}
            >
              <ArrowLeft size={16} /> Back to character
            </button>
            <div className="step-label">
              01 <span className="muted"> YOUR CHARACTER</span>
              <i />
              <span>02</span> YOUR STARTING POINT
            </div>
            <span className="eyebrow">CHOOSE STARTING LOCATION</span>
            <h1>
              Where will your
              <br />
              story begin?
            </h1>
            <p className="lead">
              Every district has a different rhythm.
              <br />
              Find a place that feels like you.
            </p>
            <label className="field-label" htmlFor="district">
              YOUR STARTING DISTRICT
            </label>
            <div className="district-select">
              <MapPin size={19} />
              <select
                id="district"
                aria-label="Starting district"
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setStartPlace(null);
                  setLocationQuery("");
                }}
              >
                {geography.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="district-description">
              <span>{selectedRegion.biome}</span>
              <p>{selectedRegion.description}</p>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search starting locations"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                placeholder="Find a starting location…"
              />
            </label>
            <div className="starting-list">
              {localStarts.length ? (
                localStarts.map((p, i) => (
                  <button
                    className={
                      startPlace?.id === p.id ||
                      (!startPlace && i === 0 && !locationQuery)
                        ? "active"
                        : ""
                    }
                    key={p.id}
                    onClick={() => setStartPlace(p)}
                  >
                    <MapPin size={16} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.kind === "landmark"
                          ? "LANDMARK ARRIVAL · SUGGESTED"
                          : p.kind.replaceAll("_", " ")}
                      </small>
                    </span>
                    <span className="radio-ring">
                      {startPlace?.id === p.id || (!startPlace && i === 0) ? (
                        <Check size={12} />
                      ) : null}
                    </span>
                  </button>
                ))
              ) : (
                <p className="empty-state">
                  No starting points match. Try the landmark name.
                </p>
              )}
            </div>
            <button
              className="primary wide"
              onClick={() =>
                void start(selectedRegion, startPlace ?? undefined)
              }
            >
              {ml ? "കളി തുടങ്ങാം" : "Start game"}
              <ArrowRight size={19} />
            </button>
            <p className="selection-note">
              Real local roads. Original scenery. A journey of your own.
            </p>
          </section>
          <section className="location-map-stage">
            <div className="stage-title">
              <span className="eyebrow">GOD’S OWN COUNTRY</span>
              <span className="pill">ALL 14 DISTRICTS</span>
            </div>
            <DistrictMap
              boundaries={geography.boundaries}
              regions={geography.regions}
              selected={district}
              onSelect={(id) => {
                setDistrict(id);
                setStartPlace(null);
                setLocationQuery("");
              }}
            />
            <div className="location-map-caption">
              <span className="status-dot" />
              {selectedRegion.name}
              <span>
                {selectedRegion.lat.toFixed(4)}° N,{" "}
                {selectedRegion.lon.toFixed(4)}° E
              </span>
            </div>
          </section>
        </main>
      ) : screen === "game" && payload ? (
        <GameView
          payload={payload}
          settings={settings}
          paused={Boolean(overlay) || Boolean(loading)}
          onReady={(e) => {
            engine.current = e;
          }}
          onAction={action}
          onNotice={notify}
          onSnapshot={setSnapshot}
          onError={(message) => {
            setError(`The 3D world could not start: ${message}`);
            setScreen("home");
          }}
        />
      ) : null}
      {overlay === "transport" && geography && payload ? (
        <TransportPanel
          geography={geography}
          region={payload.region}
          onTravel={(r, p) => void start(r, p)}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "settings" ? (
        <SettingsPanel
          settings={settings}
          onChange={changeSettings}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "map" && geography ? (
        <WorldMapPanel
          geography={geography}
          currentRegion={payload?.region}
          currentArea={payload?.tile.id}
          snapshot={snapshot ?? undefined}
          onClose={() => setOverlay(null)}
          onNavigate={
            screen === "game" ? (p) => engine.current?.navigateTo(p) : undefined
          }
          onTravel={(r, p) => {
            if (screen === "game") void start(r, p);
            else {
              setDistrict(r.id);
              setStartPlace(p ?? null);
              setNotice("");
              setGender(null);
              setScreen("character");
              setOverlay(null);
            }
          }}
        />
      ) : null}
      {overlay === "pause" ? (
        <div className="modal-shade pause-shade">
          <section
            className="pause-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Game paused"
          >
            <TreePalm size={37} strokeWidth={1} />
            <span className="eyebrow">A MOMENT TO BREATHE</span>
            <h2>The world can wait.</h2>
            <p>Your journey through {payload?.region.name} is paused.</p>
            <button className="primary wide" onClick={() => setOverlay(null)}>
              <Play size={16} /> Resume journey <ArrowRight size={17} />
            </button>
            <button onClick={saveGame}>
              <Save size={16} /> Save journey
            </button>
            <button onClick={() => setOverlay("map")}>
              <Map size={16} /> World map
            </button>
            <button onClick={() => setOverlay("settings")}>
              <Settings2 size={16} /> Settings
            </button>
            <button
              onClick={() => {
                engine.current?.recover();
                setOverlay(null);
              }}
            >
              <RefreshCcw size={16} /> Return to arrival point
            </button>
            <button
              onClick={() => {
                saveGame();
                setScreen("home");
                setPayload(null);
                setOverlay(null);
              }}
            >
              <ArrowLeft size={16} /> Save & return home
            </button>
            <div className="pause-progress">
              <span>
                <strong>{snapshot?.visited.length ?? 1}</strong> / 14 districts
              </span>
              <span>
                <strong>{snapshot?.discovered.length ?? 0}</strong> discoveries
              </span>
            </div>
            <div className="achievement-row" aria-label="District achievements">
              <span className="unlocked">✦ First footsteps</span>
              <span
                className={
                  (snapshot?.visited.length ?? 0) >= 5 ? "unlocked" : ""
                }
              >
                ✦ Finding Kerala · 5 districts
              </span>
              <span
                className={
                  (snapshot?.visited.length ?? 0) >= 14 ? "unlocked" : ""
                }
              >
                ✦ Across the state · 14 districts
              </span>
            </div>
          </section>
        </div>
      ) : null}
      {overlay === "credits" || overlay === "landmark" ? (
        <div className="modal-shade">
          <section
            className="modal notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-title"
          >
            <div className="modal-top">
              <div>
                <span className="eyebrow">A NOTE FROM THE FIELD</span>
                <h2 id="notes-title">
                  {overlay === "landmark"
                    ? payload?.region.landmark
                    : "A place worth getting right."}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close field notes"
                onClick={() => setOverlay(null)}
              >
                <X size={20} />
              </button>
            </div>
            {overlay === "landmark" && payload ? (
              <>
                <p>{payload.region.description}</p>
                <p className="source-fact">
                  {payload.region.lat.toFixed(6)}° N,{" "}
                  {payload.region.lon.toFixed(6)}° E · {payload.region.name}
                </p>
                <a
                  className="source-link"
                  href={payload.region.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  View location source <ExternalLink size={14} />
                </a>
                <p className="fine-note">
                  {payload.region.approximation} This is an exterior
                  representation. Access restrictions and sensitive interiors
                  are not simulated.
                </p>
              </>
            ) : (
              <>
                <p>
                  Kerala Open World is an original exploration game built around
                  Kerala’s real geographic relationships and the joy of taking
                  the long way home.
                </p>
                <div className="notes-facts">
                  <span>
                    14 <small>districts to discover</small>
                  </span>
                  <span>
                    OSM <small>local roads & footprints</small>
                  </span>
                  <span>
                    1:1 <small>local horizontal distances</small>
                  </span>
                </div>
                <h3>Real places. Honest approximations.</h3>
                <p>
                  District boundaries are from the 2021 geoBoundaries / Pathways
                  Data dataset. Roads, building footprints, towns, stations and
                  airports come from OpenStreetMap. All scene models are
                  original procedural interpretations; terrain height and facade
                  details are approximate.
                </p>
                <p>
                  Fourteen district landmark areas and thirteen additional
                  airport, railway and Kochi areas are available. The statewide
                  map also includes places whose detailed scenes have not been
                  built. District travel skips the distance between these areas;
                  it is not a continuous reconstruction of the entire state.
                </p>
                <p>
                  Audio is originally synthesized. Game traffic, any trains and
                  travel times are fictional simulations. No live transport
                  information is provided.
                </p>
                <div className="source-links">
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    © OpenStreetMap contributors · ODbL
                  </a>
                  <a
                    href="/data/boundary-source.json"
                    target="_blank"
                    rel="noreferrer"
                  >
                    geoBoundaries / Pathways Data · ODbL
                  </a>
                  <a href="/data/regions.json" target="_blank" rel="noreferrer">
                    Landmark source & accuracy register
                  </a>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
      {notice ? (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          <p>{notice}</p>
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError("");
              if (!geography)
                loadGeography()
                  .then(setGeography)
                  .catch((e) => setError(e.message));
            }}
          >
            Retry
          </button>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="travel-loading" role="status">
          <TreePalm size={44} strokeWidth={1} />
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <h2>{loading}</h2>
          <div className="loading-bar">
            <span />
          </div>
          <p>Loading local roads, scenery and the little details.</p>
        </div>
      ) : null}
    </div>
  );
}
