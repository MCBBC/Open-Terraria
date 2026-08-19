// 线饰品（string accessory）系统测试：
//   ① 物品数据 str 字段（Item.cs:30191-30229 十六件 + 5547 + 5540/5541 Player 侧 29）
//   ② Player.stringColor 装备链（UpdateVisibleAccessory :36441-36449）
//   ③ tryApplyingPlayerStringColor 纯函数（Main.cs:34912-34965 逐行 1:1）
//   ④ 合成配方（白线=蛛网×30@织布机 / 彩线=白线+染料@染料缸 / 5541@工匠作坊）
import { describe, it, expect } from 'vitest';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey, VANILLA_RECIPES } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { tryApplyingPlayerStringColor, type StringColorOpts } from '../src/render/StringLine';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

describe('线饰品物品数据（Item.cs:30191-30229 / :43684-43692）', () => {
  it('3293-3304 = 1+type-3293（油漆色 1-12）；3305=28 棕 / 3306=14 白 / 3307=27 彩虹 / 3308=13 黑', () => {
    for (let i = 0; i < 12; i++) {
      expect(statOfInternal(_iid(3293 + i))).toMatchObject({ acc: 1, str: 1 + i });
    }
    expect(statOfInternal(_iid(3305))).toMatchObject({ acc: 1, str: 28 });
    expect(statOfInternal(_iid(3306))).toMatchObject({ acc: 1, str: 14 });
    expect(statOfInternal(_iid(3307))).toMatchObject({ acc: 1, str: 27 });
    expect(statOfInternal(_iid(3308))).toMatchObject({ acc: 1, str: 13 });
  });

  it('5547 Strung Counterweight = 30；5540/5541 无 str（Player 侧直置 29）', () => {
    expect(statOfInternal(_iid(5547))).toMatchObject({ acc: 1, str: 30 });
    expect(statOfInternal(_iid(5540))).toMatchObject({ acc: 1 });
    expect(statOfInternal(_iid(5540))?.str).toBeUndefined();
    expect(statOfInternal(_iid(5541))).toMatchObject({ acc: 1 });
    expect(statOfInternal(_iid(5541))?.str).toBeUndefined();
  });

  it('十八件全量注册且可入功能配饰槽（armorAccepts acc=1 门）', () => {
    const inv = new Inventory();
    const vids = [...Array.from({ length: 12 }, (_, i) => 3293 + i), 3305, 3306, 3307, 3308, 5540, 5541, 5547];
    for (const vid of vids) {
      const id = _iid(vid);
      expect(id).toBeGreaterThan(0);
      expect(inv.armorAccepts(3, id)).toBe(true);
    }
  });
});

describe('Player.stringColor 装备链（Player.cs:36441-36449 UpdateVisibleAccessory）', () => {
  const mkPlayer = () => new Player(0, 0, new Inventory());

  it('无装备 → 0；装备线饰品 → 其 str 且 yoyoString=true（:14170）', () => {
    const p = mkPlayer();
    expect(p.equipStats.stringColor).toBe(0);
    expect(p.equipStats.yoyoString).toBe(false);
    p.inv.armor[3] = { id: _iid(3293), stack: 1 };   // 红线 str=1
    expect(p.equipStats.stringColor).toBe(1);
    expect(p.equipStats.yoyoString).toBe(true);
    p.inv.armor[4] = { id: _iid(3306), stack: 1 };   // 白线 str=14（后槽覆盖前槽）
    expect(p.equipStats.stringColor).toBe(14);
    p.inv.armor[3] = null;
    p.inv.armor[4] = null;
    expect(p.equipStats.stringColor).toBe(0);
    expect(p.equipStats.yoyoString).toBe(false);
  });

  it('5540/5541 → 29（魔法线鼠标文字色闪烁）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: _iid(5540), stack: 1 };
    expect(p.equipStats.stringColor).toBe(29);
    p.inv.armor[3] = { id: _iid(5541), stack: 1 };
    expect(p.equipStats.stringColor).toBe(29);
  });

  it('时装配饰槽 13-19 同样染线（:36361-36372 社交槽第二轮，无 hideVisual 门）', () => {
    const p = mkPlayer();
    p.inv.armor[13] = { id: _iid(3294), stack: 1 };   // 橙线 str=2（社交槽）
    expect(p.equipStats.stringColor).toBe(2);
    // yoyoString 只走功能槽（ApplyEquipFunctional :14170），社交槽不置位
    expect(p.equipStats.yoyoString).toBe(false);
  });
});

