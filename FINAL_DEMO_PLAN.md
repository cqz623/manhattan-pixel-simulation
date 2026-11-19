# Final demonstration and recording plan

Research question: **How do different spatial configurations influence the navigation, learning, and performance of autonomous agents?**

This is a recording plan, not a claim that a video or presentation has been produced. Record the actual running application and measured results. Do not splice different conditions into an apparent matched experiment.

## Prepare

1. Run `npm start` and open http://127.0.0.1:4173. Use a desktop viewport such as 1440 × 900. The compact, colorful rectangular map is the world; it is schematic, not Manhattan GIS.
2. Open Editor and Knowledge briefly. Show that panels float without resizing the map. Close a panel to keep the recording readable.
3. Use four agents, seed 1, sight 6, landmarks enabled, 480 simulated seconds and 16× speed for the presets. Uncheck Fast calculation for visible live behavior, or explicitly explain when skipping playback.
4. Use Export study JSON to retain maps, exact changes, matched conditions, lineage and actual completed-trip records. Save environment JSON separately if needed. Study archives are downloadable evidence, not a supported import format; live sessions are not automatically persisted.

## Instruction-manual segment, about 2–3 minutes

1. State the research question and designer role: change space, then observe autonomous agents.
2. Show roads/buildings/parks/construction/crowds/destination colors. Explain costs and opacity as semantic properties, not color-based rules. Costs/time are model assumptions, not real measurements.
3. Paint a road, add a valid destination and drag a rectangle. Undo/redo, regenerate from a seed and reset changes. Point out that markers do not overwrite static terrain and new starts/goals require walkable cells.
4. Play/Pause/Step and show speed, Fit Grid, wheel zoom and Space-drag pan.
5. Select an Explorer. Show known versus unknown cells, limited vision, a remembered landmark, its planned route and actual trail. Show global column/row and offsets relative to that remembered landmark.
6. Select a Courier with a remembered destination. Read Manhattan distance and known route steps/cost. Unknown space cannot be used by the planner.
7. Switch All Paths, Landmark Heatmap and Shared Knowledge. Explain that the last mode is overlap of independent memories, not communication.

## Environment design and iteration segment, about 2–3 minutes

1. Save current as A. Duplicate A → B. Add a small construction or crowd treatment without blocking starts/missions.
2. Run matched A + B. Explain identical types/counts, starts/headings, assignments, seed, sight, duration and empty initial memory. The displayed world changes to the actual running scenario.
3. Compare success, mean successful time, route length, weighted cost, Explorer coverage and replans. A lower mean based on fewer successes is not automatically better; zero successes have no mean time.
4. Use Show A Paths, Show B Paths, Overlay A/B and Show Changed Cells. Cyan solid is A; pink dashed is B. The overlay explicitly uses B terrain. Optionally compare discovered cells and remembered places. Inspect per-cell sensing/entry counts, first-sensing times and actual metric changes. Return to Live World before editing. View A/B maps and actual paths. Distinguish an observed outcome from a causal explanation or general claim.
5. Select A or Select B using the measured tradeoffs. Click Next Iteration: the selected map becomes A, with its source measurement and original controlled conditions retained. Duplicate/edit B or Generate 2–3 Variations. Run B and repeat. Open Experiment History; inspect an earlier A, B and overlay, then Return to Current Iteration. Show earlier results and decisions surviving selection and later edits.
6. Export study JSON for evidence. Editing during a study cancels unfinished results; changing the generator/grid/region requires a new A.

## Three final experiments and an additional closure validation

Open Knowledge → Experiment presets, select the preset, Load demonstration A/B pair, then Run matched A + B. Loading sets seed/count/sight/strategy/duration and keeps previous archives. These are 40 × 28 abstract testbeds. Use the same prescribed conditions for comparisons; use additional seeds for broader conclusions.

### Experiment 1 — Shortcut

- A has a street loop around a blocked central band. B opens a two-cell-wide cross-block connection.
- Compare a selected agent's Manhattan distance with its known least-cost steps/cost. Inspect B's actual paths and treatment-cell visits to verify use, rather than inferring use from appearance.
- Compare delivery time, route length, success and first/later task times. A geometrically shorter connection can increase exploration or interaction and need not improve total time.

### Experiment 2 — Congestion

- Both maps have the central route. B changes part of that route to crowd terrain with base cost 2.5; the normal map uses road cost 1. There are no extra pedestrians in this preset, isolating the terrain-cost intervention.
- Observe which cells are sensed, when agents replan, whether a bypass is used and how actual route length differs from weighted cost.
- Costs are last observed; agents are not told the hidden location of the crowd treatment. Completion times and rerouting are measured, not scripted.

### Road Closure Test

- Both maps start with a connected central route. B blocks four central road cells while preserving the upper/lower bypasses.
- Run matched A+B. Show Changed Cells and Overlay A/B on B terrain. Read the recorded A entries versus zero B entries at the closure, and compare actual completed routes and metrics.
- A path crossing orange B terrain belongs to A; it is not a B collision. The preset does not prescribe a slower B result.

### Experiment 3 — Landmark

- Both maps share static terrain and task locations. B adds eight semantic orientation landmarks.
- Explorers choose discovered, unvisited orientation landmarks as goals when Use Landmarks is enabled, then can reuse visited places on frontier routes. They never receive hidden landmark coordinates.
- Compare landmark discovery, Explorer cost/coverage, actual plans, replans and repeated courier tasks. New landmarks need not improve courier time; this preset chiefly tests landmark-guided exploration and resulting interactions.
- Optionally use the separate retention experiment or rerun with Use Landmarks off, capturing a fresh A to make the different strategy explicit.

Explain Replans as actual changes to unfinished routes; show separate initial plans, path searches and no-route diagnostics. Do not describe thousands of routine searches as thousands of route revisions.

Headless reproduction of the same model:

```sh
node scripts/run-experiments.mjs
node scripts/validate-ab.mjs
node scripts/validate-iterations.mjs
```

Actual seed-1 outputs, conditions, changes and completed trips are saved in `docs/experiments/results.json`. Present those as one measured run, not as a guaranteed outcome or a statistical finding. Recompute after code changes before presenting.

## Secondary-data segment, about 30 seconds

Show Editor → Use NYC park-type ratio and the linked source/method. Explain 66 Neighborhood Park records / 396 selected Manhattan property records = 16.7% optional random park-block chance. Enable it, generate with a saved seed, and show abstract source/provenance in exported JSON. Explain that this transformation is a modeling choice, not land-cover measurement, GIS geometry or real-world performance.

## Suggested presentation diagrams

1. Semantic stack: static terrain, saved placements/runtime occupants, semantic goals and temporary overlays.
2. Observe → remember → plan → move → update loop. Show the host sensing/physics boundary and no direct hidden-map arrow into planning.
3. Two location frames: absolute grid axes versus an agent's offsets from a discovered landmark; unknown landmark means no relative reference.
4. One source/target pair with a Manhattan lower bound, an obstacle detour and a higher-cost short route.
5. A/B fairness diagram: identical cohort/seed/tasks/empty memory/duration, different environment, actual measured outcomes.
6. Scenario lineage tree: selected parent → next A → three sibling variations, each with its own map, conditions and results.
7. Data provenance diagram: NYC property records → category counts → assumed probability → abstract blocks; no imported geographic shape.

## Finish honestly

Show the selected environment and explain why you chose it, considering both success and time. Note single-seed limits, discrete cell/unit assumptions, possible deadlocks, and no agent communication. The video and final slide deck still need to be recorded/authored by the presenter; the available browser host could not be used for interactive layout QA in this implementation session.
