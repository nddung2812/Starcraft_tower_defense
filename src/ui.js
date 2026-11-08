import * as THREE from 'three';
import { BUILD, ARMORY, MARINE_TIERS, MARINE_INFO, ZERG_INFO, ECON } from './config.js';
import { buildMarine, buildZergling } from './models.js';

const $ = (id) => document.getElementById(id);

/* A tiny second renderer that spins the real 3D model in the inspector. */
class Portrait {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(canvas.clientWidth || 300, canvas.clientHeight || 190, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 20);

    this.scene.add(new THREE.HemisphereLight(0x9fc8e8, 0x3a2a20, 1.1));
    const key = new THREE.DirectionalLight(0xffe8c8, 3);
    key.position.set(2.2, 3, 2.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ab6ff, 2.2);
    rim.position.set(-2.6, 1.4, -2);
    this.scene.add(rim);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.current = null;
    this.t = 0;
  }

  show(kind, tier = 0) {
    const key = kind + tier;
    if (this.key === key) return;
    this.key = key;
    if (this.current) this.pivot.remove(this.current);
    if (kind === 'marine') {
      this.current = buildMarine(tier);
      this.camera.position.set(0, 0.72, 2.0);
      this.camera.lookAt(0, 0.5, 0);
    } else {
      this.current = buildZergling();
      this.camera.position.set(0, 0.62, 1.7);
      this.camera.lookAt(0, 0.22, 0);
    }
    this.current.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.pivot.add(this.current);
  }

  update(dt) {
    this.t += dt;
    this.pivot.rotation.y = Math.sin(this.t * 0.45) * 0.85 - 0.5;
    if (this.key?.startsWith('zergling') && this.current) {
      const ud = this.current.userData;
      const gait = this.t * 7;
      for (const hip of ud.legs) {
        const ph = gait + hip.userData.phase;
        hip.rotation.z = Math.sin(ph) * 0.5;
        hip.userData.knee.rotation.z = -0.5 - Math.max(0, Math.cos(ph)) * 0.6;
      }
      const sw = Math.max(0, Math.sin(this.t * 1.6));
      ud.blades.forEach((b) => {
        b.rotation.y = b.userData.side * (-0.1 + (1 - sw) * 0.35);
        b.rotation.z = -sw * 1.1;
      });
      ud.body.position.y = 0.24 + Math.abs(Math.sin(gait)) * 0.03;
      ud.tail.rotation.y = Math.sin(this.t * 2) * 0.4;
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}

function statRow(label, value, frac, color) {
  return `<div class="stat"><span class="stat__k">${label}</span>
    <span class="stat__bar"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%;background:${color}"></i></span>
    <span class="stat__v">${value}</span></div>`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.portrait = new Portrait($('portrait'));
    this.inspect = { kind: 'marine', tier: 0, entity: null };

    $('buildBar').innerHTML = Object.values(BUILD).map((b) => `
      <button class="card" data-build="${b.id}">
        <span class="card__icon">${b.icon}</span>
        <span class="card__name">${b.name}</span>
        <span class="card__cost">${b.cost}</span>
        <span class="card__key">${b.id === 'wall' ? '1' : '2'}</span>
      </button>`).join('');

    $('buildBar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-build]');
      if (btn) game.emit('pick', btn.dataset.build);
    });

    $('btnWave').addEventListener('click', () => game.startWave());
    $('btnUpgrade').addEventListener('click', () => {
      if (this.inspect.entity?.kind === 'marine') game.upgradeMarine(this.inspect.entity);
    });
    $('btnSell').addEventListener('click', () => {
      if (this.inspect.entity) game.sell(this.inspect.entity);
    });
    $('btnRestart').addEventListener('click', () => game.emit('restart'));
    $('bannerBtn').addEventListener('click', () => game.emit('restart'));

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      this.showUnit(b.dataset.unit, 0, null);
    }));

    game.on('change', () => this.sync());
    game.on('unlock', (u) => this.toast(`Armory unlocked — ${u.name}`, u.effect, 'unlock'));
    game.on('cleared', (d) => this.toast(`Wave ${d.wave} cleared`, `+${d.bonus} minerals`, 'ok'));
    game.on('wave', (n) => this.toast(`Wave ${n} inbound`, 'Hold the line', 'warn'));
    game.on('over', () => this.showBanner());

    this.showUnit('marine', 0, null);
  }

  setPlacing(id) {
    document.querySelectorAll('[data-build]').forEach((b) =>
      b.classList.toggle('card--on', b.dataset.build === id));
  }

  showUnit(kind, tier, entity) {
    this.inspect = { kind, tier, entity };
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('tab--active', b.dataset.unit === kind));
    document.querySelector('.panel').dataset.faction = kind;
    this.portrait.show(kind, tier);
    this.renderStats();
  }

  renderStats() {
    const { kind, tier, entity } = this.inspect;
    const g = this.game;

    if (kind === 'marine') {
      const base = MARINE_TIERS[tier];
      const s = { hp: base.hp, damage: base.damage, attackSpeed: base.attackSpeed, range: base.range, armor: MARINE_INFO.armor };
      if (entity) Object.assign(s, entity.stats);
      else for (const u of g.armory) u.apply(s);

      $('pName').textContent = MARINE_INFO.name;
      $('pRole').textContent = `${base.rank} · Tier ${tier + 1} of ${MARINE_TIERS.length}`;
      $('pFaction').textContent = MARINE_INFO.faction;
      $('pBio').textContent = MARINE_INFO.bio;
      $('pQuote').textContent = MARINE_INFO.quote;
      $('stats').innerHTML =
        statRow('Hit Points', Math.round(s.hp), s.hp / 220, '#5ef08a') +
        statRow('Damage', s.damage, s.damage / 36, '#f0b23c') +
        statRow('Armour', s.armor, s.armor / 3, '#9aa3a8') +
        statRow('Fire Rate', (1 / s.attackSpeed).toFixed(2) + '/s', (1 / s.attackSpeed) / 3.5, '#f0b23c') +
        statRow('Range', s.range.toFixed(1) + ' tiles', s.range / 8, '#5ad7ff') +
        statRow('Move Speed', 'Emplaced', 0, '#5ad7ff');
    } else {
      const spec = g.state === 'wave' || g.wave > 0 ? g.wave : 1;
      const hp = Math.round(ZERG_INFO.hp * (1 + Math.max(0, spec - 1) * 0.14));
      $('pName').textContent = ZERG_INFO.name;
      $('pRole').textContent = ZERG_INFO.role;
      $('pFaction').textContent = ZERG_INFO.faction;
      $('pBio').textContent = ZERG_INFO.bio;
      $('pQuote').textContent = ZERG_INFO.quote;
      $('stats').innerHTML =
        statRow('Hit Points', entity ? entity.maxHp : hp, (entity ? entity.maxHp : hp) / 220, '#5ef08a') +
        statRow('Damage', ZERG_INFO.damage, ZERG_INFO.damage / 36, '#f0b23c') +
        statRow('Armour', ZERG_INFO.armor, 0, '#9aa3a8') +
        statRow('Attack Rate', (1 / ZERG_INFO.attackSpeed).toFixed(2) + '/s', (1 / ZERG_INFO.attackSpeed) / 3.5, '#f0b23c') +
        statRow('Range', ZERG_INFO.range.toFixed(1) + ' tiles', ZERG_INFO.range / 8, '#c06bff') +
        statRow('Move Speed', ZERG_INFO.speed.toFixed(2) + ' t/s', ZERG_INFO.speed / 4, '#c06bff');
    }

    this.syncActions();
  }

  syncActions() {
    const e = this.inspect.entity;
    const g = this.game;
    const up = $('btnUpgrade'), sell = $('btnSell');
    const isMine = e && (e.kind === 'marine' || e.kind === 'wall');

    sell.hidden = !isMine;
    up.hidden = !(e && e.kind === 'marine');

    if (e?.kind === 'marine') {
      const cost = e.upgradeCost;
      if (cost == null) {
        up.disabled = true;
        up.textContent = 'Max Rank';
      } else {
        up.disabled = g.minerals < cost || g.state === 'wave';
        up.textContent = `Promote to ${MARINE_TIERS[e.tier + 1].rank} · ${cost}`;
      }
    }
    if (isMine) {
      const v = e.kind === 'wall'
        ? Math.round(BUILD.wall.cost * ECON.refundRate)
        : Math.round(e.invested * ECON.refundRate);
      sell.disabled = g.state === 'wave';
      sell.textContent = `Salvage · +${v}`;
    }
  }

  sync() {
    const g = this.game;
    $('rMinerals').textContent = g.minerals;
    $('rWave').textContent = g.wave;
    $('rKills').textContent = g.kills;
    const pct = Math.max(0, g.core.hp / g.core.maxHp);
    $('rCore').textContent = Math.ceil(pct * 100) + '%';
    $('rCore').style.color = pct > 0.5 ? '' : pct > 0.25 ? '#f0b23c' : '#ff5a4a';

    const next = g.nextArmory;
    $('armoryLabel').textContent = next ? next.name : 'All tech unlocked';
    $('armoryNote').textContent = next ? `${next.effect} · ${g.kills}/${next.kills} kills` : 'Maximum loadout';
    $('armoryFill').style.width = next
      ? Math.min(100, (g.kills / next.kills) * 100) + '%'
      : '100%';

    $('btnWave').disabled = g.state !== 'build';
    $('btnWave').textContent = g.state === 'wave' ? `Wave ${g.wave} in progress` : `Launch Wave ${g.wave + 1}`;

    document.querySelectorAll('[data-build]').forEach((b) => {
      b.classList.toggle('card--poor', g.minerals < BUILD[b.dataset.build].cost);
    });

    if (this.inspect.entity) this.renderStats(); else this.syncActions();
  }

  toast(title, note, kind) {
    const el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.innerHTML = `<b>${title}</b><span>${note}</span>`;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('toast--out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  showBanner() {
    $('bannerTitle').textContent = 'Outpost Overrun';
    $('bannerText').textContent = `The swarm broke through on wave ${this.game.wave} after ${this.game.kills} kills.`;
    $('banner').hidden = false;
  }

  hideBanner() { $('banner').hidden = true; }

  tip(html) { $('tip').innerHTML = html; }

  update(dt) { this.portrait.update(dt); }
}
