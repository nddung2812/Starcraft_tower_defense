import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/*  Materials — CMC-300 armour, sampled off the painted miniature      */
/* ------------------------------------------------------------------ */

export const MAT = {
  armor: new THREE.MeshStandardMaterial({ color: 0x2f74a8, metalness: 0.35, roughness: 0.42 }),
  armorLit: new THREE.MeshStandardMaterial({ color: 0x4e97cc, metalness: 0.35, roughness: 0.38 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x6d7644, metalness: 0.4, roughness: 0.55 }),
  oliveDark: new THREE.MeshStandardMaterial({ color: 0x3e4428, metalness: 0.45, roughness: 0.6 }),
  tankSteel: new THREE.MeshStandardMaterial({ color: 0xd5dbe0, metalness: 0.78, roughness: 0.3 }),
  tankTrim: new THREE.MeshStandardMaterial({ color: 0x8e989f, metalness: 0.72, roughness: 0.38 }),
  tankRed: new THREE.MeshStandardMaterial({ color: 0xd21f28, metalness: 0.45, roughness: 0.4 }),
  tankBlue: new THREE.MeshStandardMaterial({ color: 0x9ad4ff, emissive: 0x3aa6ff, emissiveIntensity: 2.4 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xe2b423, metalness: 0.45, roughness: 0.48 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xa7b0b5, metalness: 0.9, roughness: 0.32 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x4a545b, metalness: 0.85, roughness: 0.42 }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2e363c, metalness: 0.8, roughness: 0.5 }),
  visor: new THREE.MeshStandardMaterial({
    color: 0xf0b23c, metalness: 1, roughness: 0.08,
    emissive: 0xa86b10, emissiveIntensity: 0.9
  }),
  decal: new THREE.MeshStandardMaterial({ color: 0xe9eef0, metalness: 0.2, roughness: 0.6 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xff6a55, emissive: 0xff4a35, emissiveIntensity: 3 }),
  lampGreen: new THREE.MeshStandardMaterial({ color: 0x8bffb4, emissive: 0x3cff8a, emissiveIntensity: 2.4 }),

  flesh: new THREE.MeshStandardMaterial({ color: 0x6a3a78, metalness: 0.05, roughness: 0.78 }),
  fleshDark: new THREE.MeshStandardMaterial({ color: 0x3a1d44, metalness: 0.05, roughness: 0.85 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xddcba1, metalness: 0.15, roughness: 0.55 }),
  boneLit: new THREE.MeshStandardMaterial({ color: 0xf4ead0, metalness: 0.2, roughness: 0.4 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xffb04a, emissive: 0xff7a10, emissiveIntensity: 4 }),
  acid: new THREE.MeshStandardMaterial({ color: 0xb6ff3a, emissive: 0x86e010, emissiveIntensity: 2.2, roughness: 0.35 }),
  scv: new THREE.MeshStandardMaterial({ color: 0xe2b13c, metalness: 0.4, roughness: 0.5 }),

  wall: new THREE.MeshStandardMaterial({ color: 0x6d777d, metalness: 0.75, roughness: 0.55 }),
  wallTrim: new THREE.MeshStandardMaterial({ color: 0xe8a72c, metalness: 0.5, roughness: 0.5 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6a6256, metalness: 0.08, roughness: 0.96 }),
  rockDark: new THREE.MeshStandardMaterial({ color: 0x3c3832, metalness: 0.06, roughness: 1 }),
  rockLite: new THREE.MeshStandardMaterial({ color: 0x8a8172, metalness: 0.05, roughness: 0.92 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x4a453c, metalness: 0.05, roughness: 1 }),
  coreGlow: new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x3cc8ff, emissiveIntensity: 3 }),
  creep: new THREE.MeshStandardMaterial({ color: 0x3d1646, metalness: 0.1, roughness: 0.9 })
};

const box = (w, h, d, r = 0.025, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r * 1.35, Math.min(w, h, d) / 2.05));

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function merged(parts) {
  const geos = parts.map(([g, m]) => {
    const c = g.clone();
    c.applyMatrix4(m);
    c.deleteAttribute('uv');
    return c;
  });
  return mergeGeometries(geos, false);
}

const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x, y, z, rx, ry, rz) => new THREE.Matrix4()
  .makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
  .premultiply(new THREE.Matrix4().makeTranslation(x, y, z));

/* ------------------------------------------------------------------ */
/*  TERRAN MARINE                                                      */
/*  Faces +X. One tile = 1 unit; the trooper stands ~0.95 units tall.  */
/* ------------------------------------------------------------------ */

function buildGaussRifle(tier) {
  const g = new THREE.Group();
  const len = 0.3 + tier * 0.025;

  g.add(mesh(box(0.2, 0.09, 0.09, 0.025), MAT.gunmetal, -0.09, -0.01, 0));   // stock
  g.add(mesh(box(0.26, 0.13, 0.11, 0.03), MAT.steelDark, 0.06, 0.005, 0));   // receiver
  g.add(mesh(box(0.2, 0.03, 0.08, 0.01), MAT.steel, 0.06, 0.08, 0));         // top rail
  g.add(mesh(box(0.06, 0.13, 0.07, 0.018), MAT.gunmetal, 0.06, -0.11, 0));   // magazine

  g.add(mesh(box(len, 0.1, 0.095, 0.025), MAT.steel, 0.19 + len / 2, 0.01, 0));
  for (let i = 0; i < 5 + tier; i++) {
    g.add(mesh(box(0.015, 0.07, 0.1, 0.005), MAT.gunmetal, 0.23 + i * 0.042, 0.01, 0));
  }
  g.add(mesh(box(0.07, 0.11, 0.11, 0.02), MAT.gunmetal, 0.23 + len, 0.01, 0)); // muzzle brake

  if (tier >= 3) {
    for (let i = 0; i < 3; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.01, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0xff9a4a, emissive: 0xff6a10, emissiveIntensity: 3 }));
      coil.rotation.y = Math.PI / 2;
      coil.position.set(0.26 + i * 0.07, 0.01, 0);
      g.add(coil);
    }
  }
  g.userData.muzzle = new THREE.Vector3(0.29 + len, 0.01, 0);
  return g;
}

function buildPauldron(side, tier) {
  const g = new THREE.Group();

  // the big rounded shoulder bell
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), MAT.armor);
  shell.scale.set(1.2, 0.72, 1.02);
  shell.position.y = 0.025;
  shell.castShadow = true;
  g.add(shell);
  g.add(mesh(box(0.3, 0.15, 0.2, 0.055), MAT.armor, 0, -0.055, 0));
  g.add(mesh(box(0.315, 0.05, 0.215, 0.018), MAT.steelDark, 0, -0.14, 0));

  // white dominion disc on the left plate
  if (side < 0) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.014, 20), MAT.decal);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0.005, -0.035, -0.105);
    g.add(disc);
    const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.018, 12), MAT.steelDark);
    pip.rotation.x = Math.PI / 2;
    pip.position.set(0.005, -0.035, -0.112);
    g.add(pip);
  }

  const rankColor = [0x9aa3a8, 0xd8dfe2, 0xe8a72c, 0xff5a4a][tier];
  for (let i = 0; i < tier; i++) {
    const chev = new THREE.Mesh(box(0.055, 0.016, 0.014, 0.005),
      new THREE.MeshStandardMaterial({ color: rankColor, emissive: rankColor, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.4 }));
    chev.position.set(-0.055 + i * 0.05, -0.03, side * 0.102);
    g.add(chev);
  }
  return g;
}

export function buildMarine(tier = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---- legs: two clearly separated armoured columns ----
  const blue = [], steel = [];
  for (const s of [-1, 1]) {
    const z = s * 0.145;
    blue.push([box(0.2, 0.13, 0.19, 0.05), T(0.035, 0.065, z)]);   // boot
    blue.push([box(0.15, 0.2, 0.155, 0.05), T(-0.005, 0.22, z)]);  // shin
    blue.push([box(0.2, 0.22, 0.2, 0.06), T(-0.015, 0.44, z)]);    // thigh
    steel.push([box(0.165, 0.11, 0.175, 0.045), T(0.045, 0.33, z)]); // knee pad
    steel.push([box(0.09, 0.08, 0.195, 0.03), T(0.125, 0.045, z)]);  // toe cap
  }
  const legs = new THREE.Mesh(merged(blue), MAT.armor);
  legs.castShadow = true; legs.receiveShadow = true;
  body.add(legs);
  const kneeMesh = new THREE.Mesh(merged(steel), MAT.steelDark);
  kneeMesh.castShadow = true;
  body.add(kneeMesh);

  // ---- torso (local origin sits at chest height) ----
  const torso = new THREE.Group();
  torso.position.y = 0.73;
  body.add(torso);

  torso.add(mesh(box(0.26, 0.14, 0.33, 0.05), MAT.steelDark, -0.01, -0.2, 0));   // waist
  torso.add(mesh(box(0.27, 0.3, 0.33, 0.07, 3), MAT.armor, -0.02, 0, 0));        // trunk
  const chest = mesh(box(0.13, 0.27, 0.28, 0.06, 3), MAT.steel, 0.1, 0.01, 0);   // breastplate
  torso.add(chest);
  torso.add(mesh(box(0.1, 0.06, 0.2, 0.02), MAT.steelDark, 0.13, -0.11, 0));
  torso.add(mesh(box(0.04, 0.04, 0.04, 0.012), MAT.lampGreen, 0.16, 0.09, 0.1));

  // life-support backpack
  torso.add(mesh(box(0.15, 0.28, 0.27, 0.05), MAT.steelDark, -0.21, 0.02, 0));
  for (let i = -1; i <= 1; i++) torso.add(mesh(box(0.045, 0.045, 0.23, 0.014), MAT.gunmetal, -0.285, 0.02 + i * 0.08, 0));

  for (const s of [-1, 1]) {
    const p = buildPauldron(s, tier);
    p.position.set(-0.01, 0.13, s * 0.255);
    p.rotation.x = s * 0.14;
    torso.add(p);
  }

  // ---- weapon held across the chest, with the hands on it ----
  const weapon = new THREE.Group();
  weapon.position.set(0.17, -0.03, 0.12);
  torso.add(weapon);
  const rifle = buildGaussRifle(tier);
  weapon.add(rifle);
  weapon.userData.muzzle = rifle.userData.muzzle;
  weapon.add(mesh(box(0.1, 0.11, 0.1, 0.035), MAT.steel, 0.02, -0.05, 0.02));    // trigger hand
  weapon.add(mesh(box(0.1, 0.1, 0.1, 0.035), MAT.steel, 0.3, -0.03, -0.06));     // support hand

  // upper arms bridging pauldron to hands
  const armR = mesh(box(0.1, 0.11, 0.24, 0.04), MAT.steelDark, 0.06, 0.02, 0.21);
  armR.rotation.y = -0.5;
  torso.add(armR);
  const armL = mesh(box(0.1, 0.11, 0.3, 0.04), MAT.steelDark, 0.2, 0.0, -0.08);
  armL.rotation.y = -1.05;
  torso.add(armL);

  // ---- helmet ----
  const head = new THREE.Group();
  head.position.set(0.0, 0.265, 0);
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), MAT.armor);
  skull.scale.set(1.12, 1.02, 1);
  skull.castShadow = true;
  head.add(skull);
  head.add(mesh(box(0.16, 0.08, 0.17, 0.03), MAT.steel, -0.05, 0.055, 0));
  head.add(mesh(box(0.12, 0.1, 0.22, 0.035), MAT.steelDark, -0.02, -0.095, 0));  // gorget

  // gold faceplate, tilted up so the camera always catches it
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.093, 20, 16), MAT.visor);
  visor.position.set(0.082, 0.01, 0);
  visor.scale.set(0.66, 0.84, 0.9);
  visor.rotation.z = -0.22;
  head.add(visor);

  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), MAT.steelDark);
  ant.position.set(-0.11, 0.13, 0.07);
  ant.rotation.z = 0.55;
  head.add(ant);
  head.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.lamp, -0.16, 0.21, 0.07));

  root.userData = { body, torso, head, weapon, visor, legs };
  return root;
}

/* ------------------------------------------------------------------ */
/*  GOLIATH — faces +X. Twin autocannons, reverse-joint legs.          */
/* ------------------------------------------------------------------ */

export function buildGoliath(tier = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  for (const s of [-1, 1]) {
    body.add(mesh(box(0.16, 0.18, 0.16, 0.03), MAT.steelDark, -0.02, 0.78, s * 0.2));
    const thigh = mesh(box(0.11, 0.42, 0.12, 0.03), MAT.oliveDark, -0.06, 0.52, s * 0.28);
    thigh.rotation.z = 0.35;
    body.add(thigh);
    const shin = mesh(box(0.1, 0.4, 0.11, 0.025), MAT.olive, 0.1, 0.24, s * 0.34);
    shin.rotation.z = -0.45;
    body.add(shin);
    body.add(mesh(box(0.26, 0.07, 0.16, 0.02), MAT.gunmetal, 0.16, 0.04, s * 0.36));
  }

  const torso = new THREE.Group();
  torso.position.y = 1.02;
  body.add(torso);
  torso.add(mesh(box(0.46, 0.32, 0.42, 0.05), MAT.olive, -0.02, 0, 0));
  torso.add(mesh(box(0.28, 0.2, 0.34, 0.04), MAT.steel, 0.12, 0.12, 0));
  torso.add(mesh(box(0.18, 0.1, 0.24, 0.02), MAT.visor, 0.22, 0.16, 0));
  torso.add(mesh(box(0.2, 0.22, 0.3, 0.03), MAT.steelDark, -0.28, 0.04, 0));

  const weapon = new THREE.Group();
  torso.add(weapon);
  const muzzles = [];
  for (const s of [-1, 1]) {
    const gun = new THREE.Group();
    gun.position.set(0.16, 0.02, s * 0.3);
    gun.add(mesh(box(0.16, 0.14, 0.14, 0.03), MAT.steelDark, 0, 0, 0));
    gun.add(mesh(box(0.62, 0.09, 0.09, 0.02), MAT.gunmetal, 0.36, 0, 0));
    gun.add(mesh(box(0.1, 0.12, 0.12, 0.02), MAT.oliveDark, 0.62, 0, 0));
    gun.add(mesh(box(0.18, 0.1, 0.14, 0.02), MAT.wallTrim, -0.02, 0.12, 0));
    weapon.add(gun);
    muzzles.push(new THREE.Vector3(0.78, 0.02, s * 0.3));
  }
  weapon.userData.muzzles = muzzles;
  weapon.userData.muzzle = muzzles[0];

  const rankColor = [0x9aa3a8, 0xe8a72c, 0xff5a4a][tier] || 0x9aa3a8;
  for (let i = 0; i <= tier; i++) {
    torso.add(mesh(box(0.06, 0.025, 0.02, 0.005),
      new THREE.MeshStandardMaterial({ color: rankColor, emissive: rankColor, emissiveIntensity: 0.5 }),
      0.24, 0.02 - i * 0.045, 0));
  }

  root.userData = { body, torso, weapon };
  return root;
}

/* ------------------------------------------------------------------ */
/*  SIEGE TANK — faces +X. Hull stays put; the turret is the torso.    */
/* ------------------------------------------------------------------ */

/* A side view (x forward, y up) pushed out across the hull, with chamfered edges. */
function profileGeometry(points, width, bevel = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = width - bevel * 2;
  return new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 1,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1
  }).translate(0, 0, -depth / 2);
}

