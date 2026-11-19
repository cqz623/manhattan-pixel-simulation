import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateAbstractManhattan, createAbstractEnvironment } from '../src/abstract-manhattan.js';
import { createEnvironment, isTraversable, indexAt, OBJECTS } from '../src/environment.js';
import { TERRAINS, describeTerrain, terrainPassable, terrainCost } from '../src/terrain.js';
import { parseScenario, serializeScenario, validateScenario } from '../src/scenario.js';
import { EnvironmentEditor } from '../src/editor.js';
import { GridWorld } from '../src/agents/world.js';
import { SpatialMemory } from '../src/agents/memory.js';
import { perceive } from '../src/agents/perception.js';
import { findPath } from '../src/agents/pathfinding.js';
import { AgentSimulation } from '../src/agents/simulation.js';
import { fitCamera } from '../src/camera.js';
import { MapRenderer } from '../src/visualization.js';

const position = (x, y, heading = 0) => ({ id: 'observer', position: { x, y }, heading });
const cell = (x, y) => y * 16 + x;

test('central terrain semantics control classification, passability, color, and profile costs', () => {
  for (const [kind, definition] of Object.entries(TERRAINS)) {
    assert.equal(OBJECTS[kind].color, definition.color);
    assert.equal(describeTerrain(kind).opaque, definition.opaque);
  }
  assert.equal(TERRAINS.road.color, '#000000');
  assert.equal(terrainPassable(describeTerrain('building')), false);
  assert.equal(terrainPassable(describeTerrain('road')), true);
  assert.equal(terrainPassable(describeTerrain('construction')), false);
  assert.equal(terrainPassable(describeTerrain('construction', { constructionMode: 'costly' })), true);
  assert.equal(terrainCost(describeTerrain('construction', { constructionMode: 'costly', constructionCost: 9 })), 9);
  assert.equal(terrainCost(describeTerrain('park', { parkCost: 4 })), 7);
  assert.ok(terrainCost(describeTerrain('crowd', undefined, 3)) > terrainCost(describeTerrain('crowd', undefined, 0)));
  assert.ok(Object.isFrozen(describeTerrain('road').traversalCosts));
});

test('abstract generation is seeded, editable, connected, and valid at wide and square resolutions', () => {
  for (const [width, height] of [[16, 16], [32, 32], [96, 64], [128, 72]]) {
    const env = generateAbstractManhattan({ width, height, seed: 42 });
    assert.deepEqual(env, generateAbstractManhattan({ width, height, seed: 42 }));
    assert.deepEqual(validateScenario(env), env);
    assert.equal(env.source.seed, 42); assert.equal(env.source.generator, 'abstract-manhattan');
    assert.match(env.source.description, /Not actual GIS/);
    for (const kind of ['road', 'building', 'park', 'crowd', 'construction']) assert.ok(env.layers.static.includes(kind), `${width}: missing ${kind}`);
    const world = new GridWorld(env), road = env.layers.static.indexOf('road');
    const visited = new Set([road]), queue = [road];
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], x = index % width, y = Math.floor(index / width);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const next = indexAt(env, nx, ny);
        if (next >= 0 && !visited.has(next) && isTraversable(env, next)) { visited.add(next); queue.push(next); }
      }
    }
    env.layers.static.forEach((kind, index) => { if (kind === 'road') assert.ok(visited.has(index)); });
    env.layers.semantic.forEach((kind, index) => { if (kind) assert.ok(world.canStand(index) && visited.has(index)); });
    assert.equal(env.layers.dynamic.filter(kind => kind === 'robot').length, 2);
    assert.equal(env.layers.dynamic.filter(kind => kind === 'pedestrian').length, 8);
    const editor = new EnvironmentEditor(env); editor.paint(5, 5, 'crowd'); editor.endStroke();
    assert.equal(editor.environment.layers.static[5 * width + 5], 'crowd');
  }
  assert.notDeepEqual(generateAbstractManhattan({ seed: 1 }).layers.static, generateAbstractManhattan({ seed: 2 }).layers.static);
  assert.throws(() => generateAbstractManhattan({ seed: 0 }), /Seed/);
});

