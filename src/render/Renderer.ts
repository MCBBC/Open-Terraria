// 主渲染器：天空 → chunk → 液体 → 实体 → 粒子/飘字 → 光照合成 → 小地图
import { glStatFrame, maybeInstallGpuLoggerFromUrl, noteContextLost, onStarveTransition, starvedEver, starvedLock } from '../render/GLStats';
import { upgradeToBitmap, loadBitmapOnly } from '../assets/SpriteAtlas';
import { findBannerAnchorY } from '../world/Housing';
import { TILE, CHUNK } from '../core/constants';
import { TintAtlas, type TintRect } from './TintAtlas';
import { tintedTex } from './StringLine';
import { NPC_GRIDS } from '../remaster/NpcGridLayouts';

/** ★「落脚贴合」开关(2026-08-30 用户拍板):人形/常规族贴图按首帧扫描上移,
 *  鞋底与碰撞盒底线对齐。刻意偏离反编译中心锚定数学——parity 对账跑批前
 *  必须 localStorage.sw_npc_foot_flush='0' 关闭(见 Renderer.npcFootFlushOn) */
export function npcFootFlushOn(): boolean {
  return footCfg.flushOn;
}
/** 全局微调旋钮(px,**正 = 整体向地面下沉**)。缺省 **+1** = 用户实玩定档(2026-08-30,
 *  浮点补偿基线上再提 1px 消除末位可见下沉)。控制台改键后 npcFootCfgReload() 重读 */
function npcFootBiasExtra(): number {
  return footCfg.extra;
}
/** 逐型人工覆写(sw_npc_foot_bias_over = {"46":-2,...}):正=下移。 */
function npcFootBiasOverride(id: number): number {
  return footCfg.overrides[id] ?? 0;
}
function npcFootBiasY(id: number | undefined): number {
  if (!npcFootFlushOn() || id === undefined) return 0;
  return npcFootBiasExtra() + npcFootBiasOverride(id);
}
/** 配置快照:模块加载时读一次 localStorage,运行时零 IO;
 *  控制台改键后调 npcFootCfgReload()(挂 window)重读快照 */
function footCfgReadNum(storageKey: string, def: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null || raw.trim() === '') return def;
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  } catch { return def; }
}
const footCfg = (() => {
  const cfg = { flushOn: true, extra: -1 as number, overrides: {} as Record<number, number> };
  try {
    cfg.flushOn = localStorage.getItem('sw_npc_foot_flush') !== '0';
    cfg.extra = footCfgReadNum('sw_npc_foot_flush_extra', +1);

    const ov = JSON.parse(localStorage.getItem('sw_npc_foot_bias_over') || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(ov)) if (Number.isFinite(v)) cfg.overrides[+k] = v as number;
  } catch { /* 私隐模式等异常保默认 */ }
  // ★2026-08-30 补卫:node 测试环境无 window(此前裸赋值把 vitest 全套件炸成
  //   ReferenceError,slime-gun 等既有用例全红)——浏览器侧 reload 挂载语义不变
  if (typeof window !== 'undefined') {
    (window as unknown as { npcFootCfgReload?: () => void }).npcFootCfgReload = () => {
      cfg.flushOn = localStorage.getItem('sw_npc_foot_flush') !== '0';
    cfg.extra = footCfgReadNum('sw_npc_foot_flush_extra', +1);

      const ov = JSON.parse(localStorage.getItem('sw_npc_foot_bias_over') || '{}') as Record<string, unknown>;
      for (const [k, v] of Object.entries(ov)) if (Number.isFinite(v)) cfg.overrides[+k] = v as number;
    };
  }
  return cfg;
})();
/** ★v6 内禀「落脚贴合」:按实际切片扫描内容底行(fMax),返回使其贴住盒底的
 *  额外位移(世界 px)。扫描结果按位图身份+切片键缓存,首帧一次性开销。 */
const FOOT_ROW_CACHE = new Map<string, number>();
const BMAP_UIDS = new WeakMap<object, string>();
let BMP_UID_SEQ = 0;
function bmpUidOf(src: unknown): string {
  let u = BMAP_UIDS.get(src as object);
  if (!u) { u = 'b' + (++BMP_UID_SEQ); BMAP_UIDS.set(src as object, u); }
  return u;
}
function npcContentBottomRow(img: CanvasImageSource, sy: number, sw: number, sh: number): number {
  // ★2026-09-02 node 补卫:测试环境无 DOM,裸 instanceof HTMLImageElement 会
  //   ReferenceError(曾炸 drawEnemy 全部渲染单测 9 例)——逐型 typeof 门后再判;
  //   浏览器语义不变:非 Image/Canvas/ImageBitmap 一律 −1 早退(与原判等价)
  if (!(typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement)
    && !(typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement)
    && !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) return -1;
  const key = `${bmpUidOf(img)}|${sy}|${sw}|${sh}`;
  const hit = FOOT_ROW_CACHE.get(key);
  if (hit !== undefined) return hit;
  let out = -1;
  try {
    const oc = document.createElement('canvas');
    oc.width = Math.max(1, sw); oc.height = Math.max(1, sh);
    const c2 = oc.getContext('2d', { willReadFrequently: true })!;
    c2.drawImage(img as CanvasImageSource, 0, sy, sw, sh, 0, 0, sw, sh);
    const d = c2.getImageData(0, 0, sw, sh).data;
    for (let y = sh - 1; y >= 0; y--) {
      let n = 0;
      for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 90) n++;   // 实心阈值:排除边缘 AA 半透明尾行
      if (n > 0) { out = y; break; }
    }
  } catch { out = -1; }
  FOOT_ROW_CACHE.set(key, out);
  return out;
}
/** 落脚豁免:独占绘制路径自带锚点(它们根本不走通用尾段,防御性登记) */
const FOOT_FLUSH_EXEMPT = new Set<number>([393, 416,   // 416 骑手原点=掠兽 Bottom(B路R3备案)
  583, 584, 585]);   // 仙灵悬浮族:原版帧中心锚(Main.cs:23400 无 num46/47 条目),
                     // "内容底贴盒底"对飞行体无意义,+2px 沉降=倒挂观感(2026-09-02 遗留批 D9)
function npcFootBiasExempt(id: number): boolean {
  return FOOT_FLUSH_EXEMPT.has(id);
}
import type { Camera } from './Camera';
import { SkyRenderer, clearAmbientTintCache } from './SkyRenderer';
import { ChunkCache } from './ChunkCache';
import type { World, Clock } from '../world/World';
import { TileStore } from '../world/TileStore';
import type { AssetBundle } from '../assets/AssetGen';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { DrawRect } from '../assets/SpriteAtlas';
import { atlasIconForKey, sliceItemAnimFrame } from '../assets/SpriteAtlas';
import { TOOL_CUTTER } from '../world/Wiring';
import { compositePaperDoll, dollFrame, dollFrameRows, dollHairLayer, hairFrameTinted, headArmorImage, eyelidFrame, tintRGBA, HIDES_HEAD, FRAME_W, FRAME_H, clearPaperDollCache, petArmParams } from '../player/PaperDoll';
import { MALE_VARIANTS } from '../player/Appearance';
import type { Appearance } from '../player/Appearance';
import { meleeThirdOf } from '../player/SwingPathMath';
import { hairDyeColor } from '../player/HairDyeColor';
import type { Inventory } from '../items/Inventory';
import { options } from '../core/Options';
import { VanillaResourceBars } from './ResourceBars';
import { FancyResourceBars } from './FancyResourceBars';
import { VanillaBreathMeter } from './BreathMeter';
import { MonolithFilters, emptyMonolithScene, visualScanRect, scanMonolithScene, type MonolithSceneState } from './MonolithFilters';
import { GLScreenFilters, type ScreenFxPass } from './GLScreenFilters';
import type { FlickerClock } from '../lighting/SkyColor';
import { colorOfTheSkies, setFrameHorizon, setFrameCloudDim, setFrameLightning, setFrameBiome, setFrameAurora, setFrameAtmo } from '../lighting/SkyColor';
import { showJourneyQuickGate } from '../ui/QuickGate';
import { SMART_CURSOR_DIRECTION_LOCKS, sheetOf } from '../player/SmartCursor';
import { mobileUiScale, hudTier } from '../ui/MobileControls';
import { TEAM_COLORS } from '../stats/Pvp';

/** 鼠标目标格（智能光标激活时 smart=true 并附方向锁 arrow） */
export interface HoverTarget {
  x: number; y: number;
  smart?: boolean;
  arrow?: { x: number; y: number } | null;
}

/** SetMatch body→legs 长袍腿替表（Player.cs:36761-36856 ArmorSlotRequested==1 全 switch
 *  提取）：身甲自带裙摆时腿贴图整体换裙（PlayerFrame :35334-35341 消费——wearsRobe 族）。
 *  81 例外：仅当无腿甲（Legs==-1||0）才换 169；165/166/167/183 随性别分档 */
function setMatchBodyToLegs(body: number, legs: number, male: boolean): number {
  switch (body) {
    case 15: return 88; case 36: return 89; case 41: return 97; case 42: return 90;
    case 58: return 91; case 59: return 92; case 60: return 93; case 61: return 94;
    case 62: return 95; case 63: return 96; case 77: return 121;
    case 165: return male ? 118 : 99;
    case 166: return male ? 119 : 100;
    case 167: return male ? 101 : 102;
    case 180: return 115; case 181: return 116;
    case 183: return male ? 136 : 123;
    case 191: return 131;
    case 93: return 165; case 90: return 166; case 88: return 168;
    case 81: return (legs <= 0) ? 169 : -1;
    case 213: return 187; case 215: return 189; case 219: return 196; case 221: return 199;
    case 223: return 204; case 231: return 214; case 232: return 215; case 233: return 216;
    case 241: return 229; case 256: return 244;
    default: return -1;
  }
}

/** SetMatch legs 槽性别换装表（Player.cs:36858-36974 ArmorSlotRequested==2 全 switch
 *  提取）：同一件腿甲男女贴图档不同（女 146→147 等）；-1 = 不替换 */
function setMatchLegs(legs: number, male: boolean): number {
  switch (legs) {
    case 83: return male ? 117 : -1;
    case 84: return male ? 120 : -1;
    case 132: return male ? 135 : -1;
    case 57: return male ? 137 : -1;
    case 180: return !male ? 179 : -1;
    case 184: return !male ? 183 : -1;
    case 146: return male ? 146 : 147;
    case 154: return male ? 155 : 154;
    case 158: return male ? 157 : -1;
    case 191: return !male ? 192 : -1;
    case 193: return !male ? 194 : -1;
    case 197: return !male ? 198 : -1;
    case 203: return !male ? 202 : -1;
    case 208: return !male ? 207 : -1;
    case 219: return !male ? 220 : -1;
    case 232: return !male ? 233 : -1;
    case 236: return !male ? 248 : -1;
    case 249: return !male ? 250 : -1;
    default: return -1;
  }
}

/** 装备 → 纸娃娃渲染参数。贴图索引 = item.head/body/legs 槽位序号（原版语义，
 *  非物品 id——铁甲三件的槽位序号都是 2）；部位/贴图序号走 vanilla-itemstats
 *  （s + hs/bs/ls,2026-08-14 起接管——此前只认 def.armor → vi_ 盔甲/面具全不渲染,
 *  "时装头不显示"根因;2026-09-02 def.armor 死字段及其 legacy 兜底分支整体移除）。
 *  app 传入时跑 SetMatch 三查（PlayerFrame :35336-35374：①身甲裙腿替 ②腿甲性别
 *  换装 ③头 201 女换 202——armor[10-12] 时装覆盖优先已由 displayArmor 处理 ✓） */
function dollEquipFromInv(inv: Inventory, app?: import('../player/Appearance').Appearance | null, onVelociraptor = false): { head: number | null; body: number | null; legs: number | null } {
  const idx = (itemId: number | null | undefined, slot: 0 | 1 | 2): number | null => {
    if (itemId == null) return null;
    const def = ITEM_DEFS[itemId];
    if (!def) return null;
    // vi_ 装备：stats 表部位 + 贴图序号（hs/bs/ls = 原版 headSlot/bodySlot/legSlot）
    const st = statOfInternal(itemId);
    if (st?.s) {
      const part = st.s === 'h' ? 0 : st.s === 'b' ? 1 : 2;
      if (part !== slot) return null;
      const tex = part === 0 ? st.hs : part === 1 ? st.bs : st.ls;
      return tex ?? null;
    }
    // ★legacy/place_ 物品的 def.armor + vanilla.json armorIndex 兜底分支已移除
    //  （2026-09-02 死代码清理：ItemDef.armor 全仓零写入,该分支自 2026-08-14 起
    //  对所有物品恒在首行 return null——vi_ 走上方 itemstats 路径,armorIndex
    //  数据键仍保留在 vanilla.json）
    return null;
  };
  const disp = inv.displayArmor();
  let head = idx(disp[0], 0), body = idx(disp[1], 1), legs = idx(disp[2], 2);
  if (app) {
    const male = MALE_VARIANTS.includes(app.skinVariant);
    // ① body→legs 长袍腿替（:35334-35341——request.Legs 取换装前原值）
    const robe = setMatchBodyToLegs(body ?? 0, legs ?? 0, male);
    if (robe >= 0) legs = robe;
    // ② legs 槽性别换装（:35342-35349）
    const swap = setMatchLegs(legs ?? 0, male);
    if (swap >= 0) legs = swap;
    // ③ head 201（狐狸套头）女换 202（:36755-36759；迅猛龙坐骑 54 上强制 201）
    if (head === 201) head = male || onVelociraptor ? 201 : 202;
  }
  return { head, body, legs };
}
import { WeatherRenderer } from './WeatherRenderer';
import { drawVanillaLiquids, drawLiquidBehindTilesOnly, clearWaterWarpDebug } from './VanillaLiquidRenderer';
import { waterWaves, ensureWaveTextures, injectEntity, waveTexReady, type WaveEntitySample } from './WaterWaves';
import { WaterWarpCompositor, type WaterWarpFrameState } from './WaterWarpCompositor';
import { renderEnv, DRAW_Y_OFFSET, drawVanillaCell, tileTopOf } from './VanillaTiler';
import { isDynamicAnimSheet, campfireYOffset, fountainYOffset } from './TileAnim';
import { frameMergesWith } from './TileMergeFamily';
import { wallAnimRate } from './VanillaWallTiler';
import { drawTileFlames, drawHeldItemFlame, FLAME_ITEMS, currentTileFrameSeed, randomInt, clearTileFlamesCache } from './TileFlames';
import { drawWindSwayTiles, litNatureVisibility } from './WindSway';
import { natureParticles } from './NatureParticles';
import { WaterfallRenderer } from './WaterfallRenderer';
import { CaptureInterface } from './CaptureMode';
import { BiomeBackground, type BGBlit } from './BiomeBackground';
import { GLSpriteLayer } from './GLSpriteLayer';
import { drawMartianProbeBeams, drawCoriteTrail, drawDreadnautilusFlash,
  drawDreadnautilusOverlay, drawDD2SkeletonCrown, drawBetsyWings,
  drawLibrarianSkeleton, drawDukeAfterimages, draw522Overlay } from './npcExtraParts';
import { GLWorldLight } from './GLWorldLight';
import { mapUpdateMinIntervalMs, gfxQuality } from '../core/GfxQuality';

/** 背景层 GL 后端(docs/webgl2-migration-plan.md #1):图片→纹理缓存,quad 绘制。
 *  ★smooth 恒 false:主循环 :1623 等处关闭的 imageSmoothingEnabled 跨帧残留,
 *  2D 背景层实际一直按最近邻缩放渲染(对拍实测)——GL 与既有视觉 1:1 */
// ★纹理键用 WeakMap 实例自增 id:ImageBitmap 无 .src,曾退化为"宽x高"——
// 森林 t0/t2 同为 1024×699 两层共用一张纹理 = 满屏 Background_50 平面色
// (对拍实锤;同款旧坑见 PaperDoll/UISpriteBatch 的 .src 键改造)
const BG_TEX_ID = new WeakMap<object, number>();
let bgTexIdNext = 0;
class GLBgBlit implements BGBlit {
  constructor(private gl: GLSpriteLayer) {}
  img(im: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    opts?: { alpha?: number; tint?: readonly [number, number, number] | null }): void {
    let id = BG_TEX_ID.get(im);
    if (id === undefined) { id = ++bgTexIdNext; BG_TEX_ID.set(im, id); }
    const e = this.gl.texFromImage(`bg:${id}`, im as TexImageSource);
    if (!e) return;
    this.gl.quad(e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  }
  fill(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 1): void {
    this.gl.fillQuad(x, y, w, h, r, g, b, a);
  }
}
import type { SceneFlags } from '../world/SceneMetrics';
import { TILE_DEFS, WALL_DEFS, TILE_BY_KEY } from '../data/tiles';
import { TOWN_HOLDOUT, ITEM_POS_NUM, TOWN_ATTACK_TYPE, TOWN_ATTACK_TIME, TOWN_SWING, TOWN_MAGIC_AURA_COLOR, townSwingStats } from '../data/vanillaTownAttack';
import { viIdFromKey, itemCombat } from '../data/vanillaItemCombat';
import { VANILLA_IS_FOOD, type FurnitureKind } from '../world/FurnitureItems';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { drawEmotes } from './EmoteBubble';
import { mechQueenUp, getMechQueenCenter } from '../entities/mechQueen';
import { combatFontReady, drawCombatText } from './CombatTextFont';
import { InfoAccsLayer } from './InfoAccsLayer';
import { buildInfoAccRows, type InfoAccCtx } from '../stats/InfoAccs';

/** 原版 holdStyle!=0 物品集（Item.cs SetDefaults holdStyle=1 实证 + TEdit 实名核对）：
 *  火把族（8/彩色 427-433/群系 523..5353）+ 荧光棒族 ItemID.Sets.Glowsticks(282,286,3112,3002,4776,5643)。
 *  PlayerDrawLayers.cs:3857：holdStyle!=0 → 静持也渲染（手臂抬起） */
const HOLD_STYLE_ITEMS = new Set([
  8, 427, 428, 429, 430, 431, 432, 433, 523, 974, 1245, 1333, 2274, 3004, 3045, 3114,
  4383, 4384, 4385, 4386, 4387, 4388, 5293, 5353,
  282, 286, 3112, 3002, 4776, 5643,
]);

/** 原版 noWet=true 物品集（Item.cs 逐 case 字面 `noWet = true` 63 件 + DefaultToTorch
 *  无 allowWaterPlacement 族 7 件（4383,4385-4388,5293,5353；:48086 `noWet = !allowWater`
 *  ——4384 水可放火把 allowWater=true → noWet=false 排除）。★523/1333/4384 手写火把块
 *  【无 noWet】是**有意为之**——三件 = ItemID.Sets.WaterTorches（ItemID.cs:1194），
 *  水下火把：渲染不熄（本表不在集）+ 手持光不熄（Game 侧 WATER_TORCH_ITEMS）；
 *  4952 信号枪/3823 骨焰火苗武器 holdStyle≠火把语义不涉。
 *  持位渲染门 = `(!wet || !noWet)`（Player.cs:36026/:36030）——**逐件判定**，
 *  芦苇呼吸管 186（holdStyle 2 无 noWet）水下照常显示（此前全局 !inWater 门
 *  误伤：火把的熄灭语义被扩到所有手持物，呼吸管在水下反而隐身——它的主场景） */
const NO_WET_ITEMS = new Set([
  8, 105, 427, 428, 429, 430, 431, 432, 433, 583, 584, 585, 713, 856, 974, 1245,
  1405, 1406, 1407, 2054, 2144, 2191, 3004, 3045, 3114, 3117, 3173, 3890, 3936,
  3962, 4150, 4171, 4192, 4213, 4303, 4383, 4385, 4386, 4387, 4388, 4485, 4571,
  5153, 5174, 5195, 5293, 5322, 5353, 5553, 5606, 5694, 5717, 5743, 5760, 5781,
  5802, 5823, 5844, 5862, 5883, 5902, 5936, 5959, 5979, 6002, 6025, 6048, 6071,
  6094, 6115,
]);

/** useStyle 5 的"法杖持位"物品（Main.cs:6695-6740 Item.staff=true 全 34 件）：
 *  ApplyUseStyle 5 的 staff 分支（Player.cs:50374）把 itemLocation 钉在
 *  MountedCenter + 瞄准向量×6（贴图斜持指向鼠标），与默认持位不同 */
const STAFF_ITEMS = new Set([
  683, 723, 726, 739, 740, 741, 742, 743, 744, 788, 1296, 1308, 1326, 1444, 1445,
  1446, 1801, 1930, 1931, 2188, 2750, 3006, 3051, 3209, 3210, 3377, 3476, 3569,
  3571, 3787, 3852, 3870, 4062, 5065,
  // ★1457 五杖（Main.cs:6930 staff 旗 diff 2026-08-24——缺=落枪弓持物支,法杖指向
  //  不随瞄准镜像,用户实报太阳花法杖"指向后面"）
  6152, 6153, 6154, 6155, 6173,
]);

/** ★投射物绘制分层（2026-09-02 用户实报"垂直向上发射火箭,弹体+尾焰叠在武器
 *  贴图上"定罪重写）。原版投射物默认层 = DrawProjectiles（Main.cs:63199,只画
 *  drawLayer==0,:22405）画在 DrawPlayers_AfterProjectiles（:63204）【之前】
 *  = 弹在玩家/武器【下层】——1405(:42720→:42722)/1456(:56481→:56482)/1457
 *  三代基准全一致。本仓 2026-08-25 冰川之牙批曾注"原版 DrawProjectiles 在
 *  DrawPlayers 之后、弹在玩家之上"系行号误引（:63204 实为
 *  DrawPlayers_AfterProjectiles 本体）。
 *  分层字段 = Projectile.drawLayer（Projectile.cs:422;SetDefaults :757 归零;
 *  CacheProjDraws Main.cs:38822 switch 1-6 分档）：
 *    4 → DrawCacheProjsOverPlayers（:63205,玩家层组【之后】）= 冰川之牙 1115
 *        等 4 型——2026-08-25 用户实报的蓄力冰矛压角色即此族的个别待遇;
 *    7/8 → PlayerDrawLayers.cs:3154/:3891 在玩家绘制管线内持弹位插入
 *          （DrawHeldProj :4325）= 身体【前】——DefaultToSpear/Whip/Flail/
 *          Yoyo/DrillOrChainsaw/Shortsword（Projectile.cs:10706-10787）与静态
 *          7/8 表全走此档（近战持弹族从不出现在玩家身后）;
 *    5 → OverWiresUI（:63263,导线之上）。
 *  本仓无"玩家管线内持弹位"通用通道（仅 190 食人鱼账本/633 棱镜队列专用）→
 *  4/5/7/8 族统一留在既有"玩家后"冲刷（对 7/8 族=身体前的既有观感零回归）,
 *  0 层族（火箭/箭/法弹/召唤/敌弹等大多数）改画玩家【前】冲刷=原版层序。
 *  表值 = 1457 SetDefaults 全量提取（DefaultTo* 调用点 :10711-:10787 +
 *  静态赋值点逐行归型）。 */
const PROJ_DRAW_OVER_PLAYERS = new Set<number>([
  // drawLayer=4（OverPlayers,Main.cs:38834）:
  759, 1106, 1115, 1116,
  // drawLayer=5（OverWiresUI）:
  651,
  // drawLayer=7/8 静态（PlayerDrawLayers.cs:3154/:3891 持弹位;AI_DisplayDoll
  //   的动态 7 系模特展示弹,本仓未实装=不收）:
  439, 445, 460, 535, 536, 591, 595, 600, 611, 615, 630, 633,
  697, 699, 705, 707, 708, 714, 735, 927, 1040,
  // DefaultToSpear（:10722）:
  46, 47, 49, 64, 66, 97, 105, 130, 153, 212, 215, 218, 222, 342, 367, 368,
  730, 877, 878, 879, 1103,
  // DefaultToDrillOrChainsaw（:10734）:
  57, 58, 59, 60, 61, 62, 107, 213, 214, 216, 217, 219, 220, 223, 224, 252,
  369, 427, 428, 429, 430, 431, 432, 509, 609, 610,
  // DefaultToFlail（:10755）:
  25, 26, 35, 63, 154, 247, 757, 947, 948, 1058,
  // DefaultToYoyo（:10766）:
  534, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554,
  555, 562, 563, 564, 999,
  // DefaultToShortsword（:10775）:
  802, 842, 938, 939, 940, 941, 942, 943, 944, 945, 1127,
  // DefaultToWhip（:10706;ProjectileID.Sets.IsAWhip 18 枚,ID/ProjectileID.cs:35）:
  841, 847, 848, 849, 912, 913, 914, 915, 952, 1028, 1029, 1030, 1031, 1032,
  1033, 1034, 1035, 1104,
]);

/** Main.DrawPlayerItemPos（Main.cs:3305-3663）1:1：useStyle 5 非法杖（枪/弓）握把。
 *  值 = [num（origin.X = -num），dy（result.Y = H/2 + dy）]；缺省 [10, 0]。
 *  外层 switch 在前（95..1835）；default 内层 switch 只对未命中外层的 id 生效
 *  （内层 case 2626 num=-4 为不可达反编译残留，2624 以外层 num=4 为准） */
const ITEM_DRAW_POS_DEF: readonly [number, number] = [10, 0];
const ITEM_DRAW_POS: Record<number, readonly [number, number]> = {
  95: [6, 2], 5629: [4, -2], 1295: [4, 0], 5464: [2, 0], 3611: [2, 0], 5495: [-2, 0],
  3350: [2, 0], 2624: [4, 0], 3018: [2, 0], 3007: [4, -1], 3107: [4, 2], 3008: [-7, 2],
  1255: [6, 0], 2269: [2, 2], 1265: [-8, 4], 2272: [0, 4], 3029: [4, 0], 4381: [4, 0],
  2796: [-28, 2], 2797: [0, 0], 2610: [0, 0], 2623: [-30, -4], 3546: [-14, -6], 1835: [-2, 2],
  3859: [-2, 0], 2888: [6, 0], 2223: [2, -2], 1782: [0, 4], 1929: [0, 2], 2270: [-4, 0],
  1784: [0, 4], 1000: [6, 0], 1178: [4, 0], 1319: [0, 0], 1297: [-8, 0], 1121: [6, -2],
  1314: [2, 0], 1258: [2, -2], 1155: [-10, -2], 1156: [-2, 0], 4703: [-3, -2], 5117: [-1, 0],
  96: [-8, 2], 1870: [-8, 2], 1260: [-8, 2], 1254: [-6, 2], 98: [-5, -2], 534: [-2, 1],
  679: [0, 2], 964: [0, 0], 533: [-7, -2], 1553: [-10, -2], 506: [0, -2], 1910: [0, -2],
  494: [-2, 0], 508: [-2, 0], 434: [0, -2], 514: [0, 3],
  435: [-2, -2], 436: [-2, -2], 481: [-2, -2], 578: [-2, -2], 1187: [-2, -2],
  1194: [-2, -2], 1201: [-2, -2], 1229: [-2, -2],
  197: [-5, 4], 4060: [-2, 4], 126: [4, 4], 800: [4, 2], 127: [4, 2], 157: [6, 2],
  160: [-8, 0], 164: [0, 2], 219: [0, 2], 165: [4, 4], 272: [4, 4], 3870: [4, 4],
  266: [0, 2], 281: [6, -6], 986: [6, -10], 682: [4, 0], 4953: [-4, 0],
  758: [-10, 0], 759: [-8, 2], 5460: [0, -6], 760: [-2, 2], 1946: [-2, 2],
  779: [0, 2], 5134: [0, 2], 905: [-5, 0], 930: [4, 2], 3788: [2, 2], 5668: [-13, 0],
};

/** ★HOUSE 出膛锚(2026-08-31):useStyle5 枪口/杖尖世界坐标——与 drawUseItem 完全
 *  同源(pivot=中心+方向化 offX/offY,精灵钉 ITEM_DRAW_POS,镜像经 sg 因子统一式
 *  world = T + R(sg·α)·(sg·lx, ly))。供 Game.resolveShotAnchor 射击瞬间直算
 *  (无帧滞后;陈旧 readback 方案已退役)。枪:tip=(dp0+fw, dp1+fh/2);杖:斜持
 *  α=aim+45°、tip=(fw·0.9, −fh·0.15)、3476 前伸 14 */
export function heldItemTipWorld(
  cx: number, cy: number, facing: number, aimWorld: number,
  vid: number, fw: number, fh: number,
): { x: number; y: number } {
  const sg = facing;
  const aimL = sg === 1 ? aimWorld : Math.PI - aimWorld;
  const isStaff = STAFF_ITEMS.has(vid);
  let alpha: number, lx: number, ly: number, px: number, py: number;
  if (isStaff) {
    alpha = aimL + 0.785;
    const reach = vid === 3476 ? 14 : 6;                    // :50376-50383
    px = cx + sg * Math.cos(aimL) * reach;
    py = cy + Math.sin(aimL) * reach;                       // offY=p.h/2+sin·reach
    // ★法杖贴图竖绘(花头顶缘中部),斜持 45° 后"上"即瞄准向——tip 取顶缘中点
    //  而非右缘(右缘取法在斜 45° 上下时偏出 20px+,2026-08-31 用户截图定罪)
    lx = fw * 0.5; ly = -fh * 0.85;
  } else {
    // ★枪族 v13 纯极坐标(2026-08-31 终版):出生点 = 中心 + 瞄准单位·reach + (0,−fh/2)。
    //  reach = fw + dp[0](每武器 barrel reach 含定制握把偏移);
    //  垂直偏移 = −fh/2(pivot 高度,恒定不随角度旋转);
    //  零横向恒定偏移 → 全象限弹都在鼠标柱上,朝向翻转零跳变。
    //  (v12 的 handFwd·sg 横向偏移在近垂直时不衰减 = 左右跳,已删)
    const dp = ITEM_DRAW_POS[vid] ?? ITEM_DRAW_POS_DEF;
    const reach = fw + dp[0];
    return {
      x: cx + Math.cos(aimWorld) * reach,
      y: cy - fh * 0.5 + Math.sin(aimWorld) * reach,
    };
  }
  const wr = sg * alpha;
  const c = Math.cos(wr), s = Math.sin(wr);
  const lxm = sg * lx;
  return { x: px + lxm * c - ly * s, y: py + lxm * s + ly * c };
}

/** OffsetsPlayerHeadgear（Main.cs:504-525，按 bodyFrame.Y/56 行索引）：
 *  行 0-6→y2 / 7-9→y0 / 10-13→y2 / 14-16→y0 / 17-19→y2（X 恒 0）。
 *  useStyle 14/15（头侧持）与 holdStyle 5/6/8 的 itemLocation 都要加此偏移 */
const HEADGEAR_OFFSET_Y = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];

// ===================== Extra_N 贴图懒加载 + DrawPrettyStarSparkle 星尘原语 =====================
// 模块级共享（Renderer 实例方法与 SwingArc 等无 atlas 实例的绘制端共用同一份缓存）。
// 精髓：XNA 主 spriteBatch 的 BlendState.AlphaBlend 是【预乘语义】（ColorSourceBlend=
// One, DestBlend=InverseSourceAlpha）——color.A 只削底、不缩放 src 贡献 → 原版所有
// Color(...,A=0) 的 sparkle/glow 在 AlphaBlend 下实为纯加色（RGB 全量、背景零衰减）。
// canvas 等价 = lighter + 染色 alpha 拉满（Extra_98 为白形状带 alpha 渐变：预乘语义
// 下边缘 RGB 也全量加 → 染色时 destination-in 填 255 把 alpha 摊平，非保留原 alpha）。
const extraSpriteCache = new Map<number, ImageBitmap | HTMLImageElement>();
/** 失败负缓存 TTL(2026-08-25):过期后重试,暖缓存到位即自愈 */
const extraSpriteFailAt = new Map<number, number>();
const EXTRA_FAIL_TTL_MS = 10_000;
/** Extra_N 贴图懒加载（sprites/vanilla/Extra_N.png；Image→Bitmap 升级同 projSprite） */
/** 全屏地图虫洞头像命中纯函数（Main.cs:55376-55440 头像环）：命中盒 =
 *  28×28×UIScale（:55400-55404 num83-86），中心 = 本仓头像绘制中心
 *  （mapX(cx) = cx0 + cx/16·zoom——头像恒中心锚）。渲染侧悬停与 Game 点击链
 *  （tryWormholeHeadTeleport 点击帧精确复测）共用；返回命中下标（无 = -1） */
export function wormholeHeadHit(
  mx: number, my: number, cx0: number, cy0: number, zoom: number,
  remotes: ReadonlyArray<{ cx: number; cy: number }>,
): number {
  const half = 14 * 1.1;   // 28×28×UIScale 半宽（num79=UIScale≈1.1）
  for (let i = 0; i < remotes.length; i++) {
    const rp = remotes[i];
    const hx = cx0 + rp.cx / TILE * zoom, hy = cy0 + rp.cy / TILE * zoom;
    if (Math.abs(mx - hx) <= half && Math.abs(my - hy) <= half) return i;
  }
  return -1;
}

export function loadExtraSprite(n: number): ImageBitmap | HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const hit = extraSpriteCache.get(n);
  if (hit !== undefined) return hit;
  // ★失败负缓存带 TTL(2026-08-25 同类扫描):原 onerror 永久置 null——冷缓存窗口
  //   (暖缓存未到 sprites/vanilla)一次失败=整会话缺贴图。改为 10s 过期后允许
  //   重试(暖缓存到位即自愈),重试频率有界不刷屏(逐帧重试=Cloud 族 404 刷屏前科)
  const failAt = extraSpriteFailAt.get(n);
  if (failAt !== undefined) {
    if (Date.now() - failAt < EXTRA_FAIL_TTL_MS) return null;
    extraSpriteFailAt.delete(n);
  }
  const im = new Image();
  // 共享升级链(2026-08-18 review):曾裸 createImageBitmap 静默 catch——失败
  // 永久停在 Image 且无警告无重试;改走 upgradeToBitmap(失败可见+退避重试,
  // 失败回退 Image 已在下方 set 过,重试成功原地替换)
  im.onload = () => upgradeToBitmap(im, (b) => { extraSpriteCache.set(n, b); });
  im.onerror = () => {
    extraSpriteCache.delete(n);
    extraSpriteFailAt.set(n, Date.now());
  };
  im.src = `sprites/vanilla/Extra_${n}.png`;
  extraSpriteCache.set(n, im);
  return im;
}

/** Extra_98 星芒染色缓存。
 *  ★2026-09-02 黑十字案终审定谳（最小复现 + 冻结帧 A/B 双取证）：
 *  「两臂包围盒半透明深蓝灰矩形底」= 历史旧版（alpha 摊平 255 的染色画布 ×
 *  source-over 合成）的 deterministic 复现——最小复现中该路径 88% 臂带像素变暗
 *  （minΔ=−207），而现行 lighter 链（隔离式/直绘两形态）暗像素恒 0（'lighter'
 *  逐像素 dst+αs·Cs 只能加色）；游戏内冻结帧对拍四剑臂带 darkBlocks=0。
 *  修复后观察到的"仍复现"均为陈旧 bundle（SW cache-first/HMR 半旧模块）。
 *  ★本函数像素语义（= XNA 预乘贴图 + AlphaBlend(A=0) 的 canvas 等价）：
 *  原版贡献 = texRGB×texA×tintRGB（纯加色，dst 不衰减）。canvas 'lighter'
 *  贡献 = αs×Cs，故染色画布只需存 rgb×tint（【勿】再乘 a——曾 ×a 预乘 =
 *  贡献变 rgb×tint×a²，臂锥能量减半）；alpha 保留真实值（摊平 255 = 空区
 *  "rgb=0∧a=255"，遇任何非 lighter 路径即整包围盒暗底 = 黑十字本体）。 */
const sparkleTintCache = new Map<string, HTMLCanvasElement>();
function sparkleTintedTex(rgb: readonly [number, number, number]): HTMLCanvasElement | null {
  const img = loadExtraSprite(98);
  // ★texReady（2026-08-25 同类扫描）：loadExtraSprite 半加载窗返回 width>0 的
  //  未完 Image——该窗烘焙平色矩形按 rgb 键永久入缓存（星尘闪光变淡色方片）
  if (!img || !texReady(img)) return null;
  const key = rgb.join(',');
  const hit = sparkleTintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(img as CanvasImageSource, 0, 0);
  try {
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      // ★2026-09-02 去预乘：rgb×tint、alpha 原样——'lighter' 自乘 αs 得
      //  rgb×tint×a = XNA 预乘加色精确等价。曾 ×a（2026-08-30"修正"）= a² 双乘，
      //  臂锥亮度对折（最小复现：cur=10275 vs 精确=19629 亮像素）。
      d[i] = d[i] * rgb[0];
      d[i + 1] = d[i + 1] * rgb[1];
      d[i + 2] = d[i + 2] * rgb[2];
    }
    cx.putImageData(id, 0, 0);
  } catch {
    return null;
  }
  if (sparkleTintCache.size > 64) sparkleTintCache.clear();
  sparkleTintCache.set(key, c);
  return c;
}

/** DrawPrettyStarSparkle 1:1（Main.cs:34734-34750）。
 *  envelope num = GetLerpValue(fadeInStart,fadeInEnd,flare) × GetLerpValue(fadeOutEnd,fadeOutStart,flare)
 *  （Utils.cs:283-308 含 from>to 反向钳位）；vector=(fatnessX·0.5, scaleX)·num、
 *  vector2=(fatnessY·0.5, scaleY)·num；四笔全 lighter 加色：
 *  ①shine 旋 π/2+rotation @vector ②shine 旋 rotation @vector2
 *  ③draw 旋 π/2+rotation @vector·0.6 ④draw 旋 rotation @vector2·0.6。
 *  color = shine×opacity×0.5（A=0）、color2 = draw×0.5——A=0 预乘语义 = 纯加色，
 *  亮度全部折进 tint·globalAlpha（原版 (int) 截断舍入差 ≤1/255 不逐笔复刻）。
 *  消费端：402 星尘蠕虫头（:23888）/SwingArc 真刃弧族（:27424 族）/425 枪口星芒。
 *  ★2026-09-02 复役：黑十字已定谳为历史旧版"alpha 摊平×source-over"残留（见
 *  sparkleTintedTex 头注），最小复现+游戏内冻结帧对拍双侧零暗底——撤去
 *  2026-08-31 的 ?sparkle 停用门，恢复原版恒绘。 */
export function prettyStarSparkle(
  ctx: CanvasRenderingContext2D,
  opacity: number, x: number, y: number,
  drawColor: readonly [number, number, number], shineColor: readonly [number, number, number],
  flareCounter: number,
  fadeInStart: number, fadeInEnd: number, fadeOutStart: number, fadeOutEnd: number,
  rotation: number, scale: readonly [number, number], fatness: readonly [number, number],
  drawDim = 1, shineDim = 1,
): void {
  const lv = (from: number, to: number, t: number): number => {
    if (from < to) { if (t < from) return 0; if (t > to) return 1; }
    else { if (t < to) return 1; if (t > from) return 0; }
    return (t - from) / (to - from);
  };
  const num = lv(fadeInStart, fadeInEnd, flareCounter) * lv(fadeOutEnd, fadeOutStart, flareCounter);
  if (num <= 0) return;
  const shine = sparkleTintedTex(shineColor);
  const draw = sparkleTintedTex(drawColor);
  if (!shine || !draw) return;
  const tw = shine.width, th = shine.height;
  const v1x = fatness[0] * 0.5 * num, v1y = scale[0] * num;
  const v2x = fatness[1] * 0.5 * num, v2y = scale[1] * num;
  const aShine = 0.5 * opacity * num * shineDim, aDraw = 0.5 * num * drawDim;
  // drawDim/shineDim：原版调用侧预乘进色的因子（如 SwingArc 的 White×num3×0.5、
  // 973 的 shine×num13）——折进 globalAlpha 而非逐帧染色（防 tintCache 打爆）
  // ★隔离式合成（2026-08-31 黑十字案留防）：每笔先在独立离屏铺好再以 lighter 一次性
  //   合成——主 ctx 任何残留合成态/异常路径都不可能把臂包围盒画成暗块。
  //   （当年"?nosparkle 消失"二分实为旧版代码 era 的证据；黑十字真身 =
  //   摊平 alpha 画布 × source-over，2026-09-02 最小复现 E 面板逐像素复现定谳）
  let sbuf: HTMLCanvasElement | null = null;
  const stroke = (img: HTMLCanvasElement, rot: number, sw: number, sh: number, alpha: number) => {
    if (alpha <= 0 || sw <= 0 || sh <= 0) return;
    const w = Math.max(1, Math.round(tw * sw)), h = Math.max(1, Math.round(th * sh));
    if (!sbuf) sbuf = document.createElement('canvas');
    if (sbuf.width !== w || sbuf.height !== h) { sbuf.width = w; sbuf.height = h; }
    const bc = sbuf.getContext('2d')!;
    bc.clearRect(0, 0, w, h);
    bc.imageSmoothingEnabled = false;
    bc.drawImage(img, 0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sbuf, -w / 2, -h / 2);
    ctx.restore();
  };
  stroke(shine, Math.PI / 2 + rotation, v1x, v1y, aShine);
  stroke(shine, rotation, v2x, v2y, aShine);
  stroke(draw, Math.PI / 2 + rotation, v1x * 0.6, v1y * 0.6, aDraw);
  stroke(draw, rotation, v2x * 0.6, v2y * 0.6, aDraw);
}

/** PrettySparkle 臂几何（纯函数,tests/dust-premultiplied-blend.test.ts 直测）——
 *  XNA 拉伸=贴图尺寸×scale（PrettySparkleParticle.cs:72-73,Extra_98=72×72）：
 *  vector=(0.3,2)×num×Scale → 水平臂（hx,hy）、vector2=(0.3,1)×num×Scale → 垂直臂
 *  （vx,vy）——两臂都乘【整个】Vector2 Scale,逐轴取值。
 *  消费位 = Renderer.drawSparkleArms（VDust 双轴通道 scaleX/scaleY 尘）。 */
export function sparkleArmGeometry(
  sx: number, sy: number, num: number, tex = 72,
): { hx: number; hy: number; vx: number; vy: number } {
  return {
    hx: 0.3 * sx * num * tex, hy: 2 * sy * num * tex,
    vx: 0.3 * sx * num * tex, vy: 1 * sy * num * tex,
  };
}

import { Lang } from '../i18n/Lang';
import { pylonItemTypeFromStyle } from '../world/TeleportPylons';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { statOfInternal } from '../data/vanillaItemStats';
import { townExtraFrames, TOWN_NPC_HEAD_INDEX, BOSS_HEAD_INDEX, bossHeadRotation, VANILLA_NPCS } from '../data/vanillaNpcs';
import type { Player } from '../entities/Player';
import { ICE_SLIP_IDS, FROZEN_SLIME_ID } from '../entities/Player';
import { mountFallbackColor, mountLights, fishronWashFactor, MOUNT_SETS, MOUNT_DATA } from '../entities/Mounts';
import { BuffType } from '../stats/Buffs';
import { expertRenderScale } from '../stats/ScaleStats';
import { localAIOf } from '../entities/bossAI_moon_events';
import { vanillaTileMapColor, vanillaWallMapColor, vanillaLiquidColor, vanillaSkyColor, VANILLA_DIRT_BG, VANILLA_ROCK_BG } from '../data/vanillaMapColors';
import { mapPaintColor, PAINT_RGB } from '../world/Paint';
import { Enemy } from '../entities/Enemy';
import { drawForceFieldBubble } from '../fx/ForceFieldBubble';
import { shieldMax as shieldMaxOf } from '../world/LunarEvent';
import { visEffectFrames } from '../entities/Enemy';
import { projFrameCount, projFrameImg, Arrow } from '../entities/Arrow';
import { GrenadeProj, SpearProj } from '../entities/WeaponProj';
import { Bobber, hackHoldStyleActive } from '../entities/Bobber';
import { TOWER_KEY, TOWER_SHIELD_COLOR, isTowerId, shieldMax } from '../world/LunarEvent';
import { ItemDrop } from '../entities/ItemDrop';
import { drawFakeFishSchool } from '../entities/FakeFish';
import { TownNPC, sittingHatY, shimmerBodyAlpha, shimmerGlowAlpha } from '../entities/TownNPC';

/** NPC 任务通知图标（Images/UI/UI_quickicon1,Utils.cs:445-464）——vanilla-ui
 *  白名单外单图,直载(同 CharCreation invBg 先例) */
let _quickiconImg: HTMLImageElement | null = null;
function quickiconImg(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!_quickiconImg) {
    _quickiconImg = new Image();
    _quickiconImg.src = 'sprites/vanilla-ui/UI_quickicon1.png';
  }
  return _quickiconImg.complete && _quickiconImg.naturalWidth > 0 ? _quickiconImg : null;
}
import { Tombstone, getTombstoneCanvas } from '../entities/Tombstone';
import { liveGorePieces, type GorePiece } from '../entities/GorePiece';
import { wofDrawArea } from '../entities/bossAI_wof';
import { dutchmanAnim, witherBeastLocal } from '../entities/bossAI_dd2';
import { mlElipseVec, mlSlotDecode, ML_HAND_ATTACKS, ML_HEAD_ATTACKS } from '../entities/bossAI_duke_moonlord';
import { ML_EYE_ATTACKS } from '../entities/bossAI_lunar_misc';
import { wingDrawOf, wingDrawFrame, wingAnchorForRow, HEADGEAR_ZERO_ROWS, stealthFactors } from '../data/vanillaWingVisuals';
import { dyeApplyOf, applyDyePass, applyDyePassLit, isV0MidTech, type DyeApply } from '../data/vanillaDyes';
import {
  BALLOON_TORSO_FRAMING, WAIST_TORSO_FRAMING, SHOE_ROLLER_SKATE, FACE_DRAW_OFFSET, OFFSETS_PLAYER_OFFHAND,
  BACK_DRAW_IN_BACKPACK, BACK_DRAW_IN_TAIL, MOUNT_BACKPACK_OK, BACK_IS_ACAPE,
  NECK_IS_SCARF, FRONT_SCARF_CAPE_HIDE, FRONT_NECK_LAYER_ALWAYS, SITTING_LEG_SLICES,
  SITTING_LEG_SLICES_SPECIAL, SITTING_LEG_SPECIAL_LEGS,
  FACE_HELMET_OFFSET, HELMET_DRAW_OFFSET, FACE_MASK_HELMET_HIDE, FACE_FLOWER_HELMET_HIDE,
  HEAD_HIDES_HEAD, PREVENT_BEARD_DRAW,
  shieldHaloFactor, shieldParryTransform,
  FACE_UNDER_HAIR, FACE_MASK_LAYER, FACE_FLOWER_LAYER, FACE_HEAD_LAYER,
  resolveFaceLayers, faceLayerSplitPlan, FACE_HEAD_OFFSET_IDS, FACE_HEAD_HELMET_OFFSET,
} from '../data/vanillaAccDrawslots';
import { defaultUniforms, getPass, runPassOnImageData, sampleImageInto, type SM2SamplerOut, type SM2Uniforms } from '../fx/SM2Effect';
import { drawStardewAnimation } from '../fx/StardewAnimation';
import { VanillaDust, dustPremulBake, dustPmCacheTouch, dustPmCacheEvict, dustAxisScale } from '../fx/VanillaDust';
import { flameParticles, flameFadeOutFactor } from '../fx/FlameParticles';
import { fadingParticles, fadingAlphaFactor } from '../fx/FadingParticles';
import type { TrailSpec } from '../fx/TrailShader';
import { drawStripTrail } from '../fx/TrailShader';
import { MapPingStore } from '../net/syncModules';
import { leashedBubbleVisible, bubbleScaleTier } from '../entities/LeashedCritter';
import { applyHeldProjPointing, heldProjFrameBegin, noteHeldProjEntity } from './heldProj';
import { texReady } from './texId';
import { PAINT_TOOLS, paintToolOffset } from './CursorItemIcon';
import type { Entity } from '../entities/Entity';
import {
  BigProgressBarSystem, drawBigProgressBar, refLifeMaxOf,
  type BarContext, type BarNpc, type CollectInfo,
} from './BossBars';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; damp?: number; grav?: number; ax?: number; ay?: number; }

// ---- 拴绳风筝绘制（Main.DrawKite :36614-37069）工具 ----

/** Utils.Remap（Utils.cs:815-821，钳位段） */
function remapClamped(x: number, iMin: number, iMax: number, oMin: number, oMax: number): number {
  const t = Math.max(0, Math.min(1, (x - iMin) / (iMax - iMin)));
  return oMin + (oMax - oMin) * t;
}

/** Main.hslToRgb（Main.cs:4540 起）→ [r,g,b] 0-1 */
function hslRgb(hIn: number, s: number, l: number): [number, number, number] {
  const h = ((hIn % 1) + 1) % 1;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** DrawKite 逐型绳索参数（Main.cs:36614-36821 逐 case；缺省档 = 766-770 五色风筝） */
interface KiteRopeParams {
  rope: number;        // TextureAssets.Extra[id]（绳尾贴图）
  segCols: number;     // num  绳尾贴图列数
  startCol: number;    // num12 起始列（回卷锚点）
  rotOffset: number;   // num2 = ±π/2（spriteDirection 定号）
  tailSegs: number;    // num3 oldPos 采样档数
  oldStep: number;     // num4 oldPos 采样步长
  segLen: number;      // num5 段长上限
  rotSway: number;     // num6 本体摆角偏置
  tailDx: number;      // num7 尾根 X 偏移
  tailDy: number;      // num8 尾根 Y 偏移
  swapAt: number;      // num9 换段长档位（-1 不换）
  swapLen: number;     // num10 换后段长
  swayLen: number;     // num11 摆幅
  ropeLines: number;   // num13 尾条数
  dx2: number;         // num14
  dy2: number;         // num15
  lineToo: boolean;    // flag  尾下垫 FishingLine
  rewind: boolean;     // flag2 回卷列 -1
  droopRot: number;    // num16 下垂角
}

function KITE_ROPE_PARAMS(type: number, spriteDirection: number): KiteRopeParams {
  const p: KiteRopeParams = {
    rope: 103, segCols: 15, startCol: 0, rotOffset: 0, tailSegs: 10, oldStep: 5,
    segLen: 10, rotSway: 0, tailDx: -14, tailDy: -2, swapAt: -1, swapLen: -1,
    swayLen: 8, ropeLines: 1, dx2: 0, dy2: 0, lineToo: true, rewind: false, droopRot: 0,
  };
  const flip = (v: number) => (spriteDirection === 1 ? v : -v);   // ±π/2 与 ±π/n 定号
  switch (type) {
    case 771:   // :36643
      Object.assign(p, { rope: 104, segCols: 12, startCol: 12, rotOffset: flip(Math.PI / 2), tailSegs: 12, segLen: 22, rotSway: flip(Math.PI / 8), tailDx: -8, tailDy: -6, swapAt: 10, swapLen: 8, swayLen: 12, droopRot: Math.PI / 16 });
      break;
    case 822:   // :36658
      Object.assign(p, { rope: 132, segCols: 7, startCol: 7, rotOffset: flip(Math.PI / 2), tailSegs: 7, segLen: 22, rotSway: flip(Math.PI / 12), tailDx: -20, tailDy: -6, swayLen: 12, droopRot: Math.PI / 16 });
      break;
    case 850:   // :36671
      Object.assign(p, { rope: 147, segCols: 8, startCol: 8, rotOffset: flip(Math.PI / 2), tailSegs: 8, segLen: 22, rotSway: flip(Math.PI / 12), tailDx: -20, tailDy: -38, swayLen: 12, dx2: 6, dy2: 2, lineToo: false, droopRot: Math.PI * 5 / 32 });
      break;
    case 823:   // :36687（846 同参数换 146）
    case 846:
      Object.assign(p, { rope: type === 846 ? 146 : 133, segCols: 6, startCol: 6, rotOffset: flip(Math.PI / 2), tailSegs: 6, segLen: 40, rotSway: flip(Math.PI / 12), tailDx: -16, tailDy: -10, swapLen: -1, swayLen: 30, droopRot: Math.PI * 3 / 16 });
      break;
    case 827:   // :36705（844 → 144）
    case 844:
      Object.assign(p, { rope: type === 844 ? 144 : 135, segCols: 4, startCol: 3, rotOffset: flip(Math.PI / 2), tailSegs: 16, oldStep: 4, segLen: 10, rotSway: flip(Math.PI / 12), tailDy: -4, swapLen: -1, rewind: true, droopRot: Math.PI / 32 });
      break;
    case 828:   // :36723（829 → 137）
    case 829:
      Object.assign(p, { rope: type === 829 ? 137 : 136, segCols: 2, startCol: 1, rotOffset: flip(Math.PI / 2), tailSegs: 6, segLen: 10, rotSway: flip(Math.PI / 12), swayLen: 10, tailDy: -4, ropeLines: 3, lineToo: false, rewind: true, droopRot: Math.PI * 3 / 16 });
      break;
    case 852:   // :36743
      Object.assign(p, { rope: 148, segCols: 2, startCol: 1, rotOffset: flip(Math.PI / 2), tailSegs: 6, segLen: 10, rotSway: flip(Math.PI / 12), swayLen: 10, tailDy: -4, ropeLines: 4, lineToo: false, rewind: true, droopRot: Math.PI * 5 / 16 });
      break;
    case 830:   // :36758（838 → 139）
    case 838:
      Object.assign(p, { rope: type === 838 ? 139 : 138, segCols: 3, startCol: 3, rotOffset: flip(Math.PI / 2), tailSegs: 3, segLen: 60, rotSway: flip(Math.PI / 12), swapLen: 40, swapAt: 3, swayLen: 50, tailDy: -20, dx2: -10, droopRot: Math.PI / 4 });
      break;
    case 843:   // :36778
      Object.assign(p, { rope: 140, segCols: 2, startCol: 2, rotOffset: flip(Math.PI / 2), tailSegs: 2, segLen: 30, rotSway: flip(Math.PI / 12), swayLen: 20, tailDy: -16, dx2: -10, droopRot: Math.PI / 4 });
      break;
    case 845:   // :36791
      Object.assign(p, { rope: 145, segCols: 3, startCol: 3, rotOffset: flip(Math.PI / 2), tailSegs: 3, segLen: 42, rotSway: flip(Math.PI / 12), swapLen: 50, swapAt: 2, swayLen: 30, tailDy: -8, dx2: -10 });
      break;
    case 824: case 826: case 839: case 840: case 853:   // :36805（num13=0，无尾条）
      p.ropeLines = 0;
      break;
    case 766: case 767: case 768: case 769: case 770:   // :36814
      p.startCol = (type - 766) * 3 + 3;
      break;
    default:
      break;
  }
  return p;
}

const PIXEL_ART_TILE = TILE_BY_KEY['pixel_block'] ?? -1; // 自研像素方块（F2 图片导入，RGB 在 frameX/Y）

// 光照合成 4-tap 标量缓冲(替代每像素 [r,g,b] 元组,2026-08 审计 G2)
const _lightTap = new Uint8Array(12);

// ============ 原版 FindFrame 分族帧引擎（1.4.5.6 Terarria1456/Terraria/NPC.cs:67295+） ============

/** TownNPCs 档案贴图条帧数取值口径（2026-08-13 两轮修正教训）：
 *  帧高逐表可变（人形族 54-64px、城镇史莱姆 670/678-684 仅 34-44px）→ 高/56 反推
 *  对史莱姆必错；唯一权威 = vanilla-npcs.json frames（=Main.npcFrameCount）。
 *  atlas.vnpcMeta 只覆盖 vanilla.json npcs 的 20 条特殊条目（46/49/67/74/299…,
 *  城镇 NPC 均不在其中）→ 必须回退 json frames,勿再 ??1（整条贴图走路根因） */
export function townSheetFrameCount(npcId: number): number {
  return VANILLA_NPCS[String(npcId)]?.frames ?? 1;
}

/** 玩家本体随坐骑机身倾斜的绘制变换（LegacyPlayerRenderer → PlayerDrawLayers 1:1）：
 *  原版 DrawPlayerFull 把 player.fullRotation/fullRotationOrigin 整组传入
 *  PlayerDrawSet（LegacyPlayerRenderer.cs:481/:307/:312），DrawPlayer_TransformDrawData
 *  （PlayerDrawLayers.cs:4199-4230）对 DrawDataCache【全部层】绕
 *  drawinfo.Position+rotationOrigin 旋转并把 fullRotation 加进每层自转——即手持物/
 *  翅膀/纸娃娃各层与机身贴图作为刚体同转（例外 ignorePlayerRotation：钻头激光
 *  Mount.cs:6061；Safeman 日环 PlayerDrawLayers.cs:4179）。
 *  锚点（fullRotationOrigin 来源，均为 mounted 盒坐标系——盒高 42+heightBoost 底锚）：
 *   - UFO 7 / 钻头 8：Mount.SetMount（Mount.cs:6268-6271）= (width/2, height/2)
 *     → pivotY = 玩家盒底 − (42+boost)/2
 *   - 巫婆扫帚 23：Hover 每帧（Mount.cs:3520）= (width/2, height) → 玩家盒底心
 *  矿车族不适用（fullRotation 走 cart.rotation 的 TrackRotation 独立链，已另行消费）。
 *  返回 null = 不旋转（角度 0 / 非倾斜族）。 */
export interface PlayerMountRotation { angle: number; pivotX: number; pivotY: number }
export function playerMountRotation(
  type: number, fullRotation: number,
  box: { x: number; y: number; w: number; h: number }, heightBoost: number,
): PlayerMountRotation | null {
  if (fullRotation === 0 || (type !== 7 && type !== 8 && type !== 23)) return null;
  const mh = 42 + (heightBoost || 0);   // mounted 盒高（本仓玩家盒恒 42，底锚换算）
  return {
    angle: fullRotation,
    pivotX: box.x + box.w / 2,
    pivotY: type === 23 ? box.y + box.h : box.y + box.h - mh / 2,
  };
}

/** 上变换的 canvas 施加（TransformDrawData 位旋矩阵的等价写法，与矿车旋转同式） */
function applyPlayerMountRotation(ctx: CanvasRenderingContext2D, r: PlayerMountRotation): void {
  ctx.translate(r.pivotX, r.pivotY);
  ctx.rotate(r.angle);
  ctx.translate(-r.pivotX, -r.pivotY);
}

// 僵尸族 case 3（L77026）：腾空/逆向→帧2；站定→帧0；行走 counter+=|vx| 按 8/16/24/32 → 0,1,2,1 往复
const ZOMBIE_FRAME_TYPES = new Set([3, 52, 53, 132, 161, 186, 187, 188, 189, 200, 223, 251, 254, 255, 319, 320, 321, 331, 332, 342, 536, 590, 691]);
// 蝙蝠族 case 49（L75523→148 块 L75585）：每 6 tick 推进；49/51/60/634 循环到倒数第 2 帧（末帧=挂机姿势）
const BAT_SKIP_LAST = new Set([49, 51, 60, 634]);
// 法师族三态帧（FindFrame case 29/32/45/172/281-286/693，cs:77721-77743）——
// 非循环状态机：帧0 待机 / 帧1 蓄力(ai[1]>0 且 vy==0) / 帧2 腾空(vy≠0)；
// 24 火妖 / 533 沙漠幽魂另有专属 case（下方分支）
const CASTER_STATE_FRAME_TYPES = new Set([29, 32, 45, 172, 281, 282, 283, 284, 285, 286, 693]);
// 旋转族 NPC（原版 npc.rotation 驱动绘制朝向；FindFrame 不做朝向翻转）：
// 35/68=骷髅王头/守卫、113-115=血肉墙/之眼/饥饿者、116=饥饿者 II(FindFrame case 116
//   rotation=atan2(vy,vx)，vx>0 再 FlipHorizontally——drawEnemy 独占分支自带翻转，
//   登记进 rotationDriven 以禁用通用 facing 镜像)、125/126=双子、127-131=Prime 头+四部件、
// 134-136=毁灭者链、261-265=世花族(孢子/本体/钩蔓/触须)、370=猪鲨、396/397=月总头/手、657=史莱姆皇后(飞行倾斜)
const ROTATION_NPC = new Set([35, 68, 113, 114, 115, 116, 125, 126, 127, 128, 129, 130, 131, 134, 135, 136, 246, 247, 248, 249, 261, 262, 263, 264, 265, 370, 372, 373, 396, 397, 477, 478, 479, 657]);
// ★372/373 鲨鱼龙（sharkronAI 已按 :35222-35315 写 spin）、477-479 飞蛾魔族
// （mothron 三 AI 已按 :39935-40614 全 14 式写 spin）——2026-08-20 审计前写了
// spin 却不在本集 = 无消费（spin 通道本集独占）

// Main.wofDrawFrameIndex（Main.cs:820 静态；同屏只有一只血肉墙，模块级等价）。
// 原版在 DrawWOFBody 内自增（:37861-37863），bossAI_wof 未维护 → 渲染侧持有。
// 18 步循环、/6 换帧 = 3 帧各 6 步；gamePaused 冻结语义本仓无暂停态，恒推进（差异登记）
let wofDrawFrameIndex = 0;

// ---- 状态化 FindFrame case（WeakMap 持 counter/frame,每调用推进一次 ≈ 每 tick）----
/** 鸮族 611/689 站定转头待机（NPC.cs:74383-74429 1:1,替代顺序轮播近似）:
 *  counter 每 tick +1（band 边界 1/80 掷停顿）；(counter+1)%40==39 → 重掷 band
 *  = 40×rand(3)。band0=[0,1,2,1] band1=[0,3,4,3] band2=[0,5,6,7]（各帧 10t） */
const owlIdleStates = new WeakMap<Enemy, { counter: number }>();
function owlIdleFrame(e: Enemy): number {
  const s = owlIdleStates.get(e) ?? { counter: 0 };
  owlIdleStates.set(e, s);
  if (Math.trunc(s.counter) % 40 !== 0 || Math.random() * 80 < 1) s.counter += 1;
  if ((s.counter + 1) % 40 === 39) s.counter = 40 * Math.floor(Math.random() * 3);
  const num113 = Math.floor((s.counter % 40) / 10);   // C# 整除((int)counter%40/10)——曾浮点除致帧号 2.5/7.3
  const num114 = Math.trunc(s.counter / 40);
  if (num114 === 0) return num113 === 3 ? 1 : num113;
  if (num114 === 1) return num113 === 0 ? 0 : 2 + (num113 === 3 ? 1 : num113);
  return num113 === 0 ? 0 : 4 + num113;
}

/** 珍稀宝箱怪 473-476 状态机（NPC.cs:71831-72000 1:1,替代周期穿插近似）:
 *  ai0 0/7 伪装帧0；1 警戒按 ai1/6 分段 1-6；8 悬浮 3+(counter/6) 钳 3-6
 *  （counter 24 回卷）；2/6 地面 = 低帧抬 12→<10 每 8t +1 至 10（counter=12）、
 *  ≥10 后 6t 眨 12/11/10/11（23 回卷），腾空=13；3 每 6t 从 >7 递减回落；
 *  4/5=13。原版 ai[0]==4.1 特殊段（三段跳劈帧序）本仓 ai0 为整数不产生,备案 */
const mimicStates = new WeakMap<Enemy, { counter: number; frame: number }>();
function mimicFrame(e: Enemy, frames: number): number {
  const s = mimicStates.get(e) ?? { counter: 0, frame: 0 };
  mimicStates.set(e, s);
  const ai0 = e.ai0;
  if (ai0 === 0 || ai0 === 7) { s.counter = 0; s.frame = 0; return 0; }
  if (ai0 === 1) {
    s.counter = 0;
    s.frame = e.ai1 < 6 ? 1 : e.ai1 < 12 ? 2 : e.ai1 < 18 ? 3 : e.ai1 < 24 ? 4 : e.ai1 < 30 ? 5 : 6;
    return s.frame;
  }
  if (ai0 === 8) {
    s.counter += 1;
    if (s.counter >= 24) s.counter = 0;
    s.frame = Math.min(6, Math.max(3, 3 + Math.trunc(s.counter / 6)));
    return s.frame;
  }
  if (ai0 === 3) {
    s.counter += 1;
    if (s.counter > 6) s.counter = 0;
    if (s.frame > 7) s.frame -= 1;
    return s.frame;
  }
  if (ai0 === 4 || ai0 === 5) { s.counter = 0; s.frame = 13; return Math.min(13, frames - 1); }
  if (ai0 === 4.1) {
    // :71960-71999 三段跳劈帧序（num26=4/档）：入段时 frame>6 → counter 清零;
    // 帧带 6,5,4,3,4,5(各 4t,末档 23 回卷)——2026-08-19 补(曾误判"本仓 ai0
    // 为整数不产生 4.1"而未接,bigMimicAI :696/:938 实际产生)
    if (s.frame > 6) s.counter = 0;
    s.counter += 1;
    if (s.counter < 4) s.frame = 6;
    else if (s.counter < 8) s.frame = 5;
    else if (s.counter < 12) s.frame = 4;
    else if (s.counter < 16) s.frame = 3;
    else if (s.counter < 20) s.frame = 4;
    else {
      s.frame = 5;
      if (s.counter >= 23) s.counter = 0;
    }
    return Math.min(frames - 1, s.frame);
  }
  // ai0 2/6
  if (e.vy === 0) {
    s.counter += 1;
    if (s.frame < 7) s.frame = 12;
    if (s.frame < 10) {
      if (s.counter > 8) {
        s.frame += 1;
        s.counter = 0;
        if (s.frame === 10) s.counter = 12;
      }
    } else if (s.counter < 6) s.frame = 12;
    else if (s.counter < 12) s.frame = 11;
    else if (s.counter < 18) s.frame = 10;
    else {
      s.frame = 11;
      if (s.counter >= 23) s.counter = 0;
    }
  } else {
    s.counter = 0;
    s.frame = 13;
  }
  return Math.min(frames - 1, s.frame);
}

/** 按原版 FindFrame 分族规则算当前帧 index（导出供 DebugReport tiles.focus.frameEngine 复算） */
export function vanillaFrameIdx(e: Enemy, frames: number): number {
  // AI 侧算定的帧号直读（694 水书宝箱怪态机帧——态切换清零的 frameCounter
  // 无法从全局 t 推出，cursedSkullAI 的 mimic694Frame 维护）
  if (e.customFrameIdx != null) return Math.min(frames - 1, e.customFrameIdx);
  const id = e.vanillaId ?? 0;
  const ai = e.vanilla?.aiStyle ?? 0;
  const t = e.animT; // tick 计数（≈原版 frameCounter 驱动源）
  const walking = Math.abs(e.vx) > 0.05;
  // 僵尸族（L77049-77085）：行走 0,1,2,1 按 |vx| 累加；腾空=2；站定=0
  if (ZOMBIE_FRAME_TYPES.has(id)) {
    if (!e.onGround) return Math.min(2, frames - 1);
    if (!walking) return 0;
    const phase = (e.walkCycleT + Math.abs(e.vx) * 8) % 32; // 每 tick +|vx|，32 一循环
    return phase < 8 ? 0 : phase < 16 ? 1 : phase < 24 ? 2 : 1;
  }
  // 武装僵尸族扑咬（FindFrame case 430-436/591，NPC.cs:71651-71716；case 494/495
  // :70437-70518）：ai[2]>0（lungeFamilyStep 扑咬窗，fighterFamilies.ts）按窗龄切挥砍帧行
  // ——武装型 <5→3/<10→4/<15→5/else→6；494/495 <7→5/<14→6/else→7。非攻咬态同 zombie
  // 三态：腾空/后滑(direction×velocity 相逆)=行 2（494/495 跳升 2/下落 3 分行）；站立=0；
  // 行走 [0,1,2,1]（494/495 为 [0..4]，周期 39px）——walkCycleT 即 frameCounter+=|vx| 直读。
  // 曾落 default 全帧循环 → 边走边播挥砍臂（用户实报）
  if ((id >= 430 && id <= 436) || id === 591 || id === 494 || id === 495) {
    const backslide = (e.facing === -1 && e.vx > 0) || (e.facing === 1 && e.vx < 0);
    if (id === 494 || id === 495) {
      if (e.ai2 > 0) return e.ai2 < 7 ? 5 : e.ai2 < 14 ? 6 : Math.min(7, frames - 1);
      if (!e.onGround || backslide) return e.vy < 0 ? 2 : 3;
      if (!walking) return 0;
      const c = e.walkCycleT % 39;
      return c < 8 ? 0 : c < 16 ? 1 : c < 24 ? 2 : c < 32 ? 3 : 4;
    }
    if (e.ai2 > 0) return e.ai2 < 5 ? 3 : e.ai2 < 10 ? 4 : e.ai2 < 15 ? 5 : Math.min(6, frames - 1);
    if (!e.onGround || backslide) return 2;
    if (!walking) return 0;
    const c = e.walkCycleT % 32;
    return c < 8 ? 0 : c < 16 ? 1 : c < 24 ? 2 : 1;
  }
  // 栖息态 NPC（秃鹫 61 cs:24082 ai[0]=0 栖息 / 宝箱怪 85 族 cs:25645 ai[0]=0 伪装）：
  // 静止帧 0；激活后从帧 1 起循环
  if (ai === 17 || ai === 25) {
    // FindFrame case 61(:74235-74255):vx==vy==0 → 帧0(栖息);飞行帧每 5 tick 推进
    // (:74247 num148=5),原版用 frameCounter(栖息清零)——全局 t 连续循环视觉等价
    if (e.vx === 0 && e.vy === 0) return 0;
    return frames > 1 ? 1 + Math.floor(t / 5) % (frames - 1) : 0;
  }
  // 爬墙蜘蛛族（FindFrame case 165/237/238/240/531, cs:73795-73817）：
  // frameCounter += (|vx|+|vy|)×0.5（531 ×0.4），24 一循环 4 帧
  if (ai === 40) {
    return Math.floor(((e.crawlT ?? 0) / 6)) % frames;
  }
  // 蜘蛛地面形态（FindFrame case 164/236/239/530, cs:73766-73783）：
  // 腾空 vy<0=帧4 / vy>0=帧0；行走 |vx|×1.1 累加 6 步进 0..3 循环
  if (id === 164 || id === 236 || id === 239 || id === 530) {
    if (!e.onGround) return e.vy < 0 ? Math.min(4, frames - 1) : 0;
    if (!walking) return 0;
    return Math.floor((e.walkCycleT * 1.1) / 6) % 4;
  }
  // 黄蜂族（FindFrame case 42，cs:75607-75633）：counter 每 tick+1，2 tick 一换，
  // 序列 0→1→2→1→回卷（8 tick 一循环）——翅膀对称拍动
  if (id === 42 || (id >= 231 && id <= 235)) {
    return [0, 1, 2, 1][Math.floor(t / 2) % 4];
  }
  // 蝙蝠族（case 49 块 cs:75523-75585）：每 6 tick 推进、回卷含帧 0
  // （cs:75577-75584 `if (frame.Y >= num*num305) frame.Y = 0`——此前 max(1,…) 跳过帧 0）
  if (ai === 14) {
    const cap = BAT_SKIP_LAST.has(id) ? frames - 1 : frames;
    return Math.min(frames - 1, Math.floor(t / 6) % Math.max(1, cap));
  }
  // 史莱姆（case 1, L71506）：每 8 tick 推进，全循环
  if (ai === 1) return Math.floor(t / 8) % frames;
  // 骷髅王头/手（case 35/36, L67378-67388）：常规恒帧 0；RedHatSkeletron 变体
  // （35/36 的 ai[3]==1）帧 1——曾恒 0 = 红帽头/手渲染成普通版(终审修)
  if (ai === 11 || ai === 12) return e.vanillaId !== 68 && e.ai3 === 1 ? 1 : 0;
  // 兔/地面小动物族（FindFrame case 46，cs:77553-77600：46/47 兔·病害兔、303/337/
  // 443/464/540/614、646-652）：站定=帧0 清计数；腾空 vy<0=帧4 / vy>0=帧6；
  // 行走 counter += |vx|+1，**>6 才进一帧**、0..frames-1 全帧含帧 0 循环回 0。
  // （曾错走城镇 NPC 档帧 2 起每 |vx|*2+1 计——兔子 3 倍速闪帧,2026-08-18 用户报告）
  if (id === 46 || id === 47 || id === 303 || id === 337 || id === 443 || id === 464
    || id === 540 || id === 614 || (id >= 646 && id <= 652)) {
    if (!e.onGround) {
      if (e.vy < 0) return Math.min(4, frames - 1);
      return Math.min(6, frames - 1);
    }
    if (!walking) return 0;
    // counter ≡ walkCycleT + t（每 tick += |vx| + 1）；越过 7 即进帧
    return Math.floor((e.walkCycleT + t) / 7) % frames;
  }
  // ---- 其余 aiStyle=7 小动物专属 case（此前全被下方城镇 NPC 档截胡：
  //      帧 2 起/阈值 6/|vx|*2+1 = 行走小动物 2-3 倍速闪帧"鬼畜"，2026-08-18
  //      用户报"走路的金鱼"。下列 case 逐族对齐 FindFrame type switch）----
  // 行走金鱼 230/593（case 230/593，cs:76584-76649）：站定=帧0；行走
  // counter += |vx|*2+1、>10 进帧全帧循环；腾空=帧0（vy>4 的 rotation
  // 倾斜在 AI 侧未驱动，差异登记）。counter ≡ walkCycleT*2 + t
  if (id === 230 || id === 593) {
    if (!e.onGround || !walking) return 0;
    return Math.floor((e.walkCycleT * 2 + t) / 11) % frames;
  }
  // 企鹅 148/149/168/470（case 148，cs:77094-77152）：counter += |vx|（无 +1！）
  // 相位制 <6=0 / <12=1 / <15=2 回卷 15；腾空=帧2；localAI[0] 肚皮滑行带
  // （2/3/4 → +3/+6/+9）我们的滑行 AI 未驱动 localAI → 恒带 0（差异登记）
  if (id === 148 || id === 149 || id === 168 || id === 470) {
    if (!e.onGround) return Math.min(2, frames - 1);
    if (!walking) return 0;
    const ph = e.walkCycleT % 15;
    return ph < 6 ? 0 : ph < 12 ? 1 : 2;
  }
  // 松鼠 299/538/539/639-645（case 299，cs:77160-77214）：行走
  // counter += |vx|*0.5+1、>6 进帧；回卷到帧 1（0..frames-1 循环跳过 0）；
  // 腾空 vy<0=帧2 / vy>0=帧4
  if (id === 299 || id === 538 || id === 539 || (id >= 639 && id <= 645)) {
    if (!e.onGround) return e.vy < 0 ? Math.min(2, frames - 1) : Math.min(4, frames - 1);
    if (!walking) return 0;
    return 1 + (Math.floor((e.walkCycleT * 0.5 + t) / 7) % Math.max(1, frames - 1));
  }
  // 鼠族 300/447/610（case 300/610，cs:77215-77316）：站定=嗅探帧 0/1
  // （counter+1、>8 进帧）；行走与腾空同式 counter += |vx|*0.5+1、>6 进帧，
  // 回卷到帧 2（2..frames-1 循环）
  if (id === 300 || id === 447 || id === 610) {
    if (e.onGround && !walking) return Math.floor(t / 9) % 2;
    return 2 + (Math.floor((e.walkCycleT * 0.5 + t) / 7) % Math.max(1, frames - 2));
  }
  // 蛙族 361/445/687（case 361，cs:77320-77378）：wet=游帧 10/11/12 按 |vx|
  // 分档；陆上待机 0..5（7t/帧）；行走相位 [0,6,8,9]（6t/段）；腾空
  // vy>0=帧9 / vy<0=帧8
  if (id === 361 || id === 445 || id === 687) {
    if (e.wet) {
      const a = Math.abs(e.vx);
      return Math.min(frames - 1, a > 0.25 ? 10 : a > 0.15 ? 11 : 12);
    }
    if (!e.onGround) return Math.min(frames - 1, e.vy > 0 ? 9 : 8);
    if (!walking) return Math.floor(t / 7) % Math.min(6, frames);
    return Math.min(frames - 1, [0, 6, 8, 9][Math.floor(t / 6) % 4]);
  }
  // 行走鸟 362/364/602/608（case 362/602，cs:74445-74546）：站定=帧0；
  // 行走 counter+1、≥4 进帧，循环带 3..9（<3 抬 3、≥10 回 3）
  if (id === 362 || id === 364 || id === 602 || id === 608) {
    if (!walking) return 0;
    return Math.min(frames - 1, 3 + (Math.floor(t / 4) % 7));
  }
  // 龟 616/617（case 616，cs:77379-77432）：wet=游带 8..13（走 6t/停 11t 一帧）；
  // 陆上 0..7（9t/帧）；站定=帧0；腾空=帧8
  if (id === 616 || id === 617) {
    if (e.wet) return Math.min(frames - 1, 8 + (Math.floor(t / (walking ? 6 : 11)) % 6));
    if (!e.onGround) return Math.min(8, frames - 1);
    if (!walking) return 0;
    return Math.floor(t / 9) % Math.min(8, frames);
  }
  // 龟 625（case 625，cs:77434-77473）：wet=游带 6..11（走 5t/停 9t 一帧）；
  // 陆上 0..5（8t/帧）；站定=帧0
  if (id === 625) {
    if (e.wet) return Math.min(frames - 1, 6 + (Math.floor(t / (walking ? 5 : 9)) % 6));
    if (!walking) return 0;
    return Math.floor(t / 8) % Math.min(6, frames);
  }
  // 城镇 NPC（aiStyle 7，FindFrame 城镇分支 cs:70159-70240）——仅城镇/绑缚族：
  // 小动物专属 case（46 族/230/299/300/361/362/616/625 等已在上方各自分支截胡，
  // 勿再落到本档（帧 2 起/|vx|*2+1 对小动物是 3 倍速鬼畜））：腾空=1；
  // 站定帧（cs:70163-70181）：638 是 0-7 待机循环（4t 推进）、140/489=帧1、其余=帧0；
  // 行走帧 2..frames-extra-1 循环（frameCounter += |vx|*2+1，阈值 num109：
  // 632/534/638/656=12（489=8 且 counter 加 |vx|*1+0.5）、其余 6）
  if (ai === 7) {
    if (!e.onGround) return 1;
    if (!walking) {
      if (id === 638) return Math.min(7, Math.floor(t / 4) % Math.min(8, frames));
      if (id === 140 || id === 489) return Math.min(1, frames - 1);
      return 0;
    }
    const extra = townExtraFrames(id);
    const len = Math.max(1, frames - extra - 2);
    if (id === 489) return 2 + (Math.floor((e.walkCycleT + t * 0.5) / 8) % len);
    const step = id === 632 || id === 534 || id === 638 || id === 656 ? 12 : 6;
    return 2 + (Math.floor((e.walkCycleT * 2 + t) / step) % len);
  }
  // ============ 火星疯狂/月事件/Betsy FindFrame 批（2026-08-19，逐条 cs 行号）============
  // （须在上方 ai===3 战士族档之前——386 工程师 aiStyle=3 会被截胡；
  //   327 南瓜王/346 圣诞坦克/439·440 教徒的帧机有帧行记忆，由各自 AI 文件
  //   每帧写 e.customFrameIdx 直读（694 先例），不经本函数）
  // 393 飞碟炮塔（cs:72481-72494）：ai[2]=瞄准角→九向帧（ToRotationVector2 分带）；
  //   激光窗 [280,420) 且 (int)ai[3]%6<=2 → +9 射击行（bossAI_martian 393 段
  //   1:1 写 ai2=atan2 角/ai3=母碟共享计数）
  if (id === 393) {
    const ax = Math.cos(e.ai2), ay = Math.sin(e.ai2);
    let f393 = ay > Math.abs(ax) * 2 ? 4
      : ay > Math.abs(ax) * 1.5 ? (ax > 0 ? 5 : 3)
      : Math.abs(ax) > ay * 2 ? (ax > 0 ? 8 : 0)
      : Math.abs(ax) <= ay * 1.5 ? (ax > 0 ? 6 : 2)
      : (ax > 0 ? 7 : 1);
    if (e.ai3 >= 280 && e.ai3 < 420 && (e.ai3 | 0) % 6 <= 2) f393 += 9;
    return Math.min(frames - 1, f393);
  }
  // 394 飞碟火炮（cs:72495-72518）：纯 ai[3] 相位帧——窗前(420-440) 4+n/5 递进、
  //   火炮窗(440-580) (n/4)%4 四帧循环、窗尾(580-600) 7-n/5 回落、其余恒帧 4
  if (id === 394) {
    let n394 = (e.ai3 | 0) - 300;
    let f394: number;
    if (n394 >= 120) {
      n394 -= 120;
      if (n394 >= 160) f394 = 7 - Math.floor((n394 - 160) / 5);
      else if (n394 >= 20) f394 = Math.floor(n394 / 4) % 4;
      else f394 = 4 + Math.floor(n394 / 5);
    } else f394 = 4;
    return Math.min(frames - 1, f394);
  }
  // 395 飞碟母碟（cs:72520-72541）：counter 每 tick +1（66 回卷，帧=counter/6 → 0-10）；
  //   死光电报窗 ai[3]∈[20,260) 内再 +1 且钳 [36,53] → 恒落帧 6-8 蓄能辉光带。
  //   counter 副本由 bossAI_martian martianSaucerAI 累进到 e.lai0（蜂后 222 先例）
  if (id === 395) return Math.min(frames - 1, Math.floor((e.lai0 % 66) / 6));
  // 392 飞碟炮体（cs:72543-72560）：4 帧旋球 counter 每 tick +1（电报窗内 ×2）、
  //   12 回卷，帧=counter/3；副本在 bossAI_martian martianSaucerPartAI 尾段
  if (id === 392) return Math.min(frames - 1, Math.floor((e.lai0 % 12) / 3));
  // 399 火星探测器（cs:72562-72565）：counter 每 tick +0.25 四帧扫描带（0.25t/帧）；
  //   ai[0]≠0（受惊悬停/逃逸）→ +4 警戒带
  if (id === 399) {
    return Math.min(frames - 1, Math.floor((t * 0.25) % 4) + (e.ai0 !== 0 ? 4 : 0));
  }
  // 387 特斯拉炮塔（cs:72335-72368）：两帧电球——ai[0]>0 充电档 counter 每 tick
  //   +1（≥20 再 +1、≥40 再 +1，10 单位/帧）；ai[0]≤0 待机 15 单位/帧。
  //   相位取全局 t（2 帧闪切，相位任意视觉等价）
  if (id === 387) {
    const per387 = e.ai0 > 0 ? 10 / (1 + (e.ai0 >= 20 ? 1 : 0) + (e.ai0 >= 40 ? 1 : 0)) : 15;
    return Math.min(frames - 1, Math.floor(t / per387) % 2);
  }
  // 386 火星工程师（cs:72369-72402）：帧机在 bossAI_martian martianFighterExtras
  //   内逐 tick 副本（放塔期 ai2>0 帧 9/10 每 12t 交替 / 行走带 2-8 counter +=
  //   |vx|*2（无 +1）、>6 进帧——增量 >1 时越限溢出丢弃,公式折算会快进 → 须
  //   步进副本 / 站定=0 / 腾空=1）→ customFrameIdx 直读
  // 325 哀木（cs:73172-73201）：站定带 0-4 / 移动带 5-9，counter 恒 +1/t、>4 进帧
  //   （两分支同速 → counter ≡ animT，无 AI 侧状态；带切换瞬间带内相位任意，登记）
  if (id === 325) {
    return Math.min(frames - 1, e.vx === 0 ? Math.floor(t / 5) % 5 : 5 + (Math.floor(t / 5) % 5));
  }
  // 344 常世吼（cs:73144-73170）：全带 0-9，counter += max(1,|vx|*0.75)/t、>5 进帧
  //   （速率随速度变化,且增量 >1 越限溢出丢弃 → 步进副本；mourningWoodAI 维护
  //   e.lai0=counter / e.lai1=帧行）
  if (id === 344) return Math.min(frames - 1, e.lai1);
  // 345 冰雪女王（cs:73106-73143）：滑翔(ai0==0) 定帧 0 / ai3<0 半周期按 vx 向 1|2；
  //   落冰压制(ai0==1) 带 3-4 每 6t；自旋环射(ai0==2) 恒帧 5
  if (id === 345) {
    if (e.ai0 === 0) {
      if (e.ai3 >= 0) return 0;
      return e.vx < 0 ? 1 : 2;
    }
    if (e.ai0 === 1) return Math.min(frames - 1, 3 + (Math.floor(t / 6) % 2));
    if (e.ai0 === 2) return Math.min(5, frames - 1);
    return 0;
  }
  // 551 Betsy（cs:67913-68107）：帧源 = ai[1]（状态计时，betsyAI 1:1 同步）——
  //   ai0==4 空袭 / 3 吐息：起手 5(<5t)→6(<54/34t)→7/8 递进 → 喷射 9↔10 循环
  //   （fc/3%2）→ 收势 8→7→0；ai0==5 恒帧 3；ai0==6 召唤拍翼序列
  //   1,2,3,4,3,4,3,2,1,0 各 8t；其余态（悬停/风压/入场）恒帧 0
  if (id === 551) {
    const fc551 = Math.floor(e.ai1);
    if (e.ai0 === 4) {
      if (fc551 < 5) return Math.min(frames - 1, 5);
      if (fc551 < 54) return Math.min(frames - 1, 6);
      if (fc551 < 57) return Math.min(frames - 1, 7);
      if (fc551 < 60) return Math.min(frames - 1, 8);
      if (fc551 < 123) return Math.min(frames - 1, 9 + (Math.floor(fc551 / 3) % 2));
      if (fc551 < 128) return Math.min(frames - 1, 8);
      if (fc551 < 133) return Math.min(frames - 1, 7);
      return 0;
    }
    if (e.ai0 === 3) {
      if (fc551 < 5) return Math.min(frames - 1, 5);
      if (fc551 < 34) return Math.min(frames - 1, 6);
      if (fc551 < 37) return Math.min(frames - 1, 7);
      if (fc551 < 40) return Math.min(frames - 1, 8);
      if (fc551 < 98) return Math.min(frames - 1, 9 + (Math.floor(fc551 / 3) % 2));
      if (fc551 < 103) return Math.min(frames - 1, 8);
      if (fc551 < 108) return Math.min(frames - 1, 7);
      return 0;
    }
    if (e.ai0 === 5) return Math.min(3, frames - 1);
    if (e.ai0 === 6) {
      const seq551 = [1, 2, 3, 4, 3, 4, 3, 2, 1, 0];
      return Math.min(frames - 1, seq551[Math.min(9, Math.floor(fc551 / 8))]);
    }
    return 0;
  }
  // 战士族/107（L70155-70252）：站定=0；行走从帧 2 起按 |vx|*2+1 累加、>6 推进、循环回 2
  if (ai === 3 || ai === 26 || ai === 107) {
    if (!e.onGround) return frames - 1; // 腾空取末帧（原版 ai[0]==2 在 0/末帧间交替）
    if (!walking) return 0;
    const cycLen = Math.max(1, frames - 2);
    const step = Math.floor((e.walkCycleT * (Math.abs(e.vx) * 2 + 1)) / 6);
    return 2 + (step % cycLen);
  }
  // 蝶族（FindFrame case 356/444/653/661，cs:73419-73455）：拍翅四段 [0,1,2,1]
  //  （7t 档；原版 counter 加 (|vx|+|vy|)/2 速度敏感——速率随速近似取定档）。
  //  356 物种带：frame.Y += 3 帧×(ai[2]-1)（cs:73452-55）——八物种按 ai2 分带
  //  （出生加权掷/释放 Style 定；444/653/661 单物种帧表 3 帧不分带）
  if (ai === 65) {
    const anim = [0, 1, 2, 1][Math.floor(t / 7) % 4];
    if (id === 356 && e.ai2 >= 1 && e.ai2 <= 8) {
      return Math.min(frames - 1, (e.ai2 - 1) * 3 + anim);
    }
    return Math.min(frames - 1, anim);
  }
  // 海豚 615（case 615，cs:74925-74938，aiStyle 16 但有专属 case）：搁浅
  // （!wet && ai[2]==1）=帧4；否则 counter 每 tick +1（!wet +2），7t 一帧全帧循环
  if (id === 615) {
    if (!e.wet && e.ai2 === 1) return Math.min(4, frames - 1);
    return Math.floor((e.wet ? t : t * 2) / 7) % frames;
  }
  // ---- 游泳族（aiStyle 16）逐 case（此前一支通用 t/4 档通吃 = 全员 1.5 倍速;
  //      离水金鱼 4t 连闪 0..3 是用户报"金鱼鬼畜"的另一半）----
  // 鱼族 case 55（cs:74879-74924：55 金鱼/57 腐化金鱼/58 食人鱼/102 琵琶鱼/
  // 241 血浆渗透者/465 邪恶金鱼/592/607 鳉）：counter+1、6t 一档;
  // wet 帧 0..3 游姿 / !wet 帧 4/5 离水折腾
  if (id === 55 || id === 57 || id === 58 || id === 102 || id === 241
    || id === 465 || id === 592 || id === 607) {
    if (!e.wet) return Math.min(frames - 1, 4 + (Math.floor(t / 6) % 2));
    return Math.floor(t / 6) % Math.min(4, frames);
  }
  // 河鲀 688（case 688，cs:74944-74984）：鼓起 ai[2]==1 =帧4/5@6t；离水=4/5@12t；
  // 常态 wet=0..3@8t
  if (id === 688) {
    if (e.ai2 === 1 || !e.wet) return Math.min(frames - 1, 4 + (Math.floor(t / (e.ai2 === 1 ? 6 : 12)) % 2));
    return Math.floor(t / 8) % Math.min(4, frames);
  }
  // 虎鲸 692（case 692，cs:75392-75440）：wet 半表轮换（ai0==0 → 5t 否则 7t 一帧）；
  // 离水定帧 vy>0=7 / vy<0=3 / 静=1
  if (id === 692) {
    if (e.wet) return Math.floor(t / (e.ai0 === 0 ? 5 : 7)) % Math.max(1, Math.floor(frames / 2));
    return Math.min(frames - 1, e.vy > 0 ? 7 : e.vy < 0 ? 3 : 1);
  }
  // 鲨鱼 65（case 65，cs:75352-75377）：wet 帧 0..3@6t；离水冻结末态
  if (id === 65) return e.wet ? Math.floor(t / 6) % Math.min(4, frames) : Math.min(3, frames - 1);
  // 沙鲨 542-545（case 542，cs:75380-75388）：counter+1、4t 一帧 16t 循环 4 帧
  if (id >= 542 && id <= 545) return Math.floor(t / 4) % 4;
  // 其余游泳族兜底：6t 一帧全帧循环（保守档）
  if (ai === 16) return Math.floor(t / 6) % frames;
  // 水母族（FindFrame case 63/64/103/242/256，cs:74614-74650）：ai[1]==1（潜伏态，
  // 专家档 Enemy.lurking 同步 ai1）→ 帧带 [4..6] 每 5t 推进（>6 回 4、<4 抬 4 的
  // 钳带回卷）；否则 0/1/2/3 四帧 23t 循环（6/6/6/5 各档，frameCounter 23 重置）。
  // 221 鱿鱼独占档（:74652-74662，hunt 8t/帧正向钳末帧 + 慢速触发帧 0）由 Enemy
  // 侧 squidFindFrame 维护 customFrameIdx 直读（本函数顶部优先消费），不落此分支。
  // ★攻击形驱动是 ai[1] 非 localAI[2]（G7 定谳 2026-08-19：localAI[2] 在原版对
  //   水母只写不读，:24347/:24390 写入无读者）
  if (ai === 18) {
    if (e.ai1 === 1 && frames > 6) return Math.min(frames - 1, 4 + (Math.floor(t / 5) % 3));
    const ph = t % 23;
    return Math.min(frames - 1, ph < 6 ? 0 : ph < 12 ? 1 : ph < 18 ? 2 : 3);
  }
  // 克苏鲁之眼(FindFrame case 4, cs:77607-77631):0/1/2 三帧眨眼各 7 tick,
  // ai[0]>1 帧偏移 +3(张嘴形态)——门取真 ai[0](Enemy.ai0):变身段一(ai0==1)仍闭嘴帧,
  // 段二(ai0==2)起张嘴(此前挂 phase>1,变身一起手就张嘴,早了 100t)
  // EoC/双子共组（FindFrame case 4/125/126，cs:77607-77631）：7t 三帧眨眼循环
  // + ai[0]>1（变身/战斗二段）帧带 +3——双子曾落通用 6t 全帧连播（两带混闪）
  if (id === 4 || id === 125 || id === 126) {
    const blink = Math.floor(t / 7) % 3;
    return Math.min(frames - 1, blink + (e.ai0 > 1 ? 3 : 0));
  }
  // 蜂后（type 表 case 222，cs:73737-73760）：localAI[0]==1（冲刺，AI 同步 lai0）
  // → 帧 0-3 带 / 悬停 → 帧 4-11 带，每 5t 推进带内回卷（曾通用 6t 全 12 帧混播）
  if (id === 222) {
    const base = e.lai0 === 1 ? 0 : 4;
    const span = e.lai0 === 1 ? 4 : Math.min(8, frames - 4);
    return base + (Math.floor(t / 5) % span);
  }
  // 世纪之花本体（case 262，cs:73239-73258）：血量分带——>50% 帧 0-3、
  // ≤50% 钳 4-7（二阶段），每 7t 推进带内回卷（曾通用 6t 全 8 帧混播）
  if (id === 262) {
    const phase2 = e.hp <= e.maxHp / 2;
    const base = phase2 ? 4 : 0;
    const span = Math.min(4, frames - base);
    return base + (Math.floor(t / 7) % span);
  }
  // 克苏鲁之脑（FindFrame case 266，cs:73215-73237）：frameCounter>6 推进
  // （7t/帧，cs:73216-73221）；一相（ai[0]>=0 且 localAI[2]==0）循环 0..3，
  // 二相 4..7（低于 4 抬到 4、越 7 回卷 4）——此前走末尾通用档全 8 帧连播
  if (id === 266) {
    const idx = Math.floor(t / 7) % 8;
    const phase2 = e.ai0 < 0 || e.lai2 !== 0;
    return phase2 ? Math.max(4, idx) : Math.min(3, idx);
  }
  // 克眼仆从(FindFrame case 5, cs:77633-77643):frameCounter 每 8t 推进一帧、
  // 越界回卷帧 0（此前走末尾通用 6t 档,快了 1/3）
  if (id === 5) {
    return Math.floor(t / 8) % frames;
  }
  // 训练假人 488（FindFrame case 488，cs:71516-71544）：摇晃动画帧由受击强度驱动——
  // num140 = 方向==-1 ? 4 : 6；帧 = ceil(shake/num140)（dir==1 再 +5）；shake 每帧 -1。
  // NPC 自身不画贴图（tile 378 是视觉本体）——完整 1:1（含 tile 变体朝向翻转
  // :71518-71520）在 drawDummyTileAnim 覆盖层；此处仅作公式参照
  if (id === 488) {
    const dir = e.dummyHitDir;
    const step = dir === -1 ? 4 : 6;
    let idx = Math.ceil(e.dummyShake / step);
    if (idx > 0 && dir === 1) idx += 5;
    return Math.min(frames - 1, idx);
  }
  // 血肉墙 113/之眼 114（FindFrame case 113/114，cs:74214-74233）：ai[2]==0 时
  // frameCounter 每 12t 推进一帧、越 npcFrameCount(均 2) 回卷；ai[2]!=0 → 锁帧 0
  // 且 frameCounter=-60（回合结束后需再攒 72t 才回动画——无状态引擎近似为立即恢复，
  // 差异登记：113 的 ai[2] 是 Leech 放虫轮(bossAI_wof)，放虫期间嘴部定帧=原版吐虫姿势）
  if (id === 113 || id === 114) {
    if (e.ai2 !== 0) return 0;
    return Math.floor(t / 12) % Math.max(1, Math.min(2, frames));
  }
  // 饥饿者 115（FindFrame case 115，cs:75695-75712）：counter 先 +1 再比阈值
  // （1..15）：1-2→0 / 3-5→1 / 6-11→2 / 12-14→1，15 回卷——0→1→2→1 乒乓嚼动
  if (id === 115) {
    const p = (Math.floor(t) % 15) + 1;
    return p < 3 ? 0 : p < 6 ? 1 : p < 12 ? 2 : 1;
  }
  // 饥饿者 II 116（FindFrame case 116，cs:74789-74808）：counter 每 5t 推进、
  // 越 npcFrameCount(6) 回卷全帧；rotation=atan2(vy,vx)（vx<0 再 +π，drawEnemy
  // 独占分支）——此前落通用 6t 档（节奏差 20%）
  if (id === 116) {
    return Math.floor(t / 5) % Math.max(1, frames);
  }
  // 腐化者 133（FindFrame case 133，cs:74761-74788）：counter 1-7→0 / 8-15→1 /
  // 16→0 并回卷；血 <50% 帧 +2（狂暴形态——floatEyeAI rage 档的视觉面）
  if (id === 133) {
    const p = (Math.floor(t) % 16) + 1;
    return Math.min(frames - 1, (p >= 8 && p < 16 ? 1 : 0) + (e.hp < e.maxHp * 0.5 ? 2 : 0));
  }
  // 机械骷髅王头 127（FindFrame case 127，cs:75196-75231）：ai[1]==0（悬浮段）=
  // 帧 {0,1} 每 12t 循环（眨眼）；ai[1]!=0（旋冲/白天狂暴/离场）= **恒定帧 2**
  // （旋冲脸，counter 清零不推进）。MechQueen 合体态（IsMechQueenUp）走 3-5 帧
  // 分支（:75197-75212）：悬浮 0→1→2→3→4 爬坡后 3↔4 每 12t 循环、ai[1]!=0 恒帧 5。
  // 曾落通用 6t 档 → 6 帧连播=一/二阶段动画混播（2026-08-14 用户报告）。
  // 状态近似：无引擎态计数器，12t 相位取全局 t（重进悬浮段时相位任意，差 <12t）
  if (id === 127) {
    if (mechQueenUp()) {
      if (e.ai1 === 0) {
        const k = Math.floor(t / 12);
        return k <= 4 ? k : 3 + ((k - 5) % 2 === 0 ? 0 : 1);   // 爬坡 0..4 后 3↔4
      }
      return 5;                                                 // :75207-75210 恒帧 5
    }
    if (e.ai1 === 0) return Math.floor(t / 12) % 2;
    return 2;
  }
  // Prime 锯臂 129 / 激光臂 130（cs:75235-75264）：每 2t / 每 8t 推进、越帧数回卷
  // （曾落通用 6t 档：锯慢 3 倍、激光快 33%）；钳 128/炮 131 无 case=恒帧 0
  //（frames=1，通用档亦恒 0，无需特判）
  if (id === 129) return Math.floor(t / 2) % Math.max(1, frames);
  if (id === 130) return Math.floor(t / 8) % Math.max(1, frames);
  // 法师族三态帧（case 29/32/45/172/281-286/693，cs:77721-77743）：帧0 待机 /
  // 帧1 蓄力（vy==0 且 ai[1]>0——含传送后 ai[1]=20 的 20t 后摇，原版同）/ 帧2 腾空
  // （vy≠0）；32 且 RedHat 变体（localAI[3]==1：红帽骷髅王 ai[3]==1 在场时 AI 段
  // cs:20777-20784 置位永不清）整带 +3——贴图表 6 帧=上半 0-2 常态兜帽、下半 3-5
  // 红帽形态。曾落通用 6t 全循环档 → 32 六帧连播=两种头饰形态混播（2026-08-17 用户报告）
  if (CASTER_STATE_FRAME_TYPES.has(id)) {
    let f = e.vy !== 0 ? 2 : (e.ai1 > 0 ? 1 : 0);
    if (id === 32 && e.lai3 === 1) f += 3;
    return Math.min(frames - 1, f);
  }
  // 火妖 24（FindFrame case 24，cs:77681-77719）：待机/行走带 0-3 每 6t 循环
  // （无站定门，恒转）；蓄力（ai[1]>0）切攻击带 4-9——进带清零推进、每 6t 一帧、
  // 末帧 9 钳住不回卷。无状态近似：以蓄力倒计时反推进度（elapsed=30-ai[1]，30 为
  // 蓄力起点；传送置 5 的 5t 内会错取带内高帧，差异登记——彼时被 50 颗传送尘遮挡）
  if (id === 24) {
    if (e.ai1 > 0) return Math.min(9, 4 + Math.floor((30 - e.ai1) / 6));
    return Math.floor(t / 6) % 4;
  }
  // 沙漠幽魂 533（FindFrame case 533，cs:70647-70661）：counter 0-48 循环、帧=
  // floor(counter/6)（0-7 每 6t）；蓄力（ai[1]>0）整带 +8（表 16 帧=待机 8+攻击 8。
  // 曾落通用 6t 档 → 16 帧连播两带混播）。相位取全局 t（%48），带切换时相位任意（差<48t）
  if (id === 533) return (e.ai1 > 0 ? 8 : 0) + Math.floor((t % 48) / 6);
  // 鸟族 74/297/298/442（FindFrame case 74,cs:74326-74350）：站定(vx==0&&vy==0)=
  // 帧 4 收翅站立;移动/飞行=帧 0..frames-2 每 4t 推进(回卷 frames-1→0——末帧行
  // =站立帧不参与循环)。曾落末尾通用 6t 全帧循环 → 落地也播飞行动画(2026-08-18 报)
  if (id === 74 || id === 297 || id === 298 || id === 442) {
    if (e.vx === 0 && e.vy === 0) return Math.min(4, frames - 1);
    return Math.floor(t / 4) % Math.max(1, frames - 1);
  }
  // 丛林鸟族 671-675（case 671,cs:74352-74377）：站定=帧 0;移动/飞行=帧 1..frames-1
  // 每 4t 推进(回卷 frames→1,首帧行=站立不参与循环)
  if (id >= 671 && id <= 675) {
    if (e.vx === 0 && e.vy === 0) return 0;
    return 1 + Math.floor(t / 4) % Math.max(1, frames - 1);
  }
  // 鸮族 611/689（case 611,cs:74379-74443）：站定=8 帧转头待机(三段 40t 序列
  // {0,1,2,1}/{0,3,4,3}/{0,5,6,7} 各帧 10t;原版随机换段/1-80 跳帧近似为顺序轮播,
  // 差异登记);移动/飞行=帧 8..frames-1 每 5t(<8 抬回 8)。表 13 帧=待机 8+飞行 5
  if (id === 611 || id === 689) {
    if (e.vx === 0 && e.vy === 0) return owlIdleFrame(e);
    return 8 + Math.floor(t / 5) % Math.max(1, frames - 8);
  }
  // 萤火虫族 355/358/654（case 355,cs:73369-73390）：counter<4→帧0/否则帧1（≥7 回卷
  // = 4t 亮 3t 闪）；非发光期(lai1≤0)整带 +2（暗带,localAI[2] 门——lai1=本仓发光剩余）
  if (id === 355 || id === 358 || id === 654) {
    const blink = (t % 7) < 4 ? 0 : 1;
    return Math.min(frames - 1, blink + (e.lai1 <= 0 ? 2 : 0));
  }
  // 精灵萤 677（case 677,cs:73391-73402）：counter 每 tick +2、≥6 回卷 → 每 3t 推进
  // 精灵萤 677（case 677,cs:73391-73402）：frameCounter 双 +=1（反编译）= 每 3t 一帧；
  // frame.Y 0..4 循环（>=5 回卷）= 5 帧。贴图 NPC_677 88×110 = 5 帧×22（110/5 整）；
  // ★曾按 npcFrameCount[677]=4 切 27.5px 非整帧 → 帧边界漂移拼接错影
  // （2026-08-21 用户报"微光湖上方怪异贴图/动画调度问题"实抓）。帧 4 在原版因
  // frame.Height=27 越界裁剪几乎不可见，本仓按贴图真实 5 帧全显（视觉更完整）。
  if (id === 677) return Math.floor(t / 3) % 5;
  // 蜻蜓族 595-601（case 595,cs:73403-73419）：每 3t 一帧全帧循环
  if (id >= 595 && id <= 601) return Math.floor(t / 3) % Math.max(1, frames);
  // 蚯蚓族 357/448/484/606（case 357,cs:73455-73509）：腾空=帧1（+direction*0.1/t
  // 累积自旋,渲染 spin 未接备案）;地面静止=帧1;爬行 0↔1 每 12t 摆动
  if (id === 357 || id === 448 || id === 484 || id === 606) {
    if (e.vy !== 0 || e.vx === 0) return Math.min(1, frames - 1);
    return Math.floor(t / 12) % Math.min(2, frames);
  }
  // 蛆虫族 485/486/487（case 485,cs:73511-73565）：地面静止=帧1;爬行 counter
  // +=|vx|*5 >10 推进、0..3 循环（walkCycleT 按 |vx| 累加等价折算）;腾空=帧1
  if (id === 485 || id === 486 || id === 487) {
    if (e.vy !== 0 || e.vx === 0) return Math.min(1, frames - 1);
    return Math.min(frames - 1, Math.floor((e.walkCycleT * 5) / 10) % 4);
  }
  // 瓢虫 604/605 + 椿象 669（case 604,cs:67616-67652）：移动时每 2t 一帧;地面
  // 循环 0-3、腾空循环 4-7（表 8 帧）;静止 counter 冻结（近似取 0 差异登记）
  if (id === 604 || id === 605 || id === 669) {
    const k = Math.floor(t / 2) % 4;
    return Math.min(frames - 1, e.vy === 0 ? k : 4 + k);
  }
  // 水鸟族 363/365/603/609（case 363,cs:74470-74545）：湿态=帧 1↔2 每 8t（划水）;
  // 站定(vx==0&&vy==0)=帧1;飞行/移动=帧 11..frames-1 每 4t（回卷 frameCount→11）
  if (id === 363 || id === 365 || id === 603 || id === 609) {
    if (e.wet) return 1 + (Math.floor(t / 8) % Math.min(2, Math.max(1, frames - 1)));
    if (e.vx === 0 && e.vy === 0) return Math.min(1, frames - 1);
    return Math.min(frames - 1, 11 + (Math.floor(t / 4) % Math.max(1, frames - 11)));
  }
  // 珍稀宝箱怪 473-476（case 473,cs:71831-72000）：ai0 0/7=伪装帧0（曾落通用档
  // 14 帧连播 = 伪装态狂闪）;ai0 1=警戒帧1-5 按 ai1/6 分段(+6 兜底);ai0 8=3+(t/6)
  // 钳 3-6;ai0 4/5=帧13;ai0 2/6 地面走=8/9 每 8t + 周期眨眼 10-12（状态机序列
  // 近似为 24t 走/24t 眨穿插,ai0 3 回落帧 7 近似——差异登记）
  if (id >= 473 && id <= 476) return mimicFrame(e, frames);
  // 月总头 396（FindFrame case 396，cs:72628-72642）：counter 每 tick +1（另有 10%
  // 概率再 +1 的抖动不可从全局 t 复现，差异登记）、≥32 回卷；帧 = counter/4 →
  // 0-7 八帧循环（3×3 网格第 9 帧不参与——曾按 9 帧@6t 连播含空帧行且速度错 1.5×）
  if (id === 396) return Math.floor(t / 4) % 8;
  // 月总游离眼 400（FindFrame case 400，cs:72650-72664）：counter 每 tick +1，
  // ai[0]∈{0,3}（悬停/洒射）再 +1 = 2t 一帧、否则 4t；≥16 回卷 → 帧 0-3
  if (id === 400) return Math.floor(t / (e.ai0 === 0 || e.ai0 === 3 ? 2 : 4)) % 4;
  // 仙灵三色 583-585（FindFrame case 583-585，cs:70617-70630）：4t 一帧全循环
  // （曾落 6t 兜底=拍翅慢 1.5×,2026-09-02 用户实报神圣精灵动画不对）
  if (id === 583 || id === 584 || id === 585) return Math.floor(t / 4) % frames;
  // 毁灭者体节 135（FindFrame case 135，NPC.cs:74229-74237）：ai[2]==0 → 亮帧 0 /
  // 非 0 → 灭帧 1。★1457 全文无体节 ai[2] 写入点（AI_037 仅 :50453 读取，:51034 为
  // 探针 139 自用）→ 原版实际恒亮帧 0（灭帧分支不可达预留）；本仓 destroyerAI 同样
  // 不写 ai2 → 恒帧 0。此前落入通用 6t 全帧循环 = 亮/灭两帧间闪跳（用户实报）。
  // 头 134/尾 136 frames=1，任何循环都恒帧 0，无需分支。
  if (id === 135) return e.ai2 === 0 ? 0 : Math.min(1, frames - 1);
  // 其余（眼/蜂群/幽灵/蠕虫段等）：每 6 tick 全循环
  return Math.floor(t / 6) % frames;
}

// ---- 光标图标 GetItemLight 特殊物品（ItemSlot.cs:3475-3507）----
/** 迪斯科族（:3475-3490）:662/663 彩虹砖块系 + 5444/5450/5643 + 5128 → Main.Disco */
const CURSOR_DISCO_ITEMS = new Set([662, 663, 5444, 5450, 5643, 5128]);
/** ItemIconPulse 族（:3491-3496,ItemID.cs:1100）:微光脉冲 × Main.essScale */
const CURSOR_PULSE_ITEMS = new Set([520, 521, 575, 549, 548, 547, 3456, 3457, 3458, 3459, 3580, 3581]);
/** 精华族（:3497-3507）:58/184/4143 → essScale×0.25+0.75 */
const CURSOR_ESS_ITEMS = new Set([58, 184, 4143]);

/** 图标矩形乘色（离屏三步:draw → multiply → destination-in 恢复 alpha）。
 *  ★禁止在主画布直接 source-atop——作用于整张已渲染画布=黑方块（2026-08-18 事故） */
const tintScratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function tintIconRect(
  ctx: CanvasRenderingContext2D,
  icon: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
  dst: { x: number; y: number; w: number; h: number },
  tint: readonly [number, number, number],
): void {
  if (!tintScratch) return;
  if (tintScratch.width !== dst.w || tintScratch.height !== dst.h) {
    tintScratch.width = dst.w;
    tintScratch.height = dst.h;
  }
  const octx = tintScratch.getContext('2d');
  if (!octx) return;
  octx.clearRect(0, 0, dst.w, dst.h);
  octx.imageSmoothingEnabled = false;
  octx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, 0, 0, dst.w, dst.h);
  octx.globalCompositeOperation = 'multiply';
  octx.fillStyle = `rgb(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0})`;
  octx.fillRect(0, 0, dst.w, dst.h);
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, 0, 0, dst.w, dst.h);
  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(tintScratch, dst.x, dst.y);
}

// ============ 2D 网格贴图 NPC 帧引擎（FindFrame 大 switch 专属 case，NPC.cs:67295+） ============
// 这些 NPC 的贴图是【cols×rows 二维网格】而非纵向帧条，通用 vnpc 竖切会把整行画出来
// （画错成多倍宽）。帧索引状态机按原版 FindFrame 逐 case 1:1，供 drawNpcGrid 切格。
// 状态 {counter,idx} 由 Renderer 持 WeakMap（每 draw 调用 = 每 tick 推进一次，
// 等价原版 FindFrame 每 update 调一次）。
export interface NpcGridFrameState { counter: number; idx: number }

/** 657 水晶核 Extra_186 Y 偏移表（Main.cs :23950-23986 switch(num100)，键=帧索引）。
 *  王冠 Extra_177 表同值唯 idx=6 反号（冠 +10 / 核 −10,:24003-24005），消费侧差分补正 */
const QUEEN_SLIME_CORE_Y_OFF: Record<number, number> = {
  1: -10, 6: -10, 3: 10, 5: 10, 4: 18, 12: 18, 13: 18, 14: 18, 15: 18,
  7: -14, 8: -14, 9: -16, 10: -18, 11: 20, 20: -14, 21: -18, 23: -18, 22: -22,
};

/** 657 史莱姆皇后（FindFrame case 657，NPC.cs:67503-67614）。
 *  flag13 = life≤lifeMax/2（二段）；noGravity 为 AI 侧动态位，渲染层以
 *  `half && ai0==0`（二段待机=飞行，bossAI_lategame queenSlimeAI flying 同款判定）近似。
 *  - 上升（(half&&飞行) || vy<0）：一段 4→7 每 4t（半血转 22 进二段循环）；
 *    二段 20→23 每 5t 循环
 *  - 下降（vy>0）：8→10 每 8t，停 10
 *  - 落地（vy==0）：ai0==5 → 13/14/15 按 ai1/3%3；ai0==4 → 12/11/10 按 ai1/15；
 *    否则 0→3 每 6t 循环（若从空中来先 10→12 每 6t 再回 0）
 */
export function queenSlimeNextFrame(
  s: NpcGridFrameState, o: { half: boolean; flying: boolean; vy: number; ai0: number; ai1: number },
): number {
  let idx = s.idx;
  const rising = (o.half && o.flying) || o.vy < 0;
  if (rising) {
    if (idx < 20 || idx > 23) {
      if (idx < 4 || idx > 7) { idx = 4; s.counter = -1; }
      if (++s.counter >= 4) { s.counter = 0; idx++; if (idx >= 7) idx = o.half ? 22 : 7; }
    } else if (++s.counter >= 5) { s.counter = 0; idx++; if (idx >= 24) idx = 20; }
  } else if (o.vy > 0) {
    if (idx < 8 || idx > 10) { idx = 8; s.counter = -1; }
    if (++s.counter >= 8) { s.counter = 0; idx++; if (idx >= 10) idx = 10; }
  } else {
    if (o.ai0 === 5) {
      s.counter = 0;
      idx = [13, 14, 15][Math.trunc(o.ai1 / 3) % 3] ?? 13;
    } else if (o.ai0 === 4) {
      s.counter = 0;
      const k = Math.trunc(o.ai1 / 15);
      idx = k === 1 ? 11 : (k === 2 || k === 3) ? 10 : 12;
    } else {
      const fromAir = idx >= 10 && idx <= 12;
      const step = fromAir ? 6 : 10;
      if (!fromAir && idx >= 4) { idx = 0; s.counter = -1; }
      if (++s.counter >= step) {
        s.counter = 0;
        idx++;
        if ((!fromAir || idx === 13) && idx >= 4) idx = 0;
      }
    }
  }
  s.idx = idx;
  return idx;
}

/** 576/577 DD2 食人魔（FindFrame case 576/577，NPC.cs:68241-68380）。
 *  frame.Y 存的是【索引】（0..47）：ai0>0&&ai1==0 走路 11→20（持 4；13/19=8、14/18=2）；
 *  ai1==2 攻击 37→47（持 5；42=6、45=8、46=4、47=26、37/38=7；46&&vy!=0 或 38 不推进）；
 *  ai1==1 施法 21→38 持 5；默认：腾空=43、站定=0、行走 1..10 按 |vx| 累加（60 循环） */
export function dd2OgreNextFrame(
  s: NpcGridFrameState, o: { ai0: number; ai1: number; vx: number; vy: number },
): number {
  let idx = s.idx;
  if (o.ai0 > 0 && o.ai1 === 0) {
    if (idx < 11 || idx > 20) { idx = 11; s.counter = 0; }
    let hold = 4;
    if (idx === 13 || idx === 19) hold = 8;
    if (idx === 14 || idx === 18) hold = 2;
    if (++s.counter >= hold && idx < 20) { s.counter = 0; idx++; }
  } else if (o.ai0 > 0 && o.ai1 === 2) {
    if (idx < 37 || idx > 47) { idx = 39; s.counter = 0; }
    let hold = 5;
    if (idx === 42) hold = 6;
    if (idx === 45) hold = 8;
    if (idx === 46) hold = 4;
    if (idx === 47) hold = 26;
    if (idx === 37 || idx === 38) hold = 7;
    // flag12：46 腾空悬停 / 38 起手不推进（帧冻结）
    let advance = true;
    if (idx === 46 && o.vy !== 0) advance = false;
    if (idx === 38) advance = false;
    if (advance) s.counter++;
    if (s.counter >= hold) {
      if (idx < 47) { s.counter = 0; idx++; }
      else { idx = 37; s.counter = 0; }
    }
  } else if (o.ai0 > 0 && o.ai1 === 1) {
    if (idx < 21 || idx > 38) { idx = 21; s.counter = 0; }
    if (++s.counter >= 5 && idx < 38) { s.counter = 0; idx++; }
  } else {
    if (o.vy !== 0) { s.counter = 0; idx = 43; }
    else if (o.vx === 0) { s.counter = 0; idx = 0; }
    else {
      s.counter += Math.abs(o.vx);
      if (s.counter >= 60 || s.counter < 0) s.counter = 0;
      idx = 1 + Math.floor(s.counter / 6);
    }
  }
  s.idx = idx;
  return idx;
}

/** 696（FindFrame case 696，NPC.cs:67332-67388）：ai0==1 → 0..8 每 4t 循环；
 *  ai0==2 → 45..53 每 4t 循环；默认 9..17 每 10t 循环 */
export function npc696NextFrame(s: NpcGridFrameState, o: { ai0: number }): number {
  let idx = s.idx;
  if (o.ai0 === 1) {
    if (idx < 0 || idx >= 8) idx = 0;
    if (++s.counter >= 4) { s.counter = 0; if (++idx >= 8) idx = 0; }
  } else if (o.ai0 === 2) {
    if (idx < 45 || idx >= 53) idx = 45;
    if (++s.counter >= 4) { s.counter = 0; if (++idx >= 53) idx = 45; }
  } else {
    if (idx < 9 || idx >= 17) idx = 9;
    if (++s.counter >= 10) { s.counter = 0; if (++idx >= 17) idx = 9; }
  }
  s.idx = idx;
  return idx;
}

/** 564/565 等离子灯/暗黑魔法师（FindFrame case 564/565，NPC.cs:68657-69085）。
 *  原版是一长串 `if (frameCounter >= step*n) y3 = 帧` 阈值链——等价于每帧 step tick
 *  的定长序列循环（序列尾清 counter）。循环长度与施法时长对齐（97/127/183 → 98/128/184t）。
 *  - ai0>0&&ai1==0 暗影矢：[5,6,7,5,6,7,5,6,7,8,9,10,11,12] 每 7t
 *  - ai0>0&&ai1==1 治疗：[13,14,15,16,17,18,19,20,18,19,20,21,22,23,24,25] 每 8t
 *  - ai0>0&&ai1==2 召骷髅：[26,27,28,29,26,27,28,29,26,27,28,29,30..40] 每 8t
 *  - 默认漂浮：counter += |v|*0.1+1（钳 0..40），帧 0..4 每 8t */
const DARK_MAGE_CAST_SEQ: Record<number, number[]> = {
  0: [5, 6, 7, 5, 6, 7, 5, 6, 7, 8, 9, 10, 11, 12],
  1: [13, 14, 15, 16, 17, 18, 19, 20, 18, 19, 20, 21, 22, 23, 24, 25],
  2: [26, 27, 28, 29, 26, 27, 28, 29, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
};
export function darkMageNextFrame(
  s: NpcGridFrameState, o: { ai0: number; ai1: number; speed: number },
): number {
  let idx = s.idx;
  const seq = o.ai0 > 0 ? DARK_MAGE_CAST_SEQ[o.ai1] : undefined;
  if (seq) {
    const per = o.ai1 === 0 ? 7 : 8;
    // 入段越界（idx 不在本招帧区）→ 清 counter 重放（原版 if (y3<min||y3>max) frameCounter=0）
    if (idx < seq[0] || idx > seq[seq.length - 1]) s.counter = 0;
    if (++s.counter >= per * seq.length) s.counter = 0;
    idx = seq[Math.min(seq.length - 1, Math.floor(s.counter / per))];
  } else {
    s.counter = s.counter + o.speed * 0.1 + 1;
    if (s.counter >= 40 || s.counter < 0) s.counter = 0;
    idx = Math.floor(s.counter / 8);
  }
  s.idx = idx;
  return idx;
}

/** 668 鹿角怪（FindFrame case 668，1457 NPC.cs:67543-67579 + :6516-6534 序列表）。
 *  1457 重做：攻击态（ai0==1/2/3/4/5/7/8）帧计数直接读 ai[1]（AI 同步相位，
 *  `frameCounter = ai[1]`）——删除 1456 的本地 counter 自增与"入场 y 钳位+尖叫"块
 *  （尖叫移入 AI,1457 全 AI 8 处）。每 4t 走一格、FindFrame_FromSequence 钳末帧。
 *  默认：vy>0（或 localAI[0]==1，未移植略）→ 帧 1；vx==0 → 帧 0；
 *  行走 counter += |vx|（钳 150）、帧 = 2+counter/15（2..11） */
const DEERCLOPS_ATK1_FRAMES = [12, 13, 14, 13, 14, 13, 14, 13, 14, 15, 16, 17];
const DEERCLOPS_ATK2_FRAMES = [12, 15, 16, 17, 17, 17, 17, 13, 18, 18, 18, 18, 12];
const DEERCLOPS_ATK3_FRAMES = [19, 20, 21, 22, 21, 22, 21, 22, 23, 24, 23, 24, 23, 24, 20, 19];
export function deerclopsNextFrame(
  s: NpcGridFrameState, o: { ai0: number; ai1?: number; vx: number; vy: number; lai0?: number },
): number {
  let idx = s.idx;
  // 各攻击段入段越界范围（原版 num194/num195 等显式常量，非表尾值——攻击 2 表
  // 尾是 12、攻击 3 表尾是 19，按表尾判会误清 counter 造成 12,15,12,15 抖动）
  const atk = o.ai0 === 1 || o.ai0 === 4 ? { seq: DEERCLOPS_ATK1_FRAMES, lo: 12, hi: 17 }
    : o.ai0 === 2 ? { seq: DEERCLOPS_ATK2_FRAMES, lo: 12, hi: 18 }
      : o.ai0 === 3 || o.ai0 === 5 || o.ai0 === 7 || o.ai0 === 8 ? { seq: DEERCLOPS_ATK3_FRAMES, lo: 19, hi: 24 }
        : null;
  if (atk) {
    // 1457 :67548/:67555/:67562/:67570：frameCounter = ai[1]（AI 相位直读,
    // 多人帧同步锚;单人 = 攻击态首拍起 4t/格,与旧本地自增同形但不再漂移）
    s.counter = o.ai1 ?? 0;
    idx = atk.seq[Math.min(atk.seq.length - 1, Math.floor(s.counter / 4))];
  } else if (o.vy > 0 || o.lai0 === 1) {   // 跳跃帧(含上升段 lai0=1,曾只判下落)
    s.counter = 0;
    idx = 1;
  } else if (o.vx === 0) {
    s.counter = 0;
    idx = 0;
  } else {
    s.counter += Math.abs(o.vx);
    if (s.counter >= 150 || s.counter < 0) s.counter = 0;
    idx = 2 + Math.floor(s.counter / 15);
  }
  s.idx = idx;
  return idx;
}

// ==================== 拾取飘字命中盒度量（PopupText.GetTextHitbox :751-758）====================
// 原版 = FontAssets.MouseText.MeasureString(displayText)×scale、Y×0.8。本仓 label 类
// 实绘字体 = 13px sans-serif（drawDmgNumbers label 支,下方 POPUP_LABEL_FONT_PX 单一
// 事实源）——命中盒度量必须与实绘同源（红队R3①:曾用 Combat_Text 位图度量,未知
// 字形 8px/字、盒高 24,与可见文本盒错位 → 互推判定偏移）。XNA MeasureString 返回
// 未缩放布局盒(高 = LineSpacing,与内容无关) → 本仓同构:基准 13px 度量缓存,×scale
// 与 Y×0.8 留在消费侧（Game.popupLabelStep）。

/** 拾取飘字实绘字号（label 支 draw 与命中盒度量共用） */
export const POPUP_LABEL_FONT_PX = 13;

/** 实绘字体串（Math.max(1,round(px)) 与 label 支旧行为逐值一致） */
export const popupLabelFont = (px: number): string =>
  `${Math.max(1, Math.round(px))}px sans-serif`;

const popupMeasureCtx: CanvasRenderingContext2D | null = typeof document !== 'undefined'
  ? document.createElement('canvas').getContext('2d') : null;
const popupLabelMeasureCache = new Map<string, { w: number; h: number }>();

/** 13px sans-serif 文本盒度量（GetTextHitbox 度量源;w = measureText 宽,h = 行盒
 *  [XNA LineSpacing 同构,fontBoundingBox 探针,与内容无关]。node/无 canvas 环境
 *  走定宽表兜底——仅供测试环境,生产路径恒 canvas 度量） */
export function popupLabelMeasure(text: string): { w: number; h: number } {
  const hit = popupLabelMeasureCache.get(text);
  if (hit) return hit;
  let m: { w: number; h: number };
  if (popupMeasureCtx && typeof popupMeasureCtx.measureText === 'function') {
    popupMeasureCtx.font = popupLabelFont(POPUP_LABEL_FONT_PX);
    const probe = popupMeasureCtx.measureText('Mg');
    const fh = (probe.fontBoundingBoxAscent ?? probe.actualBoundingBoxAscent)
      + (probe.fontBoundingBoxDescent ?? probe.actualBoundingBoxDescent);
    m = { w: popupMeasureCtx.measureText(text).width, h: fh > 0 ? fh : POPUP_LABEL_FONT_PX * 1.15 };
  } else {
    let w = 0;
    for (const ch of text) w += ch.charCodeAt(0) > 0xff ? POPUP_LABEL_FONT_PX : 7;
    m = { w, h: POPUP_LABEL_FONT_PX * 1.15 };
  }
  if (popupLabelMeasureCache.size > 512) popupLabelMeasureCache.clear();
  popupLabelMeasureCache.set(text, m);
  return m;
}

/** 飘字。数字类 1:1 CombatText.cs（spawn: NewText:59-121 / update: Update:131-206）:
 *  vy 普通恒 -7/t、暴击 -14/t、dot -4/t;life 60/120/40;scale 从 0 每 t+0.1 长到 1
 *  （dot +0.5 封顶 0.8）;alpha 0.6~1 闪烁;寿命归零后 scale 收缩至 0.1 消亡。
 *  label 类（物品名）不走原版链,保持旧轨迹,新字段可缺省 */
export interface DamageNumber {
  x: number; y: number; vy: number; value: number; crit: boolean; color: string; life: number;
  label?: string;
  /** 拾取飘字（PopupText.NewText Item 分支）专属：合并身份键 = item key */
  pickupKey?: string;
  /** 累计计数（同名拾取合并 stack+=picked；PrepareDisplayText >1 时 "名 (N)"） */
  stack?: number;
  /** 钱币飘字（71-74）：跨面额合并、文本 = ValueToName 面值、stack 恒 1 */
  coinText?: boolean;
  coinValue?: number;
  /** 水平漂移（暴击 NewText ±1.25）;缺省 0 */
  vx?: number;
  /** dot 飘字（HurtLifeRegen/中毒族 DoT:更小更短,带重力） */
  dot?: boolean;
  /** 字号缩放（NewText scale=0 起,Update 每 t+0.1/0.5）;缺省 1=恒定 */
  scale?: number;
  /** 闪烁 alpha 0.6~1（Update ±0.05/t）;缺省 1 */
  alpha?: number;
  alphaDir?: number;
  /** 暴击旋转（NewText 0.12rad 起,Update ±0.001/t 漂移） */
  rotation?: number;
}

/** 小地图恒忽略油漆的墙集（MapHelper.GetWallType :1993-2005：21/88-93/168/241）。
 *  这些是自带渐变/特殊贴图的墙（天然/地牢分段墙族），原版在地图上不吃漆 */
const MAP_WALL_NO_PAINT = new Set([21, 88, 89, 90, 91, 92, 93, 168, 241]);

/** 小地图恒忽略油漆的 tile sheet（MapHelper.GetTileType :1965-1968：num==160 → newColor=0） */
const MAP_TILE_NO_PAINT_SHEET = 160;

/** 内部 tile id → 原版 sheet（redrawAll 热循环直查；-1 = 无映射） */
const TILE_SHEET_OF: Readonly<Int16Array> = (() => {
  const a = new Int16Array(TILE_DEFS.length);
  for (let i = 0; i < TILE_DEFS.length; i++) a[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
  return a;
})();

export class Minimap {
  /** 实例序号(GL 全屏地图纹理键;切世界换实例即换键自动重传) */
  private static uidGen = 0;
  readonly uid = ++Minimap.uidGen;
  /** ★CPU 像素后备(2026-08-18 GPU 预算瘦身):整幅小地图(大世界 80MB)曾是
   *  GPU 画布后备——Chrome 画布表面计入 GPU 进程预算,是双开 contextlost 风暴
   *  的常驻大头。改纯 CPU 内存(pix):HUD 缩略图只 blit 可见小窗(~≤512² ≈1MB
   *  GPU),全屏地图打开期才整幅上传 GL 纹理、关闭即释放。像素语义零变化
   *  (小端 ABGR Uint32 直写,与旧 fillBand 约定一致) */
  readonly w: number;
  readonly h: number;
  pix: Uint8ClampedArray | null = null;
  /** pix 的 ImageData 包装(共享 buffer;GL 上传源。node 测试环境无 ImageData
   *  则为 null——测试只读 pix) */
  image: ImageData | null = null;
  /** Uint32 视图(HUD blit/全屏地图消费方共用) */
  p32: Uint32Array | null = null;
  dirtyChunks = new Set<number>();
  /** 本帧 flushDirty 实际重画的像素区 [px,py,w,h](GL 地图纹理 texSubImage2D
   *  增量上传消费,消费方清空;上限=flushDirty 每帧 24 chunk) */
  flushedPixelRects: Array<[number, number, number, number]> = [];
  /** ★PR-async 收口③（2026-09-03）：rect 溢出不再 splice 丢弃（丢弃=GL 纹理永久
   *  残缺——肉山转换洪峰 288+ chunk-rect 挤爆 128 上限,M 图打开时只剩尾部 128 个
   *  补上=用户实报"小地图残缺+一点点慢慢更新"）。溢出改置【全幅重传标记】,消费端
   *  整幅 texSubUpdateData 一次覆盖（含全部被丢增量）✓ 位级无漂移。 */
  needsFullUpload = false;
  /** ★单调地图版本（PR-async 收口④）：每次 flushDirty 实际重画即 +1——消费端
   *  （fm2dMapEnsure 2D 门）以此判定重灌。★勿用 dirtyChunks.size 当版本：
   *  洪峰期「+N 脏区/帧 ≈ −N 消化」可使 size 连续同值 → 2D 地图冻结
   *  （用户实报"小地图缓慢一点点更新+残缺"的第二病灶,2026-09-03）。 */
  mapVersion = 0;
  constructor(public world: World, deferBuild = false) {
    this.w = world.w;
    this.h = world.h;
    const pix = new Uint8ClampedArray(world.w * world.h * 4);
    this.pix = pix;
    this.p32 = new Uint32Array(pix.buffer);
    if (typeof ImageData !== 'undefined') this.image = new ImageData(pix, world.w, world.h);
    world.store.onTileChanged((x, y) => {
      this.dirtyChunks.add(ChunkCache.key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    });
    if (!deferBuild) this.redrawAll();
  }

  dispose(): void {
    this.pix = null;
    this.p32 = null;
    this.image = null;
    this.dirtyChunks.clear();
    this.flushedPixelRects.length = 0;
  }

  colorFor(x: number, y: number): string | null {
    const st = this.world.store;
    const i = st.idx(x, y);
    const hex = (c: ReadonlyArray<number>): string => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
    // MapHelper.MapColor（:1812-1863）油漆换色：先取基础色，paint>0 时按漆调制。
    // 豁免表：tile sheet 160 恒忽略漆（:1965-1968）；墙 21/88-93/168/241 恒忽略（:1993-2005）
    const paintTile = (rgb: ReadonlyArray<number>): ReadonlyArray<number> => {
      const p = st.paint[i];
      const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
      if (p > 0 && sheet !== MAP_TILE_NO_PAINT_SHEET) return mapPaintColor(false, [rgb[0], rgb[1], rgb[2]], p);
      return rgb;
    };
    const paintWall = (rgb: ReadonlyArray<number>): ReadonlyArray<number> => {
      const p = st.paintWall[i];
      if (p > 0 && !MAP_WALL_NO_PAINT.has(st.wall[i])) return mapPaintColor(true, [rgb[0], rgb[1], rgb[2]], p);
      return rgb;
    };
    // 回声涂层块（invisibleBlock）：小地图按空气处理（MapHelper.GetTileType
    // :1922-1930 `baseType = 0; return`）——隐形房间不上地图（显示态豁免）
    const coatInvisBlock = (st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !st.showInvisibleBlocks;
    if (st.flags[i] && st.type[i] !== 0 && !coatInvisBlock) {
      // 自研像素方块（F2 图片导入）：RGB 编码在 frameX/Y——与 redrawAll 的
      // PIXEL_ART_TILE 分支同公式。增量路径（flushDirty→colorFor）此前漏掉此分支，
      // 放置后小地图仍显泥土色，须存档重载走全量重建才恢复原色
      if (st.type[i] === PIXEL_ART_TILE) {
        const r = (st.frameX[i] >> 8) & 255, g = st.frameX[i] & 255, b = st.frameY[i] & 255;
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
      }
      const d = TILE_DEFS[st.type[i]];
      if (d?.vanilla?.sheet !== undefined) {
        const vc = vanillaTileMapColor(d.vanilla.sheet);
        if (vc) return hex(paintTile(vc));
      }
      return d ? d.mapColor : '#808080';
    }
    // 液体四色（原版 array3：水9,61,191/岩浆253,32,3/蜂蜜254,194,20/微光161,127,255）
    if (st.liquid[i] > 32) {
      const lt = st.liquidType[i];
      return hex(vanillaLiquidColor(lt >= 1 && lt <= 4 ? lt - 1 : 0));
    }
    // 回声涂层墙（invisibleWall）：小地图不显示（MapHelper.GetWallType :1978/:1988
    // `!tileCache.invisibleWall()` 门）
    if (st.wall[i] !== 0 && !((st.coat[i] & TileStore.COAT_INVISIBLE_WALL) !== 0 && !st.showInvisibleBlocks)) {
      const vc = vanillaWallMapColor(st.wall[i]);
      if (vc) return hex(paintWall(vc));
      const mc = WALL_DEFS[st.wall[i]]?.mapColor;
      if (mc) {
        // 画布回落色 '#RRGGBB' → 数组过油漆（legacy 自定义墙，MapColor :1854 默认分支）
        const v = parseInt(mc.slice(1), 16);
        return hex(paintWall([(v >> 16) & 255, (v >> 8) & 255, v & 255]));
      }
      return '#2E2E2E';
    }
    // 背景：天空渐变（y<世界面）/ 土层底 / 石层底（MapHelper GetBackgroundType）
    if (y < Math.max(1, this.world.groundLevel)) return hex(vanillaSkyColor(y, Math.max(1, this.world.groundLevel)));
    if (y < Math.max(1, this.world.rockLevel)) return hex(VANILLA_DIRT_BG);
    return hex(VANILLA_ROCK_BG);
  }

  redrawAll() {
    // 性能注释沿革:旧 canvas 版每格字符串分配秒级冻结→LUT Uint32 直写;再后
    // 811/943ms 巨帧→buildStriped 分行。本版直接写 CPU pix(无画布无 putImageData)
    this.ensureLUT();
    this.fillBand(0, this.world.h);
    this.dirtyChunks.clear();
  }

  /** 大世界首次全量构建的分行版(带间 MessageChannel 让路,详见旧注释沿革):
   *  Game 加载页 await 完成再 onWorldReady;期间 onTileChanged 入 dirtyChunks,
   *  完成后 clear(带构建已覆盖全图) */
  async buildStriped(onProgress?: (p: number) => void): Promise<void> {
    if (this._stripedDone) return;
    this._stripedDone = true;
    this.ensureLUT();
    const BAND = 64;                       // ≈8400×64×4=2.1MB/带,单带 ~15-25ms
    const yieldToEventLoop = () => new Promise<void>((r) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => { port1.close(); r(); };
      port2.postMessage(0);
    });
    for (let y0 = 0; y0 < this.world.h; y0 += BAND) {
      this.fillBand(y0, Math.min(y0 + BAND, this.world.h));
      onProgress?.(Math.min(y0 + BAND, this.world.h) / this.world.h);
      await yieldToEventLoop();
    }
    this.dirtyChunks.clear();
  }
  private _stripedDone = false;

  /** redrawAll/buildStriped 共用的颜色 LUT 构建（tile/wall id → ABGR，一次性） */
  private ensureLUT() {
    if (this._mapLUT && this._mapLUT.tiles.length >= TILE_DEFS.length) return;
      const parse = (hex: string): number => {
        const v = parseInt(hex.slice(1), 16);
        return 0xff000000 | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); // 小端 ABGR
      };
      const rgb = (c: number[]): number => 0xff000000 | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255); // 小端：bits16=B（同 parse）
      // 原版地图色全表（MapHelper.cs Initialize → vanilla-mapcolors.json）：
      // tile 按 vanilla.sheet 查原版色；legacy def 回落 mapColor
      const tiles = new Uint32Array(Math.max(64, TILE_DEFS.length));
      tiles.fill(parse('#808080'));
      for (let id = 0; id < TILE_DEFS.length; id++) {
        const d = TILE_DEFS[id];
        if (!d) continue;
        const sheet = d.vanilla?.sheet;
        if (sheet !== undefined) {
          const vc = vanillaTileMapColor(sheet);
          if (vc) { tiles[id] = rgb(vc); continue; }
        }
        if (d.mapColor) tiles[id] = parse(d.mapColor);
      }
      // 墙：vanilla id 直查原版表（墙注册表即原版 id 序）；回落 def.mapColor
      const walls = new Uint32Array(Math.max(64, WALL_DEFS.length));
      walls.fill(parse('#2E2E2E'));
      for (let id = 0; id < WALL_DEFS.length; id++) {
        const vc = vanillaWallMapColor(id);
        if (vc) { walls[id] = rgb(vc); continue; }
        if (WALL_DEFS[id]?.mapColor) walls[id] = parse(WALL_DEFS[id].mapColor);
      }
      // 液体四色（我们编码 1水2岩浆3蜂蜜4微光 → 原版索引 0/1/2/3）
      const liq = new Uint32Array(5);
      liq[0] = parse('#000000');
      liq[1] = rgb(vanillaLiquidColor(0)); liq[2] = rgb(vanillaLiquidColor(1));
      liq[3] = rgb(vanillaLiquidColor(2)); liq[4] = rgb(vanillaLiquidColor(3));
      this._mapLUT = { tiles, walls, liq, dirtBg: rgb(VANILLA_DIRT_BG), rockBg: rgb(VANILLA_ROCK_BG) };
  }

  private _mapLUT: { tiles: Uint32Array; walls: Uint32Array; liq: Uint32Array; dirtBg: number; rockBg: number } | null = null;

  /** 行带填充:y0..y1(不含)行直写 pix(绝对索引;与旧版同热循环,仅落点从
   *  ImageData 换 CPU 缓冲) */
  private fillBand(y0: number, y1: number) {
    const world = this.world;
    const st = world.store;
    const lut = this._mapLUT!;
    const buf = this.p32!;
    // ★幽灵保域（2026-09-03）：flags bit0（active 位）首门——幽灵格（flags=0,type≠0,
    // x86 对齐行为,finalize 不净化）只留残型,小地图不得按 type 直画成实体（雪楔/
    // 沙漠蛋/矿石散点化石层）。与增量路径 colorFor（st.flags[i] && st.type[i]!==0）
    // 同一门;墙/液体/背景分支不查 active（幽灵格 wall 仍有效,同 MapHelper 模型）
    const { type, flags, wall, liquid, liquidType, frameX, frameY, paint, paintWall } = st;
    const surf = Math.max(1, world.groundLevel), rock = Math.max(surf + 1, world.rockLevel);
    const mapPaintPacked = (packed: number, colorType: number, isWall: boolean): number => {
      const r = packed & 255, g = (packed >>> 8) & 255, b = (packed >>> 16) & 255;
      if (colorType === 29) {
        let n = r / 255, n2 = g / 255, n3 = b / 255;
        if (n2 > n) { const t = n; n = n2; n2 = t; }
        if (n3 > n) { const t = n; n = n3; n3 = t; }
        const sc = n3 * 0.3;
        const c = PAINT_RGB[colorType];
        const nr = (c[0] * sc) | 0, ng = (c[1] * sc) | 0, nb = (c[2] * sc) | 0;
        return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
      }
      if (colorType === 30) {
        if (isWall) {
          const nr = ((255 - r) * 0.5) | 0, ng = ((255 - g) * 0.5) | 0, nb = ((255 - b) * 0.5) | 0;
          return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
        }
        const nr = 255 - r, ng = 255 - g, nb = 255 - b;
        return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
      }
      const n6 = Math.max(r, g, b) / 255;
      const c = PAINT_RGB[colorType];
      const nr = (c[0] * n6) | 0, ng = (c[1] * n6) | 0, nb = (c[2] * n6) | 0;
      return 0xff000000 | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
    };
    for (let y = y0; y < y1; y++) {
      const skyC = vanillaSkyColor(y, surf);
      const bg = y < surf ? (0xff000000 | ((skyC[2] & 255) << 16) | ((skyC[1] & 255) << 8) | (skyC[0] & 255))
        : y < rock ? lut.dirtBg : lut.rockBg;
      const rowOff = y * world.w;
      for (let x = 0; x < world.w; x++) {
        const i = rowOff + x;
        const t = type[i];
        if (t !== 0 && flags[i] !== 0) {
          if (t === PIXEL_ART_TILE) {
            const r = frameX[i] >> 8, g = frameX[i] & 255, b = frameY[i];
            buf[i] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
            continue;
          }
          let c = lut.tiles[t] ?? lut.tiles[0];
          if (paint[i] > 0 && TILE_SHEET_OF[t] !== MAP_TILE_NO_PAINT_SHEET) {
            c = mapPaintPacked(c, paint[i], false);
          }
          buf[i] = c; continue;
        }
        if (liquid[i] > 32) {
          const lt = liquidType[i];
          buf[i] = lut.liq[lt >= 1 && lt <= 4 ? lt : 1];
          continue;
        }
        const wl = wall[i];
        if (wl !== 0) {
          let c = lut.walls[wl] ?? lut.walls[0];
          if (paintWall[i] > 0 && !MAP_WALL_NO_PAINT.has(wl)) {
            c = mapPaintPacked(c, paintWall[i], true);
          }
          buf[i] = c;
        } else {
          buf[i] = bg;
        }
      }
    }
  }

  private flushCalls = 0;
  flushDirty() {
    if (this.dirtyChunks.size === 0 || !this.p32) return;
    const st = this.world.store;
    const buf = this.p32;
    let n = 0;
    if ((++this.flushCalls & 511) === 1)
      console.log(`[mm] flush#${this.flushCalls} dirty=${this.dirtyChunks.size} rects=${this.flushedPixelRects.length} full=${this.needsFullUpload}`);
    for (const k of this.dirtyChunks) {
      if (n++ > 24) break;
      this.dirtyChunks.delete(k);
      const cx = (k & 0xffff) << 16 >> 16, cy = (k >> 16) << 16 >> 16;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      this.flushedPixelRects.push([x0, y0, CHUNK, CHUNK]);   // GL 地图纹理增量上传
      for (let y = y0; y < y0 + CHUNK; y++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          if (!st.inBounds(x, y)) continue;
          const c = this.colorFor(x, y);
          // colorFor '#RRGGBB' → 小端 ABGR 直写(与 fillBand 同打包)
          buf[st.idx(x, y)] = c
            ? (() => { const v = parseInt(c.slice(1), 16); return 0xff000000 | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); })()
            : 0xff000000;
        }
      }
    }
    // ★溢出→全幅重传标记（原 splice 丢最老矩形=纹理永久残缺,见字段注）
    if (this.flushedPixelRects.length > 128) {
      this.flushedPixelRects.length = 0;
      this.needsFullUpload = true;
      console.log(`[mm] 洪峰溢出→置全幅重传 painted=${n} dirty剩=${this.dirtyChunks.size}`);
    }
    if (n > 0) this.mapVersion++;                        // ★有实画才升版本(单调,无冻结窗口)
  }
}

/** 睡床躺平变换操作序列（PlayerSleepingHelper.cs:66-83 + PlayerDrawSet
 *  BoringSetup:336-356 / TransformDrawData:4199-4230 合成，2026-08-17 提取为
 *  纯函数供 drawPlayer 与单测共用）：
 *  ① 床型视觉偏移（SetOffsetbyBed :227-280）× Directions 先做世界平移
 *    （原版 Position += posOffset，随后枢轴 = Position+Size/2 也含偏移 → 偏移
 *    作用于旋转前的世界空间 = 先平移再旋转）
 *  ② 绕盒中心旋转：fullRotation = π/2·(−direction) —— ★本仓镜像 scale(facing,1)
 *    在旋转之前：S·R(θ) = R(α)·S ⟹ θ = facing·α，两朝向化简后【恒 −π/2】
 *    （曾写 π/2·(−facing)：视觉恒 −π/2 —— 变体B床(枕左,facing+1)碰巧正确、
 *    变体A床(枕右,facing−1)头落在脚尾 = "躺床效果不对"根因之一） */
export function sleepingTransformOps(
  p: { facing: number; gravDir: number; h: number },
  bo: readonly [number, number],
  sleepingIndex = 0,
): Array<['t', number, number] | ['r', number]> {
  return [
    // ★局部平移量直接传 bo 原值:镜像 scale(facing,1) 在外层会把 x 分量再乘 facing,
    //   世界位移恰为 bo×Directions(direction,gravDir)——曾写 bo[0]·facing 双重镜像,
    //   facing=−1 时水平偏移反向(朝左床躺位整体偏 2·bo.x)。
    //   叠床第二玩家上移 4px/层（GetSleepingOffsetInfo :29-31 第二项
    //   (0, sleepingIndex·gravDir·−4)——世界 y 位移,局部恒 (0,−4·idx)）
    ['t', bo[0], bo[1] * p.gravDir - 4 * sleepingIndex],
    ['t', 0, -p.h / 2],
    ['r', -Math.PI / 2],
    ['t', 0, p.h / 2],
  ];
}

// ---- 地图键族纯函数（Player.cs:24596-24653 消费侧 1:1；测试锁步进/边界用） ----

/** mapStyle 三态（Main.cs:874：0=隐藏 1=小地图 2=覆盖式） */
export const MAP_STYLE_MIN = 0;
export const MAP_STYLE_MAX = 2;

/** MapStyle 键循环（Player.cs:24641-24645 mapStyle++ → >2 回 0；音效 12 由键沿侧播） */
export function cycleMapStyle(cur: number): number {
  return cur + 1 > MAP_STYLE_MAX ? MAP_STYLE_MIN : cur + 1;
}

/** MapAlpha 步进 ±0.015（Player.cs:24608-24615；钳 [0.01,1] = Main.cs:54961-54968
 *  DrawMap 原地钳的等价折入——活值恒在界内，步进后一并夹取） */
export const MAP_ALPHA_STEP = 0.015;
export const MAP_ALPHA_MIN = 0.01;
export function stepMapAlpha(cur: number, dir: 1 | -1): number {
  return Math.min(1, Math.max(MAP_ALPHA_MIN, cur + dir * MAP_ALPHA_STEP));
}

/** 箱名合成（DrawMap_FindChestName Main.cs:56103-56115 1:1）：
 *  无箱记录 → chestNames[0]（默认"宝箱"族名）；命名箱 → "类型名: 名字"；
 *  未命名 → 类型名。live 路径 name 恒 null/''（本仓 ChestData 无 name 字段、
 *  无重命名链——引擎级缺口，同 CursorItemIcon.containerHover 登记口径） */
export function mapChestHoverName(chest: { typeName: string; name: string | null }): string {
  if (chest.name != null && chest.name !== '') {
    return `${chest.typeName}: ${chest.name}`;
  }
  return chest.typeName;
}

/** 悬停格 → l10n 键（Main.cs:55254-55356 mapFullscreen 悬停链的类型名支）。
 *  sheet 21/441 → LegacyChestType.{frameX/36}；467/468 → LegacyChestType2.{frameX/36}
 *  （Lang.cs:502-508 数组源）；88 梳妆台 → LegacyDresserType.{frameX/54}（:55313-55339）；
 *  其余箱外格 → null（走图例名分支）。frameX 档取整 = 2×2 箱左右帧（+18）同档。 */
export function mapHoverNameKey(sheet: number, frameX: number): string | null {
  if (sheet === 21 || sheet === 441) return `LegacyChestType.${Math.floor(frameX / 36)}`;
  if (sheet === 467 || sheet === 468) return `LegacyChestType2.${Math.floor(frameX / 36)}`;
  if (sheet === 88) return `LegacyDresserType.${Math.floor(frameX / 54)}`;
  return null;
}

/** 悬停格 → 显示名：箱族 = mapHoverNameKey（命名支经 mapChestHoverName，live 恒
 *  name=null——无重命名链）；其余 → 地图图例名（Lang.GetMapObjectName Lang.cs:77
 *  ≈ tileName）。返回 null = 无名可显。探索门（Map.Light>40 :55254）由调用侧迷雾判。 */
export function mapTileHoverName(sheet: number, frameX: number): string | null {
  const key = mapHoverNameKey(sheet, frameX);
  if (key) return Lang.has(key) ? Lang.text(key) : null;
  return Lang.tileName(sheet);   // GetMapObjectName 图例名等价（Tiles.* 分节名）
}

/** NPC 染色合成 ka（base 贡献/遮蔽系数）——**经验定标 0.55**（2026-08-21 用户
 *  肉眼 A/B：0.686(=alpha/255) 略过实、0.314(=(255−alpha)/255 反编译直译) 过透,
 *  0.55 最接近原版）。★与反编译推导值 0.314 的差异未解（原版截图 B 通道拟合
 *  支持 0.314、用户双眼支持 0.55——疑似截图场景光照/色彩管线差异,备案待
 *  同机同场景复测）。?slimeka=<0..1> 仍可临时覆盖复验 */
export const NPC_TINT_KA = (() => {
  try {
    const v = new URLSearchParams(location.search).get('slimeka');
    if (v !== null) {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
    }
  } catch { /* SSR/测试环境无 location */ }
  return 0.55;
})();

// ===================== 月总 1457 战斗预警绘制（蓝队 R1-03） =====================
/** SmolBullet(幻影矢 462)齐射预警（Main.cs:25193-25211 手 397 ai0==3 /
 *  :25262-25280 头 396 ai0==3 / :25337-25346 真眼 400 ai0==1,三处同式）。
 *  GetMoonlordSmolBulletWarningTimes(Main.cs:26697-26700)恒 40/10:
 *  num155=Remap(t,dur−50,dur−10,1,0)(线宽 1→0)、num156=Remap(同窗,0,1)
 *  (星芒 flare/线 α 0→1)——窗前 num156=0 无绘制。星芒 White→Cyan
 *  (fadeIn 0→0.5/fadeOut 0.9→1,rot=t×2π/dur×3×num156²,scale=(10,6)×num155²,
 *  fatness=(3,3));瞄准线 = 瞳位 → 瞳位×30,宽 16×num155,Cyan×num156→透明。
 *  (ex,ey)=瞳位椭圆偏移,(offX,offY)=段附加偏移(手 vector39=−sx,3/头 0/眼 0) */
function mlSmolBulletWarn(
  ctx: CanvasRenderingContext2D | null,
  cx: number, cy: number, ex: number, ey: number, offX: number, offY: number,
  t: number, dur: number,
): void {
  if (!ctx || dur <= 0) return;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const num155 = 1 + (0 - 1) * clamp01((t - (dur - 50)) / ((dur - 10) - (dur - 50)));
  const num156 = clamp01((t - (dur - 50)) / ((dur - 10) - (dur - 50)));
  if (num156 <= 0) return;
  const rot = t * (Math.PI * 2 / dur) * 3 * num156 * num156;
  prettyStarSparkle(ctx, 1, cx + ex + offX, cy + ey + offY,
    [255, 255, 255], [0, 255, 255],
    num156, 0, 0.5, 0.9, 1,
    rot, [10 * num155 * num155, 6 * num155 * num155], [3, 3]);
  const x1 = cx + ex + offX, y1 = cy + ey + offY;
  const x2 = cx + ex * 30 + offX, y2 = cy + ey * 30 + offY;
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, `rgba(0,255,255,${num156})`);
  grad.addColorStop(1, 'rgba(0,255,255,0)');
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 16 * num155;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** 死光蓄能星芒（头 396 ai0==1 Main.cs:25276-25307——两段同式块各画一次=双画;
 *  真眼 400 ai0==4 Main.cs:25352-25379 双星芒异式）。包络 num=Remap(t,0,180,0,1)
 *  (槽前 180t 渐入);k=num+0.1+0.05·sin(num·2π·18) 呼吸。注意:原版此二段的
 *  "朝玩家瞄准线"包在 `if (0 == 1)` 死代码内(:25288/:25362)——只有星芒是活的
 *  (红队 R1-03 把死代码线也当活行为,蓝队复核勘误) */
function mlMoonLordChargeSparkle(
  ctx: CanvasRenderingContext2D | null,
  cx: number, cy: number, ex: number, ey: number, t: number, kind: 'head' | 'eye',
): void {
  if (!ctx) return;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const num = clamp01(t / 180);                       // Remap(t,0,180,0,1)
  if (num <= 0) return;
  const k = num + 0.1 + 0.05 * Math.sin(num * Math.PI * 2 * 18);
  if (kind === 'head') {
    // 头:同式星芒画两次(:25276-25286 + :25297-25307 两个 if(ai0==1) 块)
    for (let i = 0; i < 2; i++) {
      prettyStarSparkle(ctx, 1, cx + ex, cy + ey,
        [255, 255, 255], [0, 255, 255],
        num, 0, 0.3, 0.9, 1,
        num * num * Math.PI * 2 * 5,
        [5 * k, 3.6 * k], [3, 3]);
    }
  } else {
    // 眼:星芒 A(rot=0,scale=(5,3)×1.25,fat=(3,3))+ 星芒 B(rot=num²·2π·3,
    // scale=(5,5)×0.85,fat=(3,3)×0.85)
    prettyStarSparkle(ctx, 1, cx + ex, cy + ey,
      [255, 255, 255], [0, 255, 255],
      num, 0, 0.5, 0.9, 1,
      0, [5 * 1.25 * k, 3 * 1.25 * k], [3, 3]);
    prettyStarSparkle(ctx, 1, cx + ex, cy + ey,
      [255, 255, 255], [0, 255, 255],
      num, 0, 0.5, 0.9, 1,
      num * num * Math.PI * 2 * 3,
      [5 * 0.85 * k, 5 * 0.85 * k], [3 * 0.85, 3 * 0.85]);
  }
}

/** DrawDust 速度拖影链族判定（M57:39537-39658 if/else-if）：返回残影段数
 *  （0=无拖影）。130-134/278 无门；219-223/264/226||272/331 要求 fadeIn==0。
 *  通式 min(10,(|vx|+|vy|)·0.3·10)；264 特例无 0.3 系数（|v|·10）。 */
function dustTrailCount(d: { type: number; vx: number; vy: number; fadeIn: number }): number {
  const t = d.type;
  let n = 0;
  if (t >= 130 && t <= 134) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 3;
  else if (t === 278) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 3;
  else if (t >= 219 && t <= 223 && d.fadeIn === 0) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 3;
  else if (t === 264 && d.fadeIn === 0) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 10;
  else if ((t === 226 || t === 272) && d.fadeIn === 0) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 3;
  else if (t === 331 && d.fadeIn === 0) n = (Math.abs(d.vx) + Math.abs(d.vy)) * 3;
  return n > 10 ? 10 : n;
}

/** 四柱护盾泡破盾/重塑计时器（enemy → 状态;drawEnemy 逐帧推进） */
const PILLAR_FF = new WeakMap<object, { lastShield: number; breakTick: number; reformTick: number }>();

export class Renderer {
  /** GL 合成层(#1 背景族 + #2 全屏地图共用;docs/webgl2-migration-plan.md) */
  glfx: GLSpriteLayer | null = null;
  /** GL 拖尾 pass 帧快照（render() 每帧写入；TrailShader GL 路径与合成消费） */
  glCamX = 0; glCamY = 0; glZoom = 1; glViewW = 1; glViewH = 1;
  /** CPU 软渲染态(渲染模式 cpu 或 auto 降级后为 true):主画布/chunk 烘焙/
   *  光照画布全部走 willReadFrequently(软件光栅化,零 GPU 预算) */
  cpuRender = false;
  /** CPU 模式起始时刻(稳定 120s 后 auto 尝试回 GPU) */
  cpuRenderSince = 0;
  /** 渲染模式切换回调(Game 接线 toast) */
  cbOnRenderModeSwitch: ((mode: 'cpu' | 'gpu') => void) | null = null;
  /** 实际是否 CPU 渲染(选项 cpu 恒真;auto 看 cpuRender 降级态) */
  isCpuRender(): boolean {
    return options.data.renderMode === 'cpu' || this.cpuRender;
  }
  /** 水波动诊断（F5 报告）：全屏扭曲管线状态三件套 */
  waterWarpMode(): 'auto' | '2d' | 'off' { return this.waterWarp.mode; }
  waterWarpActive(): boolean { return this.waterWarp.active(); }
  waterWarpGlUnavailable(): boolean { return this.waterWarp.glUnavailable(); }
  /** 主画布 2D 上下文统一属性(构造器与 recreateMainCanvas 两处创建点必须同参——
   *  同一元素重复 getContext 属性以首次为准)。alpha:false=不透明后备
   *  (Chrome 免混合提交路径;?opaque=0 逃生门),willReadFrequently=CPU 软渲染 */
  private mainCtxAttrs(): CanvasRenderingContext2DSettings {
    const a: CanvasRenderingContext2DSettings = {};
    if (Renderer.opaqueMain) a.alpha = false;
    if (this.isCpuRender()) a.willReadFrequently = true;
    return a;
  }
  /** ?mapgl=0 逃生门(#2);GL 初始化失败自动回退;可运行时切换(对拍探针用) */
  mapGlEnabled = (() => {
    try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('mapgl') !== '0'; }
    catch { return false; }
  })();
  debugMode = false;
  /** 方块标注（F5 标注模式）：标记的问题方块，非空时叠加绘制 */
  annotateMarks: Array<{ x: number; y: number }> | null = null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sky = new SkyRenderer();
  /** 天气渲染器（雨/沙尘；Game.afterWorldLoad 时 attach，destroy 时 detach） */
  weatherFx = new WeatherRenderer();
  /** weatherFx 已 attach（避免每帧空调用开销） */
  weatherFxActive = false;
  /** MoonLordShake 滤镜态（Main.cs:64437-64447：月总倒计时>0 时激活，
   *  强度 num5 = clamp(sin(cd/60×0.5)×2,0,1) × (0.75−0.5×cd/Max)；Game 每帧注入，null=未激活）。
   *  原版为 FilterMoonLordShake 屏幕后处理（以激活点=玩家为靶心的红色扰动）；
   *  canvas 2D 以「靶心径向红晕 + 呼吸脉冲」近似（drawMoonLordShake） */
  moonLordShake: { t: number; x: number; y: number } | null = null;
  /** 眼球伞云盖染料×光照烘焙缓存（key = 染料vid:帧:光照RGB；>96 项整清防膨胀） */
  private readonly eyebrellaDyeCache = new Map<string, HTMLImageElement | HTMLCanvasElement | ImageBitmap>();
  /** 眼球伞云盖合成后逃逸队列（A4 终版 2026-09-03；drawPlayer 收集、flushEyebrellaCloud 消费） */
  private eyebrellaQueue: Array<{ wx: number; wy: number; num2: number; src: HTMLImageElement | HTMLCanvasElement | ImageBitmap; cw: number; ch: number }> = [];
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  minimap: Minimap | null = null;
  /** 原版瀑布贴图系统（WaterfallManager 移植）：液体倾泻的长条水流柱 */
  waterfalls = new WaterfallRenderer();
  /** 信息饰品显示列(DrawInfoAccs 移植;数据组装在 Game,绘制在此) */
  infoAccs = new InfoAccsLayer();
  /** Game 每帧注入的信息行数据(InfoAccCtx;null=未注入不画) */
  infoAccCtx: InfoAccCtx | null = null;
  /** 信息列悬停行(-1 无;交互在 Game) */
  infoAccHover = -1;
  /** Game 每帧注入（DrawInterface_40 数据面）:指针图标上下文。
   *  heldVid=手持原版 id(0 空);uiHeld=DOM 拖拽物非空(MouseDisplayItem 非空语义);
   *  cacheTime/cacheVid=余辉;npcHover=悬 NPC(门);biomeTorch/biomeCampfire=群系
   *  覆写结果(null=未解锁);paintAmmoVid=油漆子图标(0 无);housingHead=住房光标
   *  携带头像索引(null=无) */
  cursorIconCtx: {
    heldVid: number; uiHeld: boolean; cacheTime: number; cacheVid: number;
    npcHover: boolean; biomeTorch: number | null; biomeCampfire: number | null;
    paintAmmoVid: number; housingHead: number | null; cursorScale: number;
    uiBlocking: boolean;
  } = { heldVid: 0, uiHeld: false, cacheTime: 0, cacheVid: 0, npcHover: false, biomeTorch: null, biomeCampfire: null, paintAmmoVid: 0, housingHead: null, cursorScale: 1, uiBlocking: false };
  /** 原版群系/地下背景（DrawBG/DrawBackground 移植）；场景数据由 Game 每帧注入 */
  biomeBg = new BiomeBackground();
  /** #1 背景层 GL 逃生门 ?bggl=0(实例共用 this.glfx;初始化失败自动回退;
   *  可运行时切换——像素对拍探针同会话 A/B 用) */
  bgGlEnabled = (() => {
    try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('bggl') !== '0'; }
    catch { return false; }
  })();
  /** GL 初始化失败重试闩(2026-08-19 哨兵三捕真凶):WebGL2 缺失/浏览器拒发
   *  (playsoft --disable-gpu、上下文数满)时 30s 退避——否则 5s 档对"永远
   *  失败"的环境仍是每 5s 一次 getContext+canvas 分配 */
  private glInitRetryAt = 0;
  /** 统一 GL 实例获取:活实例直取;死亡 5s 退避;初始化失败 30s 闩。
   *  ★旧 bg 路径 diedAt=0 时退避判恒真 = 每帧 new GLSpriteLayer(构造器
   *  createElement)= 60 张/秒,暂停中也持续(渲染循环不停) */
  acquireGL(): GLSpriteLayer | null {
    if (this.glfx) {
      if (!this.glfx.unavailable) return this.glfx;
      if (performance.now() - this.glfx.diedAt < 5000) { this.glfx = null; return null; }
      this.glfx.dispose();
      this.glfx = null;
    }
    if (performance.now() < this.glInitRetryAt) return null;
    if (starvedLock()) return null;   // 饥饿锁:跨实例显存耗尽期暂停重建(走 2D 回退)
    const inst = new GLSpriteLayer();
    inst.statName = 'glfx';   // #perf-gpulog
    if (inst.unavailable) {
      inst.dispose();
      this.glInitRetryAt = performance.now() + 30_000;
      return null;
    }
    this.glfx = inst;
    return inst;
  }
  /** GPU 压力自适应(2026-08-14 trace⑦:主线程空闲仍崩=GPU 进程内存天花板):
   *  浏览器在 GPU 内存吃紧时先发 contextlost——捕获即减半 chunk 画布常驻并
   *  释放最旧一半,恢复后续跑;连续丢失连续收缩(下限 64) */
  installGpuPressureGuard(): void {
    // 熔断器(2026-08-18 联机双开崩溃):旧守卫每次 contextlost 都 preventDefault
    // 请求自动恢复——GPU 预算被根本性打超时(双开窗口各渲染大世界),恢复即重分配
    // →再丢→再恢复,实测抖到 1.7 万次/3s,主线程被事件风暴淹没=崩溃。
    // 熔断:10s 内 ≥3 次丢失 → 不再请求恢复(上下文保持丢失,canvas 绘制跳过),
    // 8s 冷却让系统释放,期满以最小足迹重试;再抖再熔断。
    let losses: number[] = [];
    let tripped = false;
    let cooldown = 8_000;                 // ★逐次翻倍(8→16→32→60s 封顶)
    let trips = 0;
    // 自动降级(用户方案 2026-08-18:不检测多实例,GPU 崩即切 CPU,稳定回切):
    // auto 模式下第 2 次熔断 → 切 CPU 软渲染 + toast;CPU 稳定 120s 后尝试回
    // GPU(立即再熔 → 切回 CPU,5 分钟内不重试)。gpu/cpu 模式不自动切。
    let lastTripAt = 0;
    let gpuRetryAfter = 0;
    const onLost = (e: Event) => {
      // ★写一次缓存失效扫(2026-08-19 playtrace 实证:GPU 进程死后恢复时"角色贴图
      // 不恢复,其它正常"——写一次烘焙的缓存画布(PaperDoll 合成/TintAtlas 页/云染/
      // 火焰预染/群系背景 2D 染色/墓碑)内容随后备 IOSurface 蒸发,且永不重画;
      // 每帧重画的层天然自愈。首次丢失即清,画布 width=0 先还回表面再弃引用)
      clearPaperDollCache();
      this.tintAtlas.dispose();
      this.sky.clearCloudTintCache();
      clearAmbientTintCache();
      this.biomeBg.clearTintCache();
      clearTileFlamesCache();
      for (const c of this.tombstoneCache.values()) { c.width = 0; c.height = 0; }
      this.tombstoneCache.clear();
      const now = performance.now();
      losses = losses.filter((t) => now - t < 10_000);
      losses.push(now);
      const cur = ChunkCache.MAX_CHUNKS;
      ChunkCache.MAX_CHUNKS = Math.max(64, Math.floor(cur / 2));
      this.cbOnGpuPressure?.();
      if (!tripped && losses.length >= 3) {
        tripped = true;
        trips++;
        this.gpuDegraded = true;
        // auto 模式:60s 内第 2 次熔断 = GPU 不可持续 → 自动切 CPU 软渲染
        const now2 = performance.now();
        if (options.data.renderMode === 'auto' && trips >= 2 && now2 - lastTripAt < 60_000) {
          this.setRenderMode(true);
          this.cbOnRenderModeSwitch?.('cpu');
          console.warn('[Renderer] GPU 连续崩溃 → 自动切换 CPU 软渲染(稳定 2 分钟后尝试回 GPU)');
          tripped = false;      // CPU 模式下不再需要 GPU 熔断
          this.gpuDegraded = false;
          losses = [];
          return;
        }
        lastTripAt = now2;
        // ★熔断即硬释放(2026-08-18 双开 trace:16 万次风暴下 JS 堆 35MB 稳定,
        // 纯显存预算问题):GL 纹理池整体丢弃 + 预算腰斩,给 GPU 立刻让出空间
        GLSpriteLayer.MAX_BYTES = Math.max(48 * 1024 * 1024, Math.floor(GLSpriteLayer.MAX_BYTES / 2));
        this.glfx?.dispose();
        this.glfx = null;
        this.worldLight?.dispose();
        this.worldLight = null;
        console.warn(`[Renderer] GPU 压力熔断(第 ${trips} 次):10s 内 ${losses.length} 次画布丢失——暂停渲染冷却 ${cooldown / 1000}s + 已释放 GL 纹理池(${GLSpriteLayer.MAX_BYTES >> 20}MB 档)`);
        setTimeout(() => {
          tripped = false;
          losses = [];
          this.gpuDegraded = false;
          cooldown = Math.min(60_000, cooldown * 2);   // 连续熔断逐次升级
          // CPU 稳定回切:auto 模式 + CPU 运行中 + 已稳定 120s + 不在重试冷却期
          if (options.data.renderMode === 'auto' && this.cpuRender && this.cpuRenderSince > 0
            && performance.now() - this.cpuRenderSince > 120_000 && performance.now() > gpuRetryAfter) {
            this.cpuRenderSince = 0;
            gpuRetryAfter = performance.now() + 300_000;   // 本次尝试失败 → 5 分钟内不再试
            this.setRenderMode(false);                     // 切回 GPU
            this.cbOnRenderModeSwitch?.('gpu');
            console.warn('[Renderer] CPU 已稳定 2 分钟 → 尝试切回 GPU 加速(失败将自动回 CPU)');
            // 给 10s 观察窗:若立刻再熔断,上面 trips>=2 分支会兜回 CPU
          }
          // 恢复前健康检查(2026-08-18 白屏案):主画布上下文若仍处丢失态
          // (防御路径),重建画布元素;chunk 池可能含死画布 → 全量重烘
          const ctxAny = this.ctx as CanvasRenderingContext2D & { isContextLost?: () => boolean };
          if (ctxAny.isContextLost?.()) {
            this.recreateMainCanvas();
            console.warn('[Renderer] 主画布上下文已死,已重建画布元素');
          }
          this.cbOnGpuRecover?.();          // 清 chunk 池(死画布)→ 自然全量重烘(Game 接线)
          console.warn(`[Renderer] GPU 冷却结束,恢复渲染(chunk 上限 ${ChunkCache.MAX_CHUNKS};若稳定运行 60s 将回落冷却档)`);
          setTimeout(() => { if (trips > 0 && !tripped) { trips = Math.max(0, trips - 1); cooldown = Math.max(8_000, cooldown / 2); } }, 60_000);
        }, cooldown);
        // ★主画布例外(2026-08-18 用户实报"第二个 tab 永久白屏"):熔断期对
        // 主画布的丢失仍要 preventDefault 保持可恢复——渲染虽暂停(gpuDegraded
        // 跳 render,恢复后的空闲上下文无绘制无重分配压力),但上下文活着,
        // 冷却期满才能真正恢复画面。其他画布(chunk/GL 等)放死,由冷却期满
        // 的重建链兜底(chunk 全量重烘/GL 懒重建)
        if (e.target === this.canvas) e.preventDefault();
        return;
      }
      if (!tripped) {
        e.preventDefault();     // 单次偶发丢失:照旧请求自动恢复
        console.warn(`[Renderer] contextlost:GPU 压力自适应 chunk 上限 ${cur}→${ChunkCache.MAX_CHUNKS}`);
      }
    };
    this.canvas.addEventListener('contextlost', onLost);
    // ★全局画布哨兵(2026-08-18 双开 trace 实锤:16k 次/秒的风暴打在几百个
    // 无守卫画布上——chunk 烘焙/GL/光照/VUI 等,主画布单点监听是聋的)。
    // capture 阶段 window 级监听捕获全部画布的 contextlost,统一计入熔断。
    // ★单例替换(2026-08-18):本函数会被 onCanvasRecreated 每次重建再调——
    // 裸 add 会让 window 累积 N 个哨兵(同一事件计数 N 次且各持独立熔断状态机
    // 分裂);先摘旧哨兵再挂新闭包,恒保一份且状态机与最新画布监听同源
    this.gpuSentinelRemove?.();
    this.gpuSentinelRemove = () => window.removeEventListener('contextlost', onLost, true);
    window.addEventListener('contextlost', onLost, true);
  }
  /** window 级 contextlost 哨兵的摘除器(installGpuPressureGuard 单例替换用) */
  private gpuSentinelRemove: (() => void) | null = null;
  /** 辅画布健康重建(2026-08-18):光照/迷雾画布的 2D 上下文在风暴中
   * 丢弃后备后多数自愈,但极端态会滞死——重建为同尺寸新画布(内容由
   * 各自的每帧写入自然重填;迷雾走 null→懒重建) */
  recreateAuxCanvases(): void {
    if ((this.lightCtx as CanvasRenderingContext2D & { isContextLost?: () => boolean }).isContextLost?.()) {
      const w = this.lightCanvas.width, h = this.lightCanvas.height;
      this.lightCanvas.width = 0; this.lightCanvas.height = 0;   // 先释放旧后备
      const nu = document.createElement('canvas');
      nu.width = w; nu.height = h;
      this.lightCanvas = nu;
      this.lightCtx = this.isCpuRender() ? nu.getContext('2d', { willReadFrequently: true })! : nu.getContext('2d')!;
      console.warn('[Renderer] 光照画布已死,已重建');
    }
    // ★迷雾 CPU 缓冲不清(2026-08-19 用户实报雾闪):fogPix 是纯 CPU 数据,
    // 与画布上下文死活无关——曾被此链每 20s 误清一次(看门狗巡检)→ 整幅
    // 重建全亮闪。只有 _mapFogRowSeen(GL 纹理增量游标)与死上下文相关需重置。
    // fog 缓冲的生命周期归 dispose/换世界管
    this._mapFogRowSeen = -1;
  }

  /** GPU 看门狗(2026-08-18 用户实报"关掉另一窗口也不恢复"):熔断链终止后
   *  没有任何机制再触发恢复——低频巡检(20s),非熔断期发现死上下文即静默重建 */
  installGpuHealthWatchdog(): void {
    // 僵尸画布三振(2026-08-19 第四场双开:GPU 进程活着,但主画布后备 1088×864
    // 连败 7 次——内核预算见底时新画布的后备分不出来,重建即死 = tab 永不恢复。
    // auto 模式熔断降级(60s 内 2 次熔断)对"进程活但分不出"不触发,故看门狗
    // 自行判定:重建后 30s 内又死 ≥3 次 → 切 CPU 软渲染——主画布 willReadFrequently
    // → SHM 后备,零 IOSurface,分配必成,页面至少活着)
    let zombieStrikes = 0;
    let lastRecreateAt = 0;
    setInterval(() => {
      if (this.gpuDegraded || !this.canvas.isConnected) return;
      const mainLost = (this.ctx as CanvasRenderingContext2D & { isContextLost?: () => boolean }).isContextLost?.() ?? false;
      if (mainLost) {
        noteContextLost('main-canvas');   // #三开压测批
        this.recreateMainCanvas();
        this.recreateAuxCanvases();
        this.cbOnGpuRecover?.();
        zombieStrikes = performance.now() - lastRecreateAt < 30_000 ? zombieStrikes + 1 : 1;
        lastRecreateAt = performance.now();
        if (zombieStrikes >= 3) {
          zombieStrikes = 0;
          console.warn('[Renderer] 主画布重建后三连死(GPU 后备分不出)——切 CPU 软渲染(SHM 后备,不占 IOSurface)');
          if (options.data.renderMode === 'auto') {
            this.setRenderMode(true);
            this.cbOnRenderModeSwitch?.('cpu');
          }
        }
        console.warn('[Renderer] 看门狗:主画布死亡,已重建渲染面');
      } else {
        zombieStrikes = 0;
        this.recreateAuxCanvases();
      }
    }, 20_000);
  }

  /** 重建主画布元素(上下文死亡的最后手段):同尺寸新元素替换 DOM 节点,
   *  重取 ctx;输入监听绑定在旧元素上的由 Game 经 onCanvasRecreated 重绑 */
  recreateMainCanvas(): void {
    const nu = document.createElement('canvas');
    nu.width = this.canvas.width;
    nu.height = this.canvas.height;
    nu.className = this.canvas.className;
    nu.id = this.canvas.id;
    const css = this.canvas.getAttribute('style');
    if (css) nu.setAttribute('style', css);
    this.canvas.replaceWith(nu);
    this.canvas = nu;
    // CPU 软渲染:willReadFrequently 强制软件光栅化(画布后备走 CPU 内存,
    // 不占 Chrome GPU 进程预算——多开/弱 GPU 的稳定出路)
    this.ctx = nu.getContext('2d', this.mainCtxAttrs())!;
    this.onCanvasRecreated?.(nu);
  }

  /** 切换 CPU/GPU 渲染模式:重建全部画布(主/光照/GL 池/chunk 池) */
  setRenderMode(cpu: boolean): void {
    if (this.cpuRender === cpu) return;
    this.cpuRender = cpu;
    this.cpuRenderSince = cpu ? performance.now() : 0;   // 稳定计时(回切判定用)
    // 主画布(换 ctx 属性=必须换元素)
    this.recreateMainCanvas();
    // 光照画布
    if (this.lightCanvas) {
      const w = this.lightCanvas.width, h = this.lightCanvas.height;
      this.lightCanvas.width = 0; this.lightCanvas.height = 0;
      const nu = document.createElement('canvas');
      nu.width = w; nu.height = h;
      this.lightCanvas = nu;
      this.lightCtx = cpu ? nu.getContext('2d', { willReadFrequently: true })! : nu.getContext('2d')!;
    }
    // GL 池:切 CPU 时释放;切回 GPU 时恢复默认预算(熔断可能腰斩过)
    if (cpu) {
      this.glfx?.dispose();
      this.glfx = null;
      this.worldLight?.dispose();
      this.worldLight = null;
    } else {
      GLSpriteLayer.MAX_BYTES = 192 * 1024 * 1024;   // 恢复默认(不继承熔断减半)
      this.glInitRetryAt = 0;                         // 模式回切:重置初始化失败闩
    }
    // 云 GL:cpuRender 禁用并释放;切回 GPU 重新启用(2D cloudTint 兜底常在)
    this.sky.useGLClouds = !cpu;
    if (cpu) this.sky.disposeCloudGL();
    // chunk 池:烘焙侧按新模式创建(静态标志)
    ChunkCache.CPU_RENDER = cpu;
    this.cbOnGpuRecover?.();
    console.warn(`[Renderer] 渲染模式切换 → ${cpu ? 'CPU 软渲染(零 GPU 预算)' : 'GPU 加速'}`);
  }
  /** 主画布重建回调(Game 重绑输入/ resize 监听) */
  onCanvasRecreated: ((canvas: HTMLCanvasElement) => void) | null = null;

  /** GPU 熔断态(contextlost 抖动期):render() 跳过全部画布工作,
   *  世界模拟照跑,画面冻结避免向已死上下文刷绘制任务 */
  gpuDegraded = false;
  /** GPU 压力回调(释放远 chunk;Game 接线) */
  cbOnGpuPressure: (() => void) | null = null;
  /** GPU 冷却期满回调(重建 chunk 池;Game 接线) */
  cbOnGpuRecover: (() => void) | null = null;
  /** 自动降渲染分辨率回调(Game 注入→Toast;#perf-gpulog 方案A) */
  cbOnAutoResolution?: ((pct: number) => void) | null = null;

  /** 原版生命/魔力资源条（ClassicPlayerResourcesDisplaySet 移植）——按当前样式
   *  懒构造二选一(此前两个实例同时构造 = 15 张 UI 贴图急载,另一套样式永远不用) */
  private _resourceBars: VanillaResourceBars | null = null;
  private _fancyBars: FancyResourceBars | null = null;
  get resourceBars(): VanillaResourceBars { return this._resourceBars ?? (this._resourceBars = new VanillaResourceBars()); }
  get fancyBars(): FancyResourceBars { return this._fancyBars ?? (this._fancyBars = new FancyResourceBars()); }
  /** 原版呼吸计（DrawInterface_Resources_Breath 移植：玩家头顶 10 气泡/火焰条） */
  breathMeter = new VanillaBreathMeter();
  /** 背包是否打开（Main.playerInventory 语义——Game.render 经 __swUI 注入） */
  playerInventory = false;
  /** 天塔柱族全屏滤镜（SceneMetrics 视区扫描 + SceneState/FilterManager 状态机；
   *  本帧器件态见 monoScan） */
  readonly monoFilters = new MonolithFilters();
  /** Game.paused 镜像(render 每帧注入;暂停冻结天气物理/滤镜状态机) */
  _worldPaused = false;
  /** 本帧天塔柱扫描结果（SceneMetrics.ScanOnScreenTiles :524-583；render() 每帧刷新） */
  monoScan: MonolithSceneState = emptyMonolithScene();
  private _monoFrameMs = 0;
  scene: SceneFlags | null = null;

  // 全屏地图查看器状态（zoom 向 zoomTarget 缓动；缓动期间按锚点补偿 pan）
  fullMap = {
    open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0,
    anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0,
  };

  // ---- 地图样式三态（Main.mapStyle，Main.cs:874 默认 1；Player.cs:24636-24648
  //      MapStyle 键循环 0↔1↔2。0=隐藏 1=右上小地图 2=全屏覆盖式。运行期态，
  //      原版不持久化（config.json 无对应键），本仓同款会话态） ----
  mapStyle: 0 | 1 | 2 = 1;
  /** 小地图透明度（Main.mapMinimapAlpha :892 默认 1；PageUp/Down ±0.015）。
   *  初始化读 options（Renderer 构造时 options.load 已完成——mainFlow 启动即
   *  void load()，进世界远晚于其 resolve） */
  minimapAlpha = options.data.mapMinimapAlpha;
  /** 覆盖式地图缩放（Main.mapOverlayScale :894 默认 2.5；钳 [屏宽/世界宽, 16×zoom]） */
  mapOverlayScale = 2.5;
  /** 覆盖式地图透明度（Main.mapOverlayAlpha :896 默认 0.35） */
  mapOverlayAlpha = options.data.mapOverlayAlpha;

  // ---- M6 拍照模式（F4）：CaptureInterface 挂点 + 截图重渲通道门 ----
  /** 界面实例（激活态由 main.ts 的 ToggleCameraMode 键派发翻转;本文件只承
   *  frame() 单调用点——见 render() 第 9 段前的 M6 分区注释） */
  readonly captureMode = new CaptureInterface();
  /** 截图离屏重渲通道（CaptureMode.renderChunk 置位;激活时 render() 只画
   *  世界+光照+滤镜链,界面层全跳——原版 DrawCapture 语义） */
  _capturePass = false;

  /** 已放置传送晶塔（Game.refreshPylons 写入；地图图标层 TeleportPylonsMapLayer） */
  pylons: Array<{ x: number; y: number; type: number }> = [];
  /** 右键晶塔时的"当前塔"锚点（Main.MapPylonTile，连线起点；null=非晶塔会话） */
  mapPylonTile: { x: number; y: number } | null = null;
  /** 地图悬停晶塔的物品名（本帧；null=未悬停）——原版地图层 text 提示位 */
  pylonHoverName: string | null = null;
  /** 全屏地图悬停格名（本帧；null=未悬停/无名）——Main.cs:55227-55360 悬停链的
   *  单槽 text（:55282+ 宝箱族覆盖晶塔名：本仓以"晶塔层让位"实现同序） */
  fullMapHoverName: string | null = null;
  /** 联机态（netMode≠0 等价）——地图头像队伍色描边门（GetPlayerHeadBordersColor
   *  :56088 netMode==0 → 白）。Game 每帧置位 */
  mapNetActive = false;
  /** 虫洞地图门（netMode==1 = 联机访客等价——Main.cs:55406；原版房主 netMode=2
   *  无法地图点击虫洞，1:1 保留）。Game 每帧置位 */
  mapWormholeMode = false;
  /** 全屏地图虫洞头像悬停（Main.cs:55376-55440 头像环，帧内重算）：命中队友头像
   *  且过全部门禁（同队 team>0 + 持 2997 + 非己 + 晶塔悬停让位 cancelWormHole）。
   *  Game 悬停起始播 SoundID 12 + 点击链消费传送 */
  mapWormholeHead: { slot: number; name: string } | null = null;
  /** 全屏地图悬停远端头像名（无门禁原始命中，:55407 text=name——悬停提示位） */
  mapHeadHoverName: string | null = null;

  /** 全屏地图缩放：以鼠标位置为锚点（鼠标下的地图点不动，不乱飞） */
  zoomFullMapAt(newZoom: number, mouseX: number, mouseY: number) {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const clamped = Math.max(0.5, Math.min(6, newZoom));
    // 记录锚点：鼠标下的地图源坐标 + 鼠标屏幕位置。
    // 缓动期间每帧按公式 pan = anchorMX - viewW/2 + W*zoom/2 - u*zoom 重解，
    // 保证缓动全程锚点不动（否则缓动中 pan 固定会让地图"自己跑"）
    const cx0 = viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX;
    const cy0 = viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY;
    fm.anchorU = (mouseX - cx0) / fm.zoom;
    fm.anchorV = (mouseY - cy0) / fm.zoom;
    fm.anchorMX = mouseX;
    fm.anchorMY = mouseY;
    fm.zoomTarget = clamped;
    this.applyMapAnchor();
  }

  /** 按锚点反解 pan（当前 zoom 下鼠标处的地图点固定在鼠标下） */
  private applyMapAnchor() {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    fm.panX = fm.anchorMX - viewW / 2 + (this._fmWorldW * fm.zoom) / 2 - fm.anchorU * fm.zoom;
    fm.panY = fm.anchorMY - viewH / 2 + (this._fmWorldH * fm.zoom) / 2 - fm.anchorV * fm.zoom;
  }

  /** 每帧缓动 fullMap.zoom → zoomTarget；缓动期间同步按锚点补偿 pan */
  easeFullMap() {
    const fm = this.fullMap;
    const diff = fm.zoomTarget - fm.zoom;
    if (Math.abs(diff) < 0.002) { fm.zoom = fm.zoomTarget; return; }
    fm.zoom += diff * 0.16;
    this.applyMapAnchor();
  }
  private _fmWorldW = 0;
  private _fmWorldH = 0;
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  private mapDragging = false;
  private lastMouse = { x: 0, y: 0 };

  /** resize 监听句柄(destroy 必须移除——window 强引用曾把旧 Game 整图钉死不释放) */
  private onResize = () => this.resize();

  constructor(public assets: AssetBundle, public atlas: SpriteAtlas | null = null) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', this.mainCtxAttrs())!;
    this.lightCanvas = document.createElement('canvas');
    // ★lightCanvas 恒 alpha:true——光照图构建写 α=255 但 putImageData/乘光链路
    //   语义依赖 RGBA 后备,勿随主画布改 opaque
    this.lightCtx = this.lightCanvas.getContext('2d', this.isCpuRender() ? { willReadFrequently: true } : undefined)!;
    // 群系前景层 alpha（≈Main.bgAlphaFrontLayer）注入天空渲染器——AmbientSky.GetColor
    // 六族乘子（Pegasus×神圣槽 等，AmbientSky.cs:334/:383/:556/:987/:1198/:1222）消费源
    this.sky.attachBiomeBgAlpha(this.biomeBg.frontLayer());
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /** 释放本实例全部画布与全局监听(退出世界时 Game.destroy 调用)。
   *  主画布/lightCanvas/迷雾全幅画布立即清零背板;不移除 resize 监听则
   *  window 强引用导致整个旧 Game(含 ChunkCache 数百张 chunk 画布)无法回收,
   *  连续多次读档累积显存 → contextlost 风暴(2026-08-10 trace 实证) */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.canvas.width = 0; this.canvas.height = 0;
    this.lightCanvas.width = 0; this.lightCanvas.height = 0;
    this.fogPix = null; this.fogP32 = null; this.fogImage = null; this.fogVersion = -1; this._mapFogRowSeen = -1;
    this.minimap?.dispose();
    this.minimap = null;
    if (this._mmHudCanvas) { this._mmHudCanvas.width = 0; this._mmHudCanvas.height = 0; this._mmHudCanvas = null; this._mmHudCtx = null; this._mmHudImg = null; }
    this._fm2dMap = null; this._fm2dFog = null;
    // GL 纹理池同链清空(★曾漏:连续读档逐次叠满 LRU=GB 级显存打爆→contextlost
    // 风暴;背景纹理懒加载重传成本低,不值得跨世界持有)
    this.glfx?.dispose();
    this.glfx = null;
    this.worldLight?.dispose();
    this.worldLight = null;
    this.sky.disposeCloudGL();
  }

  /** 物品图标：优先 Maples 素材，缺省回退程序化(懒物化,首次访问切片) */
  itemIcon(id: number): HTMLCanvasElement | null {
    return this.assets.itemIcon(id);
  }

  /** Maples 图标绘制矩形（找不到返回 null）。
   *  物品贴图动画(Main.InitializeItemAnimations :3685-3722):竖排多帧条
   *  按渲染时钟切片——坠星 75 等此前整条入画(22×208 九帧全画)即此修 */
  atlasIcon(id: number) {
    if (!this.atlas) return null;
    const def = ITEM_DEFS[id];
    if (!def) return null;
    const ar = atlasIconForKey(this.atlas, def.key);
    if (!ar) return null;
    const vid = /^vi_(\d+)_/.exec(def.key);
    if (vid) return sliceItemAnimFrame(Number(vid[1]), ar, this.animTick);
    return ar;
  }
  /** 渲染时钟(60t/s 等效,供物品动画取帧;Vanilla Star.NightSetup 无关) */
  animTick = 0;

  /** 渲染分辨率阶梯(#perf-gpulog 方案A):index 越低越糊;0=100% 原态 */
  private static readonly RSCALE_RUNGS = [1, 0.75, 0.66, 0.5] as const;
  private _autoRungIdx = 0;
  private _scaleApplied = '';
  /** 生效系数 = 手动档(renderScale>0)或自动档当前阶梯;饥饿沿触发降一级。
   *  ★只作用于【世界层中间画布】;以下情形强制 1(原分辨率):
   *  · CPU 渲染/世界层关闭(GL 乘光路径不存在,2D 回退链按全尺寸写死)
   *  · 拍照模式(_capturePass,原版 DrawCapture 语义=最高质量)
   *  · GL 世界光层当帧不可用(fallback 乘光循环按全尺寸读 worldCanvas) */
  private effectiveRenderScale(): number {
    const o = options.data.renderScale;
    if (o > 0) return o;
    if (this.isCpuRender() || !this.worldLayerEnabled || this._capturePass) return 1;
    if (!this.worldLightLayer()) return 1;
    return Renderer.RSCALE_RUNGS[Math.min(this._autoRungIdx, Renderer.RSCALE_RUNGS.length - 1)];
  }
  /** 本帧世界层缩放(render 头计算,begin/transform/合成三处共用) */
  private _worldLowK = 1;
  private _worldLowW = 0;
  private _worldLowH = 0;
  private _starveHooked = false;
  /** 饥饿沿→自动降档挂钩(Game 构造期一次;方案A #perf-gpulog) */
  bindRenderScaleAuto(): void {
    if (this._starveHooked) return;
    this._starveHooked = true;
    onStarveTransition((active) => {
      if (!active || !options.data.renderScaleAuto || options.data.renderScale > 0) return;
      if (this._autoRungIdx < Renderer.RSCALE_RUNGS.length - 1) {
        this._autoRungIdx++;
        const pct = Math.round(Renderer.RSCALE_RUNGS[this._autoRungIdx] * 100);
        this.applyRenderScale();
        (this.cbOnAutoResolution ?? (() => {}))(pct);   // Game 侧转 Toast(带百分比文案)
      }
    });
  }
  /** 设置面板手动改档后的应用入口(Settings 经 __swGame 桥调用) */
  applyUserRenderScale(): void {
    const o = options.data.renderScale;
    if (o > 0) {
      const idx = Renderer.RSCALE_RUNGS.indexOf(o as 1 | 0.75 | 0.66 | 0.5);
      if (idx >= 0) this._autoRungIdx = idx;   // 手动档与自动档共用游标起点
    }
    this.applyRenderScale();
  }
  applyRenderScale(): void {
    const k = this.effectiveRenderScale();
    const key = `${k}`;
    if (this._scaleApplied === key && this.canvas.width === Math.round(window.innerWidth * k)) return;
    this.resize();
    // 后备尺寸变化 → chunk 页画布几何全变:复用恢复链整池重建(与 contextlost 同路)
    this.cbOnGpuRecover?.();
    this._scaleApplied = key;
  }
  resize() {
    this._cssW = this.canvas.clientWidth || 0;
    // ★主画布恒 CSS 全尺寸(#perf-gpulog 方案A 修订):降分辨率的对象是【世界层
    // 中间画布】(beginWorldLayer 内 K 缩),不是主后备——HUD/飘字/背景/输入全程
    // 原分辨率原语义,仅世界栅格与 GL 链低清,合成时拉伸回填。CSS 100% 保留=
    // 后备与元素解耦的显式契约(曾依赖"K=1 固有尺寸恰等于视口"的隐式全屏)
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.canvas);
  }

  private _mouseX = 0;
  /** 鼠标悬停告示牌的文本（render 内计算，tooltip 层消费） */
  private signHoverText = '';
  /** 悬停告示牌头顶指示泡（Main.signBubble，Player.cs:33839 置位/:45133 绘制；
   *  屏坐标在悬停检测段算好存此处，tooltip 层消费。无文本的空牌也显示） */
  private signBubbleScreen: { x: number; y: number; flip: boolean } | null = null;
  private _mouseY = 0;
  private _mouseDown = false;

  render(
    cam: Camera, world: World, clock: Clock,
    chunks: ChunkCache,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    lightRX: number, lightRY: number, lightRW: number, lightRH: number,
    player: Player, entities: Entity[],
    particles: Particle[], dmgNumbers: DamageNumber[],
    swing: { t: number; dur: number; item: number } | null,
    hover: HoverTarget | null,
    boss: { name: string; hp: number; maxHp: number; cx: number; cy: number } | null,
    mouseX = 0, mouseY = 0, mouseDown = false,
    mineProgress = 0,
    flicker: FlickerClock | null = null,
    remotePlayers: Player[] = [],
    invasion: { name: string; pct: number; label?: string } | null = null,
    leashed: import('../entities/LeashedCritter').LeashedEntityManager | null = null,
  ) {
    // 全屏地图关闭 → 释放整幅资源(GL 纹理 + 2D 临时画布;开图期才占 GPU,
    // 常态零占用——2026-08-18 CPU 化的核心收益点)
    // ★M6 拍照模式:_capturePass 的全屏地图关闭是截图重渲的临时态
    // (CaptureMode.renderChunk 换装),不触发释放——否则地图视角起拍会
    // 把整幅地图+迷雾纹理全量重传一次(自愈但白耗)
    if (this._fmWasOpen && !this.fullMap.open && !this._capturePass) {
      if (this.glfx && this.minimap) this.glfx.dropTexture(`mm:${this.minimap.uid}`);
      if (this.fogWorld) this.glfx?.dropTexture(`fog:${this.fogWorld.seed}`);
      this._fm2dMap = null;
      this._fm2dFog = null;
      this._mapFogRowSeen = -1;
      this.mapWormholeHead = null;   // 关图清悬停态（防下次开图读到陈旧命中）
      this.mapHeadHoverName = null;
    }
    this._fmWasOpen = this.fullMap.open;
    // GPU 熔断期跳过全部画布工作(contextlost 抖动环,见 installGpuPressureGuard):
    // 世界模拟照跑(fixedUpdate 独立),画面冻结——向已死上下文刷绘制只会喂大事件风暴
    if (this.gpuDegraded) return;
    this.animTick++;
    this.wingGlowQueue.length = 0;   // 全亮翅膀队列逐帧重建（drawPlayer 收集）
    this.eyebrellaQueue.length = 0;   // 眼球伞云盖队列逐帧重建（A4 终版）
    this.bobberOwners.clear();   // 钓竿静持门快照逐帧重建（ItemCheck_HackHoldStyles 等价,见下）
    for (const e of entities) {
      if (e instanceof Bobber && !e.dead) {
        const o = (e as unknown as { ownerRef?: () => unknown }).ownerRef?.();
        if (o) this.bobberOwners.add(o);
      }
    }
    this.whipFullbrightQueue.length = 0;   // 1034 星辰鞭线体全亮队列逐帧重建（WhipProj 收集）
    this.prismCrystalQueue.length = 0;   // 终极棱镜晶体队列逐帧重建（PrismProj 收集,drawPlayer 后冲刷）
    this._mouseX = mouseX;
    this.remotePlayers = remotePlayers;
    this._frameEntities = entities;   // _moonLordCore（月总滤镜）drawScreenFilterChain 消费
    this.mainPlayer = player;   // 克脑镜像（Main.cs:24799-24843 以玩家中心镜像）等取用
    this._mouseY = mouseY;
    this._mouseDown = mouseDown;
    this._liquidNow = performance.now(); // 帧 first thing 采样：背景水/瀑布/前景水共用同一时刻
    // 渲染共享态(chunk 烘焙的风摆/风门读取):风速 + worldSurface
    renderEnv.wind = world.weather?.windSpeedCurrent ?? 0;
    renderEnv.worldSurface = world.groundLevel;
    const mainCtx = this.ctx;
    let ctx = mainCtx;   // 世界层切换期指向 worldCtx（光照分层，见 beginWorldLayer）
    const viewW = this.canvas.width, viewH = this.canvas.height;
    cam.viewW = viewW; cam.viewH = viewH;
    cam.tickPunch();   // PunchCameraModifier 冲击位移衰减（鹿角怪等震屏源）
    const z = cam.zoom;
    // 水面波动系统帧驱动（WaterShaderData Update+PreDraw+DrawWaves；详见 WaterWaves.ts）
    this.updateWaterWaves(cam, world, player, entities, remotePlayers, viewW, viewH, z);

    // 0. 天塔柱族：视区扫描（Main.cs:61983-61990 GetAreaToLight+Inflate(28) →
    //    SceneMetrics.ScanOnScreenTiles :524-583）+ 滤镜状态机（SceneState.cs:105-128）
    const clock0 = world.clock;
    this.monoScan = scanMonolithScene(world.store, visualScanRect(
      cam.x, cam.y, viewW, viewH, z, world.store.w, world.store.h));
    this.monoFilters.update(this._liquidNow - (this._monoFrameMs || this._liquidNow), this.monoScan, {
      worldSurface: world.groundLevel,
      rockLevel: world.rockLevel,
      screenTileY: cam.y / TILE,
      dayTime: clock0 ? clock0.isDay : true,
      // 映射到原版 24h 表盘（Utils.GetDayTimeAs24FloatStartingFromMidnight :738-745）：
      // Clock.timeOfDay 本就是 0=午夜 24h 表盘(0.1875=4:30AM)——直乘 24
      // （★曾用 −0.25+4.5 式与 Clock 定义自相矛盾差 1.5h,2026-08-23 校正）
      hour24: (clock0 ? clock0.timeOfDay : 0.5) * 24,
      nightElapsed01: (((clock0 ? clock0.timeOfDay : 0) - 0.8125) % 1 + 1) % 1,
      fullMoon: clock0?.moonPhase === 0,
      worldBloodMoon: !!clock0?.bloodMoon,
      cloudAlpha: world.weather?.cloudAlpha ?? 0,
      // Main.GraveyardVisualIntensity（SceneState.cs:124 墓地雾激活门）：Game 侧
      // updateWeather 每帧把平滑值写入 weather.graveyardVisual。
      // 注：原版 TileDrawing.cs:2752-2777 另有"墓碑灵魂火苗"块（typeCache==85 且
      // GraveyardVisualIntensity>0 → GetTileFlameData 火苗叠加），但 GetTileFlameData
      // （:1873-1925）switch 只覆盖 270/271/581，default 走 Main.tileFlame[type]——
      // Main.cs:9210-9222 的 tileFlame 表无 85 → flameCount=0，循环零次 = **原版死
      // 代码**（1.4.5.6 实测不渲染任何火苗），无物可移植，勿再登记
      graveyardIntensity: world.weather?.graveyardVisual ?? 0,
      // HeatDistortion 门（SceneState.cs:122-123）：TileCenter=scene.tileY
      //（SceneMetrics.cs:334 同源）、maxTilesY=store.h、沙漠三条件、sunScorch
      heatTileCenterY: this.scene?.tileY ?? 0,
      heatMaxTilesY: world.store.h,
      heatZoneDesert: !!this.scene?.zoneDesert,
      heatZoneRain: !!this.scene?.zoneRain,
      heatZoneSandstorm: !!this.scene?.zoneSandstorm,
      heatSunScorch: player.sunScorchCounter,
      useHeatDistortion: true,   // Main.UseHeatDistortion（Main.cs:409 默认 true）
      // 月总战滤镜激活门（SceneState.cs:109 ClosestNPCPosition[398]≠Zero——
      // SceneMetrics.cs:739-763 全场 NPC 扫描，核心屏外也激活）：取首个在场
      // 核心（vanillaId 398）中心；drawScreenFilterChain 同源取其屏幕位
      moonLordCore: this._moonLordFilterTarget(entities),
    });
    this._monoFrameMs = this._liquidNow;

    this.updateWaterStyle(world, cam);
    this.easeFullMap();

    // 1. 天空（器件态注入：天塔柱滤镜类型 / 派对气球门 / 地表线 / 世界尺寸 +
    //    AmbientSky 天空实体判定输入）
    this.sky.fx = {
      monolith: this.monoScan.activeMonolithType,
      party: !!this.scene?.partyUp,
      surfaceY: world.groundLevel * TILE,
      worldW: world.w,
      worldH: world.h,
      // 事件月亮(Main.cs:62400-62408):0 无 / 1 霜月 / 2 南瓜月
      moonEventKind: (world.moonEvent?.kind ?? 0) as 0 | 1 | 2,
    };
    // AmbientSky 选族输入（AmbienceServer.cs:30-55/190-193：晴天→鸟群 / 平静夜+神圣→腹足怪）
    this.sky.amb = {
      dayTime: clock.isDay,
      raining: (world.weather?.cloudAlpha ?? 0) > 0,   // Main.IsItRaining（Main.cs:2659）
      eclipse: clock.eclipse,
      bloodMoon: clock.bloodMoon,
      moonEventKind: (world.moonEvent?.kind ?? 0) as 0 | 1 | 2,
      zoneHallow: !!this.scene?.zoneHallow,
      playerX: player.cx,
      playerY: player.cy,
    };
    // 天空深化批帧数据挂点（月塔近距门/月总死亡戏剧/稀有云旗标/环境族 zone 门/涟漪采样；
    // oceanFrontAlpha = bgAlphaFrontLayer[4] 海滩杀云门，Cloud.cs:401）
    this.sky.frameCtx = { entities, world, scene: this.scene, player, clock, camX: cam.x, camY: cam.y, z, viewW, viewH,
      paused: this._worldPaused,
      oceanFrontAlpha: this.biomeBg.frontLayer()[4] };
    // BackgroundDrawers 带表(SunGradients.cs:175-189 取数闭包注入)
    this.sky.biomeBgBands = () => this.biomeBg.surfaceGradientBands();
    // #A 云 GL 共享层注入:云与背景层共用 glfx 一个 WebGL 上下文(每帧注入,
    // 退避/死亡期 acquireGL 返回 null → 当帧云走 2D cloudTint 兜底,自然恢复)
    this.sky.cloudGlLayer = !this.cpuRender && (this.bgGlEnabled || this.sky.useGLClouds)
      ? this.acquireGL() : null;
    // ★海拔大气系数帧状态(Main.cs:62618 UpdateAtmosphereTransparencyToSkyColor,
    // 61421 每帧以视口中心 Y 调用)——colorOfTheSkies/skySeed 尾段乘 atmo:
    // 天空/远景/云/光种子同源变暗 = 太空场景本体 + 高空环境光下降
    setFrameAtmo(this.sky.atmoValue(cam.y));
    // ColorOfTheSkies(Main.cs:63361 SetBackColor 曲线+月相地板+血月/日食+
    // 晨昏地平线渗入)——天空侧唯一色源(2026-08-20 原版化落地):
    // 天空贴图×本值 / 远景层×本值(:56194)/云 cloudColor/环境实体 GetColor bg。
    // ★观感耦合铁律:合成架构与色链单源化同批落地(2026-08-19 分批教训)
    const cots = colorOfTheSkies(clock.timeOfDay, clock.dayCount, !!clock.eclipse,
      !!(clock as { bloodMoon?: boolean }).bloodMoon,
      (clock as { moonPhase?: number }).moonPhase);
    this.colorOfTheSkies = cots;
    this.sky.cots = cots;
    // 晨昏地平线渗入光种(SetBackColor 尾 :63356 ModifyHorizonLight):可见性
    // 由 SkyRenderer 同公式算好——此处写入帧状态供 skySeed/colorOfTheSkies 消费
    // (光照引擎 tick 在 update 段,读到的状态滞后一帧,窗口沿缓变无感)
    const hv = this.sky.horizonVis;
    setFrameHorizon(hv ? { sunrise: hv.sunrise, sunset: hv.sunset, phase: this.sky.horizonPhase } : null);
    // 云量压暗(Main.cs:62990-62999 num3=1−cloudAlpha·0.9·atmo,地板之前——
    // 月亮穿云仍有地板光)+闪电白(:63346-63355 bg 向 1 lerp,天空/远景/光种
    // 同步闪亮——旧全屏白闪 overlay 已退役)
    const cloudA = this.sky.weatherRef?.cloudAlpha ?? 0;
    setFrameCloudDim(cloudA > 0 ? Math.max(0, 1 - cloudA * 0.9 * this.sky.atmoValue(cam.y)) : 1);
    setFrameLightning(this.sky.weatherRef?.lightning ?? 0);
    // 群系影响(SetBackColor :63002-63228 四块;scene.biomeLightInfluence 由
    // Game 每 tick 平滑写入)——cots/skySeed 经帧状态自动消费
    setFrameBiome(this.scene?.biomeLightInfluence ?? null);
    // 极光 tileColor 渗入(SetBackColor 尾 Main.cs:63360 AuroraSky.ModifyTileColor
    // ×0.08,序在 ModifyHorizonLight :63356 之后)——极光态由 SkyRenderer 上帧
    // draw 写入(_opacity/_lastSkyColor),月相取实时值(ModifyTileColor 读
    // Main.GetMoonPhase()),与 horizonVis 同一帧滞后模式
    {
      const aurSt = this.sky.aurora.tileColorState();   // opacity≤0 → null(:412 门)
      const aurPhase = (clock as { moonPhase?: number }).moonPhase ?? 0;
      setFrameAurora(aurSt ? { rgb: aurSt.rgb, opacity: aurSt.opacity, phase: aurPhase } : null);
    }
    this.sky.draw(ctx, clock, viewW, viewH, cam.x, 16.7, cam.y);

    // 1.5 世界背景图（原版 DrawBG：地表群系视差层 + 地下分层；天空之后、tile 之前）
    if (this.scene) {
      // 远景层 tint = ColorOfTheSkies/255(×ColorOfSurfaceBackgrounds :56194)
      const tr = cots[0] / 255, tg = cots[1] / 255, tb = cots[2] / 255;
      // GL 路径:离屏画布整段画完单次合成(层序/透明度与 2D 完全一致);
      // 2D 回退路径保留(?bggl=0 / GL 不可用)
      let bgDone = false;
      if (this.bgGlEnabled && !this.isCpuRender()) {
        // 死实例丢弃(双开风暴中 GL 反复死亡;5s 退避防重建风暴)
        // ★统一走 acquireGL(2026-08-19 哨兵三捕真凶):初始化失败(WebGL2 缺失/
        // 浏览器拒发,如 playsoft --disable-gpu)时旧逻辑 diedAt=0 → 退避判
        // 恒真 → 每帧 new GLSpriteLayer(构造器 createElement)= 60 张/秒风暴
        const glbg = this.acquireGL();
        if (glbg) {
          glbg.resize(this.canvas.width, this.canvas.height);
          glbg.begin();
          // ★只画地表层(2026-08-20 地下背景光照修复):地下层须进世界层吃光
          this.biomeBg.draw(new GLBgBlit(glbg), world, this.scene, cam, viewW, viewH, [tr, tg, tb], 16.7, 'surface');
          glbg.end();
          ctx.drawImage(glbg.canvas, 0, 0);
          bgDone = true;
        }
      }
      if (!bgDone) {
        this.biomeBg.draw(ctx, world, this.scene, cam, viewW, viewH, [tr, tg, tb], 16.7, 'surface');
      }
      // ★暴风雪/沙尘暴背景色罩(#三开压测批 层位修正):原版 BlizzardSky/
      //   SandstormSky 经 SkyManager.DrawToDepth 在 DrawBackground 背景段内触发
      //   (BlizzardSky.cs:52-54 MagicPixel 全屏矩形),随后被墙/方块/家具覆盖——
      //   绝不能挂最终滤镜链(曾致室内罩白,用户实报)。置于此=天空+远山层之后、
      //   世界内容之前;地下时 cave 背景随后覆盖(与原版层序一致)
      if (!this.isCpuRender()) {
        this.sky.drawWeatherTint2D(ctx, viewW, viewH);
      }
      // DrawSurfaceBG_DrawChangeOverlay（:60533-60542 BackgroundChangeFlashInfo）：
      // 群系背景切换的黑闪遮罩（flash=1 落定、−0.05/帧衰减 20 帧；ValueChanged
      // !gameMenu 门=仅游戏内，菜单换样式无闪）。原版画在每组层后=世界层之前
      for (let a = 0; a < 13; a++) {
        if (this._capturePass) break;   // 截图重渲不烘切换黑闪（原版 DrawCapture 无此层）
        const p = this.biomeBg.bgFlash[a];
        if (p > 0.01) {
          ctx.save();
          ctx.globalAlpha = p;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, viewW, viewH);
          ctx.restore();
        }
      }
      // 云近双通道（DrawClouds_Closer/_Closest :58871/:58942——群系背景层之后）
      this.sky.drawCloudsNear(ctx, viewW, viewH, cam.y);
      // 灯笼夜 near 带 + 派对气球（DrawRemainingDepth :59055 = 全部背景层【含群系
      // 前景】之后的最末尾——曾画在云前=云盖灯/气球,用户实报）
      this.sky.drawLanternsNear(ctx, viewW, viewH, cam.x, cam.y, 16.7);
      this.sky.drawPartyBalloonsNear(ctx, viewW, viewH, cam.x, 16.7);
    }

    // 1.55 AmbientSky 天空实体（SkyManager「Ambience」层：群系背景之上、世界实体之下；
    //     鸟群/夜空腹足怪，调度 1:1 AmbienceServer——10-120s 一次尝试）
    this.sky.drawAmbience(ctx, viewW, viewH, cam.x, cam.y, 16.7);
    // 1.6 天塔柱滤镜：原"天空层子集近似"已上移为全屏后处理（步骤 7d，
    //     SceneState → Filters.Scene["Monolith*"] 整屏合成语义 1:1）

    // ==== 世界层切换（光照分层 2026-08-19）：天空(1/1.5/1.55)已画在主画布；
    //      世界内容(tile/墙/水/实体/粒子)画进离屏 worldCanvas，光照 multiply
    //      只乘世界层（按其 alpha 成形）——原版 tile/NPC 绘入 RenderTarget 乘光、
    //      sky 直绘 backbuffer 的分层语义。此前全屏乘光把夜空按月光地板
    //      (~21/255)整体压暗：月亮 241→~20、星星/夜空同步压黑（用户实报
    //      "夜里的月亮不亮"根因）====
    // #perf-gpulog 方案A:世界层(墙/方块/实体/前景水/地下分层)按 K 降分辨率
    // 栅格化;背景/天体/HUD/飘字留在主画布全分辨率,合成时拉伸回填
    const wK = this.effectiveRenderScale();
    this._worldLowK = wK;
    const worldLayer = this.beginWorldLayer(viewW, viewH, wK);
    if (worldLayer) ctx = worldLayer;

    ctx.save();
    // 世界变换：平移 + 缩放（以屏幕中心为相机中心）
    // 像素风关键：tile/实体用最近邻采样保持锐利（光照层单独用平滑）
    // ★像素吸附：相机坐标吸附到 1/zoom 网格——整数世界坐标(全部 chunk/tile 绘制位)
    // 变换后精确落在整数 canvas 像素。浮点相机 + 非整数 zoom(默认 1.25)下,相邻
    // chunk 各自独立光栅化会在接缝处产生 1px 缺口(每 256 世界 px 一条发丝缝,
    // 2026-08-10 实证);吸附后相机以 z 像素步进,像素风反而更稳
    ctx.imageSmoothingEnabled = false;
    const camRX = Math.round(cam.x * z) / z;
    // GL 拖尾 pass 相机快照（TrailShader GL 路径消费；每帧覆盖）
    this.glCamX = cam.x; this.glCamY = cam.y;
    this.glZoom = z; this.glViewW = viewW; this.glViewH = viewH;
    const camRY = Math.round(cam.y * z) / z;
    // 低清档:基准变换整体 ×K(视野的世界矩形不变——culling 仍按 viewW/H 算,
    // 只是落点像素少 K²);屏内坐标一律乘 K 后落画布
    const lw = this._worldLowW, lh = this._worldLowH;
    ctx.translate(Math.round(lw / 2), Math.round(lh / 2));
    ctx.scale(z * wK, z * wK);
    ctx.translate(-camRX, -camRY);

    // 2. chunks 绘制序列（对照原版 Main.cs 帧序：背景水 → 墙 → 方块 → 瀑布 → 实体 → 前景水）
    const ts = TILE;
    const x0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * ts)) - 1;
    const x1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * ts)) + 1;
    const y0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * ts)) - 1;
    const y1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * ts)) + 1;
    const chunkVisible = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx * CHUNK < world.w && cy * CHUNK < world.h;
    // 2a. 液体背景 pass（原版 backWaterTarget 先于墙合成，Main.cs:46619）：
    //     不透明水画在墙/方块之前——方块贴图透明像素处露出这层水 = 浸润，
    //     有墙的水格由墙盖住、只留前景 0.6 层 → 墙在水中可见
    this.drawLiquids(world, cam, viewW, viewH, z, true);

    // 1.5b 地下分层背景画进世界层(★2026-08-20 光照修复):原版 Main.cs:52327+
    //  地下背景逐 16px 段 Lighting.GetColor 采光(暗段跳过/部分亮段 9-slice 渐变)
    //  ——与本层 lightCanvas 乘法等价(屏空间同源)。此前画在主画布 = worldLayer
    //  分层后不吃光:洞里恒亮且与时间无关(用户实报"地底下远景背景居然是亮的")。
    //  地表层仍在主画布(天空侧,只吃 cots 染,原版 ColorOfSurfaceBackgrounds 语义)。
    //  旧路径(?worldlayer=0)此处画主画布,其后的全屏乘光天然把它压暗=原行为。
    //  ★2026-08-24 r15 R15-9 序修正:原版背景水(DrawWaters isBackground:true
    //  :63140)先于地下分层背景(DrawBackground :63157)——两 pass 换序对齐。
    if (this.scene) {
      const mainCtx2 = this.ctx;   // 世界层 ctx(或主画布)
      // ★drawUnderground 的 destX/destY 全是【屏幕空间】数学(bgTopY-screenY 系,
      //   CanvasBgBlit 不补偿相机)——本调用在世界变换内,须逆变换回屏幕空间,
      //   否则带层画到世界 y≈0-862(世界顶部,屏外 3600px)=地下远景整体消失
      //   (2026-08-20 搬入世界层吃光时坐标未换算的回归,用户实报"夜空光照改造
      //   后地底远景全没了";逆变换后仍在世界层画布内=光照乘法照常吃)
      mainCtx2.save();
      // 低清档(#perf-gpulog):逆变换须与基准变换(z×wK、中心 lw/2)精确互逆,
      // 否则地下分层背景错位(本注释块下方的 2026-08-20 回归同型)
      mainCtx2.translate(camRX, camRY);
      mainCtx2.scale(1 / (z * wK), 1 / (z * wK));
      mainCtx2.translate(-Math.round(lw / 2), -Math.round(lh / 2));
      this.biomeBg.draw(mainCtx2, world, this.scene, cam, viewW, viewH, [1, 1, 1], 0, 'underground');
      mainCtx2.restore();
    }

    // 2b/2c. chunk 拼装（背景墙层 + 前景 tile 层共用）
    // ★整数设备矩形绘制（2026-08-18 修复"非整数 zoom 下树冠/仙人掌-地形接缝"）：
    //   旧公式在世界变换内 drawImage(chunk, cx*256, cy*256, 257, 257)——z=1.25 时
    //   256*z=320 整除无感；用户 z=1.27 → 325.12 设备像素，chunk 落小数像素，
    //   各 chunk 独立最近邻采样在边缘产生周期性 1px 透明缝（跨 chunk 行的大物件
    //   ——树冠-干交界/仙人掌柱——最醒目；解剖台 A/B 实锤：单画布零缝、
    //   旧 chunk 公式 16/16 帧缝）。修复 = 退出缩放变换，逐 chunk 取整设备矩形
    //   （xd1-xd0+1 保底 1px 重叠）——任意 zoom 下 chunk 边缘恒落整数像素，无缝。
    //   内部 256→非整数倍上采样与单画布路径完全一致（逐行复制，视觉无感）
    const drawChunkGrid = (layer: 'wall' | 'tile') => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // ★chunk 格线调试(?gutterdbg=1):每 chunk 边界画 1px 品红——旗标活性可视化
      const gutterDbg = typeof location !== 'undefined'
        && new URLSearchParams(location.search).has('gutterdbg');
      // ★低清档(#perf-gpulog):矩形直接在【低清整数空间】取整——zz=z·wK、中心
      // lw/lh。防缝前提 = 相邻块共享边同 round 值(整数设备边);若改套 ctx.scale(K),
      // 整数边被打回半像素,相邻矩形各自取整 → 逐 chunk 边界发丝缝(K=0.5 用户实报
      // "大量区块裂缝")。状态机:共享边 = round(同一表达式) 恒等,零缝零叠
      // ★世界变换 = translate(round(viewW/2), round(viewH/2)) · scale(z) · translate(-camRX, -camRY)
      //   ——退出变换后必须补回中心偏移（曾漏加 = 整层 chunk 左上偏半屏，2026-08-18 用户实抓）
      const ox = Math.round(lw / 2), oy = Math.round(lh / 2);
      const zz = z * wK;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!chunkVisible(cx, cy)) continue;
          const xd0 = ox + Math.round((cx * CHUNK * ts - camRX) * zz);
          const yd0 = oy + Math.round((cy * CHUNK * ts - camRY) * zz);
          const xd1 = ox + Math.round(((cx + 1) * CHUNK * ts - camRX) * zz);
          const yd1 = oy + Math.round(((cy + 1) * CHUNK * ts - camRY) * zz);
          // chunk atlas 化(2026-08-18):pair.wall/tile 是 1024² atlas 页,
          // cell 用 sx/sy/256 源矩形取(9 参形式;曾 4 参整页误绘)
          const p = chunks.get(cx, cy);
          if (gutterDbg) {
            ctx.strokeStyle = 'magenta';
            ctx.strokeRect(xd0 + 0.5, yd0 + 0.5, xd1 - xd0 - 1, yd1 - yd0 - 1);
          }
          // ★无 +1（2026-08-19 归位缝终根因）：旧 `尺寸+1` 在整数矩形下不是重叠
          //   而是【拉伸】（256 源→321 目标，有效缩放 1.2539≠1.25）——块内内容逐行
          //   漂移，树干首行漂 0.6px 落设备行中间 → 最近邻采到上一行（marker 空行）
          //   = 交界天空缝，随块内位置/缩放/相机相位变化（"某些树/某些缩放/归位时
          //   出现"全解释，用户报告树 (2164,219) 实抓复现：chunk 烘焙件首行完好、
          //   屏幕被天空盖）。整数矩形下相邻块共享同一 round 值 = 精确边缘对接，
          //   零缝零叠，+1 既无必要且有害——撤
          ctx.drawImage(p[layer], p.sx, p.sy, CHUNK * ts, CHUNK * ts, xd0, yd0, xd1 - xd0, yd1 - yd0);
        }
      }
      ctx.restore();
    };
    drawChunkGrid('wall');

    // 2a'. 动画墙动态层（烘焙摘除补画，见 drawAnimatedWallLayer 注）
    this.drawAnimatedWallLayer(ctx, world, cam, viewW, viewH, z, chunks);

    // 2b'. behindTiles 族实体（Main.cs:56457 DrawNPCs(behindTiles:true)：原版在
    //      非实心 tile(:56437/:56441) 之后、实心 tile(:56462/:56466) 之前绘制——钻地蠕虫族
    //      （aiStyle6 世吞 13-15/掘地虫 39-41/挖掘怪 95-100/水蛭 117-119/
    //      沙虫 510-515 等，数据源 vanilla-npcs.json behindTiles）被前景 tile 盖住。
    //      本仓 tile 是单一烘焙层（不拆 solid/non-solid）→ 等价画在 tile 层之前、
    //      墙/背景水之后。血条不随后移（原版血条独立 pass 恒在最上层，
    //      见 4. 段实体层）。血肉墙嘴/眼/饥饿者（113/114/115）虽同为 behindTiles=true，
    //      但墙身(3.7 DrawWoF)本仓画在 tile 之上，若随族前移会被墙身盖掉
    //      （原版墙身在 tile 之下无此冲突）→ 留在实体层，见 isBehindTilesEnemy
    // ★部件层序:多部件 Boss 的挂件(骷髅王臂 36/南瓜王臂 328/石巨人拳 aiStyle47
    //   +挂载头 246/机械臂 33-36/世花钩藤 263/264)带 master——y 排序会把头上
    //   部件(头 y<本体)垫到本体身后;原版 NPC 按 whoAmI 槽序=挂件恒画本体【前】
    //   (Main.DrawNPCs 槽序遍历,NewNPC 先本体后部件)。排序键:挂件取
    //   master.y+ε → 紧随本体之后(在前);挂件间保插入序(=出生序,头/拳原生
    //   顺序)。2026-08-19 修"石巨人一阶段头跑到背后"
    // 键 = 链式锚(递归+帧内 memo):master(部件→本体)与 wormFollow(蠕虫段→前段)
    // 都沿链 +0.01 —— 蠕虫段序=生成序(原版槽序)而非物理 y 序(起伏段否则会乱序);
    // 骑手族(390/416 drawBehindMaster)例外:坐骑由骑手生成=原版槽序画骑手前,
    // 回落自然 y(骑手 y<坐骑 → 先画在后)
    const keyMemo = new Map<Entity, number>();
    const sortY = (e: Entity): number => {
      const hit = keyMemo.get(e);
      if (hit !== undefined) return hit;
      keyMemo.set(e, NaN);                            // 环保护(自引用链)
      const en = e as Enemy;
      let k: number;
      if (en.drawBehindMaster) k = en.y;
      else {
        const m = en.master ?? en.wormFollow;
        k = m && !m.dead ? sortY(m) + 0.01 : en.y;
      }
      keyMemo.set(e, k);
      return k;
    };
    // ★投射物恒后于 NPC(2026-08-21 用户报"石巨人眼激光从脸背后出现"):
    //   原版 DrawNPCs()(Main.cs:56474)先于 DrawProjectiles()(:56481)——普通弹
    //   (含石巨人眼激光 259/火焰弹 258)恒画在全部 NPC 之上,与弹的 y 无关。
    //   我方曾单键 y 排序:弹向上飞(y<NPC y)时先画被头贴图盖住=激光"从脸背后出现"。
    //   等价实现:排序键加层级偏移——投射物(自带 draw 的非 NPC 实体)+1e6,
    //   NPC/掉落/墓碑保持原 y。玩家仍在其后(drawPlayer 在实体循环外)。
    const sorted = [...entities].sort((a, b) => {
      const ka = sortY(a) + (a instanceof Enemy || a instanceof ItemDrop || a instanceof TownNPC || a instanceof Tombstone ? 0 : 1e6);
      const kb = sortY(b) + (b instanceof Enemy || b instanceof ItemDrop || b instanceof TownNPC || b instanceof Tombstone ? 0 : 1e6);
      return ka - kb;
    });
    for (const e of sorted) {
      if (e instanceof Enemy && this.isBehindTilesEnemy(e)) this.drawEnemy(e, world, entities);
    }

    // 2b''. 浸润带·实心层 pass（TileDrawing.Draw :528-529 solidLayer=true——
    //       原版在逐 tile 绘制时,每个实心格先画浸润带(Layer_LiquidBehindTiles=0)
    //       再画贴图(Layer_Tiles=1),带在【墙之后、贴图之前】。
    //       本仓原来只在背景液体 pass(isBackground=true,墙之前)画浸润带
    //       → 地下(有墙)区域的带全部被墙盖住 = "方块旁水不浸润"真根因
    //       （2026-08-14 用户实抓 (3504,325)/(3486,325)）。
    //       这里在墙层之后、tile 层之前补画一遍;背景 pass 的带保留(原版也有
    //       DrawLiquidBehindTiles :449-466 背景层调用,两 pass 并存）
    this.drawLiquidBehindSolidTiles(world, cam, viewW, viewH, z);

    // 2c. 前景 tile/物体层（drawChunkGrid 整数设备矩形——见 2b 注释）
    drawChunkGrid('tile');

    // 2c''. 动画格统一动态层（根治：动画格永不进烘焙，见 drawAnimatedTileLayer 注）
    //   dev 参数 = 设备空间取整（与 drawChunkGrid 同 zz/ox/oy/camRX 同源,发丝缝）
    this.drawAnimatedTileLayer(ctx, world, cam, viewW, viewH, z,
      { zz: z * wK, ox: Math.round(lw / 2), oy: Math.round(lh / 2), camRX, camRY });

    // 3.7 血肉墙墙身/肌腱链/舌头（★2026-08-24 r15 R15-8 搬移：原版 DrawWoF 在
    //     DoDraw_WallsTilesNPCs 内紧随 DrawWalls(:64233→:64235)、在非实心 tile/
    //     瀑布(:64241-64242)之前——墙身垫在瀑布/火把格之下。本仓单烘焙层无法插进
    //     墙/块之间,取"tile 层后、瀑布前"最近似位;嘴(113)/眼(114)/饥饿者(115)
    //     仍留实体层（注释备案不受影响）;墙死透时的全屏血尘崩落近似也在此触发）
    this.drawWoF(player, entities, world, camRY, viewW, viewH, z);

    // 2c'.0 火苗叠画（原版 DrawSingleTile_Flames，TileDrawing.cs:1746 在本体绘制之后
    //   调用）：火把/蜡烛/烛台/吊灯/篝火等 Flame_N 平行表逐帧种子化抖动——动态层
    //   不能进 ChunkCache 静态烘焙（TileFrameSeed 每 5 帧推进，Main.cs:61156-61159）。
    //   画在 tile 层后、前景水之前（原版火苗属 tile 批次，在前景水 pass 之下）。
    if (this.atlas) {
      const ftx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
      const ftx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
      const fty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
      const fty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
      drawTileFlames(ctx, this.atlas, world.store, ftx0, fty0, ftx1, fty1, flicker);
    }

    // 2c''.4 高尔夫蓄力显示：预测弹道点（FancyGolfPredictionLine 近似：同物理步进）+
    //   力度条（GolfSwingBarFill：宽 54×rel，玩家脚下）
    if (this.golfPower) {
      const gp = this.golfPower;
      // 预测线：从球心按当前物理模拟 20 步（重力 0.3、实心即停）
      let px = gp.ball.cx, py = gp.ball.cy;
      const sim = { vx: gp.ball.vx, vy: gp.ball.vy };
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 20; i++) {
        sim.vy = Math.min(sim.vy + 0.3, 12);
        px += sim.vx; py += sim.vy;
        const stx = Math.floor(px / TILE), sty = Math.floor(py / TILE);
        if (world.store.inBounds(stx, sty) && world.store.isSolid(stx, sty)) break;
        if (i % 2 === 0) ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      // 力度条（:42961：54×RelativeStrength）
      const [sx0, sy0] = cam.worldToScreen(gp.x, gp.y);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx0 - 27, sy0, 54, 6);
      ctx.fillStyle = '#7de08a';
      ctx.fillRect(sx0 - 27, sy0, Math.round(54 * gp.rel), 6);
    }
    // 2c''.5 风摆动图层（原版 TileDrawing 特殊绘制路径）：摆动图块已摘出烘焙，
    // 此处逐帧动态绘制（草/药草/藤蔓/吊挂植物/树冠树枝；世界变换内世界坐标，
    // 光照合成在后自动受光）——渲染共享态 renderEnv.wind 已在 render() 顶部注入。
    // ★曾试线性采样（XNA 同构）→ 像素风整体糊化（用户报"负优化"），已回退：
    // 全层保持最近邻；接缝问题改由 VanillaTiler 冠/枝绘制的设备像素吸附解决
    if (this.atlas) {
      drawWindSwayTiles(ctx, this.atlas, world, cam, z, clock, this.waterStyle, {
        corrupt: !!this.scene?.zoneCorrupt,
        crimson: !!this.scene?.zoneCrimson,
        hallow: !!this.scene?.zoneHallow,
      }, flicker);

      // 自然层粒子（原版 Gore：落叶/滴水/墓地雾——DrawGores 在 tile 层后实体前；
      // Gore.GetAlpha 乘位置光照色 → 注入 lightAt 采样）
      natureParticles.draw(ctx, this.atlas,
        (tx, ty) => this.lighting?.lightAt(tx, ty) ?? [255, 255, 255]);

      // 训练假人 tile 动态绘制层（tile 378 已摘出烘焙，本层画当前动画行——单层
      // 绘制语义，防烘焙静止行透出同朝向重影）。dev=设备取整（发丝缝 doctrine）
      this.drawDummyTileAnim(ctx, world, entities, cam, viewW, viewH, z,
        { zz: z * wK, ox: Math.round(lw / 2), oy: Math.round(lh / 2), camRX, camRY });
    }

    // 2c'. 导线覆盖层（★2026-08-24 r15 R15-2 搬移：原版实机路径 DrawWires 唯二调用
    //     Main.cs:63251/:63259,均在 DrawWaters()【前景水之后】(:63248);capture 路径
    //     :57896 亦在 DrawLiquid 后——导线恒在水体/实体之上。曾注"水之上实体之下,
    //     Main.cs:46721"系错位引用(:46721 实为毁灭者血条追踪代码)。现画在 4.5 前景
    //     水之后;手持电路工具或 F7 时可见）

    // 2d. 瀑布贴图（原版画在 tile 层后、实体前，Main.cs:47460，被地形遮挡）
    this.drawWaterfalls(world, cam, viewW, viewH, z);

    // 2d'. 挂物族存放物叠画（原版 TE*.Draw / 模特走 PlayerRenderer——本作画物品图标）
    this.drawFurnitureItems(world, cam, viewW, viewH, z);

    // 2d'. 天气层【物理更新】（★2026-08-24 r15 R15-1 绘制搬移：原版雨在
    //     DrawItems/全部实体之后(Main.cs:63226→63227)、雪/沙尘走 DrawDust(:63241,
    //     碎块后前景水前)——本仓雨移到实体循环后 drawRain、雪/沙移到碎块后
    //     drawPrecipDust;此处仅保留池物理 update）
    if (this.weatherFxActive) {
      // ★暂停门(2026-08-14 终审:render 每帧跑,weatherFx.update 含雨滴物理+
      // 池管理+雪/沙出生——暂停时继续跑=池持续填满/对象持续累积,原版暂停世界全冻结)
      if (!this._worldPaused) this.weatherFx.update(world, viewW, viewH, cam.x - viewW / 2, cam.y - viewH / 2, player.vx, player.vy);
    }

    // 2d''.7 天空深化批世界内绘制：雨点落水涟漪（世界坐标）
    //      （晨昏镜头光斑 drawWorldFx 已挪帧尾 :2729 后——★曾画在世界层内被
    //      lightCanvas 乘光:晨昏光照暗 → 加性耀斑被乘成黑矩形,用户实报
    //      2026-08-20;原版耀斑是 backbuffer 后处理不吃 tile 光)
    //      （月总死亡白闪已挪帧尾 7c' 段，Main.cs:61763）

    // 3.5 入驻旗帜（Main.cs:40152 DrawNPCHousesInWorld：有家 NPC 在家坐标上方
    // 挂 House_Banner 旗布 + 叠画 NPC 头像；实体层之前画，让 NPC 从旗前走过）
    this.drawHouseBanners(entities, world, cam);

    // 3.8 拴绳实体（LeashedEntity.DrawEntities，Main.cs:22163——DrawNPCs 起手调用；
    //     各实体以 behindTiles:true 入 NPC 层 = 方块后实体前，与 2b'/实体段之间同档）。
    //     锚桩本体（tile 723/724 的木桩贴图）由 VanillaTiler 画，此处只画游走本体。
    //     门 = 激活 section（manager.isSectionActive）+ 屏幕矩形外扩 512（:477-478）
    if (leashed) {
      this.drawLeashedEntities(leashed, world,
        cam.x - viewW / 2 / z - 512, cam.y - viewH / 2 / z - 512,
        cam.x + viewW / 2 / z + 512, cam.y + viewH / 2 / z + 512);
    }

    // 4. 实体（按 y 排序；behindTiles 族已在 2b' 画过，此处只补血条——
    //    原版 DrawNPCHealthBars 独立 pass 恒在最上层，钻地中血条仍可见）
    // heldProj 账本:帧首清账,实体自带 draw 分支登记活体投射物中心;
    // 同帧 drawPlayer 消费(实体先画玩家后画 → 无跨帧陈旧)。见 heldProj.ts 头注
    heldProjFrameBegin();
    // ★r15 R15-6:isLockedToATile 玩家(坐椅/睡床,Player.cs:4004-4012 = sitting||
    //    sleeping)先于全部实体绘制(RefreshPlayerDrawOrder :22465-22498 两档制 →
    //    DrawPlayers_BehindNPCs :64261 在 NPC 层之前)——NPC 走过坐椅玩家时遮住玩家
    for (const rp of this.remotePlayers) {
      if ((rp.sitting || rp.sleeping) && !rp.dead) this.drawPlayer(rp, world, rp.swingNet, flicker);
    }
    if ((player.sitting || player.sleeping) && !player.dead) this.drawPlayer(player, world, swing, flicker);
    // ★投射物双队列分层（2026-09-02 重写,定罪见 PROJ_DRAW_OVER_PLAYERS 表注）：
    //   2026-08-25 冰川之牙(1115)批把全部自带 draw 的弹挪到 drawPlayer 之后,
    //   系对原版序的行号误引——原版 DrawProjectiles（Main.cs:63199）在
    //   DrawPlayers_AfterProjectiles（:63204）之【前】（弹在玩家/武器下层,
    //   1405/1456/1457 三代一致）;1115 真身是 drawLayer=4 OverPlayers 族,
    //   "弹在玩家上层"是它一族的个别待遇而非全体弹的层序。现按原版 drawLayer
    //   分层：0 层族画玩家【前】（prePlayerDraws,出生时武器压住弹体=原版观感）,
    //   4/5/7/8 族维持玩家【后】冲刷。heldProj 账本登记仍在原位（drawPlayer
    //   同帧消费 heldProj 指向,与本队列无耦合）
    const postPlayerDraws: Array<() => void> = [];
    const prePlayerDraws: Array<() => void> = [];
    for (const e of sorted) {
      if (e instanceof Enemy) {
        if (this.isBehindTilesEnemy(e)) { this.drawHealthBar(e, world.isExpert); continue; }
        // NPC.hide（Main.cs:22172 常规绘制跳过;月总水蛭块 401=纯紫尘拖尾体,终审补）
        if (e.vanilla?.hide) { this.drawHealthBar(e, world.isExpert); continue; }
        this.drawEnemy(e, world, entities); this.drawHealthBar(e, world.isExpert);
      }
      // ★r15 R15-5:掉落物摘出排序循环——原版 DrawItems(:63226)在
      //    DrawPlayers_AfterProjectiles(:63204)之后=物品盖玩家;移至 drawPlayer 后
      else if (!(e instanceof ItemDrop) && e instanceof TownNPC) {
        this.drawTownNPC(e, world);
        this.drawHealthBar(e);
        // NPC 头顶任务"!"（Main.cs:46855-46865）：homeless NPC(CanShowHomelessText
        // :95986 无家且非 37/368/453)在 105px 内(名字 nameOver 350px 渐显范围内,
        // homeless 档额外 105px 门)→ 图标 @Top+(0,-10) worldSpace;
        // nextDialogue.ShowIndicator 档(待播对话队列)本仓无该队列,登记不适用
        if (world && !e.home && e.vanillaId !== 37 && e.vanillaId !== 368 && e.vanillaId !== 453) {
          const dxn = e.cx - player.cx, dyn = e.cy - player.cy;
          if (dxn * dxn + dyn * dyn < 105 * 105) {
            // 实体循环 ctx 已含相机变换(:2782-2784)——世界坐标直绘
            this.drawNotificationIcon(ctx, e.cx, e.y - 10, 1, true);
          }
        }
      }
      else if (e instanceof Tombstone) this.drawTombstone(e);
      else if (typeof (e as { draw?: unknown }).draw === 'function') {
        // 投射物(带 projId)按原版 drawLayer 分层（定罪见 PROJ_DRAW_OVER_PLAYERS
        //   表注:0 层=火箭/箭/法弹/召唤/敌弹等→玩家【前】;4/5/7/8 族→玩家【后】）。
        //   其余自带 draw 实体(小动物等原版 NPC 族)仍在玩家前。
        noteHeldProjEntity(e);
        if ('projId' in (e as object)) {
          const ee = e as unknown as { draw(r: Renderer, cam: Camera): void };
          const queue = PROJ_DRAW_OVER_PLAYERS.has((e as { projId?: number }).projId ?? -1)
            ? postPlayerDraws
            : prePlayerDraws;
          queue.push(() => ee.draw(this, cam));
        } else {
          (e as unknown as { draw(r: Renderer, cam: Camera): void }).draw(this, cam);
        }
      }
    }
    // GL 拖尾上屏段已挪 flushTrailShade（2026-09-03 黑椭圆止血——与 CPU 条带同在
    // compositeLight 之后直绘主画布,脱离光照乘+source-over 替换面）
    // 表情气泡（原版 EmoteBubble：实体层之上；本段在世界变换内，世界坐标绘制）
    {
      const eb = this.emoteSheet();
      if (eb) drawEmotes(this.ctx, eb);
    }
    // ---- 投射物 0 层族冲刷（★2026-09-02 分层修复：原版 DrawProjectiles
    //      Main.cs:63199 在 DrawPlayers_AfterProjectiles(:63204)【之前】——弹在
    //      玩家/武器【下层】,出生瞬间武器压住弹体,飞离后自然露出（1405/1456/
    //      1457 三代一致）。本仓 2026-08-25 起全体弹画在玩家后（行号误引）,
    //      火箭等贴脸武器出生弹体叠在武器贴图上=用户实报;0 层族现回原版位,
    //      4/5/7/8 族仍走下方 postPlayerDraws（表注见 PROJ_DRAW_OVER_PLAYERS）。
    //      位置=FlameParticle(3.85=ParticleSystem_World_BehindPlayers :63200-03,
    //      原版在弹与玩家之间)【之前】→ :63199→:63200→:63204 三段序 1:1）----
    for (const draw of prePlayerDraws) draw();
    // 3.85 FlameParticle 层（Main.ParticleSystem_World_BehindPlayers，Main.cs:61692-61693：
    //     投射物之后、玩家之前——山羊坐骑 47 地面冲刺火焰本体；dust 6 段在
    //     Player.goatFlames 回调，编排器 Spawn_WallOfFleshGoatMountFlames :3259-3306）。
    //     坐骑染料 = miscDyes[3]（Player.cs:9300 cMount = miscDyes[3].dye → 编排器
    //     :3271 SetTypeInfo 第三参 → FlameParticle.Draw :62 drawData.shader）
    {
      const mDye = player.inv.miscDyes[3];
      const flameDye = mDye ? dyeApplyOf(viIdFromKey(ITEM_DEFS[mDye.id]?.key ?? '')) : null;
      if (flameDye) {
        flameDye.uniforms.uDirection = player.facing;   // ArmorShaderData.Apply 尾段 entity.direction
        if (flameDye.tech === 'ArmorReflective' || flameDye.tech === 'ArmorReflectiveColor') {
          flameDye.uniforms.uLightSource = this.reflectiveLightSource(player);
        }
      }
      this.drawFlameParticles(flameDye);
      // FakeFish 装饰鱼群（FakeFishParticle.Draw——原版同带
      // ParticleSystem_World_BehindPlayers,Main.cs:63206-63209 投射物后/玩家前;
      // 湖面星闪 Spawn_LakeSparkle 同池）。步进在 Game.update updateFakeFishSchool
      drawFakeFishSchool(this);
    }
    this.drawPlayer(player, world, swing, flicker);
    // 远端玩家（联机；走同一 drawPlayer——纸娃娃/动画帧由位置派生，与本地一致）
    // 远端玩家（联机；走同一 drawPlayer——纸娃娃/动画帧由位置派生，与本地一致；
    // 挥舞动画 = msg13 useItem 位派生的 swingNet（对齐本地 swing 参数形状））
    for (const rp of this.remotePlayers) { this.drawPlayer(rp, world, rp.swingNet, flicker); }
    // ---- 投射物 4/5/7/8 层族冲刷（原版 DrawCachedProjs(OverPlayers) Main.cs:63205
    //      在 DrawPlayers_AfterProjectiles(:63204) 之后——drawLayer=4 族画在玩家
    //      层组【上】（冰川之牙 1115/1116/1106/759,2026-08-25 用户实报的蓄力冰矛
    //      压角色即此族待遇）;7/8 族=玩家绘制管线内持弹位（PlayerDrawLayers.cs:
    //      3154/:3891——矛/鞭/连枷/悠悠球/钻头/短剑/DefaultTo* 全家,身体【前】）,
    //      本仓以玩家后冲刷近似=既有观感零回归。0 层族已回玩家【前】冲刷
    //      （Main.cs:63199 在 :63204 之前）,见 3.85 段前注）----
    for (const draw of postPlayerDraws) draw();
    // 终极棱镜晶体(633 drawLayer=7)冲刷:原版在玩家绘制层组内持物层位置插入
    // (PlayerDrawLayers.cs:3154→:4318)= 身体【前】——实体循环直画被纸娃娃盖住
    if (this.prismCrystalQueue.length) {
      for (const paint of this.prismCrystalQueue) paint();
      this.prismCrystalQueue.length = 0;
    }
    // PvP 头顶血条（备案偏差：原版无玩家头顶名/血条——仅悬停提示与地图头像边框；
    // 真联机 PvP 下"谁是可攻击目标"是核心信息，按计划以头顶条替代）。
    // 仅 hostile 目标显示（同队/非 hostile 玩家无条），队伍色描边 + 原版血条同款
    // 绿→黄→红渐变填充；受伤即显示（对齐 DrawHealthBar 的 life!=lifeMax 门）
    for (const rp of this.remotePlayers) {
      if (!rp.hostile || rp.hp >= rp.maxHp || rp.dead) continue;
      const tc = TEAM_COLORS[Math.max(0, Math.min(5, rp.team))];
      const x = rp.cx - 19, y = rp.y - 14;
      const fill = Math.max(0, Math.min(1, rp.hp / rp.maxHp));
      const r = Math.round(fill > 0.5 ? 255 * (1 - fill) * 2 : 255);
      const g = Math.round(fill > 0.5 ? 255 : 255 * fill * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, 40, 6);
      ctx.fillStyle = `rgb(${tc[0]},${tc[1]},${tc[2]})`;
      ctx.fillRect(x - 1, y - 1, 40, 2);
      ctx.fillStyle = `rgb(${r},${g},0)`;
      ctx.fillRect(x, y, 38 * fill, 4);
    }

    // 4.35 掉落物（★r15 R15-5：原版 DrawItems(M57:63226) 在
    //     DrawPlayers_AfterProjectiles(:63204) 与 DrawCachedNPCs(OverPlayers)
    //     (:63213) 之后——物品精灵盖在玩家身上；曾进实体 y 排序=玩家盖物品。
    //     磁吸/拾取逻辑在更新侧不受影响）
    for (const e of sorted) {
      if (e instanceof ItemDrop) this.drawDrop(e);
    }

    // 4.4 雨（★2026-08-24 r15 R15-1：原版 DrawRain 在 DrawItems/全部实体之后
    //     （Main.cs:63226→:63227）、DrawGore 之前——雨幕盖在角色/敌怪/掉落物上）
    if (this.weatherFxActive) this.weatherFx.drawRain(this, world);

    // 4.45 Gore 死亡碎块（原版 DrawGore Main.cs:21712-21742：DrawItems/Rain 之后、
    //     DrawDust 之前；Main.DrawGore 帧路径 :21728-21737 多帧源矩形，非帧路径
    //     :21741-21742 整张贴图，均中心锚 + rotation + scale，透明度 =
    //     (255-alpha)/255（Gore.GetAlpha :1486）。★r15 R15-7 搬移：原版序
    //     gore→dust→水(:63230→:63241→:63248)——碎块/尘在前景水【之下】受水色罩）
    this.drawGorePieces(ctx, cam, viewW, viewH);

    // 4.47 雪/沙尘 precip（★r15 R15-1：原版雪=dust 76、沙尘=dust 268 走 DrawDust
    //     :63241——碎块后、前景水前）
    if (this.weatherFxActive) this.weatherFx.drawPrecipDust(this, world);

    // 4.48 原版 Dust lit pass（DrawDust :38266；★r15 R15-7 搬移：gore 之后、前景水
    //     之前——水中尘受水色罩压色。屏空间直画：setTransform 复位世界变换,
    //     仍在 worldLayer 内 → compositeLight 照常乘光）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (wK < 1) ctx.scale(wK, wK);   // 低清档:同上
    this.drawVanillaDustPass(false, cam, player);
    ctx.restore();

    // 4.5 液体前景 pass（原版 waterTarget 在玩家/掉落物之后合成，Main.cs:46720；
    //     ★r15 R15-7：在 gore/尘【之后】= 水 0.6 半透明罩住碎块与尘——水中爆炸
    //     碎块/尘带水色,原版语义）：
    this.drawLiquids(world, cam, viewW, viewH, z, false);

    // 4.55 导线覆盖层 + 宏伟蓝图预览（★r15 R15-2：原版 DrawWires 唯二调用
    //     Main.cs:63251/:63259,均在 DrawWaters() 前景水之后——导线恒在水体/实体上）
    this.drawWires(world, cam, viewW, viewH, z);
    this.drawGrandPreview();

    // 5. 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    // 5b. 渲染层自持瞬态粒子（血肉墙崩落血尘——Game 侧粒子池 600 上限内放不下
    //     原版 ~550 尘+110 gore，且死亡触发点只在渲染侧可得）
    this.stepWoFDeathFx();
    ctx.globalAlpha = 1;

    // 5c.（已移至世界变换块外/光照合成前——见 restore 后 5c 注释）
    // 6. 挖掘目标反馈：挖掘中白色边框 + 黄色填充随进度加深（半透明黄 → 破坏完成时最深）。
    //    ★原版普通模式（智能光标关）空闲悬停无任何格框——格框仅 SmartCursorShowing
    //    黄框（Main.cs:46016）；挖掘反馈原版为裂纹贴图（cracked overlay，未接——
    //    黄进度填充作临时替身，仅挖掘进行时显示。曾空闲悬停恒画白框 = 自造 UI，
    //    2026-08-20 用户实拍"吊灯底部静态残影"实为鼠标指向格的该框误认）
    if (hover && mineProgress > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(hover.x * ts + 0.5, hover.y * ts + 0.5, ts - 1, ts - 1);
      // 进度 0→1，黄色 alpha 0.15→0.8 加深渐变（接近破坏时深黄）
      ctx.globalAlpha = 0.15 + Math.min(1, mineProgress) * 0.65;
      ctx.fillStyle = '#FFC419';
      ctx.fillRect(hover.x * ts + 1, hover.y * ts + 1, ts - 2, ts - 2);
      ctx.globalAlpha = 1;
    }

    // 6b. 洞穴探险/危险感/狩猎/群系视觉高亮（Main.cs:49500 段 Spelunker/Dangersense 溢色近似：
    //     全屏 tile 扫描 + 呼吸 alpha；狩猎对小动物画框）
    this.drawBuffHighlights(ctx, world, player, cam, viewW, viewH, z, ts, entities);

    ctx.restore();

    // 5c. 原版 Dust lit pass 已上移至 4.48（★r15 R15-7：gore/precip 之后、前景水
    //     之前——setTransform 复位世界变换的屏空间窗,仍在 worldLayer 内乘光）

    // ==== 世界层收口：恢复主画布 ctx，光照在 worldCanvas 上成形后叠回 ====
    this.endWorldLayer(mainCtx);
    ctx = mainCtx;

    // 7. 光照合成（★T1 自发光弹光照地板：596/811/814 原版顶点色白化作用在光照后
    //    =暗处仍亮；本仓实体层（含弹）画在本合成之前 → 暗处被乘黑。合成前把这些
    //    弹所在格光值抬到白地板、合成后立即还原数组（下游 applyMoonLordLightFloor/
    //    drawBrightVines 等光照读点保持真值）——写入口方案,见 SELF_LUMINOUS_PROJS 注）
    this.raiseSelfLuminousProjLight(entities, lightR, lightG, lightB,
      lightRX, lightRY, lightRW, lightRH);
    this.compositeLight(cam, viewW, viewH, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);
    this.restoreSelfLuminousProjLight(lightR, lightG, lightB);

    // 7-死亡灰化（★用户需求 2026-08-24 修订：灰化只作用于【世界画面】——地形/实体/
    //    弹幕；右上 UI（小地图/信息饰品）、左下信息列表、死亡文字（保持偏红）不生效。
    //    原实现挂 13 段整帧自绘 = HUD/文字全被去饱和，与需求冲突已挪此。
    //    immuneAlpha ramp → grayscale 滤镜自绘主画布（此时画布=世界+光照,HUD 未画）。
    //    原版无此全屏效果（GetDeathAlpha 只作用于死亡 UI 文字）=本仓视觉增强；
    //    filter 不支持的环境静默跳过）
    if (player.dead && player.immuneAlpha > 0 && 'filter' in ctx) {
      const k = (Math.min(255, player.immuneAlpha) / 255) * 0.85;   // 上限 85% 灰度
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = `grayscale(${k.toFixed(3)})`;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }

    // 7-涂层. 荧光涂层叠层（TileDrawing.cs:6727-6731 DrawTiles_GetLightOverride →
    //    Color.White；:4425-4427 GetTileLight 同；9/4-slice 档 _glowPaintColorSlices
    //    :160-172 全 1 同效）——涂层格在乘光后原样叠回 = "无视光照全亮"。
    //    开灯模式（this.fullbright）全屏已原色，叠层无意义跳过
    if (!this.fullbright) this.drawCoatGlowGrid(chunks, cam, world, viewW, viewH, z);

    // 7b'. 月总 30% 白斜坡（Main.cs:24345/24417/24479/24486
    //      GetAlpha(Color.Lerp(Lighting.GetColor, White, 0.3f))——原版月总四部件
    //      以「光照色向白 30%」为顶点色,暗处恒保 30% 亮度;本仓光照=合成期全屏
    //      乘光,实体级顶点色通道不存在 → 合成后补差(见方法注)
    this.applyMoonLordLightFloor(entities, cam, viewW, viewH,
      lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);

    // 7a'. 晨昏镜头光斑(NextHorizonRenderer.DrawLensFlare :362-408,原版
    //      backbuffer 后处理不吃 tile 光——从世界层内挪出到光照合成后;曾画
    //      世界层内被乘光 → 加性耀斑变黑矩形,用户实报 2026-08-20)
    this.sky.drawWorldFx(ctx, cam.x, cam.y, z, viewW, viewH);

    // 7a''. LitNature 晨昏光晕（NextNatureRenderer :105-170：原版像素着色器
    //       后处理——从世界层内挪出到光照合成后;曾画在世界层内被乘光:晨昏
    //       时光照暗 → 加性光晕被乘成不可见,与耀斑同类错误 2026-08-20 审计）
    //       ★深度/遮挡双门（2026-08-24 用户实报"地底出现日出日落光晕"）:
    //       原版三重门合一——①NextNatureRenderer.cs:96-99
    //       !ShouldDrawSurfaceBackground||!SunVisibilityEnabled → num=0;
    //       ②太阳只在 screenPosition.Y/16 < worldSurface+2 时入场景
    //       (Main.cs:61529,天空块本体 :61492 <+1)——屏顶入地太阳即不在;
    //       ③shader 乘 SunVisibilityPixel 采样(HorizonHelper :46-80,太阳屏幕
    //       矩形的场景不透明度)——地下该区=不透明洞穴背景 → 0。本仓近似:
    //       屏顶低于 worldSurface+2 整门关 + 强度乘 sunOcclusion(与镜头光斑
    //       同源的 tile 遮挡采样,洞口/悬崖下同步衰减)
    const litVis = litNatureVisibility(clock);
    if (litVis > 0.003) {
      const screenTopY = cam.y - viewH / 2 / z;
      if (screenTopY / TILE < world.groundLevel + 2 && this.sky.sunOcclusionReady
        && this.sky.sunOcclusion > 0.003) {
        const occ = this.sky.sunOcclusion;
        const ft = ((clock.timeOfDay - 0.1875) / 0.625);   // =Main.time/54000(★时基校正)
        const sunX = Math.max(0, Math.min(1, ft)) * viewW;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const sunY = dip * 250 + 180;
        const r = viewW * 0.55;
        const grad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
        grad.addColorStop(0, `rgba(255,206,130,${(litVis * occ * 0.85).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255,206,130,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();
      }
    }

    // 7c. 食人怪 259/260 茎蔓强制亮彩（Main.cs:22467-22477）：光照合成后绘制——
    //     主 pass 跳过该族，下限色 (max(R,100),max(G,150),255) 不被全屏乘光压掉
    this.drawBrightVines(entities, cam, z, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);

    // 7d. 原版 Dust 全亮 pass（type 6/15/59-64 强制 White :38406——不受光照，
    //     合成后直画 = GetColor(White) 等价）
    this.drawVanillaDustPass(true, cam, player);

    // 7d''. FadingParticle 层（ParticleSystem_World_OverPlayers,Main.cs:63208——
    //     DrawPlayers_AfterProjectiles :63204 之后的玩家上层;fullbright=true 全亮
    //     加色,FadingParticle.Draw :57-66 逐值——拍击石系 Spawn_SnappingStone /
    //     Spawn_SnappingStoneSummon 环带,见 fx/FadingParticles.ts）
    this.drawFadingParticles(cam, player);

    // 7d'. 飞灵 677 自发光多层渲染（DrawNPCDirect_Faeling :26306-26368 不走
    //      GetAlpha——自发光色不受 tile 光照，须在光照合成后绘制。此前画在
    //      实体层被光照覆层压暗 → 暗洞穴发光不可见，用户实报 2026-08-21）
    {
      const camRX2 = Math.round(cam.x * z) / z;
      const camRY2 = Math.round(cam.y * z) / z;
      ctx.save();
      ctx.translate(Math.round(viewW / 2), Math.round(viewH / 2));
      ctx.scale(z, z);
      ctx.translate(-camRX2, -camRY2);
      ctx.imageSmoothingEnabled = false;
      for (const ent of entities) {
        if (ent instanceof Enemy && !ent.dead) {
          if (ent.vanillaId === 677) this.drawFaeling(ent, world);
          else if (ent.vanillaId === 583 || ent.vanillaId === 584 || ent.vanillaId === 585) {
            this.drawFairyBright(ent);   // GetAlpha Lerp(light,White,0.5)（cs:94662-94665）
          }
        }
      }
      ctx.restore();
    };

    // 7e. 全亮翅膀主纹理 + 叠画（mainGlow/overlay 队列——原版硬编码 DrawData 色
    //     不受光照；drawPlayer 收集、此处消费）
    this.flushWingGlow(cam, z);
    // 7e''. 眼球伞云盖（A4 终版：min(头顶光照,170) 一次性施加的合成后逃逸；
    //      drawPlayer 收集、此处消费；在翼后=原版 38 层>9 层）
    this.flushEyebrellaCloud(cam, z);

    // 7e'. 1034 星辰鞭线体全亮（flag3 :36747-36749 color2=color 免逐段取光——
    //      固定色 (0,61,153,12) 不受光照合成;WhipProj 收集、此处 worldToScreen 直画）
    this.flushWhipFullbright(cam, z);

    // 7f. 条带拖尾全亮（2026-09-03 黑椭圆止血：原版 Drawer 全程不取光=fullbright，
    //     与星辰鞭同层——compositeLight 之后直绘主画布 'lighter' 加算；Arrow/
    //     MissileProj 实体段收集）
    this.flushTrailShade(cam, z, viewW, viewH);

    // 7a-bis. 图格网格（DrawInterface_6_TileGridOption Main.cs:45634-45671 1:1）：
    // 开关=Main.MouseShowBuildingGrid（IngameOptions.cs:745）；智能光标激活时不画；
    // CursorRadial 贴图（AssetInitializer.cs:800 = Images/UI/Radial）画在鼠标格
    // 中心，α 随玩家速度淬灭（站立 Lerp(0,0.7,1-v/6)，每帧 0.2 缓动，关时 -0.05）
    this.drawBuildingGrid(ctx, cam, player, hover?.smart === true, mouseX, mouseY);

    // 7b. 智能光标黄框（Main.cs:46016-46066 DrawSmartCursor）：光照合成之后画，
    //     颜色手动乘该格光照（Lighting.GetColor 语义）
    if (hover?.smart) {
      this.drawSmartCursor(ctx, cam, hover, viewW, z,
        lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);
    }

    // ★批III尾窗：Stardew 彩蛋编排器（Main.cs:28604 弹体 995 屏叠；此处屏空间
    //    等位复刻——全屏过场,画于 HUD 前）
    drawStardewAnimation(ctx, viewW, viewH);

    // 7b'-pre. 告示牌悬停文本（vanilla :43671 signHover → MouseText 悬浮提示：
    //      鼠标格命中 Main.tileSign {55,85,425,573} 且 world.signs 有非空文本时,
    //      鼠标旁 460px 宽 wordwrap 悬浮提示。2026-08-27 补）
    {
      this.signHoverText = '';
      this.signBubbleScreen = null;
      const cam2 = cam, z2 = z;
      const mwx = cam2.x + (this._mouseX - viewW / 2) / z2;
      const mwy = cam2.y + (this._mouseY - viewH / 2) / z2;
      const mtx = Math.floor(mwx / TILE), mty = Math.floor(mwy / TILE);
      if (world.store.inBounds(mtx, mty)) {
        const si = world.store.idx(mtx, mty);
        const sh2 = world.store.type[si] !== 0 ? (TILE_DEFS[world.store.type[si]]?.vanilla?.sheet ?? -1) : -1;
        if (sh2 === 55 || sh2 === 85 || sh2 === 425 || sh2 === 573) {
          // ★锚回算须走 frameX/18 % 2（vanilla Player.cs:32338-32341 num3%=2 /
          //   :32964-32967 while(num40>1)num40-=2）：tileSign 族 2 列/件，frameX/18
          //   = style*2+列——墓碑 frameX=style*36+dx*18（style≠0 恒 >1），漏 %2 →
          //   锚左漂 2×style 格（Chat2 泡左漂+world.signs 锚查找落空=文字不显，
          //   2026-09-02 用户实报；style0 恰好无漂曾掩盖）
          const ax = mtx - (Math.floor(world.store.frameX[si] / 18) % 2);
          const ay = mty - Math.floor(world.store.frameY[si] / 18);
          const sign = world.signs.find((sg) => sg.x === ax && sg.y === ay);
          if (sign && sign.text.trim()) this.signHoverText = sign.text;
          // signBubble（Player.cs:33839-33841）：悬停任意告示牌即置位——
          // signX=锚右缘px、signY=锚顶行；泡偏玩家异侧（:45142 signX>玩家右缘 → 翻转）
          const signX = ax * TILE + 16, signY = ay * TILE;
          this.signBubbleScreen = {
            x: Math.round((signX - cam2.x) * z2 + viewW / 2),
            y: Math.round((signY - cam2.y) * z2 + viewH / 2),
            flip: signX > player.x + player.w,
          };
        }
      }
    }
    // 7b'. 指针物品/交互图标（Main.cs:44474-44562 DrawInterface_40）+ 住房光标
    //      携带头像（:44622-44688 DrawInterface_38）——屏幕空间最后层
    this.drawCursorItemIcon(ctx, player);

    // 7c. MoonLordShake 屏幕后处理（Main.cs:64437-64447）：光照合成后、HUD 前叠红色靶心脉冲
    this.drawMoonLordShake(ctx, cam, viewW, viewH);

    // 7c'. 月总死亡白闪（MoonlordDeathDrama.DrawWhite Main.cs:61763：帧尾——
    //     ScreenDarkness（=光照合成 7 段）之后、ScreenObstruction 之前）。2026-08-13
    //     挪正：此前挂 sky.drawWorldFx（2d' 世界变换段 = tile 上实体下），白闪被
    //     实体绘制与全屏乘光压掉
    this.sky.drawMoonlordWhiteFlash(ctx, viewW, viewH);

    // 7c-bis. ScreenObstruction 遮屏（ScreenObstruction.cs 1:1）：星云头蟹 421 头顶吸附
    // 授 Obstructed(163) → headcovered → 目标 0.95/步进 0.3 的黑幕逼近，玩家矩形开孔
    this.updateAndDrawScreenObstruction(ctx, cam, viewW, viewH, player);

    // 7d. 全屏滤镜链（FilterManager.EndCapture :136-176：世界整屏合成、HUD 之前；
    //     EffectPriority 升序 → HeatDistortion(Low) 先 → Medium 柱族 → VeryHigh
    //     CRT/Test2 后）。开关链：电路/右键 → SwitchMonolith 翻帧 → SceneMetrics
    //     视区扫描（本帧 monoScan）→ SceneState.cs:105-128/:122-123 激活 →
    //     Filter.Opacity 1/s 斜坡。GL 路径 = ScreenShader.cso SM2 字节码逐指令
    //     1:1（GLScreenFilters）；GL 不可用回退 canvas 近似（MonolithFilters.draw）
    // 7d-bis. 覆盖式地图（mapStyle==2，DrawMap :54988-55018：世界之上、界面/滤镜链
    // 之下——Main.cs:61670-61684 画在 DoDraw_WallsTilesNPCs 之后）。全屏地图打开时
    // 不画（mapFullscreen 与 mapStyle 互斥，:45171）
    if (this.mapStyle === 2 && !this.fullMap.open && this.minimap && !this._capturePass) {
      this.drawMapOverlay(ctx, cam, world, player, entities, viewW, viewH, z);
    }

    this.drawScreenFilterChain(ctx, cam, player, viewW, viewH, z, world);

    // 8. 飘字（受光照影响后画）。数字类 = 原版位图字体（Combat_Text/Combat_Crit
    //    xnb 提取,见 render/CombatTextFont）:5 层绘制（±targetScale 四向暗化影 +
    //    本体,影 = 本色调暗 ×0.3 而非黑——Main.cs:61805-61841）、锚点文字盒中心、
    //    crit 旋转漂移；字体未就绪(懒加载窗口)回退 monospace
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const d of dmgNumbers) {
      const [sx, sy0] = cam.worldToScreen(d.x, d.y);
      // gravDir=−1 飘字 Y 屏幕镜像（Main.cs:63339-63343:num23 = screenHeight −
      // (position.Y − screenPosition.Y)——重力倒置(重力地球等)时飘字翻到对侧）
      const sy = player.gravDir === -1 ? viewH - sy0 : sy0;
      // 物品名飘字：带阴影文本（色 = 稀有度/钱币档位；alpha = PopupText 呼吸、
      // scale = 弹出/收缩动画链均已按 PopupText.Update 对齐）。★不走 drawCombatText
      // 位图字体——combat-font.json 仅 10 个数字字形（伤害数字专用），拉丁/CJK
      // 全缺（"土块"只剩"(5)"）；全量 MouseText+CJK 字体提取是独立资产任务，
      // 登记后维持 sans-serif 描边
      if (d.label) {
        const sc = d.scale ?? 1;
        ctx.globalAlpha = d.alpha ?? 1;
        ctx.font = popupLabelFont(POPUP_LABEL_FONT_PX * sc);   // 13px sans-serif（命中盒度量同源,见 popupLabelMeasure 注）
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(d.label, sx, sy);
        ctx.fillStyle = d.color;
        ctx.fillText(d.label, sx, sy);
        continue;
      }
      const text = String(d.value);
      if (combatFontReady(d.crit)) {
        // 原版位图字体:颜色 #RRGGBB → rgb 三元组,锚点 (sx, sy)=文字盒中心
        const hex = d.color.replace('#', '');
        const rgb: [number, number, number] = [
          parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16),
        ];
        drawCombatText(ctx, text, sx, sy, rgb, d.alpha ?? 1, d.scale ?? 1, d.rotation ?? 0, d.crit);
        continue;
      }
      // 回退:monospace（字体纹理加载中,本帧少量帧窗）
      const scale = d.scale ?? 1;
      ctx.globalAlpha = d.alpha ?? 1;
      ctx.fillStyle = d.color;
      ctx.font = `bold ${Math.max(1, Math.round((d.crit ? 18 : 14) * scale))}px monospace`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const rot = d.rotation ?? 0;
      if (rot !== 0) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rot);
        ctx.strokeText(text, 0, 0);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      } else {
        ctx.strokeText(text, sx, sy);
        ctx.fillText(text, sx, sy);
      }
    }
    ctx.restore();

    this._lastPlayer = player;

    // ==== M6 拍照模式（F4,CaptureInterface 1:1;src/render/CaptureMode.ts）====
    // _capturePass=离屏截图重渲通道（CaptureMode.renderChunk 二次调用本 render）
    // = 原版 DrawCapture（Main.cs:56145）独立管线：无任何界面层,到此收口
    // （飘字第 8 段已画——capturePass 下 dmgNumbers 传 [] 本就为空）。
    // active=相机模式激活：原版 DrawInterface_10_CheckCaptureManager
    // （Main.cs:45584-45593）返回 false 截断后续界面层——小地图/信息饰品/
    // Boss 条/入侵条/死亡文字隐藏;资源条+呼吸计+按钮组+选区+锁屏遮罩由
    // captureMode.frame() 按原版层序续画（CaptureInterface.Draw :1010-1037,
    // 含 GUIBarsDraw 重画与全屏地图先行支）。
    // ★帧()内嵌套重渲的换装/回滚（canvas/ctx/fullMap/_capturePass/lighting 区）
    // 全在 CaptureMode.renderChunk 的 try/finally,本文件零残留态
    if (this._capturePass) return;
    if (this.captureMode.active) {
      this.captureMode.frame(this, {
        cam, world, clock, chunks,
        lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH,
        player, entities, particles, swing, hover, flicker, remotePlayers, leashed,
        dmgNumbers,
      }, {
        mouseX, mouseY,
        mouseLeft: mouseDown,   // 电平近似;frame() 内 input 直连（mouseHeld）覆盖
        mouseRight: false,      // 同上（render 无右键面,Input 直连后生效）
        viewW, viewH,
        worldW: world.w, worldH: world.h,
        mapOpen: this.fullMap.open,
        fm: { zoom: this.fullMap.zoom, panX: this.fullMap.panX, panY: this.fullMap.panY },
        gravDir: player.gravDir,
        mapEnabled: !!this.minimap,
      });
      return;
    }

    // 9.45 信息饰品列(DrawInfoAccs;main 系列资源文本,原版右上 X=W-280)
    //  纵向 +261 偏移门 = mapStyle==1 && mapEnabled(Main.cs:46675 GetInfoAccIconPosition
    //  ——小地图可见时信息列整体下移到小地图框之下;曾误传 fullMap.open,列压在小地图上)
    //  ★时间/天气面板展开时先画信息列（面板叠信息之上,2026-08-27 用户要求——
    //  面板(小地图下 ±/⛅ 展开体)与信息列同域,原序信息列后画=压住面板）
    const quickPanelsOpen = this.timePanelOpen || this.weatherPanelOpen;
    const drawInfoAccs = () => {
      if (this.infoAccCtx && this.infoAccs.canShow(
        !!((player as unknown as { talking?: boolean }).talking),
        !!((this as unknown as { chestOpen?: boolean }).chestOpen),
        false,
      )) {
        this.infoAccs.draw(ctx, viewW, viewH, this.infoAccCtx, player.hideInfo,
          this.playerInventory, this.mapStyle === 1 && !!this.minimap,
          this.infoAccHover, this._mouseX, this._mouseY);
      }
    };
    if (quickPanelsOpen) drawInfoAccs();
    // 9. 小地图
    this.drawMinimap(ctx, cam, world, player, clock, entities);
    if (!quickPanelsOpen) drawInfoAccs();
    // 9.5 全屏地图
    if (this.fullMap.open && this.minimap) {
      this.drawFullMap(ctx, world, this._mouseX, this._mouseY, this._mouseDown, entities);
      return; // 全屏地图时跳过其余 HUD
    }

    // 9.8 调试面板：碰撞盒高亮（F3 切换）
    // 方块标注叠加（F5 标注模式）：红圈 + 序号
    if (this.annotateMarks && this.annotateMarks.length && !this.fullMap.open) {
      const z = cam.zoom;
      ctx.save();
      ctx.font = `bold ${Math.max(10, 12 * z)}px monospace`;
      ctx.textAlign = 'center';
      this.annotateMarks.forEach((m, idx) => {
        const [sx, sy] = cam.worldToScreen(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2);
        ctx.strokeStyle = '#FF3355';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 10 * z + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FF3355';
        ctx.fillText(String(idx + 1), sx, sy - 12 * z - 6);
      });
      ctx.restore();
    }
    if (this.debugMode) this.drawDebugOverlay(ctx, cam, viewW, viewH, player, entities, mouseX, mouseY, hover);

    // 10. Boss 血条（BigProgressBarSystem 1:1——BossBars.ts 全量分派：无当前条时
    // 全场扫描，屏幕矩形外扩 5000px 相交的 NPC 中取离玩家最近者，按 netID 分派
    // 15 类特化条（双子合血/世吞恒定分母/克脑+爬行者/石巨人两件/月总四件/四塔盾量
    // /火星碟/海盗船 4 炮/鹿角怪敌意门/NeverValid 压制）+ Common 兜底；数值一律由
    // 条自身聚合——Game 侧 boss 槽旧参数（含 EoW ×150 近似分母）自此退役）
    {
      const snap = this.bossBars.tick(this.buildBarContext(entities, player, world, cam, viewW, viewH));
      if (snap) {
        // 窄屏(手机竖屏~390 CSS px)等比缩放:456px 设计宽必溢出。视口宽判据天然
        // 隔离桌面(≥560 恒 1=原布局字节不变),横屏 844/ iPad 均无需缩。
        const bs = viewW < 560 ? Math.max(0.55, (viewW - 56) / 480) : 1;
        if (bs !== 1) {
          ctx.save();
          ctx.translate(viewW / 2, 0);
          ctx.scale(bs, bs);
          ctx.translate(-viewW / 2, 0);
        }
        this.drawBossBar(ctx, viewW, viewH, snap);
        if (bs !== 1) ctx.restore();
      }
    }
    // 入侵进度条（DrawInvasionProgress Main.cs:47071 语义；布局与 Boss 条并列居中，
    // 原版右下角黄条——偏差记录）——窄屏同款缩放包裹(与 Boss 条共用判据)
    if (invasion) {
      const ivS = viewW < 560 ? Math.max(0.55, (viewW - 56) / 480) : 1;
      if (ivS !== 1) {
        ctx.save();
        ctx.translate(viewW / 2, 0);
        ctx.scale(ivS, ivS);
        ctx.translate(-viewW / 2, 0);
      }
      this.drawInvasionBar(ctx, viewW, invasion);
      if (ivS !== 1) ctx.restore();
    }

    // 11. 生命/魔力资源条（原版默认 "New"=FancyClassic 金框分格样式；Classic 为
    //     朴素心/星——PlayerResourceSetsManager2.cs:26-31 五样式，此处两主样式可切）
    //     移动端整体缩小（右锚缩放——两样式均以 viewW 右缘锚定；桌面恒等）
    {
      const barsUiS = mobileUiScale();
      if (barsUiS !== 1) {
        ctx.save();
        ctx.translate(viewW, 0);
        ctx.scale(barsUiS, barsUiS);
        ctx.translate(-viewW, 0);
      }
      if (options.data.resourceBarStyle === 'classic') this.resourceBars.draw(ctx, player, viewW, flicker);
      else this.fancyBars.draw(ctx, player, viewW, flicker);
      if (barsUiS !== 1) ctx.restore();
    }
    // 11b. 呼吸计（原版 DrawInterface_Resources_Breath Main.cs:42824：玩家头顶
    //      100px 屏幕 10 气泡；岩浆宽限耗损时换火焰条）
    this.breathMeter.draw(ctx, player, cam, viewH, this.atlas, this.playerInventory);

    // 12. 死亡画面（DrawInterface_35_YouDied Main.cs:44765 + 1457 跳过提示）——
    //     文字保持偏红原色（灰化已挪 7 段只作用世界画面,2026-08-24 用户修订）
    if (player.dead) this.drawDeathScreen(ctx, player, viewW, viewH);
  }

  /** 死亡 UI（原版 DrawInterface_35_YouDied :44765-44801 1:1 + 1457 跳过提示）：
   *  - 中央文字「你被杀死了……」（Lang.inter[38]，DeathText 大字号）@ 屏中 -60
   *  - 掉钱行「掉了{0}」（Game.DroppedCoins，仅 lostCoins>0）@ 下一行
   *  - ★1457 跳过提示（Main.cs:46104-46134）："按SPACE跳过"（Game.RespawnSkip，
   *    {InputTrigger_Jump}→SPACE）@ 提示位；门=player.respawnSkipUi（全门同跳过逻辑）；
   *    淡入 num4=Remap(frames,0,60,0,1)、滑移 num3=Remap(num4,0,1,70,20)·num4
   *  - 重生倒计时（Game.RespawnInSuffix {0}=秒数，scale 0.7）@ 提示位 +40
   *    （原版 num 共用：提示滑移带动倒计时同步下移，门关时 slide=0）
   *  - 文字色 = GetDeathAlpha（Player.cs:54848：r+α0.9 g+α0.5 b+α0.5 a+α0.4——
   *    immuneAlpha +2/tick 缓升，红黑渐显）
   *  - 灰化：已移除遮罩方案——整帧色调去饱和在 render() 尾段（遗照式，见彼处注） */
  private _respawnSkipFrames = 0;
  private drawDeathScreen(ctx: CanvasRenderingContext2D, player: Player, viewW: number, viewH: number) {
    const a = player.immuneAlpha / 255; // 0→1 缓升（约 2.1s 走满）
    // 文字色（GetDeathAlpha 公式）
    const col = `rgba(${Math.round(230 * 0.9 * a)},${Math.round(230 * 0.5 * a)},${Math.round(230 * 0.5 * a)},${(a * 0.4 + a * 0.6).toFixed(3)})`;
    // ★save/restore 包体(2026-08-25):本函数曾裸设 textAlign='center' 不还原——
    //  canvas 状态跨帧持久,泄漏给其后每帧的信息饰品列(文本被居中左移半宽,
    //  图标相对"扎进"文本,用户实报)。函数尾的 textBaseline 手工回设一并退役
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = viewW / 2;
    // 「你被杀死了……」@ 屏中 -60（原版 num=-60）
    ctx.font = 'bold 34px "Fusion Pixel 12px zh_hans", monospace';
    ctx.strokeStyle = `rgba(0,0,0,${(a * 0.85).toFixed(3)})`;
    ctx.lineWidth = 5;
    const died = Lang.text('LegacyInterface.38');
    ctx.strokeText(died, cx, viewH / 2 - 60);
    ctx.fillStyle = col;
    ctx.fillText(died, cx, viewH / 2 - 60);
    // 掉钱行（原版 num += 50 后写、再 -=26；效果即 Died 下方一行；lostCoins 由 Game 注入）
    const lost = this.deathLostCoins;
    if (lost > 0) {
      ctx.font = '16px "Fusion Pixel 12px zh_hans", monospace';
      // {0} = ValueToCoins 格式化（Main.cs:44777 传 lostCoinString=ValueToCoins(lostCoins)）
      const coins = Lang.text('Game.DroppedCoins', Lang.valueToCoins(lost));
      ctx.strokeText(coins, cx, viewH / 2 - 10);
      ctx.fillText(coins, cx, viewH / 2 - 10);
    }
    // ★1457 跳过提示（Main.cs:46104-46134）：frames 计数器可用时递增/不可用归零；
    //   淡入 60t、滑移 70→20px·num4（Remap 链 1:1）；文案 {InputTrigger_Jump}→SPACE
    let slide = 0;
    if (player.respawnSkipUi) {
      this._respawnSkipFrames++;
      const num4 = Math.min(1, this._respawnSkipFrames / 60);          // Remap(0,60→0,1)
      const num3 = 70 - num4 * 50;                                     // Remap(num4,0,1→70,20)
      slide = num3 * num4;
      const skipAlpha = a * num4;                                      // GetDeathAlpha(Transparent)*num4
      const skipText = Lang.text('Mods.SandboxWorld.UI.RespawnSkip');
      ctx.font = 'bold 20px "Fusion Pixel 12px zh_hans", monospace';
      ctx.strokeStyle = `rgba(0,0,0,${(skipAlpha * 0.85).toFixed(3)})`;
      ctx.lineWidth = 4;
      const sy = viewH / 2 + 26 + slide;
      ctx.strokeText(skipText, cx, sy);
      ctx.fillStyle = `rgba(${Math.round(255 * 0.9 * a)},${Math.round(255 * 0.5 * a)},${Math.round(255 * 0.5 * a)},${skipAlpha.toFixed(3)})`;
      ctx.fillText(skipText, cx, sy);
    } else {
      this._respawnSkipFrames = 0;                                     // :46137 else 归零
    }
    // 重生倒计时（原版 num=-60+70=+10，scale 0.7；★位置随提示滑移联动——num 共用）
    const secs = 1 + Math.floor(player.respawnTimer / 60);
    ctx.font = 'bold 24px "Fusion Pixel 12px zh_hans", monospace';
    const cd = Lang.text('Game.RespawnInSuffix', String(secs));
    const cdY = viewH / 2 + (player.respawnSkipUi ? 26 + slide + 40 : 36);
    ctx.strokeText(cd, cx, cdY);
    ctx.fillText(cd, cx, cdY);
    ctx.restore();
  }
  /** Game 每帧注入：本次死亡掉落钱数（LocalPlayer.lostCoins） */
  deathLostCoins = 0;

  /** 水面波动系统每帧驱动（render() 顶部调用；WaterWaves.ts 内有完整原版行号）：
   *  贴图懒提取 → 档位同步(options.waveQuality) → 相机态 → 实体注入采集
   *  (DrawWaves :181-334) → Update/PreDraw(progress/步进) */
  private _waveLastMs = 0;
  private _waveQ = -1;
  /** 主画布 CSS 宽缓存(resize 时刷新;热路径免逐帧 clientWidth 布局读取) */
  private _cssW = 0;
  /** 果冻管线帧级换算态（updateWaterWaves 缓存；drawLiquids 消费——CSS/世界/设备三系互算） */
  private _waveCss: WaterWarpFrameState | null = null;
  /** 本帧视口（±2 格余量）是否含任何液体（updateWaterWaves 每帧探针）。水体全屏
   *  扭曲的门控：obj19 门控以前景水 α 作乘子、波场位移亚像素级——视口确无液体时
   *  applyFullScreen 必然产出与直画一致的恒等画面，整轮「整屏场景纹理上传+GL
   *  全屏 pass+回贴」纯白耗（#perf2026-08-26 trace：旱地地表 ~5ms/帧）。缺省
   *  true=未初始化帧保守走旧路。 */
  private _waveLiquidInView = true;
  /** ?oldmult=1：CPU 乘光走优化前逐像素全重算旧循环（A/B 对拍/逃生门） */
  static readonly legacyCpuMult = (() => {
    try {
      return typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldmult');
    } catch { return false; }
  })();
  /** 全亮快路径(?lightfast=0 逃生门,A/B 对拍用):光照图全 255 时世界层回退分支
   *  直接 drawImage(worldCanvas),跳过全屏 getImageData+乘循环+putImageData。
   *  等价性论证见 compositeLight 内注(2026-08-25 软渲染 trace 优化批) */
  static readonly lightFast = (() => {
    try {
      return typeof location !== 'undefined' && new URLSearchParams(location.search).get('lightfast') !== '0';
    } catch { return false; }
  })();
  /** 旱地扭曲跳过总门(?dryskip=0 回退无视口液体探针的旧行为——每帧恒做全屏
   *  扭曲上传。像素等价性实机实证:空前景水 α 下 applyFullScreen 输出≡输入,
   *  逐字节 diff=0(scripts/_perf-parity-probe.mjs,#perf2026-08-26 批) */
  static readonly dryWarpSkip = (() => {
    try {
      return typeof location !== 'undefined' && new URLSearchParams(location.search).get('dryskip') !== '0';
    } catch { return true; }
  })();
  /** 主画布不透明后备(?opaque=0 逃生门,A/B 对拍用):alpha:false 让 Chrome 走
   *  免混合提交路径(SHM 帧少拷贝,软渲染下 Commit/viz 受益)。核验记录
   *  (2026-08-25):body=#000、主画布零像素读出(toDataURL/getImageData 无命中)、
   *  死亡灰化自绘(:3122)在满屏已绘内容上语义等价、CaptureMode 用独立 alpha:true
   *  离屏、菜单背景是独立画布——视觉等价 */
  static readonly opaqueMain = (() => {
    try {
      return typeof location !== 'undefined' && new URLSearchParams(location.search).get('opaque') !== '0';
    } catch { return false; }
  })();
  /** 水体果冻后处理编排器（离屏水层 + GLWaterDistortion 位移场扭曲；?wwarp=0 逃生门） */
  private readonly waterWarp = new WaterWarpCompositor();
  private updateWaterWaves(
    cam: Camera, world: World, player: Player, entities: Entity[],
    remotePlayers: Player[], viewW: number, viewH: number, z: number,
  ): void {
    ensureWaveTextures(this.atlas);
    const q = options.data.waveQuality;
    if (q !== this._waveQ) { this._waveQ = q; waterWaves.setQuality(q); }

    // 模拟系用 CSS 像素（与原版"backbuffer/4"的设备无关语义对齐——DPR 高时波速
    // 不变）；绘制侧换算 world = cssPx/cssZoom
    // ★clientWidth 不逐帧读(2026-08-19 trace:每帧强制样式/布局计算 0.8% 主线程
    //   ——低配机布局更贵);canvas 铺满窗口,resize 时缓存即可
    const cssScale = viewW / Math.max(1, this._cssW || viewW);
    const cssZoom = z / cssScale;
    const cssW = Math.round(viewW / cssScale), cssH = Math.round(viewH / cssScale);
    const camL = cam.x - viewW / (2 * z), camT = cam.y - viewH / (2 * z);
    // 果冻管线帧态（quality=0 关闭时也缓存——drawLiquids 的激活判定只读 quality，
    // 帧态在激活时必然新鲜：active ⇒ 本函数已跑到这里）
    this._waveCss = { cssW, cssH, cssScale, cssZoom, camL, camT };
    if (waterWaves.quality === 0) { waterWaves.disable(); return; }

    // ---- 视口液体探针（水体全屏扭曲门控，#perf2026-08-26 trace 批）----
    // 视口±2 格行扫描（~千格 Uint8Array 直读，µs 级）。效果外延论证：扭曲位移
    // 亚像素级（波场项 ×0.1 后 ±1px 内）、水线果冻/水下晃动都以前景水 α 门控，
    // 像素影响不出水面贴图邻域——2 格余量远大于任何外延。false 仅在整窗确无
    // 液体时置位（保守方向：有液或异常一律 true 走旧路）。
    {
      const stP = world.store;
      const MARGIN = 2;
      const px0 = Math.max(0, Math.floor(camL / TILE) - MARGIN);
      const py0 = Math.max(0, Math.floor(camT / TILE) - MARGIN);
      const px1 = Math.min(stP.w - 1, Math.ceil((camL + viewW / z) / TILE) + MARGIN);
      const py1 = Math.min(stP.h - 1, Math.ceil((camT + viewH / z) / TILE) + MARGIN);
      let seen = false;
      const liqArr = stP.liquid;
      scan: for (let ty = py0; ty <= py1; ty++) {
        const row = ty * stP.w;
        for (let tx = px0; tx <= px1; tx++) {
          if (liqArr[row + tx] > 0) { seen = true; break scan; }
        }
      }
      this._waveLiquidInView = seen;
    }

    waterWaves.setCamera(camL, camT, cssZoom);

    // 帧间隔（progress/步进节奏用真实流逝；PreDraw min(2 步)在 frame 内把守）
    const now = performance.now();
    const dt = this._waveLastMs ? Math.min(0.25, (now - this._waveLastMs) / 1000) : 1 / 60;
    this._waveLastMs = now;

    // ---- 实体注入采集（DrawWaves :181-334）----
    const st = world.store;
    const inLiquidAt = (wx: number, wy: number): boolean => {
      const tx = (wx / TILE) | 0, ty = (wy / TILE) | 0;
      return st.inBounds(tx, ty) && st.liquid[st.idx(tx, ty)] > 0;
    };
    // 弹幕两表（ProjectileID.cs:195 CanDistortWater 默认 true 的例外 / :333 NoLiquidDistortion）
    const NO_WATER_DISTORT = new Set([7, 8, 150, 151, 152, 493, 494]);
    const NO_LIQUID_DISTORT = new Set([511, 512, 513]);
    const push = (s: WaveEntitySample) => injectEntity(s, camL, camT, cssW, cssH, cssZoom);
    // 玩家（本地 + 联机镜像；q>=2）
    const pushPlayer = (p: Player) => {
      if (p.dead) return;
      push({
        kind: 'player', x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy,
        wet: p.inWater, wetCount: p.wetCount, honeyWet: p.inHoney, lavaWet: p.inLava,
      });
    };
    pushPlayer(player);
    for (const rp of remotePlayers) if (!rp.dead) pushPlayer(rp);
    // NPC（Enemy+TownNPC，恒开——WaterShaderData.cs:79 _useNPCWaves 无档位门）
    for (const e of entities) {
      if (e.dead) continue;
      if (e instanceof Enemy) {
        push({
          kind: 'npc', x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy,
          wet: e.wet, wetCount: e.wetCount, honeyWet: e.honeyWet, lavaWet: e.lavaWet,
        });
      } else if (e instanceof TownNPC) {
        push({
          kind: 'townnpc', x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy,
          wet: e.wet, wetCount: e.wetCount, honeyWet: e.honeyWet, lavaWet: e.lavaWet,
        });
      } else {
        // 弹幕族（q>=3）：projId 鸭子类型（各 Proj 类无公共基类）；wet 以中心格
        // 液体探针近似（原版 projectile.wet 由每 tick 碰撞维护——弹幕小盒等价）
        const pid = (e as { projId?: number }).projId;
        if (typeof pid === 'number'
          && !NO_WATER_DISTORT.has(pid) && !NO_LIQUID_DISTORT.has(pid)
          && inLiquidAt(e.x + e.w / 2, e.y + e.h / 2)) {
          push({
            kind: 'projectile', x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy,
            wet: true, wetCount: 0, honeyWet: false, lavaWet: false,
            projDistort: true,
          });
        }
      }
    }
    // 血块落水涟漪（Gore.cs:986 frame<10→10 沿；落水沿由本侧 wet 进入沿把守）
    for (const g of liveGorePieces()) {
      if (g.dead) continue;
      const wet = inLiquidAt(g.x + 8, g.y + 14);
      const key = g as unknown as { __waveWasWet?: boolean };
      if (wet && !key.__waveWasWet && waterWaves.gates.ripple) {
        push({ kind: 'gore', x: g.x, y: g.y, w: 16, h: 16, vx: 0, vy: 0, wet: true, wetCount: 0, honeyWet: false, lavaWet: false });
      }
      key.__waveWasWet = wet;
    }

    // ---- Update + PreDraw（progress/强度/步进/滚动）----
    waterWaves.frame({
      camX: camL, camY: camT, zoom: cssZoom,
      viewW: cssW, viewH: cssH,
      tileX: Math.floor((player.x + player.w / 2) / TILE),
      tileY: Math.floor((player.y + player.h / 2) / TILE),
      maxTilesX: world.w, maxTilesY: world.h,
      worldSurface: world.groundLevel, rockLayer: world.rockLevel,
      windAbs: Math.abs(world.weather?.windSpeedCurrent ?? 0),
      rain: world.weather?.maxRaining ?? 0,
      dt,
    });
  }

  private drawLiquids(world: World, cam: Camera, viewW: number, viewH: number, z: number, isBackground: boolean) {
    // 原版 1.4.0.5 LiquidRenderer 移植（多 pass 网格算法，见 VanillaLiquidRenderer）。
    // isBackground：背景 pass（墙层之前，不透明）或前景 pass（实体之后，0.6）
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    // 底边 +5 行（原版 Main.cs:42900-42908 屏下 +5/+4 边距）：P3 不处理窗口底部 10 行，
    // 外扩后未构建带落在屏幕外，防止视口底缘液体类型错画
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts) + 5);
    // ==== 全屏扭曲管线（原版 waterTarget/backWaterTarget 直画 + EndCapture 全屏
    //      FilterWaterDistortion 语义；激活 = WaveQuality>0 + 噪声就绪 + 非 CPU 渲染）====
    // ★水体本体不扭（Main.cs:61748/:61635 直画）：背景水直画世界层（墙/方块之前）；
    //   前景水画进离屏（=waterTarget 独立渲染目标）后未扭曲合成回世界层——离屏同时
    //   是 compositeLight 后全屏扭曲 pass 的 alpha 门控纹理。扭曲/水下晃动/水线果冻
    //   全部由 Renderer.compositeLight → WaterWarpCompositor.applyFullScreen 交付。
    const waterfallAt = (x: number, y: number) => this.waterfalls.checkForWaterfall(x, y);
    const warpOn = !this.isCpuRender() && this._waveCss !== null
      && waterWaves.quality > 0 && waveTexReady() && this.waterWarp.active();
    if (!warpOn) clearWaterWarpDebug();
    // 双 pass 共用同一时刻，避免动画帧错位（原版 PrepareDraw 每帧一次、两 pass 共享缓存）
    // warpMode 入参 = 表层逐格 bob 关闭（波动由全屏位移场交付）
    // 波光 glint 的场景亮度因子（obj19 :106-111 亮度项；地底暗光→glint→0）
    const glintLumAt = (tx: number, ty: number): number => {
      const [r, g, b] = this.lighting?.lightAt(tx, ty) ?? [192, 192, 192];
      return (r + g + b) / 765;
    };
    if (isBackground) {
      drawVanillaLiquids(this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this._liquidNow, isBackground,
        world.weather?.windSpeedCurrent ?? 0, this.waterStyle, waterfallAt, warpOn, glintLumAt, this.animTick);
    } else if (warpOn) {
      const fgCtx = this.waterWarp.beginFgPass(this.ctx);
      drawVanillaLiquids(fgCtx ?? this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this._liquidNow, isBackground,
        world.weather?.windSpeedCurrent ?? 0, this.waterStyle, waterfallAt, true, glintLumAt, this.animTick);
      if (fgCtx) this.waterWarp.endFgPass(this.ctx);
    } else {
      drawVanillaLiquids(this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this._liquidNow, isBackground,
        world.weather?.windSpeedCurrent ?? 0, this.waterStyle, waterfallAt, false, glintLumAt, this.animTick);
    }
  }

  /** 浸润带·实心层 pass（TileDrawing.Draw :528-529 solidLayer=true 语义）——
   *  在墙之后、tile 贴图之前画,方块贴图透明像素透出水色。
   *  与背景液体 pass(isBackground=true)的区别:那个画在墙之前(墙盖住带);
   *  这个画在墙之后(贴图盖住带,但透明处透出)——原版两层并存。
   *  只画浸润带(drawLiquidBehindTiles),不画水体本体(避免水在墙上方重复叠加) */
  private drawLiquidBehindSolidTiles(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.atlas) return;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts) + 5);
    drawLiquidBehindTilesOnly(this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this.waterStyle,
      (x, y) => this.waterfalls.checkForWaterfall(x, y));
  }

  /** 导线覆盖层(Main.cs:43543-43954 DrawWires 移植:四色行/连接掩码/多色淡化/致动器覆盖) */
  showWires = false;
  /** 宏伟蓝图拖拽预览(Game.render 注入;世界坐标 tile) */
  grandPreview: { from: [number, number]; to: [number, number]; mode: number } | null = null;

  /** 训练假人 tile 动态绘制层（TileDrawing.cs:4374-4399 addFrY 1:1）：tile 378 是
   *  视觉本体且【已摘出 chunk 烘焙】（ChunkCache bake skip）——本层每帧画当前动画行，
   *  与原版单层绘制同构。烘焙静止行垫底+动画行覆盖会产生"同朝向重影"：后仰姿态
   *  底部/边缘的透明像素透出烘焙层静止行（2026-08-23 用户实报）。
   *  行号：NPC 在场且摇晃 → FindFrame 488（NPC.cs:71516-71540）——dir=hitDir 依锚格
   *  frameX≥36 取反（:71518-71520，tile 变体即镜像朝向），步长 = dir==-1?4:6，
   *  帧=ceil(shake/步长)（shake 已在 dummyAI 钳 24），dir==1 再 +5（上半帧行）；
   *  无 NPC（槽满/未重召）或静止 → 行 0（原版 addFrY 仅 npc!=-1 时偏移）。
   *  变体列 = frameX≥36?36:0（Tiles_378 72px=左右两朝向各 36px），行高 54。
   *  逐格 16×16 采样 + DRAW_Y_OFFSET[378]=2 与原 tile 网格对齐（整块 32×48 直画会
   *  把 18px 步进的格间 padding 画进去，右列左移 2px 错位）。NPC 自身不画贴图。 */
  /** 动画墙统一动态层（2026-08-31 根治·墙版）：wallAnimRate≠0 的墙不进烘焙
   *  （ChunkCache 跳过），此处逐帧补画——取帧/掩码/变体全部复用 VanillaWallTiler
   *  .draw，与烘焙态像素等价。回声涂层门与烘焙侧逐字节同款。 */
  private drawAnimatedWallLayer(ctx: CanvasRenderingContext2D, world: World,
    cam: Camera, viewW: number, viewH: number, z: number, chunks: ChunkCache) {
    const st = world.store;
    const wt = chunks.wallTiler;
    if (!wt) return;
    const ts = TILE;
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts) - 1);
    const tx1 = Math.min(world.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts) - 1);
    const ty1 = Math.min(world.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        const wallId = st.wall[i];
        if (wallId === 0 || wallAnimRate(wallId) === 0) continue;
        if ((st.coat[i] & TileStore.COAT_INVISIBLE_WALL) !== 0 && !st.showInvisibleBlocks) continue;
        if (!wt.hasTexture(wallId)) continue;
        wt.draw(ctx, st, tx, ty, wallId, chunks.truncatesWalls, tx * ts, ty * ts);
      }
    }
  }

  /** 动画格统一动态层（2026-08-31 根治）：凡 isDynamicAnimSheet 的格子一律不进
   *  chunk 烘焙（ChunkCache 跳过），此处逐帧补画。215 篝火/207 喷泉的相位预加
   *  随格子迁入（原烘焙侧行为 1:1），其余族由 drawVanillaCell 内部 helper 路由
   *  （405/406/272/瀑布族 animYOffset…）。整屏世界坐标系绘制 = 无 chunk 边界
   *  裁剪，动画家具跨 chunk 的 2px 溢出行不再有陈旧副本。 */
  private drawAnimatedTileLayer(ctx: CanvasRenderingContext2D, world: World,
    cam: Camera, viewW: number, viewH: number, z: number,
    dev?: { zz: number; ox: number; oy: number; camRX: number; camRY: number }) {
    if (!this.atlas) return;
    const st = world.store;
    const atlas = this.atlas;
    const ts = TILE;
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts) - 1);
    const tx1 = Math.min(world.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts) - 1);
    const ty1 = Math.min(world.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts) + 1);
    // ★设备空间取整（2026-09-01 动态物件发丝缝定案）：静态瓦片走 chunk 缓存，
    //   共享边 = round(同一连续表达式) 恒等无缝（drawChunkGrid 注）；本层是唯一
    //   仍以世界坐标直绘的活绘路径——非整数缩放（z=1.27 / 低清 K=0.5）下格边
    //   落小数设备像素，各 drawImage 边独立最近邻取整 → 多格家具内部发丝缝
    //   （提取机/染料机横缝，用户截图 42）。接入同一 doctrine：退出缩放变换，
    //   逐格算共享边设备矩形（dxa/dxb 同 round 函数），格内内容以 s=宽/16 缩放
    //   回放——任意 zoom/相机下动态格边恒整数，且与 chunk 邻边同函数同值。
    const devOn = dev && (globalThis as { __SW_DYNSNAP_OFF?: boolean }).__SW_DYNSNAP_OFF !== true
      && (typeof location === 'undefined'
        || !new URLSearchParams(location.search).has('dynsnap0'));
    if (devOn) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        if (!st.flags[i]) continue;
        const type = st.type[i];
        const van = TILE_DEFS[type]?.vanilla;
        if (!van || !isDynamicAnimSheet(van.sheet)) continue;
        const sheet = van.sheet;
        // 相位预加族（原烘焙侧 1:1 迁入）：215 篝火帧行归位 / 207 喷泉逐 x 错相
        let fy = st.frameY[i];
        if (sheet === 215) fy = campfireYOffset(st.frameY[i]);
        else if (sheet === 207) fy = fountainYOffset(st.frameY[i], tx, st.frameX[i]);
        if (devOn) {
          const { zz, ox, oy, camRX, camRY } = dev!;
          const dxa = ox + Math.round((tx * ts - camRX) * zz);
          const dxb = ox + Math.round(((tx + 1) * ts - camRX) * zz);
          // ★tileTop 并入取整表达式（2026-09-01 缝终修）：画稿盒 = 格盒平移 dyOff
          //   （tileTop）。旧法在缩放变换内部 +dyOff——画稿上下边缘 = 格边界取整值
          //   ± dyOff·s（s=1.25 时 2.5 设备 px，分数）→ 相邻格分数边缘各自就近取整
          //   → 交界处 1 设备行缝隙（露背景）/重叠，随相机分数相位漂移（特定位置），
          //   整数缩放下 dyOff·s 恒整（无症状）。修 = 画稿盒上下边界直接以
          //   「世界 y + dyOff」进同一 round 表达式——共享边恒等、恒整数。
          const dyOff = tileTopOf(sheet, st.frameX[i], fy);
          const yda = oy + Math.round((ty * ts + dyOff - camRY) * zz);
          const ydb = oy + Math.round(((ty + 1) * ts + dyOff - camRY) * zz);
          // ★缝指认 instrumentation（__SEAMTRACE 数组时登记逐格 dest 矩形）
          const tr = (globalThis as { __SEAMTRACE?: unknown[] }).__SEAMTRACE;
          if (tr && tr.length < 20000) tr.push({ tx, ty, sheet: van.sheet, dxa, yda: oy + Math.round((ty * ts - camRY) * zz), dxb, ydb: oy + Math.round(((ty + 1) * ts - camRY) * zz) });
          ctx.save();
          ctx.translate(dxa, yda);
          ctx.scale((dxb - dxa) / ts, (ydb - yda) / ts);
          // 平移原点 = 画稿盒顶（含 dyOff）——drawVanillaCell 内部再加 dyOff 恰抵消,
          // 画稿落在 [yda, ydb) 整数盒内
          ctx.translate(-tx * ts, -(ty * ts + dyOff));
          drawVanillaCell(ctx, atlas, sheet, van.frame,
            van.fw ?? 1, van.fh ?? 1,
            st, tx, ty, type,
            (t) => t === type || frameMergesWith(type, t),
            tx * ts, ty * ts, st.frameX[i], fy,
            { treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
              worldSurface: world.groundLevel, worldW: world.w, rockLevel: world.rockLevel });
          ctx.restore();
        } else {
          drawVanillaCell(ctx, atlas, sheet, van.frame,
            van.fw ?? 1, van.fh ?? 1,
            st, tx, ty, type,
            (t) => t === type || frameMergesWith(type, t),
            tx * ts, ty * ts, st.frameX[i], fy,
            { treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
              worldSurface: world.groundLevel, worldW: world.w, rockLevel: world.rockLevel });
        }
      }
    }
    if (devOn) ctx.restore();
  }

  private drawDummyTileAnim(ctx: CanvasRenderingContext2D, world: World, entities: Entity[],
    cam: Camera, viewW: number, viewH: number, z: number,
    dev?: { zz: number; ox: number; oy: number; camRX: number; camRY: number }) {
    const img = this.atlas?.ensureVImage('vanilla/Tiles_378.png');
    if (!img) return;
    const st = world.store;
    const DUMMY = TILE_BY_KEY['v_378_target_dummy'];
    if (DUMMY === undefined) return;
    // 锚点 → 假人 NPC（摇晃状态源）
    const byAnchor = new Map<number, Enemy>();
    for (const ent of entities) {
      const e = ent as Enemy;
      if (!(ent instanceof Enemy) || e.dead || e.vanillaId !== 488 || !e.dummyAnchor) continue;
      byAnchor.set(e.dummyAnchor[1] * 100000 + e.dummyAnchor[0], e);
    }
    const ts = TILE;
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts) - 1);
    const tx1 = Math.min(world.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts) - 1);
    const ty1 = Math.min(world.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts) + 1);
    const dy = DRAW_Y_OFFSET[378] ?? 0;
    // ★设备空间 doctrine（同 drawAnimatedTileLayer,2026-09-02 结构性约束）:
    //  save + setTransform 恒等 → 全程设备矩形 → restore。2c''.5 块 ambient ctx
    //  处于【世界变换】,dev 数学若裸跑=双重变换恒画屏外(训练假人隐形,
    //  2026-09-02 用户实报)——dev 数学与空间包装【必须成对】,结构闸门
    //  tests/dynsnap-space-wrapper.test.ts 强制(凡用 dev.ox 的绘制函数必须含
    //  恒等 setTransform + restore)。无 dev 时世界坐标直画=可见降级
    //  (对齐 doctrine 源的 else 分支,绝不静默消失);devOn 逃生门同源。
    const devOn = !!dev
      && (globalThis as { __SW_DYNSNAP_OFF?: boolean }).__SW_DYNSNAP_OFF !== true
      && (typeof location === 'undefined'
        || !new URLSearchParams(location.search).has('dynsnap0'));
    if (devOn) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        // ★幽灵保域（2026-09-03）：原版主绘制循环 active() 门同款——幽灵残型不画
        if (!st.flags[i] || st.type[i] !== DUMMY || st.frameY[i] !== 0 || st.frameX[i] % 36 !== 0) continue;
        const flip = st.frameX[i] >= 36;
        const e = byAnchor.get(ty * 100000 + tx);
        let row = 0;
        if (e && e.dummyShake > 0) {
          const dir = (flip ? -1 : 1) * e.dummyHitDir;   // 0=未定向（原版 num139=0：步长 6、无 +5）
          const step = dir === -1 ? 4 : 6;
          row = Math.ceil(e.dummyShake / step);
          if (row > 0 && dir === 1) row += 5;
          row = Math.min(10, row);                       // 表 11 行；公式上限 9
        }
        const vx = flip ? 36 : 0;
        for (let cy = 0; cy < 3; cy++) {
          for (let cx = 0; cx < 2; cx++) {
            const r = this.atlas!.vframeAt(378, vx + cx * 18, row * 54 + cy * 18);
            if (!r) continue;
            if (devOn) {
              const wx = (tx + cx) * ts, wy = (ty + cy) * ts + dy;
              const dxa = dev!.ox + Math.round((wx - dev!.camRX) * dev!.zz);
              const yda = dev!.oy + Math.round((wy - dev!.camRY) * dev!.zz);
              const dxb = dev!.ox + Math.round((wx + ts - dev!.camRX) * dev!.zz);
              const ydb = dev!.oy + Math.round((wy + ts - dev!.camRY) * dev!.zz);
              ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh,
                dxa, yda, dxb - dxa, ydb - yda);
            } else {
              // 无 dev:世界坐标直画（可见降级,对齐 doctrine 源 else 分支）
              ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh,
                (tx + cx) * ts, (ty + cy) * ts + dy, ts, ts);
            }
          }
        }
      }
    }
    if (devOn) ctx.restore();
  }

  private drawWires(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.showWires || !this.atlas) return;
    const wires = this.atlas.ensureVImage('vanilla/WiresNew.png');
    const actuatorImg = this.atlas.ensureVImage('vanilla/Actuator.png');
    if (!wires) return;
    const st = world.store;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const ctx = this.ctx;
    const has = (x: number, y: number, bit: number) => st.inBounds(x, y) && (st.wire[st.idx(x, y)] & bit) !== 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        const b = st.wire[i];
        const colors = b & 15;
        if (!colors && !(b & 16)) continue;
        let n = 0;
        for (let c = 0; c < 4; c++) if (colors & (1 << c)) n++;
        let drawn = 0;
        for (let c = 0; c < 4; c++) {
          const bit = 1 << c; // 红0 蓝1 绿2 黄3(图集行序,Main.cs:43641 等)
          if (!(colors & bit)) continue;
          drawn++;
          // 行 Y = 色行*18;分线盒/像素盒额外行偏移(Main.cs:43596-43616)
          let rowY = c * 18;
          const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
          if (sh === 424) rowY += 72 + Math.floor(st.frameX[i] / 18) * 72;
          else if (sh === 445) rowY += 72;
          // 连接掩码(Main.cs:43621-43640):上+18 右+36 下+72 左+144
          let mask = 0;
          if (has(tx, ty - 1, bit)) mask += 18;
          if (has(tx + 1, ty, bit)) mask += 36;
          if (has(tx, ty + 1, bit)) mask += 72;
          if (has(tx - 1, ty, bit)) mask += 144;
          if (n > 1) ctx.globalAlpha = 1 / n; // 多色同格淡化(桥带略)
          ctx.drawImage(wires, mask, rowY, 16, 16, tx * ts, ty * ts, ts, ts);
          ctx.globalAlpha = 1;
        }
        if ((b & 16) && actuatorImg) {
          ctx.drawImage(actuatorImg, 0, 0, 16, 16, tx * ts, ty * ts, ts, ts);
        }
      }
    }
  }

  /** 宏伟蓝图 L 路径预览:先纵后横 + 端点(massWireOperation dir=true 同构);
   *  剪线=蓝、致动器=绿、四色铺线=红,半透明格覆盖 */
  private drawGrandPreview() {
    const gp = this.grandPreview;
    if (!gp) return;
    const ctx = this.ctx;
    const ts = TILE;
    const cells: Array<[number, number]> = [];
    const [fx, fy] = gp.from;
    const [tx, ty] = gp.to;
    const sy = Math.sign(ty - fy), sx = Math.sign(tx - fx);
    for (let y = fy; y !== ty; y += sy) cells.push([fx, y]);
    for (let x = fx; x !== tx; x += sx) cells.push([x, ty]);
    cells.push([tx, ty]);
    const color = gp.mode & TOOL_CUTTER
      ? 'rgba(140,160,255,0.30)'
      : (gp.mode & 15) === 0 ? 'rgba(80,220,120,0.30)' // 仅致动器
        : 'rgba(255,70,70,0.30)';
    ctx.fillStyle = color;
    for (const [x, y] of cells) ctx.fillRect(x * ts, y * ts, ts, ts);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
  }

  /** 瀑布贴图（tile 层后、实体前；扫描窗口外扩 100 格在内部，30 帧节流） */
  private drawWaterfalls(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.atlas) return;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const now = this._liquidNow; // 与液体双 pass 同帧同时刻
    this.waterfalls.findWaterfalls(world.store, tx0, ty0, tx1, ty1, Math.floor(now / 16.67));
    this.waterfalls.draw(this.ctx, this.atlas, world.store, world.groundLevel, now, this.waterStyle);  // 群系水色→瀑布贴图(通道表偏移)
    // 岩浆瀑布发光(AddLight :1075-1080:r≈0.55×0.4 脉动,g=r×0.3,b=r×0.1 橙光;
    // mouseTextColor 闪烁项取定值近似)——非岩浆瀑布 litCells 为空,零开销
    const lit = this.waterfalls.litCells;
    if (lit.length) {
      const r = 0.22;
      for (let k = 0; k < lit.length; k += 2) {
        this.lighting?.addLight(lit[k], lit[k + 1], r, r * 0.3, r * 0.1);
      }
    }
  }
  /** 本帧液体动画时刻（双 pass 共享） */
  private _liquidNow = 0;
  /** 群系水色（CalculateWaterStyle，Main.cs:56845；每帧由场景标志+昼夜+深度算出） */
  waterStyle = 0;
  /** 光照引擎引用(Game 创建后回填;岩浆瀑布 AddLight 消费) */
  lighting: import('../lighting/LightingEngine').LightingEngine | null = null;
  /** 切换迟滞（DrawBG_HandleBackgroundTransition :63508-63533 的 bgDelay 语义：
   *  原版水色本身硬切,但持续 30t(≈0.5s)偏好不变才提交切换,切后 60t 冷却不再响应——
   *  群系边界来回抖动时不闪切;森林族 60t 差异省略,统一 30t 近似） */
  private wsDelay = 0;
  /** 群系水色 1:1（Main.CalculateWaterStyle :56766-56824；喷泉/血月柱并入） */
  private updateWaterStyle(world: World, cam: { y: number }): void {
    // ★拍照模式手动群系档直供（文件头③消费缺口补齐 2026-08-25）：DirtLayer/
    //    RockLayer/BloodMoon 的水色走深度/昼夜派生链,合成 scene 表达不了——
    //    捕获重渲通道直接取所选群系水色（原版 DrawCapture 直改 Main.waterStyle）
    if (this._capturePass) {
      const cb = this.captureMode.activeBiome();
      if (cb) {
        this.waterStyle = cb.waterStyle;
        this.wsDelay = 0;
        return;
      }
    }
    const f = this.scene;
    if (!f) return;
    // 喷泉（:56766-56770）：ActiveFountainColor ≥ 0 直接短路返回——无 bgDelay 迟滞，
    // 立即生效立即失效；水色 id 与群系水色同一空间（0 普通 … 13 地狱）
    const fountain = f.fountainColor ?? -1;
    if (fountain >= 0) {
      this.waterStyle = fountain;
      this.wsDelay = 0;
      return;
    }
    // 血月柱（SceneMetrics.BloodMoonMonolith → Main.cs:61417 并入 BloodMoonActive；
    // CalculateWaterStyle 的血月分支读 Main.bloodMoon——柱激活时同色 9，白夜也生效。
    // 来源用本帧视区扫描 monoScan（ScanOnScreenTiles 语义）而非 169×124 窗口的近似值）
    const bloodMoon = (!!world.clock?.bloodMoon || !!f.bloodMoonMonolith || this.monoScan.bloodMoonMonolith);
    const dayTime = world.clock ? world.clock.isDay : true;
    let target = 0;
    if (bloodMoon && !dayTime) target = 9;
    else if (f.zoneCorrupt) target = 2;            // bgStyle 1/5
    else if (f.zoneJungle) target = 3;             // bgStyle 3
    else if (f.zoneCrimson) target = 10;           // bgStyle 8/14
    else if (f.zoneHallow) target = 4;             // bgStyle 6/13
    else if (f.zoneSnow) target = 5;               // bgStyle 7
    else if (f.zoneDesert) target = f.belowSurface ? 12 : 6;  // bgStyle 2（地下→地下沙漠）
    else if (f.zoneUnderworldHeight) target = 13;  // bgStyle 4（地狱）
    else {
      // default:岩层+40 以下 → 发光蘑菇区 7 / 洞穴 8;地下 → 7;地表 → 0
      // 深度取相机中心 tile Y（原版 SceneMetrics.TileCenter）
      const ty = Math.floor(cam.y / TILE);
      if (ty > world.rockLevel + 40) target = f.zoneGlowshroom ? 7 : 8;
      else target = f.belowSurface ? 7 : 0;
    }
    // bgDelay 迟滞（:63440-63449 + :63508）：冷却期只倒数;偏好持续 30t 才提交
    if (this.wsDelay < 0) {
      this.wsDelay++;
    } else if (target !== this.waterStyle) {
      this.wsDelay++;
      if (this.wsDelay > 30) {
        this.wsDelay = -60;      // 提交切换,进入 60t 冷却
        this.waterStyle = target;
      }
    } else {
      this.wsDelay = 0;          // 偏好与当前一致,计数清零
    }
  }
  /** 远端玩家（Game.render 每帧注入；单机空数组零开销） */
  remotePlayers: Player[] = [];
  /** 本帧有浮漂弹在场的玩家集合（render 入口逐帧重建——ItemCheck_HackHoldStyles
   *  Player.cs:53483-53492 的渲染侧快照：竿+浮漂在场 → holdStyle 置 1 静持画竿） */
  bobberOwners = new Set<unknown>();
  /** Main.netMode != 0（Game 每帧注入 net?.active）——队伍发色剂单机恒取 teamColor[0]
   *  （DyeInitializer.cs:334 `Main.netMode != 0 ? player.team : 0`） */
  netActive = false;
  /** 地图头像发色剂头带 scratch（40×32，每帧重画） */
  private headStripScratch: HTMLCanvasElement | null = null;
  /** 主角引用（Game.render 每帧注入；克脑四镜像 Main.cs:24799-24843 取玩家中心） */
  mainPlayer: Player | null = null;
  /** 高尔夫蓄力显示（Game 注入：力度条 + 预测线；Main.cs:30690-30721/:42933-42966） */
  golfPower: { x: number; y: number; rel: number; ball: import('../entities/GolfBall').GolfBall } | null = null;
  /** 光照合成 ImageData 复用(尺寸变化才重建) */
  private _lightImg: ImageData | null = null;
  /** CPU 乘光循环 x 侧采样参数缓存（只依赖 px，每帧预计算一次——原每像素重算；
   *  2026-08-22 软渲染瓶颈分析：乘循环 5.7ms/帧=55% 帧时。尺寸变化才重建。
   *  ★权重必须 Float64：Float32 存储会把 1−fx2 舍入 → 乘积末位漂移 →
   *    逐位一致性破功（微基准实证 3 字节/4M 差） */
  private _clXO: Int32Array | null = null;
  private _clXO1: Int32Array | null = null;
  private _clWX0: Float64Array | null = null;
  private _clWX1: Float64Array | null = null;
  /** 满亮行旗（光照图逐行 AND，255=整行全白 → 恒等乘行级跳过；尺寸随 h2 重建） */
  private _clRowWhite: Uint8Array | null = null;

  /** 墓碑：以底部中心为支点按倾角旋转绘制（翻滚/侧躺/倒扣）。
   *  优先原版 Tiles_85 样式块——四格 16×16 无缝拼到离屏画布再绘制
   *  （直接取 34×34 矩形会把表内 2px 间隙画成十字缝），程序化仅兜底 */
  private tombstoneCache = new Map<number, HTMLCanvasElement>();
  private drawTombstone(t: Tombstone) {
    const ctx = this.ctx;
    ctx.save();
    // 投射物旋转原点 = 中心（Projectile.Draw 语义）
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.angle);
    const styleCol = t.style * 2; // Tiles_85 样式块起点列（style 0-10 → 偶数列 0-20）
    let img: CanvasImageSource | null = this.tombstoneCache.get(styleCol) ?? null;
    if (!img && this.atlas) {
      // 无缝拼接四格（表内 stride 18：格间有 2px 间隙需跳过）
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d')!;
      let ok = true;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const fr = this.atlas.vframeAt(85, (styleCol + dx) * 18, dy * 18);
          if (!fr) { ok = false; break; }
          cx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, dx * 16, dy * 16, 16, 16);
        }
      }
      if (ok) { this.tombstoneCache.set(styleCol, c); img = c; }
    }
    if (img) {
      ctx.drawImage(img, -16, -16, 32, 32);
    } else {
      const pc = getTombstoneCanvas();
      ctx.drawImage(pc, -8, -11, 16, 22);
    }
    ctx.restore();
  }

  /** Gore 死亡碎块（Main.DrawGore Main.cs:21712-21742）。世界变换内世界坐标绘制，
   *  光照合成在后自动受光（同 wind-sway/natureParticles 层）。贴图多帧行取
   *  GorePiece.frameRows（1217/1218 等竖条）；落地不归零 rotation（Gore.cs 无此步，
   *  翻滚随 vx 摩擦冻结）。 */
  private drawGorePieces(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
    if (!this.atlas) return;
    const pieces = liveGorePieces();
    if (!pieces.length) return;
    const z = cam.zoom;
    // 视区外剔除（扩半贴图防边缘闪断）
    const x0 = cam.x - viewW / 2 - 64, x1 = cam.x + viewW / 2 + 64;
    const y0 = cam.y - viewH / 2 - 64, y1 = cam.y + viewH / 2 + 64;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const p of pieces) {
      if (p.dead) continue;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      this.drawGorePiece(ctx, p, z);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawGorePiece(ctx: CanvasRenderingContext2D, p: GorePiece, z: number) {
    const img = this.atlas!.ensureVImage(`vanilla/Gore_${p.goreId}.png`);
    if (!img || !(img.width > 0) || img.width === 0) return;
    const rows = p.frameRows;
    const fh = img.height / rows;
    const sh = Math.floor(fh);
    const sw = img.width;
    // Gore.GetAlpha（:1486）：opacity = (255 - alpha)/255；
    // 16/17 火苗（:1487-1490 返回 Color(255,255,255,0)）——XNA 预乘混合 A=0 即加性
    // 全亮（1405 同处取场景光照 RGB，Gore.cs:1164-1174；此处从 1456）→ canvas 'lighter'
    ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
    ctx.globalAlpha = Math.max(0, (255 - p.alpha) / 255);
    if (p.rotation === 0 && p.scale === 1) {
      // 直绘路径（Main.cs:21706-21742 原点即贴图中心：落点 + 尺寸/2）
      ctx.drawImage(img, 0, p.row * sh, sw, sh, p.x, p.y, sw, sh);
      return;
    }
    ctx.save();
    ctx.translate(p.x + (sw * p.scale) / 2, p.y + (sh * p.scale) / 2);
    if (p.rotation) ctx.rotate(p.rotation);
    if (p.scale !== 1) ctx.scale(p.scale, p.scale);
    ctx.drawImage(img, 0, p.row * sh, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    void z;
  }

  // ===================== 原版 Dust 绘制（Main.DrawDust :38266-38436）=====================
  /** Game 侧注入（Game 构造后赋值；缺省 = 无尘） */
  vanillaDust: import('../fx/VanillaDust').VanillaDust | null = null;
  /** 8×8 像素重着色暂存（GetAlpha 常色精确化：261/6/264 等非 255 通道） */
  private dustScratch: HTMLCanvasElement | null = null;
  private dustScratch2: HTMLCanvasElement | null = null;
  /** 尘染料帧缓存（ArmorColored 静态族；key=dyeVid|fx|fy，256 上限） */
  private dustDyeCache: Map<string, HTMLCanvasElement> | null = null;
  /** 预乘 AlphaBlend 烘焙对缓存（Main.DrawDust spriteBatch=BlendState.AlphaBlend 预乘混合）。
   *  key=fx,fy + 乘数字节化(mR,mG,mB,mA)——alphaOf/colorPass 乘数与 XNA shader 输出同为
   *  8bit 精度;每 帧×档 一次性烘焙,稳态运行零 getImageData。上限 2048,溢出走分代 LRU
   *  （dustPmCacheTouch/Evict：命中重插入+逐出最旧 1/4——2026-09-02 红队 finding 清偿,
   *  旧整体 clear 会让多色键周期打穿时每键重烘 1×getImageData=帧尖峰）。 */
  private dustPmCache: Map<string, { add: HTMLCanvasElement; erase: HTMLCanvasElement }> | null = null;
  private dustPmBake: HTMLCanvasElement | null = null;

  /** 取/烘一帧的预乘对。mr/mg/mb/ma ∈0-1 = XNA Draw 的 Color 入参逐通道
   *  （alphaOf.rgb → 三通道同值;colorPass/331 贴片 → 逐通道色）。 */
  private dustPremulPair(
    img: CanvasImageSource, fx: number, fy: number, mr: number, mg: number, mb: number, ma: number,
  ): { add: HTMLCanvasElement; erase: HTMLCanvasElement } {
    const mR = Math.round(Math.max(0, Math.min(1, mr)) * 255);
    const mG = Math.round(Math.max(0, Math.min(1, mg)) * 255);
    const mB = Math.round(Math.max(0, Math.min(1, mb)) * 255);
    const mA = Math.round(Math.max(0, Math.min(1, ma)) * 255);
    const key = `${fx},${fy},${mR},${mG},${mB},${mA}`;
    this.dustPmCache ??= new Map();
    const hit = this.dustPmCache.get(key);
    if (hit) { dustPmCacheTouch(this.dustPmCache, key); return hit; }   // LRU 访问序
    const bake = (this.dustPmBake ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    const bc = bake.getContext('2d', { willReadFrequently: true })!;
    bc.clearRect(0, 0, 8, 8);
    bc.drawImage(img, fx, fy, 8, 8, 0, 0, 8, 8);
    const baked = dustPremulBake(bc.getImageData(0, 0, 8, 8).data, mR, mG, mB, mA);
    const addC = document.createElement('canvas'); addC.width = 8; addC.height = 8;
    const addCtx = addC.getContext('2d')!;
    const addIm = addCtx.createImageData(8, 8); addIm.data.set(baked.add);
    addCtx.putImageData(addIm, 0, 0);
    const eraseC = document.createElement('canvas'); eraseC.width = 8; eraseC.height = 8;
    const eraseCtx = eraseC.getContext('2d')!;
    const eraseIm = eraseCtx.createImageData(8, 8); eraseIm.data.set(baked.erase);
    eraseCtx.putImageData(eraseIm, 0, 0);
    const entry = { add: addC, erase: eraseC };
    dustPmCacheEvict(this.dustPmCache);   // 分代 LRU:超 2048 逐最旧 1/4(非整体清空)
    this.dustPmCache.set(key, entry);
    return entry;
  }

  /** 预乘对两步绘制（须在尘变换内调用;ox/oy = origin 偏移,缺省 −4 = 原版 (4,4)）。
   *  mul = Color×k 档（同乘擦除强度与加性项——XNA 里 Color×k 逐通道含 α,如 264
   *  拖影 GetAlpha×0.3）。出口复位 gCO/globalAlpha。 */
  private drawDustPremul(
    ctx: CanvasRenderingContext2D, pair: { add: HTMLCanvasElement; erase: HTMLCanvasElement },
    mul = 1, ox = -4, oy = -4,
  ): void {
    ctx.globalAlpha = mul;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(pair.erase, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(pair.add, ox, oy);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** DrawDust 单尘（屏幕空间，经 worldToScreen + zoom）。fullbright pass 画在
   *  光照合成后（= 原版 type 6/15/59-64 强制 White :38406）；lit pass 画在合成前
   *  （逐像素乘光 ≈ 原版逐尘取光）。两段共用本体（GetAlpha）+ 自定义色
   *  （GetColor :2773 加性钳位）双 pass。屏外矩形（±1000/±1050）外尘直接失活
   *  （:38272-38284 Intersects 语义）。
   *  ★2026-09-02 预乘混合语义校正：XNA AlphaBlend = One/InverseSourceAlpha 预乘,
   *  final = dst×(1−texA×cA) + texP.rgb×cRGB（tex.rgb 预乘含 texA;c.a 只进 dst 因子,
   *  c.rgb 全额加法不乘 c.a）——旧实现 source-over 把加性项额外乘了 c.a（src 被压暗;
   *  实测对公式最大偏差 38/255,a 小时呈半透灰）。canvas 精确等价 = 烘焙对两步
   *  （'destination-out' 擦 + 'lighter' 叠,dustPremulBake）。A=0 无色族 'lighter'
   *  加性通道（下分支）本式 a=0 特例,保持不变;a>0 全量档（本体/拖影/colorPass/
   *  331 贴片）全部换烘焙对;染料 pass（shader 产物面）维持 source-over 不变式;
   *  Color.White 档（331 白心/纯白 drawImage）预乘=直色恒等,维持原样。 */
  private drawVanillaDustPass(fullbright: boolean, cam: Camera, player?: Player): void {
    const vd = this.vanillaDust;
    if (!vd) return;
    const img = this.atlas?.ensureVImage('vanilla/Dust.png');
    if (!img || !(img.width > 0) || img.width === 0) return;
    const ctx = this.ctx;
    // 剔除矩形（:38268-38269：视口外扩 ±1000/±1050，世界坐标）
    const worldW = cam.viewW / cam.zoom, worldH = cam.viewH / cam.zoom;
    const left = cam.x - worldW / 2 - 1000, top = cam.y - worldH / 2 - 1050;
    const s1 = (this.dustScratch ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    // 尘染料缓存（ArmorColored 静态族：输出与 uTime 无关 → 按 dyeVid|帧 缓存；
    // 动态族（彩虹/凝胶/反射等）逐帧跑真字节码）。key 含 fx/fy（帧三行变体）
    this.dustDyeCache ??= new Map();
    if (this.dustDyeCache.size > 256) this.dustDyeCache.clear();
    const s2 = (this.dustScratch2 ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    const c1 = s1.getContext('2d', { willReadFrequently: true })!;
    const c2 = s2.getContext('2d', { willReadFrequently: true })!;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const d of vd.each(fullbright)) {
      if (d.x < left || d.x > left + worldW + 2000 || d.y < top || d.y > top + worldH + 2100) {
        d.active = false;   // :38424-38430 出界失活
        continue;
      }
      const [px, py] = cam.worldToScreen(d.x, d.y);
      // ★双轴通道消费位（2026-09-03 VDust 双轴基建）：带 scaleX/scaleY 的尘
      //  （PrettySparkle 编排粒子族）画旋转双臂星芒（PrettySparkleParticle.Draw
      //  :61-94 逐值,见 drawSparkleArms）——不走 Dust.png 帧/拖影/染料/colorPass
      //  各档（编排池粒子无此四面）
      const axis = dustAxisScale(d);
      if (axis.dual) {
        this.drawSparkleArms(d, px, py, axis.sx, axis.sy);
        continue;
      }
      const { rgb, a, rgbv } = VanillaDust.alphaOf(d);
      // ★N 批:rgbv 三通道（183 (50,0,0)/255 纯红、258 (150,50,50)/255——GetAlpha
      // 字面彩色档);标量档 rgbv=undefined → 三通道全取标量,零回归
      const mR = rgbv ? rgbv[0] : rgb, mG = rgbv ? rgbv[1] : rgb, mB = rgbv ? rgbv[2] : rgb;
      if (a <= 0.004 && !d.color) {
        // A=0 加性族（182/206/230/58/110-114/311-313：GetAlpha 恒 (255,255,255,0)
        // 型、不读尘 α）——XNA 预乘 AlphaBlend 纯加法（α=0 惯用法，非"纯光照尘
        // 不可见"）；canvas 等价 = RGB×rgb、α 通道保留贴图羽化、'lighter' 叠画
        if (Math.max(mR, mG, mB) <= 0.004) continue;
        c1.clearRect(0, 0, 8, 8);
        c1.drawImage(img, d.fx, d.fy, 8, 8, 0, 0, 8, 8);
        const ida = c1.getImageData(0, 0, 8, 8);
        for (let i = 0; i < ida.data.length; i += 4) {
          ida.data[i] = ida.data[i] * mR;
          ida.data[i + 1] = ida.data[i + 1] * mG;
          ida.data[i + 2] = ida.data[i + 2] * mB;
        }
        c1.putImageData(ida, 0, 0);
        ctx.save();
        ctx.translate(px, py);
        if (d.rotation) ctx.rotate(d.rotation);
        if (d.scale !== 1) ctx.scale(d.scale, d.scale);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s1, -4, -4);
        ctx.restore();
        continue;
      }
      // 本体 pass（GetAlpha 精确通道）——预乘烘焙对（本体+通用拖影共用一份,
      //  拖影只是重画同色;264 ×0.3 档走 mul 参数,不另烘）
      const pair = this.dustPremulPair(img, d.fx, d.fy, rgb, rgb, rgb, a);
      // 速度拖影链（★2026-08-24 r15 R15-20：M57:39537-39658 if/else-if 六族——
      //   本体绘制前的残影带,通式 i<min(10,(|vx|+|vy|)·0.3·10)、位置−velocity·i、
      //   scale×(1−i/10)、origin(4,4)）：
      //   130-134(:39537)/278(:39553) 无门；219-223(:39570)/264(:39592)/
      //   226||272(:39614)/331(:39639) 要求 fadeIn==0。264 特例:计数无 0.3 系数
      //   (|v|·10)、色=GetAlpha×0.3 再 GetColor 双画、origin(5,5)；226||272 带
      //   customData Color 档色=GetColor(GetAlpha(light))（=本仓 colorPass 画布）；
      //   331 色=GetColor(GetAlpha(White)) 不取光照（本仓 331 本体已按 lit 管线
      //   近似——头注登记,拖影随本体同管线）
      const trailN = dustTrailCount(d);
      if (trailN > 0) {
        const trailCp = (d.type === 226 || d.type === 272) && d.color
          ? VanillaDust.colorPass(d, rgb, a) : null;
        for (let j = 0; j < trailN; j++) {
          const [tx, ty] = cam.worldToScreen(d.x - d.vx * j, d.y - d.vy * j);
          const sc = d.scale * (1 - j / 10);
          ctx.save();
          ctx.translate(tx, ty);
          if (d.rotation) ctx.rotate(d.rotation);
          ctx.scale(sc, sc);
          if (d.type === 264) {
            this.drawDustPremul(ctx, pair, 0.3, -5);   // GetAlpha(light)×0.3 基画（mul 同乘擦除+加性=Color×0.3）
            // :39612 GetColor(color4) 入参 = GetAlpha×0.3（与基画同色）——曾漏 ×0.3 折减
            const cp264 = VanillaDust.colorPass(d, rgb * 0.3, a * 0.3);
            if (cp264 && cp264.a > 0.004) {
              const p264 = this.dustPremulPair(img, d.fx, d.fy, cp264.r, cp264.g, cp264.b, cp264.a);
              this.drawDustPremul(ctx, p264, 1, -5);   // GetColor 叠画
            }
          } else if (d.type === 331 && d.color) {
            // :39650-39652 331 拖影色 = GetColor(GetAlpha(White)):GetAlpha(White)=
            // (255−alpha)…,GetColor 再减 (255−该值) → 净 = clamp(color.ch − dust.alpha)。
            // 不取光照（自发光族）;曾落通用 s1=GetAlpha(light) 桶
            const c = d.color;
            const tr = Math.max(0, c.r - d.alpha) / 255;
            const tg = Math.max(0, c.g - d.alpha) / 255;
            const tb = Math.max(0, c.b - d.alpha) / 255;
            const ta = Math.max(0, Math.min(255, c.a - d.alpha)) / 255;
            const p331t = this.dustPremulPair(img, d.fx, d.fy, tr, tg, tb, ta);
            this.drawDustPremul(ctx, p331t);
          } else if (trailCp) {
            const ptc = this.dustPremulPair(img, d.fx, d.fy, trailCp.r, trailCp.g, trailCp.b, trailCp.a);
            this.drawDustPremul(ctx, ptc);
          } else {
            this.drawDustPremul(ctx, pair);
          }
          ctx.restore();
        }
      }
      ctx.save();
      ctx.translate(px, py);
      if (d.rotation) ctx.rotate(d.rotation);
      if (d.scale !== 1) ctx.scale(d.scale, d.scale);
      this.drawDustPremul(ctx, pair);            // 预乘本体（erase+lighter 两步）
      ctx.restore();
      // 染料 pass（GetSecondaryShader：SM2 字节码 63 pass 全技术 1:1——含彩虹
      // uTime 动态/凝胶相位/反射光照/HallowBoss 双采样。静态 ArmorColored 族走
      // 缓存。uDirection=玩家 facing（ArmorShaderData.Apply 尾段 entity 语义））
      if (d.dyeVid > 0) {
        const dyeEmu = dyeApplyOf(d.dyeVid);
        if (dyeEmu) {
          const isStatic = dyeEmu.tech === 'ArmorColored' || dyeEmu.tech === 'ArmorColoredDefault';
          const key = `${d.dyeVid}|${d.fx}|${d.fy}`;
          let canvas: HTMLCanvasElement | null | undefined = isStatic ? this.dustDyeCache!.get(key) : undefined;
          if (canvas === undefined) {
            dyeEmu.uniforms.uTime = (performance.now() / 1000) % 3600;
            dyeEmu.uniforms.uDirection = player ? player.facing : 1;
            if (dyeEmu.tech === 'ArmorReflective' || dyeEmu.tech === 'ArmorReflectiveColor') {
              dyeEmu.uniforms.uLightSource = player ? this.reflectiveLightSource(player) as [number, number, number, number] : [0, 0, 0, 0];
            }
            const extra = dyeEmu.needsImage1 ? [this.hallowRampSampler() ?? undefined] : [];
            c2.clearRect(0, 0, 8, 8);
            c2.drawImage(img, d.fx, d.fy, 8, 8, 0, 0, 8, 8);
            const idd = c2.getImageData(0, 0, 8, 8);
            if (applyDyePass(idd.data, 8, 8, dyeEmu, extra,
              { sx: d.fx, sy: d.fy, sheetW: img.width, sheetH: img.height })) {
              c2.putImageData(idd, 0, 0);
              if (isStatic) {
                const cc = document.createElement('canvas'); cc.width = 8; cc.height = 8;
                cc.getContext('2d', { willReadFrequently: true })!.drawImage(s2, 0, 0);
                this.dustDyeCache!.set(key, cc);
                canvas = cc;
              } else canvas = null;   // 动态族直接用 s2 现画
            } else canvas = null;
          }
          if (canvas !== null) {
            ctx.save();
            ctx.translate(px, py);
            if (d.rotation) ctx.rotate(d.rotation);
            if (d.scale !== 1) ctx.scale(d.scale, d.scale);
            ctx.drawImage(canvas ?? s2, -4, -4);
            ctx.restore();
            continue;   // 染料 pass 取代本体+colorPass（shader 输出即最终色）
          }
        }
      }
      if (d.type === 331) {
        // :39670-39692 五贴片专属绘制（自发光族,全亮桶不受光）：
        //   四向 ±2px（世界像素,×zoom）贴 GetAlpha(dust.color)=sprite×color×num、
        //   A=clamp(color.a−alpha);白心 = Color.White 原帧——曾走通用 lit 管线+colorPass
        //   （头注登记「331 绘制端拖影/四向贴片未建模」清偿 2026-09-01）
        const c = d.color;
        const zoom = cam.zoom;
        if (c) {
          const num = (255 - d.alpha) / 255;
          const pa = Math.max(0, Math.min(255, c.a - d.alpha)) / 255;
          const p331 = this.dustPremulPair(img, d.fx, d.fy,
            (c.r / 255) * num, (c.g / 255) * num, (c.b / 255) * num, pa);
          for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
            ctx.save();
            ctx.translate(px + ox * zoom, py + oy * zoom);
            if (d.rotation) ctx.rotate(d.rotation);
            if (d.scale !== 1) ctx.scale(d.scale, d.scale);
            this.drawDustPremul(ctx, p331);
            ctx.restore();
          }
        }
        ctx.save();                              // 白心:Color.White 原帧,不受光
        ctx.translate(px, py);
        if (d.rotation) ctx.rotate(d.rotation);
        if (d.scale !== 1) ctx.scale(d.scale, d.scale);
        ctx.drawImage(img, d.fx, d.fy, 8, 8, -4, -4, 8, 8);
        ctx.restore();
        continue;                                // vanilla 331 无 GetColor 叠画
      }
      // 自定义色 pass（GetColor :2773：clamp(color.ch − (255 − base.ch)) 后再乘贴图）
      //  ——GetColor 是第二次独立 SpriteBatch.Draw：同预乘语义,同烘焙对（独立档）
      const cp = VanillaDust.colorPass(d, rgb, a);
      if (cp && (cp.a > 0.004)) {
        const cpPair = this.dustPremulPair(img, d.fx, d.fy, cp.r, cp.g, cp.b, cp.a);
        ctx.save();
        ctx.translate(px, py);
        if (d.rotation) ctx.rotate(d.rotation);
        if (d.scale !== 1) ctx.scale(d.scale, d.scale);
        this.drawDustPremul(ctx, cpPair);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** PrettySparkleParticle.Draw（PrettySparkleParticle.cs:61-94）1:1 臂几何（几何式
   *  抽出为模块级纯函数 sparkleArmGeometry 供单测直测）——VDust
   *  双轴通道（scaleX/scaleY 任一在位,fx/VanillaDust.ts 接口注）的唯一消费位。
   *  原版逐值（Scale=Vector2、Rotation=float,两臂都乘【整个】Vector2 Scale）：
   *    num     = GetLerpValue(0,FadeInEnd,t)×GetLerpValue(FadeOutEnd,FadeOutStart,t)
   *              （:70-71 寿命包络）——本池无 TTL 载体,通道折算进 alpha 域：
   *              num=(255−alpha)/255（alpha=0 通道缺省 → num=1 全臂;产尘方按需动画）
   *    vector  = (0.3,2)×num×Scale  → 水平臂,旋转 π/2+Rotation（:72/:80）
   *    vector2 = (0.3,1)×num×Scale  → 垂直臂,旋转 0+Rotation（:73/:84）
   *    第二层同臂几何 ×0.6（:88/:92）。
   *  色（XNA 预乘 AlphaBlend）：color2 = ColorTint×Opacity×0.5×num（:66/:74）+
   *  ★dst 衰减项（R3 ③清偿 2026-09-03）：color2.A = ColorTint.A×Op×0.5×(1−
   *  AdditiveAmount)（:67;AdditiveAmount=d.psAdditive,池缺省 1f PrettySparkleParticle
   *  .cs:20/:43）——本层 BlendState.AlphaBlend（Main.cs:63205）下 A 只进 dst 因子
   *  = 'destination-out' erase 项（fillRect 实心域=既登记臂形近似同域,texA≈1）;
   *  rgb 加色贡献与 A 无关,两 pass 精确。逐站：红臂 0.498×0.5×0.65≈0.16×Op×num
   *  （kind1 :681 additive=0.35）/金臂 additive=缺省 1f → A=0 无衰减（ParticleOrchestrator
   *  .cs:698-721 无写入）/公主·星尘 ColorTint.A=0 → 0。原版各编排站 ColorTint.A=0 →
   *  纯加色;ColorTint=d.color,池缺省 Transparent=无 tint 臂不画）；
   *  color3 = White×Opacity×0.9×0.5×num（:63/:69 白核;A=(int)(255·Op·0.9)/2/2
   *  非零——erase 项 ≤0.22·texA·num 不建模,纯加色近似登记）。
   *  ★臂形近似（登记）：XNA 拉伸=贴图尺寸×scale（Extra_98=72×72 星芒羽化贴图）,
   *  本仓以 fillRect 实心矩形近似臂形（任务批定案"两笔 fillRect 近似臂形状,臂几何
   *  逐值"）;贴片升级路径 = sparkleTintedTex 染色缓存+隔离式 stroke（prettyStarSparkle
   *  同款）,待消费站接线批按缓存压力定夺。★尺寸口径：与本 pass 尘精灵同约定
   *  （8×8 帧直画,不乘 cam.zoom）→ 臂像素 = 72×scale。★Opacity 档（2026-09-03
   *  补齐）：psFadeInNorm/psFadeOutNorm 逐粒 Opacity 包络（PrettySparkleParticle
   *  .Update :54-56 GetLerpValue(0,FadeInNormalizedTime,t/TTL)×GetLerpValue(1,
   *  FadeOutNormalizedTime,t/TTL)）——undefined = FetchFromPool 缺省 0.05/0.9;
   *  包络 t（:70 t=_timeSinceSpawn/TimeToLive×60）由 psAge/（ttl+psAge）×60 精确,
   *  取代旧"envT=60−ttl"（等价于 TTL=60 特例）。★DrawVerticalAxis：psDrawVert
   *  false 只画水平臂（:86/:713 拍击石 kind1 双臂）。 */
  private drawSparkleArms(d: import('../fx/VanillaDust').VDust,
    px: number, py: number, sx: number, sy: number): void {
    const ctx = this.ctx;
    // ★prettySparkle 档包络（PrettySparkleParticle.cs:53-77 1:1）：t=拍数（归一 ×60）、
    //  num = GetLerpValue(0,FadeInEnd,t)×GetLerpValue(FadeOutEnd,FadeOutStart,t)、
    //  Opacity = GetLerpValue(0,FadeInNorm,t01)×GetLerpValue(1,FadeOutNorm,t01)
    //  ——逐粒参数（psFadeInEnd 等）undefined 时落 FetchFromPool 缺省 20/30/45、
    //  0.05/0.9；通用档（非 prettySparkle 双轴尘）num=(255−alpha)/255 不变
    let num: number;
    let op = 1;
    if (d.prettySparkle) {
      const age = d.psAge ?? 0;
      const ttl0 = (d.ttl ?? 60) + age;                  // TimeToLive 初值
      const tN = ttl0 > 0 ? (age / ttl0) * 60 : 60;      // :70 t=_timeSinceSpawn/TTL×60
      const t01 = ttl0 > 0 ? age / ttl0 : 1;             // :54 归一比
      // ★R3 ⑥（2026-09-03）：补 from==to 分支——Utils.GetLerpValue（Utils.cs:315-341,
      //  clamped:true）原文 if(from<to){t<from→0;t>to→1} else {t<to→1;t>from→0} 落
      //  (t−from)/(to−from)。旧式 (tN−a)/(b−a) 纯除在 from==to 时 t<from 侧给 0
      //  （应 1）、t==from 给 NaN——包络端点档（如 psFadeOutEnd==psFadeOutStart）判废
      const lv = (a: number, b: number): number => {
        if (a < b) {
          if (tN < a) return 0;
          if (tN > b) return 1;
        } else {
          if (tN < b) return 1;
          if (tN > a) return 0;
        }
        return (tN - a) / (b - a);
      };
      num = Math.max(0, Math.min(1,
        lv(0, d.psFadeInEnd ?? 20) * lv(d.psFadeOutEnd ?? 45, d.psFadeOutStart ?? 30)));
      op = Math.max(0, Math.min(1,
        lv(0, d.psFadeInNorm ?? 0.05) * lv(1, d.psFadeOutNorm ?? 0.9)));
    } else {
      num = Math.max(0, Math.min(1, (255 - d.alpha) / 255));
    }
    if (num <= 0) return;
    const g = sparkleArmGeometry(sx, sy, num);
    const rot = d.rotation;
    const c = d.color;
    const tint = c ? `rgb(${c.r},${c.g},${c.b})` : null;   // ColorTint（A=0 纯加色档）
    const tintA = 0.5 * op * num;                          // color2 = ColorTint×Opacity×0.5×num
    const coreA = 0.45 * op * num;                         // color3 = White×0.9×0.5×num×num
    // ★R3 ③（2026-09-03）：color2.A dst 衰减项（PrettySparkleParticle.cs:67——
    //  color2.A = ColorTint.A×Op×0.5×(1−AdditiveAmount);本层 AlphaBlend Main.cs:63205
    //  下 A 只进 dst 因子 → 'destination-out' erase。fillRect 实心域=既登记臂形近似
    //  同域（texA≈1）;rgb 加色贡献与 A 无关。逐站：红 0.498×0.5×0.65≈0.16×Op×num、
    //  金 additive=缺省 1f → 0、公主/星尘 ColorTint.A=0 → 0。白核 color3.A 项维持
    //  既登记"不建模"（≤0.22·texA·num）不动。
    const additive = d.psAdditive ?? 1;
    const eraseA = c ? (c.a / 255) * 0.5 * op * num * (1 - additive) : 0;
    const arm = (rotArm: number, len: number, style: string | null, alpha: number, wMul: number, hMul: number,
      erase = 0): void => {
      if (!style || alpha <= 0.004) return;
      const w = Math.max(1, g.hx * wMul), h = Math.max(1, len * hMul);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotArm);
      if (erase > 0.004) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = Math.min(1, erase);
        ctx.fillStyle = '#000';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = style;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    };
    const vert = d.psDrawVert !== false;                   // DrawVerticalAxis（:26 缺省 true）
    if (vert) arm(rot, g.vy, tint, tintA, 1, 1, eraseA);           // :84 垂直臂×ColorTint
    arm(Math.PI / 2 + rot, g.hy, tint, tintA, 1, 1, eraseA);       // :80 水平臂×ColorTint
    if (vert) arm(rot, g.vy, '#FFFFFF', coreA, 0.6, 0.6);  // :92 白核 ×0.6
    arm(Math.PI / 2 + rot, g.hy, '#FFFFFF', coreA, 0.6, 0.6);   // :88 白核 ×0.6
  }

  // ===================== FlameParticle（山羊坐骑 47 火焰本体层）=====================
  /** Projectile_326/327/328 染料基底 + ×(60/255) 预染双缓存。
   *  key = `${tex}:${vid}`（vid = 坐骑染料 vid，−1 = 无染料档——染料更换/卸下各一档） */
  private flameDyeCache = new Map<string, { base: ImageBitmap | HTMLImageElement | HTMLCanvasElement; glow: HTMLCanvasElement | null }>();

  /** FlameParticle.Draw（FlameParticle.cs:53-68）1:1——世界变换内直画（世界坐标，
   *  原版 ParticleSystem 的 AnchorPosition=−screenPosition 平移即此意）。
   *  逐份：offset = (RandomInt(−2,3), RandomInt(−2,3)) × Scale（:61，种子 =
   *  TileFrameSeed ^ (x<<32|y) :57），origin = (w/2, h−2)（SetBasicInfo :33），
   *  rotation 恒 0（FetchFromPool 复位、编排器不写）。
   *  色 (120,120,120,60)（:55）在 XNA 预乘混合下 rgb:alpha = 2:1（源比覆盖亮一倍）
   *  → canvas 两 pass 精确等价：① source-over 基底 α=(60/255)×lerp；
   *  ② 'lighter' ×(60/255) 预染 α=lerp——两 pass rgb 合计 = 基底×(120/255)×lerp，
   *  覆盖衰减只走 ①（TileFlames 的 A=0 纯加色推导同族）。
   *  坐骑染料（:62 drawData.shader = _packedShaderIndex → :64 SetShaderForData(player)
   *  绑定 GameShaders.Armor 染料；packedShaderIndex = player.cMount，编排器
   *  ParticleOrchestrator.cs:3271 SetTypeInfo 第三参传入）——染料只变换**贴图像素**，
   *  DrawData 基色 (120,120,120,60)×lerp 照常相乘，故本仓 = 基底烘焙（dye 非空时
   *  applyDyeToImageData 预染缓存，与 cWings 翅膀染料 wingTexSource 同款路径） +
   *  原两 pass 不变。dye 由调用点从 player.inv.miscDyes[3] 取（Player.cs:9300
   *  cMount = miscDyes[3].dye——坐骑染料槽下标 3，非 4）。 */
  /** FadingParticle.Draw（FadingParticle.cs:57-66）1:1——ParticleSystem_World_
   *  OverPlayers 层（屏幕空间 cam 变换,与全亮 dust pass 同段）。逐份：
   *  position = AnchorPosition+LocalPosition,followPlayerIndex!=-1 时 += player[
   *  followPlayerIndex].MountedCenter（:59-63——本仓传 player,取 cx/cy 中心等价）;
   *  color = ColorTint × GetLerpValue(0,FadeInNorm,t/TTL) × GetLerpValue(1,
   *  FadeOutNorm,t/TTL)（:64——fullbright=false 时 ColorTint.MultiplyRGB(
   *  Lighting.GetColor(LocalPosition.ToTileCoordinates())) 乘位置光照,lightAt 同源）;
   *  贴图原尺 × Scale 中心锚 + Rotation。
   *  XNA 预乘 AlphaBlend 的 canvas 等价（α=0 纯加法惯用法 + erase 精确补 A>0 档）：
   *   · tintA ≤ 0 → 'lighter' 画 tint 预染副本（rgb×tint 烘焙,alpha 保留）×env；
   *   · tintA > 0 → 先 'destination-out' 原贴图 ×(tintA/255×env)（dst ×=
   *     (1−texA·tintA·env),精确补出预乘 dst 衰减项）再 'lighter' 加色。
   *  Delay 段不画（原版 Draw 无 Delay 门但 Scale=Vector2.Zero 起步零可见面,双保险）。
   *  ★R3 ⑤c（2026-09-03）：followPlayerIndex/fullbright 光照乘两承载接入（现行两站
   *  SetTypeInfo 缺省 fullbright=true、不写 followPlayerIndex=零行为,为 :919 系站
   *  （Spawn_PaladinsShieldHit :921 followPlayerIndex=num 等）预留）。 */
  private drawFadingParticles(cam: Camera, player?: Player): void {
    const atlas = this.atlas;
    if (!atlas) return;
    let any = false;
    for (const f of fadingParticles.each()) { any = true; break; }
    if (!any) return;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    /** tint 预染烘焙缓存（multiply+destination-in,flameDyeCache 同式;
     *  key = texKey|r|g|b——rgb 相同的环带站共享一份） */
    const tintedOf = (texKey: string, r: number, g: number, b: number): HTMLCanvasElement | null => {
      const img = atlas.ensureVImage(texKey);
      if (!img || (img as { width: number }).width <= 0) return null;
      const key = `${texKey}|${r}|${g}|${b}`;
      const hit = this.fadingTintCache.get(key);
      if (hit) return hit;
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cc = c.getContext('2d', { willReadFrequently: true });
      if (!cc) return null;
      cc.imageSmoothingEnabled = false;
      cc.drawImage(img, 0, 0);
      cc.globalCompositeOperation = 'multiply';
      cc.fillStyle = `rgb(${r},${g},${b})`;
      cc.fillRect(0, 0, c.width, c.height);
      cc.globalCompositeOperation = 'destination-in';
      cc.drawImage(img, 0, 0);
      this.fadingTintCache.set(key, c);
      if (this.fadingTintCache.size > 64) this.fadingTintCache.clear();
      return c;
    };
    for (const f of fadingParticles.each()) {
      if (f.delay > 0) continue;
      const t01 = f.timeSinceSpawn / f.timeToLive;
      const env = fadingAlphaFactor(t01, f.fadeIn, f.fadeOut);
      if (env <= 0.004) continue;
      // ★R3 ⑤c：fullbright=false → ColorTint.MultiplyRGB(Lighting.GetColor(...))
      //  （FadingParticle.cs:64）——lightAt 0-255 域 /255 归一乘（RGB 通道,A 不乘）
      let tr = f.tintR, tg = f.tintG, tb = f.tintB;
      if (!f.fullbright) {
        const lt = this.lighting?.lightAt(Math.floor(f.x / 16), Math.floor(f.y / 16))
          ?? [255, 255, 255];
        tr = (tr * lt[0]) / 255; tg = (tg * lt[1]) / 255; tb = (tb * lt[2]) / 255;
      }
      const tinted = tintedOf(f.texKey, Math.round(tr), Math.round(tg), Math.round(tb));
      if (!tinted) continue;
      // ★R3 ⑤c：followPlayerIndex != -1 → position += player.MountedCenter
      //  （FadingParticle.cs:60-63;本仓 MountedCenter≈中心 cx/cy,Game.ts:12821 同口径）
      const ride = f.followPlayerIndex !== -1 && player;
      const [px, py] = cam.worldToScreen(ride ? f.x + player.cx : f.x, ride ? f.y + player.cy : f.y);
      ctx.save();
      ctx.translate(px, py);
      if (f.rot) ctx.rotate(f.rot);
      if (f.scaleX !== 1 || f.scaleY !== 1) ctx.scale(f.scaleX, f.scaleY);
      if (f.tintA > 0) {
        // 预乘 dst 衰减项（erase）——原贴图 alpha × tintA/255 × env
        const raw = atlas.ensureVImage(f.texKey);
        if (raw && (raw as { width: number }).width > 0) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = Math.min(1, (f.tintA / 255) * env);
          ctx.drawImage(raw as CanvasImageSource, -tinted.width / 2, -tinted.height / 2);
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, env);
      ctx.drawImage(tinted, -tinted.width / 2, -tinted.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  private fadingTintCache = new Map<string, HTMLCanvasElement>();

  private drawFlameParticles(dye: DyeApply | null): void {
    const atlas = this.atlas;
    if (!atlas) return;
    let any = false;
    for (const f of flameParticles.each()) { any = true; break; }
    if (!any) return;
    const ctx = this.ctx;
    const seedBase = currentTileFrameSeed();
    const vidKey = dye ? dye.vid : -1;
    /** 染料基底（无染料 = 原图）+ ×(60,60,60) 预染 glow，按 (tex, vid) 缓存 */
    const source = (tex: number, img: ImageBitmap | HTMLImageElement) => {
      const key = `${tex}:${vidKey}`;
      const hit = this.flameDyeCache.get(key);
      if (hit) return hit;
      let base: ImageBitmap | HTMLImageElement | HTMLCanvasElement = img;
      let glow: HTMLCanvasElement | null = null;
      if (typeof document !== 'undefined') {
        if (dye) {   // 染料烘焙（DrawData.shader → ArmorShaderData.Apply 等价）
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const cc = c.getContext('2d', { willReadFrequently: true });
          if (cc) {
            cc.imageSmoothingEnabled = false;
            cc.drawImage(img, 0, 0);
            const id = cc.getImageData(0, 0, c.width, c.height);
            this.applyDyeToImageData(id.data, c.width, c.height, dye);
            cc.putImageData(id, 0, 0);
            base = c;
          }
        }
        const g = document.createElement('canvas');
        g.width = img.width; g.height = img.height;
        const gc = g.getContext('2d');
        if (gc) {
          gc.imageSmoothingEnabled = false;
          gc.drawImage(base, 0, 0);
          gc.globalCompositeOperation = 'multiply';
          gc.fillStyle = `rgb(60,60,60)`;
          gc.fillRect(0, 0, g.width, g.height);
          gc.globalCompositeOperation = 'destination-in';
          gc.drawImage(base, 0, 0);
          glow = g;
        }
      }
      const entry = { base, glow };
      if (this.flameDyeCache.size > 32) this.flameDyeCache.clear();   // 3 贴图 × 染料档，容量闸防膨胀
      this.flameDyeCache.set(key, entry);
      return entry;
    };
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const f of flameParticles.each()) {
      const img = atlas.ensureVImage(`vanilla/Projectile_${f.tex}.png`);
      if (!img || !(img.width > 0) || img.width === 0) continue;
      const lerp = flameFadeOutFactor(f.timeSinceSpawn / f.timeToLive, f.fadeOut);
      if (lerp <= 0) continue;
      const { base, glow } = source(f.tex, img);
      // :57 种子 = TileFrameSeed ^ ((ulong)X << 32 | (uint)Y)——与 tile 火苗同源同节拍
      const seed = seedBase
        ^ ((BigInt.asUintN(64, BigInt(Math.trunc(f.x))) << 32n)
          | BigInt.asUintN(32, BigInt(Math.trunc(f.y))));
      const box = { s: seed };
      const ox = img.width / 2, oy = img.height - 2;   // SetBasicInfo :33
      const alphaBase = (60 / 255) * lerp;
      for (let k = 0; k < 4; k++) {                                  // :59 四份抖动副本
        const dx = randomInt(box, -2, 3) * f.scale;
        const dy = randomInt(box, -2, 3) * f.scale;
        ctx.save();
        ctx.translate(f.x + dx, f.y + dy);
        if (f.scale !== 1) ctx.scale(f.scale, f.scale);
        ctx.globalAlpha = alphaBase;                                  // ① 覆盖 pass
        ctx.drawImage(base, -ox, -oy);
        if (glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = lerp;                                     // ② 加性 pass
          ctx.drawImage(glow, -ox, -oy);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 小动物：原版 NPC 纵向帧条动画（移动时循环全帧，静止首帧；贴图默认朝左镜像） */
  /** 大血条比例 1.5 的类型（Main.cs:45228-45298：Boss 与大型怪） */
  private static readonly HB_BIG_SCALE = new Set([
    4, 35, 36, 50, 113, 114, 125, 126, 127, 128, 129, 130, 131, 222, 262, 266,
    245, 246, 247, 248, 249, 564, 565, 551, 576, 577, 87, 510, 454, 621, 439, 370,
  ]);
  /** NPCAddHeight（Main.cs:21840-22005）：血条在脚底 +10 之上的额外下沉（视觉修正） */
  /** DrawNPC switch 内的绘制侧 num47 覆写（Main.cs:23445-23477,覆盖 NPCAddHeight 值;
   *  血条直接调 NPCAddHeight 不经过此段 → 只入绘制路径不入 HB_ADD_H） */
  private static readonly DRAW_NUM47_OVERRIDE: Record<number, number> = {
    555: -5, 556: -5, 557: -5,
    561: -8, 562: -8, 563: -8,
    566: -2, 567: -2,   // DD2 骷髅头冠(:23438-23441,2026-08-30 审计补)
    568: -3, 569: -3,
    570: -2, 571: -2,
    572: -4, 573: -4,
    578: -2,
    620: -9,            // case 620(:23561-23563)+origin 平移 -4·sdir
  };

  private static readonly HB_ADD_H: Record<number, number> = {
    125: 30, 126: 30, 54: 2, 205: 8, 182: 24, 178: 2, 6: 26, 173: 26, 94: 14,
    7: 13, 8: 13, 9: 13, 98: 13, 99: 13, 100: 13, 95: 13, 96: 13, 97: 13,
    10: 8, 11: 8, 12: 8, 13: 26, 14: 26, 15: 26, 175: 4, 520: 2,
    412: 18, 413: 18, 414: 18, 48: 32, 49: 4, 51: 4, 60: 10,
    62: 14, 66: 14, 156: 14, 63: 4, 64: 4, 103: 4, 65: 5, 69: 4, 70: -4, 72: -2,
    83: 20, 84: 20, 150: 10, 151: 10, 158: 10, 152: 6, 153: 2, 154: 2,
    165: 10, 237: 10, 238: 10, 240: 10, 531: 10, 39: 26, 40: 26, 41: 26,
    87: 56, 88: 56, 89: 56, 90: 56, 91: 56, 92: 56, 134: 30, 135: 30, 136: 30, 169: 8,
    174: 6, 369: 2, 376: 6, 579: -2, 612: 2, 613: 2,
    269: -2, 270: -2, 271: -2, 274: -2, 277: -2,
    671: 10, 672: 10, 673: 10, 674: 10, 675: 10,   // 笼中鸟族（switch 尾 :22385-22389,曾漏）
  };

  /** 受伤实体血条（DrawInterface_14_EntityHealthBars Main.cs:45203 + DrawHealthBar :21748）：
   *  life != lifeMax 即显示（无时间衰减——原版打到没满血就一直显示）；画在脚底
   *  +10+NPCAddHeight；填充 36px×比例；绿→黄→红渐变（:21766-21778）；光照亮度调
   *  alpha（:45417 Brightness）。蠕虫段不画（头部血条代表全链）；毁灭者原版为
   *  全链共享一条（destroyerHB 平滑），此处近似画在头下。专家档克脑 266 不画
   *  （Main.cs:45321 `(!expertMode || type != 266)` 门——有四镜像在,血条会穿帮）。 */
  private drawHealthBar(e: { cx: number; cy: number; y: number; h: number; hp: number; maxHp: number; vanillaId: number | null; wormFollow?: Enemy['wormFollow']; spriteBottomWorld?: number }, expert = false) {
    const hp = e.hp, maxHp = e.maxHp;
    if (hp <= 0 || hp >= maxHp) return;
    if (e.wormFollow) return;
    if (expert && e.vanillaId === 266) return;   // Main.cs:45321
    if (!this.atlas) return;
    const hb1 = this.atlas.ensureVImage('vanilla/HealthBar1.png');
    const hb2 = this.atlas.ensureVImage('vanilla/HealthBar2.png');
    if (!hb1 || !hb2) return;
    const vid = e.vanillaId ?? 0;
    const scale = Renderer.HB_BIG_SCALE.has(vid) ? 1.5 : 1;
    const x = e.cx - 18 * scale;
    // 原版条位 = 盒底+10+NPCAddHeight（num47 已含该类型贴图下沉量,鸟妖 32/双子 30…
    // ——2026-08-24 中心锚勘误后贴图底=盒底+num47+帧半高,若仍对全体取 max(贴图底+6)
    // 会把条推到帧底透明边距之下=比原版低 20-40px）。max 兜底只服务【校准偏差族】
    // （EoC 4:+23/+30 用户校准下移,num47=0 原版公式够不着眼球底）
    const y = Math.max(e.y + e.h + 10 + (Renderer.HB_ADD_H[vid] ?? 0),
      (vid === 4 && e.spriteBottomWorld) ? e.spriteBottomWorld + 6 : -Infinity);
    const fill = Math.max(0, Math.min(36, Math.floor((36 * hp) / maxHp)));  // num2
    // 光照 alpha（Brightness = 中心格最大通道/255；8 档量化控 tint 缓存规模）
    let aQ = 1;
    if (this.lighting) {
      const [lr, lg, lb] = this.lighting.lightAt(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
      // ★R8-40:vanilla Brightness = GlobalBrightness×(X+Y+Z)/3（LT57:118-122 三通道
      // 平均,非 max 通道）——蓝火把 (0,0.1,1.3) 下原版 ≈0.56、max 读法 ≈1.56
      aQ = Math.round(((lr + lg + lb) / (3 * 255)) * 7) / 7;
    }
    // 全黑也留一点可见度（光照区外 lightAt=0 的兜底）——自造辅助,登记（原版全黑暗条）
    if (aQ <= 0) aQ = 0.15;
    // 颜色（:21766-21778）：n=hp%-0.1；>0.5 绿满红减，否则红满绿增
    let n = hp / maxHp - 0.1;
    n = Math.max(0, Math.min(1, n));
    const r = Math.round(n > 0.5 ? 255 * (1 - n) * 2 : 255);
    const g = Math.round(n > 0.5 ? 255 : 255 * n * 2);
    const tint = (img: CanvasImageSource, tex: string, sx: number, sw: number) =>
      this.tintedSprite(`hb${tex}|f${fill}|a${aQ}`, { img, sx, sy: 0, sw, sh: 12 }, [r, g, 0]);
    const ctx = this.ctx;
    ctx.globalAlpha = 0.95 * aQ;
    if (fill < 34) {
      // :21814-21828：背景两段（fill 处 2px 帽 + 余量）+ 填充两段（主体 + 末端 2px）
      const a = tint(hb2, '2', 2, 2), b = tint(hb2, '2', fill + 2, 36 - fill - 2),
        c1 = tint(hb1, '1', 0, fill - 2), d = tint(hb1, '1', 32, 2);
      if (a) ctx.drawImage(a.c, a.x, a.y, a.w, a.h, x + fill * scale, y, 2 * scale, 12 * scale);
      if (b) ctx.drawImage(b.c, b.x, b.y, b.w, b.h, x + (fill + 2) * scale, y, (36 - fill - 2) * scale, 12 * scale);
      if (fill > 2 && c1) ctx.drawImage(c1.c, c1.x, c1.y, c1.w, c1.h, x, y, (fill - 2) * scale, 12 * scale);
      if (d) ctx.drawImage(d.c, d.x, d.y, d.w, d.h, x + (fill - 2) * scale, y, 2 * scale, 12 * scale);
    } else {
      // :21830-21836：fill≥34 全长填充 + 尾部背景
      const e2 = tint(hb2, '2', fill, 36 - fill), f = tint(hb1, '1', 0, fill);
      if (e2) ctx.drawImage(e2.c, e2.x, e2.y, e2.w, e2.h, x + fill * scale, y, (36 - fill) * scale, 12 * scale);
      if (f) ctx.drawImage(f.c, f.x, f.y, f.w, f.h, x, y, fill * scale, 12 * scale);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 拴绳实体绘制（LeashedEntity.DrawEntities Main.cs:22163 消费；本体绘制 =
   * LeashedCritter.Draw :190-206 的 DrawNPCDirect 近似）：
   *  - 小动物：NPC 表逐帧切片，sprite 中心 = Center + (0, 8 - h/2)（CopyToDummy
   *    :171 的 position 换算），叠加 GetDrawOffset（halfBrick 贴地/悬停 bobbing/
   *    水黾贴液面）、Recall/帝皇蝶渐隐 Opacity、飞行族 rotation、Fly 族随机 scale；
   *    入水/出水提示气泡 Gore_413（LeashedCritter.DrawBubble :213-223）
   *  - 微光之灵 677：DrawNPCDirect_Faeling（Main.cs:26306-26362）四列表 + oldPositions 拖尾
   *  - 风筝：Main.DrawKite :36614-37069 全量（锚绳 FishingLine 分段 + 逐型 Extra 绳尾）
   */
  private drawLeashedEntities(
    leashed: import('../entities/LeashedCritter').LeashedEntityManager,
    world: World,
    clipL: number, clipT: number, clipR: number, clipB: number,
  ) {
    const ctx = this.ctx;
    // DrawEntities :474-491：只画激活 section 内且落在（屏幕矩形外扩 512）中的实体
    const visible = (ax: number, ay: number, cx: number, cy: number): boolean =>
      leashed.isSectionActive(ax, ay)
      && cx >= clipL && cx <= clipR && cy >= clipT && cy <= clipB;
    const env = {
      timeForVisualEffects: visEffectFrames(),
      dayTime: world.clock.isDay,
      worldSurface: world.groundLevel,
      windForVisuals: world.weather?.windSpeedCurrent ?? 0,
      cloudAlpha: world.weather?.cloudAlpha ?? 0,
      playerCx: this.mainPlayer?.cx ?? 0,
      playerCy: this.mainPlayer?.cy ?? 0,
      addLight: () => { /* 绘制期不点光（update 期已推 LightingEngine） */ },
    };
    for (const e of leashed.kites) {
      if (visible(e.ax, e.ay, e.cx, e.cy)) this.drawLeashedKite(ctx, e, world);
    }
    for (const e of leashed.critters) {
      if (!visible(e.ax, e.ay, e.cx, e.cy)) continue;
      if (e.npcType === 677) {
        // 微光之灵走 DrawNPCDirect_Faeling（GetDrawOffset 对该族恒 0：hover 参数为 0，
        // halfBrick 贴地从略——备案）；DrawBubble 判定与其余族共用
        this.drawLeashedFaeling(ctx, e, world);
        this.drawLeashedBubble(ctx, e, world, 0, 0);
        continue;
      }
      const fr = this.atlas?.vnpc(e.drawNpcType, e.frame);
      if (!fr) continue;
      const off = e.getDrawOffset(env);
      const w = fr.sw * e.scale;
      const h = fr.sh * e.scale;
      // 精灵中心 = Center + (0, 8 - h/2)（LeashedCritter.CopyToDummy :171）
      const cx = e.cx + off.dx;
      const cy = e.cy + 8 - e.h / 2 + off.dy;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, e.opacity));
      ctx.translate(cx, cy);
      if (e.rotation !== 0) ctx.rotate(e.rotation);
      ctx.scale(e.spriteDirection === 1 ? -1 : 1, 1); // NPC 贴图默认朝左（spriteDirection==1 翻转）
      ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
      ctx.restore();
      this.drawLeashedBubble(ctx, e, world, off.dx, off.dy);
    }
  }

  /**
   * DrawBubble（LeashedCritter.cs:213-223 + DrawBubble :295-307）：tile 取 _dummy.Center
   * （= Center+(0,8)+netOffset+GetDrawOffset——Draw :205 先叠偏移再走 ShouldDrawBubble/
   * DrawBubble，故贴点随 GetDrawOffset 一致沉浮），判定走 leashedBubbleVisible
   * （★1457 ShouldDrawBubble/TileRequiresBubble 全量）；★1457 档缩放 num2 =
   * max(1, max(frame.Size()*scale/(rect.Size()-8)))（大个体泡放大），颜色 =
   * Lighting.GetColor(tileCoords)
   */
  private drawLeashedBubble(
    ctx: CanvasRenderingContext2D,
    e: import('../entities/LeashedCritter').LeashedCritterEntity,
    world: World, dx: number, dy: number,
  ) {
    const st = world.store;
    const gore = this.atlas?.vmisc('vanilla/Gore_413.png');
    if (!st || !gore) return;
    // ★1457 LeashedCritter.cs:43 drawBubble 旗（Turtle/AquaticWalker/WaterStrider
    //   三族 ctor 置 false）→ ShouldDrawBubble :215 首门
    if (e.proto.drawBubble === false) return;
    const tx = Math.floor(e.cx / 16), ty = Math.floor((e.cy + 8) / 16);
    if (!leashedBubbleVisible(st, e.cx, e.cy, !!e.proto.isAquatic)) return;
    const light = this.lighting ? this.lighting.lightAt(tx, ty) : [255, 255, 255];
    // GetColor 乘法着色（tint 量化缓存，同 NPC color pass 的 tintedSprite 管线）
    const q = [Math.round(light[0] / 8) * 8, Math.round(light[1] / 8) * 8, Math.round(light[2] / 8) * 8];
    const tinted = this.tintedSprite('gore413', gore, q);
    // ★1457 (:301-306)：帧体尺寸取当前动画帧切片；缺帧档（图集未就绪）退 1 倍登记
    const nf = this.atlas?.vnpc(e.drawNpcType, e.frame);
    const tier = bubbleScaleTier(nf?.sw ?? 0, nf?.sh ?? 0, e.scale, gore.sw, gore.sh);
    const w = gore.sw * tier, h = gore.sh * tier;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(e.cx + dx, e.cy + 8 + dy);      // _dummy.Center = Center+(0,8)+偏移
    if (tinted) ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /**
   * DrawNPCDirect_Faeling（Main.cs:26306-26362）——NPC 677 四列×五行表：
   *  列 0 = 本体图案、列 1 = 翅膀、列 2 = 白色光晕体、列 3 = 闪烁 sparkle
   *  （行 whoAmI%5 与行 1 两张）。拖尾取 ShimmerFlyLeashedCritter.oldPositions
   *  （:56-62 临时换入 _dummy.oldPos），54→5 步进 3 共 17 段正弦环绕渐隐。
   *  合成走 faelingPremultLayer（XNA 预乘语义，见 drawFaeling 块注）；原版
   *  LeashedCritter.Draw → DrawNPCDirect 直通（:199）不走 GetAlpha = 全亮，
   *  不乘光照（旧 lm 乘法已摘）；rotation = 0（CopyToDummy :176 硬置）。
   */
  private drawLeashedFaeling(
    ctx: CanvasRenderingContext2D,
    e: import('../entities/LeashedCritter').LeashedCritterEntity,
    world: World,
  ) {
    const img = this.atlas ? this.atlas.ensureVImage('vanilla/NPC_677.png') : null;
    if (!img) return;
    const cvs = this.faelingCanvases();
    if (!cvs) return;
    void world;
    const ROWS = 5;                                 // num=5（:26310-26311）
    const t = visEffectFrames();
    const cx = e.cx, cy = e.cy + 8;                 // dummy.Center = Center + (0,8)（CopyToDummy :171）
    const num2 = (((e.whoAmI * 0.11 + t / 360) % 1) + 1) % 1;   // :26312
    const core = hslRgb(num2, 1, 0.65);
    const frame = Math.max(0, Math.min(ROWS - 1, e.frame));
    const draw = (col: number, row: number, x: number, y: number, scale: number,
      mr: number, mg: number, mb: number, ma: number, flip: boolean) =>
      this.faelingPremultLayer(ctx, img, cvs[0], cvs[1], col, row, x, y,
        mr, mg, mb, ma, scale, 0, flip);
    // ---- 拖尾（:26321-26347）：列 2 光晕 × 彩虹 × num14×0.16，A=0 纯加算 ----
    const old = e.oldPositions;
    if (old && old.length > 0) {
      const num3 = old.length;                       // TrailCacheLength[677] = 60
      const num4 = num3 - 1 - 5;                     // 54
      let num7 = 32, num8 = 16;
      const fromMax = Math.hypot(num7, num8);
      let num9 = Math.hypot(old[num4].x - e.cx, old[num4].y - e.cy);
      num9 = remapClamped(num9, 0, fromMax, 0, 100);
      num9 = Math.floor(num9 / 5) * 5 / 100;         // (int)num9/5 → *5 → /100
      num8 *= num9; num7 *= num9;
      for (let i = num4; i >= 5; i -= 3) {
        if (i >= old.length) continue;
        const num14 = remapClamped(i, 0, num3, 1, 0);
        const num15 = 1 - num14;
        // spinningpoint = (sin(whoAmI/17 + t/9 + num14·4π)·num8, -num7)·num15，再 RotatedBy(π)
        const spX = Math.sin(e.whoAmI / 17 + t / 9 + num14 * 2 * Math.PI * 2) * num8 * num15;
        const spY = num7 * num15;
        const vx = -spX, vy = spY;                   // RotatedBy(π) = 取反
        const c3 = hslRgb((num2 + num15 * 0.5) % 1, 1, 0.5);
        const k = num14 * 0.16;
        draw(2, 0, cx + old[i].x - e.cx + vx, cy + old[i].y - e.cy + vy,
          remapClamped(num14 * num14, 0, 1, 0, 2.5) * e.scale,
          c3[0] * 255 * k, c3[1] * 255 * k, c3[2] * 255 * k, 0, e.spriteDirection !== 1);
      }
    }
    // ---- 三层本体 + 双光晕（:26348-26361）----
    draw(2, 0, cx, cy, e.scale, 255, 255, 255, 0, e.spriteDirection !== 1);
    draw(1, frame, cx, cy, e.scale, 255, 255, 255, 127 / 255, e.spriteDirection !== 1);
    draw(0, frame, cx, cy, e.scale,
      core[0] * 255, core[1] * 255, core[2] * 255, 127 / 255, e.spriteDirection !== 1);
    const num16 = Math.max(0, Math.min(1, Math.sin(t / 60) * 0.3 + 0.3));   // :26354
    const num17 = 0.8 + Math.sin(t / 15 * Math.PI * 2) * 0.3;               // :26355
    const glowRowA = ((e.whoAmI % ROWS) + ROWS) % ROWS;
    const gr = (core[0] + 1) * 127.5 * num16, gg = (core[1] + 1) * 127.5 * num16,
      gb = (core[2] + 1) * 127.5 * num16;
    for (const row of [glowRowA, 1]) {
      draw(3, row, cx, cy, e.scale * num17, gr, gg, gb, 63.5 / 255 * num16, false);   // SpriteEffects.None
    }
  }

  /**
   * Main.DrawKite（Main.cs:36614-37069）全量 1:1：
   *  ① 锚绳：FishingLine 自锚桩向风筝 12px 步进分段（垂度随速度/距离调制），色 = 光照×0.427×Remap
   *  ② 绳尾：逐型 Extra 贴图（103 默认 + 104/132-140/144-148），oldPos 每 num4 步采样
   *     链式跟随（段长 num5、兜底 swapAt 换 num10），flag 族再垫一层 FishingLine
   *  ③ 本体：proj 帧 + rotation + num6 摆角
   *  num18 = Remap(localAI0, 0,300,0,1)（无风下垂）、num19 = localAI1（下垂插值）
   */
  private drawLeashedKite(
    ctx: CanvasRenderingContext2D,
    k: import('../entities/LeashedCritter').LeashedKiteEntity,
    world: World,
  ) {
    const atlas = this.atlas;
    if (!atlas) return;
    const rope = KITE_ROPE_PARAMS(k.projType, k.spriteDirection);
    const img = projFrameImg(k.projType, k.frame);     // value.Frame(projFrames, 1, proj.frame)
    const ropeTex = atlas.vmisc(`vanilla/Extra_${rope.rope}.png`);
    const lineTex = atlas.vmisc('vanilla/FishingLine.png');
    if (!img || !ropeTex || !lineTex) return;
    const t = visEffectFrames();
    const windAbs = Math.abs(world.weather?.windSpeedCurrent ?? 0);   // num17 = |WindForVisuals|
    const num18 = remapClamped(k.projectileLocalAI0, 0, 300, 0, 1);
    const num19 = k.projectileLocalAI1;
    const light = this.lighting
      ? this.lighting.lightAt(Math.floor(k.cx / 16), Math.floor(k.cy / 16))
      : [255, 255, 255];
    const lm = Math.max(0.2, Math.max(light[0], light[1], light[2]) / 255);
    const flip = k.spriteDirection !== 1;              // SpriteEffects.FlipHorizontally
    // ---- 主绳（:36828-36946）----
    // 风筝本体叠加 netOffset（联机半包平滑，LeashedKite.cs:110-112 每帧向 0 收敛 2px；
    // 本地恒 0）——绳自锚点到偏移后本体，与原版 Draw 消费 _dummy.position + netOffset 同源
    const center = { x: k.cx + k.netOffsetX, y: k.cy + k.netOffsetY };
    const anchor = { x: k.anchorX, y: k.anchorY };
    const lineWidth = lineTex.sw, lineHeight = lineTex.sh;
    let vx = center.x - anchor.x, vy = center.y - anchor.y;
    let velX = k.vx, velY = k.vy;
    if (Math.abs(velX) > Math.abs(velY)) { const tmp = velX; velX = velY; velY = tmp; }
    const num21 = Math.hypot(vx, vy);
    let num22 = Math.hypot(center.x - anchor.x, center.y - anchor.y);
    if (num22 === 0) num22 = 1;
    let drawing = true;
    if (num21 !== 0) {
      vx *= 12 / num21; vy *= 12 / num21;
      anchor.x -= vx; anchor.y -= vy;
      vx = center.x - anchor.x; vy = center.y - anchor.y;
    } else {
      drawing = false;
    }
    let node = { x: anchor.x, y: anchor.y };
    let seg = { x: vx, y: vy };
    let guard = 0;
    while (drawing && guard++ < 400) {
      let num25 = 12;
      const num26raw = Math.hypot(seg.x, seg.y);
      const num27 = num26raw;
      if (!Number.isFinite(num26raw) || num26raw === 0) { drawing = false; break; }
      if (num26raw < 20) {
        drawing = false;
        node.x += (seg.x / num26raw) * num25;
        node.y += (seg.y / num26raw) * num25;
        seg.x = center.x - node.x; seg.y = center.y - node.y;
        num25 = Math.hypot(seg.x, seg.y) + 4;
      } else {
        const k2 = 12 / num26raw;
        seg.x *= k2; seg.y *= k2;
        node.x += seg.x; node.y += seg.y;
        seg.x = center.x - node.x; seg.y = center.y - node.y;
        if (num27 > 12) {
          let num28 = 0.3;
          let num29 = Math.abs(velX) + Math.abs(velY);
          if (num29 > 16) num29 = 16;
          num29 = 1 - num29 / 16;
          num28 *= num29;
          num29 = num27 / 80;
          if (num29 > 1) num29 = 1;
          num28 *= num29;
          if (num28 < 0) num28 = 0;
          if (seg.y > 0) {
            seg.y *= 1 + num28;
            seg.x *= 1 - num28;
          } else {
            num29 = Math.abs(velX) / 3;
            if (num29 > 1) num29 = 1;
            num29 -= 0.5;
            num28 *= num29;
            if (num28 > 0) num28 *= 2;
            seg.y *= 1 + num28;
            seg.x *= 1 - num28;
          }
        }
      }
      const rot = Math.atan2(seg.y, seg.x) - Math.PI / 2;
      const segH = drawing ? lineHeight : num25;      // 末段取残余长度（:36937-36939）
      // 基色取【风筝中心】格光照（:36940），逐段只乘距离 Remap（:36942-36944）
      const fromValue = 1 - Math.hypot(center.x - node.x, center.y - node.y) / num22;
      const shade = 0.42745098 * remapClamped(fromValue, 0, 1, 0.5, 1) * lm;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(rot);
      ctx.scale(0.8, 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, shade));
      ctx.drawImage(lineTex.img, lineTex.sx, lineTex.sy, lineWidth, lineHeight,
        -lineWidth / 2, -2, lineWidth, segH);
      ctx.restore();
    }
    // ---- 绳尾（:36947-37067）----
    const frameW = img.width, frameH = img.height;
    const ropeW = ropeTex.sw, ropeH = ropeTex.sh;
    const colW = ropeW / rope.segCols;
    let rectX = colW * (rope.segCols - 1);
    const rectW = colW - 2;                            // rectangle2.Width -= 2
    let num2 = rope.rotOffset;
    let num5 = rope.segLen;
    let num6 = rope.rotSway;
    let num8 = rope.tailDy;
    let num10 = rope.swapLen;
    let num14 = rope.dx2;
    let num15 = rope.dy2;
    let num16 = rope.droopRot;
    const num32raw = windAbs;
    const num32 = (seg.y >= -0.02 && seg.y < 1)
      ? Math.max(0, Math.min(1, (num32raw - 0.2) / 0.3)) : num32raw;   // GetLerpValue(0.2,0.5)
    for (let i = 0; i < rope.ropeLines; i++) {
      rectX = colW * (rope.segCols - 1);
      const list: Array<{ x: number; y: number }> = [];
      let num31 = 0.5 + 0.5 * windAbs;                 // Lerp(0.5, 1, num17)
      let vec4x = num31 * rope.swayLen * k.spriteDirection;
      let vec4y = Math.sin(t / 300 * Math.PI * 2) * num32;
      if (i === 1) { vec4y += 0.5 * (1 - num18); }
      else if (i === 2) { vec4y += 1 * (1 - num18); }
      else if (i === 3) { vec4y += 1.5 * (1 - num18); }
      vec4x *= 2; vec4y *= 2;
      let num35 = rope.tailDx + num14;
      let num36 = num8 + num15;
      if (i === 1) { num35 -= 8; num36 -= 8; }
      else if (i === 2) { num35 -= 4; num36 -= 4; }
      else if (i === 3) { num35 -= 12; num36 -= 12; }
      if (num18 > 0) {
        const ca = Math.cos(num18 * Math.PI / 2 * k.spriteDirection);
        const sa = Math.sin(num18 * Math.PI / 2 * k.spriteDirection);
        const rx = vec4x * ca - vec4y * sa, ry = vec4x * sa + vec4y * ca;
        vec4x = rx; vec4y = ry;
        num8 *= 1 - num18; num14 *= 1 - num18; num15 *= 1 - num18;
        const num38 = (1 - num19) * num18;
        num6 *= 1 - num38;
        num6 -= Math.PI / 4 * num38 * k.spriteDirection;
        num6 += num38 * num16 * k.spriteDirection;
        if (num5 !== -1) num5 *= 1 + (0.7 - 1) * num18;
        num10 *= 1 + (0.7 - 1) * num18;
      }
      const num37 = 0.5;
      const baseRot = k.rotation + num6;
      const pivotX = (frameW * num37 + num35) * k.spriteDirection;
      const pivotY = num36;
      const cr = Math.cos(baseRot), sr = Math.sin(baseRot);
      let tipX = center.x + pivotX * cr - pivotY * sr;
      let tipY = center.y + pivotX * sr + pivotY * cr;
      list.push({ x: tipX, y: tipY });
      let num39 = rope.oldStep;
      let num40 = 1;
      while (num39 < (rope.tailSegs + 1) * rope.oldStep) {
        // :37005-37008 换段长是【持久赋值】（num5 = num10，跨段跨条延续）
        if (rope.swapAt !== -1 && rope.swapAt === num40) num5 = num10;
        const p = k.oldPos[num39];
        if (!p || (p.x === 0 && p.y === 0)) {
          list.push({ x: tipX, y: tipY });
        } else {
          const osd = k.oldSpriteDirection[num39] ?? k.spriteDirection;
          const orot = (k.oldRot[num39] ?? k.rotation) + num6;
          const spx = (frameW * num37 + num35) * osd;
          const spy = num36;
          const ocr = Math.cos(orot), osr = Math.sin(orot);
          let px = p.x + spx * ocr - spy * osr;
          let py = p.y + spx * osr + spy * ocr;
          px += vec4x * (num40 + 1);
          py += vec4y * (num40 + 1);
          let ddx = tipX - px, ddy = tipY - py;
          const dl = Math.hypot(ddx, ddy);
          if (dl > num5) { ddx *= num5 / dl; ddy *= num5 / dl; }
          px = tipX - ddx; py = tipY - ddy;
          list.push({ x: px, y: py });
          tipX = px; tipY = py;
        }
        num39 += rope.oldStep;
        num40++;
      }
      if (rope.lineToo) {                              // :37033-37047 FishingLine 垫层
        for (let n = list.length - 2; n >= 0; n--) {
          const a = list[n], b = list[n + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          if (len < 2) continue;
          const rot2 = Math.atan2(dy, dx) - Math.PI / 2;
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.rotate(rot2);
          ctx.globalAlpha = Math.max(0, Math.min(1, lm * 0.42745098));
          ctx.drawImage(lineTex.img, lineTex.sx, lineTex.sy, lineWidth, lineHeight,
            -lineWidth / 2, -2, lineWidth, len);          // 纵向 scale = len/帧高 → 画高 = len
          ctx.restore();
        }
      }
      for (let n = list.length - 2; n >= 0; n--) {      // :37048-37066 尾段贴图（倒序）
        const a = list[n], b = list[n + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rot3 = Math.atan2(dy, dx) - Math.PI / 2 + num2;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(rot3);
        ctx.scale(flip ? -1 : 1, 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, lm));
        ctx.drawImage(ropeTex.img, ropeTex.sx + rectX, ropeTex.sy, rectW, ropeH,
          -rectW / 2, -ropeH / 2, rectW, ropeH);
        ctx.restore();
        rectX -= colW;
        if (rectX < 0) {
          let wrap = rope.startCol;
          if (rope.rewind) wrap--;
          rectX = wrap * colW;
        }
      }
    }
    // ---- 本体（:37068）----
    ctx.save();
    // :36836 origin.X += -2·spriteDirection → XNA 精灵中心 = Center + 2·sd（翻转无关的屏幕空间偏移）
    ctx.translate(k.cx + 2 * k.spriteDirection, k.cy);
    ctx.rotate(k.rotation + num6);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, lm));
    ctx.drawImage(img, -frameW / 2, -frameH / 2, frameW, frameH);
    ctx.restore();
  }


  private drawDrop(d: ItemDrop) {
    const bob = Math.sin((d.age + d.bobPhase * 60) * 0.1) * 1.5;
    // 优先 Maples 图标。绘制尺寸 = 贴图单帧原尺寸（原版 Main.DrawItem 掉落物
    // 按 texture.Frame 原大画,星星 Item_75 单帧 22×26 比方块还大;曾统一压
    // 14px 宽 → 星星等大贴图物品视觉偏小）。atlasIcon 已含动画条切片
    const ar = this.atlasIcon(d.itemId);
    if (ar) {
      const ctx = this.ctx;
      // ★贴图中心对齐命中盒中心（Main.DrawItem : position+size/2−texSize/2）——
      //   曾按盒左上角画 = 大贴图物品（坠落星 22×26 盒 16×16）精灵溢出右下、
      //   选中框视觉钉在左上（用户实报 2026-09-02）
      const ddx = d.x - (ar.sw - d.w) / 2, ddy = d.y - (ar.sh - d.h) / 2 + bob;
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, ddx, ddy, ar.sw, ar.sh);
      // 原版 Item.color（彩色凝胶）：同贴图逐像素乘 color，XNA 预乘两步（同 NPC color pass）
      if (d.color && d.color[3] > 0) {
        const tinted = this.tintedSprite(`item${d.itemId}`, ar, d.color);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = d.color[3] / 255;
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, ddx, ddy, ar.sw, ar.sh);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        if (tinted) ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, ddx, ddy, ar.sw, ar.sh);
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    const icon = this.itemIcon(d.itemId);
    if (!icon) return;
    this.ctx.drawImage(icon, d.x, d.y + bob, 12, 12);
  }

  // 敌人 → Maples 动画映射
  private enemyAnimCache = new Map<string, ReturnType<SpriteAtlas['animFrames']>>();
  private enemyAnim(key: string): ReturnType<SpriteAtlas['animFrames']> {
    let f = this.enemyAnimCache.get(key);
    if (!f) {
      const map: Record<string, string> = {
        slime_green: 'Slime/Jump', slime_blue: 'Slime/Jump',
        zombie: 'Zombie/Walk',
      };
      f = this.atlas && map[key] ? this.atlas.animFrames(map[key]) : [];
      this.enemyAnimCache.set(key, f);
    }
    return f;
  }

  // ===================== 血肉墙墙身三件套（Main.cs DrawWoF :37811-37966 1:1） =====================
  // 原版 DrawWoF 顺序：舌头(:37818-37823) → 肌腱链(:37825-37829) → 墙身(:37831)，
  // 整体在 DoDraw_WallsTilesNPCs(:62709) 里墙/方块之后、NPC 缓存绘制之前调用——
  // 墙身垫底、嘴(113)/眼(114)/饥饿者(115) 精灵压在上面（behindTiles 族仍在墙身前）。
  // 本仓在实体层之前整段画，层序等价。
  //
  // 光照：原版逐 16px 横条 Lighting.GetColor / 逐链段 GetColor；本仓 compositeLight
  // 全屏 multiply 用同一光照缓冲做 2× 超采样双线性合成（比原版逐格采样更细）——
  // 此处不再逐条取 lightAt，否则与全屏 pass 双重相乘会过暗。

  /** 上帧血肉墙本体引用（死亡检测：实体被 compact 移除后对象仍可读 dead/bossFled） */
  private wofHeadSeen: Enemy | null = null;
  /** 墙身崩落血尘（渲染层自持瞬态，形状同 Particle） */
  private wofDeathFx: Particle[] = [];
  /** 墙身贴图（WallOfFlesh.png 190×420 = 3 帧×140px；懒加载经 ensureVImage） */
  private wofTex(): ImageBitmap | HTMLImageElement | null {
    return this.atlas ? this.atlas.ensureVImage('vanilla/WallOfFlesh.png') : null;
  }

  /** DrawWoF 总入口（:37811-37816 门：wofNPCIndex<0 / inactive / life<=0 不画） */
  private drawWoF(
    player: Player, entities: Entity[], world: World,
    camRY: number, viewW: number, viewH: number, z: number,
  ) {
    if (!this.atlas) return;
    const head = (entities as Enemy[]).find((e) => !e.dead && e.vanillaId === 113 && e.hp > 0) ?? null;
    if (head) {
      this.wofHeadSeen = head;
      const { top, bottom } = this.wofDrawAreaOf(head);
      // :37818-37823 狂卷之舌（tongued 玩家）
      if (!player.dead && player.buffs.has(BuffType.TheTongue)) this.drawWoFTongue(head, player);
      // :37825-37829 肌腱链（所有 aiStyle 29 饥饿者）
      for (const e of entities as Enemy[]) {
        if (!e.dead && e.vanilla?.aiStyle === 29) this.drawWoFRope(head, e, top, bottom);
      }
      // :37831 墙身
      this.drawWoFBody(head, top, camRY, viewH, z);
      return;
    }
    // 墙不在场：上帧还在 → 判死透（bossFled=逃逸/玩家死自毁，不播崩落）
    const gone = this.wofHeadSeen;
    this.wofHeadSeen = null;
    if (gone && gone.dead && !gone.bossFled && gone.hp <= 0) {
      this.spawnWoFDeathFx(gone, player, world, camRY, viewW, viewH, z);
    }
  }

  /** Main.wofDrawAreaTop/Bottom 权威值（bossAI_wof.wofDrawArea() 导出,AI 每 tick
   *  维护;2026-08-13 前靠"双眼间距"反解属近似,已消）。-1(墙未初始化/已消散)
   *  时回退头位 ±80 最小跨度——【本仓防御性自创回退】(原版无此路径,仅覆盖 debug
   *  生成头在首 tick 前的渲染窗;原版 160px 保底在 :25918-25925) */
  private wofDrawAreaOf(head: Enemy): { top: number; bottom: number } {
    const area = wofDrawArea();
    if (area.top >= 0 && area.bottom >= 0) return area;
    return { top: head.cy - 80, bottom: head.cy + 80 };
  }

  /** DrawWOFBody（Main.cs:37827-37875）：WallOfFlesh.png 以 16px 横条沿屏幕纵向平铺。
   *  平铺算法要点：
   *  - 帧高 num = 贴图高/3 = 140（:37829）；
   *  - num3 先取 wofDrawAreaBottom 随即被 screenPosition.Y+screenHeight 覆写（:37832-37833）
   *    → 纵向只画到【屏幕底】，与空腔下沿无关；
   *  - 行对齐：num4 = floor((top-screenY)/140)+1，top -= num4*140（:37836-37844）
   *    → 首行起点 ≡ top (mod 140)，后续行 +140 步进 = 世界坐标锚定的无缝平铺
   *    （相机平移时贴图不随屏游动）；num4>12（顶沿离屏顶 >12 行）整体跳过（:37838）；
   *  - 每行内 16px 一条横切（:37871-37873），末行按剩余高度截断；
   *  - X = 墙 hitbox 左沿，direction>0 时 -80（:37850-37852）；spriteDirection==1
   *    （AI :26041 spriteDirection=direction）水平翻转（:37856-37858）；
   *  - 动画帧行 = wofDrawFrameIndex/6*140，先取帧后自增、18 回卷（:37860-37863） */
  private drawWoFBody(
    head: Enemy, areaTop: number,
    camRY: number, viewH: number, z: number,
  ) {
    const img = this.wofTex();
    if (!img || !img.height) return;
    const num = Math.floor(img.height / 3);            // :37829 帧高 140
    const screenTop = camRY - viewH / (2 * z);         // Main.screenPosition.Y
    const screenBottom = camRY + viewH / (2 * z);      // :37833 screenPosition.Y+screenHeight
    let top = areaTop;                                 // wofDrawAreaTop(:37830)
    const rows = Math.floor((top - screenTop) / num) + 1;   // :37836
    if (rows > 12) return;                             // :37838
    const rewind = rows * num;
    if (rewind > 0) top -= rewind;                     // :37841-37844
    let x = head.x;                                    // :37850 npc.position.X
    if (head.facing > 0) x -= 80;                      // :37851-37852 direction>0
    const flip = head.facing === 1;                    // :37856-37858 spriteDirection==1
    const frameRow = Math.floor(wofDrawFrameIndex / 6) * num;  // :37860
    if (++wofDrawFrameIndex >= 18) wofDrawFrameIndex = 0;      // :37861-37863
    const ctx = this.ctx;
    const w = img.width;
    ctx.save();
    if (flip) { ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); } // 竖直中线 x+w/2 镜像
    for (let i = Math.floor(top); i < screenBottom; i += num) { // :37868
      let rowH = screenBottom - i;
      if (rowH > num) rowH = num;                      // :37869-37871
      for (let j = 0; j < rowH; j += 16) {             // :37873 16px 横条
        ctx.drawImage(img, 0, frameRow + j, w, 16, x, i + j, w, 16);
      }
    }
    ctx.restore();
  }

  /** DrawWOFRopeToTheHungry（Main.cs:37879-37928）：墙列上 Hungry 挂点
   *  （top + 跨度×ai[0]）→ 饥饿者位（Center.X, Bottom-h/2×scale）Chain12 肌腱链。
   *  段距 28×scale、终止距 40×scale（尾段高 = dist-40×scale+28）；rotation =
   *  atan2(dy,dx)-π/2 恒定；链段交替 FlipHorizontally（起始 = frameCounter>7，
   *  即 15t 嚼动周期后半）。原版源矩形/origin 用 Chain4 尺寸（16×28，与 Chain12
   *  同尺寸，数值无差）；netOffset 本地恒 0 不加 */
  private drawWoFRope(head: Enemy, h: Enemy, top: number, bottom: number) {
    const chain = this.atlas ? this.atlas.vmisc('vanilla/Chain12.png') : null;
    if (!chain) return;
    const ctx = this.ctx;
    const scale = (h.vanilla?.scale ?? 1) * h.vanillaScale;
    const mx = head.x + head.w / 2;                    // :37884 嘴中心 X
    const anchorY = top + (bottom - top) * h.ai0;      // :37890-37891 挂点
    // :37887 frameCounter>7（case 115 嚼动 counter 1..15 → 后半为真）
    let flip = ((Math.floor(h.animT) % 15) + 15) % 15 + 1 > 7;
    let px = h.cx;                                     // :37893 Center.X
    let py = h.y + h.h - h.h * 0.5 * scale;            // :37894 Bottom.Y - height*0.5*scale
    let dx = mx - px, dy = anchorY - py;
    if (dx === 0 && dy === 0) return;                  // dist=0 除零保护（原版无此态）
    const rot = Math.atan2(dy, dx) - Math.PI / 2;      // :37899
    const stop = Math.floor(40 * scale);               // :37906 num5
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      let seg = 28;                                    // :37905 段高（源矩形高）
      if (dist < stop) { seg = Math.floor(dist) - stop + 28; running = false; } // :37908-37910
      const k = (28 * scale) / dist;                   // :37912 段距 28×scale
      dx *= k; dy *= k;
      px += dx; py += dy;
      dx = mx - px; dy = anchorY - py;                 // :37914-37915
      if (seg > 0 && seg <= chain.sh) {                // 尾段 seg≤0 不画（canvas 0 高会抛）
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        if (flip) ctx.scale(-1, 1);                    // SpriteEffects.FlipHorizontally 交替
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, seg,
          -chain.sw / 2, -chain.sh / 2, chain.sw, seg);
        ctx.restore();
      }
      flip = !flip;
    }
  }

  /** DrawWOFTongueToPlayer（Main.cs:37929-37966）：嘴中心 → 舌上玩家中心 Chain12
   *  全段链，步进 = 贴图全高 28、距嘴 <40px 段不画直接收尾；恒不翻转、scale 1 */
  private drawWoFTongue(head: Enemy, p: Player) {
    const chain = this.atlas ? this.atlas.vmisc('vanilla/Chain12.png') : null;
    if (!chain) return;
    const ctx = this.ctx;
    const mx = head.x + head.w / 2;                    // :37936
    const my = head.y + head.h / 2;                    // :37937
    let px = p.x + p.w * 0.5, py = p.y + p.h * 0.5;    // :37938 玩家中心
    let dx = mx - px, dy = my - py;
    if (dx === 0 && dy === 0) return;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;      // :37942
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40) { running = false; continue; }    // :37947-37951
      const k = chain.sh / dist;                       // :37952 步进 28px
      dx *= k; dy *= k;
      px += dx; py += dy;
      dx = mx - px; dy = my - py;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        -chain.sw / 2, -chain.sh / 2, chain.sw, chain.sh);
      ctx.restore();
    }
  }

  /** 死亡崩落近似（NPC.cs:88277-88325）：无 gore 贴图机制——嘴部 gore 137-139 由
   *  Enemy.hurt 既有三色粒子爆发代位；此处补 :88296-88324 的墙列全屏血尘扫掠
   *  （门 = 玩家深于 maxTilesY-250；X = 墙左沿 direction>0 时 -80、宽 140；
   *  纵向从屏顶起 screenWidth px 高——原版用 screenWidth 当纵向跨度的怪癖照搬；
   *  46×50 网格每格原版 5 尘+1 gore → 尘降为 2、gore 0.5 概率，总量 ~150 粒
   *  （Game 粒子池 600 上限内放不下原版 ~660，故渲染层自持） */
  private spawnWoFDeathFx(
    head: Enemy, player: Player, world: World,
    camRY: number, viewW: number, viewH: number, z: number,
  ) {
    if (this.wofDeathFx.length) return;
    // :88296-88299 玩家深度门
    if (!(player.cy / TILE > world.store.h - 250)) return;
    let x0 = Math.floor(head.x);                       // :88300
    if (head.facing > 0) x0 -= 80;                     // :88301-88302
    const x1 = x0 + 140;                               // :88303
    const y0 = Math.floor(camRY - viewH / (2 * z));    // :88305 (int)screenPosition.Y
    const y1 = y0 + Math.floor(viewW / z);             // :88306 +screenWidth（原版怪癖）
    const list = this.wofDeathFx;
    for (let y = y0; y < y1; y += 50) {                // :88308
      for (let x = x0; x < x1; x += 46) {              // :88310
        for (let k = 0; k < 2; k++) {                  // 原 5 尘（Dust 5 血）
          const life = Math.round(60 + Math.random() * 40);
          list.push({
            x: x + Math.random() * 32, y: y + Math.random() * 32,
            vx: (Math.floor(Math.random() * 121) - 60) * 0.1,
            vy: (Math.floor(Math.random() * 121) - 60) * 0.1,
            life, maxLife: life, color: '#8A1A1A', size: 2 + Math.random() * 2,
            damp: 0.985, grav: 0.09,
          });
        }
        // gore 140-142 代位已撤：真实 GorePiece（vanilla-gore npc 113 尘幕条目+屏幕网格
        // 展开，SkyRenderer 尾批落地）已接管碎块层，此处只留原版 Dust 5 血尘近似
        if (false) {}
      }
    }
  }

  /** 崩落血尘推进+绘制（每 render 调用一步，物理与 Game.spawnParticles 同形简化） */
  private stepWoFDeathFx() {
    const list = this.wofDeathFx;
    if (!list.length) return;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.life <= 0) continue;
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; }
      p.x += p.vx; p.y += p.vy;
      list[n++] = p;
    }
    list.length = n;
    const ctx = this.ctx;
    for (const p of list) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  /** NPC.behindTiles 判定（SetDefaults 直读，Main.cs:22174 `npc[num].behindTiles == behindTiles`）：
   *  命中的实体画在 tile 层之下（钻地蠕虫族被前景方块遮挡）。血肉墙嘴/眼/饥饿者
   *  （113/114/115）SetDefaults 同为 behindTiles=true，但本仓墙身(3.7)画在 tile 之上，
   *  随族前移会被墙身盖掉——留在实体层保住"墙身垫底、精灵压上"的原版相对序
   *  （它们被前景 tile 遮挡的语义是单 tile 层下的既知折损，见 2b' 注释） */
  private isBehindTilesEnemy(e: Enemy): boolean {
    const id = e.vanillaId;
    if (id === 113 || id === 114 || id === 115) return false;
    return !!e.vanilla?.behindTiles;
  }

  private drawEnemy(e: Enemy, world: World, entities: unknown[] = []) {
    const ctx = this.ctx;
    const spr = this.assets.enemySprites.get(e.key);
    // 受击闪白
    const flash = e.iframes > 0 && e.iframes % 4 < 2;
    // 水下滤镜：与主角一致的蓝色调（检查怪物头部位置是否浸水）
    const headI = world.store.idx(Math.floor(e.cx / TILE), Math.floor((e.y + 2) / TILE));
    const underwater = world.store.liquid[headI] > 100;
    // 骷髅王手（36）的两节臂骨 IK（Main.cs:22543-22596 1:1）：从手部锚点向头
    // 中心做两段收缩（92/60 缩比），段间旋转 atan2-π/2——贴图 Arm_Bone.png；
    // Red Hat 族（头 ai3==1→手 localAI[3] 镜像 :22304）换 Arm_Bone_3（:22571-22578）
    if (e.vanillaId === 36 && e.master) this.drawSkeletronArm(e, e.master);
    // 南瓜王披风（Main.cs:22499-22506）：锚=本体中心+80Y、PumpkingCloak 五帧行
    // =localAI[1]（与表情帧同节拍 0-4）、origin=(W/2, 帧高/2)
    if (e.vanillaId === 327) this.drawPumpkingCloak(e);
    // 南瓜王之刃 328 双臂（Main.cs:22508-22542）：与骷髅王手同构两段 IK，目标带
    // -30 偏移、贴图 PumpkingArm 整幅
    if (e.vanillaId === 328 && e.master) this.drawPumpkingArm(e, e.master);
    // AI_013 食人怪族茎蔓（Main.cs:22433-22514 1:1）：头中心 → 锚点格(ai0/ai1)
    // 每 28px 一段 Chain 贴图步进，剩余 <40px 画一段收缩尾段对齐锚点
    if (e.vanilla?.aiStyle === 13) this.drawPlantVine(e);
    // 刺球锚链+锚座（Main.cs:23087-23113 1:1）：aiStyle 20（刺球 70）——锚点
    // = ai[1]/ai[2]（像素，AI_020 帧首快照）→ 球心 12px 段 Chain 链 + Spike_Base
    // 锚座；同帧写 rotation（:23092）→ 本体随链向旋转（下方旋转分支消费 visAngle）
    if (e.vanilla?.aiStyle === 20) this.drawSpikeBallChain(e);
    // 石巨人拳链（Main.cs:22593-22632）：拳 → 本体（AI 侧 master；本体死透锚自由头）
    if (e.vanilla?.aiStyle === 47 && e.master) this.drawGolemFistChain(e, !!world.seedFlags?.getGoodWorld);
    // Prime 部件臂骨（Main.cs:22633-22675）：锯/激光/钳/炮 → 头 两段 IK
    if ((e.vanilla?.aiStyle ?? 0) >= 33 && (e.vanilla?.aiStyle ?? 0) <= 36 && e.master) this.drawPrimeArm(e);
    // 世纪之花钩蔓/触须链（Main.cs:22225-22285）：263/264 → 本体
    if ((e.vanillaId === 263 || e.vanillaId === 264) && e.master) this.drawPlanteraVine(e);
    // 双子互连链（Main.cs:22177-22224，1.4.5）：125 激活时单侧向 126 画一次；
    // Mechdusa 合体态跳过（:22180 `!NPC.IsMechQueenUp` 门）——双子改挂 queen 蛇发
    //（drawMechdusaHair,queen 本体绘制尾段叠画）
    if (e.vanillaId === 125 && !mechQueenUp()) this.drawTwinsChain(e, entities);
    // ---- 原版 NPC 表精灵（数据驱动路径：纵向帧条 + 朝向翻转，原版贴图默认朝左） ----
    if (e.vanillaId != null && this.atlas) {
      // 风气球 594（Main.cs:23380-23406 独占）：贴图是 8 列变体【横条】(256×76 =
      // 32×76×8),变体索引 = ai[2]；携带史莱姆时先画帧 0 的 alpha+奴隶染色两遍
      // （气球壳随史莱姆染色）。通用竖切路径(json frames=1)会把整条横排 8 个气球
      // 全画出来——"完整逐帧贴图"(用户标注)
      if (e.vanillaId === 594) { this.drawWindyBalloon(e, entities); return; }
      // 雕像宝箱怪 690（Main.cs:23103-23134 独占）：恒以雕像形态显示——不画
      // NPC_690 贴图，而是按 ai[1] 样式从 Tiles_105 切 2×3 片 16×16 拼装
      // （direction==1 行 +3 镜像）；通用竖切路径会画错（json frames=1 单帧 28×38）
      if (e.vanillaId === 690) { this.drawStatueMimic(e); return; }
      // 飞灵 677（DrawNPCDirect_Faeling :26306 自发光多层复合——不在光照前画，
      // 移到光照合成后 7e 步骤专绘）
      if (e.vanillaId === 677) return;
      // 训练假人 488（TileDrawing.cs:4374-4399）：tile 378 是视觉本体——烘焙层画
      // 静止行，受击动画由 drawDummyTileAnim 覆盖层按 NPC 帧行号重画 tile 表源矩形
      // （原版 addFrY = npc.frame.Y/55*54）。NPC 自身贴图不画（NPC_488.png 的
      // frame.Y 只是 tile 行号数据源）——双画=两朝向/错位叠影（用户实报）
      if (e.vanillaId === 488) return;
      // ---- 2D 网格贴图 NPC（原版 Main.cs DrawNPC 专属 case + FindFrame 专属 case）----
      // 这些表的动画帧是【cols×rows 网格】（Frame(cols,rows,fx,fy)），通用竖切路径
      // 会把整行/整条画出来——全部走 drawNpcGrid 切格 + 各自 FindFrame 帧状态机
      // 657 史莱姆皇后（Main.cs case 657 + FindFrame case 657）
      if (e.vanillaId === 657) { this.drawQueenSlimeGrid(e); return; }
      // 576/577 DD2 食人魔（Main.cs case 576/577 + FindFrame case 576/577）
      if (e.vanillaId === 576 || e.vanillaId === 577) { this.drawDd2OgreGrid(e); return; }
      // 696（Main.cs case 696 + FindFrame case 696）
      if (e.vanillaId === 696) { this.drawNpc696Grid(e); return; }
      // 564/565 暗黑魔法师 T1/T2（Main.cs case 564/565 + FindFrame case 564/565）
      if (e.vanillaId === 564 || e.vanillaId === 565) { this.drawDarkMageGrid(e); return; }
      // 668 鹿角怪（Main.cs DrawNPCDirect_Deerclops + FindFrame case 668）
      if (e.vanillaId === 668) { this.drawDeerclopsGrid(e); return; }
      // 月总族独占分支（Main.cs:24325-24504 case 396/397/398）：头/手/核心各自
      // 带独立锚点与叠层（上臂/前臂/躯干/胸甲/眼/破体帧），通用路径锚点不对
      if (e.vanillaId === 398) { this.drawMoonLordCore(e, entities); return; }
      if (e.vanillaId === 397) { this.drawMoonLordHand(e, entities); return; }
      if (e.vanillaId === 396) { this.drawMoonLordHead(e); return; }
      // 月总游离眼 400（Main.cs:24492-24504 case 400 独占）：本体帧随 rotation
      // （origin (40,40)）+ Extra_19 瞳孔椭圆 (30,30)×lai1、整体 scale lai2
      // （0.4-1.15 脉动，AI 镜像 localAI[0..2] → lai0-2）
      if (e.vanillaId === 400) { this.drawMoonLordFreeEye(e); return; }
      // 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554）：翅膀/双臂/
      // 二阶段覆层独占——通用路径只画本体，缺背后大翼与攻击态手臂帧
      if (e.vanillaId === 636) { this.drawEmpress(e); return; }
      // 402 星尘织带蠕虫（Main.cs:23848-23889 case 402 独占）：单 NPC 自绘
      // oldPos 拖尾（403/404 节段 + Glow_133/134 加色）+ 头本体与 Glow_135
      if (e.vanillaId === 402) { this.drawStardustWorm(e); return; }
      // 266 克苏鲁之脑（Main.cs:24799-24843 专家/FTW 四镜像 + :22949-22951 Y 偏移）
      if (e.vanillaId === 266) { this.drawBrainOfCthulhu(e, world); return; }
      // 491 荷兰飞盗船（Main.cs:24263-24324 case 491 独占）：船体 OriginFlip(208,460) 锚 +
      //  旗/桨/帆附加件叠绘 + 4 炮代画；492 炮 hide=true 由船代画（船在世时跳过独立绘制）
      if (e.vanillaId === 491) { this.drawDutchman(e, entities); return; }
      if (e.vanillaId === 492
        && (entities as Enemy[]).some((n) => n instanceof Enemy && !n.dead && n.vanillaId === 491)) {
        return;
      }
      const frames = Math.max(1, e.vanilla?.frames ?? 1);
      const frameIdx = vanillaFrameIdx(e, frames);
      // Mechdusa:毁灭者头 134 换画 136 尾帧贴图（Main.cs:24980-24984 num153=136
      // + LoadNPC——头锁位倒挂(旋转 +π),头帧贴图方向不对,原版改用尾帧绘制）
      // 石巨人:246 血尽原体变身自由态(ai3=1)后原版是 NewNPC 249——换画 NPC_249
      // (帧 0/1 与 246 基础帧同构,customFrameIdx 直读不变;曾一直画 NPC_246)
      const drawId = e.vanillaId === 134 && mechQueenUp() ? 136
        : e.vanillaId === 246 && e.ai3 === 1 ? 249 : e.vanillaId;
      const r = this.atlas.vnpc(drawId, frameIdx);
      if (r) {
        // 原版 NPC.scale（SetDefaults base × netID scale × 专家档体型系数）——作用于渲染。
        // 专家系数（Tweaks :18187/:18198/:18300/:18309：世吞 13-15 ×1.2、克脑 266/
        // 爬行者 267/毁灭者 134-136/探针 139 ×1.05）只乘 npc.scale 不回写宽高
        // （NewNPC 的 width/height×scale 在 ScaleStats 之前，NPC.cs:17744-17747）——
        // 碰撞盒保持 base 盒（本仓 e.w/e.h 已按 base 乘，勿在此扩盒）
        const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale
          * expertRenderScale(e.vanillaId ?? 0);
        // 69 蚁狮身体（Main.cs:23214-23217 原文移植,2026-08-27 用户实报缺下半身）：
        // AntlionBody.png(36×28 独立贴图) 画在通用帧【之前】= 头压身体层序。
        // 锚点 = (盒水平中心, 盒底+14)、origin=贴图中心 → 贴图钉 (盒水平中心, 盒底±14)
        // 即贴图【完全在命中盒下方】向下延伸 28px；旋转 = −rotation×0.3（反向 30%）、
        // SpriteEffects.None 不翻转——曾漏绘整段 = 蚁狮只剩头（用户对比原版视频实报）
        if (e.vanillaId === 69) {
          const abody = this.atlas.ensureVImage('vanilla/AntlionBody.png');
          if (abody) {
            ctx.save();
            ctx.translate(e.x + e.w / 2, e.y + e.h + 14);
            ctx.rotate(-(e.visAngle || 0) * 0.3);
            ctx.drawImage(abody, 0, 0, abody.width, abody.height, -abody.width / 2, -abody.height / 2, abody.width, abody.height);
            ctx.restore();
          }
        }
        // 370 猪鲨/372/373 残影系统（vanilla aiStyle 69 分支 value76 链——oldPos 拖影
        // + 圆周爆发 + ai0≥4 DukeFishron.png 换贴图，2026-08-27 审计补缺）
        if (e.vanillaId === 370 || e.vanillaId === 372 || e.vanillaId === 373) {
          const fr370 = this.atlas.vnpc(e.vanillaId, vanillaFrameIdx(e, Math.max(1, e.vanilla?.frames ?? 1)));
          if (fr370) {
            drawDukeAfterimages(ctx, e, this.atlas,
              { sx: fr370.sx, sy: fr370.sy, sw: fr370.sw, sh: fr370.sh },
              [1, 1, 1]);
          }
        }
        // 399 火星探测器逃跑扫描束 + 418 Corite 拖尾（DrawNPC 附加层审计补缺）
        if (e.vanillaId === 399) drawMartianProbeBeams(ctx, e, this.atlas, 0);
        if (e.vanillaId === 418) drawCoriteTrail(ctx, e, this.atlas);
        // 618 血月潜舰蓄力闪（ai0==3 门——DrawNPC aiStyle 117 段 value5 链）
        if (e.vanillaId === 618) drawDreadnautilusFlash(ctx, e, this.atlas);
        // 566/567 DD2 骷髅头冠（lai3≥115 门——DrawNPC Extra_80 段）
        if (e.vanillaId === 566 || e.vanillaId === 567) drawDD2SkeletonCrown(ctx, e, this.atlas, 0);
        // 551 Betsy 双翼（DrawNPC Extra_81/82 段——后翼先画、前翼后画）
        if (e.vanillaId === 551) {
          const fr551 = this.atlas.vnpc(551, vanillaFrameIdx(e, 11));
          if (fr551) {
            drawBetsyWings(ctx, e, this.atlas, (img, sx, sy, sw, sh, dx, dy, dw, dh) => {
              ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
            });
          }
        }
        // 693 万圣节书架骷髅（DrawNPC Extra_289 段——localAI 驱动色彩/缩放）
        if (e.vanillaId === 693) drawLibrarianSkeleton(ctx, e, this.atlas);
        // 522 未命名 NPC 加算覆盖帧（DrawNPC aiStyle 100 段 value85 链）
        if (e.vanillaId === 522) {
          const fr522 = this.atlas.vnpc(522, 0);
          if (fr522) draw522Overlay(ctx, e, this.atlas,
            { sx: fr522.sx, sy: fr522.sy, sw: fr522.sw, sh: fr522.sh });
        }
        ctx.save();
        // 锚点（Main.cs:23658-23660 通用尾段 1:1）：position = Center −
        // frameSize×scale/2 + halfSize×scale + (0, num46+num47+gfxOffY)，origin =
        // halfSize（帧中心,:23418）→ 化简 = **帧中心钉 (Center.X, Center.Y+num46+num47+gfxOffY)**。
        // num47=NPCAddHeight（:22208 封闭表,与血条 HB_ADD_H 同源）逐类型下沉
        // （鸟妖 48=32/双子 30/EoW 26/史莱姆 7-9=13…）。★2026-08-24 勘误：曾误读
        // type==94 骷髅专属绘制（:25483 "+4"）为通用公式,把全体 NPC 画成"帧底=盒底+4"
        // 底锚——帧高=盒高+8 的紧裁剪行走族（僵尸等）恰与原版重合故未露馅,带底边距
        // 的飞行族整体上飘（用户实报"鸟妖碰撞盒不对":体底悬盒顶,原版体底=盒底+29、
        // 帧中心=盒中心+32）。旋转枢轴随之从盒底修正为帧中心（XNA origin=halfSize
        // 绕帧中心转,546 怒滚虫的手工枢轴补偿随之删）
        // num46 链全量（:23226-23277）+ num47 覆写尾（:23278-23341）——运行时档用
        // Enemy.wet/ai2/ai3（原版 wet=中心盒液体命中、ai[] 同源）。halfSize 覆写组
        // （4/125/126/262/264/63/64/103/69）在锚点公式中 origin 位移与 position 位移
        // 恒相消（frame center = Center+(0,off) 与 halfSize 无关）——只改旋转枢轴,
        // 4/125/126 属 EoC/双子校准偏差域不在此接。num45（694 X 分量）赋值后无消费=死码
        const idA = e.vanillaId ?? -1;
        let addY = (idA === 108 || idA === 124 || idA === 625) ? 2
          : idA === 467 ? 7
          : idA === 537 ? 2
          : idA === 490 ? 4
          : idA === 484 ? 2
          : idA === 483 ? 14
          : idA === 581 ? -6    // num46=-6(Main.cs:23242-23244,2026-08-30 审计补)
          : (idA === 478 || idA === 606 || idA === 612 || idA === 613) ? -2
          : (idA === 469 && e.ai2 === 1) ? 14
          : idA === 692 ? (e.wet ? 10 : 6)
          : (idA === 626 || idA === 627) ? (e.wet ? -2 : 2)
          : idA === 688 ? 10
          : 0;
        if (idA === 477) addY = 22;                       // num47= 覆写（非 +=,:23278）
        else if (idA === 262) addY += 26;                 // switch 尾 += 档
        else if (idA === 264) addY += 2;
        else if (idA === 268) addY += 16;
        else if (idA === 288) addY += 6;
        else if (idA === 694) {                           // ai3==4 按帧渐隐（:23336-23343,帧距 40）
          if (e.ai3 === 3) addY += 16;
          else if (e.ai3 === 4) addY += Math.trunc(16 * Math.max(0, Math.min(1, 1 - (frameIdx * r.sh) / 40 / 17)));
          else addY += -2;
        }
        addY += Renderer.HB_ADD_H[idA] ?? 0;              // NPCAddHeight num47（:22208-22394）
        // DrawNPC switch 内的【绘制侧】num47 覆写（:23445-23477）——血条不走此段,
        // 故不入 HB_ADD_H（覆盖语义,非累加）
        addY = Renderer.DRAW_NUM47_OVERRIDE[idA] ?? addY;
        // ★落脚贴合补偿（2026-08-30 用户拍板,刻意偏离反编译中心锚定数学）：
        // 官方人形族贴图内容底行系统性低于盒底 ≈5px(cell56 内容[8..53]),F3 精确框线
        // 下呈"陷地"。此表按首帧扫描逐型抵消;排除旋转/独占路径(gen 时已剔除)。
        // ★parity 对账跑批前必须 localStorage.sw_npc_foot_flush='0' 关闭落脚贴合!
        // v6 起补偿为「内禀计算」(见 anchorY 前的 footFlush 段),本查表通道退役。
        // 416 日耀掠兽骑手（Main.cs:24508-24515 case 416 独占）：绘制位置吸附坐骑
        // 415 的 Bottom（AI 锚 Center+(-spriteDir*10,-30) 只喂碰撞盒——骑手视觉上
        // 双脚踩在掠兽脚平面）。其余 aiStyle 75 骑手（390）原版无此绘制覆写，仍用 AI 位
        const snapMount = e.vanillaId === 416 && e.master && !e.master.dead ? e.master : null;
        ctx.translate(snapMount ? snapMount.cx : e.cx,
          snapMount ? snapMount.y + snapMount.h : e.cy);
        // 620 origin 覆写的净位移(Main.cs:23562 origin.x -= 4·sdir ⇒ 纹理右移 4·sdir·scale)
        if (e.vanillaId === 620) ctx.translate(4 * (e.facing >= 0 ? 1 : -1) * (e.vanilla?.scale ?? 1) * e.vanillaScale, 0);
        // 旋转族:整体随自转角旋转(原版 npc.rotation;朝向翻转不适用)。
        // 4=克眼 visAngle;35/68=骷髅王头 spin;125/126=双子;127-131=Prime 头+部件;134-136=毁灭者链
        const rotId = ROTATION_NPC.has(e.vanillaId);
        let eyeMirrorByVx = false;   // 眼族 FindFrame case 2:镜像按 sign(vx) 自管
        // ★旋转驱动族总判定：朝向完全由 rotation 决定，原版这些家族不动 spriteDirection
        // （默认 -1 从不镜像）——渲染层禁止对其叠加 facing 镜像，否则"屁股朝前"
        // （噬魂怪 aiStyle5 实踩）。新增旋转族 AI 时必须登记在此，旋转与镜像共用本判定。
        // 例外：AI_005 内的"仅倾斜"成员（黄蜂 42/231-235、孢子蝠 176/205、蜜蜂 210/211）
        // 贴图横画、只 tilt 不转头——它们仍需镜像翻转朝向（原版同款 spriteDirection 翻转）。
        // 23 陨石头/139 探针为"转头+镜像"复合成员（AI 侧 visAngle=atan2(sy,sx)+π、
        // facing=sx 符号,cs:50962-51026）——留在 tiltOnly5 借用镜像通道,旋转走 visAngle。
        const idR = e.vanillaId ?? -1;
        const stR = e.vanilla?.aiStyle ?? 0;
        const tiltOnly5 = stR === 5 && (idR === 23 || idR === 42 || idR === 139 || idR === 176 || idR === 205
          || idR === 210 || idR === 211 || (idR >= 231 && idR <= 235));
        const rotationDriven = !tiltOnly5
          && (idR === 4 || rotId || stR === 5 || stR === 6 || stR === 9 || stR === 19 || stR === 20 || stR === 21 || stR === 23
            || stR === 40 || stR === 56 || stR === 76);   // 76=火星飞碟核心 395(spriteDirection 恒默认从不写);20=刺球70(链向旋转,同恒默认)
        if (e.vanilla?.aiStyle === 20) {
          // AI_020 刺球（type 70，Main.cs:23092 绘制侧写 rotation=atan2(锚−球)−π/2
          // → 本体贴图随链向对齐；:23660 通用绘制消费）——drawSpikeBallChain 已算好
          // 存 visAngle；spriteDirection 恒默认从不写 → 禁 facing 镜像（rotationDriven）
          ctx.rotate(e.visAngle);
        } else if (e.vanilla?.aiStyle === 21) {
          // AI_021 火轮（type 72，cs:24685/:24704）：rotation ±direction×directionY×0.13/t
          // 随 ai[1] 相位交替——visAngle 承载累计角（Enemy.spikeBallAI W2 批 2026-08-19）
          ctx.rotate(e.visAngle);
        } else if (e.vanillaId === 4) ctx.rotate(e.visAngle);
        else if (e.vanillaId === 116) {
          // 饥饿者 II（FindFrame case 116，cs:74789-74808）：rotation=atan2(vy,vx)，
          // vx<0 再 +π；spriteDirection=sign(vx)（vx>0 镜像——在下方通用镜像位补，
          // 本分支自带旋转故进 rotationDriven 禁用 facing 镜像，否则双翻）
          if (e.vx !== 0) ctx.rotate(Math.atan2(e.vy, e.vx) + (e.vx < 0 ? Math.PI : 0));
        }
        else if (e.vanilla?.aiStyle === 5) {
          // AI_005 旋转按族分流（cs:51045-51054 + FindFrame 蜜蜂覆盖 L75553）：
          // 黄蜂 42/231-235、孢子蝠 176、205 仅倾斜 vx*0.1（不随飞行方向转头）；
          // 蜜蜂 210/211 倾斜 vx*0.2；其余（噬魂怪族等）朝目标/速度方向转头。
          // 全族统一转头会让黄蜂蜜蜂飞行中整只倒转=贴图翻转观感
          const id5 = e.vanillaId;
          if (id5 === 42 || id5 === 176 || id5 === 205 || (id5 >= 231 && id5 <= 235)) ctx.rotate(e.vx * 0.1);
          else if (id5 === 23 || id5 === 139) ctx.rotate(e.visAngle);   // 探针/陨石头转头（cs:50962-51026,曾误并 139 入 tilt 档）
          else if (id5 === 210 || id5 === 211) ctx.rotate(e.vx * 0.2);
          else ctx.rotate(e.visAngle);
        }
        else if (e.vanilla?.aiStyle === 6) ctx.rotate(e.visAngle); // AI_006 蠕虫族:cs:51500 段随链方向旋转(贴图正面朝上,+π/2)
        else if (e.vanilla?.aiStyle === 40) ctx.rotate(e.visAngle); // AI_040 爬墙蜘蛛:npc.rotation 随移动/期望速度角(cs:29865/29919),531 +π/2
        else if (e.vanilla?.aiStyle === 23) ctx.rotate(e.visAngle); // AI_023 飞行武器:冲刺角 atan2+0.785 / 蓄转递增(cs:25336-25390)
        else if (e.vanilla?.aiStyle === 56) ctx.rotate(e.visAngle); // AI_056 地牢之魂:rotation=atan2(v)-π/2(cs:32927)
        else if (stR === 19) ctx.rotate(e.visAngle);   // AI_019 蚁狮 69:rotation=atan2(瞄准)+π/2 钳±0.8(cs:24477-24486);spriteDirection 恒默认→禁镜像(rotationDriven)
        else if (stR === 17 && idR === 61) ctx.rotate(e.vx * 0.1);  // 秃鹫 FindFrame(cs:74235-74240):rotation=vx×0.1 每帧含飞行;spriteDirection=direction 仍镜像——曾误挂 aiStyle5 分支=死代码(61 是 aiStyle17)
        else if (stR === 22) ctx.rotate(e.visAngle);   // AI_022 幽灵族:169 冰雪元素瞄准角(cs:24970-24979+spriteDirection=direction)/268 灵液粘怪 vx×0.1(cs:25004)——AI 已写 visAngle 但渲染分支未接(2026-08-20 旋转三件套审计);其余族员原版不旋转(恒 0)
        else if (stR === 44) ctx.rotate(e.visAngle);   // AI_044 飞鱼/飞蚁狮 224/509/581/587——findFrameRotation 层喂值:509/581 vx×0.1(cs:31107/:31140)、224/587 ±vy×0.2(FindFrame cs:75460-75468);spriteDirection 仍镜像
        else if (stR === 16) ctx.rotate(e.visAngle);   // AI_016 鱼族:通用 vy×dir×0.1 钳±0.2/692 貌鱼瞄准钳±0.3/海豚跃出 vy×dir×0.3 钳±2π/5+空中翻滚(cs:23664-24076 尾段);spriteDirection 仍镜像
        else if (stR === 39) ctx.rotate(e.visAngle);   // AI_039 陆龟族 153/154/417:弹射态恒速自旋(ai[2]=0.3/t)、下落态衰减、复位归零(cs:29562-29645);spriteDirection 仍镜像
        else if (stR === 9) ctx.rotate(e.visAngle);    // AI_009 弹跳球族:rotation += 0.1/0.4×direction(bouncingBallAI 已写 cs:21473/:21549);spriteDirection 恒默认→禁镜像(rotationDriven)
        else if (stR === 60 || stR === 62 || stR === 63) ctx.rotate(e.visAngle);  // AI_060/062/063 冰雪女王/玩具直升机/弗洛科——AI 已写(冰后 vx×0.05/0.01/+=0.2 cs:33601-33853;直升机 |vx|×dir×0.1 :34158;弗洛科 +=dir×0.3 与 vx×0.15 :34239/:34254)曾无消费门=半断链;spriteDirection 仍镜像
        else if (stR === 95 || stR === 96 || stR === 97) ctx.rotate(e.visAngle);  // AI_095-097 小星细胞/水流入侵者/星云悬浮脑——AI 已写(+=vx×0.1 / vx×0.1 / |vx|×dir×0.1)曾无消费门;spriteDirection 通用镜像(422 反翻见 revFlipMirror :39900)
        else if (stR === 85) ctx.rotate(e.visAngle);   // AI_085 星细胞/星云头蟹/致命球:0 态 +=dir×0.3 自旋、2/3/4 态 vx×0.1(cs:39030/:39076/:39096/:39121);spriteDirection 仍镜像
        else if (idR === 301) ctx.rotate(e.visAngle);  // 渡鸦(FindFrame :74287 vx×0.1;aiStyle1 战士族逐 id 接)
        else if (stR === 14 && (idR === 156 || idR === 226)) ctx.rotate(e.visAngle);  // 红恶魔/飞蛇(FindFrame :74604/:75510 vx×0.1;蝙蝠族逐 id)
        else if (stR === 115 && idR === 603) ctx.rotate(e.visAngle);  // 海鸥2(FindFrame :74550+ 空中 vx×0.1/水面与静止 0)
        else if (stR === 7 && (idR === 230 || idR === 593)) ctx.rotate(e.visAngle);  // 走路金鱼/金色走路金鱼(FindFrame :76585+ 高速下落 −=vy×0.01 抬头、落地归零)
        else if (stR === 3 && (idR === 461 || idR === 469)) ctx.rotate(e.visAngle);  // 深渊来客(空中 (rot×4+瞄准)/5 平滑+翻面取反 :76025+)/被附身者(冲刺态 atan2+π/2 :76365+)
        else if (stR === 2 && (idR === 2 || (idR >= 190 && idR <= 194) || idR === 317 || idR === 318)) {
          // 恶魔眼族 FindFrame case 2(:74815-74827):rotation = atan2(vy,vx)(vx<0 再 +π)、
          // spriteDirection = sign(vx)——瞳孔全程追踪速度向,AI 的 vy×0.1 倾斜(:52906)
          // 被本覆写。曾只接 133 且注释"其余不旋转"=误读(2026-08-25 用户实报不转)。
          // 镜像按 sign(vx) 自管(绕过通用 facing 镜像——追踪向≠速度向的瞬态防双翻)
          ctx.rotate(Math.atan2(e.vy, e.vx) + (e.vx < 0 ? Math.PI : 0));
          // spriteDirection = sign(vx)（:74819/:74824）→ DrawNPC :23358-23361
          // spriteDirection==1 翻转(原生贴图朝左)——vx>0 时翻;曾漏加翻转=右飞贴图反
          if (e.vx > 0) ctx.scale(-1, 1);
          eyeMirrorByVx = true;
        } else if (stR === 2 && idR === 133) ctx.rotate(e.visAngle);   // 游荡眼(随速度角、左行 +π)
        else if (stR === 2) ctx.rotate(e.visAngle);   // AI_002 其余成员(猪龙 170-180 等):AI 倾斜 vy×0.1×dir(:52906)——曾无消费门=猪龙不倾斜
        else if (e.vanilla?.aiStyle === 13) ctx.rotate(e.visAngle); // AI_013 植物族:头随朝玩家伸展方向旋转(cs:22778-22794);spriteDirection 仍翻转→不进 rotationDriven
        else if (stR === 93) ctx.rotate(e.visAngle);   // AI_093 荷兰飞盗船:rotation=vx*0.025(cs:41011);spriteDirection=-sign(vx) 仍镜像
        else if (stR === 102 || stR === 109) ctx.rotate(e.visAngle); // AI_102/109 沙尘精/黑暗魔法师:rotation=vx*0.04(cs:42249/:66415)
        else if (stR === 103) ctx.rotate(e.visAngle);  // AI_103 沙鲨族:rotation=vy*dir*0.1 钳±0.2(cs:42765)
        else if (stR === 18) ctx.rotate(e.visAngle);   // AI_018 水母族:漂移形 rotation=vx*0.4(cs:24453) / 攻击形 atan2(v)+π/2(cs:24409) / 离水 vx*0.1(cs:24509)——★F 锚校正(旧 24371/24422/24459 为漂移行段误记)
        else if (stR === 76) ctx.rotate(e.visAngle);   // AI_076 火星飞碟核心 395:相位摆动→整周自旋(martianSaucerAI 写 visAngle,ai0==1 态 cs:36644-36662;ai0==2 归 0 :36748)。
          // 原版 case 392-395 专属绘制 base+GlowMask 同 rotation 同 origin 二次 Draw(cs:24202-24231)
          // ——本仓 drawNpcGlow 在本体同一变换内叠画(见调用点注),rotate 一次即双层跟随,glow 管线零改动。
          // spriteDirection 恒默认 -1 从不写(AI_076 全段无 direction 写点)→进 rotationDriven 禁镜像。
        else if (stR === 75 && (idR === 392 || idR === 393 || idR === 394)) ctx.rotate(e.visAngle);
          // AI_075 飞碟部件 392/393/394:rotation=主体 rotation(cs:35816-35817/:35871-35872/:35883-35884,
          // martianSaucerPartAI 继承 visAngle+锚偏移同步 RotatedBy)。逐 id 门:同 aiStyle 的骑手
          // 390/416/坐骑 391/415/荷兰炮 492 不接(492 走 dutchmanCannonAI 早退;骑手族原版 rotation 恒 0)。
          // 394 spriteDirection=±1 按 ai[1](:35886)仍翻面→不进 rotationDriven;392/393 随主体恒 -1 不翻。
        else if (stR === 26 && idR === 546) {
          // 546 怒滚虫(AI_026 cs:63365-63369):rotation += vx×0.05 持续滚转累积(chargerAI 尾写 visAngle)。
          // 原版 generic draw origin=halfSize=帧中心 → 枢轴在帧中心;中心锚(2026-08-24)后
          // 本仓 translate=盒中心、绘制 −sh/2 → 枢轴天然=帧中心,直转即可
          // （曾因底锚需手工平移枢轴 −sh·scale/2+4,锚点勘误后删除）。
          // 【台账勘误】台账"DrawNPC :62640-62741 态机(case 3 朝 0/π/越阈 0.05/AngleTowards)"
          // 实为 AI_110_Betsy(cs:62640-62741)段误归属——546 真身无态机,仅此一行累积式+镜像取反。
          ctx.rotate(e.visAngle);
        }
        else if (idR === 664) ctx.rotate(e.visAngle);  // 火把神(FindFrame :75558 rotation=vx×0.1,findFrameRotation 层喂值)。
          // 原版/本仓均无 664 生成路径(事件本体=弹幕 949,664 仅图鉴记账 Player.cs:37109-37116)——
          // 门为三件套完备性预置,若未来接事件实体生成即活。spriteDirection=sign(vx)(:75552-75556
          // 双态档)→通用 facing 镜像语义,不进 rotationDriven。
        else if (stR === 67) {
          // AI_067 蜗牛(G4 批 2026-08-19):rotation 四象限 0.1/t 缓转(snailAI 维护
          // visAngle,:34763-34857)+ 象限 spriteDirection 局部翻面(Enemy.snailSdir,
          // :34766-34794 表锁存)——XNA translate→rotate→scale(flip) 组合里翻面沿
          // 【已旋转的局部 X 轴】施加(天花板/侧墙档由此得垂直翻面观感);spriteDirection
          // 与 direction 不同源(表驱动,天花板档与移动方向相反)→通用 facing 镜像禁用
          ctx.rotate(e.visAngle);
          if (e.snailSdir === 1) ctx.scale(-1, 1);
        }
        else if (stR === 108 || stR === 110) ctx.rotate(e.visAngle); // AI_108 俯冲飞行族(cs:66120 速度角±π折叠)/AI_110 Betsy(cs:62714 AngleTowards):均保留 spriteDirection 镜像
        else if (stR === 117) ctx.rotate(e.visAngle);  // AI_117 恐惧鹦鹉螺:rotation 状态机(AngleTowards/AngleLerp,cs:47615);spriteDirection=-direction 反翻(见 revFlipMirror;:47700,旧注"仍镜像"=误)
        else if (stR === 24) ctx.rotate(e.vx * 0.1);   // AI_024 鸟族:仅倾斜 vx*0.1(cs:74332/:74359/:74382);spriteDirection 仍镜像(611/689 取反见下)
        else if (stR === 10) ctx.rotate(e.visAngle);   // AI_010 诅咒头骨族:rotation=atan2(v)(vx<0 再+π,cs:21713-21721;694 伪装/觉醒态钉 0);spriteDirection 仍镜像→不进 rotationDriven
        else if (stR === 68) ctx.rotate(e.vx * 0.1);   // AI_068 水鸟族:同款倾斜 vx*0.1(cs:74487,湿态归零近似省略)
        else if (stR === 65) ctx.rotate(e.vx * 0.3);   // AI_065 蝶族:倾斜 vx*0.3(cs:73426)
        else if (stR === 66) ctx.rotate(e.spin);      // AI_066 蠕虫族:FindFrame case 357/485(:73460/:73541)——腾空自旋方向×0.1/t 累积、贴地归零、坡面 ±0.785(wormCritterAI 维护)
        else if (stR === 112) ctx.rotate(e.vx * 0.1);  // AI_112 仙灵:FindFrame case 583-585 rotation=vx×0.1(cs:70620)——飞行俯仰倾斜;spriteDirection 仍镜像(反翻族见下)
        else if (rotId) ctx.rotate(e.spin);
        ctx.scale(scale, scale);
        // 原版默认朝左(flip 当 spriteDirection==1);旋转族(rotationDriven)禁镜像;
        // 鸮族 611/689 spriteDirection=-direction(:74381)→仅 facing<0 时翻,
        // ★须从通用行排除,否则两条叠加成"恒翻转"(2026-08-18 终审抓出);
        // 蚯蚓族 357/374/448/484/606 case 从不设 spriteDirection(:73455)→恒不镜像
        // (蛆虫族 485-487 :73515 设 direction→正常镜像)
        const owlMirror = e.vanillaId === 611 || e.vanillaId === 689;
        // 仙灵三色 583-585:AI_112 尾 spriteDirection=-direction(cs:49134-49138)——
        // 贴图原生朝右、反翻族,与鸮族同款"facing<0 才翻"(曾走通用 facing>0 翻=
        // 倒飞背对行进向,2026-09-02 用户实报)
        const fairyMirror = idR === 583 || idR === 584 || idR === 585;
        // 反翻族补遗（2026-09-02 遗留批审计:-direction 写点全量扫）:
        // 618 血鹦鹉螺 AI_117 头段 spriteDirection=-direction(:47700,曾注"仍镜像"=错);
        // 422 aiStyle 97 专属支 spriteDirection=-direction(:39900,同族 493/507/517 通用)
        const revFlipMirror = idR === 618 || idR === 422;
        // 546 怒滚虫 spriteDirection=−direction(cs:63368)→同鸮族反翻档:facing<0 才翻
        // (facing 兼作 chargerAI 的 AI direction,不可在 AI 侧取反)
        const sdirNeg = e.vanillaId === 546;
        // 301 渡鸦（FindFrame :74257-74271 专属支,贴图原生朝右）：spriteDirection
        // 有态写点已迁 Enemy.findFrameRotation（落地=-direction/飞行 vx±0.5 滞回/
        // 死区保前值 → e.ravenSdir）——此处只按 Main.cs:22984 `spriteDirection==1`
        // 镜像。曾落通用镜像档=恒倒飞(2026-08-26 用户实报墓地乌鸦);中间版无态
        // 双式在转向/击退瞬态与死区滞回上偏离,终版=有态字段 1:1
        const ravenMirror = e.vanillaId === 301;
        const ravenFlip = ravenMirror && e.ravenSdir === 1;
        const wormMirror = stR === 66 && !(e.vanillaId >= 485 && e.vanillaId <= 487);
        // 蜗牛 aiStyle67 spriteDirection 走象限表(上方旋转分支自带局部翻面)——
        // 通用 facing 镜像禁用,否则与象限翻面叠加成恒翻
        const snailMirror = stR === 67;
        // AI_006 三族定向镜像（NPC.cs:52163-52173 逐 tick 速度写 spriteDirection +
        // :52459-52467 段跟随块按 num49 写;DrawNPC :23357-23361 sdir==1 → 翻面）:
        // 87-92 飞龙/454-459 幻影龙/621-623 血鳗鱼贴图基础【朝右】、向左行进才翻——
        // 与通用 facing 门极性相反,且 rotationDriven 族不进通用门,曾缺=向左飞时
        // 背腹倒置(绿鳍朝下/肚皮朝上,2026-09-02 用户实报飞龙)。
        // 极性:头 facing=vx 符号(1=向右,Enemy:903)→ flip 门 facing<0;
        // 段 facing=dxC 符号(1=头在左=向左行,Enemy:930,≡原版 spriteDirection)
        // → flip 门 facing>0。vx==0/dxC==0 原版保前值,此处静态近似(瞬态)。
        const wyrmMirror = stR === 6
          && ((idR >= 87 && idR <= 92) || (idR >= 454 && idR <= 459) || (idR >= 621 && idR <= 623));
        if (!rotationDriven && !owlMirror && !sdirNeg && !ravenMirror && !wormMirror && !snailMirror && !fairyMirror && !revFlipMirror && !eyeMirrorByVx && e.facing > 0) ctx.scale(-1, 1);
        if (!rotationDriven && (owlMirror || sdirNeg || fairyMirror || revFlipMirror) && e.facing < 0) ctx.scale(-1, 1);
        if (ravenFlip) ctx.scale(-1, 1);   // 301:spriteDirection 态机已含全部双态/滞回,不叠 facing 门
        if (wyrmMirror && (e.wormFollow ? e.facing > 0 : e.facing < 0)) ctx.scale(-1, 1);
        if (e.vanillaId === 116 && e.vx > 0) ctx.scale(-1, 1); // 116 spriteDirection=sign(vx)（FindFrame case 116 自带翻转）
        // 血肉墙三件套 113 嘴/114 之眼/115 饥饿者：AI 逐 tick 写 spriteDirection——
        // 113 wallOfFleshAI spriteDirection=direction(:26102)/114 之眼
        // direction=墙.direction;spriteDirection=direction(:26216-26217)/115 饥饿者
        // spriteDirection=sign(玩家−部件)(:26546-26555)；通用 Draw :23358-23360
        // `spriteDirection==1 → FlipHorizontally`。三件套同在 ROTATION_NPC 旋转档
        // （rotationDriven 禁通用镜像行）曾漏翻 = 墙左→右行进(facing=1)时嘴/眼贴图
        // 不镜像（原版贴图原生朝左,本仓 facing=1 ≙ spriteDirection=1）——用户实报
        // 2026-09-02。右→左(facing=-1)原版本就不翻,该向渲染参数零变化。
        // 翻转位于 rotate(e.spin) 之后 = XNA origin 系内层 flip,与 vanilla 矩阵序一致
        if (idR === 113 || idR === 114 || idR === 115) {
          if (e.facing > 0) ctx.scale(-1, 1);
        }
        // ★P′-MAJOR（红队 P′ 复捞,2026-09-02）：同机制家族缺口——128-131 骷髅泰坦
        //  四臂（129 锯/130 钳/128 炮/131 激光,aiStyle 33-36）AI 每 tick
        //  spriteDirection = -(int)ai[0]（NPC.cs:28133/:28423/:28703/:28939）,本仓
        //  AI 侧已算好等值字段 bossAI.ts:1655 `e.facing = -side` 但渲染端无人消费
        //  =四臂贴图左右朝向恒镜像错误（pre-existing 债,与三件套同机制同批清偿）。
        if (idR >= 128 && idR <= 131) {
          if (e.facing > 0) ctx.scale(-1, 1);
        }
        // ★373 鲨鱼龙（红队 P′ "dormant"结论反转：dukeFishronAI/sharkronAI 已实装
        //  bossAI_duke_moonlord.ts,MinionProj:3005 亦有交互）。原版(1457 :35340-35348)
        //  spriteDirection=direction **且** rotation=ToRotation()+π·[direction==−1]
        //  ——flip 与 π 并存（flip 只补镜像不补 180°）,AI 侧 spin 已恢复 π 项
        //  （曾误判"裸值+flip"=向左扑咬 180° 错向,红蓝对抗 R1-F1/B1-D1 校正）。
        //  ★批4（2026-09-03）：AI_071 的 direction 与 spriteDirection 是两个字段——
        //  蓄力段(ai0=0) 373 摆头向按 cos 符号写 spriteDirection（:35307-35310）、
        //  372 恒字段缺省 -1 不翻,起扑后 spriteDirection=direction（:35340）。
        //  故 flip 源按相位分流：蓄力读 sharkronSdir,起扑读 facing（曾全程读
        //  facing=蓄力期朝向恒镜像+无摆头,2026-09-03 校正）。
        if (idR === 373 || idR === 372) {
          const sharkFace = e.ai0 === 0 ? e.sharkronSdir : e.facing;
          if (sharkFace > 0) ctx.scale(-1, 1);
        }
        // ★370 猪鲨本体 flip（红蓝对抗 B1-E10 实锤,2026-09-03 补）：贴图原生朝右
        //  （NPC_370.png 目验 眼/獠牙在右,非"近对称"）,原版 hover spriteDirection=
        //  -direction（:49525/:49618 一带）+ 通用 flip 门 sdir==1（Main.cs:23358）。
        //  AI 侧 spin 伺服本就按"flip 存在"的原版式写（st.spr=+1 → target+π,e.facing
        //  ≡ spriteDirection）——曾缺 flip 位=玩家居左时头尾反向（鱼腹朝上）。
        //  370 ∈ ROTATION_NPC → 通用 facing 镜像被 rotationDriven 排除,此处补
        //  flip（rotate 后内层 scale,与 113/128/372 同矩阵序）。
        if (idR === 370) {
          if (e.facing > 0) ctx.scale(-1, 1);
        }
        // 原版 alpha 语义（NPC.Opacity/GetAlpha）：不透明度 = 1 - alpha/255。
        // alpha 是 SetDefaults 每类型静态值（0=实体；史莱姆 175=半透明凝胶），无通用渐隐
        // ★有 color 的 NPC：base+color 两遍合一为单张合成精灵（xnaCombined 注），
        //   此处先烘焙；基础层直绘被门控跳过（合成精灵已含 base 项，双画=叠 base）。
        // GetNPCColorTintedByBuffs（1457 NPC.cs:92142）debuff 染色乘区先并入 color——
        //   原版 draw color = light × npcColor,tint 是 npcColor 的通道乘区
        const dbTint = e.debuffTintRGB;
        const drawColor = dbTint && e.colorRGBA
          ? [e.colorRGBA[0] * dbTint[0] / 255, e.colorRGBA[1] * dbTint[1] / 255,
            e.colorRGBA[2] * dbTint[2] / 255, e.colorRGBA[3]] as number[]
          : e.colorRGBA;
        const xnaColor = (drawColor && drawColor[3] > 0)
          ? this.xnaCombined(`npc${e.vanillaId}`, r, drawColor,
              Math.min(255, Math.max(e.spawnAlpha, 0)) / 255)  // ★用户校准态 ka=alpha/255（0.686）——原版推导值 1−alpha/255 待肉眼二选一
          : null;
        ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
        // EoC 锚点:NPC_4 每帧 110×166,眼球质心帧内 y≈106(帧中心 83)——
        // 原版 DrawNPC 的 halfSize=(55,107) 覆写（Main.cs:23280-23285）在
        // "position−frameHalf+halfSize" 与 "origin=halfSize" 之间【完全抵消】
        // （position.y 多加的 107s 被 origin.y 107s 减回）= 帧【居中】钉盒中心,
        // 眼球质心落盒中心下方 23px（盒内,盒向下 45s 覆盖全眼球）。
        // ★本仓曾有 eocOff +23/+30 的额外下移 = 双重下移（美术质心已偏下 23,
        // 再 +23 → 眼球质心落到盒底缘,盒悬在眼球上缘=用户实报 2026-08-29
        // "盒挂在眼球错位"）——已按原版居中锚移除。
        // 通用锚:帧中心钉盒中心(+num46/num47 下沉,见上方 translate 注)。
        // addY 保持纹理单位（XNA `return num * npc.scale` :22393——偏移随 npc.scale
        // 缩放,ctx.scale(scale) 天然乘回;曾误 /scale 除反,专家档 13-15/134-136
        // ×1.2/×1.05 时与原版差 5-6px）。
        // ★「落脚贴合」v6 内禀计算(2026-08-30 终版):不再查表——按本次实际绘制的
        // 切片内容底行,实时求"让内容底行贴住盒底"的位移。对所有竖条路径/形态/
        // 姿态天然成立;旋转族绕枢轴转无地面概念故豁免。
        let footFlush = 0;
        if (npcFootFlushOn() && !rotationDriven && !npcFootBiasExempt(idR)) {
          const fmaxRow = npcContentBottomRow(r.img, r.sy, r.sw, r.sh);
          if (fmaxRow >= 0) {
            // 目标:cy + dyArg + fmaxRow+1 ≡ 盒底(cy + h/2) ⇒ dyTarget = h/2 − fmax − 1
            // ★量纲:dyArg 为纹素空间(ctx.scale(scale) 前),盒半高须同空间
            //  = e.h/(2·scale)。漏除曾令 v.scale≠1 型系统性沉底(B路R2-b必修)
            const dyTarget = e.h / (2 * scale) - fmaxRow - 1;
            footFlush = Math.round((dyTarget - (-r.sh / 2 + addY)) * 100) / 100
              + npcFootBiasExtra() + npcFootBiasOverride(idR);
            footFlush = Math.max(-24, Math.min(24, footFlush));
          }
        }
        const anchorY = -r.sh / 2 + addY + footFlush;
        // 393 飞碟炮塔绘制 origin+UnitY×(−8)（Main.cs:24208-24213 num225=-8 仅 393;
        // 台账登记偏差本批清偿）：XNA origin 上移 8 纹素 = 精灵整体下移 8×scale 世界 px,
        // 且旋转枢轴随 origin 钉死在 position（=本仓局部原点,ctx.rotate 已绕它）——
        // 故只须把本体绘制目标 y+8（draw 系单位,×scale 即 8 世界 px）,枢轴免调。
        // 台账旧注"需通用锚点管线"不成立:单 id 常量偏移即可
        const bodyY = anchorY + (e.vanillaId === 393 ? 8 : 0);
        // 回填实际贴图底边（世界 y），供 drawHealthBar 定位兜底（见 Enemy.spriteBottomWorld 注释）
        e.spriteBottomWorld = e.cy + (bodyY + r.sh) * scale;
        if (e.vanillaId === 50) {
          // 史莱姆王体内忍者（Main.cs:22798-22817）：★画在本体【之前】=忍者
          //  在史莱姆下层——原版忍者绘制 :22817 先于通用本体绘制 :22852，
          //  凝胶体半透明盖住忍者身体只露出头/手。曾叠画在本体后=忍者浮在
          //  史莱姆上层（2026-08-21 用户实报层序颠倒）
          const ninja = this.atlas.vmisc('vanilla/Ninja.png');
          if (ninja) {
            const zeroY = -e.vy + (r.sy === 120 ? 2 : r.sy === 360 ? -2 : r.sy === 480 ? -6 : 0);
            const zeroX = -e.vx * 2;
            ctx.save();
            ctx.translate(zeroX, zeroY + footFlush);   // 随本体落脚同步下沉(v6)
            ctx.rotate(e.vx * 0.05);
            ctx.drawImage(ninja.img, -ninja.sw / 2, -ninja.sh / 2, ninja.sw, ninja.sh);
            ctx.restore();
          }
        }

        // 568/569 出生态紫雾（本体绘制层，先于本体画——Main.cs:26060-26076 拷贝循环
        // 在 vector72 本体 draw 之前）
        if (e.vanillaId === 568 || e.vanillaId === 569) this.drawWitherBirth(ctx, e, r, scale);
        // debuff 染色在身时基础层由下方 tintedSprite(multiply) 版本承担（双画=叠亮）
        if (!xnaColor && !dbTint) ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, bodyY, r.sw, r.sh);
        // 618 血月潜舰触腕叠加层（DrawNPC Extra_129 段：通用帧后追加同帧叠画）
        if (e.vanillaId === 618) {
          drawDreadnautilusOverlay(ctx, e, this.atlas,
            { sx: r.sx, sy: r.sy, sw: r.sw, sh: r.sh });
        }
        // ---- EoC 冲刺残影（Main.cs:25469-25481 1:1）：门 = ai[0]==3 且 ai[1]≥4
        //      （P2 连冲态 4 / 悬下方回冲态 5）→ 沿 oldPos 画 9 层鬼影，每层 RGBA
        //      × 0.5×(10−i)/20（越旧越淡），同一帧/旋转，锚点同本体（居中锚）。
        //      原版该分支在 DrawNPC 本体 Draw 之后求值 → 鬼影压在本体之上（越近越深）；
        //      此前近似门 dashing && phase≥2 把普通 3 连冲也画了鬼影且画在本体之前。
        //      仓内映射：ai0=ai[0]、state=ai[1]（见 Enemy.eocAI 头注）----
        if (e.vanillaId === 4 && e.ai0 === 3 && e.state >= 4) {
          for (let i = 1; i < 10; i++) {
            const depth = e.historyDepth();
            if (i >= depth) break;
            const ga = (10 - i) / 40;   // 0.5 × (10-i)/20
            if (ga <= 0.01) continue;
            ctx.save();
            ctx.translate(e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2);
            ctx.rotate(e.visAngle);
            ctx.scale(scale, scale);
            if (!rotationDriven && e.facing > 0) ctx.scale(-1, 1);
            ctx.globalAlpha = ga * (1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255);
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
            ctx.restore();
          }
          ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
        }
        // 原版 color 二次绘制（Main.cs:24527 + NPC.GetColor L94903）：color≠default 时用
        // 同贴图再画一遍、逐像素乘 color（XNA SpriteBatch 天生贴轮廓）；
        // color.A 决定该 pass 强度（史莱姆贴图是白剪影，颜色全靠这层）。
        // debuff 染色乘区（GetNPCColorTintedByBuffs,1457 :92142）已在上方并入 drawColor
        if (drawColor && drawColor[3] > 0) {
          if (xnaColor) {
            // ★单张合成（base+color 两遍恒等,见 xnaCombined 长注）——α=occ 使
            //   空气背景 0.417 透出保留（三步 lighter 方案 α 钳 1 丢失它=过暗残因）
            ctx.globalAlpha = 1;
            ctx.drawImage(xnaColor.c, xnaColor.x, xnaColor.y, xnaColor.w, xnaColor.h,
              -r.sw / 2, bodyY, r.sw, r.sh);
            ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
          } else {
          // 兜底（合成烘焙失败,如贴图缺帧）：三步拆解——
          //   ② destination-out(同贴图, ga=colorA/255) → dst×(1−T.a·kc) 精确衰减
          //   ③ lighter(tinted, ga=1) → +T·a·color.rgb 预乘加法贡献
          // （GetColor rgb 不乘 color.A——ga=colorA/255 会把贡献也乘 0.392）
          const tinted = this.tintedSprite(`npc${e.vanillaId}`, r, drawColor);
          const anchorY = -r.sh / 2 + addY + footFlush;   // 复用外层(含落脚),勿遮蔽
          if (tinted) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = drawColor[3] / 255;
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY, r.sw, r.sh);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 1;
            ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, -r.sw / 2, anchorY, r.sw, r.sh);
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
          }
        }
        // debuff 染色（无自身 color 的 NPC）：tintedSprite(multiply) 替代基础精灵
        // 直绘——原版 npcColor 乘进 draw color,等价于整精灵 RGB 乘区（α 保持轮廓）
        else if (dbTint) {
          const tinted = this.tintedSprite(`npcTint${e.vanillaId}`, r, dbTint);
          if (tinted) {
            ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
            ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h,
              -r.sw / 2, bodyY, r.sw, r.sh);
            ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
          }
        }
        // 史莱姆王体内忍者（Main.cs:22798-22818 1:1）：独立贴图 Ninja.png 叠画在
        // KS 中心，随速度反向摆动（zero=-vy / -vx*2）+ rotation=vx*0.05，
        // 帧顶 120/360/480 的挤压帧 y 修正（+2/-2/-6）
        if (e.vanillaId === 50) {
          // 头顶金冠（Main.cs:25571-25595 case 50，1:1）：贴图 Extra_39（82×56，
          // wiki"the crown...separate image files...Extra_39 internally"）。锚点 =
          // KS Center 上移 (70-num223)×scale，num223 按帧序 [2,-6,2,10,2,0]；
          // 朝向翻转继承外层 facing scale。gfxOffY 恒 0（KS 无悬浮偏移）
          const crown = this.atlas.vmisc('vanilla/Extra_39.png');
          if (crown) {
            const frameIdx2 = Math.round(r.sy / r.sh);
            const num223 = [2, -6, 2, 10, 2, 0][frameIdx2] ?? 0;
            // 原版锚 = KS Center − (70−num307)×scale（:26476-26478,origin=冠图中心,
            // scale=1f）——中心锚(2026-08-24)后原点即盒中心,曾按底锚写的 −e.h/2
            // 补偿已双重偏移,删
            ctx.drawImage(crown.img, -crown.sw / 2, -(70 - num223) * scale - crown.sh / 2 + footFlush, crown.sw, crown.sh);
          }
        }
        // NPC GlowMask 发光叠画（Main.cs DrawNPC 内硬编码 switch，见 drawNpcGlow 表）
        // ——与基础精灵同变换叠加（原版同一 position/origin 二次 Draw）
        // bx/by = 基础精灵目标左上（地面型=底锚+pad / 飞行型=中心锚），发光层与本体同锚
        this.drawNpcGlow(e, r, -r.sw / 2, anchorY);
        // 546 怒滚草亮核（Main.cs:26156-26158,rotation 台账附带登记本批清偿）：
        // Extra_76 专属 glow 叠画——rotation=Clamp(vx×0.1,±π/8) 瞬时式,与本体
        // 累积滚转 visAngle 不同源 → 共轭换角独立绘制（draw546GlowCore;
        // ?. = drawEnemy 测试假体可缺省此方法,生产类恒有）
        if (e.vanillaId === 546) this.draw546GlowCore?.(e, r, -r.sw / 2, bodyY, scale, e.facing < 0);
        // Mech 族 oldPos 拖尾（Main.cs:24592-24605：125-131 全族 + 139 自由态（ai3==0）
        //  + 140；oldPos 9→1 间隔 2 共 5 份，α=(10-i)/20，同帧同当前旋转——原版此块
        // 在本体 Draw 之后求值 → 鬼影压在本体之上）
        {
          const mId = e.vanillaId ?? 0;
          if ((mId >= 125 && mId <= 131) || (mId === 139 && e.ai3 === 0) || mId === 140) {
            const depth = e.historyDepth();
            const mOp = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
            for (let i = 9; i >= 1; i -= 2) {
              if (i >= depth) break;
              ctx.save();
              ctx.translate(e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h / 2);
              ctx.rotate(e.spin);
              ctx.scale(scale, scale);
              if (!rotationDriven && e.facing > 0) ctx.scale(-1, 1);
              ctx.globalAlpha = ((10 - i) / 20) * mOp;
              ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY, r.sw, r.sh);
              ctx.restore();
            }
            ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // 星璇塔护盾半球（在精灵之后叠画，对齐原版 DrawNPC 尾段顺序）
        if (isTowerId(e.vanillaId)) this.drawTowerShield(e, world);
        // Mechdusa 蛇发（Main.cs:25070-25112，queen 127 的 DrawNPC 尾段叠画）：
        // 把 125/126 当蛇头，从 queen 头部锚点向各眼铺 Chain12 链式蛇身
        if (e.vanillaId === 127 && mechQueenUp()) this.drawMechdusaHair(e, entities);
        // 568/569 死亡紫魂环（Main.cs:26130-26155：Extra_89 ×16 @400，镜像变换外）
        if (e.vanillaId === 568 || e.vanillaId === 569) this.drawWitherSoulRing(e);
        return;
      }
      return; // 表未加载完成：本帧不画（下帧懒加载完成）
    }
    // ---- Maples 精灵优先 ----
    if (this.atlas) {
      let frames: ReturnType<SpriteAtlas['animFrames']> = [];
      let anchor: 'feet' | 'center' = 'feet';
      if (e.key.startsWith('slime')) { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'zombie') { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'cave_bat') {
        // 洞穴蝙蝠：原版 NPC_49（44x32×5 帧扑翼），逐帧动画
        if (!this.enemyAnimCache.has('bat49')) {
          const list: ReturnType<SpriteAtlas['animFrames']> = [];
          for (let k = 0; k < 5; k++) {
            const r = this.atlas!.vnpc(49, k);
            if (r) list.push(r);
          }
          this.enemyAnimCache.set('bat49', list);
        }
        frames = this.enemyAnimCache.get('bat49') ?? [];
        anchor = 'center';
      }
      else if (e.key === 'demon_eye') {
        // 恶魔之眼：NPC_2 双帧
        frames = this.enemyAnimCache.get('deye') ?? [];
        if (!frames.length) {
          const file = this.atlas.data.files['角色/NPC_2.png'];
          if (file) {
            frames = file.sprites.map((sp) => this.atlas!.rect('角色/NPC_2.png', sp.name)).filter(Boolean) as typeof frames;
          }
          this.enemyAnimCache.set('deye', frames);
        }
        anchor = 'center';
      }
      else if (e.key === 'eye_of_cthulhu') {
        // Boss 用 NPC_4：底部 3 帧 = 一阶段动画，顶部 3 帧 = 二阶段（实测对调）
        if (!this.enemyAnimCache.has('eoc_p1')) {
          const file = this.atlas.data.files['角色/NPC_4.png'];
          const toFrames = (arr: typeof file.sprites) =>
            arr.map((s) => this.atlas!.rect('角色/NPC_4.png', s.name)).filter(Boolean) as ReturnType<SpriteAtlas['animFrames']>;
          if (file) {
            const sorted = [...file.sprites].sort((a, b) => a.y - b.y); // 顶部在前
            this.enemyAnimCache.set('eoc_p1', toFrames(sorted.slice(3, 6)));
            this.enemyAnimCache.set('eoc_p2', toFrames(sorted.slice(0, 3)));
          } else {
            this.enemyAnimCache.set('eoc_p1', []);
            this.enemyAnimCache.set('eoc_p2', []);
          }
        }
        frames = e.phase === 2
          ? (this.enemyAnimCache.get('eoc_p2') ?? [])
          : (this.enemyAnimCache.get('eoc_p1') ?? []);
        anchor = 'center';
      }
      if (frames.length) {
        const rate = e.key === 'eye_of_cthulhu' ? (e.phase === 2 ? 6 : 10) : 12;
        const idx = Math.floor(e.animT / rate) % frames.length;
        const fr = frames[idx];
        ctx.save();
        if (flash) ctx.filter = 'brightness(2.5)';
        else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
        // 缩放贴合碰撞盒
        const h = anchor === 'feet' ? e.h * 1.25 : e.h;
        const w = (fr.sw / fr.sh) * h;
        if (anchor === 'feet') {
          ctx.translate(e.cx, e.y + e.h);
          // 素材默认朝左：向右移动时镜像（僵尸实测需要与其它怪一致的翻转）
          const flip = -e.facing;
          ctx.scale(flip, 1);
          // 贴底：原版恒 +4 下沉（Main.cs:24741——透明边距沉入地面，见怪物主路径注）
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h + 4, w, h);
        } else if (e.key === 'demon_eye') {
          // 恶魔之眼：以眼球为原点按移动方向自由旋转（贴图默认朝左，与 NPC 系素材一致）
          const ang = Math.atan2(e.vy, e.vx) + Math.PI;
          ctx.translate(e.cx, e.cy);
          ctx.rotate(ang);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else if (e.key === 'eye_of_cthulhu') {
          // 朝向移动方向自由旋转（AI 端平滑追踪目标角度，变身时三圈自转叠加）
          ctx.translate(e.cx, e.cy);
          ctx.rotate(e.visAngle);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else {
          ctx.translate(e.cx, e.cy);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
        ctx.filter = 'none';
        return;
      }
    }
    // ---- 程序化兜底 ----
    if (e.key.startsWith('slime') && spr) {
      const sq = 1 + e.squash * 0.25;
      const w = e.w * 1.3 * sq, h = e.h * 1.25 / sq;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
      ctx.translate(e.cx, e.y + e.h);
      ctx.scale(e.facing, 1);
      ctx.drawImage(spr.canvas, -w / 2, -h, w, h);
      ctx.restore();
      ctx.filter = 'none';
    } else if (spr) {
      const fw = spr.fw;
      const frame = spr.canvas.width > fw ? Math.floor(e.animT / 12) % (spr.canvas.width / fw) : 0;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      if (e.key === 'eye_of_cthulhu') {
        ctx.translate(e.cx, e.cy);
        if (e.phase === 2) {
          const f = Math.floor(e.animT / 10) % 2;
          ctx.drawImage(spr.canvas, f * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        } else {
          ctx.scale(e.facing, 1);
          ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        }
      } else {
        ctx.translate(e.cx, e.cy);
        ctx.scale(e.facing, 1);
        ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
      }
      ctx.restore();
      ctx.filter = 'none';
    }
    // ★shader 修齐批①：四柱护盾泡（Main.cs:24551-24583——盾在=Perlin 泡 White×
    //   (frac×0.8+0.2)+ForceField pass;破盾=膨胀淡出波 scale×(1+num321)/色(1−√num321)）。
    //   盾量源=world.lunarEvent.shield（R23b 清怪解锁机制）;破盾计时器本处逐帧推进
    if (e.vanillaId === 517 || e.vanillaId === 422 || e.vanillaId === 507 || e.vanillaId === 493) {
      const key = e.vanillaId === 517 ? 'solar' : e.vanillaId === 422 ? 'vortex'
        : e.vanillaId === 507 ? 'nebula' : 'stardust';
      const le = world.lunarEvent;
      const cur = le?.shield?.[key] ?? 0;
      const max = Math.max(1, shieldMaxOf(world));
      let st = PILLAR_FF.get(e);
      if (!st) { st = { lastShield: cur, breakTick: -1, reformTick: -1 }; PILLAR_FF.set(e, st); }
      if (st.lastShield > 0 && cur === 0) st.breakTick = 0;         // 盾破沿起
      if (st.lastShield === 0 && cur > 0) st.reformTick = 0;        // 重塑淡入沿起
      if (st.breakTick >= 0 && st.breakTick <= 120) st.breakTick++;
      if (st.reformTick >= 0 && st.reformTick <= 30) st.reformTick++;
      st.lastShield = cur;
      if (!e.dead && (cur > 0 || (st.breakTick >= 0 && st.breakTick <= 120))) {
        const tint: [number, number, number] = e.vanillaId === 517 ? [1, 0.45, 0.1]
          : e.vanillaId === 422 ? [0.4, 0.45, 1]
          : e.vanillaId === 507 ? [1, 0.35, 0.8] : [0.3, 0.9, 1];
        drawForceFieldBubble(ctx, this, {
          cx: e.cx, cy: e.cy,
          radius: Math.max(e.w, e.h) * 0.9 + 40,
          tint, frac: Math.min(1, cur / max),
          breakT: cur === 0 && st.breakTick >= 0 ? Math.min(1, st.breakTick / 120) : -1,
          reformT: cur > 0 && st.reformTick >= 0 ? Math.min(1, st.reformTick / 30) : -1,
          time: performance.now() / 1000,
        });
      }
    }
    void world;
  }

  /** Arm_Bone.png 懒加载（骷髅王臂骨；vanilla 独立贴图，非 NPC 表） */
  private armBoneImg: ImageBitmap | HTMLImageElement | null | undefined;
  private boneArm3Img: ImageBitmap | HTMLImageElement | null | undefined;   // 二阶段臂骨（Red Hat 族）
  private pumpkingCloakImg: ImageBitmap | HTMLImageElement | null | undefined;
  private pumpkingArmImg: ImageBitmap | HTMLImageElement | null | undefined;
  /** 259/260 茎蔓强制亮彩的共享染色 scratch（source-atop 下限色） */
  private brightVineScratch: HTMLCanvasElement | null = null;
  /** 月总 30% 白斜坡补差 scratch（applyMoonLordLightFloor，Main.cs:24345 族） */
  private mlFloorScratch: HTMLCanvasElement | null = null;
  /** 自发光弹光照地板账本（raiseSelfLuminousProjLight 抬亮过的格,四元组平铺
   *  idx,r,g,b——compositeLight 后 restoreSelfLuminousProjLight 按此还原原值） */
  private _lumFloorTouched: number[] = [];
  /** 同账本去重面（★2026-09-02 对抗附带项：原 includes 线性扫 = 大弹跨格/多弹同格
   *  O(n²)——Set O(1) 命中等价,首触记账语义不变（先记原值再抬亮） */
  private _lumFloorSeen = new Set<number>();

  // ===================== NPC GlowMask 体系（Main.cs DrawNPC 硬编码发光层） =====================
  // 原版 NPC 无通用 glowMask 字段（与 Projectile/Item 不同）：发光层是 DrawNPC 里
  // 逐类型硬编码的 TextureAssets.GlowMask[N] 二次 Draw。下表为全量对照（1.4.5.6
  // Main.cs:23099/23480/23594/23746-23776/23878-23886/24218-24226/24531-24535）：
  //   mode 'frame'   同帧整图叠加（火星飞碟族/Betsy/暗黑魔法师/永恒水晶/银河织带/探测器/吮脑怪）
  //   mode 'vel4'    以速度向量四向旋转偏移画 4 份灰 A=64 拷贝（四塔 + 火星飞骑 416）
  //   mode 'trail'   419 火月怪：本体罩 + vel4/UnitX4 + ai2<=-9 时 oldPos 0..6 拖尾
  //                  （:24610-24645，Enemy.historyDepth/histXAt 历史缓冲）
  // 第二批已接（原"未接登记"销核）：Glow_100/101+Extra_20（399 探测器 :24564-24575）、
  // Glow_156（416 火龙怪骑士 :24531-24535 底心 +4px 锚 + vel4×0.5）、Glow_154（419 :25677-25696
  // + 拖尾）、Glow_146（421 吮脑怪 :25618-25621 A=128-α/2）。
  // Projectile glowMask（:34327-34378）与 Item glowMask（:38072-38213）不在本批。
  //
  // ---- 第三批（通用化，2026-08-13）：DrawNPCDirect 尾部 "switch(type) → GlowMask[N]
  // 同帧整图叠加" 家族全量入库（Main.cs:25597-25787 月族/星族 + :25044-25545 散件）。
  // ★命名陷阱：Glow_{id}.png 是 GlowMaskID 空间（TextureAssets.GlowMask[N]，
  // AssetInitializer.cs:650-653，共 379 张），与 NPC id 无恒等关系（392→Glow_48、
  // 493→Glow_132）——禁止按 vanillaId 猜文件名，一切以 Main.cs 绘制点反查为准。
  //   mode 'frame4'  中心整图 + 四向偏移 4 份（月族 415/417/418/518/315/346 与 416）
  //   a 字段         中心层 alpha 表达式：'255a'=(255-α)/255、'128a2'=(128-α/2)/255、
  //                  'opacity'=NPC.Opacity、数字=常数（缺省走上方旧 id 链）
  // ---- 第四批（2026-08-13）：轨道族 + 运行时态特殊分支 ----
  //   mode 'orbit'   环绕轨道族 541/568/569/661（Main.cs:26086-26128）：碰撞盒中心 1 份
  //                  + 极角 i/count×2π 环绕的 Glow 拷贝（参数在 NPC_GLOW_ORBIT）
  //   dy             世界 px Y 锚微调（653 地狱蝴蝶 +3 vs 族内 +4 → -1，:25198/:25194）
  //   fadeA          Color.A 背景衰减（XNA AlphaBlend=src One：out = texel·RGB +
  //                  D·(1-texelA·A/255)）——非零时 lighter 前先 destination-out 削底
  //   full           437 教徒石板第二层整图罩（Glow_108 null 源矩形=全图，:25488）
  //   sparkle        425 星璇枪手枪口星芒（DrawPrettyStarSparkle :25631-25633/:34734-34750）
  //   spinner        520 火星行者旋转指示灯（Extra_56+Glow_165，:25425-25443）
  private static readonly NPC_GLOW: Record<number, {
    tex: string; mode: 'frame' | 'frame4' | 'vel4' | 'trail' | 'orbit';
    /** vel4 速度偏移倍率（四塔 4；416 骑手 :24538 为 0.5 + 光照项） */
    velMult?: number;
    /** frame4 固定四向偏移（UnitX.RotatedBy(k*π/2)×n，:25736/:25746）替代速度偏移 */
    fixed4?: number;
    /** frame4 绘制原点 X 平移（518 halfSize+(-10,0) :25722 → 图像右移 10px） */
    dx?: number;
    /** 世界 px Y 锚微调（orbit 族 568/569 的 num47=-3 在 NPC_GLOW_ORBIT.dy） */
    dy?: number;
    /** 状态门（139 探针辉仅自由态 ai[3]==0，:24592/:25064 双门同源） */
    cond?: (e: import('../entities/Enemy').Enemy) => boolean;
    /** 中心层 alpha 表达式（见上；缺省 = 旧 id 链） */
    a?: number | '255a' | '128a2' | 'opacity';
    /** Color.A 背景衰减常数（运行时态 387/414 在 drawNpcGlow 内计算覆盖） */
    fadeA?: number;
    /** 399 探测器状态灯（:24571-24575）：Extra_20(ai0+1 行) 本体 + glow 罩，dy=+24px */
    lamp?: { tex: string; glow: string; dy: number };
    /** 437 第二层整图罩（:25488 null 源矩形） */
    full?: string;
    /** 425 枪口星芒（Extra_98；位置 = 帧中心 +dx 本地 X，:25632 的 27×-spriteDirection
     *  折进已镜像本地系恒为 +27） */
    sparkle?: { tex: string; dx: number };
    /** 520 旋转指示灯（Extra_56 source-over 本体 + Glow_165 lighter 光环） */
    spinner?: { tex: string; glow: string; dy: number };
  }> = {
    392: { tex: 'vanilla/Glow_48.png', mode: 'frame' },   // 火星飞碟主体（:24218 Color(200,200,200,0)）
    395: { tex: 'vanilla/Glow_49.png', mode: 'frame' },   // 飞碟核心（:24222）
    394: { tex: 'vanilla/Glow_50.png', mode: 'frame' },   // 飞碟炮塔（:24226）
    551: { tex: 'vanilla/Glow_226.png', mode: 'frame' },  // Betsy（:23099 Lerp(color,White,0.6) A=66）
    564: { tex: 'vanilla/Glow_225.png', mode: 'frame' },  // 暗黑魔法师 T1（:23480 white×Opacity A/2）
    565: { tex: 'vanilla/Glow_225.png', mode: 'frame' },  // 暗黑魔法师 T2
    548: { tex: 'vanilla/Glow_239.png', mode: 'frame' },  // 永恒水晶（:23594 呼吸脉冲底层）
    402: { tex: 'vanilla/Glow_135.png', mode: 'frame' },  // 银河织带头（:23886 白 A=255-num291）
    422: { tex: 'vanilla/Glow_149.png', mode: 'vel4' },   // 太阳塔（:23766）
    493: { tex: 'vanilla/Glow_132.png', mode: 'vel4' },   // 星尘塔（:23746）
    507: { tex: 'vanilla/Glow_143.png', mode: 'vel4' },   // 星云塔（:23756）
    517: { tex: 'vanilla/Glow_162.png', mode: 'vel4' },   // 星璇塔（:23776，+UnitX*2 偏移）
    // ---- 第二批（底锚/拖尾族）----
    399: { tex: 'vanilla/Glow_100.png', mode: 'frame',   // 火星探测器：本体罩 A=127-α/2（:24564）
      lamp: { tex: 'vanilla/Extra_20.png', glow: 'vanilla/Glow_101.png', dy: 24 } },
    416: { tex: 'vanilla/Glow_156.png', mode: 'frame4', velMult: 0.5, a: '255a' },  // 火龙怪骑士（:24531 中心 + :24533-24537 vel4×0.5）
    419: { tex: 'vanilla/Glow_154.png', mode: 'trail' }, // 火月怪（:25677-25696 + :24610-24645 拖尾）
    421: { tex: 'vanilla/Glow_146.png', mode: 'frame' }, // 吮脑怪：底锚 A=128-α/2（:25618-25621）
    // ---- 第三批 A：DrawNPC 尾段散件（单帧整图叠加，Main.cs:25044-25545）----
    24: { tex: 'vanilla/Glow_360.png', mode: 'frame', a: 'opacity' },    // 火焰小鬼（:25044-25047 GetAlpha(White)）
    383: { tex: 'vanilla/Glow_11.png', mode: 'frame', a: 1 },            // 火星军官（:25258-25260）
    386: { tex: 'vanilla/Glow_31.png', mode: 'frame', a: 1 },            // 火星工程师（:25445-25448）
    387: { tex: 'vanilla/Glow_32.png', mode: 'frame' },                  // 特斯拉炮塔（:25451-25459；亮度/A 随 ai0 充能链见 npcGlowTeslaFade）
    388: { tex: 'vanilla/Glow_33.png', mode: 'frame', a: 1 },            // 火星无人机（:25460-25463）
    389: { tex: 'vanilla/Glow_34.png', mode: 'frame', a: 1 },            // 电圈僵尸（:25464-25467）
    437: { tex: 'vanilla/Glow_109.png', mode: 'frame', a: 1, fadeA: 200 / 255,
      full: 'vanilla/Glow_108.png' },                                    // 教徒石板（:25484-25488；A=200 显著→fadeA+整图罩）
    472: { tex: 'vanilla/Glow_110.png', mode: 'frame', a: '255a' },      // 暗焰幻灵（:25542-25545）
    520: { tex: 'vanilla/Glow_164.png', mode: 'frame', a: 1,
      spinner: { tex: 'vanilla/Extra_56.png', glow: 'vanilla/Glow_165.png', dy: 20 } }, // 火星行者（:25422-25443 旋转指示灯）
    653: { tex: 'vanilla/Glow_288.png', mode: 'frame', a: 1, dy: -1 },   // 地狱蝴蝶（:25195-25198 锚 +3 vs 族内 +4 → dy=-1）
    654: { tex: 'vanilla/Glow_290.png', mode: 'frame', a: 1 },           // 熔岩萤火虫（:25191-25194）
    160: { tex: 'vanilla/Glow_166.png', mode: 'frame', a: '128a2' },     // 松露人（:25766-25778；微光变体 Glow_352 链见 npcGlowVariantTex）
    209: { tex: 'vanilla/Glow_167.png', mode: 'frame', a: '128a2' },     // 电子人（:25780-25784；变体 Glow_350/351 链见 npcGlowVariantTex）
    // 城镇宝石小动物 639-645 → Glow_286、646-652 → Glow_287（:25048-25055 GetAlpha(White)）
    639: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    640: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    641: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    642: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    643: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    644: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    645: { tex: 'vanilla/Glow_286.png', mode: 'frame', a: 'opacity' },
    646: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    647: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    648: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    649: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    650: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    651: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    652: { tex: 'vanilla/Glow_287.png', mode: 'frame', a: 'opacity' },
    // ---- 第三批 B：月柱事件族（Main.cs:25597-25637 的 case 逐条，底锚同帧整图）----
    411: { tex: 'vanilla/Glow_136.png', mode: 'frame', a: '128a2' },     // 观星者（:25597-25598）
    409: { tex: 'vanilla/Glow_138.png', mode: 'frame', a: '255a' },      // 闪耀喷射者（:25600-25601）
    410: { tex: 'vanilla/Glow_137.png', mode: 'frame', a: '255a' },      // 银河织带尾（:25603-25604）
    407: { tex: 'vanilla/Glow_139.png', mode: 'frame', a: '255a' },      // 流星入侵者（:25606-25607）
    405: { tex: 'vanilla/Glow_141.png', mode: 'frame', a: '128a2' },     // 星细胞（:25609-25610）
    406: { tex: 'vanilla/Glow_142.png', mode: 'frame', a: '128a2' },     // 小星细胞（:25612-25613）
    424: { tex: 'vanilla/Glow_144.png', mode: 'frame', a: '128a2' },     // 预言者（:25615-25616）
    423: { tex: 'vanilla/Glow_145.png', mode: 'frame', a: '128a2' },     // 进化兽（:25618-25619）
    420: { tex: 'vanilla/Glow_147.png', mode: 'frame', a: '128a2' },     // 星云浮怪（:25624-25625）
    425: { tex: 'vanilla/Glow_150.png', mode: 'frame', a: '128a2',
      sparkle: { tex: 'vanilla/Extra_98.png', dx: 27 } },                // 星璇枪手（:25627-25633；枪口星芒）
    429: { tex: 'vanilla/Glow_151.png', mode: 'frame', a: '128a2' },     // 旋涡怪（:25636-25637）
    412: { tex: 'vanilla/Glow_157.png', mode: 'frame', a: '255a' },      // 爬足虫头（:25645-25664）
    413: { tex: 'vanilla/Glow_158.png', mode: 'frame', a: '255a' },      // 爬足虫身
    414: { tex: 'vanilla/Glow_159.png', mode: 'frame', a: '255a' },      // 爬足虫尾（:25656-25663 localAI[2] 受击红闪见 npcGlowCrawltipedeFlash）
    525: { tex: 'vanilla/Glow_169.png', mode: 'frame', a: 200 / 255 },   // 邪恶食尸鬼（:25754-25755）
    526: { tex: 'vanilla/Glow_170.png', mode: 'frame', a: 200 / 255 },   // 污染食尸鬼（:25757-25758）
    527: { tex: 'vanilla/Glow_171.png', mode: 'frame', a: 200 / 255 },   // 梦游食尸鬼（:25760-25761）
    533: { tex: 'vanilla/Glow_172.png', mode: 'frame', a: 1 },           // 沙漠之魂（:25763-25764 Color(255,255,255,100)）
    426: { tex: 'vanilla/Glow_153.png', mode: 'frame', a: '128a2' },     // 外星蜂后（:26079-26081）
    427: { tex: 'vanilla/Glow_152.png', mode: 'frame', a: '255a' },      // 外星黄蜂（:26076-26078）
    // ---- 第三批 C：中心罩 + 四向偏移族（mode 'frame4'）----
    418: { tex: 'vanilla/Glow_161.png', mode: 'frame4', velMult: 0.25, a: '255a' }, // 陨石火怪（:25639-25649）
    415: { tex: 'vanilla/Glow_155.png', mode: 'frame4', velMult: 0.5, a: '255a' },  // 龙马（:25671-25681）
    417: { tex: 'vanilla/Glow_160.png', mode: 'frame4', velMult: 0.25, a: '255a' }, // 滚球蜥（:25700-25710）
    518: { tex: 'vanilla/Glow_163.png', mode: 'frame4', velMult: 0.5, dx: 10, a: '255a' }, // 太空入侵者飞行种（:25720-25731）
    344: { tex: 'vanilla/Glow_253.png', mode: 'frame', a: 0.39 },       // 常绿尖叫树（:25731-25733 Color(200,200,200,100)*0.5）
    346: { tex: 'vanilla/Glow_254.png', mode: 'frame4', fixed4: 4, a: 200 / 255 },  // 坐骑雪橇-NK1（:25734-25743）
    315: { tex: 'vanilla/Glow_255.png', mode: 'frame4', fixed4: 2, a: 1 },          // 无头骑士（:25744-25753）
    // ---- 第四批：环绕轨道族（Main.cs:26086-26128，参数表 NPC_GLOW_ORBIT）----
    541: { tex: 'vanilla/Glow_216.png', mode: 'orbit' },   // 沙元素（:26086-26096 Glow_216 ×4 Gold 轨道）
    568: { tex: 'vanilla/Glow_224.png', mode: 'orbit' },   // 枯萎兽 T2（:26116-26128 Glow_224 ×4 HotPink，出生门）
    569: { tex: 'vanilla/Glow_224.png', mode: 'orbit' },   // 枯萎兽 T3
    661: { tex: 'vanilla/NPC_661.png', mode: 'orbit' },    // 帝皇蝶（:26099-26113 自贴图 ×6 HSL 彩虹轨道——
    //                                                     原版画 value80=TextureAssets.Npc[661] 即本表 tex 同文件）
    // ---- 第五批：Mech 族发光叠层（Main.cs:25056-25070 机械 Boss 眼/激光/探针/毁灭者
    // 灯光叠层。原版 Color(255,255,255,0) 在 XNA (One,InvSrcAlpha) 预乘混合下 =
    // 全强度加色（color.A 不参与源贡献）→ a:1 + lighter；Dest 族 Color×(1-α/255)
    // 标量乘全通道（Blend One 只取 RGB）→ 'opacity'；131 BoneLaser Color(200,200,200,0)
    // → 200/255。134-136 原版另有 npcColor!=Black 光照门（全黑不叠）——本仓无逐实体
    // 光染色管线，按全亮叠（差异登记，与全 Glow 表同口径）----
    125: { tex: 'vanilla/Eye_Laser.png', mode: 'frame', a: 1 },          // 斯帕兹玛眼激光辉（:25060-25063）
    139: { tex: 'vanilla/Probe.png', mode: 'frame', a: 1, cond: (e) => e.ai3 === 0 },  // 探针辉（:25064-25067，仅自由态 ai[3]==0；Mechdusa 挂链态无）
    131: { tex: 'vanilla/Bone_Laser.png', mode: 'frame', a: 200 / 255 }, // Prime 激光臂炮口辉（:25119-25127 Color(200,200,200,0)）
    134: { tex: 'vanilla/Dest1.png', mode: 'frame', a: 'opacity' },      // 毁灭者头灯光（Dest[type-134] :25056-25059）
    135: { tex: 'vanilla/Dest2.png', mode: 'frame', a: 'opacity' },      // 毁灭者身段灯
    136: { tex: 'vanilla/Dest3.png', mode: 'frame', a: 'opacity' },      // 毁灭者尾灯
  };

  /** NPC_GLOW 表全量条目（[npcId, 贴图路径]）——供 tests/visual-extras.test.ts
   *  抽查素材存在性（表内每个 tex 都必须真实落在 public/sprites/vanilla/）。 */
  static npcGlowEntries(): Array<[number, string]> {
    return Object.entries(Renderer.NPC_GLOW).map(([id, g]) => [Number(id), g.tex]);
  }

  /** 表配置直读（tests 断言 full/sparkle/spinner/dy/fadeA 等特殊分支触发位） */
  static npcGlowConfig(id: number) {
    return Renderer.NPC_GLOW[id] ?? null;
  }

  // ===================== 轨道族参数 + 特殊分支纯函数（第四批） =====================
  // 全部无 DOM/无 this 依赖，tests/visual-extras.test.ts 直接断言。
  // 标杆：Main.cs:25805-26204（ghost 族绘制块）+ :26086-26128（轨道 Glow 段）。
  private static readonly NPC_GLOW_ORBIT: Record<number, {
    /** num299 环绕份数（:25892/:25902/:25911/:25918） */
    count: number;
    /** num300 呼吸周期 s（GlobalTimeWrappedHourly % period） */
    period: number;
    /** num300 包络：'half'=cos/2+0.5（0..1）；'sixth'=cos/6+0.75（0.583..0.917） */
    env: 'half' | 'sixth';
    /** 半径 num300 系数（541/568=4；661=2+ai[2]） */
    rBase: number;
    /** 半径常数项（恒 2，:26091/:26108/:26123 的 +2f） */
    rAdd: number;
    /** 661：rBase 项 = 2+ai[2]（:26106 num320 = 2f + ai[2]） */
    ai2Radius?: boolean;
    /** 661：num300 下限 = GetLerpValue(0,60,ai[2])（:25921） */
    ai2Gate?: boolean;
    /** 661：相位 num302 = Lerp(0,3,GetLerpValue(0,60,ai[2]))（:26100） */
    phaseAi2?: boolean;
    /** color43 染色（:25895 HotPink / :25914 Gold / :26105 HSL 彩虹） */
    tint: 'gold' | 'hotpink' | 'hsl';
    /** 拷贝亮度 ×(1-num300×k)（541/568=1；661=0.5 :26106） */
    copyFade: number;
    /** 中心层亮度系数（541/568=1 原色；661=0.1 :26113 White×0.1） */
    center: number;
    /** 568/569：localAI[3]≥60 出生门（:26116） */
    spawnGate?: boolean;
    /** num47 世界 px Y 偏移（568/569=-3 :25898） */
    dy?: number;
  }> = {
    // 541 沙元素（:25910-25914 num299=4/period 2.4/Gold；半径 4·num300+2 :26091）
    541: { count: 4, period: 2.4, env: 'half', rBase: 4, rAdd: 2, tint: 'gold', copyFade: 1, center: 1 },
    // 568/569 枯萎兽（:25892-25898 num299=4/period 1.5/HotPink(A=127)/num47=-3；出生门 :26116）
    568: { count: 4, period: 1.5, env: 'sixth', rBase: 4, rAdd: 2, tint: 'hotpink', copyFade: 1, center: 1, spawnGate: true, dy: -3 },
    569: { count: 4, period: 1.5, env: 'sixth', rBase: 4, rAdd: 2, tint: 'hotpink', copyFade: 1, center: 1, spawnGate: true, dy: -3 },
    // 661 帝皇蝶（:25917-25922 num299=6/period 2.4/ai2 门；相位/半径随 ai2 :26100/:26106）
    661: { count: 6, period: 2.4, env: 'half', rBase: 2, rAdd: 2, ai2Radius: true, ai2Gate: true, phaseAi2: true, tint: 'hsl', copyFade: 0.5, center: 0.1 },
  };

  /** Utils.GetLerpValue 1:1（Utils.cs:283-308，含 from>to 反向钳位） */
  private static glowLerpValue(from: number, to: number, t: number): number {
    if (from < to) { if (t < from) return 0; if (t > to) return 1; }
    else { if (t < to) return 1; if (t > from) return 0; }
    return (t - from) / (to - from);
  }


  /** 568/569 出生态紫雾参数（Main.cs:25899-25907 对轨道族的出生覆写）：
   *  localAI[3]<60 期间 num299=3 / num301=8 / num300=1−(lai3/60)²（拷贝随出生收敛到
   *  盒心）。拷贝色链（:26061-26076）：npcColor→Lerp(紫,0.5)→GetAlpha→Lerp(紫,1)
   *  ＝紫(127,0,255,0) 全覆盖（A 恒 0 → 加性）再 ×(1−num300)=num315²——故拷贝
   *  强度 = num315²，与本体渐显同步。返回 null = 出生完成（非出生态，不画雾）。 */
  static npcWitherBirthParams(lai3: number): { count: number; radius: number; fade: number } | null {
    if (lai3 >= 60) return null;
    const num315 = lai3 / 60;
    const num300 = 1 - num315 * num315;
    return { count: 3, radius: 8 * num300, fade: num315 * num315 };
  }

  /** 568/569 死亡紫魂环参数（Main.cs:26130-26155：localAI[0]>0 期间 Extra_89 ×16 份
   *  @半径 400×num323）。alpha15 = (cos(lai0·2π/60)·0.5+0.5)×32 截字节（60t 脉动）；
   *  color47 = Color(180,90,255,alpha15)×0.75 → RGB(135,67,191)、A=alpha15×0.75；
   *  lai0<60 段再 ×GetLerpValue(0,60) 且 num323=Lerp(1,0.5,1−lerp²)（环由 0.5 膨到 1）。
   *  num324 = lai0×0.0041887905（=π/750）慢旋；每份极角 = num324+2π·i/16，旋转再 +π。
   *  逐份画在 Extra_89 中心锚（origin=size/2），SpriteEffects.None。
   *  XNA AlphaBlend（SourceBlend.One）语义：src 项 = texel×RGB×fade、dst 项按 A×fade
   *  衰减——fade 同时进两侧 → 调用方须把它乘进染色（tint 量化防 tintCache 爆）与 alpha。 */
  static npcSoulRingParams(lai0: number): {
    count: number; radius: number; angle0: number; scale: number; alpha: number; fade: number;
  } | null {
    if (lai0 <= 0) return null;
    const alpha15 = Math.trunc((Math.cos(lai0 * (Math.PI * 2) / 60) * 0.5 + 0.5) * 32);
    let fade = 1;
    let scale = 1;
    if (lai0 < 60) {
      fade = Renderer.glowLerpValue(0, 60, lai0);
      scale = 1 - 0.5 * (1 - fade * fade);   // MathHelper.Lerp(1, 0.5, 1−lerp²)
    }
    return {
      count: 16, radius: 400 * scale, angle0: lai0 * 0.0041887905, scale,
      alpha: (alpha15 * 0.75 * fade) / 255, fade,
    };
  }

  /** 轨道族逐帧参数（Main.cs:25826-25829 num299/num300/num302 初值 + 各 case 覆写 +
   *  :26091/:26108/:26123 半径公式）。tSec=GlobalTimeWrappedHourly；lai3 供 568/569
   *  出生门（:26116 localAI[3]>=60，未过返回 null）。ai2 仅 661 消费，按原版
   *  Clamp(0,50)（NPC.cs:45253）钳界。
   *  568/569 的 lai3 由 witherBeastLocal 出膛取（AI_107 出膛渐显 0→60）；出生态
   *  本体绘制层的 3 份紫雾见 npcWitherBirthParams/drawWitherBirth。 */
  static npcGlowOrbitParams(
    id: number, tSec: number, ai2: number, lai3 = 60,
  ): { count: number; num300: number; radius: number; phase: number } | null {
    const c = Renderer.NPC_GLOW_ORBIT[id];
    if (!c) return null;
    if (c.spawnGate && lai3 < 60) return null;
    const x = tSec % c.period / c.period * Math.PI * 2;
    let num300 = c.env === 'half' ? Math.cos(x) / 2 + 0.5 : Math.cos(x) / 6 + 0.75;
    const a2 = Math.max(0, Math.min(50, ai2));
    let phase = 0;
    if (c.ai2Gate) num300 = Math.max(num300, Renderer.glowLerpValue(0, 60, a2));
    if (c.phaseAi2) phase = 3 * Renderer.glowLerpValue(0, 60, a2);
    const base = c.ai2Radius ? c.rBase + a2 : c.rBase;
    return { count: c.count, num300, radius: base * num300 + c.rAdd, phase };
  }

  /** 轨道拷贝染色（color43 MultiplyRGBA，RGB 0..255）：
   *  - gold：Gold(255,215,0)（:26087/:25914）
   *  - hotpink：HotPink(255,105,180)，源色 A 通道为 0 → 乘后 A 恒 0（:25895-25896）
   *  - hsl：661 逐份 hslToRgb((GT+i/count)%1, 1, 0.5)（:26105，Main.cs:47266-47290），
   *    hue 量化 1/32 防逐帧打爆 tintCache */
  static npcGlowOrbitTint(id: number, i: number, tSec: number): [number, number, number] {
    const c = Renderer.NPC_GLOW_ORBIT[id];
    if (c?.tint === 'gold') return [255, 215, 0];
    if (c?.tint === 'hotpink') return [255, 105, 180];
    if (c?.tint === 'hsl' && c) {
      const hq = Math.round(((tSec + i / c.count) % 1) * 32) / 32;
      const [r, g, b] = Renderer.glowHslToRgb(hq % 1, 1, 0.5);
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    return [255, 255, 255];
  }

  /** Main.hslToRgb 1:1（Main.cs:47266-47290）→ RGB 0..1（s=0 灰阶捷径同源码） */
  private static glowHslToRgb(hue: number, sat: number, lum: number): [number, number, number] {
    if (sat === 0) return [lum, lum, lum];
    const v2 = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
    const v1 = 2 * lum - v2;
    const h2r = (h: number): number => {
      if (h < 0) h += 1;
      if (h > 1) h -= 1;
      if (6 * h < 1) return v1 + (v2 - v1) * 6 * h;
      if (2 * h < 1) return v2;
      if (3 * h < 1) return v1 + (v2 - v1) * (2 / 3 - h) * 6;
      return v1;
    };
    return [h2r(hue + 1 / 3), h2r(hue), h2r(hue - 1 / 3)];
  }

  /** 414 爬足虫尾受击红闪（Main.cs:25656-25663）：localAI[2]≠0 时 color38 覆写为
   *  (255-num219, num219, num219, 255-num219)；num219 = trunc(lai2)，负段 = 128+trunc。
   *  返回 null = 无闪（走基础 255a 白罩）。A = 255-num219 ∈ 127..255 → 显著，调用方
   *  需做 fadeA 背景衰减。localAI[2] 的递减驱动在 AI_006（NPC.cs:52026-52047：
   *  受击置 128，每 tick −16，过零翻 −128 后 +16 回升）——本仓 412-414 无 AI 承载。 */
  static npcGlowCrawltipedeFlash(lai2: number): { rgb: [number, number, number]; a: number } | null {
    if (lai2 === 0) return null;
    let n = Math.trunc(lai2);
    if (lai2 < 0) n = 128 + Math.trunc(lai2);
    const inv = 255 - n;
    return { rgb: [inv, n, n], a: inv };
  }

  /** 387 特斯拉炮塔充能白化（Main.cs:25451-25458）：color32 = White×0.75（RGB=A=191）；
   *  ai0>0 时 amount7=(ai0+1)/60 → RGB Lerp(0.75,1)、A Lerp(191,0)，再整体 ×Opacity。
   *  bright=加色亮度（RGB/255），fadeA=背景衰减（A/255，静止 191/255 显著）。
   *  本仓 teslaTurretAI 的 ai0 即充能计数（0→60，受击 -30）→ 分支实时触发。 */
  static npcGlowTeslaFade(ai0: number, alphaRaw: number): { bright: number; fadeA: number } {
    const opacity = (255 - Math.min(255, Math.max(alphaRaw, 0))) / 255;
    const amount7 = ai0 > 0 ? (ai0 + 1) / 60 : 0;
    const rgb = (191 + (255 - 191) * amount7) / 255;
    const a = 191 * (1 - amount7) / 255 * opacity;
    return { bright: rgb * opacity, fadeA: Math.max(0, Math.min(1, a)) };
  }

  /** 425 枪口星芒包络（Main.cs:25631-25633 + DrawPrettyStarSparkle :34741-34745）：
   *  opacity = Remap(ai3, 0, 15, 0, 1)（瞄准蓄力渐亮）；
   *  num = GetLerpValue(0,30,ai3) × GetLerpValue(36,30,ai3)（ai3≤0 冷却期恒 0，
   *  30 满蓄、30→40 放射后渐灭——与 NPC.cs:58986-59006 的 ai3 状态机同环）。 */
  static npcGlowSparkleEnvelope(ai3: number): { opacity: number; num: number } {
    const o = Math.max(0, Math.min(1, ai3 / 15));
    const num = Renderer.glowLerpValue(0, 30, ai3) * Renderer.glowLerpValue(36, 30, ai3);
    return { opacity: o, num: Math.max(0, Math.min(1, num)) };
  }

  /** 160/209 城镇 NPC 微光/派对变体贴图档（Main.cs:25769/:25783）：
   *  - 160 松露人：townNpcVariationIndex==1（微光态）→ Glow_352，否则 Glow_166
   *  - 209 电子人：常态 Glow_167；微光态按 altTexture 选 Glow_350（≠1）/Glow_351（==1）
   *  返回 null = 该 id 无变体链。已接通：drawTownNPC 本体后按本档 'lighter' 叠画
   *  （Color(128−α/2,×3,0)，α=城镇 NPC 静态 0）；160 的 shimmerTransparency
   *  RGB 衰减（:25771-25776）经 shimmerGlowAlpha 落 alpha（已接）。 */
  static npcGlowVariantTex(id: number, shimmered: boolean, altTexture: number): string | null {
    if (id === 160) return shimmered ? 'vanilla/Glow_352.png' : 'vanilla/Glow_166.png';
    if (id === 209) return shimmered ? (altTexture !== 1 ? 'vanilla/Glow_350.png' : 'vanilla/Glow_351.png') : 'vanilla/Glow_167.png';
    return null;
  }

  /** 546 怒滚草亮核叠画（Main.cs:26156-26158）：Extra_76 与 NPC_546 同版式，取本体
   *  同帧矩形叠画，Color(255,255,255,200)，rotation=Clamp(vx×0.1,±π/8)——瞬时式，
   *  与本体累积滚转 visAngle（AI_026 cs:63365-63369）不同源：亮核只随速度微倾，
   *  不随球整周滚，故不能借本体变换直绘。共轭换角：外层变换 =
   *  T·[T(0,pc)·R(visAngle)·T(0,−pc)]·S·F（pc=4−sh·scale/2 帧中心枢轴修正、S=scale、
   *  F=facing<0 反翻镜像），在已变换系内依序 S⁻¹·F⁻¹·T(pc)·R(Δθ)·T(−pc)·S·F
   *  （Δθ=亮核角−visAngle）即把 R(visAngle) 换成 R(亮核角)，位置/帧矩形/镜像全保持。
   *  XNA Color.A=200 预乘语义（AlphaBlend One/InvSrcAlpha）：先 destination-out 削底
   *  200/255 再 lighter 加 RGB 全额——与 drawNpcGlow 两步式同构 */
  private draw546GlowCore(
    e: Enemy,
    r: { sx: number; sy: number; sw: number; sh: number },
    bx: number, by: number, scale: number, mirrored: boolean,
  ): void {
    const tex = this.atlas?.vmisc('vanilla/Extra_76.png');   // 懒加载（首帧 null 次帧生效）
    if (!tex) return;
    const ctx = this.ctx;
    const theta = Math.max(-Math.PI / 8, Math.min(Math.PI / 8, e.vx * 0.1));   // :26158
    ctx.save();
    ctx.scale(1 / scale, 1 / scale);
    ctx.scale(mirrored ? -1 : 1, 1);
    // 中心锚(2026-08-24)后原点=帧中心,曾按底锚写的枢轴平移 pc=4−sh·scale/2 已双重
    // 补偿（同主 546 旋转支的删除）,直转
    ctx.rotate(theta - e.visAngle);
    ctx.scale(scale, scale);
    ctx.scale(mirrored ? -1 : 1, 1);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 200 / 255;
    ctx.drawImage(tex.img, r.sx, r.sy, r.sw, r.sh, bx, by, r.sw, r.sh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(tex.img, r.sx, r.sy, r.sw, r.sh, bx, by, r.sw, r.sh);
    ctx.restore();
  }

  /** GlowMask 叠画：与基础精灵同一变换（调用点在 drawEnemy 的 save 块内）。
   *  bx/by = 基础精灵在本变换内的目标左上（与本体严格同锚——地面型底锚/飞行型
   *  中心锚由调用方传入，各层不再自行假设锚点）。
   *  additive（XNA 默认 AlphaBlend + 贴图自带发光色的语义，用 lighter 还原
   *  "叠加提亮"观感） */
  private drawNpcGlow(
    e: Enemy,
    r: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    bx: number, by: number,
  ) {
    if (!this.atlas) return;
    const g = Renderer.NPC_GLOW[e.vanillaId ?? -1];
    if (!g) return;
    if (g.cond && !g.cond(e)) return;
    const img = this.atlas.ensureVImage(g.tex);   // 懒加载（首帧 null，次帧生效）
    if (!img) return;
    const ctx = this.ctx;
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const alphaRaw = Math.min(255, Math.max(e.spawnAlpha, 0));
    const opacity = 1 - alphaRaw / 255; // NPC.Opacity
    // Glow 表与 NPC 表同布局（同宽 × 帧数行）；帧行 = 当前帧（原版一律 rCurrentNPC.frame）
    const gh = Math.max(1, Math.floor(img.height / frames));
    const row = Math.min(frames - 1, Math.max(0, Math.floor(r.sy / Math.max(1, r.sh))));
    const sy = Math.min(img.height - gh, row * gh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 第三批通用 alpha 表达式（g.a）：数字=常数 / '255a'=(255-α)/255 / '128a2'=(128-α/2)/255
    // / 'opacity'=GetAlpha(White)。缺省（旧两批）走下方 id 链。
    const aExpr = g.a;
    const resolveAlpha = (): number => {
      if (aExpr === undefined) return -1; // 哨兵：走旧链
      if (typeof aExpr === 'number') return aExpr;
      if (aExpr === '255a') return (255 - alphaRaw) / 255;
      if (aExpr === '128a2') return (128 - alphaRaw / 2) / 255;
      return opacity;
    };
    if (g.mode === 'frame4') {
      // frame4：中心整图（a 表达式）+ 四向偏移 4 份灰 A=64
      //（Main.cs:25639-25649/25671-25681/25700-25710/25720-25731；速度偏移 num =
      // k + 光照项（恒 k），或 UnitX.RotatedBy 固定 px :25736/:25746）
      const offX = (g.dx ?? 0) / scale;   // 518 halfSize+(-10,0) → 图像右移 10 世界 px
      ctx.globalAlpha = Math.max(0, Math.min(1, resolveAlpha()));
      ctx.drawImage(img, 0, sy, img.width, gh, bx + offX, by, r.sw, r.sh);
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      // 416 骑手速度恒 0（AI_075 吸附零速）——原版取坐骑 415 的速度
      // （Main.cs:24516 spinningpoint3 = npc[415].velocity；同 vel4 分支）
      const svx = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vx : e.vx;
      const svy = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vy : e.vy;
      const fixed = g.fixed4;
      const mult = g.velMult ?? 0.5;
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2;
        const dx = (fixed !== undefined
          ? Math.cos(ang) * fixed                       // UnitX.RotatedBy(k*π/2)×n
          : (svx * Math.cos(ang) - svy * Math.sin(ang)) * mult) / scale;
        const dy = (fixed !== undefined
          ? Math.sin(ang) * fixed
          : (svx * Math.sin(ang) + svy * Math.cos(ang)) * mult) / scale;
        ctx.drawImage(img, 0, sy, img.width, gh, bx + offX + dx, by + dy, r.sw, r.sh);
      }
    } else if (g.mode === 'orbit') {
      // 环绕轨道族（Main.cs:26086-26128）：碰撞盒中心 1 份 + 极角 i/count×2π+phase
      // 环绕 count 份拷贝。锚点 = Center（:26091/:26107/:26123）——与 frame 族
      // Bottom+4 不同源，故不沿用 bx/by，按 noGravity 自行换算盒心。
      const prm = Renderer.npcGlowOrbitParams(
        e.vanillaId ?? -1, performance.now() / 1000, e.ai2,
        (e.vanillaId === 568 || e.vanillaId === 569) ? witherBeastLocal(e)[1] : e.lai3,
      );
      if (prm) {
        const cfg = Renderer.NPC_GLOW_ORBIT[e.vanillaId ?? -1]!;
        const dyo = (cfg.dy ?? 0) / scale;                     // num47（568/569=-3 :25898）
        // 中心锚(2026-08-24)后本地原点恒=盒心,曾按底锚写的 glowFlying?0:-e.h/2 换算
        // 已双重偏移（568/569 noGravity=None 走 -e.h/2 支=轨道整体高半盒）,删
        const ocy = dyo;
        const ox = -r.sw / 2, oy = ocy - r.sh / 2;             // 帧左上（盒心 − 半帧）
        const base = (127 - alphaRaw) / 255;                   // Color(127-α,…,0) 基底
        const t = performance.now() / 1000;
        // 中心层：541/568 原色（无 GetAlpha/无 num300 衰减）；661 White×0.1（:26113）
        if (e.vanillaId === 661) {
          ctx.globalAlpha = Math.max(0, Math.min(1, 0.1));
          ctx.drawImage(img, 0, sy, img.width, gh, ox, oy, r.sw, r.sh);
        } else {
          const ct = Renderer.npcGlowOrbitTint(e.vanillaId ?? -1, 0, t);
          const cc = this.tintedSprite(`glow|${g.tex}|r${row}`,
            { img, sx: 0, sy, sw: img.width, sh: gh }, [ct[0], ct[1], ct[2]]);
          ctx.globalAlpha = Math.max(0, Math.min(1, base));
          if (cc) ctx.drawImage(cc.c, cc.x, cc.y, cc.w, cc.h, ox, oy, r.sw, r.sh);
        }
        for (let i = 0; i < prm.count; i++) {
          const ang = i / prm.count * Math.PI * 2 + prm.phase;
          const dx = Math.cos(ang) * prm.radius / scale;
          const dy = Math.sin(ang) * prm.radius / scale;
          const fade = 1 - prm.num300 * cfg.copyFade;          // ×(1-num300·k)
          // 拷贝亮度 = GetAlpha(×Opacity) × fade（:26092-26093/:26105-26106）；
          // 中心层系数 cfg.center 只作用于 661 的 0.1 白罩（上方分支），不进拷贝
          const bright = base * opacity * fade;
          const tt = Renderer.npcGlowOrbitTint(e.vanillaId ?? -1, i, t);
          const tc = this.tintedSprite(`glow|${g.tex}|r${row}`,
            { img, sx: 0, sy, sw: img.width, sh: gh }, [tt[0], tt[1], tt[2]]);
          ctx.globalAlpha = Math.max(0, Math.min(1, bright));
          if (tc) ctx.drawImage(tc.c, tc.x, tc.y, tc.w, tc.h, ox + dx, oy + dy, r.sw, r.sh);
        }
      }
    } else if (g.mode === 'frame') {
      let alpha = 0.8;
      let flashPulse = 1;
      if (e.vanillaId === 551) { alpha = (66 / 255) * 1.3; }              // :23099 A=66 ×(0.7+0.3*lerp)
      else if (e.vanillaId === 564 || e.vanillaId === 565) { alpha = 0.5 * opacity; } // :23484 white.A/2×Opacity
      else if (e.vanillaId === 548) {
        // :23590-23596 num63/65 三秒呼吸三角波 ×0.6 紫底（(140,50,255)）
        const t3 = (performance.now() / 1000) % 3 / 3;
        flashPulse = t3 > 0.5 ? 1 - t3 : t3;
        alpha = 0.6 * Math.max(0, flashPulse);
      } else if (e.vanillaId === 399) { alpha = (127 - alphaRaw / 2) / 255; }  // :24568 Color(127-α/2,…)
      else if (e.vanillaId === 421) { alpha = (128 - alphaRaw / 2) / 255; }    // :25622 Color(128-α/2,…)
      else alpha = 0.78;                                                  // Color(200,200,200,0)/白色系通用
      const ga = resolveAlpha();
      if (ga >= 0) alpha = ga;                                            // 第三批表项覆盖旧链
      // 653 地狱蝴蝶 Y 锚 +3（族内其余 +4，:25198/:25194）→ 本仓底锚惯例相对 -1
      const dyo = (g.dy ?? 0) / scale;
      // ---- 第四批运行时态/Color.A 分支 ----
      // Color.A 背景衰减（XNA AlphaBlend=src One：先 destination-out 削底再 lighter
      // 加色，与本体染色 pass :2307-2310 同式）。addA=加色亮度、fadeA=削底强度。
      let addA = alpha;
      let fadeA = g.fadeA ?? 0;
      let tint: [number, number, number] | null = null;
      if (e.vanillaId === 387) {
        // 特斯拉炮塔（:25451-25459）：White×0.75 起，ai0 充能 → RGB→255/A→0
        const f = Renderer.npcGlowTeslaFade(e.ai0, alphaRaw);
        addA = f.bright; fadeA = f.fadeA;
      } else if (e.vanillaId === 414) {
        // 爬足虫尾受击红闪（:25656-25663）：RGB=(255-n,n,n) 且 A=255-n（显著）
        const fl = Renderer.npcGlowCrawltipedeFlash(e.lai2);
        if (fl) { addA = 1; fadeA = fl.a / 255; tint = fl.rgb; }
      }
      // 染色源（TintAtlas 子矩形）——无 tint 时直取 glow 帧行
      let src: CanvasImageSource = img;
      let ssx = 0, ssy = sy, ssw = img.width, ssh = gh;
      if (tint) {
        const tc = this.tintedSprite(`glow|${g.tex}|r${row}`,
          { img, sx: 0, sy, sw: img.width, sh: gh }, [tint[0], tint[1], tint[2]]);
        if (tc) { src = tc.c; ssx = tc.x; ssy = tc.y; ssw = tc.w; ssh = tc.h; }
      }
      if (fadeA > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = Math.max(0, Math.min(1, fadeA));
        ctx.drawImage(src, ssx, ssy, ssw, ssh, bx, by + dyo, r.sw, r.sh);
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, addA));
      ctx.drawImage(src, ssx, ssy, ssw, ssh, bx, by + dyo, r.sw, r.sh);
      // 437 教徒石板第二层整图罩（:25488 null 源矩形 = 全图，同 white5 A=200）
      if (g.full) {
        const fimg = this.atlas.ensureVImage(g.full);
        if (fimg) {
          if (fadeA > 0) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = Math.max(0, Math.min(1, fadeA));
            ctx.drawImage(fimg, 0, 0, fimg.width, fimg.height, bx, by + dyo, r.sw, r.sh);
            ctx.globalCompositeOperation = 'lighter';
          }
          ctx.globalAlpha = Math.max(0, Math.min(1, addA));
          ctx.drawImage(fimg, 0, 0, fimg.width, fimg.height, bx, by + dyo, r.sw, r.sh);
        }
      }
      // 425 星璇枪手枪口星芒（:25631-25633 → DrawPrettyStarSparkle :34734-34750）：
      // Extra_98 四笔十字（绿 shine 对 ×1.0 / 白 draw 对 ×0.6，旋转 0/π/2）。
      // 位置 = 帧中心 +27px 本地 X（:25632 的 27×-spriteDirection 世界向折进镜像系）。
      // 【登记】本仓 AI_003 无 425 ai3 瞄准蓄力（NPC.cs:58986-59006），ai3 撞的是
      // 通用卡墙计数——星芒可能误闪，AI 侧修复后自然归位。
      if (g.sparkle) {
        const env = Renderer.npcGlowSparkleEnvelope(e.ai3);
        const ex = this.atlas.ensureVImage(g.sparkle.tex);
        if (env.num > 0 && env.opacity > 0 && ex) {
          const n = env.num;
          const cx0 = bx + r.sw / 2 + g.sparkle.dx / scale;
          const cy0 = by + dyo + r.sh / 2;
          // 绿对：shineColor=Green×opacity×0.5（tint 乘法）；白对：White×0.5
          const green = this.tintedSprite('sparkle|green',
            { img: ex, sx: 0, sy: 0, sw: ex.width, sh: ex.height }, [0, 128, 0]);
          const pair = (image: CanvasImageSource, rot: number, sx: number, sy2: number, a: number,
            tr?: TintRect) => {
            ctx.save();
            ctx.translate(cx0, cy0);
            ctx.rotate(rot);
            ctx.globalAlpha = Math.max(0, Math.min(1, a));
            if (tr) ctx.drawImage(image, tr.x, tr.y, tr.w, tr.h, -ex.width / 2 * sx, -ex.height / 2 * sy2,
              ex.width * sx, ex.height * sy2);
            else ctx.drawImage(image, -ex.width / 2 * sx, -ex.height / 2 * sy2,
              ex.width * sx, ex.height * sy2);
            ctx.restore();
          };
          // vector =(fatness.X/2, scale.X)×num=(1,3)×n 旋 π/2；vector2=(fatness.Y/2, scale.Y)×n=(1,1.5)×n 旋 0
          if (green) {
            pair(green.c, Math.PI / 2, 1 * n, 3 * n, 0.5 * env.opacity * n, green);
            pair(green.c, 0, 1 * n, 1.5 * n, 0.5 * env.opacity * n, green);
          }
          pair(ex, Math.PI / 2, 0.6 * n, 1.8 * n, 0.5 * n);
          pair(ex, 0, 0.6 * n, 0.9 * n, 0.5 * n);
        }
      }
      // 520 火星行者旋转指示灯（:25425-25443）：Extra_56 画在 Top+(0,20)，
      // rotation=localAI[3]（镜像系折算 -num194-π、origin (4,4)），再叠 Glow_165 白罩。
      // Extra_56 是深色本体件 → source-over（lighter 会不可见）；Glow_165 走 lighter。
      // 【登记】AI_003 未写 lai3 → 旋转恒 0（原版为指示灯自旋角）。
      if (g.spinner) {
        const sp = this.atlas.ensureVImage(g.spinner.tex);
        const spGlow = this.atlas.ensureVImage(g.spinner.glow);
        if (sp && spGlow) {
          // zero6 = Top + (0,20)（:25434，Top=盒左上角而非中心；zero6.X*=−1 对零向量空操作）
          // ——中心锚(2026-08-24)后原点=盒心,Top 局部 y=−h/2（曾按底锚写 −e.h）
          const sx0 = -e.w / 2 / scale;
          const sy0 = -e.h / 2 / scale + g.spinner.dy / scale;
          const rot = -(e.lai3) - Math.PI;               // 镜像系：mirror∘rot(θ+π) = rot(-θ-π)
          ctx.save();
          ctx.translate(sx0, sy0);
          ctx.rotate(rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = opacity;
          ctx.drawImage(sp, -4, -4, sp.width, sp.height);      // origin (4,4)（:25426/:25432）
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(spGlow, -4, -4, spGlow.width, spGlow.height);
          ctx.restore();
        }
      }
      // 399 探测器状态灯（:24571-24575）：Extra_20 按 ai0+1 取行，画在本体下方 +24px，
      // 再叠 Glow_101 同源矩形罩（A=127-α/2）
      if (g.lamp) {
        const lamp = this.atlas.ensureVImage(g.lamp.tex);
        const lampGlow = this.atlas.ensureVImage(g.lamp.glow);
        if (lamp && lampGlow) {
          const rows = 4, lh = lamp.height / rows;
          const lrow = Math.max(0, Math.min(rows - 1, Math.floor(e.ai0) + 1)); // Frame(1,4,0,ai0+1)
          const lx = -lamp.width / 2;                    // 水平居中（原版 X=本体 drawPos.X=中心）
          const ly = by + g.lamp.dy / scale;             // 世界 px +24 → 局部除 scale
          ctx.globalAlpha = opacity;                     // GetAlpha(npcColor)
          ctx.drawImage(lamp, 0, lrow * lh, lamp.width, lh, lx, ly, lamp.width, lh);
          ctx.globalAlpha = Math.max(0, Math.min(1, (127 - alphaRaw / 2) / 255));
          ctx.drawImage(lampGlow, 0, lrow * lh, lampGlow.width, lh, lx, ly, lamp.width, lh);
        }
      }
    } else if (g.mode === 'vel4') {
      // vel4：velocity.RotatedBy(k*π/2) × num 偏移画 4 份灰 A=64（:23750/:24535）
      const num = g.velMult ?? 4; // (GetAlpha-0.5).Length()*k 光照项恒 0（我们无逐 NPC 光照）
      // 416 骑手速度恒 0（AI_075 吸附零速）——原版此处取坐骑 415 的速度
      // （Main.cs:24516 spinningpoint3 = npc[415].velocity）
      const svx = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vx : e.vx;
      const svy = e.vanillaId === 416 && e.master && !e.master.dead ? e.master.vy : e.vy;
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        // 世界坐标偏移 → 本变换局部（当前原点=精灵锚点，除 scale 还原）
        const dx = ((svx * Math.cos(a) - svy * Math.sin(a)) * num) / scale;
        const dy = ((svx * Math.sin(a) + svy * Math.cos(a)) * num) / scale
          + (e.vanillaId === 517 ? 2 : 0);
        ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
      }
    } else {
      // trail：419 火月怪（:25677-25696 本体罩 + 分支四向残影；:24610-24645 拖尾）
      // 本体罩 Color(255-α,…) → 全亮白×Opacity
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.drawImage(img, 0, sy, img.width, gh, bx, by, r.sw, r.sh);
      ctx.globalAlpha = Math.max(0, Math.min(1, (64 / 255) * opacity));
      if (e.ai2 >= -6) {
        // vel4 ×0.5（:25681-25686 num208 = 0.5 + 光照项）
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          const dx = ((e.vx * Math.cos(a) - e.vy * Math.sin(a)) * 0.5) / scale;
          const dy = ((e.vx * Math.sin(a) + e.vy * Math.cos(a)) * 0.5) / scale;
          ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
        }
      } else {
        // UnitX.RotatedBy(k*π/2)×4：固定四向 4px（:25688-25697 num210=4）
        for (let k = 0; k < 4; k++) {
          const dx = (Math.cos(k * Math.PI / 2) * 4) / scale;
          const dy = (Math.sin(k * Math.PI / 2) * 4) / scale;
          ctx.drawImage(img, 0, sy, img.width, gh, bx + dx, by + dy, r.sw, r.sh);
        }
      }
      // 旋刃冲刺拖尾（:24610-24645，ai2<=-9）：oldPos 0..6 七份，帧行 (curRow-3-i)%3+5
      // 循环、scale Lerp(0.75,1.2,(10-i)/10)、白度 (10-i)/20 渐隐。独立平移到历史
      // 位置（世界坐标）——bx/by 恰为"底锚相对偏移"，直接复用
      if (e.ai2 <= -9) {
        const depth = Math.min(7, e.historyDepth());
        for (let i = Math.min(6, depth - 1); i >= 0; i--) {
          let trow = (row - 3 - i) % 3;
          if (trow < 0) trow += 3;
          trow += 5;
          const tsy = Math.min(img.height - gh, trow * gh);
          const ts = 0.75 + 0.45 * ((10 - i) / 10);   // Lerp(0.75,1.2,(10-i)/10)
          ctx.save();
          ctx.translate(e.histXAt(i) + e.w / 2, e.histYAt(i) + e.h);
          ctx.rotate(e.histRotAt(i));
          ctx.scale(ts, ts);
          ctx.globalAlpha = Math.max(0, Math.min(1, (10 - i) / 20)); // White×(10-i)/20, A=0
          ctx.drawImage(img, 0, tsy, img.width, gh, bx, by, r.sw, r.sh);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // ===================== 月总手-躯干连接（Main.cs:24325-24504） =====================
  /** 核心额外偏移：肩锚 (220,-60)×sign、手锚 +（0,76）、臂长 340、IK 折角 acos */
  private moonLordArmAngle(len: number, signX: number): number {
    return Math.acos(Math.max(-1, Math.min(1, len / 340))) * -signX;   // :24362/:24413
  }
  private moonLordSideSign(side: number): [number, number] {
    return side === 0 ? [-1, 1] : [1, 1];                              // vector25/vector41（:24352/:24403）
  }

  /** 月总核心 398（case 398 :24325-24388）：两侧上臂 Extra_14（肩=核心中心+(220,-60)×sign、
   *  肘向量=(手中心+(0,76)-肩)×0.5、折角 acos(|v|/340)×-signX）→ 躯干 Extra_13 左右半
   *  （镜像）→ 胸甲 Extra_16 → 核心 NPC_398 帧。手实体由实体表反查（原版按
   *  npc[whoAmI] 全表扫 ai[2]/ai[3]——我们用 master 链等价解析） */
  /** 风气球 594（Main.cs:23380-23406 + FindFrame case 594 :68652-68656 独占绘制）：
   *  - 贴图 NPC_594.png 为 8 列变体横条 32×76/帧；变体 = ai[2]（1-7 装饰随机）
   *  - 携带史莱姆（slave ai0=-999）时：帧 0 以 slave 的 alpha+color 两遍绘制
   *    （气球壳染成史莱姆色），scale 取 slave.scale；之后叠 ai[2] 变体帧
   *  - 锚点 = npc.Top + origin(0.5,0)（顶部居中）,随 rotation(visAngle) 倾斜 */
  /** 402 星尘织带蠕虫（Main.cs:23848-23889 case 402 独占自绘，1:1）：
   *  单 NPC 无段链——视觉节段 = oldPos 间隔 2 取样，每档两份（第二份向更旧帧
   *  lerp 0.5 补位），贴图 404/403 交替 + Glow_134/133 加色罩（A=0 白的 additive
   *  语义用 lighter 还原）。本体 alpha = Opacity×(0.8−0.14·i/2)、glow = 1−0.14·i/2，
   *  全乘生命末段渐隐 num291（ai[2] 0→600 计时，最后 5% 线性淡出 :23858-23861）。
   *  头 = NPC_402 + Glow_135×num291。锚点 = 碰撞盒中心（origin halfSize），旋转
   *  随 visAngle/oldRot。头中心尾接 DrawPrettyStarSparkle（:23888 → 原语
   *  drawPrettyStarSparkle；ai[2] 计时链在 Enemy.wormAI 402 段驱动）。 */
  /** 266 克苏鲁之脑（Main.cs:24799-24843 专家/FTW 四镜像 + :22949-22951 Y 下垂）：
   *  life<lifeMax 且（专家 || FTW）→ 以玩家中心镜像画 4 份：alpha 因子 =
   *  1-life/lifeMax（专家 ×2，FTW 置 1）平方后钳 0..1，乘进整体 alpha；
   *  镜像位 = 玩家中心 ±(|dx|,|dy|)（num145 0..3：X 取正 0/2、Y 取正 0/1）。
   *  本体照常最后画。全体绘制 Y 偏移 +50×scale（Main.cs:22950 case 266 num47）——
   *  贴图下垂出碰撞盒下缘（克脑主体在盒下半） */
  private drawBrainOfCthulhu(e: Enemy, world: World) {
    if (!this.atlas) return;
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const frameIdx = vanillaFrameIdx(e, frames);
    const r = this.atlas.vnpc(266, frameIdx);
    if (!r) return;
    const ctx = this.ctx;
    // 专家档 ×1.05（Tweaks :18198；266 克脑专属曲径，通用路径不经过这里）
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale * expertRenderScale(266);
    const yOff = 50 * scale;   // Main.cs:22950 num47 += 50*rCurrentNPC.scale
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    const mirrored = e.facing > 0;   // 同通用路径朝向镜像（贴图默认朝左）
    // 四镜像幻影（Main.cs:24802-24841）
    const pl = this.mainPlayer;
    const ftw = !!world.seedFlags?.getGoodWorld;
    if (pl && e.hp < e.maxHp && (world.isExpert || ftw)) {
      let k = 1 - e.hp / e.maxHp;
      if (world.isExpert) k *= 2;
      k *= k;
      if (ftw) k = 1;
      k = Math.max(0, Math.min(1, k));
      const dx = Math.abs(e.cx - pl.cx), dy = Math.abs(e.cy - pl.cy);
      for (let n = 0; n < 4; n++) {
        const sx = n === 0 || n === 2 ? 1 : -1;   // :24822-24829
        const sy = n === 0 || n === 1 ? 1 : -1;   // :24831-24838
        ctx.save();
        ctx.translate(pl.cx + sx * dx, pl.cy + sy * dy + yOff);
        ctx.scale(scale, scale);
        if (mirrored) ctx.scale(-1, 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity * k));
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // 本体（同通用路径中心锚 + 朝向镜像 + Y 偏移）
    ctx.save();
    ctx.translate(e.cx, e.cy + yOff);
    ctx.scale(scale, scale);
    if (mirrored) ctx.scale(-1, 1);
    ctx.globalAlpha = opacity;
    ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawStardustWorm(e: Enemy) {
    const ctx = this.ctx;
    if (!this.atlas) return;
    const head = this.atlas.ensureVImage('vanilla/NPC_402.png');
    const segA = this.atlas.ensureVImage('vanilla/NPC_403.png');
    const segB = this.atlas.ensureVImage('vanilla/NPC_404.png');
    const glowA = this.atlas.ensureVImage('vanilla/Glow_133.png');
    const glowB = this.atlas.ensureVImage('vanilla/Glow_134.png');
    const glowH = this.atlas.ensureVImage('vanilla/Glow_135.png');
    if (!head || !segA || !segB) return;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    // Utils.Remap（:23860-23861 渐隐曲线）
    const remap = (x: number, a: number, b: number, c: number, d: number): number =>
      x <= a ? c : x >= b ? d : c + ((d - c) * (x - a)) / (b - a);
    const LIFE = 600, LIFE_LAST = 570;                    // num288/num289（:23858-23859）
    const n290 = remap(e.ai2, 0, LIFE, 0, 1);
    const n291 = 1 - remap(n290, 0.5, LIFE_LAST / LIFE, 0, 1) * remap(n290, LIFE_LAST / LIFE, 1, 1, 0);
    const fade = Math.max(0, Math.min(1, n291));          // ai2 恒 0（计时未接）时 = 1
    const num287 = (2 / 10) * 0.7;                        // 2/oldPos.Length×0.7（:23857）
    const drawSeg = (
      img: ImageBitmap | HTMLImageElement, glow: ImageBitmap | HTMLImageElement | null,
      px: number, py: number, rot: number, aBody: number, aGlow: number,
    ) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.max(0, Math.min(1, aBody * opacity));
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      if (glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, aGlow));
        ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    };
    // 节段拖尾（:23862-23883）：oldPos 9→1 间隔 2；每档两份（第二份向 oldPos[i-1] lerp .5）
    const depth = e.historyDepth();
    let seg = 0;
    for (let i = Math.min(9, depth - 1); i >= 1; i -= 2) {
      for (let k = 0; k < 2; k++) {
        const tex = seg % 2 === 0 ? segB : segA;          // num286==0 → 404，交替
        const glow = seg % 2 === 0 ? glowB : glowA;
        let px = e.histXAt(i) + e.w / 2, py = e.histYAt(i) + e.h / 2;
        let rot = e.histRotAt(i);
        if (k === 1) {
          px += (e.histXAt(i - 1) - e.histXAt(i)) * 0.5;
          py += (e.histYAt(i - 1) - e.histYAt(i)) * 0.5;
          rot = e.histRotAt(i - 1) * 0.5 + e.histRotAt(i) * 0.5;
        }
        drawSeg(tex, glow, px, py, rot,
          (0.8 - (num287 * i) / 2) * fade, (1 - (num287 * i) / 2) * fade);
        seg++;
      }
    }
    // 头本体 + Glow_135×num291（:23884-23887）
    drawSeg(head, glowH, e.cx, e.cy, e.visAngle, 1, fade);
    // 头中心星尘闪光（:23888）：opacity=Remap(ai2,0,600,0,1)、drawColor=White(A0)、
    // shine=CornflowerBlue(100,149,237)、flare=n290、fadeIn 0.5→0.95、fadeOut
    // 0.95→1（num289/num288=570/600）、rotation=π·2·n290、scale=(2,2)、fatness=(2,2)
    this.drawPrettyStarSparkle(
      remap(e.ai2, 0, LIFE, 0, 1), e.cx, e.cy,
      [255, 255, 255], [100, 149, 237], n290,
      0.5, LIFE_LAST / LIFE, LIFE_LAST / LIFE, 1,
      Math.PI * 2 * n290, [2, 2], [2, 2],
    );
  }

  /** DrawPrettyStarSparkle 实例包装（Main.cs:34734-34750，1:1 参数序）：
   *  贴图 Extra_98 经模块级缓存加载（首帧 miss 次帧生效）。坐标 = 世界系中心。 */
  private drawPrettyStarSparkle(
    opacity: number, x: number, y: number,
    drawColor: readonly [number, number, number], shineColor: readonly [number, number, number],
    flareCounter: number,
    fadeInStart: number, fadeInEnd: number, fadeOutStart: number, fadeOutEnd: number,
    rotation: number, scale: readonly [number, number], fatness: readonly [number, number],
  ): void {
    prettyStarSparkle(this.ctx, opacity, x, y, drawColor, shineColor,
      flareCounter, fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd, rotation, scale, fatness);
  }

  /** 690 雕像宝箱怪（Main.cs:23103-23134 case 690 独占）：本体贴图弃用，改按
   *  ai[1] 雕像样式从 Tiles_105 表切 2 列×3 行 16×16 片拼装——样式的表内步距
   *  36/54px（2×3 格 × 18px 含 1px 缝），direction==1 时行 +3（水平镜像区）；
   *  锚点 = Center+(0,-3)，逐片 origin (1-col, 1.5-row)×16（片内再内缩 1px 取整格） */
  /** 飞灵 677 多层复合渲染（Main.cs:26306-26368 DrawNPCDirect_Faeling 1:1）。
   *  贴图 88×110 = 4 列 × 5 行 22×22 格；4 列是 4 个【图层】非动画帧：
   *  列 0 = 本体图案（灰 191）/ 列 1 = 翅膀 / 列 2 = 白色光晕体（383px 大团）/
   *  列 3 = 闪烁 sparkle。5 行 = 动画帧（FindFrame case 677 frame.Y 0..4，每 3t 一帧）。
   *  ★合成语义 = XNA 预乘 alpha（SpriteBatch AlphaBlend = (One, InvSrcAlpha)）：
   *  调制色 (r,g,b,a) 的 RGB 通道【全额加算】纹理预乘色，A 通道只衰减背景
   *  dst×(1-texel.a×a)。Canvas source-over 会把 a 同时压到 RGB 上（贡献减半）——
   *  旧实现本体/翅膀减半、拖尾/sparkle 非加算 = 用户实报"发光色很淡、与原版
   *  完全不一致"的根因。精确模拟两步：①黑剪影 source-over alpha=a（背景按
   *  纹理形状衰减）②染色纹理 'lighter' alpha=1（RGB 全额叠加）。
   *  原版 677 无 Lighting.AddLight（AI 光分支在 else if，677 永不达）——"照亮
   *  周围"的观感全部来自列 2 大白团的全额加算 + 自发光不走 GetAlpha（本 pass
   *  在光照合成后 = 等价）。 */
  private _faelingTint: HTMLCanvasElement | null = null;
  private _faelingSil: HTMLCanvasElement | null = null;
  /** 飞灵预乘合成单层绘制（DrawNPCDirect_Faeling 各层共享；ctx 须已在世界变换内）。
   *  (mr,mg,mb)=调制 RGB(0-255)、ma=调制 A(0-1)、rot=旋转、fl=水平镜像。
   *  两步：①黑剪影（纹理 alpha 形状）source-over alpha=ma → 背景衰减
   *  dst×(1-texel.a×ma)；②染色纹理 'lighter' alpha=1 → RGB 全额加算。 */
  private faelingPremultLayer(
    ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement,
    tintC: HTMLCanvasElement, silC: HTMLCanvasElement,
    col: number, row: number, dx: number, dy: number,
    mr: number, mg: number, mb: number, ma: number, sc: number,
    rot: number, fl: boolean,
  ): void {
    const CW = 22, CH = 22;
    const sx = col * CW, sy = row * CH;
    const tintCtx = tintC.getContext('2d')!;
    const silCtx = silC.getContext('2d')!;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(rot);
    if (fl) ctx.scale(-1, 1);
    // ① 背景衰减：黑剪影 source-over alpha=ma → 与 XNA InvSrcAlpha 项逐像素等价
    if (ma > 0.004) {
      silCtx.clearRect(0, 0, CW, CH);
      silCtx.drawImage(img, sx, sy, CW, CH, 0, 0, CW, CH);
      silCtx.globalCompositeOperation = 'source-in';
      silCtx.fillStyle = '#000';
      silCtx.fillRect(0, 0, CW, CH);
      silCtx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.max(0, Math.min(1, ma));
      ctx.drawImage(silC, 0, 0, CW, CH, -CW * sc / 2, -CH * sc / 2, CW * sc, CH * sc);
      ctx.globalAlpha = 1;
    }
    // ② RGB 加算：染色纹理（texel.rgb×调制色，alpha 不变）'lighter' 全额叠加。
    //    mr=mg=mb=255 时免染色直画（列 2 光晕/列 1 翅膀）
    const plain = mr >= 254.5 && mg >= 254.5 && mb >= 254.5;
    if (!plain) {
      tintCtx.clearRect(0, 0, CW, CH);
      tintCtx.drawImage(img, sx, sy, CW, CH, 0, 0, CW, CH);
      tintCtx.globalCompositeOperation = 'multiply';
      tintCtx.fillStyle = `rgb(${Math.max(0, Math.min(255, Math.round(mr)))},${Math.max(0, Math.min(255, Math.round(mg)))},${Math.max(0, Math.min(255, Math.round(mb)))})`;
      tintCtx.fillRect(0, 0, CW, CH);
      tintCtx.globalCompositeOperation = 'destination-in';
      tintCtx.drawImage(img, sx, sy, CW, CH, 0, 0, CW, CH);
      tintCtx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(tintC, 0, 0, CW, CH, -CW * sc / 2, -CH * sc / 2, CW * sc, CH * sc);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, sx, sy, CW, CH, -CW * sc / 2, -CH * sc / 2, CW * sc, CH * sc);
    }
    ctx.restore();
  }

  /** 飞灵离屏 canvas 对（惰性建，实例级复用） */
  private faelingCanvases(): [HTMLCanvasElement, HTMLCanvasElement] | null {
    if (!this._faelingTint) {
      const t = document.createElement('canvas'); t.width = 22; t.height = 22;
      const s = document.createElement('canvas'); s.width = 22; s.height = 22;
      this._faelingTint = t; this._faelingSil = s;
    }
    return this._faelingTint && this._faelingSil ? [this._faelingTint, this._faelingSil] : null;
  }

  /** 仙灵三色 583-585 GetAlpha 半白提亮（NPC.cs:94662-94665
   *  `Lerp(lightColor, White, 0.5)`）——光照合成后以 α=0.5 复绘同帧,与主 pass
   *  光照×精灵叠加精确等价：0.5·(light·s) + 0.5·s ≡ s·Lerp(light,White,0.5)。
   *  曾缺=暗处精灵本体被全屏乘光压暗只剩自家光晕（2026-09-02 用户实报
   *  神圣精灵动画效果不对）。变换三件套（rotation=vx×0.1 cs:70620 / 反翻镜像
   *  cs:49137 / 锚+footFlush :6212-6218 同式）与主 pass 逐项一致防鬼影。 */
  private drawFairyBright(e: Enemy) {
    if (!this.atlas || e.vanillaId == null) return;
    const img = this.atlas.ensureVImage(`vanilla/NPC_${e.vanillaId}.png`);
    if (!img || !(img.width > 0)) return;
    const frames = 4, fw = img.width, fh = img.height / frames;   // 24×96 → 24×24 帧
    const idx = vanillaFrameIdx(e, frames);
    const sy = idx * fh;
    const scale = e.vanillaScale || 1;
    // 锚复刻（drawEnemy :6212-6218 同式;仙灵 HB_ADD_H/DRAW_NUM47_OVERRIDE 无条目
    // → addY=0;num46/num47 亦无条目=0）
    let footFlush = 0;
    if (npcFootFlushOn() && !npcFootBiasExempt(e.vanillaId)) {
      const fmaxRow = npcContentBottomRow(img, sy, fw, fh);
      if (fmaxRow >= 0) {
        const dyTarget = e.h / (2 * scale) - fmaxRow - 1;
        footFlush = Math.max(-24, Math.min(24,
          Math.round((dyTarget - (-fh / 2)) * 100) / 100
          + npcFootBiasExtra() + npcFootBiasOverride(e.vanillaId)));
      }
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.cx, e.cy);
    ctx.rotate(e.vx * 0.1);
    ctx.scale(scale, scale);
    if (e.facing < 0) ctx.scale(-1, 1);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, 0, sy, fw, fh, -fw / 2, -fh / 2 + footFlush, fw, fh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawFaeling(e: Enemy, world: World) {
    void world;
    if (!this.atlas) return;
    const img = this.atlas.ensureVImage('vanilla/NPC_677.png');
    if (!img || !(img.width > 0)) return;
    const cvs = this.faelingCanvases();
    if (!cvs) return;
    const ctx = this.ctx;
    const tVis = visEffectFrames();
    const num2 = (((e.id * 0.11 + tVis / 360) % 1) + 1) % 1;
    const hsl = (h: number, s: number, l: number): [number, number, number] =>
      Renderer.glowHslToRgb(((h % 1) + 1) % 1, s, l);
    const animRow = Math.max(0, Math.min(4, Math.floor(e.animT / 3) % 5));
    const scale = e.vanillaScale || 1;
    const rot = e.visAngle;                 // 677 rotation = velocity.X × 0.3（AI 侧 :47473）
    const flip = e.facing === 1;            // spriteDirection==1 → FlipHorizontally(:22984)
    const cx = e.cx, cy = e.cy;
    const half = (e.w || 22) / 2, halfH = (e.h || 22) / 2;
    const drawPremult = (col: number, row: number, dx: number, dy: number,
      mr: number, mg: number, mb: number, ma: number, sc: number, fl: boolean) =>
      this.faelingPremultLayer(ctx, img, cvs[0], cvs[1], col, row, dx, dy,
        mr, mg, mb, ma, sc, rot, fl);

    const [br, bg, bb] = hsl(num2, 1, 0.65);

    // ① 拖尾残影（:26321-26347）：列 2 光晕 × 彩虹 × num14×0.16，A=0 纯加算。
    //    num14 = Remap(i, 0, 60, 1, 0) = 1-i/60（越近本体越亮越大）——旧实现取反
    //    （越旧越亮）；spin 向量 RotatedBy(π) = (-sin·num8, +num7)·num15——旧实现
    //    漏 num15 因子且 Y 分量算成 0。
    const num3 = 60;                                   // TrailCacheLength[677]（NPCID.cs:4805）
    const num4 = num3 - 1 - 5;                         // 54
    const depth = e.historyDepth();
    if (depth > 6) {
      const ox4 = e.histXAt(num4), oy4 = e.histYAt(num4);
      const fromMax = Math.hypot(32, 16);
      let num9 = Math.max(0, Math.min(1, Math.hypot(ox4 - e.x, oy4 - e.y) / fromMax)) * 100;
      num9 = Math.floor(num9 / 5) * 5 / 100;           // (int)num9/5*5/100（:26325-26328）
      const num7 = 32 * num9, num8 = 16 * num9;
      for (let i = num4; i >= 5; i -= 3) {
        if (i >= depth) continue;
        const num14 = Math.max(0, Math.min(1, 1 - i / num3));
        const num15 = 1 - num14;
        const spin = Math.sin(e.id / 17 + tVis / 9 + num14 * 2 * Math.PI * 2) * num8 * num15;
        // RotatedBy(π)：(x,y)→(-x,-y)；绘制中心 = oldPos 中心 + spin
        const vx = -spin, vy = num7 * num15;
        const [tr, tg, tb] = hsl(num2 + num15 * 0.5, 1, 0.5);
        const k = num14 * 0.16;
        drawPremult(2, 0, e.histXAt(i) + half + vx, e.histYAt(i) + halfH + vy,
          tr * 255 * k, tg * 255 * k, tb * 255 * k, 0,
          scale * Math.max(0, Math.min(2.5, num14 * num14 * 2.5)), flip);
      }
    }

    // ② 主光晕（:26348）：Color(255,255,255,0) = 全额加算白，无背景衰减
    drawPremult(2, 0, cx, cy, 255, 255, 255, 0, scale, flip);
    // ③ 翅膀（:26350-26352）：White A/=2 = 127 → 加算白 + 背景 ×0.502
    drawPremult(1, animRow, cx, cy, 255, 255, 255, 127 / 255, scale, flip);
    // ④ 本体（:26353）：hsl(num2,1,0.65) A/=2 → 彩虹加算 + 背景 ×0.502
    drawPremult(0, animRow, cx, cy, br * 255, bg * 255, bb * 255, 127 / 255, scale, flip);

    // ⑤⑥ 闪烁（:26354-26361）：lerp(color,White,0.5)×num16 → RGB=(color+1)/2×num16、
    //     A=63.5/255×num16；缩放 ×num17 脉冲；行 whoAmI%5 与行 1；SpriteEffects.None（不翻转）
    const num16 = Math.max(0, Math.min(1, Math.sin(tVis / 60) * 0.3 + 0.3));
    const num17 = 0.8 + Math.sin(tVis / 15 * Math.PI * 2) * 0.3;
    const glowRow = ((e.id % 5) + 5) % 5;
    const gr = (br + 1) * 127.5 * num16, gg = (bg + 1) * 127.5 * num16, gb = (bb + 1) * 127.5 * num16;
    drawPremult(3, glowRow, cx, cy, gr, gg, gb, 63.5 / 255 * num16, scale * num17, false);
    drawPremult(3, 1, cx, cy, gr, gg, gb, 63.5 / 255 * num16, scale * num17, false);
  }

  private drawStatueMimic(e: Enemy) {
    const ctx = this.ctx;
    if (!this.atlas) return;
    const img = this.atlas.ensureVImage('vanilla/Tiles_105.png');
    if (!img || !img.width) return;
    const style = Math.max(0, Math.round(e.ai1));
    const colBase = style % 55;
    const rowBase = Math.floor(style / 55) + (e.facing > 0 ? 3 : 0);   // num77/num78（:23121-23125）
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    ctx.save();
    ctx.translate(e.cx, e.cy - 3);
    if (e.visAngle) ctx.rotate(e.visAngle);
    ctx.globalAlpha = opacity;
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 3; r++) {
        const sx = Math.min(img.width - 17, colBase * 36 + c * 18 + 1);   // 内缩 1px（Frame 语义）
        const sy = Math.min(img.height - 17, rowBase * 54 + r * 18 + 1);
        const ox = (c - 1) * 16, oy = (r - 1.5) * 16;                    // dest = anchor - origin
        ctx.drawImage(img, sx, sy, 16, 16, ox, oy, 16, 16);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawWindyBalloon(e: Enemy, entities: unknown[]) {
    const ctx = this.ctx;
    const img = this.atlas!.ensureVImage('vanilla/NPC_594.png');
    if (!img) return;
    const fw = 32, fh = img.height;
    const variant = Math.max(0, Math.min(7, Math.round(e.ai2)));
    const slave = (entities as Enemy[]).find(
      (n) => n.id === e.ai3 && !n.dead && n.vanillaId === 1 && n.ai0 === -999,
    ) ?? null;
    const scale = slave?.vanillaScale ?? e.vanillaScale ?? 1;
    ctx.save();
    ctx.translate(e.cx, e.y);
    ctx.rotate(e.visAngle);
    ctx.scale(scale, scale);
    if (slave && slave.colorRGBA && slave.colorRGBA[3] > 0) {
      // 气球壳随奴隶（Main.cs:23390-23393 三遍的前两遍）：
      // ① GetAlpha + ② GetColor 两遍合一（xnaCombined，同 drawEnemy 主路径——
      //   空气背景透出保留；三步 lighter 兜底仅烘焙失败时用）
      const combined = this.xnaCombined('npc594shell',
        { img, sx: 0, sy: 0, sw: fw, sh: fh }, slave.colorRGBA,
        Math.min(255, Math.max(slave.spawnAlpha, 0)) / 255);  // ★用户校准态（同主路径）
      if (combined) {
        ctx.globalAlpha = 1;
        ctx.drawImage(combined.c, combined.x, combined.y, combined.w, combined.h, -fw / 2, 0, fw, fh);
      } else {
        const fadeS = 1 - Math.min(255, Math.max(slave.spawnAlpha, 0)) / 255;
        ctx.globalAlpha = fadeS;
        ctx.drawImage(img, 0, 0, fw, fh, -fw / 2, 0, fw, fh);
        const tinted = this.tintedSprite('npc594shell', { img, sx: 0, sy: 0, sw: fw, sh: fh }, slave.colorRGBA);
        if (tinted) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = slave.colorRGBA[3] / 255;
          ctx.drawImage(img, 0, 0, fw, fh, -fw / 2, 0, fw, fh);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, -fw / 2, 0, fw, fh);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, variant * fw, 0, fw, fh, -fw / 2, 0, fw, fh);
    ctx.restore();
  }

  // ===================== 2D 网格贴图 NPC（drawNpcGrid 切格族） =====================
  /** 帧索引持久态（≈原版 NPC.frameCounter / NPC.frame.Y）：WeakMap 按 Enemy 持有，
   *  每 draw 调用推进一次（与原版 FindFrame 每 update 调一次 1:1） */
  private npcGridFrameState = new WeakMap<Enemy, NpcGridFrameState>();
  private npcGridFrame(e: Enemy): NpcGridFrameState {
    let s = this.npcGridFrameState.get(e);
    if (!s) { s = { counter: 0, idx: 0 }; this.npcGridFrameState.set(e, s); }
    return s;
  }

  /** 网格切格绘制：源格 = (col*cellW+padX, row*cellH+padY, cellW-2padX, cellH-2padY)，
   *  目标锚 Bottom（+yOff），col/row 由 idx 按 perRow 折算。镜像语义对齐原版
   *  `spriteEffects`（贴图朝左 → 朝右翻）/ `spriteEffects ^ FlipHorizontally`（贴图
   *  朝右 → 朝左翻）——canvas scale(-1,1)+originX 与 XNA FlipHorizontally+origin 数学
   *  等价（翻转均绕 origin 点），anchorPx 非对称锚按 spriteDirection 切换取值
   *  （Main.cs 各 case 的 `origin.X = anchor / width-anchor` 同款） */
  private drawNpcGrid(
    e: Enemy, img: ImageBitmap | HTMLImageElement, cols: number, rows: number, idx: number,
    cellW: number, cellH: number,
    opts: {
      perRow?: number;            // idx→(col,row) 除数；696 为 9（其 rows=27 但索引每 9 折行）
      yOff?: number;              // Bottom 附加偏移（657 = +2）
      anchorPx?: number;          // 非对称水平锚（576/577=94、564/565=52、668=106）；缺省水平居中
      originYOff?: number;        // origin.Y 自帧底上抬（576/577=4、696=4、564/565=10、668=4）
      padX?: number; padY?: number; // Frame 第 5/6 参 padding（668 各 2）
      inflateY?: number;          // Inflate(0,-n)：sy+=n/2、sh-=n（657 = 2）
      mirrorTexFaces?: 'left' | 'right'; // 贴图默认朝向：left=朝右翻、right=朝左翻
      rotate?: number;
      glowTex?: string;           // GlowMask 同布局网格切片（564/565 = Glow_225）
      echoRowShift?: number;      // 投影层：同列 row+n 再画一遍半透明（696 = +18）
    } = {},
  ) {
    const ctx = this.ctx;
    const perRow = opts.perRow ?? rows;
    const col = Math.floor(idx / perRow), row = idx % perRow;
    const padX = opts.padX ?? 0, padY = opts.padY ?? 0;
    let sx = col * cellW + padX, sy = row * cellH + padY;
    let sw = cellW - padX * 2, sh = cellH - padY * 2;
    if (opts.inflateY) { sy += opts.inflateY >> 1; sh -= opts.inflateY; }
    // 越界钳制（防御性：帧态漂移时不画到表外）
    sx = Math.max(0, Math.min(img.width - 1, sx));
    sy = Math.max(0, Math.min(img.height - 1, sy));
    sw = Math.max(1, Math.min(sw, img.width - sx));
    sh = Math.max(1, Math.min(sh, img.height - sy));
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255; // NPC.Opacity
    const facingRight = e.facing > 0;
    const mirrored = opts.mirrorTexFaces === 'right' ? !facingRight : facingRight;
    const originX = opts.anchorPx != null ? (facingRight ? opts.anchorPx : sw - opts.anchorPx) : sw / 2;
    const originY = sh - (opts.originYOff ?? 0);
    ctx.save();
    ctx.translate(e.cx, e.y + e.h + (opts.yOff ?? 0));
    if (opts.rotate) ctx.rotate(opts.rotate);
    ctx.scale(scale * (mirrored ? -1 : 1), scale);
    // ★有 color 的网格 NPC：base+color 两遍合一（xnaCombined，同通用路径——
    //   旧三步 α 钳 1 丢空气背景透出，2026-08-21 同类扫描补齐）
    const gridCombined = (e.colorRGBA && e.colorRGBA[3] > 0)
      ? this.xnaCombined(`npc${e.vanillaId}`, { img, sx, sy, sw, sh }, e.colorRGBA,
          Math.min(255, Math.max(e.spawnAlpha, 0)) / 255)  // ★用户校准态（同主路径）
      : null;
    ctx.globalAlpha = opacity;
    if (!gridCombined) ctx.drawImage(img, sx, sy, sw, sh, -originX, -originY, sw, sh);
    // 原版 color 二次绘制（NPC.GetColor）
    if (e.colorRGBA && e.colorRGBA[3] > 0) {
      if (gridCombined) {
        ctx.globalAlpha = 1;
        ctx.drawImage(gridCombined.c, gridCombined.x, gridCombined.y, gridCombined.w, gridCombined.h,
          -originX, -originY, sw, sh);
      } else {
        const tinted = this.tintedSprite(`npc${e.vanillaId}`, { img, sx, sy, sw, sh }, e.colorRGBA);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = e.colorRGBA[3] / 255;
        ctx.drawImage(img, sx, sy, sw, sh, -originX, -originY, sw, sh);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        if (tinted) ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, -originX, -originY, sw, sh);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // GlowMask 同布局网格叠画（原版以同一 source rect 二次 Draw，Glow 表与 NPC 表等大）
    if (opts.glowTex && this.atlas) {
      const g = this.atlas.vmisc(opts.glowTex);
      if (g) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1, 0.5 * opacity)); // :23484 white.A/2×Opacity
        ctx.drawImage(g.img, sx, sy, sw, sh, -originX, -originY, sw, sh);
      }
    }
    // 投影层（696 :23358-23367:同列 row+18 画【两遍】——第一遍精确、第二遍 ±1px 抖动,
    //  alpha 127×Opacity）
    if (opts.echoRowShift) {
      const esy = Math.min(img.height - sh, (row + opts.echoRowShift) * cellH + padY);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.max(0, Math.min(1, (127 / 255) * opacity));
      ctx.drawImage(img, sx, esy, sw, sh, -originX, -originY, sw, sh);
      const jx = (Math.floor(Math.random() * 3)) - 1;
      const jy = (Math.floor(Math.random() * 3)) - 1;
      ctx.drawImage(img, sx, esy, sw, sh, -originX + jx, -originY + jy, sw, sh);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return { sx, sy, sw, sh };
  }

  /** 657 史莱姆皇后（Main.cs case 657 :23134-23160 + FindFrame case 657 :67503-67614）：
   *  NPC_657.png 360×1952 = 2 列×16 行（180×122/格），Frame(2,16,idx/16,idx%16) 再
   *  Inflate(0,-2)；锚 Bottom+(0,2)、origin(w/2,帧高)、贴图朝右。
   *  旋转 = AI 侧 spin（飞行 vx*0.1 钳 ±0.5，同通用 ROTATION_NPC 段）。
   *  未实装（素材/系统缺）：QueenSlime shader 残影(ai0==4&&vy!=0)、Extra_186 水晶、
   *  Extra_177 王冠、二段翅膀 DrawNPCDirect_QueenSlimeWings（Extra 表未入素材白名单） */
  private drawQueenSlimeGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_657.png');
    if (!img) return;
    const half = e.hp <= e.maxHp / 2;
    const idx = queenSlimeNextFrame(this.npcGridFrame(e), {
      half,
      // 与 bossAI_lategame queenSlimeAI 的 noGravity 判定同式(:949)——
      // 渲染/AI 两处 flying 语义必须一致,否则半血 ai0∈{4,5} 飞行帧段走错
      flying: e.ai0 === 5 || (e.ai0 === 4 && e.ai2 === 0) || (half && e.ai0 === 0),
      vy: e.vy, ai0: e.ai0, ai1: e.ai1,
    });
    // 几何(cols/rows/cell/inflateY)查 NPC_GRIDS 单一真源(重制管线共用)
    const g = NPC_GRIDS[657]!;
    // ★shader 修齐收口：QueenSlime pass 全幅洗染（Main.cs:23964/23989/23996 三 Apply
    //   ——洗染对象=NPC_657 表切片(残影 ghost 环+value19 发光叠绘),本体 batch 素绘、
    //   水晶核(Extra_186)在 reset 后素绘。当前帧 cell 逐像素过 SM2 pass
    //   （t0=表 UV 域 uSourceRect/uImageSize0;s1/s2=Extra_180/179 渐变噪声））
    const washed = this.queenSlimeWashedCell(e, img, g, idx);
    this.drawQueenSlimeExtras(e, idx, half, washed);
    this.drawNpcGrid(e, img, g.cols, g.rows, idx, g.cellW, g.cellH, {
      perRow: g.perRow, yOff: 2, inflateY: g.inflateY, mirrorTexFaces: 'right', rotate: e.spin,
    });
    // value19 发光叠绘：洗染 cell 以 Bottom+2 锚、origin 底心、XOR 镜像再绘一遍
    // （GetAlpha(color19)≈白×Opacity → globalAlpha=opacity）
    if (washed) {
      const ctx = this.ctx;
      const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
      if (opacity > 0) {
        const sw2 = g.cellW, sh2 = g.cellH - (g.inflateY ?? 0);
        const mirrored = e.facing <= 0;                    // mirrorTexFaces:'right' 同式
        ctx.save();
        ctx.translate(e.cx, e.y + e.h + 2);
        if (e.spin) ctx.rotate(e.spin);
        ctx.scale((mirrored ? -1 : 1), 1);
        ctx.globalAlpha = opacity;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(washed, -sw2 / 2, -sh2, sw2, sh2);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    this.drawQueenSlimeCrown(e, idx);
  }

  /** ★修齐批终口：当前帧 cell 的 QueenSlime pass 洗染（离屏栅格化→SM2 解释器→
   *  回贴）。t0=表 UV 域（uSourceRect=[sx,sy,w,h]/uImageSize0=表尺寸——径向/
   *  swirl 数学在表空间展开,同 vanilla SpriteBatch 贴图 UV 语义）;s1/s2=
   *  Extra_180/179 渐变噪声（wrap 采样）。失败（解释器/资产未就绪）返回 null,
   *  调用方回退素绘。 */
  private qsNoisePix: Record<string, { w: number; h: number; data: Uint8ClampedArray }> = {};
  /** ★B1（2026-09-03）：洗染 cell 200ms 时间桶缓存——swirl 是 uTime 动画,桶 200ms
   *  ≈5fps(微光动画语义可接受,wingBakeCache 同款);键=idx|桶,容量闸 16+2s 修剪。
   *  QueenSlime pass 经 fx-sm2-v0-commute 实测 Δ=1 可交换,输出仅依赖(uTime,切片)。 */
  private qsWashCache = new Map<string, HTMLCanvasElement>();
  private qsWashPruneAt = 0;
  private queenSlimeWashedCell(
    e: Enemy, img: ImageBitmap | HTMLImageElement,
    g: { cellW: number; cellH: number; perRow?: number; inflateY?: number },
    idx: number,
  ): HTMLCanvasElement | null {
    if (!this.atlas) return null;
    const perRow = g.perRow ?? 16;
    const col = Math.floor(idx / perRow), row = idx % perRow;
    let sx = col * g.cellW, sy = row * g.cellH + ((g.inflateY ?? 0) >> 1);
    let sw = g.cellW, sh = g.cellH - (g.inflateY ?? 0);
    sx = Math.max(0, Math.min(sx, img.width - 1));
    sy = Math.max(0, Math.min(sy, img.height - 1));
    sw = Math.max(1, Math.min(sw, img.width - sx));
    sh = Math.max(1, Math.min(sh, img.height - sy));
    const qsBucket = Math.floor(performance.now() / 200);
    const qsKey = `${idx}|${qsBucket}`;
    const qsCached = this.qsWashCache.get(qsKey);
    if (qsCached) return qsCached;
    if (performance.now() - this.qsWashPruneAt > 2000) {
      this.qsWashPruneAt = performance.now();
      while (this.qsWashCache.size >= 16) this.qsWashCache.delete(this.qsWashCache.keys().next().value as string);
    }
    try {
      const pass = getPass('QueenSlime');
      if (!pass) return null;
      const cv0 = document.createElement('canvas');
      cv0.width = sw; cv0.height = sh;
      const c0 = cv0.getContext('2d', { willReadFrequently: true });
      if (!c0) return null;
      c0.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh);
      const im = c0.getImageData(0, 0, sw, sh);
      // Extra_180/179 渐变噪声采样器（wrap;像素缓存）
      const mkSampler = (file: string): SM2SamplerOut | undefined => {
        let px = this.qsNoisePix[file];
        if (!px) {
          const nimg = this.atlas!.ensureVImage(`vanilla/${file}.png`);
          if (!nimg || !(nimg.width > 0)) return undefined;
          const nc = document.createElement('canvas');
          nc.width = nimg.width; nc.height = nimg.height;
          const ncx = nc.getContext('2d', { willReadFrequently: true })!;
          ncx.drawImage(nimg as CanvasImageSource, 0, 0);
          px = { w: nc.width, h: nc.height, data: ncx.getImageData(0, 0, nc.width, nc.height).data };
          this.qsNoisePix[file] = px;
        }
        return (uu, vv, o4) => {
          const u2 = uu - Math.floor(uu), v2 = vv - Math.floor(vv);
          const x = Math.min(px.w - 1, (u2 * px.w) | 0), y = Math.min(px.h - 1, (v2 * px.h) | 0);
          const o = (y * px.w + x) * 4;
          o4[0] = px.data[o] / 255; o4[1] = px.data[o + 1] / 255; o4[2] = px.data[o + 2] / 255; o4[3] = px.data[o + 3] / 255;
        };
      };
      const s1 = mkSampler('Extra_180'), s2 = mkSampler('Extra_179');
      const u = defaultUniforms();
      u.uTime = (performance.now() / 1000) % 3600;
      u.uSourceRect = [sx, sy, sw, sh];
      u.uImageSize0 = [img.width, img.height];
      u.uColor = [1, 1, 1]; u.uOpacity = 1; u.uSaturation = 1;
      runPassOnImageData(pass, im.data, sw, sh, u, [s1, s2]);
      c0.putImageData(im, 0, 0);
      this.qsWashCache.set(qsKey, cv0);
      return cv0;
    } catch {
      return null;                                          // 回退素绘（失败不缓存,次帧重试）
    }
  }

  /** 657 附属层（Main.cs case 657 :23938-23963 + DrawNPCDirect_QueenSlimeWings :22691-22717，
   *  本批补全——此前"素材/系统缺"登记随 Extra_177/179/180/185/186 入库作废）：
   *  ① 二段翅膀（life≤halfMax）：Extra_185 Frame(1,4,0,lai3/6)、scale 0.8、双翼镜像锚
   *     Center（i=1 右翼 +2px 翻转）、翼尖倾斜 = clamp(vy,±6)×−0.1（左翼反号）、
   *     rotation≠0 时锚点绕 Bottom 旋转；
   *  ② 残影（ai0==4 && vy≠0，:23969-23986）：oldPos[0..7]+(w/2,h) 底心向当前 Bottom 收拢
   *     (Bottom−ghost)×0.25×num102（ai2==1 坠相 ×6），alpha=(1−k/8)，XOR 翻转；
   *  ③ 水晶核 Extra_186：Center+(0,Y 偏移表[:23950-23986]) 绕 Bottom 旋转、origin 心。
   *  ★shader 修齐收口（终态）：vanilla 洗染对象=NPC_657 表切片——残影(Apply 门内
   *  :23964-23972)+value19 发光叠绘(:23989-23996 GetAlpha) 经 SM2 QueenSlime pass
   *  （washed cell 由 queenSlimeWashedCell 逐帧产出,t0=表 UV 域,s1/s2=Extra_180/179）；
   *  水晶核=reset 后素绘（循环染色近似退役）。Extra_185 老翅表示与 1458 NPC 表
   *  Frame(2,16) 切片的分域差异维持登记（非 shader 面）。 */
  private drawQueenSlimeExtras(e: Enemy, idx: number, half: boolean, washed?: HTMLCanvasElement | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.atlas) return;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    if (opacity <= 0) return;
    // shader 循环色（GetDustColor 调色族端点 lerp;8 桶量化入 tintedSprite 缓存）
    const tSec = (typeof performance !== 'undefined' ? performance.now() : 0) / 400;
    const mix = 0.5 + 0.5 * Math.sin(tSec);
    const tint = [Math.round(255 * mix), Math.round(160 - 80 * mix), Math.round(255)];
    const bottomX = e.cx, bottomY = e.y + e.h;
    const spin = e.spin;
    const rotAboutBottom = (px: number, py: number): [number, number] => {
      if (spin === 0) return [px, py];
      const c = Math.cos(spin), s = Math.sin(spin);
      const dx = px - bottomX, dy = py - bottomY;
      return [bottomX + dx * c - dy * s, bottomY + dx * s + dy * c];
    };
    // ① 二段翅膀（先于本体,原版绘制序 :23946-23949）
    if (half) {
      const wimg = this.atlas.ensureVImage('vanilla/Extra_185.png');
      if (wimg && wimg.height >= 4) {
        const fh = wimg.height / 4;
        const wi = Math.floor((e.lai3 % 24) / 6) & 3;
        for (let i = 0; i < 2; i++) {
          let px = e.cx + (i === 1 ? 2 : 0), py = e.cy;
          [px, py] = rotAboutBottom(px, py);
          const tilt = -Math.max(-6, Math.min(6, e.vy)) * 0.1 * (i === 0 ? -1 : 1);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(spin + tilt);
          ctx.scale(i === 1 ? -1 : 1, 1);
          ctx.globalAlpha = opacity;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(wimg as CanvasImageSource, 0, wi * fh, wimg.width, fh, -wimg.width, -fh / 2, wimg.width, fh);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }
    // ② 残影（ai0==4 且空中;坠相 num102=6 强化收拢）
    if (e.ai0 === 4 && Math.abs(e.vy) > 0.01) {
      const bodyImg = this.atlas.ensureVImage('vanilla/NPC_657.png');
      if (bodyImg) {
        const g = NPC_GRIDS[657]!;
        const perRow = g.perRow ?? g.rows;
        const col = Math.floor(idx / perRow), row = idx % perRow;
        let sx = col * g.cellW, sy = row * g.cellH + ((g.inflateY ?? 0) >> 1);
        let sw = g.cellW, sh = g.cellH - (g.inflateY ?? 0);
        sx = Math.max(0, Math.min(bodyImg.width - 1, sx));
        sy = Math.max(0, Math.min(bodyImg.height - 1, sy));
        sw = Math.max(1, Math.min(sw, bodyImg.width - sx));
        sh = Math.max(1, Math.min(sh, bodyImg.height - sy));
        const num102 = e.ai2 === 1 ? 6 : 1;
        const depth = e.historyDepth();
        ctx.imageSmoothingEnabled = false;
        // ★修齐收口：残影=Apply 门内 value17 切片（Main.cs:23964-23972）——
        //   洗染 cell 就绪用之,否则回退素切片
        for (let k = 7; k >= 0; k--) {
          if (k >= depth) continue;
          const bx = e.histXAt(k) + e.w * 0.5, by = e.histYAt(k) + e.h;
          const gx = bx - (bottomX - bx) * 0.25 * num102;
          const gy = by - (bottomY - by) * 0.25 * num102;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(spin);
          ctx.scale(e.facing > 0 ? -1 : 1, 1);   // XOR FlipHorizontally（与本体反向）
          ctx.globalAlpha = Math.max(0, 1 - k / 8) * opacity;
          if (washed) ctx.drawImage(washed, -sw / 2, -sh, sw, sh);
          else ctx.drawImage(bodyImg as CanvasImageSource, sx, sy, sw, sh, -sw / 2, -sh, sw, sh);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }
    // ③ 水晶核（shader 循环染色近似）
    const crystal = this.atlas.ensureVImage('vanilla/Extra_186.png');
    if (crystal) {
      // ★shader 修齐收口：水晶核=reset 后素绘（vanilla :23973-23975 pass reset 后
      //   Draw value18 无 shader）——8 步循环染色近似退役
      let px = e.cx, py = e.cy + (QUEEN_SLIME_CORE_Y_OFF[idx] ?? 0);
      [px, py] = rotAboutBottom(px, py);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(spin);
      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(crystal as CanvasImageSource, -crystal.width / 2, -crystal.height / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** 657 王冠层（Main.cs :24001-24044，本批补全）：Extra_177 于 Center.X、
   *  Top.Y − 冠高 + 44 + Y 偏移表（idx=6 与水晶核表反号 +10/:24003-24005），
   *  origin 心、rotation≠0 绕 Bottom 旋转。普通混合（不进 shader）。 */
  private drawQueenSlimeCrown(e: Enemy, idx: number): void {
    const ctx = this.ctx;
    const crown = this.atlas?.ensureVImage('vanilla/Extra_177.png');
    if (!ctx || !crown) return;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    if (opacity <= 0) return;
    const bottomX = e.cx, bottomY = e.y + e.h;
    const spin = e.spin;
    let px = e.cx, py = e.y - crown.height + 44 + (QUEEN_SLIME_CORE_Y_OFF[idx] ?? 0);
    if (idx === 6) py += 20;   // 冠表 6→+10 与水晶表 6→−10 的差值（:24003-24005 vs :23952）
    if (spin !== 0) {
      const c = Math.cos(spin), s = Math.sin(spin);
      const dx = px - bottomX, dy = py - bottomY;
      px = bottomX + dx * c - dy * s; py = bottomY + dx * s + dy * c;
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(spin);
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(crown as CanvasImageSource, -crown.width / 2, -crown.height / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 576/577 DD2 食人魔（Main.cs case 576/577 :23301-23330 + FindFrame :68241-68380）：
   *  NPC_576/577.png 1162×1740 = 5 列×10 行（XNA 整除 232×174/格），
   *  Frame(5,10,idx/10,idx%10)；锚 Bottom、origin(94 或 232-94, 174-4)、贴图朝右。
   *  未实装：localAI[3]<60 出生紫雾 3 层叠画（事件出生特效，走 spawnAlpha 渐显替代） */
  private drawDd2OgreGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage(`vanilla/NPC_${e.vanillaId}.png`);
    if (!img) return;
    const idx = dd2OgreNextFrame(this.npcGridFrame(e), { ai0: e.ai0, ai1: e.ai1, vx: e.vx, vy: e.vy });
    // 玩家接触侧回填（GetMeleeCollisionData 576/577 近挥帧窗 :96185-96235 消费，
    // 相位锚证见 Enemy.vanillaGridFrameIdx 字段注）
    e.vanillaGridFrameIdx = idx;
    const g = e.vanillaId != null ? NPC_GRIDS[e.vanillaId] : undefined;
    if (!g) return;
    this.drawNpcGrid(e, img, g.cols, g.rows, idx, g.cellW, g.cellH, {
      perRow: g.perRow, anchorPx: 94, originYOff: 4, mirrorTexFaces: 'right',
    });
  }

  /** 696（Main.cs case 696 :23349-23375 + FindFrame case 696 :67332-67388）：
   *  NPC_696.png 384×1242 = 6 列×27 行（64×46/格），Frame(6,27,idx/9,idx%9)——
   *  注意索引每 9 折行（perRow=9 而非 27）；锚 Bottom、origin(w/2,46-4)、贴图朝左
   *  （本 case 用 spriteEffects 原样，无 ^FlipHorizontally）。
   *  投影层：同列 row+18 半透明重绘（:23359-23367）；ai0==2 表情气泡未实装 */
  private drawNpc696Grid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_696.png');
    if (!img) return;
    const idx = npc696NextFrame(this.npcGridFrame(e), { ai0: e.ai0 });
    const g = NPC_GRIDS[696]!;
    this.drawNpcGrid(e, img, g.cols, g.rows, idx, g.cellW, g.cellH, {
      perRow: g.perRow, originYOff: 4, mirrorTexFaces: 'left', echoRowShift: 18,
    });
  }

  /** 564/565 暗黑魔法师 T1/T2（Main.cs case 564/565 :23413-23490 + FindFrame :68657-69085）：
   *  NPC_564/565.png 600×972 = 5 列×9 行（120×108/格），Frame(5,9,idx/9,idx%9)；
   *  锚 Bottom、origin(52 或 120-52, 108-10)、贴图朝右。
   *  Glow_225 同布局（600×972）以同一格切片叠画（:23484 white.A/2×Opacity，
   *  原 drawNpcGlow 551/564/565 alpha 分支并入此处）。
   *  未实装：localAI[3]<60 出生旋转紫雾、四向呼吸 sway 叠层（spawnAlpha 渐显替代） */
  private drawDarkMageGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage(`vanilla/NPC_${e.vanillaId}.png`);
    if (!img) return;
    const idx = darkMageNextFrame(this.npcGridFrame(e), {
      ai0: e.ai0, ai1: e.ai1, speed: Math.hypot(e.vx, e.vy),
    });
    const g = e.vanillaId != null ? NPC_GRIDS[e.vanillaId] : undefined;
    if (!g) return;
    this.drawNpcGrid(e, img, g.cols, g.rows, idx, g.cellW, g.cellH, {
      perRow: g.perRow, anchorPx: 52, originYOff: 10, mirrorTexFaces: 'right',
      glowTex: 'vanilla/Glow_225.png',
    });
  }

  /** 668 鹿角怪（Main.cs DrawNPCDirect_Deerclops :26211-26295 全层 + FindFrame case 668
   *  :67390-67501）：NPC_668.png 1090×1200 = 5 列×5 行（218×240/格），
   *  Frame(5,5,idx/5,idx%5,2,2) 2px padding；锚 Bottom、origin(106 或 214-106, 236-4)、
   *  贴图朝右（spriteDirection==1 → origin.X=106）。
   *  全层 1:1：①localAI[3]>0 出生红雾双环绕（半径 (lai3/36)²×20，角速 GT×10，
   *  色值 (80,0,0)×0.5、alpha×(1-r²/2)，:26235-26253）②本体（紫电 tint：
   *  Lerp(白,(50,0,160),Remap(lai3,0,20,0,1))，alpha×(1-r²)，:26255-26262）③ai0∈{7,8}
   *  消散：num7=Remap(ai1,20,60,0,2) 三角波再 lerp 紫 ×(1-num7)，5 层重影（双轨道
   *  80n² 与 80n²+30j·n²，角速 GT×6 / GT×3·j·0.5，色 ×0.5，:26263-26283）
   *  ④Extra_245 前层红雾（(255,30,30,66)×Opacity×num12×0.25×(1-num7)，环绕半径
   *  r²×4，:26285-26295）。GT=GlobalTimeWrappedHourly（进程秒%3600，Main.cs:16777） */
  private drawDeerclopsGrid(e: Enemy) {
    const img = this.atlas!.ensureVImage('vanilla/NPC_668.png');
    if (!img) return;
    // 1457：攻击态帧计数读 ai[1]（AI 同步相位）
    const idx = deerclopsNextFrame(this.npcGridFrame(e), { ai0: e.ai0, ai1: e.ai1, vx: e.vx, vy: e.vy, lai0: e.lai0 });
    // 玩家接触侧回填（GetMeleeCollisionData 668 斧臂帧判定 :96253-96278 消费）
    e.vanillaGridFrameIdx = idx;
    // 几何查 NPC_GRIDS[668](5×5×218×240+pad2,重制管线同源)
    const g = NPC_GRIDS[668]!;
    const col = Math.floor(idx / (g.perRow ?? g.rows)), row = idx % (g.perRow ?? g.rows);
    const sx = col * g.cellW + (g.padX ?? 0), sy = row * g.cellH + (g.padY ?? 0);
    const sw = g.cellW - (g.padX ?? 0) * 2, sh = g.cellH - (g.padY ?? 0) * 2;
    const frame = { img, sx, sy, sw, sh };
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const opacity = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;   // NPC.Opacity
    const facingRight = e.facing > 0;
    const mirrored = !facingRight;                                        // 贴图朝右
    const originX = facingRight ? 106 : sw - 106, originY = sh - 4;
    const GT = (performance.now() / 1000) % 3600;
    // ---- 状态量（:26227-26270）----
    const lai3 = e.lai3;
    const r = lai3 > 0 ? lai3 / 36 : 0;                 // num6（红雾进度）
    const r2 = r * r;                                   // num3
    const r1 = lai3 > 0 ? Math.max(0, Math.min(1, lai3 / 20)) : 0; // 紫电 Remap(lai3,0,20,0,1)
    let num7 = 0;
    if (e.ai0 === 7 || e.ai0 === 8) {
      // Remap(ai1,20,60,0,2)（:26265）区外钳制
      num7 = e.ai1 <= 20 ? 0 : e.ai1 >= 60 ? 2 : ((e.ai1 - 20) / 40) * 2;
      if (num7 > 1) num7 = 2 - num7;                    // 三角波 0→1→0
    }
    const bodyAlpha = opacity * (1 - r2) * (1 - num7);  // ①透明环 + ③消散衰减
    const tPurple = r1 + num7 - r1 * num7;              // 两段 Lerp 链的合成系数
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.cx, e.y + e.h);
    ctx.scale(scale * (mirrored ? -1 : 1), scale);
    const drawFrame = (c: TintRect | null, dx: number, dy: number, alpha: number) => {
      if (!c) return;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(c.c, c.x, c.y, c.w, c.h, -originX + dx, -originY + dy, sw, sh);
    };
    // ① 出生红雾双环绕（:26245-26253）：num2=2 层,(0,1).Rot(i·π + GT·10) × r²·20
    //    → 偏移 = (-sinθ, cosθ)·R；色 value2=(80,0,0)×0.5,alpha×(1-r²/2)
    if (lai3 > 0) {
      const red = this.lerpSprite('deer-red', frame, [40, 0, 0], 1);
      const a = (128 / 255) * (1 - r2 * 0.5) * opacity;
      for (let i = 0; i < 2; i++) {
        const th = i * Math.PI + GT * 10;
        const R = r2 * 20;
        drawFrame(red, -Math.sin(th) * R, Math.cos(th) * R, a);
      }
    }
    // ② 本体（紫电 tint 链）:26284
    const body = this.lerpSprite('deer-body', frame, [50, 0, 160], tPurple);
    drawFrame(body, 0, 0, bodyAlpha);
    // ③ ai0∈{7,8} 五层重影（:26272-26282）：双轨道,角速 GT·6 / GT·3·(j·0.5)
    if (e.ai0 === 7 || e.ai0 === 8) {
      const n9 = num7 * num7;
      for (let j = 0; j < 5; j++) {
        const a1 = j * (Math.PI * 2) / 5 + GT * 6;
        const a2 = j * (Math.PI * 2) / 5 + GT * 3 * (j * 0.5);
        const R1 = 80 * n9, R2 = 80 * n9 + 30 * j * n9;
        const dx = Math.cos(a1) * R1 + Math.cos(a2) * R2;
        const dy = Math.sin(a1) * R1 + Math.sin(a2) * R2;
        drawFrame(body, dx, dy, bodyAlpha * 0.5);       // color2 × 0.5
      }
    }
    // ④ Extra_245 前层红雾（:26285-26295）：(255,30,30,66)×Opacity×num12×0.25×(1-num7),
    //    num2 层环绕半径 r²×4——原版以【本体帧 rect】画 Extra_245 贴图（整图按帧矩形缩放）
    if (lai3 > 0) {
      const fog = this.atlas!.ensureVImage('vanilla/Extra_245.png');
      if (fog) {
        const num12 = Math.max(0, Math.min(1, lai3 / 20));   // Remap(lai3,0,20,0,1)
        const fa = (66 / 255) * opacity * num12 * 0.25 * (1 - num7);
        const fogT = this.lerpSprite('deer-fog', { img: fog, sx: 0, sy: 0, sw: fog.width, sh: fog.height }, [255, 30, 30], 1);
        for (let k = 0; k < 2; k++) {
          const th = k * Math.PI + GT * 10;
          const R = r2 * 4;
          drawFrame(fogT, -Math.sin(th) * R, Math.cos(th) * R, fa);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 逐像素 Lerp 染色（DrawData Color.Lerp 语义）：白底向 targetRGB 按 t 偏移,
   *  保留源 alpha。缓存键 t 量化 1/64 防连续值打爆。与 tintedSprite(乘法)分职 */
  private lerpSprite(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    target: [number, number, number], t: number,
  ): TintRect | null {
    const tq = Math.round(t * 64) / 64;
    const k = `lerp|${key}|${frame.sx},${frame.sy}|${target.join(',')}|${tq}`;
    const w = Math.max(1, frame.sw), h = Math.max(1, frame.sh);
    return this.tintAtlas.bake(k, w, h, (cx) => {
      cx.drawImage(frame.img as CanvasImageSource, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        px[i] += (target[0] - px[i]) * tq;
        px[i + 1] += (target[1] - px[i + 1]) * tq;
        px[i + 2] += (target[2] - px[i + 2]) * tq;
      }
      cx.putImageData(d, 0, 0);
    });
  }

  private drawMoonLordCore(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const ex13 = this.atlas.vmisc('vanilla/Extra_13.png');
    const ex14 = this.atlas.vmisc('vanilla/Extra_14.png');
    const ex16 = this.atlas.vmisc('vanilla/Extra_16.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 两侧上臂（:24346-24375）
    if (ex14) {
      for (let side = 0; side < 2; side++) {
        // 原版按 npc[whoAmI] 全表扫 ai[2]==side && ai[3]==core.whoAmI（:24346-24353）——
        // 我们的 AI 侧 ai3 = 核心实体 id（bossAI_duke_moonlord.ts moonLordHandAI 同语义）
        const hand = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead
          && n.vanillaId === 397 && n.ai2 === side && n.ai3 === e.id)
          ?? (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead
            && n.vanillaId === 397 && n.ai2 === side && (!n.master || n.master === e));
        if (!hand) continue;
        const [sx] = this.moonLordSideSign(side);
        const shx = e.cx + 220 * sx, shy = e.cy - 60;            // vector26（vector25.Y 恒 1）
        const vx = (hand.cx + 0 - shx) * 0.5;
        const vy = (hand.cy + 76 - shy) * 0.5;                   // vector27
        const ang = this.moonLordArmAngle(Math.hypot(vx, vy), sx);
        let ox = 76; if (side !== 0) ox = ex14.sw - 76;           // origin14（:24360）
        const rot = Math.atan2(vy, vx) - ang - Math.PI / 2;
        ctx.save();
        ctx.translate(shx, shy);
        ctx.rotate(rot);
        if (side !== 0) ctx.scale(-1, 1);                        // FlipHorizontally
        ctx.drawImage(ex14.img, ex14.sx, ex14.sy, ex14.sw, ex14.sh, -ox, -66, ex14.sw, ex14.sh);
        ctx.restore();
      }
    }
    // 躯干左右半（:24378-24379：origin (W,278)/(0,278)，右侧 FlipHorizontally）
    if (ex13) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(ex13.img, ex13.sx, ex13.sy, ex13.sw, ex13.sh, -ex13.sw, -278, ex13.sw, ex13.sh);
      ctx.scale(-1, 1);
      ctx.drawImage(ex13.img, ex13.sx, ex13.sy, ex13.sw, ex13.sh, -ex13.sw, -278, ex13.sw, ex13.sh);
      ctx.restore();
    }
    // 胸甲（:24380 origin (112,101)）
    if (ex16) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(ex16.img, ex16.sx, ex16.sy, ex16.sw, ex16.sh, -112, -101, ex16.sw, ex16.sh);
      ctx.restore();
    }
    // 核心心脏帧（:24381 origin=帧中心）
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const r = this.atlas.vnpc(398, vanillaFrameIdx(e, frames));
    if (r) {
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 月总手 397（case 397 :24391-24447）：前臂 Extra_15（锚=手中心+(0,76)、折角同上臂）
   *  → 眼窝（ai0==-2 闲置帧 Extra_26 行 / 否则 Extra_17 + 椭圆轨道瞳孔 Extra_19）
   *  → 手本体帧（origin (120,180)）。瞳孔轨道用 lai0/lai1（原版 localAI[0]/[1]） */
  private drawMoonLordHand(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const core = ((entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.id === e.ai3 && n.vanillaId === 398)
      ?? (e.master && e.master.vanillaId === 398 ? e.master
        : (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.vanillaId === 398))) ?? null;
    const ex15 = this.atlas.vmisc('vanilla/Extra_15.png');
    const ex17 = this.atlas.vmisc('vanilla/Extra_17.png');
    const ex19 = this.atlas.vmisc('vanilla/Extra_19.png');
    const ex26 = this.atlas.vmisc('vanilla/Extra_26.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const side = e.ai2 === 0 ? 0 : 1;
    const [sx] = this.moonLordSideSign(side);
    ctx.save();
    ctx.globalAlpha = alpha;
    // 前臂（:24418-24431）
    if (ex15 && core) {
      const shx = core.cx + 220 * sx, shy = core.cy - 60;        // vector45
      const ax = e.cx, ay = e.cy + 76;                           // vector46（+(0,76)）
      let vx = shx - ax, vy = shy - ay;
      vx *= 0.5; vy *= 0.5;                                      // v *= 1-num118
      const ang = this.moonLordArmAngle(Math.hypot(vx, vy), sx);
      let ox = 60; if (side !== 0) ox = ex15.sw - 60;            // origin19
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(vy, vx) + ang - Math.PI / 2);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(ex15.img, ex15.sx, ex15.sy, ex15.sw, ex15.sh, -ox, -30, ex15.sw, ex15.sh);
      ctx.restore();
    }
    // 眼窝/瞳孔（:24432-24441）
    if (e.ai0 === -2 && ex26) {
      const fh = Math.floor(ex26.sh / 4);
      const row = Math.min(3, Math.floor(Math.max(0, e.ai1) / 8));
      // 镜像基 = Extra_17 宽(54)−26=28(:24420-24422 vector42 的翻转基是 value45.Width,
      // 即便本分支画的是 Extra_26)——曾误用 Extra_26 宽(46)−26=20,偏 8px(2026-08-19 修)
      let ox = 26; if (side !== 0) ox = 54 - 26;
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(ex26.img, ex26.sx, row * fh, ex26.sw, fh, -ox + 4, -42 + 4, ex26.sw, fh);
      ctx.restore();
    } else {
      if (ex17) {
        let ox = 26; if (side !== 0) ox = ex17.sw - 26;          // vector42
        ctx.save();
        ctx.translate(e.cx, e.cy);
        if (side !== 0) ctx.scale(-1, 1);
        ctx.drawImage(ex17.img, ex17.sx, ex17.sy, ex17.sw, ex17.sh, -ox, -42, ex17.sw, ex17.sh);
        ctx.restore();
      }
      if (ex19) {
        // 椭圆轨道瞳孔：Vector2FromElipse(rot(localAI[0]), (30,66)×localAI[1]) + (−signX,3)。
        // 轨道角/开度由 moonLordHandAI 每帧镜像写入 lai0/lai1（原版 localAI[0]/[1]，
        // 曾存 handOf WeakMap 渲染层不可达 = 瞳孔恒居中隐没，2026-08-19 渲染断链修）。
        // ★椭圆 = Utils.Vector2FromElipse（Utils.cs:948：重参数化 + sizes/2，行程
        // 只有 naive cos/sin 的一半）——曾 naive 令瞳孔甩出掌洞外=双手无瞳(2026-08-19 修)
        const th = e.lai0, k = e.lai1;
        const [ex, ey] = mlElipseVec(th, 30 * k, 66 * k);
        ctx.save();
        ctx.translate(e.cx - sx + ex, e.cy + 3 + ey);
        ctx.drawImage(ex19.img, ex19.sx, ex19.sy, ex19.sw, ex19.sh, -ex19.sw / 2, -ex19.sh / 2, ex19.sw, ex19.sh);
        ctx.restore();
      }
    }
    // 手本体帧（:24442-24443 origin (120,180)）
    const r = this.atlas.vnpc(397, vanillaFrameIdx(e, Math.max(1, e.vanilla?.frames ?? 1)));
    if (r) {
      let ox = 120; if (side !== 0) ox = r.sw - 120;             // origin18
      ctx.save();
      ctx.translate(e.cx, e.cy);
      if (side !== 0) ctx.scale(-1, 1);
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -ox, -180, r.sw, r.sh);
      ctx.restore();
    }
    ctx.restore();
    // ---- SmolBullet 齐射预警（Main.cs:25193-25211,蓝队 R1-03）：ai0==3 槽末
    //      50t 青色星芒+瞄准线;瞳位椭圆 (30,66)×lai1 + vector39=(−sx,3) ----
    if (e.ai0 === 3) {
      const slot = mlSlotDecode(Math.max(0, e.ai1), ML_HAND_ATTACKS[e.ai2 === 0 ? 0 : 1]);
      if (slot.atk === 3) {
        const [ex, ey] = mlElipseVec(e.lai0, 30 * e.lai1, 66 * e.lai1);
        mlSmolBulletWarn(ctx, e.cx, e.cy, ex, ey, -sx, 3, slot.t, slot.dur);
      }
    }
  }

  /** 月总头 396（case 396 :24449-24503）：眼窝（ai0<0 闲置 Extra_26 行 / 否则 Extra_18
   *  + 椭圆瞳孔 Extra_19）→ 头帧（NPC_396 为 3×3 网格、scale 2，帧 0-7 循环）→ 破体
   *  覆层 Extra_29（+(0,4) 旋转，行 = localAI[3]/5）/Extra_25（+(0,214) 旋转，行 =
   *  localAI[2]/7）——localAI[0..3] 由 moonLordHeadAI 镜像 lai0-3；rotation 仅 -3
   *  永闭态写（:37767 lerp π/12，e.spin 承载），活态恒 0（spin 另载瞳角 lai0） */
  /** 491 荷兰飞盗船（Main.cs:24263-24324 case 491 独占 1:1）：
   *  船体 590×534 锚 OriginFlip(208,460)（翻转取 590-208）；vector37.X 随
   *  spriteDirection（vx<0→facing=-1→Flip）；附加件全部随 rotation 旋转：
   *  旗 Extra40 4f@(102,-384) 底中锚 / 桨 Extra41 8f×5@(-96+34i,40) /
   *  帆1 Extra42 4f×2@(158-106i,-302) / 帆2 Extra43 4f×2@(42-178i,-444) /
   *  帆3 Extra44 4f@(-134,-302) / 帆4 Extra45 4f(相位差 2+num112)@(-60,-330) /
   *  炮 NPC_492 九帧（行=ai2 瞄准帧）×4@(-122+68i,-20)。 */
  private drawDutchman(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const hull = this.atlas.ensureVImage('vanilla/NPC_491.png');
    if (!hull || !hull.width) return;
    const vimg = (p: string) => this.atlas!.ensureVImage(p);
    const ex40 = vimg('vanilla/Extra_40.png'), ex41 = vimg('vanilla/Extra_41.png');
    const ex42 = vimg('vanilla/Extra_42.png'), ex43 = vimg('vanilla/Extra_43.png');
    const ex44 = vimg('vanilla/Extra_44.png'), ex45 = vimg('vanilla/Extra_45.png');
    const canSheet = vimg('vanilla/NPC_492.png');
    const ctx = this.ctx;
    const num112 = Math.floor(dutchmanAnim(e) / 8);          // :24272 localAI[3]/8
    const flip = e.facing === -1;                            // spriteDirection==1→Flip（vx<0）
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.cx, e.cy);
    ctx.rotate(e.visAngle);                                  // rotation = vx*0.025
    if (flip) ctx.scale(-1, 1);
    // 船体（:24265-24271）
    ctx.drawImage(hull, -208, -460, hull.width, hull.height);
    // 旗（:24272-24276）：4 帧 56×44，底中锚 (28,176)
    if (ex40?.width) {
      const f = num112 % 4;
      ctx.drawImage(ex40, f * 56, 0, 56, 176, 102 - 28, -384 - 176, 56, 176);
    }
    // 桨（:24277-24283）：8 帧 60×88，循环 5 次
    if (ex41?.width) {
      const f = num112 % 8;
      for (let i = 0; i < 5; i++) {
        ctx.drawImage(ex41, f * 60, 0, 60, 88, -96 + 34 * i, 40, 60, 88);
      }
    }
    // 帆1/2（:24284-24297）×2；帆3（:24298-24301）；帆4（:24302-24305，相位差帧）
    const sail = (img: ImageBitmap | HTMLImageElement | null, fw: number, fh: number, dx: number, dy: number, frame: number) => {
      if (!img?.width) return;
      ctx.drawImage(img, (frame % 4) * fw, 0, fw, fh, dx, dy, fw, fh);
    };
    for (let i = 0; i < 2; i++) sail(ex42, 72, 160, 158 - 106 * i, -302, num112 % 4);
    for (let i = 0; i < 2; i++) sail(ex43, 48, 90, 42 - 178 * i, -444, num112 % 4);
    sail(ex44, 52, 112, -134, -302, num112 % 4);
    sail(ex45, 142, 152, -60, -330, 2 + num112);
    // 炮代画（:24306-24322）：船 ai[0..3]=炮实体 id；NPC_492 Frame(1,9)=48×48/帧
    if (canSheet?.width) {
      for (let i = 0; i < 4; i++) {
        const cid = [e.ai0, e.ai1, e.ai2, e.ai3][i];
        const c = (entities as Enemy[]).find((n) => n instanceof Enemy && n.id === cid && !n.dead);
        if (!c) continue;
        const row = Math.max(0, Math.min(8, Math.round(c.ai2)));
        ctx.drawImage(canSheet, 0, row * 48, 48, 48, -122 + 68 * i - 24, -20 - 10, 48, 48);
      }
    }
    ctx.restore();
  }

  private drawMoonLordHead(e: Enemy) {
    if (!this.atlas) return;
    const ex18 = this.atlas.vmisc('vanilla/Extra_18.png');
    const ex19 = this.atlas.vmisc('vanilla/Extra_19.png');
    const ex25 = this.atlas.vmisc('vanilla/Extra_25.png');
    const ex26 = this.atlas.vmisc('vanilla/Extra_26.png');
    const ex29 = this.atlas.vmisc('vanilla/Extra_29.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const flip = e.facing > 0;
    // npc.rotation：仅 -3 永闭态由 AI 写（lerp π/12），活态恒 0（e.spin 另载瞳角）
    const rot = e.ai0 === -3 ? e.spin : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (e.ai0 < 0 && ex26) {
      const fh = Math.floor(ex26.sh / 4);
      const row = Math.min(3, Math.floor(Math.max(0, e.ai1) / 8));
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex26.img, ex26.sx, row * fh, ex26.sw, fh, -(19 + 4), -(34 + 4), ex26.sw, fh);
      ctx.restore();
    } else {
      if (ex18) {
        ctx.save();
        ctx.translate(e.cx, e.cy);
        ctx.rotate(rot);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(ex18.img, ex18.sx, ex18.sy, ex18.sw, ex18.sh, -19, -34, ex18.sw, ex18.sh);
        ctx.restore();
      }
      if (ex19) {
        // 瞳孔椭圆 = Vector2FromElipse((27,59)×localAI[1])（Main.cs:24464 + Utils.cs:948
        // 重参数化 + sizes/2）——naive 实现行程 ×2 令头瞳孔(cy+58)整个甩进脸后
        // = 眼窝恒空(2026-08-19 修;真值行程 max(13.5,29.5),俯视时半露于洞底 cy+32)
        const th = e.lai0, k = e.lai1;
        const [ex, ey] = mlElipseVec(th, 27 * k, 59 * k);
        ctx.save();
        ctx.translate(e.cx + ex, e.cy + ey);
        ctx.rotate(rot);
        ctx.drawImage(ex19.img, ex19.sx, ex19.sy, ex19.sw, ex19.sh, -ex19.sw / 2, -ex19.sh / 2, ex19.sw, ex19.sh);
        ctx.restore();
      }
    }
    // 头帧：NPC_396.png 573×804 = 3 列 × 3 行（Frame(3,3, frame.Y/3, frame.Y%3)），
    // origin (95.5,65)、scale 2；帧 0-7（FindFrame case 396 = vanillaFrameIdx 396 档）
    const head = this.atlas.ensureVImage('vanilla/NPC_396.png');
    if (head) {
      const fw = Math.floor(head.width / 3), fh2 = Math.floor(head.height / 3);
      const idx = vanillaFrameIdx(e, 8);
      const col = Math.floor(idx / 3), row = idx % 3;
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      // XNA origin 施加 scale：有效偏移 = origin×scale = (95.5,65)×2 = (191,130)
      // （曾写 -95.5,-65 少乘 scale = 脸贴图右/上偏 95.5/65px，用户报"左偏+下偏"）
      ctx.drawImage(head, col * fw, row * fh2, fw, fh2, -191, -130, fw * 2, fh2 * 2);
      ctx.restore();
    }
    // 破体覆层（:24499-24501）：Extra_29 行 = localAI[3]/5（lai3）、Extra_25 行 =
    // localAI[2]/7（lai2）；锚 (0,4)/(0,214).RotatedBy(rotation)，位置 .Floor()
    if (ex29) {
      const fh = Math.floor(ex29.sh / 4);
      const row = Math.min(3, Math.max(0, Math.floor(e.lai3 / 5)));
      const c = Math.cos(rot), s = Math.sin(rot);
      const ox = 0 * c - 4 * s, oy = 0 * s + 4 * c;
      ctx.save();
      ctx.translate(Math.floor(e.cx + ox), Math.floor(e.cy + oy));
      ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex29.img, ex29.sx, row * fh, ex29.sw, fh, -ex29.sw / 2, -fh / 2, ex29.sw, fh);
      ctx.restore();
    }
    if (ex25) {
      const fh = Math.floor(ex25.sh / 3);
      const row = Math.min(2, Math.max(0, Math.floor(e.lai2 / 7)));
      const c = Math.cos(rot), s = Math.sin(rot);
      const ox = 0 * c - 214 * s, oy = 0 * s + 214 * c;
      ctx.save();
      ctx.translate(Math.floor(e.cx + ox), Math.floor(e.cy + oy));
      ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(ex25.img, ex25.sx, row * fh, ex25.sw, fh, -ex25.sw / 2, -fh / 2, ex25.sw, fh);
      ctx.restore();
    }
    ctx.restore();
    // ---- 战斗预警（Main.cs:25262-25307,蓝队 R1-03）：ai0==3 SmolBullet 齐射
    //      星芒+瞄准线(瞳椭圆 (27,59),vector46=(0,0));ai0==1 死光蓄能星芒
    //      (Remap(t,0,180) 包络,双画) ----
    if (e.ai0 === 3 || e.ai0 === 1) {
      const slot = mlSlotDecode(Math.max(0, e.ai1), ML_HEAD_ATTACKS);
      if (slot.atk === 3 && e.ai0 === 3) {
        const [ex, ey] = mlElipseVec(e.lai0, 27 * e.lai1, 59 * e.lai1);
        mlSmolBulletWarn(ctx, e.cx, e.cy, ex, ey, 0, 0, slot.t, slot.dur);
      } else if (slot.atk === 1 && e.ai0 === 1) {
        const [ex, ey] = mlElipseVec(e.lai0, 27 * e.lai1, 59 * e.lai1);
        mlMoonLordChargeSparkle(ctx, e.cx, e.cy, ex, ey, slot.t, 'head');
      }
    }
  }

  /** 月总游离眼 400（Main.cs:24492-24504 case 400 独占，1:1）：本体 NPC_400 帧
   *  （FindFrame case 400 = vanillaFrameIdx 400 档，0-3）随 rotation（origin
   *  (40,40)）+ 镜像翻转；瞳孔 Extra_19 = Center + 椭圆((30,30)×localAI[1])
   *  @localAI[0] 角、origin 尺寸/2、整体 scale = localAI[2]（0.4-1.15 脉动）、
   *  随 rotation 旋转、不镜像（SpriteEffects.None） */
  private drawMoonLordFreeEye(e: Enemy) {
    if (!this.atlas) return;
    const ex19 = this.atlas.vmisc('vanilla/Extra_19.png');
    const ctx = this.ctx;
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const flip = e.facing > 0;
    const rot = e.spin;                       // AI_081 攻击 2/3 写 npc.rotation（余态保值）
    // 本体（:24497）
    const r = this.atlas.vnpc(400, vanillaFrameIdx(e, Math.max(1, e.vanilla?.frames ?? 1)));
    if (r) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(e.cx, e.cy);
      ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -40, -40, r.sw, r.sh);
      ctx.restore();
    }
    // 瞳孔（:24498-24503）——Vector2FromElipse((30,30)×localAI[1])：圆情形 = 半径/2×单位向量
    if (ex19) {
      const th = e.lai0, k = e.lai1, sc = e.lai2;   // scale = localAI[2]（出生 0 渐入 1）
      const [ex, ey] = mlElipseVec(th, 30 * k, 30 * k);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(e.cx + ex, e.cy + ey);
      ctx.rotate(rot);
      ctx.drawImage(ex19.img, ex19.sx, ex19.sy, ex19.sw, ex19.sh,
        (-ex19.sw / 2) * sc, (-ex19.sh / 2) * sc, ex19.sw * sc, ex19.sh * sc);
      ctx.restore();
      // ---- 战斗预警（Main.cs:25337-25379,蓝队 R1-03）：ai0==1 SmolBullet 齐射
      //      星芒+瞄准线(表源 MoonLordAttacksArray2,无附加偏移);ai0==4 死光
      //      蓄能双星芒(Remap(t,0,180) 包络) ----
      if (e.ai0 === 1 || e.ai0 === 4) {
        const slot = mlSlotDecode(Math.max(0, e.ai1), ML_EYE_ATTACKS);
        if (slot.atk === 1 && e.ai0 === 1) {
          mlSmolBulletWarn(ctx, e.cx, e.cy, ex, ey, 0, 0, slot.t, slot.dur);
        } else if (slot.atk === 4 && e.ai0 === 4) {
          mlMoonLordChargeSparkle(ctx, e.cx, e.cy, ex, ey, slot.t, 'eye');
        }
      }
    }
  }

  // ===================== 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554） =====================
  /** 女皇手臂帧（GetHallowBossArmFrame :26554-26640）：攻击态 ai0 × 计时 ai1 → 帧 0..6
   *  （0 垂放/1 抬/2 举/3 蓄/4 施法/5 后摆/6 前刺） */
  private empressArmFrames(e: Enemy): [number, number] {
    const t = e.ai1;
    let left = 0, right = 0;
    switch (e.ai0) {
      case 6: left = right = t < 6 ? 3 : t < 174 ? 4 : t < 180 ? 0 : 3; break;
      case 0: left = right = t < 106 ? 1 : t < 110 ? 0 : 3; break;
      case 2: case 11: left = t < 5 ? 3 : t < 65 ? 4 : 3; break;
      case 5: right = t < 6 ? 3 : t < 54 ? 4 : 3; break;
      case 4: case 10: left = right = t < 6 ? 3 : t < 54 ? 4 : 3; break;
      case 8: case 9: {
        const base = t < 10 ? 3 : t < 20 ? 4 : t < 30 ? 6 : 3;
        left = right = base;
        break;
      }
      case 7: {
        const num10 = 60; const num11 = 0; const num12 = 5;
        if (t < num11 + num12) left = 3;
        else if (t < num11 + num10) left = 4;
        else if (t < num11 + num10 + num12) { left = 4; right = 3; }
        else if (t < num11 + 2 * num10) { left = 4; right = 4; }
        else if (t < num11 + 3 * num10) { left = 5; right = 4; }
        else if (t < num11 + 4 * num10) { left = 5; right = 5; }
        else left = 5;
        break;
      }
      default: break;
    }
    return [left, right];
  }

  /** 女皇绘制：背后大翼 Extra_159（1×11 帧按 localAI[0]/4 推进、scale×2）→ 着色器层
   *  Extra_157（原版 HallowBoss 像素着色器；此处直画贴图近似，登记）→ 本体 NPC_636
   *  帧（二阶段 ai3∈{1,3} → 帧 1，FindFrame cs:67678）→ 二阶段翅膀覆层 Extra_187
   *  （1×8 帧 + 4 向相位轨道残影）+ 头冠 Extra_188（4 向残影）→ 双臂 Extra_158/160。
   *  攻击态 8/9/10 的彩虹残影环（:26394-26487）：整组精灵在多份偏移位重画——
   *  8/9 为 hsl 彩虹 3D 轨道环（RotX·RotY·RotZ 变换 Forward 向量取 (X,Y) 平面分量，
   *  num10=200+LerpValue(−1,1,Z)×150、整体再 RotatedBy(ai1/180·2π)）+ i>3 的速度
   *  反向尾迹 4 份；10 为 8 向轮辐（≥90t 椭圆 (600,150)·num7、<90t 横排 200i）。
   *  颜色 A/=3（预乘语义 → destination-out 削底 + lighter 加色两步还原）。
   *  原版 AI_120 不写 npc.rotation（grep 实证）——旋转项以 facing 镜像为准 */
  private drawEmpress(e: Enemy) {
    if (!this.atlas) return;
    const ctx = this.ctx;
    const phase2 = e.ai3 === 1 || e.ai3 === 3;                    // AI_120_HallowBoss_IsInPhase2 (NPC.cs:46160)
    const alpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
    const flip = e.facing > 0;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const wing = this.atlas.vmisc('vanilla/Extra_159.png');
    const shader = this.atlas.vmisc('vanilla/Extra_157.png');
    const armL = this.atlas.vmisc('vanilla/Extra_158.png');
    const armR = this.atlas.vmisc('vanilla/Extra_160.png');
    const wing2 = this.atlas.vmisc('vanilla/Extra_187.png');
    const crown = this.atlas.vmisc('vanilla/Extra_188.png');
    const body = this.atlas.vnpc(636, phase2 ? 1 : 0);
    const frameAt = (r: NonNullable<ReturnType<SpriteAtlas['vmisc']>>, rows: number, idx: number) => {
      const fh = Math.floor(r.sh / rows);
      return { r, fh, idx: Math.min(rows - 1, Math.max(0, idx)) };
    };
    const lv = Renderer.glowLerpValue;
    const wingFrame = Math.floor(e.animT / 4) % 11;
    const [lf, rf] = this.empressArmFrames(e);
    // 残影层集（:26442-26486）：wing×2 + 着色器层 + [二阶段 Extra_187] + 本体 +
    // 帧 5 施法臂（num2/num3 = 臂帧==5 时画）。每层独立 (sx,sy,sw,sh,目标矩形,mult)
    type GhostLayer = { src: NonNullable<ReturnType<SpriteAtlas['vmisc']>>; rows: number; idx: number; dw: number; dh: number };
    const ghostLayers: GhostLayer[] = [];
    if (wing) ghostLayers.push({ src: wing, rows: 11, idx: wingFrame, dw: wing.sw * 2, dh: Math.floor(wing.sh / 11) * 2 });
    if (shader) ghostLayers.push({ src: shader, rows: 11, idx: wingFrame, dw: shader.sw * 2, dh: Math.floor(shader.sh / 11) * 2 });
    const paintGhost = (px: number, py: number, tint: [number, number, number], addA: number, fadeA: number) => {
      if (addA <= 0.01) return;
      ctx.save();
      ctx.translate(px, py);
      if (flip) ctx.scale(-1, 1);
      ctx.scale(scale, scale);
      const twoPass = (src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number, dw: number, dh: number, tinted: TintRect | null) => {
        // A/=3 预乘语义：destination-out 削底（fadeA=A/255）→ lighter 加色（tint×addA）
        if (fadeA > 0.01) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = Math.max(0, Math.min(1, fadeA));
          ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
        }
        ctx.globalCompositeOperation = 'lighter';
        if (tinted) {
          ctx.globalAlpha = Math.max(0, Math.min(1, addA));
          ctx.drawImage(tinted.c, tinted.x, tinted.y, tinted.w, tinted.h, dx, dy, dw, dh);
        }
      };
      const tq = `${tint[0]},${tint[1]},${tint[2]}`;
      for (const L of ghostLayers) {
        const fh = Math.floor(L.src.sh / L.rows);
        const tinted = this.tintedSprite(`emp|${L.src.sx}x${L.src.sw}x${L.src.sh}|${L.idx * fh}|${tq}`,
          { img: L.src.img, sx: L.src.sx, sy: L.idx * fh, sw: L.src.sw, sh: fh }, tint);
        twoPass(L.src.img, L.src.sx, L.idx * fh, L.src.sw, fh, -L.dw / 2, -L.dh / 2, L.dw, L.dh, tinted);
      }
      if (body) {
        const tinted = this.tintedSprite(`emp|body|${body.sx},${body.sy}|${tq}`,
          { img: body.img, sx: body.sx, sy: body.sy, sw: body.sw, sh: body.sh }, tint);
        twoPass(body.img, body.sx, body.sy, body.sw, body.sh, -body.sw / 2, -body.sh / 2, body.sw, body.sh, tinted);
      }
      if (phase2 && wing2) {
        const f2 = frameAt(wing2, 8, Math.floor(e.animT / 4) % 8);
        const tinted = this.tintedSprite(`emp|187|${f2.idx * f2.fh}|${tq}`,
          { img: f2.r.img, sx: f2.r.sx, sy: f2.idx * f2.fh, sw: f2.r.sw, sh: f2.fh }, tint);
        twoPass(f2.r.img, f2.r.sx, f2.idx * f2.fh, f2.r.sw, f2.fh, -f2.r.sw / 2, -f2.fh / 2, f2.r.sw, f2.fh, tinted);
      }
      // 帧 5 施法臂（j==num2/num3 → 臂帧==5 才入残影 :26378-26486）
      for (const [arm, frame] of [[armL, lf], [armR, rf]] as Array<[ReturnType<SpriteAtlas['vmisc']>, number]>) {
        if (!arm || frame !== 5) continue;
        const f = frameAt(arm, 7, frame);
        const tinted = this.tintedSprite(`emp|arm|${f.idx * f.fh}|${tq}`,
          { img: f.r.img, sx: f.r.sx, sy: f.idx * f.fh, sw: f.r.sw, sh: f.fh }, tint);
        twoPass(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh, -f.r.sw / 2, -f.fh / 2, f.r.sw, f.fh, tinted);
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };
    // num14：正弦脉动 0..1（:26500），二阶段轨道半径 Lerp(2,8)
    const pulse = Math.sin((performance.now() / 1000) * Math.PI * 2 * 0.5) * 0.5 + 0.5;
    // ---- 攻击态 8/9/10 残影环（:26394-26441 包络 + :26442-26487 环体）----
    const atk = e.ai0;
    let num4 = 1;                                   // color ×= num4（:26394/26411）
    let num5 = 0, num6 = 0;                         // 环界：i ∈ [−num6, num6+num5]
    let e7 = 0, e8 = 0, e9 = 0;                     // 各态 num7/8/9 包络
    if (atk === 8 || atk === 9) {
      e7 = lv(0, 30, e.ai1) * lv(90, 30, e.ai1);
      e8 = lv(0, 30, e.ai1) * lv(90, 70, e.ai1);
      e9 = lv(0, 15, e.ai1) * lv(45, 30, e.ai1);
      num4 = 1 - e9; num5 = 4; num6 = 3;
    } else if (atk === 10) {
      e7 = lv(30, 90, e.ai1) * lv(165, 90, e.ai1);
      e8 = lv(0, 60, e.ai1) * lv(180, 120, e.ai1);
      e9 = e8;
      num4 = 1 - e9; num6 = 4;
    }
    if (num5 + num6 > 0) {
      const tSec = performance.now() / 1000;        // timeForVisualEffects/60（连续钟近似）
      const WHITE: [number, number, number] = [255, 255, 255];
      for (let i = -num6; i <= num6 + num5; i++) {
        if (i === 0) continue;
        let px = e.cx, py = e.cy;
        let tint: [number, number, number] = WHITE;
        let addA = 0, fadeA = 0;
        if (atk === 8 || atk === 9) {
          // 彩虹 3D 轨道（:26445-26456）：v2 = Forward×RotX(a)·RotY(b)·RotZ(c)
          const a = (tSec - 0.3 + i * 0.1) * 0.7 * Math.PI * 2;
          const b = (tSec - 0.8 + i * 0.3) * 0.7 * Math.PI * 2;
          const c = (tSec + i * 0.5) * 0.1 * Math.PI * 2;
          const vz = -Math.cos(a) * Math.cos(b);
          const vx = -Math.cos(a) * Math.sin(b) * Math.cos(c) - Math.sin(a) * Math.sin(c);
          const vy = -Math.cos(a) * Math.sin(b) * Math.sin(c) + Math.sin(a) * Math.cos(c);
          const num10 = 200 + lv(-1, 1, vz) * 150;
          const spin = (Math.PI * 2) * e.ai1 / 180; // RotatedBy(ai1/180·2π)
          const ox = (vx * num10 * e7) * Math.cos(spin) - (vy * num10 * e7) * Math.sin(spin);
          const oy = (vx * num10 * e7) * Math.sin(spin) + (vy * num10 * e7) * Math.cos(spin);
          px += ox; py += oy;
          const lum = 0.5 + 0.5 * lv(90, 0, e.ai1); // Lerp(0.5,1,LerpValue(90,0,ai1))
          const hue = (i + 5) / 10;
          const rgb = Renderer.glowHslToRgb(hue, 1, lum);
          tint = [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
          addA = 0.8 * e8;
          fadeA = (204 * e8 / 3) / 255;             // color2.A = 255×0.8×num8 /3
        } else {
          // 态 10（:26458-26470）
          if (e.ai1 >= 90) {
            const t90 = tSec * 60 / 90;             // timeForVisualEffects/90
            const n13 = i < 0 ? i + 1 : i;
            const ang = (n13 + 0.5) * (Math.PI / 4) + Math.PI * 2 * t90;
            px += Math.cos(ang) * 600 * e7;
            py += Math.sin(ang) * 150 * e7;
          } else {
            px += 200 * i * e7;
          }
          addA = 0.8 * e8 * num4;
          fadeA = (255 * 0.8 * e8 * num4 / 3) / 255;
        }
        // i>num6 的速度尾迹（:26471-26477，仅 8/9 有 num5=4）
        if (i > num6) {
          const lv2 = lv(30, 70, e.ai1);
          if (lv2 === 0) continue;
          px = e.cx - e.vx * 3 * (i - 4) * lv2;
          py = e.cy - e.vy * 3 * (i - 4) * lv2;
          addA *= 1 - e9;
          fadeA *= 1 - e9;
        }
        paintGhost(px, py, tint, addA, fadeA);
      }
    }
    ctx.save();
    ctx.translate(e.cx, e.cy);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    // 攻击态主体色链（:26396-26397/26411-26413）：color = Lerp(color,White,num7)、
    // color ×= num4(=1−num9)。RGB 缩放的精确 canvas 等价 = lighter 白版叠画（本仓
    // 通用近似：num4 折进 globalAlpha——dst 衰减随之 ×num4，偏差 ≤num9·背景亮度）
    const dimA = num4;
    const whiteA = e7;
    const paintMain = (
      src: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
      dx: number, dy: number, dw: number, dh: number, key: string,
    ) => {
      ctx.globalAlpha = alpha * dimA;
      ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, dx, dy, dw, dh);
      if (whiteA > 0.01) {
        const wt = this.tintedSprite(`empW|${key}`, src, [255, 255, 255]);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * whiteA;
        if (wt) ctx.drawImage(wt.c, wt.x, wt.y, wt.w, wt.h, dx, dy, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    // 背后大翼（:26481 scale×2）
    if (wing) {
      const f = frameAt(wing, 11, wingFrame);
      paintMain({ img: f.r.img, sx: f.r.sx, sy: f.idx * f.fh, sw: f.r.sw, sh: f.fh },
        -f.r.sw, -f.fh, f.r.sw * 2, f.fh * 2, `wing|${f.idx}`);
    }
    if (shader) {
      const f = frameAt(shader, 11, wingFrame);
      paintMain({ img: f.r.img, sx: f.r.sx, sy: f.idx * f.fh, sw: f.r.sw, sh: f.fh },
        -f.r.sw, -f.fh, f.r.sw * 2, f.fh * 2, `shd|${f.idx}`);
    }
    // 本体（FindFrame：二阶段帧 1）
    if (body) paintMain(body, -body.sw / 2, -body.sh / 2, body.sw, body.sh, `body|${body.sy}`);
    // 二阶段：翅膀覆层 + 4 向轨道残影（:26509-26524）
    if (phase2 && wing2) {
      const f = frameAt(wing2, 8, Math.floor(e.animT / 4) % 8);
      const drawW2 = (dx: number, dy: number, a: number) => {
        ctx.save();
        ctx.globalAlpha = alpha * a;
        ctx.drawImage(f.r.img, f.r.sx, f.idx * f.fh, f.r.sw, f.fh,
          -f.r.sw / 2 + dx, -f.fh / 2 + dy, f.r.sw, f.fh);
        ctx.restore();
      };
      drawW2(0, 0, 1);
      const rad = 2 + 6 * pulse;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        drawW2(Math.cos(a) * rad, Math.sin(a) * rad, 0.6 * (0.4 + 0.6 * pulse));
      }
      if (crown) {
        const drawCr = (dx: number, dy: number, a: number) => {
          ctx.save();
          ctx.globalAlpha = alpha * a;
          ctx.drawImage(crown.img, crown.sx, crown.sy, crown.sw, crown.sh,
            -crown.sw / 2 + dx, -crown.sh / 2 + dy, crown.sw, crown.sh);
          ctx.restore();
        };
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          drawCr(Math.cos(a) * rad, Math.sin(a) * rad, 0.6 * (0.4 + 0.6 * pulse));
        }
      }
    }
    // 双臂（帧表按攻击态）
    if (armL) {
      const f = frameAt(armL, 7, lf);
      paintMain({ img: f.r.img, sx: f.r.sx, sy: f.idx * f.fh, sw: f.r.sw, sh: f.fh },
        -f.r.sw / 2, -f.fh / 2, f.r.sw, f.fh, `armL|${f.idx}`);
    }
    if (armR) {
      const f = frameAt(armR, 7, rf);
      paintMain({ img: f.r.img, sx: f.r.sx, sy: f.idx * f.fh, sw: f.r.sw, sh: f.fh },
        -f.r.sw / 2, -f.fh / 2, f.r.sw, f.fh, `armR|${f.idx}`);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ===================== 塔护盾 ForceField（Main.cs:23797-23846） =====================
  /** 分塔 Perlin 纹理缓存：原版 = Misc/Perlin（512×512）以 600×600 PointWrap 采样进
   *  ForceField 像素着色器（Filters.Scene[塔名] 分塔预设色 + UseColor(1+flash*0.5)）。
   *  Canvas 无着色器——预生成分塔着色 Perlin 纹理作近似载体（噪声本身 1:1 原版贴图，
   *  分塔色预设对齐 TOWER_SHIELD_COLOR；着色器的流动/边缘扫描线未还原，登记） */
  private towerShieldTexCache = new Map<string, HTMLCanvasElement>();
  private towerShieldTex(key: string, col: string, bright = 1): HTMLCanvasElement | null {
    if (!this.atlas) return null;
    const ck = `${key}|${bright.toFixed(2)}`;
    const hit = this.towerShieldTexCache.get(ck);
    if (hit) return hit;
    const perlin = this.atlas.ensureVImage('vanilla/Misc_Perlin.png');
    if (!perlin) return null;
    const c = document.createElement('canvas');
    c.width = 600; c.height = 600;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    // PointWrap 采样语义：源 512×512 → 目标 600×600 单次放大（右/下 88px 由 wrap 补，
    // 此处以源左上 88px 接续，观感与噪声连续性无差）
    cx.drawImage(perlin, 0, 0, 512, 512, 0, 0, 600, 600);
    const [r, g, b] = col.split(',').map((n) => Math.min(255, Math.round(Number(n) * bright)));
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, 600, 600);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(c, 0, 0);
    this.towerShieldTexCache.set(ck, c);
    if (this.towerShieldTexCache.size > 16) {
      const first = this.towerShieldTexCache.keys().next().value;
      if (first !== undefined) this.towerShieldTexCache.delete(first);
    }
    return c;
  }

  /** 塔护盾（Main.cs:23802-23831 盾存分支 + :23832-23846 盾破碎裂分支）：
   *  alpha = ratio*0.8+0.2、scale×(1+flash*0.05)、着色 UseColor(1+flash*0.5)；
   *  盾破（shield==0 且 ai3>0）：progress=ai3/120、color alpha=1-√(min(ai3/30,1))、
   *  scale×(1+num268)——膨胀渐隐的碎裂残罩 */
  private drawTowerShield(e: Enemy, world: World) {
    const key = TOWER_KEY[e.vanillaId ?? -1];
    if (!key) return;
    const ctx = this.ctx;
    const col = TOWER_SHIELD_COLOR[e.vanillaId!];
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const shield = world.lunarEvent.shield[key];
    let alpha: number, size: number, bright: number;
    if (shield > 0) {
      const ratio = shield / shieldMax(world);
      let flash = 0;
      if (e.ai3 > 0 && e.ai3 <= 30) flash = 1 - e.ai3 / 30;   // :23803-23806
      alpha = Math.min(1, ratio * 0.8 + 0.2);
      size = 600 * scale * (1 + flash * 0.05);
      bright = 1 + flash * 0.5;
    } else if (e.ai3 > 0) {
      // 盾破碎裂环（:23832-23845）
      const num267 = e.ai3 / 120;
      const num268 = Math.min(e.ai3 / 30, 1);
      alpha = 1 - Math.sqrt(num268);
      size = 600 * scale * (1 + num268);
      bright = 2;                                               // UseColor(new Vector3(2f))
      void num267;                                              // 着色器 progress（未还原，登记）
    } else return;
    if (alpha <= 0.01) return;
    const tex = this.towerShieldTex(key, col, bright);
    if (!tex) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tex, e.cx - size / 2, e.cy - size / 2 + 10 * scale, size, size);
    ctx.restore();
  }

  /** 568/569 出生态紫雾（Main.cs:25899-25907 参数 + 拷贝循环 :26060-26076）：
   *  localAI[3]<60 期间 3 份【本体贴图】拷贝绕盒心收敛（num301×num300=8→0），
   *  加性紫(127,0,255,0)×num315²（A 恒 0 → 'lighter'，同轨道族 copyFade 惯例）。
   *  调用点在 drawEnemy 本体 drawImage 之前（原版拷贝循环先于 vector72 本体层）
   *  → 本体压住紫雾。num47=−3 的整体上移与轨道族共用（:25898）。 */
  private drawWitherBirth(
    ctx: CanvasRenderingContext2D,
    e: Enemy,
    r: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    scale: number,
  ) {
    const prm = Renderer.npcWitherBirthParams(witherBeastLocal(e)[1]);
    if (!prm) return;
    const mist = this.tintedSprite(`npc${e.vanillaId}:birth`, r, [127, 0, 255]);
    const cy = -3 / scale;   // num47=-3（DrawNPC switch :23474-23476 绘制侧覆写）;中心锚后原点即盒心
    const prevOp = ctx.globalCompositeOperation;
    const prevA = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < prm.count; i++) {
      const ang = (i / prm.count) * Math.PI * 2;
      const dx = (Math.cos(ang) * prm.radius) / scale;
      const dy = (Math.sin(ang) * prm.radius) / scale;
      ctx.globalAlpha = Math.max(0, Math.min(1, prm.fade));
      if (mist) ctx.drawImage(mist.c, mist.x, mist.y, mist.w, mist.h,
        -r.sw / 2 + dx, cy - r.sh / 2 + dy, r.sw, r.sh);
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevA;
  }

  /** 568/569 死亡紫魂环（Main.cs:26130-26155）：localAI[0]>0（灵气态计数，AI_107
   *  cs:63882 每 tick +1）期间 Extra_89 ×16 份 @半径 400×num323 绕盒心慢旋
   *  （num324=π/750·lai0），每份旋转 = 极角+π、中心锚、SpriteEffects.None——
   *  故在实体镜像变换外画（drawEnemy ctx.restore 之后，同 drawTowerShield 段）。
   *  色 = (180,90,255,A)×0.75（A 有值 → 普通 alpha 混合，非加性）。 */
  private drawWitherSoulRing(e: Enemy) {
    if (!this.atlas) return;
    const prm = Renderer.npcSoulRingParams(witherBeastLocal(e)[0]);
    if (!prm) return;
    const img = this.atlas.ensureVImage('vanilla/Extra_89.png');
    if (!img || !(img.width > 0) || img.width === 0) return;
    const ctx = this.ctx;
    // fade 量化 1/32 进染色键（连续值会打爆 tintCache；33 档上界有界）
    const q = Math.round(prm.fade * 32) / 32;
    const soul = this.tintedSprite(`extra89soul|q${q}`, {
      img, sx: 0, sy: 0, sw: img.width, sh: img.height,
    }, [135 * q, 67 * q, 191 * q]);   // (180,90,255)×0.75 截整，再 ×fade（XNA src 项）
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < prm.count; i++) {
      const ang = prm.angle0 + (Math.PI * 2 * i) / prm.count;
      const px = e.cx + Math.cos(ang) * prm.radius;
      const py = e.cy + Math.sin(ang) * prm.radius;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, prm.alpha));
      ctx.translate(px, py);
      ctx.rotate(ang + Math.PI);
      ctx.scale(prm.scale, prm.scale);
      if (soul) ctx.drawImage(soul.c, soul.x, soul.y, soul.w, soul.h, -img.width / 2, -img.height / 2, img.width, img.height);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** AI_013 植物/攀爬者族茎蔓（Main.cs:22433-22514 1:1）：从 NPC 中心向锚点格
   *  中心（ai0/ai1 各 ×16+8）逐段画 Chain 贴图——步长 28px、距锚 <40px 时尾段
   *  缩短对齐（259/260 真菌球为 12/20）；整链 rotation=atan2(dy,dx)-π/2（贴图
   *  正面向上）。贴图分流（:22480-22510）：56→Chain5、175→Chain14、259/260→
   *  Chain24/25，默认（43 食人怪）→Chain4。光照由 compositeLight 全屏合成，
   *  此处不逐段取光。
   *  邪恶触手 101 是独占分支（:22391-22432，先于 aiStyle 13 判定）：Chain10/
   *  Chain11 交替段、scale 0.75、步进 15px（20×0.75）、终止 21px（28×0.75）、
   *  尾段高 = dist-40+28（与终止阈值解耦，绘制高 28 恒定——段间有意重叠） */
  private drawPlantVine(e: Enemy) {
    if (!this.atlas || e.ai0 < 0 || e.ai1 < 0) return;
    const ctx = this.ctx;
    const ax = e.ai0 * 16 + 8, ay = e.ai1 * 16 + 8;
    let px = e.cx, py = e.cy;
    let dx = ax - px, dy = ay - py;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    // Clinger 101 独占分支（:22391-22432）
    if (e.vanillaId === 101) {
      const c10 = this.atlas.vmisc('vanilla/Chain10.png');
      const c11 = this.atlas.vmisc('vanilla/Chain11.png');
      if (!c10 || !c11) return;
      const s = 0.75;                                // num3
      let alt = true;                                // flag3：首段走 else → Chain11
      let running = true;
      let guard = 0;
      while (running && guard++ < 200) {
        let h = 28;                                  // 绘制高（恒 28，尾段除外）
        const dist = Math.hypot(dx, dy);
        if (dist < 28 * s) { h = dist - 40 + 28; running = false; }
        if (dist > 0 && h > 0) {
          const k = 20 * s / dist;                   // 步进 15px
          px += dx * k; py += dy * k;
          dx = ax - px; dy = ay - py;
          const c = alt ? c11 : c10; alt = !alt;
          const sh = Math.min(h, c.sh);              // 源矩形越界钳（XNA 同）
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          ctx.drawImage(c.img, c.sx, c.sy, c.sw, sh, -c.sw * s / 2, -c.sh * s / 2, c.sw * s, sh * s);
          ctx.restore();
        } else {
          running = false;
        }
      }
      return;
    }
    const id = e.vanillaId;
    // 259/260 强制亮彩族（:22467-22477 下限色）不走主 pass——compositeLight 全屏
    // 乘光会把 (max(R,100),max(G,150),255) 下限压回黑暗；延后到光照合成后的
    // drawBrightVines（render 7c 钩子）绘制
    if (id === 259 || id === 260) return;
    // num7/num8：段长/终止距离（Main.cs:22442-22447）
    let step = 28, stop = 40;
    if (id === 259 || id === 260) { step = 12; stop = 20; }
    const chain = this.atlas.vmisc(
      id === 56 ? 'vanilla/Chain5.png'
        : id === 175 ? 'vanilla/Chain14.png'
          : id === 259 ? 'vanilla/Chain24.png'
            : id === 260 ? 'vanilla/Chain25.png'
              : 'vanilla/Chain4.png');
    if (!chain) return;
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {               // :22441-22512
      const dist = Math.hypot(dx, dy);
      let seg = step;
      if (dist < stop) { seg = dist - stop + step; running = false; }
      if (dist > 0 && seg > 0) {
        const k = seg / dist;
        px += dx * k; py += dy * k;                 // 段心向锚点步进（:22454-22455）
        dx = ax - px; dy = ay - py;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        // 源矩形取贴图顶部 seg 行，origin=贴图中心（:22504-22505 scale 1）
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, Math.min(seg, chain.sh),
          -chain.sw / 2, -chain.sh / 2, chain.sw, Math.min(seg, chain.sh));
        ctx.restore();
      } else {
        running = false;                            // 头贴锚点（dist≈0）不画段
      }
    }
  }

  /** 食人怪 259/260 茎蔓强制亮彩（Main.cs:22462-22477）：原版整链单次采样锚点
   *  光照后取下限色 (max(R,100), max(G,150), B=255)——洞穴内藤蔓保底可见。
   *  主 pass 已跳过该族（drawPlantVine 头部 return）——compositeLight 全屏乘光会
   *  压掉下限色，本方法在光照合成【后】绘制（render 7c 钩子）。逐敌用共享
   *  scratch source-atop 染色后按段旋转贴回；段循环与主 pass 同式（step 12/stop 20） */
  /** 月总四部件 30% 白斜坡（Main.cs:24345/24417/24479/24486，G12 收尾）：
   *  原版 case 396/397/398/400 的绘制色 = GetAlpha(Lerp(Lighting.GetColor(部件中心格),
   *  White, 0.3f))——暗处月总恒保 30% 亮度。本仓光照 = compositeLight 全屏乘光,
   *  实体级顶点色通道不存在;恒等式拆差后精确补齐:
   *    final_vanilla = sprite×(0.7L+0.3) = 已绘(sprite×L) + sprite×0.3×(1−L)
   *  → scratch 重绘部件 → 三步乘色 rgb(0.3×(255−light)) → 'lighter' 叠回
   *  （加性,不覆盖后画实体,z 序零影响）。光照采样 = 部件中心格单点,与原版
   *  Lighting.GetColor(point.X, point.Y) 同粒度;光图外按全亮(差值=0,不补)。
   *  已知边界(备案):与月总重叠的后画实体(玩家/弹幕)像素会吃到该加性补差,
   *  暗处重叠区偏亮 ≤0.3×sprite——z 序保持优先于逐像素归属,白天零差零开销。 */
  private applyMoonLordLightFloor(
    entities: Entity[], cam: Camera, viewW: number, viewH: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    lrx: number, lry: number, lrw: number, lrh: number,
  ): void {
    if (this.fullbright) return;
    // ★398 核心 SetDefaults behindTiles=true(:14060,走 tile 后通道)——补差同样
    //   适用(加性不破 z 序;被 tile 遮挡时溢出照亮遮挡格,备案:核心悬停开阔处为主)
    const parts = (entities as Enemy[]).filter((n) => n instanceof Enemy && !n.dead
      && (n.vanillaId === 396 || n.vanillaId === 397 || n.vanillaId === 398 || n.vanillaId === 400));
    if (!parts.length) return;
    const ctx = this.ctx;
    const scratch = this.mlFloorScratch ??= document.createElement('canvas');
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    const z = cam.zoom;
    // 各部件最大绘制外接半径（世界 px）:398 躯干±290/臂±316/y −278..+360;
    // 397 前臂旋转半径 ~426+手帧 −180..+92;396 头帧 y −130..+442+覆层 +214±28;
    // 400 眼帧 78×120+瞳孔椭圆 ±30
    const RAD: Record<number, number> = { 398: 380, 397: 460, 396: 470, 400: 90 };
    const camRX = Math.round(cam.x * z) / z;
    const camRY = Math.round(cam.y * z) / z;
    for (const e of parts) {
      const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
      const R = (RAD[e.vanillaId ?? -1] ?? 380) * z;
      if (sx < -R || sy < -R || sx > viewW + R || sy > viewH + R) continue;
      // 中心格单点光照(:24345 point = Center.ToTileCoordinates)。
      // ★区域外 = 黑(0,0,0)——原版 GetColor 区域外语义(LightingEngine.lightAt 同口径,
      //   曾误默认 255=全亮 → 差值 0 → 光照矩形外的部件永远拿不到补差)
      let lr = 0, lg = 0, lb = 0;
      const tx = Math.floor(e.cx / TILE), ty = Math.floor(e.cy / TILE);
      if (tx >= lrx && ty >= lry && tx < lrx + lrw && ty < lry + lrh) {
        const li = (ty - lry) * lrw + (tx - lrx);
        lr = lightR[li]; lg = lightG[li]; lb = lightB[li];
      }
      // 差值色 = sprite×0.3×(255−light)/255（逐通道;全亮 → 0 跳过）
      const cr = Math.round(0.3 * (255 - lr));
      const cg = Math.round(0.3 * (255 - lg));
      const cb = Math.round(0.3 * (255 - lb));
      if (cr + cg + cb === 0) continue;
      // scratch = 部件屏区 ∩ 视口(只处理可见区)
      const bx0 = Math.max(0, Math.floor(sx - R)), by0 = Math.max(0, Math.floor(sy - R));
      const bx1 = Math.min(viewW, Math.ceil(sx + R)), by1 = Math.min(viewH, Math.ceil(sy + R));
      const bw = bx1 - bx0, bh = by1 - by0;
      if (bw <= 0 || bh <= 0) continue;
      if (scratch.width !== bw || scratch.height !== bh) {
        scratch.width = bw; scratch.height = bh;
      } else {
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, bw, bh);
      }
      // 世界→scratch 变换（同实体 pass:translate(round(vw/2),round(vh/2))·scale(z)·
      // translate(-camRX,-camRY),平移再减 bbox 屏原点）
      const setWorldXf = () => {
        sctx.setTransform(z, 0, 0, z,
          Math.round(viewW / 2) - bx0 - camRX * z, Math.round(viewH / 2) - by0 - camRY * z);
      };
      const drawPart = () => {
        if (e.vanillaId === 398) this.drawMoonLordCore(e, entities);
        else if (e.vanillaId === 397) this.drawMoonLordHand(e, entities);
        else if (e.vanillaId === 396) this.drawMoonLordHead(e);
        else this.drawMoonLordFreeEye(e);
      };
      const savedCtx = this.ctx;
      this.ctx = sctx;
      setWorldXf();
      drawPart();                                              // 1st: 原样绘
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'multiply';
      sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      sctx.fillRect(0, 0, bw, bh);                             // 2nd: 乘差值色
      setWorldXf();
      sctx.globalCompositeOperation = 'destination-in';
      drawPart();                                              // 3rd: 源 α 恢复
      this.ctx = savedCtx;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(scratch, bx0, by0);                        // 加性补差
      ctx.restore();
    }
  }

  /** ★T1 自发光弹光照地板系数表（2026-09-02 清偿"登记不修"批;同日红队 I′ 对抗
   *  F1/F2 修订:地板动态化 + 对弹自身 α 敏感）——原版这些弹的绘制顶点色在
   *  【光照结算之后】向白提亮 = 自发光,暗处仍亮——
   *    · 596（星旋族弹,GetAlpha 同表 575/659）：白剪影 Projectile.cs:80903-80910
   *      `new Color(255-alpha,255-alpha,255-alpha,128-alpha/2)`——**RGB=(255−α) 才是
   *      顶点色乘数（α=0 全显态=1.0）**,A 通道 128−α/2 的半透已由 Dart.draw
   *      globalAlpha 重放、不进地板（★F1 定罪:旧固定 0.5 档系误把 A=128/255 当
   *      自发光档）；
   *    · 811：Main.cs:30841-30848 轨迹支 `Lerp(projectileColor,White,Remap(ai0,
   *      0,15,1,0.3))` 恒亮端 k=1.0（本仓 Dart 侧 whiteLerp 同源已画）；
   *    · 814：Main.cs:30849-30856 轨迹支 `Lerp(projectileColor,White,0.35)` → k=0.35。
   *      811/814 轨迹 Lerp 发生在 GetAlpha 缺省段（P.cs:81503-81510 RGB×(255−α)/255）
   *      【之前】→ 白度终值 = k×(255−α)/255（811 AI α−20/t 出场 13 拍渐显,
   *      P.cs:57347-57351）。
   *  ★F2:地板必须逐弹按自身 α 缩放——596 渐显（AI α−25/拍）/渐隐窗（timeLeft<30
   *  GetAlpha 就地覆写）/穿墙钳 128（:34208-34219）三段、811/814 出场渐显窗内,
   *  原版弹不可见或半透,地板恒满档 = 无源白块。故表值改 `(proj)=>number` 动态
   *  形态,消费点（raiseSelfLuminousProjLight）逐弹求值;系数 <0.06 整体跳过该实体
   *  （原版近不可见窗）。effAlpha 式与 Dart.draw 同源,见 selfLumEffAlpha。
   *  本仓实体层（含弹）画在 compositeLight 全屏乘光【之前】→ 暗处被乘黑,与原版
   *  "白剪影×任意光照恒可见"相悖。最小侵入挂点 = 光值数组写入口（applyMoonLord
   *  LightFloor 加性补差方案的轻量变体,弹无独立绘制通道不宜重画）:合成前把弹
   *  AABB 覆盖格的光通道抬到 floor×255 白地板,合成后立即还原（render 7 段成对
   *  调用）。与既有白剪影滤镜叠加语义成立:终像素 = 白剪影 × 抬亮地板 ✓
   *  已知边界（备案,同月总补差的 z 序取舍）:①同格地形/后画实体像素同吃抬亮,
   *  原版只亮弹本体;②弹盒跨格边缘受双线性插值向邻格暗值渐变——白天光照≥地板
   *  时零改动零开销。
   *  ★I″ 去色清偿（2026-09-02 蓝队,原边界③"有色光区白剪影被染红"）:raise 写面
   *  从「逐通道 max 抬到 fr」改为「白化 R=G=B=max(r,g,b,fr)」——消色差,熔岩红光
   *  区不再把白剪影染红（原版 596/811 顶点色不读格光色=恒白,Projectile.cs:80903/
   *  Main.cs:30846 Lerp 恒白端）;白化值取三通道最大值再抬地板 = 只升不降（白天
   *  暖光不压暗,原"光照≥地板零改动"语义对消色差光仍成立）;账本照记原 RGB×3、
   *  restore 同账逐字节还原。
   *  ★M′-MAJOR-2 修订（2026-09-02 红蓝对抗定谳）:白化按 k 分档——白化只对
   *  596/811 成立（顶点色恒白,不读格光色）;814 顶点色=Lerp(格光,White,0.35)
   *  【读格光】（Main.cs:30068+:30855）,全白白化破坏 65% 色相保留+地形漂白 →
   *  回归逐通道 max 旧形（红队确认旧形更近原版 Lerp 的近似,原"残留微差"备案
   *  就此清偿）。表值改 (proj)=>{floor,whiten},消费点按 whiten 分道。 */
  private static readonly SELF_LUMINOUS_PROJS = new Map<number, (proj: Entity) => { floor: number; whiten: boolean }>([
    // 596: RGB(255−α) 白化（GetAlpha 专支不读格光色）;effAlpha 已含 timeLeft<30 渐隐窗
    //  → 顶点色恒白（Projectile.cs:80903）→ whiten=true（★I″ 消色差）
    [596, (proj) => ({ floor: (255 - Renderer.selfLumEffAlpha(proj)) / 255, whiten: true })],
    // 811: whiteLerp k=1.0（Remap(ai0,0,15,1,0.3) 恒下端,ai[0] 全域无写入方）× (255−α)/255
    //  → 顶点色恒白（Main.cs:30846 Lerp 恒白端）→ whiten=true（★I″ 消色差）
    [811, (proj) => ({ floor: (255 - Renderer.selfLumEffAlpha(proj)) / 255, whiten: true })],
    // 814: whiteLerp k=0.35 × (255−α)/255 —— 顶点色=Lerp(格光,White,0.35)【读格光】
    //  （Main.cs:30068+:30855）→ whiten=false:逐通道 max 旧形（保留 65% 光色相）
    [814, (proj) => ({ floor: 0.35 * (255 - Renderer.selfLumEffAlpha(proj)) / 255, whiten: false })],
  ]);

  /** 弹自身 effAlpha（★F2:与 Dart.draw 消费式同源）——596 在 timeLeft<30 渐隐窗内
   *  GetAlpha 就地覆写 α=255−255·timeLeft/30（P.cs:80905-80907）,其余读
   *  projectile.alpha（AI 维护:596 渐显 −25/拍 + 实心盒钳 128 :34208-34219 /
   *  811·814 α−20/t 渐显 :57347-57351）。netPuppet 傀儡不跑 dartStep 而 draw 恒
   *  可见（Dart.draw netPuppet 门）→ 按全显 α=0 计 */
  private static selfLumEffAlpha(proj: Entity): number {
    const p = proj as { projId?: number; alpha?: number; life?: number; netPuppet?: boolean };
    if (p.netPuppet) return 0;
    if (p.projId === 596 && (p.life ?? 600) < 30) return 255 - 255 * ((p.life ?? 0) / 30);
    return Math.max(0, Math.min(255, p.alpha ?? 0));
  }

  /** 合成前抬亮：把 SELF_LUMINOUS_PROJS 弹覆盖格的光通道抬到地板——
   *  596/811【白化去色】R=G=B=max(r,g,b,fr)（★I″ 消色差,顶点色恒白）、
   *  814 逐通道 max 抬 fr（★M′-MAJOR-2,顶点色读格光=Lerp(格光,White,0.35) 的近似,
   *  色相保留）。账本记原 RGB×3,restore 同账;★F2 地板 = 表值逐弹求值,弹自身
   *  α 窗内同步缩放 */
  private raiseSelfLuminousProjLight(
    entities: Entity[],
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ): void {
    this._lumFloorTouched.length = 0;
    this._lumFloorSeen.clear();
    if (this.fullbright) return;
    for (const e of entities) {
      if (e.dead) continue;
      const pid = (e as { projId?: number }).projId;
      if (pid === undefined) continue;
      const lumOf = Renderer.SELF_LUMINOUS_PROJS.get(pid);
      if (lumOf === undefined) continue;
      // ★F2 逐弹求值地板：596=(255−α)/255（渐显/渐隐窗/穿墙钳三段）、
      //    811/814=whiteLerp k×(255−α)/255（出场渐显）——近不可见窗（<0.06）
      //    整体跳过,防"无源白块"
      const { floor, whiten } = lumOf(e);
      if (floor < 0.06) continue;
      const fr = Math.round(255 * floor);
      // 弹 AABB 覆盖格（中心单点不够——大弹跨格,白剪影须整盒抬亮）
      const tx0 = Math.floor(e.x / TILE), tx1 = Math.floor((e.x + e.w) / TILE);
      const ty0 = Math.floor(e.y / TILE), ty1 = Math.floor((e.y + e.h) / TILE);
      const touched = this._lumFloorTouched;
      const seen = this._lumFloorSeen;
      for (let ty = ty0; ty <= ty1; ty++) {
        if (ty < ry || ty >= ry + rh) continue;
        for (let tx = tx0; tx <= tx1; tx++) {
          if (tx < rx || tx >= rx + rw) continue;
          const li = (ty - ry) * rw + (tx - rx);
          // ★M′-MAJOR-2（2026-09-02 红蓝对抗定谳）写面按 whiten 分道,两形都只升不降、
          // 已达标格零写零记账：
          //  · whiten=true（596/811,顶点色恒白 Projectile.cs:80903/Main.cs:30846 恒白
          //    端,不读格光色）→ ★I″ 三通道归一 max(r,g,b,fr)：只升不降（白天暖光
          //    不压暗）且消色差（有色光区白剪影不再被染色）。
          //  · whiten=false（814,顶点色=Lerp(格光,White,0.35)【读格光】
          //    Main.cs:30068+:30855）→ 逐通道 max 旧形：保留 65% 光色相（全白白化
          //    会把熔岩红光区漂白成灰阶,红队确认旧形更近原版 Lerp）。
          const w = Math.max(lightR[li], lightG[li], lightB[li], fr);
          const r2 = whiten ? w : Math.max(lightR[li], fr);
          const g2 = whiten ? w : Math.max(lightG[li], fr);
          const b2 = whiten ? w : Math.max(lightB[li], fr);
          if (lightR[li] === r2 && lightG[li] === g2 && lightB[li] === b2) continue;
          if (!seen.has(li)) {
            seen.add(li);
            touched.push(li, lightR[li], lightG[li], lightB[li]);
          }
          lightR[li] = r2; lightG[li] = g2; lightB[li] = b2;
        }
      }
    }
  }

  /** 合成后还原：restore 抬亮账本（下游月总补差/茎蔓亮彩/鞭全亮读点保持真值） */
  private restoreSelfLuminousProjLight(
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
  ): void {
    const t = this._lumFloorTouched;
    for (let i = 0; i < t.length; i += 4) {
      lightR[t[i]] = t[i + 1];
      lightG[t[i]] = t[i + 2];
      lightB[t[i]] = t[i + 3];
    }
    this._lumFloorTouched.length = 0;
    this._lumFloorSeen.clear();
  }

  private drawBrightVines(
    entities: Entity[], cam: Camera, z: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    lrx: number, lry: number, lrw: number, lrh: number,
  ): void {
    const vines = (entities as Enemy[]).filter(
      (n) => n instanceof Enemy && !n.dead
        && (n.vanillaId === 259 || n.vanillaId === 260) && n.ai0 >= 0 && n.ai1 >= 0);
    if (!vines.length || !this.atlas) return;
    const ctx = this.ctx;
    const scratch = this.brightVineScratch ??= document.createElement('canvas');
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    for (const e of vines) {
      const chain = this.atlas.vmisc(e.vanillaId === 259 ? 'vanilla/Chain24.png' : 'vanilla/Chain25.png');
      if (!chain) continue;
      // 锚点光照单采样（:22462）+ 下限（:22467-22477）；光图外按全亮（区域边界防断藤）
      let lr = 255, lg = 255, lb = 255;
      const tx = Math.floor(e.ai0), ty = Math.floor(e.ai1);
      if (tx >= lrx && ty >= lry && tx < lrx + lrw && ty < lry + lrh) {
        const li = (ty - lry) * lrw + (tx - lrx);
        lr = lightR[li]; lg = lightG[li]; lb = lightB[li];
      }
      const cr = Math.max(lr, 100), cg = Math.max(lg, 150);   // B 恒 255
      const ax = e.ai0 * 16 + 8, ay = e.ai1 * 16 + 8;
      let px = e.cx, py = e.cy;
      let dx = ax - px, dy = ay - py;
      const rot = Math.atan2(dy, dx) - Math.PI / 2;
      const step = 12, stop = 20;                   // :22442-22447（259/260 档）
      if (scratch.width !== chain.sw || scratch.height !== chain.sh) {
        scratch.width = chain.sw; scratch.height = chain.sh;
      }
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      let running = true, guard = 0;
      while (running && guard++ < 200) {
        const dist = Math.hypot(dx, dy);
        let seg = step;
        if (dist < stop) { seg = dist - stop + step; running = false; }
        if (dist > 0 && seg > 0) {
          const k = seg / dist;
          px += dx * k; py += dy * k;
          dx = ax - px; dy = ay - py;
          const sh = Math.min(seg, chain.sh);
          sctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, sh, 0, 0, chain.sw, sh);
          sctx.globalCompositeOperation = 'source-atop';
          sctx.fillStyle = `rgb(${cr},${cg},255)`;
          sctx.fillRect(0, 0, scratch.width, scratch.height);
          sctx.globalCompositeOperation = 'source-over';
          const [sxp, syp] = cam.worldToScreen(px, py);
          ctx.save();
          ctx.translate(sxp, syp);
          ctx.rotate(rot);
          ctx.drawImage(scratch, 0, 0, chain.sw, sh,
            (-chain.sw / 2) * z, (-chain.sh / 2) * z, chain.sw * z, chain.sh * z);
          ctx.restore();
        } else {
          running = false;
        }
      }
    }
  }

  /** 石巨人拳链（Main.cs:22593-22632 1:1）：拳 → golemBoss 本体中心（AI 侧
   *  master=本体，本体死透时锚自由头——与原版 golemBoss=-1 回退自身中心的
   *  差异已注释）；目标带肩偏移（247 左 -70×scale / 248 右 +66×scale，Y -7×scale），
   *  Chain21 全段 16×16、步长 16×scale、距锚 <16 无尾段直接停。
   *  FTW 每段再 -8Y（:22625-22628）——拳链整体下探 */
  private drawGolemFistChain(e: Enemy, getGoodWorld: boolean) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc('vanilla/Chain21.png');
    if (!chain || !e.master) return;
    const ctx = this.ctx;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const offX = e.vanillaId !== 247 ? 66 : -70;    // :22605（type!=247 → +66）
    const ax = e.master.cx, ay = e.master.cy;
    let px = e.cx, py = e.cy;
    let dx = ax - px + offX * scale;
    let dy = ay - py - 7 * scale;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;   // :22607
    let guard = 0;
    while (guard++ < 200) {
      const dist = Math.hypot(dx, dy);
      if (dist < 16) break;                         // :22609-22612 无尾段
      const k = 16 * scale / dist;
      px += dx * k; py += dy * k;
      dx = ax - px + offX * scale;
      dy = ay - py - 7 * scale;
      if (getGoodWorld) dy += 8;                    // :22625-22628 FTW 段目标下探 +8
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      // ×scale（:22630 绘制尺寸=贴图格×npc.scale——曾漏乘=16×16 原尺寸环配
      // 8px 步长(FTW)互相叠压,2026-08-19 终审修）
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        (-chain.sw / 2) * scale, (-chain.sh / 2) * scale, chain.sw * scale, chain.sh * scale);
      ctx.restore();
    }
  }

  /** 刺球锚链+锚座（Main.cs:23087-23113 1:1）：aiStyle 20（刺球 70）——
   *  锚点 = ai[1]/ai[2]（像素，AI_020 帧首 :24671-24673 快照：position.Y += h/2+8
   *  后的中心）；球心 → 锚点每 12px 画一段 Chain（源矩形高 = 12，距锚 <20 段收尾
   *  seg = ⌊dist⌋−8，恒步进 12px 可越过锚点=原版怪癖照搬），rotation = atan2(锚−球)
   *  −π/2（:23092 同帧写 npc.rotation → 本体贴图随链向旋转，:23660 通用绘制消费
   *  ——本仓经 visAngle 传递给下方旋转分支）；锚座 Spike_Base 16×16 画在锚点、
   *  rotation−0.75（:23113）。逐段光照（:23110 GetColor）由主光照合成承担
   *  （同食人怪藤蔓先例）。链在本体精灵前画=原版层序（链垫球下）。
   *  ★锚点未知态不画（出生帧/联机锚未同步态,见函数体首行门注） */
  private drawSpikeBallChain(e: Enemy): void {
    if (!this.atlas) return;
    // ★锚点未知态不画：(ai1,ai2)=(0,0) 且未 aiInit——不门则链画向世界原点+锚座画在
    // (0,0)。覆盖两态：①本球出生帧（本仓刷怪相位在 entities.update 之后,球会先被画
    // 一次才轮到首个 AI tick 写 ai1/ai2;aiInit 恰在首 AI tick 快照分支置位=精确门）;
    // ②联机傀儡未同步帧（netPuppet 不跑 AI,aiInit 恒 false,锚点经 msg23 快照写入,
    // 旧房主/旧 server 帧 ai1/ai2 缺省 0 仍拦）。判据改为「aiInit‖锚点非零」后,
    // 已同步傀儡放行——链/锚座/本体随链旋转 visAngle 由此函数每帧自写,自动生效。
    // 原版本相：SpawnNPCs→UpdateNPCs 同 tick 相位序（Main.cs:17944-17958）从不绘制
    // pre-init 态（红蓝对抗 2026-09-02 两案定谳;联机锚同步批 2026-09-02 改判据）。
    if (!e.aiInit && e.ai1 === 0 && e.ai2 === 0) return;
    const ctx = this.ctx;
    const ax = e.ai1, ay = e.ai2;                      // 锚点（像素）
    let dx = ax - e.cx, dy = ay - e.cy;
    // ★dist=0 不早退：原版 :23092 无条件写 rotation（Atan2(0,0)=0 → −1.57）、
    // :23113 锚座照画;链循环由下方 dist<=0 break 兜除零（红蓝对抗定谳撤早退）
    const rot = Math.atan2(dy, dx) - Math.PI / 2;      // num37（:23092）
    e.visAngle = rot;
    const chain = this.atlas.vmisc('vanilla/Chain.png');
    if (chain) {
      let px = e.cx, py = e.cy;
      let running = true;
      // 终止性与原版 while(flag7) 同构：有限 dist 每迭代沿锚向恰减 12px →
      // ⌈dist/12⌉ 次内必达 <20 收尾段（无上限=原版 1:1,最终清零撤计数 guard）；
      // 唯一病理态=非有限坐标（原版该态 NaN 死循环绘制无输出,此处防御性 break）
      while (running) {
        const dist = Math.hypot(dx, dy);
        if (!Number.isFinite(dist)) break;
        if (dist <= 0) break;                          // 球叠锚：链退化（原版 NaN 位置绘制无输出=等价）
        let seg = 12;                                  // :23096
        if (dist < 20) { seg = Math.floor(dist) - 20 + 12; running = false; }   // :23098-23101 尾段（C# (int) 向零截断）
        const k = 12 / dist;                           // :23103 步进恒 12px
        px += dx * k; py += dy * k;
        dx = ax - px; dy = ay - py;                    // :23108-23109
        const sh = Math.min(seg, chain.sh);
        if (sh > 0) {                                  // 尾段 seg≤0 不画（canvas 0 高会抛）
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          // XNA origin=整图中心(6,6)——尾段源高收窄仍以整图中心为轴（:23111）
          ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, sh,
            -chain.sw / 2, -chain.sh / 2, chain.sw, sh);
          ctx.restore();
        }
      }
    }
    const base = this.atlas.vmisc('vanilla/Spike_Base.png');
    if (base) {
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rot - 0.75);                          // :23113 num37−0.75
      ctx.drawImage(base.img, base.sx, base.sy, base.sw, base.sh,
        -base.sw / 2, -base.sh / 2, base.sw, base.sh);
      ctx.restore();
    }
  }

  /** Prime 部件臂骨（Main.cs:22633-22675 1:1，与骷髅王手 36 同构的两段收缩
   *  IK）：锚点 = 部件 pos + w/2 - 5×ai[0], +20；朝头中心两段 92/60 归一化，
   *  段偏移（-200×ai[0], +130）/（-50×ai[0], +80），旋转 atan2-π/2，
   *  贴图 Arm_Bone_2（26×98，rect/origin 与 Arm_Bone 同尺寸） */
  private drawPrimeArm(e: Enemy) {
    if (!this.atlas) return;
    const arm = this.atlas.vmisc('vanilla/Arm_Bone_2.png');
    if (!arm || !e.master) return;
    const ctx = this.ctx;
    const head = e.master;
    const side = e.ai0 || 1;                        // ai[0] 侧别 ±1
    let vx = e.x + e.w * 0.5 - 5 * side;            // :22635
    let vy = e.y + 20;
    for (let k = 0; k < 2; k++) {
      let dx = head.cx - vx, dy = head.cy - vy;
      let n: number;
      if (k === 0) { dx -= 200 * side; dy += 130; const len = Math.hypot(dx, dy) || 1; n = 92 / len; }
      else { dx -= 50 * side; dy += 80; const len = Math.hypot(dx, dy) || 1; n = 60 / len; }
      vx += dx * n; vy += dy * n;
      const rot = Math.atan2(dy, dx) - Math.PI / 2; // :22662
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(rot);
      ctx.drawImage(arm.img, arm.sx, arm.sy, arm.sw, arm.sh, -arm.sw / 2, -arm.sh / 2, arm.sw, arm.sh);
      ctx.restore();
      if (k === 0) { vx += dx * n / 2; vy += dy * n / 2; }  // :22666 段间推进
    }
  }

  /** 世纪之花钩蔓/触须链（Main.cs:22225-22285 1:1）：263 钩蔓→Chain26、
   *  264 触须→Chain27，目标 = 本体中心（触须 ai[3]>0 时锚另一触须——AI 侧
   *  master 已按同语义解析）；步长 16、距锚 <32 尾段缩短（dist-32+16），
   *  origin=贴图全高中心、scale 1 */
  private drawPlanteraVine(e: Enemy) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc(e.vanillaId === 263 ? 'vanilla/Chain26.png' : 'vanilla/Chain27.png');
    if (!chain || !e.master) return;
    const ctx = this.ctx;
    const ax = e.master.cx, ay = e.master.cy;
    let px = e.cx, py = e.cy;
    let dx = ax - px, dy = ay - py;
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    let running = true;
    let guard = 0;
    while (running && guard++ < 200) {
      let seg = 16;                                 // num9/num15
      const dist = Math.hypot(dx, dy);
      if (dist < 32) { seg = dist - 32 + 16; running = false; }
      if (dist > 0 && seg > 0) {
        const k = seg / dist;
        px += dx * k; py += dy * k;
        dx = ax - px; dy = ay - py;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, Math.min(seg, chain.sh),
          -chain.sw / 2, -chain.sh / 2, chain.sw, Math.min(seg, chain.sh));
        ctx.restore();
      } else {
        running = false;
      }
    }
  }

  /** 双子互连链（Main.cs:22177-22224，1.4.5 新增）：Retinazer 125 激活时向
   *  场上的 Spazmatism 126 画 Chain12（原版双方各画一遍，几何相同——单侧画
   *  一次等价）。两端锚 = Bottom - h×0.5×scale，步长 28×scale、距锚
   *  <40×scale 无尾段停、相距 >2000px 不画 */
  private drawTwinsChain(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc('vanilla/Chain12.png');
    if (!chain) return;
    const other = (entities as Enemy[]).find((n) => n instanceof Enemy && !n.dead && n.vanillaId === 126);
    if (!other) return;
    const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
    const ax = other.cx, ay = other.y + other.h - other.h * 0.5 * scale;
    let px = e.cx, py = e.y + e.h - e.h * 0.5 * scale;
    let dx = ax - px, dy = ay - py;
    if (Math.hypot(dx, dy) > 2000) return;          // :22196-22199
    const rot = Math.atan2(dy, dx) - Math.PI / 2;
    const step = 28 * scale, stop = 40 * scale;     // num6
    let guard = 0;
    while (guard++ < 200) {
      const dist = Math.hypot(dx, dy);
      if (dist < stop) break;                       // :22204-22208 无尾段
      const k = step / dist;
      px += dx * k; py += dy * k;
      dx = ax - px; dy = ay - py;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
        -chain.sw / 2, -chain.sh / 2, chain.sw * scale, chain.sh * scale);
      ctx.restore();
    }
  }

  /** Mechdusa 蛇发（Main.cs:25070-25112，queen 127 绘制段 1:1）：把双子
   *  125/126 当蛇头——从 queen 头部锚点（GetMechQueenCenter + (∓18/20,-18)
   *  .RotatedBy(queen.rotation)）向各眼中心铺 Chain12 链；步长 = Chain12 高×
   *  眼 scale,距目标 <40×scale 停;每段先画后进位（:25097 先 draw 后 +=,与
   *  双子互连链的先进位后画相反）;origin=(W/2,0) 顶锚。光照着色以无光表
   *  近似（与 drawTwinsChain 同策略,Lighting.GetColor 合成在全屏光照层）。 */
  private drawMechdusaHair(e: Enemy, entities: unknown[]) {
    if (!this.atlas) return;
    const chain = this.atlas.vmisc('vanilla/Chain12.png');
    if (!chain) return;
    const ctx = this.ctx;
    const qc = getMechQueenCenter(e);
    for (const twin of entities as Enemy[]) {
      if (!(twin instanceof Enemy) || twin.dead || (twin.vanillaId !== 125 && twin.vanillaId !== 126)) continue;
      const scale = (twin.vanilla?.scale ?? 1) * twin.vanillaScale;
      const tx = twin.cx, ty = twin.cy;
      // :25081-25084 锚点偏移 (125:-18 / 126:20, -18) 随 queen 旋转
      const ox = (twin.vanillaId === 125 ? -18 : 20), oy = -18;
      const cos = Math.cos(e.spin), sin = Math.sin(e.spin);
      let px = qc.x + ox * cos - oy * sin;
      let py = qc.y + ox * sin + oy * cos;
      let dx = tx - px, dy = ty - py;
      if (Math.hypot(dx, dy) > 2000) continue;      // :25091-25094 flag11
      const rot = Math.atan2(dy, dx) - Math.PI / 2; // rotation10
      const stop = 40 * scale;
      let guard = 0;
      while (guard++ < 200) {
        const dist = Math.hypot(dx, dy);
        if (dist < stop) break;                     // :25095-25099
        const k = chain.sh * scale / dist;          // 步长 = Chain12 高×scale
        dx *= k; dy *= k;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        // origin = (Chain12 宽/2, 0)——顶锚（:25101,与双子链的中心锚不同）
        ctx.drawImage(chain.img, chain.sx, chain.sy, chain.sw, chain.sh,
          -chain.sw / 2, 0, chain.sw * scale, chain.sh * scale);
        ctx.restore();
        px += dx; py += dy;                         // :25102-25103 先画后进位
        dx = tx - px; dy = ty - py;
      }
    }
  }

  private drawSkeletronArm(hand: Enemy, head: Enemy) {
    if (this.armBoneImg === undefined) {
      loadBitmapOnly('vanilla/Arm_Bone.png', () => !!(this.armBoneImg), (x) => { this.armBoneImg = x as unknown as typeof this.armBoneImg; });
    }
    // Red Hat 族（生成时 head.ai[3]=1 :81269-81271，手 localAI[3] 每 tick 镜像 :22304）
    // → 换 Arm_Bone_3（:22571-22578；rect/origin 两分支同用 BoneArm 尺寸，原版 quirk）
    const redHat = head.ai3 === 1;
    if (redHat && this.boneArm3Img === undefined) {
      loadBitmapOnly('vanilla/Arm_Bone_3.png', () => !!(this.boneArm3Img), (x) => { this.boneArm3Img = x as unknown as typeof this.boneArm3Img; });
    }
    const img = redHat ? this.boneArm3Img : this.armBoneImg;
    if (!img || !(img.width > 0) || img.width === 0) return;
    const ctx = this.ctx;
    const ai0 = hand.ai0 >= 0 ? 1 : -1; // ai[0]：-1 左手 / 1 右手
    // vector5 = 手部锚点（Main.cs:22545：position + width/2 - 5*ai[0], +20）
    let vx = hand.x + hand.w / 2 - 5 * ai0;
    let vy = hand.y + 20;
    // BoneArm 基准尺寸（26×98）——Arm_Bone_3（28×98）按此 rect/origin 绘制（:22575）
    const bw = this.armBoneImg?.width ?? img.width;
    const bh = this.armBoneImg?.height ?? img.height;
    for (let j = 0; j < 2; j++) {
      // num14/num15 = 头中心（position + w/2, +h/2）相对锚点的向量（Main.cs:22547-22548）
      let dx = head.x + head.w / 2 - vx;
      let dy = head.y + head.h / 2 - vy;
      let k: number;
      if (j === 0) { dx -= 200 * ai0; dy += 130; const len = Math.hypot(dx, dy) || 1; k = 92 / len; }
      else { dx -= 50 * ai0; dy += 80; const len = Math.hypot(dx, dy) || 1; k = 60 / len; }
      vx += dx * k; vy += dy * k;
      const rot = Math.atan2(dy, dx) - Math.PI / 2; // Main.cs:22572
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(rot);
      ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
      if (j === 0) { vx += dx * k / 2; vy += dy * k / 2; } // Main.cs:22587 段间推进
    }
  }

  /** 南瓜王 327 披风（Main.cs:22499-22506）：锚=本体中心+(0,80)，PumpkingCloak
   *  166×630 五帧行（帧高 126），行号 = localAI[1]（表情帧同节拍），origin=
   *  (W/2, 帧高/2)，rotation 0——本体贴图之下仍画在实体层（原版同段叠画） */
  private drawPumpkingCloak(e: Enemy) {
    if (this.pumpkingCloakImg === undefined) {
      loadBitmapOnly('vanilla/PumpkingCloak.png', () => !!(this.pumpkingCloakImg), (x) => { this.pumpkingCloakImg = x as unknown as typeof this.pumpkingCloakImg; });
    }
    const img = this.pumpkingCloakImg;
    if (!img || !(img.width > 0) || img.width === 0) return;
    const fw = img.width, fh = img.height / 5;
    const row = Math.max(0, Math.min(4, Math.trunc(localAIOf(e)[1] ?? 0)));   // :22501 num10
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.cx, e.cy + 80);
    ctx.drawImage(img, 0, row * fh, fw, fh, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }

  /** 南瓜王之刃 328 双臂（Main.cs:22508-22542，与骷髅王手同构）：锚=position+
   *  w/2-5*ai[0], +20；朝主中心（h/2-30）两段 92/60 收缩，段偏移
   *  (-200*ai[0],+130)/(-50*ai[0],+80)，贴图 PumpkingArm（26×96）整幅 */
  private drawPumpkingArm(blade: Enemy, master: Enemy) {
    if (this.pumpkingArmImg === undefined) {
      loadBitmapOnly('vanilla/PumpkingArm.png', () => !!(this.pumpkingArmImg), (x) => { this.pumpkingArmImg = x as unknown as typeof this.pumpkingArmImg; });
    }
    const img = this.pumpkingArmImg;
    if (!img || !(img.width > 0) || img.width === 0) return;
    const ctx = this.ctx;
    const ai0 = blade.ai0 >= 0 ? 1 : -1;
    let vx = blade.x + blade.w * 0.5 - 5 * ai0;   // :22509 vector4
    let vy = blade.y + 20;
    for (let i = 0; i < 2; i++) {
      let dx = master.x + master.w / 2 - vx;
      let dy = master.y + master.h / 2 - 30 - vy; // :22513（-30 偏移，骷髅王手无）
      let k: number;
      if (i === 0) { dx -= 200 * ai0; dy += 130; const len = Math.hypot(dx, dy) || 1; k = 92 / len; }
      else { dx -= 50 * ai0; dy += 80; const len = Math.hypot(dx, dy) || 1; k = 60 / len; }
      vx += dx * k; vy += dy * k;
      const rot = Math.atan2(dy, dx) - Math.PI / 2;
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(rot);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      if (i === 0) { vx += dx * k / 2; vy += dy * k / 2; }   // :22541 段间推进
    }
  }

  /**
   * NPC 血条 1:1（Main.DrawHealthBar Main.cs:21748-21839 + 显示门
   * DrawInterface_14_EntityHealthBars :45223：life != lifeMax && !dontTakeDamage——
   * 掉血即常驻显示、满血隐藏；immortal 实体血量恒满自动排除）。
   * Hb1/Hb2 贴图未入素材管线——几何绘制同布局：总宽 36px（scale=1）、填充 min 3px、
   * Y=实体脚下（settings=1 经典锚点 position.Y+height+NPCAddHeight）、
   * 颜色公式 :21771-21810（ratio-0.1 → >0.5 绿 r=255*(1-n)*2 / 否则红 g=255*n*2，b=0，
   * ×0.95 alpha；前景/背景同色 tint 靠明度区分）
   */
  /**
   * 挂物族存放物叠画（原版 TE*.Draw：物品框/武器架/食物盘/展示罐把存放物图标画在
   * 框体上；模特/帽架走 PlayerRenderer 画穿戴件——本作无纸娃娃渲染链，等价为在
   * 锚点上叠画各槽位物品图标）。仅锚点画一次，视口外剔除；不进 ChunkCache 烘焙
   * （存放物是运行时可变状态，见 world/FurnitureItems.ts）。
   */
  private drawFurnitureItems(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    const list = world.furnitureItems;
    if (!list.length || !this.atlas) return;
    const ctx = this.ctx;
    // 视口剔除（与 drawWires 同式）
    const vx0 = cam.x - viewW / 2 / z - 64, vx1 = cam.x + viewW / 2 / z + 64;
    const vy0 = cam.y - viewH / 2 / z - 80, vy1 = cam.y + viewH / 2 / z + 64;
    for (const rec of list) {
      const bx = rec.x * TILE, by = rec.y * TILE;
      if (bx < vx0 || bx > vx1 || by < vy0 || by > vy1) continue;
      if (!rec.slots.some((s) => s !== null)) continue;
      const drawIcon = (itemId: number, cx: number, cy: number, maxSide: number) => {
        const ar = this.atlasIcon(itemId);
        if (!ar) return;
        const sc = Math.min(maxSide / Math.max(ar.sw, ar.sh), 1);
        const w = ar.sw * sc, h = ar.sh * sc;
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, cx - w / 2, cy - h / 2, w, h);
      };
      switch (rec.kind as FurnitureKind) {
        case 'item_frame':     // 2×2：图标居中
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 16, by + 16, 20);
          break;
        case 'weapon_rack':    // 3×3：图标居中
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 24, by + 24, 24);
          break;
        case 'food_platter':   // 1×1：盘上小图标
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 8, by + 6, 12);
          break;
        case 'display_jar':    // 1×2：罐心
          if (rec.slots[0]) drawIcon(rec.slots[0]!.id, bx + 8, by + 14, 12);
          break;
        case 'hat_rack':       // 3×4：两顶帽子并排挂钩位（TEHatRack.Draw 双 doll 锚）
          for (let i = 0; i < 2; i++) {
            const s = rec.slots[i];
            if (s) drawIcon(s.id, bx + 14 + i * 22, by + 22, 16);
          }
          for (let i = 0; i < 2; i++) {
            const s = rec.slots[2 + i];
            if (s) drawIcon(s.id, bx + 14 + i * 22, by + 40, 12);
          }
          break;
        case 'display_doll':   // 2×3：穿戴件自上而下叠画（头/身/腿/配饰/坐骑/持握）
          for (let i = 0, row = 0; i < rec.slots.length; i++) {
            const s = rec.slots[i];
            if (!s) continue;
            drawIcon(s.id, bx + 16, by + 8 + row * 13, 14);
            row++;
          }
          break;
      }
    }
  }

  /** 入驻旗帜（Main.cs:40152-40236 DrawNPCHousesInWorld 1:1）：
   *  有家非流浪城镇 NPC（bound/守卫老人除外）在家坐标上方挂 House_Banner_1
   *  （2×2 帧 16×20：X=单/双人旗、Y=housingCategory——城镇 NPC 全 0）+ 头像
   *  叠画（NPC_Head_{id} 24×24）。同房多 NPC 每面旗下移 26px。锚点=帧中心。
   *  位置 = home.x*16+8，y = 首个实心格下沿+18 */
  private drawHouseBanners(entities: unknown[], world: World, cam: Camera) {
    if (!this.atlas) return;
    const cloth = this.atlas.vmisc('vanilla/House_Banner_1.png');
    if (!cloth) return;
    const ctx = this.ctx;
    const st = world.store;
    const banners: TownNPC[] = [];
    for (const e of entities) {
      if (e instanceof TownNPC && !e.dead && !e.bound && e.home && e.npcKey !== 'old_man') banners.push(e);
    }
    // 同房重复偏移（原版 num4：同 home 的排序在后计数 ×26）
    for (const n of banners) {
      const dup = banners.filter((o) => o !== n && o.home!.x === n.home!.x && o.home!.y === n.home!.y
        && banners.indexOf(o) > banners.indexOf(n)).length;
      // 从 home.y-1 向上找第一格“房界”(tileSolidLike——平台算天花板候选;
      // ★isSolid 会穿层:loft 下层的旗曾挂进上层同一行,2026-08-30 主因A修复)
      const cy = findBannerAnchorY(st, n.home!.x, n.home!.y);
      if (cy === null) continue;
      // 整面旗帜绘制（House_Banner_1 = 吊杆+垂布的完整旗，32×40 ≈ 2×2.5 格；
      // 用户对照官方原版实测旗帜约 4 格方形——此前按 Frame(2,2) 切 16×20 画小了）
      const bx = n.home!.x * 16 + 8;                    // 原版 num8=8 偏移
      // num9=18；实心格是平台（tile 19）时 -8（Main.cs:40212-40214）——
      // 平台只有半格厚，旗帜上移贴平台上表面
      const onPlatform = TILE_DEFS[st.type[st.idx(n.home!.x, cy)]]?.vanilla?.sheet === 19;
      const by = (cy + 1) * 16 + (onPlatform ? 10 : 18) + dup * 26;
      ctx.drawImage(cloth.img, cloth.sx, cloth.sy, cloth.sw, cloth.sh,
        bx - cloth.sw / 2, by - cloth.sh / 2, cloth.sw, cloth.sh);
      // 头像叠画（原版 TownNPCProfiles/TypeToDefaultHeadIndex NPC.cs:7489——head 索引≠NPC id）
      const headIdx = TOWN_NPC_HEAD_INDEX[n.vanillaId];
      const head = headIdx != null ? this.atlas.vmisc(`vanilla/NPC_Head_${headIdx}.png`) : null;
      if (head) {
        const hs = Math.min(1, 24 / Math.max(head.sw, head.sh));
        const hw = head.sw * hs, hh = head.sh * hs;
        ctx.drawImage(head.img, head.sx, head.sy, head.sw, head.sh,
          bx - hw / 2, by - hh / 2 + 2, hw, hh);
      }
      // 光照色调（原版 Lighting.GetColor(homeTileX, num3)：旗布头像受所在格光照染色。
      //  ★2026-08-31 改走 lightAt(tile) 纯数据通道——此前每旗每帧 1×1 回读合成
      //  lightCanvas（GPU-backed，无 willReadFrequently）= Chrome
      //  "Multiple readback operations" 警告源 + 每次回读强制管线停顿；
      //  且 vanilla 语义本就是【格光照】而非屏幕合成图，纯数据查表反而更忠实。
      //  越界/未就绪 → lightAt 回 [0,0,0] = 跳过染色（首帧全黑跳过语义同旧）。
      const rectW = cloth.sw, rectH = cloth.sh + 4;
      const lt = this.lighting?.lightAt(n.home!.x, cy) ?? [0, 0, 0];
      if (lt[0] + lt[1] + lt[2] > 0 && (lt[0] < 252 || lt[1] < 252 || lt[2] < 252)) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${lt[0]},${lt[1]},${lt[2]})`;
        ctx.fillRect(bx - rectW / 2, by - rectH / 2, rectW, rectH);
        ctx.restore();
      }
      // hover 名条（原版 40255+：鼠标悬停旗帜显示 NPC 名）
      if (this._mouseX >= 0) {
        const [mwx, mwy] = cam.screenToWorld(this._mouseX, this._mouseY);
        if (mwx >= bx - rectW / 2 && mwx <= bx + rectW / 2 && mwy >= by - rectH / 2 && mwy <= by + rectH / 2) {
          // FullName 语义（Lang.cs:416 GetNPCHouseBannerText → NPC.FullName:6657）：
          //  有个人名 → Game.NPCTitle（zh "{1}{0}"=类型名+个人名）；无 → 类型名
          const typeName = Lang.npcName(n.vanillaId) ?? n.npcKey;
          const label = n.givenName ? Lang.text('Game.NPCTitle', n.givenName, typeName) : typeName;
          ctx.font = '12px "Fusion Pixel 12px", sans-serif';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(20,16,28,0.85)';
          ctx.fillRect(bx - tw / 2 - 5, by - rectH / 2 - 20, tw + 10, 15);
          ctx.fillStyle = '#E8E4F0';
          ctx.textAlign = 'center';
          ctx.fillText(label, bx, by - rectH / 2 - 9);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  /** bound 姿态专属贴图表（原版 1:1：捆绑待救 NPC 是【独立 NPC 类型】而非 ai[0] 态——
   *  NPCID.cs:11275 BoundGoblin=105 / 11277 BoundWizard=106 / 11311 BoundMechanic=123 /
   *  11773 WebbedStylist=354 / 12243 GolferRescue=589；税务官则是地狱敌怪
   *  DemonTaxCollector(酷刑者)=534（净化粉命中 Transform 441，Projectile.cs:13651））。
   *  各表为单帧捆绑姿态（534 是 8 帧敌怪表、589 是 13 帧表），FindFrame 无专属 case → 恒帧 0 */
  /** NPCID.Sets.IsTownSlime（NPCID.cs:4448 Factory.CreateBoolSet）——坐姿 num47 再 −10 档 */
  private static readonly TOWN_SLIME_IDS = new Set([670, 678, 679, 680, 681, 682, 683, 684]);

  private static readonly BOUND_NPC_SHEET: Record<string, number> = {
    goblin_tinkerer: 105, wizard: 106, mechanic: 123, stylist: 354, golfer: 589, tax_collector: 534,
    town_slime_old: 685, town_slime_clumsy: 686,   // 抖动的旧宝箱 / 笨笨气球史莱姆（绑缚态单帧）
    angler: 376,   // 睡渔夫（旧档兜底：新档睡渔夫已是真 Enemy 376，历史存档的
                   // bound TownNPC 'angler' 用 NPC_376 睡姿表——缺此条目会整只不渲染）
    tavernkeep: 579,   // 醉酒酒保 BartenderUnconscious（SpawnAnNPC :1565 链；bound 态
                       // 34×8 单帧躺姿表——缺此条目 fallback NPC_550 站姿，2026-08-19 补）
  };

  /** bound NPC 姿态帧（各表帧 0）。589 在 vanilla-npcs.json 缺登记（json 缺口族，同 588/633/663）
   *  ——vnpc 懒加载会按 frames=1 把 62×624 整条画出，故此处显式帧数切片 */

  /** 派对变体贴图条 id 集（UpdateAltTexture NPC.cs:91250——441/453/633 永不 altTexture=1，
   *  对应 TownNPCs/{Name}_Default_Party 表已在 public/sprites/vanilla/NPC_{id}_Alt_1.png）
   *  ——2026-08-13 退役：派对/微光/狼人切表统一走 n.townSheet（TownNPCs 档案表，
   *  data/townNpcProfiles.ts），该表为 PARTY_ALT_IDS 严格超集（补 678-681/683/684
   *  史莱姆派对贴图与微光档） */

  // ---- 派对帽（Main.cs:26814-27089 DrawNPCExtras Extra[72] 1:1）----
  // NPCFramingGroup（NPCID.cs:4875：默认 0；18/20/208/178/124/353/633→1；369→2；
  // 160→3；宠物 637→4 / 638→5 / 656→6（每组帧数 28/28/26）；城镇史莱姆 670/678-684→7）
  private static readonly HAT_FRAMING_GROUP: Record<number, number> = {
    18: 1, 20: 1, 208: 1, 178: 1, 124: 1, 353: 1, 633: 1, 369: 2, 160: 3,
    637: 4, 638: 5, 656: 6,
    670: 7, 678: 7, 679: 7, 680: 7, 681: 7, 682: 7, 683: 7, 684: 7,
  };
  /** TownNPCsFramingGroups（NPCID.cs:4879-4928：8 组，值域 −6..+6——按帧行号的帽 Y 微调） */
  private static readonly HAT_FRAME_GROUPS: number[][] = [
    [0, 0, 0, -2, -2, -2, 0, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],          // 0（26）
    [0, 0, 0, -2, -2, -2, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],             // 1（25）
    [0, 0, 0, -2, -2, -2, 0, 0, -2, -2, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],            // 2（25）
    [0, 0, -2, 0, 0, 0, 0, -2, -2, -2, 0, 0, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0],                       // 3（22）
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 4, 6, 4, 2, 2, -2, -4, -6, -4, -2, -4, -4, -6, -6, -6, -4],// 4（28）
    [0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, 0, 0, -2, -2, 0, 0, 4, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4],      // 5（28）
    [0, 0, -2, -4, -4, -2, 0, -2, 0, 0, 2, 4, 6, 4, 2, 0, -2, -4, -6, -6, -6, -6, -6, -6, -4, -2],  // 6（26）
    [0, -2, 0, -2, -4, -6, -4, -2, 0, 0, 2, 2, 4, 2],                                               // 7（14，城镇史莱姆）
  ];
  /** HatOffsetY（NPCID.cs:4827：默认 0 的例外表） */
  private static readonly HAT_OFFSET_Y: Record<number, number> = {
    227: 4, 107: 2, 108: 2, 229: 4, 17: 2, 38: 8, 160: -10, 208: 2, 142: 2, 124: 2,
    453: 2, 37: 4, 54: 4, 209: 4, 369: 6, 441: 6, 353: -2, 633: -2, 550: -2, 588: 2, 663: 2, 656: 4,
  };
  /** num7 逐 type 水平微调（Main.cs:27010-27062；default 0） */
  private static hatXOffset(id: number): number {
    if (id === 550) return -4;
    if (id === 588) return 0;
    if (id === 227) return -4;
    if (id === 228 || id === 678 || id === 681 || id === 682) return -2;
    if ([17, 18, 19, 20, 22, 124, 229, 353, 633, 637, 638, 656, 670, 679, 680, 683, 684].includes(id)) return -1;
    if ([37, 38, 54, 107, 108, 160, 207, 209].includes(id)) return -3;
    if (id === 178 || id === 208 || id === 369) return 1;
    return 0;
  }

  /** 城镇史莱姆集（NPCID.Sets.IsTownSlime NPCID.cs:4446：670/678-684；绑缚态
   *  685/686 不在）——帽位 num5 取反 + 专属 num3/num4 档（Main.cs:26901-26928） */
  private static readonly HAT_TOWN_SLIME = new Set([670, 678, 679, 680, 681, 682, 683, 684]);

  /** num3 逐 type 档 + 帧修正（Main.cs:26845-26887：公主 663=1；宠物三档——
   *  637 猫基准 6（帧 19/22-27 −2、11-15 +2）、638 狗 12、656 兔基准 6（帧 1-3 −2、
   *  18-25 −4、8 −2）；城镇史莱姆（num5 另取反）：default 1、670/679 −1、681 −2、
   *  682 −1(num4+2)、683 −1(num4−2)、684 −4）。帧号 = frame.Y/帧高。
   *  返回 [num3, num4]。 */
  static hatNum3(id: number, frame: number): [number, number] {
    if (id === 663) return [1, 0];
    if (id === 637) {
      let v = 6;
      if (frame === 19 || (frame >= 22 && frame <= 27)) v -= 2;   // 20/21 不在表内
      else if (frame >= 11 && frame <= 15) v += 2;
      return [v, 0];
    }
    if (id === 638) return [12, 0];
    if (id === 656) {
      let v = 6;
      if (frame >= 1 && frame <= 3) v -= 2;
      else if (frame >= 18 && frame <= 25) v -= 4;
      else if (frame === 8) v -= 2;
      return [v, 0];
    }
    if (Renderer.HAT_TOWN_SLIME.has(id)) {
      if (id === 670 || id === 679) return [-1, 0];
      if (id === 681) return [-2, 0];
      if (id === 682) return [-1, 2];
      if (id === 683) return [-1, -2];
      if (id === 684) return [-4, 0];
      return [1, 0];   // 678/680 与 default
    }
    return [0, 0];
  }

  /** 攻击/坐姿态 X 修正（Main.cs:27001-27008）：海盗 229 攻击态 ai[0]==12 → −4×dir；
   *  酒保 550 坐姿 ai[0]==5 → +7×dir。仓内映射：229 = TownNPC.attackState 12
   *  （TOWN_ATTACK_TYPE[229]=1 弓 → atkState 12，AI_007 :55902 同 ai[0] 值）；
   *  550 = TownNPC.sitting（调用方传 ai0=5，drawPartyHat 还原） */
  static hatStateOffsetX(id: number, ai0: number): number {
    if (id === 229 && ai0 === 12) return -4;
    if (id === 550 && ai0 === 5) return 7;
    return 0;
  }
  /** GetPartyHatColor（NPC.cs:67246-67269：name+whoAmI+moonPhase → 5 色格）；
   *  色格映射 Main.cs:26824-26838（1→0 蓝/2→16 粉/3→17 青/4→18 紫/5→19 白） */
  private static partyHatCell(name: string, whoAmI: number, moonPhase: number, isDay: boolean): number {
    if (!name) return 0;
    let num = name.length + name.charCodeAt(0);
    const m = isDay ? moonPhase - 1 : moonPhase;
    num += whoAmI;
    num += m * (whoAmI % 2 === 0 ? 1 : -1);
    if (num < 0) num += 5;
    num %= 5;
    if (num === 0) num++;
    return num === 1 ? 0 : num + 14; // 2→16 / 3→17 / 4→18 / 5→19
  }

  /** 派对帽叠画（UsesPartyHat NPC.cs:67221-67244：441/37/633 恒不戴；
   *  帽锚=脚底中心同体绘制块（bottom+vector，origin=帽底 12px），随 facing 镜像） */
  private drawPartyHat(ctx: CanvasRenderingContext2D, n: TownNPC, world: World) {
    // UsesPartyHat 排除（67223-67226）
    if (n.vanillaId === 441 || n.vanillaId === 37 || n.vanillaId === 633) return;
    const sheet = this.atlas ? this.atlas.ensureVImage('vanilla/Extra_72.png') : null;
    if (!sheet) return;
    const num = n.frame; // frame.Y / frame.Height
    const group = Renderer.HAT_FRAME_GROUPS[Renderer.HAT_FRAMING_GROUP[n.vanillaId] ?? 0]
      ?? Renderer.HAT_FRAME_GROUPS[0];
    // num3/num4 逐 type 档 + 宠物帧修正（Main.cs:26845-26887，含宠物 637/638/656
    // 三分支——E 批曾略；663 公主头部前伸亦并入）
    const [hatNum3, num4] = Renderer.hatNum3(n.vanillaId, num);
    let num5 = n.facing; // spriteDirection（facing>0=朝右=镜像同体块）
    // 城镇史莱姆帽位随胖体翻转（Main.cs:26903 num5*=−1）
    if (Renderer.HAT_TOWN_SLIME.has(n.vanillaId)) num5 = -num5;
    // 攻击/坐姿 X 修正（Main.cs:27001-27008）：229 弓态 ai[0]==12 −4×dir / 550
    // 坐姿 ai[0]==5 +7×dir——ai0 还原：坐姿 = 5（TownNPC.sitting），否则 attackState
    const ai0 = n.sitting ? 5 : n.attackState;
    const stateX = Renderer.hatStateOffsetX(n.vanillaId, ai0);
    const cell = Renderer.partyHatCell(n.givenName, n.id, world.clock.moonPhase ?? 0, world.clock.isDay);
    const W = 38, H = 34; // Extra_72 格 40×36 −2 边缘（:26840-26841）
    // vector 装配（:26961-27065）：原版 -(0,h) 自 Bottom=盒顶;中心锚(2026-08-24)后
    //   局部顶=−h/2。(-2*num5,0) → +num3*num5 → +array[num] → +HatOffsetY
    //   → +num6（坐姿 Y 链） → +态修正×num5 → +num7*num5 → +4*num5
    const vx = -2 * num5 + hatNum3 * num5
      + stateX * num5 + Renderer.hatXOffset(n.vanillaId) * num5 + 4 * num5;
    const vy = -(n.h / 2) + (group[num] ?? group[0]) + num4 + (Renderer.HAT_OFFSET_Y[n.vanillaId] ?? 0)
      + (n.sitting ? sittingHatY(n.vanillaId) : 0);   // num6 链（:26965-26987：默认 −4，
    // 637 猫 −12 / 663 公主 −8 / 38 −8 / 124 −2 / 108·178 −6；550/588 原版显式 −4=默认）
    // origin = (W/2, H-12)（:27009）→ drawImage 左上 = (vx − W/2, vy − (H−12))
    ctx.drawImage(sheet, cell * 40, 0, 40, 36, vx - W / 2, vy - (H - 12), W, H);
  }

  private boundNpcSheet(n: TownNPC): DrawRect | null {
    const id = Renderer.BOUND_NPC_SHEET[n.npcKey];
    if (!id || !this.atlas) return null;
    const img = this.atlas.ensureVImage(`vanilla/NPC_${id}.png`);
    if (!img) return null;
    const frames = id === 589 ? 13 : id === 534 ? 8 : id === 376 ? 2 : 1;
    const fh = Math.max(1, Math.floor(img.height / frames));
    return { img, sx: 0, sy: 0, sw: img.width, sh: Math.min(fh, img.height) };
  }

  /** Utils.DrawNotificationIcon（Utils.cs:445-464）——NPC 任务"!"图标：
   *  亮度脉冲 sin(2π·t)白↔半透 + 摇摆旋转 sin(2π·t/2)·2π·0.035·rotMul,
   *  worldSpace 时乘所在格光照;origin=(w/2, h-4)。rotMul=1 头顶/0 按钮 */
  private drawNotificationIcon(ctx: CanvasRenderingContext2D, x: number, y: number, rotMul: number, worldSpace: boolean): void {
    const img = quickiconImg();
    if (!img) return;
    const t = performance.now() / 1000;
    const amount = Math.sin(Math.PI * 2 * (t % 1)) * 0.5 + 0.5;
    let cr = 255, cg = 255, cb = 255;
    if (worldSpace) {
      const [lr, lg, lb] = this.lighting?.lightAt(Math.floor(x / TILE), Math.floor(y / TILE)) ?? [255, 255, 255];
      cr = lr; cg = lg; cb = lb;
      // worldSpace 位置由调用方给屏幕坐标——此处只管色
    }
    const rot = Math.sin((t % 2) / 2 * Math.PI * 2) * Math.PI * 2 * 0.035 * rotMul;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = 1 - amount * 0.5;
    ctx.drawImage(img, -img.width / 2, -(img.height - 4), img.width, img.height);
    ctx.globalAlpha = 1;
    void cr; void cg; void cb;   // 贴图自带暖黄色,光照乘色经 globalAlpha 近似脉冲
    ctx.restore();
  }

  /** ★批III尾窗：RainbowTownSlime pass 逐帧烘焙（Main.cs:25780）。输入=本体帧切片，
   *  t0Rect=帧在 NPC 表内的位置（uSourceRect/uImageSize0 语义=SpriteBatch 子矩形）；
   *  uTime=GlobalTimeWrappedHourly（preshader 内 ×0.16 相位）。失败（pass 缺失/画布
   *  不可用）返回 null = 回退平贴。
   *  ★B1 同款（2026-09-03）：200ms 时间桶缓存（相位动画 ≈5fps 语义可接受）——
   *  此前单 scratch 每帧重跑 SM2（彩虹微光史莱姆常驻时逐帧全 cell pass）。 */
  private rainbowSlimeCache = new Map<string, HTMLCanvasElement>();
  private rainbowSlimePruneAt = 0;
  private bakeRainbowSlimeFrame(r: DrawRect, pass: NonNullable<ReturnType<typeof getPass>>): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const bucket = Math.floor(performance.now() / 200);
    const key = `${r.sx},${r.sy},${r.sw}x${r.sh}|${bucket}`;
    const cached = this.rainbowSlimeCache.get(key);
    if (cached) return cached;
    if (performance.now() - this.rainbowSlimePruneAt > 2000) {
      this.rainbowSlimePruneAt = performance.now();
      while (this.rainbowSlimeCache.size >= 8) this.rainbowSlimeCache.delete(this.rainbowSlimeCache.keys().next().value as string);
    }
    const cv = document.createElement('canvas');
    cv.width = r.sw; cv.height = r.sh;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
    const id = cx.getImageData(0, 0, r.sw, r.sh);
    const u = defaultUniforms();
    u.uTime = (performance.now() / 1000) % 3600;
    u.uSourceRect = [r.sx, r.sy, r.sw, r.sh];
    u.uImageSize0 = [r.img.width, r.img.height];
    runPassOnImageData(pass, id.data, r.sw, r.sh, u, [],
      { sx: r.sx, sy: r.sy, sheetW: r.img.width, sheetH: r.img.height });
    cx.putImageData(id, 0, 0);
    this.rainbowSlimeCache.set(key, cv);
    return cv;
  }

  private drawTownNPC(n: TownNPC, world?: World) {
    const ctx = this.ctx;
    // 血条统一走实体循环的 drawHealthBar(原版 HealthBar1/2 贴图版,Main.cs:21721+;
    // 此前这里另画早期程序化矩形条 = 双血条,已移除)
    // 表情气泡统一走实体层的 EmoteBubble 模块(drawEmotes :1112,并行会话 1:1 版:
    // GetPosition 头顶锚/开合帧/8tick 图标帧)——本函数的内联气泡版已退役(双画,
    // 与双血条同病;review 2026-08-13)
    // ---- 原版贴图条（Images/NPC_{id}，40×56 帧、默认朝左）：帧语义见 TownNPC.fixedUpdate ----
    // 注意：不再回退 Maples 角色/NPC_1.png——那是原版绿史莱姆贴图（Maples 沿用原版命名），
    // 曾导致全部城镇 NPC 显示为史莱姆
    if (this.atlas) {
      // bound 态：走专属捆绑姿态表（原版是独立 NPC 类型，见 BOUND_NPC_SHEET 注释）
      // ---- TownNPCs 档案切表（DrawNPCCheckAlt Main.cs:22304-22309 → profile.
      //      GetTextureNPCShouldUse）：n.townSheet 按微光档（townNpcVariationIndex，
      //      = shimmered）+ altTexture（1 派对 / 2 狼人）选 {Name}_Default{,_Party,
      //      _Transformed} / Shimmered_{Name}_…；无档案类型（637/638/656 宠物）返回
      //      null → 落回 NPC_{id} 竖条 ----
      const sheetPath = n.bound ? null : n.townSheet;
      const profileImg = sheetPath ? this.atlas.ensureVImage(sheetPath) : null;
      let r: DrawRect | null;
      if (profileImg) {
        // 帧数 = vanilla-npcs.json frames（见 townSheetFrameCount 口径注）;
        // idx 钳位保证任何数据出入都界内
        const count = townSheetFrameCount(n.vanillaId);
        const fh = Math.floor(profileImg.height / count);
        const idx = Math.max(0, Math.min(count - 1, n.frame));
        r = { img: profileImg, sx: 0, sy: idx * fh, sw: profileImg.width, sh: fh };
      } else {
        r = n.bound ? this.boundNpcSheet(n) : this.atlas.vnpc(n.vanillaId, n.frame);
      }
      // (落脚补偿 v6 起为内禀计算,不再依赖本处路径判定)
      if (r) {
        ctx.save();
        // 中心锚（2026-08-24 勘误,同 drawEnemy）：城镇 NPC 原版走同一 DrawNPC 通用
        // 尾段（帧中心钉盒中心+NPCAddHeight :23658）——曾按误读的"底锚+4"画,城镇族
        // 52/60 帧带底边距偏差 2-8px（巫师/染料商/旅行商 −8、城镇史莱姆 −7~8）。
        // num46:108 巫师 +2（:23227）;坐姿运行时减档（NPCAddHeight 尾 :22377-22386
        // townNPC&&ai[0]==5：−4,124 再 −2,637 猫/656 兔/城镇史莱姆 670+678-684 再 −10）
        const nidT = n.vanillaId ?? -1;
        let addYT = (nidT === 108 ? 2 : 0) + (Renderer.HB_ADD_H[nidT] ?? 0);
        // ★「落脚贴合」v6.1:坐姿不再豁免——原版 -4/-10 坐姿档是"猜"的逐型常数,
        // 对 64px cell 的染料商不够(实测坐姿仍沉 6px)。改为统一由内禀扫描精确对齐。
        // 示波器(window.__FLUSHDBG)已归档,不再需要
        if (npcFootFlushOn() && !npcFootBiasExempt(nidT)) {
          const fmaxRow = npcContentBottomRow(r.img, r.sy, r.sw, r.sh);
          if (fmaxRow >= 0) {
            const dyTargetT = n.h / 2 - fmaxRow - 1;
            let flushT = Math.round((dyTargetT - (-r.sh / 2 + addYT)) * 100) / 100
              + npcFootBiasExtra() + npcFootBiasOverride(nidT);
            flushT = Math.max(-24, Math.min(24, flushT));
            addYT += flushT;
          }
        }
        ctx.translate(n.cx, n.cy); // 盒中心
        if (n.facing > 0) ctx.scale(-1, 1); // 原版贴图默认朝左，向右镜像
        // 微光转化渐显/渐隐（GetAlpha NPC.cs:94874-94878：CurrentlyShimmerTransparent
        // → 全通道 ×(1−shimmerTransparency)）——st 由 TownNPC 微光链驱动（浸微光
        // +0.01/t、转化置 0.89、上升态 −1/60/t）。派对帽同 save 块内继承该 alpha，
        // 恰好等价原版帽档 num8 = 1−st（Main.cs:27073-27075）
        ctx.globalAlpha = shimmerBodyAlpha(n.shimmerTransparency);
        if (n.iframes > 0 && n.iframes % 4 < 2) ctx.filter = 'brightness(2.5)'; // 受击闪白
        // ---- ★批III尾窗：彩虹镇史莱姆 676/681 本体 RainbowSlime pass（Main.cs:25780
        //      GameShaders.Misc["RainbowTownSlime"].Apply(DrawData)——SM2 字节码经
        //      t0Rect 表空间映射逐帧烘焙；uTime preshader 内部 ×0.16；位置相由
        //      uSourceRect/uImageSize0 同源。相序 40×56 帧小窗,每帧重烘焙可负担
        if (nidT === 676 || nidT === 681) {
          const rsp = getPass('RainbowTownSlime');
          const baked = rsp ? this.bakeRainbowSlimeFrame(r, rsp) : null;
          if (baked) {
            ctx.drawImage(baked, -r.sw / 2, -r.sh / 2 + addYT, r.sw, r.sh);
          } else {
            ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2 + addYT, r.sw, r.sh);
          }
        } else {
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2 + addYT, r.sw, r.sh);
        }
        // ---- 160/209 Glow 变体档（Main.cs:25769-25799，S 备案 npcGlowVariantTex 接通）----
        //      城镇 NPC 不经 drawNpcGlow → 本体后挂同档 Glow：Color(128−α/2,×3,0)
        //      A=0 → 'lighter' 加性（'128a2' 同款表达式）；160 松露人微光态 Glow_352、
        //      209 电子人微光态按 altTexture 选 Glow_350(≠1)/Glow_351(==1)。α=城镇 NPC
        //      静态 0 → 128/255；160 档的 shimmerTransparency RGB 衰减（:25771-25776）
        //      经 shimmerGlowAlpha 落在 alpha 上（加性混合下 ×(1−st) 等价），209 无此档。
        //      表布局与 NPC 表同构 → 帧 = 当前 townSheet 行（微光档案表帧高可异于本体，
        //      故按 Glow 表自身高/帧数切片，行号取 n.frame）
        const glowTex = n.bound ? null : Renderer.npcGlowVariantTex(n.vanillaId, n.shimmered, n.altTexture);
        if (glowTex) {
          const gi = this.atlas.ensureVImage(glowTex);
          if (gi && (gi.width > 0) && gi.width) {
            const gCount = townSheetFrameCount(n.vanillaId);
            const gfh = Math.max(1, Math.floor(gi.height / gCount));
            const gIdx = Math.min(gCount - 1, Math.max(0, n.frame));
            const op = ctx.globalCompositeOperation;
            const ga = ctx.globalAlpha;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = shimmerGlowAlpha(128 / 255, n.vanillaId === 160 ? n.shimmerTransparency : 0);
            // (128 − α/2)/255 × (1−st)（α=0；st 衰减仅 160，:25771-25776）
            ctx.drawImage(gi, 0, gIdx * gfh, gi.width, gfh, -r.sw / 2, -r.sh / 2 + addYT, r.sw, r.sh);
            ctx.globalCompositeOperation = op;
            ctx.globalAlpha = ga;
          }
        }
        // 124 电工变体头饰（Main.cs type==124 localAI[0]==0 + Extra_263：DrawNPC
        //  :22900-22930 段 townNpcVariationIndex==1 时换 Extra_263 贴图画头顶装备。
        //  2026-08-27 DrawNPC 附加贴图审计缺口——TownNPC 路径补接）
        if (n.vanillaId === 124 && !n.bound) {
          const vIdx = (n as unknown as { townNpcVariationIndex?: number }).townNpcVariationIndex ?? 0;
          if (vIdx === 1) {
            const eg = this.atlas.ensureVImage('vanilla/Extra_263.png');
            if (eg) {
              ctx.save();
              ctx.drawImage(eg, -eg.width / 2, -r.sh / 2 + addYT - eg.height + 4, eg.width, eg.height);
              ctx.restore();
            }
          }
        }
        if (this.scene?.partyUp && world) this.drawPartyHat(ctx, n, world);
        ctx.filter = 'none';
        ctx.restore();
        // ---- AttackType1 持械（DrawNPCExtras :27598-27695）：弓/枪族攻击态
        //      ai[0]==12 全程手持武器图标——旋转 = ai[2]×90°×朝向；228/229/209 原版
        //      提前 return 无持械（表里不列即同效）。传本体帧几何供 Extra_52/53 overlay
        if (!n.bound && n.attackState === 12) this.drawTownHoldout(ctx, n, r, addYT);
        // ---- AttackType2/3（:27697-27760）：魔法施法光环 / 近战挥砍武器——
        //      2026-08-25 review 补齐（此前整块缺失：服装商/巫师/松露人/树妖施法
        //      无光环,动物学家等挥砍无武器）----
        const nAt = TOWN_ATTACK_TYPE[n.vanillaId];
        if (!n.bound && nAt === 2 && n.attackState === 14) this.drawTownMagicAura(ctx, n);
        if (!n.bound && nAt === 3 && n.attackState === 15) this.drawTownMeleeSwing(ctx, n);
        return;
      }
      // 贴图条懒加载首帧未就绪：落入下方程序化兜底，本帧后懒加载完成
    }
    const spr = this.assets.enemySprites.get(n.npcKey);
    if (!spr) return;
    ctx.save();
    ctx.translate(n.cx, n.cy);
    ctx.scale(n.facing >= 0 ? 1 : -1, 1);
    ctx.drawImage(spr.canvas, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
    ctx.restore();
  }

  /** AttackType1（弓/枪族）攻击态持械（DrawNPCExtras :27598-27695 1:1）。
   *  触发 = AttackType==1 && ai[0]==12（攻击态全程）；228/229/209 原版提前 return
   *  ——TOWN_HOLDOUT 不列即同效。
   *  锚 = Bottom − OffsetsNPCOffhand[2](14,26)，spriteDirection==1 时偏移 X 取负；
   *  旋转 = ai[2]×90°×spriteDirection（ai[2]=目标方向 Y 分量,连续值 ±0.5 门控
   *  :56052-56054——非 90° 整数倍是原版本相）；握位 num12 = DrawPlayerItemPos.X − num11
   *  （★DrawPlayerItemPos 尾 `result.X = num` = per-item 常量 ITEM_POS_NUM,默认 10
   *  ——曾误用帧宽/2 → 旅商左轮 num12 差 24px 持枪浮空,2026-08-25 用户实报）。
   *  368 特例：hm&&aim>-0.1 锚 Y+4 / !hm&&aim<-0.1 锚 Y-8（:27612-27618）；
   *  22/368 攻帧行≥21 再画 Extra_52/53（微光 264/265）五帧持枪手 overlay——帧锚定
   *  本体帧中心+4+addY,origin=本体帧半尺寸,原生尺寸不缩放（:27676-27695）。
   *  右向 dx=num12、左向经 scale(-1,1) 镜像（=原版 origin=(W+num12,H/2)+Flip 等价）。 */
  private drawTownHoldout(ctx: CanvasRenderingContext2D, n: TownNPC,
    frame: { sw: number; sh: number }, addY: number): void {
    const ho = TOWN_HOLDOUT[n.vanillaId];
    if (!ho || !this.atlas) return;
    const hm = n.hardMode && ho.hm !== undefined;
    const itemId = hm ? ho.hm! : ho.pre;
    const icon = this.atlas.vicon(itemId);
    if (!icon) return;
    const iconImg = icon.img as HTMLImageElement;   // vicon 恒 Image 背书（atlas 懒加载）
    if (!(iconImg.width > 0) || !iconImg.width) return;
    const aim = n.holdoutAim;
    const sd = n.facing;                                    // spriteDirection（+1 右 / −1 左）
    let ax = n.cx - (sd === 1 ? -14 : 14);                  // Bottom − OffsetsNPCOffhand[2]
    let ay = n.y + n.h - 26;
    if (n.vanillaId === 22 && aim > -0.1) ay += 4;          // 向导扶弓
    if (n.vanillaId === 19 && hm) { ax -= 10 * sd; ay += 4; } // 爆破专家霰弹枪
    if (n.vanillaId === 368 && hm && aim > -0.1) ay += 4;   // :27612-27614
    if (n.vanillaId === 368 && !hm && aim < -0.1) ay -= 8;  // :27615-27617 旅商下瞄抬枪
    let grip = ho.grip ?? 4;
    let sc = ho.scale ?? 1;
    if (n.vanillaId === 368) {                              // :27645-27659 旅商
      if (hm) grip = 18;
      else { if (aim < -0.1) grip = ho.preGripAimDown ?? 4; sc = ho.preScale ?? 1; }
    }
    const num12 = (ITEM_POS_NUM[itemId] ?? 10) - grip;      // DrawPlayerItemPos.X − num11
    ctx.save();
    ctx.globalAlpha = shimmerBodyAlpha(n.shimmerTransparency);
    ctx.translate(Math.round(ax), Math.round(ay));
    ctx.rotate(aim * (Math.PI / 2) * sd);
    if (sd === -1) ctx.scale(-1, 1);
    ctx.drawImage(iconImg, icon.sx, icon.sy, icon.sw, icon.sh,
      num12, -icon.sh / 2, icon.sw * sc, icon.sh * sc);
    ctx.restore();
    // ---- 22/368 持枪手 overlay（:27676-27695）：攻帧行≥21,Extra_52/53 竖 5 帧
    //      （微光 264/265）,帧锚 = 本体帧中心+(0,4+addY),origin=本体帧半尺寸,
    //      原生尺寸（n.scale=1）,镜像随本体,rotation=n.rotation（城镇 NPC 恒 0）----
    if ((n.vanillaId === 22 || n.vanillaId === 368) && n.frame >= 21) {
      const tex = n.vanillaId === 22
        ? (n.shimmered ? 'Extra_264' : 'Extra_52')
        : (n.shimmered ? 'Extra_265' : 'Extra_53');
      const img = this.atlas.ensureVImage(`vanilla/${tex}.png`);
      if (img && img.width > 0) {
        const eh = Math.max(1, Math.floor(img.height / 5));
        const fi = Math.min(4, Math.max(0, n.frame - 21));
        ctx.save();
        ctx.globalAlpha = shimmerBodyAlpha(n.shimmerTransparency);
        ctx.translate(n.cx, n.cy + 4 + addY);
        if (n.facing > 0) ctx.scale(-1, 1);
        ctx.drawImage(img, 0, fi * eh, img.width, eh,
          -frame.sw / 2, -frame.sh / 2, img.width, eh);
        ctx.restore();
      }
    }
  }

  /** swing 形状（Game.swing / 远端 swingNet 同构）。
   *  useStyle 分族 + aim（useStyle 5/13 的瞄准角）由 Game.useSwing 写入 */
  /** AttackType2 施法光环（DrawNPCExtras :27697-27705）：Extra_51 竖 4 帧
   *  （帧 = frameCounter%48/12,本仓以态内 tick atkTick 代——同为逐 tick 推进），
   *  锚 = Bottom+(0,4)、origin=帧底中心，乘色 = MagicAuraColor 表（A=127 经
   *  globalAlpha）；微光变体：160 BGR 互换 / 20→(90,20,210) / 663→(255,0,77)
   *  （GetMagicAuraColor 三连覆盖 NPC.cs:53468-53482，663 支 B-F9 补齐） */
  private drawTownMagicAura(ctx: CanvasRenderingContext2D, n: TownNPC): void {
    if (!this.atlas) return;
    const img = this.atlas.ensureVImage('vanilla/Extra_51.png');
    if (!img || !(img.width > 0)) return;
    const fh = Math.max(1, Math.floor(img.height / 4));
    const fi = Math.floor((n.attackTick % 48) / 12);
    let [r, g, b] = TOWN_MAGIC_AURA_COLOR[n.vanillaId] ?? [255, 255, 255];
    if (n.vanillaId === 160 && n.shimmered) { const t = r; r = b; b = t; }
    if (n.vanillaId === 20 && n.shimmered) { r = 90; g = 20; b = 210; }
    // ★对抗修复批③ B-F9：663 公主变体档缺支补齐——GetMagicAuraColor 三连覆盖
    // （NPC.cs:53468-53482）原样照录：`type==663 && variation==1 → (255,0,77,A)`
    // （A 走 globalAlpha 127 档）。AddLight 同色源无需动：TownNPC.lightRGB 的
    // magicAuraColor() 已含 663 微光分支（NPC.cs:53329 字面同值）。
    if (n.vanillaId === 663 && n.shimmered) { r = 255; g = 0; b = 77; }
    ctx.save();
    ctx.globalAlpha = 127 / 255;
    tintIconRect(ctx, { img, sx: 0, sy: fi * fh, sw: img.width, sh: fh },
      { x: Math.round(n.cx - img.width / 2), y: Math.round(n.y + n.h + 4 - fh), w: img.width, h: fh },
      [r, g, b]);
    ctx.restore();
  }

  /** AttackType3 近战挥砍（DrawNPCExtras :27705-27760）：武器 4 默认 / 3349(207) /
   *  3352(353) / 3351(441)，持位+旋转 = GetSwingStats（AttackTime×2, ai[1], dir,
   *  rect,rect——rect=TOWN_SWING.rect=num13）+ 末段 zero.Y=12 + 中段外扩 num14；
   *  origin = (sd!==1 ? W : 0, H) 底角、effect^FlipH（本仓 scale(-1,1) 等价） */
  private drawTownMeleeSwing(ctx: CanvasRenderingContext2D, n: TownNPC): void {
    if (!this.atlas) return;
    const item = n.vanillaId === 207 ? 3349 : n.vanillaId === 353 ? 3352 : n.vanillaId === 441 ? 3351 : 4;
    const icon = this.atlas.vicon(item);
    if (!icon) return;
    const atkTime = TOWN_ATTACK_TIME[n.vanillaId] ?? 30;
    const rect = TOWN_SWING[n.vanillaId]?.rect ?? 32;
    const num14 = n.vanillaId === 441 ? 0.1 : n.vanillaId === 207 || n.vanillaId === 353 ? 0.15 : 0;
    const zeroY = n.attackTimer > atkTime * 0.66 ? 12 : 0;
    const st = townSwingStats(atkTime * 2, n.attackTimer, n.facing, rect, rect, n.cx, n.y);
    const vx = st.x + (st.x - n.cx) * num14;
    const vy = st.y + zeroY;
    ctx.save();
    ctx.globalAlpha = shimmerBodyAlpha(n.shimmerTransparency);
    ctx.translate(Math.round(vx), Math.round(vy));
    ctx.rotate(st.rot);
    if (n.facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(icon.img as CanvasImageSource, icon.sx, icon.sy, icon.sw, icon.sh,
      0, -icon.sh, icon.sw, icon.sh);
    ctx.restore();
  }

  /** 游泳腿相位（Player.cs:35791-35805 legFrameCounter 状态机）：swimTime>0 期间
   *  counter 每 tick +2、每 8 进一行（行 7..19 回绕钳制）——counter 只在非游泳分支
   *  清零（vy≠0 行 5 / 站立行 0），入水时残留恒 0 → 相位 = 自进入连续游泳段起每 4t
   *  一行。miscCounter（tick 域单调、wrap 300）差分驱动：首次入水记 m0，行推进
   *  d=floor(((cur−m0+300)%300)/4)；人鱼 swimTime 刷新（≤10 → 30）不重置 counter
   *  ——差分链自然保持（连续性同原版）。行序列：入水行 5 →6→钳19，之后 7..19 循环。
   *  WeakMap 键 = Player（swimTime 归零即删——离水 vy≠0 分支清 counter 同构） */
  private static swimPhase = new WeakMap<Player, number>();
  /** body/legs 双行（原版两条独立状态机：腿链 Player.cs:35718-35855、身体链
   *  :35874-36186——use 行/静持行只钉身体，腿照常 legFrame 循环；行走时身体同步
   *  腿（:36184-36186 bodyFrame.Y = legFrame.Y）。行序 1:1 照源码分支排布）。
   *  legArmorId = 腿甲槽位 id（legs==140 神灯诅咒特殊行 :36195-36208——主链整体
   *  跳过，行 = vy≠0?1:0、身体行∈{7,8,9,14,15,16}（OffsetsPlayerHeadgear.Y==0）→7、
   *  翼 22/28→0；legs==217 坐/睡强制行 5 :36202-36206） */
  private playerFrameRows(p: Player,
    swing: { useStyle?: number } | null, holdStyleRaw: number,
    mnt: import('../entities/Mounts').MountInstance | null, cart: unknown,
    legArmorId: number,
  ): { body: number; legs: number } {
    const useRow = swing ? this.useStyleBodyRow(swing as never, p) : -1;
    const mountActive = !!(mnt || (p.ridingCart && cart));
    const mtype = p.mount.type;
    const noLegOverride = !!MOUNT_SETS.DoesNotOverrideLegFrames?.[mtype];   // 57-60 滚轴鞋
    const noBodyOverride = !!MOUNT_SETS.DoesNotOverrideBodyFrames?.[mtype];
    const latched = p.grappleProjs.find((g) => g.latched) ?? null;
    const wing = p.equipStats.wing;
    // ShouldDrawWingsThatAreAlwaysAnimated（:30271）——22/28/45 翼腿行 0 门
    const wingsAlways = p.vy !== 0 && !mountActive && !latched
      && !(p.inWater && (p.equipStats.flipper || p.buffs.has(BuffType.FlipperPotion)));
    const leg140 = legArmorId === 140;               // :35786 legs!=140 门（主链跳过）
    // ---- 腿链（:35718-35731 坐骑钉行 / :35786-35855 循环族 / :35858-35877 覆写族）----
    let legs: number;
    if (mountActive && !noLegOverride) {
      legs = (mtype === 23 || mtype === 45 || mtype === 48) ? 0 : 6;   // 普通坐骑行6（含矿车）
      Renderer.swimPhase.delete(p);
    } else if (p.swimTime > 0 && !leg140) {
      // 划水循环 +2/t 行 7..19（:35792-35805）——相位见 swimPhase 注释
      let m0 = Renderer.swimPhase.get(p);
      if (m0 === undefined) m0 = p.miscCounter;
      else if (p.miscCounter < m0) m0 -= 300;        // miscCounter wrap 300 → 虚拟轴滚动
      Renderer.swimPhase.set(p, m0);
      const d = p.miscCounter - m0;                  // 连续游泳 tick 数（虚拟单调）
      let row = 5;                                   // 入水时上一行（vy≠0 分支行 5）
      const adv = Math.floor(d / 4);                 // counter=d×2，每 8 一行
      for (let k = 0; k < adv; k++) {                // 逐行钳（while 语义）
        row += 1;
        if (row < 7) row = 19;
        else if (row > 19) row = 7;
      }
      legs = row;
    } else if (p.vy !== 0 || latched) {
      Renderer.swimPhase.delete(p);                  // vy≠0 分支 counter=0（:35807-35810）
      legs = (wing && (wing.slot === 22 || wing.slot === 28 || wing.slot === 45) && wingsAlways) ? 0 : 5;
    } else if (p.vx !== 0 && p.onGround) {
      Renderer.swimPhase.delete(p);                  // 站立/行走分支 counter=0（:35824/35850）
      // 行走循环（:35817-35847）：counter += |vx|·1.3、每 8 进一行、行 7..19 回绕；
      // 滚轴鞋（IsRollerSkates）满速档每 tick +2（:35830-35833 counter=2.0）。
      // animTime = |vx| 逐 tick 累计（走停清零）→ counter = animTime × 速率
      const skates = !!MOUNT_SETS.IsRollerSkates?.[mtype] && mountActive;
      // ★打滑面/滚轴鞋上无左右输入（:35818-35826）：(slippy||slippy2||windPushed||
      // flag8) && !controlLeft && !controlRight → counter=0、腿钉行 0（惯性滑行
      // vx≠0 但无输入，不走循环）。slippy={161,162,127,163,164,200,659}、slippy2=197
      // （FloorCheck :23454-23455，读 p.floorTileT）；windPushed（:35819 原版风推旗，
      // :11432 置位）本引擎无风推模拟不列——普通地面无输入滑行（击退余速）原版走
      // 行走循环，与本门不冲突。曾有门 |vx|>0.3 无输入照走循环 = 冰面滑行腿跑步
      const ft = p.floorTileT;
      // 内部 id 集（Player.ICE_SLIP_IDS——★曾用原版 sheet id 对比永不命中=死门）
      const slideNoInput = (ICE_SLIP_IDS.has(ft) || ft === FROZEN_SLIME_ID || skates)
        && p.inputX === 0;
      if (slideNoInput) {
        legs = 0;
      } else {
        const ratePerTick = skates && Math.abs(p.vx) >= (p.equipStats.accRunSpeed || 3) ? 2 : 1.3;
        legs = 7 + Math.floor((p.animTime * ratePerTick) / 8) % 13;
      }
    } else {
      Renderer.swimPhase.delete(p);
      legs = 0;
    }
    if (!p.onGround && p.carpetTime > 0) legs = 0;   // 飞毯滑翔腿钉 0(:35858-35863;
    // ★门=滑翔中(airborne)非燃料>0——2026-08-16 水体批把 onGround 重置段写了
    // carpetTime=300 回满,落地恒 300 → 旧门把地面走路腿钉死站立帧(用户实报)
    if (p.performingJump === 'Sandstorm') legs = 0;                  // 沙暴跳腿钉 0（:35865-35877）
    // ---- 身体链（:35874-36186，else-if 序 1:1）----
    let body: number;
    if (useRow >= 0) body = useRow;                       // useStyle 行（:35879-36018）
    else if (holdStyleRaw === 1 || holdStyleRaw === 3 || holdStyleRaw === 5) body = 3;   // :36025-36040
    else if (holdStyleRaw === 2) body = 2;                // :36036
    else if (holdStyleRaw === 4 && p.onGround && p.gravDir === 1) body = 0;             // :36042-36049
    else if (holdStyleRaw === 7) body = 11;               // :36042-36045（物品本身不画）
    else if (p.shieldRaised) body = 10;                   // 盾举行10（:36052-36055）
    else if (mountActive && !noBodyOverride) body = p.mount.bodyFrame;  // :36056-36060（矿车=3）
    else if (latched) {
      body = latched.y < p.y ? 2 : latched.y > p.y + p.h ? 4 : 3;     // :36061-36096
      if (p.gravDir === -1 && body !== 3) body = body === 2 ? 4 : 2;
    }
    else if (p.inWater && !p.inputDown && (p.equipStats.canFloat || (p.ridingMount && p.mount.type === 37))
      && (!p.ridingMount || p.mount.type === 37)) body = 10;           // 浮水行10（:36098-36100 + :3856-68——canFloatInWater=4404 甲件(:13364-67)∪buff265 火烈鸟坐骑(:9982-86,本仓以骑 37 等价表达)；Flipper 药 109 只授 ignoreWater+accFlipper(:10257-59) 不入 canFloat 源——R1-F1 2026-09-03 同根残留清偿）
    else if (p.swimTime > 0) body = p.swimTime > 20 ? 0 : p.swimTime > 10 ? 5 : 0;     // :36102-36119
    else if (p.vy !== 0) {
      if (p.eocDash > 0) body = 6;
      else if (p.performingJump === 'Sandstorm' || (!p.onGround && p.carpetTime > 0)) body = 6;  // :36123-36134(同上门修)
      else if (wing) {
        if (wing.slot === 22 || wing.slot === 28 || wing.slot === 45) body = 0;
        else body = (p.vy * p.gravDir < 0) || (p.inputJump && p.vy * p.gravDir > 0) ? 6 : 5;   // :36135-36155
      } else body = 5;
    }
    else if (p.vx !== 0 && p.onGround) body = legs;       // 行走身体同步腿（:36184-36186）
    else body = 0;
    // ---- legs==140 神灯诅咒（3770，:36195-36208；主链已跳过，此处覆写）----
    // 行 = vy≠0?1:0；身体行∈HEADGEAR_ZERO_ROWS（OffsetsPlayerHeadgear.Y==0：
    // {7,8,9,14,15,16}，Main.cs:504-525）→ 行 7；翼 22/28 → 行 0
    if (leg140) {
      legs = p.vy !== 0 ? 1 : 0;
      if (HEADGEAR_ZERO_ROWS.has(body)) legs = 7;
      if (wing && (wing.slot === 22 || wing.slot === 28)) legs = 0;
    }
    if (legArmorId === 217 && (p.sitting || p.sleeping)) legs = 5;   // :36202-36206
    return { body, legs };
  }

  /** 身体帧行复算（47/49 锚点行修正用——与下方纸娃娃/legacy 行选择同规则，
   *  独立复算避免改动并行会话在改的帧选择主体） */
  private playerBodyRow(p: Player,
    swing: { useStyle?: number } | null, staticHoldStyle: number,
    mnt: unknown): number {
    const useRow = swing ? this.useStyleBodyRow(swing as never, p) : -1;
    if (useRow >= 0) return useRow;
    if (mnt || p.ridingCart) return 3;
    if (Math.abs(p.vx) > 0.3 && p.onGround) return 6 + Math.floor(p.animTime / 6) % 14;
    if (staticHoldStyle === 2) return 2;
    if (staticHoldStyle === 4 && p.onGround) return 0;
    if (staticHoldStyle) return 3;
    if (!p.onGround) return p.vy < 0 ? 1 : 4;
    return 0;
  }

  /** 全亮翅膀绘制队列（mainGlow 主纹理 + 全部叠画；光照合成后 flush） */
  private wingGlowQueue: Array<{
    p: Player; slot: number; fr: number; anchor: [number, number];
    wx: number; wy: number;
    /** drawinfo.stealth（叠画消费值）与 s' 档（lit 主纹理用，flush 内 34/51 等取 settled） */
    settled: number; clamp: number;
    vortexTint: [number, number, number] | null;
    /** cWings 染料（SM2 字节码执行描述；null = 无染料） */
    dye: DyeApply | null;
  }> = [];
  /** 均一色调 scratch（叠画 tint 精确化：RGB×tint/255 + A×alpha/255） */
  private wingTintScratch: HTMLCanvasElement | null = null;
  /** 1034 星辰鞭线体全亮队列（flag3 :36747-36749 color2=color 免逐段取光——
   *  固定色不受光照合成;WhipProj 收集、flushWhipFullbright 消费） */
  whipFullbrightQueue: Array<{
    pts: Array<{ x: number; y: number }>;
    tex: CanvasImageSource & { width: number; height: number };
    color: [number, number, number, number];
  }> = [];
  /** ★条带拖尾全亮队列（2026-09-03 用户实报"天顶剑拖尾黑椭圆"止血/F2 正修）：
   *  拖尾原在实体段直绘 worldCanvas（透明底）——alpha 通道经 compositeLight 保 α
   *  后被 source-over 回主画布=**替换**而非加算（次暗像素 (13,5,3,255) 落近黑椭圆,
   *  Extra_201/噪声贴图大片暗 texel 必现）。挪到 compositeLight 之后直绘主画布：
   *  opaque 底 + 'lighter' ⇒ alpha 通道无意义、rgb 加成即全部语义（次暗加≈0 不再
   *  替换）=原版 Drawer 语义（全程无 Lighting.GetColor=fullbright,亮处光≈1 观感
   *  不变、暗处拖尾由压暗修正为发光）。收集=queueTrailShade（Arrow/MissileProj
   *  实体段推）、消费=flushTrailShade（7e' 星辰鞭后）。 */
  private trailShadeQueue: TrailSpec[] = [];

  /** 终极棱镜晶体(633)延迟绘制队列:drawLayer=7 弹体在原版走【玩家绘制层组】
   *  (PlayerDrawLayers.cs:3154 DrawPlayer_27_HeldItem 记 projectileDrawPosition →
   *  :4318 RenderAllLayers 在持物层位置插入 DrawHeldProj)= 画在玩家身体【前】。
   *  实体循环先于 drawPlayer → 直画会被纸娃娃盖住(2026-08-24 用户报"身上没棱镜")。
   *  PrismProj.draw 登记 → drawPlayer 后冲刷(世界变换仍活,世界坐标闭包直画) */
  prismCrystalQueue: Array<() => void> = [];

  /** 队列消费（合成后调用）：局部变换 = worldToScreen(wx,wy) + scale(facing·z, z)。
   *  stealth 逐层公式（drawinfo.stealth = settled）：34/40×s、51 luna×s、44×s、
   *  28/45 White 无 s、9/29 主纹理×s²（:964-969 平方分支）；叠画 23/27/30×s、
   *  43×s²、50×s²、38×s、47 A180 iff s==1、29 selfAdd×s²·0.5（:1071）、
   *  31 nebula×s（:1091/:1096）、32 glowAdd×s（:1100）、22 火焰逐次平方（:681 累乘）、
   *  extra38=Lerp(colorArmorBody,White,0.5) 光采样 */
  /** 1034 星辰鞭线体全亮消费（7e'，compositeLight 后）：flag3（:36747-36749 color2=color）
   *  = 线体固定色 (0,61,153,12) 不受光照——世界系控制点 worldToScreen 后逐段直画
   *  （rot=atan2−π/2、scale=(1,(段长+2)/H)×z、origin=(W/2,2)，与 WhipProj 预合成同式） */
  private flushWhipFullbright(cam: Camera, z: number): void {
    if (!this.whipFullbrightQueue.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const q of this.whipFullbrightQueue) {
      const tex = q.tex;
      const [r, g, b, a] = q.color;
      const tinted = tintedTex(tex as never, [r, g, b], true);
      if (!tinted) continue;
      ctx.globalAlpha = a / 255;
      for (let i = 0; i + 1 < q.pts.length; i++) {
        const p0 = q.pts[i], p1 = q.pts[i + 1];
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        const [sx, sy] = cam.worldToScreen(p0.x, p0.y);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
        ctx.scale(z, z);
        ctx.drawImage(tinted, 0, 0, tex.width, tex.height,
          -tex.width / 2, -2, tex.width, len + 2);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    this.whipFullbrightQueue.length = 0;
  }

  /** 条带拖尾收集（实体段 Arrow/MissileProj 调用——主循环 flushTrailShade 消费） */
  queueTrailShade(spec: TrailSpec): void {
    this.trailShadeQueue.push(spec);
  }

  /** ★条带拖尾全亮 flush（2026-09-03 黑椭圆止血/F2 正修,字段注）：
   *  compositeLight 之后直绘【主画布】——相机系同 7d' 段公式（rounded cam 消抖）。
   *  GL 条带层（obj58 tech 路径渲入 glfx.canvas）上屏段一并挪此：渲染发生在
   *  drawStripTrail 内（flush 循环中）、上屏紧随循环后=同 flush 时序闭环
   *  （原实体段 :3441 上屏点已删——挪后 GL/CPU 两 face 同步脱离光照乘+source-over）。 */
  private flushTrailShade(cam: Camera, z: number, viewW: number, viewH: number): void {
    // ★空队列不早退：GL 条带层（天顶剑等 tech 路径渲入 glfx.canvas）的上屏也在此——
    //  只看队列会让无队列帧的 GL 月牙整条消失（2026-09-03 用户实报"月牙没了"）
    const hasQ = this.trailShadeQueue.length > 0;
    const gxC = this.glfx;
    const hasGL = !!(gxC && gxC.trailDirty && !gxC.unavailable);
    if (!hasQ && !hasGL) return;
    const queue = this.trailShadeQueue;
    this.trailShadeQueue = [];
    const ctx = this.ctx;
    if (!ctx) return;
    const camRX = Math.round(cam.x * z) / z;
    const camRY = Math.round(cam.y * z) / z;
    ctx.save();
    ctx.translate(Math.round(viewW / 2), Math.round(viewH / 2));
    ctx.scale(z, z);
    ctx.translate(-camRX, -camRY);
    for (const spec of queue) {
      try { drawStripTrail(ctx, this, spec); } catch { /* 单条带失败不拖垮帧 */ }
    }
    ctx.restore();
    // GL 条带层上屏（'lighter' 加算——层内已按 XNA Additive 累积,主链直加;黑 texel
    // rgb=0 加 0 无害,opaque 主画布 alpha 抬升无观感）
    const gx = this.glfx;
    if (gx && gx.trailDirty && !gx.unavailable) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(gx.canvas, 0, 0);
      ctx.restore();
      gx.trailDirty = false;
    }
  }

  private flushWingGlow(cam: Camera, z: number): void {
    if (!this.wingGlowQueue.length) return;
    const atlas = this.atlas;
    const ctx = this.ctx;
    if (!atlas) { this.wingGlowQueue.length = 0; return; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const e of this.wingGlowQueue) {
      const d = wingDrawOf(e.slot);
      const [sx, sy] = cam.worldToScreen(e.wx, e.wy);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(e.p.facing * z, z);
      ctx.translate(e.anchor[0], e.anchor[1]);
      // ---- 全亮主纹理 ----
      // 44 彩虹翼：vanilla 主纹理 = Extra_171 灰度翼经 Misc "HallowBoss" pass 的
      // 烘焙图（PlayerRainbowWingsTextureContent.cs 1:1，烘焙一次缓存）——不是
      // Wings_44 原图；cWings 染料在其上再套（:1033 item.shader）
      const baked = d.rainbowLayer ? this.hallowBossWingsSheet() : null;
      const mainTex: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null = baked
        ? baked.canvas
        : atlas.ensureVImage(`vanilla/Wings_${e.slot}.png`);
      const tw = mainTex ? (mainTex instanceof HTMLImageElement ? mainTex.width : mainTex.width) : 0;
      if (d.mainGlow && mainTex && tw > 0) {
        const fh = Math.floor((mainTex instanceof HTMLImageElement ? mainTex.height : mainTex.height) / d.frames);
        let a = 1, tint = 1;
        if (d.mainGlow === 'c250a100') { tint = 250 / 255; a = (100 / 255) * e.settled; }  // :858 ×stealth
        else if (d.mainGlow === 'c250a100sq') {
          // :964-969（9/29 generic 尾段分支）：drawinfo.stealth 先自乘平方再 ×(1−shadow)
          // 后才取 Color(250³,100) → RGB/A 均随 s²（shadow 常态 0）——与 34/40 的 s¹ 族不同
          const s2 = e.settled * e.settled;
          tint = (250 / 255) * s2; a = (100 / 255) * s2;
        }
        else if (d.mainGlow === 'luna') {
          // GetLunaGlowColor :185-190：(255³,100)×Remap(WrappedLerp(miscCounter%100/100))×免疫
          const lerp = (e.p.miscCounter % 100) / 100;
          const wrap = lerp < 0.5 ? lerp * 2 : (1 - lerp) * 2;   // WrappedLerp(0,1,t)
          const pulse = 0.85 + 0.15 * Math.min(1, Math.max(0, wrap));
          tint = 1; a = (100 / 255) * pulse * e.settled;          // :783 ×stealth
          if (e.p.iframes > 0 && e.p.iframes % 6 < 2) a *= 0.45;
        } else if (d.rainbowLayer) {
          a = e.settled;                                            // :1032 White×stealth
        }
        // 44 彩虹翼主纹理 = 已烘焙的彩虹图；其余 = Wings 表
        if (!e.dye && tint >= 0.999) {
          ctx.globalAlpha = a;
          ctx.drawImage(mainTex as CanvasImageSource, 0, e.fr * fh, tw, fh,
            -tw / 2, -fh / 2, tw, fh);
          ctx.globalAlpha = 1;
        } else {
          const tintArr: [number, number, number] | null = tint < 0.999
            ? [tint, tint, tint] : null;
          const sc = this.wingTexSource(mainTex as ImageBitmap | HTMLImageElement | HTMLCanvasElement,
            0, e.fr * fh, tw, fh, e.dye, tintArr);
          if (sc) {
            ctx.globalAlpha = a;
            ctx.drawImage(sc, -tw / 2, -fh / 2);
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = a;
            ctx.drawImage(mainTex as CanvasImageSource, 0, e.fr * fh, tw, fh,
              -tw / 2, -fh / 2, tw, fh);
            ctx.globalAlpha = 1;
          }
        }
      }
      // ---- 叠画 ----
      if (d.overlay) this.drawWingOverlay(e.p, e.slot, d, e.fr, cam, e.settled, e.clamp, e.vortexTint, e.dye);
    }
    ctx.restore();
    this.wingGlowQueue.length = 0;
  }

  /** 眼球伞云盖合成后冲刷（A4 终版 2026-09-03：v0=min(头顶光照,170) 已烘焙进
   *  缓存 canvas，此处屏空间直绘——世界锚点经 worldToScreen，±3px 绕行拷贝
   *  local ×z。三拷贝共享烘焙；绕行 RGB×0.65 仅 globalAlpha 近似（既有登记）。 */
  private flushEyebrellaCloud(cam: Camera, z: number): void {
    if (!this.eyebrellaQueue.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const e of this.eyebrellaQueue) {
      const [sx, sy] = cam.worldToScreen(e.wx, e.wy);
      const w = e.cw * z, h = e.ch * z;
      const drawCopy = (ox: number, oy: number, mul: number) => {
        ctx.save();
        ctx.globalAlpha = (100 / 255) * mul;
        ctx.drawImage(e.src as CanvasImageSource,
          sx + (ox * z) - w / 2, sy + (oy * z) - h / 2, w, h);
        ctx.restore();
      };
      drawCopy(-3 * Math.cos(e.num2 * Math.PI * 2), -3 * Math.sin(e.num2 * Math.PI * 2), 0.65);
      drawCopy(3 * Math.cos(e.num2 * Math.PI * 2), 3 * Math.sin(e.num2 * Math.PI * 2), 0.65);
      drawCopy(0, 0, 1);
    }
    ctx.restore();
    this.eyebrellaQueue.length = 0;
  }

  /** ReflectiveArmorShaderData.Apply 1:1（uLightSource：4 点 GetSubLight 梯度 →
   *  归一化伪法线；bodyRotation 本仓未建模取 0，登记）。lightAt 语域 0-255 → /255 */
  private reflectiveLightSource(p: Player): [number, number, number, number] {
    const L = this.lighting;
    if (!L?.lightAt) return [0, 0, 0, 0];
    const vx = p.x + p.w * 0.1, vy = p.y + p.h * 0.1;
    const w = p.w * 0.8, h = p.h * 0.8;
    const sub = (x: number, y: number): number => {
      const c = L.lightAt(Math.floor(x / 16), Math.floor(y / 16));
      return (c[0] + c[1] + c[2]) / 255;      // subLight.X+Y+Z（0-1 语域）
    };
    const n4 = sub(vx + w * 0.5, vy);           // 右中
    const n5 = sub(vx, vy + h * 0.5);           // 上中
    const n6 = sub(vx + w, vy + h * 0.5);       // 左中
    const n7 = sub(vx + w * 0.5, vy + h);       // 下中
    let spx = n6 - n5, spy = n7 - n4;
    const len = Math.hypot(spx, spy);
    if (len > 1) { spx /= len; spy /= len; }
    if (p.facing === -1) spx *= -1;
    // spinningpoint.RotatedBy(-rotation)：bodyRotation 未建模恒 0
    let x3 = spx * 2;
    let y3 = (spy - 0.15) * 2;
    let z3 = 1 - (spx * spx + spy * spy);
    const l3 = Math.hypot(x3, y3, z3) || 1;
    x3 /= l3; y3 /= l3; z3 = (z3 / l3) * 0.6;
    return [x3, y3, z3, 0];
  }

  /** 退出世界/contextlost 清烘焙缓存（canvas 内容归零不重画） */
  resetFxCache(): void {
    this.hallowBake = null;
    this.hallowRampData = null;
  }

  /** Extra_156 wrap 采样器缓存（HallowBoss 链共用：44 翼烘焙 + 4778 染料） */
  private hallowRampData: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  private hallowRampSampler(): SM2SamplerOut | null {
    if (!this.hallowRampData) {
      const atlas = this.atlas;
      if (!atlas) return null;
      const ramp = atlas.ensureVImage('vanilla/Extra_156.png');
      if (!ramp || ramp.width === 0) return null;
      const c = document.createElement('canvas');
      c.width = ramp.width; c.height = ramp.height;
      const cc = c.getContext('2d', { willReadFrequently: true })!;
      cc.drawImage(ramp, 0, 0);
      this.hallowRampData = {
        data: cc.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height,
      };
    }
    const r = this.hallowRampData;
    // PR#1：出参版 wrap 采样（Extra_156 ramp；LinearWrap=MiscShaderData.Apply 默认）
    return (u, v, o4) => { sampleImageInto(r!.data, r!.w, r!.h, u, v, true, o4); };
  }

  /** 44 彩虹翼烘焙缓存（PlayerRainbowWingsTextureContent.cs 1:1）：Extra_171 全图
   *  经 Misc "HallowBoss" pass（s0=Extra_171 灰度翼、s1=Extra_156 wrap、
   *  uTime=GlobalTimeWrappedHourly）烘焙——ARenderTargetContentByRequest 一次成图
   *  不重绘，uTime 取首次烘焙时刻（原版同语义） */
  private hallowBake: { canvas: HTMLCanvasElement; w: number; h: number } | null = null;
  private hallowBossWingsSheet(): { canvas: HTMLCanvasElement; w: number; h: number } | null {
    if (this.hallowBake) return this.hallowBake;
    const atlas = this.atlas;
    if (!atlas) return null;
    const mask = atlas.ensureVImage('vanilla/Extra_171.png');
    if (!mask || mask.width === 0) return null;
    const s1 = this.hallowRampSampler();
    const pass = getPass('HallowBoss');
    if (!s1 || !pass) return null;
    const canvas = document.createElement('canvas');
    canvas.width = mask.width; canvas.height = mask.height;
    const cc = canvas.getContext('2d', { willReadFrequently: true })!;
    cc.clearRect(0, 0, canvas.width, canvas.height);
    cc.drawImage(mask, 0, 0);
    const id = cc.getImageData(0, 0, canvas.width, canvas.height);
    const u = defaultUniforms();
    u.uTime = (performance.now() / 1000) % 3600;   // Main.GlobalTimeWrappedHourly
    runPassOnImageData(pass, id.data, canvas.width, canvas.height, u, [s1]);
    cc.putImageData(id, 0, 0);
    this.hallowBake = { canvas, w: canvas.width, h: canvas.height };
    return this.hallowBake;
  }

  /** 均一色调 scratch：绘制 (img, sx, sy, sw, sh) → tint×RGB / 返回临时画布 */
  private tintSlice(img: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    tint: number, alphaMul: number): HTMLCanvasElement | null {
    const sc = (this.wingTintScratch ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const sctx = sc.getContext('2d', { willReadFrequently: true })!;
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (tint < 0.999 || alphaMul < 0.999) {
      const id = sctx.getImageData(0, 0, sw, sh);
      for (let i = 0; i < id.data.length; i += 4) {
        id.data[i] *= tint; id.data[i + 1] *= tint; id.data[i + 2] *= tint;
        id.data[i + 3] *= alphaMul;
      }
      sctx.putImageData(id, 0, 0);
    }
    return sc;
  }

  /** 逐通道 RGB scratch（星璇 secondColor tint / extra38 光采样 tint 用） */
  private tintSliceRGB(img: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    rgb: [number, number, number], alphaMul: number): HTMLCanvasElement | null {
    const sc = (this.wingTintScratch ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const sctx = sc.getContext('2d', { willReadFrequently: true })!;
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (rgb[0] < 0.999 || rgb[1] < 0.999 || rgb[2] < 0.999 || alphaMul < 0.999) {
      const id = sctx.getImageData(0, 0, sw, sh);
      for (let i = 0; i < id.data.length; i += 4) {
        id.data[i] *= rgb[0]; id.data[i + 1] *= rgb[1]; id.data[i + 2] *= rgb[2];
        id.data[i + 3] *= alphaMul;
      }
      sctx.putImageData(id, 0, 0);
    }
    return sc;
  }

  /** cWings 染料应用（SM2Effect 字节码执行；uniforms 补齐烘焙上下文）。
   *  rect = 切片在大图内的位置（uSourceRect/uImageSize0，vanilla DrawData 同源） */
  private applyDyeToImageData(data: Uint8ClampedArray, w: number, h: number,
    dye: DyeApply, rect?: { sx: number; sy: number; sheetW: number; sheetH: number }): void {
    const u = dye.uniforms;
    u.uTime = (performance.now() / 1000) % 3600;   // Main.GlobalTimeWrappedHourly
    u.uSourceRect = rect ? [rect.sx, rect.sy, w, h] : [0, 0, w, h];
    u.uImageSize0 = rect ? [rect.sheetW, rect.sheetH] : [w, h];
    const extra = dye.needsImage1 ? [this.hallowRampSampler() ?? undefined] : [];
    applyDyePass(data, w, h, dye, extra, rect);
  }

  /** v0 化染料应用（2026-09-03 v0 化批，仅【合成后】染料站可用）。
   *  受累 36 tech（vanillaDyes.V0_MID_PASSES，fx-sm2-v0-commute 经验定谳）：把
   *  顶点色 v0=vertexColor 喂进 pass（0..1 UNORM），光照不再染后乘——返回 true
   *  表示光已被消费，调用方【必须跳过】染后光乘；非受累 tech 返回 false 且零
   *  写入，调用方照常走 applyDyeToImageData 旧链（白烘，输出逐位不变）。
   *  ★架构前提：调用点必须在 compositeLight 全屏乘光【之外】（wingGlowQueue 族）。
   *  预合成面（玩家本体/尘埃/NPC）喂 v0=光后仍被全屏乘光再乘 = light² 二次压暗
   *  （观感回归）——该面修复须逐站逃逸队列，暂维持旧链（偏差登记于 SM2Effect
   *  头注 2026-09-03 段）。 */
  private applyDyeLitToImageData(data: Uint8ClampedArray, w: number, h: number,
    dye: DyeApply, vertexColor: [number, number, number],
    rect?: { sx: number; sy: number; sheetW: number; sheetH: number }): boolean {
    const u = dye.uniforms;
    u.uTime = (performance.now() / 1000) % 3600;   // Main.GlobalTimeWrappedHourly
    u.uSourceRect = rect ? [rect.sx, rect.sy, w, h] : [0, 0, w, h];
    u.uImageSize0 = rect ? [rect.sheetW, rect.sheetH] : [w, h];
    const extra = dye.needsImage1 ? [this.hallowRampSampler() ?? undefined] : [];
    return applyDyePassLit(data, w, h, dye, vertexColor, extra, rect);
  }

  /** 配饰身上贴图·背包/尾巴子层（1456 未建模细项批 2026-08-23：back 槽三路由中的
   *  DrawInBackpackLayer/DrawInTailLayer 两族拆画）。层序 = DrawPlayer_08_Backpacks
   *  （PlayerDrawLayers.cs:479-488）→ 08_1_Tails（:568-587）→【翅膀 09】——
   *  两者都在翼层之前（LegacyPlayerRenderer.cs:180-190），故独立成方法先于翅膀层调。
   *  锚 = 披风族同式（base+(0,-4)+(0,8) 化简后仍 = (-20,-52)）;背包坐骑豁免门
   *  DoesNotOverrideBackpackDraw={57,58,59,60}（MountID.cs:17,:479）、尾巴恒 !mount.Active
   *  （:570）;尾巴坐姿 (0,-2)（:575-577）、!Male (2·dir,0)（:578,本仓无性别,登记）。
   *  染料 = cBackpack/cTail（UpdateItemDye :9340-9352 同款三路由） */
  private drawAccBackpackTailLayers(ctx: CanvasRenderingContext2D, p: Player,
    accRows: { body: number; legs: number }, stealthClamp: number,
    mnt: import('../entities/Mounts').MountInstance | null): void {
    const ad = p.equipStats.accDraw;
    if (!this.atlas || (ad.backpack <= 0 && ad.tail <= 0)) return;
    const bodyRow = accRows.body;
    if (ad.backpack > 0 && (!mnt || MOUNT_BACKPACK_OK.has(mnt.type))) {
      const tex = this.atlas.ensureVImage(`vanilla/Acc_Back_${ad.backpack}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeBackpack, stealthClamp, p.facing);
    }
    if (ad.tail > 0 && !mnt) {
      const tex = this.atlas.ensureVImage(`vanilla/Acc_Back_${ad.tail}.png`);
      if (tex && tex.width > 0) {
        this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeTail, stealthClamp, p.facing, 0, p.sitting ? -2 : 0);
      }
    }
  }

  /** 配饰身上贴图·身后族（DrawPlayer_10_BackAcc PlayerDrawLayers.cs:590-655——
   *  层序在翼后肤前 LegacyPlayerRenderer.cs:186-194 + DrawPlayer_11_Balloons :1140-1172）。
   *  身架族贴图 40×56/帧与 bodyFrame 同矩形:原版锚 Position+(w/2−20,h−56+4)
   *  +bodyPosition、origin bodyVect(20,28) 化简 = 脚底局部 (-20,-52,40,56)。
   *  槽值/染料来自 equipStats.accDraw（Player.UpdateVisibleAccessory :36441-36520 聚合）。
   *  ★back 槽子层拆分（2026-08-23）：本方法只剩披风族（back）+气球;背包/尾巴两族
   *  在 drawAccBackpackTailLayers（翼前）。坐姿只隐披风（:36473-36475 仅 back=-1） */
  private drawAccBehindLayers(ctx: CanvasRenderingContext2D, p: Player,
    accRows: { body: number; legs: number }, stealthClamp: number,
    mnt: import('../entities/Mounts').MountInstance | null): void {
    const ad = p.equipStats.accDraw;
    if (!this.atlas || (ad.back <= 0 && ad.balloon <= 0)) return;
    const bodyRow = accRows.body;
    // 披风（back）：坐姿隐藏（UpdateVisibleAccessory :36473-36475 sitting → back=-1）
    if (ad.back > 0 && !p.sitting) {
      const tex = this.atlas.ensureVImage(`vanilla/Acc_Back_${ad.back}.png`);
      if (tex && tex.width > 0) {
        this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeBack, stealthClamp, p.facing);
      }
    }
    // 气球（身后族;躯干架 18 已路由 balloonFront 画身前,此处恒非躯干架 4 帧竖条）
    if (ad.balloon > 0 && !BALLOON_TORSO_FRAMING.has(ad.balloon)) {
      const tex = this.atlas.ensureVImage(`vanilla/Acc_Balloon_${ad.balloon}.png`);
      if (tex && tex.height >= 224) {
        // DrawPlayer_11_Balloons :1152-1170：锚 = OffsetsPlayerOffhand[bodyRow]
        // (Main.cs:456-477) + (0,14)、origin (26+dir·4, 34);帧 = 真实时钟
        // Millisecond%800/200 四档（:1154）。dir=−1 档经镜像空间换算见 bx
        const off = OFFSETS_PLAYER_OFFHAND[bodyRow % 20];
        const bx = p.facing === 1 ? off[0] - 40 : off[0] + 12;
        const by = off[1] - 76;
        const frame = Math.floor((performance.now() % 800) / 200);
        const fh = Math.floor(tex.height / 4);
        const dyeEmu = ad.dyeBalloon > 0 ? dyeApplyOf(ad.dyeBalloon) : null;
        if (dyeEmu) dyeEmu.uniforms.uDirection = p.facing;
        const sc = dyeEmu ? this.wingTexSource(tex, 0, frame * fh, tex.width, fh, dyeEmu, null) : null;
        const ga = ctx.globalAlpha;
        if (stealthClamp < 1) ctx.globalAlpha = ga * stealthClamp;
        if (sc) ctx.drawImage(sc, bx, by);
        else ctx.drawImage(tex, 0, frame * fh, tex.width, fh, bx, by, tex.width, fh);
        ctx.globalAlpha = ga;
      }
    }
  }

  /** 配饰身上贴图·身前族（层序 = LegacyPlayerRenderer.DrawPlayer_UseNormalLayers
   *  :170-236 身前段：14_Shoes(腿) → 18_OffhandAcc → 19_WaistAcc → 20_NeckAcc →
   *  22_FaceAcc → 32_FrontAcc → 25_Shield → 29_OnhandAcc → 12_1_BalloonFronts。
   *  坐骑隐藏（mntHidden）不画;front 族原版 !mount.Active 门（:3884）照抄。
   *  染料逐族 cXxx（UpdateItemDye :9329-9420 路由,accDraw 聚合侧已配对） */
  private drawAccFrontLayers(ctx: CanvasRenderingContext2D, p: Player,
    accRows: { body: number; legs: number }, stealthClamp: number,
    mnt: import('../entities/Mounts').MountInstance | null, head = 0, sittingLegsVid = 0,
    /** 头层脸饰（faceHead/underHair/头层面罩）已由纸娃娃路径拆画——真时跳过前层
     *  兜底（兜底精灵路径缺省 false=同锚补画,层序近似登记） */
    headFaceHandled = false): void {
    const ad = p.equipStats.accDraw;
    if (!this.atlas) return;
    const atlas = this.atlas;
    const bodyRow = accRows.body;
    const legRow = accRows.legs;
    // 14_Shoes（:1756-1775）：legFrame 对齐 + 滚轴鞋 (0,2)·Directions 偏移
    //（GetShoeDrawOffset :4713-4721）。坐姿走 DrawSittingLegs（:1768→:1585-1754）：
    // ★默认支三片 [46,10]+[44,2]+[42,2]（num3=2/num2=42 :1594-1596）;217 族特例支
    // 两片 [[2,54],[0,2]]（num3=1/num2=0 :1608-1716,legs 169/177/178/181/182/206/217）
    // ——V2b 复核勘误：曾把特例支两片当默认支全档通用
    if (ad.shoe > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Shoes_${ad.shoe}.png`);
      if (tex && tex.width > 0) {
        const roller = SHOE_ROLLER_SKATE.has(ad.shoe) ? 2 : 0;
        if (p.sitting) {
          // 表序 = 原版循环序（num10=num3→0：身段先、顶带后叠）；分支按 legs vid
          const slices = SITTING_LEG_SPECIAL_LEGS.has(sittingLegsVid)
            ? SITTING_LEG_SLICES_SPECIAL : SITTING_LEG_SLICES;
          for (let k = 0; k < slices.length; k++) {
            const [oy, h2] = slices[k];
            this.drawAccBodyFrame(ctx, tex, legRow, ad.dyeShoe, stealthClamp, p.facing,
              0, roller, oy, h2);
          }
        } else {
          this.drawAccBodyFrame(ctx, tex, legRow, ad.dyeShoe, stealthClamp, p.facing,
            0, roller);
        }
      }
    }
    // 18_OffhandAcc（:2044-2054）：bodyFrame 对齐（手环/手套族身后手）
    if (ad.handOff > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_HandsOff_${ad.handOff}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeHandOff, stealthClamp, p.facing);
    }
    // 19_WaistAcc（:2066-2080）：UsesTorsoFraming{5,10,12} 用 bodyFrame,余 legFrame
    if (ad.waist > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Waist_${ad.waist}.png`);
      if (tex && tex.width > 0) {
        this.drawAccBodyFrame(ctx, tex, WAIST_TORSO_FRAMING.has(ad.waist) ? bodyRow : legRow,
          ad.dyeWaist, stealthClamp, p.facing);
      }
    }
    // 20_NeckAcc（:2081-2090）
    if (ad.neck > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Neck_${ad.neck}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeNeck, stealthClamp, p.facing);
    }
    // 胡须（DrawPlayer_21_Head_TheFace 段 :2428-2446,头图层内）：headPosition 锚=
    // bodyFrame 同矩形;头盔门 flag7 = !PreventBeardDraw[head]（:2429-2433,48 头表）。
    // 威尔逊族 2-4 UseHairColor → 原版画 colorHair（玩家发色）——本仓无发色系统,
    // 画原生色=默认发色外观,登记不改码（BEARD_USE_HAIR_COLOR）
    if (ad.beard > 0 && !PREVENT_BEARD_DRAW.has(head)) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Beard_${ad.beard}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeBeard, stealthClamp, p.facing);
    }
    // 22_FaceAcc（:2801-2852）+ PlayerFrame 头盔门（:36252-36271,resolveFaceLayers
    // 逐帧解算——聚合侧四字段存原始路由,此处按 head 应用互斥/换档）。前层三支按
    // 原版序 base face → faceMask → faceFlower：mask 22 → PreventFaceMaskDraw∪
    // DrawFaceMaskUnderHeadLayer 隐没（:2819-2821,后者归头层拆画 faceLayerSplitPlan.
    // maskUnderHead）;flower 1/6/8/9 → PreventFaceFlowerDraw{92,275} 隐没（:2836-2838）。
    // head 族（faceHead）与 underHair 5 → 头层路径（TheFace :2574-2650,发层之下）——
    // 纸娃娃路径已拆画（headFaceHandled）时此处跳过;兜底精灵路径在层尾补画（同锚
    // 同门,层序近似登记）。偏移 = GetFaceDrawOffset(face)（:4352-4432 头盔条件表）
    // + mask/flower 层另加 helmetOffset（GetHelmetDrawOffset :4439-4462 非发型档;
    // 222/272 发型依赖登记）
    const fl = resolveFaceLayers(ad, head, p.buffs.has(BuffType.Werewolf) || p.merman);
    const faceDraw = (vid: number, dye: number, dx: number, dy: number): void => {
      const tex = atlas.ensureVImage(`vanilla/Acc_Face_${vid}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, dye, stealthClamp, p.facing, dx, dy);
    };
    // 支 1：base face（else 路由,:2809-2818——!DrawInFaceUnderHairLayer 才画）
    if (fl.face > 0 && !FACE_UNDER_HAIR.has(fl.face)) {
      const fo = FACE_HELMET_OFFSET[fl.face]?.[fl.head] ?? FACE_DRAW_OFFSET[fl.face] ?? [0, 0];
      faceDraw(fl.face, ad.dyeFace, fo[0], fo[1]);
    }
    // 头层兜底（!headFaceHandled 时）：faceHead（GetFaceHeadOffsetFromHelmet
    // :4874-4889）先画、underHair 5 叠其上（分支二序 :2595→:2611;盲眼罩+骷髅族
    // +2·dir 附加偏移 :2603-2609——faceHead 已换 AltFaceHead 档时门失效）;
    // 两支 HidesHead 门 :2590/:2596
    if (!headFaceHandled && !HEAD_HIDES_HEAD.has(fl.head)) {
      if (fl.faceHead > 0) {
        const ho = FACE_HEAD_OFFSET_IDS.has(fl.faceHead) ? (FACE_HEAD_HELMET_OFFSET[fl.head] ?? [0, 0]) : [0, 0];
        faceDraw(fl.faceHead, ad.dyeFaceHead, ho[0], ho[1]);
      }
      if (FACE_UNDER_HAIR.has(fl.face)) {
        faceDraw(fl.face, ad.dyeFace, fl.face === 5 && fl.faceHead >= 10 && fl.faceHead <= 13 ? 2 : 0, 0);
      }
    }
    // 支 2：faceMask（:2819-2825 门 + helmetOffset 锚 :2829）
    if (fl.faceMask > 0 && !(fl.head > 0 && FACE_MASK_HELMET_HIDE.has(fl.head))) {
      const fo = FACE_HELMET_OFFSET[fl.faceMask]?.[fl.head] ?? [0, 0];
      const ho = HELMET_DRAW_OFFSET[fl.head] ?? [0, 0];
      faceDraw(fl.faceMask, ad.dyeFaceMask, fo[0] + ho[0], fo[1] + ho[1]);
    }
    // 支 3：faceFlower（:2836-2838 门 + helmetOffset 锚 :2851）
    if (fl.faceFlower > 0 && !(fl.head > 0 && FACE_FLOWER_HELMET_HIDE.has(fl.head))) {
      const fo = FACE_HELMET_OFFSET[fl.faceFlower]?.[fl.head] ?? [0, 0];
      const ho = HELMET_DRAW_OFFSET[fl.head] ?? [0, 0];
      faceDraw(fl.faceFlower, ad.dyeFaceFlower, fo[0] + ho[0], fo[1] + ho[1]);
    }
    // 32_FrontAcc 前后半拆层（2026-08-23 接）：BackPart（源右半 :3934-3977）先于
    // 25_Shield（LegacyPlayerRenderer.cs:229）;FrontPart（源左半 :3891-3932）走两档
    // ——颈层档（front 13,FaceAcc 后 :220-224）或常规档（29_OnhandAcc 后 :242-244）。
    // 门 = !mount.Active（:3884）+ front 13 DontDrawIfWearingAScarfOrCape（围巾
    // Neck.IsAScarf{8,9} / 披风 Back.IsACape,:3893/:3936）
    const frontGate = ad.front > 0 && !mnt
      && !(FRONT_SCARF_CAPE_HIDE.has(ad.front) && (NECK_IS_SCARF.has(ad.neck) || BACK_IS_ACAPE.has(ad.back)));
    const frontTex = frontGate ? atlas.ensureVImage(`vanilla/Acc_Front_${ad.front}.png`) : null;
    const frontDx = ad.front === 13 ? -2 : 0;   // GetFrontDrawOffset :4692-4698
    // 颈层档 FrontPart（front 13 左半,FaceAcc 后）
    if (frontGate && frontTex && frontTex.width > 0 && FRONT_NECK_LAYER_ALWAYS.has(ad.front)) {
      this.drawAccBodyFrame(ctx, frontTex, bodyRow, ad.dyeFront, stealthClamp, p.facing, frontDx, 0, 0, 56, -1);
    }
    // 32_BackPart（右半,先于盾）
    if (frontGate && frontTex && frontTex.width > 0) {
      this.drawAccBodyFrame(ctx, frontTex, bodyRow, ad.dyeFront, stealthClamp, p.facing, frontDx, 0, 0, 56, 1);
    }
    // 25_Shield（:3055-3127）：盾举抬升 -4·gravDir（:3061-3063）+ 举盾光环/格挡弹开
    // 视觉（:3073-3125,2026-08-23 接）：举盾 4 份绕 (x,0) 旋 k/4·2π 的加算光环
    // （x=2.5+1.5·sin(2πt)、色档 0.45-0.15·sin;原版 A=0 预乘=全额加算 → 'lighter'+
    // alpha=色档）;格挡窗口 shieldParryTimeLeft>0 时外扩副本（scale=1+1.5t、alpha=1-t、
    // 锚沿 (锚-中心)·1.5t 外推）。★原版 :3096-3106 的脉动叠画副本未入 DrawDataCache
    // （反编译无 Add 调用=死代码,登记不画）。盾贴图 40 宽与 bodyFrame 同宽→宽度修正无感
    if (ad.shield > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Shield_${ad.shield}.png`);
      if (tex && tex.width > 0) {
        const dy = p.shieldRaised ? -4 : 0;
        if (p.shieldRaised) {
          const t = (performance.now() / 1000) % 3600;   // Main.GlobalTimeWrappedHourly
          const halo = shieldHaloFactor(t);
          const dyeEmu = ad.dyeShield > 0 ? dyeApplyOf(ad.dyeShield) : null;
          if (dyeEmu) dyeEmu.uniforms.uDirection = p.facing;
          const ga = ctx.globalAlpha;
          const gop = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = 'lighter';
          if (stealthClamp < 1) ctx.globalAlpha = ga * stealthClamp;
          for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * Math.PI * 2;
            const ox = halo.x * Math.cos(ang);
            const oy = halo.x * Math.sin(ang);
            ctx.globalAlpha = ga * stealthClamp * halo.a;
            this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeShield, 1, p.facing, ox, dy + oy);
          }
          ctx.globalCompositeOperation = gop;
          ctx.globalAlpha = ga;
        }
        this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeShield, stealthClamp, p.facing, 0, dy);
        if (p.shieldRaised && p.shieldParryTimeLeft > 0) {
          const pf = shieldParryTransform(p.shieldParryTimeLeft, p.h);
          const s = pf.scale;
          const dyeEmu = ad.dyeShield > 0 ? dyeApplyOf(ad.dyeShield) : null;
          if (dyeEmu) dyeEmu.uniforms.uDirection = p.facing;
          const sc = dyeEmu ? this.wingTexSource(tex, 0, bodyRow * 56, tex.width, 56, dyeEmu, null) : null;
          const ga = ctx.globalAlpha;
          if (stealthClamp < 1) ctx.globalAlpha = ga * stealthClamp * pf.alpha;
          else ctx.globalAlpha = ga * pf.alpha;
          // 缩放绕盾 origin(20,28)（局部 (0,-24)）+ 外推偏移
          const ox = 0 + pf.dx - 20 * s;
          const oy = -24 + pf.dy - 28 * s;
          if (sc) ctx.drawImage(sc, ox, oy, 40 * s, 56 * s);
          else ctx.drawImage(tex, 0, bodyRow * 56, tex.width, 56, ox, oy, 40 * s, 56 * s);
          ctx.globalAlpha = ga;
        }
      }
    }
    // 29_OnhandAcc（:3838-3846）
    if (ad.handOn > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_HandsOn_${ad.handOn}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeHandOn, stealthClamp, p.facing);
    }
    // 32_FrontPart 常规档（左半,29_OnhandAcc 后 LegacyPlayerRenderer.cs:242-244;
    // front 13 已走上方颈层档）
    if (frontGate && frontTex && frontTex.width > 0 && !FRONT_NECK_LAYER_ALWAYS.has(ad.front)) {
      this.drawAccBodyFrame(ctx, frontTex, bodyRow, ad.dyeFront, stealthClamp, p.facing, frontDx, 0, 0, 56, -1);
    }
    // 12_1_BalloonFronts（:1107-1139）：躯干架 18 王权节杖,bodyFrame 对齐
    if (ad.balloonFront > 0) {
      const tex = atlas.ensureVImage(`vanilla/Acc_Balloon_${ad.balloonFront}.png`);
      if (tex && tex.width > 0) this.drawAccBodyFrame(ctx, tex, bodyRow, ad.dyeBalloonFront, stealthClamp, p.facing);
    }
  }

  /** 配饰身架族单帧绘制（40×56/帧,与本体 bodyFrame/legFrame 同矩形）：
   *  原版各层锚 Position+(w/2−20,h−56+4)+origin bodyVect(20,28) 化简 =
   *  脚底局部 (-20,-52,40,56)（DrawPlayer_10/14/18/19/20/22/25/29/32 各层同式）。
   *  染料走 wingTexSource 同款 SM2 仿真链（uDirection=朝向,cXxx 逐族着色）;
   *  alphaMul = stealth A×s' 档（armor 色族）。
   *  syOff/hOverride = 源矩形纵向切片（坐姿鞋两片）;half = front 前后半（-1 左/1 右） */
  private drawAccBodyFrame(ctx: CanvasRenderingContext2D,
    tex: ImageBitmap | HTMLImageElement | HTMLCanvasElement, row: number,
    dyeVid: number, alphaMul: number, facing: number,
    dx = 0, dy = 0, syOff = 0, hOverride = 56, half: 0 | -1 | 1 = 0): void {
    const fh = 56;
    if (tex.height < fh * (row + 1)) return;   // 帧行越界（残缺表）防御
    // 源矩形：syOff/hOverride = 坐姿切片（DrawSittingLegs :1660-1672 顶带/身段）;
    // half -1/1 = front 前后半拆层（源左半 [0,20) / 右半 [20,40),PlayerDrawLayers.cs
    // :3896-3910 FrontPart / :3940-3954 BackPart——同锚同位,只拆绘制顺序）
    const sx = half === 1 ? 20 : 0;
    const sw = half === 0 ? tex.width : 20;
    const sy = row * fh + syOff;
    const sh = Math.min(hOverride, fh - syOff);
    if (sh <= 0) return;
    const dyeEmu = dyeVid > 0 ? dyeApplyOf(dyeVid) : null;
    if (dyeEmu) dyeEmu.uniforms.uDirection = facing;
    const sc = dyeEmu ? this.wingTexSource(tex, sx, sy, sw, sh, dyeEmu, null) : null;
    const ga = ctx.globalAlpha;
    if (alphaMul < 1) ctx.globalAlpha = ga * alphaMul;
    if (sc) ctx.drawImage(sc, -20 + dx, -52 + dy);
    else ctx.drawImage(tex, sx, sy, sw, sh, -20 + dx, -52 + dy, sw, sh);
    ctx.globalAlpha = ga;
  }

  /** 翅膀纹理可绘源：染料仿真 → tint 链（无处理时返回原图）。返回 canvas 时
   *  调用方按整幅居中绘制（sw/sh 尺寸）。v0Light = 顶点色光（0..1，调用方负责
   *  量化，键随值分裂）——仅受累 36 tech（isV0MidTech）消费，喂 v0 烘并【不再】
   *  染后乘光；非受累/未传 = 旧链逐位不变（★仅限合成后调用方传入，预合成面
   *  禁传——见 applyDyeLitToImageData 注）。 */
  /** ★R33 回归轮：翅膀染料烘焙缓存（时间桶 LRU）——ArmorPhase 单帧 SM2 烘焙实测
   *  232ms（184×56,最重 pass 3216B 逐像素解释器），wingTexSource 每帧重烘=4fps
   *  卡顿（用户终验实报）。桶 200ms=染料动画 ~5fps（微光闪灼语义可接受）；
   *  键=dyeVid|tint|切片|桶(|v0Light)；上限 48 条 + 2s 修剪防膨胀。 */
  private wingBakeCache = new Map<string, HTMLCanvasElement>();
  private wingBakeCachePruneAt = 0;
  private wingTexSource(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number,
    dye: DyeApply | null, tint: [number, number, number] | null,
    v0Light?: [number, number, number]): HTMLCanvasElement | null {
    if (!dye && !tint) return null;
    const litDye = dye !== null && v0Light !== undefined && isV0MidTech(dye.tech);
    const bucket = Math.floor(performance.now() / 200);
    const cacheKey = `${dye ? dye.vid : 't'}|${tint ? tint.join(',') : ''}|${sx},${sy},${sw}x${sh}|${bucket}${litDye ? `|${v0Light!.map((v) => Math.round(v * 255)).join('.')}` : ''}`;
    const cached = this.wingBakeCache.get(cacheKey);
    if (cached) return cached;
    if (performance.now() - this.wingBakeCachePruneAt > 2000) {
      this.wingBakeCachePruneAt = performance.now();
      while (this.wingBakeCache.size >= 48) {
        this.wingBakeCache.delete(this.wingBakeCache.keys().next().value as string);
      }
    }
    const sc = (this.wingTintScratch ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const sctx = sc.getContext('2d', { willReadFrequently: true })!;
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (dye || tint) {
      const id = sctx.getImageData(0, 0, sw, sh);
      if (dye) {
        const dyeRect = { sx, sy, sheetW: img instanceof HTMLImageElement ? img.width : img.width,
          sheetH: img instanceof HTMLImageElement ? img.height : img.height };
        if (litDye) this.applyDyeLitToImageData(id.data, sw, sh, dye, v0Light!, dyeRect);
        else this.applyDyeToImageData(id.data, sw, sh, dye, dyeRect);
      }
      if (tint) {
        for (let i = 0; i < id.data.length; i += 4) {
          id.data[i] *= tint[0]; id.data[i + 1] *= tint[1]; id.data[i + 2] *= tint[2];
        }
      }
      sctx.putImageData(id, 0, 0);
    }
    this.wingBakeCache.set(cacheKey, sc);
    return sc;
  }

  /** DrawStarboardRainbowTrail（:2901-2961）：翅膀 45 的 Projectile_250 彩虹拖尾。
   *  AdvancedShadows 位置历史（≤31）逐段拉伸绘制：scale(1.7, |dx|/贴图高)、
   *  rotation=π/2·direction、alpha=(((1−i/n)²·min(|dx|/4,1)·0.5)²)·(64/255)·路径系数，
   *  每段另画 0.25/0.5/0.75 三份插值拷贝。屏幕空间（flush 内调用） */
  private drawStarboardTrail(p: Player, cam: Camera): void {
    const atlas = this.atlas;
    if (!atlas) return;
    const img = atlas.ensureVImage('vanilla/Projectile_250.png');
    const hist = p.advancedShadows;
    const n = Math.min(hist.length - 1, 30);
    if (!img || img.width === 0 || n < 1) return;
    const ctx = this.ctx;
    // 路径系数 num4 = clamp(总程/160, 0, 1)（:2909-2913）
    let total = 0;
    for (let i = n; i > 0; i--) {
      total += Math.hypot(hist[i].x - hist[i - 1].x, hist[i].y - hist[i - 1].y);
    }
    const num4 = Math.min(1, total / 160);
    if (num4 <= 0) return;
    const off = { x: 10, y: p.h - 4 };   // DefaultSize×(0.5,1)+(0,−4)（:2924-2928）
    const texH = img.height;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = n; i > 0; i--) {
      const pos = cam.worldToScreen(hist[i].x + off.x, hist[i].y + off.y);
      const pos2 = cam.worldToScreen(hist[i - 1].x + off.x, hist[i - 1].y + off.y);
      const dx = Math.abs(pos2[0] - pos[0]);
      let a = 1 - i / n;
      a *= a;
      a *= Math.min(Math.max(dx / 4, 0), 1);
      a *= 0.5;
      a *= a;
      const alpha = a * (64 / 255) * num4;
      if (alpha <= 0.004) continue;
      const z = cam.zoom;
      const scale = { x: 1.7, y: dx / texH };
      const rot = Math.PI / 2 * p.facing;
      const drawSeg = (x: number, y: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(scale.x * z, scale.y * z);
        ctx.drawImage(img, -img.width / 2, -texH / 2);
        ctx.restore();
      };
      drawSeg(pos[0], pos[1]);
      for (let t = 0.25; t < 1; t += 0.25) {
        drawSeg(pos[0] + (pos2[0] - pos[0]) * t, pos[1] + (pos2[1] - pos[1]) * t);
      }
    }
    ctx.restore();
  }

  /** Wings 40 Betsy 程序化摆动（:854-896）：空气帧 k=0..7（cycle 4）/地面帧 k=8..13
   *  （cycle 3），每片偏移 = 轨道摆动(miscCounterNormalized)+速度反拖(×−1.5)+
   *  朝向外推(×3)，帧格 W−2/H−2 中心锚，色 (250³,100)×stealth。flush 内 */
  private drawBetsyWings(p: Player, slot: number, _fr: number, settled: number, dye: DyeApply | null = null): void {
    const atlas = this.atlas;
    if (!atlas) return;
    const img = atlas.ensureVImage(`vanilla/Wings_${slot}.png`);
    if (!img || img.width === 0) return;
    const ctx = this.ctx;
    const k0 = p.vy === 0 ? 8 : 0, k1 = p.vy === 0 ? 14 : 8;
    const cyc = p.vy === 0 ? 3 : 4;
    const mcn = p.miscCounter / 300;   // miscCounterNormalized :3241
    const fw = img.width, fh14 = Math.floor(img.height / 14);
    // ★v0 化批（2026-09-03）：原版 betsy 叠画 color=colorArmorBody2（:854-896）
    // = 光照色进 v0；本站为合成后逃逸层（无全屏乘光）——受累 36 tech 喂 v0=光，
    // 补上此前全亮的染料面。量化 16 级/通道（键分裂与重烘频折中）；开灯恒白
    // （fullbright 下其余元素不受光，染料亦不暗化=观感一致）。
    const v0Light = dye && isV0MidTech(dye.tech)
      ? (this.fullbright ? [1, 1, 1] as [number, number, number]
        : (() => {
            const lc = this.lighting?.lightAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16)) ?? [255, 255, 255];
            const q = (v: number) => Math.round((v / 255) * 15) / 15;
            return [q(lc[0]), q(lc[1]), q(lc[2])] as [number, number, number];
          })())
      : undefined;
    // ★A5（2026-09-03）：非受累染料也补光——原版 betsy 叠画 color=colorArmorBody
    // （lit），旧链素绘全亮与受累 tech（v0=光已正确变暗）同站不一致。尾乘族
    // 「染后乘光」≡「光进 v0」（fx-sm2-v0-commute 交换侧），走 wingTexSource 既有
    // tint 参数（染后乘）。量化同 16 级；开灯恒白（与 v0 路径同守卫）。
    const tintLight = dye && !isV0MidTech(dye.tech)
      ? (this.fullbright ? [1, 1, 1] as [number, number, number]
        : (() => {
            const lc = this.lighting?.lightAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16)) ?? [255, 255, 255];
            const q = (v: number) => Math.round((v / 255) * 15) / 15;
            return [q(lc[0]), q(lc[1]), q(lc[2])] as [number, number, number];
          })())
      : null;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let k = k0; k < k1; k++) {
      const num10 = (k - k0) % cyc;
      const ang = (mcn * (2 + num10) + num10 * 0.5) * Math.PI * 2;
      // (0, 0.5).RotatedBy(ang) × (num10+1)（:882-884）——向量 (0,0.5) 旋转 ang
      const wx = -Math.sin(ang) * 0.5 * (num10 + 1);
      const wy = Math.cos(ang) * 0.5 * (num10 + 1);
      const px = wx + p.vx * -1.5 * (num10 / cyc) + 3;   // zero.X = direction×3 → 局部 3
      const py = wy + p.vy * -1.5 * (num10 / cyc);
      ctx.globalAlpha = (100 / 255) * settled;
      if (dye) {
        const bs = this.wingTexSource(img, 0, k * fh14, fw - 2, fh14 - 2, dye, tintLight, v0Light);
        if (bs) { ctx.drawImage(bs, px - (fw - 2) / 2, py - (fh14 - 2) / 2); continue; }
      }
      ctx.drawImage(img, 0, k * fh14, fw - 2, fh14 - 2,
        px - (fw - 2) / 2, py - (fh14 - 2) / 2, fw - 2, fh14 - 2);
    }
    ctx.restore();
  }

  /** 翅膀叠画（flush 内调用，局部空间已镜像+锚点平移）。settled=drawinfo.stealth、
   *  clamp=s'、vortexTint=星璇 secondColor、dye=cWings 仿真——逐款 stealth 公式见
   *  各 case 行号注；染料对全部叠画 DrawData 生效（原版 item.shader 同绑） */
  private drawWingOverlay(p: Player, slot: number, d: import('../data/vanillaWingVisuals').WingDraw,
    fr: number, cam: Camera, settled: number, clamp: number,
    vortexTint: [number, number, number] | null, dye: DyeApply | null): void {
    const atlas = this.atlas;
    if (!atlas || !d.overlay) return;
    const ctx = this.ctx;
    const notGrappling = !p.grappleProjs.some((g) => g.latched);
    const ov = d.overlay;
    const slice = (file: string) => {
      const img = atlas.ensureVImage(`vanilla/${file}`);
      if (!img || img.width === 0) return null;
      const fh = Math.floor(img.height / d.frames);
      return { img, fh, sy: fr * fh, sw: img.width, sh: fh };
    };
    /** tintSlice + 染料折叠（cWings 对全部叠画 DrawData 生效，:699/:722 等同绑） */
    const dyeScratch = (img: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
      tint: number): HTMLCanvasElement | null => {
      const sc = this.tintSlice(img, sx, sy, sw, sh, tint, 1);
      if (sc && dye) {
        const c = sc.getContext('2d', { willReadFrequently: true })!;
        const id = c.getImageData(0, 0, sw, sh);
        this.applyDyeToImageData(id.data, sw, sh, dye,
          { sx, sy, sheetW: img.width, sheetH: img.height });
        c.putImageData(id, 0, 0);
      }
      return sc;
    };
    /** 纯加色 scratch（Color(255³,0)·f 族——A=0 预乘 = 纯加色，StringLine.ts 同法）：
     *  摊平 alpha=255 + RGB×tint，'lighter' 单笔（透明像素成不透明黑，加 0 无害） */
    const addScratch = (img: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
      rgb: [number, number, number]): HTMLCanvasElement | null => {
      const sc = (this.wingTintScratch ??= (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c; })());
      if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
      const sctx = sc.getContext('2d', { willReadFrequently: true })!;
      sctx.clearRect(0, 0, sw, sh);
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const id = sctx.getImageData(0, 0, sw, sh);
      for (let i = 0; i < id.data.length; i += 4) {
        id.data[i] *= rgb[0]; id.data[i + 1] *= rgb[1]; id.data[i + 2] *= rgb[2];
        id.data[i + 3] = 255;
      }
      if (dye) this.applyDyeToImageData(id.data, sw, sh, dye,
        { sx, sy, sheetW: img.width, sheetH: img.height });
      sctx.putImageData(id, 0, 0);
      return sc;
    };
    switch (ov.kind) {
      case 'selfAdd':
      case 'glowAdd': {  // 29 自身切片 / 32 Glow_183：A=0 预乘 = 纯加色 'lighter' ×1.06
        //  29（:1069-1074）：Color(255³,0)×s²×(1−shadow)²×0.5——stealth 已被 9/29
        //  主色分支(:965-966)平方累乘，(1−shadow) 在两处各乘一次；
        //  32（:1099-1104）：GlowMask[183]×Color(255³,0)×s×(1−shadow)（未突变）
        const s = slice(ov.kind === 'selfAdd' ? `Wings_${slot}.png` : (ov.file ?? ''));
        if (!s) return;
        const sc = addScratch(s.img, 0, s.sy, s.sw, s.sh, [1, 1, 1]);
        if (!sc) return;
        const f = (ov.stealthSq ? settled * settled : settled) * (1 - 0);   // ×(1−shadow)
        const k = ov.scale ?? 1;             // 1.06 放大（origin=Size/2 随 scale）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = f * ((ov.alpha ?? 255) / 255);
        ctx.drawImage(sc, -s.sw * k / 2, -s.sh * k / 2, s.sw * k, s.sh * k);
        ctx.restore();
        break;
      }
      case 'nebula': {   // 31：HotPink↔Crimson 脉冲色 4 轨道(×0.5)+全幅(×1)（:1083-1097）
        const s = slice(`Wings_${slot}.png`);
        if (!s) return;
        // color12 = Lerp(HotPink, Crimson, cos(2π·mc/100)·0.4+0.5)，A=0（纯加色）
        const t = Math.cos(Math.PI * 2 * (p.miscCounter / 100)) * 0.4 + 0.5;
        const sc = addScratch(s.img, 0, s.sy, s.sw, s.sh, [
          (255 + (220 - 255) * t) / 255,
          (105 + (20 - 105) * t) / 255,
          (180 + (60 - 180) * t) / 255,
        ]);
        if (!sc) return;
        const f = settled * (1 - 0);         // ×stealth×(1−shadow)（:1091/:1096）
        // 轨道半径 r = cos(2π·mc/60)·0.5+0.5 ∈ [0,1]；vector22 = (r,0).RotatedBy(n·π/2)
        // ——世界空间偏移（原版未 ×direction）→ 镜像空间局部 X 反补偿 facing
        const r = Math.cos(Math.PI * 2 * (p.miscCounter / 60)) * 0.5 + 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let n = 0; n < 4; n++) {
          const ang = n * Math.PI / 2;
          const dx = r * Math.cos(ang) * p.facing, dy = r * Math.sin(ang);
          ctx.globalAlpha = f * 0.5;
          ctx.drawImage(sc, dx - s.sw / 2, dy - s.sh / 2);
        }
        ctx.globalAlpha = f;
        ctx.drawImage(sc, -s.sw / 2, -s.sh / 2);
        ctx.restore();
        break;
      }
      case 'plain': {   // 23/27/30/47：单帧同切片（硬编码 tint/alpha ×stealth）
        const s = slice(ov.file ?? '');
        if (!s) return;
        const tint = (ov.tint ?? 255) / 255;
        let a = (ov.alpha ?? 255) / 255;
        if (slot === 47) a = settled >= 1 ? 180 / 255 : (p.iframes > 0 && p.iframes % 6 < 2 ? 0.45 : 1);
        else a *= settled;                          // 23/27/30 ×stealth（:1020/:1031/:1039）
        const sc = dyeScratch(s.img, 0, s.sy, s.sw, s.sh, tint);
        if (sc) {
          ctx.save();
          ctx.globalAlpha = a;
          ctx.drawImage(sc, -s.sw / 2, -s.sh / 2);
          ctx.restore();
        }
        break;
      }
      case 'flames7': { // 22：ItemFlame_1866×7（:676-699，逐 i 色 (250−10i)³/(150−10i)，
        //   stealth 逐次平方累乘 :681-682）
        if (!notGrappling) return;
        const s = slice('ItemFlame_1866.png');
        if (!s) return;
        let runStealth = settled;
        for (let i = 0; i < 7; i++) {
          runStealth *= runStealth;                 // :681 drawinfo.stealth *= stealth
          // vector4 = (itemFlamePos.X, −itemFlamePos.Y) × 0.5（:684-687）
          const jx = p.itemFlamePos[i].x * 0.5, jy = -p.itemFlamePos[i].y * 0.5;
          const tint = (250 - i * 10) / 255;
          const a = ((150 - i * 10) / 255) * runStealth * (1 - 0);   // ×(1−shadow)
          const sc = dyeScratch(s.img, 0, s.sy, s.sw, s.sh - 2, tint);
          if (sc) {
            ctx.save();
            ctx.translate(jx, jy);
            ctx.globalAlpha = a;
            ctx.drawImage(sc, -s.sw / 2, -(s.sh - 2) / 2);
            ctx.restore();
          }
        }
        break;
      }
      case 'extra38': { // 28：Extra[38] Lerp(colorArmorBody, White, 0.5)（:713-722）
        const s = slice('Extra_38.png');
        if (!s) return;
        const mcFr = Math.floor(p.miscCounter / 5) % 4;   // Frame(1,4,0,miscCounter/5%4)
        // colorArmorBody = 免疫白 × 光 × armor-stealth（3106/蘑菇矿 RGB×s'；星璇
        // ×secondColor）→ 光经 renderer.lighting 读侧采样（原版单点 GetColor 语义）
        const lc = this.lighting?.lightAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16)) ?? [255, 255, 255];
        const imA = p.iframes > 0 && p.iframes % 6 < 2 ? 0.45 : 1;
        const armor = vortexTint ?? [clamp, clamp, clamp];
        const tint: [number, number, number] = [
          0.5 * ((lc[0] / 255) * armor[0]) + 0.5,
          0.5 * ((lc[1] / 255) * armor[1]) + 0.5,
          0.5 * ((lc[2] / 255) * armor[2]) + 0.5,
        ];
        // ★v0 化批（2026-09-03）：受累 36 tech 时本站从「tint 预乘→白烘」改为
        //   原版序「素切片→v0=tint 烘」——原版 DrawData color=Lerp(colorArmorBody,
        //   White,0.5) 即 v0 本体（:713-722），tint 预乘会把光照喂进 s0 采样面
        //   （v0 中段非线性消费下 两序不等，见 fx-sm2-v0-commute）。非受累 tech
        //   两序逐位等价（尾乘族），维持旧链零变化。
        const litDye = dye !== null && isV0MidTech(dye.tech);
        const sc = this.tintSliceRGB(s.img, 0, mcFr * s.sh, s.sw - 2, s.sh - 2, litDye ? [1, 1, 1] : tint, 1);
        if (sc) {
          if (dye) {
            const c38 = sc.getContext('2d', { willReadFrequently: true })!;
            const id38 = c38.getImageData(0, 0, s.sw - 2, s.sh - 2);
            if (litDye) {
              this.applyDyeLitToImageData(id38.data, s.sw - 2, s.sh - 2, dye, tint,
                { sx: 0, sy: mcFr * s.sh, sheetW: s.img.width, sheetH: s.img.height });
            } else {
              this.applyDyeToImageData(id38.data, s.sw - 2, s.sh - 2, dye,
                { sx: 0, sy: mcFr * s.sh, sheetW: s.img.width, sheetH: s.img.height });
            }
            c38.putImageData(id38, 0, 0);
          }
          ctx.save();
          ctx.globalAlpha = imA;
          ctx.drawImage(sc, -(s.sw - 2) / 2, -(s.sh - 2) / 2);
          ctx.restore();
        }
        break;
      }
      case 'jitter2': { // 43：×2 随机 ±1.25（:1004-1015，(230³,60)×stealth²）
        const s = slice(ov.file ?? '');
        if (!s) return;
        const tint = (ov.tint ?? 255) / 255, a = (ov.alpha ?? 255) / 255 * settled * settled;
        const sc = dyeScratch(s.img, 0, s.sy, s.sw, s.sh, tint);
        if (sc) {
          ctx.save();
          ctx.globalAlpha = a;
          for (let l = 0; l < 2; l++) {
            const jx = (Math.random() * 20 - 10) * 0.125, jy = (Math.random() * 20 - 10) * 0.125;
            ctx.drawImage(sc, jx - s.sw / 2, jy - s.sh / 2);
          }
          ctx.restore();
        }
        break;
      }
      case 'immune': {  // 50：免疫色双画（:930-940，GetImmuneAlphaPure(White)×stealth²）
        const s = slice(`Wings_${slot}.png`);
        if (!s) return;
        const a = (p.iframes > 0 && p.iframes % 6 < 2 ? 0.45 : 1) * settled * settled;
        const src50 = dye
          ? this.wingTexSource(s.img, 0, s.sy, s.sw, s.sh, dye, null)
          : null;
        ctx.save();
        ctx.globalAlpha = a;
        if (src50) ctx.drawImage(src50, -s.sw / 2, -s.sh / 2);
        else ctx.drawImage(s.img, 0, s.sy, s.sw, s.sh, -s.sw / 2, -s.sh / 2, s.sw, s.sh);
        ctx.restore();
        break;
      }
      case 'betsy': {   // 40：8 片程序化摆动（:854-896）
        this.drawBetsyWings(p, slot, fr, settled, dye);
        break;
      }
      case 'trail45': { // 45：拖尾（:2901；4 向轨道残影 (70,70,70,0)·f 的 A=0 死画
        this.drawStarboardTrail(p, cam);   //  原样跳过 :741-746）
        break;
      }
      case 'arkhalis': { // 38：GlowMask[251]×underShirtColor×stealth（:1045-1047）
        const s = slice(ov.file ?? '');
        if (!s) return;
        const c = p.appearance?.undershirtColor ?? { r: 160, g: 90, b: 0 };
        const img = s.img;
        const sc = (this.wingTintScratch ??= (() => { const cc = document.createElement('canvas'); cc.width = 8; cc.height = 8; return cc; })());
        if (sc.width !== s.sw || sc.height !== s.sh) { sc.width = s.sw; sc.height = s.sh; }
        const sctx = sc.getContext('2d', { willReadFrequently: true })!;
        sctx.clearRect(0, 0, s.sw, s.sh);
        sctx.drawImage(img, 0, s.sy, s.sw, s.sh, 0, 0, s.sw, s.sh);
        const id = sctx.getImageData(0, 0, s.sw, s.sh);
        for (let i = 0; i < id.data.length; i += 4) {
          id.data[i] = id.data[i] * c.r / 255;
          id.data[i + 1] = id.data[i + 1] * c.g / 255;
          id.data[i + 2] = id.data[i + 2] * c.b / 255;
          id.data[i + 3] *= settled;
        }
        if (dye) this.applyDyeToImageData(id.data, s.sw, s.sh, dye,
          { sx: 0, sy: s.sy, sheetW: img.width, sheetH: img.height });
        sctx.putImageData(id, 0, 0);
        ctx.save();
        ctx.drawImage(sc, -s.sw / 2, -s.sh / 2);
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }

  /** 发色剂渲染色（Player.GetHairColor :54933-54937 → HairShaderDataSet.GetColor:39-46）。
   *  无染料（hairDye 0）/表外 shaderId → null（调用方回落常规烘焙发色） */
  private hairDyeRenderColor(p: Player, world: World, flicker: FlickerClock | null): { r: number; g: number; b: number } | null {
    const shaderId = Math.trunc(p.hairDye || 0);
    if (shaderId <= 0) return null;            // HairShaderDataSet.cs:41 shaderId!=0 才走染料
    const flick = flicker ?? this.lighting?.clock ?? null;
    const clock = world.clock;
    // Main.time（昼夜染料 :293-329）：昼 0-54000（4:30AM 起）/ 夜 0-32400（7:30PM 起）。
    // 窗口常量 = Clock.DAWN/DUSK（4:30/24=0.1875、19:30/24=0.8125）——type-only import
    // 取常量会被剥，此处按值内联
    const DAWN = 0.1875, DUSK = 0.8125;
    const tod = clock ? clock.timeOfDay : 0.5;
    const isDay = clock ? clock.isDay : true;
    const time = isDay
      ? (tod - DAWN) / (DUSK - DAWN) * 54000
      : (((tod - DUSK) % 1) + 1) % 1 / (1 - (DUSK - DAWN)) * 32400;
    // 金钱染料（:220-247）：0-53 槽钱币铜值（71铜/72银/73金/74铂，Item.cs:42-48）
    let coins = 0;
    for (let i = 0; i < 54 && i < p.inv.slots.length; i++) {
      const s = p.inv.slots[i];
      if (!s) continue;
      const vid = viIdFromKey(ITEM_DEFS[s.id]?.key ?? '');
      const v = vid === 71 ? 1 : vid === 72 ? 100 : vid === 73 ? 10000 : vid === 74 ? 1000000 : 0;
      if (v) {
        coins += s.stack * v;
        if (coins > 9999999999) { coins = 9999999999; break; }
      }
    }
    // 火星染料头部格光照（:413-415：position+width*0.5 / position+height*0.25）
    const lightRgb = this.lighting
      ? this.lighting.lightAt(Math.trunc((p.x + p.w * 0.5) / TILE), Math.trunc((p.y + p.h * 0.25) / TILE))
      : null;
    return hairDyeColor(shaderId, {
      hp: p.hp, maxHp: Math.max(1, p.maxHp),
      mana: p.mana, maxMana: Math.max(1, p.maxMana),
      centerX: p.cx, centerY: p.cy,
      vx: p.vx, vy: p.vy,
      team: p.team, netActive: this.netActive,
      hairColor: p.appearance?.hairColor ?? { r: 215, g: 90, b: 55 },
      coins,
      worldSurface: world.groundLevel, rockLayer: world.rockLevel, maxTilesY: world.h,
      isDay, time,
      waterStyle: this.waterStyle,
      zoneShimmer: !!this.scene?.zoneShimmer,
      shimmerTorch: flick ? flick.shimmerTorchColor() : [0.9, 0.55, 1.2],
      disco: flick ? [flick.discoR, flick.discoG, flick.discoB] : [255, 255, 255],
      lightRgb,
      nowSec: this._liquidNow / 1000,
    });
  }

  /** 发色剂头发叠层。back=true 画后发层（本体之前）；false 画前发层+头甲（本体之后，
   *  层序对齐 compositePaperDoll 内 后发→身体→前发→头甲） */
  private drawDollHairOverlays(
    p: Player,
    equip: { head?: number | null; body?: number | null; legs?: number | null },
    row: number, pad: number,
    color: { r: number; g: number; b: number },
    back: boolean,
  ): void {
    const layer = p.appearance ? dollHairLayer(p.appearance, equip?.head ?? 0) : null;
    if (!layer) return;
    const tinted = hairFrameTinted(layer, row, color);
    if (!tinted) return;
    const ctx = this.ctx;
    if (back) {
      if (!layer.back) return;   // 无后发层发型：后段不画（前段画全帧高）
      ctx.drawImage(tinted, 0, 0, FRAME_W, FRAME_H, -FRAME_W / 2, -FRAME_H + pad, FRAME_W, FRAME_H);
      return;
    }
    // 前发层（backHairDraw 时只画顶部 26px——PlayerDrawSet:1751-1753）
    const frontH = layer.back ? 26 : FRAME_H;
    ctx.drawImage(tinted, 0, 0, FRAME_W, frontH, -FRAME_W / 2, -FRAME_H + pad, FRAME_W, frontH);
    const head = headArmorImage(equip?.head ?? 0);
    if (head) ctx.drawImage(head, 0, row * FRAME_H, FRAME_W, FRAME_H, -FRAME_W / 2, -FRAME_H + pad, FRAME_W, FRAME_H);
  }

  /** 死亡散飞渲染（审计#1：原版 dead 不跳绘制——LegacyPlayerRenderer.cs:479-482
   *  无条件 DrawPlayer；头/身/腿三层组各带 headPosition/bodyPosition/legPosition
   *  偏移与 headRotation/bodyRotation/legRotation 绕 headVect(20,22.4)/bodyVect(20,28)/
   *  legVect(20,42)（PlayerDrawSet.cs:1717-1719），层序 腿→身→头（DrawPlayer_02 → 12 → 21）。
   *  渐隐 = GetImmuneAlpha（Player.cs:53253：(255−immuneAlpha)/255；:53261-53264
   *  immuneAlpha>125 直接 Color.Transparent——≈63t 后散飞体彻底隐没） */
  private drawDeadPlayerParts(p: Player, world: World): void {
    const ctx = this.ctx;
    // 硬核幽灵（Player.cs:16894-16901 difficulty==2 respawn 到点 ghost=true）
    if (p.isGhostPhase(world)) { this.drawGhostSprite(p); return; }
    if (p.immuneAlpha > 125) return;          // 全透明档
    const alpha = (255 - p.immuneAlpha) / 255;
    const a = p.appearance;
    if (!a) {
      // 兜底（登记偏离）：无纸娃娃数据 → 整体单帧带 headRotation 翻滚下坠
      const sheet = this.assets.playerSheet;
      const fw = this.assets.playerFrameW, fh = this.assets.playerFrameH;
      const seg = p.deadParts.head;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(p.cx + p.netOffX, p.y + p.h + p.stepRenderY + p.netOffY);
      ctx.translate(seg.px, seg.py);
      ctx.rotate(seg.rot);
      ctx.scale(p.facing, 1);
      ctx.drawImage(sheet, p.frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
      ctx.restore();
      return;
    }
    let dollEquip = dollEquipFromInv(p.inv, a);
    if (p.buffs.has(BuffType.Werewolf)) dollEquip = { head: 38, body: 21, legs: 20 };
    if (p.merman) dollEquip = { head: 39, body: 22, legs: 21 };   // 人鱼强制三件（:35473-35494，死亡态同置）
    const full = compositePaperDoll(a, dollEquip);
    if (!full) return;
    // 死亡帧行冻结（原版 UpdateDead 不跑 PlayerFrame——bodyFrame 停在死亡瞬间值；
    // 此处以冻结的 vx/onGround 复算同一行档，等价冻结）
    const row = this.playerBodyRow(p, null, 0, null);
    const fFull = dollFrame(full, row);
    const pad = 4;   // 原版玩家层恒 +4（PlayerDrawLayers :109 等 `height−frameH+4f`）
    // 层序 + 旋转轴心（PlayerDrawSet.cs:1717-1719）：腿 legVect Y=0.75H → 身 0.5H → 头 0.4H
    const parts: Array<['legs' | 'body' | 'head', number]> = [
      ['legs', FRAME_H * 0.75], ['body', FRAME_H * 0.5], ['head', FRAME_H * 0.4],
    ];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(p.cx - p.facing * 2.5 + p.netOffX, p.y + p.h + p.stepRenderY + p.netOffY);
    ctx.scale(p.facing, 1);
    for (const [part, pivotY] of parts) {
      const doll = compositePaperDoll(a, dollEquip, { part });
      if (!doll) continue;
      const seg = p.deadParts[part];
      const f = dollFrame(doll, row);
      const pivotLocalY = -FRAME_H + pad + pivotY;   // 头/身/腿各件的刚体旋转轴
      ctx.save();
      ctx.translate(seg.px, seg.py + pivotLocalY);
      ctx.rotate(seg.rot);
      ctx.translate(0, -pivotLocalY);
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -FRAME_W / 2, -FRAME_H + pad, FRAME_W, FRAME_H);
      if (part === 'head') {
        // 眼睑属头层组（DrawPlayer_21_Head_TheFace_Eyelid）——同 headPosition/Rotation
        // 变换；眼帧冻结于死亡值（dead 后 updateEyeState 停）；HidesHead 头甲下跳过
        this.drawEyelid(ctx, p, row, pad, HIDES_HEAD.has(dollEquip.head ?? 0));
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Ghost.png 幽灵（LegacyPlayerRenderer.cs :272-281 三拖影 + DrawGhost :515-533）：
   *  34×176 四帧竖排、帧 = ghostFrame（PlayerFrame :6444-6451 每 8t 进帧 0..3 循环）；
   *  色 = Lighting(mouseTextColor/2+100 四通道) 经 GetImmuneAlpha(color, shadow) =
   *  RGBA×(1−shadow)（immuneAlpha=0）再 A×(1−max(0.5,shadow−0.5))——恒 ×0.5。
   *  故：本体 RGB/A ×(g/255)×0.5；拖影 i=0..1..2 落后 velocity×(2+i×2)、shadow
   *  =0.5/0.7/0.9 → RGB×(1−shadow)、A 再×0.5（velocity=0 时三份与本体同位照画，
   *  原版无跳过门）。mouseTextColor 脉动灰 190↔255（Main.cs:18066-18075 三角波
   *  周期 130t——以 miscCounter 为钟，相位近似登记）；RGB×(g/255) 与 A 分离经
   *  filter brightness（Ghost.png 灰白像素 198..221 → 染暗至 ~155..173） */
  private drawGhostSprite(p: Player): void {
    const tex = this.atlas ? this.atlas.ensureVImage('vanilla/Ghost.png') : null;
    if (!tex || tex.width === 0) return;
    const fh = Math.floor(tex.height / 4);
    const phase = p.miscCounter % 130;
    const tri = Math.min(phase, 130 - phase);        // 0..65
    const g = Math.floor((190 + tri) / 2) + 100;     // mouseTextColor/2+100 → 195..227
    const ctx = this.ctx;
    const draw = (px: number, py: number, k: number, aK: number) => {
      if (k <= 0 || aK <= 0) return;
      ctx.save();
      ctx.filter = `brightness(${(g / 255 * k).toFixed(3)})`;   // RGB×(g/255)×k
      ctx.globalAlpha = Math.min(1, (g / 255) * k * aK);
      ctx.translate(px + tex.width / 2, py + fh / 2);
      if (p.facing === -1) ctx.scale(-1, 1);         // direction 翻转
      ctx.drawImage(tex, 0, p.ghostFrame * fh, tex.width, fh, -tex.width / 2, -fh / 2, tex.width, fh);
      ctx.restore();
    };
    // 三拖影（:273-278）：shadow=0.5+0.2i → RGB×(1−shadow)、A×0.5；位置 −velocity×(2+i×2)
    for (let i = 0; i < 3; i++) {
      const shadow = 0.5 + 0.2 * i;
      draw(p.x - p.vx * (2 + i * 2), p.y - p.vy * (2 + i * 2), 1 - shadow, 0.5);
    }
    // 本体（:281，netOffset 仅联机远端——本地玩家恒 0）
    draw(p.x, p.y, 1, 0.5);
    ctx.filter = 'none';
  }

  /** 眼睑叠层（DrawPlayer_21_Head_TheFace_Eyelid PlayerDrawLayers.cs:2640-2683）：
   *  Players[skinVar,15]（Player_0_15.png 40×168 三帧竖排，全变体共用）按
   *  eyeFrame 叠画于头/眼之上——头层组同一基座坐标 + OffsetsPlayerHeadgear[row] Y−2
   *  （行 7/8/9/14/15/16 → −2，其余 0；gravDir 镜像空间内同值即原版 ×(−1) 语义）；
   *  色 = colorHead → skinColor（eyelidFrame 调色）；帧 0=睁眼为空帧不画 */
  private drawEyelid(ctx: CanvasRenderingContext2D, p: Player, row: number, pad: number, hideFace = false): void {
    if (p.eyeFrame === 0 || !p.appearance || hideFace) return;
    const lid = eyelidFrame(p.appearance);
    if (!lid) return;
    const offY = (HEADGEAR_ZERO_ROWS.has(row) ? 0 : 2) - 2;
    ctx.drawImage(lid, 0, p.eyeFrame * FRAME_H, FRAME_W, FRAME_H,
      -FRAME_W / 2, -FRAME_H + pad + offY, FRAME_W, FRAME_H);
  }

  /** SetOffsetbyBed 逐床型 visualOffsetOfBedBase（PlayerSleepingHelper.cs:229-280
   *  照抄；bedStyle = 床 tile frameY/36，缺省档 (-9,1)）。世界空间消费 =
   *  off×(direction,gravDir)（GetSleepingOffsetInfo :33-40 → PlayerDrawSet.cs:345-348
   *  Position += posOffset） */
  private static readonly BED_VISUAL_OFFSET: Record<number, readonly [number, number]> = {
    8: [-11, 1], 10: [-9, -1], 11: [-11, 1], 13: [-11, -3],
    15: [-7, -3], 16: [-7, -3], 17: [-7, -3], 18: [-9, -3], 19: [-3, -1],
    20: [-9, -5], 21: [-9, 5], 22: [-7, 1], 23: [-5, -1], 24: [-7, 1], 25: [-7, 1],
    27: [-9, 3], 28: [-9, 5], 29: [-11, -1], 30: [-9, 3], 31: [-7, 5], 32: [-7, -1],
    34: [-13, 1], 35: [-13, 1], 36: [-13, 1], 37: [-13, 1], 38: [-11, -3],
  };
  private static readonly BED_VISUAL_OFFSET_DEFAULT: readonly [number, number] = [-9, 1];

  /** 只读床型反查（玩家侧无 bedStyle 追踪字段——禁改 Player.ts）：
   *  精确档 = 玩家 Bottom+(0,−2) 处床格的 floor(frameY/36)（GetSleepingTargetInfo
   *  :203 同格同式——本地玩家唤醒门已保证该格必为床;代理插值边界偶发脱格时
   *  退化 7×4 近窗扫描兜底取最近床） */
  private sleepingBedOffset(world: World, p: Player): readonly [number, number] {
    const st = world.store;
    const tx = Math.floor((p.x + p.w / 2) / TILE), ty = Math.floor((p.y + p.h - 2) / TILE);
    if (st.inBounds(tx, ty)) {
      const iE = st.idx(tx, ty);
      if (st.flags[iE] !== 0 && sheetOf(st.type[iE]) === 79) {
        return Renderer.BED_VISUAL_OFFSET[Math.floor(st.frameY[iE] / 36)]
          ?? Renderer.BED_VISUAL_OFFSET_DEFAULT;
      }
    }
    let best: number | null = null, bestD = 1e9;
    for (let dy = -2; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (!(st.flags[i] & 1) || sheetOf(st.type[i]) !== 79) continue;
      const d = Math.abs(dx) + Math.abs(dy) * 2;
      if (d < bestD) { bestD = d; best = Math.floor(st.frameY[i] / 36); }
    }
    return Renderer.BED_VISUAL_OFFSET[best ?? -1] ?? Renderer.BED_VISUAL_OFFSET_DEFAULT;
  }

  private drawPlayer(p: Player, world: World, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number; noGraphic?: boolean } | null, flicker: FlickerClock | null = null) {
    const ctx = this.ctx;
    if (p.dead) { this.drawDeadPlayerParts(p, world); return; }
    // ---- 变身坐骑隐藏玩家本体（PlayerDrawSet.cs:385-410 AdjustmentsFor{Wolf,
    //      Velociraptor,Rat,Bat,Pixie}Mount → hideEntirePlayer；MountID.Sets.
    //      PlayerIsHidden = {52,54,55,56,61}）：本体/翅膀/眼睑/盾球/手持层全让位，
    //      坐骑贴图即全部视觉。手持物原版由 AdjustmentsForWolfMount 单独改锚续画，
    //      此处以原锚近似续画（登记） ----
    const mntHidden = p.ridingMount && !!MOUNT_SETS.PlayerIsHidden?.[p.mount.type];
    // ---- 玩家本体随坐骑机身倾斜（UFO 7/钻头 8/扫帚 23）----
    // 原版 DrawPlayerFull 把 fullRotation/fullRotationOrigin 整组传进 PlayerDrawSet
    // （LegacyPlayerRenderer.cs:481），TransformDrawData（PlayerDrawLayers.cs:4199-4230）
    // 对绘制缓存全部层绕 Position+rotationOrigin 刚体旋转——手持物/翅膀/纸娃娃都跟转
    // （ignorePlayerRotation 例外：钻头激光 Mount.cs:6061）。
    // 本仓坐骑机身贴图已由 drawMountLayer 自转（勿在此包住它→双转），故分三段施加：
    //  A 手持层（静持+挥舞弧，DrawPlayer_27_HeldItem）/ B 本体层（翅膀+纸娃娃）/
    //  C 身前使用物层。pivot 取玩家盒（原版 drawinfo.Position 另含 netOffset/gfxOffY——
    //  gfxOffY 仅矿车（本族恒 0）、netOffset 仅远端（本仓手持层亦不追踪 netOffset，
    //  远端亚像素差，登记））。
    const mrot = p.ridingMount
      ? playerMountRotation(p.mount.type, p.mount.fullRotation,
        { x: p.x, y: p.y, w: p.w, h: p.h }, p.mount.heightBoost)
      : null;
    if (mrot) { ctx.save(); applyPlayerMountRotation(ctx, mrot); }
    // ---- 坐椅渲染偏移（PlayerSittingHelper.GetSittingOffsetInfo :22-37，Player
    //      Position 消费 :4083-4087）：sittingIndex 单人恒 0 → posOffset=offsetForSeat×
    //      Directions + seatAdjustment(−4+(int)offsetForSeat.Y) 竖移。此平移 = 原版
    //      身体链各层 Position.Y += torsoOffset（=seatYOffset，PlayerDrawSet.cs:341）
    //      的等价整体施加——腿切片族内带的 −2/+seatYOffset 已在 PaperDoll 切片表
    //      中对冲（sittingSlicePlan 的 evY−sY 项） ----
    if (p.sitting) {
      ctx.save();
      ctx.translate(p.facing * p.seatOffsetX, -4 + Math.trunc(p.seatOffsetY));
    }
    // ---- heldProj 指向（渲染层单点；模型与门见 src/render/heldProj.ts 头注）----
    // 玩家持有"挂着活体投射物"的武器（食人鱼枪 1156→190）时持物瞄准角改指向
    // 投射物；挥砍/饮用等非 useStyle 5 动画与 noGraphic 族原样让位（挥舞优先）。
    // swing 过期时合成一条 useStyle 5（= aiStyle 39 SetDummyItemTime(5) 的渲染侧
    // 等价，Projectile.cs:26086），持物按住期间持续可见。
    swing = applyHeldProjPointing(p, swing);
    // ---- 手持物（PlayerDrawLayers.cs:3857 门槛）：itemAnimation>0 || (holdStyle!=0) ----
    // 武器/工具 holdStyle=0 → 仅使用中渲染（下方挥舞动画）；火把/荧光棒族 holdStyle=1、
    // 雨伞族 holdStyle=2 等静持时也渲染（ItemCheck_ApplyHoldStyle :49496 逐值持位）；
    // noWet 逐件判定（Player.cs:36026 `(!wet || !noWet)`）——火把/蜡烛族水下隐
    // （熄灭语义）；WaterTorches 三件（523/1333/4384，恰好 noWet=false）与
    // 芦苇管等其余手持物水下照常渲染。
    // holdStyle 数据源 = vanilla-itemfunc（40 件）∪ DefaultToTorch 批量族（提取漏，
    // HOLD_STYLE_ITEMS 手工补）∪ IsFood 批量（Item.cs:48519 `if (Sets.IsFood) holdStyle=1`
    // 在 SetDefaults 公共尾部强制——在库食物 4023/4291/5275/5277/5278/1912/1919 等提取漏，
    // 此前静持不显示）；7 无持位分支（仅 bodyFrame 行 11）不画
    let staticHoldStyle = 0;
    let holdStyleRaw = 0;   // 未置零的静持档（holdStyle 7 无持位绘制但身体行 11 :36042-36045）
    /** 静持绘制载荷（段 A 算参数、本体层之后消费——DrawPlayer_27_HeldItem 层位
     *  = BehindFrontArm 本体之上；曾整段画在本体之前=被身体挡住,用户实报） */
    let heldDraw: { vid: number; hs: number; ar: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } | null;
      icon: HTMLCanvasElement | HTMLImageElement | null;
      fw: number; fh: number; offX: number; offY: number; rot: number } | null = null;
    if (!swing) {
      const held = p.inv.heldItem();
      const def = held ? ITEM_DEFS[held.id] : undefined;
      // 水下门 = 逐件 noWet（Player.cs:36026 `(!wet || !noWet)`）——火把/蜡烛族
      // 水下隐（熄灭语义），芦苇呼吸管 186 等其余手持物水下照常渲染（2026-08-17
      // 修：曾全局 !p.inWater 把呼吸管在水下隐身）
      if (held && def && (!p.inWater || !NO_WET_ITEMS.has(viIdFromKey(def.key)))) {
        const vid = viIdFromKey(def.key); // vi_8_Torch 自动解析 8(本地特判已退役)
        // IsFood 门在最前：原版公共尾段无条件覆盖（即使 itemfunc 已录也以 1 为准）
        let hs = vid >= 0 && VANILLA_IS_FOOD.has(vid) ? 1
          : vid >= 0 ? itemFuncOfVid(vid)?.holdStyle ?? (HOLD_STYLE_ITEMS.has(vid) ? 1 : 0) : 0;
        // ★钓竿静持门（ItemCheck_HackHoldStyles Player.cs:53483-53492，2026-08-25 R32）：
        // 竿族 holdStyle 运行时清零，仅当使用动画窗已收且场上存在本人浮漂弹时置 1
        // → ItemCheck_ApplyHoldStyle :50879/:51002-51005 静持绘制（此前缺失=抛竿后
        // 手上无竿、鱼线凭空——用户实报）。bobberOwners = 每帧实体表重扫（render 入口）
        const hacked = hackHoldStyleActive(
          vid >= 0 ? itemFuncOfVid(vid)?.fishingPole ?? 0 : 0,
          this.bobberOwners.has(p),
          !swing && p.useTime <= 0,   // ItemTimeIsZero && itemAnimation==0（:53487）
        );
        if (hacked >= 0) hs = hacked;
        staticHoldStyle = hs === 7 ? 0 : hs;
        // CanVisuallyHoldItem（:49462-49500）：抚摸中 holdStyle 4/5/6 持物隐藏
        //（petting 三分支 return false——仅门持物绘制，身体行档不受此门）
        if (p.petting.isPetting && (hs === 4 || hs === 5 || hs === 6)) staticHoldStyle = 0;
        holdStyleRaw = hs;
        // 变身坐骑（PlayerIsHidden）原版由 AdjustmentsForWolfMount 改锚续画手持物——
        // 此处原锚近似续画（不隐藏，登记锚点偏差）
        if (staticHoldStyle) {
          // ★手持帧规格同 drawUseItem（GetItemDrawFrame :41901-41903）：IsFood 取
          // 竖 3 帧条第 2 行（atlasIcon 切的是掉落物顶行 → 从 vicon 原条重切）
          const arRaw = this.atlasIcon(held.id);
          const ar = vid >= 0 && arRaw && VANILLA_IS_FOOD.has(vid) && this.atlas
            ? Renderer.foodHeldFrame(this.atlas.vicon(vid), arRaw)
            : arRaw;
          const icon = ar ? null : this.itemIcon(held.id);
          if (ar || icon) {
            const fw = ar ? ar.sw : 14, fh = ar ? ar.sh : 14;
            // 持位（ApplyHoldStyle dir=1 空间；offX 正=身前，offY 从 p.y 起算）：
            //  1 默认 = (fw/2+2, 24)（:49720）；荧光棒族 282/286/3112/4776/5643 再
            //  X-2·dir、Y+4（:49657-49663；3002 黏性荧光棒不在表内）；2 雨伞 =
            //  (-16, 22)（:49764）、其余 = (6, 16) 旋 -0.79（:49777）；3 = (-2, 中心-fh/2)
            //  （:49790）；6 = (8, 38+头饰)（:49833）；8 = (6, 28+头饰)（:49851）。
            //  rot 恒 0（除 2 的 else）。
            let offX = fw * 0.5 + 2, offY = 24, rot = 0;
            if (hs === 1 && vid >= 0 && (vid === 282 || vid === 286 || vid === 3112 || vid === 4776 || vid === 5643)) {
              offX = fw * 0.5; offY = 28;   // (fw/2+2-2, 24+4)
            }
            // holdStyle 1 链特判（:49606-49663 else-if 序）：968 棉花糖串 X=中心+8
            // （Y 走默认 24；整图 32×10 直画非 IsFood）→ 营火 miscTimer>900 烤成
            // 969（:49610-49645，模型侧）；856 独角兽棒 (4,34)；353 麦酒 (6,中心+11)；
            // IsFood 族 (4, 中心+fh/2)（:49709-49713——锚=itemLocation 底左角，
            // MountedCenter.Y = p.y+p.h/2）
            // ★钓竿族（fishingPole 子支 :51002-51005，2026-08-25 R32）：X=中心+
            // (int)(frameW×0.18)×dir、Y=py+24 再 +4（:51033-51035）= py+28；
            // itemRotation=0（:51071）不旋。锚=itemLocation 底左角（dir=-1 时贴图
            // 翻转、底右角落锚——本仓 scale(facing) 对称等价）
            else if (hs === 1 && vid >= 0 && (itemFuncOfVid(vid)?.fishingPole ?? 0) > 0) {
              offX = Math.trunc(fw * 0.18); offY = 28;
            }
            else if (hs === 1 && vid === 968) { offX = 8; }
            else if (hs === 1 && vid === 856) { offX = 4; offY = 34; }
            else if (hs === 1 && vid === 353) { offX = 6; offY = p.h * 0.5 + 11; }
            else if (hs === 1 && vid >= 0 && VANILLA_IS_FOOD.has(vid)) { offX = 4; offY = p.h * 0.5 + fh * 0.5; }
            if (hs === 2) {
              if (vid === 946 || vid === 4707) { offX = -16; offY = 22; }
              else { offX = 6; offY = 16; rot = -0.79; }
            } else if (hs === 3) {
              offX = -2; offY = p.h * 0.5 - fh * 0.5;
            } else if (hs === 6) {
              offX = 8; offY = 38 + HEADGEAR_OFFSET_Y[2];
            } else if (hs === 8) {
              offX = 6; offY = 28 + HEADGEAR_OFFSET_Y[2];
            }
            // 变身坐骑静持锚（AdjustmentsFor*Mount——静持 = 无动画档 animating=false；
            // num=静持身体行：hold1/3/5→3、hold2→2、无→0（:36025-36040））
            if (p.ridingMount && MOUNT_SETS.PlayerIsHidden?.[p.mount.type]) {
              // ★传物品真实 useStyle：原版 flag4/5/10/8/7 档只读 heldItem.useStyle
              //（:50684-50690）,静持同样命中（IsFood us2 静持 54 上应 (3,2)/52 上 (14,-4)）;
              // 曾传 null 直接落 holdStyle 档差 2px（2026-08-18 审查）
              const heldDef = held ? ITEM_DEFS[held.id] : undefined;
              const heldVid = heldDef ? viIdFromKey(heldDef.key) : -1;
              const heldUs = heldVid >= 0 ? itemFuncOfVid(heldVid)?.useStyle ?? null : null;
              const m = this.mountHeldAnchor(p.mount.type, typeof heldUs === 'number' ? heldUs : null, hs, false,
                vid === 2289 || (vid >= 2291 && vid <= 2296) || vid === 2421 || vid === 2422 || vid === 4325 || vid === 4442,
                { vid, bodyRow: hs === 2 ? 2 : hs ? 3 : 0 });
              if (m) {
                if (m.resetX !== undefined) { offX = m.resetX; offY = m.resetY!; }
                else { offX += m.dx; offY += m.dy; }
              }
            }
            heldDraw = { vid, hs: staticHoldStyle, ar, icon, fw, fh, offX, offY, rot };
          }
        }
      }
    }
    if (mrot) ctx.restore();   // 段 A 收口（手持层随机身旋转；TransformDrawData 同转）

    // 无敌帧闪烁：半透明而非消失（主角本体永不全隐）
    ctx.save();
    // 水下滤镜：只作用于主角本体素材（蓝色调：去饱和 + 压暗 + 蓝移）
    if (p.headUnderwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
    let bodyAlpha = 1;
    if (p.iframes > 0 && p.iframes % 6 < 2) bodyAlpha = 0.45;
    // 微光化半透明（Player.cs:18147-18162 shimmerTransparency → GetImmuneAlpha
    // :53253-53256：(1-t) 连乘三次 = (1-t)³ 曲线（前段几乎不透明、后段急坠），
    // t≥0.8 直接 Color.Transparent 全隐——曾线性 1-t，深浸段偏亮）
    if (p.shimmerTransparency > 0) {
      bodyAlpha *= p.shimmerTransparency >= 0.8 ? 0 : (1 - p.shimmerTransparency) ** 3;
    }
    // ---- stealth 潜行视觉管线（PlayerDrawSet :1523-1660 三分支）----
    // 3106 变态刀/蘑菇矿套（PlayerDrawSet.cs:1525-1563）：settled=(1+s'·10)/11、
    //   armor R/G/A×s' 且 **B×settled**、皮肤/发/眼/衣着 RGBA×s'²；
    // 星璇（:1610-1651）：settled=s'、armor RGB×Lerp(White→(0,0.12,0.16,0),1−s')
    //   （A×s'）、皮肤/衣着 ×s'²。s' = max(stealth, 0.03)。
    // doll 按此分两层绘制（compositePaperDoll layer:'skin'/'armor'，tintRGBA 逐通道）
    const stEq = p.equipStats;
    const stF = stealthFactors(p.stealth, p.heldPsychoKnife, stEq.shroomiteSet, stEq.vortexSet);
    const stealthSettled = stF.settled;         // drawinfo.stealth（叠画消费值）
    const stealthClamp = stF.clamp;             // s'（armor 主纹理 alpha 档）
    const vortexTint = stF.vortexTint;
    if (bodyAlpha < 1) ctx.globalAlpha = bodyAlpha;   // 免疫闪烁等基底 alpha（stealth 分层在各层内乘）
    // 矿车骑乘：整体绕脚底中心旋转（Player.fullRotation/fullRotationOrigin=(w/2,h)，
    // Player.cs:27805-27806 TrackRotation 产出）+ gfxOffY 纵向贴轨补偿
    const cart = p.ridingCart ? p.cart : null;
    const gfxOff = cart ? cart.gfxOffY : 0;
    if (cart && cart.rotation !== 0) {
      ctx.translate(p.cx, p.y + p.h);
      ctx.rotate(cart.rotation);
      ctx.translate(-p.cx, -(p.y + p.h));
    }
    // ---- 坐骑身后层（Mount.Draw backTexture :5500：先于玩家本体绘制）----
    const mnt = p.ridingMount ? p.mount : null;
    if (mnt) this.drawMountLayer(ctx, p, mnt, 'back', world.groundLevel);
    // 段 B：本体层（翅膀+纸娃娃/legacy 帧）随转——变换挂在 body save 内，由其
    // ctx.restore() 收口；坐骑背层在上面已自转，勿包住（双转）
    if (mrot) applyPlayerMountRotation(ctx, mrot);
    // 跨台阶时用渲染补偿高度（从旧高度缓升），消除物理瞬移的顿挫感；
    // 联机远端叠加 netOffset（原版 Player.netOffset 平滑收敛，本地玩家恒 0）
    // 坐骑骑姿抬升（PlayerDrawSet :425-426 mountOffSet=HeightOffsetVisual →
    // Position.Y -= playerYOffsets[frame]：玩家精灵整体上移坐到坐骑背上）
    const mOff = mnt ? mnt.playerOffset : 0;
    ctx.translate(p.cx - p.facing * 2.5 + p.netOffX, p.y + p.h + p.stepRenderY + gfxOff + p.netOffY - mOff); // 脚底中心（精灵后移2.5px = 碰撞盒微前移）
    ctx.scale(p.facing, 1);
    // 重力反转（gravDir=-1）整体垂直镜像（PlayerDrawSet 全层 FlipVertically）：
    // 脚底锚 y=0、身体占 y∈[-h,0]——先 translate(0,-h) 再 scale(1,-1) 绕玩家盒
    // 翻转（脚到盒顶 y=0_world、头到盒底），锚点随转（原版各层锚点 *gravDir 语义）
    if (p.gravDir === -1) { ctx.translate(0, -p.h); ctx.scale(1, -1); }
    // 睡床躺平（PlayerSleepingHelper.cs:66-83）：fullRotation = π/2·(−direction)、
    // origin = Size/2（绕玩家盒中心转）。逐床型 visualOffsetOfBedBase（:227-280
    // SetOffsetbyBed）经 off×(direction,gravDir) 世界空间先平移再随转（原版
    // Position += posOffset 后绕 Position+Size/2 旋转 = 同一变换合成；镜像空间内 X 乘 facing）。
    // ★本仓镜像在前（scale(facing,1) 先于旋转）:S·R(θ) = R(α)·S ⟹ θ = facing·α,
    // α = π/2·(−direction) → θ 两朝向化简后【恒 −π/2】（曾写 π/2·(−facing) → 视觉
    // 恒 −π/2：变体B(枕左,facing+1)碰巧对、变体A(枕右,facing−1)头睡在脚尾）
    if (p.sleeping) {
      const bo = this.sleepingBedOffset(world, p);
      const sleepIdx = (p as unknown as { __sleepIdx?: number }).__sleepIdx ?? 0;
      for (const op of sleepingTransformOps(p, bo, sleepIdx)) {
        if (op[0] === 't') ctx.translate(op[1], op[2]);
        else ctx.rotate(op[1]);
      }
    }

    // ---- 配饰身上贴图·帧行（配饰审计系统性批 2026-08-22;2026-08-23 前移——
    // 背包/尾巴子层须画在翼层之前,playerFrameRows 有 swimPhase 相位副作用,
    // 一帧只许一次复算）----
    let accDollEquip: { head: number | null; body: number | null; legs: number | null } | null = null;
    let accRows: { body: number; legs: number } = { body: 0, legs: 0 };
    /** face 四层路由逐帧门解算（PlayerFrame :36252-36271——狼/人鱼强改 = transformed
     *  清空四字段 :36252-36256;OverrideHelmet 命中 → 头盔/发型双隐） */
    let facePlan: import('../data/vanillaAccDrawslots').FaceLayerSplitPlan | null = null;
    if (!mntHidden) {
      accDollEquip = p.appearance ? dollEquipFromInv(p.inv, p.appearance, mnt?.type === 54) : null;
      if (accDollEquip) {
        if (p.buffs.has(BuffType.Werewolf)) accDollEquip = { head: 38, body: 21, legs: 20 };
        if (p.merman) accDollEquip = { head: 39, body: 22, legs: 21 };
        facePlan = faceLayerSplitPlan(p.equipStats.accDraw, accDollEquip.head ?? 0,
          p.buffs.has(BuffType.Werewolf) || p.merman);
        // OverrideHelmet 露脸装备（:36256-36259 head=-1）：头盔整件不画 + 发型全隐
        // （PreventHairDraw={2,3,4,19} 与 OverrideHelmet 同集——DrawPlayer_21_Head
        // :2422 hair 支门）→ 纸娃娃 head 槽清空 + skipHair（hairHidden 消费）
        if (facePlan.hairHidden) accDollEquip = { ...accDollEquip, head: null };
      }
      accRows = this.playerFrameRows(p, swing, holdStyleRaw, mnt, cart, accDollEquip?.legs ?? 0);
    }
    // 背包/尾巴子层（DrawPlayer_08_Backpacks/08_1_Tails——层序在翼前
    // LegacyPlayerRenderer.cs:180-190,故先于下方翅膀层）
    this.drawAccBackpackTailLayers(ctx, p, accRows, stealthClamp, mnt);
    // ---- 翅膀层（DrawPlayer_09_Wings :655-1040：身后，先于身体绘制）----
    // 表驱动（src/data/vanillaWingVisuals.ts）：逐款切帧数 num14（generic=4，曾误写 7/6）
    // + 局部锚点（基底 = Position+(w/2, h−bodyFrame.Height/2)+(0,7) → 脚底局部 (0,−21)，
    // 逐款 offset (num13−9, num12+2)·directions；镜像空间 X 局部值 = num13−9）。
    // 翻转 = 外层 scale(facing,1)（曾内层再镜像一次 → facing=-1 时抵消永不翻转）；
    // 朝向偏移在镜像空间直接取表值，勿再乘世界坐标（曾把 p.cx 叠进局部空间 → 翅膀画到
    // 2× 世界坐标处屏幕外，此为"背后没翅膀"的根因）。
    // 主纹理分两族：lit 族（generic colorArmorBody 等）合成前画（乘光=原版 GetColor）；
    // 全亮族（mainGlow：28/34/40/44/45/51 硬编码色）与全部叠画入 wingGlowQueue
    // 合成后绘制（原版 DrawData 常色不受光照——合成前画会被全屏乘光压暗=偏差）。
    {
      // wings（绘制侧）随坐骑清零（Player.cs:26316-26322：禁翼族 wings=wingsLogic=0）
      // 人鱼湿态清翼（Player.cs:35487-35494 flag4 = wet && !lavaWet && (!mount ||
      // !史莱姆坐骑) → wings=0）
      const merfolkClearWings = p.merman && p.inWater && !p.inLava
        && !(mnt && p.mount.type === 3);
      // 隐藏翼显形特例（UpdateEquips :12580：!hideVisibleAccessory[n] ||
      // (vy≠0 && mount.CanUseWings)——本仓 mount.CanUseWings ≡ !ridingMount,
      // mnt 非空即骑乘;hidden 旗由聚合侧随翼记录,vy 项不入记忆化键故在此判）
      const wingAgg = p.equipStats.wing;
      // R4-23（P57:26824-26834 + Mount.cs:572-580/:2550-2585）：MountData.CanUseWings
      // 是 C# bool 字段【缺省 false】,仅 SetAsRollerSkate(57-60) 置 true;未骑乘恒 true。
      // 本仓曾骑任何坐骑恒清翼（过严）。vanilla-mounts.json 仅 57-60 带该键(=true),
      // 其余缺省=false。滚轴鞋滑行分支未实装（备案）
      const mountCanWings = !mnt || MOUNT_DATA[String(mnt.type)]?.CanUseWings === true;
      // 隐藏翼显形门（★1457 :15709-15717 改 `vy!=0 && !mount.Active`——1456 旧条件
      // 是 vy!=0 && mount.CanUseWings;★1458 :15712 再扩为
      // `vy!=0 && (!mount.Active || MountID.Sets.DoesNotOverrideWings[mount.Type])`
      // ——DoesNotOverrideWings={57,58,59,60}=滚轴鞋族(MountID.cs 1458 新表),
      // 与 CanUseWings 同集 → 骑滚轴鞋腾空时隐藏翼恢复显形（Roller Skates 翅膀修复））
      const wingVisible = !wingAgg?.hidden || (p.vy !== 0 && mountCanWings);
      const wingSlot = wingAgg && wingVisible && mountCanWings && !merfolkClearWings && !mntHidden ? wingAgg.logic : 0;
      if (wingSlot > 0 && this.atlas) {
        const d = wingDrawOf(wingSlot);
        const dyeEmu = dyeApplyOf(p.wingDyeVid());
        if (dyeEmu) {
          dyeEmu.uniforms.uDirection = p.facing;              // ArmorShaderData.Apply 尾段 entity.direction
          if (dyeEmu.tech === 'ArmorReflective' || dyeEmu.tech === 'ArmorReflectiveColor') {
            dyeEmu.uniforms.uLightSource = this.reflectiveLightSource(p);
          }
        }
        // ShouldDrawWingsThatAreAlwaysAnimated 门（:30271）：vy≠0 && 未锚定钩爪 &&
        // 非水中漂浮（mount.CanUseWings 已由上方坐骑清零门覆盖）
        const alwaysOk = !d.alwaysAir
          || (p.vy !== 0 && !p.grappleProjs.some((g) => g.latched)
            && !(p.inWater && ((p.equipStats.canFloat || (p.ridingMount && p.mount.type === 37))
              && !p.inputDown && (!p.ridingMount || p.mount.type === 37))));   // ShouldFloatInWater :3856-68（canFloat 两源=4404∪buff265 火烈鸟；Flipper 药不入源——R1-F1 同根残留）
        if (alwaysOk) {
          const fr = wingDrawFrame(wingSlot, { frame: p.wingFrame, counter: 0 }, p.miscCounter);
          // 47/49 锚点按身体帧行（OffsetsPlayerHeadgear；行复算与下方纸娃娃同规则）
          const anchor = d.headgearRow
            ? wingAnchorForRow(d, this.playerBodyRow(p, swing, staticHoldStyle, mnt))
            : d.anchor;
          // lit 主纹理（合成前）：generic/22/23/27/30/31/32/38/39/43/47/48/49/50
          //（44 彩虹翼是 mainGlow 族，只走烘焙图链，不入此分支；31/32 带 litAlpha）
          // stealth：armor 主纹理 RGBA×s'（3106/蘑菇矿 :1539-1541/星璇 secondColor
          // A=s'）→ alpha ×s'；星璇另带 RGB 暗青 tint（secondColor）；
          // cWings 染料（Player.cs:9417 → SM2 字节码执行，全技术可用）
          if (!d.mainGlow && d.overlay?.kind !== 'betsy') {
            const tex = this.atlas.ensureVImage(`vanilla/Wings_${wingSlot}.png`);
            if (tex && tex.width > 0) {
              const fh = Math.floor(tex.height / d.frames);
              const sc = this.wingTexSource(tex, 0, fr * fh, tex.width, fh, dyeEmu, vortexTint);
              ctx.save();
              ctx.translate(anchor[0], anchor[1]);
              if (d.litAlpha !== undefined) {
                // 31/32（generic 尾段 :980-986）：color9.A 直改 220/127×settled——
                // alpha 覆写【替换】s' 档（C# 赋值非乘法），基色仍 colorArmorBody（lit 族）
                ctx.globalAlpha *= (d.litAlpha / 255) * stealthSettled;
              } else if (stealthClamp < 1) ctx.globalAlpha = stealthClamp;
              if (sc) ctx.drawImage(sc, -tex.width / 2, -fh / 2);
              else ctx.drawImage(tex, 0, fr * fh, tex.width, fh,
                -tex.width / 2, -fh / 2, tex.width, fh);
              ctx.restore();
            }
          }
          // 全亮主纹理 + 叠画 → 合成后队列（带 stealth 因子供 flush 逐层公式消费）
          if (d.mainGlow || d.overlay) {
            this.wingGlowQueue.push({
              p, slot: wingSlot, fr, anchor,
              wx: p.cx - p.facing * 2.5 + p.netOffX,
              wy: p.y + p.h + p.stepRenderY + gfxOff + p.netOffY - mOff,
              settled: stealthSettled, clamp: stealthClamp, vortexTint, dye: dyeEmu,
            });
          }
        }
      }
    }
    // ---- 配饰身上贴图·身后族（帧行/背包/尾巴已在前,见翅膀层上方）----
    // 披风（DrawPlayer_10_BackAcc :590-655,层序在翼后肤前
    // LegacyPlayerRenderer.cs:186-194）+ 气球（DrawPlayer_11_Balloons :1140-1172）
    this.drawAccBehindLayers(ctx, p, accRows, stealthClamp, mnt);
    // ---- 纸娃娃帧（捏人外观优先，M7；20 帧表默认朝右，与 NPC 相反不做内层翻转） ----
    // use 期间 bodyFrame 行（Player.cs:35874-35990 itemAnimation>0 分支逐 useStyle）：
    // 返回 -1 = 该族不改 bodyFrame（useStyle 10/14/15 与无匹配分支的 16），走常规动画行
    const useRow = swing ? this.useStyleBodyRow(swing, p) : -1;
    let drawn = false;
    /** 头层脸饰（faceHead/underHair/头层面罩）已由纸娃娃路径拆画——传给
     *  drawAccFrontLayers 抑制前层兜底重画 */
    let headFaceDrawn = false;
    // 54 迅猛龙（hideEntirePlayerExceptHelmetsAndFaceAccessories :1843-1854）：
    // 本体隐藏但头盔照画（ArmorIDs.Head.Sets.CanDrawOnVelociraptorMount 门
    // :2103-2108）。脸饰品在迅猛龙上原版仍画：face/faceMask/faceFlower 走
    // DrawPlayer_22_FaceAcc :2801-2852（CanDrawOnVelociraptorMount 门 :2823/:2843，
    // 锚 = DrawPlayer_GetMountOffsetForFaceAcc :2773-2799——52 狼 (28,-2)·Directions、
    // 54/55/56/61 走 ApplyHeadOffsetFromMount − GetHelmetOffsetAddonFromMount；
    // faceMask 头下层变体另在 :2124-2137）——本仓无 face/faceMask/faceFlower
    // 装备槽与 AccFace 贴图族（引擎级缺口，勿在渲染层硬造；补系统时 wolf 52 的
    // (28,-2) 偏移同表在此）。Position.X −= direction·14（:1851）→ 镜像空间内平移 −14
    const veloHead = mntHidden && p.mount.type === 54;
    if (p.appearance && (!mntHidden || veloHead)) {
      if (veloHead) {
        let vh = dollEquipFromInv(p.inv, p.appearance, true);
        if (p.buffs.has(BuffType.Werewolf)) vh = { head: 38, body: 21, legs: 20 };
        if (p.merman) vh = { head: 39, body: 22, legs: 21 };
        const vr = this.playerFrameRows(p, swing, holdStyleRaw, mnt, cart, vh.legs ?? 0);
        const headDoll = vh.head ? compositePaperDoll(p.appearance, vh, { part: 'head' }) : null;
        if (headDoll) {
          ctx.save();
          ctx.translate(-14, 0);   // Position.X −= direction·14（镜像空间局部 X）
          const hf = dollFrame(headDoll, vr.body);
          ctx.drawImage(hf.img, hf.sx, hf.sy, hf.sw, hf.sh, -hf.sw / 2, -hf.sh + 4, hf.sw, hf.sh);
          this.drawEyelid(ctx, p, vr.body, 4, HIDES_HEAD.has(vh.head ?? 0));
          ctx.restore();
          drawn = true;
        }
      }
    }
    if (p.appearance && !mntHidden) {
      // 装备与帧行已在上方配饰身后族段复算（accDollEquip/accRows——一帧一次,
      // playerFrameRows 的 swimPhase 相位副作用禁双调）
      const dollEquip = accDollEquip!;
      // 发色剂（Player.hairDye 1..12）：动态染料逐帧变色——头发/头甲拆出烘焙，
      // 此处按 后发→本体→前发→头甲 叠画（PlayerDrawSet 发层序同构）
      const dyeColor = this.hairDyeRenderColor(p, world, flicker);
      // ★body/legs 双行（原版 PlayerFrame 两条独立状态机，见 playerFrameRows）：
      // 行等同时走整表缓存路径（行走 = 身体同步腿 :36184-36186）；不等时烘焙
      // 40×56 单帧（rows 进 compositePaperDoll 缓存键）
      const rows = accRows;
      const dual = rows.body !== rows.legs;
      // 坐姿（PlayerDrawSet.cs:332-343 isSitting = 坐椅 ∪ 坐骑 17 高尔夫车/23 扫帚/45
      // 木翼）→ 腿通道走 DrawSittingLegs 切片（腿甲全档切片表 :1473；皮肤/裤/鞋默认
      // 切片 :1497；seatYOffset 供特殊档对冲——坐骑态无座位偏移取 0）
      const sitDraw = p.sitting || (mnt && (p.mount.type === 17 || p.mount.type === 23 || p.mount.type === 45));
      const sitOpt = sitDraw
        ? { sitting: { legIndex: dollEquip.legs ?? 0, seatYOffset: p.sitting ? -4 + Math.trunc(p.seatOffsetY) : 0, body: dollEquip.body ?? 0 } }
        : {};
      // ---- 抚摸复合后臂（ItemCheck_ApplyHoldStyle :49499-49508 petting 分支）----
      // petting.isPetting → 后臂换复合网格列 8 拉伸档帧（UpdateCompositeArm
      // PlayerDrawSet.cs:2210-2237：phase0=ThreeQuarters 行1 / phase1=Full 行0，
      // miscCounter%14/7 两相切换 = 抚摸起落节奏）绕肩轴 (26,30) 旋转
      // −2π·(isPetSmall?0.2:0.3)。rot 取右向局部空间恒值：原版 SetCompositeArmBack
      // 的 gravDir 取反（:4161-4166）+ XNA 翻转(先翻后转)与本仓外层
      // scale(facing,1)/scale(1,-1) 镜像合成等价（mirror∘rotate(θ)=rotate(−θ)∘mirror
      // 两向归一），朝向/重力翻转无需再改角。坐骑抚摸档（mount 62/63 → 0.36，
      // :49501-49510）依赖 PetMount（未实现，登记）
      const petArm = p.petting.isPetting
        ? petArmParams(Math.min(1, p.pettingArmPhase) as 0 | 1, p.petting.isPetSmall)
        : null;
      const petOpt = petArm ? { petArm } : {};
      // 发/头甲拆层三态：发色剂（逐帧变色）∪ 头层脸饰拆画（facePlan.split——脸饰须
      // 落在 皮肤脸→脸饰→发→头甲 的原版序中,TheFace :2574 → hair :2422 → helmet
      // :2143+）;OverrideHelmet 命中（hairHidden）= 发整隐,拆出后不回画
      const hairSplit = !!dyeColor || !!facePlan?.split;
      const dollOpts = { ...(hairSplit ? { skipHair: true } : {}), ...(facePlan?.skipFace ? { skipFace: true } : {}), ...(dual ? { rows } : {}), ...sitOpt, ...petOpt };
      const doll = compositePaperDoll(p.appearance, dollEquip, dollOpts);
      if (doll) {
        const row = rows.body;                     // 发/头甲/眼睑随身体行（bodyFrame）
        const f = dollFrameRows(doll, rows);
        // 贴底:原版玩家层恒 +4（PlayerDrawLayers :109/:203/:343 头/身/腿全层
        // `Position.Y+height−frameH+4f`——帧底透明边距一并沉入地面）
        const pad = 4;
        const hairCol = dyeColor ?? p.appearance.hairColor;   // 拆层回画用（无染料=原生发色）
        if (hairSplit && !facePlan?.hairHidden) this.drawDollHairOverlays(p, dollEquip, row, pad, hairCol, true);
        if (stealthClamp >= 1) {
          ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -f.sw / 2, -f.sh + pad, f.sw, f.sh);
        } else {
          // stealth 分层（PlayerDrawSet.cs:1523-1651 1:1）：皮肤/发/衣着 RGBA×s'²
          // 先画，甲层（RGB×armorMul / A×s'）后画——甲覆盖像素走甲公式、裸露像素
          // 走皮肤公式，与原版逐 DrawData color 一致
          const s2 = stF.skinMul;                      // s'²
          const skinDoll = compositePaperDoll(p.appearance, dollEquip,
            { skipHair: hairSplit, skipFace: facePlan?.skipFace, layer: 'skin', ...(dual ? { rows } : {}), ...sitOpt, ...petOpt });
          if (skinDoll) {
            const fs = dollFrameRows(tintRGBA(skinDoll, [s2, s2, s2]), rows);
            const ga = ctx.globalAlpha;
            ctx.globalAlpha = ga * s2;
            ctx.drawImage(fs.img, fs.sx, fs.sy, fs.sw, fs.sh, -fs.sw / 2, -fs.sh + pad, fs.sw, fs.sh);
            ctx.globalAlpha = ga;
          }
          // 甲层（身/腿）画在 前发+头甲 叠层之前（原版层序：躯干甲→前发→头甲）；
          // 发色剂/头层脸饰拆层时头甲归 overlay(false) 路径（armorNoHead）。
          // ★overlay(false) 内的头甲/发色发层尚未消费 stealth 乘数（发×s'²、头甲
          //   ×armorMul——原版 colorHair×s'² / colorArmorHead×s'）：发色剂+潜行同开
          //   时该叠层不衰减，集成点在 drawDollHairOverlays（发色剂会话在途）
          const armorDoll = compositePaperDoll(p.appearance, dollEquip,
            { layer: hairSplit ? 'armorNoHead' : 'armor', ...(dual ? { rows } : {}), ...sitOpt, ...petOpt });
          if (armorDoll) {
            const armorMul: [number, number, number] = stEq.vortexSet
              ? [vortexTint![0], vortexTint![1], vortexTint![2]]   // Lerp 通道（:1641-1644）
              : [stealthClamp, stealthClamp, stealthSettled];      // B×settled（:1539-1541）
            const fa = dollFrameRows(tintRGBA(armorDoll, armorMul), rows);
            const ga2 = ctx.globalAlpha;
            ctx.globalAlpha = ga2 * stealthClamp;                  // A×s'
            ctx.drawImage(fa.img, fa.sx, fa.sy, fa.sw, fa.sh, -fa.sw / 2, -fa.sh + pad, fa.sw, fa.sh);
            ctx.globalAlpha = ga2;
          }
        }
        // ---- 头层脸饰（DrawPlayer_21_Head_TheFace :2574-2650——发层之下的头层路径,
        //      2026-09-03 四层路由批接入）----
        if (facePlan?.split) {
          if (facePlan.faceHead > 0) {
            // 分支二（:2592-2614）：faceHead 替代皮肤脸（skipFace 已烘）+ 无眼睑
            const tex = this.atlas?.ensureVImage(`vanilla/Acc_Face_${facePlan.faceHead}.png`);
            if (tex && tex.width > 0) {
              const ho = FACE_HEAD_OFFSET_IDS.has(facePlan.faceHead)
                ? (FACE_HEAD_HELMET_OFFSET[facePlan.head] ?? [0, 0]) : [0, 0];
              this.drawAccBodyFrame(ctx, tex, row, p.equipStats.accDraw.dyeFaceHead, stealthClamp, p.facing, ho[0], ho[1]);
            }
          } else {
            // 分支三（:2617-2647）：皮肤脸（doll 已烘）→ 眼睑 → underHair
            this.drawEyelid(ctx, p, row, pad, false);
          }
          if (FACE_UNDER_HAIR.has(facePlan.face)) {
            // underHair（:2598-2613/:2633-2641）：裸锚;盲眼罩 5 + 骷髅族 faceHead
            // （未换 Alt 档）→ +2·dir 附加偏移（:2603-2609）
            const tex = this.atlas?.ensureVImage(`vanilla/Acc_Face_${facePlan.face}.png`);
            if (tex && tex.width > 0) {
              const dx = facePlan.face === 5 && facePlan.faceHead >= 10 && facePlan.faceHead <= 13 ? 2 : 0;
              this.drawAccBodyFrame(ctx, tex, row, p.equipStats.accDraw.dyeFace, stealthClamp, p.facing, dx, 0);
            }
          }
          if (facePlan.maskUnderHead) {
            // 面罩头层支（DrawPlayer_21_Head :2124-2137 flag5）：GetFaceDrawOffset +
            // helmetOffset 锚同前层支,画在发/头甲之下
            const tex = this.atlas?.ensureVImage(`vanilla/Acc_Face_${facePlan.faceMask}.png`);
            if (tex && tex.width > 0) {
              const fo = FACE_HELMET_OFFSET[facePlan.faceMask]?.[facePlan.head] ?? [0, 0];
              const ho = HELMET_DRAW_OFFSET[facePlan.head] ?? [0, 0];
              this.drawAccBodyFrame(ctx, tex, row, p.equipStats.accDraw.dyeFaceMask, stealthClamp, p.facing, fo[0] + ho[0], fo[1] + ho[1]);
            }
          }
          headFaceDrawn = true;
        }
        // 前发+头甲回画（发色剂/头层脸饰拆层时;hairHidden=发整隐不回画）
        if (hairSplit && !facePlan?.hairHidden) this.drawDollHairOverlays(p, dollEquip, row, pad, hairCol, false);
        // ---- 眼睑叠层（DrawPlayer_21_Head_TheFace_Eyelid :2640-2683：叠画于
        //      头/眼之上——眨眼/眯眼/耷拉眼/床闭眼/致盲/受击，见 Player.updateEyeState；
        //      HidesHead 头甲（狼人 38 族）下随 base 脸一并跳过（:2577 flag 门）；
        //      头层脸饰拆画帧已在上段按 TheFace 支序插入） ----
        if (!headFaceDrawn) this.drawEyelid(ctx, p, row, pad, HIDES_HEAD.has(dollEquip.head ?? 0));
        drawn = true;
      }
    }
    if (!drawn && this.atlas && !mntHidden) {
      const idle = this.atlas.rect('角色/Player.png', 'Player_0');
      const runFrames = this.runFramesCache ??= this.atlas.animFrames('Player/Run');
      // 动作帧池（Player.png 12-22 号帧）
      if (!this.actionFramesCache) {
        const pool: Record<string, ReturnType<SpriteAtlas['rect']>> = {};
        for (let k = 12; k <= 22; k++) {
          const fr = this.atlas!.rect('角色/Player.png', 'Player_' + k);
          if (fr) pool['Player_' + k] = fr;
        }
        this.actionFramesCache = pool;
      }
      const af = this.actionFramesCache;
      let frame: typeof idle = null;
      // use 期间：bodyFrame 行映射到动作帧池（行1→19 举 / 行2→20 挥 / 行3→21 收，
      // 行0→12 / 行4→14；Player.cs:35876-35990 逐 useStyle 行档）
      if (useRow >= 0) {
        const rowFrame = af['Player_' + (useRow === 0 ? 12 : useRow === 4 ? 14 : 19 + useRow)];
        frame = rowFrame ?? idle;
      } else if (cart || mnt) {
        frame = af['Player_21'] ?? idle;  // bodyFrame 行 3 → 动作帧池 21（收势/坐姿）
      } else if (Math.abs(p.vx) > 0.3 && p.onGround) {
        // ★行走循环优先于静持行（与纸娃娃路径同因：原版身体/腿分图层，静持只钉
        // 身体行、腿照常走 legFrame 循环（cs:36178）；单层帧近似下静持行让位）
        const idx = Math.floor((p.animTime * 1.3) / 8) % runFrames.length;   // 行走速率 1:1（:35829-35847 ×1.3/8）
        frame = runFrames[idx] ?? idle;
      } else if (staticHoldStyle === 2) {
        frame = af['Player_20'] ?? idle; // holdStyle 2 → bodyFrame 行 2
      } else if (staticHoldStyle === 4 && p.onGround && p.gravDir === 1) {
        frame = idle;                    // holdStyle 4 → 站定行 0（:36046 需 gravDir==1）
      } else if (staticHoldStyle) {
        frame = af['Player_21'] ?? idle; // holdStyle 1/3/5 → bodyFrame 行 3
      } else if (!p.onGround) {
        // 空中（:35808-35816/:36121-36161）：无翼升降恒行5（收腿）→ 12；有翼
        // 升/按住跳降=行6（张腿）→ 14；翼 22/28/45 恒行0 → idle
        const wing = p.equipStats.wing;
        if (!wing) frame = af['Player_12'] ?? runFrames[0] ?? idle;
        else if (wing.slot === 22 || wing.slot === 28 || wing.slot === 45) frame = idle;
        else frame = ((p.vy * p.gravDir < 0) || (p.inputJump && p.vy * p.gravDir > 0)
          ? af['Player_14'] : af['Player_12']) ?? runFrames[0] ?? idle;
      } else {
        frame = idle;
      }
      if (frame) {
        // 精灵视觉高度固定 56px（≈3.5 格）——与碰撞盒解耦，
        // 碰撞盒缩小只影响物理，贴图保持高大观感不变
        const h = 56;
        const w = (frame.sw / frame.sh) * h;
        // Maples 精灵默认朝左 → 内层翻转，画完还原（否则手持物会被一起翻到背后）
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h + 4, w, h);
        ctx.restore();
        drawn = true;
      }
    }
    if (!drawn && !mntHidden) {
      // 程序化兜底（锚点同样为脚底中心）
      const sheet = this.assets.playerSheet;
      const fw = this.assets.playerFrameW, fh = this.assets.playerFrameH;
      const frame = p.frame;
      ctx.drawImage(sheet, frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
    }

    // ---- 配饰身上贴图·身前族（配饰审计系统性批 2026-08-22）----
    // 层序 = LegacyPlayerRenderer.DrawPlayer_UseNormalLayers（:170-236）身前段,
    // 详见 drawAccFrontLayers。head = 纸娃娃头盔 ArmorIDs（胡须/脸饰头盔门）
    this.drawAccFrontLayers(ctx, p, accRows, stealthClamp, mnt, accDollEquip?.head ?? 0, accDollEquip?.legs ?? 0, headFaceDrawn);

    ctx.restore();
    // ---- 日曜盾球（DrawPlayer_26_SolarShield, PlayerDrawLayers.cs:3128-3146）----
    // Extra_61+shields-1 单贴图（1/2/3 层各一张,整簇）；锚 = 玩家中心+solarShieldPos[0]；
    // 旋转 = atan2(pos.y·0.5, pos.x)（(pos×(1,0.5)).ToRotation()）+ 左朝向 π + π/50·dir；
    // α 127/255；shader = cBody（身体染料,逐帧真跑 SM2 字节码——贴图仅 ~420px）
    if (p.solarShields > 0 && !p.dead && !mntHidden) {
      const tex = this.atlas ? this.atlas.ensureVImage(`vanilla/Extra_${61 + p.solarShields - 1}.png`) : null;
      if (tex) {
        const pos = p.solarShieldPos[0];
        let rot = Math.atan2(pos.y * 0.5, pos.x);
        if (p.facing === -1) rot += Math.PI;
        rot += Math.PI / 50 * p.facing;
        const bodyDye = p.inv.dye[1];
        const dyeVid = bodyDye ? viIdFromKey(ITEM_DEFS[bodyDye.id]?.key ?? '') ?? -1 : -1;
        const emu = dyeVid > 0 ? dyeApplyOf(dyeVid) : null;
        let src: HTMLImageElement | ImageBitmap | HTMLCanvasElement = tex;
        if (emu) {
          const sc = document.createElement('canvas');
          sc.width = tex.width; sc.height = tex.height;
          const sctx = sc.getContext('2d', { willReadFrequently: true })!;
          sctx.drawImage(tex, 0, 0);
          const id = sctx.getImageData(0, 0, sc.width, sc.height);
          emu.uniforms.uDirection = p.facing;
          this.applyDyeToImageData(id.data, sc.width, sc.height, emu);
          sctx.putImageData(id, 0, 0);
          src = sc;
        }
        ctx.save();
        ctx.translate(p.x + p.w / 2 + pos.x, p.y + p.h / 2 + pos.y);
        ctx.rotate(rot);
        if (p.facing === -1) ctx.scale(-1, 1);   // playerEffect 水平翻转（纹理空间）
        ctx.globalAlpha = 127 / 255;
        ctx.drawImage(src, -tex.width / 2, -tex.height / 2);
        ctx.restore();
      }
    }
    // ---- 手持物层（DrawPlayer_27_HeldItem）：weaponDrawOrder 默认 BehindFrontArm
    //      （PlayerDrawSet.cs:358）= 躯干/头/盾(26)【之上】、仅前臂 28_ArmOverItem 之下
    //      （LegacyPlayerRenderer.cs:233-235；4952 BehindBackArm/高尔夫收势
    //      OverFrontArm 两特例未分档,登记）——本仓身体单层合成,收敛为本体之上。
    //      ★曾整段画在段 A（本体之前）= 武器被身体贴图挡住,用户实报
    //      "原版的贴图是在角色层级之上"。mrot/坐椅偏移随原变换
    //      （TransformDrawData 手持层整组随转;坐椅 save 在本位仍未收口） ----
    if (mrot) { ctx.save(); applyPlayerMountRotation(ctx, mrot); }
    if (heldDraw) {
      const { vid, ar, icon, fw, fh, offX, offY, rot } = heldDraw;
      ctx.save();
      // 静持物随躺转（原版手持层在 DrawDataCache 内,TransformDrawData 整组
      // 旋转——睡中持火把等也横躺;世界空间直接施加,无镜像纠缠）
      if (p.sleeping) {
        const bo = this.sleepingBedOffset(world, p);
        const sleepIdx = (p as unknown as { __sleepIdx?: number }).__sleepIdx ?? 0;
        ctx.translate(bo[0] * p.facing, bo[1] * p.gravDir - 4 * sleepIdx * p.gravDir);
        const ccx = p.cx, ccy = p.y + p.h / 2;
        ctx.translate(ccx, ccy);
        ctx.rotate(Math.PI / 2 * -p.facing);
        ctx.translate(-ccx, -ccy);
      }
      ctx.translate(p.cx + p.facing * offX, p.y + offY);
      ctx.scale(p.facing, 1);
      ctx.rotate(rot);
      if (ar) {
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, -fh, ar.sw, ar.sh);
      } else if (icon) {
        ctx.drawImage(icon, 0, -icon.height * 0.6, icon.width * 0.6, icon.height * 0.6);
      }
      // 手持火苗（PlayerDrawLayers.cs:3519-3561）：flame 物品在武器贴图之上叠
      // ItemFlame_{id} 单帧 × itemFlamePos 7 槽抖动（每 5 绘制帧重掷）
      if (ar && vid >= 0 && FLAME_ITEMS.has(vid) && this.atlas) {
        drawHeldItemFlame(ctx, this.atlas, vid, p.facing, { x: 0, y: -fh, w: ar.sw, h: ar.sh }, flicker);
      }
      ctx.restore();
    }
    // 挥舞动画（手持物统一层）。noGraphic 族（noUseGraphic，矛/炸弹/鞭/短剑等
    // 381 件）不画物品贴图——投射物即本体
    if (swing && swing.item >= 0 && !swing.noGraphic) {
      this.drawUseItem(ctx, p, swing, flicker);
    }
    if (mrot) ctx.restore();
    // ---- 眼球伞云盖（DrawPlayer_38_EyebrellaCloud PlayerDrawLayers.cs:4139-4186）：
    //      Projectile_238 竖 6 帧条、frame = miscCounter%18/6；pos = MountedCenter −
    //      (0,h/2)+(0,−70)；两枚 ±3px 绕行拷贝（miscCounter%50/50×2π×±1）×0.65 +
    //      主体一枚；原版色 = min(头顶光照,170) 各通道 + A100；shader=cHead（头盔染料）
    //      ★2026-09-03 A4 终版：转【合成后逃逸队列】（flushEyebrellaCloud）——worldCanvas
    //      版曾 fill×全屏乘光 = light² 双重压暗；纯撤 fill 又丢原版 min(,170) 亮度帽
    //      （白天比原版亮 50%）。现烘焙 v0=min(头顶光照,170) 一次性施加（帽精确），
    //      cHead 染料受累 tech 走 v0=光（本站 A1 族偏差一并消除）；非受累/无染料走
    //      fill（尾乘族等价）。登记偏差：队列在合成后 = 盖过 over-player 弹幕
    //      （mainGlow 翼同款类）；绕行拷贝 RGB×0.65 仅 alpha 近似（共享烘焙，既有）----
    if (p.eyebrellaCloud && !p.dead && this.atlas) {
      const cloud = this.atlas.ensureVImage('vanilla/Projectile_238.png');
      if (cloud && cloud.width > 0) {
        const frameY = Math.trunc(p.miscCounter % 18 / 6);
        const fh = Math.floor(cloud.height / 6);
        // 头顶光照采样（Top+(0,−30)）→ min(通道,170)（:4162-4175）——16 级量化入键
        const ltx = Math.floor((p.x + p.w / 2) / TILE), lty = Math.floor((p.y - 30) / TILE);
        const lc = this.lighting ? this.lighting.lightAt(ltx, lty) : [255, 255, 255];
        const cap = this.fullbright ? 255 : 170;    // 开灯恒白（与 betsy 同守卫）
        const q = (v: number) => Math.round((Math.min(cap, v ?? 255) / 255) * 15) / 15;
        const lq: [number, number, number] = [q(lc[0]), q(lc[1]), q(lc[2])];
        const headDye = p.inv.dye[0];
        const dyeVid = headDye ? viIdFromKey(ITEM_DEFS[headDye.id]?.key ?? '') ?? -1 : -1;
        const emu = dyeVid > 0 ? dyeApplyOf(dyeVid) : null;
        const litDye = emu !== null && isV0MidTech(emu.tech);   // 合成后站点,v0 化合法
        const key = `e:${dyeVid}:${frameY}:${lq.map((v) => Math.round(v * 255)).join('.')}`;
        let src = this.eyebrellaDyeCache.get(key);
        if (!src) {
          const cv = document.createElement('canvas');
          cv.width = cloud.width; cv.height = fh;
          const c2 = cv.getContext('2d', { willReadFrequently: true });
          if (c2) {
            c2.drawImage(cloud, 0, frameY * fh, cloud.width, fh, 0, 0, cloud.width, fh);
            if (emu) {
              const id = c2.getImageData(0, 0, cv.width, cv.height);
              emu.uniforms.uDirection = p.facing;
              if (litDye) {
                this.applyDyeLitToImageData(id.data, cv.width, cv.height, emu, lq);
              } else {
                this.applyDyeToImageData(id.data, cv.width, cv.height, emu);
              }
              c2.putImageData(id, 0, 0);
            }
            if (!litDye) {
              // 无染料/非受累：v0=min(光照,170) 以乘色 fill 施加（destination-in 复原 alpha）
              c2.globalCompositeOperation = 'multiply';
              c2.fillStyle = `rgb(${Math.round(lq[0] * 255)},${Math.round(lq[1] * 255)},${Math.round(lq[2] * 255)})`;
              c2.fillRect(0, 0, cv.width, cv.height);
              c2.globalCompositeOperation = 'destination-in';
              c2.drawImage(cloud, 0, frameY * fh, cloud.width, fh, 0, 0, cloud.width, fh);
              c2.globalCompositeOperation = 'source-over';
            }
            src = cv;
          } else src = cloud;
          if (this.eyebrellaDyeCache.size > 96) this.eyebrellaDyeCache.clear();   // 容量闸（染料×帧×光照16级）
          this.eyebrellaDyeCache.set(key, src);
        }
        const vx = p.cx, vy = p.y + p.h / 2 - p.h * 0.5 - 70;   // MountedCenter − h/2 + (0,−70)
        const num2 = (p.miscCounter % 50) / 50;
        // 合成后逃逸：光照已烘焙进 src（一次性），直绘会再吃全屏乘光=light² 复发
        this.eyebrellaQueue.push({
          wx: vx, wy: vy, num2,
          src: src as HTMLImageElement | HTMLCanvasElement | ImageBitmap,
          cw: cloud.width, ch: fh,
        });
      }
    }
    // ---- 坐骑身前层（Mount.Draw frontTexture：玩家本体之后绘制）----
    if (mnt) this.drawMountLayer(ctx, p, mnt, 'front', world.groundLevel);
    // ---- 矿车车身（Mount.Draw frontTexture :5500/5826-5835 1:1）----
    // 锚点 = 玩家位 + (w/2 + XOffset*dir, h/2 + YOffset(13) + PlayerOffset(8))，
    // 源矩形 = (0, 帧高*frame, 50, 帧高)、origin = (25, 帧高/2)；轮组 3 帧×12t。
    // 旋转与玩家同轴（上方 fullRotation 变换），故此处再绕同一原点转一次
    if (cart && this.atlas) {
      const img = this.atlas.ensureVImage(cart.texture);
      if (img) {
        const frames = 3;
        const fh = Math.floor(img.height / frames);
        const fr = Math.min(frames - 1, Math.max(0, cart.animFrame));
        const anchorX = p.x + p.w / 2 + p.facing;         // width/2 + XOffset(1)*dir
        // height 用坐骑 hitbox（42 + heightBoost 10 = 52）：height/2 + YOffset(13) + PlayerOffset(8)
        const anchorY = p.y + cart.h / 2 + 13 + 8;
        ctx.save();
        if (cart.rotation !== 0) {
          ctx.translate(p.cx, p.y + p.h);
          ctx.rotate(cart.rotation);
          ctx.translate(-p.cx, -(p.y + p.h));
        }
        ctx.drawImage(img, 0, fr * fh, img.width, fh,
          anchorX - img.width / 2, anchorY + gfxOff - fh / 2, img.width, fh);
        // 发光层（Mount.Draw case 2 :5523/:5849-5851 texture2D2 同帧同位二次 Draw，
        // 走玩家 DrawData 加色管线——canvas 等价 'lighter'。机械矿车 11 专属，
        // Mount.cs:1505-1506 frontTextureGlow=MinecartMechMount[1]）
        if (cart.textureGlow) {
          const glow = this.atlas.ensureVImage(cart.textureGlow);
          if (glow) {
            const gfh = Math.floor(glow.height / frames);
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(glow, 0, fr * gfh, glow.width, gfh,
              anchorX - glow.width / 2, anchorY + gfxOff - gfh / 2, glow.width, gfh);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        ctx.restore();
      }
    }
    // 使用类物品层已并入段 A（身体后图层）——原版 weaponDrawOrder 恒 BehindFrontArm
    // （PlayerDrawSet.cs:354），工具/武器/消耗品挥舞同一层序，勿在此双画
    // （旧"非工具画身体前"分支已退役，2026-08-22 手持层级统一）
    if (p.sitting) ctx.restore();   // 坐椅偏移收口

    void world;
  }

  /** 猪鲨崽背层液色渐染的整层乘色画布（Mount.Draw case 12 :5780-5787；懒建复用） */
  private mountTintCanvas: HTMLCanvasElement | null = null;
  private mountTintCtx: CanvasRenderingContext2D | null = null;
  private mountTintScratch(): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null {
    if (!this.mountTintCtx) {
      if (typeof document === 'undefined') return null;
      this.mountTintCanvas = document.createElement('canvas');
      this.mountTintCtx = this.mountTintCanvas.getContext('2d');
      if (!this.mountTintCtx) return null;
    }
    return this.mountTintCanvas ? { c: this.mountTintCanvas, x: this.mountTintCtx! } : null;
  }

  /** 坐骑贴图叠画（Mount.Draw :5500-6075 主体 1:1）。
   *  锚点 = 玩家底心 + (XOffset×dir, -(42+heightBoost)/2 + YOffset + PlayerOffset)
   *  （原版 Position + (width/2 + XOffset, height/2 + YOffset + PlayerOffset)，height 为
   *  mounted 盒 42+heightBoost、bottom 锚定——本仓玩家盒恒 42，按底心换算）；
   *  源矩形 = (0, 帧高×frame, 全宽, 帧高)，origin = (宽/2, 帧高/2)，朝向翻转随 facing。
   *  能力族特例：
   *   - 钻头 8（:5793-5796/:5831-5837/:6027-6063）：背层外环随 outerRingRotation 旋转；
   *     前层（座舱）面右水平翻转；眼前层（二极管）随 diodeRotation 旋转并射出两束
   *     挖掘激光（CornflowerBlue/LightGreen，宽 2px）至光束锁定格。
   *   - Scutlix 9（:5571-5576/:5729-5735）：前层/眼前层取 frameExtra（瞄准帧 6-10）；
   *     眼辉层按充能比渐显（charge==0 不画）。
   *   - 史后坐骑 50（:5838-5857/:5924-5948）：Extra_207（后翼）→ 主贴图 → Extra_205
   *     （前身）→ Extra_206（眼翼）四层；主贴图原版经 RenderTarget 叠 QueenSlime 着色器
   *     （PlayerQueenSlimeMountTextureContent——纯装饰，静态近似，登记）。
   *  贴图不可得坐骑（MOUNT_TEXTURE_OK=false：马匹/滚轴鞋/Chillet 等 Extra 表缺）→
   *  色块近似（胶囊体）并保留能力生效——登记于 vanilla-mounts.json textureOk */
  private drawMountLayer(ctx: CanvasRenderingContext2D, p: Player,
    mnt: import('../entities/Mounts').MountInstance, layer: 'back' | 'front',
    worldSurface = 0) {
    // ---- 坐骑点光注入（Mount.cs 各 AddLight 段；同岩浆瀑布惯例走渲染端 lighting 引用，
    //      次帧生效）。仅背层走一遍，避免双层重复累加 ----
    if (layer === 'back' && this.lighting) {
      // Colors.CurrentLiquidColor 近似（Colors.cs:97-120）：按玩家浸入液体取色，
      // 无液 → null（CurrentLiquidColor 的 Transparent 档 = 光贡献归零，台账批）；
      // 背层液色渐变由下方 case-12 背层段以 mnt.fishronCounter 直读实现
      const lc: [number, number, number] | null = p.inLava ? [253, 32, 3]
        : p.inHoney ? [59, 29, 131]
        : p.inWater ? [9, 61, 191] : null;
      // WindForVisuals = Main.windSpeedCurrent（Main.cs:2896）——扫帚挂件风摆项
      // （GetWitchBroomTrinketRotation :3553 num2/:3601）取真实风值，缺省 0（无风）
      const wind = renderEnv.wind ?? 0;
      for (const l of mountLights(mnt, p, {
        liquidColor: lc, worldSurface, miscCounter: p.miscCounter, wind,
        // 露天档（WorldGen.InAPlaceWithWind 中心格,GetWitchBroomTrinketRotation
        // :3597-3602 num3=1f；非露天 0.5f）——台账批接通（此前恒 ×0.5）
        windExposed: (p as unknown as { mountWindExposed?: boolean }).mountWindExposed === true,
      })) {
        this.lighting.addLight(l.tx, l.ty, l.r, l.g, l.b);
      }
    }
    const tex = mnt.textures;
    const main = layer === 'back' ? tex.back : tex.front;
    const extra = layer === 'back' ? tex.backExtra : tex.frontExtra;
    if (this.atlas && main) {
      const img = this.atlas.ensureVImage(main);
      if (img) {
        const d = mnt.data!;
        const frames = Math.max(1, d.totalFrames ?? 1);
        const fh = Math.floor(img.height / frames);
        // 帧索引（Mount.Draw :5565-5630）：Scutlix 前层取 frameExtra（瞄准帧），
        // 其余取主帧
        let fr = Math.min(frames - 1, Math.max(0, mnt.frame));
        if (mnt.type === 9 && layer === 'front') fr = Math.min(frames - 1, Math.max(0, mnt.frameExtra));
        // 62-65 抚摸帧（Mount.Draw :5765-5772 case 62/63/64/65）：petting.mount 且
        // 主帧 <4 → 钉帧 12（被摸低头的专属帧；跑/跳帧 ≥4 不覆盖）
        if (mnt.type >= 62 && mnt.type <= 65 && p.petting.isPetting && p.petting.mount && fr < 4) {
          fr = 12;
        }
        const xOff = (d.xOffset ?? 0) * (p.facing < 0 ? -1 : 1);
        const anchorX = p.x + p.w / 2 + xOff;
        const anchorY = p.y + p.h - (42 + (d.heightBoost ?? 0)) / 2 + (d.yOffset ?? 0) + mnt.playerOffset;
        ctx.save();
        // ---- 机身倾斜（Mount.cs Hover 尾段 :3468-3521 写 player.fullRotation）：
        //      原版 mount 贴图与玩家本体同在 PlayerDrawSet 绘制缓存里，TransformDrawData
        //      （PlayerDrawLayers.cs:4199-4230）绕 drawinfo.Position+fullRotationOrigin
        //      把【全部层】作刚体旋转——两侧 pivot 必然同源：
        //        UFO 7 / 钻头 8 = mounted 盒心（Mount.cs:6268-6271 (width/2, height/2)）
        //        巫婆扫帚 23 = mounted 盒底心（Mount.cs:3520 (width/2, height)）
        //      ★必须在锚点平移【之前】以绝对坐标施加——曾写在 translate(anchor) 之后,
        //      枢轴被锚点平移二次偏移（T(A)·T(P)·R·T(−P)），位移 ≈2|P|sin(θ/2) 随世界
        //      坐标线性放大（|P|≈3.4 万 px、θ=0.37 → 甩出 ≈1 万 px）= 钻头一动
        //      舱体贴图整层消失（用户实报①）。旋转零角时 playerMountRotation 返
        //      null，跳过等价 ----
        const mrot = (mnt.type === 7 || mnt.type === 8 || mnt.type === 23)
          ? playerMountRotation(mnt.type, mnt.fullRotation,
            { x: p.x, y: p.y, w: p.w, h: p.h }, mnt.heightBoost)
          : null;
        if (mrot) applyPlayerMountRotation(ctx, mrot);
        ctx.translate(anchorX, anchorY);
        // 朝向翻转（Mount.Draw :5831-5837）：type 8 仅前层（座舱）面右翻——环/二极管
        // 不翻（二极管靠 diodeRotation 覆盖全向）；其余坐骑面左翻
        const flip = mnt.type === 8
          ? (layer === 'front' ? p.facing > 0 : false)
          : p.facing < 0;
        if (flip) ctx.scale(-1, 1);
        // 层旋转（Mount.Draw :5793-5796）：钻头背层 = 外环角 / 钻头眼前层 = 二极管角
        if (mnt.type === 8) {
          ctx.rotate(layer === 'back' ? mnt.outerRingRotation : 0);
        }
        // ---- 史后坐骑（50）四层（:5838-5857/:5924-5948，均在背层） ----
        if (mnt.type === 50 && layer === 'back' && this.atlas) {
          const layerImg = (name: string) => this.atlas!.ensureVImage(`vanilla/${name}`);
          const drawLayer = (name: string, row: number, dy: number) => {
            const li = layerImg(name);
            if (!li) return;
            // 各 Extra 层行高与主贴图一致（70×576/8 与 70×288/4 均 72px），行数各异
            const rows = Math.max(1, Math.floor(li.height / fh));
            const r = Math.min(rows - 1, Math.max(0, row));
            ctx.drawImage(li, 0, r * fh, li.width, fh, -li.width / 2, dy - fh / 2, li.width, fh);
          };
          const dy = 8 - mnt.playerOffset + 20;          // 原版 (0, 8-PlayerOffset+20) 偏移
          drawLayer('Extra_207.png', mnt.frameExtra, dy); // 后翼（frameExtra 行）
          ctx.drawImage(img, 0, fr * fh, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
          drawLayer('Extra_205.png', mnt.frame, 0);       // 前身（主帧行）
          drawLayer('Extra_206.png', mnt.frameExtra, dy); // 眼翼（frameExtra 行）
          ctx.restore();
          return;
        }
        // ---- 猪鲨崽背层液色渐染（Mount.Draw case 12 :5780-5787）：
        //      `color = CurrentLiquidColor; color.A = 127; color *= num8`，
        //      num8 = clamp(计数器/60, 0, 1)（出水后 60t 渐隐）——RGB 与 alpha
        //      同乘 num8（整色缩放）。Canvas 等价 = 贴图行 × 液色×num8 multiply 后
        //      destination-in 裁回 alpha 蒙版（ChunkCache 油漆同款两步法） ----
        if (mnt.type === 12 && layer === 'back') {
          const scratch = this.mountTintScratch();
          const wash = fishronWashFactor(mnt.fishronCounter);
          if (wash > 0 && scratch) {
            const { c, x: tc } = scratch;
            const lc = p.inLava ? [253, 32, 3] : p.inHoney ? [59, 29, 131] : [9, 61, 191];
            if (c.width !== img.width || c.height !== fh) {
              c.width = img.width;
              c.height = fh;
            }
            tc.globalCompositeOperation = 'source-over';
            tc.clearRect(0, 0, img.width, fh);
            tc.drawImage(img, 0, fr * fh, img.width, fh, 0, 0, img.width, fh);
            tc.globalCompositeOperation = 'multiply';
            tc.fillStyle = `rgb(${Math.round(lc[0] * wash)},${Math.round(lc[1] * wash)},${Math.round(lc[2] * wash)})`;
            tc.fillRect(0, 0, img.width, fh);
            tc.globalCompositeOperation = 'destination-in';
            tc.drawImage(img, 0, fr * fh, img.width, fh, 0, 0, img.width, fh);
            const keep = ctx.globalAlpha;
            ctx.globalAlpha = keep * (127 / 255) * wash;
            ctx.drawImage(c, 0, 0, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
            ctx.globalAlpha = keep;
            ctx.restore();
            return;
          }
        }
        ctx.drawImage(img, 0, fr * fh, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
        // ---- 发光层（Mount.Draw :5520-5535 texture2D2 同帧同位二次 DrawData）----
        // 原版发光色 color = drawColor×0.25 + 0.75（:5818）再 ×(drawColor.A/255)
        // （:5850）——drawColor≈环境光照调制色（0-1），即发光贴图在黑暗中仍保有
        // 0.75 亮度、全亮时 1.0（DCU 钻头白热自发光的来源；UFO/机械矿车同管线）。
        // 本仓以光照引擎中心格亮度近似 drawColor 标量（lightAt 0-255→0-1）；
        // 原版 RGB 逐通道调制（色偏随光色）此处以贴图原色 + 标量 alpha 近似（登记）
        {
          const glowTex = layer === 'back' ? d.backTextureGlow : d.frontTextureGlow;
          const gi = glowTex && this.atlas ? this.atlas.ensureVImage(`vanilla/${glowTex}`) : null;
          if (gi) {
            const lt = this.lighting?.lightAt(Math.floor((p.x + p.w / 2) / 16), Math.floor((p.y + p.h / 2) / 16));
            const lum = lt ? Math.max(lt[0], lt[1], lt[2]) / 255 : 1;
            const gAlpha = 0.25 * lum + 0.75;
            const gfh = Math.floor(gi.height / frames);
            const ga = ctx.globalAlpha;
            ctx.globalAlpha = ga * gAlpha;
            ctx.drawImage(gi, 0, Math.min(fr * fh, Math.max(0, gi.height - gfh)), gi.width, gfh,
              -gi.width / 2, -gfh / 2, gi.width, gfh);
            ctx.globalAlpha = ga;
          }
        }
        // 副层（蜜蜂翅膀 Mount_BeeWings / Scutlix 眼族 / 钻头二极管）：
        //  - Scutlix 眼辉：充能比渐显，charge==0 整层跳过（:5729-5735）
        //  - 钻头二极管：diodeRotation 旋转（:5796）+ 两束激光（:6027-6063，激光
        //    ignorePlayerRotation=true 不随机身倾斜 :6061——内层先抵消 fullRotation）
        if (extra) {
          const ex = this.atlas.ensureVImage(extra);
          if (ex) {
            const efh = Math.floor(ex.height / frames);
            const efr = layer === 'front' ? fr : Math.min(frames - 1, Math.max(0, mnt.frameExtra));
            if (mnt.type === 9 && layer === 'front') {
              const chargeMax = d.abilityChargeMax ?? 0;
              if (mnt.abilityCharge <= 0) { /* 眼辉未充能：不画 */ }
              else {
                ctx.save();
                ctx.globalAlpha *= Math.min(1, mnt.abilityCharge / Math.max(1, chargeMax));
                ctx.drawImage(ex, 0, Math.min(frames - 1, Math.max(0, mnt.frameExtra)) * efh,
                  ex.width, efh, -ex.width / 2 - 1, -efh / 2 - 1, ex.width, efh);
                ctx.restore();
              }
            } else if (mnt.type === 8 && layer === 'front') {
              // 二极管层（frontExtra）：不随 facing 翻（上面 flip 只对 front 主层）——
              // 此处在已翻转的坐标系里先翻回来再旋转。净角 = diodeRotation：
              // 原版层自转 num9 = diodeRotation − fullRotation（Mount.cs:5869-5871
              // case 3），TransformDrawData 再给每层加回 fullRotation（:4210 附近）→
              // 净 = diodeRotation。本仓 M（机身倾斜）已施加在锚点平移前（供给每层
              // +fullRotation 分量），此处自转取 diodeRotation − fullRotation 对冲
              ctx.save();
              if (flip) ctx.scale(-1, 1);
              ctx.rotate(mnt.diodeRotation - mnt.fullRotation);
              ctx.drawImage(ex, 0, 0, ex.width, ex.height, -ex.width / 2, -ex.height / 2, ex.width, ex.height);
              // 二极管发光层（Mount.cs:1335 frontTextureExtraGlow=DrillMount[5]→
              // Mount_Glow_DrillDiode；Draw :5848-5852 同位二次 Draw，色同上主层公式）
              {
                const dg = d.frontTextureExtraGlow && this.atlas
                  ? this.atlas.ensureVImage(`vanilla/${d.frontTextureExtraGlow}`) : null;
                if (dg) {
                  const lt = this.lighting?.lightAt(Math.floor((p.x + p.w / 2) / 16), Math.floor((p.y + p.h / 2) / 16));
                  const lum = lt ? Math.max(lt[0], lt[1], lt[2]) / 255 : 1;
                  const ga = ctx.globalAlpha;
                  ctx.globalAlpha = ga * (0.25 * lum + 0.75);
                  ctx.drawImage(dg, 0, 0, dg.width, dg.height, -dg.width / 2, -dg.height / 2, dg.width, dg.height);
                  ctx.globalAlpha = ga;
                }
              }
              ctx.restore();
            } else {
              ctx.drawImage(ex, 0, efr * efh, ex.width, efh, -ex.width / 2 - 1, -efh / 2 - 1, ex.width, efh);
            }
          }
        }
        ctx.restore();
        // 两束激光（Mount.Draw case 8 drawType 3 :6027-6063）：每条【激活束】
        // 自两个二极管点（drillDiodePoint1(36,-6)/2(36,8) :303-307，RotatedBy
        // diodeRotation 后平移自坐骑锚点 Position）各引一条线至锁定格中心——
        // ignorePlayerRotation=true（:6061）不随机身倾斜，且原版该 DrawData 的
        // 位置/旋转全在世界系，故在坐骑变换 restore 之后直绘（曾画在旋转/翻转
        // 变换内：二极管点被二次旋转 + 终点未逆变换 → 发点/指向/长度全错）。
        // 色 CornflowerBlue(100,149,237)/LightGreen(50,205,50)，A=128 再整色 ×0.5
        // （:6045-6047）→ RGB/A 均减半，AlphaBlend 叠加 = src·(64/255)+dst·(191/255)，
        // canvas 等价 fillStyle 取减半色 + globalAlpha=64/255（不乘光照——原版
        // color2 独立于 drawColor，黑暗中同亮）
        if (mnt.type === 8 && layer === 'front' && this.atlas) {
          const dRot = mnt.diodeRotation;
          const cosR = Math.cos(dRot), sinR = Math.sin(dRot);
          const diodes: Array<{ o: { x: number; y: number }; col: string }> = [
            { o: { x: anchorX + 36 * cosR + 6 * sinR, y: anchorY + 36 * sinR - 6 * cosR }, col: 'rgb(50,74,118)' },
            { o: { x: anchorX + 36 * cosR - 8 * sinR, y: anchorY + 36 * sinR + 8 * cosR }, col: 'rgb(25,102,25)' },
          ];
          const ga = ctx.globalAlpha;
          ctx.globalAlpha = 64 / 255;
          for (const b of mnt.beams) {
            if (b.tx < 0) continue;
            const txp = b.tx * 16 + 8, typ = b.ty * 16 + 8;
            for (const dd of diodes) {
              const dx = txp - dd.o.x, dyL = typ - dd.o.y;
              const len = Math.hypot(dx, dyL);
              if (len <= 1) continue;
              ctx.save();
              ctx.translate(dd.o.x, dd.o.y);
              ctx.rotate(Math.atan2(dyL, dx));
              ctx.fillStyle = dd.col;
              ctx.fillRect(0, -1, len, 2);   // MagicPixel scale(2,len)（:6057）
              ctx.restore();
            }
          }
          ctx.globalAlpha = ga;
        }
        // 钻头激活时的光标十字 = 原版投射物 453（DrillMountCrosshair：1×1、tileCollide
        // false、ai = 鼠标偏移，纯光标视觉无物理）。本仓无通用投射物实体管线，直绘
        // Projectile_453 贴图于 mount.crosshairX/Y（= 鼠标世界坐标，Mount.aimDrill 维护）
        // 视觉/行为等价——投射物实体化与 UpdateEffects case 8 的"453 存活门"（:5006-
        // 5011）均由 abilityActive 单一真源表达（松键即关），登记未实体化
        if (mnt.type === 8 && layer === 'front' && mnt.abilityActive && this.atlas) {
          const cross = this.atlas.ensureVImage('vanilla/Projectile_453.png');
          if (cross) {
            ctx.drawImage(cross, mnt.crosshairX - cross.width / 2, mnt.crosshairY - cross.height / 2);
          }
        }
        return;
      }
    }
    // 色块近似：贴图缺表的坐骑（约 32/64）——胶囊体 + 朝向头部
    if (layer === 'back') return;    // 近似体单层即可，避免双层叠深
    const d = mnt.data!;
    const bodyH = 42 + (d.heightBoost ?? 0) - 20;
    const bodyW = Math.max(24, Math.min(56, bodyH * 1.3));
    const cx = p.x + p.w / 2, cy = p.y + p.h - bodyH / 2 + mnt.playerOffset;
    ctx.save();
    ctx.fillStyle = mountFallbackColor(mnt.type);
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + p.facing * bodyW * 0.45, cy - bodyH * 0.25, bodyW * 0.16, bodyH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** use 期间 bodyFrame 行（Player.cs:35874-35990，itemAnimation>0 分支逐 useStyle）。
   *  -1 = 不改 bodyFrame（useStyle 10/14/15 被 flag6 排除在 :35716、16 无匹配分支），
   *  交给常规动画行（行走/跳跃）。aim 仅 useStyle 5 用（:35986 itemRotation*direction 档） */
  private useStyleBodyRow(swing: { t: number; dur: number; item?: number; useStyle?: number; aim?: number }, p: Player): number {
    const us = swing.useStyle ?? 1;
    const pAnim = Math.min(1, Math.max(0, swing.t / swing.dur));
    switch (us) {
      case 1:
      case 13:
        // :35882-35890 / :35971-35985：三段 行1/2/3（13 与 1 同表）
        // ★[N5] 分档统一到 meleeThirdOf（C# double 阈值 anim<0.333max / ≥0.666max，
        // :36596/:36600——三等分点 ±1 帧抖动闭式修正，与 Game.updateSwingHits 共表）
        return meleeThirdOf(swing.t, swing.dur) === 'tail' ? 3
          : meleeThirdOf(swing.t, swing.dur) === 'mid' ? 2 : 1;
      case 2:
      case 3:
        return 3; // :35908 / :35948（3 两段都是行3）
      case 4:
        return 2; // :35959 举过头
      case 9:
        return 0; // :35927 饮用
      case 6: {
        // :35931-35947：(1-pAnim)*6 截 1，≥0.5 → 行3 否则行2
        const n = Math.min((1 - pAnim) * 6, 1);
        return n >= 0.5 ? 3 : 2;
      }
      case 5: {
        // :35989-35992：吹箭筒 281/吹箭枪 986 使用中恒行2（itemRotation 档不适用——
        // 吹管持械为平举吹奏姿，此前恒走 itemRotation 档 = 行2/3/4 随瞄准角跳变）
        const bpVid = swing.item != null
          ? viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '') : -1;
        if (bpVid === 281 || bpVid === 986) return 2;
        // :35986-36011：默认行3；itemRotation*dir < -0.75 → 行2、> 0.6 → 行4。
        // itemRotation = Atan2(aimY*dir, aimX*dir)（:46730）——朝左时与裸 aim 相差 ±π，
        // 此前直接 aim*facing 同源错位。gravDir=-1 行2↔4 互换（:35996-36011）
        const irot = Math.atan2(Math.sin(swing.aim ?? 0) * p.facing, Math.cos(swing.aim ?? 0) * p.facing);
        const n21 = irot * p.facing;
        if (p.gravDir === -1) {
          if (n21 < -0.75) return 4;
          if (n21 > 0.6) return 2;
          return 3;
        }
        if (n21 < -0.75) return 2;
        if (n21 > 0.6) return 4;
        return 3;
      }
      case 8:
        return 0;   // :35963-35965 割草机（DefaultToLawnMower）
      case 11:
        // :35912-35925 高尔夫球杆三段：>0.5→行4、>0.15→行3、else 行2
        return pAnim > 0.5 ? 4 : pAnim > 0.15 ? 3 : 2;
      case 12:
        return 3;   // :35967-35969 吉他
      case 14:
      case 15:
      case 10:
      case 16:
        return -1;
      default:
        // ★[N5] 同上：meleeThirdOf 共表
        return meleeThirdOf(swing.t, swing.dur) === 'tail' ? 3
          : meleeThirdOf(swing.t, swing.dur) === 'mid' ? 2 : 1;
    }
  }

  /** 使用/挥舞动画（与静持同尺寸：原始像素比例，不放大）。
   *  useStyle 1:1 分族（Player.cs:49916 ItemCheck_ApplyUseStyle switch）：
   *   1 挥砍三段（已验证）/ 2 咀嚼 / 3 雨伞 / 4 举过头 / 5 朝鼠标静持（法杖钉中心）
   *   6 饮用旋转 / 9 举杯（DefaultToHealingPotion）/ 13 短剑突刺（复合手臂）/
   *   14-15 头侧持 / 16 委托静持（holdStyle）。
   *  坐标约定：全部按 direction=+1 推导（offX 正=身前），朝左靠镜像空间翻转；
   *  offY 从 p.y（碰撞盒顶）起算；旋转 origin = 底角（PlayerDrawLayers.cs:3260）。
   *  图层：工具/武器挥砍在身体之前调用（身后），使用类托举在身体之后调用（身前） */
  /** 变身坐骑手持物锚点（PlayerDrawSet.cs:385-410 AdjustmentsFor{Wolf,Velociraptor,
   *  Rat,Bat,Pixie}Mount + Player.cs:50638-50794 ApplyItemPositionOffsetFromMount）：
   *  52 狼：ItemLocation 表（useStyle 2/9/14/8/5、holdStyle 5/1/2；else 与 useStyle 8
   *  重置到 vector2 = Position+(10+dir·14,12)——玩家宽 20 折局部锚 (14+dir·δ, 12+δ)；
   *  狼表无悠悠球/风筝/3542 特判——原版即无，三件是 54 迅猛龙专属档）；
   *  54 迅猛龙：ApplyItemPositionOffsetFromMount 偏移表（animating=挥舞中 itemAnimation
   *  >0；静持 animating=false；:50671-50793 全分支 1:1——风筝 flag12 :50713、悠悠球
   *  flag9 按身体行 num :50730-50743、3542 星云烈焰 flag11 :50744-50760、useStyle 5
   *  flag3 :50761-50764、default 族按 num :50765-50777；num = bodyFrame.Y/56 由调用
   *  方传 useStyleBodyRow/静持行）；55/56/61 原版不改 ItemLocation（hideEntirePlayer
   *  但手持照画在原锚——返回 null 原样）。Position.X 的 −dir·10/−14 只平移玩家本体
   *  绘制（ItemLocation 为世界绝对坐标不受其影响——手持端无需补）。使用中火把 186
   *  在 54 上走 (-4,0)·(pos−Center) 角旋转（:50722-50728，异形旋转项登记不近似）。 */
  /** 悠悠球族（ItemID.cs:1166 Yoyo = Factory.CreateBoolSet，21 件） */
  private static YOYO_ITEMS = new Set([3262, 3278, 3279, 3280, 3281, 3282, 3283, 3284,
    3285, 3286, 3287, 3288, 3289, 3290, 3291, 3292, 3315, 3316, 3317, 3389, 5294]);
  /** 风筝族（ItemID.cs:153 IsAKite = Factory.CreateBoolSet(false, …)，25 件） */
  private static KITE_ITEMS = new Set([4367, 4368, 4369, 4370, 4371, 4379, 4610, 4611,
    4612, 4613, 4648, 4649, 4650, 4651, 4669, 4670, 4671, 4674, 4675, 4676, 4677,
    4681, 4683, 4684]);
  private mountHeldAnchor(
    mtype: number, useStyle: number | null, holdStyle: number, animating: boolean,
    isFishingPole = false,
    held?: { vid?: number; bodyRow?: number },
  ): { dx: number; dy: number; resetX?: number; resetY?: number } | null {
    const d = 1;   // dir=1 空间（offX 语义同域：直接 += / 赋值）
    if (mtype === 52) {
      // AdjustmentsForWolfMount（:1785-1842）；钓竿 flag4（fishingPole!=0）豁免原锚
      if (isFishingPole) return null;
      if (useStyle === 2) return { dx: d * 14, dy: -4 };
      if (useStyle === 9) return animating ? { dx: d * 18, dy: -4 } : { dx: d * 14, dy: -18 };
      if (useStyle === 8) return { dx: 0, dy: 0, resetX: 14 + d * 12, resetY: 12 + 2 };
      if (useStyle === 14) return { dx: d * 5, dy: -2 };
      if (useStyle === 5) return { dx: d * 4, dy: -4 };   // flag = us5||SelectedDrawnProjectile（悠悠球线挂中同档）
      if (holdStyle === 5) return { dx: d * 17, dy: -8 };
      if (holdStyle === 1 && !animating) return { dx: d * 14, dy: -6 };
      if (holdStyle === 2 && !animating) return { dx: d * 17, dy: 4 };
      return { dx: 0, dy: 0, resetX: 14, resetY: 12 };   // else：ItemLocation = vector2
    }
    if (mtype === 54) {
      // ApplyItemPositionOffsetFromMount（:50671-50793）：仅 animating || holdStyle>0
      if (!animating && holdStyle <= 0) return null;
      const vid = held?.vid ?? -1;
      const num = held?.bodyRow ?? 0;              // :50646 num = bodyFrame.Y / 56
      if (isFishingPole) return { dx: -2, dy: 0 };
      if (useStyle === 2) return animating ? { dx: 7, dy: -4 } : { dx: 3, dy: 2 };
      if (useStyle === 9) return animating ? { dx: 14, dy: -10 } : { dx: 3, dy: 2 };
      if (useStyle === 11) return animating ? { dx: 4, dy: 0 } : { dx: 1, dy: 0 };
      if (useStyle === 8) return { dx: 6, dy: 0 };
      if (useStyle === 14) return animating ? { dx: -6, dy: 6 } : { dx: -10, dy: 10 };
      if (vid >= 0 && Renderer.KITE_ITEMS.has(vid)) return { dx: 4, dy: -4 };   // :50713-50715 风筝（不分动画态）
      if (holdStyle === 5) return { dx: 6, dy: 0 };
      if (holdStyle === 1 && !animating) return { dx: 1, dy: 4 };
      if (holdStyle === 2) return { dx: 6, dy: 0 };
      if (vid >= 0 && Renderer.YOYO_ITEMS.has(vid)) {                           // :50730-50743 悠悠球按身体行
        if (num === 2) return { dx: 10, dy: -10 };
        if (num === 3) return { dx: 8, dy: 0 };
        if (num === 4) return { dx: 2, dy: 2 };
        return { dx: 0, dy: 0 };
      }
      if (vid === 3542) {                                                       // :50744-50760 星云烈焰按身体行
        if (num === 2) return { dx: -10, dy: 0 };
        if (num === 3 || num === 4) return { dx: 10, dy: 0 };
        return { dx: 0, dy: 0 };
      }
      if (useStyle === 5) return { dx: 4, dy: 0 };                              // :50761-50764
      if (num === 1) return { dx: 1, dy: -1 };          // :50765-50777 default 族按身体行
      if (num === 2) return { dx: 4, dy: 2 };
      if (num === 3) return { dx: 2, dy: 0 };
      return null;                                      // 行 0/4+ = Vector2.Zero 等价
    }
    return null;
  }

  /** IsFood 手持帧 = 竖 3 帧条第 2 行（GetItemDrawFrame :41901-41903
   *  Frame(1,3,0,1)——手持取中行、掉落物动画恒顶行，两套取帧互斥）；
   *  原条缺失/高度非 3 整除时回退 atlasIcon 已切片（帧 0，尺寸正确仅行号近似） */
  private static foodHeldFrame(
    raw: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number } | null | undefined,
    fallback: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
  ) {
    if (!raw || raw.sh < 3 || raw.sh % 3 !== 0) return fallback;
    const fh = raw.sh / 3;
    return { img: raw.img, sx: raw.sx, sy: raw.sy + fh, sw: raw.sw, sh: fh };
  }

  private drawUseItem(ctx: CanvasRenderingContext2D, p: Player, swing: { t: number; dur: number; item: number; useStyle?: number; aim?: number; noGraphic?: boolean }, flicker: FlickerClock | null = null) {
    const arRaw = this.atlasIcon(swing.item);
    const icon = arRaw ? null : this.itemIcon(swing.item);
    const pAnim = Math.min(1, Math.max(0, swing.t / swing.dur));
    // ★手持帧规格（Player.cs:41896-41916 GetItemDrawFrame ≡ Item.cs:49192-49216
    // GetDrawHitbox——AnimatePlayerAndGetItemFrame :42701 的 drawHitbox 同源）：
    // IsFood 族手持取竖 3 帧条第 2 行 Frame(1,3,0,1)（掉落物动画恒帧 0 是另一套
    // 取帧——atlasIcon 已按帧 0 切片，故从 vicon 原条重切第 2 行）；968 棉花糖串
    // 非 IsFood 无动画 → 32×10 整图直画（atlasIcon 原样，勿再切片）。此前整条/
    // 帧 0 近似 → 食物手持三帧叠画/取错行
    const heldVid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
    const ar = heldVid >= 0 && arRaw && VANILLA_IS_FOOD.has(heldVid) && this.atlas
      ? Renderer.foodHeldFrame(this.atlas.vicon(heldVid), arRaw)
      : arRaw;
    const fw = ar ? ar.sw : 14, fh = ar ? ar.sh : 14;
    const us = swing.useStyle ?? 1;
    // ★aim 方向化（Player.cs:46730/46737：itemRotation = Atan2(aimY*dir, aimX*dir)——
    //  原版朝左时以翻转 sprite + 该角绘制；本项目是镜像空间，等价本地绘制角 = π-aim
    //  （镜像共轭 mirror∘rot(θ)=rot(−θ)∘mirror，模 2π 后世界指向与 aim 一致）。
    //  useStyle 5（法杖/枪弓）与 13（短剑）消费；aim 未传取 0（正前方）
    const aim = p.facing === -1 ? Math.PI - (swing.aim ?? 0) : (swing.aim ?? 0);
    // → { rot, offX, offY, drawOX, drawOY }（dir=1 空间）；hide = 原版把 itemLocation
    // 挪到 -1000（不画）。drawO* = itemLocation（握点）在精灵矩形内的锚定偏移，
    // 默认底左角 (0,-fh)（PlayerDrawLayers.cs:3260 origin=(W/2-W/2*dir, H)）
    let rot = 0, offX = 0, offY = 0, hide = false, drawOX = 0, drawOY = -fh;
    // useStyle 1 三段持位 tier（Player.cs:49957-50095）——case 1 与 default 共用
    const swingTier = (ph: 0 | 1 | 2): { x: number; y: number } => {
      const xT = (w: number) => ph === 0
        ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 14 : 10
        : ph === 1
          ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 18 : 10
          : w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w >= 48 ? 18 : w > 32 ? 14 : 6;
      const yT = (h: number) => ph === 0 ? 24
        : h > 64 ? 14 : h > 52 ? 12 : ph === 1 && h > 32 ? 8 : 10;
      // phase2（起手）持位在身后（:50071 `center - (w/2-num6)*dir`）
      let px = ph === 2 ? -(fw * 0.5 - xT(fw)) : fw * 0.5 - xT(fw);
      const py = yT(fh);
      // 特例持位（Player.cs:49930-50104，与 Game.updateSwingHits 命中盒侧同源双表）：
      // · 1827 利刃手套爪族（Item.claw={1827}，Main.cs:6742-6744）三段独立持位
      //   X=10/8/6、Y=26/24/20（:49930-49956）
      // · 2320 岩鱼/2330 紫挥棒鱼/2341 掠夺鲨：X +8(早)/+4(中)/+4(末)、Y(中/末)+4
      //   （:49971-50095 逐段 num4/5/6 += 4·8——早/中段公式 +(w/2−num) 故 X 取负）
      // · 671 钥匙牌：X +12/+6/+8、Y(中)+10、Y(末)+8（同段）
      // · 426 破城刃 UsesBetterMeleeItemLocation（ItemID.cs:76 唯一件）zero 偏移
      //   (-4,1)/(-6,-4)/(4,-2)（:50097-50104 itemLocation += zero*Directions）
      const hv = heldVid;
      if (hv === 1827) {
        const cx2 = ph === 0 ? 10 : ph === 1 ? 8 : 6;
        px = ph === 2 ? -(fw * 0.5 - cx2) : fw * 0.5 - cx2;
        return { x: px, y: ph === 0 ? 26 : ph === 1 ? 24 : 20 };
      }
      const dxs = hv === 2320 || hv === 2330 || hv === 2341 ? (ph === 0 ? -8 : ph === 1 ? -4 : 4)
        : hv === 671 ? (ph === 0 ? -12 : ph === 1 ? -6 : 8)
          : hv === 426 ? [-4, -6, 4][ph] : 0;
      const dys = hv === 2320 || hv === 2330 || hv === 2341 ? (ph === 0 ? 0 : 4)
        : hv === 671 ? (ph === 0 ? 0 : ph === 1 ? 10 : 8)
          : hv === 426 ? [1, -4, -2][ph] : 0;
      return { x: px + dxs, y: py + dys };
    };
    switch (us) {
      case 1: {
        // useStyle=1（:49939-50108）1:1：约 200° 线性挥砍弧 + 三段持位。
        // ★时段方向：pAnim ≡ itemAnimation/itemAnimationMax（随 t 递减，与 rot 公式同源）——
        //  末段(anim<0.333max ⟺ pAnim≤1/3)→前持位(phase0) / 中段→(phase1) /
        //  起手(anim≥0.666max ⟺ pAnim≥2/3)→后举位(phase2)。此前按"递增进度"整段接反
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        // Item.claw（1827）/2320·2330·2341/671/426 特例持位在 swingTier 内统一
        // 分流（:49930-50104，与 Game.updateSwingHits 命中盒侧同源双表）
        // ★[N5] 分档=meleeThirdOf 共表（C# double 阈值 :51294 段，三等分点修正）
        const third = meleeThirdOf(swing.t, swing.dur);
        const seg = third === 'tail' ? swingTier(0) : third === 'mid' ? swingTier(1) : swingTier(2);
        offX = seg.x; offY = seg.y;
        break;
      }
      case 2: {
        // 咀嚼（:50183-50224，DefaultToFood 非 gulp 族：蘑菇 5/蜂蜜鳍 2314）：
        // 手臂伸缩档 num15=8/6/4/2 → offX = num15+10-fw/2，Y = 中心 + fh/2-4；rot 不变
        const n14 = 1 - pAnim;
        const n15 = n14 <= 0.25 ? 8 : n14 <= 0.5 ? 6 : n14 <= 0.75 ? 4 : 2;
        offX = n15 + 10 - fw * 0.5;
        offY = p.h * 0.5 + fh * 0.5 - 4;
        break;
      }
      case 3: {
        // 雨伞（:50279-50312）：起手段（ItemCheck_GetMeleeHitbox :45553 `itemAnimation >
        // itemAnimationMax * 0.666`——double 阈值原式，勿换 pAnim 比值式）
        if (swing.t > swing.dur * 0.666) { hide = true; break; }
        rot = 0.8;
        offX = fw * 0.5 - 4 - Math.max(pAnim * fw * 1.2 - 10, 8);
        offY = 24;
        // 946/4707 特判（Player.cs:50302-50305 itemLocation.X-=6*dir +
        // PlayerDrawLayers.cs:3314-3318 绘制位 Y-=22*gravDir、绘制角=-1.57*-direction）
        const vid3 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid3 === 946 || vid3 === 4707) { offX -= 6; offY -= 22; rot = 1.57; }
        break;
      }
      case 4: {
        // 举过头（:50313-50338）：rot=0；offX = fw/2-13（3601/5114/5120 再 -10）
        // offY = fh/2+4（5114 再 -2）——使用中身体行 2（双手举过头顶）
        const vid4 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        offX = fw * 0.5 - 13 - (vid4 === 3601 || vid4 === 5114 || vid4 === 5120 ? 10 : 0);
        offY = fh * 0.5 + 4 + (vid4 === 5114 ? -2 : 0);
        break;
      }
      case 5: {
        // 朝鼠标静持（:50339-50422 + :46708 itemRotation=瞄准角）：
        // 法杖族钉 MountedCenter+瞄准向量×6；默认 X=中心-2*dir、Y=中心-fh/2
        const vid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid === 3779) { offX = 6; offY = p.h * 0.5 + 6; rot = 0; }      // :50343（itemRotation=0）
        else if (vid === 4262) { offX = -6; offY = p.h * 0.5 - 6; rot = 0; } // :50349
        else if (vid >= 0 && STAFF_ITEMS.has(vid)) {
          // :50382-50383 itemLocation = MountedCenter + itemRotation 向量×6；
          // ★3476 特档 = 14（:50376-50379 num22 逐型覆写，全 staff 集唯一一件——
          //  3476 星璇秘法书持位前伸 14px；此前漏 = 贴身 8px）
          const staffReach = vid === 3476 ? 14 : 6;
          // ★绘制角 = itemRotation + 0.785*direction（PlayerDrawLayers.cs:3370——法杖斜持
          // 45°，此前漏叠 → 34 件法杖全少转 45°）
          offX = Math.cos(aim) * staffReach;
          offY = p.h * 0.5 + Math.sin(aim) * staffReach;
          rot = aim + 0.785;
        } else {
          const dp = vid >= 0 ? ITEM_DRAW_POS[vid] ?? ITEM_DRAW_POS_DEF : ITEM_DRAW_POS_DEF;
          // 非法杖（枪/弓/悠悠球等）：
          // ★金标审计修正(2026-09-01)：offY = h/2 + dp[1]（per-item dy 进未旋转 pivot，
          //   原版 vector11.Y→position.y）；drawOY = −fh/2（原版 origin7.y = H/2，
          //   在旋转帧内恒定）。旧 offY=h/2−fh/2 + drawOY=dp[1] 把两个量放反了 →
          //   非水平瞄准时整枪按角度漂移（象限分裂根因）。
          // ★2026-09-02 四向几何推演定版（用户"垂直向上贴图偏右~7px"报障取证结论：
          //   本复合式与原版逐项恒等、上下两向逐像素对称，无不对称面可修——改钉点即破
          //   原版对齐，禁动）。原版合成（dir=1、gravDir=1 展开）：
          //   · itemLocation = (cx − 2·dir, cy − fh/2)（Player.cs:51751-51755；固定
          //     式【不随 itemRotation 旋转】，旋转跟随只在 staff 支 :51756-51760）
          //   · position = itemLocation + (0, fh/2 + dy)（PlayerDrawLayers.cs:3458-3461
          //     vector11=(0, DrawPlayerItemPos().Y)；vector11.X 恒 0；Main.cs:3697
          //     result.X=num / case 759: num=10−18=−8、Y+=2 → 与 ITEM_DRAW_POS[759]=
          //     [−8,2] 同源）⇒ pivot = (cx−2, cy+dy)
          //   · origin7 = (−num9, fh/2)（PlayerDrawLayers.cs:3462-3469 原文
          //     `new Vector2(-num9, rectangle.Height / 2)`；dir=−1 支 = (W+num9, H/2)。
          //     【origin.y = H/2 而非 H】，:3260 (W/2−W/2·dir, H) 只属通用尾支 :3529
          //     ——useStyle5 非法杖走本专用支，09-01 金标注确
          //   · rotation = itemRotation = Atan2(aimY·dir, aimX·dir) − fullRotation
          //     （Player.cs:47781）
          //   四向推演（759: dp=[−8,2] fw=52 fh=22；弹列 = 盒中心 cx，:47603
          //   pointPosition=RotatedRelativePoint(MountedCenter)，发射器无枪口特档——
          //   特档仅 281/986/3007 三支 :47719-47727）：
          //   · 右水平 rot=0：贴图 x∈[cx−10,cx+42]、轴 y=cy+2（弹列过轴上方 2px=对齐）
          //   · 左水平 facing=−1：镜像对称 x∈[cx−42,cx+10]
          //   · 垂直向上 rot=−π/2：贴图 x∈[cx−13,cx+9]（轴心 cx−2）、枪口 (cx−4.5,
          //     cy−41.5)；弹列 x=cx → 线过贴图右半 = 原版本相（用户所见"线在贴图
          //     右侧"即此，非贴图偏移）
          //   · 垂直向下 rot=+π/2：x∈[cx−13,cx+9] 与向上逐像素对称、y∈[cy−8,cy+46]
          //   实机探针复核（scripts/_vert-up-aim-probe{,2}.mjs，相机钉死+调色板匹配+
          //   弹出生点即采）：up/down 贴图跨度均 [−13.6,+8.0]（世界 px，1.25 缩放取整
          //   误差 ≤0.8），弹列恒 cx；"7px≈fh/2" 假说不成立（759 fh/2=11，且
          //   origin.y=H/2 为原文）。
          // ★用户拍板（2026-09-02，刻意非原版偏离）：垂直/斜向上时贴图视觉居中——
          //  原版钉 cx−2（蓝队 N 定谳=原版本相，探针三重实证：贴图几何中心=pivot
          //  =cx−2，弹列=cx，差 −2px 偏左+sprite 枪体像素轴心再偏左）。用户裁定
          //  贴图几何中心对齐弹列：pivot.x=cx → 补偿 +2（探针实测：+7 态偏右 5px
          //  → 归零需 +2；首版 −7 与 +7 两轮用户实测 7/14/7 排除后取探针真值）。
          //  上半平面 sin(aim)<0 线性渐入（水平 ±π 零、垂直向上满额）；消费段
          //  facing×offX 镜像自动对称——水平两向/垂直向下（下半平面）零改动。
          offX = -2 + Math.max(0, -Math.sin(aim)) * 2;
          offY = p.h * 0.5 + dp[1];
          rot = aim;
          drawOX = dp[0]; drawOY = -fh * 0.5;
        }
        break;
      }
      case 6: {
        // 饮用旋转（:50158-50182，回归药水 2350/4870）：与 7 同构反向
        const n13 = Math.min((1 - pAnim) * 6, 1);
        rot = (1 - n13) * 2 - 1.4;
        if (n13 >= 0.5) { offX = fw * 0.5 - 9 - rot * 12; offY = 38 + rot * 4; }
        else { offX = fw * 0.5 - 9 - rot * 16; offY = 38 + rot; }
        break;
      }
      case 9: {
        // 举杯（:50127-50157，DefaultToHealingPotion/DefaultToFood gulp）：
        // t=clamp((1-pAnim)/0.7)；rot = -2t+0.7；
        // 持位 = GetFrontHandPosition(Full, num11-π/2) 再缩放 Lerp(1.5,1.2,t)+前移 Lerp(8,2,t)
        const t = Math.min(Math.max((1 - pAnim) / 0.7, 0), 1);
        rot = -2 * t + 0.7;
        const num11 = -(Math.PI * 2) / 5 * 0.5 + (1 - t) * ((Math.PI * 2) / 5) + Math.PI / 10;
        // GetFrontHandPosition(Full, num11-π/2)（:49887-49913，dir=1 展开）
        const hx = 10 * Math.cos(num11) - 4 - 3 * Math.sin(num11);
        const hy = 10 * Math.sin(num11) - 2 + 3 * Math.cos(num11);
        // ★缩放因子（:50145-50152）：手位向量（相对 MountedCenter）先整体
        // ×MathHelper.Lerp(1.5,1.2,t)（举杯起始远端伸臂、随饮用进度收回），
        // 再叠加 X 向 dir×Lerp(8,2,t) 前移——此前漏乘 = 98 件药水手位贴身 3-5px
        const armStretch = 1.5 + (1.2 - 1.5) * t;   // MathHelper.Lerp(1.5, 1.2, t)
        offX = hx * armStretch + (8 + (2 - 8) * t);
        offY = p.h * 0.5 + hy * armStretch;
        // ★轴心（PlayerDrawLayers.cs:3263-3275 useStyle 9）：origin = Size*(0.5,0.4)
        // （5009/5042/5645 为 (0.26,0.5)；朝左时原版取 X=1-X——镜像空间恒用 dir=1 值）
        const vid9 = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
        if (vid9 === 5009 || vid9 === 5042 || vid9 === 5645) { drawOX = -fw * 0.26; drawOY = -fh * 0.5; }
        else { drawOX = -fw * 0.5; drawOY = -fh * 0.4; }
        break;
      }
      case 13: {
        // 短剑突刺（:50423-50446）：复合手臂持位 GetFrontHandPosition(stretch, itemRotation-π/2)，
        // stretch 按 1-pAnim 档 Quarter(6)/ThreeQuarters(8)/Full(10)；绘制旋转 = itemRotation
        // （本地空间 = 方向化 aim，见函数头）
        const n24 = 1 - pAnim;
        const mult = n24 <= 0.33 ? 6 : n24 <= 0.66 ? 8 : 10;
        rot = aim;
        offX = mult * Math.cos(rot) - 4 - 3 * Math.sin(rot);
        offY = p.h * 0.5 + mult * Math.sin(rot) - 2 + 3 * Math.cos(rot);
        break;
      }
      case 14: {
        // 头侧持（:50604-50617，夜光 4952）：X=中心+6、Y=顶+32+头饰偏移；身体行不改
        offX = 6;
        offY = 32 + HEADGEAR_OFFSET_Y[2];
        break;
      }
      case 15: {
        // 头侧持（:50618-50628，占卜球 5644）：Y=顶+28+头饰偏移
        offX = 6;
        offY = 28 + HEADGEAR_OFFSET_Y[2];
        break;
      }
      case 16: {
        // 委托静持（:50629-50633，独角兽棒 856 = holdStyle 1 特例：X=中心+4、Y=顶+34）
        offX = 4;
        offY = 34;
        break;
      }
      default: {
        // 7/8/10/11/12 等未入表族回退 useStyle 1 挥砍（三段持位与 case 1 同款同步）
        rot = (pAnim - 0.5) * -3.5 - 0.3;
        // ★[N5] 同上：meleeThirdOf 共表
        const third = meleeThirdOf(swing.t, swing.dur);
        const seg = third === 'tail' ? swingTier(0) : third === 'mid' ? swingTier(1) : swingTier(2);
        offX = seg.x; offY = seg.y;
        break;
      }
    }
    if (hide) return;
    // 变身坐骑手持锚（AdjustmentsForWolfMount :1807-1840 / ApplyItemPositionOffset
    // _FromMount :50671-——挥舞期 itemAnimation>0 恒真）
    if (p.ridingMount && MOUNT_SETS.PlayerIsHidden?.[p.mount.type]) {
      const vid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
      // num = 身体行（:50646）：挥舞期取 useStyle 行（useStyle 5 的 2/3/4 恰为
      // 悠悠球/3542 分档；-1 族（us14/15 等）该两档不消费 num，钳 0）
      const rowRaw = this.useStyleBodyRow(swing, p);
      const m = this.mountHeldAnchor(p.mount.type, us, 0, true,
        vid === 2289 || (vid >= 2291 && vid <= 2296) || vid === 2421 || vid === 2422 || vid === 4325 || vid === 4442,
        { vid, bodyRow: rowRaw < 0 ? 0 : rowRaw });
      if (m) {
        if (m.resetX !== undefined) { offX = m.resetX; offY = m.resetY!; }
        else { offX += m.dx; offY += m.dy; }
      }
    }
    ctx.save();
    ctx.translate(p.cx + p.facing * offX, p.y + offY);
    if (p.facing === -1) ctx.scale(-1, 1); // 镜像空间：旋转自动随镜像取反（与原版 -direction 因子等价）
    ctx.rotate(rot);
    // GetAdjustedItemScale（★F 锚校正：1457 Player.cs:42891，ApplyMeleeScale :42901；
    // 旧 :41919-41930 为 1456 行段；PlayerDrawLayers.cs:3170 DrawData
    // scale）：melee 武器且手套族 meleeScaleGlove 在身 → 手持贴图 ×1.1（缩放绕握点
    // ——translate 后 scale，与原版 origin 锚定等价；Game 命中盒侧同乘,消费位=
    // GetPointOnSwungItemPath(70f…) :44636-44637）
    if (p.equipStats.meleeScaleGlove
      && (heldVid >= 0 ? itemCombat(heldVid)?.melee : false)) {
      ctx.scale(1.1, 1.1);
    }
    if (ar) {
      // 默认 origin = (W*0.5 − W*0.5*dir, H)（PlayerDrawLayers.cs:3260）：
      // dir=1 → 底左角 / dir=−1 → 底右角钉在 itemLocation（握点）旋转——
      // 镜像空间里统一画在 (0,−fh) 即底左角=握点，镜像自动翻成底右角；
      // useStyle 5 非法杖（握把 (-num9,H/2)）与 9（Size*(0.5,0.4) 轴心）经 drawOX/drawOY 覆盖
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, drawOX, drawOY, ar.sw, ar.sh);
    } else if (icon) {
      ctx.drawImage(icon, drawOX, -14, 14, 14);
    }
    // 手持火苗（PlayerDrawLayers.cs:3519-3561 挥舞分支同接）：flame 物品在武器贴图
    // 之上叠 ItemFlame_{id}（与本体同变换，dest = drawOX/drawOY 本体矩形）
    if (ar && this.atlas) {
      const fvid = viIdFromKey(ITEM_DEFS[swing.item]?.key ?? '');
      if (fvid >= 0 && FLAME_ITEMS.has(fvid)) {
        drawHeldItemFlame(ctx, this.atlas, fvid, p.facing, { x: drawOX, y: drawOY, w: ar.sw, h: ar.sh }, flicker);
      }
    }
    ctx.restore();
  }

  private runFramesCache: ReturnType<SpriteAtlas['animFrames']> | null = null;
  private actionFramesCache: Record<string, ReturnType<SpriteAtlas['rect']>> | null = null;

  /** Extra_48 表情总表（272×1092）懒加载——原版 TextureAssets.Extra[48] */
  private emoteSheetImg: ImageBitmap | HTMLImageElement | null = null;
  private emoteSheetFailedAt = 0;   // ★TTL 化(2026-08-25 同类扫描):原布尔终态=一次失败
                                    // 整会话无表情气泡;10s 过期重试,暖缓存到位即自愈
  private emoteSheet(): ImageBitmap | HTMLImageElement | null {
    if (this.emoteSheetFailedAt && Date.now() - this.emoteSheetFailedAt < 10_000) return null;
    if (!this.emoteSheetImg) {
      const im = new Image();
      // bitmap 桥(2026-08-18 review 漏网站):此处曾完全裸 Image——表情气泡
      // 激活期间每帧绘制,压力窗口期解码逐出 = LazyPixelRef 流同族
      im.onload = () => upgradeToBitmap(im, (b) => { this.emoteSheetImg = b; });
      im.onerror = () => { this.emoteSheetFailedAt = Date.now(); this.emoteSheetImg = null; };
      im.src = 'sprites/vanilla/Extra_48.png';
      this.emoteSheetImg = im;
    }
    return this.emoteSheetImg;
  }

  /** 精灵底部透明留白行数（缓存）：用于脚底对齐 */

  /** 逐像素染色缓存（原版 XNA SpriteBatch 的 color 乘法等价实现）：
   *  ① multiply 把 RGB 乘上 color —— canvas multiply 会把精灵透明区也铺色（方形伪影）
   *  ② destination-in 重画精灵本体 → alpha 恢复为精灵轮廓，裁掉①的方形
   *  alpha 保持精灵原样（XNA 预乘混合的 RGB 贡献不随 color.A 缩减，见 drawEnemy color pass）
   *  （GetColor 二次绘制语义，Main.cs:24986 / NPC.cs:94903） */
  /** 染色变体共享图集(2026-08-19 双开 IOSurface 张数根治):tintedSprite/
   *  lerpSprite 两族的变体从"每条一张 canvas(上限 1024 张)"合并进 ≤4 张
   *  512² 页;LRU+空位复用,bake 在私有 scratch 上进行 */
  private tintAtlas = new TintAtlas();
  private tintedSprite(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }, color: number[],
  ): TintRect | null {
    // ★色键量化步进 8(2026-08-19 canvas 哨兵三捕:drawEnemy/掉落物每帧调此,
    // color=光照染色连续漂移 → 每帧新键 → 用户真机 60/s 持续 9 分钟、暂停中
    // 照跑(渲染循环不停)。烘焙用桶内首个精确色,敌怪受击闪白等瞬态不受影响)
    const q = (v: number) => Math.round(v) & ~7;
    const k = `${key}|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|${q(color[0])},${q(color[1])},${q(color[2])}`;
    const w = Math.max(1, frame.sw), h = Math.max(1, frame.sh);
    // ★TintAtlas 子矩形图集(2026-08-19 双开 IOSurface 再爆):旧实现每变体
    // 一张 canvas,上限 1024 条 = 战斗态上千张表面;合并进 ≤4 张 512² 共享页
    return this.tintAtlas.bake(k, w, h, (cx) => {
      cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      // ① RGB 乘 color（multiply 的 alpha 取并集 → 透明区被铺色，下一步裁掉）
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
      cx.fillRect(0, 0, w, h);
      // ② 用精灵本体当 destination-in 的源：alpha 恢复为轮廓形状(在 atlas 的
      //   私有 scratch 上进行——destination-in 全画布语义,不能直接画共享页)
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      cx.globalCompositeOperation = 'source-over';
    });
  }

  /** 全亮模式（F9）：跳过光照合成，画面无暗影 */
  fullbright = false;

  /** XNA base+color 两遍合一烘焙（2026-08-20 史莱姆"过暗"终案）：
   *  XNA 预乘管线（content pipeline 贴图预乘 + AlphaBlend(One,InvSrcAlpha)）下,
   *  GetAlpha 遍（rgb/A 同乘 ka=(255−alpha)/255）叠 GetColor 遍（rgb=color×light
   *  不乘 color.A,α=color.A）的两次混合,在预乘空间逐位恒等于单张精灵：
   *    premult = T.a·T·Cc + T.a·T·ka·(1−T.a·kc)
   *    α_out   = 1−(1−T.a·ka)(1−T.a·kc)
   *  Canvas 存 straight=premult/α（>255 钳 255——仅最亮 texel×暗背景组合差
   *  ~18%,亮天空场景被 XNA backbuffer 自身钳位补偿,终值差 ≤1%）。
   *  ★单次 source-over 即在【任意】背景精确重现两遍合成——含空气背景的
   *  (1−occ)≈0.417 透出。此前三步 lighter 方案 α 被钳 1,纯天空背景丢失全部
   *  透出（绿史莱姆薄荷青=天空蓝透出,用户双截图+原版实机数值定谳：
   *  预测 24.8+0.417×248=148 vs 原版实测 B=146）。
   *  ka 量化 64 档进键（渐显动画族防缓存风暴,误差 ≤0.8%;★曾 8 档=史莱姆
   *  0.3137→0.375 基础项 +19.6% 误伤,2026-08-21 终审自查修正）。 */
  private xnaCombined(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number },
    color: number[], ka: number,
  ): TintRect | null {
    ka = NPC_TINT_KA;   // 经验定标（?slimeka= 可临时覆盖,见常量注）
    const kc = color[3] / 255;
    const q = (v: number) => Math.round(v) & ~7;
    const kaq = Math.round(Math.max(0, Math.min(1, ka)) * 64) / 64;
    const k = `${key}|xna|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|${q(color[0])},${q(color[1])},${q(color[2])}|${kaq}`;
    const w = Math.max(1, frame.sw), h = Math.max(1, frame.sh);
    return this.tintAtlas.bake(k, w, h, (cx) => {
      cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
      const im = cx.getImageData(0, 0, w, h);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a === 0) continue;
        const occ = 1 - (1 - a * kaq) * (1 - a * kc);
        const baseK = a * kaq * (1 - a * kc);   // base 贡献系数（乘 texel）
        for (let c = 0; c < 3; c++) {
          const T = d[i + c];
          const C = (c === 0 ? color[0] : c === 1 ? color[1] : color[2]) / 255;
          d[i + c] = Math.min(255, (a * T * C + baseK * T) / occ);
        }
        d[i + 3] = occ * 255;
      }
      cx.putImageData(im, 0, 0);
    });
  }

  /**
   * 智能光标黄框（Main.cs:46016-46066 DrawSmartCursor 1:1）：
   * 目标格四象限各 8×8 块色 (1,0.9,0.1)×0.6 + 2px 外框十字 (1,0.95,0.3)，
   * 颜色乘该格光照（Lighting.GetColor）；有方向锁且下一格空 → 方向箭头
   * （SmartCursorArrow 贴图 8 帧；此处先用 canvas 三角形，沿方向 16/20px + 0.9s 正弦浮动）。
   */
  /** MoonLordShake 屏幕滤镜（Main.cs:64437-64447 + FilterMoonLordShake）：
   *  月总倒计时期间的红色震屏后处理。原版 shader 以激活点为靶心做径向扰动 + 红移，
   *  此处以靶心径向红晕近似；脉冲相位沿强度公式里的 sin(cd/60×0.5) 呼吸 */
  private drawMoonLordShake(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
    const m = this.moonLordShake;
    if (!m || m.t <= 0) return;
    const [sx, sy] = cam.worldToScreen(m.x, m.y);
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 90);
    const r = Math.max(viewW, viewH) * 0.75;
    const g = ctx.createRadialGradient(sx, sy, r * 0.12, sx, sy, r);
    g.addColorStop(0, 'rgba(255,32,32,0)');
    g.addColorStop(1, `rgba(190,10,10,${Math.min(0.7, 0.55 * m.t * pulse).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // ---- ScreenObstruction 遮屏（ScreenObstruction.cs 1:1，Obstructed buff 163 载体）----
  /** screenObstruction 当前黑幕强度（Update 的静态位；调试/探针可读） */
  screenObstruction = 0;
  private obstructionLastSpeed = 0.1;   // lastSpeed（:9）
  private obstructionTex: ImageBitmap | HTMLImageElement | null = null;
  private obstructionFailAt = 0;   // 失败负缓存 TTL(2026-08-25 同类扫描)

  /** Update（:12-41）+ Draw（:43-63）合并：headcovered（buff 163）→ 目标 0.95/步进
   *  0.3；解除后以 lastSpeed 回落。绘制 = 黑幕四象限围出玩家矩形孔（MagicPixel 四
   *  quad :57-60）+ Extra_49 洞沿羽化贴图（:61，100×100） */
  private updateAndDrawScreenObstruction(
    ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number, player: Player,
  ): void {
    const headcovered = player.buffs.obstructed;   // Player.cs:11421（buff 163 → headcovered）
    let target = 0;
    let amount = 0.1;
    if (headcovered) { target = 0.95; amount = 0.3; }   // :27-31
    if (target === 0 && this.screenObstruction !== 0) amount = this.obstructionLastSpeed;
    else this.obstructionLastSpeed = amount;            // :32-39
    // MoveTowards(amount/帧，60Hz 帧步进)
    const frames = 1;
    const step = amount * frames;
    if (this.screenObstruction < target) this.screenObstruction = Math.min(target, this.screenObstruction + step);
    else if (this.screenObstruction > target) this.screenObstruction = Math.max(target, this.screenObstruction - step);
    if (this.screenObstruction <= 0.001) return;
    // 玩家矩形孔（:50-52）：getRect 以 Extra_49 宽 100 为基准 Inflate，+10/2 竖偏
    const HOLE = 100, num2 = 10;
    const [px, py] = cam.worldToScreen(player.x, player.y);
    const rw = HOLE, rh = HOLE;   // Inflate 到 100×100（玩家 20×42 基准 + 均分补齐）
    const rect = {
      left: Math.round(px + player.w / 2 - rw / 2),
      top: Math.round(py + player.h / 2 - rh / 2 + num2 / 2 - num2),
      right: 0, bottom: 0,
    };
    rect.right = rect.left + rw;
    rect.bottom = rect.top + rh;
    const a = Math.min(0.95, this.screenObstruction);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, viewW, Math.max(0, rect.top));                                   // 上
    ctx.fillRect(rect.right, 0, Math.max(0, viewW - rect.right), viewH);                // 右
    ctx.fillRect(0, rect.bottom, viewW, Math.max(0, viewH - rect.bottom));              // 下
    ctx.fillRect(0, 0, Math.max(0, rect.left), viewH);                                  // 左
    if (!this.obstructionTex) {
      if (!this.obstructionFailAt || Date.now() - this.obstructionFailAt >= 10_000) {   // 失败 TTL:过期重试自愈
        const im = new Image();
        im.onload = () => upgradeToBitmap(im, (b) => { this.obstructionTex = b; });
        im.onerror = () => { this.obstructionFailAt = Date.now(); this.obstructionTex = null; };
        im.src = 'sprites/vanilla/Extra_49.png';
        this.obstructionTex = im;
      }
    }
    const tex = this.obstructionTex;
    if (tex && (tex.width > 0) && tex.width > 0) {
      ctx.globalAlpha = a;
      ctx.drawImage(tex, rect.left, rect.top, rw, rh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** 指针物品/交互图标（Main.cs:44474-44562 DrawInterface_40）+ 住房携带头像
   *  （:44622-44688 DrawInterface_38）。屏幕空间;图标恒全亮（GetItemLight
   *  outInTheWorld=false 不采光照,ItemSlot.cs:3458）;pos=(mouse+10+push)。 */
  /** 原版物品 vid → 内部 item id（atlasIcon 键）;未注册返回 -1 */
  private itemInternalOfVid(vid: number): number {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    return key ? ITEM_BY_KEY[key] : -1;
  }

  private drawCursorItemIcon(
    ctx: CanvasRenderingContext2D, player: Player,
  ): void {
    void player;
    const c = this.cursorIconCtx;
    // 门：悬 NPC / 手持 UI 拖拽物(MouseDisplayItem)→ 住房头像也一并取消(:44628)。
    // ★红蓝对抗 C-F8：mouseInterface 门在 Draw 端（:45794）——置位侧照跑（缓存余辉
    //  照刷新），UI 面板悬停时只压绘制不压数据
    if (c.npcHover || c.uiHeld || c.uiBlocking) return;
    if (!this.atlas) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ---- 住房光标携带头像（:44652-44655:NPC_Head @ mouse+26-半size,cursorScale） ----
    if (c.housingHead !== null) {
      const head = this.atlas.ensureVImage(`vanilla/NPC_Head_${c.housingHead}.png`);
      if (head) {
        ctx.drawImage(head, this._mouseX + 26 - head.width / 2, this._mouseY + 26 - head.height / 2);
      }
      ctx.restore();
      return;   // 携带头像时光标独占(:44662 mouseInterface 语义),物品图标不画
    }

    // ---- 图标 id 解析序（:44481-44496）:held → 群系覆写 → cursorItemIconID ----
    const p = player;
    let num = c.heldVid;
    if (c.biomeTorch !== null && num === 8) num = c.biomeTorch;
    else if (c.biomeCampfire !== null && num === 966) num = c.biomeCampfire;
    if (p.cursorItemIconID !== 0) num = p.cursorItemIconID;
    const flag = p.cursorItemIconEnabled && num !== 0;           // 悬停/使用支
    const flag2 = c.cacheTime > 0 && !c.uiHeld;                   // 余辉支（:45816-45821 只看 mouseItem）
    if (flag || flag2) {
      // ★红蓝对抗 C-F9②：余辉支原版画 num（:45812-45814 先定格=当前手持/悬停 id,
      // 含群系火把覆写;:45816-45821 flag2 只换"画不画"不换"画什么"）——曾用缓存
      // id,群系火把覆写态下余辉退回基础火把
      const t = num !== 0 ? num : c.cacheVid;
      if (t > 0) {
        const push = 10 + p.cursorItemIconPush;
        const icon = this.atlasIcon(this.itemInternalOfVid(t));
        if (icon) {
          // cursorScale（Main.cs:53294 = cursorAlpha×0.3+0.8,0.98..1.1 呼吸）:
          // 原版 :45848-45850 中心锚 = mouse+(10+push)+GetDrawHitbox×scale×0.5、
          // DrawItemIcon 以帧中心为 origin 按 cursorScale 画——hitbox=frame
          // （本仓不建 item.scale,登记）时等价顶左 = mouse+(10+push)、
          // 尺寸 = 帧×cursorScale（此前恒 1:1 = 丢呼吸档,2026-09-03 对齐）
          const S = c.cursorScale;
          const dw = icon.sw * S;
          const dh = icon.sh * S;
          ctx.save();
          if (p.cursorItemIconReversed) { ctx.translate(this._mouseX + push + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(this._mouseX + push + dw / 2), 0); }
          ctx.globalAlpha = 1;
          // 恒全亮:原版 GetItemLight(:44519)以 outInTheWorld=false 默认参调用,
          // 不采样世界光照(ItemSlot.cs:3458 只处理迪斯科/脉冲/精华特殊物品),
          // currentColor 恒 White → 图标不乘暗。曾误读为"乘光标格光照"并
          // source-atop 叠黑——该合成作用于整张画布,暗处变纯黑方块(2026-08-18 报)
          ctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh,
            this._mouseX + push, this._mouseY + push, dw, dh);
          // GetItemLight 特殊物品改色（ItemSlot.cs:3475-3507,2026-08-19 补齐）:
          // 迪斯科族 → Main.Disco 色循环;ItemIconPulse 族 → essScale 脉冲;
          // 精华 58/184/4143 → essScale×0.25+0.75。essScale∈0.7-1.0 恒≤1 →
          // 全部为"乘暗/乘色",三步离屏 tint(multiply+destination-in 恢复 alpha)
          const clk = this.lighting?.clock;
          const iconDst = { x: this._mouseX + push, y: this._mouseY + push, w: dw, h: dh };
          if (clk) {
            let tint: readonly [number, number, number] | null = null;
            if (CURSOR_DISCO_ITEMS.has(t)) tint = [clk.discoR, clk.discoG, clk.discoB];
            else if (CURSOR_PULSE_ITEMS.has(t)) tint = [255 * clk.essScale, 255 * clk.essScale, 255 * clk.essScale];
            else if (CURSOR_ESS_ITEMS.has(t)) {
              const b = 255 * (clk.essScale * 0.25 + 0.75);
              tint = [b, b, b];
            }
            if (tint && (tint[0] < 254 || tint[1] < 254 || tint[2] < 254)) {
              tintIconRect(ctx, icon, iconDst, tint);
            }
          }
          ctx.restore();
          // 油漆工具子图标（:44531-44538 + TryGetAmmo :44570-44576）
          if (flag && c.paintAmmoVid > 0 && PAINT_TOOLS.has(num)) {
            const ammo = this.atlasIcon(this.itemInternalOfVid(c.paintAmmoVid));
            if (ammo) {
              const off = paintToolOffset(num);
              ctx.drawImage(ammo.img, ammo.sx, ammo.sy, ammo.sw, ammo.sh,
                this._mouseX + 10 + off.x, this._mouseY + 10 + off.y, ammo.sw * 0.8, ammo.sh * 0.8);
            }
          }
        }
      }
    }
    // cursorItemIconText（:44540-44543 MouseText）——孤儿箱/命名箱类型名 tooltip。
    // MouseTextInner（Main.cs:20032-20175,rare=0 纯文本支）:无面板带影文字,
    // 锚 mouse+14,屏幕右/下缘 40px 收边,白 × mouseTextColor 脉动
    if (p.cursorItemIconText !== '') {
      const mt = this.lighting?.clock.mouseTextColor ?? 255;
      const c = Math.round((mt / 255) * 255);
      ctx.font = '14px monospace';
      const w = ctx.measureText(p.cursorItemIconText).width;
      const h = 14;
      let x = this._mouseX + 14, y = this._mouseY + 14;
      if (x + w + 40 > this.canvas.width) x = this.canvas.width - w - 40;
      if (y + h + 40 > this.canvas.height) y = this.canvas.height - h - 40;
      // 字体偏差登记同 InfoAccsLayer:原版 FontAssets.MouseText → 本仓 canvas 字+四向描边
      ctx.save();
      for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        ctx.fillStyle = '#000';
        ctx.fillText(p.cursorItemIconText, x + ox, y + oy);
      }
      ctx.fillStyle = `rgb(${c},${c},${c})`;
      ctx.fillText(p.cursorItemIconText, x, y);
      ctx.restore();
    }
    // 告示牌头顶指示泡（Main.cs:45133-45152 signBubble）：Chat2.png（32×28）挂锚顶
    // 上方 22px、偏玩家异侧 ±(8+宽)，白×mouseTextColor 脉动（乘色，复用 tintIconRect）
    if (this.signBubbleScreen) {
      const tex = this.atlas.ensureVImage('vanilla/Chat2.png');
      if (tex) {
        const mtb = this.lighting?.clock.mouseTextColor ?? 255;
        const cb = Math.round((mtb / 255) * 255);
        let num = this.signBubbleScreen.x;
        if (this.signBubbleScreen.flip) num += -8 - tex.width;
        else num += 8;
        const num2 = this.signBubbleScreen.y - 22;
        ctx.save();
        if (this.signBubbleScreen.flip) {
          const cxm = num + tex.width / 2;
          ctx.translate(cxm, 0); ctx.scale(-1, 1); ctx.translate(-cxm, 0);
        }
        tintIconRect(ctx, { img: tex, sx: 0, sy: 0, sw: tex.width, sh: tex.height },
          { x: num, y: num2, w: tex.width, h: tex.height }, [cb, cb, cb]);
        ctx.restore();
      }
    }
    // 告示牌悬停文本（Main.cs:42354-42397 1:1）：WordwrapString(text,460,10) 断行 →
    // 锚=mouse+(16,16)（OpaqueBox 再 +(8,2)）→ 右/下缘钳制（Y>H-行高×行数、
    // X>W-maxW）→ DrawInvBG 底板（x-10,y-5,w+20,行高×行数+7, Color(23,25,81)×
    // 0.925×0.85）→ DrawBorderStringFourWay 白×mouseTextColor 四向描边。
    // ★canvas fillText y=基线而 XNA DrawString y=字形顶（origin 零）——曾按基线画
    //   致文字浮出底板上缘（2026-08-28 用户实报"标牌文字错位"），textBaseline=top 修正
    if (this.signHoverText) {
      ctx.font = '14px monospace';
      const lh = 20;
      const lines: string[] = [];
      // 原版 WordwrapString(Utils.cs:874) = CreateWrappedText 后按 '\n' Split——
      // 硬换行（墓碑 epitaph = 死因\n日期）成独立行。曾不切 \n → 日期黏上死因行、
      // \n 渲染成幻影空档（2026-09-01 用户实报）
      for (const para of this.signHoverText.split('\n')) {
        if (lines.length >= 10) break;
        let seg = para;
        if (ctx.measureText(seg).width <= 460) { lines.push(seg); continue; }
        while (seg.length > 0 && lines.length < 10) {
          if (ctx.measureText(seg).width <= 460) { lines.push(seg); seg = ''; break; }
          let cut = seg.length;
          while (cut > 1 && ctx.measureText(seg.slice(0, cut)).width > 460) cut--;
          const sp = seg.lastIndexOf(' ', cut);   // 优先空格断词（WordwrapString 语义）
          if (sp > 0) cut = sp;
          lines.push(seg.slice(0, cut));
          seg = seg.slice(cut).replace(/^[ ]+/, '');
        }
      }
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      let bx = this._mouseX + 16, by = this._mouseY + 16;
      if (options.data.opaqueBoxBehindTooltips) { bx += 8; by += 2; }
      if (by > this.canvas.height - lh * lines.length) by = this.canvas.height - lh * lines.length;
      if (bx > this.canvas.width - maxW) bx = this.canvas.width - maxW;
      ctx.save();
      // ★锚自洁(2026-09-01 用户实报"墓碑文字与底板错位"):本块曾只钉 textBaseline
      //   ——textAlign 依赖上游状态,render 尾段任一 'center' 泄漏跨帧存活(canvas
      //   状态跨帧持久;死亡屏 2026-08-25 同案) → 文字以 bx 为中心横排:整体左移
      //   半宽、底板右脱节。MouseText 家族锚语义 = 左上,两锚一并显式钉死
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (options.data.opaqueBoxBehindTooltips) {
        ctx.fillStyle = 'rgba(18,20,64,0.79)';   // Color(23,25,81,255)×0.925×0.85
        ctx.fillRect(bx - 10, by - 5, maxW + 20, lh * lines.length + 7);
      }
      const mt2 = this.lighting?.clock.mouseTextColor ?? 255;
      const c2 = Math.round((mt2 / 255) * 255);
      for (let i = 0; i < lines.length; i++) {
        const y = by + i * lh;
        for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
          ctx.fillStyle = '#000';
          ctx.fillText(lines[i], bx + ox, y + oy);
        }
        ctx.fillStyle = `rgb(${c2},${c2},${c2})`;
        ctx.fillText(lines[i], bx, y);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** 图格网格 α 状态机（Main.MouseBuildingGridAlpha Main.cs:271；on 每 0.2 帧
   *  缓动到速度目标，off -0.05/帧淬灭） */
  private _buildingGridAlpha = 0;

  /** DrawInterface_6_TileGridOption（Main.cs:45634-45671）1:1：开关开且智能光标
   *  未用且玩家存活 → 鼠标格中心画 CursorRadial（=Images/UI/Radial.png，
   *  AssetInitializer.cs:800），White×0.5×α；α 目标 = Lerp(0,0.7,clamp(1-速度/6)) */
  private drawBuildingGrid(
    ctx: CanvasRenderingContext2D, cam: Camera, player: Player,
    smartCursorUsed: boolean, mouseX: number, mouseY: number,
  ): void {
    const on = options.data.mouseShowBuildingGrid && !smartCursorUsed && !player.dead;
    if (on) {
      const speed = Math.hypot(player.vx, player.vy);      // player.velocity.Length()
      const target = 0.7 * Math.max(0, Math.min(1, 1 - speed / 6));
      this._buildingGridAlpha += (target - this._buildingGridAlpha) * 0.2;
    } else {
      this._buildingGridAlpha = Math.max(0, this._buildingGridAlpha - 0.05);
    }
    const alpha = this._buildingGridAlpha;
    if (alpha <= 0.01) return;
    const tex = this.atlas ? this.atlas.vui('UI_Radial.png') : null;
    if (!tex) return;
    const [wx, wy] = cam.screenToWorld(mouseX, mouseY);
    const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);   // MouseWorld.ToTileCoordinates
    const [sx, sy] = cam.worldToScreen(tx * 16, ty * 16);
    // 原版 position + (8,8)：贴图原点 size/2 → 中心对齐格心
    ctx.save();
    ctx.globalAlpha = 0.5 * alpha;
    ctx.drawImage(tex.img, tex.sx, tex.sy, tex.sw, tex.sh,
      sx + 8 - tex.sw / 2, sy + 8 - tex.sh / 2, tex.sw, tex.sh);
    ctx.restore();
  }

  private drawSmartCursor(
    ctx: CanvasRenderingContext2D, cam: Camera, hover: HoverTarget, viewH: number, z: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    void viewH;
    const ts = TILE * z;                       // 屏幕空间下的格尺寸
    const [sx, sy] = cam.worldToScreen(hover.x * TILE, hover.y * TILE);
    // 光照采样（越界/区域外按全亮，防洞穴边缘框消失）
    let lr = 255, lg = 255, lb = 255;
    if (hover.x >= rx && hover.y >= ry && hover.x < rx + rw && hover.y < ry + rh) {
      const li = (hover.y - ry) * rw + (hover.x - rx);
      lr = lightR[li]; lg = lightG[li]; lb = lightB[li];
    }
    const mul = (c: number, l: number): number => Math.round((c * l) / 255);
    // 四象限 8×8 块 (1,0.9,0.1) × 0.6
    ctx.fillStyle = `rgba(${mul(255, lr)},${mul(229, lg)},${mul(26, lb)},0.6)`;
    const q = ts / 2;
    ctx.fillRect(sx, sy, q, q);
    ctx.fillRect(sx + q, sy, q, q);
    ctx.fillRect(sx, sy + q, q, q);
    ctx.fillRect(sx + q, sy + q, q, q);
    // 2px 外框十字 (1,0.95,0.3)
    ctx.fillStyle = `rgb(${mul(255, lr)},${mul(242, lg)},${mul(77, lb)})`;
    const bw = 2 * z;
    ctx.fillRect(sx - bw, sy, bw, ts);
    ctx.fillRect(sx + ts, sy, bw, ts);
    ctx.fillRect(sx, sy - bw, ts, bw);
    ctx.fillRect(sx, sy + ts, ts, bw);
    // 方向锁箭头（Main.cs:46055-46065）
    const arrow = hover.arrow;
    if (arrow) {
      const idx = SMART_CURSOR_DIRECTION_LOCKS.findIndex(([ax, ay]) => ax === arrow.x && ay === arrow.y);
      if (idx >= 0) {
        const diagonal = idx % 2 === 1;
        const phase = (performance.now() / 1000 / 0.9) % 1;
        const bob = 2 - 2 * Math.sin(phase * Math.PI); // 0→2→0
        const cxp = sx + ts / 2 + arrow.x * (diagonal ? 16 : 20) * z + arrow.x * bob * z;
        const cyp = sy + ts / 2 + arrow.y * (diagonal ? 16 : 20) * z + arrow.y * bob * z;
        ctx.save();
        ctx.translate(cxp, cyp);
        ctx.rotate((idx * Math.PI) / 4); // SmartCursorDirectionLocks 上起顺时针（Main.cs:66188）
        ctx.fillStyle = `rgb(${mul(255, lr)},${mul(242, lg)},${mul(77, lb)})`;
        const r = 5 * z;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.7, r);
        ctx.lineTo(-r * 0.7, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ==== 世界层（光照分层 2026-08-19）====
  /** 世界层画布：tile/墙/水/实体/粒子绘入此层；compositeLight 把光照 multiply
   *  按层 alpha 成形后叠回主画布。天空层（渐变/星/日月/云/群系背景）直绘主画布
   *  不进光照——原版 tile/NPC 绘入 RenderTarget 乘光、sky 直绘 backbuffer 的分层
   *  语义。此前全屏乘光令夜空按月光地板(~21/255)压暗，月亮/星星近不可见
   *  （2026-08-19 用户实报"夜里的月亮不亮"）。逃生门 ?worldlayer=0 回旧全屏乘光 */
  private worldCanvas: HTMLCanvasElement | null = null;
  private worldCtxLayer: CanvasRenderingContext2D | null = null;
  private lightMaskCanvas: HTMLCanvasElement | null = null;
  private lightMaskCtxLayer: CanvasRenderingContext2D | null = null;
  private worldLayerActive = false;
  /** ★2026-08-20 原版化落地:worldLayer 分层默认【开】(原版语义:天空/日月/
   *  星/远景直绘 backbuffer,世界内容按光照乘色)——合成已改 GL 双纹理精确乘
   *  (顶点色语义,α 无损),且与 ColorOfTheSkies 色链单源化【同批】落地(分批
   *  切换曾致夜景全面漂移,教训固化)。逃生门 ?worldlayer=0 回旧全屏乘光 */
  worldLayerEnabled = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('worldlayer') !== '0' : true;
  /** 本帧 ColorOfTheSkies(0-255;render 每帧写入)——天空侧唯一色源,详见 render() 1.5 段注 */
  colorOfTheSkies: [number, number, number] = [255, 255, 255];
  /** 世界层×光照 GL 精确乘(?wgl=0 逃生门;GL 不可用自动回退 2D 三步)。
   *  Canvas2D 'multiply' 无法表达"乘色保 α"(blend 的 (1-αd)Cs 项 + α 膨胀),
   *  原版顶点色语义只能双纹理 shader——见 GLWorldLight 头注 */
  private worldLight: GLWorldLight | null = null;
  private worldLightRetryAt = 0;
  private worldLightEnabled = (() => {
    try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('wgl') !== '0'; }
    catch { return false; }
  })();
  /** GL 精确乘实例(活实例直取;死亡 5s 退避;初始化失败 30s 闩——同 acquireGL 哨兵) */
  private worldLightLayer(): GLWorldLight | null {
    if (!this.worldLightEnabled) return null;
    if (this.worldLight) {
      if (!this.worldLight.unavailable && !this.worldLight.diedAt) return this.worldLight;
      if (performance.now() - this.worldLight.diedAt < 5000) { this.worldLight = null; return null; }
      this.worldLight.dispose();
      this.worldLight = null;
    }
    if (performance.now() < this.worldLightRetryAt) return null;
    if (starvedLock()) return null;   // 饥饿锁:同上——光乘法走 2D 回退分支
    const inst = new GLWorldLight();
    if (inst.unavailable) {
      inst.dispose();
      this.worldLightRetryAt = performance.now() + 30_000;
      return null;
    }
    this.worldLight = inst;
    return inst;
  }

  /** 屏幕滤镜链 GL 后端(?sfxgl=0 逃生门;ScreenShader.cso SM2 字节码 1:1) */
  private screenFx: GLScreenFilters | null = null;
  private screenFxRetryAt = 0;
  private screenFxEnabled = (() => {
    try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('sfxgl') !== '0'; }
    catch { return false; }
  })();
  /** 同 worldLightLayer 哨兵模式(活实例直取;死亡 5s 退避;初始化失败 30s 闩) */
  private screenFxLayer(): GLScreenFilters | null {
    if (!this.screenFxEnabled || this.isCpuRender()) return null;
    if (this.screenFx) {
      if (!this.screenFx.unavailable && !this.screenFx.diedAt) return this.screenFx;
      if (performance.now() - this.screenFx.diedAt < 5000) { this.screenFx = null; return null; }
      this.screenFx.dispose();
      this.screenFx = null;
    }
    if (performance.now() < this.screenFxRetryAt) return null;
    if (starvedLock()) return null;
    const inst = new GLScreenFilters();
    if (inst.unavailable) {
      inst.dispose();
      this.screenFxRetryAt = performance.now() + 30_000;
      return null;
    }
    this.screenFx = inst;
    return inst;
  }

  /** GL 管线预热总门(?prewarmgl=0 关闭,A/B 对拍;#perf2026-08-28 批) */
  static readonly prewarmGL = (() => {
    try {
      return typeof location !== 'undefined' && new URLSearchParams(location.search).get('prewarmgl') !== '0';
    } catch { return true; }
  })();
  private _glPrewarmed = false;
  /** 进世界前把全部惰性 WebGL 上下文建好（#perf2026-08-28 trace：进入世界首帧窗
   *  t≈2.6-3.9s 串行 getContext 风暴 ~1.3s = GLWorldLight/WaterDistortion/
   *  ScreenFilters/glfx(SpriteLayer) 的 init 上下文+着色器编译，弱 GPU 每个
   *  ~100-200ms）。调用点在加载页窗口（与素材下载并行），本方法仅触发现有
   *  惰性工厂——失败走各自既有退避哨兵，与首帧路径零行为差异；重复调用幂等 */
  prewarmGameGL(): void {
    if (this._glPrewarmed || !Renderer.prewarmGL) return;
    // 贫困模式(#三开压测批):本会话饥饿过 → 不预建五个 GL 上下文,全部留懒建+
    // 工厂饥饿闸把关——重建竞争中第一个被逐的就是预热的这些
    if (starvedEver()) {
      console.warn('[prewarmGL] 会话曾有 GPU 饥饿——跳过预热(贫困模式)');
      this._glPrewarmed = true;
      return;
    }
    this._glPrewarmed = true;
    const t0 = performance.now();
    try { this.worldLightLayer(); } catch { /* 工厂内部已退避 */ }
    try { this.screenFxLayer(); } catch { /* 同上 */ }
    try { this.acquireGL(); } catch { /* glfx/bg 层 */ }
    try { this.waterWarp.prewarm(); } catch { /* 扭曲层 */ }
    // ★极光 GL(#perf2026-08-28 trace 定罪):AuroraSky 字段初始化式 new GLAurora()
    // 曾在构造链上同步引爆 getContext+着色器编译 ~790ms=进图风暴主犯;改惰性访问器
    // 后由此显式预热进加载页窗口
    try { this.sky.aurora.prewarmGL(); } catch { /* 极光层 */ }
    console.log(`[prewarmGL] WebGL 管线预热完成 ${(performance.now() - t0).toFixed(0)}ms`);
  }

  /** 7d 滤镜链合成：HeatDistortion(Low) → 柱族(Medium) → CRT/Test2(VeryHigh)。
   *  GL 优先(字节码 1:1,含 ColorOfTheSkies 链乘 EndCapture :172/:194);
   *  失败回退 2D(heat 半分辨率扭曲 + MonolithFilters canvas 近似) */
  private drawScreenFilterChain(
    ctx: CanvasRenderingContext2D, cam: Camera, player: Player,
    viewW: number, viewH: number, z: number, world?: World,
  ): void {
    const mono = this.monoFilters;
    // ★SandstormSky/BlizzardSky 色罩已迁出滤镜链(#三开压测批):原版经
    // SkyManager.DrawToDepth 在【背景层】触发(DrawBackground 内被墙/方块覆盖),
    // 头插到最终画面会让室内也被罩白(用户实报雪天满屏发白)。现于 render()
    // 背景阶段(worldLayer 前)以 drawWeatherTint2D 应用。
    const lec = world?.lunarEvent;
    const shakeI = lec && lec.moonLordCountdown > 0
      ? Math.min(1, Math.max(0, Math.sin(lec.moonLordCountdown / 60 * 0.5) * 2))
        * (0.75 - 0.5 * lec.moonLordCountdown / Math.max(1, lec.moonLordCountdownMax))
      : 0;
    const cd = lec?.crystalDeath ?? null;
    if (!mono.anyInUse && !mono.heatInUse && shakeI <= 0 && !cd) return;
    // uScreenResolution=UnscaledScreenSize(screen/RenderZoom ScreenShaderData.cs:96);
    // uScreenPosition=屏幕左上世界px(本仓屏幕即全幅,无 offScreenRange=200 垫,
    // 语义等价——vanilla 垫值只是为比屏幕大的离屏采集目标)
    const screenRes: [number, number] = [viewW / z, viewH / z];
    const screenPos: [number, number] = [cam.x - screenRes[0] / 2, cam.y - screenRes[1] / 2];
    const gl = this.screenFxLayer();
    if (gl) {
      const passes: ScreenFxPass[] = [];
      if (mono.heatVisible) {
        passes.push({
          kind: 'FilterHeatDistortion', screenRes, screenPos,
          intensity: mono.heatIntensity, opacity: mono.heatOpacity,
          time: (performance.now() / 1000) % 3600,   // GlobalTimeWrappedHourly(Main.cs:16777)
        });
      }
      // ---- ★批III尾窗：事件屏效三 pass ----
      // 月总死亡倒计时 shake（Main.cs:65956-65965：强度=clamp(sin(cd/60×0.5)×2,0,1)
      // ×(0.75−0.5·cd/max)；MaxMoonLordCountdown=3600→我方 countdownMax 同源）
      if (shakeI > 0) {
        passes.push({ kind: 'FilterMoonLordShake', intensity: shakeI,
          time: (performance.now() / 1000) % 3600 });
      }
      // 天柱死亡水晶 tint+vortex（Projectile.cs:37019-37075 三相序；t 由
      // LunarEvent.tickCrystalDeath 驱动,480t 归零）
      if (cd) {
        const nI = cd.t < 120 ? Math.min(1, cd.t / 120) : 1;              // 相0 淡入/相1 恒1
        passes.push({ kind: 'FilterCrystalDestructionColor', color: [1, 0, 0.75],
          intensity: nI, opacity: 1 });
        const vI = (cd.t < 420 ? nI : 2);                                  // 相2 I=2（:37057）
        const prog = cd.t >= 420 ? (cd.t - 420) / 60 * 30 : 0;             // 相2 (t/60)×30（:37060）
        passes.push({ kind: 'FilterCrystalDestructionVortex', screenRes,
          targetPx: [cd.x - screenPos[0], cd.y - screenPos[1]],
          intensity: vI, progress: prog, time: (performance.now() / 1000) % 3600 });
      }
      for (const f of mono.visibleFilters()) {
        switch (f.def.kind) {
          case 'miniTower':   // UseOpacity×Filter.Opacity(ScreenShaderData.cs:84)
            passes.push({ kind: 'FilterMiniTower', color: f.def.color!, opacity: f.def.useOpacity! * f.opacity });
            break;
          case 'graveyard':   // SceneState.cs:134/:138 固定参数
            passes.push({ kind: 'FilterGraveyard', intensity: 1.2, progress: mono.graveyardProgress, opacity: f.opacity });
            break;
          case 'bloodMoon':   // UseOpacity=BloodMoonScreenShaderData.Update;UseIntensity 恒 1
            passes.push({ kind: 'FilterBloodMoon', color: f.def.color!, intensity: 1, opacity: mono.bloodMoonUseOpacity * f.opacity });
            break;
          case 'retro':
            passes.push({ kind: 'FilterTest2', opacity: f.opacity });
            break;
          case 'crt':
            passes.push({ kind: 'FilterCRT', screenH: screenRes[1], zoom: z, opacity: f.opacity });
            break;
          // ★shader 修齐批终口：Sepia/Noir glExact 落地（FilterSepia :176-247/
          //   FilterNoir :248-341 逐指令直译 frag,详见 GLScreenFilters FRAG_SEPIA/
          //   FRAG_NOIR 头注;参数源=SepiaScreenShaderData.Update 链 mono.sepia）
          case 'sepia':
            passes.push({ kind: 'FilterSepia', color: mono.sepia.color,
              intensity: mono.sepia.intensity, progress: mono.sepia.progress,
              opacity: f.opacity });
            break;
          case 'noir':
            passes.push({ kind: 'FilterNoir', opacity: f.opacity,
              time: (performance.now() / 1000) % 3600 });
            break;
          default:
            break;   // moonLord 未入 GL 端口(在 GL 链上方补画见下)
        }
      }
      if (passes.length > 0 && gl.drawChain(this.canvas, passes,
        [this.colorOfTheSkies[0] / 255, this.colorOfTheSkies[1] / 255, this.colorOfTheSkies[2] / 255])) {
        ctx.drawImage(gl.canvas, 0, 0);
        // moonLord 族补画（无像素读取，GL 链结果上直叠——VeryHigh 序在 Medium
        // 柱族之后即补画在后，次序同原版 EndCapture 链表）
        const core4 = this._moonLordFilterTarget(this._frameEntities);
        const playerScr = { x: (player.cx - cam.x) * z + viewW / 2, y: (player.cy - cam.y) * z + viewH / 2 };
        for (const f of mono.visibleFilters()) {
          if (f.def.kind !== 'moonLord') continue;
          mono.drawMoonLordPass(ctx, f, viewW, viewH,
            f.def.aimAtPlayer === false && core4 ? {
              x: (core4.x - cam.x) * z + viewW / 2, y: (core4.y - cam.y) * z + viewH / 2,
            } : playerScr);
        }
        return;
      }
    }
    if (mono.heatVisible) {
      mono.drawHeat2D(ctx, this.canvas, viewW, viewH,
        { x: screenPos[0], y: screenPos[1] }, { x: screenRes[0], y: screenRes[1] },
        (performance.now() / 1000) % 3600);
    }
    if (mono.anyInUse) {
      // 月总核心屏幕位（MoonLord 滤镜 UseTargetPosition=npc[398].Center，
      // MoonLordScreenShaderData.cs:42-45——aimAtPlayer=false 支）
      const core = this._moonLordFilterTarget(this._frameEntities);
      mono.draw(ctx, this.canvas, viewW, viewH, {
        x: (player.cx - cam.x) * z + viewW / 2,
        y: (player.cy - cam.y) * z + viewH / 2,
      }, core ? {
        x: (core.x - cam.x) * z + viewW / 2,
        y: (core.y - cam.y) * z + viewH / 2,
      } : undefined);
    }
  }

  /** 本帧实体列表快照（_moonLordFilterTarget 消费用；render() 每帧刷新） */
  private _frameEntities: Entity[] = [];
  /** Moon Lord 滤镜目标位（MoonLordScreenShaderData.UpdateMoonLordIndex
   *  MoonLordScreenShaderData.cs:24-66,1457 重写——蓝队 R1-07a 补):
   *  基准 = 核心 398 中心;①真眼 400 ai0==4(死光炮)按攻击包络
   *  Remap(t,0,180,0,1)×Remap(t,340,360,1,0) 取最强者 Lerp 混入
   *  (t = ai1 对 MoonLordAttacksArray2 解码槽内时间);②核心 ai0==-2(远距传送
   *  归位剧,ai1 0→60)按 Remap(ai1,55,60,1,0) 拉回核心(★非死亡演出——398
   *  死亡演出是 ai0=2,红队 R1-07 表述勘误)。null=核心不在场 */
  private _moonLordFilterTarget(entities: Entity[]): { x: number; y: number } | null {
    let core: Enemy | null = null;
    for (const e of entities) {
      const en = e as Entity & { vanillaId?: number | null; dead?: boolean };
      if (!en.dead && en.vanillaId === 398) { core = e as Enemy; break; }
    }
    if (!core) return null;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    let tx = core.cx, ty = core.cy;
    // ① 死光炮真眼包络混合（取包络最强者）
    let num = 0, ex = 0, ey = 0;
    for (const e of entities) {
      const en = e as Entity & { vanillaId?: number | null; dead?: boolean; ai0?: number };
      if (en.dead || en.vanillaId !== 400 || en.ai0 !== 4) continue;
      const eye = e as Enemy;
      const slot = mlSlotDecode(Math.max(0, eye.ai1), ML_EYE_ATTACKS);
      const env = clamp01((slot.t - 0) / 180) * (1 - clamp01((slot.t - 340) / 20));
      if (env > num) { num = env; ex = eye.cx; ey = eye.cy; }
    }
    if (num > 0) { tx = tx + (ex - tx) * num; ty = ty + (ey - ty) * num; }
    // ② 核心传送剧拉回（Remap(ai1,55,60,1,0)）
    if (core.ai0 === -2) {
      const num2 = 1 - clamp01((core.ai1 - 55) / 5);
      if (num2 > 0) { tx = tx + (core.cx - tx) * num2; ty = ty + (core.cy - ty) * num2; }
    }
    return { x: tx, y: ty };
  }

  /** render() 世界段入口调用：切换 this.ctx → 世界层（返回 null = 逃生门关闭，
   *  调用方继续用主画布 ctx）。每帧清屏；尺寸跟随主画布。 */
  private beginWorldLayer(viewW: number, viewH: number, wK = 1): CanvasRenderingContext2D | null {
    if (!this.worldLayerEnabled || typeof document === 'undefined') { this.worldLayerActive = false; return null; }
    const lw = Math.max(64, Math.round(viewW * wK));
    const lh = Math.max(64, Math.round(viewH * wK));
    this._worldLowW = lw; this._worldLowH = lh;
    if (!this.worldCanvas || !this.worldCtxLayer || !this.lightMaskCanvas || !this.lightMaskCtxLayer) {
      this.worldCanvas = document.createElement('canvas');
      // ★willReadFrequently：CPU 乘光回退路径每帧 getImageData 全屏（GL 路径则
      //   texImage2D 上传）——提示 Skia 保持 CPU 光栅面，读取免 GPU 回读
      this.worldCtxLayer = this.worldCanvas.getContext('2d', { willReadFrequently: true })!;
      this.lightMaskCanvas = document.createElement('canvas');
      this.lightMaskCtxLayer = this.lightMaskCanvas.getContext('2d')!;
    }
    if (this.worldCanvas.width !== lw || this.worldCanvas.height !== lh) {
      this.worldCanvas.width = lw; this.worldCanvas.height = lh;   // resize 自带清屏
      this.lightMaskCanvas.width = lw; this.lightMaskCanvas.height = lh;
    } else {
      const w = this.worldCtxLayer;
      w.setTransform(1, 0, 0, 1, 0, 0);
      w.clearRect(0, 0, lw, lh);
    }
    this.worldLayerActive = true;
    this.ctx = this.worldCtxLayer;
    return this.worldCtxLayer;
  }

  /** render() 世界段收口：恢复 this.ctx → 主画布（光照合成在 compositeLight 内完成）。
   *  ★worldLayerActive 不在此清——compositeLight 稍后要靠它选世界层路径；
   *  下一帧 beginWorldLayer 会重置（逃生门路径在 begin 里置 false） */
  private endWorldLayer(mainCtx: CanvasRenderingContext2D): void {
    if (!this.worldLayerActive) return;
    this.ctx = mainCtx;
  }

  /** 荧光涂层叠层（render 7-涂层钩子）：把各 chunk 的 pair.glow（荧光涂层格 16×16
   *  拷贝，ChunkCache.bakeChunkInto 烘焙）在光照合成【后】按整数设备矩形叠回主画布
   *  = 原版该格 tileLight 强制 White（DrawTiles_GetLightOverride，TileDrawing.cs:
   *  6727-6731；GetTileLight :4425-4427）。矩形数学与 drawChunkGrid 同源（相机吸附
   *  + round 整数设备矩形，防非整数 zoom 缝）。无 glow 页的 chunk 零开销跳过。
   *  ★等价边界：叠层画在光照合成后 = 覆盖同格前景实体（原版实体画在 tile 批次
   *  之后、采样真实光照）——实体站上荧光涂层格会被盖住，登记为全屏乘光管线的
   *  最小侵入代价（逐格顶点色通道不存在）。 */
  private drawCoatGlowGrid(
    chunks: ChunkCache, cam: Camera, world: World, viewW: number, viewH: number, z: number,
  ): void {
    const ts = TILE;
    const x0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * ts)) - 1;
    const x1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * ts)) + 1;
    const y0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * ts)) - 1;
    const y1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * ts)) + 1;
    const camRX = Math.round(cam.x * z) / z;
    const camRY = Math.round(cam.y * z) / z;
    // 低清档(#perf-gpulog):同 drawChunkGrid——低清整数空间取整,防半像素缝/错位
    const wKg = this._worldLowK || 1;
    const lwg = Math.round(viewW * wKg), lhg = Math.round(viewH * wKg);
    const ox = Math.round(lwg / 2), oy = Math.round(lhg / 2);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const S = CHUNK * ts;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= world.w || cy * CHUNK >= world.h) continue;
        const p = chunks.get(cx, cy);
        if (!p.glow) continue;
        const zz = z * wKg;
        const xd0 = ox + Math.round((cx * CHUNK * ts - camRX) * zz);
        const yd0 = oy + Math.round((cy * CHUNK * ts - camRY) * zz);
        const xd1 = ox + Math.round(((cx + 1) * CHUNK * ts - camRX) * zz);
        const yd1 = oy + Math.round(((cy + 1) * CHUNK * ts - camRY) * zz);
        ctx.drawImage(p.glow, 0, 0, S, S, xd0, yd0, xd1 - xd0, yd1 - yd0);
      }
    }
    ctx.restore();
  }

  private compositeLight(
    cam: Camera, viewW: number, viewH: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    if (this.fullbright) { // 开灯：不做 multiply，全部原色（世界层仍须叠回主画布）
      // 低清档(#perf-gpulog):世界层 K 缩 → 拉伸回填全尺寸
      if (this.worldLayerActive && this.worldCanvas) this.ctx.drawImage(this.worldCanvas, 0, 0, viewW, viewH);
      return;
    }
    const z = cam.zoom;
    const ts = TILE;
    const tilesX = Math.ceil(viewW / z / ts) + 2;
    const tilesY = Math.ceil(viewH / z / ts) + 2;
    const tx0 = Math.floor((cam.x - viewW / 2 / z) / ts);
    const ty0 = Math.floor((cam.y - viewH / 2 / z) / ts);
    // 2× 超采样：光照图每半格一个采样点，tile 中心间双线性插值，
    // 光斑梯度曲率更细腻（每格一采样时火把光斑有明显的马赛克棱面感）
    const SS = 2;
    const w2 = tilesX * SS, h2 = tilesY * SS;
    if (this.lightCanvas.width !== w2 || this.lightCanvas.height !== h2) {
      this.lightCanvas.width = w2;
      this.lightCanvas.height = h2;
    }
    const lc = this.lightCtx;
    // ImageData 复用(尺寸不变时)——此前每帧 createImageData ≈87KB 分配
    if (!this._lightImg || this._lightImg.width !== w2 || this._lightImg.height !== h2) {
      this._lightImg = lc.createImageData(w2, h2);
    }
    const img = this._lightImg;
    // 4 tap 双线性。此前 tap 每像素返回 4 个 [r,g,b] 元组 ≈ 5.3M 小对象/s
    // (2026-08 审计 G2);现采样写入模块级标量缓冲,运算顺序不变、结果逐位一致
    const tapBuf = _lightTap;
    for (let py = 0; py < h2; py++) {
      const gy = py / SS - 0.5;              // 亚格坐标（tile 中心在整数处）
      const y0 = Math.floor(gy), fy = gy - y0;
      const wy0 = 1 - fy, wy1 = fy;
      for (let px = 0; px < w2; px++) {
        const gx = px / SS - 0.5;
        const x0 = Math.floor(gx), fx = gx - x0;
        const wx0 = 1 - fx, wx1 = fx;
        const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
        // 4 tap:每 tap 3 通道写 tapBuf[k..k+2],区域外 0(由环境光下限兜底)
        for (let t = 0; t < 4; t++) {
          const sx = x0 + (t & 1), sy = y0 + (t >> 1);
          const tx = tx0 + sx, ty = ty0 + sy;
          const k = t * 3;
          if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) {
            const li = (ty - ry) * rw + (tx - rx);
            tapBuf[k] = lightR[li]; tapBuf[k + 1] = lightG[li]; tapBuf[k + 2] = lightB[li];
          } else {
            tapBuf[k] = 0; tapBuf[k + 1] = 0; tapBuf[k + 2] = 0;
          }
        }
        let r = tapBuf[0] * w00 + tapBuf[3] * w10 + tapBuf[6] * w01 + tapBuf[9] * w11;
        let g = tapBuf[1] * w00 + tapBuf[4] * w10 + tapBuf[7] * w01 + tapBuf[10] * w11;
        let b2 = tapBuf[2] * w00 + tapBuf[5] * w10 + tapBuf[8] * w01 + tapBuf[11] * w11;
        // 原版语义:无 gamma LUT、无环境光下限(原版光照输出直乘;
        // 夜晚亮度由天空种子+月相地板决定,洞穴真黑)
        const i = (py * w2 + px) * 4;
        img.data[i] = Math.min(255, Math.round(r));
        img.data[i + 1] = Math.min(255, Math.round(g));
        img.data[i + 2] = Math.min(255, Math.round(b2));
        img.data[i + 3] = 255;
      }
    }
    lc.putImageData(img, 0, 0);
    const [sx, sy] = cam.worldToScreen(tx0 * ts, ty0 * ts);
    // ==== 世界层路径（2026-08-20 重写,对齐原版顶点色语义）：
    //      out.rgb = 世界.rgb × 光.rgb,α 原样保留（Lighting.GetColor 的 A 恒 255）。
    //      天空/日月星辰不进光照 = 原版 backbuffer 直绘分层语义。
    //      ★Canvas2D 'multiply' 走 PDF 混合:半透明像素 α 膨胀(0.7→0.91)+
    //      (1-αd)·Cs 洗色——2026-08-19 版 mask-multiply 即此处翻车(史莱姆
    //      "染色/透明不对")。精确乘只能双纹理 shader:
    //      ① GL 路径(GLWorldLight,?wgl=0 关闭)
    //      ② 2D 三步回退:copy→multiply(全 α 光照)→destination-in 恢复 α
    //        ——不透明像素精确;半透明像素留 (1-α)·光 洗色(GL 路径无此项) ====
    if (this.worldLayerActive && this.worldCtxLayer && this.lightMaskCtxLayer) {
      const lw = tilesX * ts * z, lh = tilesY * ts * z;
      const gl = this.worldLightLayer();
      // 低清档(#perf-gpulog):world 纹理已 K 缩,lightRect 同比缩(world-layer 像素系)
      const k = this._worldLowK;
      // ★光矩形设备取整（2026-09-01 全宽发丝缝定案）：旧 [sx*k, sy*k, lw*k, lh*k]
      //   是浮点屏幕坐标——相机高度/缩放变化时矩形小数部分漂移，GL 线性采样在
      //   边缘行插值到纹理夹持边 → 整屏宽 1px 错位行（必须特定高度/缩放复现，
      //   用户截图43 横贯机器+墙+背景）。改用与 chunk/动态层完全同源的取整
      //   表达式（oxW+round((世界坐标-camRX)*zz)）——光照矩形与世界内容像素
      //   级配准且恒整数，边缘行不再跨界采样；光照渐变本身不受影响。
      const zzL = z * k;
      const camRXl = Math.round(cam.x * z) / z;
      const camRYl = Math.round(cam.y * z) / z;
      const oxW = Math.round(this._worldLowW / 2), oyW = Math.round(this._worldLowH / 2);
      const lx0 = oxW + Math.round((tx0 * ts - camRXl) * zzL);
      const ly0 = oyW + Math.round((ty0 * ts - camRYl) * zzL);
      const lx1 = oxW + Math.round(((tx0 + tilesX) * ts - camRXl) * zzL);
      const ly1 = oyW + Math.round(((ty0 + tilesY) * ts - camRYl) * zzL);
      void lw; void lh; void sx; void sy;
      if (gl && gl.composite(this.worldCanvas!, this.lightCanvas, [lx0, ly0, lx1 - lx0, ly1 - ly0])) {
        // ★全屏水体扭曲（原版 FilterManager.EndCapture :127-176 语义）：滤镜作用于
        //   【带光照的完整合成场景】——水下整屏随噪声+波场晃动、水线果冻、旱地 0，
        //   全由 obj19 alpha 门控交付（GLWaterDistortion 头注）。GL 不可用/逃生门/
        //   视口无液体探针（_waveLiquidInView，恒等输出跳过整屏上传）→ 原样直画。
        const warped = this._waveCss && !this.isCpuRender() && waterWaves.quality > 0
          && (!Renderer.dryWarpSkip || this._waveLiquidInView)
          ? this.waterWarp.applyFullScreen(gl.canvas, this._waveCss,
            this.atlas?.ensureVImage('vanilla/Misc_noise.png') ?? null)
          : null;
        this.ctx.drawImage(warped ?? gl.canvas, 0, 0, viewW, viewH);   // 低清→全尺寸拉伸回填
        return;
      }
      const mctx = this.lightMaskCtxLayer;
      // ★满亮行旗【提前】到 getImageData 之前（2026-08-25 软渲染 trace：本回退分支
      //   6.2s/26.6s=23% 帧时，其中全屏 getImageData ~2.7ms/帧）。数据源同为
      //   img.data（光图本就在 CPU 内存），扫描先行不改变任何时序语义。
      //   ★全亮快路径：光图全 255 ⇒ 每行 rowWhite=255 ⇒ 下方面积乘循环对全部像素
      //   走恒等乘跳过（l=255·Σw，Σw=1±ulp，钳位写回舍回原值；α=0 格两路径均
      //   不落笔）⇒ putImageData 后 mask 与 worldCanvas 逐位相同 ⇒
      //   drawImage(mask) 与 drawImage(worldCanvas) 同 ctx 状态同结果。
      //   白天地表大面积命中整条读回-乘-写回链免掉。?lightfast=0 关（A/B 对拍）
      if (!this._clRowWhite || this._clRowWhite.length !== h2) {
        this._clRowWhite = new Uint8Array(h2);
      }
      const rowWhite = this._clRowWhite!;
      {
        const ld0 = img.data;
        let all = 255;
        for (let ry = 0; ry < h2; ry++) {
          let a = 255;
          const base = ry * w2 * 4;
          for (let k = 0; k < w2 * 4; k++) a &= ld0[base + k];
          rowWhite[ry] = a;
          all &= a;
        }
        if (Renderer.lightFast && all === 255) {
          this.ctx.drawImage(this.worldCanvas!, 0, 0);
          return;
        }
      }
      // ★CPU 逐像素精确乘（2026-08-20 史莱姆浊暗终案：Canvas multiply 三步法对
      //   半透明像素留 (1-αd)·光 洗色——PDF 混合的 Cs 项无法在 Canvas 2D 消去。
      //   光照数组与 lightCanvas 同源（4-tap 双线性），直接在 worldCanvas 像素上
      //   乘：out.rgb=rgb×光、α 原样（原版顶点色语义，与 GL 路径逐位一致）。
      //   ~1.3M px 全屏 ×4-tap ≈ 8-15ms/帧——仅 GL 不可用回退时承受）
      const wimg = this.worldCtxLayer!.getImageData(0, 0, viewW, viewH);
      const wd = wimg.data;
      const lxRatio = w2 / (tilesX * ts * z), lyRatio = h2 / (tilesY * ts * z);
      if (Renderer.legacyCpuMult) {
        // ?oldmult=1 逃生门：逐像素全重算旧循环（优化前基线，A/B 对拍用）
        for (let py = 0; py < viewH; py++) {
          let ly = (py - sy) * lyRatio;
          if (ly < 0) ly = 0; else if (ly > h2 - 1) ly = h2 - 1;
          const lyi = ly | 0;
          const lyj = Math.min(h2 - 1, lyi + 1), fy = ly - lyi;
          for (let px = 0; px < viewW; px++) {
            const i = (py * viewW + px) * 4;
            const a = wd[i + 3];
            if (a === 0) continue;                     // 纯透明区不乘（rgb 无意义）
            let lx = (px - sx) * lxRatio;
            if (lx < 0) lx = 0; else if (lx > w2 - 1) lx = w2 - 1;
            const lxi = lx | 0;
            const lxj = Math.min(w2 - 1, lxi + 1), fx2 = lx - lxi;
            const o00 = (lyi * w2 + lxi) * 4, o10 = (lyi * w2 + lxj) * 4;
            const o01 = (lyj * w2 + lxi) * 4, o11 = (lyj * w2 + lxj) * 4;
            const w00 = (1 - fx2) * (1 - fy), w10 = fx2 * (1 - fy);
            const w01 = (1 - fx2) * fy, w11 = fx2 * fy;
            for (let c = 0; c < 3; c++) {
              const l = img.data[o00 + c] * w00 + img.data[o10 + c] * w10
                + img.data[o01 + c] * w01 + img.data[o11 + c] * w11;
              wd[i + c] = Math.min(255, (wd[i + c] * l) / 255);
            }
          }
        }
      } else {
        // ★内循环外提（2026-08-22 软渲染瓶颈分析：本循环 ~5.7ms/帧=55% 帧时）：
        //   x 侧采样参数只依赖 px → 每帧预计算一次（原每像素重算 (px−sx)·ratio、
        //   钳位、|0、min、1−fx2 五步）；通道循环展开去 +c 寻址；img.data 提升
        //   局部变量；行基址 i+=4 递增。★全部算式保持原操作数与运算顺序 →
        //   输出逐位一致（w00=wx0*wy0 与原 (1-fx2)*(1-fy) 同操作数同单乘；
        //   Uint8ClampedArray 赋值的钳位+舍入语义原样）。
        const w2m1 = w2 - 1;
        if (!this._clXO || this._clXO.length !== viewW) {
          this._clXO = new Int32Array(viewW);
          this._clXO1 = new Int32Array(viewW);
          this._clWX0 = new Float64Array(viewW);
          this._clWX1 = new Float64Array(viewW);
        }
        const cXO = this._clXO!, cXO1 = this._clXO1!;
        const cWX0 = this._clWX0!, cWX1 = this._clWX1!;
        for (let px = 0; px < viewW; px++) {
          let lx = (px - sx) * lxRatio;
          if (lx < 0) lx = 0; else if (lx > w2m1) lx = w2m1;
          const lxi = lx | 0;
          cXO[px] = lxi * 4;
          cXO1[px] = Math.min(w2m1, lxi + 1) * 4;
          cWX0[px] = 1 - (lx - lxi);
          cWX1[px] = lx - lxi;
        }
      const ld = img.data;
      const h2m1 = h2 - 1;
      // ★满亮行旗已在 getImageData 前算好（本函数上方；数据源同为 img.data，
      //   行旗语义不变）：整行全 255 → 该行任意采样恒等乘 → 白天地表大面积
      //   行级跳过。★行级而非逐像素：夜晚/洞穴无满亮区时逐像素检查
      //   实测反慢 9%（微基准），行旗对无满亮场景零成本
      for (let py = 0; py < viewH; py++) {
        let ly = (py - sy) * lyRatio;
        if (ly < 0) ly = 0; else if (ly > h2m1) ly = h2m1;
        const lyi = ly | 0;
        const lyj = Math.min(h2m1, lyi + 1), fy = ly - lyi;
        const rowA = lyi * w2 * 4, rowB = lyj * w2 * 4;
        const wy0 = 1 - fy, wy1 = fy;
        const skipRow = rowWhite[lyi] === 255 && rowWhite[lyj] === 255;
        let i = py * viewW * 4;
        if (skipRow) continue;         // 双 tap 行全满亮 → 整行恒等乘，直接跳过
        for (let px = 0; px < viewW; px++, i += 4) {
          const a = wd[i + 3];
          if (a === 0) continue;                     // 纯透明区不乘（rgb 无意义）
          const o00 = rowA + cXO[px], o10 = rowA + cXO1[px];
          const o01 = rowB + cXO[px], o11 = rowB + cXO1[px];
          const wx0 = cWX0[px], wx1 = cWX1[px];
          const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
          let l = ld[o00] * w00 + ld[o10] * w10 + ld[o01] * w01 + ld[o11] * w11;
          wd[i] = Math.min(255, (wd[i] * l) / 255);
          l = ld[o00 + 1] * w00 + ld[o10 + 1] * w10 + ld[o01 + 1] * w01 + ld[o11 + 1] * w11;
          wd[i + 1] = Math.min(255, (wd[i + 1] * l) / 255);
          l = ld[o00 + 2] * w00 + ld[o10 + 2] * w10 + ld[o01 + 2] * w01 + ld[o11 + 2] * w11;
          wd[i + 2] = Math.min(255, (wd[i + 2] * l) / 255);
        }
      }
      }
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'source-over';
      mctx.putImageData(wimg, 0, 0);
      this.ctx.drawImage(this.lightMaskCanvas!, 0, 0);
      return;
    }
    // ==== 默认路径（★2026-08-20 定案回归的稳定基线）：全屏乘光 ====
    // 夜月亮注入（唯一新增,修"夜里的月亮不亮"）:原版月亮直绘 backbuffer
    // 不吃乘光(Main.cs:61516 日月画在天空层);全屏乘光把月亮压到月光地板
    // (~0.075)。在光照图上以月盘屏位注入满月光斑——月盘区乘法≈恒等=恢复
    // 原色,外圈 2.2×半径自然月光晕;天空其余/地面/实体路径零改动
    const mg = this.sky.moonScreen;
    if (mg) {
      const lwDev = tilesX * ts * z, lhDev = tilesY * ts * z;
      const gx = (mg.x - sx) / lwDev * w2;
      const gy = (mg.y - sy) / lhDev * h2;
      const gr = Math.max(4, mg.r / lwDev * w2);
      // ★halo 只保月盘本体(2026-08-21 方片异常修复):曾外圈 2.2gr 大晕——渐变带
      //   α<255 像素经 multiply 的 PDF 混合产生洗色+α 膨胀,视觉边界停在 α≈0 处
      //   = 巨大半透明"方片"(fillRect 方形边界,用户两份报告逐像素实证:光图
      //   19.9..72.7 → 屏幕 227..835 吻合)。收窄到月盘内+渐变带 ≤1.5 光图px
      //   (拉伸后亚屏幕像素),硬边不可见;月光【照明】本来就走 skySeed 全场分量,
      //   局部大晕是自造语义,砍掉无回归。
      if (gx > -gr * 1.2 && gy > -gr * 1.2 && gx < w2 + gr * 1.2 && gy < h2 + gr * 1.2) {
        const halo = lc.createRadialGradient(gx, gy, gr * 0.55, gx, gy, gr * 1.05);
        halo.addColorStop(0, 'rgba(255,255,255,1)');
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        lc.fillStyle = halo;
        lc.fillRect(gx - gr * 1.05, gy - gr * 1.05, gr * 2.1, gr * 2.1);
      }
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightCanvas, sx, sy, tilesX * ts * z, tilesY * ts * z);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 原版小地图框（MinimapFrame/MinimapFrameManager 1:1，9 皮肤） ----
  // DrawBackground: MinimapPosition-6 处 244×244 黑底（不随皮肤变）；DrawForeground: 整张
  // 框贴图（尺寸随皮肤 252×256..272×270）画在 MinimapPosition+frameOffset；按钮(18×18)
  // 仅悬停时显示（IsHighlighted）。皮肤=客户端选项 config.json "MinimapFrame"（:11-19），
  // 9 款皮肤零代码分支差异，只有 frameOffset + 按钮位（MinimapFrameManager.cs:32-42）。
  /** 皮肤元数据（frameOffset=框贴图左上相对 MinimapPosition 偏移；按钮位相对 FramePosition） */
  private static readonly MINIMAP_SKINS: Record<string, { fo: readonly [number, number]; reset: readonly [number, number]; zoomIn: readonly [number, number]; zoomOut: readonly [number, number] }> = {
    Default:  { fo: [-8, -15],  reset: [150, 240], zoomIn: [202, 240], zoomOut: [176, 240] },
    Golden:   { fo: [-10, -10], reset: [136, 248], zoomIn: [96, 248],  zoomOut: [116, 248] },
    Remix:    { fo: [-10, -10], reset: [200, 234], zoomIn: [148, 234], zoomOut: [174, 234] },
    Sticks:   { fo: [-10, -10], reset: [148, 234], zoomIn: [200, 234], zoomOut: [174, 234] },
    StoneGold:{ fo: [-15, -15], reset: [220, 244], zoomIn: [244, 188], zoomOut: [244, 216] },
    TwigLeaf: { fo: [-20, -20], reset: [206, 242], zoomIn: [162, 242], zoomOut: [184, 242] },
    Leaf:     { fo: [-20, -20], reset: [212, 244], zoomIn: [168, 246], zoomOut: [190, 246] },
    Retro:    { fo: [-10, -10], reset: [150, 236], zoomIn: [202, 236], zoomOut: [176, 236] },
    Valkyrie: { fo: [-10, -10], reset: [154, 242], zoomIn: [206, 240], zoomOut: [180, 244] },
  };
  /** 选中皮肤的 4 张贴图（懒加载缓存，切皮肤自动换批）。bitmap-only：未就绪槽
   *  为 null，minimapSkinAssets 每次调用补查（在飞守卫防重发） */
  private minimapSkinTex = new Map<string, Partial<Record<'frame' | 'reset' | 'zoomIn' | 'zoomOut', ImageBitmap | HTMLImageElement>>>();
  private minimapSkinAssets(): { skin: typeof Renderer.MINIMAP_SKINS[string]; tex: Partial<Record<'frame' | 'reset' | 'zoomIn' | 'zoomOut', ImageBitmap | HTMLImageElement>> } {
    const name = Renderer.MINIMAP_SKINS[options.data.minimapFrame] ? options.data.minimapFrame : 'Default';
    let tex = this.minimapSkinTex.get(name);
    if (!tex) { tex = {}; this.minimapSkinTex.set(name, tex); }
    const want: Record<'frame' | 'reset' | 'zoomIn' | 'zoomOut', string> = {
      frame: `UI_Minimap_${name}_MinimapFrame`,
      reset: `UI_Minimap_${name}_MinimapButton_Reset`,
      zoomIn: `UI_Minimap_${name}_MinimapButton_ZoomIn`,
      zoomOut: `UI_Minimap_${name}_MinimapButton_ZoomOut`,
    };
    for (const k of Object.keys(want) as Array<'frame' | 'reset' | 'zoomIn' | 'zoomOut'>) {
      if (!tex[k]) { const v = this.loadUiTex(want[k]); if (v) tex[k] = v; }
    }
    return { skin: Renderer.MINIMAP_SKINS[name], tex };
  }
  /** 小地图缩放（原版 mapMinimapScale，默认 1.05；钳 0.2..3，Main.cs:54953-54959） */
  minimapZoom = 1.05;
  /** 本帧鼠标悬停在小地图框按钮上（Game 据此拦下"点地图开全屏"）——原版 mouseInterface 语义 */
  minimapUiHover = false;
  /** 时间调整面板开关（时间文本旁 ± 按钮切换） */
  timePanelOpen = false;
  /** 天气面板开合 + 命中上报（同 timeUiHover 模式，Game 吞点击用） */
  weatherPanelOpen = false;
  weatherUiHover = false;
  /** 天气预设回调（Game.applyWeatherPreset 注入；name = clear/cloudy/.../random） */
  weatherPreset: ((name: string) => void) | null = null;
  /** 本帧指针位于时间按钮/面板上（渲染期写入、下帧 Game 消费：吞掉挖掘/放置/攻击点击） */
  timeUiHover = false;
  /** UI 点击边沿检测（render 存 _mouseDown，drawMinimap 末尾更新） */
  private _uiPrevMouseDown = false;

  /** UI 贴图 bitmap-only 缓存（loadBitmapOnly：在飞守卫 + 失败回退 Image 永不缺图）。
   *  未就绪返回 null（消费方跳帧自愈）。★旧版返回 Image 且升级位图被丢弃——
   *  小地图框等每帧 HUD 绘制持 Image，解码位图被逐出时反复 LazyPixelRef
   *  （trace 2026-08-18 残余流 ~500/s×4s 的主源） */
  private uiTexCache = new Map<string, ImageBitmap | HTMLImageElement>();
  private loadUiTex(name: string): ImageBitmap | HTMLImageElement | null {
    const hit = this.uiTexCache.get(name);
    if (hit) return hit;
    loadBitmapOnly(`vanilla-ui/${name}.png`,
      () => this.uiTexCache.has(name),
      (v) => this.uiTexCache.set(name, v));
    return null;
  }

  /** 洞穴探险/危险感/狩猎/群系视觉 tile 高亮集（TILE_DEFS key 启发式，模块级缓存） */
  private static HIGHLIGHT_SETS = (() => {
    const spelunker = new Set<number>(), danger = new Set<number>(), biome = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const k = TILE_DEFS[i]?.key ?? '';
      if (/ore_|gem|fossil|v_\d+_.*gem|crystal/i.test(k)) spelunker.add(i);
      if (/spike|dart_trap|boulder|landmine|geyser|flame_trap|v_21[3-9]|v_137|v_138|v_139|v_140/i.test(k)) danger.add(i);
      if (/corrupt|crimson|ebon|crims|hallow|pearl/i.test(k)) biome.add(i);
    }
    return { spelunker, danger, biome };
  })();

  /** R3 视觉 Buff 高亮叠层：Spelunker(9)/Dangersense(111)/Hunter(17)/BiomeSight(343) */
  private drawBuffHighlights(
    ctx: CanvasRenderingContext2D, world: World, player: Player,
    cam: Camera, viewW: number, viewH: number, z: number, ts: number,
    entities: Entity[] = [],
  ) {
    const buffs = player.buffs;
    const spel = buffs.has(BuffType.Spelunker);
    const dang = buffs.has(BuffType.Dangersense);
    const biomeS = buffs.has(BuffType.BiomeSight);
    const hunter = buffs.has(BuffType.Hunter);
    if (!spel && !dang && !biomeS && !hunter) return;
    const st = world.store;
    const pulse = 0.22 + 0.14 * Math.sin(performance.now() / 180);
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts) - 1);
    const tx1 = Math.min(st.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts) - 1);
    const ty1 = Math.min(st.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts) + 1);
    ctx.globalAlpha = pulse;
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (spel && Renderer.HIGHLIGHT_SETS.spelunker.has(t)) {
          ctx.fillStyle = '#FFC419';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        } else if (dang && Renderer.HIGHLIGHT_SETS.danger.has(t)) {
          ctx.fillStyle = '#FF4040';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        } else if (biomeS && Renderer.HIGHLIGHT_SETS.biome.has(t)) {
          ctx.fillStyle = '#C060FF';
          ctx.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Hunter 药水（Player.cs:9719 detectCreature——屏内小动物+敌怪画红框,2026-08-13 接）
    if (hunter) {
      const pulseH = 0.35 + 0.15 * Math.sin(performance.now() / 200);
      ctx.globalAlpha = pulseH;
      ctx.strokeStyle = '#FF6060';
      ctx.lineWidth = 1.5;
      const camLeft = cam.x - viewW / 2 / z, camTop = cam.y - viewH / 2 / z;
      for (const ent of entities) {
        if ((ent as { dead?: boolean }).dead) continue;
        const e = ent as { x: number; y: number; w: number; h: number };
        ctx.strokeRect((e.x - camLeft) * z, (e.y - camTop) * z, e.w * z, e.h * z);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** 小地图节流游标(mapTimeMax 语义,Main.cs:16941-16945;q≥0.8 → 0 = 每帧) */
  private _lastMapFlush = 0;
  /** HUD 缩略图小窗画布(CPU pix → ≤512² GPU 画布;迷雾逐像素合成) */
  private _mmHudCanvas: HTMLCanvasElement | null = null;
  private _mmHudCtx: CanvasRenderingContext2D | null = null;
  private _mmHudImg: ImageData | null = null;
  private mmHudBlit(world: World, sx: number, sy: number, viewTiles: number): HTMLCanvasElement | null {
    const mm = this.minimap;
    if (!mm?.pix || !mm.p32) return null;
    // ≤512 上限:极低缩放(视窗 >512 tile)时按步长最近邻抽样(小地图本就近邻渲染)
    const cap = 512;
    const step = viewTiles > cap ? viewTiles / cap : 1;
    const size = Math.min(cap, viewTiles);
    const sizeI = Math.ceil(size);
    if (!this._mmHudCanvas) {
      this._mmHudCanvas = document.createElement('canvas');
      this._mmHudCtx = this._mmHudCanvas.getContext('2d')!;
    }
    if (this._mmHudCanvas.width !== sizeI) {
      this._mmHudCanvas.width = sizeI;
      this._mmHudCanvas.height = sizeI;
      this._mmHudImg = this._mmHudCtx!.createImageData(sizeI, sizeI);
    }
    const dst = new Uint32Array(this._mmHudImg!.data.buffer);
    const src = mm.p32;
    const fog = this.fogP32;               // 迷雾 CPU 缓冲(可能 null=无探索数据)
    const fogW = this.fogW;
    const FOG = 0xff080505;                // 小端 ABGR (5,5,8,255)
    for (let y = 0; y < sizeI; y++) {
      const my = Math.min(mm.h - 1, sy + Math.floor(y * step));
      const rowOff = my * mm.w;
      const dRow = y * sizeI;
      for (let x = 0; x < sizeI; x++) {
        const mx = Math.min(mm.w - 1, sx + Math.floor(x * step));
        let c = src[rowOff + mx];
        if (fog) {
          const fi = (my >> 1) * fogW + (mx >> 1);
          if (fog[fi] !== 0) c = FOG;      // 未探索 → 迷雾色(与旧 drawFog 像素一致)
        }
        dst[dRow + x] = c;
      }
    }
    this._mmHudCtx!.putImageData(this._mmHudImg!, 0, 0);
    return this._mmHudCanvas;
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player, clock: Clock, entities: Entity[] = []) {
    if (!this.minimap) return;
    // mapStyle 门（Main.cs:54941 else-if 链：mapStyle==1 才画小地图；0=隐藏/2=覆盖式
    // 另走 drawMapOverlay）。隐藏时上报零矩形 + 清 UI 悬停（Game 小地图点击检测不命中）
    if (this.mapStyle !== 1) {
      this.minimapRect = { x: -1, y: -1, w: 0, h: 0 };
      this.minimapUiHover = false;
      return;
    }
    // 透明度钳（Main.cs:54961-54968：活值越界原地夹回 [0.01,1]）
    this.minimapAlpha = Math.min(1, Math.max(0.01, this.minimapAlpha));
    const now = performance.now();
    if (now - this._lastMapFlush >= mapUpdateMinIntervalMs()) {
      this._lastMapFlush = now;
      }
    // 移动端整体缩小（右锚缩放变换：小地图+框+按钮+时间文字同尺度；
    // 桌面 uiS=1 → 与原实现逐像素一致）
    const uiS = mobileUiScale();
    ctx.save();
    if (uiS !== 1) {
      ctx.translate(ctx.canvas.width, 0);
      ctx.scale(uiS, uiS);
      ctx.translate(-ctx.canvas.width, 0);
    }
    // 屏幕鼠标 → 本变换局部坐标（右锚缩放逆变换；uiS=1 恒等——桌面零影响）
    const lmX = (sx: number) => (uiS === 1 ? sx : ctx.canvas.width - (ctx.canvas.width - sx) / uiS);
    const lmY = (sy: number) => (uiS === 1 ? sy : sy / uiS);
    const size = 240;                 // 放大
    // 原版锚点（Main.cs:54696-54706 UpdateMinimapAnchors + 54944-54949，MapScale=1）：
    // miniMapX = screenWidth - (52+240) = 屏宽-292，miniMapY = 90
    // —— 让位右上角生命/魔力资源条（心行 y≤80、星列 x≈屏宽-25）
    // T3(手机竖屏):hotbar 两行五列占顶部 ~110px——minimap 锚点局部下移到其下
    // (屏幕 y≈121px),防 canvas HUD 与 DOM hotbar 纵向争顶;桌面/T2 几何不变
    const oy = hudTier() === 't3' ? 196 : 90;
    const ox = ctx.canvas.width - size - 52;
    // 原版取景：num14/15 = miniMapWidth/scale —— 正方形窗口（此前按世界纵横比压扁，非原版）
    const viewTiles = Math.max(40, Math.round(size / this.minimapZoom));
    const px = player.cx / TILE, py = player.cy / TILE;
    const sx = Math.max(0, Math.min(world.w - viewTiles, Math.floor(px - viewTiles / 2)));
    const sy = Math.max(0, Math.min(world.h - viewTiles, Math.floor(py - viewTiles / 2)));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 框底黑垫（MinimapFrame.DrawBackground：MinimapPosition=(ox+4,oy+4)，-6 → 244×244 黑 * mapMinimapAlpha :179）
    ctx.fillStyle = `rgba(0,0,0,${this.minimapAlpha})`;
    ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    // 迷雾数据推进(★CPU 化遗漏:旧 drawFog 在 HUD 路径每帧调 getFogCanvas
    // 推进分带重建;改造后 ensureFogData 只在全屏地图被调,HUD 路径没人建
    // 迷雾 = 入场全图无雾(用户实报)。此处补推:每帧调一次,脏矩形/分带
    // 逻辑内建,首帧全雾,探索即增量清)
    this.ensureFogData(world);
    // 地图内容+迷雾合成(CPU pix blit ≤512² 小窗 + 迷雾逐像素合成)——
    // 内容与头像层 × mapMinimapAlpha（b=255×α，Main.cs:54970 MapRenderer/heads 同乘）
    ctx.globalAlpha = this.minimapAlpha;
    const hud = this.mmHudBlit(world, sx, sy, viewTiles);
    if (hud) ctx.drawImage(hud, ox, oy, size, size);
    // 头像层(原版 mapStyle1 支 :55140 + DrawNPCMapIcons2 :55602):玩家头/城镇 NPC 头/
    // Boss 头;headScale=min(1,(minimapZoom×0.5+1)/3)×UIScale(mapMinimapScale=1.05 :890;
    // 原写死 0.47 不随缩放且漏 UIScale≈1.1)。裁剪到小地图框内——窗口外实体头像不外溢
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, size, size);
    ctx.clip();
    this.drawMapHeads(ctx, player, Math.min(1, (this.minimapZoom * 0.25 * 2 + 1) / 3) * 1.1,
      (wx) => ox + (wx / TILE - sx) / viewTiles * size,
      (wy) => oy + (wy / TILE - sy) / viewTiles * size,
      entities.filter((e) => e instanceof TownNPC) as TownNPC[],
      entities.filter((e) => e instanceof Enemy) as Enemy[], world,
      this.remotePlayers);
    ctx.restore();
    ctx.globalAlpha = 1;   // 框前景/按钮/时间文字不随 α（MinimapFrame.cs:182-188 恒 White）
    // 框前景（MinimapFrame.DrawForeground：FramePosition = MinimapPosition + frameOffset——随皮肤）
    const { skin, tex } = this.minimapSkinAssets();
    const fx = ox + 4 + skin.fo[0], fy = oy + 4 + skin.fo[1];
    if (tex.frame && tex.frame.width > 0) ctx.drawImage(tex.frame, fx, fy);
    // 按钮：悬停高亮 + 按住生效（MinimapFrame.Update/Click：mouseLeft 持续，×1.025/0.975 步进）
    this.minimapUiHover = false;
    const btns: Array<[ImageBitmap | HTMLImageElement | undefined, readonly [number, number], 'in' | 'out' | 'reset']> = [
      [tex.zoomIn, skin.zoomIn, 'in'],
      [tex.zoomOut, skin.zoomOut, 'out'],
      [tex.reset, skin.reset, 'reset'],
    ];
    for (const [tex, [bx, by], kind] of btns) {
      const cx = fx + bx + 9, cy = fy + by + 9; // 中心；命中盒 22×22（IsTouchingPoint 取 max(size,22)）
      const hovering = Math.abs(lmX(this._mouseX) - cx) < 11 && Math.abs(lmY(this._mouseY) - cy) < 11;
      if (!hovering || !tex || !(tex.width > 0)) continue;
      this.minimapUiHover = true;
      ctx.drawImage(tex, fx + bx, fy + by);
      if (this._mouseDown) {
        if (kind === 'in') this.minimapZoom = Math.min(3, this.minimapZoom * 1.025);
        else if (kind === 'out') this.minimapZoom = Math.max(0.2, this.minimapZoom * 0.975);
        else this.minimapZoom = 1.05;
      }
    }
    // 记录小地图区域供点击检测（黑垫外沿）
    this.minimapRect = {
      x: uiS === 1 ? ox - 2 : ctx.canvas.width - (ctx.canvas.width - (ox - 2)) * uiS,
      y: uiS === 1 ? oy - 2 : (oy - 2) * uiS,
      w: (size + 4) * uiS, h: (size + 4) * uiS,
    };
    // 时间/天气文本【全量退役 2026-08-24】:原版小地图下无任何常驻文本——
    // 时间/天气行由信息饰品列(render/InfoAccsLayer = DrawInfoAccs)按表/天气电台
    // 门禁逐行显示(原版格式+图标,列位在小地图框之下)。此处的自造时间/天气行
    // 与信息列重复(2026-08-13 曾门禁化,今随信息列 +261 几何修正一并退役)。
    // ±/⛅ 沙盒调整面板保留(非原版,调试便利)。
    // ---- \u65f6\u95f4\u8c03\u6574\u6309\u94ae + \u9762\u677f\uff08\u00b1 \u5207\u6362\uff1b\u547d\u4e2d\u533a\u6574\u4f53\u4e0a\u62a5 timeUiHover \u4f9b Game \u541e\u70b9\u51fb\uff09 ----
    // (\u66fe\u4f9d\u8d56\u4e0a\u65b9\u5df2\u9000\u5f79\u65f6\u95f4\u6587\u672c\u5757\u8bbe\u7f6e\u7684 textAlign='center'\u2014\u2014\u6309\u94ae/\u9762\u677f\u6587\u5b57\u9700\u5c45\u4e2d)
    ctx.textAlign = 'center';
    const mx = lmX(this._mouseX), my = lmY(this._mouseY);
    const clicked = this._mouseDown && !this._uiPrevMouseDown; // \u6309\u4e0b\u8fb9\u6cbf\uff08\u4e0e\u7f29\u653e\u6309\u94ae\u7684\u6301\u7eed\u6309\u4f4f\u533a\u5206\uff09
    const hit = (x: number, y: number, w: number, h: number) =>
      mx >= x && mx <= x + w && my >= y && my <= y + h;
    const btnX = ox + size - 22, btnY = oy + 252, btnS = 20;
    // ★2026-09-02 用户要求：按钮迁入背包 2×4 钮格（UI 侧 DOM 钮,开同一面板）——
    //   背包打开时画布按钮不再绘制（防双份）;面板本体（若已开）照常绘制/可交互
    const hudBtns = !this.playerInventory;
    const btnHover = hudBtns && hit(btnX, btnY, btnS, btnS);
    this.timeUiHover = btnHover || (this.timePanelOpen && hit(ox, oy + 276, size, 64));
    if (hudBtns) {
      ctx.fillStyle = btnHover ? 'rgba(90,110,180,0.95)' : 'rgba(20,26,60,0.85)';
      ctx.fillRect(btnX, btnY, btnS, btnS);
      ctx.strokeStyle = btnHover ? '#ffd76e' : '#4a5aa0';
      ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnS - 1, btnS - 1);
      ctx.fillStyle = '#e8e8f4';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('\u00b1', btnX + btnS / 2, btnY + 15);
      if (clicked && btnHover) {
        // ★首用确认门（2026-08-27 用户要求,同道具搜索）：未确认 → 弹窗明示超游
        //   风险,确认后 localStorage 持久放行且本次即开面板；已确认 → 直接开合
        showJourneyQuickGate('time', () => { this.timePanelOpen = !this.timePanelOpen; });
      }
    }
    if (this.timePanelOpen) {
      const px = ox, py = oy + 276, pw = size, ph = 64;
      ctx.fillStyle = 'rgba(8,10,26,0.92)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#4a5aa0';
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      // \u5c0f\u6309\u94ae\u76d2\uff1a\u60ac\u505c\u9ad8\u4eae + \u70b9\u51fb\u52a8\u4f5c
      const box = (x: number, y: number, w: number, h: number, label: string, act: () => void) => {
        const hov = hit(x, y, w, h);
        ctx.fillStyle = hov ? '#3a4680' : '#232c52';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = hov ? '#ffd76e' : '#3a4680';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#e8e8f4';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, x + w / 2, y + h / 2 + 4);
        if (clicked && hov) act();
      };
      const setT = (t: number) => { clock.timeOfDay = ((t % 1) + 1) % 1; };
      box(px + 8, py + 8, 76, 22, '\u2212 1 \u5c0f\u65f6', () => setT(clock.timeOfDay - 1 / 24));
      ctx.fillStyle = '#9aa2cc';
      ctx.font = '12px sans-serif';
      ctx.fillText(`\u7b2c ${clock.dayCount} \u5929`, px + pw / 2, py + 23);
      box(px + pw - 84, py + 8, 76, 22, '+ 1 \u5c0f\u65f6', () => setT(clock.timeOfDay + 1 / 24));
      // \u5feb\u6377\u9884\u8bbe\uff08clock \u8bed\u4e49\uff1a0=\u5348\u591c 0.25=06:00 0.5=\u6b63\u5348 0.75=18:00\uff09\u3002
      // \u9ec4\u660f\u987b\u7528\u663c\u591c\u8fb9\u754c DUSK=0.8125\uff0819:30,\u539f\u7248 StartNightImmediately \u540c\u951a\uff09\u2014\u2014
      // \u66fe\u5199 0.73(17:31) \u70b9\u5b8c\u5929\u8fd8\u4eae\u7740\uff08type-only import,\u5e38\u91cf\u843d\u5b57\u9762\u91cf\uff09
      const presets: Array<[string, number]> = [['\u6e05\u6668', 0.27], ['\u6b63\u5348', 0.5], ['\u9ec4\u660f', 0.8125], ['\u5348\u591c', 0.0]];
      presets.forEach(([label, t], i) => {
        box(px + 10 + i * 56, py + 38, 52, 20, label, () => setT(t));
      });
    }

    // ---- 天气调整按钮 + 面板（同时间按钮模式；预设回调由 Game 注入 weatherPreset） ----
    const wBtnX = ox + size - 46, wBtnY = oy + 252;
    const wBtnHover = hudBtns && hit(wBtnX, wBtnY, btnS, btnS);
    const wPanelY = oy + 276 + (this.timePanelOpen ? 72 : 0);
    const wPanelH = 112;
    this.weatherUiHover = wBtnHover || (this.weatherPanelOpen && hit(ox, wPanelY, size, wPanelH));
    if (hudBtns) {
      ctx.fillStyle = wBtnHover ? 'rgba(90,110,180,0.95)' : 'rgba(20,26,60,0.85)';
      ctx.fillRect(wBtnX, wBtnY, btnS, btnS);
      ctx.strokeStyle = wBtnHover ? '#ffd76e' : '#4a5aa0';
      ctx.strokeRect(wBtnX + 0.5, wBtnY + 0.5, btnS - 1, btnS - 1);
      ctx.fillStyle = '#e8e8f4';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('⛅', wBtnX + btnS / 2, wBtnY + 15);
      if (clicked && wBtnHover) {
        showJourneyQuickGate('weather', () => { this.weatherPanelOpen = !this.weatherPanelOpen; });
      }
    }
    if (this.weatherPanelOpen) {
      const px2 = ox, py2 = wPanelY, pw2 = size;
      ctx.fillStyle = 'rgba(8,10,26,0.92)';
      ctx.fillRect(px2, py2, pw2, wPanelH);
      ctx.strokeStyle = '#4a5aa0';
      ctx.strokeRect(px2 + 0.5, py2 + 0.5, pw2 - 1, wPanelH - 1);
      const box2 = (x: number, y: number, w2: number, h2: number, label: string, act: () => void) => {
        const hov = hit(x, y, w2, h2);
        ctx.fillStyle = hov ? '#3a4680' : '#232c52';
        ctx.fillRect(x, y, w2, h2);
        ctx.strokeStyle = hov ? '#ffd76e' : '#3a4680';
        ctx.strokeRect(x + 0.5, y + 0.5, w2 - 1, h2 - 1);
        ctx.fillStyle = '#e8e8f4';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, x + w2 / 2, y + h2 / 2 + 4);
        if (clicked && hov) act();
      };
      const presetsW: Array<[string, string]> = [
        ['晴朗', 'clear'], ['多云', 'cloudy'], ['小雨', 'lightrain'], ['大雨', 'heavyrain'],
        ['风暴', 'storm'], ['沙尘暴', 'sandstorm'], ['史莱姆雨', 'slimerain'], ['随机', 'random'],
      ];
      presetsW.forEach(([label, name], i) => {
        const col = i % 4, row = Math.floor(i / 4);
        box2(px2 + 10 + col * 56, py2 + 10 + row * 26, 52, 22, label, () => this.weatherPreset?.(name));
      });
      // 风力调节（±0.2，钳 ±0.8）
      const wd = world.weather;
      if (wd) {
        box2(px2 + 10, py2 + 64, 100, 20, `风 ${Math.round(wd.windSpeedTarget * 100) / 100}`, () => {});
        box2(px2 + 8, py2 + 88, 52, 18, '− 风', () => { wd.windSpeedTarget = Math.max(-0.8, wd.windSpeedTarget - 0.2); });
        box2(px2 + pw2 - 60, py2 + 88, 52, 18, '+ 风', () => { wd.windSpeedTarget = Math.min(0.8, wd.windSpeedTarget + 0.2); });
      }
    }
    this._uiPrevMouseDown = this._mouseDown;
    ctx.restore();
    ctx.restore(); // 移动端缩放变换（uiS=1 时为空 save/restore，恒等）
  }

  /** 迷雾遮罩：未探索区域黑色覆盖（世界坐标 → 目标矩形） */
  // 迷雾缓存：探索版本号变化时才重绘半分辨率画布（避免每帧百万格循环卡顿）。
  // 增量更新（2026-08-10，修 wld 导入白屏崩溃）：markExplored 只 bump 真正点亮新格的
  // 版本并给出脏包围盒 → 此处仅对脏区（雾坐标 ~14×14 块）putImageData。
  // 旧版每 15 tick 无条件整幅重建 4200×1200（20MB createImageData + 500 万格循环 ≈
  // 672ms 长任务），首次导入大世界时每秒 4 次 × 20MB 垃圾 → GC 风暴 → 白屏闪烁 + OOM
  /** 迷雾 CPU 缓冲(2026-08-18 GPU 瘦身:曾是 20MB GPU 画布;像素 = 未探索
   *  (5,5,8,255)/探索 0(透明),2×2 tile 一像素) */
  private fogPix: Uint8ClampedArray | null = null;
  private fogP32: Uint32Array | null = null;
  private fogImage: ImageData | null = null;
  private fogW = 0;
  private fogH = 0;
  private fogVersion = -1;
  /** GL 迷雾纹理已上传到的行带游标(稳定键增量上传) */
  private _mapFogRowSeen = -1;
  /** 2D 回退全屏地图的临时整幅画布(开图期持有,关图释放) */
  private _fm2dMap: HTMLCanvasElement | null = null;
  private _fm2dFog: HTMLCanvasElement | null = null;
  private _fm2dFogRowSeen = 0;
  private _fmWasOpen = false;
  /** 整幅重建的分帧行游标(0=未在重建) */
  private fogRebuildRow = 0;
  private fogWorld: World | null = null;
  /** 迷雾路径观测(探针/F5:整幅重建次数——应只在进场/换世界/F4;
   *  周期性增长 = 闪烁源) */
  fogFullRebuilds = 0;
  fogIncrUpdates = 0;
  /** 最近一次整幅重建入口快照(探针定位触发源) */
  fogFullWhy = '';

  /** 迷雾数据构建(原 getFogCanvas 的 CPU 版:脏矩形增量 + 分帧行带逻辑 1:1,
   *  落点从画布换 CPU 缓冲)。返回 ImageData(GL 上传源)或 null */
  private ensureFogData(world: World): ImageData | null {
    const ex = world.explored;
    if (!ex) return null;
    if (this.fogWorld !== world) { this.fogWorld = world; this.fogVersion = -1; this.fogRebuildRow = 0; }
    const st = world.store;
    const w = Math.ceil(st.w / 2), h = Math.ceil(st.h / 2);
    if (this.fogPix && this.fogVersion === world.exploredVersion) return this.fogImage;
    if (!this.fogPix || this.fogW !== w || this.fogH !== h) {
      const pix = new Uint8ClampedArray(w * h * 4);
      this.fogPix = pix;
      this.fogP32 = new Uint32Array(pix.buffer);
      this.fogW = w; this.fogH = h;
      this.fogImage = typeof ImageData !== 'undefined' ? new ImageData(pix, w, h) : null;
      this.fogRebuildRow = 0;
    }
    const buf = this.fogP32!;
    const FOG = 0xff080505;
    // 脏盒双向重扫（幂等：纯 ex 现值的函数）。增量路径与整幅完成兜底共用。
    // ★双向写:未探索=FOG,已探索=0(清雾)。旧 canvas 版用全新 ImageData
    // (全零)+putImageData 隐式清了探索区;CPU 直写共享缓冲后漏了 else
    // 分支 → 新探索格保持旧 FOG 值 = 迷雾不清(用户实报 10 秒延迟)
    const applyDirty = (): boolean => {
      const d = world.exploredDirty;
      if (!d) return false;
      const bx0 = Math.max(0, d.x0 >> 1), by0 = Math.max(0, d.y0 >> 1);
      const bx1 = Math.min(w - 1, d.x1 >> 1), by1 = Math.min(h - 1, d.y1 >> 1);
      const dw = bx1 - bx0 + 1, dh = by1 - by0 + 1;
      if (dw <= 0 || dh <= 0) return false;
      for (let by = 0; by < dh; by++) {
        for (let bx = 0; bx < dw; bx++) {
          const x0 = (bx0 + bx) * 2, y0 = (by0 + by) * 2;
          let seen = false;
          for (let dy = 0; dy < 2 && !seen; dy++) for (let dx = 0; dx < 2; dx++) {
            const xx = x0 + dx, yy = y0 + dy;
            if (xx < st.w && yy < st.h && ex[yy * st.w + xx]) { seen = true; break; }
          }
          buf[(by0 + by) * w + (bx0 + bx)] = seen ? 0 : FOG;
        }
      }
      return true;
    };
    // 脏矩形增量(有缓冲 + 有脏包围盒 → 只更新受影响块;全图点亮/首帧 → 整幅重建)
    const dirty = world.exploredDirty;
    if (this.fogVersion !== -1 && dirty) {
      if (applyDirty()) {
        world.exploredDirty = null;   // 吃掉脏盒：只留未消费的新标记（防盒随探索无限增长）
        this.fogVersion = world.exploredVersion;
        this.fogIncrUpdates++;
        return this.fogImage;
      }
    }
    // 整幅重建(首帧/全图点亮/版本跳跃):分帧行带摊帧
    // ★row 完成态(=h)必须复位(2026-08-19 用户实报 F4 失效):完成后 row 停在
    //   h,下次整幅入口 row≠0 → 分带循环零迭代 → 9868 直接落版本 = "空同步",
    //   F4/版本跳跃被静默吞掉
    if (this.fogRebuildRow >= h) this.fogRebuildRow = 0;
    this.fogFullWhy = `row=${this.fogRebuildRow} dirty=${dirty ? 'y' : 'n'} v=${world.exploredVersion} fv=${this.fogVersion}`;
    if (this.fogRebuildRow === 0) this.fogFullRebuilds++;
    // ★不清零缓冲(2026-08-19 用户实报雾闪):旧版 row===0 时 fill(0) = 全图
    //   全亮一闪再 5 帧扫回(20s 看门狗误清 fogPix 时周期触发)。分带循环改
    //   双向写(seen?0:FOG),扫到哪改哪——新缓冲天然全 0,旧缓冲逐带纠正,
    //   重建期无全亮帧
    const ROWS = 120;
    const yEnd = Math.min(h, this.fogRebuildRow + ROWS);
    for (let by = this.fogRebuildRow; by < yEnd; by++) {
      const rowOff = by * w;
      for (let bx = 0; bx < w; bx++) {
        const x0 = bx * 2, y0 = by * 2;
        let seen = false;
        for (let dy = 0; dy < 2 && !seen; dy++) for (let dx = 0; dx < 2; dx++) {
          const xx = x0 + dx, yy = y0 + dy;
          if (xx < st.w && yy < st.h && ex[yy * st.w + xx]) { seen = true; break; }
        }
        buf[rowOff + bx] = seen ? 0 : FOG;   // 双向写:探索清雾/未探索上雾
      }
    }
    this.fogRebuildRow = yEnd;
    if (yEnd >= h) {
      // ★完成兜底重扫（2026-08-19 用户实报"刚进世界视野未开，要走动才更新"根因）：
      //   整幅重建跨多帧（fogH/120 带），期间 markExplored（进图 tick0 标记出生点）
      //   可能点亮【已扫过的早行带】——早带按旧数据写完不再回头，完成却盲盖当前
      //   版本 → fv===v 早退把陈旧雾焊死，直到玩家移动 bump 版本走增量才修。
      //   dirty 盒 = 历次未消费标记的并集，完成时补扫一次即全修正（幂等）。
      if (applyDirty()) world.exploredDirty = null;
      this.fogVersion = world.exploredVersion;   // 完成才落版本(带重建期半新半旧可先用)
    }
    return this.fogImage;
  }


  /** 地图玩家标记：优先 Maples 主角帧（与游戏内形象一致），程序化仅兜底 */


  /** 地图头像层(原版 Main.DrawMap 的 DrawNPCMapIcons3/2 :55546+/:55602+ +
   *  MapPlayerRenderer.DrawPlayerHead :55158+):小地图与全屏地图共用。
   *  - 玩家头:纸娃娃 0 帧顶部裁头(原版画的是角色头层含发型/头盔,MapPlayerRenderer)
   *  - 城镇 NPC 头:NPC_Head_{TOWN_NPC_HEAD_INDEX},恒显(CanBeSeen_Townie=true :55756),
   *    朝向翻转(direction>0 → FlipHorizontally :55555)
   *  - Boss 头:NPC_Head_Boss_{BOSS_HEAD_INDEX},68/262 带 rotation(GetBossHeadRotation);
   *    世吞 134 的多段质心平均(:55575-55589)未接,画头段位置
   *  headScale:原版 = min(1,(scale×0.2×2+1)/3)(小地图 :55059)/ min(1,(scale×0.5+1)/3)
   *  (全屏 :55140) ×UIScale;头贴图原生 24×22。mapX/mapY = 世界 px → 本图 px。
   *  alpha 恒 1(原版 b=mapMinimapAlpha=255);迷雾不遮头像(townie 门恒真)。 */
  private drawMapHeads(
    ctx: CanvasRenderingContext2D, player: Player,
    headScale: number,
    mapX: (wx: number) => number, mapY: (wy: number) => number,
    npcs: TownNPC[], enemies: Enemy[],
    world: World | null = null,
    remotePlayers: Player[] = [],
    wormholeSlot: number | null = null,
  ) {
    if (!this.atlas) return;
    const drawHead = (img: CanvasImageSource | null, wx: number, wy: number,
      flip: boolean, rotation = 0, extra = 0, sw = 24, sh = 22,
      opts?: { scale?: number; border?: string | null }) => {
      if (!img) return;
      const x = mapX(wx), y = mapY(wy);
      ctx.save();
      ctx.translate(x, y);
      if (rotation) ctx.rotate(rotation);
      ctx.scale(opts?.scale ?? headScale, opts?.scale ?? headScale);
      if (flip) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      // 队伍色描边（MapHeadRenderer.CreateOutlines :101-148 1:1：黑外圈 8 向环
      // (|j|+|k|==2 ×2px) + 边框色内圈 4 向环 (×2px) 的纯色剪影，实心头最后盖上；
      // 描边色 ×alpha²（:112-116 color*=alpha*alpha——小地图半透明时描边更淡））
      if (opts?.border) {
        const a = ctx.globalAlpha;
        if (a < 1) ctx.globalAlpha = a * a;
        const sil = (color: string) => this.mapHeadSilhouette(img as CanvasImageSource, sw, sh, color);
        for (const [dx, dy] of [[-4, 0], [-2, -2], [0, -4], [2, -2], [4, 0], [2, 2], [0, 4], [-2, 2]]) {
          const s = sil('#000000');
          ctx.drawImage(s, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
        }
        for (const [dx, dy] of [[-2, 0], [0, -2], [2, 0], [0, 2]]) {
          const s = sil(opts.border);
          ctx.drawImage(s, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
        }
        ctx.globalAlpha = a;
      } else if (extra) {
        // 旧暗影描边（保留给非玩家头路径）
        ctx.globalAlpha = 0.35;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.drawImage(img as CanvasImageSource, 0, 0, sw, sh, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(img as CanvasImageSource, 0, 0, sw, sh, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    };
    // 玩家头描边色（GetPlayerHeadBordersColor Main.cs:56082-56097：死亡/幽灵透明、
    // 敌对异队透明、自己恒 teamColor[team]（netMode≠0）、余 teamColor[team]）
    const teamBorderCss = (team: number): string => {
      const tc = TEAM_COLORS[Math.max(0, Math.min(5, Math.trunc(team)))];
      return `rgb(${tc[0]},${tc[1]},${tc[2]})`;
    };
    const headBorder = (pl: Player, isSelf: boolean): string | null => {
      if (pl.dead) return null;
      if (!this.mapNetActive) return teamBorderCss(0);
      if (isSelf) return teamBorderCss(pl.team);
      if (pl.hostile && (pl.team !== player.team || pl.team === 0)) return null;
      return teamBorderCss(pl.team);
    };
    // 玩家头(原版 PlayerHeadDrawRenderTargetContent:发型/头盔全层的组合头,中心锚)。
    // 纸娃娃帧 0 顶部 40×32 裁头带(整宽+发冠带,24×22 会削发型——用户报"绘制不完整");
    // 无外观回退头贴图 0
    if (player.appearance) {
      const equip = dollEquipFromInv(player.inv) as { head?: number | null };
      // 发色剂激活：地图头带同样拆发层（40×32 裁头带按 后发→本体→前发→头甲 合成）
      const dyeColor = world ? this.hairDyeRenderColor(player, world, null) : null;
      const doll = compositePaperDoll(player.appearance, equip, dyeColor ? { skipHair: true } : undefined);
      if (doll) {
        let img: CanvasImageSource = doll;
        if (dyeColor) {
          const strip = this.playerHeadStrip(doll, player.appearance, equip?.head ?? 0, dyeColor);
          if (strip) img = strip;
        }
        drawHead(img, player.cx, player.cy, player.facing < 0, 0, 0, 40, 32,
          { border: headBorder(player, true) });
      } else return; // 纸娃娃未就绪:头像层整体等下一帧(原版头层贴图驱动同理)
    } else {
      drawHead(this.atlas.ensureVImage('vanilla/NPC_Head_0.png'), player.cx, player.cy, false, 0, 0,
        24, 22, { border: headBorder(player, true) });
    }
    // 远端玩家头（Main.cs:55378-55409 全屏 / :55156-55176 小地图同环）：CanBeSeen 门
    // (:55166-55182 = 非互敌恒见；双敌对同队非零队才见)。虫洞悬停目标（wormholeSlot）
    // 追加放大重画：scale+0.5、alpha 1、OurFavoriteColor(255,231,69) 金框
    // （:55415-55419——仅全屏地图；小地图 hover 原版只显名不放大，本仓未接显名，登记）
    for (const rp of remotePlayers) {
      if (rp.dead) continue;
      if (player.hostile && rp.hostile && !(player.team > 0 && player.team === rp.team)) continue;
      if (!rp.appearance) continue;
      const equip = dollEquipFromInv(rp.inv) as { head?: number | null };
      const dyeColor = world ? this.hairDyeRenderColor(rp, world, null) : null;
      const doll = compositePaperDoll(rp.appearance, equip, dyeColor ? { skipHair: true } : undefined);
      if (!doll) continue;
      let img: CanvasImageSource = doll;
      if (dyeColor) {
        const strip = this.playerHeadStrip(doll, rp.appearance, equip?.head ?? 0, dyeColor);
        if (strip) img = strip;
      }
      const slot = (rp as unknown as { __netSlot?: number }).__netSlot ?? -1;
      const hot = wormholeSlot !== null && slot === wormholeSlot;
      drawHead(img, rp.cx, rp.cy, rp.facing < 0, 0, 0, 40, 32, { border: headBorder(rp, false) });
      if (hot) {
        drawHead(img, rp.cx, rp.cy, rp.facing < 0, 0, 0, 40, 32,
          { scale: headScale + 0.5, border: 'rgb(255,231,69)' });
      }
    }
    // 城镇 NPC 头(恒显,不含 bound 态)
    for (const n of npcs) {
      if (n.dead || n.bound) continue;
      const headIdx = TOWN_NPC_HEAD_INDEX[n.vanillaId];
      if (headIdx === undefined) continue;
      drawHead(this.atlas.ensureVImage(`vanilla/NPC_Head_${headIdx}.png`), n.cx, n.cy, n.facing > 0);
    }
    // Boss 头
    for (const e of enemies) {
      if (e.dead) continue;
      const vid = e.vanillaId;
      if (vid == null) continue;
      const idx = BOSS_HEAD_INDEX[vid];
      if (idx === undefined) continue;
      const rot = bossHeadRotation(vid, (e as unknown as { visAngle?: number }).visAngle ?? 0);
      drawHead(this.atlas.ensureVImage(`vanilla/NPC_Head_Boss_${idx}.png`), e.cx, e.cy, false, rot);
    }
  }

  /** 头像描边纯色剪影 scratch（source-in 填色；当帧即用勿存） */
  private mapHeadSilScratch: HTMLCanvasElement | null = null;
  private mapHeadSilhouette(img: CanvasImageSource, sw: number, sh: number, color: string): CanvasImageSource {
    const sc = this.mapHeadSilScratch ??= document.createElement('canvas');
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const c = sc.getContext('2d')!;
    c.clearRect(0, 0, sw, sh);
    c.drawImage(img, 0, 0, sw, sh, 0, 0, sw, sh);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'source-over';
    return sc;
  }

  /** 发色剂激活的头带合成（后发→本体→前发→头甲，40×32；drawMapHeads 本地/远端共用） */
  private playerHeadStrip(doll: CanvasImageSource, appearance: Appearance,
    headIdx: number, dyeColor: { r: number; g: number; b: number }): HTMLCanvasElement | null {
    const strip = this.headStripScratch ??= document.createElement('canvas');
    if (strip.width !== 40 || strip.height !== 32) { strip.width = 40; strip.height = 32; }
    const sctx = strip.getContext('2d')!;
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, 40, 32);
    const layer = dollHairLayer(appearance, headIdx);
    const tinted = layer ? hairFrameTinted(layer, 0, dyeColor) : null;
    if (tinted && layer?.back) sctx.drawImage(tinted, 0, 0, 40, 32, 0, 0, 40, 32);
    sctx.drawImage(doll, 0, 0, 40, 32, 0, 0, 40, 32);
    if (tinted) sctx.drawImage(tinted, 0, 0, 40, 26, 0, 0, 40, 26);
    const head = headArmorImage(headIdx);
    if (head) sctx.drawImage(head, 0, 0, 40, 32, 0, 0, 40, 32);
    return strip;
  }

  /** 全屏地图：半透明背景 + 完整世界图 + 边框 + 操作提示；支持拖动/缩放 */
  /** 全屏地图卷轴（Images/Map.png 928×248）目标矩形四档修正（Main.cs:54860-54923 1:1
   *  纯函数）。基线 num26 = maxTilesX/840 × mapFullscreenScale，再按世界宽四档
   *  （8400 大/6400 中大/6300 中/4200 小）乘缩放系数并平移贴图目标矩形——原版把
   *  卷轴画在地图内容【之下】且四周外扩露出羊皮纸饰纹，各档外扩量是逐尺寸手调的
   *  魔数（40.6/38.8/39.8/37.3 横向、5/3.85/4.08/1.7 纵向、宽高各 −8.045..−26.69/
   *  −6.92..+0.12），此前按地图矩形整幅等比画 → 饰纹被地图压住、比例失衡。
   *  入参：worldW = maxTilesX；zoom = mapFullscreenScale；mapX/mapY = 地图内容绘制
   *  原点（vanilla num/num2）；texW/texH = Map.png 原始尺寸。 */
  /** 大地图 quad 可见窗裁剪：世界×zoom 的 dst 可伸出画布数万 px——部分 GPU
   *  驱动在 guard-band(±8192/16384) 外【整图元丢弃】而非裁剪 = "全屏地图放大
   *  到一定程度整块变黑、缩小恢复"根因（2026-08-19 显微镜探针定罪：CPU 像素
   *  健康+纹理存活+整幅重传依旧黑，仅大 dst 黑、小 dst 正常）。src/dst 同比
   *  例回裁，全部坐标收进画布内。 */
  static clipMapQuadToView(
    cx0: number, cy0: number, mapW: number, mapH: number,
    texW: number, texH: number, viewW: number, viewH: number,
  ): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } | null {
    const vx0 = Math.max(cx0, 0), vy0 = Math.max(cy0, 0);
    const vx1 = Math.min(cx0 + mapW, viewW), vy1 = Math.min(cy0 + mapH, viewH);
    if (!(vx1 > vx0) || !(vy1 > vy0)) return null;
    const kx = texW / mapW, ky = texH / mapH;
    return {
      sx: (vx0 - cx0) * kx, sy: (vy0 - cy0) * ky,
      sw: (vx1 - vx0) * kx, sh: (vy1 - vy0) * ky,
      dx: vx0, dy: vy0, dw: vx1 - vx0, dh: vy1 - vy0,
    };
  }

  static fullMapScrollRect(
    worldW: number, zoom: number, mapX: number, mapY: number, texW: number, texH: number,
  ): { x: number; y: number; w: number; h: number } {
    let k = (worldW / 840) * zoom;      // num26（:54860-54861）
    let x = mapX;                        // num27 = num（:54862）
    let y = mapY;                        // num28 = num2（:54863）
    let w = texW, h = texH;              // num29/num30 = Map.Width()/Height()（:54864-54865）
    if (worldW === 8400) {               // :54866-54879
      k *= 0.999;
      x -= 40.6 * k;
      y = mapY - 5 * k;
      w = (texW - 8.045) * k;
      h = (texH + 0.12) * k;
      if (k < 1.2) h += 1;
    } else if (worldW === 6400) {       // :54880-54893
      k *= 1.09;
      x -= 38.8 * k;
      y = mapY - 3.85 * k;
      w = (texW - 13.6) * k;
      h = (texH - 6.92) * k;
      if (k < 1.2) h += 2;
    } else if (worldW === 6300) {       // :54894-54907
      k *= 1.09;
      x -= 39.8 * k;
      y = mapY - 4.08 * k;
      w = (texW - 26.69) * k;
      h = (texH - 6.92) * k;
      if (k < 1.2) h += 2;
    } else if (worldW === 4200) {       // :54908-54917
      k *= 0.998;
      x -= 37.3 * k;
      y -= 1.7 * k;
      w = (texW - 16) * k;
      h = (texH - 8.31) * k;
    }
    return { x, y, w, h };
  }

  drawFullMap(ctx: CanvasRenderingContext2D, world: World, mouseX: number, mouseY: number, mouseDown: boolean, entities: Entity[] = []) {
    const fm = this.fullMap;
    const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
    this._fmWorldW = world.w;
    this._fmWorldH = world.h;
    // 拖动平移：按下首帧只同步基准点不位移（防地图瞬移）
    // _mapOpenClick：打开地图的那次点击（Game 置位）不参与拖拽，松开后才允许拖
    if (mouseDown && !this._mapOpenClick) {
      if (!this.mapDragging) {
        this.mapDragging = true;
      } else {
        fm.panX += mouseX - this.lastMouse.x;
        fm.panY += mouseY - this.lastMouse.y;
        // 拖动改变 pan 后按当前鼠标重设锚点（缓动中的缩放继续稳定）
        const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
        fm.anchorU = (mouseX - (viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX)) / fm.zoom;
        fm.anchorV = (mouseY - (viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY)) / fm.zoom;
        fm.anchorMX = mouseX;
        fm.anchorMY = mouseY;
      }
    } else {
      if (!mouseDown) this._mapOpenClick = false; // 松开后恢复正常拖拽
      this.mapDragging = false;
    }
    this.lastMouse = { x: mouseX, y: mouseY };
    // 画布尺寸按世界比例
    const mapW = world.w * fm.zoom;
    const mapH = world.h * fm.zoom;
    // 初始居中玩家（首次打开）
    if (fm.panX === 0 && fm.panY === 0 && !this._mapInit) {
      this._mapInit = true;
      fm.panX = 0;
      fm.panY = 0;
    }
    const cx0 = viewW / 2 - mapW / 2 + fm.panX;
    const cy0 = viewH / 2 - mapH / 2 + fm.panY;
    // ---- 底四段(MapBG/卷轴/地图内容/迷雾)的 GL 路径(docs #2):残项#3 归零——
    // 旧路每帧对 8400×2400 世界画布整幅缩放采样(~33M 采样/帧)+迷雾同款;
    // GL 化后=纹理 quad,小地图按 flushDirty 的脏区 texSubImage2D 增量上传。
    // 头像/标记/文字仍走 2D(在合成之后画,层序不变)。逃生门 ?mapgl=0。
    let glMap = false;
    // GL 地图判死窗口：判死后 60s 内(或到关图)走 2D 兜底——判死只影响全屏地图,
    // 世界背景层 GL 不动(其哨兵自愈链独立)
    if (this._glMapBrokenAt > 0 && performance.now() - this._glMapBrokenAt > 60_000) this._glMapBrokenAt = 0;
    if (this.mapGlEnabled && this._glMapBrokenAt === 0 && this.minimap && !this.isCpuRender()) {
      const glAcq = this.acquireGL();   // 统一闩:失败 null → glMap=false 走 2D
      const maxTex = glAcq ? glAcq.maxTextureSize : 0;
      if (glAcq && this.minimap.image && this.minimap.w <= maxTex && this.minimap.h <= maxTex) {
        const gl = glAcq;
        glMap = true;
        gl.resize(viewW, viewH);
        gl.begin();
        // 背景:原版 DrawMapFullscreenBackground(Main.cs:55804)——全屏群系 MapBG
        // ★vui 键必须带 .png 后缀(2026-08-13 实锤:裸键恒 null,背景从未画过)
        const bgTex = this.atlas ? this.atlas.vui(`MapBG${this.fullMapBgIndex(world) + 1}.png`) : null;
        if (bgTex && bgTex.img.width > 0) {
          gl.drawRect(bgTex, 0, 0, viewW, viewH);
        } else {
          gl.fillQuad(0, 0, viewW, viewH, 8 / 255, 6 / 255, 16 / 255, 0.92);
        }
        // 卷轴底图(原版 Images/Map.png 928×248 羊皮纸,内容【之下】;美术图平滑缩放)
        const scroll = this.atlas ? this.atlas.vui('Map.png') : null;
        if (scroll && scroll.img.width > 0) {
          const sr = Renderer.fullMapScrollRect(world.w, fm.zoom, cx0, cy0, scroll.sw, scroll.sh);
          gl.drawRect(scroll, sr.x, sr.y, sr.w, sr.h, { smooth: true });
        }
        // 地图内容:CPU ImageData → 纹理(整幅一次 + 脏区增量),单 quad 缩放
        // (smoothing 与 2D 同款:zoom≥1 线性、<1 最近邻)
        const mmKey = `mm:${this.minimap.uid}`;
        const mmTex = this.minimap.image ? gl.texFromImage(mmKey, this.minimap.image, false, true) : null;  // noMip
        // ★全幅重传标记消费：从 p32 全量 texSubUpdateData（增量矩形在被 128 上限
        //   丢弃的场景下,整幅覆盖=位级正确的收敛路径;一次性 ~20MB 上传,收尾单帧）。
        //   ★必须在 mmTex 创建之后——texSubUpdateData 对缺失 key 静默 no-op,
        //   首帧 texFromImage 的整幅(可能滞后)由此处 p32 全量覆盖=终态正确
        if (mmTex && this.minimap.needsFullUpload && this.minimap.p32) {
          console.log(`[mm] GL 全幅重传 ${this.minimap.w}x${this.minimap.h} (rects=${this.minimap.flushedPixelRects.length})`);
          const full = new ImageData(this.minimap.w, this.minimap.h);
          new Uint32Array(full.data.buffer).set(this.minimap.p32);
          gl.texSubUpdateData(mmKey, full, 0, 0);
          this.minimap.needsFullUpload = false;
          this.minimap.flushedPixelRects.length = 0;
        }
        if (mmTex && this.minimap.image) {
          for (const [px, py, pw, ph] of this.minimap.flushedPixelRects) {
            const region = new ImageData(pw, ph);
            const src32 = this.minimap.p32!;
            const dst32 = new Uint32Array(region.data.buffer);
            for (let r = 0; r < ph; r++) {
              const s0 = (py + r) * this.minimap.w + px;
              dst32.set(src32.subarray(s0, s0 + pw), r * pw);
            }
            gl.texSubUpdateData(mmKey, region, px, py);
          }
          const mmq = Renderer.clipMapQuadToView(cx0, cy0, mapW, mapH, mmTex.w, mmTex.h, viewW, viewH);
          if (mmq) gl.quad(mmTex, mmq.sx, mmq.sy, mmq.sw, mmq.sh, mmq.dx, mmq.dy, mmq.dw, mmq.dh, { smooth: fm.zoom >= 1 });
        }
        this.minimap.flushedPixelRects.length = 0;
        // 迷雾:getFogCanvas 每帧推进分带重建(2D/GL 共用),纹理按版本+行号重传
        const fogImg = this.ensureFogData(world);
        if (fogImg && fogImg.width > 0) {
          // ★稳定键+行带增量(曾 version:row 换键:重建一步=一张新 20MB 纹理,
          // 探索期持续换血把字节预算烧穿)。首载整幅,之后只补重建过的行带
          const fogKey = `fog:${world.seed}`;
          const rowBefore = this._mapFogRowSeen;
          const fogTex = gl.texFromImage(fogKey, fogImg, false, true);
          if (fogTex) {
            const rows = this._mapFogRowSeen >= 0
              ? Math.min(this.fogRebuildRow - rowBefore, this.fogH)
              : Math.min(this.fogRebuildRow, this.fogH);
            if (rows > 0) {
              const y0 = this._mapFogRowSeen >= 0 ? rowBefore : 0;
              const region = new ImageData(this.fogW, rows);
              const dst32 = new Uint32Array(region.data.buffer);
              dst32.set(this.fogP32!.subarray(y0 * this.fogW, (y0 + rows) * this.fogW));
              gl.texSubUpdateData(fogKey, region, 0, y0);
            }
            this._mapFogRowSeen = this.fogRebuildRow;
            const fq = Renderer.clipMapQuadToView(cx0, cy0, fogTex.w * 2 * fm.zoom, fogTex.h * 2 * fm.zoom,
              fogTex.w, fogTex.h, viewW, viewH);
            if (fq) gl.quad(fogTex, fq.sx, fq.sy, fq.sw, fq.sh, fq.dx, fq.dy, fq.dw, fq.dh, { smooth: false });
          }
        }
        // ---- GL 地图合成哨兵（2026-08-19 用户实报"放大后全黑只剩头像"六路复现
        //      不中→实机黑盒）：end() 前读中心 1px；CPU 迷雾/像素同点不黑而合成黑
        //      = GL 侧失效（纹理逐出/驱动 guard-band/上下文半死等）→ 连续 3 帧
        //      本开图会话改走 2D 兜底（CPU 直画不受 GPU 状态影响，自愈）----
        {
          const probe = gl.readPixel((viewW / 2) | 0, (viewH / 2) | 0) ?? new Uint8Array([255, 255, 255, 255]);
          const glBlack = probe[0] < 8 && probe[1] < 8 && probe[2] < 10;
          // CPU 侧同点：视口中心世界 tile 的迷雾是否已探索（探索区发黑才可能是
          // 正常内容；未探索区黑=迷雾,不触发）
          const wtx = Math.max(0, Math.min(world.w - 1, Math.floor((viewW / 2 - cx0) / fm.zoom)));
          const wty = Math.max(0, Math.min(world.h - 1, Math.floor((viewH / 2 - cy0) / fm.zoom)));
          const explored = world.explored ? !!world.explored[wty * world.w + wtx] : true;
          this._mapGlBlack = glBlack && explored ? (this._mapGlBlack + 1) : 0;
          this._mapGlLastProbe = [probe[0], probe[1], probe[2], explored ? 1 : 0];
          if (this._mapGlBlack >= 3) {
            this._glMapBrokenAt = performance.now();
            this._mapGlBlack = 0;
            console.warn('[drawFullMap] GL 合成中心恒黑但该点已探索——切 2D 兜底(本次开图会话)',
              { probe: this._mapGlLastProbe, zoom: fm.zoom, wtx, wty });
          }
        }
        gl.end();
        ctx.drawImage(gl.canvas, 0, 0);
      }
    }
    if (!glMap) {
      // ---- 2D 回退路径(原实现原样保留) ----
      const bgTex = this.atlas ? this.atlas.vui(`MapBG${this.fullMapBgIndex(world) + 1}.png`) : null;
      if (bgTex) {
        ctx.drawImage(bgTex.img, bgTex.sx, bgTex.sy, bgTex.sw, bgTex.sh, 0, 0, viewW, viewH);
      } else {
        ctx.fillStyle = 'rgba(8,6,16,0.92)';
        ctx.fillRect(0, 0, viewW, viewH);
      }
      // 卷轴底图（原版 Images/Map.png 928×248 羊皮纸，Main.cs:54923：地图内容【之下】
      // 绘制——目标矩形走 fullMapScrollRect 四档修正偏移（:54860-54918 按世界宽
      // 8400/6400/6300/4200 手调的外扩魔数），羊皮纸边缘饰纹在地图缩放留边处露出；
      // 地图探索未达区域在卷轴上呈现纸张色而非纯蓝）
      const scroll = this.atlas ? this.atlas.vui('Map.png') : null;
      if (scroll && (scroll.img.width > 0) && scroll.img.width > 0) {
        const sr = Renderer.fullMapScrollRect(world.w, fm.zoom, cx0, cy0, scroll.sw, scroll.sh);
        ctx.imageSmoothingEnabled = true; // 卷轴是美术图，平滑缩放防像素锯齿
        ctx.drawImage(scroll.img, scroll.sx, scroll.sy, scroll.sw, scroll.sh, sr.x, sr.y, sr.w, sr.h);
      }
      // 2D 回退:CPU ImageData → 开图期临时整幅画布(关闭即弃,GPU 只在开图期占用)。
      // ★dirty 版本门重灌:曾一次性建死——建画布时若小地图条带重建未完成(大世界
      // buildStriped 分帧),后续重建内容永远进不了这张画布 = 2D 兜底也残留空图
      this.fm2dMapEnsure();
      if (this._fm2dMap) {
        ctx.imageSmoothingEnabled = fm.zoom >= 1;
        ctx.drawImage(this._fm2dMap, cx0, cy0, mapW, mapH);
        ctx.imageSmoothingEnabled = false;
      }
      // 迷雾(2D 回退):同款临时画布 + 行带增量
      this.fm2dFogEnsure(world);
      if (this._fm2dFog) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._fm2dFog, cx0, cy0, this._fm2dFog.width * 2 * fm.zoom, this._fm2dFog.height * 2 * fm.zoom);
      }
    }
    // 头像层(原版 DrawNPCMapIcons2 :55602 + MapPlayerRenderer:玩家头/城镇 NPC 头/
    // Boss 头;headScale=min(1,(zoom×0.5+1)/3)——Main.cs:55140)
    // 远端头像悬停/虫洞命中（Main.cs:55376-55440 头像环）：命中盒 28×28×UIScale
    // （:55400-55404 num83-86，中心取本仓头像绘制中心）；门禁 = 非己 + 同队 team>0
    // + netMode==1 + HasUnityPotion + 晶塔悬停让位（cancelWormHole :55406——
    // pylonHoverName 为上一帧值，与原版"头环先跑、晶塔层后置"的一帧滞后同构）。
    // 首中优先（flag3 :55406 break 语义）
    const p = this._lastPlayer;
    this.mapWormholeHead = null;
    this.mapHeadHoverName = null;
    if (p) {
      const headScale = Math.min(1, (fm.zoom * 0.2 * 2 + 1) / 3) * 1.1;
      const hi = wormholeHeadHit(mouseX, mouseY, cx0, cy0, fm.zoom, this.remotePlayers);
      if (hi >= 0) {
        const rp = this.remotePlayers[hi];
        // CanBeSeen（:55166-55182）：非互敌恒见；双敌对同队非零队才见
        const seen = !(p.hostile && rp.hostile && !(p.team > 0 && p.team === rp.team));
        if (seen && !rp.dead) {
          this.mapHeadHoverName = rp.appearance?.name ?? '';
          if (this.mapWormholeMode && p.team > 0 && p.team === rp.team && p.hasUnityPotion()
            && !this.pylonHoverName) {
            const slot = (rp as unknown as { __netSlot?: number }).__netSlot;
            if (slot !== undefined) this.mapWormholeHead = { slot, name: this.mapHeadHoverName };
          }
        }
      }
      this.drawMapHeads(ctx, p, headScale,
        (wx) => cx0 + wx / TILE * fm.zoom,
        (wy) => cy0 + wy / TILE * fm.zoom,
        entities.filter((e) => e instanceof TownNPC) as TownNPC[],
        entities.filter((e) => e instanceof Enemy) as Enemy[], world,
        this.remotePlayers, this.mapWormholeHead?.slot ?? null);
    }
    // 传送预选标记（第一次点击的点，闪烁提示再次点击确认）
    const tp = this.tpMark;
    if (tp) {
      const blink = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = '#FF5050';
      ctx.lineWidth = 3;
      const mx = cx0 + (tp.x + 0.5) * fm.zoom, my = cy0 + (tp.y + 0.5) * fm.zoom;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(8, 10 * fm.zoom), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 14, my); ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my + 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 操作提示
    // 悬停格名（Main.cs:55227-55360 mapFullscreen 支）：mouse → tile（传送同式
    // (mouseX-cx0)/zoom）；界内 + 已探索（Map.Light>40 :55254 的迷雾二值等价）
    // → 类型名链 mapTileHoverName；宝箱族经 mapChestHoverName（命名支暂恒 name=null，
    // 见该函数注）。单槽 text：设值时晶塔名让位（原版 :55282+ 覆盖 MapIcons 先写值）
    this.fullMapHoverName = null;
    {
      const tx = Math.floor((mouseX - cx0) / fm.zoom);
      const ty = Math.floor((mouseY - cy0) / fm.zoom);
      if (tx >= 0 && ty >= 0 && tx < world.w && ty < world.h
        && (!world.explored || world.explored[ty * world.w + tx])) {
        const st = world.store;
        const i = st.idx(tx, ty);
        if (st.flags[i]) {
          const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
          const name = mapTileHoverName(sheet, st.frameX[i]);
          if (name) {
            this.fullMapHoverName = sheet === 21 || sheet === 441 || sheet === 467
              || sheet === 468 || sheet === 88
              ? mapChestHoverName({ typeName: name, name: null })
              : name;
          }
        }
      }
    }
    // 头像悬停文案（Main.cs:55407/:55420：头像环后写覆盖地块名——悬停名/传送文案；
    // 晶塔层仍后画，但本仓晶塔提示让位 fullMapHoverName（已有约定），头像与晶塔
    // 图标重叠的罕见例按头像优先处置，登记）
    if (this.mapWormholeHead) {
      this.fullMapHoverName = Lang.text('Game.TeleportTo', this.mapWormholeHead.name)
        ?? this.fullMapHoverName;
    } else if (this.mapHeadHoverName) {
      this.fullMapHoverName = this.mapHeadHoverName;
    }
    // ★1457 钻地龟图标层（DigtoiseMapLayer——MapIconOverlay 注册序 Main.cs:374
    //   Digtoise→BossBag→Spawn→TeamBasedSpawn→TeleportPylons,画在晶塔层之前）
    this.drawDigtoiseMapLayer(ctx, cx0, cy0, mouseX, mouseY, entities);
    this.drawSpawnMapLayer(ctx, cx0, cy0, mouseX, mouseY, world);
    this.drawPylonMapLayer(ctx, cx0, cy0, mouseX, mouseY);
    // 地图 ping 图标层（PingMapLayer——MapIconOverlay 注册序 Pylons→Pings :349-351，
    // 画在晶塔层之上）
    this.drawMapPingLayer(ctx, cx0, cy0);
    // ★1457 钻地龟层悬停文案（MapIcons 单槽 text：先画先写、后层覆盖——头像/晶塔
    //   均未命中才显示）
    if (this.digtoiseHoverName && !this.fullMapHoverName && !this.pylonHoverName) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(this.digtoiseHoverName, mouseX, mouseY - 14);
    }
    if (this.fullMapHoverName) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(this.fullMapHoverName, mouseX, mouseY - 14);
    }
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#C8C0D8';
    ctx.textAlign = 'center';
    ctx.fillText(Lang.text('Mods.SandboxWorld.Map.Hint'), viewW / 2, viewH - 16);
  }
  private _mapInit = false;

  /** 全幅地图 2D 画布（drawFullMap 2D 回退与 drawMapOverlay 共用；dirty 版本门重灌
   *  ——建画布时若小地图条带重建未完成(大世界 buildStriped 分帧),后续重建内容
   *  要能进得了这张画布,否则残留空图） */
  private fm2dMapEnsure(): HTMLCanvasElement | null {
    if (!this.minimap?.image) return null;
    // ★PR-async 收口④：重灌门 = mapVersion 单调计数(勿用 dirtyChunks.size——
    //  洪峰期「+N/−N 相抵」可使 size 连帧同值 → 2D 地图冻结 = 用户实报病灶二)
    const ver = this.minimap.mapVersion;
    if (!this._fm2dMap) {
      this._fm2dMap = document.createElement('canvas');
      this._fm2dMap.width = this.minimap.w;
      this._fm2dMap.height = this.minimap.h;
      this._fm2dMap.getContext('2d')!.putImageData(this.minimap.image, 0, 0);
      this._fm2dVer = ver;
    } else if (ver !== this._fm2dVer || this.minimap.needsFullUpload) {
      this._fm2dMap.getContext('2d')!.putImageData(this.minimap.image, 0, 0);
      this._fm2dVer = ver;
      this.minimap.needsFullUpload = false;
    }
    return this._fm2dMap;
  }

  /** 全幅迷雾 2D 画布（同上共用；行带增量重建） */
  private fm2dFogEnsure(world: World): HTMLCanvasElement | null {
    const fogImg = this.ensureFogData(world);
    if (!fogImg || !this.fogP32) return null;
    if (!this._fm2dFog || this._fm2dFogRowSeen < this.fogRebuildRow) {
      if (!this._fm2dFog) {
        this._fm2dFog = document.createElement('canvas');
        this._fm2dFog.width = this.fogW;
        this._fm2dFog.height = this.fogH;
        this._fm2dFogRowSeen = 0;
      }
      const rows = Math.min(this.fogRebuildRow - this._fm2dFogRowSeen, this.fogH);
      if (rows > 0) {
        const region = new ImageData(this.fogW, rows);
        const dst32 = new Uint32Array(region.data.buffer);
        dst32.set(this.fogP32.subarray(this._fm2dFogRowSeen * this.fogW, (this._fm2dFogRowSeen + rows) * this.fogW));
        this._fm2dFog.getContext('2d')!.putImageData(region, 0, this._fm2dFogRowSeen);
        this._fm2dFogRowSeen = this.fogRebuildRow;
      }
    }
    return this._fm2dFog;
  }

  /** 覆盖式地图（mapStyle==2，Main.cs:54988-55018 + 合成段 :55049-55112）：
   *  世界视图之上、界面层之下整屏铺开——scale 钳 [屏宽/世界宽, 16×zoom]（:54991-54998
   *  下界=全图入屏、上界=与世界视图同 1 tile=16·zoom px），α=mapOverlayAlpha 钳
   *  [0.01,1]（:54999-55006）；锚点=相机中心 tile 屏幕居中 + 10tile 地图边框偏移
   *  （num6/num7=10，:55011-55018）。头像层同链（:55057-55112：num39=
   *  min(1,(s·0.2·2+1)/3)×UIScale）。原版画序=NPC/图块之后玩家弹幕之前——本仓
   *  世界单 pass，画在滤镜链之前（滤镜 EndCapture 语义保持在其上），
   *  实体被覆盖为其与原版唯一可见差（报告登记）。 */
  private drawMapOverlay(
    ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player,
    entities: Entity[], viewW: number, viewH: number, z: number,
  ): void {
    // 原地钳（:54991-55006——越界值直接改写活值，键步进的界由此保证）
    this.mapOverlayScale = Math.max(viewW / world.w, Math.min(16 * z, this.mapOverlayScale));
    this.mapOverlayAlpha = Math.min(1, Math.max(0.01, this.mapOverlayAlpha));
    const s = this.mapOverlayScale;
    const num = -(cam.x / TILE) * s + viewW / 2 + 10 * s;
    const num2 = -(cam.y / TILE) * s + viewH / 2 + 10 * s;
    const map = this.fm2dMapEnsure();
    const fog = this.fm2dFogEnsure(world);
    ctx.save();
    ctx.globalAlpha = this.mapOverlayAlpha;
    if (map) {
      ctx.imageSmoothingEnabled = s >= 1;
      ctx.drawImage(map, num, num2, world.w * s, world.h * s);
    }
    if (fog) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fog, num, num2, this.fogW * 2 * s, this.fogH * 2 * s);
    }
    ctx.imageSmoothingEnabled = false;
    this.drawMapHeads(ctx, player, Math.min(1, (s * 0.2 * 2 + 1) / 3) * 1.1,
      (wx) => num + wx / TILE * s,
      (wy) => num2 + wy / TILE * s,
      entities.filter((e) => e instanceof TownNPC) as TownNPC[],
      entities.filter((e) => e instanceof Enemy) as Enemy[], world,
      this.remotePlayers);
    ctx.restore();
  }
  /** 2D 兜底地图画布最近重灌时的 minimap 脏块计数（变化才重灌） */
  private _fm2dVer = -1;
  /** GL 全屏地图合成判死时刻（0=健康；中心恒黑 3 帧置位 → 60s 内 2D 兜底） */
  private _glMapBrokenAt = 0;
  /** 连续黑帧计数 + 最近一次探针结果（F5 报告消费） */
  private _mapGlBlack = 0;
  _mapGlLastProbe: [number, number, number, number] = [0, 0, 0, 0];

  /** 全屏地图钻地龟图标层（★1457 DigtoiseMapLayer.cs:9-29 1:1）：
   *  本地玩家的钻地龟随从弹（1098 PalworldDigtoise/1123 PalworldTrustyDigtoise，
   *  owner==localPlayer 首中即 break :14-:26）→ Extra_305（116×36 = SpriteFrame(2,1)
   *  58×36 双列,列 = spriteDirection≤0?1:0 :21）画在弹体 Bottom/16+(0.5,0) 格锚、
   *  Alignment.Bottom（图标底边贴锚）:19-21;悬停 → "UI.Digtoise"（:22-24,本仓
   *  Mods.SandboxWorld.UI.Digtoise 键）。单槽 text：先画先写,后层（头像/晶塔）覆盖 */
  private digtoiseHoverName: string | null = null;
  private drawDigtoiseMapLayer(
    ctx: CanvasRenderingContext2D, cx0: number, cy0: number,
    mouseX: number, mouseY: number, entities: unknown[],
  ) {
    this.digtoiseHoverName = null;
    const tex = this.atlas?.vmisc('vanilla/Extra_305.png');
    const fm = this.fullMap;
    const p = this._lastPlayer;
    for (const ent of entities) {
      const m = ent as { dead?: boolean; projId?: number; ownerPlayer?: unknown;
        x: number; y: number; w: number; h: number; facing?: number } | undefined;
      if (!m || m.dead || (m.projId !== 1098 && m.projId !== 1123)) continue;
      if (!p || m.ownerPlayer !== p) continue;               // :17 owner==localPlayer
      const fw = 58, fh = 36;                                // SpriteFrame(2,1) 帧尺寸
      const scale = Math.max(1, Math.min(2, fm.zoom));       // 同晶塔层 scaleIfSelected 档
      // vector2 = projectile.Bottom/16（:20）+ vector (0.5,0)（:19）→ 格锚
      const mx = cx0 + (m.x / TILE + m.w / TILE + 0.5) * fm.zoom;
      const my = cy0 + ((m.y + m.h) / TILE) * fm.zoom;       // Alignment.Bottom 底边贴锚
      const dw = fw * scale, dh = fh * scale;
      if (tex && mx > -dw && mx < ctx.canvas.width + dw && my > -dh && my < ctx.canvas.height + dh) {
        const col = (m.facing ?? 1) <= 0 ? 1 : 0;            // :21 spriteDirection≤0 → 列 1
        ctx.drawImage(tex.img, tex.sx + col * fw, tex.sy, fw, fh, mx - dw / 2, my - dh, dw, dh);
      }
      if (Math.abs(mouseX - mx) <= dw / 2 && mouseY >= my - dh && mouseY <= my) {
        this.digtoiseHoverName = Lang.text('Mods.SandboxWorld.UI.Digtoise');
      }
      break;                                                 // :25 首中即出（单宠语义）
    }
  }

  /** 全屏地图晶塔图标层（TeleportPylonsMapLayer.cs 1:1）：
   *   - 连线（:52-75）：当前塔（MapPylonTile）→ 其余每座晶塔的黑 6px/白 2px 双线
   *   - 图标（:77-104）：Extra_182.png 11 帧横排（330×38，帧 30×38），帧号 = 塔型；
   *     玩家不在晶塔旁 → 半透明灰（color = Gray*0.5 :70-73）
   *   - 悬停提示（:97-99）：晶塔物品名
   *  击中判定（Game.tryPylonMapTeleport）：图标中心 = 锚点 + (1.5, 2) 格。 */
  /** 全屏地图出生点图标层（SpawnMapLayer.cs 1:1；MapIconOverlay 注册序
   *  Digtoise→BossBag→Spawn→TeamBasedSpawn→Pylons→Pings Main.cs:349-351——
   *  本链曾缺 Spawn 层,旧批注释已登记）：
   *  ① 世界生成点 = SpawnPoint 贴图,锚 (spawnTileX+0.5, spawnTileY) 底中
   *     （Alignment.Bottom=OffsetMultiplier(0.5,1)，MapOverlayDrawContext.Draw）;
   *     teamBasedSpawnsSeed 门本仓未建模 → 恒画（Main.cs:349 层序不变）
   *  ② 床生成点 = SpawnBed 贴图,门 localPlayer.SpawnX≠-1——本仓床生成点未建模
   *     （恒 -1 语义）→ 恒不画,待床系统落地再接
   *  悬停 = Lang 'UI.SpawnPoint'（zh「生成点」）写 fullMapHoverName 单槽
   *  （先画先写、后层覆盖——Spawn 在 Pylons 之前=会被晶塔名覆盖,原版同序）
   *  scale = min(1,(zoom×0.4+1)/3)（Main.cs:55063 num39；虫洞头像层同式已在用）。
   *  贴图 UI_SpawnPoint/SpawnBed.png 在盘但 vanilla-ui.json 索引未收录（vui 空）
   *  → 运行时直载 + 10s 重试（与 SkyRenderer.loadTex 同纪律）。 */
  private spawnMapTexs: { point: HTMLImageElement | null; bed: HTMLImageElement | null } = { point: null, bed: null };
  private spawnMapTex(kind: 'point' | 'bed'): HTMLImageElement | null {
    let im = this.spawnMapTexs[kind];
    if (!im) {
      im = new Image();
      const file = kind === 'point' ? 'UI_SpawnPoint.png' : 'UI_SpawnBed.png';
      im.onerror = () => setTimeout(() => { im!.src = `sprites/vanilla-ui/${file}`; }, 10_000);
      im.src = `sprites/vanilla-ui/${file}`;
      this.spawnMapTexs[kind] = im;
    }
    return im.width > 0 ? im : null;
  }
  private drawSpawnMapLayer(
    ctx: CanvasRenderingContext2D, cx0: number, cy0: number,
    mouseX: number, mouseY: number, world: World | null,
  ): void {
    if (!world) return;
    const fm = this.fullMap;
    const scale = Math.min(1, (fm.zoom * 0.4 + 1) / 3);   // Main.cs:55063 num39
    const draw = (tex: HTMLImageElement | null, tx: number, ty: number): boolean => {
      if (!tex || tex.width <= 0) return false;
      const mx = cx0 + tx * fm.zoom, my = cy0 + ty * fm.zoom;
      const dw = tex.width * scale, dh = tex.height * scale;
      const x0 = mx - dw / 2, y0 = my - dh;               // Alignment.Bottom 底中锚
      ctx.drawImage(tex, x0, y0, dw, dh);
      return mouseX >= x0 && mouseX <= x0 + dw && mouseY >= y0 && mouseY <= y0 + dh;
    };
    const hover = draw(this.spawnMapTex('point'), world.spawnX + 0.5, world.spawnY);
    if (hover && !this.fullMapHoverName) this.fullMapHoverName = Lang.text('UI.SpawnPoint');
  }

  private drawPylonMapLayer(
    ctx: CanvasRenderingContext2D, cx0: number, cy0: number,
    mouseX: number, mouseY: number,
  ) {
    if (!this.pylons.length) { this.pylonHoverName = null; return; }
    const fm = this.fullMap;
    const icon = this.atlas ? this.atlas.vui('Extra_182.png') : null;
    // 玩家 ±60 格内无晶塔 → 半透明（IsPlayerNearAPylon :70-73；近似取相机中心玩家位）
    const p = this._lastPlayer;
    const dim = p ? !this.pylons.some((py) =>
      Math.abs(py.x - p.cx / TILE) <= 62 && Math.abs(py.y - p.cy / TILE) <= 63) : true;
    // 连线（:52-75）
    if (this.mapPylonTile) {
      const o = this.mapPylonTile;
      const ox = cx0 + (o.x + 1.5) * fm.zoom, oy = cy0 + (o.y + 2) * fm.zoom;
      for (const py of this.pylons) {
        if (py.x === o.x && py.y === o.y) continue;
        const tx = cx0 + (py.x + 1.5) * fm.zoom, ty = cy0 + (py.y + 2) * fm.zoom;
        for (const [c, w] of [['#000000', 6], ['#FFFFFF', 2]] as const) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      }
    }
    // 图标 + 悬停
    this.pylonHoverName = null;
    const FW = 30, FH = 38;   // Extra_182：11 帧 × 30px（330×38）
    const scale = Math.max(1, Math.min(2, fm.zoom));   // scaleIfSelected 2× / 基线 1×
    for (const py of this.pylons) {
      const mx = cx0 + (py.x + 1.5) * fm.zoom, my = cy0 + (py.y + 2) * fm.zoom;
      const dw = FW * scale, dh = FH * scale;
      if (mx < -dw || mx > ctx.canvas.width + dw || my < -dh || my > ctx.canvas.height + dh) continue;
      ctx.globalAlpha = dim ? 0.35 : 1;
      if (icon) {
        ctx.drawImage(icon.img, icon.sx + py.type * FW, icon.sy, FW, FH,
          mx - dw / 2, my - dh / 2, dw, dh);
      } else {
        // 贴图未就绪兜底：白描边菱形占位（懒加载次帧补上真图标）
        ctx.strokeStyle = '#8CF5A9'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx, my - dh / 2); ctx.lineTo(mx + dw / 2, my);
        ctx.lineTo(mx, my + dh / 2); ctx.lineTo(mx - dw / 2, my);
        ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (Math.abs(mouseX - mx) <= dw / 2 && Math.abs(mouseY - my) <= dh / 2) {
        this.pylonHoverName = Lang.itemName(pylonItemTypeFromStyle(py.type));
      }
    }
    if (this.pylonHoverName && !this.fullMapHoverName) {   // 单槽 text：箱名悬停让位（:55282+ 后写覆盖）
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(this.pylonHoverName, mouseX, mouseY - 14);
    }
  }

  /** 全屏地图背景群系序号（DrawMapFullscreenBackground Main.cs:55804-55905 1:1）。
   *  深度以地图视区竖直中心（tile）近似原版 screenPosition；群系/墙取玩家所在格。
   *  返回值 = MapBGs 数组下标（贴图文件 MapBG{下标+1}.png）。 */
  fullMapBgIndex(world: World): number {
    const p = this._lastPlayer;
    const sc = this.scene;
    if (!p || !sc) return 0;
    // 原版 DrawMapFullscreenBackground（Main.cs:55804-55820）：深度档看
    // 【地图视口顶部的世界 Y】（screenPosition.Y），其余档全部看玩家墙/群系。
    // ★旧式 (cy0+mapH/2)/zoom 是"地图底边屏幕坐标÷zoom"——纯错位量，随缩放
    // 剧烈漂移 = 用户实报"背景图随缩放自己变动"根因；正确映射 = 视口顶(屏幕 y=0)
    // 的世界 tile = -cy0/zoom（cy0 为地图顶的屏幕 y）
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const mapH = world.h * fm.zoom;
    const cy0 = viewH / 2 - mapH / 2 + fm.panY;
    const vy = Math.max(0, Math.floor(-cy0 / fm.zoom));
    const px = Math.floor(p.cx / TILE), py = Math.floor(p.cy / TILE);
    const st = world.store;
    const inB = st.inBounds(px, py);
    const wall = inB ? st.wall[st.idx(px, py)] : 0;
    // 地狱（视口顶世界 tile 深过 h-232——原版 screenPosition.Y > (maxTilesY-232)*16）
    if (vy > world.store.h - 232) return 2;
    if (sc.zoneDungeon) return 4;
    if (wall === 87) return 13;
    // 原版第二档：screenPosition.Y > worldSurface*16（视口顶在地表之下）
    if (vy > world.groundLevel) {
      switch (wall) {
        case 86: case 108: return 15;
        case 180: case 184: return 16;
        case 178: case 183: return 17;
        case 62: case 263: return 18;
      }
      if (sc.zoneGlowshroom) return 20;
      if (sc.zoneCorrupt) return sc.zoneDesert ? 41 : sc.zoneSnow ? 35 : 21;
      if (sc.zoneCrimson) return sc.zoneDesert ? 40 : sc.zoneSnow ? 34 : 22;
      if (sc.zoneHallow) return sc.zoneDesert ? 39 : sc.zoneSnow ? 33 : 23;
      if (sc.zoneDesert) return 14;
      if (sc.zoneSnow) return 3;
      if (sc.zoneJungle) return 12;
      return sc.zoneRockLayerHeight ? 31 : 1;
    }
    // 地表
    if (sc.zoneSkyHeight) return 32;
    if (sc.zoneCorrupt) return sc.zoneDesert ? 36 : 5;
    if (sc.zoneCrimson) return sc.zoneDesert ? 37 : 6;
    if (sc.zoneHallow) return sc.zoneDesert ? 38 : 7;
    if (py <= world.groundLevel + 10 && (px < 380 || px > world.store.w - 380)) return 10;
    if (sc.zoneSnow) return 11;
    if (sc.zoneJungle) return 8;
    if (sc.zoneDesert) return 9;
    if (world.clock?.bloodMoon) return 25;
    if (sc.zoneGraveyard) return 26;
    return 0;
  }

  /** 全屏地图主角标记：脉冲圆环 + 原版风格白箭头（黑描边）+ 坐标文字 */
  /** 打开地图的那次点击不参与拖拽（Game 打开时置位，松开后清除） */
  _mapOpenClick = false;
  private _lastPlayer: Player | null = null;
  /** 传送预选标记（Game 写入） */
  tpMark: { x: number; y: number } | null = null;
  /** 地图 ping 存储（Main.Pings 语义；Game.mapPings 注入——drawMapPingLayer 消费） */
  mapPings: import('../net/syncModules').MapPingStore | null = null;

  /** 全屏地图 ping 图标层（Terraria.Map/PingMapLayer.cs 1:1）：
   *  Images/UI/MapPing（UI_MapPing.png 18×90 = 18×18 × 5 帧行动画），
   *  10fps 帧 = (存活秒 ×10) %5，居中对齐（Alignment.Center），15s 过期移除，
   *  容量 100（满员丢弃——store 侧门）。位置 = tile 坐标 float（TriggerPing
   *  换算语义,本仓地图无 10 tile 衬边故直接 (mouse-c0)/zoom） */
  private drawMapPingLayer(ctx: CanvasRenderingContext2D, cx0: number, cy0: number) {
    const store = this.mapPings;
    if (!store || !store.pings.length) return;
    const fm = this.fullMap;
    const now = performance.now();
    const icon = this.atlas ? this.atlas.vui('UI_MapPing.png') : null;
    const FW = 18, FH = 18;
    for (const p of store.live(now)) {
      const frame = MapPingStore.frameOf(p, now);
      const mx = cx0 + p.x * fm.zoom, my = cy0 + p.y * fm.zoom;
      if (icon) {
        ctx.drawImage(icon.img, icon.sx, icon.sy + frame * FH, FW, FH,
          mx - FW / 2, my - FH / 2, FW, FH);
      } else {
        // 贴图未就绪兜底：绿色同心圆占位（懒加载次帧补上真图标）
        ctx.strokeStyle = '#8CF5A9';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  /** 调试叠加层：碰撞盒高亮 + 状态信息 */
  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number,
    player: Player, entities: Entity[], mouseX: number, mouseY: number,
    hover: HoverTarget | null,
  ) {
    const z = cam.zoom;
    const [mx, my] = cam.worldToScreen(mouseX, mouseY);
    const box = (e: { x: number; y: number; w: number; h: number; cx: number }, color: string, label?: string) => {
      const [sx, sy] = cam.worldToScreen(e.x, e.y);
      const sw = e.w * z, sh = e.h * z;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      if (label) {
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, sx + 2, sy - 3);
      }
    };
    // 主角碰撞盒（亮绿）
    box(player, '#00FF66', `player ${player.w}x${player.h} og:${player.onGround} vy:${player.vy.toFixed(1)}`);
    // 主角中心点
    const [pcx, pcy] = cam.worldToScreen(player.cx, player.cy);
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(pcx - 2, pcy - 2, 4, 4);
    // 手持工具/武器的范围显示（与 Game 判定一致）：
    // 1) 近战判定圆：剑 = 完整 reach，镐/斧/锤 ×0.8，空手 3 格；圆心向朝向平移 reach×0.35
    // 2) 挖掘圆（镐/锤）：4.5 格（tryMine 范围）
    // 3) 砍树圆（斧）：4.5 格（同一 tryMine 通路，斧作用对象为树）
    {
      const held = player.inv.heldItem();
      const tool = held ? ITEM_DEFS[held.id]?.tool : undefined;
      const reach = (tool?.reach ?? TILE * 3) * (tool?.type === 'sword' ? 1 : tool ? 0.8 : 1);
      const circle = (cx: number, r: number, color: string, label: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, pcy, r * z, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, cx + 6, pcy - 6);
      };
      // 近战判定圆（朝向前移）
      const acx = pcx + player.facing * reach * 0.35 * z;
      circle(acx, reach, tool ? 'rgba(0,255,200,0.55)' : 'rgba(120,120,160,0.4)',
        `attack ${(reach / TILE).toFixed(1)} tiles${tool ? '' : ' (no tool)'}`);
      // 挖掘范围（镐/锤）
      if (tool && (tool.type === 'pick' || tool.type === 'hammer')) {
        circle(pcx, TILE * 4.5, 'rgba(255,170,60,0.5)', 'mine 4.5 tiles');
      }
      // 砍树范围（斧）
      if (tool && tool.type === 'axe') {
        circle(pcx, TILE * 4.5, 'rgba(120,230,90,0.5)', 'chop 4.5 tiles');
      }
    }
    // 实体碰撞盒
    for (const e of entities) {
      const ent = e as Entity;
      if (ent instanceof Enemy) box(ent, '#FF4444', (ent as Enemy).key);
      else if (ent instanceof ItemDrop) box(ent, '#FFAA00');
      else if (ent instanceof Tombstone) box(ent, '#AA88FF', 'tomb');
      // 投射物族（爆炸物/箭/弹/长矛等）：橙红盒 + 型号标注——碰撞盒与贴图的对齐
      // 目视核对工具（贴图含引线/柄等非碰撞区域,盒偏小属原版行为）
      else if (ent instanceof GrenadeProj) {
        const gp = ent as unknown as { projId: number; damage: number; fuse: number };
        box(ent, '#FF6600', `proj${gp.projId} ${ent.w}×${ent.h} fuse:${gp.fuse}`);
      } else if (ent instanceof Arrow) {
        const ap = ent as unknown as { projId?: number; hostile?: boolean };
        box(ent, ap.hostile ? '#FF0066' : '#66FF99', `arrow${ap.projId ?? ''} ${ent.w}×${ent.h}`);
      } else if (ent instanceof SpearProj) {
        box(ent, '#FFCC00', `spear${(ent as unknown as { projId: number }).projId} ${ent.w}×${ent.h}`);
      } else if (typeof (ent as { draw?: unknown }).draw === 'function' && ent.constructor.name !== 'Player') {
        // 其余带 draw 的投射物（Dart/TrapShot/MagicProj/Celeb2 等）
        box(ent, 'rgba(255,120,0,0.6)', `${ent.constructor.name} ${ent.w}×${ent.h}`);
      }
    }
    // 鼠标指向 tile
    const [htx, hty] = cam.tileUnder(mouseX, mouseY);
    const [hsx, hsy] = cam.worldToScreen(htx * TILE, hty * TILE);
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.strokeRect(hsx, hsy, TILE * z, TILE * z);
    // 信息面板
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(8, 8, 260, 130);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#00FF66';
    ctx.fillText(`pos: ${player.cx.toFixed(0)}, ${player.cy.toFixed(0)}  tile: ${Math.floor(player.cx / TILE)}, ${Math.floor(player.cy / TILE)}`, 14, 26);
    ctx.fillStyle = '#88FF88';
    ctx.fillText(`box: ${player.w}x${player.h}  onGround: ${player.onGround}  vy: ${player.vy.toFixed(2)}`, 14, 44);
    ctx.fillText(`mouse: ${mouseX}, ${mouseY}  tile: ${htx}, ${hty}`, 14, 62);
    ctx.fillStyle = '#AAA';
    ctx.fillText(`zoom: ${z.toFixed(2)}  entities: ${entities.length}`, 14, 80);
    ctx.fillText(`inWater: ${player.inWater}  headUnder: ${player.headUnderwater}`, 14, 98);
    ctx.fillStyle = '#FF6600';
    ctx.fillText('F3 关闭调试面板', 14, 118);
    // 图例
    ctx.fillStyle = '#666';
    ctx.fillText('绿=主角 橙=中心 红=怪物 蓝=动物 黄=鼠标', 14, 136);
  }

  /** 入侵进度条（原版进度已完成的百分比；Boss 条下方 30px）。
   *  label：整段文案覆盖（月事件 wave20 需求恒 0 → Main.cs:47163 用
   *  Game.InvasionPoints 代替百分比、进度条满格 :47167-47170） */
  private drawInvasionBar(ctx: CanvasRenderingContext2D, viewW: number, invasion: { name: string; pct: number; label?: string }) {
    const w = Math.min(560, viewW - 200);
    const x = (viewW - w) / 2, y = 28 + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, y - 3, w + 6, 26);
    ctx.fillStyle = '#10305A';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = '#D0A020';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, invasion.pct)), 20);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    const pctTxt = `${Math.floor(Math.max(0, Math.min(1, invasion.pct)) * 100)}%`;
    ctx.fillText(`${invasion.name}  ${invasion.label ?? pctTxt}`, viewW / 2, y + 15);
  }

  // ---- Boss 血条（BossBars.ts：BigProgressBarSystem 15 类特化条 1:1）----

  /** BossBarSystem 实例（BigProgressBarSystem 的 _currentBar/_info 跟踪态） */
  private readonly bossBars = new BigProgressBarSystem();
  /** BarNpc 投影暂存（每帧复用，防 alloc 抖动——泄漏家族清扫口径） */
  private readonly _barNpcs: BarNpc[] = [];

  /** Enemy → BarNpc 投影 + 世界上下文（专家/FTW/downed/塔盾）打包 */
  private buildBarContext(
    entities: Entity[], player: Player, world: World,
    cam: Camera, viewW: number, viewH: number,
  ): BarContext {
    const buf = this._barNpcs;
    buf.length = 0;
    for (const e of entities) {
      if (!(e instanceof Enemy) || e.vanillaId == null) continue;
      buf.push({
        id: e.id, type: e.vanillaId, active: !e.dead,
        life: e.hp, lifeMax: e.maxHp,
        ai0: e.ai0, ai1: e.ai1, ai2: e.ai2, ai3: e.ai3, localAI3: e.lai3,
        x: e.x, y: e.y, w: e.w, h: e.h, cx: e.cx, cy: e.cy,
        difficulty: e.difficulty,
      });
    }
    const z = cam.zoom;
    const sw = viewW / z, sh = viewH / z;
    return {
      npcs: buf,
      playerCx: player.cx, playerCy: player.cy,
      screen: { x: cam.x - sw / 2, y: cam.y - sh / 2, w: sw, h: sh },
      expertMode: world.isExpert,
      getGoodWorld: !!world.seedFlags?.getGoodWorld,
      shieldMax: shieldMax(world),
      shieldOf: (towerId) => world.lunarEvent.shield[TOWER_KEY[towerId]] ?? 0,
      refLifeMax: refLifeMaxOf,
    };
  }

  /** Boss 血条绘制（BigProgressBarHelper.DrawFancyBar 两重载合并——生命条
   *  行0-3 + 盾量叠层行4/5；布局 456×22 居中 (W/2,H-50)，头像净左上 =
   *  框左上-(32,24)+(4,20)，盾>0 时文本显盾量） */
  private drawBossBar(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number, info: CollectInfo,
  ) {
    if (!this.atlas) return;
    drawBigProgressBar(ctx, {
      bar: this.atlas.vui('UI_UI_BossBar.png'),
      head: info.headIndex >= 0
        ? this.atlas.vmisc(`vanilla/NPC_Head_Boss_${info.headIndex}.png`) : null,
    }, viewW, viewH, info);
  }

}
