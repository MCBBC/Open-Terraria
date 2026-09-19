// 原版 not the bees 秘密种子两大全域转化方法 1:1（UUUUUU 批 2026-08-23）：
//   ① NotTheBees()（1456 WorldGen.cs:25275-25507）——六 pass 槽头重复调用
//     （MudCavesToJungleGrass cs:12504 / SettleLiquids cs:16237 /
//     FragileIceOverIceBiomeWater cs:16762 / LifeCrystals cs:16861 /
//     QuickCleanup cs:17993 / SettleLiquidsPart2 cs:21064 / FinalCleanup 尾 cs:22604）：
//     石→蜂巢 225/230（熔岩线分界）、泥化、草族熔岩线分界（60/70）、沙/淤泥→蜂蜜块
//     229、藤→丛林藤、墙→86 蜂巢墙、水→蜜（地表带/地牢/中带豁免）、地牢漆 14。
//   ② FinishNotTheBees()（cs:25535-25940）——FinalCleanup 尾调用（cs:22605）：
//     云线测定→云上蜂蜜块回水、邪恶丛林草 25/203→661/662（41×41 邻域+向日葵/绯红
//     短草重种）、藤→丛林藤、SpreadGrass 熔岩线分界、雪冰带（147/161 重分界）、
//     树族→泥/石回退（6/7/166/167→0、40/123→1）、幼虫 1/225 播种（231）、
//     地表重种树（60→2 + 樱 596/柳 616 观赏树 + 草丛 3）、OverGrownDungeon
//     （cs:24198-24258 丛林化地牢：地牢砖→泥+树/植物/藤）。
// 掷流语义：每处调用都在所在 GenPass 头（RunPass 重播后）首个掷骰消费者位——
// 接线位见 WorldGen.ts 六槽 + FinalCleanupPass 尾（Dirtiest Block 之后）。
import { LIQUID_TYPE, TileStore } from '../../TileStore';   // ★IIIII229 ⑪ COAT_BLOCK_MASK（序言⑦补齐;与原 type-import 合并）
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS, BOULDERS_SHEETS, SOLID_TOP_SHEETS, TILE_DUNGEON_SHEETS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import { genKillTile, genTileFrame, genSquareTileFrame } from './FinalCleanupPass';
import { grassSpreadState } from './MushroomPass';
import { NOT_CLEARABLE } from './TileRunner';
import { growTree, growVanityTree } from './TreePass';
import { placePlantTile } from './SurfaceDecorPasses';
import { DG_FRAMED_ALL as _DG_FRAMED_ALL } from './dungeonFramedSheets';   // ★叶子直读（红蓝对抗 R4-F5a TDZ 断环,顶层 FI_SHEET 消费）

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET.length ? SHEET[t] : -1);

// ---- 原版 tile id（sheet 域）→ 内部 id ----
const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const HONEY_BLOCK = TILE_BY_KEY['v_229_honey_block']!;
const CRISPY_HONEY = TILE_BY_KEY['v_230_crispy_honey_block']!;
const ICE = TILE_BY_KEY['ice']!;
const SNOW = TILE_BY_KEY['snow']!;
const CORRUPT_JUNGLE = TILE_BY_KEY['v_661_corrupt_jungle_grass_block']!;
const CRIMSON_JUNGLE = TILE_BY_KEY['v_662_crimson_jungle_grass_block']!;
const LIVING_MAHO = TILE_BY_KEY['v_383_living_mahogany_block']!;
const LIVING_MAHO_LEAF = TILE_BY_KEY['v_384_living_mahogany_leaves_block']!;
const JUNGLE_VINE = TILE_BY_KEY['v_62_jungle_vines']!;
const GRASS = TILE_BY_KEY['grass']!;
const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;
const JUNGLE_PLANT = TILE_BY_KEY['v_61_jungle_short_plants']!;
const WOODEN_SPIKE = TILE_BY_KEY['v_232_wooden_spike']!;
const WATER_DRIP = TILE_BY_KEY['v_373_water_drip']!;
const LARVA = TILE_BY_KEY['v_231_larva']!;
const HIVE_WALL = 86;          // WallID 86 蜂巢墙（直写数值，墙无 key 表消费）
const DUNGEON_PAINT = 14;      // PaintID 14 深层地牢漆

// ---- TileID.Sets / Main 集合（1456 TileID.cs / Main.cs；同源副本惯例） ----
/** TileID.Sets.CrackedBricks（TileID.cs:183） */
const CRACKED_BRICKS = new Set([481, 482, 483]);
/** TileID.Sets.Ore（TileID.cs:399；FinishNoTrapsPass 同源副本） */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** TileID.Sets.Clouds（TileID.cs:197；FinalCleanupPass 同源副本） */
const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
/** TileID.Sets.Boulders（TileID.cs:195）——★BJ168-债2（2026-09-19）本地副本拆除,
 *  收编 data/tiles.ts 单源 BOULDERS_SHEETS（sheet 域,逐值对拍 10≡10） */
/** TileID.Sets.Conversion.Grass（TileID.cs:51） */
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
/** Main.tileDungeon（Main.cs:8131-8136）——★BJ187 收编 data/tiles.ts:
 *  TILE_DUNGEON_SHEETS 单源（6 项逐值全等） */
const TILE_DUNGEON = TILE_DUNGEON_SHEETS;
/** Main.wallDungeon（Main.cs:10734-10745）——★BJ187 收编 data/tiles.ts:
 *  WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;
/** 玻璃墙族（★1458 WallID.Sets.Glass,WallID.cs:46——NTB 蜂巢墙转化豁免集） */
const GLASS_WALLS = new Set([21, 88, 89, 90, 91, 92, 241, 93, 243, 242]);
/** Main.tileSolidTop 生成期表（SolidOrSlopedTile 用；FinishNoTrapsPass 同源副本）
 *  ——★BJ187 收编 data/tiles.ts:SOLID_TOP_SHEETS 单源（84 项;旧 79 项漏
 *  Main.cs:10125-10131 循环臂 435-439 队伍平台,生成期不可达=行为零差） */
const SOLID_TOP = SOLID_TOP_SHEETS;

/** oceanDepths（cs:10978-10989）——FinalCleanupPass 同源副本 */
function oceanDepths(st: TileStore, gs: GenState, x: number, y: number): boolean {
  if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
  return x < gs.beachDistance || x > st.w - gs.beachDistance;
}

/** SolidOrSlopedTile（cs:70046）：active && tileSolid && !solidTop && !inActive
 *  ★vanGenSolidType 吃【内部 id】（TILE_DEFS[t] 索引）——曾误传 sheet id 致全表
 *  漏判（NTB 首跑 41 万格 dirt 未泥化定罪）。 */
function solidOrSloped(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (((st.wire[i] >>> 5) & 1) !== 0) return false;   // inActive
  const t = st.type[i]!;
  return vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t));
}

const activeAt = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
const sheetAt = (st: TileStore, x: number, y: number): number =>
  st.inBounds(x, y) ? sheetOf(st.type[st.idx(x, y)]!) : -1;

