// ★BJ603 tile 侧 tileGlowMask 独立域（BJ601 登记②收官刀）数据面 + 纯函数。
import { UnifiedRandom as UnifiedRandomBridge } from '../core/rng';

//
// 原版锚（Terarria1457 反编译亲读，1.4.5.7）：
//  · 数据面 = Main.tileGlowMask【public short[TileID.Count]】（Main.cs:1512 声明；
//    :8576 全表初始化 -1）。钉表 = Main.cs:10163-10207 逐条赋值【共 37 条】
//    （36 件正值 mask + 129 显式 -2 自身纹理哨兵）——BJ601 台账记"44 件"系按
//    行段 10163-10207 行数误计，亲读 grep 全量复核 = 37（grep tileGlowMask[
//    全仓反编译树仅 Main.cs 一处赋值面 + TileDrawing.cs 两处消费面，无散置）。
//  · 消费面 = TileDrawing.cs:980（glow 门并入 flag——glow tile 不吃暗格剔除
//    DrawBlack）+ :1196-1341（DrawBasicTile 本体后叠画）：
//    drawTexture = GlowMask[N]（IndexInRange 门——-2 不换图=自身纹理），
//    色式 = :1210-1290 逐 tile switch（缺省 White，A>0 source-over/A=0 纯加算
//    ——xna-alpha0 判例）；源矩形 = 本体同矩形 (frameX+addFrX, frameY+addFrY,
//    tileWidth, tileHeight)（:1332-1356 半砖/坡面变体同本体切条式）；
//    位次 = 本体后（DrawBasicTile 尾段，tileBatch 内）。
//  · 光罩色不取光照（White/静态辉光字段 A=0）= 自发光 → 本仓走合成后逃逸队列
//    （BJ509 四塔/BJ597 甲位/BJ601 物品域同判例域）；异例：633 灰烬草
//    Lerp(White, finalColor, 0.75) 与 717 熔岩云 LavaLightA 吃光照/熔岩光。
//  · 位置动画 = 本体 addFrY/addFrX 同源（GetTileDrawData：390=tileFrame×36、
//    708=×90、410=fy≥56 门 ×56、480/509/657/720/721/725=fy≥54 门 ×54、
//    658=×54+变体子表基 486/972、129=crystalShardAddFrX 横向）——本仓本体
//    烘焙侧 drawAdjust case 410/480/509/657/720/721/725/658 已承担同款门
//    （VanillaTiler.ts:2214-2228），光罩侧同式复算保证与本体同帧。
//  · 相邻域登记（本刀未动）：
//    - tile 129 水晶碎块辉光 = BJ118①（G-129）已整段落地（VanillaTiler
//      shardGlowTint 4 向 2px 叠画 + 基底 α100）→ 本表保留数据条目、扫描侧
//      显式跳过（防双画）。
//    - 火把族 glowTexture/glowColor 通道（GetTileDrawData :6219-6620 逐 style
//      火光染色）= DrawTiles 火焰域相邻机制（TileFlames 已覆盖 Flame 叠画本体；
//      火光染色 = tileLight 域,非本域）。
//    - tile 209 传送门 = 本仓 Portal 实体通道绘制（entities/Portal.ts），tile
//      209 网格烘焙不含传送门相 → 本表条目休眠（portalColor 常量在库）。

