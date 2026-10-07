// BJ558（2026-10-08 用户问询定谳刀）：满包清格后,身边稀有/普通物品谁先被收?
//
// 【原版定谳】（Terarria1457 亲读,终态 1457 为准）：
//   · GrabItems（Player.cs:35181-35250）遍历序 = `for (int j = 0; j < 400; j++)`
//     Main.item[j] 【数组索引序】——无稀有度/距离排序;碰触玩家 hitbox（:35206-35211
//     base.Hitbox.Intersects）→ PickupItem → GetItem 即刻收取;仅拉取范围内
//     （:35212-35224）→ ItemSpace + CanPullItem 门 + PullItem_* 吸附。
//   · 满包判定 = ItemSpace（:39463-39507）四臂:①IsAPickup 恒真 ②0-49 空格/可堆叠
//     ③弹药 54-57 ④cofveve 虚空袋——全不过 → CanTakeItem=false → CanPullItem
//     （:39449-39457）拒 → 物品【原地不动不吸】;清出一格（或凑成可堆叠位）后
//     CanTakeItem 翻真 → 两件【同时】开始被吸,谁先碰到玩家 hitbox 谁先入包。
//   · 收取后落格序 = GetItem（:39640-39696）:堆叠合并优先于空格（:39671-39670
//     FillIntoOccupiedSlot 先行）,空格非收藏【降序】49→0（:39688-39700）——
//     同样无任何 rare 消费（Player.cs 拾取面 grep rare/priority 仅钓鱼饵 :53138
//     与 QuickBuff :5959,均与拾取无关）。
//   ⇒【原版无稀有优先】:清格后谁先收由 ①物理距离（谁先碰触）②数组索引序
//     （同帧碰触时索引小者先）决定,稀有度只影响吸附档位速度等,不参与选择。
//
// 【本仓对照】：
//   · 遍历序 = EntityManager.update（Entity.ts:120-126）drops 桶数组序,逐物
//     fixedUpdate 自查碰触/拉取——与原版 Main.item[j] 序同构（均无排序）。
//   · 落格序 = Inventory.add → fillBagArms（Inventory.ts SW-BN5 三臂 1:1）,
//     堆叠合并优先+非收藏降序——与原版 GetItem 同相。
//   · 【本刀修复面】拉取臂此前缺 ItemSpace 满包门（ItemDrop.ts 拉取臂仅 encumbering
//     canAccept 门）=满包仍把不可堆叠物吸到身上堆积;已补 itemSpaceCanPull
//     （ItemSpace.CanTakeItem 等价,含 cofveve 臂显式补回——canTakeToPersonalInventory
//     剔除了该臂而拉取门消费 CanTakeItem 原值）。碰触拾取臂原版无门,不接（同构）。
//
// 【变异判别力】（验收:变异+回归）：
//   · ①②双向数组序断言:若实现被变异成"稀有优先",①爆红;若实现被变异成
//     "普通优先",②爆红——两向钉死"遍历序与稀有度无关"。
//   · ③门钉值三态（满包拒/可堆叠放/清格放）:若门被删（恒吸）,满包拒支爆红。
//   · 数据自证:rare['273']=3 / rare['4'] 缺省（漂移即红）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { InvItem } from '../src/items/Inventory';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import itemRare from '../src/data/vanilla-itemrare.json';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const COMMON_VID = 4;      // Copper Broadsword 铜阔剑——rare 缺省 0（表无=白）
const RARE_VID = 273;      // Blade of Grass 草刃——rare 3（绿）
const WOOD_ID = ITEM_BY_KEY['vi_9_Wood'] ?? -1;       // 满包填料（maxStack 9999）
const TORCH_ID = ITEM_BY_KEY['vi_8_Torch'] ?? -1;     // 可堆叠对（maxStack 999）
const COMMON_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[COMMON_VID] ?? ''] ?? -1;
const RARE_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[RARE_VID] ?? ''] ?? -1;
const VOID_LENS_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4131] ?? ''] ?? -1;   // 虚空透镜（useVoidBag 门物）
const RARE_TABLE = itemRare as Record<string, number>;

const internalIdOf = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** 平地世界（行 43 一层地面,无液体/无微光——纯拾取域） */
function flatWorld(): World {
  const w = new World(60, 256, 11, 'bj558-pickup');
  const st = w.store;
  for (let x = 6; x < 54; x++) st.setTile(x, 43, 1);
  return w;
}