test('square brushes and clipped rectangles are batched, layer-safe, single undo actions', () => {
  let notifications = 0;
  const editor = new EnvironmentEditor(createEnvironment(16), () => notifications++);
  editor.paintBrush(0, 0, 'robot', 'dynamic', false, 3); editor.endStroke();
  assert.equal(editor.environment.layers.dynamic.filter(Boolean).length, 4);
  assert.ok(editor.environment.layers.static.every(kind => kind === 'open'));
  assert.equal(editor.undoStack.length, 1); editor.undo();
  notifications = 0;
  editor.fillRectangle([-3, -2], [3, 5], 'park', 'static'); editor.endStroke();
  assert.equal(editor.environment.layers.static.filter(kind => kind === 'park').length, 24);
  assert.equal(notifications, 2, 'one batch notification and one end-of-stroke notification');
  editor.undo(); assert.ok(editor.environment.layers.static.every(kind => kind === 'open'));
  editor.redo(); assert.equal(editor.environment.layers.static.filter(kind => kind === 'park').length, 24);
});

test('flood fill uses connected semantic values and preserves occupants and other layers', () => {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) env.layers.static[cell(x, y)] = 'road';
  env.layers.static[cell(12, 12)] = 'road'; env.layers.dynamic[cell(3, 3)] = 'pedestrian';
  const editor = new EnvironmentEditor(env);
  assert.equal(editor.floodFill(3, 3, 'crowd', 'static'), true); editor.endStroke();
  assert.equal(env.layers.static.filter(kind => kind === 'crowd').length, 16);
  assert.equal(env.layers.static[cell(12, 12)], 'road'); assert.equal(env.layers.dynamic[cell(3, 3)], 'pedestrian');
  editor.undo(); assert.equal(env.layers.static[cell(3, 3)], 'road');
});

test('construction and cost setting changes become memory only when observed', () => {
  const env = createEnvironment(16), world = new GridWorld(env), memory = new SpatialMemory(16);
  env.layers.static[cell(4, 6)] = 'construction'; world.sync(env);
  memory.observe(perceive(world, position(3, 6)), 1);
  assert.equal(terrainPassable(memory.cells[cell(4, 6)]), false);
  assert.ok(memory.cells[cell(5, 6)], 'construction does not occlude vision');
  const editor = new EnvironmentEditor(env); editor.setRules({ ...env.rules, constructionMode: 'costly', constructionCost: 8 }); world.sync(env);
  assert.equal(terrainPassable(memory.cells[cell(4, 6)]), false, 'unobserved settings do not rewrite memory');
  const updates = memory.observe(perceive(world, position(3, 6)), 20);
  assert.equal(terrainPassable(memory.cells[cell(4, 6)]), true); assert.equal(terrainCost(memory.cells[cell(4, 6)]), 8);
  assert.equal(memory.cells[cell(4, 6)].observedAt, 20); assert.ok(updates.terrainChanged.has(cell(4, 6)));
  editor.undo(); assert.equal(env.rules.constructionMode, 'blocked'); editor.redo(); assert.equal(env.rules.constructionMode, 'costly');
});

test('observed occupancy changes crowd route costs without leaking people hidden by walls', () => {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let x = 1; x <= 8; x++) { env.layers.static[cell(x, 4)] = 'road'; env.layers.static[cell(x, 1)] = 'road'; }
  for (let y = 1; y <= 4; y++) { env.layers.static[cell(1, y)] = 'road'; env.layers.static[cell(8, y)] = 'road'; }
  for (let x = 3; x <= 6; x++) env.layers.static[cell(x, 4)] = 'crowd';
  const world = new GridWorld(env), memory = new SpatialMemory(16);
  const observeAll = people => memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index, people) })) }, 0);
  observeAll([]);
  const quiet = findPath(memory, cell(1, 4), cell(8, 4)); assert.ok(quiet.route.some(index => memory.cells[index].terrain === 'crowd'));
  const people = [3, 4, 5, 6].map((x, n) => ({ id: `p-${n}`, position: { x, y: 4 }, type: 'pedestrian' }));
  observeAll(people);
  const busy = findPath(memory, cell(1, 4), cell(8, 4)); assert.ok(busy.route.every(index => memory.cells[index].terrain !== 'crowd'));
  const hiddenEnv = createEnvironment(16); hiddenEnv.layers.static[cell(3, 6)] = 'crowd';
  for (let x = 1; x <= 5; x++) hiddenEnv.layers.static[cell(x, 7)] = 'building';
  const hiddenWorld = new GridWorld(hiddenEnv), hidden = { id: 'hidden', type: 'pedestrian', position: { x: 3, y: 8 } };
  hiddenWorld.occupants = [hidden];
  assert.equal(hiddenWorld.cell(cell(3, 6)).congestion, 1);
  const percept = perceive(hiddenWorld, position(1, 6), [hidden]);
  assert.equal(percept.occupants.length, 0); assert.equal(percept.cells.find(record => record.index === cell(3, 6)).congestion, 0);
});

