# Kerala Open World — Phase 10 implementation

Repository inspected: `66a1347c609ef70d2a231f8146c715a8bacbe72a`. Development branch: `codex/phase10-kerala-realism`. Work was performed locally on 1 November 2026. No merge or deployment was performed.

This is an incremental improvement to the existing exploration beta. Geographic coverage remains 14 districts, 3,435 raw place records (3,490 enriched in-app entries), 41 local areas, five supported continuous bus corridors, 59 terminal records, 181 railway station records and four airports. A mapped record does not imply a fully modeled destination. No additional continuous corridor or Level A reconstruction is claimed.

## Phase 9 prerequisite

The Phase 9 code was inspected and exercised before implementation. The clean baseline passed `npm ci`, production compilation, **74 unit tests**, geographic validation and **all 18 existing browser workflows**. These exercised stop-request acknowledgement and departure, separate road/rail routing, safe bus exits, predictive streaming, asset-loading paths, mouse lifecycle and save restoration. Baseline logs are under `output/phase10-baseline-*.log`; browser results are in `output/playwright/phase9-phase10-baseline/`.

## Controls, vehicles and transport

- Ground double-click running now requires two nearby clicks. Selecting the destination precedes the run action. Chorded right-drag cancels held following reliably, including explicit right-button-down events.
- Stop stays available throughout on-foot Mouse movement mode, including immediately after a held movement releases.
- Captured Forward/Reverse HUD pedals continue to receive horizontal steering movement through the shared input layer. Keyboard throttle can take over while Mouse movement remains selected. Input contexts, blur, cancellation and disposal retain their clearing behavior.
- Acceleration uses an analytical drag step. Braking overrides acceleration; selecting the opposite direction first brakes the current motion. Terrain pitch/roll and braking attitude are damped. These remain kinematic vehicle controls, not a tire/contact-force simulation.
- Bus HUD controls use authoritative attachment state during door opening. The Board bus button explicitly targets the bus, and a ready passenger door takes priority for untargeted keyboard/controller interaction.
- Bus braking considers stopping distance and actual upcoming curved vehicle footprints. A nearby vehicle outside that path no longer creates a false obstruction. Signal cycles are deterministic and shared with ambient traffic.
- Passenger camera offsets ease in local vehicle space. The coach trim was moved above the window opening; side-window ray tests cover all five passenger-bus types. Existing walking, driving, bus and local-train camera modes are preserved.
- Validated locality names are saved and restored, including transport checkpoints. The minimap uses the current locality rather than its corridor's origin town.
- Terminal circulation and waiting-line markings were added to the existing bays, shelters, benches, shops, information boards and lights. They remain Level C facility layouts at mapped locations.

## Geography and visual changes

All geographic datasets and original coordinates are preserved. The five existing continuous bus routes remain the supported physical travel network; Explore, airport transfers and unsupported statewide rail transfers remain explicit scene transitions.

`regional.ts` supplies fourteen district profiles for walls, roof colours and vegetation. The profiles affect both streamed scenery and arrival surroundings. Source crop/tree tags override procedural defaults where available. Tea, rubber, banana, broadleaf and coconut-style plantings are art direction, not surveyed plantation boundaries. Low quality reduces the arrival planting count as well as the existing streaming and population budgets.

Building walls retain eligible source polygons. Facade windows, surrounds, shades and shopfronts follow actual polygon edges, including rotated and concave footprints. Near-rectangular footprints receive aligned pitched roofs; other eligible footprints retain polygon-shaped roof faces. Detail counts are bounded by quality. Source height tags are retained when valid. The existing size/coverage limits still apply, so this does not recreate every building.

Three reference-informed Level C landmark details were added: cardinal gateway silhouettes at Vadakkunnathan, a granite-colour moat/entrance composition at Palakkad Fort, and an observation-tower/steps composition at Bekal. Major landmark collision envelopes better cover their approximate solid models. Architectural references, scope and limitations are documented in [the visual reference record](PHASE10_VISUAL_REFERENCES.md). None is an exact reconstruction.

