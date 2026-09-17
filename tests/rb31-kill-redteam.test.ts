// RB31 红队探针（实体/击杀域——RB30b 修复本体复核）。只读取证,不定谳不修刀：
//   ①realLife 归属门自指豁免矩阵·击杀序穷举（同拍双亡/段先+头补刀/中段/头先）
//   ②共享池族全建链点（87 飞龙/117 水蛭/134 毁灭者）同拍多段杀=掉落单份判别
//   ③AI_006 头 realLifeHost=null vs 原版 realLife=whoAmI 的消费面差（soulDrain 门）
// 判别力：同拍双亡若段漏进自身死亡管线,death 事件/575/钱币必翻倍（门洞指纹）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { destroyerAI } from '../src/entities/bossAI';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { bannerOfNpc } from '../src/world/Banners';
import { Achievements } from '../src/core/Achievements';
import type { GameHooks } from '../src/entities/types';

const TILE2 = 16;

function killHarness(summonVid: number, headSelfBuild?: (e: Enemy, h: GameHooks, enemies: Enemy[]) => void) {
  const w = new World(120, 120, 7, 'rb31-redteam');
  w.groundLevel = 60; w.rockLevel = 90;
  const events: Array<[string, Record<string, unknown>]> = [];
  const worldDrops: string[] = [];
  const enemies: Enemy[] = [];
  const hooks = {
    world: w,
    player: {
      cx: 10 * TILE2, cy: 60 * TILE2, x: 10 * TILE2 - 8, y: 60 * TILE2 - 14,
      w: 16, h: 28, dead: false, hp: 400, maxHp: 400, mana: 20, maxMana: 200,
      luck: 0, inv: { slots: [] }, addDPS: () => {},
    },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    damagePlayer: (): number => 0, spawnParticles: () => {}, spawnBurst: () => {},
    addDamageNumber: () => {},
    spawnDrop: (_x: number, _y: number, key: string, n: number) => {
      worldDrops.push(`${key}#${n}`);
      return null;
    },
    enemies: () => enemies, critters: () => [], npcs: () => [],
    entities: { add: (e: unknown) => enemies.push(e as Enemy) },
    onEnemyKilled: () => {},
    recLog: (k: string, d: Record<string, unknown>) => events.push([k, d]),
  } as never;
  const head = Enemy.fromVanilla(summonVid, 60 * TILE2, 30 * TILE2)!;
  enemies.push(head);
  headSelfBuild?.(head, hooks, enemies);
  return { hooks, events, worldDrops, enemies, head };
}

const deathsOf = (events: Array<[string, Record<string, unknown>]>): number[] =>
  events.filter(([k]) => k === 'death').map(([, d]) => d.vid as number);

const vidOf = (key: string): number => {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? Number(m[1]) : -1;
};

/** 桶里混有 GorePiece 等（entities.add 共享出口），断言只看 Enemy */
const enemyOnly = (arr: unknown[]) => arr.filter((e): e is Enemy => e instanceof Enemy);

const soulKeyOf = (vid: number) => VANILLA_ITEM_KEY_BY_ID[vid]!;
const SOUL_575 = soulKeyOf(575);

function buildWyvern(enemies: Enemy[]) {
  const head = enemies[0];
  const spec = Enemy.wormChainSpec(87, () => 0.5)!;
  const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
  for (const s of segs) enemies.push(s);
  return segs;
}

