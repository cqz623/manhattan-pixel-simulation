# Restore the compact abstract map

The application again starts on the previous **128 × 72 abstract Manhattan-inspired rectangular grid**, fitted as square cells. Black orthogonal roads connect blue building blocks, green parks, orange construction, pink activity zones and yellow delivery destinations. The island silhouette and geographic neighborhood controls are removed from the active interface. No new user features were added.

## Recovery decision

Inspected `git status`, all Git history, reflog and the HEAD file tree before editing. The only commit is `da81d0e` (Initial commit), containing only README.md. There is no pre-island application commit to restore. The application files are uncommitted working-tree files, so a repository reset would not safely recover them.

The **original abstract map implementation was still intact** in `src/abstract-manhattan.js`. Its `generateAbstractManhattan()` geometry was reused unchanged, rather than recreating the map or rebuilding the app. A small factory adapter applies the already-existing Explorer/Courier mode and full-grid simulation bounds to that map. Existing legacy generator behavior remains compatible.

## Files changed

| File | Change |
| --- | --- |
| `src/main.js` | Start and regenerate using the abstract map; remove the geographic factory import/restore handler and named geographic neighborhood selection; keep custom areas, editing, camera, playback and comparisons |
| `src/abstract-manhattan.js` | Add a small adapter pairing the retained generator with current Explorer/Courier settings; original geometry generation stays unchanged |
| `src/visualization.js` | Draw the active-area dashed boundary only for a genuine subarea, avoiding a duplicate whole-map boundary |
| `index.html` | Restore Pixel Lab labeling, Fit Grid, entire-city/custom-area choices and abstract-map help; remove island restore/neighborhood controls |
| `styles.css` | Remove island-specific map-heading positioning while retaining the fixed canvas, colors, floating panels and comparison styles |
| `tests/ui.test.js` | Update default-map dimensions/coordinates and UI assertions to the restored abstract version; keep editor, simulation, memory, overlays, scenario and comparison integration checks |
| `tests/abstract.test.js` | Verify exact reuse of original terrain/layers, no GIS assets in the browser import graph, default Explorer/Courier navigation and memory, exclusive occupancy, measured overlays and reproducible A/B |
| `README.md` | Document the restored default, setup, preserved behavior and verification |
| `SEMANTIC_MODEL.md` | Replace active full-island assumptions with the abstract grid and clarify optional legacy import compatibility |
| `docs/ABSTRACT_RESTORE.md` | Record recovery decision, changed files and checks |

Agent decision/perception/memory/pathfinding modules, terrain semantics, editor/history, scenario validation, camera math, playback controls and both comparison implementations were not reverted or rewritten. Previous GIS assets/import helpers and their regression tests remain inactive historical/compatibility material: the application does not import them, and the interface has no island restore action. Existing saved scenarios remain loadable.

## Verification

- **72 tests passed, 0 failed** using `npm test`, including the prior model/GIS compatibility tests. No tests were removed or skipped. Default UI expectations now describe the requested compact map.
- Existing generated-map checks confirm connected roads and reachable semantic mission locations at supported square/rectangular resolutions.
- A new restored-default test checks exact equality with the retained map generator, roles, partial memory, known-only routes, exclusive occupancy, real deliveries/landmark reuse, actual arrivals, heatmaps and unchanged static layers during movement.
- Real entry-point tests cover painting, drag rectangles/flood/brushes, undo/redo, generation/reset, JSON, custom area selection, seed/speed controls, individual knowledge, all collective overlays and both comparison workflows.
- Identical abstract A/B experiments reproduce identical measured results and complete deliveries.
- The real renderer was drawn at 1440 × 900 into native offscreen Canvas. The complete rectangular grid, colors and individual memory/trail were visually inspected; all collective knowledge modes rendered. Existing camera tests verify full fit without distortion at common desktop sizes, anchored zoom and pan.
- Changed JavaScript passes syntax checks; HTML IDs are unique, local assets resolve and `git diff --check` passes.
- The existing preview returned HTTP 200 for the restored page, entry point, abstract generator and CSS. Its entry point has no island-map import.
- Actual browser interaction/CSS layout QA remains unavailable: the browser access host cannot start. Native renders and DOM/camera tests do not claim to verify browser layout.

Preview: **http://127.0.0.1:4173**. The existing server was left running. No commits, pushes, deployments, Git remote changes or other repository modifications were performed.