## Traffic and pedestrians

Ambient traffic uses bounded lane motion, progressive speed changes, headway, source-node continuation, signals, bus-stop dwell, crossing awareness and swept oriented footprints. Vehicles stop at disconnected ends instead of wrapping to an unrelated first point. Cars, motorcycles, scooters, autos and buses are retained; truck, delivery-van and tourist-van silhouettes are added.

Explicitly derived OSRM duplicates receive a maximum 16 cm coordinate-precision allowance only when their names and layers match. Independent nearby ways remain disconnected. Static collision probes cover building/water footprints and blocked terrain; dynamic probes include other traffic and the player vehicle.

Full Journey has a deliberate simplification: its checked track receives a conservative background-traffic priority envelope. Samples every two metres reserve a square extending seven metres in each direction, including coach rotation clearance at bends. Background traffic waits outside it; the reservation is released on exit. This avoids deadlocks without moving the passenger bus through other vehicles, inventing a bypass, changing its sourced track or using Fast Journey. It can reduce ambient traffic near the bus and is not a complete urban right-of-way solver.

Pedestrians are spawned only after their complete walking segment is checked; free endpoints alone do not suffice. Movement commits only along clear swept segments, waits for approaching vehicles, and uses actual motion for animation. Terminal walkers move at bounded speed. Their queue, sitting and bus-interior boarding/alighting animations are lightweight simulations; they do not represent persistent individually ticketed passengers across the entire network.

Ambient vehicles can still wait indefinitely at genuinely blocked or disconnected extracts. Offscreen population recycling is retained: vehicles beyond 550 m can be placed in checked source-lane slots over 220 m away. Distant appearance changes remain possible; this is not a persistent statewide vehicle population.

## Map, weather and streaming

The map exposes Suggested, Road, Rail and Air transfer modes. Gold previews follow the selected imported network path, including its bends. Dashed endpoint-access links are approximate. Rail uses rail geometry or reports unavailable coverage; air reports straight-line simulated transfer distance and has no fabricated road preview. Routing work is memoized by actual coordinates, selection, network and mode.

Existing sunny, cloudy, rainy, monsoon and foggy presets, four time presets, ambient sound and night lighting remain available. Rain draw counts now depend on quality and weather intensity. This is not a live-weather or astronomical simulation.

Streaming preserves predictive route lookahead and bounded chunk residency. Geometry baking yields between same-material merge batches targeting 60,000 vertices, retaining cancellation/disposal behavior. Collision probes reject distant bodies and polygon bounds before expensive overlap checks. The scenery progress indicator reports the current wanted-chunk fraction.

Optional adaptive resolution responds to sustained slow frame samples, reduces to a minimum 65% scale and recovers gradually. It can be disabled in World & display settings. It does not guarantee a frame rate or replace hardware testing.

## Confirmed bugs and regressions

[The findings ledger](PHASE10_FINDINGS.md) records the concrete triggers and corrections: attachment during opening, captured-pedal steering, device switching, pedestrian spawning/sweeps, traffic end wrapping, footprint-aligned facades, locality restoration, large geometry merges, bus braking distance, ambiguous boarding, degenerate road-furniture geometry, opaque coach windows, curved-path obstruction checks, derived-coordinate precision and the disappearing Stop control.

The zero-length road case was reproduced near Guruvayur: division by a zero tangent produced invalid lamp vertices. Furniture now skips that edge while retaining the source data. A full source-building geometry scan and focused road-furniture/window tests supplement the gameplay checks. Intermediate failed runs remain in the local diagnostics; they are not counted as successful verification.

## Verification results

| Check | Result |
|---|---|
| Original dependency installation | `npm ci` passed before implementation; dependency files unchanged |
| Final compilation | `npm run build` passed |
| Final units | **101 passed, 0 failed** |
| Geography | `npm run data:validate` passed; five routes audited, with three sourced bridge/water-crossing flags retained |
| Browser coverage | **20 distinct workflows passed** across focused and regression runs; affected cases rerun after the final fixes |
| Production subdirectory | Passed: assets, terrain, male avatar, save and Continue under `/kerala-open-world/` |