test('new terrain, configurable rules and generator metadata round trip; legacy files still load', () => {
  const env = generateAbstractManhattan({ width: 32, height: 32, seed: 9 });
  env.rules = { parkCost: 4, constructionMode: 'costly', constructionCost: 9, crowdWeight: 3 };
  assert.deepEqual(parseScenario(serializeScenario(env)), env);
  const legacy = structuredClone(createEnvironment(16)); delete legacy.rules;
  assert.equal(validateScenario(legacy).rules.parkCost, 2);
  assert.throws(() => validateScenario({ ...env, rules: { ...env.rules, parkCost: -1 } }), /parkCost/);
  assert.throws(() => validateScenario({ ...env, rules: { ...env.rules, constructionMode: 'magic' } }), /Construction mode/);
});
test('learned intersections require observed crossing arms rather than the center of a wide straight avenue', () => {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let y = 0; y < 16; y++) for (let x = 3; x <= 5; x++) env.layers.static[cell(x, y)] = 'road';
  const world = new GridWorld(env), memory = new SpatialMemory(16);
  const observe = () => memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 1);
  observe(); assert.equal([...memory.landmarks.values()].filter(place => place.kind === 'intersection').length, 0);
  for (let x = 0; x < 16; x++) env.layers.static[cell(x, 8)] = 'road'; world.sync(env); observe();
  assert.ok([...memory.landmarks.values()].some(place => place.kind === 'intersection' && place.position.y === 8));
});

test('live rule edits preserve agents, memory and paths until affected conditions are observed', () => {
  const env = generateAbstractManhattan({ width: 32, height: 32 });
  const sim = new AgentSimulation(env); for (let n = 0; n < 10; n++) sim.step();
  const agents = [...sim.agents], memories = agents.map(agent => agent.memory), snapshots = memories.map(memory => structuredClone(memory.cells)), paths = agents.map(agent => [...agent.path]);
  env.rules.parkCost = 5; sim.syncEnvironment(env);
  agents.forEach((agent, n) => { assert.equal(sim.agents[n], agent); assert.equal(agent.memory, memories[n]); assert.deepEqual(agent.memory.cells, snapshots[n]); assert.deepEqual(agent.path, paths[n]); });
});
test('obstacle encounters are recorded only after a changed route cell is observed', () => {
  const env = createEnvironment(16); env.layers.dynamic[cell(2, 6)] = 'robot'; env.layers.dynamic[cell(2, 7)] = 'robot';
  const sim = new AgentSimulation(env); sim.step();
  const agent = sim.agents[0]; agent.path = [cell(3, 6), cell(4, 6)];
  assert.ok(agent.memory.cells[cell(3, 6)]);
  env.layers.static[cell(3, 6)] = 'construction'; sim.syncEnvironment(env);
  assert.equal(agent.obstacleEncounters, 0); sim.step();
  assert.equal(agent.obstacleEncounters, 1); assert.equal(agent.memory.cells[cell(3, 6)].terrain, 'construction');
});
test('the abstract city supports repeated tasks and moving occupants without rewriting terrain', () => {
  const env = generateAbstractManhattan({ width: 32, height: 32 }), before = structuredClone(env);
  const sim = new AgentSimulation(env, { count: 4 });
  for (let tick = 0; tick < 3000; tick++) {
    sim.step(); const cells = sim.occupants().map(item => sim.world.index(item.position));
    assert.equal(new Set(cells).size, cells.length); assert.ok(cells.every(index => sim.world.canStand(index)));
  }
  assert.ok(sim.summary().deliveries > 1); assert.ok(sim.summary().tours > 0); assert.ok(sim.summary().reuse > 0);
  assert.equal(sim.visits.reduce((sum, value) => sum + value, 0), sim.summary().distance);
  assert.deepEqual(env, before);
});

