// 宝石系统世界生成（1.4.5.6 1:1）：
// - GemCaves 宝石洞（WorldGen.cs:17528-17572 选点 + gemCave :9657-9673 选池 +
//   Spread.Gem :3565-3651 BFS 漫洞：实心 Gemmable 19:1 石:宝、空气格宝石墙 48-53、
//   1/2 暴露晶簇 178）
// - ExposedGems 暴露晶簇（冰系 :20842-20872 / 地下 :20874-20890 / 琥珀沙漠 :20891-20913）
// - SpeleothemsAndGemTrees 宝石树（:22196-22282：全列扫描 j∈[ws,h-20)，上方无液体 1/5 →
//   7 选 1 均匀 → growGemTree，GroundTest=石/苔 + WallTest=洞穴墙）
import { TILE } from '../../../core/constants';
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_BY_KEY } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { growGemTree } from './TreePass';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;   // tile 178
const STONE = TILE_BY_KEY['stone']!;
/** Gemmable（WorldGen.cs:3762-3769）：泥/石/沙/雪/泥/蘑菇草/雪砖/冰 */
const GEMMABLE = idsByVanillaSheet(1, 40, 59, 60, 70, 147, 161);
/** 冰系落脚（:20846）：雪/冰/薄冰/雪砖 */
const ICE_FLOOR = idsByVanillaSheet(147, 161, 162, 224);
/** 宝石墙（WallID.cs:165-175）：AmethystUnsafe=48 … DiamondUnsafe=53（=48+序号） */
const GEM_WALL_BASE = 48;

/** 暴露晶簇 style 权重（:20857-20859 / PlaceTile randGem 序）：紫 3/黄 3/蓝 2/翠 2/红 1/钻 1（共 12） */
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

// ============ GemCaves 宝石洞（:17528-17572 + Spread.Gem） ============
export function runGemCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const num = Math.floor(st.w * 0.003);
  for (let i = 0; i < num; i++) {
    // 选点（:17547-17565）：x∈[200,w-200]、y∈[rockLevel+30, h-230]、
    // countTiles∈[50,300) 且无岩浆/冰/有岩石（1000 次上限）
    let sx = -1, sy = -1;
    for (let tries = 0; tries < 1000; tries++) {
      const x = rng.nextIntRange(200, st.w - 201);
      const y = rng.nextIntRange(gs.rockLevel + 30, st.h - 231);
      let count = 0, hasRock = false, bad = false;
      for (let dy = -4; dy <= 4 && !bad; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const ii = st.idx(x + dx, y + dy);
          if (!st.flags[ii]) { count++; continue; }           // 空气
          if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) { bad = true; break; } // 岩浆
          const t = st.type[ii];
          if (ICE_FLOOR.has(t)) { bad = true; break; }
          if (t === STONE) hasRock = true;
        }
      }
      if (!bad && count >= 50 && count < 300 && hasRock) { sx = x; sy = y; break; }
    }
    if (sx < 0) continue;
    // 选池（gemCave :9657-9673）：强制 1 种 + 各 1/6 追加（1~7 种）
    const pool: number[] = [rng.nextInt(6)];
    for (let k = 0; k < 6; k++) {
      if (pool.length >= 7) break;
      if (rng.nextInt(6) === 0) pool.push(k);
    }
    // Spread.Gem BFS（:3565-3651 形态近似）：从种子随机游走扩洞，预算 ~200 格；
    // 实心 Gemmable → 19/20 石头 / 1/20 宝石（池内随机），四邻同样处理；
    // 空气格 → 墙 = 48+池内序、1/2 暴露晶簇
    let cx = sx, cy = sy;
    for (let step = 0; step < 200; step++) {
      const gem = pool[rng.nextInt(pool.length)];
      const gemTileId = [67, 66, 63, 65, 64, 68][gem];
      const conv = (x: number, y: number) => {
        if (!st.inBounds(x, y)) return;
        const ii = st.idx(x, y);
        if (st.flags[ii]) {
          // 实心 Gemmable（:9685-9700）：19/20 石(1) / 1/20 宝石
          if (GEMMABLE.has(st.type[ii])) {
            st.setTile(x, y, rng.nextInt(20) === 0 ? gemTileId : STONE, 0, 0);
            st.setWall(x, y, 0);
          }
        } else {
          // 空气（:3623-3627）：宝石墙 + 1/2 暴露晶簇
          st.setWall(x, y, GEM_WALL_BASE + gem);
          if (rng.nextInt(2) === 0) placeExposed(st, x, y, gem);
        }
      };
      conv(cx, cy);
      conv(cx - 1, cy); conv(cx + 1, cy); conv(cx, cy - 1); conv(cx, cy + 1);
      // 随机游走（原版 BFS 邻居扩散的同构近似）
      const dir = rng.nextInt(4);
      cx += [1, -1, 0, 0][dir];
      cy += [0, 0, 1, -1][dir];
      cx = Math.max(2, Math.min(st.w - 3, cx));
      cy = Math.max(gs.rockLevel, Math.min(st.h - 60, cy));
    }
  }
}

