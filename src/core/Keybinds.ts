// 键位绑定表（M5）：Terraria.GameInput/PlayerInput.cs:214 KnownTriggers 的键盘子集。
// 手柄 Trigger（DpadRadial1-4/DpadSnap1-4/RadialHotbar/RadialQuickbar/LockOn/
// MenuUp-Right/ArmorSetAbility/Dash）与鼠标键（MouseLeft/MouseRight=Input 硬编码）
// Web 版不做（声明）；Throw 原版 1.4 键盘档无默认绑定且行为已由背包拖出承担，不入表。
//
// 默认值 = 原版 Redigit 预设 Keyboard 档（PlayerInput.cs:2062-2140；SW-BN2 2026-09-07
// 起逐项对齐,含 Inventory=Escape / Grapple=E 回原版——旧默认迁出卫门见
// migrateLegacyDefaults）,个别刻意偏差在 DEFAULT_KEYBINDS 注释逐条标注。
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
 * 默认绑定（原版 Redigit 预设 Keyboard 档 = PlayerInput.cs:2062 Reset + :2066
 * PresetProfiles.Redigit + :2069 InputMode.Keyboard——SW-BN2 2026-09-07 逐项对齐：
 * Inventory=Escape（:2074）、Grapple=E（:2075）按用户令回原版；旧默认（Inventory
 * =Escape+KeyE / Grapple=空）经 migrateLegacyDefaults 一次性迁出，已存自定义不丢）。
 * 与原版 Keyboard 档仅存的刻意偏差（超集，不缩水）：
 * - Up/Down/Left/Right 含方向键（原版 KeyboardUI 档 :2182-2190 同为 W+↑ 双绑定，
 *   本仓无手柄 UI 档，方向键保留移动可达）；
 * - SmartCursor 含 ControlRight（原版仅 LeftControl :2077；右 Ctrl 为本仓既有
 *   便利位，非缩水不回收）；
 * - MapZoomIn/Out 默认小键盘 +/-（原版 Add/Subtract :2081-2082 同位），全屏地图
 *   打开时缩放地图，关闭时回落视野缩放（保持迁移前 Equal/NumpadAdd 双缩放视野）；
 * - HotbarMinus/Plus、Previous/NextLoadout 默认空 = 原版 Keyboard 档同样不绑
 *   （:2069-2140 无这些 trigger，用户可在设置页自绑）。
 */
export const DEFAULT_KEYBINDS: Record<KeybindAction, readonly string[]> = {
  Up: ['KeyW', 'ArrowUp'],
  Down: ['KeyS', 'ArrowDown'],
  Left: ['KeyA', 'ArrowLeft'],
  Right: ['KeyD', 'ArrowRight'],
  Jump: ['Space'],
  Inventory: ['Escape'],
  Grapple: ['KeyE'],
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

/**
 * ★SW-BN2 2026-09-07 旧档缺省迁移卫门（用户令#1：只动缺省,用户改绑不丢失）。
 * 本批缺省表对齐原版（Inventory 收回纯 Escape,PlayerInput.cs:2074;Grapple 缺省
 * 得 KeyE :2075——空表缺省无条目可比,不需迁移）。若某旧档曾把【当时的缺省值】
 * 原样落盘（老版本写穿/手改 options.json），该条会被 bindsOf 当"用户自定义"压住
 * 新缺省——与未自定义的存档行为劈叉。本函数把「自定义值 === 旧缺省值」的条目
 * 摘除（=回新缺省）；任何非旧缺省的真正自定义（Inventory:['KeyE'] 等）与显式
 * 空表（反选解绑的合法态）原样保留——显式解绑是用户意志,不覆盖。
 * Options.load 在 sanitizeKeybinds 后调用；纯函数供单测。
 */
export const LEGACY_KEYBIND_DEFAULTS: Partial<Record<KeybindAction, readonly string[]>> = {
  Inventory: ['Escape', 'KeyE'],   // SW-BN2 前旧默认
};

export function migrateLegacyDefaults(map: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    const legacy = LEGACY_KEYBIND_DEFAULTS[k as KeybindAction];
    if (legacy && v.length === legacy.length && legacy.every((c, i) => v[i] === c)) continue;
    next[k] = v;
  }
  return next;
}

/** 活绑表键名提示（操作说明/欢迎语数据驱动用,SW-BN2 用户令#3）：返回该 action
 *  当前绑定码的显示名 ' / ' 连接;空表 = "未绑定"官译（设置页 Lang.menu(195) 同源）。
 *  重绑后随 bindsOf 即时跟随 */
export function keybindHintLabel(action: KeybindAction): string {
  const codes = bindsOf(action);
  return codes.length ? codes.map(keybindCodeLabel).join(' / ') : Lang.text('Mods.SandboxWorld.UI.ManualUnbound');
}

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

/** 物理键显示名：KeyX→X / DigitN→N / 方向键→箭头字形（SW-BN2：缺省表含方向键,
 *  原始码 'ArrowLeft' 直出对玩家不可读）/ 修饰键用 Controls.* 官译，其余原样
 *  （原版即显示原始键名） */
export function keybindCodeLabel(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
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
