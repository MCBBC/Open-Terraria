// RB30b 红队四 findings 回归（F2/F3/F4；F1 见 tests/destroyer-reallife.test.ts）：
//   F2 WoF 水蛭 117 建链漏 sharedLife——原版非 EoW 蠕虫全族共享头血池
//     （NPC.cs:51675-51679 realLife=ai[3] 每 tick 重申 + 建链块 :51845-51905 段继承
//     realLife；EoW 13/14/15 realLife=-1 例外）。段杀 → 扣头血/死亡归属头 117/无段掉落。
//   F3 NPC 666（EoW 专家版毒唾）aiStyle 9 每 tick damage=CappedAtMaster(32)
//     （NPC.cs:21551-21555，经典 32/专家 64/大师 96）——本仓曾恒走 SetDefaults 65 快照。
//   F4 dropVelocity 默认支 vy=Next(-40,-15)*0.1=[-4.0,-1.6]（Item.cs:49755 上界开）——
//     rng.int 闭区间换算应为 int(-40,-16)，曾写 int(-40,-15) 多含 -1.5 一档。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { RNG } from '../src/core/rng';
import { dropVelocity } from '../src/drops/NpcDrops';
import { wallOfFleshAI } from '../src/entities/bossAI_wof';
import { bouncingBallAI } from '../src/entities/bossAI_moon_events';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 240;
function world(): World {
  const w = new World(W, H, 11, 'rb30b-drops-domain');
  w.groundLevel = 60; w.rockLevel = 150;
  return w;
}

function hooks(w: World, p: Player, enemies: Enemy[]) {
  const drops: { key: string; n: number }[] = [];
  const events: { kind: string; vid: number | null }[] = [];
  const h = {
    world: w, player: p,
    enemies: () => enemies, critters: () => [],
    spawnDrop: (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; },
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    recLog: (kind: string, e: { vid: number | null }) => { events.push({ kind, vid: e?.vid ?? null }); },
    entities: { add: (e: Enemy) => enemies.push(e) },
  } as unknown as GameHooks;
  return { h, drops, events };
}

