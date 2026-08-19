import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

function critterWorld(playerAt: { x: number; y: number } | null, opts: { water?: boolean } = {}) {
  const w = new World(80, 80, 42, 'open');
  w.groundLevel = 42;
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
  if (opts.water) for (let x = 20; x <= 60; x++) for (let y = 45; y <= 59; y++) st.setLiquid(x, y, 255, 1);
  const hooks = {
    world: w,
    player: playerAt ? {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    } : null,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

describe('diag', () => {
  it('rabbit step-up', () => {
    const { w, hooks } = critterWorld(null);
    w.store.setTileSilent(45, 59, 2);
    w.store.setTileSilent(35, 59, 2);
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let log = '';
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (t % 200 === 0) log += `t${t}: x=${e.x.toFixed(1)} y=${e.y.toFixed(1)} vx=${e.vx.toFixed(2)} vy=${e.vy.toFixed(2)} ai0=${e.ai0} f=${e.facing}\n`;
    }
    console.log(log);
  });
  it('rabbit 2-wall jump', () => {
    const { w, hooks } = critterWorld(null);
    for (let y = 58; y <= 59; y++) w.store.setTileSilent(45, y, 2);
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let minVy = 0; let log = '';
    for (let t = 0; t < 600; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < minVy) { minVy = e.vy; log += `t${t}: vy=${e.vy.toFixed(2)} x=${e.x.toFixed(1)} ai0=${e.ai0} f=${e.facing}\n`; }
    }
    console.log('minVy=' + minVy + '\n' + log);
  });
  it('seahorse', () => {
    const { w, hooks } = critterWorld(null, { water: true });
    for (let y = 45; y <= 60; y++) { w.store.setTileSilent(19, y, 2); w.store.setTileSilent(61, y, 2); }
    const e = Enemy.fromVanilla(626, 40 * 16, 50 * 16)!;
    let log = '';
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (t % 40 === 0) log += `t${t}: x=${e.x.toFixed(1)} y=${e.y.toFixed(1)} vx=${e.vx.toFixed(2)} vy=${e.vy.toFixed(2)} ai0=${e.ai0.toFixed(2)} ai1=${e.ai1.toFixed(0)} wet=${e.wet}\n`;
    }
    console.log(log);
  });
});
