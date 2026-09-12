// 原版 1.4.5.7 modern 合成窗(NewCraftingUI)纯逻辑模块(SW-FX41 2026-09-12,UI 移债
// modern 窗族 P2-1..P2-4)——零 DOM,可 vitest 算术验证;DOM 消费面 = UI.ts vinvBuildModernCraft。
//
// 权威(1457 终值;1458 未触此域数值面):
// - Terraria.GameContent.UI/NewCraftingUI.cs:302-317(UIState 面板 (20,312) 490×(sh-350))/
//   :319-395(BuildInfinitesMenuContents:UIPanel Top38 内衬+文本+搜索条+网格容器+滚动条
//   +11 类筛选条)/:409-429(UpdateCraftAreaSize -77/UpdateText 搜索条宽=100%-文本-10)/
//   :431-501(DrawChildren 详情浮层 origin=面板+(24,73)/窗内切换钮 @(42,285)+就近箱钮
//   +40,旅程难度 +40 让位)/:503-543(HandleCraftSlot 点选=选中/已选可用=合成)/
//   :545-553(AddTooltipLines 材料不足行)/:555-561(DrawOwnedItemCount 拥有数)/
//   :575-587(ResetRecipes)/:589-647(UpdateContents/FitsFilter)/:655-665(Update→
//   CanRemainOpen 自动关窗)/:866-936(Close/Open/ToggleInInventory)/:907-924(OnActivate
//   预选+清筛选·搜索/OnDeactivate)/:938-964(OpenCloseFilter 四支+Matches 去重)/:966-970
// - Terraria.GameContent.Creative/ItemFilters.cs:16-69(BySearch tooltip 行检索)/
//   :71-104(BuildingBlock)/:106-132(Furniture)/:134-189(Tools+硬编码接受集)/
//   :191-212(Weapon)/:214-270(AArmor→Armor/Vanity)/:272-348(AAccessories→
//   Accessories/MiscAccessories)/:350-381(Consumables)/:406-441(MiscFallback 补集)/
//   :443-464(Materials)/:466-472(帧表 11×1 偏移-2)
// - Terraria.DataStructures/EntryFilterer.cs:30-55(FitsFilter:搜索 AND 门→激活集
//   任一过=过)/:57-68(ToggleFilter)
// - Terraria.GameContent.UI.Elements/UICreativeItemsInfiniteFilteringOptions.cs:36-74
//   (11 钮 40px 步距/tab 帧 2×4 offset-2-2/icon 帧 11×1 offset-2-0 Left6 VAlign.5)/
//   :81-101(singleFilterButtonClick=单选-可反选)/:103-114(UpdateVisuals 帧=激活|激活×2+悬停)
// - Terraria.GameContent.UI.Elements/UIScrollbar.cs:56-84(宽 20 padding 5,AutoHide)/
//   :78-84(GetHandleRectangle)/:109-180(滚轮/拖拽/点轨)/UIList.cs:109-115(滚轮
//   ViewPosition-=DeltaForUI);Terraria.UI/UserInterface.cs:219-222(ScrollWheelDeltaForUI
//   =ScrollWheelDelta PlayerInput.cs:902 ±120/notch)
// - Terraria.UI/CraftingUI.cs:267-330(DrawGridToggle——窗内锚位由 NewCraftingUI :486-499
//   传入 (42,285))/:336-356(DrawCraftFromNearbyChestsToggle)
// - Terraria/Player.cs:363(CraftingGridControl 缺省 Modern)+ :33555-33561
//   (InteractWithCraftingStation 模式分派)+ Main.cs:40727-40736(NPCChatText_
//   GuideReverseCrafting modern 支 NewCraftingUI.Open(quiet))/:42418-42456(DrawInventory
//   窗可见→DrawUI,else 经典列表+切换钮;PipsUseGrid 网格独立)/:17636-17639(DoScrolling
//   InInventory 窗可见→列表滚 flag=false)/:46438-46444(!playerInventory→NewCraftingUI
//   .Close(quiet))/:3035-3041(ChestOrShopUIVisible 含 !NewCraftingUI.Visible)
// - Item.cs:48687(material = ItemID.Sets.IsAMaterial[type];71-74/544/556/557/4076/4131/
//   5325 显式 false 覆写——均非配方原料,运行时等价)/:113(tileWand=-1 缺省)+ :11150/
//   :12149/:12162/:13889/:30698/:30711(tileWand 六件,提取器缺口手补)
// - TileID.cs:279(DoesNotOpenCraftingMenuOnInteract)/Main.tileFrameImportant(
//   本仓 VAN_TILE_FRAME_IMPORTANT)
// 坐标系 = .sw-vinv 原版 UI 逻辑空间(vanillaInvLayout 同源;sh = 视口高/K)。
import { VAN_TILE_FRAME_IMPORTANT } from '../world/gen/vanilla/VanillaTileFlags';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { itemCombat } from '../data/vanillaItemCombat';
import { vanillaStatOfVid } from '../data/vanillaItemStats';
import { equipKindOfVid } from '../data/vanillaEquip';
import whipsJson from '../data/vanilla-whips.json';
import { materialVids } from './itemTooltip';
import {
  craftPanelRect, craftDetailLayout,
  type CraftDetailLayout,
} from './vanillaInvLayout';
import type { CraftingTileFilter } from './craftingGrid';

