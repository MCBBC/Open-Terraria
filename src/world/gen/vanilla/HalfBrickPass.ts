// 原版 "Smooth World" + "Waterfalls" 两个生成 pass 的移植 +
// PoundTile/SlopeTile/CanPoundTile（1456 WorldGen.cs:81434-81560）。
// 半砖是原版"水浸润到方块贴图透明区"与瀑布触发（WaterfallManager 靠 halfBrick 唇缘）
// 的核心：Smooth World 把地表凸起砸成半砖/坡面，Waterfalls pass 专门在水边唇缘砸半砖。
// 坡面渲染见 VanillaTiler.drawSlopedFrame（TileDrawing.cs:1328-1360 切条 1:1）。
// 仍近似原版处（逐条对照 1456 源码后保留）：
//  - CanPoundTile 的 CanKillTile 结构检查（cs:62249）近似为 !framed
//    （黑名单/Boulders/生成期 190,30/ForbidsSloping 上方表均已 1:1，见 canPoundTile）
//  - SolidTile 的 tileSolidTop 近似为 !platform；PlaceTile 的 495 特判未移植
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { flipGenSolid, genSolidType } from './GenSolid';

/** 各排除表按原版 vanilla tile id 构建（经 idsByVanillaSheet 转内部 id） */
const T = { // 排除表用的原版 id 集
  SWITCH: idsByVanillaSheet(136),
  STATUE: idsByVanillaSheet(137),
  /** Loop B 主排除（16661）：137 雕像/48 尖刺/232 木刺/191 活木/151 沙岩砖/274 地牢砖? /75/76 黑曜石狱石砖 */
  LOOP_B_SKIP: idsByVanillaSheet(137, 48, 232, 191, 151, 274, 75, 76),
  /** 空位补角分支排除（16600/16602/16621）：151/274（不做补角材料）与 190/48/232（旁格排除） */
  NO_FILL: idsByVanillaSheet(151, 274),
  NO_FILL_SIDE: idsByVanillaSheet(190, 48, 232),
  /** Conversion.Sand（TileID.cs:30）：沙族 → Loop B 走 Tile.SmoothSlope */
  SAND: idsByVanillaSheet(53, 112, 116, 234),
  /** 补角材料特判（cs:16605/16626）：侧邻 495 贝壳堆 → 用侧邻材料 */
  SHELL_495: idsByVanillaSheet(495),
  /** PlaceTile 草/苔安放门（cs:59400-59440）：目标格非活性时,这些类型一律拒放
   *  （草族要求活性土/泥基,苔要求活性石;补角目标恒非活性 → 全拒——曾无条件
   *  放置 → 幽灵草/苔格 + 后续 SolidTile 门禁漂移,U 批 (54,1083) 实证）。 */
  PLACE_REFUSE: idsByVanillaSheet(
    2, 23, 60, 70, 109, 199, 633, 661, 662,          // 草族（活性泥土基座要求）
    179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627),  // Main.tileMoss（Main.cs:6956-）
  /** TileID.Sets.PreventsSlopesDuringGeneration（1456 TileID.cs:323）：48/137/232/191/151/274/135/442/428 */
  PREVENTS_SLOPES: idsByVanillaSheet(48, 137, 232, 191, 151, 274, 135, 442, 428),
};

/** blockType()==0 判定（悬顶分支旁格检查用）：非活性格或整砖格（half/slope 均为 0） */
function fullOrEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  return !st.flags[i] || (!st.half[i] && st.slope[i] === 0);
}

/** 取证钩（U 批 half/slope 首分叉猎杀）：SlopeTile/PoundTile/KillTile/PlaceTile 调用
 *  追踪,与 vanilla exe 注入的 HsProbe.WLog 同格式对拍（默认无钩零开销） */
