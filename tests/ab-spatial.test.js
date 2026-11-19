import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironment } from '../src/environment.js';
import { createSpatialAgent } from '../src/agents/state.js';
import { AgentSimulation } from '../src/agents/simulation.js';
import { GridWorld } from '../src/agents/world.js';
import { think } from '../src/agents/agent.js';
import { perceive } from '../src/agents/perception.js';
import { describeTerrain, terrainCost, terrainPassable, DEFAULT_CROWD_COST } from '../src/terrain.js';
import { createExperimentPair } from '../src/experiments.js';
import { EnvironmentComparison } from '../src/ab-comparison.js';
import { hasValidRoutes } from '../src/design.js';
import { analyzeSpatialComparison, comparisonExplanation, pathEdges, COMPARISON_COLORS } from '../src/spatial-comparison.js';
import { MapRenderer } from '../src/visualization.js';
import { drawSpatialComparison } from '../src/comparison-renderer.js';

const at = (x, y) => y * 16 + x;
const finish = run => { while (!run.advance(100)); return run.result(); };
function routeFixture() {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let x = 1; x <= 14; x++) env.layers.static[at(x, 6)] = 'road';
  for (let x = 3; x <= 8; x++) env.layers.static[at(x, 8)] = 'road';
  for (const x of [3, 8]) env.layers.static[at(x, 7)] = 'road';
  env.layers.semantic[at(13, 6)] = 'depot'; env.layers.semantic[at(14, 6)] = 'destination';
  const world = new GridWorld(env), agent = createSpatialAgent({ id: 'C-2', type: 'courier', index: at(2, 6), width: 16, height: 16, batteryEnabled: false });
  // A unit fixture with previously observed space. Actual sensing remains bounded.
  agent.memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 0);
  const step = time => think(agent, perceive(world, agent), { time, dt: .2, useLandmarks: true });
  return { env, world, agent, step };
}

test('new road-to-construction and road-to-crowd edits change semantic passability/cost independently of colors', () => {
  assert.equal(terrainPassable(describeTerrain('road')), true); assert.equal(terrainPassable(describeTerrain('construction')), false);
  assert.ok(terrainCost(describeTerrain('crowd')) > terrainCost(describeTerrain('road')));
  assert.equal(terrainCost(describeTerrain('crowd')), DEFAULT_CROWD_COST);
  assert.equal(terrainCost(describeTerrain('crowd', { crowdBaseCost: 1 })), 1, 'an explicit custom cost remains respected');
  assert.equal(terrainCost(describeTerrain('construction', { constructionMode: 'costly', constructionCost: 7 })), 7);
});

test('an observed obstacle replaces an unfinished route once, while repeated searches are diagnostic only', () => {
  const { env, world, agent, step } = routeFixture(); step(.2);
  assert.ok(agent.path.includes(at(5, 6))); assert.equal(agent.planning.initialPlans, 1); assert.equal(agent.replans, 0);
  env.layers.static[at(5, 6)] = 'construction'; world.sync(env);
  assert.equal(agent.memory.cells[at(5, 6)].terrain, 'road', 'truth changes do not directly enter memory');
  step(.4); assert.equal(agent.replans, 1); assert.equal(agent.planning.reasons.obstacle, 1); assert.ok(!agent.path.includes(at(5, 6)));
  const searches = agent.planning.computations;
  for (const time of [.6, .8, 1]) step(time);
  assert.equal(agent.replans, 1); assert.equal(agent.planning.computations, searches);
});

test('cost changes count only when the preferred ongoing route actually changes', () => {
  for (const [cost, expectedReplans] of [[2.5, 0], [8, 1]]) {
    const { env, world, agent, step } = routeFixture(); step(.2);
    const previous = [...agent.path]; env.layers.static[at(5, 6)] = 'crowd'; env.rules.crowdBaseCost = cost; world.sync(env);
    step(.4); assert.equal(agent.replans, expectedReplans);
    if (expectedReplans) { assert.notDeepEqual(agent.path, previous); assert.equal(agent.planning.reasons.information, 1); }
    else { assert.deepEqual(agent.path, previous); assert.ok(agent.planning.unchangedRoutes > 0); }
  }
});

test('a newly sensed off-route passage can improve an ongoing known route without reading hidden cells', () => {
  const { env, world, agent, step } = routeFixture();
  env.layers.static[at(5, 6)] = 'building'; world.sync(env);
  agent.memory.observe({ cells: [{ index: at(5, 6), ...world.cell(at(5, 6)) }] }, 0); step(.2);
  assert.ok(!agent.path.includes(at(5, 6)));
  env.layers.static[at(5, 6)] = 'road'; world.sync(env); assert.equal(agent.memory.cells[at(5, 6)].terrain, 'building');
  step(.4); assert.ok(agent.path.includes(at(5, 6))); assert.equal(agent.planning.reasons.information, 1);
  assert.ok(agent.path.every(index => agent.memory.cells[index]));
});

