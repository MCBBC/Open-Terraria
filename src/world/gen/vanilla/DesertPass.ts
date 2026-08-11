// 原版 pass 18 "Full Desert" 移植(WorldGen.cs:5525 + GameContent/Biomes/Desert/*)。
// 沙丘:SandMound.Place 1:1——sqrt(1-t⁴) 四次超椭圆剖面 + ±10 双随机游走噪声,
// 中心削平,整柱纯沙(53)填充到 desert2.Bottom(无硬化沙分层——硬化沙只来自蜂巢壳)。
// 蜂巢:DesertHive 场强分层简化(4×2 腔室格阵 cellular 平滑):腔室清空+墙187+化石,
// 壁硬化沙/沙+墙216;入口 33% 竖井。记录 gs.undergroundDesert。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';

const CLOUDS = idsByVanillaSheet(189, 196, 460, 717, 718, 719);

/** SurfaceMap.FromArea（Desert/SurfaceMap.cs 1:1）：全列首实心扫描（云族重置），
 *  Bottom 统计钳到 (int)worldSurface-10，Average=原始均值 */
function surfaceMapFromArea(st: TileStore, startX: number, width: number) {
  const half = Math.floor(st.h / 2);
  const hs = new Int16Array(width);
  let sum = 0, mn = 0x7fffffff, mx = 0;
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    let flag = false, y = half + 50;
    if (x >= 0 && x < st.w) {
      for (let j = 50; j < 50 + half; j++) {
        const ti = st.idx(x, j);
        if (st.flags[ti]) {
          if (CLOUDS.has(st.type[ti])) flag = false;
          else if (!flag) { y = j; flag = true; }
        }
        if (!flag) y = half + 50;
      }
    }
    hs[i] = y; sum += y;
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  }
  const cap = Math.floor(stWorldSurface(st)) - 10;
  if (mx > cap) mx = cap;
  return { heights: hs, average: sum / width, bottom: mx };
}
// GenState 没存 Main.worldSurface 引用——由调用方传 gs；为省参数用模块级钩子
let _wsRef: () => number = () => 300;
function stWorldSurface(_st: TileStore): number { return _wsRef(); }

export interface DesertDesc {
  combX: number; combY: number; combW: number; combH: number;
  hiveTop: number; hiveH: number;
  desertH: number;
  blockCols: number; blockRows: number;
  surface: Int16Array; surfaceX: number;
  surface2: Int16Array; surface2X: number;
}

/** RowHasInvalidTiles（DesertDescription.cs:96-110）：Bottom 行整列查 59/60/161/147 */
function rowHasInvalidTiles(st: TileStore, startX: number, bottomY: number, width: number): boolean {
  for (let i = startX; i < startX + width; i++) {
    if (i < 0 || i >= st.w) continue;
    const t = st.type[st.idx(i, bottomY)];
    if (t === MUD || t === JUNGLE_GRASS || t === ICE || t === SNOW) return true;
  }
  return false;
}

/** DesertDescription.CreateFromPlacement + SandMound.Place（1:1，Sub-A）。
 *  返回 null = 无效（RowHasInvalidTiles 命中）——blockRows 掷骰已消耗（原版语义） */
