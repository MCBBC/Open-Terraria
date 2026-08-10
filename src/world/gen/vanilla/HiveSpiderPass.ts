// 蜂巢(pass 45,HiveBiome.cs 1:1)+ 蜘蛛巢(WorldGen.cs:8138 Spread.Spider 1:1)。
// 蜂巢:主巢+卫星巢+隧道链(每巢各不相同);剖面=核心40%蜂蜜/0.6墙86空腔/0.75实心蜂壳;
// 链终点幼虫托台(BOSS 房)。蜘蛛巢:洪泛既有洞穴刷墙62,9/10 蛛网密度(Webs pass)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';

const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const LARVA = TILE_BY_KEY['v_231_larva']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUDT = TILE_BY_KEY['mud']!;

/** CreateHiveTunnel(HiveBiome.cs:135)1:1:基础半径 12-20,步数每迭代净 -2,
 *  三阈值各自独立 ±0.5% 抖动且基于基础半径;±10 格墙 87(神庙)/地表空墙 → 整条作废 */
function hiveTunnel(st: TileStore, rng: RNG, gs: GenState, sx: number, sy: number): [number, number] {
  const baseR = rng.int(12, 20);
  let num2 = rng.int(10, 20);   // 剩余步数
  let vx = rng.int(-10, 10) * 0.2, vy = rng.int(-10, 10) * 0.2;
  let px = sx + 0.0, py = sy + 0.0;
  while (num2 > 0) {
    if (py > st.h - 250) num2 = 0;
    const r = baseR * (1 + rng.int(-20, 19) * 0.01);
    let next2 = num2 - 1;   // 本迭代后的剩余(可能被截断保护清零)
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(st.w - 1, Math.floor(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(st.h - 1, Math.floor(py + r));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (x < 50 || y < 50 || x > st.w - 50 || y > st.h - 50) { next2 = 0; }
        else {
          // ±10 格神庙墙(87)→ 截断
          if ((st.inBounds(x - 10, y) && st.wall[st.idx(x - 10, y)] === 87)
            || (st.inBounds(x + 10, y) && st.wall[st.idx(x + 10, y)] === 87)
            || (st.inBounds(x, y - 10) && st.wall[st.idx(x, y - 10)] === 87)
            || (st.inBounds(x, y + 10) && st.wall[st.idx(x, y + 10)] === 87)) next2 = 0;
          // 地表以上且上方 5 格无墙 → 截断(防穿透地表)
          if (y < gs.worldSurface && st.inBounds(x, y - 5) && st.wall[st.idx(x, y - 5)] === 0) next2 = 0;
        }
        const i = st.idx(x, y);
        const d = Math.hypot(x - px, y - py);
        if (d < baseR * 0.4 * (1 + rng.int(-10, 10) * 0.005)) {
          if (rng.int(0, 2) === 0) { st.liquid[i] = 255; st.liquidType[i] = 3; }
          st.wall[i] = 86;
          st.type[i] = 0; st.flags[i] = 0;
        } else if (d < baseR * 0.75 * (1 + rng.int(-10, 10) * 0.005)) {
          st.liquid[i] = 0; st.liquidType[i] = 0;
          if (st.wall[i] !== 86) { st.type[i] = HIVE; st.flags[i] = 1; }
        }
        if (d < baseR * 0.6 * (1 + rng.int(-10, 10) * 0.005)) st.wall[i] = 86;
      }
    }
    px += vx; py += vy;
    num2 = next2 - 1;   // 原版:num2 = num3 - 1(每迭代净 -2)
    vy += rng.int(-10, 10) * 0.05;
    vx += rng.int(-10, 10) * 0.05;
  }
  return [px, py];
}

/** 蜂蜜坠落块(HiveBiome.cs:206/214):4×4 蜂壳封 2×2 蜜 + 向外砸出凹槽 */
function blockedHoneyCube(st: TileStore, x: number, y: number): void {
  for (let ix = x - 1; ix <= x + 2; ix++) {
    for (let iy = y - 1; iy <= y + 2; iy++) {
      if (!st.inBounds(ix, iy)) continue;
      const i = st.idx(ix, iy);
      if (ix >= x && ix <= x + 1 && iy >= y && iy <= y + 1) {
        st.type[i] = 0; st.flags[i] = 0;
        st.liquid[i] = 255; st.liquidType[i] = 3;
      } else {
        st.type[i] = HIVE; st.flags[i] = 1;
      }
    }
  }
}

function dentForHoneyFall(st: TileStore, x: number, y: number, dirIn: number): void {
  const dir = -dirIn;
  y++;
  let num = 0;
  let cx = x;
  while ((num < 4 || st.isSolid(cx, y)) && cx > 10 && cx < st.w - 10) {
    num++;
    cx += dir;
    if (st.isSolid(cx, y)) {
      // PoundTile:半砖化(我们没有半砖生成语义,简化为清除)
      const i = st.idx(cx, y);
      st.type[i] = 0; st.flags[i] = 0;
      if (!st.flags[st.idx(cx, y + 1)]) {
        st.type[st.idx(cx, y + 1)] = HIVE;
        st.flags[st.idx(cx, y + 1)] = 1;
      }
    }
  }
}

