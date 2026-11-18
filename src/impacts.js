// Optional layer. What an enemy's attack looks like when it lands: claw slashes for melee, a burst
// of bone shards for spines, and a splash that leaves a smoking pool for acid. Presentation only: it
// never touches damage. The core reaches this only through `game.impacts?.…`, and every effect comes
// from a fixed pool, so a crowded fight drops the extra effects instead of slowing down.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const FLASHES = 56, RINGS = 20, POOLS = 12;
const ACID = [0.62, 1, 0.2], BONE = [1, 0.93, 0.74];
const BITES = {                     // slash colour and size by strain; anything else uses `zergling`
  zergling: { colour: 0xe9c9ff, size: 1.0 },
  hopper: { colour: 0x9fe8ff, size: 0.9 },
  warrior: { colour: 0xffa04a, size: 1.5 },
  ultralisk: { colour: 0xff4a32, size: 3.0 }
};

function paint(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Three curved claw strokes, sharp at both ends. */
const clawArt = (c, s) => {
  c.fillStyle = '#fff';
  c.shadowColor = '#fff';
  c.shadowBlur = s * 0.05;
  for (const offset of [-0.25, 0, 0.25]) {
    const x = s * (0.5 + offset);
    c.beginPath();
    c.moveTo(x + s * 0.17, s * 0.08);
    c.quadraticCurveTo(x + s * 0.09, s * 0.5, x - s * 0.17, s * 0.92);
    c.quadraticCurveTo(x - s * 0.01, s * 0.5, x + s * 0.17, s * 0.08);
    c.fill();
  }
};

/** A hard eight-point star over a soft core. */
const starArt = (c, s) => {
  const mid = s / 2;
  const soft = c.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.6);
  soft.addColorStop(0, 'rgba(255,255,255,1)');
  soft.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = soft;
  c.fillRect(0, 0, s, s);
  c.fillStyle = '#fff';
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? mid * 0.13 : mid * (i % 4 ? 0.62 : 0.98), a = (i / 16) * TAU;
    c.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
};

/** An uneven pool with a bright rim. */
const poolArt = (c, s) => {
  const mid = s / 2;
  c.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU, r = mid * (0.72 + 0.12 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 7));
    c.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  c.closePath();
  const wet = c.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.9);
  wet.addColorStop(0, 'rgba(70,120,20,0.75)');
  wet.addColorStop(0.75, 'rgba(120,200,30,0.85)');
  wet.addColorStop(1, 'rgba(205,255,90,1)');
  c.fillStyle = wet;
  c.fill();
};

export class Impacts {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.art = { claw: paint(128, clawArt), star: paint(128, starArt) };

