// Derived non-geometric data; rebuild with python3 scripts/build-park-profile.py.
export const PARK_PROFILE = Object.freeze({
  "id": "nyc-parks-types-2026-11-18",
  "name": "NYC Parks Properties \u2014 Manhattan type mix",
  "dataset": "enfh-gkve",
  "url": "https://data.cityofnewyork.us/Recreation/Parks-Properties/enfh-gkve",
  "query": "https://data.cityofnewyork.us/resource/enfh-gkve.geojson?%24where=borough%3D%27M%27+AND+%28retired%3Dfalse+OR+retired+is+null%29&%24select=multipolygon%2Csignname%2Ctypecategory%2Cgispropnum&%24limit=10000",
  "snapshotDate": "2026-11-18",
  "sourceSha256": "773c8171d01c09e3ca6800d16b039155a51c48f47715bc155eacfac192ee4dae",
  "counts": {
    "Buildings/Institutions": 6,
    "Community Park": 25,
    "Flagship Park": 2,
    "Garden": 105,
    "Historic House Park": 3,
    "Jointly Operated Playground": 34,
    "Mall": 11,
    "Managed Sites": 1,
    "Nature Area": 2,
    "Neighborhood Park": 66,
    "Parkway": 3,
    "Playground": 44,
    "Recreational Field/Courts": 11,
    "Strip": 2,
    "Triangle/Plaza": 73,
    "Undeveloped": 2,
    "Waterfront Facility": 6
  },
  "total": 396,
  "neighborhoodParks": 66,
  "parkBlockProbability": 0.16666666666666666,
  "transformation": "Neighborhood Park record count / all selected Manhattan park-property records becomes the optional random park-block probability. This mapping is a simulation assumption, not measured park area or actual spatial distribution."
});
