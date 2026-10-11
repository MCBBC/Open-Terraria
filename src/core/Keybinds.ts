// 键位绑定表（M5）：Terraria.GameInput/PlayerInput.cs:229-237 KnownTriggers 的键盘子集。
// 手柄 Trigger（DpadRadial1-4/DpadSnap1-4/RadialHotbar/RadialQuickbar/LockOn/
// MenuUp-Right/ArmorSetAbility）与鼠标键（MouseLeft/MouseRight=Input 硬编码）
// Web 版不做（声明）；Throw 原版 1.4 键盘档无默认绑定且行为已由背包拖出承担，不入表。
// ★BJ508（2026-10-04）：Dash 补入——原版键盘控制页本就有 Dash 可绑行
//（UIManageControls.AssembleBindPanels :277-281 键盘页序列 ToggleCameraMode→
// ArmorSetAbility→Dash→sp20），仅缺省无键（PlayerInput.cs:2069-2108 Redigit
// Keyboard 档无 Dash 条目,重绑面板自绑）；旧头注「手柄 Trigger 不做」含 Dash 系误判。
//
// 默认值 = 原版 Redigit 预设 Keyboard 档（PlayerInput.cs:2062-2140；SW-BN2 2026-09-07
// 起逐项对齐,含 Inventory=Escape / Grapple=E 回原版——旧默认迁出卫门见
// migrateLegacyDefaults）,个别刻意偏差在 DEFAULT_KEYBINDS 注释逐条标注。
// 重绑语义 = PlayerInput.CheckRebindingProcessKeyboard（:1495-1513）：
//   监听中按下的键已在本 action 列表 → 移除（反选解绑，允许清成空表=键无功能）；
//   否则整表替换为 [新键]。FixDerpedRebinds（:1399-1417）只保护
//   MouseLeft/MouseRight/Inventory 三键（空表回默认 ResetKeyBinding）——鼠标两键
//   本仓硬编码在 Input（声明不可重绑），故保护名单只剩 Inventory。
//
// ★SW-FX16 2026-09-10 持久化载体定谳：原版键位存档 = 独立本地文件
//   "input profiles.json"（Preferences，Main.cs:67488；PlayerInput.Save/Load
//   PlayerInput.cs:768-777/:779-817），非 .plr、非 config.json——config.json 的
//   Key* 散位段只在旧版迁移时读（version≤162，Main.cs:4673-4715；重置面
//   Main.ResetKeyBindings :53257-53273 只复位那批 c* 遗留字段）。本仓载体 =
//   options.json（sandboxworld.options，KvStore）——同为「本地配置、跨世界存续」
//   语义（适配登记）；migrateLegacyDefaults 对齐 PlayerInputProfile.Load 的
//   Last-Launched-Version 版本闸迁移（:114-142 <190/218/227/265 逐段补缺省）。
//   KeyConfiguration.WritePreferences(:84-91) 强制 MouseLeft/Inventory 非空的
//   保护在本仓由 assignBinding 的 Inventory 保护臂承担（鼠标两键不入表）。
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
  | 'ToggleCreativeMenu' | 'ToggleCameraMode' | 'Dash';

/** 设置面板"控制"页行序（原版 UIManageControls 分组序：移动→功能→热键栏→地图→视角→配装→杂项；
 *  ★BJ508：Dash 尾位 = 原版键盘页 :277-281 序 ToggleCameraMode→ArmorSetAbility→Dash——
 *  ArmorSetAbility 手柄 trigger 本仓不入表,Dash 顶其尾位） */
