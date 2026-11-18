/*
 * Optional layer. Wires the battle to the sound: Ember Control's callouts, where the camera is
 * listening from, countdown ticks and the skitter of a swarm close to the camera.
 *
 * It only listens to events the game already emits and reads state it already exposes, so if this
 * file is missing the guns, the unit voices and the music carry on without the dispatcher.
 */
import { audioGraph } from './audio.js';

/** The swarm as one sound: thousands of legs and wings, fluttering. Its level follows the fight. */
function swarmBed() {
  const graph = audioGraph();
  if (!graph || graph.ctx.state !== 'running') return null;
  const c = graph.ctx;
  const src = c.createBufferSource();
  src.buffer = graph.noise;
  src.loop = true;
  const band = c.createBiquadFilter();
  band.type = 'bandpass'; band.frequency.value = 1900; band.Q.value = 1.1;
  const flutter = c.createGain();
  flutter.gain.value = 0.6;
  const wings = c.createOscillator(), depth = c.createGain();
  wings.frequency.value = 27; depth.gain.value = 0.4;
  wings.connect(depth).connect(flutter.gain);
  const level = c.createGain();
  level.gain.value = 0;
  const send = c.createGain();
  send.gain.value = 0.5;
  src.connect(band).connect(flutter).connect(level).connect(graph.sfxBus);
  level.connect(send).connect(graph.reverb);
  src.start(); wings.start();
  return { set: (v) => level.gain.setTargetAtTime(v, c.currentTime, 0.6) };
}

export async function installComms({ game, stage, voice, sfx }) {
  // The round's opening line comes from the story when that layer exists.
  const story = await import('./story.js').catch(() => null);
  const say = (id) => voice.control(id);

  game.on('brief', () => {
    const line = story?.radioLine?.(game.level);
    if (!(line && voice.radio(line))) say('wave');
  });
  game.on('count', (n) => sfx.countdown(n));
  game.on('alert', (e) => say(e.kind === 'core' ? 'baseHit' : 'unitsHit'));
  game.on('roundCleared', () => say('cleared'));
  game.on('raid', () => say('raid'));
  game.on('bossDown', () => say('bossDown'));
  game.on('ultralisk', () => { sfx.horn(null); say('behemoth'); });
  game.on('maw', () => say('maw'));
  game.on('mawTook', () => say('mawTook'));
  game.on('mawFreed', () => say('mawFreed'));
  game.on('supply', () => say('supply'));
  game.on('unlock', () => say('armory'));
  game.on('unitUnlocked', () => say('unitUnlocked'));
  game.on('baseUpgradeStarted', () => say('researchStart'));
  game.on('baseUpgraded', () => say('researchDone'));
  game.on('evolved', () => say('evolved'));
  game.on('treasureApplied', () => say('treasure'));
  game.on('redeployed', () => say('redeploy'));
  game.on('streak', (tier) => { if (tier.streak >= 25) say('streak'); });
  game.on('over', () => say('defeat'));

  // Things with no event of their own: watch for the moment they change.
  let boss = null, laser = game.laserReady, strike = game.airStrikeReady, nextSkitter = 0, bed = null;
  function watch() {
    if (document.hidden) { bed?.set(0); return; }
    sfx.listen(stage.focus.x, stage.focus.z, stage.yaw, stage.dist);
    const fighting = game.state === 'wave' || game.state === 'raid';

    // The closer and thicker the swarm, the louder it gets.
    bed ||= swarmBed();
    if (bed) {
      let close = 0, alive = 0;
      if (fighting && !game.paused) {
        const reach = 8 + stage.dist * 0.7;
        for (const z of game.zerglings) {
          if (z.dead) continue;
          alive++;
          if (Math.hypot(z.x - stage.focus.x, z.z - stage.focus.z) < reach) close++;
        }
      }
      bed.set(Math.min(0.13, close * 0.0065 + alive * 0.0006));
    }

    const now = game.assault?.boss && !game.assault.boss.dead ? game.assault.boss : null;
    if (now && now !== boss) { sfx.horn(now); say('boss'); }
    boss = now;

    if (game.laserReady && !laser && fighting) say('laser');
    laser = game.laserReady;
    if (!game.airStrikeReady && strike) say('strike');
    else if (game.airStrikeReady && !strike && fighting) say('strikeReady');
    strike = game.airStrikeReady;

    // A few of the bugs nearest the camera can be heard moving.
    if (fighting && !game.paused && performance.now() > nextSkitter) {
      nextSkitter = performance.now() + 350 + Math.random() * 900;
      const near = game.zerglings.filter((z) => !z.dead && !z.flying
        && Math.hypot(z.x - stage.focus.x, z.z - stage.focus.z) < 6 + stage.dist * 0.6);
      if (near.length) sfx.chitter(near[(Math.random() * near.length) | 0]);
    }
  }
  const timer = setInterval(watch, 100);
  watch();
  return { stop() { clearInterval(timer); } };
}
