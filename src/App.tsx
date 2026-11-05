import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  TreePalm,
  ArrowRight,
  ArrowLeft,
  Compass,
  Map,
  Settings2,
  Volume2,
  VolumeX,
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
  Plane,
} from "lucide-react";
import type {
  AvatarStyle,
  Gender,
  Geography,
  Place,
  Region,
  Settings,
  Snapshot,
  BusService,
  BusType,
} from "./types";
import { DEFAULT_AVATAR } from "./types";
import {
  loadGeography,
  loadTile,
  placesInRegion,
  toLocal,
  getAccuracyReport,
  loadBusPlan,
  toGeo,
  dataUrl,
} from "./data/geography";
import {
  readAvatar,
  readSave,
  readSettings,
  sanitizeSettings,
  writeAvatar,
  writeSave,
  writeSettings,
} from "./game/save";
import type { GameEngine } from "./game/engine";
import { HomeScreen } from "./ui/HomeScreen";
import { travelCapabilities } from "./game/travel";
import { CharacterSetup } from "./ui/CharacterSetup";
import { LocationSetup } from "./ui/LocationSetup";
import { SettingsPanel } from "./ui/SettingsPanel";
import { WorldMapPanel } from "./ui/WorldMapPanel";
import { GameView } from "./ui/GameView";
import { TransportPanel } from "./ui/TransportPanel";
import type { GamePayload } from "./ui/GameView";
import { startGamepadNavigation } from "./game/gamepad";

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
    [airTrip,setAirTrip] = useState<{from:string;to:string}|null>(null),
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
    loadVersion = useRef(0),
    retryLoad = useRef<(() => void) | null>(null);
  const ml = settings.language === "ml";
  const inputState = useRef({ settings, screen, overlay });
  inputState.current = { settings, screen, overlay };
  useEffect(() => startGamepadNavigation(() => inputState.current.settings,
    () => Boolean(engine.current && !engine.current.paused && !document.querySelector('[role="dialog"]')),
    name => {
      if (name === "closeMenu") setOverlay(null);
      else if (engine.current) { engine.current.input.device="gamepad"; engine.current.action(name); }
    }), []);
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
    if ((engine.current?.bus?.attached || engine.current?.trainPassenger || engine.current?.taxi?.attached) && !continuing) { notify("Leave your transport at a stop before exploring another area. You can request a stop or use the bus Fast Journey."); return; }
    if (place && !continuing && !travelCapabilities(place, region).covered) { notify("This destination has no playable area yet."); return; }
    if (screen === "game" && !continuing && engine.current) { const checkpoint=engine.current.save(); writeSave(checkpoint); setSaved(checkpoint); }
    const version = ++loadVersion.current;
    retryLoad.current = () => { void start(region, place, continuing); };
    setNotice("");
    clearTimeout(noticeTimer.current);
    setError("");
    setLoading(`Travelling to ${region.town}…`);
    engine.current?.setPaused(true);
    try {
      const corridor = continuing && saved?.area?.startsWith("corridor-") ? geography?.busRoutes.find(r => `corridor-${r.id}` === saved.area) : undefined;
      const tile = corridor && geography ? (await loadBusPlan(corridor, geography, "public")).tile : await loadTile(place?.tile ?? region.id);
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
            asset: place.kind === "bus_station" ? "bus-terminal" : place.asset ?? region.asset,
          }
        : region;
      if (version !== loadVersion.current) return;
      let save = continuing
        ? saved
        : screen === "game"
          ? engine.current?.save()
          : undefined;
      const selectedAvatar = continuing && save ? save.avatar : avatar;
      if (continuing && save?.controls) setSettings(sanitizeSettings(save.controls));
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
          journeys: save?.journeys,
          discoveredStations: save?.discoveredStations,
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
        busStations: geography?.busStations,
        boundaries: geography?.boundaries,
      });
      setScreen("game");
      setOverlay(null);
      setSnapshot(null);
      writeAvatar(selectedAvatar);
      setLoading("");
      retryLoad.current = null;
    } catch (e) {
      if (version !== loadVersion.current) return;
      setLoading("");
      setError(
        e instanceof Error ? e.message : "This region could not be loaded.",
      );
      engine.current?.setPaused(Boolean(inputState.current.overlay));
    }
  };
  const bookBus = async (service: BusService, type: BusType) => {
    const game = engine.current;
    if (!game || !geography || game.bus?.attached || game.trainPassenger || game.driving) return;
    const station = geography.busStations.find(s => s.id === service.from);
    if (!station) return;
    const waiting = game.terminals.stations.find(s => s.data.id === station.id)?.waiting;
    if (!waiting || Math.hypot(game.position.x - waiting.x, game.position.z - waiting.z) > 28) {
      setOverlay(null); game.setPaused(false);
      if (waiting) { game.walkToDestination(waiting); notify(`Walk to ${station.name}. Select the service when you reach the waiting area.`); }
      else notify("Use the map to explore the departure terminal before booking this bus.");
      return;
    }
    const version = ++loadVersion.current;
    retryLoad.current = () => { void bookBus(service, type); };
    setLoading("Preparing the sourced bus corridor…");
    try {
      const { plan, tile } = await loadBusPlan(service, geography, type);
      if (version !== loadVersion.current) return;
      const before = game.save(), coordinate = toGeo(game.position, game.world.tile.origin);
      const save = { ...before, area: tile.id, position: toLocal(coordinate, tile.origin) };
      setPayload({ region: game.region, tile, avatar: game.avatar, save, busPlan: plan, busStations: geography.busStations, boundaries: geography.boundaries });
      setOverlay(null); setSnapshot(null); setLoading("");
      retryLoad.current = null;
    } catch (e) { if (version !== loadVersion.current) return; setLoading(""); setError(e instanceof Error ? e.message : "The bus corridor could not load."); }
  };
  const action = useCallback(
    (name: string) => {
      if (name === "save") {
        saveGame();
        return;
      }
      if (name === "arrivalSave") {
        const save = engine.current?.save(); if (save && writeSave(save)) setSaved(save);
        return;
      }
      if (name === "mouse" || name === "arrows") {
        setSettings((s) => ({ ...s, movement: name, ...(name === "mouse" ? { mouseSteering: true } : {}) }));
        engine.current?.renderer.domElement.focus();
        notify(
          name === "mouse"
            ? "Mouse movement · click to walk, move the pointer to steer, and use the vehicle buttons for forward and reverse."
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
        <HomeScreen
          geography={geography}
          saved={saved}
          ml={ml}
          onChoosePlace={(p) => { setDistrict(p.district); setStartPlace(p); setGender(null); setScreen("character"); }}
          onBegin={() => { setStartPlace(null); setNotice(""); setGender(null); setScreen("character"); }}
          onContinue={() => {
            if (!geography || !saved) return;
            const r = geography.regions.find((r) => r.id === saved.region);
            if (r) void start(r, geography.places.find((p) => p.tile === saved.area), true);
            else setError("This saved district is unavailable. Begin a new journey or restore a valid save.");
          }}
          onSelectDistrict={(id) => {
            setStartPlace(null); setDistrict(id);
            setNotice("");
            setGender(null);
            setScreen("character");
          }}
        />
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
        <LocationSetup
          geography={geography}
          district={district}
          selectedRegion={selectedRegion}
          startPlace={startPlace}
          locationQuery={locationQuery}
          ml={ml}
          onDistrictChange={setDistrict}
          onLocationQueryChange={setLocationQuery}
          onPlaceChange={setStartPlace}
          onBack={() => setScreen("character")}
          onStart={(place) => void start(selectedRegion, place)}
        />
      ) : screen === "game" && payload ? (
        <GameView
          payload={payload}
          settings={settings}
          paused={Boolean(overlay) || Boolean(loading) || Boolean(airTrip)}
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
      {overlay === "transport" && snapshot?.taxi ? <div className="modal-shade"><section className="pause-menu" role="dialog" aria-modal="true" aria-label="Taxi controls"><h2>Your taxi journey</h2><p>{snapshot.taxi.destination} · {snapshot.taxi.phase}</p>{(snapshot.taxi.attached?['stopTaxi','skipTaxi','exitTaxi']:['boardTaxi','cancelTaxi']).map(name=><button className="primary wide" key={name} disabled={name==='exitTaxi'?!snapshot.taxi?.canExit:name==='boardTaxi'?!snapshot.taxi?.canBoard:false} onClick={()=>{setOverlay(null);engine.current?.setPaused(false);engine.current?.action(name);}}>{{stopTaxi:'Stop safely',skipTaxi:'Skip ride',exitTaxi:'Exit taxi',boardTaxi:'Board taxi',cancelTaxi:'Cancel taxi'}[name]}</button>)}<button onClick={()=>setOverlay(null)}>Back to game</button></section></div> : null}
      {overlay === "transport" && !snapshot?.taxi && geography && payload ? (
        <TransportPanel
          geography={geography}
          region={payload.region}
          snapshot={snapshot ?? undefined}
          onBook={bookBus}
          onWalkToStation={(id) => {
            const station = engine.current?.terminals.stations.find(s => s.data.id === id);
            setOverlay(null); engine.current?.setPaused(false);
            if (station) engine.current?.walkToDestination(station.waiting);
            else notify("Open the map and explore this terminal’s area first.");
          }}
          onTravel={async(r,p,mode)=>{
            if(mode==="air" && !engine.current?.bus?.attached && !engine.current?.trainPassenger){
              setOverlay(null);setAirTrip({from:payload.region.town,to:p?.name??r.town});
              await new Promise(resolve=>setTimeout(resolve,4200));
              setAirTrip(null);
            }
            void start(r,p);
          }}
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
          onReachable={(p) => engine.current?.canNavigateTo(p) ?? false}
          onTaxi={screen === "game" ? (p) => { if(engine.current?.requestTaxi(p)) { setOverlay(null); engine.current.setPaused(false); } } : undefined}
          onClose={() => setOverlay(null)}
          onNavigate={
            screen === "game" ? (p) => { engine.current?.navigateTo(p); setOverlay(null); } : undefined
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
                  original procedural interpretations (fidelity C). Roads and footprints
                  retain sourced coordinates. Terrain uses coarse, attributed elevation
                  grids; road decks, bridges and facades are approximate.
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
                    href={dataUrl("boundary-source.json")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    geoBoundaries / Pathways Data · ODbL
                  </a>
                  <a href={dataUrl("regions.json")} target="_blank" rel="noreferrer">
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
              else retryLoad.current?.();
            }}
          >
            Retry
          </button>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {airTrip ? <div className="air-transfer" role="status" aria-live="polite">
        <span className="eyebrow">SIMULATED AIRPORT TRANSFER</span>
        <h2>{airTrip.from} → {airTrip.to}</h2>
        <div className="flight-path"><span/><Plane size={40}/><span/></div>
        <p>Departure · en route · arrival</p>
        <small>This cinematic skips the flight between imported airport scenes.</small>
      </div> : null}
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
