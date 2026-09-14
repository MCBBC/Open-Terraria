// SW-BN2 2026-09-07 键位系统改造四令守卫（用户令×4；SW-BN3 2026-09-07 重钉：
//   ② Esc 链对齐原版——背包开着再按 Esc=关背包（ToggleInv :5026）,BN2 的
//   「Esc=暂停浮层」用户令分歧经用户拍板方案 A 撤销,「叠层/收两层」断言删除,
//   浮层改走背包内设置钮/暂停钮/死亡态;语义矩阵详钉见 tests/sw-bn3-esc-vanilla-align）：
//   ①E 回归钩爪 / ②Esc=背包开关循环 / ③操作说明键位标注活绑表驱动
//   / ④未绑项可点击录入绑定。
// 三层钉法（campaign-playbook P3：行为面 + 结构锁）：
//   · 行为面——DEFAULT_KEYBINDS 全表锁（原版 Redigit Keyboard 档 1:1 + 偏差备案）、
//     迁移卫门 migrateLegacyDefaults（旧档只动缺省不丢自定义）、Esc 链决策核
//     resolveEscapeChain 全支矩阵 + Esc 开关循环（开背包→关背包→再开,无死循环）、
//     未绑项绑定流（assignBinding 空表 action 录入/反选）、活标签 keybindHintLabel。
//   · 结构锁——main.ts 执行器挂 resolveEscapeChain 决策核 / closePause 只收浮层
//     不动背包 / MobileControls 暂停钮 intent 'pause' / mainFlow 欢迎语走活绑表 /
//     escapeChain.ts 原版行号锚在位。
// （SettingsPanel 录入交互为 DOM 链,测试环境无 DOM——行为核 assignBinding 由
//   tests/keybinds.test.ts 与本文件 ④ 覆盖,面板监听器经结构锁钉住）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  KEYBIND_ACTIONS, DEFAULT_KEYBINDS, bindsOf, isBound, actionsForCode,
  assignBinding, migrateLegacyDefaults, keybindHintLabel, keybindCodeLabel,
} from '../src/core/Keybinds';
import { resolveEscapeChain, type EscapeChainState } from '../src/ui/escapeChain';
import { options } from '../src/core/Options';

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