/** 37 条钉表（Main.cs:10163-10207 原文序；键=原版 tile id，值=GlowMaskID/-2）。 */
export const TILE_GLOWMASK: Readonly<Record<number, number>> = {
  350: 94,    // MartianConduitPlating（脉冲支 :1273-1275）
  390: 130,   // LavaLamp（_meteorGlow 色 + tileFrame×36 帧带）
  381: 126,   // LavaMoss（_lavaMossGlow）
  517: 258,   // LavaMossBrick
  687: 336,   // LavaMossBlock
  534: 259,   // KryptonMoss（_kryptonMossGlow）
  535: 260,   // KryptonMossBrick
  689: 338,   // KryptonMossBlock
  536: 261,   // XenonMoss（_xenonMossGlow）
  537: 262,   // XenonMossBrick
  690: 339,   // XenonMossBlock
  539: 263,   // ArgonMoss（_argonMossGlow）
  540: 264,   // ArgonMossBrick
  688: 337,   // ArgonMossBlock
  625: 311,   // VioletMoss（_violetMossGlow）
  626: 312,   // VioletMossBrick
  691: 340,   // VioletMossBlock
  627: 313,   // RainbowMoss（Disco 动色 :1276-1278）
  628: 314,   // RainbowMossBrick
  692: 341,   // RainbowMossBlock
  370: 111,   // MeteoriteBrick（_meteorGlow）
  429: 214,   // WireBulb（专支 :1287-1291：换本体纹理 + addFrY=18 辉光行）
  209: 215,   // 传送门（PortalHelper.GetPortalColor :1289——本仓实体通道,休眠）
  445: 214,   // PixelBox（同 429 专支）
  129: -2,    // Crystals（★BJ118① 已整段落地——扫描侧跳过防双画）
  633: 326,   // AshGrass（Lerp(White,finalColor,0.75) :1223 光照耦合）
  659: 348,   // ShimmerBlock（GetShimmerGlitterColor(top:true) :1225）
  667: 349,   // ShimmerBrick
  708: 359,   // Shimmerfall（同微光闪色 + tileFrame×90 帧带）
  699: 353,   // DeadCellsPotionStation（White）
  717: 362,   // LavaCloud（LavaLightA :1214-1218 熔岩游走光）
  410: 201,   // LunarMonolith（White + fy≥56 门 ×56）
  509: 265,   // VoidMonolith（White + fy≥54 门 ×54）
  658: 333,   // ShimmerMonolith（White + ×54+变体基）
  720: 368,   // CRTMonolith
  721: 369,   // RetroMonolith
  725: 371,   // NoirMonolith（Noir 滤镜门专支 :1343-1355,flag3=无标准尾画）
};

// ===================== 色式 kind（TileDrawing.cs:1210-1290 switch 1:1） =====================

export type TileGlowKind =
  | 'white'         // 缺省 Color.White（碑族/699 等,:1208）
  | 'lavaMoss'      // 381/517/687：(150,100,50,0)（:1231,_lavaMossGlow :132）
  | 'krypton'       // 534/535/689：(0,200,0,0)（:1236,:134）
  | 'xenon'         // 536/537/690：(0,180,250,0)（:1241,:136）
  | 'argon'         // 539/540/688：(225,0,125,0)（:1246,:138）
  | 'violet'        // 625/626/691：(150,0,250,0)（:1251,:140）
  | 'meteor'        // 370/390：(100,100,100,0)（:1263,_meteorGlow :130）
  | 'pulse350'      // 350：-cos(θ)×0.2+0.2 全通道（Color(Vector4),θ 相位门 :1273-1275）
  | 'discoMoss'     // 627/628/692：(DiscoR,DiscoG,DiscoB)（:1276-1278）
  | 'shimmerGlow'   // 659/667/708：hslToRgb(hue,1,.5,A=0)×0.5（:1225+LR.cs:757-761）
  | 'ashGrass'      // 633：Lerp(White,finalColor,0.75)（:1223,光照耦合）
  | 'lavaCloud'     // 717：LavaLightA 灰标量 (n,n,n,n/2)（:1214-1218）
  | 'crystal129'    // 129：★BJ118① 已落地——扫描跳过（防双画）
  | 'selfTexRow18'  // 429/445：drawTexture=本体纹理+addFrY=18,White（:1287-1291）
  | 'portal'        // 209：PortalHelper.GetPortalColor（:1289;本仓休眠）
  | 'invisible'     // 718：(0,0,0,0)≡零贡献→不画（:1211）
  | 'noir';         // 725：Noir Opacity 门专支（:1343-1355,flag3）

export function tileGlowKind(sheet: number): TileGlowKind {
  switch (sheet) {
    case 381: case 517: case 687: return 'lavaMoss';
    case 534: case 535: case 689: return 'krypton';
    case 536: case 537: case 690: return 'xenon';
    case 539: case 540: case 688: return 'argon';
    case 625: case 626: case 691: return 'violet';
    case 370: case 390: return 'meteor';
    case 350: return 'pulse350';
    case 627: case 628: case 692: return 'discoMoss';
    case 659: case 667: case 708: return 'shimmerGlow';
    case 633: return 'ashGrass';
    case 717: return 'lavaCloud';
    case 129: return 'crystal129';
    case 429: case 445: return 'selfTexRow18';
    case 209: return 'portal';
    case 718: return 'invisible';
    case 725: return 'noir';
    default: return 'white';
  }
}

// ===================== RGBA 工具（XNA Color 语义,同 vanillaItemGlow 判例） =====================

export type RGBA = readonly [number, number, number, number];

const truncByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.trunc(v));

/** XNA Color(Vector4 f) 全通道 = (byte)(f×255)（:1273-1275 new Color(new Vector4(v))） */
export function pulse350Color(tVis: number): RGBA {
  const num10 = tVis * 0.08;
  const theta = (Math.trunc(num10 / 6.283) % 3 === 1) ? num10 : 0;
  const v = -Math.cos(theta) * 0.2 + 0.2;
  const b = truncByte(v * 255);
  return [b, b, b, b];
}

/** :1289 PortalHelper.GetPortalColor（PortalHelper.cs:380-396,netMode 0 单机支）：
 *  portal 0 = hslToRgb(0.12,1,0.5)/portal 1 = hslToRgb(0.52,1,0.6)，A=66 覆写。
 *  frameX≥288 → 端口 1（第二扇门）,否则 0。 */
export function portalGlowColor(frameX: number): RGBA {
  const idx = frameX >= 288 ? 1 : 0;
  const [r, g, b] = idx === 0 ? hslToRgbByte(0.12, 1, 0.5) : hslToRgbByte(0.52, 1, 0.6);
  return [r, g, b, 66];
}

/** :1225 微光闪色（LiquidRenderer.cs:757-761,GetShimmerGlitterColor(top:true)）：
 *  hslToRgb(((x + y/6) + t/30)/6 % 1, 1, 0.5) A=0 → ×opacity(0.5)（Vector4×f32
 *  截断,top:true 恒 0.5）→ A=0 纯加算。hslToRgb255 同 vanillaItemGlow.hslToRgb255
 *  语义（此处自带防依赖环）。 */
function hue2rgb(c0: number, t1: number, t2: number): number {
  let c = c0;
  if (c < 0) c++;
  if (c > 1) c--;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}

export function hslToRgbByte(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const p = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const q = 2 * l - p;
  return [
    Math.round(hue2rgb(h + 1 / 3, q, p) * 255),
    Math.round(hue2rgb(h, q, p) * 255),
    Math.round(hue2rgb(h - 1 / 3, q, p) * 255),
  ];
}

export function shimmerGlowColor(x: number, y: number, tVis: number): RGBA {
  const hue = (((x + y / 6) + tVis / 30) / 6) % 1;
  const [r, g, b] = hslToRgbByte(hue, 1, 0.5);
  // Color(Vector4 × 0.5)——逐通道 (byte)(v×0.5) 截断,A=0×0.5=0
  return [truncByte(r * 0.5), truncByte(g * 0.5), truncByte(b * 0.5), 0];
}

/** :1223 灰烬草（finalColor≈光照取色=本体光乘同源,登记近似）：
 *  Lerp(White, light, 0.75) 逐通道截断。 */
export function ashGrassColor(light: readonly [number, number, number] | null): RGBA {
  const l = light ?? [255, 255, 255];
  return [
    truncByte(255 + 0.75 * (l[0] - 255)),
    truncByte(255 + 0.75 * (l[1] - 255)),
    truncByte(255 + 0.75 * (l[2] - 255)),
    255,
  ];
}

// ---- 717 熔岩云 LavaLightA（TileDrawing.cs:845-873 verbatim 移植） ----

/** TileDrawing 静态 noise[256]（ctor :798-809,new Random(0) NextDouble×2-1）。
 *  懒建（UnifiedRandom(0)=C# Random 同构移植,src/core/rng.ts）——首调后恒存。 */
let NOISE_256: Float64Array | null = null;
function noise256(): Float64Array {
  if (NOISE_256) return NOISE_256;
  const rng = new UnifiedRandomBridge(0);
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) t[i] = rng.nextDouble() * 2 - 1;
  NOISE_256 = t;
  return t;
}

/** C# Random(0) 桥（结构型最小面——core/rng.UnifiedRandom C# 同构移植,顶部 import） */

/** Hash（:825-833,uint 乘法溢出→Number 精度安全域内用 Math.imul 链） */
function tdHash(xu: number): number {
  let x = xu >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 2146121005) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 2221713035) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}
/** Hash2（:835-843） */
function tdHash2(xu: number): number {
  let x = xu >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 3513297581) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 2943497623) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return x >>> 0;
}

/** LinearNoise（:810-823）：256 噪声表双线性（其实为分段线性）插值 */
function linearNoise(x: number): number {
  let num = Math.trunc(x);
  if (x < 0) num--;
  const frac = x - num;
  const n = noise256();
  const a = n[num & 255];
  const b = n[(num + 1) & 255];
  return a * (1 - frac) + b * frac;
}

