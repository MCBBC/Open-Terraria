// ★S4 清偿刀（Q4 登记 ×2 + 向导槽 + BJ417 登记残件）：tooltip 残差 + 队伍格调光。
// 判别面四件（定谳锚全 1457 反编译亲读）：
//   ① BySearch 检索域静态说明行——ItemFilters.BySearch.FitsFilter（ItemFilters.cs:28-48）
//      直调全量 Main.MouseText_DrawItemTooltip_GetLinesInfo → item.ToolTip 段
//      （Main.cs:21149-21162）在语料内 = 搜说明文案命中。vinvFillTooltipLines 语料补
//      静态行 + 行序后段（duration/expert/master/setbonus/任务鱼）。
//   ② Plantera 诅咒首行特例——Main.cs:21149-21162：ToolTip 行循环内
//      `i==0 && ItemID.Sets.UsesCursedByPlanteraTooltip[type] && !NPC.downedPlantBoss`
//      → 首行【替换】Lang.tip[59]（行 1+ 保留；ToolTip==null 零行=零替换=不新增行）。
//      置位面 ItemID.cs:155 = 1533-1537（丛林/腐化/猩红/神圣/冰雪钥匙）+ 4714
//      （地牢沙漠钥匙）。downedPlantBoss ← world.flags downed_262（Game.ts:29270 同参）。
//   ③ 向导槽悬停 tooltip——Main.cs:42409-42413 槽域悬停 → ItemSlot.Handle(ref
//      guideItem, 7) → ItemSlot.MouseHover（ItemSlot.cs:3164-3190,context 7 无特化旗）
//      → MouseText 全载荷。三面槽实例（classic 覆层/vinv 经典位/vinv modern 窗位）。
//   ④ 队伍格基帧冷却调光——Main.cs:43506 `White * num4`（num4=teamCooldown==0?1:0.25
//      :43399）——BJ417 只落了剑钮基帧（:43425 同式,refreshPvpButtons opacity 面）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildTooltipBody,
  planteraCursedTip,
  USES_CURSED_BY_PLANTERA_VIDS,
} from '../src/ui/itemTooltip';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { filterItemOfVid } from '../src/ui/modernCrafting';
import { UI, vinvFillTooltipLines, PVP_TEAM_BUTTONS } from '../src/ui/UI';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

const ROOT = resolve(__dirname, '..');
languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));

// node 环境无 rAF 族（向导槽空槽收泡支消费 cancelAnimationFrame）
(globalThis as Record<string, unknown>).cancelAnimationFrame ??= () => {};

const L = (key: string): string => {
  const t = Lang.text(key);
  expect(t, `l10n 键 ${key} 应在包内`).toBeTruthy();
  expect(t).not.toBe(key);
  return t as string;
};

const defOfVid = (vid: number) => {
  const key = ITEM_DEFS.find((d) => d && (d.vid ?? -1) === vid)?.key;
  expect(key, `vid ${vid} 缺 def`).toBeTruthy();
  return ITEM_DEFS[ITEM_BY_KEY[key!]];
};

// ---------------------------------------------------------------------------
// ② Plantera 诅咒首行特例（itemTooltip.planteraCursedTip 单元面）
// ---------------------------------------------------------------------------
describe('S4② Plantera 诅咒首行特例（Main.cs:21149-21162 + ItemID.cs:155）', () => {
  it('置位面 = {1533-1537,4714} 逐值（Terraria.ID/ItemID.cs:155 CreateBoolSet 表）', () => {
    expect([...USES_CURSED_BY_PLANTERA_VIDS].sort((a, b) => a - b))
      .toEqual([1533, 1534, 1535, 1536, 1537, 4714]);
  });

  it('未杀世纪之花：钥匙首行替换为 tip[59]（「它已被一个强大的丛林生物诅咒」）', () => {
    const tip = L('ItemTooltip.JungleKey');   // 「打开地牢中的丛林箱」
    expect(tip).not.toContain('诅咒');
    expect(planteraCursedTip(1533, tip, false)).toBe(L('LegacyTooltip.59'));
  });

  it('已杀世纪之花（downed_262）：原文透传（:21153 !downedPlantBoss 门翻转）', () => {
    const tip = L('ItemTooltip.FrozenKey');
    expect(planteraCursedTip(1537, tip, true)).toBe(tip);
  });

  it('非置位 vid 原样透传（即使 Plantera 在场）', () => {
    const tip = L('ItemTooltip.SharkToothNecklace');
    expect(planteraCursedTip(3212, tip, false)).toBe(tip);
  });

  it('行循环内特例 = 只改写已存在首行、行 1+ 保留、不新增行（ToolTip==null → null）', () => {
    expect(planteraCursedTip(4714, null, false)).toBeNull();
    const multi = L('ItemTooltip.JungleKey');
    expect(planteraCursedTip(4714, `额外行\n${multi}`, false)).toBe(
      `${L('LegacyTooltip.59')}\n${multi}`,
    );
  });
});

