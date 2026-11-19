import { environmentChanges } from './design.js';

/** Session scenario archive. Evaluated snapshots cannot be overwritten by later edits. */
export class ScenarioArchive {
  constructor() { this.records = []; this.serial = 0; this.selectedId = null; this.iterations = []; }
  get(id) { return this.records.find(record => record.id === id) || null; }
  add(environment, { parentId = null, iteration = 0, label = environment.name, changes = null, generationSeed = null, conditions = null } = {}) {
    if (parentId && !this.get(parentId)) throw new Error('Unknown scenario parent.');
    const record = { id: `S${String(++this.serial).padStart(3, '0')}`, parentId, iteration, label, createdAt: new Date().toISOString(), environment: structuredClone(environment), changes: structuredClone(changes), generationSeed, result: null, conditions: structuredClone(conditions) };
    this.records.push(record); return record;
  }
  updateDraft(id, environment, changes) {
    const record = this.get(id); if (!record || record.result) throw new Error('Evaluated snapshots are immutable; create a child scenario.');
    record.environment = structuredClone(environment); record.changes = structuredClone(changes); return record;
  }
  recordResult(id, result, plan) {
    const record = this.get(id); if (!record) throw new Error('Unknown scenario.');
    if (!result.complete) throw new Error('Incomplete studies cannot be recorded as results.');
    if (record.conditions && (JSON.stringify(record.conditions.plan) !== JSON.stringify(plan) || record.conditions.seconds !== result.seconds)) throw new Error('Result conditions differ from the saved scenario conditions.');
    if (record.result) {
      if (JSON.stringify(record.result) !== JSON.stringify(result)) throw new Error('Evaluated results are immutable; create a new scenario for different measurements.');
      return; // An exact replay verifies the measurement without replacing it.
    }
    record.result = structuredClone(result); record.conditions = { plan: structuredClone(plan), seconds: result.seconds, initialKnowledge: 'empty', stepSeconds: .2 };
  }
  select(id) { const record = this.get(id); if (!record) throw new Error('Unknown scenario.'); this.selectedId = id; return structuredClone(record.environment); }
  completeIteration(aId, bId, selectedId, { parentIterationId = null, currentId = null } = {}) {
    const a = this.get(aId), b = this.get(bId);
    if (!a?.result?.complete || !b?.result?.complete) throw new Error('Complete both A and B before selecting an environment.');
    if (![aId, bId].includes(selectedId)) throw new Error('Select A or B from this comparison.');
    if (JSON.stringify(a.conditions) !== JSON.stringify(b.conditions) || JSON.stringify(a.result.initialConditions) !== JSON.stringify(b.result.initialConditions)) throw new Error('Selection requires matched initial conditions.');
    let entry = this.iterations.find(item => item.id === currentId && !item.closed && item.aId === aId && item.bId === bId);
    if (!entry) {
      this.closeIteration(currentId);
      const metrics = result => Object.fromEntries(['successRate', 'deliveries', 'plannedTasks', 'averageDeliveryTime', 'travelCost', 'explorationCoverage', 'explorerCoverage', 'replans'].map(key => [key, result[key] ?? null]));
      entry = { id: `I${String(this.iterations.length + 1).padStart(3, '0')}`, number: this.iterations.length + 1, parentIterationId, parentEnvironmentId: a.parentId, aId, bId, changes: environmentChanges(a.environment, b.environment), conditions: structuredClone(a.conditions), metrics: { a: metrics(a.result), b: metrics(b.result) }, selectedId, completedAt: new Date().toISOString(), closed: false };
      this.iterations.push(entry);
    }
    entry.selectedId = selectedId;
    this.select(selectedId); return entry;
  }
  closeIteration(id) { const entry = this.iterations.find(item => item.id === id); if (entry) entry.closed = true; }
  nextBaseline(iterationId) {
    const entry = this.iterations.find(item => item.id === iterationId);
    if (!entry) throw new Error('Select a measured A or B before starting the next iteration.');
    const selected = this.get(entry.selectedId);
    const baseline = this.add(selected.environment, { parentId: selected.id, iteration: selected.iteration + 1, label: `A · selected ${selected.id}`, conditions: selected.conditions });
    baseline.result = structuredClone(selected.result);
    // These three diagnostics described the previous pair's treatment, not this baseline.
    for (const key of ['treatmentVisits', 'courierTreatmentVisits', 'treatmentObservers']) baseline.result[key] = null;
    baseline.measurementSourceId = selected.id;
    this.closeIteration(iterationId); return baseline;
  }
  export() { return { format: 'pixel-city-study', version: 2, exportedAt: new Date().toISOString(), selectedId: this.selectedId, scenarios: structuredClone(this.records), iterations: structuredClone(this.iterations) }; }
}
