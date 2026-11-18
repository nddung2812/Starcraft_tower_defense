# BREACHLINE: 29

A browser 3D tower defense / RTS hybrid in plain JavaScript and three.js (r169, vendored). You
hold a canyon against an endless bug swarm: build walls, bunkers and units, then command them
with StarCraft-style mouse controls while waves keep coming. Score is the number of bugs killed.

## Inspiration

- **StarCraft (Terran side):** the look and feel of the Terran army (power-armoured marines,
  walkers, siege tanks, bunkers, an SCV keeping the line patched) and RTS mouse control:
  box-select, right-click orders, control groups, a command card, a minimap.
- **The battle of Outpost 29 in *Starship Troopers*:** the mood. A doomed outpost, an endless
  bug swarm pouring through the canyons, soldiers digging in and holding as long as they can.
  That is why levels never end and the score is simply how many bugs you killed before the
  base fell.

The aim is to capture that feel with original work. Gameplay mechanics and genre are fair game,
but the names, characters, art and lines belong to their owners. Player-facing names and lines were replaced in the BREACHLINE: 29 naming pass.

**Status: active local development (Nov 2026).** The game is hosted on Vercel and GitHub Pages. See `BALANCE.md` for the current roster and tuning; the older gameplay notes below describe earlier revisions.

## Running it

No build step and no dependencies. ES modules need HTTP, so serve the folder:

```sh
python3 -m http.server 8765    # then open http://127.0.0.1:8765
```

Opened this way there is no score API, so the leaderboard is per-browser (localStorage).

## Map of the code

| File | What it owns |
|---|---|
| `index.html` | HUD, battlefield, build bar, command card, inspector, start screen, game-over banner. Import map points `three` at `vendor/`. |
| `src/main.js` | Entry point. Loads models, then owns all input: selection, orders, control groups, hotkeys, camera, minimap wiring, start screen and game-over flow, the frame loop. |
| `src/game.js` | Game state and rules: placing and selling, levels, waves, kills and score, group commands (`commandMove/Attack/Garrison/Stop`), alerts, terrain rebuild. |
| `src/entities.js` | `Marine` (all player units: marine/goliath/tank/falcon plus the scorcher/deadeye/mender specialists), `Zergling` (all bug strains), `Wall`, `Bunker`, `Scv`, `Core`, `SupplyCrate`, projectiles. |
| `src/opening.js` | Optional layer. The first half-minute of a round: the hive-to-base camera sweep for new commanders, the "inbound from … in about N seconds" toast, and the round-one field manual steps. |
| `src/story.js` | Optional layer. The evacuation frame: one Ember Control radio line a round, a convoy for every round held, the result line and share text. Never touches combat or score. |
| `src/atmosphere.js` | Optional layer. Sky dome, far ridges and the time-of-day palette (lights, fog and background) that turns every three rounds. |
| `src/touch.js` | Optional layer. Two-finger pinch zoom and twist rotate. (Tap-to-order is `touchOrder()` in `main.js`.) |
| `src/skirmish.js` | Optional layer. Skirmish: the setup screen, the `Match` director behind `game.match` (waves on a timer, hive guards, the result and its record) and the start-screen button. Tuning is `SKIRMISH` in config; its styles are `src/skirmish.css`. |
| `src/menu.js`, `src/menu.css` | Optional layer. Start menu motion: the description beside the highlighted order and the blast doors on exit (a copy of `#intro`, which is hidden at once because the game reads `intro.hidden`). The stylesheet also dresses pause, results and the menu's dialogs. |
| `src/mines.js` | Optional layer. Medic mines: the `Minefield` behind `game.minefield` (scatter on placement, arming, detonation, salvage recall, checkpoint field). Tuning is `MINES` in config. |
| `src/groundfire.js` | Optional layer. Air strike flames: the `GroundFire` behind `game.groundFire` (a patch per bomb, burn damage that does not stack, cleared with the map). Tuning is `AIR_STRIKE.fire` in config. |
| `src/bossmagic.js` | Optional layer. The boss's Firestorm and Earthquake behind `game.bossMagic`, driven from `MilestoneAssault.update` and cleared by `clearMarks()`. Tuning is `BOSS_MAGIC` in config and `milestonePlan()`; `tests/browser-boss-magic.cjs` covers it. |
| `src/impacts.js` | Optional layer. What an enemy hit looks like on contact, behind `game.impacts`: claw slashes, spine shards, acid splash and pools. Fixed effect pools, presentation only. |
| `src/plasma.js` | Optional layer. The plasma shield behind `game.plasma`: a globe over the base from research level 3, wider every third level. Friendly `takeDamage` calls `game.plasma?.absorb()` first. Tuning is `PLASMA_SHIELD` in config; `tests/browser-plasma.cjs` covers it. |
| `src/maw.js` | Tunnel Maw: `MawAmbush` (timing, warning marks, eruption) and the `TunnelMaw` entity that swallows, holds and releases a unit. Tuning is `MAW` in config. |
| `src/skymother.js` | Optional layer. The Skymother and her Talons behind `game.skyfleet`, models included (`registerModel()` in `assets.js`). Without the layer she is left out of the wave. Tuning is `SKYMOTHER` in config; `tests/browser-skymother.cjs` covers it. |
| `src/hero.js`, `src/heroitems.js`, `src/heropanel.js`, `src/hero.css` | Optional layer. The commander's hero behind `game.hero`: the `Hero` unit and boss loot on the ground (`hero.js`), levels, item rolls and the `td.hero.v1` save (`heroitems.js`), the gear screen (`heropanel.js`). Tuning is `HERO` and `LOOT` in config; `tests/browser-hero.cjs` covers it. |
| `src/evolutions.js` | Boss reward abilities: automatic tank siege, walker chain lightning, bunker Last Stand, descriptions and model additions. Tuning lives in config. |
| `src/grid.js` | Tile grid, A* for player units, the Hammer's all-terrain route search (`driveSearch`), the shared bug route field, line-of-sight helpers. |
| `src/levels.js` | Generates the seeded map: 2–4 approaches from 1–4 sides (`attackFronts(level)`) converging on the base, with boulders, rock depth and spires. Early level names come from `LEVELS`. `carveMatch()` builds Skirmish maps from a hive count and size instead of a round. |
| `src/terrain.js` | The mountain heightfield mesh built from the per-cell rock depth. |
| `src/scenery.js` | Optional scenery art from `SCENERY_FILES`: rock `.glb` shapes for lane boulders and spires, and photo textures for the canyon floor and mountains (world-space triplanar detail multiplied into the existing colours). A missing file falls back to the procedural rock or painted texture. Sources and licences are in `assets/CREDITS.md`. |
| `src/config.js` | **All tuning lives here**: map size, costs, unit and bug stats, wave plan, level paths, model files. |
| `src/models.js` | Procedural low-poly models (units, bugs, buildings, boulders, spires; its Needler and Behemoth are the fallbacks for their files). The four ground strains and both flyers come from the swarm kit (see "Swarm models"). |
| `src/assets.js` | `makeModel(kind)`: uses a `.glb` from `assets/models/` if present, else the procedural model; team rim light. The infantry (one shared `soldier.glb`) and Vector ship as files; the Hammer tank is the built-in `buildTank()` model again (its `MODEL_FILES` entry was removed Nov 15, 2026, so `assets/models/tank.glb` is no longer loaded); `MODEL_FILES` options repaint materials (`tint`), light them from within (`glow`), drop parts (`hide`), mark promotions (`tierTint`) and name swivelling turret parts (`turret`). Delete a file to get the built-in model back. |
| `src/scene.js` | Renderer, lights, camera rig, post-processing (GTAO ambient occlusion, MSAA, bloom), FX quality toggle. |
| `src/ui.js` | Inspector panel, command card, selection chips, leaderboard rendering, HUD readouts. |
| `src/minimap.js` | Minimap (1 px per tile, scaled), camera footprint, attack pings, click to look / right-click to send. |
| `src/scores.js` | Leaderboard client: `/api/scores` when available, localStorage fallback. Player name handling. |
| `src/checkpoints.js` | Versioned round checkpoint capture, validation against the seeded grid, storage reads and paused restoration. |
| `src/progression.js`, `src/retention.js` | Permanent achievements, cosmetic loadout, Continue, pause/planning menus, save-and-quit, storage failure feedback and new-run confirmation. |
| `src/daily.js` | Daily challenge: one seed per UTC day, today's best and day streak in `td.daily.v1`, share text. |
| `src/fx.js`, `audio.js`, `voice.js` | Particles and decals, synthesised sound effects, speech-synthesis voice lines. |
| `assets/models/README.md` | How to drop in `.glb` unit models. |

