# Ridgewatch

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
but the names, characters, art and lines belong to their owners. Player-facing names and lines were replaced in the Ridgewatch naming pass.

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
| `src/evolutions.js` | Boss reward abilities: automatic tank siege, walker chain lightning, bunker Last Stand, descriptions and model additions. Tuning lives in config. |
| `src/grid.js` | Tile grid, A* for player units, the shared bug route field, line-of-sight helpers. |
| `src/levels.js` | Generates 1–3 difficulty-based seeded approaches between west/east bases, with boulders, rock depth and spires. Early level names come from `LEVELS`. |
| `src/terrain.js` | The mountain heightfield mesh built from the per-cell rock depth. |
| `src/scenery.js` | Optional scenery art from `SCENERY_FILES`: rock `.glb` shapes for lane boulders and spires, and photo textures for the canyon floor and mountains (world-space triplanar detail multiplied into the existing colours). A missing file falls back to the procedural rock or painted texture. Sources and licences are in `assets/CREDITS.md`. |
| `src/config.js` | **All tuning lives here**: map size, costs, unit and bug stats, wave plan, level paths, model files. |
| `src/models.js` | Procedural low-poly models (units, bugs including the Needler, buildings, boulders, spires). |
| `src/assets.js` | `makeModel(kind)`: uses a `.glb` from `assets/models/` if present, else the procedural model; team rim light. The infantry (one shared `soldier.glb`), tank and Kestrel ship as files; `MODEL_FILES` options repaint materials (`tint`), drop parts (`hide`), mark promotions (`tierTint`) and name swivelling turret parts (`turret`). Delete a file to get the built-in model back. |
| `src/scene.js` | Renderer, lights, camera rig, post-processing (GTAO ambient occlusion, MSAA, bloom), FX quality toggle. |
| `src/ui.js` | Inspector panel, command card, selection chips, leaderboard rendering, HUD readouts. |
| `src/minimap.js` | Minimap (1 px per tile, scaled), camera footprint, attack pings, click to look / right-click to send. |
| `src/scores.js` | Leaderboard client: `/api/scores` when available, localStorage fallback. Player name handling. |
| `src/checkpoints.js` | Versioned round checkpoint capture, validation against the seeded grid, storage reads and paused restoration. |
| `src/progression.js`, `src/retention.js` | Permanent achievements, cosmetic loadout, Continue, pause/planning menus, save-and-quit, storage failure feedback and new-run confirmation. |
| `src/daily.js` | Daily challenge: one seed per UTC day, today's best and day streak in `td.daily.v1`, share text. |
| `src/fx.js`, `audio.js`, `voice.js` | Particles and decals, synthesised sound effects, speech-synthesis voice lines. |
| `assets/models/README.md` | How to drop in `.glb` unit models. |

## Specialists, streaks, supply drops, redeploy and daily challenge (Nov 11, 2026)

- **Three specialists, one per round.** `BUILD[id].unlock` is the first round a unit can be built:
  Scorcher (C, round 2), Deadeye (D, round 3), Mender (H, round 4). `game.isUnlocked(id)` gates
  `placeGunner`; locked cards are hidden, so round 1 still shows six cards. `unitUnlocked` fires
  when the round arrives. All three are `Marine` instances driven by spec flags:
  `flame` (cone damage to every ground target, no projectile), `pierce` + `prefersBig` (tracer adds
  the target's armour back; targets the highest max HP), `heals` (targets the most injured ally via
  `seek()`/`acquireFriend()`, never attacks, cannot revive). Stats are in `BALANCE.md`.
- **Messages are toasts.** There is deliberately no `#status` line (a test asserts it stays gone).
  `ui.toast()` shows a short card above the dock (three at most); `ui.callout()` is the one large
  centre-screen line for streaks, unlocks, supply drops and round starts. `ui.say()`/`ui.tip()` only
  record `ui.line`; nothing renders them.
- **No base strip.** The row under the toolbar was removed as too noisy. Upgrade Base and Fire
  Laser are in the inspector (`#baseActions`) when the Ridge Relay is selected; L still aims the
  laser and a toast announces when it is charged. The raid readout and Locate Hive button are gone
  (the two-second raid notice remains). Redeploy is a single button at the top of the battlefield.
- **Kill streaks.** Kills within `STREAK.window` (2.5 s) of each other build `game.streak`; tiers at
  10/25/50/100 pay bonus minerals once per streak and emit `streak`. The HUD shows `×N` from 5.
  `bestStreak` is per session and is not saved.
- **Supply drops.** During `wave`, a `SupplyCrate` lands near the base every `SUPPLY.interval`
  seconds, never within 2.2 tiles of a unit. Clicking it, or a ground unit or the Patch Rig
  within 0.9 tiles, calls `game.collectCrate()`. It pays minerals (20% chance to also recharge the
  air strike) and expires after 18 s. Crates are cleared by `loadLevel()` and are not saved.
- **Redeploy army (Z).** `completeWave()` records `game.lastArmy` (kind, tier, invested) before the
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
  (`solid: true` means no separate turret). Bugs with `userData.serpent` use `animateSerpent`.
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
  the battlefield interactive without advancing combat. Build my own defense opens this planning
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
F stim · R air strike · U promote · X salvage · F1 SCV · F2 all army · Space launch wave / jump to
last alert · Esc cancel · Z redeploy last round's army · click a supply drop to collect it.
Build hotkeys: W wall, M marine, B bunker, G goliath, T tank, V Falcon Gunship, and once unlocked
C Scorcher, D Deadeye, H Mender.

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

## Open decisions (before going public)

1. **Player-facing rebrand completed (Nov 9, 2026).** Ridgewatch uses original roster,
   faction, location, ability and voice text. See `BALANCE.md` for the current specs.
   Legacy code/save IDs stay stable to preserve checkpoints and model integrations.
   This naming pass is not an artwork review or legal clearance.
2. **Map flow confirmed by user.** Enemy hives start at the beginning of the map and the
   command center is always at the other end. Keep this full-map layout. Continue playtesting
   pacing and boss balance; do not move hives toward the player base to shorten the march.
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
