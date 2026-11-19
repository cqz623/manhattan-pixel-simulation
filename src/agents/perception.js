import { cellIndex, positionOf, opaque } from './nav.js';

export const VISION = Object.freeze({ radius: 6, fovDegrees: 100, near: 1.5 });
export const perceptionCapability = Object.freeze({ available: true, phase: 2 });

/** Supercover ray: walls at the target are visible; walls at diagonal corners occlude. */
export function hasLineOfSight(world, from, to) {
  let x = from.x, y = from.y;
  const dx = to.x - x, dy = to.y - y;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const deltaX = dx ? 1 / Math.abs(dx) : Infinity, deltaY = dy ? 1 / Math.abs(dy) : Infinity;
  let tx = deltaX / 2, ty = deltaY / 2;
  const target = cellIndex(to.x, to.y, world.width, world.height);
  const blocked = (cx, cy) => {
    const index = cellIndex(cx, cy, world.width, world.height);
    return index < 0 || (index !== target && opaque(world.cell(index)));
  };
  while (x !== to.x || y !== to.y) {
    if (Math.abs(tx - ty) < 1e-10) {
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
      x += sx; y += sy; tx += deltaX; ty += deltaY;
    } else if (tx < ty) { x += sx; tx += deltaX; }
    else { y += sy; ty += deltaY; }
    if (blocked(x, y)) return false;
  }
  return true;
}

/** The sensing boundary. Only this module reads global geometry to produce observations. */
export function perceive(world, agent, occupants = [], vision = VISION) {
  const visible = new Set();
  const reach = Math.ceil(vision.radius), eye = agent.position;
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const distance = Math.hypot(dx, dy);
    if (distance > vision.radius) continue;
    const index = cellIndex(eye.x + dx, eye.y + dy, world.width, world.height);
    if (index < 0 || (world.inArea && !world.inArea(index))) continue;
    const angle = Math.atan2(dy, dx) - agent.heading;
    const difference = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (distance > vision.near && difference > vision.fovDegrees * Math.PI / 360) continue;
    if (!hasLineOfSight(world, eye, positionOf(index, world.width))) continue;
    visible.add(index);
  }
  const detected = occupants.filter(other => other.id !== agent.id && visible.has(cellIndex(other.position.x, other.position.y, world.width, world.height)))
    .map(other => ({ id: other.id, type: other.type, position: { ...other.position } }));
  // Congestion estimates include detected occupants only, never people hidden by walls.
  return { cells: [...visible].map(index => ({ index, ...world.cell(index, detected) })), visible, occupants: detected };
}
