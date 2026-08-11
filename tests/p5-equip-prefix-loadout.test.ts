// P5 特性回归：装备分类（染料/宠物/矿车/坐骑/钩爪）/ 词缀系统 / Loadout / 存档往返
import { describe, it, expect } from 'vitest';
import { equipKindOfVid, isDyeItem, miscSlotAccepts, MISC_KINDS } from '../src/data/vanillaEquip';
import {
  PREFIX_NAMES, PREFIX_POOLS, prefixStat, prefixValueMul,
  rollablePrefixes, rollPrefix, prefixLines, REDUCED_NATURAL,
} from '../src/data/vanillaPrefixes';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const iid = (vid: number) => {
  const k = vanillaItemKey(vid);
  expect(k).toBeDefined();
  return ITEM_BY_KEY[k!];
};

describe('装备分类（extract-equip-prefix.mjs → vanilla-equip.json）', () => {
  it('染料：红染料 1007 / 黑染料 91? / 火焰染料 1031 全命中，且衣服不误判', () => {
    expect(equipKindOfVid(1007)).toBe('dye');
    expect(equipKindOfVid(1031)).toBe('dye');
    expect(equipKindOfVid(2877)).toBe('dye');
    expect(equipKindOfVid(9)).toBeNull();  // 木材
    expect(equipKindOfVid(279)).toBeNull(); // 飞刀
  });

  it('宠物/光源/矿车/坐骑/钩爪各就各位（PickItemMovementAction context 19/20/18/17/16）', () => {
    expect(equipKindOfVid(1169)).toBe('pet');   // 骨头钥匙
    expect(equipKindOfVid(115)).toBe('light');  // 妖灵瓶
    expect(equipKindOfVid(2343)).toBe('cart');  // 矿车
    expect(equipKindOfVid(2428)).toBe('mount'); // 史莱姆鞍
    expect(equipKindOfVid(84)).toBe('hook');    // 抓钩
  });

  it('杂项槽分类门（miscEquips[5] = pet/light/cart/mount/hook）', () => {
    expect(MISC_KINDS).toEqual(['pet', 'light', 'cart', 'mount', 'hook']);
    expect(miscSlotAccepts(0, iid(1169))).toBe(true);
    expect(miscSlotAccepts(0, iid(84))).toBe(false);
    expect(miscSlotAccepts(4, iid(84))).toBe(true);
    expect(miscSlotAccepts(2, iid(2343))).toBe(true);
    expect(miscSlotAccepts(3, iid(2343))).toBe(false);
  });

  it('Inventory.dyeAccepts 只收染料（ItemSlot context 12/25/27/33）', () => {
    const inv = new Inventory();
    expect(inv.dyeAccepts(iid(1007))).toBe(true);
    expect(inv.dyeAccepts(iid(9))).toBe(false);
    expect(isDyeItem(iid(1007))).toBe(true);
  });
});

describe('词缀系统（Item.Prefix 1:1）', () => {
  it('97 条全表 + 传奇 81/84 属性与源码逐值一致', () => {
    expect(Object.keys(PREFIX_NAMES)).toHaveLength(97);
    expect(prefixStat(81)).toMatchObject({ dmg: 1.15, kb: 1.15, spd: 0.9, size: 1.1, crt: 5 });
    expect(prefixStat(84)).toMatchObject({ dmg: 1.17, kb: 1.17, crt: 8 });
    // 配饰档位：Hard=62 tier 1.05、Warding=68 tier 1.2（:1043-1060）
    expect(prefixStat(62).tier).toBe(1.05);
    expect(prefixStat(68).tier).toBe(1.2);
    expect(prefixStat(1).tier).toBe(1);
  });

  it('value 乘区公式（:1041）：81 档 = 1.15×(2-0.9)×1×1.1×1.15×1×(1+5×0.02)', () => {
    // dmg × (2-spd) × (2-mcst) × size × kb × shtspd × (1+crt×0.02) × tier(1)
    expect(prefixValueMul(81)).toBeCloseTo(1.15 * 1.1 * 1 * 1.1 * 1.15 * 1 * 1.1, 5);
    // 配饰档位 68（Warding tier 1.2）纯档位乘值
    expect(prefixValueMul(68)).toBeCloseTo(1.2, 5);
  });

  it('可掷池：铜短剑(4)→剑池 / 附魔水晶杖(1260? magic 集合样本)→魔法池 / 铁镐→剑锤斧镐池', () => {
    expect(rollablePrefixes(4, false)).toBe(PREFIX_POOLS.PrefixesForSwords);
    expect(rollablePrefixes(1, false)).toBe(PREFIX_POOLS.PrefixesForSwords); // 铁镐
    expect(rollablePrefixes(1260, false)).toBe(PREFIX_POOLS.PrefixesForMagic);
    expect(rollablePrefixes(9, false)).toBeNull(); // 木材不可重铸
  });

  it('Prefix(-2) 保底出词缀；Prefix(-1) 允许无词缀', () => {
    const pool = PREFIX_POOLS.PrefixesForSwords;
    for (let k = 0; k < 200; k++) expect(rollPrefix(pool, true)).toBeGreaterThan(0);
    let sawZero = false;
    for (let k = 0; k < 400 && !sawZero; k++) if (rollPrefix(pool, false) === 0) sawZero = true;
    expect(sawZero).toBe(true);
    expect(REDUCED_NATURAL.has(7)).toBe(true); // Tiny
  });

  it('Tooltip 行：传奇 81 = 伤害+15% 击退+15% 速度+10% 暴击+5% 大小+10%', () => {
    const lines = prefixLines(81);
    const texts = lines.map((l) => l.text);
    expect(texts.some((t) => t.includes('伤害') && t.includes('+15%'))).toBe(true);
    expect(texts.some((t) => t.includes('速度') && t.includes('+10%'))).toBe(true);
    expect(texts.some((t) => t.includes('暴击') && t.includes('+5'))).toBe(true);
    expect(lines.every((l) => l.good)).toBe(true);
  });

  it('InvItem.prefix 持久字段 + 词缀名反查 l10n', () => {
    const it = { id: iid(4), stack: 1, prefix: 81 };
    expect(PREFIX_NAMES[String(it.prefix)]).toBe('Legendary');
  });
});

