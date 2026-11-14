/*
 * Why you are holding.
 *
 * Ember Reach is evacuating behind Outpost 29 and nobody is coming to relieve it. Every round
 * the line holds, another convoy gets out. None of this touches combat or the score (score is
 * still kills): it gives the round counter a meaning, one radio line a round, and a result
 * that reads as something you did rather than something you lost.
 */

/** People aboard the convoy that leaves when `round` is cleared. Later convoys are bigger. */
export const convoySize = (round) => 120 + 30 * round;

/** Everyone who got out because `rounds` rounds were held. */
export function evacuated(rounds) {
  const n = Math.max(0, Math.floor(rounds));
  return 120 * n + 15 * n * (n + 1);
}

/* One line from Ember Control as each round opens. The first ten tell it in order. */
const SCRIPT = [
  'Outpost 29, this is Ember Control. The first convoy is loading. Buy us time.',
  'Convoy one is on the road. Eleven districts still to clear. Hold the line.',
  'Scouts report spitters in the column. Keep your people behind cover.',
  'The relief column has turned back. You are all we have, Twenty-Nine.',
  'They are in the air now. Watch the sky over the relay.',
  'The lower districts are half empty. Every round you hold is another convoy.',
  'They are coming at you from more than one side. Do not let them turn you.',
  'Something big is moving in the canyon. We can feel it from here.',
  'Ground sensors show tunnelling under your position. Keep your units moving.',
  'Ten rounds. Nobody here thought you would last three. Keep going.'
];
const LATER = [
  'The school convoy just cleared the pass. That one was yours.',
  'We can hear your guns from the loading bays. Do not stop.',
  'They are throwing everything at you. That means it is working.',
  'Another convoy is on the road. Hold the line.',
  'Ember Reach is emptying. That is the good news.',
  'Drivers are asking who is still out there. We tell them: Twenty-Nine.',
  'No relief is coming. You knew that. Hold anyway.',
  'Every minute you stand is a truck through the gate.'
];
const MARKED = {
  16: 'They have you on three sides. Ember Control cannot help you. Hold.',
  21: 'They are all around you now. The last districts are loading. Hold, Twenty-Nine.'
};

export function radioLine(round) {
  return MARKED[round] || SCRIPT[round - 1] || LATER[(round * 5) % LATER.length];
}

const count = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const people = (n) => `${n.toLocaleString()} people`;

/** Rounds held are rounds cleared: a run that dies in round 6 held five. */
export const roundsHeld = (run) => Math.max(0, (run.level || 1) - 1);

/** The first sentence of the result: what the stand was worth. */
export function resultLine(run) {
  const rounds = roundsHeld(run);
  if (!rounds) return 'Outpost 29 fell before the first convoy was clear.';
  return `Outpost 29 has fallen, but ${people(evacuated(rounds))} got out of Ember Reach because you held for ${count(rounds, 'round')}.`;
}

/** One line to post with a challenge link. */
export function shareLine(run) {
  const rounds = roundsHeld(run);
  if (!rounds) return `BREACHLINE: 29. I stopped ${count(run.score, 'bug')} before Outpost 29 fell. Same canyon, can you hold longer?`;
  return `BREACHLINE: 29. I held Outpost 29 for ${count(rounds, 'round')}, stopped ${count(run.score, 'bug')} and got ${people(evacuated(rounds))} out. Same canyon, can you hold longer?`;
}

export function installStory(game, ui) {
  game.on('brief', () => ui.toast('Ember Control', radioLine(game.level), 'radio', 7000));
  game.on('roundCleared', ({ level }) => ui.toast(`Convoy ${level} away`,
    `+${convoySize(level).toLocaleString()} people out. ${evacuated(level).toLocaleString()} evacuated so far.`, 'ok', 5500));
  // The opening sweep is silent on its own; these are its two captions.
  game.on('openingSweep', (beat) => {
    if (beat === 'start') ui.callout('Outpost 29', 'Ember Reach is evacuating behind you · nobody else is coming', 'unit');
    else if (beat === 'hive') ui.callout('Here they come', 'Hold the line until the convoys are clear', 'unit');
  });
  return {
    evacuated: (run) => evacuated(roundsHeld(run)),
    shareLine,
    /** Put what the stand was worth in front of the kill count on the result screen. */
    annotateBanner(run) {
      const el = document.getElementById('bannerText');
      const line = resultLine(run);
      if (el && !el.textContent.startsWith(line)) el.textContent = `${line} ${el.textContent}`;
    }
  };
}
