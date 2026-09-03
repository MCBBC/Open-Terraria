// 放置语义回填防回归(itemfunc.createTile/placeStyle → def.tile)
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VI } from '../src/data/itemKeys';

const defOfVid = (vid: number) => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
};

describe('放置回填(createTile → def.tile)', () => {
  it('全部 createTile≠-1 的 vi_ 物品都落上 tile(0 缺失)', () => {
    const missing: number[] = [];
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const m = /^vi_(\d+)_/.exec(ITEM_DEFS[i].key);
      if (!m) continue;
      const f = itemFuncOfVid(Number(m[1]));
      if (!f || f.createTile === undefined || f.createTile === -1) continue;
      if (ITEM_DEFS[i].tile === undefined) missing.push(Number(m[1]));
    }
    expect(missing, `未落 tile 的 vid: ${missing.slice(0, 10)}`).toEqual([]);
  });

  it('本地放置物的继任 vi_ 物品 tile 落点正确', () => {
    const cases: Array<[number, string]> = [
      [8, 'torch'],            // Torch → tile 'torch'(sheet 4)
      [25, 'door_closed'],     // Wooden Door
      [36, 'workbench'],       // Work Bench(sheet 18)
      [33, 'furnace'],         // Furnace(sheet 17)
      [35, 'anvil'],           // Iron Anvil(sheet 16)
      [48, 'chest'],           // Chest(sheet 21)
      [94, 'platform'],        // Wood Platform(sheet 19)
      [32, 'table'],           // Table(sheet 14)
      [34, 'chair'],           // Chair(sheet 15)
      [965, 'v_213_rope'],     // Rope
    ];
    for (const [vid, tileKey] of cases) {
      const d = defOfVid(vid);
      expect(d, `vid ${vid} 无 def`).toBeDefined();
      expect(TILE_BY_KEY[d!.tile!], `vid ${vid} tile=${d!.tile} ≠ ${tileKey}`).toBe(TILE_BY_KEY[tileKey]);
    }
  });

  it('钱币三档 maxStack=100(100 进位依赖)——铂币 74 无覆盖=9999（1456/1457 同值堆叠改制）', () => {
    // 1456/1457 同值 SetDefaults 仅 11 处 maxStack 覆盖(1457 :2222-2264 三档)：71/72/73=100，74（铂币）无覆盖走
    // CommonMaxStack=9999（Item.cs:66；曾四档全 100 的旧断言陈旧）
    for (const vid of [71, 72, 73]) {
      expect(defOfVid(vid)!.maxStack, `vid ${vid}`).toBe(100);
    }
    expect(defOfVid(74)!.maxStack).toBe(9999);
  });

  it('VI() 查表与关键常量(驼峰权威,禁手拼键)', () => {
    expect(VI(9)).toMatch(/^vi_9_/);
    expect(VI(71)).toMatch(/^vi_71_/);
    expect(VI(999999)).toBe('');
  });
});

// ★F1（十三批,2026-09-03）共享 case 组伪值纠偏 + 缺档补齐金标钉值：
//  vanilla-itemfunc.json 提取器对「多支共享 case 段逐支 placeStyle」只落组首支值
//  （伪值）,if/else 覆写形态整组无条目（缺档）——items.ts SHARED_GROUP_PLACE_STYLE_1457
//  无条件赋值纠偏。真值逐条亲读 1457 Item.cs 核实（行号随行）;本钉防未来重提取/
//  重排 items.ts 时回退（运行时终态=回填循环只补 undefined,不会覆写本表）。
describe('F1 共享 case 组 placeStyle 金标（23 件,Item.cs 终值）', () => {
  const GOLD: ReadonlyArray<readonly [number, number, string]> = [
    // 花岗岩家具族
    [3128, 26, ':29267-29268'],   // Granite Clock
    [3131, 34, ':29292-29293'],   // Granite Door（原 doorPs3131 单件块并入）
    [3134, 26, ':29318-29319'],   // Granite Dresser
    [3137, 29, ':29344-29345'],   // Granite Bathtub
    [3140, 35, ':29369-29370'],   // Granite Lantern
    [3143, 28, ':29396-29397'],   // Granite Piano
    [3146, 28, ':29421-29422'],   // Granite Platform
    [3149, 30, ':29447-29448'],   // Granite Bookshelf
    [3152, 31, ':29473-29474'],   // Granite Toilet
    [3155, 33, ':29499-29500'],   // Granite Table
    [3158, 29, ':29525-29526'],   // Granite Work Bench
    // 大理石家具族
    [3161, 29, ':29055-29056'],   // Marble Candelabra
    [3164, 29, ':29084-29085'],   // Marble Dresser
    [3167, 30, ':29110-29111'],   // Marble Bathtub
    [3170, 29, ':29136-29137'],   // Marble Piano
    [3173, 28, ':29163-29164'],   // Marble Door
    [3176, 34, ':29189-29190'],   // Marble Chair
    [3179, 35, ':29215-29216'],   // Marble Table
    [3181, 51, ':29238-29239'],   // Marble Chest
    // 南瓜灯/黑曜石灯 42（if/else 形态）
    [2641, 31, ':25729-25732'],   // Pumpkin Lantern
    [2642, 32, ':25733-25735'],   // Obsidian Lantern
    // 远古军团奖杯 240（default 60 + if 覆写）
    [3866, 61, ':34204-34207'],   // Betsy Trophy
    [3867, 60, ':34203'],         // Dark Mage Trophy（default 直落）
    [3868, 62, ':34208-34211'],   // Ogre Trophy
  ];
  it('vid → def.placeStyle 逐件对金标（20 伪值 + 3 缺档 + 3131 并表 = 24 行）', () => {
    for (const [vid, ps, loc] of GOLD) {
      const d = defOfVid(vid);
      expect(d, `vid ${vid} 无 def`).toBeDefined();
      expect(d!.placeStyle, `vid ${vid} placeStyle（Item.cs${loc}）`).toBe(ps);
    }
  });
  it('组首支对照（提取器伪值来源锚）：3126=25/3129=33/3141=27 与 itemfunc 表一致', () => {
    // 伪值=组首支真值（3128 组首 3126→25、3131 组首 3129→33、3143 组首 3141→27）——
    // 提取器语义锚仍在册,证明纠偏只动非首支
    expect(defOfVid(3126)!.placeStyle).toBe(25);
    expect(defOfVid(3129)!.placeStyle).toBe(33);
    expect(defOfVid(3141)!.placeStyle).toBe(27);
  });
});
