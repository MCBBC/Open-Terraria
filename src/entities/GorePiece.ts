// Gore 死亡碎块（Terraria/Gore.cs 1:1）+ NPC.HitEffect 死亡 gore 全表驱动。
//   数据：src/data/vanilla-gore.json（tools/extract-gore.mjs 从 NPC.cs HitEffect
//         1456:82421-90870 / 1457:82492-90939 提取（★BJ308 终点勘误:90870=方法体
//         闭括号,旧 90873 伪锚落入邻方法 CountNPCS）;表结构/字段语义见其 _meta.notes）
//   行号基准（BJ298 2026-09-23 亲核）：Gore.cs/GoreID.cs/ChildSafety.cs 三版
//   （1456/1457/1458）逐字节全等（md5 3f7708af/a8018139/2b671c07）→ 本文 Gore.cs/
//   GoreID.cs 行号三版通用；NPC.cs/Main.cs/Utils.cs 两版漂移 → 1456/1457 双标。
//   物理：Gore.Update（Gore.cs:313-1102）——本表能产出的家族全实现：
//     · 默认粘滞碎块：重力 0.2 + rotation += vx*0.05（:762-763）→ 碰撞盒
//       min(w,h)*0.9*scale（:1000-1014）→ 落地 vx*=0.97（:1015-1029）→
//       timeLeft -= DisappearSpeed / alpha += DisappearSpeedAlpha（:1030-1037）
//       【无水交互】：落水钉液面/溅音/涟漪段（:962-995）在 IsDrip 门（:931）内，
//       滴水族不出自 HitEffect 且由 NatureParticles 独占 → 粘滞碎块入水=穿水
//       沉底（水非实心，TileCollision 不改速），见 fixedUpdate sticky 支注
//     · 血块收缩族 {11,12,13,16,17,61,62,63,99,220-222,375-377,435-437,861-862}
//       非粘滞：v*=0.98 + scale-=0.007/0.01（:535-556）+ alpha += 2*AlphaSpeed（:1041）
//     · 276-282（庆典史莱姆彩带）：v*=0.98 + vy<scale 时 +0.05 + ±0.01 翻滚（:352-371）
//       叠加默认重力支与粘滞碰撞
//     · SpecialAI 1 帆降族（860/892/893 海盗船残骸、1014-1016 黑魔法师长袍）：
//       Gore_UpdateSail（:1231-1291）相位下落 + 碰撞转落地滑移
//     · SpecialAI 7（1218 暗影宝箱怪钱币）：UpdateLightningBunnySparks（:244-262）
//       timeLeft 倒数 + alpha = lerp(255,0,timeLeft/15)
//     · 16/17 火苗族（NewGore :1487-1490）：alpha=100 + scale=0.7 + light=1 →
//       Update :546-556 走 0.01 收缩档 → 尾段 :1078-1101 light*scale 衰减通道
//       AddLight（16 = 橙火 (1,0.8,0.3)，17 = 蓝火 (0.3,0.6,1)）；
//       GetAlpha :1487-1490 返回 Color(255,255,255,0)——XNA 预乘混合下 A=0 即
//       加性全亮（1405 同处为取场景光照 RGB，见 Gore.cs:1164-1174，此处从 1456）
//   出生：Gore.NewGore（:1306-1482）——vy -= rand(10,31)*0.1 / vx += rand(-20,21)*0.1
//   随机扰动（:1347-1348）、ChildSafety 替换（:1339-1345）、粘滞/时档（:1361-1374）、
//   600 槽池（:1328-1340）。
//   屏幕坐标档（screenGrid）：肉山死亡屏幕级尘幕（NPC.cs 1456:88307-88327 /
//   1457:88379-88399）——位置依赖
//   Main.screenPosition（相机态），提取器编译为结构化网格域，运行时以
//   setGoreScreen 注入的相机快照求值（玩家深度门 playerDeepHell 同源）。
//   落叶(SpecialAI 3)/滴水族不出自 HitEffect，由 render/NatureParticles 独占。
//   ★BJ377 勘误：SpecialAI3 中 1007/1008（智慧巨著风暴碎块）出自 AI_145/BookProj
//   掷流，属本类且走 updateLeaf 相位物理——见 LEAF_TYPES 注。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { moveAndCollide } from '../physics/TileCollision';
import goreTable from '../data/vanilla-gore.json';

/** Gore.goreTime（Gore.cs:16） */
export const GORE_TIME = 600;
/** Main.gore 池容量（Gore.cs:1328-1340：无空槽则丢弃） */
const MAX_GORE = 600;
/** 纹理缺失时的碰撞盒回退（Gore.cs:999 num36=32） */
const FALLBACK_TEX = 32;
/** 1 世界像素 = 1/16 格 */
const PX = 1 / 16;

/** NewGore :1361-1364 sticky=false 族（goreTime!=0 时） */
const NON_STICKY_TYPES = new Set([11, 12, 13, 16, 17, 61, 62, 63, 99, 220, 221, 222, 435, 436, 437, 861, 862]);
/** 血块收缩族（Gore.cs:535-556；16/17 独立支为 0.01 档） */
const SHRINK_TYPES = new Set([11, 12, 13, 61, 62, 63, 99, 220, 221, 222, 375, 376, 377, 435, 436, 437, 861, 862]);
/** 彩带阻尼族（Gore.cs:352-371） */
const isDampRibbon = (t: number) => t >= 276 && t <= 282;
/** GoreID.Sets.SpecialAI==1（GoreID.cs:9）：帆降 */
const SAIL_TYPES = new Set([860, 892, 893, 1014, 1015, 1016]);
/** GoreID.Sets.SpecialAI==3 落叶族中【出自武器 AI/Gore 掷流】的两型（GoreID.cs:9
 *  1007→3/1008→3；1007=智慧巨著风暴漩涡、1008=同族尾带——AI_145 :71545-71575 与
 *  :25762 SelectRandom(1007,1008,1008) 掷出）。同组其余（910-925/1113-1121/
 *  1248-1255/1257/1278）=树木落叶,由 render/NatureParticles 独占（★BJ377 勘误:
 *  本文件头注曾断言 SpecialAI3 全族"不出自 HitEffect"=漏 1007/1008,帧表+相位
 *  物理双缺 → 整张竖条贴图画出） */
const LEAF_TYPES = new Set([1007, 1008]);
/** 多帧行数（NewGore :1391-1398：1201/1208→4、1217/1218→3、1225→3）。
 *  ★BJ377 补 1007/1008→8：SpecialAI==3 支 Frame=SpriteFrame(1,8)（:1416-1424）——
 *  Gore_1007.png=14×144 / Gore_1008.png=10×112 竖排 8 帧图集，旧表漏配=每片碎块
 *  整张竖条画出（旋转长条,用户实报"原版是切好的小图"定谳） */
