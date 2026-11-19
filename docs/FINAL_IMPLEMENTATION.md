# Final project implementation report

Research question: **How do different spatial configurations influence the navigation, learning, and performance of autonomous agents?**

The existing application was extended in place. The default remains the retained 128 × 72 abstract Manhattan-inspired pixel city. The island map, GIS street geometry and silhouette were not restored. No backend, runtime dependency, repository reset, commit, push, deployment or Git remote change was introduced.

## Existing systems audited and preserved

The project already had centralized terrain semantics, four independent environment layers, deterministic abstract generation, editor/history, camera, Explorer/Courier and legacy Visitor behavior, bounded occluded perception, timestamped spatial memory, known-map Dijkstra/frontier planning, actual movement/landmark/shared overlays, relative locations/distances and fixed-cohort A/B runs. Existing regression tests were run before changes and retained.

## Completed work

- Explicit Save current as A, duplicate/edit B, matched sequential A+B execution and separate A/B runs. The canvas displays the environment actually being run, with fresh memory in each condition.
- Per-scenario map/result/condition snapshots, IDs, parent lineage, iteration and timestamps. Evaluated snapshots survive later editing; manual edits create drafts/children. Selected maps seed the next iteration. Study JSON export includes exact changed cells/rules, maps, conditions and completed-trip evidence.
- Two or three distinct route-valid alternatives: small construction/crowd treatments, a passage or orientation landmark. Start/goal cells are protected; host connectivity checks include fixed assignments and every active-area depot/destination. Insufficient alternatives are reported, not duplicated.
- Three reproducible abstract test pairs: Shortcut, Congestion and Landmark. Outcome values come from real simulation runs, and actual treatment-cell visits/observers verify discovery/use.
- Explorer-only coverage, discovery and weighted cost, separate from all-agent coverage. Actual movement-weighted cost is separate from step count and legacy energy effort. Comparison adds a recorded pickup→target Manhattan benchmark and first/later task metrics.
- Discovered orientation landmarks become Explorer goals when enabled and can later anchor frontier plans. Hidden landmarks remain unavailable to planning. Fixed an Explorer waypoint case that incorrectly entered charger handling.
- Interactive placement validation for new agents/goals/landmarks on walkable terrain, while preserving the lower-level editor's existing compatibility behavior. Crowd base cost is configurable; the congestion experiment uses 2.5 without added pedestrians.
- Optional verified NYC park-type counts informing abstract park-block generation. The live aggregate API verified 17 categories, 396 selected property records and 66 Neighborhood Park records. The saved ratio changes one simulation parameter; no source geographic shapes enter the app.
- Requirement mapping, semantic documentation, instructions, three-experiment recording plan and actual headless experiment output.

## Files changed or added for this task

| Area | Files |
| --- | --- |
| Existing model and editing | `src/terrain.js`, `src/scenario.js`, `src/editor.js`, `src/abstract-manhattan.js` |
| Agent state/decisions/measurement | `src/agents/state.js`, `src/agents/agent.js`, `src/agents/simulation.js` |
| Design and comparison | `src/design.js`, `src/ab-comparison.js`, `src/ab-ui.js` |
| New scenario/experiment modules | `src/scenarios.js`, `src/experiments.js` |
| Interface | `src/main.js`, `src/agent-ui.js`, `index.html`, `styles.css` |
| Small real-data input | `data/nyc-park-profile.js`, `data/nyc-park-types.csv`, `data/PARK_PROFILE.md`, `scripts/build-park-profile.py` |
| Reproducible evidence | `scripts/run-experiments.mjs`, `docs/experiments/results.json` |
| Tests | `tests/final-project.test.js`, `tests/ui.test.js`, `tests/abstract.test.js` |
| Submission documentation | `README.md`, `SEMANTIC_MODEL.md`, `FINAL_REQUIREMENTS.md`, `FINAL_DEMO_PLAN.md`, this report |

The raw geographic snapshot, island factory, historical reports and earlier compatibility tests were not repurposed as the active map. They remain inactive archival/compatibility files. Several project files were already untracked before this task, so Git status alone does not identify which changes belong to this milestone.

## Verification performed

- **84 tests passed, 0 failed**, including all previous regression cases, new model tests and expanded real-HTML/entry-point tests. Coverage includes valid terrain/connected missions, layer edits/history, hidden information, perception/memory, meaningful landmarks, two location frames, distance/cost, replanning, occupancy safety, matched studies, actual metrics, distinct alternatives, lineage, result preservation/export and the data transformation.
- All **40** checked JavaScript source/test/script/profile modules pass syntax/import resolution checks. HTML IDs are unique and relative local assets resolve. The Python profile extractor compiles, and `git diff --check` passes.
- Existing localhost preview returned **11 HTTP 200 responses**, with bytes exactly matching workspace files, for the page, principal modules, small profile/CSV, stylesheet and submission documents.
- Native offscreen Canvas rendered the actual default scene and all four knowledge views for each actual 480-second demonstration state at 1440 × 900. The compact map, congestion/path view and individual landmark-memory/trail view were visually inspected; view changes preserved the camera. These are real model renders, not browser screenshots.
- The original NYC source hash and category counts are verified by tests. The public aggregate API was queried read-only and matched the saved 66/396 ratio. No live GIS service is required by the application.
- Actual three-preset outputs were regenerated using `node scripts/run-experiments.mjs`; their fixed conditions, per-cell changes and completed trips are saved in `docs/experiments/results.json`. Unit tests recompute metrics from runtime/trip data and reproduce the runs exactly.

## Requirement status and remaining work

The supplied software requirements are implemented and verified at the model/DOM level: semantic model, distinct location frames, both distances, two agent types, limited perception/partial knowledge, memory/landmarks, goals/planning/interactions, truthful views/metrics, design comparison/selection/iteration, valid alternatives, three presets and a real-world data secondary component. See the detailed [requirement matrix](../FINAL_REQUIREMENTS.md) for code/test evidence and explicit status.

Actual browser interaction/CSS/fullscreen QA remains **partial**. Browser inventory returned no usable browser or native app because the access host could not start. Automated DOM/camera checks and native Canvas renders do not verify real browser layout. A manual check at common desktop sizes should precede recording.

The instruction-manual **video and final slide deck have not been produced**. A recording script and suggested diagrams are supplied in [FINAL_DEMO_PLAN.md](../FINAL_DEMO_PLAN.md). No video, screenshot, experimental winner or citation was fabricated. Any course rubric beyond the supplied text still needs review against the original assignment.

Model limits: single-seed experiments are not general conclusions; movement costs/times are assumptions; no direct agent communication, automatic persistence or study-import UI; narrow deadlocks or finite-time failures may remain. The secondary data's count-share→probability mapping is a simulation assumption, not land-cover measurement or geographic reconstruction.

Local preview: **http://127.0.0.1:4173**. Existing server left running.
