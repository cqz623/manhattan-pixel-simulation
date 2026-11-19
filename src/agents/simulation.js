import { GridWorld } from './world.js';
import { perceive, VISION } from './perception.js';
import { createSpatialAgent } from './state.js';
import { think, moved } from './agent.js';
import { seededRandom, neighbors, positionOf, energyCost } from './nav.js';
import { sameTerrainState } from '../terrain.js';
import { terrainCost } from '../terrain.js';
import { areaIndices } from '../regions.js';
import { recordPlan, REPLAN_REASONS } from './planning-metrics.js';

export const STEP = .2;
export const LIMITS = Object.freeze({ min: 2, max: 10 });

export class AgentSimulation {
  constructor(environment, { count = 2, seed = 1, useLandmarks = true, radius = 6, initialPlan = null } = {}) {
    if (initialPlan) { count = initialPlan.starts.length; seed = initialPlan.seed; radius = initialPlan.radius; useLandmarks = initialPlan.useLandmarks; }
    this.world = new GridWorld(environment); this.seed = seed >>> 0; this.random = seededRandom(this.seed);
    this.initialPlan = initialPlan; this.taskLimit = initialPlan?.taskLimit ?? environment.simulation?.taskBudget ?? null;
    if (initialPlan && (initialPlan.width !== this.world.width || initialPlan.height !== this.world.height || ['x', 'y', 'width', 'height'].some(key => initialPlan.area[key] !== this.world.area[key]))) throw new Error('Comparison grid or active area differs from A.');
    this.useLandmarks = useLandmarks; this.vision = { ...VISION, radius };
    this.agents = []; this.retiredAgents = []; this.pedestrians = []; this.tick = 0; this.pending = 0; this.nextAgent = 1;
    this.visits = new Uint32Array(this.world.width * this.world.height);
    this.maxVisitCount = 0;
    this.syncPedestrians(); this.setCount(count);
  }
  get time() { return +(this.tick * STEP).toFixed(6); }
  get environment() { return this.world.environment; }
  syncPedestrians() {
    const previous = new Map(this.pedestrians.map(pedestrian => [pedestrian.origin, pedestrian]));
    const occupied = new Set(this.agents.map(agent => this.world.index(agent.position)));
    this.pedestrians = this.world.placements('pedestrian').flatMap(origin => {
      const existing = previous.get(origin);
      const index = existing ? this.world.index(existing.position) : origin;
      if (!this.world.canStand(index) || occupied.has(index)) return [];
      occupied.add(index);
      return [existing || { id: `P-${origin}`, type: 'pedestrian', origin, position: positionOf(index, this.world.width), random: seededRandom(this.seed ^ Math.imul(origin + 1, 2654435761)) }];
    });
  }
  setCount(count) {
    const wanted = Math.max(2, Math.min(10, Math.round(Number(count) || 2)));
    while (this.agents.length > wanted) this.retiredAgents.push(this.agents.pop());
    const occupied = new Set(this.occupants().map(item => this.world.index(item.position)));
    const candidates = this.world.spawnCells();
    while (this.agents.length < wanted) {
      const specified = this.initialPlan?.starts[this.agents.length];
      if (this.initialPlan && !specified) break;
      const index = specified?.index ?? candidates.find(cell => !occupied.has(cell)); if (index === undefined) break;
      if (specified && (!this.world.canStand(index) || occupied.has(index))) throw new Error(`Fixed start for ${specified.id} is blocked in this environment. Restore that cell before comparing.`);
      const serial = this.nextAgent++, type = specified?.type || (serial % 2 ? this.environment.simulation?.agentMode === 'explorer-courier' ? 'explorer' : 'visitor' : 'courier');
      const jobs = this.initialPlan?.jobs || this.world.dispatch();
      const destinations = jobs.filter(job => job.kind === 'destination');
      const assignments = specified?.assignments || (this.taskLimit !== null ? Array.from({ length: this.taskLimit }, (_, n) => destinations.length ? destinations[(this.seed + serial + n) % destinations.length] : null).filter(Boolean) : null);
      const depot = [...areaIndices(this.world.area, this.world.width)].filter(at => this.environment.layers.semantic[at] === 'depot' && this.world.canStand(at))
        .sort((a, b) => Math.abs(a % this.world.width - index % this.world.width) + Math.abs(Math.floor(a / this.world.width) - Math.floor(index / this.world.width)) - Math.abs(b % this.world.width - index % this.world.width) - Math.abs(Math.floor(b / this.world.width) - Math.floor(index / this.world.width)))[0];
      const pickupId = specified?.pickupId ?? (this.taskLimit !== null && depot !== undefined ? this.world.placeIds.get(`depot:${depot}`) : null);
      const agent = createSpatialAgent({ id: specified?.id || `${type === 'courier' ? 'C' : type === 'explorer' ? 'E' : 'V'}-${serial}`, type, index, width: this.world.width, height: this.world.height,
        heading: specified?.heading ?? Math.floor(this.random() * 4) * Math.PI / 2, jobs, assignmentOffset: (this.seed + serial) >>> 0, area: this.world.area, taskLimit: this.taskLimit, assignments, pickupId, batteryEnabled: specified?.batteryEnabled ?? this.environment.simulation?.agentMode !== 'explorer-courier' });
      this.agents.push(agent); occupied.add(index);
    }
    this.world.occupants = this.occupants(); return this.agents.length;
  }
  occupants() { return [...this.agents, ...this.pedestrians]; }
  syncEnvironment(environment) {
    if (environment.grid.width !== this.world.width || environment.grid.height !== this.world.height) throw new Error('Grid size changed: reset the simulation.');
    this.world.sync(environment); this.syncPedestrians();
    // No edit notification reaches the planner. Routes, remembered costs and
    // assigned identities persist until sensing or an actual failed move.
  }
  step() {
    if (this.maxTicks && this.tick >= this.maxTicks) return;
    this.tick++;
    this.world.occupants = this.occupants();
    if (this.tick % 5 === 0) {
      const occupied = new Set(this.occupants().map(item => this.world.index(item.position)));
      for (const pedestrian of this.pedestrians) {
        const from = this.world.index(pedestrian.position), options = neighbors(from, this.world.width, this.world.height);
        const offset = Math.floor(pedestrian.random() * options.length);
        for (let n = 0; n < options.length; n++) {
          const to = options[(n + offset) % options.length];
          if (!this.world.canMove(from, to, occupied)) continue;
          occupied.delete(from); occupied.add(to); pedestrian.position = positionOf(to, this.world.width); break;
        }
      }
    }
    // Rotate update priority deterministically. Collision checking never chooses a route.
    const ordered = this.agents.length ? [...this.agents.slice(this.tick % this.agents.length), ...this.agents.slice(0, this.tick % this.agents.length)] : [];
    for (const agent of ordered) {
      const observation = perceive(this.world, agent, this.occupants(), this.vision);
      const next = think(agent, observation, { time: this.time, dt: STEP, useLandmarks: this.useLandmarks });
      if (next === null) continue;
      const occupied = new Set(this.occupants().filter(other => other !== agent).map(item => this.world.index(item.position)));
      const from = this.world.index(agent.position);
      if (this.world.canMove(from, next, occupied)) {
        const actualCell = this.world.cell(next, this.occupants().filter(other => other !== agent));
        moved(agent, next, this.time, energyCost(actualCell, agent.type), terrainCost(actualCell, agent.type)); this.visits[next]++; this.maxVisitCount = Math.max(this.maxVisitCount, this.visits[next]);
      } else { agent.wait += STEP; agent.obstacleEncounters++; recordPlan(agent, { previous: agent.path, next: [], reason: 'blocked', time: this.time }); agent.path = []; agent.status = 'Move blocked · observing again'; }
    }
  }
  advance(milliseconds) {
    this.pending += Math.max(0, Math.min(1000, milliseconds));
    let steps = 0;
    while (this.pending >= STEP * 1000 - 1e-8 && steps < 80) { this.pending -= STEP * 1000; this.step(); steps++; }
    return steps;
  }
  sharedKnowledge() {
    const counts = new Uint8Array(this.visits.length);
    for (const index of areaIndices(this.world.area, this.world.width)) {
      const current = this.world.cell(index);
      for (const agent of this.agents) {
        const remembered = agent.memory.cells[index];
        if (sameTerrainState(remembered, current)) counts[index]++;
      }
    }
    return counts;
  }
  landmarkHeat() {
    const entries = new Map();
    for (const agent of this.agents) for (const landmark of agent.memory.landmarks.values()) {
      if (['intersection', 'blocked'].includes(landmark.kind)) continue;
      if (!entries.has(landmark.id)) entries.set(landmark.id, { ...landmark, holders: new Set() });
      entries.get(landmark.id).holders.add(agent.id);
    }
    return [...entries.values()].map(({ holders, ...landmark }) => ({ ...landmark, count: holders.size, total: this.agents.length }));
  }
  summary() {
    const participants = [...this.agents, ...this.retiredAgents];
    const trips = participants.flatMap(agent => agent.trips), deliveries = trips.filter(trip => trip.type === 'courier');
    const seen = new Uint8Array(this.visits.length), explorerSeen = new Set(), explorerPlaces = new Set(), knownLandmarks = new Set(); let explored = 0;
    for (const agent of participants) {
      for (const index of areaIndices(agent.memory.area, this.world.width)) if (agent.memory.cells[index] && !seen[index]) { seen[index] = 1; explored++; }
      for (const id of agent.memory.everDiscovered) knownLandmarks.add(id);
      if (agent.type === 'explorer') {
        for (const index of areaIndices(agent.memory.area, this.world.width)) if (agent.memory.cells[index]) explorerSeen.add(index);
        for (const id of agent.memory.everDiscovered) explorerPlaces.add(id);
      }
    }
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const couriers = participants.filter(agent => agent.type === 'courier');
    const plannedTasks = couriers.reduce((sum, agent) => sum + (agent.taskLimit ?? agent.attempts.length), 0);
    const explorers = participants.filter(agent => agent.type === 'explorer');
    return {
      time: this.time, agents: this.agents.length, deliveries: deliveries.length, tours: trips.length - deliveries.length,
      visits: participants.reduce((sum, agent) => sum + agent.completedVisits, 0),
      firstDelivery: average(deliveries.filter(trip => trip.number === 1).map(trip => trip.time)),
      laterDelivery: average(deliveries.filter(trip => trip.number > 1).map(trip => trip.time)),
      distance: participants.reduce((sum, agent) => sum + agent.distance, 0), energy: participants.reduce((sum, agent) => sum + agent.energy, 0),
      explored, landmarks: knownLandmarks.size,
      reuse: participants.reduce((sum, agent) => sum + agent.landmarkReuse, 0), replans: participants.reduce((sum, agent) => sum + agent.replans, 0),
      replanMetricVersion: 2,
      replanReasons: Object.fromEntries(REPLAN_REASONS.map(reason => [reason, participants.reduce((sum, agent) => sum + agent.planning.reasons[reason], 0)])),
      planningComputations: participants.reduce((sum, agent) => sum + agent.planning.computations, 0),
      initialPlans: participants.reduce((sum, agent) => sum + agent.planning.initialPlans, 0),
      routinePlans: participants.reduce((sum, agent) => sum + agent.planning.routinePlans, 0),
      unsuccessfulSearches: participants.reduce((sum, agent) => sum + agent.planning.unsuccessfulSearches, 0),
      unchangedRoutes: participants.reduce((sum, agent) => sum + agent.planning.unchangedRoutes, 0),
      obstacles: participants.reduce((sum, agent) => sum + agent.obstacleEncounters, 0),
      averageDeliveryTime: average(deliveries.map(trip => trip.time)), successRate: plannedTasks ? deliveries.length / plannedTasks : null,
      averageRouteLength: average(deliveries.map(trip => trip.distance)), plannedTasks,
      averageTravelCost: average(deliveries.map(trip => trip.weightedCost)),
      averageManhattan: average(deliveries.map(trip => trip.manhattanDistance).filter(value => value !== null)),
      travelCost: participants.reduce((sum, agent) => sum + agent.travelCost, 0),
      explorers: explorers.length, explorerCoverage: explorers.length ? explorerSeen.size / (this.world.area.width * this.world.area.height) : null,
      explorerLandmarks: explorerPlaces.size, explorerCost: explorers.reduce((sum, agent) => sum + agent.travelCost, 0),
      attemptedTasks: couriers.reduce((sum, agent) => sum + agent.attempts.length, 0), incompleteTasks: Math.max(0, plannedTasks - deliveries.length),
      activeCells: this.world.area.width * this.world.area.height, explorationCoverage: explored / (this.world.area.width * this.world.area.height),
    };
  }
}