describe('RB31-① realLife 归属门·同拍双亡/头补刀矩阵（判别：death/掉落单份）', () => {
  it('飞龙 87·同拍两段各 99999:死亡恰一次 vid=87,575 一批,钱币一轮,整链同死', () => {
    const { hooks, events, worldDrops, enemies, head } = killHarness(87);
    const segs = buildWyvern(enemies);
    head.hp = 10;
    segs[2].hurt(99999, 0, 0, hooks);
    segs[5].hurt(99999, 0, 0, hooks);
    expect(deathsOf(events)).toEqual([87]);
    expect(worldDrops.filter((k) => k.startsWith(SOUL_575))).toHaveLength(1);
    expect(worldDrops.map((k) => vidOf(k)).filter((v) => v >= 71 && v <= 74).length).toBeGreaterThan(0);
    expect(enemyOnly(enemies).every((e) => e.dead)).toBe(true);
  });

  it('飞龙 87·段先杀门归头后同拍补刀头:头 dead 早退,仍恰一次 death vid=87 + 575 一批', () => {
    const { hooks, events, worldDrops, enemies, head } = killHarness(87);
    const segs = buildWyvern(enemies);
    head.hp = 10;
    segs[0].hurt(99999, 0, 0, hooks);
    head.hurt(99999, 0, 0, hooks);      // 同拍头补刀——dead 单次门须拦
    expect(deathsOf(events)).toEqual([87]);
    expect(worldDrops.filter((k) => k.startsWith(SOUL_575))).toHaveLength(1);
    expect(enemyOnly(enemies).every((e) => e.dead)).toBe(true);
  });

  it('水蛭 117·同拍两段:死亡恰一次 vid=117,段零死亡事件（RB30b-F2 同族复核）', () => {
    const { hooks, events, enemies, head } = killHarness(117);
    const spec = Enemy.wormChainSpec(117, () => 0.5)!;
    const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
    for (const s of segs) enemies.push(s);
    head.hp = 10;
    segs[0].hurt(99999, 0, 0, hooks);
    segs[segs.length - 1].hurt(99999, 0, 0, hooks);
    expect(deathsOf(events)).toEqual([117]);
    expect(enemyOnly(enemies).every((e) => e.dead)).toBe(true);
  });

  it('毁灭者 134·同拍两段各 99999:死亡恰一次 vid=134,548 一批（自指头+级联）', () => {
    const w = new World(200, 400, 11, 'rb31-destroyer');
    w.groundLevel = 60; w.rockLevel = 150;
    w.clock.timeOfDay = 0.9;
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const events: Array<[string, Record<string, unknown>]> = [];
    const worldDrops: string[] = [];
    const h = {
      world: w, player: p,
      enemies: () => enemies, critters: () => [],
      spawnDrop: (_x: number, _y: number, key: string, n: number) => { worldDrops.push(`${key}#${n}`); return null; },
      damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
      recLog: (k: string, e: { vid: number | null }) => events.push([k, e as unknown as Record<string, unknown>]),
      entities: { add: (e: Enemy) => enemies.push(e) },
    } as unknown as GameHooks;
    const head = Enemy.fromVanilla(134, 100 * TILE, 200 * TILE)!;
    head.hp = head.maxHp;
    enemies.push(head);
    destroyerAI(head, h, p);
    const segs = enemies.filter((e) => e !== head);
    head.hp = 10;
    segs[10].hurt(99999, 0, 0, h, 0, false, 1, true);
    segs[40].hurt(99999, 0, 0, h, 0, false, 1, true);
    expect(deathsOf(events)).toEqual([134]);
    expect(worldDrops.filter((k) => k.startsWith(soulKeyOf(548))).length).toBe(1);
    expect(enemyOnly(enemies).every((e) => e.dead)).toBe(true);
  });

  it('毁灭者 134·中段先杀+同拍头补刀:恰一次 death vid=134（RB30b-F1 停机面回归）', () => {
    const w = new World(200, 400, 11, 'rb31-destroyer2');
    w.groundLevel = 60; w.rockLevel = 150;
    w.clock.timeOfDay = 0.9;
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const events: Array<[string, Record<string, unknown>]> = [];
    const h = {
      world: w, player: p,
      enemies: () => enemies, critters: () => [],
      spawnDrop: () => null,
      damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
      recLog: (k: string, e: { vid: number | null }) => events.push([k, e as unknown as Record<string, unknown>]),
      entities: { add: (e: Enemy) => enemies.push(e) },
    } as unknown as GameHooks;
    const head = Enemy.fromVanilla(134, 100 * TILE, 200 * TILE)!;
    head.hp = head.maxHp;
    enemies.push(head);
    destroyerAI(head, h, p);
    const segs = enemies.filter((e) => e !== head);
    head.hp = 10;
    segs[Math.floor(segs.length / 2)].hurt(99999, 0, 0, h, 0, false, 1, true);
    head.hurt(99999, 0, 0, h, 0, false, 1, true);   // 同拍头补刀
    expect(deathsOf(events)).toEqual([134]);
    expect(enemyOnly(enemies).every((e) => e.dead)).toBe(true);
  });
});

