import { TERRAINS, DEFAULT_RULES, terrainPassable } from './terrain.js';

/** Versioned, renderer-independent raster model. Coordinates are zero-based, x east/y south. */
export const SCHEMA_VERSION = 1;
export const LAYERS = ['static', 'dynamic', 'semantic', 'overlays'];
export const LAYER_NAMES = { static: 'Static environment', dynamic: 'Dynamic entities', semantic: 'Semantic landmarks', overlays: 'Simulation overlays' };
export const OBJECTS = {
  ...Object.fromEntries(Object.entries(TERRAINS).map(([key, definition]) => [key, { ...definition, layer: 'static' }])),
  closure: { name: 'Temporary road closure', paletteLabel: 'Road closure', layer: 'overlays', color: TERRAINS.construction.color, symbol: '/' },
  depot: { name: 'Depot', layer: 'semantic', color: '#fafaf7', symbol: 'D', ink: '#000000' },
  charger: { name: 'Charger', layer: 'semantic', color: '#56efd0', symbol: '+', ink: '#000000' },
  destination: { name: 'Delivery destination', paletteLabel: 'Destination', layer: 'semantic', color: '#ffe655', symbol: '◇', ink: '#171400' },
  landmark: { name: 'Landmark', layer: 'semantic', color: '#c2a5ff', symbol: '◆', ink: '#100b1d' },
  robot: { name: 'Robot', layer: 'dynamic', color: '#effaff', symbol: '■' },
  pedestrian: { name: 'Pedestrian', layer: 'dynamic', color: '#ffb46b', symbol: '●' },
};
export const PALETTE = ['road', 'building', 'park', 'construction', 'destination', 'crowd', 'depot', 'charger', 'robot', 'pedestrian', 'landmark', 'sidewalk', 'slow', 'obstacle', 'closure'];
export function createEnvironment(width = 64, height = width) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 512 || height > 512) throw new Error('Grid dimensions must be integers between 16 and 512.');
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'Midtown study',
    grid: { width, height, cellSizeMeters: null },
    rules: { ...DEFAULT_RULES },
    source: { kind: 'schematic', description: 'Procedural Manhattan-inspired study. Not actual GIS geometry.', crs: null, bounds: null },
    layers: Object.fromEntries(LAYERS.map(layer => [layer, Array(width * height).fill(layer === 'static' ? 'open' : null)])),
  };
}
export function indexAt(environment, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= environment.grid.width || y >= environment.grid.height) return -1;
  return y * environment.grid.width + x;
}
export function inspectCell(environment, x, y) {
  const index = indexAt(environment, x, y);
  return index < 0 ? null : Object.fromEntries(LAYERS.map(layer => [layer, environment.layers[layer][index]]));
}
export function isTraversable(environment, index) {
  return terrainPassable({ terrain: environment.layers.static[index], constructionMode: environment.rules?.constructionMode, parkAccess: environment.rules?.parkAccess, pedestrianAccess: !!environment.access?.[index], closure: environment.layers.overlays[index] === 'closure' });
}
export function census(environment) {
  const result = { robot: 0, pedestrian: 0, landmark: 0, traversable: 0 };
  environment.layers.dynamic.forEach(value => { if (value) result[value]++; });
  environment.layers.semantic.forEach(value => { if (value === 'landmark') result.landmark++; });
  environment.layers.static.forEach((_, index) => { if (isTraversable(environment, index)) result.traversable++; });
  return result;
}
