import test from 'node:test';
import assert from 'node:assert/strict';
import { MapRenderer, KNOWLEDGE_MODES, UNKNOWN_COLOR } from '../src/visualization.js';
import { createEnvironment, OBJECTS } from '../src/environment.js';
import { AgentSimulation } from '../src/agents/simulation.js';
import { fitCamera } from '../src/camera.js';

test('renderer draws independently visible layers without modifying the scenario', () => {
  const savedGlobals = Object.fromEntries(['window', 'ResizeObserver', 'requestAnimationFrame'].map(key => [key, globalThis[key]]));
  try {
    globalThis.window = { devicePixelRatio: 2 };
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.requestAnimationFrame = () => 1;
    const draws = [];
    const ctx = new Proxy({ fillStyle: null, strokeStyle: null }, {
      get(target, property) {
        if (property in target) return target[property];
        return (...args) => draws.push({ method: property, args, fillStyle: target.fillStyle });
      },
    });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 700, height: 600 }) };
    const environment = createEnvironment(16);
    environment.layers.static[0] = 'road'; environment.layers.dynamic[0] = 'robot'; environment.layers.semantic[0] = 'depot'; environment.layers.overlays[0] = 'closure';
    const before = structuredClone(environment);
    const renderer = new MapRenderer(canvas, () => environment);
    renderer.resize(); renderer.draw();
    assert.equal(canvas.width, 1400); assert.equal(canvas.height, 1200);
    const baseIndex = draws.findIndex(draw => draw.method === 'fillRect' && draw.fillStyle === OBJECTS.road.color);
    const dynamicIndex = draws.findIndex(draw => draw.method === 'fill' && draw.fillStyle === OBJECTS.robot.color);
    assert.ok(baseIndex >= 0 && dynamicIndex > baseIndex);
    assert.ok(draws.some(draw => draw.method === 'fillRect' && draw.fillStyle === OBJECTS.depot.color));
    assert.ok(draws.some(draw => draw.method === 'fillRect' && draw.fillStyle === OBJECTS.closure.color));
    draws.length = 0;
    renderer.visibility.dynamic = false; renderer.visibility.semantic = false; renderer.visibility.overlays = false; renderer.draw();
    assert.ok(!draws.some(draw => draw.fillStyle === OBJECTS.robot.color));
    assert.ok(!draws.some(draw => draw.fillStyle === OBJECTS.depot.color));
    assert.deepEqual(environment, before);
  } finally {
    for (const [key, value] of Object.entries(savedGlobals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('all four implemented knowledge visualization modes are available', () => {
  assert.deepEqual(KNOWLEDGE_MODES.filter(mode => mode.available).map(mode => mode.id), ['none', 'paths', 'landmarks', 'shared']);
  assert.deepEqual(KNOWLEDGE_MODES.map(mode => mode.name), ['No Layer', 'All Paths', 'Landmark Heatmap', 'Shared Knowledge']);
});

test('historical grid fits square cells independently, keeps pan/zoom, and restores the live camera and selection', () => {
  const keys = ['window', 'ResizeObserver', 'requestAnimationFrame'], saved = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  try {
    globalThis.window = { devicePixelRatio: 1 }; globalThis.ResizeObserver = class { observe() {} }; globalThis.requestAnimationFrame = () => 1;
    const ctx = new Proxy({}, { get: (target, key) => target[key] || (() => {}) });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1440, height: 900 }) };
    const live = createEnvironment(128, 72), old = createEnvironment(40, 28), renderer = new MapRenderer(canvas, () => live); renderer.resize();
    renderer.zoomBy(1.5); renderer.pan(35, -20); renderer.selected = [80, 40]; renderer.hover = [81, 40];
    const before = { camera: { ...renderer.camera }, selected: [...renderer.selected], hover: [...renderer.hover], fitCell: renderer.fitCell };
    const view = { history: true, mode: 'a', environment: old };
    renderer.setComparisonView(view);
    assert.deepEqual(renderer.camera, fitCamera(1440, 900, 40, 28)); assert.equal(renderer.displayEnvironment(), old);
    renderer.zoomBy(1.2); renderer.pan(-10, 15); const inspectionCamera = { ...renderer.camera };
    renderer.setComparisonView({ ...view, showKnowledge: true }); assert.deepEqual(renderer.camera, inspectionCamera);
    renderer.fit(); assert.deepEqual(renderer.camera, fitCamera(1440, 900, 40, 28));
    renderer.setComparisonView(null);
    assert.deepEqual({ camera: renderer.camera, selected: renderer.selected, hover: renderer.hover, fitCell: renderer.fitCell }, before);
    assert.equal(renderer.displayEnvironment(), live); assert.equal(canvas.width, 1440); assert.equal(canvas.height, 900);
  } finally { for (const key of keys) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } }
});

