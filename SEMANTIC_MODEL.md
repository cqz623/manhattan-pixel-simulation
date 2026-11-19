# Manhattan Delivery Lab — semantic spatial model

Research question: **How do different spatial configurations influence the navigation, learning, and performance of autonomous agents?**

This document maps the supplied project requirements to implemented behavior. The referenced final-submission PDF and two visual-reference images were not included among the accessible attachments, so this is a checklist against the supplied text, not a claim of PDF compliance.

## Space, layers and truth

Space is a compact, orthographic **128 × 72 abstract pixel city**, using the original seeded Manhattan-inspired generator. An index is `row × width + column`. Square cells and a single camera align static geometry, entities, landmarks, remembered cells, plans, trails and heatmaps. Connected orthogonal streets surround rectangular blocks, parks, construction and crowd zones. The layout is schematic, not real Manhattan geography; the application does not import or require GIS assets. The entire grid is active initially, with optional custom subareas retained.

The editable scenario has four layers:

1. **Static**: one primary terrain per cell.
2. **Dynamic**: saved robot/pedestrian placements. Runtime positions are separate objects; movement never overwrites static terrain.
3. **Semantic**: depot, delivery destination, charger or generic landmark over underlying terrain.
4. **Overlays**: temporary road closure.

Abstract parks are traversable with profile-specific costs. Optional `access[index]` and `rules.parkAccess = 'marked'` remain supported for previously saved scenarios; access-only edits remain undoable. The restored default does not require an access mask or geographic data.

`terrain.js` centralizes passability, opacity, temporariness, base movement preferences, occupancy costs and memory descriptors; `environment.js` adds layered objects. Colors never determine behavior.

| Semantic category | Display | Movement / perception |
| --- | --- | --- |
| ROAD | Black | Unit cost, open sight |
| BUILDING | Bright blue | Permanently impassable, occludes sight |
| PARK | Green | Traversable in the abstract city; visitor/explorer and courier costs differ |
| CONSTRUCTION | Orange-red | Blocked by default, or high-cost according to a saved rule |
| CROWD_ZONE (`crowd`) | Pink | Base cost 2.5 by default, configurable 1–8; detected occupants add cost. Congestion preset uses base 2.5 without extra pedestrians. |
| DEPOT | White D | Pickup affordance, discoverable landmark, does not open blocked terrain |
| DESTINATION | Yellow diamond | Delivery affordance and discoverable landmark over walkable terrain |

Water and static obstacles are blocked; obstacles also occlude. Sidewalk/open/slow terrain, chargers and the original visitor game remain compatible with earlier scenarios. Destinations or depots painted on a blocked cell stay inaccessible; the editor does not silently clear buildings.

## Two notions of location

**Global**: the agent's own integer column/row in the rectangular simulation grid. The abstract default has no geographic coordinates. Coordinate conversion remains available for compatible imported scenarios, without exposing hidden terrain.

**Relative / semantic**: offsets north/south/east/west of a remembered depot, or the nearest remembered landmark if no depot is known. Adjacency to a park is reported only from remembered neighbor cells. Without a remembered reference, the relationship is unknown. Both are shown in the Agent Inspector. Geographic transforms use metadata only, and active-area zoom never renumbers the grid.

## Two notions of distance

For the selected agent and a remembered delivery destination:

- **Manhattan distance** = `abs(dx) + abs(dy)`, ignoring obstacles; cells, not meters.
- **Known traversable route** = weighted Dijkstra through remembered, passable cells within the known operational area. The UI reports both the number of cardinal steps along the least-cost route and its summed movement cost. Least cost need not mean fewest steps.

Unknown cells cannot be traversed by the planner. No known route is different from zero distance. Only remembered destinations appear in the read-only distance selector. The selector does not command an agent.

## Agents and learning sequence

The abstract-city game alternates **Explorer** and **Courier**, 2–10 total agents, initially four. Each has independent memory. Legacy schematics can still use Visitor/Courier with charging missions.

**Explorer** selects reachable observed frontiers to discover unknown space and landmarks. With Use Landmarks enabled, discovered, unvisited generic orientation landmarks become known-map goals; physically reaching them changes the next scan and frontier planning. This makes landmark configuration influence actual decisions, rather than only visualization. It avoids known obstacles, rotates to scan when needed, and can use a previously visited landmark on a frontier route as an orientation waypoint. It records real movement and coverage; it does not fabricate delivery or tour completions.

