import { LAYERS, OBJECTS, indexAt } from './environment.js';
import { fitCamera, zoomCamera, cellAtPoint, fitAreaCamera } from './camera.js';
import { RasterCache } from './raster-cache.js';
import { drawSpatialComparison } from './comparison-renderer.js';

export const KNOWLEDGE_MODES = Object.freeze([
  { id: 'none', name: 'No Layer', available: true },
  { id: 'paths', name: 'All Paths', available: true },
  { id: 'landmarks', name: 'Landmark Heatmap', available: true },
  { id: 'shared', name: 'Shared Knowledge', available: true },
]);
export const UNKNOWN_COLOR = '#17181f';

/** Canvas camera uses CSS pixels; backing storage follows the display pixel ratio. */
export class MapRenderer {
  constructor(canvas, getEnvironment) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.getEnvironment = getEnvironment;
    this.visibility = Object.fromEntries(LAYERS.map(layer => [layer, true]));
    this.camera = { x: 0, y: 0, cell: 8, zoom: 1 };
    this.grid = true;
    this.hover = null;
    this.selected = null;
    this.simulationView = null;
    this.comparisonView = null;
    this.width = 0; this.height = 0;
    this.frame = null;
    this.isFitted = false; this.brushSize = 1; this.tool = 'paint'; this.rectanglePreview = null;
    this.fitRegion = null; this.raster = new RasterCache(); this.placed = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const old = { width: this.width, height: this.height };
    this.width = width; this.height = height;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!old.width || this.isFitted) this.fitRegion ? this.fitArea(this.fitRegion) : this.fit();
    else { this.camera.x += (width - old.width) / 2; this.camera.y += (height - old.height) / 2; this.requestDraw(); }
  }
  fit() {
    const { width, height } = this.displayEnvironment().grid;
    this.camera = fitCamera(this.width, this.height, width, height);
    this.fitCell = this.camera.cell;
    this.isFitted = true;
    this.fitRegion = null;
    this.requestDraw();
  }
  fitArea(area) {
    this.fitRegion = { ...area }; this.camera = fitAreaCamera(this.width, this.height, area);
    this.fitCell = this.camera.cell; this.isFitted = true; this.requestDraw();
  }
  invalidate() { this.raster.invalidate(); this.placed = null; this.requestDraw(); }
  setComparisonView(view) {
    const entering = view?.history && !this.comparisonView?.history;
    const leaving = !view?.history && this.comparisonView?.history;
    if (entering) this.liveCamera = { camera: { ...this.camera }, fitCell: this.fitCell, fitRegion: this.fitRegion, isFitted: this.isFitted, hover: this.hover, selected: this.selected, width: this.width, height: this.height };
    const previous = this.displayEnvironment();
    this.comparisonView = view;
    if (entering || view?.history && (previous.grid.width !== view.environment.grid.width || previous.grid.height !== view.environment.grid.height)) { this.hover = null; this.selected = null; this.fit(); }
    if (leaving && this.liveCamera) {
      const saved = this.liveCamera;
      Object.assign(this, { camera: saved.camera, fitCell: saved.fitCell, fitRegion: saved.fitRegion, isFitted: saved.isFitted, hover: saved.hover, selected: saved.selected });
      if (this.isFitted) this.fitRegion ? this.fitArea(this.fitRegion) : this.fit();
      else { this.camera.x += (this.width - saved.width) / 2; this.camera.y += (this.height - saved.height) / 2; }
      this.liveCamera = null;
    }
    this.invalidate();
  }
  displayEnvironment() { return this.comparisonView?.mode !== 'off' && this.comparisonView?.environment || this.getEnvironment(); }
  zoomBy(factor, px = this.width / 2, py = this.height / 2) {
    this.camera = zoomCamera(this.camera, this.fitCell, factor, px, py);
    this.isFitted = false;
    this.requestDraw();
  }
  pan(dx, dy) { this.isFitted = false; this.camera.x += dx; this.camera.y += dy; this.requestDraw(); }
  cellAt(px, py) { return cellAtPoint(this.camera, px, py); }
  requestDraw() { if (this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); }); }
  draw() {
    const ctx = this.ctx, env = this.displayEnvironment();
    const { width: columns, height: rows } = env.grid;
    const { x: ox, y: oy, cell } = this.camera;
    const view = this.simulationView;
    const historical = !!this.comparisonView && this.comparisonView.mode !== 'off';
    const sim = historical ? null : view?.simulation;
    const individual = view?.knowledgeView ? sim?.agents.find(agent => agent.id === view.selectedId) : null;
    const mode = individual ? 'individual' : historical ? 'none' : view?.mode || 'none';
    const shared = mode === 'shared' ? sim?.sharedKnowledge() : null;
    const heat = mode === 'landmarks' ? new Map(sim?.landmarkHeat().map(item => [item.index, item]) || []) : null;
    const maxVisits = mode === 'paths' && sim ? sim.maxVisitCount || sim.visits.reduce((max, visits) => Math.max(max, visits), 1) : 1;
    const runtime = new Map();
    if (sim) {
      const occupants = individual ? [individual, ...individual.seenOccupants] : sim.occupants();
      for (const occupant of occupants) runtime.set(occupant.position.y * columns + occupant.position.x, occupant);
    }
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false;
    const minX = Math.max(0, Math.floor(-ox / cell)), maxX = Math.min(columns, Math.ceil((this.width - ox) / cell));
    const minY = Math.max(0, Math.floor(-oy / cell)), maxY = Math.min(rows, Math.ceil((this.height - oy) / cell));
    // Round shared edges to device pixels. Adjacent squares exactly meet, with no antialiased seams.
    const ratio = window.devicePixelRatio || 1;
    const snap = value => Math.round(value * ratio) / ratio;
    const cached = (maxX - minX) * (maxY - minY) > 12000 && this.raster.update(env, { mode, individual, simulation: sim, visibility: this.visibility, shared, heat, maxVisits, playing: view?.playing, unknownColor: UNKNOWN_COLOR });
    if (cached) ctx.drawImage(this.raster.canvas, ox, oy, columns * cell, rows * cell);
    if (!cached) for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const index = y * columns + x;
      const px = snap(ox + x * cell), py = snap(oy + y * cell);
      const w = snap(ox + (x + 1) * cell) - px, h = snap(oy + (y + 1) * cell) - py;
      const remembered = individual?.memory.cells[index];
      const terrain = individual ? remembered?.terrain : env.layers.static[index];
      const unknown = individual && !remembered;
      ctx.fillStyle = unknown ? UNKNOWN_COLOR : this.visibility.static ? OBJECTS[terrain].color : '#101116';
      ctx.fillRect(px, py, w, h);
      if (this.visibility.static && terrain === 'obstacle' && cell > 8) this.symbol('×', px, py, w, h, '#e6eae1');
      if (this.visibility.overlays && (individual ? remembered?.closure : env.layers.overlays[index] === 'closure')) {
        ctx.fillStyle = OBJECTS.closure.color; ctx.fillRect(px, py, w, h);
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, w, h); ctx.clip(); ctx.strokeStyle = '#1d0a05'; ctx.lineWidth = Math.max(1, cell / 7);
        for (let stripe = -cell; stripe <= cell * 2; stripe += Math.max(3, cell / 2)) { ctx.beginPath(); ctx.moveTo(px + stripe, py); ctx.lineTo(px + stripe - cell, py + cell); ctx.stroke(); }
        ctx.restore();
      }
      if (terrain === 'construction' && cell > 10 && (individual ? remembered?.constructionMode : env.rules.constructionMode) === 'blocked') this.symbol('×', px, py, w, h, '#311006');
      const inset = cell >= 5 ? Math.max(.5, cell * .12) : 0;
      const tint = () => ctx.fillRect(px + inset, py + inset, Math.max(.5, w - inset * 2), Math.max(.5, h - inset * 2));
      const semantic = this.visibility.semantic && (individual ? remembered?.semantic : env.layers.semantic[index]);
      if (semantic) {
        ctx.fillStyle = OBJECTS[semantic].color; ctx.fillRect(px, py, w, h);
      }
      // Tint after semantic cells so full-cell destination/depot colors cannot hide data.
      if (mode === 'paths' && sim?.visits[index]) {
        ctx.fillStyle = `rgba(61,99,210,${.12 + .36 * Math.sqrt(sim.visits[index] / maxVisits)})`; tint();
      }
      if (mode === 'shared' && shared) {
        ctx.fillStyle = shared[index] ? `rgba(34,137,145,${.1 + .38 * shared[index] / Math.max(1, sim.agents.length)})` : 'rgba(0,0,0,.14)'; tint();
      }
      const heatCell = heat?.get(index);
      if (heatCell) { ctx.fillStyle = `rgba(127,82,188,${.15 + .35 * heatCell.count / Math.max(1, heatCell.total)})`; tint(); }
      if (individual && !unknown) {
        ctx.fillStyle = individual.visible.has(index) ? 'rgba(165,221,255,.12)' : 'rgba(0,0,0,.45)'; ctx.fillRect(px, py, w, h);
        if (individual.visible.has(index) && cell > 6) { ctx.strokeStyle = '#b1ddff50'; ctx.lineWidth = .6; ctx.strokeRect(px + .5, py + .5, w - 1, h - 1); }
      }
      if (heatCell && cell >= 5) {
        ctx.strokeStyle = `rgba(199,145,255,${.3 + .7 * heatCell.count / Math.max(1, heatCell.total)})`; ctx.lineWidth = Math.max(1, cell * .14);
        ctx.strokeRect(px + inset / 2, py + inset / 2, w - inset, h - inset);
      }
      if (semantic && cell > 8) this.symbol(OBJECTS[semantic].symbol, px, py, w, h, OBJECTS[semantic].ink || '#ffffff');
    }
    if (this.grid && cell >= 5) {
      ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 1 / ratio; ctx.beginPath();
      for (let x = minX; x <= maxX; x++) { const px = snap(ox + x * cell); ctx.moveTo(px, snap(oy + minY * cell)); ctx.lineTo(px, snap(oy + maxY * cell)); }
      for (let y = minY; y <= maxY; y++) { const py = snap(oy + y * cell); ctx.moveTo(snap(ox + minX * cell), py); ctx.lineTo(snap(ox + maxX * cell), py); }
      ctx.stroke();
    }
    if (individual) {
      const drawRoute = (indices, color, dashed) => {
        if (indices.length < 2) return;
        ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = dashed ? 2 : 1.5;
        ctx.setLineDash(dashed ? [5, 3] : []);
        indices.forEach((index, n) => {
          const px = ox + (index % columns + .5) * cell, py = oy + (Math.floor(index / columns) + .5) * cell;
          if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
        ctx.stroke(); ctx.restore();
      };
      drawRoute(individual.trail.slice(-2000).map(sample => sample.index), '#ffc478', false);
      drawRoute([individual.position.y * columns + individual.position.x, ...individual.path], '#94ddff', true);
    }
    if (!this.placed) this.placed = env.layers.dynamic.flatMap((type, index) => type ? [{ type, index, position: { x: index % columns, y: Math.floor(index / columns) } }] : []);
    if (this.visibility.dynamic && !historical) {
      if (sim && !individual) for (const start of this.placed.filter(item => item.type === 'robot')) {
        if (runtime.has(start.index)) continue;
        const px = ox + start.position.x * cell, py = oy + start.position.y * cell;
        ctx.strokeStyle = '#effaff66'; ctx.lineWidth = 1; ctx.strokeRect(px + cell * .2, py + cell * .2, cell * .6, cell * .6);
      }
      const occupants = sim ? [...runtime.values()] : this.placed;
      for (const occupant of occupants) {
        const x = occupant.position.x, y = occupant.position.y;
        if (x < minX || x >= maxX || y < minY || y >= maxY) continue;
        const px = snap(ox + x * cell), py = snap(oy + y * cell), entity = occupant.type;
        const radius = Math.max(1.6, cell * .36), robot = entity === 'robot' || entity === 'courier';
        ctx.fillStyle = entity === 'pedestrian' ? OBJECTS.pedestrian.color : entity === 'visitor' || entity === 'explorer' ? '#5ff2f6' : OBJECTS.robot.color;
        ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(1, cell * .12); ctx.beginPath();
        if (robot) ctx.rect(px + cell / 2 - radius, py + cell / 2 - radius, radius * 2, radius * 2); else ctx.arc(px + cell / 2, py + cell / 2, radius, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (robot && cell > 11) { ctx.fillStyle = '#111111'; ctx.fillRect(px + cell * .3, py + cell * .35, cell * .13, cell * .13); ctx.fillRect(px + cell * .57, py + cell * .35, cell * .13, cell * .13); }
        if (occupant.id && occupant.id === view?.selectedId) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(px - 1, py - 1, cell + 2, cell + 2); }
      }
    }
    const area = env.simulation?.activeArea;
    // Individual knowledge never gets a designer's remote-change overlay.
    if (!individual) drawSpatialComparison(ctx, this.camera, this.comparisonView, columns);
    if (area && (area.x !== 0 || area.y !== 0 || area.width !== columns || area.height !== rows)) {
      ctx.strokeStyle = '#ffe655'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(ox + area.x * cell, oy + area.y * cell, area.width * cell, area.height * cell); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#3b3e48'; ctx.lineWidth = 1 / ratio; ctx.strokeRect(snap(ox), snap(oy), snap(columns * cell), snap(rows * cell));
    if (this.rectanglePreview) {
      const { from, to } = this.rectanglePreview;
      const x = Math.max(0, Math.min(from[0], to[0])), y = Math.max(0, Math.min(from[1], to[1]));
      const right = Math.min(columns, Math.max(from[0], to[0]) + 1), bottom = Math.min(rows, Math.max(from[1], to[1]) + 1);
      if (right > x && bottom > y) {
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(ox + x * cell, oy + y * cell, (right - x) * cell, (bottom - y) * cell);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(ox + x * cell, oy + y * cell, (right - x) * cell, (bottom - y) * cell);
      }
    }
    const highlight = (coordinates, color, width, size = 1) => {
      if (!coordinates || indexAt(env, ...coordinates) < 0) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      const radius = Math.floor(size / 2);
      ctx.strokeRect(snap(ox + (coordinates[0] - radius) * cell) + width / 2, snap(oy + (coordinates[1] - radius) * cell) + width / 2, cell * size - width, cell * size - width);
    };
    highlight(this.selected, '#91d5ff', 2);
    highlight(this.hover, '#ffffff', 1, ['paint', 'erase'].includes(this.tool) ? this.brushSize : 1);
  }
  symbol(text, x, y, w, h, color) {
    this.ctx.fillStyle = color; this.ctx.font = `bold ${Math.max(6, w * .65)}px monospace`;
    this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText(text, x + w / 2, y + h / 2 + .5);
  }
}
