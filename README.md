# Pixel City Spatial Simulation — Manhattan Pixel Lab

**Research question:** How do different spatial configurations influence the navigation, learning, and performance of autonomous agents?

**DESIGN → RUN → COMPARE → SELECT → ITERATE.**

A full-screen, editable **128 × 72 abstract Manhattan-inspired pixel city** with autonomous Explorer/Courier agents. Built with vanilla HTML/CSS/JavaScript ES modules and Canvas 2D, with no backend or runtime dependencies.

The original compact map generator is restored: connected orthogonal black roads, blue building blocks, green parks, orange construction, pink crowd zones and yellow destinations. **This is schematic, not real Manhattan GIS data.** The application does not load the full-island raster or require geographic datasets.

## Run locally

```sh
npm start
```

Open **http://127.0.0.1:4173**. Only Python 3 is required to serve the app; no installation/build step is needed. Alternatively run `python3 -m http.server 4173 --bind 127.0.0.1`. If this repository is already served there, refresh the existing page. ES modules require HTTP rather than `file://`.

Tests use Node.js 20+ and a development-only DOM dependency:

```sh
npm ci
npm test
```

All asset/module URLs are relative for GitHub Pages project subpaths. These commands do not commit, push or deploy anything.

## GitHub Pages preparation

Expected URL: **https://cqz623.github.io/manhattan-pixel-simulation/**. The site remains buildless; `npm run build` only copies its public files into ignored `dist/`. Verify the staged site beneath the repository prefix with:

```sh
npm run build
npm run check:pages
```

The prepared `.github/workflows/pages.yml` runs tests, packages and validates the site, then publishes using official Pages actions **automatically on pushes to `main`**. Manual dispatch on `main` remains available. The production path is `/manhattan-pixel-simulation/`; existing relative asset URLs work beneath it without rewriting the application. Nothing has been committed, pushed or deployed. After approval, set **Settings → Pages → Source: GitHub Actions**, then commit/push the complete project; that push will trigger publication. See [publication instructions and verification limits](docs/GITHUB_PAGES.md).

## Map and editing

The entire rectangular city fits the available viewport with square cells. Panels float over the fixed canvas; opening panels and changing knowledge modes do not resize the grid. Zoom with the wheel or +/- buttons; pan with Space + drag, middle drag or Pan. **Fit Grid** restores the complete map. The entire city is initially active; the existing custom-area selection and active-area zoom remain available.

Open **Editor** to use:

- Single-cell or 3/5/9-cell square brushes, click or drag with interpolated strokes.
- Rectangle fill and connected-region flood fill.
- Layer-specific erasing; dynamic entities and semantic landmarks never replace static terrain.
- Undo/redo, one action per gesture/preset/rule edit, with 60-action history.
- Seeded abstract generation and square/rectangular resolution presets; the classic schematic generator remains available.
- Construction, Crowd, Passage and Destination presets.
- Reset changes / Restore Original A or the loaded scenario; replacements are undoable.
- Save/Load JSON, preserving layers, dimensions, rules, seed, source and simulation settings. Legacy/plain-array and larger RLE scenarios remain compatible. Runtime memory/results are session-only.

Keyboard: `B/R/G/E` = Brush/Rect/Fill/Erase, `I/H` = Inspect/Pan, `F` = Fit Grid, `+/-` = Zoom, Cmd/Ctrl Z and Shift Z = Undo/Redo. Arrow keys select a cell; Enter applies the current edit tool.

Abstract parks are traversable at configurable costs. New agent/landmark/depot/destination placements require walkable cells. Buildings and blocked construction prevent movement; construction can alternatively impose high cost. Crowd cost combines a configurable base (default 2.5, range 1–8) with detected nearby occupants. The Congestion preset uses base 2.5 without added pedestrians. Depots/destinations are semantic landmarks over walkable terrain. Robot painting changes saved starts for the next reset, not live positions. Terrain/rule edits preserve agent memory and enter it only when sensed.

## Simulation and comparisons

The existing controls remain: Play/Pause/Step/Reset, 1×/4×/16× speed, 2–10 agents, seed, sensing range and Use Landmarks. Default: four agents, six-cell sight, four assigned tasks per courier. **Simulation Reset** clears runtime memory/history and keeps the edited map.

Explorers discover frontiers and landmarks; when enabled, observed orientation landmarks become explicit goals and visited places can anchor frontier routes. Couriers discover their depot and assigned destinations, route through known space and repeat deliveries with accumulated memory. Both retain limited perception, wall/corner occlusion, independent spatial memory, observed-occupant avoidance and route replanning. The restored default uses the current Explorer/Courier mode; legacy Visitor/Courier scenarios remain supported.

