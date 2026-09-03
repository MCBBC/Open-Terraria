// 失焦播放设置项（2026-09-03 三项清偿③建立 → 红队 R3-E2 ①②③④ 修复重产）——对照 Terarria1457：
//  Main.SettingPlayWhenUnfocused（Main.cs:268 默认 false；config "PlayWhenUnfocused"
//  :4301/:4444）；设置行 IngameOptions.cs:637-647（Gameplay 段紧随 autoPause，文案键
//  UI.PlayWhenUnfocusedOn/Off：On=失焦播放→行文案"暂停:关"，键名与文案反向=原版原文）。
//  消费面 1457 真值（FocusHelper.cs）：
//  · :85-95 AllowMusic = 失焦取本开关（开=音乐继续；关=Main.cs:11197 audioSystem.PauseAll 连音乐全停）；
//  · :97-107 PauseSounds = !GameplayActive && netMode==0 即暂停 sfx（SoundEngine.cs:54-63
//    PauseAll/ResumeAll）——【与开关无关】，单机失焦 sfx 恒停、联机豁免；
//  · :109 QuietAmbientSounds = 失焦环境音恒归零（LegacySoundPlayer.cs:422）；
//  · :139-141 UpdateFocus → wantsToPause=(失焦 && netMode==0) & !开关 → Main.cs:17305-17313
//    gamePaused=true（游戏暂停也由本开关直驱，非 autoPause——R3-E2 ②）。
//  本仓同构 = Sfx 失焦音频闸按 ctx 类别分闸（'music'=BGM Audio.ts 登记 / 'sfx'=音效
//  +ambient 循环层）+ Game.applyFocusPause（失焦游戏暂停，两源 blur∪visibility 合并）。
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

const registry = () => (Sfx as unknown as { ctxRegistry: Map<unknown, string> }).ctxRegistry;
/** 失焦两源静态（hook 在 node 无 document 不挂,直接置源驱动合并态） */
const focusSrc = () => (Sfx as unknown as { visHidden: boolean; winBlurred: boolean });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const asCtx = (c: FakeCtx) => c as unknown as AudioContext;

afterEach(() => {
  options.data.playWhenUnfocused = false;   // 恢复原版默认
  Sfx.mpProbe = null;
  registry().clear();
  focusSrc().visHidden = false;
  focusSrc().winBlurred = false;
});

