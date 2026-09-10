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

  it('SetupSortingPriorities 运行时序 = 前四伤害层（平序 Melee/Ranged/Magic/Minions）+ 其余 48 层同固定序', () => {
    expect(priOrder.length).toBe(52);
    const wlBodyEnd = sortSrc.indexOf('for (int i = -48');
    void wlBodyEnd;
    // 前四层 = AddSortingPrioritiesBasedOnPlayerDamage 的四系（:1360-1363 加入序）
    expect(priOrder.slice(0, 4)).toEqual(['WeaponsMelee', 'WeaponsRanged', 'WeaponsMagic', 'WeaponsMinions']);
    // 后 48 层与白名单序逐位一致（白名单序前四也按 Melee→Ranged→Magic→Minions 排布）
    expect(priOrder.slice(4)).toEqual(wlOrder.slice(4));
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
    const fi = [...mainSrc.matchAll(/\btileFrameImportant\[(\d+)\] = true;/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    expect(fi).toEqual([...json.frameImportant].sort((a, b) => a - b));
    expect(json.frameImportant).toContain(4);   // 火把 tile=帧重要（Last - Tiles Important 层）
  });
});

// ================= 金标三：属性面直读 spot（Item.cs case 段） =================

describe('SW-FX29 金标：attrs 属性面反编译直读 spot', () => {
  /** case 段（含 fall-through 共享体）首段文本 */
  const caseSeg = (id: number): string => {
    const idx = itemSrc.indexOf(`case ${id}:`);
    expect(idx, `case ${id} 应存在`).toBeGreaterThanOrEqual(0);
    return itemSrc.slice(idx, idx + 900);
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
    expect(hues.map((h) => h[1])).toEqual([0.25, 0.75]);
    expect(hues.every((h) => h[2] === false)).toBe(true);
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

  it('99 进位与铂金 9999 封顶（:1726-1737）', () => {
    const s = emptySlots();
    place(s, 10, 71, 150);              // 1 金 51 铜? → 1银51铜? 150铜=1银50铜
    sortPlayerInventory(s);
    // 150 铜 = 1 银 + 50 铜 → 两堆:银 1 + 铜 50
    const found = [vanillaIdOfItem(s[50]!.id), vanillaIdOfItem(s[51]!.id)].sort();
    expect(found).toEqual([71, 72]);
    const stacks = [s[50]!.stack, s[51]!.stack].sort((a, b) => a - b);
    expect(stacks).toEqual([1, 50]);
  });

  it('钱袋 905 在场 → 整个币整理跳过（:1563-1565 HasItem 门）', () => {
    const s = emptySlots();
    place(s, 12, 73, 3); place(s, 13, 72, 50); place(s, 40, 905);
    sortPlayerInventory(s);
    expect(vanillaIdOfItem(s[12]!.id)).toBe(73);
    expect(vanillaIdOfItem(s[13]!.id)).toBe(72);
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
    const d = JSON.parse(JSON.stringify({
      layers: Object.fromEntries(getSortDataForTests().layers),
      prio: getSortDataForTests().prio, buffFoodPrio: [...getSortDataForTests().buffFood.map],
      bools: { IsFood: [...getSortDataForTests().isFood], IsFishingCrate: [...getSortDataForTests().isCrate], IsBasicFish: [...getSortDataForTests().isBasicFish] },
      frameImportant: [...getSortDataForTests().frameImportant],
      attrs: Object.fromEntries(getSortDataForTests().attrs),
      meta: { itemCount: 6196 },
    }));
    void d;
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
    const prioMut = JSON.parse(JSON.stringify(data.prio));
    const set = prioMut.SortingPriorityMaterials as [number, number][];
    set.find((p) => p[0] === 3467)![1] = 100;
    set.find((p) => p[0] === 3460)![1] = 101;
    useSortDataForTests({ ...data, prio: prioMut });
    expect(base()).toEqual([3460, 3467]);   // 反转 → 与金标异
    expect(base()).not.toEqual(golden);
  });
});
