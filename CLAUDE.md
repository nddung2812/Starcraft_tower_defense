# Terran Defense (working title)

A browser 3D tower defense / RTS hybrid in plain JavaScript and three.js (r169, vendored). You
hold a canyon against an endless bug swarm: build walls, bunkers and units, then command them
with StarCraft-style mouse controls while waves keep coming. Score is the number of bugs killed.

**Status: parked (Nov 2026).** The game plays end to end locally. Not yet hosted. See
"Open decisions" before doing anything public.

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
| `src/entities.js` | `Marine` (all player gun units: marine/goliath/tank), `Zergling` (all bug strains), `Wall`, `Bunker`, `Scv`, `Core`, projectiles. |
| `src/grid.js` | Tile grid, A* for player units, the shared bug route field, line-of-sight helpers. |
| `src/levels.js` | Carves each level: lane from a path, flank spawns, boulders, rock depth, spires. Levels 1–10 come from `LEVELS` in config; 11+ are generated. |
| `src/terrain.js` | The mountain heightfield mesh built from the per-cell rock depth. |
| `src/config.js` | **All tuning lives here**: map size, costs, unit and bug stats, wave plan, level paths, model files. |
| `src/models.js` | Procedural low-poly models (units, bugs including the Needler, buildings, boulders, spires). |
| `src/assets.js` | `makeModel(kind)`: uses a `.glb` from `assets/models/` if present, else the procedural model; team rim light. |
| `src/scene.js` | Renderer, lights, camera rig, post-processing (GTAO ambient occlusion, MSAA, bloom), FX quality toggle. |
| `src/ui.js` | Inspector panel, command card, selection chips, leaderboard rendering, HUD readouts. |
| `src/minimap.js` | Minimap (1 px per tile, scaled), camera footprint, attack pings, click to look / right-click to send. |
| `src/scores.js` | Leaderboard client: `/api/scores` when available, localStorage fallback. Player name handling. |
| `src/fx.js`, `audio.js`, `voice.js` | Particles and decals, synthesised sound effects, speech-synthesis voice lines. |
| `assets/models/README.md` | How to drop in `.glb` unit models. |

## Rules that are easy to break

- **Grid occupancy.** A placed unit owns its tile (`grid.occupant(tx, ty) === unit`). Walking or
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
- **Map size** is `COLS`/`ROWS` in config (currently 128×128). Level paths are authored on a
  26×16 grid and stretched; lane width scales with the stretch.
- **Build anytime.** Placement is allowed in `build`, `brief` and `wave` states via
  `game.canBuildAt()` (never on a tile a bug stands on). Salvage is build-phase only.
- **Score = kills.** `game.score` mirrors `game.kills`.
- **Typing is not hotkeys.** The keydown handler ignores events from inputs and while the start
  screen is open. Keep it that way when adding keys.

## Controls (as shipped)

Left-drag box-select · click / Shift-click / double-click or Ctrl-click (all of a type on screen) ·
right-click = smart order (move, attack, garrison, repair, revive) · right-drag = pan (grab the
map) · ⌥ + right-drag = rotate/tilt · middle-drag = pan · wheel = zoom · arrows / screen edge =
scroll · Ctrl+1–9 set group, Shift+1–9 add, 1–9 select, double-tap to jump · A attack-move · S stop ·
F stim · R air strike · U promote · X salvage · F1 SCV · F2 all army · Space launch wave / jump to
last alert · Esc cancel. Build hotkeys: W wall, M marine, B bunker, G goliath, T tank.

## Testing

No test suite is checked in yet. What worked during development:

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

1. **Rename away from StarCraft.** Terran/Zerg, Zergling, Marine, SCV, Goliath, Siege Tank,
   Command Center, Hatchery, Mar Sara and the quoted lines are Blizzard's. Fine locally; not on a
   public site, game portals or app stores. Replace with original names and lines (gameplay
   unchanged) before deploying. Names live in `config.js` (`BUILD`, `*_INFO`, `BREEDS`,
   `LEVELS`), `index.html`, `ui.js` and `voice.js`.
2. **The march is too long.** At 128×128 the level-1 route is about 270 tiles, roughly two
   minutes before bugs arrive. Pick one: faster marching until bugs near troops, hives closer to
   the base, or shorter routes inside the big map.
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
- Teach by doing: a short first wave that prompts "drag to select", "right-click to move", "build
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
