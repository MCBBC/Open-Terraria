// 清偿刀 H（2026-09-29）：PriceAdjustment 幸福价消费面接线回归。
// 反编译标杆 Terarria1457（1458 ShopHelper.cs 逐字节全等——diff 定谳 2026-09-29，
// 幸福价域无热补丁变更）：
//   乘区产出  Terraria.GameContent/ShopHelper.cs ProcessMood :99-178
//             （钳 [0.75,1.5] + 0.01 圆 :180-185 LimitAndRoundMultiplier）
//             → ShoppingSettings.PriceAdjustment（ShoppingSettings.cs:5）
//   快照点    Player.SetTalkNPC Player.cs:4370-4374（非对话 = NotInShop 1f，:9-14）
//   消费面    重铸  Main.cs:42302 DrawInventory 哥布林费用段（×0.8 → ×PA → ÷3）
//             商店  Player.cs:34907-34946 GetItemExpectedPrice（买 ×PA/卖 ÷PA——既有接线）
//             护士  Main.cs:40793 GetNurseHealCost（×PA；本仓快照源勘正）
//             税官  Main.cs:40625 金币条显示 / :40878 实付（÷PA）
//             钓鱼  Player.cs:56968 GetAnglerReward（稀有度 ×(PA+1)/2）
//             理发  Main.cs:44538（既有接线 hairRestylePrice）
//             成就  Player.cs:4376 ≤0.82（既有接线）
// 变异证红两发：①摘 reforgeCost 乘区→①段红；②÷3 先行→阶序断言红（见会话记录）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import itemValueJson from '../src/data/vanilla-itemvalue.json';
import { computeHappiness, type BiomeZones } from '../src/data/vanillaHappiness';
import { rollAnglerRewards, seededRng, type Rng } from '../src/data/vanillaFishing';

const ITEM_VALUE = itemValueJson as Record<string, number>;

/** vid → def 下标（reforge-reach-1457 同构;reforgeCost 内部 vid 解析消费面） */
function defIdxOfVid(vid: number): number {
  return ITEM_DEFS.findIndex((d) => {
    if (!d) return false;
    const v = (d as { vid?: number }).vid
      ?? ((d as { key: string }).key.startsWith('vi_')
        ? parseInt((d as { key: string }).key.slice(3), 10) : -1);
    return v === vid;
  });
}

/** Game 原型桩（finalzero/reforge-reach 同式）+ 可覆盖的最小状态面 */
function gameStub(state: Record<string, unknown>): Game {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  Object.assign(g, state);
  return g as unknown as Game;
}

/** 闪电之击 6155 真价值链（vanilla-itemvalue 50000 铜，Item.cs:47450） */
const LIGHTNING_STRIKE_IDX = defIdxOfVid(6155);
const reforgeCostOf = (g: Game, stack = 1): number =>
  (Game.prototype.reforgeCost as (i: { id: number; stack: number }) => number)
    .call(g, { id: LIGHTNING_STRIKE_IDX, stack });

