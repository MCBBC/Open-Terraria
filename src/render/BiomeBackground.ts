// 原版世界背景图系统 1:1（Main.cs DrawBG/DrawSurfaceBG :58718-60900 + DrawBackground :52217-53517）。
// 地表：bgStyle（GetPreferredBGStyleForPlayer :63658 优先级）→ bgAlpha 前后两层 ±0.05/帧
// （UpdateBGVisibility :63534）→ 群系 3 层视差贴图（WorldGen.setBG :7181 贴图集，
// DrawSurfaceBG_* 各方法的 bgScale/bgParallax/bgTopY 常量），昼夜色调 = ColorOfTheSkies × bgAlpha。
// 地下：PickUndergroundBackgroundStyle :53454 → style→7 槽贴图表（UpdateBackgroundStyles :53221）
// → 表面过渡/泥土/岩石/岩浆分层（ugBackTransition 0.25/帧 新旧双绘）。
// 贴图懒加载（vanilla/Background_N.png，不进 SpriteAtlas 常驻表）。
import type { World } from '../world/World';
import type { SceneFlags } from '../world/SceneMetrics';

// ---- SurfaceBackgroundID（Terraria.ID/SurfaceBackgroundID.cs） ----
const Forest1 = 0, Corruption = 1, Desert = 2, Jungle = 3, Ocean = 4, CorruptDesert = 5,
  Hallow = 6, Snow = 7, Crimson = 8, Mushroom = 9, Forest2 = 10, Forest3 = 11, Forest4 = 12,
  HallowDesert = 13, CrimsonDesert = 14;

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
    case 0: return [1, 2, 4, 3, 6, 5, t[5]];
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
    default: return [1, 2, 4, 3, 6, 5, t[6]];
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

interface Cam { x: number; y: number }

export class BiomeBackground {
  /** 贴图懒加载缓存（n → img；-1 = 加载失败） */
  private imgs = new Map<number, HTMLImageElement | null>();
  /** 地表风格状态（≈Main.bgStyle/bgDelay/bgAlphaFrontLayer/bgAlphaFarBackLayer） */
  bgStyle = 0;
  private bgDelay = 0;
  private alphaFront = new Array(16).fill(0);
  private alphaFar = new Array(16).fill(0);
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

  /** 世界派生随机档（原版 worldgen 期掷骰的运行时重建） */
  private forestStyles: number[] = [];
  private corruptStyle = 0;
  private crimsonStyle = 0;
  private jungleStyle = 0;
  private snowStyle = 0;
  private hallowStyle = 0;
  private mushroomStyle = 0;
  private desertStyle = 0;
  private iceBack = 0;
  private jungleBack = 0;
  private hellBack = 0;
  private caveBackX: number[] = [];
  private caveBackStyle: number[] = [];
  private seededFor = -1;

  private img(n: number): HTMLImageElement | null {
    if (n < 0) return null;
    if (this.imgs.has(n)) return this.imgs.get(n) ?? null;
    const im = new Image();
    im.src = `sprites/vanilla/Background_${n}.png`;
    this.imgs.set(n, im);
    return im;
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
    const styles: Array<[number, number, number]> = [];
    if (scene.zoneCorrupt) styles.push(CORRUPT_STYLES[this.corruptStyle]);
    else if (scene.zoneCrimson) styles.push(CRIMSON_STYLES[this.crimsonStyle]);
    else if (scene.zoneJungle) styles.push(JUNGLE_STYLES[this.jungleStyle]);
    else if (scene.zoneSnow) styles.push(SNOW_STYLES[this.snowStyle]);
    else if (scene.zoneHallow) styles.push(HALLOW_STYLES[this.hallowStyle]);
    else if (scene.zoneGlowshroom) styles.push(MUSHROOM_STYLES[this.mushroomStyle]);
    else if (scene.zoneDesert || scene.zoneBeach) styles.push(DESERT_STYLES[this.desertStyle]);
    if (!styles.length) return; // 森林已在 preloadInitial 就位
    void this.loadBg(styles[0].filter((n) => n >= 0));
  }

