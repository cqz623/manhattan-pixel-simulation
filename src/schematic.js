import { createEnvironment } from './environment.js';

/** A deterministic design study, deliberately not a GIS reconstruction. */
export function generateSchematic(size = 64) {
  const env = createEnvironment(size);
  const terrain = env.layers.static;
  const scale = size / 64;
  const set = (x, y, value) => { if (x >= 0 && y >= 0 && x < size && y < size) terrain[y * size + x] = value; };
  // Generate on a canonical raster and resample nearest-neighbor for consistent resolution choices.
  const canonical = Array(64 * 64).fill('open');
  const base = (x, y, value) => { if (x >= 0 && x < 64 && y >= 0 && y < 64) canonical[y * 64 + x] = value; };
  for (let y = 0; y < 64; y++) {
    const eastEdge = 60 - Math.floor(y / 24);
    for (let x = 0; x < 64; x++) {
      if (x < 5 || x > eastEdge) base(x, y, 'water');
      else if (x < 7 || x >= eastEdge - 1) base(x, y, 'park');
      else {
        const avenue = (x - 7) % 10;
        const street = (y + 2) % 7;
        const road = avenue < 2 || street === 0;
        const sidewalk = avenue === 2 || avenue === 9 || street === 1 || street === 6;
        base(x, y, road ? 'road' : sidewalk ? 'sidewalk' : 'building');
      }
    }
  }
  // Long park and internal walking network, with a connected sidewalk boundary.
  for (let y = 2; y <= 24; y++) for (let x = 30; x <= 45; x++) {
    base(x, y, x === 30 || x === 45 || y === 2 || y === 24 || x === 37 || (y === 13 && x > 32) ? 'sidewalk' : 'park');
  }
  // Broadway-inspired diagonal cut, stepped on square cells.
  for (let y = 26; y < 64; y++) {
    const center = 35 - Math.floor((y - 26) * .37);
    for (let dx = -2; dx <= 2; dx++) base(center + dx, y, Math.abs(dx) === 2 ? 'sidewalk' : 'road');
  }
  // Public plaza and varied building footprints within regular blocks.
  for (let y = 35; y <= 38; y++) for (let x = 40; x <= 44; x++) base(x, y, 'open');
  for (const [x, y] of [[12, 9], [22, 30], [51, 44], [11, 51], [41, 59]]) {
    base(x, y, 'open'); base(x + 1, y, 'open');
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, canonical[Math.floor(y / scale) * 64 + Math.floor(x / scale)]);
  const place = (layer, x, y, value) => { env.layers[layer][Math.floor(y * scale) * size + Math.floor(x * scale)] = value; };
  place('semantic', 12, 27, 'depot');
  place('semantic', 43, 36, 'destination');
  place('semantic', 52, 53, 'destination');
  place('semantic', 37, 13, 'landmark');
  place('semantic', 29, 44, 'landmark');
  place('semantic', 18, 12, 'charger');
  place('semantic', 47, 47, 'charger');
  place('dynamic', 17, 29, 'robot');
  place('dynamic', 47, 41, 'robot');
  place('dynamic', 28, 19, 'pedestrian');
  place('dynamic', 33, 36, 'pedestrian');
  place('dynamic', 48, 55, 'pedestrian');
  return env;
}
