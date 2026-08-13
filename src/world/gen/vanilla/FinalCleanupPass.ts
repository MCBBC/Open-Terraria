// 原版 pass "FinalCleanup"(1456 WorldGen.cs:22304-22670)1:1 移植。
//
// ── 建议接入位(协调者接线用) ──
//   原版注册序 cs:22304(BrokenTrapCleanup cs:22283 之后,是 105 pass 的最后一个
//   全图清理);我方应在 runBrokenTrapCleanupPass 之后调用:
//     runFinalCleanupPass(store, gs);
//
// 子项处置(审计裁决「补」;编号沿用审计清单):
//   ② FillWallHolesInArea(cs:22306)+ SecretSeed surfaceIsDesert 分支(cs:22309)——
//      备案跳过(FillWallHoles 我方未实装;特殊种子分支不适用普通世界)
//   ③ 悬空落体柱生长(cs:22312-22385):{53 沙,112 邪沙,234 猩沙,224 淤泥,123 粉砂}
//      下方无实心 → 地表带向下长同类型 ≤10 格(10 格内有矿轨 314 则停),停点封底
//      (397/398/399/147/1 按类型);非地表带直接转硬化沙族
//   ④ 墙 187/216(沙岩/硬沙墙)液体 → 满岩浆(cs:22387-22392;remix/dualDungeons 种子门不适用)
//   ⑤ 137 石板?——实为 statue/陷阱类 slope/halfBrick 复位(cs:22394-22398,无 active 门)
//   ⑥ 巨石重帧+补支撑(cs:22400-22458):2×2 重帧;上方有 26 祭坛则整块替换
//      (138/664/665/711-716 → 石 0,浮空滚动仙人掌 484 → 397)
//   ⑦ 液体中棕榈 323 杀(cs:22460-22463)
//   ⑧ 地牢墙(wallDungeon 7/8/9/94-99)内液体转水、374→373、刺 56 杀+灌满水
//      (cs:22465-22477)
//   ⑨ 314 矿轨上下清液(上 15 下 1,cs:22479-22491;extraLiquid 种子门不适用)
//   ⑩ 金币堆 332 下方补 332(cs:22493-22498,先 ClearEverything)
//   ⑪ 地表散水清除(cs:22500-22510:非满液且左右下邻皆非满液、邻格非云族)
//   ⑫ 无墙画作继承邻墙(cs:22512-22543,继承序:左→右→上→下)
//   ⑭ DirtiestBlock 彩蛋(cs:22546+)——备案跳过(审计裁决)
//   循环末尾的 TileFrame(i,j)(cs:22544)——跳过:帧管线统一负责,此处不重复
//
// ① Main.tileSolid[484]=false(cs:22305)——本 pass 全程生效;原版不在此还原
//   (Main.tileSolid 随读档重置),故 ③ 的 SolidTile 与 ⑥ 后的类型判断都要用覆写表。
//
// 零掷骰(③-⑫ 全部确定性写格)→ 不收 rng。
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { flipGenSolid } from './GenSolid';

/** sheet(=原版 tile id)→ 内部 id;未实装时 0(空格)安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

/** ③ 落体族 → 封底/转化类型(53→397,112→398,234→399,224→147,123→1) */
const SAND_FALL_BASE = new Map<number, number>([
  [sid(53), sid(397)],
  [sid(112), sid(398)],
  [sid(234), sid(399)],
  [sid(224), sid(147)],
  [sid(123), sid(1)],
]);
/** TileID.Sets.Boulders(1456 TileID.cs:195) */
const BOULDERS = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** TileID.Sets.Clouds(1456 TileID.cs:197) */
const CLOUDS = idsByVanillaSheet(189, 196, 460, 717, 718, 719);
/** TileID.Sets.Paintings(1456 TileID.cs:187) */
const PAINTINGS = idsByVanillaSheet(245, 246, 240, 241, 242);
/** Main.wallDungeon(Main.cs:10507-10515) */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

const ROLLING_CACTUS = sid(484);
const TRACK = sid(314);
const PALM_TREE = sid(323);
const COIN_PILE = sid(332);
const SPIKE = sid(56);
const LAVA_DRIP = sid(374);
const WATER_DRIP = sid(373);
const DEMON_ALTAR = sid(26);
const TRAP_137 = sid(137);

/** Main.tileSolid[t](含 ① 的 484=false 覆写) */
function tileSolidT(t: number): boolean {
  if (t === ROLLING_CACTUS) return false; // ① 覆写(cs:22305)
  return !!TILE_DEFS[t]?.solid;
}

