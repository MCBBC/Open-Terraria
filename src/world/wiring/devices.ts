// HitWireSingle 器件分发表(Wiring.cs:829-2282 全表移植)。
// Wiring.ts 处理牵扯内部状态的核心 case(144 计时器/419 门灯/235 传送器/142-143 泵/429 彩线灯泡),
// 其余 case 在此按原版逐条移植;NetMessage 跳过(单机)。
// 行为无对应引擎系统的器件(音乐盒/派对/天塔柱等)按"帧翻转 + toast 占位"处理,注释标明。
import type { Wiring } from '../Wiring';
import { TILE_BY_KEY } from '../../data/tiles';

/** 器件运行环境(Game 实现;保持窄接口以便单测注入) */
export interface DeviceCtx {
  /** 按原版 item id 掉落物品 */
  dropItem(vanillaItemId: number, px: number, py: number): void;
  /** 按原版 npc id 生成敌人(雕像刷怪;返回是否成功) */
  spawnNpc(vanillaNpcId: number, px: number, py: number): boolean;
  /** NPC.MechSpawn（NPC.cs:7399-7483）：同 type（含等价组）200px≥3 / 600px≥6 / 全图≥10 拒绝 */
  mechSpawnOk(px: number, py: number, type: number): boolean;
  /** Item.MechSpawn（Item.cs:48982-49013）：同 item 300px≥3 / 800px≥6 / 全图≥10 拒绝 */
  itemSpawnOk(px: number, py: number, type: number): boolean;
  /** 投射物(飞镖/火焰/尖刺球/炮弹近似):vx/vy px/tick */
  shootProjectile(px: number, py: number, vx: number, vy: number, damage: number, kind: 'dart' | 'superdart' | 'flame' | 'spear' | 'spiky' | 'boulder' | 'geyser'): void;
  /** 统计附近某类投射物数量(尖刺球惩罚表用) */
  countProjectiles(kind: 'spiky', px: number, py: number, radius: number): number;
  /** 门开关(原版 HitWireSingle 10/11:随机方向+反向重试) */
  doorOpen(x: number, y: number): boolean;
  doorClose(x: number, y: number): boolean;
  /** 传送器对:搬迁判定框内的玩家/敌人(原版 Teleport :2314-2365) */
  teleportPair(a: [number, number], b: [number, number]): void;
  /** 城镇 NPC 搬迁雕像(style 40/41):group 0/1 白名单,搬到 (px,py) */
  relocateTownNpc(group: 0 | 1, px: number, py: number): boolean;
  /** 爆炸(炸药/地雷/炮弹):范围伤害+清格+粒子 */
  explode(tx: number, ty: number, damage: number): void;
  toast(msg: string): void;
  sfx(name: string, x?: number, y?: number): void; // 带坐标时按距离衰减/超距静音
  /** worldSurface(部分器件判定) */
  worldSurface: number;
}

/** 宝石块 off/on id 对(255-261 off ↔ 262-268 on,±7;Wiring.cs:863-873) */
const GEMSPARK_OFF = ['v_255_amethystgemsparkoff', 'v_256_topazgemsparkoff', 'v_257_sapphiregemsparkoff',
  'v_258_emeraldgemsparkoff', 'v_259_rubygemsparkoff', 'v_260_diamondgemsparkoff', 'v_261_ambergemsparkoff'];
const GEMSPARK_ON = ['v_262_amethystgemspark', 'v_263_topazgemspark', 'v_264_sapphiregemspark',
  'v_265_emeraldgemspark', 'v_266_rubygemspark', 'v_267_diamondgemspark', 'v_268_ambergemspark'];

/** 通电石/宝石块等的成对 tile id 切换 */
function swapTile(w: Wiring, x: number, y: number, fromKey: string, toKey: string): void {
  const st = w.st;
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  const cur = st.type[i];
  const from = TILE_BY_KEY[fromKey], to = TILE_BY_KEY[toKey];
  if (cur === from) st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
  else if (cur === to) st.setTile(x, y, from, st.frameX[i], st.frameY[i]);
}

