import { cellIndex, positionOf, walkable, insideArea } from './nav.js';
import { describeTerrain } from '../terrain.js';
import { placeIdentity } from '../coordinates.js';
import { areaIndices, connectedComponents } from '../regions.js';

/** Host adapter: geometry, dispatch identities, spawns and collision validation, never routing. */
export class GridWorld {
  constructor(environment) { this.placeIds = new Map(); this.nextPlace = 1; this.sync(environment); }
  sync(environment) {
    this.environment = environment; this.width = environment.grid.width; this.height = environment.grid.height;
    this.area = environment.simulation?.activeArea || { x: 0, y: 0, width: this.width, height: this.height };
    const rulesKey = JSON.stringify(environment.rules);
    if (!this.descriptions || rulesKey !== this.rulesKey) { this.descriptions = new Map(); this.rulesKey = rulesKey; }
    for (const index of areaIndices(this.area, this.width)) {
      const kind = environment.layers.semantic[index];
      const key = `${kind}:${index}`;
      if (kind && !this.placeIds.has(key)) this.placeIds.set(key, placeIdentity(kind, index, this.width));
    }
  }
  cell(index, occupants = this.occupants || []) {
    const layers = this.environment.layers;
    const point = positionOf(index, this.width);
    const congestion = layers.static[index] === 'crowd' ? occupants.filter(item => Math.abs(item.position.x - point.x) + Math.abs(item.position.y - point.y) <= 2).length : 0;
    const access = !!this.environment.access?.[index];
    const key = `${layers.static[index]}:${congestion}:${access}`;
    if (!this.descriptions.has(key)) this.descriptions.set(key, describeTerrain(layers.static[index], this.environment.rules, congestion, access));
    return { ...this.descriptions.get(key), closure: layers.overlays[index] === 'closure', semantic: layers.semantic[index], placeId: layers.semantic[index] ? this.placeIds.get(`${layers.semantic[index]}:${index}`) : null };
  }
  inArea(index) { return insideArea(index, this.width, this.area); }
  canStand(index) { return index >= 0 && index < this.width * this.height && this.inArea(index) && walkable(this.cell(index)); }
  canMove(from, to, occupied) {
    const a = positionOf(from, this.width), b = positionOf(to, this.width);
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && this.canStand(to) && !occupied.has(to);
  }
  placements(kind) { return [...areaIndices(this.area, this.width)].filter(index => this.environment.layers.dynamic[index] === kind); }
  dispatch() {
    // A task may name an address without giving the agent its coordinates.
    return [...areaIndices(this.area, this.width)].flatMap(index => {
      const kind = this.environment.layers.semantic[index];
      return ['destination', 'landmark'].includes(kind) ? [{ id: this.placeIds.get(`${kind}:${index}`), kind }] : [];
    });
  }
  spawnCells() {
    let all = [...areaIndices(this.area, this.width)];
    if (this.environment.simulation?.agentMode === 'explorer-courier') {
      all = connectedComponents(this.environment, this.area)[0] || [];
      const origin = this.placements('robot')[0] ?? all[0];
      if (origin !== undefined) all.sort((a, b) => Math.abs(a % this.width - origin % this.width) + Math.abs(Math.floor(a / this.width) - Math.floor(origin / this.width)) - Math.abs(b % this.width - origin % this.width) - Math.abs(Math.floor(b / this.width) - Math.floor(origin / this.width)));
    }
    const pedestrians = new Set(this.placements('pedestrian'));
    return [...new Set([...this.placements('robot'), ...all])].filter(index => this.canStand(index) && !pedestrians.has(index));
  }
  index(position) { return cellIndex(position.x, position.y, this.width, this.height); }
}
