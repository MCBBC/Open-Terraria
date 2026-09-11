// SW-FX29：Sort 钮功能（ItemSorting 整库移植）金标 + 行为矩阵 + 变异证红。
// 金标面 = 反编译直读解析（Terarria1457/）：ItemSorting.cs 层声明序/SetupWhiteLists
// 固定序/SetupSortingPriorities 运行时序 + ItemID.cs/BuffID.cs 21 张 SortingPriority
// 集全量对拍 + Item.cs case 段属性直读 spot + :1353 白名单不变量。
// 行为面 = 52 层谓词/比较器抽样矩阵（分层归属/比较器方向/并叠/收藏/ignore 槽/
// 倍率换序/弹药吸收/币合并/钱袋门/色带 hue/白名单外尾接/容器面）。
// 变异面 = 层表错位/优先级值交换 → 引擎输出必须改变（判别力证红）。
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  sortPlayerInventory, sortContainerItems, LAYER_NAMES,
  useSortDataForTests, getSortDataForTests,
  type SortSlot,
} from '../src/stats/ItemSorting';
import { internalIdOfVanilla, vanillaIdOfItem } from '../src/stats/Shimmer';
import { ITEM_DEFS } from '../src/data/items';

const HERE = path.dirname(fileURLToPath(import.meta.url));           // game/tests
const GAME = path.resolve(HERE, '..');                                // game/
const ROOT1457 = path.resolve(GAME, '..', 'Terarria1457');            // 反编译根
const sortSrc = readFileSync(path.join(ROOT1457, 'Terraria.UI', 'ItemSorting.cs'), 'utf8');
const itemIdSrc = readFileSync(path.join(ROOT1457, 'Terraria.ID', 'ItemID.cs'), 'utf8');
const buffIdSrc = readFileSync(path.join(ROOT1457, 'Terraria.ID', 'BuffID.cs'), 'utf8');
const itemSrc = readFileSync(path.join(ROOT1457, 'Terraria', 'Item.cs'), 'utf8');
const json = JSON.parse(readFileSync(path.join(GAME, 'src/data/vanilla-itemsorting.json'), 'utf8'));

const V = (vid: number): number => {
  const id = internalIdOfVanilla(vid);
  expect(id, `vid ${vid} 应已注册`).toBeGreaterThanOrEqual(0);
  return id;
};
const emptySlots = (): SortSlot[] => new Array(58).fill(null);
const place = (s: SortSlot[], slot: number, vid: number, stack = 1, extra?: Partial<NonNullable<SortSlot>>): SortSlot[] => {
  s[slot] = { id: V(vid), stack, ...extra };
  return s;
};
const vids = (s: SortSlot[]): (number | null)[] => s.map((it) => (it ? vanillaIdOfItem(it.id) : null));

afterEach(() => useSortDataForTests(null));   // 变异注入复原

// ================= 金标一：层结构（ItemSorting.cs 直读） =================