/** 多格器件整体翻帧(篝火/壁炉/吊灯等通用模式,Wiring.cs:1003-1052 等):
 *  锚点 = (x - frameX%blockW/18, y - frameY%blockH/18);delta 由锚点帧阈值定;整体 SkipWire */
function flipBlock(
  w: Wiring, x: number, y: number,
  blockW: number, blockH: number, tilesW: number, tilesH: number,
  axis: 'x' | 'y', threshold: number, delta: number,
): void {
  const st = w.st;
  const i = st.idx(x, y);
  const ox = x - Math.floor(st.frameX[i] % blockW / 18);
  const oy = y - Math.floor(st.frameY[i] % blockH / 18);
  let d = delta;
  const ai = st.idx(ox, oy);
  if (axis === 'y' ? st.frameY[ai] >= threshold : st.frameX[ai] >= threshold) d = -delta;
  for (let ix = ox; ix < ox + tilesW; ix++) {
    for (let iy = oy; iy < oy + tilesH; iy++) {
      if (!st.inBounds(ix, iy)) continue;
      const ii = st.idx(ix, iy);
      w.skipCell(ix, iy);
      if (axis === 'y') st.setTile(ix, iy, st.type[ii], st.frameX[ii], st.frameY[ii] + d);
      else st.setTile(ix, iy, st.type[ii], st.frameX[ii] + d, st.frameY[ii]);
    }
  }
}

/** 单格帧翻转(火把/蜡烛等) */
function flipCell(w: Wiring, x: number, y: number, delta: number): void {
  const st = w.st;
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  let d = delta;
  if (st.frameX[i] >= delta) d = -delta;
  st.setTile(x, y, st.type[i], st.frameX[i] + d, st.frameY[i]);
}

/** 陷阱(137)发射(Wiring.cs:1495-1743 + Item.cs placeStyle)。frameY/18=种类:
 *  0飞镖(98) 1超级飞镖(184) 2烈焰(187,隐形+尘埃) 3尖刺球(185) 4长矛(186) */
function fireTrap(w: Wiring, ctx: DeviceCtx, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  const kind = Math.floor(st.frameY[i] / 18);
  if (kind === 0 || kind === 1 || kind === 2) {
    if (!w.checkMech(x, y, 200)) return;
    // 方向:frameX 0=左 18=右;frameY<36 平置 / ≥36 竖置(上下)
    const dirX = st.frameX[i] === 0 ? -1 : st.frameX[i] === 18 ? 1 : 0;
    const dirY = st.frameX[i] < 36 ? 0 : st.frameX[i] < 72 ? -1 : 1;
    const speed = kind === 0 ? 12 : kind === 1 ? 12 : 5;
    const dmg = kind === 0 ? 20 : 40;
    const px = x * 16 + 8 + 10 * dirX, py = y * 16 + 8 + 10 * dirY;
    ctx.shootProjectile(px, py, dirX * speed, dirY * speed, dmg, kind === 0 ? 'dart' : kind === 1 ? 'superdart' : 'flame');
  } else if (kind === 3) {
    // 尖刺球:CheckMech 300 + 同场数量惩罚表(Wiring.cs:1536-1599)
    if (!w.checkMech(x, y, 300)) return;
    let budget = 200;
    const near = ctx.countProjectiles('spiky', x * 16 + 8, y * 16 + 8, 1200);
    for (let k = 0; k < near; k++) {
      budget -= k < 1 ? 50 : k < 2 ? 15 : k < 4 ? 10 : k < 7 ? 8 : k < 12 ? 6 : k < 20 ? 5 : k < 38 ? 4 : k < 65 ? 3 : k < 105 ? 2 : 1;
    }
    if (budget <= 0) return;
    let dx = 0, dy = 0;
    switch (Math.floor(st.frameX[i] / 18)) {
      case 0: case 1: dy = 1; break;
      case 2: dy = -1; break;
      case 3: dx = -1; break;
      case 4: dx = 1; break;
    }
    const px = x * 16 + 8 + 14 * dx, py = y * 16 + 8 + 14 * dy;
    ctx.shootProjectile(px, py, dx * 4, dy * 4, 40, 'spiky');
  } else if (kind === 4) {
    // 下向火焰(CheckMech 90)
    if (!w.checkMech(x, y, 90)) return;
    let dx = 0, dy = 0;
    switch (Math.floor(st.frameX[i] / 18)) {
      case 0: dx = -1; break;
      case 1: dx = 1; break;
      case 2: dy = -1; break;
      case 3: dy = 1; break;
    }
    ctx.shootProjectile(x * 16 + 8 + 10 * dx, y * 16 + 8 + 10 * dy, dx * 8, dy * 8, 60, 'spear');
  }
}

