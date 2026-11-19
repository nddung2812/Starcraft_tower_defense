// Optional layer. The plasma shield: a thin globe over the base that appears at base research
// level 3 and grows at every third level after that. Damage to anything inside drains the shield
// instead, and it only recharges, slowly, while the base is left alone. The core reaches this only through `game.plasma?.…`, so a missing file costs the shield
// and nothing else. Tuning is `PLASMA_SHIELD` in config.
import * as THREE from 'three';
import { PLASMA_SHIELD, plasmaTier, plasmaRadius, plasmaPool } from './config.js';

const HITS = 4;
const COLOR = 0x7fe3ff;

const VERTEX = /* glsl */`
  varying vec3 vNormalW, vView, vPoint;
  void main() {
    vPoint = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uStrength, uFlash, uTime;
  uniform vec4 uHits[${HITS}];
  varying vec3 vNormalW, vView, vPoint;
  void main() {
    // Bright only at the edge of the globe, so it reads as a thin skin and the battle stays visible.
    float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 2.4);
    float bands = smoothstep(0.93, 1.0, sin(vPoint.y * 46.0 + uTime * 1.2)) * 0.1;
    float alpha = (rim * 0.62 + bands * (0.25 + rim) + 0.02) * (0.45 + 0.55 * uStrength);
    float ripple = 0.0;
    for (int i = 0; i < ${HITS}; i++) {
      if (uHits[i].w >= 1.0) continue;
      float angle = acos(clamp(dot(vPoint, uHits[i].xyz), -1.0, 1.0));
      ripple += smoothstep(0.16, 0.0, abs(angle - uHits[i].w * 1.1)) * (1.0 - uHits[i].w);
    }
    alpha += ripple * 0.75 + uFlash * 0.35;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(ripple + uFlash, 0.0, 1.0) * 0.6), clamp(alpha, 0.0, 1.0));
  }`;

export class PlasmaShield {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.core = null;
    this.tier = 0;
    this.pool = 0;
    this.broken = false;
    this.sinceHit = 0;
    this.shown = 0;
    this.flash = 0;
    this.nextHit = 0;
    this.time = 0;

    this.uniforms = {
      uColor: { value: new THREE.Color(COLOR) }, uStrength: { value: 1 }, uFlash: { value: 0 }, uTime: { value: 0 },
      uHits: { value: Array.from({ length: HITS }, () => new THREE.Vector4(0, 1, 0, 1)) }
    };
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: this.uniforms, transparent: true,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false
    }));
    this.globe.renderOrder = 6;
    // Where the globe meets the ground, so its size is easy to judge from above.
    this.edge = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color: COLOR, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    }));
    this.edge.position.y = 0.06;
    this.obj = new THREE.Group();
    this.obj.add(this.globe, this.edge);
    this.obj.visible = false;
    game.world.add(this.obj);
    game.on('change', () => this.sync());
    this.sync();
  }

  get radius() { return plasmaRadius(this.tier); }
  get maxPool() { return plasmaPool(this.tier); }
  get up() { return this.tier > 0 && !this.broken && !!this.core && !this.core.dead; }

  /** Is this unit or building under the globe right now? */
  covers(entity) { return this.up && this.within(entity); }

  within(entity) { return Math.hypot(entity.x - this.core.x, entity.z - this.core.z) <= this.radius; }

  /** Take a hit meant for something inside. True means the hit is spent and the target is untouched. */
  absorb(entity, amount) {
    if (!this.tier || !this.core || !this.within(entity)) return false;
    this.sinceHit = 0;            // under attack: even a broken shield waits for the fighting to stop
    if (!this.up) return false;
    this.pool -= amount;
    const hit = this.uniforms.uHits.value[this.nextHit];
    this.nextHit = (this.nextHit + 1) % HITS;
    hit.set(entity.x - this.core.x, this.radius * 0.45, entity.z - this.core.z, 1).normalize();
    hit.w = 0;
    if (this.pool <= 0) this.collapse();
    return true;
  }

  collapse() {
    const { game, core } = this;
    this.pool = 0;
    this.broken = true;
    this.obj.visible = false;
    game.fx.ring({ x: core.x, z: core.z }, this.radius, COLOR);
    game.sfx.cannonHit();
    game.stage.kick(2);
    this.ui?.toast('Plasma shield down', 'It recharges once the base is left alone.', 'warn');
  }

  /** Follow the research level and the base. Both can change without a tick: a new round, a loaded save. */
  sync() {
    const { game } = this, tier = plasmaTier(game.baseLevel);
    if (game.core !== this.core || tier !== this.tier) {
      const grew = game.core === this.core && tier > this.tier;
      const first = this.tier === 0, changed = tier !== this.tier;
      this.core = game.core;
      this.tier = tier;
      // Research charges it. A new round does not: the shield carries its damage to the next map.
      if (changed) { this.broken = false; this.sinceHit = 0; this.pool = this.maxPool; }
      if (grew) {
        game.fx.ring({ x: this.core.x, z: this.core.z }, this.radius, COLOR);
        this.ui?.callout(first ? 'Plasma shield online' : 'Plasma shield expanded', `${this.radius} tiles · protects everything inside`, 'unit');
      } else this.shown = this.radius;
    }
    this.obj.visible = this.up;
    if (this.core) this.obj.position.set(this.core.x, 0, this.core.z);
  }

  /** A loaded save keeps the damage the shield had taken. */
  restore(saved) {
    this.sync();
    if (!saved || !Number.isFinite(saved.pool)) return;
    this.pool = Math.max(0, Math.min(this.maxPool, saved.pool));
    this.broken = !!saved.broken;
    this.obj.visible = this.up;
  }

  update(dt) {
    this.sync();
    if (!this.tier) return;
    this.time += dt;
    this.sinceHit += dt;
    if (this.sinceHit >= PLASMA_SHIELD.regenDelay) this.pool = Math.min(this.maxPool, this.pool + this.maxPool * PLASMA_SHIELD.regen * dt);
    if (this.broken) {
      if (this.pool < this.maxPool * PLASMA_SHIELD.restart) return;
      this.broken = false;
      this.shown = 0;             // grows back from the base
      this.obj.visible = this.up;
    }
    this.shown += (this.radius - this.shown) * Math.min(1, dt * 5);
    this.flash = Math.max(0, this.flash - dt * 2);
    for (const hit of this.uniforms.uHits.value) hit.w = Math.min(1, hit.w + dt * 1.6);
    this.globe.scale.setScalar(Math.max(0.01, this.shown));
    this.edge.scale.setScalar(Math.max(0.01, this.shown));
    this.uniforms.uStrength.value = this.pool / this.maxPool;
    this.uniforms.uFlash.value = this.flash;
    this.uniforms.uTime.value = this.time;
  }

  /** One line for the base's panel. */
  summary() {
    if (!this.tier) return `Plasma shield at Lv ${PLASMA_SHIELD.every}`;
    if (!this.up) return `Shield down · recharging ${Math.round(this.pool / this.maxPool * 100)}%`;
    return `Shield ${this.radius} tiles · ${Math.round(this.pool / this.maxPool * 100)}%`;
  }
}

export function installPlasma(game, ui) {
  game.plasma = new PlasmaShield(game, ui);
  return game.plasma;
}
