# Kerala Open World

An original browser exploration prototype built with React, TypeScript, Vite and Three.js. It includes **27 playable local areas across all 14 Kerala districts**, a sourced map, character customization, walking, driving, weather, travel and local saves.

**This is not a complete, photorealistic reconstruction of Kerala.** Coordinates and road/building footprints are sourced; humans, architecture, vegetation and terrain are procedural interpretations. Read [the verified implementation report](VERIFIED_IMPLEMENTATION_REPORT.md) for exact coverage, tests and remaining work.

## Run

The latest character and controls upgrade is documented in [the movement verification report](CHARACTER_MOVEMENT_REPORT.md), with 18 automated tests and 85 live browser checks.

Use Node.js 22.12+ or Node.js 24. Checked geographic extracts are included; no map API key is needed.

```powershell
npm install
npm run dev -- --port 5173
```

Open [Kerala Open World](http://127.0.0.1:5173/). Explicitly choose an avatar, customize it, select a district or imported transport area, then start. Thrissur is suggested.

```powershell
npm run build
npm run preview -- --port 4173
npm test
npm run data:validate
```

## Controls

| Action | Control |
|---|---|
| Walk | Arrow keys or WASD, relative to camera |
| Drive | Up accelerate, Down brake/reverse, Left/Right steer (or WASD) |
| Run | Shift, or the on-screen Run toggle |
| Jump / handbrake | Space |
| Enter, exit, talk, landmark / travel interaction | E |
| Camera orbit | Right mouse drag |
| Camera zoom | Mouse wheel |
| Change camera distance | C |
| World map | M |
| Pause | Escape |
| Mouse movement | Choose Mouse movement; click or hold on ground |
| Mouse driving | Enable Mouse steering in Settings; move horizontally to steer, hold left to accelerate, right to brake |

On-screen Run, Jump, Stop and Interact controls support mouse-only walking. Mouse driving uses steering only while a driving mouse button is held; arrow keys remain available. Right-drag orbits on foot and in keyboard driving; with mouse steering active, right-click is reserved for braking. Settings include remapping, audio controls and quality presets. Recover a stuck player from the pause menu. Journeys autosave every 30 seconds and can be saved manually. Browser storage must be available.

The character studio requires an explicit male or female choice. Both original articulated characters have idle, walk, run and jump previews, drag/button rotation, two clothing cuts, five skin tones, three hairstyles and clothing/footwear palettes. The same rig runs in the world with blended joint animation and landing recovery. Camera movement sweeps a small sphere against building heights, parked vehicles and terrain. Walking uses swept body footprints and clearance-checked A* paths; driving uses the full rotated vehicle footprint.

Bus, rail and airport travel are simplified game services that transition between local scenes. They are not live schedules, continuous passenger rides or ticket purchases.

## Structure

- `src/game/`: renderer, input, movement, collisions, pathfinding, traffic, original models and synthesized audio. Simulation runs outside React.
- `src/data/`: geographic conversion, validation helpers and bounded extract cache.
- `src/ui/`: character setup, map, transport, settings and gameplay HUD.
- `public/data/`: checked extracts, provenance, district boundaries and location register.
- `scripts/`: geographic maintenance and browser-check runner.
- `tests/`: meaningful collision/navigation/geography tests and browser workflows.
- `output/playwright/`: screenshots and machine-readable browser results.

The world uses local metre coordinates and a new origin per loaded area. It streams 160 m chunks, batches static meshes, instances palm fronds, limits rendering resolution, disposes distant chunks and keeps at most three geographic tiles cached. The state map preserves district relationships rather than compressing Kerala into a small continuous map.

## Geographic maintenance

The app runs from bundled data. Reimporting is optional and requires network access. Public Overpass services can reject or time out on queries; scripts cache successful requests. Validate after source updates.

```powershell
python scripts/import_geography.py
npm run data:validate
python scripts/import_extra_areas.py
python scripts/import_kochi_landmarks.py
npm run data:validate
python scripts/import_state_network.py
```

Licenses and sources are in [public/data/NOTICE.md](public/data/NOTICE.md). No Google tiles, Street View, satellite imagery or proprietary GTA assets are used.

## Browser verification

Start the development server, then run in order:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=kerala open http://127.0.0.1:5173/ --headed
./scripts/browser-check.ps1 -Check start
./scripts/browser-check.ps1 -Check controls
./scripts/browser-check.ps1 -Check transport
./scripts/browser-check.ps1 -Check settings
./scripts/browser-check.ps1 -Check districts
./scripts/browser-check.ps1 -Check performance
./scripts/browser-check.ps1 -Check character-movement
./scripts/browser-check.ps1 -Check movement-edges
```

Checks operate the real browser/game through UI and input events, using read-only runtime diagnostics exposed as `window.__KOW__`. Results and screenshots are saved under `output/playwright/`.
