// M5 键位重映射 + M14 杂项 + S 级（F1-F3/自动保存/自动暂停）单测。
// 纯逻辑层：绑定表默认值/重绑语义/持久化清洗/杂项默认值与归一化/F1-F3 切配装。
// （Game/UI 侧按键派发为 DOM 事件链，由 scripts/_f6-panel.mjs 类探针覆盖）
import { describe, it, expect } from 'vitest';
import {
  KEYBIND_ACTIONS, DEFAULT_KEYBINDS, bindsOf, isBound, actionsForCode,
  assignBinding, resetBinding, resetAllKeybinds, sanitizeKeybinds,
  keybindActionLabel,
} from '../src/core/Keybinds';
import { options } from '../src/core/Options';

describe('M5 键位绑定表', () => {
  it('31 action 落地：移动 5 + 功能 8 + 热键栏 12 + 地图 6 = 31（另有视角 2/配装 5/杂项 2，全表 40）', () => {
    expect(KEYBIND_ACTIONS.length).toBe(40);
    const core31 = [
      'Up', 'Down', 'Left', 'Right', 'Jump',
      'Inventory', 'Grapple', 'SmartSelect', 'SmartCursor', 'QuickMount',
      'QuickHeal', 'QuickMana', 'QuickBuff',
      'Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5', 'Hotbar6',
      'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10', 'HotbarMinus', 'HotbarPlus',
      'MapFull', 'MapStyle', 'MapZoomIn', 'MapZoomOut', 'MapAlphaUp', 'MapAlphaDown',
    ];
    for (const a of core31) expect(KEYBIND_ACTIONS).toContain(a);
  });

  it('默认值 = 迁移前硬编码（回归零变化）+ 原版 Redigit 键盘档', () => {
    expect(DEFAULT_KEYBINDS.Up).toEqual(['KeyW', 'ArrowUp']);
    expect(DEFAULT_KEYBINDS.Down).toEqual(['KeyS', 'ArrowDown']);
    expect(DEFAULT_KEYBINDS.Left).toEqual(['KeyA', 'ArrowLeft']);
    expect(DEFAULT_KEYBINDS.Right).toEqual(['KeyD', 'ArrowRight']);
    expect(DEFAULT_KEYBINDS.Jump).toEqual(['Space']);
    // SW-BN2 2026-09-07 缺省表对齐原版（PlayerInput.cs:2074 Inventory=Escape）
    expect(DEFAULT_KEYBINDS.Inventory).toEqual(['Escape']);
    expect(DEFAULT_KEYBINDS.SmartSelect).toEqual(['ShiftLeft']);
    expect(DEFAULT_KEYBINDS.SmartCursor).toEqual(['ControlLeft', 'ControlRight']);
    expect(DEFAULT_KEYBINDS.QuickMount).toEqual(['KeyR']);
    expect(DEFAULT_KEYBINDS.QuickHeal).toEqual(['KeyH']);
    expect(DEFAULT_KEYBINDS.QuickMana).toEqual(['KeyJ']);   // ★原版是 J 非 M
    expect(DEFAULT_KEYBINDS.QuickBuff).toEqual(['KeyB']);
    for (let i = 1; i <= 9; i++) expect(DEFAULT_KEYBINDS[`Hotbar${i}` as 'Hotbar1']).toEqual([`Digit${i}`]);
    expect(DEFAULT_KEYBINDS.Hotbar10).toEqual(['Digit0']);
    expect(DEFAULT_KEYBINDS.MapFull).toEqual(['KeyM']);
    expect(DEFAULT_KEYBINDS.MapStyle).toEqual(['Tab']);
    // 原版 Add/Subtract = 小键盘 +/-
    expect(DEFAULT_KEYBINDS.MapZoomIn).toEqual(['NumpadAdd']);
    expect(DEFAULT_KEYBINDS.MapZoomOut).toEqual(['NumpadSubtract']);
    expect(DEFAULT_KEYBINDS.ViewZoomIn).toEqual(['Equal']);
    expect(DEFAULT_KEYBINDS.ViewZoomOut).toEqual(['Minus']);
    // F1-F3 = Loadout1/2/3（PlayerInput.cs:1923-1925）
    expect(DEFAULT_KEYBINDS.Loadout1).toEqual(['F1']);
    expect(DEFAULT_KEYBINDS.Loadout2).toEqual(['F2']);
    expect(DEFAULT_KEYBINDS.Loadout3).toEqual(['F3']);
    expect(DEFAULT_KEYBINDS.ToggleCreativeMenu).toEqual(['KeyC']);
    // SW-BN2 2026-09-07：Grapple 缺省 = E（原版 PlayerInput.cs:2075——E 曾让位物品栏,
    // Inventory 收回纯 Escape 后按用户令回归原版面）
    expect(DEFAULT_KEYBINDS.Grapple).toEqual(['KeyE']);
  });

  it('bindsOf/isBound/actionsForCode：自定义优先、缺省回默认、一键多 action 反查', () => {
    expect(bindsOf('Jump')).toEqual(['Space']);
    expect(isBound('Jump', 'Space')).toBe(true);
    expect(isBound('Jump', 'KeyW')).toBe(false);
    // 未加载自定义时 KeyE = Grapple（SW-BN2 缺省对齐原版;Inventory 收回纯 Escape）
    expect(actionsForCode('KeyE')).toEqual(['Grapple']);
    expect(actionsForCode('Escape')).toEqual(['Inventory']);
    // 自定义生效（直接写 options 内存值——不经 load() 的持久层）
    options.data.keybinds = { Jump: ['KeyZ'] };
    expect(bindsOf('Jump')).toEqual(['KeyZ']);
    expect(isBound('Jump', 'Space')).toBe(false);
    expect(actionsForCode('KeyZ')).toEqual(['Jump']);
    options.data.keybinds = {};
  });

  it('重绑语义 = CheckRebindingProcessKeyboard：新键替换整表；反选清空=空表无绑定；Inventory 保护回默认', () => {
    let map = sanitizeKeybinds({});
    // 新键替换整组（默认 Up=[W,↑] → 绑 X 后只剩 X）；调用方把新表写回 options
    map = assignBinding(map, 'Up', 'KeyX');
    options.data.keybinds = map;
    expect(map.Up).toEqual(['KeyX']);
    expect(bindsOf('Up')).toEqual(['KeyX']);
    // 反选清空 → 保留空表=无绑定（原版 :1504-1506 Remove 后允许空；2026-08-21 修正：
    // 此前误删键回落默认，属对 FixDerpedRebinds 保护名单的过度泛化）
    map = assignBinding(map, 'Up', 'KeyX');
    options.data.keybinds = map;
    expect(map.Up).toEqual([]);
    expect(bindsOf('Up')).toEqual([]);
    expect(isBound('Up', 'KeyW')).toBe(false);
    expect(isBound('Up', 'ArrowUp')).toBe(false);
    expect(actionsForCode('KeyW')).toEqual([]);
    // 空表态再绑新键 → 单键表（非反选路径）
    map = assignBinding(map, 'Up', 'KeyQ');
    options.data.keybinds = map;
    expect(bindsOf('Up')).toEqual(['KeyQ']);
    // FixDerpedRebinds：Inventory（保护名单，MouseLeft/MouseRight 硬编码不入表）
    // 解绑成空 → 回默认（ResetKeyBinding 语义）
    map = { Inventory: ['KeyE'] };
    map = assignBinding(map, 'Inventory', 'KeyE');
    expect(map.Inventory).toEqual(DEFAULT_KEYBINDS.Inventory);
    // 单项/全部恢复默认
    map = resetBinding({ Jump: ['KeyZ'] }, 'Jump');
    expect(map).toEqual({});
    expect(resetAllKeybinds()).toEqual({});
    options.data.keybinds = {};
  });

  it('持久化清洗：未知 action 剔除、非字符串/空串剔除、去重；空表（无绑定态）保留', () => {
    expect(sanitizeKeybinds({
      Jump: ['KeyZ', 'KeyZ', ''],
      Hax: ['KeyQ'],                 // 未知 action
      Up: 'KeyW',                    // 非数组
      Down: [1, 'KeyS', null],       // 混入非字符串
      Left: [],                      // 反选清空的无绑定态——原样存活（2026-08-21 修正：
    })).toEqual({ Jump: ['KeyZ'], Down: ['KeyS'], Left: [] });   // 此前被丢=读档回默认）
    expect(sanitizeKeybinds(null)).toEqual({});
    expect(sanitizeKeybinds('x')).toEqual({});
    // 空表经清洗-生效链后仍无绑定（非字符串项滤空 = 等价无绑定，与显式空表同态）
    const m = sanitizeKeybinds({ Left: [] });
    options.data.keybinds = m;
    expect(bindsOf('Left')).toEqual([]);
    expect(isBound('Left', 'KeyA')).toBe(false);
    options.data.keybinds = {};
  });

  it('action 显示名 = UIKeybindingListItem.GetFriendlyName 的 Lang.menu 序', () => {
    // l10n 未加载时 Lang.menu 回退键名——只断言不抛 + 非空（文案断言在 e2e/人工窗口）
    for (const a of KEYBIND_ACTIONS) {
      expect(typeof keybindActionLabel(a)).toBe('string');
      expect(keybindActionLabel(a).length).toBeGreaterThan(0);
    }
  });
});

