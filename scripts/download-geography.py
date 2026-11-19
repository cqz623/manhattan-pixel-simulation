#!/usr/bin/env python3
"""Refresh the separate NYC source snapshot with system curl's verified TLS.
Runtime never downloads GIS. Rebuild manhattan-base.js after an intentional refresh.
"""
import argparse
import datetime
import hashlib
import json
import subprocess
import urllib.parse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh', action='store_true', help='Replace the existing local geographic snapshot')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'data/geography'
root.mkdir(parents=True, exist_ok=True)
if (root / 'snapshot.json').exists() and not args.refresh:
    parser.error('A snapshot already exists. Use --refresh to intentionally replace it, then rebuild the raster.')
sources = [
    ('shoreline.geojson', 'gthc-hcne', {'$where': 'borocode=1', '$select': 'the_geom,boroname', '$limit': 5}),
    ('streets.geojson', 'inkn-q76z', {'$where': "boroughcode='1' AND rw_type in (1,6,8,9) AND (nonped is null OR nonped != 'V')", '$select': 'the_geom,full_street_name,rw_type,physicalid', '$limit': 50000}),
    ('parks.geojson', 'enfh-gkve', {'$where': "borough='M' AND (retired=false OR retired is null)", '$select': 'multipolygon,signname,typecategory,gispropnum', '$limit': 10000}),
]
staged, records = [], []
try:
    for filename, identifier, params in sources:
        url = f'https://data.cityofnewyork.us/resource/{identifier}.geojson?' + urllib.parse.urlencode(params)
        temporary = root / (filename + '.download')
        staged.append((temporary, root / filename))
        subprocess.run(['curl', '--fail', '--location', '--compressed', '--retry', '2', '--connect-timeout', '30', '--max-time', '180', '--output', str(temporary), url], check=True)
        value = json.loads(temporary.read_text())
        count = len(value.get('features', []))
        if value.get('type') != 'FeatureCollection' or not 0 < count < params['$limit']:
            raise ValueError(f'{filename}: missing or possibly truncated data. Inspect API response / add pagination.')
        records.append({'file': filename, 'dataset': identifier, 'query': url, 'features': count, 'sha256': hashlib.sha256(temporary.read_bytes()).hexdigest()})
    for temporary, final in staged:
        temporary.replace(final)
    (root / 'snapshot.json').write_text(json.dumps({'snapshotDate': datetime.date.today().isoformat(), 'sources': records}, indent=2) + '\n')
    print('Geography refreshed. Run python3 scripts/build-manhattan.py and npm test; review changed provenance and map.')
finally:
    for temporary, _ in staged:
        temporary.unlink(missing_ok=True)