Inspect an agent to see its known/unknown/visible area, remembered landmarks, planned route, actual trail and metrics. Global grid and relative semantic locations remain available. Read-only distance measurements distinguish Manhattan distance, known least-cost route steps and weighted cost. No geographic coordinates are invented for the abstract grid.

Knowledge modes are preserved:

| Mode | Actual data |
| --- | --- |
| No Layer | Colorful terrain and runtime occupants |
| All Paths | Cumulative actual cell arrivals |
| Landmark Heatmap | Distinct agents remembering discovered places |
| Shared Knowledge | Current terrain knowledge overlap, not communication |
| Individual knowledge | Only the selected agent's observations, memory, plans and trail |

**Environment A/B** now supports the full design workflow:

1. **Save current as A** captures an immutable baseline and experimental conditions. **Duplicate A → B**, then edit B. View A/B without changing the baseline.
2. **Run matched A + B** evaluates fresh isolated runs with identical starting cells/headings, types/counts, assignments/pickups, seed, sensing, landmark strategy, battery policy, memory and simulated deadline. The displayed map switches to the actual condition being run. Individual A/B runs are also available.
3. Compare success, successful delivery time, route length, weighted cost, Manhattan benchmark, **Explorer-only coverage**, Explorer discovery/cost, replans and first/later task times. Unfinished tasks remain in the success denominator; missing time samples show —. Weighted movement cost is separate from physical steps and legacy energy effort.
4. Inspect exact changed cells, recorded paths, remembered places and terrain-rule changes. After both matched runs finish, use **Select A** or **Select B** based on the measured tradeoffs. No winner is assigned automatically. Selection records the completed iteration and preserves its actual results.
5. **Next Iteration** uses the selected archived environment as the new A, even if another map was subsequently previewed. Its measured baseline, full conditions, paths and knowledge are retained with a source scenario ID; this does not imply a new run. Duplicate A into B and edit manually, or **Generate 2–3 Variations** with route-valid passage/construction/crowd/landmark edits. B begins with empty memory under the same starts/tasks/seed/deadline. Generating variations immediately after selection also advances to the next iteration.
6. Expand **Experiment History** for each completed iteration: parent, exact change summary, configuration, duration, A/B success, successful delivery time, travel cost, coverage, replans and your selection. **Inspect A**, **Inspect B** or **Overlay** revisits actual archived evidence without replacing the current editable study. **Return to Current Iteration** restores its map, results and camera. All scenario snapshots, including unevaluated drafts marked with —, are also inspectable. **Export study JSON** (version 2) saves maps, full conditions, exact changes, spatial records and iteration decisions. Evaluated results cannot be overwritten by later runs. Study import and automatic browser persistence are not implemented; export before closing the page.

Editing during a run cancels incomplete results. A new grid, generator/seed/profile or active area requires a new A; earlier records remain in history. Connected layouts can still fail under limited knowledge or finite time. No improvement is guaranteed or hardcoded. The separate landmark-retention experiment remains available.

## Spatial comparison and validation presets

Knowledge → Experiment presets → choose **1 · Shortcut**, **2 · Congestion** or **3 · Landmark** (the Road Closure Test remains under additional validation) → Load demonstration A/B pair → Run matched A + B. Each uses a 40 × 28 authored abstract testbed, seed 1, four agents, sight 6, landmarks enabled, four tasks per courier and 480 simulated seconds. At 16×, each condition takes about 30 seconds of playback; optional Fast calculation skips real-time pacing.

- **Shortcut:** B opens a cross-block connection. Compare geometric distance with actual routes, time and measured shortcut use.
- **Road Closure:** B blocks four central road cells that A actually uses, while preserving a bypass.
- **Crowd / Congestion:** B applies cost 2.5 to part of the central road. Compare a short costly route with a longer bypass, observed rerouting and delivery time.
- **Landmark:** B adds eight orientation features. Compare discovered places, Explorer goals/cost, replans and repeated courier tasks. Only discovered landmarks can influence decisions.

Run the same actual model headlessly:

```sh
node scripts/run-experiments.mjs
node scripts/validate-iterations.mjs
```

After both runs, use **Show A Paths**, **Show B Paths**, **Overlay A/B**, **Show Changed Cells**, and optional discovered-cell/landmark comparison. A is solid cyan; B is dashed pink. Overlay uses B terrain, clearly labeled. Recorded views are read-only; Live World or an editing tool returns to the editable map without changing the camera. The explanation reports exact sensed/entered cells, route-sequence differences and actual metric changes, rather than inventing a causal story.

**Replans now means meaningful changes to unfinished routes**, not every path computation. Initial plans, normal frontier/task continuations, unchanged paths and no-route searches have separate diagnostics. Agents react to edited terrain only through sensing or a real rejected move; there is no global edit-triggered route reset. Empty crowd terrain now defaults to cost 2.5 rather than road-like cost 1; an explicit custom cost 1 remains supported. Prior results use different metric/cost semantics and should be rerun together. See the [detailed A/B audit](docs/AB_VALIDATION.md).

