// 失焦播放设置项（2026-09-03 三项清偿③）——对照 Terarria1457：
//  Main.SettingPlayWhenUnfocused（Main.cs:268 默认 false；config "PlayWhenUnfocused"
//  :4301/:4444）；设置行 IngameOptions.cs:637-647（Gameplay 段紧随 autoPause，文案键
//  UI.PlayWhenUnfocusedOn/Off：On=失焦播放→行文案"暂停:关"，键名与文案反向=原版原文）；
//  消费面 FocusHelper.cs:23 AllowAudioUnfocused → :79 AllowMusic（失焦取本开关）→
//  Main.UpdateAudio:11193-11202 allowMusic=false → PauseAll。本仓同构 = Sfx 失焦音频闸
//  （setAudioSuspension：开关开=闸不落，隐藏页不 suspend、ensure/audio 不拦 resume）。
import { describe, it, expect, afterEach } from 'vitest';
import { Sfx } from '../src/core/Sfx';
import { options } from '../src/core/Options';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import { readFileSync } from 'node:fs';

/** AudioContext 结构桩（闸只消费 state/suspend/resume） */
class FakeCtx {
  state: 'running' | 'suspended' = 'running';
  suspendCount = 0;
  resumeCount = 0;
  async suspend(): Promise<void> { this.state = 'suspended'; this.suspendCount++; }
  async resume(): Promise<void> { this.state = 'running'; this.resumeCount++; }
}

const registry = () => (Sfx as unknown as { ctxRegistry: Set<unknown> }).ctxRegistry;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  options.data.playWhenUnfocused = false;   // 恢复原版默认
  registry().clear();
});

describe('Options.playWhenUnfocused（Main.cs:268 语义）', () => {
  it('默认 false = 失焦全静（原版缺省）', () => {
    expect(options.data.playWhenUnfocused).toBe(false);
  });

  it('设置行文案键 = 原版官译 UI.PlayWhenUnfocusedOn/Off（On→"暂停:关"反向是原文）', () => {
    const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    languageManager.loadPackJson(pack);
    expect(Lang.text('UI.PlayWhenUnfocusedOn')).toBe('失去焦点时暂停：关');
    expect(Lang.text('UI.PlayWhenUnfocusedOff')).toBe('失去焦点时暂停：开');
    // 键↔开关映射：On 键显示在开关 true（失焦播放）侧
    expect(options.data.playWhenUnfocused ? 'UI.PlayWhenUnfocusedOn' : 'UI.PlayWhenUnfocusedOff')
      .toBe('UI.PlayWhenUnfocusedOff');
  });

  it('设置行接线：行序紧随 autoPause（IngameOptions.cs:637-647 在 :628 autoPause 后同位）', () => {
    const src = readFileSync('src/ui/Settings.ts', 'utf8');
    const iAuto = src.indexOf("options.set('autoPause'");
    const iFocus = src.indexOf("options.set('playWhenUnfocused'");
    const iRev = src.indexOf("options.set('reversedUpDownArmorSetBonuses'");
    expect(iAuto).toBeGreaterThanOrEqual(0);
    expect(iFocus).toBeGreaterThan(iAuto);
    expect(iRev).toBeGreaterThan(iFocus);   // 下一行 = ReversedUpDownArmorSetBonuses（:647）
    expect(src.includes('UI.PlayWhenUnfocusedOn')).toBe(true);
    expect(src.includes('UI.PlayWhenUnfocusedOff')).toBe(true);
  });

  it('闸消费接线：Sfx.setAudioSuspension 的 hidden 向短路 + Options 默认/卫门', () => {
    expect(readFileSync('src/core/Sfx.ts', 'utf8').includes('hidden && options.data.playWhenUnfocused')).toBe(true);
    const opt = readFileSync('src/core/Options.ts', 'utf8');
    expect(opt.includes('playWhenUnfocused: false')).toBe(true);   // Main.cs:268 默认
    expect(opt.includes("typeof this.data.playWhenUnfocused !== 'boolean'")).toBe(true);
  });
});

describe('Sfx 失焦音频闸消费开关（FocusHelper.AllowAudioUnfocused → PauseAll/ResumeAll）', () => {
  it('默认（开关 false）：hidden=true 全部挂起（PauseAll），false 续播（ResumeAll）', async () => {
    const ctx = new FakeCtx();
    registry().add(ctx);
    options.data.playWhenUnfocused = false;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(ctx.state).toBe('suspended');
    expect(ctx.suspendCount).toBe(1);
    Sfx.setAudioSuspension(false);
    await flush();
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCount).toBe(1);
  });

  it('开关 true：闸不落（hidden=true 不 suspend——AllowMusic 失焦直通 true）', async () => {
    const ctx = new FakeCtx();
    registry().add(ctx);
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(ctx.state).toBe('running');
    expect(ctx.suspendCount).toBe(0);
  });

  it('开关 true：回前台仍放行 resume（suspended 语境不被开关卡死）', async () => {
    const ctx = new FakeCtx();
    ctx.state = 'suspended';   // 先验外部挂起态（如浏览器 autoplay 门）
    registry().add(ctx);
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(false);
    await flush();
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCount).toBe(1);
  });

  it('开关切换即时生效：true 期挂起不受影响，关回 false 后下次 hidden 立即落闸', async () => {
    const ctx = new FakeCtx();
    registry().add(ctx);
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(ctx.suspendCount).toBe(0);
    options.data.playWhenUnfocused = false;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(ctx.state).toBe('suspended');
  });
});
