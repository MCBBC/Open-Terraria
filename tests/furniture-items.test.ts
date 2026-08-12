// 挂物族（物品框 395 / 武器架 471 / 模特 470 / 帽架 475 / 食物盘 520 / 展示罐 698）
// 存放展示语义测试——原版 TileEntity 体系对表：
//   TEItemFrame.cs / TEWeaponsRack.cs / TEDisplayDoll.cs / TEHatRack.cs /
//   TEFoodPlatter.cs / TEDeadCellsDisplayJar.cs（1456 反编译）
// 以及破坏链 WorldGen.cs:63703-63746（KillTile_DropItems 提前 return）与
// :62540-62560（CheckTileBreakability2_ShouldTileSurvive）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_STABLE_OF_INTERNAL } from '../src/data/items';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import {
  FURNITURE_TILE_KIND, furnitureAnchor, furnitureSlotCount, furniturePlaceSingle,
  furniturePopSingle, furnitureTryBreak, furnitureTakeFirst, dollPlace, hatRackPlace,
  removeFurnitureAt, getOrCreateFurniture, furnitureToSave, furnitureFromSave,
  fitsItemFrame, fitsWeaponRack, fitsFoodPlatter, fitsHatRack, fitsDisplayDoll,
  dollTargetSlot, VANILLA_IS_FOOD, VANILLA_WEAPON_RACK_EXTRA,
  type FurnitureItemRecord, type FurnitureStoreView,
} from '../src/world/FurnitureItems';

/** 原版 item id → 内部 item id（记录里存内部 id，判定传原版 id） */
const iid = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];

/** 伪造最小 store 视图：只填 frameX/frameY（锚点化只读帧） */
function mkStore(frames: Array<[number, number, number, number]>, size = 128): FurnitureStoreView {
  const frameX = new Uint16Array(size * size);
  const frameY = new Uint16Array(size * size);
  for (const [x, y, fx, fy] of frames) {
    frameX[y * size + x] = fx;
    frameY[y * size + x] = fy;
  }
  return { frameX, frameY, idx: (x, y) => y * size + x };
}

// 测试用原版 id（vanilla-itemfunc/stats/equip 实测）：
//   4 铁短剑(dmg12/useStyle1) / 40 箭(dmg5/useStyle0) / 166 炸弹(集合成员,dmg0)
//   2292 钓竿(fishingPole30) / 3509 铜镐(useStyle 补丁=1) / 3196 炸弹鱼(集合成员)
//   353 麦酒(IsFood) / 188 治疗药水(非 IsFood) / 37 头盔 / 80 胸甲 / 76 腿甲
//   49 配饰(acc1) / 2430 坐骑(mount)
const VID = { sword: 4, arrow: 40, bomb: 166, rod: 2292, pick: 3509, bombFish: 3196, ale: 353, potion: 188, head: 37, body: 80, legs: 76, acc: 49, mount: 2430 };

describe('挂物族：注册与槽位布局', () => {
  it('六个挂物 tile 均已登记到类别表', () => {
    const t = TILE_BY_KEY;
    expect(FURNITURE_TILE_KIND.get(t['v_395_item_frame'])).toBe('item_frame');
    expect(FURNITURE_TILE_KIND.get(t['v_471_weapon_rack'])).toBe('weapon_rack');
    expect(FURNITURE_TILE_KIND.get(t['v_470_mannequins'])).toBe('display_doll');
    expect(FURNITURE_TILE_KIND.get(t['v_475_hat_rack'])).toBe('hat_rack');
    expect(FURNITURE_TILE_KIND.get(t['v_520_plate'])).toBe('food_platter');
    expect(FURNITURE_TILE_KIND.get(t['v_698_item_flask'])).toBe('display_jar');
  });

  it('槽位数对表原版持久化形状（框/架/盘/罐 1；模特 19；帽架 4）', () => {
    expect(furnitureSlotCount('item_frame')).toBe(1);
    expect(furnitureSlotCount('weapon_rack')).toBe(1);
    expect(furnitureSlotCount('food_platter')).toBe(1);
    expect(furnitureSlotCount('display_jar')).toBe(1);
    expect(furnitureSlotCount('display_doll')).toBe(19); // equip9+misc1+dye9
    expect(furnitureSlotCount('hat_rack')).toBe(4);      // hat2+dye2
  });
});

