import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createExperimentPair, EXPERIMENTS } from '../src/experiments.js';
import { createAbstractEnvironment } from '../src/abstract-manhattan.js';
import { createEnvironment } from '../src/environment.js';
import { EnvironmentEditor } from '../src/editor.js';
import { EnvironmentComparison, FixedEnvironmentRun } from '../src/ab-comparison.js';
import { ScenarioArchive } from '../src/scenarios.js';
import { generateAlternatives, environmentChanges, hasValidRoutes } from '../src/design.js';
import { AgentSimulation } from '../src/agents/simulation.js';
import { GridWorld } from '../src/agents/world.js';
import { SpatialMemory } from '../src/agents/memory.js';
import { createSpatialAgent } from '../src/agents/state.js';
import { think } from '../src/agents/agent.js';
import { describeAgentLocation, measureKnownDistance } from '../src/locations.js';
import { findPath } from '../src/agents/pathfinding.js';
import { terrainCost } from '../src/terrain.js';
import { parseScenario, serializeScenario } from '../src/scenario.js';
import { PARK_PROFILE } from '../data/nyc-park-profile.js';

const finish = run => { while (!run.advance(100)); return run.result(); };

test('each authored experiment preserves valid starts/goals, coordinates, source and reproducible conditions', () => {
  for (const item of EXPERIMENTS) {
    const pair = createExperimentPair(item.id), comparison = new EnvironmentComparison(pair.a, pair.options);
    assert.deepEqual(pair, createExperimentPair(item.id));
    assert.deepEqual([pair.a.grid.width, pair.a.grid.height], [40, 28]);
    assert.equal(pair.a.source.kind, 'schematic'); assert.ok(pair.changes.cells.length > 0);
    assert.ok(hasValidRoutes(pair.a, comparison.plan)); assert.ok(hasValidRoutes(pair.b, comparison.plan));
    assert.deepEqual(parseScenario(serializeScenario(pair.a)), pair.a); assert.deepEqual(parseScenario(serializeScenario(pair.b)), pair.b);
    const a = comparison.runA(), b = comparison.runB(pair.b);
    assert.deepEqual(a.plan, b.plan); assert.ok(a.simulation.agents.every(agent => agent.memory.known === 0));
    assert.ok(b.simulation.agents.every(agent => agent.memory.known === 0));
    assert.deepEqual(a.simulation.agents.map(agent => [agent.position, agent.assignments, agent.pickupId, agent.heading]), b.simulation.agents.map(agent => [agent.position, agent.assignments, agent.pickupId, agent.heading]));
  }
});

test('three demonstration outcomes use completed trip records and actual treatment visits, not assumed winners', () => {
  for (const item of EXPERIMENTS) {
    const pair = createExperimentPair(item.id), study = new EnvironmentComparison(pair.a, pair.options);
    study.resultA = finish(study.runA()); const runB = study.runB(pair.b); study.resultB = finish(runB);
    for (const result of [study.resultA, study.resultB]) {
      assert.equal(result.seconds, 480); assert.equal(result.plannedTasks, 8);
      assert.equal(result.deliveries, result.trips.length); assert.equal(result.successRate, result.trips.length / 8);
      assert.ok(result.trips.length > 0);
      assert.equal(result.averageDeliveryTime, result.trips.reduce((sum, trip) => sum + trip.time, 0) / result.trips.length);
      assert.equal(result.averageTravelCost, result.trips.reduce((sum, trip) => sum + trip.weightedCost, 0) / result.trips.length);
    }
    assert.equal(study.resultB.treatmentVisits, pair.changes.cells.reduce((sum, index) => sum + runB.simulation.visits[index], 0));
    assert.ok(study.resultB.treatmentObservers > 0);
    const replay = finish(study.runB(pair.b)); assert.deepEqual(replay, study.resultB);
  }
});

