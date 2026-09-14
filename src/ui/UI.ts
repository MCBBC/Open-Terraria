// DOM overlay UI：主菜单 / HUD 快捷栏 / 背包+配饰栏 / 合成 / 宝箱 / Buff栏 / 暂停 / Tooltip / Toast
import type { Game } from '../core/Game';
import { getPass, runPassOnImageData, defaultUniforms } from '../fx/SM2Effect';
import { options } from '../core/Options';
import { bindsOf, keybindActionLabel, keybindCodeLabel, type KeybindAction } from '../core/Keybinds';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { isFunctionalTileItem } from '../world/evolution/PlantRules';
import { OPENABLE_BAG_VIDS, openBagItem } from '../data/vanillaOpenBags';
import { TILE_DEFS } from '../data/tiles';
import { autoFrameAt, cactusFrameAt, cactusTextureFor } from '../render/VanillaTiler';
import { vanillaItemKey, ingredientKey, VANILLA_RECIPES, RECIPE_GROUP_ITEMS, invIndexOfVanilla, vanillaIdOfItemKey, availableItemCountFor, collectOwnedItems, expandStationTiles, type VanillaRecipeLike } from '../data/vanillaRecipes';
import {
  craftGridGeometry, craftGridCellXY, craftGridPageBtnXY,
  clampCraftGridRecStart, craftGridRecStartAfterUp, craftGridRecStartAfterDown,
  craftToggleFrame, cycleCraftingGridControl, craftingWindowTextTipKey,
  craftSelectedBarRows, CRAFT_BAR_COLOR, CRAFT_BAR_SOLID, CRAFT_BAR_TOP_OFF,
  CRAFT_GRID_SLOT_SCALE, CRAFT_GRID_LEFT, CRAFT_GRID_TOP, craftingFilterForTile, recipeFilterAccepts, filterRemainOpen,
  vanillaWheelNotches, wheelEventPx, craftSnapEase, craftSnapCrossedRow,
  type CraftingGridControl, type CraftingTileFilter,
} from './craftingGrid';   // ★SW-FX30 刀②+⑦:经典网格视图/切换钮/站点过滤纯逻辑单源(CraftingUI.cs 域);★SW-FX38 滚轮档数/吸附步进
import { petInfoOfVid } from '../data/vanillaPets';
import { showJourneyQuickGate } from './QuickGate';
import vanillaRareJson from '../data/vanilla-itemrare.json';
import { VANILLA_ITEM_COLOR, VANILLA_ITEM_ALPHA, blendItemColorTint } from '../data/vanillaItemColor';
const ITEM_RARE = vanillaRareJson as Record<string, number>;

/** 原版像素面板底(IngameOptions.Draw + Utils.DrawInvBG 1:1):
 *  Inventory_Back13(52×52)九宫——角 10×10、边/心拉伸(Utils.DrawInvBG :2681-2691 同式),
 *  逐像素乘 IngameOptions 面板色 (33,15,91)×0.685(颜色乘法:XNA Color*float 同时乘 RGB 与 A)。
 *  返回 dataURL;素材未载(首次打开竞态)返回 null,调用方保留兜底底色 */
let invBgTinted: HTMLCanvasElement | null = null;
/** 模块级预载(首次打开面板时大概率已就绪;未就绪由 invBgEnsure 的 onload 回补) */
let invBgImg: ImageBitmap | HTMLImageElement | null = null;
function invBgEnsure(): ImageBitmap | HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!invBgImg) {
    invBgImg = new Image();
    invBgImg.onload = () => upgradeToBitmap(invBgImg as unknown as HTMLImageElement, (b) => { invBgImg = b as unknown as HTMLImageElement; });
    invBgImg.src = 'sprites/vanilla/Inventory_Back13.png';
  }
  return invBgImg;
}
/** tooltip 底（Inventory_Back13 × (23,25,81)×0.925，Utils.DrawInvBG :20252-20255）：
 *  与面板 invBgDataUrl 同贴图不同染色；按 (w,h) 取整缓存 */
let tooltipBgTinted: HTMLCanvasElement | null = null;
const tooltipBgCache = new Map<string, string>();
function tooltipBgDataUrl(w: number, h: number): string | null {
  const img = invBgEnsure();
  if (!img || !(img.width > 0) || img.width === 0) return null;
  const key = `${Math.max(20, Math.round(w))}x${Math.max(20, Math.round(h))}`;
  const hit = tooltipBgCache.get(key);
  if (hit) return hit;
  if (!tooltipBgTinted) {
    const t = document.createElement('canvas');
    t.width = img.width; t.height = img.height;
    const tc = t.getContext('2d', { willReadFrequently: true })!;  // getImageData/toDataURL 烘焙,SHM 后备
    tc.imageSmoothingEnabled = false;
    tc.drawImage(img, 0, 0);
    const d = tc.getImageData(0, 0, t.width, t.height);
    const tmul = [23 / 255, 25 / 255, 81 / 255, 0.925];   // 原版真值（:20252-20255）
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = Math.round(d.data[i] * tmul[0]);
      d.data[i + 1] = Math.round(d.data[i + 1] * tmul[1]);
      d.data[i + 2] = Math.round(d.data[i + 2] * tmul[2]);
      d.data[i + 3] = Math.round(d.data[i + 3] * tmul[3]);   // ★曾误乘红通道 d.data[i]——深蓝底红≈23→alpha≈22（两轮透明报障真根因）
    }
    tc.putImageData(d, 0, 0);
    tooltipBgTinted = t;
  }
  const t = tooltipBgTinted, W = t.width, H = t.height;
  const c = document.createElement('canvas');
  c.width = Number(key.split('x')[0]); c.height = Number(key.split('x')[1]);
  const x = c.getContext('2d', { willReadFrequently: true })!;  // toDataURL 烘焙,SHM 后备
  x.imageSmoothingEnabled = false;
  x.drawImage(t, 0, 0, 10, 10, 0, 0, 10, 10);
  x.drawImage(t, W - 10, 0, 10, 10, c.width - 10, 0, 10, 10);
  x.drawImage(t, 0, H - 10, 10, 10, 0, c.height - 10, 10, 10);
  x.drawImage(t, W - 10, H - 10, 10, 10, c.width - 10, c.height - 10, 10, 10);
  x.drawImage(t, 10, 0, 10, 10, 10, 0, c.width - 20, 10);
  x.drawImage(t, 10, H - 10, 10, 10, 10, c.height - 10, c.width - 20, 10);
  x.drawImage(t, 0, 10, 10, 10, 0, 10, 10, c.height - 20);
  x.drawImage(t, W - 10, 10, 10, 10, c.width - 10, 10, 10, c.height - 20);
  x.drawImage(t, 10, 10, 10, 10, 10, 10, c.width - 20, c.height - 20);
  const url = c.toDataURL();
  tooltipBgCache.set(key, url);
  return url;
}

function invBgDataUrl(w: number, h: number): string | null {
  const img = invBgEnsure();
  if (!img || !(img.width > 0) || img.width === 0) return null;
  if (!invBgTinted) {
    const t = document.createElement('canvas');
    t.width = img.width; t.height = img.height;
    const tc = t.getContext('2d', { willReadFrequently: true })!;  // getImageData/toDataURL 烘焙,SHM 后备
    tc.imageSmoothingEnabled = false;
    tc.drawImage(img, 0, 0);
    const d = tc.getImageData(0, 0, t.width, t.height);
    const tmul = [33 / 255, 15 / 255, 91 / 255, 0.685];
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = Math.round(d.data[i] * tmul[0]);
      d.data[i + 1] = Math.round(d.data[i + 1] * tmul[1]);
      d.data[i + 2] = Math.round(d.data[i + 2] * tmul[2]);
      d.data[i + 3] = Math.round(d.data[i + 3] * tmul[3]);
    }
    tc.putImageData(d, 0, 0);
    invBgTinted = t;
  }
  const t = invBgTinted, W = t.width, H = t.height;
  const c = document.createElement('canvas');
  c.width = Math.max(20, Math.round(w)); c.height = Math.max(20, Math.round(h));
  const x = c.getContext('2d', { willReadFrequently: true })!;  // toDataURL 烘焙,SHM 后备不占 IOSurface
  x.imageSmoothingEnabled = false;
  // 四角(源 (0,0)/(W-10,0)/(0,H-10)/(W-10,H-10))
  x.drawImage(t, 0, 0, 10, 10, 0, 0, 10, 10);
  x.drawImage(t, W - 10, 0, 10, 10, c.width - 10, 0, 10, 10);
  x.drawImage(t, 0, H - 10, 10, 10, 0, c.height - 10, 10, 10);
  x.drawImage(t, W - 10, H - 10, 10, 10, c.width - 10, c.height - 10, 10, 10);
  // 四边(源 (10,0)/(10,H-10)/(0,10)/(W-10,10) 各 10×10 拉伸)
  x.drawImage(t, 10, 0, 10, 10, 10, 0, c.width - 20, 10);
  x.drawImage(t, 10, H - 10, 10, 10, 10, c.height - 10, c.width - 20, 10);
  x.drawImage(t, 0, 10, 10, 10, 0, 10, 10, c.height - 20);
  x.drawImage(t, W - 10, 10, 10, 10, c.width - 10, 10, 10, c.height - 20);
  // 中心 (10,10,10,10) 拉伸铺满
  x.drawImage(t, 10, 10, 10, 10, 10, 10, c.width - 20, c.height - 20);
  return c.toDataURL();
}
import { atlasIconForKey, sliceItemAnimFrame, upgradeToBitmap, vanillaItemCreateTile } from '../assets/SpriteAtlas';
import { VI } from '../data/itemKeys';
import { prefixStat, prefixLines, prefixValueMul, PREFIX_NAMES } from '../data/vanillaPrefixes';
import { bannerNpcOfItem } from '../world/Banners';
import { equipKindOfInternal, MISC_KINDS } from '../data/vanillaEquip';
import { armorSlotIndexOfInternal, statOfInternal } from '../data/vanillaItemStats';
import { activeVariantOfVid, variantRareOfVid, VARIANT_L10N_KEY } from '../data/vanillaItemVariants';
import { assembleTooltipLines, buildTooltipBody, materialVids } from './itemTooltip';   // ★SW-BJ24 2026-09-07：materialIids→materialVids（vid 域门消费面,双域分池见 itemTooltip 注）
import { hudTier, safeInsets } from './HudScale';
import { bindHint } from './bindHint';
import { tryItemSwapVid } from '../render/CursorItemIcon';
import { BuffType, BUFF_DEFS, BUFF_NO_TIME_DISPLAY, BUFF_TEXT_PROJECTILE_COUNTER, buffName, buffDesc, bannerBuffNames } from '../stats/Buffs';
import { mainDifficulty, GDL, mainMasterMode } from '../stats/ScaleStats'; // ★SW-FX21 +mainMasterMode（BossBag 右键上下文）
import { Lang } from '../i18n/Lang';
import { ITEM_NAME_BY_ID, ITEM_NAME_EN_BY_ID } from '../i18n/idNames.generated';
import { ACH_ICON_INDEX, achIconFrame } from '../data/vanillaAchievements';
import { ChatMonitor } from './ChatMonitor';
import { NpcDialog, NpcShop, NpcHappinessPanel, formatCopper, happinessPct, type NpcButtonId, type ShopEntry, type ShopCellHover, type HappinessInfo } from './NpcDialog';   // ★SW-FX32:happinessPct/ShopCellHover 内嵌货架共用
import type { DialoguePortraitPayload } from '../data/npcPortraits';
import { UISfx } from '../vui/UISfx';
import { COIN_START, AMMO_START, INV_SIZE, coinIndexOf, ammoSlotAccepts, canFillEmptyAmmoSlot } from '../items/Inventory';
import { chestSettingsAllowsVault, lootAllFromContainer, quickStackIntoContainer } from '../stats/QuickStacking';   // ★SW-BJ46 quickStackIntoContainer=ChestUI.QuickStack 纯函数（bank MoveCoins 前置/两遍语义/匹配域在内）
import {
  slotContext, planAlternateClick, chestCanTakeJustCheck, canTakeToPersonalInventory,
  chestContainerContext, canMergeStack, quickTrashOptionsOf, onlyNeedOneInInventory,
  CAN_FAVORITE_AT, CAN_LOADOUT_SHARE_AT, CAN_SHARE_AT, RETAIN_FAVORITE_ON_MOVE_AT,
  blockedFromTransferIntoChest,
  selectEquipPageOf, equipPageCapOf,
  type SlotWhereLike,
} from './SlotActions';   // SW-AU2 2026-09-06 Alt/Shift/Ctrl 槽位动作 1:1 路由
import {
  INV_SCALE, gridSlotXY, coinSlotXY, ammoSlotXY, trashXY,
  quickStackXY, sortXY, bestiaryXY, emoteXY,
  mHOf, equipAreaTop, equipRowY, accessoryCheckY,
  EQUIP_COL_X, VANITY_COL_X, DYE_COL_X, ACCESSORY_CHECK_X,
  loadoutRailRect, loadoutBtnXY, defenseCenterXY,
  TAB_Y, TAB_MISC_X, TAB_HOUSING_X, TAB_CAMERA_X,
  TAB_MISC_SIZE, TAB_HOUSING_SIZE, TAB_CAMERA_SIZE,
  miscRowY, miscCheckXY, housingSlotPositions,
  MISC_COL_EQUIP_X, MISC_COL_DYE_X,
  hotbarLockXY, MISC_BUFF_X, MISC_BUFF_Y_OFF, MISC_BUFF_STEP, miscBuffRowsPerCol, miscBuffCellXY,
  pvpSwordXY, pvpTeamXY,
  vanillaScaleFor, ADVISOR_XY, TITLE_XY,
  COIN_LABEL_XY, AMMO_LABEL_XY, COIN_AMMO_SCALE,
  CHEST_SCALE, CHEST_NAME_XY, chestSlotXY, chestButtonXY,   // ★SW-FX28 刀①:箱条几何单源(ChestUI.cs 域)
  SHOP_TITLE_XY, shopSlotXY,                                // ★SW-FX32 刀①:货架/店名同格单源(Main.cs:42500-42532)
  shopHappinessIconXY, shopHappinessTextXY, happinessFrameX, // ★SW-FX32:快乐度图标/倍率位(Main.cs:42504-42512)
  shopSavingsLabelXY, shopSavingsCoinXY, SHOP_SAVINGS_BANK_ICONS, SHOP_SAVINGS_ICON_SCALE, // ★SW-FX32:储蓄行(ItemSlot.cs:3712-3757)
  CRAFT_PANEL_X, CRAFT_PANEL_INNER_TOP, craftPanelRect, craftDetailLayout, CRAFT_PANEL_Y,
} from './vanillaInvLayout';   // ★2026-09-07 刀1:原版背包布局纯几何(数值单源)
import {
  // ★SW-FX41(2026-09-12)UI 移债 modern 窗族 P2-1..P2-4:NewCraftingUI 纯逻辑单源
  MCRAFT_ALL_BUTTONS, MCRAFT_PANEL_BG, MCRAFT_PANEL_BORDER, MCRAFT_SEARCH_BG,
  MCRAFT_SEPARATOR_COLOR, MCRAFT_TAB_TEX, MCRAFT_ICON_TEX, MCRAFT_CELL_SCALE,
  mcraftPanelRect, mcraftTitleXY, mcraftGridGeometry, mcraftCellXY,
  mcraftTabFrame, mcraftIconBgX, mcraftDetailOrigin, mcraftMaterialPos,
  mcraftOwnedCountPos, mcraftOwnedCountColor, mcraftWindowToggleXY,
  mcraftFilterBarRect, clampViewPosition, MCRAFT_MISSING_COLOR, MCRAFT_MISSING_KEY,
  MCRAFT_DISABLED_GRAY, MCRAFT_SEARCH_H, MCRAFT_STATE_H_OFF,
  filterItemOfVid, filtererFits, toggleFilterRadio, normalizeSearch,
  openCloseFilterTransition, type FilterKind, type FilterItem,
} from './modernCrafting';
import {
  BACC, BUILDER_ACC_ICON_ORDER, builderAccDefaults, builderAccGateSet,
  builderAccTotalIcons, builderAccColumnTopY, cycleWireVisibility, toggleBuilderAccBit,
  playerVidCarried,
} from '../stats/builderAcc';   // ★SW-FX19:建筑配件开关位(图标列纯逻辑单源;★FX36:判定域=背包∪装备)
import { housingHeadRows } from './HousingPanel';   // ★刀3:住房页头像行(与 HousingPanel 同源)
import { sortContainerItems } from '../stats/ItemSorting';   // ★SW-RB13c:chestSortChest 换 FX29 精确引擎（sortingLayerIndex 旧近似随旧实现退役）
import { computeSellValue } from '../stats/SellChain';   // SW-BJ22 商店悬停卖出价全链
import { openAchievementsPanel, closeAchievementsPanel, createAchievementAdvisor } from './AchievementsUI';
import { openResearchPanel, closeResearchPanel, isResearchPanelOpen } from './ResearchUI';
import { openJourneyPowersPanel } from './JourneyPowersUI';
import { openPlayerListPanel } from './PlayerListPanel';
import { openEmoteMenu } from './EmoteMenu';
import { CharCreation } from './CharCreation';
import type { Appearance } from '../player/Appearance';
import type { ChestData } from '../world/World';

type SlotWhere = 'inv' | 'chest' | 'armor' | 'dye' | 'misc' | 'miscDye';

const iconCache = new Map<number, string>();
/** AfterItemSwap 换型音表（R4-39/R4-17,IS57:1975-1985）：右键/放置换型落槽后
 *  newType ∈ 此表 → SoundID 22(Unlock),否则 7(Grab)。含 1457 新 6168/6169/6193/6194 */
const AFTER_ITEM_SWAP = new Set([5325, 4131, 5060, 5059, 5324, 5329, 5330, 4346, 5391, 5323,
  5455, 4767, 5453, 5309, 5454, 6190, 6195, 5358, 5359, 5360, 5361, 5437, 6168, 6169, 6193, 6194, 2611, 5526]);
// 防御盾 img dataURL 烘焙(2026-08-19 压 IOSurface 基数:盾图从独立 canvas 改 img;
// 模块级 scratch 只此一张 52×48,产物按 (难度列,辉光) 缓存 ≤6 条)
const DEF_SHIELD_SCRATCH = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const DEF_SHIELD_URLS = new Map<string, string>();
/** 热补丁 buff 图标覆盖(vanillaBuffId → objectURL;RemasterRuntime 注册)。
 *  buff 栏是直链 <img src>,不经 atlas——重制 Buff_N.png 后需此钩子换图。 */
let remasterBuffIcon: ((vanillaBuffId: number) => string | null) | null = null;
export function setRemasterBuffIcon(fn: ((vanillaBuffId: number) => string | null) | null): void {
  remasterBuffIcon = fn;
}
/** 清物品图标 dataURL 缓存(热补丁替换 Item_Atlas 后旧图标钉死,须清后重合成)。 */
export function clearIconCache(): void { iconCache.clear(); }

/** 组假 id → 组号 */
function reqIdShift(reqId: number): number { return reqId - 1000000; }

/** 词缀显示名（Lang.prefix → l10n "Prefix.{ConstName}"，缺失回落常量名） */
function prefixDisplayName(prefix: number): string {
  const key = PREFIX_NAMES[String(prefix)];
  if (!key) return '';
  const t = Lang.text(`Prefix.${key}`);
  return t && t !== `Prefix.${key}` ? t : key;
}

/** 词缀后伤害值（Item.Prefix :551：damage = round(damage × dmg)） */
function prefixedDamage(def: (typeof ITEM_DEFS)[number], prefix?: number): number {
  if (!def.tool?.damage || !prefix) return def.tool?.damage ?? 0;
  return Math.max(1, Math.round(def.tool.damage * prefixStat(prefix).dmg));
}
/** 内部 item id → 原版 item id（UI 层等价 Shimmer.vanillaIdOfItem：vid 直取 +
 *  vi_ 前缀反解——避免 UI 模块图再挂 Shimmer 全链） */
function vidOf(itemId: number): number {
  const def = ITEM_DEFS[itemId];
  return def ? (def.vid ?? vanillaIdOfItemKey(def.key)) : -1;
}

/** 原版 item id → 内部 item id（vid→key→ITEM_BY_KEY；未注册 -1）。
 *  vidOf 的逆映射：iconUrl 收的是内部 id（ITEM_DEFS 下标），商店行等 vid 域
 *  数据必须先转——曾把 vid 直喂 iconUrl = ITEM_DEFS[vid] 错位取 def，图标
 *  全部张冠李戴（2026-08-28 用户报派对女孩商店） */
function internalIdOfVid(vid: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

/** ★SW-FX41 BySearch 检索域填充(ItemFilters.BySearch :28-48 = tooltip 全行检索——
 *  Main.MouseText_DrawItemTooltip_GetLinesInfo 每查一次全量重算,本仓按 vid 缓存;
 *  行 0 = 物品名(GetLinesInfo 首行=AffixName)。player=null/无词缀槽 = 检索域近似
 *  (伤害等玩家增幅行不参与,登记偏差:原版同名增幅行文本随玩家变动,搜索面不敏感)) */
function vinvFillTooltipLines(it: FilterItem): void {
  const iid = internalIdOfVid(it.vid);
  const def = iid >= 0 ? ITEM_DEFS[iid] : undefined;
  const lines: string[] = [];
  const nameKey = VANILLA_ITEM_KEY_BY_ID[it.vid];
  lines.push(nameKey ? (Lang.itemNameByKey(nameKey) ?? String(it.vid)) : String(it.vid));
  if (def && iid >= 0) {
    try {
      const body = buildTooltipBody(def, { id: iid, stack: 1 }, null);
      for (const ln of body.lines) lines.push(ln.text);
    } catch { /* 检索域尽力填充(数据缺失件=仅名字行) */ }
  }
  it.tooltipLines = lines;
}

/** 物品图标 dataURL(32×32;模块内多处槽位/钮面共用)。2026-08-29 起导出供
 *  MobileControls 官方手游形态的"使用"钮实时上当前物品(icons 在 ui 域内闭环) */
export function iconUrl(game: Game, id: number): string {
  let url = iconCache.get(id);
  if (!url) {
    // 优先原版素材图标（合成 32×32 dataURL）
    const def = ITEM_DEFS[id];
    if (game.atlas && def) {
      let ar = atlasIconForKey(game.atlas, def.key);
      if (ar && def.key.startsWith('vi_')) {
        // 物品贴图动画(坠星 75 等竖条):图标取帧 0 单帧(背包内原版也在转,
        // 此处静态帧 0——此前整条入画被压成 32×32 细条)
        const vm = /^vi_(\d+)_/.exec(def.key);
        if (vm) ar = sliceItemAnimFrame(Number(vm[1]), ar, 0);
      }
      if (ar) {
        const imgOk = !(ar.img instanceof HTMLImageElement)
          || ((ar.img.width > 0) && ar.img.width > 0);
        if (!imgOk) ar = null;   // 破图（素材热切换瞬态）走兜底路径
      }
      if (ar) {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const cx = c.getContext('2d', { willReadFrequently: true })!;  // 图标烘焙,SHM 后备
        cx.imageSmoothingEnabled = false;
        // 原版背包图标 = 贴图原始尺寸渲染（ItemSlot.Draw scale=1,只缩不放）：
        // 钱币 12px 圆点就该小,大翅膀才被压回 32。曾 min(32/sw,32/sh) 一律拉满
        // → 钱币/弹药/小物件视觉虚胖（2026-08-13 用户抓到"钱币没这么大"）
        const s = Math.min(1, 32 / ar.sw, 32 / ar.sh);
        const w = ar.sw * s, h = ar.sh * s;
        cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, (32 - w) / 2, (32 - h) / 2, w, h);
        // 原版 Item.color 静态表着色（Main.cs:39211 第二遍 alpha 混合的等价单遍
        // 合成）：凝胶 23 灰图染蓝 (0,80,255,100) 等 10 件——此前背包图标无着色，
        // 凝胶显示灰块（2026-08-19 用户报告）
        const tvid = vidOf(id);
        const tint = tvid > 0 ? VANILLA_ITEM_COLOR[tvid] : undefined;
        // ★SW-FX49 Item.alpha 维度（VANILLA_ITEM_ALPHA 表,Item.cs SetDefaults
        // 全赋值位）：GetAlpha 默认支（Item.cs:49328）pass1 底图 alpha×
        // (255−alpha)/255（ItemSlot.cs:2879）——凝胶 175/星怒 100/幽灵翼 255
        // （全透明,tooltip"I am right here."）等 18 件。与 color 无耦合：
        // 仅 alpha>0（恶魔弓 44 等）同样进本支;c=null 走纯 pass1
        const itemAlpha = tvid > 0 ? VANILLA_ITEM_ALPHA[tvid] : undefined;
        if ((tint && tint[3] > 0) || (itemAlpha && itemAlpha > 0)) {
          const id32 = cx.getImageData(0, 0, 32, 32);
          blendItemColorTint(id32.data, tint ?? null, itemAlpha ?? 0);
          cx.putImageData(id32, 0, 0);
        }
        url = c.toDataURL();
        iconCache.set(id, url);
        return url;
      }
      // 懒加载未就绪:返回程序化兜底但【不缓存】(此前把空串/兜底缓存死,
      // 图标加载完成后道具栏永远不升级为原版图标)。预载流程完成后此路径不再触发
      const c = game.assets.itemIcon(id);
      return c ? c.toDataURL() : '';
    }
    const c = game.assets.itemIcon(id);
    url = c ? c.toDataURL() : '';
    if (url) iconCache.set(id, url);  // 无 atlas(永久)才缓存兜底;空串不缓存
  }
  return url;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 空槽类型幽灵帧表（ItemSlot.cs:2240-2310 context/slot → Extra[54] 帧号）：
 *  帧格 3 列 × 7 行（列=帧%3 行=帧/3,格 34px 取 32px）。
 *  context 对应：armor 0-2=8(头盔0/胸甲6/护腿12) 3-9=10(配饰11) 10-12=9(时装头盔3/
 *  胸甲9/护腿15) 13-17=11(时装配饰2);dye/miscDye=12/33(染料1);
 *  misc 0-4 = context 19/20/18/17/16(宠物10/光源17/矿车7/坐骑13/抓钩4)。
 *  背包(0)/钱币(1)/弹药(2)/垃圾桶 无映射 → -1 */
function slotGhostFrame(where: SlotWhere, i: number): number {
  if (where === 'armor') {
    if (i <= 2) return [0, 6, 12][i];
    if (i <= 9) return 11;
    if (i <= 12) return [3, 9, 15][i - 10];
    if (i <= 17) return 2;
    return -1;
  }
  if (where === 'dye' || where === 'miscDye') return 1;
  if (where === 'misc') return [10, 17, 7, 13, 4][i] ?? -1;
  return -1;
}

const CSS = `
.sw-root { position:fixed; inset:0; pointer-events:none; font-family:inherit; z-index:10; }
/* ---- 原版风格：深蓝面板 + 浅蓝描边 ---- */
.sw-panel { pointer-events:auto;
  /* 原版 UIPanel：PanelBackground × Color(63,82,151)*0.785 —— 半透底 */
  background:linear-gradient(rgba(38,50,90,0.78), rgba(22,30,58,0.8));
  border:2px solid #7d92d6; border-radius:6px; color:#e8ecf8; padding:12px;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65),
    inset 0 0 18px rgba(90,120,220,0.12); }
.sw-btn { pointer-events:auto; display:block; width:100%; margin:6px 0; padding:10px 16px;
  background:linear-gradient(#4a3a6a,#3a2a5a); color:#fff; border:1px solid #6a5a8a;
  border-radius:6px; cursor:pointer; font-size:15px; text-align:center; }
.sw-btn:hover { background:linear-gradient(#5a4a7e,#4a3a6e); }
.sw-btn:disabled { opacity:0.45; cursor:default; }
.sw-root { --slot: 39px; }   /* 槽基准 = 热键栏未选中格视觉尺寸（52×0.75,2026-08-27 用户要求统一） */
.sw-slot { pointer-events:auto; width:var(--slot); height:var(--slot); background:url(sprites/vanilla/Inventory_Back.png) 0 0 / 100% 100%;
  position:relative; cursor:pointer; image-rendering:pixelated; }
/* 原版槽底乘色通道（ItemSlot.Draw :1945+：背景贴图 × inventoryBack 灰色 180-220，
 *  默认 220/255≈0.86 亮度；Loadout 染色/锁定灰 80 均经此 overlay 实现 MultiplyRGBA） */
.sw-slot::before { content:''; position:absolute; inset:0; pointer-events:none;
  background:var(--slot-tint, rgb(220,220,220)); mix-blend-mode:multiply; }
.sw-hotbar .sw-slot::before { display:none; } /* 快捷栏 Back14/20 贴图自带 alpha 语义 */
.sw-slot:hover { filter:brightness(1.15); }
/* 图标 inset/尺寸按槽盒百分比（15.4%=8/52、69.2%=36/52）——随 --slot 缩放不变形 */
.sw-slot img { position:absolute; inset:15.4%; width:69.2%; height:69.2%; image-rendering:pixelated; }
/* 垃圾桶槽（44/52=0.846 比例）：图标居中（inset 4 会贴右下角偏 4px,2026-08-21 用户报） */
.sw-slot.sw-trash { width:calc(var(--slot) * 0.846); height:calc(var(--slot) * 0.846); }
.sw-slot.sw-trash img:not(.sw-trash-icon) { inset:9.1%; width:81.8%; height:81.8%; }
.sw-slot .cnt { position:absolute; left:4px; bottom:0; font-size:11px; font-weight:bold; color:#fff;
  text-shadow:1px 1px 0 #000; transform-origin:left bottom; }   /* 11px = 热键栏数字号（.sw-slot-num 同款） */
/* Loadout 三色（ItemSlot.LoadoutSlotColors :322-340，×inventoryBack 灰 = multiply）：
 * 切换瞬间白闪（GetColorByLoadout :2546：Remap(dt,0,30,0.5,0)³ lerp→白） */
@keyframes sw-loadout-flash { 0% { background:rgb(255 255 255 / 0.5); }
  100% { background:rgb(255 255 255 / 0); } }
.sw-loadout-flash .sw-slot::before { animation:sw-loadout-flash 0.5s ease-out; }
/* ★Q-F9 槽级阻塞回执（ItemSlot.IndicateBlockedSlot :527 → AddPulseEffect(250,40,40)；
 *  Draw :2343-2352 InventoryBack21 叠层 alpha 包络 40t 收束）。::before 默认 multiply
 *  会把红压暗——动画期内切 normal 以直绘红衰层呈现（IndicateBlockedSlot 语义=红脉冲
 *  非乘色）。形差=单脉冲 ease-out 替代双 cos 波（见 indicateBlockedSlots 注） */
@keyframes sw-blocked-pulse { 0% { background:rgb(250 40 40 / 0.7); } 100% { background:rgb(250 40 40 / 0); } }
.sw-slot.sw-blocked-pulse::before { animation:sw-blocked-pulse 0.67s ease-out; mix-blend-mode:normal; }
/* 物品转移 hue 脉冲（ItemSlot.cs :2144-2152：贴图换 Back13 +
 *  Lerp(基色(63,65,151)×invAlpha, hslToRgb(hue,1,0.5), (time/300)²/2)——
 *  CSS 近似：色层 alpha 沿二次曲线 0.5→0 衰减，5s（300 tick） */
@keyframes sw-slot-glow { 0% { opacity:0.5; } 100% { opacity:0; } }
.sw-slot .sw-glow-overlay { position:absolute; inset:0; pointer-events:none;
  background:var(--glow); animation:sw-slot-glow 5s cubic-bezier(0.5,0,1,1) forwards; }
/* 金币/弹药槽 0.6 缩放（Main.cs:41193/41211 inventoryScale=0.6 → 0.596×基准、列距同比） */
.sw-slot.sm { width:calc(var(--slot) * 0.596); height:calc(var(--slot) * 0.596); }
.sw-slot.sm img { inset:12.9%; width:74.2%; height:74.2%; }
.sw-slot.sm .cnt { font-size:10px; left:2px; }
.sw-slot.sm::before { border-radius:2px; }
/* Modern 合成网格材料格（0.731×基准）——图标 inset 7.9%/84.2% 居中（原 38 盒 inset3/32px），
 *  计数同 .sm 缩一号 */
.sw-slot.chip { width:calc(var(--slot) * 0.731); height:calc(var(--slot) * 0.731); }
.sw-slot.chip img { inset:7.9%; width:84.2%; height:84.2%; }
.sw-slot.chip .cnt { font-size:10px; left:3px; }
/* ---- 快捷栏（原版 GUIHotbarDrawInner Main.cs:42996-43060 1:1）----
 * 贴图 52px：未选中 scale0.75（视觉 39px、y+6、alpha 147/255≈0.575）+ Back20；
 * 选中 scale1.0（52px、y=20、alpha1）+ Back14；x 步进 ⌊52×scale⌋+4（43/56）；
 * 格号 1-9,0（ItemSlot :2487 顶左 (8,4)×scale）；选中名居中 x=236 脉动 */
.sw-hotbar { position:fixed; top:0; left:0; pointer-events:auto; }
.sw-hotbar .sw-slot { position:absolute; transition:transform 80ms linear, opacity 80ms linear, left 80ms linear, top 80ms linear; }
.sw-hotbar .sw-slot:hover { filter:none; }
.sw-hotbar .sw-slot .sw-slot-num { position:absolute; left:5px; top:2px; font-size:11px; font-weight:bold;
  color:#fff; text-shadow:1px 1px 0 #000; pointer-events:none; }
/* 手机紧凑档(mobile-adaptation-plan P0):视觉≈41px 格 → 伪元素扩边补触控热区
 * 到 ≥44pt(只扩命中不扩视觉);D0 无 compact class=无此伪元素,桌面零新增 */
.sw-hotbar.compact .sw-slot::after { content:''; position:absolute; inset:-6px; }
/* 槽位防触摸手势干扰:压掉浏览器滚动/双击缩放保留 tap 合成链(拖放依赖)。
 * ★只设 touch-action 不 preventDefault —— 浏览器合成 mousedown/mousemove/mouseup
 * 序列完整保留,触屏拖放与桌面同语义(2026-08-29 探针实证前提) */
.sw-slot { touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
.sw-hotbar-name { position:fixed; left:236px; top:0; transform:translateX(-50%); white-space:nowrap;
  font-size:15px; color:#fff; text-shadow:2px 2px 0 #000; pointer-events:none;
  animation:sw-name-pulse 2s ease-in-out infinite alternate; }
@keyframes sw-name-pulse { from { opacity:0.35; } to { opacity:1; } }
/* ---- 说明书按钮（快捷栏右侧;与未选中槽完全同构:52 贴图 scale0.75 不裁剪,
 * alpha0.575——44px 盒装 52 背景会裁掉槽边框=首版"效果不对"根因）----
 * 未读红点感叹号气泡 = CSS 步进闪烁(显著提醒,读过后熄灭);徽标挂 wrap 不随缩放 */
.sw-manual-wrap { position:fixed; left:467px; top:25px; width:40px; height:40px;
  pointer-events:none; z-index:11; }
.sw-manual-btn { position:absolute; left:0; top:0; width:52px; height:52px;
  transform:scale(0.75); transform-origin:top left;
  pointer-events:auto; cursor:pointer; border:none; padding:0; background-color:transparent;
  background:url(sprites/vanilla/Inventory_Back20.png) 0 0/52px 52px no-repeat;
  image-rendering:pixelated; user-select:none; opacity:0.575;
  font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif;
  font-size:26px; font-weight:bold; color:#e8ecf8;
  text-shadow:2px 2px 0 #000; line-height:52px; text-align:center;
  transition:opacity 80ms linear; }
.sw-manual-btn:hover { opacity:1; filter:brightness(1.15); }
.sw-manual-badge { position:absolute; right:-9px; top:-9px; width:20px; height:20px;
  border-radius:50%; background:#d21f2c; border:2px solid #fff;
  color:#fff; font-size:14px; font-weight:bold; line-height:17px; text-align:center;
  text-shadow:none; pointer-events:none;
  animation:sw-badge-blink 0.9s steps(2, jump-none) infinite; }
@keyframes sw-badge-blink { 0% { opacity:1; transform:scale(1.15); } 100% { opacity:0.25; transform:scale(0.85); } }
/* 说明书面板（暂停面板同款:Inventory_Back13 九宫 ×(33,15,91)×0.685 半透;
 * 素材未就绪时 fallback 底色,首次打开后回补） */
.sw-manual-panel { pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:520px; max-width:92vw; z-index:32; box-sizing:border-box;
  background-repeat:no-repeat; background-size:100% 100%; image-rendering:pixelated;
  font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif; user-select:none; color:#e8ecf8; }
.sw-manual-panel.fallback-bg { background:#2a1a63; }
.sw-manual-title { text-align:center; font-size:20px; letter-spacing:3px; color:#fff; padding:14px 0 6px;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000; }
.sw-manual-body { max-height:56vh; overflow-y:auto; padding:4px 18px 8px; scrollbar-width:thin; }
.sw-manual-sec { font-size:15px; color:#ffd76e; margin:10px 0 4px; letter-spacing:2px;
  text-shadow:1px 1px 0 #000; border-bottom:1px solid rgba(125,146,214,0.35); padding-bottom:2px; }
.sw-manual-row { display:flex; justify-content:space-between; align-items:center; gap:12px;
  padding:3px 0; font-size:14px; }
.sw-manual-row .desc { color:#cfd6ee; }
.sw-manual-key { white-space:nowrap; font-size:12px; color:#fff; background:rgba(10,14,30,0.75);
  border:1px solid #7d92d6; border-radius:4px; padding:2px 8px; text-shadow:1px 1px 0 #000; }
.sw-manual-key.none { color:#8890b8; border-style:dashed; }
.sw-manual-foot { display:flex; align-items:center; justify-content:space-between;
  padding:10px 18px 14px; gap:10px; }
.sw-manual-hide { display:flex; align-items:center; gap:6px; font-size:13px; color:#cfd6ee; cursor:pointer; }
.sw-manual-hide input { width:16px; height:16px; accent-color:#7d92d6; cursor:pointer; }
.sw-manual-ok { background:#3d2f8f; border:2px solid #7d92d6; border-radius:5px; cursor:pointer;
  color:#fff; font-family:inherit; font-size:16px; letter-spacing:2px; padding:6px 26px;
  text-shadow:1px 1px 0 #000; transition:background .1s; }
.sw-manual-ok:hover { background:#5443b8; }
/* 垃圾桶：原版槽底 = Inventory_Back7（ItemSlot.cs:2063 context 6）。
 * 空槽时画 Trash.png（ItemSlot.cs:2514-2520：32×32 居中，scale 0.85，
 *  颜色 Color(100,100,100,100) = 亮度×0.39 + alpha×0.39） */
.sw-trash .sw-trash-icon { position:absolute; left:8.5px; top:8.5px; width:27px; height:27px;
  image-rendering:pixelated; pointer-events:none; filter:brightness(0.39); opacity:0.39; }
.sw-lbl { font-size:12px; color:#9fb0dd; margin:6px 0 2px 0; }
/* 右下角无框坞（2026-09-02）：列标签直接叠在世界画面上,加黑投影保可读 */
.sw-eqdock .sw-lbl { text-shadow:1px 1px 0 #000; }
/* 背包面板透明底（2026-09-02 用户要求去底去框）：同补偿,标题/标签/合成站文字投影 */
.sw-inv .sw-lbl, .sw-inv .sw-title, .sw-inv [data-role="stations"] { text-shadow:1px 1px 0 #000; }
/* 槽底统一走 ::after 纹理层（z -1 压在图标/数字/收藏角标之下）+ --slot-alpha
   半透：半透明只作用于格子底,道具物品本体全亮（2026-09-02 用户要求;原版
   Back20 alpha147 同语义）。元素自身 background-image 关掉防双重贴图;
   isolation 防负 z 伪元素逃出槽的堆叠上下文 */
.sw-hotbar .sw-slot, .sw-invgrid .sw-slot, .sw-inv .sw-slot.sm, .sw-inv .sw-trash {
  background-image:none; isolation:isolate; }
.sw-hotbar .sw-slot::after, .sw-invgrid .sw-slot::after, .sw-inv .sw-slot.sm::after, .sw-inv .sw-trash::after {
  content:''; position:absolute; inset:0; z-index:-1;
  background:var(--slot-bgimg, url(sprites/vanilla/Inventory_Back20.png)) 0 0 / 100% 100%;
  opacity:var(--slot-alpha, 0.575); }
/* 背包网格=热键栏同款渲染（2026-09-02）：52px 盒 ×0.75 缩放（视觉 39=--slot
   轨道）;节距由 syncInvGridGeometry 按热键栏实测值运行时写入。半透 0.575=热键栏
   未选中同款（用户确认半透要保留） */
.sw-invgrid .sw-slot { width:52px; height:52px; transform:scale(0.75); transform-origin:top left;
  --slot-alpha:0.575; }
/* ★发白根因（2026-09-02 用户报"半透效果与热键栏不一致/发白"）：半透格底之上
   再叠不透明的 ::before 乘色层（220 灰 multiply）——背板半透时 blend 公式的
   Cs×(1-αb) 项把浅灰直接加进画面=加性发白。热键栏 ::before 是 display:none
   所以不发白。半透槽族（网格/钱币/弹药/垃圾桶）一律禁用乘色层;blocked 红脉冲
   仍走 ::before（基色透明,动画期 mix-blend normal 不受影响） */
.sw-invgrid .sw-slot::before, .sw-inv .sw-slot.sm::before, .sw-inv .sw-trash::before {
  background:transparent; mix-blend-mode:normal; }
.sw-invgrid .sw-slot:hover::after, .sw-inv .sw-slot.sm:hover::after, .sw-inv .sw-trash:hover::after {
  opacity:1; }
/* 右下角坞槽位同款半透（2026-09-02 用户要求：装备/染料/时装/杂项格此前无半透）。
   loadout 乘色（armor/dye 配装色、默认 220 灰）以 gradient+background-blend:multiply
   在纹理层【内部】合成——不透明白灰叠半透底=加性发白（第七批同根因）,故禁用
   ::before 乘色、纹理层内自乘 */
.sw-eqdock .sw-slot { background-image:none; isolation:isolate; }
.sw-eqdock .sw-slot::after { content:''; position:absolute; inset:0; z-index:-1;
  background-image: linear-gradient(var(--slot-tint, rgb(220,220,220)), var(--slot-tint, rgb(220,220,220))), var(--slot-bgimg, url(sprites/vanilla/Inventory_Back20.png));
  background-size: 100% 100%, 100% 100%;
  background-blend-mode: multiply, normal;
  opacity: var(--slot-alpha, 0.575); }
.sw-eqdock .sw-slot::before { background:transparent; mix-blend-mode:normal; }
.sw-eqdock .sw-slot:hover::after { opacity:1; }
.sw-title { font-size:17px; font-weight:bold; margin-bottom:8px; color:#ffe8a0; }
/* will-change+transform 移动(2026-08-18):left/top 每帧触发布局+所在层整体
   重记录——压力窗口期层内 Inventory_Back 背景等被逐出解码位图就反复
   LazyPixelRef(trace 残余流);独立合成层后移动只走合成器,零重记录 */
.sw-drag-ghost { position:fixed; left:0; top:0; z-index:200; pointer-events:none;
  width:40px; height:40px; will-change:transform; }
.sw-drag-ghost img { width:40px; height:40px; image-rendering:pixelated;
  filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.6)); }
.sw-drag-ghost .cnt { position:absolute; right:-2px; bottom:-4px; font-size:12px; font-weight:bold;
  color:#fff; text-shadow:1px 1px 0 #000; }
.sw-drop-ok { border-color:#7de08a !important; }
.sw-toast { position:fixed; left:50%; top:64px; transform:translateX(-50%);
  background:rgba(20,16,28,0.9); color:#ffe8a0; padding:8px 18px; border-radius:6px;
  border:1px solid #6a5a8a; font-size:14px; transition:opacity 0.4s; pointer-events:none; }
/** 成就解锁弹窗(原版 InGamePopups.AchievementUnlockedPopup :13-148 + Tracker :38-52):
 *  底部居中、距底 40px;条高 ≈(标题高+10)×1.1(约 31px 细条);
 *  库存蓝底 (64,109,164)×0.5(hover ×0.75);图标【在右】,
 *  64px 栅格帧按 num3=num×0.3≈0.33 缩 → 屏显 ≈21px,距条右缘 ≈33px(:107);
 *  Achievement_Borders 72px 同 0.33 缩 ≈24px 覆盖(origin (4,h/2) :112);
 *  标题右对齐于图标左 10px(:110,anchorx=1);300t=5s 寿命(前 30t 淡入/末 15t 淡出)。
 *  多条堆叠:PushAnchor 每条上移 50×opacity(:89)≈ 50px 音高(31px 条 + 19px 空) */
.sw-ach-wrap { position:fixed; left:0; right:0; bottom:40px; display:flex;
  flex-direction:column; align-items:center; gap:19px; pointer-events:none; z-index:60; }
.sw-ach { pointer-events:auto; display:inline-flex; align-items:center;
  background:rgba(64,109,164,0.5); border:1px solid #1a1a2e; border-radius:4px;
  padding:5px 33px 5px 10px; cursor:pointer; transition:opacity 0.25s, transform 0.25s;
  animation:sw-ach-in 0.5s ease-out; }
.sw-ach:hover { background:rgba(64,109,164,0.75); }
.sw-ach.out { opacity:0 !important; transform:translateY(10px); }
.sw-ach .ttl { color:#ffe8a0; font-size:14px; line-height:21px; text-shadow:1px 1px 0 #000;
  white-space:nowrap; text-align:right; margin-right:10px; }
.sw-ach .icn { width:21px; height:21px; position:relative; flex:0 0 auto; overflow:hidden; }
.sw-ach .icn .sheet { position:absolute; image-rendering:pixelated; }
.sw-ach .icn .bdr { position:absolute; width:24px; height:24px; image-rendering:pixelated;
  left:-1.5px; top:-1.5px; }
@keyframes sw-ach-in { from { opacity:0; transform:translateY(12px) scale(0.9); } }
.sw-tooltip { position:fixed; background:rgba(21,23,75,0.93);
  padding:9px 13px; color:#e8e4f0; font-size:13px; pointer-events:none; z-index:1300; max-width:280px;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.85); line-height:1.5; }   /* 原版 MouseText 字体+字影（:20256 DrawColorCodedStringWithShadow） */
.sw-tooltip-nobox { background:transparent; }   /* 悬停文本框:关（SettingsEnabled_OpaqueBoxBehindTooltips=false，无底板纯文字原版支） */
.sw-tooltip-lines { display:inline; }   /* 文字层容器：脉冲 brightness 只作用于此（面板恒定） */
.sw-yoyo-logo { width:16px; height:16px; image-rendering:pixelated; vertical-align:-3px;
  filter:drop-shadow(1px 0 #000) drop-shadow(-1px 0 #000) drop-shadow(0 1px #000) drop-shadow(0 -1px #000); } /* OneDropLogo 五层影（:20263-20289） */
.sw-buff { pointer-events:auto; position:relative; width:30px; height:30px; background:rgba(40,32,60,0.9);
  border:1px solid #6a5a8a; border-radius:4px; align-items:center; justify-content:center; }
.sw-recipe { pointer-events:auto; display:flex; align-items:center; gap:6px; padding:5px 8px; margin:3px 0;
  background:rgba(50,40,70,0.8); border-radius:4px; cursor:pointer; font-size:13px; }
/* 悬停高亮 :hover 伪类（合成列表 2026-09-01 回归原生滚动后行静态驻留,伪类
   稳定;.hov 类仅作重建后伪类未重算的即时补位,enter/leave 维护） */
.sw-recipe:hover, .sw-recipe.hov { background:rgba(70,55,100,0.9); }
/* 置灰只作用内容（img/span opacity+去饱和）——★行本身保持透明：行 opacity<1
   会连"透出的游戏画面"一起半透 = 一块灰色遮罩观感（2026-08-27 用户报） */
.sw-recipe.no { cursor:default; }
.sw-recipe.no img, .sw-recipe.no span { opacity:0.45; filter:grayscale(0.7); }
.sw-recipe img { width:22px; height:22px; image-rendering:pixelated; }
/* 合成列表=原生溢出容器滚动（2026-09-02 用户定案:滚动能力交还 DOM,不自算）。
   滚动条常显（内容超高时）:纯 ::-webkit-scrollbar 换肤（Chromium/Safari 对
   自定义滚动条走经典常显渲染,绕开 macOS 覆盖式"滚动时才现"）。★不可叠加
   标准属性 scrollbar-width/scrollbar-color——Chromium 121+ 二者非 auto 即
   停用 ::-webkit-scrollbar 整套样式,退回覆盖式瞬现（2026-09-02 用户实报） */
.sw-craft-list::-webkit-scrollbar { width:5px; }
.sw-craft-list::-webkit-scrollbar-track { background:rgba(58,52,108,0.75); border-radius:3px; }
.sw-craft-list::-webkit-scrollbar-thumb { background:rgb(150,170,236); border-radius:3px; }
.sw-progress { position:fixed; inset:0; background:rgba(5,5,12,0.85); display:flex;
  flex-direction:column; align-items:center; justify-content:center; color:#e8e4f0; }
.sw-progress .bar { width:320px; height:14px; background:#2a2440; border:1px solid #6a5a8a; border-radius:7px; margin-top:14px; overflow:hidden; }
.sw-progress .fill { height:100%; width:0%; background:linear-gradient(90deg,#6a8ae0,#8ad0e0); transition:width 0.2s; }
`;

export interface CompatEntry { id: number; name: string | null; count: number; action: string }
export interface CompatReport {
  worldName: string; wldVersion: number; size: [number, number];
  tilesDegraded: CompatEntry[]; tilesCleared: CompatEntry[]; itemsSkipped: CompatEntry[];
}

// ---- PvP 背包快切钮（DrawPVPIcons Main.cs:42074-42195 1:1） ----
// 布局：PvP 剑图标（UI_PVP_0，4 列×6 行 38px 帧——列=hostile?2:0 + hover?1:0、行=队伍，
// :42094/:42112-42113）+ 其下 2 列×3 行 20px 队伍格（:42129 x=num2+i%2*20 / y=num3+i/2*20，
// 图标 UI_PVP_1 六帧 18×18 裁 16 宽 :42185-42192，悬停高亮 UI_PVP_2 20×20 @-2 :42188）。
// 点击：teamCooldown=300t（:42106/:42171 teamCooldownLen Main.cs:1026）+ 音效 12（MenuTick）
// + hostile 翻转/team=i；原版发 msg30/157，本仓走 msg13 快速通道（ClientNet.sendPvpState）。
// 文案键：UI.PvpIcon_{Active,Inactive}（:42100）+ UI.TeamIcon{Name}_{Active,Inactive}（:42160，
// Name ∈ None/Red/Green/Blue/Yellow/Pink——第 5 队 ID=Purple 但文案键历史遗留为 Pink，
// PlayerTeamID.cs:20）。TeamChangeAllowed 恒 true（Player.cs:4303-4306，misc[84] 拒绝支死码）。

/** 队伍钮序（:42127 for i<6）+ 文案键名（:42141-42159 switch） */
export const PVP_TEAM_BUTTONS: readonly { team: number; name: string }[] = [
  { team: 0, name: 'None' }, { team: 1, name: 'Red' }, { team: 2, name: 'Green' },
  { team: 3, name: 'Blue' }, { team: 4, name: 'Yellow' }, { team: 5, name: 'Pink' },
];

/** 原版 Lang.LocalizedDuration(Lang.cs:1163-1229,1456/1457/1458 逐字一致;buff 时长
 *  以 abbreviated:true + showAllAvailableUnits:false 调用,Main.cs:44053-44054):
 *  只取首个非零单位返回,且"总时长 > 1 单位常量即 +1"向上进位——阈值写死为 1 天/时/
 *  分常量而非本档位值,故整分余量也多 +1(300s 整 → "6 分",原版如此);
 *  <60 秒走秒分支精确到整秒。单位词 = Misc.Short{Seconds..Days} 官方键,
 *  数字与词间恒一个空格(zh-Hans "45 秒" / en "45 s") */
function localizedDuration(totalSec: number): string {
  const sec = Math.floor(totalSec);
  const d = Math.floor(sec / 86400);
  if (d > 0) return `${d + (sec > 86400 ? 1 : 0)} ${Lang.text('Misc.ShortDays')}`;
  const h = Math.floor((sec % 86400) / 3600);
  if (h > 0) return `${h + (sec > 3600 ? 1 : 0)} ${Lang.text('Misc.ShortHours')}`;
  const m = Math.floor((sec % 3600) / 60);
  if (m > 0) return `${m + (sec > 60 ? 1 : 0)} ${Lang.text('Misc.ShortMinutes')}`;
  return `${sec} ${Lang.text('Misc.ShortSeconds')}`;
}

/** PvP 剑帧（UI_PVP_0 :42094/:42112-42113）：col=(hostile?2:0)+(hover?1:0)、row=team(0-5) */
export function pvpIconFrame(hostile: boolean, hover: boolean, team: number): readonly [number, number] {
  return [(hostile ? 2 : 0) + (hover ? 1 : 0), Math.max(0, Math.min(5, team))];
}

/** 队伍切换冷却（teamCooldownLen=300t × 1000/60ms，:1026；冷却期无悬停提示/不可点） */
export const PVP_COOLDOWN_MS = 5000;

export class UI {
  devMode = false; // 开发者模式：进世界时全道具入包 + 出生点展示区
  root: HTMLElement;
  game!: Game;  // 生命周期由 enterGame 置入;quitToMenu 经 detachGame() 摘引用(2026-08-13 泄露 review)
  hotbarEl!: HTMLElement;
  /** 说明书按钮（快捷栏右侧;manualHidden=true 时不建） */
  private manualBtn: HTMLElement | null = null;
  hotbarNameEl!: HTMLElement;
  invPanel!: HTMLElement;
  chestPanel!: HTMLElement;
  craftListEl!: HTMLElement;
  /** ★SW-BJ1 2026-09-06 合成区 CraftFromNearbyChests 开关贴图（CraftingUI.cs:342
   *  ChestCraft 四帧;设置页/本钮双入口同步） */
  craftNearbyToggleImg: HTMLImageElement | null = null;
  tooltip!: HTMLElement;
  toastEl: HTMLElement | null = null;
  achWrapEl: HTMLElement | null = null;
  heldStack: { id: number; stack: number; prefix?: number; placeStyle?: number; favorited?: boolean } | null = null; // prefix/placeStyle/favorited 随实例流转（★批III②收藏态透传——ghost 金边框消费）
  /** 光标持有物来源区（露西存取台词的 CountsAsStorage 判定，ItemSlot 上下文；
   *  两会话撞字段合并：null=未持取（CountsAsStorage 判定的"非箱取"缺省档） */
  heldFrom: SlotWhere | null = null;
  openChest: ChestData | null = null;
  /** 装备页追加槽引用（恶魔心 8 / 大师 9 及时装 18/19——refreshEquipExtras 显隐） */
  private equipExtraSlots: { equip: HTMLElement[]; vanity: HTMLElement[]; dye: HTMLElement[] } | null = null;
  private toastTimer: number | null = null;
  /** 图鉴面板入口（背包按钮/暂停菜单注入；见 BestiaryPanel） */
  onBestiary?: () => void;
  /** 表情窗口入口（M4：背包表情角按钮 → Game.openEmoteMenu——原版 DrawEmoteIcon） */
  onEmoteMenu?: () => void;
  /** 住房面板入口（背包内房屋按钮 → HousingPanel；分配/查询走 game.housingMode） */
  onHousing?: () => void;
  /** 暂停/设置浮层入口（背包面板设置钮 → main.openInGamePause;原版
   *  playerInventory 态的设置入口 DrawInterface_29_SettingsButton Main.cs:46287
   * -46301,SW-BN3 2026-09-07 补位——clickAction 开/收 toggle 在 main.ts 接线侧） */
  onPauseMenu?: () => void;

  constructor(parent: HTMLElement) {
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'sw-root');
    parent.appendChild(this.root);
    this.installDragListeners();
    (window as unknown as { __swUI?: UI }).__swUI = this; // 调试句柄
    // ★2026-09-07 刀 2:背包布局 flag 运行期切换 → 面板重建(teardown+rebuild;
    // initInGame 前未建则 no-op,由下次进世界自然分派)。classic 旁路零改动
    options.onChange((d) => {
      if (this._builtLayout && d.inventoryLayout !== this._builtLayout) this.rebuildInventoryPanel();
    });
  }

  private slotContent(where: SlotWhere, i: number): { id: number; stack: number; favorited?: boolean; prefix?: number; placeStyle?: number } | null {
    if (where === 'inv') return this.game!.player.inv.slots[i];
    if (where === 'armor') return this.game!.player.inv.armor[i];
    if (where === 'dye') return this.game!.player.inv.dye[i];
    if (where === 'misc') return this.game!.player.inv.miscEquips[i];
    if (where === 'miscDye') return this.game!.player.inv.miscDyes[i];
    return this.openChest?.items[i] ?? null;
  }

  // ============ 主菜单 ============
  showMainMenu(handlers: {
    onNew: (seed: string, w: number, h: number) => void;
    onLoadFile: (file: File) => void;
    onImportWld: (file: File) => void;
    onQuickLoad: (() => void) | null;
  }) {
    this.closeAll();
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:340px;';
    panel.appendChild(el('div', 'sw-title', '🌍 SandboxWorld'));
    const sub = el('div', '', '2D 沙盒动作冒险 · 泰拉瑞亚风格复刻');
    sub.style.cssText = 'font-size:12px; color:#9a8ab8; margin-bottom:10px;';
    panel.appendChild(sub);

    const seedInput = el('input') as HTMLInputElement;
    seedInput.placeholder = '世界种子（留空随机）';
    seedInput.style.cssText = 'width:100%; padding:8px; margin:4px 0; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px; box-sizing:border-box;';
    panel.appendChild(seedInput);

    const sizeSel = el('select') as HTMLSelectElement;
    sizeSel.style.cssText = 'width:100%; padding:8px; margin:4px 0; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px;';
    for (const [label, w, h] of [['小世界 4200×1200', 4200, 1200], ['中世界 6400×1800', 6400, 1800], ['大世界 8400×2400', 8400, 2400]] as const) {
      const o = el('option', '', label);
      o.value = `${w}x${h}`;
      sizeSel.appendChild(o);
    }
    sizeSel.selectedIndex = 1;
    panel.appendChild(sizeSel);

    const bNew = el('button', 'sw-btn', '创建新世界');
    bNew.onclick = () => {
      const [w, h] = sizeSel.value.split('x').map(Number);
      panel.remove();
      handlers.onNew(seedInput.value.trim(), w, h);
    };
    panel.appendChild(bNew);

    const bQuick = el('button', 'sw-btn', '继续上次存档');
    bQuick.onclick = () => { panel.remove(); handlers.onQuickLoad?.(); };
    bQuick.disabled = !handlers.onQuickLoad;
    panel.appendChild(bQuick);

    const fileWrap = el('div');
    const bLoad = el('button', 'sw-btn', '读取存档文件…');
    const fileInput = el('input') as HTMLInputElement;
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
      if (fileInput.files?.[0]) { panel.remove(); handlers.onLoadFile(fileInput.files[0]); }
    };
    bLoad.onclick = () => fileInput.click();
    fileWrap.appendChild(bLoad);
    fileWrap.appendChild(fileInput);
    panel.appendChild(fileWrap);

    const wldWrap = el('div');
    const bWld = el('button', 'sw-btn', '导入泰拉瑞亚地图 (.wld)…');
    const wldInput = el('input') as HTMLInputElement;
    wldInput.type = 'file';
    wldInput.accept = '.wld';
    wldInput.style.display = 'none';
    wldInput.onchange = () => {
      if (wldInput.files?.[0]) { panel.remove(); handlers.onImportWld(wldInput.files[0]); }
    };
    bWld.onclick = () => wldInput.click();
    wldWrap.appendChild(bWld);
    wldWrap.appendChild(wldInput);
    panel.appendChild(wldWrap);

    // 开发者模式开关：进世界时全道具入包 + 出生点摆放全部可放置图块
    const devRow = el('div');
    devRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:#9a8ab8;';
    const devCb = el('input') as HTMLInputElement;
    devCb.type = 'checkbox';
    devCb.checked = this.devMode;
    devCb.onchange = () => { this.devMode = devCb.checked; };
    devRow.appendChild(devCb);
    devRow.appendChild(el('span', '', '开发者模式（全道具入包 + 出生点展示区）'));
    panel.appendChild(devRow);

    this.root.appendChild(panel);
  }

  /** 墓碑/告示牌阅读弹窗（原版 Sign 阅读界面简化）：碑文 + 关闭 */
  showSign(text: string) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:360px; max-height:70vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', `🪦 ${Lang.tileName(85) ?? '墓碑'}`));
    const body = el('div');
    body.style.cssText = 'font-size:13px; line-height:1.8; white-space:pre-wrap; color:#d8d4e4; margin:8px 0;';
    body.textContent = text;
    panel.appendChild(body);
    const close = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    close.addEventListener('click', () => panel.remove());
    panel.appendChild(close);
    this.root.appendChild(panel);
  }

  // ---- 路牌双态对话框（2026-08-30 形态改造，对齐原版复用对话面板语义：
  //   OpenSign Main.cs:40699-40694→tileSign 分支 Player.cs:32231-32250：第一次右键 =
  //   ReadSign 台词区展示 + [编辑(inter48)][关闭]；点编辑 → 编辑态（DOM 近似
  //   OpenVirtualKeyboard(1)），按钮变 [保存(inter47)]（SubmitSignText Sound12
  //   Main.cs:41397-41403）；**同一块牌再右键一次 = 关牌**（Player.cs:32952-32977
  //   ReadSign toggle 语义项）----
  private signDialogEl: HTMLElement | null = null;
  private signDialogAnchor: { x: number; y: number } | null = null;

  /** 路牌对话框是否开着（Inventory/Esc 链优先级用：关牌先于关背包） */
  get signDialogActive(): boolean { return this.signDialogEl !== null; }

  showSignDialog(x: number, y: number, text: string): void {
    // toggle：同锚点已开着 → 关闭返回（原版二次交互语义）
    if (this.signDialogEl && this.signDialogAnchor?.x === x && this.signDialogAnchor.y === y) {
      this.closeSignDialog();
      return;
    }
    this.closeSignDialog();
    this.signDialogAnchor = { x, y };
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:420px; max-height:70vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.Sign.Title')));
    const body = el('div');
    body.style.cssText = 'font-size:13px; line-height:1.8; white-space:pre-wrap; color:#d8d4e4; margin:8px 0; min-height:30px;';
    body.textContent = text || '…';
    panel.appendChild(body);
    const hint = el('div');
    hint.style.cssText = 'font-size:11px; color:#9a8ab8; margin-top:2px;';
    hint.textContent = text ? '' : Lang.text('Mods.SandboxWorld.Sign.Hint');
    panel.appendChild(hint);
    const input = el('textarea') as HTMLTextAreaElement;
    input.value = text;
    input.style.cssText = 'width:100%; box-sizing:border-box; height:110px; resize:vertical; font-size:13px; color:#d8d4e4; background:#14121c; border:1px solid #3a3350; border-radius:4px; padding:6px; display:none;';
    input.placeholder = Lang.text('Mods.SandboxWorld.Sign.Placeholder');
    panel.appendChild(input);
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:10px; justify-content:flex-end;';
    const closeBtn = el('button', 'sw-btn', Lang.inter(52));        // 关闭 inter[52]
    closeBtn.addEventListener('click', () => this.closeSignDialog());
    const saveBtn = el('button', 'sw-btn', Lang.inter(47));         // 保存 inter[47]（编辑态标签）
    saveBtn.style.display = 'none';
    saveBtn.addEventListener('click', () => {
      this.game?.setSignText(x, y, input.value);                    // Sign.TextSign :63-77
      UISfx.click();                                                // SubmitSignText PlaySound(12)
      this.closeSignDialog();
    });
    const editBtn = el('button', 'sw-btn', Lang.inter(48));         // 编辑 inter[48]
    editBtn.addEventListener('click', () => {
      body.style.display = 'none';
      hint.style.display = 'none';
      input.style.display = 'block';
      editBtn.style.display = 'none';
      saveBtn.style.display = '';
      input.focus();
    });
    row.appendChild(closeBtn);
    row.appendChild(editBtn);
    row.appendChild(saveBtn);
    panel.appendChild(row);
    this.root.appendChild(panel);
    this.signDialogEl = panel;
  }

  closeSignDialog(): void {
    this.signDialogEl?.remove();
    this.signDialogEl = null;
    this.signDialogAnchor = null;
  }

  /** 兼容报告弹窗：降级/清空/跳过内容列表 + 导出详情 JSON */
  showCompatReport(rpt: CompatReport) {
    // 不 closeAll：会把已初始化的 HUD（快捷栏等）一起拆掉，报告只叠加一层
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:480px; max-height:80vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.Compat.Title')));
    const info = el('div', '', `「${rpt.worldName}」 v${rpt.wldVersion} · ${rpt.size[0]}×${rpt.size[1]}<br>以下内容在本版本中被降级或跳过：`);
    info.style.cssText = 'font-size:12px; color:#9a8ab8; margin-bottom:8px;';
    panel.appendChild(info);
    const section = (title: string, entries: CompatEntry[], desc: string, nameOf?: (id: number) => string | null) => {
      if (!entries.length) return;
      panel.appendChild(el('div', '', title));
      const ul = el('div');
      ul.style.cssText = 'font-size:12px; margin:4px 0 8px 0; line-height:1.7;';
      for (const e of entries.slice(0, 40)) {
        const name = nameOf?.(e.id) ?? e.name;
        ul.appendChild(el('div', '', `· id ${e.id} ${name ? `「${name}」` : ''} ×${e.count} <span style="color:#7a6a9a">(${desc})</span>`));
      }
      if (entries.length > 40) ul.appendChild(el('div', '', `… 共 ${entries.length} 种（导出查看全部）`));
      panel.appendChild(ul);
    };
    section(Lang.text('Mods.SandboxWorld.Compat.TilesDegraded'), rpt.tilesDegraded, 'degraded-to-stone', (id) => Lang.tileName(id));
    section(Lang.text('Mods.SandboxWorld.Compat.TilesCleared'), rpt.tilesCleared, 'cleared', (id) => Lang.tileName(id));
    section(Lang.text('Mods.SandboxWorld.Compat.ItemsSkipped'), rpt.itemsSkipped, 'skipped', (id) => Lang.itemName(id));
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    const bExport = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.Compat.Export'));
    bExport.style.flex = '1';
    bExport.onclick = () => {
      const blob = new Blob([JSON.stringify({ ...rpt, exportedAt: new Date().toISOString(), note: Lang.text('Mods.SandboxWorld.Compat.Note') }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `compat-report-${rpt.worldName.replace(/\s+/g, '_')}-${rpt.wldVersion}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const bClose = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    bClose.style.flex = '1';
    bClose.onclick = () => panel.remove();
    row.appendChild(bExport);
    row.appendChild(bClose);
    panel.appendChild(row);
    this.root.appendChild(panel);
  }

  /** 方块标注面板（F5 标注模式）：下载标注 / 下载地图 / 贴图纠错 / 清空 */
  annotatePanel: HTMLElement | null = null;
  texFixes: Array<{ x: number; y: number; typeKey: string; sheet: number; frameX: number; frameY: number }> = [];
  private fixModeBtn: HTMLButtonElement | null = null;
  private fixesCountEl: HTMLElement | null = null;
  showAnnotatePanel(handlers: {
    onExportMarks: () => void;
    onExportMap: () => void;
    onClear: () => void;
    onClose: () => void;
    onToggleFix: () => void;
    onExportFixes: () => void;
  }) {
    this.closeAnnotatePanel();
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:14px; top:90px; width:200px; padding:10px;';
    panel.appendChild(el('div', 'sw-title', '📍 方块标注模式'));
    const hint = el('div', '', '点击方块标记/取消，导出后发给开发者');
    hint.style.cssText = 'font-size:11px; color:#9fb0dd; margin-bottom:6px;';
    panel.appendChild(hint);
    this.annotateCountEl = el('div', '', '已标记：0 处');
    this.annotateCountEl.style.cssText = 'font-size:12px; color:#ffe8a0; margin-bottom:6px;';
    panel.appendChild(this.annotateCountEl);
    this.fixesCountEl = el('div', '', '贴图纠错：0 处');
    this.fixesCountEl.style.cssText = 'font-size:12px; color:#8ad0a0; margin-bottom:6px;';
    panel.appendChild(this.fixesCountEl);
    const mk = (label: string, fn: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.margin = '4px 0';
      b.onclick = fn;
      panel.appendChild(b);
      return b;
    };
    mk('⬇ 下载标注 JSON', handlers.onExportMarks);
    mk('⬇ 下载地图存档', handlers.onExportMap);
    this.fixModeBtn = mk('🔧 贴图纠错模式：关', handlers.onToggleFix) as HTMLButtonElement;
    mk('⬇ 下载贴图纠错', handlers.onExportFixes);
    mk('🗑 清空标注', handlers.onClear);
    mk('✕ 关闭（再按 F5）', handlers.onClose);
    this.annotatePanel = panel;
    this.root.appendChild(panel);
  }

  setFixModeLabel(on: boolean) {
    if (this.fixModeBtn) this.fixModeBtn.textContent = `🔧 贴图纠错模式：${on ? '开' : '关'}`;
  }

  updateFixesCount(n: number) {
    if (this.fixesCountEl) this.fixesCountEl.textContent = `贴图纠错：${n} 处`;
  }

  /** 贴图纠错：点击方块后弹出该图块的完整原版贴图表，选正确帧 */
  openTexPicker(tx: number, ty: number) {
    this.closeTexPicker();
    const g = this.game;
    const st = g.world.store;
    if (!st.inBounds(tx, ty)) return;
    const i = st.idx(tx, ty);
    const t = st.type[i];
    const def = TILE_DEFS[t];
    const sheetId = def?.vanilla?.sheet;
    if (sheetId === undefined) { this.toast('该图块没有原版贴图表'); return; }
    const atlas = g.renderer.atlas;
    const meta = atlas ? atlas.vmeta(sheetId) : null;
    if (!atlas || !meta) { this.toast('贴图表加载失败'); return; }
    // 实际渲染用的贴图：仙人掌按生物群系换变体（腐化/猩红/神圣）
    let img: ImageBitmap | HTMLImageElement | null = atlas.vimages.get(meta.sheet) ?? null;
    if (sheetId === 80) img = cactusTextureFor(atlas, st, tx, ty) ?? img;
    if (!img) { this.toast('贴图表加载失败'); return; }
    // 当前实际渲染帧：
    // - auto 类不存储帧 → 渲染端同一查找表现算
    // - 仙人掌不存储帧 → 列角色判定现算
    // - 其余 style 类 → 存储帧
    let curCol: number, curRow: number;
    let autoNote = '';
    if (sheetId === 80) {
      const f = cactusFrameAt(st, tx, ty, t);
      curCol = f.col; curRow = f.row;
      autoNote = '（仙人掌：列角色现算）';
    } else if (def.vanilla!.frame === 'auto') {
      const f = autoFrameAt(st, tx, ty, t);
      curCol = f.col; curRow = f.row;
      autoNote = '（auto 分帧：按邻居现算）';
    } else {
      curCol = Math.floor(st.frameX[i] / meta.stride[0]);
      curRow = Math.floor(st.frameY[i] / meta.stride[1]);
    }
    const panel = el('div', 'sw-panel sw-texpicker');
    panel.style.cssText = 'pointer-events:auto; position:fixed; right:14px; top:60px; width:420px; max-height:86vh; overflow:auto; padding:10px;';
    panel.appendChild(el('div', 'sw-title', `🔧 纠错 (${tx}, ${ty})`));
    const info = el('div', '', `${def.key} · sheet ${sheetId} · 当前帧 第${curCol}列 第${curRow}行${autoNote} · 网格 ${meta.grid}×${meta.stride}`);
    info.style.cssText = 'font-size:11px; color:#9fb0dd; margin-bottom:6px;';
    panel.appendChild(info);

    const scale = Math.max(2, Math.min(4, Math.floor(400 / Math.max(1, meta.stride[0]))));
    const cv = document.createElement('canvas');
    cv.width = img.width * scale; cv.height = img.height * scale;
    cv.style.cssText = `image-rendering:pixelated; border:1px solid #4d5f9e; cursor:crosshair;`;
    // 可双向滚动的视口（大表不压缩，保持可读比例）
    const viewport = el('div');
    viewport.style.cssText = 'overflow:auto; max-height:56vh; border-radius:4px;';
    viewport.appendChild(cv);
    const cx = cv.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    let sel: { col: number; row: number } | null = { col: curCol, row: curRow };
    const redraw = () => {
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      // 网格
      cx.strokeStyle = 'rgba(160,180,255,0.25)';
      cx.lineWidth = 1;
      for (let x = 0; x <= img.width; x += meta.stride[0]) {
        cx.beginPath(); cx.moveTo(x * scale + 0.5, 0); cx.lineTo(x * scale + 0.5, cv.height); cx.stroke();
      }
      for (let y = 0; y <= img.height; y += meta.stride[1]) {
        cx.beginPath(); cx.moveTo(0, y * scale + 0.5); cx.lineTo(cv.width, y * scale + 0.5); cx.stroke();
      }
      // 选中帧高亮（绿）
      if (sel) {
        cx.strokeStyle = '#40FF80'; cx.lineWidth = 2;
        cx.strokeRect(sel.col * meta.stride[0] * scale, sel.row * meta.stride[1] * scale, meta.grid[0] * scale, meta.grid[1] * scale);
      }
    };
    redraw();
    cv.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (cv.width / r.width);
      const py = (e.clientY - r.top) * (cv.height / r.height);
      sel = { col: Math.floor(px / scale / meta.stride[0]), row: Math.floor(py / scale / meta.stride[1]) };
      redraw();
      selInfo.textContent = `选中：第 ${sel.col} 列 第 ${sel.row} 行 → 像素偏移 (${sel.col * meta.stride[0]}, ${sel.row * meta.stride[1]})`;
    });
    panel.appendChild(viewport);
    const selInfo = el('div', '', '');
    selInfo.style.cssText = 'font-size:11px; color:#40FF80; margin:6px 0; min-height:14px;';
    if (sel) selInfo.textContent = `当前（已预选）：第 ${sel.col} 列 第 ${sel.row} 行 → 像素偏移 (${sel.col * meta.stride[0]}, ${sel.row * meta.stride[1]})`;
    panel.appendChild(selInfo);
    // 滚动定位到预选帧（视口中部）
    requestAnimationFrame(() => {
      if (sel) {
        viewport.scrollTop = Math.max(0, sel.row * meta.stride[1] * scale - viewport.clientHeight / 3);
        viewport.scrollLeft = Math.max(0, sel.col * meta.stride[0] * scale - viewport.clientWidth / 3);
      }
    });
    const mk2 = (label: string, fn: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.margin = '4px 0';
      b.onclick = fn;
      panel.appendChild(b);
    };
    mk2('✓ 记录此纠错', () => {
      if (!sel) { this.toast('先在表上点选一帧'); return; }
      // 单选：只保留一条纠错记录，新的覆盖旧的
      this.texFixes = [{
        x: tx, y: ty, typeKey: def.key, sheet: sheetId,
        frameX: sel!.col * meta.stride[0], frameY: sel!.row * meta.stride[1],
      }];
      this.updateFixesCount(this.texFixes.length);
      this.toast(`已记录纠错：(${tx},${ty}) → (${sel!.col},${sel!.row})`);
      this.closeTexPicker();
    });
    mk2('✕ 取消', () => this.closeTexPicker());
    this.texPickerPanel = panel;
    this.root.appendChild(panel);
  }

  private texPickerPanel: HTMLElement | null = null;
  closeTexPicker() {
    this.texPickerPanel?.remove();
    this.texPickerPanel = null;
  }

  private annotateCountEl: HTMLElement | null = null;
  updateAnnotateCount(n: number) {
    if (this.annotateCountEl) this.annotateCountEl.textContent = `已标记：${n} 处`;
  }

  closeAnnotatePanel() {
    this.annotatePanel?.remove();
    this.annotatePanel = null;
    this.annotateCountEl = null;
    this.fixModeBtn = null;
    this.fixesCountEl = null;
    this.closeTexPicker();
  }

  showProgress(label: string, rawP: number) {
    const p = Number.isFinite(rawP) ? rawP : 0;   // NaN 防御(width "NaN%" 根治
    let prog = this.root.querySelector('.sw-progress') as HTMLElement | null;
    if (!prog) {
      prog = el('div', 'sw-progress');
      prog.appendChild(el('div', '', label));
      const bar = el('div', 'bar');
      bar.appendChild(el('div', 'fill'));
      prog.appendChild(bar);
      this.root.appendChild(prog);
    }
    prog.children[0].textContent = label;
    (prog.querySelector('.fill') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  hideProgress() {
    this.root.querySelector('.sw-progress')?.remove();
  }

  // ============ HUD ============

  buildHud(game: Game) {
    this.game = game;
    // 快捷栏（原版 GUIHotbarDrawInner Main.cs:42996-43060：左上角锚点 (20,20)；
    // 选中格 scale 1/其余 0.75、y=20+22(1-scale)、x 步进 ⌊52×scale⌋+4；
    // 选中物品名居中 x=236 脉动显示）
    this.hotbarEl = el('div', 'sw-hotbar');
    for (let i = 0; i < 10; i++) {
      this.hotbarEl.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.root.appendChild(this.hotbarEl);
    this.hotbarNameEl = el('div', 'sw-hotbar-name');
    this.root.appendChild(this.hotbarNameEl);
    this.refreshHotbar();

    // Tooltip
    this.tooltip = el('div', 'sw-tooltip');
    this.tooltip.style.display = 'none';
    this.root.appendChild(this.tooltip);
    // 悬停文本框开关（Main.SettingsEnabled_OpaqueBoxBehindTooltips，Main.cs:249
    // 默认 true；IngameOptions.cs:846-855）：关 = 无底板纯文字（原版 :20256 支）。
    // 经 applyTooltipBg 统一落底（内联 style 会盖 class 规则——九宫底也在那里）
    const applyTooltipBox = () => this.applyTooltipBg();
    applyTooltipBox();
    options.onChange(applyTooltipBox);   // UI 单例长存，无退订点

    game.openChest = (c) => this.openChestPanel(c);
    // 死亡收 UI 链用（Main.cs:46435-46440 dead ⇒ playerInventory=false ⇒ chest=-1 的
    // 引擎等价——Game.tickChestAutoClose 死亡门消费）
    game.closeInventory = () => this.closeInventory();
    // 当前打开箱子引用（Game 提取机通电 Wiring.cs:2571 Chest.UsingChest 判定用）
    game.openChestRef = () => this.openChest;
    // Game 侧收起面板（Main.cs:38455-38458 chest=-1 + Player.cs:31264/:31277 追踪失联
    // ——容器宠物（Chester 960/飞猪 525）再右键/走远/宠物消失路径）。★须全关
    // closeInventory：原版 chest=-1 后 playerInventory 保持但世界输入不拦——
    // 全关即本仓等价（2026-09-02 起背包本身不置 uiBlocking,无残留问题）
    game.closeChestPanel = () => this.closeInventory();
    // 光标持物查询（Game.updateUse 门,2026-09-02）：光标捏着物品时禁世界使用——
    // 原版该态点击世界=抛掷 mouseItem（Player.cs:5139 mouseItem 臂）,本仓无抛掷
    // 路径,保持「持物时世界点击不触发使用」的现状语义
    game.uiHeldItemRef = () => !!this.heldStack;
    // ★SW-BJ1 2026-09-06 触摸长按丢出等价：光标持物时 Input 长按 400ms 右键脉冲
    // 先经此预钩（Game.touchRightPulse → Input.onLongPressRightPulse）——
    // throwHeldToWorld 与桌面右键丢出臂 :1814 同一落地（DropSelectedItem(58) :5154
    // 语义）；返回 true=吞沿,rightDown 不置位 → 同一次长按不再触世界右键分派。
    // 桌面路径不经此钩（mousedown b2 直走 :1788 丢出臂）
    game.uiTouchRightPulse = () => {
      if (!this.heldStack) return false;
      this.throwHeldToWorld();
      this.refreshAll();
      return true;
    };
    // ★SW-AZ1 2026-09-06 光标持物镜像槽 58（使用/放置支）：heldStack 活对象直挂
    // Inventory.cursorMirror（Game.syncCursorMirror 每 tick 同步）——使用/放置消耗经
    // removeHeld() 直改本对象 stack 即回写光标显示;耗尽由 Game 调 uiHeldItemClear
    // 清光标（vanilla TurnToAir → mouseItem.IsAir → PickItemSelectionOverride 次拍失选）
    game.uiHeldItemObj = () => this.heldStack;
    game.uiHeldItemClear = () => {
      this.heldStack = null;
      this.heldFrom = null;
      this.moveGhost();
      this.refreshAll();
    };
    // M4 表情窗口入口（背包表情角按钮 onEmoteMenu——原版 DrawEmoteIcon Main.cs:41854
    // → IngameFancyUI.OpenUIState(UIEmotesMenu)）。打开期间暂停世界+阻断输入
    // （IngameFancyUI 语义,同 BestiaryPanel 惯例;关闭恢复先前态）
    this.buildManualBtn(game);
    this.onEmoteMenu = () => {
      const g = this.game;
      if (!g || document.querySelector('.sw-emote-menu')) return;
      const wasPaused = g.paused;
      const wasBlocking = g.input.uiBlocking;
      g.paused = true;
      g.input.uiBlocking = true;
      openEmoteMenu(this.root, {
        gateFlags: () => g.world.flags as Record<string, boolean | undefined>,
        makeLocalPlayerEmote: (id) => {
          g.makeLocalPlayerEmote(id);
          // ★选完表情连背包一起收（2026-08-27 用户要求——原版 IngameFancyUI.Close
          //   回到背包页,本仓用户定策选完即全收）
          this.closeInventory();
        },
        playTick: () => UISfx.sfx.play('menuTick', 1),
        onBack: () => {
          if (!wasPaused) g.paused = false;
          if (!wasBlocking) g.input.uiBlocking = false;
        },
      });
    };
  }

  // ============ 游戏说明书（快捷栏右侧;Web 便利档,原版无对应物）============
  // 未读红点气泡步进闪烁 → 点按钮开面板(暂停世界+阻断输入,同表情窗惯例) →
  // "我知道了"关面板+熄泡;勾"不再显示"= manualHidden 落盘,按钮不再创建
  // (设置页"显示说明书按钮"可重开)。

  /** 快捷键行:action 官译名 + 当前绑定(重映射实时反映;空绑定=灰虚线"未设置") */
  private manualKeyRow(action: KeybindAction): HTMLElement {
    const row = el('div', 'sw-manual-row');
    row.appendChild(el('span', 'desc', keybindActionLabel(action)));
    const codes = bindsOf(action);
    row.appendChild(el('span', codes.length ? 'sw-manual-key' : 'sw-manual-key none',
      codes.length ? codes.map(keybindCodeLabel).join(' / ') : Lang.text('Mods.SandboxWorld.UI.ManualUnbound')));
    return row;
  }

  /** 设置页"显示说明书按钮"开关的实时刷新（buildHud 之外的重开/撤除路径;
   *  经 window.__swUI 调——UI 单例句柄,构造器已挂） */
  refreshManualBtn(): void {
    const g = this.game;
    if (!g) return;
    if (options.data.manualHidden) {
      this.manualBtn?.remove();
      this.manualBtn = null;
    } else if (!this.manualBtn?.isConnected) {
      this.manualBtn?.remove();
      this.buildManualBtn(g);
    }
  }

  private buildManualBtn(game: Game) {
    if (options.data.manualHidden) return;
    const wrap = el('div', 'sw-manual-wrap');
    const btn = el('button', 'sw-manual-btn', '?');
    btn.title = Lang.text('Mods.SandboxWorld.UI.Manual');
    btn.addEventListener('mousedown', (e) => e.stopPropagation());   // 防触发拖拽/世界点击
    btn.addEventListener('click', () => this.openManualPanel(game));
    wrap.appendChild(btn);
    if (!options.data.manualSeen) wrap.appendChild(el('div', 'sw-manual-badge', '!'));
    this.root.appendChild(wrap);
    this.manualBtn = wrap;
  }

  private openManualPanel(game: Game) {
    if (document.querySelector('.sw-manual-panel')) return;
    // 打开期间暂停世界+阻断输入(IngameFancyUI 语义,同表情窗惯例;关闭恢复先前态)
    const wasPaused = game.paused;
    const wasBlocking = game.input.uiBlocking;
    game.paused = true;
    game.input.uiBlocking = true;

    const panel = el('div', 'sw-manual-panel fallback-bg');
    panel.appendChild(el('div', 'sw-manual-title', Lang.text('Mods.SandboxWorld.UI.ManualTitle')));
    const body = el('div', 'sw-manual-body');
    const sec = (t: string) => body.appendChild(el('div', 'sw-manual-sec', t));
    const mouseRow = (keyText: string, desc: string) => {
      const row = el('div', 'sw-manual-row');
      row.appendChild(el('span', 'sw-manual-key', keyText));
      row.appendChild(el('span', 'desc', desc));
      body.appendChild(row);
    };
    const kbSec = (title: string, actions: KeybindAction[]) => {
      sec(title);
      for (const a of actions) body.appendChild(this.manualKeyRow(a));
    };
    // 鼠标操作
    sec(Lang.text('Mods.SandboxWorld.UI.ManualSecMouse'));
    mouseRow(Lang.text('Mods.SandboxWorld.UI.ManualKeyLmb'), Lang.text('Mods.SandboxWorld.UI.ManualOpMine'));
    mouseRow(Lang.text('Mods.SandboxWorld.UI.ManualKeyRmb'), Lang.text('Mods.SandboxWorld.UI.ManualOpInteract'));
    mouseRow(Lang.text('Mods.SandboxWorld.UI.ManualKeyShift'), Lang.text('Mods.SandboxWorld.UI.ManualOpShift'));
    mouseRow(Lang.text('Mods.SandboxWorld.UI.ManualKeyAlt'), Lang.text('Mods.SandboxWorld.UI.ManualOpAlt'));
    // 键位分组（序=设置页"控制"页分组序）
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecMove'), ['Up', 'Down', 'Left', 'Right', 'Jump']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecFunc'), ['Inventory', 'SmartCursor', 'SmartSelect', 'QuickHeal', 'QuickMana', 'QuickBuff', 'QuickMount', 'Grapple']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecHotbar'), ['Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5', 'Hotbar6', 'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10', 'HotbarMinus', 'HotbarPlus']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecMap'), ['MapFull', 'MapStyle', 'MapZoomIn', 'MapZoomOut', 'MapAlphaUp', 'MapAlphaDown']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecView'), ['ViewZoomIn', 'ViewZoomOut']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecLoadout'), ['Loadout1', 'Loadout2', 'Loadout3']);
    kbSec(Lang.text('Mods.SandboxWorld.UI.ManualSecMisc'), ['ToggleCreativeMenu', 'ToggleCameraMode']);

    const foot = el('div', 'sw-manual-foot');
    const hideLabel = el('label', 'sw-manual-hide');
    const hideChk = document.createElement('input');
    hideChk.type = 'checkbox';
    hideLabel.appendChild(hideChk);
    hideLabel.appendChild(document.createTextNode(Lang.text('Mods.SandboxWorld.UI.ManualHide')));
    const ok = el('button', 'sw-manual-ok', Lang.text('Mods.SandboxWorld.UI.ManualGotIt'));
    foot.append(hideLabel, ok);
    panel.append(body, foot);
    this.root.appendChild(panel);
    // 暂停面板同款半透九宫底(Inventory_Back13 ×(33,15,91)×0.685;素材懒加载
    // 竞态时保留 fallback 底色,下次打开生效)
    const applyBg = () => {
      if (!panel.isConnected) return;
      const url = invBgDataUrl(panel.offsetWidth, panel.offsetHeight);
      if (url) {
        panel.style.backgroundImage = `url(${url})`;
        panel.classList.remove('fallback-bg');
      }
    };
    requestAnimationFrame(applyBg);
    const bgImg = invBgEnsure();
    if (bgImg && bgImg instanceof HTMLImageElement && !bgImg.complete) {
      bgImg.addEventListener('load', applyBg, { once: true });
    }
    // SW-BN2 2026-09-07：Esc 关闭（uiBlocking 模态自带 Esc 是 Inventory/Esc 链
    // "模态让位"支的前提——原版 inFancyUI 支 Player.cs:4987-4989 语义：fancy UI
    // 打开时 Inventory 沿只关 fancy UI。此前手册无 Esc 口=该支唯一死端,补齐）。
    // 关闭不视为"已读"：不置 manualSeen、不撤红点（"我知道了"钮才熄泡）。
    const escClose = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', escClose, true);
      panel.remove();
      if (!wasPaused) game.paused = false;
      if (!wasBlocking) game.input.uiBlocking = false;
    };
    window.addEventListener('keydown', escClose, true);
    ok.addEventListener('click', () => {
      void options.set('manualSeen', true);   // 读过=熄泡
      if (hideChk.checked) {
        void options.set('manualHidden', true);   // 永久隐藏=按钮撤除(设置页可重开)
        this.manualBtn?.remove();
        this.manualBtn = null;
      } else {
        this.manualBtn?.querySelector('.sw-manual-badge')?.remove();
      }
      window.removeEventListener('keydown', escClose, true);
      panel.remove();
      if (!wasPaused) game.paused = false;
      if (!wasBlocking) game.input.uiBlocking = false;
    });
  }

  slotEl(i: number, where: SlotWhere): HTMLElement {
    // 背包格（idx>=10）在背包面板里，快捷栏格在 HUD 上——全文档查
    const found = document.querySelector(`[data-idx="${i}"][data-where="${where}"]`);
    return found as HTMLElement;
  }

  private makeSlotEl(i: number, where: SlotWhere): HTMLElement {
    const s = el('div', 'sw-slot');
    s.dataset.idx = String(i);
    s.dataset.where = where;
    // 空槽类型幽灵图（ItemSlot.cs:2240-2317）：TextureAssets.Extra[54] 3×7 图集,
    // 槽空且 context 有映射时以 0.35 α 画对应帧（-2px 内缩）——头盔/胸甲/护腿/
    // 配饰/时装三件/染料/宠物/光源/矿车/坐骑/抓钩各帧;背包/钱币/弹药槽原版无映射
    const ghostFrame = slotGhostFrame(where, i);
    if (ghostFrame >= 0) {
      const g = el('div', 'sw-slot-ghost');
      const col = ghostFrame % 3, row = Math.floor(ghostFrame / 3);
      g.style.cssText = `position:absolute; inset:0; margin:auto; width:32px; height:32px;`
        + `background:url(sprites/vanilla/Extra_54.png) ${-col * 34}px ${-row * 34}px;`
        + `opacity:0.35; image-rendering:pixelated; pointer-events:none;`;
      s.appendChild(g);
    }
    s.addEventListener('mousedown', (e) => {
      // ★SW-FX10 债⑪热键锁穿透（Main.cs:44353-44359）：锁定+关包时快捷栏格不是
      //  mouseInterface——不 stopPropagation/preventDefault，事件透传 window（domTargets
      //  按 data-sw-world-passthrough 豁免 → 世界使用/挖掘链照常吃这一按）
      if (s.dataset.swWorldPassthrough === '1') return;
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) {
        // ★SW-RB12b（2026-09-10）关包快捷栏右键整面摘除（探针 C2 取证定谳）：
        //  关包态快捷栏走 GUIHotbarDrawInner 专路（Main.cs:44322-44377,playerInventory
        //  门 :44324 早退 = 开包态不进）——context 13 只 ItemSlot.Draw 不 Handle,
        //  唯一交互 = mouseLeft 选中槽（:44357-44360 changeItem）,右键无任何槽动作
        //  （开包/换型/装备/拆半四支全部不可达;悬停置 mouseInterface=true :44355
        //  吞世界交互）。旧码关包态右键仍落四支=可达偏差。修 = 关包吞按
        //  （stopPropagation/preventDefault 已执行,同 mouseInterface 吞效）;
        //  开包态（含宝箱面板,openChest 强制 openInventory）照走原链。左键选中链
        //  （mouseup 臂 :1928 区）不受影响。
        if (!this.invPanel || this.invPanel.style.display !== 'block') return;
        // 右键（ItemSlot.RightClick :1496-1571）：开包物优先开包，装备物一键装备，否则拆半到光标
        const cur = this.slotContent(where, i);
        // 开包门（:1514-1527）：context==0（背包格，含快捷栏）&& OpenableBag &&
        // mouseItem 空或不可叠（!Item.CanStack）→ mouseRightRelease 边沿开包。
        // ★SW-FX13（2026-09-10）门谓词补全 Item.CanStack（Item.cs:49870-49877）=
        // type 同且 prefix 同：光标堆与匣同 id 异词缀时原版 !CanStack → 放行开包
        // （旧码只比 id = 同型异词缀被误判可叠,开包门被吞。匣本身无词缀,现实
        // 触达面趋零,但谓词按原文收口）。1457 锚 = ItemSlot.cs:1636-1645。
        // DOM mousedown 即边沿；hit 须先于装备/拆半分支（原版同序 return）
        if (cur && where === 'inv'
          && (!this.heldStack || this.heldStack.id !== cur.id
            || (this.heldStack.prefix ?? 0) !== (cur.prefix ?? 0))
          && OPENABLE_BAG_VIDS.has(vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? ''))) {
          this.tryOpenContainer(cur, i);
          return;
        }
        // HasItemSwap 右键换型（:1646-1653 独立门,先于装备/拆半）：canItemSwapAt 语境
        // {0 inv/3 chest;装备栏 8/10 需过 equip 重算链未接=登记}+stack==1+光标空 →
        // TryItemSwap(:1879 对表,CursorItemIcon.tryItemSwapVid)原地 ChangeItemType +音
        //（AfterItemSwap :1992-2008 换入 2611/5526 族=22 'unlock'/其余 7 'pickup'）;
        // DOM mousedown 即边沿=mouseRightRelease 语义。悬停提示面 = ItemTooltip.{Name}
        // 的 {InputTrigger_ToggleOrOpen}(Lang.cs:160)走 staticTip 支;测试 tests/has-item-swap.test.ts
        if (!this.heldStack && cur && cur.stack === 1 && (where === 'inv' || where === 'chest')) {
          const sw = tryItemSwapVid(vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? ''));
          if (sw && invIndexOfVanilla(sw.target) > 0) {
            cur.id = invIndexOfVanilla(sw.target);
            this.game.sfx.play(sw.sound, 1);
            this.refreshAll();
            return;
          }
        }
        if (!this.heldStack && cur && cur.stack === 1 && this.canSwapEquip(cur.id)) {
          this.swapEquipItem(cur, where, i);
          this.refreshAll();
          return;
        }
        this.splitHalf(i, where);
        return;
      }
      // ★SW-AU2 2026-09-06 Alt/Shift/Ctrl+左键槽位动作 1:1。优先级链 =
      //  ItemSlot.OverrideHover :571-599（Alt=FavoriteKey（Main.cs:67607 缺省
      //  LeftAlt）：聊天分享→收藏；语境不收藏再落 GetAlternateClickAction）→
      //  GetAlternateClickAction :601-700（Ctrl Quick Trash :609 先于 Shift 快移
      //  :616；收藏物/空格恒 null :604）→ OverrideLeftClick :702-843 分派。
      //  路由表/执行器在 SlotActions.ts；false=语境无动作 → 回落普通点击
      //  （dragFrom：原版无替代目标时 Shift+点=普通拾取 LeftClick case-0 :906）。
      //  ★关包快捷栏（Main.cs:44374 只 Draw 不 Handle）＝无 Alt/Shift/Ctrl 语义
      const panelOpen = !!this.invPanel && this.invPanel.style.display === 'block';
      // ★SW-RB1 2026-09-06 e.button===0 门：替代点击语义仅左键（原版 OverrideHover/
      //  OverrideLeftClick 只由左键驱动 :552/:895）——曾让中键/侧键+Shift/Ctrl 触发
      //  快移/丢桶（改动前中键=惰性 dragFrom,mouseup button!==0 早退）
      if (e.button === 0 && e.altKey && this.altSlotClick(i, where, panelOpen)) return;
      if (e.button === 0 && (e.shiftKey || e.ctrlKey) && this.altMoveClick(i, where, e.shiftKey, e.ctrlKey, panelOpen)) return;
      this.dragFrom = { i, where, sx: e.clientX, sy: e.clientY };
    });
    // hover 型信息通道统一走 bindHint:fine 指针=原 mouseenter(行为不变);
    // coarse 指针=touchLongPressMs 长按显示(mobile-adaptation-plan 模块④)
    // ★反馈轮7:vanilla 布局显式传自身为 anchor——tooltip 定位回退的 slotEl(i,where)
    //  全局首匹配在开包态命中【隐藏热键栏】(0-9 DOM 序在前,rect=(0,0))→ 气泡钉
    //  左上角(用户报 ESC 开包热栏格气泡错位);classic 不传=行为零变化白名单
    bindHint(s, () => this.showSlotHintTouch(i, where, this._builtLayout === 'vanilla' ? s : undefined));
    s.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; cancelAnimationFrame(this.tooltipPulseRaf); });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    return s;
  }

  /** 配饰格可见性眼睛开关（per-slot 隐藏,Main.cs:40846-40896）：InventoryTickOn/Off
   *  图标叠格右上,光标为空时点击翻转 player.hideVisibleAccessory[slot]（PlaySound(12)
   *  =menuTick :40878;悬停文案 Lang.inter[58+num45] = LegacyInterface.59 可见/60 隐藏）。
   *  ★原版只挂功能配饰段 3-9（num40>2 门 :40855）——盔甲 0-2 与社交 13-19 无图标
   *  （社交槽原版无 hide 门,UpdateVisibleAccessories :36368-36375 第二轮无条件） */
  private attachVisibilityEye(slotEl: HTMLElement, slotIdx: number): void {
    const eye = el('button', 'sw-btn sw-acceye');
    eye.style.cssText = 'position:absolute; right:-12px; top:-10px; width:24px; height:20px;'
      + 'margin:0; padding:0; z-index:5; background:center/contain no-repeat; image-rendering:pixelated;';
    eye.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) return;   // 原版 mouseItem.IsAir 门（:40859）
      const p = this.game?.player;
      if (!p) return;
      p.hideVisibleAccessory[slotIdx] = !p.hideVisibleAccessory[slotIdx];
      this.game!.sfx.play('menuTick');   // SoundEngine.PlaySound(12)（:40878）
      this.paintAccEyes();
    });
    slotEl.style.position = 'relative';
    slotEl.appendChild(eye);
    this.accEyeEls.set(slotIdx, eye);
    this.paintAccEye(eye, slotIdx);
  }

  /** ★2026-09-13 反馈轮6:眼/勾选框 hover 名路由——vinv 元素走自有气泡(懒绑定
   *  一次,paint 每拍刷 dataset 文案=悬停中再点即时反映),classic 元素保持原生
   *  title(共享 paint,classic 行为零变化白名单)。★判据=元素类名(vinv-btn)而非
   *  _builtLayout——构建期 _builtLayout 尚未登记(先构建后登记约定),按布局路由
   *  会让 vinv 宠物/光源眼(仅构建期 paint)误走 classic 分支残留 title */
  private vinvEyeTip(eye: HTMLElement, textFn: () => string): void {
    if (!eye.classList.contains('vinv-btn')) {
      eye.title = textFn();
      return;
    }
    if (!eye.dataset.swTipBound) {
      eye.dataset.swTipBound = '1';
      eye.addEventListener('mouseenter', () => this.showBuffTooltip(eye, eye.dataset.swTipText ?? '', ''));
      eye.addEventListener('mouseleave', () => this.hideBuffTooltip());
      eye.title = '';   // 清可能的构建期残留,防原生气泡与自有气泡并存
    }
    eye.dataset.swTipText = textFn();
  }

  /** 眼睛图标态（InventoryTickOn/Off :40862-40865）+ 悬停文案（:40889 inter[59/60]） */
  private paintAccEye(eye: HTMLElement, slotIdx: number): void {
    const hidden = this.game?.player.hideVisibleAccessory[slotIdx] ?? false;
    eye.style.backgroundImage = `url(sprites/vanilla/Inventory_Tick_${hidden ? 'Off' : 'On'}.png)`;
    this.vinvEyeTip(eye, () => Lang.text(hidden ? 'LegacyInterface.60' : 'LegacyInterface.59'));
  }

  /** 杂项眼（宠物/光源,miscRail）——同配饰眼图标/文案族（原版 40666-40691：
   *  TogglePet/ToggleLight 翻 petFlag/lightFlag 后画 InventoryTickOn/Off） */
  private paintPetEye(eye: HTMLElement, slot: 0 | 1): void {
    const hidden = slot === 0 ? this.game.petHidden : this.game.lightPetHidden;
    eye.style.backgroundImage = `url(sprites/vanilla/Inventory_Tick_${hidden ? 'Off' : 'On'}.png)`;
    this.vinvEyeTip(eye, () => Lang.text(hidden ? 'LegacyInterface.60' : 'LegacyInterface.59'));
  }

  /** 全部眼睛图标重刷（读档回填/翻槽后） */
  private paintAccEyes(): void {
    for (const [idx, eye] of this.accEyeEls) this.paintAccEye(eye, idx);
  }

  /** 一键装备判定（ItemSlot.CanSwapEquip :3009-3020 + RightClick :1541：
   *  盔甲/配饰/染料/宠物/光源/矿车/坐骑/钩爪均可一键装备；
   *  vi_ 物品的盔甲/配饰归属查 vanilla-itemstats.json） */
  private canSwapEquip(id: number): boolean {
    const d = ITEM_DEFS[id];
    if (!d) return false;
    // ★d.armor 死前腿已移除（2026-09-02:字段全仓零写入）——legacy 效果标签独占此腿
    if (d.accessory) return true;
    if (armorSlotIndexOfInternal(id) >= 0 || statOfInternal(id)?.acc !== undefined) return true;
    const k = equipKindOfInternal(id);
    return k === 'dye' || k === 'pet' || k === 'light' || k === 'cart' || k === 'mount' || k === 'hook';
  }

  /** 一键装备（ItemSlot.SwapEquip/ArmorSwap :3022-3346 近似）：部位→armor[0-2]（时装→[10-12]），
   *  配饰→armor[3-9] 第一个空槽/原槽交换；染料→dye 第一个空槽；杂项→对应 miscEquips 槽；
   *  成功后取消收藏（原版 :3341） */
  private swapEquipItem(cur: { id: number; stack: number }, where: SlotWhere, i: number): void {
    const inv = this.game.player.inv;
    const d = ITEM_DEFS[cur.id];
    const src = where === 'inv' ? inv.slots[i] : where === 'armor' ? inv.armor[i] : inv.dye[i];
    if (!src) return;
    // ★原版右键装备门（ItemSlot.RightClick :1537）：`inv[slot].stack == 1` 才触发
    // SwapEquip——堆叠>1（1.4.4+ 装备可堆 9999）一律不装（落入下方取半逻辑）。
    // 曾整堆塞进装备槽：99 个翅膀一键全上身=偏差（2026-08-13 用户抓到）
    if (src.stack !== 1) return;
    let target = -1;
    let targetWhere: SlotWhere = 'armor';
    // ★vanity 路由（ArmorSwap :3289 `num = item.vanity ? 10 : 0`）：时装类右键进
    // 社交段（盔甲 10-12 / 配饰 13+）——曾恒进功能段:纯社交配饰(acc=0)被功能槽
    // armorAccepts 门拒 = "时装穿不上"根因（2026-08-14 用户实抓）
    const van = statOfInternal(cur.id)?.van === 1;
    // ★d.armor 死分支已移除（2026-09-02:字段全仓零写入,恒走 itemstats 部位表）
    if (armorSlotIndexOfInternal(cur.id) >= 0) {
      target = armorSlotIndexOfInternal(cur.id) + (van ? 10 : 0); // vi_ 盔甲（vanilla-itemstats 部位）
    } else if (d.accessory || statOfInternal(cur.id)?.acc !== undefined) {
      // vi_ 配饰走 itemstats acc 判定(legacy accessory 字段已随退役消失——曾只认
      // legacy 字段导致 vi_ 配饰右键一键装备静默失效)
      const accBase = van ? 13 : 3;   // 社交配饰段 13+（ArmorSwap :3315 3+num）
      const accMax = van ? 13 + (inv.accSlotMax - 3) : inv.accSlotMax;
      for (let k = accBase; k < accMax; k++) {
        if (!inv.armor[k]) { target = k; break; }
      }
      if (target < 0) target = accBase; // 全满→交换段首槽
    } else {
      const kind = equipKindOfInternal(cur.id);
      if (kind === 'dye') {
        // 染料→dye[0-9] 第一个空槽（SwapEquip :3030 dye 分支）
        for (let k = 0; k < inv.dye.length; k++) {
          if (!inv.dye[k]) { target = k; break; }
        }
        targetWhere = 'dye';
        if (target < 0) return;
      } else if (kind && MISC_KINDS.includes(kind)) {
        target = MISC_KINDS.indexOf(kind);
        targetWhere = 'misc';
      } else return;
    }
    if (targetWhere === 'armor' && !inv.armorAccepts(target, cur.id)) return;
    src.favorited = false; // 装上取消收藏（原版 ArmorSwap :3341）
    const arr = targetWhere === 'armor' ? inv.armor : targetWhere === 'dye' ? inv.dye : inv.miscEquips;
    const tmp = arr[target];
    if (tmp) tmp.favorited = false;   // ★SW-RB1 2026-09-06 SwapClearFavorite（ItemSlot.cs:1237-1242）双端清——被换下装备件回背包不得保留共享/收藏标记（ArmorSwap :3341 同调）
    arr[target] = src;
    if (where === 'inv') inv.slots[i] = tmp ?? null;
    else if (where === 'armor') inv.armor[i] = tmp ?? null;
    else if (where === 'dye') inv.dye[i] = tmp ?? null;
    else if (where === 'misc') inv.miscEquips[i] = tmp ?? null;
    else inv.miscDyes[i] = tmp ?? null;
    this.game.sfx.play('menuTick', 1);
    // 成就：装备态检查（AchievementsHelper.HandleOnEquip）
    this.game.achNotifyEquipChanged();
  }

  /** ★SW-AU2 2026-09-06 Alt+左键（FavoriteKey，Main.cs:67607 缺省 LeftAlt）语义：
   *  OverrideHover :571-599 优先级（聊天分享 :583-587 → 收藏/共享 :588-592）+
   *  OverrideLeftClick cursorOverride 2/3 分派 :709-730。返回 true=点击已消费；
   *  false=语境无 Alt 动作（:577 空格早退 / 语境域外）→ 调用方回落普通点击。
   *  ★misc/miscDye 族无任何 Alt 语义（canFavoriteAt 仅 0/1/2/32 :358-361、
   *  canLoadoutShareAt 仅 8-12 :367-371，R4-15③）→ 落空走常规点击。★关包快捷栏
   *  context 13（Main.cs:44374 无 Handle）同落空——Alt+点选中栏位不收藏 */
  private altSlotClick(i: number, where: SlotWhere, panelOpen: boolean): boolean {
    const cur = this.slotContent(where, i);
    if (!cur) return false;                                  // :577 IsAir return
    // ★SW-AY1 R7：容器来源入语境（世界箱 3/银行 4/虚空保险库 32——canFavoriteAt[32]）
    const ctx = slotContext(where, i, panelOpen, where === 'chest' ? this.openChest?.x : undefined);
    // 聊天分享（:583-587 drawingPlayerChat && canShareAt → cursorOverride 2 →
    // :709-716 ChatManager.AddChatText 插物品 tag + SoundID 12）
    if (this.game.chatInput?.isOpen && CAN_SHARE_AT.includes(ctx)) {
      this.game.insertChatItemTag(vidOf(cur.id));
      this.game.sfx.play('menuTick', 1);
      return true;
    }
    if (CAN_FAVORITE_AT.includes(ctx)) {                     // :717-723 ToggleFavorited
      cur.favorited = !cur.favorited;
      this.game.sfx.play('menuTick', 1);                     // SoundID 12（:848）
      this.refreshAll();
      return true;
    }
    if (CAN_LOADOUT_SHARE_AT.includes(ctx)) {                // :724-727 ToggleLoadoutShare
      cur.favorited = !cur.favorited;
      this.game.sfx.play('menuTick', 1);                     // SoundID 12（:855）
      if (cur.favorited) {
        // DisableLoadoutShareHint :857-860（R4-14 持久化清偿）——原版 :391 有
        // if(ShowLoadoutShareHint) 卫门,已熄则不触发 emit/防抖写盘
        if (options.data.showLoadoutShareHint) {
          void options.set('showLoadoutShareHint', false);
        }
        // ClearSlotShareInOtherLoadouts :863-884：同槽仅一套可共享
        const inv = this.game.player.inv;
        const backups = inv.loadouts.map((l) => (where === 'armor' ? l.armor : l.dye));
        for (const arr of backups) {
          const b = arr[i];
          if (b) b.favorited = false;
        }
      }
      this.refreshAll();
      return true;
    }
    return false;
  }

  /** ★SW-AY1 R5 研究献祭面板在显探针（CreativeMenu.IsShowingResearchMenu :631 的
   *  仓库等价=isResearchPanelOpen 间接层——方法化便于测试面覆写） */
  private researchMenuShowing(): boolean {
    return isResearchPanelOpen();
  }

  /** ★SW-AU2 2026-09-06 Shift/Ctrl+左键快移动作：GetAlternateClickAction :601-700
   *  路由 + OverrideLeftClick cursorOverride 6/7/8/9/10 分派 :702-843。返回 true=
   *  已消费（sell 支原版恒 return true :840-841——卖不掉也不回落）；false=语境无
   *  动作 → 普通点击（拾取/选中）。缺省设置面（Options :28-30 = "Quick Trash:
   *  Left Control" 档）：Shift 只做快移（无去处=无动作），Ctrl 做垃圾桶/卖出 */
  private altMoveClick(i: number, where: SlotWhere, shift: boolean, ctrl: boolean, panelOpen: boolean): boolean {
    const cur = this.slotContent(where, i);
    const inv = this.game.player.inv;
    const chest = this.openChest;
    const maxStack = cur ? (ITEM_DEFS[cur.id]?.maxStack ?? 1) : 1;
    // ★SW-AY1 #10：Quick Trash 三态设置进路由（缺省 Left Control = QUICK_TRASH_DEFAULTS）
    const curVid = cur ? vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? '') : -1;
    const plan = planAlternateClick({
      context: slotContext(where, i, panelOpen, where === 'chest' ? chest?.x : undefined),
      itemAir: !cur,
      favorited: !!cur?.favorited,
      isCoin: cur ? coinIndexOf(cur.id) >= 0 : false,
      shopOpen: this.game.npcShopOpen,
      chestOpen: !!chest,
      chestCanTake: !!cur && !!chest && chestCanTakeJustCheck(chest.items, cur.id, maxStack, cur.prefix, (cur as { placeStyle?: number }).placeStyle),   // ★SW-BP1 placeStyle 随行（与 shiftDepositToChest 同源同判）
      canTakeToInventory: !!cur && canTakeToPersonalInventory(inv.slots, cur.id, maxStack,
        coinIndexOf(cur.id) >= 0, ammoSlotAccepts(cur.id), cur.prefix,
        canFillEmptyAmmoSlot(cur.id)),
      shiftDown: shift,
      controlDown: ctrl,
      opts: quickTrashOptionsOf(options.data.quickTrashMode),
      // ★SW-AY1 R5 菜单特化支入路由（ItemSlot.cs:631-651 else-if 序）：
      // 研究献祭面板在显（CreativeMenu.IsShowingResearchMenu）/ 向导反查在显
      // （InGuideCraftMenu）——重铸支不可达（showReforge 全屏 overlay,结案不传）
      researchMenuOpen: this.researchMenuShowing(),
      guideMenuOpen: !!this.guideEl,
      itemMaterial: cur ? curVid > 0 && materialVids().has(curVid) : false,   // ★SW-BJ24 2026-09-07 vid 域池（旧并集池 iid 跨域碰撞：钉鞋 975→iid 24 污染）
    });
    if (!plan) return false;
    switch (plan.kind) {
      case 'sell': {
        // cursorOverride 10（:823-841）：SellItem 入店，恒消费（:840 return true）
        this.game.npcShopSell(i);
        this.refreshAll();
        return true;
      }
      case 'trash': {
        // cursorOverride 6（:731-748）：trashItem = item.Clone() 覆盖旧桶 +
        // item.TurnToAir()，TrashItem+Grab 双音（同垃圾桶直丢路径）；context 6
        // 不保留收藏（retainFavoriteOnMoveAt :362-366 → MouseItemSwap 清标记）
        const item = { ...cur!, favorited: false };
        if (where === 'chest') chest!.items[i] = null;
        else inv.slots[i] = null;
        const oldTrash = inv.trash;                    // ★SW-AY1 R4b：旧桶件先取（:734 ref 面）
        inv.trash = item;
        // ★SW-AY1 R4b journey 研究随垃圾桶（:733-738）：新件克隆按
        // onlySacrificeIfItWouldFinishResearch 献祭 + 旧桶件整段献祭——两支皆空
        // 才播 TrashItem（:735-737 `!(A | B)` 非短路序）。TryResearchingItem 内
        // 播 Research_0/1-3（:1265/:1268）
        let researchedNew = false;
        let researchedOld = false;
        if (this.game.world?.isJourney && cur) {
          researchedNew = this.tryResearchIntoTrash(cur, true);
          researchedOld = oldTrash ? this.tryResearchIntoTrash(oldTrash, false) : false;
        }
        if (!(researchedNew || researchedOld)) this.game.sfx.playFiles(['trash_item_0', 'trash_item_1'], 1);
        this.game.sfx.play('pickup', 1);
        this.refreshAll();
        return true;
      }
      case 'toChest': {
        // cursorOverride 9 分派（:785-821）：研究献祭 → 重铸（不可达,结案）→
        // 向导对换 → 入箱（ChestUI.TryPlacingInChest justCheck:false :818）
        if (!cur) return true;
        if (this.researchMenuShowing()) {              // :787-792 SwapItem+SacrificeItemInSacrificeSlot
          this.shiftResearchSacrifice(i, cur);
          return true;
        }
        if (this.guideEl) {                            // :810-815 Utils.Swap(inv[slot], guideItem)
          this.shiftGuideSwap(i, cur);
          return true;
        }
        if (chest) this.shiftDepositToChest(i, cur);
        return true;
      }
      case 'fromChest': {
        // cursorOverride 8（:772-784）：GetItem(QuickTransferFromSlot) 箱→背包，
        // 落袋才发 NotifyItemPickup + GetItem 内 SoundID 7（Player.cs:39755）
        if (!chest || !cur) return true;
        const left = inv.add(cur.id, cur.stack, cur.prefix, (cur as { placeStyle?: number }).placeStyle);
        const picked = cur.stack - Math.max(0, left);
        if (left === 0) chest.items[i] = null;
        else cur.stack = left;
        if (picked > 0) {
          const cv = vidOf(cur.id);
          if (cv > 0) this.game.achievements.notifyItemPickup(cv);
          // ★SW-AY1 #9 GetItem 币种专音（:39755 `IsACoin ? 38 : 7`，SoundID 38=CoinPickup）
          this.game.sfx.play(coinIndexOf(cur.id) >= 0 ? 'coin' : 'pickup', 1);
        }
        this.refreshAll();
        return true;
      }
      case 'unequip': {
        // cursorOverride 7（:749-771）：GetItem(QuickTransferFromSlot) 卸回背包。
        // 落袋音 GetItem 7（:39755）+ 支尾 SoundID 12（:769）
        if (!cur) return true;
        const arr = this.equipArray(where);
        const left = inv.add(cur.id, cur.stack, cur.prefix, (cur as { placeStyle?: number }).placeStyle);
        const picked = cur.stack - Math.max(0, left);
        if (left === 0) arr[i] = null;
        else if (arr[i]) arr[i]!.stack = left;   // ★残量写回（旧实现漏写=整叠复制进槽）
        if (picked > 0) {
          const uv = vidOf(cur.id);
          if (uv > 0) this.game.achievements.notifyItemPickup(uv);
          // ★SW-AY1 #9 GetItem 币种专音（:39755 IsACoin ? 38 : 7）
          this.game.sfx.play(coinIndexOf(cur.id) >= 0 ? 'coin' : 'pickup', 1);
        }
        // ★SW-RB4a 2026-09-06：支尾 SoundID 12（ItemSlot.cs:769）【无条件】播放——
        // 曾挂 picked>0 门=满背包卸下时静默（vanilla cursorOverride 7 尾奏不看落袋成败）
        this.game.sfx.play('menuTick', 1);
        this.refreshAll();
        return true;
      }
      case 'toBackpack':
      case 'creativeDupe':
        // 语境 5/6/7/29（重铸格/垃圾桶/向导格/旅程无限复制格）——本仓垃圾桶支在
        // 垃圾桶槽监听器直连（SlotWhere 无垃圾桶域），其余槽未建模 → 不可达
        return false;
    }
  }

  /** ★SW-AY1 R4b journey 研究随垃圾桶（ItemSlot.cs:733-736 → TryResearchingItem
   *  :1249-1272 + CreativeUI.SacrificeItem :288-329 spawnExcessItem:false 等价）：
   *  被丢件照原样入桶（原版是对 DeepClone 献祭、本体照扔），研究登记在献祭面。
   *  @param onlyIfFinish onlySacrificeIfItWouldFinishResearch（:304-307——只在本件
   *  覆盖剩余研究缺口整段时才献）。返回是否献祭成立（:735 `!(A|B)` 音面判据） */
  private tryResearchIntoTrash(it: { id: number; stack: number }, onlyIfFinish: boolean): boolean {
    const vid = vanillaIdOfItemKey(ITEM_DEFS[it.id]?.key ?? '');
    if (!(vid > 0)) return false;
    const n = this.game.research.tryGetSacrificeNumbers(vid);
    if (!n) return false;                                  // :293-295 无条目 CannotSacrifice
    const remaining = n.need - n.have;
    if (remaining <= 0) return false;                      // :297-301 num==0
    const num2 = Math.min(remaining, it.stack);            // :302
    if (onlyIfFinish && num2 !== remaining) return false;  // :304-307
    const done = this.game.research.sacrifice(vid, num2);  // :312 RegisterItemSacrifice
    // TryResearchingItem :1262-1270 音：跨线完成 64=Research_0 / 推进未满 63=Research_1..3
    if (done) this.game.sfx.playWavFile('Research_0');
    else this.game.sfx.playFiles(['Research_1', 'Research_2', 'Research_3'], 1);
    this.game.net?.sendJourneyUnlock(vid, num2);           // M9（SacrificeItem :308 序列化上报）
    this.game.cb?.onInventoryChanged?.();
    return true;
  }

  /** ★SW-AY1 R5 cursorOverride 9 研究支（ItemSlot.cs:787-792 SwapItem +
   *  SacrificeItemInSacrificeSlot → UICreativeInfiniteItemsDisplay.SacrificeWhatYouCan
   *  :446-462 = SacrificeItem 缺省参 spawnExcessItem:true）：Shift+点背包格整段
   *  献祭 min(need-have, stack)。近似登记：本仓研究面板无实体献祭格（列表化
   *  ResearchUI），SwapItem 的回吐面=净无操作；献后溢出留原格（原版经
   *  GetItem(ReturnItemFromSlot) 回包/落地，净语义同为「留在身上」） */
  private shiftResearchSacrifice(i: number, cur: { id: number; stack: number }): void {
    const vid = vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? '');
    const n = vid > 0 ? this.game.research.tryGetSacrificeNumbers(vid) : null;
    const remaining = n ? n.need - n.have : 0;
    if (!n || remaining <= 0) return;                      // 不可研究=原版 Swap 后原样回桌
    const num2 = Math.min(remaining, cur.stack);
    const done = this.game.research.sacrifice(vid, num2);
    cur.stack -= num2;                                     // :314 item.stack -= num2
    if (cur.stack <= 0) this.game.player.inv.slots[i] = null;   // :315-318 TurnToAir
    if (done) this.game.sfx.playWavFile('Research_0');     // 献祭动画拍音（:354/:372）
    else this.game.sfx.playFiles(['Research_1', 'Research_2', 'Research_3'], 1);
    this.game.net?.sendJourneyUnlock(vid, num2);
    this.game.cb?.onInventoryChanged?.();
    this.refreshAll();
  }

  /** ★SW-AY1 R5 cursorOverride 9 向导支（ItemSlot.cs:810-815 Utils.Swap
   *  (ref inv[slot], ref Main.guideItem) + SoundID 7）：Shift+点背包材料格与反查
   *  材料槽对换。★SW-BM1 2026-09-06：guidePlaced 增 prefix 位——对换回格件保词缀
   *  （Utils.Swap 换的是整个 Item 对象,prefix 随行;旧 {id,stack} 近似丢词缀=
   *  槽位驱动流同款已登记,本刀清偿）。★SW-RB5a 2026-09-07：此处是裸 Utils.Swap
   *  （非 MouseItemSwap,context 7 不在 retainFavoriteOnMoveAt）——favorited 随整个
   *  Item 对象双向骑行,收藏件对换往返不丢星（左键各支走 MouseItemSwap 双端清,
   *  依旧不携带） */
  private shiftGuideSwap(i: number, cur: { id: number; stack: number; prefix?: number; favorited?: boolean; placeStyle?: number }): void {
    const pl = this.guidePlaced;
    this.guidePlaced = { id: cur.id, stack: cur.stack, ...(cur.prefix !== undefined ? { prefix: cur.prefix } : {}), ...(cur.favorited ? { favorited: true } : {}), ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) };
    this.game.player.inv.slots[i] = pl ? { ...pl } : null;
    this.game.sfx.play('pickup', 1);                       // SoundEngine.PlaySound(7)（:814）
    this.guideRefresh?.();                                 // 反查面板材料行/槽面即刻重刷
    this.refreshAll();
  }

  /** ★SW-AU2 2026-09-06 快移入箱（ChestUI.TryPlacingInChest :1205-1285
   *  justCheck:false 段 1:1）：先并箱内同型余堆（:1219-1256 逐堆、SoundID 7），
   *  余量克隆进首空格（:1258-1283、SoundID 7）——入箱即清收藏（context 3/4 不在
   *  retainFavoriteOnMoveAt :362-366，MouseItemSwap :1230-1234 双端清；32 虚空袋
   *  面不走本方法——Shift 入柜面收藏件被 :604 总闸拦截）。★SW-AY1 R1 合并判据
   *  改 canMergeStack（CanStack 词缀面 :1221）；★SW-BP1 2026-09-07 placeStyle 位
   *  随 canMergeStack 生效（cur 携实例样式→敌旗跨样式不并;JustCheck 门同判同源） */
  private shiftDepositToChest(i: number, cur: { id: number; stack: number; prefix?: number; placeStyle?: number; favorited?: boolean }): void {
    const chest = this.openChest;
    if (!chest || cur.stack <= 0) return;
    const inv = this.game.player.inv;
    const max = ITEM_DEFS[cur.id]?.maxStack ?? 1;
    let moved = 0;
    if (max > 1) {
      for (const cs of chest.items) {
        if (!cs || cs.stack >= max || !canMergeStack(cs, cur)) continue;
        const put = Math.min(max - cs.stack, cur.stack);
        cs.stack += put; cur.stack -= put; moved += put;
        if (cur.stack <= 0) break;
      }
    }
    if (cur.stack > 0) {
      for (let k = 0; k < chest.items.length; k++) {
        if (!chest.items[k]) {
          chest.items[k] = { ...cur, favorited: false } as ChestData['items'][number];   // item.Clone()（:1273）——SW-AV2 2026-09-06 仅补类型断言（箱槽元素型无 favorited;运行时语义原样,pre-existing 修复）
          inv.slots[i] = null;                             // item.SetDefaults(0)（:1274）
          moved += cur.stack;
          break;
        }
      }
    }
    if (cur.stack <= 0) inv.slots[i] = null;
    if (moved > 0) this.game.sfx.play('pickup', 1);        // SoundID 7（:1237/:1272）
    this.refreshAll();
  }

  // ---- 拖拽系统：按下起点 + 光标持有物（ghost 跟随） ----
  private dragFrom: { i: number; where: SlotWhere; sx: number; sy: number } | null = null;
  private ghostEl: HTMLElement | null = null;
  private mouseX = 0; private mouseY = 0;
  /** ★批III② MouseItem 光标辉光（CraftingEffects.GetGlow :41-48 / _mouseItemGlow
   *  衰减 0.035/UI tick :35-38 ≈500ms；ItemSlot :2500-2526 绘制段）：刚合成物品的
   *  OurFavoriteColor(255,23169) SM2 辉光脉冲。Game 合成完成侧经 cb.onCraftCursorGlow 注入 */
  private cursorGlowId = -1;
  private cursorGlowUntil = 0;
  /** 辉光时长（1/0.035≈28.6 tick×16.7ms 取整） */
  private static readonly CURSOR_GLOW_MS = 480;
  /** SM2 MouseItem 光晕烘焙缓存（键=id|glow 量化档;防 mousemove 逐帧跑解释器） */
  private readonly mouseHaloCache = new Map<string, HTMLCanvasElement | 'pending'>();
  /** 合成完成注入（mainFlow cb 接线）——vanilla 语义=成品上光标(CraftItem_GrantItem),
   *  本仓成品入包,拾取同型时辉光仍亮即近似复现脉冲观感（模型差登记） */
  markCursorGlow(id: number): void {
    this.cursorGlowId = id;
    this.cursorGlowUntil = performance.now() + UI.CURSOR_GLOW_MS;
    this.moveGhost();
  }

  /** 合成成品上光标（CraftItem_GrantItem Main.cs:43329 `mouseItem = result`）：
   *  光标空=整叠挂上；同 id 且同词缀=并入（上限钳制）；异 id/异词缀/装不下 =
   *  余量返回给调用方走背包。返回【未能上光标的余量】 */
  grantCraftToCursor(id: number, stack: number, prefix?: number): number {
    const def = ITEM_DEFS[id];
    const max = def?.maxStack ?? 999;
    let remaining = stack;
    if (!this.heldStack) {
      const put = Math.min(remaining, max);
      this.heldStack = { id, stack: put, ...(prefix !== undefined ? { prefix } : {}) };
      remaining -= put;
    } else if (canMergeStack(this.heldStack, { id, prefix })) {   // ★SW-AY1 R1 谓词单源（语义同旧式）
      const space = max - this.heldStack.stack;
      const put = Math.min(space, remaining);
      if (put > 0) this.heldStack.stack += put;
      remaining -= put;
    }
    return remaining;
  }
  /** SM2 MouseItem 光晕帧烘焙（getPass('MouseItem') 直连,uColor=OurFavoriteColor/
   *  uSaturation=glow²——ItemSlot :2518-2521 uniform 对齐;量化 5 档省解释器开销） */
  private mouseHaloFrame(img: HTMLImageElement, glow: number): HTMLCanvasElement | null {
    const pass = getPass('MouseItem');
    if (!pass || !img.complete || !img.naturalWidth) return null;
    const q = Math.max(1, Math.round(glow * 5));               // 量化 [1..5]
    const key = `${img.getAttribute('src')?.slice(-40)}|${q}`;
    const hit = this.mouseHaloCache.get(key);
    if (hit === 'pending') return null;
    if (hit) return hit;
    this.mouseHaloCache.set(key, 'pending');
    const w = img.naturalWidth, h = img.naturalHeight;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    if (!octx) return null;
    octx.drawImage(img, 0, 0, w, h);
    const im = octx.getImageData(0, 0, w, h);
    runPassOnImageData(pass, im.data, w, h, {
      ...defaultUniforms(),
      uColor: [255 / 255, 231 / 255, 69 / 255],              // Main.OurFavoriteColor :886
      uSaturation: glow * glow,                              // UseSaturation(num20),num20=glow²(:2504/:2519)
    });
    octx.putImageData(im, 0, 0);
    this.mouseHaloCache.set(key, off);
    return off;
  }

  private installDragListeners() {
    // 点击面板外的世界区域：光标持有物直接丢出（原版行为）
    document.addEventListener('mousedown', (e) => {
      if (!this.heldStack) return;
      const t = e.target as HTMLElement | null;
      // ★.sw-eqdock 同算面板（2026-09-02 右下角坞无 .sw-panel 底框）
      if (t?.closest?.('.sw-slot, .sw-panel, .sw-btn, .sw-eqdock, .sw-vinv')) return;
      // NPC 商店面板（ItemSlot.Handle context 15 Main.cs:42522-42532 商品格网格）：
      //  ★SW-BJ22 2026-09-07 原版卖出触发面收窄——原版 40 格网格里【空商店格】
      //  才是卖出放置区（PickItemMovementAction case 15 ItemSlot.cs:1435-1438
      //  `inv[slot].type == 0 && checkItem.type > 0 && 非钱币` → result 4 →
      //  LeftClick case 4 :1195-1212 SellItem(mouseItem) 整叠卖出）；格间空白
      //  只置 mouseInterface 不 Handle 任何 slot（Main.cs:42518-42524 精确格
      //  矩形命中）= 无动作。旧实现「点面板任意空白=卖」自创，用户实报存疑。
      //  · 有货格（.sw-shop-item）/按钮 → 各自 click 链（买入/关闭；光标持有时
      //    Game.npcShopBuy 内 CanStack/满叠门裁决，异型整链无动作 :1427-1434）
      //  · 空商店格（.sw-shop-empty）+ 左键 + 持非币物 → npcShopSellHeld 整叠卖
      //    （右键不卖：RightClick → HandleShopSlot rightClickIsValid 支 CanStack
      //    早退 ItemSlot.cs:1878-1881，光标持物点空格右键无动作）
      //  · 其余面板空白（标题/币行/格间距）→ 无动作，光标持有物原样
      //  · NPC 对话/心情浮层也是 UI（mouseInterface），点它不丢世界
      if (t?.closest?.('.sw-npc-shop')) {
        if (t.closest('.sw-shop-item') || t.closest('button')) return;
        if (!t.closest('.sw-shop-empty') || e.button !== 0) return;   // 非空格/非左键=无动作
        if (this.game?.npcShopSellHeld(this.heldStack)) this.heldStack = null;  // :1116 SetDefaults(0)
        this.refreshAll();
        return;
      }
      if (t?.closest?.('.sw-npc-dialog') || t?.closest?.('.sw-happy-panel')) return;
      // ★SW-AZ1 2026-09-06 光标持物镜像槽 58（使用/放置支）：左键点世界不再是丢出——
      // 原版光标持物左键 = 直接使用/放置（PickItemSelectionOverride Player.cs:17526-17548
      // 伪选中 58 + dropItemCheck :5122 inventory[58]=mouseItem.Clone;旧注「点击世界=
      // 抛掷」系误读 mouseItem 臂 :5139——那是【右键】释放臂）。左键事件放行给世界
      // 使用链（Game.updateUse 光标镜像支,照常消耗光标物 stack）;右键保持丢出（原版
      // 丢出臂,DropSelectedItem(58) :5154）
      if (e.button === 0) return;
      this.throwHeldToWorld();
      // ★SW-RB4a 2026-09-06：丢出臂吞掉本次按压（vanilla dropItemCheck :5141-5144
      //  `releaseUseTile = false; Main.mouseRightRelease = false`——丢出后同一次右按
      //  不再触世界交互）。曾不吞=右键丢出瞬间 heldStack 清空 → cursorHeld 门失位,
      //  同一按压漏进世界右键交互链（开箱/开门/NPC 对话误触发）
      if (this.game?.input) this.game.input.rightDown = false;
      this.refreshAll();
    });
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.moveGhost();
      // 未持有物品时按下并移动 >4px → 整叠拾取开始拖拽
      if (this.dragFrom && !this.heldStack) {
        const d = Math.hypot(e.clientX - this.dragFrom.sx, e.clientY - this.dragFrom.sy);
        if (d > 4) this.pickUp(this.dragFrom.i, this.dragFrom.where);
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.dragFrom) return;
      const from = this.dragFrom;
      this.dragFrom = null;
      if (e.button !== 0) return;
      if (this.heldStack) {
        this.resolveDrop(from);
      } else {
        // 无拖动的普通点击：快捷栏（面板关）选中；否则拾取到光标（点击移动仍可用）
        const panelOpen = this.invPanel && this.invPanel.style.display === 'block';
        // ★SW-FX10 债⑪：热键锁门（Main.cs:44357 `mouseLeft && !player.hbLocked` →
        //  changeItem 臂）——锁定+关包时快捷栏格左键不换选中也不拾取（整格无动作，
        //  点击本体已透传世界输入;1-0 数字键照常）
        if (from.where === 'inv' && from.i < 10 && !panelOpen) {
          if (this.game.player.hbLocked) return;
          this.game.player.inv.selected = from.i;
          this.refreshHotbar();
        } else {
          this.pickUp(from.i, from.where);
        }
      }
      this.refreshAll();
    });
  }

  /** 整叠拾取到光标 */
  private pickUp(i: number, where: SlotWhere) {
    const cur = this.slotContent(where, i);
    if (!cur) return;
    if (this.heldStack && this.heldStack.id !== cur.id) return;
    if (where === 'inv') this.game.player.inv.slots[i] = null;
    else if (where === 'armor') this.game.player.inv.armor[i] = null;
    else if (where === 'dye') this.game.player.inv.dye[i] = null;
    else if (where === 'misc') this.game.player.inv.miscEquips[i] = null;
    else if (where === 'miscDye') this.game.player.inv.miscDyes[i] = null;
    else if (this.openChest) this.openChest.items[i] = null;
    // ★SW-AU2 2026-09-06 收藏标记保留域 = retainFavoriteOnMoveAt（ItemSlot.cs:362-366，
    // 背包族 0/1/2 + 虚空袋 32 + 重铸 5）：MouseItemSwap :1227-1235 语境不在表内则
    // 双端清 favorited——箱/装备/染料/杂项面取出即清（装备面清标记=共享状态终结，
    // GetEffectiveArmor 只认收藏件 :240-251）。
    // ★SW-AY1 R7：语境按容器来源取全（世界箱 3/银行 4=清、虚空保险库 32=保）——
    // 旧实现 chest 面一律按 3 清（登记债已销）；关包快捷栏语境 13 原版不在表内
    // （面板关拖拽取件同清）
    const panelOpenNow = !!this.invPanel && this.invPanel.style.display === 'block';
    const ctxNow = where === 'chest'
      ? chestContainerContext(this.openChest?.x)
      : slotContext(where, i, panelOpenNow);
    const retainFav = RETAIN_FAVORITE_ON_MOVE_AT.includes(ctxNow);
    if (this.heldStack) {
      // ★SW-RB1 2026-09-06 并入光标面同走 MouseItemSwap 双端清（ItemSlot.cs:1227-1235）：
      // 语境不在 retainFavoriteOnMoveAt（箱 3/装备 8-12/杂项 16-20/33）时,光标端收藏
      // 一并清——曾只清槽端,箱料并进收藏光标堆后收藏标记越箱存活（提示行/防丢域泄漏）
      if (!retainFav) this.heldStack.favorited = false;
      this.heldStack.stack += cur.stack;
    }
    else { this.heldStack = { id: cur.id, stack: cur.stack, prefix: cur.prefix, favorited: retainFav ? cur.favorited : false, ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) }; this.heldFrom = where; } // 保留词缀+实例样式+收藏态（★批III②；收藏域见上 SW-AU2/R7 注）
    // 拿取/合并音（ItemSlot.cs:987-989：转移后光标或格子有物 → SoundID 7 Grab）
    this.game.sfx.play('pickup', 1);
    this.refreshAll();
  }

  /** 右键开包（ItemSlot.TryOpenContainer,1457 终值 :1764-1782 + TryOpenContainer_GrantItems
   *  :1784-1843 + Player.Open* 1:1;1456 旧注 :1642-1660）：
   *  掷骰 → 产出入包（装不下落地 = GetOrDropItem :6813-6826 noGrabDelay 语义）→
   *  stack-- → SoundEngine.PlaySound(7)（Sfx 'pickup' = Grab.wav）。★SW-FX21
   *  （2026-09-10）BossBag 族经 openBagItem 首支路由 openBossBag（ItemSlot.cs:1786-1789
   *  原版唯一调用面）——★§五裁决(09-13)Game 持用左键链已摘,右键为唯一入口。
   *  锁盒钥匙门（:1794-1829 1457 行号）：金锁盒 3085 消耗金钥匙 327（Player.ConsumeItem
   *  :8846 槽序 0→57，含虚空袋兜底）；黑曜石锁盒 4879 只验暗影钥匙 329 不消耗
   *  （HasItemInInventoryOrOpenVoidBag :56575——持虚空透镜 4131 才查 bank4）。
   *  BossBag 上下文：masterMode=Main.masterMode（:7208）/crimson/extraAccessory/
   *  tenthAnniversary;hasItemInventory=Player.HasItem（:56551 仅背包,moonlord 袋
   *  3384 条件 :7748）,与锁盒的虚空袋版 hasItem 分流。
   *  原版互斥门 itemAnimation>0 拒右键（RightClick :1621-1624）由 UI/世界两域
   *  分离吸收（UI 开启时世界使用链不消费同一击）——架构性近似,登记注释。 */
  private tryOpenContainer(cur: { id: number; stack: number }, i: number): void {
    const game = this.game;
    const inv = game.player.inv;
    const vid = vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? '');
    const px = game.player.cx, py = game.player.cy;
    // 虚空袋可达门（Player.useVoidBag :22892-22901 = 背包含 4131）
    const voidLensIid = invIndexOfVanilla(4131);
    const useVoidBag = voidLensIid >= 0 && inv.countOf(voidLensIid) > 0;
    const bank4Has = (vidX: number): boolean => {
      const iid = invIndexOfVanilla(vidX);
      return iid >= 0 && game.player.banks[3].some((s) => s && s.id === iid && s.stack > 0);
    };
    const opened = openBagItem(vid, (id, n) => {
      const key = VANILLA_ITEM_KEY_BY_ID[id];
      if (!key) return;                       // vanilla.json 缺条目防御（bagItemIdRegistered 可查）
      const iid = ITEM_BY_KEY[key];
      if (iid === undefined) return;
      const left = inv.add(iid, n ?? 1);
      if (left > 0) game.spawnDrop(px, py, key, left, 0, -2); // 溢出落地（:6817-6820）
    }, {
      hardMode: !!game.world.flags.hardMode,   // OpenPresent :6654 硬模式门读档
      remixWorld: !!game.world.seedFlags?.remix,
      getGoodWorld: !!game.world.seedFlags?.getGoodWorld,
      skyblockLowTiles: !!game.world.seedFlags?.skyblock,   // WorldGen.Skyblock.lowTiles（空岛匣 2197 支）
      // ★SW-FX21 BossBag 上下文（Player.OpenBossBag :7206-7901 唯一入口;§五裁决 09-13 持用链已摘）
      masterMode: mainMasterMode(game.world),             // Main.masterMode（:7208）
      crimson: !!game.world.crimson,                      // WorldGen.crimson（:7255/:7260 矿种臂）
      extraAccessory: !!game.player.inv.extraAccessory,   // 饰品第六格（noExtra 条件臂）
      tenthAnniversary: !!game.world.seedFlags?.tenthAnniversary,  // TryGettingDevArmor 1/8（:7526）
      // 金钥匙消耗：先背包槽序 0→57（Inventory.remove 同序），后虚空袋 bank4
      consumeItem: (vidX) => {
        const iid = invIndexOfVanilla(vidX);
        if (iid >= 0 && inv.remove(iid, 1)) return true;
        if (useVoidBag && iid >= 0) {
          const s = game.player.banks[3].find((b) => b && b.id === iid && b.stack > 0);
          if (s) { s.stack--; if (s.stack <= 0) game.player.banks[3][game.player.banks[3].indexOf(s)] = null; return true; }
        }
        return false;
      },
      hasItem: (vidX) => {
        const iid = invIndexOfVanilla(vidX);
        return iid >= 0 && (inv.countOf(iid) > 0 || (useVoidBag && bank4Has(vidX)));
      },
      // Player.HasItem :56551 仅查背包 0-57（moonlord 袋 3384 传送门枪条件 :7748）
      hasItemInventory: (vidX) => {
        const iid = invIndexOfVanilla(vidX);
        return iid >= 0 && inv.countOf(iid) > 0;
      },
    });
    if (opened) {
      inv.removeAt(i, 1);                      // item.stack--（:1651-1655，归零由 Inventory 处理）
      game.sfx.play('pickup', 1);              // PlaySound(7) = Grab（:1656）
      game.cb.onInventoryChanged?.();          // 掉落物拾取链同款 UI 刷新
      this.refreshAll();
    }
  }

  /** 右键：拆半到光标 */
  private splitHalf(i: number, where: SlotWhere) {
    if (this.heldStack) return;
    const cur = this.slotContent(where, i);
    if (!cur) return;
    const half = Math.ceil(cur.stack / 2);
    if (where === 'inv') this.game.player.inv.removeAt(i, half);
    else if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      const arr = this.equipArray(where);
      cur.stack -= half;
      if (cur.stack <= 0) arr[i] = null;
    }
    else if (this.openChest) {
      cur.stack -= half;
      if (cur.stack <= 0) this.openChest.items[i] = null;
    }
    this.heldStack = { id: cur.id, stack: half, prefix: cur.prefix, ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) }; // 拆半也带词缀+实例样式
    this.heldFrom = where;
    this.refreshAll();
  }

  /** 装备类数组快捷取用（armor/dye/misc/miscDye 四类） */
  private equipArray(where: SlotWhere): Array<{ id: number; stack: number; favorited?: boolean; prefix?: number } | null> {
    const inv = this.game.player.inv;
    if (where === 'armor') return inv.armor;
    if (where === 'dye') return inv.dye;
    if (where === 'misc') return inv.miscEquips;
    return inv.miscDyes;
  }

  /** 放下到背包/宝箱格（合并→交换，装备位校验） */
  private placeHeld(i: number, where: SlotWhere): void {
    if (!this.heldStack) return;
    // 露西斧存取台词（ItemSlot_OnItemTransferred :75-99：CountsAsStorage(箱柜)
    // 状态翻转才说话——存入 Storage / 取回 PickedUp，420t 冷却）
    if (vanillaIdOfItemKey(ITEM_DEFS[this.heldStack.id]?.key ?? '') === 5095
      && (this.heldFrom === 'chest') !== (where === 'chest')) {
      if (where === 'chest') this.game.lucyTransferToStorage();
      else this.game.lucyTransferFromStorage();
    }
    if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      const inv = this.game.player.inv;
      const arr = this.equipArray(where);
      // 部位/配饰/染料/杂项分类校验（ItemSlot.PickItemMovementAction 同源判定）
      if (where === 'armor' && !inv.armorAccepts(i, this.heldStack.id)) return;
      if (where === 'dye' && !inv.dyeAccepts(this.heldStack.id)) return;
      if (where === 'misc' && !inv.miscAccepts(i, this.heldStack.id)) return;
      if (where === 'miscDye' && !inv.dyeAccepts(this.heldStack.id)) return;
      const cur = arr[i];
      // 装备族槽单件语义（ItemSlot.LeftClick case1/2 :1004-1058）：装备/时装/染料/
      // 杂项槽恒容 1 件——空槽多叠只放 1 件余量留光标（Clone+stack--）；占用槽仅
      // 光标单件且异型可交换（IsNotTheSameAs 门）；同型叠入/多叠交换均无动作。
      // 此前整叠入槽+同型合并 = 99 翅膀全上身（2026-08-24 用户截图实报）
      if (!cur) {
        if (this.heldStack.stack === 1) {
          arr[i] = { ...this.heldStack, favorited: false };   // ★SW-AU2：装备/染料/杂项语境（8-12/16-20/33）不保留收藏（:362-366）
          this.heldStack = null;
        } else {
          arr[i] = { ...this.heldStack, stack: 1, favorited: false };
          this.heldStack.stack--;
        }
        // 空装备槽放置音（原版 case1/2 MouseItemSwap 后 SoundID 7 :1018）
        this.game.sfx.play('pickup', 1);
      } else if (this.heldStack.stack === 1 && cur.id !== this.heldStack.id) {
        // 交换前反向校验（取出的物品总是合法的，防御性保留）
        if (where === 'armor' && !inv.armorAccepts(i, cur.id)) return;
        arr[i] = { ...this.heldStack, favorited: false };
        this.heldStack = { ...cur, favorited: false };   // ★SW-AU2：MouseItemSwap 双端清（:1230-1234）——装备面取出到光标同清
        // R4-39（AfterItemSwap,IS57:1975-1985）：装备/杂项槽交换后播音——新入槽件
        // ∈换型表（含 1457 新 6168/6169/6193/6194）→ SoundID 22(Unlock),否则 7(Grab)
        const nv = vanillaIdOfItemKey(ITEM_DEFS[this.heldStack.id]?.key ?? '');
        this.game.sfx.play(nv > 0 && AFTER_ITEM_SWAP.has(nv) ? 'unlock' : 'pickup', 1);
      } else {
        return; // 同型叠入 / 光标多叠对占用槽：原版无动作
      }
      this.refreshAll();
      // 成就：装备态检查（拖拽落装备位 = HandleOnEquip 同义路径）
      this.game.achNotifyEquipChanged();
      return;
    }
    if (where === 'inv') {
      const inv = this.game.player.inv;
      if (!inv.canAccept(i, this.heldStack.id)) return; // 装备位校验失败：弹回原处
      const cur = inv.slots[i];
      // 成就：光标物落主背包格（ItemSlot case 0 :932 NotifyItemPickup：MouseItemSwap/
      // 并入后 `inv[slot].stack > 0 && context == 0` 才发——落背包才发,case-0 语义）
      let landedVid = -1;
      if (!cur) {
        inv.slots[i] = this.heldStack;
        landedVid = vidOf(this.heldStack.id);
        this.heldStack = null;
      } else if (canMergeStack(cur, this.heldStack)) {   // ★SW-AY1 R1：合并门=CanStack 词缀面
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (put > 0) landedVid = vidOf(cur.id);
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else if (inv.canAccept(i, cur.id) === false) {
        return; // 占位物品放不回普通格（理论不发生，防御）
      } else {
        inv.slots[i] = this.heldStack;
        landedVid = vidOf(this.heldStack.id);   // 交换=被放入格者即"拾取"件
        this.heldStack = cur;
      }
      if (landedVid > 0) this.game.achievements.notifyItemPickup(landedVid);
      // 放置/合并/交换音（ItemSlot.cs:987-989 → SoundID 7 Grab）
      this.game.sfx.play('pickup', 1);
    } else {
      const chest = this.openChest;
      if (!chest) return;
      // ★SW-AY1 R7：容器语境按来源取（世界箱 3/银行 4 不保留收藏；虚空保险库
      //  32 ∈ retainFavoriteOnMoveAt（ItemSlot.cs:365）→ 放入/交换双向保留收藏）
      const chestCtx = chestContainerContext(chest.x);
      const keepFav = chestCtx === 32;
      // ★SW-AY1 R8 IsBlockedFromTransferIntoChest（ChestUI.cs:1287-1298）拖放面：
      //  PickItemMovementAction case 4/32（:1483-1492）对收藏钱袋(3213)→存钱罐、
      //  收藏虚空袋(4131/5325)→虚空保险库 拒发移动动作（result=-1 无操作）。
      //  世界箱（context 3）无此门（case 3 直通 :1480-1482）——按容器身份判
      if (this.heldStack.favorited) {
        const hv = vanillaIdOfItemKey(ITEM_DEFS[this.heldStack.id]?.key ?? '');
        // ★SW-BJ1：判别式抽 blockedFromTransferIntoChest 单源（拖放臂/tooltip 行共用）
        if (blockedFromTransferIntoChest(chest.x, hv)) return;
      }
      // ★SW-AU2 2026-09-06 箱语境（3/4）不保留收藏（retainFavoriteOnMoveAt
      //  ItemSlot.cs:362-366 → MouseItemSwap :1230-1234 双端清）——放入箱与箱中
      //  取出到光标的双向面同清
      const cur = chest.items[i];
      if (!cur) {
        chest.items[i] = { ...this.heldStack, favorited: keepFav ? !!this.heldStack.favorited : false };
        this.heldStack = null;
      } else if (canMergeStack(cur, this.heldStack)) {   // ★SW-AY1 R1：合并门=CanStack 词缀面
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else {
        chest.items[i] = { ...this.heldStack, favorited: keepFav ? !!this.heldStack.favorited : false };
        this.heldStack = { ...cur, favorited: keepFav ? !!cur.favorited : false };
      }
      // 箱格放置/合并/交换音（同 :987-989 → SoundID 7）
      this.game.sfx.play('pickup', 1);
    }
  }

  /** 拖拽松手：判定落点（格子/垃圾桶/面板外丢弃/面板空白放回） */
  private resolveDrop(from: { i: number; where: SlotWhere }) {
    const target = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;
    const slotEl = target?.closest?.('.sw-slot') as HTMLElement | null;
    if (slotEl?.dataset.idx !== undefined && slotEl?.dataset.where) {
      const ti = Number(slotEl.dataset.idx);
      const tw = slotEl.dataset.where as SlotWhere;
      if (tw === 'chest' && !this.openChest) return;
      this.placeHeld(ti, tw);
      return;
    }
    if (target?.closest?.('.sw-trash')) {
      this.placeTrash();
      return;
    }
    // 面板外：丢进世界；面板内空白：放回原格。★右下角坞同算面板内（2026-09-02
    // 无框坞在 .sw-panel 之外——漏登记会把拖到坞标签/缝隙的物品当世界抛掷）
    const inPanel = target?.closest?.('.sw-panel, .sw-eqdock, .sw-vinv');
    if (!inPanel) {
      this.throwHeldToWorld();
    } else {
      this.placeHeld(from.i, from.where);
    }
  }

  /** 垃圾桶：丢弃暂存（关闭背包时结算删除） */
  private trashHeld() {
    this.placeTrash();
  }

  /** 拖出面板：以掉落物形式丢在角色面前。速度 = 原版 DropSelectedItem
   *  （Player.cs:4993-4997）：vy=-2、vx=4×朝向+玩家自身水平速度（跑步/坠落
   *  叠加——此前 facing×1.5 不叠速度,抛出距离约为原版 1/3）；noGrabDelay=100
   *  （:4990/:4996 抛出者 100t 内拾不回） */
  private throwHeldToWorld() {
    if (!this.heldStack || !this.game) return;
    const p = this.game.player;
    const key = ITEM_DEFS[this.heldStack.id].key;
    // 丢弃露西 → ThrownAway 台词（Player.cs:4984-4986）
    if (vanillaIdOfItemKey(key) === 5095) this.game.lucyThrownAway();
    const drop = this.game.spawnDrop(p.cx + p.facing * 18, p.y + 6, key, this.heldStack.stack,
      p.facing * 4 + p.vx, -2);
    if (drop) drop.noGrabDelay = 100;
    this.heldStack = null;
    this.heldFrom = null;
  }

  /** 光标持有物的 ghost 跟随 */
  private moveGhost() {
    if (!this.heldStack) {
      if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
      return;
    }
    if (!this.ghostEl) {
      this.ghostEl = el('div', 'sw-drag-ghost');
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(this.game, this.heldStack.id);
      img.draggable = false;
      this.ghostEl.appendChild(img);
      document.body.appendChild(this.ghostEl);
    }
    // ★批III② 收藏态金边（Inventory_Back10 同 slot paintSlot 档——ItemSlot :1966-1985）
    const favFrame = 'url(sprites/vanilla/Inventory_Back10.png)';
    if (this.heldStack.favorited) {
      if (!this.ghostEl.dataset.fav) {
        this.ghostEl.dataset.fav = '1';
        this.ghostEl.style.backgroundImage = favFrame;
        this.ghostEl.style.backgroundSize = '100% 100%';
      }
    } else if (this.ghostEl.dataset.fav) {
      delete this.ghostEl.dataset.fav;
      this.ghostEl.style.backgroundImage = '';
    }
    const img = this.ghostEl.querySelector('img') as HTMLImageElement;
    const url = iconUrl(this.game, this.heldStack.id);
    // ★getAttribute 比较(2026-08-17 trace 定位):img.src 属性返回绝对化 URL,
    // dataURL 场景恒不等 → 每次 mousemove 重设 src = 同图反复重新光栅化
    // (trace 实锤:同一 pixelRef id 被画 1573 次,270/s 持续流)
    if (img.getAttribute('src') !== url) img.src = url;
    let cnt = this.ghostEl.querySelector('.cnt') as HTMLElement | null;
    if (this.heldStack.stack > 1) {
      if (!cnt) { cnt = el('span', 'cnt'); this.ghostEl.appendChild(cnt); }
      cnt.textContent = String(this.heldStack.stack);
    } else cnt?.remove();
    // ★批III② MouseItem SM2 辉光（ItemSlot :2500-2526）：num20=glow²、放大倍率
    //   num21=Remap(num20,1→0,1→2)=1+num20、uColor=OurFavoriteColor——光晕帧垫在
    //   本体图下 lighter 叠加（原版 Immediate pass 第二次 Draw 在本体之上,
    //   加算观感等价,层级登记）
    const nowMs = performance.now();
    const glowLeft = this.cursorGlowUntil - nowMs;
    let halo = this.ghostEl.querySelector<HTMLCanvasElement>('.halo');
    if (glowLeft > 0 && this.heldStack.id === this.cursorGlowId) {
      const glow = Math.max(0, Math.min(1, glowLeft / UI.CURSOR_GLOW_MS));
      const baked = img.complete && img.naturalWidth ? this.mouseHaloFrame(img, glow) : null;
      if (baked) {
        if (!halo) {
          halo = document.createElement('canvas');
          halo.className = 'halo';
          halo.style.cssText = 'position:absolute;left:0;top:0;width:40px;height:40px;'
            + 'image-rendering:pixelated;mix-blend-mode:lighter;pointer-events:none;';
          this.ghostEl.insertBefore(halo, this.ghostEl.firstChild);
        }
        const num20 = glow * glow;
        const scaleMul = 1 + num20;                            // Remap(num20,1,0,1,2) :2513
        const px = Math.round(40 * scaleMul);
        halo.width = baked.width; halo.height = baked.height;
        const hctx = halo.getContext('2d');
        hctx?.drawImage(baked, 0, 0);
        halo.style.width = `${px}px`;
        halo.style.height = `${px}px`;
        halo.style.left = `${(40 - px) / 2}px`;
        halo.style.top = `${(40 - px) / 2}px`;
        halo.style.display = '';
      } else halo && (halo.style.display = 'none');
    } else if (halo) halo.remove();
    this.ghostEl.style.transform = `translate(${this.mouseX - 20}px, ${this.mouseY - 20}px)`;
  }

  /** 稀有度着色（Main.cs GetItemNameColor :20415-20473 主干） */
  private rarityColor(rare: number): string {
    if (rare <= -13) return '#FF6400';
    if (rare === -12) return `rgb(255,${Math.floor((Math.sin(performance.now() / 60) + 1) * 127)},0)`; // expert Disco
    if (rare === -11 || rare === -1) return '#828282';
    if (rare === 0) return '#ffffff';
    if (rare === 1) return '#9696ff';
    if (rare === 2) return '#96ff96';
    if (rare === 3) return '#ffc896';
    if (rare === 4) return '#ff9696';
    if (rare === 5) return '#ff96ff';
    if (rare === 6) return '#d2a0ff';
    if (rare === 7) return '#96ff0a';
    if (rare === 8) return '#ffff0a';
    if (rare === 9) return '#0affff';
    if (rare === 10) return '#ffaa66';
    return '#b42cff';
  }

  /** 槽位悬停详情气泡。override：非槽位锚点（道具搜索结果行/商店格位）——slot 传
   *  合成槽内容（stack 1 无词缀/收藏），anchor 传气泡定位锚元素；shopCell = 商店
   *  格位悬停（SW-BJ22：context 15 HoverItem.buy 语义 → tooltip 价格行走买入价） */
  private showTooltipFor(i: number, where: SlotWhere, override?: { slot?: { id: number; stack: number; prefix?: number }; anchor?: HTMLElement; shopCell?: { price: number; medal?: number } }) {
    let s = (override?.slot ?? this.slotContent(where, i)) as { id: number; stack: number; favorited?: boolean; prefix?: number } | null;
    // LoadoutShare 空槽悬停（ItemSlot.MouseHover IS57:3174-3178）：装备/染料格空槽
    // 悬停时共享件代打（GetSharedLoadoutItem → GetEffectiveArmor/Dye）——tooltip
    // 全文 + "共享自配装N"行随下方 R4-15 行族自然接上。曾缺 = 空槽早退无任何提示
    //（★override 判据按【内容覆写】位算——仅锚定位的 override 不抑制共享代打）
    if (!s && !override?.slot && (where === 'armor' || where === 'dye')) {
      const inv = this.game!.player.inv;
      const from = inv.effectiveSharedFrom(i, where === 'dye');
      if (from !== null) s = (where === 'dye' ? inv.loadouts[from].dye[i] : inv.loadouts[from].armor[i]) ?? null;
    }
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const def = ITEM_DEFS[s.id];
    // 名称按稀有度着色（原版 GetItemNameColor 15 档）：vi_ 物品查 vanilla-itemrare.json
    //（tools/extract-itemrare.mjs 从 Item.cs case 块提取 1643 条）；缺条目 fallback value 近似
    let rare = 0;
    if (def.key.startsWith('vi_')) {
      const vid = parseInt(def.key.slice(3), 10);
      rare = ITEM_RARE[String(vid)] ?? 0;
      if (rare === 0) {
        const v = def.value ?? 0;
        rare = v >= 100000 ? 4 : v >= 10000 ? 3 : v >= 1000 ? 2 : v >= 100 ? 1 : 0;
      }
      // 变体稀有度覆写（Item.cs SetDefaults Variant 分支：remix 世界 112→6/
      //  157→8/725→1 等 10 件；普通世界无覆写）
      rare = variantRareOfVid(vid) ?? rare;
    }
    // 词缀稀有度档位偏移（Item.Prefix :593-600：value≥1.05 档 +1、≥1.2 档 +2 等）
    if (s.prefix) {
      const pv = prefixValueMul(s.prefix);
      if (pv >= 1.2) rare = Math.min(11, rare + 2);
      else if (pv >= 1.05) rare = Math.min(11, rare + 1);
      else if (pv <= 0.8) rare = Math.max(-1, rare - 2);
      else if (pv <= 0.95) rare = Math.max(-1, rare - 1);
    }
    const nameColor = this.rarityColor(rare);
    // 词缀名前缀（Lang.GetPrefixedItemName：Prefix.{ConstName} + 物品名）
    const prefixName = s.prefix ? prefixDisplayName(s.prefix) : '';
    // 名称行（GetHoverName :420-427：不加粗、堆叠>1 追加 " (N)"；稀有度色）
    const stackSuffix = s.stack > 1 ? ` (${s.stack})` : '';
    // 变体名后缀（ItemVariants：remix/getGood/mechdusa 世界激活件显示官方变体名
    //  ——ItemVariant.Stronger「更强」等，l10n 官方键随产物内置。★1456 客户端
    //  ItemVariant.Description 仅为 NetworkText 数据面，无 tooltip 渲染消费——
    //  此后缀为本仓可读性标注（任务 M2 项 4），颜色取对话框蓝灰弱化）
    const variantSuffix = def.key.startsWith('vi_')
      ? (() => {
        const kind = activeVariantOfVid(parseInt(def.key.slice(3), 10));
        if (!kind) return '';
        const label = Lang.text(VARIANT_L10N_KEY[kind]);
        return label ? ` <span style="color:#7899ec">(${label})</span>` : '';
      })()
      : '';
    let html = `<span style="color:${nameColor}">${prefixName}${Lang.itemNameByKey(def.key)}${stackSuffix}</span>${variantSuffix}`;
    if (s.favorited) html += ` <span style="color:#ffb347">★</span>`;
    // ---- 统计行（MouseText_DrawItemTooltip_GetLinesInfo，Main.cs:20488-20920 1:1，
    //      构建器在 ui/itemTooltip.ts）：vi_ 全量——伤害[+类型后缀]/暴击/速度档/击退档/
    //      渔力鱼饵/可装备/时装/防御/镐斧锤力/恢复/耗魔/可放置·弹药·消耗品/材料/
    //      容器/Buff 持续/词缀差分；legacy 物品维持原近似 ----
    const g = this.game as unknown as {
      player?: {
        damageMult(k: 'melee' | 'ranged' | 'magic' | 'summon'): number;
        critChance(k: 'melee' | 'ranged' | 'magic'): number;
        equipStats?: { manaCostMul?: number; kbGlove?: boolean; setBonus?: { name?: string } | null };
        buffs?: { has?: (b: number) => boolean };
      };
      anglerQuestItemId?: () => number;
    };
    const gp = g.player;
    // 套装奖励文本（player.setBonus ← ArmorSetBonus.name → l10n ArmorSetBonus.*）
    let setBonusText: string | null = null;
    {
      const sbName = gp?.equipStats?.setBonus?.name;
      if (sbName) {
        const path = `ArmorSetBonus.${sbName}`;
        if (Lang.has(path)) setBonusText = Lang.text(path) || null;
      }
    }
    const tps = gp ? {
      dmgMult: { melee: gp.damageMult('melee'), ranged: gp.damageMult('ranged'), magic: gp.damageMult('magic'), summon: gp.damageMult('summon') },
      crit: { melee: gp.critChance('melee'), ranged: gp.critChance('ranged'), magic: gp.critChance('magic') },
      manaCostMul: gp.equipStats?.manaCostMul ?? 1,
      kbGlove: !!gp.equipStats?.kbGlove,
      kbBuff: !!gp.buffs?.has?.(BuffType.Titan),      // 泰坦 108 → kbBuff（:20812 近战击退×1.5）
      setBonusText,
    } : null;

    // 物品自带说明（原版 item.ToolTip 渲染段 Main.cs:20783-20798 ← l10n ItemTooltip.*）。
    // ★先 has() 再取（缺失键静默空，铜剑/药水/钱币等老物品本无静态 tooltip）
    let staticTip: string | null = null;
    if (def.key.startsWith('vi_')) {
      const vid = parseInt(def.key.slice(3), 10);
      const nameKey = ITEM_NAME_BY_ID[vid];
      if (nameKey) {
        const path = `ItemTooltip.${nameKey}`;
        if (Lang.has(path)) {
          let tip = Lang.text(path);
          // 旗帜族 tooltip（{$NPCName.None} 构建期已落为裸键名,原版 L171 语义）:
          // NPCName.None → 该旗对应 NPC 的显示名（原版由旗帜 tooltip 代码动态注入）
          if (tip && tip.includes('NPCName.None')) {
            const bn = bannerNpcOfItem(vid);
            if (bn > 0) tip = tip.split('NPCName.None').join(Lang.npcName(bn) ?? '');
          }
          staticTip = tip || null;
        }
      }
    }
    if (def.desc) staticTip = staticTip ? `${staticTip}\n${def.desc}` : def.desc;
    // ---- 悬停上下文（低频行族门数据，Main.cs:20178-20220）----
    const vid = def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1;
    // 研究（:21163-21178 旅程角色 difficulty==3）
    const research = (g as unknown as {
      research?: { tryGetSacrificeNumbers(id: number): { have: number; need: number } | null };
      world?: { isJourney?: boolean };
    });
    const ctx: import('./itemTooltip').TooltipContext = {
      research: research.research && (g as unknown as { world: { difficulty: number } }).world?.difficulty === 3
        ? research.research.tryGetSacrificeNumbers(vid) : undefined,
      // 商店（:20310-20402 npcShop>0——NpcShop 面板开着时以买入价显示）：
      // 价格 = item.value×5 买入 / ÷5 卖出（GetItemExpectedPrice 近似走 def.value）
      // ★SW-BJ22 词缀随行（Item.cs:596-597 value 缩放进卖价）；shopCell =
      //  商品格位买入价（context 15）；无 shopCell = 玩家物品卖出价语义
      shop: this.shopTooltipContext(def, vid, s.stack, { prefix: s.prefix, shopCell: override?.shopCell }),
      expert: rare === -12,
      master: rare === -13,
      anglerQuestItemId: g.anglerQuestItemId?.() ?? 0,
      // 社交槽语义（dye 槽 / armor 社交位——本仓 dye 槽 = 原版 social dye 位）
      socialSlot: where === 'dye' || where === 'miscDye',
    };
    let linesHtml = '';
    // ---- LoadoutShare 行族（R4-15,M57:20824-20833 共享两行 + :21517-21519 首用提示）：
    // 装备/染料格（canLoadoutShareAt[8-12],IS57:367-371）悬停时,紧随名称行（GetLinesInfo
    // 里在全部统计行之前）：共享来源行 > 共享标记行 > （未收藏且未用过共享时）提示行。
    // 提示色 = OurFavoriteColor(255,231,69) α190（Main.cs:886/:21520）;共享两行走默认
    // 文字色（GetLinesInfo 未赋 lineColors）。★misc 族无此行族（canLoadoutShareAt 不含,
    // R4-15③ 清偿——此前 favorited misc 误显"已共享"）。ShowLoadoutShareHint 走
    // options 持久化（R4-14 清偿,M57:4303/:4645 config.json 同位）
    if (where === 'armor' || where === 'dye') {
      const inv = this.game.player.inv;
      const from = inv.effectiveSharedFrom(i, where === 'dye');
      if (from !== null) {
        linesHtml += `<br>${Lang.text('UI.ItemLoadoutSharedFrom', from + 1)}`;
      } else if (s.favorited) {
        linesHtml += `<br>${Lang.text('UI.ItemLoadoutShared')}`;
      } else if (options.data.showLoadoutShareHint) {   // ShowLoadoutShareHint（options 持久化,R4-14 清偿;Main.cs:21517 同门）
        linesHtml += `<br><span style="color:rgba(255,231,69,0.75)">${Lang.text('UI.ItemLoadoutShareHint')}</span>`;
      }
    }
    // ★SW-AU2 2026-09-06 收藏两行（Main.cs:20841-20845 `else if (item.favorited)`：
    // tip[56] "Marked as favorite" + tip[57] "Quick trash, stacking, and selling
    // will be blocked" = LegacyTooltip.56/57）——与 LoadoutShare 行族同一 if/else
    // 链（:20824/:20841），收藏件走装备/染料行时不重复出这两行
    else if (s.favorited) {
      linesHtml += `<br>${Lang.text('LegacyTooltip.56')}`;
      linesHtml += `<br>${Lang.text('LegacyTooltip.57')}`;
      // ★SW-BJ1 2026-09-06 收藏自锁行（Main.cs:20846-20852）：容器开着时
      // IsBlockedFromTransferIntoChest（ChestUI.cs:1287-1298：收藏钱槽 3213 →
      // 存钱罐 bank、收藏虚空袋 4131/5325 → 虚空袋 bank4）→ UI.ItemCannotBePlaced-
      // InsideItself（"此物品无法被放入其自身"）。可达性：CAN_FAVORITE_AT 含背包
      // 0/1/2/32 槽（SlotActions.ts:61），收藏钱袋/虚空袋存在（拖放臂同判别式
      // 已挡移动）——旧注「容器族不产生收藏标记」系误判,本行为差为真
      if (this.openChest
        && blockedFromTransferIntoChest(this.openChest.x,
          vanillaIdOfItemKey(ITEM_DEFS[s.id]?.key ?? ''))) {
        linesHtml += `<br>${Lang.text('UI.ItemCannotBePlacedInsideItself')}`;
      }
    }
    for (const ln of assembleTooltipLines(def, s, tps, staticTip, ctx)) {
      const color = ln.journeyColor ? '#B46BD8' : ln.color;   // Colors.JourneyMode 紫
      if (ln.yoyoLogo) { linesHtml += `<br><img class="sw-yoyo-logo" src="sprites/vanilla/OneDropLogo.png" alt="">`; continue; }
      linesHtml += `<br>${color ? `<span style="color:${color}">${ln.text}</span>` : ln.text}`;
    }
    // 脉冲只作用于文字层（.sw-tooltip-lines）——面板底色恒定（原版 :20256 逐行
    // lineColors[k] *= mouseTextColor/255 只乘文字色，DrawInvBG 面板色不变）
    // ★首行 br 必须保留（2026-08-21 用户报"参数拼在名称后"）：曾 replace(/^<br>/,'')
    //   把首个换行剥掉 → "铜短剑5 伤害"拼行；原版名称行后即换行（:20488 行链）
    this.tooltip.innerHTML = `<div class="sw-tooltip-lines">${html}<span style="display:none"></span>${linesHtml}</div>`;
    this.tooltip.style.display = 'block';
    this.startTooltipPulse();
    this.applyTooltipBg();
    // 定位：锚槽右侧（原版跟鼠标+toolTipDistance；槽锚定确定性更好），屏幕钳制
    // （:20241-20250 num4=18 边距）
    const slotEl = override?.anchor ?? this.slotEl(i, where);
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
      let left = r.right + 8, top = r.top;
      if (left + tw > window.innerWidth - 18) left = Math.max(0, window.innerWidth - tw - 18);
      if (top + th > window.innerHeight - 18) top = Math.max(0, window.innerHeight - th - 18);
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    }
  }

  /** 商店悬停上下文（MouseText_DrawItemTooltip_AddShopLines Main.cs:20632-20402，
   *  SW-BJ22 2026-09-07 逐句重锚）。原版语义：门 = npcShop>0 && value≥0 && 非钱币
   *  （:20634）；价格行买入/卖出由 HoverItem.buy 分流——buy 只在商店格悬停置位
   *  （MouseHover context 15 ItemSlot.cs:3197-3201），背包/热栏格悬停恒 false =
   *  卖出价行（旧实现把货架物品的背包悬停也判成买入价，系对 :3200 的误读，本刀
   *  纠正）。卖出价 = computeSellValue 全链（calcForSelling÷5 min1 ×stack + 回购
   *  差额 :20652-20660，与 Player.SellItem :34732-34743 同式——快乐度 ÷PriceAdjustment
   *  /词缀 value 缩放/回购记全参与）；calcForSelling≤0 → tip[51] 无价值行
   *  （:20731-20738 type!=3817 门——散护卫勋章 3817 不显「无价值」） */
  private shopTooltipContext(def: (typeof ITEM_DEFS)[number], vid: number, stack: number,
    opts?: { prefix?: number; shopCell?: { price: number; medal?: number } }): { buy: boolean; priceCopper: number; medalPrice?: number } | null {
    if (!this.game.npcShopOpen) return null;   // Main.npcShop<=0 早退（:20634）
    if (vid >= 71 && vid <= 74) return null;   // 钱币无价格行（:20634 type 71-74 早退）
    // 商品格位悬停（context 15 → HoverItem.buy=true）→ 买入价行 tip[50]
    // （:20638 num=calcForBuying；勋章条目走 GetPriceText 勋章文案 :20644-20648，
    //  CustomCurrencySingleCoin.GetPriceText :103-107）
    if (opts?.shopCell) {
      if (opts.shopCell.medal !== undefined) return { buy: true, priceCopper: opts.shopCell.medal, medalPrice: opts.shopCell.medal };
      return { buy: true, priceCopper: Math.max(1, opts.shopCell.price) };
    }
    // 玩家物品（背包/热栏/箱格等悬停，buy=false）→ 卖出价行 tip[49]：
    // computeSellValue = SellItem :34732-34743 同式（词缀缩放+快乐度÷+回购差额）
    const quote = computeSellValue(vid, Math.max(1, stack), {
      prefix: opts?.prefix ?? 0,
      priceAdjustment: (this.game as unknown as { shopHappinessMul?: number }).shopHappinessMul,
      discountAvailable: this.game.player.equipStats.discount,
      sellbackAmount: (this.game as unknown as { shopSellbackMemo?: Map<string, number> })
        .shopSellbackMemo?.get(`${vid}:${opts?.prefix ?? 0}`) ?? 0,
    });
    if (quote.sellable) return { buy: false, priceCopper: quote.copper };   // :20640 num>0 支
    return vid === 3817 ? null : { buy: false, priceCopper: 0 };            // :20731-20738 tip51 门
  }

  /** mouseTextColor 亮度脉冲（DoUpdate_AnimateCursorColors :18064-18075：+1/tick
   *  往返 190↔255；tooltip 显示期间持续驱动 filter 亮度） */
  private tooltipPulseRaf = 0;
  private tooltipPulseVal = 255;
  private tooltipPulseDir = -1;
  private startTooltipPulse(): void {
    cancelAnimationFrame(this.tooltipPulseRaf);
    this.tooltip.style.filter = '';   // 清历史整元素滤镜（面板恒定，勿再暗化）
    const lines = this.tooltip.querySelector('.sw-tooltip-lines') as HTMLElement | null;
    if (!lines) return;
    let last = performance.now();
    const step = (now: number) => {
      if (this.tooltip.style.display !== 'block') return;
      for (let t = 0; t < Math.round((now - last) / 16.7); t++) {
        this.tooltipPulseVal += this.tooltipPulseDir;
        if (this.tooltipPulseVal >= 255) { this.tooltipPulseVal = 255; this.tooltipPulseDir = -1; }
        if (this.tooltipPulseVal <= 190) { this.tooltipPulseVal = 190; this.tooltipPulseDir = 1; }
      }
      last = now;
      // 文字层亮度 = mouseTextColor/255（:20256 语义——面板不参与）
      lines.style.filter = `brightness(${(this.tooltipPulseVal / 255).toFixed(3)})`;
      this.tooltipPulseRaf = requestAnimationFrame(step);
    };
    this.tooltipPulseRaf = requestAnimationFrame(step);
  }

  /** tooltip 九宫底应用（Inventory_Back13 × (23,25,81)×0.925，:20252-20255）：
   *  素材未就绪时挂一次性 onload 补刷（首次悬停竞态走兜底色）。
   *  悬停文本框开关（SettingsEnabled_OpaqueBoxBehindTooltips，默认 true）：关 =
   *  无底板纯文字（原版 :20256 支）——内联清底，display:none 阶段也先清 */
  private applyTooltipBg(): void {
    if (!options.data.opaqueBoxBehindTooltips) {
      this.tooltip.style.background = 'transparent';
      this.tooltip.style.border = 'none';
      this.tooltip.classList.add('sw-tooltip-nobox');
      return;
    }
    this.tooltip.classList.remove('sw-tooltip-nobox');
    if (this.tooltip.style.display !== 'block') return;
    const w = Math.ceil(this.tooltip.offsetWidth), h = Math.ceil(this.tooltip.offsetHeight);
    const bgUrl = tooltipBgDataUrl(w, h);
    if (bgUrl) {
      this.tooltip.style.background = `url(${bgUrl})`;
      this.tooltip.style.border = 'none';
      this.tooltip.style.borderRadius = '0';
    } else {
      this.tooltip.style.background = 'rgba(21,23,75,0.93)';   // 兜底色（≈原版 0.925）
      const img = invBgEnsure();
      if (img instanceof HTMLImageElement && !(img.width > 0)) {
        img.addEventListener('load', () => this.applyTooltipBg(), { once: true });
      }
    }
  }

  // ============ 背包 + 合成 ============

  /** 背包面板是否打开（原版 Main.playerInventory 语义——呼吸计锚点分支用，
   *  Game.render 经 window.__swUI 读取；与 UI.ts:802 同款活取） */
  get inventoryOpen(): boolean {
    return !!this.invPanel && this.invPanel.style.display === 'block';
  }

  /** 住房面板开合回写（mainFlow.openHousing / HousingPanel.onClosed）——
   *  图标切 DisplaySlots_4(常态)/5(住房开) */
  setHousingOpen(v: boolean): void {
    this.housingOpen = v;
    this.refreshHousingBtn();
  }

  private refreshHousingBtn(): void {
    if (this.housingBtn) {
      this.housingBtn.style.backgroundImage
        = `url(sprites/vanilla-ui/UI_DisplaySlots_${this.housingOpen ? 5 : 4}.png)`;
    }
  }

  /** 收住房右缘条（关面板兜底:E/Esc/关背包/退菜单都带走它）——destroy→onClosed
   *  会重入 openInventory,彼时背包尚未显示,重入支直接开背包后外层幂等续行 */
  private closeHousingPanel(): void {
    this.housingOpen = false;
    this.refreshHousingBtn();
    if (document.querySelector('.sw-housing-panel')) {
      (window as unknown as { __swHousingPanel?: { destroy(): void } }).__swHousingPanel?.destroy();
      // destroy 已 canvas.remove;裸移除兜底（面板若被外部摘过节点）
      document.querySelector('.sw-housing-panel')?.remove();
    }
  }

  /** 背包面板贴位：左=热键栏【可视最左】格左缘,顶=其底+8px（2026-08-27 用户要求）；
   *  构建与每次打开时重算。★取槽的 inline left/top 布局目标值（slot 有 80ms 过渡,
   *  rect 会采到中途值）;★扫描全部槽取 min——hotbarEl.firstElementChild 是 (20,20)
   *  锚位元素非首格（用户实测左缘歪 20px 即此因）。透明只调面板底色 alpha、边框/
   *  投影弱化（opacity 曾连内容一起半透,用户纠正） */
  private positionInvPanel(): void {
    if (!this.invPanel) return;
    // ★2026-09-07 刀 2 守卫:vanilla 布局自定位(.sw-vinv fixed inset:0+容器 scale,
    // 见 buildVanillaInventoryPanel/layoutVanilla)——热键栏贴位/透明化全跳过,
    // openInventory 链由此零改动复用
    if (this._builtLayout === 'vanilla') return;
    let best: HTMLElement | null = null;
    let bestL = Infinity;
    for (const s of Array.from(this.hotbarEl?.querySelectorAll<HTMLElement>('.sw-slot') ?? [])) {
      const l = parseFloat(s.style.left);
      if (Number.isFinite(l) && l < bestL) { bestL = l; best = s; }
    }
    const left = best ? Math.max(4, Math.round(bestL)) : 8;
    // ★2026-09-02 用户复报 padding-top 太高：热键栏槽盒 52px 但视觉 ×0.75=39——
    //   按 inline top+height(盒底)贴位会多出 13px 幽灵空隙。改用实测【视觉底】
    //   （getBoundingClientRect 含缩放）+2px 贴合
    const top = best ? Math.round(best.getBoundingClientRect().bottom + 2) : 84;
    // ★2026-09-02 透明化后无框（用户要求）：padding 会把内容往右/下推——面板锚点
    //   内收 padding,使【内容左缘】对齐热键栏最左格左缘、内容顶距热键栏底 8px
    //   （=整体上移;此前内容左/顶各偏 +12）
    const pad = parseFloat(getComputedStyle(this.invPanel).paddingLeft) || 0;
    const panelLeft = Math.max(0, left - pad);
    const panelTop = Math.max(0, top - pad);
    // ★position:fixed/overflow 必须在此维持（.sw-panel 类无定位——曾重写贴位时
    //   丢掉 fixed → 面板回落文档流 = 满宽平铺、left/top 全失效）
    this.invPanel.style.position = 'fixed';
    this.invPanel.style.overflow = 'auto';
    this.invPanel.style.left = `${panelLeft}px`;
    this.invPanel.style.top = `${panelTop}px`;
    this.invPanel.style.maxHeight = `calc(100vh - ${panelTop + 12}px)`;
    // ★2026-09-02 用户要求：背包面板去底去框透明化（试试）——.sw-panel 类的渐变
    //   底/2px 描边/投影全部内联覆盖为透明（此处每次打开重算=权威落点;若要回底色
    //   只需还原本段）。可读性补偿：.sw-inv 作用域给标签/标题加文字投影;
    //   配方行/搜索框/槽位贴图自带底,不受影响
    this.invPanel.style.background = 'transparent';
    this.invPanel.style.border = 'none';
    this.invPanel.style.boxShadow = 'none';
  }

  /** force=跳过开/关翻转（开箱路径 openChestPanel 用：解锁世界输入后「背包开着
   *  右键开箱」可达,翻转语义会把背包连箱子一起关掉） */
  openInventory(force = false) {
    if (!force && this.invPanel.style.display === 'block') {
      this.closeInventory();
      return;
    }
    // 住房条开着(E 切回背包):先收——不收则背包被住房 Canvas 压住
    this.closeHousingPanel();
    this.positionInvPanel();
    this.invPanel.style.display = 'block';
    if (this.eqDockEl) this.eqDockEl.style.display = 'flex';   // 右下角坞随开显
    if (this._builtLayout === 'vanilla') this.vinvPulseStart();   // ★槽底呼吸脉冲(Main.cs:46460-46474)
    // 开背包会引发热键栏重排（slot 80ms left 过渡）——过渡结束后二次贴位校正；
    // 配方列表高度同批二次刷新（首次采样布局未稳,LIST_H 偏大,hover 前不收敛）
    setTimeout(() => {
      this.positionInvPanel();
      this.refreshVanillaCrafting();
    }, 120);
    this.refreshAll();
    // ★2026-09-02 用户要求：背包展开解锁世界操作——原版 playerInventory 开启不拦
    // 输入（移动/跳跃/攻击/挖掘/交互照常,Main.mouseInterface 只在光标压 UI 时拦）。
    // 本仓等价 = 不再置 uiBlocking;「光标压 DOM UI」由 Game.updateUse 的
    // inpOverDomUi 门承担,光标持物由 uiHeldItemRef 门承担。
  }

  /** 装备页追加槽显隐（Player.cs:4279 Shown=解锁∨占格；效果门在 accSlotMax） */
  private refreshEquipExtras(): void {
    const inv = this.game?.player.inv;
    const els = this.equipExtraSlots;
    if (!inv || !els) return;
    const hasAt = (slot: number, dyeSlot: number): boolean =>
      !!inv.armor[slot] || !!inv.dye[dyeSlot];
    const heartShown = (inv.extraAccessory && (inv.gateExpert || inv.gateMaster)) || hasAt(8, 8);
    const masterShown = inv.gateMaster || hasAt(9, 9);
    if (els.equip[0]) els.equip[0].style.display = heartShown ? '' : 'none';
    if (els.equip[1]) els.equip[1].style.display = masterShown ? '' : 'none';
    if (els.dye[0]) els.dye[0].style.display = heartShown ? '' : 'none';
    if (els.dye[1]) els.dye[1].style.display = masterShown ? '' : 'none';
    if (els.vanity[0]) els.vanity[0].style.display = heartShown ? '' : 'none';
    if (els.vanity[1]) els.vanity[1].style.display = masterShown ? '' : 'none';
  }

  closeInventory() {
    this.closeHousingPanel();
    this.invPanel.style.display = 'none';
    if (this.eqDockEl) this.eqDockEl.style.display = 'none';   // 右下角坞随关收
    this.closeItemSearch();
    this.closeGuideSearch();
    this.closeChest();
    // ★SW-FX30 刀②:PipsUseGrid 生命周期(Main.cs:43916 !playerInventory 门 →
    // :43934 DrawInterface_Resources_Buffs 首行 PipsUseGrid=false——原版只在关包态
    // 走 buffs 绘制,即关包当帧清网格态;recStart 归零 = :43926-43930 !PipsUseGrid 支)
    this.vinvPipsUseGrid = false;
    this.vinvCraftRecStart = 0;
    this.vinvSyncGridToggle();
    // ★SW-FX41:NewCraftingUI.Close(quiet:true)(Main.cs:46438-46444 !playerInventory
    //   支——关包当帧静默收窗+OnDeactivate :917-924 清滤器/选中)
    this.vinvCloseModernCraft(true);
    // ★SW-RB14b:!playerInventory ⇒ npcShop=0(Main.cs:42496-42499 DrawInventory 每帧门
    //   `npcShop > 0 && (!playerInventory || talkNPC == -1) → SetNPCShopIndex(0)` +
    //   Main.cs:46434-46441 dead→playerInventory=false 链;1458 :42502/:46440 同式)。
    //   原版关闭商店面 = !playerInventory ∨ 对话关闭 双臂,本仓此前只接对话臂
    //   (closeNpcDialog→npcShopClose):设置浮层开(openInGamePause 收包)/死亡强收包
    //   (tickChestAutoClose→closeInventory)后 npcShopOpen 残留 → 重开背包货架复活
    //   (原版需重按商店钮)。对话臂先走的路径(Esc 链)此处幂等 no-op。
    this.game.npcShopClose();
    // 放回手上物品。★SW-RB4a 2026-09-06 关包光标物归位 1:1（dropItemCheck :5136-5140
    // `!Main.playerInventory` 臂 → GetOrDropItem（ReturnItemFromSlot）→ GetItem + 余量
    // RequestNewItem 落地 Player.cs:5132-5136）：①词缀/实例样式随行入包（曾裸
    // (id,stack)=词缀件关包即洗白——重铸词缀在 getEffectiveArmor/重铸格回流面丢词缀）；
    // ②满包余量落地（曾静默丢弃=物损方向）。
    // ★SW-BP1 2026-09-07（RB4a 债④ / RB5a 债②）：③收藏标记随行入包——原版 GetItem
    // 空格落位 `inventory[i] = returnItem`（Player.cs:39873）=整个 Item 对象回包,
    // favorited 金边随行；并入已有堆时堆位收藏保持（现有堆面不动）。本仓 add 通道
    // 此前不收 favorited=落新堆丢收藏（登记偏差清偿）。④余量落点 p.y→p.cy
    // （GetOrDropItem 尾 RequestNewItem(base.Center) Player.cs:7200-7202=玩家
    // 【中心】,曾用顶 y）。favorited 件空格序升序（GetItem :39681-39698 favorited
    // 臂同向）由 Inventory.add 内接。
    if (this.heldStack) {
      const h = this.heldStack;
      const hDef = ITEM_DEFS[h.id];
      const left = this.game.player.inv.add(h.id, h.stack, h.prefix, h.placeStyle, false, false, !!h.favorited);
      if (left > 0) {
        const p = this.game.player;
        this.game.spawnDrop(p.cx, p.cy, hDef?.key ?? '', left, 0, -2, h.placeStyle);
      }
      this.heldStack = null;
    }
    // 材料格内容归还背包（CraftingGrid 关闭语义）
    this.returnCraftGrid();
    this.craftGridRecipe = null;
    // 垃圾桶为持久槽（Player.trashItem 语义）：关闭背包保留，仅死亡时由 Game 清空
    this.moveGhost();
    // ★2026-09-07 刀 2 守卫(共享区第 5 处):vanilla 布局关包须解除热键栏隐藏
    // (refreshHotbar 开包早退的还原面;classic 关包链无刷新点,main.ts:427 直调)
    if (this._builtLayout === 'vanilla') {
      this.vinvReforgeOpen = false;   // 原版重铸菜单随背包关闭退出(DrawInventory 域内)
      this.vinvGuideMenuOpen = false;   // ★刀19:向导态随背包关闭退出(关包=playerInventory 面同步)
      this.reflowBuffs();             // ★SW-FX10 债④:页2 列内 buff 块回流 HUD 栏(关包当帧)
      this.refreshAll();
    }
    // ★2026-09-02：不再清 uiBlocking——背包自 2026-09-02 起不置位（世界输入解锁）,
    // 无条件清会打翻其他模态面板（手册/表情/图鉴）的 wasBlocking 恢复语义
  }

  // ============ 调试用：道具搜索器（背包面板"🔍 道具搜索"按钮） ============
  private itemSearchEl: HTMLDivElement | null = null;
  /** 搜索面板开启期间 tooltip 的暂离归宿（面板 z1200 > .sw-root z10——tooltip 留在
   *  root 内会被 stacking context 压在面板下,2026-08-27 用户报；搬 body 顶层） */
  private tooltipHome: HTMLElement | null = null;

  /** 打开搜索面板（首用门：道具搜索为超游调试件,明示风险确认一次后
   *  localStorage 持久放行,后续不再拦截——2026-08-27 用户要求） */
  openItemSearch() {
    if (!this.game) return;
    let confirmed = false;
    try { confirmed = localStorage.getItem('sbw.itemSearchConfirmed') === '1'; } catch { /* 隐私模式静默 */ }
    if (!confirmed) { this.showItemSearchGate(); return; }
    this.openItemSearchPanel();
  }

  /** 首用确认弹窗（取消即关；确认写入持久旗并放行） */
  private showItemSearchGate(): void {
    if (document.getElementById('sw-itemsearch-gate')) return;
    const overlay = el('div');
    overlay.id = 'sw-itemsearch-gate';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1250; display:flex; align-items:center; justify-content:center;';
    const panel = el('div');
    panel.style.cssText = 'width:400px; max-width:90vw; box-sizing:border-box; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:14px; display:flex; flex-direction:column; gap:12px; color:#ddd; font-size:13px;';
    panel.appendChild(el('div', 'sw-lbl', '道具搜索'));
    panel.appendChild(el('div', '', '为了游戏体验，如非卡关或调试不建议使用此功能，可能破坏游戏乐趣。确认启用后不再拦截。'));
    const btnRow = el('div');
    btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
    const cancel = el('button', 'sw-btn', '取消');
    cancel.style.cssText = 'margin:0; width:auto; padding:5px 14px; font-size:12px;';
    cancel.addEventListener('click', () => overlay.remove());
    const ok = el('button', 'sw-btn', '确认启用');
    ok.style.cssText = 'margin:0; width:auto; padding:5px 14px; font-size:12px;';
    ok.addEventListener('mousedown', (e) => e.stopPropagation());
    ok.addEventListener('click', () => {
      try { localStorage.setItem('sbw.itemSearchConfirmed', '1'); } catch { /* 隐私模式静默 */ }
      overlay.remove();
      this.openItemSearch();
    });
    btnRow.append(cancel, ok);
    panel.appendChild(btnRow);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /** 搜索面板本体：按 名称/key/原版id 过滤 ITEM_DEFS，点击条目入包 */
  private openItemSearchPanel() {
    if (!this.game) return;
    this.closeItemSearch();
    // tooltip 提到 body 顶层（关闭时归还 root）——否则结果行气泡被面板遮挡
    if (this.tooltip.parentElement !== document.body) {
      this.tooltipHome = this.tooltip.parentElement;
      document.body.appendChild(this.tooltip);
    }
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1200; display:flex; align-items:center; justify-content:center;';
    const panel = el('div');
    panel.style.cssText = 'width:560px; max-height:70vh; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px;';
    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start;';
    titleRow.appendChild(el('div', 'sw-lbl', '道具搜索（点击加入背包）'));
    const closeBtn = el('button');
    closeBtn.textContent = '✕';
    closeBtn.title = Lang.text('Mods.SandboxWorld.UI.Close');
    closeBtn.style.cssText = 'margin:0; width:20px; height:20px; padding:0; flex:none; cursor:pointer;'
      + 'font-size:11px; line-height:1; background:#3a3a4a; color:#ddd; border:1px solid #6b6b8a; border-radius:3px;';
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', () => this.closeItemSearch());
    titleRow.appendChild(closeBtn);
    panel.appendChild(titleRow);
    const input = el('input') as HTMLInputElement;
    input.placeholder = '名称 / key / 原版 id…';
    input.style.cssText = 'width:100%; box-sizing:border-box; padding:6px 8px; background:#1a1a22; color:#eee; border:1px solid #555; border-radius:4px; font-size:14px;';
    panel.appendChild(input);
    const list = el('div');
    list.style.cssText = 'overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px; align-content:flex-start;';
    panel.appendChild(list);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeItemSearch();
    });
    document.body.appendChild(overlay);
    this.itemSearchEl = overlay;

    // 全量条目缓存（一次性构建：id/显示名/小写匹配串）
    // 匹配串含【英文原名】——zh 名只对部分家族含族词（翅膀族 zh 多为"XX之翼"，
    // 搜"翅膀"只见开发者翅膀；搜 wing/翼 才全）——2026-08-13 报障
    // ★同 vid 去重（首个 def 胜出,与 ITEM_INTERNAL_OF_STABLE 归一口径一致）：
    //   桥接批 snake 键 + vanilla.json 循环 Pascal 键曾双注册 1246 组（雷管双行
    //   根因,2026-08-21）——存量双条目不删（ITEM_DEFS id=下标不可平移）,显示层滤掉
    // ★place_v 覆盖去重（2026-08-25 用户报"两个阿比盖尔的花/苔藓双行"）:place_v_*
    //   族（可放置）与惰性 vi_ 注册（无 tile 字段=不可放置死条目)同 tile 并存——
    //   vi_ 件的 createTile tile 已被 place_v 覆盖时不进搜索（保留可用 place_v 件）
    const coveredSheets = new Set<number>();
    for (const d of ITEM_DEFS) {
      const mp = /^place_v_(\d+)_/.exec(d.key);
      if (mp) coveredSheets.add(Number(mp[1]));
    }
    // ★功能件豁免（2026-09-02 神圣种子第三案真凶）：覆盖去重的本意=滤掉「唯一职能
    //  就是铺那格 tile」的惰性 vi_ 死条目；但草种/法杖/苔藓族的 createTile 虽被
    //  place_v 面板块覆盖,它们在 AssortedThings 里是【转化/消耗】功能件（圣种转
    //  泥土、法杖凭空种草、苔藓点石转化——PlantRules assortedPlaceOk/mossPlaceOk）
    //  ⇒ 曾被整族滤出搜索,用户搜「神圣种子」永远只剩面板块。豁免域=种子/法杖 vid
    //  集 ∪ 苔藓转化面。
    const seenVid = new Set<number>();
    const entries = ITEM_DEFS.map((d, id) => {
      const vid = d.key.startsWith('vi_') ? d.key.slice(3, d.key.indexOf('_', 3)) : '';
      const name = Lang.itemNameByKey(d.key) || d.key;
      const en = vid ? (ITEM_NAME_EN_BY_ID[+vid] ?? '') : '';
      return { id, d, name, lc: (name + ' ' + d.key + ' ' + vid + ' ' + en).toLowerCase() };
    }).filter((e) => {
      const m = /^vi_(\d+)_/.exec(e.d.key);
      if (!m) return true;
      const vid = Number(m[1]);
      if (seenVid.has(vid)) return false;
      seenVid.add(vid);
      const ct = vanillaItemCreateTile(vid);
      if (ct !== undefined && coveredSheets.has(ct) && !isFunctionalTileItem(ct)) return false;   // 惰性 vi_ 死条目
      return true;
    });
    // 族词别名（zh 族词分裂：翅膀↔翼——搜"翅膀"也能命中"天使之翼"族；本地
    // 表软链不动 i18n；2026-08-13 报障）。匹配串已含英文原名（搜 wing 全族可见）
    const ALIAS: Record<string, string[]> = { 翅膀: ['翼'], 翼: ['翅膀'] };
    const render = () => {
      const qRaw = input.value.trim().toLowerCase();
      const qs = [qRaw, ...(ALIAS[qRaw] ?? []).map((x) => x.toLowerCase())].filter(Boolean);
      list.textContent = '';
      let shown = 0;
      for (const e of entries) {
        if (qs.length && !qs.some((q) => e.lc.includes(q))) continue;
        if (++shown > 80) {
          list.appendChild(el('div', 'sw-lbl', `…更多结果请细化搜索`));
          break;
        }
        const item = el('div');
        item.title = `${e.name}  [${e.d.key}]`;
        item.style.cssText = 'display:flex; align-items:center; gap:4px; width:170px; padding:3px 5px; background:#1f1f28; border:1px solid #444; border-radius:3px; cursor:pointer; font-size:12px; color:#ddd;';
        // 悬停 = 背包同款详情气泡（2026-08-27 用户要求）——合成槽语义（stack1 无
        // 词缀/收藏）,锚=行元素;离开即收
        item.addEventListener('mouseenter', () =>
          this.showTooltipFor(e.id, 'inv', { slot: { id: e.id, stack: 1 }, anchor: item }));
        item.addEventListener('mouseleave', () => {
          this.tooltip.style.display = 'none';
          cancelAnimationFrame(this.tooltipPulseRaf);
        });
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game!, e.id);
        img.style.cssText = 'width:24px; height:24px; image-rendering:pixelated; flex:none;';
        item.appendChild(img);
        const lbl = el('span');
        lbl.textContent = e.name;
        lbl.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        item.appendChild(lbl);
        item.addEventListener('click', () => {
          // 可堆叠给一组(≤99)，不可堆叠给 1；溢出由 inv.add 处理
          const n = e.d.maxStack > 1 ? Math.min(e.d.maxStack, 99) : 1;
          this.game!.player.inv.add(e.id, n);
          this.game!.cb.onInventoryChanged?.();
          this.refreshAll();
        });
        list.appendChild(item);
      }
      if (!shown) list.appendChild(el('div', 'sw-lbl', '无匹配'));
    };
    input.addEventListener('input', render);
    render();
    input.focus();
  }

  closeItemSearch() {
    if (this.itemSearchEl) {
      this.itemSearchEl.remove();
      this.itemSearchEl = null;
    }
    // tooltip 归位 root + 收起（面板关,气泡无锚）
    if (this.tooltipHome) {
      this.tooltipHome.appendChild(this.tooltip);
      this.tooltipHome = null;
    }
    this.tooltip.style.display = 'none';
  }

  // ============ 重铸（哥布林工匠，Main.InReforgeMenu + ReforgeItemInReforgeSlot） ============

  /** 重铸槽物品（Main.reforgeItem；关闭时归还背包，Player.cs:4912） */
  reforgeItem: { id: number; stack: number; prefix?: number } | null = null;
  private reforgeEl: HTMLDivElement | null = null;
  private reforgeCostEl: HTMLElement | null = null;
  private reforgeSlotEl: HTMLElement | null = null;

  /** 打开重铸面板：物品槽（放 1 件）+ 费用 + 重铸按钮。
   *  ★2026-09-09 刀 12(vanilla 原位化):vanilla 布局=直接在背包界面画重铸
   *  (Main.cs:42268-42393:槽 (50,270) ctx5/文字 (100,270)/锤 (120,310) cooldown60/
   *  储蓄 (180,258));modal 保留给 classic */
  showReforge(): void {
    if (this._builtLayout === 'vanilla') {
      this.vinvReforgeOpen = true;
      this.openInventory(true);   // 原版 NPCChatText_TinkererReforge → OpenInventory
      this.refreshAll();
      return;
    }
    this.closeReforge();
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1150; display:flex; align-items:center; justify-content:center;';
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'width:360px;';
    panel.appendChild(el('div', 'sw-title', '⚒ ' + Lang.inter(19)));
    const hint = el('div', 'sw-lbl', Lang.inter(20)); // 将物品放到此处重铸
    panel.appendChild(hint);
    // 槽位行：物品槽 + 费用
    const row = el('div');
    row.style.cssText = 'display:flex; align-items:center; gap:12px; margin:8px 0;';
    const slot = el('div', 'sw-slot');
    slot.style.cssText += 'width:52px; height:52px;';
    slot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) {
        // 放入 1 件（ItemSlot :757-764：reforgeItem = item.Clone() stack=1）
        if (this.reforgeItem) return;
        if (!this.game.canReforge(this.heldStack)) { this.toast(Lang.text('Mods.SandboxWorld.Reforge.CannotReforge')); return; }
        this.reforgeItem = { id: this.heldStack.id, stack: 1, prefix: this.heldStack.prefix }; // 保留词缀
        this.heldStack.stack -= 1;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else if (this.reforgeItem) {
        // 取回
        this.heldStack = this.reforgeItem;
        this.reforgeItem = null;
      }
      this.refreshReforge();
    });
    slot.addEventListener('mouseenter', () => {
      if (this.reforgeItem) this.showReforgeTooltip();
    });
    slot.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    this.reforgeSlotEl = slot;
    row.appendChild(slot);
    const costWrap = el('div');
    this.reforgeCostEl = el('div', '', '');
    this.reforgeCostEl.style.cssText = 'font-size:13px; color:#ffe8a0;';
    costWrap.appendChild(this.reforgeCostEl);
    row.appendChild(costWrap);
    panel.appendChild(row);
    const doBtn = el('button', 'sw-btn', Lang.inter(19));
    doBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (!this.reforgeItem) return;
      const cost = this.game.reforgeCost(this.reforgeItem);
      if (this.game.coinsOwned() < cost) {
        this.toast(Lang.text('Mods.SandboxWorld.Reforge.TooExpensive', Lang.inter(46)));
        return;
      }
      const np = this.game.doReforge(this.reforgeItem);
      if (np < 0) { this.toast(Lang.text('Mods.SandboxWorld.Reforge.Fail')); return; }
      this.toast(`${Lang.inter(46)}: ${cost} · ${prefixDisplayName(np)}`);
      this.refreshReforge();
    });
    panel.appendChild(doBtn);
    const closeBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    closeBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.closeReforge();
    });
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeReforge();
    });
    document.body.appendChild(overlay);
    this.reforgeEl = overlay;
    this.refreshReforge();
  }

  private refreshReforge(): void {
    if (!this.reforgeSlotEl) return;
    // 画槽内容
    const old = this.reforgeSlotEl.querySelector('img');
    old?.remove();
    this.reforgeSlotEl.querySelector('.cnt')?.remove();
    if (this.reforgeItem) {
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(this.game, this.reforgeItem.id);
      img.draggable = false;
      this.reforgeSlotEl.appendChild(img);
    }
    // 费用行（Main.cs:41026：value×stack÷3）
    if (this.reforgeCostEl) {
      if (this.reforgeItem) {
        const cost = this.game.reforgeCost(this.reforgeItem);
        const owned = this.game.coinsOwned();
        this.reforgeCostEl.textContent = `${Lang.inter(46)}: ${formatCopper(cost)}` + (owned < cost ? Lang.text('Mods.SandboxWorld.Reforge.CostShortParen') : '');
        this.reforgeCostEl.style.color = owned < cost ? '#e08a8a' : '#ffe8a0';
      } else {
        this.reforgeCostEl.textContent = '';
      }
    }
    this.refreshAll();
  }

  /** 重铸槽 tooltip（词缀前后对比行） */
  private showReforgeTooltip(): void {
    const s = this.reforgeItem;
    if (!s) return;
    const def = ITEM_DEFS[s.id];
    let rare = 0;
    if (def.key.startsWith('vi_')) rare = ITEM_RARE[String(parseInt(def.key.slice(3), 10))] ?? 0;
    // 变体稀有度/名后缀（同 showTooltipFor）
    const rv = def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1;
    if (rv >= 0) rare = variantRareOfVid(rv) ?? rare;
    const rvKind = rv >= 0 ? activeVariantOfVid(rv) : null;
    const rvLabel = rvKind ? Lang.text(VARIANT_L10N_KEY[rvKind]) : '';
    const prefixName = s.prefix ? prefixDisplayName(s.prefix) : '';
    let html = `<b style="color:${this.rarityColor(rare)}">${prefixName}${Lang.itemNameByKey(def.key)}</b>`
      + (rvLabel ? ` <span style="color:#7899ec">(${rvLabel})</span>` : '');
    if (s.prefix) for (const ln of prefixLines(s.prefix)) {
      html += `<br><span style="color:${ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)'}">${ln.text}</span>`;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    if (this.reforgeSlotEl) {
      const r = this.reforgeSlotEl.getBoundingClientRect();
      this.tooltip.style.left = `${r.right + 8}px`;
      this.tooltip.style.top = `${r.top}px`;
    }
  }

  closeReforge(): void {
    // 归还重铸槽物品（Player.cs:4912：GetOrDropItem）
    if (this.reforgeItem) {
      this.game.player.inv.add(this.reforgeItem.id, this.reforgeItem.stack, this.reforgeItem.prefix); // 归还保留词缀（旧 inv.add 丢 prefix=白重铸）
      this.reforgeItem = null;
    }
    if (this.reforgeEl) {
      this.reforgeEl.remove();
      this.reforgeEl = null;
    }
    this.reforgeSlotEl = null;
    this.refreshAll();
  }

  // ============ 向导配方反查（guideItem → CollectGuideRecipes，组匹配生效） ============

  private guideEl: HTMLDivElement | null = null;
  /** ★SW-AY1 R5 反查面板刷新钩子（openGuideSearch 内注入 changed 闭包,关闭即清）
   *  ——Shift 对换支改 guidePlaced 后由 shiftGuideSwap 触发面板即刻重刷 */
  private guideRefresh: (() => void) | null = null;
  /** Esc 关闭监听（openGuideSearch 挂载/closeGuideSearch 对称摘除） */
  private guideEscHandler: ((e: KeyboardEvent) => void) | null = null;
  /** 手持材料「光标幽灵」（canvas 手持绘制层级低于 DOM 面板——进入反查浮层会看不见
   *  拿着什么、误以为放不进去。DOM 影子只在浮层开启期间存在，z1300>面板1200） */
  private guideGhostEl: HTMLDivElement | null = null;
  private guideGhostMove: ((e: MouseEvent) => void) | null = null;
  /** 图标补图轮询句柄（面板关闭即停） */
  private guideIconTicker: ReturnType<typeof setInterval> | null = null;
  /** 向导反查物理材料槽（Main.guideItem 等价）：放置期间真实持有整组物品，
   *  空手点槽取回、关闭浮层自动归还（NewCraftingUI dropItemCheck 语义）。 */
  /** ★SW-BM1 2026-09-06：增 prefix 位——向导材料槽对换/取回全程保词缀。
   *  ★SW-RB5a 2026-09-07：增 favorited 位——仅 Shift 对换支（裸 Utils.Swap）双向骑行;
   *  左键支（MouseItemSwap 语义,context 7 不在 retainFavoriteOnMoveAt）不置位=双端清 */
  private guidePlaced: { id: number; stack: number; prefix?: number; favorited?: boolean; placeStyle?: number } | null = null;
  /** 反查面板：搜物品 → 列出以它为材料的全部配方（含 RecipeGroup 成员） */
  openGuideSearch(): void {
    this.closeGuideSearch();
    const overlay = el('div') as HTMLDivElement;
    overlay.className = 'sw-guide-overlay';   // 稳定标识（探针/脚本定点清理用）
    // ★容器纯定位层 + 鼠标穿透；面板停靠右上（原版合成窗方位，让开左侧背包）——
    //   playerInventory=true 的本意就是背包与反查同屏交互（用户二轮实报后定案形态）
    overlay.style.cssText = 'position:fixed; inset:0; z-index:1200; pointer-events:none;';
    const panel = el('div');
    panel.style.cssText = 'position:absolute; right:16px; top:88px;'
      + 'width:520px; max-width:min(520px, calc(100vw - 32px));'
      + 'max-height:calc(100vh - 128px); background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px;'
      + 'padding:10px; display:flex; flex-direction:column; gap:8px;'
      + 'box-shadow:0 8px 40px rgba(0,0,0,.55); pointer-events:auto;';
    // ---- 头行：材料槽(实体格) + caption + 关闭（Main.cs:441-447 同位）----
    const slotRow = el('div');
    slotRow.style.cssText = 'display:flex; align-items:center; gap:10px;';
    const vidOfItem = (iid: number): number => {
      const def = ITEM_DEFS[iid];
      const m = def && /^vi_(\d+)_/.exec(def.key);
      return m ? Number(m[1]) : -1;
    };
    const itemNameOfVid = (vid: number): string => {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      return (k && Lang.itemNameByKey(k)) || String(vid);
    };
    const slotBox = el('div', 'sw-guide-slot');
    const slotCaption = el('div');
    slotCaption.style.cssText = 'flex:1; color:#e8e8f4; font-size:13px; line-height:1.5;';
    slotBox.title = Lang.inter(24);
    slotBox.style.cssText = 'width:56px; height:56px; flex:none; display:flex; align-items:center;'
      + 'justify-content:center; border:2px dashed #55506a; border-radius:6px; background:#232030;'
      + 'cursor:pointer; image-rendering:pixelated;';
    const closeBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    closeBtn.style.cssText = 'cursor:pointer; width:auto; margin:0;';
    closeBtn.addEventListener('click', () => this.closeGuideSearch());
    slotRow.appendChild(slotBox);
    slotRow.appendChild(slotCaption);
    slotRow.appendChild(closeBtn);
    panel.appendChild(slotRow);
    // ---- 配方名筛选（对齐 Modern 合成窗自带按名筛列——非“选材料”网格）----
    const filterInput = el('input') as HTMLInputElement;
    filterInput.placeholder = '筛选配方名…';
    filterInput.style.cssText = 'width:100%; box-sizing:border-box; padding:5px 8px; background:#1a1a22; color:#eee; border:1px solid #555; border-radius:4px; font-size:12px;';
    panel.appendChild(filterInput);
    let filterQ = '';
    const recipeList = el('div');
    recipeList.style.cssText = 'overflow-y:auto; flex:1; min-height:140px;';
    panel.appendChild(recipeList);
    overlay.appendChild(panel);
    // 行卡/幽灵样式（幂等注入一次）
    if (!document.getElementById('sw-guide-style')) {
      const st = document.createElement('style');
      st.id = 'sw-guide-style';
      st.textContent = [
        '.sw-guide-overlay .sw-recipe{display:flex;align-items:center;gap:8px;padding:4px 8px;'
          + 'border-radius:4px;background:#232030;border:1px solid #3a3350;margin-bottom:4px;}',
        '.sw-guide-overlay .sw-recipe:hover{background:#34406e;border-color:#5566a0;}',
        '.sw-guide-overlay .sw-recipe.no{opacity:.45;}',
        '.sw-guide-overlay .sw-recipe.no:hover{background:#232030;border-color:#3a3350;}',
        '.sw-guide-overlay .sw-recipe>img.prod{width:28px;height:28px;image-rendering:pixelated;flex:none;}',
        '.sw-guide-overlay .sw-recipe .g-nm{font-size:13px;color:#e8ecf8;white-space:nowrap;}',
        '.sw-guide-overlay .sw-recipe .g-qty{color:#ffd76e;margin-left:4px;}',
        '.sw-guide-overlay .sw-recipe .g-req{margin-left:auto;color:#9a8ab8;font-size:11px;text-align:right;max-width:46%;line-height:1.5;}',
        '.sw-guide-overlay .sw-recipe>img.g-noicon{position:relative;background:#3b3550;border:1px solid #55506a;color:#cfc7ee;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:center;}',
        '#sw-held-ghost{position:fixed;z-index:1300;width:32px;height:32px;pointer-events:none;'
          + 'image-rendering:pixelated;filter:drop-shadow(0 0 4px rgba(0,0,0,.8));}'
        + '#sw-held-ghost .n{position:absolute;right:-2px;bottom:-4px;font-size:12px;color:#fff;'
        + 'text-shadow:1px 1px 0 #000;}',
      ].join('\n');
      document.head.appendChild(st);
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this.guideEl = overlay;
    this.guideEscHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.closeGuideSearch();
    };
    window.addEventListener('keydown', this.guideEscHandler);
    // ---- 槽位驱动（guideItem 变化 → ResetRecipes 即刻刷新，NewCraftingUI 同义）----
    const refreshHeader = () => {
      slotBox.textContent = '';
      if (this.guidePlaced) {
        slotBox.style.borderStyle = 'solid';
        slotBox.style.borderColor = '#8fa1e0';
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game!, this.guidePlaced.id) || '';
        img.style.cssText = 'max-width:46px; max-height:46px; image-rendering:pixelated;';
        img.draggable = false;
        slotBox.appendChild(img);
        slotCaption.textContent = `${Lang.inter(21)} ${itemNameOfVid(this.vidOfItemOf(this.guidePlaced.id))} ×${this.guidePlaced.stack}`;
      } else {
        slotBox.style.borderStyle = 'dashed';
        slotBox.style.borderColor = '#55506a';
        slotCaption.textContent = Lang.inter(24);   // 「在此放置材料」
      }
    };
    /** 取回放置组回背包（溢出→脚下掉落；CloseNPCChatOrSign 出口等价）。
     *  ★SW-BP1 2026-09-07（RB4a 债④ / RB5a 债②）：①favorited 随行（GetOrDropItem
     *  (Main.guideItem) Player.cs:5112-5114 → GetItem 整 Item 对象回包 :39873,
     *  RB5a 对换先行批已让 guidePlaced 携带 favorited,本刀接 add 通道）；
     *  ②余量落点 p.y→p.cy（GetOrDropItem 尾 RequestNewItem(base.Center)
     *  :7200-7202=玩家中心） */
    const takeBackPlaced = (): void => {
      const pl = this.guidePlaced;
      if (!pl || !this.game) return;
      const left = this.game.player.inv.add(pl.id, pl.stack, pl.prefix, pl.placeStyle, false, false, !!pl.favorited);   // ★SW-BM1 随行词缀 + ★SW-RB5a 实例样式随行 + ★SW-BP1 收藏随行
      if (left > 0) {
        const key = ITEM_DEFS[pl.id]?.key ?? '';
        this.game.spawnDrop(this.game.player.cx, this.game.player.cy, key, left);
      }
      this.game.cb.onInventoryChanged?.();
      this.guidePlaced = null;
    };
    // ---- 点击语义 = ItemSlot.cs 对 context7 的通用处理 1:1 ----
    //   放置门(:1502 checkItem.material——本仓以配方原料反查集近似,itemTooltip 注)
    //   左键(PickAction=0 整组迁移)：空手取整组 / 手持→空槽整组 / 同型合并至槽
    //   maxStack / 异型双方皆材料则 SwapItem 对换；右键(RightClick 尾段单枚机)：
    //   每击移动 1 枚（空手取 1 / 手持同型放 1；满格或异型不动）。取→Grab(7)、
    //   右键动一枚→MenuTick(12)、左键放置原版无音效（:920-960 区间零 PlaySound）
    // ★SW-BJ24 2026-09-07：旧式 `vidOfItem(vid) >= 0` 把 vid 误当 ITEM_DEFS 下标二次
    //  解析（ITEM_DEFS 前 610 手写件后接 678 place_ 件——vid∈[610,1288) 整带解析到
    //  place_ 键恒 -1,带内 200 个原料 vid 全误拒：真·圣剑 674/真·永夜之刃 675/
    //  Terra Blade 757/钛金锭 1198/钯金矿 1104/暗影木·红木·珍珠木 619-621/
    //  锡铅钨铂矿锭 699-706——用户实报「武器有时放不了」根因）。原版门 =
    //  checkItem.material（ItemSlot.cs:1502-1507,1458 同式 :1502-1504）,手持件 vid
    //  域直查 materialVids() 即可;mod 件（vidOfItem=-1）维持拒（原版无此域）。
    //  ★同批：材料池双域分池（itemTooltip 注）——旧并集池被 iid 碰撞污染
    //  （钉鞋 975 是原料且内部 iid=24 ⇒ has(24) 假真 ⇒ 木剑 24 误过门）。
    const isMaterialVid = (vid: number): boolean => vid >= 0 && materialVids().has(vid);
    const maxStackOf = (iid: number): number => ITEM_DEFS[iid]?.maxStack ?? 999;
    slotBox.addEventListener('mousedown', (e) => {
      this.guideSlotMouseDown(e as MouseEvent, () => { refreshHeader(); renderRecipes(); applyFilter(); });
    });
    slotBox.addEventListener('contextmenu', (e) => e.preventDefault());
    filterInput.addEventListener('input', () => {
      filterQ = filterInput.value.trim().toLowerCase();
      applyFilter();
    });
    const applyFilter = (): void => {
      for (const row of Array.from(recipeList.querySelectorAll('.sw-recipe'))) {
        (row as HTMLElement).style.display =
          !filterQ || (row.textContent || '').toLowerCase().includes(filterQ) ? '' : 'none';
      }
    };
    const renderRecipes = (): void => {
      recipeList.textContent = '';
      filterInput.value = ''; filterQ = '';
      const vid = this.guidePlaced ? this.vidOfItemOf(this.guidePlaced.id) : null;
      if (vid != null && vid >= 0) this.renderGuideRecipes(recipeList, vid);
    };
    // ---- 图标补图升级器（面板级有界轮询；结构渲染仍由 renderRecipes 承担）----
    const upgradeIcons = (): void => {
      for (const im of Array.from(recipeList.querySelectorAll<HTMLImageElement>('img.prod'))) {
        if (im.dataset.done === '1') continue;
        const key = im.dataset.key ?? '';
        const iid = ITEM_BY_KEY[key];
        const url = this.game && iid !== undefined ? iconUrl(this.game, iid) : '';
        if (url) {
          im.src = url;
          im.classList.remove('g-noicon');
          im.dataset.done = '1';
        } else if (!im.classList.contains('g-noicon')) {
          im.classList.add('g-noicon');       // 首字占位方块，绝不空白破框
          im.dataset.letter = (Lang.itemNameByKey(key) ?? '?')[0] ?? '?';
          im.alt = im.dataset.letter;
        }
      }
    };
    refreshHeader();                                       // ★曾随 v3 重写丢失：初态 caption 恒空
    if (this.guideIconTicker) clearInterval(this.guideIconTicker);
    upgradeIcons();
    let iconTries = 0;
    this.guideIconTicker = setInterval(() => {
      if (!this.guideEl || ++iconTries > 12) { clearInterval(this.guideIconTicker!); this.guideIconTicker = null; return; }
      upgradeIcons();
    }, 500);
    renderRecipes();
    upgradeIcons();
    // ---- 光标幽灵：mousemove 全局尾随；仅在指针位于浮层面板矩形内且手持非空时显形 ----
    if (!this.guideGhostEl) {
      const ghost = el('div') as HTMLDivElement;
      ghost.id = 'sw-held-ghost';
      ghost.style.display = 'none';
      document.body.appendChild(ghost);
      this.guideGhostEl = ghost;
    }
    this.guideGhostMove = (e: MouseEvent) => {
      const ghost = this.guideGhostEl;
      const hs = this.heldStack;
      if (!ghost) return;
      // ★原版手感对齐：canvas 手持绘制恒在最上层跟随——DOM 影子不做任何区域门，
      //   手持期间全屏尾随（否则指向面板的路程中物品“消失”，误以为放不进去）
      if (!hs || hs.stack <= 0) { ghost.style.display = 'none'; return; }
      const iid = hs.id;
      if (ghost.dataset.iid !== String(iid)) {
        ghost.dataset.iid = String(iid);
        ghost.textContent = '';
        const img = document.createElement('img');
        img.src = iconUrl(this.game!, iid) || '';
        img.style.cssText = 'width:32px;height:32px;image-rendering:pixelated;display:block;';
        img.draggable = false;
        ghost.appendChild(img);
        if (hs.stack > 1) {
          const n = document.createElement('span');
          n.className = 'n';
          n.textContent = String(hs.stack);
          ghost.appendChild(n);
        }
      }
      // ★SW-BI1 2026-09-06：非空断言改空守卫（同 refreshCrafting 防御计数器注，
      //  本通道同在 refreshAll 逐帧刷——ghost 内 .n 缺失即空指针刷屏）
      const ghostN = ghost.querySelector('.n');
      if (ghostN) ghostN.textContent = String(hs.stack);
      ghost.style.display = 'block';
      ghost.style.left = `${e.clientX + 10}px`;
      ghost.style.top = `${e.clientY + 8}px`;
    };
    window.addEventListener('mousemove', this.guideGhostMove);
  }

  /** ★刀19:ctx7 槽点击语义共享体(向导反查浮层与 vanilla 布局向导槽共用;ItemSlot.cs
   *  case-0/RightClick 1:1,注释锚见原 openGuideSearch 体内迁前行)。repaint=槽态
   *  变化后的面板重刷(浮层=header/列表/筛选;vanilla=槽绘制+vinvRefreshCraft) */
  private guideSlotMouseDown(e: MouseEvent, repaint: () => void): void {
    e.preventDefault();
    e.stopPropagation();
    const cur = this.heldStack;
    const pl = this.guidePlaced;
    let action: 'none' | 'take' | 'move' = 'none';
    const isMaterialVid = (vid: number): boolean => vid >= 0 && materialVids().has(vid);
    const maxStackOf = (iid: number): number => ITEM_DEFS[iid]?.maxStack ?? 999;
    this.guideRefresh = repaint;   // ★SW-AY1 R5：Shift 对换支（shiftGuideSwap）同刷面板
    if (cur && !isMaterialVid(this.vidOfItemOf(cur.id))) return;   // 放置门不过=原样拒
    if (e.button === 0) {
      if (!cur && pl) {                                            // 空手 → 取整组
        const hadPrefix = (pl as { prefix?: number }).prefix;
        this.heldStack = { id: pl.id, stack: pl.stack,
          ...(hadPrefix !== undefined ? { prefix: hadPrefix } : {}),
          ...(pl.placeStyle !== undefined ? { placeStyle: pl.placeStyle } : {}) };   // ★SW-RB5a 实例样式随行
        this.guidePlaced = null;
        this.game?.sfx.play('pickup');                             // SoundID.Grab(7)
        action = 'take';
      } else if (cur && !pl && isMaterialVid(this.vidOfItemOf(cur.id))) { // 手持 → 空槽整组
        this.guidePlaced = { id: cur.id, stack: cur.stack,
          ...(cur.prefix !== undefined ? { prefix: cur.prefix } : {}),   // ★SW-BM1 保词缀
          ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) };   // ★SW-RB5a 实例样式随行
        this.heldStack = null;
        this.game?.sfx.play('pickup');                             // ★SW-RB5a：case 0 尾奏 SoundID 7（ItemSlot.cs:986-988）
        action = 'move';
      } else if (cur && pl) {
        // ★SW-RB5a 2026-09-07 case 0 1:1（ItemSlot.cs:912 MouseItemSwap 先行 +
        //  :968-985 CanStack 并回）：槽↔手整体对换后,同型同词缀（CanStack,
        //  Item.cs:49870-49877 prefix 相等臂）且双方未满才并回——旧实现「同 vid
        //  即并」漏词缀臂（异词缀同型物并堆=词缀丢失数据面）且槽满时 no-op
        //  （原版=纯对换）;对换不再要求槽内件是材料（vanilla 只门手持侧
        //  checkItem.material,PickItemMovementAction context 7 :1478-1481）。
        //  MouseItemSwap 双端清收藏（context 7 不在 retainFavoriteOnMoveAt
        //  :362-366）——对换产物不带 favorited
        const oldPl = { id: pl.id, stack: pl.stack,
          ...(pl.prefix !== undefined ? { prefix: pl.prefix } : {}),
          ...(pl.placeStyle !== undefined ? { placeStyle: pl.placeStyle } : {}) };
        this.guidePlaced = { id: cur.id, stack: cur.stack,
          ...(cur.prefix !== undefined ? { prefix: cur.prefix } : {}),
          ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) };
        this.heldStack = oldPl;
        const cap = maxStackOf(pl.id);
        if (canMergeStack(cur, pl) && cur.stack !== cap && pl.stack !== cap) {
          if (pl.stack + cur.stack <= cap) {
            this.guidePlaced!.stack = pl.stack + cur.stack;        // 槽吸收手持原堆,手清空
            this.heldStack = null;
          } else {
            const mv = cap - cur.stack;                            // num2 = maxStack − 对换后槽内堆
            this.guidePlaced!.stack = cur.stack + mv;
            this.heldStack!.stack = pl.stack - mv;                 // 余量留手
          }
        }
        this.game?.sfx.play('pickup');                             // case 0 尾奏 SoundID 7（:988）
        action = 'move';
      }
    } else if (e.button === 2) {
      if (!cur && pl && pl.stack > 0) {                            // 空手右键 = 取 1
        const one: { id: number; stack: number; prefix?: number } = { id: pl.id, stack: 1 };
        const pref = (pl as { prefix?: number }).prefix;
        if (pref !== undefined) one.prefix = pref;
        this.heldStack = one;
        pl.stack -= 1;
        if (pl.stack <= 0) this.guidePlaced = null;
        UISfx.click();                                             // RightClick 内 PlaySound(12)
        action = 'take';
      } else if (cur && pl && canMergeStack(cur, pl)               // ★SW-RB5a：CanStack 词缀面（:1639）
        && cur.stack < maxStackOf(cur.id) && pl.stack > 0) {       // 手持同型不满 → 放 1
        pl.stack += 1; cur.stack -= 1;
        if (cur.stack <= 0) this.heldStack = null;
        UISfx.click();
        action = 'move';
      }
    }
    if (action !== 'none') {
      repaint();
      if (this.guideGhostMove) this.guideGhostMove(e as unknown as MouseEvent);   // 立即重算影子显隐(浮层面)
    }
  }

  /** 材料的配方列表（CollectGuideRecipes：items 直接命中或 RecipeGroup 成员命中） */
  private renderGuideRecipes(listEl: HTMLElement, vid: number): void {
    listEl.dataset.vid = String(vid);
    listEl.textContent = '';
    const game = this.game;
    let hits = 0;
    for (const r of VANILLA_RECIPES) {
      const used = r.items.some((req) => req.id === vid
        || (req.id >= 1000000 && (RECIPE_GROUP_ITEMS[String(req.id - 1000000)] ?? []).includes(vid)));
      if (!used) continue;
      if (++hits > 60) { listEl.appendChild(el('div', 'sw-lbl', '…更多结果请细化')); break; }
      const outKey = vanillaItemKey(r.create);
      if (!outKey) continue;
      // ★原版反查列表全亮：CollectGuideRecipes（Recipe.cs:441）不做环境/材料
      //   过滤就入列——常规列表的“缺料变灰”逻辑不适用于本面板（用户截图实锤：
      //   满包木材站徒手前仍全灰=把两套语义混了）。点击仍经 vanillaCraft 材料门，
      //   不可合成时静默无效=原版同款表现
      const row = el('div', 'sw-recipe');
      const outIid = game.itemId(outKey);
      const img = el('img') as HTMLImageElement;
      img.className = 'prod';
      img.dataset.key = outKey;
      const u0 = outIid !== undefined && outIid >= 0 ? iconUrl(game, outIid) : '';
      if (u0) { img.src = u0; img.dataset.done = '1'; }   // 热态即出图；冷态走面板级补图轮询
      img.draggable = false;
      row.appendChild(img);
      const label = el('span', 'g-nm', Lang.itemNameByKey(outKey) || outKey);
      row.appendChild(label);
      if (r.createStack > 1) {
        const qty = el('span', 'g-qty', `×${r.createStack}`);
        row.appendChild(qty);
      }
      const info = el('span', 'g-req', `${r.tile >= 0 ? (Lang.tileName(r.tile) ?? `站点 ${r.tile}`) : Lang.text('Mods.SandboxWorld.UI.StationHand')} · ${
        r.items.map((req) => `${req.id >= 1000000 ? '任何组物' : (Lang.itemNameByKey(ingredientKey(req.id) ?? '') ?? req.id)} ${req.stack}`).join(' +')}`);
      row.appendChild(info);
      row.onclick = () => {
        // 全行可点：不可合成时 consumeMaterials 静默无效=原版 guide 模式同款表现
        // 成品跟随光标（CraftItem_GrantItem 同款）
        game.vanillaCraft(r, 1, true);
        this.refreshAll();
      };
      listEl.appendChild(row);
    }
    if (!hits) listEl.appendChild(el('div', 'sw-lbl', '该物品不用于任何配方'));
    // 图标补图由面板级 ticker 统一驱动（upgradeGuideTicker），此函数只负责结构
  }

  closeGuideSearch(): void {
    // 光标幽灵摘除（元素+mousemove 对称回收）
    this.guideRefresh = null;   // ★SW-AY1 R5 对称摘除（面板闭后 Shift 支不再触刷新）
    if (this.guideGhostMove) {
      window.removeEventListener('mousemove', this.guideGhostMove);
      this.guideGhostMove = null;
    }
    this.guideGhostEl?.remove();
    this.guideGhostEl = null;
    // 放置中的材料自动归还（Main.CloseNPCChatOrSign → dropItemCheck 出口等价；
    // MP 下走背包 add 与 msg5 差分同链）。★SW-BP1 2026-09-07（RB4a 债④/债②）：
    // ①词缀/实例样式/收藏全随行——原版 GetOrDropItem(Main.guideItem)（Player.cs
    // :5112-5114）整 Item 对象回包（:39873 `inventory[i] = returnItem`）,曾裸
    // (id,stack)=词缀/样式件关搜索面板即洗白;②余量落点 p.y→p.cy（:7200-7202 Center）
    {
      const pl = this.guidePlaced;
      if (pl && this.game) {
        const left = this.game.player.inv.add(pl.id, pl.stack, pl.prefix, pl.placeStyle, false, false, !!pl.favorited);
        if (left > 0) {
          const key = ITEM_DEFS[pl.id]?.key ?? '';
          this.game.spawnDrop(this.game.player.cx, this.game.player.cy, key, left);
        }
        this.game.cb.onInventoryChanged?.();
      }
      this.guidePlaced = null;
    }
    if (this.guideEscHandler) {
      window.removeEventListener('keydown', this.guideEscHandler);
      this.guideEscHandler = null;
    }
    if (this.guideEl) {
      this.guideEl.remove();
      this.guideEl = null;
    }
  }

  /** 垃圾桶暂存（关闭背包才删除；可取回） */
  /** @deprecated 改走 inv.trash 持久槽（Player.trashItem 语义）——保留字段仅作 UI 缓存兼容 */

  private placeTrash(): void {
    if (!this.heldStack) return;
    // 原版 Trash 槽=覆盖销毁（ItemSlot.cs:692-701：trashItem=item.Clone() 旧物直接
    // 丢弃 + TrashItem/Grab 双音）——曾做同型合并/异型交换，旧物回手上="遗弃"
    // 语义失效（2026-08-21 用户报"无法遗弃任何东西"）
    // ★SW-AU2 2026-09-06 context 6 不在 retainFavoriteOnMoveAt（:362-366）→
    //  MouseItemSwap :1230-1234 清 favorited（入桶即失收藏标记，原版同）
    // ★SW-AY1 R4b journey 研究随垃圾桶（LeftClick case 0 context 6 :909-916）：
    //  持物入桶 = 新件克隆 onlyIfFinish 献祭 + 桶内旧件整段献祭（:912 `A|B` 非短路），
    //  旧件随即 SetDefaults(0)（:916）；两支皆空才播 TrashItem（:978-981 `!flag2`）
    const oldTrash = this.game.player.inv.trash;
    let researchedNew = false;
    let researchedOld = false;
    if (this.game.world?.isJourney) {
      researchedNew = this.tryResearchIntoTrash(this.heldStack, true);
      researchedOld = oldTrash ? this.tryResearchIntoTrash(oldTrash, false) : false;
    }
    this.game.player.inv.trash = { ...this.heldStack, favorited: false };
    this.heldStack = null;
    if (!(researchedNew || researchedOld)) this.game.sfx.playFiles(['trash_item_0', 'trash_item_1'], 1);   // SoundID.TrashItem（:980）
    this.game.sfx.play('pickup', 1);                                 // SoundID 7 Grab（:982）
    this.paintTrash();
  }

  private paintTrash() {
    if (!this.trashEl) return;
    const img = this.trashEl.querySelector('img');
    const cnt = this.trashEl.querySelector('.cnt');
    img?.remove();
    cnt?.remove();
    if (this.game.player.inv.trash) {
      const im = el('img') as HTMLImageElement;
      im.src = iconUrl(this.game, this.game.player.inv.trash!.id);
      im.draggable = false;
      this.trashEl.appendChild(im);
      if (this.game.player.inv.trash!.stack > 1) {
        this.trashEl.appendChild(el('span', 'cnt', String(this.game.player.inv.trash!.stack)));
      }
    } else {
      // 空槽画垃圾桶图标（ItemSlot.cs:2514-2520：Trash.png 居中，灰半透）
      const im = el('img', 'sw-trash-icon') as HTMLImageElement;
      im.src = 'sprites/vanilla/Trash.png';
      im.draggable = false;
      this.trashEl.appendChild(im);
    }
  }

  trashEl: HTMLElement | null = null;
  /** 成就提示牌（背包内 Advisor 卡） */
  achAdvisorEl: (HTMLElement & { update(): void }) | null = null;
  /** 右下角无框坞（2026-09-02 用户要求）：装备列（配装/染料/时装/装备四列+防御计数,
   *  2026-09-07 起顶部对齐杂项列首行）
   *  与杂项/PvP 列的浮置容器——无面板底框,随背包开合显隐（open/closeInventory） */
  private eqDockEl: HTMLElement | null = null;
  /** 配饰格可见性眼睛钮（槽序 → 元素,attachVisibilityEye 登记/refreshAllNow 重刷） */
  private accEyeEls = new Map<number, HTMLElement>();
  private loadoutBtns: HTMLButtonElement[] = [];
  /** 背包侧"堆叠至附近宝箱"双钮（2026-09-02 用户要求：原单钮右键切模式拆成
   *  quick/smart 两枚并排,左键各按固定模式执行;ChestStack 帧 0/1=quick 常态/悬停、
   *  2/3=smart;开箱时隐藏） */
  private quickStackBtn!: HTMLButtonElement;
  private qsSmartBtn!: HTMLButtonElement;
  /** 道具搜索钮（🔍,簇格 2×3 末位——row 里构建,取挂,2026-09-02 移位） */
  private itemSearchBtn!: HTMLButtonElement;
  /** 图鉴钮（簇格 2×3 取挂引用） */
  private bestiaryBtn!: HTMLButtonElement;
  /** 背包网格容器（syncInvGridGeometry 写轨道用,2026-09-02） */
  private invGridEl: HTMLElement | null = null;
  /** 多人玩家列表入口（联机态显示；面板本体在 PlayerListPanel.ts） */
  private playerListBtn: HTMLButtonElement | null = null;
  /** 住房面板开合（mainFlow.openHousing/面板 onClosed 回写）——住房图标钮
   *  DisplaySlots_4(常态)/5(开) 切换用 */
  private housingOpen = false;
  private housingBtn: HTMLButtonElement | null = null;
  /** PvP 剑钮 + 6 队伍钮（DrawPVPIcons Main.cs:42074；refreshPvpButtons 刷帧/提示） */
  private pvpSwordBtn!: HTMLButtonElement;
  private pvpTeamBtns: HTMLButtonElement[] = [];
  /** 队伍/PvP 切换冷却截止（teamCooldown 300t 的墙钟等价；:42106/:42171） */
  private pvpCooldownUntil = 0;

  /** ★页签机制已拆（2026-08-27 用户要求）：装备/杂项合并为常驻左列+右缘杂项列，
   *  页签只剩 住房（覆盖层入口）/图鉴；setEquipPage/EquipPage 概念随之退役 */

  // ---- PvP/队伍快切钮行为（DrawPVPIcons Main.cs:42074-42195） ----

  /** 刷新剑帧/队伍格悬停高亮/提示文案（帧式 :42094/:42112-42113，冷却期无提示 :42099/:42135） */
  refreshPvpButtons(): void {
    if (!this.pvpSwordBtn || !this.game?.player) return;
    const p = this.game.player;
    const cool = performance.now() < this.pvpCooldownUntil;
    const swordHover = !cool && this.pvpSwordBtn.matches(':hover');
    const [col, row] = pvpIconFrame(p.hostile, swordHover, p.team);
    // background-position 百分比 = col/(4-1)、row/(6-1)（38px 帧裁 36×37）
    this.pvpSwordBtn.style.backgroundPosition = `${(col / 3) * 100}% ${(row / 5) * 100}%`;
    // ★2026-09-13 反馈轮6:vanilla 布局 hover 名走自有气泡(classic 保持原生 title=
    //  零变化白名单);气泡只在悬停态显示/刷新(mouseenter/点击经本函数),隐藏由
    //  构建区 mouseleave 管——本函数在共享刷新链(:5591)每拍跑,不可无条件 hide
    const vanillaTip = this._builtLayout === 'vanilla';
    if (!vanillaTip) {
      this.pvpSwordBtn.title = cool ? '' : Lang.text(p.hostile ? 'UI.PvpIcon_Active' : 'UI.PvpIcon_Inactive');
    } else if (swordHover) {
      this.showBuffTooltip(this.pvpSwordBtn, Lang.text(p.hostile ? 'UI.PvpIcon_Active' : 'UI.PvpIcon_Inactive'), '');
    }
    PVP_TEAM_BUTTONS.forEach((tb, k) => {
      const cell = this.pvpTeamBtns[k];
      const hover = !cool && cell.matches(':hover');
      // 悬停高亮 = UI_PVP_2 垫底（:42186-42188）；提示 = TeamIcon{Name}_{Active|Inactive}（:42160）
      cell.style.backgroundImage = hover ? 'url(sprites/vanilla-ui/UI_PVP_2.png)' : 'none';
      if (!vanillaTip) {
        cell.title = cool ? '' : Lang.text(`UI.TeamIcon${tb.name}_${p.team === tb.team ? 'Active' : 'Inactive'}`);
      } else if (hover) {
        this.showBuffTooltip(cell, Lang.text(`UI.TeamIcon${tb.name}_${p.team === tb.team ? 'Active' : 'Inactive'}`), '');
      }
    });
  }

  /** PvP 剑点击：hostile 翻转 + 冷却 300t + 音效 12（:42104-42110）。
   *  原版 SendData(30)；本仓 msg13 快速通道（ClientNet.sendPvpState）+ options 持久化
   *  （Settings 页 PvP 行同款链）。 */
  private pvpToggleHostile(): void {
    const p = this.game.player;
    if (performance.now() < this.pvpCooldownUntil) return;   // teamCooldown 门
    this.pvpCooldownUntil = performance.now() + PVP_COOLDOWN_MS;
    this.game.sfx.play('menuTick', 1);                       // SoundID 12（:42107）
    p.hostile = !p.hostile;
    void options.set('pvpEnabled', p.hostile);
    this.game.net?.sendPvpState();
    this.refreshPvpButtons();
  }

  /** 队伍格点击：team=i + 冷却 + 音效 12（:42163-42182）。TeamChangeAllowed 恒 true
   *  （Player.cs:4303-4306）——misc[84] 拒绝文案支为死码不入。原版 SendData(157)。 */
  private pvpSetTeam(team: number): void {
    const p = this.game.player;
    if (p.team === team || performance.now() < this.pvpCooldownUntil) return;
    this.pvpCooldownUntil = performance.now() + PVP_COOLDOWN_MS;
    this.game.sfx.play('menuTick', 1);                       // SoundID 12（:42172）
    p.team = team;
    void options.set('pvpTeam', team);
    this.game.net?.sendPvpState();
    this.refreshPvpButtons();
  }

  private buildInventoryPanel() {
    // sw-inv 作用域类（2026-09-02）：透明底下面板文字直接叠世界画面,该作用域统一
    // 加文字投影（CSS 见 .sw-inv 规则）;其余 .sw-panel（箱子/设置等）不受影响
    this.invPanel = el('div', 'sw-panel sw-inv');
    // 位置（2026-08-27 用户要求）：对齐左上工具栏最左格（面板跑工具栏正下方一点）,
    // 不再水平居中——左=热键栏首格左缘,顶=热键栏底+8px;透明度再拉高（opacity .75,
    // 叠 .sw-panel 半透底）+ 边框/投影弱化。★每次 openInventory 重算（贴位取热键栏
    // 槽 inline 布局值）;★构建后必须显式 display:none（E 开/E 关语义,曾漏=默认开着）
    this.positionInvPanel();
    this.invPanel.style.display = 'none';
    // 原版背包无标题栏（DrawInventory 直接铺槽位）——标题行已摘（2026-08-13）

    // ---- Loadout 切换列（DrawLoadoutButtons Main.cs:41386+：当前套高亮）——
    //  ★2026-08-27 用户要求：随装备列整体迁至右缘（成就/杂项列左侧）,不再占顶排
    //  ★2026-09-07 用户要求：横排改竖排列（label 在顶 + 3 钮纵叠,结构对齐 vcol2）,
    //  移到时装列左侧作 eqPage 首列（挂载点见下方 eqPage.appendChild）
    const loadoutCol = el('div');
    loadoutCol.style.cssText = 'display:flex; flex-direction:column;';
    loadoutCol.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.Tabs.Loadout')));
    const loadoutWrap = el('div');
    loadoutWrap.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    this.loadoutBtns = [];
      for (let k = 0; k < 3; k++) {
        // 原版 DrawLoadoutButtons（Main.cs:41395-41431）：Extra[259] 3×3 图集——
        // 行 = loadout 配色，列 = 常态 0 / 选中 1 / 悬停 2（OurFavoriteColor 染色帧）
        const b = el('button', 'sw-btn sw-loadout-btn');
        b.dataset.lo = String(k);
        b.style.cssText = 'margin:0; width:32px; height:32px; padding:0; border:none; flex:none;'
          + 'background:url(sprites/vanilla/Extra_259.png); background-size:300% 300%;'
          + 'image-rendering:pixelated; cursor:pointer;';
        const frame = (col: number) => { b.style.backgroundPosition = `${col * 50}% ${k * 50}%`; };
        frame(0);
        b.addEventListener('mouseenter', () => { if (this.game.player.inv.currentLoadout !== k) frame(2); });
        b.addEventListener('mouseleave', () => { if (this.game.player.inv.currentLoadout !== k) frame(0); });
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.game.player.inv.currentLoadout === k) return;
          this.game.player.inv.trySwitchingLoadout(k, this.game.player.hideVisibleAccessory);   // R4-12
          this.game.sfx.play('menuTick', 1); // SoundID 12（TrySwitchingLoadout）
          this.flashLoadoutSwitch();
          this.refreshAll();
        });
        loadoutWrap.appendChild(b);
        this.loadoutBtns.push(b);
      }
      loadoutCol.appendChild(loadoutWrap);
      // 顶排：页签/入口图标行——★2026-08-27 用户要求：不再占整行留空,挂到右缘列
      // 顶部（成就卡上方,居中可换行）,背包/弹药/配装三列直接顶到面板上沿
      const row = el('div');
      row.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; align-items:center; justify-content:center; margin-bottom:2px;';
      // 页签：住房/图鉴图标钮（原版 DrawPageIcons :43528 EquipPage[4]灰房/hover=[7]红房
      // /页开=[5]；图鉴 = BestiaryMenuButton（Images/UI/Bestiary 2 帧书:常态/金高亮）。
      // 2026-08-27 用户要求：移植原版图标 + 两图标居右。住房点击：藏背包+开住房
      // 右缘条（查询器/指定 NPC 头像列）；条上 ✕ / 右键落光标 / E = 收条）
      // （spacer 已随顶行退役——图标行现挂右缘列顶部,居中换行）
      // 多人玩家列表（联机态显示）与旅程入口排图标左侧
      this.playerListBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.PlayerList.Title'));
      this.playerListBtn.style.cssText = 'margin:0; padding:4px 10px; font-size:12px; display:none;';
      this.playerListBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.closeInventory();
        openPlayerListPanel(this.game);
      });
      row.appendChild(this.playerListBtn);
      if (this.game.player.appearance?.difficulty === 3) {
        const bPow = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.JourneyPowers.Title'));
        bPow.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
        bPow.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.closeInventory();
          openJourneyPowersPanel(this.game);
        });
        row.appendChild(bPow);
        // ★SW-RB14b:研究钮标签订正——LegacyInterface.112 原版 zh-Hans=「你必须先设置边框」
        //   (Terarria1457 zh-Hans.Legacy.json :112,非研究面),误用致钮/标题错文案;改自有键
        const bRes = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.Research.Title'));
        bRes.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
        bRes.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.closeInventory();
          openResearchPanel(this.game);
        });
        row.appendChild(bRes);
      }
      // 设置钮（SW-BN3 2026-09-07）：暂停/设置浮层入口——原版 playerInventory 态
      // 的设置入口 DrawInterface_29_SettingsButton（Main.cs:46287-46301,可见态
      // playerInventory ∥ ingameOptionsWindow ∥ dead,文字 = Lang.inter[62]
      // "Settings/设置"）。随 row 以 display:contents 入簇格（跨双列,右缘列底行
      // ≈原版背包右下钮位）；开/收 toggle 在 main.ts 接线侧（onPauseMenu）
      {
        const bSet = el('button', 'sw-btn', Lang.text('LegacyInterface.62'));
        bSet.title = Lang.text('LegacyInterface.62');
        bSet.style.cssText = 'margin:0; padding:4px 6px; font-size:12px; grid-column: 1 / -1;';
        bSet.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.onPauseMenu?.();
        });
        row.appendChild(bSet);
      }
      // 道具搜索（调试检索器）：图标化入顶排图标组（2026-08-27 用户要求,原背包
      // 标签行文字钮退役）——★Bestiary 搜索贴图自带蓝底面板非裸 icon,用户定策
      // 改用 emoji 🔍 + hover 金色衬底。2026-09-02 用户要求：搜索钮移到竖列最底
      // （不随 row,挂载点见下方 sideCol 段尾）
      {
        const bS = el('button');
        this.itemSearchBtn = bS;
        bS.title = '道具搜索';
        bS.textContent = '🔍';
        bS.style.cssText = 'margin:0; width:24px; height:24px; padding:0; flex:none; border:none;'
          + 'background:transparent; font-size:14px; line-height:1; cursor:pointer;'
          + 'display:flex; align-items:center; justify-content:center;'
          + 'border-radius:4px; transition:background .12s;';
        bS.addEventListener('mouseenter', () => { bS.style.background = 'rgba(255,231,69,0.28)'; });
        bS.addEventListener('mouseleave', () => { bS.style.background = 'transparent'; });
        bS.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.openItemSearch();
        });
      }
      {
        const b = el('button');
        b.title = Lang.text('Mods.SandboxWorld.Housing.Button');
        b.style.cssText = 'margin:0; width:24px; height:24px; padding:0; flex:none; border:none;'
          + 'background:url(sprites/vanilla-ui/UI_DisplaySlots_4.png) 0 0/100% 100%;'
          + 'image-rendering:pixelated; cursor:pointer;';
        this.housingBtn = b;
        this.refreshHousingBtn();
        // hover 态 = 原版 EquipPage[7]（DrawPageIcons :43538 悬停叠 [7] 金染）——
        // DOM 等价 = 悬停切 _7 贴图；开态(_5)保持
        b.addEventListener('mouseenter', () => {
          if (!this.housingOpen) b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_DisplaySlots_7.png)';
        });
        b.addEventListener('mouseleave', () => this.refreshHousingBtn());
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          // 背包先收（住房条挂屏幕右缘,背包不藏会被压住/挡点击/挡移动）
          this.closeInventory();
          this.onHousing?.();
        });
        row.appendChild(b);
      }
      {
        const bBst = el('button');
        this.bestiaryBtn = bBst;
        bBst.title = Lang.text('Mods.SandboxWorld.Tabs.Bestiary');
        bBst.style.cssText = 'margin:0; width:24px; height:24px; padding:0; flex:none; border:none;'
          + 'background:url(sprites/vanilla-ui/UI_Bestiary.png) 0 0/200% 100%;'
          + 'image-rendering:pixelated; cursor:pointer;';
        bBst.addEventListener('mouseenter', () => { bBst.style.backgroundPosition = '100% 0'; });
        bBst.addEventListener('mouseleave', () => { bBst.style.backgroundPosition = '0 0'; });
        bBst.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.onBestiary?.();
        });
        row.appendChild(bBst);
      }
      // 成就入口 = 背包内 AchievementAdvisor 卡（AchievementsUI.createAchievementAdvisor，
      // 原版同款：背包左侧未完成成就小卡点击开成就页）。背包顶栏成就按钮已摘
      // （2026-08-13 用户要求：双入口只留原版位；原版设置菜单 Lang.menu[131] 入口
      // 如需再补应落在 Settings 而非背包顶栏）
    // 图标行挂面板下横条（2026-09-02 用户要求,原 invPanel 顶行 2026-08-27 曾挂右缘列）

    // ---- 右下角无框坞（2026-09-02 用户要求：配装列 + 杂项/PvP 列整体迁出背包
    //  面板，浮置屏幕右下角、无面板底框——降低对世界画面的遮挡。随背包开合显隐,
    //  见 openInventory/closeInventory；点击命中登记进 domTargets 名单 .sw-eqdock）----
    const eqDock = el('div', 'sw-eqdock');
    // ★2026-09-07 用户要求：flex-end（底对齐）→ flex-start（顶对齐）——装备四列
    //  顶部与杂项列首行（宠物栏）对齐
    eqDock.style.cssText = 'position:fixed; right:10px; bottom:10px; display:none; pointer-events:auto;'
      + 'align-items:flex-start; gap:26px; z-index:11;';
    this.eqDockEl = eqDock;
    // 主体：原版布局——左装备竖列（盔甲 0-2 + 配饰 3-7 | 染料 0-2+3-7 | 时装 10-12 + 时装配饰 13-17）
    // / 杂项页（miscEquips[5] + miscDyes[5]，Main.cs:40616-40672 EquipPage==2）+
    // 垃圾桶 + 钱币 + 弹药；右背包 10×4（10-49）。原版三列 x=sw-92/-139/-186。
    const body = el('div');
    body.style.cssText = 'display:flex; gap:14px; margin-bottom:8px;';
    const left = el('div');
    // 装备组（2026-08-27 用户要求：染料/时装/装备列整体迁至成就/杂项列左侧,
    // 背包贴热键栏；2026-09-02 再迁右下角无框坞——挂载点见 eqDock.appendChild(left)）
    left.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex:none;';
    // 装备页：四列 L→R = 配装 | 时装 | 装备 | 染料（2026-09-02 用户要求染料挪到装备
    //  列右侧——染料↔装备按行索引配对,相邻更直观,原版序=染料|时装|装备为用户定策
    //  偏离;2026-09-07 用户要求配装竖列并入本行首列——原横排行退役）。
    //  两段式竖列（盔甲段 + 4px 组距 + 配饰段,原版列距 47px、配饰段下移 num35=4px）
    const vcol2 = (label: string, a: number, na: number, b: number, nb: number, where: SlotWhere, eyes = false) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      const wrap = el('div');
      wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
      for (let k = 0; k < na; k++) wrap.appendChild(this.makeSlotEl(a + k, where));
      for (let k = 0; k < nb; k++) {
        const sl = this.makeSlotEl(b + k, where);
        if (k === 0) sl.style.marginTop = '4px'; // 段组距（原版 num35=4）
        if (eyes) this.attachVisibilityEye(sl, b + k);
        wrap.appendChild(sl);
      }
      col.appendChild(wrap);
      col.style.cssText = 'display:flex; flex-direction:column;';
      return col;
    };
    this.accEyeEls.clear();   // 面板重建（重进世界）时旧眼钮引用作废
    const eqPage = el('div');
    eqPage.style.cssText = 'display:flex; gap:16px;'; // 列距拉开：自制列标签与邻列槽贴叠会被读成"词左边的杂字"（原版无文字标签不显此问题）
    eqPage.appendChild(loadoutCol);   // 配装（2026-09-07 用户要求：竖排列居时装左侧）
    const vanityCol = vcol2(Lang.text('Mods.SandboxWorld.UI.Vanity'), 10, 3, 13, 5, 'armor'); // 时装 armor[10-12]+[13-17]
    eqPage.appendChild(vanityCol);
    const equipCol = vcol2(Lang.text('Mods.SandboxWorld.UI.Equipment'), 0, 3, 3, 5, 'armor', true);   // 装备 armor[0-2]+[3-7]（防御计数器挂此列底;配饰段挂眼睛开关）
    eqPage.appendChild(equipCol);
    const dyeCol = vcol2(Lang.text('LegacyInterface.57'), 0, 3, 3, 5, 'dye');                // 染料 dye[0-2]+[3-7]（追加格 dye[8]/[9] 按解锁显隐,见 extras 段——与装备/时装列逐行对应）
    eqPage.appendChild(dyeCol);
    // 恶魔之心(armor[8]/dye[8])+大师(dye[9] 无独立时装...armor[9]) 追加槽——
    // 建面板即建、refreshEquipExtras 按解锁/占格显隐（Player.cs:4279 Shown 判定：
    // 解锁【或】格内有物；经典世界专家旗存物也显示但不生效=cs:18402 效果门在
    // Inventory.accSlotMax）。时装列 18/19 同步追加（无眼钮——眼只挂功能段 3-9）
    const equipExtras: HTMLElement[] = [];
    const vanityExtras: HTMLElement[] = [];
    const dyeExtras: HTMLElement[] = [];
    {
      // ★追加槽必须接在【槽位容器】尾部(vcol2 的 col.children[1])——
      //  firstElementChild 是列标签 div,曾 append 进标签 ⇒ 恶魔之心/大师槽
      //  插到列最前面(2026-08-28 用户报),应在尾部配饰之后追加
      const equipWrap = equipCol.children[1] as HTMLElement | null;
      // 列序 2026-09-07 调整后 eqPage children：[0]=配装 [1]=时装 [2]=装备 [3]=染料
      // （改用上方 vcol2 直接引用,不再按 children 序数取列——曾因插列翻车）
      const vanityWrap = vanityCol.children[1] as HTMLElement | null;
      const dyeWrap = dyeCol.children[1] as HTMLElement | null;
      for (let k = 0; k < 2; k++) {
        const es = this.makeSlotEl(8 + k, 'armor');
        this.attachVisibilityEye(es, 8 + k);
        if (k === 0) es.style.marginTop = '4px';
        es.style.display = 'none';
        equipWrap?.appendChild(es);
        equipExtras.push(es);
        // 染料列追加格 dye[8]/dye[9]（恶魔染料/大师染料）——与装备追加格同行同门
        // 显隐（2026-09-02 用户问"染料列为何 10 格"定谳：此前染料列固定渲染 10 格、
        // 装备/时装列追加格按解锁显隐 → 未解锁时行数不齐=对应关系错位）
        const ds = this.makeSlotEl(8 + k, 'dye');
        if (k === 0) ds.style.marginTop = '4px';
        ds.style.display = 'none';
        dyeWrap?.appendChild(ds);
        dyeExtras.push(ds);
        const vs = this.makeSlotEl(18 + k, 'armor');
        if (k === 0) vs.style.marginTop = '4px';
        vs.style.display = 'none';
        vanityWrap?.appendChild(vs);
        vanityExtras.push(vs);
      }
      this.equipExtraSlots = { equip: equipExtras, vanity: vanityExtras, dye: dyeExtras };
    }
    left.appendChild(eqPage);
    // 杂项（常驻右缘列，原杂项页 2026-08-27 并入）：miscEquips[5]（宠物/光源/矿车/
    // 坐骑/抓钩，context 19/20/18/17/16）+ miscDyes[5]（context 33）——挂 advRail
    // 玩家对决原位，PvP/队伍钮被顶到其下（节点在下方 advRail 段挂载）
    const MISC_LABELS = [
      Lang.text('Mods.SandboxWorld.Tabs.Pet'), Lang.text('Mods.SandboxWorld.Tabs.Light'),
      Lang.text('Mods.SandboxWorld.Tabs.Minecart'), Lang.text('Mods.SandboxWorld.Tabs.Mount'),
      Lang.text('Mods.SandboxWorld.Tabs.Grapple'),
    ];
    const miscRail = el('div');
    // ★2026-09-02 用户要求：杂项染料槽与对应杂项槽同行并排（此前染料独立成列,
    // 行高与 misc 行高不一致 → 第 2 行起对应关系错位）
    miscRail.style.cssText = 'display:flex; flex-direction:column; gap:8px; align-items:flex-start;';
    MISC_LABELS.forEach((lbl, k) => {
      const row = el('div');
      row.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
      row.appendChild(el('div', 'sw-lbl', lbl));
      const pair = el('div');
      pair.style.cssText = 'display:flex; gap:6px; align-items:center;';
      const slotEl = this.makeSlotEl(k, 'misc');
      // 宠物/光源槽眼睛开关（原版 InventoryTick 图标 Main.cs:40666-40691：光标为空
      // 时点击小眼睛 → TogglePet/ToggleLight 显隐翻转——槽 0/1 专属）。
      // ★图标同配饰眼 Inventory_Tick_On/Off（2026-08-27 用户报：曾用 emoji 👁
      // 与装备列眼睛不一致）
      if (k === 0 || k === 1) {
        const eye = el('button', 'sw-btn sw-peteye');
        eye.style.cssText = 'position:absolute; right:-12px; top:-10px; width:24px; height:20px;'
          + 'margin:0; padding:0; z-index:5; background:center/contain no-repeat; image-rendering:pixelated;';
        eye.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.heldStack) return;   // 原版 mouseItem.IsAir 门（:40670）
          this.game.togglePetSlot(k as 0 | 1);
          this.paintPetEye(eye, k as 0 | 1);
        });
        slotEl.style.position = 'relative';
        slotEl.appendChild(eye);
        this.paintPetEye(eye, k as 0 | 1);
      }
      pair.appendChild(slotEl);
      pair.appendChild(this.makeSlotEl(k, 'miscDye'));   // 对应染料同排（原版同构）
      row.appendChild(pair);
      miscRail.appendChild(row);
    });
    // 垃圾桶（持久槽；可交换取回）——原版 (448,258) scale0.85=44px、槽底 Back7（context 6）
    const trashWrap = el('div');
    trashWrap.appendChild(el('div', 'sw-lbl', Lang.text('LegacyInterface.3')));
    const trash = el('div', 'sw-slot trash sw-trash');
    trash.style.cssText = 'width:44px; height:44px; flex:none;'
      + 'background-image:url(sprites/vanilla/Inventory_Back7.png);';
    trash.addEventListener('contextmenu', (e) => e.preventDefault());   // SW-AU2：Ctrl+点(Mac=长按右键菜单面)在槽域同被吞
    trash.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // ★SW-AY1 R4a Alt(FavoriteKey)+聊天输入开着 = 插物品 tag——本槽不走
      //  makeSlotEl（自建监听器,不在 makeSlotEl 优先级链内）,此处补 OverrideHover
      //  :581-587 最高优先支：context 6 ∈ canShareAt（:380）→ cursorOverride 2 →
      //  OverrideLeftClick :709-716 ChatManager.AddChatText + SoundID 12 消费
      if (!e.button && e.altKey && this.game.chatInput?.isOpen && this.game.player.inv.trash) {
        this.game.insertChatItemTag(vidOf(this.game.player.inv.trash.id));
        this.game.sfx.play('menuTick', 1);
        return;
      }
      // ★SW-AU2 2026-09-06 Shift+左键垃圾桶 = 桶→背包（GetAlternateClickAction
      //  :688-696 case 6 → cursorOverride 7 → OverrideLeftClick :764-770
      //  GetItem(QuickTransferFromSlot)：落袋 GetItem SoundID 7 + 支尾 SoundID 12；
      //  残量留桶 = inv[slot] 即 GetItem 返回值）。右键面原版无（RightClick :1632
      //  `context == 6` 早退）；Ctrl 原版不在 Quick Trash 域（:611 仅 0-4/7/32）→ 取回
      if (!e.button && e.shiftKey && !e.altKey && !e.ctrlKey && this.game.player.inv.trash) {
        const t = this.game.player.inv.trash;
        const left = this.game.player.inv.add(t.id, t.stack, t.prefix, (t as { placeStyle?: number }).placeStyle);
        if (left < t.stack) {
          this.game.player.inv.trash = left > 0 ? { ...t, stack: left } : null;
          // ★SW-AY1 #9 GetItem 币种专音（:764-770 → Player.cs:39755 IsACoin ? 38 : 7）
          this.game.sfx.play(coinIndexOf(t.id) >= 0 ? 'coin' : 'pickup', 1);
          this.game.sfx.play('menuTick', 1);
          this.paintTrash();
          this.refreshAll();
          return;
        }
        // ★SW-RB1 2026-09-06 全拒回落普通面：GetAlternateClickAction(:688-696) 因
        //  ItemSpace 拒而 null → LeftClick case-0（PickItemMovementAction context 6
        //  :1465 result=0）——满包时 Shift+点=旧桶销毁+光标物入桶 / 无持物=桶件上光标。
        //  旧实现恒消费 return ⇒ 满包 Shift+点垃圾桶成死键（原版可回落拾取/覆盖面）
      }
      if (this.heldStack) {
        this.placeTrash();
      } else if (this.game.player.inv.trash) {
        this.heldStack = this.game.player.inv.trash; // 取回
        this.game.player.inv.trash = null;
        this.game.sfx.play('pickup', 1);   // 取回 = Grab（:701-706 mouseItem 有物 → 7）
        this.paintTrash();
      }
      this.refreshAll();
    });
    this.trashEl = trash;
    trashWrap.appendChild(trash);
    // 钱币 4 格（50-53）+ 弹药 4 格（54-57）——原版 Main.cs:41189-41224：
    //  inventoryScale 0.6 → 31px 竖列、间距 33.6px（gap 2.6），Coins x=497 / Ammo x=534
    const coinAmmo = el('div');
    coinAmmo.style.cssText = 'display:flex; gap:5px;';
    const mkCol = (label: string, from: number) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      const colSlots = el('div');
      colSlots.style.cssText = 'display:flex; flex-direction:column; gap:2.6px;';
      for (let k = 0; k < 4; k++) {
        const sl = this.makeSlotEl(from + k, 'inv');
        sl.classList.add('sm');
        colSlots.appendChild(sl);
      }
      col.appendChild(colSlots);
      col.style.cssText = 'display:flex; flex-direction:column;';
      return col;
    };
    // ★2026-08-27 用户要求：左右调转——左→右 = 弹药 | 钱币
    coinAmmo.appendChild(mkCol(Lang.text('LegacyInterface.27'), AMMO_START));
    coinAmmo.appendChild(mkCol(Lang.text('LegacyInterface.26'), COIN_START));
    const rightRail = el('div');
    // ★2026-08-27 用户要求：垃圾桶放到弹药/钱币列下方（列改纵向：上=弹药|钱币,下=垃圾桶）
    rightRail.style.cssText = 'display:flex; flex-direction:column; gap:8px; align-items:flex-start;';
    rightRail.appendChild(coinAmmo);
    rightRail.appendChild(trashWrap);
    // 挂载点移到背包右侧（夹在背包与成就/杂项列之间,2026-08-27 用户要求）——
    // 见下方 body.appendChild(right) 后。装备组（left=配装+染料/时装/装备列）挂载点
    // 同样移至 rightRail 之后、成就/杂项列之前（用户要求整体右迁）
    // 成就提示牌（AchievementAdvisor：未完成成就小卡，点击开成就菜单）
    // ——挂载点在物品格之后（见 body.appendChild(right) 处），此处仅创建
    this.achAdvisorEl = createAchievementAdvisor(this.game);

    // 背包 10×4（10-39）。★「背包」标签行已摘（2026-09-02 用户要求：去掉二字
    // 直接贴紧热键栏;道具搜索文字钮此前已图标化,向导反查钮 2026-08-14 摘）
    const right = el('div');
    const grid = el('div', 'sw-invgrid');
    // 轨道/间距初值 = --slot(39)+4（D0 桌面恒等值）;此后每帧由
    // syncInvGridGeometry 按热键栏实测节距改写（任何缩放环境下与热键栏逐像素一致）
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10, var(--slot));'
      + 'grid-auto-rows:var(--slot); gap:4px;';
    this.invGridEl = grid;
    // 背包网格 = 槽 10-49（10×4）。★曾写到 INV_SIZE=58——50-57 是钱币/弹药槽
    // （COIN_START/AMMO_START,已在左列渲染），混进网格成第 5 行幻影格：query 首匹配
    // 让左列元素吃掉绘制、悬停却读出钱币/弹药 tooltip（2026-08-26 用户实报红框行）。
    // 原版背包网格到 49 为止（Main.cs 背包 10×4）。
    for (let i = 10; i < COIN_START; i++) {
      grid.appendChild(this.makeSlotEl(i, 'inv'));
    }
    right.appendChild(grid);
    // ---- 右上钮簇（原版背包开时 2×2 30×30 裸图标：QuickStack(498,244)/Sort(534,244)/
    //      Bestiary(498,278)/Emote(534,278)，Main.cs:41276-41355/:41815-41930——
    //      2026-09-02 用户要求：改为 2 列 × 3 行钮格——第 1 行 = 堆叠双钮（原单钮
    //      右键切模式拆开,左键各按固定模式执行）,第 2 行 = 住房/图鉴,第 3 行 =
    //      表情/道具搜索（均取挂自原竖列/图标组）----
    const clusterRow = el('div');
    clusterRow.style.cssText = 'display:grid; grid-template-columns:repeat(2,30px); gap:6px;'
      + 'justify-content:center; align-items:center; justify-items:center; margin:2px 0 4px;';
    // 堆叠至附近宝箱（ChestStack 贴图 4 帧 = 悬停位+模式位：0 常态-quick/1 悬停-quick/
    //  2 常态-smart/3 悬停-smart，Main.cs:41311 num80 += mode*2 + hover）——左键
    // QuickStackAllChests + 音 12；开箱/商店隐藏
    const mkStackBtn = (mode: 'quick' | 'smart'): HTMLButtonElement => {
      const b = el('button', 'sw-btn');
      const base = mode === 'smart' ? 2 : 0;
      b.style.cssText = 'margin:0; width:30px; height:30px; padding:0; flex:none;'
        + `border:none; background:url(sprites/vanilla-ui/UI_ChestStack_${base}.png) 0 0 / 100% 100%;`
        + 'image-rendering:pixelated; cursor:pointer;';
      b.addEventListener('mouseenter', () => {
        b.style.backgroundImage = `url(sprites/vanilla-ui/UI_ChestStack_${base + 1}.png)`;
      });
      b.addEventListener('mouseleave', () => {
        b.style.backgroundImage = `url(sprites/vanilla-ui/UI_ChestStack_${base}.png)`;
      });
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        this.game.quickStackAllChests(mode);
        this.game.sfx.play('menuTick', 1);          // SoundID 12（:41292）
        this.refreshAll();
      });
      // title 不用 GameUI.* 官译——官译带「右键点击切换堆叠方式」提示,双钮拆分后无此交互
      b.title = mode === 'smart' ? '智能堆叠至附近宝箱' : '快速堆叠至附近宝箱';
      return b;
    };
    this.quickStackBtn = mkStackBtn('quick');
    this.qsSmartBtn = mkStackBtn('smart');
    clusterRow.append(this.quickStackBtn, this.qsSmartBtn);
    // 2×2 图标行（住房/图鉴/表情/搜索）在 bEmote 创建后装配（TDZ;见下方 append）
    // 表情入口（原版簇位 (534,278)：EmoteMenuButton 双帧裸图标，左键开 UIEmotesMenu
    // :41850；打开逻辑经 Game 注入 onEmoteMenu）。2026-09-02 用户要求：30×30 →
    // 24×24,与住房/图鉴图标统一（原尺寸偏大）
    const bEmote = el('button', 'sw-btn');
    bEmote.title = Lang.has('GameUI.Emote') ? Lang.text('GameUI.Emote') : 'GameUI.Emote';
    bEmote.style.cssText = 'margin:0; width:24px; height:24px; padding:0; flex:none;'
      + 'background:url(sprites/vanilla-ui/UI_Emotes.png) 0 0 / 200% 100%;'
      + 'image-rendering:pixelated; border:none; cursor:pointer;';
    bEmote.addEventListener('mouseenter', () => { bEmote.style.backgroundPosition = '100% 0'; });
    bEmote.addEventListener('mouseleave', () => { bEmote.style.backgroundPosition = '0 0'; });
    bEmote.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.onEmoteMenu?.();
    });
    // 表情钮 → 簇格 2×3（2026-09-02 用户要求,装配见下方 clusterRow.append）
    // ★2026-08-27 用户要求：堆叠钮挂垃圾桶下方（原在背包网格下沿）——
    //  右列构成：弹药|钱币 → 垃圾桶 → 2×3 钮格 → 成就卡竖列
    clusterRow.append(this.housingBtn, this.bestiaryBtn, bEmote, this.itemSearchBtn);   // 2×2 图标行
    // 第 4 行：天气/时间控制（2026-09-02 用户要求,画布右上按钮迁入钮格变 2×4——
    //  开背包时画布按钮隐藏（Renderer playerInventory 门）防重复;面板本体仍在
    //  小地图下绘制。首用确认门同画布路径）
    const mkHudPanelBtn = (label: string, title: string, kind: 'weather' | 'time'): HTMLButtonElement => {
      const b = el('button', 'sw-btn');
      b.title = title;
      b.textContent = label;
      b.style.cssText = 'margin:0; width:30px; height:30px; padding:0; flex:none;'
        + 'border:none; background:rgba(20,26,60,0.85); color:#e8e8f4;'
        + 'font:bold 13px monospace; cursor:pointer;'
        + 'display:flex; align-items:center; justify-content:center;';
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const r = this.game?.renderer;
        if (!r) return;
        const key = kind === 'time' ? 'timePanelOpen' : 'weatherPanelOpen';
        showJourneyQuickGate(kind, () => { r[key] = !r[key]; });
      });
      return b;
    };
    clusterRow.append(mkHudPanelBtn('⛅', '天气控制', 'weather'), mkHudPanelBtn('±', '时间控制', 'time'));
    clusterRow.appendChild(row);   // 联机/旅程钮行（display:contents,子项成第 5 行格;见 sideCol 段）
    rightRail.appendChild(clusterRow);
    body.appendChild(right);
    // 垃圾桶/弹药/钱币列 → 背包右侧（夹在背包与成就/杂项列中间,2026-08-27 用户
    // 要求——背包+合成整体贴向装备列,顺手中转距离更短）
    body.appendChild(rightRail);
    // 装备组（配装/染料/时装/装备列）→ 右下角无框坞（2026-09-02 用户要求：
    // 迁出背包面板,浮置屏幕右下角降低遮挡——不再占面板内列位）
    eqDock.appendChild(left);
    // ---- 成就卡（2026-09-02 第六批简化：图标/表情/搜索已入簇格 2×3,竖列只剩
    //  成就卡;margin -6px 抵消 rightRail gap(8)+簇 margin-bottom(4)（用户复报
    //  "依然离太远,继续缩小"→净距 ≈6px）。联机/旅程钮行以 display:contents 入
    //  簇格（其子成为第 4 行格,单机不可见不占位）----
    const sideCol = el('div');
    sideCol.style.cssText = 'display:flex; flex-direction:column; gap:4px; align-items:center;'
      + 'margin-top:-6px;';
    row.style.cssText = 'display:contents;';   // 联机/旅程钮 → 簇格第 4 行（子项直入网格）
    sideCol.appendChild(this.achAdvisorEl);   // 成就提示牌（Advisor 卡,竖式）
    rightRail.appendChild(sideCol);
    // 杂项（宠物/光源/矿车/坐骑/钩爪+染料，原杂项页）+ PvP/队伍钮 → 右下角坞右列
    //（2026-09-02 用户要求；此前挂 advRail 玩家对决原位）
    const miscStack = el('div');
    miscStack.style.cssText = 'display:flex; flex-direction:column; gap:10px; align-items:center;';
    miscStack.appendChild(miscRail);
    eqDock.appendChild(miscStack);
    this.invPanel.appendChild(body);

    // ---- PvP/队伍快切钮（DrawPVPIcons Main.cs:42074-42195：原版背包右下角；
    //      本仓挂右缘列杂项块下方（2026-08-27 杂项迁入此列,对决/队伍钮顶下去）；
    //      原版 ShouldPVPDraw=netMode==1 仅联机画，本仓常开=设置页 PvP/队伍同款
    //      语义（单机调试便利 + 联机 msg13 同步）） ----
    const pvpWrap = el('div');
    // margin-top 拉开与钩爪行（杂项列末行）的间距（2026-08-27 用户要求；2026-09-02
    // 随杂项列迁右下角坞,miscStack gap 10px 已含基础间距,此 margin 减半）
    pvpWrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; margin-top:12px;';
    // PvP 剑（:42112-42116：38px 帧裁 Width-2/Height-1 → 36×37）
    this.pvpSwordBtn = el('button', 'sw-btn');
    this.pvpSwordBtn.style.cssText = 'margin:0; width:36px; height:37px; padding:0; flex:none;'
      + 'border:none; background:url(sprites/vanilla-ui/UI_PVP_0.png); background-size:400% 600%;'
      + 'background-position:0% 0%; image-rendering:pixelated; cursor:pointer;';
    this.pvpSwordBtn.addEventListener('mouseenter', () => this.refreshPvpButtons());
    this.pvpSwordBtn.addEventListener('mouseleave', () => this.refreshPvpButtons());
    this.pvpSwordBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.pvpToggleHostile();
    });
    pvpWrap.appendChild(this.pvpSwordBtn);
    // 队伍 2×3 格（:42127-42133：20px 步进；图标 18×18 裁 16 宽 :42185/:42191；
    // 悬停高亮 UI_PVP_2 20×20 垫底 @(:42188)）——60-38=22px 间距（:42119 num3+=60）
    const teamGrid = el('div');
    teamGrid.style.cssText = 'display:grid; grid-template-columns:repeat(2,20px);'
      + 'grid-auto-rows:20px; margin-top:22px;';
    this.pvpTeamBtns = [];
    for (const tb of PVP_TEAM_BUTTONS) {
      const cell = el('button', 'sw-btn');
      cell.style.cssText = 'margin:0; width:20px; height:20px; padding:0; flex:none;'
        + 'border:none; background:none; background-color:transparent;'
        + 'image-rendering:pixelated; cursor:pointer;';
      const icon = el('div');
      icon.style.cssText = 'position:absolute; left:2px; top:1px; width:16px; height:18px;'
        + `background:url(sprites/vanilla-ui/UI_PVP_1.png); background-size:600% 100%;`
        + `background-position:${tb.team * 20}% 0%; image-rendering:pixelated; pointer-events:none;`;
      cell.style.position = 'relative';
      cell.appendChild(icon);
      cell.addEventListener('mouseenter', () => this.refreshPvpButtons());
      cell.addEventListener('mouseleave', () => this.refreshPvpButtons());
      cell.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.pvpSetTeam(tb.team);
      });
      teamGrid.appendChild(cell);
      this.pvpTeamBtns.push(cell);
    }
    pvpWrap.appendChild(teamGrid);
    miscStack.appendChild(pvpWrap);   // 右下角坞杂项列下方（2026-09-02 迁出 advRail）
    this.refreshPvpButtons();

    // 防御计数器（原版 DrawDefenseCounter Main.cs:41555-41623：Extra_58 盾 3×2 帧
    // [普通/专家/大师 × 底/辉光] + 数值【居中叠在盾上】(:41598 vector-测量宽*0.5+2y);
    // 悬停 = 「N 防御 + 伤害减免%(难度换算 0.5/0.75/1)」。位置=装备列下方（用户指定）
    const defRow = el('div');
    defRow.style.cssText = 'display:flex; justify-content:center; margin:6px 0 2px; cursor:help;';
    defRow.dataset.role = 'defense';
    const defWrap = el('div');
    defWrap.style.cssText = 'position:relative; width:40px; height:36px;';
    // 防御盾图用 <img>+dataURL 而非独立 canvas(2026-08-19 双开 IOSurface 压基数:
    // 每张 DOM canvas = 一张专属后备 surface;img 进共享合成层零专属面。
    // 帧内容按难度列静态,经模块级 52×48 scratch 烘一次 toDataURL 缓存,见下方刷新处)
    const defShield = el('img');
    defShield.alt = '';
    defShield.style.cssText = 'position:absolute; inset:0; margin:auto; width:39px; height:36px; image-rendering:pixelated;';
    defWrap.appendChild(defShield);
    const defNum = el('span', '', '0');
    defNum.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center;'
      + 'padding-top:2px; font-size:13px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000;';
    defWrap.appendChild(defNum);
    defRow.appendChild(defWrap);
    defRow.addEventListener('mouseenter', () => {
      if (!this.game) return;
      const p = this.game.player;
      const st = p.defense;
      const w = this.game.world;
      // 伤害减免换算（Main.cs:42831-42840）：大师 ×1.0 / 专家 ×0.75 / 普通 ×0.5,ceil
      const mul = w.isMaster ? 1.0 : w.isExpert ? 0.75 : 0.5;
      const reduce = Math.ceil(st * mul);
      // 悬停文本三行结构（Main.cs:42878-42890）："N 防御"（inter[10]）/
      // "受到的伤害降低N"（UI.DefenseDamageReduction）/难度行 传奇>大师>专家
      //（经典无行）。★曾硬编码中文+难度并括号（双语档偏离）且【漏定位】——
      // 共享 tooltip 元素停在旧位置=用户报"气泡不太对"（2026-09-02）
      const dl = mainDifficulty(w);
      const tipLines = [`${st} ${Lang.text('LegacyInterface.10')}`,
        Lang.text('UI.DefenseDamageReduction', reduce)];
      if (dl >= GDL.LEGENDARY) tipLines.push(Lang.text('UI.Legendary'));
      else if (dl >= GDL.MASTER) tipLines.push(Lang.text('UI.Master'));
      else if (dl >= GDL.EXPERT) tipLines.push(Lang.text('UI.Expert'));
      this.showBuffTooltip(defWrap, tipLines[0], tipLines.slice(1).join('\n'));
    });
    defRow.addEventListener('mouseleave', () => this.hideBuffTooltip());
    equipCol.appendChild(defRow);   // 装备列（第三列）正下方（原版画在装备区左侧垂直居中,用户指定装备列底）

    // 合成区 —— 挂 right（物品格容器）内部底部=物品格正下方（用户指定，
    // 此前挂 invPanel 横跨整个面板宽度）。标题+可用合成站同行（减少高度占用）
    const craftTitleRow = el('div');
    // margin-top 撑开背包网格/钮簇与合成区的间距（2026-08-27 用户要求,红框处）
    craftTitleRow.style.cssText = 'display:flex; align-items:baseline; gap:8px; margin:14px 0 6px;';
    {
      const t = el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Crafting'));
      t.style.fontSize = '14px';   // 随 39px 格缩放降级（.sw-title 17px 偏大,2026-08-27 用户要求）
      t.style.marginBottom = '0px';
      craftTitleRow.appendChild(t);
    }
    const stations = el('div', '', '');
    stations.style.cssText = 'font-size:11px; color:#8ad0a0; flex:1; min-width:0; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
    stations.dataset.role = 'stations';
    craftTitleRow.appendChild(stations);
    right.appendChild(craftTitleRow);
    // ---- Modern 合成网格控件（1.4.5 CraftingGrid：搜索栏 + 焦点配方材料格） ----
    const modernRow = el('div');
    modernRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
    // ★SW-BJ1 2026-09-06 附近箱参与制作开关（CraftingUI.DrawCraftFromNearbyChestsToggle
    // CraftingUI.cs:336-356，Main.cs:42442 挂点 = 网格开关下方 40px、配方列表旁）：
    // ChestCraft 四帧贴图（index = 2−val×2+hover：0/1 开态常驻/悬停、2/3 关态），
    // 悬停 tooltip = GameUI.CraftFromNearbyChestsOn/Off（MouseTextNoOverride :345），
    // 点击翻转 + SoundID 12 + NewCraftingUI.RefreshGrid（:349-352 → 本仓 refresh-
    // VanillaCrafting）。设置页入口保留（Settings.ts game 组,双入口同 original 一面）
    {
      const btn = el('div');
      btn.style.cssText = 'flex:0 0 auto; width:32px; height:34px; cursor:pointer; line-height:0;';
      btn.title = '';
      const img = document.createElement('img');
      img.draggable = false;
      img.style.cssText = 'width:32px; height:34px; image-rendering:pixelated;';
      this.craftNearbyToggleImg = img;
      const sync = (): void => {
        img.src = `sprites/vanilla-ui/UI_ChestCraft_${
          options.data.craftFromNearbyChests ? 0 : 2}.png`;
      };
      sync();
      options.onChange(sync);   // 设置页入口翻转时同步贴图（UI 单例长存无退订点,同 :1071）
      const tip = (): void => this.showBuffTooltip(btn,
        Lang.text(options.data.craftFromNearbyChests
          ? 'GameUI.CraftFromNearbyChestsOn' : 'GameUI.CraftFromNearbyChestsOff'), '');
      btn.addEventListener('mouseenter', () => {
        img.src = `sprites/vanilla-ui/UI_ChestCraft_${
          options.data.craftFromNearbyChests ? 1 : 3}.png`;
        // ★SW-RB5a：悬停进入音（DoStatefulTickSound Main.cs:3333-3344——hover 沿
        //  false→true 播 SoundID 12,离开不播）
        this.game?.sfx.play('menuTick', 1);
        tip();
      });
      btn.addEventListener('mouseleave', () => {
        img.src = `sprites/vanilla-ui/UI_ChestCraft_${
          options.data.craftFromNearbyChests ? 0 : 2}.png`;
        this.hideBuffTooltip();
      });
      btn.addEventListener('click', () => {
        void options.set('craftFromNearbyChests', !options.data.craftFromNearbyChests);
        this.game?.sfx.play('menuTick', 1);            // SoundID 12（CraftingUI.cs:351）
        this.craftFocus = -1;
        this.hoverFocus = -1;
        this.refreshVanillaCrafting();                 // NewCraftingUI.RefreshGrid 同语义
        tip();                                         // 悬停中翻转 → 文案随态换行
      });
      btn.appendChild(img);
      modernRow.appendChild(btn);
    }
    this.craftSearchEl = el('input') as HTMLInputElement;
    this.craftSearchEl.placeholder = Lang.text('Mods.SandboxWorld.Craft.SearchHint');
    // ★input 高度对齐右侧配方细项盒(38px)并恒定——未 hover 时细项盒塌掉曾把
    //  本行行高拖落=搜索框上下抖动（2026-08-26 用户图文定案）
    this.craftSearchEl.style.cssText = 'flex:1; height:38px; box-sizing:border-box; padding:4px 8px; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px; font-size:12px;';
    this.craftSearchEl.addEventListener('input', () => { this.craftFocus = -1; this.hoverFocus = -1; this.refreshVanillaCrafting(); if (this.craftListEl) this.craftListEl.scrollTop = 0; });
    modernRow.appendChild(this.craftSearchEl);
    this.craftGridEl = el('div');
    this.craftGridEl.style.cssText = 'display:flex; gap:4px; align-items:center; flex-wrap:wrap; max-width:426px; height:38px; box-sizing:border-box;';
    modernRow.appendChild(this.craftGridEl);
    right.appendChild(modernRow);
    const craftWrap = el('div');
    craftWrap.style.cssText = 'position:relative;';
    right.appendChild(craftWrap);
    this.craftListEl = el('div', 'sw-craft-list');
    // 2026-09-01 用户定案：滚动回归浏览器原生溢出容器（overflow-y:auto），行=
    // 静态流式子元素，滚轮/滚动条/触控全部交还 DOM——自算滚动（行池+rAF 缓动+
    // 自绘滚动条）整体退役。早年"原生滚动=位置每帧归零"的根因是重建行后不回填
    // scrollTop，非原生滚动本身（重建回填见 refreshVanillaCrafting）。
    this.craftListEl.style.cssText = 'max-height:240px; overflow-y:auto; width:426px;';
    // 仅挂时间戳（hover 预览门消费），不拦滚轮——preventDefault 会掐死原生滚动
    this.craftListEl.addEventListener('wheel', () => { this.craftWheelLast = performance.now(); }, { passive: true });
    this.craftListEl.addEventListener('mousemove', () => { this.craftMouseMoveLast = performance.now(); });
    // 移出列表清预览+高亮（材料格回落到点击选中行）
    this.craftListEl.addEventListener('mouseleave', () => {
      this.craftHoverEl?.classList.remove('hov');
      this.craftHoverEl = null;
      if (this.hoverFocus !== -1) { this.hoverFocus = -1; this.refreshCraftGrid(this.craftAvailRef); }
    });
    craftWrap.appendChild(this.craftListEl);
    this.root.appendChild(this.invPanel);
    this.root.appendChild(eqDock);   // 右下角无框坞与面板平级（root 直挂,2026-09-02）
  }

  /** 滚轮时间戳——hover 预览 350ms 门（原生滚动经停行的 mouseenter 不预选） */
  private craftWheelLast = 0;
  /** 列表容器最近一次真实 mousemove——区分「鼠标主动移到行上」与「内容滚动
   *  让行从静止鼠标下经过」(后者浏览器同样派发 mouseenter,但无 mousemove
   *  伴随)——hover 预选只认前者(2026-08-25 用户报滚动过程连环误预选) */
  private craftMouseMoveLast = 0;
  /** .hov 高亮行——高亮与预选(hoverFocus)分离:预选只进材料格,不碰列表本身 */
  private craftHoverEl: HTMLElement | null = null;

  /** Buff 状态栏（对齐原版 DrawInterface_Resources_Buffs，Main.cs:42618-42640 +
   *  DrawBuffIcon :42725）：
   *  起点 (32,76)、**每行 11 个横排**（步距 38px = 32 图标 + 6 缝；行宽 418）、
   *  行距 50px、裸 32×32 **原版 Buff_{vanillaBuff} 贴图**（TextureAssets.Buff 1:1
   *  尺寸原大绘制，不用药水物品图标替代）、剩余时长文字在图标正下方（ItemStack
   *  0.8 倍字号）、悬停提亮（原版 buffAlpha 0.4↔1.0 的 CSS 近似）、右键取消
   *  （TryRemovingBuff：非 debuff 播 SoundID 12=menuTick）、背包打开时隐藏 */
  private buildBuffBar() {
    this.buffBar = el('div');
    // 11×38=418 行宽 = 原版 num2=11 行卷绕，行距 50-32=18（纵排 bug 修复：此前
    // 缺 flex-direction 显式声明且行宽 412 装不下第 11 个）
    this.buffBar.style.cssText = 'pointer-events:auto; position:fixed; top:76px; left:32px; display:flex; flex-direction:row; flex-wrap:wrap; width:418px; column-gap:6px; row-gap:18px; align-content:flex-start;';
    this.root.appendChild(this.buffBar);
    this.buffBlocks.clear();
    this.petBuffBlocks.clear();
    this.nebulaBuffBlocks.clear();
    // 块按激活顺序动态创建（原版按 buff 槽序全量显示，无白名单——此前硬编码
    // 19 种，战斗/镇静/挖矿/糖分冲刺等 20+ 种永不显示）
  }

  /** buff 悬停即时气泡——原版悬停走 MouseTextHackZoom(buffName,buffTooltip)
   *  （Main.cs:43964-43974）与物品 tooltip 同字体同底板;本仓曾用浏览器原生
   *  title（出泡延迟秒级、样式不可控），改复用 sw-tooltip 面板（九宫底+brightness
   *  脉冲+18px 边距屏幕钳制，定位式与物品槽路径 ：2036-2043 同款）。文本由三个
   *  buff 通道（普通/宠物/星云）在 refreshBuffs 里写 data-sw-tip-* 再入此口 */
  private showBuffTooltip(anchor: HTMLElement, name: string, desc: string): void {
    let html = `<span style="color:#ffffff">${name}</span>`;
    for (const ln of desc.split('\n')) if (ln) html += `<br>${ln}`;
    this.tooltip.innerHTML = `<div class="sw-tooltip-lines">${html}</div>`;
    this.tooltip.style.display = 'block';
    this.startTooltipPulse();
    this.applyTooltipBg();
    const r = anchor.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    let left = r.right + 8, top = r.top;
    if (left + tw > window.innerWidth - 18) left = Math.max(0, window.innerWidth - tw - 18);
    if (top + th > window.innerHeight - 18) top = Math.max(0, window.innerHeight - th - 18);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hideBuffTooltip(): void {
    this.tooltip.style.display = 'none';
    cancelAnimationFrame(this.tooltipPulseRaf);
  }

  /** ★2026-09-13 反馈轮6:vinv 域钮 hover 名统一走自有气泡(showBuffTooltip),弃原生
   *  title(浏览器原生气泡延迟 ~1s 且样式不符)。textFn 惰性求值——hover 瞬间读当前态。 */
  private vinvBindHoverTip(btn: HTMLElement, textFn: () => string): void {
    btn.addEventListener('mouseenter', () => this.showBuffTooltip(btn, textFn(), ''));
    btn.addEventListener('mouseleave', () => this.hideBuffTooltip());
  }

  /** 单个 buff 块（原版 DrawBuffIcon Main.cs:42725 的 DOM 化）。
   *  t=null 时为宠物 buff 通道块（BuffType 无宠物成员，不进 BuffState.active）：
   *  无倒计时（buffNoTimeDisplay）+ 右键 = 收宠（原版 TryRemovingBuff
   *  Main.cs:42788 → CheckBuffHideMisc :42808：右键宠物 buff 图标即 hideMisc 翻转） */
  private makeBuffBlock(t: BuffType | null, petSlot: 0 | 1 = 0): { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement } {
    const block = el('div', 'sw-buff');
    block.style.display = 'none';
    block.style.cssText += 'position:relative; width:32px; height:32px; background:none; border:none; border-radius:0; cursor:pointer; flex:0 0 auto;';
    const icon = el('img') as HTMLImageElement;
    icon.draggable = false;
    // 原版 buffAlpha（Main.cs:42732/42750-42777）：基准 0.4、悬停渐亮至 1.0、
    // 离开回落 0.4——alpha 通道本身（Color×alpha），非 brightness
    icon.style.cssText = 'width:32px; height:32px; image-rendering:pixelated; display:block; opacity:0.4; transition:opacity 0.2s linear;';
    block.appendChild(icon);
    const time = el('span', '', '');
    time.style.cssText = 'position:absolute; left:-4px; right:-4px; top:34px; text-align:center; font-size:11px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000; white-space:nowrap;';
    block.appendChild(time);
    // 悬停提亮（原版 buffAlpha 悬停 +0.1/t 至 1、离开 -0.05/t 至 0.4 的 CSS 近似）
    block.addEventListener('mouseenter', () => {
      icon.style.opacity = '1';
      const nm = block.dataset.swTipName ?? '';
      if (nm) this.showBuffTooltip(block, nm, block.dataset.swTipDesc ?? '');
    });
    block.addEventListener('mouseleave', () => {
      icon.style.opacity = '0.4';
      this.hideBuffTooltip();
    });
    // 右键取消（TryRemovingBuff L42793+：非 debuff → DelBuff + SoundID 12；
    //  宠物 buff 走 CheckBuffHideMisc 收宠，不走 buffs.remove——其不在 BuffState 里）
    block.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hideBuffTooltip();   // 右键后块可能消失/上移，先收气泡
      if (!this.game) return;
      if (t === null) this.game.togglePetSlot(petSlot);
      else {
        this.game.player.buffs.remove(t);
        this.game.sfx.play('menuTick');
      }
      this.refreshBuffs();
    });
    return { block, icon, time };
  }

  buffBar: HTMLElement | null = null;
  buffBlocks = new Map<BuffType, { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement }>();
  /** buff 键集合签名（tickBuffLive 每帧比对，变更才整刷——见该函数注） */
  private _buffSig = ' ';   // 初值必不等于任何真实签名 → 首帧 tickBuffLive 即整刷一次
  /** 宠物 buff 显示通道（key = 装备槽 0=宠物 / 1=光宠）。不进 buffBlocks：
   *  BuffType 未扩 62 个宠物成员，宠物 buff 也不在 BuffState.active 里——
   *  原版 UpdatePet/UpdatePetLight（Player.cs:17147-17187）装备槽 buffType 经
   *  AddBuff(buff,3600) 恒刷新入 buff 槽即"宠物存在标志"，UI 直接由装备槽派生。
   *  ★SW-FX2（2026-09-09）：宠物 buff 已入 BuffState（UpdatePet 补挂面 →
   *  Game.updatePetSlot），通道注中「不在 BuffState.active 里」已失效——普通循环
   *  对宠物 buff 一律跳过（petVanillaBuffs 哨兵集），图标仍由本通道独家承载，
   *  防同一 Buff_42 出现双图标；右键收宠（CheckBuffHideMisc）语义在通道块 */
  petBuffBlocks = new Map<0 | 1, { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement }>();
  /** vanilla-pets.json 全表伴生 buff 集（普通循环跳过哨兵；懒建一次，同
   *  Game.petBuffKinds 口径） */
  private static _petVanillaBuffs: Set<number> | null = null;
  private static petVanillaBuffs(): Set<number> {
    if (!UI._petVanillaBuffs) {
      const s = new Set<number>();
      for (let vid = 1; vid <= 5700; vid++) {
        const pi = petInfoOfVid(vid);
        if (pi) s.add(pi.buff);
      }
      UI._petVanillaBuffs = s;
    }
    return UI._petVanillaBuffs;
  }

  /** 槽位当前应显示的宠物 buff：装备在槽 + 跟随体存活（hideMisc/玩家死亡时
   *  Game.updatePetSlot 即灭跟随体，等价原版 TogglePet 的 ClearBuff） */
  private activePetBuff(slot: 0 | 1): { buff: number; proj: number } | null {
    const g = this.game;
    const item = g.player.inv.miscEquips[slot];
    if (!item) return null;
    const info = petInfoOfVid(vidOf(item.id));
    if (!info) return null;
    const f = slot === 0 ? g.petFollower : g.lightPetFollower;
    if (!f || f.dead || f.projId !== info.proj) return null;
    return { buff: info.buff, proj: info.proj };
  }

  /** 每帧轻通道（红队 A1 定罪 2026-08-31：原版 DrawBuffIcon :44042-44060 每帧跑，
   *  ownedProjectileCounts 每帧重算（:12271）——随从生灭/xN 计数若只随 1Hz 全刷，
   *  击杀随从后旧计数与图标滞留 ≤1s。此轻通道只维持两帧动态面，不碰图标/tooltip：
   *  ① buff 键集合变更 → 即时整刷（随从召唤/死亡/药水到期的图标生灭当帧跟手）；
   *  ② 计数族（BuffTextHandlers）逐帧更新 "xN" 文本，值不变时零 DOM 写。 */
  tickBuffLive(): void {
    // ★SW-FX10 债④：开包但页2(buff 列在显)不再整帧早退——列内块同样需要随从
    //  计数/生灭即时面；其余开包态(块整体不可见)照旧零开销
    const invOpen = this.invPanel?.style.display === 'block';
    const colVisible = invOpen && this._builtLayout === 'vanilla' && this.vinvPageCurrent === 2 && !!this.miscBuffCol;
    if (!this.game || (invOpen && !colVisible)) return;
    const buffs = this.game.player.buffs;
    let sig = '';
    for (const t of buffs.active.keys()) sig += t + ',';
    if (sig !== this._buffSig) { this.refreshBuffs(); return; }   // refreshBuffs 会回写 _buffSig
    for (const [t, ui] of this.buffBlocks) {
      if (ui.block.style.display === 'none') continue;
      const projs = BUFF_TEXT_PROJECTILE_COUNTER[BUFF_DEFS[t].vanillaBuff];
      if (!projs) continue;
      let n = 0;
      for (const q of this.game.entities.projectiles) {
        const pid = (q as { projId?: number }).projId;
        if (!q.dead && pid !== undefined && projs.includes(pid)) n++;
      }
      const want = n > 0 ? `x${n}` : '';
      if (ui.time.textContent !== want) ui.time.textContent = want;
    }
  }

  /** 每秒左右调用一次（由 Game 经 callbacks 驱动）。
   *  原版行为（1457 Main.cs:43933-44107）：遍历 buff 槽按序显示全部激活 buff；
   *  背包/华美 UI 打开时整栏不画；剩余时长由 DrawBuffIcon（:44049-44064）常驻
   *  画在图标正下方，经 TryGetBuffTime（:43985）门控 + LocalizedDuration 缩写
   *  格式（单最大单位，<60 秒逐秒）——见 localizedDuration */
  /** buff 块宿主（SW-FX10 债④）：开包∧vanilla 布局∧页2 → 杂项页 buff 列
   *  （原版 EquipPage==2 支 :42008-42046），否则 HUD 栏（:42618-42640+DrawBuffIcon）。
   *  refreshBuffs 的新建/整序 appendChild 一律经此——两态同一批块对象,零复制 */
  private get buffHost(): HTMLElement {
    const invOpen = this.invPanel?.style.display === 'block';
    return (invOpen && this.miscBuffCol && this._builtLayout === 'vanilla' && this.vinvPageCurrent === 2)
      ? this.miscBuffCol
      : this.buffBar!;
  }

  /** buff 块容器 reflow（SW-FX10 债④）：页切换/布局变化后把三通道块按序搬入当前
   *  宿主。块在 buffBar 内走 flex 流（position:relative 已由类/内联给足）,入列后
   *  改绝对定位（miscBuffCellXY 列向左/行向下）;回流 buffBar 时还原。由
   *  vinvApplyPage 与 refreshBuffs 头部调用 */
  private reflowBuffs(): void {
    if (!this.buffBar) return;
    const host = this.buffHost;
    const c = this.vinvLayoutCtx;
    const rows = c ? miscBuffRowsPerCol(c.sh, c.minimapOn) : 3;
    const inCol = host === this.miscBuffCol && !!this.miscBuffCol;
    const pools = [this.buffBlocks, this.petBuffBlocks, this.nebulaBuffBlocks];
    for (const pool of pools) {
      let n = 0;
      for (const ui of pool.values()) {
        const b = ui.block;
        if (inCol && this.miscBuffCol) {
          const cell = miscBuffCellXY(n, rows);
          b.style.position = 'absolute';
          b.style.left = `${cell.x}px`;
          b.style.top = `${cell.y}px`;
          if (b.parentElement !== this.miscBuffCol) this.miscBuffCol.appendChild(b);
        } else {
          b.style.position = 'relative';
          b.style.left = '';
          b.style.top = '';
          if (b.parentElement !== this.buffBar) this.buffBar.appendChild(b);
        }
        n++;
      }
    }
  }

  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
    this.reflowBuffs();
    const buffs = this.game.player.buffs;
    const invOpen = this.invPanel.style.display === 'block';
    // ★收气泡只走“栏隐藏”边沿（2026-08-28 用户报"hover 道具气泡过一会自己消失"）：
    //  .sw-tooltip 元素为 Buff 气泡与【物品详情气泡】共用——曾每秒无条件收,
    //  背包开着时把物品气泡也一并秒杀。边沿 = 栏从可见转隐藏的那一帧收一次
    const barWas = this.buffBar.style.display !== 'none';
    this.buffBar.style.display = invOpen ? 'none' : 'flex';
    if (invOpen && barWas) this.hideBuffTooltip();   // 可见→隐藏边沿,一次收气泡
    const seen = new Set<BuffType>();
    for (const [t, left] of buffs.active) {
      seen.add(t);
      // ★SW-FX2：宠物 buff（UpdatePet 补挂面入 BuffState）图标由上方宠物通道独家
      //  承载（无倒计时+右键收宠,原版 TryRemovingBuff→CheckBuffHideMisc :42788/:42808
      //  同面）——普通循环跳过,防同 buff 双图标
      if (UI.petVanillaBuffs().has(BUFF_DEFS[t].vanillaBuff)) continue;
      let ui = this.buffBlocks.get(t);
      if (!ui) {
        // 动态建块：无白名单，任何激活 buff 都显示（原版按 buff 槽序）
        ui = this.makeBuffBlock(t);
        this.buffHost.appendChild(ui.block);   // SW-FX10 债④:宿主随开包页2 reflow
        this.buffBlocks.set(t, ui);
      }
      ui.block.style.display = 'flex';
      ui.block.dataset.swTipName = buffName(t);
      // 旗帜(147)：描述后追加名单行（Main.cs:21558-21612 bannerMouseOver 第二循环
      // 1:1——按 BannerSystem 旗种枚举,BannerToNPC(i) 每旗种一行代表名;此前用
      // 全覆盖集逐变体罗列=多 NPC 旗名单重复（2026-09-01 用户实报））
      let tipDesc = buffDesc(t);
      if (BUFF_DEFS[t].vanillaBuff === 147 && this.game) {
        const bn = bannerBuffNames(this.game.bannerRepIds(), (id) => Lang.npcName(id));
        if (bn) tipDesc += '\n' + bn;
      }
      ui.block.dataset.swTipDesc = tipDesc;
      // 原版 DrawBuffIcon（Main.cs:42736）：TextureAssets.Buff[type] 原大绘制——
      // 用原版 Buff_{vanillaBuff} 贴图（2026-08-13 前：误用对应药水物品图标）
      const want = remasterBuffIcon?.(BUFF_DEFS[t].vanillaBuff)
        ?? `/sprites/vanilla/Buff_${BUFF_DEFS[t].vanillaBuff}.png`;
      if (!(ui.icon as HTMLImageElement).src.endsWith(want)) {
        (ui.icon as HTMLImageElement).onerror = () => {
          // 素材缺失兜底：退回药水物品图标（缺表时仍可见）
          const iconId = this.buffIconItem.get(t);
          if (iconId && this.game) (ui.icon as HTMLImageElement).src = iconUrl(this.game, iconId);
          (ui.icon as HTMLImageElement).onerror = null;
        };
        (ui.icon as HTMLImageElement).src = want;
      }
      // 时长门（1457 Main.cs:43985-44054）= TryGetBuffTime(:44029-44040) 拒答面 +
      // DrawBuffIcon(:44058) 的 buffTime>2【tick】出字门。拒答四支：
      // ① buffNoTimeDisplay 表（BUFF_NO_TIME_DISPLAY——工位五件套/狼人/宠物族等 124 项，
      //    磨刀石 159 即属此：右键 30 分钟全程无倒计时字样）；
      // ② 蜜中 honeyWet 不显示 Honey(48)（`(!honeyWet || num != 48)`，:44031）；
      // ③ 湿身+专家不显示 Chilled(46)（`(!wet || !expertMode || num != 46)`，wet≙三液并集）；
      // ④ vampireSeed 下火系三连(24/23/32) <10 tick 不出字——日光炽灼三连每帧 3t 续期
      //    恒 <10t,图标上永不显示时长
      const ticksLeft = left * 60;
      const vb = BUFF_DEFS[t].vanillaBuff;
      const vampHideTime = !!this.game.world.seedFlags?.vampireSeed
        && [24, 23, 32].includes(vb) && ticksLeft < 10;
      const p = this.game.player;
      const tryGetTime = !BUFF_NO_TIME_DISPLAY.has(vb)
        && !(vb === 48 && p.inHoney)
        && !(vb === 46 && (p.inWater || p.inLava || p.inHoney) && this.game.world.isExpert);
      // 图标文字（Main.cs:44051-44059 DrawBuffIcon）：BuffTextHandlers 在册族（随从 28 项，
      // BuffID.cs:36-145）先于时长——ownedProjectileCounts 按弹型求和 >0 → "x"+n，
      // =0 → null 回落时长路径（noTimeDisplay 拒答 → 无字）；其余走时长门
      const counterProjs = BUFF_TEXT_PROJECTILE_COUNTER[vb];
      let timeText: string;
      if (counterProjs) {
        let n = 0;
        for (const q of this.game.entities.projectiles) {
          const pid = (q as { projId?: number }).projId;
          if (!q.dead && pid !== undefined && counterProjs.includes(pid)) n++;
        }
        timeText = n > 0 ? `x${n}` : '';
      } else {
        // buffTime/60 先整除到秒再格式化（Main.cs:44053 new TimeSpan(0,0,buffTime/60)）
        timeText = !tryGetTime || vampHideTime || ticksLeft <= 2 ? '' : localizedDuration(left);
      }
      ui.time.textContent = timeText;
    }
    for (const [t, ui] of this.buffBlocks) {
      if (!seen.has(t)) ui.block.style.display = 'none';
    }
    {  // 回写键集合签名（tickBuffLive 的变更检测基准）
      let sig = '';
      for (const t of buffs.active.keys()) sig += t + ',';
      this._buffSig = sig;
    }
    // ---- 宠物/光宠 buff（独立通道；原版同栏追加在普通 buff 之后，无倒计时） ----
    const petStates = ([0, 1] as const).map((slot) => {
      const pb = this.activePetBuff(slot);
      let ui = this.petBuffBlocks.get(slot);
      if (pb && !ui) {
        ui = this.makeBuffBlock(null, slot);
        this.petBuffBlocks.set(slot, ui);
      }
      return { pb, ui };
    });
    for (const { pb, ui } of petStates) {
      if (!ui) continue;
      const u = ui; // const 别名（闭包内保留窄化）
      if (!pb) {
        u.block.style.display = 'none';
        continue;
      }
      u.block.style.display = 'flex';
      // 名/描述 = Lang.buffName/buffDesc（BuffName/BuffDescription.<Internal>，
      //  62 款宠物 buff 全有内名；缺名回退投射物名）
      const nm = Lang.buffName(pb.buff) ?? Lang.projectileName(pb.proj);
      u.block.dataset.swTipName = nm ?? '';
      u.block.dataset.swTipDesc = nm ? (Lang.buffDesc(pb.buff) ?? '') : '';
      // buffNoTimeDisplay：宠物 buff 不显示剩余时长（原版 TryGetBuffTime 不出文字）
      u.time.textContent = '';
      const want = remasterBuffIcon?.(pb.buff) ?? `/sprites/vanilla/Buff_${pb.buff}.png`;
      if (!(u.icon as HTMLImageElement).src.endsWith(want)) {
        (u.icon as HTMLImageElement).onerror = () => {
          // 素材缺失兜底：退回宠物投射物贴图 Projectile_<proj>.png
          (u.icon as HTMLImageElement).onerror = null;
          (u.icon as HTMLImageElement).src = `/sprites/vanilla/Projectile_${pb.proj}.png`;
        };
        (u.icon as HTMLImageElement).src = want;
      }
    }
    // 恒置普通 buff 之后（原版 AddBuff 找空槽追加）：末位不符才整序（免每秒 DOM 抖动）
    // ★SW-FX10 债④：宿主面随 buffHost（开包页2 = 杂项列,否则 HUD 栏）
    const liveBlocks = petStates.filter((s) => s.pb && s.ui).map((s) => s.ui!.block);
    if (liveBlocks.length && this.buffHost.lastElementChild !== liveBlocks[liveBlocks.length - 1]) {
      for (const b of liveBlocks) this.buffHost.appendChild(b);
    }
    // ---- 星云增益派生通道（补 C ⚠️图标批：原版拾取星云 booster 即 AddBuff
    //      173-181（NebulaLevelup Player.cs:56091-56121），buff 栏随档位显示
    //      Buff_173-181.png；本仓等级/效果在 Player.nebula 主状态（效果消费
    //      :1606/:1633/:3740-3746 已接），此处补图标派生层——等级>0 的族出块，
    //      图标随档位换 Buff_{base+lvl-1}.png，倒计时=nebulaT）----
    const nebStates = ([0, 1, 2] as const).map((fam) => {
      const nb = this.game!.player.nebulaBuffIcons().find((n) => n.fam === fam) ?? null;
      let ui = this.nebulaBuffBlocks.get(fam);
      if (nb && !ui) {
        ui = this.makeNebulaBlock(fam);
        this.nebulaBuffBlocks.set(fam, ui);
      }
      return { nb, ui };
    });
    for (const { nb, ui } of nebStates) {
      if (!ui) continue;
      const u = ui;
      if (!nb) {
        u.block.style.display = 'none';
        continue;
      }
      u.block.style.display = 'flex';
      u.block.dataset.swTipName = Lang.buffName(nb.vanillaBuff) ?? '星云';
      u.block.dataset.swTipDesc = Lang.buffDesc(nb.vanillaBuff) ?? '';
      u.time.textContent = Lang.text('Mods.SandboxWorld.Time.Seconds', nb.secs);
      const want = remasterBuffIcon?.(nb.vanillaBuff) ?? `/sprites/vanilla/Buff_${nb.vanillaBuff}.png`;
      if (!(u.icon as HTMLImageElement).src.endsWith(want)) {
        (u.icon as HTMLImageElement).src = want;
      }
    }
    const liveNeb = nebStates.filter((s) => s.nb && s.ui).map((s) => s.ui!.block);
    if (liveNeb.length) {
      const last = liveNeb[liveNeb.length - 1];
      if (this.buffHost.lastElementChild !== last) for (const b of liveNeb) this.buffHost.appendChild(b);
    }
  }

  /** 星云增益派生块（key = 族 0 伤/1 命/2 魔）。不进 BuffState——等级真值在
   *  Player.nebula（NebulaLevelup :56091 逐级升/降），右键取消 = nebulaCancel
   *  （原版右键 DelBuff → UpdateBuffs_NebulaBuffs :11660 派生链断,效果即停） */
  nebulaBuffBlocks = new Map<0 | 1 | 2, { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement }>();

  private makeNebulaBlock(fam: 0 | 1 | 2): { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement } {
    const block = el('div', 'sw-buff');
    block.style.display = 'none';
    block.style.cssText += 'position:relative; width:32px; height:32px; background:none; border:none; border-radius:0; cursor:pointer; flex:0 0 auto;';
    const icon = el('img') as HTMLImageElement;
    icon.draggable = false;
    icon.style.cssText = 'width:32px; height:32px; image-rendering:pixelated; display:block; opacity:0.4; transition:opacity 0.2s linear;';
    block.appendChild(icon);
    const time = el('span', '', '');
    time.style.cssText = 'position:absolute; left:-4px; right:-4px; top:34px; text-align:center; font-size:11px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000; white-space:nowrap;';
    block.appendChild(time);
    block.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
    block.addEventListener('mouseleave', () => { icon.style.opacity = '0.4'; });
    block.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.game) return;
      this.game.player.nebulaCancel(fam);
      this.game.sfx.play('menuTick');          // SoundID 12（Main.cs:42793 非 debuff 取消）
      this.refreshBuffs();
    });
    this.buffBar?.appendChild(block);
    return { block, icon, time };
  }

  // Buff → 物品图标（仅作原版 Buff 贴图缺失时的兜底——正道是 Buff_{vanillaBuff}.png）
  buffIconItem = new Map<BuffType, number>();

  private buildChestPanel() {
    this.chestPanel = el('div', 'sw-panel');
    this.chestPanel.style.cssText = 'position:fixed; left:50%; top:16%; transform:translateX(-50%); display:none;';
    this.chestTitle = el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Chest'));
    this.chestPanel.appendChild(this.chestTitle);
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10, var(--slot)); gap:5px;';
    // 按 40 槽上限构建（玩家储物 bank×4）；打开时按容器实际长度显隐（宝箱 10 / 储物 40）
    for (let i = 0; i < 40; i++) {
      grid.appendChild(this.makeSlotEl(i, 'chest'));
    }
    this.chestGrid = grid;
    this.chestPanel.appendChild(grid);
    // ---- 箱子三按钮（ChestUI.DrawButtons :182-260：LootAll/DepositAll/QuickStack） ----
    const btns = el('div');
    btns.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
    const mkBtn = (label: string, act: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.cssText = 'margin:0; padding:6px 10px; font-size:12px; flex:1;';
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        act();
      });
      btns.appendChild(b);
    };
    mkBtn(Lang.text('LegacyInterface.29'), () => this.chestLootAll());       // 全部取出
    mkBtn(Lang.text('LegacyInterface.30'), () => this.chestDepositAll());    // 存入全部（MoveCoins 钱币归并 + 10-49 全物品,1:1）
    mkBtn(Lang.text('LegacyInterface.31'), () => this.chestQuickStack());    // 快速堆叠（只堆箱内已有类型）
    this.chestPanel.appendChild(btns);
    this.root.appendChild(this.chestPanel);
  }

  /** Loot All（ChestUI.LootAll ChestUI.cs:389-412,DrawButtons 左键 :282）：箱内全部入包，
   *  装不下的留在箱里。★vault 允许面（2026-08-31 台账"多通道"清偿）：settings 按
   *  `player.chest > -1` 二选一（:391-392）——真箱=LootAllFromChest
   *  (CanGoIntoVoidVault=true),bank 面板（本仓 openChest.x<0 的 -2..-5 约定,
   *  :414-465 分支)=LootAllFromBank(default=false)。允许时余量经
   *  Player.depositIntoVoidVault（GetItem_VoidVault Player.cs:39710——questItem/3822
   *  拒收门 + DoCoins 主背包尾随都在内闭环）溢流灌虚空袋。
   *  -5 虚空袋面板另有收藏锁（ChestUI.cs:443-452 `!bank4.item[l].favorited` :447——
   *  唯一带此判定的容器分支,其他面板无）。Grab 音=有实际搬移才播（原版逐 GetItem
   *  事件播,本仓单次,同 DepositAll 登记式）。 */
  private chestLootAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    const spill = chestSettingsAllowsVault(chest.x)
      ? (itemId: number, stack: number): number => this.game.player.depositIntoVoidVault(itemId, stack)
      : undefined;
    const moved = lootAllFromContainer(inv,
      chest.items as Array<{ id: number; stack: number; prefix?: number; favorited?: boolean } | null>,
      spill,
      { skipFavorited: chest.x === -5,
        // 成就：Loot All 入包拾取通知（Player.GetItem 主背包/VoidVault 各填充支
        // NotifyItemPickup,Player.cs:39765-39882——按实际落袋数回传）
        onPickup: (internalId, _picked) => {
          const v = vidOf(internalId);
          if (v > 0) this.game.achievements.notifyItemPickup(v);
        } });
    if (moved) this.game.sfx.play('pickup');
    this.refreshAll();
  }

  /** Deposit All（ChestUI.DepositAll :536-…+MoveCoins :998-1203）1:1：
   *  ① MoveCoins：容器内钱币全清按面额记账（原面额档随槽记 array2,槽入 list2 找零池,
   *     空格同入 list2）→ 玩家全格钱币并入（j!=58,跳收藏,list=被清的原币格升序）→
   *     进位（100 小币=1 大币 ×3 档）→ 容器槽按【原面额档】回填（钱币 maxStack=100
   *     钳制;:35886-35910）→ 溢出面额沿原币格序回填（每槽一档取最大余档;:35911-35943）
   *     → 普通空格收剩余（:35944-35970）→ 玩家剩余零钱回被清的原币格（:35972-35992,
   *     有回填即 flag=false=不播 Grab,Main.cs:35993-35996）。
   *  ② 通用搬移：背包 10-49 降序（不含热键栏 0-9,:35559）跳收藏——可堆叠先并已有堆
   *     （CanStack=同型同词缀 Item.cs:49870-49877）余量入首个空格（:35779-35793）。
   *  原版无“跳过已有类型”/“钱币排除”过滤（2026-08-28 用户问“非钱币放入正常吗”——
   *  正常:猪猪存钱罐/保险箱=40 格通用容器,原版本就全物品放入）。 */
  private chestDepositAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    const items = chest.items;
    const denom = (id: number) => coinIndexOf(id);            // 0 铜..3 铂（=原版 71+num-1 档）
    const coinId = (d: number) => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[71 + d]];
    const coinMax = (d: number) => ITEM_DEFS[coinId(d)].maxStack ?? 100;
    let anythingMoved = false;                                // 有实际搬移 → 收尾播 Grab
    // ---- ① MoveCoins（:998-1203）----
    const tally = [0, 0, 0, 0];                               // array[0铜..3铂]
    const tier = new Array<number>(items.length).fill(-1);    // array2：槽原面额档/-1
    const fillable: number[] = [];                            // list2：可收找零槽
    const playerCoinSlots: number[] = [];                     // list：玩家被清的原币格（升序）
    let coinNetOut = false;                                   // flag
    for (let i = 0; i < items.length; i++) {
      const cs = items[i];
      if (!cs || cs.stack < 1) { fillable.push(i); items[i] = null; continue; }   // 空格入池（:35910-35914）
      const d = denom(cs.id);
      if (d >= 0) {                                           // 容器币清账（:35915-35942）
        tally[d] += cs.stack;
        tier[i] = d;
        fillable.push(i);
        items[i] = null;
      }
    }
    for (let j = 0; j < inv.slots.length; j++) {              // j != 58（:35748,本仓垃圾格独立字段）
      const s = inv.slots[j];
      if (!s || s.stack <= 0 || s.favorited) continue;
      const d = denom(s.id);
      if (d >= 0) {                                           // 玩家币并入（:35948-35977）
        coinNetOut = true;                                    // flag=true（:35771）
        tally[d] += s.stack;
        playerCoinSlots.push(j);                              // list.Add(j) + 清格
        inv.slots[j] = null;
        anythingMoved = true;
      }
    }
    for (let k = 0; k < 3; k++) {                             // 进位（:35978-35985）
      while (tally[k] >= 100) { tally[k] -= 100; tally[k + 1]++; }
    }
    // 回填一：槽原面额档（:35886-35910,list2.Remove 无条件）
    for (let l = 0; l < items.length; l++) {
      if (tier[l] < 0 || items[l]) continue;
      const d = tier[l];
      if (tally[d] > 0) {
        const stack = Math.min(tally[d], coinMax(d));
        items[l] = { id: coinId(d), stack };
        tally[d] -= stack;
        tier[l] = -1;
      }
      const fi = fillable.indexOf(l);
      if (fi >= 0) fillable.splice(fi, 1);
    }
    // 回填二：原币格收溢出面额（:35911-35943,每槽一档取最大余档）
    for (let m = 0; m < items.length; m++) {
      if (tier[m] < 0 || items[m]) continue;
      for (let d = 3; d >= 0; d--) {
        if (tally[d] > 0) {
          const stack = Math.min(tally[d], coinMax(d));
          items[m] = { id: coinId(d), stack };
          tally[d] -= stack;
          break;
        }
      }
      const fi = fillable.indexOf(m);
      if (fi >= 0) fillable.splice(fi, 1);
    }
    // 回填三：普通空格收剩余（:35944-35970）
    for (const l of fillable) {
      if (items[l]) continue;
      for (let d = 3; d >= 0; d--) {
        if (tally[d] > 0) {
          const stack = Math.min(tally[d], coinMax(d));
          items[l] = { id: coinId(d), stack };
          tally[d] -= stack;
          break;
        }
      }
    }
    // 玩家剩余零钱回被清的原币格（:35972-35992,回填即 flag=false）
    let num10 = 3;
    while (num10 >= 0 && playerCoinSlots.length > 0) {
      const slot = playerCoinSlots[0];
      if (tally[num10] > 0) {
        const stack = Math.min(tally[num10], coinMax(num10));
        inv.slots[slot] = { id: coinId(num10), stack };
        tally[num10] -= stack;
        coinNetOut = false;                                   // :35985 flag=false
        playerCoinSlots.shift();
      }
      if (tally[num10] === 0) num10--;
    }
    if (coinNetOut) this.game.sfx.play('pickup');             // :35993-35996（有净搬出才播 Grab）
    // ---- ② 通用搬移（:35983-35600 区段 for num=49..10 + IntoLocal/WorldChest）----
    let generalMoved = false;
    for (let num = 49; num >= 10; num--) {                    // 背包主体降序,不含热键栏（:35559）
      const cur = inv.slots[num];
      if (!cur || cur.favorited) continue;
      for (let i = 0; i < items.length; i++) {                // 合并遍（IntoLocal/WorldChest 共义）
        const cs = items[i];
        if (!cs || cs.stack >= (ITEM_DEFS[cs.id].maxStack ?? 1)) continue;
        if (cs.id !== cur.id || (cs.prefix ?? 0) !== (cur.prefix ?? 0)) continue;   // CanStack :49870
        const put = Math.min((ITEM_DEFS[cs.id].maxStack ?? 1) - cs.stack, cur.stack);
        cs.stack += put;
        cur.stack -= put;
        anythingMoved = true;
        generalMoved = true;
        if (cur.stack <= 0) { inv.slots[num] = null; break; }
      }
      if (inv.slots[num]) {                                   // 余量 → 首个空格（:35779-35793）
        const empty = items.findIndex((cs) => !cs);
        if (empty >= 0) { items[empty] = inv.slots[num]; inv.slots[num] = null; anythingMoved = true; generalMoved = true; }
      }
    }
    void generalMoved;
    if (anythingMoved) this.game.sfx.play('pickup');          // SoundID 7（Grab;原版逐事件播,本仓单次,登记）
    this.refreshAll();
  }

  /** Quick Stack（ChestUI.QuickStack :651-812，★SW-BJ46 1:1 重写抽纯函数）：只堆
   *  「箱内已存在类型」;收藏禁转移。算法体=QuickStacking.quickStackIntoContainer
   *  （段序/源窗/两遍语义/匹配域=itemMatchKey 注释全在彼处）;bank 面（chest.x≤-2）
   *  的 MoveCoins 前置与尾 flag 支音效也在彼处。音效单次收尾播=与 LootAll/
   *  DepositAll 同形登记形差（原版逐事件 PlaySound(7)）。 */
  private chestQuickStack(): void {
    const chest = this.openChest;
    if (!chest) return;
    const cue: { playSound7?: boolean } = {};
    const { movedChest } = quickStackIntoContainer(this.game.player.inv, chest.items, chest.x <= -2, cue);
    if (cue.playSound7) this.game.sfx.play('pickup');   // MoveCoins 尾 flag 支（ChestUI.cs:1196-1198）
    // 转移脉冲（ItemSorting :1513-1529：按类型分层 hue=(层+0.5)/层数 渐进彩虹）
    if (movedChest.size) {
      const order = new Map<number, number>();
      for (const id of movedChest.values()) {
        if (!order.has(id)) order.set(id, order.size);
      }
      const n = order.size;
      for (const [k, id] of movedChest) {
        this.setSlotGlow('chest', k, ((order.get(id) ?? 0) + 0.5) / n);
      }
    }
    this.game.sfx.play('pickup');
    this.refreshAll();
  }


  /** Restock 补货（ChestUI.Restock ChestUI.cs:867-992 1:1）：容器内无词缀件向
   *  背包同类未满堆补满；容器件清空后入空格（ammo 门）。背包扫描 57..0 降序、
   *  跳钱币(50-53)、stackable 门（!favorited ∥ !OnlyNeedOneInInventory）。
   *  flag=实际搬移 → SoundID 7(Grab)。 */
  chestRestock(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv.slots;
    const hashSet = new Set<number>();
    const list: number[] = [];      // 未满堆格
    const list2: number[] = [];     // 空格
    for (let num = 57; num >= 0; num--) {
      const it = inv[num];
      if ((num < 50 || num >= 54) && (!it || it.id < 71 || it.id > 74)) {
        if (!it || it.stack <= 0) {
          list2.push(num);
        } else if ((ITEM_DEFS[it.id]?.maxStack ?? 999) > 1 && (!it.favorited || !onlyNeedOneInInventory(it.id))) {
          hashSet.add(it.id);
          if (it.stack < (ITEM_DEFS[it.id]?.maxStack ?? 999)) list.push(num);
        }
      }
    }
    let flag = false;
    const items = chest.items as Array<{ id: number; stack: number; prefix?: number; favorited?: boolean } | null>;
    for (let i = 0; i < items.length; i++) {
      const ci = items[i];
      if (!ci || ci.stack < 1 || (ci.prefix ?? 0) !== 0 || !hashSet.has(ci.id)) continue;
      let emptied = false;
      for (let j = 0; j < list.length; j++) {
        const num2 = list[j];
        const target = inv[num2];
        if (!target || !canMergeStack(target, ci)) continue;
        if (num2 >= 54 && !ammoSlotAccepts(ci.id)) continue;
        let move = ci.stack;
        if ((ITEM_DEFS[target.id]?.maxStack ?? 999) - target.stack < move) {
          move = (ITEM_DEFS[target.id]?.maxStack ?? 999) - target.stack;
        }
        target.stack += move;
        ci.stack -= move;
        flag = true;
        if (target.stack === (ITEM_DEFS[target.id]?.maxStack ?? 999)) {
          list.splice(j, 1); j--;
        }
        if (ci.stack <= 0) {
          items[i] = null;
          emptied = true;
          break;
        }
      }
      // 原版 :966 flag2||list2 空||item.ammo==0 → continue(空格换入仅弹药件)
      if (emptied || list2.length <= 0 || !ammoSlotAccepts(ci.id)) continue;
      for (let k = 0; k < list2.length; k++) {
        const slotIdx = list2[k];
        if (slotIdx >= 54 && !canFillEmptyAmmoSlot(ci.id)) continue;
        const tmp = inv[slotIdx];
        inv[slotIdx] = ci;
        items[i] = tmp;
        list.push(slotIdx);
        list2.splice(k, 1);
        flag = true;
        break;
      }
    }
    if (flag) this.game.sfx.play('pickup');   // SoundID 7(Grab :988)
    this.refreshAll();
  }

  /** 排列物品（ChestUI.ButtonID 4 → ItemSorting.SortChest :ItemSorting.cs:1573-1597——
   *  ★SW-RB13c：弃「层内稳定序近似」旧实现,改接 FX29 精确引擎 sortContainerItems
   *  （52 层谓词+Validate 白名单+各层 SortingMethod 比较器+SetGlow 色带 chest=true）;
   *  SortChest 门=chest != -1（:1576）,无 HasLockedInventory 面;MemoryStamp net 同步
   *  （32）单人仓无对应,引擎面同形略。旧近似已由测试锁定的层间序漂移就此清偿。 */
  chestSortChest(): void {
    const chest = this.openChest;
    if (!chest) return;
    const items = chest.items as Array<{ id: number; stack: number; prefix?: number; favorited?: boolean } | null>;
    sortContainerItems(items, {
      onGlow: (slot, hue) => this.setSlotGlow('chest', slot, hue),   // SetGlow(…, chest != -1)（:1530）
    });
    this.refreshAll();
  }
  private chestTitle!: HTMLElement;
  private chestGrid!: HTMLElement;

  private openChestPanel(c: ChestData) {
    this.openChest = c;
    // ★SW-FX30 刀②:PipsUseGrid 清(Player.cs:33787 OpenChest → Main.PipsUseGrid=false
    // ——开箱关网格态,两布局同面;字段仅 vinv 布局消费)
    this.vinvPipsUseGrid = false;
    this.vinvSyncGridToggle();
    // 容器来源标识（原版 player.chest 约定）：-2 存钱罐 / -3 保险箱 / -4 守护者熔炉 / -5 虚空保险库。
    // 名称 = 原版物品官译（PiggyBank 87 / Safe 346 / DefendersForge 3813 / VoidVault 4076）
    const bankNames: Record<number, string> = {
      [-2]: Lang.itemName(87) ?? '存钱罐',
      [-3]: Lang.itemName(346) ?? '保险箱',
      [-4]: Lang.itemName(3813) ?? '守护者熔炉',
      [-5]: Lang.itemName(4076) ?? '虚空保险库',
    };
    // ★2026-09-08 vanilla 布局:宝箱条直接叠背包下方(vinvBuildChest),无独立 modal
    if (this._builtLayout === 'vanilla') {
      this.vinvReforgeOpen = false;   // 原版 :42277 chest≠-1 → InReforgeMenu=false
      this.openInventory(true);
      this.refreshAll();
      return;
    }
    this.chestTitle.textContent = bankNames[c.x] ?? Lang.text('Mods.SandboxWorld.UI.Chest');
    // 按容器实际槽位数显隐（宝箱 10 / 玩家储物 40）
    const n = Math.min(40, c.items.length);
    for (let i = 0; i < 40; i++) {
      const s = this.chestGrid.children[i] as HTMLElement | undefined;
      if (s) s.style.display = i < n ? '' : 'none';
    }
    this.chestPanel.style.display = 'block';
    this.openInventory(true);   // force：背包已开着时右键开箱不解背包（2026-09-02 解锁后此路可达）
    this.refreshAll();
  }

  closeChest() {
    this.openChest = null;
    if (this.chestPanel) this.chestPanel.style.display = 'none';
    this.refreshAll();   // 堆叠钮等随开箱门（chest == -1）复显
  }

  // ============ 槽底贴图 / Loadout 染色 / 转移脉冲 / 金币跳字 ============

  /** LoadoutSlotColors（ItemSlot.cs:322-340）——行=loadout，列=context 组
   *  （TryGetSlotColor :2567：8,10 装备→0 / 9,11 时装→1 / 12 染料→2） */
  private static readonly LOADOUT_COLORS: ReadonlyArray<readonly [string, string, string]> = [
    ['rgb(50,106,64)', 'rgb(46,106,98)', 'rgb(45,85,105)'],
    ['rgb(35,106,126)', 'rgb(50,89,140)', 'rgb(57,70,128)'],
    ['rgb(122,63,83)', 'rgb(104,46,85)', 'rgb(84,37,87)'],
  ];

  /** 槽底贴图按 context（ItemSlot.Draw :1983-2142 逐 case：
   *  装备/时装/染料=13 / 杂项装备=3 / 杂项染料=12 / 箱=5 / 其余=默认 Back；
   *  收藏=10 覆盖（:1987，除 13/21/22/14/35 等——快捷栏不在本路径） */
  private paintSlotChrome(slotEl: HTMLElement, where: SlotWhere, i: number): void {
    // inv 族（背包网格/钱币/弹药）用 Back20 = 热键栏未选中同款贴图（2026-09-02
    // 用户要求背包格渲染对齐热键栏;网格槽另有 ×0.75 缩放+0.575 透明度,见
    // .sw-invgrid CSS）
    let tex = where === 'inv' ? 'Inventory_Back20' : 'Inventory_Back';
    let tint: string | null = null;
    if (where === 'armor' || where === 'dye') {
      tex = 'Inventory_Back13';
      const lo = UI.LOADOUT_COLORS[this.game.player.inv.currentLoadout] ?? UI.LOADOUT_COLORS[0];
      tint = where === 'dye' ? lo[2] : i <= 9 ? lo[0] : lo[1];
    } else if (where === 'misc') tex = 'Inventory_Back3';
    else if (where === 'miscDye') tex = 'Inventory_Back12';
    else if (where === 'chest') tex = 'Inventory_Back5';
    const content = this.slotContent(where, i);
    if (content?.favorited) tex = 'Inventory_Back10';
    // 权威重绘：清掉残留的 glow 色层（面板 display:none 期间动画被 cancel 而非
    // end——overlay 会以基础样式（不透明）卡死在槽上，重开面板即一排色块）
    slotEl.querySelector('.sw-glow-overlay')?.remove();
    // 槽底贴图走 --slot-bgimg（::after 纹理层消费,2026-09-02）——物品/数字不随
    // 格子半透明（半透只在 ::after 的 opacity 上）
    slotEl.style.setProperty('--slot-bgimg', `url(sprites/vanilla/${tex}.png)`);
    if (tint) slotEl.style.setProperty('--slot-tint', tint);
    else slotEl.style.removeProperty('--slot-tint');
    // ★SW-FX29：glow 活态未到期 → 重绘后复铺（原版时间态逐帧驱动;仓内重绘
    // 模型下由状态承载——见 applySlotGlow 注）
    if (this.slotGlowState.has(`${where}:${i}`)) this.applySlotGlow(where, i);
  }

  /** LoadoutShare 槽面（ItemSlot.Draw :2454-2473 + :2726-2746；R4-15 补绘——曾缺
   *  =用户报"切配装后对应格子还是空的"：共享件其实仍在生效（GetEffectiveArmor 填
   *  空槽），只是槽面无任何指示，导致往空槽再叠一套装备）。仅 armor/dye 五类格
   *  （canLoadoutShareAt[8-12]；misc 族原版无此语义）：
   *  1) 槽空但共享件在场（GetSharedLoadoutItem :2837 → GetEffectiveArmor/Dye）——
   *     物品图标 60% 淡显（itemFade*=0.6）+ 来源配装色角标 Extra[313+from] α0.7，
   *     类型占位图抑制（num15=-1）；
   *  2) 槽内件被收藏（本套=共享源）→ 当前配装色角标 Extra[310+cur] α0.7。
   *  角标贴图 = 52×52 左上角小色标（310/313 绿 311/314 蓝 312/315 紫，字节级
   *  两两同图）。悬停 tooltip 代打见 showTooltipFor（MouseHover :3174-3178） */
  private paintLoadoutShare(slotEl: HTMLElement, where: 'armor' | 'dye', i: number): void {
    const inv = this.game.player.inv;
    const content = this.slotContent(where, i);
    const from = content ? null : inv.effectiveSharedFrom(i, where === 'dye');
    const shared = from !== null
      ? (where === 'dye' ? inv.loadouts[from].dye[i] : inv.loadouts[from].armor[i])
      : null;
    const ownShared = !!content?.favorited;
    const g = slotEl.querySelector('.sw-share-ghost') as HTMLElement | null;
    const f = slotEl.querySelector('.sw-share-frame') as HTMLElement | null;
    if (!shared && !ownShared) {
      g?.remove();
      f?.remove();
      return;
    }
    let ghost = g;
    if (!ghost) {
      ghost = el('div', 'sw-share-ghost');
      ghost.style.cssText = 'position:absolute; inset:15.4%; width:69.2%; height:69.2%;'
        + 'background:center/contain no-repeat; image-rendering:pixelated; pointer-events:none; opacity:0.6;';
      slotEl.appendChild(ghost);
    }
    ghost.style.display = shared ? 'block' : 'none';
    if (shared) {
      const url = iconUrl(this.game, shared.id);
      if (ghost.dataset.src !== url) { ghost.style.backgroundImage = `url(${url})`; ghost.dataset.src = url; }
      const ph = slotEl.querySelector('.sw-slot-ghost') as HTMLElement | null;
      if (ph) ph.style.display = 'none';   // num15=-1：共享幽灵顶掉类型占位图
    }
    let frame = f;
    if (!frame) {
      frame = el('div', 'sw-share-frame');
      frame.style.cssText = 'position:absolute; inset:0; background-position:0 0; background-size:100% 100%;'
        + 'image-rendering:pixelated; pointer-events:none; opacity:0.7;';
      slotEl.appendChild(frame);
    }
    frame.style.display = 'block';
    const frameUrl = `url(sprites/vanilla/Extra_${shared ? 313 + from! : 310 + inv.currentLoadout}.png)`;
    if (frame.dataset.src !== frameUrl) { frame.style.backgroundImage = frameUrl; frame.dataset.src = frameUrl; }
  }

  /** 槽位 glow 活动态（★SW-FX29：ItemSlot.inventoryGlowTime/Hue :270-276 的仓内
   *  时间态——SetGlow 写态 300t(5s) 渐隐;呈现面 paintSlotChrome 重绘时按活态重铺。
   *  旧一次性 DOM overlay 会被 refreshAll 的权威重绘当场清掉（chestQuickStack
   *  :5001 紧跟 refreshAll 同病）——改状态承载,重绘后 applySlotGlow 复铺） */
  private slotGlowState = new Map<string, { hue: number; until: number }>();

  /** 物品转移 hue 脉冲（ItemSlot.SetGlow :428 + :2144-2152：贴图换 Back13 +
   *  hslToRgb(hue,1,0.5) 色层 (time/300)²/2 衰减 5s；CSS 动画近似二次曲线） */
  setSlotGlow(where: SlotWhere, i: number, hue: number): void {
    this.slotGlowState.set(`${where}:${i}`, { hue, until: performance.now() + 5000 });
    this.applySlotGlow(where, i);
  }

  /** glow 活态复铺（ItemSlot.Draw :2289-2296：context 0/2/3/4/32 且 !favorited
   *  && 非空——Back13 贴图 + 色层;animationDuration=余量,到期 animationend
   *  清态并归位 chrome 重绘） */
  private applySlotGlow(where: SlotWhere, i: number): void {
    const key = `${where}:${i}`;
    const st = this.slotGlowState.get(key);
    if (!st) return;
    const slotEl = this.slotEl(i, where);
    if (!slotEl || !slotEl.isConnected) return;
    const remain = st.until - performance.now();
    if (remain <= 0) {
      this.slotGlowState.delete(key);
      return;
    }
    slotEl.querySelector('.sw-glow-overlay')?.remove();
    slotEl.style.backgroundImage = 'url(sprites/vanilla/Inventory_Back13.png)';
    const ov = el('div', 'sw-glow-overlay');
    ov.style.setProperty('--glow', `hsl(${(st.hue * 360).toFixed(1)} 100% 50%)`);
    ov.style.animationDuration = `${Math.ceil(remain)}ms`;
    ov.addEventListener('animationend', () => {
      this.slotGlowState.delete(key);
      if (this.game) this.paintSlotChrome(slotEl, where, i);
    });
    slotEl.appendChild(ov);
  }

  /** CoinSlot 动画表（CoinSlot.cs :228-249：Jump 25 帧×JumpScale10 / Text 17 帧 / 自旋 8 帧） */
  private static readonly COIN_JUMP = [0, .23748, .43408, .59366, .72007, .81717, .88881, .93885, .97115, .98955,
    .99793, 1, 1, 1, .99793, .98955, .97115, .93885, .88881, .81717, .72007, .59366, .43408, .23748, 0];
  private static readonly COIN_TEXT = [1, 1.0107, 1.0391, 1.0791, 1.125, 1.1709, 1.2109, 1.2393, 1.25, 1.2393,
    1.2109, 1.1709, 1.125, 1.0791, 1.0391, 1.0107, 1];
  private prevCoinStack = [-1, -1, -1, -1];
  private coinBusy = [false, false, false, false];

  /** 金币跳字（CoinSlot.UpdateState：堆叠变化 → 跳 25 帧 + 计数弹跳缩放 + 自旋帧） */
  private coinJump(k: number): void {
    if (this.coinBusy[k]) return;
    const slotEl = this.slotEl(COIN_START + k, 'inv');
    if (!slotEl) return;
    this.coinBusy[k] = true;
    const img = slotEl.querySelector<HTMLImageElement>('img');
    const cnt = slotEl.querySelector<HTMLElement>('.cnt');
    // 自旋层（CoinSlot.DrawItemCoin：Coin_k 8 帧竖条，跳帧窗 9-13 推进）
    let spin: HTMLElement | null = null;
    let t = 0;
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      while (now - last >= 16.7 && t < 25) {
        last += 16.7;
        t++;
        const jump = UI.COIN_JUMP[t] ?? 0;
        if (img) img.style.transform = `translateY(${(-jump * 10).toFixed(1)}px)`;
        if (cnt) cnt.style.transform = `scale(${UI.COIN_TEXT[Math.min(t, 16)]})`;
        if (t >= 9 && t <= 13) {
          if (!spin) {
            spin = el('div');
            spin.style.cssText = 'position:absolute; inset:4px; pointer-events:none; image-rendering:pixelated;'
              + `background:url(sprites/vanilla/Coin_${k}.png); background-size:100% 800%;`;
            slotEl.appendChild(spin);
            img && (img.style.visibility = 'hidden');
          }
          spin.style.backgroundPositionY = `${(Math.floor((t - 9) * 1.4) % 7) * 12.5}%`;
        } else if (spin) {
          spin.remove(); spin = null;
          if (img) img.style.visibility = '';
        }
      }
      if (t < 25) { requestAnimationFrame(step); return; }
      if (img) { img.style.transform = ''; img.style.visibility = ''; }
      if (cnt) cnt.style.transform = '';
      spin?.remove();
      this.coinBusy[k] = false;
    };
    requestAnimationFrame(step);
  }

  // ============ 刷新 ============

  /** 手机紧凑快捷栏布局帧(mobile-adaptation-plan 模块③;D0/T1=null=原版几何):
   *  cols=每格行数排列(T3 两行五列 / T2 单行十格);q=统一格 scale——紧凑档取消
   *  选中尺寸跳变(C 方案定案,选中态由 Back14/20 贴图+亮度区分),步进均匀。 */
  private hotbarCompact(): { cols: number; q: number } | null {
    // 2026-08-29 官方截图对齐:横屏(含手机)hotbar 保持原版 52px 一行不缩
    // (844 宽放得下 ~490px 行,官方平板/手机横屏同样原样);仅竖屏紧凑化
    if (hudTier() === 't3') return { cols: 5, q: 0.78 };   // 竖屏两行五列,视觉≈41px 格
    return null;
  }

  /** 热键锁穿透态（SW-FX10 债⑪;Main.cs:44353-44359）：关包且 hbLocked 时给 10 个
   *  快捷栏格挂 data-sw-world-passthrough——点击透传为世界输入（挖/放/使用照常）,
   *  锁未开或开包态摘除。选中门在 mouseup 臂（:1913 区）。随 refreshHotbar 全路径跑 */
  private paintHotbarLockState(): void {
    const closed = !!this.invPanel && this.invPanel.style.display !== 'block';
    const on = closed && !!this.game?.player.hbLocked;
    for (let i = 0; i < 10; i++) {
      const s = this.slotEl(i, 'inv');
      if (!s) continue;
      if (on) s.dataset.swWorldPassthrough = '1';
      else if (s.dataset.swWorldPassthrough) delete s.dataset.swWorldPassthrough;
    }
  }

  refreshHotbar() {
    if (!this.game) return;
    this.paintHotbarLockState();
    // ★2026-09-07 刀 2 守卫:vanilla 布局开包 = 原版 GUIHotbarDrawInner 整体早退
    // (Main.cs:44324 `if (playerInventory || ...) return;`)——热键栏 DOM 隐藏,
    // 第 0 行由 .sw-vinv 网格承担(paintVanillaInvSlots);关包态落下方 D0 画法
    // (已 1:1 原版关包几何),此处只负责 display 还原
    if (this._builtLayout === 'vanilla') {
      const vinvOpen = this.invPanel?.style.display === 'block';
      if (this.hotbarEl) this.hotbarEl.style.display = vinvOpen ? 'none' : '';
      if (this.hotbarNameEl) this.hotbarNameEl.style.display = vinvOpen ? 'none' : '';
      if (this.manualBtn) this.manualBtn.style.display = vinvOpen ? 'none' : '';
      if (vinvOpen) return;
    }
    const inv = this.game.player.inv;
    // 原版布局（Main.cs:43017-43060）：x 从 20 起步进 ⌊52×scale⌋+4；
    // y = 20 + 22×(1-scale)（选中 20，未选中 25→CSS 视觉再随 scale 收缩）；
    // 未选中 alpha = 200×187/255 ≈ 147（Back20 半透明），选中 255（Back14）
    //
    // 手机紧凑档(mobile-adaptation-plan P0):几何单一来源=本函数的 hotbarCompact()
    // 帧,safe-area 由 HudScale.safeInsets 并入格子 inline 坐标(positionInvPanel 扫
    // inline left/top=屏幕坐标的既有语义零适配)。D0 分支逐值还原原版公式。
    const compact = this.hotbarCompact();
    // 紧凑档挂 class(触控热区扩边 CSS 钩子;D0 移除=无伪元素,桌面 DOM 零新增)
    this.hotbarEl?.classList.toggle('compact', !!compact);
    if (compact) {
      const step = Math.floor(52 * compact.q) + 4;   // 屏幕像素步进(选中差取消→恒定)
      const rowH = Math.floor(52 * compact.q) + 12;
      const ox = safeInsets.left + 6;
      const oy = safeInsets.top + 8;
      for (let i = 0; i < 10; i++) {
        const slotEl = this.slotEl(i, 'inv');
        if (!slotEl) continue;
        const col = i % compact.cols, row = (i / compact.cols) | 0;
        this.paintSlot(slotEl, inv.slots[i]);
        slotEl.style.left = `${ox + col * step}px`;
        slotEl.style.top = `${oy + row * rowH}px`;
        slotEl.style.width = slotEl.style.height = '52px';
        slotEl.style.transform = `scale(${compact.q})`;
        slotEl.style.transformOrigin = 'top left';
        slotEl.style.setProperty('--slot-alpha', i === inv.selected ? '1' : '0.62');
        slotEl.style.setProperty('--slot-bgimg', `url(sprites/vanilla/Inventory_Back${i === inv.selected ? 14 : 20}.png)`);
        slotEl.style.boxShadow = '';
        if (!slotEl.querySelector('.sw-slot-num')) {
          const num = el('span', 'sw-slot-num', i === 9 ? '0' : String(i + 1));
          slotEl.appendChild(num);
        }
      }
      const rows = Math.ceil(10 / compact.cols);
      // 选中名:行尾下方居中(T3 两行/T2 单行各自锚点)
      this.hotbarNameEl.style.left = `${Math.round(ox + (compact.cols * step - step + 44) / 2)}px`;
      this.hotbarNameEl.style.top = `${oy + rows * rowH + 2}px`;
      this.hotbarNameEl.style.fontSize = '11px';
    } else {
      let x = 20;
      // ★背包打开时热键栏整行均匀（2026-09-02 用户要求：不高亮/不放大当前项——
      //   原版 playerInventory 开启时热键行不画选中放大与 Back14 高亮）
      const invOpen = this.invPanel?.style.display === 'block';
      for (let i = 0; i < 10; i++) {
        const slotEl = this.slotEl(i, 'inv');
        if (!slotEl) continue;
        const sel = i === inv.selected && !invOpen;
        const scale = sel ? 1 : 0.75;
        this.paintSlot(slotEl, inv.slots[i]);
        slotEl.style.left = `${x}px`;
        slotEl.style.top = `${Math.trunc(20 + 22 * (1 - scale))}px`;
        slotEl.style.width = slotEl.style.height = '52px';
        slotEl.style.transform = `scale(${scale})`;
        slotEl.style.transformOrigin = 'top left';
        slotEl.style.setProperty('--slot-alpha', sel ? '1' : '0.575');
        slotEl.style.setProperty('--slot-bgimg', `url(sprites/vanilla/Inventory_Back${sel ? 14 : 20}.png)`);
        slotEl.style.boxShadow = ''; // 原版快捷栏不画收藏高亮（ItemSlot :1987 context!=13）
        if (!slotEl.querySelector('.sw-slot-num')) {
          const num = el('span', 'sw-slot-num', i === 9 ? '0' : String(i + 1));
          slotEl.appendChild(num);
        }
        x += Math.floor(52 * scale) + 4;
      }
      // D0 显式回写防手机会话残留(hotbarName CSS 锚 left236/top0 同值)
      this.hotbarNameEl.style.left = '236px';
      this.hotbarNameEl.style.top = '0px';
      this.hotbarNameEl.style.fontSize = '';
    }
    // 说明按钮:紧凑档让位(467px 定位压 T2 行尾/T3 名区;桌面原位)
    if (this.manualBtn) this.manualBtn.style.display = compact ? 'none' : '';
    // 选中物品名（:43003-43009：居中 x=236、mouseTextColor 脉动；空手回退 inter[37]）。
    // 走 itemNameByKey 全链（vi_ key 前缀→官方 l10n→id-maps 兜底→place_v_ 方块名→
    // Mods 自有键→def.name）：vi_ def 的 vid 字段不落、name 恒 ''（items.ts 自动注册
    // 循环不写 vid），裸取 def.vid 会级联落空 → 恒显 inter(37)"物品"（退役批回归）
    // ★SW-AZ1 2026-09-06：经 heldItem() 取手持（光标持物伪选中时=镜像槽 58——
    // vanilla 该行读 HeldItem Player.cs:3835-3837,光标捏物时显示光标物名）
    const held = inv.heldItem();
    const name = held ? Lang.itemNameByKey(ITEM_DEFS[held.id]?.key ?? '') : null;
    this.hotbarNameEl.textContent = name || Lang.inter(37);
  }

  /** 背包网格几何=热键栏实测值（2026-09-02 用户复报格距不一致）：读热键栏【未选中】
   *  相邻两槽的实测节距/视觉宽（getBoundingClientRect 已含缩放/档位/浏览器缩放；
   *  选中槽 scale 1.0 步进 56 会污染节距,故取一对连续未选中槽），写回网格轨道与
   *  间距——任何环境下两者逐像素一致 */
  private syncInvGridGeometry(): void {
    const grid = this.invGridEl;
    if (!grid) return;
    const sel = this.game?.player.inv.selected ?? -1;
    let a: HTMLElement | null = null, b: HTMLElement | null = null;
    for (let i = 0; i < 9; i++) {
      if (i === sel || i + 1 === sel) continue;
      a = this.slotEl(i, 'inv'); b = this.slotEl(i + 1, 'inv');
      if (a && b) break;
      a = b = null;
    }
    if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const pitch = rb.left - ra.left;
    const cell = ra.width;
    if (!(pitch > cell) || !(cell > 8)) return;   // 过渡期/异常布局不写
    const gap = Math.max(0, pitch - cell);
    grid.style.gridTemplateColumns = `repeat(10, ${cell}px)`;
    grid.style.gridAutoRows = `${cell}px`;
    grid.style.columnGap = grid.style.rowGap = `${gap}px`;
  }

  /** 触屏长按槽位 tooltip(mobile-adaptation-plan 模块④):显示后挂一次性
   *  document 触摸关闭(桌面 mouseleave 已有;触屏无 leave 语义) */
  private showSlotHintTouch(i: number, where: string, anchor?: HTMLElement): void {
    this.showTooltipFor(i, where as never, anchor ? { anchor } : undefined);
    document.addEventListener('touchstart', () => {
      this.tooltip.style.display = 'none';
      cancelAnimationFrame(this.tooltipPulseRaf);
    }, { once: true, capture: true });
  }

  private paintSlot(slotEl: HTMLElement, content: { id: number; stack: number; favorited?: boolean; prefix?: number } | null) {
    // ★元素复用(2026-08-14 trace④:80 万次 LazyPixelRef 恒定流根因):此前每次
    // 刷新删旧 <img> 建新——新元素即使 src 相同也要重新解码,50-80 槽 × iconUiDirty
    // 风暴期的每 30t 刷新 = 每帧 50+ 次解码任务。复用元素且 src 不变不动 = 零解码
    let img = slotEl.querySelector('img') as HTMLImageElement | null;
    const oldCnt = slotEl.querySelector('.cnt');
    if (!content) { if (img) img.remove(); if (oldCnt) oldCnt.remove(); }
    // 类型幽灵图只在空槽显示（:2312 `item.type <= 0 || stack <= 0` 门）
    const ghost = slotEl.querySelector('.sw-slot-ghost');
    if (ghost) (ghost as HTMLElement).style.display = content ? 'none' : 'block';
    if (content) {
      const url = iconUrl(this.game, content.id);
      if (!img) {
        img = el('img') as HTMLImageElement;
        img.draggable = false;
        slotEl.appendChild(img);
      }
      if (img.getAttribute('src') !== url) img.src = url;  // 不变不动:免重解码/重光栅
      if (content.stack > 1) {
        if (oldCnt) oldCnt.textContent = String(content.stack);
        else slotEl.appendChild(el('span', 'cnt', String(content.stack)));
      } else if (oldCnt) oldCnt.remove();
    }
    // 收藏星标（原版 Inventory_Back10 金边贴图——ItemSlot :1966-1985 favorited 分支）：
    // 贴图由 paintSlotChrome 的 --slot-bgimg 统一绘制（favorited → Back10），此处
    // 不再直写 backgroundImage——2026-09-02 槽底迁 ::after 后直写会绕过半透层
    slotEl.title = content?.favorited ? Lang.text('Mods.SandboxWorld.Toast.Favorited') : '';
  }

  /** rAF 合并版 refreshAll(2026-08-13 泄露 review):滚轮/拾取/背包变化等
   *  事件风暴下每帧至多全量重建一次(此前合成列表滚轮每事件直调=与
   *  BestiaryPanel 滚轮崩溃同根因)。31 处调用点零改动透传 */
  private _refreshAllQueued = false;
  refreshAll() {
    if (this._refreshAllQueued) return;
    this._refreshAllQueued = true;
    requestAnimationFrame(() => {
      this._refreshAllQueued = false;
      this.refreshAllNow();
    });
  }

  /** 刷新的 Promise 版(探针/测试同步等待用,生产路径零消费;绕过 rAF 合并去重,
   *  连调两次会全量刷两遍——仅测试语义) */
  refreshAllAsync(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => { this.refreshAllNow(); resolve(); });
    });
  }

  private refreshAllNow() {
    if (!this.game) return;
    this.refreshEquipExtras();
    // 快捷栏最先刷（数字键/选槽视觉的最小闭环）——后续任一段抛错也不再吞掉
    // 快捷栏刷新（2026-08-18 用户报"数字键失效"：advisor 段异常曾把 rAF 回调
    // 整体炸掉，selected 已变而画面不动）
    this.refreshHotbar();
    this.syncInvGridGeometry();   // 网格节距/格宽=热键栏实测（2026-09-02）
    this.moveGhost();
    this.paintTrash();
    this.paintAccEyes();
    this.refreshPvpButtons();
    try {
      this.achAdvisorEl?.update();
    } catch (e) {
      this.achAdvisorEl?.remove();
      this.achAdvisorEl = null;   // 坏 advisor 自摘（成就顾问是 QoL 件，不拖垮背包刷新）
      console.warn('[UI] achAdvisor update failed, detached:', e);
    }
    // 堆叠至附近宝箱双钮（Main.cs:41276 chest == -1 && npcShop == 0 门——开箱/商店
    // 不显示；2026-09-02 拆双钮后帧固定：quick=0/1、smart=2/3（悬停态由钮自身
    // mouseenter/leave 切,此处只管显隐+title）
    for (const [b, mode] of [[this.quickStackBtn, 'quick'], [this.qsSmartBtn, 'smart']] as const) {
      if (!b) continue;
      b.style.display = this.openChest ? 'none' : '';
      // title 不走 GameUI.* 官译（带「右键点击切换堆叠方式」提示,双钮拆分后无此交互）
      b.title = mode === 'smart' ? '智能堆叠至附近宝箱' : '快速堆叠至附近宝箱';
    }
    // 多人玩家列表钮：仅联机态显示（单机无名单可列）
    if (this.playerListBtn) this.playerListBtn.style.display = this.game.net?.active ? '' : 'none';
    const inv = this.game.player.inv;
    for (let i = 10; i < INV_SIZE; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (slotEl) {
        this.paintSlot(slotEl, inv.slots[i]);
        this.paintSlotChrome(slotEl, 'inv', i);
      }
    }
    // ★2026-09-07 刀 2 守卫:vanilla 布局补绘——网格第 0 行(0-9,全局 slotEl 会
    // 首匹配到隐藏热键栏)+ inv 族槽底覆写(原版开包=Inventory_Back 非经典 Back20)
    if (this._builtLayout === 'vanilla') this.paintVanillaInvSlots();
    // 金币跳字（CoinSlot：堆叠变化触发且槽内有币——原版仅钱币族动画，空槽不跳）
    for (let k = 0; k < 4; k++) {
      const cur = inv.slots[COIN_START + k];
      const st = cur?.stack ?? 0;
      if (st !== this.prevCoinStack[k]) {
        this.prevCoinStack[k] = st;
        if (cur) this.coinJump(k);
      }
    }
    // 装备列全量重绘（armor[20] / dye[10] / miscEquips[5] / miscDyes[5]）
    for (const where of ['armor', 'dye', 'misc', 'miscDye'] as const) {
      const arr = this.equipArray(where);
      for (let i = 0; i < arr.length; i++) {
        const slotEl = this.slotEl(i, where);
        if (slotEl) {
          this.paintSlot(slotEl, arr[i]);
          this.paintSlotChrome(slotEl, where, i);
          if (where === 'armor' || where === 'dye') this.paintLoadoutShare(slotEl, where, i);
        }
      }
    }
    // Loadout 按钮（Extra[259] 图集：选中=列1；悬停态由 mouseenter/leave 管）
    this.loadoutBtns.forEach((b, k) => {
      const cur = k === inv.currentLoadout;
      b.style.backgroundPosition = `${(cur ? 1 : 0) * 50}% ${k * 50}%`;
    });
    this.refreshBuffs();
    if (this.openChest) {
      const n = Math.min(40, this.openChest.items.length);
      for (let i = 0; i < n; i++) {
        const slotEl = this.slotEl(i, 'chest');
        if (slotEl) {
          this.paintSlot(slotEl, this.openChest.items[i]);
          this.paintSlotChrome(slotEl, 'chest', i);
        }
      }
    }
    // ★2026-09-09 刀 13 守卫(共享区第 8 处):宝箱槽贴图按容器
    // (ItemSlot.cs :2200 区:ctx3 世界箱=Back5;ctx4 银行/ctx32 虚空=Back2 黄;
    //  收藏=Back10 paintSlotChrome 已设;经典 chestPanel 无此分=既存偏差)
    if (this._builtLayout === 'vanilla' && this.openChest) {
      const isVoid = this.openChest.x === -5;
      const backTex = this.openChest.x < 0 ? 'Inventory_Back2' : 'Inventory_Back5';
      for (let i = 0; i < 40; i++) {
        const s = this.vinvSlots.get(`chest:${i}`);
        if (!s) continue;
        const fav = !!this.openChest.items[i]?.favorited;
        // 收藏:ctx32 虚空=Back19(ItemSlot.cs :2131-2134)/其余=Back10(:2129-2131)
        const want = fav ? (isVoid ? 'Inventory_Back19' : 'Inventory_Back10') : backTex;
        const cur = s.style.getPropertyValue('--slot-bgimg');
        if (!cur.includes(want)) {
          s.style.setProperty('--slot-bgimg', `url(sprites/vanilla/${want}.png)`);
        }
      }
    }
    this.refreshCrafting();
  }

  private refreshCrafting() {
    const game = this.game;
    if (!game || !this.craftListEl) return;
    const stations = game.stationsNearby();
    // 防御计数器随装备列迁右下角坞（2026-09-02）——root 级查（面板/坞都覆盖）
    const defEl = this.root.querySelector('[data-role="defense"]') as HTMLElement | null;
    if (defEl) {
      // 防御计数器刷新（DrawDefenseCounter :41557）：盾帧 = 难度列(0/1/2),
      // 专家/大师叠辉光行(静态 α0.45 近似原版脉动;大师红绿脉冲未做,偏差记录)。
      // 盾图 = img dataURL 按 (难度列,是否带辉光) 缓存——不再持独立 canvas 后备
      const p = this.game.player;
      const w = this.game.world;
      const col = w.isMaster ? 2 : w.isExpert ? 1 : 0;
      const imgEl = defEl.querySelector('img');
      const shield = this.game.atlas?.vmisc('vanilla/Extra_58.png');
      if (imgEl && shield) {
        const glow = col > 0 && p.defense > 0;
        const key = `${col}|${glow ? 1 : 0}`;
        let url = DEF_SHIELD_URLS.get(key);
        const sc = DEF_SHIELD_SCRATCH;
        if (!url && sc) {
          const sx2 = sc.getContext('2d', { willReadFrequently: true })!;  // toDataURL 烘焙,SHM 后备
          sc.width = 52; sc.height = 48;
          sx2.clearRect(0, 0, 52, 48);
          sx2.drawImage(shield.img, shield.sx + col * 52, shield.sy, 52, 48, 0, 0, 52, 48);
          if (glow) {
            sx2.globalAlpha = 0.45;
            sx2.drawImage(shield.img, shield.sx + col * 52, shield.sy + 48, 52, 48, 0, 0, 52, 48);
            sx2.globalAlpha = 1;
          }
          url = sc.toDataURL('image/png');
          DEF_SHIELD_URLS.set(key, url);
        }
        if (url && imgEl.getAttribute('src') !== url) imgEl.src = url;
      }
      // ★SW-BI1 2026-09-06：去非空断言改空守卫——本函数经 refreshAll 的 rAF 合并
      //  通道在背包事件风暴期逐帧跑，defEl 内缺 <span>（旧档/坞迁移期标记不齐）
      //  曾以 `Cannot set properties of null (setting 'textContent')` 每帧刷屏
      //  （SW-BI1 报告 49 连发同形），守卫后静默跳过等下轮重建补齐。
      const defNumEl = defEl.querySelector('span');
      if (defNumEl) defNumEl.textContent = String(p.defense);
    }
    const stationsEl = this.invPanel.querySelector('[data-role="stations"]') as HTMLElement;
    if (stationsEl) {
      const stName: Record<string, string> = { hand: Lang.text('Mods.SandboxWorld.UI.StationHand'), workbench: '🛠 ' + Lang.text('ItemName.WorkBench'), furnace: '🔥 ' + Lang.text('ItemName.Furnace'), anvil: '⚒ ' + Lang.text('ItemName.IronAnvil') };
      stationsEl.textContent = Lang.text('Mods.SandboxWorld.UI.CraftStations', [...stations].map((s) => stName[s] ?? s).join('、'));
    }
    // 自制 RECIPES 表已随本地物品退役整体移除——合成列表只留原版配方段
    // （3309 条，Recipe.UpdateRecipeList 主干：环境+材料双门）
    this.refreshVanillaCrafting();
  }

  /** 合成列表选中配方（材料格数据源；★仅点击行设置——2026-08-25 用户定案：
   *  滚动只滚列表不换选中，材料格/详情不随滚动切换。-1=未选中（初始/搜索
   *  重置）→ 材料格空,不默认显示第一个配方(2026-08-25 用户定案) */
  private craftFocus = -1;
  /** 当前可用配方（行内容与材料格的共用数据源;met=「仅用背包材料即可合成」的
   *  排序层标记——SW-AV2 起与置灰/可点解耦,置灰只看 count<=0;签名比对跳过无关
   *  重建——r 引用静态 VANILLA_RECIPES 恒稳） */
  private craftAvailRef: Array<{ r: import('../data/vanillaRecipes').VanillaRecipeLike; count: number; met: boolean }> = [];
  private static readonly CRAFT_ROW_H = 30;   // border-box: 22 贴图+3×2 padding+2 边框=30;容器高度按 30 整除取整(末行半裁观感即消失)
  /** 悬停预览行（材料格显示源；-1=无）。★只动材料格不动列表——列表滚动
   *  已交还浏览器原生溢出容器（2026-09-01 定案），hover 不参与任何滚动计算 */
  private hoverFocus = -1;
  /** Modern 合成网格：搜索栏 + 焦点配方材料格（1.4.5 CraftingGrid 语义） */
  private craftSearchEl: HTMLInputElement | null = null;
  private craftGridEl: HTMLElement | null = null;
  /** 材料格已存（原版 vid → 数量；焦点配方切换/关面板时归还背包） */
  private craftGrid = new Map<number, number>();
  private craftGridRecipe: VanillaRecipeLike | null = null;
  /** 原版配方列表（数据驱动 1457 全量）。
   *  ★2026-09-01 滚动架构定案（用户：自算滚动是负优化,回归浏览器原生滚动）：
   *  容器=overflow-y:auto 溢出容器,行=静态流式子元素整表铺陈,滚轮/滚动条/触控
   *  全部交还 DOM。整体退役：行池+浮点锚 rAF 缓动+自绘滚动条（原 craftWheelStep/
   *  craftAnimFrame/craftPaintWindow/craftScrollJump）。保留的行为语义：可合成
   *  排前+未满足置灰垫底、hover 预览两门、选中仅点击、shift×10、重建回填
   *  scrollTop。重建按内容签名跳过——refreshAll 高频（hover/拾取），3300 行
   *  整表重建只许发生在真实数据变化上 */
  private refreshVanillaCrafting(): void {
    const game = this.game;
    const cl = this.craftListEl;
    if (!game || !cl) return;
    let avail = game.vanillaAvailableRecipes();
    // 材料源聚合持有量表（Recipe._ownedItems——GetAvailableItemCount 数据面）：
    // SW-AV2 2026-09-06 修复「宝箱里的物品不参与制作」：合成扣料链（vanillaCraft →
    // consumeMaterials）早已计入附近箱/bank（craftSourcesFor,Recipe.cs:375-407）,
    // 唯本列表的满足度/材料统计只读背包——箱内材料行被误判「未满足」置灰禁点。
    // 材料统计自本表取数,与可用性判定同源（同 tick _craftSourcesCache）。
    const owned = game.vanillaCraftOwned();
    // ★SW-RB1 2026-09-06 met 判据修复：met =「仅用背包材料即可合成」排序层标记
    // （见下注/2026-08-27 用户要求：背包齐料行排最前、需动用附近箱/bank 料行垫底）。
    // SW-AV2 曾误用聚合表（含箱/bank）算 met ⇒ met ≡ (count>0) 恒真（本列表只入列
    // count>0 行）⇒ 排序退化空转。判据改回背包-only 表（collectOwnedItems 无源态）；
    // 置灰(.no)/点击门维持 SW-AV2 聚合面不变（箱料行仍可点可合成）
    const ownedInvOnly = collectOwnedItems(game.player.inv);
    const q = this.craftSearchEl?.value.trim().toLowerCase() ?? '';
    if (q) {
      const filtered = avail.filter(({ r }) => {
        const k = vanillaItemKey(r.create);
        const name = k ? Lang.itemNameByKey(k) : '';
        return name.toLowerCase().includes(q);
      });
      if (filtered.length) avail = filtered;
    }
    // ★2026-08-27 用户要求：可合成（背包材料齐）排最前，「需动用附近箱/bank 材料」
    // 的行垫底（仍可点击合成——vanilla 语义：CollectedEnoughItemsToCraft>0 即入列
    // 可合成,UpdateRecipeList Recipe.cs:252;原版不区分材料来自背包还是箱）。
    // SW-AV2：置灰(.no)只留给 count<=0（材料源聚合后仍不可合成——本表不会入列,
    // 防御性保留）,箱材料行不再置灰禁点。稳定排序保持组内原版注册序。
    const metFlags = avail.map(({ r }) => {
      let met = r.items.length > 0;
      for (const req of r.items) {
        const have = availableItemCountFor(r, req.id, ownedInvOnly);   // ★SW-RB1 2026-09-06 背包-only 判据（was: owned 聚合表 ⇒ 恒真）
        if (have < req.stack) { met = false; break; }
      }
      return met;
    });
    const rows: Array<{ r: VanillaRecipeLike; count: number; met: boolean }> = avail
      .map((e, i) => ({ ...e, met: metFlags[i] }))
      .sort((x, y) => Number(y.met) - Number(x.met));
    // ★2026-08-27 用户要求：列表高度钳视口（曾恒 240px 底部死区→改视口限）。
    // 2026-09-02：右侧竖列（图标/成就卡/表情）已入 rightRail 流内——上限只剩
    // 视口钳制（-32 底缘余量）；钳下限 240,按行高整除取整（末行半裁观感即消失）。
    // max-height 令短列表自然收合（不再手算 min(len*H)）。首帧布局未就绪（rect 0）
    // 时落 240 下限,后续刷新自校正
    const rectTop = cl.getBoundingClientRect().top;
    const byViewport = window.innerHeight - 32 - rectTop;
    const LIST_H = Math.max(240, Math.floor(byViewport));
    cl.style.maxHeight = `${Math.floor(LIST_H / UI.CRAFT_ROW_H) * UI.CRAFT_ROW_H}px`;
    // 内容签名比对：配方集/计数/满足态全等 → 跳过整表重建（列表 DOM 原样驻留，
    // 原生滚动位置天然不动）——hover/无关 refreshAll 不再付出 3300 行重建
    const prev = this.craftAvailRef;
    const unchanged = prev.length === rows.length
      && prev.every((p, i) => p.r === rows[i].r && p.count === rows[i].count && p.met === rows[i].met);
    this.craftAvailRef = rows;
    if (unchanged) {
      this.refreshCraftGrid(rows);
      return;
    }
    // 整表重建。滞留 hover 高亮随旧行销亡（新行伪类等真实 mousemove/enter 补挂）
    this.craftHoverEl = null;
    const keepScroll = cl.scrollTop;   // 重建回填：拾取/合成触发的刷新不归零滚动位置
    cl.replaceChildren();
    for (let idx = 0; idx < rows.length; idx++) {
      const rec = rows[idx];
      const { r, count } = rec;
      const row = el('div', 'sw-recipe');
      row.style.cssText = `height:${UI.CRAFT_ROW_H}px; box-sizing:border-box; padding:3px 8px; margin:0;`;
      const outKey = vanillaItemKey(r.create);
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(game, game.itemId(outKey ?? ''));
      row.appendChild(img);
      const label = el('span', '', `${outKey ? Lang.itemNameByKey(outKey) : '?'}${r.createStack > 1 ? ` ×${r.createStack}` : ''} ×${count}`);
      row.appendChild(label);
      const mats = el('span', '', r.items.map((req) => {
        const k2 = ingredientKey(req.id);
        if (!k2) return ` ? ${req.stack}`;
        // SW-AV2 2026-09-06：材料持有数取材料源聚合表（含附近箱/bank,GetAvailableItemCount
        // 同义）——曾只数背包,箱内料显示为缺口
        const have = availableItemCountFor(r, req.id, owned);
        return ` ${Lang.itemNameByKey(k2)} ${Math.min(have, req.stack)}/${req.stack}`;
      }).join(' ·'));
      mats.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right;';
      row.appendChild(mats);
      // 材料源聚合后仍不可合成 = 置灰（.sw-recipe.no img/span opacity .45）——
      // SW-AV2 起与「需动用箱料」的排序垫底层解耦：垫底层行样式正常、可点击
      row.classList.toggle('no', rec.count <= 0);
      row.addEventListener('mouseenter', () => {
        // 悬停预选两门（2026-08-21/24/25 定标,只动材料格不动列表）：
        // mousemove 门 150ms——滚动经停行无伴随 mousemove,不预选;
        // 滚轮门 350ms——滚动手势期间不预选
        if (performance.now() - this.craftMouseMoveLast > 150) return;
        if (performance.now() - this.craftWheelLast < 350) return;
        this.craftHoverEl?.classList.remove('hov');
        row.classList.add('hov');
        this.craftHoverEl = row;
        if (this.hoverFocus !== idx) { this.hoverFocus = idx; this.refreshCraftGrid(this.craftAvailRef); }
      });
      row.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        // SW-AV2 2026-09-06：可合成门 = 材料源聚合（背包+附近箱/bank）后 count>0
        // （vanilla CollectedEnoughItemsToCraft,Recipe.cs:280-283）——曾按背包-only
        // 满足度禁点,箱料齐的配方点不动（用户实报根因）。count<=0 行本表不会入列,
        // 门保留作防御。原注释「背包材料未齐,可经仓库合成」的禁点语义废弃。
        if (rec.count <= 0) return;
        this.craftFocus = idx;      // 选中配方——仅点击设置，滚动不改
        this.hoverFocus = -1;       // 点击行即焦点，预览态退场
        // 格料先归还背包再统一扣料——防"料在格里、背包不足"假失败（同旧）
        this.returnCraftGrid();
        game.vanillaCraft(rec.r, (ev as MouseEvent).shiftKey ? 10 : 1, true);   // 成品跟随光标
        this.refreshAll();
      });
      cl.appendChild(row);
    }
    cl.scrollTop = keepScroll;   // 浏览器自动钳到新 scrollHeight,列表缩短不悬空
    // Modern 合成网格材料格（焦点配方）
    this.refreshCraftGrid(rows);
  }

  /** 材料格覆盖计数：req（含组假 id）当前格内存量 */
  private gridCovered(reqId: number): number {
    if (reqId < 1000000) return this.craftGrid.get(reqId) ?? 0;
    const items = RECIPE_GROUP_ITEMS[String(reqId - 1000000)] ?? [];
    let n = 0;
    for (const m of items) n += this.craftGrid.get(m) ?? 0;
    return n;
  }

  /** 现代合成网格材料行（1.4.5 CraftingGrid：左键=放入/右键=取回/合成=格子优先） */
  private refreshCraftGrid(avail: Array<{ r: VanillaRecipeLike; count: number }>): void {
    if (!this.craftGridEl) return;
    // 材料格显示源：hover 预选行 > 点击选中的行 > 无（★不默认第一个配方,
    // 2026-08-25 用户定案）。srcIdx 越界(搜索后 avail 缩短)同样视为无
    const srcIdx = this.hoverFocus >= 0 ? this.hoverFocus : this.craftFocus;
    const focusR = (srcIdx >= 0 && srcIdx < avail.length) ? avail[srcIdx]?.r ?? null : null;
    // 焦点配方变更：归还旧格内容
    if (focusR !== this.craftGridRecipe) {
      this.returnCraftGrid();
      this.craftGridRecipe = focusR;
    }
    this.craftGridEl.textContent = '';
    if (!focusR) return;
    for (const req of focusR.items) {
      const chip = el('div', 'sw-slot chip');   // chip=38px 材料格（.sw-slot img 默认 52px 槽几何会溢出）
      // context 22 槽底 = Inventory_Back4（ItemSlot.cs:2101-2123）
      chip.style.cssText += 'width:38px; height:38px;'
        + 'background-image:url(sprites/vanilla-ui/Inventory_Back4.png);';
      const k = ingredientKey(req.id < 1000000 ? req.id : (RECIPE_GROUP_ITEMS[String(reqIdShift(req.id))]?.[0] ?? req.id));
      if (k) {
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game, this.game.itemId(k));
        chip.appendChild(img);
      }
      const have = this.gridCovered(req.id);
      const cnt = el('span', 'cnt', `${have}/${req.stack}`);
      if (have >= req.stack) cnt.style.color = '#7de08a';
      chip.appendChild(cnt);
      chip.title = `${k ? Lang.itemNameByKey(k) : req.id}${Lang.text('Mods.SandboxWorld.Craft.PutTakeHint')}`;
      chip.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 2) { this.craftGridReturnReq(focusR, req.id); this.refreshAll(); return; }
        this.craftGridDeposit(focusR, req.id);
        this.refreshAll();
      });
      chip.addEventListener('contextmenu', (e) => e.preventDefault());
      this.craftGridEl.appendChild(chip);
    }
    // 合成按钮已去除（2026-08-21 用户要求）：点击配方行即合成——材料格只作
    // 存/取料暂存，行点击时格内存料先归还背包再走 vanillaCraft 统一扣料
    // （hover 预选换焦点时 returnCraftGrid 已归还，此处兜"点击已聚焦行"路径）
  }

  /** 材料格放入：从背包按缺口拉取（组材料依序拉组内成员） */
  private craftGridDeposit(r: VanillaRecipeLike, reqId: number): void {
    void r;
    const req = (r.items.find((x) => x.id === reqId));
    if (!req) return;
    const need = req.stack - this.gridCovered(reqId);
    if (need <= 0) return;
    const members = reqId >= 1000000 ? RECIPE_GROUP_ITEMS[String(reqIdShift(reqId))] ?? [] : [reqId];
    let left = need;
    for (const m of members) {
      if (left <= 0) break;
      const iid = invIndexOfVanilla(m);
      if (iid < 0) continue;
      const take = Math.min(this.game.player.inv.countOf(iid), left);
      if (take > 0) {
        this.game.player.inv.remove(iid, take);
        this.craftGrid.set(m, (this.craftGrid.get(m) ?? 0) + take);
        left -= take;
      }
    }
  }

  /** 材料格单材料取回（格内该 req 的全部存量回背包） */
  private craftGridReturnReq(r: VanillaRecipeLike, reqId: number): void {
    void r;
    const members = reqId >= 1000000 ? RECIPE_GROUP_ITEMS[String(reqIdShift(reqId))] ?? [] : [reqId];
    for (const m of members) {
      const n = this.craftGrid.get(m) ?? 0;
      if (n > 0) { this.game.player.inv.add(invIndexOfVanilla(m), n); this.craftGrid.delete(m); }
    }
  }

  /** 材料格全部归还背包（关背包/换焦点时） */
  returnCraftGrid(): void {
    for (const [vid, n] of this.craftGrid) {
      if (n > 0) {
        const iid = invIndexOfVanilla(vid);
        if (iid >= 0) this.game?.player.inv.add(iid, n);
      }
    }
    this.craftGrid.clear();
  }

  // ============ Toast ============

  toast(msg: string) {
    if (this.toastEl) this.toastEl.remove();
    const t = el('div', 'sw-toast', msg);
    this.toastEl = t;
    this.root.appendChild(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 500);
    }, 2500);
  }

  /** 成就解锁弹窗(原版 InGamePopups.AchievementUnlockedPopup:细条蓝底/图标在右
   *  ≈21px/标题右对齐其左;5s 淡入淡出)。name → ACH_ICON_INDEX 栅格取帧;
   *  点击关闭(原版跳成就页,成就页 UI 未接 GAP) */
  achievementPopup(name: string, title: string) {
    if (!this.achWrapEl) {
      this.achWrapEl = el('div', 'sw-ach-wrap');
      this.root.appendChild(this.achWrapEl);
    }
    const card = el('div', 'sw-ach');
    card.title = title;
    const ttl = el('span', 'ttl', title);
    const icn = el('div', 'icn');
    // 栅格帧 64px → 屏显 21px:整表 ×0.33 缩放后按帧偏移定位(等价原版 0.3×num 缩放)
    const K = 21 / 64;
    const idx = ACH_ICON_INDEX[name] ?? 0;
    const f = achIconFrame(idx);
    const sheet = el('img', 'sheet') as HTMLImageElement;
    sheet.src = 'sprites/vanilla/Achievements.png';
    sheet.style.width = `${1054 * K}px`;
    sheet.style.height = `${1186 * K}px`;
    sheet.style.left = `${-f.x * K}px`;
    sheet.style.top = `${-f.y * K}px`;
    const bdr = el('img', 'bdr') as HTMLImageElement;
    bdr.src = 'sprites/vanilla/Achievement_Borders.png';
    icn.appendChild(sheet); icn.appendChild(bdr);
    card.appendChild(ttl); card.appendChild(icn);
    const kill = () => {
      card.classList.add('out');
      setTimeout(() => card.remove(), 300);
    };
    // ★2026-09-07 用户需求:点击成就弹窗→打开成就面板+滚动定位到该成就+高亮
    // (原版点击跳成就页;本仓成就页=openAchievementsPanel,GAP 已补)
    card.onclick = () => {
      kill();
      if (this.game) {
        import('./AchievementsUI').then((m) => m.openAchievementsPanel(this.game, name));
      }
    };
    this.achWrapEl.appendChild(card);
    setTimeout(kill, 5000); // 300t = 5s(InGamePopups.cs:54)
  }

  // ============ 暂停菜单（原版像素风：IngameOptions.Draw + Utils.DrawInvBG） ============

  showPause(handlers: { onResume: () => void; onSave: () => void; onExport?: () => void; onQuit: () => void; onSettings?: () => void;
    /** ★2026-09-07 刀 5 停车坪(vanilla 布局):自创功能入口自背包簇格迁暂停菜单 */
    onItemSearch?: () => void; onWeather?: () => void; onTime?: () => void; onPlayerList?: () => void; onJourney?: () => void; onResearch?: () => void }) {
    // 已开守卫：移除旧面板再建新——防 ESC 快速连按/HMR 监听器堆积导致多层叠框
    document.querySelectorAll('.sw-pause-panel').forEach((el) => el.remove());
    if (!document.getElementById('sw-pause-style')) {
      const style = document.createElement('style');
      style.id = 'sw-pause-style';
      style.textContent = `
.sw-pause-panel {
  pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  width:360px; padding:30px 26px 18px; z-index:31; box-sizing:border-box;
  background-repeat:no-repeat; background-size:100% 100%; image-rendering:pixelated;
  font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif; user-select:none;
}
.sw-pause-panel.fallback-bg { background:#2a1a63; } /* 素材未载时的兜底(IngameOptions 面板色系) */
.sw-pause-title {
  position:absolute; top:-15px; left:0; right:0; text-align:center;
  font-size:20px; letter-spacing:3px; color:#fff; pointer-events:none;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 2px 0 #000;
}
.sw-pause-btn {
  display:block; width:100%; background:none; border:none; cursor:pointer;
  font-family:inherit; font-size:18px; letter-spacing:3px; color:#fff; padding:8px 0;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000;
  transition:color .1s;
}
.sw-pause-btn:hover { color:#ffd76e; }
`;
      document.head.appendChild(style);
    }
    const panel = el('div', 'sw-pause-panel fallback-bg');
    panel.appendChild(el('div', 'sw-pause-title', Lang.text('Mods.SandboxWorld.UI.Paused')));
    const mkBtn = (label: string, fn: () => void) => {
      const b = el('button', 'sw-pause-btn', label);
      b.onclick = fn;
      return b;
    };
    const bRes = mkBtn(Lang.text('Mods.SandboxWorld.UI.Resume'), () => { panel.remove(); handlers.onResume(); });
    const bSave = mkBtn(Lang.text('Mods.SandboxWorld.UI.SaveGame'), () => handlers.onSave());
    const bExp = handlers.onExport
      ? mkBtn(Lang.text('Mods.SandboxWorld.UI.ExportSave'), () => handlers.onExport?.())
      : null;
    const bSet = mkBtn(Lang.text('LegacyMenu.14'), () => handlers.onSettings?.());
    const bQuit = mkBtn(Lang.text('Mods.SandboxWorld.UI.BackToMenu'), () => { panel.remove(); handlers.onQuit(); });
    // ★2026-09-14 反馈轮8:住房/图鉴入口摘除(住房=原版 EquipPage=1 页签面已在背包;
    //  图鉴=背包 2×2 钮已有),天气/时间/道具搜索收入"开发者选项"子视图
    const clearRows = (): void => {
      panel.querySelectorAll('.sw-pause-btn').forEach((n) => n.remove());
    };
    const buildDev = (): void => {
      clearRows();
      if (handlers.onWeather) panel.appendChild(mkBtn('天气控制', () => { panel.remove(); handlers.onWeather?.(); }));
      if (handlers.onTime) panel.appendChild(mkBtn('时间控制', () => { panel.remove(); handlers.onTime?.(); }));
      if (handlers.onItemSearch) panel.appendChild(mkBtn('道具搜索', () => { panel.remove(); handlers.onItemSearch?.(); }));
      panel.appendChild(mkBtn(Lang.text('Mods.SandboxWorld.MP.Back'), () => buildMain()));   // 返回
      applyBg();
    };
    const buildMain = (): void => {
      clearRows();
      panel.append(bRes, bSave);
      if (bExp) panel.appendChild(bExp);
      panel.append(bSet);
      // 停车坪钮组(★刀 5:vanilla 布局时自创功能入口;classic 不传=不渲染)
      if (handlers.onPlayerList) panel.appendChild(mkBtn(Lang.text('Mods.SandboxWorld.PlayerList.Title'), () => { panel.remove(); handlers.onPlayerList?.(); }));
      if (handlers.onJourney) panel.appendChild(mkBtn(Lang.text('Mods.SandboxWorld.JourneyPowers.Title'), () => { panel.remove(); handlers.onJourney?.(); }));
      // ★SW-RB14b:研究钮标签订正(LegacyInterface.112 原版=你必须先设置边框,非研究面)
      if (handlers.onResearch) panel.appendChild(mkBtn(Lang.text('Mods.SandboxWorld.Research.Title'), () => { panel.remove(); handlers.onResearch?.(); }));
      if (handlers.onWeather || handlers.onTime || handlers.onItemSearch) {
        panel.appendChild(mkBtn(Lang.text('Mods.SandboxWorld.UI.DevOptions'), () => buildDev()));
      }
      panel.append(bQuit);
      applyBg();
    };
    this.root.appendChild(panel);
    // 原版像素面板底:Inventory_Back13 九宫(Utils.DrawInvBG :2672+:2681,
    // IngameOptions.Draw 面板色 (33,15,91)×0.685)逐像素乘色后按角 10px 合成;
    // 素材懒加载竞态(首次打开未就绪)时保留兜底底色,下次打开生效
    const applyBg = () => {
      if (!panel.isConnected) return; // 面板已关(素材加载慢于关闭)
      const url = invBgDataUrl(panel.offsetWidth, panel.offsetHeight);
      if (url) {
        panel.style.backgroundImage = `url(${url})`;
        panel.classList.remove('fallback-bg');
      }
    };
    buildMain();   // 初始主视图(住房/图鉴已摘,自创项入开发者选项子视图)
    requestAnimationFrame(applyBg);
    const img = invBgEnsure();
    // ★bitmap 就绪语义(2026-08-14 修复):invBgImg 升级为 ImageBitmap 后无
    // .complete/.addEventListener——守卫只对 HTMLImageElement 阶段生效;
    // bitmap 存在即已解码,invBgDataUrl 内部自会走 width 判定
    if (img && img instanceof HTMLImageElement && !img.complete) img.addEventListener('load', applyBg, { once: true });
    return panel;
  }

  closeAll() {
    this.chatMonitor?.clear(); // 消息列根节点随 root 清空,定时器必须同步清防泄漏
    this.chatMonitor = null;
    this.root.innerHTML = '';
    this.heldStack = null;
    this.openChest = null;
    this.reforgeItem = null;
    this.detachGame();
    this.reforgeEl?.remove();
    this.reforgeEl = null;
    this.guideEl?.remove();
    this.guideEl = null;
    this.itemSearchEl?.remove();
    this.itemSearchEl = null;
    // ---- 生命周期外挂清理(2026-08-13 泄露 review,审计三高危之一)----
    // 此前只清 DOM 不关逻辑面板:clothesPanel 孤儿(rAF/keydown/Lang 永转)、
    // npc 对话/商店/心情浮层留 stale window keydown、成就/研究模块单例滞留
    // uiBlocking=true、achWrapEl 陈旧引用(退菜单后成就弹窗永久不可见)
    this.clothesPanel?.close();
    this.clothesPanel = null;
    this.closeNpcDialog();
    closeAchievementsPanel();
    closeResearchPanel();
    this.achWrapEl = null;
    // 住房右缘条（body 级 Canvas,不随 root 清空）——先摘旗再 destroy：onClosed
    // 里 `if (game) openInventory` 在退菜单路径 game 已 null,不会误开背包
    this.housingOpen = false;
    this.refreshHousingBtn();
    (window as unknown as { __swHousingPanel?: { destroy(): void } }).__swHousingPanel?.destroy();
    document.querySelector('.sw-housing-panel')?.remove();
  }

  /** 摘除 Game 引用(quitToMenu→closeAll 调用):防旧 Game 整图(世界 store
   *  数十 MB typed array)被 UI 挂到下次进世界才释放(2026-08-13 泄露 review)。
   *  字段保持非空类型(definite assignment)避免 87 处消费点连锁改判空 */
  detachGame(): void {
    this.game = null as unknown as Game;
  }

  /** 初始化 HUD 相关面板（进入游戏后调用一次） */
  initInGame() {
    // 原版左下角消息列(Main.NewText → LegacyChatMonitor;NewText 播 SoundID 12)
    this.chatMonitor?.clear();
    this.chatMonitor = new ChatMonitor(this.root, () => UISfx.sfx.play('menuTick', 1));
    // 回放进世界前缓冲的消息(如新世界出生时的 NPC 入驻公告)
    for (const [t, r, g, b, width] of this.chatPending) this.chatMonitor.message(t, r, g, b, width);
    this.chatPending = [];

    // ★2026-09-07 刀 2:布局分派(必须走 buildInventoryFor 登记 _builtLayout——
    // 共享守卫以它为门;vanilla 分支必须在 buildHud【之后】跑——.sw-vinv 的 DOM 序
    // 在 hotbarEl 之后,关包态全局 slotEl(0-9) 首匹配=热键栏格)
    const vinvLayout = options.data.inventoryLayout === 'vanilla';
    if (!vinvLayout) this.buildInventoryFor('classic');   // classic 原路径(构建器零改动)
    if (!vinvLayout) this.buildChestPanel();   // vanilla 布局宝箱条=vinvBuildChest(防 chest 槽双份)
    this.buildBuffBar();
    this.buildHud(this.game);
    if (vinvLayout) this.buildInventoryFor('vanilla');
    // Buff → 图标物品映射
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, VI(290)], [BuffType.Ironskin, VI(292)],
      [BuffType.Resistance, VI(188)], [BuffType.Thorns, VI(301)],
      [BuffType.Regen, VI(289)], [BuffType.Honey, VI(1128)],
      // 环境 debuff(原版用专属 buff 贴图,此处以近义物品图标近似)
      [BuffType.OnFire, VI(8)], [BuffType.Burning, VI(117)],
      [BuffType.Bleeding, VI(28)], [BuffType.Suffocation, VI(169)],
      [BuffType.ObsidianSkin, VI(288)], [BuffType.Gills, VI(291)],
      [BuffType.ManaRegen, VI(293)], [BuffType.MagicPower, VI(294)],
      [BuffType.Featherfall, VI(295)], [BuffType.WaterWalking, VI(302)],
      [BuffType.Archery, VI(303)], [BuffType.NightOwl, VI(299)],
      // R1 数值批（vi_ 药水物品图标）
      [BuffType.Battle, 'vi_300_BattlePotion'], [BuffType.Calming, 'vi_2324_CalmingPotion'],
      [BuffType.Mining, 'vi_2322_MiningPotion'], [BuffType.Builder, 'vi_2325_BuilderPotion'],
      [BuffType.Heartreach, 'vi_2323_HeartreachPotion'], [BuffType.FlipperPotion, 'vi_2327_FlipperPotion'],
      [BuffType.Titan, 'vi_2326_TitanPotion'], [BuffType.AmmoReservation, 'vi_2344_AmmoReservationPotion'],
      [BuffType.Lifeforce, 'vi_2345_LifeforcePotion'], [BuffType.Endurance, 'vi_2346_EndurancePotion'],
      [BuffType.Wrath, 'vi_2349_WrathPotion'], [BuffType.Rage, 'vi_2347_RagePotion'],
      [BuffType.Tipsy, 'vi_2266_Sake'],
      // 1457 魔力过热 396：Buff_396.png 已随 1457 素材批入仓（buff 栏走
      // /sprites/vanilla/Buff_396.png 直链,UI.ts:2775）——本条降级为 onerror 兜底保留
      [BuffType.ManaHeat, 'vi_189_ManaPotion'],
      // 后期批（近似图标：月噬→吸血鬼 knives / 遮挡→暗影钥匙）
      [BuffType.MoonLeech, 'vi_1569_vampire_knives'], [BuffType.Obstructed, 'vi_329_shadow_key'],
      // 食物三档（以已注册食物贴图为图标近似）
      [BuffType.WellFed, 'vi_5275_joja_cola'], [BuffType.WellFed2, 'vi_4023_grapes'],
      [BuffType.WellFed3, 'vi_1919_sugar_cookie'],
      // 微光化 353：银河珍珠 5340 近似（原版 Buff 353 无独立物品图标，debuff 显示
      // 微光池主素材；两处 init 路径的 map 必须同步——曾只加一处导致另一路径无图标）
      [BuffType.Shimmered, 'vi_5340_galaxy_pearl'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);  }

  /** 原版消息列(Main.NewText 入口) */
  private chatMonitor: ChatMonitor | null = null;
  /** 消息缓冲:ChatMonitor 未建(initInGame 之前,如新世界 afterWorldLoad
   *  发出的 NPC 入驻公告)时暂存,initInGame 创建后回放——曾直接丢弃 */
  private chatPending: Array<[string, number, number, number, number]> = [];
  chatMessage(text: string, r = 255, g = 255, b = 255, width = -1): void {
    if (this.chatMonitor) this.chatMonitor.message(text, r, g, b, width);
    else this.chatPending.push([text, r, g, b, width]);
  }

  // ---- NPC 对话系统(SetTalkNPC + GetChat;内容在 Game 生成,此处纯渲染) ----
  private npcDialog: NpcDialog | null = null;
  private npcShop: NpcShop | null = null;

  /** 配装切换白闪（GetColorByLoadout :2554-2559：Remap(dt,0,30,0.5,0)³→白）。
   *  背包按钮与 Loadout1/2/3 热键（onLoadoutSwitched 回调）共用。
   *  ★ class 必须播完即摘：display:none→block 会使 CSS 动画重播，
   *    残留 class 会导致此后每次打开背包全体槽位白闪 */
  flashLoadoutSwitch(): void {
    // 面板+右下角坞一起闪（装备槽 2026-09-02 迁坞,只闪面板会漏装备/染料列）
    for (const root of [this.invPanel, this.eqDockEl]) {
      if (!root) continue;
      root.classList.remove('sw-loadout-flash');
      void root.offsetWidth;
      root.classList.add('sw-loadout-flash');
      setTimeout(() => root.classList.remove('sw-loadout-flash'), 600);
    }
  }

  /** ★Q-F9 槽级 blocked 回执（QuickStacking.cs:360-363 RestoreToPlayer flag 支 →
   *  ItemSlot.IndicateBlockedSlot :527 = AddPulseEffect(250,40,40)；Draw
   *  ItemSlot.cs:2343-2352 用 InventoryBack21 叠层 × 包络 0.5+0.2·(−cos(πt+π)) ×(1−t⁴)，
   *  PulseEffect.EffectDuration=40t ≈667ms）。仓内最贴近通道 = .sw-slot 色层动画族
   *  （sw-loadout-flash 同型，::before 叠层）；cos 双脉冲包络以 ease-out 单脉冲近似
   *  （★形差登记：指数尾 vs (1−t⁴)+cos 波形差,视觉语义=同格红闪一次）。slots =
   *  quickStackToChests().blockedSlots（主段背包槽号 10-49；includeVoidBag 臂的 bank4
   *  槽号无 data-idx 槽元素 → 查不到静默跳过,与原版 Bank4 面板独立回执面的形差在案） */
  indicateBlockedSlots(slots: number[]): void {
    for (const s of slots) {
      const slotEl = this.slotEl(s, 'inv');
      if (!slotEl || !slotEl.isConnected) continue;
      slotEl.classList.remove('sw-blocked-pulse');
      void slotEl.offsetWidth;
      slotEl.classList.add('sw-blocked-pulse');
      setTimeout(() => slotEl.classList.remove('sw-blocked-pulse'), 700);
    }
  }

  showNpcDialog(name: string, chat: string, buttons: Array<{ id: NpcButtonId; label: string; coins?: number }>, portrait?: DialoguePortraitPayload | null, vanillaId?: number, cornerItem?: number): void {
    if (!this.npcDialog) {
      this.npcDialog = new NpcDialog(this.root, (id) => {
        this.npcShop?.close();
        this.npcShop = null;
        this.game?.npcDialogButton(id);
      }, (vid) => {
        if (vid === -1) {
          // EquipPage[5] 快捷图标（Main.cs:40534-40539）：CloseNPCChatOrSign(quiet)+
          // OpenInventory()+EquipPageSelected=1——本仓装备列常驻，开背包即达
          this.game?.closeNpcDialog();
          this.openInventory();
          return;
        }
        // 渔夫任务鱼角标点击 → 开聊天框插 [i:vid]（Main.cs:40505-40512）
        this.game?.insertChatItemTag(vid);   // 懒建兜底（首次点击时 chatInput 尚为 null）
      });
    }
    // 角标：>0=任务鱼(iconUrl 懒加载即时解析一次,title 名);-1=装备页快捷图标
    // （由 NpcDialog 渲染 DisplaySlots_5）
    const corner = cornerItem !== undefined && cornerItem > 0
      && this.game && iconUrl(this.game, internalIdOfVid(cornerItem))
      ? { vid: cornerItem,
          url: iconUrl(this.game, internalIdOfVid(cornerItem)) || '',
          name: Lang.itemName(cornerItem) ?? '' }
      : cornerItem === -1
        ? { vid: -1, url: '', name: '' }   // -1 态 NpcDialog 渲染 DisplaySlots_5
        : undefined;   // 任务鱼 icon miss 时整角标不画（防 <img src=""> 破图占位）
    this.npcDialog.open(name, chat, buttons, portrait, vanillaId, corner);
  }

  closeNpcDialog(): void {
    this.npcDialog?.close();
    this.npcShop?.close();
    this.npcShop = null;
    this.npcHappiness?.close();   // 心情浮层随对话框一并关闭
    // ★SW-FX32:内嵌货架随关店收面（pos 门读 game.npcShopOpen——refreshAll 触发
    //  layoutVanilla 重排,sig 含 chestOpen=npcShopOpen 必翻 → 货架/头部 display:none）
    if (this._builtLayout === 'vanilla') this.refreshAll();
  }

  showNpcShop(title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number; medal?: number; buyback?: number; stack?: number; prefix?: number }>, copper: number, happinessPct?: number, medals?: number, medalsTotal?: number): void {
    // ★SW-BJ8 2026-09-07 开店强制开背包（Main.OpenShop Main.cs:41162-41170 首行
    //  :41164 `playerInventory = true`，1458 本域无增量）：缺此行=商店开着时背包
    //  面板不自动展开——可见物品只剩快捷栏，而关包快捷栏 = context 13
    //  （Main.cs:44374 只 Draw 不 Handle）无 Alt/Shift/Ctrl 任何 ItemSlot 语义，
    //  背包格 10-49 又不在屏 → 缺省档（Quick Trash=Left Control）的 Ctrl+左键
    //  卖出（GetSellOrTrash ItemSlot.cs:185-196）无任何可达目标；且 Esc/E 在
    //  npcDialogActive 态均走关对话链（Player.cs:4960-5025 ToggleInv 优先序），
    //  背包在店开期间无法手动补开 ⇒「无法向 NPC 出售」整条死路（SW-BJ8 实报）。
    //  force=true：卖出/购买后 openNpcShop 重刷货架会再次进入本方法，
    //  openInventory 缺省是开/关翻转——非 force 会把背包连带关掉。
    this.openInventory(true);
    // 图标由 UI 侧按原版 id 补(atlas 管线)——iconUrl 收内部 id,vid 先转
    // (2026-08-28 修复:此前 vid 直喂=ITEM_DEFS[vid] 错位 def,商店图标张冠李戴)
    const entries: ShopEntry[] = items.map((it) => ({
      ...it,
      iconUrl: this.game ? iconUrl(this.game, internalIdOfVid(it.vanillaId)) || '' : '',
    }));
    // ★SW-FX32 刀①(2026-09-11) vanilla 内嵌位：原版店开态无独立面板——货架 40 格
    //  (Main.cs:42518-42532 context 15)/店名+储蓄(Main.cs:42502-42503 @(504,invBottom))/
    //  快乐度图标+倍率(Main.cs:42504-42512)全部住 .sw-vinv 原版几何(同 FX28 箱条面);
    //  NpcShop 浮面板 =classic 专属面(FX28 箱侧 chestPanel 同例)。Set-Back 钮退役
    //  (原版 Main.cs:42500-42532 全段无关闭钮——关店 = Esc/对话关闭/走远 closeNpcDialog 链)
    if (this._builtLayout === 'vanilla') {
      this.vinvShopPayload = { title, entries, copper, happinessMul: happinessPct ?? 1, medals, medalsTotal };
      this.refreshAll();   // → paintVanillaInvSlots → vinvRefreshShop(货架内容+头部)
      this.vinvShopIconPoll();
      return;
    }
    if (!this.npcShop) {
      this.npcShop = new NpcShop(this.root,
        // 行点击 = 有货商店格（PickItemMovementAction case 15 ItemSlot.cs:1426-1439）：
        // 光标持有物时 Game.npcShopBuy 内裁决——同型 CanStack（:1431）→ 买入叠光标
        // （HandleShopSlot :1910-1923，held.stack++）；异型 → result -1 整链无动作
        (vid, bb, bulk) => {
          const held = this.heldStack;
          if (held) {
            this.game?.npcShopBuy(vid, bb, held, bulk);   // 成交时 Game 侧 held.stack++
            this.refreshAll();                       // ghost 计数随叠购刷新
            return;
          }
          this.game?.npcShopBuy(vid, bb, undefined, bulk);
        },
        () => {
          this.npcShop?.close();
          this.npcShop = null;
          // Main.npcShop=-1 + 回购记清（Main.UpdateOldNPCShop 1457:18387-18393/
          //  1458 同位/1456:18054——★SW-RB14b 行号订正,旧注 18056-18064 系 1456 锚）：
          // 卖出/回购价依赖开店会话状态，关店必须通知 Game 侧失效
          this.game?.npcShopClose();
        },
        // ★SW-BJ22 2026-09-07 格位悬停 tooltip 代打（MouseHover context 15 →
        //  Main.HoverItem.buy=true ItemSlot.cs:3197-3201 → MouseText 物品全文 +
        //  AddShopLines 买入价行 Main.cs:20632-20402）。价格取数现查 Game——
        //  卖出/购买后 openNpcShop 重刷货架,闭包 entries 会陈旧；shopCell 传价
        //  走 shopTooltipContext 的 context15 买入价支（HoverItem.buy 语义）
        //  ★SW-FX32:主体迁 showShopCellTooltip 单源(内嵌货架共用)
        (hover, anchor) => this.showShopCellTooltip(hover, anchor));
    }
    this.npcShop.open(title, entries, copper, happinessPct, medals, medalsTotal);
    // 懒加载晚到升级(2026-08-13 枚举 review):开店瞬间 iconUrl miss(空串/程序化
    // 兜底)此前会冻结到关店——refreshAll 不触 npcShop。有界轮询就绪后原地补图,
    // 关店/超时即停(iconCache 只缓存命中,iconUrl 天然可升级)
    const g = this.game;
    if (g) {
      const initial = new Map(entries.map((e) => [e.vanillaId, e.iconUrl]));
      let tries = 0;
      const timer = setInterval(() => {
        const shop = this.npcShop;
        if (!shop || !shop.isOpen || ++tries > 15) { clearInterval(timer); return; }
        for (const e of entries) {
          const url = iconUrl(g, internalIdOfVid(e.vanillaId));
          if (url && url !== initial.get(e.vanillaId)) {
            initial.set(e.vanillaId, url);
            shop.setRowIcon(e.vanillaId, url);
          }
        }
      }, 600);
    }
  }

  /** 内嵌货架图标懒加载轮询(SW-FX32):vinvRefreshShop 重画时 paintSlot 现查
   *  iconUrl——懒加载就绪后下一拍原地升级;关店/超时(15 拍)即停。「src 不变不动」
   *  纪律(paintSlot)保证零解码浪费 */
  private vinvShopIconPoll(): void {
    let tries = 0;
    const timer = setInterval(() => {
      if (!this.game?.npcShopOpen || this._builtLayout !== 'vanilla' || ++tries > 15) {
        clearInterval(timer);
        return;
      }
      this.vinvRefreshShop();
    }, 600);
  }

  /** 商品格位悬停 tooltip 单源(SW-BJ22 语义面,SW-FX32 起浮面板/内嵌货架共用):
   *  MouseHover context 15 → Main.HoverItem.buy=true（ItemSlot.cs:3197-3201）→
   *  MouseText 物品全文 + AddShopLines 买入价行（Main.cs:20632-20402）。价格取数
   *  现查 Game——卖出/购买后 openNpcShop 重刷货架,闭包 entries 会陈旧;shopCell
   *  传价走 shopTooltipContext 的 context15 买入价支（HoverItem.buy 语义） */
  private showShopCellTooltip(hover: ShopCellHover, anchor: HTMLElement | null): void {
    if (!hover) {
      this.tooltip.style.display = 'none';
      cancelAnimationFrame(this.tooltipPulseRaf);
      return;
    }
    if (!this.game) return;
    const iid = internalIdOfVid(hover.vid);
    if (!iid) return;
    let shopCell: { price: number; medal?: number } | undefined;
    if (hover.buyback !== undefined) {
      const p = this.game.shopBuybackPriceOf(hover.vid, hover.buyback);
      if (p != null) shopCell = { price: p };
    } else {
      const medal = this.game.shopEntryMedalPriceOf(hover.vid);
      if (medal != null) shopCell = { price: medal, medal };
      else {
        const p = this.game.shopEntryPriceOf(hover.vid);
        if (p != null) shopCell = { price: p };
      }
    }
    this.showTooltipFor(iid, 'inv', {
      slot: { id: iid, stack: hover.stack, prefix: hover.prefix },
      anchor: anchor!,
      shopCell,
    });
  }

  /** NPC 快乐度详情浮层（ReportHappiness.Interact） */
  private npcHappiness: NpcHappinessPanel | null = null;

  showNpcHappiness(info: HappinessInfo): void {
    this.npcHappiness?.close();
    this.npcHappiness = new NpcHappinessPanel(this.root, () => { this.npcHappiness = null; });
    this.npcHappiness.open(info);
  }

  closeNpcHappiness(): void {
    this.npcHappiness?.close();
  }

  /** 梳妆台更衣窗（Main.OpenClothesWindow Main.cs:43568）：复用角色创建面板的
   *  外观/颜色页签，确认后回写角色档 */
  private clothesPanel: CharCreation | null = null;

  showClothesWindow(appearance: Appearance, onApply: (a: Appearance) => void): void {
    // 已开守卫(2026-08-13 泄露 review):此前直接覆盖引用——前一个 CharCreation
    // 的 rAF+window keydown+Lang 订阅永久无人清理(孤儿 rAF 永转)
    this.clothesPanel?.close();
    this.clothesPanel = new CharCreation(this.root, {
      // 更衣窗只改衣服样式+六色（确认=GameUI.Change，取消/Esc=回退不动外观）
      onCreate: (a) => { this.clothesPanel = null; onApply(a); },
      onCancel: () => { this.clothesPanel = null; },
    }, { initial: appearance, dresser: true });
  }

  /** 造型师理发窗（Main.OpenHairWindow Main.cs:43073——OpenHairWindow 快照
   *  oldHairStyle/oldHairColor，CancelHairWindow 回退）：只改发型+发色；
   *  确认 = BuyHairWindow（付款失败 toast 拒付，面板保留可改） */
  private hairPanel: CharCreation | null = null;
  showHairWindow(appearance: Appearance,
    quotes: { priceOf: (a: Appearance) => number; buy: (a: Appearance) => boolean },
    onApply: (a: Appearance) => void, onCancel?: () => void): void {
    this.hairPanel?.close();
    this.hairPanel = new CharCreation(this.root, {
      // 理发窗确认=购买（GameUI.BuyWithValue 动态报价）；取消/Esc=CancelHairWindow 回退
      onCreate: (a) => {
        if (!quotes.buy(a)) {
          this.toast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
          this.showHairWindow(appearance, quotes, onApply, onCancel);   // 重建面板（购买被拒仍可改）
          return;
        }
        this.hairPanel = null;
        onApply(a);
      },
      onCancel: () => { this.hairPanel = null; onCancel?.(); },   // CancelHairWindow :43096 SetTalkNPC(-1)
    }, { initial: appearance, hairSalon: true, priceOf: quotes.priceOf });
  }

  /** M5：背包/快捷栏已 Canvas 化，DOM 仅保留 Buff 栏 + Toast */
  initInGameLite() {
    this.buildBuffBar();
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, VI(290)], [BuffType.Ironskin, VI(292)],
      [BuffType.Resistance, VI(188)], [BuffType.Thorns, VI(301)],
      [BuffType.Regen, VI(289)], [BuffType.Honey, VI(1128)],
      [BuffType.OnFire, VI(8)], [BuffType.Burning, VI(117)],
      [BuffType.Bleeding, VI(28)], [BuffType.Suffocation, VI(169)],
      [BuffType.ObsidianSkin, VI(288)], [BuffType.Gills, VI(291)],
      [BuffType.ManaRegen, VI(293)], [BuffType.MagicPower, VI(294)],
      [BuffType.Featherfall, VI(295)], [BuffType.WaterWalking, VI(302)],
      [BuffType.Archery, VI(303)], [BuffType.NightOwl, VI(299)],
      // R1 数值批（vi_ 药水物品图标）
      [BuffType.Battle, 'vi_300_BattlePotion'], [BuffType.Calming, 'vi_2324_CalmingPotion'],
      [BuffType.Mining, 'vi_2322_MiningPotion'], [BuffType.Builder, 'vi_2325_BuilderPotion'],
      [BuffType.Heartreach, 'vi_2323_HeartreachPotion'], [BuffType.FlipperPotion, 'vi_2327_FlipperPotion'],
      [BuffType.Titan, 'vi_2326_TitanPotion'], [BuffType.AmmoReservation, 'vi_2344_AmmoReservationPotion'],
      [BuffType.Lifeforce, 'vi_2345_LifeforcePotion'], [BuffType.Endurance, 'vi_2346_EndurancePotion'],
      [BuffType.Wrath, 'vi_2349_WrathPotion'], [BuffType.Rage, 'vi_2347_RagePotion'],
      [BuffType.Tipsy, 'vi_2266_Sake'],
      // 1457 魔力过热 396：Buff_396.png 已随 1457 素材批入仓（buff 栏走
      // /sprites/vanilla/Buff_396.png 直链,UI.ts:2775）——本条降级为 onerror 兜底保留
      [BuffType.ManaHeat, 'vi_189_ManaPotion'],
      // 后期批（近似图标：月噬→吸血鬼 knives / 遮挡→暗影钥匙）
      [BuffType.MoonLeech, 'vi_1569_vampire_knives'], [BuffType.Obstructed, 'vi_329_shadow_key'],
      // 食物三档（以已注册食物贴图为图标近似）
      [BuffType.WellFed, 'vi_5275_joja_cola'], [BuffType.WellFed2, 'vi_4023_grapes'],
      [BuffType.WellFed3, 'vi_1919_sugar_cookie'],
      // 微光化 353：银河珍珠 5340 近似（与上方 init 全量路径的 map 保持同步）
      [BuffType.Shimmered, 'vi_5340_galaxy_pearl'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);
  }

  // ================= 原版布局构建器(2026-09-07 刀 2;★SW-FX39 2026-09-11 缺省转正:
  //  inventoryLayout 缺省=vanilla,classic 旧自创布局退居 ?invlayout=legacy 回退旗) =================
  // 权威 = Terarria1457/Terraria/Main.cs DrawInventory 族(几何逐行锚,数值单源
  // vanillaInvLayout.ts;与 docs/inventory-crafting-research-1456.md §四 交叉验证一致)。
  // 纪律:classic(buildInventoryPanel)冻结维护(仅回退旗面);本族全为新代码,共享区仅 4 处
  // flag 守卫(initInGame 分派/positionInvPanel 首行/refreshHotbar 开包早退/refreshAllNow 补绘)。
  // 坑①:网格含槽 0-9,与关包热键栏 [data-idx] 全局 querySelector 首匹配冲突——
  //   本族内一律走 vinvSlots 作用域引用,禁用 slotEl(0-9);DOM 序保证关包态全局查询
  //   首命中热键栏(.sw-vinv 在 buildHud 之后挂载)。
  // 坑②:独立类 .sw-vinv,不得复用 sw-panel/sw-inv/sw-invgrid/sw-eqdock(--slot:39px
  //   等 CSS 渗漏),作用域样式见 vinvStyleEnsure。
  // 登记债清偿状态(SW-FX39 时点):住房页槽位=刀3 ✓/Sort 钮=FX29 ✓/相机页签=FX10 债⑥ ✓/
  //   杂项页超级矿车开关=FX10 债⑩ ✓/热键锁=FX10 债⑪ ✓/buff 列=FX10 债④ ✓;
  //   自创面入口(道具搜索/天气/时间/玩家列表/旅程/研究/住房面板)停于暂停菜单停车坪
  //   (main.ts openInGamePause,inventoryLayout==='vanilla' 门控——缺省转正后即常态路径)。
  //   遗留债:配方搜索框/合成站文字行(SW 自创 QoL,原版 1457 CraftingUI.cs:161-318
  //   无此面;配方搜索待 FX30 modern 窗分期)——见 SW-FX39 差集审计报告。

  private vinvRoot: HTMLElement | null = null;
  /** 作用域槽引用 `${where}:${i}`(坑①:替代全局 slotEl) */
  private vinvSlots = new Map<string, HTMLElement>();
  private vinvPageEls: { equip: HTMLElement; misc: HTMLElement; housing: HTMLElement } | null = null;
  private vinvTabMisc: HTMLElement | null = null;
  private vinvTabHousing: HTMLElement | null = null;
  private vinvTabCamera: HTMLElement | null = null;
  /** 热键锁图标(SW-FX10 债⑪;Main.cs:43203 DrawHotbarLockIcon 的 DOM 化) */
  private vinvLockEl: HTMLElement | null = null;
  /** 杂项页 buff 列容器(SW-FX10 债④;Main.cs:42008-42046 EquipPage==2 尾段的 DOM 化。
   *  开包∧页2 时 buff 块 reflow 至此,否则回流 buffBar——原版双态同源 DrawBuffIcon) */
  private miscBuffCol: HTMLElement | null = null;
  /** EquipPage 状态(原版 Main.EquipPageSelected/-1 记忆语义;每帧重算见 vinvApplyPage) */
  private vinvPageSelected: 0 | 1 | 2 = 0;
  private vinvPageCurrent = -1;
  private vinvQuickBtn: HTMLButtonElement | null = null;
  private vinvSortBtn: HTMLButtonElement | null = null;
  private vinvBestiaryBtn: HTMLButtonElement | null = null;
  private vinvEmoteBtn: HTMLButtonElement | null = null;
  private vinvDefenseEl: HTMLElement | null = null;
  /** 布局期元素表:{el, pos()}——pos 返回 null=隐藏(追加槽未解锁/开箱态堆叠钮) */
  private vinvLayoutItems: Array<{ el: HTMLElement; pos: () => { x: number; y: number } | null }> = [];
  private vinvRowMap = new Map<string, number>();   // `equip:8`→可见行号(追加槽重编号;查不到=隐藏)
  private vinvLayoutCtx: { sw: number; sh: number; mH: number; num20: number; chestOpen: boolean; cosUiVisible: boolean; visibleRows: number; minimapOn: boolean; cartUnlocked: boolean } | null = null;   // cosUiVisible=★SW-RB13b ChestOrShopUIVisible(Main.cs:3035-3046)
  private vinvLayoutSig = '';
  private vinvResizeHandler: (() => void) | null = null;
  /** 当前已建布局(分派/重建判据;null=未建) */
  private _builtLayout: 'classic' | 'vanilla' | null = null;

  private buildInventoryFor(layout: 'classic' | 'vanilla'): void {
    // _builtLayout 统一在分派层登记(classic 构建器零改动红线,不在其内写)。
    // ★构建【后】再登记——vanilla 构建器首行的 teardown 会清它(红队 F2 重入卫生)
    if (layout === 'vanilla') this.buildVanillaInventoryPanel();
    else this.buildInventoryPanel();
    this._builtLayout = layout;
  }

  /** 作用域样式(坑②):.sw-vinv 前缀全隔离;槽底 = eqdock 同款 gradient+multiply
   *  纹理层(loadout 配装乘色在层内合成,免 ::before 加性发白),--slot-alpha 缺省 1
   *  (原版开包格不透明底) */
  private vinvStyleEnsure(): void {
    if (document.getElementById('sw-vinv-style')) return;
    const st = document.createElement('style');
    st.id = 'sw-vinv-style';
    st.textContent = `
.sw-vinv { font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif; }
/* ★2026-09-09 用户实测(Windows):继承 body 栈(Segoe UI→YaHei 逐字回退) =
   指示器文字多字体度量混排/叠加感——显式声明与 .sw-panel 同款像素字体栈 */
.sw-vinv .sw-slot { position:absolute; width:52px; height:52px; background-image:none;
  isolation:isolate; transform-origin:top left; touch-action:none; }
.sw-vinv .sw-slot::after { content:''; position:absolute; inset:0; z-index:-1;
  background-image:linear-gradient(var(--slot-tint, rgb(220,220,220)), var(--slot-tint, rgb(220,220,220))),
    var(--slot-bgimg, url(sprites/vanilla/Inventory_Back.png));
  background-size:100% 100%, 100% 100%; background-blend-mode:multiply, normal;
  /* ★原版 ground truth(Main.cs:46460-46474):inventoryBack=Color(invAlpha) 且
     invAlpha 每拍 ±0.2 在 180↔240 循环脉冲(10s 周期)——槽底亮度+不透明度同脉。
     --invpulse=(invAlpha-180)/60 由 rAF 单点驱动(root 单写,全槽 calc 派生);
     --slot-alpha 显式置 1 的槽(经典列表格)退出脉冲 */
  opacity:var(--slot-alpha, calc(0.706 + var(--invpulse, 0) * 0.235)); }
.sw-vinv .sw-slot:hover::after { opacity:1; }
.sw-vinv .sw-slot::before { background:transparent; mix-blend-mode:normal; }
.sw-vinv .vinv-btn { position:absolute; pointer-events:auto; margin:0; padding:0;
  border:none; background-color:transparent; background-repeat:no-repeat;
  image-rendering:pixelated; cursor:pointer; }
.sw-vinv .vinv-txt { position:absolute; pointer-events:none; color:#e8e8f0;
  text-shadow:1px 1px 0 #000; white-space:nowrap; }
.sw-vinv .sw-slot-num { position:absolute; left:5px; top:2px; font-size:11px; font-weight:bold;
  color:#fff; text-shadow:1px 1px 0 #000; pointer-events:none; }
/* ★SW-FX32 商店货架格:InventoryBack 底框(含空格=售卖放置区)同箱条 chrome;
   买不起调暗=经典面同款呈现(原版无调暗,呈现偏差备案) */
.sw-vinv .sw-vshop-cell { transform:scale(0.755); }
.sw-vinv .sw-vshop-cell.is-poor { opacity:0.45; }
`;
    document.head.appendChild(st);
  }

  private vinvMakeSlot(where: SlotWhere, i: number, scale: number): HTMLElement {
    const s = this.makeSlotEl(i, where);
    s.style.width = '52px';
    s.style.height = '52px';
    s.style.transform = `scale(${scale})`;
    this.vinvSlots.set(`${where}:${i}`, s);
    return s;
  }

  /** 原版布局构建器(几何逐函数锚 vanillaInvLayout.ts;行号注回 Main.cs)。
   *  ★2026-09-08 红队 F2 清偿:开头强制 teardown——closeAll 只清 DOM 不清实例态,
   *  重进世界路径(initInGame→本函数)不走 rebuild,布局/住房签名与 pvpTeamBtns/
   *  vinvLayoutItems 若不重置 = 全新 DOM 吃旧缓存(布局冻结+住房页空白+监听泄漏) */
  private buildVanillaInventoryPanel(): void {
    this.teardownInventoryPanel();
    this.vinvStyleEnsure();
    this.accEyeEls.clear();
    const root = el('div', 'sw-vinv');
    root.style.cssText = 'position:fixed; inset:0; pointer-events:none; display:none; z-index:11;';
    this.vinvRoot = root;
    this.invPanel = root;   // 开合链/panelOpen/resolveDrop 语义共用 invPanel 字段
    const F = (px: number): string => `${px}px`;
    const txt = (text: string): HTMLElement => { const d = el('div', 'vinv-txt', text); root.appendChild(d); return d; };
    const btn = (w: number, h: number): HTMLButtonElement => {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.width = F(w); b.style.height = F(h);
      root.appendChild(b);
      return b;
    };
    const pos = (b: HTMLElement, p: () => { x: number; y: number } | null): void => {
      this.vinvLayoutItems.push({ el: b, pos: p });
    };

    // ---- 10×5 网格(槽 0-49,热键栏=第 0 行;Main.cs:41731-41750) ----
    for (let i = 0; i < 50; i++) {
      const s = this.vinvMakeSlot('inv', i, INV_SCALE);
      if (i < 10) s.appendChild(el('span', 'sw-slot-num', i === 9 ? '0' : String(i + 1)));
      root.appendChild(s);
      pos(s, () => gridSlotXY(i));
    }
    // 标题(Main.cs:41725 Lang.inter[4] "Inventory" @(40,0))
    const title = txt(Lang.inter(4));
    title.style.fontSize = '16px';
    pos(title, () => ({ x: TITLE_XY.x, y: TITLE_XY.y }));
    // 成就 Advisor(Main.cs:41758-41763 @(501,25))
    const advWrap = el('div');
    advWrap.style.cssText = 'position:absolute; pointer-events:auto;';
    advWrap.appendChild(createAchievementAdvisor(this.game));
    this.achAdvisorEl = advWrap.firstChild as HTMLElement & { update(): void };
    root.appendChild(advWrap);
    // ★红队 m8b 清偿:CanDrawAboveCoins 在 sw<1000 为 false(AchievementAdvisor.cs:26-36)
    // → 改画装备列旁第二落位 (:42096-42100 sw-224, 末行y+8),非恒钉 (501,25)
    pos(advWrap, () => {
      const c = this.vinvLayoutCtx!;
      // ★2026-09-13 用户要求:成就卡顶对齐背包格顶(y=20;vanilla 25 = 5px 差,偏差备案)
      if (c.sw >= 1000) return { x: ADVISOR_XY.x, y: 20 };
      let last = 7;
      for (let s = 9; s >= 3; s--) { const r = this.vinvRowMap.get(`equip:${s}`); if (r !== undefined) { last = r; break; } }
      return { x: c.sw - 224, y: equipRowY(c.num20, last) + 8 };
    });
    // ---- 钱币/弹药列(Main.cs:42460-42495:标签 (496,84)/(532,84),槽 x=497/534) ----
    const coinLbl = txt(Lang.text('LegacyInterface.26'));
    coinLbl.style.fontSize = '13px';
    pos(coinLbl, () => ({ x: COIN_LABEL_XY.x, y: COIN_LABEL_XY.y }));
    const ammoLbl = txt(Lang.text('LegacyInterface.27'));
    ammoLbl.style.fontSize = '13px';
    pos(ammoLbl, () => ({ x: AMMO_LABEL_XY.x, y: AMMO_LABEL_XY.y }));
    for (let k = 0; k < 4; k++) {
      const cs = this.vinvMakeSlot('inv', COIN_START + k, COIN_AMMO_SCALE);
      root.appendChild(cs);
      pos(cs, () => coinSlotXY(k));
      const as = this.vinvMakeSlot('inv', AMMO_START + k, COIN_AMMO_SCALE);
      root.appendChild(as);
      pos(as, () => ammoSlotXY(k));
    }
    // ---- 垃圾桶(Main.cs:43073-43090 (448,258) scale0.85;开箱/商店 (453,426)) ----
    root.appendChild(this.vinvBuildTrash());

    // ---- 2×2 快捷钮(Main.cs:42548-42613/43093-43193) ----
    // QuickStack:左键=按 quickStackMode 执行(原版右键循环 StackToChestsPreferredMode
    // 的本仓映射=右键循环 quick↔smart);开箱/商店不画(42548)
    {
      const b = btn(32, 30);
      this.vinvQuickBtn = b;
      const paintQuick = (): void => {
        const base = options.data.quickStackMode === 'smart' ? 2 : 0;
        b.style.backgroundImage = `url(sprites/vanilla-ui/UI_ChestStack_${base}.png)`;
        b.style.backgroundSize = '100% 100%';
      };
      paintQuick();
      b.addEventListener('mouseenter', () => {
        const base = options.data.quickStackMode === 'smart' ? 3 : 1;
        b.style.backgroundImage = `url(sprites/vanilla-ui/UI_ChestStack_${base}.png)`;
      });
      b.addEventListener('mouseleave', paintQuick);
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        this.game.quickStackAllChests(options.data.quickStackMode);
        this.game.sfx.play('menuTick', 1);            // SoundID 12(:41292)
        this.refreshAll();
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void options.set('quickStackMode', options.data.quickStackMode === 'quick' ? 'smart' : 'quick');
        paintQuick();
        this.game.sfx.play('menuTick', 1);
      });
      pos(b, () => quickStackXY(!!this.vinvLayoutCtx?.chestOpen));
    }
    // Sort(534,244):★SW-FX29 清偿(FX10 债③)——vanilla 点击=ItemSorting.SortInventory
    // (Main.cs:42602 左键释放→SortInventory()+PlaySound(12);悬停帧 :42588-42616 1:1;
    // 悬停文案 MouseTextNoOverride("GameUI.SortInventory") :42618-42620→title 代承载)
    // 排序主干=src/stats/ItemSorting.ts(52 层谓词+21 张 SortingPriority 集比较器+
    // 运行时层序推导+金标 tests/sw-fx29);vanilla Sort 钮仅 chest==-1 && npcShop==0
    // 绘制(:42586),本仓开箱态也画=登记形差,点击功能同链
    {
      const b = btn(30, 30);
      this.vinvSortBtn = b;
      this.vinvBindHoverTip(b, () =>
        Lang.has('GameUI.SortInventory') ? Lang.text('GameUI.SortInventory') : 'GameUI.SortInventory');
      b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_Sort_0.png)';
      b.style.backgroundSize = '100% 100%';
      b.addEventListener('mouseenter', () => { b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_Sort_1.png)'; });
      b.addEventListener('mouseleave', () => { b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_Sort_0.png)'; });
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        this.game.sortInventory();                 // ★SW-FX29:ItemSorting.SortInventory
        this.game.sfx.play('menuTick', 1);         // SoundID 12(Main.cs:42603)
        this.refreshAll();
      });
      pos(b, () => sortXY(!!this.vinvLayoutCtx?.chestOpen));
    }
    // 图鉴(498,278)/表情(534,278):开箱态移 (503,446)/(539,446)(43103-43108)
    {
      const b = btn(30, 30);
      this.vinvBestiaryBtn = b;
      this.vinvBindHoverTip(b, () => Lang.text('Mods.SandboxWorld.Tabs.Bestiary'));
      b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_Bestiary.png)';
      b.style.backgroundSize = '200% 100%';
      b.addEventListener('mouseenter', () => { b.style.backgroundPosition = '100% 0'; });
      b.addEventListener('mouseleave', () => { b.style.backgroundPosition = '0 0'; });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.onBestiary?.(); });
      pos(b, () => bestiaryXY(!!this.vinvLayoutCtx?.cosUiVisible));   // ★SW-RB13b:ChestOrShopUIVisible(Main.cs:3035-3046)=chest/shop ∧ !PipsUseGrid——网格态回位(43103)
    }
    {
      const b = btn(30, 30);
      this.vinvEmoteBtn = b;
      this.vinvBindHoverTip(b, () => Lang.has('GameUI.Emote') ? Lang.text('GameUI.Emote') : 'GameUI.Emote');
      b.style.backgroundImage = 'url(sprites/vanilla-ui/UI_Emotes.png)';
      b.style.backgroundSize = '200% 100%';
      b.addEventListener('mouseenter', () => { b.style.backgroundPosition = '100% 0'; });
      b.addEventListener('mouseleave', () => { b.style.backgroundPosition = '0 0'; });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.onEmoteMenu?.(); });
      pos(b, () => emoteXY(!!this.vinvLayoutCtx?.cosUiVisible));   // ★SW-RB13b:同上(43158 门=ChestOrShopUIVisible)
    }

    // ---- 三页容器(EquipPage 0/1/2;页签见下;页切换=display,坐标全绝对) ----
    const pageOf = (): HTMLElement => {
      const p = el('div');
      p.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
      root.appendChild(p);
      return p;
    };
    const pageEquip = pageOf();
    const pageHousing = pageOf();   // 槽位刀 3(DrawNPCHousesInUI)
    const pageMisc = pageOf();
    this.vinvPageEls = { equip: pageEquip, misc: pageMisc, housing: pageHousing };
    const pagePos = (b: HTMLElement, p: () => { x: number; y: number } | null): void => {
      this.vinvLayoutItems.push({ el: b, pos: p });
    };

    // ---- 装备页(EquipPage==0 Main.cs:42085-42236):染料|时装|装备 三列+勾选框列 ----
    const buildEquipCol = (col: 'equip' | 'vanity' | 'dye', slots: number[], xOf: (sw: number) => number, scale: number): void => {
      for (const slot of slots) {
        const where: SlotWhere = col === 'dye' ? 'dye' : 'armor';
        const s = this.vinvMakeSlot(where, slot, scale);
        pageEquip.appendChild(s);
        pagePos(s, () => {
          const row = this.vinvRowMap.get(`${col}:${slot}`);
          if (row === undefined) return null;   // 追加槽未显示=不占行号(:42092-42113)
          return { x: xOf(this.vinvLayoutCtx!.sw), y: equipRowY(this.vinvLayoutCtx!.num20, row) };
        });
      }
    };
    buildEquipCol('equip', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], EQUIP_COL_X, INV_SCALE);
    buildEquipCol('vanity', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], VANITY_COL_X, INV_SCALE);
    buildEquipCol('dye', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], DYE_COL_X, INV_SCALE);
    // 可见性勾选框(Main.cs:42118-42155:x=sw-58,仅功能段行>2;独格非槽角——原版同)
    for (let slot = 3; slot <= 9; slot++) {
      const eye = el('button', 'vinv-btn') as HTMLButtonElement;
      eye.style.width = '16px'; eye.style.height = '12px';
      eye.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (this.heldStack) return;   // mouseItem.IsAir 门(:40859)
        const p = this.game?.player;
        if (!p) return;
        p.hideVisibleAccessory[slot] = !p.hideVisibleAccessory[slot];
        this.game!.sfx.play('menuTick');
        this.paintAccEyes();
        this.showBuffTooltip(eye, eye.dataset.swTipText ?? '', '');   // ★反馈轮6:点击即刷新(mousedown 必在悬停态)
      });
      this.accEyeEls.set(slot, eye);   // 复用 paintAccEyes 共享重刷(:1405)
      this.paintAccEye(eye, slot);
      pageEquip.appendChild(eye);
      pagePos(eye, () => {
        const row = this.vinvRowMap.get(`equip:${slot}`);
        if (row === undefined) return null;
        return { x: ACCESSORY_CHECK_X(this.vinvLayoutCtx!.sw), y: accessoryCheckY(this.vinvLayoutCtx!.num20, row) };
      });
    }
    // 配装轨(DrawLoadoutButtons Main.cs:42651-42707:竖轨 (sw-44,num20+2) 高=可见行数·47.6 截断)
    {
      const rail = el('div');
      rail.style.cssText = 'position:absolute; width:4px; background:rgba(120,130,180,0.45);';
      pageEquip.appendChild(rail);
      pagePos(rail, () => {
        const c = this.vinvLayoutCtx!;
        const r = loadoutRailRect(c.sw, c.num20, c.visibleRows);
        rail.style.height = `${r.h}px`;   // 高度随追加槽行数变化(与 pos 同拍)
        return { x: r.x, y: r.y };
      });
      this.loadoutBtns = [];
      for (let k = 0; k < 3; k++) {
        const b = el('button', 'vinv-btn sw-loadout-btn') as HTMLButtonElement;
        b.style.width = '32px'; b.style.height = '32px';
        b.style.backgroundImage = 'url(sprites/vanilla/Extra_259.png)';
        b.style.backgroundSize = '300% 300%';
        b.style.backgroundPosition = `0% ${k * 50}%`;
        b.addEventListener('mouseenter', () => {
          if (this.game.player.inv.currentLoadout !== k) b.style.backgroundPosition = `100% ${k * 50}%`;
        });
        b.addEventListener('mouseleave', () => {
          if (this.game.player.inv.currentLoadout !== k) b.style.backgroundPosition = `0% ${k * 50}%`;
        });
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.game.player.inv.currentLoadout === k) return;
          this.game.player.inv.trySwitchingLoadout(k, this.game.player.hideVisibleAccessory);
          this.game.sfx.play('menuTick', 1);
          this.flashLoadoutSwitch();
          this.refreshAll();
        });
        pageEquip.appendChild(b);
        this.loadoutBtns.push(b);
        pagePos(b, () => loadoutBtnXY(this.vinvLayoutCtx!.sw, this.vinvLayoutCtx!.num20, k));
      }
    }
    // 防御计数(DrawDefenseCounter Main.cs:42824-42899:中心 (sw-210, 末行 y+26))
    {
      const defRow = el('div');
      defRow.dataset.role = 'defense';
      defRow.style.cssText = 'position:absolute; width:40px; height:36px; pointer-events:auto; cursor:help;';
      const defWrap = el('div');
      defWrap.style.cssText = 'position:relative; width:40px; height:36px;';
      const defShield = el('img');
      defShield.alt = '';
      defShield.style.cssText = 'position:absolute; inset:0; margin:auto; width:39px; height:36px; image-rendering:pixelated;';
      defWrap.appendChild(defShield);
      const defNum = el('span', '', '0');
      defNum.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center;'
        + 'padding-top:2px; font-size:13px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000;';
      defWrap.appendChild(defNum);
      defRow.appendChild(defWrap);
      defRow.addEventListener('mouseenter', () => {
        if (!this.game) return;
        const p = this.game.player;
        const st = p.defense;
        const w = this.game.world;
        const mul = w.isMaster ? 1.0 : w.isExpert ? 0.75 : 0.5;   // :42831-42840 难度换算
        const reduce = Math.ceil(st * mul);
        const dl = mainDifficulty(w);
        const tipLines = [`${st} ${Lang.text('LegacyInterface.10')}`, Lang.text('UI.DefenseDamageReduction', reduce)];
        if (dl >= GDL.LEGENDARY) tipLines.push(Lang.text('UI.Legendary'));
        else if (dl >= GDL.MASTER) tipLines.push(Lang.text('UI.Master'));
        else if (dl >= GDL.EXPERT) tipLines.push(Lang.text('UI.Expert'));
        this.showBuffTooltip(defRow, tipLines[0], tipLines.slice(1).join('\n'));
      });
      defRow.addEventListener('mouseleave', () => this.hideBuffTooltip());
      pageEquip.appendChild(defRow);
      this.vinvDefenseEl = defRow;
      pagePos(defRow, () => {
        const c = this.vinvLayoutCtx!;
        let last = 7;
        for (let s = 9; s >= 3; s--) { const r = this.vinvRowMap.get(`equip:${s}`); if (r !== undefined) { last = r; break; } }
        const ctr = defenseCenterXY(c.sw, c.num20, last);
        return { x: ctr.x - 20, y: ctr.y - 18 };   // 40×36 盒左上=中心-(20,18)
      });
    }
    // 页签(DrawPageIcons Main.cs:43511-43593:y=num20-32;杂项/住房=页切换,相机=债)
    const mkTab = (w: number, h: number, imgNormal: string, title: string): HTMLButtonElement => {
      const b = btn(Math.round(w * 0.9), Math.round(h * 0.9));   // ★红队 n2:原版 0.9f 绘制(:43523/:43534/:43545)
      this.vinvBindHoverTip(b, () => title);
      b.style.backgroundImage = `url(sprites/vanilla-ui/${imgNormal})`;
      b.style.backgroundSize = '100% 100%';
      return b;
    };
    this.vinvTabMisc = mkTab(TAB_MISC_SIZE.w, TAB_MISC_SIZE.h, 'UI_DisplaySlots_2.png',
      Lang.text('Mods.SandboxWorld.Tabs.Misc'));
    this.vinvTabMisc.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.vinvPageSelected = this.vinvPageSelected === 2 ? 0 : 2;   // 同页再点回 0(:43584)
      this.game.sfx.play('menuTick', 1);
      this.vinvPageCurrent = -1;
      this.vinvApplyPage();
    });
    this.vinvTabHousing = mkTab(TAB_HOUSING_SIZE.w, TAB_HOUSING_SIZE.h, 'UI_DisplaySlots_4.png',
      Lang.text('Mods.SandboxWorld.Housing.Button'));
    this.vinvTabHousing.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.vinvPageSelected = this.vinvPageSelected === 1 ? 0 : 1;
      this.game.sfx.play('menuTick', 1);
      this.vinvPageCurrent = -1;
      this.vinvApplyPage();
    });
    // 相机页签(Main.cs:43549-43595)——SW-FX10 债⑥清偿：点击开 M6 拍照模式
    //  （原版 CaptureManager.Instance.Active=true + blockMouse :43565-43568;游戏pad 臂
    //  =QuickScreenshot :43562-43564 本仓触屏同走开界面备案）。成功播放 PlaySound(10)
    //  =menuOpen（:43583 flag 门——CaptureModeDisabled 红图态本仓无,死亡/幽灵拒开
    //  由 toggleRequest 内置,拒开不响=同相）
    this.vinvTabCamera = mkTab(TAB_CAMERA_SIZE.w, TAB_CAMERA_SIZE.h, 'UI_DisplaySlots_8.png',
      Lang.inter(81));
    this.vinvTabCamera.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const cm = this.game?.renderer.captureMode;
      if (!cm || !this.game) return;
      const was = cm.active;
      cm.toggleRequest(this.game.player, this.game.world);
      if (!was && cm.active) this.game.sfx.play('menuOpen', 1);
    });
    pos(this.vinvTabMisc, () => ({ x: TAB_MISC_X(this.vinvLayoutCtx!.sw), y: TAB_Y(this.vinvLayoutCtx!.num20) }));
    pos(this.vinvTabHousing, () => ({ x: TAB_HOUSING_X(this.vinvLayoutCtx!.sw), y: TAB_Y(this.vinvLayoutCtx!.num20) }));
    pos(this.vinvTabCamera, () => ({ x: TAB_CAMERA_X(this.vinvLayoutCtx!.sw), y: TAB_Y(this.vinvLayoutCtx!.num20) }));

    // ---- 热键锁(Main.cs:43203-43237 DrawHotbarLockIcon;仅开包态画)——SW-FX10 债⑪清偿:
    //  位置 (0,21),pushSideToolsUp(builderAcc 可见图标≥10=恶魔心+大师槽齐显)→(0,0)
    //  (:43205-43208);贴图 Lock_{锁0/未锁1} 50×22 双帧横排取单帧 25×22,缩放 0.9(:43212/
    //  :43234);点击 PlaySound(22)=unlock + hbLocked 翻转(:43230-43231);悬停名 inter[5]
    //  未锁/inter[6] 已锁(:43220-43223);悬停描 OurFavoriteColor 第二帧(:43232-43234,
    //  本仓近似=帧1 叠加 screen 混合)。锁定消费面=关包快捷栏点击门(:44353/:44357,
    //  paintHotbarLockState/mouseup 臂) + 1-0 数字键照常 ----
    {
      const lock = el('button', 'vinv-btn') as HTMLButtonElement;
      const paintLock = (): void => {
        const locked = !!this.game?.player.hbLocked;
        lock.style.backgroundImage = `url(sprites/vanilla/Lock_${locked ? 0 : 1}.png)`;
        // 悬停金描帧=当前态贴图帧1(原版 value.Frame(2,1,1)+OurFavoriteColor :43232-43234)
        glow.style.backgroundImage = `url(sprites/vanilla/Lock_${locked ? 0 : 1}.png)`;
      };
      // ★2026-09-13 反馈轮6:hover 名走自有气泡(原版 MouseText Main.cs:43232 域)
      this.vinvBindHoverTip(lock, () => Lang.inter(this.game?.player.hbLocked ? 6 : 5));
      lock.style.cssText = 'position:absolute; width:25px; height:22px; background-size:200% 100%;'
        + 'background-position:0 0; image-rendering:pixelated; cursor:pointer; padding:0; border:none;';
      const glow = el('div', '', '');
      glow.style.cssText = 'position:absolute; inset:0; background-size:200% 100%;'
        + 'background-position:100% 0; image-rendering:pixelated; mix-blend-mode:screen;'
        + 'opacity:0.85; pointer-events:none; display:none;';
      glow.style.backgroundImage = 'url(sprites/vanilla/Lock_1.png)';
      lock.appendChild(glow);
      lock.addEventListener('mouseenter', () => { glow.style.display = 'block'; });
      lock.addEventListener('mouseleave', () => { glow.style.display = 'none'; });
      lock.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0 || !this.game) return;
        this.game.player.hbLocked = !this.game.player.hbLocked;   // :43231
        this.game.sfx.play('unlock', 1);                          // PlaySound(22) :43230
        paintLock();
        this.paintHotbarLockState();
      });
      this.vinvLockEl = lock;
      paintLock();
      root.appendChild(lock);
      this.vinvLayoutItems.push({
        el: lock,
        // ★SW-RB11e 2026-09-10 勘误：pushSideToolsUp 与 FX19 图标列同源 = GetBuilderAccsCountToShow
        //  的 totalDrawnIcons（Main.cs:41752-41753 同一变量喂 :41755/:43247/:43289/:48166）——
        //  InfoAccMechShowWires×6+rulerLine+rulerGrid+autoActuator+autoPaint+1+unlockedBiomeTorches
        //  （:48381-48386,门=配饰装备态 plr.rulerLine 等 Player.cs:12899-12915）。原刀误写
        //  visibleRows>=10（装备列行数,另一量纲）：恶魔心+大师档 false-push 锁钮上移,
        //  而原版 push 场景（info 件+拨杆≥10）锁钮不上移 → 与方块替换图标 @(0,23) 重叠。
        pos: () => {
          // ★SW-FX36：判定域改背包∪装备扫描（同 vinvBuildBuilderAccToggles gatesOf）
          const g = this.game
            ? builderAccGateSet((vid) => playerVidCarried(
              this.game!.player.inv.slots, this.game!.player.inv.armor, this.game!.player.inv.accSlotMax, vid))
            : null;
          return hotbarLockXY(!!g && builderAccTotalIcons(
            g, !!this.game?.world.flags.unlockedBiomeTorches) >= 10);
        },
      });
    }

    // ---- 杂项页(EquipPage==2 Main.cs:41886-41932:两列 5 行,行距整型 47) ----
    // miscEquips 序 = 宠物/光源/矿车/坐骑/钩爪(context 19/20/18/17/16;:41905-41931)。
    // ★红队 n1 清偿:原版杂项页无任何 DrawString(:41886-41932 零 DrawString)——
    // 文字标签已摘(2026-09-08)
    for (let m = 0; m < 5; m++) {
      const s = this.vinvMakeSlot('misc', m, INV_SCALE);
      pageMisc.appendChild(s);
      pagePos(s, () => ({ x: MISC_COL_EQUIP_X(this.vinvLayoutCtx!.sw), y: miscRowY(this.vinvLayoutCtx!.num20, m) }));
      const d = this.vinvMakeSlot('miscDye', m, INV_SCALE);
      pageMisc.appendChild(d);
      pagePos(d, () => ({ x: MISC_COL_DYE_X(this.vinvLayoutCtx!.sw), y: miscRowY(this.vinvLayoutCtx!.num20, m) }));
      // 宠物/光源开关勾选框(Main.cs:41934-41935 @(槽左+34,顶-2);TogglePet/Light :40666-40691)
      if (m === 0 || m === 1) {
        const eye = el('button', 'vinv-btn') as HTMLButtonElement;
        eye.style.width = '16px'; eye.style.height = '12px';
        eye.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.heldStack) return;
          this.game.togglePetSlot(m as 0 | 1);
          this.paintPetEye(eye, m as 0 | 1);
          this.showBuffTooltip(eye, eye.dataset.swTipText ?? '', '');   // ★反馈轮6:点击即刷新
        });
        this.paintPetEye(eye, m as 0 | 1);
        pageMisc.appendChild(eye);
        pagePos(eye, () => miscCheckXY({ x: MISC_COL_EQUIP_X(this.vinvLayoutCtx!.sw), y: miscRowY(this.vinvLayoutCtx!.num20, m) }));
      }
      // 矿车升级开关(Main.cs:41963-41995:m==2 矿车槽;unlockedSuperCart 才画=flag2 门
      // :41959/:41963)——SW-FX10 债⑩UI 面：Extra_255 开/Extra_256 关 18×18 全白
      // (宠物勾选框是 White*0.7,矿车框是全白 :41998),点击翻转 enabledSuperCart +
      // PlaySound(12) + 单人即改玩家面(原版 NetMessage 4 同步位=联机面备案),悬停名
      // GameUI.SuperCart{Enabled,Disabled}(:41987-41992 num26 语义)
      if (m === 2) {
        const cart = el('button', 'vinv-btn') as HTMLButtonElement;
        cart.style.width = '18px'; cart.style.height = '18px';
        cart.style.backgroundSize = '100% 100%';
        cart.style.imageRendering = 'pixelated';
        const paintCart = (): void => {
          const on = !!this.game?.player.enabledSuperCart;
          cart.style.backgroundImage = `url(sprites/vanilla/Extra_${on ? 255 : 256}.png)`;
        };
        // ★2026-09-13 反馈轮6:hover 名走自有气泡(:41987-41992 MouseText 域)
        this.vinvBindHoverTip(cart, () =>
          Lang.text(this.game?.player.enabledSuperCart ? 'GameUI.SuperCartEnabled' : 'GameUI.SuperCartDisabled'));
        cart.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.heldStack || !this.game) return;          // mouseItem.IsAir 门(:41968)
          this.game.player.enabledSuperCart = !this.game.player.enabledSuperCart;
          this.game.sfx.play('menuTick', 1);
          paintCart();
        });
        paintCart();
        pageMisc.appendChild(cart);
        pagePos(cart, () => {
          if (!this.vinvLayoutCtx?.cartUnlocked) return null;   // 未解锁不画(:41963)
          return miscCheckXY({ x: MISC_COL_EQUIP_X(this.vinvLayoutCtx.sw), y: miscRowY(this.vinvLayoutCtx.num20, m) });
        });
      }
    }

    // ---- 杂项页 buff 列(Main.cs:42008-42046 EquipPage==2 尾段)——SW-FX10 债④清偿：
    //  开包∧页2 时 buff 块 reflow 入此容器(reflowBuffs),块本体/悬停气泡/右键取消
    //  复用 makeBuffBlock 面（原版两态同源 DrawBuffIcon :44043）。首列 x=sw-84
    //  (num23=sw-92+8)、y=num20+247(num24+=247);块绝对定位:列向左/行向下步距 46,
    //  每列行数随屏高(:42014-42024 miscBuffRowsPerCol)。maxBuffs=22 上限由 BuffState 面
    //  对齐(本仓同 22,超出槽不显示=原版同) ----
    {
      const col = el('div');
      col.style.cssText = 'position:absolute; pointer-events:auto; width:0; height:0;';
      pageMisc.appendChild(col);
      pagePos(col, () => {
        const c = this.vinvLayoutCtx;
        if (!c) return null;
        return { x: MISC_BUFF_X(c.sw), y: c.num20 + MISC_BUFF_Y_OFF };
      });
      this.miscBuffCol = col;
    }

    // ---- 现代合成面板 → 经典竖列表(用户实测二轮退役 Modern 面板) ----
    this.vinvBuildCraft();
    // ---- 设置文字钮(DrawInterface_29_SettingsButton Main.cs:46286-46301:
    //  (sw-110, sh-20) 文本 Lang.inter[62] 悬停放大;与装备列底碰撞 → 左推 140 并
    //  贴列底上方(:46266-46282);点击=开/关设置浮层) ----
    const settingsBtn = el('button', 'vinv-txt') as HTMLButtonElement;
    settingsBtn.textContent = Lang.inter(62);
    settingsBtn.style.cssText = 'font-size:18px; pointer-events:auto; cursor:pointer;'
      + 'background:none; border:none; padding:0; color:#fff; text-shadow:1px 1px 0 #000;'
      + 'transition:transform 80ms linear;'
      // ★反馈轮8:中心锚由 translate(-50%,-50%) 承载——(sw-110,sh-20)=文本中心
      //  (Main.cs:46344 origin=Size/2)。不用 pos 内 offsetWidth:build 期 root 尚
      //  display:none(关包构建)→ 度量为 0,中心退化回左上
      + 'transform:translate(-50%,-50%);';
    settingsBtn.addEventListener('mouseenter', () => { settingsBtn.style.transform = 'translate(-50%,-50%) scale(1.15)'; });
    settingsBtn.addEventListener('mouseleave', () => { settingsBtn.style.transform = 'translate(-50%,-50%)'; });
    settingsBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.onPauseMenu?.();   // 开/关设置浮层(★SW-RB8c 勘误:Open 收背包 :70/Close 回背包 :108,两态互斥)
    });
    this.vinvRoot?.appendChild(settingsBtn);
    this.vinvLayoutItems.push({ el: settingsBtn, pos: () => {
      const c = this.vinvLayoutCtx;
      if (!c) return null;
      // ★反馈轮8:(sw-110, sh-20) 是文本【中心】(Main.cs:46344 origin=Size/2)——
      //   居中由元素 translate(-50%,-50%) 承载,pos 只写中心点
      let px = c.sw - 110, py = c.sh - 20;
      let last = 7;
      for (let s = 9; s >= 3; s--) { const r = this.vinvRowMap.get(`equip:${s}`); if (r !== undefined) { last = r; break; } }
      const colBottom = equipRowY(c.num20, last) + 44.2;
      if (py - 28 <= colBottom) { px -= 140; py = colBottom - 17; }   // :46274-46282 推挤(posY=num3-47+30)
      return { x: px, y: py };
    } });

    // ---- 建筑配件图标列（★SW-FX19 债：DrawBuilderAccToggles Main.cs:48142-48377）----
    this.vinvBuildBuilderAccToggles();

    // ---- 宝箱条(直接叠背包下方;显示随 openChest) ----
    this.vinvBuildChest();
    // ---- 商店货架(SW-FX32 刀①店侧分期二;Main.cs:42500-42532;显示随 npcShopOpen) ----
    this.vinvBuildShop();
    // ---- 重铸原位(Main.cs:42268-42393;显示随 vinvReforgeOpen+自动退出条件) ----
    this.vinvBuildReforge();

    // ---- 住房页(EquipPage==1 DrawNPCHousesInUI Main.cs:42709-42822) ----
    // 查询器 0 号位(NPC_Head_0)+ 在场 NPC 头像槽列;x=sw-92,超 sh-80 换列 -48;
    // 槽底 Back11(选中 Back14),头像 ≤36px 居中;点击接 game.housingMode 游标
    // (Game.ts:11392 世界点击分配链零改动复用)。行集=刀3 共享 housingHeadRows
    pageHousing.dataset.role = 'vinv-housing';
    this.vinvHousingPage = pageHousing;

    // ---- PvP/队伍(DrawPVPIcons Main.cs:43389-43443;本仓常开语义沿用 classic) ----
    {
      const sword = el('button', 'vinv-btn sw-btn') as HTMLButtonElement;
      sword.style.width = '36px'; sword.style.height = '37px';
      sword.style.backgroundImage = 'url(sprites/vanilla-ui/UI_PVP_0.png)';
      sword.style.backgroundSize = '400% 600%';
      // 视觉尺寸沿用 classic 帧制(36×37 @400%×600%;refreshPvpButtons 帧算依赖),
      // 仅锚点取原版位(pvpSwordXY);原版 76×32×0.6 整帧绘制=帧制债
      sword.addEventListener('mouseenter', () => this.refreshPvpButtons());
      sword.addEventListener('mouseleave', () => this.refreshPvpButtons());
      sword.addEventListener('mousedown', (e) => { e.stopPropagation(); this.pvpToggleHostile(); });
      root.appendChild(sword);
      this.pvpSwordBtn = sword;
      // ★红队 n4:住房页 NPC 列达第 4 列(num3≤-144)时原版隐藏 PvP/队伍(:42761-42763)
      const housingPvpHidden = (): boolean => {
        if (this.vinvPageCurrent !== 1 || !this.vinvLayoutCtx) return false;
        const c = this.vinvLayoutCtx;
        const posA = housingSlotPositions(this.vinvHousingSlotEls.length, c.sw, c.num20, c.sh);
        return new Set(posA.map((p) => p.x)).size >= 4;
      };
      pos(sword, () => {
        const c = this.vinvLayoutCtx!;
        if (housingPvpHidden()) return null;
        const p = pvpSwordXY(c.sw, c.mH, this.vinvPageCurrent === 2);
        return { x: p.x, y: p.y };
      });
      sword.addEventListener('mouseleave', () => this.hideBuffTooltip());   // ★反馈轮6:气泡隐藏面
      for (let i = 0; i < 6; i++) {
        const cell = el('button', 'vinv-btn sw-btn') as HTMLButtonElement;
        cell.style.width = '20px'; cell.style.height = '20px';
        const icon = el('div');
        icon.style.cssText = 'position:absolute; left:2px; top:1px; width:16px; height:18px;'
          + `background:url(sprites/vanilla-ui/UI_PVP_1.png); background-size:600% 100%;`
          + `background-position:${PVP_TEAM_BUTTONS[i].team * 20}% 0%; image-rendering:pixelated; pointer-events:none;`;
        cell.style.position = 'absolute';
        cell.appendChild(icon);
        cell.addEventListener('mouseenter', () => this.refreshPvpButtons());
        cell.addEventListener('mouseleave', () => { this.refreshPvpButtons(); this.hideBuffTooltip(); });   // ★反馈轮6
        cell.addEventListener('mousedown', (e) => { e.stopPropagation(); this.pvpSetTeam(PVP_TEAM_BUTTONS[i].team); });
        root.appendChild(cell);
        this.pvpTeamBtns.push(cell);
        pos(cell, () => {
          const c = this.vinvLayoutCtx!;
          if (housingPvpHidden()) return null;
          return pvpTeamXY(c.sw, c.mH, i, this.vinvPageCurrent === 2);
        });
      }
    }

    // ★挂载序:在 hotbarEl 之后(buildHud 已跑)——关包态全局 slotEl(0-9) 首匹配=热键栏
    this.root.appendChild(root);
    this.vinvResizeHandler = () => { this.vinvLayoutSig = ''; this.layoutVanilla(); };
    window.addEventListener('resize', this.vinvResizeHandler);
    this.layoutVanilla();
  }

  /** 垃圾桶槽(Main.cs:43073-43090)。行为=classic 同面(Alt+聊天 tag/Shift 回包/
   *  放置/取回),复制自 buildInventoryPanel 段(classic 区零改动红线)。
   *  ★红队 m3 清偿:盒 52px × scale(0.85)=视觉 44.2(旧 44 盒×0.85=37.4 双重缩放) */
  private vinvBuildTrash(): HTMLElement {
    const trash = el('div', 'sw-slot trash sw-trash');
    trash.style.cssText = 'width:52px; height:52px; pointer-events:auto;'
      + 'background-image:url(sprites/vanilla/Inventory_Back7.png);';
    trash.addEventListener('contextmenu', (e) => e.preventDefault());
    trash.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (!e.button && e.altKey && this.game.chatInput?.isOpen && this.game.player.inv.trash) {
        this.game.insertChatItemTag(vidOf(this.game.player.inv.trash.id));
        this.game.sfx.play('menuTick', 1);
        return;
      }
      if (!e.button && e.shiftKey && !e.altKey && !e.ctrlKey && this.game.player.inv.trash) {
        const t = this.game.player.inv.trash;
        const left = this.game.player.inv.add(t.id, t.stack, t.prefix, (t as { placeStyle?: number }).placeStyle);
        if (left < t.stack) {
          this.game.player.inv.trash = left > 0 ? { ...t, stack: left } : null;
          this.game.sfx.play(coinIndexOf(t.id) >= 0 ? 'coin' : 'pickup', 1);
          this.game.sfx.play('menuTick', 1);
          this.paintTrash();
          this.refreshAll();
          return;
        }
      }
      if (this.heldStack) {
        this.placeTrash();
      } else if (this.game.player.inv.trash) {
        this.heldStack = this.game.player.inv.trash;
        this.game.player.inv.trash = null;
        this.game.sfx.play('pickup', 1);
        this.paintTrash();
      }
      this.refreshAll();
    });
    this.trashEl = trash;
    this.vinvLayoutItems.push({
      el: trash,
      pos: () => {
        const t = trashXY(!!this.vinvLayoutCtx?.cosUiVisible);   // ★SW-RB13b:43078 门=ChestOrShopUIVisible(网格态回位 448,258/0.85)
        return { x: t.x, y: t.y };
      },
    });
    // scale 换档(0.85/0.755)在 layoutVanilla 尾统一处理
    this.vinvTrashEl = trash;
    return trash;
  }

  private vinvTrashEl: HTMLElement | null = null;

  /** 布局重排(签名变化才写 style;每帧调用无害)。签名=视口|追加槽显隐|开箱态 */
  private layoutVanilla(): void {
    const root = this.vinvRoot;
    if (!root || !this.game) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const K = vanillaScaleFor(vw, vh, options.data.uiScale);
    const sw = vw / K, sh = vh / K;
    const inv = this.game.player.inv;
    const hasAt = (slot: number, dyeSlot: number): boolean => !!inv.armor[slot] || !!inv.dye[dyeSlot];
    const heartShown = (inv.extraAccessory && (inv.gateExpert || inv.gateMaster)) || hasAt(8, 8);
    const masterShown = inv.gateMaster || hasAt(9, 9);
    const chestOpen = !!this.openChest || this.game.npcShopOpen;
    // ★SW-RB13b(2026-09-11):ChestOrShopUIVisible(Main.cs:3035-3046)=chest/shop 态
    //   ∧ !NewCraftingUI.Visible ∧ !PipsUseGrid——网格态回位垃圾桶/图鉴/表情
    //   (43078/43103/43158 门读该谓词,非 chestOpen 裸读);QuickStack/Sort 仍走
    //   chest==-1 && npcShop==0 裸门(:42548/42586)不折 PipsUseGrid。
    //   ★SW-FX41:首支再加 !NewCraftingUI.Visible(Main.cs:3037 窗可见恒 false)
    const cosUiVisible = chestOpen && !this.vinvPipsUseGrid && !this.vinvModernCraftOpen;
    const visibleRows = 8 + (heartShown ? 1 : 0) + (masterShown ? 1 : 0);
    // ★SW-FX10 债⑨清偿：mH 联动真实小地图态（Main.cs:46537-46561 DrawInterface_16_MapOr
    // Minimap：mapEnabled 关→mH=0 早退；全屏地图开/mapStyle≠1→mH=0；仅 mapStyle==1 且
    // 非全屏 → mH=256 再钳 sh-PushUp）。本仓 mapEnabled 无独立设置面（默认开）。
    // PushUp=610 当恶魔心/大师槽可显示(Main.cs:3063-3071;PushEquipmentAreaUp 设置
    // 本仓无,取 0=偏差备案);mH 可为负=原版同款
    const minimapOn = this.game.renderer.mapStyle === 1 && !this.game.mapFullscreen();
    const mH = mHOf(minimapOn, sh, heartShown || masterShown ? 610 : 600);
    const num20 = equipAreaTop(sh, mH, visibleRows);
    root.style.transformOrigin = 'top left';
    root.style.transform = `scale(${K})`;
    this.vinvLayoutCtx = { sw, sh, mH, num20, chestOpen, cosUiVisible, visibleRows, minimapOn, cartUnlocked: this.game.superCartUnlocked() };
    this.vinvComputeRows(heartShown, masterShown);
    // 签名含 uiScale(★红队 MINOR-4:K 依赖 uiScale,漏签 = 改缩放右锚列不重排);
    // ★SW-FX10:再含 minimapOn(mH 变 → num20/页签/右锚列全体位移)与矿车解锁(开关框显隐)
    // ★SW-RB13b:再含 PipsUseGrid(网格态翻转 → 箱条吞门/变体回位 pos 闭包须重跑——
    //   签名不变则早退跳过整段 pos 循环,FX28 ChestUI.cs:81 门=死码,故必须入签)
    // ★SW-FX32:再含储蓄行可见旗(总储蓄>0 + 逐仓有币——储蓄行/四银行图标 pos 门
    //   的输入;银行间搬钱不翻 chestOpen 旗,不入签 = 图标滞留)
    const savBanks = this.game.coinSavingsByBank();
    // ★SW-FX36：建筑配件旗位门入签——原版 DrawBuilderAccToggles（Main.cs:48142-48377）
    //   每帧条件绘制,拾取/丢弃即时显隐;本仓布局签名缓存不含门输入 ⇒ 背包拾入 2799
    //   等后网格/喷漆/线材档滞留不显（FX36 探针实测）。门=背包∪装备旗位（UpdateEquips
    //   :12997-13004 面）;门变化=低频事件,入签触发一次整排代价可忽略。
    //   rulerLine 恒真（ResetEffects :18809）不入签。
    // ★SW-FX41:再含 modern 窗开态(窗开 → 切换钮/就近箱钮换锚 + 经典合成面隐藏 +
    //   ChestOrShopUIVisible 折叠,Main.cs:42418-42456/:3037)
    const bg = builderAccGateSet((vid) => playerVidCarried(inv.slots, inv.armor, inv.accSlotMax, vid));
    // ★反馈轮7:unlockedBiomeTorches 入签(:48166 start.Y+=24*torchGodIcons 列体位移
    //   + :48370 炬图标显隐)——旗翻(炬神事件结算)不入签则图标列滞留旧位与炬图标重叠
    const bgSig = `${bg.rulerGrid ? 1 : 0}${bg.autoActuator ? 1 : 0}${bg.autoPaint ? 1 : 0}${bg.infoAccMechShowWires ? 1 : 0}${this.game.world.flags.unlockedBiomeTorches ? 1 : 0}`;
    const sig = `${Math.round(vw)}x${Math.round(vh)}|${options.data.uiScale}|${heartShown ? 1 : 0}${masterShown ? 1 : 0}|${chestOpen ? 1 : 0}|${minimapOn ? 1 : 0}${this.game.superCartUnlocked() ? 1 : 0}|${this.vinvPipsUseGrid ? 1 : 0}|${savBanks[0] > 0 ? 1 : 0}${savBanks[1] > 0 ? 1 : 0}${savBanks[2] > 0 ? 1 : 0}${savBanks[3] > 0 ? 1 : 0}|${bgSig}|${this.vinvModernCraftOpen ? 1 : 0}|${this.vinvGuideMenuOpen ? 1 : 0}|${this.vinvReforgeOpen ? 1 : 0}`;   // ★刀19:重铸态入签(vinvReforgeVisible pos 门随拍重估)
    if (sig === this.vinvLayoutSig) return;
    this.vinvLayoutSig = sig;
    for (const it of this.vinvLayoutItems) {
      const p = it.pos();
      if (p) {
        it.el.style.display = '';
        it.el.style.left = `${p.x}px`;
        it.el.style.top = `${p.y}px`;
      } else {
        it.el.style.display = 'none';
      }
    }
    // 垃圾桶 scale 换档(Main.cs:43078-43083 开箱 0.755;★SW-RB13b 门=ChestOrShopUIVisible 含 !PipsUseGrid)
    if (this.vinvTrashEl) this.vinvTrashEl.style.transform = `scale(${trashXY(cosUiVisible).scale})`;
  }

  /** 装备列追加槽可见行号表(重编号;未显示不入表=隐藏不占行,:42092-42113) */
  private vinvComputeRows(heartShown: boolean, masterShown: boolean): void {
    this.vinvRowMap.clear();
    for (let s = 0; s < 8; s++) this.vinvRowMap.set(`equip:${s}`, s);
    for (let s = 10; s < 18; s++) this.vinvRowMap.set(`vanity:${s}`, s - 10);
    for (let s = 0; s < 8; s++) this.vinvRowMap.set(`dye:${s}`, s);
    if (heartShown) {
      this.vinvRowMap.set('equip:8', 8);
      this.vinvRowMap.set('vanity:18', 8);
      this.vinvRowMap.set('dye:8', 8);
    }
    if (masterShown) {
      const r = heartShown ? 9 : 8;
      this.vinvRowMap.set('equip:9', r);
      this.vinvRowMap.set('vanity:19', r);
      this.vinvRowMap.set('dye:9', r);
    }
  }

  /** vanilla 布局补绘(refreshAllNow 守卫调用):网格第 0 行+inv 族槽底覆写+页码 */
  private paintVanillaInvSlots(): void {
    if (!this.vinvRoot || !this.game) return;
    this.layoutVanilla();
    const inv = this.game.player.inv;
    const backOverride = 'url(sprites/vanilla/Inventory_Back.png)';
    // 原版开包格底 = Inventory_Back(paintSlotChrome 经典态写 Back20;收藏件 Back10 让行)
    const paintInvSlot = (idx: number): void => {
      const s = this.vinvSlots.get(`inv:${idx}`);
      if (!s) return;
      this.paintSlot(s, inv.slots[idx]);
      this.paintSlotChrome(s, 'inv', idx);
      const cur = s.style.getPropertyValue('--slot-bgimg');
      if (!cur.includes('Inventory_Back10') && cur !== backOverride) {
        s.style.setProperty('--slot-bgimg', backOverride);
      }
    };
    for (let i = 0; i < 50; i++) paintInvSlot(i);
    for (let k = 0; k < 4; k++) { paintInvSlot(COIN_START + k); paintInvSlot(AMMO_START + k); }
    this.vinvApplyPage();
    this.vinvRefreshHousing();
    this.vinvRefreshCraft();
    this.vinvUpdateChestName();
    this.vinvRefreshShop();   // ★SW-FX32:商店货架内容+头部回写(Main.cs:42500-42532)
    this.vinvUpdateReforge();
    this.paintVanillaDefense();
  }

  /** 住房页槽列同步(EquipPage==1;Diff 重建——行集仅在 NPC 进出变化时重建,
   *  选中态每刷改背景)。行为面 = HousingPanel.setCursor 同款(menuTick+游标) */
  private vinvHousingPage: HTMLElement | null = null;
  private vinvHousingSlotEls: Array<{ el: HTMLElement; img: HTMLImageElement; key: string }> = [];
  private vinvHousingSig = '-init';   // 哨兵:空世界(sig='')也要首建查询器槽
  private vinvRefreshHousing(): void {
    const page = this.vinvHousingPage;
    if (!page || !this.game) return;
    const rows = housingHeadRows(this.game);
    // ★红队 MINOR-6 清偿:携带 NPC 离场 → 降级查询器(HousingPanel.refresh 同语义,
    // :44649-44651)——否则 assign 游标持续吞世界点击
    const hm = this.game.housingMode;
    if (hm && hm.kind === 'assign' && !rows.some((r) => r.npcKey === hm.npcKey)) {
      this.game.housingMode = null;
    }
    const sig = rows.map((r) => r.npcKey).join(',');
    if (sig !== this.vinvHousingSig) {
      this.vinvHousingSig = sig;
      // ★红队 MAJOR-3 清偿:重建前按元素身份滤除旧布局项(旧实现只 remove DOM——
      // vinvLayoutItems 无界增长+死节点每拍求 pos)
      const dead = new Set(this.vinvHousingSlotEls.map((s) => s.el));
      this.vinvLayoutItems = this.vinvLayoutItems.filter((it) => !dead.has(it.el));
      for (const s of this.vinvHousingSlotEls) s.el.remove();
      this.vinvHousingSlotEls = [];
      const mk = (key: string, headPath: string, name: string, onPick: () => void): void => {
        const b = el('button', 'vinv-btn') as HTMLButtonElement;
        b.style.width = '52px'; b.style.height = '52px';
        b.style.transform = 'scale(0.85)';   // ★红队 m4:原版槽 52×0.85=44.2(Main.cs:42787-42790)
        b.style.transformOrigin = 'top left';
        b.style.backgroundImage = 'url(sprites/vanilla/Inventory_Back11.png)';
        b.style.backgroundSize = '100% 100%';
        this.vinvBindHoverTip(b, () => name);   // ★2026-09-13 反馈轮6:自有气泡替代 title
        const im = el('img') as HTMLImageElement;
        im.draggable = false;
        im.style.cssText = 'position:absolute; inset:0; margin:auto; max-width:36px; max-height:36px; image-rendering:pixelated;';
        im.src = headPath;
        b.appendChild(im);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          this.game.sfx.play('menuTick', 1);
          onPick();
          this.vinvPaintHousingSelection();
        });
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.game.housingMode) { this.game.housingMode = null; this.game.sfx.play('menuTick', 1); }
          this.vinvPaintHousingSelection();
        });
        const idx = this.vinvHousingSlotEls.length;
        page.appendChild(b);
        this.vinvLayoutItems.push({
          el: b,
          pos: () => {
            const c = this.vinvLayoutCtx;
            if (!c) return null;
            return housingSlotPositions(this.vinvHousingSlotEls.length, c.sw, c.num20, c.sh)[idx] ?? null;
          },
        });
        this.vinvHousingSlotEls.push({ el: b, img: im, key });
      };
      mk('__query__', 'sprites/vanilla/NPC_Head_0.png', Lang.inter(8),
        () => { this.game.housingMode = { kind: 'query' }; });   // 0 号=查询器(:41506)
      for (const r of rows) {
        mk(r.npcKey, `sprites/vanilla/NPC_Head_${r.headIndex}.png`, r.name,
          () => { this.game.housingMode = { kind: 'assign', npcKey: r.npcKey }; });
      }
      this.vinvLayoutSig = '';   // 行数变化 → 重排
      this.layoutVanilla();
    }
    this.vinvPaintHousingSelection();
  }

  /** 选中态:游标匹配槽 = Back14(Main.cs:42796 焦点帧) */
  private vinvPaintHousingSelection(): void {
    const cur = this.game?.housingMode ?? null;
    for (const s of this.vinvHousingSlotEls) {
      const active = cur && (s.key === '__query__'
        ? cur.kind === 'query'
        : cur.kind === 'assign' && cur.npcKey === s.key);
      s.el.style.backgroundImage = `url(sprites/vanilla/Inventory_Back${active ? 14 : 11}.png)`;
      s.img.style.opacity = active ? '0.4' : '1';   // 携带态灰显(HousingPanel.draw 同语义)
    }
  }

  private vinvCraftFocusV = 0;
  private vinvCraftAvailV: Array<{ r: VanillaRecipeLike; count: number }> = [];
  // ★SW-FX38 吸附动画状态(CraftingUI.cs:376-404 DrawRecipes_AdjustRecipeOffsetSnappy):
  //   glideY ≡ availableRecipeY[focusRecipe](焦点行当前吸附偏移,全列表重锚不变式
  //   availableRecipeY[i]=glideY+(i−focus)·65 :394-399);fastScroll ≡ PipsFastScroll/
  //   recFastScroll(Main.cs:1794/CraftingUI.cs:523,关背包每拍置位 Main.cs:46428);
  //   glideAcc = 60fps 步进配额(原版 Frame Skip 缺省拍频,高刷屏防 2× 快进)。
  private vinvCraftGlideY = 0;
  private vinvCraftFastScroll = false;
  private vinvCraftGlideAcc = 0;
  /** ★SW-RB14d（FX38-F2）：滚轮累计器（px,含余数留置——ScrollWheelValue 跨事件
   *  累计语义;teardown 清零） */
  private vinvCraftWheelPendPx = 0;

  // ---- ★SW-FX41 modern 合成窗状态域(NewCraftingUI.cs 字段面 1:1) ----
  /** Visible ≡ _ui.CurrentState != null(:240) */
  private vinvModernCraftOpen = false;
  /** _filter(站点滤器,craftingGrid CraftingTileFilter 同形) */
  private vinvModernCraftFilter: CraftingTileFilter | null = null;
  /** _openedWithoutFilter(OnActivate :907-909 置位) */
  private vinvModernOpenedWithoutFilter = false;
  /** _filterer.ActiveFilters(11 类筛选条激活集,UICreativeItemsInfiniteFilteringOptions 单选面) */
  private vinvModernActive: FilterKind[] = [];
  /** _searchBar 内容(OnActivate :912 SetContents("") 清) */
  private vinvModernSearch = '';
  /** _recipes 条目池(ResetRecipes :575-587 清;UpdateContents :589-634 增量建) */
  private vinvModernEntries: Array<{ r: VanillaRecipeLike; count: number; seen: boolean }> = [];
  /** _selectedRecipeIndex(=配方条目 r 引用;OnActivate :910 预选 availableRecipe[focusRecipe]) */
  private vinvModernSelected: VanillaRecipeLike | null = null;
  /** 滚动位(UIScrollbar._viewPosition) */
  private vinvModernViewPos = 0;

  // ---- 合成区(★2026-09-08 用户实测二轮:原版无面板底/无搜索框,合成=左下角
  //  竖向列表;Modern 网格面板整体退役)。权威:CraftingUI.DrawRecipesList
  //  (CraftingUI.cs:161-318)+ Main.cs:42239-42250(adjY/middleY 分档)+
  //  HoverOverCraftingItemButton(Main.cs:42971-43036,点非焦点=居中+音12,
  //  点焦点=合成,Shift×10)+ DrawRecipes_AdjustRecipeOffsetSnappy(:371-396)。
  //  ★SW-FX38(2026-09-11)清偿旧登记偏差:吸附动画已按 :376-404 落地(glideY/fastScroll
  //  + 60fps 步进配额,见上方字段注)——旧"瞬时重排替代"退役;鱼眼 scale/alpha/
  //  x 位移逐式还原。inventoryBack.A 取 150(原版 LoadSettings 初值)。
  private vinvBuildCraft(): void {
    // ★2026-09-13 用户实测:listHit 巨带(100×700)罩住背包左列=滚轮/点击死区 →
    //  整体移除;滚轮只绑配方格(vanilla=悬停配方列才滚)
    // 制作标题(Lang.inter[25] @(76,414+adjY);:169-173)
    const title = el('div', 'vinv-txt', Lang.inter(25));
    title.style.fontSize = '14px';
    this.vinvRoot?.appendChild(title);
    this.vinvCraftTitleEl = title;
    // 材料行容器(底部一行,槽位绝对定位)
    const mats = el('div');
    mats.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
    this.vinvRoot?.appendChild(mats);
    this.vinvCraftMatEl = mats;
    // 就近箱参与制作开关((94,490+adjY);Main.cs:42440-42443,ChestCraft 32×34;
    // 网格切换钮 (94,450+adjY) = SW-FX30 刀②已建(vinvBuildGridToggle),经典网格视图同刀落地)
    const nearImg = document.createElement('img');
    nearImg.draggable = false;
    nearImg.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
    const syncNear = (): void => { nearImg.src = `sprites/vanilla-ui/UI_ChestCraft_${options.data.craftFromNearbyChests ? 0 : 2}.png`; };
    syncNear();
    const nearBtn = el('button', 'vinv-btn') as HTMLButtonElement;
    nearBtn.style.cssText = 'width:32px; height:34px; padding:0;';
    nearBtn.appendChild(nearImg);
    // ★2026-09-13 用户要求:hover 态(帧 1/3)+ 自有气泡(title 原生气泡慢)
    nearBtn.addEventListener('mouseenter', () => {
      nearImg.src = `sprites/vanilla-ui/UI_ChestCraft_${options.data.craftFromNearbyChests ? 1 : 3}.png`;
      this.showBuffTooltip(nearBtn, Lang.text(options.data.craftFromNearbyChests
        ? 'GameUI.CraftFromNearbyChestsOn' : 'GameUI.CraftFromNearbyChestsOff'), '');
    });
    nearBtn.addEventListener('mouseleave', () => {
      syncNear();
      this.hideBuffTooltip();
    });
    nearBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      void options.set('craftFromNearbyChests', !options.data.craftFromNearbyChests);
      this.game.sfx.play('menuTick', 1);
      // ★SW-FX41:窗开态 = NewCraftingUI.RefreshGrid(CraftingUI.cs:350-352 →
      //   NewCraftingUI.cs:988-994 ResetRecipes)——就近箱集变化即重排窗格
      if (this.vinvModernCraftOpen) { this.vinvModernResetRecipes(); this.vinvUpdateModernCraft(); }
    });
    options.onChange(() => syncNear());
    this.vinvRoot?.appendChild(nearBtn);
    this.vinvLayoutItems.push({ el: nearBtn, pos: () => {
      const c = this.vinvLayoutCtx;
      if (!c) return null;
      // ★刀19:向导态整隐(Main.cs:42440 !InGuideCraftMenu 门/NewCraftingUI.cs:496 同门)
      if (this.vinvGuideMenuOpen) return null;
      // ★SW-FX41:窗开态 = 窗内就近箱钮锚(DrawChildren :495-499 num2+40 → (82|122,285);
      //   经典锚 (94,490+adjY) 在 else 分支,窗开不画——同一对象换锚,两态互斥)
      if (this.vinvModernCraftOpen) {
        return mcraftWindowToggleXY(!!this.game?.world?.isJourney).nearby;
      }
      return { x: 94, y: 490 + this.vinvCraftAdjY(c.sh) };
    } });
    this.vinvLayoutItems.push({ el: title, pos: () => {
      const c = this.vinvLayoutCtx;
      if (!c || !this.vinvClassicCraftVisible()) return null;   // ★SW-FX41:窗开不画(:42418 else 支)
      return { x: 76, y: 414 + this.vinvCraftAdjY(c.sh) };
    } });
    this.vinvLayoutItems.push({ el: mats, pos: () => this.vinvClassicCraftVisible() ? { x: 0, y: 0 } : null });   // ★SW-FX41:窗开隐藏(材料行 = 窗详情浮层替代)
    // ---- 网格切换钮 + 经典网格视图(★SW-FX30 刀②:DrawGridToggle CraftingUI.cs:267-330 +
    //      DrawRecipesGrid CraftingUI.cs:446-571;债#2 清偿) ----
    this.vinvBuildGridToggle();
    this.vinvBuildCraftGrid();
    this.vinvBindGridWheel();
    // ---- ★SW-FX41 modern 窗族(NewCraftingUI.cs:302-501;债#2-modern P2-1/P2-4 清偿) ----
    this.vinvBuildModernCraft();

    // ---- ★刀19:向导槽(经典位 Main.cs:42401-42415 @(73,331+num52) ctx7 0.85)+
    //      DrawGuideCraftText(:42901-42924)——仅向导态∧窗关可见(:42401 else-if 门) ----
    {
      const root = this.vinvRoot;
      if (!root) return;
      const cgSlot = el('div', 'sw-slot');
      cgSlot.style.cssText = 'position:absolute; width:52px; height:52px; background-image:none;'
        + '--slot-bgimg:url(sprites/vanilla/Inventory_Back.png); transform:scale(0.85);'
        + 'transform-origin:top left; pointer-events:auto;';
      cgSlot.addEventListener('contextmenu', (e) => e.preventDefault());
      cgSlot.addEventListener('mousedown', (e) => {
        this.guideSlotMouseDown(e as MouseEvent, () => { this.vinvPaintGuideCraft(); this.vinvRefreshCraft(); });
      });
      root.appendChild(cgSlot);
      this.vinvGuideSlotClassicEl = cgSlot;
      this.vinvLayoutItems.push({ el: cgSlot, pos: () => {
        const c = this.vinvLayoutCtx;
        if (!c || !this.vinvGuideMenuOpen || this.vinvModernCraftOpen) return null;
        return { x: 73, y: 331 + this.vinvCraftAdjY(c.sh) };
      } });
      const cgTxt = el('div', 'vinv-txt');
      cgTxt.style.cssText += 'position:absolute; font-size:14px; white-space:normal; line-height:26px; width:300px;';
      root.appendChild(cgTxt);
      this.vinvGuideClassicTextEl = cgTxt;
      this.vinvLayoutItems.push({ el: cgTxt, pos: () => {
        const c = this.vinvLayoutCtx;
        if (!c || !this.vinvGuideMenuOpen || this.vinvModernCraftOpen) return null;
        // 空=inter[24] @(槽+50,+12);有件=两行 @(+50,−2) 起(原文 +12−14=−2,+26 步距)
        return { x: 123, y: 329 + this.vinvCraftAdjY(c.sh) };
      } });
    }
  }

  /** 合成视图切换钮(DrawGridToggle CraftingUI.cs:267-330,Main.cs:42437-42439
   *  @(94,450+adjY) 居中锚 32×34 CraftToggle 六帧)。★本仓 top-left 约定 = 与同列
   * 就近箱钮(7328)一致的原版钮心坐标 +16/+17 偏差备案(两钮成列对齐;原版 origin=size/2)。
   *  帧算式 = craftToggleFrame(modernVisible≡false, grid, hover):list 态 2/3、grid 态
   *  0/1、modern 窗态 4/5(NewCraftingUI 未建,分支缺席=分期债)。左键 classic 支 =
   *  PipsUseGrid 翻转(:294-306)+PlaySound(12);modern 支(:308-316 NewCraftingUI.
   *  ToggleInInventory)=分期,本刀仅保留声效面。右键 = CraftingGridControl 循环
   *  (:322-331)+PlaySound(12)+options 持久化(Main.cs:4295 CraftingControlMode;
   *  原版右键不即时 SaveSettings,本仓 options.set 即时落盘=既有约定面)。悬停 =
   *  ±15 盒(:275)+CraftingWindowTextTipKey(:91-97)+DoStatefulTickSound 沿音
   *  (Main.cs:3333-3344)。Recipes 页金标指示条(Utils.cs:2901-2910,OurFavoriteColor
   *  Main.cs:886)=本仓恒 Recipes 页(无 Banners pip)→ 恒画,画于钮下层(:275-278 先条后钮)。 */
  private vinvBuildGridToggle(): void {
    const root = this.vinvRoot;
    if (!root) return;
    // 金标指示条(32×20 canvas;16 行 2px 渐变 α=(1-k/16)·0.6 + 实心 32×4;条顶=钮心)
    const bar = document.createElement('canvas');
    bar.width = 32; bar.height = 20;
    const g = bar.getContext('2d');
    if (g) {
      for (const row of craftSelectedBarRows()) {
        g.fillStyle = `rgba(${CRAFT_BAR_COLOR},${row.a})`;
        g.fillRect(0, row.y, 32, row.h);
      }
      g.fillStyle = `rgb(${CRAFT_BAR_COLOR})`;
      g.fillRect(0, CRAFT_BAR_SOLID.y, 32, CRAFT_BAR_SOLID.h);
    }
    bar.style.cssText = 'position:absolute; width:32px; height:20px; image-rendering:auto;'
      + 'pointer-events:none; z-index:0;';
    root.appendChild(bar);
    this.vinvLayoutItems.push({ el: bar, pos: () => {
      const c = this.vinvLayoutCtx;
      if (!c) return null;
      // ★SW-FX41:窗开态锚随窗内切换钮(DrawChildren :486-499 (42|82,285);:275-278
      //   指示条在钮下层恒画——Recipes 页本仓恒真)
      if (this.vinvModernCraftOpen) {
        const t = mcraftWindowToggleXY(!!this.game?.world?.isJourney).toggle;
        return { x: t.x, y: t.y + CRAFT_BAR_TOP_OFF };
      }
      return { x: 94, y: 450 + this.vinvCraftAdjY(c.sh) + CRAFT_BAR_TOP_OFF };
    } });
    // 钮本体(Craft_Toggle 六帧贴图;悬停 ±15 盒≈整钮)
    const btn = el('button', 'vinv-btn') as HTMLButtonElement;
    btn.style.cssText = 'width:32px; height:34px; padding:0; z-index:1;';
    const img = document.createElement('img');
    img.draggable = false;
    img.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
    btn.appendChild(img);
    this.vinvGridToggleImg = img;
    this.vinvSyncGridToggle();
    // ★2026-09-13 用户要求:hover 名走自有气泡(showBuffTooltip),弃原生 title(慢)
    btn.addEventListener('mouseenter', () => {
      this.vinvGridToggleHover = true;
      this.vinvSyncGridToggle();                        // num += flag.ToInt()(:291)
      this.game.sfx.play('menuTick', 1);                // DoStatefulTickSound(Main.cs:3333-3344)沿
      this.showBuffTooltip(btn, Lang.text(craftingWindowTextTipKey(options.data.craftingGridControl)), '');
    });
    btn.addEventListener('mouseleave', () => {
      this.vinvGridToggleHover = false;
      this.vinvSyncGridToggle();
      this.hideBuffTooltip();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button === 2) {
        // 右键支(:322-331):Classic↔Modern 循环 + PlaySound(12)
        void options.set('craftingGridControl',
          cycleCraftingGridControl(options.data.craftingGridControl));
        this.showBuffTooltip(btn, Lang.text(craftingWindowTextTipKey(options.data.craftingGridControl)), '');
        this.game.sfx.play('menuTick', 1);
        return;
      }
      if (e.button !== 0) return;
      // 左键支(:294-321):!TryChangePipsPage(Recipes) 恒 false(无 Banners pip=恒已该页)
      //   → 走切换;flag2(classic 支) = PipsUseGrid 翻转;NewCraftingUI.Close(quiet)=窗未建恒 no-op
      if (options.data.craftingGridControl === 'classic') {
        // ★SW-FX41:classic 左键支(:299-306)先 NewCraftingUI.Close(quiet:true,
        //   returnToInventory:true) 再翻网格——窗开态右键切回 classic 后左键可达此臂
        this.vinvCloseModernCraft(true);
        this.vinvPipsUseGrid = !this.vinvPipsUseGrid;   // :306
        if (!this.vinvPipsUseGrid) this.vinvCraftRecStart = 0;   // !PipsUseGrid → recStart=0(Main.cs:43926-43929)
        this.vinvSyncGridToggle();
        this.vinvUpdateCraftGrid();
        // ★SW-RB13b:网格态翻转必须重排——ChestUI.cs:81 吞箱条三门(名/槽/钮 pos 闭包)
        //   与变体回位闭包只在 layoutVanilla pos 循环里求值;不重排=开箱+开网格态
        //   箱条滞留屏上与网格叠画(vinvUpdateReforge 同族教训:显隐依赖可变状态必须触发 relayout)
        this.vinvLayoutSig = '';
        this.layoutVanilla();
      } else {
        // ★SW-RB13b:modern 左键副效应面(:310-315 Main.PipsUseGrid=false 先于
        //   ToggleInInventory)——PipsUseGrid=false 使已开网格可经切换钮关闭
        this.vinvPipsUseGrid = false;
        this.vinvCraftRecStart = 0;                     // !PipsUseGrid → recStart=0(Main.cs:43926-43929)
        this.vinvSyncGridToggle();
        this.vinvUpdateCraftGrid();
        this.vinvLayoutSig = '';
        this.layoutVanilla();
        // ★SW-FX41 P2-2:modern 左键支(:308-316)ToggleInInventory——开/关 NewCraftingUI
        //   窗(:926-936 Visible?Close(returnToInventory:true):Open)
        this.vinvToggleModernCraft(false);
      }
      // 声效面(:321 PlaySound(12) 在两支后照走;窗开合音 10/11 由 Open/Close 各自放)
      this.game.sfx.play('menuTick', 1);                // PlaySound(12)(:321)
    });
    root.appendChild(btn);
    this.vinvLayoutItems.push({ el: btn, pos: () => {
      const c = this.vinvLayoutCtx;
      if (!c) return null;
      // ★SW-FX41:窗开态 = 窗内切换钮锚(NewCraftingUI.DrawChildren :486-499 num2=42/
      //   旅程 82,num3=285——Main.cs:42424-42443 经典锚 (94,450+adjY) 在 else 分支不画)
      if (this.vinvModernCraftOpen) {
        return mcraftWindowToggleXY(!!this.game?.world?.isJourney).toggle;
      }
      // ★刀19:向导态切换钮上移(Main.cs:42438 num67=InGuideCraftMenu ? 300 : 450)+num52)
      if (this.vinvGuideMenuOpen && !this.vinvModernCraftOpen) return { x: 94, y: 300 + this.vinvCraftAdjY(c.sh) };
      return { x: 94, y: 450 + this.vinvCraftAdjY(c.sh) };
    } });
  }

  /** 帧同步(craftToggleFrame:grid 态 0/1,list 态 2/3,modern 窗态 4/5——★SW-FX41
   *  NewCraftingUI.Visible 支接线,:281-285 modernVisible=窗开态) */
  private vinvSyncGridToggle(): void {
    const img = this.vinvGridToggleImg;
    if (!img) return;
    const f = craftToggleFrame(this.vinvModernCraftOpen, this.vinvPipsUseGrid, this.vinvGridToggleHover);
    img.src = `sprites/vanilla-ui/UI_Craft_Toggle_${f}.png`;
  }

  // =====================================================================
  // ★SW-FX41(2026-09-12)modern 合成窗(P2-1 窗体本体/P2-4 11 类筛选条)——
  // NewCraftingUI.cs:302-501 逐式;几何/筛选判据/状态机单源 = ui/modernCrafting.ts。
  // Main.cs:42418-42421 窗可见 → DrawUI,else 分支(经典列表+标题+材料行)整支不画
  // = vinvClassicCraftVisible 门;窗内切换钮/就近箱钮 = 同一 DOM 对象换锚(:486-499)。
  // =====================================================================
  private vinvModernCraftEl: HTMLDivElement | null = null;
  private vinvModernPanelEl: HTMLElement | null = null;
  private vinvModernTitleEl: HTMLElement | null = null;
  private vinvModernSearchInput: HTMLInputElement | null = null;
  private vinvModernSearchClear: HTMLButtonElement | null = null;
  private vinvModernGridList: HTMLElement | null = null;
  private vinvModernGridInner: HTMLElement | null = null;
  private vinvModernSeparatorEl: HTMLElement | null = null;
  private vinvModernScrollbarEl: HTMLElement | null = null;
  private vinvModernScrollHandle: HTMLElement | null = null;
  private vinvModernDetailEl: HTMLElement | null = null;
  private vinvModernFilterBtns: HTMLButtonElement[] = [];
  private vinvModernFilterHovers: boolean[] = [];
  private vinvModernCellEls: Array<{ el: HTMLElement; r: VanillaRecipeLike }> = [];

  /** 经典合成面可见门(Main.cs:42418-42421 NewCraftingUI.Visible → else 分支跳过) */
  private vinvClassicCraftVisible(): boolean {
    return !this.vinvModernCraftOpen;
  }

  private vinvBuildModernCraft(): void {
    const root = this.vinvRoot;
    if (!root) return;
    const win = el('div');
    win.style.cssText = 'position:absolute; width:490px; pointer-events:auto; display:none; z-index:5;';
    root.appendChild(win);
    this.vinvModernCraftEl = win;
    this.vinvLayoutItems.push({ el: win, pos: () => this.vinvModernCraftOpen ? { x: 20, y: 312 } : null });
    // ---- 11 类筛选条(:389-393 HAlign .5/Top 4 + UICreativeItemsInfiniteFilteringOptions
    //      钮 40px 步距/帧 42×48 offset−2−2/icon 帧 30×30 offset−2−0 Left6 VAlign.5) ----
    const bar = mcraftFilterBarRect();
    MCRAFT_ALL_BUTTONS.forEach((fb, i) => {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.cssText = `position:absolute; left:${bar.x - 20 + 40 * i}px; top:${bar.y - 312}px;`
        + `width:${MCRAFT_TAB_TEX.dw}px; height:${MCRAFT_TAB_TEX.dh}px; padding:0; overflow:hidden;`;
      const tab = document.createElement('div');
      tab.style.cssText = 'position:absolute; left:0; top:0; width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
      const icon = document.createElement('img');
      icon.draggable = false;
      icon.style.cssText = `position:absolute; left:${MCRAFT_ICON_TEX.ox}px; top:${MCRAFT_ICON_TEX.oy}px;`
        + `width:${MCRAFT_ICON_TEX.dw}px; height:${MCRAFT_ICON_TEX.dh}px; image-rendering:pixelated; pointer-events:none;`
        + `background-image:url(sprites/vanilla-ui/UI_Creative_Infinite_Icons.png); background-size:${MCRAFT_ICON_TEX.w}px ${MCRAFT_ICON_TEX.h}px;`
        + `background-position:${mcraftIconBgX(fb.icon)}px 0px;`;
      b.appendChild(tab);
      b.appendChild(icon);
      b.addEventListener('mouseenter', () => {
        this.vinvModernFilterHovers[i] = true;
        this.game.sfx.play('menuTick', 1);            // button_OnMouseOver :76-79 Sound 12
        // ShowButtonName :128-135 → ★2026-09-13 反馈轮6:自有气泡替代 title
        this.showBuffTooltip(b, Lang.text(fb.l10n), '');
        this.vinvSyncModernFilterBtn(i);
      });
      b.addEventListener('mouseleave', () => {
        this.vinvModernFilterHovers[i] = false;
        this.vinvSyncModernFilterBtn(i);
        this.hideBuffTooltip();
      });
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.vinvModernActive = toggleFilterRadio(this.vinvModernActive, fb.kind);   // :81-101
        this.vinvModernResetRecipes();                // OnClickingOption :393 → ResetRecipes
        for (let k = 0; k < this.vinvModernFilterBtns.length; k++) this.vinvSyncModernFilterBtn(k);
        this.vinvUpdateModernCraft();
      });
      win.appendChild(b);
      this.vinvModernFilterBtns.push(b);
      this.vinvModernFilterHovers.push(false);
      this.vinvSyncModernFilterBtn(i);
    });
    // ---- 主内衬 UIPanel(:321-332 背景/边框色) ----
    const panel = el('div');
    panel.style.cssText = `position:absolute; left:0; top:38px; width:490px; bottom:0;`
      + `border:12px solid #000; border-image:none; border-radius:10px; box-sizing:border-box;`
      + `background:${MCRAFT_PANEL_BG};`;
    panel.style.borderColor = MCRAFT_PANEL_BORDER;
    win.appendChild(panel);
    this.vinvModernPanelEl = panel;
    // 标题(UIPanel 内 UIText Left−1/Top−2 :333-337;UpdateText :419-429)
    const title = el('div', 'vinv-txt');
    title.style.cssText += 'position:absolute; font-size:14px; pointer-events:none; white-space:nowrap;';
    panel.appendChild(title);
    this.vinvModernTitleEl = title;
    // 搜索条(UIWrappedSearchBar Red 主题 :340-353;宽=100%−文本−10 走 flex 等价:426)
    const searchRow = el('div');
    searchRow.style.cssText = `position:absolute; right:8px; top:${12 - 4}px; height:${MCRAFT_SEARCH_H}px;`
      + 'display:flex; align-items:center; gap:3px;';
    const searchBtn = el('button', 'vinv-btn') as HTMLButtonElement;
    searchBtn.style.cssText = 'position:relative; width:22px; height:22px; padding:0; flex:none;';
    const sbImg = document.createElement('img');
    sbImg.src = 'sprites/vanilla-ui/UI_Bestiary_Button_Search_2.png';
    sbImg.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
    searchBtn.appendChild(sbImg);
    searchBtn.addEventListener('mouseenter', () => { sbImg.src = 'sprites/vanilla-ui/UI_Bestiary_Button_Search_Border.png'; });
    searchBtn.addEventListener('mouseleave', () => { sbImg.src = 'sprites/vanilla-ui/UI_Bestiary_Button_Search_2.png'; });
    searchBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.vinvModernSearchInput?.focus();            // Click_SearchArea
    });
    searchRow.appendChild(searchBtn);
    const searchBox = el('div');
    searchBox.style.cssText = `flex:1; height:${MCRAFT_SEARCH_H}px; position:relative; display:flex; align-items:center;`
      + `background:${MCRAFT_SEARCH_BG}; border-radius:5px; min-width:60px;`;
    const input = el('input') as HTMLInputElement;
    input.placeholder = Lang.text('UI.PlayerNameSlot');   // 空文案 = UI.PlayerNameSlot(:81 缺省,原版本相)
    input.style.cssText = 'flex:1; min-width:0; background:transparent; border:none; outline:none; color:#fff;'
      + 'font-size:13px; padding:0 24px 0 4px; font-family:inherit;';
    input.addEventListener('input', () => {
      this.vinvModernSearch = input.value;
      // SetSearchFilter+ResetRecipes(OnSearchContentsChanged :649-653);空白归零走
      // normalizeSearch(EntryFilterer.SetSearchFilter :85-94 IsNullOrWhiteSpace→null)
      this.vinvModernResetRecipes();
      this.vinvUpdateModernCraft();
    });
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    searchBox.appendChild(input);
    const cancel = el('button', 'vinv-btn') as HTMLButtonElement;
    cancel.style.cssText = 'position:absolute; right:-2px; top:50%; transform:translateY(-50%);'
      + 'width:24px; height:24px; padding:0; flex:none;';
    const cxImg = document.createElement('img');
    cxImg.src = 'sprites/vanilla-ui/UI_SearchCancel.png';
    cxImg.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
    cancel.appendChild(cxImg);
    cancel.addEventListener('mouseenter', () => this.game.sfx.play('menuTick', 1));   // :196-199
    cancel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.vinvModernSearch !== '') {             // searchCancelButton_OnClick :189-195
        this.vinvModernSearch = '';
        input.value = '';
        this.vinvModernResetRecipes();
        this.vinvUpdateModernCraft();
        this.game.sfx.play('menuClose', 1);
      } else {
        this.game.sfx.play('menuTick', 1);
      }
    });
    searchBox.appendChild(cancel);
    searchRow.appendChild(searchBox);
    panel.appendChild(searchRow);
    this.vinvModernSearchInput = input;
    this.vinvModernSearchClear = cancel;
    // ---- 网格容器/分隔线/列表/滚动条(:354-388) ----
    const sepEl = el('div');
    sepEl.style.cssText = `position:absolute; left:4px; height:4px; image-rendering:pixelated;`
      + `background:${MCRAFT_SEPARATOR_COLOR};`
      + `background-image:url(sprites/vanilla-ui/UI_CharCreation_Separator1.png); background-size:100% 100%;`;
    panel.appendChild(sepEl);
    this.vinvModernSeparatorEl = sepEl;
    const gridList = el('div');
    gridList.style.cssText = 'position:absolute; overflow:hidden;';
    panel.appendChild(gridList);
    this.vinvModernGridList = gridList;
    const gridInner = el('div');
    gridInner.style.cssText = 'position:absolute; left:0; top:0;';
    gridList.appendChild(gridInner);
    this.vinvModernGridInner = gridInner;
    const sbar = el('div');
    sbar.style.cssText = `position:absolute; width:20px; image-rendering:pixelated;`
      + `background-image:url(sprites/vanilla-ui/UI_Scrollbar.png); background-size:100% ${6 + 4 + 6}px;`;
    const handle = el('div');
    handle.style.cssText = 'position:absolute; left:0; width:20px; image-rendering:pixelated; pointer-events:auto;';
    sbar.appendChild(handle);
    panel.appendChild(sbar);
    this.vinvModernScrollbarEl = sbar;
    this.vinvModernScrollHandle = handle;
    this.vinvBindModernScrollbar(sbar, handle);
    // ---- ★刀19:向导槽+文案(DrawChildren NewCraftingUI.cs:441-458;win 相对:
    //      槽=detailOrigin+(0,58)=(24,131) ctx7 scale1/文案=+(52,73)=(76,146)/
    //      环境需求=+(52,36)=(76,109);仅向导态+窗开可见) ----
    const gSlot = el('div', 'sw-slot');
    gSlot.style.cssText = 'position:absolute; left:24px; top:131px; width:52px; height:52px;'
      + 'background-image:none; --slot-bgimg:url(sprites/vanilla/Inventory_Back.png); pointer-events:auto;';
    gSlot.addEventListener('contextmenu', (e) => e.preventDefault());
    gSlot.addEventListener('mousedown', (e) => {
      this.guideSlotMouseDown(e as MouseEvent, () => { this.vinvPaintGuideCraft(); this.vinvRefreshCraft(); });
    });
    win.appendChild(gSlot);
    this.vinvGuideSlotModernEl = gSlot;
    const gTxt = el('div', 'vinv-txt');
    gTxt.style.cssText += 'position:absolute; left:76px; top:146px; font-size:14px;';
    win.appendChild(gTxt);
    this.vinvGuideModernCaptionEl = gTxt;
    const gReq = el('div', 'vinv-txt');
    gReq.style.cssText += 'position:absolute; left:76px; top:109px; font-size:14px; color:#c8c8c8;';
    win.appendChild(gReq);
    this.vinvGuideModernReqEl = gReq;
    // ---- 详情浮层(DrawChildren :440-487;origin = 面板+(24,73) = craftDetailLayout) ----
    const detail = el('div');
    detail.style.cssText = 'position:absolute; pointer-events:none; display:none;';
    win.appendChild(detail);
    this.vinvModernDetailEl = detail;
    this.vinvLayoutItems.push({ el: detail, pos: () => {
      if (!this.vinvModernCraftOpen) return null;
      const o = mcraftDetailOrigin();
      return { x: o.origin.x - 20, y: o.origin.y - 312 };
    } });
    // ★刀19:窗内向导件显隐(InGuideCraftMenu ∧ NewCraftingUI.Visible;:441 在
    //   DrawChildren=窗子级,窗关随窗隐藏,此处双门=显式)
    this.vinvLayoutItems.push({ el: gSlot, pos: () => this.vinvGuideMenuOpen && this.vinvModernCraftOpen ? { x: 24, y: 131 } : null });
    this.vinvLayoutItems.push({ el: gTxt, pos: () => this.vinvGuideMenuOpen && this.vinvModernCraftOpen ? { x: 76, y: 146 } : null });
    this.vinvLayoutItems.push({ el: gReq, pos: () => this.vinvGuideMenuOpen && this.vinvModernCraftOpen ? { x: 76, y: 109 } : null });
  }

  /** 筛选钮帧同步(UpdateVisuals :103-114:frameX=激活、frameY=激活×2+悬停、图标半透)。
   *  ★tab 面 = 首个 div(帧 sprite);icon = img(半透)——两者取子元素分治 */
  private vinvSyncModernFilterBtn(i: number): void {
    const b = this.vinvModernFilterBtns[i];
    if (!b) return;
    const tab = b.querySelector('div');
    if (!tab) return;
    const fb = MCRAFT_ALL_BUTTONS[i]!;
    const { fx, fy } = mcraftTabFrame(this.vinvModernActive.includes(fb.kind), this.vinvModernFilterHovers[i] ?? false);
    tab.style.backgroundImage = `url(sprites/vanilla-ui/UI_Creative_Infinite_Tabs_B_2.png)`;
    tab.style.backgroundSize = `${MCRAFT_TAB_TEX.w}px ${MCRAFT_TAB_TEX.h}px`;
    tab.style.backgroundPosition = `-${fx * MCRAFT_TAB_TEX.fw}px -${fy * MCRAFT_TAB_TEX.fh}px`;
    const icon = b.querySelector('img');
    if (icon) icon.style.opacity = this.vinvModernActive.includes(fb.kind) ? '1' : '0.5';   // White vs White*0.5
  }

  /** ResetRecipes(:575-587):条目池/选中/滚动清;搜索域不清(仅 OnActivate/SetContents 清) */
  private vinvModernResetRecipes(): void {
    this.vinvModernEntries = [];
    this.vinvModernSelected = null;
    this.vinvModernViewPos = 0;
  }

  /** Open(quiet, filter)(:883-905)+ OnActivate(:907-915):可见即 no-op;置滤器+
   *  openedWithoutFilter+条目池清+搜索/激活集清+预选 availableRecipe[focusRecipe]。
   *  IngameUIWindows.CloseAll(:889)本仓无同域模态群=不建模(备案);playerInventory/
   *  PipsCurrentPage=Recipes 由开包链承担(本窗只在背包开态可达) */
  private vinvOpenModernCraft(filter: CraftingTileFilter | null, quiet: boolean): void {
    if (this.vinvModernCraftOpen) return;                       // :885 if (!Visible)
    this.vinvModernCraftOpen = true;
    this.vinvModernCraftFilter = filter;
    this.vinvModernOpenedWithoutFilter = filter === null;       // :907-909(OnActivate)
    this.vinvModernSelected = this.vinvCraftAvailV[this.vinvCraftFocusV]?.r ?? null;   // :910 预选
    this.vinvModernResetRecipes();                              // :911 ResetRecipes
    this.vinvModernSearch = '';
    this.vinvModernActive = [];                                 // :912-913 ActiveFilters.Clear
    if (this.vinvModernSearchInput) this.vinvModernSearchInput.value = '';
    this.vinvSyncGridToggle();
    this.vinvLayoutSig = '';
    this.layoutVanilla();
    this.vinvRefreshCraft();
    if (!quiet) this.game.sfx.play('menuOpen', 1);              // :900-903 Sound 10
  }

  /** Close(quiet, returnToInventory)(:866-881):PipsFastScroll 置位+OnDeactivate
   *  (:917-924 滤器/选中清)+音 11。returnToInventory=false → playerInventory=false
   *  面(本仓唯一调用域 = 关包链,由 closeInventory 承担=Quiet 支) */
  private vinvCloseModernCraft(quiet: boolean): void {
    if (!this.vinvModernCraftOpen) return;
    this.vinvModernCraftOpen = false;
    this.vinvCraftFastScroll = true;                            // :871 Main.PipsFastScroll=true
    this.vinvModernCraftFilter = null;                          // :919 OnDeactivate _filter=null
    this.vinvModernSelected = null;                             // :920 _selectedRecipeIndex=null
    this.vinvModernOpenedWithoutFilter = false;
    this.vinvSyncGridToggle();
    this.vinvLayoutSig = '';
    this.layoutVanilla();
    this.vinvRefreshCraft();
    if (!quiet) this.game.sfx.play('menuClose', 1);             // :876-879 Sound 11
  }

  /** ToggleInInventory(:926-936) */
  private vinvToggleModernCraft(quiet: boolean): void {
    if (this.vinvModernCraftOpen) this.vinvCloseModernCraft(quiet);
    else this.vinvOpenModernCraft(null, quiet);
  }

  /** OpenCloseFilter 执行器(:938-964 四支;向导支 :946-951 本仓无域)。modern 支消费点
   *  = InteractWithCraftingStation(Player.cs:33555-33557) → openCraftingStationFilter */
  vinvOpenCloseModernCraftFilter(f: CraftingTileFilter): void {
    const t = openCloseFilterTransition(
      { visible: this.vinvModernCraftOpen, filter: this.vinvModernCraftFilter, openedWithoutFilter: this.vinvModernOpenedWithoutFilter },
      f,
    );
    switch (t) {
      case 'open':
        this.vinvOpenModernCraft(f, false);                     // Open(quiet:false, filter) :942
        break;
      case 'setFilter':                                         // :952-953 Sound 12 + SetFilter
        this.game.sfx.play('menuTick', 1);
        this.vinvModernCraftFilter = f;
        this.vinvModernOpenedWithoutFilter = false;
        this.vinvModernResetRecipes();
        this.vinvUpdateModernCraft();
        break;
      case 'clearFilter':                                       // :957-958 Sound 12 + SetFilter(null)
        this.game.sfx.play('menuTick', 1);
        this.vinvModernCraftFilter = null;
        this.vinvModernResetRecipes();
        this.vinvUpdateModernCraft();
        break;
      case 'close':                                             // :962 Close(returnToInventory:true)
        this.vinvCloseModernCraft(false);
        break;
    }
  }

  /** 窗内滚动条绑定(UIScrollbar.cs:109-180 拖拽/点轨 1:1) */
  private vinvBindModernScrollbar(sbar: HTMLElement, handle: HTMLElement): void {
    let dragging = false;
    let dragYOffset = 0;
    const myOf = (e: MouseEvent): number => e.clientY / this.vinvModernScaleK();
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const g = this.vinvModernGridGeometry();
      if (!g) return;
      dragging = true;
      // _dragYOffset = mouseY − handleRect.Y(:146-148;handleRect.Y = sbarY + 5 +
      //   innerH·(pos/max) − 3,即 GetHandleRectangle :78-84 屏位)
      const handleRectY = g.scrollbar.y + 5 + Math.trunc(g.scrollbar.innerH * (this.vinvModernViewPos / Math.max(1, g.contentH))) - 3;
      dragYOffset = myOf(e) - handleRectY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const g = this.vinvModernGridGeometry();
      if (!g) return;
      const num = myOf(e) - g.scrollbar.innerY - dragYOffset;    // :111-115
      this.vinvModernViewPos = clampViewPosition(num / g.scrollbar.innerH * g.contentH, g.list.h, g.contentH);
      this.vinvSyncModernScroll();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    sbar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (dragging) return;
      // 点轨支(:151-159):num = mouseY − innerY − handleH/2
      const g = this.vinvModernGridGeometry();
      if (!g) return;
      const handleH = parseFloat(handle.style.height || '0') || 0;
      const num = myOf(e) - g.scrollbar.innerY - handleH / 2;
      this.vinvModernViewPos = clampViewPosition(num / g.scrollbar.innerH * g.contentH, g.list.h, g.contentH);
      this.vinvSyncModernScroll();
    });
    sbar.addEventListener('wheel', (e) => {
      e.stopPropagation();
      this.vinvModernScrollBy(e);
    }, { passive: true });
  }

  private vinvModernScaleK(): number {
    return vanillaScaleFor(window.innerWidth, window.innerHeight, options.data.uiScale);
  }

  /** UIList.ScrollWheel(UIList.cs:109-115):ViewPosition −= ScrollWheelDeltaForUI
   *  (±120/notch,PlayerInput.cs:902;XNA 上滚为正 = 浏览器 deltaY 取负) */
  private vinvModernScrollBy(e: WheelEvent): void {
    const g = this.vinvModernGridGeometry();
    if (!g || g.contentH <= g.list.h) return;
    const notches = vanillaWheelNotches(e.deltaY, e.deltaMode);   // ★SW-RB14d：补传 deltaMode（旧缺省 0=Firefox 行模式整类吞零）
    if (notches === 0) return;
    this.vinvModernViewPos = clampViewPosition(
      this.vinvModernViewPos - notches * 120, g.list.h, g.contentH,
    );
    this.vinvSyncModernScroll();
  }

  private vinvModernGridGeometry(): ReturnType<typeof mcraftGridGeometry> | null {
    const c = this.vinvLayoutCtx;
    if (!c || !this.vinvModernGridList) return null;
    return mcraftGridGeometry(c.sh, Math.max(1, this.vinvModernEntries.length), this.vinvGuideMenuOpen);
  }

  /** 滚动条/内容位移同步(UIScrollbar.GetHandleRectangle :78-84) */
  private vinvSyncModernScroll(): void {
    const g = this.vinvModernGridGeometry();
    if (!g || !this.vinvModernGridInner || !this.vinvModernScrollHandle) return;
    this.vinvModernGridInner.style.transform = `translateY(${-this.vinvModernViewPos}px)`;
    const canScroll = g.contentH > g.list.h;                    // CanScroll :49(AutoHide :105)
    this.vinvModernScrollbarEl!.style.display = canScroll ? '' : 'none';
    if (!canScroll) return;
    // GetHandleRectangle(:78-84):Y = innerY + innerH·(pos/max) − 3;H = innerH·(view/max) + 7
    //   (handle 位 = sbar 内相对;innerY − sbar.y = padding top 5)
    const maxV = Math.max(1, g.contentH);
    const handleH = Math.trunc(g.scrollbar.innerH * (g.list.h / maxV)) + 7;
    const handleY = 5 + Math.trunc(g.scrollbar.innerH * (this.vinvModernViewPos / maxV)) - 3;
    this.vinvModernScrollHandle.style.height = `${Math.max(12, handleH)}px`;
    this.vinvModernScrollHandle.style.top = `${handleY}px`;
    this.vinvModernScrollHandle.style.backgroundImage = 'url(sprites/vanilla-ui/UI_ScrollbarInner.png)';
    this.vinvModernScrollHandle.style.backgroundSize = '100% 16px';
  }

  /** 窗内网格条目构建(UpdateContents :589-634 + ItemGrid.DrawSlot :56-76)。
   *  条目 = availableRecipe(可用集)过滤 FitsFilter(搜索+激活类)∧站点滤器 Accepts;
   *  累计条目池保留曾可用件(ResetRecipes 前不散)——重置拍重建。 */
  private vinvUpdateModernCraft(): void {
    const game = this.game;
    const win = this.vinvModernCraftEl;
    const c = this.vinvLayoutCtx;
    if (!game || !win || !c) return;
    win.style.height = `${c.sh + MCRAFT_STATE_H_OFF}px`;        // Height = −350×100%(:307)
    const panel = mcraftPanelRect(c.sh);
    if (this.vinvModernPanelEl) {
      this.vinvModernPanelEl.style.top = '38px';
      this.vinvModernPanelEl.style.height = `${panel.h}px`;
    }
    // 标题(UpdateText :419-429:_filter ? GetWindowDescription : inter[25];站名空 =
    //   TileBasedRecipeFilter.GetWindowDescription 域外,回 inter[25] 与经典路径同守卫)
    if (this.vinvModernTitleEl) {
      const f = this.vinvModernCraftFilter;
      const name = f ? Lang.tileName(f.tile) : null;
      const text = f && name ? Lang.text('CombineFormat.Crafting', name) : Lang.inter(25);
      if (this.vinvModernTitleEl.textContent !== text) this.vinvModernTitleEl.textContent = text;
      const t = mcraftTitleXY(panel);
      this.vinvModernTitleEl.style.left = `${t.x - panel.x}px`;
      this.vinvModernTitleEl.style.top = `${t.y - panel.y}px`;
    }
    // 搜索域(EntryFilterer.SetSearchFilter :85-94 IsNullOrWhiteSpace→null)
    const search = normalizeSearch(this.vinvModernSearch);
    // ---- 条目池增量(:596-617:availableRecipe 逐条入池,FitsFilter 过滤入 _filteredRecipes) ----
    // ★刀19:向导反查(NewCraftingUI.GetNumRecipes :256-262)——空槽=0 配方;有件=
    //   CollectGuideRecipes 集(与经典支同源,vinvRefreshCraft 的 vinvCraftAvailV 已带,
    //   但本窗每拍自取 avail=独立接入)
    let avail: Array<{ r: VanillaRecipeLike; count: number }>;
    if (this.vinvGuideMenuOpen) {
      avail = this.guidePlaced
        ? (() => {
          const vid = this.vidOfItemOf(this.guidePlaced!.id);
          return VANILLA_RECIPES.filter((r) => r.items.some((req) => req.id === vid
            || (req.id >= 1000000 && (RECIPE_GROUP_ITEMS[String(req.id - 1000000)] ?? []).includes(vid))))
            .map((r) => ({ r, count: 0 }));
        })()
        : [];                                       // GetNumRecipes=0(:257-261)
    } else {
      avail = game.vanillaAvailableRecipes();
    }
    for (const row of avail) {
      if (this.vinvModernEntries.some((e) => e.r === row.r)) continue;
      if (!this.vinvModernRecipeFits(row.r, search, this.vinvModernActive)) continue;
      this.vinvModernEntries.push({ r: row.r, count: row.count, seen: true });
    }
    // 选中同步(:618-629:SelectedEntry==null→清;滤器拒→清;可用→focusRecipe 回写)
    if (this.vinvModernSelected !== null) {
      const sel = this.vinvModernEntries.find((e) => e.r === this.vinvModernSelected);
      const stillAvail = sel !== undefined && avail.some((row) => row.r === sel.r);
      if (this.vinvModernCraftFilter !== null && !recipeFilterAccepts(this.vinvModernSelected, this.vinvModernCraftFilter)) this.vinvModernSelected = null;
      else if (stillAvail && sel) {
        const idx = avail.findIndex((row) => row.r === sel.r);
        if (idx >= 0 && this.vinvCraftFocusV !== idx) {
          this.vinvCraftFocusGoto(idx);                        // :626-629 focusRecipe 双向回写
          this.vinvUpdateCraftList();
        }
      }
    }
    // ---- 几何/格池 ----
    const g = mcraftGridGeometry(c.sh, Math.max(1, this.vinvModernEntries.length), this.vinvGuideMenuOpen);
    const list = this.vinvModernGridList!;
    list.style.left = `${g.list.x - panel.x}px`;
    list.style.top = `${g.list.y - panel.y}px`;
    list.style.width = `${g.list.w}px`;
    list.style.height = `${g.list.h}px`;
    if (this.vinvModernSeparatorEl) {
      this.vinvModernSeparatorEl.style.left = `${g.separator.x - panel.x}px`;
      this.vinvModernSeparatorEl.style.top = `${g.separator.y - panel.y}px`;
      this.vinvModernSeparatorEl.style.width = `${g.separator.w}px`;
    }
    if (this.vinvModernScrollbarEl) {
      this.vinvModernScrollbarEl.style.left = `${g.scrollbar.x - panel.x}px`;
      this.vinvModernScrollbarEl.style.top = `${g.scrollbar.y - panel.y}px`;
      this.vinvModernScrollbarEl.style.height = `${g.scrollbar.h}px`;
    }
    this.vinvModernViewPos = clampViewPosition(this.vinvModernViewPos, g.list.h, Math.max(g.contentH, g.list.h));
    // 格池重建(签名:条目集+选中+可用集+几何)
    const availKeys = avail.map((row) => row.r.create).join(',');
    const sig = this.vinvModernEntries.map((e) => e.r.create).join(',')
      + `|${this.vinvModernSelected ? this.vinvModernSelected.create : ''}|${g.cols}x${g.rows}|${availKeys}`;
    if (sig !== this.vinvModernCellsSig) {
      this.vinvModernCellsSig = sig;
      this.vinvRebuildModernCells(g, new Set(avail.map((row) => row.r)));
    }
    this.vinvSyncModernScroll();
    this.vinvUpdateModernDetail(avail);
  }
  private vinvModernCellsSig = '';

  /** 单条目 Fit(UpdateContents :610 FitsFilter → EntryFilterer.FitsFilter(产物)+
   *  _filter.Accepts(配方) :636-647) */
  private vinvModernRecipeFits(
    r: VanillaRecipeLike, search: string | null, active: readonly FilterKind[],
  ): boolean {
    const vid = r.create;
    const it = filterItemOfVid(vid);
    if (it.tooltipLines.length === 0) vinvFillTooltipLines(it);
    if (!filtererFits(search, active, it)) return false;
    if (this.vinvModernCraftFilter !== null && !recipeFilterAccepts(r, this.vinvModernCraftFilter)) return false;
    return true;
  }

  private vinvRebuildModernCells(
    g: ReturnType<typeof mcraftGridGeometry>, availNow: ReadonlySet<VanillaRecipeLike>,
  ): void {
    const inner = this.vinvModernGridInner;
    if (!inner || !this.game) return;
    inner.replaceChildren();
    this.vinvModernCellEls = [];
    inner.style.height = `${Math.max(g.contentH, g.list.h)}px`;
    const entries = this.vinvModernEntries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const pos = mcraftCellXY(g, i);
      const slotEl = el('div', 'sw-slot');   // ★变量名 slotEl:classic「cell 不绑 wheel」反向锚不扰
      slotEl.style.cssText = `position:absolute; left:${pos.x - g.list.x}px; top:${pos.y - g.list.y}px;`
        + 'width:52px; height:52px; background-image:none; transform-origin:top left;'
        + `transform:scale(${MCRAFT_CELL_SCALE}); pointer-events:auto;`;
      const iid = this.game.itemId(vanillaItemKey(e.r.create) ?? '');
      const img = el('img') as HTMLImageElement;
      img.draggable = false;
      img.src = iconUrl(this.game, iid);
      slotEl.appendChild(img);
      if (e.r.createStack > 1) slotEl.appendChild(el('span', 'cnt', String(e.r.createStack)));
      if (!availNow.has(e.r)) {
        // 不可用槽(ItemGrid.DrawSlot :75 DisabledSlotColor (160,160,160))
        img.style.filter = `grayscale(1) brightness(${MCRAFT_DISABLED_GRAY})`;
        slotEl.dataset.unavail = '1';
      }
      this.vinvBindModernCell(slotEl, e.r, availNow.has(e.r));
      inner.appendChild(slotEl);
      this.vinvModernCellEls.push({ el: slotEl, r: e.r });
    }
  }

  /** 格交互(HandleCraftSlot :503-532):未选/不可用=点选(音12);已选且可用=
   *  HoverOverCraftingItemButton(focusRecipe) 合成链(:526);不可用=材料不足行 tooltip
   *  (AddTooltipLines :545-553)。stackSplit/重复合成拍面 = vanillaCraft 内接。
   *  ★变量名 slotEl:classic 网格域「cell 不绑 wheel」反向锚(FX30/RB13b)不受扰——
   *  本域格面绑 wheel 是窗列表滚动(UIList.cs:109-115),非 classic 分页面 */
  private vinvBindModernCell(slotEl: HTMLElement, r: VanillaRecipeLike, availNow: boolean): void {
    slotEl.addEventListener('mouseenter', () => {
      const iid = this.game.itemId(vanillaItemKey(r.create) ?? '');
      if (iid > 0) {
        this.showTooltipFor(iid, 'inv', { slot: { id: iid, stack: r.createStack }, anchor: slotEl });
        if (!availNow) {
          const line = document.createElement('div');
          line.style.color = MCRAFT_MISSING_COLOR;
          line.textContent = Lang.text(MCRAFT_MISSING_KEY);
          this.tooltip.appendChild(line);
        }
      }
    });
    slotEl.addEventListener('mouseleave', () => {
      this.tooltip.style.display = 'none';
      cancelAnimationFrame(this.tooltipPulseRaf);
    });
    slotEl.addEventListener('wheel', (e) => this.vinvModernScrollBy(e));
    slotEl.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      const selected = this.vinvModernSelected === r;
      if (!availNow || !selected) {                       // :506-522 选中队
        this.vinvModernSelected = r;
        this.game.sfx.play('menuTick', 1);                // :520 Sound 12
        this.vinvUpdateModernCraft();
        return;
      }
      // :524-527 else 支 = Main.HoverOverCraftingItemButton(Main.focusRecipe) 合成
      //   (Main.cs:42971-43036:焦点即配方→CraftItem;Shift×10 = num2·10 :43011-43013)
      this.game.vanillaCraft(r, (ev as MouseEvent).shiftKey ? 10 : 1, true);
      this.refreshAll();
    });
  }

  /** 详情浮层(DrawChildren :450-487):hover ?? Selected;成品槽 ctx42(scale1,
   *  底 White*0.749 :566)/锤图标 +(47,13) scale0.8/材料行 34·num 步距+拥有数
   *  (DrawOwnedItemCount :555-561)/向导槽 ctx7 = 本仓无 InGuideCraftMenu 域(备案) */
  private vinvUpdateModernDetail(avail: Array<{ r: VanillaRecipeLike; count: number }>): void {
    const detail = this.vinvModernDetailEl;
    if (!detail || !this.game) return;
    const o = mcraftDetailOrigin();
    // hover 优先(:451 _hoveredEntry ?? SelectedEntry)——DOM hover 由 CSS :hover 承担,
    //   此处重建 = 选中态拍面(hover tooltip 逐帧面不合事件驱动;登记偏差)
    const r = this.vinvModernSelected;
    if (!r) { detail.style.display = 'none'; detail.replaceChildren(); return; }
    detail.style.display = '';
    detail.replaceChildren();
    const availNow = avail.some((row) => row.r === r);
    // 成品槽(ctx 42;DrawRecipeSlot :563-573 底 White×0.749)
    const slot = el('div', 'sw-slot');
    slot.style.cssText = `position:absolute; left:${o.origin.x - 20}px; top:${o.origin.y - 312}px;`
      + 'width:52px; height:52px; background-image:none; --slot-alpha:0.749; pointer-events:auto;';
    const iid = this.game.itemId(vanillaItemKey(r.create) ?? '');
    const img = el('img') as HTMLImageElement;
    img.draggable = false;
    img.src = iconUrl(this.game, iid);
    if (!availNow && !this.vinvGuideMenuOpen) img.style.filter = `grayscale(1) brightness(${MCRAFT_DISABLED_GRAY})`;
    slot.appendChild(img);
    if (r.createStack > 1) slot.appendChild(el('span', 'cnt', String(r.createStack)));
    slot.addEventListener('mouseenter', () => {
      if (iid > 0) this.showTooltipFor(iid, 'inv', { slot: { id: iid, stack: r.createStack }, anchor: slot });
    });
    slot.addEventListener('mouseleave', () => {
      this.tooltip.style.display = 'none';
      cancelAnimationFrame(this.tooltipPulseRaf);
    });
    slot.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      if (!availNow) return;                              // 不可用=仅 tooltip(:460 enabled:false)
      if (this.guidePlaced) return;                       // ★刀19:反查态不合成(:42988 门,HandleCraftSlot → HoverOverCraftingItemButton 同路)
      this.game.vanillaCraft(r, (ev as MouseEvent).shiftKey ? 10 : 1, true);
      this.refreshAll();
    });
    detail.appendChild(slot);
    // 锤图标(:464 Images/UI/Craft ×0.8 @origin+(47,13))
    const hammer = el('img') as HTMLImageElement;
    hammer.draggable = false;
    hammer.src = 'sprites/vanilla-ui/UI_Craft.png';
    hammer.style.cssText = `position:absolute; left:${o.origin.x - 20 + 47}px; top:${o.origin.y - 312 + 13}px;`
      + 'width:20.8px; height:19.2px; image-rendering:pixelated; pointer-events:none;';
    detail.appendChild(hammer);
    // 材料行(:465-486)
    r.items.forEach((req, j) => {
      const mp = mcraftMaterialPos({ x: o.origin.x, y: o.origin.y }, j, r.items.length);
      const owned = this.vinvModernOwnedOf(r, req.id);
      // ★刀19:向导态材料全亮(:474 InGuideCraftMenu ∨ 满足)+拥有数整支不画(:482 !InGuideCraftMenu 门)
      const enough = this.vinvGuideMenuOpen || owned >= req.stack;
      const showOwned = !this.vinvGuideMenuOpen;
      const k2 = ingredientKey(req.id);
      const box = el('div', 'sw-slot');
      const px = mp.x - 20, py = mp.y - 312;
      box.style.cssText = `position:absolute; left:${px}px; top:${py}px; width:52px; height:52px;`
        + 'background-image:none; --slot-alpha:0.749;'
        + `transform:scale(${mp.scale}); transform-origin:top left; pointer-events:auto;`;
      const mimg = el('img') as HTMLImageElement;
      mimg.draggable = false;
      mimg.src = k2 ? iconUrl(this.game, this.game.itemId(k2)) : '';
      box.appendChild(mimg);
      if (req.stack > 1) box.appendChild(el('span', 'cnt', String(req.stack)));
      // 拥有数(DrawOwnedItemCount :555-561:槽 +(3,32)·scale,ItemStack 字体 0.8·scale)
      const cnt = el('div');
      cnt.textContent = owned > 999 ? '999+' : String(owned);
      const cp = mcraftOwnedCountPos({ x: px, y: py, scale: mp.scale });
      cnt.style.cssText = `position:absolute; left:${cp.x}px; top:${cp.y}px; color:${mcraftOwnedCountColor(enough)};`
        + `font-size:${Math.max(8, Math.trunc(11 * mp.scale))}px; text-shadow:1px 1px 0 #000; pointer-events:none;`
        + (showOwned ? '' : 'display:none;');
      box.addEventListener('mouseenter', () => {
        const miid = k2 ? this.game.itemId(k2) : -1;
        if (miid > 0) this.showTooltipFor(miid, 'inv', { slot: { id: miid, stack: req.stack }, anchor: box });
      });
      box.addEventListener('mouseleave', () => {
        this.tooltip.style.display = 'none';
        cancelAnimationFrame(this.tooltipPulseRaf);
      });
      detail.appendChild(box);
      detail.appendChild(cnt);
    });
  }

  /** 材料拥有数(Recipe.GetAvailableItemCount :313-320 组感知——availableItemCountFor
   *  同源 owned 聚合表) */
  private vinvModernOwnedOf(r: VanillaRecipeLike, reqId: number): number {
    const owned = this.game?.vanillaCraftOwned();
    return owned ? availableItemCountFor(r, reqId, owned) : 0;
  }

  /** 经典网格视图容器(DrawRecipesGrid CraftingUI.cs:446-571,Main.cs:42449-42454
   *  PipsUseGrid ∧ InPipCrafting 门)。★列表不吃 PipsUseGrid 门(:42425-42428)=网格
   *  与列表同屏,网格是拾取器:点格 → focusRecipe + PipsUseGrid=false(:520-527)。
   *  几何/分页/钳制全走 craftingGrid.ts 纯函数单源。 */
  private vinvBuildCraftGrid(): void {
    const root = this.vinvRoot;
    if (!root) return;
    const grid = el('div');
    grid.style.cssText = 'position:absolute; pointer-events:none; z-index:3; display:none;';
    root.appendChild(grid);
    this.vinvCraftGridEl = grid;
    // ★SW-RB13b:容器 pos=网格原点(310,340)——与 vinvUpdateCraftGrid 的 left/top 双写者
    //   一致化。曾 (0,0):layoutVanilla pos 循环会把 vinvUpdateCraftGrid 写的 (310,340)
    //   冲回 (0,0)(格全体左上漂 310/340;PipsUseGrid 入签后每次切换必触发,探针实捕)
    this.vinvLayoutItems.push({ el: grid, pos: () => this.vinvPipsUseGrid ? { x: CRAFT_GRID_LEFT, y: CRAFT_GRID_TOP } : null });
    // 上/下页钮(:453-455 num10=290:num11=342/362;RecUp/RecDown 16×16,色 (200,200,200,200)
    // → opacity 0.784;可见门 = recStart>0 / recStart<avail-cols·rows :470/:501)
    const mkPage = (dir: 'up' | 'down'): HTMLButtonElement => {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.cssText = 'width:16px; height:16px; padding:0; z-index:4; opacity:0.784; display:none;';
      const im = document.createElement('img');
      im.draggable = false;
      im.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
      im.src = dir === 'up' ? 'sprites/vanilla/RecUp.png' : 'sprites/vanilla/RecDown.png';
      b.appendChild(im);
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const c = this.vinvLayoutCtx;
        if (!c || !this.vinvPipsUseGrid) return;
        const geo = craftGridGeometry(c.sw, c.sh);
        const avail = this.vinvCraftAvailV.length;
        if (dir === 'up') {
          if (this.vinvCraftRecStart <= 0) return;      // :470 可见门
          this.vinvCraftRecStart = craftGridRecStartAfterUp(this.vinvCraftRecStart, geo.cols);   // :476-481
        } else {
          if (this.vinvCraftRecStart >= avail - geo.cols * geo.rows) return;   // :501 可见门
          this.vinvCraftRecStart = craftGridRecStartAfterDown(this.vinvCraftRecStart, geo.cols, avail);   // :508-514
          this.game.sfx.play('menuTick', 1);            // :511 音在钳位前
        }
        this.vinvUpdateCraftGrid();
      });
      root.appendChild(b);
      this.vinvLayoutItems.push({ el: b, pos: () => {
        if (!this.vinvPipsUseGrid || !this.vinvLayoutCtx) return null;
        // ★SW-RB13b:可见门与 vinvUpdateCraftGrid 逐字同谓词(:470 recStart>0 /
        //   :501 recStart<avail-页容量)——pos 循环双写者一致化,防 relayout 把
        //   recStart 门冲掉(曾 relayout 后 recStart=0 上页钮仍现形,探针实捕)
        const avail = this.vinvCraftAvailV.length;
        const geo = craftGridGeometry(this.vinvLayoutCtx.sw, this.vinvLayoutCtx.sh);
        if (dir === 'up' ? this.vinvCraftRecStart <= 0
          : this.vinvCraftRecStart >= avail - geo.cols * geo.rows) return null;
        const p = craftGridPageBtnXY(dir);
        return { x: p.x, y: p.y };
      } });
      return b;
    };
    this.vinvCraftGridUpBtn = mkPage('up');
    this.vinvCraftGridDownBtn = mkPage('down');
  }

  /** 网格滚轮(Main.cs:17595-17633 DoScrollingInInventory):PipsUseGrid ∧ 鼠标在网格
   *  矩形 (310,340,cols·42,rows·42) 内 → 每档 ScrollCraftingGrid(CraftingUI.cs:575-594,
   *  下滚 +=cols+音,上滚 -=cols 无音);★网格支不清 flag(:17600-17608 无 flag=false)
   *  → :17629-17632 ScrollCraftingList 同拍仍走 = 网格分页与列表焦点同滚(逐字)。
   *  窗口级监听:网格容器 pointer-events:none(空档不拦世界点击,原版空档不置
   *  mouseInterface 同相),wheel 事件不经容器冒泡,故挂 window 一次(重建守卫)。 */
  private vinvBindGridWheel(): void {
    if (this.vinvGridWheelBound) return;
    this.vinvGridWheelBound = true;
    this.vinvGridWheelHandler = (e) => this.vinvGridWheelTick(e);
    window.addEventListener('wheel', this.vinvGridWheelHandler, { passive: true });
  }

  private vinvGridWheelTick(e: WheelEvent): void {
    // ★SW-RB13b:DoScrollingInInventory(Main.cs:17592-17640)逐字重写——调用域
    //   playerInventory(:17547)+ _builtLayout 域守卫;PipsUseGrid 支只管网格分页
    //   且【不清 flag】,flag 支(列表滚)恒走=网格外/关网格态列表照滚(:17633-17640)。
    if (!this.game || this._builtLayout !== 'vanilla') return;
    if (this.invPanel.style.display !== 'block') return;   // playerInventory 门(:17547)
    const c = this.vinvLayoutCtx;
    if (!c) return;
    const avail = this.vinvCraftAvailV.length;
    // ★SW-FX38:每档数=vanillaWheelNotches(Main.cs:17593 int num=ScrollWheelDelta/120,
    //   C# 整除向零截断:子档拍=0 整吞无累积器,±240=±2 档;取负=XNA 上滚为正 vs
    //   浏览器 deltaY 下滚为正)——旧 `Math.round+Math.abs` 在 (60,120) 档带虚生 1 档=滚距偏快
    const notches = vanillaWheelNotches(e.deltaY, e.deltaMode);   // ★SW-RB14d：补传 deltaMode
    if (this.vinvPipsUseGrid) {                       // :17597 PipsUseGrid 支(flag 初值 true 不变,本支不清)
      const geo = craftGridGeometry(c.sw, c.sh);
      // 视口 px → vinv 逻辑域(÷K;transform-origin top left = 原点同)
      const K = vanillaScaleFor(window.innerWidth, window.innerHeight, options.data.uiScale);
      const lx = e.clientX / K, ly = e.clientY / K;
      if (lx >= geo.left && ly >= geo.top
        && lx < geo.left + geo.w && ly < geo.top + geo.h) {   // :17602-17608 Contains
        let num = notches;
        while (num !== 0) {                           // :17610-17613 while 档数(每档一调,num 只取号)
          if (num < 0) {
            this.vinvCraftRecStart = craftGridRecStartAfterUp(this.vinvCraftRecStart, geo.cols);   // ScrollCraftingGrid mouseWheel<0 支(:587-594,−=cols 无音)
          } else {
            this.vinvCraftRecStart = craftGridRecStartAfterDown(this.vinvCraftRecStart, geo.cols, avail);   // +=支(:596-601)
            this.game.sfx.play('menuTick', 1);            // :597 音只走 +=支(逐字)
          }
          num -= Math.sign(num);
        }
        this.vinvUpdateCraftGrid();
      }
      // 网格支不清 flag(:17600-17608 无 flag=false)→ 列表同拍仍走
    }
    // 箱行滚支(:17622 chest!=-1 ∧ ChestUI.LastHighestChestRow>0 → flag=false+Scroll):
    //   40 槽箱 LastHighestChestRow=ceil(40/10)-4=0 恒假=死支(本仓无 >40 槽容器,同相不建)
    // ★SW-FX41:NewCraftingUI.Visible 支(:17636-17639 flag=false)已落地——窗开=列表滚停
    //   (网格分页支在上方,不受此门=原版同相)
    if (!this.vinvModernCraftOpen) {
      this.vinvCraftWheel(e);                         // :17633-17640 flag 支 ScrollCraftingList(档数自算)
    }
  }

  /** 网格重排/重建(每刷新拍):recStart 逐拍钳制(:461-467)+页钮可见门+格池签名重建 */
  private vinvUpdateCraftGrid(): void {
    const grid = this.vinvCraftGridEl;
    const c = this.vinvLayoutCtx;
    if (!grid || !c) return;
    if (!this.vinvPipsUseGrid) {                      // 关格清空(Main.cs:42449 门)
      grid.style.display = 'none';
      grid.replaceChildren();
      this.vinvCraftGridSig = '';
      return;
    }
    const geo = craftGridGeometry(c.sw, c.sh);
    const availLen = this.vinvCraftAvailV.length;
    this.vinvCraftRecStart = clampCraftGridRecStart(this.vinvCraftRecStart, availLen, geo.cols, geo.rows);
    grid.style.display = '';
    grid.style.left = `${geo.left}px`;
    grid.style.top = `${geo.top}px`;
    grid.style.width = `${geo.w}px`;
    grid.style.height = `${geo.h}px`;
    if (this.vinvCraftGridUpBtn) this.vinvCraftGridUpBtn.style.display = this.vinvCraftRecStart > 0 ? '' : 'none';
    if (this.vinvCraftGridDownBtn) {
      this.vinvCraftGridDownBtn.style.display =
        this.vinvCraftRecStart < availLen - geo.cols * geo.rows ? '' : 'none';
    }
    const sig = `${availLen}|${geo.cols}x${geo.rows}|${this.vinvCraftRecStart}`;
    if (sig === this.vinvCraftGridSig) return;
    this.vinvCraftGridSig = sig;
    grid.replaceChildren();
    for (let k = 0; k < geo.cols * geo.rows; k++) {
      const i = this.vinvCraftRecStart + k;
      if (i >= availLen) break;                       // :522 i < numAvailableRecipes
      const rec = this.vinvCraftAvailV[i];
      const outKey = vanillaItemKey(rec.r.create);
      const cell = el('div', 'sw-slot');
      cell.style.cssText = 'position:absolute; width:52px; height:52px; background-image:none;'
        + `--slot-bgimg:url(sprites/vanilla/Inventory_Back.png); transform:scale(${CRAFT_GRID_SLOT_SCALE});`
        + 'transform-origin:top left; pointer-events:auto;';
      cell.style.setProperty('--slot-alpha', '1');
      cell.style.opacity = String(150 / 255);         // :545 num14 = A+50 → 画前 -50 = A(LoadSettings A=150,列表同源)
      const img = el('img') as HTMLImageElement;
      img.draggable = false;
      img.src = iconUrl(this.game, this.game.itemId(outKey ?? ''));
      cell.appendChild(img);
      if (rec.r.createStack > 1) cell.appendChild(el('span', 'cnt', String(rec.r.createStack)));
      const pos = craftGridCellXY(k, geo.cols);
      cell.style.left = `${pos.x}px`;
      cell.style.top = `${pos.y}px`;
      // 悬停(:528-540):mouseInterface + craftingHide + HoverItem=clone + MouseHover(22) +
      // hoverItemName(名/×stack)——本仓 tooltip 全载荷面与列表格同源(showTooltipFor)
      cell.addEventListener('mouseenter', () => {
        const iid = this.game.itemId(outKey ?? '');
        if (iid > 0) this.showTooltipFor(iid, 'inv', { slot: { id: iid, stack: rec.r.createStack }, anchor: cell });
      });
      cell.addEventListener('mouseleave', () => {
        this.tooltip.style.display = 'none';
        cancelAnimationFrame(this.tooltipPulseRaf);
      });
      // ★SW-RB13b:网格格【不绑】wheel——滚轮走窗口级 vinvGridWheelTick(DoScrollingInInventory
      //   域):格面在网格矩形内,原版=分页网格+列表同拍滚(:17602-17633);曾绑 vinvCraftWheel
      //   → stopPropagation 吞掉窗口级分页=滚轮只在 3px 空档生效(格覆盖 93% 面积,倒挂)
      // 点击(:517-527):focusRecipe=i + recFastScroll=true(:523,★SW-FX38 列表瞬吸
      // 同相)+ PipsUseGrid=false + SoundID 12(游戏pad ChangePage(9) 支=N/A)
      cell.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        this.vinvCraftFastScroll = true;              // ★SW-FX38 :523 recFastScroll=true
        this.vinvCraftFocusGoto(i);                   // :522 focusRecipe=i
        this.vinvPipsUseGrid = false;
        this.vinvCraftRecStart = 0;                   // !PipsUseGrid → recStart=0(Main.cs:43926-43929)
        this.game.sfx.play('menuTick', 1);
        this.vinvCraftSnapStep();                     // 同帧瞬吸(fast → original=0,行界音同相)
        this.vinvSyncGridToggle();
        this.vinvUpdateCraftList();
        this.refreshAll();
      });
      grid.appendChild(cell);
    }
  }

  /** 站点/水源过滤失效拍(DrawGridToggle 头 :269-273:_lastFilter ≠ null 且
   *  (!CanRemainOpen ∨ 页≠Recipes ∨ !playerInventory) → 清。本仓页恒 Recipes;
   *  playerInventory 门 = 背包开态;CanRemainOpen = filterRemainOpen(adjTile 闭包语义)) */
  private vinvTickCraftFilter(): void {
    if (!this.vinvCraftFilter) return;
    const invOpen = this.invPanel.style.display === 'block';
    if (!invOpen) { this.vinvCraftFilter = null; return; }
    if (!this.vinvFilterRemain()) this.vinvCraftFilter = null;
  }

  /** CanRemainOpen 域内判定(adjTile 闭包语义)。f 缺省 = classic 滤器(vinvTickCraftFilter
   *  消费);★SW-FX41:modern 窗 Update 拍(NewCraftingUI.cs:655-665)传
   *  vinvModernCraftFilter——曾恒读 classic 域 = 窗开即被误判失效秒关(探针实斩) */
  private vinvFilterRemain(f: CraftingTileFilter | null = this.vinvCraftFilter): boolean {
    const game = this.game;
    if (!f || !game) return false;
    const sheets: number[] = [];
    for (const t of game.vanillaNearbyStations()) {
      const sheet = TILE_DEFS[t]?.vanilla?.sheet;
      if (typeof sheet === 'number') sheets.push(sheet);
    }
    return filterRemainOpen(f, sheets);
  }

  /** 站点 focus 钧落地(InteractWithCraftingStation Player.cs:33555-33561 → classic 支
   *  CraftingUI.OpenCloseFilter CraftingUI.cs:146-159):格交互右键合成站/水源 →
   *  开包 + 网格态 + 站点过滤;网格已开时再点 = 清过滤(:148-153 支)。modern 支
   *  (NewCraftingUI.OpenCloseFilter)=分期(债#2-modern),本刀落地 playerInventory
   *  副作用面(:33545 AdjTiles 本仓 vanillaNearbyStations 每刷新拍同源,无需单独调)。 */
  openCraftingStationFilter(f: CraftingTileFilter): void {
    if (options.data.craftingGridControl === 'classic' && this._builtLayout === 'vanilla') {
      const invOpen = this.invPanel.style.display === 'block';
      if (invOpen && this.vinvPipsUseGrid) {
        this.vinvCraftFilter = null;                  // :148-153 网格已开 → 清过滤(关浮窗支)
        this.vinvRefreshCraft();
        return;
      }
      this.vinvCraftFilter = f;                       // :154
      this.openInventory(true);                       // :156 Player.OpenInventory
      this.vinvPipsUseGrid = true;                    // :157
      this.vinvSyncGridToggle();
      this.vinvRefreshCraft();
      // ★SW-RB13b:PipsUseGrid=true 置位后箱条吞门/变体回位 pos 闭包须重跑
      //   (开箱态右键合成站→网格开→ChestUI.cs:81 吞箱条;不重排=箱条滞留)
      this.vinvLayoutSig = '';
      this.layoutVanilla();
    } else if (this._builtLayout === 'vanilla') {
      // ★SW-FX41 P2-3:modern 支(:33556-33557 → NewCraftingUI.OpenCloseFilter
      //   NewCraftingUI.cs:938-964)——四支状态机(开窗/换滤器/清滤器/关窗+Matches 去重);
      //   开支内含 Player.OpenInventory 副作用面(:891)
      if (this.invPanel.style.display !== 'block') this.openInventory(true);
      this.vinvOpenCloseModernCraftFilter(f);
    } else {
      // classic 模式×classic 构建器布局(无网格/窗域)——playerInventory=true
      // 副作用面照走(OpenCloseFilter 开支 :156 Player.OpenInventory 同面)
      this.openInventory(true);
    }
  }

  // ---- 重铸原位(刀 12;Main.cs:42268-42393 逐式) ----
  // 槽 (50,270) ctx5(ItemSlot.Handle 全栈放入/取回)/文字 (100,270) 费用分档染色/
  // 锤钮 (120,310) UI_Reforge[0|1] hover 换图+cooldown 60t/储蓄 (180,258) 四库合计。
  // 显示门 = vinvReforgeOpen 且 无箱/无商店/无对话(:42277 自动退出);heldStack 出入
  // 由 closeInventory 归包链承担(原版 dropItemCheck 同相)。登记偏差:reforgeScale
  // 悬停脉冲以 CSS transition 近似;tint 灰随 alpha 同脉的次要观感差。
  private vinvReforgeOpen = false;
  /** ★刀19:向导反查态(InGuideCraftMenu Main.cs:1917)——向导对话"制作"置位;
   *  退出条件 = 开箱/开店/重开对话/重铸(:42396-42400)或关包(closeInventory) */
  private vinvGuideMenuOpen = false;
  private vinvGuideSlotModernEl: HTMLElement | null = null;
  private vinvGuideSlotClassicEl: HTMLElement | null = null;
  private vinvGuideModernCaptionEl: HTMLElement | null = null;
  private vinvGuideModernReqEl: HTMLElement | null = null;
  private vinvGuideClassicTextEl: HTMLElement | null = null;

  /** ★刀19:NPCChatText_GuideReverseCrafting(Main.cs:40724-40732)——音 12+置位;
   *  modern 控制模式(缺省) → NewCraftingUI.Open(quiet:true)。
   *  调用方 = mainFlow onGuideCraftOpen(vanilla 布局门控;classic 仍走反查浮层) */
  openVanillaGuideCraft(): void {
    if (this._builtLayout !== 'vanilla' || !this.game) return;
    this.game.sfx.play('menuTick', 1);                              // PlaySound(12) :40728
    this.vinvGuideMenuOpen = true;
    if (options.data.craftingGridControl === 'modern') this.vinvOpenModernCraft(null, true);   // :40729-40731
    this.vinvLayoutSig = '';                                        // 向导态入签 → 强制重排(经典位槽/文案/切换钮换位)
    this.layoutVanilla();
    this.vinvRefreshCraft();                                        // guideItem 空 → GetNumRecipes=0(modern)
  }

  /** ★刀19:双菜单退出面(每刷新拍消费,vinvRefreshCraft 头)。
   *  重铸态(Main.cs:42282-42285):chest/shop/talkNPC==-1/向导态 → InReforgeMenu=false;
   *  向导态(Main.cs:42396-42400):chest/shop/talkNPC==-1/重铸态 → 复位+窗收
   *  (NewCraftingUI.Close(quiet,returnToInventory))。talkNPC==-1 ≡ !npcDialogActive
   *  (会话保持入口后=走远距离保持链 closeNpcDialog 即触发) */
  private vinvGuideMenuExitCheck(): void {
    const g = this.game;
    const dlgNpc = (g as unknown as { dialogNpc?: unknown }).dialogNpc;
    if (this.vinvReforgeOpen) {
      if (!!this.openChest || !!g?.npcShopOpen || !dlgNpc || this.vinvGuideMenuOpen) {
        this.vinvReforgeOpen = false;   // reforgeItem 不清=原版 reforgeItem 静态量同相
        this.vinvLayoutSig = '';
        this.layoutVanilla();
      }
    }
    if (this.vinvGuideMenuOpen) {
      if (!!this.openChest || !!g?.npcShopOpen || !g?.npcDialogActive || this.vinvReforgeOpen) {
        this.vinvGuideMenuOpen = false;
        if (this.vinvModernCraftOpen) this.vinvCloseModernCraft(true);
        this.vinvLayoutSig = '';
        this.layoutVanilla();
        this.vinvRefreshCraft();
      }
    }
  }

  /** 内部 id → 原版 vid(vi_ 键前缀解析;原 openGuideSearch 局部闭包上提共享) */
  private vidOfItemOf(iid: number): number {
    const def = ITEM_DEFS[iid];
    const m = def && /^vi_(\d+)_/.exec(def.key);
    return m ? Number(m[1]) : -1;
  }

  /** 原版 vid → 本地化名 */
  private vidNameOf(vid: number): string {
    const k = VANILLA_ITEM_KEY_BY_ID[vid];
    return (k && Lang.itemNameByKey(k)) || String(vid);
  }

  /** 环境需求文本(GetRecipeRequirementsText Main.cs:42908-42958:站点/水/蜂蜜/岩浆/
   *  雪原/墓地/炬神恩赐 join(", "),前缀 inter[22];explicitNone=true 空集补 inter[23]
   *  ——物品项不在此串,材料走格面) */
  private recipeEnvReqText(r: VanillaRecipeLike, explicitNone: boolean): string {
    const parts: string[] = [];
    if (r.tile >= 0) parts.push(Lang.tileName(r.tile) ?? `站点 ${r.tile}`);
    if (r.water) parts.push(Lang.inter(53));
    if (r.honey) parts.push(Lang.inter(58));
    if (r.lava) parts.push(Lang.inter(56));
    if (r.snow) parts.push(Lang.inter(123));
    if (r.graveyard) parts.push(Lang.inter(124));
    if (r.torchGod) parts.push(Lang.inter(125));
    if (explicitNone && parts.length === 0) parts.push(Lang.inter(23));
    return `${Lang.inter(22)} ${parts.join(', ')}`;
  }

  /** ★刀19:向导槽/文案绘制面(双窗位共享;guideItem 变化/focus 变化/开态进入时消费)。
   *  文案无堆叠数(DrawGuideCraftText :42912/NewCraftingUI.cs:447 均 inter[21]+Name) */
  private vinvPaintGuideCraft(): void {
    const g = this.game;
    if (!g) return;
    const pl = this.guidePlaced;
    const capText = pl ? `${Lang.inter(21)} ${this.vidNameOf(this.vidOfItemOf(pl.id))}` : Lang.inter(24);
    const mkImg = (host: HTMLElement): void => {
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(g, pl!.id) || '';
      img.style.cssText = 'position:absolute; inset:0; margin:auto; max-width:46px; max-height:46px; image-rendering:pixelated;';
      img.draggable = false;
      host.appendChild(img);
    };
    // modern 位(DrawChildren NewCraftingUI.cs:441-458)
    const ms = this.vinvGuideSlotModernEl;
    if (ms) {
      ms.replaceChildren();
      if (pl) mkImg(ms);
    }
    if (this.vinvGuideModernCaptionEl) this.vinvGuideModernCaptionEl.textContent = capText;
    if (this.vinvGuideModernReqEl) {
      const r = this.vinvModernSelected ?? this.vinvCraftAvailV[this.vinvCraftFocusV]?.r ?? null;
      this.vinvGuideModernReqEl.textContent = r ? this.recipeEnvReqText(r, false) : '';
    }
    // 经典位(DrawGuideCraftText Main.cs:42901-42924:空=inter[24] 单行;有件=「需要 X」
    //   +「环境需求(explicitNone)」两行 → 单元素 \n 拆行(line-height 26=原文 +26px 步距))
    const cs = this.vinvGuideSlotClassicEl;
    if (cs) {
      cs.replaceChildren();
      if (pl) mkImg(cs);
    }
    if (this.vinvGuideClassicTextEl) {
      const r = this.vinvCraftAvailV[this.vinvCraftFocusV]?.r ?? null;
      this.vinvGuideClassicTextEl.textContent = pl
        ? `${capText}\n${r ? this.recipeEnvReqText(r, true) : ''}`
        : capText;
    }
  }
  private vinvReforgeSlotEl: HTMLElement | null = null;
  private vinvReforgeTextEl: HTMLElement | null = null;
  private vinvReforgeHammerEl: HTMLButtonElement | null = null;
  private vinvSavingsEl: HTMLElement | null = null;
  private vinvReforgeCooldownUntil = 0;
  private vinvReforgeHadItem = false;

  private vinvBuildReforge(): void {
    const root = this.vinvRoot;
    if (!root) return;
    // 重铸槽(ctx5:ItemSlot.Handle —— 放入=整件克隆含词缀,取回=回光标)
    // ★反馈轮8:0.85 缩放落地(原版槽视觉=52×0.85=44.2,文本 +50 → 缝 5.8px;
    //  旧码未缩放=槽 52px 全宽,文本 +50 反压槽 2px=用户报"格子太近")
    const slot = el('div', 'sw-slot');
    slot.style.cssText = 'position:absolute; width:52px; height:52px; background-image:none;'
      + '--slot-bgimg:url(sprites/vanilla/Inventory_Back.png); transform-origin:top left;'
      + 'transform:scale(0.85);';
    slot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) {
        if (!this.game.canReforge(this.heldStack)) { this.toast(Lang.text('Mods.SandboxWorld.Reforge.CannotReforge')); return; }
        this.reforgeItem = { ...this.heldStack };   // 整件克隆(ctx5 全栈语义,:42387)
        this.heldStack = null;
      } else if (this.reforgeItem) {
        this.heldStack = { ...this.reforgeItem };
        this.reforgeItem = null;
      }
      this.refreshAll();
    });
    slot.addEventListener('mouseenter', () => { if (this.reforgeItem) this.showReforgeTooltip(); });
    slot.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; cancelAnimationFrame(this.tooltipPulseRaf); });
    root.appendChild(slot);
    this.vinvReforgeSlotEl = slot;
    this.vinvLayoutItems.push({ el: slot, pos: () => {
      if (!this.vinvReforgeVisible()) return null;
      return { x: 50, y: 270 };
    } });
    // 文字((100,270):有件=Reforge: 分档染色费用;无件=inter[20] 提示)
    const text = el('div', 'vinv-txt');
    text.style.cssText += 'font-size:14px; pointer-events:none; white-space:nowrap;';
    root.appendChild(text);
    this.vinvReforgeTextEl = text;
    this.vinvLayoutItems.push({ el: text, pos: () => {
      if (!this.vinvReforgeVisible()) return null;
      return { x: 100, y: 270 };
    } });
    // 锤钮((120,310) 中心锚;UI_Reforge[0|1] hover 换图;cooldown 60t(:42338))
    const hammer = el('button', 'vinv-btn') as HTMLButtonElement;
    const hImg = document.createElement('img');
    hImg.draggable = false;
    hImg.style.cssText = 'width:100%; height:100%; image-rendering:pixelated; pointer-events:none;';
    hImg.src = 'sprites/vanilla-ui/UI_Reforge_0.png';
    hammer.appendChild(hImg);
    hammer.addEventListener('mouseenter', () => { hImg.src = 'sprites/vanilla-ui/UI_Reforge_1.png'; });
    hammer.addEventListener('mouseleave', () => { hImg.src = 'sprites/vanilla-ui/UI_Reforge_0.png'; });
    hammer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (!this.reforgeItem) return;
      if (performance.now() < this.vinvReforgeCooldownUntil) return;   // reforgeCooldown=60t(:42338)
      const cost = this.game.reforgeCost(this.reforgeItem);
      if (this.game.coinsOwned() < cost) return;   // 原版 BuyItem 失败=静默(:42346)
      const np = this.game.doReforge(this.reforgeItem);
      if (np < 0) return;
      this.vinvReforgeCooldownUntil = performance.now() + 1000;
      this.toast(`${Lang.inter(46)}: ${cost} · ${prefixDisplayName(np)}`);
      this.refreshAll();
    });
    root.appendChild(hammer);
    this.vinvReforgeHammerEl = hammer;
    this.vinvLayoutItems.push({ el: hammer, pos: () => {
      if (!this.vinvReforgeVisible() || !this.reforgeItem) return null;   // 有件才画锤(:42310)
      return { x: 120, y: 310 };
    } });
    // 储蓄((180,258) DrawSavings ItemSlot.cs:四库有钱画图标+储蓄总额)
    const sav = el('div', 'vinv-txt');
    sav.style.cssText += 'font-size:13px; pointer-events:none; display:flex; align-items:center; gap:3px;';
    root.appendChild(sav);
    this.vinvSavingsEl = sav;
    this.vinvLayoutItems.push({ el: sav, pos: () => {
      if (!this.vinvReforgeVisible() || !this.reforgeItem) return null;   // DrawSavings 在有件支(:42318)
      return { x: 180, y: 258 };
    } });
  }

  /** 显示门(:42277-42285:InReforgeMenu ∧ 无箱 ∧ 无店 ∧ talkNPC!=-1——★刀19:会话
   *  保持入口后 talkNPC 恒在,走远=closeNpcDialog → 门翻假;旧 !dlgNpc 极性反写
   *  =对话消失反而保持可见=用户报"远离后格子滞留") */
  private vinvReforgeVisible(): boolean {
    const dlgNpc = (this.game as unknown as { dialogNpc?: unknown }).dialogNpc;   // Game 私有域,运行期读
    return this.vinvReforgeOpen && !this.openChest && !this.game.npcShopOpen && !!dlgNpc;
  }

  /** 重铸拍回写:槽面/费用分档染色/储蓄四库(Main.cs:42286-42320) */
  private vinvUpdateReforge(): void {
    const slot = this.vinvReforgeSlotEl;
    if (!slot || !this.game) return;
    // 锤/储蓄显隐随 reforgeItem 有无(:42310 有件才画锤)——有件态变化不在布局
    // 签名里,此处强制重排(红队 MAJOR-3 同族教训:显隐依赖可变状态必须触发 relayout)
    if (this.vinvReforgeHadItem !== !!this.reforgeItem) {
      this.vinvReforgeHadItem = !!this.reforgeItem;
      this.vinvLayoutSig = '';
      this.layoutVanilla();
    }
    // 槽面
    slot.querySelector('img')?.remove();
    slot.querySelector('.cnt')?.remove();
    if (this.reforgeItem) {
      const img = el('img') as HTMLImageElement;
      img.draggable = false;
      img.src = iconUrl(this.game, this.reforgeItem.id);
      slot.appendChild(img);
      if (this.reforgeItem.stack > 1) slot.appendChild(el('span', 'cnt', String(this.reforgeItem.stack)));
    }
    // 文字(有件=费用分档;无件=inter[20];:42286-42322)
    const text = this.vinvReforgeTextEl;
    if (text) {
      if (this.reforgeItem) {
        const cost = this.game.reforgeCost(this.reforgeItem);
        text.innerHTML = `${Lang.inter(46)}: ` + this.vinvCoinSpans(cost);
      } else {
        text.textContent = Lang.inter(20);   // 将物品放到此处重铸
      }
    }
    // 储蓄(DrawSavings:四库钱币合计,只计有币的库画图标)
    const sav = this.vinvSavingsEl;
    if (sav) {
      const banks = this.game.player.banks ?? [];
      const COIN_VAL = [1, 100, 10000, 1000000];
      const ICON_VID = [87, 346, 3813, 4076];
      let total = 0;
      const hasCoin: boolean[] = [];
      for (let b = 0; b < 4; b++) {
        const items = (banks[b] ?? []) as Array<{ id: number; stack: number } | null>;   // p.banks[bi] 即槽位数组(Game.ts:24240)
        let sum = 0;
        for (const s of items) {
          if (!s) continue;
          const d = coinIndexOf(s.id);
          if (d >= 0) sum += COIN_VAL[d] * s.stack;
        }
        hasCoin[b] = sum > 0;
        total += sum;
      }
      if (total <= 0) { sav.replaceChildren(); return; }
      sav.replaceChildren();
      sav.appendChild(el('span', '', `${Lang.inter(66)} `));
      for (let b = 0; b < 4; b++) {
        if (!hasCoin[b]) continue;
        const k = VANILLA_ITEM_KEY_BY_ID[ICON_VID[b]];
        const iid = k !== undefined ? ITEM_BY_KEY[k] : undefined;
        if (iid === undefined) continue;
        const im = el('img') as HTMLImageElement;
        im.src = iconUrl(this.game, iid);
        im.draggable = false;
        im.style.cssText = 'width:20px; height:20px; image-rendering:pixelated;';
        sav.appendChild(im);
      }
      sav.appendChild(el('span', '', formatCopper(total)));
    }
  }

  /** 费用分档染色(Main.cs:42292-42321:铂/金/银/铜四档各自原版币色) */
  private vinvCoinSpans(copper: number): string {
    // 币名 = Lang.inter[15]铂/[16]金/[17]银/[18]铜(:42304-42321 同族);色 = 原版币色近似
    const COLORS = ['#dedee8', '#f0c840', '#c0c0cc', '#d08040'];
    const DIV = [1000000, 10000, 100, 1];
    let rest = Math.max(1, copper);
    let html = '';
    for (let d = 0; d < 4; d++) {
      const n = Math.floor(rest / DIV[d]);
      rest -= n * DIV[d];
      if (n <= 0) continue;
      html += `<span style="color:${COLORS[d]}">${n} ${Lang.inter(15 + d)}</span> `;
    }
    return html || `<span style="color:${COLORS[3]}">0 ${Lang.inter(18)}</span>`;
  }

  /** 列表滚轮(格/材料格/命中区/窗口级 flag 支共用;滚轮悬停格子上也有效——★用户实测二轮)。
   *  ★SW-FX38 滚距定谳:Main.cs:17633-17640 flag 支 ScrollCraftingList(num) →
   *  CraftingUI.cs:572-583 `focusRecipe += mouseWheel`【单次整批】+钳 [0,n−1];
   *  档数=vanillaWheelNotches(Delta/120 C# 向零截断——子档拍=0 无位移无音,±240=±2
   *  档一拍全走);符号=原版滚轮【上滚】为正档(XNA ScrollWheelValue 上滚递增)⇒
   *  deltaY<0(上滚)→ +1。★音效不在本面(:572-583 全程无 PlaySound)——吸附步进
   *  每越 65px 行界一响(:388-393,vinvCraftSnapStep)。 */
  private vinvCraftWheel(e: WheelEvent): void {
    e.stopPropagation();
    const rows = this.vinvCraftAvailV;
    if (!rows.length) return;
    // ★SW-RB14d（FX38-F2）：量化语义 1:1——原版 ScrollWheelDelta=ScrollWheelValue
    //  （【跨事件累计量】,PlayerInput.cs:1407 += 每事件累加）帧间差分(:901-902),
    //  即一帧内多次/亚 notch 滚动【先累计再 /120】。旧刀逐事件 trunc:macOS 触控板/
    //  惯性每次 ±(4~60)px → 每事件 0 档整段吞零(与"比原版快"同源的逆偏差)。
    //  余数累计器=同构语义:累计像素、整档消费、余数留置(量化相位在事件界而非帧界,
    //  <1 拍差,净档数逐值同)。
    this.vinvCraftWheelPendPx += wheelEventPx(e.deltaY, e.deltaMode);   // ★SW-RB14d：并补传 deltaMode
    const num = vanillaWheelNotches(this.vinvCraftWheelPendPx);         // Main.cs:17594(取负=浏览器同手势)
    if (num === 0) return;                                // 子档拍:ScrollCraftingList(0) 零位移零音（余数留置）
    this.vinvCraftWheelPendPx += num * 120;               // 消费整档,余数留累计器
    const next = Math.min(rows.length - 1, Math.max(0, this.vinvCraftFocusV + num));   // :574-582
    this.vinvCraftFocusGoto(next);
    // ★SW-RB14d 债 FX38-F4：此同步步 + rAF 配额步（dt/16.67 档）在事件落在两帧
    //  之间时首窗得 2 步（原版 Update 消费滚轮→Draw 恰 1 步）,滑行提前 ~1 步、
    //  行界音同步提前一拍;且配额在任意 pip 页推进,原版仅 Recipes 页(:42425-42427
    //  DrawRecipesList 内 AdjustRecipeOffsets)——亚秒级观感差,不动刀（改动牵动
    //  快感面,留独立批）。另:rebuild 面板撤除时 focus/glide 清零(FX38-F5)无原版
    //  对应物（focusRecipe 静态量,切页/换分辨率不重置 Main.cs:1806）——同债登记。
  }

  /** ★SW-FX38 焦点迁移+重锚播种(CraftingUI.cs:394-399 全行重锚不变式
   *  availableRecipeY[i]=glideY+(i−focus)·65 ⇒ focus 变更时 glideY 按【新焦点行迁移前
   *  旧位】重播种——:380 num2=availableRecipeY[focusRecipe] 读的正是它,吸附由此起步)。 */
  private vinvCraftFocusGoto(next: number): void {
    const prev = this.vinvCraftFocusV;
    if (next === prev) return;
    this.vinvCraftGlideY += (next - prev) * 65;
    this.vinvCraftFocusV = next;
  }

  /** ★SW-FX38 吸附步进(DrawRecipes_AdjustRecipeOffsetSnappy CraftingUI.cs:376-404,
   *  每绘制拍;原版"切换速度"本体=此拍面,非滚轮面瞬移):
   *  num2=glideY;original=fast?0:MoveTowards(num2·0.97,0,6.5)(:381-386);
   *  trunc(num2/65)≠trunc(original/65) → SoundID 12(每越行界一响 :388-393,多档滚动
   *  N 响随滑行散布);num2==0 → fast=false(:400-403)。返回是否位移。 */
  private vinvCraftSnapStep(): boolean {
    const num2 = this.vinvCraftGlideY;
    const original = this.vinvCraftFastScroll ? 0 : craftSnapEase(num2);
    if (craftSnapCrossedRow(num2, original)) this.game.sfx.play('menuTick', 1);   // :390-393
    this.vinvCraftGlideY = original;
    if (num2 === 0) this.vinvCraftFastScroll = false;     // :400-403
    if (original !== num2) this.vinvUpdateCraftList();
    return original !== num2;
  }

  /** ★原版槽底脉冲(Main.cs:46460-46474):invAlpha 每游戏拍 ±0.2 循环 180↔240。
   *  rAF 单点驱动:root 单写 --invpulse(全槽 calc 派生),材料行/列表 alpha 读数。
   *  dt 归一(高刷屏 1:1 周期);开包启动/关包停(广播零开销) */
  private vinvPulseA = 180;
  private vinvPulseDir = 1;
  private vinvPulseRaf = 0;
  private vinvPulseLast = 0;
  private vinvPulseTick = (ts: number): void => {
    if (!this.vinvRoot || this.vinvRoot.style.display === 'none') {
      this.vinvCraftFastScroll = true;   // ★SW-FX38:!playerInventory 每拍置 fast(Main.cs:46428)→ 重开首拍瞬吸
      this.vinvPulseRaf = 0; return;
    }
    // ★SW-FX10 债⑨ mH 每帧新鲜度：原版 mH 每帧重算（Main.cs:46537 DrawInterface_16）——
    //  Tab 循环地图样式/全屏图开关会即时改 mH → num20/右锚列全体位移。layoutVanilla
    //  无每帧挂点（仅 refresh/resize/页切），此处每帧比对小地图态布尔，值变才走
    //  重排（签名含 minimapOn → 必然重排；不变时零 DOM 写）
    {
      const mm = this.game ? (this.game.renderer.mapStyle === 1 && !this.game.mapFullscreen()) : true;
      if (this.vinvLayoutCtx && this.vinvLayoutCtx.minimapOn !== mm) this.layoutVanilla();
    }
    // ★SW-RB13b:站点过滤失效拍逐帧化(DrawGridToggle 头 CraftingUI.cs:268-272 每帧执行)
    //   vinvRefreshCraft 是事件驱动刷新——走远站后无事件则滤器滞留(原版 adjTile 每拍
    //   AdjTiles 重算+逐帧门)。filter 非空才走(零负载):vanillaNearbyStations=±5/±3 盒扫
    if (this.vinvCraftFilter && this._builtLayout === 'vanilla') {
      const invOpen = this.invPanel.style.display === 'block';
      if (!invOpen || !this.vinvFilterRemain()) {
        this.vinvCraftFilter = null;
        this.vinvRefreshCraft();   // 失效拍清滤+按全量配方域重列(ClearHacks 同相 CraftingUI.cs:142)
      }
    }
    // ★SW-FX41:NewCraftingUI.Update(NewCraftingUI.cs:655-665 UpdateUIStates
    //   Main.cs:17678-17682 每拍)——站点滤器失效 → Close(quiet:false,
    //   returnToInventory:true)(音 11+背包保持);_filter==null 时零开销
    if (this.vinvModernCraftOpen && this.vinvModernCraftFilter !== null && this._builtLayout === 'vanilla') {
      if (!this.vinvFilterRemain(this.vinvModernCraftFilter)) this.vinvCloseModernCraft(false);
    }
    const dt = this.vinvPulseLast ? Math.min(100, ts - this.vinvPulseLast) : 16.67;
    this.vinvPulseLast = ts;
    // ★SW-FX38 列表吸附步进(CraftingUI.cs:376-404 每绘制拍):原版 Frame Skip 缺省
    //   60fps ⇒ dt 累积整数步配额(高刷屏不 2× 快进,后台回前台 dt=100ms 钳 6 步防跳变)
    this.vinvCraftGlideAcc += dt / (1000 / 60);
    if (this.vinvCraftGlideAcc >= 1) {
      let steps = Math.floor(this.vinvCraftGlideAcc);
      this.vinvCraftGlideAcc -= steps;
      if (steps > 6) steps = 6;
      for (let k = 0; k < steps; k++) this.vinvCraftSnapStep();
    }
    this.vinvPulseA += this.vinvPulseDir * 0.2 * (dt / 16.67);
    if (this.vinvPulseA > 240) { this.vinvPulseA = 240; this.vinvPulseDir = -1; }
    if (this.vinvPulseA < 180) { this.vinvPulseA = 180; this.vinvPulseDir = 1; }
    this.vinvRoot.style.setProperty('--invpulse', ((this.vinvPulseA - 180) / 60).toFixed(4));
    this.vinvPulseRaf = requestAnimationFrame(this.vinvPulseTick);
  };
  private vinvPulseStart(): void {
    if (!this.vinvPulseRaf) { this.vinvPulseLast = 0; this.vinvPulseRaf = requestAnimationFrame(this.vinvPulseTick); }
  }

  // ---- 宝箱条(★2026-09-08 用户实测三轮:原版开箱非独立 modal,而是直接在物品栏
  //  下方叠槽。权威:ChestUI.Draw(:79-100)+DrawSlots(:324-360):scale 0.755、
  //  x=trunc(73+col·56·0.755)、y=trunc(invBottom+row·56·0.755)、invBottom=258;
  //  名字 @(504,258);按钮列 @(506,invBottom+40+ID·26) 文本 0.75 缩放。
  //  ★SW-FX28 刀①:数值面已迁 vanillaInvLayout CHEST_SCALE/chestSlotXY/
  //  CHEST_NAME_XY/chestButtonXY 单源(vanilla-inv-layout 登记债#1 箱侧清偿)) ----
  private vinvChestNameEl: HTMLElement | null = null;
  private vinvChestBtnEls: HTMLButtonElement[] = [];

  // ---- 建筑配件图标列（★SW-FX19 债清偿；Main.cs:48142-48377 DrawBuilderAccToggles）----
  //  背包开即画 @(10,77) 竖列 24px 步距、10 槽序 8,9,0,1,2,3,4,5,6,7（:48166 num2 循环
  //  i=0→num3=8/i=1→num3=9/其余 num3=i-2）;每槽门=对应配饰装备(:48177 InfoAccMechShowWires
  //  =3619/3611、:48193 rulerLine=【恒可见】(旗经 ResetEffects Player.cs:18809 每拍
  //  置 true,SW-FX36 修正——旧注 486/3611 系把置位支当门)、:48207 rulerGrid=2799/3611、:48229
  //  autoPaint=2216/3061/5126、:48249 autoActuator=3624——缺配饰 continue 不画;
  //  ★FX36 判定域=背包∪装备(UpdateEquips :12997-13004 全 inventory 扫描,信息配件族
  //  不必装备),旧「仅配饰槽」域已撤)。
  //  点击:二态位 0↔1(:48201 等)+音 12 menuTick;线材可见度族 4 态 ++>=3→0(:48340-48343
  //  quirk——Hidden 3 点击不可达)。悬停 tooltip GameUI.*(:48196-48320);尾随方块替换
  //  图标 (:43242 @(0,44) 音 22 unlock) + 群系炬图标 (:43282 @(0,68) unlockedBiomeTorches
  //  才画)。totalDrawnIcons>=10 → 列整体上移 24、44→23、68→47(:48166/:43247/:43289)。
  //  悬停 InfoIcon[13] 星与 UILinkPoint(手柄)未建模=登记。
  private vinvBuildBuilderAccToggles(): void {
    const root = this.vinvRoot;
    if (!root) return;
    const statusOf = (): number[] => this.game?.player.builderAccStatus ?? builderAccDefaults();
    // ★SW-FX36：旗位判定域=背包∪装备扫描（UpdateEquips :12997-13004 逐 inventory[0..57]
    //  槽调 RefreshMechanicalAccsFromItemType——信息配件族不必装备;装备段
    //  GrantArmorBenefits :13204。旧「仅配饰槽」域=wiki 明证偏差）
    const gatesOf = () => builderAccGateSet((vid) => {
      const g = this.game;
      return !!g && playerVidCarried(g.player.inv.slots, g.player.inv.armor, g.player.inv.accSlotMax, vid);
    });
    const ICON_SRC = 'sprites/vanilla-ui/UI_BuilderIcons.png';
    const slotEls: Array<HTMLButtonElement | null> = BUILDER_ACC_ICON_ORDER.map(() => null);
    const paintSlot = (i: number): void => {
      const b = slotEls[i];
      if (!b) return;
      const idx = BUILDER_ACC_ICON_ORDER[i].accIndex;
      const on = statusOf()[idx] === 0;
      b.style.opacity = on ? '1' : '0.497';   // color2 = (127,127,127) ≙ White×0.498(:48168)
    };
    // ★2026-09-13 反馈轮6:hover 文案抽函数走自有气泡(:48300-48320 MouseText 域;
    //  文案随 num3 走的映射错位 quirk 见 BUILDER_ACC_ICON_ORDER 注)
    const baccTipOf = (idx: number): string => {
      const on = statusOf()[idx] === 0;
      switch (idx) {
        case BACC.HideAllWires: return Lang.text(on ? 'GameUI.WireModeForced' : 'GameUI.WireModeNormal');
        case BACC.RulerLine: return Lang.text(on ? 'GameUI.RulerOn' : 'GameUI.RulerOff');
        case BACC.RulerGrid: return Lang.text(on ? 'GameUI.MechanicalRulerOn' : 'GameUI.MechanicalRulerOff');
        case BACC.AutoActuate: return Lang.text(on ? 'GameUI.ActuationDeviceOn' : 'GameUI.ActuationDeviceOff');
        case BACC.AutoPaint: return Lang.text(on ? 'GameUI.PaintSprayerOn' : 'GameUI.PaintSprayerOff');
        default: {
          const arg = ({ 4: 'Game.RedWires', 5: 'Game.BlueWires', 6: 'Game.GreenWires', 7: 'Game.YellowWires', 9: 'Game.Actuators' } as Record<number, string>)[idx] ?? '';
          const st = statusOf()[idx];
          const mode = Lang.text(st === 0 ? 'GameUI.Bright' : st === 1 ? 'GameUI.Normal' : st === 2 ? 'GameUI.Faded' : 'GameUI.Hidden');
          return `${Lang.text(arg)}: ${mode}`;
        }
      }
    };
    const visGateOf = (idx: number, g: ReturnType<typeof builderAccGateSet>): boolean => {
      // ★SW-FX36：Ruler 档(:48193 门 `player.rulerLine`)恒可见——旗位在 ResetEffects
      //  (Player.cs:18809) 每拍置 true、全仓无置 false 点,与配饰持有无关
      if (idx === BACC.RulerLine) return true;
      if (idx === BACC.RulerGrid) return g.rulerGrid;
      if (idx === BACC.AutoActuate) return g.autoActuator;
      if (idx === BACC.AutoPaint) return g.autoPaint;
      return g.infoAccMechShowWires;              // 8/9/4-7 同门(:48177/:48290)
    };
    BUILDER_ACC_ICON_ORDER.forEach((slot, i) => {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.cssText = 'width:14px; height:14px; image-rendering:pixelated;'
        + `background-image:url(${ICON_SRC}); background-size:160px 32px;`;
      this.vinvBindHoverTip(b, () => baccTipOf(slot.accIndex));
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const st = statusOf();
        if (slot.wireMode) cycleWireVisibility(st, slot.accIndex);
        else toggleBuilderAccBit(st, slot.accIndex);
        this.game?.sfx.play('menuTick', 1);       // SoundEngine.PlaySound(12) :48203 等
        paintSlot(i);
        this.showBuffTooltip(b, baccTipOf(slot.accIndex), '');   // 点击即刷新(mousedown 必在悬停态)
      });
      root.appendChild(b);
      slotEls[i] = b;
      this.vinvLayoutItems.push({
        el: b,
        pos: () => {
          const c = this.vinvLayoutCtx;
          if (!c || !this.game) return null;
          const g = gatesOf();
          if (!visGateOf(slot.accIndex, g)) return null;   // 缺配饰 continue(:48179)——num 不进
          const torch = !!this.game.world.flags.unlockedBiomeTorches;
          const pushUp = builderAccTotalIcons(g, torch) >= 10;
          // start=(10,77)（:48241）;start.Y += 24*torchGodIcons（:48166,★SW-RB11f F4
          //  旧实现漏此支——炬神恩赐开∧total<10 时图标列与方块替换/群系炬图标重叠）;
          // flag(total>=10) → vector.Y -= 24（:48167-48169）;
          // 行号 = 已画图标数（num 只对实际画出的槽 ++ :48362——隐藏槽不留空行）
          const drawn = BUILDER_ACC_ICON_ORDER.slice(0, i)
            .filter((s2) => visGateOf(s2.accIndex, g)).length;
          const y0 = builderAccColumnTopY(torch, pushUp);
          const idx = slot.accIndex;
          b.style.backgroundPosition = `${-idx * 16}px -16px`;   // rect(0,16,14,14) X=idx*16
          paintSlot(i);
          // ★反馈轮7 定谳(用户原版截图证伪旧"顶格"实现):vector=【中心锚】——
          //   spriteBatch.Draw(..., origin: rectangle.Size()/2f)(Main.cs:48354),
          //   hover 盒 CenteredRectangle(vector,14)(:48197)同心 ⇒ 精灵左上=vector-(7,7)
          //   =(3,70+24n)。旧 (10,y) 顶格画=整体右/下偏 7px=用户报的错位。
          return { x: 10 - 7, y: y0 + drawn * 24 - 7 };
        },
      });
    });

    // 方块替换图标（Main.cs:43242-43280 DrawBlockReplacementIcon @(0,44/23) 音 22）
    {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.cssText = 'width:22px; height:20px; image-rendering:pixelated;'
        + 'background-image:url(sprites/vanilla-ui/UI_BlockReplace_0.png); background-size:72px 22px;';
      const paint = (): void => {
        const on = statusOf()[BACC.BlockSwap] === 0;
        b.style.backgroundPosition = `${on ? 0 : -24}px 0px`;  // Frame(3,1,on?0:1) :43251
      };
      // ★2026-09-13 反馈轮6:hover 名走自有气泡(:43260-43266 MouseText 域)
      this.vinvBindHoverTip(b, () =>
        Lang.text(statusOf()[BACC.BlockSwap] === 0 ? 'GameUI.BlockReplacerOn' : 'GameUI.BlockReplacerOff'));
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        toggleBuilderAccBit(statusOf(), BACC.BlockSwap);
        this.game?.sfx.play('unlock', 1);           // SoundEngine.PlaySound(22) :43268
        paint();
        this.showBuffTooltip(b, Lang.text(statusOf()[BACC.BlockSwap] === 0 ? 'GameUI.BlockReplacerOn' : 'GameUI.BlockReplacerOff'), '');
      });
      root.appendChild(b);
      this.vinvLayoutItems.push({
        el: b,
        pos: () => {
          const c = this.vinvLayoutCtx;
          if (!c || !this.game) return null;
          const g = gatesOf();
          const pushUp = builderAccTotalIcons(g, !!this.game.world.flags.unlockedBiomeTorches) >= 10;
          paint();
          return { x: 0, y: pushUp ? 23 : 44 };     // :43246-43250
        },
      });
    }

    // 群系炬图标（Main.cs:43282-43320 DrawTorchBiomeSwapIcon @(0,68/47),Extra_211 四帧,
    // unlockedBiomeTorches 才画 :48370——本仓 flags.unlockedBiomeTorches 同源）
    {
      const b = el('button', 'vinv-btn') as HTMLButtonElement;
      b.style.cssText = 'width:24px; height:22px; image-rendering:pixelated;'
        + 'background-image:url(sprites/vanilla/Extra_211.png); background-size:104px 24px;';
      const paint = (): void => {
        const on = statusOf()[BACC.TorchBiome] === 0;
        b.style.backgroundPosition = `${(on ? 1 : 0) * -26}px 0px`;   // Frame(4,1,on?1:0) :43291
      };
      // ★2026-09-13 反馈轮6:hover 名走自有气泡(:43300-43306 MouseText 域)
      this.vinvBindHoverTip(b, () =>
        Lang.text(statusOf()[BACC.TorchBiome] === 0 ? 'GameUI.TorchTypeSwapperOn' : 'GameUI.TorchTypeSwapperOff'));
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        toggleBuilderAccBit(statusOf(), BACC.TorchBiome);
        this.game?.sfx.play('unlock', 1);           // SoundEngine.PlaySound(22) :43308
        paint();
        this.showBuffTooltip(b, Lang.text(statusOf()[BACC.TorchBiome] === 0 ? 'GameUI.TorchTypeSwapperOn' : 'GameUI.TorchTypeSwapperOff'), '');
      });
      root.appendChild(b);
      this.vinvLayoutItems.push({
        el: b,
        pos: () => {
          const c = this.vinvLayoutCtx;
          if (!c || !this.game) return null;
          if (!this.game.world.flags.unlockedBiomeTorches) return null;   // :48370 门
          const g = gatesOf();
          const pushUp = builderAccTotalIcons(g, true) >= 10;
          paint();
          return { x: 0, y: pushUp ? 47 : 68 };     // :43289-43292
        },
      });
    }
  }
  private vinvBuildChest(): void {
    // 名字(Main.cs:504,invBottom;openChestPanel 的 bankNames 语义在 paint 侧回写)
    // ★SW-FX28 刀①:坐标迁 vanillaInvLayout.CHEST_NAME_XY 单源(ChestUI.cs:158)
    const nameEl = el('div', 'vinv-txt');
    // ★SW-RB13b:pointer-events:none(.vinv-txt 基线)——DrawName(ChestUI.cs:158)纯
    //   DrawString 无命中盒,且 (504,258) 在箱域 FloatIntersect(:84 x≤495.8)外;
    //   曾 auto=无处理器的世界点击死区(504..~580 × 258..~273)
    nameEl.style.cssText += 'font-size:13px;';
    this.vinvRoot?.appendChild(nameEl);
    this.vinvChestNameEl = nameEl;
    this.vinvLayoutItems.push({ el: nameEl, pos: () => {
      // ★SW-FX30 刀②:网格态吞箱条面(ChestUI.cs:81 chest!=-1 && !PipsUseGrid && !modern——
      // 原版 PipsUseGrid 时不画箱名/按钮/槽)。★SW-RB14b:补第三门 !NewCraftingUI.Visible
      // (ChestUI.cs:81 三门 verbatim;1458 同行)——FX41 modern 窗落地+craftingGridControl
      // 缺省回切 modern 后窗开态可达:开箱→开窗,原版箱条整面让位,本仓曾滞留叠画
      if (!this.openChest || this.vinvPipsUseGrid || this.vinvModernCraftOpen) return null;
      return { x: CHEST_NAME_XY.x, y: CHEST_NAME_XY.y };
    } });
    // 40 槽(scale 0.755;context 3/4/32 由 slotContext('chest') 经 openChest.x 分派)
    // ★SW-FX28 刀①:几何迁 vanillaInvLayout.chestSlotXY/CHEST_SCALE 单源
    // (ChestUI.cs:358/:375-376;行主序 num4=i+j*10 :372)
    for (let i = 0; i < 40; i++) {
      const s = this.vinvMakeSlot('chest', i, CHEST_SCALE);
      this.vinvRoot?.appendChild(s);
      const { x, y } = chestSlotXY(i);
      // ★SW-RB14b:第三门 !NewCraftingUI.Visible(ChestUI.cs:81 三门 verbatim,1458 同行)
      this.vinvLayoutItems.push({ el: s, pos: () => (this.openChest && !this.vinvPipsUseGrid && !this.vinvModernCraftOpen ? { x, y } : null) });   // ChestUI.cs:81 网格态吞箱槽(SW-FX30/SW-RB14b)
    }
    // 按钮列(DrawButtons :182-188:Y=invBottom+40+ID·26,ID 跳号位保留;
    // ID0 拿走全部/1 存放全部/2 快速堆叠/3 补货(inter[82])/4 排列物品(inter[122]);
    // ★BJ69(2026-09-14):ID5 重命名落地(:193 仅真箱 chest>-1 可见——储蓄族 x<0 隐藏;
    //   点击=RenameChest :823 OpenVirtualKeyboard(2) 的 DOM 对话承载,见 showChestRenameDialog);
    //   ID6 取消(RenameChestCancel :859)原版仅 editChest 态可见(:193 !editChest 隐藏)——
    //   本仓编辑态=模态对话面板域,取消钮在面板内,列位 ID6 恒不可见=不落(结构注)
    //   文本 0.75 缩放 hover 1)
    // ★SW-RB13b:①悬停色=OurFavoriteColor(Main.cs:886=(255,231,69);DrawButton :227
    //   flag→color=OurFavoriteColor),曾 #c8f0c8 自创绿;②锚=竖直居中(origin=vector/2
    //   :234 → 文本中线在 Y,命中盒 Y-12..Y+12 :223;DOM 用 translateY(-50%)+5.5px
    //   上下 padding 复刻 24px 命中带,x 左对齐 506(:222 X-num2=506)不偏)
    const mkChestBtn = (id: number, labelKey: string, act: () => void, visible?: () => boolean, label?: string): void => {
      const b = el('button', 'vinv-txt') as HTMLButtonElement;
      b.style.cssText = 'left:506px; font-size:13px; pointer-events:auto; cursor:pointer;'
        + 'background:none; border:none; padding:5.5px 0; color:#fff; text-shadow:1px 1px 0 #000;'
        + 'transform:translateY(-50%);';
      b.textContent = label ?? Lang.text(labelKey);
      b.addEventListener('mouseenter', () => { b.style.color = 'rgb(255,231,69)'; });
      b.addEventListener('mouseleave', () => { b.style.color = '#fff'; });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); act(); });
      this.vinvRoot?.appendChild(b);
      this.vinvLayoutItems.push({ el: b, pos: () => {
        // ★SW-RB14b:补第三门 !NewCraftingUI.Visible(ChestUI.cs:81 三门 verbatim,1458 同行)
        if (!this.openChest || this.vinvPipsUseGrid || this.vinvModernCraftOpen) return null;   // ChestUI.cs:81 网格态吞钮(SW-FX30/SW-RB14b)
        if (visible && !visible()) return null;
        return chestButtonXY(id);   // ★SW-FX28 刀①:单源(ChestUI.cs:186/:198 Y+=ID*26)
      } });
      this.vinvChestBtnEls.push(b);
    };
    // 标签 = 自有键(官中现译 拿走全部/存放全部——vanilla 分片 全部拿走/全部放入
    // 与用户原版不符,且非 en 的 custom 无法覆盖既有 vanilla 键,故走自有键)
    mkChestBtn(0, 'Mods.SandboxWorld.Chest.LootAll', () => this.chestLootAll());
    mkChestBtn(1, 'Mods.SandboxWorld.Chest.DepositAll', () => this.chestDepositAll());
    mkChestBtn(2, 'Mods.SandboxWorld.Chest.QuickStack', () => this.chestQuickStack());
    mkChestBtn(3, 'Mods.SandboxWorld.Chest.Restock', () => this.chestRestock());      // 补货
    mkChestBtn(4, 'Mods.SandboxWorld.Chest.Arrange', () => this.chestSortChest());   // 排列物品
    // ID5 重命名(DrawButton :193 chest<-1 隐藏=仅世界箱;标签=inter[61] 官译「重命名」,
    // editChest 态标签切换 inter[47] 由对话面板承载=原版桌面态 fancyUI 覆盖同相)
    mkChestBtn(5, 'LegacyInterface.61', () => this.showChestRenameDialog(),
      () => (this.openChest?.x ?? -1) >= 0, Lang.inter(61));
  }

  /** 宝箱名回写(DrawName Main.cs :102-180 1:1):bank x<0=官译物品名;世界箱=
   *  命名箱名或 LegacyChestType[frameX/36] 箱型名(:122;★SW-FX11 2026-09-10:
   *  ChestData.name 已随档携带——原版 .wld 导入箱名自此回显。★BJ69 2026-09-14:
   *  重命名 UI 已落地=showChestRenameDialog,债清) */
  private vinvUpdateChestName(): void {
    const c = this.openChest;
    const el = this.vinvChestNameEl;
    if (!el || !c) return;
    if (c.x >= 0) {
      // 原版 DrawName 命名支（Main.cs:102-180）：chest.name 非空 → 箱名优先于型名
      if (c.name) { el.textContent = c.name; return; }
      el.textContent = this.vinvChestTypeName(c) ?? Lang.text('Mods.SandboxWorld.UI.Chest');
      return;
    }
    const bankNames: Record<number, string> = {
      [-2]: Lang.itemName(87) ?? '存钱罐',
      [-3]: Lang.itemName(346) ?? '保险箱',
      [-4]: Lang.itemName(3813) ?? '守护者熔炉',
      [-5]: Lang.itemName(4076) ?? '虚空保险库',
    };
    el.textContent = bankNames[c.x] ?? ((c as { name?: string }).name || Lang.text('Mods.SandboxWorld.UI.Chest'));
  }

  /** 箱型名（DrawName :122 LegacyChestType[frameX/36] 单源；★BJ69：重命名对话的
   *  defaultChestName 同源——OpenVirtualKeyboard(2) IngameFancyUI.cs:96-113 型名域） */
  private vinvChestTypeName(c: ChestData): string | null {
    if (c.x < 0 || c.x === undefined) return null;
    const st = this.game.world.store;
    const fx = st.frameX?.[st.idx(c.x, c.y)] ?? 0;
    return Lang.text(`LegacyChestType.${Math.floor(fx / 36)}`);
  }

  // ---- 箱改名对话（★BJ69 2026-09-14；ChestUI.RenameChest :823-864 + IngameFancyUI.
  //      OpenVirtualKeyboard(2) :86-153 1:1,DOM 对话承载=路牌双态对话同款近似）----
  //  原版流：ID5 点击 → RenameChest :823 !editChest → OpenVirtualKeyboard(2)：
  //  Sound 12(:89) + npcChatText=chest.name（空则 defaultChestName=型名 :96-113）+
  //  editChest=true(:115) + UIVirtualKeyboard(maxLength=20 :159/:429)。确认 →
  //  RenameChestSubmit(:836)；取消 → RenameChestCancel(:859)。编辑态 DrawName 预览
  //  （:106/:160）由面板输入框本相承载（桌面 fancyUI 覆盖世界=同相不可见）。
  private vinvChestRenameEl: HTMLElement | null = null;

  private showChestRenameDialog(): void {
    const c = this.openChest;
    if (!c || c.x < 0) return;                       // RenameChest :825 真箱域
    if (this.vinvChestRenameEl) this.vinvChestRenameEl.remove();
    UISfx.click();                                   // OpenVirtualKeyboard :89 Sound 12
    const defName = this.vinvChestTypeName(c);
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:360px;';
    panel.appendChild(el('div', 'sw-title', Lang.text('UI.EnterNewName')));   // :92 EnterNewName
    const input = el('input') as HTMLInputElement;
    input.value = c.name || defName || '';           // :93 npcChatText=chest.name;空→型名(:108-112)
    input.maxLength = 20;                            // UIVirtualKeyboard :159/:429 maxLength=20
    input.style.cssText = 'width:100%; box-sizing:border-box; font-size:13px; color:#d8d4e4;'
      + 'background:#14121c; border:1px solid #3a3350; border-radius:4px; padding:6px; margin-top:6px;';
    panel.appendChild(input);
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:10px; justify-content:flex-end;';
    const cancelBtn = el('button', 'sw-btn', Lang.inter(63));   // inter[63] 取消（:216/:863）
    cancelBtn.addEventListener('click', () => {                  // RenameChestCancel :859-864
      UISfx.click();                                             // Sound 12（:860）
      this.closeChestRenameDialog();
    });
    const saveBtn = el('button', 'sw-btn', Lang.inter(47));     // inter[47] 保存（editChest 态 ID5 标签 :216）
    saveBtn.addEventListener('click', () => {
      this.chestRenameSubmit(input.value);                     // RenameChestSubmit :836-853（Sound 12 在内）
      this.closeChestRenameDialog();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();                          // 键位面隔离（Esc 链/热栏数字不串）
      if (e.key === 'Enter') {                      // UIVirtualKeyboard Enter=submit
        this.chestRenameSubmit(input.value);
        this.closeChestRenameDialog();
      } else if (e.key === 'Escape') {              // UIVirtualKeyboard Esc=cancel
        UISfx.click();
        this.closeChestRenameDialog();
      }
    });
    row.appendChild(cancelBtn);
    row.appendChild(saveBtn);
    panel.appendChild(row);
    this.root.appendChild(panel);
    this.vinvChestRenameEl = panel;
    input.focus();
    input.select();
  }

  private closeChestRenameDialog(): void {
    this.vinvChestRenameEl?.remove();
    this.vinvChestRenameEl = null;
  }

  /** 箱改名提交（ChestUI.RenameChestSubmit Player.cs 域 :836-853 1:1）：
   *  chest<0（储蓄族）整支拒（:840-843）;提交名==defaultChestName(型名) → 存空=
   *  重置默认（:846-848）;chest.name 变更才落（:849-850）+ editedChestName=true
   *  （:851-853 netMode==1）→ 本仓等价=chestRenameLatch（下条 msg33 携改名尾段）。
   *  单人（无 net）=仅本地写（ChestData.name 随档持久,FX11 环）。 */
  private chestRenameSubmit(input: string): void {
    const c = this.openChest;
    if (!c || c.x < 0) return;
    UISfx.click();                                   // :837 SoundEngine.PlaySound(12)
    const name = input === (this.vinvChestTypeName(c) ?? '') ? '' : input;
    if ((c.name ?? '') !== name) {
      c.name = name || undefined;                    // :850 空串=型名回显域（netApplyChestName 同编码）
      this.game.net?.chestRenameLatch(name);         // :851-853 editedChestName=true 等价位
    }
    this.refreshAll();                               // vinvUpdateChestName 回写（DrawName 下帧同相）
  }

  // ---- 商店货架(★SW-FX32 刀①店侧分期二;Main.cs:42500-42532 DrawInventory 商店段) ----
  //  原版店开态无独立面板:货架 40 格=箱条同格(context 15 :42529,scale 0.755 :42513),
  //  店名/储蓄同位 (504,invBottom) (:42502-42503),快乐度图标+倍率 (:42504-42512,
  //  offsets Main.cs:67677-67680),PipsUseGrid 态整段不画 (:42500 门)。原版无
  //  Set-Back 钮——关店 = Esc/对话关闭/走远(closeNpcDialog → npcShopClose)。
  //  几何单源 vanillaInvLayout(shopSlotXY/SHOP_TITLE_XY/happiness 族)。
  private vinvShopPayload: { title: string; entries: ShopEntry[]; copper: number; happinessMul: number; medals?: number; medalsTotal?: number } | null = null;
  private vinvShopCells: HTMLDivElement[] = [];
  private vinvShopTitleEl: HTMLElement | null = null;
  private vinvShopSavedEl: HTMLElement | null = null;
  private vinvShopCoinRow: HTMLElement | null = null;
  private vinvShopCoinCnts: HTMLElement[] = [];
  private vinvShopBankImgs: HTMLImageElement[] = [];
  private vinvShopHappyIcon: HTMLElement | null = null;
  private vinvShopHappyText: HTMLElement | null = null;

  /** 显示门(Main.cs:42500 `npcShop > 0 && !PipsUseGrid`——网格态货架/店名/储蓄/
   *  快乐度整段不画;SW-FX30 箱条 ChestUI.cs:81 同面) */
  private vinvShopVisible(): boolean {
    return !!this.game?.npcShopOpen && !this.vinvPipsUseGrid;
  }

  private vinvBuildShop(): void {
    const root = this.vinvRoot;
    if (!root) return;
    const vis = (): boolean => this.vinvShopVisible();

    // 店名(Main.cs:42502 Lang.inter[28] @(504,invBottom)——payload title 即 Lang.inter(28);
    // 13px = 刀11 MouseText 同档族定标:原版店名/箱名同为 scale-1 DrawString(:42502 vs
    // ChestUI.cs:161 Vector2.One),★SW-RB14b:曾 15px 与箱名 13px 同面两档=内不一致,对齐)
    const title = el('div', 'vinv-txt');
    title.style.cssText = 'font-size:13px;';
    root.appendChild(title);
    this.vinvShopTitleEl = title;
    this.vinvLayoutItems.push({ el: title, pos: () => (vis() ? { x: SHOP_TITLE_XY.x, y: SHOP_TITLE_XY.y } : null) });

    // 储蓄行标签(Main.cs:42503 → ItemSlot.DrawSavings ItemSlot.cs:3717-3757 →
    //  DrawMoney :3671 Lang.inter[66] @(shopx,shopy+40);num5>0 才画 :3726)
    const saved = el('div', 'vinv-txt');
    saved.style.cssText = 'font-size:13px;';
    saved.textContent = Lang.text('LegacyInterface.66');
    root.appendChild(saved);
    this.vinvShopSavedEl = saved;
    this.vinvLayoutItems.push({ el: saved, pos: () => {
      if (!vis() || !(this.game && this.game.coinSavingsCopper() > 0)) return null;
      return shopSavingsLabelXY();
    } });

    // 四银行小图标(ItemSlot.cs:3727-3740:该仓有币才画,CenteredRectangle 中心
    //  (shopx+off) 贴图 ×0.65;iconUrl 32px 代理贴图=尺寸偏差备案)
    for (const def of SHOP_SAVINGS_BANK_ICONS) {
      const img = document.createElement('img');
      img.draggable = false;
      img.style.cssText = `position:absolute; width:${32 * SHOP_SAVINGS_ICON_SCALE}px;`
        + `height:${32 * SHOP_SAVINGS_ICON_SCALE}px; image-rendering:pixelated; pointer-events:none;`;
      root.appendChild(img);
      this.vinvShopBankImgs.push(img);
      const wHalf = (32 * SHOP_SAVINGS_ICON_SCALE) / 2;
      this.vinvLayoutItems.push({ el: img, pos: () => {
        const g = this.game;
        if (!vis() || !g || !(g.coinSavingsCopper() > 0)) return null;
        if (!(g.coinSavingsByBank()[def.bank] > 0)) return null;
        if (!img.getAttribute('src')) {
          const u = iconUrl(g, internalIdOfVid(def.vid));
          if (u) img.src = u;
        }
        return { x: SHOP_TITLE_XY.x + def.off.x - wHalf, y: SHOP_TITLE_XY.y + def.off.y - wHalf };
      } });
    }

    // 币图标+计数(ItemSlot.cs:3699-3710:j=0..3 币种 74-j=铂/金/银/铜,图标
    //  @(shopx+11+24j,shopy+75),计数在下 :3705-3710(0.75 缩放——DOM 以 12px 近似
    //  =字体度量偏差备案);计数帽 999 :3704-3706;>0 才画整行 :3726)
    const coinRow = el('div');
    coinRow.style.cssText = 'position:absolute; pointer-events:none;';
    for (let j = 0; j < 4; j++) {
      const cell = el('div');
      cell.style.cssText = 'position:absolute; width:24px;';
      cell.style.left = `${24 * j}px`;
      const icon = document.createElement('img');
      icon.draggable = false;
      icon.style.cssText = 'width:20px; height:20px; margin:0 auto; display:block;'
        + 'image-rendering:pixelated; pointer-events:none;';
      icon.src = (this.game ? iconUrl(this.game, internalIdOfVid(74 - j)) : '') || '';
      const cnt = el('div');
      cnt.style.cssText = 'font-size:12px; text-align:center; color:#fff; text-shadow:1px 1px 0 #000;';
      cell.appendChild(icon);
      cell.appendChild(cnt);
      coinRow.appendChild(cell);
      this.vinvShopCoinCnts.push(cnt);
    }
    root.appendChild(coinRow);
    this.vinvShopCoinRow = coinRow;
    this.vinvLayoutItems.push({ el: coinRow, pos: () => {
      if (!vis() || !(this.game && this.game.coinSavingsCopper() > 0)) return null;
      return shopSavingsCoinXY(0);
    } });

    // 快乐度表情(Main.cs:42504-42509:NPCHappiness 4 帧 Frame(4,1,frameX),中心锚
    //  (504+12,invBottom+108) scale 1——Main.cs:67679-67680 offsets;恒画,帧随
    //  PriceAdjustment :42506 三元链)
    const happy = el('div');
    happy.style.cssText = 'position:absolute; width:24px; height:24px; image-rendering:pixelated;'
      + 'pointer-events:none;background:url(sprites/vanilla-ui/UI_NPCHappiness.png); background-size:96px 24px;';
    root.appendChild(happy);
    this.vinvShopHappyIcon = happy;
    this.vinvLayoutItems.push({ el: happy, pos: () => {
      if (!vis()) return null;
      const c = shopHappinessIconXY();
      return { x: c.x - 12, y: c.y - 12 };
    } });
    // 倍率文字(Main.cs:42510-42512 pa.ToString("P0") @(504+26,invBottom+98))
    const happyTxt = el('div', 'vinv-txt');
    happyTxt.style.cssText = 'font-size:13px; color:#fff;';
    root.appendChild(happyTxt);
    this.vinvShopHappyText = happyTxt;
    this.vinvLayoutItems.push({ el: happyTxt, pos: () => (vis() ? shopHappinessTextXY() : null) });

    // 货架 40 格(Main.cs:42518-42532:10×4 行主序 slot3=num76+num77·10,context 15;
    //  空格同样以 InventoryBack 底框绘制 :42531=售卖放置区。★非 makeSlotEl——
    //  商品格语义=买/卖放置区,非拾放;交互直连 Game.npcShopBuy/npcShopSellHeld)
    for (let i = 0; i < 40; i++) {
      const cell = document.createElement('div');
      cell.className = 'sw-slot sw-vshop-cell';
      cell.dataset.vshop = String(i);
      cell.style.cssText = 'width:52px; height:52px; cursor:pointer;';
      const entry = (): ShopEntry | undefined => this.vinvShopPayload?.entries[i];
      cell.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.button !== 0) return;   // 右键不买不卖(RightClick→HandleShopSlot CanStack 早退 ItemSlot.cs:1878-1881)
        const it = entry();
        if (!it) {
          // 空格 = 唯一卖出放置区(PickItemMovementAction case 15 ItemSlot.cs:1435-1438
          //  空格+持有非币 → result 4 → LeftClick case 4 :1195-1212 SellItem 整叠)
          if (this.heldStack && this.game?.npcShopSellHeld(this.heldStack)) {
            this.heldStack = null;   // SellItem 成交:光标 SetDefaults(0) :1116
            this.refreshAll();
          }
          return;
        }
        if (cell.dataset.ok !== '1') return;   // 买不起 = 无动作(原版 BuyItem 静默失败)
        const bulk = e.shiftKey || undefined;  // Shift 批量买 10(GetBulkBuyAmount ItemSlot.cs:2861-2870)
        const held = this.heldStack;
        if (held) {
          this.game?.npcShopBuy(it.vanillaId, it.buyback, held, bulk);   // 同型 CanStack :1431 → 叠光标
          this.refreshAll();
          return;
        }
        this.game?.npcShopBuy(it.vanillaId, it.buyback, undefined, bulk);
      });
      // 格位悬停 = MouseHover context 15(单源 showShopCellTooltip;SW-BJ22 语义面)
      cell.addEventListener('mouseenter', () => {
        const it = entry();
        if (!it) return;
        this.showShopCellTooltip({ vid: it.vanillaId, stack: 1, prefix: it.prefix, buyback: it.buyback }, cell);
      });
      cell.addEventListener('mouseleave', () => this.showShopCellTooltip(null, null));
      root.appendChild(cell);
      this.vinvShopCells.push(cell);
      const { x, y } = shopSlotXY(i);   // ★SW-FX32 单源(Main.cs:42522-42523=箱条同格)
      this.vinvLayoutItems.push({ el: cell, pos: () => (vis() ? { x, y } : null) });
    }
  }

  /** 货架内容+头部回写(paintVanillaInvSlots/showNpcShop/图标轮询共用;显示面由
   *  vinvLayoutItems pos 门管辖,本函数只写内容与格位着色) */
  private vinvRefreshShop(): void {
    const g = this.game;
    if (!g || !this.vinvRoot) return;
    const pay = this.vinvShopPayload;
    const on = this.vinvShopVisible() && !!pay;
    // 店名(Main.cs:42502:恒 inter[28],payload title 即 Game 侧 Lang.inter(28))
    if (this.vinvShopTitleEl) this.vinvShopTitleEl.textContent = pay?.title ?? '';
    // 快乐度帧/文案(:42506/:42510——mul≤0.82→0/≤1→1/≤1.1→2/其余→3)
    const mul = pay?.happinessMul ?? 1;
    if (this.vinvShopHappyIcon) this.vinvShopHappyIcon.style.backgroundPosition = `${-happinessFrameX(mul) * 24}px 0px`;
    if (this.vinvShopHappyText) this.vinvShopHappyText.textContent = happinessPct(mul);
    // 币计数(ItemSlot.cs:3705-3710 split[3-j],帽 999 :3704-3706)
    if (on && this.vinvShopCoinRow) {
      const split = g.coinSavingsSplit();
      for (let j = 0; j < 4; j++) {
        const cnt = this.vinvShopCoinCnts[j];
        if (cnt) cnt.textContent = String(Math.min(999, split[3 - j]));
      }
    }
    // 40 格内容(Main.cs:42531 逐格 ItemSlot.Draw;afford 着色=经典面同款呈现,
    //  原版无买不起调暗=呈现偏差备案)
    for (let i = 0; i < this.vinvShopCells.length; i++) {
      const cell = this.vinvShopCells[i];
      const it = on ? pay!.entries[i] : undefined;
      if (!it) {
        cell.classList.add('is-empty');
        cell.classList.remove('is-poor');
        delete cell.dataset.ok;
        if (cell.childElementCount) this.paintSlot(cell, null);
        continue;
      }
      cell.classList.remove('is-empty');
      const ok = it.medal !== undefined
        ? (pay!.medalsTotal ?? pay!.medals ?? 0) >= it.medal
        : pay!.copper >= it.price;
      cell.dataset.ok = ok ? '1' : '0';
      cell.classList.toggle('is-poor', !ok);
      const iid = internalIdOfVid(it.vanillaId);
      this.paintSlot(cell, iid >= 0 ? { id: iid, stack: it.stack ?? 1, prefix: it.prefix } : null);
    }
  }

  /** adjY(Main.cs:42239-42244:<700 → (sh-508)/2,否则 (sh-600)/2,整型) */
  private vinvCraftAdjY(sh: number): number {
    return sh < 700 ? Math.trunc((sh - 508) / 2) : Math.trunc((sh - 600) / 2);
  }
  /** middleY(Main.cs:42240-42249:<700 → sh/600·200;<850 → ·225;否则 ·250) */
  private vinvCraftMiddleY(sh: number): number {
    if (sh < 700) return Math.trunc(sh / 600 * 200);
    if (sh < 850) return Math.trunc(sh / 600 * 225);
    return Math.trunc(sh / 600 * 250);
  }
  private vinvRefreshCraft(): void {
    const game = this.game;
    if (!game) return;
    // ★SW-FX30 刀⑦:过滤失效拍(DrawGridToggle 头 CraftingUI.cs:269-273)+列表头文字
    // (DrawRecipesList :167-171:RecipeFilterHack → GetWindowDescription,else inter[25])
    this.vinvTickCraftFilter();
    this.vinvGuideMenuExitCheck();   // ★刀19:向导态退出面(:42396-42400 每拍消费)
    let avail: Array<{ r: VanillaRecipeLike; count: number }>;
    // ★刀19:向导反查(Recipe.UpdateRecipeList :235-241)——guideItem 有件 →
    //   CollectGuideRecipes(Recipe.cs:441-460 全表 items 组匹配,不问站点/材料/可制性,
    //   filterHack 不消费=早退分支);空槽 → 常规可制列表(:42427 classic 无门)
    if (this.vinvGuideMenuOpen && this.guidePlaced) {
      const vid = this.vidOfItemOf(this.guidePlaced.id);
      avail = VANILLA_RECIPES.filter((r) => r.items.some((req) => req.id === vid
        || (req.id >= 1000000 && (RECIPE_GROUP_ITEMS[String(req.id - 1000000)] ?? []).includes(vid))))
        .map((r) => ({ r, count: 0 }));   // count 不消费:guide 模式拥有数整支不画(NewCraftingUI.cs:482)
    } else {
      avail = game.vanillaAvailableRecipes();
    }
    // ★SW-RB13b:消费门=RecipeFilterHack getter(CraftingUI.cs:121-127:control≠Classic →
    //   null)——classic 态置入的滤器在切 modern 后不消费(列表回全量/头回 inter[25]),
    //   切回 classic 恢复(_lastFilter 本体不清,原版同相)
    const filterActive = !this.vinvGuideMenuOpen && this.vinvCraftFilter !== null && options.data.craftingGridControl === 'classic';
    if (filterActive && this.vinvCraftFilter) {
      // Recipe.cs:252 filterHack ∧ 门(CraftStationRecipeFilter.Accepts :159-170 /
      // WaterSourceRecipeFilter.Accepts :180-187)——列表与网格同吃过滤后的
      // availableRecipe 数组(DrawRecipesGrid :522 遍历 availableRecipe 同源)
      const f = this.vinvCraftFilter;
      avail = avail.filter(({ r }) => recipeFilterAccepts(r, f));
      const name = Lang.tileName(f.tile);
      const title = this.vinvCraftTitleEl;
      if (name && title) title.textContent = Lang.text('CombineFormat.Crafting', name);   // NewCraftingUI.cs:101-104
    } else if (this.vinvCraftTitleEl && this.vinvCraftTitleEl.textContent !== Lang.inter(25)) {
      this.vinvCraftTitleEl.textContent = Lang.inter(25);   // :167 复位
    }
    // 签名比对(r 引用静态+count)——配方集变化才重建格池
    const prev = this.vinvCraftAvailV;
    const unchanged = prev.length === avail.length
      && prev.every((p, i) => p.r === avail[i].r && p.count === avail[i].count);
    this.vinvCraftAvailV = avail;
    // ★SW-RB14d（FX38-F3）：重建期焦点 1:1（Recipe.UpdateRecipeList :228-256 +
    //  TryRefocusingRecipe :478-494 + VisuallyRepositionRecipes :131-139）：
    //  ①身份追焦——旧焦点配方在新表中的索引成为焦点（材料耗尽/离站致整表位移时,
    //  原版仍居中同一配方;旧刀只保索引=居中被挤入的另一配方）;
    //  ②钳制——找不到才钳 [0,n−1]（原文 :488-495 两道 if）;
    //  ③glideY【不变】——VisuallyRepositionRecipes 把新焦点行平移接管旧焦点行偏移,
    //  在 availableRecipeY[i]≡glideY+(i−focus)·65 不变式下,焦点行偏移恒=glideY
    //  ⇒任何重建分支 glideY 都保持原值。旧刀走 vinvCraftFocusGoto 的移焦播种
    //  （glideY+=(next−prev)·65）=重建支被施以移焦语义,钳位差 N 行 → 焦点行从
    //  ±N·65px 起步多行幻影滑行 ~0.7s,原版即刻落位无滑行。
    {
      const oldRecipe = prev[this.vinvCraftFocusV]?.r ?? null;
      let nextFocus = this.vinvCraftFocusV;
      if (oldRecipe !== null) {
        const idx = avail.findIndex((p2) => p2.r === oldRecipe);
        if (idx >= 0) nextFocus = idx;                 // :483-486 找到=身份位
      }
      if (nextFocus >= avail.length) nextFocus = avail.length - 1;   // :488-490
      if (nextFocus < 0) nextFocus = 0;                // :491-493
      this.vinvCraftFocusV = nextFocus;                // ③：直写,glideY 不动
    }
    if (!unchanged) {
      this.vinvRebuildCraftCells();
    }
    this.vinvUpdateCraftList();
    this.vinvUpdateCraftGrid();   // ★SW-FX30 刀②:网格视图随拍重排(分页钳制/页钮门)
    // ★SW-FX41:modern 窗内容随拍(UpdateContents :589-634 每拍语义;窗关时早退零开销)
    if (this.vinvModernCraftOpen) this.vinvUpdateModernCraft();
    if (this.vinvGuideMenuOpen) this.vinvPaintGuideCraft();   // ★刀19:文案/focus 行随拍
  }

  /** 格池重建(配方集变化;每配方一枚 52 盒槽,鱼眼 scale/x/y 全在 update 拍) */
  private vinvRebuildCraftCells(): void {
    const root = this.vinvRoot;
    if (!root) return;
    const dead = new Set(this.vinvCraftCellEls.map((c) => c.el));
    this.vinvLayoutItems = this.vinvLayoutItems.filter((it) => !dead.has(it.el));
    for (const c of this.vinvCraftCellEls) c.el.remove();
    this.vinvCraftCellEls = [];
    for (let idx = 0; idx < this.vinvCraftAvailV.length; idx++) {
      const rec = this.vinvCraftAvailV[idx];
      const outKey = vanillaItemKey(rec.r.create);
      const s = el('div', 'sw-slot');
      s.style.cssText = 'position:absolute; width:52px; height:52px; background-image:none;'
        + '--slot-bgimg:url(sprites/vanilla/Inventory_Back.png); transform-origin:top left;';
      const img = el('img') as HTMLImageElement;
      img.draggable = false;
      img.src = iconUrl(this.game, this.game.itemId(outKey ?? ''));
      s.appendChild(img);
      if (rec.r.createStack > 1) s.appendChild(el('span', 'cnt', String(rec.r.createStack)));
      s.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        // HoverOverCraftingItemButton :43020-43033:点非焦点=居中+音12(:43032-43035,
        //   无 recFastScroll ⇒ ★SW-FX38 走吸附滑行非瞬移);点焦点=合成
        if (this.vinvCraftFocusV !== idx) {
          this.vinvCraftFocusGoto(idx);
          this.game.sfx.play('menuTick', 1);
          this.vinvCraftSnapStep();
          return;
        }
        if (this.guidePlaced) return;   // ★刀19:反查态不合成(HoverOverCraftingItemButton :42988 guideItem.IsAir 门)
        this.game.vanillaCraft(rec.r, (ev as MouseEvent).shiftKey ? 10 : 1, true);
        this.refreshAll();
      });
      s.style.setProperty('--slot-alpha', '1');   // 列表格距离渐隐走元素 opacity,退出脉冲
      s.addEventListener('mouseover', () => {
        // HoverItem = createItem.Clone()(:42978)→ 完整物品 tooltip
        const iid = this.game.itemId(vanillaItemKey(rec.r.create) ?? '');
        if (iid > 0) this.showTooltipFor(iid, 'inv', { slot: { id: iid, stack: rec.r.createStack }, anchor: s });
        // hover 态(★用户实测三轮:原版悬停配方=描金背景)
        if (this.vinvCraftFocusV !== idx) s.style.setProperty('--slot-bgimg', 'url(sprites/vanilla/Inventory_Back14.png)');
      });
      s.addEventListener('mouseleave', () => {
        this.tooltip.style.display = 'none';
        cancelAnimationFrame(this.tooltipPulseRaf);
        s.style.setProperty('--slot-bgimg',
          `url(sprites/vanilla/Inventory_Back${this.vinvCraftFocusV === idx ? 14 : ''}.png)`);
      });
      s.addEventListener('wheel', (e) => this.vinvCraftWheel(e));
      root.appendChild(s);
      this.vinvCraftCellEls.push({ el: s });
      const i = idx;
      this.vinvLayoutItems.push({ el: s, pos: () => this.vinvCraftCellPos(i) });
    }
  }

  /** 鱼眼格几何(DrawRecipesList :186-201):y_i=(i-focus)·65+glideY(★SW-FX38 吸附偏移
   *  :398 availableRecipeY[i]=original+(i−focus)·65——剔界 :177/缩放 :181 吃【吸附值】);
   *  scale=max(0.75,100/(|y_i|+100));fast 态全体 0.75(:186-189 recFastScroll 支;
   *  本仓并门 glideY≠0=重开首拍 glideY=0 时按鱼眼渲染,原版 settle 帧序同相,1 帧差登记);
   *  x=trunc(46-26·scale);y=trunc(410+y_i·scale-30·scale+adjY);|y_i|>middleY 剔除(:188)
   *  ★SW-FX41:modern 窗开 = Main.cs:42418 else 分支整支不画 → 恒 null(隐藏) */
  private vinvCraftCellPos(i: number): { x: number; y: number } | null {
    const c = this.vinvLayoutCtx;
    if (!c || !this.vinvClassicCraftVisible()) return null;
    const adjY = this.vinvCraftAdjY(c.sh), middleY = this.vinvCraftMiddleY(c.sh);
    const yOff = (i - this.vinvCraftFocusV) * 65 + this.vinvCraftGlideY;
    if (Math.abs(yOff) > middleY) return null;
    const scale = this.vinvCraftFastScroll && this.vinvCraftGlideY !== 0
      ? 0.75
      : Math.max(0.75, 100 / (Math.abs(yOff) + 100));
    return {
      x: Math.trunc(46 - 26 * scale),
      y: Math.trunc(410 + yOff * scale - 30 * scale + adjY),
    };
  }

  /** 列表重排+焦点描金+边缘渐隐(GetItemSlotColors :358-370:alpha=A+50,
   *  |y|>middleY-100 起线性衰减;灰乘色=原版 inventoryBack 灰,A=150) */
  private vinvUpdateCraftList(): void {
    const c = this.vinvLayoutCtx;
    if (!c) return;
    const middleY = this.vinvCraftMiddleY(c.sh);
    const A = 150;
    for (let i = 0; i < this.vinvCraftCellEls.length; i++) {
      const el = this.vinvCraftCellEls[i].el;
      const pos = this.vinvCraftCellPos(i);
      if (!pos) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      const yOff = (i - this.vinvCraftFocusV) * 65 + this.vinvCraftGlideY;   // ★SW-FX38 吸附值(GetItemSlotColors :358-369 吃 availableRecipeY=glideY+(i−focus)·65)
      const scale = this.vinvCraftFastScroll && this.vinvCraftGlideY !== 0
        ? 0.75
        : Math.max(0.75, 100 / (Math.abs(yOff) + 100));
      el.style.transform = `scale(${scale})`;
      let alpha = A + 50;
      if (Math.abs(yOff) > middleY - 100) {
        alpha = 150 * (100 - (Math.abs(yOff) - (middleY - 100))) * 0.01;
      }
      el.style.opacity = String(Math.max(0, Math.min(1, alpha / 255)));
      // 焦点槽描金(DrawGoldBGForCraftingMaterial 语义≈Back14 高亮 :206-213)
      el.style.setProperty('--slot-bgimg',
        `url(sprites/vanilla/Inventory_Back${i === this.vinvCraftFocusV ? 14 : ''}.png)`);
    }
    this.vinvUpdateCraftMaterials();
  }

  /** 材料行(DrawRecipesList :225-287:focus 配方 requiredItem;x=80+j·40,
   *  y=380+adjY,scale 0.6;alpha=A-|y_focus|·2 远焦渐隐;悬停=材料 tooltip
   *  (SetRecipeMaterialDisplayName :447-460 组名覆写近似=材料本体 tooltip)) */
  private vinvUpdateCraftMaterials(): void {
    const mats = this.vinvCraftMatEl;
    const c = this.vinvLayoutCtx;
    if (!mats || !c) return;
    const rec = this.vinvCraftAvailV[this.vinvCraftFocusV];
    const sig = rec ? `${rec.r.create}|${rec.r.items.map((i2) => `${i2.id}:${i2.stack}`).join(',')}` : '';
    if (sig === this.vinvCraftMatSig) return;
    this.vinvCraftMatSig = sig;
    mats.replaceChildren();
    if (!rec) return;
    const alpha = Math.max(0, 150 / 255);
    rec.r.items.forEach((req, j) => {
      const k2 = ingredientKey(req.id);
      const x = 80 + j * 40, y = 380 + this.vinvCraftAdjY(c.sh);
      const box = el('div', 'sw-slot');
      box.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:52px; height:52px;`
        + 'background-image:none; --slot-bgimg:url(sprites/vanilla/Inventory_Back.png);'
        + 'transform:scale(0.6); transform-origin:top left;';
      const img = el('img') as HTMLImageElement;
      img.draggable = false;
      img.src = k2 ? iconUrl(this.game, this.game.itemId(k2)) : '';
      box.appendChild(img);
      if (req.stack > 1) box.appendChild(el('span', 'cnt', String(req.stack)));
      box.style.pointerEvents = 'auto';
      box.addEventListener('mouseover', () => {
        const iid = k2 ? this.game.itemId(k2) : -1;
        if (iid > 0) this.showTooltipFor(iid, 'inv', { slot: { id: iid, stack: req.stack }, anchor: box });
      });
      box.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; cancelAnimationFrame(this.tooltipPulseRaf); });
      box.addEventListener('wheel', (e) => this.vinvCraftWheel(e));
      mats.appendChild(box);
    });
  }

  private vinvCraftCellEls: Array<{ el: HTMLElement }> = [];
  private vinvCraftTitleEl: HTMLElement | null = null;
  private vinvCraftMatEl: HTMLElement | null = null;
  private vinvCraftMatSig = '';
  // ---- ★SW-FX30 刀②+⑦ 网格态(Main.PipsUseGrid/Main.recStart/CraftingUI._lastFilter) ----
  /** Main.PipsUseGrid(Main.cs:1794):经典网格视图态。生命周期 = 切换钮左键翻转
   *  (CraftingUI.cs:302-306)/网格格点选关闭(:524)/关包(Main.cs:43916+43934
   *  DrawInterface_Resources_Buffs 仅 !playerInventory 走=关包清)/开箱
   *  (Player.cs:33787)/站点过滤清过滤支(CraftingUI.cs:148-153) */
  private vinvPipsUseGrid = false;
  /** Main.recStart(网格分页游标;!PipsUseGrid 每拍归零 Main.cs:43926-43930 →
   *  本仓在每次关闭网格处置 0) */
  private vinvCraftRecStart = 0;
  /** CraftingUI._lastFilter(站点/水源过滤;OpenCloseFilter CraftingUI.cs:146-159) */
  private vinvCraftFilter: CraftingTileFilter | null = null;
  private vinvCraftGridEl: HTMLElement | null = null;
  private vinvCraftGridSig = '';
  private vinvCraftGridUpBtn: HTMLButtonElement | null = null;
  private vinvCraftGridDownBtn: HTMLButtonElement | null = null;
  private vinvGridToggleImg: HTMLImageElement | null = null;
  private vinvGridToggleHover = false;
  private vinvGridWheelBound = false;
  private vinvGridWheelHandler: ((e: WheelEvent) => void) | null = null;

  /** EquipPage 状态机(原版 DrawPageIcons 帧尾 SelectEquipPage :43587 等价:
   *  手持物每帧重算页码,变化才切 display;空手落记忆页) */
  private vinvApplyPage(): void {
    const pages = this.vinvPageEls;
    if (!pages) return;
    let page: 0 | 1 | 2 = this.vinvPageSelected;
    if (this.heldStack) {
      page = selectEquipPageOf(equipPageCapOf(this.heldStack.id), this.vinvPageSelected) ?? this.vinvPageSelected;
    }
    if (page === this.vinvPageCurrent) return;
    this.vinvPageCurrent = page;
    this.reflowBuffs();   // ★SW-FX10 债④:页2 ↔ buffBar 块容器随页搬运
    pages.equip.style.display = page === 0 ? 'block' : 'none';
    pages.housing.style.display = page === 1 ? 'block' : 'none';
    pages.misc.style.display = page === 2 ? 'block' : 'none';
    if (this.vinvTabMisc) this.vinvTabMisc.style.backgroundImage =
      `url(sprites/vanilla-ui/UI_DisplaySlots_${page === 2 ? 3 : 2}.png)`;
    if (this.vinvTabHousing) this.vinvTabHousing.style.backgroundImage =
      `url(sprites/vanilla-ui/UI_DisplaySlots_${page === 1 ? 5 : 4}.png)`;
    this.vinvLayoutSig = '';   // PvP 剑 x+46(页 2)随页重排
    this.layoutVanilla();
  }

  /** 防御计数重绘(refreshCrafting 的经典实现挂在 craftListEl 门后,vanilla 布局
   *  刀 4 前无 craftListEl——此处独立重绘,盾烘焙缓存 DEF_SHIELD_URLS 共享) */
  private paintVanillaDefense(): void {
    const el = this.vinvDefenseEl;
    if (!el || !this.game) return;
    const p = this.game.player;
    const w = this.game.world;
    const col = w.isMaster ? 2 : w.isExpert ? 1 : 0;
    const imgEl = el.querySelector('img');
    const shield = this.game.atlas?.vmisc('vanilla/Extra_58.png');
    if (imgEl && shield) {
      const glow = col > 0 && p.defense > 0;
      const key = `${col}|${glow ? 1 : 0}`;
      let url = DEF_SHIELD_URLS.get(key);
      const sc = DEF_SHIELD_SCRATCH;
      if (!url && sc) {
        const sx2 = sc.getContext('2d', { willReadFrequently: true })!;
        sc.width = 52; sc.height = 48;
        sx2.clearRect(0, 0, 52, 48);
        sx2.drawImage(shield.img, shield.sx + col * 52, shield.sy, 52, 48, 0, 0, 52, 48);
        if (glow) {
          sx2.globalAlpha = 0.45;
          sx2.drawImage(shield.img, shield.sx + col * 52, shield.sy + 48, 52, 48, 0, 0, 52, 48);
          sx2.globalAlpha = 1;
        }
        url = sc.toDataURL('image/png');
        DEF_SHIELD_URLS.set(key, url);
      }
      if (url && imgEl.getAttribute('src') !== url) imgEl.src = url;
    }
    const defNumEl = el.querySelector('span');
    if (defNumEl) defNumEl.textContent = String(p.defense);
  }

  /** flag 运行期切换 → 面板重建(initInGame 前未建则交给下次进世界) */
  private rebuildInventoryPanel(): void {
    if (!this.invPanel || !this.invPanel.isConnected) return;
    const wasOpen = this.invPanel.style.display === 'block';
    if (wasOpen) this.closeInventory();   // 归光标物/关箱/关搜索全走既有链
    this.teardownInventoryPanel();
    this.buildInventoryFor(options.data.inventoryLayout);
    this.refreshAll();
    if (wasOpen) this.openInventory();
  }

  /** 双布局 teardown(重建路径;字段清单=两构建器可能填充的全部实例引用) */
  private teardownInventoryPanel(): void {
    this.invPanel?.remove();
    this.eqDockEl?.remove();
    document.getElementById('sw-vinv-style')?.remove();
    this.invGridEl = null;
    this.trashEl = null;
    this.achAdvisorEl = null;
    this.eqDockEl = null;
    this.craftSearchEl = null;
    this.craftGridEl = null;
    this.craftListEl = null as unknown as HTMLElement;
    this.craftNearbyToggleImg = null;
    this.playerListBtn = null;
    this.housingBtn = null;
    this.itemSearchBtn = null as unknown as HTMLButtonElement;
    this.bestiaryBtn = null as unknown as HTMLButtonElement;
    this.quickStackBtn = null as unknown as HTMLButtonElement;
    this.qsSmartBtn = null as unknown as HTMLButtonElement;
    this.pvpSwordBtn = null as unknown as HTMLButtonElement;
    this.loadoutBtns = [];
    this.pvpTeamBtns = [];
    this.accEyeEls.clear();
    this.equipExtraSlots = null;
    this.craftFocus = -1;
    this.hoverFocus = -1;
    this.craftAvailRef = [];
    this.craftGridRecipe = null;
    this.vinvRoot = null;
    this.vinvSlots.clear();
    this.vinvPageEls = null;
    this.vinvTabMisc = null;
    this.vinvTabHousing = null;
    this.vinvTabCamera = null;
    this.vinvPageSelected = 0;
    this.vinvPageCurrent = -1;
    this.vinvQuickBtn = this.vinvSortBtn = this.vinvBestiaryBtn = this.vinvEmoteBtn = null;
    this.vinvDefenseEl = null;
    this.vinvLockEl = null;    // SW-FX10 债⑪
    this.miscBuffCol = null;   // SW-FX10 债④(页2 列随 vinv root 整体重建)
    this.vinvHousingPage = null;
    this.vinvHousingSlotEls = [];
    this.vinvHousingSig = '-init';
    this.vinvCraftFocusV = 0;   // 经典列表缺省聚焦首配方(-1 是 Modern 时代哨兵,已退役)
    this.vinvCraftGlideY = 0;   // ★SW-FX38 重建=吸附态整帧清零(availableRecipeY 族随面板重建)
    this.vinvCraftWheelPendPx = 0;   // ★SW-RB14d（FX38-F2）累计器随面板重建清零
    this.vinvCraftFastScroll = false;
    this.vinvCraftGlideAcc = 0;
    this.vinvCraftAvailV = [];
    this.vinvGuideMenuOpen = false;   // ★刀19:向导态随面板重建复位
    this.vinvGuideSlotModernEl = null;
    this.vinvGuideSlotClassicEl = null;
    this.vinvGuideModernCaptionEl = null;
    this.vinvGuideModernReqEl = null;
    this.vinvGuideClassicTextEl = null;
    this.vinvCraftCellEls = [];
    this.vinvCraftTitleEl = null;
    this.vinvCraftMatEl = null;
    this.vinvCraftMatSig = '';
    // ★SW-FX41:modern 窗族面重建前清零(窗开态随 teardown 复位——重建后
    //   vinvModernCraftOpen=false,再开走 vinvOpenModernCraft 全量重置)
    this.vinvModernCraftOpen = false;
    this.vinvModernCraftFilter = null;
    this.vinvModernOpenedWithoutFilter = false;
    this.vinvModernActive = [];
    this.vinvModernSearch = '';
    this.vinvModernEntries = [];
    this.vinvModernSelected = null;
    this.vinvModernViewPos = 0;
    this.vinvModernCellsSig = '';
    this.vinvModernCraftEl = null;
    this.vinvModernPanelEl = null;
    this.vinvModernTitleEl = null;
    this.vinvModernSearchInput = null;
    this.vinvModernSearchClear = null;
    this.vinvModernGridList = null;
    this.vinvModernGridInner = null;
    this.vinvModernSeparatorEl = null;
    this.vinvModernScrollbarEl = null;
    this.vinvModernScrollHandle = null;
    this.vinvModernDetailEl = null;
    this.vinvModernFilterBtns = [];
    this.vinvModernFilterHovers = [];
    this.vinvModernCellEls = [];
    // ★SW-FX32:商店货架面(vinvBuildShop 重建前清零,防死节点入 vinvLayoutItems/
    // vinvShopCells 旧引用重paint——红队 F2 teardown 卫生同族)
    this.vinvShopCells = [];
    this.vinvShopTitleEl = null;
    this.vinvShopSavedEl = null;
    this.vinvShopCoinRow = null;
    this.vinvShopCoinCnts = [];
    this.vinvShopBankImgs = [];
    this.vinvShopHappyIcon = null;
    this.vinvShopHappyText = null;
    // ★SW-FX30 刀②:网格态域随布局拆解清空(window 级 wheel 监听守卫位一并复位,
    // 重进 vanilla 布局时 vinvBindGridWheel 重挂一次;无独立 removeEventListener 点
    // =监听闭包引用 this 且 tick 头 _builtLayout 门,classic 态恒 no-op,同 vinvPulse 单例面)
    this.vinvPipsUseGrid = false;
    this.vinvCraftRecStart = 0;
    this.vinvCraftFilter = null;
    this.vinvCraftGridEl = null;
    this.vinvCraftGridSig = '';
    this.vinvCraftGridUpBtn = null;
    this.vinvCraftGridDownBtn = null;
    this.vinvGridToggleImg = null;
    this.vinvGridToggleHover = false;
    if (this.vinvGridWheelHandler) {
      window.removeEventListener('wheel', this.vinvGridWheelHandler);
      this.vinvGridWheelHandler = null;
    }
    this.vinvGridWheelBound = false;
    this.vinvChestNameEl = null;
    this.vinvChestBtnEls = [];
    this.vinvChestRenameEl?.remove();   // ★BJ69：改名对话随 vinv 拆除（防脱离面板悬挂）
    this.vinvChestRenameEl = null;
    this.vinvReforgeOpen = false;
    this.vinvReforgeSlotEl = null;
    this.vinvReforgeTextEl = null;
    this.vinvReforgeHammerEl = null;
    this.vinvSavingsEl = null;
    if (this.vinvPulseRaf) { cancelAnimationFrame(this.vinvPulseRaf); this.vinvPulseRaf = 0; }
    this.vinvLayoutItems = [];
    this.vinvRowMap.clear();
    this.vinvLayoutCtx = null;
    this.vinvLayoutSig = '';
    this.vinvTrashEl = null;
    this._builtLayout = null;
    if (this.vinvResizeHandler) {
      window.removeEventListener('resize', this.vinvResizeHandler);
      this.vinvResizeHandler = null;
    }
    // 热键栏/说明书钮还原(vanilla 开包隐藏态残留)
    if (this.hotbarEl) this.hotbarEl.style.display = '';
    if (this.hotbarNameEl) this.hotbarNameEl.style.display = '';
    if (this.manualBtn) this.manualBtn.style.display = '';
  }
}