// =====================================================================
// —— 颜色(Utils.cs:426-432 ShiftBlueToCyanTheme → :412-424 ShiftHue)——
// =====================================================================
/** XNA Main.rgbToHsl/hslToRgb 标准 HSL(h/s/l ∈ 0..1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 1) + 1) % 1) * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
/** Utils.cs:426-432:hue−0.04 / luminance+0.04 / saturation+0.2 */
export function shiftBlueToCyan(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb((((h - 0.04) % 1) + 1) % 1, s + 0.2, Math.min(1, l + 0.04));
}
function mulColor(r: number, g: number, b: number, a: number, k: number): [number, number, number, number] {
  // XNA Color*float:逐通道乘后截断(向零)
  return [Math.trunc(r * k), Math.trunc(g * k), Math.trunc(b * k), Math.trunc(a * k)];
}
function css(r: number, g: number, b: number, a = 255): string {
  return `rgba(${r},${g},${b},${a / 255})`;
}
// UIPanel 缺省底 (63,82,151)*0.7(UIPanel.cs:16)→ ShiftBlueToCyan(NewCraftingUI.cs:328)
// → *0.8(:330);边框 Black(:16)平移后仍黑 → *0.8(:331)
const [_br, _bg, _bb] = shiftBlueToCyan(44, 57, 105);
const [_pr, _pg, _pb, _pa] = mulColor(_br, _bg, _bb, 178, 0.8);
/** 窗体 UIPanel 底色(NewCraftingUI.cs:328-331) */
export const MCRAFT_PANEL_BG = css(_pr, _pg, _pb, _pa);
export const MCRAFT_PANEL_BORDER = css(0, 0, 0, 204);          // Black*0.8(:331)
const [_sr, _sg, _sb] = shiftBlueToCyan(80, 104, 191);          // (89,116,213)*0.9(:365)
/** 分隔线色(NewCraftingUI.cs:365)α 保留 0.9 档 */
export const MCRAFT_SEPARATOR_COLOR = css(_sr, _sg, _sb, 229);
const [_wr, _wg, _wb] = shiftBlueToCyan(35, 40, 83);            // 搜索盒底(UIWrappedSearchBar.cs:135)
/** 搜索盒面板底(UIWrappedSearchBar.cs:135,Red 主题 ShiftBlueToCyanTheme) */
export const MCRAFT_SEARCH_BG = css(_wr, _wg, _wb, 255);

// =====================================================================
// —— 11 类筛选(ItemFilters.cs + NewCraftingUI.cs:284-301)——
// =====================================================================
export type FilterKind =
  | 'weapon' | 'armor' | 'vanity' | 'buildingBlock' | 'furniture'
  | 'accessories' | 'miscAccessories' | 'consumables' | 'tools' | 'materials'
  | 'miscFallback';

/** 10 基类钮序(NewCraftingUI.cs:284-296 list 字面序)+ MiscFallback 尾补(:297-299)。
 *  icon = Infinite_Icons 帧(ItemFilters.GetImage;Weapon=Frame(11)=第 0 帧 :206) */