/** Tile.honey(true)（Tile.cs:397）：无条件置蜜（清 lava 位） */
const setHoney = (st: TileStore, i: number): void => { st.liquidType[i] = LIQUID_TYPE.HONEY; };
/** Tile.honey(false)（Tile.cs:404 `bTileHeader &= 191`）：清蜜位【位掩码语义】——
 *  蜜(0x40)→水、**微光(0x60)→岩浆(0x20)**、水/岩浆不变。曾只做「蜜→水」漏微光支
 *  ——NTB #49 定罪：以太腔微光池（沙滩带 x<bd+200 支）被 honey(false) 后 vanilla
 *  变岩浆 → QuickWater 头 ShimmerRemoveWater（非微光液体全清）抹零；JS 保留微光
 *  → #49 L=697 残留（048→049 对拍实证）。 */
const clearHoney = (st: TileStore, i: number): void => {
  const t = st.liquidType[i];
  if (t === LIQUID_TYPE.HONEY) st.liquidType[i] = LIQUID_TYPE.WATER;
  else if (t === LIQUID_TYPE.SHIMMER) st.liquidType[i] = LIQUID_TYPE.LAVA;
};
/** Tile.lava(false)（Tile.cs:385 `bTileHeader &= 223`）：清岩浆位【位掩码语义】——
 *  岩浆(0x20)→水、**微光(0x60)→蜜(0x40)**、水/蜜不变（与 clearHoney 同款陷阱）。 */
const clearLava = (st: TileStore, i: number): void => {
  const t = st.liquidType[i];
  if (t === LIQUID_TYPE.LAVA) st.liquidType[i] = LIQUID_TYPE.WATER;
  else if (t === LIQUID_TYPE.SHIMMER) st.liquidType[i] = LIQUID_TYPE.HONEY;
};

/** ★IIII29：FinishNotTheBees 细分相锚（x86 rig JJHook.NtbTag 同位镜像；
 *  探针未注册时零开销——fntbTag 直发，热路径标走 safe 包裹防探针异常外溢）。 */
let ntbCallSeq = 0;
const fntbTag = (tag: string, a = 0, b = 0): void => {
  (globalThis as { __swFCMark?: (t: string, a?: number, b?: number) => void }).__swFCMark?.(tag, a, b);
};
const fntbTagSafe = (tag: string, a = 0, b = 0): void => {
  try { fntbTag(tag, a, b); } catch { /* probe */ }
};
// ★IIII29：探针调试窗（globalThis.__swFNTBDBG="m,lo,hi"）——生产恒 false
let dbgM = NaN, dbgLo = 0, dbgHi = 0, dbgInit = false;
function dbgMatch(m: number, n: number): boolean {
  if (!dbgInit) {
    dbgInit = true;
    const e = (globalThis as { __swFNTBDBG?: string }).__swFNTBDBG;
    if (e) {
      const q = e.split(',');
      dbgM = Number(q[0]); dbgLo = Number(q[1]); dbgHi = Number(q[2]);
    }
  }
  return m === dbgM && n >= dbgLo && n <= dbgHi;
}

