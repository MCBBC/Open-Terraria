// 原版 pass 76 "Traps" 1:1（1405 WorldGen.cs:8932-8984 + placeTrap:3324 + PlaceSandTrap:19962）。
// 全类型 placeTrap：0 飞镖（复用 DungeonPass 同构逻辑）/ 1 火焰 / 2 炸药桶 / 3 热喷泉，
// type=-1 随机（1/20 巨石；lavaLine+30 以下 5/6 热喷泉；否则 50/50 飞镖|火焰）。
// 地下沙漠 PlaceSandTrap（w*0.003）：蜂窝墙内砂岩顶掏沙穴——踩上即塌。
// RNG 映射：Next(a,b) → rng.int(a, b-1)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { TileStore as TS } from '../../TileStore';

const TRAP = TILE_BY_KEY['v_137_traps']!;
const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
const EXPLOSIVES = TILE_BY_KEY['v_141_explosives']!;  // tile 141 = 炸药桶（type 2 陷阱,非巨石——原版 cs:3568 即 141）
const GEYSER = TILE_BY_KEY['v_443_geyser']!;
const SAND = TILE_BY_KEY['sand']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;   // 396
const HARDSAND = TILE_BY_KEY['hardened_sand']!; // 397
const DOOR = TILE_BY_KEY['door_closed']!;
const GATE = TILE_BY_KEY['door_closed']!;               // tile 10
const SIGN = TILE_BY_KEY['sign'] ?? -1;
const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const WIRE_RED = TS.WIRE_RED;

const solidAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && !!(TILE_DEFS[st.type[st.idx(x, y)]]?.solid);

