// SW-BJ46 快速堆叠吞物/无同物箱被收 批测试（2026-09-09）——
//  实报：「快速堆叠有时候会吞东西…附近宝箱没有同样的东西也被收进去了」。
//  定谳根因：QuickStacking 匹配谓词/登记键用 vanillaIdOfItem 直比,对 678 个
//  place_v_* def（items.ts:984 逐 v_ 图块自动注册,vid 哨兵 -1）跨物品碰撞 →
//  FillStack 跨物并叠（吞物）+ B 阶段跨物直送（无同物箱被收）。触发条件 =
//  附近箱与背包同时存在 place_v_* 族物品（挖蛛网/花岗岩/大理石/苔藓/雪泥/
//  蜂巢块等全部命中）——「有时候」的机制解释。
//  权威：Terarria1457/Terraria.GameContent/QuickStacking.cs + Terraria/Item.cs
//  :49870 CanStack + Terraria.UI/ChestUI.cs:651-812 QuickStack（开箱态）。
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaIdOfItem } from '../src/stats/Shimmer';
import {
  quickStackToChests, quickStackIntoContainer, itemMatchKey, moveCoinsIntoBank,
} from '../src/stats/QuickStacking';

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

const cobweb = ITEM_BY_KEY['place_v_51_cobweb']!;
const cloud = ITEM_BY_KEY['place_v_189_cloud_block']!;
const torch = ITEM_BY_KEY['vi_8_Torch']!;
const dirt = ITEM_BY_KEY['vi_2_DirtBlock']!;
const wood = ITEM_BY_KEY['vi_9_Wood']!;
const copper = ITEM_BY_KEY['vi_71_CopperCoin']!;
const silver = ITEM_BY_KEY['vi_72_SilverCoin']!;
const TORCH_MAX = 9999;   // ITEM_DEFS[torch].maxStack（1.4.4 栈限档;断言前锚死防数据面漂移）

const mkChest = (items: Slot[], x = 20, y = 38): { x: number; y: number; items: Slot[] } =>
  ({ x, y, items });

// ===================== A. 快堆主链：place_v 哨兵碰撞回归（实报根因） =====================
describe('SW-BJ46 A：place_v_* vid 哨兵 -1 碰撞面（QuickStacking.cs:490 type 域）', () => {
  it('前提锚：两 place_v 物品 vanillaIdOfItem 同为 -1（旧谓词同键）而 itemMatchKey 唯一', () => {
    expect(ITEM_BY_KEY['place_v_51_cobweb']).toBeDefined();
    expect(ITEM_BY_KEY['place_v_189_cloud_block']).toBeDefined();
    // 旧谓词域：直接比 vanillaIdOfItem → -1 === -1 跨物判同（变异实验的旧态证明）
    expect(vanillaIdOfItem(cobweb)).toBe(-1);
    expect(vanillaIdOfItem(cloud)).toBe(-1);
    // 新键域：vid<0 → 内部 id 负域编码,跨物必异
    expect(itemMatchKey(cobweb)).not.toBe(itemMatchKey(cloud));
    expect(itemMatchKey(cobweb)).toBeLessThan(0);
    // vid 域物品键不变（原版域真值）
    expect(itemMatchKey(torch)).toBe(8);
  });

  it('实报场景：箱有 cobweb,玩家 cloud → 零转移（旧谓词下 cloud 被收进 cobweb 箱）', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: cobweb, stack: 200 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: cloud, stack: 50 };
    const r = quickStackToChests(inv, [chest], false);
    expect(r.touched).toEqual([]);
    expect(r.movedVids.size).toBe(0);
    expect(chest.items[0]).toMatchObject({ id: cobweb, stack: 200 });   // 箱原封
    expect(inv.slots[10]).toMatchObject({ id: cloud, stack: 50 });      // 背包原封
  });

  it('吞物面：箱 cobweb 200,玩家 cloud 50+木 1 → 无跨物并叠（旧谓词 FillStack 会把 cloud 50 并进 cobweb 堆）', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: cobweb, stack: 200 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: cloud, stack: 50 };
    inv.slots[11] = { id: wood, stack: 1 };
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]!.stack).toBe(200);      // 无跨物叠加
    expect(chest.items[0]!.id).toBe(cobweb);      // 身份未换
    expect(chest.items.slice(1).every((s) => !s)).toBe(true);
  });

  it('同物不受伤：箱 cobweb,玩家同 id cobweb → 照常并叠（vid 缺失族的正确同物语义）', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: cobweb, stack: 200 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: cobweb, stack: 50 };
    const r = quickStackToChests(inv, [chest], false);
    expect(chest.items[0]).toMatchObject({ id: cobweb, stack: 250 });
    expect(inv.slots[10]).toBeNull();
    expect(r.touched).toContain(chest);
  });

  it('vid 域物品谓词不变：异物（火把 vs 木）互不入箱（谓词修复无外溢）', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: torch, stack: 10 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: wood, stack: 999 };
    const r = quickStackToChests(inv, [chest], false);
    expect(r.touched).toEqual([]);
    expect(chest.items[0]!.stack).toBe(10);
    expect(inv.slots[10]!.stack).toBe(999);
  });
});

