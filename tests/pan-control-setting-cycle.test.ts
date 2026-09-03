// 1457 相机平移档设置 UI 循环（2026-09-03 接线,登记销核）：
//   原版 = Player.Settings.PanControl_KeyboardAndMouse（★1457 Player.cs:359,缺省
//   Hold）+ 循环切换 CyclePanControl_KeyboardAndMouse（:379-382）→
//   Utils.CycleControlControl_OffOnClickHold（Utils.cs:159-176）：
//   Hold→Click→OnAlways→OffAlways→Hold（default 支归 Hold）。
//   ButtonControlMode.cs：Hold=0/Click=1/OnAlways=2/OffAlways=3。
//   消费 = 平移四档门（★1457 Main.cs:63719-63778;本仓 Game.ts 平移段）。
//   原版 1457 设置 UI 未挂该行（反编译全库无 CyclePanControl 调用点,IngameOptions
//   仅 HoverControl :671-686）——本仓按设置页 modeRow 先例补 UI 面（档位序/缺省 1:1）。
// 实现落点：src/ui/Settings.ts（cyclePanControlMode + PanControl 行）、
//   src/core/Options.ts（持久化键注释订正）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cyclePanControlMode } from '../src/ui/Settings';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

describe('平移档③：CycleControlControl_OffOnClickHold 环（Utils.cs:159-176）', () => {
  it('循环序 Hold(0)→Click(1)→OnAlways(2)→OffAlways(3)→Hold（default 支归 Hold）', () => {
    expect(cyclePanControlMode(0)).toBe(1);   // Hold → Click
    expect(cyclePanControlMode(1)).toBe(2);   // Click → OnAlways
    expect(cyclePanControlMode(2)).toBe(3);   // OnAlways → OffAlways
    expect(cyclePanControlMode(3)).toBe(0);   // OffAlways（default 支）→ Hold
    // 全环 4 步回原档
    let m = 0;
    for (let i = 0; i < 4; i++) m = cyclePanControlMode(m);
    expect(m).toBe(0);
  });

  it('越界/坏值钳回环内（Options.ts 存档卫门同语义：NaN/负值→Hold;超界钳 OffAlways）', () => {
    expect(cyclePanControlMode(Number.NaN)).toBe(1);   // NaN→Hold(0)→Click
    expect(cyclePanControlMode(-3)).toBe(1);           // 负值钳 Hold → Click
    expect(cyclePanControlMode(9)).toBe(0);            // 超界钳 OffAlways(3) → Hold（default 支）
    expect(Number.isInteger(cyclePanControlMode(2.6))).toBe(true);
  });
});

describe('平移档③：设置行接线与消费字段', () => {
  it('设置行存在且四档文案键齐备（zh-Hans/en-US 双份,l10n 产物已重建）', () => {
    const src = readFileSync('src/ui/Settings.ts', 'utf8');
    expect(src.includes('Mods.SandboxWorld.Settings.PanControl')).toBe(true);
    for (const suf of ['_Hold', '_Click', '_OnAlways', '_OffAlways']) {
      expect(src.includes(`Mods.SandboxWorld.Settings.PanControl${suf}`)).toBe(true);
    }
    for (const lang of ['zh-Hans', 'en-US']) {
      const pack = JSON.parse(readFileSync(`public/l10n/${lang}.json`, 'utf8')) as {
        Mods: Record<string, string>;
      };
      expect(typeof pack.Mods['Mods.SandboxWorld.Settings.PanControl']).toBe('string');
      for (const suf of ['_Hold', '_Click', '_OnAlways', '_OffAlways']) {
        expect(typeof pack.Mods[`Mods.SandboxWorld.Settings.PanControl${suf}`]).toBe('string');
      }
    }
  });

  it('实时直写通道：player.panControlMode 为公开可写字段（Click 档=1 消费端门）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.panControlMode).toBe(0);   // 缺省 Hold=旧行为（Player.cs:359）
    p.panControlMode = 1;
    expect(p.panControlMode).toBe(1);
    p.hasClickPanOn = true;
    expect(p.hasClickPanOn).toBe(true);
  });
});