export const MCRAFT_FILTERS: ReadonlyArray<{ kind: FilterKind; l10n: string; icon: number }> = [
  { kind: 'weapon', l10n: 'CreativePowers.TabWeapons', icon: 0 },           // :191-212
  { kind: 'armor', l10n: 'CreativePowers.TabArmor', icon: 2 },              // :226-247
  { kind: 'vanity', l10n: 'CreativePowers.TabVanity', icon: 8 },            // :249-270
  { kind: 'buildingBlock', l10n: 'CreativePowers.TabBlocks', icon: 4 },     // :71-104
  { kind: 'furniture', l10n: 'CreativePowers.TabFurniture', icon: 7 },      // :106-132
  { kind: 'accessories', l10n: 'CreativePowers.TabAccessories', icon: 1 },  // :304-325
  { kind: 'miscAccessories', l10n: 'CreativePowers.TabAccessoriesMisc', icon: 9 },  // :327-348
  { kind: 'consumables', l10n: 'CreativePowers.TabConsumables', icon: 3 },  // :350-381
  { kind: 'tools', l10n: 'CreativePowers.TabTools', icon: 6 },              // :134-189
  { kind: 'materials', l10n: 'CreativePowers.TabMaterials', icon: 10 },     // :443-464
];
/** 第 11 钮 = MiscFallback(NewCraftingUI.cs:297-299;icon 同 Misc 第 5 帧 :434-440) */
export const MCRAFT_FALLBACK: { kind: FilterKind; l10n: string; icon: number } =
  { kind: 'miscFallback', l10n: 'CreativePowers.TabMisc', icon: 5 };
export const MCRAFT_ALL_BUTTONS: ReadonlyArray<{ kind: FilterKind; l10n: string; icon: number }> =
  [...MCRAFT_FILTERS, MCRAFT_FALLBACK];

/** Tools 硬编码接受集(ItemFilters.cs:136-144 字面照录,58 项) */
export const TOOL_ACCEPTED_IDS: ReadonlySet<number> = new Set([
  213, 5295, 509, 850, 851, 3612, 3625, 3611, 510, 849,
  3620, 1071, 1543, 1072, 1544, 1100, 1545, 50, 3199, 3124,
  5358, 5359, 5360, 5361, 5437, 1326, 5335, 3384, 4263, 4819,
  4262, 946, 4707, 205, 206, 207, 1128, 3031, 4820, 5302,
  5364, 4460, 4608, 4872, 3032, 5303, 5304, 1991, 4821, 3183,
  779, 5134, 1299, 4711, 4049, 114, 5667, 6174,
]);
/** tileWand 六件(Item.cs:113 缺省 -1;提取器缺口手补——Item.cs:11150/12149/12162/
 *  13889/30698/30711 逐锚) */
export const TILE_WAND_ITEMS: Readonly<Record<number, number>> = {
  832: 9, 932: 154, 933: 9, 1129: 1124, 3360: 620, 3361: 620,
};

/** 鞭伤表(vanilla-itemcombat 缺鞭族 damage——itemTooltip 同源补链) */
const WHIP_DMG: Readonly<Record<string, number>> =
  Object.fromEntries(Object.entries(whipsJson as Record<string, { dmg: number }>).map(([k, v]) => [k, v.dmg]));

/** 筛选判据输入视图(配方产物 vid 的 Item 画像,ItemFilters.FitsFilter 消费域) */
export interface FilterItem {
  vid: number;
  damage: number;             // entry.damage(:195)
  pick: number; axe: number; hammer: number; fishingPole: number;   // :148-163
  tileWand: number;           // -1 无(:77)
  createTile: number;         // -1 无(:83)
  createWall: number;         // -1 无(:75)
  frameImportant: boolean;    // Main.tileFrameImportant[createTile](:87/:115)
  armorSlot: number;          // head/body/leg ∈{0,1,2},非甲 -1(:218)
  vanity: boolean;            // entry.vanity(:220)
  accessory: boolean;         // entry.accessory(:287)
  miscEquipment: boolean;     // IsMiscEquipment(AAccessories.cs:294-301)
  consumable: boolean;        // entry.consumable(:360)
  material: boolean;          // entry.material = ItemID.Sets.IsAMaterial(Item.cs:48687)
  tooltipLines: string[];     // BySearch 检索域(:28-48 惰性,仅搜索激活时填充)
}

