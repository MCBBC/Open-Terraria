// Gore 死亡碎块（Terraria/Gore.cs 1:1）+ NPC.HitEffect 死亡 gore 全表驱动。
//   数据：src/data/vanilla-gore.json（tools/extract-gore.mjs 从 NPC.cs HitEffect
//         :82421-:90873 提取；表结构/字段语义见其 _meta.notes）
//   物理：Gore.Update（Gore.cs:313-1102）——本表能产出的家族全实现：
//     · 默认粘滞碎块：重力 0.2 + rotation += vx*0.05（:762-763）→ 碰撞盒
//       min(w,h)*0.9*scale（:1000-1014）→ 落地 vx*=0.97（:1015-1029）→
//       timeLeft -= DisappearSpeed / alpha += DisappearSpeedAlpha（:1030-1037）
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
//   落叶(SpecialAI 3)/滴水族不出自 HitEffect，由 render/NatureParticles 独占。
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
/** 多帧行数（NewGore :1391-1398：1201/1208→4、1217/1218→3；表内仅 1218 实际出现） */
const FRAME_ROWS: Record<number, number> = { 1201: 4, 1208: 4, 1217: 3, 1218: 3, 1225: 3 };
/** GoreID.Sets.DisappearSpeed（GoreID.cs:11，默认 1） */
const DISAPPEAR_SPEED: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7 };
/** GoreID.Sets.DisappearSpeedAlpha（GoreID.cs:13，默认 1） */
const DISAPPEAR_ALPHA: Record<number, number> = { 1007: 3, 1008: 10, 1024: 7, 1025: 7, 1026: 7, 1218: 3 };
const vanishSpeed = (t: number) => DISAPPEAR_SPEED[t] ?? 1;
const vanishAlpha = (t: number) => DISAPPEAR_ALPHA[t] ?? 1;

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
  /** NPC.IsShimmerVariant（NPC.cs:6643：城镇 NPC 微光变体态，缺省 false） */
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
/** Utils.NextVector2Circular（Utils.cs:1269）：单位向量 × (rx,ry) × u */
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
    this.texW = tex?.w ?? FALLBACK_TEX;
    this.texH = tex?.h ?? FALLBACK_TEX;
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
    // :1423-1425 SpecialAI==1（帆降）：初速整体覆写为 ((rand-0.5)*3, rand*2π)——
    // vy 兼作相位累加器，Gore_UpdateSail 据此走圆弧下落
    if (SAIL_TYPES.has(t)) {
      g.vx = (Math.random() - 0.5) * 3;
      g.vy = Math.random() * Math.PI * 2;
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

    if (SAIL_TYPES.has(t)) { this.updateSail(game); return; }

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

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    livePool.delete(this);
  }

  /** Renderer 统一绘制（Main.DrawGore Main.cs:21712-21742：中心锚 + scale + rotation） */
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

/** RedHatSkeletronAdjustmentsEnabled（NPC.cs:67282）：35/33 看 ai[3]、36/32 看 localAI[3] */
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
  for (const op of e.post ?? []) {
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

/** 按表炸出某 NPC 的全部死亡 gore；add = 实体入桶回调。返回生成数 */
export function spawnDeathGore(s: GoreNpcSource, add: (p: GorePiece) => void): number {
  if (s.vanillaId == null) return 0;
  const list = deathGoreFor(s.vanillaId);
  let n = 0;
  for (const e of list) {
    if (!aiGateOk(e, s)) continue;
    if (!goreGatesOk(e, s)) continue;
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
  return spawnDeathGore(src, (p) => add.add!(p, 'props'));
}