describe('SW-FX29 金标：ItemSorting.cs 层结构直读', () => {
  // 声明序：public static ItemSortingLayer X = new ItemSortingLayer("名", ...
  const decl = [...sortSrc.matchAll(/public static ItemSortingLayer (\w+) = new ItemSortingLayer\("([^"]+)"/g)]
    .map((m) => ({ field: m[1], name: m[2] }));
  // SetupWhiteLists 固定序：list.Add(ItemSortingLayers.X);
  const wlBody = sortSrc.slice(sortSrc.indexOf('public static void SetupWhiteLists'),
    sortSrc.indexOf('for (int i = -48'));
  const wlOrder = [...wlBody.matchAll(/list\.Add\(ItemSortingLayers\.(\w+)\);/g)].map((m) => m[1]);
  // SetupSortingPriorities 运行时序：_layerList.Add(...);（前 4 = AddSortingPriorities…）
  const priBody = sortSrc.slice(sortSrc.indexOf('private static void SetupSortingPriorities'),
    sortSrc.indexOf('private static void Sort(bool withFeedback'));
  const priOrder = [...priBody.matchAll(/_layerList\.Add\(ItemSortingLayers\.(\w+)\);/g)].map((m) => m[1]);

  it('ItemSortingLayers 声明恰 52 层且名表与引擎 LAYER_NAMES 全等（按白名单固定序）', () => {
    expect(decl.length).toBe(52);
    expect(wlOrder.length).toBe(52);
    const fieldToName = new Map(decl.map((d) => [d.field, d.name]));
    const names = wlOrder.map((f) => fieldToName.get(f));
    expect(names).toEqual([...LAYER_NAMES]);
  });

  it('SetupSortingPriorities 运行时序：伤害层整块置顶 + 其余 48 层逐位同白名单序', () => {
    // 前四层经 AddSortingPrioritiesBasedOnPlayerDamage(_layerList)（:1385）整块加入——
    // 文本面只有一次调用,无逐层 Add;随后 48 个 _layerList.Add 从 WeaponsAssorted 起
    expect(priOrder.length).toBe(48);
    expect(priOrder[0]).toBe('WeaponsAssorted');
    expect(priOrder).toEqual(wlOrder.slice(4));
  });

  it('层方法引用的 SortingPriority 集恰为 json 所载 20 张 + BuffID.SortingPriorityFoodBuffs', () => {
    const used = new Set([...sortSrc.matchAll(/ItemID\.Sets\.(SortingPriority\w+)\[/g)].map((m) => m[1]));
    const jsonKeys = Object.keys(json.prio).sort();
    expect([...used].sort()).toEqual(jsonKeys);
    const buffUsed = /BuffID\.Sets\.SortingPriorityFoodBuffs\[/g;
    expect(buffUsed.test(sortSrc)).toBe(true);
    expect(json.buffFoodPrio.length).toBeGreaterThan(0);
  });

  it('layers 表 6196 项全量且 :1353 不变量（LastNotTrash 白名单空）', () => {
    expect(json.meta.itemCount).toBe(6196);
    const keys = Object.keys(json.layers);
    expect(keys.length).toBe(6196);
    for (let v = 0; v < 6196; v++) expect(json.layers[String(v)], `vid ${v}`).toBeDefined();
    const bad = [...new Set(Object.values(json.layers))].filter((l) => (l as number) < 0 || (l as number) > 51);
    expect(bad).toEqual([]);
    // 不变量:所有原版物品 ∈ 0-49 ∪ 51（LastTrash 可收 rare=-1 族;LastNotTrash 恒空）
    const at50 = Object.values(json.layers).filter((l) => l === 50);
    expect(at50).toEqual([]);
  });

  it('引擎白名单视图与 layers 表互逆（Validate 消费面）', () => {
    const data = getSortDataForTests();
    for (const [k, layer] of Object.entries(json.layers)) {
      expect(data.whitelists[layer as number].has(Number(k))).toBe(true);
      expect(data.layers.get(Number(k))).toBe(layer);
    }
    let total = 0;
    for (const set of data.whitelists) total += set.size;
    expect(total).toBe(6196);
  });

  it('Spot：SortingPriorityWeaponsRanged 含 905 钱袋（:1144）', () => {
    const pairs = json.prio.SortingPriorityWeaponsRanged as [number, number][];
    expect(pairs).toContainEqual([905, 1]);
  });
});

// ================= 金标二：21 张优先级表全量对拍（ItemID.cs/BuffID.cs 直读） =================

describe('SW-FX29 金标：SortingPriority 集全量对拍', () => {
  const parseIntSet = (src: string, name: string): [number, number][] => {
    const re = new RegExp(`public static int\\[\\] ${name} = Factory\\.CreateIntSet\\((-?\\d+)((?:,\\s*-?\\d+(?:\\s*,\\s*-?\\d+)*)?)\\)`);
    const m = src.match(re);
    expect(m, `${name} 应存在`).toBeTruthy();
    const nums = (m![2] ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
    return pairs;
  };

  it('20 张 ItemID.Sets.SortingPriority* 与 json 逐对全等（含顺序）', () => {
    for (const [name, pairs] of Object.entries(json.prio as Record<string, [number, number][]>)) {
      expect(parseIntSet(itemIdSrc, name), name).toEqual(pairs);
    }
  });

  it('BuffID.Sets.SortingPriorityFoodBuffs 与 json.buffFoodPrio 全等（Potions-Food 比较器首键 :712）', () => {
    expect(parseIntSet(buffIdSrc, 'SortingPriorityFoodBuffs')).toEqual(json.buffFoodPrio);
  });

  it('bool 集 + frameImportant 直读对拍（IsFood/IsFishingCrate/IsBasicFish/tileFrameImportant）', () => {
    const boolSet = (src: string, name: string): number[] => {
      const m = src.match(new RegExp(`public static bool\\[\\] ${name} = Factory\\.CreateBoolSet\\(([^)]*)\\)`))!;
      expect(m).toBeTruthy();
      return m![1].split(',').map((x) => x.trim()).filter((x) => x && x !== 'false' && x !== 'true').map(Number);
    };
    expect(boolSet(itemIdSrc, 'IsFood')).toEqual(json.bools.IsFood);
    expect(boolSet(itemIdSrc, 'IsFishingCrate')).toEqual(json.bools.IsFishingCrate);
    expect(boolSet(itemIdSrc, 'IsBasicFish')).toEqual(json.bools.IsBasicFish);
    const mainSrc = readFileSync(path.join(ROOT1457, 'Terraria', 'Main.cs'), 'utf8');
    const fi = [...new Set([...mainSrc.matchAll(/\btileFrameImportant\[(\d+)\] = true;/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    expect(fi).toEqual([...json.frameImportant].sort((a, b) => a - b));
    expect(json.frameImportant).toContain(4);   // 火把 tile=帧重要（Last - Tiles Important 层）
  });
});

// ================= 金标三：属性面直读 spot（Item.cs case 段） =================

describe('SW-FX29 金标：attrs 属性面反编译直读 spot', () => {
  /** case 段（限 SetDefaults1-5 方法体内——Item.cs 前部还有别的 switch(type) 之外的
   *  数字 switch,裸 indexOf 会命中错误方法体） */
  const sdRegion = (() => {
    const parts: string[] = [];
    for (let n = 1; n <= 5; n++) {
      const head = itemSrc.indexOf(`private void SetDefaults${n}(int type)`);
      if (head < 0) continue;
      const open = itemSrc.indexOf('{', head);
      let depth = 0;
      for (let i = open; i < itemSrc.length; i++) {
        if (itemSrc[i] === '{') depth++;
        else if (itemSrc[i] === '}') { depth--; if (depth === 0) { parts.push(itemSrc.slice(open, i)); break; } }
      }
    }
    return parts.join('\n');
  })();
  const caseSeg = (id: number): string => {
    const idx = sdRegion.indexOf(`case ${id}:`);
    expect(idx, `case ${id} 应存在于 SetDefaults1-5`).toBeGreaterThanOrEqual(0);
    return sdRegion.slice(idx, idx + 900);
  };
  const num = (seg: string, field: string): number | undefined => {
    const m = seg.match(new RegExp(`\\b${field} = (-?\\d+);`));
    return m ? Number(m[1]) : undefined;
  };

  it('武器伤害/稀有度（4 铁阔剑 d12 / 757 天涯舞剑 d85 r8 / 3013 臭臭爪 d60 r5 / 98 鲨鱼枪 r2 vl350000）', () => {
    expect(json.attrs['4'].d).toBe(num(caseSeg(4), 'damage'));
    expect(json.attrs['757'].d).toBe(num(caseSeg(757), 'damage'));
    expect(json.attrs['757'].r).toBe(num(caseSeg(757), 'rare'));
    expect(json.attrs['3013'].d).toBe(num(caseSeg(3013), 'damage'));
    expect(json.attrs['98'].r).toBe(2);      // Minishark rare = 2（case 98 直读）
    expect(json.attrs['98'].vl).toBe(350000);
  });

  it('弹药/工具/币（40 木箭 am40 / 1 铁镐 pk40 / 71 铜币 am71 d25 na1）', () => {
    expect(json.attrs['40'].am).toBe(40);
    expect(json.attrs['1'].pk).toBe(num(caseSeg(1), 'pick'));
    const coin = caseSeg(71);
    expect(json.attrs['71'].am).toBe(71);
    expect(json.attrs['71'].d).toBe(25);
    expect(/notAmmo = true;/.test(coin)).toBe(true);
  });

  it('英文名面（en-US Items.json × ItemID const——Last-Tiles 名字比较器真值源）', () => {
    const locRaw = readFileSync(path.join(ROOT1457, 'Terraria.Localization.Content.en-US.Items.json'), 'utf8')
      .replace(/,(\s*[}\]])/g, '$1');
    const itemName = JSON.parse(locRaw).ItemName as Record<string, string>;
    const nameOfConst = (constName: string): number => {
      const m = itemIdSrc.match(new RegExp(`public const short ${constName} = (\\d+);`))!;
      return Number(m[1]);
    };
    const dirt = nameOfConst('DirtBlock'), stone = nameOfConst('StoneBlock'), torch = nameOfConst('Torch');
    expect(json.attrs[String(dirt)].nm).toBe(itemName.DirtBlock);      // "Dirt Block"
    expect(json.attrs[String(stone)].nm).toBe(itemName.StoneBlock);    // "Stone Block"
    expect(json.attrs[String(torch)].nm).toBe(itemName.Torch);
    expect(dirt).toBe(2);
    expect(stone).toBe(3);
  });
});

// ================= 行为矩阵 =================

describe('SW-FX29 行为矩阵：52 层谓词 + 比较器', () => {
  it('多层归属+落位（武器→弹药→工具→杂项→名序方块；热栏/币/弹药/收藏不动）', () => {
    const s = emptySlots();
    // 快捷栏哨兵
    place(s, 0, 4, 1);
    // 主体乱序：27 橡子(42) / 4 剑(0) / 2 土(49) / 1 镐(8) / 8 火把(48) / 999 琥珀(43)
    place(s, 12, 27); place(s, 15, 4); place(s, 10, 2); place(s, 18, 1); place(s, 13, 8); place(s, 11, 999);
    sortPlayerInventory(s);
    // 主体槽 10-15:层序 0(剑)→8(镐)→42(橡子)→43(琥珀)→48(火把)→49(土);17 空
    expect(vids(s).slice(10, 18)).toEqual([4, 1, 27, 999, 8, 2, null, null]);
    expect(s[0]!.id).toBe(V(4));                       // 快捷栏哨兵不动
    expect(vids(s).slice(50, 58)).toEqual([null, null, null, null, null, null, null, null]);
  });

  it('层内比较器：rarity 降序（天涯 8 → 臭臭 5 → 铁阔 0）', () => {
    const s = emptySlots();
    place(s, 10, 4); place(s, 11, 757); place(s, 12, 3013);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 13)).toEqual([757, 3013, 4]);
  });

  it('Last-Tiles 名字升序（Dirt Block < Stone Block）', () => {
    const s = emptySlots();
    place(s, 10, 3); place(s, 11, 2);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([2, 3]);
  });

  it('同型并叠（土 50+50 → 100;不同型不并）', () => {
    const s = emptySlots();
    place(s, 10, 2, 50); place(s, 11, 2, 50); place(s, 12, 3, 40);
    sortPlayerInventory(s);
    const tiles = vids(s).slice(10, 13);
    expect(tiles.filter((v) => v === 2).length).toBe(1);
    const dirt = s.find((it) => it && vanillaIdOfItem(it.id) === 2)!;
    expect(dirt.stack).toBe(100);
  });

  it('收藏槽位原地保留且不被复用（:1449 !favorited + :1498 空槽不含收藏位）', () => {
    const s = emptySlots();
    place(s, 12, 4, 1, { favorited: true });   // 收藏剑
    place(s, 10, 757); place(s, 11, 3013);
    sortPlayerInventory(s);
    expect(s[12]!.favorited).toBe(true);
    expect(vanillaIdOfItem(s[12]!.id)).toBe(4);
    // 两把可排剑落 10/11;收藏位 12 保持收藏剑
    expect(vids(s).slice(10, 12)).toEqual([757, 3013]);
  });

  it('玩家倍率换序：远程 2.0 > 近战 1.0 → 鲨鱼枪(层1)先于铁阔剑(层0)（:1356-1379）', () => {
    const s = emptySlots();
    place(s, 10, 4); place(s, 11, 98);   // 98 Minishark 层1
    sortPlayerInventory(s, undefined, { melee: 1, ranged: 2, magic: 1, minion: 1 });
    expect(vids(s).slice(10, 12)).toEqual([98, 4]);
    // 平序回退:全 1 → 层 0 先
    const s2 = emptySlots();
    place(s2, 10, 4); place(s2, 11, 98);
    sortPlayerInventory(s2, undefined, { melee: 1, ranged: 1, magic: 1, minion: 1 });
    expect(vids(s2).slice(10, 12)).toEqual([4, 98]);
  });

  it('色带 hue = (层内序+0.5)/非空层数（:1523-1536）', () => {
    const s = emptySlots();
    place(s, 10, 4); place(s, 11, 2);   // 两层
    const hues: Array<[number, number, boolean]> = [];
    sortPlayerInventory(s, { onGlow: (slot, hue, chest) => hues.push([slot, hue, chest]) });
    // 弹药格 4 枚 0.31 绿带在先（:1639）;主体落位两层两带（:1523-1536）
    expect(hues.filter((h) => h[0] >= 10 && h[0] < 50).map((h) => h[1])).toEqual([0.25, 0.75]);
    expect(hues.every((h) => h[2] === false)).toBe(true);
    expect(hues.filter((h) => h[0] >= 54 && h[0] < 58).map((h) => h[1])).toEqual([0.31, 0.31, 0.31, 0.31]);
  });

  it('弹药格 SetGlow 0.31（FillAmmoFromInventory :1639）', () => {
    const s = emptySlots();
    place(s, 10, 4);
    const hues: number[] = [];
    sortPlayerInventory(s, { onGlow: (_slot, hue) => hues.push(hue) });
    for (let i = 54; i < 58; i++) expect(hues).toContain(0.31);
  });

  it('白名单外物品（place_v 自定义）尾接 :1517（层=-1 → 主物品后按槽序落位）', () => {
    const customIdx = ITEM_DEFS.findIndex((d) => d && d.key.startsWith('place_v_'));
    expect(customIdx).toBeGreaterThanOrEqual(0);
    const s = emptySlots();
    s[10] = { id: customIdx, stack: 1 };
    place(s, 11, 4);
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[10]!.id)).toBe(4);   // 原版物品先落
    expect(s[11]!.id).toBe(customIdx);            // 自定义尾接原槽
  });
});

// ================= 弹药链（ClearAmmoSlotSpaces/FillAmmoFromInventory） =================

describe('SW-FX29 弹药链', () => {
  it('空弹药格二趟填充（木箭入 54;鱼饵/涂料族不入——CanFillEmptyAmmoSlot 门 :1360-1369）', () => {
    const s = emptySlots();
    place(s, 10, 40, 50);      // 木箭 50
    place(s, 11, 1992, 5);     // 萤火虫（bait 20）——不得自动入弹药格
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[54]!.id)).toBe(40);   // 箭入空弹药格
    const bait = s.find((it) => it && vanillaIdOfItem(it.id) === 1992);
    expect(bait).toBeDefined();                    // 鱼饵仍在背包域
    expect(bait!.stack).toBe(5);
  });

  it('同型补叠：弹药格 100 箭 ← 背包 300 箭（RefillItemStack :1826;type 域无词缀门）', () => {
    const s = emptySlots();
    place(s, 54, 40, 100);
    place(s, 12, 40, 300);
    sortPlayerInventory(s);
    expect(s[54]!.stack).toBe(400);
    expect(s[12]).toBeNull();
  });

  it('弹药格上滑（TrySlidingUp :1858）', () => {
    const s = emptySlots();
    place(s, 55, 40, 10);    // 第二弹药格有箭,第一格空
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[54]!.id)).toBe(40);
    expect(s[55]).toBeNull();
  });
});