const FRAME_ROWS: Record<number, number> = { 1201: 4, 1208: 4, 1217: 3, 1218: 3, 1225: 3, 1007: 8, 1008: 8 };
/** GoreID.Sets.DisappearSpeed（GoreID.cs:11，默认 1） */
const DISAPPEAR_SPEED: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7 };
/** GoreID.Sets.DisappearSpeedAlpha（GoreID.cs:13，默认 1） */
const DISAPPEAR_ALPHA: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7, 1218: 3 };
/** ★BJ377 落叶支探针（Gore_UpdateLeaf :1115-1140）：液面/地面格查询 */
type GoreStore = import('../world/TileStore').TileStore;
const liquidAtGore = (st: GoreStore, px: number, py: number): number => {
  const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
  if (!st.inBounds(tx, ty)) return 0;
  const i = st.idx(tx, ty);
  return st.liquid[i] > 0 ? st.liquidType[i] : 0;      // 1水 2岩浆 3蜂蜜 4微光
};
const solidAtGore = (st: GoreStore, px: number, py: number): boolean => {
  const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
  return st.inBounds(tx, ty) && st.isSolid(tx, ty);
};
/** Main.WindForVisuals ≈ weather.windSpeedCurrent（Game.ts:26346 同源换算） */
const windForVisuals = (game: GameHooks): number => game.world.weather?.windSpeedCurrent ?? 0;
/** Main.worldSurface × 16（World.groundLevel=地表行） */
const surfaceRowPx = (game: GameHooks): number => game.world.groundLevel * 16;
const vanishSpeed = (t: number) => DISAPPEAR_SPEED[t] ?? 1;
const vanishAlpha = (t: number) => DISAPPEAR_ALPHA[t] ?? 1;

/** 气泡族判定（Gore.cs:856/:1427 的 411-430 专属块——泡泡棒 1450 喷出的
 *  411-415 经 NewGore 尾段 type += rand(4)*5 可落入全部四族） */
const isBubble = (t: number) => t >= 411 && t <= 430;
/** 气泡族贴图尺寸兜底（terraria-assets/Images/Gore_411-430.png 实测 10/20/32/48/64；
 *  该族已由 _meta.tex 运行时直调面覆盖（tools/extract-gore.mjs EXTRA_TEX_FAMILIES，
 *  值与实测一致）——BUBBLE_TEX 保留为表缺图时的兜底。NewGore 尾段定位 / Update
 *  爆裂尘计数 / 玩家与实心碰撞矩形都以贴图原尺寸为准 */
const BUBBLE_TEX: Record<number, number> = {
  411: 10, 412: 20, 413: 32, 414: 48, 415: 64,
  416: 10, 417: 20, 418: 32, 419: 48, 420: 64,
  421: 10, 422: 20, 423: 32, 424: 48, 425: 64,
  426: 10, 427: 20, 428: 32, 429: 48, 430: 64,
};
/** 气泡族爆裂尘 type（Gore.cs:908-921：411-415→176 / 416-420→177 / 421-425→178 /
 *  426-430→179） */
const bubbleDustType = (t: number): number =>
  t >= 426 ? 179 : t >= 421 ? 178 : t >= 416 ? 177 : 176;

/** ChildSafety.SafeGore（ChildSafety.cs：开启童模时危险 gore → 11-13 落叶替代） */
const SAFE_GORE = new Set([
  11, 12, 13, 16, 17, 42, 44, 51, 52, 53, 54, 55, 56, 57, 61, 62, 63, 67, 68, 69, 99, 106,
  120, 130, 131, 147, 148, 149, 150, 156, 166, 167, 168, 169, 170, 171, 172, 173, 174, 197,
  198, 199, 200, 201, 202, 203, 204, 213, 217, 218, 219, 220, 221, 222, 257, 265, 266, 267,
  268, 269, 276, 277, 278, 279, 280, 281, 282, 314, 315, 316, 321, 322, 326, 331, 360, 361,
  362, 363, 364, 365, 366, 367, 368, 369, 370, 375, 376, 377, 406, 407, 408, 409, 410, 411,
  412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429,
  430, 435, 436, 437, 521, 522, 523, 525, 526, 527, 542, 570, 571, 572, 580, 581, 582, 603,
  604, 605, 606, 610, 611, 612, 613, 614, 615, 616, 617, 618, 639, 660, 661, 695, 696, 697,
  698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715,
  716, 717, 718, 719, 720, 721, 728, 729, 730, 731, 732, 733, 734, 770, 825, 826, 827, 848,
  849, 850, 851, 853, 854, 855, 856, 857, 858, 859, 860, 861, 862, 892, 893, 898, 899, 907,
  908, 909, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925,
  926, 939, 940, 941, 942, 943, 964, 965, 966, 970, 971, 972, 973, 992, 1007, 1008, 1024,
  1025, 1026, 1027, 1028, 1029, 1030, 1060, 1066, 1087, 1088, 1089, 1090, 1091, 1092, 1093,
  1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127,
  1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142,
  1143, 1144, 1145, 1146, 1147, 1160, 1161, 1162, 1201, 1202, 1203, 1204, 1205, 1206, 1207,
  1208, 1209, 1210, 1211, 1212, 1213, 1218, 1225, 1226, 1248, 1249, 1250, 1251, 1252, 1253,
  1254, 1255, 1257, 1258, 1261, 1269, 1278, 1333, 1334, 1346, 1361, 1372, 1373, 1374, 1375,
  1376, 1383, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402,
]);

/**
 * ChildSafety.Disabled（ChildSafety.cs：原版默认 true = 关闭）。开启童模
 * （false）后 DangerousGore 一律替换成 11-13 落叶 + 半随机 scale + 速度减半
 * （Gore.NewGore :1339-1345），替换发生在粘滞/时档判定之前（后续分支按新 type 走）。
 */
export const ChildSafety = {
  disabled: true,
  /** DangerousGore(id)（ChildSafety.cs） */
  dangerous(id: number): boolean {
    return !SAFE_GORE.has(id);
  },
};

/**
 * Main.netMode（Main.cs：0 单人 / 1 多人客户端 / 2 服务端）。单人游戏恒 0；
 * 联机会话由 Game 侧在进房/建房时切换（表内 `net` 门 = 原版 `Main.netMode != 1`
 * 一类守卫，客户端不本地产 gore——原版由服务端同步）。
 */
let goreNetMode = 0;
export function setGoreNetMode(mode: 0 | 1 | 2): void {
  goreNetMode = mode;
}
export function goreNetModeValue(): number {
  return goreNetMode;
}

/**
 * Main.screenPosition / screenWidth / screenHeight 相机快照——屏幕坐标档表项
 * （screenGrid，WoF 死亡屏幕级尘幕 NPC.cs 1456:88307-88327 / 1457:88379-88399）的唯一位置源。Game 每帧
 * 相机定位后注入；未注入（菜单/纯逻辑测试）= null → 该档表项静默跳过。
 * 语义：x/y = 视区左上角世界坐标（Main.screenPosition），w/h = 画布像素尺寸
 * （Main.screenWidth/Height——原版以屏宽当日幕纵向跨度，怪癖在求值侧照搬）。
 */
let goreScreen: { x: number; y: number; w: number; h: number } | null = null;
let goreScreenSet = false;
export function setGoreScreen(x: number, y: number, w: number, h: number): void {
  goreScreen = { x, y, w, h };
  goreScreenSet = true;
}
export function goreScreenValue(): { x: number; y: number; w: number; h: number } | null {
  return goreScreenSet ? goreScreen : null;
}

