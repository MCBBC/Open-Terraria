// DOM overlay UI：主菜单 / HUD 快捷栏 / 背包+配饰栏 / 合成 / 宝箱 / Buff栏 / 暂停 / Tooltip / Toast
import type { Game } from '../core/Game';
import { getPass, runPassOnImageData, defaultUniforms } from '../fx/SM2Effect';
import { options } from '../core/Options';
import { bindsOf, keybindActionLabel, keybindCodeLabel, type KeybindAction } from '../core/Keybinds';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { OPENABLE_BAG_VIDS, openBagItem } from '../data/vanillaOpenBags';
import { TILE_DEFS } from '../data/tiles';
import { autoFrameAt, cactusFrameAt, cactusTextureFor } from '../render/VanillaTiler';
import { vanillaItemKey, ingredientKey, VANILLA_RECIPES, RECIPE_GROUP_ITEMS, invIndexOfVanilla, vanillaIdOfItemKey, type VanillaRecipeLike } from '../data/vanillaRecipes';
import { petInfoOfVid } from '../data/vanillaPets';
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
import { assembleTooltipLines } from './itemTooltip';
import { BuffType, BUFF_DEFS, buffName, buffDesc } from '../stats/Buffs';
import { Lang } from '../i18n/Lang';
import { ITEM_NAME_BY_ID, ITEM_NAME_EN_BY_ID } from '../i18n/idNames.generated';
import { ACH_ICON_INDEX, achIconFrame } from '../data/vanillaAchievements';
import { ChatMonitor } from './ChatMonitor';
import { NpcDialog, NpcShop, NpcHappinessPanel, formatCopper, type NpcButtonId, type ShopEntry, type HappinessInfo } from './NpcDialog';
import { UISfx } from '../vui/UISfx';
import { COIN_START, AMMO_START, INV_SIZE, coinIndexOf } from '../items/Inventory';
import { openAchievementsPanel, closeAchievementsPanel, createAchievementAdvisor } from './AchievementsUI';
import { openResearchPanel, closeResearchPanel } from './ResearchUI';
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

function iconUrl(game: Game, id: number): string {
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
      const c = game.assets.itemIcons.get(id);
      return c ? c.toDataURL() : '';
    }
    const c = game.assets.itemIcons.get(id);
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
/* 悬停高亮:合成列表走 .hov 类(JS 维护)——滚步会全量重建行 DOM,伪类在
   旧行销毁瞬间断开、新行要等真实 mousemove 才恢复 = 滚动时高亮闪动
   (2026-08-25 用户报);类由 enter/leave 维护 + 重建后立即补回 → 稳定。
   :hover 并存兜底其他 .sw-recipe 列表(guide 检索结果等,无重建闪动问题) */
.sw-recipe:hover, .sw-recipe.hov { background:rgba(70,55,100,0.9); }
/* 置灰只作用内容（img/span opacity+去饱和）——★行本身保持透明：行 opacity<1
   会连"透出的游戏画面"一起半透 = 一块灰色遮罩观感（2026-08-27 用户报） */
.sw-recipe.no { cursor:default; }
.sw-recipe.no img, .sw-recipe.no span { opacity:0.45; filter:grayscale(0.7); }
.sw-recipe img { width:22px; height:22px; image-rendering:pixelated; }
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

/** PvP 剑帧（UI_PVP_0 :42094/:42112-42113）：col=(hostile?2:0)+(hover?1:0)、row=team(0-5) */
export function pvpIconFrame(hostile: boolean, hover: boolean, team: number): readonly [number, number] {
  return [(hostile ? 2 : 0) + (hover ? 1 : 0), Math.max(0, Math.min(5, team))];
}

/** 队伍切换冷却（teamCooldownLen=300t × 1000/60ms，:1026；冷却期无悬停提示/不可点） */
export const PVP_COOLDOWN_MS = 5000;

export class UI {
  /** LoadoutShare 首用提示可见性（Player.Settings.ShowLoadoutShareHint,M57:4303/:4645——
   *  R4-15;原版持久化到 settings,本仓会话态,首次共享后置否。持久化随 R4-14） */
  static loadoutShareHintVisible = true;
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
  tooltip!: HTMLElement;
  toastEl: HTMLElement | null = null;
  achWrapEl: HTMLElement | null = null;
  heldStack: { id: number; stack: number; prefix?: number; placeStyle?: number; favorited?: boolean } | null = null; // prefix/placeStyle/favorited 随实例流转（★批III②收藏态透传——ghost 金边框消费）
  /** 光标持有物来源区（露西存取台词的 CountsAsStorage 判定，ItemSlot 上下文；
   *  两会话撞字段合并：null=未持取（CountsAsStorage 判定的"非箱取"缺省档） */
  heldFrom: SlotWhere | null = null;
  openChest: ChestData | null = null;
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

