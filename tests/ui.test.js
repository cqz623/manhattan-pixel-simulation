import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { fitCamera } from '../src/camera.js';
import { parseScenario } from '../src/scenario.js';
import { UNKNOWN_COLOR } from '../src/visualization.js';

// A DOM integration test, not a browser/layout emulator. Shims supply standard APIs
// absent from linkedom: select values, checkbox state, dialogs, canvas and animation.
test('application entry point wires editor, simulation controls, knowledge, and JSON together', async t => {
  const { window, document } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const originals = new Map();
  const expose = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement']) expose(key, key === 'window' ? window : key === 'document' ? document : window[key]);
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { const option = this.querySelector('option[selected]') || this.querySelector('option'); return option?.hasAttribute('value') ? option.value : option?.textContent || ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', (option.hasAttribute('value') ? option.value : option.textContent) === String(value)); },
  });
  Object.defineProperty(window.HTMLInputElement.prototype, 'checked', { configurable: true, get() { return this.hasAttribute('checked'); }, set(value) { this.toggleAttribute('checked', value); } });
  const frames = new Map(); let serial = 1;
  expose('requestAnimationFrame', callback => { const id = serial++; frames.set(id, callback); return id; });
  expose('cancelAnimationFrame', id => frames.delete(id));
  const observers = [];
  expose('ResizeObserver', class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} });
  const calls = [];
  const ctx = new Proxy({}, { get(target, key) { if (key in target) return target[key]; if (key === 'createImageData') return (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }); return (...args) => calls.push({ key, args, color: target.fillStyle }); } });
  const $ = selector => document.querySelector(selector), canvas = $('#map'), captured = new Set();
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 600 });
  canvas.setPointerCapture = id => captured.add(id); canvas.hasPointerCapture = id => captured.has(id); canvas.releasePointerCapture = id => captured.delete(id);
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = value => { dialog.returnValue = value; dialog.removeAttribute('open'); dialog.dispatchEvent(new window.Event('close')); };
  }
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let exported;
  URL.createObjectURL = blob => { exported = blob; return 'blob:test'; }; URL.revokeObjectURL = () => {};
  const emit = (element, type, properties = {}) => { const event = new window.Event(type, { bubbles: true, cancelable: true }); Object.assign(event, properties); element.dispatchEvent(event); };
  let time = 0;
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); time += 16; for (const callback of callbacks) callback(time); };
  const camera = fitCamera(700, 600, 128, 72);
  const paint = (x, y) => {
    $('#fit').click();
    const properties = { button: 0, pointerId: 1, clientX: camera.x + (x + .5) * camera.cell, clientY: camera.y + (y + .5) * camera.cell };
    emit(canvas, 'pointerdown', properties); emit(canvas, 'pointerup', properties);
  };
  const change = (selector, value) => { const element = $(selector); element.value = value; emit(element, 'change'); };
  const exportScenario = async () => { $('#save').click(); return parseScenario(await exported.text()); };
  try {
    await import('../src/main.js');
    observers.forEach(observer => observer.callback()); frame();
    await t.test('boots full-screen controls and 15 palette objects', () => {
      assert.equal(document.querySelectorAll('#palette button').length, 15);
      assert.equal($('#sim-play').disabled, false); assert.equal($('#sim-pause').disabled, true);
      assert.equal($('#knowledge-mode').options.length, 4);
      assert.ok([...$('#knowledge-mode').options].every(option => !option.disabled));
    });
    await t.test('compact abstract city, current agent roles, and read-only distances are wired', async () => {
      const env = await exportScenario();
      assert.deepEqual([env.grid.width, env.grid.height], [128, 72]);
      assert.equal(env.source.kind, 'schematic'); assert.equal(env.source.generator, 'abstract-manhattan');
      assert.equal(env.simulation.agentMode, 'explorer-courier'); assert.equal(env.simulation.activeArea.id, 'city');
      assert.match($('#active-area-info').textContent, /Entire abstract grid/);
      assert.match($('#agent-selection').textContent, /Explorer/); assert.match($('#agent-selection').textContent, /Courier/);
      assert.equal($('#fit').textContent.trim(), '⛶ Fit Grid'); assert.equal($('#restore-geography'), null);
      assert.deepEqual([...$('#active-area').options].map(option => option.value), ['city', 'custom']);
      assert.ok($('#distance-target').disabled);
    });
    await t.test('drawing a custom active region finishes one gesture, resets memory, and is undoable', async () => {
      $('#fit').click(); $('[data-tool="area"]').click();
      const point = (x, y) => ({ button: 0, pointerId: 3, clientX: camera.x + (x + .5) * camera.cell, clientY: camera.y + (y + .5) * camera.cell });
      emit(canvas, 'pointerdown', point(60, 20)); emit(canvas, 'pointermove', point(79, 39)); emit(canvas, 'pointerup', point(79, 39));
      const area = (await exportScenario()).simulation.activeArea;
      assert.deepEqual([area.x, area.y, area.width, area.height], [60, 20, 20, 20]);
      assert.equal($('#sim-clock').textContent, '0 s'); assert.equal($('#map-viewport').dataset.tool, 'inspect');
      $('#undo').click(); assert.equal((await exportScenario()).simulation.activeArea.id, 'city'); $('#fit').click();
    });
    await t.test('layer painting, undo/redo, and export run through real entry handlers', async () => {
      for (const object of ['road', 'robot', 'depot', 'closure']) { $(`[data-object="${object}"]`).click(); paint(10, 10); }
      const scenario = await exportScenario(), cell = 10 * 128 + 10;
      assert.equal(scenario.layers.static[cell], 'road'); assert.equal(scenario.layers.dynamic[cell], 'robot');
      assert.equal(scenario.layers.semantic[cell], 'depot'); assert.equal(scenario.layers.overlays[cell], 'closure');
      $('#undo').click(); assert.equal((await exportScenario()).layers.overlays[cell], null);
      $('#redo').click(); assert.equal((await exportScenario()).layers.overlays[cell], 'closure');
    });
    await t.test('step, play/pause, speed, individual selection, and veiled inspection', () => {
      $('#sim-step').click(); assert.equal($('#sim-clock').textContent, '0.2 s');
      change('#sim-speed', '16'); $('#sim-play').click(); for (let n = 0; n < 8; n++) frame(); $('#sim-pause').click();
      assert.ok(parseFloat($('#sim-clock').textContent) > .2);
      const clock = $('#sim-clock').textContent;
      change('#scenario-name', 'Renamed study'); $('[data-object="road"]').click(); paint(60, 60);
      assert.equal($('#sim-clock').textContent, clock, 'renaming then editing cells retains the live run');
      change('#agent-selection', $('#agent-selection').options[1].value);
      assert.equal($('#agent-knowledge').checked, true);
      $('[data-tool="inspect"]').click(); paint(60, 60);
      assert.match($('#cell-details').textContent, /Unknown/);
      frame(); assert.ok(calls.some(call => (call.key === 'fillRect' && call.color === UNKNOWN_COLOR) || (call.key === 'putImageData' && call.args[0].data[0] === 23 && call.args[0].data[1] === 24)));
      assert.match($('#knowledge-legend').textContent, /Individual view/);
      $('#show-all-agents').click(); change('#knowledge-mode', 'paths'); assert.match($('#knowledge-legend').textContent, /Actual arrivals/);
      change('#knowledge-mode', 'shared'); assert.match($('#knowledge-legend').textContent, /not communication/);
      change('#knowledge-mode', 'landmarks'); assert.match($('#knowledge-legend').textContent, /distinct agents/);
    });
    await t.test('population changes preserve live agents, seed reset clears simulation, and comparisons are real', () => {
      change('#sim-count', '4'); assert.equal($('#agent-selection').options.length, 5);
      change('#sim-seed', '7'); assert.equal($('#sim-clock').textContent, '0 s');
      change('#compare-duration', '600'); $('#compare-run').click();
      for (let n = 0; n < 110 && $('#compare-run').disabled; n++) frame();
      assert.ok($('#comparison-results table'));
      assert.equal(document.querySelectorAll('#comparison-results tbody tr').length, 2);
      assert.match($('#comparison-results').textContent, /Retained/); assert.match($('#comparison-results').textContent, /Forgotten/);
    });
    await t.test('resolution regeneration remains confirmed and undoable', async () => {
      change('#resolution', '32'); assert.ok($('#confirm-dialog').hasAttribute('open'));
      $('#confirm-dialog').close('confirm'); await new Promise(setImmediate);
      assert.match($('#map-dimensions').textContent, /32 × 32/);
      $('#undo').click(); assert.match($('#map-dimensions').textContent, /128 × 72/);
      assert.equal($('#sim-clock').textContent, '0 s');
    });
    await t.test('JSON file loading restores saved layers and invalid files preserve the workspace', async () => {
      const saved = await exportScenario(), input = $('#load-file');
      input.files = [{ size: 10, text: async () => '{broken' }]; emit(input, 'change'); await new Promise(setImmediate);
      assert.match($('#status').textContent, /Could not load/); assert.deepEqual(await exportScenario(), saved);
      change('#scenario-name', 'Temporary name');
      const text = JSON.stringify(saved); input.files = [{ size: text.length, text: async () => text }]; emit(input, 'change'); await new Promise(setImmediate);
      assert.ok($('#confirm-dialog').hasAttribute('open')); $('#confirm-dialog').close('confirm'); await new Promise(setImmediate);
      assert.deepEqual(await exportScenario(), saved);
    });
    await t.test('floating panels and bottom visualization buttons preserve the canvas size', () => {
      const size = [canvas.width, canvas.height];
      if (!$('#inspector-panel').hidden) $('[data-close-panel="inspector"]').click();
      $('#toggle-editor').click(); assert.equal($('#editor-panel').hidden, false); assert.equal($('#toggle-editor').getAttribute('aria-expanded'), 'true');
      $('#toggle-editor').click(); assert.equal($('#editor-panel').hidden, true);
      $('#toggle-inspector').click(); assert.equal($('#inspector-panel').hidden, false);
      $('[data-close-panel="inspector"]').click(); assert.equal($('#inspector-panel').hidden, true);
      $('[data-view-mode="paths"]').click(); assert.equal($('#knowledge-mode').value, 'paths'); assert.match($('#knowledge-legend').textContent, /Actual arrivals/);
      $('[data-view-mode="shared"]').click(); assert.equal($('[data-view-mode="shared"]').getAttribute('aria-pressed'), 'true');
      $('[data-view-mode="none"]').click(); assert.deepEqual([canvas.width, canvas.height], size);
    });
    await t.test('rectangle drag, flood fill, brush size and undo reach shared environment state', async () => {
      $('#toggle-editor').click();
      const point = (x, y) => ({ button: 0, pointerId: 2, clientX: camera.x + (x + .5) * camera.cell, clientY: camera.y + (y + .5) * camera.cell });
      const rectangle = (object, from, to) => {
        $('#fit').click();
        $(`[data-object="${object}"]`).click(); $('[data-tool="rectangle"]').click();
        emit(canvas, 'pointerdown', point(...from)); emit(canvas, 'pointermove', point(...to)); emit(canvas, 'pointerup', point(...to));
      };
      const before = await exportScenario(); rectangle('park', [15, 15], [19, 17]);
      const after = await exportScenario();
      for (let y = 15; y <= 17; y++) for (let x = 15; x <= 19; x++) assert.equal(after.layers.static[y * 128 + x], 'park');
      assert.deepEqual(after.layers.dynamic, before.layers.dynamic); $('#undo').click(); assert.deepEqual((await exportScenario()).layers.static, before.layers.static);
      rectangle('building', [20, 20], [24, 24]); rectangle('park', [21, 21], [23, 23]);
      $('[data-object="construction"]').click(); $('[data-tool="fill"]').click(); paint(22, 22);
      const filled = await exportScenario();
      for (let y = 21; y <= 23; y++) for (let x = 21; x <= 23; x++) assert.equal(filled.layers.static[y * 128 + x], 'construction');
      assert.equal(filled.layers.static[20 * 128 + 20], 'building');
      $('[data-object="crowd"]').click(); $('[data-tool="paint"]').click(); change('#brush-size', '3'); paint(5, 5);
      const brushed = await exportScenario();
      for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) assert.equal(brushed.layers.static[y * 128 + x], 'crowd');
      change('#brush-size', '1');
    });
    await t.test('seeded generation is confirmed, recorded in JSON, and undoable', async () => {
      const before = await exportScenario(); change('#generation-seed', '42'); $('#generate-abstract').click();
      assert.ok($('#confirm-dialog').hasAttribute('open')); assert.deepEqual((await exportScenario()).layers.static, before.layers.static);
      $('#confirm-dialog').close('confirm'); await new Promise(setImmediate);
      const generated = await exportScenario(); assert.equal(generated.source.seed, 42); assert.equal(generated.source.generator, 'abstract-manhattan');
      assert.notDeepEqual(generated.layers.static, before.layers.static);
      $('#undo').click(); assert.deepEqual(await exportScenario(), before);
    });
    await t.test('terrain cost controls stay undoable and preserve the simulation clock', async () => {
      $('#sim-step').click(); const clock = $('#sim-clock').textContent;
      change('#park-cost', '4'); assert.equal($('#sim-clock').textContent, clock); assert.equal((await exportScenario()).rules.parkCost, 4);
      $('#undo').click(); assert.equal((await exportScenario()).rules.parkCost, 2);
      change('#construction-mode', 'costly'); change('#construction-cost', '8'); change('#crowd-weight', '3');
      const saved = await exportScenario(); assert.equal(saved.rules.constructionMode, 'costly'); assert.equal(saved.rules.constructionCost, 8); assert.equal(saved.rules.crowdWeight, 3);
    });    await t.test('environment A/B controls lock cohorts, reproduce results, apply presets and choose', async () => {
      change('#ab-duration', '240'); $('#ab-fast').checked = true;
      $('#ab-run-a').click(); assert.equal($('#sim-count').disabled, true);
      for (let n = 0; n < 100 && $('#ab-run-a').disabled; n++) frame();
      assert.equal($('#sim-count').disabled, false); assert.match($('#ab-progress').textContent, /A complete/);
      $('#ab-copy-b').click(); $('#ab-run-b').click();
      for (let n = 0; n < 100 && $('#ab-run-a').disabled; n++) frame();
      assert.match($('#ab-progress').textContent, /B complete/);
      const rows = [...document.querySelectorAll('#ab-results tr')].slice(1);
      for (const row of rows) { const cells = row.querySelectorAll('td'); assert.equal(cells[1].textContent, cells[2].textContent); }
      const before = await exportScenario(); $('[data-preset="crowd"]').click();
      assert.notDeepEqual((await exportScenario()).layers.static, before.layers.static);
      $('#undo').click(); assert.deepEqual((await exportScenario()).layers.static, before.layers.static);
      $('#ab-run-b').click(); for (let n = 0; n < 100 && $('#ab-run-a').disabled; n++) frame();
      $('#ab-choose-a').click(); assert.match($('#ab-recommendation').textContent, /Selected environment A/);
      change('#agent-selection', $('#agent-selection').options[1].value);
      assert.match($('#agent-details').textContent, /Global location/);
      assert.match($('#distance-details').textContent, /Manhattan distance/);
      $('#ab-run-b').click(); $('[data-preset="crowd"]').click();
      assert.match($('#ab-progress').textContent, /cancelled/); assert.equal($('#sim-count').disabled, false);
    });
    await t.test('demonstration pairs, matched runs, independent results, lineage, alternatives and study export are wired', async () => {
      change('#ab-experiment', 'shortcut'); $('#ab-load-experiment').click();
      assert.match($('#map-dimensions').textContent, /40 × 28/);
      assert.equal((await exportScenario()).source.experiment, 'shortcut');
      $('#ab-fast').checked = true; $('#ab-run-pair').click();
      assert.equal($('#sim-count').disabled, true);
      for (let n = 0; n < 210 && $('#ab-run-pair').disabled; n++) frame();
      assert.match($('#ab-progress').textContent, /B complete/); assert.equal($('#sim-count').disabled, false);
      assert.match($('#ab-results').textContent, /Explorer coverage/); assert.match($('#ab-results').textContent, /Manhattan/);
      $('#ab-export-study').click(); const first = JSON.parse(await exported.text());
      const complete = first.scenarios.filter(record => record.result);
      const a = complete.at(-2), b = complete.at(-1);
      assert.deepEqual(a.conditions, b.conditions); assert.equal(a.result.deliveries, a.result.trips.length);
      assert.notDeepEqual(a.environment.layers.static, b.environment.layers.static);
      assert.ok(b.result.courierTreatmentVisits > 0); assert.ok(b.changes.details.length > 0);
      $('#ab-choose-b').click(); $('#ab-variation').click();
      assert.equal(document.querySelectorAll('#ab-candidates .candidate-row').length, 3);
      $('#ab-export-study').click(); const next = JSON.parse(await exported.text());
      const variants = next.scenarios.slice(-3);
      assert.ok(variants.every(record => record.iteration === 1 && record.result === null));
      assert.ok(variants.every(record => record.conditions.initialKnowledge === 'empty' && record.conditions.seconds === 480));
      assert.equal(new Set(variants.map(record => JSON.stringify(record.environment.layers))).size, 3);
      const newA = next.scenarios.at(-4); assert.equal(newA.parentId, b.id); assert.equal(newA.iteration, 1);
      const run = document.querySelectorAll('#ab-candidates .candidate-row')[1].querySelectorAll('button')[1]; run.click();
      for (let n = 0; n < 210 && $('#ab-run-pair').disabled; n++) frame();
      $('#ab-export-study').click(); const evaluated = JSON.parse(await exported.text());
      assert.ok(evaluated.scenarios.find(record => record.id === variants[1].id).result);
      assert.deepEqual(evaluated.scenarios.find(record => record.id === a.id).result, a.result, 'past results survive later iteration');
    });
    await t.test('optional real-data generation records provenance, stays abstract, and preserves undo', async () => {
      const before = await exportScenario(); $('#nyc-park-profile').checked = true; $('#generate-abstract').click();
      $('#confirm-dialog').close('confirm'); await new Promise(setImmediate);
      const grounded = await exportScenario(); assert.equal(grounded.source.kind, 'schematic');
      assert.match(grounded.source.dataId, /nyc-parks-types/); assert.equal(grounded.source.bounds, null);
      assert.equal($('#nyc-park-profile').checked, true); assert.match($('#ab-progress').textContent, /Save a new A/);
      $('#undo').click(); assert.deepEqual(await exportScenario(), before); assert.equal($('#nyc-park-profile').checked, false);
    });
    await t.test('road closure validation and recorded A/B overlays preserve editable maps, inspection and viewport', async () => {
      change('#ab-experiment', 'closure'); $('#ab-load-experiment').click(); $('#ab-fast').checked = true;
      $('#ab-run-pair').click(); for (let n = 0; n < 210 && $('#ab-run-pair').disabled; n++) frame();
      const before = await exportScenario(), size = [canvas.width, canvas.height];
      assert.equal(before.source.experiment, 'closure'); assert.match($('#ab-spatial-explanation').textContent, /blocked/);
      assert.match($('#ab-spatial-explanation').textContent, /Mean successful time/);
      const local = fitCamera(700, 600, 40, 28);
      const inspect = () => {
        const point = { button: 0, pointerId: 4, clientX: local.x + 18.5 * local.cell, clientY: local.y + 13.5 * local.cell };
        emit(canvas, 'pointerdown', point); emit(canvas, 'pointerup', point);
      };
      $('#ab-paths-a').click(); frame(); inspect();
      assert.match($('#ab-comparison-badge').textContent, /Recorded A paths/);
      assert.match($('#cell-details').textContent, /Road/); assert.match($('#cell-details').textContent, /Saved base cost/);
      $('#ab-paths-b').click(); frame(); inspect();
      assert.match($('#cell-details').textContent, /Construction/); assert.match($('#cell-details').textContent, /Blocked/);
      $('#ab-paths-overlay').click(); $('#ab-show-changes').checked = true; emit($('#ab-show-changes'), 'change');
      $('#ab-show-knowledge').checked = true; emit($('#ab-show-knowledge'), 'change'); frame();
      assert.match($('#ab-comparison-badge').textContent, /Recorded A\/B paths · B terrain/);
      assert.match($('#comparison-legend').textContent, /cyan solid/); assert.match($('#comparison-legend').textContent, /not communication/);
      assert.equal($('#knowledge-legend').hidden, true); assert.equal($('#map-viewport').dataset.tool, 'inspect');
      assert.deepEqual(await exportScenario(), before, 'recorded views never replace the editable scenario');
      assert.deepEqual([canvas.width, canvas.height], size);
      $('[data-tool="paint"]').click(); assert.equal($('#ab-comparison-badge').hidden, true); assert.equal($('#knowledge-legend').hidden, false);
      $('#ab-export-study').click(); const archive = JSON.parse(await exported.text());
      const records = archive.scenarios.filter(record => record.environment.source.experiment === 'closure' && record.result);
      assert.ok(records.every(record => record.result.spatial.agents.length === 4));
      assert.ok(records.every(record => record.result.replanMetricVersion === 2));
      assert.deepEqual(records.at(-1).conditions, records.at(-2).conditions);
    });

    await t.test('explicit next iteration retains selected evidence; history is read-only and restores the current study', async () => {
      $('#ab-paths-live').click(); $('#ab-choose-b').click();
      assert.equal($('#ab-next-iteration').disabled, false);
      $('#ab-export-study').click(); const selectedStudy = JSON.parse(await exported.text());
      const iteration = selectedStudy.iterations.at(-1), chosen = selectedStudy.scenarios.find(record => record.id === iteration.selectedId);
      $('#ab-preview-a').click(); // Next must use the selection, not the currently previewed map.
      $('#ab-next-iteration').click();
      assert.deepEqual(await exportScenario(), chosen.environment);
      $('#ab-export-study').click(); const next = JSON.parse(await exported.text()), baseline = next.scenarios.at(-1);
      assert.equal(baseline.parentId, chosen.id); assert.equal(baseline.measurementSourceId, chosen.id);
      assert.deepEqual(baseline.result.spatial, chosen.result.spatial);
      assert.deepEqual(baseline.conditions, chosen.conditions); assert.equal($('#ab-choose-a').disabled, true);
      assert.equal($('#ab-next-iteration').disabled, true);
      $('#ab-copy-b').click(); const working = await exportScenario();
      $('#zoom-in').click(); frame();
      const liveClock = $('#sim-clock').textContent, dimensions = [canvas.width, canvas.height];
      const firstIteration = document.querySelector('#ab-history .iteration-record');
      firstIteration.querySelectorAll('button')[2].click(); frame();
      assert.equal($('#ab-return-current').hidden, false); assert.equal($('#sim-clock').textContent, 'HISTORY');
      assert.equal($('#ab-run-pair').disabled, true); assert.equal($('#ab-choose-b').disabled, true); assert.equal($('#sim-step').disabled, true);
      assert.match($('#ab-history-status').textContent, /read-only/); assert.match($('#ab-results').textContent, /Travel|travel/);
      assert.deepEqual(await exportScenario(), working, 'historical views do not replace the editor map');
      $('#ab-show-knowledge').checked = true; emit($('#ab-show-knowledge'), 'change'); frame();
      assert.match($('#comparison-legend').textContent, /remembered places/);
      $('#ab-return-current').click(); frame();
      assert.equal($('#sim-clock').textContent, liveClock); assert.equal($('#sim-step').disabled, false);
      assert.deepEqual(await exportScenario(), working); assert.deepEqual([canvas.width, canvas.height], dimensions);
      $('#ab-export-study').click(); const after = JSON.parse(await exported.text());
      assert.deepEqual(after.iterations, next.iterations);
      for (const record of selectedStudy.scenarios) assert.deepEqual(after.scenarios.find(item => item.id === record.id), record);
      $('#ab-run-b').click(); for (let n = 0; n < 210 && $('#ab-run-pair').disabled; n++) frame();
      assert.equal($('#ab-choose-a').disabled, false); $('#ab-choose-a').click();
      $('#ab-export-study').click(); const second = JSON.parse(await exported.text()).iterations.at(-1);
      assert.equal(second.parentIterationId, iteration.id); assert.equal(second.parentEnvironmentId, chosen.id);
    });
    await t.test('historical dimensions and unevaluated snapshots preserve the working study and missing measurements', async () => {
      $('#ab-capture-a').click(); // Capture a scenario in the current abstract testbed.
      change('#resolution', '128x72'); $('#generate-abstract').click(); $('#confirm-dialog').close('confirm'); await new Promise(setImmediate); frame();
      const current = await exportScenario(); assert.equal(current.grid.width, 128);
      $('#zoom-in').click(); frame();
      $('#ab-export-study').click(); const study = JSON.parse(await exported.text());
      const saved = study.iterations.find(entry => study.scenarios.find(record => record.id === entry.aId).environment.source.experiment === 'closure');
      const history = document.querySelector(`[data-iteration-id="${saved.id}"]`); history.querySelector('button').click(); frame();
      $('#fit').click();
      const historicalCamera = fitCamera(700, 600, 40, 28);
      const point = { button: 0, pointerId: 5, clientX: historicalCamera.x + 35.5 * historicalCamera.cell, clientY: historicalCamera.y + 14.5 * historicalCamera.cell };
      emit(canvas, 'pointerdown', point); emit(canvas, 'pointerup', point);
      assert.match($('#cell-details').textContent, /Delivery destination/);
      $('#ab-return-current').click(); frame();
      assert.deepEqual(await exportScenario(), current); assert.equal($('#sim-step').disabled, false);
      assert.equal($('#ab-results table'), null, 'return restores the absent current baseline rather than the historical session');
      [...document.querySelectorAll('#ab-history button')].at(-1).click(); frame();
      assert.match($('#ab-comparison-badge').textContent, /no recorded run/);
      assert.equal($('#ab-show-knowledge').disabled, true); assert.equal($('#ab-choose-a').disabled, true);
      const metrics = [...document.querySelectorAll('#ab-results tr')].slice(1);
      assert.ok(metrics.length > 0 && metrics.every(row => [...row.querySelectorAll('td')].slice(1).every(cell => cell.textContent === '—')));
      assert.deepEqual(await exportScenario(), current);
      $('#ab-return-current').click(); assert.equal($('#ab-results table'), null);
    });
  } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    frames.clear();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
