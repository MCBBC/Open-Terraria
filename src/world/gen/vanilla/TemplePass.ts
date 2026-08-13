// 原版 "Jungle Temple"(WorldGen.cs:7190 + makeTemple L17158)1:1 移植。
// 之字形下沉房间链(重投至与旧房不相交;锚点=中心;行程 1-2 递增)→ 全房对实心砖连线
// → 房内双遍游走挖腔(墙 87)→ templePather 通道 → outerTempled 封壳 → 入口隧道+门框
// → templeCleaner → 祭坛 237(末间中心 ±15) → templePart2 五段(陷阱→箱→雕像→家具→挂饰)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeDoorClosed } from '../../Door';
import { placeBuriedChest } from './BuriedChestsPass';
import { placeFurn } from './DungeonPass';

const BRICK = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;

interface Room { x: number; y: number; w: number; h: number }

function inter(a: Room, b: Room): boolean {
  // C# Rectangle.Intersects:仅边接触不算相交
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function setBrick(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = BRICK; st.flags[i] = 1; st.liquid[i] = 0; st.liquidType[i] = 0;
}

export function runTemplePass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  const { w, h } = st;
  const s = w / 4200;
  // 种子点(cs:15917-15992):y = Next(rockLayer, maxTilesY-600)(rockLayer 先钳 ≤ h-601);
  // x = ((NextDouble()*num3+0.1)*-dungeonSide+0.5)*w,num3 起 0.25,每 1e6 次失败
  // num3 = min(0.35, num3+0.05) 递增(cs:15978-15989);落点须为丛林草 60(cs:15972)。
  // num3==0.35 后再失败 10 轮放弃(不作原版地表补救 cs:15995+,直接返回)。
  let sx = -1, sy = -1;
  {
    let band = 0.25, fails = 0, giveups = 0;
    for (;;) {
      let yTop = Math.floor(gs.rockLevel);
      const yBot = h - 600;
      if (yTop > yBot - 1) yTop = yBot - 1;
      const y = rng.int(yTop, yBot - 1);
      const x = Math.floor(((rng.next() * band + 0.1) * -gs.dungeonSide + 0.5) * w);
      if (st.inBounds(x, y)) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === JUNGLE_GRASS) { sx = x; sy = y; break; }
      }
      if (fails++ > 1000000) {
        if (band === 0.35 && ++giveups > 10) break;
        band = Math.min(0.35, band + 0.05);
        fails = 0;
      }
    }
  }
  if (sx < 0) return;
  // ---- 房间链(L17185-17231):重投至与全部旧房不相交;overlap 每次相交测试 1% 递增 ----
  const roomCount = rng.int(Math.max(2, Math.floor(10 * s)), Math.floor(16 * s) - 1);
  const rooms: Room[] = [];
  let dir = rng.next() < 0.5 ? 1 : -1;   // num2
  const startDir = dir;                   // num3
  let runLen = rng.int(1, 2);             // num8:行程阈值,每次换向后 +1
  let runStep = 0;                        // num9
  let cx = sx, cy = sy;                   // num6/num7:上一间中心
  let overlap = -10;                      // num13
  for (let n = 0; n < roomCount; n++) {
    runStep++;
    const last = n === roomCount - 1;
    let rect: Room = { x: cx, y: cy, w: 0, h: 0 };
    let newDir = dir;
    let rx = cx, ry = cy;
    let ok = false;
    for (let t = 0; t < 5000 && !ok; t++) {
      let rw = rng.int(25, 49);
      let rh = Math.min(rng.int(20, 34), rw);
      let baseY = cy;
      if (last) {
        const w0 = rng.int(55, 64), h0 = rng.int(45, 49);
        rw = Math.floor(w0 * 1.6);
        rh = Math.floor(Math.min(h0, w0) * 1.35);
        baseY += rng.int(5, 9);
      }
      if (runStep > runLen) {
        // 换向下沉
        ry = baseY + rng.int(rh + 1, rh + 2) + overlap;
        rx = cx + rng.int(-5, 5);
        newDir = -dir;
      } else {
        rx = cx + (rng.int(rw + 1, rw + 2) + overlap) * dir;
        ry = baseY + rng.int(-5, 5);
      }
      rect = { x: rx - Math.floor(rw / 2), y: ry - Math.floor(rh / 2), w: rw, h: rh };
      ok = true;
      for (const o of rooms) {
        if (inter(rect, o)) ok = false;
        if (rng.int(0, 99) === 0) overlap++;
      }
    }
    rooms.push(rect);
    if (runStep > runLen) { runLen++; runStep = 1; }
    dir = newDir as 1 | -1;
    cx = rx; cy = ry;
  }
  if (rooms.length < 3) return;
  // ---- 全房对实心砖连线(L17240-17278):四角组合插值走,每步铺整列砖 ----
  for (let a = 0; a < rooms.length; a++) {
    for (let b = 0; b < rooms.length; b++) {
      if (a === b) continue;
      for (let ea = 0; ea < 2; ea++) {
        for (let eb = 0; eb < 2; eb++) {
          let x1 = rooms[a].x + (ea === 1 ? rooms[a].w - 1 : 0);
          let y1 = rooms[a].y;
          let y1b = y1 + rooms[a].h;
          let x2 = rooms[b].x + (eb === 1 ? rooms[b].w - 1 : 0);
          let y2 = rooms[b].y;
          let y2b = y2 + rooms[b].h;
          let guard = 0;
          while ((x1 !== x2 || y1 !== y2 || y1b !== y2b) && guard++ < 3000) {
            if (x1 < x2) x1++;
            if (x1 > x2) x1--;
            if (y1 < y2) y1++;
            if (y1 > y2) y1--;
            if (y1b < y2b) y1b++;
            if (y1b > y2b) y1b--;
            for (let y = y1; y < y1b; y++) setBrick(st, x1, y);
          }
        }
      }
    }
  }
  // ---- 房间实心 + 双遍游走挖腔(L17280-17381)----
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) setBrick(st, x, y);
    }
    const l0 = r.x + rng.int(3, 7), r0 = r.x + r.w - rng.int(3, 7);
    const t0 = r.y + rng.int(3, 7), b0 = r.y + r.h - rng.int(3, 7);
    let l = l0, rr = r0, t = t0, b = b0;
    const midX = Math.floor((l0 + r0) / 2), midY = Math.floor((t0 + b0) / 2);
    const carveCell = (x: number, y: number) => {
      if (!st.inBounds(x, y)) return;
      const i = st.idx(x, y);
      st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
    };
    // 正向(列优先)
    for (let x = l0; x < r0; x++) {
      for (let y = t0; y < b0; y++) {
        if (rng.int(0, 19) === 0) t += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) b += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) l += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) rr += rng.int(-1, 1);
        if (l < l0) l = l0;
        if (rr > r0) rr = r0;
        if (t < t0) t = t0;
        if (b > b0) b = b0;
        if (l > midX) l = midX;
        if (rr < midX) rr = midX;
        if (t > midY) t = midY;
        if (b < midY) b = midY;
        if (x >= l && x < rr && y >= t && y <= b) carveCell(x, y);
      }
    }
    // 反向(行优先)
    l = l0; rr = r0; t = t0; b = b0;
    for (let y = b0; y > t0; y--) {
      for (let x = r0; x > l0; x--) {
        if (rng.int(0, 19) === 0) t += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) b += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) l += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) rr += rng.int(-1, 1);
        if (l < l0) l = l0;
        if (rr > r0) rr = r0;
        if (t < t0) t = t0;
        if (b > b0) b = b0;
        if (l > midX) l = midX;
        if (rr < midX) rr = midX;
        if (t > midY) t = midY;
        if (b < midY) b = midY;
        if (x >= l && x < rr && y >= t && y <= b) carveCell(x, y);
      }
    }
  }
  // ---- templePather 通道(L17392-17458):从种子游走穿各房,方块清空+墙 87 ----
  const pather = (px: number, py: number, destX: number, destY: number): [number, number] => {
    let x = px, y = py;
    let steps = rng.int(5, 19);
    const rad = rng.int(2, 4);
    while (steps > 0 && (x !== destX || y !== destY)) {
      steps--;
      if (x > destX) x--;
      if (x < destX) x++;
      if (y > destY) y--;
      if (y < destY) y++;
      for (let ix = x - rad; ix < x + rad; ix++) {
        for (let iy = y - rad; iy < y + rad; iy++) {
          if (!st.inBounds(ix, iy)) continue;
          const i = st.idx(ix, iy);
          st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
        }
      }
    }
    return [x, y];
  };
  let tpx = sx, tpy = sy;
  for (let n = 0; n < rooms.length; n++) {
    const r = rooms[n];
    const inner: Room = { x: r.x + 8, y: r.y + 8, w: Math.max(1, r.w - 16), h: Math.max(1, r.h - 16) };
    for (;;) {
      let destX: number, destY: number;
      if (n === rooms.length - 1) {
        destX = inner.x + Math.floor(inner.w / 2) + rng.int(-10, 9);
        destY = inner.y + Math.floor(inner.h / 2) + rng.int(-10, 9);
      } else {
        destX = rng.int(inner.x, inner.x + inner.w - 1);
        destY = rng.int(inner.y, inner.y + inner.h - 1);
      }
      [tpx, tpy] = pather(tpx, tpy, destX, destY);
      if (tpx === destX && tpy === destY) break;
    }
    // 通向下一间的附加通道(2/3 概率近旁绕行,1/3 中点)
    if (n < rooms.length - 1) {
      const a = rooms[n], b2 = rooms[n + 1];
      let tx: number, ty: number;
      if (rng.int(0, 2) !== 0) {
        if (b2.y >= a.y + a.h) {
          tx = b2.x + (n === 0
            ? (startDir > 0 ? Math.floor(b2.w * 0.8) : Math.floor(b2.w * 0.2))
            : (b2.x < a.x ? Math.floor(b2.w * 0.2) : Math.floor(b2.w * 0.8)));
          ty = b2.y;
        } else {
          tx = Math.floor((a.x + Math.floor(a.w / 2) + b2.x + Math.floor(b2.w / 2)) / 2);
          ty = Math.floor(b2.y + b2.h * 0.8);
        }
      } else {
        tx = Math.floor((a.x + Math.floor(a.w / 2) + b2.x + Math.floor(b2.w / 2)) / 2);
        ty = Math.floor((a.y + Math.floor(a.h / 2) + b2.y + Math.floor(b2.h / 2)) / 2);
      }
      for (;;) {
        const destX = rng.int(tx - 6, tx + 6);
        const destY = rng.int(ty - 6, ty + 6);
        [tpx, tpy] = pather(tpx, tpy, destX, destY);
        if (tpx === destX && tpy === destY) break;
      }
    }
  }
  // ---- 外壳范围 + outerTempled 四遍扫描(L17461-17499)----
  let bx0 = w - 20, bx1 = 20, by0 = h - 20, by1 = 20;
  for (const r of rooms) {
    if (r.x < bx0) bx0 = r.x;
    if (r.x + r.w > bx1) bx1 = r.x + r.w;
    if (r.y < by0) by0 = r.y;
    if (r.y + r.h > by1) by1 = r.y + r.h;
  }
  const ox0 = bx0 - 10, ox1 = bx1 + 10, oy0 = by0 - 10, oy1 = by1 + 10;
  const outerTempled = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return;
    const i0 = st.idx(x, y);
    if ((st.flags[i0] && st.type[i0] === BRICK) || st.wall[i0] === 87) return;
    for (let ix = x - 6; ix <= x + 6; ix++) {
      for (let iy = y - 6; iy <= y + 6; iy++) {
        if (!st.inBounds(ix, iy)) continue;
        const j = st.idx(ix, iy);
        if (!st.flags[j] && st.wall[j] === 87) { setBrick(st, x, y); return; }
      }
    }
  };
  for (let x = ox0; x < ox1; x++) for (let y = oy0; y < oy1; y++) outerTempled(x, y);
  for (let x = ox1; x >= ox0; x--) for (let y = oy0; y < Math.floor(oy1 / 2); y++) outerTempled(x, y);
  for (let y = oy0; y < oy1; y++) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  for (let y = oy1; y >= oy0; y--) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  // ---- 入口隧道(L17500-17527):固定高度、固定间隔下沉,穿出神庙即停 ----
  const edir = -startDir;
  let ex = sx + 0.0, ey = sy + 0.0;
  const tunH = rng.int(2, 4);
  const dropEvery = rng.int(9, 13);
  let tick = 0;
  for (;;) {
    tick++;
    if (tick >= dropEvery) { tick = 0; ey--; }
    ex += edir;
    const xi = Math.floor(ex);
    if (xi < 1 || xi >= st.w - 1) break;
    let inside = false;
    for (let y = Math.floor(ey) - tunH; y < ey + tunH; y++) {
      if (!st.inBounds(xi, y)) continue;
      const i = st.idx(xi, y);
      if (st.wall[i] === 87 || (st.flags[i] && st.type[i] === BRICK)) inside = true;
      if (st.flags[i] && st.type[i] === BRICK) {
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
      }
    }
    if (!inside) break;
  }
  // ---- 门框(L17528-17578):柱/洞/门 tile 10 style 11 ----
  const i1 = sx;
  let jy = sy;
  if (!st.inBounds(i1, jy)) return;
  while (jy < st.h - 2 && !st.flags[st.idx(i1, jy)]) jy++;
  jy -= 4;   // j1
  if (jy < 2) return;
  let yUp = jy;
  while (yUp > 1 && ((st.flags[st.idx(i1, yUp)] && st.type[st.idx(i1, yUp)] === BRICK) || st.wall[st.idx(i1, yUp)] === 87)) yUp--;
  const yFrom = yUp + 2;
  for (let x = i1 - 1; x <= i1 + 1; x++) {
    for (let y = yFrom; y <= jy; y++) setBrick(st, x, y);
  }
  for (let x = i1 - 4; x <= i1 + 4; x++) {
    for (let y = jy - 1; y < jy + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
    }
  }
  for (let x = i1 - 1; x <= i1 + 1; x++) {
    for (let y = jy - 5; y <= jy + 8; y++) setBrick(st, x, y);
  }
  for (let x = i1 - 3; x <= i1 + 3; x++) {
    for (let y = jy - 2; y < jy + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      if (y >= jy || x < sx - 1 || x > sx + 1) {
        const i = st.idx(x, y);
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
      }
    }
  }
  // 原版 makeTemple 尾部（1456 WorldGen.cs:34176）：PlaceTile(i1, num81=jy, 10, style 11)。
  // PlaceTile case 10（:59867）条件 B：j+1/j+2 空 + j+3 实心 → PlaceDoor(i, j+1)（:31938，
  // 门占 j..j+2）。此处 jy=地板-4：门顶=jy、门底=jy+2，站地板 jy+3。
  // 此前放 jy-2 = 整门悬空 2 格（标注实测）
  placeDoorClosed(st, i1, jy, 11);
  // ---- templeCleaner 两遍(L17579-17588)----
  const cleaner = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return;
    const nbr = (dx: number, dy: number) => {
      if (!st.inBounds(x + dx, y + dy)) return 0;
      const j = st.idx(x + dx, y + dy);
      return st.flags[j] && st.type[j] === BRICK ? 1 : 0;
    };
    const num = nbr(1, 0) + nbr(-1, 0) + nbr(0, 1) + nbr(0, -1);
    const i = st.idx(x, y);
    if (st.flags[i] && st.type[i] === BRICK) {
      if (num > 1) return;
      st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
    } else {
      if (st.flags[i] || num !== 3) return;
      setBrick(st, x, y);
    }
  };
  for (let x = ox0; x < ox1; x++) for (let y = oy0; y < oy1; y++) cleaner(x, y);
  for (let y = oy1; y >= oy0; y--) for (let x = ox1; x >= ox0; x--) cleaner(x, y);
  // ---- 封闭格刷墙 87(L17589-17608):3×3 全是砖或墙 87 ----
  for (let x = ox0; x < ox1; x++) {
    for (let y = oy0; y < oy1; y++) {
      if (!st.inBounds(x, y)) continue;
      let all = true;
      for (let dx = -1; dx <= 1 && all; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!st.inBounds(x + dx, y + dy)) { all = false; break; }
          const j = st.idx(x + dx, y + dy);
          if (!(st.flags[j] && st.type[j] === BRICK) && st.wall[j] !== 87) { all = false; break; }
        }
      }
      if (all) st.wall[st.idx(x, y)] = 87;
    }
  }
  // ---- 祭坛 237（makeTemple 尾 cs:34241-34315 1:1）：末间中心 ±15 拒绝采样，
  //      Place3x2 锚点门（底行下三列 SolidTile2）；1000 次失败走强制兜底 ----
  // SolidTile2（cs:70178）：active+tileSolid+slope0+非半砖
  const solidTile2 = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const j = st.idx(x, y);
    if (!st.flags[j]) return false;
    const d = TILE_DEFS[st.type[j]];
    return !!d && d.solid && st.slope[j] === 0 && !st.half[j];
  };
  const lastR = rooms[rooms.length - 1];
  const acx = lastR.x + Math.floor(lastR.w / 2);
  const acy = lastR.y + Math.floor(lastR.h / 2);
  let altarX = -1, altarY = -1;
  for (let tries = 0; tries < 1000 && altarX < 0; tries++) {
    const ax = acx + 15 - rng.int(0, 29);
    const ay = acy + 15 - rng.int(0, 29);
    if (!st.inBounds(ax, ay) || st.wall[st.idx(ax, ay)] !== 87) continue;
    // PlaceTile 语义:落点须在挖空区(墙 87 且非实心)
    if (st.flags[st.idx(ax, ay)]) continue;
    // Place3x2 空置门（cs:52109-52120）：3×2 全空
    let clear = true;
    for (let dx = 0; dx <= 2 && clear; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        if (!st.inBounds(ax + dx, ay + dy) || st.flags[st.idx(ax + dx, ay + dy)]) { clear = false; break; }
      }
    }
    if (!clear) continue;
    // ★ Place3x2 锚点门（cs:52127-52153，default 分支）：底行下三列 SolidTile2
    // ——此前缺此门：采样框下方几乎必然是空气 → 祭坛悬空
    let anchored = true;
    for (let dx = 0; dx <= 2; dx++) {
      if (!solidTile2(ax + dx, ay + 2)) { anchored = false; break; }
    }
    if (!anchored) continue;
    for (let dx = 0; dx <= 2; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        st.setTileSilent(ax + dx, ay + dy, ALTAR, dx * 18, dy * 18);
      }
    }
    altarX = ax; altarY = ay;
  }
  // ---- 兜底（cs:34261-34315 1:1）：中心 ±10 抖动 → 向下扫到首个实心 →
  //      强制铺 3 格蜥蜴砖地板 → 锚点改地板上一格、x 左移 1 → 清周围 → 强制放置
  if (altarX < 0) {
    let fx = acx + rng.int(-10, 10);
    let fy = acy + rng.int(-10, 10);
    while (st.inBounds(fx, fy) && !st.flags[st.idx(fx, fy)]) fy++;
    if (st.inBounds(fx, fy)) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!st.inBounds(fx + dx, fy)) continue;
        const j = st.idx(fx + dx, fy);
        st.type[j] = BRICK; st.flags[j] = 1;
        st.slope[j] = 0; st.half[j] = 0; st.liquid[j] = 0;
      }
      fy -= 2; fx -= 1;   // 底中锚 → 3×2 左上角
      if (st.inBounds(fx, fy)) {
        for (let dx = -1; dx <= 3; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (st.inBounds(fx + dx, fy + dy)) {
              const j = st.idx(fx + dx, fy + dy);
              st.type[j] = 0; st.flags[j] = 0;
            }
          }
        }
        for (let dx = 0; dx <= 2; dx++) {
          for (let dy = 0; dy <= 1; dy++) {
            st.setTileSilent(fx + dx, fy + dy, ALTAR, dx * 18, dy * 18);
          }
        }
        altarX = fx; altarY = fy;
      }
    }
  }
  gs.lAltarX = altarX; gs.lAltarY = altarY;
  // ---- templePart2（1456 cs:34497-34685）1:1 五段：陷阱 → 宝箱 → 雕像 → 家具 → 挂饰 ----
  // 顺序对齐原版：宝箱在尖刺陷阱段**之后**（旧版反序且公式为房数×1.1×(1±25%)）
  templePart2(st, rng, gs, chests, rooms);
  // 注：LihzahrdAltar 终保 pass（cs:21753-21791）原版是 TileCleanup(21327) 之后、
  // MicroBiomes(21785) 之前的独立 pass（Pots/Traps/TileCleanup 可能扰动祭坛后再
  // 重放）。2026-08-13 前并入本函数末尾（执行位≈15911），已外提为
  // runLihzahrdAltarPass 独立槽位（WorldGen.ts「蜥蜴祭坛」槽）。
}

