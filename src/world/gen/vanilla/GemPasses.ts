// 宝石系统世界生成（1.4.5.6 1:1）：
// - GemCaves 宝石洞（WorldGen.cs:17528-17572 选点 + gemCave :9657-9673 选池 +
//   Spread.Gem :3565-3651 BFS：**只沿无墙空气腔扩散**（有墙格不扩散——神庙/房屋
//   天然免疫），实心 Gemmable 自身+四邻 randGemTile（19:1 石:宝），无墙空气格
//   墙=48+池选、1/2 暴露晶簇）
// - ExposedGems 暴露晶簇（冰系 :20842-20872 目标格自身为冰块 147/161/162/224，
//   周边不对称窗口 1-3、逐行雪界 snowMinX/MaxX；地下 :20874-20890 单格空气
//   排除地牢墙/墙27；琥珀 :20891-20913 墙 187/216 不对称窗口）
// - SpeleothemsAndGemTrees 宝石树（:22196-22282：全列扫描 j∈[ws,h-20)，上方无液体
//   1/5 → 7 选 1 均匀 → growGemTree，GroundTest=石/苔 + WallTest=洞穴墙）
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_BY_KEY } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { growGemTree } from './TreePass';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;   // tile 178
const STONE = TILE_BY_KEY['stone']!;
/** Gemmable（WorldGen.cs:3762-3769）：石/沙/雪/泥/蘑菇草/雪砖/冰 */
const GEMMABLE = idsByVanillaSheet(1, 40, 59, 60, 70, 147, 161);
/** 冰系落脚（:20846）：雪砖/冰/薄冰/雪 147/161/162/224 */
const ICE_FLOOR = idsByVanillaSheet(147, 161, 162, 224);
/** 宝石墙（WallID.cs:165-175）：AmethystUnsafe=48 … DiamondUnsafe=53（=48+序号）。
 *  序号 0-5 = 紫/黄/蓝/翠/红/钻（与 randGem/暴露晶簇 style 同序） */
const GEM_WALL_BASE = 48;
/** 宝石矿 tile 内部 id（序号同上） */
const GEM_TILES = ['gem_amethyst', 'gem_topaz', 'gem_sapphire', 'gem_emerald', 'gem_ruby', 'gem_diamond']
  .map((k) => TILE_BY_KEY[k]!);
/** 地牢墙（Main.wallDungeon）：7/8/9 + 94-99 */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

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

/** 放 1 格暴露晶簇（style 帧 = style*18） */
function placeExposed(st: TileStore, x: number, y: number, style: number): void {
  st.setTile(x, y, EXPOSED, style * 18, 0);
}