// ================= 币链（SortCoins :1715-1824） =================

describe('SW-FX29 币链', () => {
  it('进位归并：3 金 + 50 银 → 币槽 50 金 / 51 银（自高档而低 :1763-1794）', () => {
    const s = emptySlots();
    place(s, 12, 73, 3); place(s, 14, 72, 50);
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[50]!.id)).toBe(73);
    expect(s[50]!.stack).toBe(3);
    expect(vanillaIdOfItem(s[51]!.id)).toBe(72);
    expect(s[51]!.stack).toBe(50);
  });

  it('单堆不足堆位 → :1749 门 no-op;双堆 99+51 → 清币重排（铜槽 50 起）', () => {
    const s1 = emptySlots();
    place(s1, 50, 71, 150);             // 单堆 150 铜:需 2 堆位,现堆数 1 → 放弃
    sortPlayerInventory(s1);
    expect(vanillaIdOfItem(s1[50]!.id)).toBe(71);
    expect(s1[50]!.stack).toBe(150);
    const s2 = emptySlots();
    place(s2, 10, 71, 99); place(s2, 11, 71, 51);   // 现堆数 2 ≥ 需 2 → 清币重排
    sortPlayerInventory(s2);
    // CoinsSplit(150) = 银 1 + 铜 50（币值 100:1 折算,Utils.cs:1083-1097）
    expect(vanillaIdOfItem(s2[50]!.id)).toBe(72);
    expect(s2[50]!.stack).toBe(1);
    expect(vanillaIdOfItem(s2[51]!.id)).toBe(71);
    expect(s2[51]!.stack).toBe(50);
  });

  it('钱袋 905 在场 → SortCoins 跳过（:1563-1565）——主排序仍会把币归层 5 并叠', () => {
    const s = emptySlots();
    place(s, 12, 73, 3); place(s, 13, 72, 50); place(s, 40, 905);
    sortPlayerInventory(s);
    // 币槽 50-53 保持空（未走币合并重排）
    expect(vids(s).slice(50, 54)).toEqual([null, null, null, null]);
    // 币作为 Weapons - Ammo 层物品仍参与主排序（d100 金先于 d50 银）+ 钱袋层 1 首发
    expect(vids(s).slice(10, 13)).toEqual([905, 73, 72]);
  });

  it('币槽不足 → no-op（:1749 num4 < num 门）', () => {
    const s = emptySlots();
    place(s, 50, 71, 150);   // 单堆 150 铜 → 需 2 堆位,现堆数 1 → 放弃
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[50]!.id)).toBe(71);
    expect(s[50]!.stack).toBe(150);
  });
});