/** LihzahrdAltar 终保 pass（cs:21753-21791 1:1）：重放祭坛 6 格 + 正下方三格
 *  强制 226 地板（slope/halfBrick/liquid 复位）——原版注册序在 TileCleanup(21327)
 *  之后，对中途 Pots/Traps/TileCleanup 的祭坛扰动做最终回滚（顺带达成
 *  cs:21744-21746 的 232→226；TileCleanupPass ⑪ 段同效双保险）。 */
export function runLihzahrdAltarPass(st: TileStore, gs: GenState): void {
  const altarX = gs.lAltarX, altarY = gs.lAltarY;
  if (altarX < 0) return;   // 无神庙世界（Skyblock 等）跳过
  for (let dx = 0; dx <= 2; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      if (st.inBounds(altarX + dx, altarY + dy)) {
        st.setTileSilent(altarX + dx, altarY + dy, ALTAR, dx * 18, dy * 18);
      }
    }
    const bj = st.inBounds(altarX + dx, altarY + 2) ? st.idx(altarX + dx, altarY + 2) : -1;
    if (bj >= 0) {
      st.type[bj] = BRICK; st.flags[bj] = 1;
      st.slope[bj] = 0; st.half[bj] = 0; st.liquid[bj] = 0;
    }
  }
}

