import { isTraversable } from './environment.js';
import { geographicToGrid } from './coordinates.js';
import { neighbors, positionOf, insideArea } from './agents/nav.js';

export const NEIGHBORHOODS = Object.freeze([
  { id: 'lower', name: 'Lower Manhattan', longitude: -74.005, latitude: 40.719, width: 38, height: 38 },
  { id: 'midtown', name: 'Midtown', longitude: -73.989, latitude: 40.755, width: 42, height: 42 },
  { id: 'harlem', name: 'Harlem', longitude: -73.945, latitude: 40.816, width: 40, height: 40 },
  { id: 'inwood', name: 'Inwood', longitude: -73.923, latitude: 40.861, width: 34, height: 38 },
]);
export function validateArea(area, grid) {
  for (const field of ['x', 'y', 'width', 'height']) if (!Number.isInteger(area?.[field])) throw new Error('Active area requires integer grid bounds.');
  if (area.x < 0 || area.y < 0 || area.width < 8 || area.height < 8 || area.x + area.width > grid.width || area.y + area.height > grid.height) throw new Error('Active area must fit the grid and be at least 8 × 8.');
  return { id: String(area.id || 'custom').slice(0, 40), name: String(area.name || 'Custom area').slice(0, 80), x: area.x, y: area.y, width: area.width, height: area.height };
}
export function* areaIndices(area, width) {
  for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) yield y * width + x;
}
export function presetArea(environment, id) {
  const preset = NEIGHBORHOODS.find(item => item.id === id) || NEIGHBORHOODS[1];
  const center = geographicToGrid(environment, preset.longitude, preset.latitude) || { x: environment.grid.width / 2, y: environment.grid.height / 2 };
  const width = Math.min(preset.width, environment.grid.width), height = Math.min(preset.height, environment.grid.height);
  return validateArea({ ...preset, x: Math.max(0, Math.min(environment.grid.width - width, Math.floor(center.x - width / 2))), y: Math.max(0, Math.min(environment.grid.height - height, Math.floor(center.y - height / 2))), width, height }, environment.grid);
}
export function connectedComponents(environment, area) {
  const seen = new Set(), components = [], width = environment.grid.width;
  for (const start of areaIndices(area, width)) {
    if (seen.has(start) || !isTraversable(environment, start)) continue;
    const queue = [start]; seen.add(start);
    for (let head = 0; head < queue.length; head++) for (const next of neighbors(queue[head], width, environment.grid.height)) {
      if (insideArea(next, width, area) && !seen.has(next) && isTraversable(environment, next)) { seen.add(next); queue.push(next); }
    }
    components.push(queue);
  }
  return components.sort((a, b) => b.length - a.length);
}
/** Host authoring convenience: authored game locations are not real businesses. */
export function ensureLocalScenario(environment, area) {
  const component = connectedComponents(environment, area)[0] || [];
  if (component.length < 12) throw new Error('This area needs at least 12 connected traversable cells. Open a passage or select another area.');
  const width = environment.grid.width, cx = area.x + area.width / 2, cy = area.y + area.height / 2;
  const ranked = [...component].sort((a, b) => Math.abs(a % width - cx) + Math.abs(Math.floor(a / width) - cy) - Math.abs(b % width - cx) - Math.abs(Math.floor(b / width) - cy));
  const semantic = environment.layers.semantic;
  let depot = component.find(index => semantic[index] === 'depot');
  if (depot === undefined) { depot = ranked.find(index => !semantic[index]); semantic[depot] = 'depot'; }
  const root = positionOf(depot, width), distance = index => Math.abs(index % width - root.x) + Math.abs(Math.floor(index / width) - root.y);
  if (component.filter(index => semantic[index] === 'depot').length < 2) {
    const second = ranked.find(index => !semantic[index] && distance(index) >= 8); if (second !== undefined) semantic[second] = 'depot';
  }
  const candidates = ranked.filter(index => !semantic[index] && distance(index) >= 6 && distance(index) <= 18);
  let destinations = component.filter(index => semantic[index] === 'destination');
  const chosen = [];
  while (destinations.length < 3 && candidates.length) {
    const candidate = candidates.splice(Math.floor(candidates.length * (destinations.length + 1) / 4), 1)[0];
    if (candidate === undefined) break;
    semantic[candidate] = 'destination'; destinations.push(candidate); chosen.push(candidate);
  }
  if (!component.some(index => semantic[index] === 'charger')) { const charger = ranked.find(index => !semantic[index]); if (charger !== undefined) semantic[charger] = 'charger'; }
  if (!component.some(index => environment.layers.dynamic[index] === 'robot')) {
    environment.layers.dynamic[depot] = 'robot';
    const second = ranked.find(index => !environment.layers.dynamic[index] && distance(index) <= 3);
    if (second !== undefined) environment.layers.dynamic[second] = 'robot';
  }
  if (!component.some(index => environment.layers.dynamic[index] === 'pedestrian')) {
    for (const index of ranked.filter(index => !semantic[index] && !environment.layers.dynamic[index] && environment.layers.static[index] === 'road' && distance(index) >= 4 && distance(index) <= 10).slice(0, 4)) {
      environment.layers.static[index] = 'crowd'; environment.layers.dynamic[index] = 'pedestrian';
    }
  }
  environment.simulation = { ...(environment.simulation || {}), activeArea: { ...area }, agentMode: 'explorer-courier', taskBudget: environment.simulation?.taskBudget || 4 };
  return environment;
}
