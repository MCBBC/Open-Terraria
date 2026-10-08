// BJ565 钱币槽召唤的飞猪存钱罐无法快速堆叠（用户实报 2026-10）判别+回归专测——
// 定谳锚（亲读 Terarria1457 反编译）：
//  · NearbyChests.GetBanksInRangeOf（Terraria.GameContent/NearbyChests.cs:33-91）：
//    【弹幕段 :44-58 在前】（全弹扫 + TryGetContainerIndex 命中 → !scratch.Contains(bank)
//    去重入列,position=projectile.Center :57）、【tile 段 :61-89 在后】（同 bank 对象
//    续去重 :83）——两段共用一张 scratch 表,序=弹段先、tile 段续。
//  · Projectile.TryGetContainerIndex（Projectile.cs:80559-80566）：525 FlyingPiggyBank
//    （钱币槽 Item 3213 shoot,P.cs:5955-5963/Item.cs:28979-28990）与 960 ChesterPet →
//    containerIndex -2 = player.bank;734 VoidLens → -5 = player.bank4。
//  · ContainerIndexToPlayerBank（NearbyChests.cs:97-130）：-5 支背包 58 格持 5325
//    ClosedVoidBag → 拒（vault 关闭态不可收）。
//  · QuickStackToNearbyBanks（QuickStacking.cs:238-250）：foreach bank { ChestUI.
//    MoveCoins + VisualizeChestTransfer_CoinsBatch(player.Center, item.position…) }
//    → 单次 Transfer。item.position 弹幕段 = projectile.Center、tile 段 =(j·16+16,k·16+16)。
//  · ⇒ 原版 Quick Stack（键位链 QuickStackAllChests）目标集【含飞猪存钱罐】。
//  · 本仓病灶：QuickStacking.nearbyBanksInRange 只移植 tile 段（Q-F1 批,头注自认
//    ":61-89"）→ 弹幕段缺席,飞猪不在 Quick Stack 目标集（合成源侧 craftSources 同段
//    已接线 = SW-AZ1 先例,Game.ts craftSources 内 FlyingPiggyBank/960/734 三支）。
//  · DepositAll 对照面：飞猪面板 chest=-2 开箱钮（ChestUI.DepositAll :536 else 支 →
//    player.bank / ChestUI.QuickStack :657 chest==-2 支 → MoveCoins(player.bank)）——
//    开面板路径走 openChest x=-2 = banks[0]（Game.interactContainerPet）本就覆盖,
//    quickStackIntoContainer isBank 面即其纯函数;本刀只补【键位链 bank 盒扫弹幕段】。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import {
  quickStackToChests, quickStackIntoContainer, moveCoinsIntoBank,
  nearbyBanksInRange, projectileBankHits,
} from '../src/stats/QuickStacking';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

/** Game.quickStackAllChests 合并式的纯函数镜像（弹段在前 + tile 段按 bi 续去重） */
function mergedBankHits(
  store: TileStore, pcxPx: number, pcyPx: number,
  pets: Parameters<typeof projectileBankHits>[2],
  banks: ReadonlyArray<Slot[] | null>, voidVaultHeld: boolean,
): ReturnType<typeof projectileBankHits> {
  const projHits = projectileBankHits(pcxPx, pcyPx, pets, banks, voidVaultHeld);
  const seen = new Set(projHits.map((h) => h.bi));
  const pcx = Math.floor(pcxPx / 16), pcy = Math.floor(pcyPx / 16);
  return [...projHits,
    ...nearbyBanksInRange(store, pcx, pcy, banks, voidVaultHeld).filter((h) => !seen.has(h.bi))];
}