/** templePart2（1456 cs:34497-34685）1:1。tRooms=房间数；各段预算公式与
 *  失败推进语义逐掷对齐（陷阱段 fails>100 直接扣预算；其余段 fails>10000 break）。 */
function templePart2(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
  rooms: Room[],
): void {
  let tLeft = Infinity, tRight = -Infinity, tTop = Infinity, tBottom = -Infinity;
  for (const r of rooms) {
    tLeft = Math.min(tLeft, r.x); tRight = Math.max(tRight, r.x + r.w);
    tTop = Math.min(tTop, r.y); tBottom = Math.max(tBottom, r.y + r.h);
  }
  const tRooms = rooms.length;
  const lx = Math.floor(tLeft), rx = Math.ceil(tRight) - 1;
  const ty = Math.floor(tTop), by = Math.ceil(tBottom) - 1;

  // ---- 1. 尖刺陷阱（cs:34497-34519）：预算 = 房数×1.9×(1±15%) ----
  {
    let budget = tRooms * 1.9 * (1 + rng.int(-15, 15) * 0.01);
    let fails = 0;
    while (budget > 0) {
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        if (mayanTrap(st, rng, gs, x2, y2)) { budget -= 1; fails = 0; }
        else fails++;
      } else fails++;
      if (fails > 100) { fails = 0; budget -= 1; }   // cs:34517-34518
    }
  }

  // ---- 2. 神庙宝箱（cs:34521-34545）：预算 = 房数×0.35×(1±15%) ----
  //  AddBuriedChest(mainItem=1293 蜥蜴能量电池, notNearOtherChests:true, style 16)
  {
    let budget = tRooms * 0.35 * (1 + rng.int(-15, 15) * 0.01);
    let fails = 0;
    while (budget > 0) {
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      // 祭坛 ±3 格回避（原版由保护结构承担；防宝箱贴祭坛抢右键交互）
      const nearAltar = gs.lAltarX >= 0 && Math.abs(x2 - gs.lAltarX) <= 3 && Math.abs(y2 - gs.lAltarY) <= 3;
      if (!nearAltar && st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        if (placeBuriedChest(st, rng, gs, chests, x2, y2, { style: 16, loot: 'vi_1293_lihzahrd_power_cell' })) {
          budget -= 1;
          fails = 0;
        }
      }
      fails++;
      if (fails > 10000) break;
    }
  }

  // ---- 3. 雕像 105 style43-45（cs:34547-34583）：预算 = 房数×1.25×(1+Next(-25,36)%) ----
  {
    let budget = tRooms * 1.25 * (1 + rng.int(-25, 35) * 0.01);
    let fails = 0;
    while (budget > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        let fy = y2;
        while (st.inBounds(x2, fy) && !st.flags[st.idx(x2, fy)]) {
          fy++;
          if (fy > by) break;
        }
        fy--;
        if (fy <= by) {
          const style = rng.int(43, 45);              // Next(43,46)
          if (placeStatueTemple(st, x2, fy, style)) budget -= 1;
        }
      }
      if (fails > 10000) break;
    }
  }

  // ---- 4. 蜥蜴家具（cs:34585-34632）：预算 = 房数×1.35×(1+Next(-15,26)%) ----
  //  Next(3)（cs:34608-34630 原文配对，勿旋转）：0→工作台 18 style10 /
  //  1→桌 14 style9 / 2→椅 15 style12（曾把三对整体错抄一位→神庙出木椅）
  {
    let budget = tRooms * 1.35 * (1 + rng.int(-15, 25) * 0.01);
    let fails = 0;
    while (budget > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        let fy = y2;
        while (st.inBounds(x2, fy) && !st.flags[st.idx(x2, fy)]) {
          fy++;
          if (fy > by) break;
        }
        fy--;
        if (fy <= by) {
          const kind = rng.int(0, 2);                 // Next(3)
          const spec = kind === 0
            ? { tile: TILE_BY_KEY['workbench']!, style: 10 }
            : kind === 1
              ? { tile: TILE_BY_KEY['table']!, style: 9 }
              : { tile: TILE_BY_KEY['chair']!, style: 12 };
          if (placeFurn(st, x2, fy, spec.tile, spec.style)) budget -= 1;
        }
      }
      if (fails > 10000) break;
    }
  }

  // ---- 5. 墙挂饰 240 style88（cs:34634-34682）：数量 = 1 + (w>4200) + (w>6400?Next(2):0) ----
  {
    let count = 1;
    if (st.w > 4200) count++;
    if (st.w > 6400) count += rng.int(0, 1);
    let fails = 0;
    while (count > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        // ±70 内已有 240，或 ±4 内有蜥蜴砖 226 → 拒绝（cs:34654-34675）
        let flag = false;
        for (let dx = -70; dx <= 70 && !flag; dx++) {
          for (let dy = -70; dy <= 70; dy++) {
            const xx = x2 + dx, yy = y2 + dy;
            if (!st.inBounds(xx, yy)) continue;
            const k = st.idx(xx, yy);
            if (!st.flags[k]) continue;
            const sh = TILE_DEFS[st.type[k]]?.vanilla?.sheet ?? -1;
            if (sh === 240) { flag = true; break; }
            if (dx >= -4 && dx <= 4 && dy >= -4 && dy <= 4 && sh === 226) { flag = true; break; }
          }
        }
        if (!flag && placeWallHangingTemple(st, x2, y2, 88)) count--;
      }
      if (fails > 10000) break;
    }
  }
}

