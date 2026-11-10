# Unit models

Drop a `.glb` file here with one of these names and that unit uses it instead of its
built-in shape. Reload the page; the browser console says which files were picked up.

| File | Unit |
|---|---|
| `marine.glb` | Marine |
| `goliath.glb` | Goliath |
| `tank.glb` | Siege Tank |
| `scv.glb` | SCV |
| `bunker.glb` | Bunker |
| `zergling.glb` | Zergling (also used for the other bugs unless they have their own file) |
| `warrior.glb`, `hopper.glb`, `tanker.glb` | The other bug strains |

Any unit without a file keeps its built-in model, so you can add them one at a time.

## What the game does with a file

- **Size:** scales it so a Marine is about 1.2 tiles tall, a tank about 1.45 tiles long, and
  so on. You don't need to resize anything in Blender.
- **Facing:** assumes the model faces +Z (the glTF default) and turns it to face the way
  the unit moves. If yours walks sideways or backwards, change `yaw` for it in
  `MODEL_FILES` in `src/config.js` (try `0`, `Math.PI`, or `-Math.PI / 2`).
- **Animations:** plays clips whose names contain *idle*, *walk*/*run*, *shoot*/*fire*/*attack*,
  and *death*/*die*. If yours are named differently, list them under `clips` in
  `MODEL_FILES`, for example `clips: { walk: 'Armature|Jog', death: 'Armature|Fall' }`.
- **Muzzle:** shots leave from the front of the model at about 60% of its height. Set
  `muzzle: [x, y, z]` in `MODEL_FILES` to move it.
- **Turret:** a model file turns as one piece to aim. Only the built-in tank rotates its
  turret separately.

## Scenery: rocks and ground textures

Lane boulders, mountain spires and the ground and cliff textures are also files, listed under
`SCENERY_FILES` in `src/config.js` and loaded by `src/scenery.js`:

- `assets/models/rocks/boulder-N.glb` and `spire-N.glb`: only the shape is used. Boulders are
  fitted to one tile and flattened so they never hide a unit; spires are fitted by height.
- `assets/textures/ground.jpg` (canyon floor), `cliff.jpg` (steep faces) and `slope.jpg`
  (flatter mountain tops). Use seamless, tileable images.

Delete or rename a file and that piece goes back to the built-in look. Sources and licences
for the files in the repo are in `assets/CREDITS.md`.

## Where to get models

- **Free, use for anything (CC0):** Quaternius (quaternius.com) and Kenney (kenney.nl) have
  sci-fi soldiers, mechs and vehicles.
- **Marketplaces:** Sketchfab (filter by "Downloadable"), CGTrader, TurboSquid. Check the
  licence allows use in a game.
- **AI generators:** Meshy, Tripo and Rodin turn a prompt or concept image into a
  textured `.glb`.
- **Animations for humanoids:** upload a character to Mixamo (mixamo.com) to rig it and add
  walk, shoot and death animations, then export and convert to `.glb` (Blender can do this).

Don't use models ripped from StarCraft or other games. They belong to their publishers.

## Keep it light

Aim for under about 20k triangles and 1–2 MB per unit; there can be dozens on screen.
If a file is heavy, `npx @gltf-transform/cli optimize in.glb out.glb` shrinks it a lot.
