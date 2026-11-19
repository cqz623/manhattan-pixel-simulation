import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEnvironment } from '../src/environment.js';
import { GridWorld } from '../src/agents/world.js';
import { perceive } from '../src/agents/perception.js';
import { SpatialMemory } from '../src/agents/memory.js';
import { findPath, findFrontier } from '../src/agents/pathfinding.js';
import { AgentSimulation, STEP } from '../src/agents/simulation.js';
import { ComparisonExperiment } from '../src/comparison.js';
import { generateSchematic } from '../src/schematic.js';

const at = (x, y, heading = 0) => ({ id: 'test', position: { x, y }, heading });
const index = (x, y) => y * 16 + x;
const run = (simulation, seconds) => { for (let tick = 0; tick < Math.round(seconds / STEP); tick++) simulation.step(); return simulation; };
function corridor() {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let y = 5; y <= 7; y++) for (let x = 1; x <= 14; x++) env.layers.static[index(x, y)] = 'road';
  env.layers.dynamic[index(2, 6)] = 'robot'; env.layers.dynamic[index(2, 7)] = 'robot';
  env.layers.semantic[index(2, 6)] = 'depot'; env.layers.semantic[index(13, 6)] = 'destination'; env.layers.semantic[index(8, 7)] = 'charger';
  return env;
}
function fullMemory(env) {
  const memory = new SpatialMemory(env.grid.width, env.grid.height), world = new GridWorld(env);
  memory.observe({ cells: env.layers.static.map((_, index) => ({ index, ...world.cell(index) })) }, 0);
  return memory;
}
test('six-cell forward vision, immediate awareness, wall occlusion, and occupant detection', () => {
  const env = createEnvironment(16), world = new GridWorld(env);
  const first = perceive(world, at(3, 7), [{ ...at(5, 7), id: 'ahead', type: 'pedestrian' }, { ...at(1, 7), id: 'behind' }]);
  assert.ok(first.visible.has(index(9, 7))); assert.ok(!first.visible.has(index(10, 7)));
  assert.ok(first.visible.has(index(2, 7))); assert.ok(!first.visible.has(index(1, 7)));
  assert.ok(!first.visible.has(index(4, 3))); assert.ok(first.visible.has(index(7, 5)));
  assert.equal(first.occupants.length, 1); assert.equal(first.occupants[0].id, 'ahead');
  env.layers.static[index(5, 7)] = 'building';
  env.layers.semantic[index(7, 7)] = 'destination'; world.sync(env);
  const hidden = perceive(world, at(3, 7), [{ ...at(7, 7), id: 'other', type: 'courier' }]);
  assert.ok(hidden.visible.has(index(5, 7))); assert.ok(!hidden.visible.has(index(6, 7)));
  assert.ok(!hidden.cells.some(cell => cell.semantic === 'destination')); assert.equal(hidden.occupants.length, 0);
  env.layers.static[index(4, 7)] = 'building';
  assert.ok(!perceive(world, at(3, 7)).visible.has(index(4, 8)), 'no corner peeking');
});
test('memory accumulates only observations and conditions remain stale until seen again', () => {
  const env = corridor(), world = new GridWorld(env), memory = new SpatialMemory(16);
  const first = perceive(world, at(2, 6)); memory.observe(first, 1);
  assert.equal(memory.known, first.visible.size);
  assert.equal(memory.cells[index(13, 6)], null);
  const before = memory.cells[index(4, 6)].closure;
  env.layers.overlays[index(4, 6)] = 'closure'; world.sync(env);
  assert.equal(memory.cells[index(4, 6)].closure, before);
  memory.observe(perceive(world, at(2, 6)), 2);
  assert.equal(memory.cells[index(4, 6)].closure, true);
  assert.ok([...memory.landmarks.values()].some(place => place.kind === 'blocked'));
});
test('known-map planning cannot cross unknown ground and finds reachable frontiers', () => {
  const env = corridor(), world = new GridWorld(env), memory = new SpatialMemory(16);
  memory.observe(perceive(world, at(2, 6)), 0);
  assert.equal(findPath(memory, index(2, 6), index(13, 6)), null);
  const frontier = findFrontier(memory, index(2, 6));
  assert.ok(frontier && frontier.route.length > 1);
  assert.ok(frontier.route.every(cell => memory.cells[cell]));
  memory.observe(perceive(world, at(9, 6)), 1);
  assert.ok(findPath(memory, index(2, 6), index(13, 6)));
});
test('weighted planning prefers a park shortcut for visitors and a road detour for couriers', () => {
  const env = createEnvironment(16); env.layers.static.fill('building');
  for (let x = 1; x <= 7; x++) { env.layers.static[index(x, 4)] = 'road'; env.layers.static[index(x, 1)] = 'road'; }
  for (let y = 1; y <= 4; y++) { env.layers.static[index(1, y)] = 'road'; env.layers.static[index(7, y)] = 'road'; }
  for (let x = 2; x <= 6; x++) env.layers.static[index(x, 4)] = 'park';
  const memory = fullMemory(env);
  assert.ok(findPath(memory, index(1, 4), index(7, 4), { type: 'visitor' }).route.some(cell => memory.cells[cell].terrain === 'park'));
  assert.ok(findPath(memory, index(1, 4), index(7, 4), { type: 'courier' }).route.every(cell => memory.cells[cell].terrain !== 'park'));
  env.layers.static[index(2, 1)] = 'building'; env.layers.static[index(1, 2)] = 'building';
  assert.equal(findPath(fullMemory(env), index(1, 1), index(2, 2), { diagonal: true }), null);
});
test('landmark retention toggle keeps terrain and clears place associations only at trip boundaries', () => {
  const memory = fullMemory(corridor()), known = memory.known, count = memory.landmarks.size;
  memory.startTrip(true); assert.equal(memory.landmarks.size, count);
  memory.startTrip(false); assert.equal(memory.landmarks.size, 0); assert.equal(memory.known, known);
  assert.ok(memory.cells.filter(Boolean).every(cell => cell.semantic === null)); assert.ok(memory.swept.every(value => value === 0));
});
test('autonomous visitors and couriers finish repeated tasks, retain memory, and actually reuse landmarks', () => {
  const sim = run(new AgentSimulation(corridor(), { seed: 3 }), 160);
  const visitor = sim.agents.find(agent => agent.type === 'visitor'), courier = sim.agents.find(agent => agent.type === 'courier');
  assert.ok(visitor.trips.length >= 2, visitor.status); assert.ok(courier.deliveries >= 2, courier.status);
  assert.ok(courier.landmarkReuse > 0); assert.equal(courier.memory.deliveries.length, courier.deliveries);
  assert.ok(courier.memory.connections.size > 0);
  assert.ok(sim.summary().firstDelivery > 0 && sim.summary().laterDelivery > 0);
});
test('actual cell arrivals exactly equal visit counts and distance, with no initial-spawn counts', () => {
  const sim = run(new AgentSimulation(corridor(), { count: 6, seed: 3 }), 50);
  const visits = sim.visits.reduce((sum, count) => sum + count, 0);
  assert.equal(visits, sim.agents.reduce((sum, agent) => sum + agent.distance, 0));
  assert.equal(visits, sim.agents.reduce((sum, agent) => sum + agent.trail.length - 1, 0));
  for (let tick = 0; tick < 100; tick++) {
    sim.step(); const cells = sim.occupants().map(item => sim.world.index(item.position));
    assert.equal(new Set(cells).size, cells.length); assert.ok(cells.every(cell => sim.world.canStand(cell)));
  }
});
test('seeded runs, fixed-frame accumulation and multi-agent aggregation are reproducible', () => {
  const a = run(new AgentSimulation(corridor(), { seed: 19 }), 25), b = new AgentSimulation(corridor(), { seed: 19 });
  for (let n = 0; n < 100; n++) b.advance(250);
  assert.equal(a.time, b.time); assert.deepEqual(a.agents.map(agent => agent.trail), b.agents.map(agent => agent.trail));
  const shared = a.sharedKnowledge();
  shared.forEach((count, cell) => assert.equal(count, a.agents.filter(agent => agent.memory.cells[cell]?.terrain === a.world.cell(cell).terrain && agent.memory.cells[cell]?.closure === a.world.cell(cell).closure).length));
  for (const landmark of a.landmarkHeat()) assert.equal(landmark.count, a.agents.filter(agent => agent.memory.landmarks.has(landmark.id)).length);
});
test('geometry edits preserve routes and memory until observation', () => {
  const env = corridor(), sim = run(new AgentSimulation(env), 2);
  const hidden = index(14, 7), before = sim.agents.map(agent => structuredClone(agent.memory.cells[hidden])), paths = sim.agents.map(agent => [...agent.path]);
  env.layers.static[hidden] = 'obstacle'; sim.syncEnvironment(env);
  sim.agents.forEach((agent, n) => { assert.deepEqual(agent.path, paths[n]); assert.deepEqual(agent.memory.cells[hidden], before[n]); });
  const own = sim.world.index(sim.agents[0].position);
  env.layers.overlays[own] = 'closure'; sim.syncEnvironment(env); sim.step();
  assert.equal(sim.agents[0].memory.cells[own].closure, true);
  assert.equal(sim.sharedKnowledge()[hidden], 0);
});
test('thinking modules have no imports or access to complete world state', () => {
  for (const file of ['agent.js', 'memory.js', 'pathfinding.js', 'state.js']) {
    const source = readFileSync(new URL(`../src/agents/${file}`, import.meta.url), 'utf8');
    assert.ok(!/from ['"].*(world|perception|environment|schematic|simulation)\.js/.test(source), file);
    assert.ok(!/\.layers\.(static|overlays|semantic)/.test(source), file);
  }
});
test('paired comparison records actual samples without asserting that landmarks must improve them', () => {
  const experiment = new ComparisonExperiment(corridor(), { seed: 7, seconds: 80 });
  while (!experiment.done) experiment.advance(50);
  const results = experiment.results();
  assert.equal(results.length, 2); assert.ok(results.every(result => result.deliveries > 0));
  assert.ok(results[0].deliverySamples.every(trip => trip.useLandmarks));
  assert.ok(results[1].deliverySamples.every(trip => !trip.useLandmarks));
  assert.ok(results[0].reuse > 0); assert.equal(results[1].reuse, 0);
});

test('hidden terrain changes cannot influence decisions before observation', () => {
  const a = corridor(), b = structuredClone(a);
  b.layers.static[index(14, 7)] = 'obstacle';
  const first = run(new AgentSimulation(a, { seed: 11 }), 2), second = run(new AgentSimulation(b, { seed: 11 }), 2);
  assert.deepEqual(first.agents.map(agent => agent.trail), second.agents.map(agent => agent.trail));
  for (let n = 0; n < first.agents.length; n++) {
    assert.equal(first.agents[n].memory.cells[index(14, 7)], null);
    assert.deepEqual(first.agents[n].memory.cells, second.agents[n].memory.cells);
  }
});
test('charging increases battery only at a remembered charger and supports repeated deliveries', () => {
  const sim = new AgentSimulation(corridor(), { seed: 3 }), courier = sim.agents.find(agent => agent.type === 'courier');
  let charges = 0;
  for (let tick = 0; tick < 1500; tick++) {
    const before = courier.battery; sim.step();
    if (courier.battery > before) {
      charges++;
      const cell = courier.memory.cells[sim.world.index(courier.position)]; assert.equal(cell.semantic, 'charger');
    }
    assert.ok(courier.battery >= 0 && courier.battery <= courier.capacity);
  }
  assert.ok(charges > 0); assert.ok(courier.energy > courier.capacity); assert.ok(courier.deliveries >= 3);
});
test('closing and reopening an edited corridor changes actual delivery behavior without resets', () => {
  const open = corridor(), edited = structuredClone(open);
  const control = new AgentSimulation(open, { seed: 3 }), sim = new AgentSimulation(edited, { seed: 3 });
  run(control, 1); run(sim, 1);
  for (let y = 5; y <= 7; y++) edited.layers.overlays[index(7, y)] = 'closure';
  sim.syncEnvironment(edited); run(control, 60); run(sim, 60);
  assert.ok(control.summary().deliveries > 0); assert.equal(sim.summary().deliveries, 0);
  assert.ok(sim.agents.every(agent => agent.trail.every(sample => sample.index % 16 < 7)));
  const memory = sim.agents[0].memory;
  for (let y = 5; y <= 7; y++) edited.layers.overlays[index(7, y)] = null;
  sim.syncEnvironment(edited); run(sim, 100);
  assert.equal(sim.agents[0].memory, memory, 'live edits retain the memory object');
  assert.ok(sim.summary().deliveries > 0);
});
test('ten agents and moving pedestrians share the Manhattan raster without collisions or terrain mutation', () => {
  const env = generateSchematic(), before = structuredClone(env);
  const sim = new AgentSimulation(env, { count: 10, seed: 3 });
  const startingPedestrians = sim.pedestrians.map(item => ({ ...item.position }));
  for (let tick = 0; tick < 1500; tick++) {
    sim.step(); const cells = sim.occupants().map(item => sim.world.index(item.position));
    assert.equal(new Set(cells).size, cells.length); assert.ok(cells.every(cell => sim.world.canStand(cell)));
  }
  assert.notDeepEqual(sim.pedestrians.map(item => item.position), startingPedestrians);
  assert.ok(sim.agents.some(agent => agent.recoveries > 0));
  assert.deepEqual(env, before);
  assert.ok(sim.summary().deliveries > 0);
});
test('shared coverage excludes stale observations after closures change', () => {
  const env = corridor(), sim = run(new AgentSimulation(env), 1), here = sim.world.index(sim.agents[0].position);
  assert.ok(sim.sharedKnowledge()[here] > 0);
  env.layers.overlays[here] = 'closure'; sim.syncEnvironment(env);
  assert.equal(sim.sharedKnowledge()[here], 0, 'no agent has observed the new condition yet');
  sim.step(); assert.ok(sim.sharedKnowledge()[here] >= 1);
});
test('removing agents preserves historical run metrics while collective knowledge uses active agents', () => {
  const sim = run(new AgentSimulation(corridor(), { count: 6, seed: 3 }), 60);
  const before = sim.summary(), survivors = sim.agents.slice(0, 2);
  sim.setCount(2);
  assert.deepEqual(sim.agents, survivors); assert.equal(sim.retiredAgents.length, 4);
  assert.equal(sim.summary().deliveries, before.deliveries); assert.equal(sim.summary().distance, before.distance);
  assert.ok(sim.sharedKnowledge().every(count => count <= 2));
  assert.ok(sim.landmarkHeat().every(entry => entry.total === 2));
  sim.setCount(10); assert.equal(sim.agents.length, 10); assert.equal(new Set(sim.agents.map(agent => agent.id)).size, 10);
  assert.ok(sim.agents.slice(2).every(agent => agent.memory.known === 0));
});