/** PlaceTile(105, style)（神庙雕像）：2×3，锚点=底行左列的下一格语义（与 StatuesPass 一致） */
function placeStatueTemple(st: TileStore, x: number, y: number, style: number): boolean {
  const STATUE = TILE_BY_KEY['v_105_statue'];
  if (STATUE === undefined) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (!st.inBounds(x + dx, y + dy) || st.flags[st.idx(x + dx, y + dy)]) return false;
    }
  }
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      // 雕像帧 55 列换行（cs:39716-39720；神庙 style 43-45 <55 本可不过防御性同款）
      const row = Math.floor(style / 55);
      st.setTileSilent(x + dx, y - 2 + dy, STATUE, (style - row * 55) * 36 + dx * 18, row * 54 + dy * 18);
    }
  }
  return true;
}

/** PlaceTile(240, style)（神庙墙挂饰）：3×3，帧基 = (style%36)*54 / floor(style/36)*54 */
function placeWallHangingTemple(st: TileStore, x: number, y: number, style: number): boolean {
  const HANGING = TILE_BY_KEY['v_240_wall_hangings_3x3'];
  if (HANGING === undefined) return false;
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      if (!st.inBounds(x + dx, y + dy) || st.flags[st.idx(x + dx, y + dy)]) return false;
    }
  }
  const bx = (style % 36) * 54;
  const bys = Math.floor(style / 36) * 54;
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(x + dx, y + dy, HANGING, bx + dx * 18, bys + dy * 18);
    }
  }
  return true;
}

