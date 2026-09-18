// 1457 新段重铸可达回归（2026-09-18 用户实报「闪电之击无法在哥布林工匠重铸」）。
// 定谳链：
//   实体 = 闪电之击 LightningStrike = ItemID 6155（Item.cs:47447-47450
//     DefaultToStaff(1117,8,55,30)+SetWeaponValues(150,10,10)+SetShopValues(
//     LightPurple6, sellPrice(0,1))→ magic=true/rare=6/value=50000 铜；
//     配方 = 4062 雷霆之击+光明之魂24+神圣锭20+AdamantiteBar 组,Recipe.cs:11327-11331）。
//   原版门 = ItemSlot.PickItemMovementAction case5（Terraria.UI/ItemSlot.cs:1493）
//     `CanHavePrefixes() || type==0` → Item.CanHavePrefixes（Item.cs:494-497）
//     = GetRollablePrefixes()!=null（Item.cs:1102-1132 集合序判定）；
//     PrefixLegacy.ItemSets.Magic 含 6155（PrefixLegacy.cs:73,1457 终值;1458 同文）。
//   本仓缺口 = tools/extract-equip-prefix.mjs 锚 1456 时 vanilla-prefix.json
//     itemSets 对 6147-6195 新段零收录——Magic 缺 [6152,6153,6154,6155,6171,6173]、
//     Summon 缺 [6148,6149,6161,6164]（1456↔1457 PrefixLegacy 漂移=恰好这两行）,
//     rollablePrefixes(6155)=null → canReforge=false → UI 槽位门
//     （UI.ts showReforge/3373 域,vanilla 布局 3410/classic modal 9558 两路同门）
//     弹「此物品无法重铸」。
// 本文件锚：
//   ① 池身份：6155 → PrefixesForMagic 全等（错池/缺收录必红）；
//   ② 10 件新段 + DD2 四族 12 件哨兵可达矩阵（canReforge 真门,负/正对照）；
//   ③ doReforge 端到端（真 reforgeCost 价值面 50000/3=16666 + 真池掷出 ∈ 魔法池
//     + topTier 判定）；变异证红：摘 6155（可达红）/ 挪池（身份红）两发见会话记录。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

// ---- 确定性掷点钩（sw-fx60 同款：只劫 rollPrefix,其余透传） ----
const rollHook = vi.hoisted(() => ({ pick: null as null | ((pool: number[]) => number) }));
vi.mock('../src/data/vanillaPrefixes', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/data/vanillaPrefixes')>();
  const origRoll = m.rollPrefix;
  return {
    ...m,
    rollPrefix: (pool: number[], wantBest: boolean) =>
      rollHook.pick ? rollHook.pick(pool) : origRoll(pool, wantBest),
  };
});
beforeEach(() => { rollHook.pick = null; });

const pfx = await vi.importActual<typeof import('../src/data/vanillaPrefixes')>(
  '../src/data/vanillaPrefixes');
const { ITEM_DEFS } = await import('../src/data/items');

/** vid → { id, vid }（canReforge 内部 vid 解析同构:def.vid ?? vi_ 键段） */
function defOfVid(vid: number): { id: number; key: string } | undefined {
  const idx = ITEM_DEFS.findIndex((d) => {
    const v = (d as { vid?: number }).vid
      ?? ((d as { key: string }).key.startsWith('vi_')
        ? parseInt((d as { key: string }).key.slice(3), 10) : -1);
    return v === vid;
  });
  return idx >= 0 ? { id: idx, key: (ITEM_DEFS[idx] as { key: string }).key } : undefined;
}
function canReforgeOf(vid: number): boolean {
  const e = defOfVid(vid);
  expect(e, `vid ${vid} 应已注册为物品 def`).toBeDefined();
  return (Game.prototype.canReforge as (i: { id: number }) => boolean).call(
    undefined as unknown as Game, { id: e!.id });
}

// 1457 新段 10 件（PrefixLegacy.cs:73/75;1458 同文）
const MAGIC_1457 = [6152, 6153, 6154, 6155, 6171, 6173] as const;
const SUMMON_1457 = [6148, 6149, 6161, 6164] as const;
// DD2 四族哨兵（ItemID.cs:9182-9214）：Flameburst 3818-3820 / Ballistra 3824-3826 /
// LightningAura 3829-3831 / ExplosiveTrap 3832-3834
const DD2_SENTINELS = [3818, 3819, 3820, 3824, 3825, 3826, 3829, 3830, 3831, 3832, 3833, 3834] as const;