describe('挂物族：锚点多格归一（任意命中格 → 左上锚点）', () => {
  it('物品框 2×2（TEItemFrame.cs:100-106，含 style 偏移）', () => {
    // style1 基偏移 36：锚点 (10,20) 帧对 (36,0)/(54,0)/(36,18)/(54,18)
    const st = mkStore( [[10, 20, 36, 0], [11, 20, 54, 0], [10, 21, 36, 18], [11, 21, 54, 18]]);
    expect(furnitureAnchor(st, 'item_frame', 10, 20)).toEqual([10, 20]);
    expect(furnitureAnchor(st, 'item_frame', 11, 21)).toEqual([10, 20]);
    expect(furnitureAnchor(st, 'item_frame', 11, 20)).toEqual([10, 20]);
  });

  it('武器架 3×3（TEWeaponsRack.cs:166/209）', () => {
    const st = mkStore( [[30, 40, 0, 0], [32, 42, 36, 36], [31, 41, 18, 18]]);
    for (const [x, y] of [[30, 40], [32, 42], [31, 41]]) {
      expect(furnitureAnchor(st, 'weapon_rack', x, y)).toEqual([30, 40]);
    }
  });

  it('模特 2×3（TEDisplayDoll.cs:508-514，样式横排 fx 步 72）', () => {
    // 女模特 style1：锚 (50,60) 帧对 (72,0)/(90,0)/(72,18)/(72,36)...
    const st = mkStore( [[50, 60, 72, 0], [51, 60, 90, 0], [50, 62, 72, 36], [51, 62, 90, 36]]);
    expect(furnitureAnchor(st, 'display_doll', 51, 62)).toEqual([50, 60]);
    expect(furnitureAnchor(st, 'display_doll', 50, 60)).toEqual([50, 60]);
  });

  it('帽架 3×4（TEHatRack.cs:284-291）', () => {
    // style1 基偏移 fx=108：锚 (70,80)，命中右下 (72,83) 帧 (144,54)
    const st = mkStore( [[70, 80, 108, 0], [72, 83, 144, 54]]);
    expect(furnitureAnchor(st, 'hat_rack', 72, 83)).toEqual([70, 80]);
  });

  it('展示罐 1×2 与食物盘 1×1（TEDeadCellsDisplayJar.cs:126-134 / TEFoodPlatter.cs:24-32）', () => {
    const st = mkStore( [[90, 100, 0, 0], [90, 101, 0, 18], [95, 100, 0, 0]]);
    expect(furnitureAnchor(st, 'display_jar', 90, 101)).toEqual([90, 100]);
    expect(furnitureAnchor(st, 'food_platter', 95, 100)).toEqual([95, 100]);
  });
});