/** 玛雅陷阱(WorldGen.cs:2945-3235):压板 135(style6)→ 陷阱 137,路径铺三色随机导线 */
function mayanTrap(st: TileStore, rng: RNG, gs: GenState, x2: number, y2: number): boolean {
  const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
  const TRAP = TILE_BY_KEY['v_137_traps']!;
  const solid = (x: number, y: number) => st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
  const wireBit = (n: number) => n === 0 ? TileStore.WIRE_RED : n === 1 ? TileStore.WIRE_BLUE : TileStore.WIRE_GREEN;
  const setW = (x: number, y: number, n: number) => { st.wire[st.idx(x, y)] |= wireBit(n); };
  const getW = (x: number, y: number) => {
    const b = st.wire[st.idx(x, y)];
    if (b & TileStore.WIRE_RED) return 0;
    if (b & TileStore.WIRE_BLUE) return 1;
    if (b & TileStore.WIRE_GREEN) return 2;
    return -1;
  };
  const pickColor = (x: number, y: number) => {
    const ex = getW(x, y);
    return ex >= 0 ? ex : rng.int(0, 2);
  };
  // num1:1/3 概率横向(L2947-2949)
  const kind = rng.int(0, 2) === 0 ? 0 : 1;
  // 落点向下找实心(L2950-2962)
  const px = x2;
  let fy = y2;
  while (!solid(px, fy)) {
    fy++;
    if (fy >= st.h - 300) return false;
  }
  const sh = TILE_BY_KEY['v_226_lihzahrd_brick']!;
  if (st.type[st.idx(px, fy)] === sh || TILE_DEFS[st.type[st.idx(px, fy)]]?.vanilla?.sheet === 10) return false;
  const j = fy - 1;
  if (st.liquid[st.idx(px, j)] > 0 && st.liquidType[st.idx(px, j)] === 2) return false;
  // 周围须净空(L2967)
  const nactive = (x: number, y: number) => st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
  if (nactive(px, j) || nactive(px - 1, j) || nactive(px + 1, j) || nactive(px, j - 1)
    || nactive(px - 1, j - 1) || nactive(px + 1, j - 1) || nactive(px, j - 2)
    || nactive(px - 1, j - 2) || nactive(px + 1, j - 2)) return false;

  if (kind === 0) {
    // 横向:同高走廊两端墙装飞镖陷阱,压板居中(L2971-3119)
    const ty = j - rng.int(0, 2);
    let lx = px;
    while (!solid(lx, ty)) lx--;
    let rx = px;
    while (!solid(rx, ty)) rx++;
    let flagL = (px - lx) > 5 && (px - lx) < 50 && solid(lx, ty + 1);
    let flagR = (rx - px) > 5 && (rx - px) < 50 && solid(rx, ty + 1);
    if (!flagL && !flagR) return false;
    let dir: number, tx: number;
    if (flagL && flagR) {
      dir = 1; tx = lx;
      if (rng.int(0, 1) === 0) { tx = rx; dir = -1; }
    } else if (flagR) { tx = rx; dir = -1; }
    else { tx = lx; dir = 1; }
    if (st.type[st.idx(tx, ty)] === PLATE || st.type[st.idx(tx, ty)] === TRAP) return false;
    if (st.wall[st.idx(tx, ty)] !== 87) return false;
    // 压板 + 陷阱(L3013-3051)。style:近距(<10)2/3 概率超级飞镖,否则飞镖
    const style1 = Math.abs(tx - px) < 10 && rng.int(0, 2) !== 0 ? 2 : 1;
    st.setTileSilent(px, j, PLATE, 0, 6 * 18);
    st.setTileSilent(tx, ty, TRAP, dir === 1 ? 18 : 0, style1 * 18);
    // L 形铺线:压板 → 陷阱(L3068-3118,含两端点)
    const num5 = pickColor(px, j);
    let wx = px, wy = j;
    while (wx !== tx || wy !== ty) {
      setW(wx, wy, num5);
      if (wx > tx) wx--;
      else if (wx < tx) wx++;
      setW(wx, wy, num5);
      if (wy > ty) wy--;
      else if (wy < ty) wy++;
      setW(wx, wy, num5);
    }
    setW(tx, ty, num5);
    return true;
  }
  // 纵向:头顶找天花板,天花板装下向火焰陷阱,两侧墙追加同排陷阱(L3120-3235)
  let uy = j;
  while (!solid(px, uy)) {
    uy--;
    if (uy < gs.rockLevel) return false;
  }
  const dist = Math.abs(uy - j);
  if (dist < 3) return false;
  if (st.type[st.idx(px, uy)] === PLATE || st.type[st.idx(px, uy)] === TRAP
    || TILE_DEFS[st.type[st.idx(px, uy)]]?.vanilla?.sheet === 10 || st.wall[st.idx(px, uy)] !== 87) return false;
  const num9 = pickColor(px, j);
  const style2 = dist < 16 && rng.int(0, 2) !== 0 ? 4 : 3;
  st.setTileSilent(px, j, PLATE, 0, 6 * 18);
  st.setTileSilent(px, uy, TRAP, 0, style2 * 18);
  // 两侧墙追加陷阱(L3146-3178)
  for (let side = 0; side < 2; side++) {
    let steps = rng.int(1, 4);
    let ix = px;
    const d = side === 1 ? 1 : -1;
    while (steps > 0) {
      steps--;
      ix += d;
      if (solid(ix, uy - 1) && !solid(ix, uy + 1)) {
        st.setTileSilent(ix, uy, TRAP, d === 1 ? 18 : 0, style2 * 18);
        st.wire[st.idx(ix, uy)] |= wireBit(num9);
      } else break;
    }
  }
  // 竖向铺线:压板 → 天花板陷阱(L3179-3235)
  {
    let wx = px, wy = j;
    while (wx !== px || wy !== uy) {
      setW(wx, wy, num9);
      if (wy > uy) wy--;
      else if (wy < uy) wy++;
      setW(wx, wy, num9);
    }
    setW(px, uy, num9);
  }
  return true;
}
