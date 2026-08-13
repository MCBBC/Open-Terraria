// 攻略查询对齐原版水位批回归（2026-08-13）：
//   ① 图鉴免门（bestiaryGating.unlockAll 默认 true → unlockState 恒 DropsWithRates）
//   ② tooltip ItemTooltip.* 说明行链路（vi_ 物品 → ITEM_NAME_BY_ID → l10n 嵌套键）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { bestiaryEntries, BestiaryTracker, UnlockState, bestiaryGating } from '../src/data/Bestiary';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

// 真实 zh-Hans 包注入（同 bestiary-ui.test.ts 先例）
beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

describe('图鉴免门（参考书模式,bestiaryGating 显式开——默认已回归原版门控）', () => {
  it('零击杀/零目击/零对话条目：unlockState 恒最高档（掉落+掉落率全可见）;完成度走真实门控', () => {
    bestiaryGating.unlockAll = true;
    const t = new BestiaryTracker();
    const enemy = bestiaryEntries().find((e) => e.kind === 'enemy')!;
    const critter = bestiaryEntries().find((e) => e.kind === 'critter')!;
    const town = bestiaryEntries().find((e) => e.kind === 'town')!;
    for (const e of [enemy, critter, town]) {
      expect(t.unlockState(e)).toBe(UnlockState.DropsWithRates);  // 显示免门
      expect(t.isUnlocked(e)).toBe(false);                        // 完成度=真实
    }
    expect(t.completion().percent).toBeLessThan(0.01);
  });
});

describe('tooltip 说明行链路（ItemTooltip.*，Main.cs:20783-20798）', () => {
  it('vi_8 火把：ITEM_NAME_BY_ID→Torch→ItemTooltip.Torch="提供照明"', () => {
    expect(ITEM_NAME_BY_ID[8]).toBe('Torch');
    expect(Lang.text('ItemTooltip.Torch')).toBe('提供照明');
  });
  it('多行说明含 \\n（叶绿面具 ≥2 行,渲染端按 \\n 分行）', () => {
    const tip = Lang.text('ItemTooltip.ChlorophyteMask');
    expect(tip).toContain('\n');
    expect(tip.split('\n').length).toBeGreaterThanOrEqual(2);
  });
  it('缺键静默：未知组合返回键路径原样（调用方据此跳过渲染）', () => {
    const path = 'ItemTooltip.__No_Such_Item__';
    expect(Lang.text(path)).toBe(path);
  });
});
