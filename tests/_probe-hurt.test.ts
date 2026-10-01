import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';

describe('probe real Enemy.hurt return polarity', () => {
  it('non-fatal hit returns ???', () => {
    const w = new World(64, 64, 7, 'probe');
    const game = {
      world: w,
      player: { dead: false, cx: 0, cy: 0, buffs: { has: () => false, apply: () => {} }, equipStats: {}, addDPS: () => {} },
      recLog: () => {},
      addDamageNumber: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      spawnParticles: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
      enemies: () => [], critters: () => [],   // ★X2 补桩:killBossFlag 链消费 game.enemies()
      dust: { spawn: () => ({}) },
      noSpawnCycleThisFrame: false,
    } as never;
    const e = Enemy.fromVanilla(15, 100, 100) as Enemy & { hp: number };
    const hp0 = e.hp;
    const r1 = e.hurt(10, 0, 0, game, 0, false, 0, true);
    console.log('non-fatal: hp', hp0, '->', e.hp, 'return', r1);
    expect(e.hp).toBeLessThan(hp0);
    // fatal hit
    // ★X2 探针用法修正（2026-10-01）:普通命中落地即 iframes=10（Enemy.ts:14541）,
    //  二击撞 iframes 头门（:14235）=假阴性;探针二连击前清 iframes。
    (e as unknown as { iframes: number }).iframes = 0;
    const r2 = e.hurt(9999, 0, 0, game, 0, false, 0, true);
    console.log('fatal: return', r2, 'dead', e.dead);
    expect(r1).toBe(false);
    expect(r2).toBe(true);
  });
});