/** vanilla-gore.json 表项（字段语义见提取器 _meta.notes） */
export interface GoreGate {
  k: 'alt' | 'sdir' | 'dmg' | 'shim' | 'net' | 'rnd' | 'redhat' | 'skip';
  op?: '==' | '!=' | '>=' | '<=' | '>' | '<';
  v?: number;
  n?: number;
  not?: boolean;
  reason?: string;
}
export interface GoreRotTerm {
  /** Unit 轴：'x' | 'y' */
  a: 'x' | 'y';
  /** 符号：常数或 'sd' = (spriteDirection != 1 ? 1 : -1)（荷兰人 vector20） */
  s: number | 'sd';
  /** 系数（dim 非空时为尺寸分数） */
  k: number;
  dim?: 'w' | 'h' | null;
}
export type GorePostOp =
  | ['vm', number]
  | ['va', 'x' | 'y', number, number]
  | ['vs', Record<string, number | number[] | GoreRotTerm[]>]
  | ['ss', number]
  | ['sm', number, number]
  | ['al', number | 'npc']
  | ['ro', number]
  | ['ps', Record<string, unknown>];

/** 屏幕锚定网格尘幕域（WoF NPC.cs 1456:88307-88327 / 1457:88379-88399，提取器 compileScreenGrid 产物）：
 *  外层 y 自 (int)Main.screenPosition.Y 起、步 yStep、跨度 ySpan（原版拿屏宽当
 *  纵向跨度的怪癖）；内层 x 自 (int)npc.position.X（direction>0 时 +dirShift）起、
 *  宽 xSpan、步 xStep。每格一枚 gore（id/速度逐格重采样）。 */
export interface GoreScreenGrid {
  yStep: number;
  ySpan: 'screenWidth';
  xSpan: number;
  xStep: number;
  /** direction>0 时 x0 偏移（1456:88310-88313 / 1457:88382-88385 -= 80） */
  dirShift?: number;
  /** 深度门（1456:88303 / 1457:88375）：玩家 tileY > maxTilesY − gateTiles 才出 */
  gate?: 'playerDeepHell';
  gateTiles?: number;
}

/** 屏幕坐标档求值输入（spawnNpcDeathGore 自动组装；直调 spawnDeathGore 的测试可省略） */
export interface GoreSpawnCtx {
  /** 相机快照（setGoreScreen 注入；null = 未注入 → screenGrid 档跳过） */
  screen: { x: number; y: number; w: number; h: number } | null;
  /** 玩家 tileY（playerDeepHell 门；NPC.position.Y/16） */
  playerTileY?: number;
  /** maxTilesY（world.store.h） */
  maxTilesY?: number;
}

export interface GoreSpawnEntry {
  id?: number | null;
  /** `IsShimmerVariant ? idAlt : id`（微光变体 id） */
  idAlt?: number;
  idMin?: number; idMax?: number; ids?: number[]; n?: number;
  /** 常量速度 */
  vx?: number; vy?: number;
  /** NPC 速度系数（velocity * k） */
  kx?: number; ky?: number;
  /** 均匀随机速度 [m-a, m+a]（Main.rand.Next 区间编译产物） */
  mx?: number; my?: number; ax?: number; ay?: number;
  /** 随机幅值 × 击退方向（`Next(a,b)*C*hitDirection`）→ [lo, hi] × hitDir */
  hdm?: [number, number];
  /** 均匀随机方向定速（UnitY.RotatedByRandom(2π)*K / Transform((K,0), rot(rand*2π))） */
  de?: number;
  /** 椭圆盘随机速度（NextVector2Circular(rx, ry)：单位向量 × 半径 × u） */
  dc?: [number, number];
  /** rotation.ToRotationVector2()*k（flip 奇数次 = spriteDirection==1 时 X 取反） */
  rv?: [number, number];
  /** vx 取击退方向（new Vector2(hitDirection, 0f)） */
  hd?: number;
  /** 出生点 = npc 左上角 + off + frac*[w,h] + rwd*[w,h] + jitter + direction*d + rot 项 + dc */
  ox?: number; oy?: number; fx?: number; fy?: number;
  /** 随机尺寸分数域 [a,b]（`Next(width)`/`(w±c)*NextFloat()` 编译产物） */
  rwx?: [number, number]; rwy?: [number, number];
  /** 像素抖动域 [a,b]（Utils.RandomVector2 / Next 常数链乘） */
  jx?: [number, number]; jy?: [number, number];
  /** ±direction 偏移（UnitX/UnitY × k × direction） */
  dx?: number; dy?: number;
  /** Unit 轴 × 系数再按 NPC rotation 旋转（(-UnitY*50).RotatedBy(rotation) 等） */
  rot?: GoreRotTerm[];
  scale?: number; scaleExpr?: string;
  /** 屏幕锚定网格域（Position 依赖 Main.screenPosition 的编译产物；与 pos 互斥） */
  screenGrid?: GoreScreenGrid;
  /** 未编译的原文（登记用） */
  posExpr?: string; velExpr?: string; expr?: string;
  /** 原版 ai[N]==V 门（不满足跳过该条） */
  ai?: Array<{ slot: number; value: number; not?: boolean }>;
  /** 结构化守卫门（运行时求值，不满足跳过该条） */
  gates?: GoreGate[];
  /** NewGore 之后的实例后处理（有序） */
  post?: GorePostOp[];
  /** Gore.NewGorePerfect：精确 pos/vel（随机扰动后回写，:1293-1299） */
  perfect?: boolean;
  /** 原版常量次数 for 循环体（如 EoC `for(<2)` 4 调用 = 8 块）；id 区间已编码迭代序列时为 1 */
  loop?: number;
  line?: number;
}

/** 死亡来源 NPC 的最小形状（Enemy/Critter 均满足；测试可传 mock） */
export interface GoreNpcSource {
  vanillaId: number | null;
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  vanillaScale: number;
  ai0: number; ai1: number; ai2: number; ai3: number;
  hitDir?: number;
  /** NPC.altTexture（变体贴图槽，缺省 0） */
  altTexture?: number;
  /** NPC.IsShimmerVariant（NPC.cs 1456:6643 / 1457:6737：城镇 NPC 微光变体态，缺省 false） */
  isShimmerVariant?: boolean;
  /** NPC.spriteDirection（缺省 1；本仓 Enemy.facing 同符号约定） */
  spriteDirection?: number;
  /** NPC.direction（移动方向，缺省取 spriteDirection） */
  direction?: number;
  /** NPC.rotation（缺省 0；rot 项按此旋转） */
  rotation?: number;
  /** NPC.localAI[3]（RedHatSkeletronAdjustmentsEnabled 用，缺省 0） */
  lai3?: number;
  /** HitEffect dmg 实参（死亡钩缺省 9999 = 原版脚本化死亡调用约定） */
  dmg?: number;
  /** NPC.alpha（post `al:'npc'` 用，缺省 0） */
  alpha?: number;
}

type GoreTable = Record<string, GoreSpawnEntry[]> & {
  _meta: { tex: Record<string, { w: number; h: number }>; [k: string]: unknown };
};
const TABLE = goreTable as unknown as GoreTable;
const TEX = TABLE._meta?.tex ?? {};

/** NPC id → 死亡 gore 表项（无表项 = 原版只出尘不出块，如史莱姆族） */
export function deathGoreFor(npcId: number): GoreSpawnEntry[] {
  return TABLE[String(npcId)] ?? [];
}