function swAct(fn: string, x: number, y: number, extra: number): void {
  const h = (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct;
  if (h) h(fn, x, y, extra);
}

/* ── KillTile 尘粒掷骰（U 批根因修复）──────────────────────────────────────
 * 原版 KillTile(i,j)（cs:63747-63751）每次击杀都调 KillTile_GetTileDustAmount
 * （cs:66654）× KillTile_MakeTileDust（cs:66744）——部分 tile type 的尘型选择
 * 会掷 genRand（如 633 草灰岩 Next(6)、58/76/77/684 与草族 Next(2)、595/596/
 * 615/616 Next(6)…）。这些掷值只影响尘型（世界状态无关）但**占用 RNG 流位**
 * ——此前移植漏了它们 → #53 SmoothWorld 掷数 -9k 级漂移（U 批 vanilla exe
 * RD/ST 追踪实证,详见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md
 * U 批节）。表按**原版 sheet id**（经 SHEET_OF 换算）。 */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}
/** KillTile_GetTileDustAmount(fail=false)（cs:66654-66742） */
function killDustAmount(sheet: number): number {
  switch (sheet) {
    case 654: case 630: case 631: case 125: case 138: case 172: case 287:
    case 300: case 301: case 302: case 303: case 304: case 305: case 306:
    case 307: case 308: case 354: case 355: case 373: case 374: case 375:
    case 376: case 461: case 484: case 499: case 564: case 565: case 593:
    case 594: case 617: case 664: case 665: case 699: case 709: case 711:
    case 712: case 713: case 714: case 715: case 716:
      return 0;
    case 231: return 6;
    case 481: case 482: case 483: return 3;
    case 541: return 1;
    case 549: return 2;
    case 534: case 536: case 539: case 625: case 627: return 5;
    case 184: return -1; // frameX/22>=5?5:10（生成期被击杀极罕见,走 frame 分支）
    default: return 10;
  }
}
/** KillTile_MakeTileDust 每次调用的掷骰数（cs:66744-69226 的 genRand 位点;
 *  生成期地形族实证集 + 源码全表,掷值仅影响尘型不影响世界状态） */
function killDustRollsPer(sheet: number, frameX: number): number {
  switch (sheet) {
    // 草族/多草族（cs:69016/69020/69026/68418/68930/68999/69042/68521）
    case 23: case 24: case 661: case 25: case 27: case 32: case 2: case 477:
    case 109: case 492: case 204: case 478: case 58: case 76: case 77: case 684:
    // 其他 1 掷族（cs:67118/67225/67253/67257/68822/68759/69014）
    case 633: case 641: case 370: case 171: case 238: case 231: case 352:
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
    case 595: case 596: case 615: case 616: case 385:
      return 1;
    case 634: return 2; // Next(10)+Next(12)（cs:67125-67126）
    case 31: case 696: return frameX < 36 ? 1 : 0; // cs:69020
    case 26: case 695: return frameX < 54 ? 1 : 0; // cs:69026
    case 35: return frameX < 36 ? 1 : 0;           // cs:69064
    case 34: case 42: return 1;                    // cs:69069（条件掷,掷恒发生）
    default: return 0;
  }
}

/** 原版 KillTile(i,j) 生成期路径的完整掷骰模型 + 击杀（type=0 清型）。
 *  生成期 noItem=true 无掉落掷;isGeneratingOrLoadingWorld=true 时尘段恒跑
 *  （cs:63747 dust 段在 effectOnly 早退之前,无 netMode 门）。 */
function killTile(st: TileStore, rng: RNG, x: number, y: number): void {
  const i = st.idx(x, y);
  const sheet = SHEET_OF[st.type[i]] ?? -1;
  // cs:63904：蛛网(51)带蜘蛛墙(62) → 先掷 Next(4)（结果只改 noItem,生成期本就 true）
  if (sheet === 51 && st.wall[i] === 62) rng.nextInt(4);
  const n = killDustAmount(sheet);
  const amt = n === -1 ? (st.frameX[i] / 22 >= 5 ? 5 : 10) : n;
  const per = killDustRollsPer(sheet, st.frameX[i]);
  swAct('K', x, y, 0);   // 原版 WLog 在 KillTile 入口（尘掷之前）
  for (let k = 0; k < amt; k++) for (let r = 0; r < per; r++) rng.nextInt(6);
  // cs:63941：地狱石(58) 击杀于 UnderworldLayer(=h-200) 之下 → 灌岩浆 128
  if (sheet === 58 && y > st.h - 200) { st.liquid[i] = 128; st.liquidType[i] = 2; }
  st.setTileSilent(x, y, 0);
}

