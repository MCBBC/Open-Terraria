// 原版 TileFrameCosmetic(1.4.5.7 WorldGen.cs:82667-86094)1:1 求值器。
// 帧选链由 tools/extract-tileframe-cosmetic.mjs 从反编译源机械转译为
// src/data/generated/tileframe-program.json(305 if/997 赋值/121 调用/132 变体switch,
// 区域 82684-86071),本文件提供运行环境:类型集合、邻居分类、TileMergeAttempt 系列语义、
// mergeUp/Down 静态旗与 TileFrame 递归协商(原版 :4139-4145 静态字段)、最终帧写入。
//
// 机制对齐(2026-08-27 反编译考证):原版 .wld 只对 tileFrameImportant 类型落盘帧,
// 其余类型读档置 -1,由 200×150 分区懒分帧(SectionTileFrameWithCheck→Reframe→
// TileFrame(resetFrame:true))现场重算——即本文件对 SW 烘焙的等价物。TEdit BlendRules/
// SelfFrame8Way 是其近似,本移植取代两者成为 vanilla-exact 路径。
import type { TileStore } from '../world/TileStore';
import programJson from '../data/generated/tileframe-program.json';
import { makeFrame } from '../data/generated/tileframe-codegen.js';
import type { FrameDRV, FrameTileH } from '../data/generated/tileframe-codegen.js';
import { TILE_DEFS } from '../data/tiles';
import { vanillaIdOf } from './TileMergeFamily';

// ★ID 域契约(2026-08-28 重定):本链全部集合/比较在 vanilla tile id 域。
// TileStore.type 为 SW 内部 id → tileFrame/mkTile 入口统一 vanillaIdOf 换算。
// (此前直喂内部 id = 沙22 读恶魔矿22、粘土54 读玻璃54 归属 → 同型碰巧自洽、
//  跨型接续全灭。golden layer3/4 的 store 亦须内部 id 域,与运行时一致。)
// ★ID 域备忘(2026-08-27):本链比较/集合均在 vanilla tile id 域;运行时 TileStore
// 的 type 域与 vanilla 域的关系未定(部分块数值巧合重合),全链默认停用
// (VanillaTiler SW_VANILLA_FRAMING),重做对齐时先钉死域再启用。