const irand = (n: number) => Math.floor(Math.random() * n);
/** Main.rand.Next(min, max) 语义：[min, max-1] */
const irand2 = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));
const uniform = (m: number, a: number) => m + (Math.random() * 2 - 1) * a;
/** 区间均匀取值 [lo, hi]（端点闭合近似） */
const range01 = (r: readonly [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
/** Utils.NextVector2Circular（Utils.cs 1456:1269 / 1457:1301）：单位向量 × (rx,ry) × u */
function disk(rx: number, ry: number): { x: number; y: number } {
  const a = Math.random() * Math.PI * 2;
  const u = Math.random();
  return { x: Math.cos(a) * rx * u, y: Math.sin(a) * ry * u };
}

/** 存活 gore 池（= Main.gore 600 槽；渲染层 drawGorePieces 也从这里取） */
const livePool = new Set<GorePiece>();
/** 切世界/重载时清池（EntityManager.clear 会丢弃引用但不置 dead，计数须同步归零） */
export function resetGorePool(): void {
  livePool.clear();
}
/** 当前存活 gore（渲染/诊断用） */
export function liveGorePieces(): GorePiece[] {
  return [...livePool];
}

export class GorePiece extends Entity {
  /** Gore.type（贴图 Gore_<type>.png） */
  readonly goreId: number;
  rotation = 0;
  scale: number;
  alpha = 0;
  timeLeft = GORE_TIME;
  sticky = true;
  /** Gore.light（NewGore :1487-1490 仅 16/17 置 1；Update 尾段据此 AddLight） */
  light = 0;
  /** 贴图原始尺寸（碰撞盒与绘制基准；缺失回退 32） */
  texW: number;
  texH: number;
  /** SpriteFrame 行（多帧竖条：1217/1218 等） */
  row = 0;
  private frameCounter = 0;

  constructor(type: number, x: number, y: number, scale: number) {
    super();
    this.goreId = type;
    this.scale = scale;
    const tex = TEX[type];
    // 气泡族（411-430）已入 _meta.tex 运行时直调面；BUBBLE_TEX 仍作缺图兜底（见其注释）
    this.texW = tex?.w ?? BUBBLE_TEX[type] ?? FALLBACK_TEX;
    this.texH = tex?.h ?? BUBBLE_TEX[type] ?? FALLBACK_TEX;
    this.x = x;
    this.y = y;
    this.resizeBox();
  }

  /** 碰撞盒 = min(texW,texH)*0.9*scale（Gore.cs:1000-1014） */
  private resizeBox() {
    const raw = Math.min(this.texW, this.texH) * 0.9 * this.scale;
    this.w = Math.max(2, Math.floor(raw));
    this.h = this.w;
  }

  /** 16/17 火苗族加性全亮（GetAlpha :1487-1490：Color(255,255,255,0) 预乘=加性） */
  get additive(): boolean {
    return this.goreId === 16 || this.goreId === 17;
  }

  /**
   * 光照贡献（Gore.Update 尾段 :1078-1101）：light>0 时以中心格 AddLight
   * light*scale，16 号 B×0.3/G×0.8、17 号 G×0.6/R×0.3（衰减后的通道）。
   * 由 Game 每帧消费（GorePiece 不持有 Lighting 引用）。
   */
  lightRGB(): { tx: number; ty: number; r: number; g: number; b: number } | null {
    if (this.dead || this.light <= 0) return null;
    let r = this.light * this.scale;
    let g = r;
    let b = r;
    if (this.goreId === 16) { b *= 0.3; g *= 0.8; }
    else if (this.goreId === 17) { g *= 0.6; r *= 0.3; }
    const cx = this.x + (this.texW * this.scale) / 2;
    const cy = this.y + (this.texH * this.scale) / 2;
    return { tx: Math.floor(cx * PX), ty: Math.floor(cy * PX), r, g, b };
  }

  /** Gore.NewGore（Gore.cs:1306-1482）：池满/type 非法则弃；返回 null */
  static newGore(
    type: number, x: number, y: number, vx: number, vy: number, scale = 1, perfect = false,
  ): GorePiece | null {
    if (type < 0 || livePool.size >= MAX_GORE) return null;
    const g = new GorePiece(type, x, y, scale);
    g.vx = vx; g.vy = vy;
    if (!perfect) {
      // :1347-1348 随机扰动：vy -= Next(10,31)*0.1 ∈ [-3.0,-1.0]；vx += Next(-20,21)*0.1 ∈ [-2.0,2.0]
      g.vy -= irand2(10, 31) * 0.1;
      g.vx += irand2(-20, 21) * 0.1;
    }
    g.rotation = 0;
    g.alpha = 0;
    // :1339-1345 ChildSafety：童模开启 → 危险 gore 替换 11-13（scale 半随机、速度减半），
    // 替换先于粘滞/时档/16/17/SpecialAI 分支（后续判定均按新 type）
    let t = type;
    if (!ChildSafety.disabled && ChildSafety.dangerous(t)) {
      t = 11 + irand(3);
      g.goreIdCompat(t);
      g.scale = Math.random() * 0.5 + 0.5;
      g.vx /= 2;
      g.vy /= 2;
      g.resizeBox();
    }
    // :1361-1374 粘滞与时档
    if (NON_STICKY_TYPES.has(t)) {
      g.sticky = false;
    } else if (t >= 375 && t <= 377) {
      g.sticky = false;
      g.alpha = 100;
    } else {
      g.sticky = true;
      g.timeLeft = GORE_TIME;
    }
    // :1487-1490 16/17 火苗族：alpha=100 + scale=0.7 + light=1
    if (t === 16 || t === 17) {
      g.alpha = 100;
      g.scale = 0.7;
      g.light = 1;
      g.resizeBox();
    }
    // :1391-1398 多帧族（Frame=SpriteFrame(1,rows)，行 0 起；1218 首帧随机行在 Update 内）
    if (FRAME_ROWS[t]) g.row = 0;
    // :1416-1424 SpecialAI==3（1007/1008 段）：初速整体覆写为 ((rand-0.5)*1,
    // rand*2π)——vy 兼作相位累加器,调用方传入初速被原版弃用（AI_145 的 vx×1.5 只
    // 保留其 spawn 后追加 velocity.X += proj.vx 一项）;Frame=SpriteFrame(1,8)
    // 随机起始行 + frameCounter=rand(8)
    if (LEAF_TYPES.has(t)) {
      g.vx = (Math.random() - 0.5) * 1;
      g.vy = Math.random() * Math.PI * 2;
      g.row = irand(8);
      g.frameCounter = irand(8);
    }
    // :1423-1425 SpecialAI==1（帆降）：初速整体覆写为 ((rand-0.5)*3, rand*2π)——
    // vy 兼作相位累加器，Gore_UpdateSail 据此走圆弧下落
    if (SAIL_TYPES.has(t)) {
      g.vx = (Math.random() - 0.5) * 3;
      g.vy = Math.random() * Math.PI * 2;
    }
    // :1427-1435 气泡族尾段（411-430）：定位改贴图底心锚、初速两轴缩放、
    // type += rand(4)*5（四族 {411-415,416-420,421-425,426-430} 同尺寸档随机——
    // 泡泡棒 1450 按 411-415 档掷出后在此扩散）、timeLeft = rand(300,1200)
    // （goreTime/2 .. goreTime*2）。来源顺序在帆降块之后、907-909 行块之前
    if (isBubble(t)) {
      g.x -= (g.texW / 2) * g.scale;
      g.y -= g.texH * g.scale;
      g.vy *= irand2(90, 151) * 0.01;
      g.vx *= irand2(40, 91) * 0.01;
      g.goreIdCompat(t + irand(4) * 5);
      g.timeLeft = irand2(300, 1201);
    }
    // :1442-1449（907-909 随机起始帧；本表未出现，保留语义）
    if (t >= 907 && t <= 909) g.row = irand(3);
    livePool.add(g);
    return g;
  }

  /** ChildSafety 替换后的 type 回写（readonly 字段内部修正） */
  private goreIdCompat(t: number): void {
    (this as { goreId: number }).goreId = t;
  }

  /** 每固定 tick（Gore.Update，Gore.cs:313-1102） */
  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    if (this.dead) return;
    const st = game.world.store;
    const t = this.goreId;

    // sticky 入口：越界消亡 + 速度钳 32（:319-329 / DeactivateIfOutsideOfWorld :297-311）
    if (this.sticky) {
      const tx = Math.floor(this.x / 16), ty = Math.floor(this.y / 16);
      if (!st.inBounds(tx, ty)) { this.kill(); return; }
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 32) { this.vx *= 32 / sp; this.vy *= 32 / sp; }
    }

    // SpecialAI 7（1218）：UpdateLightningBunnySparks :244-262（switch :331-345 早退）
    if (t === 1218) {
      if (this.frameCounter === 0) {
        this.frameCounter = 1;
        this.row = irand(3); // Frame(1,3) 内随机行
      }
      this.timeLeft -= vanishSpeed(t);
      if (this.timeLeft <= 0) { this.kill(); return; }
      this.alpha = Math.round(255 - (255 * Math.max(0, this.timeLeft)) / 15);
      this.x += this.vx;
      this.y += this.vy;
      if (this.alpha >= 255) this.kill();
      return;
    }

    if (LEAF_TYPES.has(t)) { this.updateLeaf(game); return; }
    if (SAIL_TYPES.has(t)) { this.updateSail(game); return; }

    // 气泡族（411-430，Gore.cs:856-931 独占块）：整块替换物理链与碰撞/时档尾段
    // （源码中该尾段是本块的 else 分支，气泡不进 TileCollision/时档渐隐），
    // 末段 position += velocity（:1070-1077）与本块内爆裂尘归 updateBubble
    if (isBubble(t)) { this.updateBubble(game); return; }

    // ---- 位移前物理（:352-769 链）----
    if (isDampRibbon(t)) {
      // :352-371 彩带阻尼
      this.vx *= 0.98;
      this.vy *= 0.98;
      if (this.vy < this.scale) this.vy += 0.05;
      if (this.vy > 0.1) this.rotation += this.vx > 0 ? 0.01 : -0.01;
      this.vy += 0.2;                 // 默认重力支（:760-764）
      this.rotation += this.vx * 0.05;
    } else if (t === 16 || t === 17) {
      // :546-556 火苗族独立支：0.01 收缩档（与血块 0.007 区分）
      this.vy *= 0.98;
      this.vx *= 0.98;
      this.scale -= 0.01;
      if (this.scale < 0.1) { this.scale = 0.1; this.alpha = 255; }
      this.resizeBox();
    } else if (SHRINK_TYPES.has(t)) {
      // :535-556 血块收缩（0.007 档）
      this.vy *= 0.98;
      this.vx *= 0.98;
      this.scale -= 0.007;
      if (this.scale < 0.1) { this.scale = 0.1; this.alpha = 255; }
      this.resizeBox();
    } else {
      // 默认支（:760-764）：重力 0.2 + 随 vx 翻滚
      this.vy += 0.2;
      this.rotation += this.vx * 0.05;
    }

    // ---- 碰撞/时档尾段（:929-1042）----
    if (this.sticky) {
      // ★落水段【不属于】本支（Gore.cs:931 `IsDrip[type]` 门 + :962-995 钉液面/
      //  落水音/涟漪都在 IsDrip 支内；:993 else-if sticky 支只有 TileCollision +
      //  落地摩擦 + 时档）。滴水族 706-717/943/1147/1160-62/1383 全部不出自
      //  NPC.HitEffect（vanilla-gore.json 全表与 IsDrip 零交集，2026-09-08 校验），
      //  滴水由 render/NatureParticles 独占移植（含 :955-985 溅落段）——本类实例
      //  恒非 drip，照搬该支曾致死亡碎块入水瞬移钉液面并逐拍 16px 级联上浮
      //  （液面钉位 y=行顶−liquid/16 使满液格底缘落进上一格 → 逐拍重算上浮）。
      //  原版碎块入水 = 无任何水交互，重力照加穿水沉底（水非实心 TileCollision
      //  不改速）→ 沉底停驻至 timeLeft 渐隐（用户实报 2026-09-07 定谳）。
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.vy === 0) {
        // 落地摩擦（:1015-1029）：|vx|<0.01 归零
        this.vx *= 0.97;
        if (this.vx > -0.01 && this.vx < 0.01) this.vx = 0;
      }
      if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
      else this.alpha += vanishAlpha(t);
    } else {
      // :1041 非粘滞：两倍速渐隐
      this.alpha += 2 * vanishAlpha(t);
      this.x += this.vx;
      this.y += this.vy;
    }

    if (this.alpha >= 255) this.kill();
  }

  /** Gore_UpdateSail（Gore.cs:1231-1291）：相位下落；碰撞转落地滑移支 */
  private updateSail(game: GameHooks): void {
    const t = this.goreId;
    if (this.vy < 0) {
      // 落地滑移支（:1233-1261）：只推 velocity.X，不推进 position
      let moveX = this.vx;
      const size = Math.floor(Math.min(this.texW, this.texH) * 0.9 * this.scale);
      const probe = { x: this.x, y: this.y, w: size, h: size, vx: moveX, vy: 0.6, onGround: false, hitWall: false, hitHead: false };
      moveAndCollide(probe, game.world, moveX, 0.6);
      moveX = probe.vx * 0.97;
      if (moveX > -0.01 && moveX < 0.01) moveX = 0;
      if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
      else this.alpha += vanishAlpha(t);
      this.vx = moveX;
      if (this.alpha >= 255) this.kill();
      return;
    }
    // 下落支（:1263-1290）：vy 兼作相位累加器；UnitY.RotatedBy(vy) = (−sin, cos)，Y 取 |·|
    this.vy += Math.PI / 60;
    const dx = -Math.sin(this.vy) * 2 * 2;
    const dy = Math.abs(Math.cos(this.vy)) * 3 * 2;
    const size = Math.floor(Math.min(this.texW, this.texH) * 0.9 * this.scale);
    const body = { x: this.x, y: this.y, w: size, h: size, vx: dx, vy: dy, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(body, game.world, dx, dy);
    if (body.vx !== dx || body.vy !== dy) this.vy = -1; // 碰撞 → 落地支
    this.x = body.x;
    this.y = body.y;
    this.rotation = Math.atan2(body.vy, body.vx) + Math.PI;
    if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(t);
    else this.alpha += vanishAlpha(t);
    if (this.alpha >= 255) this.kill();
  }

  /**
   * Gore_UpdateLeaf（Gore.cs:1104-1230）——SpecialAI==3 相位落叶物理,1007/1008
   * 专属（910-925 等树木落叶由 NatureParticles 独占同源移植）。帧推进=Update
   * :687-697（8 tick 一换且相位 vy>0.2,CurrentRow 在 4 帧组内循环）。vy<0=滑移支
   * （风推+液体滞留,无重力）,否则下落支（vy 兼相位累加器,UnitY.RotatedBy(vy)
   * 弧摆;地表上加视觉风 ×4;vector 锚补偿 vector2=(−4,0) 与 vector4 二次推进均
   * 按反编译原样照录）。近似登记：液面判定按整格液位（原版对格内液位/16 裁矩形
   * 相交）;TileCollision+Slope 走 moveAndCollide 探针盒同源管线;消失速率
   * 1007=3/3、1008=10/10（DisappearSpeed/Alpha 表已在本文件）。
   */
  private updateLeaf(game: GameHooks): void {
    const st = game.world.store;
    // 帧推进（Gore.Update :687-697）：8 tick 一换且相位 vy>0.2（下落支）,
    // CurrentRow 在 4 帧组内循环（0-3 / 4-7 各自绕圈,每片两段独立动画）
    if (++this.frameCounter >= 8 && this.vy > 0.2) {
      this.frameCounter = 0;
      const group = Math.floor(this.row / 4);
      if (++this.row >= 4 + group * 4) this.row = group * 4;
    }
    const ax = this.x + 4, ay = this.y;                  // vector=position+(4,0)（:1106-1108）
    if (this.vy < 0) {
      // ---- 滑移支（:1109-1150）----
      const liq = liquidAtGore(st, ax + 1.5, ay + 7.5);  // value=(vector.X,Y+6,3,3) 盒心
      if (liq === 2) {
        // 岩浆消亡（:1130-1134）：5×尘 31
        for (let i = 0; i < 5; i++) game.spawnDust?.(this.x, this.y, 3, 3, 31, 0, -0.2, 0, null, 1);
        this.kill();
        return;
      }
      let moveX = this.vx;
      const inLiquid = liq > 0;
      if (inLiquid) {
        moveX = liq === 3 ? 0 : windForVisuals(game);    // 蜂蜜停/水随风（:1135-1139）
        if (this.y > surfaceRowPx(game)) moveX = 0;      // 地下静止（:1140-1142）
      } else if (!solidAtGore(st, ax, ay + 16)) {
        this.vy = 0.1;                                   // 无地面 → 转下落相位（:1136-1140）
        this.timeLeft = 0;
        this.alpha = Math.min(255, this.alpha + 20);
      }
      const body = { x: ax, y: ay, w: 3, h: 3, vx: moveX, vy: -0.2, onGround: false, hitWall: false, hitHead: false };
      moveAndCollide(body, game.world, moveX, -0.2);     // vector3=(vx,−0.2) 盒 3px（:1115-1118）
      if (inLiquid) this.rotation = Math.atan2(body.vy, body.vx) + Math.PI / 2;   // :1143
      moveX = body.vx * 0.94;                            // :1145
      // :1146-1148 双臂：干地（!flag）恒归零（落地 1 拍止滑）;液内仅 |X|<0.01 归零
      //   （水随风漂移保留）——★BJ379 补 !flag 臂（旧单臂=干地 0.94ⁿ 长滑移）
      if (!inLiquid || (moveX > -0.01 && moveX < 0.01)) moveX = 0;
      this.vx = moveX;
      this.x += this.vx;                                 // position.X += velocity.X（:1149）
      if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(this.goreId);
      else this.alpha += vanishAlpha(this.goreId);
      if (this.alpha >= 255) this.kill();
      return;
    }
    // ---- 下落支（:1151-1226）----
    this.vy += Math.PI / 180;                            // :1151
    let mx = -Math.sin(this.vy);                         // UnitY.RotatedBy(vy).X ×1（:1152）
    let my = Math.abs(Math.cos(this.vy));                // .Y 取 |·| ×1
    if (this.y < surfaceRowPx(game)) mx += windForVisuals(game) * 4;   // :1154-1157
    const body = { x: ax, y: ay, w: 4, h: 4, vx: mx, vy: my, onGround: false, hitWall: false, hitHead: false };
    moveAndCollide(body, game.world, mx, my);            // TileCollision+Slope 盒 4px（:1159-1164）
    if (body.vx !== mx || body.vy !== my) this.vy = -1;  // 碰撞改速 → 回滑移支（:1190-1191）
    this.x = body.x - 4;                                 // 锚补偿 vector2=(−4,0)（:1165）
    this.y = body.y;
    // 液面：片心探针入液 → 回滑移支;岩浆 → 消亡（:1197-1204,整格液位近似）
    const frameH = this.texH / (FRAME_ROWS[this.goreId] ?? 1);
    const liq2 = liquidAtGore(st, this.x + this.texW / 2, this.y + frameH / 2 + 6);
    if (liq2 === 2) { this.kill(); return; }
    if (liq2 > 0) this.vy = -1;
    this.x += body.vx;                                   // position += vector4（:1206）
    this.y += body.vy;
    this.rotation = Math.atan2(body.vy, body.vx) + Math.PI / 2;   // :1219
    if (this.timeLeft > 0) this.timeLeft -= vanishSpeed(this.goreId);
    else this.alpha += vanishAlpha(this.goreId);
    if (this.alpha >= 255) this.kill();
  }

  /**
   * 气泡族 411-430 专属 AI（Gore.Update :856-931 的 `if (type >= 411 && type <= 430)`
   * 整块）：恒 alpha=50 半透明上浮（vy 逼近 -0.25 + 噪声、vx 逼近视觉风 ×2 + 噪声，
   * 均 1/51 低通）、rotation = vx×0.3；触碰玩家或实心块即爆（timeLeft=0）；
   * 存活期随机衰减（1/2 减 1、1/50 减 5、1/100 减 10）；timeLeft≤0 → alpha=255
   * （隐身）+ 爆裂尘（type 176-179 按族，数量 = texW×scale×0.8，noGravity、
   * alpha=100、scale=gore scale）→ 尾段 alpha≥255 判死。来源中该块独占，
   * 滴水/粘滞/时档尾段（:931 else 分支）与位移物理链（:352-769）均不进入。
   */
  private updateBubble(game: GameHooks): void {
    const t = this.goreId;
    const wind = game.world.weather?.windSpeedCurrent ?? 0;  // Main.WindForVisuals
    this.alpha = 50;                                         // :858
    this.vx = (this.vx * 50 + wind * 2 + irand2(-10, 11) * 0.1) / 51;   // :859
    this.vy = (this.vy * 50 - 0.25 + irand2(-10, 11) * 0.2) / 51;       // :860
    this.rotation = this.vx * 0.3;                           // :861
    const bw = this.texW * this.scale, bh = this.texH * this.scale;
    // :864-880 玩家矩形相交 → 爆（联机远端玩家不在 GameHooks 面，仅主角，备案）
    const pl = game.player;
    if (!pl.dead
      && this.x < pl.x + pl.w && this.x + bw > pl.x
      && this.y < pl.y + pl.h && this.y + bh > pl.y) {
      this.timeLeft = 0;
    }
    // :882-887 Collision.SolidCollision（矩形任一格实心）→ 爆
    const st = game.world.store;
    outer: for (let ty = Math.floor(this.y / 16); ty <= Math.floor((this.y + bh - 1) / 16); ty++) {
      for (let tx = Math.floor(this.x / 16); tx <= Math.floor((this.x + bw - 1) / 16); tx++) {
        if (!st.inBounds(tx, ty)) continue;
        if (st.isSolid(tx, ty)) { this.timeLeft = 0; break outer; }
      }
    }
    if (this.timeLeft > 0) {
      if (irand(2) === 0) this.timeLeft--;                    // :894-896
      if (irand(50) === 0) this.timeLeft -= 5;                // :897-899
      if (irand(100) === 0) this.timeLeft -= 10;              // :900-902
    } else {
      this.alpha = 255;                                       // :905
      // :907-928 爆裂尘：数量 = texW×scale×0.8（10px 小泡 8 颗 .. 64px 大泡 51 颗），
      // 每颗在矩形内随机落点（VanillaDust.spawn 内建 w/h 抖动）、noGravity、
      // alpha=100、scale=gore scale；钩子缺省（单测 mock）静默跳过
      const n = Math.floor(this.texW * this.scale * 0.8);
      for (let i = 0; i < n; i++) {
        game.spawnDust?.(this.x, this.y, Math.floor(bw), Math.floor(bh),
          bubbleDustType(t), 0, 0, 100, null, this.scale, true);
      }
    }
    this.x += this.vx;                                       // :1070-1077 尾段位移
    this.y += this.vy;
    if (this.alpha >= 255) this.kill();                      // :1079-1081
  }

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    livePool.delete(this);
  }

  /** Renderer 统一绘制（Main.DrawGore Main.cs 1456:21712-21745 / 1457:22079-22112：中心锚 + scale + rotation） */
  draw(): void { /* 见 Renderer.drawGorePieces */ }

  /** 多帧行数（1 = 整张贴图） */
  get frameRows(): number {
    return FRAME_ROWS[this.goreId] ?? 1;
  }
}

