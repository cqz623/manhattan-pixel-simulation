import { describeTerrain, terrainPassable, terrainCost } from './terrain.js';

export const COMPARISON_COLORS = Object.freeze({ a: '#69e4ff', b: '#ff91ce', blocked: '#ff713b', crowd: '#ff91ce', passage: '#7ff09c', cost: '#ffd36b', landmark: '#c9a0ff', other: '#f4f5fb' });

/** Immutable observations of a completed run, never read back by agent planning. */
export function captureSpatialState(simulation) {
  return {
    version: 1, width: simulation.world.width, height: simulation.world.height, time: simulation.time,
    agents: [...simulation.agents, ...simulation.retiredAgents].map(agent => {
      const knownCells = [], firstSeenAt = [];
      agent.memory.cells.forEach((cell, index) => { if (cell) { knownCells.push(index); firstSeenAt.push(cell.firstObservedAt ?? cell.observedAt); } });
      return { id: agent.id, type: agent.type, trail: agent.trail.map(sample => ({ index: sample.index, time: sample.time, trip: sample.trip ?? null })),
        knownCells, firstSeenAt, landmarks: [...agent.memory.landmarks.values()].map(place => ({ id: place.id, index: place.index, kind: place.kind, foundAt: place.foundAt, visits: place.visits })),
        planning: structuredClone(agent.planning), replanEvents: structuredClone(agent.replanEvents) };
    }),
  };
}
function cellState(environment, index) {
  const description = { ...describeTerrain(environment.layers.static[index], environment.rules, 0, !!environment.access?.[index]), closure: environment.layers.overlays[index] === 'closure' };
  const passable = terrainPassable(description);
  return { passable, cost: passable ? terrainCost(description) : null };
}
export function classifyChanges(a, b) {
  if (!a || !b || a.grid.width !== b.grid.width || a.grid.height !== b.grid.height) return [];
  const changes = [];
  for (let index = 0; index < a.layers.static.length; index++) {
    const before = cellState(a, index), after = cellState(b, index);
    const layers = ['static', 'dynamic', 'semantic', 'overlays'].filter(layer => a.layers[layer][index] !== b.layers[layer][index]);
    const accessChanged = !!a.access?.[index] !== !!b.access?.[index];
    if (!layers.length && !accessChanged && before.cost === after.cost && before.passable === after.passable) continue;
    const kind = before.passable && !after.passable ? 'blocked' : !before.passable && after.passable ? 'passage'
      : b.layers.static[index] === 'crowd' ? 'crowd' : before.cost !== after.cost ? 'cost'
      : layers.includes('semantic') ? 'landmark' : 'other';
    changes.push({ index, x: index % a.grid.width, y: Math.floor(index / a.grid.width), kind, layers,
      before: a.layers.static[index], after: b.layers.static[index], passableA: before.passable, passableB: after.passable, costA: before.cost, costB: after.cost });
  }
  return changes;
}
export function pathEdges(snapshot) {
  const edges = new Map();
  for (const agent of snapshot?.agents || []) for (let n = 1; n < agent.trail.length; n++) {
    const from = agent.trail[n - 1].index, to = agent.trail[n].index;
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    const entry = edges.get(key) || { from: Math.min(from, to), to: Math.max(from, to), count: 0 };
    entry.count++; edges.set(key, entry);
  }
  return edges;
}
function indexSnapshot(snapshot) {
  const cells = new Map(), known = new Set(), landmarks = new Map();
  const entryAt = index => { if (!cells.has(index)) cells.set(index, { observers: [], visits: 0, courierVisits: 0, reactions: 0 }); return cells.get(index); };
  for (const agent of snapshot?.agents || []) {
    agent.knownCells.forEach((index, n) => { known.add(index); entryAt(index).observers.push({ id: agent.id, type: agent.type, firstSeenAt: agent.firstSeenAt[n] }); });
    for (const sample of agent.trail.slice(1)) { const cell = entryAt(sample.index); cell.visits++; if (agent.type === 'courier') cell.courierVisits++; }
    for (const event of agent.replanEvents || []) for (const index of event.observed) entryAt(index).reactions++;
    for (const place of agent.landmarks) if (!['intersection', 'blocked'].includes(place.kind)) landmarks.set(place.id, place);
  }
  return { cells, known, landmarks, edges: pathEdges(snapshot) };
}
const sequence = agent => agent.trail.map(sample => sample.index);
const equal = (a, b) => a.length === b.length && a.every((index, n) => index === b[n]);
function tripSequences(result) {
  const paths = new Map();
  for (const agent of result?.spatial?.agents || []) {
    if (agent.type !== 'courier') continue;
    for (let n = 1; n < agent.trail.length; n++) {
      const sample = agent.trail[n]; if (sample.trip === null) continue;
      const key = `${agent.id}:${sample.trip}`;
      if (!paths.has(key)) paths.set(key, [agent.trail[n - 1].index]);
      paths.get(key).push(sample.index);
    }
  }
  const completed = new Set((result?.trips || []).map(trip => `${trip.agentId}:${trip.number}`));
  return new Map([...paths].filter(([key]) => completed.has(key)));
}
export function analyzeSpatialComparison(a, b, resultA, resultB) {
  const compatible = !!a && (!b || a.grid.width === b.grid.width && a.grid.height === b.grid.height);
  if (!compatible) return { compatible: false, changes: [] };
  const indexedA = indexSnapshot(resultA?.spatial), indexedB = indexSnapshot(resultB?.spatial);
  const changes = classifyChanges(a, b).map(cell => ({ ...cell,
    a: indexedA.cells.get(cell.index) || { observers: [], visits: 0, courierVisits: 0, reactions: 0 },
    b: indexedB.cells.get(cell.index) || { observers: [], visits: 0, courierVisits: 0, reactions: 0 } }));
  const pairedAgents = (resultA?.spatial?.agents || []).flatMap(agentA => {
    const agentB = resultB?.spatial?.agents.find(agent => agent.id === agentA.id);
    return agentB ? [{ id: agentA.id, type: agentA.type, changed: !equal(sequence(agentA), sequence(agentB)), stepsA: agentA.trail.length - 1, stepsB: agentB.trail.length - 1 }] : [];
  });
  const tripsA = tripSequences(resultA), tripsB = tripSequences(resultB), pairedTrips = [];
  for (const [id, pathA] of tripsA) if (tripsB.has(id)) pairedTrips.push({ id, changed: !equal(pathA, tripsB.get(id)), stepsA: pathA.length - 1, stepsB: tripsB.get(id).length - 1 });
  return { compatible, a, b, resultA, resultB, indexedA, indexedB, changes, pairedAgents, pairedTrips,
    initialConditionsMatch: resultA?.initialConditions && resultB?.initialConditions ? JSON.stringify(resultA.initialConditions) === JSON.stringify(resultB.initialConditions) : null,
    unpairedTrips: tripsA.size + tripsB.size - 2 * pairedTrips.length,
    counts: Object.fromEntries(Object.keys(COMPARISON_COLORS).filter(key => !['a', 'b'].includes(key)).map(kind => [kind, changes.filter(cell => cell.kind === kind).length])) };
}
const format = number => Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—';
export function comparisonExplanation(data) {
  if (!data?.compatible) return ['Spatial comparison requires matching grid dimensions.'];
  const { changes, resultA: a, resultB: b, pairedAgents, pairedTrips, counts } = data;
  const notes = [`${changes.length} changed cells: ${Object.entries(counts).filter(([, count]) => count).map(([kind, count]) => `${count} ${kind}`).join(', ') || 'no cell-level changes'}. Per-cell costs shown use the Courier profile, excluding moving occupants.`];
  if (changes.some(cell => cell.kind === 'crowd' && cell.costA === cell.costB)) notes.push('Some crowd edits add no base-cost penalty with these settings. Any further effect depends on the configured occupancy costs; no extra delay is assumed.');
  if (b?.spatial && changes.length) {
    notes.push(`B sensed ${changes.filter(cell => cell.b.observers.length).length}/${changes.length} modified cells; entered ${changes.filter(cell => cell.b.visits).length} (${changes.filter(cell => cell.b.courierVisits).length} entered by couriers). Sensing a blocked cell is different from entering it.`);
  } else if (!b?.spatial) notes.push('Run B to record which changed cells its agents sense or enter.');
  if (a?.spatial && b?.spatial) {
    notes.push(data.initialConditionsMatch === true ? 'Recorded initial states match: controlled agents, empty memory, assignments, headings, sensing, seed and pedestrian starts.' : data.initialConditionsMatch === false ? 'Recorded initial states differ. Inspect exported initialConditions before treating this pair as fully matched; changed entity placements can alter pedestrian starts.' : 'Initial-state metadata is unavailable for one recorded run.');
    notes.push(`${pairedAgents.filter(agent => agent.changed).length}/${pairedAgents.length} actual agent trails differ in cell sequence. ${pairedTrips.length ? `${pairedTrips.filter(trip => trip.changed).length}/${pairedTrips.length} matched completed delivery routes differ` : 'No matched completed delivery routes are available'}; ${data.unpairedTrips} completed trips lack a completed counterpart. These comparisons exclude timing when checking route equality.`);
    notes.push(`Success A/B: ${a.deliveries}/${a.plannedTasks} → ${b.deliveries}/${b.plannedTasks}. Mean successful time: ${format(a.averageDeliveryTime)} → ${format(b.averageDeliveryTime)} simulated s. Weighted travel cost: ${format(a.travelCost)} → ${format(b.travelCost)}. All-agent coverage: ${format(a.explorationCoverage * 100)}% → ${format(b.explorationCoverage * 100)}%. ${a.explorationCoverage === b.explorationCoverage ? 'Coverage is exactly equal in the recorded results.' : `Recorded coverage differs by ${format((b.explorationCoverage - a.explorationCoverage) * 100)} percentage points; coarser rounding may hide this.`}`);
    notes.push('Trails include exploration, avoidance and post-delivery yielding; completed-delivery routes exclude yielding. These measurements do not identify a unique causal cell when several cells changed.');
  } else notes.push('Complete both runs to compare actual routes and performance. No missing spatial history is inferred.');
  return notes;
}