// ---------------------------------------------------------------------------
// ① BySearch 检索域语料（vinvFillTooltipLines——静态说明行 + 行序后段）
// ---------------------------------------------------------------------------
describe('S4① BySearch 检索域语料（ItemFilters.BySearch :28-48 = GetLinesInfo 全量）', () => {
  it('静态说明行入语料：鲨牙项链 3212「盔甲穿透力增加5」可被搜到', () => {
    const it0 = filterItemOfVid(3212);
    it0.tooltipLines = [];
    vinvFillTooltipLines(it0);
    expect(it0.tooltipLines).toContain(L('ItemTooltip.SharkToothNecklace'));
  });

  it('语料含 Plantera 诅咒替换行（未杀=tip59 不含原文；已杀=原文不含 tip59）', () => {
    const k = filterItemOfVid(1533);
    k.tooltipLines = [];
    vinvFillTooltipLines(k, false);
    expect(k.tooltipLines).toContain(L('LegacyTooltip.59'));
    expect(k.tooltipLines).not.toContain(L('ItemTooltip.JungleKey'));
    k.tooltipLines = [];
    vinvFillTooltipLines(k, true);
    expect(k.tooltipLines).toContain(L('ItemTooltip.JungleKey'));
    expect(k.tooltipLines).not.toContain(L('LegacyTooltip.59'));
  });

  it('行序后段：buffTime 持续行（292 铁皮药剂 8 分钟）+ expert 行（3332 月总袋）+ master 行（4792）', () => {
    const dur = buildTooltipBody(defOfVid(292), { id: ITEM_BY_KEY[defOfVid(292).key], stack: 1 }, null);
    expect(dur.durationLine, '292 应有 buffTime 持续行').toBeTruthy();
    const pot = filterItemOfVid(292);
    pot.tooltipLines = [];
    vinvFillTooltipLines(pot);
    expect(pot.tooltipLines).toContain(dur.durationLine!.text);

    const bag = filterItemOfVid(3332);
    bag.tooltipLines = [];
    vinvFillTooltipLines(bag);
    expect(bag.tooltipLines).toContain(L('GameUI.Expert'));

    const master = filterItemOfVid(4792);
    master.tooltipLines = [];
    vinvFillTooltipLines(master);
    expect(master.tooltipLines).toContain(L('GameUI.Master'));
  });

  it('套装奖励行入语料（558 神圣头盔非佩戴单件面=BySearch 直调 GetLinesInfo 的缺省上下文）', () => {
    const h = filterItemOfVid(558);
    h.tooltipLines = [];
    vinvFillTooltipLines(h);
    const body = buildTooltipBody(defOfVid(558), { id: ITEM_BY_KEY[defOfVid(558).key], stack: 1 }, null);
    expect(body.setBonusLines.length, '558 应有套装奖励行族').toBeGreaterThan(0);
    for (const ln of body.setBonusLines) expect(h.tooltipLines).toContain(ln.text);
  });

  it('任务鱼行随参入语料（:20663-20666 LegacyInterface.65）', () => {
    const it0 = filterItemOfVid(292);
    it0.tooltipLines = [];
    vinvFillTooltipLines(it0, false, 292);
    expect(it0.tooltipLines).toContain(L('LegacyInterface.65'));
  });
});

// ---------------------------------------------------------------------------
// ③ 向导槽悬停 tooltip（refreshGuideSlotTooltip——三面绑定）
// ---------------------------------------------------------------------------
type AnyUI = Record<string, any>;

function mkGuideUi(placed: { id: number; stack: number; prefix?: number; favorited?: boolean } | null) {
  const ui = Object.create(UI.prototype) as AnyUI;
  const calls: Array<{ i: number; where: string; override: any }> = [];
  ui.game = {};
  ui.guidePlaced = placed;
  ui.tooltip = { style: {} as Record<string, string> };
  ui.showTooltipFor = (i: number, where: string, override?: any) => {
    calls.push({ i, where, override });
  };
  return { ui, calls };
}

const hoverEl = () => ({ matches: () => true });
const offEl = () => ({ matches: () => false });