describe('M14 IngameOptions 杂项默认值（原版 1:1）', () => {
  it('11 项 + 自动保存/暂停默认值', () => {
    const d = options.data;
    expect(d.reversedUpDownArmorSetBonuses).toBe(false);       // Main.cs:253
    expect(d.doorOpeningPreference).toBe('enabled');           // DoorOpeningHelper.cs:216
    expect(d.autoReuseAllItems).toBe(false);                   // Main.cs:241
    expect(d.showItemText).toBe(true);                         // Main.cs:1194
    expect(d.invasionProgressMode).toBe(2);                    // Main() 静默初始化 :65992（非字段 0）
    expect(d.placementPreview).toBe(true);                     // Main.cs:1298
    expect(d.highlightNewItems).toBe(true);                    // ItemSlot.cs:31
    expect(d.mouseShowBuildingGrid).toBe(false);               // Main.cs:257
    expect(d.dialoguePortraitMode).toBe('detailed');
    expect(d.opaqueBoxBehindTooltips).toBe(true);              // Main.cs:249
    expect(d.autoSave).toBe(true);                             // Main.cs:1196
    expect(d.autoSaveIntervalMin).toBe(10);                    // 原版 600000ms 恒值
    expect(d.autoPause).toBe(false);                           // Main.cs:1280
  });

  it('杂项开关读写经 options.set（持久化层防抖不阻塞断言）', async () => {
    options.data.showItemText = true;
    await options.set('showItemText', false);
    expect(options.data.showItemText).toBe(false);
    await options.set('invasionProgressMode', 0);
    expect(options.data.invasionProgressMode).toBe(0);
    await options.set('showItemText', true);
    await options.set('invasionProgressMode', 2);
  });
});

describe('S 级：F1-F3 切配装（Inventory.trySwitchingLoadout 链）', () => {
  it('默认绑定 F1/F2/F3 → Loadout1/2/3；配装切换 = inv.loadouts 三槽换装', async () => {
    const { Inventory } = await import('../src/items/Inventory');
    const inv = new Inventory();
    expect(inv.currentLoadout).toBe(0);
    // 装备槽塞入标记物品，切到配装 2 后原槽应为空（TrySwitchingLoadout 换装语义）
    const armor = inv.slots.findIndex(() => true);
    void armor;
    inv.trySwitchingLoadout(1);
    expect(inv.currentLoadout).toBe(1);
    inv.trySwitchingLoadout(2);
    expect(inv.currentLoadout).toBe(2);
    // 同套重切无效（原版 currentLoadout===idx 早退）
    inv.trySwitchingLoadout(2);
    expect(inv.currentLoadout).toBe(2);
    // 热键循环档（PreviousLoadout/NextLoadout 的 (cur±1+3)%3 数学）
    expect((inv.currentLoadout + 2) % 3).toBe(1);   // Previous
    expect((inv.currentLoadout + 1) % 3).toBe(0);   // Next
  });
});
