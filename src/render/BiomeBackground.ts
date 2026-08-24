// 原版世界背景图系统 1:1（Main.cs DrawBG/DrawSurfaceBG :58718-60900 + DrawBackground :52217-53517）。
// 地表：bgStyle（GetPreferredBGStyleForPlayer :63658 优先级）→ bgAlpha 前后两层 ±0.05/帧
// （UpdateBGVisibility :63534）→ 群系 3 层视差贴图（WorldGen.setBG :7181 贴图集，
// DrawSurfaceBG_* 各方法的 bgScale/bgParallax/bgTopY 常量），昼夜色调 = ColorOfTheSkies × bgAlpha。
// 地下：PickUndergroundBackgroundStyle :53454 → style→7 槽贴图表（UpdateBackgroundStyles :53221）
// → 表面过渡/泥土/岩石/岩浆分层（ugBackTransition 0.25/帧 新旧双绘）。
// 贴图懒加载（vanilla/Background_N.png，不进 SpriteAtlas 常驻表）。
import { upgradeToBitmap, loadBitmapOnly, SpriteAtlas } from '../assets/SpriteAtlas';
import type { World } from '../world/World';
import type { SceneFlags } from '../world/SceneMetrics';
import { atmoOf } from './SkyRenderer';

// ---- SurfaceBackgroundID（Terraria.ID/SurfaceBackgroundID.cs） ----
const Forest1 = 0, Corruption = 1, Desert = 2, Jungle = 3, Ocean = 4, CorruptDesert = 5,
  Hallow = 6, Snow = 7, Crimson = 8, Mushroom = 9, Forest2 = 10, Forest3 = 11, Forest4 = 12,
  HallowDesert = 13, CrimsonDesert = 14;

/** 样式 → BackgroundChangeFlashInfo areaId（TreeTopsInfo.AreaId 槽位：
 *  0-3=Forest1-4、4=Corrupt、5=Jungle、6=Snow、7=Hallow、8=Crimson、9=Desert、
 *  10=Ocean、11=Mushroom、12=Underworld——BackgroundChangeFlashInfo.cs:9-22） */
const STYLE_TO_AREA: Record<number, number> = {
  0: 0, 10: 1, 11: 2, 12: 3,
  1: 4, 3: 5, 7: 6, 6: 7, 8: 8,
  2: 9, 5: 9, 13: 9, 14: 9,
  4: 10, 9: 11,
};

interface LayerDef { tex: number; scale: number; parallax: number; topA: number; topB: number }
/** 群系 3 层标准参数（DrawSurfaceBG_* 实测常量；topY = num3*topA + topB） */
const L3 = (t: number[], y1: number, y2: number, y3: number): LayerDef[] => [
  { tex: t[0], scale: 1.25, parallax: 0.40, topA: 1800, topB: y1 },
  { tex: t[1], scale: 1.31, parallax: 0.43, topA: 1950, topB: y2 },
  { tex: t[2], scale: 1.34, parallax: 0.49, topA: 2100, topB: y3 },
];

// ---- 贴图集表（WorldGen.setBG :7181-7700；style 由世界种子确定性挑选） ----
// 森林（SetForestBGSet :7605：树层 + 远山组；style 见 case）
const FOREST_STYLES: Array<{ m: [number, number]; t: [number, number, number] }> = [
  { m: [7, 8], t: [50, 51, 52] },    // 默认
  { m: [7, 8], t: [50, 51, 52] },    // 1
  { m: [7, 8], t: [53, 54, 55] },    // 2
  { m: [7, 90], t: [91, -1, 92] },   // 3
  { m: [93, 94], t: [-1, -1, -1] },  // 4
  { m: [93, 94], t: [-1, -1, 55] },  // 5
  { m: [171, 172], t: [173, -1, -1] }, // 6
];
const CORRUPT_STYLES: Array<[number, number, number]> = [
  [12, 13, 14], [56, 57, 58], [211, 212, 213], [225, 226, 227], [240, 241, 242], [324, 323, 322],
];
const CRIMSON_STYLES: Array<[number, number, number]> = [
  [43, 44, 45], [105, 106, 107], [174, -1, 175], [214, 215, 216], [-1, 229, 230], [255, 256, 257], [339, 338, 337],
];
const JUNGLE_STYLES: Array<[number, number, number]> = [
  [15, 16, 17], [59, 60, 61], [222, 223, 224], [237, 238, 239], [284, 285, 286], [271, 272, 273], [302, 301, 300],
];
const SNOW_STYLES: Array<[number, number, number]> = [
  [37, 38, 39], [97, 96, 95], [258, 259, 260], [263, 264, 265], [267, 266, 268], [299, 298, -1],
];
const HALLOW_STYLES: Array<[number, number, number]> = [
  [29, 30, 31], [102, 103, 104], [219, 220, 221], [243, 244, 245], [-1, 261, 262], [327, 326, 325],
];
const MUSHROOM_STYLES: Array<[number, number, number]> = [
  [26, 27, 28], [111, 110, 109],
];
const DESERT_STYLES: Array<[number, number, number]> = [
  [21, 20, -1], [108, 109, -1], [207, 208, -1], [217, 218, -1],
];
/** 海洋单层贴图变体（WorldGen.setBG case 7 :7513-7541：style 0-7 → Main.oceanBG，
 *  worldgen 期 setBG(7, random.Next(8)) :7973 掷骰；海洋层 = 单张贴图无树层组） */
const OCEAN_STYLES = [28, 110, 111, 209, 210, 283, 332, 340];
/** 海洋层专属 Y 偏移（DrawSurfaceBG_GetLayerYOffset :59172：case 283→-800 :59220-21、
 *  case 332/340→-25 :59222-25、28/110/111/209/210 走 default 0） */
const OCEAN_YOFF: Record<number, number> = { 283: -800, 332: -25, 340: -25 };
/** 地下带状背景横向视差（Main.cs:1172 caveParallax 默认 0.88;设置项 "Parallax" 可调） */
const CAVE_PARALLAX = 0.88;

// 远山层（bgAlphaFarBackLayer；DrawBG_ModifyBGFarBackLayerAlpha :63703 映射 + setBG 各组）
const FAR_TEX: Record<number, number> = {
  [Corruption]: 23, [Desert]: 24, [CrimsonDesert]: 24, [CorruptDesert]: 24,
  [Jungle]: 15, [Snow]: 35, [Crimson]: 24, [Hallow]: 29, [HallowDesert]: 24,
};

// ---- 地下 style→7 槽贴图表（DrawBackground_UpdateBackgroundStyles :53221 全表） ----
// 槽位: [0]表面过渡 [1]泥土 [2]岩石上 [3]岩石下/群系 [4]岩浆过渡 [5]地狱柱 [6]岩浆体
function ugSlots(style: number, iceBack: number, jungleBack: number, hellBack: number, worldID: number): number[] {
  const t = [0, 0, 0, 0, 0, 125 + hellBack, 185 + hellBack];
  switch (style) {
    case 0: return [1, 2, 4, 3, 6, t[5], t[6]];   // ★原版 switch 后统一覆写 [5]=125+hell/[6]=185+hell(:53418-26),
                                                  //   曾漏覆写(style0 槽位错位→magma/strip 取错贴图)
    case 1: {
      const v = iceBack === 0 ? [40, 33, 34, 32] : iceBack === 1 ? [160, 118, 161, 117]
        : iceBack === 2 ? [164, 165, 166, 167] : [162, 120, 163, 119];
      return [v[0], v[1], v[2], v[3], 128 + hellBack, t[5], t[6]];
    }
    case 2: return [62, 63, 64, 65, 143 + hellBack, t[5], t[6]];
    case 3: return [66, 67, 68, 69, 128 + hellBack, t[5], t[6]];
    case 4: return [70, 71, 68, 72, 128 + hellBack, t[5], t[6]];
    case 5: return [73, 74, 75, 76, 131 + hellBack, t[5], t[6]];
    case 6: return [77, 78, 79, 80, 134 + hellBack, t[5], t[6]];
    case 7: return [77, 81, 79, 82, 134 + hellBack, t[5], t[6]];
    case 8: return [83, 84, 85, 86, 137 + hellBack, t[5], t[6]];
    case 9: return [83, 87, 88, 89, 137 + hellBack, t[5], t[6]];
    case 10: return [121, 122, 123, 124, 140 + hellBack, t[5], t[6]];
    case 11: return jungleBack === 0
      ? [153, 147, 148, 149, 150 + hellBack, t[5], t[6]]
      : [146, 154, 155, 156, 157 + hellBack, t[5], t[6]];
    case 12: return [66, 67, 68, 193 + worldID % 4, 128 + hellBack, t[5], t[6]];
    case 13: return [66, 67, 68, 188 + worldID % 5, 128 + hellBack, t[5], t[6]];
    case 14: return [66, 67, 68, 197 + worldID % 3, 128 + hellBack, t[5], t[6]];
    case 15: return [40, 33, 34, 200, 128 + hellBack, t[5], t[6]];
    case 16: return [40, 33, 34, 201 + worldID % 2, 128 + hellBack, t[5], t[6]];
    case 17: return [40, 33, 34, 203 + worldID % 4, 128 + hellBack, t[5], t[6]];
    case 18: return [290, 291, 0, 0, 0, t[5], t[6]];
    case 19: return [292, 293, 0, 0, 0, t[5], t[6]];
    case 20: return [294, 295, 0, 0, 0, t[5], t[6]];
    case 21: return [296, 297, 0, 0, 0, t[5], t[6]];
    default: return [1, 2, 4, 3, 6, t[5], t[6]];  // 同上统一覆写
  }
}