describe('挂物族：放置限制（对表 TE 的 Fits/CanQuickSwap 判定）', () => {
  it('武器架：damage+useStyle / 钓竿 / 集合成员 / useStyle 补丁通过；弹药与杂物拒绝', () => {
    expect(fitsWeaponRack(VID.sword)).toBe(true);        // dmg12 useStyle1
    expect(fitsWeaponRack(VID.rod)).toBe(true);          // fishingPole30
    expect(fitsWeaponRack(VID.bomb)).toBe(true);         // CanBePlacedOnWeaponRacks（dmg0）
    expect(fitsWeaponRack(VID.bombFish)).toBe(true);     // 集合成员 3196
    expect(fitsWeaponRack(VID.pick)).toBe(true);         // 铜镐：USE_STYLE_PATCH=1（提取缺口补丁）
    expect(fitsWeaponRack(VID.arrow)).toBe(false);       // dmg5 但 useStyle0（弹药）
    expect(fitsWeaponRack(VID.potion)).toBe(false);      // 无 damage
    expect(fitsWeaponRack(-1)).toBe(false);              // 空
    expect(VANILLA_WEAPON_RACK_EXTRA.size).toBe(114);    // ItemID.cs:1086
  });

  it('物品框/展示罐：任何 stack>0 物品均可（TEItemFrame.cs:170）', () => {
    expect(fitsItemFrame(VID.potion)).toBe(true);
    expect(fitsItemFrame(VID.arrow)).toBe(true);
    expect(fitsItemFrame(0)).toBe(false);
  });

  it('食物盘：仅 IsFood 集合（ItemID.cs:258，86 项）', () => {
    expect(fitsFoodPlatter(VID.ale)).toBe(true);
    expect(fitsFoodPlatter(5042)).toBe(true); // 咖啡
    expect(fitsFoodPlatter(VID.potion)).toBe(false);
    expect(fitsFoodPlatter(VID.sword)).toBe(false);
    expect(VANILLA_IS_FOOD.size).toBe(86);
  });

  it('帽架：仅头盔（TEHatRack.cs:331-334 headSlot>0）', () => {
    expect(fitsHatRack(VID.head)).toBe(true);
    expect(fitsHatRack(VID.body)).toBe(false);
    expect(fitsHatRack(VID.acc)).toBe(false);
    expect(fitsHatRack(VID.sword)).toBe(false);
  });

  it('模特：盔甲/配饰/坐骑/武器全收，弹药拒绝（TEDisplayDoll.cs:664-679）', () => {
    expect(fitsDisplayDoll(VID.head)).toBe(true);
    expect(fitsDisplayDoll(VID.body)).toBe(true);
    expect(fitsDisplayDoll(VID.legs)).toBe(true);
    expect(fitsDisplayDoll(VID.acc)).toBe(true);
    expect(fitsDisplayDoll(VID.mount)).toBe(true);
    expect(fitsDisplayDoll(VID.sword)).toBe(true);
    expect(fitsDisplayDoll(VID.arrow)).toBe(false); // useStyle0 且 holdStyle0
  });

  it('模特槽位归属（TEDisplayDoll.TryFitting :680-692）', () => {
    const rec: FurnitureItemRecord = { x: 0, y: 0, kind: 'display_doll', slots: new Array(19).fill(null) };
    expect(dollTargetSlot(rec, VID.head)).toBe(0);
    expect(dollTargetSlot(rec, VID.body)).toBe(1);
    expect(dollTargetSlot(rec, VID.legs)).toBe(2);
    expect(dollTargetSlot(rec, VID.acc)).toBe(3);    // 首个空配饰位
    rec.slots[3] = { id: iid(VID.acc), stack: 1 };
    expect(dollTargetSlot(rec, VID.acc)).toBe(4);    // 下一个空位
    expect(dollTargetSlot(rec, VID.mount)).toBe(8);  // 坐骑槽
    expect(dollTargetSlot(rec, VID.sword)).toBe(9);  // misc 持握展示
    expect(dollTargetSlot(rec, VID.arrow)).toBe(-1); // 不可放
  });
});

