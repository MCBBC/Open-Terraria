// 宝石系统世界生成（1.4.5.6 1:1）：
// - GemCaves 宝石洞（WorldGen.cs:17528-17572 选点 + gemCave :9657-9673 选池 +
//   Spread.Gem :3565-3651 BFS：**只沿无墙空气腔扩散**（有墙格不扩散——神庙/房屋
//   天然免疫），实心 Gemmable 自身+四邻 randGemTile（19:1 石:宝），无墙空气格
//   墙=48+池选、1/2 暴露晶簇；空气+有墙格原版在 if(tile.active()) 内才转——零操作零掷）
// - ExposedGems 暴露晶簇（冰系 :20842-20872 目标格自身为冰块 147/161/162/224，
//   先掷 4 个 Next(1,4) 窗口再掷 Next(12) style、逐行雪界 snowMinX/MaxX；
//   地下 :20874-20890 单格空气排除地牢墙/墙27；琥珀 :20891-20913 墙 187/216 不对称窗口）
// - SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282）：先钟乳石扫描
//   （地下 j∈[ws,h-20) 空格 1/5 → 上下邻石族清坡+PlaceTight；地表 k∈[5,ws)
//   冰上/沙上下 1/5 → PlaceTight），同列随后宝石树段（RNG 序：树掷在钟乳石掷之前）
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { growGemTree } from './TreePass';
import { placeTight } from './ShimmerPass';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;   // tile 178
const STONE = TILE_BY_KEY['stone']!;
/** Gemmable（WorldGen.cs:3762-3769）：石/沙/雪/泥/蘑菇草/雪砖/冰 */
const GEMMABLE = idsByVanillaSheet(1, 40, 59, 60, 70, 147, 161);
/** 冰系落脚（:20846）：雪砖/冰/薄冰/雪 147/161/162/224 */
const ICE_FLOOR = idsByVanillaSheet(147, 161, 162, 224);
/** countTiles 的 ice 计数只认 147/161（nextCount cs:9542：不含 162/224） */
const ICE_COUNT = idsByVanillaSheet(147, 161);
/** 宝石墙（WallID.cs:165-175）：AmethystUnsafe=48 … DiamondUnsafe=53（=48+序号）。
 *  序号 0-5 = 紫/黄/蓝/翠/红/钻（与 randGem/暴露晶簇 style 同序） */
const GEM_WALL_BASE = 48;
/** 宝石矿 tile 内部 id（序号同上） */
const GEM_TILES = ['gem_amethyst', 'gem_topaz', 'gem_sapphire', 'gem_emerald', 'gem_ruby', 'gem_diamond']
  .map((k) => TILE_BY_KEY[k]!);
/** 地牢墙（Main.wallDungeon）：7/8/9 + 94-99 */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** 内部 tile id → 原版 sheet id */
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 钟乳石清坡的"石族"（cs:22244-22265：1/147/161/25/203 + tileStone + tileMoss）。
 *  Main.tileStone（Main.cs:7378/7902-7922/…）只标 63-68/130/131/566 */
const STONE_FAMILY = new Set([1, 147, 161, 25, 203, 63, 64, 65, 66, 67, 68, 130, 131, 566]);
/** Main.tileMoss（按 sheet id） */
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);

/** 暴露晶簇 style（:20857-20859 的 Next(12) 映射：紫 3/黄 3/蓝 2/翠 2/红 1/钻 1） */
function randGemStyle(rng: RNG): number {
  const r = rng.nextInt(12);
  if (r < 3) return 0;
  if (r < 6) return 1;
  if (r < 8) return 2;
  if (r < 10) return 3;
  if (r < 11) return 4;
  return 5;
}

