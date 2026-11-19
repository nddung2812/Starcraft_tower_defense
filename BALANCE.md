# BREACHLINE: 29 balance pass — 9 November 2026

The Compact roster uses affordable mobile infantry, durable slow-moving walkers,
flexible but expensive aircraft, and slow ground artillery. Starting minerals remain
480. Quick Deploy buys three Troopers for 180, leaving 300 for any one support
unit, fortifications, or promotions. Costs, timings and statistics live in
`src/config.js`; attackSpeed is seconds **between volleys**, not attacks per second.

## Base roster

| Unit | Cost | HP | Armor | Damage per volley | Interval | Raw DPS | Range | Speed |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Trooper | 60 | 70 | 1 | 8 | 0.80 s | 10.0 | 4.4 | 2.15 |
| Atlas | 160 | 220 | 2 | 13 × 2 | 0.80 s | 32.5 | 6.2 | 1.5 |
| Vector | 240 | 140 | 1 | 10 × 2 | 0.85 s | 23.5 | 5.8 | 4.4 |
| Hammer | 280 | 340 | 3 | 38 × 2 | 2.40 s | 31.7 | 7.0 | 1.25 |
| Patch Rig | 60 rebuild | 70 | — | Repair / revive | — | — | — | 1.9 |

Ranges and speeds use tiles and tiles/second. Raw DPS assumes every projectile hits
one unarmored target, before armory, treasure, Overdrive, travel time and aiming.
Armor subtracts from **each projectile**, minimum one damage. Crawler shells splash
within 1.65 tiles with damage falloff; they cannot hit aircraft. All other combat
units target ground and air. Only Troopers can enter bunkers (two per bunker).
The Patch Rig's existing repair and revive behavior is unchanged.

- **Trooper:** base DPS stays at 10 but HP rises from 55 to 70. Price rises from
  50 to 60. The fully promoted investment falls from 640 to 440, making promotion
  useful when firing positions are scarce. Its short range and vulnerability to
  ranged enemies keep a mass of infantry from covering every role.
- **Atlas:** trades all movement for the best base single-target DPS per
  mineral and longer reach. Price falls from 175 to 160; HP rises from 160 to 220.
  Previously its paired weapons only produced 20.5 raw DPS.
- **Vector:** terrain-free movement and flexible targeting command a premium.
  Cost rises from 220 to 240, damage falls from 36.9 to 23.5 DPS, range from 6.5 to
  5.8, and speed from 5.2 to 4.4. It can reposition quickly but cannot replace the
  ground line. Enemy ranged units still threaten it; destroyed aircraft stay dead.
- **Hammer:** two real shells now match its twin barrels. Cost rises from
  260 to 280 and volley interval from 2.2 to 2.4 seconds. Larger splash rewards
  clustered targets; long reload, slow movement and no anti-air leave clear gaps.
  Volley size now comes from the unit specification, so model replacements cannot
  silently halve or double damage.

## Boss evolutions (10 November 2026)

Every defeated boss offers one of three evolutions, alongside existing treasure and
minerals. Combat freezes until a card is chosen. Choices affect existing and future
units for the rest of the run; later picks can unlock another branch or rank up one
already owned. Rank scaling uses log2(rank), so repeat picks have diminishing gains.

- Walking Fortress: Hammers deploy after 1.2 seconds stationary, gaining
  +5 range and +0.6 splash radius. Additional ranks add 0.75 × log2(rank) range.
  Valid move orders immediately retract the gold stabilizers and remove the bonuses.
- Atlas volleys are rockets with smoke trails (Nov 15, 2026): the same two shots, damage, range
  and rate as before, but they accelerate from the pods (7 to 26 tiles/second) and burst on impact.
- Chain Lightning: each Atlas projectile jumps to two distinct nearby
  enemies, within 3.5 tiles of the previous target. Each jump deals 50% of the
  projectile damage, plus 10 percentage points × log2(rank), before target armor.
  Both ground and air enemies can be hit. Cyan coils and arc effects mark the upgrade.
- Last Stand: damage taken below 30% bunker health triggers 3× garrison firing rate
  for 6 + log2(rank) seconds, with a 20-second cooldown from activation. It stacks
  with Overdrive, respects silence, and does not prevent destruction. A coral perimeter
  pulses during the burst. Further damage can trigger another burst after cooldown.

Choices persist in the next round checkpoint. Quitting mid-combat uses the existing
start-of-round replay rule, including replaying that round's boss and reward choice.
Older saves default to no evolutions; new runs clear every choice.

`tests/browser-evolutions.cjs` covers choices, pause, combat effects, repeat ranks,
mobile layout, save compatibility and reset.

## Promotions

Prices are incremental; total includes purchase and all preceding promotions.

| Unit / rank | Upgrade price | Total investment | HP | Raw DPS | Range |
| --- | ---: | ---: | ---: | ---: | ---: |
| Trooper / Sentry | 70 | 130 | 100 | 17.1 | 4.8 |
| Trooper / Warden | 120 | 250 | 140 | 30.0 | 5.2 |
| Trooper / Pathkeeper | 190 | 440 | 190 | 50.0 | 5.6 |
| Atlas / Mk II | 140 | 300 | 290 | 52.8 | 6.7 |
| Atlas / Mk III | 220 | 520 | 380 | 87.5 | 7.2 |
| Vector / Flight II | 200 | 440 | 200 | 41.7 | 6.2 |

Promotions still restore full health. Existing salvage, kill income and boss reward
rules remain unchanged. Treasure still benefits all current and future Troopers.

## Overdrive and field salvage