/** 表项 → 具体 gore id（区间/候选均匀取值；微光变体取 idAlt；不可求值跳过） */
function entryId(e: GoreSpawnEntry, s: GoreNpcSource): number | null {
  if (e.id != null) return s.isShimmerVariant && e.idAlt != null ? e.idAlt : e.id;
  if (e.idMin != null && e.idMax != null) return e.idMin + irand(e.idMax - e.idMin + 1);
  if (e.ids?.length) return e.ids[irand(e.ids.length)];
  return null;
}

/** rot 项（Unit 轴 × 系数，按 NPC rotation 旋转；'sd' 符号取 spriteDirection） */
function rotOffset(terms: GoreRotTerm[], s: GoreNpcSource): { x: number; y: number } {
  let x = 0, y = 0;
  const rot = s.rotation ?? 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (const t of terms) {
    const sgn = t.s === 'sd' ? ((s.spriteDirection ?? 1) !== 1 ? 1 : -1) : t.s;
    const k = t.k * (t.dim === 'w' ? s.w : t.dim === 'h' ? s.h : 1);
    // (UnitX|UnitY)*sgn*k 旋转 rot：(x cosθ − y sinθ, x sinθ + y cosθ)
    const bx = t.a === 'x' ? sgn * k : 0;
    const by = t.a === 'y' ? sgn * k : 0;
    x += bx * cos - by * sin;
    y += bx * sin + by * cos;
  }
  return { x, y };
}