**Courier** starts an assigned delivery attempt, discovers/reaches its assigned depot, then delivers to its assigned destination. Dispatch provides opaque task/place IDs, not coordinates. It explores frontiers when the place or connecting route is unknown. After delivery it repeats with accumulated knowledge, up to four tasks per courier in the default game. Completed couriers yield locally to keep mission cells accessible. Travel cost remains measured; the simplified Explorer/Courier game has no charging/inventory mission. Legacy battery behavior is retained only for legacy Visitor/Courier scenarios.

Each 0.2-second step follows:

**PERCEIVE → REMEMBER → PLAN → MOVE → UPDATE**

- Perception: default six-cell range, approximately 100° forward cone, immediate awareness within 1.5 cells, supercover wall/corner occlusion. The active area is a known operational boundary.
- Memory: nullable known-cell records with timestamps, unknown cells, obstacles, last-observed temporary conditions and costs, discovered landmarks, inferred intersections, walked landmark connections, visited cells, plans, actual trails and completed deliveries.
- Planning: weighted known-map Dijkstra, frontier exploration and observed-occupant avoidance; no hidden free-space assumption.
- Movement: cardinal steps whose credit accrues according to profile speed and remembered movement cost. Host physics checks actual passability/exclusive occupancy. Blocked moves trigger sensing/replanning, not hidden rescue routes.
- Update: actual arrivals, visited landmarks, walked connections, trip time/distance/cost, and completed task records.

Buildings can hide both geometry and pedestrians. Crowd planning costs count only detected occupants, excluding self; hidden people do not leak through congestion estimates. Pedestrians use seeded independent motion. Agents wait, sidestep or backtrack based on local observations; they neither overlap nor teleport. Constrained one-cell deadlocks can remain unresolved.

## Retention, edits and partial observability

With **Use Landmarks** on, couriers retain semantic place locations and walked associations across trips; reuse requires an actual later-trip route to a previously remembered place. With it off, each next trip forgets place locations/associations and search coverage, while retaining terrain and last-observed conditions. Current trips retain their starting condition. Explorers consult the toggle for future orientation-goal and landmark-waypoint choices; their single exploration run retains sensed terrain and place records.

Cell, access and rule edits update simulation truth while preserving active paths and memory. No global invalidation or task reassignment alerts an agent to an unseen edit. Changed values enter memory only when sensed; a real rejected move is also a legitimate physical signal. Newly sensed off-route connections can improve a known route, but unseen connections cannot. Robot painting edits future start positions; it does not move a live agent. Region changes, scenario replacement, and Reset begin a fresh run. In-place design presets are one undoable cell edit and retain live memory. A/B studies always use a fresh run. No inter-agent communication is implemented.

Host access to complete geometry is limited to source preparation, demo authoring, start placement, collision validation, rendering, aggregate evaluation and variation feasibility checks. `agent.js` and `pathfinding.js` consume memory/observations only. Valid-route checks never copy terrain into agent memory.

## Visualization

All modes use the same grid/camera; controls and panels overlay a fixed canvas.

| Mode | Actual measured data |
| --- | --- |
| No Layer | Editable semantic map and runtime occupants |
| All Paths | Cumulative actual cell arrivals, normalized to the current maximum; no spawn/plan counts |
| Landmark Heatmap | Distinct active agents currently remembering each discovered place |
| Shared Knowledge | Number of active agents whose remembered terrain/access/closure/base costs match current truth |
| Individual view | Unknown veil, dim remembered terrain, visible-cell tint, remembered landmarks, dashed plan and solid actual trail; only sensed other occupants |

Shared Knowledge means overlap, **not communication**. Overview rendering caches one raster pixel per cell; close zoom uses detailed glyphs and cell overlays. Aggregate animation can refresh every four simulation ticks; paused views use exact current data. Static overview pixels are reused until invalidated. Runtime occupancy/trails remain separately rendered.

## Measurable performance

**Average Successful Delivery Time** is the arithmetic mean of completed courier trip durations in simulated seconds, from the start of each attempt through pickup/search/travel to arrival. It includes exploration, waiting and recovery; it is not a real-world ETA.

**Success rate** is completed deliveries / the fixed assigned task budget, including tasks not yet attempted at the deadline. Zero successes produce `—` delivery time, not zero. In a legacy unlimited live run, the denominator is attempted tasks; A/B always uses a fixed workload.