describe('RB31-③ AI_006 头 realLifeHost 域（原版建链 realLife=whoAmI 自指）', () => {
  it('RB31-⑤ 宁芙链端到端:失落女孩 195 变身 196 → netId 归零 → 击杀 lastCreatureHit=196 旗', () => {
    const { hooks, enemies } = killHarness(87);   // 87 仅作占位（复用 harness）
    const girl = Enemy.fromVanilla(195, 10 * TILE2 + 64, 60 * TILE2 - 20)!;  // 玩家旁（AI_042 <200px+LOS）
    enemies.push(girl);
    girl.ai0 = 21;
    girl.fixedUpdate(1, hooks);
    expect(girl.vanillaId).toBe(196);                 // 原版 NPCID.Nymph=196（NPCID.cs:11463）
    expect(girl.vanillaNetId).toBe(0);                // Transform → SetDefaults 尾 netID=type（本仓 0≙归一）
    const pl = (hooks as unknown as { player: { lastCreatureHit?: number } }).player;
    girl.hurt(99999, 0, 0, hooks, 0, false, 1, true); // fromPlayer 击杀 → lastCreatureHit
    expect(girl.dead).toBe(true);
    expect(pl.lastCreatureHit).toBe(bannerOfNpc(196));
    expect(bannerOfNpc(196)).toBeGreaterThan(0);   // 注:195/196 旗同 80（BannerSystem.cs:618-620）,旗位非判别面
    // 成就判别面（真 bug 位）:DECEIVER_OF_FOOLS watches 196（vanillaAchievements.ts:123 /
    // AchievementInitializer.cs:207）——post-fix killAchId=196 点亮;陈旧 195 不点亮
    const ach = new Achievements(null);
    ach.notifyNPCKilled(girl.vanillaNetId !== 0 ? girl.vanillaNetId : (girl.vanillaId ?? 0));  // Game.ts:40275 同式
    expect(ach.progressOf('DECEIVER_OF_FOOLS').doneConds).toBe(1);
    const achStale = new Achievements(null);
    achStale.notifyNPCKilled(195);                  // 修复前 netId 陈旧值（同式反证）
    expect(achStale.progressOf('DECEIVER_OF_FOOLS').doneConds).toBe(0);
  });

  it('共享池族头自指 host=self(原版 :51703/:51852 realLife=whoAmI;RB31-1 修复后全域)', () => {
    const a = killHarness(87);
    const segs = buildWyvern(a.enemies);
    expect(a.head.realLifeHost).toBe(a.head);     // ★RB31-1:原版 :51703 realLife=whoAmI
    expect(segs.every((s) => s.realLifeHost === a.head)).toBe(true);
    const b = killHarness(117);
    Enemy.spawnWormChain(b.head, 5, undefined, true);
    expect(b.head.realLifeHost).toBe(b.head);     // ★同上 :51852
  });

  it('★RB31-1 已修:共享池头自指 host→soulDrain 免疫门覆盖(原版 realLife=whoAmI≠-1 拒,:92802)', () => {
    // 原版 NPC.UpdateLifeRegen `if (soulDrain && realLife == -1)`——realLife=whoAmI 的
    // 蠕虫头【同样】免 soulDrain DoT;本仓门读 realLifeHost(头=null) → 放行。
    const { hooks, enemies, head } = killHarness(87);
    buildWyvern(enemies);
    head.soulDrainT = 60;
    head.soulDrainDoT = 25;
    const hp0 = head.hp;
    head.fixedUpdate(1, hooks);
    expect(head.hp).toBe(hp0);                    // 原版语义:头免 soulDrain → 零漂移(现 RED)
  });
});
