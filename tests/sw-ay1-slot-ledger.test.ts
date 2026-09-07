// SW-AY1 2026-09-06 —— 槽位交互域备案项清偿（R1/R2/R4a/R4b/R5/R7/R8/#9/#10）。
// 原版权威（Terarria1457，1458 本域零增量）：
//   · Item.cs:49870-49877                Item.CanStack（同型 + prefix 相等）
//   · Item.cs:1177-1193                  OnlyNeedOneInInventory（覆写表 + 缺省式）
//   · ItemID.cs:1223-1281                OnlyNeedOneInInventoryOverride（22 真/6 假）
//   · Player.cs:39463-39507/:39530-39545 ItemSpace / CanItemSlotAcceptPickup
//     （:39536 favorited+OnlyNeedOne 拒收；:39495-39500 非弹药门同型扫）
//   · ChestUI.cs:330-355                 容器 context（世界箱3/银行4/虚空保险库32）
//   · ChestUI.cs:1287-1298               IsBlockedFromTransferIntoChest（收藏容器自锁）
//   · ItemSlot.cs:631-651/:787-821       研究/向导 Shift 特化支 + cursorOverride 9 分派
//   · ItemSlot.cs:733-738/:1249-1272     journey 研究随垃圾桶（TryResearchingItem）
//   · ItemSlot.cs:571-599                OverrideHover（垃圾桶槽 Alt 聊天分享面）
//   · Main.cs:51444-51466                Quick Trash 三态循环（menu[223/224/253]）
//   · Player.cs:39755 等                 GetItem 币种专音（IsACoin ? 38 : 7）
// 分层钉法：SlotActions 纯路由/谓词 + UI 方法体（Object.create(UI.prototype) 绕
// DOM 构造）+ 源文本接线面（srcMatch），同 tests/sw-au2-slot-shift-alt.test.ts 车道。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS, ITEM_ONLY_NEED_ONE_OVERRIDE } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { materialIids } from '../src/ui/itemTooltip';
import { options, cycleQuickTrashMode, QUICK_TRASH_MODES } from '../src/core/Options';
import {
  slotContext, planAlternateClick, chestContainerContext, chestCanTakeJustCheck,
  canTakeToPersonalInventory, canMergeStack, onlyNeedOneInInventory, quickTrashOptionsOf,
} from '../src/ui/SlotActions';
import { canFillEmptyAmmoSlot } from '../src/items/Inventory';   // ★SW-BM1 :39549 空弹药格臂

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (!ITEM_DEFS[id]) throw new Error(`测试钉死前提失效：vid ${vid} 未注册`);
  return id;
};
const WOOD = iidOf(9);            // 木（可并堆、useStyle1 非消耗品 → OnlyNeedOne 真）
const GEL = iidOf(23);            // 凝胶（NO_AUTO_FILL_AMMO 特殊弹药 → 空弹药格拒收面活体）
const ARROW = iidOf(40);          // 木箭（普通弹药 → CanFillEmptyAmmoSlot 真）
const COPPER_COIN = iidOf(71);    // 铜币
const MONEY_TROUGH = iidOf(3213); // 收藏钱袋（入存钱罐自锁 ChestUI.cs:1289）
const VOID_BAG = iidOf(4131);     // 虚空袋（入虚空保险库自锁 :1293）
const WOOD_MAX = ITEM_DEFS[WOOD].maxStack ?? 999;

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean; placeStyle?: number } | null;

const srcMatch = (re: RegExp, file = '../src/ui/UI.ts'): boolean =>
  re.test(readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'));

/** 某个消耗品 vid（OnlyNeedOne 缺省式 :1191 → false 的活体） */
const CONSUMABLE_VID = (() => {
  for (let vid = 1; vid < 3000; vid++) {
    const f = itemFuncOfVid(vid);
    if (f?.consumable && VANILLA_ITEM_KEY_BY_ID[vid] && ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]] !== undefined) return vid;
  }
  throw new Error('未找到消耗品样本');
})();

/** 绕 DOM constructor 铺 UI 方法引用面（同 sw-au2 车道） */
function fakeAY(opts: { chestX?: number; chestItems?: Slot[]; researchHave?: number; researchNeed?: number } = {}) {
  const inv = new Inventory();
  const plays: string[] = [];
  const files: string[] = [];
  const wavs: string[] = [];
  const sacrifices: Array<[number, number]> = [];
  let refreshes = 0;
  let refreshHooks = 0;
  const fake = Object.create(UI.prototype) as unknown as {
    openChest: { x: number; y: number; items: Slot[] } | null;
    game: Record<string, unknown>;
    invPanel: HTMLElement | null;
    guideEl: HTMLDivElement | null;
    guidePlaced: { id: number; stack: number } | null;
    guideRefresh: (() => void) | null;
    refreshAll(): void;
    altSlotClick(i: number, where: string, panelOpen: boolean): boolean;
    altMoveClick(i: number, where: string, shift: boolean, ctrl: boolean, panelOpen: boolean): boolean;
    researchMenuShowing(): boolean;
    pickUp(i: number, where: string): void;
    placeHeld(i: number, where: string): void;
    placeTrash(): void;
    tryResearchIntoTrash(it: { id: number; stack: number }, onlyIfFinish: boolean): boolean;
    heldStack: Slot;
    heldFrom: string | null;
  };
  fake.openChest = opts.chestItems ? { x: opts.chestX ?? 0, y: 0, items: opts.chestItems } : null;
  fake.game = {
    player: { inv },
    npcShopOpen: false,
    world: { isJourney: true },
    research: {
      tryGetSacrificeNumbers: (vid: number) =>
        vid === 9 ? { have: opts.researchHave ?? 0, need: opts.researchNeed ?? 5 } : null,
      sacrifice: (vid: number, n: number) => {
        sacrifices.push([vid, n]);
        return n >= (opts.researchNeed ?? 5);
      },
    },
    sfx: {
      play: (n: string) => { plays.push(n); },
      playFiles: (arr: string[]) => { files.push(...arr); },
      playWavFile: (n: string) => { wavs.push(n); },
    },
    achievements: { notifyItemPickup: () => {} },
    chatInput: null,
  };
  fake.invPanel = null;
  fake.guideEl = null;
  fake.guidePlaced = null;
  fake.guideRefresh = () => { refreshHooks++; };
  fake.refreshAll = () => { refreshes++; };
  fake.heldStack = null;
  fake.heldFrom = null;
  return { fake, inv, plays, files, wavs, sacrifices, refreshed: () => refreshes, refreshHooks: () => refreshHooks };
}