Browser coverage comprises controls, mouse driving, virtual gamepad, fourteen districts, transport, settings, complete character movement, movement edges, performance smoke, final review, Phase 8 regression, requested bus stop, rail, Full Journey, interdistrict journey, Phase 9 lifecycle, original acceptance, loading recovery, Phase 10 controls/map and the female demonstration. The intermediate character run exposed the disappearing Stop control; its corrected full workflow passed in 80.2 seconds. The final female demonstration passed in 82.7 seconds. Raw results are linked in the verification summary.


Mandatory A uses one female-avatar session: Thrissur, mouse walking, running/jumping, car entry and mouse driving, exit, map, walking to Thrissur station, boarding, seat selection, Full Journey to Guruvayur, requested intermediate stop, continued seated departure, arrival, exit, renewed mouse walking, save and reload. It explicitly inspects the attached door-opening state and restored locality. An explicit arrival-recovery control is used before the parked-car portion.

Mandatory B covers the 76.81 km derived Thrissur–Ernakulam track, both district identities, streamed scenery, traffic diagnostics, camera changes, safe exit and checkpoint reload. Camera-clear probes were true in its four captured samples; arrival had 25 chunks. Mandatory A's derived Guruvayur track is 26.28 km.

Long route checks advance the normal physical simulation in bounded 1/30-second steps through the development-only verification hook. They assert continuity, Full mode, stop behavior and at most 34 loaded chunks. They do **not** measure real-time FPS. The real-frame benchmark below uses requestAnimationFrame intervals with no deterministic stepping during timed windows.

Mandatory C visits one representative local scene per district through explicit Explore transitions, checks geographic identity, roads/source features, movement without entering an obstacle, terrain/camera clearance and available facilities, and captures each scene. Some representative scenes have no nearby terminal or rail alignment; this is recorded as actual availability, not invented transport coverage. District smoke FPS includes startup and is not a hardware benchmark.

| District | Source roads | Source buildings | Nearby terminals in representative scene |
|---|---:|---:|---:|
| thiruvananthapuram | 1451 | 13957 | 3 |
| kollam | 572 | 3455 | 1 |
| pathanamthitta | 181 | 595 | 0 |
| alappuzha | 419 | 4196 | 2 |
| kottayam | 126 | 211 | 0 |
| idukki | 382 | 292 | 0 |
| ernakulam | 631 | 4932 | 0 |
| thrissur | 1107 | 4686 | 3 |
| palakkad | 711 | 6100 | 4 |
| malappuram | 293 | 2914 | 2 |
| kozhikode | 406 | 667 | 0 |
| wayanad | 50 | 0 | 0 |
| kannur | 268 | 2109 | 2 |
| kasaragod | 92 | 584 | 0 |

The corridor audit retains one water-crossing flag on Thrissur–Ernakulam and two on Kottayam–Ernakulam, each with a sourced bridge tag. These are inspection flags, not survey certification; the raw audit preserves their source links.

Source building coverage is zero in the representative Wayanad extract; its hero/plantation scenery is procedural. Nearby-terminal counts describe the selected local scene, not the entire district. All fourteen movement/geographic checks passed.

## Performance measurements

Matched baseline and Phase 10 runs used full Chromium, medium quality, 1440 × 900, fixed resolution scale 1.0, 30-second urban/rural/hill samples and a 60-second live bus sample. Adaptive resolution was disabled for the comparison. Hardware reports Intel Arc 130V through ANGLE/D3D11 and **15.58 GiB system RAM** (approximately 16 GB). This is not a 4 GB laptop test. Only one matched run per version is reported.

