# Porting Bluewater off the browser

The sailing model is an engine-free TypeScript package in `core/`. The browser (`src/`) renders it with three.js, reads the gamepad and keyboard, and draws the HUD. A Godot 4 port, and a later Unreal port, should keep this split: copy or re-implement `core/`, and write the rendering, device input, and widgets in the engine.

There is no C++ simulation in this repository. The TypeScript core is the only force model. Do not add a second one and try to keep the two in sync by hand. A native port is checked by replaying `core/fixtures/` and matching the samples. If a C++ core shows up later, treat it as deprecated unless it is the single implementation and the TypeScript `step` is generated from it. Until then, `core/` is the reference.

## Layout

```
core/
  sim/            forces: wind, apparent wind, sail, heel, leeway, hydro, capsize
  dock/           practice pontoon, contact, mooring, anchor, docking score
  harbour/        Herzliya world, grounding, wind shadow, course, debrief numbers
  learn/          lesson state machine, gates, scoring, coach selection
  coop/           helm/crew roles, tack call, sync score, drill
  data/           boat, lessons, coaching, scenario setups (JSON)
  schemas/        one JSON Schema per content file, plus the harbour extracts
  fixtures/       tack, gybe, dock approach, capsize trajectories
  input.ts        BoatInput and ScenarioInput
  step.ts         step(state, input, dt) and stepDock
  debrief.ts      open-water debrief numbers
  index.ts        the symbols a port is meant to call
src/              browser shell only
  render/         three.js
  hud.ts          DOM HUD
  input.ts        gamepad and keyboard to BoatInput
  persistence.ts  localStorage adapter
  learn/          lesson overlay and glyph HTML
  coop/overlay.ts
  harbour/chart.ts
data/herzliya/    coastline, works, and bathymetry already checked in
```

`src/` imports `core/`. `core/` does not import `src/`, three.js, or the DOM. `npm test` typechecks `core/` with `lib: ["ES2022"]` and no DOM, and a vitest walks the sources for browser globals.

## The step

Time is seconds. The fixed step is `FIXED_DT` = 1/60 s. The browser accumulates real frame time and calls the step while the accumulator is at least one tick, dropping the leftover if a frame runs long. A port should do the same. Do not scale forces by a variable frame delta inside the force model. Pass `dt` through, and call `step` with 1/60.

```ts
import { createBoat, step, FIXED_DT, type BoatInput } from './core/index.ts';

let state = createBoat({
  windSpeed: 5.66,
  windFrom: Math.PI / 2,
  steady: true,
  waves: false,
  assisted: false,
});

state = step(state, input, FIXED_DT);
```

`step` does not mutate the state you pass in. It returns the next plain object. `DockSession.step` and `Simulation.step` are the class form of the same tick. `step` and `stepDock` rebuild the class, tick once, and flatten it again, so a port can ignore the classes and implement the pure function.

`BoatState` is every number the next tick reads: pose, velocity, heel, sheet, boom, sailor offset, maneuver arming, the wind field (base wind, gusts, spawn timer, RNG state), and `view`, the snapshot the HUD reads. Two hooks are not in the struct, because they are functions the scenario attaches:

- `Simulation.waveScale(x, y)` is 1 in open water. The harbour multiplies swell by depth and by whether the boat is inside the basin.
- `WindField.modify` is null in open water. The harbour applies wind shadow after the open-water sample.

A port re-attaches those from the scenario after each restore, the way `HarbourSession` does. Open-water and dock goldens leave them at the defaults.

### Input

`BoatInput` is axes and intents. It is not a gamepad.

| Field | Range | Meaning |
| --- | --- | --- |
| `steer` | -1..1 | Bow to starboard when positive and the boat is moving forward |
| `sheet` | -1..1 | Net sheet, negative eases, positive sheets in |
| `sheetIn`, `sheetOut` | 0..1 | The two analogue axes. The reference step uses these, not the net |
| `hike` | 0..1 | Move the sailor out, to windward |
| `moveIn` | 0..1 | Move the sailor in and, held, slightly to leeward |
| `vang` | 0..1 | Kicker. Co-op only. Slows the sheet running out. No extra sail force |
| `tackRequest` | edge | Helm calls the tack or gybe |
| `tackReady` | level | Crew answers |
| `anchor`, `moor` | edge | Drop/weigh, or throw/let go |
| `scopeOut`, `scopeIn` | level | Pay or shorten the rode |
| `paddle` | level | Short paddle off a berth |
| `cycleWind`, `toggleTide` | edge | Harbour/dock wind and the light tide |