// ============ ExposedGems 暴露晶簇（:20842-20913） ============
export function runExposedGemsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const lavaLine = gs.lavaLine || st.h - 200;
  // 冰系（:20842-20872）：w*0.25 次，y∈[(ws+rl)/2, lavaLine]，雪区列内；
  // 落在雪/冰/薄冰/雪砖(147/161/162/224)上 → 1~3×1~3 随机 style 晶簇
  for (let i = 0; i < st.w * 0.25; i++) {
    const x = rng.nextIntRange(gs.snowOriginLeft, Math.max(gs.snowOriginLeft + 1, gs.snowOriginRight - 1));
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), Math.max(1, lavaLine - 1));
    if (!st.inBounds(x, y)) continue;
    const below = st.idx(x, y + 1);
    if (!st.flags[below] || !ICE_FLOOR.has(st.type[below])) continue;
    const style = randGemStyle(rng);
    const w = 1 + rng.nextInt(3), h = 1 + rng.nextInt(3);
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const ii = st.idx(x + dx, y - dy);
        if (!st.flags[ii]) placeExposed(st, x + dx, y - dy, style);
      }
    }
  }
  // 地下（:20874-20890）：w 次，y∈[rockLevel, h-300]，空气+无岩浆+非地牢墙且墙≠27 → 单格
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(4, st.w - 5);
    const y = rng.nextIntRange(gs.rockLevel, st.h - 301);
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0) continue;
    const wl = st.wall[ii];
    if (wl === 27 || (wl >= 7 && wl <= 9) || (wl >= 94 && wl <= 99)) continue; // 地牢墙
    placeExposed(st, x, y, randGemStyle(rng));
  }
  // 琥珀（:20891-20913）：w 次，y∈[ws, h-300]，墙 187(沙岩)/216(硬化沙) → 3×3 style=6 晶簇
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(4, st.w - 5);
    const y = rng.nextIntRange(gs.worldSurface, st.h - 301);
    const wl = st.wall[st.idx(x, y)];
    if (wl !== 187 && wl !== 216) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const ii = st.idx(x + dx, y + dy);
        if (!st.flags[ii]) placeExposed(st, x + dx, y + dy, 6);
      }
    }
  }
}

// ============ SpeleothemsAndGemTrees 宝石树（:22196-22282） ============
export function runGemTreesPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // 全列扫描 j∈[worldSurface, h-20)（:22208-22210）：上方无液体 + 1/5 → 7 选 1 尝试
  // （tenthAnniversary/drunkWorld 恒尝试——特殊种子未实现略）
  for (let x = 4; x < st.w - 4; x++) {
    for (let y = _gs.worldSurface; y < st.h - 20; y++) {
      if (st.liquid[st.idx(x, y - 1)] !== 0) continue;
      if (rng.nextInt(5) !== 0) continue;
      // 树种 7 选 1（:22212-22237）：583..589 均匀
      const kind = rng.nextInt(7);
      const treeType = idsByVanillaSheet(583 + kind).values().next().value ?? 0;
      if (!treeType) continue;
      growGemTree(st, rng, x, y, treeType);
    }
  }
}
