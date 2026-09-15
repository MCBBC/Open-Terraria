// 宁芙杀→傻瓜骗子触发链回归（2026-09-15 用户实报定谳）：
// 原版 NPC.Transform → SetDefaults(newType) 尾 NPC.cs:17849 `netID = type`——
// 变身即脱变体。本仓 VanillaSpawner.spawnNPC:676 无条件 `vanillaNetId = netId`
// （失落女孩 195 出生即 netId=195），Enemy.tryTransformTo 曾不重推导 → 变身宁芙
// 击杀链四消费点（成就 killAchId / 图鉴 killNetId / 旗 recordBannerKill /
// lastCreatureHit，统一 `vanillaNetId!==0 ? netId : id` 归一）全按陈旧 195 计：
// DECEIVER_OF_FOOLS（NPCKilledCondition 196,AchievementInitializer.cs:207）永不完成。
// 原版 Transform 后 netID 恒等于新 type（正 id）→ 本仓编码 0≙"无变体=vanillaId"。
import { describe, it, expect } from 'vitest';
import { Achievements } from '../src/core/Achievements';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { bannerOfNpc } from '../src/world/Banners';

/** 失落女孩 → 宁芙变身（真实 Enemy 驱动 private tryTransformTo；st 形参已闲置
 *  `void st`，transformVisuals 对 195→196 无分发 → 两参传 undefined 安全） */
function lostGirlTransformedToNymph(): Enemy {
  const e = Enemy.fromVanilla(195, 100 * 16, 80 * 16)!;
  e.vanillaNetId = 195; // 复刻 VanillaSpawner.spawnNPC:676 `e.vanillaNetId = netId`
  e.playerInteracted = true; // hurt fromPlayer 置位（击杀成就交互门信号源）
  const ok = (e as unknown as {
    tryTransformTo(id: number, st: unknown, allowEmbedded: boolean, game?: unknown): boolean;
  }).tryTransformTo(196, undefined, false, undefined);
  expect(ok).toBe(true);
  return e;
}

function killGame(): Game {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.achievements = new Achievements(null);
  g.world = new World(120, 120, 6, 'nymph');
  g.entities = { enemies: [], npcs: [], projectiles: [] };
  g.player = { lastCreatureHit: -1, maxHp: 100, maxMana: 20 };
  return g as unknown as Game;
}

const kill = (g: Game, e: Enemy) =>
  (g as unknown as { onEnemyKilled(key: string, enemy: Enemy): void }).onEnemyKilled(
    `vi_${e.vanillaId}`, e,
  );

describe('宁芙击杀 → DECEIVER_OF_FOOLS（傻瓜骗子）', () => {
  it('失落女孩 195 变身宁芙 196 后击杀 → 成就完成（原版 netID=type 语义）', () => {
    const e = lostGirlTransformedToNymph();
    expect(e.vanillaId).toBe(196);
    expect(e.vanillaNetId).toBe(0); // Transform 重推导：变身体不再携带出生 netId 195
    const g = killGame();
    kill(g, e);
    expect(g.achievements.isCompleted('DECEIVER_OF_FOOLS')).toBe(true);
  });

  it('变身宁芙击杀进宁芙旗账（原版 BannerID()=netID,NPC.cs:7672——曾按 195 记恒空）', () => {
    const e = lostGirlTransformedToNymph();
    const g = killGame();
    kill(g, e);
    const banner = bannerOfNpc(196);
    expect(banner).toBeGreaterThan(0);
    expect((g.world as unknown as { bannerKills: Record<number, number> }).bannerKills[banner])
      .toBe(1);
  });

  it('未变身失落女孩（195）击杀不完成——原版条件只挂 196（同位反证）', () => {
    const e = Enemy.fromVanilla(195, 100 * 16, 80 * 16)!;
    e.vanillaNetId = 195;
    e.playerInteracted = true;
    const g = killGame();
    kill(g, e);
    expect(g.achievements.isCompleted('DECEIVER_OF_FOOLS')).toBe(false);
  });

  it('netId 变体击杀面不受重推导影响：粉史莱姆（type1/netId-4）→ PRETTY_IN_PINK', () => {
    const e = Enemy.fromVanilla(1, 100 * 16, 80 * 16)!;
    e.vanillaNetId = -4; // 复刻 spawnNPC（NET_ID_MAP[-4].base=1）出生变体位
    e.playerInteracted = true;
    const g = killGame();
    kill(g, e);
    expect(g.achievements.isCompleted('PRETTY_IN_PINK')).toBe(true);
    expect(g.achievements.isCompleted('DECEIVER_OF_FOOLS')).toBe(false);
  });
});

describe('tryTransformTo netID 重推导（原版 Transform→SetDefaults NPC.cs:17849 同域）', () => {
  const transform = (from: number, to: number) => {
    const e = Enemy.fromVanilla(from, 0, 0)!;
    e.vanillaNetId = from; // spawnNPC 出生位（正 id 下 netId==from）
    (e as unknown as {
      tryTransformTo(id: number, st: unknown, allowEmbedded: boolean, game?: unknown): boolean;
    }).tryTransformTo(to, undefined, false, undefined);
    return e;
  };
  it('195→196：vanillaNetId 归零（变身体 killAchId 归一到新 type）', () => {
    const e = transform(195, 196);
    expect(e.vanillaId).toBe(196);
    expect(e.vanillaNetId).toBe(0);
  });
  it('406→405（AI_095 小星细胞长大,Transform 405）：同语义', () => {
    const e = transform(406, 405);
    expect(e.vanillaId).toBe(405);
    expect(e.vanillaNetId).toBe(0);
  });
});