// ============================================================
// ① NotTheBees()（cs:25275-25507）
// ============================================================
export function runNotTheBees(st: TileStore, rng: RNG, gs: GenState): void {
  const sf = gs.seedFlags;
  if (sf.skyblock) return;                       // cs:25276
  // 一次性探针钩（__swUwCap 同款惯例）：NotTheBees 入口/出口快照（phase='in'|'out'）
  const g0 = globalThis as { __swNTBCap?: (phase: string, gs: GenState, st: TileStore) => void };
  try { g0.__swNTBCap?.('in', gs, st); } catch { /* probe */ }
  const w = st.w, h = st.h;
  const numRemix = Math.floor(w / 7);            // cs:25278（仅 remix 支消费）
  if (!sf.notTheBees) return;                    // cs:25280
  const num2 = Math.trunc((gs.lavaLine + h - 180) / 2);   // cs:25282 蜜/脆蜜分界
  const lavaLine = gs.lavaLine;
  const ws = gs.worldSurface, rock = gs.rockLevel, bd = gs.beachDistance;
  const remix = !!sf.remix, tenth = !!sf.tenthAnniversary, dstarve = !!sf.theConstant,
    drunk = !!sf.drunkWorld;
  // cs:25285-25287（remix 分界带；纯 NTB 恒 false 不掷）
  const remixNum2 = remix ? h - 180 : num2;

  for (let i = 5; i < w - 5; i++) {
    // ★IIIII101e 段标（列级掷位仪,与 rig TSEG|ntbC 同位同口径;无钩零开销）
    if (i % 50 === 7) { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('ntbC', String(i)); } catch { /* probe */ } }
    for (let j = 5; j < h - 180; j++) {
      const idx = st.idx(i, j);
      // flag（cs:25289）：oceanDepths 短路 → Next(3)×1 → 左界短路 → Next(3)×2
      let flag: boolean;
      if (oceanDepths(st, gs, i, j)) {
        flag = true;
      } else if (j < (ws + rock * 2) / 3 + rng.int(0, 2)) {           // Next(3)
        if (i < bd - 50 - rng.int(0, 2)) flag = true;                 // Next(3)
        else flag = i > w - bd + 50 + rng.int(0, 2);                  // Next(3)
      } else {
        flag = false;
      }
      // remix 中央保留带（cs:25291-25293）
      if (remix) {
        if (i < numRemix + rng.int(0, 2) || i >= w - numRemix - rng.int(0, 2)
          || (j > (ws * 2 + rock) / 3 + rng.int(0, 2) && j < h - 350 - rng.int(0, 2))) {
          continue;
        }
      }
      // 十周年/饥荒/地牢侧半图：蜂蜜块→水（cs:25295-25305）
      if ((tenth || dstarve
        || (gs.dungeonSide <= -1 && i < w / 2)
        || (gs.dungeonSide >= 1 && i > w / 2)) && !remix && flag) {
        if (st.flags[idx] && sheetOf(st.type[idx]!) === 229) {
          st.flags[idx] = 0;
          st.liquidType[idx] = LIQUID_TYPE.WATER;    // liquidType(0)
          st.liquid[idx] = 255;
        }
        // ★1458 cs:25414-25421：本支补地牢漆——tileDungeon/CrackedBricks →
        // paint 14、wallDungeon → wallPaint 14（"Fixed paint not applying to the
        // dungeon in certain Not the Bees seed worlds"——地牢落在滩带/地表带时
        // 1457 只有后段大转化支上漆,本支漏漆）
        if (st.flags[idx]) {
          const s0 = sheetOf(st.type[idx]!);
          if (TILE_DUNGEON.has(s0) || CRACKED_BRICKS.has(s0)) st.paint[idx] = DUNGEON_PAINT;
        }
        // ★UUU 勘误：原并行会话写 `st.wallPaint`（TileStore 无此字段,tsc TS2339,
        //   运行时静默空转）——按同文件 :307 与 cs:25449 语义应为 paintWall
        if (WALL_DUNGEON.has(st.wall[idx]!)) st.paintWall[idx] = DUNGEON_PAINT;
        continue;
      }
      // 中带草化（cs:25307-25327：tenth/dstarve/drunk 门——纯 NTB 恒假）
      if (!remix && (tenth || dstarve || drunk)
        && i > w * 0.4 - rng.int(0, 2) && i < w * 0.6 + rng.int(0, 2)) {
        // ……（组合种子支，纯 NTB 不可达；掷序在门内不外溢）
        if (j < rock - 1) {
          if (sheetOf(st.type[idx]!) === 0) {
            let anyInactive = false;
            for (let a = i - 1; a <= i + 1 && !anyInactive; a++) {
              for (let b = j - 1; b <= j + 1; b++) {
                if (!activeAt(st, a, b)) { anyInactive = true; break; }
              }
            }
            if (anyInactive) st.type[idx] = GRASS;
          }
          if (st.wall[idx] === 15) {
            let wl = 65;
            if (rng.int(0, 1) === 0) wl = 63;
            if (dstarve) wl = 63;
            else if (tenth) wl = 65;
            st.wall[idx] = wl;
          }
        }
        if (sheetOf(st.type[idx]!) === 60) st.type[idx] = MUD;
        continue;
      }
      // ★IIII9 TAP：主转化段入口态

      // 藤→丛林藤（cs:25329）
      const s0 = sheetOf(st.type[idx]!);
      if (s0 === 52 || s0 === 382) st.type[idx] = JUNGLE_VINE;
      // 实心转化主体（cs:25331-25400）
      const cracked = st.flags[idx] !== 0 && CRACKED_BRICKS.has(sheetOf(st.type[idx]!));
      if ((solidOrSloped(st, i, j) || cracked)
        // dstarve 排除族（纯 NTB 恒真半支）
        && (!dstarve || remix || ![1, 147, 161, 30, 321, 158, 190, 162].includes(sheetOf(st.type[idx]!)))
        && !ORE_SHEETS.has(sheetOf(st.type[idx]!))
        && sheetOf(st.type[idx]!) !== 368 && sheetOf(st.type[idx]!) !== 367
        && sheetOf(st.type[idx]!) !== 123 && sheetOf(st.type[idx]!) !== 40
        && sheetOf(st.type[idx]!) !== 379
        && (sheetOf(st.type[idx]!) !== 56 || !!sf.skyblock)) {
        const s = sheetOf(st.type[idx]!);
        if (s === 191 || s === 383) {
          if (!remix) st.type[idx] = LIVING_MAHO;
        } else if (s === 192 || s === 384) {
          if (!remix) st.type[idx] = LIVING_MAHO_LEAF;
        } else if (s !== 151 && s !== 662 && s !== 661 && !CLOUDS.has(s) && s !== 120
          && s !== 158 && s !== 175 && s !== 45 && s !== 119
          && !(s >= 63 && s <= 68) && s !== 57 && s !== 76 && s !== 75
          && s !== 229 && s !== 230 && s !== 407 && s !== 404) {
          if (s === 224) {
            if (!dstarve || remix) st.type[idx] = HONEY_BLOCK;       // 淤泥→蜂蜜块
          } else if (s === 53) {
            // 沙→蜂蜜块（滩带豁免；Next(3) 短路链）
            if ((!dstarve || remix)) {
              if (i < bd + rng.int(0, 2)) st.type[idx] = HONEY_BLOCK;
              else if (i > w - bd - rng.int(0, 2)) st.type[idx] = HONEY_BLOCK;
            }
          } else if (
            (i <= bd - rng.int(0, 2)
              || i >= w - bd + rng.int(0, 2)
              || (s !== 397 && s !== 396))
            && s !== 10 && s !== 203 && s !== 25 && s !== 137
            && !BOULDERS_SHEETS.has(s) && s !== 141) {
            if (TILE_DUNGEON.has(s) || CRACKED_BRICKS.has(s)) {
              st.paint[idx] = DUNGEON_PAINT;                        // 地牢漆 14
            } else if (s !== 226 && s !== 202 && s !== 70 && s !== 48 && s !== 232) {
              if (CONV_GRASS.has(s) || s === 60 || s === 70) {
                if (j > lavaLine + rng.int(-2, 2) + 2) st.type[idx] = MUSHROOM_GRASS;
                else st.type[idx] = JUNGLE_GRASS;
              } else if (s === 0 || s === 59) {
                st.type[idx] = MUD;
              } else if (s !== 633 && s !== 562 && s !== 563) {     // （!dstarve||remix 恒真）
                if (j > lavaLine + rng.int(-2, 2) + 2) {
                  if (j <= remixNum2 + rng.int(0, 2)) st.type[idx] = CRISPY_HONEY;
                } else {
                  // (!remix || j > ws + Next(-1,2))——纯 NTB 恒真
                  if (!remix || j > ws + rng.int(-1, 1)) st.type[idx] = HIVE;
                }
              }
            }
          }
        }
      }
      // 地表蜂巢块→草/蘑菇草重种（cs:25402-25446，非滩带 ±220 内带）
      if (!remix && j < h - 50 && j > 50 && i > bd + 220 && i < w - bd - 220) {
        const lonely = !activeAt(st, i - 1, j - 1) || !activeAt(st, i, j - 1)
          || !activeAt(st, i + 1, j - 1) || !activeAt(st, i - 1, j) || !activeAt(st, i + 1, j)
          || !activeAt(st, i - 1, j + 1) || !activeAt(st, i, j + 1) || !activeAt(st, i + 1, j - 1);
        const wallsClear = st.wall[st.idx(i - 1, j - 1)] === 0 && st.wall[st.idx(i, j - 1)] === 0
          && st.wall[st.idx(i + 1, j - 1)] === 0 && st.wall[st.idx(i - 1, j)] === 0
          && st.wall[st.idx(i + 1, j)] === 0 && st.wall[st.idx(i - 1, j + 1)] === 0
          && st.wall[st.idx(i, j + 1)] === 0 && st.wall[st.idx(i + 1, j - 1)] === 0;
        if (st.flags[idx] && sheetOf(st.type[idx]!) === 225 && lonely && (j < ws || wallsClear)) {
          st.type[idx] = JUNGLE_GRASS;
          for (let k = 0; k < 8; k++) {
            const n3 = i + rng.int(-2, 2), n4 = j + rng.int(-2, 2);
            if (!st.inBounds(n3, n4) || !st.inBounds(n3 - 1, n4 - 1) || !st.inBounds(n3 + 1, n4 + 1)) continue;
            const ki = st.idx(n3, n4);
            const full = activeAt(st, n3 - 1, n4 - 1) && activeAt(st, n3, n4 - 1)
              && activeAt(st, n3 + 1, n4 - 1) && activeAt(st, n3 - 1, n4)
              && activeAt(st, n3 + 1, n4) && activeAt(st, n3 - 1, n4 + 1)
              && activeAt(st, n3, n4 + 1) && activeAt(st, n3 + 1, n4 - 1);
            if (st.flags[ki] && sheetOf(st.type[ki]!) === 225 && full) st.type[ki] = MUD;
          }
        }
        // 同款脆蜜块→蘑菇草（cs:25425-25445）
        if (st.flags[idx] && sheetOf(st.type[idx]!) === 230 && lonely && (j < ws || wallsClear)) {
          st.type[idx] = MUSHROOM_GRASS;
          for (let l = 0; l < 8; l++) {
            const n5 = i + rng.int(-2, 2), n6 = j + rng.int(-2, 2);
            if (!st.inBounds(n5, n6) || !st.inBounds(n5 - 1, n6 - 1) || !st.inBounds(n5 + 1, n6 + 1)) continue;
            const li = st.idx(n5, n6);
            const full = activeAt(st, n5 - 1, n6 - 1) && activeAt(st, n5, n6 - 1)
              && activeAt(st, n5 + 1, n6 - 1) && activeAt(st, n5 - 1, n6)
              && activeAt(st, n5 + 1, n6) && activeAt(st, n5 - 1, n6 + 1)
              && activeAt(st, n5, n6 + 1) && activeAt(st, n5 + 1, n6 - 1);
            if (st.flags[li] && sheetOf(st.type[li]!) === 230 && full) st.type[li] = MUD;
          }
        }
      }
      // 墙转化（cs:25448-25490）
      const wall = st.wall[idx]!;
      if (wall !== 15 && wall !== 64 && wall !== 204 && wall !== 205 && wall !== 206
        && wall !== 207 && wall !== 87) {
        if (WALL_DUNGEON.has(wall)) {
          st.paintWall[idx] = DUNGEON_PAINT;
        } else if (
          // (remix || (!tenth && !dstarve && !drunk) || …Next(3) 短路)——纯 NTB 恒真不掷
          // ★NNNNNNNN（2026-08-27 追 1458 定版）：用户裁决基准翻 1458——玻璃墙族豁免
          //   恢复启用（Terarria1458/WorldGen.cs:25582 `(wall<0||!WallID.Sets.Glass[wall])`
          //   替换 1456/1457 的 `wall != 21` 单项；WallID.Sets.Glass={21,88,89,90,91,92,
          //   93,241,242,243} WallID.cs:46）。UUU 批曾按 1457 基线退役本豁免，随裁决
          //   翻回；纯 NTB 世界内该族墙不出现=观测零差（UUU 已证），语义位归位。
          (!dstarve || remix)
          && wall !== 23 && wall !== 24 && wall !== 42 && wall !== 10
          && (wall < 0 || !GLASS_WALLS.has(wall))
          && wall !== 82 && wall !== 187 && wall !== 216 && wall !== 34 && wall !== 244) {
          if (wall === 2 || wall === 196 || wall === 197 || wall === 198 || wall === 199) {
            // 原版自等赋 no-op 支（cs:25468-25481 字面）
          } else if (wall === 63) {
            st.wall[idx] = 64;                                     // 草墙→丛林墙
          } else if (wall !== 3 && wall !== 83 && wall !== 73 && wall !== 62
            && wall !== 180 && wall !== 178 && wall !== 13 && wall !== 14
            && wall !== 312 && wall !== 313 && wall > 0
            && (!remix || j > ws + rng.int(-1, 1))
            && j <= remixNum2 + rng.int(0, 2)) {
            st.wall[idx] = HIVE_WALL;
          }
        }
      }
      // 水→蜜（cs:25492-25505）
      if ((!tenth || remix || !(j < ws)) && (!dstarve || remix)
        && st.liquid[idx]! > 0 && j <= lavaLine + 2) {
        if (i > w * 0.4 && i < w * 0.6) {
          clearHoney(st, idx);                                     // honey(false)
        } else if (j > rock && (i < bd + 200 || i > w - bd - 200)) {
          clearHoney(st, idx);
        } else if (WALL_DUNGEON.has(st.wall[idx]!)) {
          clearHoney(st, idx);
        } else if (!sf.skyblock) {
          setHoney(st, idx);                                       // honey(true)
        }
      }
    }
  }
  // ★IIII29：NTB 调用序锚（x86 CALLEND _ntbCallSeq 同位）
  fntbTagSafe('NCALL', ++ntbCallSeq);
  try { g0.__swNTBCap?.('out', gs, st); } catch { /* probe */ }
}


