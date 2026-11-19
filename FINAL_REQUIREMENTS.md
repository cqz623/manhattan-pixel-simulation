# Final assignment requirement verification

Research question: **How do different spatial configurations influence the navigation, learning, and performance of autonomous agents?**

Status reflects the supplied task text and executed checks, not an unseen grading rubric. **Complete** means the feature exists and has automated/model verification. **Partial** means a material verification or submission step remains. **Missing** identifies a deliverable not produced. No video, browser screenshot or presentation is implied by model-render outputs.

| Requirement | Status | Implemented evidence / code | Verification |
| --- | --- | --- | --- |
| Compact abstract rectangular pixel city; no island/GIS geometry | Complete | `abstract-manhattan.js`, `main.js`, `index.html`, fixed Canvas styling | Exact retained default geometry; browser import graph excludes geographic assets; camera and UI tests |
| Semantic objects independent of colors | Complete | `terrain.js`, `environment.js`; static/dynamic/semantic/overlay layers | Consistent passability, opacity, costs and remembered descriptors; semantic/editor tests |
| Two distinct location frames | Complete | `coordinates.js`, `locations.js`, `agent-ui.js` | Global grid pose and offsets from a remembered reference; no known landmark → no relative position |
| Two distances, physical steps versus weighted cost | Complete | `locations.js`, `agents/pathfinding.js`, agent Inspector and comparison | Manhattan endpoints, known obstacle detours, crowd-cost bypass, actual trip costs tested |
| Explorer and Courier goals/performance | Complete | `agents/agent.js`, `state.js`, `simulation.js` | Real exploration/delivery records, separate Explorer coverage/cost/landmarks, actual courier trips |
| Bounded sensing and occlusion | Complete | `agents/perception.js` | Range/cone, near awareness, wall/corner and hidden-occupant tests |
| Individual spatial memory and partial observability | Complete | `agents/memory.js`; planner consumes remembered cells | Unknown cells excluded, stale conditions until sensed, hidden-map counterfactual tests |
| Landmarks affect decisions and are reused | Complete | Discovered orientation goals/frontier anchors; retained semantic tasks and walked associations | Hidden/disabled landmarks do not create Explorer goals; observed ones do; actual reuse tested |
| Planning ahead and replanning | Complete | Known-map weighted Dijkstra, frontiers, perception-driven route updates without global unseen-edit invalidation | Cost detours, closure/reopening, actual replans and known-only route tests |
| Multi-agent conflict avoidance | Complete | Detected-occupant avoidance, deterministic local recovery, host occupancy checks | Multi-agent/pedestrian exclusive-occupancy tests; no teleportation |
| Obstacles, hindrances, affordances | Complete | Buildings/closures, construction/crowds, parks, pickups/destinations and orientation landmarks | Passability/visibility/cost/goal tests; interactive valid-placement checks |
| Recorded A/B spatial behavior | Complete | `spatial-comparison.js`, `comparison-renderer.js`, `ab-ui.js` | Actual A/B/overlay trajectories, categorized changed cells, sensing/use/route differences and metric explanations; read-only snapshots and stable camera tested |
| Meaningful replan metric | Complete | `agents/planning-metrics.js` | Initial/routine/search diagnostics separated from obstacle/information/goal/occupancy/blocked route revisions; no-route scans cannot inflate main metric |
| Individual and aggregate knowledge views | Complete | `visualization.js`, `raster-cache.js`, four switches and individual veil | Truthful arrivals, distinct landmark holders, current-state overlap, no unseen terrain leaks |
| Editing, generation and undo/redo | Complete | `editor.js`, `abstract-manhattan.js`, source seed/rules in JSON | Brush/drag/rect/fill, batched history, profile generation, reset and load/save integration tests |
| Save A, duplicate/edit B, run and compare | Complete | `ab-comparison.js`, `ab-ui.js` | Real HTML handlers and fixed-step studies; map displayed matches active condition |
| Matched experimental conditions | Complete | Fixed starts/headings/types/counts/tasks/pickups/seed/sight/strategy/battery policy/deadline; empty memories | Plan equality, exact replay, blocked-start rejection, zero-success denominator and cancellation tests |
| Each scenario preserves map, result and metadata | Complete | `scenarios.js`, archive history, study JSON export | Independent clones, immutable evaluated drafts, actual results/conditions and history survive later iterations |
| Required comparison metrics | Complete | Success, mean successful time, actual route, weighted cost, Manhattan benchmark, Explorer coverage, replans | Means recomputed from completed trips; no samples → null/—; all assigned tasks stay in success denominator |
| Two–three valid distinct alternatives | Complete | `design.js`: controlled changes, connectivity, exact patches | Determinism, uniqueness, protected starts/goals, actual patch values and feasibility tests |
| Select and iterate; inspectable experiment history | Complete | Explicit Select A/B and Next Iteration; measured baseline provenance; compact iteration metrics and read-only archived A/B/overlay inspection | Both selection branches reproduce carried measurements, preserve prior evidence, continue valid variations and restore the working study/camera |
| Three final experiments and closure validation | Complete | `experiments.js`; run-experiments, validate-ab and validate-iterations scripts | Shortcut, Congestion and Landmark final presets, plus Road Closure; matched actual runs, replay/frame equality and repeated iterations |
| At least one real-world data secondary function | Complete | `data/nyc-park-profile.js`, CSV, `build-park-profile.py`, generator toggle | Raw source hash/count extraction, actual optional generation effect, saved provenance; public count API verified |
| Real-world 3D + time measurement alternative | Not selected | Real-data option above satisfies the requested OR branch | No claim of 3D measurement |
| Browser runtime without backend/build | Complete | Relative vanilla ES modules and Canvas; no new dependencies | Syntax/module/asset checks and local HTTP smoke checks; no deployment performed |
| Desktop browser interaction/layout QA | Partial | Fixed canvas/panels and real DOM handlers tested; native Canvas renders inspected | Browser/native access host unavailable; actual CSS layout, pointer behavior and fullscreen need a browser check |
| Semantic model, setup/research/data instructions | Complete | `SEMANTIC_MODEL.md`, `README.md`, `data/PARK_PROFILE.md` | Documents actual costs, frames, agents, metrics, generation, transformation and limits |
| Instruction-manual recording and presentation plan | Complete | `FINAL_DEMO_PLAN.md` | Explicit walkthrough, presets, evidence/export and suggested diagrams |
| Recorded instruction-manual video | Missing | Recording instructions supplied | No recording fabricated; presenter must record actual app |
| Final presentation/slide deck | Missing | Diagram/storyboard suggestions supplied | Diagrams/storyboard supplied; final deck remains to be authored |