const _itemCache = new Map<number, FilterItem>();
const _wandOf = (vid: number): number => TILE_WAND_ITEMS[vid] ?? -1;

/** 由仓内数据面构建 vid 画像(缓存;tooltipLines 由调用侧惰性填充) */
export function filterItemOfVid(vid: number): FilterItem {
  const hit = _itemCache.get(vid);
  if (hit) return hit;
  const f = itemFuncOfVid(vid);
  const c = itemCombat(vid);
  const st = vanillaStatOfVid(vid);
  const kind = equipKindOfVid(vid);
  const createTile = f?.createTile ?? -1;
  const it: FilterItem = {
    vid,
    damage: c?.damage ?? (f?.damage ?? (WHIP_DMG[String(vid)] ?? 0)),
    pick: f?.pick ?? 0, axe: f?.axe ?? 0, hammer: f?.hammer ?? 0,
    fishingPole: f?.fishingPole ?? 0,
    tileWand: _wandOf(vid),
    createTile,
    createWall: f?.createWall ?? -1,
    frameImportant: createTile >= 0 && VAN_TILE_FRAME_IMPORTANT.has(createTile),
    armorSlot: st?.s === 'h' ? 0 : st?.s === 'b' ? 1 : st?.s === 'l' ? 2 : -1,
    vanity: st?.van === 1,
    accessory: st?.acc !== undefined,
    // IsMiscEquipment = mountType≠-1 ∪ lightPet ∪ vanityPet ∪ projHook[shoot]
    // ——vanilla-equip 判定表 1:1(mount·cart=mountType/pet·light=buffType→
    // Main.vanityPet·lightPet/hook=projHook;唯一非杂项类 = dye)
    miscEquipment: kind === 'mount' || kind === 'cart' || kind === 'hook' || kind === 'pet' || kind === 'light',
    consumable: !!(f?.consumable ?? c?.consumable),
    material: materialVids().has(vid),
    tooltipLines: [],
  };
  _itemCache.set(vid, it);
  return it;
}

const BASE_KINDS: readonly FilterKind[] = MCRAFT_FILTERS.map((f) => f.kind);

/** 单类判据(ItemFilters.cs FitsFilter 族 1:1) */
export function filterFits(kind: FilterKind, it: FilterItem): boolean {
  switch (kind) {
    case 'weapon':           // :193-196 damage > 0
      return it.damage > 0;
    case 'armor':            // :216-231 AArmor.IsAnArmorThatMatchesSocialState(false)
      return it.armorSlot >= 0 && !it.vanity;
    case 'vanity':           // :249-254 同上(true)
      return it.armorSlot >= 0 && it.vanity;
    case 'buildingBlock':    // :73-88 createWall≠-1 → tileWand≠-1 → 非框架 createTile
      if (it.createWall !== -1) return true;
      if (it.tileWand !== -1) return true;
      if (it.createTile === -1) return false;
      return !it.frameImportant;
    case 'furniture':        // :108-116 框架 createTile
      return it.createTile !== -1 && it.frameImportant;
    case 'accessories':      // :280-292 NonMisc 臂(!misc ∧ accessory)
      return !it.miscEquipment && it.accessory;
    case 'miscAccessories':  // :280-292 Misc 臂(只认 IsMiscEquipment,不要求 accessory)
      return it.miscEquipment;
    case 'consumables':      // :352-365 267/1307 白名 ∪ 消耗品且非放置物
      if (it.vid === 267 || it.vid === 1307) return true;
      if (!it.consumable) return false;
      return it.createTile === -1 && it.createWall === -1 && it.tileWand === -1;
    case 'tools':            // :146-173 四力 ∪ tileWand ∪ 硬编码集
      if (it.pick > 0 || it.axe > 0 || it.hammer > 0 || it.fishingPole > 0) return true;
      if (it.tileWand !== -1) return true;
      return TOOL_ACCEPTED_IDS.has(it.vid);
    case 'materials':        // :445-448 entry.material
      return it.material;
    case 'miscFallback':     // :417-425 十基类全不过(缓存面 = 本仓 filterItemOfVid 缓存同相)
      return !BASE_KINDS.some((k) => filterFits(k, it));
  }
}

/** EntryFilterer.FitsFilter(EntryFilterer.cs:30-55):搜索 AND 门 → 激活集空=全过 →
 *  激活集任一类过=过(AlwaysActive 本域恒空) */
