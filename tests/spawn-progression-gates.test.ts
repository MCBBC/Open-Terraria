// 出怪池进度门对账批回归（2026-08-13）：
//   ① 630 血木乃伊数据补齐（原 json 缺 → fromVanilla null 静默丢弃）；
//   ② getGoodWorld 刷怪率 ×0.8/×1.2（原版 :654-656,此前缺失）；
//   ③ townNoWorms 闩锁并入 noWorms（原版同一字段,此前闩后不读=城镇旁蠕虫抑制失效）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';

function makeWorld(): World {
  const w = new World(300, 200, 7, 'spawn-gate-test');
  w.groundLevel = 100;
  w.rockLevel = 140;
  // 玩家站位开阔地表
  for (let x = 140; x < 160; x++) {
    w.store.setTile(x, 120, 1);
  }
  return w;
}

describe('出怪池进度门修复', () => {
  it('630 血木乃伊：数据补齐（1456 NPC.cs:17042-17054：180/60/18/kb0.5/aiStyle3）', () => {
    const e = Enemy.fromVanilla(630, 0, 0);
    expect(e).not.toBeNull();
    expect(e!.maxHp).toBe(180);
    expect(e!.def.damage).toBe(60);
    expect(e!.def.defense).toBe(18);
    expect(e!.def.knockbackResist).toBe(0.5);
    expect(e!.vanilla!.aiStyle).toBe(3);
    e!.dead = true;
  });

  it('getGoodWorld：刷怪率 ×0.8 / max ×1.2（:654-656）', () => {
    const w1 = makeWorld();
    const s1 = new VanillaSpawner(w1);
    const w2 = makeWorld();
    w2.seedFlags = { ...(w2.seedFlags ?? {}), getGoodWorld: true };
    const s2 = new VanillaSpawner(w2);
    // 白天地表、无修饰输入 → 基线 rate 360 / max 5（600×0.6 人口带…实际以对照断言）
    const r1 = s1.getSpawnRate(110 * TILE, 0, false, 480, 150 * TILE);
    const r2 = s2.getSpawnRate(110 * TILE, 0, false, 480, 150 * TILE);
    // 同输入下 FTW = 基线 ×0.8 / ×1.2（相对断言,不绑基线绝对值）
    expect(r2.spawnRate).toBe(Math.floor(r1.spawnRate * 0.8));
    expect(r2.maxSpawns).toBe(Math.floor(r1.maxSpawns * 1.2));
  });

  it('townNoWorms 闩锁并入 noWorms（城镇旁蠕虫抑制）', () => {
    const w = makeWorld();
    const sp = new VanillaSpawner(w);
    sp.getSpawnRate(110 * TILE, 0, false, 480, 150 * TILE);   // 先跑一轮置基础字段
    (sp as unknown as { townNoWorms: boolean }).townNoWorms = true;
    const rng = new RNG(7);
    sp.spawn(150 * TILE + 8, 110 * TILE, rng, 20, 12);
    // 房屋墙 latch（玩家站露天=无墙）∪ 城镇闩 → noWorms 生效
    expect((sp as unknown as { noWorms: boolean }).noWorms).toBe(true);
  });
});