// ---- PlaceTile(178) 锚定链（:59717-59725 + CheckAndAdjust :60338 + ValidAnchor :60321）----
// 原版 PlaceTile 的 num==178 分支：CheckAndAdjustMultiDirectionalTile 通过才放置
// （frameY=Next(3)*18 仅在成功时掷）——锚 = 四邻存在可贴的实心格。此前无条件直放 =
// 4763 vs 金标 816（5.8×）、悬空 774 vs 0（2026-08-12 用户标注"四处散布的宝石"）。
/** TileID.Sets.Boulders + type==10 门（:60324：巨石/门不可作锚） */
const ANCHOR_BANNED = idsByVanillaSheet(10, 138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** type==380 特例（SolidTileAllowTopSlope :60411） */
const TYPE_380 = idsByVanillaSheet(380);

/** ValidAnchorForMultiDirectionalTile（:60321）：dir 0=上锚 1=下锚 2=左锚 3=右锚。
 *  生成期无 inActive；slope 原版编码 1/2=底坡 3/4=顶坡，left=2|4 right=1|3。 */
function validAnchor(st: TileStore, x: number, y: number, dir: 0 | 1 | 2 | 3): boolean {
  if (!st.inBounds(x, y)) return true; // Main.tile 索引器 null 防御 → true（随后 tileSolid 门拦截）
  const i = st.idx(x, y);
  const t = st.type[i];
  if (ANCHOR_BANNED.has(t)) return false;
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[t];
  if (!d) return false;
  const solid = d.solid, platform = d.platform;
  const half = st.half[i] === 1, sl = st.slope[i];
  const topSlope = sl === 3 || sl === 4, bottomSlope = sl === 1 || sl === 2;
  const leftSlope = sl === 2 || sl === 4, rightSlope = sl === 1 || sl === 3;
  if (dir === 0) {
    // SolidTileAllowTopSlope（:60399）：(tileSolid||380) && ((!平台&&!底坡)||(平台&&半砖))
    return (solid || TYPE_380.has(t)) && ((!platform && !bottomSlope) || (platform && half));
  }
  if (dir === 1) {
    // SolidTileAllowBottomSlope：（tileSolid||tileSolidTop近似平台）&&!顶坡&&!半砖
    return (solid || platform) && !topSlope && !half;
  }
  if (dir === 2) {
    // SolidTileAllowLeftSlope：tileSolid && !半砖 && !右坡 && !平台
    return solid && !half && !rightSlope && !platform;
  }
  // dir 3：SolidTileAllowRightSlope 镜像
  return solid && !half && !leftSlope && !platform;
}

/** CheckAndAdjustMultiDirectionalTile（:60338）：下>左>右>上优先，锚类型须 tileSolid&&!tileSolidTop。
 *  返回的 newFrameDirection 对 178 不消费帧（frameY 另掷），此处只需布尔门。 */
function checkMultiDirAnchor(st: TileStore, i: number, j: number): boolean {
  const belowOk = validAnchor(st, i, j + 1, 1);
  const leftOk = validAnchor(st, i - 1, j, 2);
  const rightOk = validAnchor(st, i + 1, j, 3);
  const aboveOk = validAnchor(st, i, j - 1, 0);
  const solidNonTop = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    const d = TILE_DEFS[st.type[k]];
    return !!d && d.solid && !d.platform;
  };
  if (belowOk && solidNonTop(i, j + 1)) return true;
  if (leftOk && solidNonTop(i - 1, j)) return true;
  if (rightOk && solidNonTop(i + 1, j)) return true;
  if (aboveOk && solidNonTop(i, j - 1)) return true;
  return false;
}

/** 放 1 格暴露晶簇（= PlaceTile 178 分支：锚定门 + style 帧 + 成功才掷 frameY） */
function placeExposed(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  if (!checkMultiDirAnchor(st, x, y)) return;
  st.setTile(x, y, EXPOSED, style * 18, rng.nextInt(3) * 18);
}

