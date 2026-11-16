# Project Bluewater

A controller-first sailing prototype: one Laser/ILCA-like dinghy, wind, and a moderate sea. Step 1 is a browser build aimed at desktop Chrome/Edge and Microsoft Edge on Xbox. There is no account, no backend, and no paid art.

The boat, the wind, and the water are separate modules. Sailing (tacks, gybes, the no-go zone, leeway, heel) comes out of the forces rather than a scripted animation.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8734/.

```bash
npm test            # vitest physics
npm run build       # dist/ for GitHub Pages, and dist-single/index.html
npm run preview     # serves dist at http://127.0.0.1:8735/bluewater-prototype/
npm run test:e2e    # needs a build first; Playwright loads the preview
```

`dist/` is the static site with `base` set to `/bluewater-prototype/` so it can sit on GitHub Pages. GitHub Pages (source: GitHub Actions) publishes from `.github/workflows/pages.yml` on every push to `main`: https://verbosegod.github.io/bluewater-prototype/

## Controls

The left stick steers the **bow** (wheel sense: stick right, bow right). The on-screen tiller swings like a real tiller, opposite the bow. Triggers are analogue: hold them and the sheet moves at a matching rate.

| Xbox | Keyboard (dev) | Action |
| --- | --- | --- |
| Left stick X | A / D or Left / Right | Steer the bow |
| Right trigger | W or Up | Sheet in |
| Left trigger | S or Down | Sheet out |
| A (hold) | Space | Move the sailor out, to windward, and hike |
| B (hold) | B | Move the sailor in, across the boat, and slightly to leeward |
| Y | Y | Assisted / Full manual |
| LB, on the debrief | H | Open docking practice |
| D-pad up / right / down | 1 / 2 / 3, C cycles | Chase / cockpit / top-down |
| Right stick | I J K L | Orbit the chase camera (it eases back) |
| View | R | Reset the boat. The track stays, with a gap. |
| Menu | P or Esc | Pause and debrief |
| X | G | Graphics quality, Low / High |
| — | V or 4 | Cinematic camera |

**Assisted** draws an approximate no-go arc, an amber mark on the sheet bar, and a prompt to change sides in a tack or gybe. **Full manual** hides all three. The sailor still has to cross the boat either way.

The sailor's lateral position is a real control, not a pose. A moves them out toward whichever side is windward and, held, hikes them. B moves them in through the cockpit and, held, onto the leeward side. In a tack or gybe they have to change sides. Crossing while the old sail is still powered heels the boat onto the new leeward side and slows it. Staying on the old rail heels and stalls the exit, and a late gybe can carry the roll through to a windward capsize. Below 6 kn true, sitting in or a little to leeward is faster than hiking.

## Feel, in 11 kn of true wind

Settled with a decent sheet:

- Inside about 35° the boat stops and the sail is luffing. Between about 38° and 45° it pinches: speed falls off and the windward telltales lift before the stall.
- Close-hauled at 45° is about 4.7 kn and at 50° about 4.9 kn. Best VMG stays around 42–45°.
- A beam reach is about 5.9 kn. The displacement hump is softer on that heading, which is what lets the boat sit near 6 kn.
- A broad reach, about 120–135°, is about 5.5–6 kn. That band is aft of the beam window, so it gets its own share of the hump relief.
- A good tack (smooth helm, sheet eased through the wind, sailor across as the sail goes light) keeps about 60% of entry speed, roughly 4.9 kn down to 3.0 kn, and takes about 4–5 seconds. A rushed helm with the sheet pinned and the sailor left on the old rail keeps about a third of that speed.
- Heel steers. Leeward heel rounds the boat up; windward heel bears it away. A gust upwind does the same unless you hike, ease, or feather. A flat reach with the tiller centered does not walk up.
- Planing starts when a gust takes the true wind to about 13–14 kn on a broad reach, with the sheet eased and the boat flat, and it stays on down to about 11 kn. Once the boat is up, the apparent wind comes forward and the sheet has to come in or the sail luffs and the plane dies.
- A dead run with the sheet over-eased rolls. Sailing by the lee gybes the boom without a helm movement.
- In 16 kn or more, a gybe with the sheet eased and no hike can capsize.

Telltales still follow angle of attack: the windward one lifts when the sail is starved, the leeward one when it is stalled.

Menu opens the debrief: track, tacks, gybes, and the session stats.

## Graphics

Low is the default. It is the setting meant for a mid laptop iGPU and Edge on Xbox Series S: one water pass, a coarser swell, a gradient sky, and no shadow map. High uses three.js `Sky` (Preetham daylight and its cloud field, MIT, part of three.js), two extra swell octaves, a tighter water mesh, soft shadows on the boat, and more bow spray. X or G toggles them. Neither mode changes the physics.

`?demo=1` plays a cinematic reel on High: a beam reach with way on, sheet in, a tack, a bear-away, a gybe, then the debrief. `?shot=1` holds the boat and locks the chase camera for a still. `?bench=1&quality=low` (or `high`) records frame time on `window.__BLUEWATER__.bench` after a short warm-up.

The dinghy, sailor, buoys, and coastline are original procedural geometry written in this repository. There is no third-party mesh. The water is a Gerstner shader driven by the sim wind: swell, Fresnel reflection of the sky, subsurface colour, sun glint, crest foam, a soft Kelvin wake, and fine bow spray. Near the camera the surface picks up a subtle ripple normal. The hull samples that same surface at the bow, stern, and cockpit so it pitches and rolls with the sea. Gust patches use the existing gust field and read as darker ripples. The hull and sail pick up the sky through the scene environment map. Low and High still share the physics.

