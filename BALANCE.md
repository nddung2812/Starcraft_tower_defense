# Ridgewatch balance pass — 9 November 2026

The Compact roster uses affordable mobile infantry, efficient stationary walkers,
flexible but expensive aircraft, and slow ground artillery. Starting minerals remain
480. Quick Deploy buys three Lineguards for 180, leaving 300 for any one support
unit, fortifications, or promotions. Costs, timings and statistics live in
`src/config.js`; attackSpeed is seconds **between volleys**, not attacks per second.

## Base roster

| Unit | Cost | HP | Armor | Damage per volley | Interval | Raw DPS | Range | Speed |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Lineguard | 60 | 70 | 1 | 8 | 0.80 s | 10.0 | 4.4 | 2.15 |
| Anchor Walker | 160 | 220 | 2 | 13 × 2 | 0.80 s | 32.5 | 6.2 | Emplaced |
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
- After all queued enemies, bosses, and reinforcements are cleared, a 15-second bonus phase
  keeps the current battlefield active. Hives become attackable by units, artillery, strikes,
  and the laser. Each hive has 300 + 45 × (round − 1) HP and pays 100 + 25 × (round − 1)
  minerals once when destroyed. Hive destruction does not increase the bug kill score.
  The full window remains available even if every hive is destroyed. The next canyon then
  starts with the existing three-second briefing. Locate Hive jumps the camera to a live target.
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
