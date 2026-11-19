import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, zoomCamera, cellAtPoint } from '../src/camera.js';

test('fit keeps the entire square raster in common desktop map viewports', () => {
  // Map viewport sizes after subtracting panels, headers, and spacing.
  for (const [width, height] of [[534, 441], [714, 529], [874, 621], [1314, 801]]) {
    for (const size of [32, 64, 96]) {
      const camera = fitCamera(width, height, size, size);
      assert.ok(camera.x >= 30); assert.ok(camera.y >= 32);
      assert.ok(camera.x + size * camera.cell <= width - 30);
      assert.ok(camera.y + size * camera.cell <= height - 32);
      assert.deepEqual(cellAtPoint(camera, camera.x + camera.cell / 2, camera.y + camera.cell / 2), [0, 0]);
    }
  }
});

test('zoom keeps the world position under the cursor stable and enforces limits', () => {
  const camera = fitCamera(800, 600, 64, 64), pointer = [317, 228];
  const world = [(pointer[0] - camera.x) / camera.cell, (pointer[1] - camera.y) / camera.cell];
  for (const factor of [.001, .5, 2, 100]) {
    const zoomed = zoomCamera(camera, camera.cell, factor, ...pointer);
    assert.ok(Math.abs((pointer[0] - zoomed.x) / zoomed.cell - world[0]) < 1e-10);
    assert.ok(Math.abs((pointer[1] - zoomed.y) / zoomed.cell - world[1]) < 1e-10);
    assert.ok(zoomed.zoom >= .35 && zoomed.zoom <= 12);
  }
});

test('hit testing follows pan and fractional zoom, including outside cells', () => {
  const fitted = fitCamera(714, 529, 64, 64);
  const camera = zoomCamera(fitted, fitted.cell, 2.35, 200, 180);
  camera.x += 173; camera.y -= 92;
  for (const [x, y] of [[0, 0], [23, 39], [63, 63], [-1, 20]]) {
    assert.deepEqual(cellAtPoint(camera, camera.x + (x + .5) * camera.cell, camera.y + (y + .5) * camera.cell), [x, y]);
  }
});
