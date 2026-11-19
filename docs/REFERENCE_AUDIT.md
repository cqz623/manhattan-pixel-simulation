# Parcel compatibility and licensing audit

Reference: [syy1355890318/environment-simulation](https://github.com/syy1355890318/environment-simulation), `main` commit **415d341fe400af3ad5bba344e62d09d9c4e22734**, inspected 2026-11-18 through read-only GitHub connector calls. The reference repository, the Manhattan working directory, and Git remotes were not changed.

The supplied live URL could not be retrieved through web/browser tooling in this session. Source files and documentation were available through GitHub and were inspected directly.

## Reuse decision

GitHub repository metadata reports `license: null`. Root contents contain no project `LICENSE` or comparable application-wide license. The README identifies only a vendored Three.js dependency, with `dist/vendor/THREE-LICENSE.txt` granting MIT terms specifically for Three.js and crediting its authors. That dependency notice does not establish reuse permission for Parcel's application modules.

Following the user's requested fallback, **all new simulation, perception, memory, planner, overlay, UI, and test code here was independently implemented** from the requested behaviors. No Parcel code or assets were copied, and Three.js is neither included nor used. There are consequently no incorporated third-party runtime files requiring a copied Parcel or Three.js notice. This document retains attribution to the conceptual reference. `linkedom` is an npm development dependency used solely for tests, with its own license distributed by npm and its version/integrity recorded in `package-lock.json`.

## Compatibility mapping

| Inspected reference file | Reference concern | Independent Manhattan implementation |
| --- | --- | --- |
| `dist/nav.js` | Fixed-size navigation grid in x/z meters | `agents/nav.js`: arbitrary current grid dimensions and integer x/y coordinates; same indices as the canvas |
| `dist/agent-world.js` | Truth from fixed city, places and hindrances | `agents/world.js`: editable four-layer raster, opaque dispatch identities, host spawn/collision validation |
| `dist/perception.js` | Cone, near awareness and occlusion | `agents/perception.js`: six-cell configurable 100° cone and supercover wall/corner occlusion |
| `dist/agent-memory.js` | Observed cells, landmarks, travel associations, trip retention | `agents/memory.js`: nullable observed records, stale temporary conditions, inferred intersections, learned distances, movement/delivery histories |
| `dist/planner.js` | Known-map routing, frontiers, smoothing | `agents/pathfinding.js`: weighted Dijkstra/frontiers, cardinal runtime movement, safe optional diagonals; no free-space smoothing that could break raster alignment |
| `dist/agent.js` | Visitor/courier decisions and avoidance | `agents/agent.js` + `state.js`: repeated tours/pickup-delivery, observed-only goals, charging, deterministic local recovery |
| `dist/agent-sim.js` | Fixed steps, occupants, seeds, aggregation | `agents/simulation.js`: 0.2 s grid steps, seeded pedestrians, rotating priority, actual arrivals and current-state knowledge overlap |
| `dist/agent-overlay.js` | Three.js figures, collective layers, individual veil | Existing Canvas `visualization.js`: cell-aligned density/count fields, remembered terrain, perception tint, distinct plan/trail styling |
| `dist/agent-ui.js` | Cards, goal/trip/performance wording | `agent-ui.js`: compact controls, individual knowledge details, real performance summaries, cancellable paired experiments |
| `tests/agents.test.js` | Sensing, no-leak, memory, planner, reuse, avoidance, aggregate assertions | Independent Manhattan fixtures/tests plus unchanged original editor checks and full-entry DOM tests |

The reference README and `package.json` were also reviewed. The dependency-specific Three.js license was read. No 96 × 72 m dimensions, reference gates, fixed exhibit coordinates, city geometry, Three.js meshes, or reference empirical performance claims were imported.

## Experimental differences made explicit

- Terrain and entity placement remain editable and schema-compatible with Manhattan Phase 1. Slow terrain and chargers are additive palette types.
- Dispatch identifies tasks without supplying positions. Only observations populate place coordinates in memory. Simulation physics and aggregate validation have host access to the raster; agent decisions do not.
- Both experimental conditions retain terrain and last-observed closure state. The disabled condition clears semantic place locations, landmark graph links and search coverage on each new trip, without altering current trips.
- Temporary closures are actual obstacles. Pedestrians move independently and reserve occupancy. Inaccessible landmarks and impossible deadlocks are reported, not bypassed with omniscient routing or teleportation.
- Shared Knowledge validates remembered terrain/closure values against current host state. It measures overlap, with no communication mechanism implied.
- Comparison values are generated from two isolated runs and actual completed trips. No fixed speedup or fabricated improvement is encoded.

Future work can add explicit communication policies, richer task assignment and energy models, GIS rasterization, and environment optimization without replacing the existing editor or renderer.
