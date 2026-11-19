import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import BASE from '../data/manhattan-base.js';
import { createManhattanEnvironment, GEO_SOURCES } from '../src/manhattan.js';
import { createEnvironment, isTraversable } from '../src/environment.js';
import { gridToGeographic, geographicToGrid, lonLatToMercator, mercatorToLonLat } from '../src/coordinates.js';
import { NEIGHBORHOODS, presetArea, ensureLocalScenario, areaIndices, connectedComponents } from '../src/regions.js';
import { fitCamera, fitAreaCamera, cellAtPoint } from '../src/camera.js';
import { EnvironmentEditor } from '../src/editor.js';
import { serializeScenario, parseScenario } from '../src/scenario.js';
import { AgentSimulation } from '../src/agents/simulation.js';
import { GridWorld } from '../src/agents/world.js';
import { describeAgentLocation, measureKnownDistance } from '../src/locations.js';
import { applyPreset, generateVariation, hasValidRoutes, environmentChanges } from '../src/design.js';
import { EnvironmentComparison, createExperimentPlan, FixedEnvironmentRun } from '../src/ab-comparison.js';
import { RasterCache } from '../src/raster-cache.js';

function fixture() {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let y = 2; y <= 13; y++) for (let x = 2; x <= 13; x++) env.layers.static[y * 16 + x] = 'road';
  for (let y = 2; y <= 10; y++) env.layers.static[y * 16 + 7] = 'building';
  env.layers.semantic[8 * 16 + 3] = 'depot'; env.layers.semantic[8 * 16 + 12] = 'destination';
  env.layers.dynamic[8 * 16 + 3] = 'robot'; env.layers.dynamic[9 * 16 + 3] = 'robot';
  env.simulation = { activeArea: { id: 'test', name: 'Test', x: 0, y: 0, width: 16, height: 16 }, agentMode: 'explorer-courier', taskBudget: 4 };
  return env;
}
function finish(run) { while (!run.advance(150)); return run.result(); }

