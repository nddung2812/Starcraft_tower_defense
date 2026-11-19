import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKYMOTHER, BREEDS } from './config.js';
import { Zergling, Acid } from './entities.js';
import { registerModel } from './assets.js';

/*
 * Optional layer. The Skymother: the swarm's answer to the Titan. A slow armoured flyer with a
 * bile cannon in her throat that bursts over a small area. She carries a brood of Talons, launches
 * them at whatever comes into reach (a Titan first), calls them home when nothing does and grows
 * back the ones you shoot down, one at a time.
 *
 * `game.skyfleet` is null until this file installs it, and the core then leaves her out of the wave.
 * Talons are in `game.zerglings` so every weapon can hit them, but they score nothing and pay
 * nothing: she can always grow more, so a kill would be free score. They die with her.
 */

const TAU = Math.PI * 2;
const angleLerp = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
const isBuilding = (t) => t.kind === 'wall' || t.kind === 'bunker' || t.kind === 'core';

/* ------------------------------ models ------------------------------ */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
  V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

/** A faceted piece painted from `low` at its underside to `high` on top. */
function piece(geo, matrix, high, low = high) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  g.computeBoundingBox();
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(low), b = new THREE.Color(high), c = new THREE.Color();
  const { min, max } = g.boundingBox, span = (max.y - min.y) || 1;
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, (pos.getY(i) - min.y) / span);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
const orb = (w = 12, h = 8) => new THREE.SphereGeometry(1, w, h);
const dome = (w = 12, h = 4) => new THREE.SphereGeometry(1, w, h, 0, TAU, 0, Math.PI / 2);
const spike = (sides = 5) => new THREE.ConeGeometry(1, 1, sides);

/** A cone reaching from `from` to `to`, `r` wide at its root. */
function horn(from, to, r, high, low = high) {
  const dir = to.clone().sub(from), length = dir.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const mid = from.clone().add(to).multiplyScalar(0.5);
  return piece(spike(), new THREE.Matrix4().compose(mid, turn, V(r, length, r)), high, low);
}

const CHITIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.42, side: THREE.DoubleSide });
const WEB = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide, flatShading: true });
const GLOW = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xff8a1e, emissiveIntensity: 2.3, roughness: 0.4 });
const POD = new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xff5a0a, emissiveIntensity: 1.05, roughness: 0.3 });

const INK = { void: 0x08060a, shell: 0x15111a, plate: 0x2a2230, edge: 0x7a5a48, belly: 0x331c1e, bone: 0xd6c39c, ember: 0xffa53a };
const paint = (hex) => new THREE.Color(hex);

