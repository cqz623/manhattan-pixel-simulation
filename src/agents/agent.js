import { findPath, findFrontier } from './pathfinding.js';
import { positionOf, neighbors, walkable, traversalCost, PROFILES } from './nav.js';
import { searchRoute, recordPlan, sameRoute } from './planning-metrics.js';

const navigationKey = (agent, desiredId) => `${agent.trip?.number || 0}:${agent.stage}:${agent.job?.id || ''}:${desiredId || 'explore'}`;

/** All choices below depend only on observations, individual memory and task identities. */
export function startTrip(agent, time, useLandmarks) {
  agent.memory.startTrip(useLandmarks);
  agent.trip = {
    number: agent.trips.length + 1, startedAt: time, useLandmarks,
    distance: agent.distance, energy: agent.energy, travelCost: agent.travelCost, known: agent.memory.known,
    discovered: agent.memory.everDiscovered.size, reuse: agent.landmarkReuse, replans: agent.replans,
    obstacles: agent.obstacleEncounters,
  };
  agent.visited.clear(); agent.reusedThisTrip.clear();
  agent.path = []; agent.routeGoal = null;
  agent.stage = agent.type === 'courier' ? 'pickup' : 'tour';
  agent.job = null;
  if (agent.type === 'courier') agent.attempts.push({ number: agent.trip.number, destinationId: agent.assignments?.[agent.trip.number - 1]?.id || null, startedAt: time, completedAt: null });
}
function finishTrip(agent, time, destinationId = null) {
  const trip = agent.trip;
  const record = {
    number: trip.number, type: agent.type, useLandmarks: trip.useLandmarks,
    startedAt: trip.startedAt, completedAt: time, time: +(time - trip.startedAt).toFixed(6),
    distance: agent.distance - trip.distance, energy: agent.energy - trip.energy,
    weightedCost: agent.travelCost - trip.travelCost,
    manhattanDistance: trip.pickupIndex === undefined ? null : Math.abs(agent.position.x - trip.pickupIndex % agent.memory.width) + Math.abs(agent.position.y - Math.floor(trip.pickupIndex / agent.memory.width)),
    exploredCells: agent.memory.known - trip.known,
    landmarksDiscovered: agent.memory.everDiscovered.size - trip.discovered,
    landmarkReuse: agent.landmarkReuse - trip.reuse, replans: agent.replans - trip.replans,
    obstacleEncounters: agent.obstacleEncounters - trip.obstacles,
    destinationId,
  };
  agent.trips.push(record);
  if (agent.type === 'courier') { agent.deliveries++; agent.memory.deliveries.push(record); if (agent.attempts.length) agent.attempts.at(-1).completedAt = time; }
  agent.trip = null; agent.path = []; agent.goal = null; agent.pauseUntil = time + .6;
  agent.status = agent.type === 'courier' ? 'Delivered parcel' : 'Tour completed';
}
function nearest(agent, landmarks, here) {
  const origin = positionOf(here, agent.memory.width);
  const estimate = landmark => {
    const key = [agent.memory.lastLandmark, landmark.id].sort().join('|');
    return agent.trip.useLandmarks && agent.memory.connections.has(key) ? agent.memory.connections.get(key) : Math.abs(origin.x - landmark.position.x) + Math.abs(origin.y - landmark.position.y);
  };
  return [...landmarks].sort((a, b) => estimate(a) - estimate(b) || a.id.localeCompare(b.id))[0] || null;
}
function desiredLandmark(agent, here, useLandmarks) {
  const known = [...agent.memory.landmarks.values()];
  if (agent.type === 'explorer') {
    if (agent.explorationAnchor) return agent.memory.landmarks.get(agent.explorationAnchor.id) || null;
    // A discovered orientation landmark is a real exploration goal. Its location
    // comes only from memory; visiting it can change subsequent local scanning.
    return useLandmarks ? nearest(agent, known.filter(place => place.kind === 'landmark' && !agent.visited.has(place.id)), here) : null;
  }
  if (agent.type === 'courier') {
    if (agent.batteryEnabled && agent.battery < agent.capacity * .35) {
      const charger = nearest(agent, known.filter(place => place.kind === 'charger'), here);
      if (charger) return charger;
    }
    if (agent.stage === 'pickup') return nearest(agent, known.filter(place => place.kind === 'depot' && (!agent.pickupId || place.id === agent.pickupId)), here);
    return agent.memory.landmarks.get(agent.job?.id) || null;
  }
  const targets = new Set(agent.jobs.filter(job => !agent.visited.has(job.id)).map(job => job.id));
  if (!targets.size && agent.jobs.length) return { id: 'home', kind: 'home', index: agent.home, position: positionOf(agent.home, agent.memory.width), foundAt: 0 };
  return nearest(agent, known.filter(place => targets.has(place.id)), here);
}
function arrive(agent, landmark, here, time) {
  if (!landmark || here !== landmark.index) return false;
  agent.path = []; agent.routeGoal = null;
  if (landmark.kind === 'charger' && agent.type === 'courier' && agent.batteryEnabled) {
    agent.battery = Math.min(agent.capacity, agent.battery + 24); agent.pauseUntil = time + .2;
    agent.status = 'Recharging at discovered charger';
    // Stay until full, even when the low-battery threshold is crossed.
    agent.charging = agent.battery < agent.capacity;
    return true;
  }
  if (agent.type === 'explorer') {
    agent.visited.add(landmark.id);
    agent.explorationAnchor = null; agent.completedVisits++; agent.heading += Math.PI / 2; agent.pauseUntil = time + .2;
    agent.status = 'Scanning from a remembered landmark'; return true;
  }
  if (agent.type === 'visitor') {
    if (landmark.kind === 'home') { finishTrip(agent, time); return true; }
    if (!agent.visited.has(landmark.id)) {
      agent.visited.add(landmark.id); agent.completedVisits++; agent.pauseUntil = time + .4;
      agent.status = `Visited ${landmark.id}`;
    }
    return true;
  }
  if (agent.stage === 'pickup' && landmark.kind === 'depot') {
    agent.trip.pickupIndex = here;
    const destinations = agent.jobs.filter(job => job.kind === 'destination');
    if (!destinations.length) { agent.status = 'Place a delivery destination'; return true; }
    agent.job = agent.assignments?.[agent.deliveries] || destinations[(agent.assignmentOffset + agent.deliveries) % destinations.length];
    if (agent.attempts.length) agent.attempts.at(-1).destinationId = agent.job.id;
    agent.stage = 'deliver'; agent.pauseUntil = time + .4; agent.status = `Collected parcel for ${agent.job.id}`;
    return true;
  }
  if (agent.stage === 'deliver' && landmark.id === agent.job?.id) { finishTrip(agent, time, landmark.id); return true; }
  return false;
}