/** WorldGen.SolidTile(i, j, false) 等价（WorldGen.cs:42370）：
 *  active && tileSolid && !tileSolidTop && !halfBrick && slope==0 —— 半砖/坡面格不算实心。
 *  这对 PoundTile（toggle 语义）至关重要：已砸的半砖不会被后续 pass 再"砸回"整砖。
 *  ★tileSolid 走 GenSolid（生成期 Main.tileSolid 翻转表）：SmoothWorld 期间 137
 *  陷阱（cs:16212 起非实心）/190 荧光菇块（cs:16693 起非实心）/484 滚动仙人掌
 *  （cs:12537 起非实心）等不再被当实心地面——与原版 SolidTile 读可变数组一致 */
export function solidTile(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  // 原版 SolidTile 检查 active()（=flags）：TileRunner 幽灵 tile（有 type 无 flags）
  // 不得当实心——曾致补角分支实体化天空幽灵块成浮空半砖（2583 个）
  if (!st.flags[i]) return false;
  const t = st.type[i];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return genSolidType(t) && !!d && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 可砸判定（1456 WorldGen.cs:81434 CanPoundTile 1:1 表）：
 *  ① type 黑名单（cs:81448）：10 门/48 尖刺/137 陷阱/232 木刺/380 花盆箱/387 陷阱门/
 *    388 高闸/476 高尔夫洞/484 滚动仙人掌
 *  ② TileID.Sets.Boulders（TileID.cs:195）：138/484/664/665/711-716
 *  ③ 生成期追加：190 荧光菇块 / 30 木平台（cs:81462-81471）
 *  ④ 上格 ForbidsSloping（cs:81494）：21 箱/26 祭坛/77 熔炉/88/235 传送器/237 蜥蜴祭坛/
 *    441 假箱/467 箱2/468/470 模型/475 帽架/488 倒木/597 传送塔
 *  ⑤ CanKillTile 结构检查（cs:62249）——仍为近似（生成期主要拦截宝箱/巨石邻接，
 *    ①②④已覆盖生成期实际命中面）
 *  另要求 active 且 tileSolid 非 tileSolidTop（原版隐含：非实心块砸不出半砖） */
const POUND_BLACKLIST = idsByVanillaSheet(10, 48, 137, 232, 380, 387, 388, 476, 484);
const BOULDERS = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
const POUND_GEN_SKIP = idsByVanillaSheet(190, 30);
const FORBIDS_SLOPING = idsByVanillaSheet(21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597);

export function canPoundTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false; // 同 solidTile：幽灵 tile 不可砸
  const t = st.type[i];
  if (t === 0) return false;
  if (POUND_BLACKLIST.has(t)) return false;
  if (BOULDERS.has(t)) return false;
  if (POUND_GEN_SKIP.has(t)) return false;
  // ④ 上格 ForbidsSloping（cs:81475-81478：上格 active 且禁坡物 → 不可砸）
  if (st.inBounds(x, y - 1)) {
    const up = st.idx(x, y - 1);
    if (st.flags[up] && FORBIDS_SLOPING.has(st.type[up])) return false;
  }
  const d = TILE_DEFS[t];
  // !framed ≈ CanKillTile 的框架物拦截（箱/罐/雕像等不可砸半砖）——CanKillTile 整体仍近似
  // tileSolid 走 GenSolid（同 solidTile：生成期翻转表）
  return genSolidType(t) && !!d && !d.platform && !d.framed;
}

