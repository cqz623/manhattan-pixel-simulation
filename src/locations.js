import { gridToGeographic } from './coordinates.js';
import { neighbors, positionOf } from './agents/nav.js';
import { findPath } from './agents/pathfinding.js';

/** Two location systems: own global pose and relations derived only from remembered places. */
export function describeAgentLocation(agent, environment) {
  const { x, y } = agent.position;
  const places = [...agent.memory.landmarks.values()].filter(place => place.kind !== 'blocked');
  const depot = places.filter(place => place.kind === 'depot');
  const candidates = depot.length ? depot : places;
  candidates.sort((a, b) => Math.abs(x - a.position.x) + Math.abs(y - a.position.y) - Math.abs(x - b.position.x) - Math.abs(y - b.position.y));
  const reference = candidates[0]; let relative = 'No remembered landmark yet';
  if (reference) {
    const dx = x - reference.position.x, dy = y - reference.position.y, parts = [];
    if (dy) parts.push(`${Math.abs(dy)} ${dy < 0 ? 'north' : 'south'}`);
    if (dx) parts.push(`${Math.abs(dx)} ${dx < 0 ? 'west' : 'east'}`);
    relative = parts.length ? `${parts.join(', ')} cells of ${reference.kind} ${reference.id}` : `At ${reference.kind} ${reference.id}`;
  }
  const index = y * agent.memory.width + x;
  const parkAdjacent = neighbors(index, agent.memory.width, agent.memory.height).some(next => agent.memory.cells[next]?.terrain === 'park');
  return { x, y, row: y, column: x, geographic: gridToGeographic(environment, x, y), relative, parkAdjacent };
}
/** Geometric lower bound vs steps and cost of a least-cost route through observed space. */
export function measureKnownDistance(agent, destinationId) {
  const place = agent.memory.landmarks.get(destinationId);
  if (!place) return { known: false, manhattan: null, steps: null, cost: null };
  const manhattan = Math.abs(agent.position.x - place.position.x) + Math.abs(agent.position.y - place.position.y);
  const here = agent.position.y * agent.memory.width + agent.position.x;
  const path = findPath(agent.memory, here, place.index, { type: agent.type });
  return { known: true, manhattan, steps: path ? path.route.length - 1 : null, cost: path?.cost ?? null, target: positionOf(place.index, agent.memory.width) };
}
