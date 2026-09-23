// BJ302（2026-09-23 用户实报：火星飞碟打死不掉落 + 打死后过一会才消失）：
//   经典模式自毁链吞击定谳判别面。
//
// 原版掉落链全貌（反编译锚,Terarria1457）：
//   · 事件生成 395（NPC.cs:1509-1518 进度条支 NewNPC 395;aiStyle 76）
//   · 395 首帧生成部件 393×2/394×2/392×1（NPC.cs:36426-36455,localAI[0..3]=四槽）
//   · 395 SetDefaults dontTakeDamage=true（:14069）——经典模式巡航期【全程】无敌
//     （aiStyle 76 唯一解除点 = :36738 ai[0]==1 支,仅专家二阶段经过）
//   · 392 炮体监控四槽全灭（:35884-35948 flag82）→ 经典:parent ai[0]=3 →
//     395 StrikeNPCNoInteraction(9999)（:36459）→ 死亡 → NPCLoot（:79643）→ 掉落;
//     专家:parent ai[0]=1 → 二阶段（:36733-36769 dontTakeDamage=false + 死光）
//   · StrikeNPC 链【无 dontTakeDamage 门】（:82017/:82063 仅 immortal 一门 :82197）
//     ——dontTakeDamage 只属玩家受击面 NPC.hurt()。本仓 hurt() 合并两通道后,
//     函数头 `if (this.dontTakeDamage) return false` 会吞掉 AI 侧自毁击 → 修复刀
//     = ai0===3 支先清旗（bossAI_dd2.ts 荷兰人自毁同款范式）。
//   · Wiki 对拍（terraria-wiki-md/Martian_Saucer.md:109-111/:281）："All four
//     weapons must be destroyed in order to defeat the Martian Saucer"、1.4.4 起
//     经典无二阶段 —— 经典=四炮全灭即掉落本相,专家=二阶段打核心,非"必须打爆
//     某段"以外的偏差。
//   · 掉落表全挂 395 段（ItemDropDatabase.cs RegisterMartianDrops :899-:925 +
//     奖旗 :891）;部件 392/393/394 零注册（value=0f,无掉落）——段归属=唯 395 死掷。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { martianSaucerAI, martianSaucerPartAI } from '../src/entities/bossAI_martian';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

// ItemDropDatabase.cs:921 OneFromOptionsNotScalingWithLuck(1, 2797, 2749, 2795, 2796, 2880, 2769)
const SIX_POOL = [2797, 2749, 2795, 2796, 2880, 2769];
const KEY_TO_ID = new Map(Object.entries(VANILLA_ITEM_KEY_BY_ID).map(([id, key]) => [key as string, Number(id)]));

const W = 200, H = 400;
function world(diff: number): World {
  const w = new World(W, H, 11, 'bj302');
  w.groundLevel = 60; w.rockLevel = 150;
  w.difficulty = diff;                     // 0 经典 / 1 专家（World.ts:154）
  return w;
}

