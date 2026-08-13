// 放置态火苗叠画（原版 TileDrawing.DrawSingleTile_Flames，TileDrawing.cs:2710-3517）。
// 火把/蜡烛/烛台/吊灯/壁灯/南瓜灯/骷髅灯/水蜡烛/和平蜡烛/暗影蜡烛/篝火族
// 放置后在本体之上叠画 Flame_N 贴图（TextureAssets.Flames，AssetInitializer.cs:680-683
// = Images/Flame_N；我们的素材 = vanilla/Flame_0..17.png 共 18 张全量）。
// 火苗表与 tile 表【同布局平行表】：火把 Flame_0 132×528 = Torch_0 逐格镜像，
// 源矩形直接取本体帧 (frameX, frameY, gridW, gridH)——未点燃火把的 66/88/110 列
// 在火苗表里是全透明单元（像素实测），画上去自然为零，无需额外门（与原版同机制）。
//
// 动画 = 每格 7 份种子化抖动副本（TileDrawing.cs:3459-3488 default 分支）：
//   dx = Utils.RandomInt(seed, -10, 11) * 0.15
//   dy = Utils.RandomInt(seed, -10, 1)  * 0.35
//   颜色 Color(100,100,100,0) —— XNA 预乘 AlphaBlend 下 A=0 即纯加色累积，
//   Canvas 用 'lighter' + multiply 预染色（rgb=100,100,100 → ×0.39）等价。
//   种子 = Main.TileFrameSeed ^ (x<<32 | y)（:2852-2853）；TileFrameSeed 每 5 个
//   绘制周期推进一次（Main.cs:61156-61159）→ 火苗约 12Hz 闪烁。
//
// 【简化登记】
//  S1 蜡烛(33/174)/烛台(100/173)/壁灯(93) 等的逐 style 抖动参数分支
//     （:2909-3457 的 frameY/22 · frameY/54 switch：份数 1-8、倍率 0.075-0.35）
//     未逐条移植——统一走 default 7 份 (0.15, 0.35)。仅影响抖动幅度，不改贴图/位置。
//  S2 颜色乘子只接 torch style 14(Disco)/22/23 与篝火 style 5/14/15 的差异
//     （:3464-3477 / :2736-2745）；Color.A 的背景衰减（预乘混合的 dst×(1-A/255)）
//     按仓内 additive 惯例（drawNpcGlow 同款）忽略。
//  S3 手持火把火苗（PlayerDrawLayers.cs:3525-3558 的 TextureAssets.ItemFlame，素材
//     ItemFlame_{itemId}.png 32 张）不在本文件——任务标注可选，未接。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { flameTileTop } from './VanillaTiler';
import { campfireYOffset } from './TileAnim';
import type { FlickerClock } from '../lighting/SkyColor';

/** 火苗族 tile → Flame_{n} 贴图索引（TileDrawing.cs:2857-2893 的 num9 switch 1:1；
 *  成员集 = Main.tileFlame 置位表 Main.cs:9210-9222：
 *  4 火把/33+174 蜡烛/100+173 烛台/34 吊灯/93 壁灯/49 水蜡烛/372 和平蜡烛/
 *  646 暗影蜡烛/98 骷髅灯/35 南瓜灯/42 吊挂灯笼）。键 = 原版 tile type
 *  （本仓 TileDef.vanilla.sheet 同值）。 */
export const TORCH_FLAME_TILE: Record<number, number> = {
  4: 0,      // Torches
  33: 1, 174: 1,    // Candles / Platinum Candle
  100: 2, 173: 2,   // Candelabras / Platinum Candelabra
  34: 3,    // Chandeliers
  93: 4,    // Lamps
  49: 5,    // Water Candle
  372: 16,  // Peace Candle
  646: 17,  // Shadow Candle
  98: 6,    // Skull Lantern
  35: 7,    // Jack 'O Lantern
  42: 13,   // Hanging Lanterns
};