/** Skin over rings of `{ p, c }` points, smooth inside the piece and hard-edged against its neighbours. */
function loft(rings) {
  const n = rings[0].length, position = [], color = [], index = [];
  for (const ring of rings) for (const { p, c } of ring) { position.push(p.x, p.y, p.z); color.push(c.r, c.g, c.b); }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = r * n + i, b = r * n + j, c = (r + 1) * n + i, d = (r + 1) * n + j;
    index.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** A tapering tube through `points`, for scythes, veins and tendrils. */
function tube(points, r0, r1, from, to = from) {
  const a = paint(from), b = paint(to), sides = 6;
  return loft(points.map((at, i) => {
    const t = i / (points.length - 1), r = r0 + (r1 - r0) * t, c = a.clone().lerp(b, t);
    const along = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
    const u = V(0, 1, 0).cross(along).normalize(), v = along.clone().cross(u).normalize();
    return Array.from({ length: sides }, (_, s) => {
      const w = (s / sides) * TAU;
      return { p: at.clone().addScaledVector(u, Math.cos(w) * r).addScaledVector(v, Math.sin(w) * r), c };
    });
  }));
}

/** Points along a gentle curve from `a` through `b` to `c`. */
const curve = (a, b, c, steps = 8) => new THREE.QuadraticBezierCurve3(a, b, c).getPoints(steps);

/* Half width, back height and belly depth of her hull along its length. */
const HULL = [[1.3, 0.3, 0.15, 0.12], [0.9, 0.58, 0.3, 0.22], [0.3, 0.82, 0.4, 0.3], [-0.3, 0.86, 0.4, 0.3], [-0.9, 0.66, 0.32, 0.24], [-1.4, 0.4, 0.22, 0.16], [-1.95, 0.15, 0.1, 0.08]];
function hullAt(x) {
  const i = Math.max(0, HULL.findIndex((row) => row[0] <= x) - 1), a = HULL[i], b = HULL[Math.min(i + 1, HULL.length - 1)];
  const k = a === b ? 0 : Math.max(0, Math.min(1, (a[0] - x) / (a[0] - b[0]))), s = k * k * (3 - 2 * k);
  return [1, 2, 3].map((n) => a[n] + (b[n] - a[n]) * s);
}
/** A point on her skin: `angle` runs from her right flank (0) over the spine (π/2). */
function skin(x, angle, grow = 1) {
  const [w, top, low] = hullAt(x), c = Math.cos(angle), s = Math.sin(angle);
  const y = s >= 0 ? top * s ** 0.85 + top * 0.16 * s ** 8 : -low * (-s) ** 1.1;
  return V(x, y * grow, Math.sign(c) * Math.abs(c) ** 0.75 * w * grow);
}

/** One overlapping armour band: tucked under the band ahead, flaring to a pale lip at the rear. */
function band(front, rear) {
  const stops = [[front + 0.12, 0.84, INK.void], [front, 0.95, INK.shell], [(front + rear) / 2, 1, INK.plate], [rear + 0.05, 1.07, INK.plate], [rear, 1.09, INK.edge], [rear + 0.04, 0.82, INK.void]];
  const belly = paint(INK.belly), sides = 24;
  return loft(stops.map(([x, grow, hex]) => Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * TAU, under = Math.max(0, -Math.sin(angle));
    return { p: skin(x, angle, grow), c: paint(hex).lerp(belly, under * 0.7) };
  })));
}

/** A long swept blade: pale along its leading edge, dark and serrated along the trailing one. */
function vane(root, bend, tip, chord, teeth) {
  const path = new THREE.QuadraticBezierCurve3(root, bend, tip), stations = 22;
  const rings = Array.from({ length: stations + 1 }, (_, i) => {
    const t = i / stations, at = path.getPoint(t);
    const h = chord * (1 - t) ** 0.62 * (0.6 + 0.4 * Math.sin(Math.min(1, t * 3) * Math.PI / 2)) + 0.006;
    const saw = 1 + 0.3 * Math.abs(Math.sin(t * Math.PI * teeth));
    return [
      { p: at.clone().add(V(h, 0, 0)), c: paint(INK.bone).lerp(paint(INK.edge), 0.35 + (1 - t) * 0.4) },
      { p: at.clone().add(V(0, h * 0.2 + 0.012, 0)), c: paint(INK.plate) },
      { p: at.clone().add(V(-h * saw, 0, 0)), c: paint(INK.shell) },
      { p: at.clone().add(V(0, -h * 0.14 - 0.008, 0)), c: paint(INK.void) }
    ];
  });
  const vein = path.getPoints(14).slice(1, 12).map((p, i) => p.clone().add(V(0, chord * (1 - i / 14) * 0.2 + 0.016, 0)));
  return { blade: loft(rings), vein: tube(vein, 0.018, 0.005, INK.ember) };
}

/* Two rows along her back, one lit brood sac for every Talon still aboard. */
const POD_ROWS = Math.ceil(SKYMOTHER.brood / 2);
const PODS = Array.from({ length: SKYMOTHER.brood }, (_, i) => {
  const row = Math.floor(i / 2), side = i % 2 ? 1 : -1, x = 0.72 - row * (1.72 / Math.max(1, POD_ROWS - 1));
  const at = skin(x, side > 0 ? 1.02 : Math.PI - 1.02, 1.05), size = 0.15 - row * 0.012;
  return { at, size, side };
});
const podMatrix = ({ at, size, side }, grow = 1) => M(at.x, at.y + 0.03, at.z, side * 0.5, 0, 0, size * 1.3 * grow, size * 0.82 * grow, size * grow);