// ===========================================================================
// ① reforgeCost：幸福乘区开/关两态 + 折扣阶序（Main.cs:42297-42303）
// ===========================================================================
describe('清偿刀H-① reforgeCost ×PriceAdjustment（:42302）', () => {
  const base = { equipStats: { discount: false } };

  it('关：非对话态（NotInShop 1f）= 50000/3 = 16666（接线前原值不变）', () => {
    const g = gameStub({ player: base, dialogHappiness: null });
    expect(reforgeCostOf(g)).toBe(16666);
  });

  it('开：Like 档 0.94 → trunc(f32(50000×0.94))/3 = 15666', () => {
    const g = gameStub({ player: base, dialogHappiness: { priceMul: 0.94, report: [] } });
    expect(reforgeCostOf(g)).toBe(15666);
  });

  it('开：Dislike 档 1.06 → 17666；钳顶 1.5（无家/离家/邪恶群系）→ 25000；钳底 0.75 → 12500', () => {
    expect(reforgeCostOf(gameStub({ player: base, dialogHappiness: { priceMul: 1.06, report: [] } }))).toBe(17666);
    expect(reforgeCostOf(gameStub({ player: base, dialogHappiness: { priceMul: 1.5, report: [] } }))).toBe(25000);
    expect(reforgeCostOf(gameStub({ player: base, dialogHappiness: { priceMul: 0.75, report: [] } }))).toBe(12500);
  });

  it('阶序：折扣 ×0.8 先行 → ×PA → ÷3（:42299→:42302→:42303）——50000 折扣+1.06 = 14133', () => {
    const g = gameStub({ player: { equipStats: { discount: true } }, dialogHappiness: { priceMul: 1.06, report: [] } });
    // 原版链：floor(50000×0.8)=40000 → trunc(f32(40000×1.06f))=42399（f32 乘积
    // 42399.99609375,C# (long) 截断）→ floor(42399/3)=14133。
    // ÷3 先行错序 = floor(floor(floor(50000/3)×0.8)×1.06)=14131 ≠ 14133（变异②证红点）
    expect(reforgeCostOf(g)).toBe(14133);
    expect(Math.floor(Math.floor(Math.floor(50000 / 3) * 0.8) * 1.06)).toBe(14131);
  });

  it('折扣+0.94 = 12533（floor(40000×0.94)=40000×f32(0.94) 积 47000 整 → /3）——等比缩放臂', () => {
    const g = gameStub({ player: { equipStats: { discount: true } }, dialogHappiness: { priceMul: 0.94, report: [] } });
    expect(reforgeCostOf(g)).toBe(12533);
  });

  it('min-1 兜底仍在（:42309 num60<1→1）——零价值物品重铸价 1', () => {
    // 任取首个已注册且 vanilla-itemvalue 缺表（=原版未赋 value 0）的 vid
    const idx = ITEM_DEFS.findIndex((d) => {
      if (!d) return false;
      const v = (d as { vid?: number }).vid
        ?? ((d as { key: string }).key.startsWith('vi_')
          ? parseInt((d as { key: string }).key.slice(3), 10) : -1);
      return v >= 0 && ITEM_VALUE[String(v)] === undefined;
    });
    expect(idx, '应存在已注册且 value=0 的物品').toBeGreaterThanOrEqual(0);
    const g = gameStub({ player: base, dialogHappiness: null });
    expect((Game.prototype.reforgeCost as (i: { id: number; stack: number }) => number)
      .call(g, { id: idx, stack: 1 })).toBe(1);
  });
});

// ===========================================================================
// ② 护士费快照源勘正（Main.cs:40793 ×currentShoppingSettings——SetTalkNPC 快照）
// ===========================================================================
describe('清偿刀H-② nurseHealCost 读 dialogHappiness（Player.cs:4370-4374 同源）', () => {
  const mkG = (pa: number | null, staleShop: number) => gameStub({
    player: {
      maxHp: 200, hp: 100,
      buffs: { debuffCount: () => 0 },
      equipStats: { discount: false },
    },
    world: { flags: {}, isExpert: false },
    dialogHappiness: pa === null ? null : { priceMul: pa, report: [] },
    shopHappinessMul: staleShop,   // 陈店态：旧实现误读此处
  });
  const costOf = (g: Game): number =>
    (Game.prototype as unknown as { nurseHealCost(): number }).nurseHealCost.call(g);

  it('对话快照 0.94（护士 Like 档）→ 100×0.94 = 94（旧实现读陈店 1 → 100）', () => {
    expect(costOf(mkG(0.94, 1))).toBe(94);
  });

  it('折扣+幸福阶序：floor(100×0.8)=80 → ×0.94 → 75', () => {
    const g = mkG(0.94, 1);
    (g as unknown as { player: { equipStats: { discount: boolean } } }).player.equipStats.discount = true;
    expect(costOf(g)).toBe(75);
  });

  it('非对话态 NotInShop → ×1（100）', () => {
    expect(costOf(mkG(null, 1))).toBe(100);
  });
});

// ===========================================================================
// ③ 税官实付 ÷PA（Main.cs:40878 (int)((float)taxMoney/PA) + :40907 清零）
// ===========================================================================
describe('清偿刀H-③ taxCollect ÷PriceAdjustment（税官自身幸福价）', () => {
  const mkG = (taxMoney: number, pa: number | null) => {
    const calls: { gain: number[]; toasts: string[] } = { gain: [], toasts: [] };
    const g = gameStub({
      player: { taxMoney },
      dialogHappiness: pa === null ? null : { priceMul: pa, report: [] },
      cb: { onToast: (m: string) => calls.toasts.push(m), onInventoryChanged: () => undefined },
      gainCopper: (n: number) => calls.gain.push(n),
      sfx: { play: () => undefined },
    });
    return { g, calls };
  };
  const collect = (g: Game) => (Game.prototype as unknown as { taxCollect(): void }).taxCollect.call(g);

  it('happy 税官 0.75：250000/0.75 = 333333 入包，税款清零', () => {
    const { g, calls } = mkG(250000, 0.75);
    collect(g);
    expect(calls.gain).toEqual([333333]);
    expect((g as unknown as { player: { taxMoney: number } }).player.taxMoney).toBe(0);
  });

  it('unhappy 税官 1.5：250000/1.5 = 166666（差额随乘区弃置）', () => {
    const { g, calls } = mkG(250000, 1.5);
    collect(g);
    expect(calls.gain).toEqual([166666]);
  });

  it('÷PA 截为 0（1 铜×1.5）：无币发放但税款照清（:40907 无条件清零）', () => {
    const { g, calls } = mkG(1, 1.5);
    collect(g);
    expect(calls.gain).toEqual([]);
    expect((g as unknown as { player: { taxMoney: number } }).player.taxMoney).toBe(0);
  });

  it('零税款：TaxEmpty 门（:40873 除前）不发放', () => {
    const { g, calls } = mkG(0, 0.75);
    collect(g);
    expect(calls.gain).toEqual([]);
    expect(calls.toasts.length).toBe(1);
  });
});