  /** 后台加载背景贴图集(去重 + decode 预热) */
  private loadBg(ids: number[]): Promise<void> {
    return Promise.all(ids.map((n) => new Promise<void>((resolve) => {
      if (this.imgs.has(n)) return resolve();
      const im = new Image();
      im.onload = () => {
        this.imgs.set(n, im);
        // decode():背景图 2048px 级,首帧 draw 才解码会卡一拍——预载阶段完成解码
        im.decode().then(() => resolve(), () => resolve());
      };
      im.onerror = () => { this.imgs.set(n, im); resolve(); };
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
    this.iceBack = seedPick(s, 31, 4);
    this.jungleBack = seedPick(s, 32, 2);
    this.hellBack = seedPick(s, 33, 3);
    // caveBackX 四段边界（原版 worldgen 期设定；按世界宽近似重建）+ 每段基础风格 0..6
    const w = world.store.w;
    this.caveBackX = [Math.floor(w * 0.22), Math.floor(w * 0.42), Math.floor(w * 0.65)];
    this.caveBackStyle = [0, 1, 2, 3].map((i) => seedPick(s, 41 + i, 7));
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

  /** 每帧状态推进：风格切换延迟 + alpha 渐变（UpdateBGVisibility ±0.05/帧，:63534/:63594） */
  update(world: World, scene: SceneFlags, dtMs: number) {
    this.seedFor(world);
    if (!this.caveBackTreeX) {
      // 森林四段边界：原版用 treeX[0..2]（WorldGen 生成）；优先用 world.treeX
      this.caveBackTreeX = world.treeX?.length === 3 ? world.treeX : [
        Math.floor(world.store.w * 0.25), Math.floor(world.store.w * 0.5), Math.floor(world.store.w * 0.75),
      ];
    }
    const frames = dtMs / (1000 / 60);
    // 地表风格（DrawBG_HandleBackgroundTransition :63509：变更需 30 帧稳定）
    const want = this.preferredStyle(scene, scene.tileX);
    if (want !== this.bgStyle) {
      this.bgDelay += frames;
      if (this.bgDelay >= 30) { this.bgStyle = want; this.bgDelay = 0; }
    } else this.bgDelay = 0;
    // 前景层 alpha
    for (let l = 0; l < 16; l++) {
      const target = l === this.bgStyle ? 1 : 0;
      this.alphaFront[l] += (target - this.alphaFront[l]) >= 0 ? Math.min(frames * 0.05, target - this.alphaFront[l]) : Math.max(-frames * 0.05, target - this.alphaFront[l]);
      if (Math.abs(target - this.alphaFront[l]) < 0.001) this.alphaFront[l] = target;
    }
    // 远山层 alpha（bgStyle→far 槽映射简化为同号）
    const farTarget = FAR_TEX[this.bgStyle] !== undefined ? this.bgStyle : -1;
    for (let l = 0; l < 16; l++) {
      const target = l === farTarget ? 1 : 0;
      this.alphaFar[l] += target > this.alphaFar[l] ? Math.min(frames * 0.05, target - this.alphaFar[l]) : Math.max(-frames * 0.05, target - this.alphaFar[l]);
    }
    // 地下风格（:52245-52249：变更时新旧并行，ugBackTransition -= 0.25/帧）
    const ugWant = this.pickUnderground(world, scene);
    if (ugWant !== this.ugStyle) {
      if (this.ugAlpha > 0 && this.ugStyle === ugWant) { /* noop */ }
      this.ugOld = this.ugStyle;
      this.ugStyle = ugWant;
      this.ugAlpha = 0;
    }
    this.ugAlpha = Math.min(1, this.ugAlpha + frames * 0.25);
  }

  /** DrawBackground_PickUndergroundBackgroundStyle :53454-53517 */
  private pickUnderground(world: World, scene: SceneFlags): number {
    const x = scene.tileX;
    const w = world.store.w;
    const segIdx = x <= this.caveBackX[0] ? 0 : x <= this.caveBackX[1] ? 1 : x > this.caveBackX[2] ? 3 : 2;
    if (this.caveBackStyle[segIdx] === undefined) {
      this.fallbackWarn('caveBack', { seed: world.seed, seededFor: this.seededFor, segIdx, x, caveBackStyle: this.caveBackStyle });
    }
    let style = this.caveBackStyle[segIdx] ?? 0;
    style += 3;
    // 雪原洞穴（原版 SnowTileCount 判定——SceneFlags 只有布尔近似：zoneSnow 且未到地狱带）
    if (scene.zoneSnow && scene.tileY < world.store.h - 250 && scene.tileY > world.groundLevel) style = 1;
    // 丛林洞穴
    if (scene.zoneJungle) style = 11;
    // 沙滩地下
    if (scene.zoneBeach) {
      style = scene.zoneCorrupt ? 19 : scene.zoneCrimson ? 21 : scene.zoneHallow ? 20 : 18;
    } else if (scene.tileY > world.rockLevel + 60 && scene.tileY < (world.lavaLine || world.store.h - 200) - 60) {
      if (scene.zoneSnow) style = scene.zoneCorrupt ? 15 : scene.zoneCrimson ? 16 : scene.zoneHallow ? 17 : style;
      else if (scene.zoneCorrupt) style = 12;
      else if (scene.zoneCrimson) style = 13;
      else if (scene.zoneHallow) style = 14;
    }
    if (scene.zoneGlowshroom) style = 2;
    return style;
  }

  /** 主绘制：插在 sky.draw 之后、世界变换之前（屏幕空间） */
  draw(
    ctx: CanvasRenderingContext2D, world: World, scene: SceneFlags,
    cam: Cam, viewW: number, viewH: number, tint: [number, number, number], dtMs: number,
  ) {
    this.update(world, scene, dtMs);
    const camTopY = cam.y - viewH / 2 / 1; // 相机中心 → 屏幕顶（屏幕空间绘制用）
    // 地表背景（ShouldDrawSurfaceBackground :59131：相机在地表之上才画）
    if (cam.y < world.groundLevel * 16 + 16) {
      this.drawSurface(ctx, world, cam, camTopY, viewW, viewH, tint);
    }
    this.drawUnderground(ctx, world, cam, camTopY, viewW, viewH);
  }

  // ---- 地表层 ----
  private drawSurface(
    ctx: CanvasRenderingContext2D, world: World, cam: Cam,
    camTopY: number, viewW: number, viewH: number, tint: [number, number, number],
  ) {
    this.seedFor(world); // 兜底：即便 update 未先行播种也不崩（HMR/首帧边界）
    // 垂直视差系数（DrawSurfaceBG :58749：num3 = -(screenPosition.Y-300)/(worldSurface*16)）
    const num3 = -(camTopY - 300) / (world.groundLevel * 16);
    const drawLayer = (l: LayerDef, alpha: number) => {
      if (alpha <= 0.01 || l.tex < 0) return;
      const im = this.img(l.tex);
      if (!im || !im.complete || im.naturalWidth === 0) return;
      const wScaled = im.naturalWidth * l.scale;
      const startX = -(((cam.x * l.parallax) % wScaled) + wScaled) % wScaled - wScaled / 2;
      const loops = Math.ceil(viewW / wScaled) + 2;
      const topY = num3 * l.topA + l.topB; // 屏幕空间 y（vanilla bgTopY 语义）
      ctx.save();
      ctx.globalAlpha = alpha;
      const [tr, tg, tb] = tint;
      // ★+1px 保险重叠:浮点视差位置(startX 取模 cam.x*parallax)+非整数缩放
      // (naturalWidth×1.25)下,相邻背景图独立光栅化在接缝处留 1px 缺口(发丝缝),
      // 双线性平滑还会把边缘混透明放大缝。外扩 1px 让邻图覆盖接缝
      const dw = wScaled + 1;
      for (let i = 0; i < loops; i++) {
        if (tr >= 0.999 && tg >= 0.999 && tb >= 0.999) {
          ctx.drawImage(im, startX + i * wScaled, topY, dw, im.naturalHeight * l.scale);
        } else {
          // 先画原图再叠 tint（保持边缘 alpha）：用 offscreen 缓存避免每帧 getImageData
          this.drawTiledTinted(ctx, im, tr, tg, tb, startX + i * wScaled, topY, dw, im.naturalHeight * l.scale);
        }
      }
      ctx.restore();
    };
    // 远山层（bgAlphaFarBackLayer；parallax 0.15/scale 1，:59240）
    const farTex = FAR_TEX[this.bgStyle];
    if (farTex !== undefined) {
      const a = this.alphaFar[this.bgStyle];
      drawLayer({ tex: farTex, scale: 1, parallax: 0.15, topA: 1300, topB: 1090 }, a);
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
    } else if (style === Ocean) {
      // 海洋：原版仅 overlay 无群系层（forest 兜底）
      const fs = this.pickStyle('forest-ocean', FOREST_STYLES, this.forestStyles[0], world);
      drawLayer({ tex: fs.t[0], scale: 1.2, parallax: 0.25, topA: 1600, topB: 1400 }, a);
      drawLayer({ tex: fs.t[2], scale: 1.4, parallax: 0.27, topA: 1800, topB: 1500 }, a);
    }
    void s; void viewH;
  }

  /** 带色调平铺绘制（tint 缓存按 (tex,tint) 键，避免每帧逐像素） */
  private tintCache = new Map<string, HTMLCanvasElement>();
  private drawTiledTinted(
    ctx: CanvasRenderingContext2D, im: HTMLImageElement,
    tr: number, tg: number, tb: number, dx: number, dy: number, dw: number, dh: number,
  ) {
    const key = `${im.src}|${tr.toFixed(2)},${tg.toFixed(2)},${tb.toFixed(2)}`;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const cx = c.getContext('2d')!;
      cx.drawImage(im, 0, 0);
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = `rgb(${Math.round(tr * 255)},${Math.round(tg * 255)},${Math.round(tb * 255)})`;
      cx.fillRect(0, 0, c.width, c.height);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(im, 0, 0);
      this.tintCache.set(key, c);
      if (this.tintCache.size > 64) this.tintCache.clear(); // 简单防膨胀
    }
    ctx.drawImage(c, dx, dy, dw, dh);
  }

  // ---- 地下层 ----
  private drawUnderground(
    ctx: CanvasRenderingContext2D, world: World, cam: Cam,
    camTopY: number, viewW: number, viewH: number,
  ) {
    const worldID = world.seed >>> 0;
    const newSlots = ugSlots(this.ugStyle, this.iceBack, this.jungleBack, this.hellBack, worldID);
    const oldSlots = ugSlots(this.ugOld, this.iceBack, this.jungleBack, this.hellBack, worldID);
    const alpha = this.ugAlpha;
    // 垂直分层边界（屏幕空间 y；原版 bgTopY 语义 = 层世界 y - screenPosition.Y）
    const dirtTop = world.groundLevel * 16 - camTopY + 16;             // DrawBackground_DirtBackground :52824
    // 岩浆带顶（:52237 magmaLayer 公式：ws + floor((h-330-ws)/6)*6 - 5——★曾误用
    // lavaLine(h-200) 整条带低 ~135 格）;bgTopY = magmaLayer*16 - screenY + 16 + 600 - 8
    const magmaLayerTile = Math.floor(world.groundLevel
      + Math.floor((world.store.h - 330 - world.groundLevel) / 6) * 6) - 5;
    const magmaTop = magmaLayerTile * 16 - camTopY + 16 + 600 - 8;     // DrawBackground_DrawMagmaLayer :52276
    // UnderworldLayer（h-200）屏幕 y——岩浆带底 + 表面波纹条位置 + 黑盒下界
    const uwScreenY = (world.store.h - 200) * 16 - camTopY;
    // 岩浆 3 帧动画（Main.cs:61657-61665：magmaBGFrameCounter 每 8 tick 推进,mod 3;
    // 8 tick = 133.33ms）。岩浆体 125+hell(160×288=3 帧×96px)与表面条 185+hell
    // (160×48,取 16px 行×3 帧)共用同一 frame
    this.magmaFrameT += dtMs;
    const magmaFrame = Math.floor(this.magmaFrameT / 133.33) % 3;
    // ★层序（:52265-52270）：SurfaceTransition → Dirt → 【黑盒最先打底】→ Rock → Magma。
    // 曾把黑盒画在带层之后 → 盖掉岩浆带 = "地狱背景缺失/接近地狱层叠错误"报告根因;
    // 接近地狱时屏上方背景渐黑正是原版观感（黑盒打底后仅岩层/岩浆重画）
    if (magmaTop < viewH) {
      const blackBottom = Math.min(viewH + 200, uwScreenY);
      if (blackBottom > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, viewW, Math.max(0, blackBottom));
      }
    }
    const drawSlots = (slots: number[], a: number) => {
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = a;
      const tile = (n: number, y: number, hHint?: number) => {
        const im = n > 0 ? this.img(n) : null;
        if (!im || !im.complete || im.naturalWidth === 0) return;
        const wS = im.naturalWidth;
        // 横向平铺（地下层无水平视差：caveParallax=0）
        const loops = Math.ceil(viewW / wS) + 1;
        for (let i = 0; i < loops; i++) {
          // 纵向：从层顶平铺到（下一层顶或屏底）
          let yy = y;
          const bottom = viewH;
          while (yy < bottom) {
            ctx.drawImage(im, i * wS, yy, wS, im.naturalHeight);
            yy += im.naturalHeight;
            if (hHint && yy > y + hHint) break;
          }
        }
      };
      // 岩石带（GetRockTransitionPoint :52532 + DrawRockLayer/53127 语义）：
      // 带顶 = worldSurface*16 + ceil((rockLevel-worldSurface)*16 / slot3纹理高)*slot3纹理高 + 32
      //（泥土带按 slot3 纹理高整数倍对齐收口）；
      // slot2 仅是带顶上一条 16px 过渡条（纹理只取第 0 行，画一次——
      // 此前误当"岩石带上 1/3"平铺，深层时整屏都是过渡条纹理=错误贴图）；
      // slot3 = 岩石带主体，按自身纹理高平铺至 magmaTop。
      const rockTop2 = (() => {
        const im3 = slots[3] ? this.img(slots[3]) : null;
        const h3 = im3 && im3.complete && im3.naturalHeight ? im3.naturalHeight : 96;
        const span = (world.rockLevel - world.groundLevel) * 16;
        const steps = Math.ceil(span / h3);
        return world.groundLevel * 16 + steps * h3 + 32 - camTopY;
      })();
      // 泥土带（slot1）：dirtTop → 岩石带顶
      const dirtIm = slots[1] ? this.img(slots[1]) : null;
      if (dirtIm && dirtIm.complete && dirtIm.naturalWidth) {
        const wS = dirtIm.naturalWidth;
        const loops = Math.ceil(viewW / wS) + 1;
        for (let i = 0; i < loops; i++) {
          let yy = dirtTop;
          while (yy < Math.min(rockTop2, viewH)) {
            ctx.drawImage(dirtIm, i * wS, yy, wS, dirtIm.naturalHeight);
            yy += dirtIm.naturalHeight;
          }
        }
      }
      {
        // slot3 主体
        const im3 = slots[3] ? this.img(slots[3]) : null;
        if (im3 && im3.complete && im3.naturalWidth) {
          const wS = im3.naturalWidth;
          const loops = Math.ceil(viewW / wS) + 1;
          for (let i = 0; i < loops; i++) {
            let yy = Math.max(rockTop2, -im3.naturalHeight);
            while (yy < Math.min(magmaTop, viewH)) {
              ctx.drawImage(im3, i * wS, yy, wS, im3.naturalHeight);
              yy += im3.naturalHeight;
            }
          }
        }
        // slot2 单条过渡条（带顶 -16px，仅纹理第 0 行 16px 高）
        const im2 = slots[2] ? this.img(slots[2]) : null;
        if (im2 && im2.complete && im2.naturalWidth && rockTop2 - 16 > -32 && rockTop2 - 16 < viewH) {
          const wS = im2.naturalWidth;
          const loops = Math.ceil(viewW / wS) + 1;
          for (let i = 0; i < loops; i++) {
            ctx.drawImage(im2, 0, 0, wS, Math.min(16, im2.naturalHeight), i * wS, rockTop2 - 16, wS, Math.min(16, im2.naturalHeight));
          }
        }
      }
      // 岩浆带（slot6 岩浆体 + slot4 过渡条 + slot5 地狱柱）
      tile(slots[6], magmaTop);
      tile(slots[4], magmaTop - 200, 200);
      // 地狱黑幕（DrawUnderworldBlackBox :52803：magmaTop 以下全黑）
      if (magmaTop < viewH) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, Math.max(0, magmaTop), viewW, viewH - Math.max(0, magmaTop));
      }
      // 表面过渡条（slot0：地表附近横条）
      if (dirtTop > -64 && dirtTop < viewH + 64) tile(slots[0], dirtTop - 16, 32);
      ctx.restore();
    };
    drawSlots(oldSlots, 1 - alpha);
    drawSlots(newSlots, alpha);
  }
}