/** 篝火 215 走独占分支（TileDrawing.cs:2729-2747）：单份无抖动、frameY<36 门、
 *  颜色按 frameX/54（5=Disco / 14=(50,50,100,20) / 15=白），addFrY 参与取帧。 */
const CAMPFIRE_FLAME = { sheet: 215, flame: 15, frameYPitch: 54 };

// ---- Utils.RandomNext/RandomInt（Utils.cs:2386-2418）1:1 ----
const MASK48 = (1n << 48n) - 1n;
/** RandomNextSeed :2388-2391：Java LCG (×25214903917 +11) & 2^48-1 */
export function randomNextSeed(seed: bigint): bigint {
  return (seed * 25214903917n + 11n) & MASK48;
}
/** RandomNext(seed, 31)（:2384-2387）：推进后取高 31 位，(int) 有符号语义 */
function randomNext31(seedBox: { s: bigint }): number {
  seedBox.s = randomNextSeed(seedBox.s);
  return Number(BigInt.asIntN(31, seedBox.s >> 17n));
}
/** RandomInt(ref seed, min, max)（Utils.cs:2399-2418）：2 的幂走移位快速路径，
 *  否则拒绝采样（`num - num2 + (max-1) < 0` 的 Java int 溢出门）。 */
export function randomInt(seedBox: { s: bigint }, min: number, max: number): number {
  const range = max - min;
  if ((range & -range) === range) {
    return Number((BigInt(range) * BigInt(randomNext31(seedBox))) >> 31n) + min;
  }
  let bits: number, val: number;
  do {
    bits = randomNext31(seedBox);
    val = bits % range;
  } while (bits - val + (range - 1) < 0);
  return val + min;
}

/** 每格火苗的 7 份抖动偏移（TileDrawing.cs:3479-3484 的 default 循环 1:1）。
 *  纯函数（种子显式传入）供测试锁定确定性。 */
export function flameWobble(seed: bigint): Array<[number, number]> {
  const box = { s: seed };
  const out: Array<[number, number]> = [];
  for (let k = 0; k < 7; k++) {
    out.push([randomInt(box, -10, 11) * 0.15, randomInt(box, -10, 1) * 0.35]);
  }
  return out;
}

// ---- Main.TileFrameSeed（Main.cs:395 初值 + :61156-61159 每 5 绘制周期推进）----
let _frameSeed = 0x2545f4914f6cdd1dn & MASK48; // 初值任意（原版 = Guid 哈希，仅要"每局不同"）
let _drawCycle = 0;

// ---- 颜色乘子预染缓存（multiply×fill 逐像素染 Flame 单元；静态色缓存命中、
//      Disco 按 32 档量化限幅，超 512 条整体清空防无界增长）----
const _tintCache = new Map<string, HTMLCanvasElement>();
function tintedFlameCell(
  img: CanvasImageSource & { width: number; height: number },
  sx: number, sy: number, sw: number, sh: number,
  r: number, g: number, b: number,
): HTMLCanvasElement | null {
  const key = `${sx},${sy},${sw},${sh},${r},${g},${b}`;
  let c = _tintCache.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const cc = c.getContext('2d');
  if (!cc) return null;
  cc.imageSmoothingEnabled = false;
  cc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  cc.globalCompositeOperation = 'multiply';
  cc.fillStyle = `rgb(${r},${g},${b})`;
  cc.fillRect(0, 0, sw, sh);
  // multiply 会把透明像素染成实色——按原 alpha 裁回
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (_tintCache.size > 512) _tintCache.clear();
  _tintCache.set(key, c);
  return c;
}

/** torch style → 火苗颜色乘子 rgb(0-255)。缺省 (100,100,100)（:3482 default）；
 *  style = frameY/22（Torch 表 22px 纵向步长，同 TileLightScanner 的取 style 法）。
 *  白色乘子 (255,255,255) 返回 null = 直用原贴图。 */