// ---------------------------------------------------------------------------
// R1 合并谓词单源（Item.CanStack Item.cs:49870-49877）
// ---------------------------------------------------------------------------
describe('R1 canMergeStack = Item.CanStack（同型 + prefix 相等,undefined≈0）', () => {
  it('同型同词缀真 / 异词缀假 / 异型假 / undefined 与 0 相等', () => {
    expect(canMergeStack({ id: 5, prefix: 3 }, { id: 5, prefix: 3 })).toBe(true);
    expect(canMergeStack({ id: 5, prefix: 3 }, { id: 5, prefix: 4 })).toBe(false);
    expect(canMergeStack({ id: 5 }, { id: 5, prefix: 0 })).toBe(true);    // undefined≈0
    expect(canMergeStack({ id: 5, prefix: 0 }, { id: 5 })).toBe(true);
    expect(canMergeStack({ id: 5 }, { id: 6 })).toBe(false);
  });

  it('chestCanTakeJustCheck 词缀面（ChestUI.cs:1221 CanStack）：同词缀余位真/异词缀只认空格', () => {
    expect(chestCanTakeJustCheck([{ id: WOOD, stack: 1, prefix: 5 }], WOOD, WOOD_MAX, 5)).toBe(true);
    // 异词缀：合并面拒——但空格面仍独立成立（:1258-1270）
    expect(chestCanTakeJustCheck([{ id: WOOD, stack: 1, prefix: 5 }, null], WOOD, WOOD_MAX, 6)).toBe(true);
    expect(chestCanTakeJustCheck([{ id: WOOD, stack: 1, prefix: 5 }], WOOD, WOOD_MAX, 6)).toBe(false);
  });

  it('placeHeld 背包合并算式改词缀门：异词缀不并入（对换面 :918 Swap→:952 CanStack 拒）,同词缀并入', () => {
    const a = fakeAY();
    a.inv.slots[10] = { id: WOOD, stack: 100, prefix: 5 };
    a.fake.heldStack = { id: WOOD, stack: 20, prefix: 6 };
    a.fake.placeHeld.call(a.fake, 10, 'inv');
    // 原版序：先 MouseItemSwap（:918）再 CanStack 合并（:952）——异词缀=净对换
    expect(a.inv.slots[10]).toEqual({ id: WOOD, stack: 20, prefix: 6 });
    expect(a.fake.heldStack).toEqual({ id: WOOD, stack: 100, prefix: 5 });   // 槽件回光标
    const b = fakeAY();
    b.inv.slots[10] = { id: WOOD, stack: 100, prefix: 5 };
    b.fake.heldStack = { id: WOOD, stack: 20, prefix: 5 };
    b.fake.placeHeld.call(b.fake, 10, 'inv');
    expect(b.inv.slots[10]!.stack).toBe(120);          // 同词缀并入
    expect(b.fake.heldStack).toBeNull();
  });

  it('placeHeld 箱格合并算式同吃谓词', () => {
    const a = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: 100, prefix: 5 }, null] });
    a.fake.heldStack = { id: WOOD, stack: 20, prefix: 6 };
    a.fake.placeHeld.call(a.fake, 1, 'chest');
    expect(a.fake.openChest!.items[0]!.stack).toBe(100);        // 未并入
    expect(a.fake.openChest!.items[1]).toEqual({ id: WOOD, stack: 20, prefix: 6, favorited: false }); // 整堆落空格
  });

  it('shiftDepositToChest 合并算式同吃谓词（TryPlacingInChest :1221）', () => {
    const a = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: WOOD_MAX - 99, prefix: 5 }, null] });
    a.inv.slots[10] = { id: WOOD, stack: 500, prefix: 6 };
    expect(a.fake.altMoveClick(10, 'inv', true, false, true)).toBe(true);
    expect(a.fake.openChest!.items[0]!.stack).toBe(WOOD_MAX - 99);  // 异词缀不并
    expect(a.fake.openChest!.items[1]!.stack).toBe(500);            // 整堆进空格
    const b = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: WOOD_MAX - 99, prefix: 5 }, null] });
    b.inv.slots[10] = { id: WOOD, stack: 500, prefix: 5 };
    expect(b.fake.altMoveClick(10, 'inv', true, false, true)).toBe(true);
    expect(b.fake.openChest!.items[0]!.stack).toBe(WOOD_MAX);       // 同词缀并堆面
    expect(b.fake.openChest!.items[1]!.stack).toBe(401);            // 余量进空格
  });

  it('Inventory.fillRange 拾取并堆面带词缀门（add() 三路同吃）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: WOOD, stack: 100, prefix: 5 };
    const left1 = inv.add(WOOD, 30, 6);
    expect(left1).toBe(0);
    expect(inv.slots[10]!.stack).toBe(100);                          // 异词缀不并入已有堆
    expect(inv.slots.filter((s) => s?.id === WOOD && s.prefix === 6).reduce((n, s) => n + s!.stack, 0)).toBe(30);
    const left2 = inv.add(WOOD, 30, 5);
    expect(left2).toBe(0);
    expect(inv.slots[10]!.stack).toBe(130);                          // 同词缀并入
  });
});

