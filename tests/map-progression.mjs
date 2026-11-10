import assert from 'node:assert/strict';
import { carveLevel } from '../src/levels.js';
import { wavePlan, mapDimensions, BREEDS } from '../src/config.js';

for (const seed of [0, 12345, 0xffffffff]) {
  let previous;
  for (let level = 1; level <= 30; level++) {
    const map = carveLevel(level, seed);
    if (previous) {
      assert.notDeepEqual(map.paths, previous.paths, `Round ${level} repeated its approaches`);
      assert.notDeepEqual(map.open, previous.open, `Round ${level} repeated its terrain`);
    }
    assert.notDeepEqual(map.paths, carveLevel(level, seed ^ 0x1234).paths, 'New runs need different approaches');
    previous = map;
  }
}
assert.deepEqual([1,6,7,15,16,100].map(n => mapDimensions(n).routeCount), [2,2,3,3,4,4]);

let previousHp = 0, previousCount = 0;
for (let level = 1; level <= 100; level++) {
  const wave = wavePlan(level);
  const health = wave.reduce((sum, e) => sum + BREEDS[e.breed].hp * e.hpScale, 0);
  assert.ok(health > previousHp, `Enemy health budget did not increase at round ${level}`);
  assert.ok(wave.length >= previousCount, `Enemy count dropped at round ${level}`);
  assert.ok(wave.every((e,i) => e.at >= 0 && (!i || e.at >= wave[i-1].at)), 'Spawn times are not sorted');
  assert.ok(wave.every(e => e.speedScale >= 1 && e.speedScale <= 1.3), 'Speed ramp exceeded its cap');
  if (level === 2) assert.ok(wave.length < previousCount * 2, 'The second wave still doubles the opening count');
  previousHp = health; previousCount = wave.length;
}
for (const [breed, first] of [['needler',3],['warrior',4],['skyhunter',5],['hopper',6],['tanker',8]]) {
  assert.ok(!wavePlan(first-1).some(e => e.breed === breed));
  assert.ok(wavePlan(first).some(e => e.breed === breed));
}
console.log('PASS: distinct terrain every round/run, 2→3→4 routes, gradual opening counts, rising health budgets, bounded speed and staged enemy types');