| Scene | Average FPS, before → after | 1% low FPS | P95 ms | P99 ms | Frames over 50 ms |
|---|---:|---:|---:|---:|---:|
| dense-urban | 60.04 → 60.04 | 59.23 → 59.06 | 16.80 → 16.80 | 16.80 → 16.80 | 0 → 0 |
| rural-coast | 60.03 → 60.02 | 59.34 → 58.86 | 16.80 → 16.80 | 16.80 → 16.90 | 0 → 0 |
| hill-terrain | 60.02 → 60.02 | 59.04 → 59.15 | 16.80 → 16.80 | 16.80 → 16.80 | 0 → 0 |
| active-bus | 60.01 → 60.02 | 59.30 → 59.10 | 16.80 → 16.80 | 16.80 → 16.80 | 0 → 0 |

The samples are display-capped near 60 FPS and show no general throughput improvement. Added facade/vegetation detail increases several triangle and heap counts; workload and bus position can differ as the simulation changes. Zero timed frames over 50 ms does not certify startup, long journeys or low-memory hardware.

| Scene | Draw calls, before → after | Triangles | JS heap MiB | Geometries | Textures |
|---|---:|---:|---:|---:|---:|
| dense-urban | 388 → 390 | 200,309 → 300,452 | 218 → 295 | 340 → 326 | 6 → 6 |
| rural-coast | 179 → 208 | 186,736 → 155,037 | 124 → 131 | 305 → 238 | 5 → 4 |
| hill-terrain | 94 → 98 | 87,028 → 95,355 | 89 → 140 | 259 → 267 | 6 → 6 |
| active-bus | 308 → 321 | 128,040 → 190,317 | 163 → 185 | 863 → 785 | 12 → 13 |

| Scene | Maximum streaming slice ms, before → after | Maximum whole-chunk CPU ms | Mean whole-chunk CPU ms |
|---|---:|---:|---:|
| dense-urban | 5.00 → 10.60 | 20.80 → 51.00 | 13.90 → 29.70 |
| rural-coast | 7.00 → 8.00 | 9.30 → 13.60 | 4.35 → 5.47 |
| hill-terrain | 7.50 → 8.00 | 11.40 → 25.20 | 5.83 → 7.99 |
| active-bus | 4.20 → 7.60 | 26.30 → 35.10 | 12.03 → 20.47 |

Streaming maxima include initialization and work outside the timed window. **Measured slice maxima did not improve**; the Phase 10 maximum here is 10.6 ms despite a soft 4 ms scheduling budget. Bounded merges and adaptive resolution are implemented, but the richer scene is not a demonstrated CPU or memory reduction. Heap samples depend on garbage collection; texture counts are not texture-memory bytes. GPU memory, GPU execution time and isolated GC pauses were not measured.

The accelerated interdistrict check sampled up to 478 MiB JS heap and enforced the 34-chunk bound. Those samples are separate from the real-frame benchmark. Source snapshots, timing distributions, long-task counts, renderer submission maxima and stage costs are retained in [raw performance evidence](output/playwright/phase10-performance/comparison.json) and the two `performance-long.json` artifacts.

## Screenshots and artifacts

- [Female Full Journey arrival](output/playwright/phase10-focused-final/phase10-female-guruvayur-arrival.png)
- [Coach window scenery after the trim correction](output/playwright/phase10-focused-final/phase8-interdistrict-120.png)
- [Interdistrict arrival](output/playwright/phase10-focused-final/phase8-interdistrict-arrival.png)
- [Imported road route preview](output/playwright/phase10-last-fixes/phase10-network-route.png)
- [Monsoon/night settings](output/playwright/phase10-last-fixes/phase10-monsoon-night.png)
- [Fourteen district captures](output/playwright/phase10-regression-final/districts.json)

[Compact verification summary](output/phase10-verification-summary.json) lists the successful workflow artifacts, baseline results and geographic audit counts. Fresh validation outputs are retained in `output/playwright/phase10-validation/`; timestamp-only changes to runtime audit JSON were restored, leaving `public/data/` unchanged.

