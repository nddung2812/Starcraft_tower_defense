import { ULTRALISK as R, CELL } from './config.js';

/** One swing hits each exposed ground defender once; aircraft and bunker occupants are safe. */
export function cleaveDefenders(unit, primary, game, angle) {
  const victims = new Set([primary, ...game.gunners, ...game.walls, ...game.bunkers, game.scv, game.core]);
  for (const victim of victims) {
    if (!victim || victim.dead || victim.downed || victim.flying || victim.bunker) continue;
    const dx = victim.x-unit.x, dz = victim.z-unit.z;
    if (victim !== primary) {
      if (Math.hypot(dx,dz)>R.cleaveRadius) continue;
      const off = Math.atan2(Math.sin(Math.atan2(dz,dx)-angle),Math.cos(Math.atan2(dz,dx)-angle));
      if (Math.abs(off)>R.cleaveArc) continue;
      if (!game.grid.clearWorldLine(unit.x,unit.z,victim.x,victim.z,true,
        (x,y)=>[CELL.ROCK,CELL.WALL,CELL.BUNKER].includes(game.grid.get(x,y)))) continue;
    }
    const breach = victim.kind==='wall'||victim.kind==='bunker';
    victim.takeDamage(unit.damage*(breach?R.structureMultiplier:1),game,angle);
  }
  let previous = null;
  for(let i=0;i<=8;i++) {
    const a=angle-R.cleaveArc+2*R.cleaveArc*i/8;
    const p={x:unit.x+Math.cos(a)*R.cleaveRadius,y:0.55,z:unit.z+Math.sin(a)*R.cleaveRadius};
    if(previous) game.fx.link(previous,p,0xffc086,0.22,0.045);
    previous=p;
  }
  game.sfx.ultraliskSlash(); game.stage.kick(1.4);
}
