# Ridgewatch balance pass — 9 November 2026

The Compact roster uses affordable mobile infantry, durable slow-moving walkers,
flexible but expensive aircraft, and slow ground artillery. Starting minerals remain
480. Quick Deploy buys three Lineguards for 180, leaving 300 for any one support
unit, fortifications, or promotions. Costs, timings and statistics live in
`src/config.js`; attackSpeed is seconds **between volleys**, not attacks per second.

## Base roster

| Unit | Cost | HP | Armor | Damage per volley | Interval | Raw DPS | Range | Speed |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Lineguard | 60 | 70 | 1 | 8 | 0.80 s | 10.0 | 4.4 | 2.15 |
| Anchor Walker | 160 | 220 | 2 | 13 × 2 | 0.80 s | 32.5 | 6.2 | 1.5 |
| Kestrel | 240 | 140 | 1 | 10 × 2 | 0.85 s | 23.5 | 5.8 | 4.4 |
| Cinder Crawler | 280 | 340 | 3 | 38 × 2 | 2.40 s | 31.7 | 7.0 | 1.25 |
| Patch Rig | 60 rebuild | 70 | — | Repair / revive | — | — | — | 1.9 |

Ranges and speeds use tiles and tiles/second. Raw DPS assumes every projectile hits
one unarmored target, before armory, treasure, Overdrive, travel time and aiming.
Armor subtracts from **each projectile**, minimum one damage. Crawler shells splash
within 1.65 tiles with damage falloff; they cannot hit aircraft. All other combat
units target ground and air. Only Lineguards can enter bunkers (two per bunker).
The Patch Rig's existing repair and revive behavior is unchanged.

- **Lineguard:** base DPS stays at 10 but HP rises from 55 to 70. Price rises from
  50 to 60. The fully promoted investment falls from 640 to 440, making promotion
  useful when firing positions are scarce. Its short range and vulnerability to
  ranged enemies keep a mass of infantry from covering every role.
- **Anchor Walker:** trades all movement for the best base single-target DPS per
  mineral and longer reach. Price falls from 175 to 160; HP rises from 160 to 220.
  Previously its paired weapons only produced 20.5 raw DPS.
- **Kestrel:** terrain-free movement and flexible targeting command a premium.
  Cost rises from 220 to 240, damage falls from 36.9 to 23.5 DPS, range from 6.5 to
  5.8, and speed from 5.2 to 4.4. It can reposition quickly but cannot replace the
  ground line. Enemy ranged units still threaten it; destroyed aircraft stay dead.
- **Cinder Crawler:** two real shells now match its twin barrels. Cost rises from
  260 to 280 and volley interval from 2.2 to 2.4 seconds. Larger splash rewards
  clustered targets; long reload, slow movement and no anti-air leave clear gaps.
  Volley size now comes from the unit specification, so model replacements cannot
  silently halve or double damage.

## Boss evolutions (10 November 2026)

Every defeated boss offers one of three evolutions, alongside existing treasure and
minerals. Combat freezes until a card is chosen. Choices affect existing and future
units for the rest of the run; later picks can unlock another branch or rank up one
already owned. Rank scaling uses log2(rank), so repeat picks have diminishing gains.

- Walking Fortress: Cinder Crawlers deploy after 1.2 seconds stationary, gaining
  +5 range and +0.6 splash radius. Additional ranks add 0.75 × log2(rank) range.
  Valid move orders immediately retract the gold stabilizers and remove the bonuses.
- Chain Lightning: each Anchor Walker projectile jumps to two distinct nearby
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
| Lineguard / Sentry | 70 | 130 | 100 | 17.1 | 4.8 |
| Lineguard / Warden | 120 | 250 | 140 | 30.0 | 5.2 |
| Lineguard / Pathkeeper | 190 | 440 | 190 | 50.0 | 5.6 |
| Anchor Walker / Mk II | 140 | 300 | 290 | 52.8 | 6.7 |
| Anchor Walker / Mk III | 220 | 520 | 380 | 87.5 | 7.2 |
| Kestrel / Flight II | 200 | 440 | 200 | 41.7 | 6.2 |