// ---------------------------------------------------------------------------
// R2 OnlyNeedOne favorited 拒收 + :39495-39500 非弹药门同型扫
// ---------------------------------------------------------------------------
const GEM = iidOf(1522);          // Large Amethyst（覆写表真值族,可堆 → 门可达活体）
const PICKAXE = iidOf(1);         // 铁镐（非消耗品 useStyle1 → 缺省式真）

describe('R2 onlyNeedOneInInventory（Item.cs:1177-1193）', () => {
  it('覆写表：1522 真 / 856 真 / 205 假（ItemID.cs:1223-1281 数据面）', () => {
    expect(ITEM_ONLY_NEED_ONE_OVERRIDE[1522]).toBe(true);
    expect(onlyNeedOneInInventory(GEM)).toBe(true);
    expect(ITEM_ONLY_NEED_ONE_OVERRIDE[856]).toBe(true);
    expect(onlyNeedOneInInventory(iidOf(856))).toBe(true);
    expect(ITEM_ONLY_NEED_ONE_OVERRIDE[205]).toBe(false);
    expect(onlyNeedOneInInventory(iidOf(205))).toBe(false);
  });
  it('缺省式：非消耗品 useStyle!=0 → 真（铁镐）；消耗品（木/药水）→ 假（:1184-1192）', () => {
    expect(onlyNeedOneInInventory(PICKAXE)).toBe(true);
    expect(itemFuncOfVid(9)?.consumable).toBeTruthy();
    expect(onlyNeedOneInInventory(WOOD)).toBe(false);                 // 木=放置消耗品
    expect(onlyNeedOneInInventory(iidOf(CONSUMABLE_VID))).toBe(false);
  });
});

