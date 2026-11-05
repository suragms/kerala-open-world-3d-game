# Phase 9 stability implementation and verification

Date: 31 October 2026 (Asia/Kolkata). Inspected commit: `0fada2311bf2c6c6633ee6b47e676707aaf59766`. Development branch: `fix/phase9-stability-comprehensive-audit`.

This report describes confirmed defects and tested behavior. It does not certify that every possible game bug has been eliminated. No public deployment, push, merge or history rewrite was performed.

## Repository baseline

The initial working tree was clean. `npm ci`, TypeScript/production build, geographic validation and **52 unit tests** passed before implementation. The earlier report's count of 51 tests was outdated. The legacy browser runner used unpinned downloads, depended on an external server and did not reject returned `passed: false` assertions. Its completion reports were not accepted as proof of current gameplay.

Locked runtime/tool versions: React/React DOM 19.3.1, Three.js 0.180.0, Vite 7.3.7, TypeScript 5.9.3, tsx 4.23.15. Playwright 1.64.1 was added as an exact development dependency. Existing runtime dependencies were not upgraded. The lockfile's stale root package version was synchronized with package.json.

Verified data coverage:

| Register | Count and meaning |
|---|---|
| Districts | 14 sourced district boundaries |
| Original place register | 3,435 records |
| In-app enriched register | 3,490 records after mapped terminal enrichment |
| Imported local areas | 41; separate from place-register coverage |
| Continuous bus corridors | 5 |
| Elevation grids | 46: 41 local areas and 5 corridors |
| Bus facilities | 59 mapped records across all 14 districts; not necessarily 59 unique major terminals |
| Railway stations | 181 records; not 181 continuous playable railway journeys |
| International airports | 4: TRV/Thiruvananthapuram, CCJ/Malappuram, COK/Ernakulam, CNN/Kannur |

The existing coastal boundary tolerance and fidelity classifications are preserved. Geographic coordinates/footprints are sourced; buildings and terminal architecture remain Level C procedural interpretations. No photorealistic or exact-facade claim is made.

## Confirmed defects, corrections and evidence

Full severity, reproduction, expected/actual behavior, root cause and correction details are in [the prioritized inventory](PHASE9_BUG_INVENTORY.md).