describe('重铸可达·1457 新段（用户实报:6155 闪电之击不可重铸）', () => {
  it('① 6155 池身份=PrefixesForMagic 全等（36 词缀,错池必红）', () => {
    expect(pfx.rollablePrefixes(6155, false)).toEqual(pfx.PREFIX_POOLS.PrefixesForMagic);
    expect(pfx.PREFIX_POOLS.PrefixesForMagic).toHaveLength(36);
  });

  it('② 新段 magic 6 件 + summon 4 件 canReforge 真门全可达', () => {
    for (const vid of [...MAGIC_1457, ...SUMMON_1457]) {
      expect(canReforgeOf(vid), `vid ${vid} 应可重铸`).toBe(true);
    }
  });

  it('③ 6155 入魔法池、6161/6164 入召唤池（挪池变异必红）', () => {
    expect(pfx.rollablePrefixes(6155, false)).toEqual(pfx.PREFIX_POOLS.PrefixesForMagic);
    for (const vid of SUMMON_1457) {
      expect(pfx.rollablePrefixes(vid, false), `vid ${vid} 池身份`).toEqual(
        pfx.PREFIX_POOLS.PrefixesForSummons);
    }
    expect(pfx.PREFIX_POOLS.PrefixesForSummons).toHaveLength(22);
  });

  it('④ DD2 四族 12 件哨兵全可达（召唤池;同病普查对照面）', () => {
    for (const vid of DD2_SENTINELS) {
      expect(canReforgeOf(vid), `DD2 vid ${vid} 应可重铸`).toBe(true);
      expect(pfx.rollablePrefixes(vid, false)).toEqual(pfx.PREFIX_POOLS.PrefixesForSummons);
    }
  });

  it('⑤ 负/正对照：火把 8/铜币 71 不可重铸,铜镐 3507 走剑镐池', () => {
    expect(canReforgeOf(8)).toBe(false);
    expect(canReforgeOf(71)).toBe(false);
    expect(canReforgeOf(3507)).toBe(true);
    expect(pfx.rollablePrefixes(3507, false)).toEqual(pfx.PREFIX_POOLS.PrefixesForSwords);
  });

  it('⑥ doReforge 端到端:6155 真价值面 50000/3=16666 + 掷出恒 ∈ 魔法池 + topTier 判定', async () => {
    const e = defOfVid(6155)!;
    const wav: string[] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.player = new Player(60 * 16, 100 * 16, new Inventory());
    g.cb = {};
    g.sfx = { playWavFile: (name: string) => { wav.push(name); } };
    g.coinsOwned = () => 999999;
    g.spendCopper = () => true;
    g.spawnParticles = () => undefined;
    g.spawnDust = () => ({ vx: 0, vy: 0 });
    g.broadcastParticleOrchestra = () => undefined;

    const item = { id: e.id, stack: 1, prefix: undefined as number | undefined };
    // 真价值链（reforgeCost 不桩）：vanilla-itemvalue 6155=50000（Item.cs:47450
    // sellPrice(0,1)=1金×5）→ floor(50000/3)=16666,无折扣
    const cost = (g.reforgeCost as (i: { id: number; stack: number }) => number)(item);
    expect(cost).toBe(16666);

    // 最优档掷中 → topTier=true + best_reforge 音（Main.cs:42620-42626）
    const pool = pfx.PREFIX_POOLS.PrefixesForMagic;
    const bestVal = Math.max(...pool.map(pfx.prefixValueMul));
    const top = pool.find((q) => pfx.prefixValueMul(q) === bestVal)!;
    rollHook.pick = () => top;
    const out = { topTier: false };
    const np = (g.doReforge as (
      i: { id: number; stack: number; prefix?: number },
      out?: { topTier: boolean }) => number)(item, out);
    expect(np).toBe(top);
    expect(out.topTier).toBe(true);
    expect(wav).toContain('best_reforge');

    // 20 连掷（钩透传真 rollPrefix）:结果恒 ∈ 魔法池且 ∈ doReforge 可达域
    rollHook.pick = null;
    for (let i = 0; i < 20; i++) {
      const r = (g.doReforge as (
        i: { id: number; stack: number; prefix?: number },
        out?: { topTier: boolean }) => number)(item, { topTier: false });
      expect(pool).toContain(r);
      expect(r).not.toBe(0);   // Prefix(-2) 保底出词缀(重铸支 wantBest=true)
    }
  });
});