Overdrive costs 12 HP for four seconds of +60% fire rate and +25% movement speed.
It cannot start at 12 HP or less, while active, while silenced, or while downed/dead.
This removes the old unlimited low-health activation and reduces the former 2.22×
fire-rate burst. Both command buttons use the same health and silence restrictions.

Kill unlocks remain at 8 / 20 / 40 / 70: Dense-Core Slugs (+2 damage, +0.4 range),
Overdrive, Impact Mesh (+30 HP), and Coil Amplifier (+25% damage, rounded).
The last two previously gave +40 HP and +35% damage; their smaller bonuses accompany
the stronger base infantry and cheaper promotions.

## Enemy roster

| Enemy | First round | HP | Armor | Damage / interval | Range | Speed | Bounty multiplier |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Ripper | 1 | 37 | 0 | 6 / 0.55 s | 0.95 | 2.4 | 1 |
| Needler | 3 | 76 | 1 | 10 / 1.10 s | 5.2 | 1.85 | 3 |
| Brute | 4 | 150 | 3 | 12 / 0.90 s | 1.05 | 1.35 | 3 |
| Wraith | 5 | 100 | 1 | 10 / 1.15 s | 5.0 | 3.1 | 4 |
| Leaper | 6 | 55 | 0 | 7 / 0.65 s | 0.9 | 2.7 | 2 |
| Corroder | 8 | 276 | 1 | 18 / 1.70 s | 6.0 | 1.05 | 5 |
| Skymother | 11 | 1400 | 5 | 32 / 2.60 s burst, launches 10 Talons | 7.5 | 1.1 | 40 |
| Talon | with her | 40 | 0 | 6 / 1.30 s | 2.8 | 5.4 | 0 |

Brutes remain armored blockers. Leapers trade some melee DPS for their wall-jumping
mobility. Corroders now actually appear in round eight; the previous count formula
rounded their first wave to zero. Boss names now include Rift Warden and The Hollow Queen.

## Longer enemy reach and boss siege magic (Nov 18, 2026)

- **Reach.** Needler 4.0 to 5.2, Wraith 4.2 to 5.0, Brood Ray 4.8 to 5.8, Corroder 3.6 to 6.0. Every one
  now outranges a fresh Trooper (4.4), and all stay inside a garrisoned bunker's 6.4.
- **Wave sizes are unchanged.** Adding Needlers and Corroders as well made the default Skirmish
  unwinnable for the test bot (0 of 3 pushes at wave 9), so only their reach grew.
- **Return fire.** An idle unit hit by a spine or acid from beyond its own range walks up and answers
  it. Units with orders, defenders (D), bunker crews and Medics stay where they are.
- **Firestorm and Earthquake.** A boss alternates the two, first at 60% of its interval, then every 12 s
  (hard) or 17 s (medium), 25% faster when enraged. Each aims at the thickest knot of buildings
  (a bunker counts as three walls), then at troops if nothing is built.

| Spell | Warning | Area | Damage to buildings |
| --- | ---: | ---: | --- |
| Firestorm | 2.4 s | 2.2 tiles | `fireImpact` on landing, then `fireDps` a second for 6 s |
| Earthquake | 2.6 s | 4.5 tiles | `quakeDamage` per pulse: 3 widening pulses, so the centre takes 3 and the rim 1 |

| Boss | `fireImpact` | `fireDps` | `quakeDamage` |
| --- | ---: | ---: | ---: |
| Round 5 (medium) | 49 | 13 | 39 |
| Round 10 (hard) | 70 | 18 | 55 |
| Round 15 (medium) | 63 | 15 | 49 |
| Round 20 (hard) | 90 | 22 | 70 |

- Ground troops take 50% of fire damage and 30% of quake damage. The Ridge Relay takes 25%. Bunker crews
  and aircraft take none. Overlapping flames do not stack. The boss's death ends its magic at once.
- Not playtested by a person. Bot-tuned Skirmish numbers further down predate this change.

## Naming and compatibility

BREACHLINE: 29 replaces the former title. The Breachline Compact fights the Rift Brood
at Ember Reach. All player-visible roster names, faction names, borrowed equipment
lore and recognizable voice quotations have been replaced. Command Center becomes
Ridge Relay; the repair vehicle is Patch Rig. Existing serialized unit IDs, armory
IDs, model filenames, hotkeys, challenge URLs and storage keys are intentionally
stable so saved runs and integrations continue to work. Older saves recalculate
unit stats with this patch and clamp HP to the new maximum on restore.

This is a naming and balance pass, not legal clearance or a full visual redesign.
The procedural model silhouettes still merit a separate originality review.

## Validation

`tests/browser-balance.cjs` checks actual projectile count and damage, single-muzzle
model fallback, promotions, Overdrive cost/rate/restrictions, armory bonuses, round-eight
artillery, and the displayed roster. Existing browser suites cover combat targeting,
save restoration, bosses, treasure, round flow and challenges. These establish combat
contracts and regressions; extended player playtesting is still needed for late-run
balance as permanent treasure stacks and enemy HP grow.


## Base research, bonus hives, and laser (Nov 10, 2026)

- Base research costs 200 minerals initially, then 350, 500, and +150 per further level.
  Every research level adds 15 percentage points of health and damage to all current and
  future combat units. Patch Rigs gain health too. Promotions and Trooper loot apply first;
  research multiplies the result. Existing health percentages are preserved. Research lasts
  for the run and is included in checkpoints, independently of hardware refunds.
- The base gains the same 15 points of health per level: 500 at level 0, 575 at level 1, 875 at
  level 5. Landing a level keeps its current health percentage.
