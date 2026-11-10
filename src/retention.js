import { captureCheckpoint, readCheckpoint, restoreCheckpoint, SAVE_KEY } from './checkpoints.js';
import { Progression, ACHIEVEMENTS } from './progression.js';
import { beginRunSession } from './scores.js';

const $ = id => document.getElementById(id);
const count = n => n.toLocaleString();

/** Persistent runs and career UI. The simulation never depends on browser storage working. */
export class Retention {
  constructor(game, { getMeta, onContinue, onQuit }) {
    this.game = game; this.getMeta = getMeta; this.onContinue = onContinue; this.onQuit = onQuit;
    this.profile = new Progression();
    const loaded = readCheckpoint();
    this.save = loaded.save; this.active = false; this.restoring = false;
    this.saveOK = true;
    $('introSaveFeedback').textContent = loaded.message;
    $('btnContinue').addEventListener('click', () => this.continueRun());
    $('btnResume').addEventListener('click', () => game.togglePause());
    $('btnPlan').addEventListener('click', () => this.plan());
    $('pausePlanBar').addEventListener('click', () => { this.planning = false; this.syncPause(); });
    $('btnSaveQuit').addEventListener('click', () => this.quit());
    $('btnCareer').addEventListener('click', () => this.openCareer());
    document.querySelectorAll('[data-career]').forEach(b => b.addEventListener('click', () => this.openCareer()));
    $('closeCareer').addEventListener('click', () => $('careerDialog').close());
    $('careerDialog').addEventListener('close', () => {
      if (this.resumeAfterCareer && game.state !== 'defeat' && $('intro').hidden) game.togglePause();
      this.resumeAfterCareer = false;
    });
    $('cosmeticLoadout').addEventListener('click', ev => {
      const b = ev.target.closest('[data-equip]');
      if (b && this.profile.equip(b.dataset.equip, b.dataset.value)) { this.renderCareer(); this.applyCosmetics(); }
    });
    $('cancelReplace').addEventListener('click', () => $('replaceDialog').close());
    $('confirmReplace').addEventListener('click', () => {
      const action = this.pendingNewRun; this.pendingNewRun = null;
      this.resumeAfterReplace = false;
      $('replaceDialog').close(); action?.();
    });
    $('replaceDialog').addEventListener('close', () => {
      this.pendingNewRun = null;
      if (this.resumeAfterReplace && game.state !== 'defeat' && $('intro').hidden) game.togglePause();
      this.resumeAfterReplace = false;
    });
    game.on('checkpoint', () => this.checkpoint());
    game.on('change', () => {
      this.syncPause();
      if (this.active && !this.restoring && ['build', 'brief'].includes(game.state)) this.checkpoint();
      this.applyCosmetics();
    });
    game.on('kill', kills => this.record({ kills }));
    game.on('roundCleared', ({ level, perfect }) => this.record({ cleared: level, ...(perfect ? { perfect: 1 } : {}) }));
    game.on('bossDown', () => this.record({ boss: 1 }));
    game.on('over', () => {
      this.active = false;
      this.save = null;
      try { localStorage.removeItem(SAVE_KEY); } catch {
        $('introSaveFeedback').textContent = 'Browser storage is unavailable. An older checkpoint may remain after reload.';
      }
      this.refresh(); this.syncPause();
    });
    // pagehide also covers mobile tab closure; never replace a checkpoint with mid-combat state.
    window.addEventListener('pagehide', () => this.checkpoint());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.checkpoint(); });
    this.refresh(); this.renderCareer(); this.applyCosmetics();
  }

  begin() {
    this.active = true; this.save = null; this.lastContent = null;
    $('introSaveFeedback').textContent = '';
    this.checkpoint(); this.syncPause();
  }

  plan() { this.planning = true; this.syncPause(); }

  checkpoint() {
    if (!this.active || this.restoring) return;
    const save = captureCheckpoint(this.game, this.getMeta());
    if (!save) return;
    const content = JSON.stringify({ ...save, savedAt: 0 });
    if (content === this.lastContent && this.saveOK) return;
    this.save = save;
    this.lastContent = content;
    this.writeSave(); this.refresh(); this.syncPause();
  }

  writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); this.saveOK = true;
      $('saveFeedback').textContent = '';
    } catch {
      this.saveOK = false;
      $('saveFeedback').textContent = 'Your browser could not save progress. Free browser storage or allow site storage, then try again. Your current game is still open.';
    }
    return this.saveOK;
  }

  quit() {
    this.checkpoint();
    if (!this.save || !this.writeSave()) { this.syncPause(); return; }
    this.active = false;
    this.onQuit();
    this.refresh(); this.syncPause();
    $('btnContinue').focus();
  }

  continueRun() {
    if (!this.save) return;
    const save = this.save;
    this.restoring = true;
    try {
      beginRunSession();
      restoreCheckpoint(this.game, save);
      this.active = true;
      this.onContinue(save);
      $('introSaveFeedback').textContent = '';
      this.syncPause(); this.applyCosmetics();
      $('btnResume').focus();
    } catch (error) {
      $('introSaveFeedback').textContent = error.message;
    } finally { this.restoring = false; }
  }

  requestNewRun(action) {
    if (!this.save) { action(); return; }
    this.pendingNewRun = action;
    this.resumeAfterReplace = $('intro').hidden && !this.game.paused && this.game.state !== 'defeat';
    if (this.resumeAfterReplace) this.game.togglePause();
    $('replaceText').textContent = `This replaces your saved Round ${this.save.level} run (${count(this.save.kills)} kills). Your achievements and cosmetics stay with you.`;
    $('replaceDialog').showModal();
    $('cancelReplace').focus();
  }

  syncPause() {
    const g = this.game;
    const showing = g.paused && $('intro').hidden && g.state !== 'defeat';
    if (!showing) this.planning = false;
    $('pauseMenu').hidden = !showing || this.planning;
    $('pausePlanBar').hidden = !showing || !this.planning;
    document.querySelector('.stage').classList.toggle('is-planning', showing && !!this.planning);
    if (!showing) return;
    $('pauseSaveInfo').textContent = this.save
      ? (['wave', 'raid'].includes(g.state)
        ? `Checkpoint: start of Round ${this.save.level}, ${count(this.save.kills)} kills and ${count(this.save.minerals)} minerals. Save & quit returns here; this round's combat will replay.`
        : `Round ${g.level} planning is saved automatically. Continue restores your defense paused, with a fresh 3-second countdown.`)
      : 'No checkpoint is available yet. Resume to create one.';
    $('btnSaveQuit').disabled = !this.save;
  }

  refresh() {
    $('savedRun').hidden = !this.save;
    $('introBtn').textContent = this.save ? 'New game' : 'Play →';
    $('introBtn').classList.toggle('btn--primary', !this.save);
    if (this.save) {
      $('btnContinue').textContent = `Continue — Round ${this.save.level}`;
      $('savedRunInfo').textContent = `${this.save.player} · ${count(this.save.kills)} kills · resumes paused`;
    }
    const next = this.profile.next;
    const unlocked = Object.keys(this.profile.unlocked).length;
    const teaser = next ? `Next: ${next.name} · ${Math.min(this.profile.stats[next.stat], next.target)}/${next.target} — ${next.detail}`
      : 'All achievements earned. Choose your commander loadout.';
    $('introCareer').textContent = `★ Achievements · ${unlocked}/${ACHIEVEMENTS.length}`;
    $('resultCareer').textContent = `★ ${unlocked}/${ACHIEVEMENTS.length} achievements · ${teaser}`;
  }

  record(values) {
    const earned = this.profile.record(values);
    this.refresh();
    if (earned.length) {
      this.notifications ||= [];
      this.notifications.push(...earned);
      this.showNextNotice();
    }
  }

  showNextNotice() {
    if (this.noticeTimer || !this.notifications?.length) return;
    const a = this.notifications.shift();
    const el = $('achievementNotice');
    el.textContent = `★ ${a.name} unlocked · ${a.reward}`; el.hidden = false;
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null; el.hidden = true; this.showNextNotice();
    }, 4500);
  }

  openCareer() {
    if ($('careerDialog').open) return;
    this.resumeAfterCareer = $('intro').hidden && this.game.state !== 'defeat' && !this.game.paused;
    if (this.resumeAfterCareer) this.game.togglePause();
    this.renderCareer(); $('careerDialog').showModal();
  }

  applyCosmetics() {
    const colour = this.profile.colour === 'default' ? null : this.profile.colour;
    this.game.armyColour = colour;
    for (const m of this.game.gunners) if (!m.blindT && !m.silenceT) m.ring.material.color.set(colour || m.spec.accent);
    $('commanderBadge').textContent = this.profile.badge;
    $('commanderBadge').style.color = colour || '';
  }

  renderCareer() {
    const p = this.profile;
    $('careerSummary').textContent = `${Object.keys(p.unlocked).length} / ${ACHIEVEMENTS.length} earned · Best: ${count(p.stats.kills)} kills · Highest round cleared: ${p.stats.cleared}`;
    const list = $('achievementList'); list.replaceChildren();
    for (const a of ACHIEVEMENTS) {
      const item = document.createElement('article'); item.className = 'achievement';
      item.classList.toggle('is-earned', !!p.unlocked[a.id]); item.dataset.achievement = a.id;
      const title = document.createElement('strong'); title.textContent = `${p.unlocked[a.id] ? '★' : '☆'} ${a.name}`;
      const detail = document.createElement('p'); detail.textContent = a.detail;
      const reward = document.createElement('span'); reward.textContent = a.reward;
      const progress = document.createElement('progress'); progress.max = a.target;
      progress.value = Math.min(p.stats[a.stat], a.target); progress.setAttribute('aria-label', `${a.name} progress`);
      const note = document.createElement('small');
      note.textContent = p.unlocked[a.id] ? `Earned ${new Date(p.unlocked[a.id]).toLocaleDateString()}` : `${progress.value} / ${a.target}`;
      item.append(title, detail, reward, progress, note); list.append(item);
    }
    const loadout = $('cosmeticLoadout'); loadout.replaceChildren();
    for (const type of ['badge', 'colour']) {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend'); legend.textContent = type === 'badge' ? 'Commander badge' : 'Army rings'; group.append(legend);
      const options = [{ value: type === 'badge' ? 'Commander' : 'default', label: type === 'badge' ? 'Commander' : 'Unit colours', unlocked: true },
        ...ACHIEVEMENTS.filter(a => a[type]).map(a => ({ value: a[type], label: a.reward.replace(' army rings', ''), unlocked: !!p.unlocked[a.id] }))];
      for (const option of options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn cosmetic-option';
        b.dataset.equip = type; b.dataset.value = option.value; b.textContent = option.label;
        b.disabled = !option.unlocked; b.setAttribute('aria-pressed', String(p[type] === option.value));
        if (!option.unlocked) b.title = 'Earn the matching achievement to unlock';
        if (type === 'colour' && option.value !== 'default') b.style.setProperty('--swatch', option.value);
        group.append(b);
      }
      loadout.append(group);
    }
    $('careerStorage').textContent = p.storageOK ? 'Saved in this browser on this device.' : 'Browser storage is unavailable or your saved record could not be read. New progress will retry saving.';
  }
}
