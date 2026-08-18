// 仙灵宝箱引导链（NPC.cs AI_112 :48602-48960 + GetFairyTreasureCoords :48794-48852）
// 状态 2 玩家引导 → 3 绕宝圆舞 → 4 带路 → 5 终演 FairyEffects / 6 无宝重试 / 7 离场
import { describe, expect, it } from 'vitest';
import { fairyTreasureCoords, fairyTreasureValidAt } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';

const w = new World(200, 120, 11, 'fairy');
// 放一个金宝箱（sheet 21）在 (100, 60)
const CHEST = TILE_BY_KEY['chest']!;

describe('GetFairyTreasureCoords（NPC.cs:48794-48852）', () => {
  it('窗口内金宝箱命中；窗口外无宝 → null', () => {
    w.store.setTileSilent(100, 60, CHEST, 0, 0);
    // 中心 (100,60) ±75×±50 → 覆盖
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
    // 远处无窗
    expect(fairyTreasureCoords(w.store, 190 * 16, 60 * 16)).toBeNull();
    expect(fairyTreasureCoords(w.store, 10 * 16, 60 * 16)).toBeNull();
  });

  it('227 生命果仅 frameX 272-374 有效（SceneMetrics.IsValidForOreFinder）', () => {
    const fruit = TILE_BY_KEY['v_227_dye_plants']!;
    w.store.setTileSilent(100, 60, fruit, 300, 0);
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toEqual([100, 60]);
    w.store.setTileSilent(100, 60, fruit, 100, 0);
    expect(fairyTreasureCoords(w.store, 100 * 16 + 8, 60 * 16 + 8)).toBeNull();
  });

  it('fairyTreasureValidAt：目标被挖 → 失效（状态 5 提前终演门）', () => {
    w.store.setTileSilent(100, 60, CHEST, 0, 0);
    expect(fairyTreasureValidAt(w.store, 100, 60)).toBe(true);
    w.store.setTileSilent(100, 60, 0, 0, 0);
    expect(fairyTreasureValidAt(w.store, 100, 60)).toBe(false);
  });
});