let tankParts = null;

/** Built once; every Hammer shares it. Hull, turret and guns are merged per material. */
function tankGeometry() {
  const steel = MAT.tankSteel, trim = MAT.tankTrim, dark = MAT.gunmetal, mid = MAT.steelDark, red = MAT.tankRed, lamp = MAT.tankBlue;
  const groups = { hull: new Map(), turret: new Map(), guns: new Map() };
  let into = groups.hull;
  const add = (mat, geo, matrix = null, smooth = false) => {
    if (!into.has(mat)) into.set(mat, []);
    into.get(mat).push([geo, matrix, smooth]);
  };
  const blk = (mat, w, h, d, x, y, z, rz = 0) => add(mat, new THREE.BoxGeometry(w, h, d), TR(x, y, z, 0, 0, rz));
  const wheel = (mat, r, thick, sides, x, y, z) => add(mat, new THREE.CylinderGeometry(r, r, thick, sides).rotateX(Math.PI / 2), T(x, y, z));
  const tube = (mat, front, back, len, x, y, z) => add(mat, new THREE.CylinderGeometry(front, back, len, 10).rotateZ(-Math.PI / 2), T(x, y, z), true);
  const post = (mat, top, bottom, h, sides, x, y, z) => add(mat, new THREE.CylinderGeometry(top, bottom, h, sides), T(x, y, z));
  const mirror = (half) => [...half, ...half.filter(([, z]) => z > 0).reverse().map(([x, z]) => [x, -z])];

  // hull: a tub between the tracks under a wedge of armour, blunt prow beam in front
  blk(mid, 1.0, 0.16, 0.5, 0, 0.15, 0);
  add(steel, profileGeometry([[-0.6, 0.22], [0.6, 0.22], [0.66, 0.29], [0.3, 0.43], [-0.52, 0.43], [-0.62, 0.34]], 0.6, 0.025));
  blk(dark, 0.07, 0.13, 0.76, 0.66, 0.15, 0);
  const slope = -Math.atan2(0.14, 0.36);                                  // the glacis
  blk(red, 0.3, 0.012, 0.15, 0.483, 0.369, 0, slope);
  for (const s of [-1, 1]) {
    blk(lamp, 0.035, 0.012, 0.1, 0.37, 0.413, s * 0.17, slope);           // vision slits
    blk(lamp, 0.02, 0.04, 0.07, 0.698, 0.19, s * 0.27);                   // driving lamps
    blk(dark, 0.05, 0.04, 0.05, 0.69, 0.1, s * 0.16);                     // tow eyes
  }
  // engine deck, louvres and exhaust stacks
  blk(dark, 0.3, 0.035, 0.46, -0.36, 0.447, 0);
  for (let i = 0; i < 4; i++) blk(trim, 0.035, 0.014, 0.4, -0.47 + i * 0.07, 0.468, 0);
  blk(mid, 0.06, 0.11, 0.42, -0.635, 0.3, 0);
  for (const s of [-1, 1]) {
    post(dark, 0.034, 0.04, 0.17, 8, -0.57, 0.5, s * 0.22);
    post(red, 0.037, 0.037, 0.02, 8, -0.57, 0.575, s * 0.22);
  }

  for (const s of [-1, 1]) {
    const z = s * 0.39;
    // track pod, road wheels on its outer face, a fender over the inner two thirds
    add(dark, profileGeometry([[-0.56, 0.02], [0.52, 0.02], [0.62, 0.13], [0.56, 0.25], [-0.52, 0.25], [-0.62, 0.14]], 0.2, 0.02), T(0, 0, z));
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
      wheel(mid, 0.075, 0.03, 10, x, 0.105, z + s * 0.1);
      wheel(trim, 0.03, 0.045, 6, x, 0.105, z + s * 0.1);
    }
    blk(steel, 1.16, 0.03, 0.17, 0, 0.275, s * 0.345);
    blk(steel, 0.13, 0.03, 0.17, 0.62, 0.245, s * 0.345, -0.5);
    blk(red, 0.22, 0.012, 0.17, 0.3, 0.292, s * 0.345);
    blk(trim, 0.17, 0.055, 0.12, -0.22, 0.317, s * 0.345);                // stowage
    blk(mid, 0.1, 0.045, 0.12, -0.42, 0.312, s * 0.345);
  }

  // turret: faceted shell on a ring, mantlet in front, rack behind
  into = groups.turret;
  post(dark, 0.25, 0.27, 0.05, 12, 0, 0.025, 0);
  add(steel, deckGeometry(mirror([[-0.36, 0.19], [-0.2, 0.27], [0.14, 0.25], [0.36, 0.12]]), 0.05, 0.21, 0.035));
  add(trim, deckGeometry(mirror([[-0.28, 0.13], [-0.16, 0.19], [0.1, 0.17], [0.24, 0.07]]), 0.21, 0.235, 0.01));
  blk(dark, 0.1, 0.15, 0.34, 0.39, 0.125, 0);
  blk(mid, 0.13, 0.1, 0.34, -0.42, 0.12, 0);
  blk(red, 0.135, 0.03, 0.345, -0.42, 0.152, 0);
  post(mid, 0.07, 0.075, 0.05, 10, -0.12, 0.26, 0.09);                    // commander's cupola
  post(trim, 0.05, 0.05, 0.012, 10, -0.12, 0.29, 0.09);
  blk(mid, 0.09, 0.06, 0.08, 0.06, 0.265, -0.1);                          // gunner's sight
  blk(lamp, 0.012, 0.035, 0.055, 0.108, 0.268, -0.1);
  blk(trim, 0.012, 0.34, 0.012, -0.3, 0.4, -0.17);                        // aerial
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    add(dark, new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6).rotateZ(-1.0), T(0.1 + i * 0.045, 0.2, s * 0.245));
  }

  // twin long guns, tied together by a clamp so they read as one weapon
  into = groups.guns;
  for (const s of [-1, 1]) {
    const z = s * 0.09;
    tube(dark, 0.052, 0.058, 0.24, 0.12, 0, z);
    tube(steel, 0.033, 0.036, 0.52, 0.31, 0, z);
    tube(trim, 0.046, 0.046, 0.09, 0.3, 0, z);
    blk(dark, 0.1, 0.085, 0.085, 0.6, 0, z);
    blk(mid, 0.02, 0.095, 0.05, 0.6, 0, z);
  }
  blk(mid, 0.06, 0.05, 0.2, 0.2, 0, 0);

  const bake = (map) => [...map].map(([mat, parts]) => [fuse(parts), mat]);
  return { hull: bake(groups.hull), turret: bake(groups.turret), guns: bake(groups.guns), cleat: new THREE.BoxGeometry(0.05, 0.035, 0.21) };
}

/**
 * Hammer: a low siege crawler. Wedge hull between two armoured track pods, a set-back
 * faceted turret with twin long guns, engine deck and exhausts behind. Only the turret, the
 * guns and the tread cleats are separate meshes, because they are what moves.
 */
export function buildTank() {
  const parts = tankParts || (tankParts = tankGeometry());
  const root = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group(), weapon = new THREE.Group();
  root.add(body, torso);
  for (const [geo, mat] of parts.hull) body.add(mesh(geo, mat));
  const treads = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const cleat = mesh(parts.cleat, MAT.steelDark, -0.4 + i * 0.16, 0.25, s * 0.39);
      cleat.userData.baseX = cleat.position.x;
      body.add(cleat);
      treads.push(cleat);
    }
  }
  torso.position.set(-0.06, 0.43, 0);
  for (const [geo, mat] of parts.turret) torso.add(mesh(geo, mat));
  weapon.position.set(0.44, 0.125, 0);
  for (const [geo, mat] of parts.guns) weapon.add(mesh(geo, mat));
  torso.add(weapon);
  weapon.userData.muzzle = new THREE.Vector3(0.66, 0, 0);
  weapon.userData.muzzles = [-1, 1].map((side) => new THREE.Vector3(0.66, 0, side * 0.09));
  root.userData = { body, torso, weapon, treads };
  return root;
}

/** How far siege mode jacks a Hammer's hull off the ground, in model units. */
export const SIEGE_LIFT = 0.14;

const stage = (k, from, to) => { const t = Math.max(0, Math.min(1, (k - from) / (to - from))); return t * t * (3 - 2 * t); };

/**
 * Everything a Hammer unfolds in siege mode: four hydraulic legs that jack it off its tracks, capacitor
 * pods on the turret, coils and muzzle brakes on the guns, and a lock ring on the ground.
 * `pose(k, time, kick)` plays it in order: legs (k 0 to 0.4), lift (0.3 to 0.65), guns (0.6 to 1).
 */
export function buildSiegeRig(ud) {
  const rig = new THREE.Group(), legs = [], feet = [];
  const glow = new THREE.MeshBasicMaterial({ color: 0x2a1606, toneMapped: false });
  const hot = new THREE.Color(0xffa81f), cold = new THREE.Color(0x2a1606);

  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = new THREE.Group();
    leg.rotation.y = Math.atan2(-z * 0.42, x * 0.46);
    const thigh = mesh(box(0.46, 0.1, 0.14, 0.02), MAT.steelDark, 0.2, -0.05, 0);
    thigh.rotation.z = -0.32;
    const ram = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8).rotateZ(Math.PI / 2), MAT.steel, 0.2, 0.03, 0);
    ram.rotation.z = -0.32;
    const stripe = mesh(box(0.2, 0.012, 0.15, 0.003), glow, 0.2, 0.002, 0);
    stripe.rotation.z = -0.32;
    const foot = mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.05, 8), MAT.gunmetal, 0.41, -0.175, 0);
    foot.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.05, 8), MAT.steel, 0, 0.045, 0));
    leg.add(thigh, ram, stripe, foot);
    rig.add(leg);
    legs.push({ leg, x: x * 0.46, z: z * 0.42 });
    feet.push(foot);
  }

  // The lock ring lies flat on the ground under the lifted hull.
  const lockMat = new THREE.MeshBasicMaterial({
    color: 0xffa81f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false
  });
  const lock = new THREE.Group();
  lock.add(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.25, 56).rotateX(-Math.PI / 2), lockMat));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05).rotateX(-Math.PI / 2), lockMat);
    tick.position.set(Math.cos(a) * 1.07, 0, Math.sin(a) * 1.07);
    tick.rotation.y = -a;
    lock.add(tick);
  }
  rig.add(lock);

  // Capacitor pods rise out of the turret.
  const pods = new THREE.Group();
  for (const s of [-1, 1]) {
    pods.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.2, 10), MAT.gunmetal, -0.16, 0.07, s * 0.27));
    pods.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.07, 10), glow, -0.16, 0.2, s * 0.27));
    pods.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.03, 10), MAT.steel, -0.16, 0.25, s * 0.27));
  }
  ud.torso.add(pods);

  // Coils along each gun, and a heavy muzzle brake at the end.
  const guns = new THREE.Group();
  for (const s of [-1, 1]) {
    for (const x of [0.3, 0.42, 0.54]) {
      const coil = mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 14), glow, x, 0, s * 0.09);
      coil.rotation.y = Math.PI / 2;
      guns.add(coil);
    }
    guns.add(mesh(box(0.08, 0.12, 0.13, 0.015), MAT.gunmetal, 0.645, 0, s * 0.09));
    guns.add(mesh(box(0.02, 0.135, 0.145, 0.004), glow, 0.61, 0, s * 0.09));
  }
  ud.weapon.add(guns);

  rig.userData.feet = feet;
  rig.userData.pose = (k, time, kick = 0) => {
    const out = stage(k, 0, 0.4), lift = stage(k, 0.3, 0.65), gun = stage(k, 0.6, 1);
    for (const { leg, x, z } of legs) leg.position.set(x * (0.62 + out * 0.5), 0.2 - lift * SIEGE_LIFT, z * (0.62 + out * 0.5));
    lock.position.y = 0.02 - lift * SIEGE_LIFT;
    lock.rotation.y = time * 0.35;
    lock.scale.setScalar(0.6 + out * 0.4);
    lockMat.opacity = gun * (0.5 + Math.sin(time * 3) * 0.12) + kick * 0.4;
    pods.position.y = -0.2 + lift * 0.2;
    pods.visible = lift > 0;
    guns.visible = gun > 0;
    glow.color.copy(cold).lerp(hot, Math.min(1, gun * (0.78 + Math.sin(time * 5) * 0.22) + kick));
    return { lift, gun };
  };
  return rig;
}

/* ------------------------------------------------------------------ */
/*  ZERGLING — faces +X, ~0.8 units long, low to the ground            */
/* ------------------------------------------------------------------ */

/** Vertical scythe in the XY plane: +X is forward, +Y is up. */
function scytheGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.0);
  shape.quadraticCurveTo(0.2, 0.14, 0.4, 0.02);
  shape.quadraticCurveTo(0.22, 0.05, 0.0, -0.035);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 7
  });
  geo.translate(0, 0, -0.013);
  geo.computeVertexNormals();
  return geo;
}

/** Capsule that extends outward (+Z) and a little down, so the leg is a leg. */
function zergLegGeometry() {
  const thigh = new THREE.CapsuleGeometry(0.03, 0.13, 3, 7);
  thigh.rotateX(Math.PI / 2);
  thigh.translate(0, -0.03, 0.085);
  return thigh;
}

/* ------------------------------------------------------------------ */
/*  THE SWARM — original insect strains built from one kit.            */
/*  All face +X. Colour is baked into the vertices, so every strain    */
/*  shares two materials and each creature is a handful of draw calls. */
/*  Geometry is built once per strain and shared by every bug.         */
/* ------------------------------------------------------------------ */

const SWARM_SHELL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.2 });
const SWARM_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const SWARM_WING = new THREE.MeshStandardMaterial({
  vertexColors: true, transparent: true, opacity: 0.62, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.1, depthWrite: false
});

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Placement: translate, then rotate (XYZ), with the scale applied to the piece first. */
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
  V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
const UP = V(0, 1, 0);
/** Placement that lays a piece modelled along +Y (base at the origin) from one point toward another. */
const along = (from, to, sx = 1, sz = sx) => new THREE.Matrix4().compose(
  from, new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()), V(sx, 1, sz));

const orb = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const dome = (r, w = 12, h = 5) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
/** Cone standing on the origin, pointing +Y. */
const spike = (r, h, sides = 5) => new THREE.ConeGeometry(r, h, sides).translate(0, h / 2, 0);
/** Tapered tube from one point to another: [geometry, placement]. */
const limb = (from, to, r0, r1, sides = 6) => {
  const len = from.distanceTo(to);
  return [new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0), along(from, to)];
};
const arc = (r, tube, sweep = Math.PI, seg = 14) => new THREE.TorusGeometry(r, tube, 4, seg, sweep);

/** One painted piece: `top` colour at the top of the shape as modelled, fading to `bottom` at its base. */
function piece(geo, matrix, top, bottom = top) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.computeBoundingBox();
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color();
  const y0 = g.boundingBox.min.y, h = Math.max(1e-6, g.boundingBox.max.y - y0);
  for (let i = 0; i < pos.count; i++) {
    c.copy(b).lerp(a, (pos.getY(i) - y0) / h);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (matrix) g.applyMatrix4(matrix);
  return g;
}
const weld = (pieces) => mergeGeometries(pieces, false);

