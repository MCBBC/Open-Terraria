// 键位绑定表（M5）：Terraria.GameInput/PlayerInput.cs:214 KnownTriggers 的键盘子集。
// 手柄 Trigger（DpadRadial1-4/DpadSnap1-4/RadialHotbar/RadialQuickbar/LockOn/
// MenuUp-Right/ArmorSetAbility/Dash）与鼠标键（MouseLeft/MouseRight=Input 硬编码）
// Web 版不做（声明）；Throw 原版 1.4 键盘档无默认绑定且行为已由背包拖出承担，不入表。
//
// 默认值 = 原版 Redigit 预设 Keyboard 档（PlayerInput.cs:1885-1937），个别 action
// 与本仓既有硬编码对齐（注释逐条标注）——重绑前行为与迁移前 100% 一致。
// 重绑语义 = PlayerInput.CheckRebindingProcessKeyboard（:1495-1513）：
//   监听中按下的键已在本 action 列表 → 移除（反选解绑，允许清成空表=键无功能）；
//   否则整表替换为 [新键]。FixDerpedRebinds（:1399-1417）只保护
//   MouseLeft/MouseRight/Inventory 三键（空表回默认 ResetKeyBinding）——鼠标两键
//   本仓硬编码在 Input（声明不可重绑），故保护名单只剩 Inventory。
import { options } from './Options';
import { Lang } from '../i18n/Lang';

export type KeybindAction =
  | 'Up' | 'Down' | 'Left' | 'Right' | 'Jump'
  | 'Inventory' | 'Grapple' | 'SmartSelect' | 'SmartCursor' | 'QuickMount'
  | 'QuickHeal' | 'QuickMana' | 'QuickBuff'
  | 'Hotbar1' | 'Hotbar2' | 'Hotbar3' | 'Hotbar4' | 'Hotbar5'
  | 'Hotbar6' | 'Hotbar7' | 'Hotbar8' | 'Hotbar9' | 'Hotbar10'
  | 'HotbarMinus' | 'HotbarPlus'
  | 'MapFull' | 'MapStyle' | 'MapZoomIn' | 'MapZoomOut' | 'MapAlphaUp' | 'MapAlphaDown'
  | 'ViewZoomIn' | 'ViewZoomOut'
  | 'Loadout1' | 'Loadout2' | 'Loadout3' | 'PreviousLoadout' | 'NextLoadout'
  | 'ToggleCreativeMenu' | 'ToggleCameraMode';

/** 设置面板"控制"页行序（原版 UIManageControls 分组序：移动→功能→热键栏→地图→视角→配装→杂项） */
export const KEYBIND_ACTIONS: readonly KeybindAction[] = [
  'Up', 'Down', 'Left', 'Right', 'Jump',
  'Inventory', 'Grapple', 'SmartSelect', 'SmartCursor', 'QuickMount',
  'QuickHeal', 'QuickMana', 'QuickBuff',
  'Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5', 'Hotbar6',
  'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10', 'HotbarMinus', 'HotbarPlus',
  'MapFull', 'MapStyle', 'MapZoomIn', 'MapZoomOut', 'MapAlphaUp', 'MapAlphaDown',
  'ViewZoomIn', 'ViewZoomOut',
  'Loadout1', 'Loadout2', 'Loadout3', 'PreviousLoadout', 'NextLoadout',
  'ToggleCreativeMenu', 'ToggleCameraMode',
];

