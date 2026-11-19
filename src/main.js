import { census, indexAt, inspectCell, LAYERS, LAYER_NAMES, OBJECTS, PALETTE } from './environment.js';
import { generateSchematic } from './schematic.js';
import { EnvironmentEditor, lineCells } from './editor.js';
import { parseScenario, serializeScenario } from './scenario.js';
import { MapRenderer, KNOWLEDGE_MODES } from './visualization.js';
import { SimulationController } from './agent-ui.js';
import { FloatingPanels } from './panels.js';
import { createAbstractEnvironment } from './abstract-manhattan.js';
import { EnvironmentABController } from './ab-ui.js';
import { ensureLocalScenario, validateArea } from './regions.js';
import { applyPreset } from './design.js';
import { PARK_PROFILE } from '../data/nyc-park-profile.js';
import { DEFAULT_CROWD_COST, describeTerrain, terrainPassable } from './terrain.js';

const $ = selector => document.querySelector(selector);
let tool = 'inspect', object = 'building', activeLayer = 'static';
let gesture = null, spaceHeld = false, dirty = false, brushSize = 1;
let lastDisplayedSeed = 1, lastInspectedAgent = '';
const editor = new EnvironmentEditor(createAbstractEnvironment(), update, { requireWalkablePlacements: true });
let originalScenario = structuredClone(editor.environment);
const renderer = new MapRenderer($('#map'), () => editor.environment);
const canvas = renderer.canvas;
const panels = new FloatingPanels();
let simulationController, environmentAB;
simulationController = new SimulationController(() => editor.environment, view => {
  renderer.simulationView = view; renderer.requestDraw();
  if (view.selectedId && view.selectedId !== lastInspectedAgent) panels.open('inspector');
  lastInspectedAgent = view.selectedId;
  if (simulationController) renderInspection();
}, status, focusActive);
environmentAB = new EnvironmentABController({ getEnvironment: () => editor.environment, replaceEnvironment, controls: simulationController, focusActive, status,
  onSpatialView: view => {
    renderer.setComparisonView(view);
    const readOnly = !!view?.history;
    if (simulationController.readOnlyInspection !== readOnly) { simulationController.readOnlyInspection = readOnly; simulationController.publish(true); }
    if (view && view.mode !== 'off' && !['inspect', 'pan'].includes(tool)) setTool('inspect');
    renderInspection();
  } });