describe('Options.playWhenUnfocused（Main.cs:268 语义）', () => {
  it('默认 false = 失焦暂停+全静（原版缺省）', () => {
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

  it('闸消费接线：分类别分闸（③）+ 两源 blur 钩（①）+ Options 默认/卫门', () => {
    const src = readFileSync('src/core/Sfx.ts', 'utf8');
    expect(src.includes('static setAudioSuspension(inactive: boolean)')).toBe(true);
    expect(src.includes("options.data.playWhenUnfocused")).toBe(true);           // AllowMusic :85-95
    expect(src.includes("window.addEventListener('blur'")).toBe(true);           // ① blur 源
    expect(src.includes("window.addEventListener('focus'")).toBe(true);          // ① focus 恢复源
    expect(src.includes('isAppInactive()')).toBe(true);                          // ① 两源合并
    expect(src.includes("registerAudioContext(c: AudioContext, kind: 'sfx' | 'music'")).toBe(true);
    expect(src.includes('mpProbe')).toBe(true);                                  // ④ MP 豁免
    const opt = readFileSync('src/core/Options.ts', 'utf8');
    expect(opt.includes('playWhenUnfocused: false')).toBe(true);   // Main.cs:268 默认
    expect(opt.includes("typeof this.data.playWhenUnfocused !== 'boolean'")).toBe(true);
  });
});

describe('Sfx 失焦音频闸分类别（FocusHelper.cs:85-109 三分闸）', () => {
  it('默认（开关 false）：失焦 music+sfx 全挂起（Main.cs:11197 PauseAll），回前台全恢复', async () => {
    const music = new FakeCtx();
    const sfx = new FakeCtx();
    registry().set(asCtx(music), 'music');
    registry().set(asCtx(sfx), 'sfx');
    options.data.playWhenUnfocused = false;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(music.state).toBe('suspended');
    expect(sfx.state).toBe('suspended');
    Sfx.setAudioSuspension(false);
    await flush();
    expect(music.state).toBe('running');
    expect(sfx.state).toBe('running');
  });

  it('开关 true + 失焦：music 继续（AllowMusic :85-95 放行仅音乐）、sfx 恒停（PauseSounds :97-107 与开关无关）', async () => {
    const music = new FakeCtx();
    const sfx = new FakeCtx();
    registry().set(asCtx(music), 'music');
    registry().set(asCtx(sfx), 'sfx');
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(music.state).toBe('running');
    expect(music.suspendCount).toBe(0);   // 后台听歌面
    expect(sfx.state).toBe('suspended');  // 音效不随开关放行（③）
    expect(sfx.suspendCount).toBe(1);
  });

  it('开关 true：回前台放行 resume（suspended 的 music ctx 不被开关卡死）', async () => {
    const music = new FakeCtx();
    music.state = 'suspended';   // 先验外部挂起态（如浏览器 autoplay 门）
    registry().set(asCtx(music), 'music');
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(false);
    await flush();
    expect(music.state).toBe('running');
    expect(music.resumeCount).toBe(1);
  });

  it('开关切换即时生效（music 面）：true 期失焦不挂，关回 false 后下次失焦立即落闸', async () => {
    const music = new FakeCtx();
    registry().set(asCtx(music), 'music');
    options.data.playWhenUnfocused = true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(music.suspendCount).toBe(0);
    options.data.playWhenUnfocused = false;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(music.state).toBe('suspended');
  });

  it('MP 豁免（④ PauseSounds netMode==0 门）：联机失焦 sfx 不停，music 仍按开关停（PauseAll 无 netMode 门）', async () => {
    const music = new FakeCtx();
    const sfx = new FakeCtx();
    registry().set(asCtx(music), 'music');
    registry().set(asCtx(sfx), 'sfx');
    Sfx.mpProbe = () => true;
    options.data.playWhenUnfocused = false;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(sfx.state).toBe('running');      // 联机豁免（FocusHelper.cs:103）
    expect(sfx.suspendCount).toBe(0);
    expect(music.state).toBe('suspended');  // AllowMusic 不看 netMode
  });

  it('registerAudioContext 分类登记：缺省 sfx、Audio.ts 显式 music（③分闸载体）', () => {
    const a = new FakeCtx();
    const b = new FakeCtx();
    Sfx.registerAudioContext(asCtx(a));
    Sfx.registerAudioContext(asCtx(b), 'music');
    expect(registry().get(asCtx(a))).toBe('sfx');
    expect(registry().get(asCtx(b))).toBe('music');
    const audioSrc = readFileSync('src/core/Audio.ts', 'utf8');
    expect(audioSrc.includes("registerAudioContext(this.ac, 'music')")).toBe(true);
  });

  it('两源合并（①）：任一"未激活"即 inactive，双源清零才恢复', () => {
    expect(Sfx.isAppInactive()).toBe(false);
    focusSrc().winBlurred = true;             // 点另一应用：可见但失焦
    expect(Sfx.isAppInactive()).toBe(true);
    focusSrc().winBlurred = false;
    expect(Sfx.isAppInactive()).toBe(false);  // 单清不清闸
    focusSrc().visHidden = true;              // 切 tab
    expect(Sfx.isAppInactive()).toBe(true);
    focusSrc().winBlurred = true;
    focusSrc().visHidden = false;
    expect(Sfx.isAppInactive()).toBe(true);   // 另一源仍在
    focusSrc().winBlurred = false;
    expect(Sfx.isAppInactive()).toBe(false);
  });
});

describe('Game 失焦暂停面（FocusHelper.cs:139-141 → Main.cs:17305-17313）', () => {
  it('失焦游戏暂停由本开关直驱、blur 两源监听在位；autoPause 独立消费（R3-E2 ②交叉态）', () => {
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src.includes("window.addEventListener('blur', this.onWindowBlur)")).toBe(true);
    expect(src.includes("window.addEventListener('focus', this.onWindowFocus)")).toBe(true);
    const iA = src.indexOf('private applyFocusPause');
    const iB = src.indexOf('private applyAutoPauseUI');
    expect(iA).toBeGreaterThan(0);
    expect(iB).toBeGreaterThan(iA);
    const focusSeg = src.slice(iA, iB);
    expect(focusSeg.includes('options.data.playWhenUnfocused')).toBe(true);  // 开关直驱
    expect(focusSeg.includes('options.data.autoPause')).toBe(false);         // 与 autoPause 解耦
    expect(focusSeg.includes('this.net?.active')).toBe(true);                // MP 豁免 :141
    const uiSeg = src.slice(iB);
    expect(uiSeg.includes('options.data.autoPause')).toBe(true);             // 独立语义
    expect(uiSeg.includes('inventoryOpen')).toBe(true);                      // 开界面暂停（CanPauseGame 同构）
    expect(uiSeg.includes('playWhenUnfocused')).toBe(false);                 // 互不耦合
  });
});