Promotions still restore full health. Existing salvage, kill income and boss reward
rules remain unchanged. Treasure still benefits all current and future Lineguards.

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
| Rift Skitter | 1 | 37 | 0 | 6 / 0.55 s | 0.95 | 2.4 | 1 |
| Thornspitter | 3 | 76 | 1 | 10 / 1.10 s | 4.0 | 1.85 | 3 |
| Ironback | 4 | 150 | 3 | 12 / 0.90 s | 1.05 | 1.35 | 3 |
| Duskwing | 5 | 100 | 1 | 10 / 1.15 s | 4.2 | 3.1 | 4 |
| Vaultling | 6 | 55 | 0 | 7 / 0.65 s | 0.9 | 2.7 | 2 |
| Mirebelly | 8 | 276 | 1 | 18 / 1.70 s | 3.6 | 1.05 | 5 |

Thornspitters give fresh infantry a small range advantage. Ironbacks remain armored
blockers. Vaultlings trade some melee DPS for their wall-jumping mobility. Duskwings
are slightly tougher but no longer outrange fresh infantry. Mirebellies now actually
appear in round eight; the previous count formula rounded their first wave to zero.
Existing wave HP/speed growth, boss statistics, bounty multipliers and spawn counts
otherwise remain intact. Boss names now include Rift Warden and The Hollow Queen.

## Naming and compatibility

Ridgewatch replaces the former title. The Ridgewatch Compact fights the Rift Brood
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
  future combat units. Patch Rigs gain health too. Promotions and Lineguard loot apply first;
  research multiplies the result. Existing health percentages are preserved. Research lasts
  for the run and is included in checkpoints, independently of hardware refunds.
- After all queued enemies, bosses, and reinforcements are cleared, an optional 60-second phase
  keeps the current battlefield active. A two-second “Destroy enemy's base” notice replaces
  the visible countdown. Hives are attackable during combat and this optional phase by units, artillery, strikes,
  and the laser. Each hive has 300 + 45 × (round − 1) HP and pays 100 + 25 × (round − 1)
  minerals once when destroyed. Hive destruction does not increase the bug kill score.
  Destroying every hive finishes the optional phase early; otherwise it ends after 60 simulation
  seconds. The next canyon starts with the existing three-second briefing. A destroyed hive
  stops spawning its queued troops. Locate Hive jumps the camera to a live target.
- Attack (A) immediately orders every living combat unit toward enemy bases, including bunker
  troops and Anchor Walkers (1.5 tiles/second). Units fight enemies en route, then resume and
  retarget surviving bases. Friendly buildings and Patch Rigs are never attack targets.
  Stop and move orders override the advance; Shift+A retains selected-unit attack-move.
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
| Scorcher | Round 2 | 110 | 130 | 2 | 7 to every ground enemy in the cone | 0.35 s | 2.7 | 2.0 |
| Deadeye | Round 3 | 150 | 60 | 0 | 64, ignores armor | 2.5 s | 9.5 | 2.0 |
| Mender | Round 4 | 100 | 80 | 1 | Heals 12 | 0.8 s | 4.2 | 2.05 |

| Promotion | Price | Total | HP | Effect | Interval | Range |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Scorcher / Inferno | 130 | 240 | 185 | 11 per enemy | 0.32 s | 3.1 |
| Deadeye / Marksman | 170 | 320 | 85 | 100 | 2.1 s | 10.5 |
| Mender / Chief Mender | 120 | 220 | 115 | Heals 20 | 0.7 s | 4.8 |

- **Scorcher:** 20 DPS against each unarmored ground enemy in a 63° cone, so it multiplies with
  pack size. Armor applies to every tick (4 per tick into an Ironback), it cannot hit aircraft, and
  its reach is shorter than a Thornspitter's.
- **Deadeye:** 25.6 DPS with armor ignored, at the longest range in the roster, against ground
  and air. It always picks the highest max-HP target in reach, so it wastes shots when only
  Skitters are present, and it dies quickly to anything that reaches it.
- **Mender:** 15 HP/s to the most injured soldier, walker, crawler, aircraft or Patch Rig in
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
Scorchers against packs and wall vaulters, Deadeyes against armour and ranged siege,
and Anchor Walkers against aircraft. Round 1 recommends Lineguards because Scorchers
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
