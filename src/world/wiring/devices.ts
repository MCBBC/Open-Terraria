// HitWireSingle 器件分发表(Wiring.cs:829-2282 全表移植)。
// Wiring.ts 处理牵扯内部状态的核心 case(144 计时器/419 门灯/235 传送器/142-143 泵/429 彩线灯泡),
// 其余 case 在此按原版逐条移植;NetMessage 跳过(单机)。
// 行为无对应引擎系统的器件(音乐盒/派对/天塔柱等)按"帧翻转 + toast 占位"处理,注释标明。
import type { Wiring } from '../Wiring';
import type { TrapShotKind } from '../../entities/Dart';
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
  /** 投射物(飞镖/火焰/尖刺球/炮弹/雪球/烟花族):vx/vy px/tick。
   *  form = 传送门弹 601 的 ai[0]（WorldGen.cs:50622-50631：ammo4→0 橙 / ammo5→1 蓝）；
   *  烟花族 = 色变体（167-170 / 415-418 / 419-422 减基址）。
   *  anchor = 喷泉弹锚点 tile（Projectile.ai[0]/ai[1]，Wiring.cs:1548） */
  shootProjectile(px: number, py: number, vx: number, vy: number, damage: number, kind: TrapShotKind, form?: number, anchor?: [number, number]): void;
  /** 喷泉去重（Wiring.cs:1529-1545）：同锚点是否已有 aiStyle73 弹在喷 */
  hasFountainAt?(tx: number, ty: number): boolean;
  /** 统计附近某类投射物数量(尖刺球惩罚表/兔兔炮场内上限用) */
  countProjectiles(kind: 'spiky' | 'bunny', px: number, py: number, radius: number): number;
  /** 门开关(原版 HitWireSingle 10/11:随机方向+反向重试) */
  doorOpen(x: number, y: number): boolean;
  doorClose(x: number, y: number): boolean;
  /** 传送器对:搬迁判定框内的玩家/敌人(原版 Teleport :2314-2365) */
  teleportPair(a: [number, number], b: [number, number]): void;
  /** 城镇 NPC 搬迁雕像(style 40/41):group 0/1 白名单,搬到 (px,py) */
  relocateTownNpc(group: 0 | 1, px: number, py: number): boolean;
  /** 爆炸(炸药/地雷/炮弹):范围伤害+清格+粒子 */
  explode(tx: number, ty: number, damage: number, radius?: number, destroyTiles?: boolean): void;
  toast(msg: string): void;
  sfx(name: string, x?: number, y?: number): void; // 带坐标时按距离衰减/超距静音
  /** 广播盒（425）：锚点 (x,y) 起的 2×2 内告示牌文本广播；无牌由引擎侧静默 */
  announce?(x: number, y: number): void;
  /** 派对纪念碑（455）：BirthdayParty.ToggleManualParty */
  toggleParty?(): void;
  /** 提取机通电转化（Wiring.cs:2572-2592 Extractinator）：锚点邻域箱子里自后向前找
   *  首个可提取物，消耗 1 并返回产物 {itemType, stack}；无箱/箱内无可转化返回 null */
  extractinatorPull(ax: number, ay: number, blockType: number): { itemType: number; stack: number } | null;
  /** 按原版 item id 掉落指定数量（提取机产物带 stack，钱币走 coin 体系） */
  dropItemStack(vanillaItemId: number, stack: number, px: number, py: number): void;
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

// ============ 器件态机族：八音盒 / 喷泉 / 天塔柱（原版"帧带 = 开关态"系统） ============
// 原版语义：Switch* 只翻帧（WorldGen.cs:50977-51209），激活态由 SceneMetrics 每帧扫描
// 视区 tile 帧读出（SceneMetrics.cs:471-585）→ BGM 覆盖（Main.cs:11002）/ 水色
// （Main.cs:56766-56770）/ 天空滤镜（SceneState.cs:111-115）。下方 *Of 为扫描侧共用读取器。

/** 音乐盒 style → MusicID 全表（Main.cs:11002-11403 ActiveMusicBox if-chain，100 条；
 *  style = tile 139 frameY/36，即放置物品 placeStyle = 曲目号）。
 *  style 100 = 静音（SceneMetrics.cs:474-480 frameY/36==100 → MusicBoxSilence）。
 *  【依赖登记】录制机制（空盒放置后 5 分钟内录当前曲，Player/Item 侧改 frameY）未移植；
 *  唱片物品的 placeStyle→曲目链在本表，放置物品接入后即全量生效 */
