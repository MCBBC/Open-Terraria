// 原版地牢 1:1 复刻(MakeDungeon L18006 + DungeonHalls L20255 + DungeonRoom L20622
// + DungeonStairs L19855 + DungeonEnt L20726,算法文档 docs/vanilla-algos/dungeon.md)。
// 主链随机游走(每5步1/3概率分支/房间)+ 曲线房 + 到地表竖井 + 垛口锯齿入口塔
// + 门(style13)+ 尖刺(48)+ 金箱序列。砖 41/43/44 三主题(绿砖 43 素材已补入白名单)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
import { placeDoorClosed } from '../../Door';

const BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const GREEN = TILE_BY_KEY['v_43_green_brick']!;
const PINK = TILE_BY_KEY['v_44_pink_brick']!;
const CRACKED = [TILE_BY_KEY['v_481_cracked_blue_brick'] ?? BLUE];
const DOOR = TILE_BY_KEY['door_closed']!;
const CHEST = TILE_BY_KEY['chest']!;
const SPIKE = TILE_BY_KEY['v_48_spike']!;
const WORKBENCH = TILE_BY_KEY['workbench']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const CANDLE = TILE_BY_KEY['candle']!;

interface DRoom { cx: number; cy: number; l: number; r: number; t: number; b: number }

class DungeonCtx {
  brick: number; wall: number;
  minX = 0; maxX = 0; minYY = 0; maxY = 0;
  rooms: DRoom[] = [];
  entranceX = 0;
  lastHall: [number, number] = [0, 0];
  // 原版 L18045-18048:入口塔尺寸强度(竖井出口探测偏移用)
  dxS1 = 0; dyS1 = 0; dxS2 = 0; dyS2 = 0;
  // 门候选(cs L18158-18179 房左右墙 + L20500 水平走廊端点):pos 0=取最窄,-1=取最右,+1=取最左
  dDoors: Array<{ x: number; y: number; pos: number }> = [];
  constructor(brick: number, wall: number, x: number, y: number) {
    this.brick = brick; this.wall = wall;
    this.minX = this.maxX = x; this.minYY = this.maxY = y;
  }
  isDungeonWall(st: TileStore, x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const wl = st.wall[st.idx(x, y)];
    return wl === this.wall || (wl >= 94 && wl <= 99);
  }
  updateBBox(x: number, y: number) {
    this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }
}

