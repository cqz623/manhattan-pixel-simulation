import { indexAt, LAYERS, OBJECTS, isTraversable } from './environment.js';

/** One history entry per gesture. Repeated visits to a cell preserve its original value. */
export class EnvironmentEditor {
  constructor(environment, onChange = () => {}, { requireWalkablePlacements = false } = {}) {
    this.environment = environment;
    this.onChange = onChange;
    this.requireWalkablePlacements = requireWalkablePlacements;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
    this.limit = 60;
    this.batchDepth = 0; this.pendingNotification = false;
    this.revision = 0; this.lastChange = { revision: 0, kind: 'initial' };
  }
  changed(kind) { this.revision++; this.lastChange = { revision: this.revision, kind }; }
  notify() { if (this.batchDepth) this.pendingNotification = true; else this.onChange(); }
  batch(action) {
    this.batchDepth++;
    try { return action(); }
    finally { if (!--this.batchDepth && this.pendingNotification) { this.pendingNotification = false; this.onChange(); } }
  }
  beginStroke() { if (!this.stroke) this.stroke = new Map(); }
  paint(x, y, object, layer = OBJECTS[object]?.layer, erase = false) {
    const index = indexAt(this.environment, x, y);
    if (index < 0 || !LAYERS.includes(layer)) return false;
    if (!erase && OBJECTS[object]?.layer !== layer) return false;
    if (this.requireWalkablePlacements && !erase && ['semantic', 'dynamic'].includes(layer) && !isTraversable(this.environment, index)) return false;
    const value = erase ? (layer === 'static' ? 'open' : null) : object;
    const previous = this.environment.layers[layer][index];
    const hasAccess = layer === 'static' && !!this.environment.access;
    const previousAccess = hasAccess ? this.environment.access[index] : undefined;
    const nextAccess = hasAccess ? value === 'park' || value === 'road' || value === 'sidewalk' : undefined;
    if (previous === value && previousAccess === nextAccess) return false;
    this.beginStroke();
    const key = `${layer}:${index}`;
    const before = this.stroke.has(key) ? this.stroke.get(key).before : previous;
    const patch = { layer, index, before, after: value };
    if (hasAccess) { patch.accessBefore = this.stroke.has(key) ? this.stroke.get(key).accessBefore : previousAccess; patch.accessAfter = nextAccess; this.environment.access[index] = nextAccess; }
    this.stroke.set(key, patch);
    this.environment.layers[layer][index] = value;
    this.changed('cells');
    this.notify();
    return true;
  }
  endStroke() {
    if (!this.stroke) return;
    const patches = [...this.stroke.values()].filter(patch => patch.before !== patch.after || patch.accessBefore !== patch.accessAfter);
    this.stroke = null;
    if (patches.length) this.record({ patches });
    this.notify();
  }
  record(entry) { this.undoStack.push(entry); if (this.undoStack.length > this.limit) this.undoStack.shift(); this.redoStack = []; }
  replace(environment, kind = 'replace') {
    this.endStroke();
    this.record({ before: structuredClone(this.environment), after: structuredClone(environment), kind });
    this.environment = structuredClone(environment);
    this.changed(kind);
    this.notify();
  }
  apply(entry, forward) {
    if (entry.rulesBefore) this.environment.rules = structuredClone(forward ? entry.rulesAfter : entry.rulesBefore);
    else if (entry.patches) for (const patch of entry.patches) {
      this.environment.layers[patch.layer][patch.index] = forward ? patch.after : patch.before;
      if ('accessBefore' in patch) this.environment.access[patch.index] = forward ? patch.accessAfter : patch.accessBefore;
    }
    else this.environment = structuredClone(forward ? entry.after : entry.before);
    this.changed(entry.rulesBefore ? 'rules' : entry.patches ? 'cells' : entry.kind || 'replace');
    this.notify();
  }
  undo() { this.endStroke(); const entry = this.undoStack.pop(); if (entry) { this.redoStack.push(entry); this.apply(entry, false); } }
  redo() { this.endStroke(); const entry = this.redoStack.pop(); if (entry) { this.undoStack.push(entry); this.apply(entry, true); } }
  setRules(rules) {
    this.endStroke();
    const before = structuredClone(this.environment.rules);
    if (JSON.stringify(before) === JSON.stringify(rules)) return;
    this.environment.rules = structuredClone(rules);
    this.changed('rules');
    this.record({ rulesBefore: before, rulesAfter: structuredClone(rules) }); this.notify();
  }
  /** Apply a design preset as one cell edit, retaining the live agents' memories. */
  applyDesign(next) {
    this.endStroke(); const patches = [];
    if (next.grid.width !== this.environment.grid.width || next.grid.height !== this.environment.grid.height) throw new Error('Design patches require the same grid.');
    for (const layer of LAYERS) for (let index = 0; index < next.layers[layer].length; index++) {
      const before = this.environment.layers[layer][index], after = next.layers[layer][index];
      const accessBefore = layer === 'static' && this.environment.access ? this.environment.access[index] : undefined;
      const accessAfter = layer === 'static' && next.access ? next.access[index] : undefined;
      if (before === after && accessBefore === accessAfter) continue;
      const patch = { layer, index, before, after };
      if (accessBefore !== undefined) Object.assign(patch, { accessBefore, accessAfter });
      patches.push(patch);
    }
    if (!patches.length) return false;
    this.record({ patches }); this.apply({ patches }, true); return true;
  }
  paintBrush(x, y, object, layer, erase = false, size = 1) {
    const radius = Math.floor(size / 2); let changed = false;
    return this.batch(() => {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) changed = this.paint(x + dx, y + dy, object, layer, erase) || changed;
      return changed;
    });
  }
  fillRectangle(from, to, object, layer, erase = false) {
    const { width, height } = this.environment.grid; let changed = false;
    return this.batch(() => {
      for (let y = Math.max(0, Math.min(from[1], to[1])); y <= Math.min(height - 1, Math.max(from[1], to[1])); y++) {
        for (let x = Math.max(0, Math.min(from[0], to[0])); x <= Math.min(width - 1, Math.max(from[0], to[0])); x++) changed = this.paint(x, y, object, layer, erase) || changed;
      }
      return changed;
    });
  }
  floodFill(x, y, object, layer, erase = false) {
    const origin = indexAt(this.environment, x, y);
    if (origin < 0 || !LAYERS.includes(layer)) return false;
    const target = this.environment.layers[layer][origin], replacement = erase ? layer === 'static' ? 'open' : null : object;
    if (target === replacement) return false;
    const queue = [origin], seen = new Uint8Array(this.environment.layers[layer].length), width = this.environment.grid.width;
    seen[origin] = 1; let changed = false;
    return this.batch(() => {
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], cx = index % width, cy = Math.floor(index / width);
        changed = this.paint(cx, cy, object, layer, erase) || changed;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          const next = indexAt(this.environment, nx, ny);
          if (next >= 0 && !seen[next] && this.environment.layers[layer][next] === target) { seen[next] = 1; queue.push(next); }
        }
      }
      return changed;
    });
  }
}

/** Rasterize the segment between pointer events so quick strokes cannot skip cells. */
export function lineCells(from, to) {
  let [x, y] = from;
  const [tx, ty] = to;
  const dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  for (;;) {
    cells.push([x, y]);
    if (x === tx && y === ty) return cells;
    const doubleError = error * 2;
    if (doubleError >= dy) { error += dy; x += sx; }
    if (doubleError <= dx) { error += dx; y += sy; }
  }
}