export function filtererFits(
  search: string | null, active: readonly FilterKind[], it: FilterItem,
): boolean {
  if (search !== null && !searchFits(search, it.tooltipLines)) return false;
  if (active.length === 0) return true;
  return active.some((k) => filterFits(k, it));
}

/** 筛选条点击(UICreativeItemsInfiniteFilteringOptions.singleFilterButtonClick :81-101):
 *  激活中→反选(ToggleFilter remove);未激活→Clear+Toggle=单选 */
export function toggleFilterRadio(active: readonly FilterKind[], kind: FilterKind): FilterKind[] {
  if (active.includes(kind)) return active.filter((k) => k !== kind);
  return [kind];
}

// ---- BySearch(ItemFilters.BySearch :16-69) ----
/** OrdinalIgnoreCase 折叠(.NET 序数忽略大小写=ASCII 简单折叠;Unicode 边界备案) */
function asciiFold(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}
/** BySearch.FitsFilter(:28-48):_search null→true;tooltip 行含子串(忽略大小写) */
export function searchFits(search: string, lines: readonly string[]): boolean {
  const needle = asciiFold(search);
  if (needle === '') return true;
  for (const ln of lines) {
    if (asciiFold(ln).indexOf(needle) !== -1) return true;
  }
  return false;
}

/** 空白搜索归零(EntryFilterer.SetSearchFilter :85-94 IsNullOrWhiteSpace→null) */
export function normalizeSearch(s: string): string | null {
  return /^\s*$/.test(s) ? null : s;
}

// =====================================================================
// —— 站点滤器四支状态机(NewCraftingUI.cs:938-964 OpenCloseFilter)——
// =====================================================================
export interface ModernCraftState {
  visible: boolean;               // _ui.CurrentState != null(:240)
  filter: CraftingTileFilter | null;   // _filter
  openedWithoutFilter: boolean;   // _openedWithoutFilter(:907-909 OnActivate 置)
}
export type MCraftTransition = 'open' | 'setFilter' | 'clearFilter' | 'close';

/** TileBasedRecipeFilter.Matches(:115-131):同类逐对比对。★tileStyle 域:原版比对
 *  (tileType,tileStyle) 二元组(MapHelper.GetTileBaseOption 取风格,Player.cs:33579/
 *  :33585)——本仓滤器只建模 tile 域(FX30 craftingFilterForTile 同形),风格不敏感
 *  =登记偏差(后果:同站异风格右键=Match→切清滤而非重滤,无行为分支差异) */
export function tileFilterMatches(a: CraftingTileFilter, b: CraftingTileFilter): boolean {
  if (a.kind === 'station' && b.kind === 'station') return a.tile === b.tile;
  if (a.kind === 'water' && b.kind === 'water') return a.tile === b.tile;
  return false;
}

/** OpenCloseFilter 判别核(:938-964;向导支 :946-951 本仓无 InGuideCraftMenu 域) */
export function openCloseFilterTransition(s: ModernCraftState, incoming: CraftingTileFilter): MCraftTransition {
  if (!s.visible) return 'open';                                   // :940-943 Open(quiet:false, filter)
  if (s.filter === null || !tileFilterMatches(s.filter, incoming)) return 'setFilter';   // :944-954
  if (s.openedWithoutFilter) return 'clearFilter';                 // :955-959 SetFilter(null)
  return 'close';                                                  // :960-963 Close(returnToInventory:true)
}

// =====================================================================
// —— 窗体几何(NewCraftingUI.cs:302-317/319-395/409-429)——
// =====================================================================
/** UIState 定位(Left 20 / Top 312 / Width 490 / Height −350×100% :302-307) */
export const MCRAFT_STATE_XY = { x: 20, y: 312 } as const;
export const MCRAFT_STATE_W = 490;
export const MCRAFT_STATE_H_OFF = -350;   // h = sh - 350

/** 主内衬 UIPanel(Top 38 / Height −38×100% / PaddingRight 8 :321-327;UIPanel ctor
 *  SetPadding(corner 12)——四向 12 右 8) */