/** A whole leg in one piece, modelled pointing +X from the hip: thigh up to a knee, shin down to a clawed foot. */
function swarmLeg(P, { reach = 0.3, knee = 0.11, drop = 0.2, thick = 1, kneeAt = 0.5 }) {
  const K = V(reach * kneeAt, knee, 0), F = V(reach, -drop, 0), ankle = K.clone().lerp(F, 0.7);
  return weld([
    piece(orb(0.04 * thick, 8, 6), M(), P.edge),
    piece(...limb(V(0, 0, 0), K, 0.036 * thick, 0.026 * thick), P.edge, P.shell),
    piece(orb(0.031 * thick, 8, 6), M(K.x, K.y, K.z), P.edge),
    piece(...limb(K, ankle, 0.026 * thick, 0.015 * thick), P.shell, P.edge),
    piece(spike(0.017 * thick, ankle.distanceTo(F), 5), along(ankle, F), P.bone, P.edge)   // clawed foot
  ]);
}

/** A hooked mandible for one side, hinged at the origin and reaching forward. */
function swarmJaw(P, s, k = 1) {
  const mid = V(0.09 * k, -0.012 * k, s * 0.034 * k), tip = V(0.155 * k, -0.02 * k, -s * 0.012 * k);
  return weld([
    piece(...limb(V(0, 0, 0), mid, 0.022 * k, 0.014 * k, 5), P.bone, P.edge),
    piece(spike(0.014 * k, mid.distanceTo(tip), 5), along(mid, tip), P.bone)
  ]);
}

/** Three leg pairs, front to rear: x on the body, splay from straight ahead (degrees), reach. */
function swarmLegs(P, ride, pairs, hipY = -0.04, hipZ = 0.1, thick = 1) {
  const legs = [];
  pairs.forEach(([x, splay, reach, opts = {}], i) => {
    const geo = swarmLeg(P, { reach, drop: ride + hipY, thick, ...opts });
    for (const s of [-1, 1]) {
      legs.push({ geo, x, y: hipY, z: s * hipZ, side: s, yaw: -s * splay * Math.PI / 180, phase: ((i + (s > 0 ? 0 : 1)) % 2) * Math.PI });
    }
  });
  return legs;
}

/* Ripper: the common swarmer. Low and quick, with folded striking arms and tail pincers. */
function ripperKit() {
  const P = { shell: 0x2f1547, edge: 0x8d4ab3, belly: 0xc497cc, bone: 0xf4e9cc, glow: 0xffb040 };
  const ride = 0.23;
  const shell = weld([
    piece(orb(0.15), M(-0.2, 0, 0, 0, 0, 0, 1.5, 0.8, 0.95), P.edge, P.belly),            // abdomen
    piece(orb(0.13), M(0.06, 0.01, 0, 0, 0, 0, 1.2, 0.85, 1.05), P.edge, P.belly),        // thorax
    piece(orb(0.105), M(0.27, 0, 0, 0, 0, -0.1, 1.5, 0.7, 1.18), P.edge, P.belly),        // head
    piece(dome(0.15), M(0.07, 0.035, 0, 0, 0, -0.1, 1.25, 0.74, 1.2), P.shell, P.edge),   // shoulder shield
    piece(dome(0.165), M(-0.1, 0.03, 0, 0, 0, 0.16, 1.05, 0.64, 1.02), P.shell, P.edge),  // three overlapping back plates
    piece(dome(0.15), M(-0.22, 0.03, 0, 0, 0, 0.2, 1.05, 0.62, 1.0), P.shell, P.edge),
    piece(dome(0.125), M(-0.33, 0.025, 0, 0, 0, 0.24, 1.05, 0.6, 0.98), P.shell, P.edge),
    piece(dome(0.11, 12, 4), M(0.28, 0.015, 0, 0, 0, -0.2, 1.5, 0.64, 1.2), P.shell, P.edge), // brow plate
    ...[[-0.02, 0.135, 0.11], [-0.15, 0.125, 0.1], [-0.27, 0.105, 0.085]].map(([x, y, h]) =>
      piece(spike(0.022, h), M(x, y, 0, 0, 0, 0.7), P.bone, P.edge)),                     // back spines, swept back
    ...[-1, 1].map((s) => piece(spike(0.018, 0.11), M(0.22, 0.02, s * 0.09, s * 1.2, 0, 0.9), P.bone, P.edge)) // cheek spikes
  ]);
  const glow = weld([
    ...[-1, 1].flatMap((s) => [
      piece(orb(0.025, 8, 6), M(0.35, 0.03, s * 0.068), P.glow),
      piece(orb(0.017, 8, 6), M(0.31, 0.058, s * 0.098), P.glow)
    ]),
    ...[[-0.165, 0.162, 0.63], [-0.28, 0.146, 0.61]].map(([x, r, k]) =>
      piece(arc(r, 0.008), M(x, 0.03, 0, 0, Math.PI / 2, 0, 1, k, 1), P.glow))            // lit seams between the plates
  ]);
  const striker = (s) => {
    const elbow = V(0.04, 0.13, s * 0.06), tip = V(0.34, -0.02, s * 0.02);
    return weld([
      piece(orb(0.034, 8, 6), M(), P.edge),
      piece(...limb(V(0, 0, 0), elbow, 0.03, 0.024), P.edge, P.shell),
      piece(orb(0.028, 8, 6), M(elbow.x, elbow.y, elbow.z), P.edge),
      piece(spike(0.05, elbow.distanceTo(tip), 4), along(elbow, tip, 1, 0.32), P.bone, P.edge)   // flat striking blade
    ]);
  };
  const tailTip = weld([
    piece(...limb(V(0, 0, 0), V(-0.1, 0.01, 0), 0.03, 0.02), P.edge, P.shell),
    ...[-1, 1].flatMap((s) => {
      const a = V(-0.09, 0.01, s * 0.012), b = V(-0.22, 0.03, s * 0.075), c = V(-0.3, 0.03, s * 0.025);
      return [piece(...limb(a, b, 0.016, 0.011, 5), P.bone, P.edge), piece(spike(0.011, b.distanceTo(c), 5), along(b, c), P.bone)];
    })
  ]);
  return {
    ride, shell, glow,
    legs: swarmLegs(P, ride, [[0.13, 50, 0.3], [0.03, 88, 0.32], [-0.08, 128, 0.34]]),
    jaws: [-1, 1].map((s) => ({ geo: swarmJaw(P, s, 1.2), x: 0.385, y: -0.02, z: s * 0.055, side: s })),
    strikers: [-1, 1].map((s) => ({ geo: striker(s), x: 0.15, y: 0.02, z: s * 0.115, side: s })),
    tail: [
      { geo: piece(...limb(V(0, 0, 0), V(-0.13, 0.02, 0), 0.042, 0.03), P.edge, P.shell), x: -0.4, y: 0, z: 0 },
      { geo: tailTip, x: -0.13, y: 0.02, z: 0 }
    ]
  };
}

/* Leaper: the wall vaulter. Slim, rust-coloured, with half-open wing cases and big jumping legs. */
function leaperKit() {
  const P = { shell: 0x55270c, edge: 0xd9862f, belly: 0xf5d99c, bone: 0xfff2d2, glow: 0x7ff6ff };
  const ride = 0.22;
  const shell = weld([
    piece(orb(0.13), M(-0.2, 0, 0, 0, 0, 0, 1.7, 0.72, 0.78), P.edge, P.belly),
    piece(orb(0.115), M(0.07, 0.015, 0, 0, 0, 0, 1.15, 0.9, 0.95), P.edge, P.belly),
    piece(orb(0.085), M(0.25, 0.02, 0, 0, 0, -0.25, 1.2, 0.85, 1.05), P.edge, P.belly),
    piece(dome(0.125), M(0.07, 0.04, 0, 0, 0, -0.1, 1.2, 0.8, 1.08), P.shell, P.edge),
    piece(dome(0.09, 12, 4), M(0.255, 0.035, 0, 0, 0, -0.3, 1.25, 0.7, 1.1), P.shell, P.edge),
    ...[-1, 1].map((s) => piece(dome(0.12), M(-0.2, 0.045, s * 0.075, s * 0.42, -s * 0.24, 0.12, 2.0, 0.5, 0.62), P.edge, P.shell)), // wing cases
    ...[-1, 1].flatMap((s) => {                                                              // swept-back feelers
      const a = V(0.29, 0.07, s * 0.04), b = V(0.2, 0.2, s * 0.1), c = V(0.0, 0.24, s * 0.14);
      return [piece(...limb(a, b, 0.012, 0.008, 4), P.bone, P.edge), piece(spike(0.008, b.distanceTo(c), 4), along(b, c), P.bone)];
    }),
    piece(spike(0.03, 0.2, 5), along(V(-0.4, 0, 0), V(-0.6, 0.03, 0)), P.bone, P.edge)       // tail spike
  ]);
  const glow = weld([
    ...[-1, 1].map((s) => piece(orb(0.034, 8, 6), M(0.3, 0.045, s * 0.07, 0, 0, 0, 1, 1.1, 0.8), P.glow)),
    piece(arc(0.1, 0.008), M(-0.2, 0.03, 0, 0, Math.PI / 2, 0, 1, 0.75, 1), P.glow)
  ]);
  return {
    ride, shell, glow,
    legs: swarmLegs(P, ride, [
      [0.13, 48, 0.24, { knee: 0.09 }], [0.03, 85, 0.26, { knee: 0.09 }],
      [-0.1, 138, 0.42, { knee: 0.27, kneeAt: 0.36, thick: 1.5 }]
    ], -0.03, 0.085),
    jaws: [-1, 1].map((s) => ({ geo: swarmJaw(P, s, 0.75), x: 0.33, y: -0.02, z: s * 0.04, side: s })),
    strikers: [], tail: [], hindLeap: true
  };
}

/* Brute: the armoured strain. Broad, dark, horned, with a spiked dome and a tail club. */
function bruteKit() {
  const P = { shell: 0x1a0d2c, edge: 0x5a2f7c, belly: 0x9070a0, bone: 0xece0c0, glow: 0xff4f3d };
  const ride = 0.25;
  const shell = weld([
    piece(orb(0.17), M(-0.18, 0, 0, 0, 0, 0, 1.45, 0.92, 1.3), P.edge, P.belly),
    piece(orb(0.15), M(0.1, 0, 0, 0, 0, 0, 1.2, 0.95, 1.3), P.edge, P.belly),
    piece(orb(0.1), M(0.31, -0.02, 0, 0, 0, -0.15, 1.3, 0.85, 1.3), P.edge, P.belly),
    piece(dome(0.2, 14, 6), M(-0.14, 0.03, 0, 0, 0, 0.1, 1.5, 0.88, 1.3), P.shell, P.edge),   // back dome
    piece(dome(0.175, 14, 6), M(0.11, 0.04, 0, 0, 0, -0.12, 1.15, 0.84, 1.34), P.shell, P.edge), // shoulder shield
    piece(dome(0.105, 12, 4), M(0.31, 0.005, 0, 0, 0, -0.25, 1.35, 0.8, 1.34), P.shell, P.edge),
    piece(spike(0.045, 0.25, 6), M(0.37, 0.03, 0, 0, 0, -1.0), P.bone, P.edge),               // nose horn
    ...[-1, 1].flatMap((s) => [
      piece(spike(0.03, 0.13), M(0.14, 0.15, s * 0.11, s * 0.5, 0, 0.3), P.bone, P.edge),      // two rows of back spikes
      piece(spike(0.032, 0.15), M(-0.06, 0.17, s * 0.13, s * 0.5, 0, 0.45), P.bone, P.edge),
      piece(spike(0.028, 0.13), M(-0.26, 0.15, s * 0.11, s * 0.5, 0, 0.6), P.bone, P.edge),
      piece(spike(0.022, 0.12), M(0.3, 0.01, s * 0.115, s * 1.3, 0, 0.7), P.bone, P.edge)      // cheek spikes
    ])
  ]);
  const glow = weld([
    ...[-1, 1].map((s) => piece(orb(0.024, 8, 6), M(0.385, 0.0, s * 0.085), P.glow)),
    piece(arc(0.205, 0.009), M(-0.01, 0.035, 0, 0, Math.PI / 2, 0, 1, 0.86, 1.3), P.glow)     // seam between the two shields
  ]);
  const club = weld([
    piece(orb(0.065, 10, 8), M(-0.1, 0.01, 0), P.shell, P.edge),
    ...[[0, 1, 0], [0, 0, 1], [0, 0, -1], [-1, 0.25, 0], [-0.6, 0.6, 0.5], [-0.6, 0.6, -0.5]].map(([dx, dy, dz]) => {
      const d = V(dx, dy, dz).normalize(), c = V(-0.1, 0.01, 0);
      return piece(spike(0.022, 0.1), along(c.clone().addScaledVector(d, 0.045), c.clone().addScaledVector(d, 0.15)), P.bone, P.edge);
    }),
    piece(...limb(V(0, 0, 0), V(-0.07, 0.01, 0), 0.034, 0.028), P.edge, P.shell)
  ]);
  return {
    ride, shell, glow,
    legs: swarmLegs(P, ride, [[0.17, 52, 0.31], [0.02, 88, 0.33], [-0.14, 126, 0.34]], -0.05, 0.14, 1.6),
    jaws: [-1, 1].map((s) => ({ geo: swarmJaw(P, s, 1.35), x: 0.4, y: -0.05, z: s * 0.065, side: s })),
    strikers: [],
    tail: [
      { geo: piece(...limb(V(0, 0, 0), V(-0.14, 0.03, 0), 0.05, 0.036), P.edge, P.shell), x: -0.42, y: 0, z: 0 },
      { geo: club, x: -0.14, y: 0.03, z: 0 }
    ],
    ram: true
  };
}

/* Corroder: the acid siege strain. A swollen, glowing acid sac in a cage of ribs, and a spitting snout. */
function corroderKit() {
  const P = { shell: 0x12281a, edge: 0x3f7d3c, belly: 0x93b873, bone: 0xe9e4bb, glow: 0xd0ff52 };
  const ride = 0.21;
  const rib = (x, r, k) => piece(arc(r, 0.017, Math.PI * 1.15, 16), M(x, 0.085, 0, 0, Math.PI / 2, -0.236, 1, k, 1), P.shell, P.edge);
  const shell = weld([
    piece(orb(0.125), M(0.1, 0, 0, 0, 0, 0, 1.25, 0.9, 1.1), P.edge, P.belly),
    piece(orb(0.09), M(0.27, -0.01, 0, 0, 0, 0, 1.2, 0.9, 1.05), P.edge, P.belly),
    piece(dome(0.135), M(0.1, 0.03, 0, 0, 0, -0.12, 1.25, 0.8, 1.14), P.shell, P.edge),
    piece(dome(0.095, 12, 4), M(0.27, 0.02, 0, 0, 0, -0.2, 1.25, 0.75, 1.1), P.shell, P.edge),
    piece(...limb(V(0.31, 0, 0), V(0.47, 0.035, 0), 0.045, 0.034, 8), P.edge, P.shell),      // spitting snout
    piece(arc(0.036, 0.011, Math.PI * 2, 12), M(0.47, 0.035, 0, 0, Math.PI / 2, 0), P.bone),
    rib(-0.08, 0.2, 0.98), rib(-0.2, 0.225, 0.98), rib(-0.32, 0.2, 0.98),                     // rib cage over the sac
    piece(arc(0.235, 0.017, Math.PI * 0.8, 14), M(-0.2, 0.07, 0, 0, 0, 0.25, 1.05, 1, 1), P.shell, P.edge), // spine along the top
    ...[-0.1, -0.2, -0.3].map((x) => piece(spike(0.02, 0.09), M(x, 0.29, 0, 0, 0, 0.4), P.bone, P.edge))
  ]);
  const glow = weld([
    ...[-1, 1].map((s) => piece(orb(0.022, 8, 6), M(0.33, 0.035, s * 0.07), P.glow)),
    piece(orb(0.028, 8, 6), M(0.475, 0.035, 0), P.glow),
    ...[-1, 1].map((s) => piece(orb(0.02, 8, 6), M(0.12, 0.1, s * 0.09), P.glow))
  ]);
  return {
    ride, shell, glow,
    sac: { geo: orb(0.2, 14, 10), x: -0.2, y: 0.09, z: 0, sx: 1.2, sy: 0.95, sz: 1.08 },
    legs: swarmLegs(P, ride, [[0.15, 55, 0.27], [0.02, 90, 0.3], [-0.12, 125, 0.3]], -0.04, 0.11, 1.35),
    jaws: [-1, 1].map((s) => ({ geo: swarmJaw(P, s, 0.7), x: 0.33, y: -0.05, z: s * 0.045, side: s })),
    strikers: [], tail: []
  };
}

