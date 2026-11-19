import { AgentSimulation, STEP } from './agents/simulation.js';
import { environmentChanges } from './design.js';
import { placeIdentity } from './coordinates.js';
import { areaIndices } from './regions.js';
import { captureSpatialState } from './spatial-comparison.js';
import { DEFAULT_CROWD_COST } from './terrain.js';

export function createExperimentPlan(environment, options = {}) {
  const staging = structuredClone(environment);
  if (!staging.simulation) staging.simulation = { activeArea: { x: 0, y: 0, width: staging.grid.width, height: staging.grid.height }, agentMode: 'visitor-courier', taskBudget: 4 };
  const probe = new AgentSimulation(staging, options);
  const jobs = probe.world.dispatch();
  if (!jobs.some(job => job.kind === 'destination')) throw new Error('Add a delivery destination before capturing A.');
  const starts = probe.agents.map(agent => ({ id: agent.id, type: agent.type, index: probe.world.index(agent.position), heading: agent.heading, assignments: agent.assignments ? structuredClone(agent.assignments) : null, pickupId: agent.pickupId, batteryEnabled: agent.batteryEnabled }));
  if (!starts.some(start => start.type === 'courier')) throw new Error('A comparison needs at least one courier on valid start cells.');
  const requiredIds = new Set(starts.flatMap(start => [start.pickupId, ...(start.assignments || []).map(job => job.id)]).filter(Boolean));
  const requiredCells = [...areaIndices(probe.world.area, probe.world.width)].filter(index => {
    const kind = environment.layers.semantic[index]; return kind && requiredIds.has(placeIdentity(kind, index, probe.world.width));
  });
  if (starts.filter(start => start.type === 'courier').some(start => !start.pickupId || !start.assignments?.length)) throw new Error('The active area needs a depot and a nonempty fixed delivery workload.');
  return { width: probe.world.width, height: probe.world.height, area: { ...probe.world.area }, seed: probe.seed, radius: probe.vision.radius, useLandmarks: probe.useLandmarks, taskLimit: probe.taskLimit, starts, jobs, requiredCells };
}

export class FixedEnvironmentRun {
  constructor(environment, plan, seconds = 480) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw new Error('Run duration must be greater than zero and at most 86,400 simulated seconds.');
    this.environment = structuredClone(environment); this.plan = structuredClone(plan);
    this.simulation = new AgentSimulation(this.environment, { initialPlan: this.plan });
    this.initialConditions = {
      seed: this.simulation.seed, radius: this.simulation.vision.radius, useLandmarks: this.simulation.useLandmarks,
      agents: this.simulation.agents.map(agent => ({ id: agent.id, type: agent.type, position: { ...agent.position }, heading: agent.heading, assignments: structuredClone(agent.assignments), pickupId: agent.pickupId, knownCells: agent.memory.known, batteryEnabled: agent.batteryEnabled })),
      pedestrians: this.simulation.pedestrians.map(person => ({ id: person.id, origin: person.origin, position: { ...person.position } })),
    };
    this.ticks = Math.max(1, Math.round(seconds / STEP)); this.done = false;
    this.simulation.maxTicks = this.ticks;
    this.changedCells = [];
  }
  advance(batch = 30) {
    for (let n = 0; n < batch && this.simulation.tick < this.ticks; n++) this.simulation.step();
    this.done = this.simulation.tick >= this.ticks; return this.done;
  }
  result() {
    const changes = new Set(this.changedCells);
    return { ...this.simulation.summary(), complete: this.done, seconds: this.ticks * STEP,
      initialConditions: structuredClone(this.initialConditions), defaultCrowdBaseCost: DEFAULT_CROWD_COST,
      spatial: captureSpatialState(this.simulation),
      treatmentVisits: changes.size ? this.changedCells.reduce((sum, index) => sum + this.simulation.visits[index], 0) : null,
      courierTreatmentVisits: changes.size ? this.simulation.agents.filter(agent => agent.type === 'courier').reduce((sum, agent) => sum + agent.trail.slice(1).filter(sample => changes.has(sample.index)).length, 0) : null,
      treatmentObservers: changes.size ? this.simulation.agents.filter(agent => this.changedCells.some(index => agent.memory.cells[index])).length : null,
      trips: this.simulation.agents.filter(agent => agent.type === 'courier').flatMap(agent => agent.trips.map(trip => ({ agentId: agent.id, ...trip }))) };
  }
}

export class EnvironmentComparison {
  constructor(environment, options = {}) {
    this.a = structuredClone(environment); this.options = { seconds: 480, ...options };
    this.plan = createExperimentPlan(this.a, this.options); this.resultA = null; this.resultB = null; this.b = null;
  }
  /** Revisit evidence or carry a selected measurement forward without regenerating starts/jobs. */
  static fromRecords(a, b = null) {
    if (!a?.conditions?.plan) throw new Error('This scenario has no recorded experimental conditions.');
    const study = Object.create(EnvironmentComparison.prototype);
    study.a = structuredClone(a.environment); study.b = b ? structuredClone(b.environment) : null;
    study.options = { seconds: a.conditions.seconds }; study.plan = structuredClone(a.conditions.plan);
    study.resultA = structuredClone(a.result); study.resultB = structuredClone(b?.result || null);
    return study;
  }
  runA() { return new FixedEnvironmentRun(this.a, this.plan, this.options.seconds); }
  duplicateB() { this.b = structuredClone(this.a); this.b.name = `${this.a.name.slice(0, 70)} · B`; this.resultB = null; return structuredClone(this.b); }
  runB(environment) { this.b = structuredClone(environment); const run = new FixedEnvironmentRun(this.b, this.plan, this.options.seconds); run.changedCells = environmentChanges(this.a, this.b).cells; return run; }
  changes() { return this.b ? environmentChanges(this.a, this.b) : { cells: [], summary: [] }; }
  preferred() {
    if (!this.resultA || !this.resultB) return null;
    if (this.resultA.initialConditions && this.resultB.initialConditions && JSON.stringify(this.resultA.initialConditions) !== JSON.stringify(this.resultB.initialConditions)) return null;
    if (this.resultA.successRate !== this.resultB.successRate) return this.resultA.successRate > this.resultB.successRate ? 'A' : 'B';
    if (!this.resultA.deliveries || !this.resultB.deliveries) return null;
    if (Math.abs(this.resultA.averageDeliveryTime - this.resultB.averageDeliveryTime) < 1e-9) return 'tie';
    return this.resultA.averageDeliveryTime < this.resultB.averageDeliveryTime ? 'A' : 'B';
  }
}