/**
 * 默认绑定（PlayerInput.cs:1885-1937 Keyboard 档）。
 * 与本仓迁移前硬编码的差异仅在注释标注处：
 * - Up/Down/Left/Right 含方向键：本仓既有行为（原版 KeyboardUI 档同为 W+↑ 双绑定，
 *   Keyboard 档纯 WASD）；Inventory 含 KeyE：本仓既有行为（原版仅 Escape，E=Grapple）；
 * - Grapple 默认空：原版默认 E 与本仓 E=物品栏冲突，用户可自行腾挪；
 * - MapZoomIn/Out 默认小键盘 +/-（原版 Add/Subtract），全屏地图打开时缩放地图，
 *   关闭时回落视野缩放（保持迁移前 Equal/NumpadAdd 双缩放视野的行为）；
 * - ToggleCameraMode 默认 F4（原版 PlayerInput.cs:1926）——调试键（全图迷雾
 *   消除）已迁 Shift+F4 让位（2026-08-20；scripts/_fog*-probe.mjs 均直接调
 *   world API 不按键,无探针破坏）。
 */
export const DEFAULT_KEYBINDS: Record<KeybindAction, readonly string[]> = {
  Up: ['KeyW', 'ArrowUp'],
  Down: ['KeyS', 'ArrowDown'],
  Left: ['KeyA', 'ArrowLeft'],
  Right: ['KeyD', 'ArrowRight'],
  Jump: ['Space'],
  Inventory: ['Escape', 'KeyE'],
  Grapple: [],
  SmartSelect: ['ShiftLeft'],
  SmartCursor: ['ControlLeft', 'ControlRight'],
  QuickMount: ['KeyR'],
  QuickHeal: ['KeyH'],
  QuickMana: ['KeyJ'],
  QuickBuff: ['KeyB'],
  Hotbar1: ['Digit1'],
  Hotbar2: ['Digit2'],
  Hotbar3: ['Digit3'],
  Hotbar4: ['Digit4'],
  Hotbar5: ['Digit5'],
  Hotbar6: ['Digit6'],
  Hotbar7: ['Digit7'],
  Hotbar8: ['Digit8'],
  Hotbar9: ['Digit9'],
  Hotbar10: ['Digit0'],
  HotbarMinus: [],
  HotbarPlus: [],
  MapFull: ['KeyM'],
  MapStyle: ['Tab'],
  MapZoomIn: ['NumpadAdd'],
  MapZoomOut: ['NumpadSubtract'],
  MapAlphaUp: ['PageUp'],
  MapAlphaDown: ['PageDown'],
  ViewZoomIn: ['Equal'],
  ViewZoomOut: ['Minus'],
  Loadout1: ['F1'],
  Loadout2: ['F2'],
  Loadout3: ['F3'],
  PreviousLoadout: [],
  NextLoadout: [],
  ToggleCreativeMenu: ['KeyC'],
  ToggleCameraMode: ['F4'],
};

const ACTION_SET: ReadonlySet<string> = new Set(KEYBIND_ACTIONS);

/** 读当前生效绑定（用户自定义优先；无自定义条目=默认；自定义空表=无绑定——
 *  CheckRebindingProcessKeyboard 反选清空的合法态，isBound 恒 false）。
 *  返回只读引用，勿原地改 */
export function bindsOf(action: KeybindAction): readonly string[] {
  const custom = options.data.keybinds?.[action];
  if (Array.isArray(custom)) return custom;
  return DEFAULT_KEYBINDS[action];
}

/** code 是否触发 action */
export function isBound(action: KeybindAction, code: string): boolean {
  return bindsOf(action).includes(code);
}

/** 反查：一个物理键当前触发哪些 action（原版允许一键多 action） */
export function actionsForCode(code: string): KeybindAction[] {
  const out: KeybindAction[] = [];
  for (const a of KEYBIND_ACTIONS) if (bindsOf(a).includes(code)) out.push(a);
  return out;
}

/** 持久化清洗：只留已知 action 的字符串数组，去空串/去重；空表原样保留
 *  （=反选解绑的无绑定态，跨读档存活；Options.load 用） */
export function sanitizeKeybinds(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACTION_SET.has(k) || !Array.isArray(v)) continue;
    const codes = [...new Set(v.filter((c): c is string => typeof c === 'string' && c.length > 0))];
    out[k] = codes;
  }
  return out;
}