Full 960-second identity and fast/frame-accumulated checks plus the three validation presets can be reproduced with:

```sh
node scripts/validate-ab.mjs
```

[Phase 4 workflow report](docs/PHASE4.md) and [iteration validation output](docs/ITERATION_VALIDATION_RESULTS.json) cover both selection branches, retained baseline replay, valid variations, immutable history and all three final experiments. [Earlier A/B validation output](docs/AB_VALIDATION_RESULTS.json) includes actual initial states, per-cell exposure, completed delivery records and spatial fingerprints. Measured results, complete conditions, changes and trips are in [docs/experiments/results.json](docs/experiments/results.json). Outcomes vary by configuration/seed; the new shortcut is used but is slower overall in the saved seed-1 run. These are model results, not NYC travel predictions or statistical findings. See [recording and presentation plan](FINAL_DEMO_PLAN.md).

## Real-world data without geographic geometry

Enable **Editor → Use NYC park-type ratio** before generating. A verified NYC Parks property-type snapshot contains 66 Neighborhood Park records out of 396 selected Manhattan property records. The optional mapping uses **66/396 = 16.7%** as an additional random park-block probability, replacing the normal 11%. This is an explicit simulation-design assumption, not land-cover area or actual park distribution. Roads and all block shapes remain abstract; no island or GIS street geometry is loaded.

The tiny runtime profile records source URL, date, counts, fingerprint and transformation. Saved scenarios remain schematic and preserve a profile ID/attribution. See [source, API verification, CSV and method](data/PARK_PROFILE.md). To reproduce the profile from the retained snapshot:

```sh
python3 scripts/build-park-profile.py
npm test
```

## Architecture and restoration

- `src/abstract-manhattan.js`: retained original map generator plus a small adapter selecting the current Explorer/Courier mode over the entire grid.
- `src/main.js`, `index.html`, `styles.css`: abstract default, generation and map controls; island-specific controls removed.
- `src/environment.js`, `terrain.js`, `editor.js`, `scenario.js`: unchanged layered environment, semantics, editing/history and JSON support.
- `src/agents/`: unchanged perception, memory, navigation, planning and simulation.
- `src/visualization.js`, `raster-cache.js`, `camera.js`: existing overlays/camera; full-grid active areas no longer add a redundant dashed boundary.
- `src/ab-comparison.js`, `ab-ui.js`, `comparison.js`, `agent-ui.js`: fixed studies, comparison UI, preserved retention experiments and live Inspector.
- `src/scenarios.js`, `design.js`: immutable evaluated records, completed iteration decisions, retained baseline provenance, lineage/export, exact changes and valid distinct alternatives.
- `src/experiments.js`: deterministic Shortcut, Congestion and Landmark experiments plus the preserved Road Closure validation.
- `src/agents/planning-metrics.js`: meaningful replan events and separate search diagnostics.
- `src/spatial-comparison.js`, `comparison-renderer.js`: immutable observed histories, per-cell/route analysis and retrospective overlays.
- `data/nyc-park-profile.js`, CSV and build script: optional verified count-based generation input.

Git contains only the initial README commit, so a pre-island commit could not be checked out. The original abstract generator survived in the working tree and was reused **without changing its map geometry**. No application rebuild or repository-wide reset was performed. Prior GIS source assets/import helpers and their regression tests remain inactive historical/compatibility material; they are outside the application's import graph and have no restore button in the interface. Historical full-island documentation describes the earlier milestone, not the current default.

See [semantic model](SEMANTIC_MODEL.md), [final requirement matrix](FINAL_REQUIREMENTS.md), [final implementation and changed files](docs/FINAL_IMPLEMENTATION.md), [restoration history](docs/ABSTRACT_RESTORE.md) and [reference implementation audit](docs/REFERENCE_AUDIT.md).

## Verification

**98 tests pass**, covering connected roads/reachable missions, restored default roles and map independence from GIS, navigation/collision avoidance, limited memory and perception, overlays, editing/history, regeneration/reset, JSON, camera fitting/zoom/pan, custom areas, both comparison workflows, independent scenario history/export, next-iteration alternatives, all validation presets, exact runtime cost/Explorer metrics, the optional data transformation, meaningful replan reasons, recorded overlays and precise fast/frame equivalence.

The actual renderer was checked using native offscreen Canvas output. Browser interaction/CSS layout QA remains unavailable because the browser host cannot start; DOM tests and mathematical camera checks do not replace browser layout testing. Movement costs/times are model units, not real-world travel predictions. Constrained deadlocks or insufficient observation time can leave deliveries incomplete.