// ================= 容器面（SortInventory(Chest…) :1599-1624） =================

describe('SW-FX29 容器面', () => {
  it('箱内排序 + chest=true 色带（SetGlow(…, chest!= -1)）', () => {
    const chest: SortSlot[] = new Array(40).fill(null);
    chest[0] = { id: V(3), stack: 5 };    // Stone Block
    chest[1] = { id: V(8), stack: 2 };    // Torch（帧重要层 48,先于 Common 49）
    chest[2] = { id: V(2), stack: 7 };    // Dirt Block
    const glows: Array<[number, number, boolean]> = [];
    sortContainerItems(chest, { onGlow: (slot, hue, c) => glows.push([slot, hue, c]) });
    expect(vids(chest as SortSlot[]).slice(0, 3)).toEqual([8, 2, 3]);
    expect(glows.every((g) => g[2] === true)).toBe(true);
    expect(glows.length).toBe(3);
  });
});

// ================= 变异证红（判别力自证） =================

describe('SW-FX29 变异实验（判别力）', () => {
  const goldenOrder = (): (number | null)[] => {
    const s = emptySlots();
    place(s, 10, 4); place(s, 11, 757); place(s, 12, 2);
    sortPlayerInventory(s);
    return vids(s).slice(10, 13);
  };

  it('层表错位（删 4 号白名单归属）→ 输出改变（红）', () => {
    const golden = goldenOrder();
    // 构造:把 vid 4 从层 0 摘除（白名单错位语义）→ 剑落入尾接
    const data = getSortDataForTests();
    const layersMut = new Map(data.layers);
    layersMut.delete(4);
    const attrsMut = new Map(data.attrs);
    attrsMut.delete(4);
    useSortDataForTests({
      ...data, layers: layersMut, attrs: attrsMut,
      whitelists: data.whitelists.map((set, i) => (i === 0 ? (() => { const s2 = new Set(set); s2.delete(4); return s2; })() : set)),
    });
    const mutated = goldenOrder();
    expect(mutated).not.toEqual(golden);
    expect(mutated[0]).toBe(757);         // 757 仍层 0 首发
    expect(mutated[2]).toBe(4);           // 剑尾接
  });

  it('优先级值交换（SortingPriorityMaterials 3467↔3460）→ Misc - Materials 层内序反转（红）', () => {
    const base = (): (number | null)[] => {
      const s = emptySlots();
      place(s, 10, 3460); place(s, 11, 3467);
      sortPlayerInventory(s);
      return vids(s).slice(10, 12);
    };
    const golden = base();
    expect(golden).toEqual([3467, 3460]);   // prio 101 > 100 降序
    const data = getSortDataForTests();
    const prioMut: typeof data.prio = {};
    for (const [k, v] of Object.entries(data.prio)) prioMut[k] = { def: -1, map: new Map(v.map) };
    prioMut.SortingPriorityMaterials.map.set(3467, 100);
    prioMut.SortingPriorityMaterials.map.set(3460, 101);
    useSortDataForTests({ ...data, prio: prioMut });
    expect(base()).toEqual([3460, 3467]);   // 反转 → 与金标异
    expect(base()).not.toEqual(golden);
  });
});

