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
  variant: number;           // num6(变体 0-2;SW 用确定性哈希,原版为存档 frameNumber/genRand)
  rockLayer: number;
  frameCache: Map<number, { fx: number; fy: number; fu: boolean; fd: boolean; fl: boolean; fr: boolean }>; // TileFrame 递归的帧缓存(含协商旗快照,按格)
  depth: number;
  bypassGlobalCache?: boolean; // 对拍强制新求值通道(顶链绕过全局快照缓存)
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
  const myType = sv(scope, args[2]);
  const lookforRaw = args[3];
  let lookforSet: ((t: number) => boolean) | null = null;
  const k2 = parseSetRefKey(lookforRaw);
  if (k2 != null) {
    if (k2.startsWith('__row_')) { const n2 = +k2.slice(6); lookforSet = (d: number) => tileMerge[n2]?.[d] ?? false; }
    else lookforSet = (SET_REF_FN[k2 as keyof typeof SET_REF_FN] ?? null) as ((t: number) => boolean) | null;
  }
  const lookforIsSet = k2 != null;
  const lookforNum = lookforIsSet ? null : sv(scope, lookforRaw);
  const tryOrtho = (dn: string, dx: number, dy: number, oppositeFlag: 'up' | 'down' | 'left' | 'right'): void => {
    const cur = scope[dn] as number;
    const hit = lookforSet ? (cur > -1 && (lookforSet as (t: number) => boolean)(cur)) : cur === lookforNum;
    if (!hit) return;
    tileFrame(env, env.i + dx, env.j + dy, env.depth + 1);
    if (mergeFlags[oppositeFlag]) scope[dn] = myType;
  };
  tryOrtho('up', 0, -1, 'down');
  tryOrtho('down', 0, 1, 'up');
  tryOrtho('left', -1, 0, 'right');
  tryOrtho('right', 1, 0, 'left');
  for (const dn of args.slice(4)) {
    const cur = scope[dn] as number;
    const lf = lookforIsSet ? resolveSetFn(lookforRaw) : null;
    const hit = lf ? (cur > -1 && lf(cur)) : cur === lookforNum;
    if (hit) scope[dn] = myType;
  }
}