/** ★IIII24：FinishNotTheBees 域专用 SpreadGrass（vanilla cs:75748-75860 同源副本）。
 *  与 Spread.ts 版差异仅两点：
 *  ① 写入后的 SquareTileFrame 走**全引擎** genSquareTileFrame（FinalCleanupPass，
 *     tileFrameImportant 全分派 + 非实心非FI的仙人掌/藤蔓支）——cs:75288 原文如此；
 *     NTB 世界该级联可观测影响：苔藓184邻格无条件 Next(3) 掷、藤蔓 CheckVines
 *     （基座转草后悬挂藤 636→62 换型——T636>62 家族实证）、各 Check* 支撑杀。
 *  ② cs:75755-75763 的邪恶草专属门/0-泥地表门不适用（本域 grass∈{60,70} 恒走第二
 *     else-if 且 dirt≠0），直接按原文括号结构省略恒真分支；
 *     TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid(cs:55277) 结构性
 *     no-op：IsATreeTrunk∈{5,72,583..589,596,616,634} 中——type5 的 flag 由第一段
 *     switch 按 Conversion.Grass/JungleGrass/Snow/MushroomGrass[60/70]=true 直接
 *     存活；72 无 profile→flag 保持 true；583-589/634 底座为石/灰烬≠dirt(59) 不达
 *     入口；596/616 VanityTreeGroundTest 只认 Conversion.Grass 族含除23/199——
 *     60/70∉ ⇒ 走 ConvertTreeAndGround(…,5)：仅重写 type/帧零掷且其数仅在「底格为
 *     泥而上有樱柳」场景触发——但樱柳种在 grass(2)/mud 顶？#82 种树后地表块类型早
 *     已定格为非 mud ⇒ 全图零可达。故整个 helper 在本域恒 no-op，不移植（备案）。*/
function spreadGrassFinishEngine(st: TileStore, rng: RNG, x: number, y: number, dirt: number, grass: number): void {
  if (x < 10 || x >= st.w - 10 || y < 10 || y >= st.h - 10) return;
  const i = st.idx(x, y);
  if (!st.flags[i] || st.type[i] !== dirt) return;
  const x0 = Math.max(0, x - 1), x1 = Math.min(st.w, x + 2);
  const y0 = Math.max(0, y - 1), y1 = Math.min(st.h, y + 2);
  let enclosed = true;
  for (let k = x0; k < x1; k++) {
    for (let l = y0; l < y1; l++) {
      const wi = st.idx(k, l);
      if (!st.flags[wi] || !vanGenSolidType(st.type[wi])) enclosed = false;
      if (st.liquidType[wi] === LIQUID_TYPE.LAVA && st.liquid[wi] > 0) { enclosed = true; break; }
    }
  }
  if (enclosed) return;
  if (NOT_CLEARABLE.has(st.type[i])) return;
  st.type[i] = grass;
  fntbTagSafe('SPG', x, y);            // ★IIII29：SpreadGrass 成功写入锚（probe 域）
  genSquareTileFrame(st, rng, x, y);
  for (let m = x0; m < x1; m++) {
    for (let n = y0; n < y1; n++) {
      const ni = st.idx(m, n);
      if (st.flags[ni] && st.type[ni] === dirt && grassSpreadState.n < 1000) {
        grassSpreadState.n++;
        spreadGrassFinishEngine(st, rng, m, n, dirt, grass);
        grassSpreadState.n--;
      }
    }
  }
}

