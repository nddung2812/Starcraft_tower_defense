import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  rock: new THREE.MeshStandardMaterial({ color: 0x6a6256, metalness: 0.08, roughness: 0.96, flatShading: true }),
  rockDark: new THREE.MeshStandardMaterial({ color: 0x3c3832, metalness: 0.06, roughness: 1, flatShading: true }),
  rockLite: new THREE.MeshStandardMaterial({ color: 0x8a8172, metalness: 0.05, roughness: 0.92, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: 0x4a453c, metalness: 0.05, roughness: 1 }),
  coreGlow: new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x3cc8ff, emissiveIntensity: 3 }),
  creep: new THREE.MeshStandardMaterial({ color: 0x3d1646, metalness: 0.1, roughness: 0.9 })
};

const box = (w, h, d, r = 0.015, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, Math.min(w, h, d) / 2.05));

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

export function buildTank() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const treads = [];
  for (const s of [-1, 1]) {
    body.add(mesh(box(1.02, 0.18, 0.18, 0.03), MAT.gunmetal, 0, 0.11, s * 0.36));
    body.add(mesh(box(1.06, 0.05, 0.2, 0.012), MAT.steelDark, 0, 0.03, s * 0.36));
    body.add(mesh(box(0.1, 0.16, 0.2, 0.02), MAT.tankTrim, 0.46, 0.12, s * 0.36));
    body.add(mesh(box(0.1, 0.16, 0.2, 0.02), MAT.tankTrim, -0.46, 0.12, s * 0.36));
    for (let i = 0; i < 6; i++) {
      const tread = mesh(box(0.06, 0.2, 0.2, 0.01), MAT.steelDark, -0.4 + i * 0.16, 0.12, s * 0.36);
      tread.userData.baseX = tread.position.x;
      body.add(tread);
      treads.push(tread);
    }
  }

  body.add(mesh(box(0.78, 0.16, 0.5, 0.04), MAT.tankSteel, -0.04, 0.24, 0));
  const nose = mesh(box(0.32, 0.1, 0.46, 0.03), MAT.tankSteel, 0.4, 0.2, 0);
  nose.rotation.z = -0.42;
  body.add(nose);
  body.add(mesh(box(0.16, 0.08, 0.5, 0.02), MAT.tankTrim, -0.42, 0.26, 0));

  for (const s of [-1, 1]) {
    const plate = mesh(box(0.2, 0.035, 0.12, 0.008), MAT.tankRed, 0.46, 0.28, s * 0.12);
    plate.rotation.z = -0.55;
    plate.rotation.y = s * 0.55;
    body.add(plate);
  }

  const torso = new THREE.Group();
  torso.position.set(-0.06, 0.34, 0);
  body.add(torso);
  torso.add(mesh(box(0.46, 0.16, 0.42, 0.05), MAT.tankSteel, 0.02, 0.08, 0));
  torso.add(mesh(box(0.22, 0.08, 0.28, 0.02), MAT.tankTrim, -0.08, 0.18, 0));

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), MAT.tankRed);
  dome.scale.set(1.05, 0.62, 0.95);
  dome.position.set(-0.02, 0.2, 0.02);
  dome.castShadow = true;
  torso.add(dome);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), MAT.visor);
  glass.scale.set(1.1, 0.45, 0.7);
  glass.position.set(0.08, 0.24, 0.02);
  torso.add(glass);

  for (let i = 0; i < 3; i++) {
    torso.add(mesh(box(0.05, 0.02, 0.2, 0.004), i % 2 ? MAT.gunmetal : MAT.hazard, -0.2, 0.2, -0.08 + i * 0.06));
  }
  torso.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), MAT.tankBlue, 0.12, 0.16, 0.18));
  torso.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), MAT.tankBlue, 0.12, 0.16, -0.18));
  torso.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), MAT.lamp, -0.22, 0.14, 0.16));

  const weapon = new THREE.Group();
  weapon.position.set(0.18, 0.12, 0);
  torso.add(weapon);
  weapon.add(mesh(box(0.16, 0.12, 0.28, 0.03), MAT.tankTrim, 0.02, 0, 0));
  const barrel = new THREE.CylinderGeometry(0.055, 0.062, 0.7, 10);
  barrel.rotateZ(Math.PI / 2);
  barrel.translate(0.4, 0, 0);
  for (const s of [-1, 1]) {
    const gun = new THREE.Mesh(barrel, MAT.tankSteel);
    gun.position.set(0, 0.02, s * 0.09);
    gun.castShadow = true;
    weapon.add(gun);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), MAT.gunmetal);
    brake.rotateZ(Math.PI / 2);
    brake.position.set(0.74, 0.02, s * 0.09);
    weapon.add(brake);
  }
  weapon.userData.muzzle = new THREE.Vector3(0.78, 0.02, 0);
  weapon.userData.muzzles = [weapon.userData.muzzle];

  root.userData = { body, torso, weapon, treads };
  return root;
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

