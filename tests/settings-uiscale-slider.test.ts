// ★回归钉(2026-09-16):UI 缩放滑条半成品收尾——Options.uiScale(0.75~1.5)数据链/
//  应用链(UIScale.userScale + 背包布局 K)/l10n 文案早已就位,唯设置面板控件缺位
//  (曾只渲染 UiScaleHint 一行,标签键孤儿)。本钉防控件再次脱落:
//  ① 面板接线 UiScale 标签滑条(0.75/1.5/0.05);
//  ② set 回调显式 UIScale.recompute()(userScale 裸赋值不触发重算)+ window
//     resize 事件(DOM 背包面板失效重排,vinvResizeHandler 同通道);
//  ③ l10n 自定义表双语键在位(l10n-audit 只查缺失,不查「有键无控件」)。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ★C档可移植:l10n 源目录(仓库外 tools/l10n-custom,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['tools/l10n-custom'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = readFileSync(join(ROOT, 'src/ui/Settings.ts'), 'utf8');

describe.skipIf(EXT_MISSING)('设置面板 UI 缩放滑条(半成品收尾钉)', () => {
  it('① UiScale 标签滑条已接线,量程 0.75~1.5 步进 0.05', () => {
    expect(settings).toContain("Lang.text('Mods.SandboxWorld.Settings.UiScale')");
    expect(settings).toMatch(/this\.slider\(\s*Lang\.text\('Mods\.SandboxWorld\.Settings\.UiScale'\),\s*0\.75, 1\.5, 0\.05,/);
  });

  it('② set 回调显式 recompute + resize 重排(裸赋值 userScale 不生效)', () => {
    expect(settings).toMatch(/void options\.set\('uiScale', v\);[\s\S]{0,200}UIScale\.userScale = v;[\s\S]{0,80}UIScale\.recompute\(\);[\s\S]{0,80}window\.dispatchEvent\(new Event\('resize'\)\);/);
  });

  it('③ l10n 双语键在位(标签+提示;Mods 下去前缀扁平键)', () => {
    for (const f of ['zh-Hans.json', 'en-US.json']) {
      const j = JSON.parse(readFileSync(join(ROOT, '../tools/l10n-custom', f), 'utf8')) as {
        Mods?: Record<string, string>;
      };
      expect(j.Mods?.['SandboxWorld.Settings.UiScale'], `${f} 缺 UiScale 标签`).toBeTruthy();
      expect(j.Mods?.['SandboxWorld.Settings.UiScaleHint'], `${f} 缺 UiScaleHint`).toBeTruthy();
    }
  });
});