// ============ GemCaves 宝石洞（:17528-17572 + gemCave + Spread.Gem 1:1） ============
export function runGemCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 裸 double 比较（cs:17534：`for i < w*0.003`）——不取整，12.6 也进 13 次
  const num = st.w * 0.003;
  // nextCount（WorldGen.cs:9506-9581）：洪泛连通空气腔；wall!=0 即封顶；lavaOk=false
  // 时岩浆格 lavaCount++ 且立即封顶（含空气格岩浆）；ice 只认 147/161
  const countTiles = (sx: number, sy: number): { air: number; lava: number; ice: number; rock: number } => {
    let air = 0, lava = 0, ice = 0, rock = 0;
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (air >= 300) break;                                  // numTileCount >= maxTileCount(300)
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) return { air: 300, lava, ice, rock };
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (st.wall[ii] === 244) return { air: 300, lava, ice, rock };
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 4) return { air: 300, lava, ice, rock };  // shimmer
      if (st.wall[ii] !== 0) return { air: 300, lava, ice, rock };                              // jungle=false
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) { lava++; return { air: 300, lava, ice, rock }; }
      if (st.flags[ii]) { // 实心：只计数不扩散
        if (ICE_COUNT.has(st.type[ii])) ice++;
        else if (st.type[ii] === STONE) rock++;
      }
      if (!st.flags[ii] || !TILE_DEFS[st.type[ii]]?.solid) {
        air++;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
    }
    return { air, lava, ice, rock };
  };
  for (let i = 0; i < num; i++) {
    // 选点（:17547-17565）：x∈[200,w-200)、y∈[rockLevel+30, h-230)、
    // countTiles∈[50,300) 且 lavaCount==0 && iceCount==0 && rockCount>0（1000 次上限）
    let sx = -1, sy = -1;
    for (let tries = 0; tries < 1000; tries++) {
      const x = rng.nextIntRange(200, st.w - 200);
      const y = rng.nextIntRange(gs.rockLevel + 30, st.h - 230);
      const c = countTiles(x, y);
      if (c.air >= 50 && c.air < 300 && c.lava === 0 && c.ice === 0 && c.rock > 0) { sx = x; sy = y; break; }
    }
    if (sx < 0) continue;
    // 选池（gemCave :9657-9673）：强制 1 种 + 各 1/6 追加（1~7 种）
    const gemOn = new Set<number>([rng.nextInt(6)]);
    for (let k = 0; k < 6; k++) if (rng.nextInt(6) === 0) gemOn.add(k);
    const randGem = () => { let n = rng.nextInt(6); while (!gemOn.has(n)) n = rng.nextInt(6); return n; };
    // randGemTile（:9685-9700）：19/20 石头，1/20 池内宝石
    const randGemTileId = () => (rng.nextInt(20) !== 0 ? STONE : GEM_TILES[randGem()]);
    // Spread.Gem（:3565-3651）1:1 BFS：
    //  实心格（或有墙空气格）→ 不扩散；仅 active 且 Gemmable 时自身+四邻转 randGemTile
    //  （空气+有墙格：if(tile.active()) 内零操作零掷，cs:3599-3619）；
    //  无墙空气格 → 墙 48+池选、1/2 暴露晶簇、四邻入队（神庙/房屋墙阻隔，天然不侵入）
    const seen = new Set<number>();
    let frontier: Array<[number, number]> = [[sx, sy]];
    while (frontier.length) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) continue;
        const ii = st.idx(x, y);
        if (seen.has(ii)) continue;
        seen.add(ii);
        if (st.flags[ii] || st.wall[ii] !== 0) {
          if (!st.flags[ii]) continue;                    // 空气+有墙：零操作零掷
          if (GEMMABLE.has(st.type[ii])) st.type[ii] = randGemTileId();
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (!st.inBounds(nx, ny)) continue;
            const ni = st.idx(nx, ny);
            if (st.flags[ni] && GEMMABLE.has(st.type[ni])) st.type[ni] = randGemTileId();
          }
        } else {
          st.wall[ii] = GEM_WALL_BASE + randGem();
          if (rng.nextInt(2) === 0) placeExposed(st, rng, x, y, randGem());
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const ni = st.idx(x + dx, y + dy);
            if (!seen.has(ni)) next.push([x + dx, y + dy]);
          }
        }
      }
      frontier = next;
    }
  }
}