// 裸集合引用 → 查表函数
const SET_REF_FN = {
  Dirt: (t: number) => SETS_DIRT[t] ?? false,
  Mud: (t: number) => SETS_MUD[t] ?? false,
  Ash: (t: number) => SETS_ASH[t] ?? false,
  Snow: (t: number) => SETS_SNOW[t] ?? false,
  IcesSnow: (t: number) => SETS_ICES_SNOW[t] ?? false,
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
function evalProgram(stmts: Stmt[], env: FrameEnv, scope: Scope): void {
  for (const st of stmts) {
    switch (st.kind) {
      case 'if': {
        if (evalExpr(st.cond!, scope)) { evalProgram(st.then!, env, scope); }
        else if (st.else) { evalProgram(st.else, env, scope); }
        break;
      }
      case 'switch': {
        const disc = evalExpr(st.disc!, scope);
        const body = st.cases![String(disc)] ?? st.cases!.default;
        if (body) evalProgram(body, env, scope);
        break;
      }
      case 'assign': {
        const v = evalExpr(st.expr!, scope);
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

function execCall(st: Stmt, env: FrameEnv, scope: Scope): void {
  const args = st.args!;
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
      const cull = (dx: number, dy: number): boolean => {
        const x = env.i + dx, y = env.j + dy;
        if (!st2.inBounds(x, y)) return false;
        const ii = st2.idx(x, y);
        const invSelf = (st2.coat[st2.idx(env.i, env.j)] & 2) !== 0; // COAT_INVISIBLE_BLOCK
        const invNb = (st2.coat[ii] & 2) !== 0;
        return invNb !== invSelf;
      };
      const dirs: Array<[string, number, number]> = [
        [args[0], 0, -1], [args[1], 0, 1], [args[2], -1, 0], [args[3], 1, 0],
        [args[4], -1, -1], [args[5], 1, -1], [args[6], -1, 1], [args[7], 1, 1],
      ];
      for (const [dn, dx, dy] of dirs) if (cull(dx, dy)) scope[dn] = -1;
      break;
    }
    case 'CactusFrame':
      break; // 仙人掌帧 SW 已有专属移植,本链不达(case 80 在外层)
    default:
      throw new Error(`VanillaFraming: 未实现调用 ${st.fn} @L${st.line}`);
  }
}

// ===================== TileFrame 包装(守卫 + 最终写 + 邻递归) =====================
// 等价 WorldGen.TileFrame(82605-82665) 守卫 + TileFrameCosmetic + 86072-86093 写回
interface FrameEntry { fx: number; fy: number; fu: boolean; fd: boolean; fl: boolean; fr: boolean }
export const vanillaFrameCache = new Map<number, FrameEntry>();
let frameCacheWorld: object | null = null;
export function invalidateVanillaFrames(world: object): void {
  if (frameCacheWorld !== world) { frameCacheWorld = world; vanillaFrameCache.clear(); }
}
export function invalidateVanillaFrameAt(x: number, y: number): void {
  // 局部失效:3×3 邻域(协商旗递归可及 ±1 格;取整防御小数坐标)
  const xi = Math.floor(x), yi = Math.floor(y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    vanillaFrameCache.delete((yi + dy) * 100000 + (xi + dx));
  }
}

let TILE_FI: boolean[] | null = null;
// 注入原版 tileFrameImportant 表(递归协商遇到 FI 邻居时直返存储帧,原版早退语义);
// 未注入时缺省由 def.framed 推导(运行时)——golden 用反编译表注入
export function setVanillaFrameImportant(fi: boolean[]): void {
  TILE_FI = fi;
}


// FrameEntry 声明见上方 TileFrame 包装段(fx/fy + 四向协商旗快照)
const toEntry = (fx: number, fy: number): FrameEntry => ({ fx, fy, fu: mergeFlags.up, fd: mergeFlags.down, fl: mergeFlags.left, fr: mergeFlags.right });

function tileFrame(env: FrameEnv, i: number, j: number, depth: number): { fx: number; fy: number } {
  const st = env.st;
  if (depth > 30) return { fx: 0, fy: 0 }; // 原版 tileReframeCount<25 同级守卫——递归爆栈唯一防护
  if (!st.inBounds(i, j)) return { fx: 0, fy: 0 };
  const idx = st.idx(i, j);
  if (!st.flags[idx]) return { fx: 0, fy: 0 };
  const typeV = st.type[idx]; // ★回滚 2026-08-27 vanillaIdOf 补丁:换算域与运行时 store 不一致反而全局隔离帧(详见 tests/vanilla-framing-golden 第4层注释与对齐重做任务)
  const key = j * st.w + i;
  const cached = env.frameCache.get(key) ?? (env.bypassGlobalCache ? undefined : vanillaFrameCache.get(key));
  if (cached) {
    // ★静态协商旗随缓存一并复放:原版静态旗是该格配置的纯函数(Frametest 在递归返回后
    // 立即读取),快照回放等价于完整重跑,又避免指数级重复求值。
    mergeFlags.up = cached.fu; mergeFlags.down = cached.fd;
    mergeFlags.left = cached.fl; mergeFlags.right = cached.fr;
    return { fx: cached.fx, fy: cached.fy };
  }
  // env.frameCache 先挂占位档(存档内存帧)防同一次求值内的协商回环;
  // 完成后被带旗终值覆盖(vanilla tail 写回语义 :86072-86093 的框内等价)。
  env.frameCache.set(key, toEntry(st.frameX[idx], st.frameY[idx]));
  // ★env.i/j 必须重绑到本次递归的坐标:runCosmeticChain 用 parentEnv 的 i/j 构造
  // 邻居句柄(mkTile),沿用外层坐标会让深层求值读到错误的八邻。
  const res = runCosmeticChain(st, i, j, typeV, { ...env, i, j, depth });
  const entry = toEntry(res.fx, res.fy);
  vanillaFrameCache.set(key, entry);
  env.frameCache.set(key, entry);
  return res;
}

// 邻居包装对象(T0/TD/…:求值环境的 tile/tile2-8)
function mkTile(env: FrameEnv, dx: number, dy: number): object {
  const st = env.st;
  const x = env.i + dx, y = env.j + dy;
  const ok = st.inBounds(x, y);
  const idx = ok ? st.idx(x, y) : -1;
  const act = ok && !!st.flags[idx];
  // 源码带调用的成员(active()/slope()/halfBrick()/topSlope()…)暴露为函数;属性访问(.type/.frameY/bare)为值
  return {
    bare: ok,                            // tile3 != null
    type: act ? st.type[idx] : 0,        // .type
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

// ===================== 对外主入口 =====================
// 求解 (i,j) 非 FI 原版块的 vanilla 帧。variant 为 0-2 变体(原版 frameNumber;
// SW 用确定性哈希,oracle 对拍时按变体归一)。
export function vanillaFrameFor(st: TileStore, i: number, j: number, world: object, variant: number, rockLayer: number, forceFresh = false): { fx: number; fy: number } {
  invalidateVanillaFrames(world);
  return tileFrame({ st, i, j, variant, rockLayer, frameCache: new Map(), depth: 0, bypassGlobalCache: forceFresh }, i, j, 0);
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
    TU: mkTile(parentEnv, 0, -1), TD: mkTile(parentEnv, 0, 1), TL: mkTile(parentEnv, -1, 0),
    TR: mkTile(parentEnv, 1, 0), TDL: mkTile(parentEnv, -1, 1), TDR: mkTile(parentEnv, 1, 1),
    TUL: mkTile(parentEnv, -1, -1), TUR: mkTile(parentEnv, 1, -1),
  };
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