// ============================================================
// ② OverGrownDungeon（1457 cs:24237-24299）——丛林化地牢
//   ★IIII24 批定罪修复（ntb 链 #105 四家族 T62>0×3085/T60>59×2683/T60>43×1659/
//   T43>59×2587 全聚拢于 dungeon bbox x[3324,3960]y[223,936]，单根因本函数三处
//   偏离原版——快照对拍实证：d105 家族格链顶上邻 vanilla 直方图 100% type=60，
//   js 全为空/inact，js57≡dump104 ⇒ 全部为本 pass 新增差）：
//   ① 写入类型：vanilla cs:24269 `Main.tile[j,k].type = 60`（JungleGrass！id 表
//      TileID.cs:555/557 Mud=59、JungleGrass=60）——旧版误写 MUD(59)，导致
//      T60>59×2683（V∩J 覆盖重叠格双方都转但类型相异）；placeJunglePlant 的
//      PlaceTile(61) 地基门 below∈{60,226} 因基座 mud 恒拒 → T61>0×680；
//      GrowTree 在 jgrass 基座走 num3+=5 净空分支（TreePass 已支持，FIT 含 60）。
//   ② 跳过谓词（cs:24262-24268）：flag=!TL||!TC||!TR，skip ⟺ (!flag ∧ L ∧ R ∧ BL
//      ∧ BC ∧ TR) ∨ ((flag ∨ ¬SolidTile3(j,k-1)) ∧ dualDungeons.Enabled)。
//      旧版按「8 邻全活性」翻译——**右下角 [j+1,k+1] 原版根本不查**，而 TR 被
//      flag 与主连与式各查一次；凡 BR 空缺而其余七邻完整时 vanilla 会转化而旧版
//      跳过 → T60>43（V-only 格），加上掷流错位产生反向 T43>59。
//      dualDungeons 映射 seedFlags.dualDungeons（纯 NTB 恒 false → 第二支不可达，
//      SolidTile3 照原文实现备用）。SolidTile3(cs:71005)=nactive&&tileSolid&&!solidTop。
//   ③ 藤链放置（cs:24276-24294）：PlaceTile(j,k+1..k+6, 62) —— PlaceTile 无 52/62
//      具名 case，一路穿过 mega else-if 到 TileObject 大 switch 三层 default 最终落
//      `default: tile.active=true; tile.type=num`（genera 臂，零掷；PlaceTile 内
//      num==62 不命中任何拒绝门：!tileSolid[62]=true 进 proceed 支，无 moss/alch/
//      liquid-plant 门）。成功后公共尾奏 SquareTileFrame(i,j)+result=true。旧版
//      误判「PlaceTile 链无 62 分支→恒败 no-op」→ T62>0×3085 整族悬空。
//      ★写侧对拍锚：T62>0 全部 3085 格在 d104/dump104 上同为 inactive ghost 砖
//      （.43/w98），d105 变 A62/w98——排除了「上游藤被杀」假说（S57↔dump104 八通道
//      逐格零差已证基态无损）。
function overGrownDungeon(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const dualDun = !!gs.seedFlags.dualDungeons;
  const mk = (t: string, a: number, b: number): void => {
    try { (globalThis as { __swFCMark?: (tag: string, a?: number, b?: number) => void }).__swFCMark?.(t, a, b); } catch { /* probe */ }
  };
  /** SolidTile3（cs:70991-71013）：nactive && Main.tileSolid && !Main.tileSolidTop */
  const solidTile3Ogd = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i3 = st.idx(x, y);
    if (!st.flags[i3] || ((st.wire[i3] >>> 5) & 1) !== 0) return false;
    return vanGenSolidType(st.type[i3]!) && !SOLID_TOP.has(sheetOf(st.type[i3]!));
  };
  for (let i = 0; i < w; i++) {
    // cs:24244-24248：三掷先于 wallDungeon 门（失败列同样耗掷）；右侧=二次重掷
    let n = rng.int(50, Math.floor(w / 2) - 1);              // Next(50, maxTilesX/2)
    if (gs.dungeonSide >= 1) n = rng.int(Math.floor(w / 2), w - 51);
    const n2 = rng.int(50, h - 51);
    // ★IIII24：半径 num3 的 Next(5,16) 原版在 wallDungeon 门【之后】才掷（rig 1457
    //   cs:24348-24353 实证）——旧版门先掷，失败列多耗 1 掷 ⇒ 本域累计 +5213 掷债，
    //   下游所有随机支（雪带阈值/树藤风格）全体错位。
    if (!st.inBounds(n, n2) || !WALL_DUNGEON.has(st.wall[st.idx(n, n2)]!)) continue;
    const n3 = rng.int(5, 15);
    try { mk?.('OCOL', n, n2); } catch { /* probe */ }
    for (let j = n - n3; j <= n + n3; j++) {
      for (let k = n2 - n3; k <= n2 + n3; k++) {
        try { mk?.('OCELL', j, k); } catch { /* probe */ }
        if (!activeAt(st, j, k) || !TILE_DUNGEON.has(sheetAt(st, j, k))) continue;
        // cs:24262-24268：flag=顶行三格完整性（TL/TC/TR），skip=(!flag∧L∧R∧BL∧BC∧TR)
        // （BR[j+1,k+1] 不参与！）∨ ((flag∨¬SolidTile3(j,k-1))∧dualDun)
        const flagTop = !activeAt(st, j - 1, k - 1) || !activeAt(st, j, k - 1)
          || !activeAt(st, j + 1, k - 1);
        if ((!flagTop && activeAt(st, j - 1, k) && activeAt(st, j + 1, k)
          && activeAt(st, j - 1, k + 1) && activeAt(st, j, k + 1) && activeAt(st, j + 1, k - 1))
          || ((flagTop || !solidTile3Ogd(j, k - 1)) && dualDun)) {
          continue;
        }
        const ki = st.idx(j, k);
        st.type[ki] = JUNGLE_GRASS;                                // cs:24269 type=60
        try { mk?.('OWRITE', j, k); } catch { /* probe */ }
        st.paint[ki] = 0;                                          // color(0)
        if (!activeAt(st, j, k - 1) && !growTree(st, rng, gs, j, k)) {
          placeJunglePlantImpl(st, rng, gs, j, k - 1);             // PlaceTile(61,mute:true)
          try { mk?.('OPLANT', j, k - 1); } catch { /* probe */ }
        }
        // 藤链（cs:24275-24293）：PlaceTile(62) 经 genera default 臂实装成功，
        // Next(3)/Next(4)/Next(3)/Next(2) 条件掷时序 1:1
        if (activeAt(st, j, k + 1) || rng.int(0, 2) === 0) continue;   // Next(3)
        placeVine62(st, rng, j, k + 1);
        if (activeAt(st, j, k + 2)) continue;
        placeVine62(st, rng, j, k + 2);
        if (!activeAt(st, j, k + 3)) {
          placeVine62(st, rng, j, k + 3);
          if (!activeAt(st, j, k + 4) && rng.int(0, 3) !== 0) placeVine62(st, rng, j, k + 4);
          if (!activeAt(st, j, k + 5) && rng.int(0, 2) !== 0) placeVine62(st, rng, j, k + 5);
          if (!activeAt(st, j, k + 6) && rng.int(0, 1) !== 0) placeVine62(st, rng, j, k + 6);
        }
      }
    }
  }
}

/** PlaceTile(x,y,62) 生成期镜像（PlaceTile mega-default 臂，零 genRand 消费）：
 *  头部 proceed 门由 !tileSolid[62] 直接放行； rejection 门（23/199/2/109/60/
 *  661/662/70/633/moss/81/drip/watercut-plants）无一命中；!active 时
 *  tile.Clear(Tile|Paint|Slope)（残型/漆/坡清掉——8 通道可见面仅 type）；随后
 *  generic default `tile.active(true); tile.type=62;` 成功 → 公共尾奏
 *  SquareTileFrame(i,j)（mute=false 分支的 SendTileSquare/sound 在生成期为 no-op，
 *  TruncatesWalls[62]∉{54,328,459,748} 无 SquareWallFrame）。静默生效不动框架位。 */