// ===================== BJ565-T1 判别：飞猪进 Quick Stack 目标集 =====================
describe('BJ565-T1 弹幕段判别（GetBanksInRangeOf :44-58）', () => {
  it('飞猪（525→bi0）射程盒内 → projectileBankHits 命中 banks[0],键位链实测入猪', () => {
    const inv = new Inventory();
    const torch = iid(8);
    inv.slots[10] = { id: torch, stack: 5 };
    const bank0 = Array<Slot>(40).fill(null);
    bank0[0] = { id: torch, stack: 2 };   // 同型非空 → 过 IsEmpty 门（Transfer :415）
    const store = new TileStore(200, 120);
    // 玩家中心 px(1680,1056)=格(105,66);飞猪盒 (2000,1000,30,24) 中心 px(2015,1012)
    const pets = [{ x: 2000, y: 1000, w: 30, h: 24, bi: 0 }];
    const projHits = projectileBankHits(1680, 1056, pets, [bank0, null, null, null], false);
    expect(projHits).toHaveLength(1);
    expect(projHits[0]).toMatchObject({ bi: 0, px: 2015, py: 1012 });   // position=proj.Center（:57）
    // Game 合并链镜像：单次 Transfer（QuickStackToNearbyBanks :240-248）
    const hits = mergedBankHits(store, 1680, 1056, pets, [bank0, null, null, null], false);
    const r = quickStackToChests(inv,
      hits.map((b) => ({ x: b.tx, y: b.ty, items: b.items })), false);
    expect(bank0[0]!.stack).toBe(7);          // FillStack 补叠入猪
    expect(inv.slots[10]).toBeNull();          // 源格清空
    expect(r.touched).toHaveLength(1);
    expect(r.blockedSlots).toEqual([]);        // bank 径永零 blocked（:248 断言面）
  });

  it('射程盒边界（Rectangle.Contains 闭盒 X±num）：最近点格恰在界上=命中,出界=不命中', () => {
    const store = new TileStore(400, 200);
    const bank0 = Array<Slot>(40).fill(null);
    bank0[0] = { id: iid(8), stack: 1 };
    const banks: ReadonlyArray<Slot[] | null> = [bank0, null, null, null];
    // 玩家中心格 (105,66),num=39 → 盒 X∈[66,144]。猪盒左缘 x=2303 → 最近点格 143（≤144 命中）
    const edgeIn = [{ x: 2303, y: 1050, w: 30, h: 24, bi: 0 }];
    expect(projectileBankHits(1680, 1056, edgeIn, banks, false)).toHaveLength(1);
    // 猪盒左缘 x=2320 → 最近点格 145（>144 出界）
    const edgeOut = [{ x: 2320, y: 1050, w: 30, h: 24, bi: 0 }];
    expect(projectileBankHits(1680, 1056, edgeOut, banks, false)).toEqual([]);
  });

  it('ClosestPointInRect 判定式（:50-51）：盒心出界但最近角在界内 → 命中（petInRange 同式,2026-08-28 用户案）', () => {
    const bank0 = Array<Slot>(40).fill(null);
    bank0[0] = { id: iid(8), stack: 1 };
    const banks: ReadonlyArray<Slot[] | null> = [bank0, null, null, null];
    // 玩家中心 px(1680,1056)=格(105,66),盒 Y∈[27,105]。高抛猪悬停盒上方:
    // 盒 (1665,700,30,24) 底缘 y=724 → 最近点 (1680,724) 格 ty=45 ∈ 盒 → 命中
    // （盒心 ty=44 亦在界内——再抬高到最近点出界即不命中,判据=最近点非盒心）
    const highPig = [{ x: 1680 - 15, y: 700, w: 30, h: 24, bi: 0 }];
    expect(projectileBankHits(1680, 1056, highPig, banks, false)).toHaveLength(1);
    // 盒 (1665,400,30,24) 底缘 y=424 → 最近点格 ty=26 < 27 出界 → 不命中
    const tooHigh = [{ x: 1680 - 15, y: 400, w: 30, h: 24, bi: 0 }];
    expect(projectileBankHits(1680, 1056, tooHigh, banks, false)).toEqual([]);
  });
});

