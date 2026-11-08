import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/*  Materials — CMC-300 armour, sampled off the painted miniature      */
/* ------------------------------------------------------------------ */

export const MAT = {
  armor: new THREE.MeshStandardMaterial({ color: 0x2f74a8, metalness: 0.35, roughness: 0.42 }),
  armorLit: new THREE.MeshStandardMaterial({ color: 0x4e97cc, metalness: 0.35, roughness: 0.38 }),
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

  wall: new THREE.MeshStandardMaterial({ color: 0x6d777d, metalness: 0.75, roughness: 0.55 }),
  wallTrim: new THREE.MeshStandardMaterial({ color: 0xe8a72c, metalness: 0.5, roughness: 0.5 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x5f574b, metalness: 0.05, roughness: 0.95, flatShading: true }),
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
/*  ZERGLING — faces +X, ~0.8 units long, low to the ground            */
/* ------------------------------------------------------------------ */

function scytheGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.05);
  shape.quadraticCurveTo(0.26, -0.04, 0.46, 0.1);
  shape.quadraticCurveTo(0.3, 0.0, 0.02, 0.06);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8
  });
  geo.translate(0, 0, -0.0175);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function zergLegGeometry() {
  const thigh = new THREE.CapsuleGeometry(0.035, 0.16, 3, 8);
  thigh.rotateZ(Math.PI / 2);
  thigh.translate(0.08, 0, 0);
  return thigh;
}

export function buildZergling() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // thorax + head + tail baked into one mesh
  const thorax = new THREE.SphereGeometry(0.17, 18, 14);
  thorax.scale(1.5, 0.78, 1);
  const neck = new THREE.SphereGeometry(0.12, 14, 12);
  neck.scale(1.1, 0.85, 1);
  const headGeo = new THREE.ConeGeometry(0.1, 0.24, 10);
  headGeo.rotateZ(-Math.PI / 2);
  const hipGeo = new THREE.SphereGeometry(0.11, 14, 12);
  hipGeo.scale(1.1, 0.9, 1);

  const shell = new THREE.Mesh(merged([
    [thorax, T(0, 0, 0)],
    [neck, T(0.2, 0.01, 0)],
    [headGeo, T(0.37, -0.01, 0)],
    [hipGeo, T(-0.22, -0.01, 0)]
  ]), MAT.flesh);
  shell.castShadow = true;
  body.add(shell);

  // bone carapace ridge
  const plates = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.SphereGeometry(0.085 + i * 0.006, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    p.scale(1, 0.62, 1.15);
    plates.push([p, T(-0.17 + i * 0.12, 0.08, 0)]);
  }
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.ConeGeometry(0.022, 0.1, 6);
    plates.push([spike, TR(-0.1 + i * 0.12, 0.15, 0, 0, 0, 0.5)]);
  }
  const crest = new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  crest.scale(1.3, 0.5, 0.95);
  plates.push([crest, T(0.3, 0.04, 0)]);
  const carapace = new THREE.Mesh(merged(plates), MAT.bone);
  carapace.castShadow = true;
  body.add(carapace);

  // eyes
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), MAT.eye);
    e.position.set(0.38, 0.03, s * 0.058);
    body.add(e);
  }
  // mandibles
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.13, 6), MAT.boneLit);
    m.position.set(0.5, -0.02, s * 0.05);
    m.rotation.z = -Math.PI / 2;
    m.rotation.y = -s * 0.35;
    body.add(m);
  }

  // kaiser blades
  const scythe = scytheGeometry();
  const blades = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.14, 0.06, s * 0.14);
    const b = new THREE.Mesh(scythe, MAT.boneLit);
    b.castShadow = true;
    b.rotation.y = s * 0.55;
    pivot.add(b);
    pivot.userData.side = s;
    body.add(pivot);
    blades.push(pivot);
  }

  // four legs, each a hip pivot with a lower segment
  const legGeo = zergLegGeometry();
  const legs = [];
  const anchors = [[-0.16, -1], [-0.16, 1], [0.1, -1], [0.1, 1]];
  anchors.forEach(([ax, s], i) => {
    const hip = new THREE.Group();
    hip.position.set(ax, 0.02, s * 0.12);
    const upper = new THREE.Mesh(legGeo, MAT.fleshDark);
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(0.17, 0, 0);
    const lower = new THREE.Mesh(legGeo, MAT.flesh);
    lower.scale.set(0.9, 0.75, 0.75);
    knee.add(lower);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 5), MAT.bone);
    claw.rotation.z = -Math.PI / 2;
    claw.position.set(0.2, 0, 0);
    knee.add(claw);
    hip.add(knee);
    hip.userData = { side: s, knee, phase: (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI * 0.55 : 0) };
    body.add(hip);
    legs.push(hip);
  });

  // tail
  const tail = new THREE.Group();
  tail.position.set(-0.3, 0.0, 0);
  const tailGeo = new THREE.CapsuleGeometry(0.035, 0.18, 3, 8);
  tailGeo.rotateZ(Math.PI / 2);
  tailGeo.translate(-0.09, 0, 0);
  const t1 = new THREE.Mesh(tailGeo, MAT.flesh);
  tail.add(t1);
  const tail2 = new THREE.Group();
  tail2.position.set(-0.2, 0, 0);
  const t2 = new THREE.Mesh(tailGeo, MAT.fleshDark);
  t2.scale.set(0.9, 0.7, 0.7);
  tail2.add(t2);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 6), MAT.bone);
  barb.rotation.z = Math.PI / 2;
  barb.position.set(-0.21, 0, 0);
  tail2.add(barb);
  tail.add(tail2);
  body.add(tail);

  body.position.y = 0.24;
  root.userData = { body, legs, blades, tail, tail2 };
  return root;
}