- Research is paid at once and lands after a build: 6 s for the first level, one second more
  per level, 12 s at most. Only one can build at a time; pausing freezes it and a checkpoint
  keeps the time left. Each level adds to the building: lit gallery, armour buttresses, beacon
  mast, gold command band, guard pylons, power conduits, halo ring, pylon crowns, spire crown,
  sky beacon; every level also adds a foundation stud (24 at most) and brightens the hull.
- After all queued enemies, bosses, and reinforcements are cleared, an optional 60-second phase
  keeps the current battlefield active. A two-second “Destroy enemy's base” notice replaces
  the visible countdown. Hives are attackable during combat and this optional phase by units, artillery, strikes,
  and the laser. Each hive has 300 + 45 × (round − 1) HP and pays 100 + 25 × (round − 1)
  minerals once when destroyed. Hive destruction does not increase the bug kill score.
  Destroying every hive finishes the optional phase early; otherwise it ends after 60 simulation
  seconds. The next canyon starts with the existing three-second briefing. A destroyed hive
  stops spawning its queued troops. Locate Hive jumps the camera to a live target.
- Attack (A) immediately orders every living combat unit toward enemy bases, including bunker
  troops and Atlas mechs (1.5 tiles/second). Units fight enemies en route, then resume and
  retarget surviving bases. Friendly buildings and Patch Rigs are never attack targets.
  Stop and move orders override the advance; Shift+A retains selected-unit attack-move.
- Defend (D) is a per-unit toggle on the command card. A defending unit is skipped by Attack (A):
  it holds its ground, stays in its bunker and keeps shooting whatever comes into range. Direct
  orders (move, attack a target, Shift+A) still work on it. Setting Defend on a unit that is
  already advancing recalls it by stopping it where it stands. Defenders carry a gold diamond
  on the ground, a gold chip border and "DEFENDING" in the inspector. The flag is saved in
  checkpoints and travels with Redeploy army, so last round's home guard is still a home guard.
- Base laser starts at 0%, charges for 90 simulation seconds, and holds one shot at 100%. Ten cells
  on the cannon's rails light up as it charges. The beam burns for 1.1 seconds; its damage lands once.
  Click Fire Laser (or Shift+R), then click a direction on the battlefield. One red beam extends from
  the base to the map edge and applies 600 damage once to every enemy along its path, including
  aircraft; normal enemy armor still applies. The beam has a 0.8-tile half-width plus target
  radius. Firing resets charge to zero; canceling aim costs nothing. Charge carries into the
  next canyon and is stored in checkpoints. Pausing freezes both charging and the bonus timer.
- From base level 5 the cannon has two lasers, one per rail. Each has its own 90-second charge and
  bar, and the second starts empty when level 5 lands. They fire one at a time: a ready laser waits
  for the other's beam to finish, then aims at a different target unless only one is left.
  New runs reset research and energy. Combat/bonus-phase Save & quit replays the saved start
  of the round, using that checkpoint's research and charge.
- Base income (Nov 18, 2026): base research level 3 mines 1 mineral every 0.5 seconds of play (2 a second) and
  sends 1 free Trooper to the defense line every 30 seconds. Every third level after that adds 2 minerals a second and
  a Trooper: level 6 is 4 minerals a second and 2 Troopers, level 9 is 6 and 3, level 12 is 8 and 4. Free Troopers refund nothing,
  are not rebuilt by Redeploy, leave with the rest of the army when a round is cleared, and stop at 40 standing.
- Plasma shield (Nov 18, 2026): base research levels 3, 6, 9 and so on each add a shield tier. Tier 1
  covers 5 tiles from the base and holds 300 damage; each further tier adds 1.5 tiles (14 at most) and
  150 damage. While it is up, a hit on anything inside drains the shield and the target takes nothing, and
  a Tunnel Maw cannot take a unit inside. It recharges only after 8 seconds with nothing under it hit,
  at 2% of its total per second. Broken, it stays down until that recharge reaches 30%, so it returns
  weak. A new round does not refill it; finishing a research tier does.
- `tests/browser-base.cjs` checks research, old/new checkpoints, bonus timing and rewards,
  bosses and multiple hives, laser damage/charging/carryover, mouse controls and mobile layout.


## Torch flame (Nov 15, 2026)

Presentation only: damage, cone, range and firing interval are unchanged.

- The Torch's fire was 12 small round dots per shot. It is now one continuous jet that keeps
  pouring between shots: white-hot at the nozzle, a tight yellow core, ragged orange billows that
  fan out across the cone and lift at the far end, black smoke rolling off, embers, a flicker of
  firelight, and a little fuel left burning on the ground for a second or so.
- Burning bugs show flames licking up from them, and scorch marks scatter through the cone
  instead of stacking into one black disc. The ground fire and scorch marks do no damage.
- About 80 particles for one Torch in sustained fire; from the ninth Torch on they share one
  budget (20 Torches measured at about 1,000 particles, cap 3,000).

## Hammer siege mode (Nov 18, 2026)

- Defend (D) on a Hammer locks it into siege mode. It parks, then takes 1.6 seconds to deploy, and cannot
  fire while changing over. Deployed: 57 × 2 damage (+50%) and 11.5 range (+4.5). Fire rate and blast
  are unchanged. It ignores move orders and does not chase; attack orders only work on targets in reach.
- Press D again to pack up, which takes 1.2 seconds before it can move. Walking Fortress does not stack
  its range with siege mode: the larger bonus applies, and its extra blast still counts.

## Hammer all-terrain driving (Nov 15, 2026)