/** DistToWanderingCircle（:845-856）：pos 到游走圆心距（gridSize=7,wander=2f） */
function distToWanderingCircle(px: number, py: number, seed: number, tVis: number): number {
  const gx = Math.trunc(px / 7);
  const gy = Math.trunc(py / 7);
  let vx = (gx + 0.5) * 7;
  let vy = (gy + 0.5) * 7;
  const n2 = (tdHash(gx >>> 0) ^ tdHash2(gy >>> 0) ^ seed) & 0xffffff;
  const n3 = (tdHash2(gx >>> 0) ^ tdHash(gy >>> 0) ^ seed) & 0xffffff;
  vx += linearNoise((n2 + tVis) * 0.025) * 2;
  vy += linearNoise((n3 + tVis) * 0.025) * 2;
  return Math.hypot(px - vx, py - vy);
}

const smoothStep = (x: number): number => x * x * (3 - 2 * x);

/** LavaLightA（:857-872）：4 游走圆最小距 → SmoothStep(GetLerpValue(0,3.5,t)) →
 *  Remap(t, 0.7, 1, toMin, 1)（头顶非实心 → toMin=0.8,否则 0）。 */
export function lavaLightA(x: number, y: number, tVis: number, solidAbove: boolean): number {
  const v0 = distToWanderingCircle(x, y, 2221713035 >>> 0, tVis);
  const v1 = distToWanderingCircle(x + 3, y, 657044585 >>> 0, tVis);
  const v2 = distToWanderingCircle(x, y + 3, 741521833 >>> 0, tVis);
  const v3 = distToWanderingCircle(x + 3, y + 3, 56936621 >>> 0, tVis);
  let t = Math.min(v0, v1, v2, v3);
  const lerpVal = Math.min(1, Math.max(0, t / 3.5));
  t = smoothStep(1 - lerpVal);
  const toMin = solidAbove ? 0 : 0.8;
  const rt = Math.min(1, Math.max(0, (t - 0.7) / 0.3));
  return toMin + (1 - toMin) * rt;
}

/** :1214-1218 熔岩云色：Color(n,n,n,n/2)（FNA Color(f,f,f,f)=Clamp(f×255) 截断） */
export function lavaCloudColor(a: number): RGBA {
  const c = truncByte(a * 255);
  return [c, c, c, truncByte(a / 2 * 255)];
}

/** :1214-1218 717 色式 / :1343-1355 725 色式共享基色 (255,255,255,100) */
export const WHITE_A100: RGBA = [255, 255, 255, 100];

// ===================== kind → 色序解算（扫描侧入口） =====================

export interface TileGlowColorArgs {
  x: number;
  y: number;
  frameX: number;                                    // 209 端口选择消费
  tVis: number;
  discoRGB: readonly [number, number, number] | null;
  light: readonly [number, number, number] | null;   // 633 消费
  lavaA: number | null;                              // 717 消费（调用方算好 LavaLightA）
  noirOpacity: number;                               // 725 消费
}

/** kind → RGBA 色序（tile 域全单画——双画仅 Item 域相位件）。 */
export function tileGlowColors(sheet: number, args: TileGlowColorArgs): RGBA[] {
  switch (tileGlowKind(sheet)) {
    case 'lavaMoss': return [[150, 100, 50, 0]];
    case 'krypton': return [[0, 200, 0, 0]];
    case 'xenon': return [[0, 180, 250, 0]];
    case 'argon': return [[225, 0, 125, 0]];
    case 'violet': return [[150, 0, 250, 0]];
    case 'meteor': return [[100, 100, 100, 0]];
    case 'pulse350': return [pulse350Color(args.tVis)];
    case 'discoMoss': return [args.discoRGB ? [args.discoRGB[0], args.discoRGB[1], args.discoRGB[2], 255] as RGBA : [255, 255, 255, 255] as RGBA];
    case 'shimmerGlow': return [shimmerGlowColor(args.x, args.y, args.tVis)];
    case 'ashGrass': return [ashGrassColor(args.light)];
    case 'lavaCloud': return [lavaCloudColor(args.lavaA ?? 0)];
    case 'portal': return [portalGlowColor(args.frameX)];
    case 'noir': return [[255, 255, 255, 100]];   // ×opacity 在扫描侧乘
    default: return [[255, 255, 255, 255]];
  }
}