// ===================== B. 快堆主链：匹配谓词矩阵（QuickStacking.cs:476-511） =====================
describe('SW-BJ46 B：同名异前缀/满堆/多箱邻域/豁免面', () => {
  it('异前缀同物：不并叠但登记 → B 阶段整件入空格（QuickStacking.cs:500 CanStack 假 → :508 Add）', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: torch, stack: 100, prefix: 0 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: torch, stack: 30, prefix: 3 };
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]).toMatchObject({ id: torch, stack: 100, prefix: 0 });   // 不互融
    const landed = chest.items[1];
    expect(landed).toMatchObject({ id: torch, stack: 30, prefix: 3 });            // 整件入空格
    expect(inv.slots[10]).toBeNull();
  });

  it('多箱邻域：唯含同物箱收货,无同物箱零触碰（NearbyChests/Transfer 受理集语义）', () => {
    const inv = new Inventory();
    const chestA = mkChest([{ id: torch, stack: 10 }, ...Array<Slot>(19).fill(null)], 20, 38);
    const chestB = mkChest([{ id: cobweb, stack: 5 }, ...Array<Slot>(19).fill(null)], 30, 38);
    inv.slots[10] = { id: cobweb, stack: 40 };
    inv.slots[11] = { id: cloud, stack: 7 };       // 两箱都无同物 → 不动
    const r = quickStackToChests(inv, [chestA, chestB], false);
    expect(chestA.items[0]!.stack).toBe(10);
    expect(chestB.items[0]).toMatchObject({ id: cobweb, stack: 45 });
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toMatchObject({ id: cloud, stack: 7 });
    expect(r.touched).toEqual([chestB]);
  });

  it('豁免面：热栏 0-9 不入源窗（PackQuickStackableItems Inventory0+10 起）;收藏/币同拒', () => {
    const inv = new Inventory();
    const chest = mkChest([{ id: cobweb, stack: 100 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[3] = { id: cobweb, stack: 9 };                       // 热栏同物 → 不动
    inv.slots[11] = { id: cobweb, stack: 5, favorited: true };     // 收藏 → 不动
    inv.slots[12] = { id: copper, stack: 50 };                     // 币 → 不动（箱无币堆）
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]!.stack).toBe(100);
    expect(inv.slots[3]).toMatchObject({ stack: 9 });
    expect(inv.slots[11]).toMatchObject({ stack: 5 });
    expect(inv.slots[12]).toMatchObject({ stack: 50 });
  });

  it('smart 档（SmartStackToNearbyChests 语义,QuickStacking.cs:432-451）：同分类层异型整件送=原版刻意;quick 档同场景零转移', () => {
    // dirt(vid2)/wood(vid9) 同分类层 49（vanillaItemSorting LAYERS）异型——
    // smart 档按 categoryScore 选箱整件送（箱无同物也收=原版 Smart Stack 本相）;
    // quick 档无同型受理面 → 零转移（两档判别力对照）
    const inv = new Inventory();
    const chest = mkChest([{ id: dirt, stack: 1 }, ...Array<Slot>(19).fill(null)]);
    inv.slots[10] = { id: wood, stack: 4 };
    const rq = quickStackToChests(inv, [chest], false);
    expect(rq.touched).toEqual([]);
    expect(chest.items[0]!.stack).toBe(1);
    const inv2 = new Inventory();
    const chest2 = mkChest([{ id: dirt, stack: 1 }, ...Array<Slot>(19).fill(null)]);
    inv2.slots[10] = { id: wood, stack: 4 };
    const rs = quickStackToChests(inv2, [chest2], true);
    expect(rs.touched).toContain(chest2);
    expect(chest2.items[1]).toMatchObject({ id: wood, stack: 4 });
  });
});