export const MB_STYLE_TO_MUSIC: readonly number[] = [
  1, 2, 3, 6, 4, 5, 7, 8, 10, 9,
  12, 11, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 29, 30, 31,
  32, 33, 38, 37, 35, 36, 34, 39, 40, 41,
  44, 48, 42, 43, 46, 47, 49, 51, 52, 53,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 70, 71, 72, 73,
  74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90, 91, 93, 96,
  95, 94, 97, 98, 92, 99, 101, 100, 104, 103,
];

/** 喷泉 style → 水色 id（SceneMetrics.cs:488-523 frameX/36 → ActiveFountainColor） */
const FOUNTAIN_COLOR = [0, 12, 3, 5, 2, 10, 4, 9, 8, 6];

/** 八音盒态（SceneMetrics.cs:471-486）：frameX≥36 = 开；曲目 = frameY/36；-1 = 关 */
export function musicBoxStyleOf(frameX: number, frameY: number): number {
  if (frameX < 36) return -1;
  return Math.floor(frameY / 36);
}

/** 喷泉态（SceneMetrics.cs:487-523）：frameY≥72 = 开；-1 = 关 */
export function fountainColorOf(frameX: number, frameY: number): number {
  if (frameY < 72) return -1;
  return FOUNTAIN_COLOR[Math.floor(frameX / 36)] ?? -1;
}

/** 天塔柱类型（SceneMetrics.cs:524-541）：410=style(frameX/36, 0星璇/1星云/2星尘/3耀斑)、
 *  509=4 月总；-1 = 关。480 血月柱走 bloodMoonMonolithOf。
 *  【依赖登记】657 回声/658 微光/720 CRT/721 复古/725 黑白/733 收音机柱的屏幕滤镜未接入 */
export function monolithTypeOf(sheet: number, frameX: number, frameY: number): number {
  if (sheet === 410) return frameY >= 56 ? Math.floor(frameX / 36) : -1;
  if (sheet === 509) return frameY >= 56 ? 4 : -1;
  return -1;
}

/** 血月柱（SceneMetrics.cs:542-546：480 frameY≥54 → BloodMoonMonolith →
 *  Main.cs:61417 并入 BloodMoonActive） */
export function bloodMoonMonolithOf(sheet: number, frameY: number): boolean {
  return sheet === 480 && frameY >= 54;
}

/** SwitchMB（WorldGen.cs:50977-51021 1:1）：八音盒 139 / 南瓜灯 35 共用。
 *  锚点：num3 = frameY/18 对 2 取余（行内偏移）、num4 = frameX/18 ≥2 再减 2（列内偏移）；
 *  2×2 区内 139/35 格 frameX ±36（<36 → +36，否则 -36），整体 SkipWire。
 *  电路触发（Wiring.cs:2019-2022）与右键（Player.cs:31759-31764，多播 SoundID 28）共用 */
export function switchMB(w: Wiring, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  let num3 = Math.floor(st.frameY[i] / 18);
  while (num3 >= 2) num3 -= 2;
  let num4 = Math.floor(st.frameX[i] / 18);
  if (num4 >= 2) num4 -= 2;
  const ox = x - num4, oy = y - num3;
  for (let k = ox; k < ox + 2; k++) {
    for (let l = oy; l < oy + 2; l++) {
      if (!st.inBounds(k, l)) continue;
      const sh = w.sheetOf(k, l);
      if (sh !== 139 && sh !== 35) continue;
      const ii = st.idx(k, l);
      const fx = st.frameX[ii] < 36 ? st.frameX[ii] + 36 : st.frameX[ii] - 36;
      st.setTile(k, l, st.type[ii], fx, st.frameY[ii]);
    }
  }
  w.skipCell(ox, oy); w.skipCell(ox + 1, oy);
  w.skipCell(ox, oy + 1); w.skipCell(ox + 1, oy + 1);
}

/** SwitchFountain（WorldGen.cs:51171-51209 1:1）：喷泉 207，2×4 区 frameY ±72。
 *  锚点：num3 = frameX/18 对 2 取余、num4 = frameY/18 ≥4 再减 4 */