/** placeTrap 主体（cs:3324-3610）。type: 0 飞镖 / 1 火焰 / 2 巨石 / 3 热喷泉；-1 随机 */
export function placeTrap(st: TileStore, rng: RNG, gs: GenState, x2: number, y2: number, type = -1): boolean {
  // 下扫实心地面
  let j1 = y2;
  let deep = false;
  while (!solidAt(st, x2, j1)) {
    j1++;
    if (j1 > st.h - 10) return false;
    if (j1 >= st.h - 300) deep = true;
  }
  const px = x2, py = j1 - 1;
  // 邻蘑菇草(70) 20 格回避 / 蜥蜴墙 87 回避
  if (st.wall[st.idx(px, py)] === 87) return false;
  for (let yy = py - 20; yy <= py + 20; yy++) {
    for (let xx = px - 20; xx <= px + 20; xx++) {
      if (st.inBounds(xx, yy) && st.flags[st.idx(xx, yy)] && st.type[st.idx(xx, yy)] === (TILE_BY_KEY['v_70_mushroom_grass_block'] ?? -1)) return false;
    }
  }
  const lava = st.liquid[st.idx(px, py)] > 0 && st.liquidType[st.idx(px, py)] === 2;
  // type 随机（cs:3347-3351）
  if (type === -1 && rng.int(0, 19) === 0) type = 2;
  else if (type === -1 && py > gs.lavaLine + 30 && rng.int(0, 5) !== 0) type = 3;
  else if (type === -1) type = rng.int(0, 1);
  // 共同守卫（cs:3353-3356）
  if (!st.inBounds(px, py) || px < 3 || py < 3 || px > st.w - 4 || py > st.h - 4) return false;
  if (lava && type !== 3) return false;
  if (deep && type !== 3) return false;
  // 3×3×2 邻域须空
  for (const [ax, ay] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]] as const) {
    if (st.flags[st.idx(px + ax, py + ay)]) return false;
  }
  if (st.type[st.idx(px, py + 1)] === TILE_BY_KEY['v_48_spike']) return false;
  if (st.type[st.idx(px, py + 1)] === TILE_BY_KEY['v_232_wooden_spike']) return false;

  if (type === 1) {
    // 火焰陷阱（cs:3466-3537）：向上找实心底座 y=py-8±1，掏 2×N 竖井，铺大理石 1 顶
    const colX = px + rng.int(-1, 1);
    let y = py - 8;
    for (;;) {
      let solidRun = 0, n2 = 0;
      for (let yy = y; yy <= y + 3; yy++) {
        for (let xx = colX - 2; xx <= colX + 3; xx++) {
          if (!solidAt(st, xx, yy)) solidRun = 0;
          if (solidAt(st, xx, yy) && (st.type[st.idx(xx, yy)] === 1 || st.type[st.idx(xx, yy)] === 0 || st.type[st.idx(xx, yy)] === 59)) n2++;
        }
      }
      y--;
      if (y < gs.worldSurface) return false;
      if (solidRun === 0 && n2 > 2) break;
    }
    if (py - y <= 5 || py - y >= 40) return false;
    // 掏 2 宽竖井 y..py
    for (let xx = colX; xx <= colX + 1; xx++) {
      for (let yy = y; yy <= py; yy++) st.setTileSilent(xx, yy, 0);
    }
    // 6×6 转大理石（cs:3489-3496）
    const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
    for (let xx = colX - 2; xx <= colX + 3; xx++) {
      for (let yy = y - 2; yy <= y + 3; yy++) {
        if (solidAt(st, xx, yy)) st.setTileSilent(xx, yy, MARBLE);
      }
    }
    // 火焰陷阱体（137 kind2=frameY 36，cs:3505-3511 同构四段竖排）+ 板 style 7(frameX 126)
    st.setTileSilent(px, py, TRAP, 0, 36);
    for (const seg of [2, 3, 4]) {
      st.setTileSilent(colX, y + seg, TRAP, 0, 36);
      st.setTileSilent(colX + 1, y + seg, TRAP, 18, 36);
      wireV(st, colX, y + seg); wireV(st, colX + 1, y + seg);
    }
    // L 线 plate→trap（cs:3513-3530）；plate style 7（PlaceTile(135,...,7)）
    st.setTileSilent(px, py, PLATE, 126, 0);
    lWire(st, px, py, colX, y + 4);
    return true;
  }
  if (type === 2) {
    // 炸药桶陷阱（cs:3540-3585，type 2）：下钻 4-6 格实心 + 5×5 全实心 → 埋炸药 141 + 板 + L 线
    const drop = rng.int(4, 6);
    const bx = px + rng.int(-1, 1);
    let by = py;
    for (let k = 0; k < drop; k++) {
      by++;
      if (!solidAt(st, bx, by)) return false;
    }
    for (let xx = bx - 2; xx <= bx + 2; xx++) {
      for (let yy = by - 2; yy <= by + 2; yy++) {
        if (!solidAt(st, xx, yy)) return false;
      }
    }
    st.setTileSilent(bx, by, EXPLOSIVES, 0, rng.int(0, 1) * 18);
    st.setTileSilent(px, py, PLATE, st.wall[st.idx(px, py)] > 0 ? 36 : rng.int(2, 3) * 18, 0);
    lWire(st, px, py, bx, by);
    return true;
  }
  if (type === 3) {
    // 热喷泉（cs:3587-3610）：2×1，frameX = 18*k + 36*Next(2)；地狱带常伴岩浆
    if (st.flags[st.idx(px + 1, py)]) return false;
    for (let xx = px; xx <= px + 1; xx++) {
      if (!solidAt(st, xx, py + 1)) return false;
    }
    const fx = rng.int(0, 1);
    for (let k = 0; k < 2; k++) {
      st.setTileSilent(px + k, py, GEYSER, 18 * k + 36 * fx, 0);
    }
    return true;
  }
  // type 0：飞镖——与 DungeonPass.placeTrap0 同构（cs:3365-3420）
  return placeTrapDart(st, rng, gs, px, py);
}

function wireV(st: TileStore, x: number, y: number): void {
  st.wire[st.idx(x, y)] |= WIRE_RED;
}

