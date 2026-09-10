// SW-FX17 M1 护卫勋章货币（CustomCurrencyID.DefenderMedals 全链）——获得/消费/显示
// 三面矩阵 + 五仓域修复回归 + 判别力（内存变异）。
//
// 反编译金标（Terarria1457；Terarria1458 同域三文件 diff 实证逐字节同源）：
//   CustomCurrencyManager.Initialize      CustomCurrencyManager.cs:14-18
//     （RegisterCurrency(new CustomCurrencySingleCoin(3817, 999L)) → id 0）
//   Player.BuyItem(price, customCurrency) Player.cs:34948-34951（1458 :35683）
//     → CustomCurrencyManager.BuyItem      CustomCurrencyManager.cs:70-121
//       · 计数段 :76-87 = 五仓 CountCurrency（inventory〔ignoreSlots{58,57,56,55,54}〕
//         + bank + bank2 + bank3 + bank4）→ CombineStacks（cap 999）
//       · 扣款段 :88-121 = slotCoins 构造序（j=inventory→bank→bank2→bank3→bank4，
//         k 升序）→ CustomCurrencySingleCoin.TryPurchasing :26-74（余款未尽全量回滚）
//   储蓄显示 DrawSavings                  CustomCurrencyManager.cs:28-63
//     （【只】合计 bank..bank4——背包勋章不进储蓄显示；num5>0 才画 :40）
//   获得面 DropMedals                     DD2Event.cs:326-341（全胜 3/15/60）
//     + 进波奖牌 :405-448（T1 波4/5 各1；T2 波5/6/7=1/3/6；T3 波4/5/6/7=1/3/11/25，
//       落点 = NPC 548 埃特尼亚水晶 :805-813 Item.NewItem 3817）
// ★SW-FX17 修复点：旧实现计数/扣款只扫背包（旧登记「本仓无账本系统」前提随 bank×4
//   在库而失实）——存进随身银行的勋章原版可消费（BuyItem 五仓），本仓此前读不到。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  countDefenderMedals, countDefenderMedalsAcross, spendDefenderMedalsAcross,
  defenderMedalSavingsOf, medalShopPrice,
  DEFENDER_MEDAL_ITEM_ID, DEFENDER_MEDAL_CAP, DEFENDER_MEDAL_TEXT_COLOR,
  type MedalPools,
} from '../src/stats/DefenderMedals';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { vanillaIdOfItem } from '../src/stats/Shimmer';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const medalId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[DEFENDER_MEDAL_ITEM_ID]];
const irondId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[7]];      // IronBar 非勋章对照物
const coinId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[71]];      // CopperCoin 钱币格对照物

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

const medal = (stack: number): Slot => ({ id: medalId, stack });
const empty40 = (): Slot[] => Array(40).fill(null);

/** 五仓池（inventory 58 槽 + 四银行各 40 槽——Player.banks 同构） */
function pools(inv: Slot[], b0: Slot[], b1: Slot[], b2: Slot[], b3: Slot[]): MedalPools {
  return { inventory: inv, banks: [b0, b1, b2, b3] };
}