export function desertPlaceMound(st: TileStore, rng: RNG, x: number, worldSurface: number, skipCheck = false): DesertDesc | null {
  _wsRef = () => worldSurface;
  const { w, h } = st;
  const factor = w / 4200;
  const blockCols = Math.trunc(80 * factor);
  const blockRows = Math.trunc((rng.next() * 0.5 + 1.5) * 170 * factor);
  const width = Math.trunc(4 * blockCols);   // BlockScale.X=4
  const height = Math.trunc(2 * blockRows);  // BlockScale.Y=2
  const ox = x - Math.trunc(width / 2);      // origin.X -= num4/2（int 除）
  const sm = surfaceMapFromArea(st, ox - 5, width + 10);
  if (!skipCheck && rowHasInvalidTiles(st, ox, sm.bottom, width)) return null;
  // num6 = (int)(Average + Bottom) / 2 —— 先截断再 int 除（DesertDescription.cs:81）
  const topY = Math.trunc(sm.average + sm.bottom) / 2 | 0;
  const hiveTop = topY + rng.int(40, 59);    // Next(40,60)
  const desertH = hiveTop + Math.trunc(height / 2) - topY; // Desert.Height（未封顶）
  // ---- SandMound.Place（SandMound.cs 1:1）----
  let moundH = Math.min(desertH, Math.trunc(height / 2));  // min(Desert.Height, Hive.Height/2)
  const moundBottom = topY + moundH;                        // capped desert.Bottom
  const sandBottom = topY + desertH;                        // Desert.Bottom（沙柱底）
  let coarse = 0, fine = 0;
  for (let i = -5; i < width + 5; i++) {
    const cx = ox + i;
    let t = Math.abs((i + 5) / (width + 10)) * 2 - 1;
    t = Math.max(-1, Math.min(1, t));
    if (i % 3 === 0) coarse = Math.max(-10, Math.min(10, coarse + rng.int(-1, 1)));
    fine = Math.max(-10, Math.min(10, fine + rng.int(-1, 1)));
    const profile = Math.sqrt(1 - t * t * t * t);
    const surfY = moundBottom - Math.trunc(profile * moundH) + coarse;
    if (Math.abs(t) < 1 && cx >= 0 && cx < w) {
      // UnclampedSmoothStep=纯线性斜坡（Utils.cs:141-144），再立方——非平滑曲线
      const ramp = (Math.abs(t) - 0.5) / 0.3;
      const val = Math.min(10 + Math.trunc(topY - ramp * ramp * ramp * 20) + fine, surfY);
      const si = Math.max(0, Math.min(sm.heights.length - 1, i + 5)); // Surface[cx]=heights[cx-(ox-5)]
      const jStart = sm.heights[si] - 1;
      for (let j = jStart; j < val; j++) {
        if (j < 0 || j >= h) continue;
        const ti = st.idx(cx, j);
        st.flags[ti] = 0;          // active(false)（type 保留=幽灵，原版语义）
        st.wall[ti] = 0;
      }
    }
    // PlaceSandColumn：从 surfY 填到 sandBottom（沙/清液体/激活；height 可为负→零次）
    for (let y = surfY + (sandBottom - surfY) - 1; y >= surfY; y--) {
      if (y < 0 || y >= h) continue;
      const ti = st.idx(cx, y);
      st.type[ti] = SAND; st.flags[ti] = 1;
      st.liquid[ti] = 0; st.liquidType[ti] = 0;
    }
  }
  // UpdateSurfaceMap（mound 后重扫，入口/Hive 消费）
  const sm2 = surfaceMapFromArea(st, ox - 5, width + 10);
  return {
    combX: ox, combY: topY, combW: width, combH: hiveTop + height - topY,
    hiveTop, hiveH: height, desertH,
    blockCols, blockRows,
    surface: sm.heights, surfaceX: ox - 5,
    surface2: sm2.heights, surface2X: ox - 5,
  };
}

const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const SAND = T.SAND;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;