test('full viewport fits wide grids on desktop and mobile without stretching square cells', () => {
  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [390, 844], [844, 390]]) {
    const camera = fitCamera(width, height, 128, 72);
    assert.ok(camera.x >= 0 && camera.y >= 0); assert.ok(camera.x + camera.cell * 128 <= width);
    assert.ok(camera.y + camera.cell * 72 <= height);
    if (width >= 1280) assert.ok(camera.cell * 128 >= width * .75);
  }
});

test('renderer refits an initially fitted grid on resize and preserves a freely panned camera', () => {
  const originals = new Map(['window', 'ResizeObserver', 'requestAnimationFrame'].map(key => [key, globalThis[key]]));
  try {
    globalThis.window = { devicePixelRatio: 2 }; globalThis.ResizeObserver = class { observe() {} }; globalThis.requestAnimationFrame = () => 1;
    let bounds = { width: 1280, height: 800 };
    const context = new Proxy({}, { get: () => () => {} });
    const canvas = { getContext: () => context, getBoundingClientRect: () => bounds };
    const renderer = new MapRenderer(canvas, () => createEnvironment(128, 72)); renderer.resize();
    bounds = { width: 390, height: 844 }; renderer.resize();
    assert.deepEqual(renderer.camera, fitCamera(390, 844, 128, 72)); assert.equal(canvas.width, 780);
    renderer.zoomBy(2); renderer.pan(50, -20);
    const cellSize = renderer.camera.cell, oldCenter = renderer.cellAt(195, 422);
    bounds = { width: 844, height: 390 }; renderer.resize();
    assert.equal(renderer.camera.cell, cellSize); assert.deepEqual(renderer.cellAt(422, 195), oldCenter);
  } finally { for (const [key, value] of originals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});


test('restored default reuses the original map with Explorer/Courier memory, navigation and fixed-cohort comparisons', async () => {
  const env = createAbstractEnvironment(), original = generateAbstractManhattan();
  assert.deepEqual(env.layers, original.layers, 'original abstract map generation is unchanged');
  assert.deepEqual(env.source, original.source); assert.deepEqual([env.grid.width, env.grid.height], [128, 72]);
  assert.equal(env.layers.static.includes('water'), false);
  // Traverse static imports just as a browser does: no geographic asset is required.
  const visited = new Set(), pending = [new URL('../src/main.js', import.meta.url)];
  while (pending.length) {
    const url = pending.pop(); if (visited.has(url.href)) continue; visited.add(url.href);
    assert.ok(!url.pathname.endsWith('/manhattan.js') && !url.pathname.includes('/data/geography/') && !url.pathname.endsWith('/manhattan-base.js'));
    const source = readFileSync(url, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) pending.push(new URL(specifier, url));
  }
  const sim = new AgentSimulation(env, { count: 4, seed: 1 }), before = structuredClone(env.layers);
  assert.deepEqual(sim.agents.map(agent => agent.type), ['explorer', 'courier', 'explorer', 'courier']);
  for (let tick = 0; tick < 2400; tick++) {
    sim.step(); const cells = sim.occupants().map(item => sim.world.index(item.position));
    assert.equal(new Set(cells).size, cells.length); assert.ok(cells.every(index => sim.world.canStand(index)));
  }
  assert.ok(sim.summary().deliveries > 0); assert.ok(sim.summary().reuse > 0);
  assert.ok(sim.agents.every(agent => agent.memory.known > 0));
  assert.ok(sim.agents.every(agent => agent.path.every(index => agent.memory.cells[index])));
  assert.ok(sim.sharedKnowledge().some(count => count > 0)); assert.ok(sim.landmarkHeat().length > 0);
  assert.equal(sim.visits.reduce((sum, value) => sum + value, 0), sim.summary().distance);
  assert.deepEqual(env.layers, before);
  const { EnvironmentComparison } = await import('../src/ab-comparison.js');
  const study = new EnvironmentComparison(createAbstractEnvironment({ width: 32, height: 32 }), { count: 4, seed: 1, seconds: 240 });
  const a = study.runA(), b = study.runB(study.duplicateB());
  while (!a.advance(100)); while (!b.advance(100));
  assert.deepEqual(a.result(), b.result()); assert.ok(a.result().deliveries > 0);
});
