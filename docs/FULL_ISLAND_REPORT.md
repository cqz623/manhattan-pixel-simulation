# Full-island implementation and verification

Implemented in the existing `manhattan-pixel-simulation` working directory on 2026-11-18. No other repository, Git remote, commit, push or deployment was changed. Original editor, schematic generators, Visitor/Courier behavior, charging, legacy JSON, retention experiments and knowledge layers are retained.

## Delivered behavior

- Real NYC geographic snapshot → north-up, 256 × 512 Manhattan Island raster, including Battery Park through Inwood. Full initial fit, active-area zoom, square cells, fixed fullscreen canvas, nearest-neighbor overview cache.
- Separate source geometry and editable scenarios; blue land explicitly labeled aggregated, not building footprints. Explicit park access, including undoable access-only edits.
- Four authored demo windows plus custom drawn regions, two depots and multiple destinations per preset, four default Explorer/Courier agents, four tasks per courier, 16× playback.
- Editable costs/obstacles/crowds, preserved layer-safe editing and history, one-action presets, Restore Original, validated compressed JSON and backward compatibility.
- Limited perception and individual memory, frontier Explorers, repeated Couriers, observed-only planning/avoidance, genuine landmark reuse, actual movement/knowledge overlays.
- Global/geographic and semantic-relative locations; geometric Manhattan distance versus steps and weighted cost through the selected agent's known map.
- A/B baseline snapshot, duplication, changes/variation, fixed cohort/tasks/seed/duration/empty memory, measured side-by-side results, success-first ranking and environment selection.

## Files added or updated for this milestone

| Area | Files |
| --- | --- |
| App shell and integration | `index.html`, `styles.css`, `src/main.js`, `src/agent-ui.js` |
| Source GIS and metadata | `data/geography/shoreline.geojson`, `streets.geojson`, `parks.geojson`, `snapshot.json`; `data/manhattan-base.js`; `data/README.md` |
| Geographic preparation | `scripts/download-geography.py`, `scripts/build-manhattan.py` |
| World and authoring | `src/manhattan.js`, `src/coordinates.js`, `src/regions.js`, `src/locations.js`, `src/design.js` |
| Existing environment/editor support | `src/environment.js`, `src/terrain.js`, `src/scenario.js`, `src/editor.js`, `src/camera.js` |
| Agent implementation | `src/agents/nav.js`, `world.js`, `state.js`, `memory.js`, `perception.js`, `pathfinding.js`, `agent.js`, `simulation.js` |
| Display and comparison | `src/raster-cache.js`, `src/visualization.js`, `src/ab-comparison.js`, `src/ab-ui.js` |
| Tests | `tests/full-island.test.js`, `tests/ui.test.js`; previous test files retained |
| Documentation | `README.md`, `SEMANTIC_MODEL.md`, this report and `docs/previews/*.png` |

Several files were already untracked from earlier project work when this milestone began. Git status is not used to imply they were all newly created in this milestone.

## Automated checks

`npm test` passes **71 tests**, including the original editor, camera, renderer, semantic and agent tests plus the expanded full-island and DOM integration cases. Added checks cover raw source hashes, geographic geometry/round-trips, local region confinement, explicit park access, RLE validation, known-only distances, real delivery metrics, A/B starts/tasks/headings and reproducibility, fixed failed-task denominators, route-valid variations, overview truth/unknown pixels, custom area gestures and cancellation of edited studies.

JavaScript syntax and relative-module resolution checks passed for all source/test modules and the derived raster. Relative HTML assets resolved. Existing localhost preview returned HTTP 200 for the HTML, app modules, GIS raster, stylesheet and semantic-model documentation. No build/backend is required; module/asset URLs support repository subpaths. Actual GitHub hosting was not deployed or tested.

Offline rasterization was rerun from the saved source snapshot: 95,444 water cells, 8,547 aggregated urban-land cells, 21,304 street cells, 5,777 park cells. The authored default scene adds local crowd/mission/start cells afterward.

## Measured demonstration

Actual fixed-step runs: seed 1, four agents (two Explorers/two Couriers), radius 6, landmarks on, four tasks per courier, 480 simulated seconds. B is the seed-1 route-valid four-cell variation, not a promised improvement.

| Region | A deliveries | A avg successful time | B deliveries | B avg successful time |
| --- | ---: | ---: | ---: | ---: |
| Lower Manhattan | 8/8 | 46.350 s | 8/8 | 46.350 s |
| Midtown | 8/8 | 84.275 s | 8/8 | 81.325 s |
| Harlem | 8/8 | 35.275 s | 8/8 | 35.275 s |
| Inwood | 8/8 | 54.675 s | 8/8 | 54.975 s |

The same small intervention had unchanged, improved and worsened time outcomes in different regions. These are single-seed model results, not calibrated travel times or statistical findings. A separate blocked-corridor test records zero deliveries, null average time and 0% success, preventing a failed environment from appearing efficient. Identical A/B scenarios produce identical result/trip records.

## Visual checks and limitations

The actual `MapRenderer`, real geographic scene and measured 480-second Midtown simulation were drawn into a native offscreen Canvas at 1440 × 900 and visually inspected:

- [Full Manhattan Island](previews/full-island.png)
- [Active-area actual path density](previews/active-paths.png)
- [Individual memory and actual trail](previews/individual-memory.png)

These images verify map rendering, **not browser CSS**. Browser/native-app inventory returned no available surface: “The browser access host is unavailable” and native startup failed. Real browser interactions/layout at 1280 × 800, 1440 × 900 and 1920 × 1080 therefore remain a manual QA item. Camera mathematics and real HTML event wiring pass automated tests.

The brief's final-submission PDF and visual-reference images were not provided as accessible attachments. The academic mapping follows the supplied written requirements. GIS is coarse and simplified: no actual building footprints, legal access guarantee, live traffic, meter-calibrated motion or direct communication. Mission/crowd locations are authored; associated borough islands/Marble Hill are excluded. Difficult local deadlocks can remain unresolved. Runtime memory and study results are not saved in scenario JSON.

Local preview: **http://127.0.0.1:4173** (existing server, left running).
