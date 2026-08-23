// 线饰品（string accessory）渲染共享模块——钓鱼线/悠悠球线的颜色与段链绘制。
//
// 权威源码对照（行号 = Terarria1456/ 反编译 1.4.5.6）：
//   - TryApplyingPlayerStringColor   Terraria/Main.cs:34912-34965
//   - 钓线段链 DrawProj_FishingLine   Terraria/Main.cs:34967-35205
//     （竿尖定位 :34970-35106 / 基色+逐竿覆写 :34988-35010 / 段链 :35112-35205）
//   - 悠悠球线 DrawProjDirect aiStyle99 段  Terraria/Main.cs:27799-27912
//
// 【预乘混合语义】原版实体 pass 用 BlendState.AlphaBlend（One/InverseSourceAlpha，
// XNA 4.0 的预乘混合——见 Renderer.sparkleTintedTex 同款注记）：画色 C 的实际效果是
//   final = 贴图.rgb × C.rgb + 背景 × (1 − C.A)
// 即 RGB 分量是【加色贡献】、A 是【背景衰减】。Canvas source-over 是
//   final = S.rgb × S.A + 背景 × (1 − S.A)，二者仅在 A=255（纯替换）时相等，故：
//   - A === 0   → 纯加色：摊平 alpha 的染色贴图走 'lighter' 单笔（C.A=0 背景零衰减）
//   - A === 255 → 纯替换：保形染色的贴图 source-over 单笔（背景衰减 100%）
//   - 中间档    → 两笔精确等价：黑色保形贴图 source-over @A/255（压暗背景）+
//                 摊平染色贴图 'lighter'（补上贡献）
// 【光照】原版逐段 Lighting.GetColor(:27905/:35199) 把段色乘所在格光照；本仓实体层
// 画在全屏光照合成【之前】，逐像素乘光 ≈ 逐段取光（Bobber 既有口径），故段色不再
// 乘光——但 stringColor==29 时原版【免】逐段取光（:27903-27906/:35200-35204），
// 加色路径不经过合成乘光，两版等价。
// 【GetColor 的 alpha 重置】Lighting.GetColor(x,y,old) = new Color(light × old.rgb)
// （Lighting.cs:202-209，三参 Vector3 构造 A 恒 255）——钓线/悠悠球线非 29 路径的
// A×0.4（:34948）在消费端被整段重置为 255，仅 29（免取光）保留原 alpha。1:1 复刻。
import { paintColor } from '../world/Paint';

// ===================== 线色（Main.cs:34912-34965 1:1） =====================

/** 线色时钟输入（渲染侧 FlickerClock——lighting/SkyColor.ts；null 项走缺省） */
export interface StringColorClock {
  /** Main.DiscoR/G/B（6 相循环色，色 27 彩虹线） */
  discoR: number; discoG: number; discoB: number;
  /** Main.mouseTextColor（190↔255 三角波，色 29 闪烁） */
  mouseTextColor: number;
}

export interface StringColorOpts {
  disco: readonly [number, number, number];
  mouseTextColor: number;
  /** Main.rand 等价（缺省 Math.random——纯视觉抖动，Bobber 同口径） */
  rand?: () => number;
}

/** 从渲染侧时钟取线色输入（clock 缺省 = disco 白 / mouseTextColor 255） */
export function stringColorOpts(clock: StringColorClock | null | undefined): StringColorOpts {
  return {
    disco: clock ? [clock.discoR, clock.discoG, clock.discoB] : [255, 255, 255],
    mouseTextColor: clock?.mouseTextColor ?? 255,
  };
}

/** C# (byte)float 截断（正数 = floor）；(byte)int 非检查上下文回绕 mod 256 */
const btrunc = (v: number): number => Math.trunc(v) & 0xff;

/** Main.rand.Next(min, max)（左闭右开） */
function nextInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min));
}

/**
 * TryApplyingPlayerStringColor（Main.cs:34912-34965）逐行 1:1：
 * playerStringColor > 0 → paintColor 换色 + RGB 下限 75 + 特例覆写 + A×0.4；
 * 29（魔法线）→ 鼠标文字色闪烁（num=mouseTextColor 派生 + 随机抖动 ±0.5/±40，
 * (byte)int 回绕语义）且 A=0（预乘 = 纯加色）。playerStringColor ≤ 0 原色透传。
 */