export const KEYBIND_ACTIONS: readonly KeybindAction[] = [
  'Up', 'Down', 'Left', 'Right', 'Jump',
  'Inventory', 'Grapple', 'SmartSelect', 'SmartCursor', 'QuickMount',
  'QuickHeal', 'QuickMana', 'QuickBuff',
  'Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5', 'Hotbar6',
  'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10', 'HotbarMinus', 'HotbarPlus',
  'MapFull', 'MapStyle', 'MapZoomIn', 'MapZoomOut', 'MapAlphaUp', 'MapAlphaDown',
  'ViewZoomIn', 'ViewZoomOut',
  'Loadout1', 'Loadout2', 'Loadout3', 'PreviousLoadout', 'NextLoadout',
  'ToggleCreativeMenu', 'ToggleCameraMode', 'Dash',
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
  // ★BJ508：Dash 缺省空表 = 原版 Keyboard 档不绑（PlayerInput.cs:2069-2108 Redigit
  //   Keyboard 无 Dash 条目,四预设全输入档均无 :2062-2450）——玩家在控制页自绑后
  //   经 controlDash/releaseDash 键面参与冲刺（DoCommonDashHandle :21738-21747）
  Dash: [],
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

/** 快捷栏槽位键的 action 名（Hotbar1..Hotbar10 = 槽 0..9；原版 trigger 全集见
 *  PlayerInput.cs:233-234，缺省 D1..D0 = PlayerInput.cs:2091-2100） */
const HOTBAR_SLOT_ACTIONS: readonly KeybindAction[] = [
  'Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5',
  'Hotbar6', 'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10',
];

/**
 * 快捷栏槽位查键（★SW-FX16 2026-09-10 消费面收口）：Hotbar1..Hotbar10 逐位走活绑表
 * ——原版数字切栏消费的就是可重绑 trigger（Player.cs:25286-25330 读
 * Triggers.Current.Hotbar1..Hotbar10），不是硬编码 Digit1-0；此前仓库 regex
 * `/^Digit([0-9])$/` 在用户改绑/解绑后仍按物理数字键切栏 = 与原版劈叉。
 * ★SW-RB11f F5：命中取【最后一个】匹配槽（原版 :25289-25330 十连 if 顺序覆写
 * num7——一键绑多 Hotbar action 时高槽号后写胜出;旧 early-return 首中 = 低槽号
 * 劈叉）。返回槽位 0-9；无命中 null（含该槽被显式解绑/绑定到别的键——原版同：
 * trigger 不含该键即不触发）。
 */
export function hotbarSlotOfCode(code: string): number | null {
  let hit: number | null = null;
  for (let i = 0; i < HOTBAR_SLOT_ACTIONS.length; i++) {
    if (bindsOf(HOTBAR_SLOT_ACTIONS[i]).includes(code)) hit = i;
  }
  return hit;
}

/** 持久化清洗：只留已知 action 的字符串数组，去空串/去重；空表原样保留
 *  （=反选解绑的无绑定态，跨读档存活；Options.load 用） */
export function sanitizeKeybinds(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // ★619-R3F10:mod: 前缀键放行(重绑 UI 未列=登记,但 persist 通路不能焊死)
    if (!k.startsWith('mod:') && !ACTION_SET.has(k)) continue;
    if (!Array.isArray(v)) continue;
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
    Dash: 'UI.Dash',   // ★BJ508：原版键位名官译（en "Dash"/zh-Hans "冲刺",Terraria
                       //   Localization.Content.*.json:419 UI 段——l10n-custom 已补 12 语言）
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

/** ★609:mod 键位注册表(action id=`mod:<modId>:<name>`;不入原版 KEYBIND_ACTIONS
 *  闭集——重绑 UI 行=登记;查询走 bindsOfMod=custom→default 回退) */
const MOD_KEYBINDS = new Map<string, readonly string[]>();   // id → 默认键

export function registerModKeybind(id: string, defaultKeys: readonly string[]): void {
  if (!id.startsWith('mod:')) throw new Error(`[keybinds] mod 键位 id 须 mod:<modId>:<name>: ${id}`);
  MOD_KEYBINDS.set(id, defaultKeys);
}

export function bindsOfMod(id: string): readonly string[] {
  const custom = options.data.keybinds?.[id];
  if (Array.isArray(custom)) return custom;
  return MOD_KEYBINDS.get(id) ?? [];
}
