# Fullscreen abstract pixel city redesign

This extends the existing Manhattan Pixel Lab and its working spatial-agent engine. The editor/history, four layers, scenario format, simulation timestep, limited perception, memory, known-map planner, independent occupants and measured knowledge aggregation remain the foundation.

## Interface and rendering

- The canvas is fixed to all four viewport edges, on a black background. There is no dashboard column or fixed-width map container.
- Editor and Knowledge are collapsible floating panels. Both start closed; narrow screens open one at a time. The bottom toolbar owns playback, speed, population, collective mode selection and landmark retention.
- The default tool is Inspect, preventing accidental authoring when selecting agents. Palette selections enter painting; rectangle/fill remain selected while changing the object type.
- The initial 128 × 72 view fits the entire raster while accounting for the top/bottom controls. Fits retain square cells and refit on resize. Free camera views preserve scale and center instead. Mode and panel changes do not call fit or alter canvas layout.
- Pixel boundaries share snapped device-pixel edges. Normal terrain has no gaps. Knowledge tints are inset and capped at 50% opacity, preserving terrain edges. The individual veil draws memory rather than hidden truth; current visibility is outlined, plans dashed cyan, and completed travel amber.
- The retained classic schematic and prior palette categories remain accessible. No Three.js, isometric graphics, textures or external images are used. The supplied attachment contained text only; no reference images were available in the attachment directory.

## Shared terrain semantics

`src/terrain.js` supplies rendering colors, opacity, passability, traversal costs and energy preferences. The environment/object registry, world adapter, perception snapshots, memory and planner use the same semantic definitions. Colors never determine behavior.

Park cost, construction mode/cost and crowd weight are stored in the environment and are undoable/exported. Schema-1 files without those fields receive defaults. Construction supports blocked and costly states, with timestamped observations. Changes do not overwrite hidden agent memories.

Crowd zone costs depend on actual nearby occupants. Sensing estimates use only detected occupants within two Manhattan-distance cells, excluding the observer, so a person behind a wall cannot leak through an aggregate congestion value. The host records effort using actual occupancy. Remembered route costs can become stale until the next observation. Shared Knowledge checks terrain, base costs/passability and closures; it is not a current crowd-density map or a communication channel.

Terrain descriptions are cached and immutable: agents cannot accidentally mutate host costs through a shared observation object. Intersections require observed road arms at least two cells long in every direction, avoiding false discoveries at the center of a three-cell-wide straight avenue.

## Generation and editing

`src/abstract-manhattan.js` produces seeded orthogonal streets, rectangular clusters, parks, construction and activity zones. Shared street rows and avenue gaps maintain connectivity; depots, targets and chargers sit on reachable roads. Seed and generator provenance remain in JSON. All cells are editable afterward. Small supported rasters retain examples of every new base category.

`EnvironmentEditor` adds square brushes, inclusive rectangle fills, and connected-region flood fills without replacing its stroke history. Batch notifications avoid one UI refresh per filled cell. Each gesture remains one undo operation. Rectangle previews are temporary renderer state and never become scenario data. Erasing still targets just one layer.

Settings edits retain active agents and memory. Route caches are invalidated without delivering changed remote coordinates or values. Observed newly blocked route cells and physically rejected move attempts increment obstacle-encounter metrics; hidden edits alone do not.

## Measured comparisons

Explored percentage, known landmarks, current route length, travel, delivery/tour time, replans, obstacle encounters, energy and first/later delivery metrics use actual run data. The retention toggle still applies at the next trip boundary.

The paired experiment offers 600, 1,200 and 2,400 simulated seconds per condition. The wide-city default is 2,400 because larger scenes take longer to search. Conditions use fresh cloned geometry, identical seed/population/sensing, separate memory, and the fixed timestep. No speedup or completed sample is fabricated. A small-city check (32 × 32, four agents, seed 1, 600 seconds) completed 51 deliveries and 14 tours without collisions or invalid terrain moves. These are one measured run, not a general performance guarantee.

## Files

Added: `src/terrain.js`, `src/abstract-manhattan.js`, `src/panels.js`, `tests/abstract.test.js`, and this document.

Extended: `index.html`, `styles.css`, `README.md`, `src/main.js`, `src/editor.js`, `src/environment.js`, `src/scenario.js`, `src/camera.js`, `src/visualization.js`, `src/agent-ui.js`, and the agent navigation/world/perception/memory/state/simulation/decision modules. Existing tests were retained, with display/default-grid expectations updated; renderer and application-entry tests also cover the new controls.

The original schematic generator, core known-map search algorithm and isolated comparison runner are reused. Browser runtime dependencies and repository identity are unchanged. The temporary native canvas tool used for visual QA is outside the repository and is not an application or test dependency.

## Verification and limits

- Full suite: **57 passed, 0 failed**. Checks cover old functionality plus semantic rules, reproducible/connected generation, new editing gestures, rule undo/redo, legacy JSON, observed-only costs, congestion-aware paths, hidden-occupant isolation, timestamps, obstacle encounters, repeated tasks, occupancy safety, panel/mode wiring and fullscreen resize/camera behavior.
- Every source and test module passes `node --check`; local module imports resolve and HTML IDs are unique.
- All **24 local HTTP content/MIME checks passed** for the page, CSS, current documentation and source modules. The existing server serves the exact workspace files. `git diff --check` passed, and the repository remote remains unchanged.
- Actual Canvas 2D output was rendered offscreen using the current renderer, grid and simulation. Normal, path-density and individual knowledge images were visually inspected; shared/landmark modes were also rendered. This verifies map output independently of browser CSS.
- Browser/native-app access hosts were unavailable. Actual interactive browser layout, fullscreen API and desktop/mobile visual usability checks remain pending; the README includes a checklist. DOM/camera tests do not substitute for those checks.
- Geography remains schematic; energy is an uncalibrated effort model; runtime movement is cardinal. Missing chargers, unreachable goals, impossible one-cell deadlocks and insufficient comparison time can leave incomplete trips or missing samples.
- Scenario JSON preserves the environment, starts, rules and seed, not session-only agent memories/trips.

Preview: `npm start`, then http://127.0.0.1:4173. Tests: `npm ci` followed by `npm test`. No commit, push, merge, deployment, remote change or reference-repository modification is included.
