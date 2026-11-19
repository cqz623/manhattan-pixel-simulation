# Phase 4 — environment iteration and final experiments

The existing abstract Pixel City, agent model, editor and A/B engine were extended in place. No geography, simulation-learning behavior, automatic optimization, dependencies or deployment was added.

## Verification before changes

All **98 existing tests passed** before implementation. The existing `validate-ab.mjs` also passed identical-map replay, full 960-second fast/frame-accumulated equivalence and route-valid treatments. Recorded trajectories, changed-cell classifications, limited-memory planning, terrain costs and meaningful replan accounting were already implemented and tested. No critical simulation-engine defect was found during this phase.

The remaining workflow gaps were text-only history, no explicit Next Iteration action, no completed-iteration decision record, and losing a selected run's measured baseline when capturing the next A. Candidate selection could also be offered before measurement, and the interface ranked outcomes by success/time. These were corrected without changing the agent engine.

## Implemented workflow

1. Save and run A; duplicate/edit B or generate alternatives; run B under A's frozen conditions. The existing Run matched A + B remains available.
2. **Select A / Select B** requires complete, matched results. The user decides from the measured tradeoffs; the UI assigns no winner. The chosen geometry becomes the working environment and both measurements stay archived.
3. Selection records a numbered iteration with parent environment/iteration, actual cell/rule changes, full plan/seed/configuration/deadline, both scenarios' success, successful delivery time, total weighted travel cost, coverage and meaningful replans, plus the selected ID. A decision can be revised before advancing; advancing closes that iteration.
4. **Next Iteration** loads the selected archived geometry rather than whichever map happens to be previewed. Its measured result, trajectories and knowledge become A with explicit `measurementSourceId` provenance. Starts, headings, assignments, seed, sight, strategy, task budget and deadline remain identical. New simulations still begin with empty agent memory; archived knowledge is evidence, never injected into agents.
5. Duplicate/edit B or generate two–three route-valid alternatives and repeat. Generating variations immediately after selection also advances, preserving the existing shortcut workflow. Manual edits record the actual viewed parent scenario.
6. **Experiment History** has compact expandable iteration rows with all required metrics, actual changes and configuration. Inspect A/B/Overlay reuses the same comparison renderer and recorded observations. All scenario snapshots, including unevaluated drafts, are inspectable. Missing measurements stay —.
7. Historical inspection is read-only. The current draft, selected decision and runtime state are preserved, live playback pauses, and live metrics/agent controls are hidden or disabled to avoid mixing states. **Return to Current Iteration** restores its comparison and camera. Historical grids fit independently with square cells; zoom/pan remain available. Editing returns to the working study.

Evaluated results reject replacement by different measurements; exact deterministic replays leave the stored evidence unchanged. The three treatment-exposure counters on a carried baseline are cleared because they refer to the previous A/B treatment. Core metrics, trips, spatial records and the original source result remain unchanged. Fresh baseline replay verifies the carried result exactly.

Study export is now `pixel-city-study` version 2, retaining `scenarios` and adding `iterations`. Data remains session-only until exported; study import and automatic persistence are outside this phase.

## Three final presets

The existing 40 × 28 abstract testbeds were reused, with clearer experiment names/questions. All use seed 1, four agents (two Explorers/two Couriers), sight 6, landmarks enabled, four tasks per Courier, 480 simulated seconds and empty initial memory. Road Closure remains available as additional validation.

- **Shortcut:** opens 56 blocked central cells as a useful two-cell-wide passage, preserving starts/goals and a connected road network. Tests physical connectivity under limited initial knowledge.
- **Congestion:** changes 24 central road cells to crowd terrain at base cost 2.5. This segment is used in A; no new pedestrians confound the prescribed initial cohort.
- **Landmark:** adds eight recognizable semantic orientation features over unchanged terrain. Tests actual discovery/reuse and resulting navigation/repeated-task behavior.

Neither the presets nor their displayed explanations encode winners. Route differences, sensed/entered cells and performance changes come from actual run records. Additional seeds are needed for broader claims.

## Actual validation results

**104 tests pass, zero failures or skips.** This includes all 98 previous tests plus new archive/iteration, actual DOM workflow and historical-camera checks. The headless Phase 4 validator additionally exercises both A/B selection branches for every preset, fresh baseline replay, valid alternatives, a second completed iteration, unchanged prior evidence and saved-route reconstruction.