function placeVine62(st: TileStore, rng: RNG, x: number, y: number): void {
  void rng;
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) {                    // !active → Clear(Tile|Paint|Slope)
    st.slope[i] = 0;
    st.half[i] = 0;                            // Tile.Clear(Slope) 含 halfBrick 清位
    st.paint[i] = 0;
    // ★IIIII229（⑪ copy-sweep B9）：补 coat 方块侧两位——本支形态特殊（type/帧随后被
    // 直写覆盖,①②③无效面）但 coat 残值会留在藤蔓格上;:523 注「可见面仅 type」系
    // IIII217 前旧口径,已过时（帧/coat 通道均在 8ch 门控 dump 面）。
    st.coat[i] &= ~TileStore.COAT_BLOCK_MASK;
  }
  st.flags[i] |= 1;
  st.type[i] = JUNGLE_VINE;
  genSquareTileFrame(st, rng, x, y);           // 公共尾奏（engine TileFrame×9）
}

/** （IIII24 撤销）PlaceTile(62)「恒败 no-op」旧注——实证为 mega-default genera 臂
 *  可放置（见 overGrownDungeon 头注③）；实装 placeVine62。 */

/** placeJunglePlant 1:1 副本（SurfaceDecorPasses 私有实现同源，防 import 环；
 *  cs:59603-59652） */
const JUNGLE_SPORES = TILE_BY_KEY['v_69_jungle_thorns']!;
function placeJunglePlantImpl(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) {                        // cs:59497 前置清（61 非实心恒过大门）
    st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0; st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
    // ★IIIII229（⑪ copy-sweep B7）：补 coat 方块侧两位（Clear(131) TilePaint 支）。
    st.coat[i] &= ~TileStore.COAT_BLOCK_MASK;
  }
  if (y + 1 >= st.h) return;
  const bi = st.idx(x, y + 1);
  if (!st.flags[bi] || st.slope[bi] !== 0 || st.half[bi]) return;
  const below = sheetOf(st.type[bi]!);
  if (below !== 60 && below !== 226) return;
  const temple = below === 226;
  const deep = y > gs.rockLevel;
  const deepOk = temple ? false : deep;
  if (rng.int(0, 15) === 0 && y > gs.worldSurface && !temple) {
    st.setTileSilent(x, y, JUNGLE_SPORES, 0, 0);
    genSquareTileFrame(st, rng, x, y);
    genSquareTileFrame(st, rng, x, y);
    return;
  }
  let fx: number;
  // ★R3-11 复核驳回（同源副本，详见 SurfaceDecorPasses.placeJunglePlant 同位注释）：
  //  `&` vs `&&` 求值序列相同，保持原形
  if (rng.int(0, 59) === 0 && deepOk) fx = 144;
  else if (rng.int(0, 229) === 0 && deepOk) fx = 162;
  else if (rng.int(0, 14) === 0 && !temple) {
    fx = rng.int(0, 2) !== 0 ? rng.int(0, 1) * 18 + 108 : rng.int(0, 12) * 18 + 180;
  } else {
    fx = rng.int(0, 5) * 18;
  }
  st.setTileSilent(x, y, JUNGLE_PLANT, fx, 0);
  genSquareTileFrame(st, rng, x, y);
}

