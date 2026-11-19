/** Geographic transforms use grid metadata only, never hidden cell contents. */
const RADIUS = 6378137;
export function lonLatToMercator(lon, lat) {
  return [RADIUS * lon * Math.PI / 180, RADIUS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
}
export function mercatorToLonLat(x, y) {
  return [x / RADIUS * 180 / Math.PI, (2 * Math.atan(Math.exp(y / RADIUS)) - Math.PI / 2) * 180 / Math.PI];
}
export function gridToGeographic(environment, x, y) {
  const bounds = environment.source.bounds;
  if (!bounds || !['EPSG:3857', 'EPSG:4326'].includes(environment.source.crs)) return null;
  const px = bounds[0] + (x + .5) / environment.grid.width * (bounds[2] - bounds[0]);
  const py = bounds[3] - (y + .5) / environment.grid.height * (bounds[3] - bounds[1]);
  const [longitude, latitude] = environment.source.crs === 'EPSG:3857' ? mercatorToLonLat(px, py) : [px, py];
  return { longitude, latitude };
}
export function geographicToGrid(environment, longitude, latitude) {
  const bounds = environment.source.bounds;
  if (!bounds || !['EPSG:3857', 'EPSG:4326'].includes(environment.source.crs)) return null;
  const [x, y] = environment.source.crs === 'EPSG:3857' ? lonLatToMercator(longitude, latitude) : [longitude, latitude];
  return { x: Math.floor((x - bounds[0]) / (bounds[2] - bounds[0]) * environment.grid.width), y: Math.floor((bounds[3] - y) / (bounds[3] - bounds[1]) * environment.grid.height) };
}
export function placeIdentity(kind, index, width) {
  let hash = 2166136261;
  for (const character of `${kind}@${width}:${index}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `site-${(hash >>> 0).toString(36)}`;
}