const SWARM_KITS = { zergling: ripperKit, hopper: leaperKit, warrior: bruteKit, tanker: corroderKit };
const swarmKit = (strain) => (swarmKit.cache[strain] ||= SWARM_KITS[strain]());
swarmKit.cache = {};

/** Build one creature from its strain's shared kit. The rig is posed by `userData.swarm.pose()`. */
function buildSwarmling(strain) {
  const kit = swarmKit(strain);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.position.y = kit.ride;
  const add = (parent, geo, mat = SWARM_SHELL, at = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = mat !== SWARM_GLOW;
    if (at) m.position.set(at.x, at.y, at.z);
    parent.add(m);
    return m;
  };
  const hinge = (parent, part) => {
    const g = new THREE.Group();
    g.position.set(part.x, part.y, part.z);
    add(g, part.geo);
    parent.add(g);
    return g;
  };
  add(body, kit.shell);
  add(body, kit.glow, SWARM_GLOW);
  let sac = null;
  if (kit.sac) {
    sac = add(body, kit.sac.geo, MAT.acid, kit.sac);
    sac.scale.set(kit.sac.sx, kit.sac.sy, kit.sac.sz);
  }
  const legs = kit.legs.map((leg) => ({ ...leg, hip: hinge(body, leg) }));
  for (const leg of legs) leg.hip.rotation.y = leg.yaw;
  const jaws = kit.jaws.map((jaw) => ({ side: jaw.side, pivot: hinge(body, jaw) }));
  const strikers = kit.strikers.map((st) => ({ side: st.side, x: st.x, pivot: hinge(body, st) }));
  const tail = [];
  kit.tail.reduce((parent, seg) => { const g = hinge(parent, seg); tail.push(g); return g; }, body);
  const hindFrom = legs.length - 2;

  /** gait: stride phase · run: 0–1 pace · swing: 1 at the start of a bite · air: mid-leap · time: seconds */
  const pose = ({ gait = 0, run = 0, swing = 0, air = false, time = 0 }) => {
    legs.forEach((leg, i) => {
      const ph = gait + leg.phase, hind = kit.hindLeap && i >= hindFrom;
      leg.hip.rotation.y = leg.yaw + leg.side * Math.sin(ph) * 0.42 * (0.12 + run) * (air ? 0.2 : 1);
      // lift the foot on the forward swing; in the air the legs tuck (jumping legs kick out behind)
      leg.hip.rotation.z = air ? (hind ? -0.55 : 0.5) : Math.max(0, Math.cos(ph)) * 0.34 * run;
    });
    body.position.y = kit.ride + Math.abs(Math.sin(gait * 2)) * 0.014 * run + Math.sin(time * 2.2 + kit.ride * 40) * 0.006;
    body.rotation.x = Math.sin(gait) * 0.05 * run;
    body.rotation.z = Math.sin(gait * 2) * 0.025 * run - swing * (kit.ram ? 0.24 : 0.12);    // lunge into the bite
    for (const jaw of jaws) jaw.pivot.rotation.y = -jaw.side * (0.2 + swing * 0.65 + Math.sin(time * 6 + jaw.side) * 0.05);
    for (const st of strikers) {
      st.pivot.rotation.z = 0.3 - swing * 1.2;
      st.pivot.rotation.y = -st.side * (0.18 - swing * 0.3);
      st.pivot.position.x = st.x + swing * 0.05;
    }
    const sway = Math.sin(gait * 0.6 + time * 1.3) * 0.3 * (0.35 + run);
    tail.forEach((seg, i) => { seg.rotation.y = sway * (i ? 0.9 : 1); seg.rotation.z = i ? 0.12 : -0.08 + swing * 0.3; });
    if (sac) {
      const k = 1 + swing * 0.14 + Math.sin(time * 3.2) * 0.035;
      sac.scale.set(kit.sac.sx * k, kit.sac.sy * k, kit.sac.sz * k);
    }
  };
  pose({});
  root.userData = { body, sac, swarm: { strain, pose } };
  return root;
}

/** The common swarmer; kept under its old name for the inspector portrait and anything else that imports it. */
export function buildZergling() {
  return buildSwarmling('zergling');
}

/**
 * Needler: the swarm's ranged strain. A segmented serpent that rears up off a coiled tail,
 * with a fan of quills down its back that it launches as spines from a glowing throat sac.
 * Faces +X; rig: body (rears / recoils), head, crest (flares on a shot), tail[] (undulates).
 */
export function buildNeedler() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // tail: a chain of shrinking segments trailing back along the ground
  const tail = [];
  let parent = body;
  const radii = [0.12, 0.1, 0.08, 0.06, 0.045];
  radii.forEach((r, i) => {
    const seg = new THREE.Group();
    seg.position.set(i === 0 ? -0.16 : -r * 1.75, i === 0 ? 0.0 : -0.005, 0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), i % 2 ? MAT.fleshDark : MAT.flesh);
    ball.scale.set(1.35, 0.85, 1);
    ball.castShadow = true;
    seg.add(ball);
    if (i < radii.length - 1) {
      const ridge = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), MAT.bone);
      ridge.scale.set(1.1, 0.5, 0.75);
      ridge.position.y = r * 0.55;
      seg.add(ridge);
    } else {
      const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), MAT.boneLit);
      stinger.rotation.z = Math.PI / 2;
      stinger.position.x = -0.08;
      seg.add(stinger);
    }
    seg.userData.phase = i * 0.9;
    parent.add(seg);
    parent = seg;
    tail.push(seg);
  });

  // trunk: base segment on the ground, then three rising segments
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), MAT.flesh);
  base.scale.set(1.3, 0.9, 1);
  base.castShadow = true;
  body.add(base);

  const torso = new THREE.Group();
  torso.position.set(0.06, 0.08, 0);
  body.add(torso);
  const rise = [[0.03, 0.12, 0.13], [0.08, 0.26, 0.115], [0.12, 0.39, 0.1]];
  for (const [x, y, r] of rise) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), MAT.flesh);
    s.scale.set(0.95, 1.15, 0.9);
    s.position.set(x, y, 0);
    s.castShadow = true;
    torso.add(s);
    // belly plates on the front, armour ridge on the back
    const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 10, 6, 0, Math.PI), MAT.bone);
    belly.rotation.y = -Math.PI / 2;
    belly.scale.set(0.6, 0.9, 0.55);
    belly.position.set(x + r * 0.45, y, 0);
    torso.add(belly);
  }

  // quill crest: the ammunition, fanned down the spine, longest at the shoulders
  const crest = new THREE.Group();
  crest.position.set(0.02, 0.3, 0);
  torso.add(crest);
  const quillGeo = new THREE.ConeGeometry(0.018, 1, 5).translate(0, 0.5, 0);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    for (const s of [-1, 1]) {
      if (i === 0 && s > 0) continue;
      const q = new THREE.Mesh(quillGeo, i % 2 ? MAT.boneLit : MAT.bone);
      const len = 0.16 + Math.sin(k * Math.PI) * 0.17;
      q.scale.set(1, len, 1);
      q.position.set(-0.05 - k * 0.2, 0.12 - k * 0.32, s * (i === 0 ? 0 : 0.03 + k * 0.04));
      q.rotation.set(s * (0.25 + k * 0.5), 0, 0.55 + k * 0.5);
      q.castShadow = true;
      crest.add(q);
    }
  }

  // head: long, low skull angled down at the target, with splayed mandibles
  const head = new THREE.Group();
  head.position.set(0.2, 0.5, 0);
  head.rotation.z = -0.35;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), MAT.flesh);
  skull.scale.set(1.75, 0.8, 0.95);
  skull.castShadow = true;
  head.add(skull);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.bone);
  brow.scale.set(1.8, 0.55, 1.05);
  brow.position.set(0.0, 0.025, 0);
  head.add(brow);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), MAT.eye);
    eye.position.set(0.1, 0.02, s * 0.055);
    head.add(eye);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.13, 6), MAT.boneLit);
    jaw.rotation.set(s * 0.35, 0, -Math.PI / 2 - 0.25);
    jaw.position.set(0.17, -0.04, s * 0.04);
    head.add(jaw);
  }
  // throat sac glows where the spines are spat from
  const sac = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 9), MAT.acid);
  sac.scale.set(1.2, 0.8, 1);
  sac.position.set(0.06, -0.06, 0);
  head.add(sac);

  // short hooked forelimbs tucked against the chest
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.14, 0.3, s * 0.09);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 3, 6), MAT.fleshDark);
    upper.rotation.z = -0.9;
    upper.position.set(0.04, -0.03, 0);
    arm.add(upper);
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 5), MAT.bone);
    hook.rotation.z = -2.4;
    hook.position.set(0.1, -0.09, 0);
    arm.add(hook);
    arm.userData.side = s;
    torso.add(arm);
    arms.push(arm);
  }

  body.position.y = 0.12;
  root.userData = { serpent: true, body, torso, head, crest, tail, arms, sac };
  return root;
}

const MAW_SKIN = [
  new THREE.MeshStandardMaterial({ color: 0x8d5f7c, metalness: 0.05, roughness: 0.62 }),
  new THREE.MeshStandardMaterial({ color: 0x744a6c, metalness: 0.05, roughness: 0.68 })
];
const MAW_THROAT = new THREE.MeshStandardMaterial({ color: 0xb8320f, emissive: 0xd63a0c, emissiveIntensity: 0.9, roughness: 0.45 });

/**
 * Burrowing ambusher: a ringed trunk that rises out of a churned mound and ends in a
 * four-petal maw. The trunk is a chain of nested rings so it can sway and bend; `userData.maw`
 * hands the rings, jaws and height to the entity that animates it.
 */
export function buildMaw() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body);
  // churned earth where it broke the surface; stays put while the trunk rises through it
  const mound = new THREE.Group();
  const lip = mesh(new THREE.TorusGeometry(0.46, 0.14, 5, 11).rotateX(Math.PI / 2), MAT.rockDark, 0, 0.03, 0);
  lip.scale.y = 0.7;
  mound.add(lip);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3, r = 0.52 + (i % 3) * 0.07;
    const clod = mesh(new THREE.DodecahedronGeometry(0.07 + (i % 2) * 0.035, 0), i % 2 ? MAT.rock : MAT.rockLite, Math.cos(a) * r, 0.05, Math.sin(a) * r);
    clod.rotation.set(a, a * 2, 0);
    mound.add(clod);
  }
  root.add(mound);

  const ringGeo = new THREE.SphereGeometry(1, 12, 6).scale(1, 0.62, 1);
  const bandGeo = new THREE.CylinderGeometry(1, 1, 0.045, 12);
  const spineGeo = new THREE.ConeGeometry(0.035, 0.15, 5).rotateZ(-Math.PI / 2);
  const rings = [];
  let parent = body, top = 0;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Group();
    seg.position.y = i ? 0.19 : 0.1;
    top += seg.position.y;
    const r = 0.37 - i * 0.012 + (i === 6 ? 0.02 : 0);
    const ring = mesh(ringGeo, MAW_SKIN[i % 2]);
    ring.scale.setScalar(r);
    seg.add(ring);
    const band = mesh(bandGeo, MAT.fleshDark, 0, 0.095, 0);
    band.scale.set(r * 0.9, 1, r * 0.9);
    seg.add(band);
    if (i % 2 === 0 && i > 0) {
      for (const a of [0.6, 2.2, 3.8, 5.4]) {   // bristles it drags itself along with
        const spine = mesh(spineGeo, MAT.bone, Math.cos(a) * (r + 0.04), 0, Math.sin(a) * (r + 0.04));
        spine.rotation.y = -a;
        seg.add(spine);
      }
    }
    parent.add(seg);
    parent = seg;
    rings.push(seg);
  }
  // the maw: four hinged petals around a glowing throat
  head.position.y = 0.16;
  parent.add(head);
  top += 0.16;
  head.add(mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.1, 12), MAT.fleshDark, 0, 0, 0));
  head.add(mesh(new THREE.CircleGeometry(0.23, 12).rotateX(-Math.PI / 2), MAW_THROAT, 0, 0.055, 0));
  const petalGeo = new THREE.ConeGeometry(0.18, 0.5, 4).scale(1, 1, 0.5).translate(0, 0.25, 0);
  const toothGeo = new THREE.ConeGeometry(0.022, 0.1, 4);
  const jaws = [];
  for (let i = 0; i < 4; i++) {
    const turn = new THREE.Group(), jaw = new THREE.Group();
    turn.rotation.y = i * Math.PI / 2 + Math.PI / 4;
    jaw.position.set(0, 0.03, 0.2);             // hinge on the rim
    jaw.add(mesh(petalGeo, i % 2 ? MAT.flesh : MAT.fleshDark));
    jaw.add(mesh(new THREE.ConeGeometry(0.035, 0.16, 5), MAT.boneLit, 0, 0.55, 0));
    for (const [x, y] of [[-0.07, 0.16], [0.07, 0.16], [-0.045, 0.3], [0.045, 0.3]]) {
      const tooth = mesh(toothGeo, MAT.bone, x, y, -0.07);
      tooth.rotation.x = -Math.PI / 2;
      jaw.add(tooth);
    }
    jaw.rotation.x = 0.55;                      // resting half open; the entity animates it
    turn.add(jaw);
    head.add(turn);
    jaws.push(jaw);
  }
  root.userData.torso = body;
  root.userData.weapon = head;
  head.userData.muzzle = new THREE.Vector3(0, 0.3, 0);
  root.userData.maw = { rings, jaws, mound, height: top + 0.55 };
  return root;
}

export function buildBug(breed) {
  if (breed === 'maw') return buildMaw();
  if (breed === 'ultralisk') return buildUltralisk();
  if (breed === 'needler') return buildNeedler();
  return buildSwarmling(SWARM_KITS[breed] ? breed : 'zergling');
}

/* ------------------------------------------------------------------ */
/*  STRUCTURES                                                         */
/* ------------------------------------------------------------------ */