Raw screenshots, failure traces, logs and per-run JSON are local generated artifacts in ignored Phase 10 directories. Historical Phase 8/9 evidence and geographic source caches are preserved. CI is configured to retain new diagnostics for 14 days; no remote CI execution is claimed. See [artifact policy](output/ARTIFACT_POLICY.md).

The detached temporary checkout `../phase10-perf-baseline` remains locally. Automatic approval review rejected removal of its shared dependency junction with “blocked by policy,” so cleanup was left incomplete. The project dependencies and copied benchmark evidence remain intact.

## Modified files

The verification summary contains the complete sorted change manifest and hashes of changed runtime files.

| Area | Files |
|---|---|
| Input, physics, integration | `src/game/input.ts`, `vehicle.ts`, `engine.ts`, `save.ts`, `src/types.ts` |
| Bus and pedestrians | `src/game/bus.ts`, `busModels.ts`, `traffic.ts`, `trafficLogic.ts`, `terminals.ts` |
| Scenery and streaming | `src/game/world.ts`, `assets.ts`, `regional.ts`, `buildings.ts`, `landmarks.ts`, `performance.ts` |
| Interface | `src/ui/GameView.tsx`, `Map.tsx`, `WorldMapPanel.tsx`, `SettingsPanel.tsx`, `src/styles.css` |
| New units | `tests/phase10.test.ts`, `phase10-geometry.test.ts`, `phase10-buildings.test.ts`, `phase10-rendering.test.ts`, `traffic-logic.test.ts`, `traffic-manager.test.ts` |
| Existing unit regressions | `tests/input.test.ts`, `exit-recovery.test.ts` |
| Browser verification | New `tests/browser-phase10.js` and `browser-phase10-female.js`; enhanced district, requested-stop, interdistrict and long-performance workflows |
| Tooling | `scripts/browser-suite.mjs`, `production-check.mjs`, `.github/workflows/ci.yml`, `.gitignore` |
| Documentation/evidence | README, this report, findings, visual references, artifact policy and compact verification summary |

The original runtime commit is used for the comparison. Only the matched benchmark fixture is copied into the temporary baseline checkout; its runtime source remains unchanged. The fixture uses the same control flow in both runs, disables adaptive resolution when available, and can explicitly click the bus object if the original generic boarding button chooses a nearby NPC.

## Limitations and release readiness

- This remains a stylized procedural exploration beta. Geographic positions/eligible footprints are distinct from architectural fidelity; no Level A assets, photorealistic statewide reconstruction or surveyed plantation placement is claimed.
- Coverage remains 41 local areas and five continuous bus corridors. Statewide rail connectivity, continuous flight and arbitrary statewide road journeys are not added. Scenes rebase to local geographic origins; a new dynamic floating-origin system was not introduced.
- Traffic priority is conservative during Full Journey. General blocked-road rerouting, fully negotiated junctions, persistent statewide populations and physics-based vehicle contact are incomplete.
- NPC boarding/queues are visual simulation, not a complete persistent passenger economy. Free walking inside moving public transport remains unavailable.
- Arrival composition is uneven: nearby imported walls can dominate Palakkad's default view, and decorative vegetation can overlap an NPC path. Camera-clear probes do not establish an unobstructed landmark view.
- Coarse terrain and incomplete OSM geometry limit bridges, road widths, collision coverage and building detail. Tests verify the stated cases rather than certify every possible route, spawn or camera angle.
- A physical controller and vibration were not tested; automated controller coverage uses the virtual Gamepad API. Approximately 4 GB hardware, GPU memory bytes, multi-hour play and long hardware soak testing remain unverified.
- Geometry merging is more incremental, but individual construction work, initialization, rendering and garbage collection can exceed a soft frame budget. Resource counts and JS heap samples are not proof of leak-free execution.

Release assessment: a verified local development candidate for the existing exploration beta. The 101 units, 20 browser workflows, matched real-frame samples and production subdirectory smoke check pass. Architectural realism, general traffic negotiation and low-memory hardware certification remain limited as described above. No merge or deployment was performed.
