import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironment, inspectCell, indexAt, census, LAYERS, OBJECTS, isTraversable } from '../src/environment.js';
import { generateSchematic } from '../src/schematic.js';
import { EnvironmentEditor, lineCells } from '../src/editor.js';
import { parseScenario, serializeScenario, validateScenario } from '../src/scenario.js';
import { getAgentPlacements } from '../src/agents/state.js';

test('every palette object edits only its declared layer', () => {
  for (const [object, definition] of Object.entries(OBJECTS)) {
    const editor = new EnvironmentEditor(createEnvironment());
    const before = structuredClone(editor.environment.layers);
    editor.paint(9, 12, object); editor.endStroke();
    assert.equal(inspectCell(editor.environment, 9, 12)[definition.layer], object);
    for (const layer of LAYERS.filter(key => key !== definition.layer)) assert.deepEqual(editor.environment.layers[layer], before[layer]);
  }
});

test('entities, semantic symbols, and closures coexist without destroying a static cell', () => {
  const editor = new EnvironmentEditor(createEnvironment());
  for (const object of ['road', 'robot', 'depot', 'closure']) { editor.paint(10, 10, object); editor.endStroke(); }
  assert.deepEqual(inspectCell(editor.environment, 10, 10), { static: 'road', dynamic: 'robot', semantic: 'depot', overlays: 'closure' });
  editor.paint(10, 10, null, 'dynamic', true); editor.endStroke();
  assert.deepEqual(inspectCell(editor.environment, 10, 10), { static: 'road', dynamic: null, semantic: 'depot', overlays: 'closure' });
  editor.undo(); assert.equal(inspectCell(editor.environment, 10, 10).dynamic, 'robot');
  editor.paint(10, 10, null, 'static', true); editor.endStroke();
  assert.deepEqual(inspectCell(editor.environment, 10, 10), { static: 'open', dynamic: 'robot', semantic: 'depot', overlays: 'closure' });
});

test('fast interpolated painting is a single undoable stroke, including repeated cells', () => {
  const editor = new EnvironmentEditor(createEnvironment());
  editor.beginStroke();
  for (const [x, y] of lineCells([1, 1], [30, 23])) editor.paint(x, y, 'pedestrian');
  editor.paint(1, 1, 'robot');
  editor.endStroke();
  const painted = structuredClone(editor.environment);
  assert.equal(editor.undoStack.length, 1);
  assert.equal(editor.undoStack[0].patches.length, 30);
  editor.undo(); assert.equal(editor.environment.layers.dynamic.filter(Boolean).length, 0);
  editor.redo(); assert.deepEqual(editor.environment, painted);
  editor.undo(); editor.paint(2, 2, 'park'); editor.endStroke();
  assert.equal(editor.redoStack.length, 0);
});

test('empty gestures create no history and bounds or layer mismatches cannot edit', () => {
  const editor = new EnvironmentEditor(createEnvironment());
  editor.beginStroke(); editor.endStroke(); assert.equal(editor.undoStack.length, 0);
  for (const point of [[-1, 0], [64, 0], [0, 64], [.5, 0]]) assert.equal(editor.paint(...point, 'building'), false);
  assert.equal(editor.paint(0, 0, 'robot', 'static'), false);
  assert.equal(indexAt(editor.environment, NaN, 1), -1);
  assert.equal(inspectCell(editor.environment, -1, 0), null);
});

test('scenario round trip preserves all layers, metadata, and rectangular import dimensions', () => {
  const env = createEnvironment(48, 32);
  env.name = 'GIS import seam';
  env.source = { kind: 'gis', description: 'Test raster only', crs: 'EPSG:2263', bounds: [1, 2, 3, 4] };
  env.grid.cellSizeMeters = 5;
  const editor = new EnvironmentEditor(env);
  for (const object of ['road', 'depot', 'robot', 'closure']) editor.paint(40, 20, object);
  editor.endStroke();
  const loaded = parseScenario(serializeScenario(editor.environment));
  assert.deepEqual(loaded, editor.environment);
  loaded.layers.static[0] = 'water'; assert.notEqual(loaded.layers.static[0], editor.environment.layers.static[0]);
});