/** L 形布线（先 x 后 y，cs:3400-3415 同构） */
function lWire(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  let wx = x0, wy = y0;
  while (wx !== x1 || wy !== y1) {
    wireV(st, wx, wy);
    if (wx > x1) wx--;
    else if (wx < x1) wx++;
    wireV(st, wx, wy);
    if (wy > y1) wy--;
    else if (wy < y1) wy++;
    wireV(st, wx, wy);
  }
}

/** 飞镖陷阱（cs:3365-3420）：压板行侧扫锚墙距离 5..49，嵌飞镖 + L 线 */
function placeTrapDart(st: TileStore, rng: RNG, gs: GenState, px: number, py: number): boolean {
  void gs;
  const j2 = py - rng.int(0, 2);
  const solidFor = (x: number, y: number) => solidAt(st, x, y)
    || (st.inBounds(x, y) && st.flags[st.idx(x, y)] && isCracked(st.type[st.idx(x, y)]));
  // 左扫
  let i1 = px;
  while (!solidFor(i1, j2)) { i1--; if (i1 < 0) return false; }
  const i2 = i1;
  // 右扫
  let i3 = px;
  while (!solidFor(i3, j2)) { i3++; if (i3 > st.w) return false; }
  const i4 = i3;
  let f3 = px - i2 > 5 && px - i2 < 50;
  let f4 = i4 - px > 5 && i4 - px < 50;
  if (f3 && !solidAt(st, i2, j2 + 1)) f3 = false;
  if (f4 && !solidAt(st, i4, j2 + 1)) f4 = false;
  const badAnchor = (t: number) => t === DOOR || t === (TILE_BY_KEY['v_48_spike'] ?? -1);
  if (f3 && (badAnchor(st.type[st.idx(i2, j2)]) || badAnchor(st.type[st.idx(i2, j2 + 1)]))) f3 = false;
  if (f4 && (badAnchor(st.type[st.idx(i4, j2)]) || badAnchor(st.type[st.idx(i4, j2 + 1)]))) f4 = false;
  let i5: number, dir: number;
  if (f3 && f4) {
    dir = 1; i5 = i2;
    if (rng.int(0, 1) === 0) { i5 = i4; dir = -1; }
  } else if (f4) { i5 = i4; dir = -1; }
  else if (f3) { i5 = i2; dir = 1; }
  else return false;
  if (st.type[st.idx(i5, j2)] === TILE_BY_KEY['v_190_glowing_mushroom_block']) return false;
  // 压板 + 飞镖 + L 线
  st.setTileSilent(px, py, PLATE, st.wall[st.idx(px, py)] > 0 ? 36 : rng.int(2, 3) * 18, 0);
  st.setTileSilent(i5, j2, TRAP, dir === 1 ? 18 : 0, 0);
  lWire(st, px, py, i5, j2);
  return true;
}

function isCracked(t: number): boolean {
  return t === (TILE_BY_KEY['v_481_cracked_blue_brick'] ?? -1)
    || t === (TILE_BY_KEY['v_482_cracked_green_brick'] ?? -1)
    || t === (TILE_BY_KEY['v_483_cracked_pink_brick'] ?? -1);
}

