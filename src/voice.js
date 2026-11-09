const LINES = {
  acquired: ['Target acquired.', 'Engaging.', 'Weapons free.'],
  stim: ['Overdrive engaged.', 'Power reserves engaged.'],
  hit: ["I'm hit!", 'Armor is breached!'],
  down: ['Lineguard down!'],
  kill: ['Got one.', 'One less at the breach.'],
  breach: ['Breach! Hold the line!'],
  repair: ['Repairing.', 'On it.'],
  revive: ['Back on your feet, sentry.'],
  contact: ['Contact.', 'Bugs incoming.']
};

let last = 0;
let unlocked = false;

function pickVoice() {
  const list = window.speechSynthesis?.getVoices?.() || [];
  return list.find((v) => /en(-|_)?(US|GB)/i.test(v.lang) && /male|daniel|alex|david|fred/i.test(v.name))
    || list.find((v) => /en/i.test(v.lang))
    || null;
}

export const voice = {
  unlock() { unlocked = true; window.speechSynthesis?.getVoices?.(); },
  say(id) {
    const lines = LINES[id];
    if (!lines) return;
    this.sayRaw(lines[(Math.random() * lines.length) | 0]);
  },
  sayRaw(text) {
    const now = performance.now();
    if (!unlocked || !window.speechSynthesis || now - last < 1100) return;
    last = now;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 0.82;
    u.volume = 0.9;
    const v = pickVoice();
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
};
