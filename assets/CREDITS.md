# Third-party art

Everything listed here is CC0 1.0 (public domain): free for commercial use, no credit required.
The credits are kept anyway so each file can be traced back to its source. The licence was read
from each source page on 11 Nov 2026. Add a row whenever a new file is dropped in.

## Rock models (`assets/models/rocks/`)

All by Quaternius, downloaded unmodified from Poly Pizza. The game uses only their shape; colour
and surface detail come from `src/scenery.js`.

| File | Source model | Page |
|---|---|---|
| `boulder-1.glb` | Rock Large | https://poly.pizza/m/54jZKTAt5p |
| `boulder-2.glb` | Rock Large | https://poly.pizza/m/li0YBlBEMz |
| `boulder-3.glb` | Rock | https://poly.pizza/m/34W5ymEePk |
| `boulder-4.glb` | Rock | https://poly.pizza/m/b7gRkv0cEa |
| `spire-1.glb` | Rock Large | https://poly.pizza/m/d2VWOdthtR |
| `spire-2.glb` | Rock | https://poly.pizza/m/R2UjZAX3By |

## Unit models (`assets/models/`)

All base models are by Quaternius, from Poly Pizza. Most colours are replaced in the game
(`tint` in `MODEL_FILES`); the customized walker has its palette baked into the file.

| File | Source model | Page | Changes to the file |
|---|---|---|---|
| `soldier.glb` | Character Soldier | https://poly.pizza/m/PpLF4rt4ah | Kept three of its guns and five animation clips; welded and quantized. Used by the Lineguard, Scorcher, Deadeye and Mender. |
| `tank.glb` | Tank | https://poly.pizza/m/jWS1CLA0RO | Kept the forward track animation; welded and quantized. |
| `goliath.glb` | Mech (Finn the Frog chassis) | https://poly.pizza/m/o3Ps8z8ByP | Removed animal pilot; added armoured cockpit, emissive visor, vents, antenna and cannon sleeves. Recoloured the atlas steel-blue/graphite, welded geometry, retained Idle/Walk/Shoot_Big/Death clips. CC0 verified 14 Nov 2026. |
| `falcon.glb` | Spaceship | https://poly.pizza/m/PQzePrvBCD | None. |

## Swarm models (`assets/models/`)

All by Quaternius, downloaded unmodified from Poly Pizza; CC0 read from each page on 17 Nov 2026.
The files keep their original colours: the swarm's palette and glowing eyes are painted on in the
game (`tint` and `glow` in `MODEL_FILES`), which is how one file serves more than one creature.

| File | Source model | Page | Used for |
|---|---|---|---|
| `needler.glb` | Spider | https://poly.pizza/m/yRYJiAJyiM | Needler; in bone white, the Hollow Queen boss. |
| `behemoth.glb` | Triceratops | https://poly.pizza/m/IGvrUqGrRM | Behemoth. |
| `warden.glb` | Stegosaurus | https://poly.pizza/m/eFcNbOlpvl | Rift Warden boss. |
| `tyrant.glb` | T-Rex | https://poly.pizza/m/UYtneO5FpF | The Breacher and the World Eater bosses. |

## Textures (`assets/textures/`)

From Poly Haven (https://polyhaven.com/license). Colour maps only, recompressed as JPEG.

| File | Source texture | Author | Size | Page |
|---|---|---|---|---|
| `ground.jpg` | Dry Ground Rocks | Rob Tuytel | 1024 px | https://polyhaven.com/a/dry_ground_rocks |
| `cliff.jpg` | Rock Face 03 | Dario Barresi, Rico Cilliers | 512 px | https://polyhaven.com/a/rock_face_03 |
| `slope.jpg` | Aerial Rocks 04 | Rob Tuytel | 512 px | https://polyhaven.com/a/aerial_rocks_04 |
