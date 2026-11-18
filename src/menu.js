/*
 * Optional layer. The motion of the start menu: the description beside the highlighted order, and
 * the blast doors that open when the menu closes. `#intro` is hidden at once, because the rest of
 * the game reads `intro.hidden` as "the menu is closed"; the doors are a copy that plays on top.
 * The side panel closes the same way: it is gone at once and a copy slides out to the right.
 */
const EXIT_MS = 900;
const PANEL_EXIT_MS = 280;

function orderHint(button) {
  if (button.id === 'btnContinue') return document.getElementById('savedRunInfo');
  const next = button.nextElementSibling;
  return next?.classList.contains('intro__hint') ? next : null;
}

function installReadout(form) {
  const orders = form.querySelector('.menu__orders');
  const readout = document.createElement('div');
  readout.className = 'menu__readout';
  readout.setAttribute('aria-hidden', 'true');
  readout.innerHTML = '<strong></strong><span></span>';
  form.append(readout);
  const [title, text] = readout.children;
  let active = null;

  const fallback = () => [...orders.querySelectorAll('.btn')].find((b) => b.offsetParent !== null);
  const paint = (button) => {
    title.textContent = button?.textContent ?? '';
    text.textContent = button ? orderHint(button)?.textContent ?? '' : '';
  };
  const show = (button) => {
    if (!button || button === active) return;
    active = button;
    orders.querySelectorAll('.is-current').forEach((b) => b.classList.remove('is-current'));
    button.classList.add('is-current');
    paint(button);
    readout.animate?.([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };

  orders.addEventListener('pointerover', (ev) => show(ev.target.closest?.('.btn')));
  orders.addEventListener('focusin', (ev) => show(ev.target.closest?.('.btn')));
  orders.addEventListener('pointerleave', () => {
    if (!orders.contains(document.activeElement)) show(fallback());
  });
  // Saved runs, the daily countdown and Skirmish all rewrite their text after the menu opens.
  new MutationObserver(() => {
    if (!active || active.offsetParent === null) { active = null; show(fallback()); } else paint(active);
  }).observe(orders, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  show(fallback());
  form.classList.add('has-readout');
}

function playExit(intro) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const copy = intro.cloneNode(true);
  copy.removeAttribute('id');
  copy.removeAttribute('hidden');
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  copy.querySelectorAll('[for]').forEach((el) => el.removeAttribute('for'));
  copy.classList.add('is-leaving');
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  document.body.append(copy);
  setTimeout(() => copy.remove(), EXIT_MS);
}

let shadowStyles = null;
function pageStyles() {
  if (!shadowStyles) {
    shadowStyles = new CSSStyleSheet();
    shadowStyles.replaceSync([...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText).join('\n'));
  }
  return shadowStyles;
}

function installPanelExit() {
  const app = document.querySelector('.app');
  const panel = document.getElementById('unitPanel');
  let box = null;
  // Offsets ignore the slide-in transform, so this is where the open panel really sits.
  const measure = () => {
    if (app.classList.contains('is-inspecting') && panel.offsetWidth) {
      box = { left: panel.offsetLeft, top: panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight };
    }
  };
  new ResizeObserver(measure).observe(panel);
  let open = app.classList.contains('is-inspecting');
  new MutationObserver(() => {
    const now = app.classList.contains('is-inspecting');
    if (open && !now && box && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // A closed shadow root keeps the copy's ids and classes out of every document query.
      const host = document.createElement('div');
      host.className = 'panel-leaving';
      host.inert = true;
      host.setAttribute('aria-hidden', 'true');
      Object.assign(host.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      const root = host.attachShadow({ mode: 'closed' });
      root.adoptedStyleSheets = [pageStyles()];
      const copy = panel.cloneNode(true);
      Object.assign(copy.style, { display: 'flex', width: '100%', height: '100%', margin: '0' });
      root.append(copy);
      document.body.append(host);
      setTimeout(() => host.remove(), PANEL_EXIT_MS);
    }
    open = now;
  }).observe(app, { attributes: true, attributeFilter: ['class'] });
}

export function installMenu() {
  installPanelExit();
  const intro = document.getElementById('intro');
  installReadout(document.getElementById('introForm'));
  let open = !intro.hidden;
  new MutationObserver(() => {
    if (open && intro.hidden) playExit(intro);
    open = !intro.hidden;
  }).observe(intro, { attributes: true, attributeFilter: ['hidden'] });
  return { playExit };
}
