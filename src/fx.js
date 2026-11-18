import * as THREE from 'three';

const MAX = 3000;

const VERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 tint;
attribute float fire;
uniform float px;
varying float vAlpha;
varying vec3 vTint;
varying float vFire;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vFire = fire;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Sparks keep their screen-tuned size. Fire and smoke are sized in tiles (px is half the
  // drawing-buffer height), so a billow covers the same ground on every screen and zoom.
  gl_PointSize = fire > 0.0 ? size * px * projectionMatrix[1][1] / -mv.z : size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying float vAlpha;
varying vec3 vTint;
varying float vFire;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (vFire > 0.0) {
    // A lick of flame or a roll of smoke: a ragged, lobed puff whose outline turns as it ages
    // (vFire carries its seed plus the turn), so a crowd of them never reads as round dots.
    float ang = atan(d.y, d.x);
    float edge = 0.25 * (0.66 + 0.2 * sin(ang * 3.0 + vFire * 6.0) + 0.14 * sin(ang * 5.0 - vFire * 9.0));
    if (r > edge) discard;
    float f = 1.0 - smoothstep(0.0, edge, r);
#ifdef SMOKE
    gl_FragColor = vec4(vTint, vAlpha * f);
#else
    f *= f;
    // the hotter the flame (more green in its colour), the whiter its heart
    gl_FragColor = vec4(vTint * f + vec3(1.0, 0.9, 0.62) * (f * f * f) * vTint.g, vAlpha);
#endif
    return;
  }
  if (r > 0.25) discard;
  float f = 1.0 - smoothstep(0.0, 0.25, r);
  gl_FragColor = vec4(vTint * f, vAlpha * f);
}`;

// A flame's colour through its life: white-hot at the nozzle, yellow, orange, then a dull red tail.
const FIRE_RAMP = [[0, 1, 0.95, 0.75], [0.18, 1, 0.78, 0.3], [0.45, 1, 0.46, 0.1], [0.75, 0.85, 0.2, 0.04], [1, 0.35, 0.06, 0.02]];
const FLAME = {
  hold: 0.42,        // a jet keeps pouring this long after the last shot, so shots join into one stream
  rate: 85,          // licks of flame a second for one jet
  shared: 8,         // beyond this many jets they share the same total, to keep the fill rate bounded
  pilot: 26,         // small hot licks at the nozzle itself, so the stream starts at the gun
  smoke: 13, embers: 11, patch: 9
};
const BUFFER = new THREE.Vector2();

/** One draw call of point sprites: the additive glow (sparks, fire) or the dark smoke over it. */
function cloud(scene, smoke) {
  const geo = new THREE.BufferGeometry();
  const c = { geo, n: 0, last: 0, pos: new Float32Array(MAX * 3), tint: new Float32Array(MAX * 3),
    size: new Float32Array(MAX), alpha: new Float32Array(MAX), fire: new Float32Array(MAX) };
  geo.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(c.tint, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(c.size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(c.alpha, 1));
  geo.setAttribute('fire', new THREE.BufferAttribute(c.fire, 1));
  geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { px: { value: 400 } }, defines: smoke ? { SMOKE: 1 } : {},
    transparent: true, depthWrite: false, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending
  });
  c.points = new THREE.Points(geo, material);
  c.points.frustumCulled = false;
  c.points.renderOrder = smoke ? 1 : 2;   // smoke first, so the fire glows through it
  c.points.onBeforeRender = (renderer) => { material.uniforms.px.value = renderer.getDrawingBufferSize(BUFFER).y / 2; };
  scene.add(c.points);
  return c;
}

export class Fx {
  constructor(scene) {
    this.scene = scene;

    this.glow = cloud(scene, false);
    this.dark = cloud(scene, true);
    this.points = this.glow.points;

    this.p = [];           // live particle records
    this.jets = [];        // flamethrowers that are pouring right now
    this.fires = [];       // fuel left burning on the ground
    this.decals = [];
    this.debris = [];
    this.rings = [];
    this.beams = [];
    this.flashes = [];
    this.labels = [];

    this.decalGeo = new THREE.CircleGeometry(0.5, 14);
    this.decalGeo.rotateX(-Math.PI / 2);
    this.debrisGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32);
    this.ringGeo.rotateX(-Math.PI / 2);

    // Lamps stay visible at intensity 0 when idle: changing the scene's light count recompiles every shader.
    this.flashPool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 5, 2);
      l.userData.busy = false;
      scene.add(l);
      this.flashPool.push(l);
    }
  }

  laser(from, to, duration) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const group = new THREE.Group();
    // A bright red core and a wider translucent glow remain visible in Eco mode.
    for (const [width, color, opacity] of [[0.22, 0xff3020, 1], [0.8, 0xff0015, 0.3], [0.09, 0xffe6d0, 1]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, width, width),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      mesh.userData.opacity = opacity;
      group.add(mesh);
    }
    group.position.set((from.x + to.x) / 2, from.y ?? 1.2, (from.z + to.z) / 2);
    group.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
    this.scene.add(group);
    this.beams.push({ group, life: duration, max: duration, hold: 0.7 });
  }

  lightning(from, to) {
    const start = new THREE.Vector3(from.x, (from.flying ? from.obj.position.y : 0) + 0.6, from.z);
    const end = new THREE.Vector3(to.x, (to.flying ? to.obj.position.y : 0) + 0.6, to.z);
    const group = new THREE.Group();
    let previous = start;
    for (let i = 1; i <= 5; i++) {
      const next = start.clone().lerp(end, i / 5);
      if (i < 5) { next.y += (i % 2 ? 0.22 : -0.22); next.z += (Math.random() - 0.5) * 0.25; }
      const direction = next.clone().sub(previous);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, direction.length(), 4),
        new THREE.MeshBasicMaterial({ color: 0x8ffff0, transparent: true, opacity: 1, depthWrite: false }));
      bolt.userData.opacity = 1;
      bolt.position.copy(previous).add(next).multiplyScalar(0.5);
      bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      group.add(bolt); previous = next;
    }
    this.scene.add(group);
    this.beams.push({ group, life: 0.18, max: 0.18 });
  }

  /** A thin straight line between two points: Spectre shots and Medic foam. */
  link(from, to, color, life = 0.16, width = 0.03, additive = true) {
    const start = new THREE.Vector3(from.x, from.y, from.z), end = new THREE.Vector3(to.x, to.y, to.z);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.01) return;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(width, width, length, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    bolt.userData.opacity = 0.9;
    bolt.position.copy(start).add(end).multiplyScalar(0.5);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    const group = new THREE.Group();
    group.add(bolt);
    this.scene.add(group);
    this.beams.push({ group, life, max: life });
  }

  /**
   * A flamethrower's jet: burning fuel pouring from `p` along `dir`, fanning out to `arc` and
   * reaching `reach` tiles. Call it on every shot; the jet keeps pouring between shots and follows
   * `source` (the unit) as it turns, so sustained fire is one unbroken stream, not a string of puffs.
   */
  flame(p, dir, reach, arc, source = null) {
    let jet = source ? this.jets.find(j => j.source === source) : null;
    if (!jet) { jet = { source, carry: 0, pilot: 0, smoke: 0, embers: 0 }; this.jets.push(jet); }
    Object.assign(jet, { x: p.x, y: p.y, z: p.z, dir, reach, arc, life: FLAME.hold });
    if (source) {
      // where the nozzle sits on the unit, so the jet can swing with it between shots
      // (a touch behind the muzzle point, which sits just clear of the barrel: fire starts at the gun)
      jet.out = Math.max(0, Math.hypot(p.x - source.x, p.z - source.z) - 0.15);
      jet.side = Math.atan2(p.z - source.z, p.x - source.x) - dir;
      jet.x = source.x + Math.cos(dir + jet.side) * jet.out;
      jet.z = source.z + Math.sin(dir + jet.side) * jet.out;
    }
    // firelight on the ground, when the muzzle flashes are not using every lamp
    if (this.flashPool.filter(f => !f.userData.busy).length > 3) {
      const l = this.flashPool.find(f => !f.userData.busy);
      l.position.set(p.x + Math.cos(dir) * reach * 0.45, 0.7, p.z + Math.sin(dir) * reach * 0.45);
      l.intensity = 9;
      l.userData.busy = true;
      this.flashes.push({ light: l, life: 0.3 });
    }
    // some of the fuel lands and burns on for a moment
    if (Math.random() < 0.4 && this.fires.length < 24) {
      const a = dir + (Math.random() - 0.5) * arc * 1.3, d = reach * (0.45 + Math.random() * 0.5);
      this.fires.push({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, life: 0.9 + Math.random() * 0.7, carry: 0 });
    }
  }

  /** Flames licking up from something that is on fire: a burning bug, a patch of fuel. */
  burning(x, y, z, scale = 1, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * 0.22 * scale;
      this.spawn(x + Math.cos(a) * r, y + Math.random() * 0.15, z + Math.sin(a) * r,
        (Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 1.3, (Math.random() - 0.5) * 0.5,
        0.3 + Math.random() * 0.25, (0.2 + Math.random() * 0.14) * scale, [1, 1, 1],
        { ramp: true, drag: 1.2, gravity: 2.2, grow: 0.5 * scale, peak: 0.5, turb: 4 });
    }
  }

  /** Pour one frame of every live jet and ground fire. */
  pour(dt) {
    const share = Math.min(1, FLAME.shared / Math.max(1, this.jets.length));
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const jet = this.jets[i], unit = jet.source;
      jet.life -= dt;
      if (jet.life <= 0 || (unit && (unit.dead || unit.downed || unit.bunker))) { this.jets.splice(i, 1); continue; }
      if (unit && typeof unit.yaw === 'number') {
        jet.dir = unit.yaw;
        jet.x = unit.x + Math.cos(jet.dir + jet.side) * jet.out;
        jet.z = unit.z + Math.sin(jet.dir + jet.side) * jet.out;
      }
      const { x, y, z, dir, reach, arc } = jet;
      // The stream: fast and tight at the nozzle, slowing and billowing out to the cone's width,
      // then lifting as the heat carries it up. Colour and size follow each lick's age.
      jet.carry += FLAME.rate * share * dt;
      for (; jet.carry >= 1; jet.carry--) {
        // Most of the fuel leaves as a tight, bright core; the rest peels off into the wide billows.
        const core = Math.random() < 0.55;
        const a = dir + (core ? (Math.random() + Math.random() - 1) * arc * 0.3 : (Math.random() - 0.5) * arc * 1.7);
        const life = (core ? 0.36 : 0.44) + Math.random() * 0.2, drag = 2;
        // reach is measured from the unit, so the fire has that much less to travel from the nozzle
        const run = Math.max(0.6, reach - (jet.out || 0));
        const speed = run * drag / (1 - Math.exp(-drag * life)) * (core ? 0.8 + Math.random() * 0.3 : 0.5 + Math.random() * 0.5);
        const head = Math.random() * dt;   // spread this frame's licks along the stream
        const vx = Math.cos(a) * speed, vz = Math.sin(a) * speed, vy = -0.5 + Math.random() * 0.7;
        this.spawn(x + vx * head, y + vy * head, z + vz * head, vx, vy, vz, life, 0.24 + Math.random() * 0.08, [1, 1, 1],
          { ramp: true, drag, gravity: core ? 1.2 : 2.2, grow: core ? 0.8 + Math.random() * 0.4 : 1.5 + Math.random() * 0.7,
            peak: core ? 0.6 : 0.46, turb: core ? 3 : 8 });
      }
      jet.pilot += FLAME.pilot * share * dt;
      for (; jet.pilot >= 1; jet.pilot--) {
        const a = dir + (Math.random() - 0.5) * 0.3, speed = 2.5 + Math.random() * 3;
        this.spawn(x, y, z, Math.cos(a) * speed, (Math.random() - 0.5) * 0.4, Math.sin(a) * speed,
          0.1 + Math.random() * 0.08, 0.15 + Math.random() * 0.06, [1, 1, 1],
          { ramp: true, drag: 1, grow: 0.6, peak: 0.7, turb: 2, cool: 0.35 });
      }
      // Black smoke rolls off the far end of the fire.
      jet.smoke += FLAME.smoke * share * dt;
      for (; jet.smoke >= 1; jet.smoke--) {
        const a = dir + (Math.random() - 0.5) * arc * 1.4, d = reach * (0.5 + Math.random() * 0.5);
        const shade = 0.05 + Math.random() * 0.05;
        this.spawn(x + Math.cos(a) * d, 0.5 + Math.random() * 0.5, z + Math.sin(a) * d,
          Math.cos(a) * 1.1, 1.3 + Math.random() * 1.1, Math.sin(a) * 1.1,
          1 + Math.random() * 0.7, 0.4 + Math.random() * 0.25, [shade * 1.15, shade, shade * 0.95],
          { dark: true, drag: 0.9, gravity: 0.5, grow: 0.7, peak: 0.34, turb: 2.5 });
      }
      // Embers: bright specks thrown clear of the fire, drifting up as they die.
      jet.embers += FLAME.embers * share * dt;
      for (; jet.embers >= 1; jet.embers--) {
        const a = dir + (Math.random() - 0.5) * arc * 1.8, speed = reach * (1.4 + Math.random() * 2.4);
        this.spawn(x, y, z, Math.cos(a) * speed, 0.4 + Math.random() * 2.2, Math.sin(a) * speed,
          0.5 + Math.random() * 0.6, 0.04 + Math.random() * 0.05, [1, 0.62 + Math.random() * 0.25, 0.2],
          { drag: 2.3, gravity: 1.6, turb: 9 });
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.life -= dt;
      if (fire.life <= 0) { this.fires.splice(i, 1); continue; }
      fire.carry += FLAME.patch * Math.min(1, fire.life * 2) * dt;
      for (; fire.carry >= 1; fire.carry--) this.burning(fire.x, 0.06, fire.z, 0.8, 1);
    }
  }

  clearBeam(beam) {
    this.scene.remove(beam.group);
    for (const mesh of beam.group.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }

  /* ---------------- particles ---------------- */

  spawn(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({
      x, y, z, vx, vy, vz, life, max: life, size,
      r: color[0], g: color[1], b: color[2],
      drag: opts.drag ?? 2.2,
      gravity: opts.gravity ?? 0,
      grow: opts.grow ?? 0,
      bounce: opts.bounce ?? false,
      // Fire and smoke only. ramp: colour follows FIRE_RAMP; dark: drawn as smoke; both are
      // ragged puffs sized in tiles (seed > 0), fading in fast and out slowly to `peak` opacity.
      ramp: !!opts.ramp,
      dark: !!opts.dark,
      seed: opts.ramp || opts.dark ? 2 + Math.random() : 0,   // stays above zero through the spin: zero means a plain spark
      spin: opts.ramp || opts.dark ? (Math.random() - 0.5) * 3 : 0,
      peak: opts.peak ?? 1,
      cool: opts.cool ?? 1,     // how far down the colour ramp it gets before it dies
      turb: opts.turb ?? 0
    });
  }

  sparks(p, dir, n, color = [1, 0.85, 0.55], speed = 6, spread = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const el = (Math.random() - 0.3) * 0.9;
      const s = speed * (0.3 + Math.random());
      this.spawn(p.x, p.y, p.z,
        Math.cos(a) * s * Math.cos(el), Math.sin(el) * s * 0.7, Math.sin(a) * s * Math.cos(el),
        0.16 + Math.random() * 0.3, 0.05 + Math.random() * 0.07, color,
        { drag: 3.4, gravity: -7 });
    }
  }

  blood(p, dir, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * 2.6;
      const s = 1.5 + Math.random() * 5;
      const warm = Math.random() < 0.45;
      this.spawn(p.x, p.y, p.z,
        Math.cos(a) * s, 1.5 + Math.random() * 4, Math.sin(a) * s,
        0.3 + Math.random() * 0.5, 0.06 + Math.random() * 0.09,
        warm ? [0.62, 0.95, 0.37] : [0.75, 0.42, 1],
        { drag: 1.6, gravity: -10 });
    }
    this.decal(p.x, p.z, 0.3 + Math.random() * 0.35, 0x6f2a8f, 0.55);
  }

  smoke(p, n = 8, color = [0.45, 0.45, 0.5]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.4;
      this.spawn(p.x, p.y, p.z,
        Math.cos(a) * s, 0.8 + Math.random() * 1.6, Math.sin(a) * s,
        0.7 + Math.random() * 0.8, 0.18 + Math.random() * 0.2, color,
        { drag: 1.1, gravity: 0.6, grow: 0.5 });
    }
  }

  /* ---------------- one-shot set pieces ---------------- */

  muzzleFlash(p, dir) {
    const l = this.flashPool.find((f) => !f.userData.busy);
    if (l) {
      l.position.set(p.x, p.y, p.z);
      l.intensity = 14;
      l.userData.busy = true;
      this.flashes.push({ light: l, life: 0.07 });
    }
    this.sparks(p, dir, 5, [1, 0.92, 0.7], 7, 0.5);
  }

  impact(p, dir, color = [0.8, 0.92, 1]) {
    this.sparks(p, dir + Math.PI, 7, color, 5, 1.6);
  }

  explosion(p, scale = 1) {
    this.sparks(p, Math.random() * 6.28, 34 * scale, [1, 0.76, 0.35], 9 * scale, 6.28);
    this.smoke(p, 16 * scale, [0.32, 0.3, 0.3]);
    this.ring(p, 2.6 * scale, 0xff9a40);
    const l = this.flashPool.find((f) => !f.userData.busy);
    if (l) {
      l.position.set(p.x, p.y + 0.3, p.z);
      l.intensity = 40 * scale;
      l.userData.busy = true;
      this.flashes.push({ light: l, life: 0.3 });
    }
  }

  ring(p, radius, color) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    }));
    m.position.set(p.x, 0.07, p.z);
    m.scale.setScalar(0.3);
    this.scene.add(m);
    this.rings.push({ mesh: m, life: 0.5, max: 0.5, radius });
  }

  decal(x, z, r, color, opacity = 0.6) {
    const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false
    }));
    m.position.set(x, 0.016 + Math.random() * 0.004, z);
    m.scale.setScalar(r * 2);
    m.rotation.y = Math.random() * 6.28;
    this.scene.add(m);
    this.decals.push({ mesh: m, life: 26, max: 26, opacity });
    if (this.decals.length > 90) {
      const d = this.decals.shift();
      this.scene.remove(d.mesh);
      d.mesh.material.dispose();
    }
  }

  chunks(p, n, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.3 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.debrisGeo, mat);
      m.position.set(p.x, p.y, p.z);
      m.castShadow = true;
      const a = Math.random() * 6.28;
      const s = 1.5 + Math.random() * 4;
      this.scene.add(m);
      this.debris.push({
        mesh: m, life: 2.2,
        vx: Math.cos(a) * s, vy: 3 + Math.random() * 4, vz: Math.sin(a) * s,
        rx: (Math.random() - 0.5) * 14, ry: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14
      });
    }
    if (this.debris.length > 120) {
      const d = this.debris.shift();
      this.scene.remove(d.mesh);
    }
  }

  /** Floating combat text, positioned by the HTML overlay each frame. */
  label(p, text, cls) {
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = text;
    document.getElementById('overlay').appendChild(el);
    this.labels.push({ el, x: p.x, y: p.y, z: p.z, life: 0.9, max: 0.9 });
  }

  /* ---------------- tick ---------------- */

  update(dt, camera, viewport) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      beam.life -= dt;
      const left = Math.max(0, beam.life / beam.max);
      // A held beam burns at full strength, then narrows and fades over the end of its life.
      const strength = beam.hold ? Math.min(1, left / (1 - beam.hold)) : left;
      for (const mesh of beam.group.children) mesh.material.opacity = mesh.userData.opacity * strength;
      if (beam.hold) {
        const age = beam.max - beam.life;
        const width = Math.min(1, age / 0.07) * (0.5 + 0.5 * strength) * (1 + Math.sin(age * 46) * 0.1);
        beam.group.scale.set(1, Math.max(0.01, width), Math.max(0.01, width));
      }
      if (beam.life <= 0) { this.clearBeam(beam); this.beams.splice(i, 1); }
    }
    this.pour(dt);
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      const d = Math.exp(-q.drag * dt);
      q.vy += q.gravity * dt;
      if (q.turb) {
        // hot air does not travel straight: each lick is jostled a little every frame
        const kick = q.turb * dt;
        q.vx += (Math.random() - 0.5) * kick; q.vy += (Math.random() - 0.5) * kick; q.vz += (Math.random() - 0.5) * kick;
      }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= d; q.vz *= d; q.vy *= d;
      if (q.y < 0.04) { q.y = 0.04; q.vy = 0; q.vx *= 0.7; q.vz *= 0.7; }
      if (q.grow) q.size += q.grow * dt;
    }
    this.glow.n = this.dark.n = 0;
    for (const q of this.p) {
      const a = Math.max(0, q.life / q.max), age = 1 - a;
      const c = q.dark ? this.dark : this.glow, n = c.n++;
      let r = q.r, g = q.g, b = q.b, alpha = a * a;
      if (q.ramp) {
        let k = 1;
        const heat = age * q.cool;
        while (k < FIRE_RAMP.length - 1 && FIRE_RAMP[k][0] < heat) k++;
        const lo = FIRE_RAMP[k - 1], hi = FIRE_RAMP[k], t = (heat - lo[0]) / (hi[0] - lo[0]);
        r *= lo[1] + (hi[1] - lo[1]) * t; g *= lo[2] + (hi[2] - lo[2]) * t; b *= lo[3] + (hi[3] - lo[3]) * t;
      }
      if (q.seed) alpha = q.peak * Math.min(1, age * (q.dark ? 5 : 40)) * Math.min(1, a * (q.dark ? 1.6 : 2.4));
      c.pos[n * 3] = q.x; c.pos[n * 3 + 1] = q.y; c.pos[n * 3 + 2] = q.z;
      c.tint[n * 3] = r; c.tint[n * 3 + 1] = g; c.tint[n * 3 + 2] = b;
      c.size[n] = q.size;
      c.alpha[n] = alpha;
      c.fire[n] = q.seed ? q.seed + q.spin * age : 0;
    }
    for (const c of [this.glow, this.dark]) {
      c.geo.setDrawRange(0, c.n);
      c.points.visible = c.n > 0;
      if (c.n || c.last) for (const name of ['position', 'tint', 'size', 'alpha', 'fire']) c.geo.attributes[name].needsUpdate = true;
      c.last = c.n;
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.light.intensity *= Math.pow(0.0001, dt);
      if (f.life <= 0) { f.light.userData.busy = false; f.light.intensity = 0; this.flashes.splice(i, 1); }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.3 + k * r.radius);
      r.mesh.material.opacity = (1 - k) * 0.85;
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vy -= 16 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;
      if (d.mesh.position.y < 0.04) {
        d.mesh.position.y = 0.04;
        d.vy *= -0.32; d.vx *= 0.6; d.vz *= 0.6;
        d.rx *= 0.5; d.ry *= 0.5; d.rz *= 0.5;
      }
      if (d.life <= 0) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 4) d.mesh.material.opacity = d.opacity * (d.life / 4);
      if (d.life <= 0) { this.scene.remove(d.mesh); d.mesh.material.dispose(); this.decals.splice(i, 1); }
    }

    const v = new THREE.Vector3();
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.life -= dt;
      l.y += dt * 1.3;
      if (l.life <= 0) { l.el.remove(); this.labels.splice(i, 1); continue; }
      v.set(l.x, l.y, l.z).project(camera);
      l.el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * viewport.w}px,${(-v.y * 0.5 + 0.5) * viewport.h}px)`;
      l.el.style.opacity = Math.min(1, (l.life / l.max) * 2);
    }
  }

  clear() {
    for (const beam of this.beams) this.clearBeam(beam);
    this.beams.length = 0;
    this.p.length = 0;
    this.jets.length = 0;
    this.fires.length = 0;
    for (const d of this.decals) { this.scene.remove(d.mesh); d.mesh.material.dispose(); }
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const l of this.labels) l.el.remove();
    this.decals.length = 0; this.debris.length = 0; this.rings.length = 0; this.labels.length = 0;
    for (const f of this.flashPool) { f.userData.busy = false; f.intensity = 0; }
    this.flashes.length = 0;
  }
}