// ================= ★SW-RB13c 红蓝复审回归（四处新盲区修复锁定） =================

describe('SW-RB13c 回归：修复⑦嵌套switch序 ⑧助手转发 ⑨false直赋 ⑩IsFood分派 + shader id', () => {
  it('修复⑧：22 件 DefaultToInfoAccessory 信息饰品 accessory=true → 层 21（曾 47）', () => {
    for (const vid of [15, 16, 17, 18, 393, 395, 707, 708, 709, 3036, 3037, 3084, 3095, 3096, 3099, 3102, 3118, 3119, 3120, 3121, 3122, 3123]) {
      expect(json.layers[String(vid)], `vid ${vid} 层`).toBe(21);
      expect(json.attrs[String(vid)].ac).toBe(1);       // DefaultToAccessory 内 accessory=true
      expect(json.attrs[String(vid)].hd).toBeUndefined(); // 非 Hair 绑定
    }
    // 行为面：铁阔剑(层0) → 铜表(层21)
    const s = emptySlots();
    place(s, 10, 15); place(s, 11, 4);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([4, 15]);
  });

  it('修复⑨：5629 Acorn Slingshot ranged=false（DefaultToRangedWeapon 的 true 被覆写）→ 层 4（曾 1）', () => {
    expect(json.layers['5629']).toBe(4);
    expect(json.attrs['5629'].rg).toBeUndefined();      // ranged=false 生效
    expect(json.attrs['5629'].d).toBe(5);
    // 4682/4702 Release Doves/Lantern 同族：ranged=false、无伤害 → 仍层 47 但 rg 不误标
    expect(json.attrs['4682'].rg).toBeUndefined();
    expect(json.attrs['4702'].rg).toBeUndefined();
    // 行为面：剑(层0) 先于 弹弓(层4)
    const s = emptySlots();
    place(s, 10, 5629); place(s, 11, 4);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([4, 5629]);
  });

  it('修复⑩：4010 Apple Pie Slice 为 IsFood 但无 SetFoodDefaults case → 基值全零 → 层 47（曾 34）', () => {
    expect(json.layers['4010']).toBe(47);
    expect(json.attrs['4010'].c).toBeUndefined();       // consumable=false（ResetStats 基值）
    expect(json.attrs['4010'].bf).toBeUndefined();
    expect(json.attrs['4010'].fo).toBe(1);              // IsFood 集成员仍在
    // 有 case 的食物不受影响：353 Ale 层 34、1912 Eggnog 层 29（healLife=80）
    expect(json.layers['353']).toBe(34);
    expect(json.layers['1912']).toBe(29);
    expect(json.attrs['1912'].hl).toBe(80);
    expect(json.attrs['1912'].bf).toBeUndefined();      // DefaultToHealingPotion 不设 buffType
  });

  it('修复⑩补：Hair Dye Remover 1990 案段 hairDye=0 标记 → 层 28 PotionsHairDyes（曾 47）', () => {
    expect(json.layers['1990']).toBe(28);
    expect(json.attrs['1990'].hd).toBe(0);              // case 段 0 标记终值（非 -1）
    for (const vid of [1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 2863, 3259]) {
      expect(json.layers[String(vid)]).toBe(28);        // 12 件染发剂仍在（Hair 绑定集）
      expect(json.attrs[String(vid)].hd).toBeGreaterThan(0);
    }
    // 行为面：染发剂(层28) 尾于武器；层内 hairDye 降序（1977 id=1 > 1990 id=0）
    const s = emptySlots();
    place(s, 10, 1990); place(s, 11, 1977);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([1977, 1990]);
  });

  it('修复⑦：DD2 哨兵杖嵌套 switch(type) 的 rare 覆写生效（3820 Flameburst Staff rare=8）', () => {
    expect(json.attrs['3819'].r).toBe(5);
    expect(json.attrs['3820'].r).toBe(8);
    expect(json.attrs['3825'].r).toBe(5);
    expect(json.attrs['3826'].r).toBe(8);
    expect(json.attrs['3830'].r).toBe(5);
    expect(json.attrs['3831'].r).toBe(8);
    expect(json.attrs['3833'].r).toBe(5);
    expect(json.attrs['3834'].r).toBe(8);
    // 伤害（itemfunc 在档键优先）不被嵌套序修复扰动
    expect(json.attrs['3819'].d).toBe(42);
    expect(json.attrs['3820'].d).toBe(88);
    // 层归属不变（summon+damage>0 → 层 3）
    expect(json.layers['3819']).toBe(3);
    // 行为面：层内 OriginalRarity 降序——T3 杆(8) 先于 T2 杖(5)
    const s = emptySlots();
    place(s, 10, 3819); place(s, 11, 3820);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([3820, 3819]);
  });

  it('SetShopValues rare 终值（ItemRarityColor 枚举）——1.4.4 宠物牌族与 5356 Used Gas Trap', () => {
    expect(json.attrs['4365'].r).toBe(5);   // Pink5
    expect(json.attrs['4425'].r).toBe(5);
    expect(json.attrs['5326'].r).toBe(3);   // Orange3
    expect(json.attrs['5466'].r).toBe(3);   // Green2（rareTable 2 为误）
    expect(json.attrs['5356'].r).toBe(-1);  // TrashMinus1 → 层 51 LastTrash 白名单
    expect(json.layers['5356']).toBe(51);
  });

  it('染料/染发剂 shader id = DyeInitializer 绑定序（比较器 dye/hairDye 键的精确值）', () => {
    expect(json.attrs['1007'].dy).toBe(1);   // 首个 Armor 绑定（Red Dye）
    expect(json.attrs['1052'].dy).toBe(8);   // 1007+44（Silver Trim 家族第 2）
    expect(json.attrs['1977'].hd).toBe(1);   // 首个 Hair 绑定（Life Hair Dye）
    expect(json.attrs['3259'].hd).toBe(12);  // Twilight Hair Dye = Hair 集末位（LoadHairDyes 尾）
    // 不变量：LastNotTrash(50) 白名单恒空
    expect(Object.values(json.layers).filter((l) => l === 50).length).toBe(0);
  });
});