describe('SW-BN2 ①缺省表对齐原版（PlayerInput.cs:2062-2140 Redigit Keyboard 档）', () => {
  it('全表锁：原版逐 trigger 对应（Web 键码换算）', () => {
    // PlayerInput.cs:2069-2140 Keyboard 档逐行（右注=原版行号）
    expect(DEFAULT_KEYBINDS.Inventory).toEqual(['Escape']);          // :2074
    expect(DEFAULT_KEYBINDS.Grapple).toEqual(['KeyE']);              // :2075
    expect(DEFAULT_KEYBINDS.SmartSelect).toEqual(['ShiftLeft']);     // :2076 LeftShift
    expect(DEFAULT_KEYBINDS.QuickMount).toEqual(['KeyR']);           // :2078
    expect(DEFAULT_KEYBINDS.QuickHeal).toEqual(['KeyH']);            // :2079
    expect(DEFAULT_KEYBINDS.QuickMana).toEqual(['KeyJ']);            // :2080
    expect(DEFAULT_KEYBINDS.QuickBuff).toEqual(['KeyB']);            // :2081
    expect(DEFAULT_KEYBINDS.MapStyle).toEqual(['Tab']);              // :2082
    expect(DEFAULT_KEYBINDS.MapFull).toEqual(['KeyM']);              // :2083
    expect(DEFAULT_KEYBINDS.MapZoomIn).toEqual(['NumpadAdd']);       // :2084 Add
    expect(DEFAULT_KEYBINDS.MapZoomOut).toEqual(['NumpadSubtract']); // :2085 Subtract
    expect(DEFAULT_KEYBINDS.MapAlphaUp).toEqual(['PageUp']);         // :2086
    expect(DEFAULT_KEYBINDS.MapAlphaDown).toEqual(['PageDown']);     // :2087
    expect(DEFAULT_KEYBINDS.Hotbar1).toEqual(['Digit1']);            // :2088-2097 D1-D9
    expect(DEFAULT_KEYBINDS.Hotbar5).toEqual(['Digit5']);
    expect(DEFAULT_KEYBINDS.Hotbar9).toEqual(['Digit9']);
    expect(DEFAULT_KEYBINDS.Hotbar10).toEqual(['Digit0']);           // :2098 D0
    expect(DEFAULT_KEYBINDS.ViewZoomOut).toEqual(['Minus']);         // :2099 OemMinus
    expect(DEFAULT_KEYBINDS.ViewZoomIn).toEqual(['Equal']);          // :2100 OemPlus
    expect(DEFAULT_KEYBINDS.ToggleCreativeMenu).toEqual(['KeyC']);   // :2101
    expect(DEFAULT_KEYBINDS.Loadout1).toEqual(['F1']);               // :2102-2104
    expect(DEFAULT_KEYBINDS.Loadout2).toEqual(['F2']);
    expect(DEFAULT_KEYBINDS.Loadout3).toEqual(['F3']);
    expect(DEFAULT_KEYBINDS.ToggleCameraMode).toEqual(['F4']);       // :2105
    // 本仓刻意偏差（超集备案,DEFAULT_KEYBINDS 注逐条）：WASD+方向键 / ControlRight
    expect(DEFAULT_KEYBINDS.Up).toEqual(['KeyW', 'ArrowUp']);
    expect(DEFAULT_KEYBINDS.Down).toEqual(['KeyS', 'ArrowDown']);
    expect(DEFAULT_KEYBINDS.Left).toEqual(['KeyA', 'ArrowLeft']);
    expect(DEFAULT_KEYBINDS.Right).toEqual(['KeyD', 'ArrowRight']);
    expect(DEFAULT_KEYBINDS.Jump).toEqual(['Space']);
    expect(DEFAULT_KEYBINDS.SmartCursor).toEqual(['ControlLeft', 'ControlRight']);
    // 原版 Keyboard 档不绑的 trigger = 缺省空表
    expect(DEFAULT_KEYBINDS.HotbarMinus).toEqual([]);
    expect(DEFAULT_KEYBINDS.HotbarPlus).toEqual([]);
    expect(DEFAULT_KEYBINDS.PreviousLoadout).toEqual([]);
    expect(DEFAULT_KEYBINDS.NextLoadout).toEqual([]);
  });

  it('①路由：E=钩爪、Esc=背包（原版 :2074-2075 键面互换回正）', () => {
    expect(isBound('Grapple', 'KeyE')).toBe(true);
    expect(isBound('Inventory', 'KeyE')).toBe(false);
    expect(isBound('Inventory', 'Escape')).toBe(true);
    expect(actionsForCode('KeyE')).toEqual(['Grapple']);
    expect(actionsForCode('Escape')).toEqual(['Inventory']);
    // 自定义压缺省：用户改绑 E 后 E 不再是钩爪
    options.data.keybinds = { Grapple: ['KeyG'] };
    expect(isBound('Grapple', 'KeyE')).toBe(false);
    expect(isBound('Grapple', 'KeyG')).toBe(true);
    options.data.keybinds = {};
  });

  it('①迁移卫门：旧档"与旧缺省全等"的条目摘除→落新缺省;真自定义不丢', () => {
    // 旧默认 Inventory=['Escape','KeyE'] 原样落盘的旧档 → 摘除 = 回新默认
    expect(migrateLegacyDefaults({ Inventory: ['Escape', 'KeyE'] })).toEqual({});
    // 真自定义（子集/超集/异键）原样保留
    expect(migrateLegacyDefaults({ Inventory: ['KeyE'] })).toEqual({ Inventory: ['KeyE'] });
    expect(migrateLegacyDefaults({ Inventory: ['Escape', 'KeyE', 'KeyB'] }))
      .toEqual({ Inventory: ['Escape', 'KeyE', 'KeyB'] });
    expect(migrateLegacyDefaults({ Grapple: ['KeyG'] })).toEqual({ Grapple: ['KeyG'] });
    // 旧缺省空表（Grapple=[]）与反选解绑同态：保留（空表语义=无绑定,新缺省 E
    // 只对【没有该键】的存档生效——显式解绑是用户意志,不覆盖）
    expect(migrateLegacyDefaults({ Grapple: [] })).toEqual({ Grapple: [] });
    // 无关 action 透传;迁移后 bindsOf 落新缺省
    expect(migrateLegacyDefaults({ Jump: ['KeyZ'] })).toEqual({ Jump: ['KeyZ'] });
    const migrated = migrateLegacyDefaults({ Inventory: ['Escape', 'KeyE'] });
    options.data.keybinds = migrated;
    expect(bindsOf('Inventory')).toEqual(DEFAULT_KEYBINDS.Inventory);
    options.data.keybinds = {};
  });
});