const palette = $('#palette');
$('#palette-count').textContent = `${PALETTE.length} objects`;
for (const id of PALETTE) {
  const info = OBJECTS[id];
  const button = document.createElement('button');
  button.dataset.object = id;
  button.title = `${info.name} · ${LAYER_NAMES[info.layer]}`;
  const swatch = document.createElement('span');
  swatch.className = 'swatch'; swatch.style.background = info.color; swatch.textContent = info.symbol; swatch.ariaHidden = 'true';
  swatch.style.color = info.ink || '#ffffff';
  const label = document.createElement('span'); label.textContent = info.paletteLabel || info.name;
  button.append(swatch, label);
  button.addEventListener('click', () => {
    finishGesture(); object = id; activeLayer = info.layer; setTool(['rectangle', 'fill'].includes(tool) ? tool : 'paint');
    if (!renderer.visibility[activeLayer]) { renderer.visibility[activeLayer] = true; $(`#visible-${activeLayer}`).checked = true; }
    updateControls(); renderer.requestDraw();
    status(`${info.name} selected · ${LAYER_NAMES[activeLayer]}.`);
  });
  palette.append(button);
}
for (const id of ['road', 'building', 'park', 'construction', 'destination', 'crowd']) {
  const item = document.createElement('span'), swatch = document.createElement('i');
  item.className = 'legend-key'; swatch.style.background = OBJECTS[id].color; swatch.ariaHidden = 'true';
  item.append(swatch, document.createTextNode(OBJECTS[id].paletteLabel || OBJECTS[id].name)); $('#terrain-legend').append(item);
}
$('#knowledge-mode').replaceChildren(...KNOWLEDGE_MODES.map(mode => {
  const option = document.createElement('option'); option.value = mode.id;
  option.textContent = mode.name + (mode.available ? '' : ' · future'); option.disabled = !mode.available;
  return option;
}));
for (const layer of LAYERS) {
  const row = document.createElement('div'); row.className = 'layer-row';
  const button = document.createElement('button'); button.dataset.layer = layer;
  const dot = document.createElement('span'); dot.className = 'layer-dot'; dot.ariaHidden = 'true';
  button.append(dot, document.createTextNode(LAYER_NAMES[layer]));
  button.addEventListener('click', () => { finishGesture(); activeLayer = layer; setTool('erase'); status(`Eraser targets ${LAYER_NAMES[layer]}.`); });
  const label = document.createElement('label'); label.title = `Show ${LAYER_NAMES[layer]}`;
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.id = `visible-${layer}`; input.setAttribute('aria-label', `Show ${LAYER_NAMES[layer]}`);
  input.addEventListener('change', () => { renderer.visibility[layer] = input.checked; renderer.requestDraw(); });
  label.append(input); row.append(button, label); $('#layers').append(row);
}
function status(message) { $('#status').textContent = message; }
function setTool(next) {
  finishGesture(); tool = next;
  if (['paint', 'rectangle', 'fill', 'erase', 'area'].includes(tool)) environmentAB?.exitSpatialView();
  if (['paint', 'rectangle', 'fill'].includes(tool)) activeLayer = OBJECTS[object].layer;
  $('#map-viewport').dataset.tool = tool;
  renderer.tool = tool;
  $('#map-hint').textContent = ({ area: 'Drag at least 8 × 8 cells to choose an active region. Starts and missions are prepared on connected streets.', paint: 'Click or drag to paint · Space + drag to pan', rectangle: 'Drag a rectangle · release to fill · one undo action', fill: 'Click to fill a connected region on the active layer', erase: 'Erase selected layer · Space + drag to pan', inspect: 'Click a cell or agent to inspect its knowledge', pan: 'Drag to pan · Scroll to zoom · F to fit' })[tool];
  updateControls();
}
function updateControls() {
  document.querySelectorAll('button[data-tool]').forEach(button => {
    const active = button.dataset.tool === tool; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-object]').forEach(button => {
    const active = button.dataset.object === object; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-layer]').forEach(button => {
    const active = button.dataset.layer === activeLayer; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
}
function update() {
  environmentAB?.environmentChanged(editor.lastChange);
  simulationController.environmentChanged(editor.lastChange);
  renderer.invalidate();
  const env = editor.environment;
  const counts = census(env);
  $('#robot-count').textContent = counts.robot;
  $('#pedestrian-count').textContent = counts.pedestrian;
  $('#landmark-count').textContent = counts.landmark;
  $('#walkable-count').textContent = counts.traversable.toLocaleString();
  $('#undo').disabled = !editor.undoStack.length;
  $('#redo').disabled = !editor.redoStack.length;
  $('#history-count').textContent = `${editor.undoStack.length} edits`;
  const mapName = document.createElement('span'); mapName.className = 'map-name'; mapName.textContent = env.name;
  $('#map-title').replaceChildren(mapName); $('#map-title').title = env.name;
  const tag = document.createElement('span'); tag.className = 'schematic-tag'; tag.textContent = env.source.kind === 'gis' ? 'GIS · AGGREGATED' : 'SCHEMATIC'; $('#map-title').append(tag);
  $('.map-caption').replaceChildren();
  const marker = document.createElement('span'); marker.className = 'status-marker';
  $('.map-caption').append(marker, document.createTextNode(env.source.kind === 'gis' ? `Imported scenario · ${env.source.description}` : 'Manhattan-inspired geometry / Not actual GIS data'));
  $('.map-caption').title = env.source.description;
  $('#scenario-name').value = env.name;
  $('#nyc-park-profile').checked = env.source.dataId === PARK_PROFILE.id;
  $('#crowd-base-cost').value = env.rules.crowdBaseCost ?? DEFAULT_CROWD_COST;
  for (const [id, key] of [['park-cost', 'parkCost'], ['crowd-weight', 'crowdWeight'], ['construction-mode', 'constructionMode'], ['construction-cost', 'constructionCost']]) $(`#${id}`).value = env.rules[key];
  if (env.source.seed && env.source.seed !== lastDisplayedSeed) { $('#generation-seed').value = env.source.seed; lastDisplayedSeed = env.source.seed; }
  const dimensions = $('#map-dimensions'); dimensions.replaceChildren(document.createTextNode(`${env.grid.width} × ${env.grid.height} `));
  const cells = document.createElement('span'); cells.className = 'muted'; cells.textContent = `/ ${(env.grid.width * env.grid.height).toLocaleString()} cells`; dimensions.append(cells);
  // Rectangular or custom imported rasters are supported without silently changing dimensions.
  const resolution = $('#resolution');
  resolution.querySelector('option[data-custom]')?.remove();
  const value = env.grid.width === env.grid.height ? String(env.grid.width) : `${env.grid.width}x${env.grid.height}`;
  if (![...resolution.options].some(option => option.value === value)) {
    const option = document.createElement('option'); option.dataset.custom = 'true'; option.value = 'custom'; option.textContent = `${env.grid.width} × ${env.grid.height} · custom`; resolution.append(option); resolution.value = 'custom';
  } else resolution.value = value;
  const area = env.simulation?.activeArea;
  const wholeCity = !area || area.x === 0 && area.y === 0 && area.width === env.grid.width && area.height === env.grid.height;
  $('#active-area').value = wholeCity ? 'city' : 'custom';
  $('#active-area-info').textContent = wholeCity ? 'Entire abstract grid is active.' : `${area.name || 'Active area'} · columns ${area.x}–${area.x + area.width - 1}, rows ${area.y}–${area.y + area.height - 1} · ${area.width} × ${area.height}.`;
  renderInspection();
}
function renderInspection() {
  const environment = renderer.displayEnvironment(), historical = !!renderer.comparisonView && renderer.comparisonView.mode !== 'off';
  const selected = renderer.selected;
  const details = $('#cell-details');
  if (!selected || indexAt(environment, ...selected) < 0) {
    $('#inspect-coordinate').textContent = '—, —';
    details.replaceChildren(); const p = document.createElement('p'); p.className = 'section-note'; p.textContent = 'Select Inspect, then click a cell to explore its four layers.'; details.append(p); return;
  }
  $('#inspect-coordinate').textContent = `${selected[0]}, ${selected[1]}`;
  const knowledge = historical ? null : simulationController.cellKnowledge(...selected);
  const values = knowledge || inspectCell(environment, ...selected);
  const list = document.createElement('dl');
  for (const layer of LAYERS) {
    const row = document.createElement('div'), key = document.createElement('dt'), val = document.createElement('dd');
    key.textContent = ({ static: 'Terrain', dynamic: knowledge ? 'Visible entity' : 'Spawn object', semantic: 'Landmark', overlays: 'Overlay' })[layer];
    val.textContent = values.unknown ? 'Unknown' : values[layer] ? OBJECTS[values[layer]].name : 'None'; row.append(key, val); list.append(row);
  }
  if (knowledge && !knowledge.unknown) {
    const row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
    label.textContent = 'Observation'; value.textContent = knowledge.visible ? 'Visible now' : `Remembered · ${knowledge.observedAt.toFixed(1)} s`;
    row.append(label, value); list.append(row);
  }
  if (!knowledge?.unknown) {
    const index = selected[1] * environment.grid.width + selected[0];
    const recorded = historical ? { ...describeTerrain(values.static, environment.rules, 0, !!environment.access?.[index]), closure: values.overlays === 'closure' } : null;
    const terrainInfo = recorded ? { canTraverse: terrainPassable(recorded), costs: recorded.traversalCosts } : knowledge || simulationController.terrainDetails(...selected);
    const row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
    label.textContent = historical ? 'Saved base cost · visitor / courier' : 'Cost · visitor / courier'; value.textContent = terrainInfo.canTraverse ? `${terrainInfo.costs.visitor.toFixed(1)} / ${terrainInfo.costs.courier.toFixed(1)}` : 'Blocked';
    row.append(label, value); list.append(row);
    if (values.static === 'crowd' && !historical) {
      const occupancyRow = document.createElement('div'), key = document.createElement('dt'), count = document.createElement('dd');
      key.textContent = knowledge ? 'Observed crowd' : 'Nearby occupants'; count.textContent = String(terrainInfo.congestion);
      occupancyRow.append(key, count); list.append(occupancyRow);
    }
  }
  details.replaceChildren(list);
}
function localPoint(event) { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; }
function setHover(cell) {
  renderer.hover = indexAt(renderer.displayEnvironment(), ...cell) < 0 ? null : cell;
  $('#hover-coordinate').textContent = renderer.hover ? `X ${String(cell[0]).padStart(2, '0')}   Y ${String(cell[1]).padStart(2, '0')}` : 'X —   Y —';
  renderer.requestDraw();
}
function applyCells(from, to) {
  let changed = false;
  editor.batch(() => { for (const [x, y] of lineCells(from, to)) changed = editor.paintBrush(x, y, object, activeLayer, tool === 'erase', brushSize) || changed; });
  if (changed) { dirty = true; status(`${tool === 'erase' ? 'Erasing' : 'Painting'} ${LAYER_NAMES[activeLayer]} · save JSON to keep your edits.`); }
}
function finishGesture(event) {
  if (!gesture) return;
  if (gesture.rectangle && event?.type === 'pointerup') {
    if (gesture.area) {
      const from = gesture.start, to = gesture.cell, grid = editor.environment.grid;
      const x = Math.max(0, Math.min(grid.width - 1, Math.min(from[0], to[0]))), y = Math.max(0, Math.min(grid.height - 1, Math.min(from[1], to[1])));
      const width = Math.min(grid.width - x, Math.max(from[0], to[0]) - x + 1), height = Math.min(grid.height - y, Math.max(from[1], to[1]) - y + 1);
      const pointerId = gesture.pointerId;
      gesture = null; editor.endStroke(); renderer.rectanglePreview = null;
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      $('#map-viewport').dataset.panning = 'false';
      selectArea({ id: 'custom', name: 'Custom area', x, y, width, height });
      return;
    } else {
      const changed = editor.fillRectangle(gesture.start, gesture.cell, object, activeLayer);
      if (changed) { dirty = true; status(`Rectangle filled on ${LAYER_NAMES[activeLayer]}.`); }
    }
  }
  renderer.rectanglePreview = null;
  const pointerId = gesture.pointerId;
  gesture = null; editor.endStroke();
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  $('#map-viewport').dataset.panning = 'false';
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.button !== 1) return;
  if (gesture) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  const point = localPoint(event), cell = renderer.cellAt(...point);
  const panning = tool === 'pan' || spaceHeld || event.button === 1;
  gesture = { pointerId: event.pointerId, panning, point, cell, start: cell, rectangle: ['rectangle', 'area'].includes(tool) && !panning, area: tool === 'area' && !panning };
  canvas.setPointerCapture(event.pointerId);
  $('#map-viewport').dataset.panning = String(panning);
  if (panning) return;
  if (tool === 'inspect') { panels.open('inspector'); if (!renderer.comparisonView || renderer.comparisonView.mode === 'off') simulationController.inspectAt(cell); }
  if (indexAt(renderer.displayEnvironment(), ...cell) >= 0) { renderer.selected = cell; renderInspection(); }
  if (['rectangle', 'area'].includes(tool)) { editor.beginStroke(); renderer.rectanglePreview = { from: cell, to: cell }; }
  else if (tool === 'fill') { editor.beginStroke(); if (editor.floodFill(...cell, object, activeLayer)) { dirty = true; status(`Connected region filled on ${LAYER_NAMES[activeLayer]}.`); } }
  else if (tool !== 'inspect') { editor.beginStroke(); applyCells(cell, cell); }
  renderer.requestDraw();
});
canvas.addEventListener('pointermove', event => {
  const point = localPoint(event), cell = renderer.cellAt(...point);
  setHover(cell);
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (gesture.panning) renderer.pan(point[0] - gesture.point[0], point[1] - gesture.point[1]);
  else if (gesture.rectangle) { renderer.rectanglePreview = { from: gesture.start, to: cell }; renderer.requestDraw(); }
  else if (!['inspect', 'fill'].includes(tool)) applyCells(gesture.cell, cell);
  gesture.point = point; gesture.cell = cell;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, finishGesture);
canvas.addEventListener('pointerleave', () => { if (!gesture) { renderer.hover = null; $('#hover-coordinate').textContent = 'X —   Y —'; renderer.requestDraw(); } });
canvas.addEventListener('contextmenu', event => event.preventDefault());
function zoom(factor, point) { finishGesture(); renderer.zoomBy(factor, ...(point || [])); $('#zoom-level').textContent = `${Math.round(renderer.camera.zoom * 100)}%`; }
canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .005), localPoint(event)); setHover(renderer.cellAt(...localPoint(event))); }, { passive: false });
function fit() { finishGesture(); renderer.fit(); $('#zoom-level').textContent = '100%'; }
function focusActive() {
  const area = renderer.displayEnvironment().simulation?.activeArea;
  if (area) renderer.fitArea(area); else renderer.fit();
  $('#zoom-level').textContent = '100%';
}
$('#zoom-active').addEventListener('click', () => { finishGesture(); focusActive(); });
$('#fit').addEventListener('click', fit);
$('#zoom-in').addEventListener('click', () => zoom(1.25));
$('#zoom-out').addEventListener('click', () => zoom(.8));
$('#show-grid').addEventListener('change', event => { renderer.grid = event.target.checked; renderer.requestDraw(); });
$('#brush-size').addEventListener('change', event => { finishGesture(); brushSize = Number(event.target.value); renderer.brushSize = brushSize; renderer.requestDraw(); });
document.querySelectorAll('button[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
function historyAction(action) {
  finishGesture();
  environmentAB?.exitSpatialView();
  if (!(action === 'undo' ? editor.undoStack : editor.redoStack).length) return;
  const oldGrid = JSON.stringify(editor.environment.grid);
  editor[action](); dirty = true;
  if (oldGrid !== JSON.stringify(editor.environment.grid)) { renderer.selected = null; renderer.hover = null; fit(); renderInspection(); }
  status(`${action === 'undo' ? 'Undid' : 'Redid'} last edit.`);
}
$('#undo').addEventListener('click', () => historyAction('undo'));
$('#redo').addEventListener('click', () => historyAction('redo'));
$('#scenario-name').addEventListener('change', event => {
  environmentAB.exitSpatialView();
  const name = event.target.value.trim() || 'Untitled study';
  if (name === editor.environment.name) { event.target.value = name; return; }
  const next = structuredClone(editor.environment); next.name = name; editor.replace(next, 'rename'); dirty = true; status('Scenario renamed.');
});
async function confirmChange(title, message) {
  finishGesture();
  const dialog = $('#confirm-dialog'); $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
  dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
function replaceEnvironment(env, message) {
  finishGesture(); renderer.selected = null; renderer.hover = null;
  editor.replace(env); fit(); dirty = true; status(message);
}
function selectArea(area) {
  try {
    const next = structuredClone(editor.environment);
    ensureLocalScenario(next, validateArea(area, next.grid));
    // Avoid finishGesture recursion when the area was drawn on the canvas.
    editor.replace(next, 'area'); dirty = true; focusActive(); setTool('inspect');
    status(`${area.name} active. Local missions prepared on connected cells; simulation memory reset.`);
  } catch (error) { status(`Area unchanged: ${error.message}`); }
}
$('#active-area').addEventListener('change', event => {
  if (event.target.value === 'custom') { setTool('area'); fit(); status('Drag a rectangle of at least 8 × 8 cells on the grid.'); }
  else selectArea({ id: 'city', name: 'Entire city', x: 0, y: 0, width: editor.environment.grid.width, height: editor.environment.grid.height });
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  finishGesture();
  environmentAB.exitSpatialView();
  const changed = editor.applyDesign(applyPreset(editor.environment, button.dataset.preset, { center: renderer.selected, protectedCells: environmentAB.protectedCells }));
  dirty ||= changed; status(changed ? `${button.textContent} applied as one undoable edit. Agents learn changes only when sensed.` : 'No eligible cell near this area. Select another cell or paint directly.');
}));
function restoreOriginal() { environmentAB.exitSpatialView(); replaceEnvironment(structuredClone(environmentAB.baseline || originalScenario), 'Original environment restored. Undo restores the previous edits.'); }
$('#restore-original').addEventListener('click', restoreOriginal);
$('#reset').addEventListener('click', async () => {
  if (await confirmChange('Reset changes?', 'Restore original A or the loaded scenario. Undo restores your current design.')) restoreOriginal();
});
$('#resolution').addEventListener('change', async event => {
  const [width, height = width] = event.target.value.split('x').map(Number);
  if (await confirmChange('Create a new grid?', `Generate a fresh ${width} × ${height} abstract city. Existing edits are replaced; Undo restores them.`)) replaceEnvironment(createAbstractEnvironment({ width, height, seed: generationSeed(), parkProfile: $('#nyc-park-profile').checked }), `Created a ${width} × ${height} abstract city.`);
  else update();
});
function generationSeed() {
  const input = $('#generation-seed'), seed = Number(input.value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) input.value = '1';
  return Number(input.value);
}
$('#generate-abstract').addEventListener('click', async () => {
  const seed = generationSeed();
  if (await confirmChange('Generate Abstract Manhattan?', `Replace the current environment using seed ${seed}? All cells remain editable, and generation can be undone.`)) replaceEnvironment(createAbstractEnvironment({ ...editor.environment.grid, seed, parkProfile: $('#nyc-park-profile').checked }), `Generated Abstract Manhattan · seed ${seed}.`);
});
$('#generate-classic').addEventListener('click', async () => {
  if (await confirmChange('Generate classic schematic?', 'Restore the original square Manhattan-inspired schematic. Undo restores your current city.')) replaceEnvironment(generateSchematic(Math.min(96, editor.environment.grid.height)), 'Classic schematic restored.');
});
for (const [id, key, minimum, maximum] of [['park-cost', 'parkCost', .5, 8], ['crowd-weight', 'crowdWeight', 0, 8], ['crowd-base-cost', 'crowdBaseCost', 1, 8], ['construction-cost', 'constructionCost', 1, 20], ['construction-mode', 'constructionMode']]) {
  $(`#${id}`).addEventListener('change', event => {
    finishGesture(); const value = key === 'constructionMode' ? event.target.value : Number(event.target.value);
    if (key === 'constructionMode' ? !['blocked', 'costly'].includes(value) : !Number.isFinite(value) || value < minimum || value > maximum) { event.target.value = editor.environment.rules[key]; status('Terrain setting is outside the allowed range.'); return; }
    editor.setRules({ ...editor.environment.rules, [key]: value }); dirty = true; status('Terrain rules updated. Agents update memory only when they observe affected cells.');
  });
}
if (!document.documentElement.requestFullscreen) $('#fullscreen').hidden = true;
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { status('Fullscreen is unavailable. The map already fills this browser viewport.'); }
});
$('#save').addEventListener('click', () => {
  finishGesture();
  const data = serializeScenario(editor.environment), blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `${editor.environment.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario'}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false; status('Scenario exported as JSON. Keep the downloaded file to restore this workspace.');
});
$('#load').addEventListener('click', () => { finishGesture(); $('#load-file').click(); });
$('#load-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0]; if (!file) return;
  try {
    if (file.size > 4_000_000) throw new Error('Scenario is too large (maximum 4 MB).');
    const env = parseScenario(await file.text());
    if (await confirmChange('Load this scenario?', `Load “${env.name}” (${env.grid.width} × ${env.grid.height})? Your current environment can be restored with Undo.`)) {
      originalScenario = structuredClone(env); replaceEnvironment(env, `Loaded “${env.name}”. All four layers restored.`); dirty = false;
    }
  } catch (error) { status(`Could not load scenario: ${error.message} Current environment preserved.`); }
  finally { input.value = ''; }
});
$('#help-button').addEventListener('click', () => { finishGesture(); $('#help-dialog').showModal(); });
const typing = target => target instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable);
window.addEventListener('keydown', event => {
  if ($('dialog[open]') || typing(event.target)) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); historyAction(event.shiftKey ? 'redo' : 'undo'); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); historyAction('redo'); return; }
  if (event.target instanceof HTMLButtonElement) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === ' ') { event.preventDefault(); spaceHeld = true; return; }
  if (event.repeat && !key.startsWith('arrow')) return;
  const shortcuts = { b: 'paint', r: 'rectangle', g: 'fill', e: 'erase', i: 'inspect', h: 'pan' };
  if (shortcuts[key]) { event.preventDefault(); setTool(shortcuts[key]); }
  if (key === 'f') { event.preventDefault(); fit(); }
  if (key === '+' || key === '=') { event.preventDefault(); zoom(1.25); }
  if (key === '-') { event.preventDefault(); zoom(.8); }
  if (event.target === canvas && key.startsWith('arrow')) {
    event.preventDefault();
    const grid = renderer.displayEnvironment().grid;
    const selected = renderer.selected ? [...renderer.selected] : [Math.floor(grid.width / 2), Math.floor(grid.height / 2)];
    selected[0] += key === 'arrowright' ? 1 : key === 'arrowleft' ? -1 : 0;
    selected[1] += key === 'arrowdown' ? 1 : key === 'arrowup' ? -1 : 0;
    if (indexAt(renderer.displayEnvironment(), ...selected) >= 0) { renderer.selected = selected; setHover(selected); renderInspection(); }
  }
  if (event.target === canvas && key === 'enter' && renderer.selected) {
    event.preventDefault();
    if (['paint', 'erase', 'rectangle', 'fill'].includes(tool)) {
      editor.beginStroke();
      if (tool === 'fill') { if (editor.floodFill(...renderer.selected, object, activeLayer)) dirty = true; }
      else applyCells(renderer.selected, renderer.selected);
      editor.endStroke();
    }
    renderInspection();
  }
});
window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });
window.addEventListener('blur', () => { spaceHeld = false; finishGesture(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
setTool('inspect'); update();