| Preset | A/B deliveries | Mean successful time A → B | Weighted total cost A → B | Coverage A → B | Meaningful replans A → B |
| --- | --- | --- | --- | --- | --- |
| Shortcut | 8/8 → 8/8 | 31.550 → 39.850 s | 1010.2 → 1277.3 | 40.982 → 50.268% | 4 → 9 |
| Congestion | 8/8 → 8/8 | 39.850 → 32.375 s | 1277.3 → 1272.2 | 50.268 → 50.268% | 9 → 19 |
| Landmark | 8/8 → 8/8 | 39.850 → 39.175 s | 1277.3 → 1286.5 | 50.268 → 50.268% | 9 → 11 |

These are single-seed observations, not a ranking or proof of a unique causal mechanism. Total travel cost includes all agents and post-task movement; mean successful time includes completed Courier tasks only. The Landmark preset recorded reuse 13 → 19, with first/later mean delivery times 64.4/31.667 → 65.6/30.367 s; the UI does not attribute those differences solely to landmark reuse.

Checks passed:

- Both selection branches carry the exact selected map and measured evidence into the next A, even after previewing the other map.
- Controlled starts, assigned workloads, memory initialization and deadlines remain matched.
- Identical replay and fast/frame-accumulated B results are exactly equal for each final preset, including full spatial records.
- Old scenarios/results remain unchanged through selection, iteration, variation and historical inspection; different replacement results are rejected.
- Changed environments and generated alternatives preserve connected required starts/goals. Recorded path edges equal actual trail transitions; no paths are inferred.
- Recorded paths, discovered cells, remembered landmarks, per-cell explanations and the editor/undo/reset/JSON workflow remain covered.
- Historical 40 × 28 and live 128 × 72 maps fit separately; inspection does not replace editable layers; camera, selection and viewport restore correctly.
- Local HTTP smoke check: the page, stylesheet and seven affected runtime modules all return 200 and exactly match repository files.
- Native Canvas rendering produced actual recorded overlays for all three presets. The Landmark image was visually inspected: flat, square cells, correct colors, cyan/pink trajectories and remembered places. These are map renders, not browser screenshots.

Reproduce:

```sh
npm test
node scripts/validate-ab.mjs
node scripts/validate-iterations.mjs
```

[Machine-readable Phase 4 results](ITERATION_VALIDATION_RESULTS.json) include exact plans/changes, measured outcomes, path fingerprints, paired completed routes, per-cell exposure, factual explanations and both iteration branches. Existing full trajectory evidence is retained in [experiment results](experiments/results.json). Native map-only previews: [Shortcut](previews/iteration-shortcut-overlay.png), [Congestion](previews/iteration-congestion-overlay.png), [Landmark](previews/iteration-landmark-overlay.png).

## Files changed in this phase

- `src/scenarios.js`: immutable results, completed iterations, manual decisions, next-baseline provenance and study export v2.
- `src/ab-comparison.js`: reconstruct comparisons from archived records without regenerating initial conditions.
- `src/ab-ui.js`: selection guards, explicit next action, archive inspection/return, factual results and full history.
- `src/experiments.js`: labels/questions for the three existing final presets; map geometry and treatments retained.
- `src/visualization.js`, `src/main.js`, `src/agent-ui.js`: independent historical camera/inspection, safe return to editing and clearly separated live controls/metrics.
- `index.html`, `styles.css`: compact Next Iteration/history controls, preset ordering and selection labels in the existing floating panel.
- `tests/iterations.test.js`, `tests/ui.test.js`, `tests/renderer.test.js`: repeated selection/iteration, immutable evidence, history inspection, preserved editor and camera verification.
- `scripts/validate-iterations.mjs`, `docs/ITERATION_VALIDATION_RESULTS.json`: reproducible measured workflow evidence.
- `README.md`, `FINAL_REQUIREMENTS.md`, `FINAL_DEMO_PLAN.md`, this report and three `docs/previews/iteration-*-overlay.png` files: current workflow instructions and evidence.

## Remaining Final Assignment work

The computer-use host reported no available browser/native surfaces. Actual desktop CSS layout, fullscreen and manual pointer interaction QA remain unverified; DOM/camera/Canvas checks are not represented as a browser review. A recorded instruction-manual video and final presentation/slide deck remain to be produced, following `FINAL_DEMO_PLAN.md`. Verify any additional course rubric against the assignment. No commit, push or deployment was performed.