test('a sensed goal change during navigation and occupancy recovery have distinct replan reasons', () => {
  const goal = routeFixture(); goal.step(.2);
  goal.env.layers.semantic[at(8, 6)] = 'depot'; goal.world.sync(goal.env); goal.step(.4);
  assert.equal(goal.agent.planning.reasons.goal, 1); assert.equal(goal.agent.replans, 1);
  const occupied = routeFixture(); occupied.step(.2);
  const blocker = { id: 'E-1', type: 'explorer', position: { x: 3, y: 6 } };
  for (let n = 0; n < 10 && !occupied.agent.replans; n++) {
    const observation = perceive(occupied.world, occupied.agent, [blocker]);
    think(occupied.agent, observation, { time: .4 + n * .2, dt: .2, useLandmarks: true });
  }
  assert.equal(occupied.agent.planning.reasons.occupancy, 1); assert.equal(occupied.agent.replans, 1);
});

test('exhausted frontier scans do not inflate meaningful replans', () => {
  const env = createEnvironment(16), world = new GridWorld(env), agent = createSpatialAgent({ id: 'E-1', type: 'explorer', index: at(6, 6), width: 16, height: 16 });
  agent.memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 0);
  for (let n = 1; n <= 200; n++) think(agent, perceive(world, agent), { time: n * .2, dt: .2, useLandmarks: true });
  assert.ok(agent.planning.unsuccessfulSearches > 20); assert.equal(agent.replans, 0); assert.equal(agent.replanEvents.length, 0);
});

test('live hidden edits cannot reset routes or change agent decisions before perception', () => {
  const pair = createExperimentPair('closure'), a = new AgentSimulation(structuredClone(pair.a), pair.options), b = new AgentSimulation(structuredClone(pair.a), pair.options);
  for (let n = 0; n < 10; n++) { a.step(); b.step(); }
  const hidden = 0; assert.ok(b.agents.every(agent => !agent.memory.cells[hidden]));
  const paths = b.agents.map(agent => [...agent.path]); b.environment.layers.static[hidden] = 'crowd'; b.syncEnvironment(b.environment);
  assert.deepEqual(b.agents.map(agent => agent.path), paths);
  for (let n = 0; n < 10; n++) { a.step(); b.step(); }
  assert.deepEqual(a.agents.map(agent => [agent.position, agent.path, agent.goal, agent.replans]), b.agents.map(agent => [agent.position, agent.path, agent.goal, agent.replans]));
});

test('batched fast and frame-accumulated playback produce exactly identical complete results and spatial snapshots', () => {
  const pair = createExperimentPair('congestion'), study = new EnvironmentComparison(pair.b, { ...pair.options, seconds: 120 });
  const fast = study.runA(), animated = study.runA();
  const result = finish(fast);
  for (let frame = 0; animated.simulation.tick < animated.ticks; frame++) animated.simulation.advance([16, 17, 33, 8][frame % 4] * 16);
  animated.done = true; assert.deepEqual(animated.result(), result);
});

test('identical A/B maps preserve initial conditions and yield identical metrics, paths and knowledge', () => {
  const pair = createExperimentPair('shortcut'), study = new EnvironmentComparison(pair.a, { ...pair.options, seconds: 120 });
  const a = study.runA(), b = study.runB(study.duplicateB());
  assert.deepEqual(a.plan, b.plan); assert.ok(a.simulation.agents.every(agent => agent.memory.known === 0));
  assert.deepEqual(finish(a), finish(b));
});

test('three validation presets are connected interventions on recorded routes, without prescribed winners', () => {
  for (const id of ['shortcut', 'closure', 'congestion']) {
    const pair = createExperimentPair(id), study = new EnvironmentComparison(pair.a, pair.options);
    assert.ok(hasValidRoutes(pair.a, study.plan)); assert.ok(hasValidRoutes(pair.b, study.plan));
    const a = study.runA(), b = study.runB(pair.b), resultA = finish(a), resultB = finish(b);
    const data = analyzeSpatialComparison(pair.a, pair.b, resultA, resultB);
    assert.ok(data.changes.length > 0); assert.equal(resultA.seconds, resultB.seconds);
    if (id === 'closure') { assert.ok(data.changes.every(cell => cell.kind === 'blocked')); assert.ok(data.changes.reduce((sum, cell) => sum + cell.a.visits, 0) > 0); assert.equal(data.changes.reduce((sum, cell) => sum + cell.b.visits, 0), 0); }
    if (id === 'congestion') { assert.ok(data.changes.every(cell => cell.kind === 'crowd')); assert.ok(data.changes.every(cell => cell.costB > cell.costA)); assert.ok(data.changes.some(cell => cell.a.visits > 0)); }
    if (id === 'shortcut') { assert.ok(data.changes.every(cell => cell.kind === 'passage')); assert.ok(data.changes.some(cell => cell.b.visits > 0)); }
    for (const [result, run] of [[resultA, a], [resultB, b]]) {
      assert.equal(result.replans, Object.values(result.replanReasons).reduce((sum, count) => sum + count, 0));
      assert.equal(result.replans, result.spatial.agents.reduce((sum, agent) => sum + agent.replanEvents.length, 0));
      assert.equal(result.distance, result.spatial.agents.reduce((sum, agent) => sum + agent.trail.length - 1, 0));
      assert.equal(result.averageDeliveryTime, result.trips.reduce((sum, trip) => sum + trip.time, 0) / result.deliveries);
      assert.equal(result.planningComputations, run.simulation.agents.reduce((sum, agent) => sum + agent.planning.computations, 0));
    }
    assert.ok(comparisonExplanation(data).some(text => text.includes('Mean successful time')));
  }
});

