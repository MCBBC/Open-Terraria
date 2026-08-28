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
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import { genKillTile, genTileFrame, genSquareTileFrame } from './FinalCleanupPass';
import { spreadGrass } from './Spread';
import { growTree, growVanityTree } from './TreePass';
import { placePlantTile } from './SurfaceDecorPasses';

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
/** TileID.Sets.Boulders（TileID.cs:195） */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** TileID.Sets.Conversion.Grass（TileID.cs:51） */
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
/** Main.tileDungeon（Main.cs:7941-7946） */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** Main.wallDungeon（Main.cs:10507-10515） */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** 玻璃墙族（★1458 WallID.Sets.Glass,WallID.cs:46——NTB 蜂巢墙转化豁免集） */
const GLASS_WALLS = new Set([21, 88, 89, 90, 91, 92, 241, 93, 243, 242]);
/** Main.tileSolidTop 生成期表（SolidOrSlopedTile 用；FinishNoTrapsPass 同源副本） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);

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
            && !BOULDERS.has(s) && s !== 141) {
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
  try { g0.__swNTBCap?.('out', gs, st); } catch { /* probe */ }
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
    for (let j = n - n3; j <= n + n3; j++) {
      for (let k = n2 - n3; k <= n2 + n3; k++) {
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
        st.paint[ki] = 0;                                          // color(0)
        if (!activeAt(st, j, k - 1) && !growTree(st, rng, gs, j, k)) {
          placeJunglePlantImpl(st, rng, gs, j, k - 1);             // PlaceTile(61,mute:true)
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
    for (let n = 25; n < h - 25; n++) {
      const idx = st.idx(m, n);
      const num8 = st.flags[idx] ? sheetOf(st.type[idx]!) : -1;
      if (getGood && !tenth && num8 === 76) st.type[idx] = CRISPY_HONEY;
      if (n < num && num8 === 229) {                                // 云上蜂蜜块→水
        st.flags[idx] = 0;
        st.liquid[idx] = 255;
        st.liquidType[idx] = LIQUID_TYPE.WATER;
      }
      if ((dstarve || noTraps) && !tenth && num8 === 48) st.type[idx] = TILE_BY_KEY['v_232_wooden_spike']!;
      if (num8 === 571) genTileFrame(st, rng, m, n);                // 竹重帧
      const num9 = remix ? 10 : 20;
      // 腐化丛林草 25 → 661（cs:25599-25625）
      if (num8 === 25 || (remix && num8 === 23 && n < ws)) {
        for (let a = m - num9; a <= m + num9; a++) {
          for (let b = n - num9; b <= n + num9; b++) {
            if (activeAt(st, a, b) && sheetAt(st, a, b) === 60) {
              if (sheetAt(st, a, b + 1) === 444) genKillTile(st, rng, a, b + 1);
              st.type[st.idx(a, b)] = CORRUPT_JUNGLE;
              if (activeAt(st, a, b - 1) && (sheetAt(st, a, b - 1) === 61 || sheetAt(st, a, b - 1) === 74)) {
                st.flags[st.idx(a, b - 1)] = 0;
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
              if (sheetAt(st, a, b + 1) === 444) genKillTile(st, rng, a, b + 1);
              st.type[st.idx(a, b)] = CRIMSON_JUNGLE;
              if (activeAt(st, a, b - 1) && (sheetAt(st, a, b - 1) === 61 || sheetAt(st, a, b - 1) === 74)) {
                st.flags[st.idx(a, b - 1)] = 0;
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
        if (up === 62 || up === 60 || up === 384) st.type[idx] = JUNGLE_VINE;
      }
      // SpreadGrass 熔岩线分界（cs:25665-25671）
      if (n > lavaLine + rng.int(-2, 2) + 2) {
        if (!remix) spreadGrass(st, m, n, MUD, MUSHROOM_GRASS);
      } else {
        spreadGrass(st, m, n, MUD, JUNGLE_GRASS);
      }
      // 雪冰带重分界（cs:25673-25712）
      const num14 = lavaLine + rng.int(0, 4);                        // Next(5)
      const num15 = Math.trunc(ws) + rng.int(-2, 2) + 35;
      const num16 = Math.trunc((num14 + num15) / 2);
      if (n > num15 && n <= num14) {
        if (m < bd + 200 - 20 - rng.int(-2, 2) || m > w - bd - 200 + 20 + rng.int(-2, 2)) {
          if (st.wall[idx] === HIVE_WALL) st.wall[idx] = 0;
          if (st.liquid[idx]! > 0) { clearHoney(st, idx); clearLava(st, idx); }
          if (num8 === 59) {
            let nearJungle = false;
            for (let a = m - 1; a <= m + 1; a++) {
              for (let b = n - 1; b <= n + 1; b++) {
                if (sheetAt(st, a, b) === 60) nearJungle = true;
              }
            }
            if (!nearJungle) {
              st.type[idx] = n < num16 ? ICE : SNOW;
            }
          }
          if (num8 === 225 || num8 === 230) {
            st.type[idx] = n > num16 ? ICE : SNOW;
          }
        }
      }
      // 树族回退（cs:25714-25730）
      if (!remix && !dstarve) {
        if (num8 === 6 || num8 === 7 || num8 === 166 || num8 === 167) {
          if (n > (lavaLine + rock * 2) / 3 + rng.int(-2, 2) + 2) st.type[idx] = DIRT;
        } else if (num8 === 40 || num8 === 123) {
          if (n > (lavaLine + rock) / 2 + rng.int(-2, 2) + 2) st.type[idx] = STONE;
        }
      }
      // 幼虫播种（cs:25732-25752）
      if (n <= num || m <= 350 || m >= w - 350
        || (st.liquid[idx]! !== 0 && st.liquidType[idx] !== LIQUID_TYPE.HONEY)
        || (tenth && !remix)) {
        continue;
      }
      if (dstarve || remix) {
        if (rng.int(0, 599) === 0) placeLarva(st, rng, m, n);
      } else if (noTraps) {
        if (rng.int(0, 149) === 0) placeLarva(st, rng, m, n);
      } else if (rng.int(0, 224) === 0) {
        placeLarva(st, rng, m, n);                                       // PlaceTile(231)
      }
    }
  }
  // dontStarve 蜘蛛墙/蛛网段（cs:25832-25902）——dstarve 门，纯 NTB 跳过
  if (dstarve && !remix) {
    // ……（组合种子支；纯 NTB 不可达。掷序全在门内。）
  }
  // 地表重种环（cs:25904-25930）：行 y∈[20,num)，列 x∈[20,w-20]
  try { (globalThis as { __swFCMark?: (t: string) => void }).__swFCMark?.('RS'); } catch { /* probe */ }
  for (let y = 20; y < num; y++) {
    for (let x = 20; x <= w - 20; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      clearHoney(st, i);                                            // honey(false)
      if (sheetOf(st.type[i]!) === 375) st.type[i] = TILE_BY_KEY['v_373_water_drip']!;
      if (!remix) {
        if (sheetOf(st.type[i]!) === 60) {
          st.type[i] = GRASS;
          if (rng.int(0, 1) === 0) growVanityTree(st, rng, x, y, true);   // 616 柳
          else growVanityTree(st, rng, x, y, false);                      // 596 樱
          if (!activeAt(st, x, y - 1)) placePlantTile(st, rng, x, y - 1, 3);
        }
        if (sheetOf(st.type[i]!) === 59) st.type[i] = DIRT;
      } else {
        growTree(st, rng, gs, x, y);                                // TryGrowingTreeByType(5)
      }
    }
  }
  // tileSolid[379]=true（cs:25933）——同上备案
  try { (globalThis as { __swFCMark?: (t: string) => void }).__swFCMark?.('RE_ODI'); } catch { /* probe */ }
  if (!remix) overGrownDungeon(st, rng, gs);                        // cs:25937
  try { (globalThis as { __swFCMark?: (t: string) => void }).__swFCMark?.('ODO2'); } catch { /* probe */ }
}

/** PlaceTile(231)（cs:59991→Place3x3 cs:53549 num=-2 支 + SquareTileFrame 尾奏）：
 *  3×3 占位区 (x-1..x+1)×(y-2..y) 全须非活性 + 底行三列 SolidTile2（cs:70178：
 *  active && tileSolid && slope==0 && !half && !inActive——不排 solidTop）。
 *  前置清（cs:59497）与液体门（231 不在拒绝表）照原版链序。 */
function placeLarva(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i0 = st.idx(x, y);
  if (!st.flags[i0]) {                       // cs:59497 前置清（231 非实心恒过大门）
    st.type[i0] = 0; st.frameX[i0] = 0; st.frameY[i0] = 0; st.half[i0] = 0; st.slope[i0] = 0; st.paint[i0] = 0;
  }
  for (let a = x - 1; a <= x + 1; a++) {
    for (let b = y - 2; b <= y; b++) {
      if (activeAt(st, a, b)) return;        // 占位区被占 → Place3x3 失败
    }
  }
  for (let a = x - 1; a <= x + 1; a++) {
    if (!st.inBounds(a, y + 1)) return;
    const bi = st.idx(a, y + 1);
    const tb = st.type[bi]!;
    const solid2 = st.flags[bi] !== 0 && vanGenSolidType(tb)
      && (st.slope[bi] === 0) && !st.half[bi] && ((st.wire[bi] >>> 5) & 1) === 0;
    if (!solid2) return;
  }
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
  genSquareTileFrame(st, rng, x, y);   // cs:59993 尾奏
}

/** SpiderWallRemover（getGood 支；纯 NTB 不可达，占位实现） */
function spiderWallRemover(st: TileStore, rng: RNG, x: number, y: number): void {
  void st; void rng; void x; void y;
}