test('bundled full-island geography has reproducible source fingerprints and honest aggregation metadata', () => {
  const env = createManhattanEnvironment(), second = createManhattanEnvironment();
  assert.deepEqual([env.grid.width, env.grid.height], [256, 512]);
  assert.equal(env.source.kind, 'gis'); assert.match(env.source.description, /not building footprints/);
  assert.equal(GEO_SOURCES.length, 3);
  assert.ok(BASE.datasets.every(dataset => dataset.features > 0));
  for (const [file, hash] of Object.entries(BASE.sha256)) {
    const bytes = readFileSync(new URL(`../data/geography/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
  assert.ok(env.grid.cellSizeMeters > 35 && env.grid.cellSizeMeters < 45);
  for (const [longitude, latitude] of [[-74.015, 40.704], [-73.925, 40.872]]) {
    const cell = geographicToGrid(env, longitude, latitude); assert.notEqual(env.layers.static[cell.y * 256 + cell.x], 'water');
  }
  const park = geographicToGrid(env, -73.966, 40.783); assert.equal(env.layers.static[park.y * 256 + park.x], 'park');
  const river = geographicToGrid(env, -74.04, 40.75); assert.equal(env.layers.static[river.y * 256 + river.x], 'water');
  env.layers.static[0] = 'road'; assert.equal(second.layers.static[0], 'water');
});

test('global/geographic transforms preserve square projected cells, north orientation and cell-center round trips', () => {
  const env = createManhattanEnvironment(), bounds = env.source.bounds;
  assert.ok(Math.abs((bounds[2] - bounds[0]) / 256 - (bounds[3] - bounds[1]) / 512) < 1e-7);
  for (const [x, y] of [[0, 0], [255, 511], [100, 255]]) {
    const point = gridToGeographic(env, x, y); assert.deepEqual(geographicToGrid(env, point.longitude, point.latitude), { x, y });
  }
  assert.ok(gridToGeographic(env, 100, 0).latitude > gridToGeographic(env, 100, 511).latitude);
  const projected = lonLatToMercator(-73.99, 40.75), original = mercatorToLonLat(...projected);
  assert.ok(Math.abs(original[0] + 73.99) < 1e-9 && Math.abs(original[1] - 40.75) < 1e-9);
  assert.equal(gridToGeographic(createEnvironment(16), 2, 3), null);
  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [700, 600]]) {
    const full = fitCamera(width, height, 256, 512), area = env.simulation.activeArea, local = fitAreaCamera(width, height, area);
    assert.ok(full.y >= 70 && full.y + 512 * full.cell <= height - 110);
    assert.deepEqual(cellAtPoint(local, local.x + (area.x + .5) * local.cell, local.y + (area.y + .5) * local.cell), [area.x, area.y]);
    assert.ok(local.cell > full.cell);
  }
});

test('every demo area has connected authored missions, bounded agents and no hidden full-island knowledge', () => {
  for (const preset of NEIGHBORHOODS) {
    const env = createManhattanEnvironment(); ensureLocalScenario(env, presetArea(env, preset.id));
    const area = env.simulation.activeArea, indices = [...areaIndices(area, 256)];
    assert.ok(indices.filter(index => env.layers.semantic[index] === 'depot').length >= 2);
    assert.ok(indices.filter(index => env.layers.semantic[index] === 'destination').length >= 3);
    assert.ok(connectedComponents(env, area)[0].length > 100);
    const sim = new AgentSimulation(env, { count: 4, seed: 1 });
    assert.deepEqual(sim.agents.map(agent => agent.type), ['explorer', 'courier', 'explorer', 'courier']);
    assert.ok(sim.agents.every(agent => agent.memory.known === 0));
    for (let n = 0; n < 25; n++) sim.step();
    for (const agent of sim.agents) {
      assert.ok(sim.world.inArea(sim.world.index(agent.position))); assert.ok(agent.memory.known < area.width * area.height);
      for (let index = 0; index < agent.memory.cells.length; index++) if (!sim.world.inArea(index)) assert.equal(agent.memory.cells[index], null);
      assert.ok(agent.path.every(index => agent.memory.cells[index]));
    }
  }
});

test('imported parks require explicit access and access-only edits survive undo, redo and scenario load', () => {
  const env = createEnvironment(16); env.layers.static.fill('park'); env.rules.parkAccess = 'marked'; env.access = Array(256).fill(false);
  const editor = new EnvironmentEditor(env), world = new GridWorld(env);
  assert.equal(isTraversable(env, 10), false); assert.equal(world.canStand(10), false);
  editor.paint(10, 0, 'park'); editor.endStroke(); assert.equal(isTraversable(env, 10), true);
  editor.undo(); assert.equal(isTraversable(env, 10), false); editor.redo(); assert.equal(isTraversable(env, 10), true);
  const change = structuredClone(env); change.access[11] = true;
  editor.applyDesign(change); assert.equal(isTraversable(env, 11), true); editor.undo(); assert.equal(isTraversable(env, 11), false);
  assert.deepEqual(parseScenario(serializeScenario(env)), env);
});

test('dense full-island JSON preserves four layers, access, source and active area under the existing size limit', () => {
  const env = createManhattanEnvironment(), json = serializeScenario(env);
  assert.ok(json.length < 4_000_000); assert.equal(JSON.parse(json).layers.static.encoding, 'rle');
  assert.deepEqual(parseScenario(json), env);
  const bad = JSON.parse(json); bad.layers.static.runs[0][1] = 1_000_000;
  assert.throws(() => parseScenario(JSON.stringify(bad)), /RLE/);
  bad.layers.static.runs[0][1] = 0; assert.throws(() => parseScenario(JSON.stringify(bad)), /RLE/);
});

test('relative places and both distances derive only from agent memory and distinguish cost from steps', () => {
  const env = fixture(), sim = new AgentSimulation(env), agent = sim.agents[1], world = sim.world;
  agent.position = { x: 3, y: 8 };
  const destination = world.dispatch().find(job => job.kind === 'destination');
  assert.equal(measureKnownDistance(agent, destination.id).known, false);
  assert.match(describeAgentLocation(agent, env).relative, /No remembered/);
  agent.memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 0);
  const location = describeAgentLocation(agent, env), distance = measureKnownDistance(agent, destination.id);
  assert.match(location.relative, /At depot/); assert.equal(location.column, 3); assert.equal(location.row, 8);
  assert.equal(distance.manhattan, 9); assert.ok(distance.steps > 9); assert.ok(distance.cost >= distance.steps);
  agent.position = { x: 3, y: 7 }; assert.match(describeAgentLocation(agent, env).relative, /1 north/);
  const gap = 11 * 16 + 7; agent.memory.cells[gap] = null; agent.memory.cells[12 * 16 + 7] = null; agent.memory.cells[13 * 16 + 7] = null;
  const unreachable = measureKnownDistance(agent, destination.id); assert.equal(unreachable.manhattan, 10); assert.equal(unreachable.steps, null); assert.equal(unreachable.cost, null);
});

test('Explorer/Courier local game measures real repeated deliveries, landmark reuse and exclusive occupancy', () => {
  const env = createManhattanEnvironment(), before = structuredClone(env.layers), sim = new AgentSimulation(env, { count: 4, seed: 1 });
  for (let n = 0; n < 2400; n++) {
    sim.step(); const cells = sim.occupants().map(item => sim.world.index(item.position)); assert.equal(new Set(cells).size, cells.length);
  }
  const summary = sim.summary(), trips = sim.agents.filter(agent => agent.type === 'courier').flatMap(agent => agent.trips);
  assert.equal(summary.deliveries, trips.length); assert.equal(summary.plannedTasks, 8); assert.equal(summary.successRate, trips.length / 8);
  assert.ok(trips.length > 0); assert.equal(summary.averageDeliveryTime, trips.reduce((sum, trip) => sum + trip.time, 0) / trips.length);
  assert.ok(summary.reuse > 0); assert.ok(summary.explorationCoverage > .4 && summary.explorationCoverage <= 1);
  assert.ok(sim.agents.filter(agent => agent.type === 'explorer').every(agent => agent.trips.length === 0 && agent.memory.known > 20));
  assert.deepEqual(env.layers, before);
});

test('A/B plans freeze starts, headings, task identities, pickup, seed, sight, counts and blank memory', () => {
  const comparison = new EnvironmentComparison(fixture(), { seed: 21, count: 4, radius: 3, seconds: 160 });
  const a = comparison.runA(), b = comparison.runB(comparison.duplicateB());
  assert.deepEqual(a.plan, b.plan); assert.ok(a.simulation.agents.every(agent => agent.memory.known === 0));
  assert.deepEqual(a.simulation.agents.map(agent => [agent.position, agent.heading, agent.assignments, agent.pickupId]), b.simulation.agents.map(agent => [agent.position, agent.heading, agent.assignments, agent.pickupId]));
  comparison.resultA = finish(a); comparison.resultB = finish(b); assert.deepEqual(comparison.resultA, comparison.resultB);
  assert.equal(comparison.preferred(), comparison.resultA.deliveries ? 'tie' : null);
  assert.equal(comparison.resultA.seconds, 160); a.simulation.step(); assert.equal(a.simulation.time, 160);
  const blocked = structuredClone(comparison.b); blocked.layers.static[comparison.plan.starts[0].index] = 'building';
  assert.throws(() => comparison.runB(blocked), /Fixed start/);
});

test('fixed workload penalizes failed environments without inventing a fast successful delivery', () => {
  const env = fixture(), comparison = new EnvironmentComparison(env, { seed: 3, seconds: 240 });
  comparison.resultA = finish(comparison.runA()); assert.ok(comparison.resultA.deliveries > 0);
  const b = comparison.duplicateB(); for (let y = 2; y <= 13; y++) b.layers.static[y * 16 + 7] = 'construction';
  comparison.resultB = finish(comparison.runB(b));
  assert.equal(comparison.resultB.plannedTasks, comparison.resultA.plannedTasks);
  assert.equal(comparison.resultB.deliveries, 0); assert.equal(comparison.resultB.averageDeliveryTime, null);
  assert.equal(comparison.resultB.successRate, 0); assert.equal(comparison.resultB.incompleteTasks, 4); assert.equal(comparison.preferred(), 'A');
});

test('design presets and small seeded variations stay local, undoable, and preserve fixed experimental routes', () => {
  const env = createManhattanEnvironment(), plan = createExperimentPlan(env, { count: 4, seed: 1 });
  for (const seed of [1, 2, 17]) {
    const variation = generateVariation(env, { seed, plan }), changes = environmentChanges(env, variation);
    assert.ok(changes.cells.length >= 1 && changes.cells.length <= 4); assert.ok(hasValidRoutes(variation, plan));
    assert.deepEqual(variation, generateVariation(env, { seed, plan }));
    for (const start of plan.starts) assert.equal(variation.layers.static[start.index], env.layers.static[start.index]);
    assert.deepEqual(variation.layers.semantic, env.layers.semantic);
    const check = new FixedEnvironmentRun(variation, plan, 1); assert.equal(check.simulation.agents.length, 4);
  }
  for (const preset of ['construction', 'crowd', 'passage', 'destination']) {
    const result = applyPreset(env, preset, { protectedCells: plan.starts.map(start => start.index) }), changes = environmentChanges(env, result);
    assert.ok(changes.cells.length > 0, preset); assert.ok(changes.cells.every(index => new GridWorld(env).inArea(index)));
    const editor = new EnvironmentEditor(structuredClone(env)); editor.applyDesign(result); assert.deepEqual(editor.environment.layers, result.layers);
    editor.undo(); assert.deepEqual(editor.environment, env); editor.redo(); assert.deepEqual(editor.environment.layers, result.layers);
  }
});

test('overview cache draws truthful semantic colors and observation-only individual pixels, without rebuilding static data each tick', () => {
  const previous = globalThis.OffscreenCanvas; let pixels, writes = 0;
  globalThis.OffscreenCanvas = class { getContext() { return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: image => { pixels = image.data; writes++; } }; } };
  try {
    const env = createManhattanEnvironment(), sim = new AgentSimulation(env), cache = new RasterCache();
    const options = { mode: 'none', simulation: sim, visibility: { static: true, dynamic: true, semantic: true, overlays: true }, unknownColor: '#17181f' };
    assert.ok(cache.update(env, options)); assert.deepEqual([...pixels.slice(0, 4)], [10, 30, 44, 255]);
    const depot = env.layers.semantic.findIndex(value => value === 'depot'); assert.deepEqual([...pixels.slice(depot * 4, depot * 4 + 3)], [250, 250, 247]);
    sim.step(); cache.update(env, options); assert.equal(writes, 1);
    const agent = sim.agents[0]; cache.update(env, { ...options, mode: 'individual', individual: agent });
    assert.deepEqual([...pixels.slice(depot * 4, depot * 4 + 3)], [23, 24, 31], 'unseen landmark must not leak through the raster cache');
    cache.invalidate(); cache.update(env, options); assert.equal(writes, 3);
  } finally { if (previous === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = previous; }
});