/** 放置循环 + Description + SandMound（Sub-A；Hive/入口在 runDesertPass 续） */
export function runDesertMoundOnly(st: TileStore, rng: RNG, gs: GenState): DesertDesc {
  const { w } = st;
  const half = Math.floor(w / 2);
  // DesertBiome pass 放置循环（cs:12538-12562 1:1）：失败重掷**永不早退**，
  // 2 次换向后 skipDesertTileCheck 恒过（此前 tries>w/2 早退=可能整图无沙漠）
  let side = gs.dungeonSide, tries = 0, flips = 0, skipCheck = false;
  let num4 = Math.trunc(rng.nextIntRange(0, half) / 8) + Math.trunc(half / 8);
  let x = half + num4 * -side;
  let desc: DesertDesc | null = null;
  for (;;) {
    desc = desertPlaceMound(st, rng, x, gs.worldSurface);
    if (desc) break;
    num4 = Math.trunc(rng.nextIntRange(0, half) / 2) + Math.trunc(half / 8)
      + rng.nextIntRange(0, Math.trunc(tries / 12));
    x = half + num4 * -side;
    if (++tries > Math.floor(w / 4)) {
      side = (-side) as 1 | -1;
      tries = 0;
      if (++flips >= 2) skipCheck = true;
    }
    if (skipCheck) {
      // 恒过：RowHasInvalidTiles 直接 false（GenVars.skipDesertTileCheck 语义）
      desc = desertPlaceMound(st, rng, x, gs.worldSurface, true);
      break;
    }
  }
  return desc!; // skipCheck 后 RowHasInvalidTiles 恒 false → 必非 null
}

export function runDesertPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const desc = runDesertMoundOnly(st, rng, gs);
  // ---- DesertHive(DesertHive.cs 1:1):椭圆散点 → 深度2 DFS 簇 → AttemptClaim 合并
  // 场强 = 各簇内全部块的 Σ1/d²,取前二大簇求和;阈值 3.5/1.8/0.7/0.25 ----
  const cellW = 4, cellH = 2;
  const gw = desc.blockCols, gh = desc.blockRows;
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
  const hiveW = desc.combW, hiveH = desc.hiveH;
  // ---- 场强分层(PlaceClustersArea):±10 窗口判簇(簇首块),簇内求和取前二大 ----
  for (let dx = -20; dx < hiveW + 20; dx++) {
    for (let dy = -20; dy < hiveH + 20; dy++) {
      const px = desc.combX + dx, py = desc.hiveTop + dy;
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
  for (let dx = -20; dx < desc.combW + 20; dx++) {
    for (let dy = -20; dy < hiveH + 20; dy++) {
      const px = desc.combX + dx, py = desc.hiveTop + dy;
      if (!st.inBounds(px, py) || !st.inBounds(px, py + 2)) continue;
      const i = st.idx(px, py);
      if (st.type[i] === SAND && st.flags[i]
        && !(st.isSolid(px, py + 1) && st.isSolid(px, py + 2))) {
        st.type[i] = HARDSAND;
      }
    }
  }

  // ---- 入口（33%，DesertBiome.cs:24-45）：★四种入口待移植（Sub-C），暂用简化竖井
  // 但掷骰结构对齐：NextDouble<=ChanceOfEntrance 后必掷 Next(4) 类型骰（Sub-C 前提）
  if (rng.next() <= 0.3333) {
    const kind = rng.nextIntRange(0, 4); // Chambers/Anthill/LarvaHole/Pit（暂不分支）
    void kind;
    const ex = desc.combX + rng.int(Math.floor(desc.combW * 0.2), Math.floor(desc.combW * 0.8));
    let ey = 0;
    while (ey < h - 2 && !st.flags[st.idx(ex, ey)]) ey++;
    const shaftW = rng.int(0, 3) === 0 ? 8 : 4;
    for (let y = ey - 2; y <= desc.hiveTop + 8; y++) {
      for (let dx = 0; dx < shaftW; dx++) {
        if (!st.inBounds(ex + dx, y)) continue;
        const i = st.idx(ex + dx, y);
        st.type[i] = 0; st.flags[i] = 0;
        st.wall[i] = 187;
      }
    }
  }

  // ExportDescriptionToEngine（DesertBiome.cs:54-58）：CombinedArea.Inflate(10,10)
  gs.undergroundDesert = {
    x0: Math.max(0, desc.combX - 10), y0: Math.max(0, desc.combY - 10),
    x1: Math.min(w, desc.combX + desc.combW + 10),
    y1: Math.min(h, desc.combY + desc.combH + 10),
  };
}