interface DropRec { key: string; n: number }
function hooks(w: World, p: Player, enemies: Enemy[],
  drops: DropRec[], kills: (Enemy | undefined)[], saucer: Enemy): GameHooks {
  return {
    world: w, player: p,
    enemies: () => enemies, critters: () => [],
    spawnDrop: (_x: number, _y: number, key: string, n: number) => {
      drops.push({ key, n });
      return null;
    },
    onEnemyKilled: (_key: string, en?: Enemy) => {
      if (en === saucer) kills.push(en);
      en!.dead = true;                     // Game.onEnemyKilled 消费面近似（移除语义）
    },
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

/** 生成飞碟 + 首帧建链（393×2/394×2/392×1）,返回 [saucer, hull392, mounts] */
function spawnSaucerEnsemble(diff: number) {
  const w = world(diff);
  const p = new Player(100 * TILE, 100 * TILE, new Inventory());
  const saucer = Enemy.fromVanilla(395, 100 * TILE, 120 * TILE)!;
  const enemies: Enemy[] = [saucer];
  const drops: DropRec[] = [];
  const kills: (Enemy | undefined)[] = [];
  const h = hooks(w, p, enemies, drops, kills, saucer);
  (h as unknown as { entities: { add: (e: unknown, _b: string) => void } }).entities =
    { add: (e: unknown) => enemies.push(e as Enemy) };
  martianSaucerAI(saucer, h, p);          // bInit:生成部件 + slots 装配
  const parts = enemies.filter((e) => e !== saucer);
  const hull = parts.find((e) => e.vanillaId === 392)!;
  const mounts = parts.filter((e) => e.vanillaId === 393 || e.vanillaId === 394);
  return { w, p, saucer, enemies, drops, kills, h, parts, hull, mounts };
}

function expectBossLoot(drops: DropRec[]): void {
  const ids = drops.map((d) => KEY_TO_ID.get(d.key)!).filter((x) => x !== undefined);
  // 六选一恒掉（denom 1,OneFromOptionsNotScalingWithLuck :921）
  expect(ids.filter((id) => SIX_POOL.includes(id))).toHaveLength(1);
  // Boss 药水 499 + 心 58（DoDeathEvents_DropBossPotionsAndHearts :79790;
  // NpcDrops.rollBossPotionsAndHearts 395 支 = 499 强效治疗 + Next(5)+5 心）
  expect(ids).toContain(499);
  expect(ids).toContain(58);
}

describe('BJ302 火星飞碟掉落链（经典自毁吞击定谳）', () => {
  it('建链:395 首帧生成 393×2/394×2/392×1,经典巡航期机体无敌（:14069 SetDefaults）', () => {
    const { saucer, mounts, parts } = spawnSaucerEnsemble(0);
    expect(mounts.map((m) => m.vanillaId).sort()).toEqual([393, 393, 394, 394]);
    expect(parts.find((e) => e.vanillaId === 392)).toBeTruthy();
    expect(saucer.ai0).toBe(0);
    expect(saucer.dontTakeDamage).toBe(true);
  });

  it('部件死亡零掉落（ItemDropDatabase 零注册 392/393/394,value=0f）', () => {
    const { h, p, drops, mounts } = spawnSaucerEnsemble(0);
    mounts[0].hurt(9999, 0, 0, h, 0, false, 1, true);   // pierce=1 免免疫帧干扰
    expect(mounts[0].dead).toBe(true);
    expect(drops).toHaveLength(0);
    void p;
  });

  it('★判别面:经典模式四炮全灭 → 392 置 ai0=3 → 自毁 9999 进死亡管线 → 掉落+记账', () => {
    const { saucer, h, p, drops, kills, hull, mounts } = spawnSaucerEnsemble(0);
    for (const m of mounts) m.dead = true;
    martianSaucerPartAI(hull, h, p);                    // 392 监控（:35884-35948）
    expect(saucer.ai0).toBe(3);                         // 经典 → 自毁臂
    expect(kills).toHaveLength(0);
    martianSaucerAI(saucer, h, p);                      // ai0===3 支:StrikeNPCNoInteraction(9999)
    // 修复前:9999 被 hurt() 头 dontTakeDamage 门吞 → 不死不掉（用户实报双症状）
    expect(saucer.dead).toBe(true);
    expect(kills).toHaveLength(1);                      // 记账恰一次
    expectBossLoot(drops);
  });

  it('★专家对拍:四炮全灭 → ai0=1 二阶段（不自毁）,解除无敌后打核心掉落', () => {
    const { saucer, h, p, drops, kills, hull, mounts } = spawnSaucerEnsemble(1);
    for (const m of mounts) m.dead = true;
    martianSaucerPartAI(hull, h, p);
    expect(saucer.ai0).toBe(1);                         // 专家 → 二阶段臂（:35945）
    expect(saucer.dead).toBe(false);
    martianSaucerAI(saucer, h, p);                      // 唯一解除点 :36738
    expect(saucer.dontTakeDamage).toBe(false);
    for (let i = 0; i < 150; i++) martianSaucerAI(saucer, h, p);   // 150t 过渡（:36740）
    expect(saucer.ai0).toBe(2);                         // 死光弹幕态
    saucer.hp = 1;
    saucer.hurt(9999, 0, 0, h, 0, false, 1, true);      // 核心段本体击杀
    expect(saucer.dead).toBe(true);
    expect(kills).toHaveLength(1);
    expectBossLoot(drops);
  });
});

// ===================== 掉落表数据面普查（火星疯狂全族,判谳=数据面无病） =====================
// 对拍反编译 ItemDropDatabase.cs RegisterMartianDrops(:899-:926) + 奖旗(:891)。
describe('BJ302 掉落表数据面:395 五项 + 事件敌怪 11 项 + 部件零注册', () => {
  const raw = JSON.parse(readFileSync(
    join(process.cwd(), 'src', 'data', 'vanilla-npcdrops.json'), 'utf8')) as {
    entries: Array<{ npcs?: number[]; global?: boolean; rule: Record<string, unknown> }>;
  };
  const by = (id: number) => raw.entries.filter((e) => !!e.npcs && e.npcs.includes(id));

  it('395 掉落五项逐字对拍反编译（:891/:921-:925）', () => {
    const boss = by(395);
    expect(boss).toHaveLength(5);
    expect(boss).toContainEqual({ npcs: [395], rule: { k: 'cond', cond: { name: 'LegacyHack_IsABoss', args: [] }, item: 3358, denom: 10, min: 1, max: 1, num: 1 } });
    expect(boss).toContainEqual({ npcs: [395], rule: { k: 'oneOf', denom: 1, num: 1, ids: SIX_POOL, noLuck: true } });
    expect(boss).toContainEqual({ npcs: [395], rule: { k: 'masterCommon', item: 4939 } });
    expect(boss).toContainEqual({ npcs: [395], rule: { k: 'masterAll', item: 4815, denom: 4 } });
    expect(boss).toContainEqual({ npcs: [395], rule: { k: 'common', item: 6173, denom: 50, min: 1, max: 1 } });
  });

  it('事件敌怪族 11 项逐字对拍 RegisterMartianDrops（:899-:913/:924）', () => {
    const eight = [520, 383, 389, 385, 382, 381, 390, 386];
    const has = (npcs: number[], rule: Record<string, unknown>) =>
      raw.entries.some((e) => !!e.npcs && e.npcs.length === npcs.length
        && npcs.every((n) => e.npcs!.includes(n))
        && JSON.stringify(e.rule) === JSON.stringify(rule));
    // 导线板 1/8×8-20 + 三稀有 1/800（激光钻/反重力钩/充能爆能炮）
    expect(has(eight, { k: 'common', item: 2860, denom: 8, min: 8, max: 20 })).toBe(true);
    expect(has(eight, { k: 'common', item: 2798, denom: 800, min: 1, max: 1 })).toBe(true);
    expect(has(eight, { k: 'common', item: 2800, denom: 800, min: 1, max: 1 })).toBe(true);
    expect(has(eight, { k: 'common', item: 2882, denom: 800, min: 1, max: 1 })).toBe(true);
    // 制服族 1/200：{383,389,386} 头/身/腿 ×3 + {385,382,381,390} 面罩/衣/裤 ×3
    for (const item of [2806, 2807, 2808]) {
      expect(has([383, 389, 386], { k: 'common', item, denom: 200, min: 1, max: 1 })).toBe(true);
    }
    for (const item of [2803, 2804, 2805]) {
      expect(has([385, 382, 381, 390], { k: 'common', item, denom: 200, min: 1, max: 1 })).toBe(true);
    }
    // Scutlix 枪 2771 1/30（:924）
    expect(has([390], { k: 'common', item: 2771, denom: 30, min: 1, max: 1 })).toBe(true);
  });

  it('部件 392/393/394 零注册（段归属=唯 395 死掷掉落）', () => {
    for (const id of [392, 393, 394]) expect(by(id)).toHaveLength(0);
  });
});