/** PlaceSandTrap（cs:19962-20085）：地下沙漠蜂窝墙内的塌沙陷阱 */
function placeSandTrap(st: TileStore, rng: RNG, i: number, j: number): boolean {
  const num2 = 4, num3 = 25;
  let y = j;
  while (!st.flags[st.idx(i, y)] && y < st.h - 200) y++;
  const gi = st.idx(i, y);
  if (!st.flags[gi]) return false;
  const t = st.type[gi];
  if (!(t === SAND || t === SANDSTONE || t === HARDSAND)) return false;
  if (st.wall[gi] !== 216 && st.wall[gi] !== 187) return false;
  const j1 = y - 1;
  let sandTop = -1;
  for (let yy = j1; yy > j1 - 30; yy--) {
    if (st.flags[st.idx(i, yy)]) {
      if (st.type[st.idx(i, yy)] !== SANDSTONE) return false;
      sandTop = yy;
      break;
    }
  }
  const pocketW = rng.int(6, 11);   // Next(6,12)
  const pocketH = rng.int(6, 13);   // Next(6,14)
  if (sandTop <= -1 || j1 - sandTop < pocketH + num2) return false;
  // ±25 无线/箱/画/门/闸/牌（cs:19987-19995）
  for (let dx = -num3; dx <= num3; dx++) {
    for (let dy = -num3; dy < num3; dy++) {
      const xx = i + dx, yy = j1 + dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      const tt = st.type[ii];
      if (st.wire[ii] || tt === CHEST || tt === CHEST2 || tt === DOOR || tt === GATE || tt === SIGN) return false;
    }
  }
  // ±2 下 3 格实心
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      if (!st.flags[st.idx(i + dx, j1 + dy)]) return false;
    }
  }
  // 腰线全空 + 下方实心率 75%（cs:20006-20024）
  const mid = Math.floor((j1 + sandTop) / 2);
  let solidN = 0;
  for (let dx = -pocketW; dx <= pocketW; dx++) {
    if (st.flags[st.idx(i + dx, mid)]) return false;
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const ii = st.idx(i + dx, dy);
      if (st.flags[ii] && solidAt(st, i + dx, dy)) {
        if (isOre(st.type[ii]) || st.type[ii] === HARDSAND) return false;
        solidN++;
      }
    }
  }
  if (solidN < (pocketW * 2 + 1) * (pocketH + 1) * 0.75) return false;
  // 掏沙穴 + 壳（cs:20028-20064）：中空纯沙，底/边砂岩，顶硬化沙
  for (let dx = -pocketW - 1; dx <= pocketW + 1; dx++) {
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const xx = i + dx, yy = dy;
      if (!st.inBounds(xx, yy)) continue;
      const flag = st.flags[st.idx(xx, yy)] && solidAt(st, xx, yy);
      if (dy === sandTop) {
        if (!flag) st.setTileSilent(xx, yy, SANDSTONE);
      } else if (dy === sandTop - pocketH) {
        st.setTileSilent(xx, yy, !flag || !st.flags[st.idx(xx, yy - 1)] ? SANDSTONE : HARDSAND);
      } else if (dx === -pocketW - 1 || dx === pocketW + 1) {
        if (!flag) st.setTileSilent(xx, yy, SANDSTONE);
      } else {
        st.setTileSilent(xx, yy, SAND);
      }
    }
  }
  return true;
}

let _oreSet: Set<number> | null = null;
function isOre(t: number): boolean {
  if (!_oreSet) {
    _oreSet = new Set<number>();
    TILE_DEFS.forEach((d, i) => { if (d?.key?.startsWith('ore_')) _oreSet!.add(i); });
  }
  return _oreSet.has(t);
}

/** pass 76 Traps 主体（cs:8936-8984）：w*0.05 次 placeTrap + w*0.003 次 PlaceSandTrap */
export function runTrapsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const trapTries = Math.floor(st.w * 0.05);
  for (let n = 0; n < trapTries; n++) {
    for (let k = 0; k < 1150; k++) {
      let x = rng.int(200, st.w - 201);                       // Next(200, w-200)
      let y = rng.int(gs.worldSurface, st.h - 211);           // Next(surface, h-210)
      // oceanDepths 回避
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      const beachL = gs.beachLeftEnd, beachR = st.w - gs.beachRightStart;
      while (y <= oceanTop && (x < beachL || x > beachR)) {
        x = rng.int(200, st.w - 201);
        y = rng.int(gs.worldSurface, st.h - 211);
      }
      if (st.wall[st.idx(x, y)] === 0 && placeTrap(st, rng, gs, x, y, -1)) break;
    }
  }
  const sandTries = Math.floor(st.w * 0.003);
  for (let n = 0; n < sandTries; n++) {
    for (let k = 0; k < 20000; k++) {
      const x = rng.int(Math.floor(st.w * 0.15), Math.floor(st.w * 0.85) - 1);
      const y = rng.int(gs.worldSurface + 20, st.h - 211);
      if (st.wall[st.idx(x, y)] === 187 && placeSandTrap(st, rng, x, y)) break;
    }
  }
}