/** 表项 → 出生点（基准 = NPC 左上角；未编译回退原点） */
function entryPos(e: GoreSpawnEntry, s: GoreNpcSource): { x: number; y: number } {
  let x = s.x + (e.ox ?? 0) + (e.fx ?? 0) * s.w;
  let y = s.y + (e.oy ?? 0) + (e.fy ?? 0) * s.h;
  if (e.rwx) x += range01(e.rwx) * s.w;
  if (e.rwy) y += range01(e.rwy) * s.h;
  if (e.jx) x += range01(e.jx);
  if (e.jy) y += range01(e.jy);
  if (e.dx != null) x += e.dx * (s.direction ?? s.spriteDirection ?? 1);
  if (e.dy != null) y += e.dy * (s.direction ?? s.spriteDirection ?? 1);
  if (e.dc) { const d = disk(e.dc[0], e.dc[1]); x += d.x; y += d.y; }
  if (e.rot) { const r = rotOffset(e.rot, s); x += r.x; y += r.y; }
  return { x, y };
}

/** 表项 → 初始速度。语义 = NewGore 的 Velocity 实参整体替换（不含 NewGore 自带的
 *  随机扰动）：常量 > 均匀随机 > 椭圆盘/随机方向/rotation 向量 > NPC 速度×k >
 *  击退方向 > 继承 NPC 速度（缺省） */
