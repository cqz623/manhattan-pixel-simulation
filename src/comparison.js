import { AgentSimulation, STEP } from './agents/simulation.js';

export const comparisonCapability = Object.freeze({ available: true, phase: 2 });
/** Matched initial geometry, seed, population and sensing. Two independent memories. */
export class ComparisonExperiment {
  constructor(environment, { seconds = 600, ...options } = {}) {
    this.totalTicks = Math.max(1, Math.round(seconds / STEP)); this.completedTicks = 0;
    this.runs = [true, false].map(useLandmarks => ({ useLandmarks,
      simulation: new AgentSimulation(structuredClone(environment), { ...options, useLandmarks }) }));
  }
  get done() { return this.completedTicks >= this.totalTicks; }
  advance(batch = 30) {
    const steps = Math.min(batch, this.totalTicks - this.completedTicks);
    for (let tick = 0; tick < steps; tick++) for (const run of this.runs) run.simulation.step();
    this.completedTicks += steps;
    return this.done;
  }
  results() {
    return this.runs.map(run => ({ useLandmarks: run.useLandmarks, ...run.simulation.summary(),
      deliverySamples: run.simulation.agents.flatMap(agent => agent.type === 'courier' ? agent.trips.map(trip => ({ ...trip })) : []) }));
  }
}