export function buildWall() {
  const g = new THREE.Group();
  const paint = MAT.wall.clone();
  const slab = mesh(box(0.88, 0.62, 0.88, 0.06, 3), paint, 0, 0.31, 0);
  g.add(slab);
  const stripe = mesh(box(0.9, 0.12, 0.9, 0.02), MAT.wallTrim, 0, 0.44, 0);
  g.add(stripe);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(mesh(box(0.12, 0.66, 0.12, 0.03), MAT.steelDark, x * 0.38, 0.33, z * 0.38));
  }
  g.userData.paint = paint;
  return g;
}

export function buildBunker() {
  const g = new THREE.Group();
  const paint = MAT.wall.clone();
  const red = new THREE.MeshStandardMaterial({ color: 0xa51c28, metalness: 0.65, roughness: 0.38 });
  // Low octagonal fort with sloped armour and a central armoured dome.
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.22, 8), MAT.steelDark, 0, 0.11, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.43, 0.57, 0.23, 8), paint, 0, 0.32, 0));
  const dome = mesh(new THREE.SphereGeometry(0.39, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 0.42, 0);
  dome.scale.y = 0.6;
  g.add(dome);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const plate = mesh(box(0.25, 0.055, 0.23, 0.015), MAT.gunmetal, Math.cos(a) * 0.47, 0.36, Math.sin(a) * 0.47);
    plate.rotation.y = -a;
    plate.rotation.z = -0.4;
    g.add(plate);
    const stripe = mesh(box(0.14, 0.025, 0.045, 0.006), red, Math.cos(a) * 0.53, 0.28, Math.sin(a) * 0.53);
    stripe.rotation.y = -a;
    g.add(stripe);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 8), MAT.gunmetal, 0, 0.66, 0));
  g.add(mesh(box(0.16, 0.028, 0.045), red, 0, 0.68, 0));
  g.add(mesh(box(0.045, 0.028, 0.16), red, 0, 0.68, 0));
  const cannons = [];
  for (const side of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.08, 12), MAT.steelDark, 0.12, 0.55, side * 0.3));
    const cannon = new THREE.Group();
    cannon.position.set(0.12, 0.65, side * 0.3);
    cannon.add(mesh(box(0.25, 0.17, 0.2, 0.025), paint, 0, 0, 0));
    const barrel = mesh(box(0.4, 0.075, 0.085, 0.008), MAT.gunmetal, 0.27, 0, 0);
    barrel.add(mesh(box(0.07, 0.1, 0.11, 0.008), MAT.steelDark, 0.17, 0, 0));
    cannon.add(barrel);
    const light = mesh(box(0.035, 0.035, 0.07), new THREE.MeshStandardMaterial({ color: 0xc32b35, emissive: 0xff2638, emissiveIntensity: 0.15 }), 0.02, 0.09, 0);
    cannon.add(light);
    cannon.userData = { barrel, light, recoil: 0, muzzle: new THREE.Vector3(0.51, 0, 0) };
    g.add(cannon); cannons.push(cannon);
  }
  g.userData.cannons = cannons;
  g.userData.paint = paint;
  return g;
}

export function buildScv() {
  const g = new THREE.Group();
  g.add(mesh(box(0.46, 0.22, 0.36, 0.04), MAT.scv, 0, 0.2, 0));
  g.add(mesh(box(0.18, 0.14, 0.22, 0.03), MAT.steel, 0.16, 0.32, 0));
  g.add(mesh(box(0.16, 0.08, 0.1, 0.02), MAT.gunmetal, 0.36, 0.16, 0));
  for (const s of [-1, 1]) g.add(mesh(box(0.36, 0.09, 0.1, 0.02), MAT.steelDark, 0, 0.06, s * 0.18));
  return g;
}

/** Cells in the charge bar on the base cannon's rails, and the colours of everything unlit on it. */
export const LASER_CELLS = 10;
export const LASER_CELL_OFF = 0x2a1210;
export const LASER_CORE_OFF = 0x4a0d08;

export function buildCore(level = 0) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.86, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c333a, metalness: 0.8, roughness: 0.46 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc22830, metalness: 0.5, roughness: 0.4 });

  // segmented foundation skirt
  g.add(mesh(new THREE.CylinderGeometry(0.98, 1.05, 0.22, 32), dark, 0, 0.11, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const block = mesh(box(0.34, 0.34, 0.22, 0.04), hull, Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86);
    block.rotation.y = -a;
    g.add(block);
  }

  // main drum and the red armour band
  g.add(mesh(new THREE.CylinderGeometry(0.74, 0.8, 0.46, 32), hull, 0, 0.52, 0));
  const band = mesh(new THREE.TorusGeometry(0.76, 0.05, 8, 24), red, 0, 0.66, 0);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.16, 32), dark, 0, 0.82, 0));

  // dome
  const dome = mesh(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, 0.88, 0);
  dome.scale.y = 0.58;
  g.add(dome);

  // bridge tower, offset so the dome still reads
  const tower = new THREE.Group();
  tower.position.set(0.5, 0.8, 0.48);
  tower.add(mesh(box(0.34, 0.34, 0.3, 0.04), dark, 0, 0.16, 0));
  tower.add(mesh(box(0.4, 0.07, 0.36, 0.02), red, 0, 0.35, 0));
  tower.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 10), hull, 0, 0.42, 0));
  const glass = new THREE.MeshStandardMaterial({
    color: 0xd8eeff, emissive: 0x8ec8ff, emissiveIntensity: 1.4, metalness: 0.15, roughness: 0.18
  });
  for (const z of [-0.08, 0, 0.08]) tower.add(mesh(box(0.03, 0.1, 0.055, 0.008), glass, 0.18, 0.18, z));
  g.add(tower);

  // rotating comms dish on the tower
  const dish = new THREE.Group();
  dish.position.set(0.5, 1.28, 0.48);
  dish.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), dark, 0, 0.08, 0));
  const plate = mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), hull, 0.08, 0.16, 0);
  plate.rotation.z = -0.9;
  dish.add(plate);
  g.add(dish);

  // Roof-mounted twin-rail laser cannon. The barrel faces +X in turret-local space.
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x1b2229, metalness: 0.9, roughness: 0.3 });
  // Not tone mapped: these have to read as lit in Eco graphics, which has no bloom.
  const laserCore = new THREE.MeshBasicMaterial({ color: LASER_CORE_OFF, toneMapped: false });
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.14, 24), dark, 0, 1.17, 0));
  const race = mesh(new THREE.TorusGeometry(0.4, 0.016, 6, 32), laserCore, 0, 1.25, 0);
  race.rotation.x = Math.PI / 2;
  g.add(race);

  const laserTurret = new THREE.Group();
  laserTurret.position.y = 1.5;
  laserTurret.rotation.y = Math.PI;
  laserTurret.add(mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.2, 8), hull, -0.1, -0.13, 0));
  laserTurret.add(mesh(box(0.74, 0.24, 0.46, 0.06), gunmetal, -0.12, 0.06, 0));
  for (const side of [-1, 1]) {
    // Raked armour cheeks with a red stripe, closing in toward the barrel.
    const cheek = mesh(box(0.66, 0.22, 0.09, 0.03), hull, -0.1, 0.05, side * 0.29);
    cheek.rotation.y = side * 0.2;
    laserTurret.add(cheek);
    const stripe = mesh(box(0.46, 0.04, 0.02, 0.008), red, -0.1, 0.1, side * 0.345);
    stripe.rotation.y = side * 0.2;
    laserTurret.add(stripe);
    // Capacitor drums on the back of the turret; their bands glow with the charge.
    const drum = mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.3, 12), dark, -0.56, 0.08, side * 0.15);
    drum.rotation.z = Math.PI / 2;
    laserTurret.add(drum);
    for (const x of [-0.64, -0.48]) {
      const coil = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), laserCore, x, 0.08, side * 0.15);
      coil.rotation.y = Math.PI / 2;
      laserTurret.add(coil);
    }
    // The two rails, each with a bright plate on top that carries the charge bar.
    laserTurret.add(mesh(box(1.2, 0.11, 0.09, 0.025), gunmetal, 0.82, 0.06, side * 0.13));
    laserTurret.add(mesh(box(1.16, 0.02, 0.075, 0.006), hull, 0.82, 0.122, side * 0.13));
    const fin = mesh(box(0.5, 0.05, 0.05, 0.012), hull, 0.56, 0.04, side * 0.2);
    fin.rotation.y = side * 0.1;
    laserTurret.add(fin);
  }
  // The energy core that runs between the rails.
  const coreRod = mesh(new THREE.CylinderGeometry(0.034, 0.034, 1.14, 10), laserCore, 0.83, 0.06, 0);
  coreRod.rotation.z = Math.PI / 2;
  laserTurret.add(coreRod);
  for (const x of [0.36, 0.74, 1.12]) laserTurret.add(mesh(box(0.07, 0.07, 0.4, 0.015), hull, x, -0.03, 0));

  // The charge bar: cells along both rails that light up one by one, breech to muzzle.
  const laserCells = [];
  const cellShape = box(0.086, 0.02, 0.058, 0.005, 1);
  for (let i = 0; i < LASER_CELLS; i++) {
    const cell = new THREE.MeshBasicMaterial({ color: LASER_CELL_OFF, toneMapped: false });
    cell.userData.on = new THREE.Color(0xff2a12).lerp(new THREE.Color(0xffc24a), i / (LASER_CELLS - 1));
    for (const side of [-1, 1]) laserTurret.add(mesh(cellShape, cell, 0.3 + i * 0.106, 0.14, side * 0.13));
    laserCells.push(cell);
  }

  // Flared emitter with three prongs around the lens.
  const muzzleHousing = mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.2, 12), dark, 1.5, 0.06, 0);
  muzzleHousing.rotation.z = -Math.PI / 2;
  laserTurret.add(muzzleHousing);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
    const prong = mesh(box(0.2, 0.05, 0.05, 0.012), hull, 1.64, 0.06 + Math.sin(a) * 0.19, Math.cos(a) * 0.19);
    laserTurret.add(prong);
  }
  const laserLens = new THREE.MeshStandardMaterial({
    color: 0xff3020, emissive: 0xff1608, emissiveIntensity: 0.35, roughness: 0.2
  });
  const laserMuzzle = mesh(new THREE.CircleGeometry(0.15, 20), laserLens, 1.605, 0.06, 0);
  laserMuzzle.rotation.y = Math.PI / 2;
  laserTurret.add(laserMuzzle);
  const laserHalo = mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 24), new THREE.MeshBasicMaterial({
    color: 0xff5a30, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }), 1.62, 0.06, 0);
  laserHalo.rotation.y = Math.PI / 2;
  laserHalo.castShadow = false;
  laserTurret.add(laserHalo);
  g.add(laserTurret);

  // status pips on the hull
  [0xd23a3a, 0xe6c24a, 0x3aa6ee].forEach((color, i) => {
    const pip = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    g.add(mesh(box(0.05, 0.07, 0.04, 0.01), pip, 0.62, 0.58, -0.22 + i * 0.1));
  });

  g.userData = { dish, laserTurret, laserMuzzle, laserCells, laserCore, laserHalo, hull };
  upgradeCore(g, level);
  return g;
}

/** What each base research level adds to the building; past the list, every level still adds a stud and glow. */
export const CORE_STAGES = [
  'Lit gallery', 'Armour buttresses', 'Beacon mast', 'Gold command band', 'Guard pylons',
  'Power conduits', 'Halo ring', 'Pylon crowns', 'Spire crown', 'Sky beacon'
];

/**
 * Dress the base for its research level. Every level adds something of its own (kept in its own
 * group, so the newest one can be animated in) on top of everything earlier levels added.
 * Rebuilds in place and returns the newest level's group, or null at level 0.
 */