## Docking and anchoring

A sheltered basin with a pontoon, a finger, and a mooring buoy. Open it from the debrief with H or LB, or the Docking practice button, or `?scenario=dock`. Adding `&demo=1` plays a scripted approach on the same boat. Y stays the assisted-mode toggle, in the harbour and in open water.

Offshore is the wind off the pontoon, onshore blows you onto it, and "along" runs parallel to the face. Left bumper cycles those. Left-stick click adds a 0.3 kn tide along the pontoon. The sailing forces are the same dinghy; this only adds the tide, the contact, the line, and the anchor.

Come alongside with the sail luffing. The mooring line reaches about a metre and only makes fast under half a knot. A closing speed under about 0.5 m/s is a bump the fenders take; faster is a hard hit. For the anchor, stop, drop it, and pay out scope. Under about 3:1, or dropped with way on, it drags. Around 5:1, dropped near a stop, it holds and the boat swings head-to-wind.

| Xbox | Keyboard (dev) | Action |
| --- | --- | --- |
| Right stick click | F | Drop or weigh the anchor |
| RB | M | Throw or let go the mooring line |
| D-pad up | U | Pay out scope |
| D-pad down | N | Take scope in |
| LB | Z | Cycle the wind |
| Left stick click | T | Light tide on / off |
| Y | Y | Assisted / Full manual |
| View | R | Reset the attempt |
| Menu | P or Esc | Debrief |

The debrief for an attempt shows approach speed, impact speed, distance and angle when you stopped, time, anchor scope, and whether it held, plus one plain-language tip. In this scenario D-pad up and down pay the rode. D-pad left and right, and keys 1 / 2 / 3, still move the camera. V is still the cinematic camera.

## Learn to sail

`?scenario=learn` opens six lessons for someone who has never held a tiller. It is also in the Places menu, as Learn to sail. The lessons are where the wind comes from, a beam reach, the points of sail, a tack, a safe gybe, and coming back to the pontoon head-to-wind. Each one is a short line of coaching, with Xbox glyphs, and the sim decides when it is done. The debrief gives one to three stars. Progress is kept in the browser.

On the lesson list, the D-pad moves and A starts. B goes back. During a lesson, Menu returns to the list and View restarts it. The wind is a steady 11 kn, the same dinghy as open water. A tack is graded by the speed kept and by the tack-quality term the boat already uses. Coming back uses the docking score.

`?scenario=learn&pilot=1` sails the first two lessons on its own. `&lesson=4&pilot=tack` sails the tack.

## Herzliya harbour

`?scenario=harbour` places the same dinghy in Herzliya Marina, on the Israeli coast. The origin is 32.163°N, 34.794°E. Physics x is east, y is north, in metres, so true north is +y. Open it from the Herzliya button, or with that query. `&demo=1` sails a south-westerly circuit: off a berth, out through the entrance, around two practice marks, and back to the visitor pontoon. `&shot=overview` holds a golden-hour view of the entrance. Z cycles the wind. The default for a player is the westerly sea breeze; WNW and NW are the other afternoon directions. Q is a short paddle for leaving the berth. The mooring line, the anchor, and the docking score are the step-2 systems, aimed at the visitor pontoon.

The debrief draws the track on a chart of the coastline, a depth tint, the entrance lights, and the two practice marks. It records time, groundings, time spent in a wind shadow, and the docking score. Sources is the attributions screen.

Breakwaters and buildings shelter their lee: the wind there is weaker and shifted, more so for a taller wall and less so further downwind. The sea outside the moles is the open-water swell. Inside the basin it is about a fifth of that, and it also falls off as the water gets shallow. Sailing onto land, onto a breakwater footprint, or into water shallower than the board stops the boat and counts a grounding.

### Data

Coastline, breakwaters, piers, building footprints, and seamarks are © OpenStreetMap contributors, under the Open Database Licence. The Overpass extract is checked in at `data/herzliya/osm.json` (OSM timestamp 2026-11-16T21:22:36Z, from https://overpass.openstreetmap.fr/api/interpreter) so a build does not call the network.

Depth outside the marina is the EMODnet Digital Bathymetry (DTM) 2022, coverage `emodnet__mean_2022`, 1/16 arc-minute, about 115 m. Creative Commons Attribution 4.0 International. The catalogue says do not use it for navigation. The subset Lat 32.145–32.185, Long 34.775–34.815 is checked in at `data/herzliya/bathy.json`. Elevation is metres, positive up.

These are assumptions, not charted soundings:

- Inside the basin the depth is a flat 3.5 m, an assumed dredged depth.
- Within 48 m of the line between the entrance lights, outside the rock, the depth is 4.2 m. The grid reads 0 there and does not resolve the channel.
- The two large breakwaters are drawn 4.5 m high, the shorter northern ones 3 m. OSM has no height.
- Buildings use `building:levels` × 3.2 m, or 9 m when levels are missing.
- Piers are centre-lines, drawn and collided as 2.4 m wide.
- EMODnet cells deeper than 80 m on this shelf are kept in the file and replaced from their neighbours for shading and grounding.
- Within 40 m of the coastline, on the water side, depth ramps down to the beach.
- The two yellow marks are practice marks for this scenario. OSM has no offshore buoys here. The entrance lights in OSM are both Fl 5s, one red and one green.
- No rock or reef ways were in the extract. Grounding is shoal water, land, and the breakwater footprints.

None of this changes the open-water force, drag, or wave-amplitude numbers. Harbour wind and waves are a scale on top of that sample.