test('shortcut changes obstacle-aware routes without changing Manhattan endpoints; crowd cost favors a different known route', () => {
  for (const id of ['shortcut', 'congestion']) {
    const pair = createExperimentPair(id), distances = [];
    for (const env of [pair.a, pair.b]) {
      const world = new GridWorld(env), memory = new SpatialMemory(40, 28);
      memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 0);
      const agent = { type: 'courier', position: { x: 4, y: 14 }, memory };
      const destination = [...memory.landmarks.values()].find(place => place.kind === 'destination' && place.position.y === 14);
      const measured = measureKnownDistance(agent, destination.id), route = findPath(memory, 14 * 40 + 4, destination.index);
      assert.equal(measured.manhattan, 31);
      assert.equal(measured.cost, route.route.slice(1).reduce((sum, index) => sum + terrainCost(memory.cells[index]), 0));
      distances.push(measured);
      if (id === 'congestion' && env === pair.b) assert.ok(route.route.every(index => memory.cells[index].terrain !== 'crowd'));
    }
    if (id === 'shortcut') assert.ok(distances[1].steps < distances[0].steps);
    else assert.ok(distances[1].steps > distances[0].steps);
  }
});

test('observed generic landmarks influence Explorer goals; hidden landmarks and disabled strategy cannot do so', () => {
  const env = createEnvironment(16), world = new GridWorld(env), here = 6 * 16 + 3, target = 6 * 16 + 5;
  env.layers.semantic[target] = 'landmark'; world.sync(env);
  const observation = { cells: [here, here + 1, target].map(index => ({ index, ...world.cell(index) })), visible: new Set([here, here + 1, target]), occupants: [] };
  const build = () => createSpatialAgent({ id: 'E-1', type: 'explorer', index: here, width: 16, height: 16, batteryEnabled: false });
  const enabled = build(), disabled = build(), hidden = build();
  think(enabled, observation, { time: .2, dt: .2, useLandmarks: true });
  think(disabled, observation, { time: .2, dt: .2, useLandmarks: false });
  think(hidden, { ...observation, cells: observation.cells.slice(0, 2), visible: new Set([here, here + 1]) }, { time: .2, dt: .2, useLandmarks: true });
  assert.equal(enabled.goal.kind, 'landmark'); assert.equal(enabled.goal.index, target);
  assert.notEqual(disabled.goal.kind, 'landmark'); assert.ok(!hidden.memory.cells[target]); assert.notEqual(hidden.goal?.kind, 'landmark');
  assert.match(describeAgentLocation(enabled, env).relative, /2 west/);
});

test('Explorer coverage and actual movement cost are independently computed from runtime state', () => {
  const pair = createExperimentPair('congestion'), run = new EnvironmentComparison(pair.b, pair.options).runA();
  finish(run); const sim = run.simulation, summary = sim.summary(), known = new Set();
  const explorers = sim.agents.filter(agent => agent.type === 'explorer');
  for (const agent of explorers) agent.memory.cells.forEach((cell, index) => { if (cell) known.add(index); });
  assert.equal(summary.explorerCoverage, known.size / (40 * 28));
  assert.equal(summary.explorerCost, explorers.reduce((sum, agent) => sum + agent.travelCost, 0));
  assert.equal(summary.travelCost, sim.agents.reduce((sum, agent) => sum + agent.travelCost, 0));
  assert.ok(summary.travelCost >= summary.distance);
});

test('two or three alternatives are distinct, controlled, feasible and deterministic, with exact cell changes', () => {
  const pair = createExperimentPair('shortcut'), study = new EnvironmentComparison(pair.a, pair.options);
  const alternatives = generateAlternatives(pair.a, { seed: 17, plan: study.plan });
  assert.equal(alternatives.length, 3); assert.deepEqual(alternatives, generateAlternatives(pair.a, { seed: 17, plan: study.plan }));
  assert.equal(new Set(alternatives.map(env => JSON.stringify(env.layers))).size, 3);
  for (const env of alternatives) {
    const changes = environmentChanges(pair.a, env);
    assert.ok(changes.cells.length > 0 && changes.cells.length <= 4);
    assert.equal(changes.details.length, changes.cells.length); assert.ok(hasValidRoutes(env, study.plan));
    for (const cell of changes.details) for (const patch of cell.patches) {
      assert.equal(cell.y * 40 + cell.x, cell.index);
      if (patch.layer !== 'access') { assert.equal(pair.a.layers[patch.layer][cell.index], patch.before); assert.equal(env.layers[patch.layer][cell.index], patch.after); }
    }
    for (const start of study.plan.starts) assert.equal(env.layers.static[start.index], pair.a.layers.static[start.index]);
  }
  assert.equal(generateAlternatives(pair.a, { seed: 7, plan: study.plan, count: 2 }).length, 2);
  assert.throws(() => generateAlternatives(pair.a, { count: 4 }), /two or three/);
});

