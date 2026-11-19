// The hero's gear screen: a dialog that pauses the battle while it is open, so nothing sits over the
// fight. Every string goes in through textContent, because item names come back out of browser storage.
import { HERO, LOOT } from './config.js';
import { SLOTS, gearTotals, heroStats, modLine, xpToNext } from './heroitems.js';

const ICONS = {
  weapon: 'M2 13h13l2-3h5v3l-4 2h-5l-2 5h-3l1-5H2Z',
  blade: 'M20 2l2 2-11 11-2-2ZM6 12l6 6-2 2-2-2-3 3-1-1 3-3-2-2Z',
  armor: 'M12 2l8 3v6c0 6-8 11-8 11S4 17 4 11V5Z',
  relic: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z'
};

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(slot) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[slot]);
  svg.append(path);
  return svg;
}

export class HeroPanel {
  constructor(corps) {
    this.corps = corps;
    this.game = corps.game;
    this.picked = null;
    this.resume = false;
    const d = this.dialog = el('dialog', 'career-dialog hero-dialog');
    d.id = 'heroDialog';
    d.setAttribute('aria-labelledby', 'heroName');
    d.innerHTML = `
      <header class="hero-sheet__head">
        <div><h2 id="heroName"></h2><p id="heroLevel" class="hero-sheet__level"></p></div>
        <button id="heroClose" class="btn btn--primary" type="button">Return to battlefield</button>
      </header>
      <div class="hero-xp" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="100"><i id="heroXpFill"></i><span id="heroXpText"></span></div>
      <dl id="heroStats" class="hero-stats"></dl>
      <section aria-label="Passive skills"><h3 class="hero-skills__title">Passive skills</h3><div id="heroSkills" class="hero-skills"></div></section>
      <div class="hero-gear">
        <section aria-label="Worn gear"><h3>Worn</h3><div id="heroWorn" class="hero-worn"></div></section>
        <section aria-label="Bag"><h3 id="heroBagTitle"></h3><div id="heroBag" class="hero-bag"></div></section>
      </div>
      <section id="heroDetail" class="hero-detail" aria-live="polite"></section>`;
    document.body.append(d);
    d.querySelector('#heroClose').addEventListener('click', () => d.close());
    d.addEventListener('close', () => {
      if (this.resume && this.game.paused && !this.game.ended) this.game.togglePause();
      this.resume = false;
    });
    d.addEventListener('click', event => {
      const cell = event.target.closest('[data-item]');
      if (cell) {
        this.picked = cell.dataset.item;
        this.render();
        this.dialog.querySelector('#heroDetail')?.scrollIntoView({ block: 'nearest' });   // on a phone Wear is below the fold
        return;
      }
      const act = event.target.closest('[data-act]');
      if (act?.dataset.act === 'equip') { corps.wear(this.picked); this.render(); }
      if (act?.dataset.act === 'scrap') { corps.breakDown(this.picked); this.picked = null; this.render(); }
    });
  }

  open() {
    const g = this.game;
    if (this.dialog.open || g.ended || g.pendingEvolution || !document.getElementById('intro').hidden) return false;
    this.resume = !g.paused;
    if (this.resume) g.togglePause();
    this.picked = null;
    this.render();
    this.dialog.showModal();
    return true;
  }

  find(id) {
    const { worn, bag } = this.corps.profile;
    return Object.values(worn).find(i => i?.id === id) || bag.find(i => i.id === id) || null;
  }

  cell(item, slot) {
    const button = el('button', `hero-item${item ? ` is-${item.rarity}` : ' is-empty'}`);
    button.type = 'button';
    if (!item) {
      button.disabled = true;
      button.setAttribute('aria-label', slot ? `${LOOT.slots[slot].name} slot, empty` : 'Empty bag slot');
      if (slot) button.append(icon(slot));
      return button;
    }
    button.dataset.item = item.id;
    button.title = item.name;
    button.setAttribute('aria-label', `${LOOT.rarity[item.rarity].name} ${LOOT.slots[item.slot].name}: ${item.name}`);
    button.setAttribute('aria-pressed', String(item.id === this.picked));
    button.append(icon(item.slot));
    return button;
  }