- The Hammer is the only ground unit that leaves the canyon floor. It drives over mountain rock
  and through lakes; boulders, spires, walls, bunkers, the base and hive mouths still block it.
- Speed off the road (`UNITS.tank.offroad`): 90% on rock, 65% wading a lake, and a climb costs
  8% more time per tile of height gained or lost over a tile. Road speed is still 1.25.
- Every order is routed by travel time with those same numbers: Attack, an attack on a target,
  and a plain move. The tank goes over a ridge only when that is quicker than the canyon. Estimated
  on 36 hive approaches (rounds 1 to 26, approximated heights): 19 are quicker over the rock, by 4%
  on average and 11% at most. Moving between two lanes gains far more: in the browser test a
  12-tile hop over a ridge takes 11.9 s, against about 18 s for the 23 tiles by road.
- It can only park on a free canyon tile. Stop on a ridge sends it down to the quickest one. With
  an attack target in range it fires from where it stands, ridge or ford, then drives on.
- Up there ground bugs cannot reach it (they still need open ground to walk or shoot across) and
  the Tunnel Maw cannot surface under it. Flyers, boss bombardment and bugs standing right at the
  foot of the slope can still hit it, and the Patch Rig cannot climb up to repair or revive it.
  This is a real buff to a 280-mineral unit: not re-tuned and not playtested.

## Hammer shells (Nov 15, 2026)

- A Hammer round is no longer drawn in flight: the guns flash and smoke, and the round lands as
  an explosion, shock ring, debris and a scorch mark sized to its blast radius.
- It also lands sooner: shell speed went from 14 to 48 tiles a second (about 0.15 s at 7 tiles
  instead of 0.5 s). Damage, splash radius and fall-off are unchanged, but a round aimed at a
  moving target now misses less, so the Hammer is somewhat stronger against fast bugs. Not
  re-tuned and not playtested.

## Opening, story and sky (Nov 15, 2026)

Presentation only: no spawn, route, stat, economy or score change.

- Measured before the change: on round 1 the first Ripper reaches the squad about 27 seconds
  after Play, and the round has 4 of them. That wait is unchanged. It now carries a camera sweep
  to the hive (new commanders only), a callout naming the attacking sides with an arrival estimate
  (22 s promised, 23.2 s measured on the test seed), and a three-step field manual.
- Evacuation: clearing round `r` sends a convoy of `120 + 30r` people; `n` rounds held is
  `120n + 15n(n+1)` in total (5 rounds: 1,050; 10: 2,850; 20: 8,700). Shown on round clear, on
  the result screen, on the score card and in the share text. It is a readout of rounds held,
  not a second score.
- Time of day turns every three rounds: afternoon (the original lighting), dusk, night, dawn.
  Sun strength stays between 1.85 and 2.2 so units read the same; hue, fog and sky change.
- Not playtested by a person: whether the sweep feels like a welcome or an interruption, and
  whether dusk and night are still easy to read on a phone in daylight.

## Tunnel Maw (Nov 15, 2026)

A burrowing worm that ambushes instead of marching. Tuning is `MAW` in `src/config.js`.

- From round 9, during a wave: first ambush 16 s in, then every `24 - 0.6 × (round - 9)` seconds
  (never under 12). From round 18 it marks two units at once. No new ambush starts while a Maw
  is still up, or once the marching wave is dead.
- It picks a random exposed ground unit. Aircraft, bunker troops, downed units, walls, bunkers
  and the Patch Rig are never chosen or swallowed.
- Warning: an amber ring 1.25 tiles wide churns under the unit for 2.4 s, with a "GROUND SHAKING"
  label, a rumble and a minimap ping. The ring stays where it was drawn.
- It then erupts and swallows the nearest exposed ground unit still inside the ring. If nobody is
  there it comes up empty for 3.5 s and dives.
- A swallowed unit is off the field (it frees its tile and cannot be selected) and loses 6% of
  its maximum health per second, but cannot die inside. The Maw holds it for 7 s.
- Kill the Maw in time and the unit is spat onto the nearest free tile. The kill scores and
  pays a bounty of 6. If it dives first, the unit is lost and no kill is scored.
- 240 HP × the round's wave health multiplier (432 at round 9), armour 2. It deals no damage
  of its own and never moves.
- Counterplay: move the marked unit; keep infantry in bunkers; keep enough guns near exposed
  units to burn it down; aircraft are immune.
- Not playtested by a person: whether 2.4 s is enough warning and 7 s enough to rescue.

## Base side and attack fronts (Nov 15, 2026)

Map version 4. The seed picks which side the main front attacks from, so the base is no longer
always in the east, and harder rounds open more sides:

| Rounds | Fronts | Base | Hives |
|---|---|---|---|
| 1–6 | 1 | Far end of the map, on a random side | 2 on the opposite side |
| 7–15 | 2 | Inland, about two thirds of the way in | 2 on the main side, 1 on a flank |
| 16–20 | 3 | Inland, centred across the map | 2 on the main side, 1 on each flank |
| 21+ | 4 | Mid-map | 1 on every side |

- Route counts are unchanged (2 / 3 / 4), so wave sizes and pacing per hive are the same.
  Flank and mid-map approaches are shorter than a full-map march (never under 38 tiles).
- A base with more than one front gets a 10×10 boulder-free plaza. Quick Deploy and Redeploy
  still form up on the main front; cover the other sides yourself.
- Bunkers and idle units face where the swarm's route reaches their tile from, not always the
  lead hive. (Since 17 November 2026 a bunker fires all round, so its facing is only where the
  cannons rest.)
- The round briefing names the sides under attack. Saves from versions 1–3 keep their
  west-to-east terrain for the saved round and move to version 4 on the next.
