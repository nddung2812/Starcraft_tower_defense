import * as THREE from 'three';
import { BUILD, ZERG_INFO, BREEDS, ECON, UNITS, AIR_STRIKE } from './config.js';
import { buildZergling } from './models.js';
import { makeModel, loadedModels } from './assets.js';

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
    const model = (k) => makeModel(k, tier, { rim: false });
    if (kind === 'marine') {
      this.current = model('marine');
      this.camera.position.set(0, 0.72, 2.0);
      this.camera.lookAt(0, 0.5, 0);
    } else if (kind === 'goliath') {
      this.current = model('goliath');
      this.camera.position.set(1.5, 1.2, 3.3);
      this.camera.lookAt(0.05, 0.7, 0);
    } else if (kind === 'tank') {
      this.current = model('tank');
      this.camera.position.set(1.7, 1.05, 3.15);
      this.camera.lookAt(0.05, 0.32, 0);
    } else {
      this.current = loadedModels().includes('zergling') ? model('zergling') : buildZergling();
      this.camera.position.set(0, 0.62, 1.7);
      this.camera.lookAt(0, 0.22, 0);
    }
    this.current.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.pivot.add(this.current);
    if (this.current.userData.fromFile) this.frame(this.current);
  }

  /** Fit the camera to a model file, whatever its proportions. */
  frame(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const d = Math.max(size.y * 1.45, Math.max(size.x, size.z) * 1.15) / Math.tan((this.camera.fov * Math.PI) / 360) * 0.62;
    this.camera.position.set(c.x + d * 0.35, c.y + size.y * 0.12, c.z + d);
    this.camera.lookAt(c.x, c.y, c.z);
  }

  update(dt) {
    this.t += dt;
    this.pivot.rotation.y = Math.sin(this.t * 0.45) * 0.85 - 0.5;
    const ud = this.current?.userData;
    if (ud?.anim) ud.anim('idle', dt);
    else if (this.key?.startsWith('zergling') && ud?.legs) {
      const gait = this.t * 7;
      for (const hip of ud.legs) {
        const ph = gait + hip.userData.phase;
        hip.rotation.x = Math.sin(ph) * 0.5;
        hip.userData.knee.rotation.x = hip.userData.side * 0.4;
      }
      const sw = Math.max(0, Math.sin(this.t * 1.6));
      ud.blades.forEach((b) => {
        b.rotation.x = b.userData.side * (0.7 + sw * 0.3);
        b.rotation.z = -sw * 0.7;
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

const COMMANDS = [
  { id: 'attack', label: 'Attack', key: 'A' },
  { id: 'stop', label: 'Stop', key: 'S' },
  { id: 'air', label: 'Air Strike', key: 'R' },
  { id: 'stim', label: 'Stim', key: 'F' },
  { id: 'promote', label: 'Promote', key: 'U' },
  { id: 'salvage', label: 'Salvage', key: 'X' },
  { id: 'army', label: 'All Army', key: 'F2' },
  { id: 'scv', label: 'SCV', key: 'F1' },
  { id: 'wave', label: 'Launch', key: 'Space' }
];

const CHIP = { marine: 'M', goliath: 'G', tank: 'H', scv: 'S' };

function unitLike(e) {
  if (!e || e.dead) return false;
  if (e.kind === 'scv') return true;
  return !!UNITS[e.kind] && !e.downed && !e.bunker;
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
        <span class="card__key">${b.key}</span>
      </button>`).join('');

    $('buildBar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-build]');
      if (btn) game.emit('pick', btn.dataset.build);
    });

    $('cmdCard').innerHTML = COMMANDS.map((c) => `
      <button class="cmd" data-cmd="${c.id}" title="${c.label} (${c.key})">
        <span class="cmd__label">${c.label}</span>
        <span class="cmd__key">${c.key}</span>
      </button>`).join('');
    $('cmdCard').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (btn && !btn.disabled) game.emit('cmd', btn.dataset.cmd);
    });

    this.selList = [];
    this.chipT = 0;
    $('selGrid').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-i]');
      const unit = chip && this.selList[+chip.dataset.i];
      if (!unit) return;
      game.emit(e.shiftKey ? 'deselect' : 'selectOnly', unit);
    });

    $('btnWave').addEventListener('click', () => game.startWave());
    $('btnAir').addEventListener('click', () => game.emit('airstrike'));
    $('btnUpgrade').addEventListener('click', () => {
      if (this.inspect.entity?.upgrade) game.upgradeGunner(this.inspect.entity);
    });
    $('btnStim').addEventListener('click', () => {
      if (this.inspect.entity?.kind === 'marine') this.inspect.entity.stim(game);
    });
    $('btnEject').addEventListener('click', () => {
      if (this.inspect.entity?.bunker) game.eject(this.inspect.entity);
    });
    $('btnSell').addEventListener('click', () => {
      if (this.inspect.entity) game.sell(this.inspect.entity);
    });
    $('btnScv').addEventListener('click', () => game.rebuildScv());
    $('btnRestart').addEventListener('click', () => game.emit('restart'));
    $('bannerBtn').addEventListener('click', () => game.emit('restart'));

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      this.showUnit(b.dataset.unit, 0, null);
    }));

    game.on('change', () => this.sync());
    game.on('unlock', (u) => this.toast(`Armory unlocked — ${u.name}`, u.effect, 'unlock'));
    game.on('brief', (card) => this.say(`<b>${card.title}.</b> ${card.body}`));
    game.on('hold', (card) => this.say(`<b>${card.title}.</b> ${card.body}`));
    game.on('count', (n) => { if (n) this.say(`<b>Contact in ${n}.</b>`); });

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

    if (entity?.kind === 'scv' || entity?.kind === 'bunker') {
      const bunker = entity.kind === 'bunker';
      $('pName').textContent = bunker ? 'Bunker' : 'T-280 SCV';
      $('pRole').textContent = bunker ? `${entity.garrison.length} / 2 garrisoned` : (entity.dead ? 'Destroyed' : 'Field Repair');
      $('pFaction').textContent = 'Terran Dominion';
      $('pBio').textContent = bunker
        ? 'Select Marines, then right-click the bunker. They walk in and fire through the slit, with extra armour, along its facing.'
        : 'Right-click a damaged wall or a downed Marine to fix it, or the ground to move. Keep it out of the breach.';
      $('pQuote').textContent = bunker ? '"Hold this corridor."' : '"Job\'s done."';
      $('stats').innerHTML = statRow('Hit Points', Math.ceil(entity.hp) + ' / ' + entity.maxHp, entity.hp / entity.maxHp, '#5ef08a');
    } else if (UNITS[kind]) {
      const spec = UNITS[kind];
      const base = spec.tiers[tier];
      const s = { hp: base.hp, damage: base.damage, attackSpeed: base.attackSpeed, range: base.range, armor: spec.info.armor };
      if (entity) Object.assign(s, entity.stats);
      else if (spec.armory) for (const u of g.armory) u.apply(s);
      const shots = kind === 'goliath' ? 2 : 1;

      $('pName').textContent = spec.info.name;
      $('pRole').textContent = spec.tiers.length > 1
        ? `${base.rank} · Tier ${tier + 1} of ${spec.tiers.length}`
        : spec.info.role;
      $('pFaction').textContent = spec.info.faction;
      $('pBio').textContent = spec.info.bio;
      $('pQuote').textContent = spec.info.quote;
      const accent = spec.info.accent;
      $('stats').innerHTML =
        statRow('Hit Points', Math.round(s.hp), s.hp / 380, '#5ef08a') +
        statRow('Damage', shots > 1 ? s.damage + ' ×2' : s.damage, (s.damage * shots) / 50, '#f0b23c') +
        statRow('Armour', s.armor, s.armor / 4, '#9aa3a8') +
        statRow('Fire Rate', (1 / s.attackSpeed).toFixed(2) + '/s', (1 / s.attackSpeed) / 3.5, '#f0b23c') +
        statRow('Range', s.range.toFixed(1) + ' tiles', s.range / 8, accent) +
        (spec.splash ? statRow('Blast', spec.splash.toFixed(1) + ' tiles', spec.splash / 2, accent) : '') +
        statRow('Move Speed', spec.mobile ? spec.speed.toFixed(1) + ' t/s' : 'Emplaced', spec.speed / 3, accent);
    } else {
      const b = entity?.breed || BREEDS.zergling;
      $('pName').textContent = b.name;
      $('pRole').textContent = b.role;
      $('pFaction').textContent = ZERG_INFO.faction;
      $('pBio').textContent = ZERG_INFO.bio;
      $('pQuote').textContent = ZERG_INFO.quote;
      const hp = entity ? entity.maxHp : b.hp;
      $('stats').innerHTML =
        statRow('Hit Points', hp, hp / 280, '#5ef08a') +
        statRow('Damage', b.damage, b.damage / 36, '#f0b23c') +
        statRow('Armour', b.armor, b.armor / 4, '#9aa3a8') +
        statRow('Attack Rate', (1 / b.attackSpeed).toFixed(2) + '/s', (1 / b.attackSpeed) / 3.5, '#f0b23c') +
        statRow('Range', b.range.toFixed(1) + ' tiles', b.range / 8, '#c06bff') +
        statRow('Move Speed', b.speed.toFixed(2) + ' t/s', b.speed / 4, '#c06bff');
    }

    this.syncActions();
  }

  syncActions() {
    const e = this.inspect.entity;
    const g = this.game;
    const up = $('btnUpgrade'), sell = $('btnSell'), stim = $('btnStim'), eject = $('btnEject');
    const isGun = e && UNITS[e.kind];
    const isMine = e && (isGun || e.kind === 'wall' || e.kind === 'bunker');

    sell.hidden = !isMine;
    up.hidden = !(isGun && e.tiers.length > 1 && !e.downed);
    stim.hidden = !(e && e.spec?.canStim);
    eject.hidden = !(e && e.bunker);
    if (e?.spec?.canStim) {
      stim.disabled = !g.stimUnlocked || e.dead || e.downed || e.stimT > 0;
      stim.textContent = g.stimUnlocked ? (e.stimT > 0 ? 'Stimming' : 'Stim (F)') : 'Stim locked · 20 kills';
    }

    if (isGun && e.tiers.length > 1) {
      const cost = e.upgradeCost;
      if (cost == null) {
        up.disabled = true;
        up.textContent = 'Max Rank';
      } else {
        up.disabled = g.minerals < cost;
        up.textContent = `Promote to ${e.tiers[e.tier + 1].rank} · ${cost}`;
      }
    }
    if (isMine) {
      const base = e.kind === 'wall' ? BUILD.wall.cost : e.kind === 'bunker' ? BUILD.bunker.cost : e.invested;
      const v = Math.round(base * ECON.refundRate);
      sell.disabled = g.state !== 'build';
      sell.textContent = `Salvage · +${v}`;
    }
  }

  sync() {
    const g = this.game;
    $('rMinerals').textContent = g.minerals;
    $('rWave').textContent = g.level;
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
    $('btnWave').textContent = g.state === 'build' ? `Launch Level ${g.level}`
      : g.state === 'brief' ? 'Contact'
      : g.state === 'victory' ? 'Sector secure'
      : g.state === 'defeat' ? 'Outpost lost'
      : `Level ${g.level}`;
    this.syncAir();
    $('btnScv').hidden = !g.scv?.dead;
    $('btnScv').disabled = g.minerals < ECON.scvCost;
    $('btnScv').textContent = `Rebuild SCV · ${ECON.scvCost}`;

    document.querySelectorAll('[data-build]').forEach((b) => {
      b.classList.toggle('card--poor', g.minerals < BUILD[b.dataset.build].cost);
    });

    if (this.inspect.entity) this.renderStats(); else this.syncActions();
    this.syncCommands();
  }

  /** Multi-select grid in the inspector: one chip per unit, with its health. */
  setSelection(list) {
    this.selList = list.slice(0, 24);
    const grid = $('selGrid');
    grid.hidden = list.length < 2;
    $('selCount').textContent = list.length > 1 ? `${list.length} selected` : '';
    grid.innerHTML = list.length < 2 ? '' : this.selList.map((e, i) => `
      <button class="chip chip--${e.kind}" data-i="${i}" title="${e.kind === 'scv' ? 'SCV' : UNITS[e.kind]?.info.name || e.kind}">
        <span class="chip__icon">${CHIP[e.kind] || '?'}</span>
        <span class="chip__hp"><i></i></span>
      </button>`).join('');
    this.paintChips();
    this.syncCommands();
  }

  paintChips() {
    const bars = $('selGrid').querySelectorAll('.chip__hp i');
    this.selList.forEach((e, i) => {
      const bar = bars[i];
      if (!bar) return;
      const pct = Math.max(0, e.hp / e.maxHp);
      bar.style.width = pct * 100 + '%';
      bar.style.background = pct > 0.55 ? '#5ef08a' : pct > 0.25 ? '#f0b23c' : '#ff5a4a';
    });
  }

  setArmed(id, on) {
    document.querySelector(`[data-cmd="${id}"]`)?.classList.toggle('cmd--armed', !!on);
  }

  /** Grey out commands that make no sense for what's selected right now. */
  syncCommands() {
    const g = this.game;
    const sel = g.selection || [];
    const units = sel.filter(unitLike);
    const guns = units.filter((u) => UNITS[u.kind]);
    const primary = g.selected;
    const fighting = g.state === 'wave' || g.state === 'brief';
    const set = (id, on, label) => {
      const b = document.querySelector(`[data-cmd="${id}"]`);
      if (!b) return;
      b.disabled = !on;
      if (label) b.querySelector('.cmd__label').textContent = label;
    };
    set('attack', guns.length > 0);
    set('stop', units.length > 0);
    set('air', fighting && g.airStrikeReady, fighting && !g.airStrikeReady ? `Air ${Math.ceil(g.airStrikeCd)}s` : 'Air Strike');
    set('stim', g.stimUnlocked && units.some((u) => u.kind === 'marine' && u.stimT <= 0));
    const cost = primary && UNITS[primary.kind] && !primary.downed ? primary.upgradeCost : null;
    set('promote', cost != null && g.minerals >= cost);
    const mine = primary && (UNITS[primary.kind] || primary.kind === 'wall' || primary.kind === 'bunker');
    set('salvage', g.state === 'build' && !!mine);
    set('army', g.gunners.some(unitLike));
    set('scv', !!g.scv && !g.scv.dead);
    set('wave', g.state === 'build' || (fighting && !!g.lastAlert), g.state === 'build' ? 'Launch' : 'Last Alert');
  }

  hideReel() { this.say(''); }

  /** Game over: your run, and the leaderboard with your row highlighted. */
  showBanner({ name, score, level, kills, rank, online, scores, best }) {
    $('bannerTitle').textContent = 'Outpost Overrun';
    $('bannerTitle').classList.remove('is-win');
    const place = rank ? ` · #${rank} ${online ? 'worldwide' : 'on this device'}` : '';
    $('bannerText').textContent = `${name}, you killed ${score.toLocaleString()} bugs and held to level ${level}${place}. Your best: ${best.toLocaleString()} kills.`;
    this.renderBoard($('bannerBoard'), scores, { name, score });
    $('banner').hidden = false;
  }

  /** Fill a leaderboard list. `you` highlights the matching row. */
  renderBoard(el, scores, you = null) {
    el.innerHTML = '';
    let marked = false;
    for (const s of scores) {
      const li = document.createElement('li');
      if (you && !marked && s.name === you.name && s.score === you.score) { li.className = 'is-you'; marked = true; }
      const n = document.createElement('span'); n.className = 'board__name'; n.textContent = s.name;
      const l = document.createElement('span'); l.className = 'board__lvl'; l.textContent = `L${s.level}`;
      const v = document.createElement('span'); v.className = 'board__score'; v.textContent = `${Number(s.score).toLocaleString()} kills`;
      li.append(n, l, v);
      el.append(li);
    }
  }

  hideBanner() { $('banner').hidden = true; }

  say(html) {
    this.line = html;
    const el = $('status');
    if (el) el.innerHTML = html;
  }

  tip(html) { this.say(html); }

  toast(title, note) {
    this.say(`<b>${title}.</b> ${note}`);
  }

  setAirArmed(on) {
    $('btnAir').classList.toggle('btn--armed', !!on);
    this.setArmed('air', on);
  }

  syncAir() {
    const g = this.game;
    const btn = $('btnAir');
    const fighting = g.state === 'wave' || g.state === 'brief';
    const ready = g.airStrikeReady;
    btn.disabled = !fighting || !ready;
    if (!fighting) btn.textContent = `Air Strike (${AIR_STRIKE.key})`;
    else if (!ready) btn.textContent = `Air Strike ${Math.ceil(g.airStrikeCd)}s`;
    else btn.textContent = `Air Strike (${AIR_STRIKE.key})`;
  }

  update(dt) {
    this.portrait.update(dt);
    const g = this.game;
    const pct = Math.max(0, g.core.hp / g.core.maxHp);
    $('rCore').textContent = Math.ceil(pct * 100) + '%';
    $('rCore').style.color = pct > 0.5 ? '' : pct > 0.25 ? '#f0b23c' : '#ff5a4a';
    $('rMinerals').textContent = g.minerals;
    $('rKills').textContent = g.kills;
    this.syncAir();
    this.chipT -= dt;
    if (this.chipT <= 0) {
      this.chipT = 0.2;
      this.paintChips();
      this.syncCommands();
    }
  }
}