## Empirical checks, not promised improvements

`docs/experiments/results.json` is generated from the actual simulation, with conditions, exact changes and all completed trips. Seed 1, four agents, radius 6, landmarks on, four tasks per courier, 480 simulated seconds:

| Preset | A success | A avg successful time | B success | B avg successful time |
| --- | ---: | ---: | ---: | ---: |
| Shortcut | 8/8 | 31.550 s | 8/8 | 39.850 s |
| Crowd | 8/8 | 39.850 s | 8/8 | 32.375 s |
| Landmark | 8/8 | 39.850 s | 8/8 | 39.175 s |
| Road Closure | 8/8 | 39.850 s | 8/8 | 34.050 s |

The new shortcut is used but does not improve overall task time in this seed; a short physical connection can change search and interactions. Congestion induces different routes in the measured run. Added landmarks change discovery and Explorer planning but do not guarantee faster deliveries. Full costs/steps/coverage/replans are in the result file. These are simulated units and single-seed observations, not calibrated NYC travel times, statistical findings or hardcoded expected winners.

## Remaining limits

The real-data component uses a property-type count ratio as a generation assumption, not actual land cover or street shapes. Agents have independent memory and no communication. The archive exports study evidence but has no study-import UI or automatic persistence. Local deadlocks and finite-time failures are possible and reported. Replanning metric version 2 excludes routine/unsuccessful computations; these remain separate diagnostics. Coverage counts sensed blocked cells as well as traversable cells. A manual browser review, actual video and final deck remain submission work. Verify any additional course rubric against the original assignment document before submitting.


Latest A/B audit: **98 tests pass**. Identical-map and full 960-second fast/frame-accumulated runs match exactly, including spatial histories. See [measured validation and changed files](docs/AB_VALIDATION.md). The exact original user-edited B file was not supplied; its 237.2-second value is not claimed as independently reproduced.

Phase 4 validation: **104 tests pass**, with all previous checks retained. Phase 4 adds explicit manual selection, measured baseline carry-forward, completed-iteration history and non-destructive history inspection. See [implemented changes and validation](docs/PHASE4.md) and [machine-readable actual results](docs/ITERATION_VALIDATION_RESULTS.json). The remaining submission work is unchanged: desktop browser review, recorded instruction-manual video and final presentation.