describe('挂物族：放入 / 替换 / 取出', () => {
  it('空框放入：槽位 stack=1，手持不在此层扣减（Game 侧 removeAt）', () => {
    const list: FurnitureItemRecord[] = [];
    const item = { id: iid(VID.sword), stack: 3, prefix: 0 };
    const r = furniturePlaceSingle(list, 'item_frame', 10, 20, item, VID.sword);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBeNull();
    expect(list[0].slots[0]).toEqual({ id: iid(VID.sword), stack: 1, prefix: 0 });
  });

  it('占用框再放：旧物作为 replaced 弹出（TE*.TryPlacing :91-93 先 DropItem）', () => {
    const list: FurnitureItemRecord[] = [];
    furniturePlaceSingle(list, 'item_frame', 10, 20, { id: iid(VID.sword), stack: 2 }, VID.sword);
    const r = furniturePlaceSingle(list, 'item_frame', 10, 20, { id: iid(VID.rod), stack: 2 }, VID.rod);
    expect(r.replaced).toEqual({ id: iid(VID.sword), stack: 1, prefix: undefined });
    expect(list[0].slots[0]!.id).toBe(iid(VID.rod));
  });

  it('不合规物品不入槽（武器架拒绝箭）', () => {
    const list: FurnitureItemRecord[] = [];
    const r = furniturePlaceSingle(list, 'weapon_rack', 0, 0, { id: iid(VID.arrow), stack: 5 }, VID.arrow);
    expect(r.ok).toBe(false);
    expect(list).toHaveLength(0);
  });

  it('取出：弹出存放物并清槽（KillTile fail:true → DropItem 语义）', () => {
    const list: FurnitureItemRecord[] = [];
    furniturePlaceSingle(list, 'item_frame', 10, 20, { id: iid(VID.ale), stack: 4 }, VID.ale);
    const popped = furniturePopSingle(list, 'item_frame', 10, 20);
    expect(popped).toEqual({ id: iid(VID.ale), stack: 1, prefix: undefined });
    expect(list[0].slots[0]).toBeNull();
    expect(furniturePopSingle(list, 'item_frame', 10, 20)).toBeNull();
  });

  it('模特 TryFitting：多叠放 1 / 单叠整槽交换 / 占位多叠不动（TEDisplayDoll.cs:693-718）', () => {
    const list: FurnitureItemRecord[] = [];
    const multi = { id: iid(VID.head), stack: 5, prefix: 3 };
    const r1 = dollPlace(list, 0, 0, multi, VID.head);
    expect(r1!.target).toBe(0);
    expect(list[0].slots[0]).toEqual({ id: iid(VID.head), stack: 1, prefix: 3 });
    expect(multi.stack).toBe(4); // 手持 -1
    // 占位 + 多叠 → 不动
    const r2 = dollPlace(list, 0, 0, { id: iid(VID.head), stack: 2 }, VID.head);
    expect(r2).toBeNull();
    expect(list[0].slots[0]!.stack).toBe(1);
    // 单叠整槽交换：换出旧物
    const r3 = dollPlace(list, 0, 0, { id: iid(88), stack: 1 }, 88); // 88 另一顶头盔
    expect(r3!.swappedOut!.id).toBe(iid(VID.head));
    expect(list[0].slots[0]!.id).toBe(iid(88));
  });

  it('帽架 TryFitting：首空槽轮转（TEHatRack.cs:342-347）', () => {
    const list: FurnitureItemRecord[] = [];
    const a = hatRackPlace(list, 0, 0, { id: iid(VID.head), stack: 2 }, VID.head);
    const b = hatRackPlace(list, 0, 0, { id: iid(88), stack: 2 }, 88);
    expect(a!.target).toBe(0);
    expect(b!.target).toBe(1);
    // 双满后单叠替换轮转位 0
    const c = hatRackPlace(list, 0, 0, { id: iid(89), stack: 1 }, 89);
    expect(c!.target).toBe(0);
    expect(c!.swappedOut!.id).toBe(iid(VID.head));
  });

  it('多槽取出：按槽位序取首个非空（模特 equip → misc → dye / 帽架 hat → dye）', () => {
    const list: FurnitureItemRecord[] = [];
    const rec = getOrCreateFurniture(list, 'display_doll', 5, 5);
    rec.slots[9] = { id: iid(VID.sword), stack: 1 };
    rec.slots[0] = { id: iid(VID.head), stack: 1 };
    const taken = furnitureTakeFirst(list, 'display_doll', 5, 5);
    expect(taken!.slot).toBe(0);
    expect(taken!.item.id).toBe(iid(VID.head));
    expect(furnitureTakeFirst(list, 'display_doll', 5, 5)!.slot).toBe(9);
    expect(furnitureTakeFirst(list, 'display_doll', 5, 5)).toBeNull();
  });
});

