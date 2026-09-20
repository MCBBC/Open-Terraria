// BJ222 2026-09-20：数据面残差三件钉值（BJ217 提取器编码面恢复后的手补收口）。
// 方向判例：本刀盘上现库为错、提取器源码产出为对——三处均 BJ217 逐值定谳,本文件钉死
// 数据面终值,防再洗。锚复核（本刀动刀前快速复核,非重做全量定谳）：
//
// 【件 1】机器侠(353) 火星门:Terraria1457/Terraria/Chest.cs:2771
//   `if (Main.hardMode && NPC.downedMartians)` → SetDefaults(2863)/SetDefaults(3259)。
//   真行为修正：2863(火星染发剂 Martian Hair Dye)/3259(暮光染发剂 Twilight Hair Dye)
//   pre-Mars 泄漏面——cond 仅为 hardMode 时肉后未打火星入侵即可购买=泄漏。
//
// 【件 2】旅行商池位序:Chest.cs:1232-1234 `it = 2281 + Main.rand.Next(3);`
//   在 minimumRarity<=0 块的 rarity[0] 滚序第 2 位（2266 之后、2258 之前）。
//   RNG 消费序=池序判例：位序影响旅行商实际掷序,多重集不变只挪位。
//
// 【件 3】宝藏袋 3329 chance pair 编号:Player.cs:7516-7523（OpenBossBag）
//   Next(7)→2110 / Next(6)→6158 / Next(3)→1294,源码位序 pair=[1,2,3]。
//   pair 系 chance/chanceElse 配对链键（vanillaBossBags.ts:98-108）,3329 无 else 支,
//   pair 值纯唯二标签（语义零差）——但干跑对拍按字段全等,钉死免再报 loud。
//
// 数据面判据（BJ222 连锁验证 1-3 实测）：extract-shops/travelshop 干跑 live-only=0；
// extract-bossbags 沙箱重产与现库字节全等（md5 同）。
import { describe, it, expect } from 'vitest';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import travelshopJson from '../src/data/vanilla-travelshop.json';
import bossbagsJson from '../src/data/vanilla-bossbags.json';

type StockEntry = { id: number; price: number | null; cond: string | null };
type TravelEntry = { ids?: number[]; id?: number; tier: number; cond: string | null };
type BagCond = { t: string; n?: number; pair?: number; depth?: number };

const CYBORG_SHOP = (shopstockJson as { shops: Record<string, StockEntry[]> }).shops['353'];
const TRAVEL_ITEMS = (travelshopJson as { items: TravelEntry[] }).items;
const BAG_3329 = (bossbagsJson as { bags: Record<string, { spawns: Array<{ id: number; conds?: BagCond[] }> }> }).bags['3329'];

describe('BJ222 件1：机器侠 353 火星门（Chest.cs:2771 hardMode&&downedMartians）', () => {
  it('2863 cond = hardMode&&downedMartians', () => {
    const e = CYBORG_SHOP.find((x) => x.id === 2863);
    expect(e).toBeDefined();
    expect(e!.cond).toBe('hardMode&&downedMartians');
  });

  it('3259 cond = hardMode&&downedMartians', () => {
    const e = CYBORG_SHOP.find((x) => x.id === 3259);
    expect(e).toBeDefined();
    expect(e!.cond).toBe('hardMode&&downedMartians');
  });

  it('同店其余 hardMode 条目不被误扩（1983 保持纯 hardMode=源码 :2755 区独立分支）', () => {
    const e = CYBORG_SHOP.find((x) => x.id === 1983);
    expect(e!.cond).toBe('hardMode');
  });
});

describe('BJ222 件2：旅行商 ids 组位序 57（Chest.cs:1232-1234 RNG 消费序=池序）', () => {
  const idx = TRAVEL_ITEMS.findIndex((e) => Array.isArray(e.ids));
  const tail = [2258, 2242, 2260, 3637, 4420, 3119, 3118, 3099];

  it('ids 组 [2281,2282,2283] 恰在池位 57（2266 之后、2258 之前）', () => {
    expect(idx).toBe(57);
    expect(TRAVEL_ITEMS[idx].ids).toEqual([2281, 2282, 2283]);
    expect(TRAVEL_ITEMS[idx - 1].id).toBe(2266);
  });

  it('只挪位：原 57-64 位条目整体后移一位且池多重集不变', () => {
    expect(TRAVEL_ITEMS.slice(idx + 1, idx + 1 + tail.length).map((e) => e.id)).toEqual(tail);
    const ids = TRAVEL_ITEMS.map((e) => (e.ids ? `g:${e.ids.join(',')}` : `i:${e.id}`)).sort();
    expect(new Set(ids).size).toBe(TRAVEL_ITEMS.length); // 无重复无丢失
    expect(TRAVEL_ITEMS.filter((e) => e.tier === 0)).toHaveLength(10); // 9 单 id + 1 组
  });
});

describe('BJ222 件3：宝藏袋 3329 chance pair 源码位序 [1,2,3]（Player.cs:7516-7523）', () => {
  it('spawn 顺序 chance 三支 pair = 2110:1 / 6158:2 / 1294:3', () => {
    const chances = BAG_3329.spawns
      .filter((s) => s.conds?.length && s.conds[0].t === 'chance')
      .map((s) => ({ id: s.id, n: s.conds![0].n, pair: s.conds![0].pair }));
    expect(chances).toEqual([
      { id: 2110, n: 7, pair: 1 },
      { id: 6158, n: 6, pair: 2 },
      { id: 1294, n: 3, pair: 3 },
    ]);
  });

  it('pair 值唯二标签性：全袋 chance+chanceElse pair 域 = {1,2,3} 且 3329 无 else 支', () => {
    const allConds = BAG_3329.spawns.flatMap((s) => s.conds ?? []);
    expect(allConds.some((c) => c.t === 'chanceElse')).toBe(false);
    const pairs = new Set(allConds.filter((c) => c.pair != null).map((c) => c.pair));
    expect([...pairs].sort()).toEqual([1, 2, 3]);
  });
});
