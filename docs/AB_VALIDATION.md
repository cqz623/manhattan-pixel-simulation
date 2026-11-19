# A/B simulation audit and spatial behavior validation

This task extended the existing compact abstract Pixel City. A/B capture, duplication, matched runs, editing, iteration, Explorer/Courier behavior and memory were retained. No Manhattan geography, repository reset, dependency, commit, push or deployment was added.

## Finding: nearly equal results can be legitimate, but two implementation issues mattered

The exact user-edited A/B files behind the reported **237 versus 237.2 s** and **3,189 versus 3,202 replans** were not supplied, and browser access was unavailable. Those exact B values cannot be certified from the repository alone.

Before modifying code, an actual default-map sample was recorded: 128 × 72, map seed 1, simulation seed 1, four agents, sight 6, landmarks on, 960 s, four-cell variation seed 1. A and B both completed 6/8 tasks with mean successful time **237.033 s**, identical movement distance and **3,825 old “replans.”** See [pre-fix measurement](AB_BEFORE_AUDIT.json).

Its changes and exposures were:

| Cell | Treatment | A entries | B entries |
| --- | --- | ---: | ---: |
| (0, 0) | Road → blocked construction | 0 | 0 |
| (98, 0) | Road → crowd | 0 | 0 |
| (108, 3) | Road → crowd | 1 | 1 |
| (23, 43) | Road → crowd | 1 | 1 |

The closure was correctly impassable but never entered in A. The old empty-crowd base cost was **1**, equal to a road. With no nearby detected occupancy at those crossings, painting pink could add no base movement penalty. Equal routes/times in that sample were therefore plausible, but the crowd treatment did not implement a default hindrance.

Corrected default crowd base cost is **2.5**, with the existing occupancy surcharge. Explicit custom cost 1 is still respected; the panel shows 1 → 1 and explains that no base penalty was added. This is a documented semantic correction, not a forced performance difference. Existing results using the old default should not be compared as if the model were unchanged.

## Finding: old Replans counted routine computation

The old decision loop incremented Replans whenever it computed another path after the first, including normal next-frontier/next-task routes and repeated searches with no route. Recovery also incremented the same counter. A total near 3,200 was not a reliable count of actual plan revisions.

**Metric version 2** counts replacement or abandonment of an unfinished route after:

- A perceived obstacle invalidates it.
- Newly sensed space or costs reveal a strictly cheaper, different preferred route.
- An active navigation goal changes.
- A visible occupancy conflict requires a different local route.
- A physical move is rejected and the unfinished route is abandoned.

The first successful plan is **Initial plans**. Successful continuations after completing a route/task/frontier are **Routine plans**. Raw Dijkstra/frontier calls, unsuccessful searches, unchanged routes and goal transitions remain diagnostics. Failed scanning with no new route does not inflate main Replans. Each main event has a reason, time, own position, old/new route and observed evidence in the export.

The corrected 960-second default sample recorded **6 meaningful replans / 6,397 path searches** in A and **7 / 6,832** in B. Routine successful plans numbered 4,221 and 4,534; no-route searches numbered only 6 and 7. Thus the default example's diagnostic load is mostly routine computation. In the smaller completed presets, exhausted frontier searches account for much of the later diagnostic load. No blanket interpretation of all searches as failures is made.

## Finding: live edits previously invalidated unseen routes globally

`syncEnvironment()` previously cleared all agent routes on every edit, even when the edited cell was invisible. It did not inject terrain values, but the edit notification could still influence decisions before perception.

Now synchronization updates host truth and pedestrian physics only. Existing paths, costs, memories and assigned identities remain until the agent perceives a change or experiences a real rejected move. Planning reads memory only. Newly sensed off-route passages can improve an ongoing known route; unseen passages cannot. Changing a scenario/resetting naturally begins a new run.

Host full-map access remains limited to authoring, initial task assignment, validated starting positions, sensing/physics, rendering and evaluation. Opaque assigned IDs do not disclose destination coordinates. Recorded spatial analysis never feeds back into agent memory.

## Recorded spatial comparison

The comparison panel adds:

- **Show A Paths** on saved A terrain.
- **Show B Paths** on saved B terrain.
- **Overlay A/B** on B terrain, explicitly labeled.
- **Show Changed Cells**, also available on the live world.
- Optional **Compare discovered cells & landmarks**.
- **Live World** to leave retrospective views.

A paths are solid cyan; B paths are dashed pink. Lines are actual traversed grid edges; repeated traversals increase density. Shared edges use the same coordinates with different line widths/styles. Orange × marks newly blocked roads; pink marks crowd changes; green + marks passages. Other cost, landmark and layer edits have separate legend keys. Rule-only cost changes can also highlight affected cells.

Snapshots retain actual per-agent movement samples, trip numbers, observed cell indices/first-sensing times, remembered landmarks and planning diagnostics/events. No paths are inferred from a score, rerun on a different map or synthesized for display. Completed-delivery route comparisons exclude post-delivery yielding; complete agent trails include it. Timing differences are distinct from cell-sequence changes.

The panel computes what changed, which cells were sensed/entered and by whom, exact first-sensing times, which agent/delivery sequences differ, and actual metric changes. Coverage is shown with sufficient precision and explicitly labeled exactly equal when it is equal. It does not assign a unique causal explanation to one cell in a multi-cell treatment.

Historical views are read-only and show saved terrain/base costs in inspection. Entering an editing tool returns to the live map. They do not replace the editable scenario, alter the camera or draw current live actors over historical paths. Individual-memory views do not receive remote designer-only change highlights.