/** 坡面(WorldGen.cs:81507 SlopeTile 的生成期路径):清 half、写 slope(0-4)。
 *  slope1=左高右低 / 2=右高左低 / 3=左低右高 / 4=右低左高 */
function slopeTile(st: TileStore, x: number, y: number, dir: number): boolean {
  swAct('S', x, y, dir);
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = 0;
  st.slope[i] = dir;
  return true;
}

/** WorldGen.TileEmpty（70037）：无活性格即空（生成期无 inActive 致动） */
function tileEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  return !st.flags[st.idx(x, y)];
}

/** WorldGen.SolidOrSlopedTile（70046）：active && tileSolid && !tileSolidTop（坡面算实心）。
 *  tileSolid 走 GenSolid（生成期翻转表,同 solidTile） */
export function solidOrSlopedTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return genSolidType(st.type[i]) && !!d && !d.platform;
}

/** Tile.SmoothSlope（1456 Tile.cs:822-880, applyToNeighbors=false 生成期路径,sync 段为联机略）：
 *  按四邻实心位形自整砖/半砖/坡面 1-4 推导。num 位序:上<<3 下<<2 左<<1 右。
 *  case10(上左)→slope3;case9(上右)→slope4;case6(下左)→slope1;case5(下右)→slope2;
 *  case4(仅下)→半砖;其余→整砖。
 *  导出供 DesertHive.PlaceClusters 后置 Smooth（DesertHive.cs:213-222 postEffectMap）
 *  与沙漠入口 Actions.Smooth 复用——坡面/半砖会改写后续 SolidTile 族门禁
 *  （AddTileVariance 酥化判定 + 485/484/187/165 摆放锚点），绝不可按
 *  「哈希无关副作用」省略（#19 残余 7448 act 的根因）。 */
export function smoothSlope(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  if (!canPoundTile(st, x, y) || !solidOrSlopedTile(st, x, y)) return;
  const flag = !tileEmpty(st, x, y - 1);                                  // 上方有物
  const flag2 = !solidOrSlopedTile(st, x, y - 1) && flag;                 // 上方非实心
  const flag3 = solidOrSlopedTile(st, x, y + 1);                          // 下方实心
  const flag4 = solidOrSlopedTile(st, x - 1, y);                          // 左实心
  const flag5 = solidOrSlopedTile(st, x + 1, y);                          // 右实心
  const num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
  switch (num) {
    case 10: if (!flag2) { st.half[i] = 0; st.slope[i] = 3; } break;
    case 9:  if (!flag2) { st.half[i] = 0; st.slope[i] = 4; } break;
    case 6:  st.half[i] = 0; st.slope[i] = 1; break;
    case 5:  st.half[i] = 0; st.slope[i] = 2; break;
    case 4:  st.slope[i] = 0; st.half[i] = 1; break;
    default: st.half[i] = 0; st.slope[i] = 0; break;
  }
}

/** 砸半砖（1456 WorldGen.cs:81544 PoundTile 生成期路径）：切换 halfBrick 位。
 *  导出供蜂巢蜂蜜坠落凹槽（HiveBiome.CreateDentForHoneyFall）等 pass 复用 */
export function poundTile(st: TileStore, x: number, y: number): boolean {
  swAct('P', x, y, 0);
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = st.half[i] ? 0 : 1;
  if (st.half[i]) st.slope[i] = 0;
  return true;
}

