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
| Needler | 3 | 76 | 1 | 10 / 1.10 s | 4.0 | 1.85 | 3 |
| Brute | 4 | 150 | 3 | 12 / 0.90 s | 1.05 | 1.35 | 3 |
| Wraith | 5 | 100 | 1 | 10 / 1.15 s | 4.2 | 3.1 | 4 |
| Leaper | 6 | 55 | 0 | 7 / 0.65 s | 0.9 | 2.7 | 2 |
| Corroder | 8 | 276 | 1 | 18 / 1.70 s | 3.6 | 1.05 | 5 |

Needlers give fresh infantry a small range advantage. Brutes remain armored
blockers. Leapers trade some melee DPS for their wall-jumping mobility. Wraiths
are slightly tougher but no longer outrange fresh infantry. Corroders now actually
appear in round eight; the previous count formula rounded their first wave to zero.
Existing wave HP/speed growth, boss statistics, bounty multipliers and spawn counts
otherwise remain intact. Boss names now include Rift Warden and The Hollow Queen.

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
- Defend (K) is a per-unit toggle on the command card. A defending unit is skipped by Attack (A):
  it holds its ground, stays in its bunker and keeps shooting whatever comes into range. Direct
  orders (move, attack a target, Shift+A) still work on it. Setting Defend on a unit that is
  already advancing recalls it by stopping it where it stands. Defenders carry a gold diamond
  on the ground, a gold chip border and "DEFENDING" in the inspector. The flag is saved in
  checkpoints and travels with Redeploy army, so last round's home guard is still a home guard.
- Base laser starts at 0%, charges for 90 simulation seconds, and holds one shot at 100%.
  Click Fire Laser (or L), then click a direction on the battlefield. One red beam extends from
  the base to the map edge and applies 600 damage once to every enemy along its path, including
  aircraft; normal enemy armor still applies. The beam has a 0.8-tile half-width plus target
  radius. Firing resets charge to zero; canceling aim costs nothing. Charge carries into the
  next canyon and is stored in checkpoints. Pausing freezes both charging and the bonus timer.
  New runs reset research and energy. Combat/bonus-phase Save & quit replays the saved start
  of the round, using that checkpoint's research and charge.
- `tests/browser-base.cjs` checks research, old/new checkpoints, bonus timing and rewards,
  bosses and multiple hives, laser damage/charging/carryover, mouse controls and mobile layout.


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
  lead hive. A bunker's firing arc is unchanged, so one bunker still covers one approach.
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
| Medic | Round 4 | 100 | 80 | 1 | Heals 12 | 0.8 s | 4.2 | 2.05 |

| Promotion | Price | Total | HP | Effect | Interval | Range |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Torch / Inferno | 130 | 240 | 185 | 11 per enemy | 0.32 s | 3.1 |
| Spectre / Marksman | 170 | 320 | 85 | 100 | 2.1 s | 10.5 |
| Medic / Chief Medic | 120 | 220 | 115 | Heals 20 | 0.7 s | 4.8 |

- **Torch:** 20 DPS against each unarmored ground enemy in a 63° cone, so it multiplies with
  pack size. Armor applies to every tick (4 per tick into an Brute), it cannot hit aircraft, and
  its reach is shorter than a Needler's.
- **Spectre:** 25.6 DPS with armor ignored, at the longest range in the roster, against ground
  and air. It always picks the highest max-HP target in reach, so it wastes shots when only
  Skitters are present, and it dies quickly to anything that reaches it.
- **Medic:** 15 HP/s to the most injured soldier, walker, crawler, aircraft or Patch Rig in
  reach. It has no weapon, cannot be given attack orders, cannot overheal, and cannot revive downed
  units. Base research scales healing like damage.
- None of the three can garrison, use Overdrive, or receive armory and treasure bonuses.

Kill streaks: kills within 2.5 s of each other chain. Reaching 10 / 25 / 50 / 100 pays
+20 / +50 / +100 / +250 minerals, once each per streak.

Supply drops: first at 14 s into a wave, then every 26 s, near the base. Worth
30 + 6 × (round − 1) minerals, with a 20% chance to also recharge a cooling air strike. A crate
lasts 18 s and is collected by a click or by a ground unit or Patch Rig within 0.9 tiles.

Redeploy (Z) rebuilds last round's units and promotions at the normal prices, which the
round-end refund already paid back; it is a convenience and does not change the economy.

These numbers are a first pass: the unit contracts are tested, but late-round balance with the
new units has not been playtested.

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

- Unlocks in round 5; costs 900 minerals. Build with J. Flies over terrain, remains vulnerable to anti-air.
- Dreadnought: 1,400 HP, 6 armour, four 30-damage shots every 0.6s, 8 range, 2.1 movement speed.
- Flagship promotion costs 700: 2,100 HP, four 42-damage shots every 0.5s, 8.8 range.
- Yamato: 1.4s charge, 12 range, 26s cooldown from charge start. Deals 1,400 armour-ignoring
  damage to the lock and 260 splash to other enemies within 2.6 tiles, including aircraft.
  Damage scales with weapon promotions and base research (1,960 direct damage on a Flagship).
- Auto-targets bosses, hives and enemies with at least 300 maximum HP. Select a cruiser and
  press Y, or use its inspector button, for a manual shot. Explicit attack orders take priority;
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

## Twin-cannon bunker — 15 November 2026

- Two roof cannons on an octagonal armoured bunker; select 1–2 Troopers and right-click to garrison.
- Each occupant operates one cannon. An empty bunker cannot fire.
- Garrisoned Troopers gain ×1.5 damage and +2 range (base: 12 damage, 6.4 range), with normal promotions and research retained.
- Destruction ejects both occupants alive at their current health; they resume normal rifle combat without bunker bonuses.
- `tests/browser-bunker.cjs` checks operator count, separate muzzles, capacity, bonuses, and survivor combat.

### Brood Ray and air reinforcements

- Wraith waves start at round 5 with 3 flyers, increasing to a maximum of 16.
- Brood Rays join at round 7: 220 base HP, 3 armour, 18 acid damage every 1.65s, 4.8 range, 2.1 speed, and 7 bounty. They fly and target both ground and air. Waves grow from 1 to a maximum of 8.
- From round 5, every fourth enemy in an evolved hive's brood is a Wraith. From round 7 and evolution 2, the final brood member becomes a Brood Ray. These replace ground brood members, preserving the brood size cap.
- Scouting recommends Atlas mechs against both flying strains.
