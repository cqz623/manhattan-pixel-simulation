import { createEnvironment, LAYERS, OBJECTS, SCHEMA_VERSION } from './environment.js';
import { validateArea } from './regions.js';

function unpack(value, expected) {
  if (Array.isArray(value)) return value;
  if (!value || value.encoding !== 'rle' || !Array.isArray(value.runs)) return null;
  const output = [];
  for (const run of value.runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[1]) || run[1] < 1 || output.length + run[1] > expected) throw new Error('Invalid RLE scenario layer.');
    for (let count = 0; count < run[1]; count++) output.push(run[0]);
  }
  return output;
}
function pack(values) {
  const runs = [];
  for (const value of values) {
    if (runs.length && runs.at(-1)[0] === value) runs.at(-1)[1]++;
    else runs.push([value, 1]);
  }
  return { encoding: 'rle', runs };
}

export function validateScenario(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Scenario must be a JSON object.');
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version. Expected ${SCHEMA_VERSION}.`);
  const env = createEnvironment(input.grid?.width, input.grid?.height);
  // createEnvironment defaults missing values for callers; imported files must explicitly define dimensions.
  if (!Number.isInteger(input.grid?.width) || !Number.isInteger(input.grid?.height)) throw new Error('Missing grid dimensions.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('Scenario name must contain 1–80 characters.');
  env.name = input.name.trim();
  if (input.rules !== undefined) {
    if (!input.rules || typeof input.rules !== 'object' || Array.isArray(input.rules)) throw new Error('Rules must be an object.');
    for (const [key, minimum, maximum] of [['parkCost', .5, 8], ['constructionCost', 1, 20], ['crowdWeight', 0, 8]]) {
      const value = input.rules[key] ?? env.rules[key];
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid ${key}: expected ${minimum}–${maximum}.`);
      env.rules[key] = value;
    }
    const mode = input.rules.constructionMode ?? env.rules.constructionMode;
    if (!['blocked', 'costly'].includes(mode)) throw new Error('Construction mode must be blocked or costly.');
    env.rules.constructionMode = mode;
    if (input.rules.crowdBaseCost !== undefined) {
      if (!Number.isFinite(input.rules.crowdBaseCost) || input.rules.crowdBaseCost < 1 || input.rules.crowdBaseCost > 8) throw new Error('Crowd base cost must be 1–8.');
      env.rules.crowdBaseCost = input.rules.crowdBaseCost;
    }
    if (input.rules.parkAccess !== undefined) {
      if (!['all', 'marked'].includes(input.rules.parkAccess)) throw new Error('Park access must be all or marked.');
      env.rules.parkAccess = input.rules.parkAccess;
    }
  }
  if (!input.source || !['schematic', 'gis'].includes(input.source.kind)) throw new Error('Source kind must be schematic or gis.');
  if (typeof input.source.description !== 'string' || input.source.description.length > 1000) throw new Error('Provide a source description of at most 1,000 characters.');
  const crs = input.source.crs ?? null;
  const bounds = input.source.bounds ?? null;
  if (crs !== null && (typeof crs !== 'string' || crs.length > 100)) throw new Error('CRS must be a string or null.');
  if (bounds !== null && (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3])) throw new Error('Bounds must be [minX, minY, maxX, maxY].');
  const meters = input.grid.cellSizeMeters ?? null;
  if (meters !== null && (!Number.isFinite(meters) || meters <= 0)) throw new Error('Cell size must be a positive number or null.');
  env.grid.cellSizeMeters = meters;
  env.source = { kind: input.source.kind, description: input.source.description, crs, bounds };
  for (const [key, max] of [['dataId', 100], ['attribution', 1000]]) if (input.source[key] !== undefined) {
    if (typeof input.source[key] !== 'string' || input.source[key].length > max) throw new Error(`Invalid source ${key}.`);
    env.source[key] = input.source[key];
  }
  if (input.source.generator !== undefined) {
    if (!['abstract-manhattan', 'classic-schematic', 'experiment-preset'].includes(input.source.generator)) throw new Error('Unknown generator.');
    if (!Number.isInteger(input.source.seed) || input.source.seed < 1 || input.source.seed > 4294967295) throw new Error('Generator seed must be a positive 32-bit integer.');
    env.source.generator = input.source.generator; env.source.seed = input.source.seed;
  }
  if (input.source.experiment !== undefined) {
    if (!['shortcut', 'congestion', 'landmark', 'closure'].includes(input.source.experiment)) throw new Error('Unknown experiment preset.');
    env.source.experiment = input.source.experiment;
  }
  for (const layer of LAYERS) {
    const values = unpack(input.layers?.[layer], env.grid.width * env.grid.height);
    if (!Array.isArray(values) || values.length !== env.grid.width * env.grid.height) throw new Error(`Invalid ${layer} layer length.`);
    for (const value of values) {
      if (value === null && layer !== 'static') continue;
      if (typeof value !== 'string' || !Object.hasOwn(OBJECTS, value) || OBJECTS[value].layer !== layer) throw new Error(`Invalid object in ${layer} layer.`);
    }
    env.layers[layer] = [...values];
  }
  if (input.access !== undefined) {
    const access = unpack(input.access, env.grid.width * env.grid.height);
    if (!Array.isArray(access) || access.length !== env.grid.width * env.grid.height || access.some(value => typeof value !== 'boolean')) throw new Error('Invalid pedestrian access mask.');
    env.access = [...access];
  } else if (env.rules.parkAccess === 'marked') env.access = Array(env.grid.width * env.grid.height).fill(false);
  if (input.simulation !== undefined) {
    const settings = input.simulation;
    if (!settings || !['explorer-courier', 'visitor-courier'].includes(settings.agentMode)) throw new Error('Invalid simulation agent mode.');
    if (!Number.isInteger(settings.taskBudget) || settings.taskBudget < 1 || settings.taskBudget > 20) throw new Error('Task budget must be 1–20 per courier.');
    env.simulation = { agentMode: settings.agentMode, taskBudget: settings.taskBudget, activeArea: validateArea(settings.activeArea, env.grid) };
  }
  return env;
}
export function serializeScenario(environment) {
  const value = validateScenario(environment);
  if (value.grid.width * value.grid.height > 16384) {
    for (const layer of LAYERS) value.layers[layer] = pack(value.layers[layer]);
    if (value.access) value.access = pack(value.access);
    return JSON.stringify(value);
  }
  return JSON.stringify(value, null, 2);
}
export function parseScenario(json) {
  if (json.length > 4_000_000) throw new Error('Scenario is too large (maximum 4 MB).');
  let input;
  try { input = JSON.parse(json); } catch { throw new Error('File is not valid JSON.'); }
  return validateScenario(input);
}