  render() {
    const { profile, name } = this.corps, $ = id => this.dialog.querySelector('#' + id);
    const { stats, melee, gear } = heroStats(profile, this.game.baseLevel);
    const capped = profile.level >= HERO.maxLevel, need = xpToNext(profile.level);
    $('heroName').textContent = name;
    $('heroLevel').textContent = capped ? `Level ${profile.level} · maximum` : `Level ${profile.level}`;
    $('heroXpFill').style.width = capped ? '100%' : `${Math.min(100, profile.xp / need * 100)}%`;
    $('heroXpText').textContent = capped ? 'Fully trained' : `${Math.floor(profile.xp).toLocaleString()} / ${need.toLocaleString()} XP`;
    this.dialog.querySelector('.hero-xp').setAttribute('aria-valuenow', String(capped ? 100 : Math.round(profile.xp / need * 100)));

    const rows = [['Health', Math.round(stats.hp)], ['Gun damage', Math.round(stats.damage)], ['Melee damage', Math.round(stats.damage * melee)],
      ['Attacks', `${(1 / stats.attackSpeed).toFixed(2)}/s`], ['Range', stats.range.toFixed(1)], ['Armor', stats.armor],
      ['Critical', `${gear.crit}%`], ['Speed', stats.moveSpeed.toFixed(2)]];
    $('heroStats').replaceChildren(...rows.flatMap(([k, v]) => {
      const box = el('div');
      box.append(el('dt', '', k), el('dd', '', String(v)));
      return [box];
    }));

    $('heroSkills').replaceChildren(...this.corps.skillSheet().map(skill => {
      const card = el('article', 'hero-skill'), head = el('div', 'hero-skill__head');
      head.append(el('strong', '', skill.name), el('span', skill.state === 'Ready' ? 'is-up' : '', skill.state));
      card.append(head, el('p', '', skill.text), el('small', '', `Automatic · resets in ${skill.every}s`));
      return card;
    }));

    $('heroWorn').replaceChildren(...SLOTS.map(slot => {
      const box = el('div', 'hero-slot');
      box.append(this.cell(profile.worn[slot], slot), el('span', '', LOOT.slots[slot].name));
      return box;
    }));
    $('heroBagTitle').textContent = `Bag ${profile.bag.length} / ${HERO.bag}`;
    const bag = [];
    for (let i = 0; i < HERO.bag; i++) bag.push(this.cell(profile.bag[i] || null));
    $('heroBag').replaceChildren(...bag);
    this.renderDetail($('heroDetail'));
  }

  renderDetail(box) {
    const item = this.picked && this.find(this.picked);
    if (!item) {
      const powers = [...gearTotals(this.corps.profile.worn).powers].map(id => LOOT.legendaries[id]);
      box.replaceChildren(el('p', 'hero-detail__hint', powers.length
        ? powers.map(p => `${p.name}: ${p.text}`).join(' ')
        : 'Bosses drop gear. Walk your hero over it or click it. Select an item to see what it does.'));
      return;
    }
    const profile = this.corps.profile, worn = profile.worn[item.slot], wearing = worn?.id === item.id;
    const title = el('h3', `is-${item.rarity}`, item.name);
    const kind = el('p', 'hero-detail__kind', `${LOOT.rarity[item.rarity].name} ${LOOT.slots[item.slot].name} · from round ${item.round}`);
    const list = el('ul', 'hero-detail__mods');
    for (const [id, value] of Object.entries(item.mods)) {
      const row = el('li', '', modLine(id, value));
      if (worn && !wearing) {
        const diff = Number((value - (worn.mods[id] || 0)).toFixed(1));
        if (diff) row.append(el('span', diff > 0 ? 'is-up' : 'is-down', ` (${diff > 0 ? '+' : ''}${diff})`));
      }
      list.append(row);
    }
    if (worn && !wearing) {
      for (const [id, value] of Object.entries(worn.mods)) {
        if (!(id in item.mods)) list.append(el('li', 'is-down', `Loses ${modLine(id, value)}`));
      }
    }
    const parts = [title, kind, list];
    if (item.power) parts.push(el('p', 'hero-detail__power', LOOT.legendaries[item.power].text));
    if (worn?.power && !wearing && worn.power !== item.power) parts.push(el('p', 'is-down', `Loses ${worn.name}: ${LOOT.legendaries[worn.power].text}`));
    if (!wearing) {
      const row = el('div', 'hero-detail__acts');
      const wear = el('button', 'btn btn--primary', worn ? `Wear instead of ${worn.name}` : 'Wear');
      wear.type = 'button'; wear.dataset.act = 'equip';
      const brk = el('button', 'btn', `Scrap · +${LOOT.rarity[item.rarity].scrapXp} XP`);
      brk.type = 'button'; brk.dataset.act = 'scrap';
      row.append(wear, brk);
      parts.push(row);
    }
    box.replaceChildren(...parts);
  }
}
