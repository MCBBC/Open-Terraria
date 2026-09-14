// SW-BN3 2026-09-07（用户拍板方案 A：对齐原版）Esc 链 + autoPause 守卫：
//   ①链矩阵——inventoryOpen 态【所有触发面】=closeInventory（ToggleInv else 支
//     Player.cs:5026,原版无触发面区分）;BN2「暂停浮层叠于背包」的 Esc 路径退役,
//     openPause 可达面仅剩 {无面板+暂停钮面} 与 {死亡态 RB6b
//     （TryOpeningInGameOptionsBasedOnInput :17391-17410)};pauseOpen 支
//     （:4978-4986 IngameOptions.Close）收浮层——★SW-RB8c 2026-09-08 勘误:
//     Close() 置 playerInventory=true（IngameOptions.cs:108）=执行器面回背包
//     （closeInGamePause）;Open() 置 playerInventory=false（:70）=开浮层收背包,
//     原版设置窗与背包两态互斥,BN3「叠于背包/Open 不清背包」系误读。
//   ②autoPause 两态暂停断言——CanPauseGame（Main.cs:17493-17508;1458 同位零漂移）
//     autoPause 臂（:17500-17504 playerInventory ∨ sign ∨ InGameUI）= 本仓
//     Game.applyAutoPauseUI 逐帧重算：开∧背包开→paused / 背包关→恢复 / 开关关→
//     不暂停也不抢恢复（_uiPausedByAutoPause 归属门,Web 便利语义备案）。
//     ingameOptionsWindow 臂（:17496 析取第一支）= 事件驱动 openInGamePause/
//     closePause（main.ts 结构锁）。
//   ③结构锁——背包内设置钮（DrawInterface_29_SettingsButton Main.cs:46287-46301,
//     clickAction= ingameOptionsWindow ? Close : Open :46294-46299）在位;
//     Settings autoPause 行（IngameOptions.cs:628 同位,LegacyMenu.69/70 官译）;
//     Options 缺省 false（Main.cs:1298,config 键 "AutoPause" :4203/:4426）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveEscapeChain, type EscapeChainState, type EscapeIntent } from '../src/ui/escapeChain';
import { options } from '../src/core/Options';
import { Game } from '../src/core/Game';

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));
const readSrc = (p: string): string => readFileSync(`${srcRoot}/${p}`, 'utf8');

