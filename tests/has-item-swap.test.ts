// HasItemSwap 提示/交互面（R4 伴随项 2026-09-03；2611↔5526 + 6190↔6195 先例同缺）。
// 原版权威（1457）：
//   ItemID.cs:1219 HasItemSwap 集 28 件（2611 Flairon/5526 FlaironFlail/6190
//   OldStyleParkourBook/6195 OldStyleParkourBookInactive/5325/4131 贝壳电话族/
//   5059/5060/5324/5329/5330/4346/5391/5323/5455/4767/5453/5309/5454/5358/5360/
//   5361/5359/5437/6168/6169/6193/6194）。
//   悬停呈现＝两路：①mouse:Item.ToolTip ← l10n ItemTooltip.{Name} 带
//   {InputTrigger_ToggleOrOpen}（Lang.cs:160 → PC=Controls.MouseRight 键名、
//   手柄=Grapple），走 tooltip 渲染段 Main.cs:20783-20798 → 仓内 UI.showTooltipFor
//   staticTip 支（ItemTooltip.{ITEM_NAME_BY_ID[vid]} → Lang.text 全局替换表）；
//   ②gamepad:ItemSlot.cs:4009-4015 GetGamepadInstructions 悬停指令行
//   "UI.ActionChangeType"（更改类型）挂 Grapple——本作无手柄（Game.ts:10163）→
//   无渲染面，数据面键保留（登记）。原版无 cursorItemIconID/IconText/icon 分支
//   （全库 grep 仅 ItemSlot.cs:1646/:4009 两消费点）。
//   交互面＝ItemSlot.RightClick :1646-1653：canItemSwapAt 语境{0/3/4/8/10/32}+
//   stack==1+光标空 → TryItemSwap(:1879-1990 对表)原地 ChangeItemType +
//   AfterItemSwap(:1992-2008) 音 22 Unlock/7 Grab+stackSplit=30；持有侧快换表
//   Player.cs:31764-31877 已实装（tests/flairon-swap.test.ts）。
// 仓内：CursorItemIcon.tryItemSwapVid（对表+音档）+ UI 右键语境支
//   ('inv'/'chest'；装备栏 8/10 语境需过 equip 重算链=登记未接)。
// 运行：cd game && npx vitest run tests/has-item-swap.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { tryItemSwapVid } from '../src/render/CursorItemIcon';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { ITEM_DEFS } from '../src/data/items';
import { assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';

/** HasItemSwap 集金标（ItemID.cs:1219 CreateBoolSet 逐件转录，1458 同值未变） */
const VANILLA_HAS_ITEM_SWAP = [
  5325, 4131, 5060, 5059, 5324, 5329, 5330, 4346, 5391, 5323, 5455, 4767,
  5453, 5309, 5454, 6190, 6195, 5358, 5360, 5361, 5359, 5437, 6168, 6169,
  6193, 6194, 2611, 5526,
] as const;

const loadPack = (loc: 'zh-Hans' | 'en-US'): void => {
  languageManager.resetForTest();
  languageManager.loadPackJson(
    JSON.parse(readFileSync(new URL(`../public/l10n/${loc}.json`, import.meta.url), 'utf8')),
  );
};

// ============================================================
// ① 换型对表 + 音档（TryItemSwap :1879-1990 / AfterItemSwap :1992-2008）
// ============================================================
describe('HasItemSwap 对表（ItemSlot.cs:1879-1990;集 = ItemID.cs:1219）', () => {
  it('28 件全受理;沿表迭代止于环内（5324 系定向三环,5437 单向汇入 5358 环）', () => {
    for (const vid of VANILLA_HAS_ITEM_SWAP) {
      const sw = tryItemSwapVid(vid);
      expect(sw, `集内件 ${vid} 必须受理`).not.toBeNull();
      expect(VANILLA_HAS_ITEM_SWAP).toContain(sw!.target);
      const seen = new Set<number>([vid]);
      let cur = sw!.target;
      while (!seen.has(cur) && seen.size < 8) {
        seen.add(cur);
        cur = tryItemSwapVid(cur)!.target;
      }
      expect(seen.has(cur), `${vid} 迭代应止于环`).toBe(true);
    }
  });

  it('焦点对：2611 猪龙鱼链球↔5526 / 6190↔6195 旧世界跑酷指南±', () => {
    expect(tryItemSwapVid(2611)).toEqual({ target: 5526, sound: 'unlock' });
    expect(tryItemSwapVid(5526)).toEqual({ target: 2611, sound: 'unlock' });
    expect(tryItemSwapVid(6190)).toEqual({ target: 6195, sound: 'pickup' });
    expect(tryItemSwapVid(6195)).toEqual({ target: 6190, sound: 'pickup' });
  });

  it('三环一汇：5324→5329→5330→5324 / 5358→5360→5361→5359→5358 / '
    + '5437→5358 / 6168→6169→6193→6194→6168', () => {
    expect([5324, 5329, 5330].map((v) => tryItemSwapVid(v)!.target)).toEqual([5329, 5330, 5324]);
    expect([5358, 5360, 5361, 5359].map((v) => tryItemSwapVid(v)!.target)).toEqual([5360, 5361, 5359, 5358]);
    expect(tryItemSwapVid(5437)!.target).toBe(5358);
    expect([6168, 6169, 6193, 6194].map((v) => tryItemSwapVid(v)!.target)).toEqual([6169, 6193, 6194, 6168]);
  });

  it('音档（AfterItemSwap :1993-2007）：换入 2611/5526/6168 族=22 unlock、'
    + '6190/6195/5325 对侧等=7 pickup', () => {
    for (const v of [2611, 5526, 6168, 6169, 6193, 6194, 5358, 5360, 5361, 5359,
      5324, 5329, 5330, 4346, 5391]) {
      expect(tryItemSwapVid(v)!.sound, `${v}→unlock`).toBe('unlock');
    }
    for (const v of [6190, 6195, 5325, 4131, 5059, 5060, 5323, 5455, 4767, 5453, 5309, 5454]) {
      expect(tryItemSwapVid(v)!.sound, `${v}→pickup`).toBe('pickup');
    }
  });

  it('非集内件不受理（859 沙滩球/4132/6196/5061 抽查）', () => {
    for (const v of [859, 4132, 6196, 5061]) expect(tryItemSwapVid(v)).toBeNull();
  });

  it('仓内注册面：焦点四件已注册；已注册成员的 target 同样可解析（UI 支落格门）', () => {
    for (const v of [2611, 5526, 6190, 6195]) {
      expect(invIndexOfVanilla(v), `${v} 应已注册`).toBeGreaterThan(0);
    }
    for (const vid of VANILLA_HAS_ITEM_SWAP) {
      if (invIndexOfVanilla(vid) < 0) continue;   // 未注册件无法悬停,落格门不涉
      expect(invIndexOfVanilla(tryItemSwapVid(vid)!.target))
        .toBeGreaterThan(0);
    }
  });
});

// ============================================================
// ② 悬停提示面（Item.ToolTip ← ItemTooltip.{Name} + {InputTrigger_ToggleOrOpen}）
// ============================================================
describe('悬停提示面：ItemTooltip.{Name} 的 ToggleOrOpen 替换（Lang.cs:160）', () => {
  beforeEach(() => { loadPack('zh-Hans'); });

  it('四件 tooltip 键在真实包内且 token 替换为右键键名（zh-Hans）', () => {
    for (const vid of [2611, 5526, 6190, 6195]) {
      const key = `ItemTooltip.${ITEM_NAME_BY_ID[vid]}`;
      expect(languageManager.exists(key), `${key} 缺失`).toBe(true);
      const tip = languageManager.getTextValue(key);
      expect(tip).not.toContain('{InputTrigger');
      expect(tip).toContain('右键点击');
    }
  });

  it('分型文案键：6190 激活态「停用」/6195 未激活态「重新激活」', () => {
    expect(languageManager.getTextValue('ItemTooltip.OldStyleParkourBook')).toContain('停用');
    expect(languageManager.getTextValue('ItemTooltip.OldStyleParkourBookInactive')).toContain('重新激活');
  });

  it('手柄指令行数据面键 UI.ActionChangeType 在包内（更改类型;渲染面无手柄=登记 N/A）', () => {
    expect(languageManager.getTextValue('UI.ActionChangeType')).toBe('更改类型');
  });

  it('en-US 包同面（Right Click 替换）', () => {
    loadPack('en-US');
    const tip = languageManager.getTextValue('ItemTooltip.Flairon');
    expect(tip).toContain('Right Click');
    expect(tip).not.toContain('{InputTrigger');
    expect(languageManager.getTextValue('UI.ActionChangeType')).toBe('Change Type');
  });
});

// ============================================================
// ③ tooltip 装配链（Main.cs:20783-20798 item.ToolTip 渲染段 → staticTip 行族）
// ============================================================
describe('tooltip 装配：提示行随 staticTip 支入行族（tag static）', () => {
  beforeEach(() => { loadPack('zh-Hans'); });

  it('持 2611 悬停：装配结果含「右键点击切换模式」两行 static', () => {
    const iid = invIndexOfVanilla(2611);
    const def = ITEM_DEFS[iid];
    const staticTip = languageManager.getTextValue(`ItemTooltip.${ITEM_NAME_BY_ID[2611]}`);
    const lines = assembleTooltipLines(def, { id: iid, stack: 1 }, null, staticTip);
    const statics = lines.filter((ln) => ln.tag === 'static').map((ln) => ln.text);
    expect(statics).toEqual(['喷出自动制导的泡泡', '右键点击切换模式']);
  });

  it('持 6195 悬停：未激活分型文案入行族', () => {
    const iid = invIndexOfVanilla(6195);
    const staticTip = languageManager.getTextValue(`ItemTooltip.${ITEM_NAME_BY_ID[6195]}`);
    const lines = assembleTooltipLines(ITEM_DEFS[iid], { id: iid, stack: 1 }, null, staticTip);
    const joined = lines.filter((ln) => ln.tag === 'static').map((ln) => ln.text).join('\n');
    expect(joined).toContain('重新激活');
  });
});