export function think(agent, observation, { time, dt, useLandmarks }) {
  const memory = agent.memory, here = agent.position.y * memory.width + agent.position.x;
  const finished = agent.type === 'courier' && agent.taskLimit !== null && agent.deliveries >= agent.taskLimit;
  if (!agent.trip && !finished && time >= agent.pauseUntil) startTrip(agent, time, useLandmarks);
  const updates = memory.observe(observation, time);
  const rememberedPlan = [...agent.path, ...agent.invalidatedPath];
  if (rememberedPlan.some(index => updates.terrainChanged.has(index) && !walkable(memory.cells[index]))) agent.obstacleEncounters++;
  agent.invalidatedPath = [];
  agent.visible = observation.visible; agent.seenOccupants = observation.occupants;
  const occupied = new Set(observation.occupants.map(other => other.position.y * memory.width + other.position.x));
  if (finished) {
    agent.status = `Workload complete · ${agent.deliveries}/${agent.taskLimit} deliveries`;
    const nearby = observation.occupants.some(other => Math.abs(other.position.x - agent.position.x) + Math.abs(other.position.y - agent.position.y) <= 2);
    if (!memory.cells[here]?.semantic && !nearby) return null;
    const options = neighbors(here, memory.width, memory.height).filter(index => walkable(memory.cells[index]) && !occupied.has(index));
    const clearance = index => observation.occupants.reduce((distance, other) => Math.min(distance, Math.abs(index % memory.width - other.position.x) + Math.abs(Math.floor(index / memory.width) - other.position.y)), 100);
    options.sort((a, b) => Number(!!memory.cells[a]?.semantic) - Number(!!memory.cells[b]?.semantic) || clearance(b) - clearance(a) || a - b);
    if (!options.length) return null;
    agent.path = [options[0]]; agent.credit = Math.min(1.5, agent.credit + dt * PROFILES[agent.type].speed / traversalCost(memory.cells[options[0]], agent.type));
    agent.status += ' · yielding access'; return agent.credit >= 1 ? options[0] : null;
  }
  if (!agent.trip || time < agent.pauseUntil) return null;
  if (agent.charging) {
    const charger = [...memory.landmarks.values()].find(place => place.kind === 'charger' && place.index === here);
    if (charger) { arrive(agent, charger, here, time); return null; }
    agent.charging = false;
  }
  const desired = desiredLandmark(agent, here, useLandmarks);
  if (arrive(agent, desired, here, time)) return null;
  if (agent.type === 'courier' && agent.batteryEnabled && agent.battery <= 0) { agent.status = 'Battery empty · reset or place a charger here'; return null; }
  const desiredId = desired?.id || null;
  const goalKey = navigationKey(agent, desiredId), previousRoute = [...agent.path];
  const invalid = agent.path.some(index => !walkable(memory.cells[index]));
  const goalChanged = agent.navigationKey !== null && goalKey !== agent.navigationKey;
  const routeCostChanged = agent.path.some(index => updates.terrainChanged.has(index));
  const reason = invalid ? 'obstacle' : goalChanged ? 'goal' : routeCostChanged ? 'information' : null;
  if (invalid || goalChanged || routeCostChanged) agent.path = [];
  // New observed space can reveal a cheaper route to an ongoing known target.
  // The comparison is entirely between routes in memory, never hidden geometry.
  if (agent.path.length && agent.goal && (updates.newTraversable.size || updates.terrainChanged.size)) {
    const candidate = searchRoute(agent, () => findPath(memory, here, agent.goal.index, { type: agent.type, blocked: occupied }));
    const currentCost = agent.path.reduce((sum, index) => sum + traversalCost(memory.cells[index], agent.type), 0);
    if (candidate && !sameRoute(agent.path, candidate.route.slice(1)) && candidate.cost + 1e-8 < currentCost) {
      recordPlan(agent, { previous: agent.path, next: candidate.route.slice(1), reason: 'information', time, goalKey, observed: [...updates.newTraversable, ...updates.terrainChanged] });
      agent.path = candidate.route.slice(1);
    } else if (candidate && sameRoute(agent.path, candidate.route.slice(1))) agent.planning.unchangedRoutes++;
  }
  if (!agent.path.length) {
    agent.intendedGoal = desiredId;
    agent.plans++;
    let plannedGoalKey = goalKey;
    let plan = desired ? searchRoute(agent, () => findPath(memory, here, desired.index, { type: agent.type, blocked: occupied })) : null;
    if (plan) {
      agent.routeGoal = desiredId; agent.goal = { id: desiredId, kind: desired.kind, index: desired.index };
      if (agent.trip.useLandmarks && agent.trip.number > 1 && desired.foundAt < agent.trip.startedAt && !agent.reusedThisTrip.has(desiredId)) {
        agent.landmarkReuse++; agent.reusedThisTrip.add(desiredId);
      }
      agent.status = `Going to ${desired.kind} ${desiredId}`;
    } else {
      plan = searchRoute(agent, () => findFrontier(memory, here, { type: agent.type, blocked: occupied }));
      agent.routeGoal = null; agent.goal = plan ? { kind: 'frontier', index: plan.route.at(-1) } : null;
      agent.status = desired ? `Exploring a route to ${desiredId}` : agent.type === 'courier' ? `Searching for ${agent.stage === 'pickup' ? 'a depot' : agent.job?.id || 'a destination'}` : agent.type === 'explorer' ? 'Exploring unknown cells and landmarks' : 'Exploring assigned places';
      if (agent.type === 'explorer' && useLandmarks && plan) {
        const anchor = [...memory.landmarks.values()].find(place => place.kind !== 'blocked' && place.visits > 0 && time - (agent.anchorTimes.get(place.id) ?? -Infinity) > 20 && plan.route.indexOf(place.index) > 0 && plan.route.indexOf(place.index) < plan.route.length - 1);
        if (anchor) {
          plan = { ...plan, route: plan.route.slice(0, plan.route.indexOf(anchor.index) + 1) };
          agent.explorationAnchor = anchor; agent.anchorTimes.set(anchor.id, time); agent.landmarkReuse++;
          agent.goal = { id: anchor.id, kind: 'memory anchor', index: anchor.index }; agent.intendedGoal = anchor.id; agent.routeGoal = anchor.id;
          plannedGoalKey = navigationKey(agent, anchor.id);
          agent.status = 'Using a visited landmark to orient exploration';
        }
      }
    }
    agent.path = plan ? plan.route.slice(1) : [];
    recordPlan(agent, { previous: previousRoute, next: agent.path, reason, time, goalKey: plannedGoalKey, observed: [...updates.terrainChanged] });
    if (!agent.path.length) {
      agent.heading = (agent.heading + Math.PI / 2) % (Math.PI * 2);
      agent.status = 'Scanning · no reachable frontier'; agent.pauseUntil = time + .4;
      agent.wait += dt;
      // Closed regions stay explicit; no teleportation or knowledge injected to escape them.
      if (agent.wait > 8) agent.status = 'Isolated or exhausted search · edit environment to continue';
      return null;
    }
  }
  let next = agent.path[0];
  if (occupied.has(next)) {
    agent.wait += dt; agent.status = 'Yielding to visible occupant';
    const threshold = .8 + (Number(agent.id.split('-')[1]) % 3) * .2;
    if (agent.wait >= threshold) {
      const alternatives = neighbors(here, memory.width, memory.height).filter(index => walkable(memory.cells[index]) && !occupied.has(index));
      const previous = agent.trail.at(-2)?.index;
      alternatives.sort((a, b) => Number(a === previous) - Number(b === previous) || a - b);
      const previousRoute = [...agent.path];
      agent.path = []; agent.recoveries++;
      if (alternatives.length) { next = alternatives[(agent.recoveries + Number(agent.id.split('-')[1])) % alternatives.length]; agent.path = [next]; agent.status = 'Recovery · deterministic sidestep'; }
      recordPlan(agent, { previous: previousRoute, next: agent.path, reason: 'occupancy', time });
      if (!alternatives.length) return null;
    } else return null;
  }
  const target = positionOf(next, memory.width);
  agent.heading = Math.atan2(target.y - agent.position.y, target.x - agent.position.x);
  agent.credit = Math.min(1.5, agent.credit + dt * PROFILES[agent.type].speed / traversalCost(memory.cells[next], agent.type));
  return agent.credit >= 1 ? next : null;
}

export function moved(agent, index, time, energy, travelCost = 1) {
  agent.position = positionOf(index, agent.memory.width); agent.path.shift();
  agent.credit = Math.max(0, agent.credit - 1); agent.wait = 0;
  agent.distance++; agent.energy += energy; agent.travelCost += travelCost;
  if (agent.type === 'courier' && agent.batteryEnabled) agent.battery = Math.max(0, agent.battery - energy);
  const sample = { index, time, trip: agent.trip?.number ?? null }; agent.trail.push(sample);
  agent.memory.recordPosition(index, agent.distance, time);
}