describe('SW-BN3 ①Esc 链矩阵（对齐原版 ToggleInv Player.cs:4961-5057）', () => {
  const base: EscapeChainState = {
    summonOpen: false, fullMapOpen: false, settingsOpen: false, pauseOpen: false,
    npcDialogActive: false, signDialogActive: false, uiBlocking: false,
    inventoryOpen: false, dead: false,
  };
  const s = (over: Partial<EscapeChainState>): EscapeChainState => ({ ...base, ...over });
  const ALL_INTENTS: EscapeIntent[] = ['escape', 'inventory', 'pause'];

  it('主链翻转：背包开着=关背包,任意触发面同向（原版 else 支 :5026 无触发面区分）', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ inventoryOpen: true }), intent)).toBe('closeInventory');
    }
  });

  it('openPause 可达面收窄：仅 {无面板+暂停钮面} 与 {死亡态};Esc/绑键面全域不可达', () => {
    // 无面板：Esc/绑键=开背包（:5023-5025）,暂停钮=开浮层（SW 触屏官方同位钮）
    expect(resolveEscapeChain(base, 'escape')).toBe('openInventory');
    expect(resolveEscapeChain(base, 'inventory')).toBe('openInventory');
    expect(resolveEscapeChain(base, 'pause')).toBe('openPause');
    // 背包开着：Esc 不再直达浮层（BN2 分歧已撤）;暂停钮面同态=关背包（叠层退役）
    expect(resolveEscapeChain(s({ inventoryOpen: true }), 'escape')).not.toBe('openPause');
    expect(resolveEscapeChain(s({ inventoryOpen: true }), 'pause')).toBe('closeInventory');
    // 死亡态：唯一非暂停钮面的 openPause 入口（RB6b,TryOpeningInGameOptions :17391）
    expect(resolveEscapeChain(s({ dead: true }), 'escape')).toBe('openPause');
  });

  it('pauseOpen 支优先且只收浮层：任何状态/触发面 Esc=closePause,背包态字段不被链吞', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ pauseOpen: true }), intent)).toBe('closePause');
      // 链核只出 closePause 决策;背包开合是执行器面（★SW-RB8c:closeInGamePause
      // 按 IngameOptions.Close :108 回背包——链核不建模 inventoryOpen 写位）
      expect(resolveEscapeChain(s({ pauseOpen: true, inventoryOpen: true }), intent))
        .toBe('closePause');
      // 死亡+浮层=closePause（ingameOptionsWindow ? Close : Open 的 Close 臂）
      expect(resolveEscapeChain(s({ pauseOpen: true, dead: true }), intent)).toBe('closePause');
    }
  });

  it('★RB28-F3 设置子页面让位支：设置面板叠开于暂停浮层=noop（Esc 只走设置面板自身 handler=关设置回暂停菜单）', () => {
    // pauseOpen 支前让位——否则 closePause 同帧双收两层（设置+暂停整关=状态残留）;
    // summon/fullMap 支仍在其前（历史序保留,设置态与两者实际互斥）
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ settingsOpen: true, pauseOpen: true }), intent)).toBe('noop');
    }
    // 设置面板独开（无暂停浮层,理论态）同让位
    expect(resolveEscapeChain(s({ settingsOpen: true }), 'escape')).toBe('noop');
  });

  it('前序支序 1:1 不因重钉漂移（summon→map→pause→对话→路牌→模态让位→死亡）', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ summonOpen: true }), intent)).toBe('closeSummon');
      expect(resolveEscapeChain(s({ fullMapOpen: true }), intent)).toBe('closeFullMap');
      expect(resolveEscapeChain(s({ npcDialogActive: true }), intent)).toBe('closeNpcDialog');
      expect(resolveEscapeChain(s({ signDialogActive: true }), intent)).toBe('closeSign');
      expect(resolveEscapeChain(s({ uiBlocking: true }), intent)).toBe('noop');
      expect(resolveEscapeChain(s({ uiBlocking: true, inventoryOpen: true }), intent)).toBe('noop');
      expect(resolveEscapeChain(s({ dead: true }), intent)).toBe('openPause');   // RB6b 保留
      expect(resolveEscapeChain(s({ dead: true, inventoryOpen: true }), intent)).toBe('openPause');
    }
  });

  it('Esc 开关循环 4 拍（背包面）：开→关→开→关,全程不经过暂停浮层', () => {
    let st = base;
    st = s({ inventoryOpen: resolveEscapeChain(st, 'escape') === 'openInventory' });
    expect(st.inventoryOpen).toBe(true);                    // 拍1：开
    expect(resolveEscapeChain(st, 'escape')).toBe('closeInventory');
    st = base;                                              // 拍2：关（执行器落 closeInventory）
    expect(resolveEscapeChain(st, 'escape')).toBe('openInventory');
    st = s({ inventoryOpen: true });                        // 拍3：再开
    expect(resolveEscapeChain(st, 'escape')).toBe('closeInventory');
    expect(resolveEscapeChain(base, 'escape')).toBe('openInventory');   // 拍4：可再开
  });
});

describe('SW-BN3 ②autoPause 两态暂停（CanPauseGame Main.cs:17493-17508 autoPause 臂 :17500-17504）', () => {
  afterEach(() => {
    options.data.autoPause = false;
    vi.unstubAllGlobals();
  });
  const callAutoPause = (self: {
    world: unknown; net: { active: boolean } | null;
    paused: boolean; _uiPausedByAutoPause: boolean;
  }): void => (Game.prototype as unknown as {
    applyAutoPauseUI: (this: typeof self) => void;
  }).applyAutoPauseUI.call(self);
  const mkSelf = (): { world: unknown; net: { active: boolean } | null; paused: boolean; _uiPausedByAutoPause: boolean } =>
    ({ world: {}, net: null, paused: false, _uiPausedByAutoPause: false });
  const stubInv = (open: boolean) =>
    vi.stubGlobal('window', { __swUI: { inventoryOpen: open } });

  it('缺省关（Main.cs:1298 autoPause=false;config "AutoPause"）——开背包不暂停', () => {
    expect(options.data.autoPause).toBe(false);
    const g = mkSelf();
    stubInv(true);
    callAutoPause(g);
    expect(g.paused).toBe(false);
    expect(g._uiPausedByAutoPause).toBe(false);
  });

  it('开关开∧背包开→paused（playerInventory 臂）;背包关→恢复（逐帧态,非事件闩）', () => {
    options.data.autoPause = true;
    const g = mkSelf();
    stubInv(true);
    callAutoPause(g);
    expect(g.paused).toBe(true);              // 开背包即暂停
    expect(g._uiPausedByAutoPause).toBe(true);
    stubInv(false);
    callAutoPause(g);
    expect(g.paused).toBe(false);             // 关背包即恢复（CanPauseGame 逐帧重算）
    expect(g._uiPausedByAutoPause).toBe(false);
  });

  it('MP 豁免（netMode==0 门 :17496）与重复幂等：gate 真时不重复置旗/恢复不抖动', () => {
    options.data.autoPause = true;
    const g = mkSelf();
    g.net = { active: true };                 // netMode==1：autoPause 臂整支失效
    stubInv(true);
    callAutoPause(g);
    expect(g.paused).toBe(false);
    g.net = null;
    callAutoPause(g);
    callAutoPause(g);                         // 连帧重算：已 paused 不抖动
    expect(g.paused).toBe(true);
    expect(g._uiPausedByAutoPause).toBe(true);
  });

  it('归属门：非 autoPause 所致的暂停（浮层/手动）不被本门误唤醒', () => {
    options.data.autoPause = true;
    const g = mkSelf();
    g.paused = true;                          // 浮层/手动暂停态（_uiPausedByAutoPause=false）
    stubInv(false);
    callAutoPause(g);
    expect(g.paused).toBe(true);              // 不抢恢复（Web 便利语义,Game.ts 头注备案）
  });
});

