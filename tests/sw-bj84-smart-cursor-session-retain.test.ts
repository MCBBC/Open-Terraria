import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartCursor, DEFAULT_SMART_CURSOR_SETTINGS, resetSmartCursorSessionState } from '../src/player/SmartCursor';

/**
 * SW-BJ84（2026-09-14）智能光标 Ctrl 开态跨世界保留守卫。
 *
 * 定谳锚（反编译 1457，1458 同构 +7 行）：
 *  - Main.SmartCursorWanted_Mouse 是 Main 的 static（Main.cs:2095），全树写点仅
 *    Main.cs:67590-67591（静态构造器：进程启动置 false）与 Player.cs:25649-25650
 *    （SmartCursorLookup 异常复位）——【退世界/换世界无复位点】→ 进程内重进保留开态。
 *  - config.json 不持久化开态：SaveSettings 只存 SmartCursorToggle 模式键
 *    （Main.cs:4199 Put / 4422 Get，= cSmartCursorModeIsToggleAndNotHold）→
 *    进程重启开态必失（用户实报"跨会话不记住"在原版同相，不得加 Options 持久化）。
 *  - 本仓 Game 实例每进世界重建 → 以模块级 sessionWanted 承载页面寿命开态
 *    （src/player/SmartCursor.ts ★SW-BJ84 块）：实例初值读它，updateWanted 切换拍回写。
 */

const here = dirname(fileURLToPath(import.meta.url));
const S = DEFAULT_SMART_CURSOR_SETTINGS; // toggleMode=true

/** 会话态归一化：无论上一用例把 sessionWanted 留成什么值，按 Toggle 语义收敛到关。
 *  （会话态跨用例存续本身即被测语义——用例不得假设初值。） */
function ensureOff(): void {
  const sc = new SmartCursor();
  if (sc.wanted) {
    sc.updateWanted(false, false, S); // 松开（Toggle 保持开）
    sc.updateWanted(true, false, S); // 再按沿 → 关
  }
}

describe('SW-BJ84 智能光标开态跨世界保留（原版 static 语义）', () => {
  it('页面（进程）首建：开态默认关（Main.cs:67590 静态构造器语义）', () => {
    // 本文件首个用例：此刻模块内尚无任何切换拍，sessionWanted 必为 false
    expect(new SmartCursor().wanted).toBe(false);
  });

  it('Ctrl 开 → 退世界 → 重进：开态保留（原版无退世界复位点）', () => {
    ensureOff();
    const sc = new SmartCursor();
    expect(sc.updateWanted(true, false, S)).toBe(true); // 按下沿 → 开
    expect(sc.wanted).toBe(true);
    // 重进世界 = Game 重建 → 新 SmartCursor 实例，static 存活
    expect(new SmartCursor().wanted).toBe(true);
  });

  it('Ctrl 关 → 重进：保持关（关态同样保留，不回弹）', () => {
    ensureOff();
    const sc = new SmartCursor();
    sc.updateWanted(true, false, S); // 开
    sc.updateWanted(false, false, S); // 松开（Toggle 模式保持开）
    sc.updateWanted(true, false, S); // 再按沿 → 关
    expect(sc.wanted).toBe(false);
    expect(new SmartCursor().wanted).toBe(false);
  });

  it('Hold 模式松开收敛 false：重进不吃到残留 true', () => {
    const hold = { ...S, toggleMode: false };
    const sc = new SmartCursor();
    sc.updateWanted(true, false, hold); // 电平跟随 → 开
    expect(sc.wanted).toBe(true);
    sc.updateWanted(false, false, hold); // 松开 → 关
    expect(new SmartCursor().wanted).toBe(false);
  });

  it('进程重启即失（模块寿命=页面寿命）：resetModules 后新模块初值恒 false', async () => {
    vi.resetModules();
    const fresh = await import('../src/player/SmartCursor');
    expect(new fresh.SmartCursor().wanted).toBe(false);
  });

  it('显式复位钩子 resetSmartCursorSessionState：从任意残留相清回进程启动相（测试夹具/流程用）', () => {
    ensureOff();
    const sc = new SmartCursor();
    sc.updateWanted(true, false, S); // 开（会话态=true）
    expect(new SmartCursor().wanted).toBe(true);
    resetSmartCursorSessionState();
    expect(new SmartCursor().wanted).toBe(false); // ≡ Main.cs:67590
  });

  it('守卫锚：开态不入 Options 持久化面（原版 SaveSettings 无此键）+ 回写锚在位', () => {
    const optionsSrc = readFileSync(join(here, '../src/core/Options.ts'), 'utf8');
    // 持久化面恰对齐原版三键：模式键在（Options.ts:42），运行时开态键永不存在
    expect(optionsSrc).toMatch(/Main\.cSmartCursorModeIsToggleAndNotHold/);
    expect(optionsSrc).not.toMatch(/smartCursorWanted|smartCursorOn|smartCursorEnabled|smartCursorRemember/);
    const scSrc = readFileSync(join(here, '../src/player/SmartCursor.ts'), 'utf8');
    expect(scSrc).toMatch(/let sessionWanted = false/); // 会话态模块锚
    expect(scSrc).toMatch(/wanted = sessionWanted/);    // 实例初值读会话态
    expect(scSrc).toMatch(/Main\.cs:67590/);            // 原版写点锚注释在位
  });
});