/** WorldGen.SolidTile(cs:42370):active && tileSolid && !tileSolidTop && !halfBrick && slope==0 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && tileSolidT(st.type[i]) && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 生成期 KillTile(cs:63559,生成期 noItem=true):仅清活性/类型,保留液体 */
function killTile(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  if (!st.flags[st.idx(x, y)]) return;
  st.setTileSilent(x, y, 0);
}

/** slope(0)+halfBrick(false)(原版两连写,如 cs:22320-22321) */
function flatten(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.slope[i] = 0;
  st.half[i] = 0;
}

/** Tile.ClearEverything(Tile.cs:140-151):type/wall/liquid/headers/帧全清 */
function clearEverything(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.setTileSilent(x, y, 0);
  st.wall[i] = 0;
  st.liquid[i] = 0;
  st.liquidType[i] = LIQUID_TYPE.NONE;
  st.wire[i] = 0;
}

/** oceanDepths(cs:10978-10989):y 超过海洋层直接 false;横向上进沙滩带返回 true */
function oceanDepths(st: TileStore, gs: GenState, x: number, y: number): boolean {
  if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
  return x < gs.beachDistance || x > st.w - gs.beachDistance;
}

export function runFinalCleanupPass(st: TileStore, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:22306 `Main.tileSolid[484] = false`）：滚动仙人掌
  //   非实心——DesertBiome 头（cs:12537）已翻过,原版冗余重放,接线仅为时间线存档
  //   （484 生成期恒非实心,生成结束亦不还原）。写在 denySomeGeneration 门之外,
  //   原版无条件执行。
  flipGenSolid([484], false);
  const { w, h } = st;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const t = st.idx(i, j);
      const type = st.type[t];

      // ③ 悬空落体柱(cs:22312-22385)
      if (st.flags[t] && !solidTile(st, i, j + 1) && SAND_FALL_BASE.has(type)) {
        if (j < gs.worldSurface + 10 && !st.flags[st.idx(i, j + 1)]
          && st.wall[st.idx(i, j + 1)] !== 191 && !oceanDepths(st, gs, i, j)) {
          // 地表带:向下生长同类型柱
          let num = 10;
          for (let k = j + 1; k <= j + 10; k++) { // 下方 10 格内有矿轨 314 则停(cs:22321-22328)
            const kk = st.idx(i, k);
            if (st.flags[kk] && st.type[kk] === TRACK) { num = 0; break; }
          }
          let num2 = j + 1;
          while (!st.flags[st.idx(i, num2)] && num > 0 && num2 < h - 50) {
            flatten(st, i, num2 - 1);
            st.setTileSilent(i, num2, type);
            flatten(st, i, num2);
            num2++;
            num--;
          }
          if (num === 0 && !st.flags[st.idx(i, num2)]) {
            // 封底(cs:22345-22368)
            st.setTileSilent(i, num2, SAND_FALL_BASE.get(type)!);
          } else {
            const below = st.idx(i, num2);
            if (st.flags[below] && tileSolidT(st.type[below])
              && !TILE_DEFS[st.type[below]]?.platform) {
              flatten(st, i, num2);
            }
          }
        } else if (tileSolidT(st.type[st.idx(i, j + 1)])
          && !TILE_DEFS[st.type[st.idx(i, j + 1)]]?.platform
          && ((st.slope[st.idx(i, j + 1)] === 1 || st.slope[st.idx(i, j + 1)] === 2)
            || st.half[st.idx(i, j + 1)] === 1)) {
          // 下方是坡面/半砖实心 → 复位(cs:22370-22376)
          flatten(st, i, j + 1);
        } else {
          // 深层悬空 → 直接转硬化沙族(cs:22377-22385)
          st.type[t] = SAND_FALL_BASE.get(type)!;
        }
        // 棕榈重帧(cs:22386)——TileFrame 跳过(帧管线负责)
      }

      // ④ 墙 187/216 液体 → 满岩浆(cs:22387-22392;remix/dualDungeons 种子门不适用)
      if ((st.wall[t] === 187 || st.wall[t] === 216) && st.liquid[t] > 0) {
        st.liquid[t] = 255;
        st.liquidType[t] = LIQUID_TYPE.LAVA;
      }

      // ⑤ 137 复位 slope/halfBrick(cs:22394-22398,注意无 active 门)
      if (type === TRAP_137) {
        flatten(st, i, j);
      }

      // ⑥ 巨石重帧+补支撑(cs:22400-22458)
      if (st.flags[t] && BOULDERS.has(type)) {
        const x0 = i - Math.floor(st.frameX[t] / 18);
        const y0 = j - Math.floor(st.frameY[t] / 18);
        let hasAltar = false;
        for (let l = 0; l < 2; l++) {
          if (st.inBounds(x0 + l, y0 - 1)) {
            const ab = st.idx(x0 + l, y0 - 1);
            if (st.flags[ab] && st.type[ab] === DEMON_ALTAR) { hasAltar = true; break; }
          }
          for (let m = 0; m < 2; m++) {
            st.setTileSilent(x0 + l, y0 + m, type, l * 18, m * 18);
          }
        }
        if (hasAltar) {
          // 上方有恶魔祭坛 → 整块替换(cs:22429-22450:484→397,其余→0)
          const repl = type === ROLLING_CACTUS ? sid(397) : 0;
          for (let n = 0; n < 2; n++) {
            for (let o = 0; o < 2; o++) {
              st.setTileSilent(x0 + n, y0 + o, repl, 0, 0);
            }
          }
        }
      }

      // ⑦ 液体中棕榈杀(cs:22460-22463;原版无 active 门,经 KillTile 内部门兜底)
      if (type === PALM_TREE && st.liquid[t] > 0) {
        killTile(st, i, j);
      }

      // ⑧ 地牢墙内液体规范化(cs:22465-22477)
      if (WALL_DUNGEON.has(st.wall[t])) {
        st.liquidType[t] = LIQUID_TYPE.WATER; // liquidType(0):原版无条件写位(液量为 0 时无实际意义)
        if (type === LAVA_DRIP) st.type[t] = WATER_DRIP;
        if (st.flags[t] && type === SPIKE) {
          killTile(st, i, j);
          const tt = st.idx(i, j);
          st.liquidType[tt] = LIQUID_TYPE.WATER;
          st.liquid[tt] = 255;
        }
      }

      // ⑨ 314 矿轨上下清液(cs:22479-22491:上 15 格 + 下 1 格;extraLiquid 种子门不适用)
      if (st.flags[t] && type === TRACK) {
        for (let y2 = j; j - y2 < 15; y2--) { // j, j-1 … j-14
          if (y2 >= 0) st.liquid[st.idx(i, y2)] = 0;
        }
        for (let y2 = j; y2 - j < 1; y2++) { // j(原版重复清一次)
          if (y2 < h) st.liquid[st.idx(i, y2)] = 0;
        }
      }

      // ⑩ 金币堆下方补 332(cs:22493-22498)
      if (st.flags[t] && type === COIN_PILE && !st.flags[st.idx(i, j + 1)]) {
        clearEverything(st, i, j + 1);
        st.setTileSilent(i, j + 1, COIN_PILE);
      }

      // ⑪ 地表散水清除(cs:22500-22510)
      if (i > gs.beachDistance && i < w - gs.beachDistance && j < gs.worldSurface
        && st.liquid[t] > 0 && st.liquid[t] < 255
        && st.liquid[st.idx(i - 1, j)] < 255 && st.liquid[st.idx(i + 1, j)] < 255
        && st.liquid[st.idx(i, j + 1)] < 255
        && (!st.flags[st.idx(i - 1, j)] || !CLOUDS.has(st.type[st.idx(i - 1, j)]))
        && (!st.flags[st.idx(i + 1, j)] || !CLOUDS.has(st.type[st.idx(i + 1, j)]))
        && (!st.flags[st.idx(i, j + 1)] || !CLOUDS.has(st.type[st.idx(i, j + 1)]))) {
        st.liquid[t] = 0;
      }

      // ⑫ 无墙画作继承邻墙(cs:22512-22543,继承序:左→右→上→下)
      if (st.flags[t] && type >= 0 && PAINTINGS.has(type) && st.wall[t] <= 0
        && i >= 2 && j >= 2 && i < w - 2 && j < h - 2) { // InWorld(i,j,2)
        let inherit = 0;
        if (inherit === 0 && st.wall[st.idx(i - 1, j)] > 0) inherit = st.wall[st.idx(i - 1, j)];
        if (inherit === 0 && st.wall[st.idx(i + 1, j)] > 0) inherit = st.wall[st.idx(i + 1, j)];
        if (inherit === 0 && st.wall[st.idx(i, j - 1)] > 0) inherit = st.wall[st.idx(i, j - 1)];
        if (inherit === 0 && st.wall[st.idx(i, j + 1)] > 0) inherit = st.wall[st.idx(i, j + 1)];
        if (inherit !== 0) st.wall[t] = inherit;
      }

      // TileFrame(i,j)(cs:22544)——跳过:帧管线统一负责
    }
  }
}