/** 热喷泉 443(Wiring.cs:2284-2312;由 HitSwitch 直调) */
export function geyserTrap(w: Wiring, ctx: DeviceCtx, x: number, y: number): boolean {
  const st = w.st;
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const num = Math.floor(st.frameX[i] / 36);
  const i1 = x - Math.floor((st.frameX[i] - num * 36) / 18);
  if (!w.checkMech(i1, y, 200)) return false;
  const up = num < 2;
  ctx.shootProjectile(
    (i1 + 1) * 16, (y + (up ? 0 : 1)) * 16,
    0, up ? -8 : 8, 20, 'geyser',
  );
  return true;
}

/** 雕像 style → 原版 NPC id 表(Wiring.cs:1892-1996)。
 *  num79 = frameX/36 + (frameY/54 % 3) * 55 */
const STATUE_NPC: Record<number, number | number[]> = {
  5: 73, 13: 24, 30: 6, 35: 2,
  51: [299, 538], 52: 356, 53: 357, 54: [355, 358], 55: [367, 366],
  56: [359, 359, 359, 359, 360], 57: 377, 58: 300, 59: [364, 362], 60: 148, 61: 361,
  62: [487, 486, 485], 64: 86, 65: 490, 66: 82, 67: 449, 68: 167, 69: 480, 70: 48,
  71: [170, 180, 171], 72: 481, 73: 482, 74: 430, 75: 489, 76: 611, 77: 602,
  78: [595, 596, 599, 597, 600, 598], 79: [616, 617],
  80: [671, 672], 81: 673, 82: [674, 675], // 1.4.4+ 新雕像（:2260-2267）
};
/** flag7（生成区实心 → poof 不生成）的 style（:2270-2282；64=小丑? 71=史莱姆王组） */
const STATUE_SOLID_CHECK = new Set([64, 71]);
/** 单独分支的雕像 style（Wiring.cs :2290-2440）。dx/dy 为生成点偏移、
 *  solid=生成区实心时 poof、pool=随机池（28 蛇三色等） */
const STATUE_NPC_DIRECT: Record<number, { npc: number | number[]; dx?: number; dy?: number; solid?: boolean }> = {
  4: { npc: 1, dy: -12 },
  7: { npc: 49, dx: -4, dy: -6 },
  8: { npc: 55, dy: -12 },
  9: { npc: 46, dy: -12 },
  10: { npc: 21 },
  16: { npc: 42, dy: -12, solid: true },
  18: { npc: 67, dy: -12 },
  23: { npc: 63, dy: -12 },
  27: { npc: 85, dx: -9 },
  28: { npc: [74, 297, 298], dy: -12 },
  42: { npc: 58, dy: -12 },
  50: { npc: 65, solid: true }, // 史莱姆王雕像（:2385-2399）
};
/** 物品雕像 style → [原版 item id, ...MechSpawn 配额同查的等价 id]
 *  （2 星 184/1735/1868、17 炸弹 166、37 心 58/1734/1867；:2408-2420） */
