#!/usr/bin/env python3
"""Extract a tiny, non-geometric real-data input from the verified NYC parks snapshot."""
from collections import Counter
from pathlib import Path
import csv
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / 'data/geography/parks.geojson'
snapshot = json.loads((root / 'data/geography/snapshot.json').read_text())
record = next(item for item in snapshot['sources'] if item['file'] == 'parks.geojson')
assert hashlib.sha256(source.read_bytes()).hexdigest() == record['sha256'], 'Source hash changed; review the snapshot.'
features = json.loads(source.read_text())['features']
counts = Counter(feature['properties']['typecategory'] for feature in features)
assert sum(counts.values()) == len(features) and counts['Neighborhood Park'] > 0
with (root / 'data/nyc-park-types.csv').open('w', newline='') as output:
    writer = csv.writer(output); writer.writerow(['typecategory', 'property_records'])
    writer.writerows(sorted(counts.items()))
profile = {
    'id': 'nyc-parks-types-' + snapshot['snapshotDate'],
    'name': 'NYC Parks Properties — Manhattan type mix', 'dataset': 'enfh-gkve',
    'url': 'https://data.cityofnewyork.us/Recreation/Parks-Properties/enfh-gkve',
    'query': record['query'], 'snapshotDate': snapshot['snapshotDate'], 'sourceSha256': record['sha256'],
    'counts': dict(sorted(counts.items())), 'total': len(features),
    'neighborhoodParks': counts['Neighborhood Park'],
    'parkBlockProbability': counts['Neighborhood Park'] / len(features),
    'transformation': 'Neighborhood Park record count / all selected Manhattan park-property records becomes the optional random park-block probability. This mapping is a simulation assumption, not measured park area or actual spatial distribution.',
}
(root / 'data/nyc-park-profile.js').write_text('// Derived non-geometric data; rebuild with python3 scripts/build-park-profile.py.\nexport const PARK_PROFILE = Object.freeze(' + json.dumps(profile, indent=2) + ');\n')
print(f"{len(features)} property records, {counts['Neighborhood Park']} Neighborhood Park records; probability {profile['parkBlockProbability']:.6f}")