export function upgradeCore(g, level = 0) {
  const ud = g.userData;
  if (ud.upgrades) {
    g.remove(ud.upgrades);
    ud.upgrades.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
  const root = ud.upgrades = new THREE.Group();
  g.add(root);
  ud.level = level;
  ud.spin = [];
  ud.blink = [];
  ud.pulse = [];
  // The hull cleans up from field grey to bright plate over the first ten levels.
  ud.hull.color.setHex(0x9aa3ab).lerp(new THREE.Color(0xdfe6ee), Math.min(1, level / 10) * 0.75);
  if (level <= 0) return null;

  const glowBoost = 1 + Math.min(level, 20) * 0.06;
  const lit = (color, intensity = 1.6) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity * glowBoost, roughness: 0.3
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x58626c, metalness: 0.85, roughness: 0.38 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe2b23f, emissive: 0x6b4708, emissiveIntensity: 0.5, metalness: 0.95, roughness: 0.24 });
  const cyan = lit(0x7fe3ff), amber = lit(0xffc45a, 1.3);
  const tiers = [];
  const tier = (n) => {
    if (!tiers[n]) { tiers[n] = new THREE.Group(); tiers[n].name = `CoreStage${n}`; root.add(tiers[n]); }
    return tiers[n];
  };
  const around = (count, radius, y, make, offset = 0) => {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const part = make(i, a);
      part.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
      part.rotation.y = -a;
    }
  };

  // One glowing foundation stud per level, so even very high levels keep changing.
  const studs = Math.min(level, 24);
  for (let i = 0; i < studs; i++) {
    const a = Math.PI / 24 + (i / 24) * Math.PI * 2;
    const stud = mesh(box(0.05, 0.06, 0.09, 0.012), i % 2 ? amber : cyan, Math.cos(a) * 1.06, 0.15, Math.sin(a) * 1.06);
    stud.rotation.y = -a;
    tier(Math.min(i + 1, level)).add(stud);
  }

  // 1: a ring of lit windows round the drum
  around(12, 0.785, 0.5, () => { const w = mesh(box(0.035, 0.09, 0.13, 0.01), cyan); tier(1).add(w); return w; }, Math.PI / 12);
  // 2: four armour buttresses bracing the drum
  if (level >= 2) around(4, 0.93, 0.36, () => {
    const b = new THREE.Group();
    const slab = mesh(box(0.2, 0.52, 0.34, 0.04), steel, 0, 0, 0); slab.rotation.z = 0.32; b.add(slab);
    b.add(mesh(box(0.1, 0.07, 0.36, 0.02), new THREE.MeshStandardMaterial({ color: 0xc22830, metalness: 0.5, roughness: 0.4 }), -0.06, 0.27, 0));
    tier(2).add(b); return b;
  }, Math.PI / 4);
  // 3: a signal mast with a blinking beacon, opposite the bridge tower
  if (level >= 3) {
    const mast = new THREE.Group(); mast.position.set(-0.5, 0.8, -0.48);
    mast.add(mesh(new THREE.CylinderGeometry(0.022, 0.035, 1.0, 6), steel, 0, 0.5, 0));
    for (const y of [0.55, 0.75]) mast.add(mesh(box(0.26, 0.02, 0.02, 0.005), steel, 0, y, 0));
    const beacon = lit(0xff4a3a, 2.4);
    mast.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), beacon, 0, 1.03, 0));
    ud.blink.push(beacon);
    tier(3).add(mast);
  }
  // 4: gold command band and gold caps on the foundation blocks
  if (level >= 4) {
    const band = mesh(new THREE.TorusGeometry(0.775, 0.035, 8, 32), gold, 0, 0.75, 0); band.rotation.x = Math.PI / 2;
    tier(4).add(band);
    around(8, 0.86, 0.385, () => { const cap = mesh(box(0.3, 0.03, 0.2, 0.01), gold); tier(4).add(cap); return cap; });
  }
  // 5: four guard pylons at the corners
  const pylonAt = [];
  if (level >= 5) around(4, 1.13, 0, (i, a) => {
    const p = new THREE.Group();
    p.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 8), steel, 0, 0.35, 0));
    p.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), gold, 0, 0.7, 0));
    const orb = lit(0x7fe3ff, 2.2);
    p.add(mesh(new THREE.SphereGeometry(0.075, 12, 8), orb, 0, 0.8, 0));
    ud.pulse.push(orb);
    pylonAt.push(a);
    tier(5).add(p); return p;
  }, Math.PI / 4);
  // 6: power conduits up the drum and a lit ring on the ground
  if (level >= 6) {
    around(12, 0.79, 0.52, () => { const c = mesh(box(0.03, 0.4, 0.035, 0.008), amber); tier(6).add(c); return c; });
    const ground = mesh(new THREE.RingGeometry(1.2, 1.27, 48), new THREE.MeshBasicMaterial({ color: 0xffc45a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), 0, 0.03, 0);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    tier(6).add(ground);
  }
  // 7: a slowly turning halo above the dome
  const halo = (radius, y, tilt, speed, n) => {
    const h = new THREE.Group(); h.position.y = y; h.rotation.z = tilt;
    const ring = new THREE.Group(); h.add(ring);
    const hoop = mesh(new THREE.TorusGeometry(radius, 0.022, 8, 48), gold); hoop.rotation.x = Math.PI / 2; ring.add(hoop);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ring.add(mesh(box(0.1, 0.06, 0.06, 0.012), cyan, Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    ud.spin.push({ obj: ring, speed });
    tier(n).add(h);
  };
  if (level >= 7) halo(0.95, 1.0, 0.1, 0.6, 7);
  // 8: gold crowns and orbiting rings on the pylons
  if (level >= 8) for (const a of pylonAt) {
    const top = new THREE.Group(); top.position.set(Math.cos(a) * 1.13, 0.8, Math.sin(a) * 1.13);
    const ring = mesh(new THREE.TorusGeometry(0.14, 0.014, 6, 20), gold); ring.rotation.x = Math.PI / 2.6;
    top.add(ring);
    top.add(mesh(new THREE.ConeGeometry(0.035, 0.16, 6), gold, 0, 0.16, 0));
    ud.spin.push({ obj: top, speed: 1.6 });
    tier(8).add(top);
  }
  // 9: a crown of spires round the upper deck
  if (level >= 9) around(8, 0.62, 0.99, () => { const sp = mesh(new THREE.ConeGeometry(0.04, 0.22, 6), gold); tier(9).add(sp); return sp; }, Math.PI / 8);
  // 10: a second halo and a beacon of light into the sky
  if (level >= 10) {
    halo(0.72, 1.82, -0.16, -0.9, 10);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = mesh(new THREE.CylinderGeometry(0.05, 0.16, 3.4, 12, 1, true), beamMat, -0.5, 3.5, -0.48);
    beam.castShadow = false; beam.receiveShadow = false;
    ud.beam = beamMat;
    tier(10).add(beam);
  } else ud.beam = null;

  return tiers[Math.min(level, tiers.length - 1)] || null;
}

export function buildHatchery() {
  const g = new THREE.Group();
  const flesh = new THREE.MeshStandardMaterial({ color: 0x651e32, roughness: 0.5 });
  const membrane = new THREE.MeshStandardMaterial({ color: 0xc39a32, emissive: 0x805014, emissiveIntensity: 0.45, roughness: 0.32 });
  const egg = new THREE.Group();
  g.add(egg);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), flesh);
  core.position.y = 1.05;
  core.scale.set(0.83, 1.12, 0.83);
  egg.add(core);
  const plates = [];
  // Raised golden membranes sit inside a dark, fleshy lattice, like a brood egg.
  for (let row = 0; row < 3; row++) {
    const latitude = -0.65 + row * 0.65;
    const count = row === 1 ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + row * 0.42;
      const plate = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), membrane);
      plate.position.set(Math.cos(angle) * Math.cos(latitude) * 0.79, 1.05 + Math.sin(latitude) * 1.08, Math.sin(angle) * Math.cos(latitude) * 0.79);
      plate.lookAt(plate.position.clone().multiplyScalar(2).sub(new THREE.Vector3(0, 1.05, 0)));
      plate.scale.set(0.31 + (i % 2) * 0.035, 0.4, 0.19);
      plate.userData.rest = plate.position.clone();
      plate.castShadow = true;
      egg.add(plate); plates.push(plate);
    }
  }
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), MAT.creep);
  mound.scale.set(1.2, 0.18, 1.2); g.add(mound);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const points = [new THREE.Vector3(Math.cos(a)*0.5,0.55,Math.sin(a)*0.5), new THREE.Vector3(Math.cos(a+0.2)*0.95,0.16,Math.sin(a+0.2)*0.95), new THREE.Vector3(Math.cos(a+0.35)*1.35,0.04,Math.sin(a+0.35)*1.35)];
    const root = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.085, 5, false), flesh);
    g.add(root);
  }
  g.userData = { egg, plates, membrane };
  return g;
}

const ROCK_MATS = [MAT.rock, MAT.rockDark, MAT.rockLite];
const MOUNTAIN_PROTOS = [];

function makeMountain(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.Group();
  const mat = ROCK_MATS[seed % ROCK_MATS.length];
  const piles = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < piles; i++) {
    const r = 0.18 + rnd() * 0.16;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), i === piles - 1 ? ROCK_MATS[(seed + 1) % ROCK_MATS.length] : mat);
    rock.position.set((rnd() - 0.5) * 0.38, 0.12 + i * 0.16 + rnd() * 0.08, (rnd() - 0.5) * 0.38);
    rock.rotation.set(rnd() * 2, rnd() * 6, rnd() * 2);
    rock.scale.set(1.1 + rnd() * 0.35, 1.3 + rnd() * 0.8, 1.05 + rnd() * 0.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }
  const h = 0.85 + rnd() * 0.55;
  const summit = new THREE.Mesh(new THREE.ConeGeometry(0.14 + rnd() * 0.08, h, 16), mat);
  summit.position.set((rnd() - 0.5) * 0.12, 0.72 + rnd() * 0.2, (rnd() - 0.5) * 0.12);
  summit.rotation.y = rnd() * 6;
  summit.castShadow = true;
  summit.receiveShadow = true;
  g.add(summit);
  return g;
}

function mountainProtos() {
  if (MOUNTAIN_PROTOS.length) return MOUNTAIN_PROTOS;
  for (let i = 0; i < 10; i++) MOUNTAIN_PROTOS.push(makeMountain(i + 3));
  return MOUNTAIN_PROTOS;
}

/* Rounded, weathered boulders for the lane: lumpy, not spiky. A few shapes, reused. */
const BOULDER_PROTOS = [];
function makeBoulder(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Weld shared positions before deformation so adjacent faces share smooth normals.
  const source = new THREE.IcosahedronGeometry(0.5, 3);
  source.deleteAttribute('normal');
  source.deleteAttribute('uv');
  const geo = mergeVertices(source);
  source.dispose();
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const lumps = Array.from({ length: 5 }, () => new THREE.Vector3(rnd() - 0.5, rnd() * 0.6, rnd() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const dir = v.clone().normalize();
    let k = 0.86;
    for (const l of lumps) k += Math.max(0, dir.dot(l)) ** 3 * 0.18;
    v.multiplyScalar(k);
    if (v.y < 0) v.y *= 0.35;           // sits flat on the ground
    p.setXYZ(i, v.x, v.y * 0.72, v.z);
  }
  geo.translate(0, 0.08, 0);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, seed % 2 ? MAT.rock : MAT.rockLite);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function buildBoulder(seed) {
  if (!BOULDER_PROTOS.length) for (let i = 0; i < 6; i++) BOULDER_PROTOS.push(makeBoulder(i + 11));
  return BOULDER_PROTOS[Math.abs(seed) % BOULDER_PROTOS.length].clone();
}

export function buildRock(seed) {
  const list = mountainProtos();
  return list[Math.abs(seed) % list.length].clone(true);
}

/** Twin nacelles, swept wings and articulated twin tracking cannons. Faces +X. */
export function buildFalcon(tier = 0) {
  const root = new THREE.Group();
  const torso = new THREE.Group();
  root.add(torso);
  torso.add(mesh(box(1.35, 0.25, 0.4, 0.08), MAT.armor, 0, 0.15, 0));
  const nose = mesh(new THREE.ConeGeometry(0.22, 0.6, 4).rotateZ(-Math.PI / 2), MAT.armorLit, 0.85, 0.15, 0);
  torso.add(nose);
  torso.add(mesh(box(0.5, 0.18, 0.29, 0.07), MAT.visor, 0.18, 0.35, 0));
  for (const side of [-1, 1]) {
    const wing = mesh(box(0.7, 0.08, 0.75, 0.02), MAT.tankSteel, -0.15, 0.12, side * 0.48);
    wing.rotation.y = side * 0.35;
    torso.add(wing);
    torso.add(mesh(box(0.95, 0.25, 0.24, 0.06), MAT.armor, -0.28, 0.12, side * 0.8));
    torso.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.15, 10).rotateZ(Math.PI / 2), MAT.tankBlue, -0.81, 0.12, side * 0.8));
    torso.add(mesh(box(0.3, 0.24, 0.05, 0.02), tier ? MAT.hazard : MAT.armorLit, -0.5, 0.33, side * 0.8));
  }
  const weapon = new THREE.Group();
  weapon.position.set(0.32, -0.08, 0);
  for (const side of [-1, 1]) {
    weapon.add(mesh(box(0.5, 0.09, 0.09, 0.02), MAT.gunmetal, 0.1, 0, side * 0.3));
    weapon.add(mesh(box(0.04, 0.06, 0.06), MAT.tankBlue, 0.37, 0, side * 0.3));
  }
  weapon.userData.muzzles = [-1, 1].map(side => new THREE.Vector3(0.4, 0, side * 0.3));
  weapon.userData.muzzle = weapon.userData.muzzles[0];
  torso.add(weapon);
  root.userData.torso = torso;
  root.userData.weapon = weapon;
  return root;
}

/** A long insect wing lying flat, reaching out along +Z or -Z from its root, with a dark leading spar. */
function swarmWing(s, length, width, top, tip) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width * 0.55, s * length * 0.45, width * 0.05, s * length);
  shape.quadraticCurveTo(-width * 0.75, s * length * 0.7, -width * 0.5, s * length * 0.12);
  shape.closePath();
  const membrane = new THREE.ShapeGeometry(shape, 6).rotateX(Math.PI / 2);   // shape y becomes z
  const lit = piece(membrane, null, top);
  // paint the membrane from root to tip (piece() fades along Y, and a wing is flat)
  const pos = lit.attributes.position, col = lit.attributes.color, a = new THREE.Color(top), b = new THREE.Color(tip), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, Math.min(1, Math.abs(pos.getZ(i)) / length));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return weld([lit, piece(...limb(V(0, 0, 0), V(width * 0.2, 0, s * length * 0.96), 0.014, 0.004, 4), 0x2a1638)]);
}

/* Wraith: a darting needle-wasp. Four narrow wings, a curled abdomen and a long sting. */
function wraithKit() {
  const P = { shell: 0x2a1444, edge: 0x8448b2, belly: 0xc9a0d8, bone: 0xf4e9cc, glow: 0xffb040 };
  const y = 0.2, segs = [[-0.14, 0.19, 0.115], [-0.29, 0.165, 0.098], [-0.42, 0.12, 0.08], [-0.52, 0.06, 0.062]];
  const shell = weld([
    piece(orb(0.15), M(0.05, y, 0, 0, 0, 0, 1.2, 0.9, 1.0), P.edge, P.belly),               // thorax
    piece(dome(0.16), M(0.05, y + 0.02, 0, 0, 0, -0.1, 1.2, 0.8, 1.02), P.shell, P.edge),
    piece(orb(0.105), M(0.27, y, 0, 0, 0, -0.2, 1.2, 0.85, 1.1), P.edge, P.belly),          // head
    piece(dome(0.11, 12, 4), M(0.27, y + 0.015, 0, 0, 0, -0.3, 1.2, 0.7, 1.12), P.shell, P.edge),
    piece(spike(0.03, 0.3, 5), along(V(0.34, y - 0.03, 0), V(0.64, y - 0.09, 0)), P.bone, P.edge), // proboscis
    ...segs.flatMap(([x, sy, r]) => [
      piece(orb(r, 10, 7), M(x, sy, 0, 0, 0, 0, 1.25, 0.9, 0.95), P.edge, P.belly),
      piece(dome(r * 1.06, 10, 4), M(x, sy + 0.01, 0, 0, 0, 0.25, 1.25, 0.8, 0.98), P.shell, P.edge)
    ]),
    piece(spike(0.022, 0.2, 5), along(V(-0.56, 0.04, 0), V(-0.7, -0.1, 0)), P.bone, P.edge),   // sting
    ...[-1, 1].flatMap((s) => [0.12, 0.0].map((x) =>
      piece(spike(0.014, 0.16, 4), along(V(x, y - 0.1, s * 0.07), V(x + 0.06, y - 0.25, s * 0.1)), P.bone, P.shell))) // tucked claws
  ]);
  const glow = weld([
    ...[-1, 1].map((s) => piece(orb(0.05, 10, 7), M(0.31, y + 0.035, s * 0.078, 0, 0, 0, 1.1, 0.9, 0.7), P.glow)),
    ...segs.slice(0, 3).map(([x, sy, r]) => piece(arc(r * 1.02, 0.007, Math.PI * 2, 12), M(x + r * 0.95, sy, 0, 0, Math.PI / 2, 0, 1, 0.9, 1), P.glow))
  ]);
  const wings = [-1, 1].flatMap((s) => [
    { geo: swarmWing(s, 1.02, 0.3, 0xb98ae0, 0xf0dcff), x: 0.1, y: y + 0.12, z: s * 0.1, side: s, phase: 0, sweep: 0.12 },
    { geo: swarmWing(s, 0.8, 0.26, 0xa678d0, 0xe6ccff), x: -0.03, y: y + 0.11, z: s * 0.1, side: s, phase: 1.1, sweep: -0.38 }
  ]);
  return { shell, glow, wings, beat: 19, flap: 0.5 };
}