| ID | Outcome | Correction and verification evidence |
|---|---|---|
| P9-01 | FIXED AND VERIFIED | Bus stop requests are acknowledged and reset on arrival; cancellable while pending. Configurable dwell expires, stop index advances once, and closed doors gate departure. Unit tests cover repeated/cancelled requests, remaining aboard, complete journeys, invalid transitions and final-state guards. Browser `bus-full` and `acceptance` request an intermediate stop and verify continued Full Journey travel. |
| P9-02 | FIXED AND VERIFIED | Exit probes use separate collision views, leaving live dynamic lists unchanged. Swept curbside candidates reject buildings, traffic, cliffs and world edges. Successful exit immediately refreshes the persistent bus collider. Geometry tests exercise rotations, slopes, blocked/repeated probes and another vehicle. An engine-level adversarial regression reproduces and prevents recovery into an inactive vehicle at the saved checkpoint; repeated recovery cannot duplicate journey records; browser journeys verify normal terminal exits and safe reloads. The original temporary box was overwritten by the next collider refresh; permanent persistence across frames was not established. |
| P9-03 | FIXED AND VERIFIED | Road and rail graphs are mode-specific, connect exact shared geographic vertices, retain supplied directional edges and reject missing/disconnected routes. No straight-line fallback is presented as a railway route. Tests cover both modes, disconnected extracts, invalid coordinates, parallel lines and the requested Kerala route pairs. |
| P9-04 | FIXED AND VERIFIED | Routing caches use weak network identity plus version and mode. State and local road Dijkstra searches use a stable binary min-heap. Regression tests change network objects, versions, directions and modes. |
| P9-05 | FIXED AND VERIFIED | Data requests and attribution-data links resolve against Vite BASE_URL. A separate production check builds beneath `/kerala-open-world/` and exercises avatar selection, terrain, save and Continue without root-level data access. |
| P9-06 | FIXED AND VERIFIED | Requests have a timeout and at most two attempts for recoverable failures. Rejected geography/terrain-index promises are evicted. JSON, tiles, transport data, elevation values and origins are checked; concurrent tile requests are shared and successful tiles use a bounded LRU. Mock-fetch tests cover offline failure, retry, invalid JSON/schema and recovery; browser fault injection exercises terrain and register failures. |
| P9-07 | PARTIALLY FIXED | Lookahead changes refresh independently of the current chunk. Distance/speed-based bus and vehicle prediction preloads upcoming scenery. Chunk construction and geometry baking yield across frames with a soft 4 ms normal / 8 ms startup budget and operation cap. Stale work is cancelled and scratch resources disposed. Ground stays present while scenery loads. Scheduling regressions and full/interdistrict travel pass. Individual geometry operations and garbage collection can still exceed the budget; this is not a hard real-time guarantee. |
| P9-08 | FIXED AND VERIFIED | Quick clicks retain their destination; releasing a held walk cancels cursor-following. Pointer cancellation, capture loss, visibility/focus changes and context transitions clear held state. Capture is released explicitly. Unit and live browser checks cover release, UI isolation and repeated scene disposal. |
| P9-09 | FIXED AND VERIFIED | Save validation rejects incomplete cameras, invalid identifiers and malformed transport checkpoints. Valid v1 saves migrate; corrupt v2 data can recover a validated backup or legacy save. Avatar appearance, controls and safe checkpoints restore; engine collision checks choose a safe spawn. Both-avatar, transport, corruption and live reload checks pass. In-progress vehicles/transport deliberately restore on foot at a safe checkpoint. |
| P9-10 | FIXED AND VERIFIED | Both success and failure paths ignore obsolete scene-load versions. Browser fault injection lets an older load fail after a newer destination has loaded and verifies the newer scene survives without an error overlay. |
| P9-11 | FIXED AND VERIFIED | Pinned cross-platform Node runner owns server startup/readiness and teardown, isolates workflows, rejects returned failed assertions and records runtime/network failures. Failure screenshots, HTML, JSON and traces are retained. Legacy PowerShell commands delegate to it. An intentional returned-failure fixture checks the harness's exit status. |
| P9-12 | FIXED AND VERIFIED | Saved duplicate mappings recover safely, arrow/WASD aliases remain reserved, and keyboard remapping shows a visible conflict warning. Unit and browser conflict checks pass. Existing keyboard and virtual-controller workflows remain covered. |
| P9-13 | FIXED AND VERIFIED | Background buses acknowledge the serviced stop segment so an expired dwell cannot immediately restart at the same stop. Relocation resets this state. A deterministic regression covers expiry, a later segment and another visit. |
| P9-14 | FIXED AND VERIFIED | Repeated transport vertices no longer divide tangent blending by zero. Empty routes reject explicitly and single-point probes return a finite pose. Unit regressions sample the problematic cases. |
| P9-15 | FIXED AND VERIFIED | Retry remembers the failed scene/booking transition and repeats it. Failed scene loading preserves the menu's paused state. Browser fault injection verifies bounded automatic attempts, manual recovery and paused input behind the map. |
| P9-16 | FIXED AND VERIFIED | Vite ignores generated HTML/build/report directories. Earlier server logs showed captures and subdirectory builds triggering reloads; final workflows use the isolated artifact directories with these watcher exclusions. |

WebGL context loss now freezes simulation and clears input until restoration. The browser's real WEBGL_lose_context extension exercised loss/restoration successfully. A React error boundary provides a reload recovery screen for rendering failures; the forced React-render-error branch was not exercised in browser testing. These are reliability safeguards, not claims that a particular graphics-driver defect was eliminated.

## Geographic routing

All original state-network features are retained. A reproducible offline augmentation adds the five existing attributed OSRM driving corridors to the road graph in their sourced direction. No invented road junctions or railway services were added. Future state-network imports preserve supplied one-way metadata.

Mapped-terminal road estimates pass for all five imported corridors: approximately 26.4 km Thrissur–Guruvayur, 76.9 km Thrissur–Ernakulam, 18.2 km Vyttila–Aluva, 92.7 km Kozhikode–Kannur and 67.1 km Kottayam–Ernakulam, including endpoint access. These are geometry-based game estimates, not operator timetables or bus-access certification.

The requested statewide railway pairs expose missing/disconnected imported rail coverage. They now return unavailable instead of a road-based or fabricated estimate. The local station shuttle remains playable and its boarding, movement, three cameras, requested station stop, checkpoint and exit workflow passes. Explicit scene transfers remain labeled simulations.

Run `npm run data:routing-corridors` after rebuilding geographic imports, then `npm run data:validate`. [Routing audit](output/playwright/phase9/routing-audit.json). Current geographic evidence is retained in [the validation result](output/playwright/phase9-final/validation-report.json) and [bus route audit](output/playwright/phase9-final/bus-route-audit.json).