- Not yet playtested by a person: whether three and four fronts are fair at rounds 16+.

## Map and wave progression (Nov 10, 2026)

- New maps have two routes on rounds 1–6, three on rounds 7–15, and four from round 16.
  Entrances, bends, base rows, widths and obstacles vary each round. Earlier convergence
  gives the starting squad a shared defense position; later convergence spreads defenses.
- Basic skitter count is `min(192, 4 + 2*(round-1) + floor(0.08*(round-1)^2))`, in groups
  of up to `min(12, 4 + floor((round-1)/4))`. The first two rounds have four and six skitters.
- Wave HP is multiplied by `1 + 0.10*(round-1)`. Movement speed is multiplied by
  `1 + min(0.30, 0.015*(round-1))`. Existing strain introductions and boss milestones remain.
- Map version 3 preserves exact version-1/2 checkpoint terrain until the next round.
  Route/width/variation checks, live spawning and checkpoint restoration, and opening
  combat simulations cover the progression. Late-game difficulty still needs playtesting.


## Specialists, streaks and supply drops (Nov 11, 2026)

Three specialists join the build bar one round at a time, so the opening roster stays at six.

| Unit | Unlock | Cost | HP | Armor | Effect per pulse | Interval | Range | Speed |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Torch | Round 2 | 110 | 130 | 2 | 7 to every ground enemy in the cone | 0.35 s | 2.7 | 2.0 |
| Spectre | Round 3 | 150 | 60 | 0 | 64, ignores armor | 2.5 s | 9.5 | 2.0 |
| Medic | Round 4 | 100 | 80 | 1 | Heals 12 | 1.6 s | 4.2 | 2.05 |

| Promotion | Price | Total | HP | Effect | Interval | Range |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Torch / Inferno | 130 | 240 | 185 | 11 per enemy | 0.32 s | 3.1 |
| Spectre / Marksman | 170 | 320 | 85 | 100 | 2.1 s | 10.5 |
| Medic / Chief Medic | 120 | 220 | 115 | Heals 20 | 1.4 s | 4.8 |

- **Torch:** 20 DPS against each unarmored ground enemy in a 63° cone, so it multiplies with
  pack size. Armor applies to every tick (4 per tick into an Brute), it cannot hit aircraft, and
  its reach is shorter than a Needler's.
- **Spectre:** 25.6 DPS with armor ignored, at the longest range in the roster, against ground
  and air. It always picks the highest max-HP target in reach, so it wastes shots when only
  Skitters are present, and it dies quickly to anything that reaches it.
- **Medic:** 7.5 HP/s (14.3 as a Chief Medic) to the most injured soldier, walker, crawler, aircraft or Patch Rig in
  reach. It has no weapon, cannot be given attack orders, cannot overheal, and cannot revive downed
  units. Base research scales healing like damage.
- **Medic mines (Nov 17, 2026):** placing a Medic throws 3 proximity mines onto random free tiles
  1.2–3.2 tiles around it; they arm after 0.5 s. A ground bug within 0.5 tiles (plus its own
  girth) sets one off for 100 damage, before armor, to every ground enemy within 1.2 tiles.
  Aircraft neither trigger nor take the blast, and our own units are safe. Mines are laid once per
  placement (so Redeploy lays a fresh set each round), are flat 100 whatever the Medic's rank or
  base research, do not block building or routing, are cleared with the map at the end of a round,
  and go back with the Medic if it is salvaged.
- None of the three can garrison, use Overdrive, or receive armory and treasure bonuses.

Kill streaks: kills within 2.5 s of each other chain. Reaching 10 / 25 / 50 / 100 pays
+20 / +50 / +100 / +250 minerals, once each per streak.

Supply drops: first at 14 s into a wave, then every 26 s, near the base. Worth
30 + 6 × (round − 1) minerals, with a 20% chance to also recharge a cooling air strike. A crate
lasts 18 s and is collected by a click or by a ground unit or Patch Rig within 0.9 tiles.

Redeploy (Shift+D) rebuilds last round's units and promotions at the normal prices, which the
round-end refund already paid back; it is a convenience and does not change the economy.

These numbers are a first pass: the unit contracts are tested, but late-round balance with the
new units has not been playtested.

## Air strike ground fire (Nov 18, 2026)

Each of the strike's 3 bombs leaves a patch of flame 1.75 tiles in radius that burns for 5 seconds.
A ground enemy or hive standing in the flames takes 10 damage a second, ignoring armor. Overlapping
patches do not stack, so the rate stays 10 a second. Aircraft and our own units are not burned.
Burn kills count as normal kills, and the flames are cleared with the map at the end of a round.

## Scouting and counterplay

The toolbar's **Scout** button pauses a running battle and opens the current round's
planned enemy composition. Counts come from the same `wavePlan()` used to spawn the
column, include already-spawned enemies, and exclude boss reinforcements. Destroyed
hives can prevent planned spawns. Boss rounds carry an explicit warning.

Each strain has practical counter advice and a button to select that unit for placement:
Torches against packs and wall vaulters, Spectres against armour and ranged siege,
and Atlas mechs against aircraft. Round 1 recommends Troopers because Torches
are still locked. The report shows each counter's mineral cost and active army count;
selecting it does not purchase a unit. Closing resumes a previously running battle and
preserves a pre-existing pause. No damage, economy, wave, or save-format tuning changes.

Validation: `node tests/browser-scouting.cjs [path/to/playwright-core]` checks composition
and unlocked counters across 100 rounds, pause semantics, placement selection, boss
warnings, and mobile dialog bounds.

## Animal-like swarm movement

