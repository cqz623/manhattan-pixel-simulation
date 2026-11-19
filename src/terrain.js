/** Semantic definitions are shared by rendering, sensing, memory, physics and planning.
 * Colors are presentation only. Never infer movement rules from pixel values. */
export const DEFAULT_RULES = Object.freeze({ parkCost: 2, constructionMode: 'blocked', constructionCost: 6, crowdWeight: 2 });
export const DEFAULT_CROWD_COST = 2.5;
export const TERRAINS = Object.freeze({
  road: { name: 'Road', color: '#000000', passable: true, opaque: false, costs: [1, 1], energy: [1, 1], symbol: '' },
  building: { name: 'Building', color: '#245bff', passable: false, opaque: true, costs: [Infinity, Infinity], energy: [0, 0], symbol: '' },
  park: { name: 'Park', color: '#37de75', passable: true, opaque: false, costs: [1.7, 3.5], energy: [1, 3], symbol: '' },
  construction: { name: 'Construction', color: '#ff5938', passable: true, opaque: false, temporary: true, costs: [6, 6], energy: [3, 5], symbol: '' },
  crowd: { name: 'Crowd zone', color: '#f36bc5', passable: true, opaque: false, costs: [DEFAULT_CROWD_COST, DEFAULT_CROWD_COST], energy: [1, 1], symbol: '' },
  sidewalk: { name: 'Sidewalk', color: '#292b34', passable: true, opaque: false, costs: [1, 1], energy: [1, .9], symbol: '' },
  slow: { name: 'Slow terrain', color: '#c49147', passable: true, opaque: false, costs: [2.8, 6], energy: [1.5, 5], symbol: '·' },
  obstacle: { name: 'Static obstacle', color: '#8791a8', passable: false, opaque: true, costs: [Infinity, Infinity], energy: [0, 0], symbol: '×' },
  open: { name: 'Open space', color: '#101116', passable: true, opaque: false, costs: [1, 1], energy: [1, 1], symbol: '' },
  water: { name: 'Water', color: '#0a1e2c', passable: false, opaque: false, costs: [Infinity, Infinity], energy: [0, 0], symbol: '' },
});
const definitionPassable = (terrain, mode = DEFAULT_RULES.constructionMode, parkAccess = 'all', pedestrianAccess = false) => !!TERRAINS[terrain]?.passable && !(terrain === 'construction' && mode === 'blocked') && !(terrain === 'park' && parkAccess === 'marked' && !pedestrianAccess);
export function describeTerrain(terrain, settings = DEFAULT_RULES, occupancy = 0, pedestrianAccess = false) {
  const definition = TERRAINS[terrain];
  if (!definition) throw new Error(`Unknown terrain: ${terrain}`);
  const rules = { parkAccess: 'all', ...DEFAULT_RULES, ...settings };
  const baseCosts = { visitor: definition.costs[0], courier: definition.costs[1] };
  if (terrain === 'park') { baseCosts.visitor *= rules.parkCost / 2; baseCosts.courier *= rules.parkCost / 2; }
  if (terrain === 'construction') baseCosts.visitor = baseCosts.courier = rules.constructionCost;
  if (terrain === 'crowd') baseCosts.visitor = baseCosts.courier = rules.crowdBaseCost ?? DEFAULT_CROWD_COST;
  const passable = definitionPassable(terrain, rules.constructionMode, rules.parkAccess, pedestrianAccess);
  const congestion = terrain === 'crowd' ? Math.max(0, occupancy) : 0;
  return Object.freeze({
    terrain, passable, opaque: definition.opaque, pedestrianAccess, parkAccess: rules.parkAccess,
    temporary: !!definition.temporary, constructionMode: terrain === 'construction' ? rules.constructionMode : null,
    congestion, crowdWeight: rules.crowdWeight, baseCosts: Object.freeze(baseCosts),
    traversalCosts: Object.freeze({ visitor: baseCosts.visitor + congestion * rules.crowdWeight * .75, courier: baseCosts.courier + congestion * rules.crowdWeight }),
    energyCosts: Object.freeze({ visitor: definition.energy[0] + congestion * .25, courier: definition.energy[1] + congestion * .5 }),
  });
}
export function terrainPassable(cell) {
  return !!cell && !cell.closure && (cell.passable ?? definitionPassable(cell.terrain, cell.constructionMode, cell.parkAccess, cell.pedestrianAccess));
}
export function terrainCost(cell, type = 'courier') {
  return terrainPassable(cell) ? (cell.traversalCosts || describeTerrain(cell.terrain, DEFAULT_RULES, cell.congestion).traversalCosts)[type === 'explorer' ? 'visitor' : type] : Infinity;
}
export function terrainEnergy(cell, type = 'courier') {
  return (cell.energyCosts || describeTerrain(cell.terrain, DEFAULT_RULES, cell.congestion).energyCosts)[type === 'explorer' ? 'visitor' : type];
}
export function sameTerrainState(a, b) {
  if (!a || !b || a.terrain !== b.terrain || !!a.closure !== !!b.closure || terrainPassable(a) !== terrainPassable(b)) return false;
  const left = a.baseCosts || describeTerrain(a.terrain).baseCosts, right = b.baseCosts || describeTerrain(b.terrain).baseCosts;
  return left.visitor === right.visitor && left.courier === right.courier;
}