/* Brood Ray: a slow armoured glider. Broad fleshy fins, forward horns, acid sacs and a whip tail. */
function broodRayKit() {
  const P = { shell: 0x13251a, edge: 0x3f7a3c, belly: 0xa5ba80, bone: 0xe9e4bb, glow: 0xd0ff52 };
  const y = 0.2;
  const fin = (s) => {
    // a rounded lobe of flesh swept back from the body, dark at the root and pale at the tip
    const lobe = piece(orb(0.5, 14, 8), M(-0.13, 0, s * 0.47, 0, -s * 0.3, 0, 0.72, 0.075, 0.98), P.edge);
    const pos = lobe.attributes.position, col = lobe.attributes.color;
    const root = new THREE.Color(P.shell), mid = new THREE.Color(0x2a5a2c), tip = new THREE.Color(P.edge).lerp(new THREE.Color(P.belly), 0.3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = Math.min(1, Math.abs(pos.getZ(i)) / 1.02);
      if (k < 0.6) c.copy(root).lerp(mid, k / 0.6); else c.copy(mid).lerp(tip, (k - 0.6) * 2.5);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    return weld([
      lobe,
      piece(...limb(V(0.17, 0.03, s * 0.04), V(0.17, 0.026, s * 0.52), 0.034, 0.022, 5), P.bone, P.shell),  // bone along the leading edge
      piece(...limb(V(0.17, 0.026, s * 0.52), V(-0.2, 0.012, s * 0.9), 0.022, 0.008, 5), P.bone, P.bone),
      ...[[-0.33, 0.38], [-0.37, 0.6], [-0.28, 0.78]].map(([x, z]) =>
        piece(...limb(V(0.05, 0.036, s * 0.06), V(x, 0.02, s * z), 0.02, 0.006, 4), P.shell, P.shell))     // finger ribs
    ]);
  };
  const shell = weld([
    piece(orb(0.3, 14, 9), M(-0.05, y, 0, 0, 0, 0, 1.7, 0.5, 1.0), P.edge, P.belly),          // flat body
    piece(dome(0.305, 14, 6), M(-0.05, y + 0.01, 0, 0, 0, 0, 1.7, 0.5, 0.98), P.shell, P.edge),
    piece(dome(0.2, 12, 5), M(0.22, y + 0.02, 0, 0, 0, -0.12, 1.3, 0.55, 1.2), P.shell, P.edge), // head shield
    ...[-1, 1].map((s) => piece(spike(0.07, 0.34, 6), along(V(0.36, y, s * 0.15), V(0.68, y - 0.03, s * 0.1), 1, 0.45), P.bone, P.edge)), // horns
    ...[0.12, -0.08, -0.28, -0.46].map((x, i) => piece(spike(0.035 - i * 0.004, 0.17 - i * 0.02), M(x, y + 0.13 - i * 0.012, 0, 0, 0, 0.55), P.bone, P.edge)),
    ...[-1, 1].flatMap((s) => [-0.1, -0.32].map((x) => piece(spike(0.026, 0.11), M(x, y + 0.1, s * 0.17, s * 0.55, 0, 0.5), P.bone, P.edge)))
  ]);
  const glow = weld([
    ...[-1, 1].map((s) => piece(orb(0.04, 8, 6), M(0.36, y + 0.05, s * 0.2), P.glow)),
    piece(orb(0.05, 8, 6), M(0.46, y - 0.01, 0, 0, 0, 0, 0.6, 0.45, 1.6), P.glow),              // glowing mouth slit
    piece(arc(0.3, 0.009), M(-0.05, y + 0.012, 0, 0, Math.PI / 2, 0, 1, 0.5, 0.98), P.glow)
  ]);
  const sacs = weld([
    ...[-1, 1].map((s) => orb(0.15, 10, 8).applyMatrix4(M(0.02, y - 0.1, s * 0.27, 0, 0, 0, 1.45, 0.8, 1))),
    orb(0.13, 10, 8).applyMatrix4(M(-0.25, y - 0.1, 0, 0, 0, 0, 1.5, 0.75, 1.1))
  ].map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
  const a = V(0, 0, 0), b = V(-0.42, 0.03, 0), c = V(-0.78, -0.05, 0);
  const whip = weld([
    piece(...limb(a, b, 0.06, 0.034), P.edge, P.shell),
    piece(...limb(b, c, 0.034, 0.014), P.edge, P.shell),
    piece(spike(0.04, 0.16, 4), along(c, V(-0.95, -0.1, 0), 1, 0.4), P.bone, P.edge)
  ]);
  const wings = [-1, 1].map((s) => ({ geo: fin(s), x: -0.02, y, z: s * 0.2, side: s, phase: 0, sweep: 0, solid: true }));
  return { shell, glow, wings, sacs, whip: { geo: whip, x: -0.5, y, z: 0 }, beat: 7, flap: 0.42 };
}

const flyerKit = (heavy) => (flyerKit.cache[heavy ? 1 : 0] ||= heavy ? broodRayKit() : wraithKit());
flyerKit.cache = [];

/** The two flying strains: the Wraith, and with `heavy` the armoured Brood Ray. */
export function buildSkyhunter(heavy = false) {
  const kit = flyerKit(heavy);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = mat === SWARM_SHELL; parent.add(m); return m; };
  add(body, kit.shell, SWARM_SHELL);
  add(body, kit.glow, SWARM_GLOW);
  if (kit.sacs) add(body, kit.sacs, MAT.acid);
  const wings = kit.wings.map((w) => {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.z);
    pivot.rotation.y = -w.side * w.sweep;
    add(pivot, w.geo, w.solid ? SWARM_SHELL : SWARM_WING);
    body.add(pivot);
    return { ...w, pivot };
  });
  let whip = null;
  if (kit.whip) {
    whip = new THREE.Group();
    whip.position.set(kit.whip.x, kit.whip.y, kit.whip.z);
    add(whip, kit.whip.geo, SWARM_SHELL);
    body.add(whip);
  }
  const weapon = new THREE.Group();
  weapon.userData.muzzle = new THREE.Vector3(0.55, 0.2, 0);
  body.add(weapon);
  root.userData.torso = body;
  root.userData.weapon = weapon;
  let time = Math.random() * 6;   // so a flight does not beat its wings in step
  let fallen = 0;
  root.userData.anim = (state, dt) => {
    time += dt;
    const dying = state === 'death';
    if (dying) fallen += dt;
    for (const w of wings) {
      const beat = dying ? 0.9 : Math.sin(time * kit.beat + w.phase) * kit.flap + (w.solid ? 0.08 : 0.12);
      w.pivot.rotation.x = -w.side * beat;
    }
    if (whip) { whip.rotation.y = Math.sin(time * 2.1) * 0.35; whip.rotation.z = Math.sin(time * 1.4) * 0.12; }
    body.position.y = dying ? 0 : Math.sin(time * (heavy ? 1.8 : 3.4)) * 0.035;
    body.rotation.z = dying ? Math.min(1.5, fallen) : Math.sin(time * 3) * 0.05 + (state === 'attack' ? -0.12 : 0);
    body.rotation.x = dying ? Math.min(1.1, fallen * 1.6) : Math.sin(time * 1.3) * 0.06;
  };
  return root;
}

/* ------------------------------------------------------------------ */
/*  SPECIALISTS — the infantry frame with its own plating, pack and    */
/*  tool, so each role reads at a glance from the battlefield camera.  */
/* ------------------------------------------------------------------ */

const SPECIALIST_MAT = {
  scorch: new THREE.MeshStandardMaterial({ color: 0xc8521c, metalness: 0.35, roughness: 0.45 }),
  tankage: new THREE.MeshStandardMaterial({ color: 0xe2b423, metalness: 0.55, roughness: 0.4 }),
  pilot: new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff6a10, emissiveIntensity: 3.2 }),
  slate: new THREE.MeshStandardMaterial({ color: 0x4b3f73, metalness: 0.3, roughness: 0.55 }),
  cloak: new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide }),
  lens: new THREE.MeshStandardMaterial({ color: 0xe6d4ff, emissive: 0xa46bff, emissiveIntensity: 2.6 }),
  medic: new THREE.MeshStandardMaterial({ color: 0xe9eef0, metalness: 0.2, roughness: 0.5 }),
  foam: new THREE.MeshStandardMaterial({ color: 0x9dffc4, emissive: 0x2fe07a, emissiveIntensity: 2.6 })
};

/** A trooper frame repainted, with the rifle removed so a role-specific tool can be fitted. */
function specialistFrame(tier, plating) {
  const root = buildMarine(0);
  root.traverse((o) => { if (o.isMesh && o.material === MAT.armor) o.material = plating; });
  const { weapon, torso } = root.userData;
  weapon.remove(weapon.children[0]);
  // one bright shoulder bar per promotion
  for (let i = 0; i < tier; i++) {
    torso.add(mesh(box(0.2, 0.03, 0.05, 0.01),
      new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffa020, emissiveIntensity: 1.4 }), -0.01, 0.27 + i * 0.04, 0.26));
  }
  return root;
}

export function buildScorcher(tier = 0) {
  const root = specialistFrame(tier, SPECIALIST_MAT.scorch);
  const { weapon, torso } = root.userData;
  // twin fuel bottles riding high on the pack
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), SPECIALIST_MAT.tankage);
    tank.position.set(-0.3, 0.1, s * 0.09);
    tank.castShadow = true;
    torso.add(tank);
    torso.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), SPECIALIST_MAT.tankage, -0.3, 0.31, s * 0.09));
  }
  // burner: fat body, flared nozzle, pilot light
  weapon.add(mesh(box(0.34, 0.14, 0.14, 0.04), MAT.gunmetal, 0.1, 0, 0));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), MAT.steelDark);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.38, 0.01, 0);
  weapon.add(barrel);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.1, 10), MAT.steel);
  nozzle.rotation.z = -Math.PI / 2;
  nozzle.position.set(0.56, 0.01, 0);
  weapon.add(nozzle);
  weapon.add(mesh(new THREE.SphereGeometry(0.03 + tier * 0.01, 8, 6), SPECIALIST_MAT.pilot, 0.62, 0.01, 0));
  weapon.userData.muzzle = new THREE.Vector3(0.64, 0.01, 0);
  return root;
}

export function buildDeadeye(tier = 0) {
  const root = specialistFrame(tier, SPECIALIST_MAT.slate);
  const { weapon, torso, head } = root.userData;
  // long rifle, scope and bipod
  const len = 0.78 + tier * 0.08;
  weapon.add(mesh(box(0.24, 0.1, 0.09, 0.025), MAT.gunmetal, 0.0, 0, 0));
  weapon.add(mesh(box(len, 0.05, 0.05, 0.015), MAT.steelDark, 0.12 + len / 2, 0.015, 0));
  weapon.add(mesh(box(0.1, 0.075, 0.075, 0.02), MAT.steel, 0.14 + len, 0.015, 0));
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), MAT.gunmetal);
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.1, 0.09, 0);
  weapon.add(scope);
  weapon.add(mesh(new THREE.SphereGeometry(0.028, 8, 6), SPECIALIST_MAT.lens, 0.2, 0.09, 0));
  weapon.userData.muzzle = new THREE.Vector3(0.2 + len, 0.015, 0);
  // short cloak and a hooded lens instead of the gold visor
  const cloak = mesh(box(0.03, 0.5, 0.42, 0.01), SPECIALIST_MAT.cloak, -0.31, -0.12, 0);
  cloak.rotation.z = -0.16;
  torso.add(cloak);
  head.add(mesh(box(0.2, 0.07, 0.27, 0.03), SPECIALIST_MAT.cloak, -0.03, 0.12, 0));
  root.userData.visor.material = SPECIALIST_MAT.lens;
  return root;
}

export function buildMender(tier = 0) {
  const root = specialistFrame(tier, SPECIALIST_MAT.medic);
  const { weapon, torso } = root.userData;
  // foam canister on the pack, with a green cross facing the camera side
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 14), SPECIALIST_MAT.foam);
  can.position.set(-0.32, 0.08, 0);
  can.castShadow = true;
  torso.add(can);
  for (const s of [-1, 1]) {
    torso.add(mesh(box(0.13, 0.04, 0.012, 0.004), SPECIALIST_MAT.foam, 0.0, 0.14, s * 0.36));
    torso.add(mesh(box(0.04, 0.13, 0.012, 0.004), SPECIALIST_MAT.foam, 0.0, 0.14, s * 0.36));
  }
  // projector: short wand with a glowing emitter
  weapon.add(mesh(box(0.2, 0.09, 0.09, 0.03), MAT.steelDark, 0.06, 0, 0));
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), MAT.steel);
  wand.rotation.z = Math.PI / 2;
  wand.position.set(0.28, 0.01, 0);
  weapon.add(wand);
  weapon.add(mesh(new THREE.SphereGeometry(0.055 + tier * 0.012, 12, 10), SPECIALIST_MAT.foam, 0.43, 0.01, 0));
  weapon.userData.muzzle = new THREE.Vector3(0.46, 0.01, 0);
  return root;
}

/** Supply drop: a strapped crate under a tall beacon, so it can be found from across the map. */
export function buildCrate() {
  const root = new THREE.Group();
  const crate = new THREE.Group();
  crate.add(mesh(box(0.5, 0.36, 0.5, 0.04), MAT.steelDark, 0, 0.2, 0));
  crate.add(mesh(box(0.54, 0.08, 0.54, 0.02), MAT.hazard, 0, 0.2, 0));
  crate.add(mesh(box(0.12, 0.4, 0.54, 0.02), MAT.hazard, 0, 0.2, 0));
  crate.add(mesh(box(0.16, 0.06, 0.16, 0.02), MAT.lampGreen, 0, 0.41, 0));
  root.add(crate);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 5, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = 2.7;
  root.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.y = 0.04;
  root.add(ring);
  root.userData = { crate, beam, ring };
  return root;
}

/* ------------------------------------------------------------------ */
/*  CAPITAL SHIP                                                       */
/*  Faces +X. A fork-prowed lance ship: two armoured tines hold the    */
/*  spinal cannon between them, swept wings carry the engine nacelles, */
/*  and a stepped citadel with the bridge sits aft of centre.          */
/* ------------------------------------------------------------------ */

// Hull paint is less mirror-like than the shared steels, which go near black without reflections to catch.
const SHIP = {
  hull: new THREE.MeshStandardMaterial({ color: 0x74828e, metalness: 0.42, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x39434c, metalness: 0.5, roughness: 0.56 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xbcc6cd, metalness: 0.55, roughness: 0.36 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xe4e9ec, metalness: 0.28, roughness: 0.42 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xe0a92a, metalness: 0.6, roughness: 0.34 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xff9a30, emissive: 0xff6f0a, emissiveIntensity: 1.7 }),
  charge: new THREE.MeshStandardMaterial({ color: 0x201035, emissive: 0x6733bc, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.3 }),
  plume: new THREE.MeshBasicMaterial({
    color: 0x2a7dff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  })
};
const SHIP_MOUNTS = [[-0.02, 0.49], [-0.02, -0.49], [-0.98, 0.47], [-0.98, -0.47]];   // battery turrets: x, z
const shipCache = {};

/** A plan-view outline (x forward, z across) raised between two heights, with chamfered edges. */
function deckGeometry(outline, y0, y1, bevel) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  return new THREE.ExtrudeGeometry(shape, {
    depth: y1 - y0 - bevel * 2, steps: 1, curveSegments: 1,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1
  }).rotateX(Math.PI / 2).translate(0, y1 - bevel, 0);
}

/** Bake each part's transform and merge them: one mesh per material instead of one per plate. */
function fuse(parts) {
  const geos = parts.map(([geo, matrix, smooth]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!smooth) g.computeVertexNormals();   // unindexed, so this gives hard armour facets
    return g;
  });
  return mergeGeometries(geos, false);
}