// ---------------------------------------------------------------------------
// ① 消费面·计数（CustomCurrencyManager.BuyItem :76-87 五仓门口计数）
// ---------------------------------------------------------------------------
describe('SW-FX17 ① 消费面·五仓计数（BuyItem :76-87）', () => {
  it('五仓合计：背包 + 猪猪/保险箱/熔炉/虚空袋四银行（:76-82 五段 CountCurrency）', () => {
    const p = pools([medal(10), medal(20)], [medal(1)], [medal(2)], [medal(3)], [medal(4)]);
    expect(countDefenderMedalsAcross(p)).toBe(40);
  });

  it('背包段忽略弹药/镜像槽（ignoreSlots{58,57,56,55,54} :79——本仓 54-57 弹药格跳过）', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[53] = medal(10);       // 钱币区末槽（<54）→ 计入
    inv[54] = medal(90);       // 弹药格 → 忽略
    inv[57] = medal(90);       // 弹药格 → 忽略
    expect(countDefenderMedalsAcross(pools(inv, [], [], [], []))).toBe(10);
  });

  it('bank4 无 useVoidBag 前置门（:82 无条件扫 bank4——袋存勋章照常计数）', () => {
    const b3 = empty40(); b3[17] = medal(50);
    // inventory 与 bank0-2 全空、仅虚空袋有货 → 计数仍成立（旧实现此处=0=缺口本体）
    expect(countDefenderMedalsAcross(pools([], [], [], [], b3))).toBe(50);
  });

  it('合计 cap 999（CombineStacks :65-76）：超储按 999 计付', () => {
    const b0 = empty40(); b0[0] = medal(5000);
    expect(countDefenderMedalsAcross(pools([], b0, [], [], []))).toBe(DEFENDER_MEDAL_CAP);
    const p = pools([medal(600)], [medal(600)], [], [], []);
    expect(countDefenderMedalsAcross(p)).toBe(999);
  });

  it('非勋章物不计数；勋章叠内混词缀不计数偏差（Accepts=_valuePerUnit[type] :30-36）', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = { id: irondId, stack: 99 };
    inv[1] = { id: coinId, stack: 99 };
    inv[2] = { id: medalId, stack: 7, prefix: 1 };   // 勋章无词缀域，词缀位不碍计数
    expect(countDefenderMedalsAcross(pools(inv, [], [], [], []))).toBe(7);
  });

  it('单段函数（countDefenderMedals）行为保持：旧签名/旧调用形不回退', () => {
    expect(countDefenderMedals([medal(10), null, medal(40)])).toBe(50);
    expect(countDefenderMedals([medal(999), medal(500)])).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// ② 消费面·扣款（CustomCurrencyManager.BuyItem :88-121 + TryPurchasing :26-74）
// ---------------------------------------------------------------------------
describe('SW-FX17 ② 消费面·五仓扣款（TryPurchasing :26-74）', () => {
  it('扣序 = 背包[0..53] → bank → bank2 → bank3 → bank4（slotCoins 构造序 :95-103）', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(2); inv[40] = medal(1);
    const b0 = empty40(); b0[0] = medal(1);
    const b1 = empty40(); b1[0] = medal(1);
    const b2 = empty40(); b2[0] = medal(1);
    const b3 = empty40(); b3[0] = medal(2);
    expect(spendDefenderMedalsAcross(pools(inv, b0, b1, b2, b3), 7)).toBe(true);
    expect(inv[0]).toBeNull();            // 背包先耗尽（2）
    expect(inv[40]).toBeNull();           // 次槽（1）
    expect(b0[0]).toBeNull(); expect(b1[0]).toBeNull(); expect(b2[0]).toBeNull();
    expect(b3[0]).toEqual({ id: medalId, stack: 1 });   // 末仓 2 枚取 1（余款尽停）
  });

  it('跨仓找零：首仓不满额次仓续（min(stack,余款) :34-39）', () => {
    const b0 = empty40(); b0[3] = medal(4);
    const b3 = empty40(); b3[9] = medal(50);
    expect(spendDefenderMedalsAcross(pools([], b0, [], [], b3), 10)).toBe(true);
    expect(b0[3]).toBeNull();
    expect(b3[9]!.stack).toBe(44);
  });

  it('不足拒付全量回滚（ItemCacheRestore :68-72）：跨仓已扣位逐槽复原', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(2);
    const b0 = empty40(); b0[1] = medal(2);
    const b3 = empty40(); b3[2] = medal(2);
    const p = pools(inv, b0, [], [], b3);
    expect(spendDefenderMedalsAcross(p, 10)).toBe(false);
    expect(inv[0]).toEqual({ id: medalId, stack: 2 });   // 回滚
    expect(b0[1]).toEqual({ id: medalId, stack: 2 });
    expect(b3[2]).toEqual({ id: medalId, stack: 2 });
  });

  it('Game.npcShopBuy 生产接线钉死：五仓 spend 接入付款分流（旧单背包形必红）', () => {
    expect(srcMatch(/spendDefenderMedalsAcross\(\{\s*\n\s*inventory: this\.player\.inv\.slots,/)
      && srcMatch(/banks: this\.player\.banks as ReadonlyArray<ReadonlyArray<InvItem \| null>>,\s*\n\s*\}, price\)\) break;/))
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ③ 显示面（DrawSavings :28-63 bank-only + 支付能力 = BuyItem 全量）
// ---------------------------------------------------------------------------
describe('SW-FX17 ③ 显示面·储蓄（DrawSavings :28-40）与支付能力分流', () => {
  it('储蓄值【只】合计四仓——背包勋章不进储蓄显示（:28-39 无 inventory 段）', () => {
    const b0 = empty40(); b0[2] = medal(30);
    const b3 = empty40(); b3[5] = medal(12);
    expect(defenderMedalSavingsOf([b0, [], [], b3])).toBe(42);
    expect(defenderMedalSavingsOf([[], [], [], []])).toBe(0);   // 无储蓄 → 原版 num5>0 不画
  });

  it('储蓄 cap 999；与消费全量两域分立（背包有货时 savings < total）', () => {
    const b0 = empty40(); b0[0] = medal(5000);
    expect(defenderMedalSavingsOf([b0, [], [], []])).toBe(999);
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(5);
    const p = pools(inv, [], [], [], []);
    expect(defenderMedalSavingsOf(p.banks)).toBe(0);
    expect(countDefenderMedalsAcross(p)).toBe(5);   // 全量仍可付
  });

  it('勋章条目买价 = GetStoreValue 原值（medalShopPrice，GetItemExpectedPrice :266-271）', () => {
    expect(medalShopPrice(50, 100000)).toBe(50);   // 3813 熔炉：勋章 50 枚（非 10 金）
    expect(medalShopPrice(undefined, 2500)).toBe(2500);
    expect(DEFENDER_MEDAL_TEXT_COLOR).toBe('rgb(240,100,120)');   // CurrencyTextColor :18
  });

  it('Game 生产接线钉死：商店头部传储蓄值 + 第 6 参全量（NpcDialog afford 用全量）', () => {
    // openNpcShop → cb.onNpcShop（hasMedals 门：储蓄 / 全量双值）
    expect(srcMatch(/hasMedals \? this\.defenderMedalSavings\(\) : undefined,\s*\n\s*hasMedals \? this\.defenderMedalsOwned\(\) : undefined\);/)).toBe(true);
    // defenderMedalsOwned = 五仓 across（旧单背包形必红）
    expect(srcMatch(/countDefenderMedalsAcross\(\{\s*\n\s*inventory: p\.inv\.slots,/)).toBe(true);
    // NpcShop.open afford 臂（medalsTotal 缺省回落 medals 兼容旧形）
    expect(srcMatch(/it\.medal !== undefined \? \(medalsTotal \?\? medals \?\? 0\) >= it\.medal : copper >= it\.price;/, '../src/ui/NpcDialog.ts')).toBe(true);
    // 头部 medalLine = 储蓄值（值域修正后语义注释随行）
    expect(srcMatch(/medals !== undefined\s*\n\s*\? ` <span class="sw-shop-medals">🏅 ×\$\{medals\}<\/span>` : '';/, '../src/ui/NpcDialog.ts')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ 获得面（DD2Event DropMedals 全链——三档全胜 + 进波奖牌 + 水晶落点）
// ---------------------------------------------------------------------------
describe('SW-FX17 ④ 获得面·DD2 掉落链（DD2Event.cs:326-341/:405-448/:805-813）', () => {
  it('全胜三档 3/15/60（DropMedals(3)/(15)/(60) :330/:334/:339 → OldOnesArmy:301 同式）', () => {
    expect(srcMatch(/host\.dropAtCrystal\(3817, st\.ongoingDifficulty === 3 \? 60 : st\.ongoingDifficulty === 2 \? 15 : 3\);/, '../src/world/OldOnesArmy.ts')).toBe(true);
  });

  it('进波奖牌四档映射（T1 波4/5 各1；T2 5/6/7=1/3/6；T3 4/5/6/7=1/3/11/25 :405-448）', () => {
    const src = srcText('../src/world/OldOnesArmy.ts');
    expect(src).toContain('if (doneWave === 5 || doneWave === 4) res.medals = 1;');
    expect(src).toContain('if (doneWave === 7) res.medals = 6;');
    expect(src).toContain('else if (doneWave === 6) res.medals = 3;');
    expect(src).toContain('if (doneWave === 7) res.medals = 25;');
    expect(src).toContain('else if (doneWave === 6) res.medals = 11;');
    expect(src).toContain('else if (doneWave === 5) res.medals = 3;');
  });

  it('落点 = 埃特尼亚水晶 NPC 548（:805-813 循环 nPC.type==548 → Game.dropAtCrystal 同位）', () => {
    const src = srcText('../src/core/Game.ts');
    expect(src).toContain('if (prog.medals > 0) this.dd2Host().dropAtCrystal(3817, prog.medals);');
    expect(src).toMatch(/dropAtCrystal: \(vanillaItemId, count\) => \{[\s\S]*?vanillaId === 548[\s\S]*?spawnDrop\(crystal\.cx, crystal\.cy \+ 8, key, count/);
  });

  it('勋章物品注册链：vid 3817 反查闭合 + maxStack 9999（case 3817 无覆盖）', () => {
    expect(medalId).toBeDefined();
    expect(vanillaIdOfItem(medalId)).toBe(DEFENDER_MEDAL_ITEM_ID);
    expect(ITEM_DEFS[medalId].maxStack).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 判别力矩阵（内存变异——四路旧码/错码形在本矩阵下必红）
// ---------------------------------------------------------------------------
describe('SW-FX17 ⑤ 判别力矩阵（内存变异,四路错形逐路证实可捕）', () => {
  it('变异1 旧单背包计数形：bank4 有货场景下与五仓金标分歧（本批缺口本体可捕）', () => {
    const b3 = empty40(); b3[0] = medal(50);
    const legacySinglePool = (p: MedalPools): number => countDefenderMedals(p.inventory as Slot[]);
    const p = pools([], [], [], [], b3);
    expect(legacySinglePool(p)).not.toBe(countDefenderMedalsAcross(p));   // 0 vs 50
    expect(countDefenderMedalsAcross(p)).toBe(50);
  });

  it('变异2 储蓄含背包形：DrawSavings 值域混淆可捕（背包 5 枚被错计储蓄）', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(5);
    const p = pools(inv, [], [], [], []);
    const mutantSavings = countDefenderMedalsAcross(p);   // 错把全量当储蓄
    expect(mutantSavings).not.toBe(defenderMedalSavingsOf(p.banks));   // 5 vs 0
  });

  it('变异3 扣序倒置形（银行先于背包）：同价下槽位耗竭面不同,可捕', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(3);                                  // 背包 3 枚
    const b0 = empty40(); b0[0] = medal(10);            // 猪猪 10 枚
    const price = 5;
    // 金标：背包先行 → 背包耗尽、猪猪剩 8
    const gInv: Slot[] = Array(58).fill(null); gInv[0] = medal(3);
    const gB0 = empty40(); gB0[0] = medal(10);
    spendDefenderMedalsAcross(pools(gInv, gB0, [], [], []), price);
    expect(gInv[0]).toBeNull();
    expect(gB0[0]!.stack).toBe(8);
    // 变异：银行先行 → 猪猪 5 枚、背包 3 枚原封
    const mB0 = empty40(); mB0[0] = medal(10);
    let remain = price;
    for (let i = 0; i < mB0.length && remain > 0; i++) {
      const s = mB0[i]; if (!s) continue;
      const take = Math.min(s.stack, remain); s.stack -= take; remain -= take;
      if (s.stack <= 0) mB0[i] = null;
    }
    expect(mB0[0]!.stack).toBe(5);
    expect(mB0[0]!.stack).not.toBe(gB0[0]!.stack);      // 两形分歧可观测
  });

  it('变异4 无回滚形：不足拒付半扣残留可捕（金标=原位全复原）', () => {
    const inv: Slot[] = Array(58).fill(null);
    inv[0] = medal(2); inv[1] = medal(2);
    const p = pools(inv, [], [], [], []);
    spendDefenderMedalsAcross(p, 10);
    // 金标回滚后逐位复原；无回滚变异 → inv[0] 被扣空,与本断言冲突
    expect(inv[0]).toEqual({ id: medalId, stack: 2 });
    expect(inv[1]).toEqual({ id: medalId, stack: 2 });
  });

  it('变异5 拒付早退漏 cap 形：600+600 应按 999 封顶（错形=1200 可付超价差）', () => {
    const p = pools([medal(600)], [medal(600)], [], [], []);
    expect(countDefenderMedalsAcross(p)).toBe(999);
    expect(countDefenderMedalsAcross(p)).toBeLessThan(1200);   // 错形不可通过
  });
});

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function srcText(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
function srcMatch(re: RegExp, rel = '../src/core/Game.ts'): boolean {
  return re.test(srcText(rel));
}