// ============================================================
// ③ FinishNotTheBees()（cs:25535-25940）
// ============================================================
export function runFinishNotTheBees(st: TileStore, rng: RNG, gs: GenState): void {
  const sf = gs.seedFlags;
  if (!sf.notTheBees || sf.skyblock) return;     // cs:25537
  // ★IIII29：FNTB 窗锚（x86 JJHook.NtbTag 同位；值窗由探针在 marker 上开关）
  fntbTagSafe('FNTBIN');
  const w = st.w, h = st.h;
  const ws = gs.worldSurface, rock = gs.rockLevel, bd = gs.beachDistance;
  const lavaLine = gs.lavaLine;
  const remix = !!sf.remix, tenth = !!sf.tenthAnniversary, dstarve = !!sf.theConstant,
    noTraps = !!sf.noTraps, getGood = !!sf.getGoodWorld;
  // tileSolid[379]=false（cs:25540）——379 生成期恒非实心（GenSolid 时间线），备案
  // 云线测定（cs:25542-25552）：num = [20,ws) 行内含云格的最大行号（无云=0）
  let num = 0;
  for (let i = 20; i < ws; i++) {
    for (let j = 20; j < w - 20; j++) {
      if (activeAt(st, j, i) && CLOUDS.has(sheetAt(st, j, i))) { num = i; break; }
    }
  }
  // getGood 蜘蛛墙清除两环（cs:25554-25585）——getGood 门，纯 NTB 跳过（掷照掷）
  if (getGood && !tenth) {
    for (let k = 0; k < Math.floor(w / 4); k++) {
      let a = rng.int(20, w - 21), b = rng.int(h - 190, h - 21);   // Next(UnderworldLayer+10, maxTilesY-20)
      let tries = 10000;
      while (st.wall[st.idx(a, b)] !== 62 && tries > 0) {
        tries--;
        a = rng.int(20, w - 21); b = rng.int(h - 190, h - 21);
      }
      spiderWallRemover(st, rng, a, b);
    }
    for (let l = 0; l < Math.floor(w / 3); l++) {
      let a = rng.int(20, w - 21), b = rng.int(Math.trunc(ws), h - 231);  // Next(worldSurface, UnderworldLayer-30)
      let tries = 10000;
      while (st.wall[st.idx(a, b)] !== 62 && tries > 0) {
        tries--;
        a = rng.int(20, w - 21); b = rng.int(Math.trunc(ws), h - 231);
      }
      spiderWallRemover(st, rng, a, b);
    }
  }
  // 主扫（cs:25587-25830）
  for (let m = 25; m < w - 25; m++) {
    // ★IIIII101e 段标（列级掷位仪,与 rig TSEG|fntbC 同位同口径）
    if (m % 50 === 27) { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('fntbC', String(m)); } catch { /* probe */ } }
    for (let n = 25; n < h - 25; n++) {
      // ★IIIII101e 行级掷位仪（定位窗 m∈[628,676]；与 rig TSEG|fnTR 同位）
      if (m >= 628 && m <= 676) { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('fnTR', m + '|' + n); } catch { /* probe */ } }
      const idx = st.idx(m, n);
      const num8 = st.flags[idx] ? sheetOf(st.type[idx]!) : -1;
      if (getGood && !tenth && num8 === 76) st.type[idx] = CRISPY_HONEY;
      if (n < num && num8 === 229) {                                // 云上蜂蜜块→水
        st.flags[idx] = 0;
        st.liquid[idx] = 255;
        st.liquidType[idx] = LIQUID_TYPE.WATER;
        fntbTagSafe('HBW', m, n);
      }
      if ((dstarve || noTraps) && !tenth && num8 === 48) st.type[idx] = TILE_BY_KEY['v_232_wooden_spike']!;
      if (num8 === 571) { fntbTagSafe('T571', m, n); genTileFrame(st, rng, m, n); }   // 竹重帧
      const num9 = remix ? 10 : 20;
      // ★IIIII101e 定点示波（与 rig TSEG|fntbA..D 同位；m==633,n==687 无钩零开销）
      if (m === 633 && n === 687) {
        const pr = (t: string) => { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.(t, String(n)); } catch { /* probe */ } };
        pr('fntbA');
      }
      // 腐化丛林草 25 → 661（cs:25599-25625）
      if (num8 === 25 || (remix && num8 === 23 && n < ws)) {
        for (let a = m - num9; a <= m + num9; a++) {
          for (let b = n - num9; b <= n + num9; b++) {
            if (activeAt(st, a, b) && sheetAt(st, a, b) === 60) {
              if (sheetAt(st, a, b + 1) === 444) { fntbTagSafe('KT1', m, n); genKillTile(st, rng, a, b + 1); }
              st.type[st.idx(a, b)] = CORRUPT_JUNGLE;
              if (activeAt(st, a, b - 1) && (sheetAt(st, a, b - 1) === 61 || sheetAt(st, a, b - 1) === 74)) {
                st.flags[st.idx(a, b - 1)] = 0;
                fntbTagSafe('P24', a, b - 1);
                placePlantTile(st, rng, a, b - 1, 24);              // PlaceTile(24)
              }
            } else if (sheetAt(st, a, b - 1) === 233 || sheetAt(st, a, b - 1) === 82) {
              genKillTile(st, rng, a, b - 1);
            }
          }
        }
      } else if (num8 === 203 || (remix && num8 === 199 && n < ws)) {  // 猩红丛林草 → 662
        for (let a = m - num9; a <= m + num9; a++) {
          for (let b = n - num9; b <= n + num9; b++) {
            if (activeAt(st, a, b) && sheetAt(st, a, b) === 60) {
              if (sheetAt(st, a, b + 1) === 444) { fntbTagSafe('KT2', m, n); genKillTile(st, rng, a, b + 1); }
              st.type[st.idx(a, b)] = CRIMSON_JUNGLE;
              if (activeAt(st, a, b - 1) && (sheetAt(st, a, b - 1) === 61 || sheetAt(st, a, b - 1) === 74)) {
                st.flags[st.idx(a, b - 1)] = 0;
                fntbTagSafe('P201', a, b - 1);
                placePlantTile(st, rng, a, b - 1, 201);             // PlaceTile(201)
              } else if (sheetAt(st, a, b - 1) === 233 || sheetAt(st, a, b - 1) === 82) {
                genKillTile(st, rng, a, b - 1);                     // ★嵌套于草支内（cs:25656）
              }
            }
          }
        }
      }
      // 藤→丛林藤（丛林基座下）（cs:25663）
      if ((num8 === 382 || num8 === 52) && activeAt(st, m, n - 1)) {
        const up = sheetAt(st, m, n - 1);
        if (up === 62 || up === 60 || up === 384) {
          st.type[idx] = JUNGLE_VINE;
          fntbTagSafe('V62', m, n);
        }
      }
      // SpreadGrass 熔岩线分界（cs:25665-25671）
      if (m === 633 && n === 687) { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.('fntbB', String(n)); } catch { /* probe */ } }
      // ★IIII24：原版 SpreadGrass 尾 SquareTileFrame 是**全引擎** TileFrame×9 派发
      //   （cs:75288→SquareTileFrame→tileFrameImportant 全表+CheckVines/苔藓184掷）
      // ——旧版走 Spread.ts 的 scoped 副本（仅 185/186/187/26）静默漏掉：
      //   ① 苔藓 184 邻格每次访视的无条件 Next(3)（NTB 蜂蜜世界苔藓密度极高，
      //      全扫累计数千掷债）；② 藤蔓 CheckVines 转化/击杀（新草基座下悬挂藤的
      //      636→62 转化差实证家族 T636>62×172）；③ 各 frameImportant 支撑杀。
      // 本域专用 wrapper：写侧与递归规则与 Spread.spreadGrass 同源副本，
      // 仅把尾奏换成引擎 genSquareTileFrame。
      const dbg = dbgMatch(m, n);
      if (dbg) fntbTagSafe('A1pre', m, n);
      if (n > lavaLine + rng.int(-2, 2) + 2) {
        if (dbg) fntbTagSafe('A1mid', m, n);
        if (!remix) spreadGrassFinishEngine(st, rng, m, n, MUD, MUSHROOM_GRASS);
      } else {
        if (dbg) fntbTagSafe('A1els', m, n);
        spreadGrassFinishEngine(st, rng, m, n, MUD, JUNGLE_GRASS);
      }
      if (dbg) fntbTagSafe('A1post', m, n);
      // 雪冰带重分界（cs:25673-25712）
      const num14 = lavaLine + rng.int(0, 4);                        // Next(5)
      if (dbg) fntbTagSafe('A2', m, n);
      const num15 = Math.trunc(ws) + rng.int(-2, 2) + 35;
      if (dbg) fntbTagSafe('A3', m, n);
      const num16 = Math.trunc((num14 + num15) / 2);
      if (m === 633 && n === 687) { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.('fntbC2', String(n)); } catch { /* probe */ } }
      if (dbg) fntbTagSafe('B4pre', m, n);
      if (n > num15 && n <= num14) {
        if (m < bd + 200 - 20 - rng.int(-2, 2) || m > w - bd - 200 + 20 + rng.int(-2, 2)) {
          if (dbg) fntbTagSafe('B4in', m, n);
          if (st.wall[idx] === HIVE_WALL) { st.wall[idx] = 0; fntbTagSafe('W86', m, n); }
          if (st.liquid[idx]! > 0) { clearHoney(st, idx); clearLava(st, idx); fntbTagSafe('LQ', m, n); }
          if (num8 === 59) {
            let nearJungle = false;
            for (let a = m - 1; a <= m + 1; a++) {
              for (let b = n - 1; b <= n + 1; b++) {
                if (sheetAt(st, a, b) === 60) nearJungle = true;
              }
            }
            if (!nearJungle) {
              st.type[idx] = n < num16 ? ICE : SNOW;
              fntbTagSafe(n < num16 ? 'I161' : 'S147', m, n);
            }
          }
          if (num8 === 225 || num8 === 230) {
            st.type[idx] = n > num16 ? ICE : SNOW;
            fntbTagSafe(num8 === 225 ? (n > num16 ? 'H225I' : 'H225S') : (n > num16 ? 'H230I' : 'H230S'), m, n);
          }
        }
      }
      // 树族回退（cs:25714-25730）
      if (dbg) fntbTagSafe('B4end', m, n);
      if (!remix && !dstarve) {
        if (num8 === 6 || num8 === 7 || num8 === 166 || num8 === 167) {
          if (n > (lavaLine + rock * 2) / 3 + rng.int(-2, 2) + 2) { st.type[idx] = DIRT; fntbTagSafe('TF0', m, n); }
        } else if (num8 === 40 || num8 === 123) {
          if (n > (lavaLine + rock) / 2 + rng.int(-2, 2) + 2) { st.type[idx] = STONE; fntbTagSafe('TF1', m, n); }
        }
      }
      // 幼虫播种（cs:25732-25752）
      if (m === 633 && n === 687) { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.('fntbD', String(n)); } catch { /* probe */ } }
      if (dbg) fntbTagSafe('C5pre', m, n);
      if (n <= num || m <= 350 || m >= w - 350
        || (st.liquid[idx]! !== 0 && st.liquidType[idx] !== LIQUID_TYPE.HONEY)
        || (tenth && !remix)) {
        continue;
      }
      if (dbg) fntbTagSafe('C5mid', m, n);
      if (dstarve || remix) {
        // ★IIIII101e 定点示波 E/F（与 rig fntbE/fntbF 同位）
        const __l6 = rng.int(0, 599) === 0;
        if (m === 633 && n === 687) { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.('fntbE', String(n)); } catch { /* probe */ } }
        if (__l6) {
          placeLarva(st, rng, m, n);
          if (m === 633 && n === 687) { try { (globalThis as unknown as { __swSeg?: (nm: string, d?: unknown) => void }).__swSeg?.('fntbF', String(n)); } catch { /* probe */ } }
        }
      } else if (noTraps) {
        if (rng.int(0, 149) === 0) placeLarva(st, rng, m, n);
      } else if (rng.int(0, 224) === 0) {
        fntbTagSafe('LARV', m, n);
        placeLarva(st, rng, m, n);                                       // PlaceTile(231)
      }
    }
    // ★IIII29：主扫列尾锚（x86 MSC 同位——外层循环体末）
    fntbTagSafe('MSC', m);
  }
  // dontStarve 蜘蛛墙/蛛网段（cs:25832-25902）——dstarve 门，纯 NTB 跳过
  if (dstarve && !remix) {
    // ……（组合种子支；纯 NTB 不可达。掷序全在门内。）
  }
  // 地表重种环（cs:25904-25930）：行 y∈[20,num)，列 x∈[20,w-20]
  fntbTagSafe('RS');
  for (let y = 20; y < num; y++) {
    for (let x = 20; x <= w - 20; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      clearHoney(st, i);                                            // honey(false)
      if (sheetOf(st.type[i]!) === 375) { st.type[i] = TILE_BY_KEY['v_373_water_drip']!; fntbTagSafe('D373', x, y); }
      if (!remix) {
        if (sheetOf(st.type[i]!) === 60) {
          st.type[i] = GRASS;
          fntbTagSafe('TREE', x, y);
          if (rng.int(0, 1) === 0) growVanityTree(st, rng, x, y, true, 0, false, gs);   // 616 柳
          else growVanityTree(st, rng, x, y, false, 0, false, gs);        // 596 樱
          if (!activeAt(st, x, y - 1)) {
            fntbTagSafe('PL3', x, y - 1);
            placePlantTile(st, rng, x, y - 1, 3);
          }
        }
        if (sheetOf(st.type[i]!) === 59) st.type[i] = DIRT;
      } else {
        growTree(st, rng, gs, x, y);                                // TryGrowingTreeByType(5)
      }
      // ★IIII29：环格锚（x86 RGC 同位——内层循环体末）
      fntbTagSafe('RGC', x, y);
    }
    fntbTagSafe('RGR', y, num);
  }
  fntbTagSafe('RE');
  // tileSolid[379]=true（cs:25933）——同上备案
  fntbTagSafe('ODI');
  if (!remix) overGrownDungeon(st, rng, gs);                        // cs:25937
  fntbTagSafe('ODO2');
  // ★IIII29：FNTB 出窗锚
  fntbTagSafe('FNTBOUT');
}