## Search and public pages (Nov 18, 2026)

- `tower-defense-game.html` (features, modes, FAQ) and `guide.html` (controls, units, enemies, tactics) are the
  indexable pages, styled by `src/site.css`. `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest` and the icons
  sit beside them. The game's own metadata and JSON-LD are in the head of `index.html`.
- **Links between pages have no `.html`** (`href="guide"`) because Vercel's `cleanUrls` redirects `.html` addresses.
  They work on Vercel and GitHub Pages but 404 under `python3 -m http.server`.
- **Every canonical, Open Graph, JSON-LD, sitemap and robots URL names `protectyourhome.vercel.app`.** Replace them all
  if the domain changes. Update `lastmod` in `sitemap.xml` when a page changes.
- **Keep the copy true.** Say "inspired by" and keep the non-affiliation notice in the footers. The game is single-player
  with RPG-style progression, and `/api/scores` returned 503 in production on Nov 18, so do not advertise multiplayer or
  an online leaderboard. Never add ratings or reviews to the structured data unless they are real.

## Skirmish: a match you can win (Nov 17, 2026)

Players see this mode as **Survival mode** and the endless stand as **Endless mode** (renamed Nov 18, 2026, the owner dislikes the word "Skirmish"). Never show "Skirmish" to players. Code, element IDs and storage keys keep `skirmish` so saved records carry over.

Built because the endless stand never gives the player a win or a decision about when to attack.
The start screen's Skirmish button opens a setup screen (1–7 hives, Calm/Standard/Fierce swarm,
map size, starting minerals, open with the squad or plan first) and then plays one continuous
battle on one map: a bigger wave on a timer, and the match is won the moment every hive is
destroyed. Rules and numbers are in `BALANCE.md`; `tests/browser-skirmish.cjs` and
`tests/skirmish-maps.mjs` cover it. Steps one (the match) and two (the setup screen) are built;
hive personalities are not.

- **`game.match` is the whole switch.** It is null in the endless stand. `skirmish.js` installs a
  `Match` there and the core calls three methods on it: `update(dt)` each tick of `wave`,
  `hiveHit(hive)` from `Hive.takeDamage`, and `finish(won)`. Anything mode-specific in a core
  file must read `game.match?.…` so the stand is untouched and a missing layer costs only the
  button (it is `hidden` until the layer installs).
- **The wave number is `game.level`; the map is `game.matchMap`.** `reset(seed, { map })` pins
  the battlefield (`{ hives, size }`) and `loadLevel()` carves it with `carveMatch()` instead of
  `carveLevel()`. That is why unlocks, scouting, wave composition, bosses at 5/10/15, the Maw
  from 9 and the sky all follow a match with no code of their own. `Match.launchWave()` never
  emits `level` (main.js would cancel placement and clear the selection); it emits `wave`.
- **A setup is five fields** (`hives`, `mood`, `size`, `minerals`, `quick`), always passed through
  `normalizeSetup()`: `size` 0 means the smallest map that fits (`SKIRMISH.minSize[hives]`), and a
  size too small for the hive count falls back to it. `rulesFor(setup)` is the only place a setup
  becomes numbers (wave gap, swarm size, hive health); `Match.wave(level)` is `wavePlan(level)`
  thinned or thickened to that swarm size, and the core uses it for wave 1 too. The last setup is
  kept in `td.skirmish.setup.v1`.
- **`carveMatch(seed, { hives, size })` in `levels.js`** plans its own lanes (`planMatch`) and
  reuses `carveFronts`/`finishLevel`. It must not touch `planFronts`, whose random draws old
  saves and seeded maps depend on. One or two hives share a side, three add a flank, four or
  more surround a mid-map base and double up on sides. `tests/skirmish-maps.mjs` carves every
  hive count at every allowed size.
- **A match never leaves `wave`.** No raid, no `completeWave()`, no refund, no slow-motion on the
  last bug. `hivesDestroyed()` is the one place that decides what dead hives mean: `completeWave()`
  in the stand, `state = 'victory'` in a match. Use `game.ended` (defeat or victory) for "the run
  is over"; test `state === 'defeat'` only when you mean a loss.