/** Built once per paint scheme; every ship of that scheme shares the geometry. */
function shipGeometry(flagship) {
  const steel = SHIP.hull, dark = SHIP.dark, trim = SHIP.trim, amber = SHIP.amber;
  const plate = flagship ? SHIP.ivory : MAT.armor;
  const accent = flagship ? SHIP.gold : MAT.decal;
  const hull = new Map(), guns = new Map();
  let into = hull;
  const add = (mat, geo, matrix = null, smooth = false) => {
    if (!into.has(mat)) into.set(mat, []);
    into.get(mat).push([geo, matrix, smooth]);
  };
  const mirror = (half) => [...half, ...half.filter(([, z]) => z > 0).reverse().map(([x, z]) => [x, -z])];
  const side = (pts, s) => pts.map(([x, z]) => [x, z * s]);
  const slab = (mat, outline, y0, y1, bevel) => add(mat, deckGeometry(outline, y0, y1, bevel));
  const blk = (mat, w, h, d, x, y, z, ry = 0) => add(mat, new THREE.BoxGeometry(w, h, d), TR(x, y, z, 0, ry, 0));
  // a prism along the ship's length, flat face up
  const tube = (mat, front, back, len, sides, x, y, z, smooth = false) => add(mat,
    new THREE.CylinderGeometry(front, back, len, sides).rotateZ(-Math.PI / 2).rotateX(Math.PI / sides), T(x, y, z), smooth);

  // keel, main hull and the ventral sensor fin
  slab(dark, mirror([[-1.4, 0.22], [-0.5, 0.4], [0.5, 0.3], [1.15, 0.18]]), -0.2, 0.03, 0.06);
  slab(steel, mirror([[-1.5, 0.3], [-1.32, 0.56], [-0.25, 0.64], [0.5, 0.48], [1.05, 0.34]]), 0, 0.3, 0.05);
  blk(dark, 0.9, 0.16, 0.05, -0.25, -0.26, 0);
  tube(dark, 0.045, 0.075, 0.6, 8, 0.45, -0.22, 0);
  blk(amber, 0.05, 0.03, 0.05, 0.76, -0.22, 0);

  // spinal cannon: breech housing on the foredeck, barrel and coils out between the tines
  slab(dark, mirror([[0.1, 0.17], [0.85, 0.17], [0.97, 0.1]]), 0.3, 0.42, 0.03);
  for (let i = 0; i < 4; i++) blk(amber, 0.028, 0.02, 0.18, 0.3 + i * 0.14, 0.422, 0);
  tube(dark, 0.07, 0.085, 1.0, 10, 1.1, 0.2, 0, true);
  for (const x of [1.14, 1.31, 1.48]) tube(amber, 0.098, 0.098, 0.025, 10, x, 0.2, 0);
  tube(trim, 0.095, 0.08, 0.1, 10, 1.62, 0.2, 0);

  for (const s of [-1, 1]) {
    // prow tine: the foredeck armour running on past the bow
    slab(plate, side([[0.2, 0.2], [0.2, 0.5], [0.5, 0.45], [1.1, 0.34], [1.98, 0.25], [1.98, 0.13], [1.0, 0.13], [0.9, 0.2]], s), 0.06, 0.36, 0.03);
    blk(trim, 0.08, 0.2, 0.135, 1.975, 0.21, s * 0.19);
    blk(amber, 0.78, 0.04, 0.012, 1.5, 0.2, s * 0.126);
    for (const x of [1.22, 1.58]) {   // armour bands
      const zo = 0.34 - (x - 1.1) * 0.1023;
      blk(dark, 0.022, 0.305, zo - 0.124, x, 0.21, s * (0.128 + zo) / 2);
    }
    blk(accent, 0.3, 0.012, 0.028, 1.4, 0.362, s * 0.22, s * 0.051);
    blk(accent, 0.24, 0.012, 0.028, 1.8, 0.362, s * 0.199, s * 0.051);
    for (const x of [0.6, 0.76]) blk(accent, 0.06, 0.012, 0.17, x, 0.362, s * (0.33 - (x - 0.6) * 0.1), s * -0.35);
    for (let i = 0; i < 4; i++) {
      const x = 0.6 + i * 0.13;
      blk(MAT.coreGlow, 0.06, 0.03, 0.012, x, 0.2, s * (0.452 - (x - 0.5) * 0.1833), s * 0.181);
    }

    // shoulder armour beside the citadel
    slab(plate, side([[-1.24, 0.41], [-1.26, 0.5], [-0.25, 0.575], [0.14, 0.49], [0.14, 0.41]], s), 0.3, 0.335, 0.012);
    for (let i = 0; i < 5; i++) blk(MAT.coreGlow, 0.05, 0.022, 0.012, -0.92 + i * 0.16, 0.385, s * 0.372);

    // swept wing and its engine nacelle
    slab(steel, side([[0.3, 0.5], [-0.45, 0.98], [-1.15, 0.98], [-0.95, 0.5]], s), 0.09, 0.2, 0.03);
    slab(plate, side([[0.08, 0.57], [-0.5, 0.93], [-1.02, 0.93], [-0.86, 0.57]], s), 0.2, 0.235, 0.012);
    blk(accent, 0.5, 0.014, 0.045, -0.29, 0.238, s * 0.75, s * 0.555);
    const z = s * 0.96;
    tube(steel, 0.15, 0.17, 1.15, 8, -0.75, 0.15, z);
    tube(plate, 0.035, 0.15, 0.32, 8, -0.015, 0.15, z);
    blk(plate, 0.62, 0.04, 0.2, -0.78, 0.32, z);
    tube(trim, 0.175, 0.185, 0.07, 8, -0.3, 0.15, z);
    tube(trim, 0.185, 0.185, 0.07, 8, -1.2, 0.15, z);
    tube(dark, 0.17, 0.125, 0.18, 8, -1.41, 0.15, z);
    tube(MAT.tankBlue, 0.1, 0.1, 0.02, 10, -1.505, 0.15, z);
    blk(s > 0 ? MAT.lampGreen : MAT.lamp, 0.07, 0.03, 0.07, -0.4, 0.345, z);   // starboard green, port red
    if (flagship) {   // flagship tail fins
      const fin = new THREE.Shape([[-1.28, 0.33], [-0.7, 0.33], [-1.0, 0.6], [-1.28, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)));
      add(plate, new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: false }), T(0, 0, z - 0.015));
      blk(accent, 0.3, 0.025, 0.04, -1.13, 0.605, z);
    }
  }

  // stern: engine block and three main thrusters
  blk(dark, 0.3, 0.3, 0.84, -1.56, 0.14, 0);
  blk(plate, 0.24, 0.04, 0.7, -1.5, 0.31, 0);
  for (const [z, r] of [[-0.27, 0.11], [0, 0.14], [0.27, 0.11]]) {
    tube(steel, r + 0.02, r - 0.01, 0.16, 10, -1.77, 0.14, z);
    tube(MAT.tankBlue, r - 0.03, r - 0.03, 0.02, 10, -1.855, 0.14, z);
  }

  // citadel: two armoured steps, the bridge with its wrapped windscreen, masts and heat stack
  slab(steel, mirror([[-1.22, 0.26], [-1.08, 0.37], [-0.1, 0.37], [0.14, 0.2]]), 0.3, 0.46, 0.04);
  slab(plate, mirror([[-1.1, 0.2], [-1.0, 0.29], [-0.16, 0.29], [0.04, 0.15]]), 0.46, 0.495, 0.012);
  slab(steel, mirror([[-0.98, 0.15], [-0.9, 0.22], [-0.46, 0.22], [-0.3, 0.12]]), 0.49, 0.66, 0.03);
  slab(steel, mirror([[-0.94, 0.14], [-0.87, 0.2], [-0.5, 0.2], [-0.36, 0.1]]), 0.66, 0.8, 0.03);
  slab(MAT.visor, mirror([[-0.62, 0.212], [-0.49, 0.212], [-0.345, 0.108]]), 0.7, 0.765, 0.008);
  slab(plate, mirror([[-0.9, 0.11], [-0.84, 0.16], [-0.53, 0.16], [-0.43, 0.08]]), 0.8, 0.835, 0.012);
  blk(accent, 0.05, 0.012, 0.2, -0.5, 0.838, 0);
  blk(trim, 0.03, 0.09, 0.03, -0.66, 0.875, 0);
  blk(trim, 0.025, 0.3, 0.025, -0.84, 0.98, 0.07);
  blk(trim, 0.014, 0.2, 0.014, -0.88, 0.93, -0.08);
  blk(dark, 0.2, 0.1, 0.34, -1.08, 0.54, 0);
  for (let i = 0; i < 3; i++) blk(amber, 0.025, 0.012, 0.26, -1.13 + i * 0.05, 0.594, 0);

  // four battery turrets, in the recoiling weapon group
  into = guns;
  for (const [x, z] of SHIP_MOUNTS) {
    add(dark, new THREE.CylinderGeometry(0.075, 0.09, 0.05, 8), T(x, 0.36, z));
    blk(steel, 0.17, 0.075, 0.14, x + 0.01, 0.42, z);
    blk(plate, 0.1, 0.02, 0.1, x - 0.02, 0.467, z);
    for (const o of [-0.035, 0.035]) tube(trim, 0.014, 0.018, 0.2, 6, x + 0.19, 0.425, z + o, true);
  }

  const plume = (spots) => mergeGeometries(spots.map(([r, len, y, z]) =>
    new THREE.ConeGeometry(r, len, 10, 1, true).rotateZ(Math.PI / 2).translate(-len / 2, y, z)), false);
  const bake = (map) => [...map].map(([mat, parts]) => [fuse(parts), mat]);
  return {
    hull: bake(hull), guns: bake(guns),
    radar: fuse([[new THREE.BoxGeometry(0.05, 0.035, 0.32)], [new THREE.BoxGeometry(0.02, 0.07, 0.24), T(-0.03, 0.03, 0)]]),
    beacon: new THREE.BoxGeometry(0.045, 0.035, 0.045),
    charge: new THREE.SphereGeometry(0.18, 14, 10),
    plumes: [
      [plume([[0.09, 0.3, 0.15, 0.96], [0.09, 0.3, 0.15, -0.96]]), -1.51],
      [plume([[0.075, 0.32, 0.14, 0.27], [0.105, 0.42, 0.14, 0], [0.075, 0.32, 0.14, -0.27]]), -1.86]
    ]
  };
}

export function buildBattlecruiser(tier = 0) {
  const scheme = tier > 0 ? 1 : 0;
  const parts = shipCache[scheme] || (shipCache[scheme] = shipGeometry(scheme === 1));
  const root = new THREE.Group(), torso = new THREE.Group(), weapon = new THREE.Group();
  root.add(torso); torso.add(weapon);
  for (const [geo, mat] of parts.hull) torso.add(mesh(geo, mat));
  for (const [geo, mat] of parts.guns) weapon.add(mesh(geo, mat));
  const radar = mesh(parts.radar, SHIP.trim, -0.66, 0.935, 0);
  const beacon = mesh(parts.beacon, MAT.lamp, -0.84, 1.145, 0.07);
  const charge = mesh(parts.charge, SHIP.charge, 1.75, 0.2, 0);
  charge.scale.setScalar(0.65);
  const plumes = parts.plumes.map(([geo, x]) => {
    const p = new THREE.Mesh(geo, SHIP.plume);
    p.position.x = x; p.scale.x = 0.75;
    return p;
  });
  torso.add(radar, beacon, charge, ...plumes);
  weapon.userData.muzzles = SHIP_MOUNTS.map(([x, z]) => new THREE.Vector3(x + 0.3, 0.425, z));
  weapon.userData.muzzle = weapon.userData.muzzles[0];

  // Radar sweep, a blinking masthead light, and exhaust that stretches under way.
  let t = Math.random() * 10, thrust = 0.3;
  root.userData.anim = (state, dt) => {
    t += dt;
    radar.rotation.y += dt * 1.8;
    beacon.visible = t % 1.6 < 0.22;
    thrust += ((state === 'walk' ? 1 : 0.3) - thrust) * Math.min(1, dt * 4);
    const flicker = 1 + Math.sin(t * 31) * 0.06 + Math.sin(t * 47) * 0.04;
    for (const p of plumes) p.scale.x = (0.5 + thrust * 0.9) * flicker;
  };
  root.userData.torso = torso; root.userData.weapon = weapon; root.userData.yamato = charge;
  return root;
}

/** Four-legged siege beast with overlapping chitin and paired sweeping scythes. */
export function buildUltralisk() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.set(0.62, 0.5, 0);
  const shell = new THREE.MeshStandardMaterial({ color: 0x3a2449, roughness: 0.48, metalness: 0.22 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x805b8e, roughness: 0.52 });
  const oval = (parent, size, mat, x, y, z) => {
    const m = mesh(new THREE.SphereGeometry(1, 16, 10), mat, x, y, z); m.scale.set(...size); parent.add(m); return m;
  };
  oval(body, [0.9, 0.5, 0.49], MAT.fleshDark, -0.1, 0.64, 0);
  for (let i = 0; i < 4; i++) {
    oval(body, [0.35, 0.35, 0.55 - i * 0.045], i % 2 ? edge : shell, 0.38 - i * 0.36, 0.9 - i * 0.06, 0);
    body.add(mesh(new THREE.ConeGeometry(0.11, 0.38, 5), MAT.bone, 0.25 - i * 0.35, 1.23 - i * 0.07, 0));
  }
  oval(head, [0.42, 0.3, 0.34], shell, 0, 0.08, 0);
  oval(head, [0.28, 0.13, 0.29], MAT.flesh, 0.19, -0.1, 0);
  const tusks = [], legs = [];
  const segment = (parent, a, b, r1, r2) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const m = mesh(new THREE.CylinderGeometry(r2, r1, direction.length(), 8), MAT.boneLit);
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); parent.add(m);
  };
  for (const side of [-1, 1]) {
    oval(head, [0.07, 0.045, 0.04], MAT.eye, 0.24, 0.2, side * 0.27);
    const tusk = new THREE.Group(); tusk.position.set(0.05, -0.03, side * 0.25); head.add(tusk);
    segment(tusk, [0,0,0], [0.25,0.02,side*0.4], 0.13,0.11);
    segment(tusk, [0.25,0.02,side*0.4], [0.7,0.12,side*0.43], 0.11,0.065);
    segment(tusk, [0.7,0.12,side*0.43], [1,0.3,side*0.18], 0.065,0.002);
    tusks.push({ tusk, side });
    for (let i = 0; i < 2; i++) {
      const leg = new THREE.Group(); leg.position.set(0.38-i*0.95, 0.55, side*0.36); body.add(leg);
      oval(leg, [0.25,0.24,0.23], shell, 0,0,side*0.1);
      segment(leg,[0,0,side*0.13],[-0.1,-0.34,side*0.31],0.13,0.08);
      oval(leg,[0.22,0.09,0.14], MAT.fleshDark, 0,-0.48,side*0.33);
      for (let claw=0;claw<2;claw++) segment(leg,[0.1,-0.48,side*0.33+claw*0.08],[0.32,-0.5,side*0.33+claw*0.08],0.045,0.002);
      legs.push({leg,phase:i*Math.PI+(side>0?Math.PI:0)});
    }
  }
  let time = 0, death = 0;
  root.userData.anim = (state, dt) => {
    time += dt;
    if (state === 'death') { death = Math.min(1,death+dt*1.5);body.rotation.z=death*1.4;body.position.y=-death*.25;return; }
    const walk = state === 'walk' ? 1 : 0;
    body.position.y = Math.abs(Math.sin(time*7))*0.035*walk;
    for (const {leg,phase} of legs) leg.rotation.z=Math.sin(time*7+phase)*0.34*walk;
    for (const {tusk,side} of tusks) tusk.rotation.y=state==='attack'?side*(0.12+Math.sin(time*16)*0.38):side*0.03;
    head.rotation.z=state==='attack'?Math.sin(time*16)*0.08:Math.sin(time*2)*0.025;
  };
  return root;
}