/* ------------------------------------------------------------------ */
/*  STRUCTURES                                                         */
/* ------------------------------------------------------------------ */

export function buildWall() {
  const g = new THREE.Group();
  const slab = mesh(box(0.88, 0.62, 0.88, 0.06, 3), MAT.wall, 0, 0.31, 0);
  g.add(slab);
  const stripe = mesh(box(0.9, 0.12, 0.9, 0.02), MAT.wallTrim, 0, 0.44, 0);
  g.add(stripe);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(mesh(box(0.12, 0.66, 0.12, 0.03), MAT.steelDark, x * 0.38, 0.33, z * 0.38));
  }
  g.userData.slab = slab;
  return g;
}

export function buildCore() {
  const g = new THREE.Group();
  g.add(mesh(box(1.85, 0.5, 1.85, 0.1, 3), MAT.steelDark, 0, 0.25, 0));
  g.add(mesh(box(1.5, 0.55, 1.5, 0.12, 3), MAT.wall, 0, 0.72, 0));
  g.add(mesh(box(1.62, 0.1, 1.62, 0.04), MAT.wallTrim, 0, 1.03, 0));

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.steel);
  dome.position.y = 1.05;
  dome.castShadow = true;
  g.add(dome);

  const reactor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), MAT.coreGlow);
  reactor.position.y = 1.3;
  g.add(reactor);

  const dish = new THREE.Group();
  dish.position.set(0, 1.5, 0);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), MAT.steelDark);
  arm.position.y = 0.15;
  dish.add(arm);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), MAT.steel);
  plate.position.set(0.14, 0.3, 0);
  plate.rotation.z = -0.8;
  dish.add(plate);
  g.add(dish);

  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.lampGreen, x * 0.78, 1.06, z * 0.78));
  }

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

export function buildRock(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.Group();
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const r = 0.18 + rnd() * 0.22;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const m = new THREE.Mesh(geo, MAT.rock);
    m.position.set((rnd() - 0.5) * 0.4, r * 0.55, (rnd() - 0.5) * 0.4);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.scale.set(1, 0.75 + rnd() * 0.4, 1);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
