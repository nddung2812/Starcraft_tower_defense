import * as THREE from 'three';
import { BUILD, ZERG_INFO, BREEDS, ECON, UNITS, AIR_STRIKE, OVERDRIVE, BASE_UPGRADE, BASE_LASER, applyBaseUpgrade } from './config.js';
import { buildZergling, buildWall, buildCore, buildHatchery } from './models.js';
import { makeModel, loadedModels } from './assets.js';
import { EVOLUTIONS, EVOLUTION_RULES } from './config.js';
import { evolutionDescription } from './evolutions.js';

const $ = (id) => document.getElementById(id);

/* A tiny second renderer that spins the real 3D model in the inspector. */
class Portrait {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
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
    this.dirty = true;
    if (this.current) this.pivot.remove(this.current);
    const model = (k) => makeModel(k, tier, { rim: false });
    if (kind === 'core' || kind === 'hive') {
      this.current = kind === 'core' ? buildCore() : buildHatchery();
      this.frame(this.current);
    } else if (['marine', 'scorcher', 'deadeye', 'mender'].includes(kind)) {
      this.current = model(kind);
      this.camera.position.set(0, 0.72, 2.0);
      this.camera.lookAt(0, 0.5, 0);
    } else if (kind === 'goliath') {
      this.current = model('goliath');
      this.camera.position.set(1.5, 1.2, 3.3);
      this.camera.lookAt(0.05, 0.7, 0);
    } else if (kind === 'falcon') {
      this.current = model('falcon');
      this.camera.position.set(2.0, 1.4, 3.2);
      this.camera.lookAt(0.1, 0.15, 0);
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
    if (!this.renderer.domElement.getClientRects().length) return;
    this.pendingTime = (this.pendingTime || 0) + dt;
    if (this.pendingTime < 1 / 8 && !this.dirty) return;
    dt = this.pendingTime;
    this.pendingTime = 0;
    this.dirty = false;
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
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (this.width === w && this.height === h && this.renderer.getPixelRatio() === ratio) return;
    this.width = w; this.height = h;
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.dirty = true;
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
  { id: 'stim', label: 'Overdrive', key: 'F' },
  { id: 'promote', label: 'Promote', key: 'U' },
  { id: 'salvage', label: 'Salvage', key: 'X' },
  { id: 'army', label: 'All Army', key: 'F2' },
  { id: 'scv', label: 'Patch Rig', key: 'F1' },
  { id: 'wave', label: 'Last Alert', key: '' }
];

/** Render thumbnails from the same models used on the battlefield, once per load. */
function buildIcons(renderer) {
  const previousSize = renderer.getSize(new THREE.Vector2());
  const previousRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(128, 96, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbce6ff, 0x354052, 2));
  const key = new THREE.DirectionalLight(0xfff0d4, 4);
  key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x77cfff, 3);
  rim.position.set(-3, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(34, 128 / 96, 0.01, 100);
  const icons = {};
  try {
    for (const kind of Object.keys(BUILD)) {
      const model = kind === 'wall' ? buildWall() : makeModel(kind, 0, { rim: false });
      scene.add(model);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(17)) * 1.08;
      camera.position.copy(center).addScaledVector(new THREE.Vector3(1.6, 1.1, 2).normalize(), distance);
      camera.lookAt(center);
      // Fit the projected bounding box so narrow infantry and wide vehicles both read well.
      const inverseView = camera.quaternion.clone().invert();
      const tangent = Math.tan(THREE.MathUtils.degToRad(17));
      let fittedDistance = 0;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseView);
            fittedDistance = Math.max(fittedDistance, corner.z + Math.abs(corner.y) / tangent, corner.z + Math.abs(corner.x) / (tangent * camera.aspect));
          }
        }
      }
      camera.position.copy(center).addScaledVector(new THREE.Vector3(1.6, 1.1, 2).normalize(), fittedDistance * 1.05);
      renderer.render(scene, camera);
      // Trim transparent margins so the unit, not empty padding, fills its small button.
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 128; thumbnail.height = 96;
      const ctx = thumbnail.getContext('2d');
      ctx.drawImage(renderer.domElement, 0, 0);
      const pixels = ctx.getImageData(0, 0, 128, 96).data;
      let left = 128, right = -1, top = 96, bottom = -1;
      for (let y = 0; y < 96; y++) {
        for (let x = 0; x < 128; x++) {
          if (pixels[(y * 128 + x) * 4 + 3] < 12) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (right >= left && bottom >= top) {
        const width = right - left + 1, height = bottom - top + 1;
        const scale = Math.min(124 / width, 92 / height);
        ctx.clearRect(0, 0, 128, 96);
        ctx.drawImage(renderer.domElement, left, top, width, height,
          (128 - width * scale) / 2, (96 - height * scale) / 2, width * scale, height * scale);
      }
      icons[kind] = thumbnail.toDataURL('image/png');
      scene.remove(model);
    }
  } finally {
    renderer.setPixelRatio(previousRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
  }
  return icons;
}