test('invalid imports are rejected without changing the active environment', () => {
  const editor = new EnvironmentEditor(generateSchematic());
  const before = structuredClone(editor.environment);
  const cases = [
    env => { env.schemaVersion = 99; },
    env => { env.grid.width = 9999; },
    env => { delete env.grid.height; },
    env => { env.layers.dynamic[0] = 'building'; },
    env => { env.layers.static[0] = null; },
    env => { env.layers.semantic = []; },
    env => { env.layers.static[0] = '__proto__'; },
    env => { env.name = ''; },
    env => { env.grid.cellSizeMeters = -1; },
    env => { env.source.bounds = [4, 3, 2, 1]; },
  ];
  for (const mutate of cases) {
    const invalid = structuredClone(before); mutate(invalid);
    assert.throws(() => editor.replace(validateScenario(invalid)));
    assert.deepEqual(editor.environment, before);
  }
  assert.throws(() => parseScenario('{broken JSON'), /valid JSON/);
  assert.throws(() => parseScenario(' '.repeat(4_000_001)), /too large/);
});

test('reset, resolution change, and loading snapshots remain reversible across paint history', () => {
  const editor = new EnvironmentEditor(generateSchematic());
  editor.paint(0, 0, 'robot'); editor.endStroke();
  const edited = structuredClone(editor.environment);
  editor.replace(generateSchematic(32));
  editor.paint(0, 0, 'pedestrian'); editor.endStroke();
  editor.undo(); assert.equal(editor.environment.layers.dynamic[0], null);
  editor.undo(); assert.deepEqual(editor.environment, edited);
  editor.undo(); assert.equal(editor.environment.layers.dynamic[0], null);
  editor.redo(); editor.redo(); editor.redo();
  assert.equal(editor.environment.grid.width, 32);
  assert.equal(editor.environment.layers.dynamic[0], 'pedestrian');
});

test('schematic generation is deterministic, valid at supported resolutions, and honest about its source', () => {
  for (const size of [32, 64, 96]) {
    const env = generateSchematic(size);
    assert.deepEqual(env, generateSchematic(size));
    assert.deepEqual(validateScenario(env), env);
    assert.equal(env.source.kind, 'schematic'); assert.equal(env.source.crs, null);
    assert.match(env.source.description, /Not actual GIS/);
    const building = env.layers.static.indexOf('building');
    assert.ok([building + 1, building + size].some(index => env.layers.static[index] === 'building'));
    assert.equal(census(env).robot, 2); assert.equal(census(env).pedestrian, 3);
  }
});

test('the initial street network is connected and sidewalks join pedestrian open space', () => {
  const env = generateSchematic();
  const terrain = env.layers.static, width = env.grid.width;
  const roadIndices = terrain.flatMap((value, index) => value === 'road' ? [index] : []);
  const seen = new Set([roadIndices[0]]), queue = [roadIndices[0]];
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % width, y = Math.floor(index / width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = indexAt(env, nx, ny);
      if (next >= 0 && !seen.has(next) && isTraversable(env, next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.ok(roadIndices.every(index => seen.has(index)), 'Every road cell is reachable through the traversable network');
  assert.ok(terrain.flatMap((value, index) => value === 'sidewalk' ? [index] : []).every(index => seen.has(index)));
});

test('closure census and agent placements read from their respective layers', () => {
  const env = createEnvironment(); env.layers.static[65] = 'road'; env.layers.overlays[65] = 'closure'; env.layers.dynamic[65] = 'robot';
  assert.equal(census(env).traversable, 4095);
  assert.equal(isTraversable(env, 65), false);
  assert.deepEqual(getAgentPlacements(env), [{ id: 'robot-65', type: 'robot', position: { x: 1, y: 1 } }]);
});
