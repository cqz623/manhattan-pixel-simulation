import { SpatialMemory } from './memory.js';
import { positionOf } from './nav.js';
import { createPlanningDiagnostics } from './planning-metrics.js';

/** Runtime state remains separate from scenario terrain and authoring placements. */
export function createAgentState(id, position, strategy = null) {
  return { id, position: { ...position }, strategy, status: 'idle', goal: null, path: [] };
}
export function createSpatialAgent({ id, type, index, width, height, heading = 0, jobs = [], assignmentOffset = 0, area = null, taskLimit = null, assignments = null, pickupId = null, batteryEnabled = true }) {
  return {
    id, type, position: positionOf(index, width), heading, home: index,
    memory: new SpatialMemory(width, height, area), visible: new Set(), seenOccupants: [],
    path: [], routeGoal: null, intendedGoal: null, goal: null, status: 'Ready to perceive', jobs, assignmentOffset,
    stage: type === 'courier' ? 'pickup' : 'tour', job: null, visited: new Set(),
    trip: null, trips: [], completedVisits: 0, deliveries: 0,
    distance: 0, energy: 0, travelCost: 0, battery: 240, capacity: 240,
    trail: [{ index, time: 0 }], credit: 0, wait: 0, pauseUntil: 0,
    plans: 0, replans: 0, landmarkReuse: 0, reusedThisTrip: new Set(),
    planning: createPlanningDiagnostics(), replanEvents: [], navigationKey: null,
    recoveries: 0, recoveryUntil: 0,
    obstacleEncounters: 0, invalidatedPath: [],
    taskLimit, assignments, pickupId, batteryEnabled, attempts: [], explorationAnchor: null, anchorTimes: new Map(),
  };
}
export function getAgentPlacements(environment) {
  return environment.layers.dynamic.flatMap((type, index) => type ? [{
    id: `${type}-${index}`, type, position: { x: index % environment.grid.width, y: Math.floor(index / environment.grid.width) },
  }] : []);
}