// ============ ExposedGems 暴露晶簇（:20842-20913） ============
export function runExposedGemsPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 冰系（:20842-20872）：y∈[(ws+rl)/2, lavaLine)、x=逐行雪界 snowMinX/MaxX[y]；
  // 目标格自身为冰块（147/161/162/224）→ 先掷 4 个 Next(1,4) 窗口再掷 Next(12) style
  // （cs:20855-20859 掷序），周边不对称窗口的空气格放晶簇
  for (let i = 0; i < st.w * 0.25; i++) {
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.lavaLine);
    if (y < 0 || y >= st.h) continue;
    const minX = gs.snowMinX?.[y] ?? gs.snowOriginLeft;
    const maxX = gs.snowMaxX?.[y] ?? gs.snowOriginRight;
    if (maxX <= minX) continue;
    const x = rng.nextIntRange(minX, maxX);
    const ii = st.idx(x, y);
    if (!st.flags[ii] || !ICE_FLOOR.has(st.type[ii])) continue;
    const wl = 1 + rng.nextInt(3);
    const wr = 1 + rng.nextInt(3);
    const wt = 1 + rng.nextInt(3);
    const wb = 1 + rng.nextInt(3);
    const style = randGemStyle(rng);
    for (let jx = x - wl; jx < x + wr; jx++) {
      for (let jy = y - wt; jy < y + wb; jy++) {
        if (jx < 40 || jx >= st.w - 40 || jy < 40 || jy >= st.h - 40) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, style);
      }
    }
  }
  // 地下（:20874-20890）：w 次，x∈[20,w-20)、y∈[rockLevel, h-300)，空气+无岩浆+
  // 非地牢墙且墙≠27 → 单格（style=Next(12) 权重）
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.rockLevel, st.h - 300);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) continue;
    const wl = st.wall[ii];
    if (wl === 27 || WALL_DUNGEON.has(wl)) continue;
    placeExposed(st, rng, x, y, randGemStyle(rng));
  }
  // 琥珀（:20891-20913）：w 次，y∈[ws, h-300)，墙 187/216 → 不对称窗口（各 1-3）
  // 的空气格放 style=6 晶簇
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.worldSurface, st.h - 300);
    if (y < 0) continue;
    const wl = st.wall[st.idx(x, y)];
    if (wl !== 187 && wl !== 216) continue;
    const n14 = () => 1 + rng.nextInt(3);
    const al = n14(), ar = n14(), at = n14(), ab = n14();
    for (let jx = x - al; jx < x + ar; jx++) {
      for (let jy = y - at; jy < y + ab; jy++) {
        if (!st.inBounds(jx, jy)) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, 6);
      }
    }
  }
}

// ============ SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282） ============
export function runGemTreesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const f = gs.seedFlags ?? {};
  const alwaysTry = !!(f.tenthAnniversary || f.drunkWorld);
  const oceanDepths = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > st.w - gs.beachDistance;
  };
  const sheetActive = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  const rockFamily = (s: number): boolean =>
    STONE_FAMILY.has(s) || TILE_MOSS.has(s);
  for (let x = 20; x < st.w - 20; x++) {
    for (let y = Math.floor(gs.worldSurface); y < st.h - 20; y++) {
      // 宝石树段（:22208-22237）：掷骰在液体判定之前（短路与求值序 1:1）
      const treeRoll = alwaysTry ? true : rng.nextInt(5) === 0;
      if (treeRoll && st.liquid[st.idx(x, y - 1)] === 0) {
        const treeType = idsByVanillaSheet(583 + rng.nextInt(7)).values().next().value ?? 0;
        if (treeType) growGemTree(st, rng, x, y, treeType);
      }
      // 地下钟乳石（:22239-22262）：非海洋、空格、1/5 → 上下邻石族清坡 + PlaceTight
      if (!oceanDepths(x, y) && !st.flags[st.idx(x, y)] && rng.nextInt(5) === 0) {
        const above = sheetActive(x, y - 1), below = sheetActive(x, y + 1);
        if (rockFamily(above) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y + 1)]) {
          st.slope[st.idx(x, y - 1)] = 0;
        }
        if (rockFamily(below) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 1)]) {
          st.slope[st.idx(x, y + 1)] = 0;
        }
        placeTight(st, rng, x, y);
      }
    }
    // 地表钟乳石（:22264-22278）：k∈[5, worldSurface)；冰上 147/161、沙 25/203 上/下
    for (let k = 5; k < gs.worldSurface; k++) {
      const up = sheetActive(x, k - 1), down = sheetActive(x, k + 1);
      const clearAbove = () => {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k + 1)]) st.slope[st.idx(x, k - 1)] = 0;
      };
      if ((up === 147 || up === 161) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTight(st, rng, x, k);
      }
      if ((up === 25 || up === 203) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTight(st, rng, x, k);
      }
      if ((down === 25 || down === 203) && rng.nextInt(5) === 0) {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k - 1)]) st.slope[st.idx(x, k + 1)] = 0;
        placeTight(st, rng, x, k);
      }
    }
  }
}

