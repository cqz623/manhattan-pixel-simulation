import { createEnvironment } from './environment.js';
import { seededRandom } from './agents/nav.js';
import { PARK_PROFILE } from '../data/nyc-park-profile.js';

/** Seeded abstract raster, not building footprints or GIS. Roads stay connected. */
export function generateAbstractManhattan({ width = 128, height = 72, seed = 1, parkProfile = false } = {}) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) throw new Error('Seed must be a positive 32-bit integer.');
  const env = createEnvironment(width, height), random = seededRandom(seed);
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  env.name = 'Abstract Manhattan';
  env.source = { kind: 'schematic', description: `Abstract Manhattan-inspired pixel city · seed ${seed}. Not actual GIS data.`, crs: null, bounds: null, generator: 'abstract-manhattan', seed };
  if (parkProfile) {
    env.source.dataId = PARK_PROFILE.id;
    env.source.attribution = `${PARK_PROFILE.name}; snapshot ${PARK_PROFILE.snapshotDate}. ${PARK_PROFILE.neighborhoodParks}/${PARK_PROFILE.total} record ratio informs random park-block probability, not geography.`;
    env.source.description += ' Optional NYC park-type ratio informs abstract park placement.';
  }
  env.layers.static.fill('road');
  const blocks = [];
  const rows = [];
  for (let y = 3; y < height - 3;) {
    const h = Math.min(integer(4, 7), height - y - 3); if (h > 1) rows.push({ y, h }); y += h + 2;
  }
  for (let x = 3; x < width - 3;) {
    const blockWidth = Math.min(integer(6, 10), width - x - 3);
    for (const { y, h } of rows) if (blockWidth > 1) blocks.push({ x, y, w: blockWidth, h });
    x += blockWidth + 3;
  }
  const fill = (block, value) => {
    for (let y = block.y; y < block.y + block.h; y++) for (let x = block.x; x < block.x + block.w; x++) env.layers.static[y * width + x] = value;
  };
  for (const block of blocks) fill(block, 'building');
  // A long green zone preserves the original orthogonal streets through it.
  for (const block of blocks) {
    if (block.x >= width * .36 && block.x < width * .57 && block.y < height * .48) fill(block, 'park');
    else if (random() < (parkProfile ? PARK_PROFILE.parkBlockProbability : .11)) fill(block, 'park');
    else if (random() < .09) fill(block, 'crowd');
    else if (random() < .065) fill(block, 'construction');
  }
  // Every resolution has at least one activity zone and construction block.
  const peripheral = blocks.filter(block => block.x < width * .3 || block.x > width * .65);
  if (peripheral.length) fill(peripheral[integer(0, Math.max(0, peripheral.length - 2))], 'crowd');
  if (peripheral.length > 1) fill(peripheral.at(-1), 'construction');
  if (!env.layers.static.includes('building') && blocks.length) {
    const block = blocks[0]; fill({ x: block.x + 1, y: block.y + 1, w: Math.min(2, block.w - 1), h: Math.min(2, block.h - 1) }, 'building');
  }
  for (const [n, kind] of ['park', 'crowd', 'construction'].entries()) {
    if (!env.layers.static.includes(kind) && blocks.length) {
      const block = blocks[n % blocks.length];
      const x = n === 1 ? block.x + block.w - 1 : block.x, y = n === 2 ? block.y + block.h - 1 : block.y;
      env.layers.static[y * width + x] = kind;
    }
  }
  const roadCells = env.layers.static.flatMap((value, index) => value === 'road' ? [index] : []);
  const reserved = new Set();
  const nearestRoad = (x, y) => [...roadCells].sort((a, b) => Math.abs(a % width - x) + Math.abs(Math.floor(a / width) - y) - Math.abs(b % width - x) - Math.abs(Math.floor(b / width) - y)).find(index => !reserved.has(index));
  const place = (layer, index, value) => { env.layers[layer][index] = value; if (layer === 'semantic') reserved.add(index); };
  const home = nearestRoad(2, Math.floor(height * .5));
  place('semantic', home, 'depot'); place('dynamic', home, 'robot');
  place('dynamic', home + width < width * height && env.layers.static[home + width] === 'road' ? home + width : nearestRoad(3, Math.floor(height * .5)), 'robot');
  place('semantic', nearestRoad(width - 3, height * .5), 'depot');
  for (const x of [.12, .48, .85]) for (const y of [.2, .75]) place('semantic', nearestRoad(Math.floor(width * x), Math.floor(height * y)), 'charger');
  place('semantic', nearestRoad(2, Math.floor(height * .5) + 2), 'charger');
  for (let n = 0; n < 5; n++) {
    const candidates = roadCells.filter(index => !reserved.has(index) && index % width > width * .2);
    if (candidates.length) place('semantic', candidates[integer(0, candidates.length - 1)], 'destination');
  }
  place('semantic', nearestRoad(width * .5, height * .35), 'landmark');
  const activity = env.layers.static.flatMap((value, index) => value === 'crowd' ? [index] : []);
  const people = activity.length ? activity : roadCells;
  for (let n = 0; n < Math.min(8, people.length); n++) {
    const available = people.filter(index => !env.layers.dynamic[index]);
    if (available.length) place('dynamic', available[integer(0, available.length - 1)], 'pedestrian');
  }
  return env;
}

/** Use the retained compact map with the current Explorer/Courier simulation. */
export function createAbstractEnvironment(options = {}) {
  const env = generateAbstractManhattan(options);
  env.simulation = {
    activeArea: { id: 'city', name: 'Entire city', x: 0, y: 0, width: env.grid.width, height: env.grid.height },
    agentMode: 'explorer-courier', taskBudget: 4,
  };
  return env;
}