function baseHooks(w: World, over: Record<string, unknown> = {}): GameHooks {
  return {
    world: w,
    player: undefined as unknown as Player,
    enemies: () => [], critters: () => [], npcs: () => [], drops: [],
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, achievements: { notifyItemPickup: () => {} },
    recLog: () => {},
    ...over,
  } as unknown as GameHooks;
}

/** 满包：0-49 全塞满堆木（9999=maxStack,不可再并,无空格） */
function fillBag(p: Player): void {
  for (let i = 0; i < 50; i++) p.inv.slots[i] = { id: WOOD_ID, stack: 9999 };
}

/** 玩家站地面行 43 上（盒底=43*TILE）;中心（PCX, PCY） */
const PX = 28 * TILE;
const PY = 43 * TILE - 42;
const PCX = PX + 10;
const PCY = PY + 21;

/** 与玩家盒重叠放置（碰触拾取臂受理面） */
function overlapping(id: number): ItemDrop {
  const d = new ItemDrop(PCX - 6, PCY - 6, id, 1, 0, 0);
  return d;
}

/** 玩家右缘外 gap 像素放置（拉取范围内、不碰触） */
function nearside(id: number, gap: number): ItemDrop {
  const d = new ItemDrop(PX + 20 + gap, PCY - 6, id, 1, 0, 0);
  return d;
}

const vidInBag = (p: Player, vid: number): boolean =>
  p.inv.slots.some((s) => s && (ITEM_DEFS[s.id]?.vid ?? -1) === vid);

/** 槽位 vid 读取（类型化:字面量索引写 null 后 TS 控制流把元素窄成 never,显式注解防） */
const slotVidAt = (p: Player, i: number): number => {
  const s = p.inv.slots[i] as InvItem | null;
  return s ? (ITEM_DEFS[s.id]?.vid ?? -1) : -1;
};

describe('BJ558 数据自证（漂移即红）', () => {
  it('稀有对钉值:铜阔剑 4 rare=0（表缺省）、草刃 273 rare=3;测试件非弹药、透镜在册', () => {
    expect(RARE_TABLE['273']).toBe(3);
    expect(RARE_TABLE['4']).toBeUndefined();
    expect(COMMON_ID).toBeGreaterThan(0);
    expect(RARE_ID).toBeGreaterThan(0);
    expect(WOOD_ID).toBeGreaterThan(0);
    expect(TORCH_ID).toBeGreaterThan(0);
    expect(VOID_LENS_ID).toBeGreaterThan(0);
  });
});

describe('BJ558-① 核心答询:满包清格后同帧双碰触——数组序决定,稀有度无关（双向判别）', () => {
  it('普通件在 drops 序首:普通占 49（降序首空格）、稀有占 48——若无稀有优先实现此向红', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[49] = null;   // 清两格（清一格语义=只收一件;两格使两件都可比）
    p.inv.slots[48] = null;
    const common = overlapping(COMMON_ID);   // 数组序:普通先
    const rare = overlapping(RARE_ID);
    const hooks = baseHooks(w, { player: p });
    common.fixedUpdate(1 / 60, hooks);       // ≙ EntityManager.update drops 序
    rare.fixedUpdate(1 / 60, hooks);
    const s49 = slotVidAt(p, 49);
    const s48 = slotVidAt(p, 48);
    expect(s49).toBe(COMMON_VID);   // 序首先入
    expect(s48).toBe(RARE_VID);
    expect(common.dead).toBe(true);
    expect(rare.dead).toBe(true);
  });

  it('反向:稀有件在 drops 序首→稀有占 49——若无普通优先变异,普通抢先此向红', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[49] = null;
    p.inv.slots[48] = null;
    const rare = overlapping(RARE_ID);       // 数组序:稀有先
    const common = overlapping(COMMON_ID);
    const hooks = baseHooks(w, { player: p });
    rare.fixedUpdate(1 / 60, hooks);
    common.fixedUpdate(1 / 60, hooks);
    const s49 = slotVidAt(p, 49);
    const s48 = slotVidAt(p, 48);
    expect(s49).toBe(RARE_VID);
    expect(s48).toBe(COMMON_VID);
  });

  it('只清一格:序首件独占新格,次件留地（清一格只收一件——答询场景本体）', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[49] = null;   // 仅清一格
    const common = overlapping(COMMON_ID);
    const rare = overlapping(RARE_ID);
    const hooks = baseHooks(w, { player: p });
    common.fixedUpdate(1 / 60, hooks);
    rare.fixedUpdate(1 / 60, hooks);
    const s49 = slotVidAt(p, 49);
    expect(s49).toBe(COMMON_VID);   // 序首（普通）得格
    expect(vidInBag(p, RARE_VID)).toBe(false);                        // 稀有留地
    expect(rare.dead).toBe(false);
    expect(rare.stack).toBe(1);                                       // 未被销毁（GetItem 装不下留位）
  });
});