function flameTint(
  sheet: number, frameX: number, frameY: number, flicker: FlickerClock | null,
): [number, number, number] | null {
  if (sheet === CAMPFIRE_FLAME.sheet) {
    const style = Math.floor(frameX / CAMPFIRE_FLAME.frameYPitch);   // :2736
    if (style === 5 && flicker) {
      const [r, g, b] = flicker.discoColor();                          // :2738-2740
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    if (style === 14) return [50, 50, 100];                            // :2741-2743
    if (style === 15) return null;                                     // (255,255,255,200)
    return null;                                                       // (255,255,255,0)
  }
  if (sheet === 4) {
    const style = Math.floor(frameY / 22);                             // :3464
    if (style === 14 && flicker) {
      const [r, g, b] = flicker.discoColor();                          // :3466-3468
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    if (style === 22) return [50, 50, 100];                            // :3469-3471
    if (style === 23) return null;                                     // (255,255,255,200)
    return [100, 100, 100];                                            // :3482 default
  }
  return [100, 100, 100];                                              // 其各族 default 同
}

/** 火苗叠画主入口。调用点 = Renderer tile 层之后（原版 DrawSingleTile 内
 *  DrawSingleTile_Flames 在本体绘制之后调用，TileDrawing.cs:1746）。
 *  坐标 = 世界像素（调用方已在世界变换内）。 */
export function drawTileFlames(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  tx0: number, ty0: number, tx1: number, ty1: number,
  flicker: FlickerClock | null,
): void {
  // 颜色/抖动只依赖 TileFrameSeed 与 FlickerClock（同原版，无时钟项）
  if (_drawCycle === 0) _frameSeed = randomNextSeed(_frameSeed);   // Main.cs:61156-61159
  _drawCycle = (_drawCycle + 1) % 5;

  const flameImg = new Map<number, HTMLCanvasElement | null>();
  const imgFor = (idx: number) => {
    let im = flameImg.get(idx);
    if (im === undefined) {
      im = atlas.ensureVImage(`vanilla/Flame_${idx}.png`) ?? null;
      flameImg.set(idx, im);
    }
    return im;
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'lighter';   // A=0 预乘加色语义（见文件头注）
  ctx.globalAlpha = 1;
  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const def = TILE_DEFS[st.type[i]];
      const sheet = def?.vanilla?.sheet ?? -1;
      const isCampfire = sheet === CAMPFIRE_FLAME.sheet;
      const flameIdx = isCampfire ? CAMPFIRE_FLAME.flame : TORCH_FLAME_TILE[sheet];
      if (flameIdx === undefined) continue;
      const frameX = st.frameX[i];
      let frameY = st.frameY[i];
      if (isCampfire) {
        if (frameY >= 36) continue;                     // :2731 门（上半 36px 才有火）
        frameY += campfireYOffset(frameY);              // addFrY（:2737）
      }
      const img = imgFor(flameIdx);
      if (!img) continue;
      const r = atlas.vframeAt(sheet, frameX, frameY);
      if (!r) continue;
      const top = flameTileTop(sheet, st, x, y, frameX, st.frameY[i]);
      const dx = x * TILE - (r.sw - TILE) / 2;          // :2718 X = x*16-(w-16)/2
      const dy = y * TILE + top;
      const tint = flameTint(sheet, frameX, st.frameY[i], flicker);
      const cell = tint ? tintedFlameCell(img, r.sx, r.sy, r.sw, r.sh, tint[0], tint[1], tint[2]) : null;
      const src = cell ?? img;
      const sx = cell ? 0 : r.sx, sy = cell ? 0 : r.sy;
      if (isCampfire) {
        // 篝火：单份无抖动（:2734-2747）
        ctx.drawImage(src, sx, sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
        continue;
      }
      const seed = _frameSeed ^ ((BigInt(x) << 32n) | BigInt(y >>> 0));  // :2852-2853
      for (const [ox, oy] of flameWobble(seed)) {
        ctx.drawImage(src, sx, sy, r.sw, r.sh, dx + ox, dy + oy, r.sw, r.sh);
      }
    }
  }
  ctx.restore();
}
