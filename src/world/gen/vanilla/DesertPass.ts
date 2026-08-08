// 原版 pass 18 "Full Desert" 移植(WorldGen.cs:5525 + GameContent/Biomes/Desert/*)。
// 沙丘:SandMound.Place 1:1——sqrt(1-t⁴) 四次超椭圆剖面 + ±10 双随机游走噪声,
// 中心削平,整柱纯沙(53)填充到 desert2.Bottom(无硬化沙分层——硬化沙只来自蜂巢壳)。
// 蜂巢:DesertHive 场强分层简化(4×2 腔室格阵 cellular 平滑):腔室清空+墙187+化石,
// 壁硬化沙/沙+墙216;入口 33% 竖井。记录 gs.undergroundDesert。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const SAND = T.SAND;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;

export function runDesertPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const factor = w / 4200;
  // 沙漠 X(地牢异侧):x = w/2 + (rand(w/2)/8 + w/16) * -dungeonSide
  const half = Math.floor(w / 2);
  let num2 = 0, side = gs.dungeonSide, tries = 0;
  let x = 0;
  for (;;) {
    const off = Math.floor(rng.next() * half / 8) + Math.floor(half / 8);
    x = half + off * -side;
    if (++tries > Math.floor(w / 4)) { side = -side as 1 | -1; tries = 0; if (++num2 >= 2) break; }
    if (rowIsValid(st, x, factor)) break;
    if (tries > Math.floor(w / 2)) break;
  }

  // DesertDescription.CreateFromPlacement
  const blockCols = Math.max(16, Math.floor(80 * factor));
  const blockRows = Math.max(40, Math.floor((rng.next() + 1) * 170 * factor));
  const width = Math.min(w - 20, Math.floor(4 * blockCols));
  const ox = Math.max(10, Math.min(w - 10 - width, x - Math.floor(width / 2)));
  // SurfaceMap:平均/最底(钳到 worldSurface-10)
  let surfSum = 0, surfMax = 0, count = 0;
  for (let i = ox; i < ox + width; i += 4) {
    let y = 0;
    while (y < h - 2 && !st.flags[st.idx(i, y)]) y++;
    surfSum += y; surfMax = Math.max(surfMax, y); count++;
  }
  const avg = surfSum / Math.max(1, count);
  const topY = Math.floor((avg + surfMax) / 2);
  const hiveTop = topY + rng.int(40, 59);
  const hiveHeight = Math.floor(2 * blockRows);
  const hiveBottom = Math.min(h - 2, hiveTop + hiveHeight);
  const desertBottom = hiveTop + Math.floor((hiveBottom - hiveTop) / 2);

  // ---- SandMound.Place 1:1 ----
  const moundH = Math.floor((hiveBottom - hiveTop) / 2);
  let coarse = 0, fine = 0; // ±10 双随机游走
  for (let dx = -5; dx < width + 5; dx++) {
    const cx = ox + dx;
    if (cx < 0 || cx >= w) continue;
    const t = Math.max(-1, Math.min(1, Math.abs((dx + 5) / (width + 10)) * 2 - 1));
    if (dx % 3 === 0) coarse = Math.max(-10, Math.min(10, coarse + rng.int(-1, 1)));
    fine = Math.max(-10, Math.min(10, fine + rng.int(-1, 1)));
    const profile = Math.sqrt(1 - Math.pow(t, 4));
    const moundSurfY = (topY + moundH) - Math.floor(profile * moundH) + coarse;
    // 中心削平/边缘抬升(SmoothStep(0.5,0.8,|t|)³)
    if (Math.abs(t) < 1) {
      const s = Math.max(0, Math.min(1, (Math.abs(t) - 0.5) / 0.3));
      const ss = s * s * (3 - 2 * s);
      const flatten = Math.min(10 + Math.floor((topY - Math.pow(ss, 3) * 20)) + fine, moundSurfY);
      // 从地表上一格清到 flatten(削掉沙丘上方突出物)
      let sy = 0;
      while (sy < h - 2 && !st.flags[st.idx(cx, sy)]) sy++;
      for (let y = sy - 1; y < flatten && y >= 0; y++) {
        const i = st.idx(cx, y);
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 0;
      }
    }
    // 纯沙柱:从 moundSurfY 填到 hiveBottom(整柱)
    for (let y = moundSurfY; y < hiveBottom; y++) {
      if (y < 0 || y >= h) continue;
      const i = st.idx(cx, y);
      st.type[i] = SAND; st.flags[i] = 1;
      st.liquid[i] = 0; st.liquidType[i] = 0;
    }
  }

  // ---- DesertHive(场强分层的格阵简化)----
  const cellW = 4, cellH = 2;
  const cols = Math.floor(width / cellW);
  const rows = Math.max(4, Math.floor((hiveBottom - hiveTop) / cellH));
  const grid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid[r * cols + c] = rng.next() < 0.52 ? 1 : 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(grid);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && grid[rr * cols + cc]) n++;
        }
        next[r * cols + c] = n >= 5 ? 1 : n <= 3 ? 0 : grid[r * cols + c];
      }
    }
    grid.set(next);
  }
  let clusterIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = ox + c * cellW, y0 = hiveTop + r * cellH;
      const chamber = grid[r * cols + c] === 1;
      clusterIdx++;
      for (let dx = 0; dx < cellW && x0 + dx < ox + width; dx++) {
        for (let dy = 0; dy < cellH && y0 + dy < hiveBottom; dy++) {
          if (!st.inBounds(x0 + dx, y0 + dy)) continue;
          const i = st.idx(x0 + dx, y0 + dy);
          if (chamber) {
            st.type[i] = 0; st.flags[i] = 0;
            st.wall[i] = 187;
            // 每 15 簇第 2 个 → 化石点缀
            if (clusterIdx % 15 === 2) { st.flags[i] = 1; st.type[i] = FOSSIL; }
          } else {
            const border = c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
            st.flags[i] = 1;
            st.type[i] = border ? SANDSTONE : (rng.next() < 1 / 3 ? HARDSAND : SAND);
            st.wall[i] = 216;
          }
        }
      }
    }
  }

  // ---- 入口(33%):竖井通到蜂巢顶(原版四种入口的简化)----
  if (rng.next() <= 0.3333) {
    const ex = ox + rng.int(Math.floor(width * 0.2), Math.floor(width * 0.8));
    let ey = 0;
    while (ey < h - 2 && !st.flags[st.idx(ex, ey)]) ey++;
    const shaftW = rng.int(0, 3) === 0 ? 8 : 4;
    for (let y = ey - 2; y <= hiveTop + 8; y++) {
      for (let dx = 0; dx < shaftW; dx++) {
        if (!st.inBounds(ex + dx, y)) continue;
        const i = st.idx(ex + dx, y);
        st.type[i] = 0; st.flags[i] = 0;
        st.wall[i] = 187;
      }
    }
  }

  gs.undergroundDesert = {
    x0: Math.max(0, ox - 10), y0: Math.max(0, topY - 10),
    x1: Math.min(w, ox + width + 10), y1: Math.min(h, hiveBottom + 10),
  };
}

function rowIsValid(st: TileStore, x: number, factor: number): boolean {
  const width = Math.floor(320 * factor);
  const x0 = Math.max(1, x - Math.floor(width / 2));
  let y = 0;
  while (y < st.h - 2 && !st.flags[st.idx(x, y)]) y++;
  y = Math.min(st.h - 2, y + 2);
  for (let i = x0; i < Math.min(st.w - 1, x0 + width); i++) {
    const t = st.type[st.idx(i, y)];
    if (t === MUD || t === JUNGLE_GRASS || t === SNOW || t === ICE) return false;
  }
  return true;
}