describe('R2 canTakeToPersonalInventory：收藏格拒收（Player.cs:39536）+ 非弹药门同型扫（:39495）', () => {
  const fullInv = (fillId: number): Inventory => {
    const inv = new Inventory();
    for (let i = 0; i < 58; i++) inv.slots[i] = { id: fillId, stack: ITEM_DEFS[fillId].maxStack ?? 9999 };
    return inv;
  };
  it('满包仅剩收藏 OnlyNeedOne 余位堆 → 拒（:39536-39539）；同格去收藏 → 并堆面收', () => {
    const inv = fullInv(WOOD);
    inv.slots[5] = { id: GEM, stack: 10, favorited: true };
    expect(canTakeToPersonalInventory(inv.slots, GEM, ITEM_DEFS[GEM].maxStack ?? 9999, false, false)).toBe(false);
    inv.slots[5] = { id: GEM, stack: 10 };                            // 去收藏 → :39540 放行
    expect(canTakeToPersonalInventory(inv.slots, GEM, ITEM_DEFS[GEM].maxStack ?? 9999, false, false)).toBe(true);
  });
  it('收藏消耗品堆不拒（OnlyNeedOne=false → 收藏保护域外,:1191）', () => {
    const inv = fullInv(WOOD);
    inv.slots[5] = { id: iidOf(CONSUMABLE_VID), stack: 1, favorited: true };
    expect(canTakeToPersonalInventory(inv.slots, iidOf(CONSUMABLE_VID),
      ITEM_DEFS[iidOf(CONSUMABLE_VID)].maxStack ?? 9999, false, false)).toBe(true);
  });
  it(':39495-39500 非弹药门同型扫——fitsAmmo=false 也扫 54-57（不看 favorited）', () => {
    const inv = fullInv(WOOD);
    inv.slots[54] = { id: WOOD, stack: 1, favorited: true };          // 弹药格残堆（同型）
    expect(canTakeToPersonalInventory(inv.slots, WOOD, WOOD_MAX, false, false)).toBe(true);
    inv.slots[54] = { id: WOOD, stack: WOOD_MAX, favorited: true };   // 满堆 → 无处去
    expect(canTakeToPersonalInventory(inv.slots, WOOD, WOOD_MAX, false, false)).toBe(false);
  });
  it('★SW-BM1 :39547-39552 空弹药格臂——CanGoIntoAmmoOnPickup：空弹药格只收 CanFillEmptyAmmoSlot 物', () => {
    const inv = fullInv(WOOD);                                        // 全包满 → 只剩 54-57 弹药格面
    for (let j = 54; j < 58; j++) inv.slots[j] = null;                // 清空弹药格 = 空格门活体
    // 凝胶（23 ∈ NO_AUTO_FILL_AMMO 特殊弹药表,CanFillEmptyAmmoSlot=false）→ 空弹药格拒收
    expect(canTakeToPersonalInventory(inv.slots, GEL, ITEM_DEFS[GEL].maxStack ?? 9999,
      false, true, undefined, canFillEmptyAmmoSlot(GEL))).toBe(false);
    // 箭（普通弹药,CanFillEmptyAmmoSlot=true）→ 空弹药格放行
    expect(canTakeToPersonalInventory(inv.slots, ARROW, ITEM_DEFS[ARROW].maxStack ?? 9999,
      false, true, undefined, canFillEmptyAmmoSlot(ARROW))).toBe(true);
    // 已占弹药格同型余位堆不受空格门（CanItemSlotAcceptPickup :39540 面照走）
    const inv2 = fullInv(WOOD);
    inv2.slots[54] = { id: GEL, stack: 1 };
    expect(canTakeToPersonalInventory(inv2.slots, GEL, ITEM_DEFS[GEL].maxStack ?? 9999,
      false, true, undefined, false)).toBe(true);
  });
  it('★SW-BM1 Inventory.fillRange 拾取并堆 favorited 拒收（GetItem :39796 CanItemSlotAcceptPickup 面拾取侧）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: GEM, stack: 10, favorited: true };          // 收藏的 OnlyNeedOne 族余位堆
    expect(inv.add(GEM, 5)).toBe(0);                                  // 拾取不丢——拒并后落空格（原版同构）
    expect(inv.slots[10]!.stack).toBe(10);                            // 收藏堆分毫不动（不并堆）
    expect(inv.slots.filter((s) => s?.id === GEM && !s.favorited).reduce((n, s) => n + s!.stack, 0)).toBe(5);
    inv.slots[10] = { id: GEM, stack: 10 };                           // 去收藏 → 并堆面恢复（升序首匹配堆吸收）
    expect(inv.add(GEM, 5)).toBe(0);
    expect(inv.slots.filter((s) => s?.id === GEM).reduce((n, s) => n + s!.stack, 0)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// R7 容器语境（ChestUI.cs:330-355）+ R8 收藏容器自锁拖放面
// ---------------------------------------------------------------------------
describe('★SW-BM1 guidePlaced 保词缀（向导材料槽对换/取回全程,Utils.Swap 整 Item 对象语义）', () => {
  it('结构锁：guidePlaced 类型带 prefix 位 + 对换/置入/取回三写点随行词缀', () => {
    // ★SW-RB5a 2026-09-07 重钉：类型增 favorited 位,Shift 对换支（裸 Utils.Swap,
    // 非 MouseItemSwap）favorited 随 Item 对象双向骑行;左键支（MouseItemSwap
    // 双端清,context 7 不在 retainFavoriteOnMoveAt）依旧不携带
    // ★SW-BP1 2026-09-07 重钉：取回支 add 通道增 favorited 入参（GetOrDropItem
    // 整 Item 对象回包面,closeInventory/guideSearch 两处同式）+ 落点 p.y→p.cy
    expect(srcMatch(/private guidePlaced: \{ id: number; stack: number; prefix\?: number; favorited\?: boolean; placeStyle\?: number \} \| null = null;/)).toBe(true);
    expect(srcMatch(/this\.guidePlaced = \{ id: cur\.id, stack: cur\.stack, \.\.\.\(cur\.prefix !== undefined \? \{ prefix: cur\.prefix \} : \{\}\), \.\.\.\(cur\.favorited \? \{ favorited: true \} : \{\}\), \.\.\.\(cur\.placeStyle !== undefined \? \{ placeStyle: cur\.placeStyle \} : \{\}\) \};/)).toBe(true);
    expect(srcMatch(/inv\.add\(pl\.id, pl\.stack, pl\.prefix, pl\.placeStyle, false, false, !!pl\.favorited\)/)).toBe(true);
    expect(srcMatch(/shiftGuideSwap\(i: number, cur: \{ id: number; stack: number; prefix\?: number; favorited\?: boolean; placeStyle\?: number \}\)/)).toBe(true);
  });
  // ★SW-RB5a 2026-09-07 左键 case 0 1:1（ItemSlot.cs:912 MouseItemSwap 先行 +
  //  :968-985 CanStack 并回）：异词缀同型不并堆（词缀不丢）、槽满=纯对换（旧 no-op）、
  //  放置/对换支补尾奏音 7（:986-988）;旧「同 vid 即并」「isMaterialVid(pl) 对换门」退役
  it('★SW-RB5a 结构锁：左键 case 0 对换先行+CanStack 并回+尾奏音', () => {
    expect(srcMatch(/if \(canMergeStack\(cur, pl\) && cur\.stack !== cap && pl\.stack !== cap\) \{/)).toBe(true);
    expect(srcMatch(/const mv = cap - cur\.stack;/)).toBe(true);
    expect(srcMatch(/this\.heldStack!\.stack = pl\.stack - mv;/)).toBe(true);
    expect(srcMatch(/const cap = maxStackOf\(pl\.id\);/)).toBe(true);
    expect(srcMatch(/vidOfItem\(cur\.id\) === vidOfItem\(pl\.id\)/)).toBe(false);
    expect(srcMatch(/isMaterialVid\(vidOfItem\(pl\.id\)\)/)).toBe(false);
  });
});

describe('R7 chestContainerContext：世界箱3 / 银行族4 / 虚空保险库32', () => {
  it(':331-355 逐支', () => {
    expect(chestContainerContext(0)).toBe(3);
    expect(chestContainerContext(undefined)).toBe(3);
    expect(chestContainerContext(-2)).toBe(4);
    expect(chestContainerContext(-3)).toBe(4);
    expect(chestContainerContext(-4)).toBe(4);
    expect(chestContainerContext(-5)).toBe(32);
    expect(slotContext('chest', 0, true, -5)).toBe(32);
  });
  it('虚空保险库 Alt+点 = 可收藏（canFavoriteAt[32] :361）；世界箱 Alt+点 = 不可', () => {
    const a = fakeAY({ chestX: -5, chestItems: [{ id: WOOD, stack: 3 }, null] });
    expect(a.fake.altSlotClick(0, 'chest', true)).toBe(true);
    expect(a.fake.openChest!.items[0]!.favorited).toBe(true);
    const b = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: 3 }, null] });
    expect(b.fake.altSlotClick(0, 'chest', true)).toBe(false);        // context 3 ∉ canFavoriteAt
    expect(b.fake.openChest!.items[0]!.favorited ?? false).toBe(false);
  });
  it('虚空保险库取件保收藏（retainFavoriteOnMoveAt[32] :365）；世界箱取件清', () => {
    const a = fakeAY({ chestX: -5, chestItems: [{ id: WOOD, stack: 3, favorited: true }] });
    a.fake.pickUp.call(a.fake, 0, 'chest');
    expect(a.fake.heldStack!.favorited).toBe(true);
    const b = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: 3, favorited: true }] });
    b.fake.pickUp.call(b.fake, 0, 'chest');
    expect(b.fake.heldStack!.favorited).toBe(false);
  });
  it('拖放入虚空保险库保收藏；拖入世界箱清（placeHeld 双向面）', () => {
    const a = fakeAY({ chestX: -5, chestItems: [null] });
    a.fake.heldStack = { id: WOOD, stack: 2, favorited: true };
    a.fake.placeHeld.call(a.fake, 0, 'chest');
    expect(a.fake.openChest!.items[0]!.favorited).toBe(true);
    const b = fakeAY({ chestX: 0, chestItems: [null] });
    b.fake.heldStack = { id: WOOD, stack: 2, favorited: true };
    b.fake.placeHeld.call(b.fake, 0, 'chest');
    expect(b.fake.openChest!.items[0]!.favorited).toBe(false);
  });
});

