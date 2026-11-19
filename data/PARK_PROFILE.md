# NYC park-type input for an abstract city

**Source:** [NYC Parks Properties, NYC Open Data, dataset `enfh-gkve`](https://data.cityofnewyork.us/Recreation/Parks-Properties/enfh-gkve), provided by NYC Parks. Historical snapshot date: **2026-11-18**. No geographic shapes or coordinates enter the active application.

The selected snapshot contains **396 Manhattan property records**, including **66 classified as Neighborhood Park**. These are record counts, not unique-park area, land cover, pedestrian traffic or a measured park density. The source selection is `borough='M' AND (retired=false OR retired is null)`.

The small aggregate can be verified directly against the [NYC category-count API](https://data.cityofnewyork.us/resource/enfh-gkve.json?%24select=typecategory%2Ccount%28%2A%29%20as%20property_records&%24where=borough%3D%27M%27%20AND%20%28retired%3Dfalse%20OR%20retired%20is%20null%29&%24group=typecategory&%24order=typecategory&%24limit=1000). This endpoint was checked during implementation and returned 17 categories, 396 total records and 66 Neighborhood Park records. Future live counts may differ; reproducible generation uses the saved snapshot.

## Transformation and use

Enable **Editor → Use NYC park-type ratio**, then Generate Abstract Manhattan:

```text
optional random park-block probability = 66 / 396 = 0.1666666667
```

The normal abstract generator uses probability 0.11 for additional random park blocks. The optional input replaces that probability with the observed category-count ratio. The central green district and connected orthogonal roads remain authored abstract rules. The mapping of a category ratio to a per-block probability is a **simulation design assumption**, not an estimate of Manhattan's park area or a recreation of actual spatial distribution. Other block categories may also change because the seeded generator's conditional draws change.

The output remains `source.kind = 'schematic'`, with null geographic bounds and a `source.dataId` identifying this versioned profile. JSON save/load preserves that provenance. No real-world travel costs or agent performance are derived from these counts.

## Reproduction and evidence

- [`nyc-park-types.csv`](nyc-park-types.csv): 17 category counts, without geometry.
- [`nyc-park-profile.js`](nyc-park-profile.js): small runtime summary, source URL, snapshot/hash, counts and transformation.
- [`geography/snapshot.json`](geography/snapshot.json): historical source query and SHA-256 fingerprint.
- `scripts/build-park-profile.py`: checks the saved source hash and extracts category counts from the retained raw snapshot. It reads properties only; it does not rasterize or import geometry into the app.

Rebuild the count input with:

```sh
python3 scripts/build-park-profile.py
npm test
```

The historical full-island raster and GIS build scripts remain inactive compatibility material. This secondary data feature does not load them. Real data informs one generation parameter; all terrain costs, agent rules and environmental changes remain explicit simulation assumptions.
