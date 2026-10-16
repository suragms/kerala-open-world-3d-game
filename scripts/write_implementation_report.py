"""Assemble the delivery report from the checked data and actual browser result files."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))
regions=read('public/data/regions.json');extras=read('public/data/extra-areas.json');validation=read('public/data/validation-report.json')
start=read('output/playwright/check-start.json');controls=read('output/playwright/check-controls.json');transport=read('output/playwright/check-transport.json');settings=read('output/playwright/check-settings.json');districts=read('output/playwright/check-districts.json');performance=read('output/playwright/check-performance.json');review=read('output/playwright/check-final-review.json')
assert all(r['passed'] for r in controls['results']+settings['results'])
assert not start['errors'] and not transport['errors'] and not districts['errors']
assert len(districts['districts'])==14 and len(transport['areas'])==13
district_rows='\n'.join(f"| {r['name']} | {r['town']} · {r['landmark']} | {r['lat']:.5f}, {r['lon']:.5f} | [source]({r['source']}) |" for r in regions)
extra_rows='\n'.join(f"| {p['name']} | {next(r['name'] for r in regions if r['id']==p['district'])} | {p['theme']} | [source]({p.get('terminalSource',p['source'])}) |" for p in extras)
benchmark_rows='\n'.join(f"| {p['quality'].title()} | {p['meanFPS']:.1f} | {p['p95FrameMilliseconds']:.1f} ms | {p['snapshot']['chunks']} | {p['snapshot']['calls']} | {p['snapshot']['triangles']:,} | {p['snapshot']['traffic']} |" for p in [performance['medium'],performance['low']])
report=f'''# Kerala Open World — verified implementation report

Verified on **16 October 2026** in an actual desktop browser. Local app: **http://127.0.0.1:5173/**.

## Delivery status

The delivered application is a functioning **exploration prototype**, with the requested core character/controls/vehicle/map/travel/save loop. **The full AAA, photorealistic, continuously traversable statewide specification is not complete.** The appearance is stylized procedural 3D and does not meet that visual-fidelity target. This report distinguishes actual playable coverage from mapped locations and future work.

There are **27 playable local areas**: one sourced landmark area in each of Kerala's **14 districts**, plus **13** airport, railway and Kochi areas. The register contains **{validation['totalPlaces']:,} sourced place records**, including four airports and **{validation['stations']} station records**. Mapped records are not claims of complete 3D scenes.

The project folder was empty at inspection. A new modular React + TypeScript + Vite + Three.js application was created, dependencies installed, the server run, the production build compiled, and browser tests executed. No prior project code was replaced.

## Implemented and verified

| System | Actual implementation | Verification |
|---|---|---|
| Character entry | Mandatory explicit male/female choice, rotating 3D preview, hairstyle and skin/top/trouser/footwear palettes | Both choices and customization exercised in browser; Continue disabled before selection |
| On foot | Camera-relative arrow keys and WASD, smooth acceleration/turning, running, ballistic jumping and procedural limb animation | Walking, running, jumping/landing and camera orbit exercised |
| Mouse movement | Ground ray picking, visible destination ring, A* obstacle avoidance, nearest valid/reachable targets, hold-to-update target, on-screen Jump/Interact | Actual canvas click movement and pathfinding regression tests passed |
| Collisions | Spatially indexed footprint polygons, swept movement, parked-vehicle circles, lake/coast/river restrictions and sourced-bridge exceptions | Thin-wall tunnelling, blocked targets, vehicle clearances, bridge crossings and safe arrivals tested |
| Driving | Hatchback, Jeep, scooter, motorcycle and auto rickshaw models; shared kinematic controller, enter/exit, acceleration, reverse/braking, speed-dependent steering, drag, handbrake, animated wheels/brake lights and speedometer | Hatchback entry/acceleration/steering/braking/exit tested with keys; mouse steering/acceleration/exit also tested |
| Map / GPS | District polygons/names, searchable real places, current/destination markers, airport symbols, sourced highway overview and local road route preview | Search for Calicut airport returns Malappuram; current local navigation, map key and all district travel tested |
| Streaming | 160 m chunks; 25 active in Medium versus 9 in Low; distant chunk disposal; material batching; instanced palm fronds; three-tile geographic cache; local coordinate origin per area | All 27 scenes loaded; quality switching and active chunk counts checked |
| Traffic / NPCs | Left-hand lane offsets on source roads, basic spacing/stops, pooled/recycled vehicles, pedestrian paths and local guide dialogue | Live audit found zero off-road/wrong-side traffic, zero blocked visible NPCs and observed moving NPCs; guide conversation exercised |
| Rail / metro | Simplified coaches follow imported rail alignments, with elevated Kochi metro segments only where source tags identify them | Four station areas visited; Kaloor metro train checked against source tracks with zero off-track coaches |
| Airports | Four sourced airport/terminal areas, runway/taxiway geometry where available, original terminal/tower interpretations and a simple runway/takeoff aircraft loop | All four airport scenes loaded and each contains a sourced runway centreline |
| Travel | Explicit scene transitions: 14 district bus destinations, four railway arrival areas and four airports | All destination lists and 13 extra area arrivals checked; no invalid arrival positions |
| Weather / time | Sunny/cloudy/rainy/monsoon/foggy settings; morning/afternoon/evening/night; rain particles, wet road material and night light pool | Rain/night changes, settings persistence and reset exercised |
| Audio | Original synthesized bird/wind/rain and vehicle-engine audio; independent master/ambience/engine controls | Controls implemented and settings persisted; no acoustic-fidelity claim |
| Progress / saves | Manual and 30-second autosave; position, avatar, area, visited districts, discoveries and walked/driven distance; district achievement badges | Reload/Continue restores area and position; pause stops simulation; recovery point exercised |
| UI | Responsive menus/HUD/map/settings/travel panels, focus indicators, dialog keyboard containment and labeled controls | 1440×900 and 390×844 checks, including a long stadium name |

Five vehicle types share the working controller; they do not yet have independently tuned real-world physics. Buses in traffic are not player-drivable buses. Boarding is a travel interface rather than a physical seated passenger simulation.

## District coverage

Every row below has a locally playable scene and source-linked landmark coordinate. Rendered landmark shape, scale, orientation, facade detail and surrounding props are artist interpretations.

| District | Playable arrival / principal landmark | Latitude, longitude | Coordinate source |
|---|---|---|---|
{district_rows}

### Additional areas

| Area | District | Scene type | Source |
|---|---|---|---|
{extra_rows}

The Kundannoor scene is the sourced **Kundannoor Bridge** area. It is not a survey recreation of Kundannoor Junction or its complete flyover system. Most other named towns/landmarks in the original brief still lack detailed scenes. The UI distinguishes a mapped place from an available scene and offers travel to its district hub when needed.

## Geographic data, licensing and accuracy

- **OpenStreetMap**, downloaded via Overpass and small-area OSM API requests, supplies roads, footprints, waterways, rail, towns and transport records. Per-place source URLs and feature identities are retained. The derived database is distributed in `public/data/` under **ODbL 1.0**, with visible in-game attribution and [license/source notice](public/data/NOTICE.md).
- **geoBoundaries IND ADM2**, ID `IND-ADM2-76128533`, supplies all fourteen district polygons. The source is Pathways Data Pvt. Ltd. / lgdirectory.gov.in; the boundary year represented is **2021**, and its supplied license is ODbL 1.0. Exact metadata is in [boundary-source.json](public/data/boundary-source.json).
- **Kerala Tourism** supplies the explicitly attributed factual Aranmula temple coordinate. Official Tourism references also informed broad architectural/geographic descriptions; no Tourism images or copied models were used.
- The statewide overview includes **3,817 sourced highway features** matching the selected NH references. **229 rail/metro line features** come from imported local areas. The separate statewide rail query failed, so no complete statewide railway geometry is claimed.
- The 27 extracts contain **93,055 geographic feature records**, including **14,233 road features** and **77,107 building footprint records**. These totals include overlaps between nearby extracts. They are **not unique statewide counts or counts of rendered assets**. Only a bounded nearby subset is rendered.
- The validation step checks source landmark coordinates against district polygons, ensures the four airport assignments, excludes operational-station claims in Idukki/Wayanad, and verifies available extra-area files. Calicut/CCJ is correctly assigned to **Malappuram**.
- The generalized coastline puts the sourced Kollam Beach point **57 m outside** its district polygon. The validation register records a known-source coastal exception with a 250 m maximum tolerance; it does not move the coordinate or silently reassign arbitrary out-of-state points.
- Local horizontal units are approximately metres using a regional equirectangular projection; districts retain their geographic relationship on the state map. Changing areas rebases the origin. Long-distance scene travel is explicit, not map compression.
- **No licensed DEM was integrated.** Local hills/heights, distant mountain silhouettes, vegetation, road widths without source widths, building heights without tags and landmark meshes are approximate. Terrain elevation, coastline/water meshing and bridge/flyover vertical profiles are not survey-accurate. Coast rendering is sampled on an approximately 32 m mesh; collision shoreline tests use source segments.
- The supplied orientation point (10.4787416 N, 76.0739995 E) was not treated as a statewide dataset. No Google Maps tiles, satellite imagery, Street View or geometry, and no GTA proprietary content, were imported.

See [regions.json](public/data/regions.json), [extra-areas.json](public/data/extra-areas.json), [places.json](public/data/places.json) and [validation-report.json](public/data/validation-report.json) for source, district and approximation records.

## Test evidence

The tests operate a real headed Chromium browser using Playwright CLI; they do not replace Three.js with a mock. Browser result JSON and screenshots are retained in `output/playwright/`.

| Check | Result | Evidence |
|---|---|---|
| TypeScript / production bundle | Passed | [build.log](output/build.log) |
| Geography validation | Passed; one documented coastal exception | [geography-check.log](output/geography-check.log) |
| Geography / physics / navigation regressions | **11 passed, 0 failed** | [system-tests.log](output/system-tests.log) |
| Character/start menu | Both avatars, palette/hair, explicit selection, 14 district options | [check-start.json](output/playwright/check-start.json) |
| Input/driving/NPC/save/pause | **{len(controls['results'])} passed checks** | [check-controls.json](output/playwright/check-controls.json) |
| Transport / extra scenes | **13/13 loaded**, four airport services, four railway services, fourteen bus destinations; no critical errors | [check-transport.json](output/playwright/check-transport.json) |
| Weather/remapping/mouse driving/Continue/responsiveness | **{len(settings['results'])} passed checks** | [check-settings.json](output/playwright/check-settings.json) |
| All district scenes | **14/14 loaded**, valid unobstructed arrival positions, source roads present; no critical errors | [check-districts.json](output/playwright/check-districts.json) |
| Camera / live simulation / map availability | Passed: moving visible NPCs; zero traffic road/lane violations or blocked visible NPCs; zero off-track coaches in tested scene | [check-final-review.json](output/playwright/check-final-review.json) |

During development the tests found and fixed swept-collision tunnelling, incompatible static geometry batching, reversed roof faces, submerged roads, premature mouse arrival, coastline overfill, retained WebGL contexts, incorrect map availability text, an obstructed stadium camera arrival and negative-coordinate NPC pause timing. Development-reload messages and earlier failures can remain in the raw CLI console history; the final check files above report the final runs.

The suite does not assert the correctness of every imported feature, every possible walking/driving route, every avatar palette combination or every religious access restriction. Those need broader production QA and authoritative data review.

## Measured performance

**Desktop Chromium 155 on Windows, 1440×900**. Dense Thiruvananthapuram arrival scene; two-second warm-up followed by **180 actual requestAnimationFrame samples per preset**. GPU model/RAM were not characterized. These are short stationary-scene measurements on this machine, not guarantees for other GPUs or a 4 GB RAM device.

| Preset | Mean FPS | 95th-percentile frame | Active chunks | Draw calls | Triangles | Traffic pool |
|---|---:|---:|---:|---:|---:|---:|
{benchmark_rows}

Both sampled presets had **zero frames over 50 ms** in the benchmark window. Rapid scene-switch captures sometimes showed a lower rolling FPS while source processing and chunk creation settled. Streaming while driving, long-session memory stability, High/Ultra and multiple hardware tiers have not been exhaustively benchmarked. High and Ultra currently share most settings. [Raw benchmark](output/playwright/check-performance.json).

The bundled geographic files are roughly **28 MB**; they are fetched per area rather than all loaded into RAM. Main app plus Three.js compressed JavaScript is roughly **250 kB gzip**, excluding geographic data and optional fonts.

## Remaining features and known limitations

1. **Photorealism is unfinished.** Characters, faces, clothing, cars, vegetation, buildings and landmarks are stylized procedural meshes. There are no production scanned assets, high-detail GLB characters, mocap, ambient occlusion/postprocessing pipeline or photogrammetric landmark reconstructions.
2. **The state is not continuously walkable.** Coverage is 27 bounded local areas. Most requested destinations and individual buildings are mapped-only or not yet imported. A complete statewide DEM, waterways, rail network, locality/taluk hierarchy and seamless regional terrain remain production work.
3. **Vehicle physics is simplified.** Horizontal swept polygon/circle collisions and kinematic steering are implemented. Rapier-style rigid bodies, suspension/contact physics, realistic motorcycle leaning, seated riders, entry animations and persistent vehicle locations are not implemented. The car roster resets when a scene is reloaded.
4. **Transport is partial.** Aircraft/runway motion and source-track train movement are simplified loops. Trains have periodic simulated pauses rather than a complete station-aware timetable. There are no operational schedules, animated train doors/boarding, physical passenger rides or player-piloted aircraft. District bus travel skips the trip rather than claiming a fully navigated interdistrict road journey.
5. **Traffic/NPC intelligence is basic.** Vehicles recycle at way ends and use simplified timed stops; a connected junction/signal manager and robust right-of-way/obstacle reasoning remain incomplete. Pedestrians use short paths and can be hidden when blocked. A local guide populates safe arrival areas.
6. **Scenery has approximation artifacts.** A procedural landmark may not match the real footprint, size or orientation. Some large source footprints are omitted visually; their collision extent may remain. Some building bases, river edges, bridge deck heights and terrain transitions can still look crude. Religious interiors are excluded; comprehensive real access-control rules are not modeled.
7. **Localization is partial.** A few core menu labels have Malayalam alternatives, with native font fallback. Most UI/descriptions are English. Full Malayalam localization and native-speaker verification remain unfinished.
8. **Audio is an approximation.** It is original synthesized ambience/engine sound, not a complete recorded Kerala soundscape or railway/airport announcement system.
9. **Advanced streaming is unfinished.** Chunk partitioning, disposal, caching and instancing work. Full asset LOD chains, texture streaming, worker-based geographic/mesh preparation and offline service-worker caching remain incomplete.
10. **Deployment is local.** No hosting account, public deployment, multiplayer, cloud saves or production analytics were configured. Browser storage holds one save slot; a browser without WebGL 2 cannot render the game.

## Screenshots

- [Main menu](output/playwright/01-home.png)
- [Character setup](output/playwright/02-character.png)
- [Starting district map](output/playwright/03-location-map.png)
- [Thrissur](output/playwright/04-thrissur.png)
- [Fort Kochi](output/playwright/district-ernakulam.png)
- [Munnar](output/playwright/district-idukki.png)
- [Cochin airport](output/playwright/area-airport-cok.png)
- [Kaloor stadium exterior interpretation](output/playwright/area-kaloor-stadium.png)
- [Transport interface](output/playwright/20-transport.png)
- [Rain at night](output/playwright/21-rain-night.png)
- [Mobile map](output/playwright/23-mobile-map.png)
- [State map and sourced network](output/playwright/25-state-map.png)

Additional per-district and per-area screenshots are in the same directory. Reproduce checks using the commands in [README.md](README.md).
'''
(ROOT/'VERIFIED_IMPLEMENTATION_REPORT.md').write_text(report,encoding='utf-8')
print('Report written:',len(report.split()),'words')