export function tryApplyingPlayerStringColor(
  playerStringColor: number,
  stringColor: readonly [number, number, number, number],
  opts: StringColorOpts,
): [number, number, number, number] {
  let [r, g, b, a] = stringColor;
  if (playerStringColor > 0) {
    let pc = paintColor(playerStringColor);              // :34916 WorldGen.paintColor
    r = pc[0]; g = pc[1]; b = pc[2]; a = pc[3];
    if (r < 75) r = 75;                                  // :34917-34928 RGB 下限
    if (g < 75) g = 75;
    if (b < 75) b = 75;
    switch (playerStringColor) {                         // :34929-34947 特例覆写（A=255）
      case 13: r = 20; g = 20; b = 20; a = 255; break;
      case 0: case 14: r = 200; g = 200; b = 200; a = 255; break;
      case 28: r = 163; g = 116; b = 91; a = 255; break;
      case 27: r = opts.disco[0]; g = opts.disco[1]; b = opts.disco[2]; a = 255; break;
      case 30: r = 226; g = 228; b = 142; a = 255; break;
    }
    a = btrunc(a * 0.4);                                 // :34948 A×0.4
    if (playerStringColor === 29) {                      // :34949-34962 鼠标文字色闪烁
      const rand = opts.rand ?? Math.random;
      let num = (opts.mouseTextColor - 190) / 65;        // :34951
      num += nextInt(rand, -100, 101) * 0.005;           // :34952
      num = Math.min(1, Math.max(0, num));               // :34953 Utils.Clamp
      const num2 = 1 - num;                              // :34954
      let rb = btrunc(184 * num + 255 * num2);           // :34955-34957
      let gb = btrunc(116 * num + 184 * num2);
      let bb = btrunc(255 * num + 116 * num2);
      rb = btrunc(rb + nextInt(rand, -40, 41));          // :34958-34960 (byte)int 回绕
      gb = btrunc(gb + nextInt(rand, -40, 41));
      bb = btrunc(bb + nextInt(rand, -40, 41));
      r = rb; g = gb; b = bb; a = 0;                     // :34961 A=0（预乘 = 纯加色）
    }
  }
  return [r, g, b, a];
}

// ===================== 染色贴图（预乘语义三档消费） =====================

type Tex = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/** FishingLine 染色缓存：键=源贴图+RGB+档（保形/摊平）。29 号闪烁每段独立色，
 *  缓存打满即清（sparkleTintCache 同策略；12×12 画布极小）。 */
const tintCache = new WeakMap<Tex, Map<string, HTMLCanvasElement>>();

/** 染色：multiply 乘 RGB；flatten=false 时 destination-in 回贴原 alpha（保形），
 *  flatten=true 时摊平 alpha=255（'lighter' 加色用——透明像素成不透明黑，加 0 无害）。
 *  （ChunkCache.tintRegion 同款三段合成；鞭渲染 WhipProj 亦消费——鞭身渔线/彩色鞭尖） */