test('spatial edge counts, sensed cells and paired delivery routes are derived from actual immutable snapshots', () => {
  const pair = createExperimentPair('closure'), study = new EnvironmentComparison(pair.a, { ...pair.options, seconds: 120 });
  const runA = study.runA(), runB = study.runB(pair.b), a = finish(runA), b = finish(runB);
  const snapshot = structuredClone(b.spatial), data = analyzeSpatialComparison(pair.a, pair.b, a, b);
  assert.equal([...pathEdges(b.spatial).values()].reduce((sum, edge) => sum + edge.count, 0), b.distance);
  for (const cell of data.changes) {
    assert.equal(cell.b.visits, runB.simulation.visits[cell.index]);
    assert.equal(cell.b.observers.length, runB.simulation.agents.filter(agent => agent.memory.cells[cell.index]).length);
  }
  runB.simulation.maxTicks = null; runB.simulation.step(); assert.deepEqual(b.spatial, snapshot);
  const old = analyzeSpatialComparison(pair.a, pair.b, { ...a, spatial: undefined }, { ...b, spatial: undefined });
  assert.equal(old.pairedAgents.length, 0); assert.match(comparisonExplanation(old).join(' '), /No missing spatial history is inferred/);
});

test('comparison renderer draws recorded coordinates and change categories without moving the camera or showing live agents', () => {
  const originals = new Map(['window', 'ResizeObserver', 'requestAnimationFrame'].map(key => [key, globalThis[key]]));
  try {
    globalThis.window = { devicePixelRatio: 1 }; globalThis.ResizeObserver = class { observe() {} }; globalThis.requestAnimationFrame = () => 1;
    const pair = createExperimentPair('closure'), study = new EnvironmentComparison(pair.a, { ...pair.options, seconds: 40 });
    const a = finish(study.runA()), b = finish(study.runB(pair.b)), data = analyzeSpatialComparison(pair.a, pair.b, a, b);
    const calls = [], ctx = new Proxy({}, { get(target, key) { return key in target ? target[key] : (...args) => calls.push({ key, args, color: target.strokeStyle, fill: target.fillStyle }); } });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1000, height: 700 }) }, renderer = new MapRenderer(canvas, () => pair.b);
    renderer.resize(); renderer.zoomBy(1.2); renderer.pan(13, -7); const camera = { ...renderer.camera };
    for (const mode of ['a', 'b', 'overlay']) {
      calls.length = 0; renderer.setComparisonView({ data, environment: mode === 'a' ? pair.a : pair.b, mode, showChanges: true, showKnowledge: true }); renderer.draw();
      assert.deepEqual(renderer.camera, camera); assert.ok(calls.some(call => call.key === 'strokeRect' && call.color === COMPARISON_COLORS.blocked));
      if (mode !== 'b') assert.ok(calls.some(call => call.key === 'stroke' && call.color === COMPARISON_COLORS.a));
      if (mode !== 'a') assert.ok(calls.some(call => call.key === 'stroke' && call.color === COMPARISON_COLORS.b));
      assert.ok(!calls.some(call => call.key === 'arc'), 'historical views must not draw current live actors');
    }
    calls.length = 0;
    drawSpatialComparison(ctx, { x: 10, y: 20, cell: 8 }, { data, mode: 'a', showChanges: false, showKnowledge: false }, 40);
    const first = data.indexedA.edges.values().next().value;
    assert.ok(calls.some(call => call.key === 'moveTo' && call.args[0] === 10 + (first.from % 40 + .5) * 8 && call.args[1] === 20 + (Math.floor(first.from / 40) + .5) * 8));
  } finally { for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('changed pedestrian starts are disclosed and cannot receive a matched A/B winner ranking', () => {
  const pair = createExperimentPair('shortcut'), study = new EnvironmentComparison(pair.a, { ...pair.options, seconds: 120 });
  const b = structuredClone(pair.a); b.layers.dynamic[9 * 40 + 18] = 'pedestrian';
  study.resultA = finish(study.runA()); study.resultB = finish(study.runB(b));
  assert.ok(study.resultA.deliveries > 0 && study.resultB.deliveries > 0);
  const data = analyzeSpatialComparison(pair.a, b, study.resultA, study.resultB);
  assert.equal(data.initialConditionsMatch, false); assert.equal(study.preferred(), null);
  assert.match(comparisonExplanation(data).join(' '), /initial states differ/);
});
