import { neighbors, positionOf, traversalCost, walkable, insideArea } from './nav.js';

export const pathfindingCapability = Object.freeze({ available: true, phase: 2 });
class PriorityQueue {
  constructor() { this.items = []; }
  push(index, cost) {
    const entry = { index, cost }; let slot = this.items.length; this.items.push(entry);
    while (slot) {
      const parent = (slot - 1) >> 1;
      if (this.items[parent].cost <= cost) break;
      this.items[slot] = this.items[parent]; slot = parent;
    }
    this.items[slot] = entry;
  }
  pop() {
    const top = this.items[0], tail = this.items.pop();
    if (this.items.length) {
      let slot = 0;
      while (slot * 2 + 1 < this.items.length) {
        let child = slot * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
        if (tail.cost <= this.items[child].cost) break;
        this.items[slot] = this.items[child]; slot = child;
      }
      this.items[slot] = tail;
    }
    return top;
  }
}
export function isFrontier(memory, index) {
  return walkable(memory.cells[index]) && neighbors(index, memory.width, memory.height).some(next => insideArea(next, memory.width, memory.area) && !memory.swept[next] && (!memory.cells[next] || walkable(memory.cells[next])));
}
function search(memory, start, predicate, { type = 'courier', blocked = new Set(), diagonal = false } = {}) {
  if (start < 0 || start >= memory.cells.length || !memory.cells[start]) return null;
  const cost = new Float64Array(memory.cells.length).fill(Infinity), parent = new Int32Array(memory.cells.length).fill(-1);
  const queue = new PriorityQueue(); cost[start] = 0; queue.push(start, 0);
  while (queue.items.length) {
    const current = queue.pop(); if (current.cost !== cost[current.index]) continue;
    if (predicate(current.index)) {
      const route = []; let at = current.index;
      while (at !== -1) { route.push(at); at = parent[at]; }
      return { route: route.reverse(), cost: current.cost };
    }
    for (const next of neighbors(current.index, memory.width, memory.height, diagonal)) {
      if (!insideArea(next, memory.width, memory.area) || !walkable(memory.cells[next]) || blocked.has(next)) continue;
      const a = positionOf(current.index, memory.width), b = positionOf(next, memory.width);
      const isDiagonal = a.x !== b.x && a.y !== b.y;
      if (isDiagonal && [a.y * memory.width + b.x, b.y * memory.width + a.x].some(side => !walkable(memory.cells[side]) || blocked.has(side))) continue;
      const nextCost = current.cost + traversalCost(memory.cells[next], type) * (isDiagonal ? Math.SQRT2 : 1);
      if (nextCost >= cost[next]) continue;
      cost[next] = nextCost; parent[next] = current.index; queue.push(next, nextCost);
    }
  }
  return null;
}
export function findPath(memory, start, goal, options) {
  if (!walkable(memory.cells[goal])) return null;
  return search(memory, start, index => index === goal, options);
}
export function findFrontier(memory, start, options = {}) {
  return search(memory, start, index => index !== start && isFrontier(memory, index), options);
}
