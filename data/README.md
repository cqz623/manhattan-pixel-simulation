# Manhattan geographic snapshot

The application uses a **real-data-backed, aggregated Manhattan Island raster**, separate from authored/editable simulation state. It does not contain surveyed building footprints, businesses, traffic measurements, or pedestrian access permissions.

Snapshot: **2026-11-18**. Source data are GeoJSON in WGS84 longitude/latitude. `geography/snapshot.json` records the exact queries, feature counts, date and SHA-256 hashes. The browser loads only the compact, derived `manhattan-base.js` ES module; no network GIS service is needed at runtime.

| File | Primary NYC Open Data source | Selected features |
| --- | --- | ---: |
| `geography/shoreline.geojson` | [Borough Boundaries — NYC DCP](https://data.cityofnewyork.us/d/gthc-hcne) | 1 Manhattan borough MultiPolygon |
| `geography/streets.geojson` | [Street Centerline — NYC OTI](https://data.cityofnewyork.us/d/inkn-q76z) | 10,828 |
| `geography/parks.geojson` | [Parks Properties — NYC Parks](https://data.cityofnewyork.us/Recreation/Parks-Properties/enfh-gkve) | 396 |

The street query selects Manhattan roadway/path types `1, 6, 8, 9`, excluding segments explicitly marked nonpedestrian `V`. Park records exclude retired properties. This is a coarse simulation filter, not a legal pedestrian-routing guarantee. See the saved queries for exact field names and selections. Source attribution and conditions are available in the linked datasets and [NYC.gov terms](https://www.nyc.gov/main/terms-of-use).

## Rasterization

`python3 scripts/build-manhattan.py` uses only Python's standard library and the checked-in snapshot. It:

1. Selects the largest polygon of Manhattan's borough boundary, representing the continuous island from Battery Park to Inwood. Associated islands and detached borough territory such as Marble Hill are excluded.
2. Projects to EPSG:3857 and fits **256 × 512 square projected cells**, with four cells of padding. Projected cell width is approximately 51.88 m; the nominal ground size at latitude 40.79° is **39.28 m**. Ground scale varies with latitude.
3. Center-samples the island and park polygons, including holes, into the raster.
4. Draws street centerlines with cardinal raster connections. A diagonal source segment becomes a staircase that four-neighbor grid agents can traverse. This changes widths and connectivity at coarse resolution.
5. Marks explicit park access only where selected source street/path corridors cross park cells. Other park cells remain green and blocked. Park rendering is not evidence of access.
6. Uses blue, blocked **aggregated urban land** for remaining island cells. This is not imported building geometry: multiple objects share a cell, some objects vanish during aggregation, and the entire nonpark land background is a model assumption.
7. Produces run-length-encoded terrain/access arrays, bounds, resolution, source counts and hashes in `manhattan-base.js`.

`src/manhattan.js` creates fresh editable arrays from this base. It separately authors depot/destination/start positions and crowd treatments in four connected demo windows. These are game locations and costs, not real facilities or crowds. Editing does not mutate the raw GeoJSON or derived base asset.

## Reproduce or refresh

Rebuild the exact bundled snapshot offline:

```sh
python3 scripts/build-manhattan.py
npm test
```

An **intentional refresh** fetches current source data and changes the snapshot date:

```sh
python3 scripts/download-geography.py --refresh
python3 scripts/build-manhattan.py
npm test
```

The downloader uses system `curl` with verified TLS, stages all three responses, checks for empty/truncated collections, then replaces the local snapshot. No API key or backend is required. API schemas and live data may change; review the new raster/provenance before using it. The original checked-in snapshot remains the reproducibility anchor until intentionally replaced.