Additional measures:

- Average route length: mean actual moved cells per completed courier trip, including search and pickup.
- Explorer coverage: union of Explorer-known cells / all active-area cells. Courier observations are excluded from this measure. All-agent coverage remains separately available. Both include observed blocked cells and water. This measures knowledge coverage, not percent of traversable cells visited.
- Replans, metric version 2: replacement or abandonment of an unfinished route after a sensed obstacle, a different strictly cheaper informed route, an active goal change, an occupancy conflict or a rejected physical move. Initial plans and normal frontier/task continuations are separate; identical computations and failed searches do not count. Path-search diagnostics and reason/time/old-route/new-route event records remain available. Counts include Explorers and Couriers.
- Landmark discovery: distinct IDs ever discovered by run participants, including inferred intersections and observed temporary barriers.
- Weighted travel cost: sum of actual entered-cell traversal costs, including the configured base and actual local congestion, separately accumulated from geometric steps and legacy energy effort. Completed-trip weighted cost and all-agent totals are both reported. Predicted route cost instead uses last-observed values and can differ from actual cost. Explorer cost excludes couriers.
- Average depot→target Manhattan distance: mean geometric distance between recorded pickup and completed target cells. This is a point-to-point benchmark; actual trip route length includes pickup/search, detours and recovery. Missing completed samples produce no mean.
- Actual visits, obstacle encounters, landmark reuse, per-agent/trip histories and incomplete tasks are also recorded.

Within a run, later deliveries can use previously acquired terrain and landmark knowledge. No decreasing-time rule, learning multiplier, neural model or fixed performance improvement is built in. Learning is empirical memory accumulation; congestion and exploration can make a later trip slower.

## Environment A/B and variation

Run A captures an immutable scenario plus a cohort plan. The plan freezes agent IDs/types, starting cells/headings, assigned pickup and task IDs, seed, sensing radius, count, landmark strategy, empty starting memory and fixed duration. Duplicate A into B, edit, run B, inspect measured side-by-side results, and choose a design. Added destinations in B do not change the locked tasks. Blocking a fixed start rejects B instead of relocating the agent. Editing during a study cancels its incomplete result; changing the grid or operational area requires a new baseline.

Both conditions use isolated clones and exactly the same number of ticks. Starting memory is empty in both; pedestrians get deterministic per-origin random streams. Their paths may diverge as a consequence of environment edits and interactions. Success rate ranks first, followed by lower successful-delivery time among equal-success designs. No completed deliveries means no time ranking. Single-seed results are not statistically generalizable evidence.

Changes are summarized by layer and rule; actual path and metric deltas show their observed consequences. A generated variation deterministically changes at most four unprotected terrain cells and verifies connectivity from fixed starts through required missions. It never guarantees improved behavior, grants routes to agents, or performs evolution. Construction, Crowd, Passage and Destination presets plus brush/rectangle/fill tools enable additional experiments.

## Academic requirement mapping

| Requirement | Demonstration / module |
| --- | --- |
| Semantic spatial model; obstacles; hindrances; affordances | Terrain registry, access mask, layered depot/destination and crowds |
| Two locations and two distances | Agent Inspector; `coordinates.js`, `locations.js` |
| Two agent types; goals; planning ahead | Explorer frontiers; Courier fixed tasks; known-map route preview |
| Limited scanning; partial knowledge; memory; landmarks | Perception cone/occlusion, individual veil, persistent observations |
| Multi-agent interaction | Exclusive occupancy, observed avoidance, local recovery, moving pedestrians |
| Real performance | Completed trips, success denominator, measured coverage/cost/replans |
| Multiple environments and comparison | Seeded abstract/classic generators, editable A/B, route-valid small variations |
| Real-world data secondary function | Optional NYC Parks property-type counts inform random park-block probability; no geographic shapes or street geometry enter the app |

Future phases may add explicit communication, richer perception/learning, calibrated movement, richer GIS import and multi-seed experiments. None is represented as already implemented.


## Final workflow, experiments and real-data parameter

**DESIGN → RUN → COMPARE → SELECT → ITERATE.** Save current as A captures a map plus locked cohort conditions without requiring a run. Duplicate A to B, edit, then Run matched A + B. Each runner uses an isolated clone, the same plan and an exact tick deadline; the displayed map switches to the scenario actually being evaluated. Individual runs remain available. Pausing through a modal/hidden tab changes wall-clock duration, not simulated deadlines.

