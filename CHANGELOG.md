# Changelog

All notable changes to **Kerala Open World** will be documented in this file.

## [1.0.0-beta.1] — 2026-10-16

### Added
- **Official Public Beta Release**: Introducing `v1.0.0-beta.1` across all 14 Kerala districts.
- **Statewide Infrastructure**: 3,435 validated geographic places, 4 international airports (TRV, CCJ, COK, CNN), 181 railway stations, and OpenStreetMap road networks.
- **Character Studio**: Male and female customizable avatars with clothing palettes, hair styles, and skin tone options.
- **Advanced Control Schemes**: Mouse click-to-move, continuous cursor follow, right-drag camera orbit, arrow keys / WASD navigation, and vehicle driving with acceleration and progressive braking.
- **Transportation Networks**: Interactive public transport boarding (district buses, trains with station-aware dwelling, and airport flights) with Dijkstra-based journey duration/distance estimation.
- **Performance Optimization**: Four quality presets (`low`, `medium`, `high`, `ultra`) with lightweight mode optimized for laptops with approximately 4 GB RAM.
- **Robust Save/Resume System**: Versioned save schemas with automatic 30-second autosaves and manual save/continue support.
- **Deployment & CI**: Vercel/Netlify configuration, GitHub Actions CI workflow, and automated test coverage.

### Verified
- 18 automated unit tests passing successfully (`npm test`).
- Geographic data validation passing across all 14 districts (`npm run data:validate`).
- Production build compiled successfully (`npm run build`).