export function runDungeonPass(st: TileStore, rng: RNG, gs: GenState, chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>): void {
  const { w, h } = st;
  const x0 = gs.dungeonLocation;
  if (x0 < 30 || x0 > w - 30) return;
  // 原版主题:Next(3) → 蓝41/墙7、绿43/墙8、粉44/墙9
  const theme = rng.int(0, 2);
  const brick = theme === 0 ? BLUE : theme === 1 ? GREEN : PINK;
  const wallId = brick === BLUE ? 7 : brick === GREEN ? 8 : 9;
  // 深度:找实心(L6565)
  let y0 = Math.floor((gs.worldSurface + gs.rockLevel) / 2) + rng.int(-200, 199);
  let solid = false;
  for (let d = 0; d < 10; d++) if (st.flags[st.idx(x0, y0 + d)]) { solid = true; break; }
  if (!solid) {
    const cap = Math.floor((gs.worldSurface + gs.rockLevel) / 2) + 200;
    while (y0 < cap && !st.flags[st.idx(x0, y0 + 10)]) y0++;
  }
  y0 = Math.max(gs.worldSurface + 10, Math.min(h - 220, y0));
  const dc = new DungeonCtx(brick, wallId, x0, y0);
  // 原版 L18045-18048:入口塔尺寸强度(DungeonEnt 与竖井出口探测共用)
  dc.dxS1 = rng.int(25, 29); dc.dyS1 = rng.int(20, 24);
  dc.dxS2 = rng.int(35, 49); dc.dyS2 = rng.int(10, 14);
  // ---- 主链随机游走(L18053)----
  let budget = w / 60 + rng.int(0, Math.max(1, Math.floor(w / 180)));
  let dx = x0, dy = y0;
  dungeonRoom(st, rng, gs, dc, dx, dy);
  let step5 = 5;
  while (budget > 0) {
    dc.updateBBox(dx, dy);
    budget--;
    step5--;
    if (step5 === 0 && rng.next() * 3 < 1) {
      step5 = 5;
      if (rng.next() < 0.5) {
        // 分支:保存位置→走廊(可能两条)+房→恢复
        const sx = dx, sy = dy;
        [dx, dy] = dungeonHalls(st, rng, gs, dc, dx, dy, false);
        if (rng.next() < 0.5) [dx, dy] = dungeonHalls(st, rng, gs, dc, dx, dy, false);
        dungeonRoom(st, rng, gs, dc, dx, dy);
        dx = sx; dy = sy;
      } else {
        dungeonRoom(st, rng, gs, dc, dx, dy);
      }
    } else {
      [dx, dy] = dungeonHalls(st, rng, gs, dc, dx, dy, false);
    }
  }
  dungeonRoom(st, rng, gs, dc, dx, dy);
  // ---- 竖井到地表(L18088)----
  let best = dc.rooms[0];
  for (const r of dc.rooms) if (r.t < best.t) best = r;
  dc.entranceX = best.cx;
  dx = best.cx; dy = best.cy;
  let shaft5 = 5;
  let guard = 0;
  while (guard++ < 500) {
    shaft5--;
    if (shaft5 === 0 && rng.next() * 5 < 1 && dy > gs.worldSurface + 100) {
      shaft5 = 10;
      const sx = dx, sy = dy;
      [dx, dy] = dungeonHalls(st, rng, gs, dc, dx, dy, true);
      dungeonRoom(st, rng, gs, dc, dx, dy);
      dx = sx; dy = sy;
    }
    const res = dungeonStairs(st, rng, gs, dc, dx, dy);
    dx = res[0]; dy = res[1];
    if (res[2]) break;
  }
  // ---- 入口(原版 L18088-18121 语义):塔建在楼梯出口正上方,天然连通下方竖井 ----
  // 兜底:楼梯没到地表则从当前位置直挖竖井到地表(垂直,保证衔接)
  if (dy > gs.worldSurface - 5) {
    let sx2 = dx, sy2 = dy;
    let guard2 = 0;
    while (sy2 > gs.worldSurface - 5 && guard2++ < 800) {
      for (let ax = -3; ax <= 3; ax++) {
        for (let ay = -3; ay <= 3; ay++) {
          if (!st.inBounds(sx2 + ax, sy2 + ay)) continue;
          const i = st.idx(sx2 + ax, sy2 + ay);
          st.flags[i] = 0; st.wall[i] = dc.wall;
        }
      }
      for (let ax = -4; ax <= 4; ax++) {
        for (let ay = -4; ay <= 4; ay++) {
          if (!st.inBounds(sx2 + ax, sy2 + ay)) continue;
          const i = st.idx(sx2 + ax, sy2 + ay);
          if (!dc.isDungeonWall(st, sx2 + ax, sy2 + ay)) { st.type[i] = dc.brick; st.flags[i] = 1; }
        }
      }
      sy2--;
    }
    dx = sx2; dy = sy2;
  }
  // 找楼梯出口列的真实地表,塔吸附其上
  let gY = 0;
  while (gY < st.h - 2 && !st.flags[st.idx(dx, gY)]) gY++;
  dungeonEnt(st, rng, gs, dc, dx, gY);
  // ---- 尖刺(L18188)----
  placeSpikes(st, rng, gs, dc, Math.floor(w / 100));
  // ---- 门(L18311)----
  placeDoors(st, rng, dc);
  // ---- 家具+金箱(L18792)----
  placeFurniture(st, rng, gs, dc, chests);
}

