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
  // DesertDescription.cs:53：(NextDouble()*0.5+1.5)*170*factor → 深度范围 255-340·factor。
  // 曾误写 (next+1)*170 → 范围 170-340，最浅时蜂巢只有原版 2/3 深
  const blockRows = Math.max(40, Math.floor((rng.next() * 0.5 + 1.5) * 170 * factor));
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

  // ---- DesertHive(DesertHive.cs 1:1):椭圆散点 → 深度2 DFS 簇 → AttemptClaim 合并
  // 场强 = 各簇内全部块的 Σ1/d²,取前二大簇求和;阈值 3.5/1.8/0.7/0.25 ----
  const cellW = 4, cellH = 2;
  const gw = blockCols, gh = blockRows;
  // 1) 椭圆掩码 50% 散点(ClusterGroup.Generate)
  const blockMap: boolean[][] = [];
  for (let c = 0; c < gw; c++) blockMap.push(new Array(gh).fill(false));
  {
    const num1 = Math.floor(gw / 2) - 1, y1 = Math.max(1, Math.floor(gh / 2) - 1);
    const num2 = (num1 + 1) * (num1 + 1);
    for (let r = 0; r < gh; r++) {
      const num3 = (num1 / y1) * (r - y1);
      const num4 = Math.min(num1, Math.floor(Math.sqrt(Math.max(0, num2 - num3 * num3))));
      for (let c = num1 - num4; c <= num1 + num4; c++) {
        if (c < 0 || c >= gw) continue;
        blockMap[c][r] = rng.int(0, 1) === 0;
      }
    }
  }
  // 2) 深度 2 DFS 搜簇(起点再过 50%),>2 点保留
  const pointClusters: Array<Array<[number, number]>> = [];
  {
    const dfs = (x: number, y: number, level: number, out: Array<[number, number]>) => {
      out.push([x, y]);
      blockMap[x][y] = false;
      level--;
      if (level === -1) return;
      if (x > 0 && blockMap[x - 1][y]) dfs(x - 1, y, level, out);
      if (x < gw - 1 && blockMap[x + 1][y]) dfs(x + 1, y, level, out);
      if (y > 0 && blockMap[x][y - 1]) dfs(x, y - 1, level, out);
      if (y < gh - 1 && blockMap[x][y + 1]) dfs(x, y + 1, level, out);
    };
    for (let x = 0; x < gw; x++) {
      for (let y = 0; y < gh; y++) {
        if (blockMap[x][y] && rng.int(0, 1) === 0) {
          const pc: Array<[number, number]> = [];
          dfs(x, y, 2, pc);
          if (pc.length > 2) pointClusters.push(pc);
        }
      }
    }
  }
  // 3) 索引图 + AttemptClaim:邻簇随机整体并入或删除
  const idxMap: number[][] = [];
  for (let c = 0; c < gw; c++) idxMap.push(new Array(gh).fill(-1));
  pointClusters.forEach((pc, i) => { for (const [px, py] of pc) idxMap[px][py] = i; });
  for (let i = 0; i < pointClusters.length; i++) {
    for (const [px, py] of pointClusters[i]) {
      if (idxMap[px][py] === -1) break;
      const ci = idxMap[px][py];
      const claim = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
        const other = idxMap[nx][ny];
        if (other === -1 || other === ci) return;
        const val = rng.int(0, 1) === 0 ? -1 : ci;
        for (const [qx, qy] of pointClusters[other]) idxMap[qx][qy] = val;
      };
      claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
    }
  }
  // 4) 重组成簇,<4 点丢弃;块坐标 ±0.25 抖动
  const clusters: Array<Array<[number, number]>> = pointClusters.map(() => []);
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) {
      if (idxMap[x][y] !== -1) clusters[idxMap[x][y]].push([x, y]);
    }
  }
  const finalClusters: Array<Array<[number, number]>> = [];
  for (const cl of clusters) {
    if (cl.length < 4) continue;
    finalClusters.push(cl.map(([bx, by]) => [
      bx + (rng.next() - 0.5) * 0.5, by + (rng.next() - 0.5) * 0.5,
    ] as [number, number]));
  }
  const hiveW = width, hiveH = hiveBottom - hiveTop;
  // ---- 场强分层(PlaceClustersArea):±10 窗口判簇(簇首块),簇内求和取前二大 ----
  for (let dx = -20; dx < hiveW + 20; dx++) {
    for (let dy = -20; dy < hiveH + 20; dy++) {
      const px = ox + dx, py = hiveTop + dy;
      if (!st.inBounds(px, py)) continue;
      let shellType: number = SAND;
      if (rng.int(0, 2) === 0) shellType = HARDSAND;
      const vx = dx / cellW - 0.5, vy = dy / cellH - 0.5;
      let m1 = 0, m2 = 0, m1Idx = -1;
      for (let ci = 0; ci < finalClusters.length; ci++) {
        const c0 = finalClusters[ci][0];
        if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
        let f = 0;
        for (const [bx, by] of finalClusters[ci]) {
          const ddx = bx - vx, ddy = by - vy;
          f += 1 / (ddx * ddx + ddy * ddy);
        }
        if (f > m1) { if (m1 > m2) m2 = m1; m1 = f; m1Idx = ci; }
        else if (f > m2) m2 = f;
      }
      const field = m1 + m2;
      const ex = (dx / hiveW) * 2 - 1, ey = (dy / hiveH) * 2 - 1;
      const isEdge = Math.hypot(ex, ey) >= 0.8;
      const i = st.idx(px, py);
      if (field > 3.5) {
        // 腔室:清空 + 墙187;获胜簇索引 %15==2 → 化石(确定性判定)
        st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
        st.wall[i] = 187;
        if (m1Idx % 15 === 2) { st.type[i] = FOSSIL; st.flags[i] = 1; }
      } else if (field > 1.8) {
        // 隧道带:墙187 + 沙岩;地表以下注岩浆
        st.wall[i] = 187;
        if (py < gs.worldSurface) { st.liquid[i] = 0; st.liquidType[i] = 0; }
        else st.liquidType[i] = 2;
        if (!isEdge || st.flags[i]) { st.type[i] = SANDSTONE; st.flags[i] = 1; }
      } else if (field > 0.7 || !isEdge) {
        // 硬化沙壳:墙216 + 沙/硬化沙(1/3)
        st.wall[i] = 216;
        st.liquid[i] = 0; st.liquidType[i] = 0;
        if (!isEdge || st.flags[i]) { st.type[i] = shellType; st.flags[i] = 1; }
      } else if (field > 0.25 && rng.next() < (field - 0.25) / 0.45) {
        // 隧道外缘噪声
        st.wall[i] = 187;
        if (py < gs.worldSurface) { st.liquid[i] = 0; st.liquidType[i] = 0; }
        else st.liquidType[i] = 2;
        if (st.flags[i]) { st.type[i] = shellType; st.flags[i] = 1; }
      }
    }
  }
  // ---- AddTileVariance:沙 53 下方 2 格非实心 → 酥化为 397(装饰 485/484/165/187 略)----
  for (let dx = -20; dx < width + 20; dx++) {
    for (let dy = -20; dy < hiveH + 20; dy++) {
      const px = ox + dx, py = hiveTop + dy;
      if (!st.inBounds(px, py) || !st.inBounds(px, py + 2)) continue;
      const i = st.idx(px, py);
      if (st.type[i] === SAND && st.flags[i]
        && !(st.isSolid(px, py + 1) && st.isSolid(px, py + 2))) {
        st.type[i] = HARDSAND;
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