const CHIP = { marine: 'M', goliath: 'G', tank: 'H', falcon: 'V', scorcher: 'C', deadeye: 'D', mender: '+', scv: 'S' };

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

    const icons = buildIcons(this.portrait.renderer);
    $('buildBar').innerHTML = Object.values(BUILD).map((b) => `
      <button class="card" data-build="${b.id}" title="${b.name} · ${b.cost} minerals (${b.key})" aria-label="Build ${b.name}, ${b.cost} minerals, shortcut ${b.key}">
        <img class="card__icon" src="${icons[b.id]}" alt="" draggable="false">
        <span class="card__name">${b.name}</span>
        <span class="card__cost">${b.cost}</span>
        <span class="card__key">${b.key}</span>
      </button>`).join('');

    this.newCards = new Set();
    this.syncRoster();
    $('btnRedeploy').addEventListener('click', () => game.emit('cmd', 'redeploy'));

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

    $('btnLocateBoss').addEventListener('click', () => {
      const boss = game.assault.boss;
      if (!boss || boss.dead) return;
      game.focus = boss;
      game.stage.focus.set(boss.x, 0, boss.z);
      game.fx.ring({ x: boss.x, z: boss.z }, 2.5, 0xff684b);
    });
    $('btnBaseUpgrade').addEventListener('click', () => game.upgradeBase());
    $('btnLaser').addEventListener('click', () => game.emit('laser'));
    $('btnLocateHive').addEventListener('click', () => {
      const hive = game.hives.find(h => !h.dead);
      if (hive) game.stage.focus.set(hive.x, 0, hive.z);
    });
    $('btnPause').addEventListener('click', () => game.togglePause());
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

    game.on('bossDown', ({ rewards }) => {
      const silver = rewards.filter(r => r.boxType === 'silver').length;
      const gold = rewards.length - silver;
      this.toast('Upgrades automatically applied', `${silver} silver (next 3 rounds) · ${gold} gold (permanent this run) · all Lineguards`);
    });
    $('evolutionDialog').addEventListener('cancel', event => event.preventDefault());
    $('evolutionChoices').addEventListener('click', event => {
      const button = event.target.closest('[data-evolution]');
      if (button) game.chooseEvolution(button.dataset.evolution);
    });
    game.on('change', () => this.syncEvolutions());
    game.on('evolved', ({ id, rank }) => this.toast(`${EVOLUTIONS.find(e => e.id === id).name} · Rank ${rank}`,
      'Active for the rest of this run. Current and future units inherit this evolution.', 'unlock'));
    game.on('change', () => this.sync());
    game.on('raid', () => {
      clearTimeout(this.raidNoticeTimer);
      $('raidNotice').hidden = false;
      this.raidNoticeTimer = setTimeout(() => { $('raidNotice').hidden = true; }, 2000);
    });
    game.on('unlock', (u) => this.toast(`Armory unlocked — ${u.name}`, u.effect, 'unlock'));
    game.on('unitUnlocked', (b) => {
      this.newCards.add(b.id);
      this.callout('New unit unlocked', `${b.name} · press ${b.key} · ${b.cost} minerals`, 'unit');
      this.toast(`${b.name} unlocked (${b.key})`, b.desc, 'unlock', 9000);
    });
    game.on('streak', (t) => this.callout(`${t.name} ×${t.streak}`, `Kill streak · +${t.bonus} minerals`));
    game.on('supply', () => {
      this.callout('Supply drop', 'Click the crate or walk a unit onto it', 'supply');
      this.toast('Supply drop near your base', 'Gold marker on the minimap. It leaves in 18 seconds.', 'supply');
    });
    game.on('supplyCollected', ({ crate, recharge }) => this.toast(`Supplies recovered · +${crate.value} minerals`,
      recharge ? 'Air strike recharged.' : 'More drops arrive while the swarm is attacking.', 'ok', 3200));
    game.on('redeployed', ({ placed, waiting }) => this.toast(`Army redeployed · ${placed} unit${placed === 1 ? '' : 's'}`,
      waiting ? `${waiting} more waiting for minerals or space. Press Z again.` : 'Promotions kept. Move them into position.', 'ok'));
    game.on('brief', (card) => {
      this.say(`<b>${card.title}.</b> ${card.body}`);
      // A unit unlocked this round already owns the centre of the screen.
      if (game.level > 1 && !Object.values(BUILD).some(b => b.unlock === game.level)) this.callout(`Round ${game.level}`, card.title, 'unit');
    });
    game.on('hold', (card) => this.say(`<b>${card.kicker}.</b> ${card.body}`));

    this.showUnit('marine', 0, null);
  }

  syncEvolutions() {
    const g = this.game, dialog = $('evolutionDialog');
    if (g.pendingEvolution && !dialog.open) {
      $('evolutionBoss').textContent = `${g.pendingEvolution.bossName} defeated · Round ${g.pendingEvolution.level}`;
      $('evolutionChoices').replaceChildren(...EVOLUTIONS.map(e => {
        const rank = (g.evolutions[e.id] || 0) + 1;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'evolution-card'; button.dataset.evolution = e.id;
        button.style.setProperty('--evolution-color', e.color);
        button.innerHTML = `<span class="evolution-card__art" aria-hidden="true">${e.icon}</span>
          <span class="evolution-card__rank">${rank === 1 ? 'UNLOCK EVOLUTION' : `UPGRADE TO RANK ${rank}`}</span>
          <strong>${e.name}</strong><span class="evolution-card__unit">${e.unit}</span>
          <span class="evolution-card__description">${evolutionDescription(e.id, rank)}</span>
          <span class="evolution-card__flavor">${e.flavor}</span>
          <span class="evolution-card__choose">${rank === 1 ? 'Choose evolution' : 'Strengthen evolution'} →</span>`;
        return button;
      }));
      dialog.showModal();
    } else if (!g.pendingEvolution && dialog.open) dialog.close();
    const owned = EVOLUTIONS.filter(e => g.evolutions[e.id]);
    $('evolutionLoadout').hidden = !owned.length;
    $('evolutionSummary').textContent = `Army evolutions · ${owned.reduce((sum, e) => sum + g.evolutions[e.id], 0)} chosen`;
    $('evolutionList').replaceChildren(...owned.map(e => {
      const row = document.createElement('p');
      const title = document.createElement('strong');
      title.style.color = e.color; title.textContent = `${e.name} · Rank ${g.evolutions[e.id]}`;
      const description = document.createElement('span');
      description.textContent = evolutionDescription(e.id, g.evolutions[e.id]);
      row.append(title, description); return row;
    }));
  }

  setPlacing(id) {
    if (id) this.newCards.delete(id);
    document.querySelectorAll('[data-build]').forEach((b) => {
      b.classList.toggle('card--on', b.dataset.build === id);
      b.classList.toggle('card--new', this.newCards.has(b.dataset.build));
    });
  }

  /** Locked specialists stay off the build bar until their round, so new players start with a short list. */
  syncRoster() {
    const g = this.game;
    let shown = 0;
    document.querySelectorAll('[data-build]').forEach((b) => {
      const open = g.isUnlocked(b.dataset.build);
      b.hidden = !open;
      if (!open) this.newCards.delete(b.dataset.build);
      b.classList.toggle('card--new', this.newCards.has(b.dataset.build));
      if (open) shown++;
    });
    $('buildBar').dataset.cols = String(Math.max(3, Math.ceil(shown / 2)));
    $('buildBar').style.setProperty('--cards', String(Math.max(6, shown)));
  }

  /** Big centre-screen moment: streaks, new units, supply drops. One at a time. */
  callout(title, note, kind = 'streak') {
    const el = $('callout');
    $('calloutTitle').textContent = title;
    $('calloutNote').textContent = note;
    el.className = `callout callout--${kind}`;
    el.hidden = true;
    void el.offsetWidth;   // restart the pop animation
    el.hidden = false;
    clearTimeout(this.calloutTimer);
    this.calloutTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  showUnit(kind, tier, entity) {
    this.inspect = { kind, tier, entity };
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('tab--active', b.dataset.unit === kind));
    document.querySelector('.panel').dataset.faction = kind;
    this.portrait.show(entity?.kind === 'core' || entity?.kind === 'hive' ? entity.kind : kind, tier);
    this.renderStats();
  }

  renderStats() {
    const { kind, tier, entity } = this.inspect;
    const g = this.game;

    if (entity?.kind === 'core' || entity?.kind === 'hive') {
      const hive = entity.kind === 'hive';
      $('pName').textContent = hive ? 'Rift Hive' : `Ridge Relay · Upgrade ${g.baseLevel}`;
      $('pRole').textContent = hive ? `Bonus target · ${entity.reward} minerals` : 'Army research / piercing laser';
      $('pFaction').textContent = hive ? 'The Rift Brood' : 'Ridgewatch Compact';
      $('pBio').textContent = hive ? 'Destroy this enemy base to stop its reinforcements and earn minerals. Attack (A) sends the whole army. After the swarm is cleared, you have up to 60 seconds to finish any surviving bases before the next round.' : 'Upgrade the base to boost every current and future unit. Charge the laser for 90 seconds, then aim one powerful piercing shot. Upgrades and energy carry across rounds.';
      $('pQuote').textContent = '';
      $('stats').innerHTML = statRow('Hit Points', Math.ceil(entity.hp) + ' / ' + entity.maxHp, entity.hp / entity.maxHp, '#5ef08a');
    } else if (entity?.kind === 'scv' || entity?.kind === 'bunker') {
      const bunker = entity.kind === 'bunker';
      $('pName').textContent = bunker ? 'Bunker' : 'Patch Rig';
      $('pRole').textContent = bunker ? `${entity.garrison.length} / 2 garrisoned` : (entity.dead ? 'Destroyed' : 'Field Repair');
      $('pFaction').textContent = 'Ridgewatch Compact';
      $('pBio').textContent = bunker
        ? 'Select Lineguards, then right-click the bunker. They walk in and fire through the slit, with extra armour, along its facing.'
        : 'Right-click a damaged wall or a downed Lineguard to fix it, or the ground to move. Keep it out of the breach.';
      $('pQuote').textContent = bunker ? '"Hold this corridor."' : '"Tools ready. Keep me covered."';
      $('stats').innerHTML = statRow('Hit Points', Math.ceil(entity.hp) + ' / ' + entity.maxHp, entity.hp / entity.maxHp, '#5ef08a');
    } else if (UNITS[kind]) {
      const spec = UNITS[kind];
      const base = spec.tiers[tier];
      const s = { hp: base.hp, damage: base.damage, attackSpeed: base.attackSpeed, range: base.range, armor: spec.info.armor, moveSpeed: spec.speed };
      if (entity) {
        Object.assign(s, entity.stats);
        s.range = entity.attackRange;
        if (entity.bunker?.lastStandT > 0) s.attackSpeed /= EVOLUTION_RULES.standFireRate;
      }
      else {
        if (spec.armory) for (const u of g.marineUpgrades) u.apply(s);
        applyBaseUpgrade(s, g.baseLevel);
      }
      const shots = spec.shots;

      $('pName').textContent = spec.info.name;
      $('pRole').textContent = spec.tiers.length > 1
        ? `${base.rank} · Tier ${tier + 1} of ${spec.tiers.length}`
        : spec.info.role;
      $('pFaction').textContent = spec.info.faction;
      $('pBio').textContent = spec.info.bio + (g.isUnlocked(kind) ? '' : ` Unlocks in Round ${BUILD[kind].unlock}.`);
      const evolution = kind === 'tank' ? 'siege' : kind === 'goliath' ? 'chain' : null;
      if (evolution && g.evolutions[evolution]) {
        $('pBio').textContent += ` ${EVOLUTIONS.find(e => e.id === evolution).name} · Rank ${g.evolutions[evolution]}. ${evolutionDescription(evolution, g.evolutions[evolution])}`;
        if (kind === 'tank' && entity) $('pRole').textContent += entity.siegeDeployed ? ' · SIEGE DEPLOYED' : ' · MOBILE';
      }
      $('pQuote').textContent = spec.info.quote;
      const accent = spec.info.accent;
      $('stats').innerHTML =
        statRow('Hit Points', Math.round(s.hp), s.hp / 380, '#5ef08a') +
        statRow(spec.heals ? 'Heal' : 'Damage', shots > 1 ? Number(s.damage.toFixed(1)) + ' ×2' : Number(s.damage.toFixed(1)), (s.damage * shots) / 50, spec.heals ? '#7dffb0' : '#f0b23c') +
        statRow('Armour', s.armor, s.armor / 4, '#9aa3a8') +
        statRow(spec.heals ? 'Heal Rate' : 'Fire Rate', (1 / s.attackSpeed).toFixed(2) + '/s', (1 / s.attackSpeed) / 3.5, '#f0b23c') +
        statRow('Range', s.range.toFixed(1) + ' tiles', s.range / 8, accent) +
        (spec.splash ? statRow('Blast', (spec.splash + (entity?.siegeDeployed ? EVOLUTION_RULES.siegeSplash : 0)).toFixed(2) + ' tiles', spec.splash / 2, accent) : '') +
        statRow('Targets', spec.heals ? 'Allies' : spec.flame ? 'Ground · cone' : spec.pierce ? 'Largest · ignores armour' : spec.targetsAir === false ? 'Ground' : 'Ground + Air', 1, accent) +
        statRow('Move Speed', spec.mobile ? s.moveSpeed.toFixed(1) + ' t/s' : 'Emplaced', s.moveSpeed / 3, accent);
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
      stim.disabled = !g.stimUnlocked || e.dead || e.downed || e.silenceT > 0 || e.stimT > 0 || e.hp <= OVERDRIVE.hpCost;
      stim.textContent = g.stimUnlocked ? (e.stimT > 0 ? 'Overdriving' : 'Overdrive (F)') : 'Overdrive locked · 20 kills';
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
    this.updateAssault();
    this.syncBase();
    $('rKills').textContent = g.kills;
    this.syncRoster();
    this.syncStreak();
    const pct = Math.max(0, g.core.hp / g.core.maxHp);
    $('rCore').textContent = Math.ceil(pct * 100) + '%';
    $('rCore').style.color = pct > 0.5 ? '' : pct > 0.25 ? '#f0b23c' : '#ff5a4a';

    $('treasure').hidden = !g.treasureLoot.length;
    const silver = g.treasureLoot.filter(item => item.boxType === 'silver').length;
    const gold = g.treasureLoot.length - silver;
    $('treasureSummary').textContent = `Auto upgrades · ▣ ${silver} silver · ▣ ${gold} gold`;
    const lootCounts = new Map();
    for (const item of g.treasureLoot) {
      const key = `${item.boxType}:${item.id}:${item.expiresAfterLevel}`;
      const entry = lootCounts.get(key);
      if (entry) entry.count++;
      else lootCounts.set(key, { item, count: 1 });
    }
    $('treasureNote').replaceChildren(...[...lootCounts.values()].map(({ item, count }) => {
      const row = document.createElement('div');
      row.className = `treasure__item treasure__item--${item.boxType}`;
      const duration = item.boxType === 'gold' ? 'Permanent this run' : `Active through Round ${item.expiresAfterLevel}`;
      row.textContent = `▣ ${item.boxType === 'gold' ? 'Gold' : 'Silver'} · ${item.effect} ×${count} · ${duration}`;
      return row;
    }));
    const next = g.nextArmory;
    $('armoryLabel').textContent = next ? next.name : 'All tech unlocked';
    $('armoryNote').textContent = next ? `${next.effect} · ${g.kills}/${next.kills} kills` : 'Maximum loadout';
    $('armoryFill').style.width = next
      ? Math.min(100, (g.kills / next.kills) * 100) + '%'
      : '100%';

    $('btnPause').disabled = g.state === 'defeat' || !$('intro').hidden;
    $('btnPause').title = `${g.paused ? 'Resume' : 'Pause'} game (Space)`;
    $('btnPause').textContent = g.paused ? 'Resume' : 'Pause';
    $('btnPause').setAttribute('aria-pressed', String(g.paused));
    this.syncAir();
    $('btnScv').hidden = !g.scv?.dead;
    $('btnScv').disabled = g.minerals < ECON.scvCost;
    $('btnScv').textContent = `Rebuild Patch Rig · ${ECON.scvCost}`;

    document.querySelectorAll('[data-build]').forEach((b) => {
      b.classList.toggle('card--poor', g.minerals < BUILD[b.dataset.build].cost);
    });

    this.renderStats();
    this.syncCommands();
  }

  /** Multi-select grid in the inspector: one chip per unit, with its health. */
  setSelection(list) {
    this.selList = list.slice(0, 24);
    const grid = $('selGrid');
    grid.hidden = list.length < 2;
    $('selCount').textContent = list.length > 1 ? `${list.length} selected` : '';
    grid.innerHTML = list.length < 2 ? '' : this.selList.map((e, i) => `
      <button class="chip chip--${e.kind}" data-i="${i}" title="${e.kind === 'scv' ? 'Patch Rig' : UNITS[e.kind]?.info.name || e.kind}">
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
    const primary = g.selected;
    const fighting = ['wave', 'brief', 'raid'].includes(g.state);
    const set = (id, on, label) => {
      const b = document.querySelector(`[data-cmd="${id}"]`);
      if (!b) return;
      b.disabled = !on;
      if (label) b.querySelector('.cmd__label').textContent = label;
    };
    set('attack', g.state !== 'defeat' && !g.pendingEvolution && g.gunners.some(u => !u.dead && !u.downed));
    document.querySelector('[data-cmd="attack"]').title = 'Send the whole army to destroy enemy bases (A). Shift+A: attack-move selected units to a clicked point.';
    set('stop', units.length > 0);
    set('air', fighting && g.airStrikeReady, fighting && !g.airStrikeReady ? `Air ${Math.ceil(g.airStrikeCd)}s` : 'Air Strike');
    set('stim', g.stimUnlocked && units.some((u) => u.kind === 'marine' && u.stimT <= 0 && u.silenceT <= 0 && u.hp > OVERDRIVE.hpCost));
    const cost = primary && UNITS[primary.kind] && !primary.downed ? primary.upgradeCost : null;
    set('promote', cost != null && g.minerals >= cost);
    const mine = primary && (UNITS[primary.kind] || primary.kind === 'wall' || primary.kind === 'bunker');
    set('salvage', g.state === 'build' && !!mine);
    set('army', g.gunners.some(unitLike));
    set('scv', !!g.scv && !g.scv.dead);
    set('wave', fighting && !!g.lastAlert, 'Last Alert');
  }

  hideReel() { this.say(''); }

  /** Game over: your run, and the leaderboard with your row highlighted. */
  showBanner({ name, score, level, kills, rank, online, scores, best, daily }) {
    $('bannerTitle').textContent = 'Outpost Overrun';
    $('bannerTitle').classList.remove('is-win');
    const place = rank ? ` · #${rank} ${online ? 'worldwide' : 'on this device'}` : '';
    const streak = this.game.bestStreak >= 10 ? ` Longest streak: ×${this.game.bestStreak}.` : '';
    $('bannerText').textContent = `${daily ? `Daily #${daily} · ` : ''}${name}, you killed ${score.toLocaleString()} bugs and held to level ${level}${place}. Your best: ${best.toLocaleString()} kills.${streak}`;
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

  /** A short-lived card above the build dock. Kept to three so the battlefield stays clear. */
  toast(title, note = '', kind = '', ms = 4500) {
    this.say(`<b>${title}.</b> ${note}`);
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast${kind ? ` toast--${kind}` : ''}`;
    const head = document.createElement('b'); head.textContent = title;
    const body = document.createElement('span'); body.textContent = note;
    el.append(head, body);
    box.append(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), ms);
  }

  syncStreak() {
    const g = this.game, el = $('rStreak');
    el.hidden = g.streak < 5;
    if (!el.hidden) el.textContent = `×${g.streak}`;
  }

  setAirArmed(on) {
    $('btnAir').classList.toggle('btn--armed', !!on);
    this.setArmed('air', on);
  }

  syncAir() {
    const g = this.game;
    const btn = $('btnAir');
    const fighting = ['wave', 'brief', 'raid'].includes(g.state);
    const ready = g.airStrikeReady;
    btn.disabled = !fighting || !ready;
    if (!fighting) btn.textContent = 'Strike';
    else if (!ready) btn.textContent = `Strike ${Math.ceil(g.airStrikeCd)}s`;
    else btn.textContent = 'Strike';
  }


  syncBase() {
    const g = this.game;
    $('baseControls').hidden = !$('intro').hidden || g.state === 'defeat';
    $('btnBaseUpgrade').textContent = `Upgrade base · ${g.baseUpgradeCost} minerals`;
    $('btnBaseUpgrade').disabled = g.minerals < g.baseUpgradeCost || g.state === 'defeat';
    const bonus = Math.round(g.baseLevel * BASE_UPGRADE.bonus * 100);
    $('baseBonus').textContent = `Lv ${g.baseLevel} · +${bonus}% HP / damage`;
    $('btnBaseUpgrade').title = 'Each level: +15% health for all units, +15% damage for all combat units. Applies to current and future units; lasts for this run.';
    const aiming = $('btnLaser').getAttribute('aria-pressed') === 'true';
    $('btnLaser').textContent = aiming ? 'Cancel laser aim' : g.laserReady ? 'Fire laser (L)' : `Laser · ${Math.floor(g.laserCharge / BASE_LASER.chargeTime * 100)}%`;
    $('btnLaser').disabled = g.paused || !g.laserReady || !['wave', 'raid'].includes(g.state);
    $('laserHint').textContent = aiming ? 'Click a direction from your base · Esc cancels' : g.laserReady ? 'Ready · 600 damage through the enemy line' : `${Math.ceil(BASE_LASER.chargeTime - g.laserCharge)}s to charge · one piercing shot`;
    const waiting = g.lastArmy?.length || 0;
    $('redeployBox').hidden = !waiting || !['build', 'brief', 'wave'].includes(g.state);
    if (waiting) {
      const cost = g.lastArmy.reduce((sum, u) => sum + u.invested, 0);
      $('btnRedeploy').textContent = `Redeploy army (Z) · ${waiting} unit${waiting === 1 ? '' : 's'}`;
      $('redeployHint').textContent = `${cost} minerals · same units and ranks at the new defense line`;
    }
    $('raidHud').hidden = g.state !== 'raid';
    if (g.state !== 'raid') {
      clearTimeout(this.raidNoticeTimer);
      $('raidNotice').hidden = true;
    }
    if (g.state === 'raid') {
      const remaining = g.hives.filter(h => !h.dead);
      $('raidObjective').textContent = 'OPTIONAL OBJECTIVE';
      $('raidStatus').textContent = remaining.length ? `Destroy hives: +${remaining[0].reward} minerals each · Earned ${g.raidEarned}` : `Hives destroyed! +${g.raidEarned} minerals`;
      $('btnLocateHive').disabled = !remaining.length;
    }
  }

  updateAssault() {
    const g = this.game, a = g.assault;
    const playing = $('intro').hidden && g.state !== 'defeat';
    $('battleReadouts').hidden = !playing || (!a.plan && !g.treasureLoot.length && !Object.keys(g.evolutions).length);
    $('assaultHud').hidden = !playing || !a.plan;
    if (!a.plan || !playing) return;
    const ratio = a.boss ? Math.max(0, a.boss.hp / a.boss.maxHp) : 1;
    $('bossKicker').textContent = `MILESTONE / ${g.level} · ${a.cleared ? 'DEFEATED' : a.enraged ? 'ENRAGED' : a.plan.difficulty + ' BOSS'}`;
    $('bossName').textContent = a.plan.name;
    $('bossHealth').textContent = a.boss ? `${Math.ceil(a.boss.hp).toLocaleString()} / ${a.boss.maxHp.toLocaleString()}` : 'INBOUND';
    $('bossFill').style.width = (ratio * 100) + '%';
    $('bossMeter').setAttribute('aria-valuenow', Math.round(ratio * 100));
    $('assaultHud').classList.toggle('is-enraged', a.enraged && !a.cleared);
    $('assaultHud').classList.toggle('is-cleared', a.cleared);
    $('bossStatus').textContent = a.status;
    $('btnLocateBoss').disabled = !a.boss || a.boss.dead;
    const mark = a.marks[0];
    $('bossAttack').textContent = a.cleared ? 'AIR STRIKE RECHARGED'
      : mark ? `${mark.spell ? mark.spell.toUpperCase() : "IMPACT"} / ${Math.max(0, mark.t).toFixed(1)}s · MOVE!`
      : !a.boss ? (a.pending && g.state === 'wave' ? `CONTACT / ${Math.max(0, 6 - a.elapsed).toFixed(1)}s` : 'PREPARE YOUR DEFENSE')
      : `BOMBARDMENT / ${Math.ceil(a.strikeT)}s · MAGIC / ${Math.ceil(a.spellT)}s`;
    $('bossAdds').textContent = a.boss && !a.cleared ? `REINFORCEMENTS / ${Math.ceil(a.reinforceT)}s` : `BOUNTY / +${a.plan.reward}`;
  }

  update(dt) {
    this.portrait.update(dt);
    this.pendingHudTime = (this.pendingHudTime || 0) + dt;
    if (this.pendingHudTime < 0.1) return;
    dt = this.pendingHudTime;
    this.pendingHudTime = 0;
    this.updateAssault();
    this.syncBase();
    const g = this.game;
    const pct = Math.max(0, g.core.hp / g.core.maxHp);
    $('rCore').textContent = Math.ceil(pct * 100) + '%';
    $('rCore').style.color = pct > 0.5 ? '' : pct > 0.25 ? '#f0b23c' : '#ff5a4a';
    $('rMinerals').textContent = g.minerals;
    $('rKills').textContent = g.kills;
    this.syncStreak();
    this.syncAir();
    this.chipT -= dt;
    if (this.chipT <= 0) {
      this.chipT = 0.2;
      this.paintChips();
      this.syncCommands();
      if (this.inspect.entity && (this.inspect.entity.evolutionRank || this.inspect.entity.bunker?.evolutionRank)) this.renderStats();
    }
  }
}
