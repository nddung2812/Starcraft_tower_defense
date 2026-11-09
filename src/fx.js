import * as THREE from 'three';

const MAX = 3000;

const VERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float f = 1.0 - smoothstep(0.0, 0.25, r);
  gl_FragColor = vec4(vTint * f, vAlpha * f);
}`;

export class Fx {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.tint = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.p = [];           // live particle records
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

    this.flashPool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 5, 2);
      l.visible = false;
      scene.add(l);
      this.flashPool.push(l);
    }
  }

  laser(from, to, duration) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const group = new THREE.Group();
    // A bright red core and a wider translucent glow remain visible in Eco mode.
    for (const [width, color, opacity] of [[0.22, 0xff3020, 1], [0.8, 0xff0015, 0.3]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, width, width),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      mesh.userData.opacity = opacity;
      group.add(mesh);
    }
    group.position.set((from.x + to.x) / 2, 1.2, (from.z + to.z) / 2);
    group.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
    this.scene.add(group);
    this.beams.push({ group, life: duration, max: duration });
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
      bounce: opts.bounce ?? false
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
    const l = this.flashPool.find((f) => !f.visible);
    if (l) {
      l.position.set(p.x, p.y, p.z);
      l.intensity = 14;
      l.visible = true;
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
    const l = this.flashPool.find((f) => !f.visible);
    if (l) {
      l.position.set(p.x, p.y + 0.3, p.z);
      l.intensity = 40 * scale;
      l.visible = true;
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
      for (const mesh of beam.group.children) mesh.material.opacity = mesh.userData.opacity * Math.max(0, beam.life / beam.max);
      if (beam.life <= 0) { this.clearBeam(beam); this.beams.splice(i, 1); }
    }
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      const d = Math.exp(-q.drag * dt);
      q.vy += q.gravity * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= d; q.vz *= d; q.vy *= d;
      if (q.y < 0.04) { q.y = 0.04; q.vy = 0; q.vx *= 0.7; q.vz *= 0.7; }
      if (q.grow) q.size += q.grow * dt;
    }
    for (const q of this.p) {
      const a = Math.max(0, q.life / q.max);
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.tint[n * 3] = q.r; this.tint[n * 3 + 1] = q.g; this.tint[n * 3 + 2] = q.b;
      this.size[n] = q.size;
      this.alpha[n] = a * a;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.tint.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.light.intensity *= Math.pow(0.0001, dt);
      if (f.life <= 0) { f.light.visible = false; f.light.intensity = 0; this.flashes.splice(i, 1); }
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
    for (const d of this.decals) { this.scene.remove(d.mesh); d.mesh.material.dispose(); }
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const l of this.labels) l.el.remove();
    this.decals.length = 0; this.debris.length = 0; this.rings.length = 0; this.labels.length = 0;
    for (const f of this.flashPool) { f.visible = false; f.intensity = 0; }
    this.flashes.length = 0;
  }
}