const STATUE_ITEM: Record<number, { item: number; mechIds: number[] }> = {
  2: { item: 184, mechIds: [184, 1735, 1868] },
  17: { item: 166, mechIds: [166] },
  37: { item: 58, mechIds: [58, 1734, 1867] },
};

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** 雕像 105(Wiring.cs:1866-2215) */
function fireStatue(w: Wiring, ctx: DeviceCtx, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  // 锚点与 style(:1867-1879)
  const num73 = Math.floor(st.frameX[i] / 18);
  let num74 = 0;
  let rem = num73;
  while (rem >= 2) { rem -= 2; num74++; }
  const ox = x - rem;
  const ax = x - Math.floor(st.frameX[i] % 36 / 18);
  const ay = y - Math.floor(st.frameY[i] % 54 / 18);
  const num79 = Math.floor(st.frameX[i] / 36) + Math.floor(st.frameY[i] / 54 % 3) * 55;
  w.skipCell(ax, ay); w.skipCell(ax, ay + 1); w.skipCell(ax, ay + 2);
  w.skipCell(ax + 1, ay); w.skipCell(ax + 1, ay + 1); w.skipCell(ax + 1, ay + 2);
  const px = ax * 16 + 16, py = (ay + 3) * 16;
  // 生成区实心判定（:2274 SolidTiles(num139-2..num139+3, num138..num138+2)；flag7/部分直刷用）
  const spawnAreaSolid = () => {
    for (let sx = ax - 2; sx <= ax + 3; sx++) {
      for (let sy = ay; sy <= ay + 2; sy++) {
        if (st.inBounds(sx, sy) && st.isSolid(sx, sy)) return true;
      }
    }
    return false;
  };
  // NPC 雕像主表（spawn 于雕像底中心 (px,py)；:2268-2282）
  const entry = STATUE_NPC[num79];
  if (entry !== undefined) {
    const npcId = Array.isArray(entry) ? pick(entry) : entry;
    if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py, npcId)) {
      if (!STATUE_SOLID_CHECK.has(num79) || !spawnAreaSolid()) {
        ctx.spawnNpc(npcId, px, py);
      } else {
        ctx.sfx('tink', px, py);
      }
    }
    return;
  }
  // 单独分支 NPC 雕像（各自偏移/实心判定；:2290-2440）
  const direct = STATUE_NPC_DIRECT[num79];
  if (direct !== undefined) {
    const npcId = Array.isArray(direct.npc) ? pick(direct.npc) : direct.npc;
    if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py, npcId)) {
      if (!direct.solid || !spawnAreaSolid()) {
        ctx.spawnNpc(npcId, px + (direct.dx ?? 0), py + (direct.dy ?? 0));
      } else {
        ctx.sfx('tink', px, py);
      }
    }
    return;
  }
  // 物品雕像（CheckMech 600；心/星要过全部等价 id 的 MechSpawn 配额；:2408-2420）
  const itemEntry = STATUE_ITEM[num79];
  if (itemEntry !== undefined) {
    const ok = w.checkMech(ax, ay, 600)
      && itemEntry.mechIds.every((mid) => ctx.itemSpawnOk(px, py, mid));
    if (ok) ctx.dropItem(itemEntry.item, px, py - 16);
    return;
  }
  switch (num79) {
    case 34: { // 蘑菇雕像:2×3 变 tile 349 动画(:2108-2119)
      const T349 = TILE_BY_KEY['v_349_mushroom_statue'] ?? 0;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          st.setTile(ax + dx, ay + dy, T349, dx * 18 + 216, dy * 18);
        }
      }
      return;
    }
    case 40: case 41: // 城镇 NPC 搬迁(CheckMech 300,:2133-2186)
      if (w.checkMech(ax, ay, 300)) ctx.relocateTownNpc(num79 === 40 ? 0 : 1, px, py);
      return;
    case 63: // 随机传送雕像：164 + 额外 MechSpawn(165)（:2226-2229）
      if (w.checkMech(ax, ay, 30) && ctx.mechSpawnOk(px, py, 164) && ctx.mechSpawnOk(px, py, 165)) {
        ctx.spawnNpc(164, px, py);
      }
      return;
  }
}

