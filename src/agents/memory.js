import { neighbors, positionOf, walkable, cellIndex, insideArea } from './nav.js';
import { sameTerrainState, terrainCost } from '../terrain.js';

export const memoryCapability = Object.freeze({ available: true, phase: 2 });
export class SpatialMemory {
  constructor(width = 64, height = width, area = null) {
    this.width = width; this.height = height;
    this.area = area || { x: 0, y: 0, width, height }; this.total = this.area.width * this.area.height;
    this.cells = Array(width * height).fill(null);
    this.swept = new Uint8Array(width * height);
    this.landmarks = new Map(); this.connections = new Map();
    this.everDiscovered = new Set();
    this.movement = []; this.deliveries = [];
    this.lastLandmark = null; this.lastLandmarkDistance = 0; this.known = 0;
  }
  observe(observation, time) {
    let changed = false, discovered = 0;
    const terrainChanged = new Set(), newTraversable = new Set();
    for (const { index, ...value } of observation.cells) {
      if (!insideArea(index, this.width, this.area)) continue;
      const previous = this.cells[index];
      if (previous && (!sameTerrainState(previous, value) || terrainCost(previous) !== terrainCost(value) || terrainCost(previous, 'visitor') !== terrainCost(value, 'visitor'))) terrainChanged.add(index);
      if (!previous) this.known++;
      if (!previous && walkable(value)) newTraversable.add(index);
      if (!previous || previous.terrain !== value.terrain || previous.closure !== value.closure || previous.semantic !== value.semantic) changed = true;
      this.cells[index] = { ...value, observedAt: time, firstObservedAt: previous?.firstObservedAt ?? time }; this.swept[index] = 1;
      if (previous?.semantic && previous.semantic !== value.semantic) this.landmarks.delete(previous.placeId);
      if (!value.closure && !(value.terrain === 'construction' && !walkable(value))) this.landmarks.delete(`blocked:${index}`);
      if (value.semantic && this.remember(value.semantic, index, time, value.placeId)) discovered++;
      if ((value.closure || (value.terrain === 'construction' && !walkable(value))) && this.remember('blocked', index, time)) discovered++;
    }
    // Intersections are inferred only from neighbors already observed.
    for (const { index } of observation.cells) {
      const adjacent = neighbors(index, this.width, this.height);
      const point = positionOf(index, this.width);
      const arms = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => cellIndex(point.x + dx, point.y + dy, this.width, this.height));
      const roadOpen = next => next >= 0 && this.cells[next]?.terrain === 'road' && !this.cells[next].closure;
      const crossroad = this.cells[index]?.terrain === 'road' && !this.cells[index].closure && adjacent.length === 4 && adjacent.every(roadOpen) && arms.every(roadOpen);
      if (!crossroad) this.landmarks.delete(`intersection:${index}`);
      const nearby = [...this.landmarks.values()].some(item => item.kind === 'intersection' && Math.abs(item.position.x - point.x) + Math.abs(item.position.y - point.y) < 3);
      if (crossroad && !nearby && this.remember('intersection', index, time)) discovered++;
    }
    return { changed, discovered, terrainChanged, newTraversable };
  }
  remember(kind, index, time, placeId = null) {
    const id = placeId || `${kind}:${index}`;
    if (this.landmarks.has(id)) return false;
    this.landmarks.set(id, { id, kind, index, position: positionOf(index, this.width), foundAt: time, visits: 0 });
    this.everDiscovered.add(id); return true;
  }
  startTrip(keepLandmarks) {
    if (keepLandmarks) return;
    // Geometry persists in both conditions. Place locations and route associations do not.
    for (const cell of this.cells) if (cell) { cell.semantic = null; cell.placeId = null; }
    this.landmarks.clear(); this.connections.clear(); this.swept.fill(0); this.lastLandmark = null;
  }
  recordPosition(index, distance, time) {
    this.movement.push({ index, time });
    const landmark = [...this.landmarks.values()].find(item => item.index === index);
    if (!landmark || this.lastLandmark === landmark.id) return;
    landmark.visits++;
    if (this.lastLandmark) {
      const key = [this.lastLandmark, landmark.id].sort().join('|');
      this.connections.set(key, Math.min(distance - this.lastLandmarkDistance, this.connections.get(key) ?? Infinity));
    }
    this.lastLandmark = landmark.id; this.lastLandmarkDistance = distance;
  }
  stats() { return { known: this.known, unknown: this.total - this.known, landmarks: this.landmarks.size, connections: this.connections.size }; }
}