export function buildZergling(tint = null) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const flesh = tint ? MAT.flesh.clone() : MAT.flesh;
  if (tint) flesh.color.setHex(tint);

  const thorax = new THREE.SphereGeometry(0.15, 16, 12);
  thorax.scale(1.55, 1.05, 0.72);
  const neck = new THREE.SphereGeometry(0.1, 12, 10);
  neck.scale(1.15, 0.85, 0.7);
  const headGeo = new THREE.ConeGeometry(0.09, 0.26, 9);
  headGeo.rotateZ(-Math.PI / 2);
  const hipGeo = new THREE.SphereGeometry(0.1, 12, 10);
  hipGeo.scale(1.05, 0.9, 0.75);

  const shell = new THREE.Mesh(merged([
    [thorax, T(0, 0.02, 0)],
    [neck, T(0.2, 0.03, 0)],
    [headGeo, T(0.4, 0.02, 0)],
    [hipGeo, T(-0.2, 0.0, 0)]
  ]), flesh);
  shell.castShadow = true;
  body.add(shell);

  const plates = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.SphereGeometry(0.07 + i * 0.008, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    p.scale(1.05, 0.55, 0.7);
    plates.push([p, T(-0.14 + i * 0.11, 0.12, 0)]);
  }
  const crest = new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  crest.scale(1.4, 0.45, 0.55);
  plates.push([crest, T(0.3, 0.08, 0)]);
  const carapace = new THREE.Mesh(merged(plates), MAT.bone);
  carapace.castShadow = true;
  body.add(carapace);

  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), MAT.eye);
    e.position.set(0.42, 0.05, s * 0.045);
    body.add(e);
  }
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.12, 5), MAT.boneLit);
    m.position.set(0.52, 0.0, s * 0.04);
    m.rotation.z = -Math.PI / 2;
    m.rotation.y = -s * 0.4;
    body.add(m);
  }

  const scythe = scytheGeometry();
  const blades = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.16, 0.08, s * 0.1);
    const b = new THREE.Mesh(scythe, MAT.boneLit);
    b.castShadow = true;
    b.rotation.x = s * 0.7;
    pivot.add(b);
    pivot.userData.side = s;
    body.add(pivot);
    blades.push(pivot);
  }

  const legGeo = zergLegGeometry();
  const legs = [];
  const anchors = [[-0.08, -1], [-0.08, 1], [0.12, -1], [0.12, 1]];
  anchors.forEach(([ax, s], i) => {
    const hip = new THREE.Group();
    hip.position.set(ax, 0.0, s * 0.08);
    if (s < 0) hip.scale.z = -1;
    const upper = new THREE.Mesh(legGeo, MAT.fleshDark);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(0, -0.02, 0.15);
    const lower = new THREE.Mesh(legGeo, flesh);
    lower.scale.set(0.75, 0.75, 0.85);
    knee.add(lower);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 5), MAT.bone);
    claw.rotation.x = Math.PI / 2;
    claw.position.set(0, -0.02, 0.12);
    knee.add(claw);
    hip.add(knee);
    hip.userData = { side: s, knee, phase: (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI * 0.55 : 0) };
    body.add(hip);
    legs.push(hip);
  });

  const tail = new THREE.Group();
  tail.position.set(-0.28, 0.02, 0);
  const tailGeo = new THREE.CapsuleGeometry(0.03, 0.16, 3, 6);
  tailGeo.rotateZ(Math.PI / 2);
  tailGeo.translate(-0.08, 0, 0);
  tail.add(new THREE.Mesh(tailGeo, flesh));
  const tail2 = new THREE.Group();
  tail2.position.set(-0.18, 0, 0);
  const t2 = new THREE.Mesh(tailGeo, MAT.fleshDark);
  t2.scale.set(0.85, 0.65, 0.65);
  tail2.add(t2);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.09, 5), MAT.bone);
  barb.rotation.z = Math.PI / 2;
  barb.position.set(-0.18, 0, 0);
  tail2.add(barb);
  tail.add(tail2);
  body.add(tail);

  body.position.y = 0.28;
  root.userData = { body, legs, blades, tail, tail2 };
  return root;
}

export function buildBug(breed) {
  const tint = { warrior: 0x3d2038, hopper: 0x8a5a32, tanker: 0x2c4a28 }[breed] || null;
  const root = buildZergling(tint);
  if (breed === 'tanker') {
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), MAT.acid);
    sac.position.set(-0.05, 0.22, 0);
    sac.scale.set(1.1, 0.8, 0.9);
    root.userData.body.add(sac);
    root.userData.sac = sac;
  }
  return root;
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
  g.add(mesh(box(0.98, 0.42, 0.98, 0.05), paint, 0, 0.21, 0));
  g.add(mesh(box(0.62, 0.2, 0.72, 0.04), MAT.steelDark, -0.04, 0.48, 0));
  g.add(mesh(box(0.06, 0.1, 0.5, 0.015), MAT.gunmetal, 0.48, 0.3, 0));
  g.add(mesh(box(0.22, 0.05, 0.22, 0.015), MAT.wallTrim, 0, 0.6, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.lamp, 0.3, 0.58, 0.22));
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