/** 巨石雕像 531(Wiring.cs:1747-1762) */
function fireBoulderStatue(w: Wiring, ctx: DeviceCtx, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  const ox = x - Math.floor(st.frameX[i] % 36 / 18);
  const oy = y - Math.floor(st.frameY[i] % 36 / 18);
  if (!w.checkMech(ox, oy, 900)) return;
  w.skipCell(ox, oy); w.skipCell(ox + 1, oy); w.skipCell(ox, oy + 1); w.skipCell(ox + 1, oy + 1);
  ctx.shootProjectile(ox * 16 + 16, (oy + 1) * 16, 0, 0, 70, 'boulder');
}

/** 可接线灯器件的开关帧判定(Wiring.cs 翻帧 delta 推导):on = frame%(2δ) < δ。
 *  火把 δ=66(22px×3 变体一组)、蜡烛族 δ=18、2×2 灯具 δ=36、吊灯/彩灯 δ=54、篝火走 Y 轴 δ=36 */
export const LIGHT_TOGGLE: Record<number, ['x' | 'y', number]> = {
  4: ['x', 66],
  33: ['x', 18], 174: ['x', 18], 49: ['x', 18], 372: ['x', 18],
  42: ['x', 18], 92: ['x', 18], 93: ['x', 18],
  95: ['x', 36], 100: ['x', 36], 126: ['x', 36], 173: ['x', 36], 564: ['x', 36],
  34: ['x', 54], 149: ['x', 54],
  215: ['y', 36],
};

/** 该格灯光是否点亮(非灯器件恒 true;供 LightingEngine 查询) */
export function lightIsOn(sheet: number, frameX: number, frameY: number): boolean {
  const t = LIGHT_TOGGLE[sheet];
  if (!t) return true;
  const v = t[0] === 'x' ? frameX : frameY;
  return v % (2 * t[1]) < t[1];
}