function motherKit() {
  const seams = [1.28, 0.92, 0.56, 0.2, -0.16, -0.52, -0.88, -1.24, -1.6, -1.92];
  const crest = seams.slice(1, -1);
  const hull = mergeGeometries([
    ...seams.slice(0, -1).map((x, i) => band(x, seams[i + 1])),
    loft([[1.2, 0.3, 0.16, 0.13], [1.42, 0.5, 0.2, 0.15], [1.66, 0.46, 0.16, 0.12], [1.9, 0.24, 0.08, 0.08], [2.06, 0.05, 0.02, 0.02]].map(([x, w, top, low], r) =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * TAU, s = Math.sin(a);
        return { p: V(x, s >= 0 ? top * s ** 0.7 : low * s, Math.cos(a) * w), c: paint(r === 1 ? INK.plate : INK.shell).lerp(paint(INK.belly), Math.max(0, -s) * 0.7) };
      }))),
    tube(curve(V(-1.8, 0, 0), V(-2.35, 0.1, 0), V(-2.95, 0.34, 0)), 0.13, 0.012, INK.plate, INK.bone),
    ...crest.map((x, i) => {
      const y = skin(x, Math.PI / 2).y, tall = 0.34 - Math.abs(i - 2.5) * 0.045;
      return tube(curve(V(x + 0.1, y - 0.03, 0), V(x - 0.06, y + tall * 0.5, 0), V(x - 0.36, y + tall, 0), 5), 0.07, 0.006, INK.shell, INK.bone);
    }),
    ...[-1, 1].flatMap((s) => [
      tube(curve(V(1.56, -0.04, s * 0.3), V(2.3, -0.06, s * 0.62), V(2.72, -0.16, s * 0.12)), 0.075, 0.006, INK.edge, INK.bone),   // scythe jaws
      tube(curve(V(1.46, -0.08, s * 0.4), V(1.9, -0.14, s * 0.72), V(2.2, -0.22, s * 0.46), 6), 0.04, 0.005, INK.edge, INK.bone),
      tube(curve(V(1.46, 0.14, s * 0.32), V(1.05, 0.46, s * 0.62), V(0.5, 0.56, s * 0.72)), 0.08, 0.006, INK.shell, INK.bone),       // crown
      tube(curve(V(1.62, 0.1, s * 0.22), V(1.32, 0.34, s * 0.3), V(0.98, 0.5, s * 0.34), 6), 0.05, 0.005, INK.shell, INK.bone)
    ]),
    ...PODS.flatMap((pod) => {
      const { at, size, side } = pod;
      return [
        piece(orb(10, 6), M(at.x, at.y - 0.01, at.z, side * 0.5, 0, 0, size * 1.45, size * 0.55, size * 1.15), INK.void),
        piece(new THREE.TorusGeometry(1, 0.13, 6, 14).rotateX(Math.PI / 2), M(at.x, at.y + 0.015, at.z, side * 0.5, 0, 0, size * 1.5, size * 1.2, size * 1.2), INK.edge, INK.shell)
      ];
    })
  ]);
  const glow = mergeGeometries([
    piece(orb(10, 8), M(1.98, -0.07, 0, 0, 0, 0, 0.13, 0.07, 0.11), INK.ember),                                                     // the gun in her throat
    ...[-1, 1].flatMap((s) => [
      ...[0, 1, 2].map((i) => piece(orb(6, 4), M(1.74 - i * 0.14, 0.085 + i * 0.022, s * (0.27 + i * 0.075), 0, s * 0.5, 0, 0.055, 0.014, 0.02), INK.ember)),
      piece(orb(8, 5), M(-1.7, 0.03, s * 0.12, 0, 0, 0, 0.09, 0.035, 0.05), INK.ember)                                               // vents
    ]),
    ...seams.slice(1, -2).flatMap((x) => [-1, 1].map((s) => {
      const p = skin(x + 0.05, s > 0 ? 0.42 : Math.PI - 0.42, 1.09);
      return piece(orb(6, 3), M(p.x, p.y, p.z, s * 0.9, 0, 0, 0.13, 0.012, 0.022), INK.ember);
    }))
  ]);
  const tendril = tube(curve(V(0, 0, 0), V(-0.42, -0.42, 0), V(-1.05, -0.72, 0)), 0.05, 0.006, INK.shell, INK.ember);
  const wings = [-1, 1].map((s) => [
    { at: V(0.42, 0.1, s * 0.62), vanes: [vane(V(0.92, 0.1, s * 0.42), V(0.9, 0.2, s * 1.05), V(0.3, 0.24, s * 1.5), 0.2, 3), vane(V(0.5, 0.1, s * 0.62), V(0.32, 0.4, s * 1.75), V(-1.05, 0.2, s * 2.7), 0.52, 6)] },
    { at: V(-0.5, 0.08, s * 0.62), vanes: [vane(V(0.02, 0.1, s * 0.72), V(-0.45, 0.28, s * 1.5), V(-1.75, 0.12, s * 2.15), 0.38, 5), vane(V(-0.55, 0.08, s * 0.58), V(-1.05, 0.16, s * 1.05), V(-2.15, 0.06, s * 1.42), 0.27, 4)] }
  ].map(({ at, vanes }) => {
    const local = new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z);
    return { at, blade: mergeGeometries(vanes.map((v) => v.blade)).applyMatrix4(local), vein: mergeGeometries(vanes.map((v) => v.vein)).applyMatrix4(local) };
  }));
  return { hull, glow, tendril, wings, pod: new THREE.SphereGeometry(1, 12, 9) };
}
const motherParts = () => (motherParts.kit ||= motherKit());