describe('SW-BN2 ②Esc 链决策核（resolveEscapeChain;原版锚=Player.cs:4961 ToggleInv;SW-BN3 对齐原版重钉）', () => {
  const base: EscapeChainState = {
    summonOpen: false, fullMapOpen: false, settingsOpen: false, pauseOpen: false,
    npcDialogActive: false, signDialogActive: false, uiBlocking: false,
    inventoryOpen: false, dead: false,   // SW-RB6b 2026-09-07 补死亡态字段
  };
  const s = (over: Partial<EscapeChainState>): EscapeChainState => ({ ...base, ...over });
  const ALL_INTENTS = ['escape', 'inventory', 'pause'] as const;

  it('互斥面板优先序 1:1（summon→map→pause→对话→路牌）,任一 intent 同向', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ summonOpen: true }), intent)).toBe('closeSummon');
      expect(resolveEscapeChain(s({ fullMapOpen: true }), intent)).toBe('closeFullMap');
      expect(resolveEscapeChain(s({ pauseOpen: true }), intent)).toBe('closePause');
      expect(resolveEscapeChain(s({ npcDialogActive: true }), intent)).toBe('closeNpcDialog');
      expect(resolveEscapeChain(s({ signDialogActive: true }), intent)).toBe('closeSign');
    }
  });

  it('模态让位支（uiBlocking→noop）：图鉴/手册等打开时 Esc 不落背包/暂停（原版 inFancyUI 支 :4987-4989）', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ uiBlocking: true }), intent)).toBe('noop');
      // 模态叠在背包上：同样让位,不关背包不调暂停
      expect(resolveEscapeChain(s({ uiBlocking: true, inventoryOpen: true }), intent)).toBe('noop');
    }
  });

  it('②SW-BN3 主链翻转：背包开着任意触发面=关背包（原版 else 支 :5026,无触发面区分）', () => {
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ inventoryOpen: true }), intent)).toBe('closeInventory');
    }
  });

  it('②无面板：Esc 面与背包面都开背包（原版 OpenInventory :5023-5025）;暂停钮面直达暂停', () => {
    expect(resolveEscapeChain(base, 'escape')).toBe('openInventory');
    expect(resolveEscapeChain(base, 'inventory')).toBe('openInventory');
    expect(resolveEscapeChain(base, 'pause')).toBe('openPause');
  });

  it('②Esc 开关循环（SW-BN3 对齐原版）：开背包→关背包→再开,无"Esc↔暂停"死循环', () => {
    let st = base;
    expect(resolveEscapeChain(st, 'escape')).toBe('openInventory');
    st = s({ inventoryOpen: true });                       // 开背包后
    expect(resolveEscapeChain(st, 'escape')).toBe('closeInventory');   // 二段=关背包
    st = base;                                             // 关背包后回无面板态
    expect(resolveEscapeChain(st, 'escape')).toBe('openInventory');    // 再按=再开
    // 浮层开着（经设置钮/暂停钮进入）→ Esc 只收浮层不动背包（closePause 执行器
    // 结构锁钉住）;收浮层后背包若开着,下一段 Esc 才关背包
    st = s({ inventoryOpen: true, pauseOpen: true });
    expect(resolveEscapeChain(st, 'escape')).toBe('closePause');
    expect(resolveEscapeChain(s({ inventoryOpen: true }), 'escape')).toBe('closeInventory');
  });

  it('SW-RB6b 死亡态：Inventory 沿改道暂停浮层开关（TryOpeningInGameOptions :17391-17410——'
    + 'UpdateDead :17187 调用,ToggleInv 整链不跑,永不开关背包）', () => {
    // 死亡无面板：Esc/绑键/暂停钮 → 开暂停浮层（原版 IngameOptions.Open）
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ dead: true }), intent)).toBe('openPause');
    }
    // 死亡 + 浮层已开 → 关（原版 ingameOptionsWindow ? Close : Open 的 Close 臂）
    expect(resolveEscapeChain(s({ dead: true, pauseOpen: true }), 'escape')).toBe('closePause');
    // 死亡 + 背包态字段为真（本仓死亡每 tick 强收,理论不可达）→ 仍不落背包
    expect(resolveEscapeChain(s({ dead: true, inventoryOpen: true }), 'escape')).toBe('openPause');
  });

  it('SW-RB6b 死亡态：Inventory 沿改道暂停浮层开关（TryOpeningInGameOptions :17391-17410——'
    + 'UpdateDead :17187 调用,ToggleInv 整链不跑,永不开关背包）', () => {
    // 死亡无面板：Esc/绑键/暂停钮 → 开暂停浮层（原版 IngameOptions.Open）
    for (const intent of ALL_INTENTS) {
      expect(resolveEscapeChain(s({ dead: true }), intent)).toBe('openPause');
    }
    // 死亡 + 浮层已开 → 关（原版 ingameOptionsWindow ? Close : Open 的 Close 臂）
    expect(resolveEscapeChain(s({ dead: true, pauseOpen: true }), 'escape')).toBe('closePause');
    // 死亡 + 背包态字段为真（本仓死亡每 tick 强收,理论不可达）→ 仍不落背包
    expect(resolveEscapeChain(s({ dead: true, inventoryOpen: true }), 'escape')).toBe('openPause');
  });
});

