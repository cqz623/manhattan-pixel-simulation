/** Pure camera math shared by rendering and tests. Units are CSS pixels. */
export function fitCamera(viewWidth, viewHeight, columns, rows, insets = { left: 16, right: 16, top: 72, bottom: viewWidth <= 1100 ? 144 : 112 }) {
  const availableWidth = Math.max(1, viewWidth - insets.left - insets.right), availableHeight = Math.max(1, viewHeight - insets.top - insets.bottom);
  const cell = Math.max(.25, Math.min(availableWidth / columns, availableHeight / rows));
  return { x: insets.left + (availableWidth - columns * cell) / 2, y: insets.top + (availableHeight - rows * cell) / 2, cell, zoom: 1 };
}
export function zoomCamera(camera, fitCell, factor, px, py) {
  const zoom = Math.min(12, Math.max(.35, camera.zoom * factor));
  const cell = fitCell * zoom;
  return { x: px - (px - camera.x) * cell / camera.cell, y: py - (py - camera.y) * cell / camera.cell, cell, zoom };
}
export function cellAtPoint(camera, px, py) {
  return [Math.floor((px - camera.x) / camera.cell), Math.floor((py - camera.y) / camera.cell)];
}
export function fitAreaCamera(viewWidth, viewHeight, area) {
  const camera = fitCamera(viewWidth, viewHeight, area.width, area.height);
  camera.x -= area.x * camera.cell; camera.y -= area.y * camera.cell;
  return camera;
}
