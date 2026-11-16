/** Text shared by the in-game sources screen. The README cites the same sources. */

export const OSM_CREDIT =
  '© OpenStreetMap contributors. Coastline, breakwaters, piers, building footprints, and seamarks are from OpenStreetMap, under the Open Database Licence (ODbL). Extracted from the Overpass API on 2026-11-16 (OSM timestamp 2026-11-16T21:22:36Z) and checked in at data/herzliya/osm.json so the build does not need the network.';

export const BATHY_CREDIT =
  'EMODnet Bathymetry Consortium (2022). EMODnet Digital Bathymetry (DTM) 2022. Creative Commons Attribution 4.0 International. The grid is 1/16 arc-minute, about 115 m, elevation in metres positive up. The catalogue constraint is “DO NOT USE FOR NAVIGATION”. Checked in at data/herzliya/bathy.json from the EMODnet WCS coverage emodnet__mean_2022, subset Lat 32.145–32.185, Long 34.775–34.815.';

export const ASSUMPTIONS: readonly string[] = [
  'Inside the marina basin the depth is a flat 3.5 m. That is an assumed dredged depth for this prototype, not a sounding and not a chart.',
  'The two large marina breakwaters are drawn 4.5 m above the water, and the shorter northern shore breakwaters 3 m. OpenStreetMap does not give their height.',
  'Buildings use building:levels × 3.2 m where OSM has levels. Footprints with no levels are drawn 9 m tall.',
  'Piers are centre-lines. They are drawn and treated as 2.4 m wide pontoons.',
  'A cluster of EMODnet cells just north of the marina reads about 100–675 m deep beside a 10 m shelf. Those cells are kept in the extract and ignored for shading, waves, and grounding. Neighbours on the shelf replace them. A canyon of that depth does not belong on this coast at this resolution.',
  'Within 40 m of the OSM coastline, on the water side, depth is ramped down to the shore. The 115 m grid does not resolve the beach.',
  'The same grid reads 0 across the entrance. Within 48 m of the line between the two entrance lights, and outside the breakwater rock, depth is treated as a 4.2 m channel. That is an assumption, not a sounding.',
  'The two yellow marks outside the entrance are practice marks for this scenario. They are not seamarks. OSM has no offshore buoys here. The entrance marks that are in OSM are the red and green lights, both Fl 5s.',
  'No rock or reef features were in the extract. Grounding is shoal water, land, and the breakwater footprints.',
];