    this.flashes = Array.from({ length: FLASHES }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false
      }));
      sprite.visible = false;
      sprite.renderOrder = 8;
      this.group.add(sprite);
      return { mesh: sprite, life: 0, max: 1, from: 1, to: 1, bright: 1 };
    });

    const ringShape = new THREE.RingGeometry(0.8, 1, 36).rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: RINGS }, () => {
      const mesh = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false
      }));
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, life: 0, max: 1, from: 1, to: 1, bright: 1 };
    });

    const poolShape = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const poolTexture = paint(128, poolArt);
    this.pools = Array.from({ length: POOLS }, () => {
      const mesh = new THREE.Mesh(poolShape, new THREE.MeshBasicMaterial({
        map: poolTexture, transparent: true, depthWrite: false, toneMapped: false, fog: false
      }));
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, life: 0, max: 1, vapour: 0 };
    });
  }

  flash(art, x, y, z, { colour, life, from, to, spin = 0, bright = 1 }) {
    const item = this.flashes.find(f => f.life <= 0);
    if (!item) return;
    Object.assign(item, { life, max: life, from, to, bright });
    item.mesh.material.map = art;
    item.mesh.material.color.setHex(colour);
    item.mesh.material.rotation = spin;
    item.mesh.position.set(x, y, z);
    item.mesh.scale.setScalar(from);
    item.mesh.visible = true;
  }

  ring(x, y, z, colour, from, to, life = 0.32) {
    const item = this.rings.find(r => r.life <= 0);
    if (!item) return;
    Object.assign(item, { life, max: life, from, to, bright: 0.9 });
    item.mesh.material.color.setHex(colour);
    item.mesh.position.set(x, y, z);
    item.mesh.scale.setScalar(from);
    item.mesh.visible = true;
  }

  pool(x, z, size) {
    const item = this.pools.find(p => p.life <= 0);
    if (!item) return;
    const life = 1.7 + Math.random() * 0.5;
    Object.assign(item, { life, max: life, vapour: 0 });
    item.mesh.position.set(x, 0.05, z);
    item.mesh.rotation.y = Math.random() * TAU;
    item.mesh.scale.setScalar(size);
    item.mesh.visible = true;
  }

  /** Where on the target a hit shows: chest height, and up in the air for aircraft. */
  spot(target) {
    const y = target.flying ? (target.obj?.position.y ?? target.altitude ?? 2.6) + 0.3 : (target.altitude || 0) + 0.65;
    return { x: target.x, y, z: target.z };
  }

  /** A spine or an acid glob has landed. `angle` is the way it was travelling. */
  shot(style, target, angle) {
    const p = this.spot(target);
    if (style === 'spine') this.spineHit(p, angle, target);
    else this.acidHit(p, target);
  }

  spineHit(p, angle, target) {
    const fx = this.game.fx;
    this.flash(this.art.star, p.x, p.y, p.z, { colour: 0xffe9b8, life: 0.17, from: 0.5, to: 1.25, spin: Math.random() * TAU });
    if (!target.flying) this.ring(p.x, 0.08, p.z, 0xffe2a8, 0.15, 0.85, 0.24);
    for (let i = 0; i < 9; i++) {       // shards thrown back the way the spine came
      const a = angle + Math.PI + (Math.random() - 0.5) * 2.1, speed = 3 + Math.random() * 4;
      fx.spawn(p.x, p.y, p.z, Math.cos(a) * speed, 1 + Math.random() * 3, Math.sin(a) * speed,
        0.22 + Math.random() * 0.2, 0.05 + Math.random() * 0.05, BONE, { drag: 2.2 });
    }
  }

  acidHit(p, target) {
    const fx = this.game.fx;
    this.flash(this.art.star, p.x, p.y, p.z, { colour: 0xa6ff3c, life: 0.24, from: 0.7, to: 1.9, spin: Math.random() * TAU });
    for (let i = 0; i < 16; i++) {      // a crown of droplets that arcs out and falls back
      const a = (i / 16) * TAU + Math.random() * 0.3, speed = 1.6 + Math.random() * 2.6;
      fx.spawn(p.x, p.y, p.z, Math.cos(a) * speed, 2.6 + Math.random() * 3, Math.sin(a) * speed,
        0.45 + Math.random() * 0.3, 0.07 + Math.random() * 0.07, ACID, { drag: 0.5, gravity: -9 });
    }
    if (target.flying) return;
    this.ring(p.x, 0.08, p.z, 0x9dff36, 0.25, 1.5, 0.38);
    this.pool(p.x, p.z, 0.75 + Math.random() * 0.3);
  }

  /** A claw or jaw has connected: a slash across the victim, cut along the line of the attack. */
  bite(bug, victim, angle) {
    const look = BITES[bug.breedId] || BITES.zergling;
    const big = bug.isBoss ? 3.4 : look.size, p = this.spot(victim);
    const colour = bug.isBoss ? 0xff5a2a : look.colour;
    this.flash(this.art.claw, p.x, p.y, p.z, { colour, life: 0.2, from: big * 0.62, to: big * 0.95, spin: angle + (Math.random() - 0.5) * 0.7 });
    const fx = this.game.fx, sparks = big > 1.2 ? 8 : 3;
    for (let i = 0; i < sparks; i++) {
      const a = angle + (Math.random() - 0.5) * 1.6, speed = 2 + Math.random() * 3;
      fx.spawn(p.x, p.y, p.z, Math.cos(a) * speed, 1 + Math.random() * 2, Math.sin(a) * speed,
        0.18 + Math.random() * 0.14, 0.05 + Math.random() * 0.04, [1, 0.72, 0.5], { drag: 2 });
    }
    if (big > 1.2) this.ring(p.x, 0.08, p.z, colour, 0.3, big * 0.75, 0.3);
  }

  update(dt) {
    for (const list of [this.flashes, this.rings]) {
      for (const item of list) {
        if (item.life <= 0) continue;
        item.life -= dt;
        if (item.life <= 0) { item.mesh.visible = false; continue; }
        const k = 1 - item.life / item.max, eased = 1 - (1 - k) * (1 - k);
        item.mesh.scale.setScalar(item.from + (item.to - item.from) * eased);
        item.mesh.material.opacity = item.bright * (1 - k);
      }
    }
    const fx = this.game.fx;
    for (const pool of this.pools) {
      if (pool.life <= 0) continue;
      pool.life -= dt;
      if (pool.life <= 0) { pool.mesh.visible = false; continue; }
      pool.mesh.material.opacity = Math.min(1, pool.life / 0.6) * 0.85;
      pool.vapour += dt * 7;
      for (; pool.vapour >= 1; pool.vapour--) {
        const a = Math.random() * TAU, r = pool.mesh.scale.x * 0.6 * Math.random();
        fx.spawn(pool.mesh.position.x + Math.cos(a) * r, 0.1, pool.mesh.position.z + Math.sin(a) * r,
          0, 0.7 + Math.random() * 0.7, 0, 0.5 + Math.random() * 0.4, 0.07 + Math.random() * 0.06, ACID, { drag: 0.8 });
      }
    }
  }

  clear() {
    for (const list of [this.flashes, this.rings, this.pools]) {
      for (const item of list) { item.life = 0; item.mesh.visible = false; }
    }
  }
}

export function installImpacts(game) {
  game.impacts = new Impacts(game);
  return game.impacts;
}
