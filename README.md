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
| A (hold) | Space | Hike out |
| B | B | Assisted / Full manual |
| D-pad up / right / down | 1 / 2 / 3, C cycles | Chase / cockpit / top-down |
| Right stick | I J K L | Orbit the chase camera (it eases back) |
| View | R | Reset the boat. The track stays, with a gap. |
| Menu | P or Esc | Pause and debrief |
| X | G | Graphics quality, Low / High |
| — | V or 4 | Cinematic camera |

**Assisted** draws an approximate no-go arc and an amber mark on the sheet bar. **Full manual** hides both.

## Feel, in 11 kn of true wind

Settled with a decent sheet:

- Inside about 35° the boat stops and the sail is luffing. Between about 38° and 45° it pinches: speed falls off and the windward telltales lift before the stall.
- Best VMG is around 42–45°, near 4.5 kn. By 50° you are a little faster, but VMG is worse.
- A tack with way on takes about 3–6 seconds and bleeds speed. Holding the helm on the exit does not skid the boat sideways.
- A flat, trimmed reach with the tiller centered does not keep walking up. A run after a gybe settles.
- In 16 kn or more, a gybe with the sheet eased and no hike can capsize.

Menu opens the debrief: track, tacks, gybes, and the session stats.

## Graphics

Low is the default. It is the setting meant for a mid laptop iGPU and Edge on Xbox Series S: one water pass, a coarser swell, a gradient sky, and no shadow map. High uses three.js `Sky` (Preetham daylight and its cloud field, MIT, part of three.js), two extra swell octaves, a tighter water mesh, soft shadows on the boat, and more bow spray. X or G toggles them. Neither mode changes the physics.

`?demo=1` plays a cinematic reel on High: a beam reach with way on, sheet in, a tack, a bear-away, a gybe, then the debrief. `?shot=1` holds the boat and locks the chase camera for a still. `?bench=1&quality=low` (or `high`) records frame time on `window.__BLUEWATER__.bench` after a short warm-up.

The dinghy, sailor, buoys, and coastline are original procedural geometry written in this repository. There is no third-party mesh. The water is a Gerstner shader driven by the sim wind: swell, Fresnel reflection of the sky, subsurface colour, sun glint, crest and hull foam, a wake, and bow spray. Gust patches use the existing gust field and read as darker ripples. The hull and sail pick up the sky through the scene environment map.