The browser maps devices in `src/input.ts` (`readInput` to `toBoatInput`). Bindings stay there. A Godot port maps `InputEventJoypadMotion` and actions to the same struct and never reads button indices inside the force model.

Co-op is the exception that still names the current Xbox layout. `core/coop/route.ts` turns plain axis/button arrays into `HelmRole` and `CrewRole` (rudder, hike, call, sheet, ready, vang). Those roles are the abstract input. `routeRoles` is the reference decoder for this prototype's pad so the existing tests can keep calling it. A port should fill `HelmRole` and `CrewRole` from its own actions and skip `routeRoles`.

Menu, camera, pause, quality, and reset are shell events. They are not on `BoatInput`.

## Units and coordinates

SI inside the step. Speeds are m/s. Display knots are m/s times `KT` (`1.9438444924406`) from `core/sim/math.ts`. Angles are radians.

Physics x is east, physics y is north, in metres. Heading 0 faces +x (east) and increases counter-clockwise, so north is +π/2. `windFrom` is the direction the wind comes from, same convention: π/2 is a northerly, the wind blows toward -y.

Starboard is clockwise from the bow (`headingStbd`). Positive sailor offset is to starboard. Positive heel rolls the mast to starboard. Leeward heel rounds the boat up; windward heel bears it away.

The three.js shell places the boat at `(physicsX, height, physicsY)` and yaws by `-heading` around the vertical axis. That mapping is rendering. Godot can keep the simulation in x-east / y-north and convert at the mesh, or use a 3D frame whose ground axes match. Do not change the sign of heading inside the step.

Herzliya's origin is 32.163°N, 34.794°E. `core/harbour/geo.ts` projects lat/lon to the same local metres. Depth in the bathy file is elevation, metres, positive up. The catalogue constraint on that grid is still "do not use for navigation".

Open water uses a 5.66 m/s true wind (about 11 kn) from the north unless a scenario says otherwise. Those presets are `core/data/scenarios.json`.

## Data a port copies as-is

| File | Schema | What it is |
| --- | --- | --- |
| `core/data/boat.json` | `core/schemas/boat.schema.json` | Hull, rig, sailor, planing, capsize coefficients |
| `core/data/lessons.json` | `core/schemas/lessons.schema.json` | Six lessons: titles, goals, steps, gates, hold times |
| `core/data/coaching.json` | `core/schemas/coaching.schema.json` | Struggle lines and debrief sentences |
| `core/data/scenarios.json` | `core/schemas/scenarios.schema.json` | Open-water start, dock geometry, learn launches, co-op marks, harbour winds |
| `data/herzliya/osm.json` | `core/schemas/herzliya-osm.schema.json` | Coast, walls, piers, buildings, lights |
| `data/herzliya/bathy.json` | `core/schemas/herzliya-bathy.schema.json` | EMODnet elevation grid |

No lesson sentence lives in TypeScript. The state machine only selects a line. Glyph tokens `{ls} {rt} {lt} {a} {b} {rb} {lb} {dpad}` are replaced by the shell (`src/learn/text.ts`). A port replaces them with its own button art.

The practice-dock rectangles, the cleat, the start pose, and the wind presets are in `scenarios.json`. Derived numbers (mooring speed in m/s, alongside offset, tide in m/s) are computed in `core/dock/layout.ts` from that file and from `KT`. Copy the JSON, keep the derivations, or fold the derived values in once you have matched a fixture.

`core/sim/water.ts` exports `WAVES`. The physics sampler and the browser shader both read that array. It is part of the force model, not a separate art file. A port that wants the same orbital velocities uses the same components.

Dock and harbour hint strings still name the current keyboard and Xbox controls. They are HUD copy owned by the sessions (`hint()` / `strip()`). They are not lesson content. Replace them in the engine UI rather than parsing the sentences.

Progress is a small JSON document (`{ stars, done }`) under the key `bluewater.learn.v1`. `core/learn/progress.ts` reads it through a `Kv` interface. The browser implements that with `localStorage` in `src/persistence.ts`. Godot can use `ConfigFile` or a user file with the same JSON.

## What has to be re-implemented

Re-implement in GDScript or C#, then check the fixtures:

- `step` / the body of `Simulation.step` (sail, hydro, rudder, heel, leeway, capsize, maneuvers)
- `WindField` and `apparentWind`
- `sampleWater` when waves are on
- Dock contact, mooring, anchor, and `Scoreboard`
- Harbour grounding, wind shadow, wave scale, and the course state machine
- `LearnDirector` gates and star rules (the text stays data)
- Co-op `CallMachine`, sync score, weight, and the drill

Keep as engine code, do not port the TypeScript:

- Meshes, water shader, sky, camera, wake, spray
- Any widget, including the debrief chart (the browser one is `src/harbour/chart.ts`, a canvas)
- Device polling, rumble, and the menu
- The cinematic demo reel (`src/render/demo.ts`), which only produces inputs for the browser trailer

Debrief numbers the UI should show, already computed in core:

- Open water: `openDebrief` (time, max speed, VMG, time luffing, capsizes, tacks, gybes)
- Dock: `DockReport` from `Scoreboard.report`
- Harbour: `HarbourReport` (time, groundings, time in wind shadow, plus the docking score)
- Lessons: `lessonStars` and `debriefLine`
- Co-op: `CoopReport` (time, sync, tack quality, per-role lines)

## Fixtures

`core/fixtures/{tack,gybe,dock,capsize}.json` are recorded from `step` / `stepDock`. Each file has:

- `dt` (1/60)
- `initial` plain state
- `script` of input beats (`steps` is how many ticks to hold that input)
- `samples` every 30 ticks, plus the last tick

Samples are rounded to 1e-9 so the JSON is stable. Fields are metres, radians, m/s, and the sail mode string. `tacks` / `gybes` / `capsizeCount` are counts. The dock fixture also has `dist` (metres from the cleat at x = 5, y = 7), `moored`, and `anchorDown`.

A port loads `initial`, applies each beat for `steps` calls of `step(state, input, dt)`, and compares samples. Match within 1e-5 absolute on the continuous fields for a first port, and tighten toward 1e-9 once the integrator matches. Counts and `sail` should match exactly. `tests/golden.test.ts` replays the files on the reference. Set `GOLDEN_WRITE=1` only when you intend to replace the reference.

The tack fixture finishes with a tack counted. The gybe fixture finishes with a gybe counted. The capsize fixture reaches `capsizeCount > 0`. The dock fixture ends closer to the cleat than it started, sail eased, steered toward the pontoon.

## Godot 4, in order

1. Copy `core/data/`, `core/schemas/`, `data/herzliya/`, and `core/fixtures/` into the Godot project as imported JSON (or `.tres` generated from them). Do not retype the lesson copy.
2. Add a `BoatInput` and a dictionary (or a C# class) with the same fields as `BoatState`. Use double precision if you can. The reference is JS numbers, which are doubles.
3. Implement `step` in C# or GDScript. Start from open water with `steady: true` and `waves: false`, and make `core/fixtures/tack.json` match before touching the harbour.
4. Add gybe and capsize. Then dock (`stepDock`: the same boat step, then contact, line, and anchor).
5. Port the learn gates against the lesson JSON. The shell only displays `say` and the coaching line the machine selects.
6. Port co-op on top of the same boat step. Map two devices to helm and crew roles. Leave `routeRoles` behind.
7. Load Herzliya by the same projection (`core/harbour/geo.ts`) and the same depth rules (`core/harbour/depth.ts`). The OSM and bathy files do not change.
8. Build the Godot scene for the hull, sail, water, and HUD. Drive it from `view` (the snapshot inside `BoatState`). Camera and widgets stay in Godot.
9. Store lesson progress with the same JSON shape. Do not call browser storage.
10. Run the four fixtures in a Godot test scene on every physics change.

Unreal, later, is the same boundary: one `UBoatSim` or a C++ library that implements `step`, fed by the Enhanced Input mapping to `BoatInput`, with the JSON mounted as data assets. The renderer, chaos water, and UMG stay in Unreal. Do not re-derive the polar in the engine. The polar is an outcome of these forces, and the fixtures are how you know the outcome survived the port.

## Browser shell

`src/game.ts` still owns the frame loop, the scenario switches, and the camera. Each tick it maps `readInput()` through `toBoatInput` and `controlsFromBoat` / `scenarioFromBoat`, then calls the core. Player-facing behaviour is that mapping plus the same step as before. Graphics quality, the chase camera, and rumble do not feed back into the forces.

`npm run build` typechecks the shell and the core, then emits `dist/` for GitHub Pages and `dist-single/`. Pages publishes `dist/` from `.github/workflows/pages.yml` on `main`. This split does not change that path.