describe('SW-BN2 ④未绑项绑定流（CheckRebindingProcessKeyboard :1643-1660 语义）', () => {
  it('空表 action（HotbarMinus）可录入：写入单键表并生效', () => {
    expect(bindsOf('HotbarMinus')).toEqual([]);
    let map = assignBinding(options.data.keybinds, 'HotbarMinus', 'KeyK');
    options.data.keybinds = map;
    expect(map.HotbarMinus).toEqual(['KeyK']);
    expect(bindsOf('HotbarMinus')).toEqual(['KeyK']);
    expect(isBound('HotbarMinus', 'KeyK')).toBe(true);
    // 反选=回空表（合法无绑定态,存活读档）
    map = assignBinding(map, 'HotbarMinus', 'KeyK');
    options.data.keybinds = map;
    expect(map.HotbarMinus).toEqual([]);
    expect(bindsOf('HotbarMinus')).toEqual([]);
    options.data.keybinds = {};
  });

  it('Inventory 保护名单（FixDerpedRebinds :1399-1417）：解绑成空回默认,不悬空', () => {
    let map = assignBinding({ Inventory: ['KeyB'] }, 'Inventory', 'KeyB');
    expect(map.Inventory).toEqual(DEFAULT_KEYBINDS.Inventory);
  });
});

describe('SW-BN2 ③操作说明/欢迎语标注活绑表驱动', () => {
  it('keybindHintLabel 读 bindsOf：缺省/改绑/未绑三态跟随', () => {
    expect(keybindHintLabel('Jump')).toEqual(keybindCodeLabel('Space'));
    expect(keybindHintLabel('Inventory')).toEqual('Esc');
    expect(keybindHintLabel('Left')).toEqual('A / ←');
    // 改绑即跟随
    options.data.keybinds = { Jump: ['KeyZ'], Inventory: ['KeyB'] };
    expect(keybindHintLabel('Jump')).toEqual('Z');
    expect(keybindHintLabel('Inventory')).toEqual('B');
    options.data.keybinds = {};
    // 未绑 = 未绑定文案（l10n 未加载时回退键名本身——测试环境无语言包,断言回退形态）
    expect(keybindHintLabel('HotbarMinus')).toBe('Mods.SandboxWorld.UI.ManualUnbound');
  });

  it('方向键显示名字形（ArrowLeft→←）', () => {
    expect(keybindCodeLabel('ArrowLeft')).toBe('←');
    expect(keybindCodeLabel('ArrowUp')).toBe('↑');
    expect(keybindCodeLabel('KeyE')).toBe('E');
    expect(keybindCodeLabel('Escape')).toBe('Esc');
  });
});

