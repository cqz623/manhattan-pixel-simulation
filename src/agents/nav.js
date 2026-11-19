import { terrainPassable, terrainCost, terrainEnergy, TERRAINS } from '../terrain.js';

/** Grid math and movement policy. No world or renderer dependencies. */
export const CARDINAL = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const positionOf = (index, width) => ({ x: index % width, y: Math.floor(index / width) });
export function cellIndex(x, y, width, height) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
}
export function neighbors(index, width, height, diagonal = false) {
  const { x, y } = positionOf(index, width);
  const moves = diagonal ? [...CARDINAL, [1, 1], [-1, 1], [-1, -1], [1, -1]] : CARDINAL;
  return moves.map(([dx, dy]) => cellIndex(x + dx, y + dy, width, height)).filter(next => next >= 0);
}
export const walkable = terrainPassable;
export const opaque = cell => !!cell && (cell.opaque ?? TERRAINS[cell.terrain]?.opaque);
export const PROFILES = Object.freeze({
  explorer: { speed: 1.8 },
  visitor: { speed: 1.8, parkCost: 1.7, slowCost: 2.8 },
  courier: { speed: 2.5, parkCost: 3.5, slowCost: 6 },
});
export function insideArea(index, width, area) {
  if (!area) return true;
  const x = index % width, y = Math.floor(index / width);
  return x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height;
}
export function traversalCost(cell, type = 'courier') {
  return terrainCost(cell, type);
}
export function energyCost(cell, type = 'courier') {
  return terrainEnergy(cell, type);
}
export function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