/** 原版 pass "Smooth World"（1456 WorldGen.cs:16507-16687）：地表凸起 → 坡面/半砖/削除 */
export function runSmoothWorldPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:16510 `SetCrackedBrickSolidity(solid: true)` →
  //   481/482/483 短暂回实心）：本仓 TILE_DEFS 已把 481-483 预翻为 solid:false
  //   （数据不可动）,GenSolid 可表达该 true 窗口——SmoothWorld 期间裂纹砖按实心处理,
  //   尾部 cs:16695 翻回 false（见函数尾）。
  flipGenSolid([481, 482, 483], true);
  const { w, h } = st;
  // —— 第一遍：主凸起模式（16511-16652）——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      (globalThis as { __swSWCell?: (x: number, y: number) => void }).__swSWCell?.(i, j);
      // 主门禁（1456 cs:16516）：本格与上格均"非活性 或 不在 PreventsSlopesDuringGeneration"
      const okSlope = (yy: number): boolean => {
        if (!st.inBounds(i, yy)) return true;
        const k = st.idx(i, yy);
        return !st.flags[k] || !T.PREVENTS_SLOPES.has(st.type[k]);
      };
      if (!okSlope(j) || !okSlope(j - 1)) continue;
      // 16518 复合门：上方空 && 左右邻非活性开关(136)。★悬顶 else-if 挂在本复合门
      //（vanilla cs:16638）——上格活性 **或** 136 邻活性都进悬顶掷骰段;曾误挂
      // 「仅上格活性」漏 136 邻分支的 Next(2) 掷。
      const noSwitchL = !T.SWITCH.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)];
      const noSwitchR = !T.SWITCH.has(st.type[st.idx(i + 1, j)]) || !st.flags[st.idx(i + 1, j)];
      if (!st.flags[st.idx(i, j - 1)] && noSwitchL && noSwitchR) {
        // 上方无块：对凸起顶端做半砖/削除（16520 还要求 CanBeClearedDuringGeneration）
        if (solidTile(st, i, j) && !NOT_CLEARABLE.has(t)) {
          const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
          if (!st.half[li] && !st.half[ri] && st.slope[li] === 0 && st.slope[ri] === 0) {
            if (solidTile(st, i, j + 1)) {
              // 模式 A（16526-16535）：左凸 → slope2/半砖；模式 B（16537-16546）：右凸 → slope1/半砖
              if (!solidTile(st, i - 1, j) && !st.half[st.idx(i - 1, j + 1)]
                && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                && !st.flags[st.idx(i + 1, j - 1)]) {
                if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j); // Next(2)==0
              } else if (!solidTile(st, i + 1, j) && !st.half[st.idx(i + 1, j + 1)]
                && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                && !st.flags[st.idx(i - 1, j - 1)]) {
                if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j); // Next(2)==0
              } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j + 1)
                && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j)]) {
                // 孤立凸起（16548）：直接半砖
                poundTile(st, i, j);
              }
              // 悬空支脚削除 + 补坡（16552-16592）：先复检（可能已被 slope/pound 改形）
              if (solidTile(st, i, j)) {
                if (solidTile(st, i - 1, j) && solidTile(st, i + 1, j + 2)
                  && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i + 1, j + 1)]
                  && !st.flags[st.idx(i - 1, j - 1)]) {
                  killTile(st, rng, i, j); // KillTile（含尘掷）
                } else if (solidTile(st, i + 1, j) && solidTile(st, i - 1, j + 2)
                  && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i - 1, j + 1)]
                  && !st.flags[st.idx(i + 1, j - 1)]) {
                  killTile(st, rng, i, j); // KillTile（含尘掷）
                } else if (!st.flags[st.idx(i - 1, j + 1)] && !st.flags[st.idx(i - 1, j)]
                  && solidTile(st, i + 1, j) && solidTile(st, i, j + 2)) {
                  // 三路（16562-16576）：Next(5)==0 删 → Next(5)==0 半砖 → 否则 slope2
                  if (rng.int(0, 4) === 0) killTile(st, rng, i, j);
                  else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                  else slopeTile(st, i, j, 2);
                } else if (!st.flags[st.idx(i + 1, j + 1)] && !st.flags[st.idx(i + 1, j)]
                  && solidTile(st, i - 1, j) && solidTile(st, i, j + 2)) {
                  // 镜像三路（16577-16591）：否则 slope1
                  if (rng.int(0, 4) === 0) killTile(st, rng, i, j);
                  else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                  else slopeTile(st, i, j, 1);
                }
              }
            }
            // 顶部单格立柱（16594）：两侧皆空 → 删
            if (solidTile(st, i, j) && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j)]) {
              killTile(st, rng, i, j);
            }
          }
        } else if (!st.flags[ti] && solidTile(st, i, j + 1)) {
          // 空位补角（16600-16639）：下方实心（151/274 不做材料）+ 单侧实心 → 补块 + slope/半砖
          const bi = st.idx(i, j + 1);
          const belowType = st.type[bi];
          if (!T.NO_FILL.has(belowType)) {
            if (!T.NO_FILL_SIDE.has(st.type[st.idx(i + 1, j)])
              && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
              && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j - 1)]) {
              // 16605：右邻 495（贝壳堆）→ 用右邻材料而非下方材料
              const mat = T.SHELL_495.has(st.type[st.idx(i + 1, j)]) ? st.type[st.idx(i + 1, j)] : belowType;
              swAct('T', i, j, mat);
              if (!T.PLACE_REFUSE.has(mat)) st.setTileSilent(i, j, mat);
              if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j);
            }
            if (!T.NO_FILL_SIDE.has(st.type[st.idx(i - 1, j)])
              && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
              && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j - 1)]) {
              // 16626：左邻 495 → 用左邻材料
              const mat = T.SHELL_495.has(st.type[st.idx(i - 1, j)]) ? st.type[st.idx(i - 1, j)] : belowType;
              swAct('T', i, j, mat);
              if (!T.PLACE_REFUSE.has(mat)) st.setTileSilent(i, j, mat);
              if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j);
            }
          }
        }
      } else if (!st.flags[st.idx(i, j + 1)] && rng.int(0, 1) === 0
        && solidTile(st, i, j) && solidTile(st, i, j - 1)
        // 旁格 blockType()==0（16642：整砖或非活性;half/slope 均须为 0）
        && fullOrEmpty(st, i - 1, j) && fullOrEmpty(st, i + 1, j)) {
        // 悬顶坡面（16642-16652）：下方空 + 上方实心 → 依左右实心出 slope3/4
        if (solidTile(st, i - 1, j) && !solidTile(st, i + 1, j) && solidTile(st, i - 1, j - 1)) {
          slopeTile(st, i, j, 3);
        } else if (solidTile(st, i + 1, j) && !solidTile(st, i - 1, j) && solidTile(st, i + 1, j - 1)) {
          slopeTile(st, i, j, 4);
        }
      }
    }
  }

  // —— 第二遍（16656-16687）：斜坡补坡 + 沙族 SmoothSlope + 无支撑坡面回落 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      // 主门禁（16661）：Next(2)==0 + 上方空 + 排除 137/48/232/191/151/274/75/76
      if (rng.int(0, 1) === 0 && !st.flags[st.idx(i, j - 1)] && !T.LOOP_B_SKIP.has(t)
        && solidTile(st, i, j)
        // 两侧检查仅针对 137 雕像（16661 原文只列 137;右侧是 (active || type!=137) 原版怪式）
        && (!T.STATUE.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)])
        && (st.flags[st.idx(i + 1, j)] || !T.STATUE.has(st.type[st.idx(i + 1, j)]))) {
        if (solidTile(st, i, j + 1) && solidTile(st, i + 1, j) && !st.flags[st.idx(i - 1, j)]) {
          slopeTile(st, i, j, 2);
        }
        if (solidTile(st, i, j + 1) && solidTile(st, i - 1, j) && !st.flags[st.idx(i + 1, j)]) {
          slopeTile(st, i, j, 1);
        }
      }
      // 沙族平滑（16672-16675）：Conversion.Sand → Tile.SmoothSlope(applyToNeighbors=false)
      if (st.flags[ti] && T.SAND.has(t)) smoothSlope(st, i, j);
      // 无支撑坡面回落（16676-16685）：slope1 左侧悬空 / slope2 右侧悬空 → 复位再砸半砖
      if (st.slope[ti] === 1 && !solidTile(st, i - 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
      }
      if (st.slope[ti] === 2 && !solidTile(st, i + 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
      }
    }
  }
  // ★pass 尾 tileSolid 翻转族（cs:16692-16695,逐条 1:1）：
  //   137=true   还原 JungleShrines 尾（cs:16212）的翻非实心
  //   190=false  荧光菇块自此非实心（Piles 尾 cs:19591 还原）
  //   192=false  活树叶翻回非实心（沙上清水 cs:16324 曾短暂翻 true）
  //   481/482/483=false  裂纹砖翻回非实心（本 pass 头 cs:16510 曾翻 true）
  flipGenSolid([137], true);
  flipGenSolid([190, 192], false);
  flipGenSolid([481, 482, 483], false);
}