test('collective overlays draw actual cell data on the existing camera and individual views hide truth', () => {
  const savedGlobals = Object.fromEntries(['window', 'ResizeObserver', 'requestAnimationFrame'].map(key => [key, globalThis[key]]));
  try {
    globalThis.window = { devicePixelRatio: 2 };
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.requestAnimationFrame = () => 1;
    const draws = [], context = new Proxy({}, { get(target, property) { return property in target ? target[property] : (...args) => draws.push({ method: property, args, color: target.fillStyle }); } });
    const canvas = { getContext: () => context, getBoundingClientRect: () => ({ width: 700, height: 600 }) };
    const environment = createEnvironment(16);
    environment.layers.dynamic[34] = 'robot'; environment.layers.dynamic[50] = 'robot';
    environment.layers.semantic[34] = 'depot'; environment.layers.semantic[36] = 'charger'; environment.layers.semantic[238] = 'destination';
    const simulation = new AgentSimulation(environment, { seed: 3 });
    for (let tick = 0; tick < 20; tick++) simulation.step();
    const renderer = new MapRenderer(canvas, () => environment); renderer.resize();
    renderer.zoomBy(1.2); renderer.pan(17, -9);
    const camera = { ...renderer.camera }, size = [canvas.width, canvas.height];
    const drawnIndex = draw => {
      const [px, py, w, h] = draw.args;
      const [x, y] = renderer.cellAt(px + w / 2, py + h / 2);
      return y * 16 + x;
    };
    const overlays = prefix => draws.filter(draw => draw.method === 'fillRect' && typeof draw.color === 'string' && draw.color.startsWith(prefix));
    for (const mode of ['none', 'paths', 'landmarks', 'shared']) {
      draws.length = 0; renderer.simulationView = { simulation, mode, selectedId: '', knowledgeView: false }; renderer.draw();
      assert.deepEqual(renderer.camera, camera); assert.deepEqual([canvas.width, canvas.height], size);
      if (mode === 'paths') {
        assert.ok(overlays('rgba(61,99,210,').length);
        for (const draw of overlays('rgba(61,99,210,')) assert.ok(simulation.visits[drawnIndex(draw)] > 0);
      } else if (mode === 'shared') {
        const counts = simulation.sharedKnowledge(); assert.ok(overlays('rgba(34,137,145,').length);
        for (const draw of overlays('rgba(34,137,145,')) assert.ok(counts[drawnIndex(draw)] > 0);
      } else if (mode === 'landmarks') {
        const heat = new Set(simulation.landmarkHeat().map(item => item.index)); assert.ok(overlays('rgba(127,82,188,').length);
        for (const draw of overlays('rgba(127,82,188,')) assert.ok(heat.has(drawnIndex(draw)));
        const overlay = overlays('rgba(127,82,188,')[0], at = drawnIndex(overlay);
        const semanticFill = draws.findIndex(draw => draw.method === 'fillRect' && draw.color === OBJECTS[environment.layers.semantic[at]].color && drawnIndex(draw) === at);
        assert.ok(semanticFill >= 0 && draws.indexOf(overlay) > semanticFill, 'semantic markers must not cover their own knowledge heatmap');
      } else assert.equal(overlays('rgba(61,99,210,').length + overlays('rgba(34,137,145,').length + overlays('rgba(127,82,188,').length, 0);
    }
    const agent = simulation.agents[0];
    assert.equal(agent.memory.cells[238], null);
    const remembered = agent.memory.cells.findIndex(cell => cell?.terrain === 'open');
    environment.layers.static[remembered] = 'water'; // Hidden truth changes, without an observation.
    draws.length = 0; renderer.simulationView = { simulation, mode: 'shared', selectedId: agent.id, knowledgeView: true }; renderer.draw();
    assert.ok(draws.some(draw => draw.color === UNKNOWN_COLOR));
    assert.ok(!draws.some(draw => draw.method === 'fillRect' && draw.color === OBJECTS.destination.color));
    assert.ok(!draws.some(draw => draw.method === 'fillRect' && draw.color === OBJECTS.water.color));
    assert.deepEqual(renderer.camera, camera);
  } finally {
    for (const [key, value] of Object.entries(savedGlobals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