// ===================== BJ565-T2 跨段去重与序（!scratch.Contains :52/:83）=====================
describe('BJ565-T2 弹段先、tile 段续,同 bank 单入列', () => {
  it('飞猪弹 + 场上猪罐 tile 同 bank → 只入列一次且序=弹段先（fx 终点=猪心）;tile 保险箱照常追加', () => {
    const store = new TileStore(200, 120);
    store.setTileSilent(99, 63, TILE_INTERNAL_BY_SHEET.get(29)!);    // tile 猪罐（bi0）
    store.setTileSilent(110, 66, TILE_INTERNAL_BY_SHEET.get(97)!);   // 保险箱（bi1）
    const bank0 = Array<Slot>(40).fill(null);
    const bank1 = Array<Slot>(40).fill(null);
    bank1[0] = { id: iid(8), stack: 1 };
    const pets = [{ x: 1560, y: 1000, w: 30, h: 24, bi: 0 }];   // 猪心 px(1575,1012)=格(98,63)
    const hits = mergedBankHits(store, 1680, 1056, pets, [bank0, bank1, null, null], false);
    expect(hits.map((h) => h.bi)).toEqual([0, 1]);              // bi0 唯一（tile 猪罐被去重）
    expect(hits[0]).toMatchObject({ px: 1575, py: 1012 });      // 弹段 position=proj.Center
    expect(hits[1]).toMatchObject({ tx: 110, ty: 66 });         // tile 段原锚
    expect(hits[0].px).toBeDefined();                           // 弹段带 px/py（fx 终点）
    expect(hits[1].px).toBeUndefined();                         // tile 段无（走 (tx+1)·16 锚）
  });

  it('弹段内同 bank 多弹（双猪共存窗）单入列（首弹位为准）', () => {
    const bank0 = Array<Slot>(40).fill(null);
    bank0[0] = { id: iid(8), stack: 1 };
    const banks: ReadonlyArray<Slot[] | null> = [bank0, null, null, null];
    const pets = [
      { x: 2000, y: 1000, w: 30, h: 24, bi: 0 },
      { x: 2100, y: 1020, w: 30, h: 24, bi: 0 },
    ];
    const hits = projectileBankHits(1680, 1056, pets, banks, false);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ px: 2015, py: 1012 });      // 首见弹的 Center
  });
});

// ===================== BJ565-T3 透镜 734 → bank4 + 5325 门（case -5 :119-130）=====================
describe('BJ565-T3 透镜支与 5325 门', () => {
  it('透镜（734→bi3）盒内 → 命中 banks[3];背包持 5325（关袋态）→ 拒（与 tile 段同门）', () => {
    const bank3 = Array<Slot>(40).fill(null);
    bank3[0] = { id: iid(8), stack: 1 };
    const banks: ReadonlyArray<Slot[] | null> = [null, null, null, bank3];
    const lens = [{ x: 2000, y: 1000, w: 30, h: 24, bi: 3 }];
    expect(projectileBankHits(1680, 1056, lens, banks, false)).toHaveLength(1);
    expect(projectileBankHits(1680, 1056, lens, banks, true)).toEqual([]);
  });

  it('dead 弹跳过（!projectile.active）+ bank 缺席跳过不中断', () => {
    const bank0 = Array<Slot>(40).fill(null);
    const banks: ReadonlyArray<Slot[] | null> = [bank0, null, null, null];
    const pets = [
      { x: 2000, y: 1000, w: 30, h: 24, bi: 0, dead: true },   // dead → 跳
      { x: 2020, y: 1010, w: 30, h: 24, bi: 3 },               // bi3 缺席 → 跳
      { x: 2040, y: 1020, w: 30, h: 24, bi: 0 },               // 活猪 → 命中
    ];
    const hits = projectileBankHits(1680, 1056, pets, banks, false);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ bi: 0, px: 2055, py: 1032 });
  });
});