/** Hives(pass 45,HiveBiome.Place):隧道链每段从段起点扇形展开,段终点接续 */
export function runBeehivePass(st: TileStore, rng: RNG, gs: GenState): void {
  const s = st.w / 4200;
  const count = 1 + rng.int(Math.floor(5 * s), Math.max(Math.floor(5 * s) + 1, Math.floor(8 * s)) - 1);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  let placed = 0;
  for (let n = 0; n < count * 100 && placed < count; n++) {
    const x = rng.int(20, st.w - 301);
    const y = rng.int(yMin, st.h - 21);
    if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) continue;
    // 原版验证:半径 15 圆内实心中 60/59 占比 ≥75% 且 60 ≥2
    let solid = 0, mudOrGrass = 0, grass = 0;
    for (let dx = -15; dx <= 15; dx++) {
      for (let dy = -15; dy <= 15; dy++) {
        if (dx * dx + dy * dy > 225) continue;
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        if (!st.flags[i]) continue;
        solid++;
        if (st.type[i] === JUNGLE_GRASS || st.type[i] === MUDT) mudOrGrass++;
        if (st.type[i] === JUNGLE_GRASS) grass++;
      }
    }
    if (solid === 0 || mudOrGrass / solid < 0.75 || grass < 2) continue;
    // 隧道链:2-4 段;每段 2-4 条全部从段起点出发,段位置=最后一条终点
    let px = x + 0.0, py = y + 0.0;
    const segEnds: Array<[number, number]> = [];
    const segs = rng.int(2, 4);
    for (let seg = 0; seg < segs; seg++) {
      const tunnels = rng.int(2, 4);
      let ex = px, ey = py;
      for (let t = 0; t < tunnels; t++) {
        [ex, ey] = hiveTunnel(st, rng, gs, Math.floor(px), Math.floor(py));
      }
      px = ex; py = ey;
      segEnds.push([Math.floor(px), Math.floor(py)]);
    }
    // 蜂蜜坠落块:每个段终点 2×2 实心处放封蜜块+凹槽
    for (const [ex, ey] of segEnds) {
      const dir = rng.int(0, 1) === 0 ? -1 : 1;
      let hx = ex, guard = 0;
      while (guard++ < 60 && Math.abs(hx - ex) <= 50
        && !(st.flags[st.idx(hx, ey)] && st.flags[st.idx(hx, ey + 1)]
          && st.flags[st.idx(hx + 1, ey)] && st.flags[st.idx(hx + 1, ey + 1)])) {
        hx += dir;
      }
      if (Math.abs(hx - ex) > 50) continue;
      const x2 = hx + dir;
      // SpotActuallyNotInHive:4×4 内有非蜂巢实心则跳过
      let notInHive = false;
      for (let ix = x2 - 1; ix <= x2 + 2; ix++) {
        for (let iy = ey - 1; iy <= ey + 2; iy++) {
          if (ix < 10 || ix > st.w - 10) { notInHive = true; break; }
          if (st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] !== HIVE) { notInHive = true; break; }
        }
        if (notInHive) break;
      }
      if (!notInHive) {
        blockedHoneyCube(st, x2, ey);
        dentForHoneyFall(st, x2, ey, dir);
      }
    }
    // 幼虫托台(BOSS 房):链终点 3 宽清空+蜂巢地板
    // （AddBeeLarva WorldGen.cs:32215-32236 逐行对应；原版末尾 PlaceTile(x,y,231) 放幼虫）
    const lx = Math.floor(px), ly = Math.floor(py);
    if (st.inBounds(lx, ly + 1)) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -2; dy <= 1; dy++) {
          if (!st.inBounds(lx + dx, ly + dy)) continue;
          const i = st.idx(lx + dx, ly + dy);
          if (dy !== 1) {
            st.type[i] = 0; st.flags[i] = 0;
          } else {
            st.type[i] = HIVE; st.flags[i] = 1;
          }
        }
      }
      // 幼虫 3×3（占 lx-1..lx+1 × ly-2..ly，底行贴蜂巢地板；顶行帧 (0,0)）
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          const tx = lx - 1 + dx, ty = ly - 2 + dy;
          if (!st.inBounds(tx, ty)) continue;
          const i = st.idx(tx, ty);
          st.type[i] = LARVA; st.flags[i] = 1;
          st.frameX[i] = dx * 18; st.frameY[i] = dy * 18;
        }
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
      hiveTunnel(st, rng, gs, sx2, sy2);
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