Enemies now use individual, smoothly changing movement rhythms and local avoidance.
Packs fan out across open ground, pass beside neighbours, and compress at narrow bends;
air enemies use the same spacing without interacting with ground packs. Drift fades near
waypoints so bugs still follow the canyon and approach defenders. A spatial index limits
neighbour searches to nearby creatures. Ground steps sweep every crossed tile, preventing
corner cuts and tunnelling through rocks, walls, bunkers or defenders. Blocked creatures
refresh their shared route. Existing aggro, attacks, wall vaults and breed roles remain.

The movement rhythm runs at 88–100% of breed speed, so arrival timing can be slightly
later than before. `tests/browser-swarm.cjs` checks visible pack spread, forward progress,
terrain and building collision, flight, and 144 arrivals across eight seeded maps.

## Shortest attack pursuit

Ground units now search for the shortest traversable route into 90% of weapon range,
replacing the old nearest-open-tile search around the target. They stop at a reachable
firing position instead of walking up to the enemy. Pursuit replans as targets move or
terrain occupancy changes, preserves ground collision, and halts if no route exists.
`tests/attack-routing.mjs` compares routes against exhaustive shortest distances across
50 maps; the ground and army-attack browser suites cover movement integration.

## Titan

Inspired by Blizzard's Battlecruiser guide (https://classic.battle.net/scc/terran/ub.shtml):
a durable, slow flying fortress with air/ground batteries and a decisive charged weapon.
The model and synthesized sounds are built locally; tuning below is for BREACHLINE: 29.

- Unlocks in round 5; costs 900 minerals. Build with Z. Flies over terrain, remains vulnerable to anti-air.
- Dreadnought: 1,100 HP, 4 armour, four 20-damage shots every 0.7s, 8 range, 2.1 movement speed.
- Flagship promotion costs 700: 1,650 HP, four 28-damage shots every 0.6s, 8.8 range.
- Yamato: 4s charge, 12 range, 45s cooldown from charge start. Deals 1,400 armour-ignoring
  damage to the lock and 260 splash to other enemies within 2.6 tiles, including aircraft.
  Damage scales with weapon promotions and base research (1,960 direct damage on a Flagship).
- Auto-targets bosses, hives and enemies with at least 300 maximum HP. Select a cruiser and
  press Shift+Z, or use its inspector button, for a manual shot. Explicit attack orders take priority;
  otherwise the strongest enemy in range is chosen. The cannon never damages allies.
- Normal batteries pause during charging. A dead or out-of-range lock, or silence, cancels the
  shot with a short retry delay. Pause freezes charge/cooldown. Checkpoints preserve cooldown;
  earlier saves without it still load. The ship supports normal selection, repair, promotion,
  army orders, salvage and next-round redeployment.

`tests/browser-battlecruiser.cjs` covers damage, charge timing, target cancellation, cooldown,
air splash, friendly-fire exclusion, upgrades, flight, saves, hotkeys and mobile build targets.

## Behemoth siege beast