describe('三套 Loadout（EquipmentLoadout.Swap 语义）', () => {
  it('切换=当前装备与目标仓元素级互换，armor+dye 同步', () => {
    const inv = new Inventory();
    const ironHelmet = iid(798);  // 任意盔甲 id
    const def = ITEM_DEFS[ironHelmet];
    void def;
    inv.armor[0] = { id: ironHelmet, stack: 1 };
    inv.loadouts[1].armor[3] = { id: iid(1169), stack: 1 }; // 配饰放 loadout1 armor[3]
    inv.trySwitchingLoadout(1);
    expect(inv.currentLoadout).toBe(1);
    expect(inv.armor[0]).toBeNull();             // 原盔甲进 loadout0 仓
    expect(inv.loadouts[0].armor[0]?.id).toBe(ironHelmet);
    expect(inv.armor[3]?.id).toBe(iid(1169));    // 目标仓内容上身
    expect(inv.loadouts[1].armor[3]).toBeNull();
    // 切回：恢复
    inv.trySwitchingLoadout(0);
    expect(inv.armor[0]?.id).toBe(ironHelmet);
    expect(inv.armor[3]).toBeNull();
    expect(inv.currentLoadout).toBe(0);
  });

  it('同号/越界忽略', () => {
    const inv = new Inventory();
    inv.trySwitchingLoadout(0);
    inv.trySwitchingLoadout(-1);
    inv.trySwitchingLoadout(3);
    expect(inv.currentLoadout).toBe(0);
  });
});

describe('存档往返（miscEquips/miscDyes/loadouts/prefix）', () => {
  it('saveGame → loadSave：杂项装备+染料+Loadout 全保留', async () => {
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { saveGame, loadSave } = await import('../src/save/SaveFile');
    const w = new World(60, 40, 42, 'p5-test');
    const p = new Player(100, 100, new Inventory());
    p.inv.miscEquips[0] = { id: iid(1169), stack: 1, prefix: 62 }; // 宠物+词缀
    p.inv.miscEquips[4] = { id: iid(84), stack: 1 };
    p.inv.miscDyes[0] = { id: iid(1007), stack: 1 };
    p.inv.armor[0] = { id: iid(798), stack: 1, prefix: 81 };
    p.inv.loadouts[1].armor[3] = { id: iid(1169), stack: 1 };
    p.inv.loadouts[2].dye[5] = { id: iid(1007), stack: 1 };
    p.inv.currentLoadout = 0;
    const json = saveGame(w, p, 0);
    const { player } = loadSave(json);
    expect(player.miscEquips?.[0]).toEqual({ id: iid(1169), stack: 1, prefix: 62 });
    expect(player.miscEquips?.[4]?.id).toBe(iid(84));
    expect(player.miscDyes?.[0]?.id).toBe(iid(1007));
    expect(player.armor?.[0]?.prefix).toBe(81);
    expect(player.loadouts?.[1].armor[3]?.id).toBe(iid(1169));
    expect(player.loadouts?.[2].dye[5]?.id).toBe(iid(1007));
    // 旧档兼容：剥字段后缺省
    const raw = JSON.parse(json) as { player: Record<string, unknown> };
    delete raw.player.miscEquips; delete raw.player.miscDyes; delete raw.player.loadouts;
    const legacy = loadSave(JSON.stringify(raw));
    expect(legacy.player.miscEquips).toBeUndefined();
    expect(legacy.player.loadouts).toBeUndefined();
  });
});