The scenario archive retains each map, label, ID, parent ID, iteration, timestamp, exact cell/rule changes, actual completed result and its conditions. Editing an evaluated B makes a child draft rather than deleting the earlier result. Selecting a map and generating again captures the next iteration from that selected parent. Generator/grid/operational-area changes require a new baseline while retaining history. Export study JSON saves these records for evidence; importing study archives and automatic browser persistence are not implemented.

Generate Variations creates two or three distinct siblings by small construction/crowd treatments, an explicit passage or an orientation landmark. It protects starts/mission cells, records exact patches and requires connectivity for fixed starts, assigned goals and all active-area depots/destinations. It rejects identical maps and reports when fewer than two feasible alternatives can be found. This is manual design iteration, not an evolutionary optimizer. A valid connected map can still produce failures under partial observability and finite time.

Three validation 40 × 28 authored pairs are in `src/experiments.js`: Shortcut opens a central connection; Road Closure blocks a used central segment while preserving a bypass; Crowd/Congestion applies base movement cost 2.5 to a corridor. The earlier Landmark pair, adding eight orientation features without changing static terrain, is retained. Their seed-1 fixed-step results are generated by `scripts/run-experiments.mjs` and saved in `docs/experiments/results.json`. Outcome signs are not hardcoded. B also reports actual treatment-cell visits and observers, including Courier visits, so shortcut use is verifiable independently of its appearance.

The optional **NYC park-type ratio** takes 66 Neighborhood Park records / 396 selected Manhattan park-property records from NYC Parks Properties, snapshot 2026-11-18, and uses 0.166667 as the generator's additional random park-block probability instead of 0.11. Mapping a record-count share to that probability is an explicit simulation assumption, not observed park area, geographic distribution or access. Bounds remain null, source kind remains schematic and saved source metadata identifies the profile. The runtime data contains counts only. See [source, transformation and reproduction](data/PARK_PROFILE.md).

The interactive editor rejects new agent/goal/landmark placement on blocked cells. The underlying low-level editor's optional validation preserves compatibility with old layered-authoring scenarios; generators/variations and the application enable valid placement. Painting an obstacle over an existing goal can deliberately create an unsuccessful environment; host feasibility checks and real success metrics report it honestly.


## Retrospective A/B spatial behavior

Completed runs record actual agent movement samples (including trip number), known cells/first-sensing times, current remembered landmarks, and meaningful replan events. The renderer never synthesizes a trajectory or feeds these host measurements into agent decisions. A cyan solid trace shows A, a pink dashed trace shows B; the overlay explicitly uses B terrain. Changed cells distinguish blocked roads, crowd costs, passages, other cost changes and semantic/layer edits. Rule-only effective cost changes are also classified.

Discovered-cell/landmark comparison uses recorded individual memories, aggregated for display. Individual live-memory mode excludes designer-only remote-change highlights. Recorded views inspect saved terrain/base costs without pretending to know historic occupant costs. Editing/playback returns to the live world; view switching does not replace the editable environment or move/resize the map.

Per-cell exposure distinguishes sensing from entering, reports first-sensing times/agent IDs and actual entry counts, and compares ordered agent trails and matched completed-delivery routes. Completed-trip routes exclude post-delivery yielding. Equal route sequences can have different timing; equal rounded coverage need not imply different underlying coverage, so exact equality/deltas are reported from actual values. A multi-cell treatment is not automatically attributed to one causal cell.

Result `initialConditions` stores the actual controlled-agent starts/headings/assignments, initial known-cell counts, seed/sight/strategy and pedestrian starts. The panel verifies this metadata; intentionally changed entity placements produce a disclosed mismatch and suppress matched winner ranking rather than making a false fully matched claim. Fast batching and frame accumulation call the same fixed-step engine and are regression-tested for exact complete-result/snapshot equality.

Default crowd base cost was corrected from 1 to 2.5 in this audit. Explicit cost 1 still models an uncongested zone with no added base penalty. Earlier score records use the former assumptions and old replan definition; current results mark `replanMetricVersion: 2` and record the default crowd cost. See [audit and measured validation](docs/AB_VALIDATION.md).