describe('S4③ 向导槽悬停 tooltip（ItemSlot.Handle(ref guideItem,7) → MouseHover 全载荷）', () => {
  it('有件悬停 → showTooltipFor(placed.id, inv, slot 全载荷+anchor)', () => {
    const { ui, calls } = mkGuideUi({ id: 24, stack: 5, prefix: 81 });
    const el = hoverEl();
    (ui.refreshGuideSlotTooltip as (e: unknown) => void)(el);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.i).toBe(24);
    expect(calls[0]!.where).toBe('inv');
    expect(calls[0]!.override.slot).toEqual({ id: 24, stack: 5, prefix: 81 });
    expect(calls[0]!.override.anchor).toBe(el);
  });

  it('无词缀/收藏位不产出 undefined 键;favorited 随行（guidePlaced 全位语义）', () => {
    const { ui, calls } = mkGuideUi({ id: 9, stack: 1, favorited: true });
    (ui.refreshGuideSlotTooltip as (e: unknown) => void)(hoverEl());
    expect(Object.keys(calls[0]!.override.slot).sort()).toEqual(['favorited', 'id', 'stack']);
  });

  it('非悬停拍零动作（leave 通道管收）;空槽悬停收泡（MouseHover 空槽早退臂）', () => {
    const { ui, calls } = mkGuideUi({ id: 9, stack: 1 });
    (ui.refreshGuideSlotTooltip as (e: unknown) => void)(offEl());
    expect(calls).toHaveLength(0);
    const empty = mkGuideUi(null);
    (empty.ui.refreshGuideSlotTooltip as (e: unknown) => void)(hoverEl());
    expect(empty.calls).toHaveLength(0);
    expect(empty.ui.tooltip.style.display).toBe('none');
  });

  it('三面槽实例绑定在位（classic 覆层 slotBox/vinv 经典 cgSlot/vinv modern gSlot）', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(src).toContain('this.refreshGuideSlotTooltip(slotBox)');
    expect(src).toContain('this.refreshGuideSlotTooltip(cgSlot)');
    expect(src).toContain('this.refreshGuideSlotTooltip(gSlot)');
    // mousedown 换件随拍（原版逐帧刷新语义）——3 面 ×(enter+repaint)=6 消费点
    expect(src.match(/refreshGuideSlotTooltip\((slotBox|cgSlot|gSlot)\)/g)?.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// ④ 队伍格基帧冷却调光（refreshPvpButtons——:43506 White*num4 补齐）
// ---------------------------------------------------------------------------
function mkPvpUi(cool: boolean) {
  const ui = Object.create(UI.prototype) as AnyUI;
  ui.game = { player: { hostile: false, team: 1 } };
  const mkIcon = () => ({ style: {} as Record<string, string> });
  const sword = {
    style: {} as Record<string, string>,
    matches: () => false,
    querySelector: () => null,
    title: '',
  };
  const cells = PVP_TEAM_BUTTONS.map(() => {
    const icon = mkIcon();   // 柄单例：刷新链写与断言读须同一对象
    return {
      style: {} as Record<string, string>,
      matches: () => false,
      querySelector: (_sel: string): { style: Record<string, string> } => icon,   // 格恒有图标子元
      title: '',
    };
  });
  ui.pvpSwordBtn = sword;
  ui.pvpTeamBtns = cells;
  ui.pvpCooldownUntil = cool ? performance.now() + 1000 : 0;
  return { ui, sword, cells };
}

describe('S4④ 队伍格基帧冷却调光（Main.cs:43506 White*num4——BJ417 剑钮同式补齐）', () => {
  it('冷却期：6 队伍格基帧 opacity 0.25（=White×0.25）+ 剑钮同调（BJ417 面）+ 提示文案空', () => {
    const { ui, sword, cells } = mkPvpUi(true);
    (ui.refreshPvpButtons as () => void)();
    expect(sword.style.opacity).toBe('0.25');
    expect(cells).toHaveLength(6);
    for (const c of cells) {
      expect(c.querySelector('[data-pvp-team-icon]').style.opacity).toBe('0.25');
      expect(c.title).toBe('');   // 冷却期无提示（:43437 门,BJ417 同判）
      expect(c.style.backgroundImage).toBe('none');   // 悬停高亮满白不调光（flag2 门本就 !cool）
    }
  });

  it('非冷却：基帧满白（num4=1）+ 提示文案 TeamIcon{Active|Inactive}', () => {
    const { ui, sword, cells } = mkPvpUi(false);
    (ui.refreshPvpButtons as () => void)();
    expect(sword.style.opacity).toBe('1');
    for (const c of cells) {
      expect(c.querySelector('[data-pvp-team-icon]').style.opacity).toBe('1');
    }
    // team=1 → 第 1 格 Active、其余 Inactive（文案键名族 :43462）
    expect(cells[0]!.title).toBe(L('UI.TeamIconNone_Inactive'));
    expect(cells[1]!.title).toBe(L('UI.TeamIconRed_Active'));
  });

  it('消费柄在位：两构建区图标均挂 data-pvp-team-icon（classic/vinv 双面共用刷新链）', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(src.match(/icon\.dataset\.pvpTeamIcon = '1';/g)?.length).toBe(2);
    expect(src).toContain("cell.querySelector<HTMLElement>('[data-pvp-team-icon]')");
  });
});