describe('RB30b-F2 WoF 水蛭 117 共享血池（NPC.cs:51675-51679 / :51845-51905）', () => {
  /** 走真实生产路径：wallOfFleshAI 放虫轮（ai1>60 计满）→ spawnPart(117) →
   *  bossAI_wof.ts:224 spawnWormChainFor（RB30b-F2 修后传 sharedLife=true） */
  function spawnLeechViaWof(enemies: Enemy[], h: GameHooks, p: Player) {
    const wof = Enemy.fromVanilla(113, 80 * TILE, 80 * TILE)!;
    wof.ai1 = 61;                                      // 计时已满（AI 内再 +1 → >60）
    wof.ai2 = 1;                                       // 进入放虫轮
    enemies.push(wof);
    wallOfFleshAI(wof, h, p);
    const leech = enemies.find((e) => e.vanillaId === 117);
    expect(leech).toBeTruthy();
    return { wof, leech: leech!, segs: enemies.filter((e) => e.vanillaId === 118 || e.vanillaId === 119) };
  }

  it('wallOfFleshAI 放虫建链:sharedLife=true 全段 realLifeHost=头 117（身 118×{3..5}+尾 119）', () => {
    const w = world();
    const p = new Player(80 * TILE, 80 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h } = hooks(w, p, enemies);
    const { leech, segs } = spawnLeechViaWof(enemies, h, p);
    expect(segs.length).toBeGreaterThanOrEqual(4);     // 身{3,4,5}+尾 → 全链 4..6 段
    expect(segs.length).toBeLessThanOrEqual(6);
    expect(segs[segs.length - 1].vanillaId).toBe(119); // 末段=尾
    expect(segs.every((s) => s.realLifeHost === leech)).toBe(true);
  });

  it('段杀:伤害传导扣头血+段 hp 镜像;击杀归属头(death vid=117,无段掉落),整链同死,无 RangeError', () => {
    const w = world();
    const p = new Player(80 * TILE, 80 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, events } = hooks(w, p, enemies);
    const { leech, segs } = spawnLeechViaWof(enemies, h, p);
    const tail = segs[segs.length - 1];
    tail.playerInteracted = true;
    // 传导：段受击 → 扣头血池，段 hp 镜像（StrikeNPC :82132-82137）
    leech.hp = 1000;
    tail.hurt(100, 0, 0, h, 0, false, 1, true);
    expect(leech.hp).toBeLessThan(1000);
    expect(tail.hp).toBe(leech.hp);
    // 击杀：共享池空 → 死亡【唯一归属头 117】（曾漏 sharedLife=尾 119 自走死亡管线）
    const deaths = () => events.filter((e) => e.kind === 'death').map((e) => e.vid);
    leech.hp = 10;
    expect(() => tail.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(leech.dead).toBe(true);
    expect(deaths()).toEqual([117]);
    expect(segs.every((s) => s.dead)).toBe(true);      // 整链同死（Enemy 死亡管线 :14092）
  });
});

describe('RB30b-F3 NPC 666 毒唾伤害档（NPC.cs:21548-21555 CappedAtMaster(32)）', () => {
  it('三难度每 tick 覆写:经典 32 / 专家 64 / 大师 96（SetDefaults 65 快照不再泄漏）', () => {
    const w = world();
    const p = new Player(80 * TILE, 80 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h } = hooks(w, p, enemies);
    // difficulty 档位（GDL: Classic=1/Expert=2/Master=3，Enemy.difficulty 同域）
    const want = [32, 64, 96];
    [1, 2, 3].forEach((diff, i) => {
      const e = Enemy.fromVanilla(666, 80 * TILE, 80 * TILE)!;
      expect(e.def.damage).not.toBe(want[i]);          // 出厂快照 ≠ AI 终值（曾恒走快照）
      e.difficulty = diff;
      enemies.length = 0;
      bouncingBallAI(e, h, p);                          // AI_009 首拍即覆写
      expect(e.def.damage).toBe(want[i]);
      enemies.pop();
    });
  });

  it('对照 112:无 666 覆写支,def.damage 保持 ScaleStats 快照（原版 damage=defDamage 恒等）', () => {
    const w = world();
    const p = new Player(80 * TILE, 80 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h } = hooks(w, p, enemies);
    const e = Enemy.fromVanilla(112, 80 * TILE, 80 * TILE)!;
    const d0 = e.def.damage;
    bouncingBallAI(e, h, p);
    expect(e.def.damage).toBe(d0);
  });
});

describe('RB30b-F4 dropVelocity 默认支 vy 区间（Item.cs:49755 Next(-40,-15)*0.1）', () => {
  it('600 掷:vy ∈ [-4.0,-1.6] 全 25 档,无 -1.5（上界开）', () => {
    const rng = new RNG(424242);
    const vys: number[] = [];
    for (let i = 0; i < 600; i++) vys.push(dropVelocity(rng, 23).vy);   // 23 凝胶不在 NoGravity 集
    for (const v of vys) {
      expect(v).toBeGreaterThanOrEqual(-4);
      expect(v).toBeLessThanOrEqual(-1.6);
    }
    expect(new Set(vys).size).toBe(25);                // int(-40,-16) 离散 25 档全到齐
    expect(vys).not.toContain(-1.5);                   // -15*0.1 精确可表示,曾泄漏
  });

  it('ItemNoGravity 双向支不受影响:vx/vy ∈ [-3.0,3.0]', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 200; i++) {
      const { vx, vy } = dropVelocity(rng, 575);       // 575 飞翔之魂 ∈ ITEM_NO_GRAVITY
      expect(Math.abs(vx)).toBeLessThanOrEqual(3);
      expect(Math.abs(vy)).toBeLessThanOrEqual(3);
    }
  });
});
