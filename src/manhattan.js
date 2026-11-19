import BASE from '../data/manhattan-base.js';
import { createEnvironment } from './environment.js';
import { NEIGHBORHOODS, presetArea, ensureLocalScenario } from './regions.js';

function expand(runs, expected, convert = value => value) {
  const values = [];
  for (const [code, count] of runs) for (let n = 0; n < count; n++) values.push(convert(code));
  if (values.length !== expected) throw new Error('Invalid bundled geographic raster.');
  return values;
}
export const GEO_SOURCES = Object.freeze(BASE.datasets.map(dataset => Object.freeze({ ...dataset, url: `https://data.cityofnewyork.us/d/${dataset.id}` })));
export function createManhattanEnvironment() {
  const env = createEnvironment(BASE.width, BASE.height), count = BASE.width * BASE.height;
  env.name = 'Manhattan Delivery Lab'; env.grid.cellSizeMeters = BASE.cellSizeMeters;
  env.layers.static = expand(BASE.terrain, count, code => BASE.palette[code]); env.access = expand(BASE.access, count, Boolean);
  env.rules.parkAccess = 'marked';
  env.source = {
    kind: 'gis', description: 'NYC shoreline, street centerlines and park polygons rasterized into an aggregated simulation. Blue land is aggregated urban blocks, not building footprints. Game locations are authored.',
    crs: BASE.crs, bounds: [...BASE.bounds], dataId: BASE.id,
    attribution: `NYC Open Data: DCP Borough Boundaries, OTI Street Centerline, NYC Parks Properties. Snapshot ${BASE.snapshotDate}.`,
  };
  for (const preset of NEIGHBORHOODS) ensureLocalScenario(env, presetArea(env, preset.id));
  ensureLocalScenario(env, presetArea(env, 'midtown'));
  return env;
}