The enemy roster now includes an Behemoth, inspired by Blizzard's armoured melee
beast (https://classic.battle.net/scc/zerg/units/ultralisk.shtml). Its procedural model
has four animated legs, overlapping chitin plates, dorsal spikes and paired scythe tusks.

- First appears in round 8: 1,300 base HP × 1.7 wave scaling = 2,210 HP, 7 armour.
- 48 damage every 1.15s, 1.65 attack range, 1.6 base movement speed; follows normal
  terrain routes and pack steering. It cannot fly, jump walls or attack aircraft.
- Each swing cleaves exposed ground defenders in a 2.2-tile, 120-degree frontal arc.
  Walls and bunkers take 60% extra damage (76.8 per swing). No duplicate primary hit,
  hits behind the beast, damage to bunker occupants, or secondary hits through terrain.
- One per wave at round 8, two at 12, three at 16, capped at four from round 20.
  Appears 6 seconds into the wave, with later beasts spaced 4 seconds apart.
- Pays 144 minerals. Standard Yamato deals 1,400 damage, leaving the first-wave beast
  at 810 HP; aircraft, Spectres, and spreading ground defenders provide counterplay.
- A warning announces its arrival once per round. Scout explains its threat and counters;
  selecting it displays its own model and stats.

`tests/browser-ultralisk.cjs` validates spawn progression, cleave boundaries, structure
bonus, armour, aircraft/garrison protection, wall occlusion, Yamato survival and canyon traversal.

## The hero and boss loot (Nov 18, 2026)

One free soldier named after the commander. Levels and gear are saved in the browser and carry across runs and modes.

- **Level 1** is a Recruit Trooper (8 damage, 4.4 range, 2.15 speed) with +40 health (110), +1 armour (2) and a faster trigger: 0.65 s a shot against the Trooper's 0.8 s.
- **Each level** adds 12% health, 10% damage and 1% attack speed. Every 10th level adds 1 armour. The cap is level 30.
- **Melee.** Anything on the ground within 1.5 tiles takes the blade for 2× gun damage. Right-clicking a ground bug charges it.
- **XP.** A kill pays 0.04 per point of the bug's health, or 40% of that when the hero is over 9 tiles away. A boss adds 60 × its round.
- **Passive skills** fire by themselves in a fight. Each reset counts from the moment its effect ends.
  - **Frag Grenade** (15 s): 100 + 10 per hero level to every ground enemy within 1.8 tiles of the thickest group in 6 tiles.
  - **Plasma Shield** (30 s): when an ally within 5 tiles is below 80% health, every allied unit in that radius takes no damage for 7 seconds.
  - **War Robot** (60 s): with 3 enemies within 7 tiles, a boss near, or the hero under half health, the hero flies as a winged robot for 30 seconds. It is 50% bigger with twin guns, 1.5× speed, attack speed and damage, and +1.5 range. It fires on the move, cannot use the blade, and a lethal hit only ends the form, leaving the hero on 25% health.
- **Death.** The hero returns after 15 seconds and loses nothing. It cannot be salvaged and costs nothing to redeploy.
- **Drops.** Medium bosses drop 2 items and hard bosses 3, walked over or clicked; leftovers go to the bag when the fight ends.
  Odds are 55/35/10 (medium) and 20/50/30 (hard) for magic/rare/legendary.
- **Guaranteed rares.** The bosses on rounds 10, 20, 30, 40 and 50 each drop at least one rare item, and so does a hero's very first find.
- **Slots.** Rifle, Blade, Armor and Relic, each with two legendaries:

| Legendary | Slot | Power |
|---|---|---|
| Stormcaller | Rifle | Every 4th shot arcs lightning through 4 more enemies |
| Cinder Repeater | Rifle | Every 3rd shot is an explosive round |
| Reaper's Arc | Blade | Melee hits every ground enemy around the hero |
| Emberfang | Blade | Melee throws a wave of fire |
| Aegis of the Last Ridge | Armor | Near death: shockwave and 3 s of invulnerability, every 40 s |
| Static Mantle | Armor | Shocks nearby enemies every 5 s |
| Ninth Watch Drone | Relic | An orbiting drone fires at nearby enemies |
| Skyfall Sigil | Relic | Every 20 nearby kills calls an orbital strike |

## Skymother and Talons (Nov 19, 2026)

The swarm's answer to the Titan: a slow armoured flyer with a bursting cannon and a brood of ten.

- **Arrival.** From round 11, 9 seconds into the wave. One per wave, two from round 21, three from round 31.
  Never on a boss round (every fifth), and at most three alive at once. HP grows with the round like any bug
  (2,800 at round 11). In Survival mode, where a wave comes every 40 seconds, she joins from wave 16, one at a time.
- **Bile cannon.** Every 2.6 s she fires a bolt at her target for 32 damage. It bursts for 16 on everything else
  within 1.5 tiles, on the target's own layer (ground or air). Buildings take 40% of either figure.
- **Talons.** She carries 10 and launches one every 0.3 s at anything within 7.5 tiles, a Titan first. They hit
  ground and air. Each shot does 6, 12 to a Titan, and 2.4 to buildings. With nothing in reach they fly home.
- **Regrowth.** One lost Talon grows back every 10 seconds, shown by a brood sac swelling on her back. Talons score
  nothing and pay nothing, because she can always make more. They all fall when she dies. She pays 320 minerals and
  counts as one kill.
- **Tuning is `SKYMOTHER` and `BREEDS.skymother` / `BREEDS.talon` in `src/config.js`.**

One Skymother at round 11, six simulated fights per row, with the army ordered to attack her:

| Army | Wins | Army health left | Her health left |
| --- | ---: | ---: | ---: |
| 1 Titan | 1 of 6 | 1% | 2% |
| 1 Titan, Yamato unavailable | 0 of 6 | 0% | 47% |
| 2 Titans | 6 of 6 | 95% | 0% |
| 6 Atlas (960 minerals) | 0 of 6 | 9% | 80% |
| 6 Spectres (900) | 2 of 6 | 25% | 30% |
| 4 Vectors (960) | 0 of 6 | 0% | 88% |
| 15 Troopers (900) | 0 of 6 | 8% | 95% |

These are isolated duels with unpromoted units and no research, not full rounds.
`tests/browser-skymother.cjs` covers waves, launch, the cannon, targets, recall, regrowth, scoring, death, the cap and a missing layer.

## Twin-cannon bunker — 15 November 2026

- Two roof cannons on an octagonal armoured bunker; select 1–2 Troopers and right-click to garrison.
- Each occupant operates one cannon. An empty bunker cannot fire.
- All-round fire (17 November 2026): the cannons turn the whole way round and the crew shoots any
  enemy in range on any side. Before, they covered only about 40° either side of the bunker's
  facing, so bugs beside or behind it, including ones chewing on the bunker, were never shot.
- Garrisoned Troopers gain ×1.5 damage and +2 range (base: 12 damage, 6.4 range), with normal promotions and research retained.
- Destruction ejects both occupants alive at their current health; they resume normal rifle combat without bunker bonuses.
- `tests/browser-bunker.cjs` checks operator count, separate muzzles, all-round fire, capacity, bonuses, and survivor combat.

### Brood Ray and air reinforcements

- Wraith waves start at round 5 with 3 flyers, increasing to a maximum of 16.
- Brood Rays join at round 7: 220 base HP, 3 armour, 18 acid damage every 1.65s, 4.8 range, 2.1 speed, and 7 bounty. They fly and target both ground and air. Waves grow from 1 to a maximum of 8.
- From round 5, every fourth enemy in an evolved hive's brood is a Wraith. From round 7 and evolution 2, the final brood member becomes a Brood Ray. These replace ground brood members, preserving the brood size cap.
- Scouting recommends Atlas mechs against both flying strains.

## Skirmish (Nov 17, 2026)

Shown to players as Survival mode; the endless stand is shown as Endless mode.

One continuous match on one map, set up by the player from the Skirmish button. Destroy every
hive to win; lose if the relay falls. Tuning is `SKIRMISH` in `src/config.js`; the rules are in
`src/skirmish.js` and the maps come from `carveMatch()` in `src/levels.js`. Hive personalities,
the third planned step, are not built.

### The setup screen

| Choice | Options | What it changes |
| --- | --- | --- |
| Hives | 1 to 7 | How many hives must be destroyed, where they are, and the size of the swarm: 60% + 20% per hive of the standard swarm (2 hives = 100%, 4 = 140%, 7 = 200%) |
| Swarm | Calm, Standard, Fierce | Calm: a wave every 50 s, 80% swarm, 85% hive health. Standard: 40 s. Fierce: every 32 s, 125% swarm, 120% hive health |
| Map | Auto, 56, 72, 88, 104, 120 | The length of every march. Auto is the smallest allowed: 56 for 1–2 hives, 72 for 3–4, 88 for 5–6, 104 for 7 |
| Starting minerals | 300, 480, 800, 1,200 | The opening squad costs 180 of them |
| Opening | 3 Troopers, or plan first | Planning starts paused on the first countdown with nothing placed |

One or two hives share one side with the base at the far end. Three add a flank behind an inland
base. Four or more surround a base in the middle of the map, and the fifth to seventh double up
on sides (opposite sides first). The swarm and health factors multiply: four Fierce hives send
175% of the standard swarm and start at 3,120 health.

### Rules

| Rule | Value |
| --- | --- |
| Waves | Wave 1 at the start, then one per wave gap whether or not the last is dead |
| Wave N | The endless stand's round-N swarm (`wavePlan(N)`) scaled to the setup, dealt to the hives in turn |
| Pay for each wave held | 40 + 15 × the wave just held, paid as the next wave leaves. Kills pay as usual |
| Hive health | 2,600, plus 200 for every wave launched (max and current), times the swarm setting's factor |
| Hive guards | Hit a hive and it hatches round(3 + 0.5 × (wave − 1)) bugs beside itself, 10 at most, once per 6 seconds per hive. Rippers, with every fourth a Brute from wave 4, at +10% health per wave |
| Hive bounty | 250 minerals |
| A destroyed hive | Stops sending what it had queued, and its share of every later wave is gone |
| Unlocks, bosses, Maw | By wave number: Torch 2, Spectre 3, Medic 4, Titan 5; bosses on waves 5, 10, 15…; Tunnel Maw from wave 9 |
| Not in a match | Round refunds, Redeploy, salvage, the raid phase, last-bug slow motion, checkpoints, the kills leaderboard |

For comparison, a round-1 hive in the endless stand has 300 health and pays 100.

The result is the time to win. The best time, wins and matches played are kept per setup (hives,
swarm, map size and minerals) and per browser in `td.skirmish.v1`; the last setup is remembered
in `td.skirmish.setup.v1`. Play Again is a rematch on the same seed and setup.

### What the numbers were tuned against

Bot matches only: no person has played a full match yet. The bot spends everything on Troopers,
with an Atlas for every fourth unit from wave 3. When it pushes it keeps a quarter of the army
home and keeps sending the rest, later recruits included. It never promotes, builds walls or
bunkers, researches, or uses the strike or the laser, so these are a floor for a careful player,
not a prediction.

Default setup (2 hives, Standard, 56×56, 480 minerals):

| Bot plan | Wins | Typical end |
| --- | ---: | --- |
| All-in at the first second, never reinforced | 0 / 16 | Relay falls at about 1:00 |
| All-in at the first second, every later recruit sent too | 1 / 16 | Relay falls in 1:15–2:45 |
| Push at wave 5 | 7 / 8 | Wins at about 5:45 |
| Push at wave 9 | 8 / 8 | Wins at about 8:05 |
| Never push | 0 / 6 | Relay falls on waves 11–18 |

Hive health was 1,800 + 300 a wave in the first release. On the setup screen's maps the
reinforced all-in rush then won 3 of 8, so hives now start at 2,600 and grow by 200: the same
4,200 on wave 9, tougher early, slightly softer late.

Other setups, 4 seeds each, pushing at wave 6 and at wave 9:

| Setup | Push at 6 | Push at 9 | Note |
| --- | ---: | ---: | --- |
| 1 hive, Calm | 4 / 4 | 4 / 4 | The gentle one: wins at about 4:55 and 7:20 |
| 3 hives, Standard | 3 / 4 | 4 / 4 | |
| 2 hives, Fierce | 0 / 4 | 0 / 4 | Takes one hive in 5 of the 8 matches |
| 4 hives, Standard, army in front of the base | 0 / 4 | 0 / 4 | Relay falls on wave 4–5: three sides are unguarded |
| 4 hives, Standard, army ringed round the base | 2 / 4 | 1 / 4 | |
| 4 hives, Standard, ringed, 800 minerals | 4 / 4 | 1 / 4 | |
| 4 hives, Calm, ringed | 4 / 4 | 0 / 4 | |
| 7 hives, Standard, ringed, 1,200 minerals | 0 / 4 | not run | Takes one hive at most |

- From four hives up, the base is attacked from every side from the first wave. Where the army
  stands matters more than its size, and waiting past wave 6 lost for this bot.
- Fierce and seven hives are not winnable for this bot. Whether they are for a player with
  promotions, Hammers, Titans, walls and the strike has not been tested.
- Pacing, the wave-10 boss and whether the timing decision is fun all need playtesting.

`tests/skirmish-maps.mjs` carves every hive count at every allowed size (312 maps) and checks
each hive has a real march to the base. `tests/browser-skirmish.cjs` checks the rules above, the
setup screen, per-setup records, that a match never touches the saved stand or the kills board,
and two bot matches: the unreinforced rush loses and a wave-9 push wins (up to three attempts,
because combat is not seeded).