describe('tryApplyingPlayerStringColor（Main.cs:34912-34965）', () => {
  const OPTS: StringColorOpts = { disco: [12, 34, 56], mouseTextColor: 255, rand: () => 0 };

  it('playerStringColor=0 → 原色透传（:34914 门）', () => {
    expect(tryApplyingPlayerStringColor(0, [200, 200, 200, 100], OPTS))
      .toEqual([200, 200, 200, 100]);
    expect(tryApplyingPlayerStringColor(-1, [250, 90, 70, 100], OPTS))
      .toEqual([250, 90, 70, 100]);
  });

  it('色 1 红漆：paintColor (255,0,0) + RGB 下限 75 + A×0.4', () => {
    // (255,0,0) → G/B 抬到 75 → (255,75,75)；A=255×0.4=102（输入 alpha 被丢弃）
    expect(tryApplyingPlayerStringColor(1, [200, 200, 200, 100], OPTS))
      .toEqual([255, 75, 75, 102]);
  });

  it('深色油漆 RGB 下限 75：深蓝 21 (0,0,255)→(75,75,255)；黑漆 25 (75,75,75)', () => {
    expect(tryApplyingPlayerStringColor(21, [200, 200, 200, 100], OPTS))
      .toEqual([75, 75, 255, 102]);
    expect(tryApplyingPlayerStringColor(25, [200, 200, 200, 100], OPTS))
      .toEqual([75, 75, 75, 102]);
  });

  it('特例覆写：13=(20,20,20) / 14=(200,200,200) / 27=Disco / 28=(163,116,91) / 30=(226,228,142)，A 全 102', () => {
    expect(tryApplyingPlayerStringColor(13, [1, 2, 3, 100], OPTS)).toEqual([20, 20, 20, 102]);
    expect(tryApplyingPlayerStringColor(14, [1, 2, 3, 100], OPTS)).toEqual([200, 200, 200, 102]);
    expect(tryApplyingPlayerStringColor(27, [1, 2, 3, 100], OPTS)).toEqual([12, 34, 56, 102]);
    expect(tryApplyingPlayerStringColor(28, [1, 2, 3, 100], OPTS)).toEqual([163, 116, 91, 102]);
    expect(tryApplyingPlayerStringColor(30, [1, 2, 3, 100], OPTS)).toEqual([226, 228, 142, 102]);
  });

  it('29 魔法线：鼠标文字色闪烁 + 随机抖动，A=0（预乘 = 纯加色）', () => {
    // rand()=0 → num=(255-190)/65=1 再 -0.5 → 0.5：b/b2/b3=(219,150,185)，三抖动各 -40
    expect(tryApplyingPlayerStringColor(29, [200, 200, 200, 100], OPTS))
      .toEqual([179, 110, 145, 0]);
    // rand()=0.999 → num 钳 1：b3=255，抖动 +40 → 295 (byte) 回绕 = 39
    expect(tryApplyingPlayerStringColor(29, [200, 200, 200, 100],
      { ...OPTS, rand: () => 0.999 })).toEqual([224, 156, 39, 0]);
    // mouseTextColor=190 → num 起点钳 0：(255,184,116) − 40 抖动
    expect(tryApplyingPlayerStringColor(29, [200, 200, 200, 100],
      { ...OPTS, mouseTextColor: 190 })).toEqual([215, 144, 76, 0]);
  });
});

describe('线饰品合成配方（Recipe.cs 提取表）', () => {
  it('白线 3306 = 蛛网×30 @ 织布机(86)；彩线 = 白线+对应染料 @ 染料缸(228)', () => {
    const r = VANILLA_RECIPES.filter((x) => x.create === 3306);
    expect(r).toHaveLength(1);
    expect(r[0].tile).toBe(86);
    expect(r[0].items).toEqual([{ id: 150, stack: 30 }]);
    const red = VANILLA_RECIPES.filter((x) => x.create === 3293);
    expect(red).toHaveLength(1);
    expect(red[0].tile).toBe(228);
    expect(red[0].items).toEqual([{ id: 3306, stack: 1 }, { id: 1007, stack: 1 }]);
    // 彩虹线 3307 = 白线 + 彩虹染料 1066；黑线 3308 = 白线 + 黑染料 1050
    expect(VANILLA_RECIPES.filter((x) => x.create === 3307)[0].items)
      .toEqual([{ id: 3306, stack: 1 }, { id: 1066, stack: 1 }]);
    expect(VANILLA_RECIPES.filter((x) => x.create === 3308)[0].items)
      .toEqual([{ id: 3306, stack: 1 }, { id: 1050, stack: 1 }]);
  });

  it('5541 魔法悠悠球袋 = 魔法线 5540 + 悠悠球袋 3366 @ 工匠作坊(114)；5540 无配方（原版如此）', () => {
    const r = VANILLA_RECIPES.filter((x) => x.create === 5541);
    expect(r).toHaveLength(1);
    expect(r[0].tile).toBe(114);
    expect(r[0].items).toEqual([{ id: 5540, stack: 1 }, { id: 3366, stack: 1 }]);
    expect(VANILLA_RECIPES.filter((x) => x.create === 5540)).toHaveLength(0);
  });
});