// ===================== BJ565-T4 DepositAll/开箱面板对照面（ChestUI.cs:536/:657）=====================
describe('BJ565-T4 DepositAll 面对照：开猪面板（chest=-2）路径本就覆盖,不回归', () => {
  it('quickStackIntoContainer(isBank) 对 banks[0] 实测入猪（开箱钮链）', () => {
    const inv = new Inventory();
    const torch = iid(8);
    inv.slots[10] = { id: torch, stack: 5 };
    const bank0 = Array<Slot>(40).fill(null);
    bank0[0] = { id: torch, stack: 2 };
    quickStackIntoContainer(inv, bank0, true);
    expect(bank0[0]!.stack).toBe(7);
    expect(inv.slots[10]).toBeNull();
  });

  it('原版同款对照钉：空猪（无任何既有币）MoveCoins 净转 0（flag2 门 ChestUI.cs:1044-1047）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: iid(71), stack: 100 };
    const bank0 = Array<Slot>(40).fill(null);
    expect(moveCoinsIntoBank(inv, bank0)).toBe(0);
    expect(inv.slots[10]!.stack).toBe(100);   // 币留背包——原版空 bank 不收币
  });

  it('原版同款对照钉：全空猪 Transfer IsEmpty 门（:415）→ 整件不入空猪', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: iid(8), stack: 5 };
    const bank0 = Array<Slot>(40).fill(null);
    quickStackToChests(inv, [{ x: 98, y: 63, items: bank0 }], false);
    expect(bank0.every((s) => !s)).toBe(true);
    expect(inv.slots[10]!.stack).toBe(5);
  });
});

// ===================== BJ565-T5 普通容器不回归 =====================
describe('BJ565-T5 普通容器不回归', () => {
  it('无弹幕时合并链与旧 tile 段逐一等价（safe+宝箱段各自照旧）', () => {
    const store = new TileStore(200, 120);
    store.setTileSilent(110, 66, TILE_INTERNAL_BY_SHEET.get(97)!);
    const safe = Array<Slot>(40).fill(null);
    safe[0] = { id: iid(8), stack: 1 };
    const inv = new Inventory();
    inv.slots[10] = { id: iid(8), stack: 5 };
    const hits = mergedBankHits(store, 1680, 1056, [], [null, safe, null, null], false);
    expect(hits.map((h) => h.bi)).toEqual([1]);
    const r = quickStackToChests(inv, hits.map((b) => ({ x: b.tx, y: b.ty, items: b.items })), false);
    expect(safe[0]!.stack).toBe(6);
    expect(inv.slots[10]).toBeNull();
    expect(r.touched).toHaveLength(1);
  });
});

// ===================== BJ565-T6 Game 接线结构钉（共享热文件小粒度 Edit 复核锚）=====================
describe('BJ565-T6 Game.ts 接线结构钉', () => {
  it('quickStackAllChests 弹幕段接线 + 跨段去重 + fx 终点 threading', () => {
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src).toContain('projectileBankHits(p.cx, p.cy, petProbes');   // 弹段调用
    expect(src).toContain('!seenBi.has(h.bi)');                          // 跨段续去重（:83 面）
    expect(src).toContain('b.px ?? (b.tx + 1) * 16');                    // CoinsBatch 终点=proj.Center
    expect(src).toContain('emitQuickStackResultFx(quickStackToChests(p.inv, bankDests, false), fxEnd)');
    expect(src).toContain('bankHits.map((b) => ({ x: b.tx, y: b.ty, items: b.items }))');   // ①-F1 归一锚不变
  });
  it('emitQuickStackResultFx 终点缺省形不变（Q-F3 箱锚回归锚）', () => {
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src).toContain('endpoints?.get(ch)');
    expect(src).toContain('(ch.x + 1) * 16');
    expect(src).not.toContain('ch.x + 8');
  });
});