/** Her body. `userData.setPods(n, grow)` lights a sac per docked Talon and swells the one growing back. */
export function buildSkymother() {
  const kit = motherParts();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== GLOW; parent.add(m); return m; };
  add(body, kit.hull, CHITIN);
  add(body, kit.glow, GLOW);
  const pods = new THREE.InstancedMesh(kit.pod, POD, PODS.length);
  PODS.forEach((pod, i) => pods.setMatrixAt(i, podMatrix(pod)));
  pods.frustumCulled = false;
  body.add(pods);
  const wings = kit.wings.flatMap((pair, s) => pair.map((w, i) => {
    const pivot = new THREE.Group();
    pivot.position.copy(w.at);
    add(pivot, w.blade, CHITIN);
    add(pivot, w.vein, GLOW);
    body.add(pivot);
    return { pivot, side: s ? 1 : -1, lag: i * 0.8 };
  }));
  const tendrils = [[-1.1, 0.3], [-1.2, -0.3], [-1.5, 0.15], [-1.55, -0.15]].map(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.14, z);
    add(pivot, kit.tendril, CHITIN);
    body.add(pivot);
    return { pivot, phase: i * 1.7 };
  });
  const weapon = new THREE.Group();
  weapon.userData.muzzle = V(2.05, -0.07, 0);
  body.add(weapon);
  root.userData.torso = body;
  root.userData.weapon = weapon;
  let swelling = -1;
  root.userData.setPods = (n, grow = 0) => {
    const docked = Math.max(0, Math.min(PODS.length, n)), growing = docked < PODS.length && grow > 0;
    if (swelling >= 0 && swelling !== docked) pods.setMatrixAt(swelling, podMatrix(PODS[swelling]));
    swelling = growing ? docked : -1;
    if (growing) pods.setMatrixAt(docked, podMatrix(PODS[docked], 0.25 + grow * 0.75));
    pods.count = docked + (growing ? 1 : 0);
    pods.instanceMatrix.needsUpdate = true;
  };
  let recoil = 0;
  root.userData.kick = () => { recoil = 1; };
  let time = Math.random() * 6, fallen = 0;
  root.userData.anim = (state, dt) => {
    time += dt;
    recoil = Math.max(0, recoil - dt * 3.5);
    const dying = state === 'death';
    if (dying) fallen += dt;
    for (const w of wings) w.pivot.rotation.x = w.side * (dying ? -Math.min(0.95, fallen * 1.3) : Math.sin(time * 1.05 - w.lag) * 0.09 + 0.03);
    for (const t of tendrils) {
      t.pivot.rotation.z = Math.sin(time * 1.2 + t.phase) * 0.2;
      t.pivot.rotation.y = Math.cos(time * 0.9 + t.phase) * 0.22;
    }
    body.position.x = -recoil * recoil * 0.14;
    body.position.y = dying ? 0 : Math.sin(time * 1.1) * 0.05;
    body.rotation.z = dying ? 0 : recoil * 0.05;
    body.rotation.x = dying ? 0 : Math.sin(time * 0.7) * 0.025;
  };
  return root;
}