describe('R8 IsBlockedFromTransferIntoChest 拖放面（ChestUI.cs:1287-1298 + PickItemMovementAction :1483-1492）', () => {
  it('收藏钱袋(3213) 拒入存钱罐(-2)；不收藏则可入', () => {
    const a = fakeAY({ chestX: -2, chestItems: [null] });
    a.fake.heldStack = { id: MONEY_TROUGH, stack: 1, favorited: true };
    a.fake.placeHeld.call(a.fake, 0, 'chest');
    expect(a.fake.openChest!.items[0]).toBeNull();                    // 自锁：无动作
    expect(a.fake.heldStack).not.toBeNull();
    const b = fakeAY({ chestX: -2, chestItems: [null] });
    b.fake.heldStack = { id: MONEY_TROUGH, stack: 1 };
    b.fake.placeHeld.call(b.fake, 0, 'chest');
    expect(b.fake.openChest!.items[0]).toEqual({ id: MONEY_TROUGH, stack: 1, favorited: false });
  });
  it('收藏虚空袋(4131) 拒入虚空保险库(-5)；钱袋入虚空库/虚空袋入存钱罐均放行（按容器身份配对）', () => {
    const a = fakeAY({ chestX: -5, chestItems: [null] });
    a.fake.heldStack = { id: VOID_BAG, stack: 1, favorited: true };
    a.fake.placeHeld.call(a.fake, 0, 'chest');
    expect(a.fake.openChest!.items[0]).toBeNull();
    const b = fakeAY({ chestX: -5, chestItems: [null] });
    b.fake.heldStack = { id: MONEY_TROUGH, stack: 1, favorited: true };   // 钱袋≠虚空库自锁对
    b.fake.placeHeld.call(b.fake, 0, 'chest');
    expect(b.fake.openChest!.items[0]).not.toBeNull();
    const c = fakeAY({ chestX: -2, chestItems: [null] });
    c.fake.heldStack = { id: VOID_BAG, stack: 1, favorited: true };        // 虚空袋≠存钱罐自锁对
    c.fake.placeHeld.call(c.fake, 0, 'chest');
    expect(c.fake.openChest!.items[0]).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R4b journey 研究随垃圾桶（ItemSlot.cs:733-738）
// ---------------------------------------------------------------------------
describe('R4b 研究随垃圾桶：献祭两支 + 音面判据（:735 !(A|B) 非短路）', () => {
  it('新件覆盖剩余缺口整段 → 献祭成立,TrashItem 静默', () => {
    const a = fakeAY({ researchHave: 0, researchNeed: 5 });
    a.inv.slots[10] = { id: WOOD, stack: 5 };
    expect(a.fake.altMoveClick(10, 'inv', false, true, true)).toBe(true);
    expect(a.sacrifices).toEqual([[9, 5]]);                           // onlyIfFinish 支（克隆面）
    expect(a.wavs).toContain('Research_0');                           // :1265 跨线完成音
    expect(a.files).not.toContain('trash_item_0');                    // :735-737 静默 TrashItem
    expect(a.inv.trash).toEqual({ id: WOOD, stack: 5, favorited: false });   // 本体照扔（:739）
  });
  it('新件不足缺口 → onlyIfFinish 拒；旧桶件整段献祭成立（:734 第二支）', () => {
    const a = fakeAY({ researchHave: 0, researchNeed: 5 });
    a.inv.slots[10] = { id: WOOD, stack: 3 };
    a.inv.trash = { id: WOOD, stack: 10 };
    expect(a.fake.altMoveClick(10, 'inv', false, true, true)).toBe(true);
    expect(a.sacrifices).toEqual([[9, 5]]);                           // 只剩旧桶支（num2=5 整段）
    expect(a.wavs).toContain('Research_0');
    expect(a.files).not.toContain('trash_item_0');
    expect(a.inv.trash).toEqual({ id: WOOD, stack: 3, favorited: false }); // 旧桶被新件覆盖
  });
  it('两支皆空 → TrashItem 照播；非旅程不献祭（TryResearchingItem :1251 门）', () => {
    const a = fakeAY({ researchHave: 5, researchNeed: 5 });           // 已研究满 → 两支皆拒
    a.inv.slots[10] = { id: WOOD, stack: 3 };
    expect(a.fake.altMoveClick(10, 'inv', false, true, true)).toBe(true);
    expect(a.sacrifices).toEqual([]);
    expect(a.files).toContain('trash_item_0');
    const b = fakeAY({ researchHave: 0, researchNeed: 5 });
    (b.fake.game as { world: { isJourney: boolean } }).world = { isJourney: false };
    b.inv.slots[10] = { id: WOOD, stack: 5 };
    expect(b.fake.altMoveClick(10, 'inv', false, true, true)).toBe(true);
    expect(b.sacrifices).toEqual([]);
    expect(b.files).toContain('trash_item_0');
  });
  it('placeTrash 面（LeftClick case0 context 6 :909-916）：持物入桶同献祭,音面同判据', () => {
    const a = fakeAY({ researchHave: 0, researchNeed: 5 });
    a.fake.heldStack = { id: WOOD, stack: 5 };
    a.inv.trash = { id: iidOf(2), stack: 1 };                         // 旧桶异型件 → 第二支拒
    a.fake.placeTrash.call(a.fake);
    expect(a.sacrifices).toEqual([[9, 5]]);                           // 新件克隆支成立（onlyIfFinish）
    expect(a.wavs).toContain('Research_0');
    expect(a.files).not.toContain('trash_item_0');                    // :978-981 !flag2 静默
    expect(a.inv.trash).toEqual({ id: WOOD, stack: 5, favorited: false });   // 收藏清（:1230-1234）
    expect(a.fake.heldStack).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R5 研究/向导 Shift 特化支（ItemSlot.cs:631-651 + :787-821）；重铸支结案证据
// ---------------------------------------------------------------------------
describe('R5 菜单特化路由（GetAlternateClickAction :631-651 else-if 序）', () => {
  const env = (over: Partial<Parameters<typeof planAlternateClick>[0]>) => ({
    context: 0, itemAir: false, favorited: false, isCoin: false,
    shopOpen: false, chestOpen: false, chestCanTake: false, canTakeToInventory: true,
    controlDown: false, shiftDown: true, ...over,
  });
  it('研究菜单在显：context 0 → toChest(9)（:633-635）；context 1/2 落空', () => {
    expect(planAlternateClick(env({ researchMenuOpen: true }))).toEqual({ kind: 'toChest', cursorOverride: 9 });
    expect(planAlternateClick(env({ researchMenuOpen: true, context: 1 }))).toBeNull();
    expect(planAlternateClick(env({ researchMenuOpen: true, context: 2 }))).toBeNull();
  });
  it('向导反查在显：context 0 且材料 → toChest(9)（:645-651）；非材料落空；研究优先于箱', () => {
    expect(planAlternateClick(env({ guideMenuOpen: true, itemMaterial: true })))
      .toEqual({ kind: 'toChest', cursorOverride: 9 });
    expect(planAlternateClick(env({ guideMenuOpen: true, itemMaterial: false }))).toBeNull();
    expect(planAlternateClick(env({ guideMenuOpen: true, itemMaterial: true, chestOpen: true, chestCanTake: false })))
      .toEqual({ kind: 'toChest', cursorOverride: 9 });               // :645 先于 :652 箱支
  });
  it('研究支执行面：Shift+点背包格整段献祭 min(need-have, stack)（:787-792）', () => {
    const a = fakeAY({ researchHave: 2, researchNeed: 5 });
    a.fake.researchMenuShowing = () => true;
    a.inv.slots[10] = { id: WOOD, stack: 10 };
    expect(a.fake.altMoveClick(10, 'inv', true, false, true)).toBe(true);
    expect(a.sacrifices).toEqual([[9, 3]]);                           // min(5-2,10)=3
    expect(a.inv.slots[10]!.stack).toBe(7);                           // 溢出留原格（近似登记）
    expect(a.files).toContain('Research_1');                          // 未跨线=63（Research_1..3）
    expect(a.wavs).toEqual([]);
    const b = fakeAY({ researchHave: 2, researchNeed: 5 });
    b.fake.researchMenuShowing = () => true;
    b.inv.slots[10] = { id: WOOD, stack: 3 };
    b.fake.altMoveClick(10, 'inv', true, false, true);
    expect(b.sacrifices).toEqual([[9, 3]]);
    expect(b.inv.slots[10]).toBeNull();                               // 恰好献完整格清
  });
  it('向导支执行面：Shift+点材料格与材料槽对换 + SoundID 7（:810-815）', () => {
    const MAT_VID = [...materialIids()].find((v) => VANILLA_ITEM_KEY_BY_ID[v] && ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]] !== undefined);
    if (MAT_VID === undefined) throw new Error('未找到材料样本');
    const MAT = iidOf(MAT_VID);
    const a = fakeAY();
    a.fake.guideEl = {} as HTMLDivElement;                            // InGuideCraftMenu 在显
    a.fake.guidePlaced = { id: MAT, stack: 2 };
    a.fake.guideRefresh = () => a.refreshHooks;
    a.inv.slots[10] = { id: WOOD, stack: 7 };
    expect(a.fake.altMoveClick(10, 'inv', true, false, true)).toBe(true);
    expect(a.fake.guidePlaced).toEqual({ id: WOOD, stack: 7 });       // 点格件入材料槽
    expect(a.inv.slots[10]).toEqual({ id: MAT, stack: 2 });           // 旧材料槽件回格（Utils.Swap）
    expect(a.plays).toContain('pickup');                              // :814 SoundID 7
  });
  it('重铸支不可达证据结案：showReforge 全屏 overlay 拦截槽点击（UI.ts 源锚）', () => {
    expect(srcMatch(/overlay\.style\.cssText = 'position:fixed; inset:0; background:rgba\(0,0,0,0\.45\); z-index:1150;/)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #9 GetItem 币种专音（Player.cs:39755/:39802/:39845/:39870 IsACoin ? 38 : 7）
// ---------------------------------------------------------------------------
describe('#9 币种专音：箱→背包 GetItem 面 IsACoin → SoundID 38(CoinPickup)', () => {
  it('铜币快取出播 coin；木播 pickup', () => {
    const a = fakeAY({ chestX: 0, chestItems: [{ id: COPPER_COIN, stack: 50 }] });
    expect(a.fake.altMoveClick(0, 'chest', true, false, true)).toBe(true);
    expect(a.plays).toContain('coin');
    expect(a.plays).not.toContain('pickup');
    const b = fakeAY({ chestX: 0, chestItems: [{ id: WOOD, stack: 5 }] });
    b.fake.altMoveClick(0, 'chest', true, false, true);
    expect(b.plays).toContain('pickup');
    expect(b.plays).not.toContain('coin');
  });
});

// ---------------------------------------------------------------------------
// #10 Quick Trash 三态（Main.cs:51444-51466 + ItemSlot.Options :28-30）
// ---------------------------------------------------------------------------
describe('#10 Quick Trash 三态：映射 / 循环序 / 路由生效', () => {
  it('三态 → ItemSlot.Options 布尔对（Main.cs 循环终态）', () => {
    expect(quickTrashOptionsOf('leftControl')).toEqual({ disableLeftShiftTrashCan: true, disableQuickTrash: false });
    expect(quickTrashOptionsOf('leftShift')).toEqual({ disableLeftShiftTrashCan: false, disableQuickTrash: false });
    expect(quickTrashOptionsOf('disabled')).toEqual({ disableLeftShiftTrashCan: false, disableQuickTrash: true });
    expect(options.data.quickTrashMode).toBe('leftControl');          // 缺省 = ItemSlot.cs:28-30
  });
  it('循环序 = IngameOptions（Left Control→Left Shift→Disabled→…）', () => {
    expect(QUICK_TRASH_MODES).toEqual(['leftControl', 'leftShift', 'disabled']);
    expect(cycleQuickTrashMode('leftControl')).toBe('leftShift');
    expect(cycleQuickTrashMode('leftShift')).toBe('disabled');
    expect(cycleQuickTrashMode('disabled')).toBe('leftControl');
  });
  it('Left Shift 档：Shift+点无箱无店 = GetSellOrTrash（:659 支开）；Disabled 档：Shift/Ctrl 双闭', () => {
    const LS = { disableLeftShiftTrashCan: false, disableQuickTrash: false };
    expect(planAlternateClick({
      context: 0, itemAir: false, favorited: false, isCoin: false, shopOpen: false,
      chestOpen: false, chestCanTake: false, canTakeToInventory: true,
      controlDown: false, shiftDown: true, opts: LS,
    })).toEqual({ kind: 'trash', cursorOverride: 6 });
    const DIS = { disableLeftShiftTrashCan: false, disableQuickTrash: true };
    expect(planAlternateClick({
      context: 0, itemAir: false, favorited: false, isCoin: false, shopOpen: false,
      chestOpen: false, chestCanTake: false, canTakeToInventory: true,
      controlDown: false, shiftDown: true, opts: DIS,
    })).toBeNull();
    expect(planAlternateClick({
      context: 0, itemAir: false, favorited: false, isCoin: false, shopOpen: false,
      chestOpen: false, chestCanTake: false, canTakeToInventory: true,
      controlDown: true, shiftDown: false, opts: DIS,
    })).toBeNull();
    // Disabled 档：开箱 Shift 快移仍在（:652 箱支先于 :659 快弃支）
    expect(planAlternateClick({
      context: 0, itemAir: false, favorited: false, isCoin: false, shopOpen: false,
      chestOpen: true, chestCanTake: true, canTakeToInventory: true,
      controlDown: false, shiftDown: true, opts: DIS,
    })).toEqual({ kind: 'toChest', cursorOverride: 9 });
  });
  it('设置行接线锚（Settings.ts）+ 路由进线锚（UI.ts）', () => {
    expect(srcMatch(/quickTrashMode === 'leftShift' \? 223/, '../src/ui/Settings.ts')).toBe(true);
    expect(srcMatch(/cycleQuickTrashMode\(d\.quickTrashMode\)/, '../src/ui/Settings.ts')).toBe(true);
    expect(srcMatch(/opts: quickTrashOptionsOf\(options\.data\.quickTrashMode\)/)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4a 垃圾桶槽聊天分享（OverrideHover :581-587 → OverrideLeftClick :709-716）
// ---------------------------------------------------------------------------
describe('R4a 垃圾桶 Alt+聊天分享接线（canShareAt[6]=true :380）', () => {
  it('源文本接线锚：Alt+chatInput.isOpen 优先于 Shift 支（OverrideHover 序）', () => {
    expect(srcMatch(/e\.altKey && this\.game\.chatInput\?\.isOpen && this\.game\.player\.inv\.trash/)).toBe(true);
    expect(srcMatch(/insertChatItemTag\(vidOf\(this\.game\.player\.inv\.trash\.id\)\)/)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SW-RB4a 2026-09-06 红蓝对抗修复钉
// ---------------------------------------------------------------------------
describe('SW-RB4a 修复钉', () => {
  const drops: Array<[string, number]> = [];
  it('OnlyNeedOne 染料域勘误（CanBeEquipped Item.cs:1160-1175 不含 dye）：染料 → false,收藏染料堆照常收并', () => {
    const equipVids = JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/data/vanilla-equip.json', import.meta.url)), 'utf8'),
    ) as Record<string, number[]>;
    const dyeVid = equipVids.dye.find((v) => VANILLA_ITEM_KEY_BY_ID[v] !== undefined);
    if (dyeVid === undefined) throw new Error('无已注册染料样本');
    const DYE = iidOf(dyeVid);
    expect(onlyNeedOneInInventory(DYE)).toBe(false);
  });

  it('关包光标物归位（dropItemCheck :5136-5140 GetOrDropItem）：词缀随行入包、满包余量落地不销毁', () => {
    const a = fakeAY();
    const f = a.fake as unknown as Record<string, unknown> & {
      closeInventory(): void;
      heldStack: { id: number; stack: number; prefix?: number } | null;
    };
    f.closeHousingPanel = () => {};
    f.closeItemSearch = () => {};
    f.closeGuideSearch = () => {};
    f.closeChest = () => {};
    f.returnCraftGrid = () => {};
    f.moveGhost = () => {};
    f.invPanel = { style: {} } as unknown as HTMLElement;
    (a.fake.game as Record<string, unknown>).spawnDrop =
      (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
    // ① 词缀件回包：同型同词缀堆并入,词缀不丢
    a.inv.slots[10] = { id: WOOD, stack: 10, prefix: 7 };
    f.heldStack = { id: WOOD, stack: 5, prefix: 7 };
    f.closeInventory();
    expect(a.inv.slots[10]).toEqual({ id: WOOD, stack: 15, prefix: 7 });   // 曾洗成无词缀
    expect(f.heldStack).toBeNull();
    expect(a.inv.countOf(WOOD)).toBe(15);
    // ② 满包余量落地（GetOrDropItem 尾 RequestNewItem）——曾静默销毁
    const b = fakeAY();
    const g2 = b.fake as unknown as Record<string, unknown> & {
      closeInventory(): void;
      heldStack: { id: number; stack: number; prefix?: number } | null;
    };
    g2.closeHousingPanel = () => {};
    g2.closeItemSearch = () => {};
    g2.closeGuideSearch = () => {};
    g2.closeChest = () => {};
    g2.returnCraftGrid = () => {};
    g2.moveGhost = () => {};
    g2.invPanel = { style: {} } as unknown as HTMLElement;
    (b.fake.game as Record<string, unknown>).spawnDrop =
      (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
    for (let i = 0; i < 58; i++) b.inv.slots[i] = { id: WOOD, stack: WOOD_MAX };
    g2.heldStack = { id: WOOD, stack: 5 };
    g2.closeInventory();
    expect(b.inv.countOf(WOOD)).toBe(58 * WOOD_MAX);    // 一件未进包
    expect(drops.length).toBe(1);                        // 满包件 5 落地（①并入成功不掉）
    expect(drops[0][1]).toBe(5);
  });
});