// ============ GemCaves 宝石洞（:17528-17572 + gemCave + Spread.Gem 1:1） ============
export function runGemCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const num = Math.floor(st.w * 0.003);
  // countTiles（WorldGen.cs:9493）：洪泛连通空气计数（上限停），实心格不扩散——
  // lavaCount/iceCount/rockCount 只计数
  const countTiles = (sx: number, sy: number) => {
    let air = 0, lava = 0, ice = 0, rock = 0;
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length && air <= 301) {
      const [x, y] = stack.pop()!;
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) return { air: 9999, lava, ice, rock };
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (st.flags[ii]) { // 实心：只计数不扩散
        if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) lava++;
        else if (ICE_FLOOR.has(st.type[ii])) ice++;
        else if (st.type[ii] === STONE) rock++;
        continue;
      }
      air++;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return { air, lava, ice, rock };
  };
  for (let i = 0; i < num; i++) {
    // 选点（:17547-17565）：x∈[200,w-200]、y∈[rockLevel+30, h-230]、
    // countTiles∈[50,300) 且 lavaCount==0 && iceCount==0 && rockCount>0（1000 次上限）
    let sx = -1, sy = -1;
    for (let tries = 0; tries < 1000; tries++) {
      const x = rng.nextIntRange(200, st.w - 201);
      const y = rng.nextIntRange(gs.rockLevel + 30, st.h - 231);
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
    //  实心格（或有墙空气格）→ 不扩散；active 且 Gemmable 自身+四邻转 randGemTile；
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
          if (st.flags[ii] && GEMMABLE.has(st.type[ii])) st.type[ii] = randGemTileId();
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (!st.inBounds(nx, ny)) continue;
            const ni = st.idx(nx, ny);
            if (st.flags[ni] && GEMMABLE.has(st.type[ni])) st.type[ni] = randGemTileId();
          }
        } else {
          st.wall[ii] = GEM_WALL_BASE + randGem();
          if (rng.nextInt(2) === 0) placeExposed(st, x, y, randGem());
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
  // 目标格自身为冰块（147/161/162/224）→ 周边不对称窗口（四向各 1-3）的空气格放晶簇
  for (let i = 0; i < st.w * 0.25; i++) {
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), (gs.lavaLine || st.h - 200) - 1);
    if (y < 0 || y >= st.h) continue;
    const minX = gs.snowMinX?.[y] ?? gs.snowOriginLeft;
    const maxX = gs.snowMaxX?.[y] ?? gs.snowOriginRight;
    if (maxX <= minX) continue;
    const x = rng.nextIntRange(minX, maxX - 1);
    const ii = st.idx(x, y);
    if (!st.flags[ii] || !ICE_FLOOR.has(st.type[ii])) continue;
    const style = randGemStyle(rng);
    // Next(1,4)：四向各 1-3（不对称窗口）
    const n14 = () => 1 + rng.nextInt(3);
    const wl = n14(), wr = n14(), wt = n14(), wb = n14();
    for (let jx = x - wl; jx < x + wr; jx++) {
      for (let jy = y - wt; jy < y + wb; jy++) {
        if (jx < 40 || jx >= st.w - 40 || jy < 40 || jy >= st.h - 40) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, jx, jy, style);
      }
    }
  }
  // 地下（:20874-20890）：w 次，x∈[20,w-20]、y∈[rockLevel, h-300]，空气+无岩浆+
  // 非地牢墙且墙≠27 → 单格（style=Next(12) 权重）
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 21);
    const y = rng.nextIntRange(gs.rockLevel, st.h - 301);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) continue;
    const wl = st.wall[ii];
    if (wl === 27 || WALL_DUNGEON.has(wl)) continue;
    placeExposed(st, x, y, randGemStyle(rng));
  }
  // 琥珀（:20891-20913）：w 次，y∈[ws, h-300]，墙 187/216 → 不对称窗口（各 1-3）
  // 的空气格放 style=6 晶簇
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 21);
    const y = rng.nextIntRange(gs.worldSurface, st.h - 301);
    if (y < 0) continue;
    const wl = st.wall[st.idx(x, y)];
    if (wl !== 187 && wl !== 216) continue;
    const n14 = () => 1 + rng.nextInt(3);
    const al = n14(), ar = n14(), at = n14(), ab = n14();
    for (let jx = x - al; jx < x + ar; jx++) {
      for (let jy = y - at; jy < y + ab; jy++) {
        if (!st.inBounds(jx, jy)) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, jx, jy, 6);
      }
    }
  }
}

// ============ SpeleothemsAndGemTrees 宝石树（:22196-22282） ============
export function runGemTreesPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // 全列扫描 j∈[worldSurface, h-20)（:22208-22210）：上方无液体 + 1/5 → 7 选 1 尝试
  // （tenthAnniversary/drunkWorld 恒尝试——seedFlags 灌入已接；金标种子旗标恒空。
  // 测试/旧调用方可能不带 seedFlags，判空兜底）
  const f = _gs.seedFlags ?? {};
  const alwaysTry = !!(f.tenthAnniversary || f.drunkWorld);
  for (let x = 4; x < st.w - 4; x++) {
    for (let y = _gs.worldSurface; y < st.h - 20; y++) {
      if (st.liquid[st.idx(x, y - 1)] !== 0) continue;
      if (!alwaysTry && rng.nextInt(5) !== 0) continue;
      // 树种 7 选 1（:22212-22237）：583..589 均匀
      const treeType = idsByVanillaSheet(583 + rng.nextInt(7)).values().next().value ?? 0;
      if (!treeType) continue;
      growGemTree(st, rng, x, y, treeType);
    }
  }
}
