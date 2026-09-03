// 仙女近旁刷怪窗 1:1 清偿（2026-09-03，登记近似退役）：
//   原版 SpawnNPC :745-749 `if (player.isNearFairy())` → spawnRate×1.2 / maxSpawns×0.8。
//   Player.isNearFairy（Player.cs:54494-54506）= 任一 active 仙女 583/584/585 满足
//   `Vector2.Distance(npc.Center, player.Center) < NPC.sWidth`；NPC.sWidth = 1920 常量
//   （NPC.cs:6791），【无】ai[2] 条件——与 AnyHelpfulFairies（NPC.cs:90954-90964，
//   ai[2]>1 跟随态，地下仙女链关门 :5843）是两个谓词。
//   旧近似：spawner 刷怪率窗错用 fairyHelpfulActive（跟随态、无距离窗）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { VanillaSpawner, isNearFairyWindow, FAIRY_NEAR_RADIUS } from '../src/world/spawn/VanillaSpawner';
import { World } from '../src/world/World';

afterEach(() => vi.restoreAllMocks());

describe('isNearFairyWindow（Player.cs:54494 距离窗谓词）', () => {
  const vidOf = (e: { dead?: boolean; cx: number; cy: number }) => (e as unknown as { vid: number }).vid;

  it('仙女 583/584/585 距离 <1920 才受理；=1920 拒（严格小于）', () => {
    const mk = (cx: number, vid = 583) => ({ dead: false, cx, cy: 0, vid });
    expect(FAIRY_NEAR_RADIUS).toBe(1920);   // NPC.sWidth 常量（NPC.cs:6791）
    expect(isNearFairyWindow([mk(1919.9)], 0, 0, vidOf)).toBe(true);
    expect(isNearFairyWindow([mk(1920)], 0, 0, vidOf)).toBe(false);   // 严格 <：恰在窗上不受理
    // 对角距离同式（Vector2.Distance 欧氏）
    expect(isNearFairyWindow([mk(1357, 584)], 1358, 0, vidOf)).toBe(true);   // 584 同域
    expect(isNearFairyWindow([mk(0, 585)], 0, 1000, vidOf)).toBe(true);      // 585 同域
  });

  it('非仙女 id / dead 仙女不受理（原版 active && type 门）', () => {
    const mk = (vid: number, dead = false) => ({ dead, cx: 0, cy: 0, vid });
    expect(isNearFairyWindow([mk(3)], 0, 0, vidOf)).toBe(false);          // 僵尸不是仙女
    expect(isNearFairyWindow([mk(582)], 0, 0, vidOf)).toBe(false);        // 域外近邻 id
    expect(isNearFairyWindow([mk(586)], 0, 0, vidOf)).toBe(false);
    expect(isNearFairyWindow([mk(583, true)], 0, 0, vidOf)).toBe(false);  // dead → !active
  });

  it('无 ai[2] 条件（结构面：谓词无 ai 入参）——野生绕圈仙女同样算近旁', () => {
    // 原版循环体只查 active/type/距离；跟随态门属 AnyHelpfulFairies 另一谓词
    expect(isNearFairyWindow.length).toBe(4);   // (entries, px, py, vid)
  });
});

describe('VanillaSpawner 刷怪率窗（SpawnNPC :745-749）', () => {
  function rateFor(isNearFairy: boolean, fairyHelpfulActive = false): { spawnRate: number; maxSpawns: number } {
    const world = new World(400, 400, 42, '测试');
    world.groundLevel = 60; world.rockLevel = 120;   // 玩家 y=100px=6 格 → 地表白昼基线
    // （store.h-200)*16=3200 > 100 → 不落 underworld ×2 支
    const spawner = new VanillaSpawner(world);
    spawner.isNearFairy = isNearFairy;
    spawner.fairyHelpfulActive = fairyHelpfulActive;
    // Math.random 钉 0.99：友好掷骰/厄运轮（rateRng=Math.random）全不触发,速率链确定。
    // 基线链：600 → 近旁怪 0<max×0.2 → ×0.6 = 360（L583-585,先行于仙女窗）
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    return spawner.getSpawnRate(100, 0, false, 1200);
  }

  it('isNearFairy → rate=⌊360×1.2⌋=432 / max=⌊5×0.8⌋=4（:746-747 ×1.2/×0.8 逐值）', () => {
    expect(rateFor(false)).toEqual({ spawnRate: 360, maxSpawns: 5 });
    expect(rateFor(true)).toEqual({ spawnRate: 432, maxSpawns: 4 });
  });

  it('回归锁：fairyHelpfulActive（AnyHelpfulFairies 跟随态门）不再驱动刷怪率窗', () => {
    // 旧近似=两个谓词混用；现跟随态只管地下仙女链门（checkToSpawnUndergroundFairy）
    expect(rateFor(false, true)).toEqual({ spawnRate: 360, maxSpawns: 5 });
  });
});
