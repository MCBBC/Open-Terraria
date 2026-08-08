// 蜂巢(pass 45,HiveBiome.cs 1:1)+ 蜘蛛巢(WorldGen.cs:8138 Spread.Spider 1:1)。
// 蜂巢:主巢+卫星巢+隧道链(每巢各不相同);剖面=核心40%蜂蜜/0.6墙86空腔/0.75实心蜂壳;
// 链终点幼虫托台(BOSS 房)。蜘蛛巢:洪泛既有洞穴刷墙62,9/10 蛛网密度(Webs pass)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';

const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUDT = TILE_BY_KEY['mud']!;

/** CreateHiveTunnel(HiveBiome.cs:117)1:1:基础半径 12-20,步数 10-20,方向±2 随机游走 */
function hiveTunnel(st: TileStore, rng: RNG, sx: number, sy: number): [number, number] {
  const baseR = rng.int(12, 20);
  const steps = rng.int(10, 20);
  let vx = rng.int(-10, 10) * 0.2, vy = rng.int(-10, 10) * 0.2;
  let px = sx + 0.0, py = sy + 0.0;
  for (let k = 0; k < steps; k++) {
    const r = baseR * (1 + rng.int(-20, 19) * 0.01);
    const x0 = Math.floor(px - r), x1 = Math.floor(px + r);
    const y0 = Math.floor(py - r), y1 = Math.floor(py + r);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (!st.inBounds(x, y)) continue;
        const d = Math.hypot(x - px, y - py) * (1 + rng.int(-10, 10) * 0.005);
        const i = st.idx(x, y);
        if (d < r * 0.4) {
          st.flags[i] = 0;
          st.wall[i] = 86;
          if (rng.next() < 1 / 3) { st.liquid[i] = 255; st.liquidType[i] = 3; }
        } else if (d < r * 0.75) {
          st.liquid[i] = 0;
          if (st.wall[i] !== 86) { st.type[i] = HIVE; st.flags[i] = 1; }
        }
        if (d < r * 0.6) st.wall[i] = 86;
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    vx = Math.max(-2.5, Math.min(2.5, vx));
    vy = Math.max(-2.5, Math.min(2.5, vy));
    if (py > st.h - 250 || px < 50 || px > st.w - 50) break;
  }
  return [px, py];
}

/** Hives(pass 45):1+Next(5s,8s) 个主巢(每巢隧道链+幼虫托台)+卫星巢 */
export function runBeehivePass(st: TileStore, rng: RNG, gs: GenState): void {
  const s = st.w / 4200;
  const count = 1 + rng.int(Math.floor(5 * s), Math.max(Math.floor(5 * s) + 1, Math.floor(8 * s)) - 1);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  let placed = 0;
  for (let n = 0; n < count * 100 && placed < count; n++) {
    const x = rng.int(20, st.w - 301);
    const y = rng.int(yMin, st.h - 21);
    if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) continue;
    // 周边 ≥40% 丛林草/泥才落巢(原版 75% 丛林草)
    let jungle = 0, solid = 0;
    for (let dx = -15; dx <= 15; dx += 2) {
      for (let dy = -15; dy <= 15; dy += 2) {
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        if (!st.flags[i]) continue;
        solid++;
        if (st.type[i] === JUNGLE_GRASS || st.type[i] === MUDT) jungle++;
      }
    }
    if (solid < 5 || jungle / solid < 0.4) continue;
    // 隧道链:2-4 段 × 每段 2-4 条(每巢形状各不相同的来源)
    let px = x + 0.0, py = y + 0.0;
    const segs = rng.int(2, 4);
    for (let seg = 0; seg < segs; seg++) {
      const tunnels = rng.int(2, 4);
      for (let t = 0; t < tunnels; t++) {
        [px, py] = hiveTunnel(st, rng, px, py);
      }
    }
    // 幼虫托台(BOSS 房):链终点 3 宽清空+蜂巢地板
    const lx = Math.floor(px), ly = Math.floor(py);
    if (st.inBounds(lx, ly + 1)) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -2; dy <= 0; dy++) {
          if (!st.inBounds(lx + dx, ly + dy)) continue;
          const i = st.idx(lx + dx, ly + dy);
          st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 86;
        }
        const bi = st.idx(lx + dx, ly + 1);
        st.type[bi] = HIVE; st.flags[bi] = 1;
      }
    }
    // 卫星巢(0-4 个,半径 30-90)
    const sats = rng.int(0, 4);
    for (let k = 0; k < sats; k++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = 30 + rng.next() * 60;
      const sx2 = Math.floor(x + Math.cos(ang) * rad);
      const sy2 = Math.floor(y + Math.sin(ang) * rad * 0.6);
      if (!st.inBounds(sx2, sy2) || !st.flags[st.idx(sx2, sy2)]) continue;
      hiveTunnel(st, rng, sx2, sy2);
    }
    placed++;
  }
}

/** Spider Caves(WorldGen.cs:8138):w*0.005 个,洪泛既有洞穴(≥100 格)刷墙 62+蛛网 */
export function runSpiderNestPass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.floor(st.w * 0.005);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  let placed = 0;
  for (let n = 0; n < count * 60 && placed < count; n++) {
    const x = rng.int(200, st.w - 201);
    const y = rng.int(yMin, st.h - 231);
    if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) continue;
    // 洪泛既有洞穴(上限 3500):只沿非实心且无墙蔓延——巢形=天然洞穴形状
    const seen = new Set<number>();
    const q: Array<[number, number]> = [[x, y]];
    const cavity: Array<[number, number]> = [];
    while (q.length && cavity.length < 3500) {
      const [cx, cy] = q.pop()!;
      const key = cx * 100000 + cy;
      if (seen.has(key)) continue;
      if (!st.inBounds(cx, cy)) continue;
      const i = st.idx(cx, cy);
      const wl = st.wall[i];
      if (st.flags[i] || (wl !== 0 && wl !== 1 && wl !== 2)) continue; // 天然洞穴墙也蔓延
      seen.add(key);
      cavity.push([cx, cy]);
      q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    if (cavity.length < 100) continue;
    for (const [cx, cy] of cavity) {
      const i = st.idx(cx, cy);
      st.wall[i] = 62;
      st.liquid[i] = 0;
      // Webs pass 密度:9/10 蛛网(近实心)
      if (!st.flags[i] && st.type[i] === 0 && rng.next() * 10 < 9) {
        let nearSolid = false;
        for (let dx = -3; dx <= 3 && !nearSolid; dx++) {
          for (let dy = -3; dy <= 3; dy++) {
            if (st.inBounds(cx + dx, cy + dy) && st.flags[st.idx(cx + dx, cy + dy)]) { nearSolid = true; break; }
          }
        }
        if (nearSolid) st.setTileSilent(cx, cy, COBWEB, 0, 0);
      }
      // 实心邻块背后刷墙
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!st.inBounds(cx + dx, cy + dy)) continue;
        const j = st.idx(cx + dx, cy + dy);
        if (st.flags[j] && st.wall[j] === 0) st.wall[j] = 62;
      }
    }
    placed++;
  }
}
