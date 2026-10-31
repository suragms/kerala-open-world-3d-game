# Kerala Open World

A browser exploration game built with React, TypeScript, Three.js and Vite. The geographic register preserves 14 Kerala districts, 3,435 sourced places, 181 railway station records and four airports. There are 41 imported local areas and five continuous passenger-bus corridors. A place record is not a claim of a fully modeled 3D destination.

The visuals are original, stylized game assets. Landmark and terminal architecture is classified **C: procedural approximation**. Geographic records and footprints are **B: geographic reconstruction**. No Level A exterior or photorealistic replica is claimed. Terrain uses attributed 80 m local / 160 m corridor elevation grids, with coarse-source limitations.

## Run locally

Use Node.js 22.12 or newer and a WebGL2 browser.

```powershell
npm ci
npm run dev -- --port 5173
```

Open [the local game](http://127.0.0.1:5173/), select an avatar and choose a starting district. Low graphics reduces the draw distance, vegetation, traffic, passengers and rendering resolution. Performance depends on the machine; a 4 GB laptop has not been independently benchmarked.

```powershell
npm run build
npm test
npm run data:validate
npm run test:browser
npm run test:production
```

Install the pinned browser once with `npm run test:browser:install`. The cross-platform browser suite starts its own local server on an available port, waits for readiness, and closes it afterward. Each workflow starts through the character-selection interface in an isolated browser context. Failed assertions, browser errors and network failures fail the run; screenshots, HTML, JSON and failure traces are saved under `output/playwright/phase9/`.

Use `BROWSER_CHECKS` (a comma-separated list) to select workflows. The legacy PowerShell scripts delegate to the same runner. Long bus and rail checks advance the normal simulation with a development-only deterministic clock; those checks are not real-time FPS benchmarks. `performance-long` measures actual frame intervals during moving urban, rural, hill and active bus scenes. `npm run test:production` builds and tests a subdirectory deployment. CI runs compilation, units, geography, production build and browser smoke tests and retains diagnostic artifacts.

## Controls

| Action | Mouse | Keyboard | Standard controller |
|---|---|---|---|
| Walk | Choose Mouse movement; click or hold valid ground | Arrows / WASD | Left stick |
| Run / jump | Run / Jump buttons; double-click a ground destination to run | Shift / Space | Left-stick click / bottom face |
| Look / zoom | Right drag / wheel | C cycles camera | Right stick / top face cycles camera |
| Interact / enter / exit | Click object or HUD prompt | E | Left face |
| Drive | Hold left to accelerate, right to brake, horizontal position to steer | Arrows / WASD | Left stick, right / left triggers |
| Handbrake / reverse | HUD buttons | Space / hold backward after stopping | Bottom face / HUD gear button |
| Map / pause / transport | HUD buttons | M / Escape / T | Select / Start / left shoulder |
| Menus | Click controls | Tab / Enter | D-pad focus, bottom face select, right face close; left / right adjusts a focused dropdown |

Settings includes keyboard and controller remapping, analog dead zones, steering sensitivity and assistance, camera preferences and bus dwell time. Controller vibration depends on browser and hardware support. Tests inject the Gamepad API; physical controllers require a separate hardware check.

## Passenger journeys

Walk to a departure station, choose a simulated service, wait for its bus to approach and stop, walk to the passenger door, board and choose a free seat. Full Journey follows a continuous road track with intermediate stops. Requesting the next stop acknowledges the request on arrival and opens the doors for the configured station dwell. Stay seated to continue automatically; cancel a pending request with its HUD button. Departure waits for closed doors. If a curbside exit is blocked, continue to another stop or use the explicit safe-checkpoint recovery control. Fast Journey has an explicit transition and records the skipped trip separately.

Imported corridors:

- Thrissur → Guruvayur
- Thrissur → Ernakulam
- Vyttila → Aluva
- Kozhikode → Kannur
- Kottayam → Ernakulam

These are **in-game services**, with no official route numbers or live timetables. Road geometry is OSM / OSRM derived. Rounded turning tracks are checked against imported building and water footprints, including sourced bridge crossings. The data does not certify legal bus access, road widths or surveyed bridge heights.

The terminal register contains 59 mapped facilities across all districts, including Thrissur KSRTC, Sakthan private stand, Guruvayur, Kunnamkulam, Vyttila, Ernakulam, Aluva, Thampanoor and East Fort. Some public facilities are also listed in the operator's published directory; that is not a live operational-status feed. Terminal structures use original representative layouts.

Local train shuttles offer passenger, window and exterior cameras on supported imported rail segments, with boarding and exiting at mapped stations. Statewide rail travel and airport transfers use explicit scene transitions. Airport transfers have a short cinematic; aircraft controls and continuous statewide flights are not implemented.

## Data and verification

- [Phase 9 bug fixes and verification](PHASE9_BUG_FIX_REPORT.md)
- [Generated artifact and source-cache policy](output/ARTIFACT_POLICY.md)
- [Phase 8 implementation and verification record](PHASE8_IMPLEMENTATION_REPORT.md)
- [Geographic validation](public/data/validation-report.json)
- [Bus route audit](public/data/bus-route-audit.json)
- [Fidelity register](public/data/fidelity-register.json)
- [Attribution and source limitations](public/data/NOTICE.md)
- [Historical baseline report](VERIFIED_IMPLEMENTATION_REPORT.md)

To rebuild bus driving tracks after reimporting source roads, run `npm run data:bus-tracks` and `npm run data:routing-corridors` before validation. The second command adds the five existing attributed driving corridors to the road-only state graph; it preserves original coordinates and all railway geometry. Incomplete railway extracts are reported as unavailable routes, with no road fallback. The reproducible terminal, corridor scenery and elevation importers are in `scripts/`; raw downloads are cached in `output/phase8-source/`. Original geographic coordinates remain intact alongside derived driving tracks.

Saves use version 2 with version 1 migration. An ongoing public-transport trip resumes on foot at its last safe checkpoint. Manual saves and 30-second autosaves include avatar, controls, camera, discoveries and bus history. Browser storage can be unavailable or cleared.