/**
 * 重绑（CheckRebindingProcessKeyboard :1495-1513 + FixDerpedRebinds :1399-1417）：
 * 键已在本 action → 移除（反选）；否则替换整表为 [code]。反选清空后【保留空表】
 * （=该 action 无任何键，downAction 恒 false，设置页显示 Lang.menu(195) "<未绑定>"）；
 * 仅 FixDerpedRebinds 保护名单（本仓键位表内=Inventory；MouseLeft/MouseRight 为
 * Input 硬编码不入表）空表回默认（原版 ResetKeyBinding）。
 * @returns 新绑定表（不修改 options；调用方 options.set('keybinds', …) 持久化）
 */
export function assignBinding(
  map: Record<string, string[]>, action: KeybindAction, code: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const k of Object.keys(map)) next[k] = [...map[k]];
  const cur = next[action] ?? [...bindsOf(action)];
  const idx = cur.indexOf(code);
  const result = idx >= 0 ? cur.filter((c) => c !== code) : [code];
  if (result.length > 0) next[action] = result;
  else if (action === 'Inventory') next[action] = [...DEFAULT_KEYBINDS.Inventory];
  else next[action] = [];     // 空表=无绑定（勿 delete——删除=回默认）
  return next;
}

/** 单项恢复默认 */
export function resetBinding(map: Record<string, string[]>, action: KeybindAction): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const k of Object.keys(map)) next[k] = [...map[k]];
  delete next[action];
  return next;
}

/** 全部恢复默认（清空自定义表） */
export function resetAllKeybinds(): Record<string, string[]> {
  return {};
}

/** action 显示名（UIKeybindingListItem.GetFriendlyName :120-186 的 Lang 键 1:1） */
export function keybindActionLabel(action: KeybindAction): string {
  const menuIdx: Partial<Record<KeybindAction, number>> = {
    Up: 148, Down: 149, Left: 150, Right: 151, Jump: 152,
    Inventory: 154, Grapple: 155, SmartSelect: 160, SmartCursor: 161,
    QuickMount: 158, QuickHeal: 159, QuickMana: 156, QuickBuff: 157,
    MapZoomIn: 168, MapZoomOut: 169, MapAlphaUp: 171, MapAlphaDown: 170,
    MapFull: 173, MapStyle: 172,
    Hotbar1: 176, Hotbar2: 177, Hotbar3: 178, Hotbar4: 179, Hotbar5: 180,
    Hotbar6: 181, Hotbar7: 182, Hotbar8: 183, Hotbar9: 184, Hotbar10: 185,
    HotbarMinus: 174, HotbarPlus: 175,
  };
  const uiKey: Partial<Record<KeybindAction, string>> = {
    ViewZoomIn: 'UI.ZoomIn', ViewZoomOut: 'UI.ZoomOut',
    ToggleCreativeMenu: 'UI.ToggleCreativeMenu',
    Loadout1: 'UI.Loadout1', Loadout2: 'UI.Loadout2', Loadout3: 'UI.Loadout3',
    NextLoadout: 'UI.NextLoadout', PreviousLoadout: 'UI.PreviousLoadout',
    ToggleCameraMode: 'UI.ToggleCameraMode',
  };
  if (menuIdx[action] != null) return Lang.menu(menuIdx[action]!);
  if (uiKey[action]) return Lang.text(uiKey[action]!);
  return action;
}

/** 物理键显示名：KeyX→X / DigitN→N / 修饰键用 Controls.* 官译，其余原样（原版即显示原始键名） */
export function keybindCodeLabel(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === 'ShiftLeft') return Lang.text('Controls.Shift');
  if (code === 'ControlLeft') return Lang.text('Controls.Control');
  if (code === 'ShiftRight') return `R·${Lang.text('Controls.Shift')}`;
  if (code === 'ControlRight') return `R·${Lang.text('Controls.Control')}`;
  if (code === 'Escape') return 'Esc';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code === 'NumpadAdd') return 'Num+';
  if (code === 'NumpadSubtract') return 'Num-';
  return code;
}