function axisVel(v: number | undefined, k: number | undefined, m: number | undefined,
  a: number | undefined, hd: boolean, inherit: number, hitDir: number): number {
  if (v != null) return v;
  if (a != null) return uniform(m ?? 0, a);
  if (k != null) return k * inherit;
  if (hd) return hitDir;
  return inherit;
}
function entryVel(e: GoreSpawnEntry, s: GoreNpcSource): { vx: number; vy: number } {
  const hd = s.hitDir ?? 0;
  if (e.dc) { const d = disk(e.dc[0], e.dc[1]); return { vx: d.x, vy: d.y }; }
  if (e.de != null) {
    // 均匀随机方向 × 定速（UnitY.RotatedByRandom(2π)*K / Transform((K,0), rot(rand*2π))）
    const a = Math.random() * Math.PI * 2;
    return { vx: Math.cos(a) * e.de, vy: Math.sin(a) * e.de };
  }
  if (e.rv) {
    const [k, flip] = e.rv;
    let vx = Math.cos(s.rotation ?? 0) * k;
    const vy = Math.sin(s.rotation ?? 0) * k;
    if (flip % 2 === 1 && (s.spriteDirection ?? 1) === 1) vx = -vx;
    return { vx, vy };
  }
  if (e.hdm) return { vx: range01(e.hdm) * hd, vy: axisVel(e.vy, e.ky, e.my, e.ay, false, s.vy, hd) };
  return {
    vx: axisVel(e.vx, e.kx, e.mx, e.ax, !!e.hd, s.vx, hd),
    vy: axisVel(e.vy, e.ky, e.my, e.ay, false, s.vy, hd),
  };
}

/** 表项 ai 门（原版 `ai[N] == V`）：不满足跳过 */
function aiGateOk(e: GoreSpawnEntry, s: GoreNpcSource): boolean {
  if (!e.ai?.length) return true;
  return e.ai.every((g) => {
    const v = g.slot === 0 ? s.ai0 : g.slot === 1 ? s.ai1 : g.slot === 2 ? s.ai2 : s.ai3;
    return g.not ? v !== g.value : v === g.value;
  });
}

const cmp = (a: number, op: string | undefined, b: number): boolean => {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    default: return false;
  }
};

/** RedHatSkeletronAdjustmentsEnabled（NPC.cs 1456:67282 / 1457:67435）：35/33 看 ai[3]、36/32 看 localAI[3] */
function redHatOk(s: GoreNpcSource): boolean {
  const t = s.vanillaId;
  if (t === 35) return s.ai3 === 1;
  if (t === 33) return s.ai3 === 1;
  if (t === 36 || t === 32) return (s.lai3 ?? 0) === 1;
  return false;
}

