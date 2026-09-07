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
import { vanillaItemKey, ingredientKey, VANILLA_RECIPES, RECIPE_GROUP_ITEMS, invIndexOfVanilla, vanillaIdOfItemKey, availableItemCountFor, collectOwnedItems, type VanillaRecipeLike } from '../data/vanillaRecipes';
import { petInfoOfVid } from '../data/vanillaPets';
import { showJourneyQuickGate } from './QuickGate';
import vanillaRareJson from '../data/vanilla-itemrare.json';
import { VANILLA_ITEM_COLOR, blendItemColorTint } from '../data/vanillaItemColor';
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
import { assembleTooltipLines, materialIids } from './itemTooltip';
import { hudTier, safeInsets } from './HudScale';
import { bindHint } from './bindHint';
import { tryItemSwapVid } from '../render/CursorItemIcon';
import { BuffType, BUFF_DEFS, BUFF_NO_TIME_DISPLAY, BUFF_TEXT_PROJECTILE_COUNTER, buffName, buffDesc, bannerBuffNames } from '../stats/Buffs';
import { mainDifficulty, GDL } from '../stats/ScaleStats';
import { Lang } from '../i18n/Lang';
import { ITEM_NAME_BY_ID, ITEM_NAME_EN_BY_ID } from '../i18n/idNames.generated';
import { ACH_ICON_INDEX, achIconFrame } from '../data/vanillaAchievements';
import { ChatMonitor } from './ChatMonitor';
import { NpcDialog, NpcShop, NpcHappinessPanel, formatCopper, type NpcButtonId, type ShopEntry, type HappinessInfo } from './NpcDialog';
import type { DialoguePortraitPayload } from '../data/npcPortraits';
import { UISfx } from '../vui/UISfx';
import { COIN_START, AMMO_START, INV_SIZE, coinIndexOf, ammoSlotAccepts, canFillEmptyAmmoSlot } from '../items/Inventory';
import { chestSettingsAllowsVault, lootAllFromContainer } from '../stats/QuickStacking';
import {
  slotContext, planAlternateClick, chestCanTakeJustCheck, canTakeToPersonalInventory,
  chestContainerContext, canMergeStack, quickTrashOptionsOf,
  CAN_FAVORITE_AT, CAN_LOADOUT_SHARE_AT, CAN_SHARE_AT, RETAIN_FAVORITE_ON_MOVE_AT,
  blockedFromTransferIntoChest,
  type SlotWhereLike,
} from './SlotActions';   // SW-AU2 2026-09-06 Alt/Shift/Ctrl 槽位动作 1:1 路由
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
        if (tint && tint[3] > 0) {
          const id32 = cx.getImageData(0, 0, 32, 32);
          blendItemColorTint(id32.data, tint);
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

  constructor(parent: HTMLElement) {
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'sw-root');
    parent.appendChild(this.root);
    this.installDragListeners();
    (window as unknown as { __swUI?: UI }).__swUI = this; // 调试句柄
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
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) {
        // 右键（ItemSlot.RightClick :1496-1571）：开包物优先开包，装备物一键装备，否则拆半到光标
        const cur = this.slotContent(where, i);
        // 开包门（:1514-1527）：context==0（背包格，含快捷栏）&& OpenableBag &&
        // mouseItem 空或不可叠（!Item.CanStack）→ mouseRightRelease 边沿开包。
        // DOM mousedown 即边沿；hit 须先于装备/拆半分支（原版同序 return）
        if (cur && where === 'inv'
          && (!this.heldStack || this.heldStack.id !== cur.id)
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
    bindHint(s, () => this.showSlotHintTouch(i, where));
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

  /** 眼睛图标态（InventoryTickOn/Off :40862-40865）+ 悬停文案（:40889 inter[59/60]） */
  private paintAccEye(eye: HTMLElement, slotIdx: number): void {
    const hidden = this.game?.player.hideVisibleAccessory[slotIdx] ?? false;
    eye.style.backgroundImage = `url(sprites/vanilla/Inventory_Tick_${hidden ? 'Off' : 'On'}.png)`;
    eye.title = Lang.text(hidden ? 'LegacyInterface.60' : 'LegacyInterface.59');
  }

  /** 杂项眼（宠物/光源,miscRail）——同配饰眼图标/文案族（原版 40666-40691：
   *  TogglePet/ToggleLight 翻 petFlag/lightFlag 后画 InventoryTickOn/Off） */
  private paintPetEye(eye: HTMLElement, slot: 0 | 1): void {
    const hidden = slot === 0 ? this.game.petHidden : this.game.lightPetHidden;
    eye.style.backgroundImage = `url(sprites/vanilla/Inventory_Tick_${hidden ? 'Off' : 'On'}.png)`;
    eye.title = Lang.text(hidden ? 'LegacyInterface.60' : 'LegacyInterface.59');
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
      itemMaterial: cur ? curVid > 0 && materialIids().has(curVid) : false,
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
      if (t?.closest?.('.sw-slot, .sw-panel, .sw-btn, .sw-eqdock')) return;
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
        if (from.where === 'inv' && from.i < 10 && !panelOpen) {
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

  /** 右键开包（ItemSlot.TryOpenContainer :1642-1660 + Player.Open* 1:1）：
   *  掷骰 → 产出入包（装不下落地 = GetOrDropItem :6813-6826 noGrabDelay 语义）→
   *  stack-- → SoundEngine.PlaySound(7)（Sfx 'pickup' = Grab.wav）。宝藏袋族
   *  （BOSS_BAG_IDS）走 Game 持用左键链，本方法回落 false 不动它。
   *  锁盒钥匙门（:1693-1704）：金锁盒 3085 消耗金钥匙 327（Player.ConsumeItem
   *  :8846 槽序 0→57，含虚空袋兜底）；黑曜石锁盒 4879 只验暗影钥匙 329 不消耗
   *  （HasItemInInventoryOrOpenVoidBag :54963——持虚空透镜 4131 才查 bank4） */
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
    const inPanel = target?.closest?.('.sw-panel, .sw-eqdock');
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
  private showTooltipFor(i: number, where: SlotWhere, override?: { slot: { id: number; stack: number; prefix?: number }; anchor: HTMLElement; shopCell?: { price: number; medal?: number } }) {
    let s = (override?.slot ?? this.slotContent(where, i)) as { id: number; stack: number; favorited?: boolean; prefix?: number } | null;
    // LoadoutShare 空槽悬停（ItemSlot.MouseHover IS57:3174-3178）：装备/染料格空槽
    // 悬停时共享件代打（GetSharedLoadoutItem → GetEffectiveArmor/Dye）——tooltip
    // 全文 + "共享自配装N"行随下方 R4-15 行族自然接上。曾缺 = 空槽早退无任何提示
    if (!s && !override && (where === 'armor' || where === 'dye')) {
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

  /** 打开重铸面板：物品槽（放 1 件）+ 费用 + 重铸按钮 */
  showReforge(): void {
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
        slotCaption.textContent = `${Lang.inter(21)} ${itemNameOfVid(vidOfItem(this.guidePlaced.id))} ×${this.guidePlaced.stack}`;
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
    const isMaterialVid = (vid: number): boolean => vidOfItem(vid) >= 0 && materialIids().has(vid);
    const maxStackOf = (iid: number): number => ITEM_DEFS[iid]?.maxStack ?? 999;
    slotBox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = this.heldStack;
      const pl = this.guidePlaced;
      let action: 'none' | 'take' | 'move' = 'none';
      if (cur && !isMaterialVid(vidOfItem(cur.id))) return;          // 放置门不过=原样拒
      const changed = (): void => { refreshHeader(); renderRecipes(); applyFilter(); };
      this.guideRefresh = changed;   // ★SW-AY1 R5：Shift 对换支（shiftGuideSwap）同刷面板
      if (e.button === 0) {
        if (!cur && pl) {                                            // 空手 → 取整组
          const hadPrefix = (pl as { prefix?: number }).prefix;
          this.heldStack = { id: pl.id, stack: pl.stack,
            ...(hadPrefix !== undefined ? { prefix: hadPrefix } : {}),
            ...(pl.placeStyle !== undefined ? { placeStyle: pl.placeStyle } : {}) };   // ★SW-RB5a 实例样式随行
          this.guidePlaced = null;
          this.game?.sfx.play('pickup');                             // SoundID.Grab(7)
          action = 'take';
        } else if (cur && !pl && isMaterialVid(vidOfItem(cur.id))) { // 手持 → 空槽整组
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
        changed();
        if (this.guideGhostMove) this.guideGhostMove(e as unknown as MouseEvent);   // 立即重算影子显隐
      }
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
      const vid = this.guidePlaced ? vidOfItem(this.guidePlaced.id) : null;
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
    this.pvpSwordBtn.title = cool ? '' : Lang.text(p.hostile ? 'UI.PvpIcon_Active' : 'UI.PvpIcon_Inactive');
    PVP_TEAM_BUTTONS.forEach((tb, k) => {
      const cell = this.pvpTeamBtns[k];
      const hover = !cool && cell.matches(':hover');
      // 悬停高亮 = UI_PVP_2 垫底（:42186-42188）；提示 = TeamIcon{Name}_{Active|Inactive}（:42160）
      cell.style.backgroundImage = hover ? 'url(sprites/vanilla-ui/UI_PVP_2.png)' : 'none';
      cell.title = cool ? '' : Lang.text(`UI.TeamIcon${tb.name}_${p.team === tb.team ? 'Active' : 'Inactive'}`);
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
        const bRes = el('button', 'sw-btn', Lang.text('LegacyInterface.112'));
        bRes.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
        bRes.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.closeInventory();
          openResearchPanel(this.game);
        });
        row.appendChild(bRes);
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
   *  AddBuff(buff,3600) 恒刷新入 buff 槽即"宠物存在标志"，UI 直接由装备槽派生 */
  petBuffBlocks = new Map<0 | 1, { block: HTMLElement; icon: ImageBitmap | HTMLImageElement; time: HTMLElement }>();

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
    if (!this.game || this.invPanel.style.display === 'block') return;
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
  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
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
      let ui = this.buffBlocks.get(t);
      if (!ui) {
        // 动态建块：无白名单，任何激活 buff 都显示（原版按 buff 槽序）
        ui = this.makeBuffBlock(t);
        this.buffBar.appendChild(ui.block);
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
    const liveBlocks = petStates.filter((s) => s.pb && s.ui).map((s) => s.ui!.block);
    if (liveBlocks.length && this.buffBar.lastElementChild !== liveBlocks[liveBlocks.length - 1]) {
      for (const b of liveBlocks) this.buffBar.appendChild(b);
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
      if (this.buffBar.lastElementChild !== last) for (const b of liveNeb) this.buffBar.appendChild(b);
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

  /** Quick Stack（ChestUI.QuickStack :651：只堆箱内已存在类型；收藏禁转移） */
  private chestQuickStack(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    const movedChest = new Map<number, number>(); // 箱格 → 物品 id（glow 分层用）
    for (let i = 0; i < 54; i++) { // 0-53（含钱币栏堆叠）
      const cur = inv.slots[i];
      if (!cur || cur.favorited) continue;
      for (let k = 0; k < chest.items.length; k++) {
        const cs = chest.items[k];
        if (!cs || cs.id !== cur.id) continue;
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cs.stack, cur.stack);
        cs.stack += put;
        cur.stack -= put;
        if (put > 0 && !movedChest.has(k)) movedChest.set(k, cur.id);
        if (cur.stack <= 0) { inv.slots[i] = null; break; }
      }
    }
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
  private chestTitle!: HTMLElement;
  private chestGrid!: HTMLElement;

  private openChestPanel(c: ChestData) {
    this.openChest = c;
    // 容器来源标识（原版 player.chest 约定）：-2 存钱罐 / -3 保险箱 / -4 守护者熔炉 / -5 虚空保险库。
    // 名称 = 原版物品官译（PiggyBank 87 / Safe 346 / DefendersForge 3813 / VoidVault 4076）
    const bankNames: Record<number, string> = {
      [-2]: Lang.itemName(87) ?? '存钱罐',
      [-3]: Lang.itemName(346) ?? '保险箱',
      [-4]: Lang.itemName(3813) ?? '守护者熔炉',
      [-5]: Lang.itemName(4076) ?? '虚空保险库',
    };
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
    this.chestPanel.style.display = 'none';
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

  /** 物品转移 hue 脉冲（ItemSlot.SetGlow :428 + :2144-2152：贴图换 Back13 +
   *  hslToRgb(hue,1,0.5) 色层 (time/300)²/2 衰减 5s；CSS 动画近似二次曲线） */
  setSlotGlow(where: SlotWhere, i: number, hue: number): void {
    const slotEl = this.slotEl(i, where);
    if (!slotEl) return;
    slotEl.querySelector('.sw-glow-overlay')?.remove();
    slotEl.style.backgroundImage = 'url(sprites/vanilla/Inventory_Back13.png)';
    const ov = el('div', 'sw-glow-overlay');
    ov.style.setProperty('--glow', `hsl(${(hue * 360).toFixed(1)} 100% 50%)`);
    ov.addEventListener('animationend', () => {
      ov.remove();
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

  refreshHotbar() {
    if (!this.game) return;
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
  private showSlotHintTouch(i: number, where: string): void {
    this.showTooltipFor(i, where as never);
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

  showPause(handlers: { onResume: () => void; onSave: () => void; onExport?: () => void; onQuit: () => void; onSettings?: () => void; onBestiary?: () => void }) {
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
    const bBst = mkBtn(Lang.text('Mods.SandboxWorld.Tabs.Bestiary'), () => handlers.onBestiary?.());
    const bQuit = mkBtn(Lang.text('Mods.SandboxWorld.UI.BackToMenu'), () => { panel.remove(); handlers.onQuit(); });
    panel.append(bRes, bSave);
    if (bExp) panel.appendChild(bExp);
    panel.append(bSet, bBst, bQuit);
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

    this.buildInventoryPanel();
    this.buildChestPanel();
    this.buildBuffBar();
    this.buildHud(this.game);
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
  }

  showNpcShop(title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number; medal?: number; buyback?: number; stack?: number; prefix?: number }>, copper: number, happinessPct?: number, medals?: number): void {
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
          // Main.npcShop=-1 + 回购记清（Main.UpdateOldNPCShop Main.cs:18056-18064）：
          // 卖出/回购价依赖开店会话状态，关店必须通知 Game 侧失效
          this.game?.npcShopClose();
        },
        // ★SW-BJ22 2026-09-07 格位悬停 tooltip 代打（MouseHover context 15 →
        //  Main.HoverItem.buy=true ItemSlot.cs:3197-3201 → MouseText 物品全文 +
        //  AddShopLines 买入价行 Main.cs:20632-20402）。价格取数现查 Game——
        //  卖出/购买后 openNpcShop 重刷货架,闭包 entries 会陈旧；shopCell 传价
        //  走 shopTooltipContext 的 context15 买入价支（HoverItem.buy 语义）
        (hover, anchor) => {
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
        });
    }
    // 图标由 UI 侧按原版 id 补(atlas 管线)——iconUrl 收内部 id,vid 先转
    // (2026-08-28 修复:此前 vid 直喂=ITEM_DEFS[vid] 错位 def,商店图标张冠李戴)
    const entries: ShopEntry[] = items.map((it) => ({
      ...it,
      iconUrl: this.game ? iconUrl(this.game, internalIdOfVid(it.vanillaId)) || '' : '',
    }));
    this.npcShop.open(title, entries, copper, happinessPct, medals);
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
}