function talonKit() {
  const P = { shell: 0x15111a, edge: 0x5a4038, belly: 0x331c1e, bone: 0xd6c39c, web: 0x3a2a30 };
  const blade = (s) => {
    const g = new THREE.BufferGeometry().setFromPoints([V(0.16, 0.02, s * 0.05), V(-0.5, 0.05, s * 0.72), V(-0.1, 0.02, s * 0.1)]);
    return piece(g, new THREE.Matrix4(), P.web);
  };
  const hull = mergeGeometries([
    piece(orb(8, 6), M(0, 0, 0, 0, 0, 0, 0.36, 0.1, 0.11), P.edge, P.belly),
    piece(dome(8, 3), M(0.03, 0.03, 0, 0, 0, 0, 0.3, 0.09, 0.1), P.shell, P.edge),
    horn(V(0.3, 0, 0), V(0.74, -0.03, 0), 0.04, P.bone, P.edge),                  // sting
    horn(V(-0.28, 0.01, 0), V(-0.72, 0.05, 0), 0.05, P.shell, P.edge),            // tail
    ...[-1, 1].flatMap((s) => [blade(s), horn(V(0.14, 0.03, s * 0.06), V(-0.5, 0.06, s * 0.73), 0.018, P.bone)])
  ]);
  const glow = mergeGeometries([-1, 1].map((s) => piece(orb(6, 4), M(0.25, 0.04, s * 0.06, 0, 0, 0, 0.05, 0.03, 0.03), 0xffb347)));
  return { hull, glow };
}
const talonParts = () => (talonParts.kit ||= talonKit());

/** One Talon. Every one shares the same two meshes' geometry, so a full brood stays cheap to draw. */
export function buildTalon() {
  const kit = talonParts();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const hull = new THREE.Mesh(kit.hull, WEB);
  hull.castShadow = true;
  body.add(hull, new THREE.Mesh(kit.glow, GLOW));
  const weapon = new THREE.Group();
  weapon.userData.muzzle = V(0.7, 0, 0);
  body.add(weapon);
  root.userData.torso = body;
  root.userData.weapon = weapon;
  let time = Math.random() * 6;
  root.userData.anim = (state, dt) => {
    time += dt;
    hull.scale.z = 1 + Math.sin(time * 38) * 0.16;   // wings a blur
  };
  return root;
}

/* ------------------------------ her gun ------------------------------ */

const BOLT_GEO = new THREE.SphereGeometry(0.2, 10, 8);
const BOLT_MAT = new THREE.MeshBasicMaterial({ color: 0xffb040 });

/** A heavy glob of bile: full damage to what it was aimed at, a share to everything beside it. */
class BileBolt extends Acid {
  constructor(x, y, z, target, damage, source) {
    super(x, y, z, target, isBuilding(target) ? damage * SKYMOTHER.structureShare : damage, 'acid', source);
    this.full = damage;
    this.speed = SKYMOTHER.boltSpeed;
    this.mesh = new THREE.Mesh(BOLT_GEO, BOLT_MAT);
    this.mesh.position.set(x, y, z);
  }