describe('SW-BN3 ③结构锁（源文本锚,防链语义/暂停面静默回退）', () => {
  it('背包内设置钮在位：UI.ts 钮 + main.ts 开/收 toggle 接线（Main.cs:46287-46301）', () => {
    const ui = readSrc('ui/UI.ts');
    expect(ui).toContain('onPauseMenu?: () => void');
    expect(ui).toContain("Lang.text('LegacyInterface.62')");   // 官译 "Settings"/"设置"
    expect(ui).toContain('DrawInterface_29_SettingsButton');
    const main = readSrc('main.ts');
    expect(main).toContain('ui.onPauseMenu = () => {');
    const wiring = /ui\.onPauseMenu = \(\) => \{[\s\S]*?\n\};/.exec(main)?.[0] ?? '';
    expect(wiring).toContain('openInGamePause(g);');           // Open 臂（:70 收背包）
    expect(wiring).toContain('closeInGamePause(g);');          // Close 臂（:108 回背包,SW-RB8c）
  });

  it('浮层暂停=ingameOptionsWindow 臂（:17496 析取第一支）事件驱动：开即 paused/收即恢复', () => {
    const main = readSrc('main.ts');
    const openFn = /function openInGamePause\(game: Game\): void \{[\s\S]*?\n\}/.exec(main)?.[0] ?? '';
    expect(openFn).toContain('game.paused = true');
    expect(openFn).toContain('ui.showPause(');
  });

  it('applyAutoPauseUI=autoPause 臂逐帧重算：frame() 每帧调用 + 门含开关/背包/MP 三项', () => {
    const game = readSrc('core/Game.ts');
    expect(game).toContain('this.applyAutoPauseUI();');
    const fn = /private applyAutoPauseUI\(\): void \{[\s\S]*?\n  \}/.exec(game)?.[0] ?? '';
    expect(fn).toContain('options.data.autoPause');
    expect(fn).toContain('inventoryOpen');
    expect(fn).toContain('!this.net?.active');                 // netMode==0 门
    expect(game).toContain('17493-17508');                     // 原文臂区行号锚
    expect(game).toContain(':17502');                          // sign 臂行号锚（登记未接）
  });

  it('Settings autoPause 行在位（IngameOptions.cs:628 同位,LegacyMenu.69/70 官译）', () => {
    const settings = readSrc('ui/Settings.ts');
    expect(settings).toContain("options.set('autoPause'");
    expect(settings).toContain('Lang.menu(69)');               // 行标签=「自动暂停」官译
    expect(settings).toContain('Lang.menu(d.autoPause ? 69 : 70)');
  });

  it('escapeChain.ts 头注 SW-BN3 对齐锚在位（:5026 主链/:46287 设置钮/:17493 CanPauseGame）', () => {
    const ec = readSrc('ui/escapeChain.ts');
    expect(ec).toContain('SW-BN3');
    expect(ec).toContain('5026');
    expect(ec).toContain('Main.cs:46287');
    expect(ec).toContain('Main.cs:17493');
    expect(ec).toContain('5023-5025');
  });
});