describe('SW-BN2 结构锁（源文本锚,防执行器/接线静默回退）', () => {
  const read = (p: string): string => readFileSync(`${srcRoot}/${p}`, 'utf8');

  it('main.ts 执行器挂 resolveEscapeChain 决策核,closePause=closeInGamePause 统一出口（SW-BN3 :4978-4986;★SW-RB8c 勘误:Close 置 playerInventory=true IngameOptions.cs:108=收浮层回背包）', () => {
    const main = read('main.ts');
    expect(main).toContain("from './ui/escapeChain'");
    expect(main).toContain('resolveEscapeChain({');
    const closePause = /case 'closePause':[\s\S]*?break;/.exec(main)?.[0] ?? '';
    expect(closePause).not.toContain('ui.closeInventory()');   // 「收两层」退役不变（:108 是回背包非关背包）
    expect(closePause).toContain('closeInGamePause(game)');
  });

  it('SW-BN3 背包内设置钮在位（原版 playerInventory 态设置入口 Main.cs:46287-46301）', () => {
    const main = read('main.ts');
    const ui = read('ui/UI.ts');
    expect(ui).toContain('onPauseMenu?: () => void');
    expect(ui).toContain("Lang.text('LegacyInterface.62')");   // 官译 "Settings/设置"
    // 接线 = 开/收 toggle（clickAction = ingameOptionsWindow ? Close : Open :46294-46299）
    expect(main).toContain('ui.onPauseMenu = () => {');
    expect(main).toContain('openInGamePause(g);');
  });

  it('物理 Esc 面仍由 Inventory 绑定表驱动（isBound 门在 main.ts 键盘链）', () => {
    const main = read('main.ts');
    expect(main).toContain("runInventoryEscapeChain(game, e.code === 'Escape' ? 'escape' : 'inventory')");
  });

  it('MobileControls 暂停钮 intent= pause（三态化后直达暂停面）', () => {
    const mc = read('ui/MobileControls.ts');
    expect(mc).toContain("tapVirtual('Inventory', { virtualIntent: 'pause' })");
    expect(mc).not.toContain("{ virtualIntent: 'escape' }");
  });

  it('欢迎语四段标注全部走活绑表（keybindHintLabel/ManualUnbound 兜底）', () => {
    const mf = read('mainFlow.ts');
    expect(mf).toContain("keybindHintLabel('Left')");
    expect(mf).toContain("keybindHintLabel('Jump')");
    expect(mf).toContain("keybindHintLabel('Inventory')");
    expect(mf).toContain("isBound('Inventory', 'Escape')");
  });

  it('语言替换表键名标注活绑表驱动（Grapple/QuickEquip 同源 Grapple trigger,Lang.cs:150-151）', () => {
    const lm = read('i18n/LanguageManager.ts');
    expect(lm).toContain("triggerAction('Grapple')");
    expect(lm).toContain("triggerAction('SmartCursor')");
    expect(lm).toContain("triggerAction('SmartSelect')");
    expect(lm).toContain("triggerAction('QuickMount')");
    expect(lm).not.toMatch(/k\('E'\)/);          // 硬编码 E 已退役（E=Grapple 现读绑表）
    expect(lm).not.toMatch(/k\('R'\)/);          // 硬编码 R 已退役（QuickMount 现读绑表）
    expect(lm).toContain('GenerateRawInputList'); // 原版空表/连接语义锚在注
  });

  it('escapeChain.ts 原版行号锚在位（ToggleInv/TryOpeningInGameOptions/CanPauseGame/SettingsButton）', () => {
    const ec = read('ui/escapeChain.ts');
    expect(ec).toContain('Player.cs:4961');
    expect(ec).toContain('17391');
    expect(ec).toContain('Main.cs:17493');   // SW-BN3 正锚：CanPauseGame 1457 实测行
    expect(ec).toContain('Main.cs:46287');
    expect(ec).toContain('5023-5025');
    expect(ec).toContain('5026');            // else 支关背包（SW-BN3 主链语义）
  });
});