## Automated and gameplay verification

The completed first full browser pass ran 17 workflows successfully. The final full suite passed **18 of 18 workflows**, including fault-injected loading recovery and movement in every district. After the final recovery-vehicle checks changed, the relevant stop/full-journey workflows and the unit/build checks were rerun successfully.

| Command | Recorded result |
|---|---|
| `npm ci` | Passed; one Windows retry was needed after closing a development server that held esbuild.exe open |
| `npm run build` | Passed: TypeScript and production bundles |
| `npm test` | 74 passed, 0 failed |
| `npm run data:validate` | Passed: all districts, terminal geography, sourced bus tracks and terrain sampling |
| `npm run test:browser` | 18/18 passed; additional targeted bus rechecks passed |
| `npm run test:production` | Passed: subdirectory build, male avatar, sourced terrain, save and Continue; no unexpected console/network failures |

The acceptance workflow selects a male avatar and Thrissur, walks using the mouse, runs, jumps, orbits the camera, enters a car, accelerates/brakes with the mouse, exits safely, opens the map, walks to the Thrissur terminal, boards and selects a seat. It uses Full Journey, requests an intermediate stop, remains aboard, verifies departure, reaches Guruvayur, exits, explores, saves, reloads and verifies avatar/position restoration. Long routes use the development-only deterministic clock to advance the normal integration; they do not use Fast Journey and are not real-time FPS measurements. Separate workflows cover arrow/WASD actions and an injected Gamepad API controller.

Each district is loaded with a valid spawn, sourced roads and terrain; keyboard movement is exercised without entering an obstacle. Extra local areas and all four airport scenes are also checked. Station/facility layouts are procedural, so these checks do not certify surveyed boarding-bay geometry at every named terminal.

Artifacts: [final browser results](output/playwright/phase9-final/suite-results.json), [loading fault injection](output/playwright/phase9-loading/loading-recovery.json), [WebGL and lifecycle check](output/playwright/phase9-final-focused/phase9.json). Unexpected console errors, page errors and failed network requests fail the runner. Deliberately injected 503 responses are narrowly declared and retained in the loading-recovery result.

## Performance comparison and limits

A matched baseline at the inspected commit and a Phase 9 run use full Chromium, medium quality, a 1440 × 900 viewport, 30-second moving urban/rural/hill samples and a 60-second active bus sample. Measurement uses actual requestAnimationFrame intervals; deterministic stepping is excluded from timed intervals. Hardware reports Intel Arc 130V through ANGLE/D3D11 and approximately 16 GB system memory. This is not a 4 GB laptop benchmark.

| Scene | Average FPS, before → after | 1% low FPS, before → after | P99 ms, before → after | Heap MB, before → after | Whole chunk CPU max ms, before → after | Phase 9 streaming-slice max ms |
|---|---:|---:|---:|---:|---:|---:|
| dense-urban | 60.02 → 60.03 | 59.32 → 58.93 | 16.8 → 16.9 | 205 → 214 | 33.5 → 24.3 | 4.4 |
| rural-coast | 60.03 → 60.02 | 58.81 → 59.12 | 16.9 → 16.9 | 87 → 106 | 11.1 → 12.9 | 6.9 |
| hill-terrain | 60.02 → 60.03 | 59.10 → 59.15 | 16.9 → 16.8 | 151 → 109 | 17.1 → 16.2 | 4.2 |
| active-bus | 59.98 → 60.01 | 56.03 → 59.29 | 16.9 → 16.8 | 161 → 142 | 24.5 → 23.8 | 8.2 |

All timed samples had **zero frames over 50 ms**, P95 **16.8 ms** and approximately 60 FPS. The 1% low is calculated from the slowest 1% of frame intervals. These display-capped samples do not establish a general FPS improvement. Heap differences are influenced by garbage collection and are not a leak verdict.

Sample-end render/resource counts matched the baseline in all four scenes:

| Scene | Draw calls | Triangles | GPU geometries | Textures |
|---|---:|---:|---:|---:|
| dense-urban | 388 | 200,309 | 341 | 6 |
| rural-coast | 179 | 186,736 | 305 | 5 |
| hill-terrain | 94 | 87,028 | 259 | 6 |
| active-bus | 308 | 128,040 | 863 | 12 |

The following measured costs are cumulative CPU milliseconds for each loaded Phase 9 world, including initialization and streaming during the sample; the renderer column is its largest CPU submission call, including startup. They are not per-frame averages or GPU timings:

| Phase 9 scene | Roads | Buildings | Vegetation | Bake / instancing | Terrain mesh | Collision indexing | Renderer CPU max |
|---|---:|---:|---:|---:|---:|---:|---:|
| dense-urban | 20.2 | 75.9 | 32.7 | 249.6 | 12.5 | 30.3 | 101.3 |
| rural-coast | 5.0 | 2.4 | 67.6 | 97.4 | 14.1 | 1.8 | 100.2 |
| hill-terrain | 15.3 | 5.3 | 113.6 | 76.9 | 14.7 | 1.9 | 88.4 |
| active-bus | 34.1 | 87.4 | 59.8 | 343.0 | 7.8 | 7.0 | 127.9 |

[Raw matched performance data](output/playwright/phase9-performance/comparison.json). The longer accelerated interdistrict run sampled a maximum **15.2 ms streaming slice**, **80.9 ms whole-chunk CPU cost** and **417 MB JS heap**. Sampled active chunks were 25, with a bound of 34 asserted during bus workflows. The soft work budget therefore reduces blocking but is not an absolute limit.

 Diagnostics now expose frame percentiles, 1% low FPS, long frames, JS heap, geometry/texture counts, draw calls, triangles, chunk CPU time, streaming-slice cost, terrain work, collision indexing, feature construction/baking and renderer CPU submission time. GPU memory, GPU execution time and isolated garbage-collection cost are not established by those counters.

The full/interdistrict checks also sample resource counts during much longer accelerated journeys. Whole-chunk CPU time is distinct from per-frame scheduling cost. A bounded chunk count and disposed geometry are not proof of a leak-free application; sampled heaps and driver resources require longer hardware soak testing.

## Files and artifact handling

Core changes span App/types, geography/loading, bus, navigation/heap, exits, input, saves, world/assets, traffic/dwell, terrain, engine, error boundary and game/settings UI. Tests add deterministic Phase 9, streaming, background-stop and input regressions; browser workflows add acceptance, fault injection, lifecycle/context loss and longer performance sampling. Tooling changes cover package/lockfile, Vite, the cross-platform runner, production check, route augmentation/audit and GitHub Actions. README and the inventory document the behavior.

The [artifact policy](output/ARTIFACT_POLICY.md) inventories existing tracked outputs. Approximately 203 MB of raw geographic source responses and historical screenshots remain preserved. New captures/reports are ignored and CI uploads diagnostics with 14-day retention. No source-cache archive was deleted or silently moved to an unavailable external service. npm audit reports zero known vulnerabilities in this installation. The complete file and commit list is recorded in [the change manifest](output/playwright/phase9-final/change-manifest.json).

## Screenshots

![Full Journey arrival at Guruvayur](output/playwright/phase9-final/phase8-full-guruvayur-arrival.png)

![Requested-stop acknowledgement](output/playwright/phase9-final/phase9-request-acknowledged.png)

![Representative hill district after movement](output/playwright/phase9-final/district-idukki.png)

These are local generated artifacts, excluded from source commits. CI archives new verification captures separately.

## Remaining issues and release assessment

- **PARTIALLY FIXED:** chunk work is scheduled and cancellation/disposal is tested, but expensive indivisible operations and garbage collection can still cause long frames. Adaptive resolution, worker-based data preparation and a full low-memory hardware soak are not certified by this work.
- **NOT FIXED:** missing statewide railway connectivity in the imported source dataset. The router now rejects unsupported paths accurately; local shuttles and explicitly simulated scene transfers are preserved.
- **Hardware testing remains unverified:** controller API behavior passes virtual-controller tests; no physical controller/vibration test was performed.
- GPU memory, isolated GC pauses, low-memory laptop performance and prolonged multi-hour play are unverified. Normal bus exits are verified; forced recovery at every possible blocked real terminal is not certified.
- The corridor's minimap retains its scene-origin town label during long travel; current district/coordinates and bus destination are available in the main HUD/map. Procedural architecture and terrain-source resolution remain fidelity limits.
- CI configuration is implemented and its commands are exercised locally; a remote GitHub Actions run was not triggered or claimed.

Release assessment remains a tested exploration beta, with substantially improved transport/input/loading/save stability. Broad production certification is withheld pending the stated hardware, performance and geographic-coverage work. All recorded gameplay/build/data checks pass. The deliberate runner-guard failure is expected and separately verified to exit with code 1; it is not a gameplay failure. [Harness guard evidence](output/playwright/phase9-runner-guard/guard-verification.json).
