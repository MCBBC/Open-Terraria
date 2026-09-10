// SW-FX18 2026-09-10 公告盒编辑链复核 + 成就页双入口补齐。
// 【公告盒】（A 级登记 "公告盒牌面文字编辑 UI—devices:872" 现状定谳 = 已实装,
// 本件锁编辑→触发全链防回潮）：
//   - tileSign 族右键 = Main.tileSign {55,85,425,573}（Main.cs:10220-10223）
//     → Player.cs:32947-32966 OpenSign(Sign.ReadSign(anchor, CreateIfMissing:true))
//   - 锚点回算 = frameX/18 %2、frameY/18（:32964-32967 while(num40>1)num40-=2）
//   - 编辑 = NPCInteractions.cs:20-39 OpenVirtualKeyboard(1) → Main.editSign →
//     SubmitSignText（Main.cs:41397-41406 Sign.TextSign + Sound 12）
//   - 广播 = Wiring.cs:1177-1230（devices.ts announcementBoxMessage 已测:
//     station-remaining.test.ts）
// 【成就页】（A 级登记 "成就页 UI—UI:2859" 现状定谳 = 面板已实装(平行批),本批补
// 原版双入口）：
//   - 标题主菜单第三钮 = Main.cs:49733 menuMode 0 Lang.menu[131] → AchievementsMenu
//   - 游戏内设置左列 = IngameOptions.cs:292-298 DrawLeftSide(Lang.menu[131]) →
//     IngameFancyUI.OpenAchievements()（面板叠于设置上,Main.cs:112 全局单面板）
// 运行:npx vitest run tests/sw-fx18-announce-achievements.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { announcementBoxMessage } from '../src/world/wiring/devices';

const SRC = join(dirname(fileURLToPath(new URL(import.meta.url))), '..', 'src');
const readSrc = (p: string): string => readFileSync(join(SRC, p), 'utf8');

describe('SW-FX18 公告盒：编辑→触发全链（tileSign 族 55/85/425/573）', () => {
  it('右键路由与锚点回算（%2 件内列,Game.ts openSignEditor 懒建）', () => {
    const src = readSrc('core/Game.ts');
    // 四 tile 家族路由（Main.cs:10220-10223 tileSign 表）
    expect(src).toContain('sh === 55 || sh === 85 || sh === 425 || sh === 573');
    // 锚点回算：frameX/18 %2（多 style 牌件防错格——Player.cs:32964-32967）
    expect(src).toContain('Math.floor(st.frameX[iBox] / 18) % 2');
    // Sign.ReadSign CreateIfMissing:true 懒建空牌（Sign.cs:45-59）
    expect(src).toContain("sign = { x, y, text: '' }");
  });

  it('编辑面板双态 + 保存写回（SubmitSignText Main.cs:41397 = setSignText）', () => {
    const ui = readSrc('ui/UI.ts');
    expect(ui).toContain('showSignDialog');                  // 读/编辑双态面板
    expect(ui).toContain('Lang.inter(47)');                  // 保存（编辑态标签）
    expect(ui).toContain('Lang.inter(48)');                  // 编辑（NPCInteractions:27-36）
    expect(ui).toContain('setSignText');
    const game = readSrc('core/Game.ts');
    expect(game).toContain('sign.text = text');              // Sign.TextSign 写回
  });

  it('编辑→广播 round-trip：懒建空牌静默,写回文本后广播可达（Wiring.cs:1204-1217）', () => {
    // world.signs 载体：openSignEditor 懒建空牌（无文本）→ 广播静默
    const signs: Array<{ x: number; y: number; text: string }> = [{ x: 10, y: 20, text: '' }];
    expect(announcementBoxMessage(signs, 10, 20)).toBeNull();
    // setSignText 等价写回 → 广播面读到新文本（粉色 460 断言在 station-remaining 已锁）
    const sign = signs.find((s) => s.x === 10 && s.y === 20)!;
    sign.text = ' edited ';
    const msg = announcementBoxMessage(signs, 10, 20);
    expect(msg).not.toBeNull();
    expect(msg!.text).toBe(' edited ');
  });
});

describe('SW-FX18 成就页双入口（Main.cs:49733 + IngameOptions.cs:294）', () => {
  it('标题主菜单第三钮（menuMode 0 Lang.menu[131] → AchievementsMenu）', () => {
    const title = readSrc('ui/TitleMenu.ts');
    expect(title).toContain("data-act=\"ach\"");             // 按钮位（sp/mp/ach/set 序）
    expect(title).toContain('LegacyMenu.131');
    expect(title).toContain('onAchievements');               // 流回调
  });

  it('游戏内设置左列入口（IngameOptions DrawLeftSide(menu[131]) → OpenAchievements）', () => {
    const settings = readSrc('ui/Settings.ts');
    expect(settings).toContain("div.dataset.cat = 'achievements'");
    expect(settings).toContain('LegacyMenu.131');
    expect(settings).toContain('flow.onAchievements');
  });

  it('两入口喂同一面板（Main.cs:112 全局单面板语义 = AchievementsHost 结构化宿主）', () => {
    const ach = readSrc('ui/AchievementsUI.ts');
    expect(ach).toContain('export interface AchievementsHost');
    expect(ach).toContain('openAchievementsPanel(host: AchievementsHost');
    const flow = readSrc('mainFlow.ts');
    // 标题屏：菜单级成就实例桥（__swAchievements 复用/懒建）
    expect(flow).toContain('openMenuAchievements');
    expect(flow).toContain('menuAchievementsReady');
    // 设置面板回调：世界内用 Game 级实例
    expect(flow).toContain('m.openAchievementsPanel({ achievements: g.achievements, sfx: g.sfx })');
  });

  it('游戏内弹窗→面板定位链不回退（UI.ts 弹窗点击 focusName）', () => {
    const ui = readSrc('ui/UI.ts');
    expect(ui).toContain('openAchievementsPanel(this.game, name)');
  });
});