## Actual reproducible validation results

Run:

```sh
node scripts/validate-ab.mjs
node scripts/run-experiments.mjs
npm test
```

[Complete validation data](AB_VALIDATION_RESULTS.json) records conditions, actual completed trips, spatial fingerprints, per-cell exposures and paired trajectories. [Experiment output](experiments/results.json) additionally contains full recorded spatial histories. Outcomes are not hardcoded.

All three validation presets use seed 1, four agents, radius 6, landmarks on, four tasks/courier and **480 simulated seconds**, with identical actual recorded starts/headings, assignments, empty memories, sensing and pedestrian starts.

| Test | A / B successful tasks | Mean successful time A / B | Meaningful replans A / B | Path searches A / B |
| --- | --- | --- | --- | --- |
| Shortcut | 8/8 · 8/8 | 31.550 / 39.850 s | 4 / 9 | 2,153 / 2,186 |
| Road Closure | 8/8 · 8/8 | 39.850 / 34.050 s | 9 / 9 | 2,186 / 2,152 |
| Crowd | 8/8 · 8/8 | 39.850 / 32.375 s | 9 / 19 | 2,186 / 2,009 |

The Shortcut's 56 new passage cells received **281 B entries**. The Road Closure blocks four central cells: **20 A entries, zero B entries**, with a connected bypass. The Crowd treatment increases base cost across 24 road cells: **120 A entries, 44 B entries**. These are all-agent entries, not unique cells or deliveries. B is not assumed better or worse; the closure and crowd tests are faster overall in this seed despite their local hindrance. The measured trajectories and task records show the outcomes, without a fabricated explanation for the exact interaction chain.

In the corrected **960-second default four-cell sample**, A completes 6/8 tasks with mean 283.233 s and B completes 3/8 with mean 293.400 s. All four agent trails differ. Coverage is 87.6953125% versus 88.1618924%. These are new model-version results, not a claimed reproduction of the user's unspecified B file. Fewer successes remain visible and cannot appear as an efficiency win.

Zero obstacle-triggered replans in a static validation pair is valid: a cell already blocked when first sensed was never part of a known traversable plan. A dedicated live-edit test changes a previously observed road on an unfinished route and verifies exactly one obstacle replan, with no repeated counting on subsequent unchanged observations.

## Verification

**98 tests pass, 0 fail.** New tests verify terrain/cost effects, perception-only edit response, initial/obstacle/information/goal/occupancy distinctions, exhausted scans, edited-path routing, hidden-state counterfactuals, snapshot integrity, actual edge counts/coordinates, matched completed deliveries, identical-map equality and exact fast/frame-accumulated equivalence. Two old tests expecting immediate global invalidation were updated to assert the stronger requested perception-only behavior; no tests were deleted or skipped.

The audit's full 960-second identical-map run matches exactly. A second full 960-second run accumulated irregular 16/17/33/8 ms frames at 16× and produced exactly the same complete result and spatial snapshot as fast batching. This verifies the shared engine/wrappers, not real browser frame presentation. Actual initial conditions are saved in each result; if edited pedestrian placements differ, the panel reports that metadata mismatch and refuses a matched winner ranking instead of claiming fully matched NPC starts.

All 44 checked JavaScript modules/scripts pass syntax/import checks, HTML IDs/assets resolve, local HTTP responses match workspace bytes and `git diff --check` passes. Native Canvas A/B/overlay/knowledge renders were generated from the actual recorded data and visually inspected:

- [Road Closure overlay](previews/ab-closure-overlay.png)
- [Crowd overlay](previews/ab-crowd-overlay.png)

These are renderer figures, not browser screenshots. Real browser/CSS interaction QA remains unverified because the browser access host could not start. DOM integration tests cover the actual controls, read-only inspection, unchanged editable map and fixed viewport.

## Files changed or added for this task

| Area | Files |
| --- | --- |
| Planning metrics and sensing | `src/agents/planning-metrics.js` (new), `state.js`, `agent.js`, `memory.js`, `simulation.js` |
| Crowd semantics | `src/terrain.js`, default input/inspection in `src/main.js` and `index.html` |
| Recorded comparison data | `src/spatial-comparison.js` (new), `src/ab-comparison.js` |
| Comparison rendering and controls | `src/comparison-renderer.js` (new), `src/visualization.js`, `src/ab-ui.js`, `src/main.js`, `src/agent-ui.js`, `index.html`, `styles.css` |
| Road Closure preset | `src/experiments.js`, `src/scenario.js`; existing Shortcut/Crowd/Landmark preserved |
| Tests | `tests/ab-spatial.test.js` (new), `tests/ui.test.js`, `tests/agents.test.js`, `tests/abstract.test.js` |
| Reproducible evidence | `scripts/validate-ab.mjs` (new), `docs/AB_BEFORE_AUDIT.json`, `docs/AB_VALIDATION_RESULTS.json`, regenerated `docs/experiments/results.json`, `docs/previews/ab-*.png` |
| Documentation | This report, `README.md`, `SEMANTIC_MODEL.md`, `FINAL_REQUIREMENTS.md`, `FINAL_DEMO_PLAN.md` |

The abstract map generator, editor geometry/history, legacy scenario support and scenario-lineage archive were not rebuilt. Old study scores use the previous metric/cost semantics; rerun A and B together for current comparisons. Local preview: **http://127.0.0.1:4173**. The existing server remains running; no commits, pushes or deployments were performed.