// ===================== 原版类型集合(M:6948-10457 / TID:185-401 逐行提取,1458 同) =====================
const range = (a: number, b: number): number[] => {
  const r: number[] = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
};
const S256 = (arr: number[]): boolean[] => {
  const b = new Array(800).fill(false);
  for (const v of arr) b[v] = true;
  return b;
};
const MERGE_DIRT = S256([
  1, 6, 7, 8, 9, 22, 25, 30, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 53, 56, 107, 108, 111, 112,
  116, 117, 118, 119, 120, 121, 122, 123, 140, 145, 146, 148, 150, 151, 152, 153, 154, 155, 156,
  157, 158, 159, 160, 166, 167, 168, 169, 175, 176, 177, 188, 190, 193, 195, 197, 198, 202, 203,
  204, 206, 208, 221, 222, 223, 229, 230, 234, 249, 250, 251, 252, 253, 311, 315, 321, 322, 346,
  347, 348, 350, 367, 368, 369, 370, 371, 408, 472, 473, 474, 478, 479, 481, 482, 483, 495, 496,
  498, 500, 501, 502, 503, 562, 563, 635, 641, 666, 667, 677, 678, 679, 680, 681, 682, 683, 684,
  685, 686, 722, 734, 740, 744, 750,
]);
const CHECKS_FOR_MERGE = S256([
  0, 668, 2, 661, 60, 70, 199, 662, 109, 477, 492, 633, 747, 57, 58, 75, 76, 684, 147, 161, 164,
  163, 200, 162, 189, 196, 460, 717, 718, 719, 170, 738, 224, 191, 383, 211, 225, 59, 226, 396,
  397, 398, 399, 402, 400, 401, 403, 404, 234, 112, 407,
]);
const TILE_BRICK = S256([
  1, 2, 23, 25, 30, 37, 38, 39, 41, 43, 44, 45, 46, 47, 53, 54, 57, 59, 60, 70, 75, 76, 109, 112,
  116, 117, 118, 119, 120, 121, 122, 140, 147, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158,
  159, 160, 161, 162, 163, 164, 175, 176, 177, 179, 180, 181, 182, 183, 188, 190, 191, 193, 194,
  195, 198, 199, 200, 202, 203, 206, 208, 225, 226, 229, 234, 248, 249, 250, 252, 253,
  255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 273, 274, 311, 315, 321,
  322, 326, 327, 328, 329, 345, 346, 347, 348, 350, 357, 369, 370, 381, 383, 385, 408, 409, 415,
  416, 417, 418, 458, 459, 472, 473, 474, 477, 478, 479, 481, 482, 483, 492, 495, 496, 498, 500,
  501, 502, 503, 507, 508, 512, 513, 514, 515, 516, 517, 534, 535, 536, 537, 539, 540, 562, 563,
  625, 626, 627, 628, 633, 635, 641, 659, 661, 662, 666, 667, 669, 670, 671, 672, 673, 674, 675,
  676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 708, 722,
  734, 735, 736, 737, 738, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750,
]);
const TILE_STONE = S256([130, 131, 63, 64, 65, 66, 67, 68, 566]);
const TILE_MOSS = S256([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
const TILE_PILE = S256([330, 331, 332, 333]);
const TILE_BLEND_ALL = S256([357]);
const SETS_DIRT = S256([0, 668]);
const SETS_MUD = S256([59]);
const SETS_ASH = S256([57]);
const SETS_SNOW = S256([147]);
const SETS_ICES = S256([161, 200, 163, 164]);
const SETS_ICES_SNOW = S256([161, 200, 163, 164, 147]);
const DONT_MERGE_WITH_SNOW = S256([161, 200, 163, 164, 224, 170, 738]);
const ORE_MERGES_WITH_MUD = S256([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223]);
const FORCED_DIRT_MERGING = S256([
  75, 76, 508, 507, 226, 409, 669, 670, 671, 672, 673, 674, 675, 676, 683, 684, 273, 274, 459, 458,
  326, 327, 345, 328, 329, 192, 384, 284, 325, 272, 268, 262, 267, 265, 266, 264, 263, 261, 255,
  260, 258, 259, 257, 256, 54, 357, 708, 385, 735, 736, 737, 738, 741, 742, 743, 745, 746, 747,
  748, 749,
]);
const TILE_MOSS_BRICK = S256([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
const MERGES_WITH_DIRT_SPECIAL = S256([2, 23, 109, 199, 477, 492]);
const CONVERSION_MOSS = S256([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
const CONVERSION_MOSS_BRICK = S256([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
const CONVERSION_GRASS = S256([2, 23, 199, 109, 477, 492]);
const MERGES_WITH_CLOUDS = S256([196, 460, 717, 718, 719]);
const ALL_TILES = S256(range(0, 599));
const GRASS_SPECIAL = S256([70, 60, 661, 662]);
const JUNGLE_SPECIAL = S256([226, 225, 211]);
const HELL_SPECIAL = S256([58, 76, 75]);
const SETS_ORE = S256([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
const SETS_PLATFORMS = S256([19, 427, 435, 436, 437, 438, 439]);
const HAS_SLOPE_FRAMES = S256([421, 422]);
// tileMerge 矩阵(SetupTileMerge M:3714-3719 六对)
const MERGE_PAIRS: Array<[number, number]> = [[426, 727], [430, 728], [431, 729], [432, 730], [433, 731], [434, 732]];
const tileMerge = new Array(800).fill(null).map(() => new Array(800).fill(false));
for (const [a, b] of MERGE_PAIRS) { tileMerge[a][b] = true; tileMerge[b][a] = true; }
// BlockMergesWithMergeAllBlock(SetupTileMerge M:3709-3712):solid 且非 solidTop 且非 10/387/541
// ——由调用方注入 tileSolid/tileSolidTop 表(vanilla 语义,见 S.blockMergesAll)
let TILE_SOLID: boolean[] = S256([]);
let TILE_SOLID_TOP: boolean[] = S256([]);
export function setVanillaSolidTables(solid: boolean[], solidTop: boolean[]): void {
  TILE_SOLID = solid;
  TILE_SOLID_TOP = solidTop;
}

// 运行时表推导(TILE_DEFS 域):产出与金标注入的 Main.cs 真值等价的 solid/solidTop。
// ★last-write-wins 陷阱(2026-08-28 用户实报「草↔泥边界暗线」根因):同 sheet 多 def 时
// 按定义序直写会把主块覆盖——pixel_block(vanilla.sheet=0, solid=false) 定义在 dirt
// (sheet 0, solid=true)之后 ⇒ solid[0]=false ⇒ 链内 TileMergeAttemptWeird(num,-1,tileSolid)
// (WorldGen.cs:83467)把泥土邻居当非固体改写成 -1,「草上泥下」被判成悬空,
// 草族 num11 分支(:83495-83650)全链翻转 → 边界出现错帧(绿带/暗边)。
// 规则(与 Main.cs 真值逐 sheet 对账 ≤599;块族全等,家具/装饰族残差与旧实现同域备案):
//   solid[sheet] = 旧 last-write 值 OR 任一【分帧主 def】(frame 'blend'|'auto')的 solid。
//   即旧行为的超集修正:只把「后定义非块 def 覆盖分帧主 def」一类错(sheet 0 泥土被
//   pixel_block 覆盖成非固体 = 本次用户实报根因)拨回 true,绝不新增 true→false 翻转。
//   v_* 装饰/家具 sheet 的 solid 语义噪声(vines/banner/gemspark 偏 true)系旧表既有,
//   不在本修域(只影响邻格 -1/类型保留的个别角帧选择,非本次症状)。
//   solidTop[sheet] = 任意 def platform(OR 语义,与旧实现一致)。
export function deriveVanillaSolidTablesFromDefs(): { solid: boolean[]; solidTop: boolean[] } {
  const solid = new Array(600).fill(false);
  const solidTop = new Array(600).fill(false);
  const lastWrite = new Array(600).fill(false);
  const primaryTrue = new Array(600).fill(false);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i];
    const v = d?.vanilla;
    if (!v || v.sheet >= 600) continue;
    const frame = (v as { frame?: string }).frame;
    lastWrite[v.sheet] = !!d.solid;
    if ((frame === 'blend' || frame === 'auto') && d.solid) primaryTrue[v.sheet] = true;
    if (d.platform) solidTop[v.sheet] = true;
  }
  for (let s = 0; s < 600; s++) solid[s] = lastWrite[s] || primaryTrue[s];
  return { solid, solidTop };
}

// 测试金标消费:原始集合表(vanilla-framing-golden 对账用)
export const VANILLA_FRAME_SETS = {
  MERGE_DIRT, CHECKS_FOR_MERGE, TILE_BRICK, TILE_STONE, TILE_MOSS, TILE_PILE, TILE_BLEND_ALL,
  SETS_DIRT, SETS_MUD, SETS_ASH, SETS_SNOW, SETS_ICES_SNOW, DONT_MERGE_WITH_SNOW,
  ORE_MERGES_WITH_MUD, FORCED_DIRT_MERGING, TILE_MOSS_BRICK, MERGES_WITH_DIRT_SPECIAL,
  CONVERSION_MOSS, CONVERSION_MOSS_BRICK, CONVERSION_GRASS, MERGES_WITH_CLOUDS,
  GRASS_SPECIAL, JUNGLE_SPECIAL, HELL_SPECIAL, SETS_ORE, SETS_PLATFORMS, HAS_SLOPE_FRAMES,
};

// ===================== 程序与求值环境 =====================
type Stmt = {
  kind: 'if' | 'switch' | 'assign' | 'call' | 'break' | 'return';
  cond?: string;
  disc?: string;
  cases?: Record<string, Stmt[]>;
  then?: Stmt[];
  else?: Stmt[] | null;
  target?: string;
  expr?: string;
  fn?: string;
  args?: string[];
  line?: number;
};
const PROGRAM = (programJson as { program: Stmt[] }).program;

// 静态 merge 旗(WorldGen.cs:4139-4145;递归协商读取邻居刚写入的状态)
const mergeFlags = { up: false, down: false, left: false, right: false };

export interface FrameEnv {
  st: TileStore;
  i: number;
  j: number;
  variant: number;
  rockLayer: number;
  centerVan: number;         // 中心 vanilla id(MERGE_DIRT 跨族结合)
  frameCache: Map<number, FrameEntry>; // TileFrame 递归的帧缓存(含协商旗快照 + 变体域戳,按格)
  depth: number;
  bypassGlobalCache?: boolean; // 对拍强制新求值通道(顶链绕过全局快照缓存)
  noGlobalWrite?: boolean;     // 统一视图求帧专用:递归结果不写全局缓存(视图态不得驻留)
  trace?: TraceSink;           // 测试专用执行轨迹
}

// 转译器产出两种集合引用形:`SETREF.name`(dotted)与 `SETREF["name"]`(bracketed,
// 带引号键);__row_ 二维矩阵行由 execCall 合成(恒 dotted)。统一在此归一。
function parseSetRefKey(raw: string): string | null {
  if (raw.startsWith('SETREF.')) return raw.slice(7);
  const m = raw.match(/^SETREF\[\s*"([^"\]]+)"\s*\]$/);
  return m ? m[1] : null;
}

// TileMergeAttempt 家族(WorldGen.cs:82272-82490)精确实现:
const resolveSetFn = (raw: string): ((t: number) => boolean) | null => {
  const k2 = parseSetRefKey(raw) ?? raw;
  if (k2 === 'rockLayer') return (t: number) => t >= 0 && t < ROCKLAYER_G;
  return ((SET_REF_FN as unknown as Record<string, ((t: number) => boolean) | undefined>)[k2] ?? null);
};
let ROCKLAYER_G = 0;
function lookupSetFn(raw: string): ((t: number) => boolean) | null {
  const k2 = parseSetRefKey(raw);
  if (k2 == null) return null;
  // 二维矩阵行(S.tileMerge(var) → __row_N):与 execCall 预重写/tileMergeAttemptFrametest 同款
  // 合成(原版 SetupTileMerge M.cs:3703-3720 六对活查表;曾漏合成 ⇒ 行谓词恒惰)
  if (k2.startsWith('__row_')) { const n2 = +k2.slice(6); return (d: number) => tileMerge[n2]?.[d] ?? false; }
  return (SET_REF_FN[k2 as keyof typeof SET_REF_FN] ?? null) as ((t: number) => boolean) | null;
}

function tileMergeAttemptExact(env: FrameEnv, scope: Scope, args: string[]): void {
  ROCKLAYER_G = env.rockLayer;
  const myType = sv(scope, args[0]);
  const lookforRaw = args[1];
  let excludeRaw: string | null = null;
  let dirNames: string[];
  if (args.length === 11) { excludeRaw = args[2]; dirNames = args.slice(3); }
  else if (args.length === 10) { dirNames = args.slice(2); }
  else { dirNames = args.slice(2); }
  const lookforSet = lookupSetFn(lookforRaw);
  const lookforIsSet = lookforSet != null || parseSetRefKey(lookforRaw) != null;
  const lookforNum = lookforIsSet ? null : sv(scope, lookforRaw);
  const excludeSet = excludeRaw != null ? lookupSetFn(excludeRaw) : null;
  const excludeIsSet = excludeRaw != null && (excludeSet != null || parseSetRefKey(excludeRaw) != null);
  const excludeNum = excludeRaw && !excludeIsSet ? sv(scope, excludeRaw) : null;
  for (const dn of dirNames) {
    const cur = scope[dn] as number;
    const lf3 = lookforSet ?? resolveSetFn(lookforRaw);
    if (lf3) {
      if (!(cur > -1 && lf3(cur))) continue;
    } else if (cur !== lookforNum) continue;
    const exF1 = (excludeSet ?? resolveSetFn(excludeRaw ?? '')) as ((t: number) => boolean) | null;
    if (exF1 && cur > -1 && exF1(cur)) continue;
    if (excludeNum !== null && cur === excludeNum) continue;
    scope[dn] = myType;
  }
}

function tileMergeAttemptWeird(env: FrameEnv, scope: Scope, args: string[]): void {
  ROCKLAYER_G = env.rockLayer;
  const myType = sv(scope, args[0]);
  const changeTo = sv(scope, args[1]);
  const excludeRaw = args[2];
  const excludeSet = lookupSetFn(excludeRaw);
  const excludeIsSet = excludeSet != null || parseSetRefKey(excludeRaw) != null;
  const excludeNum = excludeRaw && !excludeIsSet ? sv(scope, excludeRaw) : null;
  for (const dn of args.slice(3)) {
    const cur = scope[dn] as number;
    const exF2 = (excludeSet ?? resolveSetFn(excludeRaw ?? '')) as ((t: number) => boolean) | null;
    if (cur > -1 && cur !== myType && (exF2 ? !exF2(cur) : true) && (excludeNum === null || cur !== excludeNum)) {
      scope[dn] = changeTo;
    }
  }
}

function tileMergeAttemptFrametest(env: FrameEnv, scope: Scope, args: string[]): void {
  ROCKLAYER_G = env.rockLayer;
  // (i, j, myType, lookfor, up, down, left, right, upLeft, upRight, downLeft, downRight)
  // ★单遍处理(vanilla WorldGen.cs:82462 一致;曾双遍 = 正交向二次无条件盖章 bug,
  //   与代码生成通道在 moss/glass 邻接配置分歧 —— 2026-08-28 定罪修复)
  const myType = sv(scope, args[2]);
  const lookforRaw = args[3];
  let lookforSet: ((t: number) => boolean) | null = null;
  const k2 = parseSetRefKey(lookforRaw);
  if (k2 != null) {
    if (k2.startsWith('__row_')) { const n2 = +k2.slice(6); lookforSet = (d: number) => tileMerge[n2]?.[d] ?? false; }
    else lookforSet = (SET_REF_FN[k2 as keyof typeof SET_REF_FN] ?? null) as ((t: number) => boolean) | null;
  }
  const lookforNum = k2 != null ? null : sv(scope, lookforRaw);
  const OPP: Record<string, 'up' | 'down' | 'left' | 'right'> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DXDY: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (const dn of args.slice(4)) {
    const cur = scope[dn] as number;
    const hit = lookforSet ? (cur > -1 && lookforSet(cur)) : cur === lookforNum;
    if (!hit) continue;
    const opp = OPP[dn];
    if (opp) {
      const [dx, dy] = DXDY[dn];
      tileFrame(env, env.i + dx, env.j + dy, env.depth + 1);
      if (mergeFlags[opp]) scope[dn] = myType;
    } else {
      scope[dn] = myType;
    }
  }
}

// 裸集合引用 → 查表函数
const SET_REF_FN = {
  Dirt: (t: number) => SETS_DIRT[t] ?? false,
  Mud: (t: number) => SETS_MUD[t] ?? false,
  Ash: (t: number) => SETS_ASH[t] ?? false,
  Snow: (t: number) => SETS_SNOW[t] ?? false,
  IcesSnow: (t: number) => SETS_ICES_SNOW[t] ?? false,
  // 原版 TileID.cs:295 IcesSlush = CreateBoolSet(161,200,163,164,224)(曾表外死引用)
  IcesSlush: (t: number) => t === 161 || t === 200 || t === 163 || t === 164 || t === 224,
  DontMergeWithSnow: (t: number) => DONT_MERGE_WITH_SNOW[t] ?? false,
  OreMergesWithMud: (t: number) => ORE_MERGES_WITH_MUD[t] ?? false,
  BlockMergesWithMergeAllBlock: (t: number) => BLOCK_MERGES_ALL(t),
  ForcedDirtMerging: (t: number) => FORCED_DIRT_MERGING[t] ?? false,
  Moss: (t: number) => CONVERSION_MOSS[t] ?? false,
  MossBrick: (t: number) => CONVERSION_MOSS_BRICK[t] ?? false,
  'Conversion.Moss': (t: number) => CONVERSION_MOSS[t] ?? false,
  'Conversion.MossBrick': (t: number) => CONVERSION_MOSS_BRICK[t] ?? false,
  'Conversion.Grass': (t: number) => CONVERSION_GRASS[t] ?? false,
  NeedsGrassFraming: (t: number) => t === 633,
  // 原版为 int 集(Factory.CreateIntSet(0, 633, 57))——查集返回"泥土码",默认 0,非布尔
  NeedsGrassFramingDirt: (t: number) => (t === 633 ? 57 : 0),
  tileMossBrick: (t: number) => TILE_MOSS_BRICK[t] ?? false,
  Grass: (t: number) => CONVERSION_GRASS[t] ?? false,
  MergesWithClouds: (t: number) => MERGES_WITH_CLOUDS[t] ?? false,
  AllTiles: () => true,
  GrassSpecial: (t: number) => GRASS_SPECIAL[t] ?? false,
  JungleSpecial: (t: number) => JUNGLE_SPECIAL[t] ?? false,
  HellSpecial: (t: number) => HELL_SPECIAL[t] ?? false,
  Ore: (t: number) => SETS_ORE[t] ?? false,
  Platforms: (t: number) => SETS_PLATFORMS[t] ?? false,
  HasSlopeFrames: (t: number) => HAS_SLOPE_FRAMES[t] ?? false,
  tileBrick: (t: number) => TILE_BRICK[t] ?? false,
  tileStone: (t: number) => TILE_STONE[t] ?? false,
  tileMoss: (t: number) => TILE_MOSS[t] ?? false,
  tilePile: (t: number) => TILE_PILE[t] ?? false,
  tileBlendAll: (t: number) => TILE_BLEND_ALL[t] ?? false,
  tileMergeDirt: (t: number) => MERGE_DIRT[t] ?? false,
  ChecksForMerge: (t: number) => CHECKS_FOR_MERGE[t] ?? false,
  MergesWithDirtInASpecialWay: (t: number) => MERGES_WITH_DIRT_SPECIAL[t] ?? false,
  tileMerge: (a: number, b: number) => tileMerge[a]?.[b] ?? false,
  tileSolid: (t: number) => TILE_SOLID[t] ?? false,
  tileSolidTop: (t: number) => TILE_SOLID_TOP[t] ?? false,
  tileLargeFrames: () => 0, // 大帧特殊块(2D 变体表)不在本移植域,常 0 = 不走该分支
  tileRope: (t: number) => t === 42 || t === 213 || t === 214 || t === 223 || t === 314 || t === 345 || t === 353 || t === 365 || t === 366,
  tileNoAttach: (t: number) => t === 407 || false,
  tile: (a: number, b: number) => false,
};
function BLOCK_MERGES_ALL(t: number): boolean {
  return (TILE_SOLID[t] ?? false) && !(TILE_SOLID_TOP[t] ?? false) && t !== 10 && t !== 387 && t !== 541;
}

// 求值器作用域:邻居码/局部量/旗(动态环境,宽松类型)
type Scope = Record<string, any>;
const sv = (scope: Scope, expr: string): number => (scope.__val ? scope.__val(expr) : evalExpr(expr, scope) as number);

// 表达式求值:转译器产出的表达式在 scope 语境下 new Function 一次编译缓存
const exprCache = new Map<string, (scope: Scope) => number | boolean>();
// 链内声明的局部量(int/bool numX/flagX 等)——解构表 = 固定名 + 这些名字
const LOCALS: string[] = [];
{
  const seen = new Set(['rectX', 'rectY', 'rectInit', 'up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight',
    'num', 'num11', 'num6', 'mergeUp', 'mergeDown', 'mergeLeft', 'mergeRight', 'FLAG', 'VNUM', 'resetFrame', 'i', 'j',
    'frameX', 'frameY', 'R']);
  const walk = (stmts: Stmt[]) => {
    for (const st of stmts) {
      if (st.target && !seen.has(st.target)) {
        seen.add(st.target); LOCALS.push(st.target);
      }
      if (st.then) walk(st.then);
      if (st.else) walk(st.else);
      if (st.cases) for (const c of Object.values(st.cases)) walk(c);
    }
  };
  walk(PROGRAM);
}
const DESTRUCTURE = 'up,down,left,right,upLeft,upRight,downLeft,downRight,num,num11,num6,i,j,NUM,FLAG,frameX,frameY,resetFrame,mergeUp,mergeDown,mergeLeft,mergeRight,R,HALF,SLOPE,VNUM,BLOCKTYPE,OLDFX,OLDFY,ROCKLAYER,TILECOUNT,TU,TD,TL,TR,TDL,TDR,TUL,TUR,S,SETREF,LOC,PRED,VR,' + LOCALS.join(',');
function evalExpr(expr: string, scope: Scope): number | boolean {
  let fn = exprCache.get(expr);
  if (!fn) {
    fn = new Function('scope', `"use strict"; return (function(){ const {${DESTRUCTURE}} = scope; return (${expr}); })();`) as (scope: Scope) => number | boolean;
    exprCache.set(expr, fn);
  }
  return fn(scope);
}

// 程序执行
// 执行轨迹(测试专用):env.trace 存在时逐语句记录(kind/命中分支/target=值),
// 运行时路径不受影响(undefined 检查一次)。
type TraceSink = { push(line: string): void };
interface FrameEnvX extends FrameEnv { trace?: TraceSink }

function evalProgram(stmts: Stmt[], env: FrameEnv, scope: Scope): void {
  const tr = (env as FrameEnvX).trace;
  for (const st of stmts) {
    switch (st.kind) {
      case 'if': {
        const c = evalExpr(st.cond!, scope) as boolean;
        tr?.push(`L${st.line} if(${st.cond})=${c ? 'T' : 'F'}`);
        if (c) { evalProgram(st.then!, env, scope); }
        else if (st.else) { evalProgram(st.else, env, scope); }
        break;
      }
      case 'switch': {
        const disc = evalExpr(st.disc!, scope);
        const body = st.cases![String(disc)] ?? st.cases!.default;
        tr?.push(`L${st.line} switch(${st.disc})=${disc}->${body ? 'case' : 'none'}`);
        if (body) evalProgram(body, env, scope);
        break;
      }
      case 'assign': {
        const v = evalExpr(st.expr!, scope);
        tr?.push(`L${st.line} ${st.target}=${String(v)} [${st.expr}]`);
        // 静态协商旗双写:程序赋值 mergeUp/… 须同步到 tileMergeAttemptFrametest 读的全局旗
        // (原版为 WorldGen 静态变量 :4139-4145,每次 Cosmetic 头清零、矩阵段置位)
        if (st.target === 'mergeUp') { mergeFlags.up = v as boolean; }
        else if (st.target === 'mergeDown') { mergeFlags.down = v as boolean; }
        else if (st.target === 'mergeLeft') { mergeFlags.left = v as boolean; }
        else if (st.target === 'mergeRight') { mergeFlags.right = v as boolean; }
        if (st.target === 'rectX') scope.R.x = v as number;
        else if (st.target === 'rectY') scope.R.y = v as number;
        else scope[st.target!] = v;
        break;
      }
      case 'call': {
        execCall(st, env, scope);
        break;
      }
      case 'break':
      case 'return':
        break; // 顺序结构,break 语义由 switch 展平等价覆盖(原版每个 case 均以 break 终结)
    }
  }
}

// Cull 单向判定(GetTileMergeCulling :86117 的 coat 比较核;解释器与代码生成 DRV 共用)
function cullDirVisible(st: TileStore, ci: number, cj: number, dx: number, dy: number): boolean {
  const x = ci + dx, y = cj + dy;
  if (!st.inBounds(x, y)) return false;
  const ii = st.idx(x, y);
  const invSelf = (st.coat[st.idx(ci, cj)] & 2) !== 0; // COAT_INVISIBLE_BLOCK
  const invNb = (st.coat[ii] & 2) !== 0;
  return invNb !== invSelf;
}

// ===================== 代码生成通道(tileframe-codegen.js)=====================
// gen-tileframe-codegen.mjs 把 tileframe-program.json 直译为单函数;语义与下方解释器
// 逐位等价(golden 四层 + worldwide parity 对拍)。**链启用时它是默认引擎**(trace 实测
// 解释器中位 0.87ms/格 vs 生成函数 ~3µs/格);显式关断见 _CODEGEN_DEFAULT。解释器保留
// 作对拍参照与调试回退(localStorage sw_vanilla_framing_codegen=0)。
const GEN_FRAME = makeFrame();
let _codegenOverride: boolean | null = null;
// ★默认引擎 = 代码生成(2026-08-28 trace 定谳):此前本旗只认 localStorage,而链启用走
// URL ?vf=1(VanillaTiler 读 URL、本处不读)→ 门控错位,?vf=1 时整条链落到解释器
// (0.87ms/格中位,bake 长任务 220ms;trace /tmp/trace-vf/)。现与 VanillaTiler 三态门
// 同源复制,gen==interp==rig 已三方逐位等价(golden+worldwide parity),故链开即 gen。
// 调试回退解释器:localStorage sw_vanilla_framing_codegen=0。
const _CODEGEN_DEFAULT = (() => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('sw_vanilla_framing_codegen') === '0') return false;
  } catch { /* SSR */ }
  return true;
})();
export function setFramingCodegenEnabled(on: boolean | null): void { _codegenOverride = on; }
export function isFramingCodegenEnabled(): boolean {
  return _codegenOverride ?? _CODEGEN_DEFAULT;
}
const LOC_OBJ = { mergesWithDirtInASpecialWay: (t: number) => MERGES_WITH_DIRT_SPECIAL[t] ?? false };

function execCall(st: Stmt, env: FrameEnv, scope: Scope): void {
  const args = st.args!;
  const tr = (env as FrameEnvX).trace;
  const dirNamesAll = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'];
  const dirsBefore = tr ? dirNamesAll.map((d) => `${d}=${scope[d]}`).join(',') : '';
  switch (st.fn) {
    case 'TileMergeAttempt':
    case 'TileMergeAttemptWeird':
    case 'TileMergeAttemptFrametest': {
      // 求值非常量实参(如 num11 / Main.tileMerge[num] 的二维矩阵引用)
      const resolved = args.map((a) => {
        if (/^-?\d+$/.test(a)) return a;
        const mm = a.match(/^S\.tileMerge\((\w+)\)$/);
        if (mm) return `SETREF.__row_${scope[mm[1]]}`;
        return a;
      });
      const argList = resolved;
      const fullScope = scope as Scope;
      if (st.fn === 'TileMergeAttempt') tileMergeAttemptExact(env, fullScope, argList);
      else if (st.fn === 'TileMergeAttemptWeird') tileMergeAttemptWeird(env, fullScope, argList);
      else tileMergeAttemptFrametest(env, fullScope, argList);
      break;
    }
    case 'TileFrame': {
      // 递归:TileFrame(i, j±1) —— 完整包装(守卫/FI/写回/邻递归)
      const di = evalExpr(args[0].replace(/^i$/, 'i'), scope) as number;
      const dj = evalExpr(args[1].replace(/^j$/, 'j'), scope) as number;
      tileFrame(env, env.i + (di - (scope.i as number)), env.j + (dj - (scope.j as number)), env.depth + 1);
      break;
    }
    case 'Cull': {
      // GetTileMergeCulling(:86117):邻居 echo 涂层(invisibleBlock)与中心不同 → 该向清 -1
      const st2 = env.st;
      if (st2.showInvisibleBlocks) break; // ShouldShowInvisibleBlocksAndWalls → default cache 全 false
      const dirs: Array<[string, number, number]> = [
        [args[0], 0, -1], [args[1], 0, 1], [args[2], -1, 0], [args[3], 1, 0],
        [args[4], -1, -1], [args[5], 1, -1], [args[6], -1, 1], [args[7], 1, 1],
      ];
      for (const [dn, dx, dy] of dirs) if (cullDirVisible(st2, env.i, env.j, dx, dy)) scope[dn] = -1;
      break;
    }
    case 'CactusFrame':
      break; // 仙人掌帧 SW 已有专属移植,本链不达(case 80 在外层)
    default:
      throw new Error(`VanillaFraming: 未实现调用 ${st.fn} @L${st.line}`);
  }
  if (tr) {
    const after = dirNamesAll.map((d) => `${d}=${scope[d]}`).join(',');
    if (after !== dirsBefore || st.fn === 'TileFrame') tr.push(`L${st.line} ${st.fn}(${args.join(',')}) [${dirsBefore}] -> [${after}]`);
  }
}

// ===================== TileFrame 包装(守卫 + 最终写 + 邻递归) =====================
// 等价 WorldGen.TileFrame(82605-82665) 守卫 + TileFrameCosmetic + 86072-86093 写回
interface FrameEntry { fx: number; fy: number; fu: boolean; fd: boolean; fl: boolean; fr: boolean; v6?: number }
export const vanillaFrameCache = new Map<number, FrameEntry>();
// ★缓存键步长常量(2026-08-28 定谳):写入(tileFrame)与失效(invalidateVanillaFrameAt)
// 曾是两套公式——写入 j*st.w+i(世界宽)、失效 j*100000+i ⇒ 键永不相等,失效永远
// 删空 ⇒ 挖掘/放置后邻居帧永不现场刷新(用户实报「被破坏的方块没动态更新」)。
// 统一常量步长(>最大世界宽 8400;j<2400 ⇒ 键上限 ~2.4e8,安全)。
const VF_CACHE_STRIDE = 100000;
let frameCacheWorld: object | null = null;
export function invalidateVanillaFrames(world: object): void {
  if (frameCacheWorld !== world) { frameCacheWorld = world; vanillaFrameCache.clear(); ghostFrameCache.clear(); }
}
export function invalidateVanillaFrameAt(x: number, y: number): void {
  // 局部失效:5×5 邻域。距离 1 = 直接合并码;距离 2 = Frametest 协商旗两跳路径
  // (TileMergeAttemptFrametest 先 TileFrame(邻格) 再读其 mergeUp/… 静态旗 ⇒ 邻格的
  // 旗又依赖它的邻格)。原版无此问题(整 200×150 分区重算);取 ±2 覆盖两跳,成本
  // 可忽略(codegen 重算 ~µs/格)。取整防御小数坐标。
  const xi = Math.floor(x), yi = Math.floor(y);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    vanillaFrameCache.delete((yi + dy) * VF_CACHE_STRIDE + (xi + dx));
    ghostFrameCache.delete((yi + dy) * VF_CACHE_STRIDE + (xi + dx)); // 统一视图帧同步失效
  }
}
/** 区域失效(silent 编辑路径:陨石/祭坛粉碎等走 markDirtyArea 的场景);±1 协商边距 */
export function invalidateVanillaFrameArea(x0: number, y0: number, x1: number, y1: number): void {
  const ax0 = Math.floor(x0) - 1, ay0 = Math.floor(y0) - 1;
  const ax1 = Math.floor(x1) + 1, ay1 = Math.floor(y1) + 1;
  for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
    vanillaFrameCache.delete(y * VF_CACHE_STRIDE + x);
    ghostFrameCache.delete(y * VF_CACHE_STRIDE + x);
  }
}

let TILE_FI: boolean[] | null = null;
// 缺省 FI:def.framed(vanilla tileFrameImportant 的 SW 对应位);setVanillaFrameImportant 覆盖
let _fiDefault: boolean[] | null = null;
function frameImportantOf(vanillaType: number): boolean {
  if (TILE_FI) return !!TILE_FI[vanillaType];
  if (_fiDefault === null) {
    const b = new Array(800).fill(false);
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const v = TILE_DEFS[i]?.vanilla;
      if (v && v.sheet < 800 && TILE_DEFS[i].framed) b[v.sheet] = true;
    }
    _fiDefault = b;
  }
  return _fiDefault[vanillaType] ?? false;
}
// 注入原版 tileFrameImportant 表(递归协商遇到 FI 邻居时直返存储帧,原版早退语义);
// 未注入时缺省由 def.framed 推导(运行时)——golden 用反编译表注入
export function setVanillaFrameImportant(fi: boolean[]): void {
  TILE_FI = fi;
}


// FrameEntry 声明见上方 TileFrame 包装段(fx/fy + 四向协商旗快照 + v6 变体域戳)
const toEntry = (fx: number, fy: number, v6: number): FrameEntry =>
  ({ fx, fy, fu: mergeFlags.up, fd: mergeFlags.down, fl: mergeFlags.left, fr: mergeFlags.right, v6 });

function tileFrame(env: FrameEnv, i: number, j: number, depth: number): { fx: number; fy: number } {
  const st = env.st;
  if (depth > 30) return { fx: 0, fy: 0 }; // 原版 tileReframeCount<25 同级守卫——递归爆栈唯一防护
  if (!st.inBounds(i, j)) return { fx: 0, fy: 0 };
  const idx = st.idx(i, j);
  if (!st.flags[idx]) return { fx: 0, fy: 0 };
  const typeV = vanillaIdOf(st.type[idx]); // 内部 id → vanilla id(★域契约,见头注)
  const key = j * VF_CACHE_STRIDE + i; // ★与 invalidateVanillaFrameAt 同一公式(见常量注)
  const rawHit = env.frameCache.get(key) ?? (env.bypassGlobalCache ? undefined : vanillaFrameCache.get(key));
  // ★变体域戳(2026-08-28):帧是 (世界配置 × num6 变体) 的函数。oracle/区域对拍逐格
  // 注入 variant 时,深层递归会把"外层变体"算出的邻格帧写进全局缓存,顶链再命中即串
  // 变体(golden layer4 注释同案)。命中时校验 v6 !== 当前变体 → 按 miss 重算覆盖。
  // 生产路径 num6 恒为位置哈希,戳恒相等 → 行为与旧缓存完全一致。
  const cached = rawHit && rawHit.v6 === env.variant ? rawHit : undefined;
  if (cached) {
    // ★静态协商旗随缓存一并复放:原版静态旗是该格配置的纯函数(Frametest 在递归返回后
    // 立即读取),快照回放等价于完整重跑,又避免指数级重复求值。
    mergeFlags.up = cached.fu; mergeFlags.down = cached.fd;
    mergeFlags.left = cached.fl; mergeFlags.right = cached.fr;
    return { fx: cached.fx, fy: cached.fy };
  }
  // env.frameCache 先挂占位档(存档内存帧)防同一次求值内的协商回环;
  // 完成后被带旗终值覆盖(vanilla tail 写回语义 :86072-86093 的框内等价)。
  env.frameCache.set(key, toEntry(st.frameX[idx], st.frameY[idx], env.variant));
  // ★env.i/j 必须重绑到本次递归的坐标:runCosmeticChain 用 parentEnv 的 i/j 构造
  // 邻居句柄(mkTile),沿用外层坐标会让深层求值读到错误的八邻。
  const res = runCosmeticChain(st, i, j, typeV, { ...env, i, j, depth });
  const entry = toEntry(res.fx, res.fy, env.variant);
  if (!env.noGlobalWrite) vanillaFrameCache.set(key, entry); // 统一视图态不得驻留全局缓存
  env.frameCache.set(key, entry);
  return res;
}

// 邻居包装对象(T0/TD/…:求值环境的 tile/tile2-8)
function mkTile(env: FrameEnv, dx: number, dy: number, centerVan: number): FrameTileH {
  const st = env.st;
  const x = env.i + dx, y = env.j + dy;
  const ok = st.inBounds(x, y);
  const idx = ok ? st.idx(x, y) : -1;
  const act = ok && !!st.flags[idx];
  // 源码带调用的成员(active()/slope()/halfBrick()/topSlope()…)暴露为函数;属性访问(.type/.frameY/bare)为值
  return {
    bare: ok,                            // tile3 != null
    type: act ? vanillaIdOf(st.type[idx]) : 0,  // .type(★vanilla 域)
    fx: ok ? st.frameX[idx] : -1,        // .frameX
    fy: ok ? st.frameY[idx] : -1,        // .frameY
    act: () => act,                      // .active()
    slope: () => (act ? st.slope[idx] : 0),   // .slope()
    half: () => act && !!st.half[idx],        // .halfBrick()
    tops: () => ok && (st.slope[idx] === 1 || st.slope[idx] === 2),   // .topSlope()
    lefts: () => ok && (st.slope[idx] === 1 || st.slope[idx] === 3),  // .leftSlope()
    rights: () => ok && (st.slope[idx] === 2 || st.slope[idx] === 4), // .rightSlope()
    bots: () => ok && (st.slope[idx] === 3 || st.slope[idx] === 4),   // .bottomSlope()
  };
}

// ===================== 跨族统一视图求帧(2026-08-30 第二批回落)=====================
// 需求演变:第一批「回落旧近似路径」后,第二批标注证明【旧规则自身在这些构型仍有缝】
// (34 格审计 notDiverted=0 ⇒ 全部已走旧路径仍被标)。终极方案=仍用链、但把 MERGE_DIRT
// 异族邻居【视同本族】求帧——链输出自然落到全连内帧族,接缝闭合且与周边链格同几何家族。
// 实现:零拷贝 Proxy 商店视图(type 读穿重映射),独立小缓存,任何编辑失效钩同步清理;
// 不写全局缓存(noGlobalWrite)⇒ 金标/rig 对拍语义完全不受影响。
let _vanToInternal: Int16Array | null = null;
function vanToInternalTable(): Int16Array {
  if (_vanToInternal) return _vanToInternal;
  const t = new Int16Array(1200).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const v = TILE_DEFS[i]?.vanilla;
    if (v && v.sheet < 1200 && t[v.sheet] === -1) t[v.sheet] = i;
  }
  _vanToInternal = t;
  return t;
}
// ★合并族扩展谓词(仅用于回落门/统一视图,**不改链自身盖章语义**——rig 对拍仍按严格表):
// 官方 SetupTileMerge 没有 tileMergeDirt[0](泥土本身不进表,由 num==type 自然处理),
// 但跨族闭合的偏离域若不含 0,则「任何 X↔泥土」交界全部漏网(2026-08-30 第三批实证,
// sandstone_brick 151 被四邻泥土围死却判非异族)。family 定义 = {0} ∪ MERGE_DIRT。
export function isVanillaMergeDirtFamily(van: number): boolean {
  return van === 0 || !!MERGE_DIRT[van];
}
// ★冰雪互斥接缝对(2026-08-31 第四批,用户实报「冰块×雪块跨类漏缝」):
// 官方 TileFrameCosmetic 里雪/冰同属 tileBrick 超级家族却经排除表互斥——
//   雪 147 排除 DontMergeWithSnow(TID:193){161 冰,200 血冰,163 腐冰,164 神圣冰,
//     224 雪泥,170 松树块,738 蓬松猫毛块}(:82796-82799);
//   冰族排除雪 147 Sets.Snow(TID:291)(:82801-82805);
//   162 薄冰排除 IcesSnow(TID:297){161,200,163,164,147}(:82806-82809)。
// 与 MERGE_DIRT 跨族批同政策(用户权威定案=接缝封闭;官方互斥过渡帧自带真透明
// 缺口,sw_vanilla_framing_strict=1 可切回逐位原版验缝)。判定按官方排除表
// 双向对称(单向缝的另一侧官方本就相连,统一视图对其是视觉无操作)。
export function isVanillaSeamPair(a: number, b: number): boolean {
  if ((a === 147) !== (b === 147)) {
    if (DONT_MERGE_WITH_SNOW[a === 147 ? b : a]) return true;
  }
  if ((a === 162) !== (b === 162)) {
    if (SETS_ICES_SNOW[a === 162 ? b : a]) return true;
  }
  return false;
}
const ghostFrameCache = new Map<number, { fx: number; fy: number }>();
function clearGhostCache(): void {
  ghostFrameCache.clear();
}
// 统一视图按【中心类型】缓存(视图是中心van的纯函数;Proxy 读穿实时数组 ⇒ 编辑天然
// 自愈,无需失效钩)。同类型所有格共享一个代理,bake 冷路径从每格一建降到每类一建。
const ghostViewCache = new Map<number, WeakMap<object, TileStore>>();
function buildUnifiedView(st: TileStore, centerVan: number): TileStore {
  const targetInternal = vanToInternalTable()[centerVan];
  const realType = st.type;
  const flags = st.flags;
  const ghost = Object.create(st) as { type: TileStore['type'] };
  Object.defineProperty(ghost, 'type', {
    value: new Proxy(realType, {
      get(t: unknown, prop: string | symbol) {
        if (typeof prop !== 'string') return (realType as unknown as Record<string | symbol, unknown>)[prop];
        const i = +prop;
        if (!Number.isInteger(i)) return (realType as unknown as Record<string | symbol, unknown>)[prop];
        if (!flags[i]) return realType[i];
        const van = vanillaIdOf(realType[i]);
        if (van !== centerVan && targetInternal >= 0) {
          // 泥土族跨族批:视图原语义 = 邻居∈MERGE_DIRT 族 → 视同本族(调用门保证
          // 中心亦在族内;此处显式判中心,防冰雪批复用视图时把石/土误并进雪)
          if (isVanillaMergeDirtFamily(centerVan) && isVanillaMergeDirtFamily(van)) return targetInternal;
          // 冰雪互斥批(2026-08-31):官方排除表互斥对 → 视同本族,内帧闭合接缝
          if (isVanillaSeamPair(centerVan, van)) return targetInternal;
        }
        return realType[i];
      },
    }) as TileStore['type'],
  });
  return ghost as TileStore;
}
function unifiedStoreView(st: TileStore, x: number, y: number): TileStore {
  const centerVan = vanillaIdOf(st.type[st.idx(x, y)]);
  let per = ghostViewCache.get(centerVan);
  if (!per) { per = new WeakMap(); ghostViewCache.set(centerVan, per); }
  let g = per.get(st);
  if (!g) { g = buildUnifiedView(st, centerVan); per.set(st, g); }
  return g;
}
/** 跨族统一视图下的帧(回落分支专用;不污染常规缓存与语义) */
export function vanillaFrameUnified(st: TileStore, x: number, y: number, variant: number, rockLayer: number): { fx: number; fy: number } {
  const key = Math.floor(y) * VF_CACHE_STRIDE + Math.floor(x);
  const hit = ghostFrameCache.get(key);
  if (hit) return hit;
  const ghost = unifiedStoreView(st, x, y);
  const cv = vanillaIdOf(ghost.type[ghost.idx(x, y)]);
  const r = tileFrame({ st: ghost, i: x, j: y, variant, rockLayer, centerVan: cv, frameCache: new Map(), depth: 0, bypassGlobalCache: true, noGlobalWrite: true }, x, y, 0);
  const out = { fx: r.fx, fy: r.fy };
  ghostFrameCache.set(key, out);
  return out;
}

