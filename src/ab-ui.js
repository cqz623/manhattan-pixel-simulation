import { EnvironmentComparison } from './ab-comparison.js';
import { generateAlternatives, environmentChanges, hasValidRoutes } from './design.js';
import { ScenarioArchive } from './scenarios.js';
import { createExperimentPair } from './experiments.js';
import { analyzeSpatialComparison, comparisonExplanation, COMPARISON_COLORS } from './spatial-comparison.js';

const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const time = value => Number.isFinite(value) ? `${number(value)} s` : '—';
const paragraph = text => { const p = document.createElement('p'); p.className = 'section-note'; p.textContent = text; return p; };

export class EnvironmentABController {
  constructor({ getEnvironment, replaceEnvironment, controls, focusActive, status, onSpatialView = () => {} }) {
    Object.assign(this, { getEnvironment, replaceEnvironment, controls, focusActive, status, onSpatialView });
    this.$ = selector => document.querySelector(selector); this.session = null; this.runner = null; this.suppressChanges = false; this.variationSeed = 1;
    this.archive = new ScenarioArchive(); this.candidates = []; this.queue = []; this.nextRound = false;
    this.currentIterationId = null; this.parentIterationId = null; this.workingId = null; this.historyContext = null;
    this.spatialMode = 'off'; this.showChanges = false; this.showKnowledge = false; this.spatialCache = null;
    for (const [id, mode] of [['ab-paths-a', 'a'], ['ab-paths-b', 'b'], ['ab-paths-overlay', 'overlay'], ['ab-paths-live', 'off']]) this.$(`#${id}`).addEventListener('click', () => {
      if (mode === 'off' && this.historyContext) { this.returnToCurrent(); return; }
      this.controls.playing = false; this.controls.publish(true); this.spatialMode = mode; this.renderSpatial();
    });
    this.$('#ab-show-changes').addEventListener('change', event => { this.showChanges = event.target.checked; this.renderSpatial(); });
    this.$('#ab-show-knowledge').addEventListener('change', event => { this.showKnowledge = event.target.checked; this.renderSpatial(); });
    for (const selector of ['#sim-play', '#sim-step', '#sim-reset', '#agent-selection', '#agent-knowledge', '#show-all-agents', '#knowledge-mode', '[data-view-mode]']) {
      document.querySelectorAll(selector).forEach(element => element.addEventListener(element.tagName === 'SELECT' || element.tagName === 'INPUT' ? 'change' : 'click', () => this.exitSpatialView()));
    }
    this.$('#ab-capture-a').addEventListener('click', () => this.captureA());
    this.$('#ab-run-pair').addEventListener('click', () => this.runPair());
    this.$('#ab-load-experiment').addEventListener('click', () => this.loadExperiment());
    this.$('#ab-preview-a').addEventListener('click', () => this.preview(this.aId));
    this.$('#ab-preview-b').addEventListener('click', () => this.preview(this.bId));
    this.$('#ab-export-study').addEventListener('click', () => this.exportStudy());
    this.$('#ab-run-a').addEventListener('click', () => this.runA());
    this.$('#ab-copy-b').addEventListener('click', () => this.duplicateB());
    this.$('#ab-run-b').addEventListener('click', () => this.runB());
    this.$('#ab-variation').addEventListener('click', () => this.variation());
    this.$('#ab-choose-a').addEventListener('click', () => this.choose('A'));
    this.$('#ab-choose-b').addEventListener('click', () => this.choose('B'));
    this.$('#ab-next-iteration').addEventListener('click', () => this.nextIteration());
    this.$('#ab-return-current').addEventListener('click', () => this.returnToCurrent());
    this.$('#ab-cancel').addEventListener('click', () => this.cancel());
    this.render();
  }
  get baseline() { return (this.historyContext ? this.historyContext.session : this.session)?.a || null; }
  conditions() { return { plan: this.session.plan, seconds: this.session.options.seconds, initialKnowledge: 'empty', stepSeconds: .2 }; }
  get protectedCells() { return (this.historyContext ? this.historyContext.session : this.session)?.plan.starts.map(start => start.index) || []; }
  exitSpatialView() { if (this.historyContext) this.returnToCurrent(); this.spatialMode = 'off'; this.showChanges = false; this.showKnowledge = false; this.renderSpatial(); }
  spatialAnalysis() {
    if (!this.session) return null;
    const { a, b, resultA, resultB } = this.session;
    const key = [a, b, resultA, resultB, this.lastRevision];
    if (!this.spatialCache || key.some((value, n) => value !== this.spatialCache.key[n])) this.spatialCache = { key, data: analyzeSpatialComparison(a, b, resultA, resultB) };
    return this.spatialCache.data;
  }
  renderSpatial() {
    const data = this.spatialAnalysis(), readyA = !!data?.resultA?.spatial, readyB = !!data?.resultB?.spatial, running = !!this.runner;
    if (running || this.spatialMode === 'a' && !readyA && !this.historyContext || this.spatialMode === 'b' && !readyB || this.spatialMode === 'overlay' && (!readyA || !readyB)) this.spatialMode = 'off';
    for (const [id, mode, ready] of [['ab-paths-a', 'a', readyA], ['ab-paths-b', 'b', readyB], ['ab-paths-overlay', 'overlay', readyA && readyB], ['ab-paths-live', 'off', true]]) {
      const button = this.$(`#${id}`); button.disabled = running || !ready; button.setAttribute('aria-pressed', String(this.spatialMode === mode)); button.classList.toggle('active', this.spatialMode === mode);
    }
    this.$('#ab-show-changes').disabled = !data?.b;
    this.$('#ab-show-changes').checked = this.showChanges;
    this.$('#ab-show-knowledge').disabled = this.spatialMode === 'off' || !readyA && !readyB; this.$('#ab-show-knowledge').checked = this.showKnowledge;
    const active = !!data && (this.spatialMode !== 'off' || this.showChanges);
    const environment = this.spatialMode === 'a' ? data?.a : this.spatialMode !== 'off' ? data?.b : null;
    this.onSpatialView(data ? { data, environment, mode: this.spatialMode, showChanges: this.showChanges, showKnowledge: this.showKnowledge, history: !!this.historyContext } : null);
    let label = this.spatialMode === 'overlay' ? 'Recorded A/B paths · B terrain' : this.spatialMode === 'a' ? readyA ? 'Recorded A paths · A terrain' : 'Saved A terrain · no recorded run' : this.spatialMode === 'b' ? 'Recorded B paths · B terrain' : 'Live world · A/B changed cells';
    if (this.historyContext) label = `History ${this.aId}${this.bId ? '/' + this.bId : ''} · ${environment.grid.width} × ${environment.grid.height} · ${label}`;
    this.$('#ab-spatial-status').textContent = active ? this.spatialMode === 'off' ? 'Changed cells highlighted on the editable live world.' : `${label}. Solid cyan = A, dashed pink = B. Recorded views are read-only; use Live World or an editing tool to return.` : 'Complete runs to display recorded trajectories. Live editing and playback preserve the current camera.';
    const badge = this.$('#ab-comparison-badge'); badge.hidden = !active; badge.textContent = label;
    this.$('#knowledge-legend').hidden = active;
    const legend = this.$('#comparison-legend'); legend.hidden = !active; legend.replaceChildren();
    if (active) {
      legend.append(paragraph(!readyA && !readyB ? 'Saved terrain only. No movement or knowledge measurements have been recorded for this scenario.' : this.spatialMode !== 'off' ? 'A: cyan solid paths · B: pink dashed paths. Thickness shows actual movement density.' : 'Changed cells on the editable world. Choose A/B Paths to compare recorded movement.'));
      if (this.showChanges) {
        const row = document.createElement('div'); row.className = 'terrain-legend';
        for (const [kind, name] of [['blocked', 'Blocked ×'], ['crowd', 'Crowd cost'], ['passage', 'Passage +'], ['cost', 'Other cost'], ['landmark', 'Landmark'], ['other', 'Other edit']]) {
          const key = document.createElement('span'), swatch = document.createElement('i'); key.className = 'legend-key'; swatch.style.background = COMPARISON_COLORS[kind]; key.append(swatch, document.createTextNode(name)); row.append(key);
        } legend.append(row);
      }
      if (this.showKnowledge && this.spatialMode !== 'off') legend.append(paragraph('Tint = actually discovered cells; outlined squares = remembered places. This compares recorded knowledge, not communication.'));
    }
    const explanation = this.$('#ab-spatial-explanation'); explanation.replaceChildren();
    if (data) {
      const notes = comparisonExplanation(data); explanation.append(paragraph(notes[0]));
      if (readyB && data.changes.length) explanation.append(paragraph(`B sensed ${data.changes.filter(cell => cell.b.observers.length).length}/${data.changes.length} changed cells; entered ${data.changes.filter(cell => cell.b.visits).length}, including ${data.changes.filter(cell => cell.b.courierVisits).length} used by couriers.`));
      if (readyA && readyB) {
        const routes = data.pairedTrips.length ? `${data.pairedTrips.filter(trip => trip.changed).length}/${data.pairedTrips.length} paired completed-delivery routes changed.` : 'No paired completed-delivery routes are available.';
        explanation.append(paragraph(`${routes} Success A/B ${data.resultA.deliveries}/${data.resultA.plannedTasks} → ${data.resultB.deliveries}/${data.resultB.plannedTasks}. Mean successful time ${time(data.resultA.averageDeliveryTime)} → ${time(data.resultB.averageDeliveryTime)}.`));
      }
      const narrative = document.createElement('details'), narrativeTitle = document.createElement('summary'); narrativeTitle.textContent = 'Measured behavior, precision & conditions'; narrative.append(narrativeTitle);
      for (const text of notes.slice(1)) narrative.append(paragraph(text)); explanation.append(narrative);
      if (data.changes.length) {
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Per-cell sensing, use and cost'; details.append(summary);
        for (const cell of data.changes.slice(0, 80)) details.append(paragraph(`(${cell.x}, ${cell.y}) ${cell.kind}: Courier base cost ${cell.costA ?? 'blocked'} → ${cell.costB ?? 'blocked'}. A/B entries ${cell.a.visits}/${cell.b.visits}; B courier entries ${cell.b.courierVisits}. B sensed by ${cell.b.observers.map(observer => `${observer.id} at ${number(observer.firstSeenAt)} s`).join(', ') || (readyB ? 'none' : 'not recorded yet')}.`));
        if (data.changes.length > 80) details.append(paragraph('First 80 cells shown; exported study includes the complete spatial records.'));
        explanation.append(details);
      }
    }
  }
  apply(environment, message, recordId = null) {
    this.suppressChanges = true;
    try { this.replaceEnvironment(structuredClone(environment), message); this.workingId = recordId; }
    finally { this.suppressChanges = false; }
  }
  runA() {
    if (this.runner) return;
    if (!this.session && !this.captureA()) return;
    this.start('A', this.session.runA(), this.aId);
  }
  captureA(environment = this.getEnvironment()) {
    if (this.runner) return false;
    try {
      const session = new EnvironmentComparison(environment, { ...this.controls.options(), seconds: Number(this.$('#ab-duration').value) });
      const parent = this.archive.get(this.archive.selectedId);
      this.archive.closeIteration(this.currentIterationId); this.currentIterationId = null; this.parentIterationId = null;
      this.session = session; this.aId = this.archive.add(environment, { parentId: parent?.id, iteration: parent ? parent.iteration + 1 : 0, label: 'A · ' + environment.name, conditions: this.conditions() }).id;
      this.bId = null; this.candidates = []; this.nextRound = false;
      this.workingId = this.aId;
      this.spatialMode = 'off'; this.showChanges = false; this.showKnowledge = false;
      this.status(`Saved ${this.aId} as immutable A. ${hasValidRoutes(environment, session.plan) ? 'Duplicate it, edit B, then run matched A + B.' : 'Some starts or assigned goals are disconnected; results may be unsuccessful. Open connections or evaluate the failure honestly.'}`); this.render(); return true;
    } catch (error) { this.status(`A/B setup: ${error.message}`); this.render(); return false; }
  }
  duplicateB() {
    if (!this.session || this.runner) return;
    const b = this.session.duplicateB(); this.saveB(b, 'B · duplicate of A');
    this.apply(b, 'A duplicated into B. Edit the environment; A and its experimental conditions remain frozen.', this.bId); this.render();
  }
  runB() {
    if (!this.session || this.runner) return;
    try { const b = this.session.b || this.getEnvironment(); if (!this.bId) this.saveB(b, 'B'); this.start('B', this.session.runB(b), this.bId); }
    catch (error) { this.status(`B cannot start: ${error.message}`); }
  }
  variation() {
    if (!this.session || this.runner) return;
    try {
      if (this.nextRound && !this.nextIteration()) return;
      const base = this.getEnvironment(), seed = this.variationSeed++;
      const alternatives = generateAlternatives(base, { seed, plan: this.session.plan });
      const parentId = this.workingId || this.aId;
      this.candidates = alternatives.map((env, n) => {
        env.name = `${base.name.slice(0, 55)} · V${n + 1}`;
        return this.archive.add(env, { parentId: parentId || this.aId, iteration: this.archive.get(this.aId).iteration, label: `Variation ${n + 1}`, generationSeed: seed, changes: environmentChanges(base, env), conditions: this.conditions() }).id;
      });
      this.activateB(this.candidates[0]);
      this.status(`${alternatives.length} distinct route-valid alternatives generated. Inspect and run each against the same A; no improvement is assumed.`); this.render();
    } catch (error) { this.status(error.message); }
  }
  choose(which) {
    if (!this.session || this.runner || this.historyContext || !this.session.resultA || !this.session.resultB) return;
    const environment = which === 'A' ? this.session.a : this.session.b;
    if (!environment) return;
    const id = which === 'A' ? this.aId : this.bId;
    try {
      const entry = this.archive.completeIteration(this.aId, this.bId, id, { changes: this.session.changes(), parentIterationId: this.parentIterationId, currentId: this.currentIterationId });
      this.currentIterationId = entry.id; this.nextRound = true;
      this.spatialMode = 'off'; this.showChanges = false; this.showKnowledge = false;
      this.apply(environment, `${which} selected. Its measured result is preserved; use Next Iteration to continue.`, id); this.render();
    } catch (error) { this.status(error.message); }
  }
  nextIteration() {
    if (this.runner || this.historyContext || !this.nextRound) return false;
    const baseline = this.archive.nextBaseline(this.currentIterationId);
    this.parentIterationId = this.currentIterationId; this.currentIterationId = null;
    this.session = EnvironmentComparison.fromRecords(baseline); this.aId = baseline.id; this.bId = null;
    this.candidates = []; this.nextRound = false; this.spatialCache = null;
    this.spatialMode = 'off'; this.showChanges = false; this.showKnowledge = false;
    this.$('#ab-duration').value = String(baseline.conditions.seconds);
    this.apply(baseline.environment, `Next iteration: ${baseline.id} inherits selected ${baseline.parentId}, its measured baseline and identical run conditions. Duplicate A into B or generate variations.`, baseline.id);
    this.$('#ab-progress').textContent = `Baseline measurement retained from ${baseline.measurementSourceId}; B starts with empty memory.`;
    this.render(); return true;
  }
  clearSelection() {
    this.archive.closeIteration(this.currentIterationId); this.currentIterationId = null; this.nextRound = false;
  }
  saveB(environment, label, parentId = this.aId) {
    this.clearSelection();
    this.bId = this.archive.add(environment, { parentId, iteration: this.archive.get(this.aId).iteration, label, changes: environmentChanges(this.session.a, environment), conditions: this.conditions() }).id;
    this.session.b = structuredClone(environment); this.session.resultB = null; return this.bId;
  }
  activateB(id) {
    const record = this.archive.get(id); if (!record || this.runner) return;
    if (this.bId !== id) this.clearSelection();
    this.bId = id; this.session.b = structuredClone(record.environment); this.session.resultB = structuredClone(record.result);
    this.apply(record.environment, `${record.id} loaded as B. A and experimental conditions remain fixed.`, id); this.render();
  }
  preview(id) { const record = this.archive.get(id); if (record && !this.runner) this.apply(record.environment, `Viewing ${record.id}: ${record.label}.`, id); }
  inspectHistory(aId, bId = null, mode = 'a') {
    if (this.runner) return;
    if (!this.historyContext) this.historyContext = Object.fromEntries(['session', 'aId', 'bId', 'candidates', 'currentIterationId', 'parentIterationId', 'workingId', 'nextRound', 'spatialMode', 'showChanges', 'showKnowledge'].map(key => [key, this[key]]));
    this.controls.playing = false;
    this.session = EnvironmentComparison.fromRecords(this.archive.get(aId), this.archive.get(bId));
    this.aId = aId; this.bId = bId; this.candidates = []; this.spatialCache = null;
    this.spatialMode = mode; this.showChanges = !!bId; this.showKnowledge = false;
    this.status(`History: ${aId}${bId ? ' / ' + bId : ''}. Recorded maps and results are read-only; your current study is preserved.`); this.render();
  }
  returnToCurrent() {
    if (!this.historyContext) return;
    const context = this.historyContext; this.historyContext = null; Object.assign(this, context); this.spatialCache = null;
    this.status('Returned to the current iteration. Historical maps and results are unchanged.'); this.render();
  }
  runPair() {
    if (this.runner) return;
    if (!this.session && !this.captureA()) return;
    const b = structuredClone(this.session.b || this.getEnvironment());
    try {
      const runnerB = this.session.runB(b); // Validate B before either run starts.
      if (!this.bId) this.saveB(b, 'B');
      this.queue = [{ which: 'B', runner: runnerB, id: this.bId }];
      this.start('A', this.session.runA(), this.aId);
    } catch (error) { this.queue = []; this.status(`Matched study: ${error.message}`); }
  }
  loadExperiment() {
    if (this.runner) return;
    const pair = createExperimentPair(this.$('#ab-experiment').value);
    for (const [id, value] of [['sim-seed', 1], ['sim-count', 4], ['sim-radius', 6], ['ab-duration', 480]]) this.$(`#${id}`).value = String(value);
    this.$('#use-landmarks').checked = true; this.archive.selectedId = null;
    if (!this.captureA(pair.a)) return;
    this.saveB(pair.b, pair.name + ' · B'); this.apply(pair.a, pair.question, this.aId);
    this.$('#ab-experiment-note').textContent = `${pair.question} Seed 1, four agents, sight 6, 480 s, empty starting memory. Use Run matched A + B. Neither outcome is predetermined.`; this.render();
  }
  exportStudy() {
    const blob = new Blob([JSON.stringify(this.archive.export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'pixel-city-study.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.status('Study exported with scenario maps, lineage, exact changes, conditions and measured results.');
  }
  start(which, runner, recordId) {
    this.spatialMode = 'off';
    this.apply(runner.environment, `Running ${which} from a fresh, matched start.`, recordId);
    this.controls.cancelComparison(); this.controls.playing = false; this.controls.externalRun = true;
    this.runner = runner; this.runningVariant = which; this.runningRecordId = recordId; this.lastFrame = null; this.lastPublish = 0;
    this.fast = this.$('#ab-fast').checked;
    const plan = this.session.plan;
    for (const [id, value] of [['sim-count', plan.starts.length], ['sim-seed', plan.seed], ['sim-radius', plan.radius]]) this.$(`#${id}`).value = String(value);
    this.$('#use-landmarks').checked = plan.useLandmarks;
    this.controls.simulation = runner.simulation; this.controls.populateAgents(); this.controls.publish(true);
    this.focusActive(); this.render();
    this.frame = requestAnimationFrame(timestamp => this.animate(timestamp));
  }
  animate(timestamp) {
    if (!this.runner) return;
    const elapsed = this.lastFrame === null ? 0 : Math.min(250, timestamp - this.lastFrame); this.lastFrame = timestamp;
    if (!document.hidden && !document.querySelector('dialog[open]')) {
      if (this.fast) this.runner.advance(30);
      else { this.runner.simulation.advance(elapsed * this.controls.speed); this.runner.done = this.runner.simulation.tick >= this.runner.ticks; }
    }
    this.controls.publish(timestamp - this.lastPublish > 150 || this.runner.done);
    if (timestamp - this.lastPublish > 150) this.lastPublish = timestamp;
    this.$('#ab-progress').textContent = `${this.runningVariant}: ${Math.round(this.runner.simulation.tick / this.runner.ticks * 100)}% · ${number(this.runner.simulation.time)} / ${this.runner.ticks * .2} simulated s`;
    if (this.runner.done) {
      const result = this.runner.result();
      this.session[this.runningVariant === 'A' ? 'resultA' : 'resultB'] = result;
      this.archive.recordResult(this.runningRecordId, result, this.session.plan);
      this.runner.simulation.maxTicks = null; this.runner = null; this.controls.externalRun = false; this.controls.publish(true);
      this.$('#ab-progress').textContent = `${this.runningVariant} complete. Results are measured from a fresh, controlled run.`;
      const next = this.queue.shift();
      if (next) { this.start(next.which, next.runner, next.id); return; }
      this.render(); return;
    }
    this.frame = requestAnimationFrame(next => this.animate(next));
  }
  cancel(reset = true) {
    this.queue = [];
    if (!this.runner) return;
    this.runner = null; if (this.frame) cancelAnimationFrame(this.frame);
    this.controls.externalRun = false;
    if (reset) this.controls.reset();
    this.$('#ab-progress').textContent = 'Study cancelled; incomplete results were not recorded.'; this.render();
  }
  environmentChanged(change) {
    if (this.suppressChanges || !this.session || !change || ['initial', 'rename'].includes(change.kind) || this.lastRevision === change.revision) return;
    if (this.historyContext) this.returnToCurrent();
    if (!this.session) return;
    this.lastRevision = change.revision;
    this.spatialMode = 'off'; this.spatialCache = null;
    if (this.runner) this.cancel();
    this.clearSelection();
    const area = this.getEnvironment().simulation?.activeArea;
    const sourceChanged = ['generator', 'seed', 'experiment', 'dataId'].some(key => this.getEnvironment().source[key] !== this.session.a.source[key]);
    if (sourceChanged || this.getEnvironment().grid.width !== this.session.plan.width || this.getEnvironment().grid.height !== this.session.plan.height || (area && ['x', 'y', 'width', 'height'].some(key => area[key] !== this.session.plan.area[key]))) {
      this.session = null; this.aId = null; this.bId = null; this.candidates = []; this.archive.selectedId = null; this.nextRound = false;
      this.$('#ab-progress').textContent = 'Grid, generator or active area changed. Save a new A for matched comparisons; prior records remain in history.';
    } else {
      this.session.b = this.getEnvironment(); this.session.resultB = null;
      const record = this.archive.get(this.bId), changes = environmentChanges(this.session.a, this.session.b);
      if (!record || record.result || this.workingId !== this.bId) this.saveB(this.session.b, 'B · manual edit', this.workingId || this.aId);
      else this.archive.updateDraft(this.bId, this.session.b, changes);
      this.workingId = this.bId;
    }
    this.render();
  }
  render() {
    const session = this.session, running = !!this.runner || !!this.historyContext;
    this.$('#ab-return-current').hidden = !this.historyContext;
    this.$('#ab-history-status').textContent = this.historyContext ? `History inspection · ${this.aId}${this.bId ? ' / ' + this.bId : ''} · read-only` : this.parentIterationId ? `Current iteration · follows ${this.parentIterationId}` : 'Current study';
    this.$('#ab-next-iteration').disabled = running || !this.nextRound;
    this.$('#ab-run-a').disabled = running;
    for (const id of ['ab-capture-a', 'ab-load-experiment', 'ab-experiment']) this.$(`#${id}`).disabled = running;
    this.$('#ab-run-pair').disabled = running;
    this.$('#ab-preview-a').disabled = running || !session;
    this.$('#ab-preview-b').disabled = running || !session?.b;
    this.$('#ab-export-study').disabled = running || !this.archive.records.length;
    this.renderArchive();
    this.renderSpatial();
    for (const id of ['ab-copy-b', 'ab-run-b', 'ab-variation']) this.$(`#${id}`).disabled = running || !session;
    const selectable = !!session?.resultA?.complete && !!session?.resultB?.complete && this.spatialAnalysis()?.initialConditionsMatch === true;
    this.$('#ab-choose-a').disabled = running || !selectable;
    this.$('#ab-choose-b').disabled = running || !selectable;
    this.$('#ab-cancel').hidden = !this.runner;
    this.$('#ab-duration').disabled = running; this.$('#ab-fast').disabled = running;
    const host = this.$('#ab-results'); host.replaceChildren();
    if (!session) { host.append(paragraph('Save current as A, duplicate B, edit, then run matched A + B. Or load a demonstration pair. Both start with empty spatial memory.')); this.$('#ab-conditions').textContent = 'No baseline captured.'; this.$('#ab-recommendation').textContent = ''; return; }
    const plan = session.plan;
    this.$('#ab-conditions').textContent = `Locked: seed ${plan.seed} · ${plan.starts.length} agents · sight ${plan.radius} · ${session.options.seconds} s · ${plan.taskLimit} tasks/courier · empty memory · landmarks ${plan.useLandmarks ? 'on' : 'off'}. Identical starts and task IDs in A/B. Added B destinations do not change the fixed workload.`;
    const source = this.archive.get(this.aId)?.measurementSourceId;
    if (source) this.$('#ab-conditions').textContent += ` A measurement retained from ${source}; no new run is implied.`;
    const table = document.createElement('table'); table.className = 'comparison-table';
    const header = document.createElement('tr');
    for (const label of ['Measured result', 'A', 'B']) { const th = document.createElement('th'); th.textContent = label; header.append(th); } table.append(header);
    for (const [label, formatter] of [
      ['Avg successful delivery', value => time(value.averageDeliveryTime)],
      ['Success / fixed workload', value => value.successRate === null ? '—' : `${number(value.successRate * 100)}% (${value.deliveries}/${value.plannedTasks})`],
      ['Avg actual route', value => `${number(value.averageRouteLength)} cells`],
      ['Avg depot→target Manhattan', value => value.averageManhattan === null ? '—' : `${number(value.averageManhattan)} cells`],
      ['Avg delivered travel cost', value => number(value.averageTravelCost)],
      ['Replans · meaningful changes', value => number(value.replans)],
      ['Initial plans', value => number(value.initialPlans)], ['Path searches · diagnostic', value => number(value.planningComputations)],
      ['No-route searches · diagnostic', value => number(value.unsuccessfulSearches)],
      ['Explorer coverage', value => value.explorerCoverage === null ? '—' : `${number(value.explorerCoverage * 100)}%`],
      ['Explorer landmarks / cost', value => `${value.explorerLandmarks} / ${number(value.explorerCost)}`],
      ['All-agent coverage', value => `${number(value.explorationCoverage * 100)}%`],
      ['Actual weighted travel cost', value => number(value.travelCost)], ['Incomplete at deadline', value => number(value.incompleteTasks)],
      ['First / later delivery', value => `${time(value.firstDelivery)} / ${time(value.laterDelivery)}`],
      ['Landmark reuse', value => number(value.reuse)],
      ['Treatment visits · courier/all', value => value.treatmentVisits === null ? '—' : `${value.courierTreatmentVisits} / ${value.treatmentVisits}`],
    ]) {
      const row = document.createElement('tr'), title = document.createElement('td'); title.textContent = label; row.append(title);
      for (const result of [session.resultA, session.resultB]) { const td = document.createElement('td'); td.textContent = result ? formatter(result) : '—'; row.append(td); } table.append(row);
    }
    host.append(table);
    const diagnostics = document.createElement('details'), diagnosticsTitle = document.createElement('summary'); diagnosticsTitle.textContent = 'Replan definition and diagnostics'; diagnostics.append(diagnosticsTitle);
    diagnostics.append(paragraph('Main Replans counts replacement or abandonment of an unfinished route after an observed obstacle, better informed route, active goal change, occupancy conflict or rejected move. Normal next-frontier/task plans, identical routes and failed searches are diagnostic only. Metric version 2; earlier Replans totals are not comparable.'));
    for (const [variant, result] of [['A', session.resultA], ['B', session.resultB]]) if (result) diagnostics.append(paragraph(`${variant}: ${Object.entries(result.replanReasons || {}).map(([reason, count]) => `${reason} ${count}`).join(', ')}. Routine continuations ${number(result.routinePlans)}; unchanged route computations ${number(result.unchangedRoutes)}.`));
    host.append(diagnostics);
    const changes = session.changes();
    host.append(paragraph(changes.cells.length || changes.rules?.length ? `${changes.cells.length} changed cells. ${changes.summary.map(item => `${item.count} ${item.change}`).join('; ')}` : 'A/B geometry and rules are currently identical.'));
    if (changes.rules?.length) host.append(paragraph(changes.rules.map(rule => `${rule.key}: ${rule.before ?? 'default'} → ${rule.after ?? 'default'}`).join('; ')));
    if (changes.details?.length) {
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Exact changed cells'; details.append(summary);
      details.append(paragraph(changes.details.slice(0, 80).map(cell => `(${cell.x}, ${cell.y}) ${cell.patches.map(patch => `${patch.layer}: ${patch.before ?? 'empty'} → ${patch.after ?? 'empty'}`).join(', ')}`).join('; ') + (changes.details.length > 80 ? ' … export study for all cells.' : ''))); host.append(details);
    }
    this.$('#ab-recommendation').textContent = this.historyContext ? 'Historical evidence. Return to the current iteration to edit or select.' : this.nextRound ? `Selected environment ${this.archive.selectedId === this.aId ? 'A' : 'B'} (${this.archive.selectedId}). Its map and measured result are preserved. Next Iteration uses this selection.` : this.spatialAnalysis()?.initialConditionsMatch === false ? 'Actual initial states differ. Results are descriptive; rerun with matched starts before selection.' : session.resultA && session.resultB ? 'Compare the measured tradeoffs, then Select A or Select B. The choice is yours; no winner is assigned.' : 'Complete both runs before selecting. Missing measurements remain —; zero successes cannot appear fast.';
    if (session.resultA && session.resultB) host.append(paragraph(`Observed B−A: ${session.resultB.deliveries - session.resultA.deliveries} completed deliveries; ${session.resultB.replans - session.resultA.replans} replans; ${number(session.resultB.travelCost - session.resultA.travelCost)} weighted travel-cost units. Compare actual paths. These results describe this seed and duration; improvement is not assumed.`));
  }
  renderArchive() {
    const candidates = this.$('#ab-candidates'); candidates.replaceChildren();
    for (const id of this.candidates) {
      const record = this.archive.get(id), row = document.createElement('div'); row.className = 'candidate-row';
      const text = document.createElement('p'); text.className = 'section-note';
      text.textContent = `${id} · ${record.label} · ${record.changes.cells.length} changed cells · ${record.result ? `${number(record.result.successRate * 100)}% success / ${time(record.result.averageDeliveryTime)} / Explorer ${number(record.result.explorerCoverage * 100)}%` : 'not evaluated'}`; row.append(text);
      const buttons = document.createElement('div'); buttons.className = 'button-row';
      for (const [label, action] of [['Inspect', () => this.activateB(id)], ['Run', () => { this.activateB(id); if (this.session.resultA) this.runB(); else this.runPair(); }], ['Select', () => { this.activateB(id); this.choose('B'); }]]) {
        const button = document.createElement('button'); button.textContent = label; button.disabled = !!this.runner || (label === 'Select' && (!record.result || !this.session.resultA)); button.addEventListener('click', action); buttons.append(button);
      } row.append(buttons); candidates.append(row);
    }
    const history = this.$('#ab-history'); history.replaceChildren();
    if (!this.archive.iterations.length) history.append(paragraph('No completed iterations. Run A and B, then select an environment to record your decision.'));
    const action = (label, callback, disabled = false) => { const button = document.createElement('button'); button.textContent = label; button.disabled = !!this.runner || disabled; button.addEventListener('click', callback); return button; };
    for (const entry of this.archive.iterations) {
      const item = document.createElement('details'); item.className = 'iteration-record'; item.dataset.iterationId = entry.id;
      const title = document.createElement('summary'); title.textContent = `Iteration ${entry.number} · ${entry.aId}/${entry.bId} · selected ${entry.selectedId}`; item.append(title);
      const plan = entry.conditions.plan;
      item.append(paragraph(`Parent environment ${entry.parentEnvironmentId || 'root'}${entry.parentIterationId ? ' · follows ' + entry.parentIterationId : ''}. Seed ${plan.seed} · ${entry.conditions.seconds} s · sight ${plan.radius} · landmarks ${plan.useLandmarks ? 'on' : 'off'} · ${plan.taskLimit} tasks/courier · empty memory.`));
      item.append(paragraph(`Agents: ${plan.starts.map(agent => `${agent.id} ${agent.type} @ (${agent.index % plan.width}, ${Math.floor(agent.index / plan.width)})`).join('; ')}. Exact headings and assignments are in the study export.`));
      item.append(paragraph(`${entry.changes?.cells?.length ?? 0} changed cells: ${entry.changes?.summary?.map(change => `${change.count} ${change.change}`).join('; ') || 'none'}. ${entry.changes?.rules?.map(rule => `${rule.key}: ${rule.before ?? 'default'} → ${rule.after ?? 'default'}`).join('; ') || ''}`));
      const table = document.createElement('table'); table.className = 'comparison-table';
      for (const [label, a, b] of [
        ['Recorded metric', 'A', 'B'],
        ['Delivery success', ...['a', 'b'].map(key => entry.metrics[key].successRate === null ? '—' : `${number(entry.metrics[key].successRate * 100)}% (${entry.metrics[key].deliveries}/${entry.metrics[key].plannedTasks})`)],
        ['Avg successful delivery', ...['a', 'b'].map(key => time(entry.metrics[key].averageDeliveryTime))],
        ['Travel cost', ...['a', 'b'].map(key => number(entry.metrics[key].travelCost))],
        ['Exploration coverage', ...['a', 'b'].map(key => entry.metrics[key].explorationCoverage === null ? '—' : `${number(entry.metrics[key].explorationCoverage * 100)}%`)],
        ['Meaningful replans', ...['a', 'b'].map(key => number(entry.metrics[key].replans))],
      ]) { const row = document.createElement('tr'); for (const value of [label, a, b]) { const cell = document.createElement(label === 'Recorded metric' ? 'th' : 'td'); cell.textContent = value; row.append(cell); } table.append(row); }
      item.append(table);
      const buttons = document.createElement('div'); buttons.className = 'button-row';
      for (const [label, mode] of [['Inspect A', 'a'], ['Inspect B', 'b'], ['Overlay', 'overlay']]) buttons.append(action(label, () => this.inspectHistory(entry.aId, entry.bId, mode)));
      item.append(buttons); history.append(item);
    }
    const scenarios = document.createElement('details'), scenarioTitle = document.createElement('summary'); scenarioTitle.textContent = `All scenario snapshots (${this.archive.records.length})`; scenarios.append(scenarioTitle); history.append(scenarios);
    for (const record of this.archive.records) {
      const item = document.createElement('p'); item.className = 'section-note';
      item.textContent = `${record.id} ← ${record.parentId || 'root'} · iteration ${record.iteration} · ${record.label} · ${record.result ? `${number(record.result.successRate * 100)}% / ${time(record.result.averageDeliveryTime)}` : 'not evaluated'}${this.archive.selectedId === record.id ? ' · SELECTED' : ''}`;
      item.append(action('Inspect snapshot', () => this.inspectHistory(record.id), !record.conditions)); scenarios.append(item);
    }
  }
}