/** DungeonHalls(L20255):走廊随机游走 */
function dungeonHalls(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, ix: number, iy: number, forceX: boolean): [number, number] {
  let radius = rng.int(4, 5);
  const baseR = radius;
  let steps = rng.int(35, 79);
  if (forceX) steps += 20;
  else if (rng.next() < 0.2) { radius *= 2; steps = Math.floor(steps / 2); }
  // 危险走廊(原版 1/5):内部填裂砖而非挖空
  const dangerous = !forceX && rng.next() < 0.2;
  // 方向
  let vx = 0, vy = 0;
  {
    const horiz = forceX || rng.next() < 0.5;
    if (horiz) {
      vx = rng.next() < 0.5 ? 1 : -1;
      if (rng.next() < 1 / 3) vy = (rng.next() < 0.5 ? 1 : -1) * 0.2;
    } else {
      radius++;
      vy = rng.next() < 0.5 ? 1 : -1;
      if (rng.next() < 2 / 3) vx = (rng.next() < 0.5 ? 1 : -1) * rng.int(10, 19) * 0.1;
    }
    // 边界强制
    if (!forceX) {
      if (ix > st.w - 200) vx = -Math.abs(vx || 1);
      if (ix < 200) vx = Math.abs(vx || 1);
      if (iy > st.h - 300) vy = -Math.abs(vy || 1);
      if (iy < gs.rockLevel + 100) vy = Math.abs(vy || 1);
      // 边界三分带强制(cs L20474-20485):走廊被推向外侧——
      // 0.5w-0.75w → +1、0.25w-0.5w → -1(原版语义,铺向外侧三分而非向中心聚集)
      if (ix > st.w / 2 && ix < st.w * 0.75) vx = Math.abs(vx || 0.5);
      if (ix > st.w * 0.25 && ix < st.w / 2) vx = -Math.abs(vx || 0.5);
    }
    if (vx === 0 && vy === 0) vx = 1;
  }
  if (vx !== 0 && vy === 0 && rng.next() * 3 < 2 && !forceX) {
    radius = Math.floor(baseR * rng.int(110, 149) * 0.01);
  }
  let px = ix + 0.0, py = iy + 0.0;
  let driftFlip = 0;
  const driftThresh = rng.int(10, 19);
  const hasDrift = vx !== 0 && vy !== 0;
  while (steps > 0) {
    steps--;
    // 外框填砖(仅非地牢墙)
    const padX = radius + 4 + rng.int(0, 5);
    const padY = radius + 4 + rng.int(0, 5);
    for (let x = Math.floor(px - padX); x <= Math.floor(px + padX); x++) {
      for (let y = Math.floor(py - padY); y <= Math.floor(py + padY); y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.liquid[i] = 0;
        if (!dc.isDungeonWall(st, x, y)) {
          st.type[i] = dc.brick; st.flags[i] = 1;
        }
      }
    }
    dc.updateBBox(Math.floor(px), Math.floor(py));
    // 内缩 1 填墙
    for (let x = Math.floor(px - radius - 1); x <= Math.floor(px + radius + 1); x++) {
      for (let y = Math.floor(py - radius - 1); y <= Math.floor(py + radius + 1); y++) {
        if (!st.inBounds(x, y)) continue;
        const edge = Math.abs(x - px) > radius || Math.abs(y - py) > radius;
        if (edge) st.wall[st.idx(x, y)] = dc.wall;
      }
    }
    // 内部挖空(带随机扩孔)
    let expand = 0;
    if (vy === 0) { if (rng.next() * (radius + 1) < 1) expand = rng.int(1, 2); }
    else if (rng.next() * Math.max(1, radius - 1) < 1 || rng.next() * (radius * 3) < 1) expand = rng.int(1, 2);
    const innerX = radius * 0.5 + expand, innerY = radius * 0.5 + expand;
    for (let x = Math.floor(px - innerX); x <= Math.floor(px + innerX); x++) {
      for (let y = Math.floor(py - innerY); y <= Math.floor(py + innerY); y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (dangerous) {
          // 危险走廊:填裂砖(不可挖穿的陷阱段)
          if (st.flags[i] || !dc.isDungeonWall(st, x, y)) { st.type[i] = CRACKED[0]; st.flags[i] = 1; }
        } else {
          st.flags[i] = 0;
        }
        st.wall[i] = dc.wall;
      }
    }
    px += vx; py += vy;
    if (hasDrift && ++driftFlip > driftThresh) { driftFlip = 0; vx = -vx; }
    // 出界截断
    if ((vx > 0 && px > st.w - 100) || (vx < 0 && px < 100) || (vy > 0 && py > st.h - 100) || (vy < 0 && py < gs.rockLevel + 50)) steps = 0;
  }
  // 水平走廊端点记为门候选(cs L20496-20501)
  if (vy === 0) dc.dDoors.push({ x: Math.floor(px), y: Math.floor(py), pos: 0 });
  return [Math.floor(px), Math.floor(py)];
}

