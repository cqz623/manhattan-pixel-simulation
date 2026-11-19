import { OBJECTS } from './environment.js';

const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const COLORS = Object.fromEntries(Object.entries(OBJECTS).map(([key, value]) => [key, rgb(value.color)]));
const mix = (color, tint, alpha) => color.map((channel, n) => Math.round(channel * (1 - alpha) + tint[n] * alpha));

/** One source pixel per cell for the overview; nearest-neighbor drawing stays crisp.
 * Close zooms keep the detailed cell renderer, including inset overlays and glyphs. */
export class RasterCache {
  constructor() { this.canvas = null; this.context = null; this.key = null; this.environment = null; }
  invalidate() { this.key = null; }
  update(environment, { mode, individual, simulation, visibility, shared, heat, maxVisits, playing, unknownColor }) {
    if (!this.canvas) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      this.context = this.canvas?.getContext('2d');
      if (!this.context?.createImageData || !this.context?.putImageData) return false;
    }
    if (!this.context) return false;
    const tick = playing && mode !== 'none' ? Math.floor((simulation?.tick || 0) / 4) : mode === 'none' ? 0 : simulation?.tick || 0;
    const key = `${mode}|${individual?.id || ''}|${tick}|${Object.values(visibility).join('')}`;
    if (this.key === key && this.environment === environment) return true;
    const { width, height } = environment.grid;
    this.canvas.width = width; this.canvas.height = height;
    const image = this.context.createImageData(width, height);
    if (!image?.data) return false;
    const unknown = rgb(unknownColor);
    for (let index = 0; index < width * height; index++) {
      const remembered = individual?.memory.cells[index];
      let color;
      if (individual && !remembered) color = unknown;
      else {
        const terrain = individual ? remembered.terrain : environment.layers.static[index];
        color = visibility.static ? COLORS[terrain] : [16, 17, 22];
        const closure = individual ? remembered.closure : environment.layers.overlays[index] === 'closure';
        if (visibility.overlays && closure) color = COLORS.closure;
        const semantic = visibility.semantic && (individual ? remembered.semantic : environment.layers.semantic[index]);
        if (semantic) color = COLORS[semantic];
        if (mode === 'paths' && simulation?.visits[index]) color = mix(color, [61, 99, 210], .12 + .36 * Math.sqrt(simulation.visits[index] / maxVisits));
        if (mode === 'shared') color = shared?.[index] ? mix(color, [34, 137, 145], .1 + .38 * shared[index] / Math.max(1, simulation.agents.length)) : mix(color, [0, 0, 0], .14);
        const knownPlace = heat?.get(index);
        if (knownPlace) color = mix(color, [127, 82, 188], .15 + .35 * knownPlace.count / Math.max(1, knownPlace.total));
        if (individual) color = individual.visible.has(index) ? mix(color, [165, 221, 255], .12) : mix(color, [0, 0, 0], .45);
      }
      const offset = index * 4; image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
    }
    this.context.putImageData(image, 0, 0); this.key = key; this.environment = environment;
    return true;
  }
}