/** TileID.Sets.ResetsHalfBrickPlacementAttempt（TileID.cs:181）：CreateBoolSet(true,
 *  2,23,661,60,70,199,662,109,477,492,179,512,…633) ——默认全 true、表内 id 反置 false；
 *  231(幼虫)**不在反置表内** ⇒ [231]=true。本 pass 仅以 num=231 调用 ⇒ 恒真。 */
const RESETS_HALF_ATTEMPT_231 = true;
/** Main.tileFrameImportant 精确表（sheet 空间）——IIIII28 批改接 DungeonPass 导出。
 *  ★曾硬编码「域内恒非 FI」：把 225/231 等 FI 型的帧清零 → mile8 #105 大回归
 *  （A=3716/T=7606），导出表后逐格同效。 */
const FI_SHEET = _DG_FRAMED_ALL;

function placeLarva(st: TileStore, rng: RNG, x: number, y: number): boolean {
  let ok = true;
  if (!st.inBounds(x, y)) ok = false;
  if (ok) {
    const i0 = st.idx(x, y);
    if (!st.flags[i0]) {
      // cs:59497 + PlaceTile 头（cs:60237-60240）：!active → Clear(Tile|TilePaint|Slope)
      st.type[i0] = 0; st.frameX[i0] = 0; st.frameY[i0] = 0; st.half[i0] = 0; st.slope[i0] = 0; st.paint[i0] = 0;
      // ★IIIII229（⑪ copy-sweep B8）：补 coat 方块侧两位（Clear(131) TilePaint 支）。
      st.coat[i0] &= ~TileStore.COAT_BLOCK_MASK;
    } else if (RESETS_HALF_ATTEMPT_231 && (!FI_SHEET.has(sheetOf(st.type[i0])))) {
      // ★IIII28 批补漏（cs:60241-60246）：目标格已激活且被放类型 ∈
      // ResetsHalfBrickPlacementAttempt[231]=true 且现有型非 tileFrameImportant ⇒
      // 清半砖并重置帧——失败/成功放置都先走这里；此前整缺致 mile8 #105
      // Hf 残差 34（vanilla hf0 / js hf1，首差 (593,228)，type∈{60,25,8}）。
      st.half[i0] = 0;
      st.frameY[i0] = 0;
      st.frameX[i0] = 0;
    }
  }
  if (ok) {
    outer: for (let a = x - 1; a <= x + 1; a++) {
      for (let b = y - 2; b <= y; b++) {
        if (activeAt(st, a, b)) { ok = false; break outer; }        // Place3x3 flag=false
      }
    }
  }
  if (ok) {
    for (let a = x - 1; a <= x + 1; a++) {
      if (!st.inBounds(a, y + 1)) { ok = false; break; }
      const bi = st.idx(a, y + 1);
      const tb = st.type[bi]!;
      const solid2 = st.flags[bi] !== 0 && vanGenSolidType(tb)
        && (st.slope[bi] === 0) && !st.half[bi] && ((st.wire[bi] >>> 5) & 1) === 0;
      if (!solid2) { ok = false; break; }
    }
  }
  if (ok) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -2; dy <= 0; dy++) {
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        st.flags[i] = 1;
        st.type[i] = LARVA;
        st.frameX[i] = (dx + 1) * 18;
        st.frameY[i] = (dy + 2) * 18;
      }
    }
    fntbTagSafe('L231', x, y);           // ★IIII29：PlaceTile(231) 成功锚
  }
  // ★无条件尾奏（成功与失败都走；与 PlaceTile 分派支连发结构一致）
  genSquareTileFrame(st, rng, x, y);
  // ★IIIII101e（GFB zenith #105 定罪主根③）：PlaceTile 多格分派支（case 231 →
  //   Place3x3 + SquareTileFrame）**不 return**，直落公共尾
  //   `if (tile.active()) { …; SquareTileFrame(i, j); result = true; }`
  //   ——vanilla 对 231 恒跑**两遍** SquareTileFrame（rig fntbE/F 实证：扫窗含
  //   case 184 苔藓无条件掷族时 2 掷 vs JS 旧码 1 掷 ⇒ NTB 相位 −1 起全流错位）。
  //   TruncatesWalls={54,328,459,748} 不含 231 → 无 SquareWallFrame 臂。
  let result = false;
  if (st.flags[st.idx(x, y)]) {
    genSquareTileFrame(st, rng, x, y);
    result = true;
  }
  return result;
}

/** SpiderWallRemover（getGood 支；纯 NTB 不可达，占位实现） */
function spiderWallRemover(st: TileStore, rng: RNG, x: number, y: number): void {
  void st; void rng; void x; void y;
}