  update(dt, game) {
    const lost = !this.target || this.target.dead;
    const { x: tx, z: tz, flying } = this.target || {};
    super.update(dt, game);
    if (this.dead && !lost) this.burst(tx, tz, !!flying, game);
  }

  /** Aircraft only splash aircraft and ground only splashes ground. */
  burst(x, z, air, game) {
    const share = this.full * SKYMOTHER.boltSplash, r = SKYMOTHER.boltRadius;
    const near = (t) => t && t !== this.target && !t.dead && !t.downed && !t.bunker && Math.hypot(t.x - x, t.z - z) <= r;
    for (const u of [...game.gunners]) if (near(u) && !!u.flying === air) u.takeDamage(share, game, Math.atan2(u.z - z, u.x - x));
    if (!air) {
      if (near(game.scv)) game.scv.takeDamage(share, game, 0);
      for (const b of [...game.walls, ...game.bunkers, game.core]) if (near(b)) b.takeDamage(share * SKYMOTHER.structureShare, game, 0);
    }
    const at = { x, y: air ? this.y : 0.4, z };
    game.fx.explosion(at, 0.8);
    game.fx.ring(at, r, 0xffa53a);
    if (!air) game.fx.decal(x, z, r * 0.6, 0x3a2410, 0.5);
  }
}

/* ------------------------------ the brood ------------------------------ */

class Talon extends Zergling {
  constructor(mother, slot) {
    super(mother.x, mother.z, 'talon', mother.broodScale, 1);
    this.isTalon = true;
    this.mother = mother;
    this.altitude = mother.altitude - 0.7;
    this.yaw = mother.yaw + (slot / SKYMOTHER.brood) * TAU;
    this.orbit = (slot / SKYMOTHER.brood) * TAU;
    this.turn = slot % 2 ? 1 : -1;
    this.pass = Math.random() * TAU;
    this.attackCd = Math.random() * this.breed.attackSpeed;
    this.bank = 0;
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.dead) { this.tumble(dt); return; }
    this.spawnT = Math.min(1, this.spawnT + dt * 4);
    this.model.scale.setScalar(this.scale * (0.5 + this.spawnT * 0.5));
    this.attackCd -= dt;
    const mother = this.mother, prey = mother.prey;
    if (prey) this.strike(prey, dt, game);
    else {
      this.flyTo(mother.x, mother.z, mother.altitude - 0.7, dt, game);
      if (Math.hypot(mother.x - this.x, mother.z - this.z) < 0.8) { this.dock(game); return; }
    }
    this.moving = 1;
    this.animate(dt, game);
    this.model.rotation.x = this.bank;
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  /** Swoop round the target in loops that dip in and out, firing whenever it is in reach. */
  strike(prey, dt, game) {
    this.orbit += dt * 1.7 * this.turn;
    this.pass += dt * 1.9;
    const r = 1.55 + Math.sin(this.pass) * 0.75;
    const height = prey.flying ? prey.obj.position.y : (game.heightAt?.(prey.x, prey.z) || 0) + 1.25;
    this.flyTo(prey.x + Math.cos(this.orbit) * r, prey.z + Math.sin(this.orbit) * r, height, dt, game);
    if (this.attackCd > 0 || Math.hypot(prey.x - this.x, prey.z - this.z) > this.breed.range) return;
    this.attackCd = this.breed.attackSpeed;
    this.target = prey;
    const damage = prey.kind === 'cruiser' ? this.damage + SKYMOTHER.titanBonus : this.damage * (isBuilding(prey) ? SKYMOTHER.structureShare : 1);
    const shot = new Acid(this.x, this.altitude, this.z, prey, damage, 'spine', this);
    game.acids.push(shot);
    game.scene.add(shot.mesh);
    game.sfx.spine();
  }