export function switchFountain(w: Wiring, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  let num3 = Math.floor(st.frameX[i] / 18);
  while (num3 >= 2) num3 -= 2;
  let num4 = Math.floor(st.frameY[i] / 18);
  if (num4 >= 4) num4 -= 4;
  const ox = x - num3, oy = y - num4;
  for (let k = ox; k < ox + 2; k++) {
    for (let l = oy; l < oy + 4; l++) {
      if (!st.inBounds(k, l)) continue;
      w.skipCell(k, l);   // 原版 2×4 全区 SkipWire（:51200-51207，先于类型判定）
      if (w.sheetOf(k, l) !== 207) continue;
      const ii = st.idx(k, l);
      const fy = st.frameY[ii] < 72 ? st.frameY[ii] + 72 : st.frameY[ii] - 72;
      st.setTile(k, l, st.type[ii], st.frameX[ii], fy);
    }
  }
}

/** SwitchMonolith（WorldGen.cs:51023-51169 1:1）：天塔柱族 frameY 翻转。
 *  区块 2×3（733 为 3×3）；410 阈值 56，其余 54；658 为 +54 对 162 取模循环（三态）。
 *  电路触发（Wiring.cs:2032-2036）与右键（Player.cs:31801-31808）共用 */
export function switchMonolith(w: Wiring, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  const sheet = w.sheetOf(x, y);
  const bw = sheet === 733 ? 3 : 2;   // :51026-51028
  const bh = 3;
  let num3 = Math.floor(st.frameX[i] / 18);
  while (num3 >= bw) num3 -= bw;
  let num4 = Math.floor(st.frameY[i] / 18);
  while (num4 >= bh) num4 -= bh;
  const ox = x - num3, oy = y - num4;
  for (let k = ox; k < ox + bw; k++) {
    for (let l = oy; l < oy + bh; l++) {
      if (!st.inBounds(k, l)) continue;
      w.skipCell(k, l);   // 原版全区 SkipWire（:51156-51166，先于类型判定）
      const sh = w.sheetOf(k, l);
      if (sh < 0) continue;
      const ii = st.idx(k, l);
      let fy = st.frameY[ii];
      if (sh === 410) fy = fy < 56 ? fy + 56 : fy - 56;
      else if (sh === 658) fy = (fy + 54) % 162;   // :51131-51140
      else if (sh === 480 || sh === 509 || sh === 657 || sh === 720 || sh === 721 || sh === 725 || sh === 733) {
        fy = fy < 54 ? fy + 54 : fy - 54;
      } else continue;
      st.setTile(k, l, st.type[ii], st.frameX[ii], fy);
    }
  }
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

/** 马桶烟花（Wiring.cs:1498-1509）：tile 497 与 tile 15 马桶样式（frameY/40==1 或 20）共用。
 *  num68 = j - frameY%40/18（锚点上格）；SkipWire 两格；CheckMech(锚点, 60) → 弹 733
 *  ToiletEffect：静态水花发射器（速度 0 / damage 0），位于 (i*16+8, num68*16+12) */
function fireworkToilet(w: Wiring, ctx: DeviceCtx, x: number, y: number): void {
  const st = w.st;
  const i = st.idx(x, y);
  const num68 = y - Math.floor(st.frameY[i] % 40 / 18);
  w.skipCell(x, num68); w.skipCell(x, num68 + 1); // :1501-1502
  if (!w.checkMech(x, num68, 60)) return;          // :1503（60t 冷却）
  ctx.shootProjectile(x * 16 + 8, num68 * 16 + 12, 0, 0, 0, 'toiletPop'); // :1505
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
    case 15: { // 马桶椅样式（Wiring.cs:1498-1509 与 tile 497 共用分支；frameY/40==1 或 20）
      if (Math.floor(st.frameY[i] / 40) !== 1 && Math.floor(st.frameY[i] / 40) !== 20) return true;
      fireworkToilet(w, ctx, x, y);
      return true;
    }
    case 33: case 174: case 49: case 372: // 蜡烛族 frameX ±18(:1472-1480)
      flipCell(w, x, y, 18);
      return true;
    case 34: // 吊灯 3×3 frameX ±54(:1405-1428)
      flipBlock(w, x, y, 108, 54, 3, 3, 'x', 54, 54);
      return true;
    case 35: case 139: // 南瓜灯/八音盒：SwitchMB（WorldGen.cs:50977-51021；Wiring.cs:2019-2022）
      switchMB(w, x, y);
      return true;
    case 207: // 喷泉：SwitchFountain（WorldGen.cs:51171-51209；Wiring.cs:2023）
      switchFountain(w, x, y);
      return true;
    case 410: case 480: case 509: case 657: case 658: case 720: case 721: case 725: case 733:
      // 天塔柱族：SwitchMonolith（WorldGen.cs:51023-51169；Wiring.cs:2032-2036）
      switchMonolith(w, x, y);
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
    case 141: // 炸药(:1781-1785)：清格 + Projectile 108(500伤/半径10)
      w.skipCell(x, y);
      st.setTile(x, y, 0);
      ctx.explode(x, y, 500, 10);
      return true;
    case 149: // 节日彩灯 frameX ±54(:1244-1250)
      flipCell(w, x, y, 54);
      return true;
    case 219:
    case 642: { // 提取机（Wiring.cs:1993-1995 → Extractinator :2563-2593）：
      // 通电自动消耗邻域箱子里的可提取物。锚点按 3×3(54px) 帧内偏移回算（:2567-2568），
      // 冷却 checkMech 60t（:2569/:2571）；箱子查找/消耗/掉落在 ctx（Game 侧拥有箱子与物品栏）。
      const ax = x - Math.floor(st.frameX[i] % 54 / 18);
      const ay = y - Math.floor(st.frameY[i] % 54 / 18);
      if (!w.checkMech(ax, ay, 60)) return true;
      const out = ctx.extractinatorPull(ax, ay, sheet);
      if (out && out.itemType > 0) {
        // :2588 Item.NewItem(num*16, num2*16, 32, 32) → 锚点 2×2 判定框中心
        ctx.dropItemStack(out.itemType, out.stack, ax * 16 + 16, ay * 16 + 16);
      }
      return true;
    }
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
      // 开火半边：半仰角(<2)时左向(带3/4)不发射（flag2，Wiring.cs:1301-1304）
      const flag2 = !((num36 === 3 || num36 === 4) && num37 < 2);
      // 伤害/CheckMech 时长（Wiring.cs:1306-1330）：0=大炮 300/480，1=兔兔炮 350/3600，
      // 其余（3/4 传送门炮）damage 0 / time 30——原版 switch 只设这两档
      const damage = num36 === 0 ? 300 : num36 === 1 ? 350 : 0;
      const time = num36 === 0 ? 480 : num36 === 1 ? 3600 : 30;
      // 全局冷却门（Wiring.cs:1312-1314/1321-1323：冷却中直接返回）
      if (num36 === 0 && w.cannonCoolDown > 0) return true;
      if (num36 === 1 && w.bunnyCannonCoolDown > 0) return true;
      if (!flag2 || !w.checkMech(ox, oy, time)) return true;
      // WorldGen.ShootFromCannon（WorldGen.cs:50606-50718 1:1）
      // 弹种（:50611-50631）：ammo=num36+1 → 0→162 炮弹 / 1→281 爆炸兔兔 / 3·4→601（速度 3）
      const speed = num36 === 3 || num36 === 4 ? 3 : 14; // :50608 num=14f；601 时 num=3f(:50623/50628)
      // 初速方向表（:50640-50683）：仰角带 0-8 → (10,0)…(0,-10)…(-10,0)
      const ANGLE_V: Array<readonly [number, number]> = [
        [10, 0], [7.5, -2.5], [5, -5], [2.75, -6], [0, -10],
        [-2.75, -6], [-5, -5], [-7.5, -2.5], [-10, 0],
      ];
      const [bx, by] = ANGLE_V[num35] ?? [0, -10];
      // 归一化到 speed（:50706-50708 num8 = num/|v|）
      const len = Math.hypot(bx, by);
      const vx = (bx * speed) / len, vy = (by * speed) / len;
      // 出膛位置（:50685 (x+2)*16,(y+2)*16；601 仅加 (0/5,5) 偏移 :50689-50696）
      let px = (ox + 2) * 16, py = (oy + 2) * 16;
      if (num36 === 3 || num36 === 4) {
        if (num35 === 4) px += 5;
        py += 5;
      }
      // num36 3/4 原版发 PortalGunBolt 601（WorldGen.cs:50622-50631）：速度 3、damage 0、
      // ai[0] = ammo5 ? 1 : 0（传送门 form，橙 0/蓝 1）。撞块 → PortalHelper.TryPlacingPortal
      // 落门（entities/Portal.ts），不再沿用巨石弹体
      const kind: TrapShotKind = num36 === 0 ? 'cannonball' : num36 === 1 ? 'bunny' : 'portalbolt';
      const form = num36 === 4 ? 1 : 0; // :50622-50631（ammo4 → ai0=0 / ammo5 → ai0=1）
      // 全局冷却置位（Wiring.cs:1334-1339：大炮 120 / 兔兔炮 480）——先于弹内判定，
      // 与原版一致（冷却在 HitWireSingle 置位，BunnyCannonCanFire 在 ShootFromCannon 内）
      if (num36 === 0) w.cannonCoolDown = 120;
      if (num36 === 1) w.bunnyCannonCoolDown = 480;
      // 兔兔炮场内上限（WorldGen.cs:50697-50701 → BunnyCannonCanFire :50722-50760：
      //   NPC614+弹281 计数 ≥4 拒绝；NPC614 无对应实体，此处只数 281 弹）
      if (kind === 'bunny' && ctx.countProjectiles('bunny', px, py, Infinity) >= 4) return true;
      ctx.shootProjectile(px, py, vx, vy, damage, kind, form);
      return true;
    }
    case 210: // 地雷 ExplodeMine(:3093)：清格 + Projectile 164(250伤)——
      // 164 不在 ExplodeTiles 判定表内 = **不破坏地形**（纯伤害爆炸）
      st.setTile(x, y, 0);
      ctx.explode(x, y, 250, 0, false);
      return true;
    case 212: { // 雪球发射器（Wiring.cs:1345-1418 1:1）：旋转+开火复合状态机。
      // num51=块内列(0/2=旋转态,1=待发) num52=行内偏移 num55=朝向带(frameX/54,0左 1右)
      const num51 = Math.floor(st.frameX[i] % 54 / 18);
      const num52 = Math.floor(st.frameY[i] % 54 / 18);
      const ox = x - num51, oy = y - num52;
      const num55 = Math.floor(st.frameX[i] / 54);
      let num56 = -1;
      if (num51 === 1) num56 = num52;
      // 瞄准旋转：列0→frameX -54（带0停）、列2→+54（带1停）（:1359-1365）
      let num57 = 0;
      if (num51 === 0) num57 = -54;
      if (num51 === 2) num57 = 54;
      if (num55 >= 1 && num57 > 0) num57 = 0;
      if (num55 === 0 && num57 < 0) num57 = 0;
      if (num57 !== 0) {
        for (let cx = ox; cx < ox + 3; cx++) {
          for (let cy = oy; cy < oy + 3; cy++) {
            if (!st.inBounds(cx, cy)) continue;
            w.skipCell(cx, cy);
            const ci = st.idx(cx, cy);
            st.setTile(cx, cy, st.type[ci], st.frameX[ci] + num57, st.frameY[ci]);
          }
        }
      }
      if (num56 === -1) return true; // 只旋转未开火
      // 开火门（:1391）：全局冷却 0 + CheckMech(锚点,60)
      if (w.snowballCannonCoolDown > 0 || !w.checkMech(ox, oy, 60)) return true;
      w.snowballCannonCoolDown = 15; // :1393
      // 弹速（:1394）：12 + rand(0..449)*0.01 = 12.00..16.49
      const speed = 12 + Math.floor(Math.random() * 450) * 0.01;
      // 方向（:1395-1396）：X=rand(85..104) / Y=rand(-35..10)（Main.rand.Next 上界开区间）
      let dx = 85 + Math.floor(Math.random() * 20);
      const dy = -35 + Math.floor(Math.random() * 46);
      // 出膛位置（:1400 (x+2)*16-8,(y+2)*16-8）+ 朝向偏移（:1401-1405：左带 X-12 / 右带 X+12）
      let px = (ox + 2) * 16 - 8, py = (oy + 2) * 16 - 8;
      if (num55 === 0) { dx *= -1; px -= 12; } else { px += 12; }
      // 归一化到 speed（:1410-1415）后发射 166 雪球：35 伤 / 3.5 击退（:1397-1399）
      const len = Math.hypot(dx, dy);
      ctx.shootProjectile(px, py, (dx * speed) / len, (dy * speed) / len, 35, 'snowball');
      return true;
    }
    case 215: // 篝火 3×2 frameY ±36(:1003-1020)
      flipBlock(w, x, y, 54, 36, 3, 2, 'y', 36, 36);
      return true;
    case 216: { // 烟花火箭（Wiring.cs:1492-1495 → WorldGen.LaunchRocket WorldGen.cs:62184-62206）
      // LaunchRocket：行 = frameY/40（0-3 → 弹 167-170 红/绿/蓝/黄）；frameY%40==18 说明
      // 点的是下半格，锚点 y 上移（:62188-62194）
      let ly = y;
      if (st.frameY[i] % 40 === 18) ly--;
      // 发射位 (x*16+8, y*16+4+2)、速度 (0,-8)、damage 150 / kb 7（:62196-62199）
      ctx.shootProjectile(x * 16 + 8, ly * 16 + 6, 0, -8, 150, 'fireworkRocket', Math.floor(st.frameY[i] / 40));
      // 烟花方块是消耗品：发射即移除 1×2 两格（:62203-62204 active(false)）
      st.setTile(x, ly, 0);
      st.setTile(x, ly + 1, 0);
      w.skipCell(x, y); // SkipWire（Wiring.cs:1494）
      return true;
    }
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
    case 314: // 压板轨道（Wiring.cs:1429-1433）：CheckMech 5 + FlipSwitchTrack 翻转轨道指向。
      // 【依赖登记】FlipSwitchTrack 依赖矿车轨道系统（轨道帧族 314 的箭头帧语义），
      // 矿车系统接入前只走冷却注册，不翻帧
      w.checkMech(x, y, 5);
      return true;
    case 335: { // 烟花盒 2×2（Wiring.cs:1511-1523 → WorldGen.LaunchRocketSmall WorldGen.cs:62208-62222）
      const num72 = y - Math.floor(st.frameY[i] / 18);
      const num73 = x - Math.floor(st.frameX[i] / 18);
      w.skipCell(num73, num72); w.skipCell(num73 + 1, num72);
      w.skipCell(num73, num72 + 1); w.skipCell(num73 + 1, num72 + 1);
      if (!w.checkMech(num73, num72, 30)) return true; // CheckMech 30（:1518-1520）
      // LaunchRocketSmall：弹 415+rand(4)（红/绿/蓝/黄）、速度 (0,-8)、damage 0（:62213-62215）
      ctx.shootProjectile(num73 * 16 + 16, num72 * 16 + 2, 0, -8, 0, 'fireworksBoxRocket', Math.floor(Math.random() * 4));
      return true;
    }
    case 338: { // 烟花喷泉 1×2（Wiring.cs:1525-1553）
      const num69 = y - Math.floor(st.frameY[i] / 18);
      const num70 = x - Math.floor(st.frameX[i] / 18);
      w.skipCell(num70, num69); w.skipCell(num70, num69 + 1);
      if (!w.checkMech(num70, num69, 30)) return true; // CheckMech 30（:1538-1540）
      // 去重（:1542-1547）：同锚点已有 aiStyle73 弹在喷则不再生成
      if (ctx.hasFountainAt?.(num70, num69)) return true;
      // 弹 419+rand(4)（黄/红/蓝/彩虹），静态发射器（速度 0），ai[0]/ai[1] = 锚点（:1548-1550）
      ctx.shootProjectile(num70 * 16 + 8, num69 * 16 + 2, 0, 0, 0, 'fireworkFountain',
        Math.floor(Math.random() * 4), [num70, num69]);
      return true;
    }
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
    case 425: { // 广播盒（Wiring.cs:1177-1230 1:1）：锚点 2×2 内登记的告示牌文本 →
      // 粉色聊天广播（NewTextMultiline）；无牌/空文本静默返回。
      // AnnouncementBoxRange 默认 -1 = 全图（设置项，引擎暂未接设置门，恒全图）。
      // 【依赖登记】牌面文字编辑 UI 未接入（现存 signs 只读：墓碑/导入存档）
      const num5 = Math.floor(st.frameX[i] % 36 / 18);
      const num6 = Math.floor(st.frameY[i] % 36 / 18);
      const ox = x - num5, oy = y - num6;
      for (let m = ox; m < ox + 2; m++) {
        for (let n = oy; n < oy + 2; n++) {
          if (st.inBounds(m, n)) w.skipCell(m, n);
        }
      }
      ctx.announce?.(ox, oy);
      return true;
    }
    case 442: return true; // 投射物垫板(触发源侧处理)
    case 443:
      geyserTrap(w, ctx, x, y);
      return true;
    case 452: // 呆萌气球机 3×3 frameX ±54(:1132-1149)
      flipBlock(w, x, y, 54, 54, 3, 3, 'x', 54, 54);
      return true;
    case 455: // 派对纪念碑（Wiring.cs:2037-2039 → BirthdayParty.ToggleManualParty，
      // BirthdayParty.cs:145-163）：切换 ManualParty（开→升气球天/彩带，入夜 CheckNight 结束）
      ctx.toggleParty?.();
      return true;
    case 476: return true; // 高尔夫球洞(无高尔夫系统)
    case 497: // 马桶（Wiring.cs:1498-1509，与 tile 15 马桶样式共用分支）
      fireworkToilet(w, ctx, x, y);
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