// ===========================================================================
// ④ 渔夫任务奖励稀有度 ×(PA+1)/2（Player.cs:56968；缺省 NotInShop=1f→×1）
// ===========================================================================
describe('清偿刀H-④ rollAnglerRewards priceAdjustment（:55356）', () => {
  const ACC_POOL = new Set([2373, 2374, 2375, 3120, 3037, 3096, 5139]);
  const countAcc = (seed: number, pa: number | undefined, n = 3000): number => {
    const rng: Rng = seededRng(seed);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const grants = rollAnglerRewards({
        questsDone: 0, questItemType: 2450, hardMode: false,
        ownedTypes: new Set(), ...(pa !== undefined ? { priceAdjustment: pa } : {}), rng,
      });
      if (grants.some((g) => ACC_POOL.has(g.id))) hits++;
    }
    return hits;
  };
  it('unhappy 渔夫(1.5→×1.25)配件池命中【少于】happy(0.75→×0.875)（3000 试确定性种子）', () => {
    // 方向定谳（Player.cs:55434-55438 亲读）：num2=(1-Π(1-1/⌊40r⌋)³(1-1/⌊30r⌋)³
    // (1-1/⌊25r⌋))×0.8——r 越大分母越大、(1-1/x) 越接近 1 → num 越接近 1 →
    // num2【越小】。即 PA 高（渔夫 unhappy）→ 稀有名档（:55440+ Next((int)(250r))==0
    // 族）更易、配件（安慰奖池）更难——双面同源自洽。1.125: 45/33/28 vs 0.7875: 31/23/19
    const hi = countAcc(20260929, 1.5);
    const lo = countAcc(20260929, 0.75);
    expect(hi).toBeLessThan(lo);
  });
  it('缺省（未传 pa）= NotInShop 1f → ×1（旧缺省 0 曾使乘区恒 ×0.5）', () => {
    // 缺省臂与显式 pa=1 同种子全等（同掷流+同乘区）
    const def = countAcc(777, undefined, 600);
    const one = countAcc(777, 1, 600);
    expect(def).toBe(one);
    // 且配件命中多于旧缺省语义 ×0.5（pa=0）——防回退到「恒减半」
    expect(def).toBeLessThan(countAcc(777, 0, 600));
  });
});

// ===========================================================================
// ⑤ remixWorld 门（ProcessMood :107 提前 return——remix 世界幸福价恒 1f）
// ===========================================================================
describe('清偿刀H-⑤ computeHappiness remixWorld 门（ShopHelper.cs:107）', () => {
  const Z: BiomeZones = {
    forest: false, ocean: false, snow: false, desert: false,
    jungle: false, underground: false, hallow: false, mushroom: false,
  };
  const unhappy = {
    npcVanillaId: 17, homeless: true, distFromHome: 200,
    playerInCorrupt: true, playerInCrimson: false, playerInDungeon: false,
    zones: Z, npcsInHouse: 6, npcsInVillage: 5, nearby: [18, 19, 20, 22] as number[],
    isPrincess: false,
  };
  it('remix 世界：无家+邪恶群系+拥挤全踩仍 priceMul=1、无报告', () => {
    const r = computeHappiness({ ...unhappy, remixWorld: true });
    expect(r.priceMul).toBe(1);
    expect(r.report).toEqual([]);
  });
  it('非 remix：同输入走完整链 → 钳顶 1.5（对照臂）', () => {
    const r = computeHappiness({ ...unhappy });
    expect(r.priceMul).toBe(1.5);
    expect(r.report.length).toBeGreaterThan(0);
  });
});