  flyTo(px, pz, height, dt, game) {
    const want = Math.atan2(pz - this.z, px - this.x);
    const before = this.yaw;
    this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 6.5));
    this.bank += (Math.max(-0.75, Math.min(0.75, (this.yaw - before) / Math.max(dt, 0.001) * 0.2)) - this.bank) * Math.min(1, dt * 8);
    this.x = Math.max(0, Math.min(game.grid.COLS - 0.01, this.x + Math.cos(this.yaw) * this.speed * dt));
    this.z = Math.max(0, Math.min(game.grid.ROWS - 0.01, this.z + Math.sin(this.yaw) * this.speed * dt));
    this.altitude += (height - this.altitude) * Math.min(1, dt * 4.5);
  }

  /** Back inside her. Not a kill: the wave loop just sweeps the empty shell away. */
  dock(game) {
    this.mother.docked++;
    this.escaped = true;
    this.dead = true;
    this.deathT = 99;
    this.obj.visible = false;
    if (game.focus === this) game.focus = null;
  }

  /** Shot down, or orphaned when she falls. */
  fall() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
  }

  tumble(dt) {
    this.deathT += dt;
    this.altitude -= dt * (2 + this.deathT * 11);
    this.obj.position.y = this.altitude;
    this.model.rotation.z += dt * 11;
    this.model.scale.setScalar(this.scale * Math.max(0.2, 1 - this.deathT));
    this.bar.group.visible = false;
    if (this.deathT > 0.9) this.obj.visible = false;
  }

  /** Scores nothing and pays nothing, whoever shot it. */
  takeDamage(amount, game, fromAngle, quiet = false) {
    if (this.dead) return;
    const dealt = Math.max(1, amount - this.armor);
    this.hp -= dealt;
    this.hurt = 1;
    if (!quiet) game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle, 4, [0.85, 0.6, 1], 3);
    if (this.hp <= 0) {
      this.fall();
      game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle, 10, [1, 0.7, 0.3], 4, 6.28);
    }
  }
}

class Skymother extends Zergling {
  constructor(x, z, hpScale, speedScale) {
    super(x, z, 'skymother', hpScale, speedScale);
    this.isSkymother = true;
    this.broodScale = hpScale;
    this.pickRadius = 46;      // she is far bigger than the usual click target
    this.docked = SKYMOTHER.brood;
    this.brood = [];
    this.launchT = 0;
    this.growT = SKYMOTHER.regrow;
    this.boltT = SKYMOTHER.boltGap * 0.5;
    this.lookT = 0;
    this.prey = null;
  }

  /** A Titan first, whatever else is near; otherwise the closest thing she can reach. */
  pick(game) {
    let titan = null, best = this.breed.range;
    for (const u of game.gunners) {
      if (u.kind !== 'cruiser' || u.dead || u.downed) continue;
      const d = Math.hypot(u.x - this.x, u.z - this.z);
      if (d <= best) { best = d; titan = u; }
    }
    return titan || this.rangedPrey(game);
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.dead) { this.crash(dt, game); return; }
    this.spawnT = Math.min(1, this.spawnT + dt * 1.2);
    this.model.scale.setScalar(this.scale * (0.5 + this.spawnT * 0.5));
    this.altitude = (game.heightAt?.(this.x, this.z) || 0) + SKYMOTHER.altitude;
    this.lookT -= dt;
    if (this.lookT <= 0 || this.prey?.dead) { this.lookT = 0.4; this.prey = this.pick(game); }
    this.brood = this.brood.filter((t) => !t.dead);
    if (this.prey) {
      this.target = this.prey;
      this.moving = 0;
      this.yaw = angleLerp(this.yaw, Math.atan2(this.prey.z - this.z, this.prey.x - this.x), Math.min(1, dt * 1.4));
      this.launch(dt, game);
      this.fire(dt, game);
    } else {
      this.target = null;
      this.steer(game.core.x, game.core.z, dt, game);
    }
    if (this.docked + this.brood.length < SKYMOTHER.brood) {
      this.growT -= dt;
      if (this.growT <= 0) {
        this.growT = SKYMOTHER.regrow;
        this.docked++;
        game.fx.sparks({ x: this.x, y: this.altitude + 0.6, z: this.z }, 0, 8, [1, 0.7, 0.3], 2.5, 6.28);
      }
    } else this.growT = SKYMOTHER.regrow;
    const short = this.docked + this.brood.length < SKYMOTHER.brood;
    this.model.userData.setPods(this.docked, short ? 1 - this.growT / SKYMOTHER.regrow : 0);
    this.animate(dt, game);
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  launch(dt, game) {
    this.launchT -= dt;
    if (this.launchT > 0 || this.docked <= 0) return;
    this.launchT = SKYMOTHER.launchGap;
    this.docked--;
    const talon = new Talon(this, this.brood.length);
    this.brood.push(talon);
    game.zerglings.push(talon);
    game.world.add(talon.obj);
  }

