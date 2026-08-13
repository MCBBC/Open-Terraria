import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
describe('dbg', () => {
  it('trace', () => {
    const w = new World(80, 80, 42, 'caster');
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
    const hooks = {
      world: w,
      player: { x: 40*16, y: 57*16, w: 20, h: 42, cx: 40*16+10, cy: 57*16+21, dead: false, vx: 0, vy: 0 },
      playSfx: () => {}, playSfxFiles: () => {}, spawnParticles: () => {},
      addDamageNumber: () => {}, spawnDrop: () => null, damagePlayer: () => {},
      entities: { add: () => {} },
    } as never;
    const e = Enemy.fromVanilla(29, 30 * 16, 56 * 16)!;
    console.log('aiStyle', e.vanilla?.aiStyle, 'critter', e.vanilla?.critter, 'dead', e.dead, 'timeLeft', (e as unknown as { timeLeft: number }).timeLeft);
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      const s = e as unknown as { ai0: number; ai1: number; ai2: number; ai3: number; aiInit: boolean };
      if (t % 40 === 0 || s.ai2 !== 0) console.log(t, 'ai0', s.ai0, 'ai1', s.ai1, 'ai2', s.ai2, 'ai3', s.ai3, 'init', s.aiInit, 'pos', Math.round(e.x), Math.round(e.y));
    }
  });
});