- **Results stay out of the stand's systems.** A match ends through `Match.finish()`, which emits
  `matchOver` and never `over`, so nothing is submitted to the kills board, the daily is not
  recorded and the saved stand is not deleted. Matches are never checkpointed
  (`retention.active` stays false; the pause menu offers Quit match). The record is the fastest
  win per setup in `td.skirmish.v1`, keyed by `setupKey()` (hives, mood, size, minerals; the
  first release's single record under `"2"` still counts for the default setup).
- **Starting one.** The setup dialog's Start calls the `launch(quick)` callback main.js hands the
  layer, which is `launchNewRun(name, quick, null, 'skirmish')`; that calls back into the layer's
  `options()` and `begin()`. `runMode` makes Play Again and Restart a rematch on the same seed
  and setup. `ui.js` draws the readout (`syncMatch`),
  the wave and hive callouts and the result (`showMatchBanner`) from `matchStart`, `wave`,
  `hiveDown` and `matchOver`.
- **Hives in the stand are not what the older notes below say.** They can be attacked for the
  whole round, they hatch a brood every 30 seconds, the raid has no time limit, and a round ends
  only when every hive is destroyed.
- **Four suites were already failing before Skirmish** (checked against a clean export of
  `e465309`) and still fail the same way; their causes have not been investigated:
  `browser-base` ("paused"), `browser-scouting` (8 !== 7), `browser-maw` ("A Maw kept a cleared
  round open") and `browser-balance` ("Starting squad cannot protect opening seed 0").

## Skymother (Nov 18, 2026)

- A slow armoured flyer from round 11 that launches 8 Talons and hunts Titans first. Rules and numbers are in `BALANCE.md`.
- **Talons are `Zergling` subclasses in `game.zerglings`** (`isTalon`), so every weapon can hit them, but their
  `takeDamage` never calls `onKill`: she regrows them forever, so a kill would be free score and minerals.
- A Talon that docks marks itself `dead` with `escaped` set, like a Maw that dives. All of them fall when she dies, so
  they can never hold a round open.
- `wavePlan()` lists her, and the spawn loop in `game.js` skips her when `game.skyfleet` is missing or `room()` is false.
- **Survival mode holds her back** (`matchFirstWave`, `matchAlive`): at wave 11 she made the default match unwinnable for the
  `browser-skirmish` bot, which won 1 of 4 runs with her and 4 of 4 without.

## Medic mines (Nov 17, 2026)

- Placing a Medic scatters 3 proximity mines (100 damage each) on free tiles around it. Rules and
  numbers are in `BALANCE.md`; `UNITS.mender.mines` (the `MINES` config) is the spec flag.
- **`game.minefield` is null until the `mines` layer installs it**, like `game.match`. The core
  calls it in five places, always as `this.minefield?.…`: `placeGunner` (`deployed`), `update`,
  `loadLevel` (`clear`), `sell` (`recall`) and the checkpoint (`capture` / `restore`).
- **Only `placeGunner` lays mines.** A checkpoint restore builds units directly, so it lays none
  and puts back the saved ones from the optional `mines` field (`{ x, z, unit }`, `unit` an index
  into `units` or -1). Redeploy goes through `placeGunner`, so it lays a new set.
- A mine never owns a grid tile and is not in any entity list: it does not block building, routing
  or selection. Every mine shares one set of geometry and materials (`parts()`); do not dispose
  or recolour them per mine.
- `tests/browser-mines.cjs` covers placement, arming, blast, aircraft, salvage, saves and a
  missing layer.

## First impression, story, sky and touch (Nov 15, 2026)

Built to answer "why would someone share this, and do they get to the good part": an audit found
a new player waited about 27 seconds for 4 bugs, phones could not give a move order, links
unfurled with no picture, and a run had no meaning beyond its kill count. None of this changes
spawning, routing, stats or score.

- **Optional layers.** `opening`, `story`, `atmosphere` and `touch` are loaded by `layer()` at
  the end of `main.js` with dynamic `import()` and land in `game.extras`. A missing or failing
  file costs that layer only (a test aborts `story.js` and plays on). Keep it that way: core
  modules must never import them statically, and callers use `extras.story?.…`.
- **Opening.** On `count` 2 of a fresh run's first briefing the camera sweeps to the lead hive,
  holds while the wave opens, and returns (5.4 s). Only for the first 3 runs on a device
  (`td.opening.v1`), never with reduced motion, and it stops the moment anything else moves
  `stage.focus`; pointer, wheel or key input skips it back to base. It emits `openingSweep`
  (`start`, `hive`, `end`); the story layer captions those. Every round's wave start shows one callout with
  the attacking sides and `contactEta()` (route tiles from the flow field over Ripper pace; a test
  holds it within 6 s of the real arrival). The round-one field manual is now step-driven
  (`opening.guide()`), not a 5-second timer, and speaks in taps on touch screens.
- **Touch.** With units selected, a tap on anything but one of your own units is their smart
  order; tapping the single selected unit again deselects. A second finger hands the gesture to
  `touch.js`, which ends the pan and swallows both fingers until they lift. Mouse is unchanged.
- **Story.** `evacuated(rounds) = 120n + 15n(n+1)` people for `n` rounds cleared. A run that dies
  in round N held N-1. Radio lines for rounds 1–10 follow what actually appears (spitters at 3,
  flyers at 5, the flank at 7, the Behemoth at 8, tunnelling at 9); 16 and 21 mark three and four
  fronts. The result screen leads with the people saved; `run.evacuated` also reaches the score
  card and the share text. Score is still kills.
- **Sky.** `phaseFor(level)`: afternoon, dusk, night, dawn, three rounds each. Afternoon is the
  lighting the game always had, so rounds 1–3 look exactly as before. Fog and background share
  each phase's haze colour. The backdrop is drawn first, never writes depth, follows the camera,
  and is separate from the map's own meshes (which still end at the map edge).
- **Link previews.** `index.html` has Open Graph and Twitter tags pointing at
  `https://protectyourhome.vercel.app` (the repo's homepage); change them if the domain changes.
  `assets/og.jpg` is rendered from a staged battle by `tests/make-og-image.cjs`; rerun it after a
  rename or a visual change.
- `tests/browser-opening.cjs` (sweep, estimate, manual, tap orders, pinch) and
  `tests/browser-story.cjs` (totals, script, result, share, phases, missing layer).

## Fire and smoke particles (Nov 15, 2026)

- `fx.js` now draws two point clouds: `glow` (additive: sparks, fire) and `dark` (normal blending:
  smoke, drawn first). `spawn()` opts `ramp` (colour follows `FIRE_RAMP` with age) and `dark` make
  a particle a ragged puff **sized in tiles**; every other particle keeps the old screen-tuned
  size. The `fire` attribute is the puff's seed and must stay above zero: zero means a plain spark.
- `fx.flame(p, dir, reach, arc, source)` does not spawn a burst. It registers a jet that
  `fx.pour(dt)` feeds every frame for `FLAME.hold` seconds after the last call and that follows
  `source.yaw`, so repeated shots read as one stream. `fx.burning()` is the small upward flame used
  for burning bugs and ground fuel. `FLAME.shared` caps the total emission when many Torches fire.
- `tests/browser-flame.cjs` checks continuity, reach, spread, smoke, budget and unchanged damage.

## Hammer all-terrain driving (Nov 15, 2026)

- `UNITS.tank.offroad` (`rock`, `water`, `climb`) makes a unit all-terrain. Only the Hammer has it;
  rules and numbers are in `BALANCE.md`. Every other ground unit still keeps to `CELL.OPEN`.
- **Rock is still `CELL.ROCK`.** Nothing about the grid changed: `rebuildTerrain()` hands the built
  heightfield to `grid.setTerrain(heightAt, lakes, solid, WATER_LEVEL)`, which keeps `grid.ground`
  (cell heights, lake cells, and boulder/spire cells nothing drives over). `Grid.load()` clears it,
  and without it rock is closed to tanks too, so a bare `Grid` in a test behaves as before.
- **One price for route and speed.** `grid.drivePace()` is a tile's time multiplier and
  `driveSearch()` is an A* over travel time with it (plus the climb). `stepMove()` slows the tank
  with `grid.driveSpeed()` from the same numbers. Change one and the "fastest" route stops being
  the fastest. `driveRoute` / `driveAttackRoute` / `driveHome` are the three ways it is called, from
  `orderMove`, `chase` and `finishMove`.
- **A tank only parks on an open tile.** Routes end on `CELL.OPEN`; a tank on rock never owns a
  tile. `unit.offGround(game)` is true up there. Stop goes through `finishMove()` and
  `driveHome()`. With an attack target in range it holds position instead of calling `halt()`
  (`holding` in `Marine.update`), because halting on rock would re-route every frame.
- `rideTerrain()` sets `altitude` and leans the model (`rotation.order = 'YZX'`). A ground unit can
  therefore have `altitude > 0`: `flying` is the test for aircraft, never `altitude`. `lifted()` in
  `main.js` picks and box-selects anything drawn above its tile.
- `tests/tank-routes.mjs` (node: quickest times against an exhaustive search, ridge, lake, boulder
  and bare-grid cases) and `tests/browser-tank.cjs` (move, Stop, Attack, holding a ridge, selection,
  the Maw).

## Tunnel Maw (Nov 15, 2026)

- A burrowing worm from round 9 (`MAW.firstRound`) that swallows an exposed ground unit. Rules
  and numbers are in `BALANCE.md`; `game.ambush` (`MawAmbush`) runs it every tick.
- **It is a `Zergling` subclass in `game.zerglings`** (`isMaw`), so weapons, blasts, kills and
  bounties treat it like any bug, but it overrides `update` and never paths. A Maw that dives
  marks itself `dead` with `escaped` set and skips `onKill`, so it scores nothing.
- **A swallowed unit is removed from `game.gunners` and the scene**, not flagged in place:
  `unit.swallowed` is true and the Maw holds it in `meal`. `gulp()` clears its tile only if it
  is the occupant; `release()` puts it back on a free tile and re-adds it. Nothing else needs a
  "swallowed" check except `isUnit()` in `main.js`, which keeps it out of control groups.
- Ambushes only start in `wave` while the marching wave is alive, so a Maw cannot hold a cleared
  round open for longer than its own surfacing. Marks are cleared by `loadLevel()`.
- Maws are not in `wavePlan()`; the scouting report mentions them through `scoutRound().maws`.
- `tests/browser-maw.cjs` covers warning, swallow, rescue, dodge, loss and round end.

## Random base side, attack fronts and Defend mode (Nov 15, 2026)

- **Map version 4.** The base is no longer always in the east. `planFronts()` in `levels.js`
  picks the main front's side from the seed and `attackFronts(level)` sets how many sides attack:
  one on rounds 1–6 (base at the far end of a random side), two on 7–15 (base inland, one flank
  hive), three on 16–20, four from 21 (base mid-map, a hive on every side). Route counts are
  still 2 / 3 / 4. The table is in `BALANCE.md`.
- **Each approach is built in its own frame** (`u` in from its map edge, `v` across) and turned
  onto the square map by `cellFrom`/`pointFrom`. `carveWestern()` is the untouched version 1–3
  generator; `finishLevel()` is shared. A layout now carries `sides` (one per spawn), `fronts`
  and `front` (unit step from the base toward the main front).
- **Nothing may assume west hives or an east base.** Use `layout.sides`/`layout.front`,
  `game.deployAnchor()` and `game.threatYaw(x, z)`; the last faces a bunker or idle unit up the
  swarm's route (`grid.upstreamYaw`) once there is more than one front.
- **Defend (D).** `unit.defend` is a per-unit flag toggled by `game.commandDefend(units)`. On a Hammer it is also siege mode (`unit.sieged`, `SIEGE_MODE` in config, `tests/browser-siege.cjs`).
  `commandAdvanceArmy()` skips defenders, so they stay home (and in their bunkers) when Attack is
  pressed; direct orders still move them. It is an optional checkpoint field on units and on
  `lastArmy`, so Redeploy restores it. Marked by `guardMark` (gold diamond), a gold chip border
  and "DEFENDING" in the inspector.
- `tests/map-layout.mjs` checks sides, fronts, base placement and that approaches stay apart
  for the outer half of their march; `tests/browser-defend.cjs` covers Defend.

## Specialists, streaks, supply drops, redeploy and daily challenge (Nov 11, 2026)

- **Three specialists, one per round.** `BUILD[id].unlock` is the first round a unit can be built:
  Torch (C, round 2), Spectre (X, round 3), Medic (E, round 4). `game.isUnlocked(id)` gates
  `placeGunner`; locked cards are hidden, so round 1 still shows six cards. `unitUnlocked` fires
  when the round arrives. All three are `Marine` instances driven by spec flags:
  `flame` (cone damage to every ground target, no projectile), `pierce` + `prefersBig` (tracer adds
  the target's armour back; targets the highest max HP), `heals` (targets the most injured ally via
  `seek()`/`acquireFriend()`, never attacks, cannot revive). Stats are in `BALANCE.md`.
- **Messages are toasts.** There is deliberately no `#status` line (a test asserts it stays gone).
  `ui.toast()` shows one short card above the dock (3 s, warnings 4 s; the newest replaces the last,
  but routine news never cuts off a warning). `ui.callout()` is a slim 2-second strip at the top of
  the battlefield for wave starts, unlocks and threats. An event gets one message, not both, and
  kill streaks show only in the HUD. The owner asked for a clear view (Nov 18, 2026);
  `tests/browser-quiet-hud.cjs` holds this. `ui.say()`/`ui.tip()` only record `ui.line`; nothing
  renders them.
- **The unit panel is closed by default (Nov 18, 2026).** I or the info button opens it beside the
  battlefield. `setPanel()` in `main.js` owns this; selecting the Ridge Relay or a garrisoned unit
  opens it (their buttons exist nowhere else) and it closes again with that selection. While it is
  closed a boss fight keeps a slim health bar at the top right.
- **No base strip.** The row under the toolbar was removed as too noisy. Upgrade Base and Fire
  Laser are in the inspector (`#baseActions`) when the Ridge Relay is selected; Shift+R still aims the
  laser and a toast announces when it is charged. The raid readout and Locate Hive button are gone
  (the two-second raid notice remains). Redeploy is a single button at the top of the battlefield.
- **Kill streaks.** Kills within `STREAK.window` (2.5 s) of each other build `game.streak`; tiers at
  10/25/50/100 pay bonus minerals once per streak and emit `streak`. The HUD shows `×N` from 5.
  `bestStreak` is per session and is not saved.
- **Supply drops.** During `wave`, a `SupplyCrate` lands near the base every `SUPPLY.interval`
  seconds, never within 2.2 tiles of a unit. Clicking it, or a ground unit or the Patch Rig
  within 0.9 tiles, calls `game.collectCrate()`. It pays minerals (20% chance to also recharge the
  air strike) and expires after 18 s. Crates are cleared by `loadLevel()` and are not saved.
- **Redeploy army (Shift+D).** `completeWave()` records `game.lastArmy` (kind, tier, invested) before the
  refund. `game.redeployArmy()` rebuilds it around `deployAnchor()` at normal prices, dearest
  first, leaving anything unaffordable waiting. Walls and bunkers are not rebuilt. `lastArmy` is an
  optional checkpoint field; older saves load without it.
- **Daily challenge.** The start screen's Daily button starts a Quick Deploy run on
  `dailySeed()`. A finished run on that seed updates today's best and the day streak, and the
  share/copy text names the daily number. It is local only: there is no daily leaderboard.
- `tests/browser-specialists.cjs` covers all of the above with the browser invocation below.

## Map progression update (Nov 10, 2026)

New runs use map version 3: two western approaches on rounds 1–6, three on rounds 7–15,
and four from round 16. Each round varies the approach bends, entrance rows, base row,
width pattern and obstacles using the run seed. Early routes merge farther from the base;
later routes keep their separate approaches longer. Quick Deploy places its squad at the
shared defense line so it can cover both opening routes. Map size still grows every five
rounds from 56×56 to a maximum of 128×128.

Basic enemy counts now rise by a few each round instead of doubling on round 2.
Health grows by 10% of base HP per round and speed by 1.5% of base speed per round,
capped at +30%. New enemy types and five-round boss milestones retain their introductions.
Version-1 and version-2 checkpoints reconstruct their original terrain and placed hardware;
the next round uses version 3.

`tests/map-progression.mjs` checks round/run variation and increasing wave health budgets.
The map layout/width suites check routing, lane separation and exact legacy terrain fixtures.
The browser map suite checks live multi-lane spawning and all three checkpoint versions;
the balance suite checks the starting squad can clear both opening approaches.

## Latest gameplay update (Nov 9, 2026)

- Canyon width now varies along each approach: mostly 4–7 tiles, with short 2–3 tile necks
  and gradual transitions. Boulders leave a two-tile spine clear; the final convergence widens
  with its slope. Shapes remain reproducible from the seed. Map version 2 is used for new
  rounds; existing checkpoints without a map version restore their original version-1 terrain
  before adopting the wider generator on the next round.

- Actual map progression (`mapDimensions` in config): levels 1–5 = 56×56, 6–10 = 72×72,
  11–15 = 88×88, 16–20 = 104×104, 21–25 = 120×120, 26+ = 128×128 maximum.
- One simple western attack route at levels 1–5, two at levels 6–15, and three at level 16+.
  Each has a western hive and converges near the eastern command center. Waves cycle through
  every route; no mid-map hive teleports. All routes are checked after placing boulders.
- Ground/grid planes and mountain geometry stop exactly at the current map boundary. Removed
  the old 90-tile ground extension and 14-tile mountain skirt. Camera movement, terrain lookup,
  aircraft bounds and minimap coordinates follow the current dimensions, including after restart.

- Visibility: closer 14-tile camera, steeper angle, focus on the base/defense instead of empty
  terrain; Reset View returns there. Larger unit silhouettes, persistent team rings, softer
  terrain/grid contrast, brighter blue rim light, and cropped build thumbnails improve readability.
- One slim top toolbar contains icon readouts for minerals, score and base health, a compact
  level readout, camera buttons, settings, Strike and Launch. Below 800px, camera/settings use
  the toolbar's overflow button; the bar remains one row.
- Eco graphics is the new default (`td.graphics`, replacing the old inherited `td.fx` default):
  30 fps gameplay, antialiasing and sharp native pixels (up to 2×), no shadows or post-processing. High is opt-in:
  60 fps, at most 2× pixels, 1024px shadows, GTAO and bloom. Post-processing is allocated only on first use.
- Rendering requests prefer a low-power GPU. Menus/game-over redraw at 4 fps; portrait at up
  to 8 fps only while visible; HUD/minimap about 10 Hz. Hidden tabs cancel their animation
  callback and pause simulation, resuming without time catch-up. Simulation uses <=50ms steps.
- Paused games also settle to 4 fps, returning to the selected frame rate during input so
  camera movement and placement remain responsive. Both WebGL contexts prefer low power.
- Terrain is split into 12-tile sections for off-screen culling, retaining the original
  geometry, normals and colours. High-mode AO uses CSS-pixel resolution while the scene
  stays at native resolution. Returning to Eco disposes post-processing and shadow targets;
  unchanged resize notifications no longer reallocate the drawing buffers.

- Build cards and army commands sit on the battlefield immediately right of the minimap.
  The compact dock matches the minimap height (130px, 90px on small screens). Build buttons
  show thumbnails rendered from the actual battlefield models; keyboard hints remain in the corner.
  The app stays within one viewport; narrow screens open unit details with the Unit Info toggle
  instead of placing the inspector below the map.
- Quick Deploy buys three soldiers at normal cost and starts wave one. Name is optional;
  Build My Own keeps the original planning flow. Rematches keep the chosen mode and map seed.
- Bases are at opposite ends as requested: the swarm hive sits at the western map entrance,
  the command center at the eastern exit. Multiple routes now start from western hives; the
  smaller early maps shorten the approach without moving hives into the middle of a map.
- Falcon Gunship (V, 220 minerals): twin tracking cannons attack both ground and air, speed 5.2,
  two upgrade tiers. Flies directly over mountains/walls and never occupies ground grid cells.
  Lethal damage destroys aircraft immediately; they cannot garrison or be revived as infantry.
- Sky Hunters join enemy waves at level 5 and fly directly toward the command center. Marines,
  Goliaths, Falcons, needlers and hunters can target air; tanks, melee bugs and ground blasts
  cannot. Projectile aim follows flight height, and air units use flight-height click/box selection.
  Aircraft appear as triangles on the minimap.
- Boss assaults every five levels: medium Brood Guardians at 5/15/25/etc.; harder decade bosses
  The Breacher (10), Broodmother (20), World Eater (30+). Medium encounters have half HP,
  lighter damage/armor and slower bombardment/reinforcements than their decade counterpart.
  Bosses gain an enrage phase below half HP, summon reinforcements, and bombard up to 1/2/3
  distinct troop positions with visible dodge windows. Boss kills award minerals and recharge
  the air strike, plus 1–2 treasure boxes (medium) or 2–3 (hard), applied automatically.
  Random, stacking Marine gun damage, range, firing speed or movement speed upgrades benefit
  all current and future Marines. Silver boosts last through the next 3 full rounds (plus the
  remainder of the award round); gold upgrades last for the run. Each box has a 35% gold chance,
  and hard bosses guarantee at least one gold. The readout row has expandable upgrade details
  with expiry rounds; no manual opening. New runs reset all treasure. Reinforcement spawning stops on boss death; remaining hostiles must be cleared.
- `src/milestones.js` owns boss entities, warning rings, damage, reinforcements, and cleanup.
  `milestonePlan()` in config owns tuning. `game.assault` exposes the live encounter state.
- `src/challenge.js` parses bounded challenge parameters, creates same-map links, and renders
  a 1200×900 last-stand PNG from the battlefield. Combat itself remains nondeterministic.
- Game over offers native link sharing (where supported), copy link, and a downloadable score
  card. Slow score requests do not block results, and stale requests cannot reopen a rematch.
- Intro and defeat screens pause the simulation. Live HUD shows remaining hostiles and boss
  attack/reinforcement timers. No deployment or online leaderboard has been added.

## Base abilities and bonus phase (Nov 10, 2026)

- Run-wide `baseLevel` research costs 200 + 150 × current level minerals. Every level adds
  15% health/damage to current and future combat units, and health to the Patch Rig. The
  unit stores its research level so promotions and treasure recalculation retain the bonus.
- Research is timed (Nov 15, 2026). `upgradeBase()` takes the minerals and starts
  `baseUpgradeT` (`baseUpgradeTime(level)`: 6 s + 1 s per level, 12 s at most); the level and
  its stats land in `completeBaseUpgrade()`, which `update()` calls when the timer runs out
  (tests call it directly). The timer is an optional checkpoint field. `buildCore(level)` /
  `upgradeCore(model, level)` in `models.js` dress the base: one named group per level
  (`CoreStage1`…, listed in `CORE_STAGES`) so `Core.setLevel()` can grow the newest one in.
- Atlas (`goliath`) volleys are rockets: `UNITS.goliath.rocket` makes its `Tracer`s use a rocket
  model, accelerate and lay smoke puffs. They are still `game.tracers` with tracer damage.
- Wave completion enters `raid` for 15 simulation seconds before `completeWave()`. All wave
  spawns, the boss, and remaining enemies must be cleared first. `game.hives` are attackable
  bonus targets only during this phase, with a one-time mineral bounty. They never count as
  bug kills. `game.combatTargets` selects the appropriate enemy list for weapons and blasts.
- `laserCharge` fills from 0 to 90 seconds, caps at one shot, and survives `loadLevel()`.
  Fire Laser / L arms a click from the base toward the map edge: one red piercing beam deals
  600 damage to every enemy on that line, then charge resets to zero. Pausing freezes charge.
- Checkpoints persist research/charge; old saves default both to zero. Combat and raid saves
  retain existing round-replay semantics. New runs reset both values. Tuning is in config;
  full rules are in `BALANCE.md`. Run `tests/browser-base.cjs` using the browser invocation below.

## Rules that are easy to break

- **Grid occupancy.** Aircraft never own ground tiles. A placed ground unit owns its tile (`grid.occupant(tx, ty) === unit`). Walking or
  garrisoned units do not, and their `tx/ty` can be stale. Only `grid.clear()` a tile when the
  entity is its occupant (`unit.isPlaced(game)`); clearing blindly erases another unit's tile.
- **Bug routing is shared.** `grid.field()` is one Dijkstra out from the core, cached per
  `grid.version`. `grid.route()` hands each bug only the next ~24 cells, and bugs re-read it
  when that runs out. Don't go back to per-bug A* over the whole map; it won't scale at 128×128.
- **Player paths** (`findPath(..., walk = true)`) may pass through friendly unit tiles but never
  walls or bunkers. Without that, tight squads deadlock.
- **Model contract.** Anything `makeModel()` returns must expose `userData.torso`,
  `userData.weapon` (with `userData.muzzle`), and optionally `userData.anim(state, dt)`
  (`solid: true` means no separate turret). Bugs with `userData.serpent` use `animateSerpent`;
  bugs with `userData.swarm` are posed by `userData.swarm.pose({ gait, run, swing, air, time })`.
- **Swarm models (Nov 15, 2026).** Ripper, Leaper, Brute and Corroder (`zergling`, `hopper`,
  `warrior`, `tanker`) are original insect designs built by `buildSwarmling(strain)` from a kit
  per strain (`ripperKit()` and so on); the Wraith and Brood Ray come from `buildSkyhunter()`.
  Colour is baked into vertex colours, so every strain shares `SWARM_SHELL` and `SWARM_GLOW`, and
  each kit's geometry is built once and shared by every bug: never dispose a bug's geometry or
  recolour its material per bug. Keep them original: do not import or copy another game's
  creature models (the linked StarCraft II Zergling file was declined for that reason).
  `tests/browser-bugs.cjs` checks size, footing, draw calls, poses, death and the flyers.
- **Swarm beasts from files (Nov 17, 2026).** The Needler, the Behemoth and the four milestone
  bosses are CC0 Quaternius `.glb` files (`needler`, `behemoth`, `warden`, `tyrant`; sources in
  `assets/CREDITS.md`), repainted by `tint` and lit by `glow` in `MODEL_FILES`, so the spider is
  both the Needler and the Hollow Queen and the Breacher and World Eater share a body. A boss's
  kind comes from `milestonePlan().model`; `MilestoneBoss` swaps it in for the Brute and seats
  the crown and health bar from `userData.height`. Delete a file and that creature is the
  built-in model again (`buildNeedler`, `buildUltralisk`, an oversized Brute), so keep those.
  The four ground strains must stay built-in: `browser-bugs.cjs` fails if a file replaces one.
- **Map size.** `COLS`/`ROWS` are maximums (128), not active dimensions. Use `mapDimensions(level)`
  for generation, `layout.cols/rows` for terrain, and `grid.COLS/ROWS` for indexing, input, routing
  and movement. A `Grid.load()` can grow or shrink its storage; never index it with the cap.
- **Build anytime.** Placement is allowed in `build`, `brief`, `wave` and `raid` states via
  `game.canBuildAt()` (never on a tile a bug stands on). Salvage is build-phase only.
- **Score = kills.** `game.score` mirrors `game.kills`.
- **Typing is not hotkeys.** The keydown handler ignores events from inputs and while the start
  screen is open. Keep it that way when adding keys.

## Saved runs and commander achievements (Nov 9, 2026)

- One run checkpoint per browser/device, stored as `td.checkpoint.v1`. Autosaves during planning
  and the three-second briefing, including a final snapshot immediately before combat. Clearing
  a round refunds hardware and saves the next map normally; automatic round progression remains.
- Continue appears on the start screen with round, player, kills, minerals and save time. It
  restores paused with a fresh three-second countdown. `Save & quit` during combat returns to
  the saved start of that round: subsequent combat, spending and kills replay. The pause menu
  explicitly shows the checkpoint's resources and explains this behavior.
- Checkpoints preserve seed, round, economy, score, simulation time, air-strike cooldown,
  technologies, gold/silver upgrades and their individual expiry, core/SCV health, buildings,
  promoted units, positions, movement paths, grid ownership and bunker garrisons. The SCV resumes
  idle, ready for new orders. Selection, control groups and camera return to the current base.
- Pause offers Resume, Plan defense while paused, Save & quit, and achievements. Planning keeps
  the battlefield interactive without advancing combat. Defense mode opens this planning
  view directly. Open pause menu returns to the save controls.
- Starting a new run or restarting a live run asks before replacing a saved checkpoint. Cancel
  preserves it. Defeat removes the checkpoint; Play Again keeps the same seed and deployment mode.
- `td.commander.v1` stores six permanent achievements: first clear, no-base-damage clear, first
  boss kill, 250 kills in one run, Round 10 clear and Round 20 clear. Progress uses lifetime bests
  and idempotent unlocks, so replaying a checkpoint cannot duplicate rewards. Next goals appear
  on the start/results screens. Unlock notifications queue without blocking combat.
- Rewards are three commander badges and emerald/gold/violet army rings, selectable in the ★
  menu (under ⋯ on narrow screens), start screen, pause menu or results. Selected cosmetics carry
  across runs and apply to existing and newly recruited units. Blindness/silence indicators
  temporarily override ring colours. Cosmetics do not modify combat stats.
- Saved data is local to this browser and origin, without cloud sync. Version/shape/numeric,
  grid-occupancy and upgrade validation happens before restoration. Damaged/unsupported saves
  show a message and allow a new run. Failed writes keep the game open, explain the failure and
  support retry; Save & quit never pretends a failed write succeeded.

## Controls (as shipped)

Left-drag pan · Shift-drag box-select · click / Shift-click / double-click or Ctrl-click (all of a type on screen) ·
right-click = smart order (move, attack, garrison, repair, revive; never rotates the camera) · middle-drag = rotate/tilt · ⌥ + left-drag = rotate/tilt · wheel = zoom · arrows =
scroll (no automatic edge scrolling) · Ctrl+1–9 set group, Shift+1–9 add, 1–9 select, double-tap to jump · A whole-army advance · Shift+A selected attack-move · S stop ·
D defend (selected units stay home when the army attacks) · I unit panel · , and . rotate · touch: tap a unit, then tap ground/enemy/bunker to order it; pinch to zoom, twist to rotate ·
F stim · R air strike · Shift+F promote · Shift+S salvage · Shift+E SCV (or F1) · Shift+Q all army (or F2) ·
Shift+R laser · Shift+Z Titan cannon · Shift+D redeploy last round's army · Space pause · Esc cancel ·
click a supply drop to collect it.
Build hotkeys: Q Trooper, W wall, B bunker, G Atlas, T Hammer, V Vector, and once unlocked C Torch,
X Spectre, E Medic, Z Titan. Every shortcut stays within reach of a left hand on WASD (the owner's
request, Nov 18, 2026); `tests/browser-hotkeys.cjs` holds this.

## Testing

`tests/browser-camera.cjs` checks mouse-anchored panning in four directions at multiple angles,
rotation/tilt, Alt and middle-button gestures, click jitter, selection/orders, proportional zoom,
edge-hover stability and drag cancellation on lost focus. Use the browser invocation below.

`tests/browser-retention.cjs` uses the browser invocation below. It checks a full checkpoint
round trip (including garrisons, moving tanks, aircraft, promotion, damage and timed treasure),
combat replay behavior, paused continuation, replacement confirmation, permanent unlocks and
loadouts, dialog hotkeys, desktop/mobile layout, defeat cleanup, damaged saves and storage
failure/retry. Screenshots are written to `/tmp/td-career-{1440,390}.png` and
`/tmp/td-continue-390.png`.

A browser smoke suite is checked in at `tests/browser-smoke.cjs`. Serve the repo on port 8765,
then run `node tests/browser-smoke.cjs` with `playwright-core` installed, or pass its absolute
module directory as the first argument. Override Chrome's path with `CHROME_PATH` if needed.
It verifies full-map first contact, opposing-base positions, seeded map reachability/reproducibility, score card download,
challenge clipboard links, rematches, build mode, all three boss tiers, enrage, bombardment
hits, live movement dodges, rewards, and cleanup. It writes visual captures to the OS temp dir.

`tests/browser-air.cjs` uses the same invocation and checks air/ground damage, anti-air rules,
terrain flight, grid occupancy, aircraft selection, promotion, destruction, level recovery,
and the level-5 enemy air unlock.

`tests/browser-attack.cjs` checks whole-army Attack/A, bunker ejection, walker movement,
fighting en route, base retargeting, friendly-fire rejection, Stop, checkpoint compatibility,
the two-second objective notice, early completion and the optional 60-second timeout.

`tests/browser-performance.cjs` checks rendering defaults, lazy effects, 30/60 fps limits,
4 fps idle/paused redraws, responsive paused controls, portrait/minimap throttling and
hidden-tab pause/resume. Its fake 120 Hz clock avoids prolonged GPU stress. A few actual
frames check quality-switch resource cleanup, independent AO resolution, stable resize,
seamless terrain section borders and off-screen culling. A seeded comparison at the same
resolution reduced Eco triangles from 56,262 to 26,022 at level 1 and 165,474 to 21,708 at
level 16. These are geometry workload measurements, not hardware temperature or FPS gains.

`node tests/map-layout.mjs` checks 51 reproducible seeded maps across size boundaries and
late levels: real dimensions, disjoint middle approaches, connectivity, grid resizing and cached
swarm fields. `tests/browser-maps.cjs` uses the browser invocation above and checks exact
terrain/ground extents, every lane receiving enemies, camera/minimap coordinates, level 5→6
and restarting onto a smaller map.

`node tests/map-widths.mjs` checks 216 maps for actual 2/3/4/6/7-tile sections, broad areas
outnumbering necks, at least two clear tiles through necks after boulders, route reachability,
and original-terrain fixtures. The browser map suite also restores an original checkpoint
with a wall that would be invalid on the new terrain, then checks the next round uses version 2.

Other useful checks from development:

- Headless Chrome via `playwright-core` pointed at the installed Chrome
  (`executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`).
- Software WebGL renders at about 4 fps, so step the simulation directly
  (`window.game.update(0.05)` in a loop) and stub `game.stage.render = () => {}` for logic
  tests. `window.game` is exposed by `main.js` for this.
- Hide `#intro` (the start screen) before driving the battlefield with the mouse.
- CSS transitions don't advance in headless runs; don't assert on animated sizes.
- Checks worth keeping: box-select, groups, move fan-out with no duplicate tiles, grid-occupancy
  consistency after moves, garrison, attack chase, bug aggro and wall line-of-sight, building
  mid-wave, every level's spawns reaching the core, `game.update` time with 60 bugs.

## Working alongside Cursor

Cursor has also edited this repo. Before editing, check `git status` and file modification
times; if files are changing, stop and coordinate rather than overwrite.

Other Claude Code sessions work in this same directory at the same time and commit and push to
`main` (Nov 15, 2026: a rename, a camera change and three features landed from another session
in fifteen minutes). So:

- Check `git status` and `git log` before each batch of edits, not just the first. Names and
  copy may have changed since you last read them.
- Stage by explicit path. Adding a shared file takes the other session's uncommitted hunks too.
- Never leave a tracked file importing a file that is still untracked: a commit from the other
  session would ship a broken site. New features go in their own module, loaded through
  `layer()` in `main.js` so that a missing file cannot stop the game.
- `ListAgents` shows the other sessions and `SendMessage` reaches them.

## Open decisions (before going public)

1. **Player-facing rebrand completed (Nov 9, 2026).** BREACHLINE: 29 uses original roster,
   faction, location, ability and voice text. See `BALANCE.md` for the current specs.
   Legacy code/save IDs stay stable to preserve checkpoints and model integrations.
   This naming pass is not an artwork review or legal clearance.
2. **Map flow changed by user (Nov 15, 2026).** The earlier rule (hives in the west, command
   center always at the far east end) is replaced: the base side is random and harder rounds
   attack from two, three and four sides, which puts the base inland and shortens those marches.
   Hives still sit on the map edge; do not move them toward the base. Rounds 16+ on three and
   four fronts need playtesting for pacing and boss balance.
3. **Hosting plan (proposed, not started).** Static site on Vercel, plus one function at
   `/api/scores` backed by Upstash Redis (a sorted set).
   - `GET /api/scores?limit=10` → `{ scores: [{ name, score, level, kills }] }`
   - `POST /api/scores` with `{ name, score, level, kills, seconds }` → `{ rank }`
   - Cache GET for a few seconds, rate-limit POST per IP, sanity-cap kills against level and
     time, and filter names.
   - About 1,000 concurrent players is light: the game is static files, and each player writes
     once per run.
   - Needs: the domain and its registrar, and confirmation of Vercel + Upstash.
4. **Leaderboard trust.** Scores come from the browser and can be forged. Sanity checks raise
   the bar; real protection needs server-side validation or replays.

## Making it spread: where the playbook stands (Nov 15, 2026)

Done: share card and challenge links, a local daily challenge, achievements, an online score
API (`api/`), Open Graph tags with a rendered preview image, a first-wave camera sweep and an
arrival estimate, a step-by-step first-round manual, touch orders and pinch zoom, and a story
frame that gives a run a result worth posting.

Not done, in the order they would help most:
1. **The swarm arrives too late.** Round 1 is a 27-second wait for 4 Rippers; the crowd that a
   clip would sell appears around round 8. Denser early rounds at the same total health, or a
   veteran start at round 5, need the owner's decision: both the march and the opening counts
   were tuned on purpose.
2. **A shared daily board.** The daily is local only. `api/scores.js` already has run tokens and
   rate limits; a per-day key would turn the daily into a competition with a result to post.
3. **Run-defining choices ("Field Orders").** One of three run-long doctrines after each round,
   rolled from the seed so a daily offers everyone the same picks. Changes balance; not built.
4. **Clips.** A "save the last 15 seconds" or a photo mode. Nothing records today.
5. **Where players quit.** No analytics, so every item above is a guess about the funnel.
6. **Name and address.** The repository, its Pages URL and one Vercel project still say
   "Starcraft", and the Titan's cannon is still called "Yamato" in player-facing text. Portals
   and press need those gone.

## Making it spread: recommended playbook

The game has to be easy to start, easy to show off, and give people a reason to come back.

**In short:**
1. Something happens in the first 20 seconds: fix the long march, load in under 3 s, teach by doing.
2. Every run is shareable: a game-over share card, and challenge links on the same map.
3. A reason to return: a daily challenge (one seed for everyone) with its own resetting board.
4. Built for clips: 15–30 s swarm-breach videos on TikTok/Shorts/Reels; early access for small streamers.
5. Launch where players are: CrazyGames, Poki, itch.io (original IP required), Reddit web-game communities, Show HN.
6. Measure where players quit, and fix that before adding content.
7. Protect the leaderboard from forged scores from day one.

The details:

**1. Remove every barrier to the first 30 seconds.**
- Playable in under 3 seconds on a normal connection: minify and gzip or brotli JS (three.js is
  1.2 MB unminified), cache aggressively, show the start screen before the heavy work.
- Something must happen in the first 20 seconds. Fix the long march (decision 2) before anything
  else; a two-minute wait kills a first session.
- Teach by doing: a short first wave that prompts "Shift-drag to select", "right-click to move", "build
  a wall here", instead of a text tutorial.
- Auto-pick FX LO on weak GPUs (detect a slow first frame), so laptops don't stutter.

**2. Make every run shareable.**
- Game-over share card: an image with the name, kills, level and a screenshot of the last stand,
  plus one-tap share and copy link.
- Challenge links: `?vs=Rico&kills=812&seed=...` opens the same map with "Beat Rico's 812 kills".
  Head-to-head challenges spread through group chats better than anything else.
- Open Graph and Twitter card tags (title, description, a strong image) so links unfurl well in
  Discord, iMessage and X.

**3. Give people a reason to come back tomorrow.**
- Daily Challenge: one seed per day, the same map for everyone, its own leaderboard that resets.
  This turns a solo game into a daily competition.
- Weekly and all-time boards, so newcomers can still place somewhere.
- "Your best" and "next rank is 37 kills away" on the game-over screen.

**4. Be made for clips.** Short vertical video is where browser games get discovered.
- Lean into spectacle: the swarm pouring over a wall, the air strike, the last-bug slow-motion
  that already exists. Add a "record last 15 seconds" or at least a clean screenshot button.
- Post 15–30 s clips on TikTok, YouTube Shorts and Reels, built around a tension beat ("200 bugs
  vs. 1 bunker").
- Give small Twitch and YouTube creators early access and a streamer-friendly mode (hide names
  on the board, bigger HUD text).

**5. Launch where players already are.**
- Game portals: CrazyGames, Poki, itch.io, Newgrounds. Portals bring huge traffic but require
  original IP, which is one more reason to do the rename first.
- Communities: r/WebGames, r/TowerDefense, r/IndieGaming, a Show HN (the technical angle: a
  128×128 3D RTS-TD in plain three.js), Product Hunt.
- A Discord server linked from the game-over screen, for feedback, bug reports and score
  bragging.

**6. Measure and iterate.**
- Track the funnel: page load → name entered → first wave cleared → level 5 → shared. Vercel Web
  Analytics or a privacy-friendly tracker is enough.
- Watch where people quit (usually the first two minutes) and fix that before adding content.
- Ship small updates often (a new strain, a weekly event) and announce them; the update log
  becomes marketing.

**7. Protect the thing that makes it competitive.**
- A leaderboard full of forged scores kills the competitive loop. Do the sanity checks and rate
  limits from decision 3 on day one, and keep a way to wipe obvious cheats.