export function mcraftPanelRect(sh: number): { x: number; y: number; w: number; h: number } {
  return { x: 20, y: 350, w: 490, h: sh - 388 };
}
/** 内衬区(:padding 12/右 8) */
export function mcraftPanelInner(panel: { x: number; y: number; w: number; h: number }) {
  return { x: panel.x + 12, y: panel.y + 12, w: panel.w - 12 - 8, h: panel.h - 24 };
}

/** 11 类筛选条(Height 40/Top 4/HAlign 0.5 :389-393;钮 Left=40i 帧 42×48 offset−2−2
 *  = 元素 40×46)——屏坐标 */
export function mcraftFilterBarRect(): { x: number; y: number; w: number; h: number; n: number } {
  return { x: 45, y: 316, w: 40 * 11, h: 46, n: 11 };
}
export function mcraftFilterBtnXY(i: number): { x: number; y: number } {
  return { x: 45 + 40 * i, y: 316 };
}
/** tab 贴图帧(2×4;Infinite_Tabs_B_2 84×192 → 帧 42×48,offset−2−2 → 画 40×46) */
export const MCRAFT_TAB_TEX = { w: 84, h: 192, cols: 2, rows: 4, fw: 42, fh: 48, dw: 40, dh: 46 } as const;
/** tab 帧序(UpdateVisuals :103-114:frameX=激活、frameY=激活×2+悬停) */
export function mcraftTabFrame(active: boolean, hover: boolean): { fx: number; fy: number } {
  const a = active ? 1 : 0;
  return { fx: a, fy: a * 2 + (hover ? 1 : 0) };
}
/** icon 贴图帧(Infinite_Icons 330×30 → 帧 30×30,offset−2−0 → 画 28×30;
 *  元素 Left 6/VAlign 0.5 :64-67 → 钮内 (+6, (46−30)/2=8)) */
export const MCRAFT_ICON_TEX = { w: 330, h: 30, cols: 11, fw: 30, dw: 28, dh: 30, ox: 6, oy: 8 } as const;
export function mcraftIconBgX(icon: number): number {
  return -(icon * 30);
}

/** 窗内标题文本(UIPanel 内 UIText Left−1/Top−2 :333-337) */
export function mcraftTitleXY(panel: { x: number; y: number }): { x: number; y: number } {
  return { x: panel.x + 12 - 1, y: panel.y + 12 - 2 };
}
/** 搜索条(UIWrappedSearchBar Top−4/HAlign1/高 24 :340-344) */
export const MCRAFT_SEARCH_H = 24;
export function mcraftSearchBarRect(panel: { x: number; y: number; w: number }): { x: number; y: number; w: number } {
  // x/w 由文本宽度动态分(UpdateText :426 Width=100%−文本−10)——DOM 走 flex 等价,
  // 本函数给【右锚+高】基线
  return { x: panel.x + panel.w - 8 - 22 - 3, y: panel.y + 12 - 4, w: 0 };
}

/** 网格容器/列表/滚动条几何(:354-388 + UpdateCraftAreaSize :409-417 num=77) */
export interface MCraftGridGeometry {
  panel: { x: number; y: number; w: number; h: number };
  inner: { x: number; y: number; w: number; h: number };
  /** 网格容器(gridContainer Height=inner−77,VAlign=1 底对齐) */
  container: { x: number; y: number; w: number; h: number };
  /** UIList(Width −20/Height −7/VAlign 1/HAlign 0) */
  list: { x: number; y: number; w: number; h: number };
  /** 分隔线(UIHorizontalSeparator Width −8 居中) */
  separator: { x: number; y: number; w: number; h: number };
  /** 滚动条(Height −19/Top −4/VAlign 1/HAlign 1;宽 20 padding 5) */
  scrollbar: { x: number; y: number; w: number; h: number; innerY: number; innerH: number };
  cols: number; rows: number; contentH: number;
  /** 首格屏坐标(UIDynamicItemCollection.GetGridParameters:startX=中心−44·cols/2) */
  startX: number; startY: number;
}
export function mcraftGridGeometry(sh: number, count: number): MCraftGridGeometry {
  const panel = mcraftPanelRect(sh);
  const inner = mcraftPanelInner(panel);
  const container = { x: inner.x, y: inner.y + 77, w: inner.w, h: inner.h - 77 };
  const list = { x: container.x, y: container.y + 7, w: container.w - 20, h: container.h - 7 };
  const separator = { x: container.x + Math.floor((container.w - (container.w - 8)) / 2), y: container.y, w: container.w - 8, h: 4 };
  const scrollbar = {
    x: container.x + container.w - 20, y: container.y - 4, w: 20, h: container.h - 19,
    innerY: container.y - 4 + 5, innerH: container.h - 19 - 10,
  };
  const cols = Math.floor(list.w / 44);            // UIDynamicItemCollection.UpdateSize :width/44
  const rows = Math.max(0, Math.ceil(count / (cols > 0 ? cols : 1)));
  const startX = list.x + Math.trunc(list.w / 2 - Math.trunc((44 * cols) * 0.5));
  return {
    panel, inner, container, list, separator, scrollbar,
    cols, rows, contentH: 44 * rows,
    startX, startY: list.y,
  };
}
/** 第 n 格屏坐标(GetItemSlotHitbox :44×44 步距) */
export function mcraftCellXY(g: MCraftGridGeometry, i: number): { x: number; y: number } {
  return { x: g.startX + (i % g.cols) * 44, y: g.startY + Math.floor(i / g.cols) * 44 };
}
/** 槽视觉缩放(UIDynamicItemCollection.DrawSelf :inventoryScale=0.84615386;52 底图→44) */
export const MCRAFT_CELL_SCALE = 0.84615386;