describe('BJ558-② 距离序:清格后两件同在拉取范围,近者先碰触先入包（非稀有序）', () => {
  it('普通件 gap=10 / 稀有件 gap=30:先入包者=普通（若稀有序变异,稀有先到即红）', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[49] = null;
    p.inv.slots[48] = null;
    const common = nearside(COMMON_ID, 10);   // 近
    const rare = nearside(RARE_ID, 30);       // 远（稀有）
    const hooks = baseHooks(w, { player: p });
    let firstPicked = 0;
    for (let t = 0; t < 600 && !(vidInBag(p, COMMON_VID) || vidInBag(p, RARE_VID)); t++) {
      common.fixedUpdate(1 / 60, hooks);
      rare.fixedUpdate(1 / 60, hooks);
      if (vidInBag(p, COMMON_VID)) { firstPicked = COMMON_VID; break; }
      if (vidInBag(p, RARE_VID)) { firstPicked = RARE_VID; break; }
    }
    expect(firstPicked).toBe(COMMON_VID);     // 近件先入（原版距离序同相）
    // 继续跑到稳定:远件最终也被吸到入包（两格承接,吸附不因稀有度跳过）
    for (let t = 0; t < 600 && !vidInBag(p, RARE_VID); t++) {
      common.fixedUpdate(1 / 60, hooks);
      rare.fixedUpdate(1 / 60, hooks);
    }
    expect(vidInBag(p, RARE_VID)).toBe(true);
  });
});

describe('BJ558-③ 拉取面满包门（ItemSpace.CanTakeItem 钉值;本刀修复面）', () => {
  it('满包无堆叠位:不可堆叠件不吸（grabbed=false、原地）——原版 :39506 false 同相', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    const rare = nearside(RARE_ID, 12);
    const hooks = baseHooks(w, { player: p });
    rare.fixedUpdate(1 / 60, hooks);
    expect(rare.grabbed).toBe(false);
    expect(rare.x).toBe(PX + 20 + 12);        // 未被拉动
    expect(vidInBag(p, RARE_VID)).toBe(false);
  });

  it('满包但可堆叠位在（火把半堆）:可堆件照吸——原版 :39540 同相', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[0] = { id: TORCH_ID, stack: 500 };   // 挤一格火把半堆
    const torch = nearside(TORCH_ID, 12);
    const hooks = baseHooks(w, { player: p });
    torch.fixedUpdate(1 / 60, hooks);
    expect(torch.grabbed).toBe(true);         // 可并入 → CanTakeItem=true
  });

  it('清出一格后:不可堆叠件翻真可吸——答询场景门态翻转钉值', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    const rare = nearside(RARE_ID, 12);
    const hooks = baseHooks(w, { player: p });
    rare.fixedUpdate(1 / 60, hooks);
    expect(rare.grabbed).toBe(false);         // 满包:拒
    p.inv.slots[49] = null;                   // 清出一格
    rare.fixedUpdate(1 / 60, hooks);
    expect(rare.grabbed).toBe(true);          // 有空格:放（开始被吸）
  });

  it('满包+虚空袋启用（透镜在包）+袋内有位:不可堆件仍受理（cofveve 臂 CanTakeItem 原值）', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    p.inv.slots[7] = { id: VOID_LENS_ID, stack: 1 };   // 透镜占格（无空格:50 格全占）
    expect(p.useVoidBag()).toBe(true);        // useVoidBag 门物在包
    const rare = nearside(RARE_ID, 12);
    const hooks = baseHooks(w, { player: p });
    rare.fixedUpdate(1 / 60, hooks);
    expect(rare.grabbed).toBe(true);          // ItemIsGoingToVoidVault 臂 → CanTakeItem=true
  });

  it('碰触拾取臂无满包门（原版 PickupItem→GetItem 装不下留位同构）:满包重叠件不销毁', () => {
    const w = flatWorld();
    const p = new Player(PX, PY, new Inventory());
    fillBag(p);
    const rare = overlapping(RARE_ID);
    const hooks = baseHooks(w, { player: p });
    rare.fixedUpdate(1 / 60, hooks);
    expect(rare.dead).toBe(false);            // 装不下不消失（留原地,原版同相）
    expect(rare.stack).toBe(1);
    expect(vidInBag(p, RARE_VID)).toBe(false);
  });
});