describe('挂物族：破坏链判定（WorldGen KillTile 前置特例）', () => {
  it('占用框/架/盘/罐：先弹物、方块保留；第二击才 break（KillTile_DropItems :63703 提前 return）', () => {
    const list: FurnitureItemRecord[] = [];
    furniturePlaceSingle(list, 'item_frame', 10, 20, { id: iid(VID.sword), stack: 2 }, VID.sword);
    const first = furnitureTryBreak(list, 'item_frame', 10, 20);
    expect(first.result).toBe('pop');
    expect(first.item!.id).toBe(iid(VID.sword));
    const second = furnitureTryBreak(list, 'item_frame', 10, 20);
    expect(second.result).toBe('break');
    // 真正破坏后移除记录（TileEntityType.Kill）
    removeFurnitureAt(list, 10, 20);
    expect(list).toHaveLength(0);
  });

  it('模特/帽架有物整件不可破坏（IsBreakable，WorldGen.cs:62540-62560）', () => {
    const list: FurnitureItemRecord[] = [];
    const rec = getOrCreateFurniture(list, 'display_doll', 0, 0);
    rec.slots[0] = { id: iid(VID.head), stack: 1 };
    expect(furnitureTryBreak(list, 'display_doll', 0, 0).result).toBe('blocked');
    rec.slots[0] = null;
    expect(furnitureTryBreak(list, 'display_doll', 0, 0).result).toBe('break');
  });
});

describe('挂物族：存档往返（serialize furniture 段 + 稳定 id 映射）', () => {
  it('saveGame → loadSave 后记录与 prefix 完整还原', () => {
    const w = new World(60, 40, 42, 'furn-test');
    const frame = getOrCreateFurniture(w.furnitureItems, 'item_frame', 10, 20);
    frame.slots[0] = { id: iid(VID.sword), stack: 1, prefix: 81 };
    const doll = getOrCreateFurniture(w.furnitureItems, 'display_doll', 30, 30);
    doll.slots[0] = { id: iid(VID.head), stack: 1 };
    doll.slots[9] = { id: iid(VID.sword), stack: 1 };
    const p = new Player(100, 100, new Inventory());
    const json = saveGame(w, p, 0);
    const { world: w2 } = loadSave(json);
    expect(w2.furnitureItems).toHaveLength(2);
    const f2 = w2.furnitureItems.find((r) => r.kind === 'item_frame')!;
    expect(f2.x).toBe(10);
    expect(f2.y).toBe(20);
    // vi_ 物品稳定 id = 原版 id，反向映射归一到首个同稳定 id 的 def（与 chests 同语义，
    // 见 items.ts ITEM_INTERNAL_OF_STABLE 注释）——按内容等价（稳定 id 一致）断言
    expect(f2.slots[0]!.stack).toBe(1);
    expect(f2.slots[0]!.prefix).toBe(81);
    expect(ITEM_STABLE_OF_INTERNAL[f2.slots[0]!.id]).toBe(ITEM_STABLE_OF_INTERNAL[iid(VID.sword)]);
    const d2 = w2.furnitureItems.find((r) => r.kind === 'display_doll')!;
    expect(d2.slots).toHaveLength(19);
    expect(ITEM_STABLE_OF_INTERNAL[d2.slots[0]!.id]).toBe(ITEM_STABLE_OF_INTERNAL[iid(VID.head)]);
    expect(ITEM_STABLE_OF_INTERNAL[d2.slots[9]!.id]).toBe(ITEM_STABLE_OF_INTERNAL[iid(VID.sword)]);
  });

  it('旧档缺 furniture 字段 → 空列表（向后兼容）', () => {
    const w = new World(60, 40, 42, 'furn-legacy');
    const p = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(w, p, 0));
    delete data.furniture;
    const { world: w2 } = loadSave(JSON.stringify(data));
    expect(w2.furnitureItems).toEqual([]);
  });

  it('纯换算层：未知 id 防御置空槽', () => {
    const entries = furnitureToSave(
      [{ x: 1, y: 2, kind: 'hat_rack', slots: [{ id: 7, stack: 1 }, null, null, null] }],
      (id) => (id === 7 ? 99999 : id),
    );
    const back = furnitureFromSave(entries, (id) => (id === 99999 ? 0 : id));
    expect(back[0].slots[0]).toBeNull();
    expect(back[0].slots).toHaveLength(4);
  });
});