/** 确定性伪随机（世界种子派生；替代原版 RandomizeBackgrounds 的 worldgen 期随机） */
function seedPick(seed: number, salt: number, n: number): number {
  let h = (seed ^ (salt * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  // 关键：最终异或返回有符号 int32，必须 >>> 0 归正，否则负数 % n 得负索引
  // （曾致 FOREST_STYLES[-2] → undefined → drawSurface 崩溃、渲染循环整体停摆）
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

interface Cam { x: number; y: number; zoom: number }

/** 绘制后端抽象(docs/webgl2-migration-plan.md #1):2D/GL 双实现共用
 *  同一份几何/视差/带序数学。img = 9 参 drawImage 等价;tint 语义 =
 *  canvas multiply+destination-in(2D 侧走既有 tintCache 烘焙,GL 侧 uniform) */
export interface BGBlit {
  img(im: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    opts?: { alpha?: number; tint?: readonly [number, number, number] | null }): void;
  fill(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a?: number): void;
}

/** 2D 后端:包装既有 ctx 行为(globalAlpha / tint 走 drawTiledTinted 烘焙缓存) */
class CanvasBgBlit implements BGBlit {
  constructor(private bg: BiomeBackground, private ctx: CanvasRenderingContext2D) {}
  img(im: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    opts?: { alpha?: number; tint?: readonly [number, number, number] | null }): void {
    const ctx = this.ctx;
    const alpha = opts?.alpha ?? 1;
    const tint = opts?.tint ?? null;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (tint && !(tint[0] >= 0.999 && tint[1] >= 0.999 && tint[2] >= 0.999)) {
      // 与旧路径同款:tint 时整图烘焙(忽略 src 子区——消费方恒全图)
      this.bg.drawTiledTinted(ctx, im, tint[0], tint[1], tint[2], dx, dy, dw, dh);
    } else {
      ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }
  fill(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

export class BiomeBackground {
  /** Main.cloudBGAlpha（:58782-58792 漂移累积器，cloudBG 大云图双层 α 源；
   *  与 SkyRenderer 同名位同式——HorizonClouds 强度消费那份，此处消费云图层 α） */
  private cloudBGAlpha = 0;
  /** Main.cloudBGX[2]（:58796-58804/:58845-58852 风漂移累积，wrap ±w·scale） */
  private cloudBGX = new Float64Array(2);
  /** 贴图懒加载缓存（n → img；-1 = 加载失败） */
  private imgs = new Map<number, ImageBitmap | HTMLImageElement | null>();
  /** 地表风格状态（≈Main.bgStyle/bgDelay/bgAlphaFrontLayer/bgAlphaFarBackLayer） */
  bgStyle = 0;
  /** 瞬切计数（instantBGTransitionCounter :63518；森林→森林同生成背景） */
  private instantBG = 0;
  /** BackgroundChangeFlashInfo._flashPower（13 area 槽；Renderer 消费画黑闪） */
  readonly bgFlash = new Float64Array(13);
  private lastFlashStyle = -1;   // −1=未登记（首帧只登记不闪）
  /** 森林风格 → 该段 WorldGen 生成背景 ID（GetCurrentBackgroundOfStyle :8062
   *  的 treeBG1..4 = treeStyle[0..3]；等值 ⇒ 视觉相同 ⇒ 过渡可瞬切） */
  private forestBgId(world: World, style: number): number {
    const seg = style === Forest1 ? 0 : style === Forest2 ? 1 : style === Forest3 ? 2 : 3;
    return world.treeStyle?.[seg] ?? -1;
  }
  private bgDelay = 0;
  private alphaFront = new Array(16).fill(0);
  private alphaFar = new Array(16).fill(0);
  /** 岩浆背景动画累计 ms（magmaBGFrameCounter 每 8 tick=133.33ms 推帧,mod 3） */
  private magmaFrameT = 0;
  /** 地下风格（≈Main.undergroundBackground/oldUndergroundBackground/ugBackTransition） */
  ugStyle = 0;
  private ugOld = 0;
  private ugAlpha = 0; // 新风格不透明度（旧→新过渡）
  /** 兜底告警去重（每 tag 只报一次；附现场信息便于排查播种异常根因） */
  private warnedTags = new Set<string>();
  private fallbackWarn(tag: string, info: Record<string, unknown>) {
    if (this.warnedTags.has(tag)) return;
    this.warnedTags.add(tag);
    // JSON.stringify 成单行文本：控制台直接可复制（对象形式需手动展开，不便回传）
    console.warn(`[BiomeBackground] 样式兜底触发(${tag})：播种状态异常，已回退默认贴图集防崩溃。现场: ${JSON.stringify(info)}`);
  }
  /** 带告警的风格数组取值：索引缺失/越界时回退 [0] 并留现场 */
  private pickStyle<T>(tag: string, arr: T[], idx: number | undefined, world: World): T {
    const v = arr[idx ?? -1];
    if (v === undefined) {
      this.fallbackWarn(tag, {
        seed: world.seed, seededFor: this.seededFor, idx, arrLen: arr.length,
        forestStyles: this.forestStyles, corruptStyle: this.corruptStyle, caveBackStyle: this.caveBackStyle,
        bgStyle: this.bgStyle, ugStyle: this.ugStyle,
      });
      return arr[0];
    }
    return v;
  }

  /** Main.oceanBG 等价读数（WorldGen.setBG case 7 :7513-7541 style→贴图映射） */
  private oceanTexId(): number {
    return OCEAN_STYLES[this.oceanStyle] ?? OCEAN_STYLES[0];
  }

  /** 世界派生随机档（原版 worldgen 期掷骰的运行时重建） */
  private forestStyles: number[] = [];
  private corruptStyle = 0;
  private crimsonStyle = 0;
  private jungleStyle = 0;
  private snowStyle = 0;
  private hallowStyle = 0;
  private mushroomStyle = 0;
  private desertStyle = 0;
  /** 海洋贴图变体档（≈WorldGen.oceanBG style 0-7；seedFor 重建） */
  private oceanStyle = 0;
  private iceBack = 0;
  private jungleBack = 0;
  private hellBack = 0;
  private caveBackX: number[] = [];
  private caveBackStyle: number[] = [];
  private underworldStyle = 0;
  private seededFor = -1;
  /** 地狱多层背景贴图缓存(Underworld_0-13,与 Background_N 分池) */
  private hellImgs = new Map<number, ImageBitmap | HTMLImageElement | null>();
  private hellFrameT = 0;
  private hellImg(n: number): ImageBitmap | HTMLImageElement | null {
    if (n < 0) return null;
    if (this.hellImgs.has(n)) return this.hellImgs.get(n) ?? null;
    loadBitmapOnly(`vanilla/Underworld_${n}.png`, () => this.hellImgs.has(n), (x) => this.hellImgs.set(n, x));
    return null;
  }

  private img(n: number): ImageBitmap | HTMLImageElement | null {
    if (n < 0) return null;
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    loadBitmapOnly(`vanilla/Background_${n}.png`, () => this.imgs.has(n), (x) => this.imgs.set(n, x));
    return null;
  }

  /** 进图前预载出生点场景背景(森林初始风格的山+树 5 张,~47MB 解码)。
   *  Game.preloadSceneAssets 在 onWorldReady 前调用——否则首帧背景图动态加载有闪空 */
  async preloadInitial(world: World): Promise<void> {
    this.seedFor(world);
    const st = FOREST_STYLES[this.forestStyles[0] % FOREST_STYLES.length];
    const ids = [...st.m, ...st.t].filter((n) => n >= 0);
    await this.loadBg(ids);
  }

  /** 群系预测性预热(Game 场景扫描 15 tick 调用):当前群系对应的视差贴图
   *  后台取齐,跨群系旅行不闪空。fire-and-forget */
  warm(scene: SceneFlags): void {
    if (this.seededFor === -1) return; // 尚未播种(preloadInitial/draw 先行),跳过防取错风格
    const styles: number[][] = [];
    if (scene.zoneCorrupt) styles.push(CORRUPT_STYLES[this.corruptStyle]);
    else if (scene.zoneCrimson) styles.push(CRIMSON_STYLES[this.crimsonStyle]);
    else if (scene.zoneJungle) styles.push(JUNGLE_STYLES[this.jungleStyle]);
    else if (scene.zoneSnow) styles.push(SNOW_STYLES[this.snowStyle]);
    else if (scene.zoneHallow) styles.push(HALLOW_STYLES[this.hallowStyle]);
    else if (scene.zoneGlowshroom) styles.push(MUSHROOM_STYLES[this.mushroomStyle]);
    else if (scene.zoneDesert) styles.push(DESERT_STYLES[this.desertStyle]);
    // 海洋 = 单张 oceanBG 贴图（Step2 far 槽 3，Main.cs:59348-59351）
    else if (scene.zoneBeach) styles.push([this.oceanTexId()]);
    if (!styles.length) return; // 森林已在 preloadInitial 就位
    void this.loadBg(styles[0].filter((n) => n >= 0));
  }

  /** 后台加载背景贴图集(去重 + decode 预热) */
  private loadBg(ids: number[]): Promise<void> {
    return Promise.all(ids.map((n) => new Promise<void>((resolve) => {
      if (this.imgs.has(n)) return resolve();
      const im = new Image();
      im.onload = () => {
        // bitmap 就绪才 resolve(2048px 级;失败回退存 Image=永不缺图)
        upgradeToBitmap(im, (b) => { this.imgs.set(n, b); resolve(); }, () => { this.imgs.set(n, im); resolve(); });
        if (!SpriteAtlas.USE_BITMAP) { this.imgs.set(n, im); resolve(); }
      };
      im.onerror = () => resolve();
      im.src = `sprites/vanilla/Background_${n}.png`;
    }))).then(() => undefined);
  }

  private seedFor(world: World) {
    if (this.seededFor === world.seed) return;
    this.seededFor = world.seed;
    const s = world.seed >>> 0;
    this.forestStyles = [0, 1, 2, 3].map((i) => seedPick(s, 11 + i, FOREST_STYLES.length));
    this.corruptStyle = seedPick(s, 21, CORRUPT_STYLES.length);
    this.crimsonStyle = seedPick(s, 22, CRIMSON_STYLES.length);
    this.jungleStyle = seedPick(s, 23, JUNGLE_STYLES.length);
    this.snowStyle = seedPick(s, 24, SNOW_STYLES.length);
    this.hallowStyle = seedPick(s, 25, HALLOW_STYLES.length);
    this.mushroomStyle = seedPick(s, 26, MUSHROOM_STYLES.length);
    this.desertStyle = seedPick(s, 27, DESERT_STYLES.length);
    // 海洋（WorldGen.cs:7973 setBG(7, random.Next(8)) 的运行时重建）
    this.oceanStyle = seedPick(s, 28, OCEAN_STYLES.length);
    this.iceBack = seedPick(s, 31, 4);
    this.jungleBack = seedPick(s, 32, 2);
    this.hellBack = seedPick(s, 33, 3);
    // 地狱多层背景风格(WorldGen.cs:7975 setBG(9, Next(3));World.underworldBG 若有存档值优先)
    this.underworldStyle = world.underworldBG || seedPick(s, 34, 3);
    // caveBackX 四段边界（原版 worldgen 期设定；按世界宽近似重建）+ 每段基础风格 0..6
    const w = world.store.w;
    this.caveBackX = [Math.floor(w * 0.22), Math.floor(w * 0.42), Math.floor(w * 0.65)];
    this.caveBackStyle = [0, 1, 2, 3].map((i) => seedPick(s, 41 + i, 7));
    // ★R16-5（2026-08-24）：存档落盘值优先（WF57 setBG 0-12 随 .wld 头/本仓
    //  SaveData.header.bgStyles 落盘）——导入档/重开档不再按 seed 重掷回默认
    const bg = world.bgStyles;
    if (bg) {
      if (Array.isArray(bg.cave) && bg.cave.length === 4) this.caveBackStyle = [...bg.cave];
      this.iceBack = bg.ice;
      this.jungleBack = bg.jungle;
      this.hellBack = bg.hell;
      this.mushroomStyle = bg.mushroom;
      this.underworldStyle = bg.underworld;
    }
  }

  /** GetPreferredBGStyleForPlayer :63658-63705 优先级链 */
  preferredStyle(scene: SceneFlags, tileX: number): number {
    if (scene.zoneBeach) {
      return scene.zoneHallow ? Hallow : scene.zoneCorrupt ? Corruption
        : scene.zoneCrimson ? Crimson : Ocean;
    }
    if (scene.zoneGlowshroom) return Mushroom;
    if (scene.zoneDesert) {
      return scene.zoneCorrupt ? CorruptDesert : scene.zoneCrimson ? CrimsonDesert
        : scene.zoneHallow ? HallowDesert : Desert;
    }
    if (scene.zoneHallow) return Hallow;
    if (scene.zoneCorrupt) return Corruption;
    if (scene.zoneCrimson) return Crimson;
    if (scene.zoneJungle) return Jungle;
    if (scene.zoneSnow) return Snow;
    const treeX = this.caveBackTreeX ?? [0, 0, 0];
    if (tileX >= treeX[0]) return tileX < treeX[1] ? Forest2 : tileX >= treeX[2] ? Forest4 : Forest3;
    return Forest1;
  }
  private caveBackTreeX: number[] | null = null;

  /** Main.bgAlphaFrontLayer[style] 等价读数（只读引用；AmbientSky.GetColor 六族乘子等
   *  下游消费源）。槽语义 = Main.cs:58951-59030，与上方 bgStyle 常量表一致。
   *  （AmbientSky 实体与背景层共用同一渐变态，避免双状态机漂移。） */
  frontLayer(): ArrayLike<number> {
    return this.alphaFront;
  }

  /** 每帧状态推进：风格切换延迟 + alpha 渐变（UpdateBGVisibility ±0.05/帧，:63534/:63594） */
  update(world: World, scene: SceneFlags, dtMs: number,
    geom?: { centerTileX: number; topTileY: number; bottomTileY: number }) {
    this.seedFor(world);
    if (!this.caveBackTreeX) {
      // 森林四段边界：原版用 treeX[0..2]（WorldGen 生成）；优先用 world.treeX
      this.caveBackTreeX = world.treeX?.length === 3 ? world.treeX : [
        Math.floor(world.store.w * 0.25), Math.floor(world.store.w * 0.5), Math.floor(world.store.w * 0.75),
      ];
    }
    const frames = dtMs / (1000 / 60);
    // 地表风格过渡全链（DrawBG :63438-63449 + HandleBackgroundTransition :63508-63527）：
    // ① bgDelay<0 = 负冷却：计数归零期间锁风格（:63440-63442），防边界来回抖动
    // ② 森林→森林且两段 WorldGen 生成背景相同（treeStyle 相等）→ 瞬切
    //    （:63510-63520 instantBGTransitionCounter=1 + transitionSpeed=1 一帧吸合；
    //    曾缺 = 跨 treeX 段界多走 20 帧交叉渐变 = 用户实报"衔接有问题"）
    // ③ 等待帧数：新风格是森林 60 帧、否则 30（:63522 num = flag2?60:30——曾恒 30）
    // ④ 切换后：进森林 bgDelay=0 无冷却；否则 -60 负冷却 60 帧（:63524-63527，曾缺）
    // ⑤ 等待期回摆：preferred 折返时 bgDelay 逐帧衰减而非清零（:63443-63444）
    const want = this.preferredStyle(scene, geom?.centerTileX ?? scene.tileX);
    let speed = 0.05;
    const isForestStyle = (st: number) => st === Forest1 || st === Forest2 || st === Forest3 || st === Forest4;
    if (this.bgDelay < 0) {
      this.bgDelay = Math.min(0, this.bgDelay + frames);
    } else if (want !== this.bgStyle) {
      if (isForestStyle(this.bgStyle) && isForestStyle(want)
        && this.forestBgId(world, this.bgStyle) === this.forestBgId(world, want)) {
        this.instantBG = 2;   // 瞬切（原 counter=1；帧率浮动保险 2 帧，speed=1 吸合）
      } else {
        this.bgDelay += frames;
        const num = isForestStyle(want) ? 60 : 30;
        if (this.bgDelay > num) {
          this.bgDelay = isForestStyle(want) ? 0 : -60;
          this.bgStyle = want;
        }
      }
    } else if (this.bgDelay > 0) {
      this.bgDelay = Math.max(0, this.bgDelay - frames);
    }
    if (this.instantBG > 0) {
      this.instantBG--;
      this.bgStyle = want;
      speed = 1;
    }
    // BackgroundChangeFlashInfo（BackgroundChangeFlashInfo.cs 1:1）：样式落定即
    // flash[area]=1（ValueChanged :36-40 的 !gameMenu 门——本类只服务游戏内），
    // Renderer 于地表背景后画全屏黑闪遮罩（DrawSurfaceBG_DrawChangeOverlay
    // :60533-60542）。★原版"过渡"= 交叉淡化（上）+ 黑闪遮罩双保险，非纯淡出。
    // ★检测 bgStyle 实变（delayed/instant 两处赋值汇合点），非 want 变化时
    { // （want 先变只进 bgDelay 计数，flash 须等真正落定）
      for (let i = 0; i < this.bgFlash.length; i++) {
        this.bgFlash[i] = Math.max(0, this.bgFlash[i] - 0.05 * frames);   // UpdateFlashValues :31-37
      }
      if (this.lastFlashStyle === -1) {
        this.lastFlashStyle = this.bgStyle;   // 首帧只登记不闪（原版 flash 燒在生成期被加载屏盖住）
      } else if (this.bgStyle !== this.lastFlashStyle) {
        const area = STYLE_TO_AREA[this.bgStyle];
        if (area !== undefined) this.bgFlash[area] = 1;
        this.lastFlashStyle = this.bgStyle;
      }
    }
    // 前景层 alpha（UpdateBGVisibility_FrontLayer :63534-63551）：升 0.05/帧；
    // 降侧有沙漠变体互换豁免（:63566-63582 IsDesertVariantSwap {2,5,13,14}）——
    // 新沙漠变体未到 1 前旧变体 alpha 持平（防跨腐化/猩红沙漠行走时的暗闪）
    for (let l = 0; l < 16; l++) {
      const target = l === this.bgStyle ? 1 : 0;
      if (target === 1) {
        this.alphaFront[l] = Math.min(1, this.alphaFront[l] + speed * frames);
      } else if (this.alphaFront[l] !== 0) {
        const dvSwap = (this.bgStyle === 2 || this.bgStyle === 5 || this.bgStyle === 13 || this.bgStyle === 14)
          && (l === 2 || l === 5 || l === 13 || l === 14) && l !== this.bgStyle;
        if (!dvSwap || this.alphaFront[this.bgStyle] < 1) {
          this.alphaFront[l] = Math.max(0, this.alphaFront[l] - speed * frames);
        }
      }
    }
    // 远山层 alpha（bgStyle→far 槽映射简化为同号；海洋 = Step2 专属 far 槽 3，
    // UpdateBGVisibility_BackLayer case 4 :63636-63638，本仓按同号 Ocean 槽驱动）
    const farTarget = FAR_TEX[this.bgStyle] !== undefined || this.bgStyle === Ocean
      ? this.bgStyle : -1;
    for (let l = 0; l < 16; l++) {
      const target = l === farTarget ? 1 : 0;
      this.alphaFar[l] += target > this.alphaFar[l] ? Math.min(frames * 0.05, target - this.alphaFar[l]) : Math.max(-frames * 0.05, target - this.alphaFar[l]);
    }
    // 地下风格（:52245-52249：变更时新旧并行，ugBackTransition -= 0.25/帧）
    const ugWant = this.pickUnderground(world, scene, geom);
    if (ugWant !== this.ugStyle) {
      if (this.ugAlpha > 0 && this.ugStyle === ugWant) { /* noop */ }
      this.ugOld = this.ugStyle;
      this.ugStyle = ugWant;
      this.ugAlpha = 0;
    }
    this.ugAlpha = Math.min(1, this.ugAlpha + frames * 0.25);
  }

  /** DrawBackground_PickUndergroundBackgroundStyle :53454-53540。
   *  ★采样 = 屏幕中心 tile（:53456 num，同地表森林分段）；雪深门 = 屏底+1200px
   *  （:53471）；深岩带 = 屏顶 tile（:53487 screenPosition.Y/16）——曾全用玩家 */
  private pickUnderground(world: World, scene: SceneFlags,
    geom?: { centerTileX: number; topTileY: number; bottomTileY: number }): number {
    const x = geom?.centerTileX ?? scene.tileX;
    const topTileY = geom?.topTileY ?? scene.tileY;
    const bottomTileY = geom?.bottomTileY ?? scene.tileY;
    const w = world.store.w;
    const segIdx = x <= this.caveBackX[0] ? 0 : x <= this.caveBackX[1] ? 1 : x > this.caveBackX[2] ? 3 : 2;
    if (this.caveBackStyle[segIdx] === undefined) {
      this.fallbackWarn('caveBack', { seed: world.seed, seededFor: this.seededFor, segIdx, x, caveBackStyle: this.caveBackStyle });
    }
    let style = this.caveBackStyle[segIdx] ?? 0;
    style += 3;
    // 雪原洞穴（:53470-53473：SnowTileCount>Threshold（=zoneSnow） &&
    // (屏底+1200px)/16 < maxTilesY−250——锚=屏底非玩家，且无地表下限门）
    if (scene.zoneSnow && bottomTileY + 75 < world.store.h - 250) style = 1;
    // 丛林洞穴（:53474-53483）：雪洞内须 JungleTileCount>SnowTileCount 才让位
    // （雪/丛林边界雪洞保持），非雪洞无条件——曾无条件覆盖=雪洞被丛林抢
    if (scene.zoneJungle) {
      if (style === 1) {
        if (scene.jungleTileCount > scene.snowTileCount) style = 11;
      } else {
        style = 11;
      }
    }
    // 沙滩地下
    if (scene.zoneBeach) {
      style = scene.zoneCorrupt ? 19 : scene.zoneCrimson ? 21 : scene.zoneHallow ? 20 : 18;
    } else if (topTileY > world.rockLevel + 60 && topTileY < (world.lavaLine || world.store.h - 200) - 60) {
      if (scene.zoneSnow) style = scene.zoneCorrupt ? 15 : scene.zoneCrimson ? 16 : scene.zoneHallow ? 17 : style;
      else if (scene.zoneCorrupt) style = 12;
      else if (scene.zoneCrimson) style = 13;
      else if (scene.zoneHallow) style = 14;
    }
    if (scene.zoneGlowshroom) style = 2;
    return style;
  }

  /** 主绘制：插在 sky.draw 之后、世界变换之前（屏幕空间）。
   *  target = 2D ctx(旧路径)或 BGBlit(GL 路径,docs/webgl2-migration-plan.md #1) */
  draw(
    target: CanvasRenderingContext2D | BGBlit, world: World, scene: SceneFlags,
    cam: Cam, viewW: number, viewH: number, tint: [number, number, number], dtMs: number,
    /** 渲染相位(2026-08-20 地下背景光照修复):surface=只画地表层(主画布,天空
     *  侧,cots 染);underground=只画地下层(★须画进 Renderer 世界层=被光照图乘
     *  ——原版 Main.cs:52327 起地下背景逐 16px 段 Lighting.GetColor 点亮,暗段
     *  跳过/部分亮段 9-slice 渐变,与屏空间 lightCanvas 乘法等价;曾画主画布
     *  =worldLayer 分层后不吃光,洞里恒亮且与时间无关)。缺省两者都画(旧序) */
    phase: 'all' | 'surface' | 'underground' = 'all',
  ) {
    const b: BGBlit = typeof (target as BGBlit).img === 'function'
      ? (target as BGBlit) : new CanvasBgBlit(this, target as CanvasRenderingContext2D);
    // Main.screenPosition 语义 = 屏幕【左上角】的世界坐标 = 中心 - 半屏/zoom。
    // ★曾写 `cam.y - viewH/2/1`——/1 是缩放占位符：zoom 1.25 下屏顶世界 Y 差
    // viewH/2×(1-1/zoom) ≈ 86px，num3 偏大 → bgTopY = num3×topA+topB 整体
    // 下移 ~40px = 用户实报"远景背景图 Y 轴偏下"根因（2026-08-19）
    const camTopY = cam.y - viewH / 2 / cam.zoom;
    const camLeftX = cam.x - viewW / 2 / cam.zoom;
    // ★采样几何（原版双轨）：森林四段分界/地下 caveBack 分段 =【屏幕中心】tile
    // （GetPreferredBGStyleForPlayer :63664 num2、PickUndergroundBackgroundStyle
    // :53456 num——均 (screenPosition.X+screenWidth/2)/16）；群系 zone 判定 =
    // 玩家中心（SceneMetrics 169×124 窗口）。曾全用玩家 tile=半屏 ~30 格偏差
    const geom = {
      centerTileX: Math.floor(cam.x / 16),
      topTileY: Math.floor(camTopY / 16),
      bottomTileY: Math.floor((camTopY + viewH / cam.zoom) / 16),
    };
    this.update(world, scene, dtMs, geom);
    // 深度门（DrawClouds_Closest :59073 系各层共门 screenPosition.Y < ws×16+16）
    if (phase !== 'underground' && camTopY < world.groundLevel * 16 + 16) {
      this.drawSurface(b, world, cam, camTopY, camLeftX, viewW, viewH, tint);
    }
    if (phase !== 'surface') {
      this.drawUnderground(b, world, cam, camTopY, viewW, viewH, dtMs);
    }
  }

  // ---- 地表层 ----
  private drawSurface(
    b: BGBlit, world: World, cam: Cam,
    camTopY: number, camLeftX: number, viewW: number, viewH: number, tint: [number, number, number],
  ) {
    this.seedFor(world); // 兜底：即便 update 未先行播种也不崩（HMR/首帧边界）
    // 垂直视差系数（DrawSurfaceBG :58749：num3 = -(screenPosition.Y-300)/(worldSurface*16)）
    const num3 = -(camTopY - 300) / (world.groundLevel * 16);
    // scAdj(DrawBG :63418 ComputeScAdj :63389-63413):世界深度视差补偿——
    // num=worldSurface·16/(screenY+screenH),k=max((maxTilesY·0.15·16−screenY)·
    // 0.00025,0)²,按世界高度档 ×(−500/−300/−150)。screenY=屏顶世界 Y。
    // pushBGTopHack(DrawCloudsBG :58722-58774):num=30 in-game / 0 gameMenu(本渲染器
    // 仅 in-game,菜单 0 档注释备案);drunkWorldGen 内 onlyShimmerOcean −240(该
    // 秘密种子未实装,恒不可达) / vampireSeed −100 / !notTheBees −180。
    // ★2026-08-20 审计补齐:此前两层都漏,表面背景整体垂直偏移(小世界 ≈
    // −154+30px);与 tree 层 topY=num3·topA+topB+scAdj+push 同式(Main.cs
    // :58840 系 treeMntBGSet 赋值块)
    const worldH = world.store?.h ?? 1200;   // 无 store(桩)按小世界档
    const screenTopYv = camTopY;
    const screenHworld = viewH / cam.zoom;   // 世界像素屏高
    const scNum = (world.groundLevel * 16) / Math.max(1, screenTopYv + screenHworld);
    let scK = (worldH * 0.15 * 16 - screenTopYv) * 0.00025;
    if (scK < 0) scK = 0;
    const scAdj = scNum * (0.45 - scK * scK)
      * (worldH <= 1200 ? -500 : worldH <= 1800 ? -300 : -150);
    // Main.cs:58722-58732（drunkWorldGen = seedFlags.drunkWorld——05162020/
    // drunkworld/getfixedboi 置位；notTheBees 同表；onlyShimmerOcean 秘密种子未实装）
    const sfSeed = world.seedFlags ?? {};
    const pushHack = sfSeed.drunkWorld
      ? (sfSeed.vampireSeed ? -100 : !sfSeed.notTheBees ? -180 : 30)
      : 30;
    const [tr0, tg0, tb0] = tint;
    const tintOn: readonly [number, number, number] | null
      = tr0 >= 0.999 && tg0 >= 0.999 && tb0 >= 0.999 ? null : [tr0, tg0, tb0];
    const drawLayer = (l: LayerDef, alpha: number) => {
      if (alpha <= 0.01 || l.tex < 0) return;
      const im = this.img(l.tex);
      if (!im || !(im.width > 0) || im.width === 0) return;
      const wScaled = im.width * l.scale;
      // 横向视差锚 = 屏幕左缘（Main.cs :58860 bgStartX = -IEEERemainder(
      // screenPosition.X×bgParallax, w) - w/2 - w——比正模多退一整块,配 +4 档
      // loops 保屏）。曾用 cam.x(中心)——差 viewW/2/zoom×parallax 常量相位偏移
      const startX = -BiomeBackground.ieeeRemOf(camLeftX * l.parallax, wScaled) - wScaled / 2 - wScaled;
      const loops = Math.ceil(viewW / wScaled) + 3;
      const topY = num3 * l.topA + l.topB + scAdj + pushHack; // 屏幕空间 y（vanilla bgTopY 语义,含 scAdj+pushHack）
      // ★+1px 保险重叠:浮点视差位置(startX 取模 cam.x*parallax)+非整数缩放
      // (naturalWidth×1.25)下,相邻背景图独立光栅化在接缝处留 1px 缺口(发丝缝),
      // 双线性平滑还会把边缘混透明放大缝。外扩 1px 让邻图覆盖接缝
      const dw = wScaled + 1;
      for (let i = 0; i < loops; i++) {
        b.img(im, 0, 0, im.width, im.height, startX + i * wScaled, topY, dw, im.height * l.scale,
          { alpha, tint: tintOn });
      }
    };
    // ---- cloudBG 大云图双层（Main.cs:58787-58871，Background 112/113）----
    // 门 = cloudBGAlpha>0（累积器 :58781-58792：cloudBGActive>0 时 +0.0005·dayRate/t
    //  否则 −，钳 0..1；门 = !drunkWorld && camTop ≤ worldSurface+10 tile——阴天/雨雪
    //  天渐显的大云幕，晴天恒 0 不画）。原版序：极光（DrawToDepth 1/0.09 :58829）
    //  在本层之前——Renderer sky.draw 先于 biomeBg.draw 已保证。
    //  层0 = Background 112：scale1.65 / par0.09 / topY=num3·900+600 / α=min(1,α累积)
    //  层1 = Background 113：scale1.85 / par0.12 / topY=num3·1100+750 / α=min(1,α累积×1.5)
    //  色 = ColorOfSurfaceBackgroundsBase×α×num5（:58828/:58831，num5=ProcessCloud
    //  Alpha()×atmo，本仓无塔/月总天空 fade → ProcessCloudAlpha 恒 1）——沿用本文件
    //  既有山层同款约定：α 进 globalAlpha、rgb 走 tint（tint 烘焙缓存按色键控，α 独立
    //  变化不破缓存）。风漂移 cloudBGX += windSpeedCurrent×par×9×dayRate
    //  （FocusHelper.AllowSkyMovement=GameplayActive，游戏内恒真 :58796），wrap ±w·scale。
    {
      const wr = world.weather;
      const dayRate = world.dayRate?.() ?? 1;
      const camTopTiles = camTopY / 16;
      if (!(world.seedFlags?.drunkWorld) && camTopTiles <= world.groundLevel + 10) {
        this.cloudBGAlpha = wr && wr.cloudBGActive > 0
          ? Math.min(1, this.cloudBGAlpha + 0.0005 * dayRate)
          : Math.max(0, this.cloudBGAlpha - 0.0005 * dayRate);
      }
      if (this.cloudBGAlpha > 0) {
        const atmo = atmoOf(cam.y, world.w, world.groundLevel);
        const wind = wr?.windSpeedCurrent ?? 0;
        const sheets = [
          { tex: 112, scale: 1.65, par: 0.09, topA: 900, topB: 600, aMul: 1 },
          { tex: 113, scale: 1.85, par: 0.12, topA: 1100, topB: 750, aMul: 1.5 },
        ] as const;
        for (let s = 0; s < 2; s++) {
          const cf = sheets[s];
          const im = this.img(cf.tex);
          if (!im || !(im.width > 0)) continue;
          const wScaled = im.width * cf.scale;
          this.cloudBGX[s] += wind * cf.par * 9 * dayRate;         // :58796/:58845
          if (this.cloudBGX[s] > wScaled) this.cloudBGX[s] -= wScaled;
          if (this.cloudBGX[s] < -wScaled) this.cloudBGX[s] += wScaled;
          const a = Math.min(1, this.cloudBGAlpha * cf.aMul) * atmo;
          if (a <= 0.01) continue;
          const topY = num3 * cf.topA + cf.topB + scAdj + pushHack;  // :58807/:58854
          const startX = -BiomeBackground.ieeeRemOf(camLeftX * cf.par, wScaled)
            - wScaled / 2 - wScaled + this.cloudBGX[s];              // :58811-58813
          const loops = Math.ceil(viewW / wScaled) + 4;              // :58815 +2+2
          for (let i = 0; i < loops; i++) {
            b.img(im, 0, 0, im.width, im.height, startX + i * wScaled, topY,
              wScaled + 1, im.height * cf.scale, { alpha: a, tint: tintOn });
          }
        }
      }
    }
    // 远山层 Step1（bgAlphaFarBackLayer；parallax 0.15/scale 1，:59240）
    const farTex = FAR_TEX[this.bgStyle];
    if (farTex !== undefined) {
      const a = this.alphaFar[this.bgStyle];
      drawLayer({ tex: farTex, scale: 1, parallax: 0.15, topA: 1300, topB: 1090 }, a);
    } else if (this.bgStyle === Ocean) {
      // ★海洋专属层 = Step2 far 槽 3（Main.cs:59348-59351 bgAlphaFarBackLayer[3] →
      // DrawSurfaceBG_DrawBackMountainsLayer(oceanBG)）。几何取 Step2 共用档
      // （:58919-58937 treeMntBGSet1[1] 设置块）：parallax 0.2 / scale 1.15×num4 /
      // topY = num3×1400+1260，再叠贴图专属 Y 偏移（DrawSurfaceBG_GetLayerYOffset
      // :59172，283→-800/332/340→-25/其余 0）。原版海洋【无】前景树层组——
      // front 槽 4 只画变更换屏闪光 overlay（:58994-58996 DrawChangeOverlay(10)，
      // BackgroundChangeFlashInfo 黑闪,本仓未实装=常态不画），曾经 forest 兜底
      // 画树层是本仓自造,已移除;群系背景全由本层承担。
      const ot = this.oceanTexId();
      drawLayer({ tex: ot, scale: 1.15, parallax: 0.2, topA: 1400, topB: 1260 + (OCEAN_YOFF[ot] ?? 0) }, this.alphaFar[Ocean]);
    }
    // 前景群系层
    const style = this.bgStyle;
    const s = world.seed >>> 0;
    const a = this.alphaFront[style];
    if (style === Forest1 || style === Forest2 || style === Forest3 || style === Forest4) {
      const seg = style === Forest1 ? 0 : style === Forest2 ? 1 : style === Forest3 ? 2 : 3;
      const fs = this.pickStyle('forest', FOREST_STYLES, this.forestStyles[seg], world);
      // 森林远/近树层（_Forest :60708：scale 1.2/1.2/1.4 parallax 0.25/0.25/0.27 topY num3*1600+1400）
      drawLayer({ tex: fs.t[0], scale: 1.2, parallax: 0.25, topA: 1600, topB: 1400 }, a);
      drawLayer({ tex: fs.t[1], scale: 1.2, parallax: 0.25, topA: 1600, topB: 1400 }, a);
      drawLayer({ tex: fs.t[2], scale: 1.4, parallax: 0.27, topA: 1800, topB: 1500 }, a);
      // 森林专属远山（比通用远山更近一档：parallax 0.18）
      if (FAR_TEX[style] === undefined) {
        drawLayer({ tex: fs.m[0], scale: 1, parallax: 0.1, topA: 1300, topB: 1090 }, a);
        drawLayer({ tex: fs.m[1], scale: 1, parallax: 0.18, topA: 1600, topB: 1350 }, a);
      }
    } else if (style === Corruption) {
      for (const l of L3(this.pickStyle('corrupt', CORRUPT_STYLES, this.corruptStyle, world), 1500, 1750, 2000)) drawLayer(l, a);
    } else if (style === Crimson) {
      for (const l of L3(this.pickStyle('crimson', CRIMSON_STYLES, this.crimsonStyle, world), 1500, 1750, 2000)) drawLayer(l, a);
    } else if (style === Jungle) {
      for (const l of L3(this.pickStyle('jungle', JUNGLE_STYLES, this.jungleStyle, world), 1660, 1840, 2060)) drawLayer(l, a);
    } else if (style === Snow) {
      // 雪山对（snowMntBG :7297：parallax 0.23/0.33）
      drawLayer({ tex: 35, scale: 1.25, parallax: 0.23, topA: 1600, topB: 1350 }, a);
      drawLayer({ tex: 36, scale: 1.31, parallax: 0.33, topA: 1950, topB: 1650 }, a);
      for (const l of L3(this.pickStyle('snow', SNOW_STYLES, this.snowStyle, world), 1500, 1750, 2000)) drawLayer(l, a);
    } else if (style === Hallow) {
      for (const l of L3(this.pickStyle('hallow', HALLOW_STYLES, this.hallowStyle, world), 1500, 1750, 2000)) drawLayer(l, a);
    } else if (style === Mushroom) {
      for (const l of L3(this.pickStyle('mushroom', MUSHROOM_STYLES, this.mushroomStyle, world), 1400, 1675, 1950)) drawLayer(l, a);
    } else if (style === Desert || style === CorruptDesert || style === CrimsonDesert || style === HallowDesert) {
      const d = this.pickStyle('desert', DESERT_STYLES, this.desertStyle, world);
      drawLayer({ tex: d[0], scale: 1.25, parallax: 0.37, topA: 1800, topB: 1750 }, a);
      drawLayer({ tex: d[1], scale: 1.34, parallax: 0.49, topA: 2100, topB: 2150 }, a);
    }
    // Ocean(4) 无前景群系层组：原版 front 槽 4 仅变更换屏 overlay（见上方远山区
    // 海洋分支考据注释），群系背景 = Step2 far 层一张 oceanBG,已在上文绘制。
    void s; void viewH;
  }

  /** 带色调平铺绘制（tint 缓存按 (tex,量化tint) 键，避免每帧逐像素）。
   *  ★2026-08-18 canvas 哨兵实抓(用户真机 61/s 持续,晨昏色调漂移期):旧键 =
   *  im.src(bitmap 恒 undefined,跨层串键)+ tint.toFixed(2)(昼夜色调连续漂移
   *  → 每帧新键)+ 超 64 整表 clear()(清光全重烘 = 永远 miss 的雪崩)。
   *  修:WeakMap 纹理 id(bitmap 安全)+ tint 步进 8 量化(背景层 3% 无感)
   *  + 逐条淘汰(工作集 = 层数×色桶 ~10-20 张) */
  private tintCache = new Map<string, HTMLCanvasElement>();

  /** GPU contextlost 后染色缓存内容归零且不会自动重画——失效清理
   *  (Renderer.onLost 统一扫;GL 主路径下通常为空表,零成本) */
  clearTintCache(): void {
    for (const c of this.tintCache.values()) { c.width = 0; c.height = 0; }
    this.tintCache.clear();
  }
  private tintTexIds = new WeakMap<object, number>();
  private tintTexIdSeq = 0;
  drawTiledTinted(
    ctx: CanvasRenderingContext2D, im: ImageBitmap | HTMLImageElement,
    tr: number, tg: number, tb: number, dx: number, dy: number, dw: number, dh: number,
  ) {
    let tid = this.tintTexIds.get(im);
    if (tid === undefined) { tid = ++this.tintTexIdSeq; this.tintTexIds.set(im, tid); }
    const key = `${tid}|${Math.round(tr * 255) & ~7},${Math.round(tg * 255) & ~7},${Math.round(tb * 255) & ~7}`;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(im, 0, 0);
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = `rgb(${Math.round(tr * 255)},${Math.round(tg * 255)},${Math.round(tb * 255)})`;
      cx.fillRect(0, 0, c.width, c.height);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(im, 0, 0);
      this.tintCache.set(key, c);
      if (this.tintCache.size > 64) {
        // 逐条淘汰最旧(整表 clear = 下帧全量重烘雪崩)
        const first = this.tintCache.keys().next().value;
        if (first !== undefined) this.tintCache.delete(first);
      }
    }
    ctx.drawImage(c, dx, dy, dw, dh);
  }

  // ---- 地下层 ----
  // 几何 1:1（Main.cs DrawBackground :52217-53517 各带方法,2026-08-17 重写）：
  //  · 水平周期 = 贴图宽-32（160 宽贴图取中间 128 列,两侧 16px 是 wrap padding——
  //    像素级验证 63/65 在列 16..144 逐像素完美循环;按整宽 160 平铺会每 160px 出一条
  //    图案断缝 = "蘑菇区远景平铺错位"根因）;岩石/岩浆带原版硬编码 128。
  //  · 横向滚动 bgStartX = -IEEERemainder(P+screenX*caveParallax, P) - P/2
  //    （caveParallax=0.88 默认,Main.cs:1172）+ diff = round(-IEEERemainder(
  //    bgStartX+screenX,16))（-8→8）——采样窗对齐世界 16px 网格,src/dst 同移,
  //    防视差平移下纹理"游动"。
  //  · 垂直相位：深层（带顶远在屏上）bgStartY = IEEERemainder(bgTopY,96)-96 行相位
  //    锁到带顶（世界锁定）;浅层 = 带顶原值。步进 96（backgroundHeight[2]/[3]）。
  //  · 带序: slot0 表面条@ws-16 → slot1 泥土带 → slot2 岩石上 16px 条@rockTP-16
  //    → slot3 岩石主体（底=magmaLayer*16+600 行边界）→ slot4 岩浆过渡条@岩石带底
  //    行边界 → slot5 岩浆体（3帧×96,底=UnderworldLayer）→ slot6 波纹条@岩浆带底行边界。
  //  · 逐 16px 切片光照（暗洞挖空/贴墙裁剪）未实装——整行绘制近似,几何与原版一致。
  private drawUnderground(
    b: BGBlit, world: World, cam: Cam,
    camTopY: number, viewW: number, viewH: number, dtMs: number,
  ) {
    const worldID = world.seed >>> 0;
    const newSlots = ugSlots(this.ugStyle, this.iceBack, this.jungleBack, this.hellBack, worldID);
    const oldSlots = ugSlots(this.ugOld, this.iceBack, this.jungleBack, this.hellBack, worldID);
    const alpha = this.ugAlpha;
    const screenX = cam.x - viewW / 2;
    const screenY = camTopY;
    const surfacePx = (world.groundLevel | 0) * 16;
    // GetRockTransitionPoint :52509 —— span 按 int 截断;步进/取模恒 96(backgroundHeight[2])
    const rockSpan = ((world.rockLevel | 0) - (world.groundLevel | 0)) * 16;
    let rockSteps = Math.trunc(rockSpan / 96);
    if (rockSpan % 96 !== 0) rockSteps++;
    const rockTP = (world.groundLevel | 0) * 16 + rockSteps * 96 + 32;
    // :52237 magmaLayer 公式：ws + floor((h-330-ws)/6)*6 - 5（★曾误用 lavaLine(h-200)）
    const magmaLayerTile = Math.floor(world.groundLevel
      + Math.floor((world.store.h - 330 - world.groundLevel) / 6) * 6) - 5;
    const magmaPx = magmaLayerTile * 16;
    const uwPx = (world.store.h - 200) * 16;   // UnderworldLayer
    // 岩浆 3 帧动画（Main.cs:61657-61665：magmaBGFrameCounter 每 8 tick 推进,mod 3;
    // 8 tick = 133.33ms）。岩浆体 125+hell(160×288=3 帧×96px)与过渡/波纹条
    // (160×48,取 16px 行×3 帧)共用同一 frame
    this.magmaFrameT += dtMs;
    const magmaFrame = Math.floor(this.magmaFrameT / 133.33) % 3;
    // ★层序（:52265-52270）：SurfaceTransition → Dirt → 【黑盒打底】→ Rock → Magma。
    // 黑盒 gate = magmaLayer*16 ≤ 屏底（:52815）——带层随后重画覆盖;深处(UnderworldLayer
    // 之下)即原版纯黑地狱背景（本仓清屏非黑,靠这层兜底,曾露天空渐变）
    if (magmaPx <= screenY + viewH) {
      b.fill(0, 0, viewW, viewH, 0, 0, 0, 1);
    }
    // 地狱多层远景背景(DrawUnderworldBackground :52082-52228,画在带层之下):
    // gate = 屏底 ≥ (h-220)*16(:52086);深层带层退化后整屏由本层接管——
    // 层0 底部黑补 (11,3,7) 兜底(:52219-52223)
    this.drawHellLayers(b, world, cam, viewW, viewH, dtMs);
    /** C# Math.IEEERemainder（IEEE round-half-even；实现提为 ieeeRemOf 类级共用） */
    const ieeeRem = (a: number, b: number): number => BiomeBackground.ieeeRemOf(a, b);
    const drawSlots = (slots: number[], a: number) => {
      if (a <= 0.01) return;
      /** 横向滚动参数（:52277/:52836 bgStartX/num2 公式;drawOffset=0 屏幕空间） */
      const scroll = (P: number): { startX: number; diff: number; loops: number } => {
        const startX = Math.trunc(-ieeeRem(P + screenX * CAVE_PARALLAX, P) - P / 2);
        let diff = Math.round(-ieeeRem(startX + screenX, 16));
        if (diff === -8) diff = 8;
        return { startX, diff, loops: Math.trunc(viewW / P) + 2 };
      };
      /** 单带一行绘制（切片几何合并:src/dst 同 +diff,源取中间 P 列） */
      const bandRow = (
        im: ImageBitmap | HTMLImageElement, P: number, startX: number, diff: number,
        loops: number, destY: number, srcY: number, srcH: number,
      ) => {
        // 源窗越界钳制（128 宽老贴图 style0 tex3 原版靠 UV clamp 吃掉,Canvas 需手钳）
        const sx = 16 + diff;
        const w = Math.min(P, im.width - sx);
        if (w <= 0) return;
        const sh = Math.min(srcH, im.height - srcY);
        if (sh <= 0) return;
        for (let i = 0; i < loops; i++) {
          b.img(im, sx, srcY, w, sh, startX + P * i + diff, destY, w, sh, { alpha: a });
        }
      };
      const im0 = slots[0] > 0 ? this.img(slots[0]) : null;
      const im1 = slots[1] > 0 ? this.img(slots[1]) : null;
      const im2 = slots[2] > 0 ? this.img(slots[2]) : null;
      const im3 = slots[3] > 0 ? this.img(slots[3]) : null;
      const im4 = slots[4] > 0 ? this.img(slots[4]) : null;
      const im5 = slots[5] > 0 ? this.img(slots[5]) : null;
      const im6 = slots[6] > 0 ? this.img(slots[6]) : null;
      const ok = (im: ImageBitmap | HTMLImageElement | null): im is ImageBitmap | HTMLImageElement =>
        !!im && im.width > 0;
      // ---- slot0 表面过渡条（:53137-53170: bgTopY = ws*16-16-screenY+16,行 0,16px）----
      if (ok(im0)) {
        const P = im0.width - 32;
        const s = scroll(P);
        const topY = surfacePx - 16 - screenY + 16;
        if (topY > -32 && topY < viewH) bandRow(im0, P, s.startX, s.diff, s.loops, topY, 0, 16);
      }
      // ---- slot1 泥土带（:52826 起: bgTopY = ws*16-screenY+16 → rockTP 截止）----
      if (ok(im1) && surfacePx <= screenY + viewH + 64) {
        const P = im1.width - 32;
        const s = scroll(P);
        const bgTopY = surfacePx - screenY + 16;
        const deep = surfacePx < screenY - 16;
        const startY = deep ? Math.trunc(ieeeRem(bgTopY, 96) - 96) : Math.trunc(bgTopY);
        let loopsY = deep
          ? Math.trunc((viewH - startY) / 96) + 1
          : Math.trunc((viewH - bgTopY) / 96) + 1;
        if (rockTP < screenY + viewH - 16) loopsY = Math.trunc((rockTP - screenY - startY) / 96);
        for (let j = 0; j < loopsY; j++) {
          bandRow(im1, P, s.startX, s.diff, s.loops, startY + im1.height * j, 0, im1.height);
        }
      }
      // ---- slot2 岩石上过渡条（DirtBackground 尾段 :53155-53189: @rockTP-16,P=128,行 0）----
      if (ok(im2)) {
        const s = scroll(128);
        const topY = rockTP - screenY - 16;
        if (topY > -32 && topY < viewH) bandRow(im2, 128, s.startX, s.diff, s.loops, topY, 0, 16);
      }
      // ---- slot3 岩石带主体（DrawRockLayer :52523 起;底 = magmaLayer*16+600 行边界）----
      let rockStartY = 0, rockLoopsY = 0;
      if (ok(im3) && rockTP <= screenY + viewH) {
        const s = scroll(128);
        const bgTopY = rockTP - screenY;
        const deep = rockTP + viewH < screenY - 16;
        const startY = deep ? Math.trunc(ieeeRem(bgTopY, 96) - 96) : Math.trunc(bgTopY);
        let loopsY = deep
          ? Math.trunc((viewH - startY) / 96) + 1
          : Math.trunc((viewH - bgTopY) / 96) + 1;
        if (magmaPx < screenY + viewH) loopsY = Math.trunc((magmaPx + 600 - startY - screenY) / 96);
        rockStartY = startY; rockLoopsY = loopsY;
        for (let j = 0; j < loopsY; j++) {
          bandRow(im3, 128, s.startX, s.diff, s.loops, startY + im3.height * j, 0, im3.height);
        }
      }
      // ---- slot4 岩浆过渡条（DrawMagmaTransition :52765: @岩石带底行边界,行 = frame*16）----
      const magmaTransition = rockTP <= screenY + viewH && magmaPx < screenY + viewH;
      if (ok(im4) && magmaTransition && rockLoopsY > 0) {
        const s = scroll(128);
        bandRow(im4, 128, s.startX, s.diff, s.loops, rockStartY + rockLoopsY * 96, magmaFrame * 16, 16);
      }
      // ---- slot5 岩浆体 + slot6 表面波纹条（DrawMagmaLayer :52276 起）----
      if (ok(im5) && magmaPx <= screenY + viewH) {
        const s = scroll(128);
        const bgTopY = magmaPx - screenY + 16 + 600 - 8;
        const deep = magmaPx + viewH < screenY - 16;
        const startY = deep ? Math.trunc(ieeeRem(bgTopY, 96) - 96) : Math.trunc(bgTopY);
        let loopsY = deep
          ? Math.trunc((viewH - startY) / 96) + 1
          : Math.trunc((viewH - bgTopY) / 96) + 1;
        let ripple = false;
        if (uwPx < screenY + viewH) {
          loopsY = Math.ceil((uwPx - screenY - startY) / 96);
          ripple = true;
        }
        const frameH = im5.height / 3;   // 160×288 = 3 帧 × 96px
        for (let j = 0; j < loopsY; j++) {
          bandRow(im5, 128, s.startX, s.diff, s.loops, startY + 96 * j, Math.min(2, magmaFrame) * frameH, frameH);
        }
        if (ripple && ok(im6)) {
          bandRow(im6, 128, s.startX, s.diff, s.loops, startY + loopsY * 96, magmaFrame * 16, 16);
        }
      }
    };
    drawSlots(oldSlots, 1 - alpha);
    drawSlots(newSlots, alpha);
  }

  /** C# Math.IEEERemainder（IEEE round-half-even）——地表视差/地下带相位共用 */
  static ieeeRemOf(a: number, b: number): number {
    const r = a / b, f = Math.floor(r), d = r - f;
    const n = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
    return a - b * n;
  }

  /** 地狱多层远景背景 1:1(Main.cs DrawUnderworldBackground :52082-52228):
   *  wiki"地狱背景"= 岩柱/岩浆湖/熔岩瀑布岛屿/山体洞穴,五层视差(近→远 parallax
   *  1/3..1/11),风格集 0:[0-4] 1:[5-9] 2:[10,11,12,13,9](WorldGen.cs:7578-7597);
   *  2×2 四帧行动画(帧 8fps,贴图 1/6/7/8/13,:52117-52206 各自 Y 偏移) */
  private drawHellLayers(
    b: BGBlit, world: World, cam: Cam,
    viewW: number, viewH: number, dtMs: number,
  ): void {
    const h = world.store.h;
    const camTopY = cam.y - viewH / 2;
    if (camTopY + viewH < (h - 220) * 16) return;   // :52086 屏底未及 h-220
    this.seedFor(world);
    this.hellFrameT += dtMs;
    const frame = Math.floor(this.hellFrameT / 1000 * 8) % 4;   // (int)(GlobalTime*8)%4
    const SETS = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 9]];
    const set = SETS[this.underworldStyle] ?? SETS[0];
    const uwPx = (h - 200) * 16;                     // UnderworldLayer*16 锚
    const pushUp = (1.25 - 1) * 0.5 * 200;           // zoomForPushUp=GameZoomTarget;取 1.25
    for (let idx = 4; idx >= 0; idx--) {             // :52092 远→近(4→0)
      const texId = set[idx];
      const im = this.hellImg(texId);
      if (!im || !(im.width > 0) || im.width === 0) continue;
      const num2 = idx * 2 + 3;                      // :52109 深度
      const inv = 1 / num2;                          // vector = 1/num2(纵横同)
      const scale = texId === 4 ? 0.5 : 1.3;         // num3(:52113;贴图4细柱条 0.5)
      // 2×2 四帧行动画 + 各贴图 Y/X 偏移(:52117-52206)
      let sx = 0, sy = 0, sw = im.width, sh = im.height;
      let zeroX = 0, zeroY = 0;
      const anim = texId === 1 || texId === 6 || texId === 7 || texId === 8 || texId === 13;
      if (anim) {
        sx = (texId === 1 ? (frame >> 1) : (frame % 2)) * (sw >> 1);
        sy = (texId === 1 ? (frame % 2) : (frame >> 1)) * (sh >> 1);
        sw >>= 1; sh >>= 1;
      }
      switch (texId) {
        case 1: zeroY += 175; break;
        case 2: zeroY += 100; break;
        case 3: zeroY += 75; break;
        case 6: zeroY += -60; break;
        case 7: zeroX -= 400; zeroY += 90; break;
        case 8: zeroY += 90; break;
        case 9: zeroY += -30; break;
        case 10: zeroY += 250 * num2; break;
        case 11: zeroY += 100 * num2; break;
        case 12: zeroY += 20 * num2; break;
        case 13: zeroY += 20 * num2; break;
      }
      zeroY -= pushUp;                               // :52198
      let vecX = Math.floor(sw * 0.5 * scale);       // vec = Size*0.5(动画已半) *num3 后 Floor
      let vecY = Math.floor(sh * 0.5 * scale);
      const num10 = scale * sw;                      // 单次绘制宽
      const num11 = Math.floor((cam.x * inv - vecX + zeroX - viewW / 2) / num10);   // :52201
      const num13 = Math.floor(scale * ((sw - 1) / inv));                           // :52204
      // vec2(:52205-52206):X 按 num11 锚定平铺;Y 锚 UnderworldLayer 经深度投影
      let x0 = Math.floor(((num11 - 2) * num13 + vecX - cam.x) * inv + viewW / 2 - vecX + zeroX);
      const y0 = Math.floor((uwPx + vecY - cam.y) * inv + viewH / 2 - vecY + zeroY);
      const loops = Math.ceil(viewW / num10);
      const dh = sh * scale;
      for (let i = num11 - 2; i <= num11 + 4 + loops; i++) {
        b.img(im, sx, sy, sw, sh, x0, y0, num10, dh);
        if (idx === 0) {                             // 层0 底部黑补 rgb(11,3,7)(:52219-52223)
          const bot = y0 + dh;
          if (bot < viewH) {
            b.fill(x0, bot, num10, viewH - bot, 11 / 255, 3 / 255, 7 / 255);
          }
        }
        x0 += num10;
      }
    }
  }
  // ---- SunGradients.BackgroundDrawers(SunGradients.cs:175-189,2026-08-20 原版化)----
  /** 13 项渐变带表:[颜色, bgAlphaFrontLayer 槽, 纹理判定集]——活动槽的选型
   *  纹理表包含判定 id 时,以 colorgradientdither 在背景树顶画渐隐带(把
   *  群系背景结构顶部融进天空)。Draw() 见 SkyRenderer.drawHorizonGradients。 */
  surfaceGradientBands(): Array<{ rgb: readonly [number, number, number]; alpha: number }> {
    const out: Array<{ rgb: readonly [number, number, number]; alpha: number }> = [];
    const has = (ids: readonly number[], check: readonly number[]) =>
      check.some((c) => ids.includes(c));
    // 森林四槽(0/10/11/12 = treeBGSet1-4):每槽双带 @176/@179
    const forestSlots = [Forest1, Forest2, Forest3, Forest4];
    for (const slot of forestSlots) {
      const seg = slot === Forest1 ? 0 : slot === Forest2 ? 1 : slot === Forest3 ? 2 : 3;
      const st = FOREST_STYLES[this.forestStyles[seg] % FOREST_STYLES.length];
      const ids = [...st.m, ...st.t];
      const a = this.alphaFront[slot];
      if (a > 0) {
        if (has(ids, [176])) out.push({ rgb: [116, 191, 255], alpha: a });
        if (has(ids, [179])) out.push({ rgb: [157, 192, 255], alpha: a });
      }
    }
    // 沙漠 @248
    if (this.alphaFront[Desert] > 0
      && has(DESERT_STYLES[this.desertStyle].filter((n) => n >= 0), [248])) {
      out.push({ rgb: [184, 211, 245], alpha: this.alphaFront[Desert] });
    }
    // 雪原 @263/268/269
    if (this.alphaFront[Snow] > 0 && has(SNOW_STYLES[this.snowStyle], [263, 268, 269])) {
      out.push({ rgb: [169, 241, 255], alpha: this.alphaFront[Snow] });
    }
    // 丛林双带 @59/@284
    if (this.alphaFront[Jungle] > 0) {
      const jids = JUNGLE_STYLES[this.jungleStyle];
      if (has(jids, [59])) out.push({ rgb: [220, 255, 109], alpha: this.alphaFront[Jungle] });
      if (has(jids, [284])) out.push({ rgb: [141, 232, 131], alpha: this.alphaFront[Jungle] });
    }
    // 海洋 @283（SunGradients.cs:218 BackgroundDrawers 末项:new Color(157,192,255),
    // weight = bgAlphaFrontLayer[4]【前】槽,Ocean() :221-224 yield Main.oceanBG——
    // 仅当本世界海洋变体贴图 == 283 时点带;其余 7 个海洋变体(28/110/111/209/210/332/340)无带)
    if (this.alphaFront[Ocean] > 0 && this.oceanTexId() === 283) {
      out.push({ rgb: [157, 192, 255], alpha: this.alphaFront[Ocean] });
    }
    return out;
  }

}