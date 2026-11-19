#!/usr/bin/env python3
"""Offline, dependency-free rasterization of the separately stored NYC GeoJSON snapshot."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
WIDTH, HEIGHT = 256, 512
RADIUS = 6378137


def project(point):
    lon, lat = point[:2]
    return RADIUS * math.radians(lon), RADIUS * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def ring_area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))) / 2


def paint_polygon(rings, target, value):
    # Scanline center sampling, respecting holes, in projected square cells.
    for ring_number, ring in enumerate(rings):
        grid = [((x - min_x) / cell_size, (max_y - y) / cell_size) for x, y in map(project, ring)]
        if not grid:
            continue
        for row in range(max(0, math.floor(min(y for _, y in grid))), min(HEIGHT, math.ceil(max(y for _, y in grid)))):
            scan = row + .5
            intersections = []
            for a, b in zip(grid, grid[1:] + grid[:1]):
                if (a[1] > scan) != (b[1] > scan):
                    intersections.append(a[0] + (scan - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
            intersections.sort()
            for left, right in zip(intersections[::2], intersections[1::2]):
                for col in range(max(0, math.ceil(left - .5)), min(WIDTH, math.ceil(right - .5))):
                    target[row * WIDTH + col] = value if ring_number == 0 else 0


def rle(values):
    output = []
    for value in values:
        if output and output[-1][0] == value:
            output[-1][1] += 1
        else:
            output.append([value, 1])
    return output


shoreline = json.loads((DATA / 'geography/shoreline.geojson').read_text())
streets = json.loads((DATA / 'geography/streets.geojson').read_text())
parks = json.loads((DATA / 'geography/parks.geojson').read_text())
snapshot = json.loads((DATA / 'geography/snapshot.json').read_text())
snapshot_date = snapshot['snapshotDate']
polygons = shoreline['features'][0]['geometry']['coordinates']
island = max(polygons, key=lambda polygon: ring_area(polygon[0]))
points = list(map(project, island[0]))
xs, ys = zip(*points)
cell_size = max((max(xs) - min(xs)) / (WIDTH - 8), (max(ys) - min(ys)) / (HEIGHT - 8))
min_x = (max(xs) + min(xs) - WIDTH * cell_size) / 2
max_y = (max(ys) + min(ys) + HEIGHT * cell_size) / 2
land = [0] * (WIDTH * HEIGHT)
paint_polygon(island, land, 1)
# 0 water; 1 aggregated blocked urban land; 2 road corridor; 3 park.
terrain = [1 if value else 0 for value in land]
access = [0] * len(land)
for feature in parks['features']:
    geometry = feature.get('geometry')
    if not geometry:
        continue
    park_mask = [0] * len(land)
    for polygon in geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]:
        paint_polygon(polygon, park_mask, 1)
    for index, value in enumerate(park_mask):
        if value and land[index]:
            terrain[index] = 3


def mark(col, row):
    if 0 <= col < WIDTH and 0 <= row < HEIGHT:
        index = row * WIDTH + col
        if land[index]:
            access[index] = 1
            if terrain[index] != 3:
                terrain[index] = 2


def segment(a, b):
    ax, ay = project(a)
    bx, by = project(b)
    x, y = math.floor((ax - min_x) / cell_size), math.floor((max_y - ay) / cell_size)
    tx, ty = math.floor((bx - min_x) / cell_size), math.floor((max_y - by) / cell_size)
    dx, dy = abs(tx - x), -abs(ty - y)
    sx, sy = (1 if x < tx else -1), (1 if y < ty else -1)
    error = dx + dy
    while True:
        mark(x, y)
        if x == tx and y == ty:
            break
        double = 2 * error
        old_x, old_y = x, y
        if double >= dy:
            error += dy
            x += sx
        if double <= dx:
            error += dx
            y += sy
        if x != old_x and y != old_y:
            # Cardinal bridge within the rasterized diagonal corridor; not a new street.
            mark(x, old_y)


for feature in streets['features']:
    geometry = feature.get('geometry')
    if not geometry:
        continue
    lines = geometry['coordinates'] if geometry['type'] == 'MultiLineString' else [geometry['coordinates']]
    for line in lines:
        for a, b in zip(line, line[1:]):
            segment(a, b)

manifest = {
    'id': f'nyc-manhattan-island-{snapshot_date}', 'width': WIDTH, 'height': HEIGHT,
    'snapshotDate': snapshot_date, 'crs': 'EPSG:3857',
    'bounds': [min_x, max_y - HEIGHT * cell_size, min_x + WIDTH * cell_size, max_y],
    'cellSizeProjected': cell_size, 'cellSizeMeters': cell_size * math.cos(math.radians(40.79)),
    'palette': ['water', 'building', 'road', 'park'],
    'terrain': rle(terrain), 'access': rle(access),
    'counts': {kind: terrain.count(code) for code, kind in enumerate(['water', 'building', 'road', 'park'])},
    'datasets': [
        {'name': 'Borough Boundaries', 'agency': 'NYC DCP', 'id': 'gthc-hcne', 'features': len(shoreline['features'])},
        {'name': 'Street Centerline', 'agency': 'NYC OTI', 'id': 'inkn-q76z', 'features': len(streets['features'])},
        {'name': 'Parks Properties', 'agency': 'NYC Parks', 'id': 'enfh-gkve', 'features': len(parks['features'])},
    ],
    'sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (DATA / 'geography').glob('*.geojson')},
}
(DATA / 'manhattan-base.js').write_text('// Derived geographic snapshot. Rebuild with python3 scripts/build-manhattan.py.\nexport default ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
print(json.dumps({key: manifest[key] for key in ['width', 'height', 'cellSizeMeters', 'counts']}, indent=2))