/** 滚动钳(UIScrollbar.ViewPosition setter :33-40 Clamp 0..max−view) */
export function clampViewPosition(v: number, view: number, max: number): number {
  return Math.max(0, Math.min(max - view, v));
}

// ---- 详情浮层(NewCraftingUI.cs:431-501;origin 单源 = vanillaInvLayout.
//      craftDetailLayout(20,312) = (44,385),FX30 基线复用) ----
export function mcraftDetailOrigin(): CraftDetailLayout {
  return craftDetailLayout(MCRAFT_STATE_XY.x, MCRAFT_STATE_XY.y);
}
/** 材料行几何(:469-485:num=min(11/材料数,1);列距 34·num、槽 52×0.7·num、
 *  起点 origin+(72, 22−16·num)) */
export function mcraftMaterialPos(origin: { x: number; y: number }, j: number, matCount: number): { x: number; y: number; scale: number } {
  const num = Math.min(11 / Math.max(1, matCount), 1);
  return {
    x: origin.x + 72 + j * 34 * num,
    y: origin.y + (22 - 16 * num),
    scale: 0.7 * num,
  };
}
/** 拥有数文字位(DrawOwnedItemCount :555-558:mpos += (3,32)·mscale) */
export function mcraftOwnedCountPos(pos: { x: number; y: number; scale: number }): { x: number; y: number } {
  return { x: pos.x + 3 * pos.scale, y: pos.y + 32 * pos.scale };
}
/** 拥有数配色(:559:足 (144,238,144) / 缺 (255,140,160)) */
export function mcraftOwnedCountColor(enough: boolean): string {
  return enough ? 'rgb(144,238,144)' : 'rgb(255,140,160)';
}
/** 材料不足 tooltip 行(AddTooltipLines :545-553:GameUI.NotEnoughMaterials,
 *  色 (255,140,160)) */
export const MCRAFT_MISSING_COLOR = 'rgb(255,140,160)';
export const MCRAFT_MISSING_KEY = 'GameUI.NotEnoughMaterials';

/** 不可用槽灰(ItemSlot.Draw color=DisabledSlotColor (160,160,160) :228) */
export const MCRAFT_DISABLED_GRAY = 160 / 255;

/** 窗内网格切换钮/就近箱钮锚(DrawChildren :486-499:num2=42 旅程 +40,num3=285;
 *  就近箱钮 = num2+40,ChestOrShopUIVisible 域外恒画——本仓无 InGuideCraftMenu 域)。
 *  ★journey 判据 = Main.LocalPlayer.difficulty==3 ∧ !CreativeMenu.Blocked——本仓
 *  world.isJourney(Blocked 未建模,备案) */
export function mcraftWindowToggleXY(journey: boolean): { toggle: { x: number; y: number }; nearby: { x: number; y: number } } {
  const x = journey ? 82 : 42;
  return { toggle: { x, y: 285 }, nearby: { x: x + 40, y: 285 } };
}