// ===================== 对外主入口 =====================
// 求解 (i,j) 非 FI 原版块的 vanilla 帧。variant 为 0-2 变体(原版 frameNumber;
// SW 用确定性哈希,oracle 对拍时按变体归一)。
export function vanillaFrameFor(st: TileStore, i: number, j: number, world: object, variant: number, rockLayer: number, forceFresh = false, trace?: TraceSink): { fx: number; fy: number } {
  invalidateVanillaFrames(world);
  const cv = vanillaIdOf(st.type[st.idx(i, j)]);
  return tileFrame({ st, i, j, variant, rockLayer, centerVan: cv, frameCache: new Map(), depth: 0, bypassGlobalCache: forceFresh, trace }, i, j, 0);
}

// 变体查表(SW_FRAME 变体注入通道):oracle 对拍时给每格提供原版 frameNumber;缺省回落
// 到确定性位置哈希(SW 运行时无注入的默认语义)。
let VARIANT_MAP: Map<number, number> | null = null;
export function setVanillaVariantMap(map: Map<number, number> | null): void {
  VARIANT_MAP = map;
}

function runCosmeticChain(st: TileStore, i: number, j: number, NUMraw: number, parentEnv: FrameEnv): { fx: number; fy: number } {
  mergeFlags.up = false; mergeFlags.down = false; mergeFlags.left = false; mergeFlags.right = false;
  const num6v = VARIANT_MAP?.get(j * st.w + i) ?? (((i * 7) + (j * 11)) % 3);
  const scope = {
    R: { x: -1, y: -1 },
    i, j,
    NUM: NUMraw,
    num: TILE_STONE[NUMraw] ? 1 : NUMraw,
    NUM11: 0,
    num11: 0,
    num6: num6v,
    OLDFX: 0, OLDFY: 0,
    up: -1, down: -1, left: -1, right: -1,
    upLeft: -1, upRight: -1, downLeft: -1, downRight: -1,
    mergeUp: false, mergeDown: false, mergeLeft: false, mergeRight: false,
    FLAG: false,
    resetFrame: true,
    frameX: 0, frameY: 0,
    HALF: () => !!st.half[st.idx(i, j)],
    SLOPE: () => st.slope[st.idx(i, j)],
    ROCKLAYER: parentEnv.rockLayer,
    TILECOUNT: 800,
    VNUM: () => ((i * 7 + j * 11) % 3),
    BLOCKTYPE: () => 0,
    VR: (a: number, b: number) => parentEnv.variant,
  } as unknown as Scope;
  (scope as Scope).__val = (expr: string) => evalExpr(expr, scope) as number;
  const tHandles = {
    TU: mkTile(parentEnv, 0, -1, parentEnv.centerVan), TD: mkTile(parentEnv, 0, 1, parentEnv.centerVan),
    TL: mkTile(parentEnv, -1, 0, parentEnv.centerVan), TR: mkTile(parentEnv, 1, 0, parentEnv.centerVan),
    TDL: mkTile(parentEnv, -1, 1, parentEnv.centerVan), TDR: mkTile(parentEnv, 1, 1, parentEnv.centerVan),
    TUL: mkTile(parentEnv, -1, -1, parentEnv.centerVan), TUR: mkTile(parentEnv, 1, -1, parentEnv.centerVan),
  };
  // —— 代码生成快路径(语义与下方解释器逐位一致;递归/缓存/协商旗全复用)——
  if (isFramingCodegenEnabled()) {
    const envChain: FrameEnv = { ...parentEnv, i, j };
    const drv: FrameDRV = {
      inv: () => st.showInvisibleBlocks,
      cull: (dx: number, dy: number) => !st.showInvisibleBlocks && cullDirVisible(st, i, j, dx, dy),
      tf: (dx: number, dy: number) => { tileFrame(envChain, i + dx, j + dy, parentEnv.depth + 1); },
    };
    const out = GEN_FRAME(
      mergeFlags, SET_REF_FN, SET_REF_FN, tileMerge, LOC_OBJ,
      { IsRope: (x: number, y: number) => isRopeAt(st, x, y), IsVine: (x: number, y: number) => isVineAt(st, x, y) },
      drv, i, j,
      TILE_STONE[NUMraw] ? 1 : NUMraw, num6v, parentEnv.variant, 0,
      st.slope[st.idx(i, j)], !!st.half[st.idx(i, j)],
      tHandles.TU, tHandles.TD, tHandles.TL, tHandles.TR, tHandles.TUL, tHandles.TUR, tHandles.TDL, tHandles.TDR,
    );
    return { fx: out[0], fy: out[1] };
  }
  const fullScope = { ...scope, ...tHandles, S: SET_REF_FN, SETREF: SET_REF_FN, LOC: { mergesWithDirtInASpecialWay: (t: number) => MERGES_WITH_DIRT_SPECIAL[t] ?? false }, PRED: { IsRope: (x: number, y: number) => isRopeAt(st, x, y), IsVine: (x: number, y: number) => isVineAt(st, x, y) } } as unknown as Scope;
  // ★静态协商旗以 getter 实时读全局(WorldGen.mergeUp/… 语义):深层递归改写后,
  // 父链的 if(mergeDown) 等条件必须看到子链刚写入的值,而非本作用域的过期副本。
  const flagProp = (k: string, g: keyof typeof mergeFlags): void => {
    Object.defineProperty(fullScope, k, { get: () => mergeFlags[g], set: (v2: boolean) => { mergeFlags[g] = v2; }, configurable: true });
  };
  flagProp('mergeUp', 'up'); flagProp('mergeDown', 'down'); flagProp('mergeLeft', 'left'); flagProp('mergeRight', 'right');
  (fullScope as Scope).__val = (expr: string) => evalExpr(expr, fullScope) as number;
  evalProgram(PROGRAM, { ...parentEnv, i, j, depth: parentEnv.depth }, fullScope);
  if (fullScope.R.x < 0 || fullScope.R.y < 0) return { fx: 0, fy: 0 }; // 原版 rectangle 未定 → 保持原帧(存档为 0)
  return { fx: fullScope.R.x as number, fy: fullScope.R.y as number };
}

function isRopeAt(st: TileStore, x: number, y: number): boolean {
  // WorldGen.IsRope(:70605):向下扫 5 格找绳
  if (!st.inBounds(x, y)) return false;
  for (let k = 0; k < 5; k++) {
    const y2 = y + k;
    if (!st.inBounds(x, y2)) break;
    const t = st.type[st.idx(x, y2)];
    if (st.flags[st.idx(x, y2)] && (t === 42 || t === 213 || t === 214 || t === 314 || t === 345 || t === 353 || t === 365 || t === 366 || t === 223)) return true;
  }
  return false;
}
function isVineAt(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && [52, 62, 69, 115, 205, 352, 382, 636, 638].includes(st.type[st.idx(x, y)]);
}
