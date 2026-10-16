# Character selection and movement — verified delivery

Verified on **16 October 2026** in the running browser at [Kerala Open World](http://127.0.0.1:5173/).

**Production build passed. All 18 automated tests and 85 browser checks passed. Both browser runs recorded zero JavaScript/console errors.**

## Delivered behavior

| System | Implemented and verified |
|---|---|
| Character selection | Male and female choices must be explicit before a new journey. Existing saves continue with their previously chosen avatar. |
| 3D studio | Lit, shadowed, draggable previews; rotate buttons; Idle, Walk, Run and Jump playback; loading status; desktop and mobile layouts. Clothing updates preserve the live renderer. |
| Customization | Two clothing cuts, three hairstyles, skin tones, shirt/trouser/shoe colors. Preferences and the chosen avatar are saved locally. Reselecting the same body preserves its hairstyle. |
| Animation | Shared articulated rig in previews and gameplay: hips, knees, ankles, shoulders and elbows, breathing, opposing arm swing, speed blending, airborne pose and landing recovery. The footfall test checks that the foot lifts for the forward swing. |
| Body clearance | Male: 1.88 m height, 0.38 m horizontal clearance radius. Female: 1.77 m height, 0.35 m radius. Mesh bounds and articulation are checked against the declared dimensions. |
| Mouse movement | Click ground to navigate; hold left-click to keep following the cursor. A pulsing destination marker and route show the target. On-screen Run, Jump, Stop and Interact controls work. |
| Navigation | Clearance-checked A* with swept segments, safe corner smoothing, partial-route feedback and replanning for a blocked path. Bounds, water and building footprints remain impassable. |
| Keyboard movement | Camera-relative arrows and WASD; Shift run, Space jump, E interaction, C distance, M map. Diagonal movement is normalized. The visible character faces its actual travel direction. |
| Camera | Smooth target/follow, right-drag orbit, wheel zoom, pitch/distance bounds and height-aware sphere sweeps against buildings, parked vehicles and terrain. Interpolated positions are swept again. Tight spaces lift the camera above the character; transitions keep it outside the vehicle body. |
| Vehicles | Up accelerate, Down brake/reverse, Left/Right steer, Space handbrake, E enter/exit. Collision sweeps the full rotated footprint, including bumpers. Parked vehicles use rotated boxes with appropriate door clearance. |
| Mouse driving | Optional steering while a driving mouse button is held. Left accelerates, right brakes; right braking cannot orbit the camera. Arrow driving remains available, and camera orbit works on foot with mouse steering enabled. |
| Input lifecycle | Mode switching clears old paths, markers, run toggle and held input. Pointer cancellation, capture loss, window blur and hidden tabs release input. Pausing stops residual walking; resuming returns keyboard focus to the canvas. |

## Browser evidence

The **63-check gameplay run** operates the real UI, keyboard and mouse. It selects and loads both bodies, plays their previews, moves with every arrow, uses WASD, runs, jumps and lands, walks into a building boundary, orbits and zooms the camera, clicks and holds ground movement, changes modes during an active path, and drives/exits vehicles with both input methods. It saves and reloads the female body and clothing.

The building-detour test reached the clicked destination and recorded **zero blocked positions and zero collision samples**. Rendered heading vectors were checked against sideways travel and vehicle travel, catching the original mirrored heading conversion.

The **22-check edge run** covers pause/resume, keyboard focus, a real browser-tab switch, zoom preservation, running on Wayanad slopes at extreme camera settings, mobile widths, customization without renderer replacement, saved hairstyle preservation and camera clearance during vehicle transitions. Sampled low-pitch camera clearance above hill terrain stayed above 0.30 m. Desktop gameplay was observed at about 60 FPS here; this is not a hardware performance guarantee.

Viewports: **1440 × 900 desktop** and **390 × 844 mobile**. Tests read diagnostics through `window.__KOW__`; movement uses input events, without teleporting the player or changing engine state from the test.

- [Gameplay results — 63 checks](output/playwright/check-character-movement.json)
- [Edge results — 22 checks](output/playwright/check-movement-edges.json)
- [Automated test log — 18 tests](output/playwright/character-unit-tests.log)
- [Production build log](output/playwright/character-build.log)
- [Male studio](output/playwright/character-male-polished.png)
- [Female studio](output/playwright/character-female-polished.png)
- [Running preview](output/playwright/character-running-preview.png)
- [Mobile studio](output/playwright/character-studio-mobile.png)
- [Building camera collision](output/playwright/camera-building-collision.png)
- [Completed mouse route](output/playwright/mouse-path-completed.png)

## Reproduce

Start the local server, then:

```powershell
npm run build
npm test
npx --yes --package @playwright/cli playwright-cli -s=kerala open http://127.0.0.1:5173/ --headed
./scripts/browser-check.ps1 -Check character-movement
./scripts/browser-check.ps1 -Check movement-edges
```

Run browser checks in sequence with the game tab in the foreground. Avoid source edits or development reloads during a check.

## Scope and limits

These are original **stylized procedural characters**, with code-driven joint animation, rather than photorealistic scanned humans or motion-capture assets. Clothing customization has two cuts and color palettes. Navigation uses the existing game's horizontal building/water footprints and synthetic terrain heights; this does not add interiors, climbing, a full rigid-body/capsule physics engine or continuous statewide traversal. Saving uses this browser's local storage.

Primary files: `src/game/character.ts`, `camera.ts`, `input.ts`, `navigation.ts`, `engine.ts`, `traffic.ts`; `src/ui/CharacterSetup.tsx`, `ScenePreview.tsx`, `GameView.tsx`; `src/App.tsx`, `types.ts` and `styles.css`.
