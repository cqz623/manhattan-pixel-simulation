import { isTraversable } from './environment.js';
import { areaIndices, connectedComponents } from './regions.js';
import { neighbors, seededRandom } from './agents/nav.js';

export function environmentChanges(a, b) {
  const counts = new Map(), changed = [], details = [];
  for (let index = 0; index < a.layers.static.length; index++) {
    let different = false; const patches = [];
    for (const layer of ['static', 'semantic', 'dynamic', 'overlays']) if (a.layers[layer][index] !== b.layers[layer][index]) {
      const key = `${layer}: ${a.layers[layer][index] || 'empty'} → ${b.layers[layer][index] || 'empty'}`;
      counts.set(key, (counts.get(key) || 0) + 1); different = true;
      patches.push({ layer, before: a.layers[layer][index], after: b.layers[layer][index] });
    }
    if (!!a.access?.[index] !== !!b.access?.[index]) { counts.set('Pedestrian access changed', (counts.get('Pedestrian access changed') || 0) + 1); different = true; patches.push({ layer: 'access', before: !!a.access?.[index], after: !!b.access?.[index] }); }
    if (different) { changed.push(index); details.push({ index, x: index % a.grid.width, y: Math.floor(index / a.grid.width), patches }); }
  }
  if (JSON.stringify(a.rules) !== JSON.stringify(b.rules)) counts.set('Terrain cost/access rules changed', 1);
  return { cells: changed, details, rules: [...new Set([...Object.keys(a.rules), ...Object.keys(b.rules)])].filter(key => a.rules[key] !== b.rules[key]).map(key => ({ key, before: a.rules[key] ?? null, after: b.rules[key] ?? null })), summary: [...counts].map(([change, count]) => ({ change, count })) };
}

/** Two or three distinct, feasible siblings. No fitness score or guaranteed improvement. */
export function generateAlternatives(environment, { seed = 1, plan = null, count = 3 } = {}) {
  if (![2, 3].includes(count)) throw new Error('Generate two or three alternatives.');
  const random = seededRandom(seed), alternatives = [], signatures = new Set();
  const signature = env => JSON.stringify([env.layers, env.access, env.rules]);
  signatures.add(signature(environment));
  const area = environment.simulation?.activeArea || { x: 0, y: 0, ...environment.grid };
  const protectedCells = plan?.starts.map(start => start.index) || [];
  const cells = [...areaIndices(area, environment.grid.width)].filter(index => isTraversable(environment, index) && !environment.layers.semantic[index] && !environment.layers.dynamic[index] && !protectedCells.includes(index));
  for (let attempt = 0; attempt < 60 && alternatives.length < count && cells.length; attempt++) {
    let candidate;
    const center = cells[Math.floor(random() * cells.length)];
    try {
      if (attempt % 3 === 0) candidate = generateVariation(environment, { seed: (seed + attempt + 1) >>> 0, plan });
      else if (attempt % 3 === 1) candidate = applyPreset(environment, 'passage', { center: [center % environment.grid.width, Math.floor(center / environment.grid.width)], protectedCells });
      else { candidate = structuredClone(environment); candidate.layers.semantic[center] = 'landmark'; }
    } catch { continue; }
    const key = signature(candidate);
    if (signatures.has(key) || !hasValidRoutes(candidate, plan)) continue;
    signatures.add(key); alternatives.push(candidate);
  }
  if (alternatives.length < 2) throw new Error('Fewer than two distinct route-valid alternatives exist here. Open connections or select a less constrained map.');
  return alternatives;
}
/** Host-only feasibility check. It never populates an agent's memory. */
export function hasValidRoutes(environment, plan = null) {
  const area = environment.simulation?.activeArea || { x: 0, y: 0, ...environment.grid };
  const components = connectedComponents(environment, area);
  const goals = [...areaIndices(area, environment.grid.width)].filter(index => ['depot', 'destination'].includes(environment.layers.semantic[index]));
  const required = plan ? [...plan.starts.map(start => start.index), ...plan.requiredCells, ...goals] : goals;
  if (!required.length) return false;
  return components.some(component => { const cells = new Set(component); return required.every(index => cells.has(index)); });
}
/** Simple authored treatment; the actual cell patch remains undoable through the editor. */
export function applyPreset(environment, preset, { center = null, protectedCells = [] } = {}) {
  const env = structuredClone(environment), area = env.simulation?.activeArea || { x: 0, y: 0, ...env.grid }, width = env.grid.width;
  const protectedSet = new Set(protectedCells);
  const cells = [...areaIndices(area, width)], distance = index => center ? Math.abs(index % width - center[0]) + Math.abs(Math.floor(index / width) - center[1]) : Math.abs(index % width - area.x - area.width / 2) + Math.abs(Math.floor(index / width) - area.y - area.height / 2);
  const candidates = cells.filter(index => !protectedSet.has(index) && !env.layers.semantic[index] && !env.layers.dynamic[index]).sort((a, b) => distance(a) - distance(b) || a - b);
  if (preset === 'construction') {
    const seed = candidates.find(index => isTraversable(env, index));
    if (seed !== undefined) for (const index of [seed, ...neighbors(seed, width, env.grid.height)].filter(index => candidates.includes(index) && isTraversable(env, index)).slice(0, 3)) env.layers.static[index] = 'construction';
  } else if (preset === 'crowd') {
    for (const index of candidates.filter(index => isTraversable(env, index)).slice(0, 5)) { env.layers.static[index] = 'crowd'; env.layers.dynamic[index] = 'pedestrian'; }
  } else if (preset === 'destination') {
    const index = candidates.find(index => isTraversable(env, index)); if (index !== undefined) env.layers.semantic[index] = 'destination';
  } else if (preset === 'passage') {
    let opened = false;
    for (const index of candidates) {
      if (!['building', 'park', 'construction', 'obstacle'].includes(env.layers.static[index])) continue;
      const adjacent = neighbors(index, width, env.grid.height).filter(next => isTraversable(env, next));
      if (adjacent.length < 2) continue;
      env.layers.static[index] = env.layers.static[index] === 'park' ? 'park' : 'road'; if (env.access) env.access[index] = true;
      env.layers.overlays[index] = null; opened = true; break;
    }
    if (!opened) {
      const park = candidates.find(index => env.layers.static[index] === 'park');
      if (park !== undefined && env.access) env.access[park] = true;
    }
  } else throw new Error('Unknown design preset.');
  return env;
}
export function generateVariation(environment, { seed = 1, plan = null } = {}) {
  const random = seededRandom(seed), area = environment.simulation?.activeArea || { x: 0, y: 0, ...environment.grid };
  const protectedCells = new Set([...(plan?.starts.map(start => start.index) || []), ...(plan?.requiredCells || [])]);
  const candidates = [...areaIndices(area, environment.grid.width)].filter(index => !protectedCells.has(index) && isTraversable(environment, index) && !environment.layers.semantic[index] && !environment.layers.dynamic[index]);
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = structuredClone(environment), used = new Set();
    for (let n = 0; n < Math.min(4, candidates.length); n++) {
      const index = candidates[Math.floor(random() * candidates.length)]; if (index === undefined || used.has(index)) continue;
      result.layers.static[index] = n === 0 ? 'construction' : 'crowd'; used.add(index);
    }
    if (used.size && hasValidRoutes(result, plan)) return result;
  }
  throw new Error('No small route-preserving variation found. Open a passage or choose a less constrained area.');
}