/** DungeonRoom(L20622):曲线漂移房 */
function dungeonRoom(st: TileStore, rng: RNG, _gs: GenState, dc: DungeonCtx, ix: number, iy: number): void {
  const size = rng.int(15, 29);
  const steps = rng.int(10, 19);
  let px = ix + 0.0, py = iy - size / 2 + 0.0;
  let vx = rng.int(-10, 10) * 0.1, vy = rng.int(-10, 10) * 0.1;
  let rl = 1e9, rr = -1e9, rt = 1e9, rb = -1e9;
  for (let k = 0; k < steps; k++) {
    const outerX = size * 0.8 + 5, outerY = size * 0.8 + 5;
    for (let x = Math.floor(px - outerX); x <= Math.floor(px + outerX); x++) {
      for (let y = Math.floor(py - outerY); y <= Math.floor(py + outerY); y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.liquid[i] = 0;
        if (!dc.isDungeonWall(st, x, y)) { st.type[i] = dc.brick; st.flags[i] = 1; }
      }
    }
    dc.updateBBox(Math.floor(px), Math.floor(py));
    // 内缩 1 墙 + 内框挖空
    for (let x = Math.floor(px - size * 0.8); x <= Math.floor(px + size * 0.8); x++) {
      for (let y = Math.floor(py - size * 0.8); y <= Math.floor(py + size * 0.8); y++) {
        if (!st.inBounds(x, y)) continue;
        const edge = Math.abs(x - px) > size * 0.5 || Math.abs(y - py) > size * 0.5;
        const i = st.idx(x, y);
        if (edge) st.wall[i] = dc.wall;
        else {
          st.flags[i] = 0; st.wall[i] = dc.wall;
          rl = Math.min(rl, x); rr = Math.max(rr, x);
          rt = Math.min(rt, y); rb = Math.max(rb, y);
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05; vy += rng.int(-10, 10) * 0.05;
    vx = Math.max(-1, Math.min(1, vx)); vy = Math.max(-1, Math.min(1, vy));
  }
  dc.rooms.push({ cx: Math.floor(px), cy: Math.floor(py), l: rl, r: rr, t: rt, b: rb });
  // 门候选(cs L18158-18179):房左右墙外侧列的首个空格
  if (rl > 1 && rr < st.w - 2) {
    for (let y = rt; y <= rb; y++) {
      if (st.inBounds(rl - 1, y) && !st.flags[st.idx(rl - 1, y)]) { dc.dDoors.push({ x: rl - 1, y, pos: -1 }); break; }
    }
    for (let y = rt; y <= rb; y++) {
      if (st.inBounds(rr + 1, y) && !st.flags[st.idx(rr + 1, y)]) { dc.dDoors.push({ x: rr + 1, y, pos: 1 }); break; }
    }
  }
}

/** DungeonStairs(L19855):向上竖井到地表,返回 [x, y, reachedSurface] */
function dungeonStairs(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, ix: number, iy: number): [number, number, boolean] {
  const radius = rng.int(5, 8);
  const steps = rng.int(10, 29);
  let vx = ix <= dc.entranceX ? 1 : -1;
  if (ix > st.w - 400) vx = -1;
  if (ix < 400) vx = 1;
  let vy = -1;
  // 原版嵌套概率(cs L19871-19876):2/3 加速;否则 1/3 减速;再否则 1/6 快速上升
  if (rng.next() < 2 / 3) vx *= 1 + rng.int(0, 199) * 0.01;
  else if (rng.next() < 1 / 3) vx *= rng.int(50, 75) * 0.01;
  else if (rng.next() < 1 / 6) vy = -2;
  if (ix < st.w / 2 && vx < 0 && vx > -0.5) vx = -0.5;
  if (ix > st.w / 2 && vx > 0.5) vx = -0.5;
  // dungeonX 回拉:漂移超 ±60 强制折返(原版中线回拉的加强,入口落在地牢标记附近)
  const loc = gs.dungeonLocation;
  if (ix > loc + 60) vx = -Math.abs(vx || 0.5);
  if (ix < loc - 60) vx = Math.abs(vx || 0.5);
  let px = ix + 0.0, py = iy + 0.0;
  let reached = false;
  for (let k = 0; k < steps && !reached; k++) {
    // ---- 出口探测(cs L19900-19910):探测点偏移 X + (dxS1*0.6+dxS2)*朝地图中心方向 ----
    const toCenter = px > st.w / 2 ? -1 : 1;
    const probeX = Math.floor(px + dc.dxS1 * 0.6 * toCenter + dc.dxS2 * toCenter);
    const probeOff = Math.floor(dc.dyS2 * 0.5);
    if (py < gs.worldSurface - 5) {
      let open = true;
      for (let d = 0; d < 3; d++) {
        const yy = Math.floor(py - radius - 6 + probeOff - d);
        if (!st.inBounds(probeX, yy) || st.wall[st.idx(probeX, yy)] !== 0) { open = false; break; }
      }
      if (open) {
        reached = true;
        // 地表土丘(原版 TileRunner type -1 挖出,cs L19909)
        tileRunner(st, rng, gs, probeX, Math.floor(py - radius - 6 + probeOff), {
          strength: rng.int(25, 34), steps: rng.int(10, 19), type: -1, speedY: -1,
        });
      }
    }
    const padX = radius + 4 + rng.int(0, 5);
    const padY = radius + 4 + rng.int(0, 5);
    for (let x = Math.floor(px - padX); x <= Math.floor(px + padX); x++) {
      for (let y = Math.floor(py - padY); y <= Math.floor(py + padY); y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.liquid[i] = 0;
        if (!dc.isDungeonWall(st, x, y)) { st.type[i] = dc.brick; st.flags[i] = 1; }
      }
    }
    // 竖井外壳刷墙(cs L19924-19928):外框内缩 1 整片刷地牢墙
    for (let x = Math.floor(px - padX) + 1; x <= Math.floor(px + padX) - 1; x++) {
      for (let y = Math.floor(py - padY) + 1; y <= Math.floor(py + padY) - 1; y++) {
        if (st.inBounds(x, y)) st.wall[st.idx(x, y)] = dc.wall;
      }
    }
    // 内框挖空
    let expand = rng.next() * radius < 1 ? rng.int(1, 2) : 0;
    const inner = radius * 0.5 + expand;
    for (let x = Math.floor(px - inner); x <= Math.floor(px + inner); x++) {
      for (let y = Math.floor(py - inner); y <= Math.floor(py + inner); y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.flags[i] = 0; st.wall[i] = dc.wall;
      }
    }
    dc.updateBBox(Math.floor(px), Math.floor(py));
    px += vx; py += vy;
    if (py < gs.worldSurface) vy *= 0.98;
  }
  return [Math.floor(px), Math.floor(py), reached];
}

/** DungeonEnt(L20726-21273)逐行 1:1:两段式入口。
 * 主塔段:0.6±Next(2,5) 实心(内缩1刷墙)→ 垛口(5+Next(4) 宽)→ 顶齿(1+Next(2) 高,
 * 周期 2+Next(4))→ 下延到 worldSurface → 0.6 框刷墙×2 → 0.5 框清空(塔内厅)。
 * 外门厅段(中心 = 主塔中心 + (dx1*0.6+dx2*0.55)*dir, Y + dy1/2 - dy2/2):
 * 0.6±Next(1,3) 只填远侧半(dx2*0.5 内)→ 下延(全列刷墙)→ 0.5 边缘垛口+顶齿 →
 * 0.6 框清墙 → **0.5 框 active=false+wall=0(开放门厅,老头 NPC 位)** →
 * 100 列砖坡(对角步降) → 条纹窗墙(2-5 刷-2 倍跳) → 门洞 15×3+门 style13。 */
function dungeonEnt(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, i: number, j: number): void {
  // 清 ±60 液体
  for (let x = i - 60; x < i + 60; x++) {
    for (let y = j - 60; y < j + 60; y++) {
      if (!st.inBounds(x, y)) continue;
      st.liquid[st.idx(x, y)] = 0;
    }
  }
  const dx1 = rng.int(25, 29) + 0.0, dy1 = rng.int(20, 24) + 0.0;
  let cx = i + 0.0, cy = j - dy1 / 2; // 塔中心(vanilla vector2)
  dc.minYY = Math.floor(cy);
  const dir = i > st.w / 2 ? -1 : 1; // num2:背向地图中心
  const isDW = (x: number, y: number) => st.inBounds(x, y) && dc.isDungeonWall(st, x, y);
  const fillB = (x: number, y: number, paintWall: boolean) => {
    if (!st.inBounds(x, y)) return;
    const ti = st.idx(x, y);
    st.liquid[ti] = 0;
    if (!isDW(x, y)) {
      st.wall[ti] = 0;
      if (paintWall) st.wall[ti] = dc.wall;
      st.type[ti] = dc.brick; st.flags[ti] = 1;
    }
  };
  const extFill = (x: number, y: number, wallAll: boolean, innerW: boolean) => {
    if (!st.inBounds(x, y)) return;
    const ti = st.idx(x, y);
    st.liquid[ti] = 0;
    if (!isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
    if (wallAll || innerW) st.wall[ti] = dc.wall;
  };
  // ---- 主塔段主体(num3..num6)----
  const l1 = Math.floor(cx - dx1 * 0.6 - rng.int(2, 4));
  const r1 = Math.floor(cx + dx1 * 0.6 + rng.int(2, 4));
  const t1 = Math.floor(cy - dy1 * 0.6 - rng.int(2, 4));
  const b1 = Math.floor(cy + dy1 * 0.6 + rng.int(8, 15));
  for (let x = l1; x < r1; x++) {
    for (let y = t1; y < b1; y++) {
      fillB(x, y, x > l1 + 1 && x < r1 - 2 && y > t1 + 1 && y < b1 - 2);
    }
  }
  // 垛口(左右块 5+Next(4) 宽、3+Next(3) 高)
  for (const sd of [-1, 1]) {
    const bx0 = sd < 0 ? l1 : r1 - 5 - rng.int(0, 3);
    const bx1 = sd < 0 ? l1 + 5 + rng.int(0, 3) : r1;
    const by0 = t1 - 3 - rng.int(0, 2);
    for (let x = bx0; x < bx1; x++) for (let y = by0; y < t1; y++) fillB(x, y, false);
  }
  // 顶齿(齿高 1+Next(2),周期 2+Next(4):刷 num16 列跳 num16 列)
  const th1 = 1 + rng.int(0, 1);
  const tp1 = 2 + rng.int(0, 3);
  let cnt = 0;
  for (let x = l1; x < r1; x++) {
    for (let y = t1 - th1; y < t1; y++) fillB(x, y, false);
    if (++cnt >= tp1) { x += tp1; cnt = 0; }
  }
  // 下延到 worldSurface(num6 → worldSurface):填砖,内列刷墙
  for (let x = l1; x < r1; x++) {
    for (let y = b1; y < Math.min(st.h, Math.floor(gs.worldSurface)); y++) {
      extFill(x, y, false, x > l1 && x < r1 - 1);
    }
  }
  // 0.6 框刷墙(精确,无抖动)×2
  for (let pass = 0; pass < 2; pass++) {
    for (let x = Math.floor(cx - dx1 * 0.6) - (pass ? 1 : 0); x <= Math.floor(cx + dx1 * 0.6) + (pass ? 1 : 0); x++) {
      for (let y = Math.floor(cy - dy1 * 0.6) - (pass ? 1 : 0); y <= Math.floor(cy + dy1 * 0.6) + (pass ? 1 : 0); y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.wall[ti] = dc.wall;
      }
    }
  }
  // 0.5 框清空(塔内厅)
  for (let x = Math.floor(cx - dx1 * 0.5); x < Math.floor(cx + dx1 * 0.5); x++) {
    for (let y = Math.floor(cy - dy1 * 0.5); y < Math.floor(cy + dy1 * 0.5); y++) {
      if (!st.inBounds(x, y)) continue;
      const ti = st.idx(x, y);
      st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = dc.wall;
    }
  }
  // 塔底井口(连通楼梯竖井,原版由 DungeonStairs 自带)
  for (let x = -1; x <= 1; x++) {
    for (let y = Math.floor(cy + dy1 * 0.5); y < Math.floor(cy + dy1 * 0.5) + 4; y++) {
      if (st.inBounds(Math.floor(cx) + x, y)) {
        const ti = st.idx(Math.floor(cx) + x, y);
        st.flags[ti] = 0; st.wall[ti] = dc.wall;
      }
    }
  }
  // ---- 外门厅段 ----
  cx += dx1 * 0.6 * dir;
  cy += dy1 * 0.5;
  const dx2 = rng.int(35, 49) + 0.0, dy2 = rng.int(10, 14) + 0.0;
  cx += dx2 * 0.55 * dir;
  cy -= dy2 * 0.5;
  const l2 = Math.floor(cx - dx2 * 0.6 - rng.int(1, 2));
  const r2 = Math.floor(cx + dx2 * 0.6 + rng.int(1, 2));
  const t2 = Math.floor(cy - dy2 * 0.6 - rng.int(1, 2));
  const b2 = Math.floor(cy + dy2 * 0.6 + rng.int(6, 15));
  // 只填远侧半(num2<0 → x >= X-dx2*0.5;否则 x <= X+dx2*0.5-1)
  for (let x = l2; x < r2; x++) {
    for (let y = t2; y < b2; y++) {
      const far = dir < 0 ? x >= cx - dx2 * 0.5 : x <= cx + dx2 * 0.5 - 1;
      if (!far) continue;
      if (!st.inBounds(x, y)) continue;
      const ti = st.idx(x, y);
      st.liquid[ti] = 0;
      if (!isDW(x, y)) { st.wall[ti] = 0; st.type[ti] = dc.brick; st.flags[ti] = 1; }
    }
  }
  // 下延(全列刷墙)
  for (let x = l2; x < r2; x++) {
    for (let y = b2; y < Math.min(st.h, Math.floor(gs.worldSurface)); y++) extFill(x, y, true, false);
  }
  // 外段垛口(0.5 边缘:块1 从 num34(+1 若 dir<0) 起 5+Next(4) 宽;块2 [num35-5-Next(4), num35))
  const n34 = Math.floor(cx - dx2 * 0.5);
  let n35 = Math.floor(cx + dx2 * 0.5);
  const n36 = dir < 0 ? n34 + 1 : n34;
  {
    const by0 = t2 - 3 - rng.int(0, 2);
    for (let x = n36; x < n36 + 5 + rng.int(0, 3); x++) {
      for (let y = by0; y < t2; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (!isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
      }
    }
    const bx0 = n35 - 5 - rng.int(0, 3);
    for (let x = bx0; x < n35; x++) {
      for (let y = by0; y < t2; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (!isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
      }
    }
  }
  // 外段顶齿(dir<0 时 num35++)
  if (dir < 0) n35++;
  const th2 = 1 + rng.int(0, 1);
  const tp2 = 2 + rng.int(0, 3);
  cnt = 0;
  for (let x = n34 + 1; x < n35 - 1; x++) {
    for (let y = t2 - th2; y < t2; y++) {
      if (!st.inBounds(x, y)) continue;
      const ti = st.idx(x, y);
      st.liquid[ti] = 0;
      if (!isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
    }
    if (++cnt >= tp2) { x += tp2; cnt = 0; }
  }
  // 0.6 框清墙(开放感)
  for (let x = Math.floor(cx - dx2 * 0.6); x < Math.floor(cx + dx2 * 0.6); x++) {
    for (let y = Math.floor(cy - dy2 * 0.6); y < Math.floor(cy + dy2 * 0.6); y++) {
      if (!st.inBounds(x, y)) continue;
      st.liquid[st.idx(x, y)] = 0;
      st.wall[st.idx(x, y)] = 0;
    }
  }
  // 0.5 框:active=false + wall=0(开放门厅——老头 NPC 位)
  const n51 = Math.floor(cx - dx2 * 0.5), n52 = Math.floor(cx + dx2 * 0.5);
  const n53 = Math.floor(cy - dy2 * 0.5), n54 = Math.floor(cy + dy2 * 0.5);
  for (let x = n51; x < n52; x++) {
    for (let y = n53; y < n54; y++) {
      if (!st.inBounds(x, y)) continue;
      const ti = st.idx(x, y);
      st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 0;
    }
  }
  // 100 列砖坡(对角步降,清上方 4 行)
  {
    const slope = 100;
    let step = 0;
    if (dir === 1) {
      for (let x = n52; x < n52 + slope; x++) {
        step++;
        for (let y = n54 + step; y < n54 + slope; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== 3 && st.wall[ti] !== 83 && !isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
        }
      }
    } else {
      for (let x = n51; x > n51 - slope; x--) {
        step++;
        for (let y = n54 + step; y < n54 + slope; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== 3 && st.wall[ti] !== 83 && !isDW(x, y)) { st.type[ti] = dc.brick; st.flags[ti] = 1; }
        }
      }
    }
  }
  // 条纹窗墙([num61, num60) × [num53, num54+1],刷 2-5 列跳 2 倍)
  {
    const n61 = n58t(n51, dir), n60 = n59t(n52, dir);
    const sp = 2 + rng.int(0, 3);
    let c2 = 0;
    for (let x = n61; x < n60; x++) {
      for (let y = n53; y < n54 + 1; y++) {
        if (st.inBounds(x, y)) st.wall[st.idx(x, y)] = dc.wall;
      }
      if (++c2 >= sp) { x += sp * 2; c2 = 0; }
    }
  }
  // 门洞 15×3 + 门(style13):中心回退 dx2*0.6*dir,Y += dy2/2 后再 -1.5
  cx -= dx2 * 0.6 * dir;
  cy += dy2 * 0.5;
  cy -= 1.5;
  const dL = Math.floor(cx - 7.5), dR = Math.floor(cx + 7.5);
  const dT = Math.floor(cy - 1.5), dB = Math.floor(cy + 1.5);
  for (let x = dL; x < dR; x++) {
    for (let y = dT; y < dB; y++) {
      if (st.inBounds(x, y)) st.flags[st.idx(x, y)] = 0;
    }
  }
  if (dir < 0) cx -= 1;
  // 原版 L21242 PlaceTile(x, Y+1) → PlaceDoor 门顶在 Y-1（占 Y-1..Y+1，底格 = 旧单格位置）
  if (st.inBounds(Math.floor(cx), Math.floor(cy) - 1)) {
    placeDoorClosed(st, Math.floor(cx), Math.floor(cy) - 1, 13);
  }
  dc.minYY = Math.min(dc.minYY, Math.floor(j - dy1 / 2 - dy1 * 0.6) - 6);
  dc.entranceX = Math.floor(cx);
}

// 条纹窗墙左右界(原版 num60/num61)
function n58t(n51: number, dir: number): number {
  return dir < 0 ? n51 + 1 : n51 + 2;
}
function n59t(n52: number, dir: number): number {
  return dir < 0 ? n52 + 1 : n52 - 2;
}

/** 尖刺(L18188):两轮(水平带/竖直带) */
function placeSpikes(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, count: number): void {
  for (let round = 0; round < 2; round++) {
    for (let n = 0; n < count; n++) {
      const x = rng.int(dc.minX, Math.max(dc.minX + 1, dc.maxX));
      const y = rng.int(Math.max(gs.worldSurface, dc.minYY), Math.max(dc.minYY + 1, dc.maxY));
      if (!st.inBounds(x, y) || st.flags[st.idx(x, y)] || st.wall[st.idx(x, y)] !== dc.wall) continue;
      // 走到实心
      let cx = x, cy = y, found = false;
      for (let k = 0; k < 30; k++) {
        if (round === 0) cy += rng.next() < 0.5 ? 1 : -1; else cx += rng.next() < 0.5 ? 1 : -1;
        if (!st.inBounds(cx, cy)) break;
        if (st.flags[st.idx(cx, cy)]) { found = true; break; }
      }
      if (!found) continue;
      // 向开口两侧刻尖刺
      const len = rng.int(5, 12);
      for (let k = -len; k <= len; k++) {
        const sx = round === 0 ? cx + k : cx;
        const sy = round === 0 ? cy : cy + k;
        if (!st.inBounds(sx, sy)) continue;
        const i = st.idx(sx, sy);
        if (st.flags[i] && st.type[i] === dc.brick) st.type[i] = SPIKE;
      }
    }
  }
}

/** 门(L18311):房间左右边开口装门 */
/** 门(L18302-18430 1:1):±10 列扫描择优(span∈[3,20)、±20 内无他门、底部上 3 行净空),
 *  门柱填砖,style 13(1/3 概率按墙换 16/17/18) */
function placeDoors(st: TileStore, rng: RNG, dc: DungeonCtx): void {
  for (const d of dc.dDoors) {
    if (d.y < 2 || d.y >= st.h - 2) continue;
    let bestSpan = 100, bestX = 0;
    for (let x = d.x - 10; x < d.x + 10; x++) {
      if (x < 2 || x >= st.w - 2) continue;
      let yTop = d.y;
      while (yTop > 10 && !st.flags[st.idx(x, yTop)]) yTop--;
      if (st.type[st.idx(x, yTop)] !== dc.brick) continue;
      let yBot = d.y;
      while (yBot < st.h - 1 && !st.flags[st.idx(x, yBot)]) yBot++;
      if (st.type[st.idx(x, yBot)] !== dc.brick) continue;
      const span = yBot - yTop;
      if (span < 3 || span >= 20) continue;
      // ±20×(底±10) 内不得已有门
      let doorNear = false;
      for (let ix = x - 20; ix < x + 20 && !doorNear; ix++) {
        for (let iy = yBot - 10; iy < yBot + 10; iy++) {
          if (st.inBounds(ix, iy) && st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] === DOOR) { doorNear = true; break; }
        }
      }
      if (doorNear) continue;
      // 底部上方 3 行 x±3 须净空
      let clear = true;
      for (let iy = yBot - 3; iy < yBot && clear; iy++) {
        for (let ix = x - 3; ix <= x + 3; ix++) {
          if (st.inBounds(ix, iy) && st.flags[st.idx(ix, iy)]) { clear = false; break; }
        }
      }
      if (!clear) continue;
      let better = false;
      if (d.pos === 0 && span < bestSpan) better = true;
      else if (d.pos === -1 && x > bestX) better = true;
      else if (d.pos === 1 && (bestX === 0 || x < bestX)) better = true;
      if (better) { bestX = x; bestSpan = span; }
    }
    if (bestSpan >= 20) continue;
    const x = bestX;
    // 门洞:从候选 y 向下清到实心,向上找到实心顶
    let yDown = d.y;
    while (yDown < st.h - 1 && !st.flags[st.idx(x, yDown)]) yDown++;
    let yUp = d.y;
    while (yUp > 1 && !st.flags[st.idx(x, yUp)]) yUp--;
    const j2 = yDown - 1;
    const yFrom = yUp + 1;
    for (let y = yFrom; y < j2 - 2; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.type[i] = dc.brick; st.flags[i] = 1;
    }
    const style = rng.next() < 1 / 3 ? (dc.wall === 7 ? 16 : dc.wall === 8 ? 17 : 18) : 13;
    // 原版 L18404 PlaceTile(i2, j2) → 门顶在 j2-2（占 j2-2..j2）
    placeDoorClosed(st, x, j2 - 2, style);
    // 两侧门柱补砖(cs L18403-18429)
    for (const side of [x - 1, x + 1]) {
      if (side < 1 || side >= st.w - 1) continue;
      let yy = j2 - 3;
      while (yy > 1 && !st.flags[st.idx(side, yy)]) yy--;
      if (j2 - yy < j2 - yFrom + 5 && st.type[st.idx(side, yy)] === dc.brick) {
        for (let y = j2 - 4 - rng.int(0, 2); y > yy; y--) {
          const i = st.idx(side, y);
          st.type[i] = dc.brick; st.flags[i] = 1;
        }
      }
    }
  }
}

/** 家具+金箱(L18792 简化保留:工作台/桌椅/蜡烛 + 每房金箱) */
function placeFurniture(st: TileStore, rng: RNG, _gs: GenState, dc: DungeonCtx, chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>): void {
  for (const room of dc.rooms) {
    // 找房内空地(墙=地牢墙 且非实心)
    for (let n = 0; n < 8; n++) {
      const fx = rng.int(room.l + 1, Math.max(room.l + 2, room.r - 1));
      let fy = -1;
      for (let y = room.t; y <= room.b; y++) {
        if (st.inBounds(fx, y) && st.flags[st.idx(fx, y)]) { fy = y - 1; break; }
      }
      if (fy < 0 || !st.inBounds(fx, fy) || st.flags[st.idx(fx, fy)]) continue;
      const pick = rng.int(0, 2);
      if (pick === 0) st.setTileSilent(fx, fy, WORKBENCH, 0, 0);
      else if (pick === 1) st.setTileSilent(fx, fy, TABLE, 0, 0);
      else if (pick === 2) st.setTileSilent(fx, fy, CHAIR, rng.next() < 0.5 ? 18 : 0, 0);
      else st.setTileSilent(fx, fy, CANDLE, 0, 0);
      break;
    }
    // 金箱
    if (rng.next() < 0.75) {
      const bx = rng.int(room.l + 2, Math.max(room.l + 3, room.r - 2));
      let by = -1;
      for (let y = room.t; y <= room.b; y++) {
        if (st.inBounds(bx, y) && st.flags[st.idx(bx, y)]) { by = y - 1; break; }
      }
      if (by >= 1 && st.inBounds(bx, by) && !st.flags[st.idx(bx, by)] && st.inBounds(bx + 1, by)) {
        st.setTileSilent(bx, by, CHEST, 0, 0);
        st.setTileSilent(bx + 1, by, CHEST, 18, 0);
        st.setTileSilent(bx, by + 1, CHEST, 0, 18);
        st.setTileSilent(bx + 1, by + 1, CHEST, 18, 18);
        chests.push({ x: bx, y: by, items: Array(10).fill(null) });
      }
    }
  }
}