export function buildCore() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.86, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c333a, metalness: 0.8, roughness: 0.46 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc22830, metalness: 0.5, roughness: 0.4 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, metalness: 0.7, roughness: 0.5 });

  // segmented foundation skirt
  g.add(mesh(new THREE.CylinderGeometry(0.98, 1.05, 0.22, 10), dark, 0, 0.11, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const block = mesh(box(0.34, 0.34, 0.22, 0.04), hull, Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86);
    block.rotation.y = -a;
    g.add(block);
  }

  // main drum and the red armour band
  g.add(mesh(new THREE.CylinderGeometry(0.74, 0.8, 0.46, 12), hull, 0, 0.52, 0));
  const band = mesh(new THREE.TorusGeometry(0.76, 0.05, 8, 24), red, 0, 0.66, 0);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.16, 12), dark, 0, 0.82, 0));

  // dome
  const dome = mesh(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, 0.88, 0);
  dome.scale.y = 0.58;
  g.add(dome);

  // bridge tower, offset so the dome still reads
  const tower = new THREE.Group();
  tower.position.set(0.18, 1.02, 0.12);
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
  dish.position.set(0.18, 1.5, 0.12);
  dish.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), dark, 0, 0.08, 0));
  const plate = mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), hull, 0.08, 0.16, 0);
  plate.rotation.z = -0.9;
  dish.add(plate);
  g.add(dish);

  // landing pad with a lit grid
  g.add(mesh(box(0.72, 0.08, 0.58, 0.02), padMat, 1.02, 0.28, -0.05));
  const reactorMat = new THREE.MeshStandardMaterial({
    color: 0xffe7a2, emissive: 0xffb020, emissiveIntensity: 1.3, metalness: 0.25, roughness: 0.45
  });
  const reactor = mesh(new THREE.PlaneGeometry(0.5, 0.38), reactorMat, 1.02, 0.325, -0.05);
  reactor.rotation.x = -Math.PI / 2;
  g.add(reactor);
  const gridLine = new THREE.MeshStandardMaterial({ color: 0x1c1408, metalness: 0.4, roughness: 0.6 });
  for (let i = -2; i <= 2; i++) {
    g.add(mesh(box(0.5, 0.012, 0.012, 0.002), gridLine, 1.02, 0.33, -0.05 + i * 0.08));
    g.add(mesh(box(0.012, 0.012, 0.36, 0.002), gridLine, 1.02 + i * 0.1, 0.33, -0.05));
  }

  // status pips on the hull
  [0xd23a3a, 0xe6c24a, 0x3aa6ee].forEach((color, i) => {
    const pip = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
    g.add(mesh(box(0.05, 0.07, 0.04, 0.01), pip, 0.62, 0.58, -0.22 + i * 0.1));
  });

  g.userData = { reactor, dish };
  return g;
}

export function buildHatchery() {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), MAT.creep);
  mound.scale.set(1, 0.42, 1);
  mound.receiveShadow = true;
  g.add(mound);

  const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 20),
    new THREE.MeshStandardMaterial({ color: 0x0a0110, roughness: 1 }));
  pit.position.y = 0.26;
  g.add(pit);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xc06bff, emissive: 0x9a3ddb, emissiveIntensity: 2.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 6), MAT.fleshDark);
    tendril.position.set(Math.cos(a) * 0.62, 0.2, Math.sin(a) * 0.62);
    tendril.rotation.z = Math.cos(a) * 0.7;
    tendril.rotation.x = -Math.sin(a) * 0.7;
    g.add(tendril);
  }
  g.userData = { ring };
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
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i === piles - 1 ? ROCK_MATS[(seed + 1) % ROCK_MATS.length] : mat);
    rock.position.set((rnd() - 0.5) * 0.38, 0.12 + i * 0.16 + rnd() * 0.08, (rnd() - 0.5) * 0.38);
    rock.rotation.set(rnd() * 2, rnd() * 6, rnd() * 2);
    rock.scale.set(1.1 + rnd() * 0.35, 1.3 + rnd() * 0.8, 1.05 + rnd() * 0.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }
  const h = 0.85 + rnd() * 0.55;
  const summit = new THREE.Mesh(new THREE.ConeGeometry(0.14 + rnd() * 0.08, h, 5), mat);
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

export function buildRock(seed) {
  const list = mountainProtos();
  return list[Math.abs(seed) % list.length].clone(true);
}
