// 翅膀全量对账（2026-08-13 报障："道具搜索里没看到更多的原版翅膀"）：
//   数据层 1:1（WingStats 51 槽全字段 + itemstats wing 槽 51 只——29-32 曾被误判
//   "原版死槽"，实为 Item.cs:31081 `wingSlot = (sbyte)(29 + type - 3468)` 算式
//   缺口，2026-08-19 表达式槽位提取补齐）
//   目录层：51 只 vi_ 全注册（此前仅 5 只开发者翅膀）；图标 vi_ key 自动解析
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS } from '../src/data/items';
import { viIdFromKey } from '../src/data/vanillaItemCombat';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import { wingStatOf } from '../src/data/vanillaWingStats';
import vanillaStatsJson from '../src/data/vanilla-itemstats.json';

const STATS = vanillaStatsJson as Record<string, { wing?: number }>;
const WING_VIDS = Object.entries(STATS).filter(([, v]) => v.wing).map(([k]) => +k);

describe('原版翅膀全量', () => {
  it('51 只翅膀全部注册入目录（vi_ key 可搜索/可装备）', () => {
    const keys = new Set(ITEM_DEFS.map((d) => d.key));
    const missing = WING_VIDS.filter((v) => ![...keys].some((k) => viIdFromKey(k) === v));
    expect(missing).toEqual([]);
    expect(WING_VIDS.length).toBe(51);
  });

  it('槽位→属性表抽检：天使 492(槽1)=100t / 猪鲨 2609 / 星旋悬浮 4754 悬浮族', () => {
    expect(vanillaStatOfVid(492)?.wing).toBe(1);
    expect(wingStatOf(1)).toMatchObject({ time: 100, accSpeed: 6.25 });
    // 悬浮族持有者：1866 滑板(槽22)/3883 日耀悬浮板(37)/4954 星旋悬浮(45)/
    // 3469 星旋强化翼(30)/3470 星云斗篷(31)——4754(43 槽)为默认档非悬浮
    const hover = wingStatOf(vanillaStatOfVid(4954)?.wing ?? 0);
    expect(hover.hover).toBe(true);
    expect(hover.hoverSpeed).toBe(16);
    // 幼翅最短
    const fledgling = wingStatOf(vanillaStatOfVid(4978)?.wing ?? 0);
    expect(fledgling.time).toBe(25);
  });

  it('29-32 槽持有物品（月总前四翅膀 3468-3471——Item.cs:31081 算式族）', () => {
    const slots = new Set(WING_VIDS.map((v) => vanillaStatOfVid(v)?.wing ?? 0));
    for (const s of [29, 30, 31, 32]) expect(slots.has(s)).toBe(true);
  });
});

