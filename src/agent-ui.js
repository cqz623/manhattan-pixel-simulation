import { AgentSimulation } from './agents/simulation.js';
import { ComparisonExperiment } from './comparison.js';
import { terrainPassable } from './terrain.js';
import { describeAgentLocation, measureKnownDistance } from './locations.js';

const format = number => Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const seconds = number => number === null ? '—' : `${format(number)} s`;
function metricList(rows) {
  const list = document.createDocumentFragment();
  for (const [label, value] of rows) {
    const row = document.createElement('div'), key = document.createElement('dt'), val = document.createElement('dd');
    key.textContent = label; val.textContent = value; row.append(key, val); list.append(row);
  }
  return list;
}
function note(text) { const p = document.createElement('p'); p.className = 'section-note'; p.textContent = text; return p; }

/** Playback, UI and visualization state. No agent decisions live in this adapter. */
export class SimulationController {
  constructor(getEnvironment, onView, onStatus, onRunFocus = () => {}) {
    this.getEnvironment = getEnvironment; this.onView = onView; this.onStatus = onStatus;
    this.onRunFocus = onRunFocus; this.externalRun = false;
    this.$ = selector => document.querySelector(selector);
    this.playing = false; this.speed = Number(this.$('#sim-speed').value); this.selectedId = ''; this.mode = 'none'; this.knowledgeView = false;
    this.experiment = null; this.lastFrame = null; this.lastUI = 0;
    this.reset(); this.bind();
    this.frame = requestAnimationFrame(time => this.animate(time));
  }
  options() { return { count: Number(this.$('#sim-count').value), seed: Number(this.$('#sim-seed').value), radius: Number(this.$('#sim-radius').value), useLandmarks: this.$('#use-landmarks').checked }; }
  signature(environment) { return JSON.stringify(environment.rules) + Object.values(environment.layers).map(layer => layer.join(',')).join('|'); }
  reset() {
    this.playing = false; this.lastFrame = null;
    this.environment = this.getEnvironment(); this.environmentSignature = this.signature(this.environment);
    this.simulation = new AgentSimulation(this.environment, this.options()); this.selectedId = ''; this.knowledgeView = false;
    this.populateAgents(); this.publish(true);
  }
  populateAgents() {
    const select = this.$('#agent-selection'); select.replaceChildren();
    const all = document.createElement('option'); all.value = ''; all.textContent = 'All agents'; select.append(all);
    for (const agent of this.simulation.agents) {
      const option = document.createElement('option'); option.value = agent.id; option.textContent = `${agent.id} · ${agent.type === 'courier' ? 'Courier' : agent.type === 'explorer' ? 'Explorer' : 'Visitor / Explorer'}`; select.append(option);
    }
    if (!this.simulation.agents.some(agent => agent.id === this.selectedId)) { this.selectedId = ''; this.knowledgeView = false; }
    select.value = this.selectedId;
  }
  bind() {
    this.$('#sim-play').addEventListener('click', () => { this.onRunFocus(); this.playing = true; this.lastFrame = null; this.publish(true); });
    this.$('#sim-pause').addEventListener('click', () => { this.playing = false; this.publish(true); });
    this.$('#sim-step').addEventListener('click', () => { this.playing = false; this.simulation.step(); this.publish(true); });
    this.$('#sim-speed').addEventListener('change', event => { this.speed = Number(event.target.value); });
    this.$('#sim-count').addEventListener('change', event => {
      const actual = this.simulation.setCount(Number(event.target.value)); this.populateAgents(); this.publish(true); this.cancelComparison();
      this.onStatus(`${actual} agents active. Existing agents keep their memory; new agents begin unknown.`);
    });
    this.$('#sim-radius').addEventListener('change', event => { this.simulation.vision.radius = Number(event.target.value); this.cancelComparison(); this.publish(true); });
    this.$('#use-landmarks').addEventListener('change', event => {
      this.simulation.useLandmarks = event.target.checked; this.cancelComparison(); this.publish(true);
      this.onStatus(`Landmark retention ${event.target.checked ? 'enabled' : 'disabled'} for new trips. Current trips keep their starting condition.`);
    });
    this.$('#sim-reset').addEventListener('click', () => { this.cancelComparison(); this.reset(); this.onStatus('Simulation reset. The edited environment is preserved; all agent memory and trip history are cleared.'); });
    this.$('#sim-seed').addEventListener('change', event => {
      const seed = Number(event.target.value);
      event.target.value = Number.isInteger(seed) && seed >= 1 && seed <= 4294967295 ? String(seed) : '1';
      this.cancelComparison(); this.reset(); this.onStatus('Seed applied. Simulation reset for reproducibility.');
    });
    this.$('#knowledge-mode').addEventListener('change', event => this.setMode(event.target.value));
    document.querySelectorAll('[data-view-mode]').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.viewMode)));
    this.$('#agent-selection').addEventListener('change', event => this.selectAgent(event.target.value));
    this.$('#agent-knowledge').addEventListener('change', event => { this.knowledgeView = !!this.selectedId && event.target.checked; this.publish(true); });
    this.$('#distance-target').addEventListener('change', () => this.renderDistances());
    this.$('#show-all-agents').addEventListener('click', () => this.selectAgent(''));
    this.$('#compare-run').addEventListener('click', () => {
      this.playing = false;
      this.experiment = new ComparisonExperiment(this.getEnvironment(), { ...this.options(), seconds: Number(this.$('#compare-duration').value) });
      this.$('#compare-cancel').hidden = false; this.$('#compare-run').disabled = true;
      this.$('#comparison-results').replaceChildren(note('Running matched experiments… 0%')); this.publish(true);
    });
    this.$('#compare-cancel').addEventListener('click', () => this.cancelComparison());
    this.$('#compare-duration').addEventListener('change', () => this.cancelComparison());
  }
  cancelComparison() {
    if (this.experiment || this.$('#comparison-results table')) this.$('#comparison-results').replaceChildren(note('Experiment cancelled or settings changed. Run again with current settings.'));
    this.experiment = null; this.$('#compare-cancel').hidden = true; this.$('#compare-run').disabled = false;
  }
  environmentChanged(change = null) {
    if (change) {
      if (change.revision === this.lastEditorRevision) return;
      this.lastEditorRevision = change.revision;
      const environment = this.getEnvironment();
      if (change.kind === 'initial' || change.kind === 'rename') { this.environment = environment; this.simulation.world.sync(environment); return; }
      this.cancelComparison();
      if (['cells', 'rules'].includes(change.kind) && environment === this.environment) { this.simulation.syncEnvironment(environment); this.publish(true); return; }
      this.reset(); return;
    }
    const environment = this.getEnvironment(), signature = this.signature(environment);
    if (signature === this.environmentSignature && environment.grid.width === this.simulation.world.width && environment.grid.height === this.simulation.world.height) {
      // A scenario rename uses an immutable history snapshot, but keeps the same geometry.
      this.environment = environment; this.simulation.world.sync(environment); return;
    }
    this.cancelComparison();
    if (environment !== this.environment || environment.grid.width !== this.simulation.world.width || environment.grid.height !== this.simulation.world.height) {
      this.reset(); this.onStatus('Scenario replaced. Simulation reset; environment history is still available with Undo.');
    } else {
      this.environmentSignature = signature; this.simulation.syncEnvironment(environment); this.publish(true);
    }
  }
  selectAgent(id) {
    this.selectedId = id; this.knowledgeView = !!id; this.$('#agent-selection').value = id; this.publish(true);
  }
  setMode(mode) { this.mode = mode; this.knowledgeView = false; this.$('#knowledge-mode').value = mode; this.publish(true); }
  inspectAt(cell) {
    const agent = this.simulation.agents.find(item => item.position.x === cell[0] && item.position.y === cell[1]);
    const selected = this.simulation.agents.find(item => item.id === this.selectedId);
    const allowed = !selected || !this.knowledgeView || agent?.id === selected.id || selected.seenOccupants.some(item => item.id === agent?.id);
    if (agent && allowed) { this.selectAgent(agent.id); return true; }
    return false;
  }
  cellKnowledge(x, y) {
    const agent = this.knowledgeView && this.simulation.agents.find(item => item.id === this.selectedId);
    if (!agent) return null;
    const cell = agent.memory.cells[y * agent.memory.width + x];
    if (!cell) return { unknown: true };
    const occupant = [agent, ...agent.seenOccupants].find(item => item.position.x === x && item.position.y === y);
    return { static: cell.terrain, semantic: cell.semantic, overlays: cell.closure ? 'closure' : null, observedAt: cell.observedAt, visible: agent.visible.has(y * agent.memory.width + x),
      canTraverse: terrainPassable(cell), costs: cell.traversalCosts, congestion: cell.congestion,
      dynamic: occupant ? occupant.type === 'pedestrian' ? 'pedestrian' : 'robot' : null };
  }
  terrainDetails(x, y) {
    const cell = this.simulation.world.cell(y * this.simulation.world.width + x);
    return { canTraverse: terrainPassable(cell), costs: cell.traversalCosts, congestion: cell.congestion };
  }
  publish(refreshUI = false) {
    this.onView({ simulation: this.simulation, mode: this.mode, selectedId: this.selectedId, knowledgeView: this.knowledgeView, playing: this.playing || this.externalRun });
    if (refreshUI) this.renderUI();
  }
  animate(time) {
    const elapsed = this.lastFrame === null ? 0 : Math.min(250, time - this.lastFrame); this.lastFrame = time;
    if (this.playing && !document.hidden && !document.querySelector('dialog[open]')) {
      this.simulation.advance(elapsed * this.speed); this.publish();
      if (time - this.lastUI >= 150) { this.renderUI(); this.lastUI = time; }
    }
    if (this.experiment) {
      const experiment = this.experiment;
      if (experiment.advance(30)) {
        this.renderComparison(experiment.results()); this.experiment = null;
        this.$('#compare-cancel').hidden = true; this.$('#compare-run').disabled = false;
      } else this.$('#comparison-results').replaceChildren(note(`Running matched experiments… ${Math.round(experiment.completedTicks / experiment.totalTicks * 100)}%`));
    }
    this.frame = requestAnimationFrame(next => this.animate(next));
  }
  renderUI() {
    const sim = this.simulation;
    if (this.readOnlyInspection) {
      this.$('#sim-clock').textContent = 'HISTORY'; this.$('#sim-state').textContent = 'Historical inspection · live simulation paused';
      for (const id of ['sim-play', 'sim-pause', 'sim-step', 'sim-reset', 'sim-count', 'sim-seed', 'sim-radius', 'use-landmarks', 'compare-run', 'compare-duration', 'agent-selection', 'agent-knowledge', 'show-all-agents', 'distance-target']) this.$(`#${id}`).disabled = true;
      this.$('#sim-metrics').replaceChildren(note('Recorded measurements are in Environment A / B above. Live metrics are hidden during history inspection.'));
      this.$('#agent-details').replaceChildren(note('Use Compare discovered cells & landmarks to inspect recorded aggregate knowledge. Return to the current iteration for live agent inspection.'));
      this.$('#distance-details').replaceChildren(); return;
    }
    for (const id of ['agent-selection', 'show-all-agents']) this.$(`#${id}`).disabled = false;
    this.$('#sim-clock').textContent = `${format(sim.time)} s`;
    this.$('#sim-state').textContent = this.externalRun ? `Controlled A/B run · ${sim.agents.length} agents` : this.playing ? `Exploring · ${sim.agents.length} agents` : `Paused · ${sim.agents.length} agents`;
    this.$('#sim-icon').textContent = this.playing || this.externalRun ? '▶' : 'Ⅱ';
    this.$('#sim-play').disabled = this.playing || !sim.agents.length; this.$('#sim-pause').disabled = !this.playing;
    for (const id of ['sim-play', 'sim-pause', 'sim-step', 'sim-reset', 'sim-count', 'sim-seed', 'sim-radius', 'use-landmarks', 'compare-run', 'compare-duration']) {
      const element = this.$(`#${id}`);
      if (this.externalRun) element.disabled = true;
      else if (!['sim-play', 'sim-pause', 'compare-run'].includes(id)) element.disabled = false;
    }
    if (!this.externalRun) this.$('#compare-run').disabled = !!this.experiment;
    this.$('#agent-knowledge').checked = this.knowledgeView; this.$('#agent-knowledge').disabled = !this.selectedId;
    document.querySelectorAll('[data-view-mode]').forEach(button => {
      const active = !this.knowledgeView && button.dataset.viewMode === this.mode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    const summary = sim.summary();
    this.$('#sim-metrics').replaceChildren(metricList([
      ['Avg successful delivery', seconds(summary.averageDeliveryTime)],
      ['Delivery success', summary.successRate === null ? '—' : `${format(summary.successRate * 100)}% (${summary.deliveries}/${summary.plannedTasks ?? summary.attemptedTasks})`],
      ['Explorer coverage', summary.explorerCoverage === null ? '—' : `${format(summary.explorerCoverage * 100)}%`],
      ['Avg delivered weighted cost', format(summary.averageTravelCost)],
      ['Avg delivered route', summary.averageRouteLength === null ? '—' : `${format(summary.averageRouteLength)} cells`],
      ['Successful deliveries', summary.deliveries], ['Completed tours / visits', `${summary.tours} / ${summary.visits}`],
      ['First / later delivery', `${seconds(summary.firstDelivery)} / ${seconds(summary.laterDelivery)}`],
      ['Travel distance', `${format(summary.distance)} cells`], ['Energy consumed', format(summary.energy)],
      ['Explored cells · union', summary.explored], ['Landmarks discovered', summary.landmarks],
      ['Active-area coverage', `${format(summary.explorationCoverage * 100)}%`], ['Obstacle encounters', summary.obstacles],
      ['Landmark reuse', summary.reuse], ['Meaningful replans', summary.replans],
      ['Path searches · diagnostic', summary.planningComputations], ['No-route searches · diagnostic', summary.unsuccessfulSearches],
    ]));
    this.renderLegend(); this.renderAgent();
  }
  renderLegend() {
    const host = this.$('#knowledge-legend'), sim = this.simulation;
    if (this.selectedId && this.knowledgeView) {
      host.replaceChildren(note('Individual view: charcoal = unknown; dim = remembered; outlined = visible now. Dashed cyan = plan; solid amber = actual trail. Show all returns to collective layers.')); return;
    }
    if (this.mode === 'paths') {
      const max = sim.visits.reduce((max, count) => Math.max(max, count), 0);
      host.replaceChildren(note(`Actual arrivals · 0 to ${max} visits per cell. Brighter blue = more visits. Plans and spawn placements are not counted.`));
    } else if (this.mode === 'shared') host.replaceChildren(note(`Terrain knowledge overlap · 0 to ${sim.agents.length} agents. Dark = none; teal = more agents know the current terrain and closure state. This is not communication.`));
    else if (this.mode === 'landmarks') {
      host.replaceChildren(note('Purple = distinct agents remembering a discovered place.'));
      const list = document.createElement('ul'); list.className = 'landmark-counts';
      const heat = sim.landmarkHeat();
      for (const entry of heat) { const item = document.createElement('li'); item.textContent = `${entry.kind} ${entry.id} · ${entry.count} of ${entry.total} agents`; list.append(item); }
      host.append(heat.length ? list : note('No places discovered yet.'));
    } else host.replaceChildren(note('Explorers: cyan circles. Couriers: white squares. Pedestrians: orange dots. Hollow squares: editable robot starts. Yellow dashed frame: active simulation area.'));
    const scale = document.createElement('div'); scale.className = `heat-scale heat-${this.mode}`;
    if (this.mode !== 'none') host.prepend(scale);
  }
  renderAgent() {
    const agent = this.simulation.agents.find(item => item.id === this.selectedId), host = this.$('#agent-details');
    if (!agent) { host.replaceChildren(note('Select an agent with Inspect or the selector above. All agents begin with unknown terrain.')); this.renderDistances(); return; }
    const historyOpen = host.querySelector('details')?.open || false;
    const title = document.createElement('p'); title.className = 'agent-status'; title.textContent = agent.status;
    const stats = agent.memory.stats(), list = document.createElement('dl'); list.className = 'metrics';
    const goal = agent.goal ? `${agent.goal.kind}${agent.goal.id ? ` ${agent.goal.id}` : ''} · (${agent.goal.index % agent.memory.width}, ${Math.floor(agent.goal.index / agent.memory.width)})` : 'None yet';
    const location = describeAgentLocation(agent, this.getEnvironment());
    list.append(metricList([
      ['Role', agent.type === 'courier' ? 'Courier · fixed deliveries' : agent.type === 'explorer' ? 'Explorer · frontiers & landmarks' : 'Visitor · landmark tour'],
      ['Global location', `column ${location.column}, row ${location.row}`],
      ['Geographic location', location.geographic ? `${location.geographic.latitude.toFixed(5)}°, ${location.geographic.longitude.toFixed(5)}°` : 'No geographic reference'],
      ['Semantic location', location.relative + (location.parkAdjacent ? ' · adjacent to a remembered park' : '')],
      ['Goal', goal], ['Visible now', agent.visible.size], ['Known / unknown', `${stats.known} / ${stats.unknown}`],
      ['Active-area coverage', `${format(stats.known / agent.memory.total * 100)}%`], ['Obstacle encounters', agent.obstacleEncounters],
      ['Current trip time', agent.trip ? seconds(this.simulation.time - agent.trip.startedAt) : 'Between trips'],
      ['Current tour visits', agent.type === 'visitor' ? `${agent.visited.size} / ${agent.jobs.length}` : 'Not applicable'],
      ['Discovered / connections', `${stats.landmarks} / ${stats.connections}`], ['Route / walked cells', `${agent.path.length} / ${agent.distance}`],
      ['Trips / deliveries', `${agent.trips.length} / ${agent.deliveries}`], ['Visits / recoveries', `${agent.completedVisits} / ${agent.recoveries}`],
      ['Weighted travel cost', format(agent.travelCost)], ['Energy effort', format(agent.energy)], ['Battery', !agent.batteryEnabled ? 'Cost measured; no charging mission' : agent.type === 'courier' ? `${Math.round(agent.battery / agent.capacity * 100)}%` : 'Not applicable'],
      ['Replans / reuse', `${agent.replans} / ${agent.landmarkReuse}`], ['Current trip retention', agent.trip ? agent.trip.useLandmarks ? 'Enabled' : 'Disabled' : 'Between trips'],
      ['Searches / no route', `${agent.planning.computations} / ${agent.planning.unsuccessfulSearches}`],
      ['Initial / routine plans', `${agent.planning.initialPlans} / ${agent.planning.routinePlans}`],
    ]));
    host.replaceChildren(title, list);
    const places = [...agent.memory.landmarks.values()].filter(place => !['intersection', 'blocked'].includes(place.kind));
    host.append(note(`Remembered places: ${places.map(place => `${place.kind} ${place.id} (${place.position.x}, ${place.position.y})`).join('; ') || 'none'}.`));
    const details = document.createElement('details'), summary = document.createElement('summary'); details.open = historyOpen; summary.textContent = `Past trips (${agent.trips.length})`; details.append(summary);
    const history = document.createElement('ol'); history.className = 'trip-history';
    for (const trip of agent.trips) { const item = document.createElement('li'); item.textContent = `#${trip.number} · ${seconds(trip.time)} · ${format(trip.distance)} cells · ${format(trip.weightedCost)} weighted cost · ${format(trip.energy)} energy · landmarks ${trip.useLandmarks ? 'on' : 'off'} · ${trip.landmarkReuse} reused`; history.append(item); }
    details.append(agent.trips.length ? history : note('No completed trips yet.')); host.append(details);
    this.renderDistances();
  }
  renderDistances() {
    const select = this.$('#distance-target'), previous = select.value;
    const agent = this.simulation.agents.find(item => item.id === this.selectedId);
    select.replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Select a remembered destination'; select.append(empty);
    if (agent) for (const place of agent.memory.landmarks.values()) {
      if (place.kind !== 'destination') continue;
      const option = document.createElement('option'); option.value = place.id; option.textContent = place.id; select.append(option);
    }
    select.disabled = !agent || select.options.length === 1;
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    else if (select.options.length > 1) select.value = select.options[1].value;
    const distance = agent && select.value ? measureKnownDistance(agent, select.value) : null;
    this.$('#distance-details').replaceChildren(metricList([
      ['Manhattan distance', distance?.known ? `${distance.manhattan} cells` : 'Unknown destination'],
      ['Known least-cost route', distance?.steps !== null && distance?.steps !== undefined ? `${distance.steps} steps · ${format(distance.cost)} cost` : 'No known route'],
    ]));
  }
  renderComparison(results) {
    const table = document.createElement('table'); table.className = 'comparison-table';
    const caption = document.createElement('caption'); caption.textContent = `${format(results[0]?.time)} simulated seconds per condition · delivery times`; table.append(caption);
    const head = document.createElement('thead'), row = document.createElement('tr');
    for (const label of ['Landmarks', 'First', 'Later', 'Done']) { const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; row.append(th); } head.append(row); table.append(head);
    const body = document.createElement('tbody');
    for (const result of results) {
      const tr = document.createElement('tr');
      for (const value of [result.useLandmarks ? 'Retained' : 'Forgotten', seconds(result.firstDelivery), seconds(result.laterDelivery), result.deliveries]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } body.append(tr);
    }
    table.append(body);
    const host = this.$('#comparison-results'); host.replaceChildren(table, note('First = first completed delivery per courier; later = subsequent completed deliveries. — means no samples. Time includes pickup, search, avoidance, and charging.'));
    for (const result of results) host.append(note(`${result.useLandmarks ? 'Retained' : 'Forgotten'}: ${format(result.distance)} cells, ${format(result.energy)} energy, ${result.explored} explored, ${result.landmarks} landmarks, ${result.reuse} reuse, ${result.replans} replans.`));
  }
}