test('scenario lineage preserves evaluated maps, results and conditions across edits, selection and export', () => {
  const env = createAbstractEnvironment({ width: 32, height: 32 }), archive = new ScenarioArchive(), study = new EnvironmentComparison(env, { count: 4, seed: 3, seconds: 240 });
  const a = archive.add(env, { label: 'A' }), original = structuredClone(a.environment);
  const result = finish(study.runA()); archive.recordResult(a.id, result, study.plan);
  const b = archive.add(study.duplicateB(), { parentId: a.id, label: 'B' });
  b.environment.layers.static[0] = 'crowd'; assert.deepEqual(a.environment, original);
  assert.throws(() => archive.updateDraft(a.id, env, {}), /immutable/);
  assert.throws(() => archive.recordResult(b.id, { complete: false }, study.plan), /Incomplete/);
  const selected = archive.select(b.id); selected.layers.static[0] = 'park'; assert.equal(b.environment.layers.static[0], 'crowd');
  const next = archive.add(selected, { parentId: b.id, iteration: 1 });
  const exported = archive.export(); assert.equal(exported.selectedId, b.id); assert.equal(exported.scenarios.at(-1).parentId, b.id); assert.equal(next.iteration, 1);
  assert.deepEqual(exported.scenarios[0].result, result); assert.deepEqual(exported.scenarios[0].conditions.plan, study.plan);
  exported.scenarios[0].environment.layers.static[0] = 'building'; assert.deepEqual(a.environment, original);
});

test('NYC profile is verifiable count data that changes abstract parameters while preserving provenance and valid maps', () => {
  const raw = readFileSync(new URL('../data/geography/parks.geojson', import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'), PARK_PROFILE.sourceSha256);
  const features = JSON.parse(raw).features, counts = {};
  for (const feature of features) { const type = feature.properties.typecategory; counts[type] = (counts[type] || 0) + 1; }
  assert.deepEqual(counts, PARK_PROFILE.counts); assert.equal(features.length, PARK_PROFILE.total);
  assert.equal(PARK_PROFILE.parkBlockProbability, counts['Neighborhood Park'] / features.length);
  assert.ok(!JSON.stringify(PARK_PROFILE).includes('coordinates'));
  const normal = createAbstractEnvironment({ seed: 42 }), grounded = createAbstractEnvironment({ seed: 42, parkProfile: true });
  assert.notDeepEqual(normal.layers.static, grounded.layers.static); assert.equal(grounded.source.kind, 'schematic');
  assert.equal(grounded.source.dataId, PARK_PROFILE.id); assert.equal(grounded.source.bounds, null);
  assert.deepEqual(parseScenario(serializeScenario(grounded)), grounded);
  assert.ok(hasValidRoutes(grounded));
});

test('painting rejects new agent or mission placements on blocked terrain and validates crowd cost settings', () => {
  const env = createEnvironment(16), editor = new EnvironmentEditor(env, () => {}, { requireWalkablePlacements: true }); editor.paint(2, 2, 'building'); editor.endStroke();
  for (const kind of ['robot', 'pedestrian', 'depot', 'destination', 'landmark']) assert.equal(editor.paint(2, 2, kind), false);
  editor.paint(2, 2, 'road'); editor.endStroke(); assert.equal(editor.paint(2, 2, 'destination'), true); editor.endStroke();
  env.rules.crowdBaseCost = 2.5; assert.equal(parseScenario(serializeScenario(env)).rules.crowdBaseCost, 2.5);
  env.rules.crowdBaseCost = -1; assert.throws(() => serializeScenario(env), /Crowd base/);
});

test('fixed studies reject invalid deadlines instead of recording artificial or endless runs', () => {
  const pair = createExperimentPair('shortcut'), study = new EnvironmentComparison(pair.a, pair.options);
  for (const seconds of [0, -1, Infinity, NaN, 86401]) assert.throws(() => new FixedEnvironmentRun(pair.a, study.plan, seconds), /duration/);
});