export function tintedTex(tex: Tex, rgb: readonly [number, number, number], flatten: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;   // node 单测/非 DOM 环境无画布可染（消费端跳笔）
  const w = (tex as { width: number }).width, h = (tex as { height: number }).height;
  if (!w || !h) return null;
  let m = tintCache.get(tex);
  if (!m) { m = new Map(); tintCache.set(tex, m); }
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}|${flatten ? 1 : 0}`;
  const hit = m.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.drawImage(tex as CanvasImageSource, 0, 0);
  cx.globalCompositeOperation = 'multiply';               // rgb = 贴图.rgb × 染色
  cx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  cx.fillRect(0, 0, w, h);
  if (!flatten) {                                         // 回贴原 alpha 形状
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(tex as CanvasImageSource, 0, 0);
  }
  cx.globalCompositeOperation = 'source-over';
  if (m.size > 64) m.clear();
  m.set(key, c);
  return c;
}

/**
 * 单段线绘制（预乘混合精确等价，见文件头）：(x,y)=origin 落点（XNA position 语义），
 * rot=段角，segLen=段长（(int) 截断，Main.cs:27907/:35205 sourceRectangle 高）。
 */
function drawSegment(
  ctx: CanvasRenderingContext2D, tex: Tex,
  x: number, y: number, rot: number, segLen: number,
  color: readonly [number, number, number, number],
): void {
  const h = Math.trunc(segLen);                           // Rectangle (int)num5
  if (h <= 0) return;
  const w = (tex as { width: number }).width;
  const a = color[3];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.imageSmoothingEnabled = false;
  if (a === 0) {
    // 纯加色：摊平染色 + 'lighter'（A=0 预乘 = 背景零衰减）
    const t = tintedTex(tex, [color[0], color[1], color[2]], true);
    if (!t) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(t, 0, 0, w, h, -w / 2, 0, w, h);
  } else if (a >= 255) {
    // 纯替换：保形染色 source-over（钓线 GetColor alpha 重置 255 路径）
    const t = tintedTex(tex, [color[0], color[1], color[2]], false);
    if (!t) { ctx.restore(); return; }
    ctx.drawImage(t, 0, 0, w, h, -w / 2, 0, w, h);
  } else {
    // 中间档两笔：黑形压暗背景(×(1−A/255)) + 摊平染色 'lighter' 补贡献
    const black = tintedTex(tex, [0, 0, 0], false);
    const t = tintedTex(tex, [color[0], color[1], color[2]], true);
    if (!black || !t) { ctx.restore(); return; }
    ctx.globalAlpha = a / 255;
    ctx.drawImage(black, 0, 0, w, h, -w / 2, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(t, 0, 0, w, h, -w / 2, 0, w, h);
  }
  ctx.restore();
}

// ===================== 段链（两消费端共享的 12px 段循环） =====================

/** 段链目标（Projectile 盒 + 速度；钓鱼线另带 lai0=localAI[0] 张力 0-100） */
export interface StringLineTarget {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  lai0?: number;
}

/** 每段终色回调（消费端闭包：基色 → TryApplying → GetColor alpha 重置/×0.5） */
type SegmentColorFn = () => readonly [number, number, number, number];

interface ChainArgs {
  ctx: CanvasRenderingContext2D;
  tex: Tex;
  /** 线起点（悠悠球=MountedCenter / 钓线=竿尖） */
  startX: number; startY: number;
  target: StringLineTarget;
  colorFn: SegmentColorFn;
  /** 悠悠球（'yoyo'）与钓线（'fishing'）的三处差异：
   *  起步回退 ×0.1 vs 全 12px（:27820/:35127）；首段不推进 vs 恒推进（:27843-27851）；
   *  摆垂 num8 ×f×0.5 vs ×(1−lai0/100)（:27874-27875/:35174-35175）；
   *  origin 落点 −(6,0) vs 无（:27907/:35205） */
  variant: 'yoyo' | 'fishing';
}

/** 段链主体（钓线 :35112-35205 / 悠悠球线 :27801-27908 同构循环）：
 *  12px 段沿起点→目标推进，速度/张力摆垂（num8），逐段旋贴 FishingLine 竖条。
 *  ★线色求值次数：钓线 TryApplying 在循环【外】一次（:35013，29 号全帧同色）；
 *  悠悠球线在循环【内】逐段（:27899-27901，29 号逐段独立闪烁）。
 *  guard 上限为防御性护栏（原版无；终止条件 = 段距 <20 走尾段）。 */
function runSegmentChain(a: ChainArgs): void {
  const { ctx, tex, target, colorFn, variant } = a;
  const tw = (tex as { width: number }).width;
  const th = (tex as { height: number }).height;
  const fixedColor = variant === 'fishing' ? colorFn() : null;   // :35013 钓线一次
  let px = a.startX, py = a.startY;
  let num = target.x + target.w * 0.5 - px;               // :27804/:35112 目标=盒中心
  let num2 = target.y + target.h * 0.5 - py;
  let flag = true;
  let flag2 = true;                                       // :27809 悠悠球首段不推进
  if (num === 0 && num2 === 0) {
    flag = false;                                         // :27810/:35117
  } else {
    const k = 12 / Math.hypot(num, num2);                 // :27816-27819/:35123-35126
    num *= k; num2 *= k;
    if (variant === 'yoyo') {                             // :27820-27821 起步回退 ×0.1
      px -= num * 0.1; py -= num2 * 0.1;
    } else {                                              // :35127-35128 全 12px 回退
      px -= num; py -= num2;
    }
    num = target.x + target.w * 0.5 - px;
    num2 = target.y + target.h * 0.5 - py;
  }
  let guard = 512;
  while (flag && guard-- > 0) {
    let segLen = 12;                                      // :27827/:35134
    const dist = Math.hypot(num, num2);
    const dist0 = dist;                                   // num7
    if (Number.isNaN(dist)) { flag = false; continue; }   // :27830-27834/:35137-35141
    if (dist < 20) { segLen = dist - 8; flag = false; }   // :27835-27839/:35142-35146
    const k = 12 / dist;
    num *= k; num2 *= k;
    if (variant === 'yoyo') {                             // :27843-27851 首段不推进
      if (flag2) flag2 = false;
      else { px += num; py += num2; }
    } else {                                              // :35150-35151 恒推进
      px += num; py += num2;
    }
    num = target.x + target.w * 0.5 - px;
    num2 = target.y + target.h * 0.1 - py;                // :27852-27853/:35152-35153 段目标=盒顶 10%
    if (dist0 > 12) {                                     // :27854/:35154 摆垂（仅段距 >12）
      let sway = 0.3;
      let spd = Math.abs(target.vx) + Math.abs(target.vy);
      if (spd > 16) spd = 16;
      sway *= 1 - spd / 16;                               // :27862-27863
      let f = dist0 / 80;
      if (f > 1) f = 1;
      sway *= f;                                          // :27869/:35169
      if (sway < 0) sway = 0;                             // :27870-27873
      if (variant === 'yoyo') {
        sway *= f;                                        // :27874 悠悠球二次 ×f
        sway *= 0.5;                                      // :27875 ×0.5
      } else {
        sway *= 1 - (target.lai0 ?? 0) / 100;             // :35174-35175 张力收敛
      }
      if (num2 > 0) {                                     // :27876-27880/:35176-35180
        num2 *= 1 + sway;
        num *= 1 - sway;
      } else {                                            // :27881-27896/:35181-35196
        f = Math.abs(target.vx) / 3;
        if (f > 1) f = 1;
        f -= 0.5;
        sway *= f;
        if (sway > 0) sway *= 2;
        num2 *= 1 + sway;
        num *= 1 - sway;
      }
    }
    const rot = Math.atan2(num2, num) - Math.PI / 2;      // :27898/:35198
    // origin 落点（XNA position−screenPos+(W/2,H/2)：悠悠球线再 −(6,0)）
    const ax = px + tw * 0.5 - (variant === 'yoyo' ? 6 : 0);
    const ay = py + th * 0.5;
    drawSegment(ctx, tex, ax, ay, rot, segLen, fixedColor ?? colorFn()); // :27907/:35205
  }
}

// ===================== 两消费端入口 =====================

/**
 * 悠悠球/配重球线（Main.cs:27799-27908，DrawProjDirect aiStyle 99 段）：
 * 基色 White、A 先 ×0.4（:27899-27900）→ TryApplyingPlayerStringColor【循环内逐段，
 * :27899-27901——29 号逐段独立闪烁】→ 非 29 时 GetColor（alpha 重置 255，光照由合成
 * 自动）→ 全通道 ×0.5（:27902-27907）。
 */
export function drawYoyoStringLine(
  ctx: CanvasRenderingContext2D, tex: Tex,
  startX: number, startY: number, target: StringLineTarget,
  playerStringColor: number, opts: StringColorOpts,
): void {
  const colorFn = (): readonly [number, number, number, number] => {
    // :27899-27901 White + A×0.4 → TryApplying
    let c = tryApplyingPlayerStringColor(playerStringColor, [255, 255, 255, 102], opts);
    // :27903-27906 GetColor：非 29 → alpha 重置 255（光照=合成自动乘，此处只重置 A）
    if (playerStringColor !== 29) c = [c[0], c[1], c[2], 255];
    // :27907 全通道 ×0.5（(byte) 截断）
    return [btrunc(c[0] * 0.5), btrunc(c[1] * 0.5), btrunc(c[2] * 0.5), btrunc(c[3] * 0.5)];
  };
  runSegmentChain({ ctx, tex, startX, startY, target, colorFn, variant: 'yoyo' });
}

/**
 * 钓鱼线（Main.cs:34967-35205）：基色=竿色（:34988-35010 (200,200,200,100)+逐竿覆写）
 * → TryApplyingPlayerStringColor【循环外一次，:35013——29 号全帧同色闪烁】→ 段色
 * GetColor（alpha 重置 255；29 免取光取原始色，:35199-35204）。段链摆垂带 lai0
 * 张力收敛（:35174-35175）。
 */
export function drawFishingStringLine(
  ctx: CanvasRenderingContext2D, tex: Tex,
  startX: number, startY: number, target: StringLineTarget,
  baseColor: readonly [number, number, number],
  playerStringColor: number, opts: StringColorOpts,
): void {
  const colorFn = (): readonly [number, number, number, number] => {
    // :34988-35013 基色 (rgb,100) → TryApplying
    const c = tryApplyingPlayerStringColor(playerStringColor,
      [baseColor[0], baseColor[1], baseColor[2], 100], opts);
    // :35199-35204 GetColor alpha 重置 255（29 免取光：原始色 A=0 直用）
    if (playerStringColor === 29) return c;
    return [c[0], c[1], c[2], 255];
  };
  runSegmentChain({ ctx, tex, startX, startY, target, colorFn, variant: 'fishing' });
}