// ===================== C. 开箱面板 Quick Stack（ChestUI.QuickStack :651-812） =====================
describe('SW-BJ46 C：quickStackIntoContainer（ChestUI.cs:651-812 1:1）', () => {
  it('只堆箱内已有类型：火把并入,无同物木头不动（:699-709 list 建账 + :721 dictionary）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: torch, stack: 10 }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: torch, stack: 30 };
    inv.slots[11] = { id: wood, stack: 500 };
    const { movedChest } = quickStackIntoContainer(inv, items, false);
    expect(items[0]).toMatchObject({ id: torch, stack: 40 });
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toMatchObject({ id: wood, stack: 500 });
    expect(movedChest.get(0)).toBe(torch);
  });

  it('源窗：热栏 0-9 不入（旧实现 0-53 全域=偏差已修）;真箱币列不入且箱内币堆不吃（:711-719/:703）', () => {
    const inv = new Inventory();
    const items: Slot[] = [
      { id: torch, stack: 10 }, { id: copper, stack: 20 }, ...Array<Slot>(18).fill(null),
    ];
    inv.slots[2] = { id: torch, stack: 5 };        // 热栏同物
    inv.slots[10] = { id: torch, stack: 30 };
    inv.slots[50] = { id: copper, stack: 40 };     // 币列（真箱窗 10-49 外,且币不入 list）
    quickStackIntoContainer(inv, items, false);
    expect(items[0]).toMatchObject({ id: torch, stack: 40 });   // 10-49 段并叠
    expect(items[1]).toMatchObject({ id: copper, stack: 20 });  // 箱内币堆不吃
    expect(inv.slots[2]).toMatchObject({ stack: 5 });
    expect(inv.slots[50]).toMatchObject({ stack: 40 });
  });

  it('bank 面（chest≤-2）：MoveCoins 前置（:660-669）+ 源窗 10-53（:713 num+=4）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: silver, stack: 20 }, ...Array<Slot>(39).fill(null)];
    inv.slots[10] = { id: copper, stack: 150 };    // → MoveCoins 池化（150 铜=1 银+50 铜）
    inv.slots[11] = { id: torch, stack: 3 };
    const out: { playSound7?: boolean } = {};
    const { movedChest } = quickStackIntoContainer(inv, items, true, out);
    expect(items[0]!.stack).toBe(21);              // 20 银+池化 1 银
    expect(out.playSound7).toBe(true);
    // 币归并走 MoveCoins 面（非 QuickStack 搬移）→ movedChest 不记
    expect(movedChest.size).toBe(0);
    // torch 非箱内类型（箱只有银币）→ 留包
    expect(inv.slots[11]).toMatchObject({ id: torch, stack: 3 });
  });

  it('词缀门：第一遍异前缀不并叠（:734 CanStack=同型+同词缀 Item.cs:49870;旧实现互融吞词缀=已修）→ 第二遍整件落空格（:776 flag 支免 CanStack）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: torch, stack: 10, prefix: 0 }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: torch, stack: 30, prefix: 3 };
    const { movedChest } = quickStackIntoContainer(inv, items, false);
    expect(items[0]).toMatchObject({ id: torch, stack: 10, prefix: 0 });  // 不互融
    // 第二遍自由格支：空格首件直落免 CanStack（:776）→ 异前缀件整件入空格
    expect(items[1]).toMatchObject({ id: torch, stack: 30, prefix: 3 });
    expect(inv.slots[10]).toBeNull();
    expect(movedChest.get(1)).toBe(torch);
  });

  it('第二遍自由格支：箱满叠同型件整件落空格（:768-805;旧实现整段缺失=已修）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: torch, stack: TORCH_MAX }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: torch, stack: 50 };
    const { movedChest } = quickStackIntoContainer(inv, items, false);
    expect(items[0]!.stack).toBe(TORCH_MAX);       // 满叠不动（pass1 num5==0 break）
    expect(items[1]).toMatchObject({ id: torch, stack: 50 });
    expect(inv.slots[10]).toBeNull();
    expect(movedChest.get(1)).toBe(torch);
  });

  it('flag 续并：多源件首件整件落格、后续同型并入该格（:776-794 flag 语义）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: torch, stack: TORCH_MAX }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: torch, stack: 100 };
    inv.slots[11] = { id: torch, stack: 100 };
    quickStackIntoContainer(inv, items, false);
    expect(items[1]).toMatchObject({ id: torch, stack: 200 });   // 首件落+次件并
    expect(items.slice(2).every((s) => !s)).toBe(true);
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toBeNull();
  });

  it('收藏源禁转移（:723 !favorited）;place_v 族匹配域同谓词（itemMatchKey）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: cobweb, stack: 100 }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: cobweb, stack: 5, favorited: true };
    inv.slots[11] = { id: cobweb, stack: 5 };
    inv.slots[12] = { id: cloud, stack: 9 };       // place_v 异物 → 不入
    quickStackIntoContainer(inv, items, false);
    expect(items[0]).toMatchObject({ id: cobweb, stack: 105 });
    expect(inv.slots[10]).toMatchObject({ stack: 5, favorited: true });
    expect(inv.slots[12]).toMatchObject({ id: cloud, stack: 9 });
  });

  it('place_v 异物不收（同实报主链判据在开箱径复验）', () => {
    const inv = new Inventory();
    const items: Slot[] = [{ id: cobweb, stack: 100 }, ...Array<Slot>(19).fill(null)];
    inv.slots[10] = { id: cloud, stack: 9 };
    const { movedChest } = quickStackIntoContainer(inv, items, false);
    expect(items[0]!.stack).toBe(100);
    expect(inv.slots[10]).toMatchObject({ stack: 9 });
    expect(movedChest.size).toBe(0);
  });

  it('MoveCoins 出参缺省调用形保持（无 out 入参不炸）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: copper, stack: 100 };
    const bank = Array<Slot>(40).fill(null);
    bank[0] = { id: silver, stack: 1 };
    expect(moveCoinsIntoBank(inv, bank)).toBe(100);
  });
});
