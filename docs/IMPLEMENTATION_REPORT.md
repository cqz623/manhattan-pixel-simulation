# Spatial-agent integration report

Implemented in the existing `manhattan-pixel-simulation` working directory. The original 2D raster, object editor, zoom/pan camera, JSON scenarios, and undo/redo remain in place. No Git remote, reference repository, commit, push, merge, or deployment was changed or performed.

## Files added in this integration

- `src/agents/nav.js`: dimension-independent coordinates, traversal/energy preferences, seeded randomness.
- `src/agents/world.js`: adapter from editable layers to host truth, opaque task identities, valid spawns and collision checks.
- `src/agents/agent.js`: observation-driven autonomous decisions, tours, pickup/delivery, charging, reuse and recovery.
- `src/agents/simulation.js`: fixed-step execution, moving pedestrians, independent runtime occupancy, real visit and knowledge aggregates.
- `src/agent-ui.js`: simulation controls, selection, legends, individual memory/performance, cancellable paired comparison.
- `tests/agents.test.js`: independent behavioral and isolation tests.
- `tests/ui.test.js`: full-entry DOM integration tests, with standard browser-API shims where linkedom lacks implementation.
- `package-lock.json`: reproducible test-only dependency installation.
- `docs/REFERENCE_AUDIT.md` and this report.

## Files extended or modified

- `src/environment.js`: additive Slow terrain and Charger types and slow-cell traversability.
- `src/schematic.js`: two walkable charger placements in the existing schematic; Manhattan geometry retained.
- `src/agents/state.js`: visitor/courier runtime records alongside the existing placement adapter.
- `src/agents/perception.js`, `memory.js`, `pathfinding.js`: former capability seams now implement sensing, remembered state and known-map planning.
- `src/comparison.js`: two isolated, matched, fixed-duration experiments with measured results.
- `src/visualization.js`: four real collective modes plus individual remembered/visible/unknown rendering, current plans and completed trails, using the unchanged camera transformation.
- `src/main.js`: editor-to-simulation synchronization and Inspect selection; individual cell inspection respects unknown memory; file-import input captured before asynchronous work.
- `index.html`, `styles.css`: compact functional simulation, knowledge, agent, comparison and performance controls in the existing three-area layout.
- `tests/renderer.test.js`: enabled-mode and real-data overlay/alignment/veil checks in addition to the original drawing checks.
- `package.json`: development-only linkedom dependency; the runtime remains buildless vanilla ES modules.
- `README.md`: setup, architecture, controls, experimental rules, attribution, validation and limits.

Existing `src/editor.js`, `src/scenario.js`, and `src/camera.js` behavior is reused. Their existing tests remain in the full suite. Original schema-1 scenarios are still accepted, with new object kinds added without changing layer meaning.

## Reused versus independent components

The Manhattan environment model, editor/history, scenario validation, grid generator and canvas camera were reused and extended locally. Parcel was inspected for the behavior requested by the user, including its ten named agent/navigation/UI/test files. Because no application-wide reuse license was found, none of its application code, tests, assets, fixed geography, or Three.js dependency was copied. New behaviors are independently implemented; the pinned source and licensing review are in the reference audit.

## Verification results

- `npm test`: **40 passed, 0 failed**, including nested UI checks. The suite covers all prior editor requirements as well as perception, wall/corner occlusion, observed-only memory, semantic discovery and retention, weighted routing/frontiers, optional diagonal safety, repeated tasks/reuse, charging, live closures/reopening, pedestrians, collisions/recovery, distinct-agent aggregation, exact actual visits, hidden-world independence, and matched comparisons.
- DOM integration boots `src/main.js` against the real HTML, then exercises painting all four layers, undo/redo, JSON export/import and rejection, play/pause/step/speed, population/seed changes, individual unknown-cell inspection, collective legends, comparison execution, and confirmed resolution changes. It also checks that renaming followed by editing keeps the live run.
- Overlay tests use actual simulation data, verify rendered cells correspond to nonzero visits/actual memory holders, preserve camera and canvas dimensions across all modes, and ensure an individual view does not show undiscovered destinations or changed hidden terrain.
- `node --check` on every source/test JavaScript file: passed.
- Relative ES imports and unique HTML IDs: passed.
- `git diff --check`: passed.
- Local HTTP: **20 successful content/MIME checks**, including the HTML, CSS, README and all 17 source modules, matching workspace bytes. Port 4173 already had a server; its content was verified and the existing process was left running.
- Additional Manhattan stress run: ten agents plus moving pedestrians, seed 3, 600 simulated seconds; no overlapping occupants or invalid terrain moves. Couriers completed deliveries and recharged; deterministic recovery events were recorded.
- Git remote verified unchanged: `https://github.com/cqz623/manhattan-pixel-simulation.git`.

### One measured comparison example

Fresh default 64 × 64 schematic, seed 1, two agents, six-cell sight, 600 simulated seconds per condition:

| Landmark retention | Deliveries completed | First delivery | Mean later delivery | Landmark reuse events |
| --- | ---: | ---: | ---: | ---: |
| Enabled | 4 | 430.2 s | 52.2 s | 19 |
| Disabled | 2 | 430.2 s | 122.6 s | 0 |

These are measured outcomes from this particular seed and layout, not a guaranteed improvement. Reuse totals include visitor and courier reuse. The first/later times include search, pickup, congestion and charging. Paired experiments in the UI recompute results from the current edited environment; no results are hardcoded.

## Local preview

```sh
npm start
```

Open **http://127.0.0.1:4173**. The verified existing server can serve the updated files immediately; refresh the page if already open. If starting on another port is necessary:

```sh
python3 -m http.server 4174 --bind 127.0.0.1
```

For verification on a fresh checkout:

```sh
npm ci
npm test
```

No installation or build is needed just to serve the browser application. linkedom is only used by the Node test suite.

## Limits and remaining verification

- Interactive browser/screenshot QA is **pending**: both native-app and browser hosts were unavailable. DOM and canvas-recording tests verify behavior/data wiring, not actual browser layout/rasterization. The README contains a desktop QA checklist.
- Geography is still explicitly schematic. GIS import, coordinate projection, generation/optimization and direct inter-agent communication are not part of this integration.
- Energy, speed and charging are discrete schematic models in cell/effort units. Runtime movement is cardinal; physically impossible one-cell deadlocks and disconnected/unreachable tasks may require environment edits. Empty batteries without a reachable known charger stop rather than receiving hidden rescue information.
- JSON files preserve the authoring environment and starts, not runtime memories/trips. Memory persists across repeated tasks during the session; resetting simulation or replacing a scenario clears it.
- Collective knowledge concerns active agents; historical visits and run metrics retain removed agents' contributions. Shared Knowledge is a validated overlap measure, not evidence of communication or certainty about observation recency.
- Comparison means require completed samples. Inaccessible tasks or short windows can leave dashes; multiple seeds are needed to support general performance claims.
