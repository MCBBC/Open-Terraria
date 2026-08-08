// 原版 "Jungle Temple"(WorldGen.cs:7190 + makeTemple L17158)移植。
// 之字形下沉房间链(10-16 间,25-49×20-34,末间放大为祭坛房),砖 226 实心+墙 87 挖空,
// templePather 走廊(半径 2-4 清空+墙87),入口水平隧道+蜥蜴砖门(tile 10 style 11),
// 祭坛 237(末间中心),蜥蜴砖宝箱(chest style 16)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const BRICK = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const DOOR = TILE_BY_KEY['door_closed']!;
const CHEST = TILE_BY_KEY['chest']!;
const MUD = TILE_BY_KEY['mud']!;
const JG = TILE_BY_KEY['v_60_jungle_grass_block']!;

interface Room { x: number; y: number; w: number; h: number }

export function runTemplePass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  const { w, h } = st;
  const s = w / 4200;
  // 种子点:丛林侧(地牢异侧)深层丛林草
  let sx = -1, sy = -1;
  for (let attempt = 0; attempt < 4000 && sx < 0; attempt++) {
    const y = rng.int(gs.rockLevel, Math.max(gs.rockLevel + 1, h - 800));
    const xf = (rng.next() * 0.25 + 0.1) * -gs.dungeonSide + 0.5;
    const x = Math.floor(xf * w);
    if (st.inBounds(x, y) && st.flags[st.idx(x, y)]) {
      sx = x; sy = y;
    }
  }
  if (sx < 0) return;
  // 房间链(之字形下沉)
  const roomCount = rng.int(Math.floor(10 * s), Math.floor(16 * s));
  const rooms: Room[] = [];
  let dir = rng.next() < 0.5 ? -1 : 1;
  let runLeft = rng.int(1, 2);
  let overlap = -10;
  let cx = sx, cy = sy;
  for (let n = 0; n < roomCount; n++) {
    const last = n === roomCount - 1;
    let rw: number, rh: number;
    if (last) {
      rw = Math.floor(rng.int(55, 64) * 1.6);
      rh = Math.floor(rng.int(45, 49) * 1.35);
    } else {
      rw = rng.int(25, 49);
      rh = Math.min(rng.int(20, 34), rw);
    }
    // 位置:水平步进(带重叠)或换向下沉
    let rx: number, ry: number;
    for (let t = 0; t < 60; t++) {
      if (runLeft > 0) {
        rx = cx + (rw + 2 + overlap) * dir + rng.int(-5, 5);
        ry = cy + rng.int(-5, 5);
      } else {
        rx = cx + rng.int(-5, 5);
        ry = cy + (rh + 2 + overlap) + rng.int(0, 4) + (last ? rng.int(5, 9) : 0);
      }
      rx = Math.max(30, Math.min(w - 30 - rw, rx));
      ry = Math.max(gs.rockLevel, Math.min(h - 260 - rh, ry));
      rooms.push({ x: rx, y: ry, w: rw, h: rh });
      cx = rx; cy = ry;
      break;
    }
    runLeft--;
    if (runLeft <= 0) { dir = -dir as 1 | -1; runLeft = rng.int(1, 2) + (roomCount - n > 10 ? 1 : 2); }
  }
  if (rooms.length < 3) return;
  // 实心房 + 挖空(内边距 3-7 游走)
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.type[i] = BRICK; st.flags[i] = 1; st.wall[i] = 87; st.liquid[i] = 0;
      }
    }
    const inX = rng.int(3, 7), inY = rng.int(3, 7);
    let l = inX + rng.int(0, Math.floor(r.w / 2 - inX));
    let rr = r.w - inX - rng.int(0, Math.floor(r.w / 2 - inX));
    let t = inY + rng.int(0, Math.floor(r.h / 2 - inY));
    let b = r.h - inY - rng.int(0, Math.floor(r.h / 2 - inY));
    for (let x = r.x + l; x < r.x + rr; x++) {
      for (let y = r.y + t; y < r.y + b; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
      }
    }
  }
  // 走廊(房间中心链,半径 2-4 清空+墙 87)
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    let px = x0, py = y0;
    let guard = 0;
    while ((px !== x1 || py !== y1) && guard++ < 2000) {
      const steps = rng.int(5, 19);
      for (let k = 0; k < steps && (px !== x1 || py !== y1); k++) {
        if (px !== x1 && (py === y1 || rng.next() < 0.6)) px += Math.sign(x1 - px);
        else if (py !== y1) py += Math.sign(y1 - py);
        const r = rng.int(2, 4);
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (!st.inBounds(px + dx, py + dy)) continue;
            const i = st.idx(px + dx, py + dy);
            if (st.type[i] === BRICK || st.wall[i] === 87) {
              st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
            }
          }
        }
      }
    }
  };
  for (let n = 0; n < rooms.length - 1; n++) {
    const a = rooms[n], b = rooms[n + 1];
    carve(a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2), b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
  }
  // 入口:从种子点水平开凿(4-8 高),穿出神庙
  let ex = sx, ey = sy;
  const edir = -Math.sign(dir) as 1 | -1;
  let tunnelY = ey;
  for (let step = 0; step < 400; step++) {
    const hh = rng.int(2, 4);
    for (let dy = -hh; dy < hh; dy++) {
      if (!st.inBounds(ex, tunnelY + dy)) continue;
      const i = st.idx(ex, tunnelY + dy);
      st.type[i] = 0; st.flags[i] = 0;
    }
    ex += edir;
    if (step % rng.int(9, 13) === 0) tunnelY++;
    // 穿出判定:该列已无神庙砖/墙
    let inside = false;
    for (let y = Math.max(0, tunnelY - 30); y < Math.min(st.h, tunnelY + 30); y++) {
      if (st.type[st.idx(ex, y)] === BRICK || st.wall[st.idx(ex, y)] === 87) { inside = true; break; }
    }
    if (!inside && step > 10) break;
  }
  // 门(蜥蜴砖门 tile 10 style 11)
  if (st.inBounds(ex, tunnelY)) {
    let dy = 0;
    while (dy < 20 && !st.flags[st.idx(ex, tunnelY + dy)]) dy++;
    const jy = tunnelY + dy - 1;
    st.setTileSilent(ex, jy, DOOR, 11 * 54, 0);
  }
  // 祭坛(末间中心 3×2,tile 237 用 crystal_heart 近似?不——直接用 v_237 若有,否则跳过)
  const last = rooms[rooms.length - 1];
  const altarX = last.x + Math.floor(last.w / 2), altarY = last.y + Math.floor(last.h / 2);
  // 宝箱(蜥蜴砖箱 style 16 → 帧重排;我们的 chest 用 18px 帧,style16 用 frameY 偏移近似)
  for (let n = 0; n < Math.max(1, Math.floor(rooms.length * 0.35)); n++) {
    const r = rooms[rng.int(0, rooms.length - 1)];
    const bx = r.x + rng.int(4, Math.max(5, r.w - 6));
    const by = r.y + rng.int(4, Math.max(5, r.h - 6));
    if (!st.inBounds(bx, by) || st.flags[st.idx(bx, by)]) continue;
    st.setTileSilent(bx, by, CHEST, 0, 0);
    st.setTileSilent(bx + 1, by, CHEST, 18, 0);
    st.setTileSilent(bx, by + 1, CHEST, 0, 18);
    st.setTileSilent(bx + 1, by + 1, CHEST, 18, 18);
    chests.push({ x: bx, y: by, items: Array(10).fill(null) });
  }
  // 记录祭坛位置供后续(暂用 marker)
  void altarX; void altarY;
}

void T;
