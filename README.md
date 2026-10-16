# Kerala Open World

An original browser exploration prototype built with React, TypeScript, Vite, and Three.js. It features **27 playable local areas across all 14 Kerala districts**, sourced OpenStreetMap roads and building footprints, character customization, walking, driving, public transport systems, weather, dynamic world streaming, and local saves.

> **Disclaimer:** This is not a complete, photorealistic reconstruction of Kerala. Coordinates and road/building footprints are sourced; humans, architecture, vegetation, and terrain are procedural interpretations. Read [the verified implementation report](VERIFIED_IMPLEMENTATION_REPORT.md) for exact coverage, tests, and technical details.

---

## 🚀 Key Features

- **All 14 Kerala Districts**: Thiruvananthapuram, Kollam, Pathanamthitta, Alappuzha, Kottayam, Idukki, Ernakulam, Thrissur, Palakkad, Malappuram, Kozhikode, Wayanad, Kannur, and Kasaragod.
- **Recognizable Landmarks**: Swaraj Round and Vadakkunnathan Temple (Thrissur), Lulu Mall and Marine Drive (Kochi), Kovalam & Varkala cliffs, Alappuzha backwaters, Munnar tea hills, Palakkad Fort, Kozhikode Beach, Bekal & Kannur Forts.
- **Character Studio**: Male and female playable avatars with custom skin tones, hairstyles, and clothing/footwear palettes.
- **Multiple Control Schemes**:
  - Arrow keys / WASD (smooth walking, running with Shift, jumping, interacting with E).
  - Mouse movement (click-to-move, continuous cursor follow, right-drag camera orbit, scroll zoom).
  - Vehicle driving (acceleration, progressive braking, steering, handbrake, speedometer, chase camera).
- **Interactive Transportation**: District buses, railway networks (with station-aware train dwelling and canopies), and international airports (TRV, CCJ, COK, CNN) with Dijkstra-based journey estimates.
- **Environmental Immersion**: Dynamic time of day (morning, afternoon, evening, night), weather presets (clear, rainy, monsoon), procedural coconut/banana palms, Kerala-style houses, bridges, and backwaters.
- **Performance Optimized**: Four quality presets (`low`, `medium`, `high`, `ultra`) with a dedicated lightweight mode optimized for laptops with approximately 4 GB RAM.

---

## 🛠️ Technology Stack

- **Framework**: React 19, TypeScript 5.9
- **Bundler**: Vite 7.1
- **3D Graphics**: Three.js 0.180
- **Testing**: Node.js built-in test runner (`tsx --test`), Playwright browser workflows
- **GIS Data**: GeoBoundaries ODbL district boundaries, OpenStreetMap road and place extracts

---

## 💻 System & Installation Requirements

- **Node.js**: Version 22.12+ or 24 recommended.
- **RAM**: 4 GB minimum (optimized low quality preset available for low-spec laptops).
- **Browser**: Modern WebGL2-compatible browser (Chrome, Edge, Firefox, Safari).

### Windows Installation Instructions

1. Install [Node.js](https://nodejs.org/) (v22.12+).
2. Open PowerShell or Command Prompt in the project directory:
   ```powershell
   cd "C:\Users\SURAG\Documents\my-project\KERALA OPEN WORLD — Realistic 3D Exploration Simulator"
   ```
3. Install dependencies:
   ```powershell
   npm install
   ```

---

## 🏃‍♂️ Development & Production Commands

### Start Development Server
```powershell
npm run dev -- --port 5173
```
Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in your browser. Choose an avatar, customize appearance, select a district or imported transport area, and explore.

### Production Build & Preview
```powershell
npm run build
npm run preview -- --port 4173
```

### Run Tests & Validation
```powershell
npm test
npm run data:validate
```

---

## 🎮 Control Scheme

| Action | Control (Keyboard / Mouse) |
|---|---|
| **Walk / Drive Move** | Arrow keys or WASD (relative to camera) |
| **Run** | Shift (on foot) |
| **Jump / Handbrake** | Space |
| **Interact / Board Transport** | E |
| **Camera Orbit** | Right mouse drag |
| **Camera Zoom** | Mouse wheel |
| **Change Camera Distance** | C |
| **World Map** | M |
| **Pause / Menu** | Escape |
| **Mouse Walking** | Select *Mouse movement* in HUD; click or hold ground |
| **Mouse Driving** | Enable *Mouse steering* in Settings; move horizontally to steer, hold left to accelerate, right to brake |

---

## 🗺️ Supported Districts & Regions

1. **Thiruvananthapuram** (Capital & Kovalam/Varkala coast, TRV airport)
2. **Kollam** (Ashtamudi backwaters & town)
3. **Pathanamthitta** (Hill terrain & pilgrimage routes)
4. **Alappuzha** (Backwater canals & beach)
5. **Kottayam** (Rubber hills & backwater town)
6. **Idukki** (High Range Munnar hills & dams — road access only)
7. **Ernakulam** (Kochi urban center, COK airport, metro/rail)
8. **Thrissur** (Swaraj Round, Vadakkunnathan Temple, rail station)
9. **Palakkad** (Palakkad Gap, agricultural plains, fort)
10. **Malappuram** (CCJ airport, coastal roads)
11. **Kozhikode** (Historic trade port & beach)
12. **Wayanad** (Western Ghats mountain roads — road access only)
13. **Kannur** (Northern coast, CNN airport, fort)
14. **Kasaragod** (Northern hills & Bekal Fort)

---

## ⚙️ Graphics Settings & Performance Presets

- **Ultra / High**: Full 2048px soft shadows, high vegetation density, maximum draw distance, 60 FPS on dedicated desktop GPUs.
- **Medium / Low (4GB RAM Laptop Mode)**: Reduced shadow map resolution (512px), lower pixel ratio clamp (0.8x), chunk distance limits, and lightweight particle density to ensure stable performance on modest hardware.

---

## 🔍 Troubleshooting

- **Black screen or WebGL error**: Ensure hardware acceleration is enabled in your browser and your graphics drivers are up to date.
- **Stuck player**: Press Escape to open the pause menu and select *Recover / Respawn* or return to the district map.
- **Port already in use**: Specify a different port using `-- --port <number>` (e.g., `npm run dev -- --port 5174`).

---

## 📦 Data Attribution & Asset Licenses

- **District Boundaries**: geoBoundaries (Open Database License - ODbL).
- **Roads, Buildings & Places**: OpenStreetMap contributors ([ODbL](https://www.openstreetmap.org/copyright)).
- **Code & Assets**: Original implementation under project terms. No proprietary Google tiles, Street View, satellite imagery, or commercial assets are used.

---

## 📄 Implementation Report Summary
- **18 Automated Unit Tests**: Passing successfully (`npm test`).
- **Geographic Data Validation**: 14 districts, 3,435 places verified (`npm run data:validate`).
- **Build Status**: TypeScript and Vite production build verified with zero errors.