  /** 广播盒文本编辑（Player.cs:32231-32250 OpenSign → 原版聊天行输入框；
   *  DOM 近似为文本域 + 保存按钮）。保存写回 Sign 登记（Sign.TextSign） */
  editSign(x: number, y: number, text: string) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:420px; max-height:70vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.Sign.Title')));
    const body = el('div');
    body.style.cssText = 'font-size:12px; color:#9a8ab8; margin:8px 0 4px;';
    body.textContent = Lang.text('Mods.SandboxWorld.Sign.Hint');
    panel.appendChild(body);
    const input = el('textarea') as HTMLTextAreaElement;
    input.value = text;
    input.style.cssText = 'width:100%; height:110px; resize:vertical; font-size:13px; color:#d8d4e4; background:#14121c; border:1px solid #3a3350; border-radius:4px; padding:6px;';
    input.placeholder = Lang.text('Mods.SandboxWorld.Sign.Placeholder');
    panel.appendChild(input);
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:10px; justify-content:flex-end;';
    const cancel = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    cancel.addEventListener('click', () => panel.remove());
    row.appendChild(cancel);
    const save = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.Sign.Save'));
    save.addEventListener('click', () => {
      this.game?.setSignText(x, y, input.value);
      panel.remove();
    });
    row.appendChild(save);
    panel.appendChild(row);
    this.root.appendChild(panel);
    input.focus();
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
    // closeInventory：本仓 uiBlocking=背包开着即拦世界输入，若只关箱子、
    // uiBlocking 残留=自动关后立刻无法攻击/挖掘（2026-08-28 探针实测）；
    // 原版 chest=-1 后 playerInventory 保持但世界输入不拦——全关即本仓等价
    game.closeChestPanel = () => this.closeInventory();
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
    ok.addEventListener('click', () => {
      void options.set('manualSeen', true);   // 读过=熄泡
      if (hideChk.checked) {
        void options.set('manualHidden', true);   // 永久隐藏=按钮撤除(设置页可重开)
        this.manualBtn?.remove();
        this.manualBtn = null;
      } else {
        this.manualBtn?.querySelector('.sw-manual-badge')?.remove();
      }
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
        if (!this.heldStack && cur && cur.stack === 1 && this.canSwapEquip(cur.id)) {
          this.swapEquipItem(cur, where, i);
          this.refreshAll();
          return;
        }
        this.splitHalf(i, where);
        return;
      }
      // Shift+左键（GetAlternateClickAction :563-662）：背包→箱子/装备→卸下/箱内→背包
      if (e.shiftKey && !e.altKey) {
        this.shiftClick(i, where);
        return;
      }
      // Alt+左键（OverrideHover :533-561）：背包/钱币/弹药格=收藏/取消（favorited 禁
      // Shift 转移）;装备五类格=跨配装共享开关（R4-15,canLoadoutShareAt[8-12]
      // IS57:367-371 → ToggleLoadoutShare :851-861：置 favorited+音12+
      // ClearSlotShareInOtherLoadouts :863-884 同槽仅一套可共享;misc 族原版
      // assert 跳过清理=仅 toggle）
      if (e.altKey && !e.shiftKey) {
        const inv = this.game.player.inv;
        if (where === 'inv' && i < 58) {
          const cur = inv.slots[i];
          if (cur) {
            cur.favorited = !cur.favorited;
            this.game.sfx.play('menuTick', 1);
            this.refreshAll();
            return;
          }
        } else if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
          const cur = this.slotContent(where, i);
          if (cur) {
            cur.favorited = !cur.favorited;
            if (cur.favorited) UI.loadoutShareHintVisible = false;   // DisableLoadoutShareHint :857
            if (cur.favorited && (where === 'armor' || where === 'dye')) {
              const backups = inv.loadouts.map((l) => (where === 'armor' ? l.armor : l.dye));
              for (const arr of backups) {
                const b = arr[i];
                if (b) b.favorited = false;
              }
            }
            this.game.sfx.play('menuTick', 1);
            this.refreshAll();
            return;
          }
        }
      }
      this.dragFrom = { i, where, sx: e.clientX, sy: e.clientY };
    });
    s.addEventListener('mouseenter', () => this.showTooltipFor(i, where));
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
    if (d.armor || d.accessory) return true;
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
    if (d.armor) {
      target = d.armor.slot + (van ? 10 : 0);
    } else if (armorSlotIndexOfInternal(cur.id) >= 0) {
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

  /** Shift+左键快速转移（GetAlternateClickAction :563-662 主干）：
   *  开箱→入箱（仅堆已有或空格）；装备/配饰/染料/杂项→卸回背包；箱内→背包；背包内→垃圾桶 */
  private shiftClick(i: number, where: SlotWhere): void {
    const inv = this.game.player.inv;
    if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      // Unequip（:634-649）：卸回背包
      const arr = this.equipArray(where);
      const cur = arr[i];
      if (!cur || cur.favorited) return;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) arr[i] = null;
      this.refreshAll();
      return;
    }
    if (where === 'inv') {
      const cur = inv.slots[i];
      if (!cur || cur.favorited) return; // 收藏禁转移（:566）
      if (this.openChest) {
        // TryPlacingInChest（QuickStack 语义：先合并箱内已有类型再空格）
        const chest = this.openChest;
        let moved = 0;
        for (let k = 0; k < chest.items.length; k++) {
          const cs = chest.items[k];
          if (cs && cs.id === cur.id && cs.stack < ITEM_DEFS[cur.id].maxStack) {
            const put = Math.min(ITEM_DEFS[cur.id].maxStack - cs.stack, cur.stack);
            cs.stack += put; cur.stack -= put; moved += put;
            if (cur.stack <= 0) break;
          }
        }
        for (let k = 0; k < chest.items.length && cur.stack > 0; k++) {
          if (!chest.items[k]) { chest.items[k] = cur; inv.slots[i] = null; return; }
        }
        if (cur.stack <= 0) inv.slots[i] = null;
        if (moved > 0 || !inv.slots[i]) this.refreshAll();
        return;
      }
      // NPC 商店开着 → 卖出（GetAlternateClickAction :589-626 → GetSellOrTrash
      //  ItemSlot.cs:185-196：npcShop>0 时 Sell 优先于垃圾桶；钱币 71-74 返回 null
      //  = 不动作——与箱子的优先级同原版：chest != -1 分支在 npcShop 之前判定）
      if (this.game.npcShopOpen) {
        if (coinIndexOf(cur.id) >= 0) return;   // :191-194 钱币豁免（不卖也不扔）
        this.game.npcShopSell(i);
        this.refreshAll();
        return;
      }
      // 无箱→垃圾桶（覆盖旧内容，OverrideLeftClick cursorOverride 6 :689-706）
      inv.trash = cur;
      inv.slots[i] = null;
      // 音 = TrashItem+Grab 双音（:692-706，同垃圾桶直丢路径；曾 menuTick 偏差）
      this.game.sfx.playFiles(['trash_item_0', 'trash_item_1'], 1);
      this.game.sfx.play('pickup', 1);
      this.refreshAll();
      return;
    }
    if (where === 'chest') {
      // TransferFromChest（:626-633）：箱→背包
      const chest = this.openChest;
      if (!chest) return;
      const cur = chest.items[i];
      if (!cur) return;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) chest.items[i] = null;
      else cur.stack = left;
      this.refreshAll();
    }
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
      if (t?.closest?.('.sw-slot') || t?.closest?.('.sw-panel') || t?.closest?.('.sw-btn')) return;
      // NPC 商店面板（ItemSlot.Handle context 15 Main.cs:41279-41282 商店格区）：
      //  · 行/按钮 → 各自 click 链（行 = 有货商店格；光标持有时 Game.npcShopBuy 内
      //    的 CanStack/满叠门裁决，异型整链无动作 PickItemMovementAction :1427-1438）
      //  · 空白区 = 空商店格 → 光标持有物整叠卖出（PickItemMovementAction case 15
      //    :1435-1438 → LeftClick case 4 :1110-1129 SellItem(mouseItem)），
      //    不丢世界、不放置
      //  · NPC 对话/心情浮层也是 UI（mouseInterface），点它不丢世界
      if (t?.closest?.('.sw-npc-shop')) {
        if (t.closest('.sw-shop-item') || t.closest('button')) return;
        if (this.game?.npcShopSellHeld(this.heldStack)) this.heldStack = null;  // :1116 SetDefaults(0)
        this.refreshAll();
        return;
      }
      if (t?.closest?.('.sw-npc-dialog') || t?.closest?.('.sw-happy-panel')) return;
      this.throwHeldToWorld();
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
    if (this.heldStack) this.heldStack.stack += cur.stack;
    else { this.heldStack = { id: cur.id, stack: cur.stack, prefix: cur.prefix, favorited: cur.favorited, ...(cur.placeStyle !== undefined ? { placeStyle: cur.placeStyle } : {}) }; this.heldFrom = where; } // 保留词缀+实例样式+收藏态（★批III②）
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
          arr[i] = this.heldStack;
          this.heldStack = null;
        } else {
          arr[i] = { ...this.heldStack, stack: 1 };
          this.heldStack.stack--;
        }
        // 空装备槽放置音（原版 case1/2 MouseItemSwap 后 SoundID 7 :1018）
        this.game.sfx.play('pickup', 1);
      } else if (this.heldStack.stack === 1 && cur.id !== this.heldStack.id) {
        // 交换前反向校验（取出的物品总是合法的，防御性保留）
        if (where === 'armor' && !inv.armorAccepts(i, cur.id)) return;
        arr[i] = this.heldStack;
        this.heldStack = cur;
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
      if (!cur) {
        inv.slots[i] = this.heldStack;
        this.heldStack = null;
      } else if (cur.id === this.heldStack.id) {
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else if (inv.canAccept(i, cur.id) === false) {
        return; // 占位物品放不回普通格（理论不发生，防御）
      } else {
        inv.slots[i] = this.heldStack;
        this.heldStack = cur;
      }
      // 放置/合并/交换音（ItemSlot.cs:987-989 → SoundID 7 Grab）
      this.game.sfx.play('pickup', 1);
    } else {
      const chest = this.openChest;
      if (!chest) return;
      const cur = chest.items[i];
      if (!cur) {
        chest.items[i] = this.heldStack;
        this.heldStack = null;
      } else if (cur.id === this.heldStack.id) {
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else {
        chest.items[i] = this.heldStack;
        this.heldStack = cur;
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
    // 面板外：丢进世界；面板内空白：放回原格
    const inPanel = target?.closest?.('.sw-panel');
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

  /** 槽位悬停详情气泡。override：非槽位锚点（道具搜索结果行）——slot 传合成槽
   *  内容（stack 1 无词缀/收藏），anchor 传气泡定位锚元素 */
  private showTooltipFor(i: number, where: SlotWhere, override?: { slot: { id: number; stack: number }; anchor: HTMLElement }) {
    const s = (override?.slot ?? this.slotContent(where, i)) as { id: number; stack: number; favorited?: boolean; prefix?: number } | null;
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
      shop: this.shopTooltipContext(def, vid, s.stack),
      expert: rare === -12,
      master: rare === -13,
      anglerQuestItemId: g.anglerQuestItemId?.() ?? 0,
      // 社交槽语义（dye 槽 / armor 社交位——本仓 dye 槽 = 原版 social dye 位）
      socialSlot: where === 'dye' || where === 'miscDye',
    };
    let linesHtml = '';
    // ---- LoadoutShare 行族（R4-15,M57:20824-20833 共享两行 + :21517-21519 首用提示）：
    // 装备五类格（canLoadoutShareAt[8-12],IS57:367-371）悬停时,紧随名称行（GetLinesInfo
    // 里在全部统计行之前）：共享来源行 > 共享标记行 > （未收藏且未用过共享时）提示行。
    // 提示色 = OurFavoriteColor(255,231,69) α190（Main.cs:886/:21520）;共享两行走默认
    // 文字色（GetLinesInfo 未赋 lineColors）。ShowLoadoutShareHint 设置持久化缺（R4-14）
    // ——本仓会话内首次共享后不再显示（DisableLoadoutShareHint :857 语义）
    if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      const inv = this.game.player.inv;
      const from = (where === 'armor' || where === 'dye')
        ? inv.effectiveSharedFrom(i, where === 'dye')
        : null;
      if (from !== null) {
        linesHtml += `<br>${Lang.text('UI.ItemLoadoutSharedFrom', from + 1)}`;
      } else if (s.favorited) {
        linesHtml += `<br>${Lang.text('UI.ItemLoadoutShared')}`;
      } else if (UI.loadoutShareHintVisible) {
        linesHtml += `<br><span style="color:rgba(255,231,69,0.75)">${Lang.text('UI.ItemLoadoutShareHint')}</span>`;
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

  /** 商店悬停上下文（:20309-20402，Main.npcShop<=0 早退——背包内不显价格）：
   *  买入价走 openNpcShop 同源 expectedPrices（快乐度 PriceAdjustment×/折扣 0.8×/
   *  银行家舍入——ShopEntry.price 已算好，这里反查货架条目即可；显示侧 min-1
   *  门 Main.cs:20341-20343 在此同款）。非货架物品（玩家自带物悬停）→ 原版
   *  hoverItem 是商店快照同款也显示买入价，此处按 expectedPrices(货架价×pa) 近似 */
  private shopTooltipContext(def: (typeof ITEM_DEFS)[number], vid: number, stack: number): { buy: boolean; priceCopper: number; medalPrice?: number } | null {
    if (!this.game.npcShopOpen) return null;   // Main.npcShop<=0 早退（:20310-20312）
    // 货架条目（isAShopItem）→ 买入价（expectedPrices 同链 :20312 calcForBuying）
    const g = this.game as unknown as {
      shopEntryPriceOf?: (vid: number) => number | null;
      shopEntryMedalPriceOf?: (vid: number) => number | null;
    };
    // 勋章条目（hoverItem.shopSpecialCurrency≠-1，Main.cs:20313-20316）：价格行
    // 走 GetPriceText 勋章文案（枚数 + Currency.DefenderMedals），不进铜币四档着色
    const medal = g.shopEntryMedalPriceOf?.(vid);
    if (medal != null) return { buy: true, priceCopper: medal, medalPrice: medal };
    const listed = g.shopEntryPriceOf?.(vid);
    if (listed != null) return { buy: true, priceCopper: Math.max(1, listed) };
    // 玩家自带物在商店内 → 卖出价（:20312 calcForSelling → :20324-20326 ÷5 min1 ×stack）
    const v = def.value ?? 0;
    if (v <= 0) return { buy: false, priceCopper: 0 };  // 无价值行（tip51）
    const unit = Math.max(1, Math.floor(v / 5));
    return { buy: false, priceCopper: Math.max(1, unit * Math.max(1, stack)) };
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
    const h = best ? (parseFloat(best.style.height) || best.getBoundingClientRect().height || 52) : 52;
    const topPx = best ? parseFloat(best.style.top) : NaN;
    const top = Number.isFinite(topPx) ? Math.round(topPx + h + 8) : 84;
    // ★position:fixed/overflow 必须在此维持（.sw-panel 类无定位——曾重写贴位时
    //   丢掉 fixed → 面板回落文档流 = 满宽平铺、left/top 全失效）
    this.invPanel.style.position = 'fixed';
    this.invPanel.style.overflow = 'auto';
    this.invPanel.style.left = `${left}px`;
    this.invPanel.style.top = `${top}px`;
    this.invPanel.style.maxHeight = `calc(100vh - ${top + 12}px)`;
    // ★透明只调面板底色 alpha（0.78/0.8 → 0.55/0.58）——不动 opacity（曾用面板级
    //   opacity 连格子/文字一起半透,2026-08-27 用户纠正）
    this.invPanel.style.background = 'linear-gradient(rgba(38,50,90,0.55), rgba(22,30,58,0.58))';
    this.invPanel.style.borderColor = 'rgba(125,146,214,0.4)';
    this.invPanel.style.boxShadow = '0 0 0 1px rgba(10,14,30,0.45), 0 4px 16px rgba(0,0,0,0.4)';
  }

  openInventory() {
    if (this.invPanel.style.display === 'block') {
      this.closeInventory();
      return;
    }
    // 住房条开着(E 切回背包):先收——不收则背包被住房 Canvas 压住
    this.closeHousingPanel();
    this.positionInvPanel();
    this.invPanel.style.display = 'block';
    // 开背包会引发热键栏重排（slot 80ms left 过渡）——过渡结束后二次贴位校正；
    // 配方列表高度同批二次刷新（首次采样布局未稳,LIST_H 偏大,hover 前不收敛）
    setTimeout(() => {
      this.positionInvPanel();
      this.refreshVanillaCrafting();
    }, 120);
    this.refreshAll();
    this.game.input.uiBlocking = true;
  }

  closeInventory() {
    this.closeHousingPanel();
    this.invPanel.style.display = 'none';
    this.closeItemSearch();
    this.closeGuideSearch();
    this.closeChest();
    // 放回手上物品
    if (this.heldStack) {
      this.game.player.inv.add(this.heldStack.id, this.heldStack.stack);
      this.heldStack = null;
    }
    // 材料格内容归还背包（CraftingGrid 关闭语义）
    this.returnCraftGrid();
    this.craftGridRecipe = null;
    // 垃圾桶为持久槽（Player.trashItem 语义）：关闭背包保留，仅死亡时由 Game 清空
    this.moveGhost();
    this.game.input.uiBlocking = false;
  }

  // ============ 调试用：道具搜索器（背包面板"🔍 道具搜索"按钮） ============
  private itemSearchEl: HTMLDivElement | null = null;
  /** 搜索面板开启期间 tooltip 的暂离归宿（面板 z1200 > .sw-root z10——tooltip 留在
   *  root 内会被 stacking context 压在面板下,2026-08-27 用户报；搬 body 顶层） */
  private tooltipHome: HTMLElement | null = null;

  /** 打开搜索面板：按 名称/key/原版id 过滤 ITEM_DEFS，点击条目入包 */
  openItemSearch() {
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
      if (ct !== undefined && coveredSheets.has(ct)) return false;   // 惰性 vi_ 死条目
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

  /** 反查面板：搜物品 → 列出以它为材料的全部配方（含 RecipeGroup 成员） */
  openGuideSearch(): void {
    this.closeGuideSearch();
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1200; display:flex; align-items:center; justify-content:center;';
    const panel = el('div');
    panel.style.cssText = 'width:620px; max-height:76vh; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px;';
    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
    titleRow.appendChild(el('div', 'sw-lbl', Lang.inter(21)));
    const closeBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    closeBtn.style.cssText = 'cursor:pointer; width:auto; margin:0;';
    closeBtn.addEventListener('click', () => this.closeGuideSearch());
    titleRow.appendChild(closeBtn);
    panel.appendChild(titleRow);
    const input = el('input') as HTMLInputElement;
    input.placeholder = '材料名称 / key / 原版 id…';
    input.style.cssText = 'width:100%; box-sizing:border-box; padding:6px 8px; background:#1a1a22; color:#eee; border:1px solid #555; border-radius:4px; font-size:14px;';
    panel.appendChild(input);
    const itemRow = el('div');
    itemRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; overflow-y:auto; max-height:120px; align-content:flex-start;';
    panel.appendChild(itemRow);
    const recipeList = el('div');
    recipeList.style.cssText = 'overflow-y:auto; flex:1;';
    panel.appendChild(recipeList);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeGuideSearch();
    });
    document.body.appendChild(overlay);
    this.guideEl = overlay;

    const entries = ITEM_DEFS.map((d, id) => {
      const vid = d.key.startsWith('vi_') ? parseInt(d.key.slice(3, d.key.indexOf('_', 3)), 10) : -1;
      const name = Lang.itemNameByKey(d.key) || d.key;
      return { id, vid, name, lc: (name + ' ' + d.key + ' ' + vid).toLowerCase() };
    }).filter((e) => e.vid >= 0);
    const renderItems = () => {
      const q = input.value.trim().toLowerCase();
      itemRow.textContent = '';
      let shown = 0;
      for (const e of entries) {
        if (q && !e.lc.includes(q)) continue;
        if (++shown > 40) break;
        const chip = el('div');
        chip.title = e.name;
        chip.style.cssText = 'display:flex; align-items:center; gap:3px; width:150px; padding:2px 4px; background:#1f1f28; border:1px solid #444; border-radius:3px; cursor:pointer; font-size:12px; color:#ddd;';
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game!, e.id);
        img.style.cssText = 'width:22px; height:22px; image-rendering:pixelated; flex:none;';
        chip.appendChild(img);
        const lbl = el('span');
        lbl.textContent = e.name;
        lbl.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        chip.appendChild(lbl);
        chip.addEventListener('click', () => this.renderGuideRecipes(recipeList, e.vid));
        itemRow.appendChild(chip);
      }
      if (!shown) itemRow.appendChild(el('div', 'sw-lbl', '无匹配'));
    };
    input.addEventListener('input', renderItems);
    renderItems();
    input.focus();
  }

  /** 材料的配方列表（CollectGuideRecipes：items 直接命中或 RecipeGroup 成员命中） */
  private renderGuideRecipes(listEl: HTMLElement, vid: number): void {
    listEl.textContent = '';
    const game = this.game;
    const avail = new Map<unknown, number>();
    for (const { r, count } of game.vanillaAvailableRecipes()) avail.set(r, count);
    let hits = 0;
    for (const r of VANILLA_RECIPES) {
      const used = r.items.some((req) => req.id === vid
        || (req.id >= 1000000 && (RECIPE_GROUP_ITEMS[String(req.id - 1000000)] ?? []).includes(vid)));
      if (!used) continue;
      if (++hits > 60) { listEl.appendChild(el('div', 'sw-lbl', '…更多结果请细化')); break; }
      const outKey = vanillaItemKey(r.create);
      if (!outKey) continue;
      const row = el('div', 'sw-recipe' + (avail.has(r) ? '' : ' no'));
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(game, game.itemId(outKey));
      row.appendChild(img);
      const label = el('span', '', `${Lang.itemNameByKey(outKey)}${r.createStack > 1 ? ` ×${r.createStack}` : ''}`);
      row.appendChild(label);
      const info = el('span', '', `${r.tile >= 0 ? (Lang.tileName(r.tile) ?? `站点 ${r.tile}`) : Lang.text('Mods.SandboxWorld.UI.StationHand')} · ${
        r.items.map((req) => `${req.id >= 1000000 ? '任何组物' : (Lang.itemNameByKey(ingredientKey(req.id) ?? '') ?? req.id)} ${req.stack}`).join(' +')}`);
      info.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right; max-width:280px;';
      row.appendChild(info);
      if (avail.has(r)) {
        row.onclick = () => {
          game.vanillaCraft(r, 1);
          this.refreshAll();
        };
      }
      listEl.appendChild(row);
    }
    if (!hits) listEl.appendChild(el('div', 'sw-lbl', '该物品不用于任何配方'));
  }

  closeGuideSearch(): void {
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
    this.game.player.inv.trash = { ...this.heldStack };
    this.heldStack = null;
    this.game.sfx.playFiles(['trash_item_0', 'trash_item_1'], 1);   // SoundID.TrashItem
    this.game.sfx.play('pickup', 1);                                 // SoundID 7 Grab（:698）
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
  /** 右缘列（成就卡+杂项+PvP）——配方列表高度的上对齐基准（列表底 ≤ 列底） */
  private advRailEl: HTMLElement | null = null;
  /** 配饰格可见性眼睛钮（槽序 → 元素,attachVisibilityEye 登记/refreshAllNow 重刷） */
  private accEyeEls = new Map<number, HTMLElement>();
  private loadoutBtns: HTMLButtonElement[] = [];
  /** 背包侧"堆叠至附近宝箱"钮（ChestStack：左键堆叠/右键循环模式；开箱时隐藏） */
  private quickStackBtn!: HTMLButtonElement;
  /** ChestStack 钮悬停态（帧选 0/1 常态·悬停位） */
  private qsHover = false;
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
    this.invPanel = el('div', 'sw-panel');
    // 位置（2026-08-27 用户要求）：对齐左上工具栏最左格（面板跑工具栏正下方一点）,
    // 不再水平居中——左=热键栏首格左缘,顶=热键栏底+8px;透明度再拉高（opacity .75,
    // 叠 .sw-panel 半透底）+ 边框/投影弱化。★每次 openInventory 重算（贴位取热键栏
    // 槽 inline 布局值）;★构建后必须显式 display:none（E 开/E 关语义,曾漏=默认开着）
    this.positionInvPanel();
    this.invPanel.style.display = 'none';
    // 原版背包无标题栏（DrawInventory 直接铺槽位）——标题行已摘（2026-08-13）

    // ---- Loadout 切换行（DrawLoadoutButtons Main.cs:41386+：当前套高亮）——
    //  ★2026-08-27 用户要求：随装备列整体迁至右缘（成就/杂项列左侧）,不再占顶排
    const loadoutRow = el('div');
    loadoutRow.style.cssText = 'display:flex; gap:4px; align-items:center; margin-bottom:6px;';
    loadoutRow.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.Tabs.Loadout')));
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
        loadoutRow.appendChild(b);
        this.loadoutBtns.push(b);
      }
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
      // 改用 emoji 🔍 + hover 金色衬底
      {
        const bS = el('button');
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
        row.appendChild(bS);
      }
      {
        const b = el('button');
        b.title = Lang.text('Mods.SandboxWorld.Housing.Button');
        b.style.cssText = 'margin:0; width:22px; height:24px; padding:0; flex:none; border:none;'
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
        bBst.title = Lang.text('Mods.SandboxWorld.Tabs.Bestiary');
        bBst.style.cssText = 'margin:0; width:32px; height:30px; padding:0; flex:none; border:none;'
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
    // 图标行挂右缘列顶部（原 invPanel 顶行,2026-08-27）——advRail 创建于下方彼处 prepend

    // 主体：原版布局——左装备竖列（盔甲 0-2 + 配饰 3-7 | 染料 0-2+3-7 | 时装 10-12 + 时装配饰 13-17）
    // / 杂项页（miscEquips[5] + miscDyes[5]，Main.cs:40616-40672 EquipPage==2）+
    // 垃圾桶 + 钱币 + 弹药；右背包 10×4（10-49）。原版三列 x=sw-92/-139/-186。
    const body = el('div');
    body.style.cssText = 'display:flex; gap:14px; margin-bottom:8px;';
    const left = el('div');
    // 装备组（2026-08-27 用户要求：配装行+染料/时装/装备列整体迁至成就/杂项列左侧,
    // 背包贴热键栏）——挂载点移至 body 尾部 rightRail 之后
    left.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex:none;';
    left.appendChild(loadoutRow);
    // 竖排列构建器（原版 DrawInventory :40844-40968 语义：同 x 纵向排，label 顶部）
    const vcol = (label: string, from: number, n: number, where: SlotWhere) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      for (let k = 0; k < n; k++) col.appendChild(this.makeSlotEl(from + k, where));
      col.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
      return col;
    };
    // 装备页：三列 L→R = 染料 | 时装 | 装备（原版 DrawInventory :40830-40968：
    //  x=sw-186/-139/-92 单列纵向 47px 列距；配饰段相对盔甲段下移 num35=4px）。
    //  两段式竖列（盔甲段 + 4px 组距 + 配饰段）
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
    eqPage.appendChild(vcol2(Lang.text('LegacyInterface.57'), 0, 3, 3, 7, 'dye'));            // 染料 dye[0-2]+[3-9]
    eqPage.appendChild(vcol2(Lang.text('Mods.SandboxWorld.UI.Vanity'), 10, 3, 13, 5, 'armor')); // 时装 armor[10-12]+[13-17]
    const equipCol = vcol2(Lang.text('Mods.SandboxWorld.UI.Equipment'), 0, 3, 3, 5, 'armor', true);   // 装备 armor[0-2]+[3-7]（防御计数器挂此列底;配饰段挂眼睛开关）
    eqPage.appendChild(equipCol);
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
    miscRail.style.cssText = 'display:flex; gap:10px; align-items:flex-start;';
    const miscCol = el('div');
    miscCol.style.cssText = 'display:flex; flex-direction:column;';
    MISC_LABELS.forEach((lbl, k) => {
      const pair = el('div');
      pair.style.cssText = 'display:flex; flex-direction:column;';
      pair.appendChild(el('div', 'sw-lbl', lbl));
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
      miscCol.appendChild(pair);
    });
    miscRail.appendChild(miscCol);
    miscRail.appendChild(vcol(Lang.text('Mods.SandboxWorld.Tabs.Dye'), 0, 5, 'miscDye'));
    // 垃圾桶（持久槽；可交换取回）——原版 (448,258) scale0.85=44px、槽底 Back7（context 6）
    const trashWrap = el('div');
    trashWrap.appendChild(el('div', 'sw-lbl', Lang.text('LegacyInterface.3')));
    const trash = el('div', 'sw-slot trash sw-trash');
    trash.style.cssText = 'width:44px; height:44px; flex:none;'
      + 'background-image:url(sprites/vanilla/Inventory_Back7.png);';
    trash.addEventListener('mousedown', (e) => {
      e.stopPropagation();
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

    // 背包 10×4（10-39）
    const right = el('div');
    // 背包标签行 + 调试搜索按钮（原版无此按钮——调试用道具检索器）
    {
      const lblRow = el('div');
      lblRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; width:100%;';
      lblRow.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.UI.InvLabel')));
      // 道具搜索文字钮已摘（2026-08-27 图标化上移顶排图标组,见上方 buildInventoryPanel）
      // 向导配方反查按钮已摘（2026-08-14 用户要求；openGuideSearch 逻辑保留，
      // 通道如需再开走 Guide 对话入口）
      right.appendChild(lblRow);
    }
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10, var(--slot)); gap:4px;';
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
    //      位于背包格右下与合成区之间。本仓 Sort 未实装、Bestiary 贴图缺 →
    //      簇内只落 QuickStack + Emote 两枚，右对齐两行）----
    const clusterRow = el('div');
    clusterRow.style.cssText = 'display:flex; justify-content:flex-end; gap:6px; margin:2px 0 4px;';
    // 堆叠至附近宝箱（ChestStack 贴图 4 帧 = 悬停位+模式位：0 常态-quick/1 悬停-quick/
    //  2 常态-smart/3 悬停-smart，Main.cs:41311 num80 += mode*2 + hover）——左键
    // QuickStackAllChests + 音 12 / 右键 CycleQuickStackMode + 音 10；开箱/商店隐藏
    this.quickStackBtn = el('button', 'sw-btn');
    this.quickStackBtn.style.cssText = 'margin:0; width:30px; height:30px; padding:0; flex:none;'
      + 'border:none; background:url(sprites/vanilla-ui/UI_ChestStack_0.png) 0 0 / 100% 100%;'
      + 'image-rendering:pixelated; cursor:pointer;';
    this.quickStackBtn.addEventListener('mouseenter', () => { this.qsHover = true; this.refreshAll(); });
    this.quickStackBtn.addEventListener('mouseleave', () => { this.qsHover = false; this.refreshAll(); });
    this.quickStackBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;   // ★右键 = contextmenu 切模式（2026-08-27 用户报：
                                    //  mousedown 无键判 → 右键先触发堆叠再切模式）
      this.game.quickStackAllChests();
      this.game.sfx.play('menuTick', 1);          // SoundID 12（:41292）
      this.refreshAll();
    });
    this.quickStackBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.cycleQuickStackMode();             // CycleQuickStackMode（:41297-41301）
      this.game.sfx.play('menuOpen', 1);          // SoundID 10 + SaveSettings
      this.refreshAll();
    });
    clusterRow.appendChild(this.quickStackBtn);
    // 表情入口（原版簇位 (534,278)：EmoteMenuButton 双帧裸图标，左键开 UIEmotesMenu
    // :41850；打开逻辑经 Game 注入 onEmoteMenu）
    const bEmote = el('button', 'sw-btn');
    bEmote.title = Lang.has('GameUI.Emote') ? Lang.text('GameUI.Emote') : 'GameUI.Emote';
    bEmote.style.cssText = 'margin:0; width:30px; height:30px; padding:0; flex:none;'
      + 'background:url(sprites/vanilla-ui/UI_Emotes.png) 0 0 / 200% 100%;'
      + 'image-rendering:pixelated; border:none; cursor:pointer;';
    bEmote.addEventListener('mouseenter', () => { bEmote.style.backgroundPosition = '100% 0'; });
    bEmote.addEventListener('mouseleave', () => { bEmote.style.backgroundPosition = '0 0'; });
    bEmote.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.onEmoteMenu?.();
    });
    clusterRow.appendChild(bEmote);
    // ★2026-08-27 用户要求：堆叠/表情钮挂垃圾桶下方（原在背包网格下沿）——
    //  与右缘列构成：弹药|钱币 → 垃圾桶 → 堆叠+表情 的纵向工具列
    rightRail.appendChild(clusterRow);
    body.appendChild(right);
    // 垃圾桶/弹药/钱币列 → 背包右侧（夹在背包与成就/杂项列中间,2026-08-27 用户
    // 要求——背包+合成整体贴向装备列,顺手中转距离更短）
    body.appendChild(rightRail);
    // 装备组（配装行+染料/时装/装备列）→ 成就/杂项列左侧（2026-08-27 用户要求：
    // 背包整体贴左上热键栏,换物路径最短）
    body.appendChild(left);
    // 右缘列：成就提示牌 + 杂项（宠物/光源/矿车/坐骑/钩爪+染料，原杂项页迁入）
    // + PvP/队伍钮（2026-08-27 用户指定：杂项搬玩家对决原位,对决/队伍钮被顶下去；
    //   列高 ≈ 成就卡+杂项 310+PvP 120 ≈ 左装备列 620,面板高度不受影响。
    //   ★与左列 rightRail（垃圾桶/钱币）重名,此为 advRail）
    const advRail = el('div');
    this.advRailEl = advRail;
    advRail.style.cssText = 'display:flex; flex-direction:column; gap:8px; flex:none; align-items:center;';
    advRail.appendChild(row);   // 图标行（搜索/住房/图鉴+联机/旅程钮）挂列顶
    // 成就提示牌 → 物品格右侧（用户指定；alignSelf 防 body stretch 拉高卡片）
    this.achAdvisorEl.style.alignSelf = 'stretch';
    advRail.appendChild(this.achAdvisorEl);
    advRail.appendChild(miscRail);   // 杂项（玩家对决原位）——PvP/队伍在其下方
    body.appendChild(advRail);
    this.invPanel.appendChild(body);

    // ---- PvP/队伍快切钮（DrawPVPIcons Main.cs:42074-42195：原版背包右下角；
    //      本仓挂右缘列杂项块下方（2026-08-27 杂项迁入此列,对决/队伍钮顶下去）；
    //      原版 ShouldPVPDraw=netMode==1 仅联机画，本仓常开=设置页 PvP/队伍同款
    //      语义（单机调试便利 + 联机 msg13 同步）） ----
    const pvpWrap = el('div');
    // margin-top 拉开与钩爪行（杂项列末行）的间距（2026-08-27 用户要求）
    pvpWrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; margin-top:24px;';
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
    advRail.appendChild(pvpWrap);   // 右缘列成就卡下方（流内，不挤合成区）
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
      // 伤害减免换算（:41567-41572）：大师 ×1.0 / 专家 ×0.75 / 普通 ×0.5
      const mul = w.isMaster ? 1.0 : w.isExpert ? 0.75 : 0.5;
      const reduce = Math.ceil(st * mul);
      // 难度名 = 原版官译（UI.Softcore 经典 / UI.Expert 专家 / UI.Master 大师）
      const diff = w.isMaster ? Lang.text('UI.Master') : w.isExpert ? Lang.text('UI.Expert') : Lang.text('UI.Softcore');
      this.tooltip.innerHTML = `<b>${st} 防御</b><br><span style="color:#9a8ab8">伤害减免 ${reduce}%（${diff}）</span>`;
      this.tooltip.style.display = 'block';
    });
    defRow.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
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
    this.craftSearchEl = el('input') as HTMLInputElement;
    this.craftSearchEl.placeholder = Lang.text('Mods.SandboxWorld.Craft.SearchHint');
    // ★input 高度对齐右侧配方细项盒(38px)并恒定——未 hover 时细项盒塌掉曾把
    //  本行行高拖落=搜索框上下抖动（2026-08-26 用户图文定案）
    this.craftSearchEl.style.cssText = 'flex:1; height:38px; box-sizing:border-box; padding:4px 8px; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px; font-size:12px;';
    this.craftSearchEl.addEventListener('input', () => { this.craftFocus = -1; this.craftScroll = 0; this.craftScrollF = 0; this.craftWheelTarget = 0; this.refreshVanillaCrafting(); });
    modernRow.appendChild(this.craftSearchEl);
    this.craftGridEl = el('div');
    this.craftGridEl.style.cssText = 'display:flex; gap:4px; align-items:center; flex-wrap:wrap; max-width:426px; height:38px; box-sizing:border-box;';
    modernRow.appendChild(this.craftGridEl);
    right.appendChild(modernRow);
    const craftWrap = el('div');
    craftWrap.style.cssText = 'position:relative;';
    right.appendChild(craftWrap);
    this.craftListEl = el('div');
    // 原版无滚动条——滚轮驱动焦点评动(CraftingUI 滚动列表),不走原生滚动;
    // 曾 overflow-y:auto + refreshAll 重建行后 scrollTop 归零 = 滚动位置每帧重置
    this.craftListEl.style.cssText = 'height:240px; overflow:hidden; width:426px;';
    craftWrap.appendChild(this.craftListEl);
    // 滚动条（2026-08-21 用户要求；原版鱼眼列表无此件=自造 QoL）：列表右缘
    // 6px 竖槽+滑块，几何由 refreshVanillaCrafting 尾部按行窗占比刷；拖滑块/
    // 点槽跳转，滚轮同列表口径
    const track = el('div');
    // 槽底提亮+描边（2026-08-21 用户报"下滚一段才出现"——实为深蓝槽在面板上
    // 隐形，打开即渲染但视觉不可辨；提对比让它从打开起就是显性滚动条）
    track.style.cssText = 'position:absolute; left:430px; top:0; bottom:0; width:6px;'
      + 'background:rgba(58,52,108,0.75); border:1px solid rgba(122,144,214,0.4);'
      + 'border-radius:3px; cursor:pointer; display:none; box-sizing:border-box;';
    const thumb = el('div');
    thumb.style.cssText = 'position:absolute; left:0; width:6px; min-height:24px;'
      + 'background:rgb(150,170,236); box-shadow:0 0 2px rgba(10,10,30,0.8);'
      + 'border-radius:3px; cursor:grab;';
    track.appendChild(thumb);
    track.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.craftScrollJump(e.clientY);            // 点槽/抓滑块统一按比例跳焦
      const move = (ev: MouseEvent) => this.craftScrollJump(ev.clientY);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    track.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.craftWheelStep(ev.deltaY, ev.deltaMode);
    }, { passive: false });
    track.addEventListener('contextmenu', (e) => e.preventDefault());
    craftWrap.appendChild(track);
    this.craftTrackEl = track;
    this.craftThumbEl = thumb;
    this.root.appendChild(this.invPanel);
  }

  /** 滚动条几何元（refreshVanillaCrafting 每刷更新；拖拽 move 消费） */
  private craftTrackEl: HTMLElement | null = null;
  private craftThumbEl: HTMLElement | null = null;
  private craftScrollMeta = { len: 0, visRows: 0 };
  /** 配方列表可用高度（2026-08-27 用户要求：延展到面板下缘,曾恒 240px 底部死区） */
  private craftListH = 240;
  /** 列表容器上次写入的高度（同值跳过写=免布局失效） */
  private craftLastViewH = -1;
  /** 滚轮累积器（实例字段——列表元素每次进游戏重建，闭包累积器会随重建丢失半程量） */

  /** 滚轮步进（2026-08-21 用户三轮定标）：首响立即——距上次步进 >120ms 的
   *  事件直接走 1 行（单格滚不迟钝）；120ms 内的连发/惯性走累积阈值 100
   *  （触控板小增量按比例缓行）。deltaMode 1(lines) ×40 换算 */
  private craftWheelLast = 0;
  /** 列表容器最近一次真实 mousemove——区分「鼠标主动移到行上」与「内容滚动
   *  让行从静止鼠标下经过」(后者浏览器同样派发 mouseenter,但无 mousemove
   *  伴随)——hover 预选只认前者(2026-08-25 用户报滚动过程连环误预选) */
  private craftMouseMoveLast = 0;
  /** .hov 高亮行/其配方 idx/鼠标是否在列表内——高亮与预选(hoverFocus)分离:
   *  滚步重建行后按 idx 补回高亮(灭-亮闪动修复),预选不补(滚动不预选) */
  private craftHoverEl: HTMLElement | null = null;
  private craftHoverIdx = -1;
  private craftMouseInList = false;
  private craftWheelStep(dyRaw: number, deltaMode: number): void {
    const dy = deltaMode === 1 ? dyRaw * 40 : dyRaw;
    const now = performance.now();
    const fresh = now - this.craftWheelLast > 120;
    this.craftWheelLast = now;                 // hover 预览 350ms 门仍消费
    const maxA = Math.max(0, this.craftAvailRef.length - 1);
    // 1.8 行/100px（2026-08-27 用户报"滚动迟滞"提速：旧 1 行/100px 长列表
    // traverse 太慢；新手势保底 1 行保留）。★滚动只走动画不再 refreshAll 全刷
    let rows = dy / 55;
    if (fresh && Math.abs(rows) < 1) rows = Math.sign(dy || 1);
    let t = this.craftWheelTarget + rows;
    // 端部阻尼：越界部分按 35% 折算（拉伸蓄能），上限 3 行——松手由动画回弹归界
    if (t < 0) t *= 0.35;
    else if (t > maxA) t = maxA + (t - maxA) * 0.35;
    this.craftWheelTarget = Math.max(-3, Math.min(maxA + 3, t));
    this.craftWheelIdle = performance.now();
    // ★起步即动（2026-08-27 用户报"起步滚很延迟"）：缓动软启动首帧只走 ~40%，
    //  事件→rAF 排帧→缓动追=起步"顿一下再滑"。手势首格直接推到目标（零延迟），
    //  同手势后续事件也先走 65% 缩短追赶距离——rAF 只收剩下的尾巴
    if (fresh) {
      this.craftScrollF = this.craftWheelTarget;
    } else {
      this.craftScrollF += (this.craftWheelTarget - this.craftScrollF) * 0.65;
    }
    this.craftAnimKick();
  }

  /** rAF 动画：锚向目标指数缓动 + 越界回弹 + 窗绘制。静止即停，零空转 */
  private craftAnimKick(): void {
    if (this.craftAnimRaf) return;
    this.craftAnimLast = performance.now();
    this.craftAnimRaf = requestAnimationFrame(this.craftAnimFrame);
  }
  private craftAnimFrame = (now: number): void => {
    this.craftAnimRaf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.craftAnimLast) / 1000));
    this.craftAnimLast = now;
    const maxA = Math.max(0, this.craftAvailRef.length - 1);
    // 滚轮静默 >120ms 且目标越界 → 弹回界内（回弹）
    if (now - this.craftWheelIdle > 120 && (this.craftWheelTarget < 0 || this.craftWheelTarget > maxA)) {
      const bound = this.craftWheelTarget < 0 ? 0 : maxA;
      this.craftWheelTarget += (bound - this.craftWheelTarget) * (1 - Math.exp(-dt * 14));
      if (Math.abs(bound - this.craftWheelTarget) < 0.02) this.craftWheelTarget = bound;   // 0.6px 内吸附,肉眼不可辨
    }
    const diff = this.craftWheelTarget - this.craftScrollF;
    if (Math.abs(diff) > 0.0015) this.craftScrollF += diff * (1 - Math.exp(-dt * 34));
    else this.craftScrollF = this.craftWheelTarget;
    this.craftPaintWindow();
    const settled = this.craftScrollF === this.craftWheelTarget
      && this.craftWheelTarget >= 0 && this.craftWheelTarget <= maxA;
    if (!settled) this.craftAnimKick();
    else this.craftScroll = Math.round(Math.max(0, Math.min(maxA, this.craftScrollF)));   // 语义锚回写
  };

  /** 滚动条跳转（clientY → 槽内比例 → 焦点行；拖滑块与点槽共用） */
  private craftScrollJump(clientY: number): void {
    const track = this.craftTrackEl;
    const meta = this.craftScrollMeta;
    if (!track || meta.len <= meta.visRows) return;
    const r = track.getBoundingClientRect();
    const H = Math.max(1, r.height);
    const thumbH = Math.max(24, (meta.visRows / meta.len) * H);
    const usable = Math.max(1, H - thumbH);
    const ratio = Math.max(0, Math.min(1, (clientY - r.top - thumbH / 2) / usable));
    // 比例→窗起点（域 [0, len-visRows] 与 thumb 几何同域）→焦点=起点+4（滚轮同锚，
    // 曾映射 [0,len-1] 与 thumb 域错位=拖到底列表没到尾）
    const s = Math.round(ratio * (meta.len - meta.visRows));
    const focus = Math.min(meta.len - 1, s + 4);
    if (focus !== this.craftScroll) {
      this.craftScroll = focus;   // 悬停预览同滚轮：冻结不清，真实移鼠标才更新
      this.craftWheelTarget = focus;   // 拖拽同样走缓动（跳变被动画抹平）
      this.craftWheelIdle = 0;         // 拖拽非滚轮手势：直接允许绘制
      this.craftAnimKick();
    }
  }

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
    block.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
    block.addEventListener('mouseleave', () => { icon.style.opacity = '0.4'; });
    // 右键取消（TryRemovingBuff L42793+：非 debuff → DelBuff + SoundID 12；
    //  宠物 buff 走 CheckBuffHideMisc 收宠，不走 buffs.remove——其不在 BuffState 里）
    block.addEventListener('contextmenu', (e) => {
      e.preventDefault();
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

  /** 每秒左右调用一次（由 Game 经 callbacks 驱动）。
   *  原版行为（Main.cs:42618-42640）：遍历 buff 槽按序显示全部激活 buff；
   *  背包/华美 UI 打开时整栏不画；时长文字用 LocalizedDuration 缩写格式
   *  （zh-Hans "30秒"/"2分30秒"），仅剩 >2 tick 时显示 */
  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
    const buffs = this.game.player.buffs;
    const invOpen = this.invPanel.style.display === 'block';
    this.buffBar.style.display = invOpen ? 'none' : 'flex';
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
      ui.block.title = `${buffName(t)}：${buffDesc(t)}`;
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
      // 吸血鬼世界隐藏火系 buff 倒计时（Main.cs:42715 TryGetBuffTime：vampireSeed 且
      // buffType∈{24,23,32} 且 buffTime<10【tick】→ 不出文字——日光炽灼三连每帧 3t
      // 续期恒 <10t，图标上永不显示秒数）
      const vampHideTime = !!this.game.world.seedFlags?.vampireSeed
        && [24, 23, 32].includes(BUFF_DEFS[t].vanillaBuff) && left * 60 < 10;
      const s = Math.ceil(left);
      ui.time.textContent = vampHideTime ? '' : s >= 60
        ? (s % 60
          ? Lang.text('Mods.SandboxWorld.Time.MinSec', Math.floor(s / 60), s % 60)
          : Lang.text('Mods.SandboxWorld.Time.Minutes', Math.floor(s / 60)))
        : Lang.text('Mods.SandboxWorld.Time.Seconds', s);
    }
    for (const [t, ui] of this.buffBlocks) {
      if (!seen.has(t)) ui.block.style.display = 'none';
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
      u.block.title = nm ? `${nm}：${Lang.buffDesc(pb.buff) ?? ''}` : '';
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
      u.block.title = `${Lang.buffName(nb.vanillaBuff) ?? '星云'}：${Lang.buffDesc(nb.vanillaBuff) ?? ''}`;
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
    mkBtn(Lang.text('LegacyInterface.30'), () => this.chestDepositAll());    // 存入全部（仅箱内尚无的类型，跳钱币）
    mkBtn(Lang.text('LegacyInterface.31'), () => this.chestQuickStack());    // 快速堆叠（只堆箱内已有类型）
    this.chestPanel.appendChild(btns);
    this.root.appendChild(this.chestPanel);
  }

  /** Loot All（ChestUI.LootAll :282/389）：箱内全部入包，装不下的留在箱里 */
  private chestLootAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    for (let i = 0; i < chest.items.length; i++) {
      const cur = chest.items[i];
      if (!cur) continue;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) chest.items[i] = null;
      else cur.stack = left;
    }
    this.game.sfx.play('pickup');
    this.refreshAll();
  }

  /** Deposit All（ChestUI.DepositAll :531：背包→箱，仅放箱内尚不存在的类型；跳过钱币 71-74） */
  private chestDepositAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    for (let i = 0; i < 50; i++) { // 0-49 背包（钱币 50-53 不动）
      const cur = inv.slots[i];
      if (!cur || cur.favorited) continue;
      if (coinIndexOf(cur.id) >= 0) continue; // 钱币不存箱（Coin 槽 50-53 归属）
      if (chest.items.some((cs) => cs && cs.id === cur.id)) continue; // 箱内已有类型 → 跳过（走 QuickStack）
      const empty = chest.items.findIndex((cs) => !cs);
      if (empty < 0) break; // 箱满
      chest.items[empty] = cur;
      inv.slots[i] = null;
    }
    this.game.sfx.play('pickup');
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
    this.openInventory();
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
    let tex = 'Inventory_Back';
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
    slotEl.style.backgroundImage = `url(sprites/vanilla/${tex}.png)`;
    if (tint) slotEl.style.setProperty('--slot-tint', tint);
    else slotEl.style.removeProperty('--slot-tint');
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

  refreshHotbar() {
    if (!this.game) return;
    const inv = this.game.player.inv;
    // 原版布局（Main.cs:43017-43060）：x 从 20 起步进 ⌊52×scale⌋+4；
    // y = 20 + 22×(1-scale)（选中 20，未选中 25→CSS 视觉再随 scale 收缩）；
    // 未选中 alpha = 200×187/255 ≈ 147（Back20 半透明），选中 255（Back14）
    let x = 20;
    for (let i = 0; i < 10; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (!slotEl) continue;
      const sel = i === inv.selected;
      const scale = sel ? 1 : 0.75;
      this.paintSlot(slotEl, inv.slots[i]);
      slotEl.style.left = `${x}px`;
      slotEl.style.top = `${Math.trunc(20 + 22 * (1 - scale))}px`;
      slotEl.style.width = slotEl.style.height = '52px';
      slotEl.style.transform = `scale(${scale})`;
      slotEl.style.transformOrigin = 'top left';
      slotEl.style.opacity = sel ? '1' : '0.575';
      slotEl.style.backgroundImage = `url(sprites/vanilla/Inventory_Back${sel ? 14 : 20}.png)`;
      slotEl.style.boxShadow = ''; // 原版快捷栏不画收藏高亮（ItemSlot :1987 context!=13）
      if (!slotEl.querySelector('.sw-slot-num')) {
        const num = el('span', 'sw-slot-num', i === 9 ? '0' : String(i + 1));
        slotEl.appendChild(num);
      }
      x += Math.floor(52 * scale) + 4;
    }
    // 选中物品名（:43003-43009：居中 x=236、mouseTextColor 脉动；空手回退 inter[37]）。
    // 走 itemNameByKey 全链（vi_ key 前缀→官方 l10n→id-maps 兜底→place_v_ 方块名→
    // Mods 自有键→def.name）：vi_ def 的 vid 字段不落、name 恒 ''（items.ts 自动注册
    // 循环不写 vid），裸取 def.vid 会级联落空 → 恒显 inter(37)"物品"（退役批回归）
    const held = inv.slots[inv.selected];
    const name = held ? Lang.itemNameByKey(ITEM_DEFS[held.id]?.key ?? '') : null;
    this.hotbarNameEl.textContent = name || Lang.inter(37);
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
    // 收藏星标（原版 Inventory_Back10 金边贴图——ItemSlot :1966-1985 favorited 分支）
    const inHotbar = !!slotEl.closest('.sw-hotbar');
    if (!inHotbar) {
      slotEl.style.backgroundImage = content?.favorited ? 'url(sprites/vanilla/Inventory_Back10.png)' : '';
    }
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
    // 快捷栏最先刷（数字键/选槽视觉的最小闭环）——后续任一段抛错也不再吞掉
    // 快捷栏刷新（2026-08-18 用户报"数字键失效"：advisor 段异常曾把 rAF 回调
    // 整体炸掉，selected 已变而画面不动）
    this.refreshHotbar();
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
    // 堆叠至附近宝箱钮（Main.cs:41276 chest == -1 && npcShop == 0 门——开箱/商店
    // 不显示；ChestStack 4 帧 = 悬停位+模式位（:41311 num80 += mode*2 + hover），
    // 文案按当前模式进 title）
    if (this.quickStackBtn) {
      const frame = (this.game.quickStackMode() === 'smart' ? 2 : 0) + (this.qsHover ? 1 : 0);
      this.quickStackBtn.style.display = this.openChest ? 'none' : '';
      this.quickStackBtn.style.backgroundImage = `url(sprites/vanilla-ui/UI_ChestStack_${frame}.png)`;
      this.quickStackBtn.title = Lang.text(this.game.quickStackMode() === 'smart'
        ? 'GameUI.SmartStackToNearby' : 'GameUI.QuickStackToNearby');
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
    const defEl = this.invPanel.querySelector('[data-role="defense"]') as HTMLElement | null; // left 仍在 invPanel 内
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
      defEl.querySelector('span')!.textContent = String(p.defense);
    }
    const stationsEl = this.invPanel.querySelector('[data-role="stations"]') as HTMLElement;
    if (stationsEl) {
      const stName: Record<string, string> = { hand: Lang.text('Mods.SandboxWorld.UI.StationHand'), workbench: '🛠 ' + Lang.text('ItemName.WorkBench'), furnace: '🔥 ' + Lang.text('ItemName.Furnace'), anvil: '⚒ ' + Lang.text('ItemName.IronAnvil') };
      stationsEl.textContent = Lang.text('Mods.SandboxWorld.UI.CraftStations', [...stations].map((s) => stName[s] ?? s).join('、'));
    }
    // ★旧架构清场已删（innerHTML=''）：旧刷新链每步重建行,清场无害;池化后清场
    //  会把行池整体拔出 DOM 且池长恒 12 永不再挂回（2026-08-26 滚动重构排障实录）——
    //  行池的挂载/清理由 refreshVanillaCrafting 自己管理
    // 自制 RECIPES 表已随本地物品退役整体移除——合成列表只留原版配方段
    // （3309 条，Recipe.UpdateRecipeList 主干：环境+材料双门）
    this.refreshVanillaCrafting();
  }

  /** 合成列表选中配方（材料格数据源；★仅点击行设置——2026-08-25 用户定案：
   *  滚动只滚列表不换选中，材料格/详情不随滚动切换。-1=未选中（初始/搜索
   *  重置）→ 材料格空,不默认显示第一个配方(2026-08-25 用户定案) */
  private craftFocus = -1;
  /** 渲染窗滚动锚（滚轮/滚动条驱动；原与 craftFocus 同体——拆离后滚动不再
   *  改选中配方。窗起点 start=craftScroll-4，钳制/滑块几何同旧） */
  private craftScroll = 0;
  // ---- 平滑滚动态(2026-08-26 用户报"滚动卡卡+hover 高亮闪")----
  // 旧行为=滚轮每步重建窗口 12 行 DOM(元素在光标下销毁重建=闪)且每步 refreshAll
  // 全刷(=卡)。新:浮点动画锚 craftScrollF 缓动至 craftWheelTarget(可越界=回弹),
  // 行池 12 行复用、滚动帧只改 transform 不销毁元素;重建(搜索/库存变化)才重填内容。
  private craftScrollF = 0;             // 动画值(浮点行锚,可短暂越界画拉伸)
  private craftWheelTarget = 0;         // 滚轮/拖拽目标(浮点,越界=阻尼蓄能)
  private craftWheelIdle = 0;           // 最近滚轮时间戳(回弹起振门)
  private craftAnimRaf = 0;
  private craftAnimLast = 0;
  private craftPool: HTMLElement[] = [];
  private craftPoolIdx: number[] = [];  // 每池行当前配方 idx(-1 空,-2=强制重绘)
  private craftAvailRef: Array<{ r: import('../data/vanillaRecipes').VanillaRecipeLike; count: number }> = [];
  private static readonly CRAFT_ROW_H = 30;   // border-box: 22 贴图+3×2 padding+2 边框=30;240/30=8 行整除(半行裁切观感即消失)
  /** 悬停预览行（材料格显示源；-1=无）。★只动材料格不动渲染窗——
   *  窗口锚点恒用 craftScroll（滚轮/点击驱动），hover 不触发滚动 */
  private hoverFocus = -1;
  /** Modern 合成网格：搜索栏 + 焦点配方材料格（1.4.5 CraftingGrid 语义） */
  private craftSearchEl: HTMLInputElement | null = null;
  private craftGridEl: HTMLElement | null = null;
  /** 材料格已存（原版 vid → 数量；焦点配方切换/关面板时归还背包） */
  private craftGrid = new Map<number, number>();
  private craftGridRecipe: VanillaRecipeLike | null = null;
  /** 原版配方列表（数据驱动 1456 全量）。
   *  ★2026-08-26 平滑滚动重构（用户报"滚动卡卡+hover 高亮闪"）：旧行为=滚轮每步
   *  replaceChildren 重建窗 12 行 + refreshAll 全刷（元素在光标下销毁重建=闪、
   *  每步全量 UI 刷新=卡）。新=行池 12 行复用 + 浮点锚 rAF 缓动（craftWheelStep →
   *  craftAnimFrame → craftPaintWindow），滚动帧只改 transform 零销毁；池行
   *  mouseenter/mousedown 走 dataset.ri 读 craftAvailRef，行为语义（预览冻结门/
   *  选中仅点击/shift×10）全部保留。 */
  private refreshVanillaCrafting(): void {
    const game = this.game;
    if (!game || !this.craftListEl) return;
    let avail = game.vanillaAvailableRecipes();
    const q = this.craftSearchEl?.value.trim().toLowerCase() ?? '';
    if (q) {
      const filtered = avail.filter(({ r }) => {
        const k = vanillaItemKey(r.create);
        const name = k ? Lang.itemNameByKey(k) : '';
        return name.toLowerCase().includes(q);
      });
      if (filtered.length) avail = filtered;
    }
    // ★2026-08-27 用户要求：可合成（背包材料齐）排最前，未满足置灰垫底——
    // 稳定排序保持组内原版注册序；置灰行不可点击（见池行 mousedown 门）。
    // 原版口径备案：UpdateRecipeList 只列材料齐的配方（CollectedEnoughItemsToCraft
    // >0,未满足根本不显示）,顺序 = 注册序静态;本仓扩展显示未满足行故自行分组
    const metFlags = avail.map(({ r }) => {
      let met = r.items.length > 0;
      for (const req of r.items) {
        const k2 = ingredientKey(req.id);
        const have = k2 ? game.player.inv.countOf(game.itemId(k2)) : 0;
        if (have < req.stack) { met = false; break; }
      }
      return met;
    });
    avail = avail
      .map((e, i) => ({ e, met: metFlags[i] }))
      .sort((x, y) => Number(y.met) - Number(x.met))
      .map((x) => x.e);
    // 排序改变行→配方映射：清除滞留的 hover 高亮（.hov 深底留在重排后的行上
    // = 用户报"第一项配方盖着遮罩"——池行持久,重排后 .hov 残留在错位行上）
    this.craftHoverEl?.classList.remove('hov');
    this.craftHoverEl = null;
    this.craftHoverIdx = -1;
    // ★2026-08-27 用户要求：列表高度对齐右缘列底（曾恒 240px 底部死区→改视口限
    // 又溢出右缘列底 200px）——上限 = min(视口底-32, 右缘列底-8)，钳下限 240；
    // 池行数随高度增长。首帧布局未就绪（rect 0）时落 240 下限,后续刷新自校正
    const rectTop = this.craftListEl.getBoundingClientRect().top;
    const advBottom = this.advRailEl?.getBoundingClientRect().bottom ?? 0;
    const byViewport = window.innerHeight - 32 - rectTop;
    const byRail = advBottom > rectTop ? advBottom - 8 - rectTop : Infinity;
    const LIST_H = Math.max(240, Math.floor(Math.min(byViewport, byRail)));
    this.craftListH = LIST_H;
    const WIN = Math.max(12, Math.ceil(LIST_H / UI.CRAFT_ROW_H) + 4);   // 池行 = 可见 + 余量
    const maxAnchor = Math.max(0, avail.length - 1);
    if (this.craftScroll > maxAnchor) this.craftScroll = maxAnchor;   // 钳尾不回卷（ScrollCraftingList :582-589）
    if (!avail.length) {
      this.craftAvailRef = [];
      this.craftListEl.replaceChildren();
      this.craftPool = []; this.craftPoolIdx = [];
      this.craftListEl.style.height = '0px';   // 空列表收合（抖动源已改由细项盒恒高解决）
      if (this.craftTrackEl) this.craftTrackEl.style.display = 'none';
      return;
    }
    this.craftAvailRef = avail;
    this.craftScrollF = Math.max(0, Math.min(maxAnchor, this.craftScrollF));
    this.craftWheelTarget = Math.max(0, Math.min(maxAnchor, this.craftWheelTarget));
    // 行池初始化（容器每进游戏重建 → __swCraftWheel 随之失效重挂，同旧纪律）
    // ★池挂载校验：craftListEl 每次进游戏重建（面板重构）——仅判池长会让池行
    //  挂在上一局的旧元素上=列表空、滚动条照常显示（2026-08-26 用户报"偶发列表
    //  不渲染只渲染滚动条"）。池行必须真挂在当前列表元素下。
    if (this.craftPool.length !== WIN || this.craftPool[0]?.parentElement !== this.craftListEl) {
      const cl = this.craftListEl;
      cl.replaceChildren();
      cl.style.cssText = `height:${LIST_H}px; overflow:hidden; width:426px; position:relative;`;
      this.craftPool = []; this.craftPoolIdx = [];
      for (let k = 0; k < WIN; k++) {
        const row = el('div', 'sw-recipe');
        // ★初始化即 hidden（2026-08-27 用户报"第一行盖遮罩"）：池行一旦漏过 paint
        //  循环（WIN 竞态）就以 top:0+半透底叠在第一行上=遮罩。未 paint 前不可见
        row.style.cssText = `height:${UI.CRAFT_ROW_H}px; box-sizing:border-box; padding:3px 8px; margin:0; position:absolute; left:0; right:0; top:0; will-change:transform; visibility:hidden;`;
        row.addEventListener('mouseenter', () => {
          // 悬停预选三段语义保留（2026-08-21/24/25）：只动材料格不动窗、
          // mousemove 门 150ms、滚轮门 350ms——池行持久后 mouseenter 只在
          // 真实进出时派发，两门主要防重建派发的兜底语义不变
          if (performance.now() - this.craftMouseMoveLast > 150) return;
          if (performance.now() - this.craftWheelLast < 350) return;
          const idx = +(row.dataset.ri ?? -1);
          if (idx < 0) return;
          this.craftHoverIdx = idx;
          this.craftHoverEl?.classList.remove('hov');
          row.classList.add('hov');
          this.craftHoverEl = row;
          if (this.hoverFocus !== idx) { this.hoverFocus = idx; this.refreshAll(); }
        });
        row.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          const idx = +(row.dataset.ri ?? -1);
          const rec = this.craftAvailRef[idx];
          if (!rec) return;
          if (row.classList.contains('no')) return;   // ★置灰行（背包材料未齐,可经
          //   仓库合成）不可点击合成——原版语义:列表只列可合成项,置灰为本仓扩展
          this.craftFocus = idx;      // 选中配方——仅点击设置，滚动不改
          this.hoverFocus = -1;       // 点击行即焦点，预览态退场
          // 格料先归还背包再统一扣料——防"料在格里、背包不足"假失败（同旧）
          this.returnCraftGrid();
          game.vanillaCraft(rec.r, (ev as MouseEvent).shiftKey ? 10 : 1);
          this.refreshAll();
        });
        cl.appendChild(row);
        this.craftPool.push(row);
        this.craftPoolIdx.push(-2);   // -2=强制首绘
      }
      {
        const cl2 = cl as HTMLElement & { __swCraftWheel?: boolean };
        if (!cl2.__swCraftWheel) {
          cl2.__swCraftWheel = true;
          cl2.addEventListener('mousemove', () => { this.craftMouseMoveLast = performance.now(); });
          cl2.addEventListener('mouseenter', () => { this.craftMouseInList = true; });
          cl2.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.craftWheelStep(ev.deltaY, ev.deltaMode);
          }, { passive: false });
          // 移出列表清预览+高亮（容器级兜底防残留，同旧）
          cl2.addEventListener('mouseleave', () => {
            this.craftMouseInList = false;
            this.craftHoverIdx = -1;
            this.craftHoverEl?.classList.remove('hov');
            this.craftHoverEl = null;
            if (this.hoverFocus !== -1) { this.hoverFocus = -1; this.refreshAll(); }
          });
        }
      }
    } else {
      // avail 引用已换（材料计数/过滤可能变）→ 池行内容强制重绘
      for (let k = 0; k < WIN; k++) this.craftPoolIdx[k] = -2;
    }
    this.craftPaintWindow();
    // Modern 合成网格材料格（焦点配方）
    this.refreshCraftGrid(avail);
  }

  /** 池行窗口绘制（rAF 动画帧/重建共用）：浮点锚 → 容器小数段位移 + 行按需换绑
   *  （仅进出窗的行重建内容，窗内行零 DOM 变更=hover 稳定）+ thumb 跟动画值 */
  private craftPaintWindow(): void {
    const avail = this.craftAvailRef;
    const game = this.game;
    const len = avail.length;
    const cl = this.craftListEl;
    if (!len || !cl || !game) return;
    const H = UI.CRAFT_ROW_H;
    // 高度/窗行随 craftListH（refreshVanillaCrafting 每刷回写）——曾恒 240/7/12
    const VIS_ROWS = Math.max(1, Math.floor(this.craftListH / H));
    const WIN = VIS_ROWS + 4;
    const anchor = this.craftScrollF;
    // ★窗顶钳制（2026-08-26 用户报"列表前面多一大块空"）：旧实现 start≥0 钳位,
    //  浮点版漏了——顶部锚 0 时 topF=-4 → 首行画在 120px 下。基准钳 [0,len-VIS],
    //  过冲(回弹)量单独 ×0.6 加成 = 端部拉伸视觉保留
    const maxAnchor = Math.max(0, len - 1);
    const viewH = Math.min(this.craftListH, len * H);
    // ★无条件写高度（2026-08-27 用户报"打开时留空,hover/滚动才逐步坍缩"）：首次
    //  刷新在 display:none→block 布局未稳时采样,LIST_H 偏大且 craftLastViewH 残留
    //  旧值相等时跳写 = 错误高度滞留到滚动/悬停才被 paint 修正
    cl.style.height = `${viewH}px`;
    this.craftLastViewH = viewH;
    const maxTop = Math.max(0, len - Math.ceil(viewH / H));   // 末页填满视口,无底部留白
    const clampedAnchor = Math.max(0, Math.min(maxAnchor, anchor));
    const topF = Math.max(0, Math.min(maxTop, clampedAnchor - (VIS_ROWS >> 1)))
      + (anchor - clampedAnchor) * 0.6;
    const start = Math.floor(topF);
    // ★容器自身不做 transform——位移全部由行位 (idx-topF)*H 承载。曾在容器上
    //  叠 translateY(-frac*H)：整框(含裁剪框)上移=顶行越界盖搜索框+底部留白
    //  （2026-08-26 用户实报）。overflow:hidden 只裁自己的 padding box,框一动
    //  裁剪窗跟着动,小数段位移必须落在绝对定位的行上。
    for (let k = 0; k < WIN; k++) {
      const row = this.craftPool[k];
      if (!row) continue;
      const idx = start + k;
      if (idx < 0 || idx >= len) {
        if (this.craftPoolIdx[k] !== -1) { row.style.visibility = 'hidden'; this.craftPoolIdx[k] = -1; }
        continue;
      }
      if (this.craftPoolIdx[k] !== idx) {
        // 换绑（进出窗才发生）：内容重建 + 高亮归属交接
        if (this.craftHoverEl === row) { this.craftHoverEl = null; }
        row.classList.remove('hov');
        row.style.visibility = '';
        row.dataset.ri = String(idx);
        const { r, count } = avail[idx];
        const outKey = vanillaItemKey(r.create);
        row.replaceChildren();
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(game, game.itemId(outKey ?? ''));
        row.appendChild(img);
        const label = el('span', '', `${outKey ? Lang.itemNameByKey(outKey) : '?'}${r.createStack > 1 ? ` ×${r.createStack}` : ''} ×${count}`);
        row.appendChild(label);
        const mats = el('span', '', r.items.map((req) => {
          const k2 = ingredientKey(req.id);
          if (!k2) return ` ? ${req.stack}`;
          const have = game.player.inv.countOf(game.itemId(k2));
          return ` ${Lang.itemNameByKey(k2)} ${Math.min(have, req.stack)}/${req.stack}`;
        }).join(' ·'));
        mats.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right;';
        row.appendChild(mats);
        // 材料未满足 = 置灰（.sw-recipe.no opacity .4；2026-08-27 用户报"样式从未
        // 套上"）。判据与材料文本同源 = 背包可见持有（craftableCount 计银行/仓库
        // 源,材料文本只显示背包——0/1 行用户读作未满足）
        let met = r.items.length > 0;
        for (const req of r.items) {
          const k2 = ingredientKey(req.id);
          const have = k2 ? game.player.inv.countOf(game.itemId(k2)) : 0;
          if (have < req.stack) { met = false; break; }
        }
        row.classList.toggle('no', !met);
        this.craftPoolIdx[k] = idx;
      }
      row.style.transform = `translateY(${((idx - topF) * H).toFixed(2)}px)`;
    }
    // WIN 收缩后的池尾行兜底隐藏（漏网行=top:0 空行叠第一行的遮罩根源）
    for (let k = WIN; k < this.craftPool.length; k++) {
      const row = this.craftPool[k];
      if (row) { row.style.visibility = 'hidden'; row.style.transform = 'translateY(0px)'; }
    }
    // 高度贴内容（min(240, len*H)）：恒 240 会让短列表下方出现大死区（2026-08-26
    //  用户复报"滚动困难不顺滑"后回滚）——抖动源既已由细项盒恒高消除,此处回归自适应
    // 滚动条几何：thumb 高=填充行占比、top 跟【动画值】（拖拽顺滑）。
    // ★可见判据 = maxTop>0（内容超出视口才可滚）——曾用 min(VIS, len) 当分母:
    //  8-11 行的短列表显示滚动条但 maxTop=0 → thumb 能拖、行永不动+底部留白
    //  （2026-08-26 用户实报"滚动条动列表不动"）。拖拽域 = [0, maxTop] 同源。
    const meta = this.craftScrollMeta;
    meta.len = len;
    meta.visRows = Math.ceil(this.craftListH / H);            // 填充行数（拖拽域 = len-visRows）
    const maxStart = Math.max(1, maxTop);
    const trk = this.craftTrackEl, thb = this.craftThumbEl;
    if (trk && thb) {
      // ★先读后写（clientHeight 读强制同步排版——滚动帧每帧写 display/height
      //  后再读 = 每帧布局抖动；display 仅变化时写 + 高度先缓存读）
      if (maxTop <= 0) {
        if (trk.style.display !== 'none') trk.style.display = 'none';
      } else {
        if (trk.style.display !== '') trk.style.display = '';
        const Ht = Math.max(1, trk.clientHeight);
        const thumbH = Math.max(24, (meta.visRows / meta.len) * Ht);
        const anchorC = Math.max(0, Math.min(maxStart, anchor - (VIS_ROWS >> 1)));
        thb.style.height = `${thumbH}px`;
        thb.style.top = `${(anchorC / maxStart) * (Ht - thumbH)}px`;
      }
    }
    // 重建/滚动后补回悬停高亮：悬停配方仍在窗内 → 池行立即带 .hov（预选不补）
    if (this.craftMouseInList && this.craftHoverIdx >= start && this.craftHoverIdx < start + WIN) {
      const k = this.craftHoverIdx - start;
      const row = this.craftPool[k];
      if (row && this.craftPoolIdx[k] === this.craftHoverIdx && this.craftHoverEl !== row) {
        this.craftHoverEl?.classList.remove('hov');
        row.classList.add('hov');
        this.craftHoverEl = row;
      }
    }
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
    card.onclick = kill; // 原版点击开成就页并移除;成就页 UI 未接,先关闭(GAP)
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
    this.invPanel.classList.remove('sw-loadout-flash');
    void this.invPanel.offsetWidth;
    this.invPanel.classList.add('sw-loadout-flash');
    setTimeout(() => this.invPanel.classList.remove('sw-loadout-flash'), 600);
  }

  showNpcDialog(name: string, chat: string, buttons: Array<{ id: NpcButtonId; label: string }>, portrait?: string | null, vanillaId?: number): void {
    if (!this.npcDialog) {
      this.npcDialog = new NpcDialog(this.root, (id) => {
        this.npcShop?.close();
        this.npcShop = null;
        this.game?.npcDialogButton(id);
      });
    }
    this.npcDialog.open(name, chat, buttons, portrait, vanillaId);
  }

  closeNpcDialog(): void {
    this.npcDialog?.close();
    this.npcShop?.close();
    this.npcShop = null;
    this.npcHappiness?.close();   // 心情浮层随对话框一并关闭
  }

  showNpcShop(title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number; medal?: number; buyback?: number }>, copper: number, happinessPct?: number, medals?: number): void {
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