/** HitWireSingle 器件主分发表。返回 true = 已处理 */
export function deviceTable(w: Wiring, ctx: DeviceCtx, sheet: number, x: number, y: number): boolean {
  const st = w.st;
  const i = st.idx(x, y);
  switch (sheet) {
    case 4: // 火把 frameX ±66(:1207-1213)
      flipCell(w, x, y, 66);
      return true;
    case 10: // 关门 → 开(随机方向+反向,原版 :1171-1188)
      ctx.doorOpen(x, y);
      return true;
    case 11:
      ctx.doorClose(x, y);
      return true;
    case 15: { // 马桶(frameY/40 判定,:1194-1204;喷水近似粒子)
      if (Math.floor(st.frameY[i] / 40) !== 1 && Math.floor(st.frameY[i] / 40) !== 20) return true;
      if (w.checkMech(x, y, 60)) ctx.sfx('splash', x * 16 + 8, y * 16 + 8);
      return true;
    }
    case 33: case 174: case 49: case 372: // 蜡烛族 frameX ±18(:1472-1480)
      flipCell(w, x, y, 18);
      return true;
    case 34: // 吊灯 3×3 frameX ±54(:1405-1428)
      flipBlock(w, x, y, 108, 54, 3, 3, 'x', 54, 54);
      return true;
    case 35: case 139: case 207: case 410: case 480: case 509:
      // 南瓜灯/八音盒/喷泉/三色天塔柱:原版 SwitchMB/SwitchFountain/SwitchMonolith。
      // 引擎暂无对应状态系统 → toast 占位
      ctx.toast('装置切换(音乐/喷泉/天塔柱系统未接入)');
      return true;
    case 42: // 挂链灯笼 1×2 frameX ±18(:1214-1227)
      flipBlock(w, x, y, 36, 36, 1, 2, 'x', 18, 18);
      return true;
    case 92: // 路灯柱 1×6 frameX ±18(:1483-1494)
      flipBlock(w, x, y, 18, 108, 1, 6, 'x', 18, 18);
      return true;
    case 93: // 蒂基火炬 1×3 frameX ±18(:1228-1243)
      flipBlock(w, x, y, 18, 54, 1, 3, 'x', 18, 18);
      return true;
    case 95: case 100: case 126: case 173: case 564: // 2×2 灯具族 frameX ±36(:1381-1404)
      flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
      return true;
    case 105:
      fireStatue(w, ctx, x, y);
      return true;
    case 130: { // 通电石:上方有宝箱则不缩(:878-884)
      const above = y > 0 ? w.sheetOf(x, y - 1) : -1;
      if (above === 21 || above === 88 || above === 467) return true;
      swapTile(w, x, y, 'v_130_active_stone_block', 'v_131_inactivestoneblock');
      return true;
    }
    case 131:
      swapTile(w, x, y, 'v_130_active_stone_block', 'v_131_inactivestoneblock');
      return true;
    case 137:
      fireTrap(w, ctx, x, y);
      return true;
    case 141: // 炸药:清格+爆炸(:1781-1785)
      w.skipCell(x, y);
      st.setTile(x, y, 0);
      ctx.explode(x, y, 500);
      return true;
    case 149: // 节日彩灯 frameX ±54(:1244-1250)
      flipCell(w, x, y, 54);
      return true;
    case 209: { // 大炮（Wiring.cs:1237-1346 1:1）：旋转+开火复合状态机。
      // num31=块内列(0/3=旋转态,1/2=待发) num32=行内偏移 num35=仰角带(frameY/54,0-8)
      // num36=水平带(frameX/72: 0/1=右向 大炮/兔兔炮, 3/4=左向)
      const num31 = Math.floor(st.frameX[i] % 72 / 18);
      const num32 = Math.floor(st.frameY[i] % 54 / 18);
      const ox = x - num31, oy = y - num32;
      const num35 = Math.floor(st.frameY[i] / 54);
      const num36 = Math.floor(st.frameX[i] / 72);
      let num37 = -1;
      if (num31 === 1 || num31 === 2) num37 = num32;
      // 旋转半边：列3 → 仰角 -54（带0停）；列0 → +54（带8停）
      let num38 = 0;
      if (num31 === 3) num38 = -54;
      if (num31 === 0) num38 = 54;
      if (num35 >= 8 && num38 > 0) num38 = 0;
      if (num35 === 0 && num38 < 0) num38 = 0;
      if (num38 !== 0) {
        for (let cx = ox; cx < ox + 4; cx++) {
          for (let cy = oy; cy < oy + 3; cy++) {
            if (!st.inBounds(cx, cy)) continue;
            w.skipCell(cx, cy);
            const ci = st.idx(cx, cy);
            st.setTile(cx, cy, st.type[ci], st.frameX[ci], st.frameY[ci] + num38);
          }
        }
      }
      // 水平朝向带翻转：3/4 带 + 行0/1 → frameX ±72（下一次触发反向）
      if ((num36 === 3 || num36 === 4) && (num37 === 0 || num37 === 1)) {
        const fx = num36 === 3 ? 72 : -72;
        for (let cx = ox; cx < ox + 4; cx++) {
          for (let cy = oy; cy < oy + 3; cy++) {
            if (!st.inBounds(cx, cy)) continue;
            w.skipCell(cx, cy);
            const ci = st.idx(cx, cy);
            st.setTile(cx, cy, st.type[ci], st.frameX[ci] + fx, st.frameY[ci]);
          }
        }
      }
      if (num37 === -1) return true; // 只旋转未开火
      // 开火半边：半仰角(<2)时左向(带3/4)不发射（flag2）
      const flag2 = !((num36 === 3 || num36 === 4) && num37 < 2);
      const damage = num36 === 0 ? 300 : num36 === 1 ? 350 : 40; // 兔兔炮350/普通300
      const time = num36 === 0 ? 480 : num36 === 1 ? 3600 : 30;
      if (!w.checkMech(ox, oy, time) || !flag2) return true;
      // ShootFromCannon(x, y, 仰角带, direction=num36+1)：方向1/2右 3/4左；弹药未接入以巨石近似
      const dirR = num36 <= 1 ? 1 : -1;
      const ang = (num35 * Math.PI) / 16; // 仰角带 0-8 ≈ 0-90°
      ctx.shootProjectile(ox * 16 + 24, oy * 16, dirR * 7 * Math.cos(ang), -7 * Math.sin(ang) - 2, damage, 'boulder');
      return true;
    }
    case 210: // 地雷:原版 ExplodeMine(:1786-1788)清格+爆炸
      st.setTile(x, y, 0);
      ctx.explode(x, y, 100);
      return true;
    case 212: { // 雪球发射器:CheckMech 10 发射(:946-1002)
      const ox = x - Math.floor(st.frameX[i] % 54 / 18);
      const oy = y - Math.floor(st.frameY[i] % 54 / 18);
      if (!w.checkMech(x, y, 10)) return true;
      ctx.shootProjectile(ox * 16 + 16, oy * 16, 8, -8, 20, 'boulder');
      return true;
    }
    case 215: // 篝火 3×2 frameY ±36(:1003-1020)
      flipBlock(w, x, y, 54, 36, 3, 2, 'y', 36, 36);
      return true;
    case 216: // 烟花火箭(:1189-1192;近似粒子升空)
      w.skipCell(x, y);
      ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
      return true;
    case 244: // 泡泡机 3×2 frameX ±54(:1272-1293)
      flipBlock(w, x, y, 54, 36, 3, 2, 'x', 54, 54);
      return true;
    case 255: case 256: case 257: case 258: case 259: case 260: case 261: { // 宝石块 off→on(:863-873)
      if (st.wire[i] & 16) return true; // 原版有致动器时不响应
      const to = TILE_BY_KEY[GEMSPARK_ON[sheet - 255]] ?? 0;
      if (to) st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
      return true;
    }
    case 262: case 263: case 264: case 265: case 266: case 267: case 268: { // on→off
      if (st.wire[i] & 16) return true;
      const to = TILE_BY_KEY[GEMSPARK_OFF[sheet - 262]] ?? 0;
      if (to) st.setTile(x, y, to, st.frameX[i], st.frameY[i]);
      return true;
    }
    case 314: // 压板轨道:CheckMech 5 + FlipSwitchTrack(:1429-1433;矿车系统占位)
      w.checkMech(x, y, 5);
      return true;
    case 335: // 烟花盒 2×2(:1294-1304)
      w.skipCell(x, y); w.skipCell(x + 1, y);
      if (w.checkMech(x, y, 30)) ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
      return true;
    case 338: // 烟花喷泉 1×2(:1305-1324)
      w.skipCell(x, y);
      if (w.checkMech(x, y, 30)) ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
      return true;
    case 386: case 387: { // 活板门开/关互换(ShiftTrapdoor;帧近似)
      const openK = 'v_386_trapdooropen', closedK = 'v_387_trap_door_closed';
      const toOpen = sheet === 387;
      const target = TILE_BY_KEY[toOpen ? openK : closedK] ?? 0;
      if (!target) return true;
      const ox = x - Math.floor(st.frameX[i] % 36 / 18);
      for (let ix = ox; ix < ox + 2; ix++) {
        if (!st.inBounds(ix, y)) continue;
        const ii = st.idx(ix, y);
        w.skipCell(ix, y);
        st.setTile(ix, y, target, (ix - ox) * 18, st.frameY[ii]);
      }
      return true;
    }
    case 388: case 389: { // 高门关/开互换(ShiftTallGate;帧近似)
      const openK = 'v_389_tallgateopen', closedK = 'v_388_tall_gate_closed';
      const toOpen = sheet === 388;
      const target = TILE_BY_KEY[toOpen ? openK : closedK] ?? 0;
      if (!target) return true;
      const ox = x - Math.floor(st.frameX[i] % 20 / 18);
      const oy = y - Math.floor(st.frameY[i] % 90 / 18);
      for (let ix = ox; ix < ox + 1; ix++) {
        for (let iy = oy; iy < oy + 5; iy++) {
          if (!st.inBounds(ix, iy)) continue;
          const ii = st.idx(ix, iy);
          w.skipCell(ix, iy);
          st.setTile(ix, iy, target, st.frameX[ii], st.frameY[ii]);
        }
      }
      return true;
    }
    case 405: // 壁炉 3×2 frameX ±54(:1021-1038)
      flipBlock(w, x, y, 54, 36, 3, 2, 'x', 54, 54);
      return true;
    case 406: // 烟囱 3×3 frameY +54/-108(:1039-1056)
      flipBlock(w, x, y, 54, 54, 3, 3, 'y', 108, 54);
      return true;
    case 411: // 引爆器 2×2 frameX ±36(:1057-1074)
      flipBlock(w, x, y, 36, 36, 2, 2, 'x', 36, 36);
      return true;
    case 421: case 422: { // 传送带反向互换(:844-861;有致动器不响应)
      if (st.wire[i] & 16) return true;
      const other = TILE_BY_KEY[sheet === 421 ? 'v_422_conveyor_belt_ccw' : 'v_421_conveyorbeltleft'] ?? 0;
      if (other) st.setTile(x, y, other, st.frameX[i], st.frameY[i]);
      return true;
    }
    case 425: // 广播盒:读木牌文本聊天近似(:1087-1131;引擎无木牌系统)
      w.skipCell(x, y); w.skipCell(x + 1, y);
      ctx.toast('📢 广播盒触发');
      return true;
    case 442: return true; // 投射物垫板(触发源侧处理)
    case 443:
      geyserTrap(w, ctx, x, y);
      return true;
    case 452: // 呆萌气球机 3×3 frameX ±54(:1132-1149)
      flipBlock(w, x, y, 54, 54, 3, 3, 'x', 54, 54);
      return true;
    case 455: // 派对中心(:1789-1791;派对系统占位)
      ctx.toast('🎉 派对开始!');
      return true;
    case 476: return true; // 高尔夫球洞(无高尔夫系统)
    case 497: // 马桶(frameY/40,同 case 15 分支)
      if (w.checkMech(x, y, 60)) ctx.sfx('splash', x * 16 + 8, y * 16 + 8);
      return true;
    case 506: // 巴斯特雕像 2×3 frameX ±72(:2239-2261)
      flipBlock(w, x, y, 72, 54, 2, 3, 'x', 72, 72);
      return true;
    case 531:
      fireBoulderStatue(w, ctx, x, y);
      return true;
    case 546: case 557: // 格栅开/关互换(:2262-2271)
      swapTile(w, x, y, 'v_546_grate', 'v_557_grateclosed');
      return true;
    case 565: // 造雾机 2×2 frameX ±36(:1358-1379)
      flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
      return true;
    case 593: // 小火山 frameX ±18(:1434-1445;动画近似粒子)
      flipCell(w, x, y, 18);
      ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
      return true;
    case 594: // 大火山 2×2 frameX ±36(:1446-1470)
      flipBlock(w, x, y, 72, 36, 2, 2, 'x', 36, 36);
      ctx.sfx('roar', x * 16 + 8, y * 16 + 8);
      return true;
  }
  return false;
}

/** 装配:把器件表挂到 Wiring(器件 case 之外的默认落点) */
export function attachDevices(w: Wiring, ctx: DeviceCtx): void {
  w.device = (ww, sheet, x, y) => deviceTable(ww, ctx, sheet, x, y);
  w.teleportPair = (a, b) => ctx.teleportPair(a, b);
}
