// FlexibleTileWand 族（FlexibleTileWand.cs 全表 1:1）：
// ① 物品映射 30 件（Item.cs:49103 switch）
// ② 表提取正确性：五方法桶数/关键条目抽验（4144→706、3→650、5667→751[0] 等）
// ③ 选样式：背包首个命中弹药桶 + cycleOffset 模容量（负偏移同余，GetOptionWithCycling）
// ④ 单件族：弹药=本体恒命中（无背包门）
import { describe, it, expect } from 'vitest';
import { flexibleWandOf, tryGetPlacementOption } from '../src/world/FlexibleTileWands';
import tables from '../src/data/flexible-wands.json';

const T = tables as Record<string, Array<[number, number, number[]]>>;

describe('FlexibleTileWand 物品映射（Item.cs:49103）', () => {
  it('30 件全命中 + 非魔杖恒 null', () => {
    const wands = [5324, 5329, 5330, 5464, 5481, 4460, 4609, 4420, 275, 2625, 2626,
      4072, 4073, 4071, 1813, 1417, 1869, 3749, 149, 5472, 580,
      181, 180, 177, 179, 178, 182, 999];
    for (const v of wands) expect(flexibleWandOf(v), `vid ${v}`).not.toBeNull();
    expect(flexibleWandOf(1)).toBeNull();
    expect(flexibleWandOf(0)).toBeNull();
  });

  it('碎块三件耗弹药 + 单件装饰族不耗（WithoutAmmoConsumption）', () => {
    expect(flexibleWandOf(5324)!.consumesAmmo).toBe(true);
    expect(flexibleWandOf(5330)!.consumesAmmo).toBe(true);
    expect(flexibleWandOf(5464)!.consumesAmmo).toBe(true);
    expect(flexibleWandOf(4609)!.consumesAmmo).toBe(false);   // 花园侏儒
    expect(flexibleWandOf(149)!.consumesAmmo).toBe(false);    // 书
    expect(flexibleWandOf(5324)!.showsAmmoIcon).toBe(true);
    expect(flexibleWandOf(149)!.showsAmmoIcon).toBe(false);
  });
});

describe('表提取正确性（vs FlexibleTileWand.cs 逐条）', () => {
  it('五方法桶/选项规模（桶按弹药合并）', () => {
    expect(T.small.length).toBe(19);
    expect(T.medium.length).toBe(24);
    expect(T.large.length).toBe(24);
    expect(T.mitey.length).toBe(13);
    expect(T.kiln.length).toBe(12);
    expect(T.small.reduce((n, b) => n + b[1].length, 0)).toBe(89);
    expect(T.large.reduce((n, b) => n + b[1].length, 0)).toBe(137);
  });

  it('关键条目抽验（变量/字面 tile + default(int) + ByRow + 跨 tile 合桶）', () => {
    const find = (t: string, ammo: number) => T[t].find((b) => b[0] === ammo);
    expect(find('small', 3)?.[1].slice(0, 6)).toEqual([[650, 0], [650, 1], [650, 2], [650, 3], [650, 4], [650, 5]]);
    expect(find('small', 5114)?.[1]).toEqual([[700, 0]]);                 // 字面单条
    expect(find('small', 5333)?.[1]).toEqual([[701, 0]]);
    expect(find('medium', 5667)?.[1]).toEqual([[751, 0]]);                // default(int)
    expect(find('large', 4144)?.[1]).toEqual([[706, 0]]);
    expect(find('medium', 1291)?.[1]).toEqual([[702, 0], [702, 1], [702, 2]]);  // :269 属 Medium 方法
    expect(find('small', 169)?.[1].map((o) => o[1])).toEqual([73, 74, 76, 78, 79, 80, 81]); // 跳号样式
    expect(find('kiln', 133)?.[1].map((o) => o[1])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // ByRow 4 行摊平
    expect(find('large', 154)?.[1]).toEqual([[647, 0], [647, 1], [647, 2], [647, 3], [647, 4], [647, 5], [647, 6], [648, 52], [648, 53], [648, 54]]); // 同弹药跨 tile
  });
});

describe('选样式（TryGetPlacementOption :176-197 + GetOptionWithCycling :25-31）', () => {
  it('背包首个命中弹药桶生效（槽序优先）', () => {
    const wand = flexibleWandOf(5329)!;   // medium：3→649 styles[0..5]
    const inv = [
      { vid: 154, favorited: false },     // 槽 0：非该桶（medium 154→648 在后? 查表序）
      { vid: 3, favorited: false },
    ];
    const opt = tryGetPlacementOption(wand, inv, 0)!;
    // 槽 0 的 154 是 medium 桶成员（首选项 tile 649 style 6）——首个命中即它
    expect(opt.ammoVid).toBe(154);
    expect(opt.tileSheet).toBe(649);
    expect(opt.style).toBe(6);
    const opt2 = tryGetPlacementOption(wand, [{ vid: 3, favorited: false }, { vid: 154, favorited: false }], 0)!;
    expect(opt2.ammoVid).toBe(3);        // 3 在前 → 3 桶优先
    expect(opt2.tileSheet).toBe(649);
    expect(opt2.style).toBe(0);
  });

  it('cycleOffset 模容量 + 负偏移同余', () => {
    const wand = flexibleWandOf(5329)!;
    const inv = [{ vid: 3, favorited: false }];
    const styles = T.medium.find((b) => b[0] === 3)![1].map((o) => o[1]);   // 合桶后 9 样式
    const n = styles.length;
    for (let c = 0; c < n; c++) {
      expect(tryGetPlacementOption(wand, inv, c)!.style).toBe(styles[c]);
    }
    expect(tryGetPlacementOption(wand, inv, -1)!.style).toBe(styles[n - 1]);   // ((-1%n)+n)%n
    expect(tryGetPlacementOption(wand, inv, n)!.style).toBe(styles[0]);        // 绕回
  });

  it('背包无弹药 → null（canUse false 语义）', () => {
    const wand = flexibleWandOf(5324)!;
    expect(tryGetPlacementOption(wand, [{ vid: 1, favorited: false }], 0)).toBeNull();
    expect(tryGetPlacementOption(wand, [], 0)).toBeNull();
  });

  it('单件族：弹药=本体恒命中（CreateSingleTileWand 无背包门）', () => {
    const gnome = flexibleWandOf(4609)!;
    const opt = tryGetPlacementOption(gnome, [], 3)!;
    expect(opt.tileSheet).toBe(567);
    expect(opt.style).toBe(3);                          // 五样式循环
    expect(opt.ammoVid).toBe(-1);                       // 不消耗
  });

  it('暴露宝石族 ExposedGem：tile 178 三段样式 s/s+7/s+14', () => {
    const ruby = flexibleWandOf(178)!;   // s=4
    const styles: number[] = [];
    for (let c = 0; c < 3; c++) styles.push(tryGetPlacementOption(ruby, [], c)!.style);
    expect(styles).toEqual([4, 11, 18]);
  });
});