/** 原版 pass "Waterfalls"（WorldGen.cs:7697-7743）：水边唇缘砸半砖（瀑布触发的来源） */
export function runWaterfallLipPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:16702 `Main.tileSolid[191] = false`）——活木非实心,
  //   pass 尾 cs:16753 还原 true（见函数尾）。
  flipGenSolid([191], false);
  const { w, h } = st;
  // ★cs:16702 `Main.tileSolid[191] = false`：本 pass 期间活木(191)视为非实心（否则
  //   活木会被当实心水边唇缘砸半砖）——原为 pass 内局部 NON_SOLID 表,已迁移到
  //   GenSolid 统一翻转（pass 尾 cs:16753 还原 true）。solidTile 本身已读 GenSolid,
  //   此处直接用 solidWF = solidTile。
  const solidWF = (x: number, y: number): boolean => solidTile(st, x, y);
  // cs:16723-16726 特判素材：75=黑曜石砖 / 76=狱石砖——旁水唇缘砸半砖前 1/10 才放行
  const OBSIDIAN_HELL = idsByVanillaSheet(75, 76);
  // —— 第一遍（L7701-7723）：实心顶格、左右空、侧旁有水 → 砸半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      if (!solidWF(i, j)) continue;
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      // cs:16709:左右邻须 !active(曾误用 type!==0 → 幽灵格侧邻漏砸半砖)
      if (st.flags[li] !== 0 || st.flags[ri] !== 0) continue;
      if (!solidWF(i, j + 1)) continue;
      if (st.liquid[li] === 0 && st.liquid[ri] === 0) continue;
      // 上方 8-20 格内已有半砖则跳过（原版防连续砸穿）；
      // 掷骰 = genRand.Next(8,20) ×2（8+trunc(Sample*12) 与 Next(8,20) 同分布同流位）
      let flag = true;
      const num3 = 8 + Math.floor(rng.next() * 12), num4 = 8 + Math.floor(rng.next() * 12);
      for (let k = j - num3; k <= j + num4; k++) {
        if (k >= 0 && k < h && st.half[st.idx(i, k)]) flag = false;
      }
      // ★cs:16723-16726 `(type==75||type==76) && Next(10)!=0` → flag=false：
      //   黑曜石/狱石砖旁的唇缘只有 1/10 概率被砸半砖。&& 左短路——仅 75/76 格
      //   才掷 Next(10)；原版此处不查 flag 状态，即使 flag 已 false 也掷（保流位）
      if (OBSIDIAN_HELL.has(st.type[ti]) && rng.nextInt(10) !== 0) flag = false;
      if (flag) poundTile(st, i, j);
    }
  }
  // —— 第二遍（L7725-7741）：唇缘向相邻实心格扩展半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      if (!solidWF(i, j) || !solidWF(i, j + 1)) continue;
      if (!solidWF(i + 1, j) && st.half[st.idx(i - 1, j)] && st.liquid[st.idx(i - 2, j)] > 0) {
        poundTile(st, i, j);
      }
      if (!solidWF(i - 1, j) && st.half[st.idx(i + 1, j)] && st.liquid[st.idx(i + 2, j)] > 0) {
        poundTile(st, i, j);
      }
    }
  }
  // ★pass 尾还原（cs:16753 `Main.tileSolid[191] = true`）
  flipGenSolid([191], true);
}
