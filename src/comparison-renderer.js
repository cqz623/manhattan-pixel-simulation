import { COMPARISON_COLORS as COLORS } from './spatial-comparison.js';

/** Designer-only retrospective overlays; no simulation state is mutated here. */
export function drawSpatialComparison(ctx, camera, view, columns) {
  if (!view?.data?.compatible) return;
  const { data, mode, showChanges, showKnowledge } = view, { x: ox, y: oy, cell } = camera;
  const point = index => [ox + (index % columns + .5) * cell, oy + (Math.floor(index / columns) + .5) * cell];
  ctx.save();
  const variants = mode === 'a' ? [['a', data.indexedA]] : mode === 'b' ? [['b', data.indexedB]] : mode === 'overlay' ? [['a', data.indexedA], ['b', data.indexedB]] : [];
  if (showKnowledge) for (const [variant, indexed] of variants) {
    ctx.fillStyle = variant === 'a' ? '#69e4ff22' : '#ff91ce22';
    for (const index of indexed.known) ctx.fillRect(ox + index % columns * cell, oy + Math.floor(index / columns) * cell, cell, cell);
    ctx.strokeStyle = COLORS[variant]; ctx.lineWidth = Math.max(1, Math.min(2, cell * .12)); ctx.setLineDash(variant === 'b' ? [3, 2] : []);
    for (const place of indexed.landmarks.values()) {
      const [x, y] = point(place.index), radius = cell * (variant === 'a' ? .42 : .3);
      ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  for (const [variant, indexed] of variants) {
    const max = [...indexed.edges.values()].reduce((largest, edge) => Math.max(largest, edge.count), 1);
    ctx.strokeStyle = COLORS[variant]; ctx.setLineDash(variant === 'b' ? [4, 2] : []);
    for (const edge of indexed.edges.values()) {
      const [x1, y1] = point(edge.from), [x2, y2] = point(edge.to);
      ctx.globalAlpha = .5 + .4 * Math.sqrt(edge.count / max);
      ctx.lineWidth = mode === 'overlay' && variant === 'a' ? Math.max(2.8, Math.min(4.5, cell * .3)) : Math.max(1.2, Math.min(2, cell * .16));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  if (showChanges) for (const change of data.changes) {
    const x = ox + change.x * cell, y = oy + change.y * cell, inset = Math.max(.25, cell * .08);
    ctx.fillStyle = COLORS[change.kind] + '33'; ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = COLORS[change.kind]; ctx.lineWidth = Math.max(1.3, Math.min(3, cell * .14));
    ctx.strokeRect(x + inset, y + inset, Math.max(.5, cell - inset * 2), Math.max(.5, cell - inset * 2));
    if (cell > 5 && ['blocked', 'passage'].includes(change.kind)) {
      ctx.beginPath();
      if (change.kind === 'blocked') {
        ctx.moveTo(x + cell * .25, y + cell * .25); ctx.lineTo(x + cell * .75, y + cell * .75);
        ctx.moveTo(x + cell * .75, y + cell * .25); ctx.lineTo(x + cell * .25, y + cell * .75);
      } else {
        ctx.moveTo(x + cell * .5, y + cell * .25); ctx.lineTo(x + cell * .5, y + cell * .75);
        ctx.moveTo(x + cell * .25, y + cell * .5); ctx.lineTo(x + cell * .75, y + cell * .5);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
