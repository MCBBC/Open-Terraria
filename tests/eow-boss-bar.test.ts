// EoW 聚合血条数据链（EaterOfWorldsProgressBar.cs:18-46 语义）:
//   全场 13-15 段 HP 之和 ÷ 恒定分母 (链总段数)×150——杀段缩分子不缩分母;
//   spawnWormChain 写 eowChainMax 到全链各段。
//   （渲染端聚合在 Game.render 参数构造处,此处验证数据层:链计数字段与
//    血条数值函数的输入一致性）
import { describe, it, expect } from 'vitest';
import { Enemy, VANILLA_BOSS_IDS } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';

describe('EoW 聚合血条数据（EaterOfWorldsProgressBar :29-45）', () => {
  it('spawnWormChain 写 eowChainMax = 段数+1 到全链各段', () => {
    const head = Enemy.fromVanilla(13, 100 * TILE, 50 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 65);
    expect(head.eowChainMax).toBe(66);              // 头+65 = 66
    expect(segs.every((s) => s.eowChainMax === 66)).toBe(true);
  });

  it('杀段缩分子不缩分母:聚合 hp 减 150,分母恒 66×150', () => {
    const head = Enemy.fromVanilla(13, 100 * TILE, 50 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 65);
    const all = [head, ...segs];
    all.forEach((e) => { e.hp = e.maxHp; });
    const sum = () => all.filter((e) => !e.dead)
      .reduce((n, e) => n + Math.max(0, e.hp), 0);
    const denom = Math.max(...all.map((e) => e.eowChainMax)) * 150;
    expect(sum()).toBeCloseTo(66 * 150, -1);        // 满
    segs[0].dead = true;                            // 杀一节
    expect(sum()).toBeCloseTo(65 * 150, -1);
    expect(denom).toBe(66 * 150);                   // 分母不缩
  });

  it('原版 boss=true 全量对账：月总头手/火把神/DD2T3 在集合（消散豁免依据）', () => {
    for (const id of [396, 397, 398, 664, 578, 4, 113, 125, 126, 127, 134, 222, 245, 262, 266, 370, 395, 439, 636, 657, 668, 13]) {
      expect(VANILLA_BOSS_IDS.has(id), `id ${id} 缺失`).toBe(true);
    }
    // 月事件 Boss 无 boss 位(:13047/:13301)不入
    for (const id of [68, 325, 327, 345, 346]) {
      expect(VANILLA_BOSS_IDS.has(id), `id ${id} 不应入`).toBe(false);
    }
  });
});