  /** The bile cannon: she has to be roughly facing what she shoots at. */
  fire(dt, game) {
    this.boltT -= dt;
    const prey = this.prey, turn = Math.atan2(prey.z - this.z, prey.x - this.x) - this.yaw;
    if (this.boltT > 0 || Math.cos(turn) < 0.6) return;
    this.boltT = SKYMOTHER.boltGap;
    const reach = 2.05 * this.scale, at = { x: this.x + Math.cos(this.yaw) * reach, y: this.altitude - 0.1, z: this.z + Math.sin(this.yaw) * reach };
    const bolt = new BileBolt(at.x, at.y, at.z, prey, this.damage, this);
    game.acids.push(bolt);
    game.scene.add(bolt.mesh);
    this.model.userData.kick();
    game.fx.sparks(at, this.yaw, 8, [1, 0.7, 0.3], 5);
    game.sfx.spine();
  }

  /** Falling out of the sky, then one last blast where she lands. */
  crash(dt, game) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 1.4);
    this.obj.position.y = this.altitude * (1 - k * k);
    this.model.rotation.z = k * 0.45;
    this.model.rotation.x = k * 0.25;
    this.model.userData.anim('death', dt);
    this.bar.group.visible = false;
    if (k < 1 || this.crashed) return;
    this.crashed = true;
    this.obj.visible = false;
    const at = { x: this.x, y: 0.5, z: this.z };
    game.fx.explosion(at, 2.2);
    game.fx.chunks(at, 16, 0x2a2230);
    game.fx.ring(at, 3.4, 0xffb347);
    game.fx.decal(this.x, this.z, 2.2, 0x24102e, 0.6);
    game.stage.kick(5);
    game.sfx.cannonHit();
  }

  takeDamage(amount, game, fromAngle, quiet = false) {
    if (this.dead) return;
    const before = this.hp;
    super.takeDamage(amount, game, fromAngle, true);
    if (!quiet) {
      game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle + Math.PI, 5, [0.9, 0.75, 1], 3);
      game.fx.label({ x: this.x, y: this.altitude + 1.6, z: this.z }, '-' + Math.round(before - Math.max(0, this.hp)), 'dmg');
      game.sfx.hitFlesh();
    }
    if (this.dead) for (const t of this.brood) t.fall();
  }
}

/** What the core talks to: whether there is room for another Skymother, and hatching her. */
class Skyfleet {
  constructor(game, ui) { this.game = game; this.ui = ui; this.warned = 0; }

  get alive() { return this.game.zerglings.filter((z) => z.isSkymother && !z.dead).length; }

  room() { return this.alive < (this.game.match ? SKYMOTHER.matchAlive : SKYMOTHER.maxAlive); }

  hatch(x, z, spawn) {
    const g = this.game;
    if (this.warned !== g.level) {
      this.warned = g.level;
      this.ui?.callout(`${BREEDS.skymother.name.toUpperCase()} INBOUND`, 'Bile cannon · ten Talons · focus fire on her and the brood falls', 'unit');
      g.sfx.horn(null);
    }
    return new Skymother(x, z, spawn.hpScale, spawn.speedScale);
  }
}

export function installSkymother(game, ui) {
  registerModel('skymother', buildSkymother, [0xff8a3a, 0.2]);
  registerModel('talon', buildTalon, [0xff8a3a, 0.22]);
  game.skyfleet = new Skyfleet(game, ui);
  return game.skyfleet;
}