// ================= ★SW-RB13c 修复⑪：switch 外顶层 if-range 分派支（39 支） =================

describe('SW-RB13c 回归：if-range 分派家族（曾整族塌进 LastMaterials）', () => {
  it('旗座 1479-1494（createTile=246 帧重要）→ 层 48', () => {
    for (const vid of [1479, 1481, 1487, 1494]) {
      expect(json.layers[String(vid)], `vid ${vid}`).toBe(48);
      expect(json.attrs[String(vid)].ct).toBe(246);
      expect(json.attrs[String(vid)].c).toBe(1);       // consumable=true
    }
    // 名字比较器真值源就位（Last - Tiles Important 层内按名排序）
    expect(json.attrs['1479'].nm).toBe("Demon's Eye");
  });

  it('头饰 2104-2113（headSlot+vanity）→ 层 20 ArmorVanity；平衡配件 3309-3314 → 层 21', () => {
    for (const vid of [2104, 2105, 2110, 2113]) {
      expect(json.layers[String(vid)]).toBe(20);
      expect(json.attrs[String(vid)].hs).toBe(vid + 146 - 2104);   // headSlot = type+146-2104 算式
      expect(json.attrs[String(vid)].v).toBe(1);
    }
    for (const vid of [3309, 3310, 3314]) {
      expect(json.layers[String(vid)]).toBe(21);
      expect(json.attrs[String(vid)].ac).toBe(1);
    }
  });

  it('染发剂 rare=2/consumable=true（分支体）+ 特例价（1980 Money Hair Dye）', () => {
    expect(json.attrs['1977'].r).toBe(2);
    expect(json.attrs['1977'].c).toBe(1);
    expect(json.attrs['1985'].r).toBe(2);
    expect(json.layers['1985']).toBe(28);
    // 层 28 内排序：rare 同 → hairDye 降序（Twilight 12 最前）
    const s = emptySlots();
    place(s, 10, 1977); place(s, 11, 3259);
    sortPlayerInventory(s);
    expect(vids(s).slice(10, 12)).toEqual([3259, 1977]);
  });

  it('蛋糕块/队伍平台 3390-3452、3638-3642 → 层 48/49（createTile 算式域）', () => {
    expect(json.layers['3390']).toBe(48);
    expect(json.attrs['3390'].ct).toBe(91);
    expect([48, 49]).toContain(json.layers['3638']);
    expect(json.attrs['3638'].ct).toBeDefined();
  });

  it('if-range 家族大规模回归：47 层计数 578→331、48 层 2242→2443（无 vid 落 50）', () => {
    const counts: Record<number, number> = {};
    for (const L of Object.values(json.layers) as number[]) counts[L] = (counts[L] ?? 0) + 1;
    expect(counts[47]).toBe(331);
    expect(counts[48]).toBe(2443);
    expect(counts[49]).toBe(560);
    expect(counts[50] ?? 0).toBe(0);
    expect(counts[51]).toBe(4);
  });
});