/** 表项结构化守卫门（1:1 HitEffect 守卫语义）：不满足跳过该条 */
export function goreGatesOk(e: GoreSpawnEntry, s: GoreNpcSource): boolean {
  if (!e.gates?.length) return true;
  for (const g of e.gates) {
    switch (g.k) {
      case 'alt': if (!cmp(s.altTexture ?? 0, g.op, g.v ?? 0)) return false; break;
      case 'sdir': if (!cmp(s.spriteDirection ?? 1, g.op, g.v ?? 0)) return false; break;
      case 'dmg': if (!cmp(s.dmg ?? 9999, g.op, g.v ?? 0)) return false; break;
      case 'shim': if ((!!s.isShimmerVariant) === !!g.not) return false; break;
      case 'net': if (!cmp(goreNetMode, g.op, g.v ?? 0)) return false; break;
      case 'rnd': if (!cmp(irand(g.n ?? 2), g.op, g.v ?? 0)) return false; break;
      case 'redhat': if (redHatOk(s) === !!g.not) return false; break;
      case 'skip': return false;   // 提取器登记的不可求值守卫（保守恒假）
      default: return false;
    }
  }
  return true;
}

/** NewGore 之后的实例后处理（有序应用，提取自 HitEffect 同 type 块内的赋值流） */
function applyPost(g: GorePiece, e: GoreSpawnEntry, s: GoreNpcSource): void {
  if (!e.post?.length) return;
  for (const op of e.post) {
    switch (op[0]) {
      case 'vm': g.vx *= op[1]; g.vy *= op[1]; break;
      case 'va': {
        const lo = Math.min(op[2], op[3]), hi = Math.max(op[2], op[3]);
        const v = lo + Math.random() * (hi - lo);
        if (op[1] === 'x') g.vx += v; else g.vy += v;
        break;
      }
      case 'vs': {
        const f = op[1] as unknown as Record<string, number | number[] | GoreRotTerm[] | undefined>;
        const vel = entryVel(f as GoreSpawnEntry, s);
        g.vx = vel.vx; g.vy = vel.vy;
        break;
      }
      case 'ss': g.scale = op[1]; break;
      case 'sm': {
        const lo = Math.min(op[1], op[2]), hi = Math.max(op[1], op[2]);
        g.scale *= lo + Math.random() * (hi - lo);
        break;
      }
      case 'al': g.alpha = op[1] === 'npc' ? (s.alpha ?? 0) : op[1]; break;
      case 'ro': g.rotation = op[1]; break;
      case 'ps': {
        const p = entryPos(op[1] as unknown as GoreSpawnEntry, s);
        g.x = p.x; g.y = p.y;
        break;
      }
      default: break;
    }
  }
  // scale/alpha 变更后碰撞盒同步（resizeBox 为私有，借类型旁路一次性触发）
  (g as unknown as { resizeBox(): void }).resizeBox();
}

/** 屏幕锚定网格尘幕（NPC.cs 1456:88307-88327 / 1457:88379-88399 两层循环 1:1）：
 *  外层 y 自屏顶世界坐标起、步 yStep、纵向跨度 = 屏宽（原版怪癖）；内层 x 自
 *  npc 位（direction>0 时 +dirShift）起、宽 xSpan、步 xStep。逐格采样 id/速度。 */
function spawnScreenGridGore(e: GoreSpawnEntry, s: GoreNpcSource,
  add: (p: GorePiece) => void, ctx?: GoreSpawnCtx): number {
  const g = e.screenGrid;
  if (!g) return 0;
  const scr = ctx?.screen ?? null;
  if (!scr) return 0;                          // 相机快照未注入（菜单/纯逻辑测试）→ 静默跳过
  if (g.gate === 'playerDeepHell') {           // 1456:88303/1457:88375 玩家深于 maxTilesY-250
    const pt = ctx?.playerTileY, mt = ctx?.maxTilesY;
    if (pt == null || mt == null || !(pt > mt - (g.gateTiles ?? 250))) return 0;
  }
  let x0 = Math.trunc(s.x);                    // 1456:88309/1457:88381 (int)position.X
  if ((s.direction ?? s.spriteDirection ?? 1) > 0 && g.dirShift) x0 += g.dirShift;  // 1456:88310-88313/1457:88382-88385
  const y0 = Math.trunc(scr.y);                // 1456:88307/1457:88379 (int)Main.screenPosition.Y
  const ySpan = g.ySpan === 'screenWidth' ? scr.w : scr.h;
  const scale = e.scale ?? (e.scaleExpr === 'scale' ? s.vanillaScale : 1);
  let n = 0;
  for (let y = y0; y < y0 + ySpan; y += g.yStep) {
    for (let x = x0; x < x0 + g.xSpan; x += g.xStep) {
      const type = entryId(e, s);
      if (type == null || type < 0) continue;
      const vel = entryVel(e, s);
      const piece = GorePiece.newGore(type, x, y, vel.vx, vel.vy, scale, !!e.perfect);
      if (piece) { applyPost(piece, e, s); add(piece); n++; }
    }
  }
  return n;
}

/** 按表炸出某 NPC 的全部死亡 gore；add = 实体入桶回调。ctx = 屏幕坐标档求值输入
 *  （spawnNpcDeathGore 自动组装；直调本函数的测试无 screenGrid 档时可省略） */
export function spawnDeathGore(s: GoreNpcSource, add: (p: GorePiece) => void,
  ctx?: GoreSpawnCtx): number {
  if (s.vanillaId == null) return 0;
  const list = deathGoreFor(s.vanillaId);
  let n = 0;
  for (const e of list) {
    if (!aiGateOk(e, s)) continue;
    if (!goreGatesOk(e, s)) continue;
    if (e.screenGrid) { n += spawnScreenGridGore(e, s, add, ctx); continue; }
    const times = e.loop ?? 1;
    for (let k = 0; k < times; k++) {
      const type = entryId(e, s);
      if (type == null || type < 0) continue; // expr/posExpr 留档条目（提取器不可静态求值）
      const pos = entryPos(e, s);
      const vel = entryVel(e, s);
      const scale = e.scale ?? (e.scaleExpr === 'scale' ? s.vanillaScale : 1);
      const g = GorePiece.newGore(type, pos.x, pos.y, vel.vx, vel.vy, scale, !!e.perfect);
      if (g) { applyPost(g, e, s); add(g); n++; }
    }
  }
  return n;
}

/** Enemy/Critter 死亡钩子：查表炸 gore（props 桶；表空 = 原版只出尘，返回 0）。
 *  hitDir = HitEffect 的 hitDirection（击退方向，`new Vector2(hitDirection, 0f)` 类表项用）；
 *  spriteDirection 等变体字段由来源 NPC 提供（缺省：spriteDirection=1 / altTexture=0 /
 *  isShimmerVariant=false / rotation=0 / dmg=9999——原版脚本化死亡调用约定） */
export function spawnNpcDeathGore(
  npc: GoreNpcSource, game: GameHooks, hitDir?: number, spriteDirection?: number,
): number {
  const add = (game as unknown as {
    entities?: { add?: (p: unknown, bucket: string) => void };
  }).entities;
  if (!add?.add) return 0;
  const src: GoreNpcSource = {
    ...npc,
    hitDir: hitDir ?? npc.hitDir,
    spriteDirection: spriteDirection ?? npc.spriteDirection ?? 1,
    direction: npc.direction ?? spriteDirection ?? npc.spriteDirection ?? 1,
    dmg: npc.dmg ?? 9999,
  };
  // 屏幕坐标档（screenGrid）求值输入：相机快照 + 深度门读数
  const ctx: GoreSpawnCtx = {
    screen: goreScreenValue(),
    playerTileY: game.player ? game.player.y / 16 : undefined,
    maxTilesY: game.world?.store?.h,
  };
  return spawnDeathGore(src, (p) => add.add!(p, 'props'), ctx);
}
