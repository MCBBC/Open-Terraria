// 原版地牢 1:1 复刻(MakeDungeon L18006 + DungeonHalls L20255 + DungeonRoom L20622
// + DungeonStairs L19855 + DungeonEnt L20726,算法文档 docs/vanilla-algos/dungeon.md)。
// 主链随机游走(每5步1/3概率分支/房间)+ 曲线房 + 到地表竖井 + 垛口锯齿入口塔
// + 门(style13)+ 尖刺(48)+ 金箱序列。砖 41/43/44 三主题(绿砖 43 素材已补入白名单)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { tileRunner } from './TileRunner';
import { solidTile as solidTileHB } from './HalfBrickPass';
import { placeDoorClosed } from '../../Door';
import { furnitureStyleBase } from '../../FurnitureStyle';

const BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const GREEN = TILE_BY_KEY['v_43_green_brick']!;
const PINK = TILE_BY_KEY['v_44_pink_brick']!;
// 原版 DungeonCrawler.SetupDungeonGenVarVariables(cs L54-90)：裂砖随主题——
// 蓝41/墙7→481、绿43/墙8→482、粉44/墙9→483（此前恒 481，粉/绿地牢混蓝裂砖）
const CRACKED_FOR_BRICK: Record<number, number> = {
  [BLUE]: TILE_BY_KEY['v_481_cracked_blue_brick'] ?? BLUE,
  [GREEN]: TILE_BY_KEY['v_482_cracked_green_brick'] ?? GREEN,
  [PINK]: TILE_BY_KEY['v_483_cracked_pink_brick'] ?? PINK,
};
const DOOR = TILE_BY_KEY['door_closed']!;
const CHEST = TILE_BY_KEY['chest']!;
const SPIKE = TILE_BY_KEY['v_48_spike']!;
const WORKBENCH = TILE_BY_KEY['workbench']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const CANDLE = TILE_BY_KEY['candle']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const LANTERN = TILE_BY_KEY['lantern']!;
const CHANDELIER = TILE_BY_KEY['chandelier']!;
const WATER_CANDLE = TILE_BY_KEY['water_candle']!;
const BOOKS = TILE_BY_KEY['v_50_books']!;
const BOWLS = TILE_BY_KEY['v_103_bowls']!;
const STATUE = TILE_BY_KEY['v_105_statue']!;
const CANDELABRA = TILE_BY_KEY['candelabra']!;
const PIANO = TILE_BY_KEY['piano']!;
const DRESSER = TILE_BY_KEY['dresser']!;
const BENCH = TILE_BY_KEY['bench']!;
const BATHTUB = TILE_BY_KEY['bathtub']!;
const BED = TILE_BY_KEY['bed']!;
const LAMP = TILE_BY_KEY['v_93_lamps']!;
const CLOCK = TILE_BY_KEY['grandfather_clock']!;
const BOOKCASE = TILE_BY_KEY['bookcase']!;
const DSWITCH = TILE_BY_KEY['v_136_switch']!;
const HANGING = TILE_BY_KEY['v_240_wall_hangings_3x3']!;
const CATACOMB = TILE_BY_KEY['v_241_catacombs']!;
const PAINTING = TILE_BY_KEY['v_242_paintings_6x4']!;
const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table']!;
const BEWITCH = TILE_BY_KEY['v_354_bewitching_table']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const TRAP = TILE_BY_KEY['v_137_traps']!;
const BANNER = TILE_BY_KEY['v_91_banners']!;

interface DRoom { cx: number; cy: number; l: number; r: number; t: number; b: number }

class DungeonCtx {
  brick: number; wall: number; cracked: number;
  minX = 0; maxX = 0; minYY = 0; maxY = 0;
  rooms: DRoom[] = [];
  entranceX = 0;
  entStand: [number, number] | null = null; // 开放门厅可站立点（原版 dungeonX/Y 语义）
  lastHall: [number, number] = [0, 0];
  // SetupDungeonDataVariables 掷出的书架/灯笼样式（pass 头照原版序消费，陈设期取用）
  shelfStyles: number[] = [0, 0, 0];
  lanternStyles: number[] = [0, 0, 0];
  // 原版 L18045-18048:入口塔尺寸强度(竖井出口探测偏移用)
  dxS1 = 0; dyS1 = 0; dxS2 = 0; dyS2 = 0;
  // 门候选(cs L18158-18179 房左右墙 + L20500 水平走廊端点):pos 0=取最窄,-1=取最右,+1=取最左
  dDoors: Array<{ x: number; y: number; pos: number }> = [];
  // 房口平台候选(cs L18141-18156):房顶/房底首个开口列
  dPlatforms: Array<[number, number]> = [];
  constructor(brick: number, wall: number, x: number, y: number) {
    this.brick = brick; this.wall = wall;
    this.cracked = CRACKED_FOR_BRICK[brick] ?? brick;
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
  // ---- SetupDungeonData/SetupDungeonDataVariables 头部掷骰（cs:14821-14825 +
  // DungeonCrawler.cs:167-192/:243-274，须在入口预计算之前）----
  // 入口类型 2 掷（普通世界 flag 即真、循环只跑一轮；Dome/Tower 结果我方 legacy
  // 入口不消费，照掷）+ 书架/灯具样式三选不重复（陈设期取用）+
  // useSkewedDungeonEntranceHalls（值未消费照掷）。此前整组缺失且书架/灯样式骰
  // 挪到陈设期 → 共享单流自本 pass 起整体错位（2026-08-12 审计修正）
  rng.nextInt(3); rng.nextInt(3);
  const shelfStyles = [rng.int(9, 12), 0, 0];
  do { shelfStyles[1] = rng.int(9, 12); } while (shelfStyles[1] === shelfStyles[0]);
  do { shelfStyles[2] = rng.int(9, 12); } while (shelfStyles[2] === shelfStyles[0] || shelfStyles[2] === shelfStyles[1]);
  const lanternStyles = [rng.int(0, 6), 0, 0];
  do { lanternStyles[1] = rng.int(0, 6); } while (lanternStyles[1] === lanternStyles[0]);
  do { lanternStyles[2] = rng.int(0, 6); } while (lanternStyles[2] === lanternStyles[0] || lanternStyles[2] === lanternStyles[1]);
  rng.nextInt(4);
  // ---- 入口位置预计算(DungeonCrawler.cs:275-318 + :818-849):仅 Dome/Tower 入口
  // 设 PrecalculateEntrancePosition=true;Legacy(普通世界默认)为 false →
  // SetupDungeonDataVariables 在 useSkewed 掷后**直接 return,整段 ±300 拒绝采样
  // 不执行**,dungeonLocation 保持 Reset 值,入口由爬升大厅(MakeDungeon_Generate
  // NextEntranceHall_Legacy,DungeonCrawler.cs:443)自然爬出地表决定。
  // 此前误把该 Dome/Tower 专属漂移套在 legacy 上:接受条件只挡云与净空,沙丘顶
  // (越高越空)几乎必过 → 入口被系统性吸到沙丘顶,要塞东侧开口被沙丘封死
  // (2026-08-13 地牢走廊沙堵根因;顺带该循环多消耗 0~6000 颗共享流样本) ----
  const x0 = gs.dungeonLocation;
  if (x0 < 30 || x0 > w - 30) return;
  // 原版主题在 **Dunes pass 头**已掷（SetupDungeonGenVarVariables，cs:11542）；
  // 此处只消费 gs.dungeonTheme（-1=非原版管线直调时回退自掷）
  const theme = gs.dungeonTheme >= 0 ? gs.dungeonTheme : rng.int(0, 2);
  const brick = theme === 0 ? BLUE : theme === 1 ? GREEN : PINK;
  const wallId = brick === BLUE ? 7 : brick === GREEN ? 8 : 9;
  // 深度锚点:1456 Dungeon pass 主体(cs:14828-14870)1:1——
  // (worldSurface+rockLevel)/2 ± 200 起;下方 10 格内无实心则向下扫到实心;
  // 起点即实心则**上爬至非实心(上限 60)再下压 60-num4**(原版 quirk,保证锚点
  // 埋在地表下);无任何 clamp(曾自加 worldSurface+10 钳制,非原版)
  let y0 = Math.floor((gs.worldSurface + gs.rockLevel) / 2) + rng.int(-200, 199);
  let solid = false;
  for (let d = 0; d < 10; d++) if (st.flags[st.idx(x0, y0 + d)]) { solid = true; break; }
  if (!solid) {
    const cap = Math.floor((gs.worldSurface + gs.rockLevel) / 2) + 200;
    while (y0 < cap && !st.flags[st.idx(x0, y0 + 10)]) y0++;
  }
  if (solid) {
    let up = 0;
    while (st.inBounds(x0, y0 - up) && st.flags[st.idx(x0, y0 - up)]) {
      up++;
      if (up === 60) break;
    }
    if (up < 60) y0 += 60 - up;
  }
  const dc = new DungeonCtx(brick, wallId, x0, y0);
  dc.shelfStyles = shelfStyles;
  dc.lanternStyles = lanternStyles;
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
  // ---- 爬升到地表(1456 语义,DungeonCrawler.cs L400-449):上限 100;num8 到 0 后
  // 每轮 1/5 概率 halls(forceX)+room 分支(原版 num8 保持在 0)。legacy 无预计算,
  // 只走盲爬一条路(cs:443 GenerateNextEntranceHall_Legacy) ----
  let best = dc.rooms[0];
  for (const r of dc.rooms) if (r.t < best.t) best = r;
  dc.entranceX = best.cx;
  // DungeonCrawler.cs:394 回写：generatingDungeonPositionX = 最高房中心 X
  // （Pyramids 地牢回避带 cs:15447 消费端——曾缺，Pyramids 误读 Reset 期 dungeonLocation）
  gs.generatingDungeonPositionX = dc.entranceX;
  dx = best.cx; dy = best.cy;
  {
    // legacy 盲爬(1405 结构 + 1456 的 100 上限):外壳探测到开放天空即停
    let reached = false;
    let delay = 5, guard = 0;
    while (!reached && guard++ < 100) {
      if (delay > 0) delay--;
      if (delay === 0 && rng.next() < 0.2 && dy > gs.worldSurface + 100) {
        delay = 10;
        const sx = dx, sy = dy;
        [dx, dy] = dungeonHalls(st, rng, gs, dc, dx, dy, true);
        dungeonRoom(st, rng, gs, dc, dx, dy);
        dx = sx; dy = sy;
      }
      const res = dungeonStairs(st, rng, gs, dc, dx, dy);
      dx = res[0]; dy = res[1];
      reached = res[2];
    }
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
    gs.dungeonY = gY;          // 入口地表 Y（刷怪门槛 CheckToSpawnDungeonEnemies）
  }
  if (dc.entStand) {
    gs.dungeonEntX = dc.entStand[0];
    gs.dungeonEntY = dc.entStand[1];
  }
  // ---- 房口平台候选(cs L18137-18180,与门候选同期收集)----
  for (const room of dc.rooms) {
    for (let x = room.l; x <= room.r; x++) {
      if (st.inBounds(x, room.t - 1) && !st.flags[st.idx(x, room.t - 1)]) { dc.dPlatforms.push([x, room.t - 1]); break; }
    }
    for (let x = room.l; x <= room.r; x++) {
      if (st.inBounds(x, room.b + 1) && !st.flags[st.idx(x, room.b + 1)]) { dc.dPlatforms.push([x, room.b + 1]); break; }
    }
  }
  // ---- 尖刺(L18188)----
  placeSpikes(st, rng, gs, dc, Math.floor(w / 100));
  // ---- 门(L18311)----
  placeDoors(st, rng, dc);
  // ---- 陈设管线(L18441-19613):墙变体→房口平台→特殊宝箱→书架平台→房间金箱→
  //      灯具+开关布线→陷阱→地面家具→墙饰→旗帜 ----
  placeFurnishing(st, rng, gs, dc, chests);
}

/** DungeonHalls(L20255):走廊随机游走 */
function dungeonHalls(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, ix: number, iy: number, forceX: boolean): [number, number] {
  let radius = rng.int(4, 5);
  const baseR = radius;
  let steps = rng.int(35, 79);
  // 危险走廊(LegacyDungeonHall.cs:206-209):CrackedBrickChance=0.166(DungeonHallSettings
  // .cs:15,Legacy 子类未覆写)先掷、恒消费——此前顺序对调且值用 0.2,还误加
  // !forceX 短路(forceX 也照掷)
  const dangerous = rng.next() <= 0.166;
  if (forceX) steps += 20;
  else if (rng.nextInt(5) === 0) { radius *= 2; steps = Math.floor(steps / 2); }
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
          if (st.flags[i] || !dc.isDungeonWall(st, x, y)) { st.type[i] = dc.cracked; st.flags[i] = 1; }
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
function dungeonStairs(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, ix: number, iy: number, precalc?: { vx: number; vy: number; steps: number }): [number, number, boolean] {
  const radius = rng.int(5, 8);
  const steps = precalc ? precalc.steps : rng.int(10, 29);
  let vx: number, vy: number;
  if (precalc) {
    // 1456 预计算模式:方向由直线段给定,跳过方向抽取/钳制/探测
    vx = precalc.vx; vy = precalc.vy;
  } else {
    vx = ix <= dc.entranceX ? 1 : -1;
    if (ix > st.w - 400) vx = -1;
    if (ix < 400) vx = 1;
    vy = -1;
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
  }
  let px = ix + 0.0, py = iy + 0.0;
  let reached = false;
  for (let k = 0; k < steps && !reached; k++) {
    // ---- 出口探测(cs L19900-19910,仅 legacy):探测点偏移 X+(dxS1*0.6+dxS2) 朝中心 ----
    if (!precalc) {
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
    }
    // 原版外壳:X 无抖动(cs L19891-19892),Y 带 Next(6) 抖动
    const padX = radius + 4;
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
    if (!precalc && py < gs.worldSurface) vy *= 0.98;
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
  // 开放门厅可站立点（原版 dungeonX/Y 语义 cs L72510-72527：入口结构上 3 宽净空可站处；
  // 老头 NPC 出生/游走锚）。取门厅中心列，向下找地板
  {
    const sx = Math.floor((n51 + n52) / 2);
    let sy = n54 - 1;
    const limit = Math.min(st.h - 3, n54 + 12);
    while (sy < limit && !st.isSolid(sx, sy)) sy++;
    if (sy < limit) dc.entStand = [sx, sy];
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

/** 家具+金箱（1405 L18792 段）：管线 1:1（见下）——房间金箱走 AddBuriedChest 下落语义，
 *  战利品序 155/156/157/163/113/3317/327/164；工作台/桌椅/蜡烛由第 7 段地面家具覆盖 */
// ============================================================================
// 地牢陈设管线(WorldGen.cs L18441-19613 1:1)
// 墙变体→房口平台→特殊宝箱(上锁)→书架平台+蜡烛/书→房间金箱→
// 灯具(吊灯/灯笼+墙上开关+布线)→飞镖陷阱→地面家具 13 类→墙饰(画/骨)→旗帜
// ============================================================================
/** TileID.Sets.Boulders（1456 TileID.cs:195）——AddBuriedChest ±2 邻域排除 */
const BOULDER_SHEETS_DP = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);

type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;

function placeFurnishing(st: TileStore, rng: RNG, gs: GenState, dc: DungeonCtx, chests: ChestSink): void {
  const { w } = st;
  const wallType = dc.wall;
  // 墙变体表(cs L18441-18458):7→94/95,9→96/97,8→98/99
  const roomWall = wallType === 7 ? [7, 94, 95] : wallType === 9 ? [9, 96, 97] : [8, 98, 99];
  const bx0 = dc.minX, bx1 = dc.maxX, by0 = dc.minYY, by1 = dc.maxY;
  const isBrick = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return !!(st.flags[i] && (st.type[i] === dc.brick || st.type[i] === dc.cracked));
  };
  const isDWall = (x: number, y: number): boolean => st.inBounds(x, y) && dc.isDungeonWall(st, x, y);
  const airDW = (x: number, y: number) => st.inBounds(x, y) && !st.flags[st.idx(x, y)] && dc.isDungeonWall(st, x, y);
  const solidAt = (x: number, y: number) => st.inBounds(x, y) && st.flags[st.idx(x, y)] && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;

  // ---- 1. 墙变体(cs L18460-18481):5 轮 × 3 变体,圆内种子点 WallDungeon BFS 扩散 ----
  for (let round = 0; round < 5; round++) {
    for (let k = 0; k < 3; k++) {
      const rad = rng.int(40, 239);
      const cx0 = rng.int(bx0, bx1), cy0 = rng.int(by0, by1);
      for (let x = cx0 - rad; x < cx0 + rad; x++) {
        for (let y = cy0 - rad; y < cy0 + rad; y++) {
          if (y <= gs.worldSurface) continue;
          if (Math.hypot(x - cx0, y - cy0) >= rad * 0.4) continue;
          if (!isDWall(x, y)) continue;
          wallDungeonSpread(st, x, y, roomWall[k]);
        }
      }
    }
  }

  // ---- 2. 房口平台(cs L18483-18598):候选行 ±5 找两侧皆砖的窄口,铺平台到两侧砖 ----
  const platFrameY = wallType === 7 ? 108 : wallType === 8 ? 144 : 126;
  for (const [px0, py0] of dc.dPlatforms) {
    let row = -1;
    const maxSpan = py0 < gs.worldSurface + 50 ? 20 : 10;
    for (let y = py0 - 5; y <= py0 + 5; y++) {
      if (!st.inBounds(px0, y)) continue;
      let bad = false;
      let xL = px0, xR = px0;
      if (st.flags[st.idx(px0, y)]) bad = true;
      else {
        while (st.inBounds(xL, y) && !st.flags[st.idx(xL, y)]) {
          xL--;
          if (!st.inBounds(xL, y) || !isBrick(xL, y)) { bad = true; break; }
        }
        while (st.inBounds(xR, y) && !st.flags[st.idx(xR, y)]) {
          xR++;
          if (!st.inBounds(xR, y) || !isBrick(xR, y)) { bad = true; break; }
        }
      }
      if (bad || xR - xL > maxSpan) continue;
      // 附近不得已有平台;本列上下 ±5/上下 8 格净空
      let hasPlat = false;
      for (let x = px0 - maxSpan / 2 - 2; x <= px0 + maxSpan / 2 + 2 && !hasPlat; x++) {
        for (let yy = y - 5; yy <= y + 5; yy++) {
          if (st.inBounds(x, yy) && st.type[st.idx(x, yy)] === PLATFORM && st.flags[st.idx(x, yy)]) { hasPlat = true; break; }
        }
      }
      for (let yy = y + 3; yy >= y - 5 && !hasPlat; yy--) {
        if (st.inBounds(px0, yy) && st.flags[st.idx(px0, yy)]) { hasPlat = true; break; }
      }
      if (hasPlat) continue;
      row = y;
      break;
    }
    if (row < 0 || row <= py0 - 10 || row >= py0 + 10) continue;
    // 向两侧铺平台直到实心
    for (let x = px0; st.inBounds(x, row) && !st.flags[st.idx(x, row)]; x--) {
      st.setTileSilent(x, row, PLATFORM, 0, platFrameY);
    }
    for (let x = px0 + 1; st.inBounds(x, row) && !st.flags[st.idx(x, row)]; x++) {
      st.setTileSilent(x, row, PLATFORM, 0, platFrameY);
    }
  }

  // ---- 3. 特殊宝箱(cs L18599-18657):5 个上锁箱(含生物群系箱) ----
  const specChests: Array<{ tile: number; style: number; item: string }> = [
    { tile: CHEST, style: 23, item: 'vi_1156_piranha_gun' },
    gs.crimson
      ? { tile: CHEST, style: 24, item: 'vi_1571_scourge_of_the_corruptor' }
      : { tile: CHEST, style: 25, item: 'vi_1569_vampire_knives' },
    { tile: CHEST, style: 26, item: 'vi_1260_rainbow_gun' },
    { tile: CHEST, style: 27, item: 'vi_1572_staff_of_the_frost_hydra' },
    { tile: CHEST2, style: 13, item: 'vi_4607_desert_tiger_staff' },
  ];
  for (const spec of specChests) {
    for (let tries = 0; tries < 5000; tries++) {
      const x = rng.int(bx0, bx1);
      const y = rng.int(Math.floor(gs.worldSurface), by1);
      if (airDW(x, y) && addChest(st, chests, x, y, spec.tile, spec.style, ITEM_BY_KEY[spec.item], true)) break;
    }
  }

  // ---- 4. 书架平台 + 蜡烛/书(cs L18658-18764):平台样式取 pass 头 SetupDungeonDataVariables 掷 ----
  const bookStyles = dc.shelfStyles;
  {
    let added = 0, fail = 0;
    while (added < Math.floor(w / 20)) {
      fail++;
      let x = rng.int(bx0, bx1);
      const y = rng.int(by0, by1);
      let ok = true;
      if (airDW(x, y)) {
        const dir = rng.int(0, 1) === 0 ? -1 : 1;
        // 侧向走到实心(须地牢砖)
        while (ok && !st.flags[st.idx(x, y)]) {
          x -= dir;
          if (x < 5 || x > st.w - 5) ok = false;
          else if (st.flags[st.idx(x, y)] && !isBrick(x, y)) ok = false;
        }
        if (ok && isBrick(x, y) && isBrick(x, y - 1) && isBrick(x, y + 1)) {
          const openX = x + dir;
          // ±3 内无平台
          let hasPlat = false;
          for (let dx = -3; dx <= 3 && !hasPlat; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
              if (st.inBounds(openX + dx, y + dy) && st.type[st.idx(openX + dx, y + dy)] === PLATFORM && st.flags[st.idx(openX + dx, y + dy)]) { hasPlat = true; break; }
            }
          }
          if (!hasPlat && !st.flags[st.idx(openX, y - 1)] && !st.flags[st.idx(openX, y - 2)] && !st.flags[st.idx(openX, y - 3)]) {
            // 量开口跨度
            let spanX = openX;
            while (spanX > bx0 && spanX < bx1 && !st.flags[st.idx(spanX, y)] && !st.flags[st.idx(spanX, y - 1)] && !st.flags[st.idx(spanX, y + 1)]) spanX += dir;
            const span = Math.abs(openX - spanX);
            if (span > 5) {
              const styleIdx = st.wall[st.idx(openX, y)] === roomWall[0] ? 0
                : st.wall[st.idx(openX, y)] === roomWall[1] ? 1 : 2;
              const withBooks = rng.int(0, 1) === 0;
              const runLen = rng.int(1, 3);
              for (let k = 0; k < runLen; k++) {
                const fx = openX + k * dir;
                if (!st.inBounds(fx, y) || st.flags[st.idx(fx, y)]) break;
                st.setTileSilent(fx, y, PLATFORM, 0, bookStyles[styleIdx] * 18);
                if (withBooks) {
                  st.setTileSilent(fx, y - 1, BOOKS, rng.int(0, 49) === 0 ? 90 : 0, 0);
                }
              }
              fail = 0;
              added++;
              if (!withBooks && rng.int(0, 1) === 0) {
                // 蜡烛/水蜡烛放在靠墙的开格上方(cs L18735-18754)
                if (rng.int(0, 3) !== 0) {
                  st.setTileSilent(openX, y - 1, CANDLE, rng.int(0, 1) !== 0 ? 0 : 18, rng.int(0, 3) * 22); // 蜡烛:亮灭 X 0/18,样式 Y 步22(Tiles_33 实测)
                } else {
                  st.setTileSilent(openX, y - 1, WATER_CANDLE, 0, 0);
                }
              }
            }
          }
        }
      }
      if (fail > 1000) { fail = 0; added++; }
    }
  }

  // ---- 5. 房间金箱(cs L18765-18820):战利品序 155/156/157/163/113/3317/327/164 ----
  {
    let seq = 1;
    const lootSeq: Array<{ item: string; style: number }> = [
      { item: 'vi_155_muramasa', style: 2 },
      { item: 'vi_156_cobalt_shield', style: 2 },
      { item: 'vi_157_aqua_scepter', style: 2 },
      { item: 'vi_163_blue_moon', style: 2 },
      { item: 'vi_113_magic_missile', style: 2 },
      { item: 'vi_3317_valor', style: 2 },
      { item: 'vi_327_golden_key', style: 0 },
      { item: 'vi_164_handgun', style: 2 },
    ];
    for (const room of dc.rooms) {
      const half = Math.floor((room.r - room.l) * 0.4);
      for (let tries = 0; tries < 1000; tries++) {
        const x = Math.floor((room.l + room.r) / 2) + rng.int(-half, half);
        const y = Math.floor((room.t + room.b) / 2) + rng.int(-half, half);
        if (seq === 1) seq = 2;
        let loot = lootSeq[Math.min(seq - 2, lootSeq.length - 1)];
        if (seq > lootSeq.length + 1) seq = 0;
        if (seq === 0) loot = lootSeq[lootSeq.length - 1];
        if (y < gs.worldSurface + 50) loot = { item: 'vi_327_golden_key', style: 0 };
        if (addChest(st, chests, x, y, CHEST, loot.style, ITEM_BY_KEY[loot.item], false)) {
          seq++;
          break;
        }
      }
    }
  }

  // ---- 边界外扩 ±25(cs L18821-18832),后续阶段用 ----
  const ex0 = Math.max(0, bx0 - 25), ex1 = Math.min(st.w - 1, bx1 + 25);
  const ey0 = Math.max(0, by0 - 25), ey1 = Math.min(st.h - 1, by1 + 25);

  // ---- 6. 灯具(cs L18865-19040):吊灯/灯笼 + 墙上开关 + 红线布线 ----
  {
    // 灯具样式取 pass 头 SetupDungeonDataVariables 掷（cs:256-266）
    const lampStyles = dc.lanternStyles;
    let added = 0, fail = 0;
    while (added < Math.floor(w / 150)) {
      fail++;
      const x = rng.int(ex0, ex1);
      const yStart = rng.int(ey0, ey1);
      if (isDWall(x, yStart)) {
        for (let y = yStart; y > ey0; y--) {
          if (!isBrick(x, y - 1)) break;
          // 附近 ±15 无灯具;灯位周围净空
          let near = false;
          for (let dx = -15; dx < 15 && !near; dx++) {
            for (let dy = -15; dy < 15; dy++) {
              const t = st.inBounds(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)] ? st.type[st.idx(x + dx, y + dy)] : 0;
              if (t === LANTERN || t === CHANDELIER) { near = true; break; }
            }
          }
          if (st.flags[st.idx(x - 1, y)] || st.flags[st.idx(x + 1, y)]
            || st.flags[st.idx(x - 1, y + 1)] || st.flags[st.idx(x + 1, y + 1)]
            || st.flags[st.idx(x, y + 2)]) near = true;
          if (!near) {
            let placedLight = false;
            if (rng.int(0, 6) === 0) {
              // 吊灯:下方 15 格内无实心才放(cs L18927-18936)
              let blocked = false;
              for (let k = 0; k < 15; k++) if (solidAt(x, y + k)) { blocked = true; break; }
              // 吊灯样式 Y 行54(wrap37 换列) 
              if (!blocked && placeFurn(st, x, y, CHANDELIER, roomWall[0] === 7 ? 27 : roomWall[0] === 8 ? 28 : 29, 'top', 1, true, 54))
              {
                placedLight = true;
                fail = 0; added++;
                wireToSwitch(st, rng, dc, x, y, ex0, ex1, ey0, ey1, isDWall, isBrick, true);
              }
            }
            if (!placedLight) {
              const styleIdx = st.wall[st.idx(x, y)] === roomWall[1] ? 1 : st.wall[st.idx(x, y)] === roomWall[2] ? 2 : 0;
              if (placeFurn(st, x, y, LANTERN, lampStyles[styleIdx], 'top', 1, true, 36)) { // 竖排样式行高36(TileLightScanner frameY/36 实证)
                fail = 0; added++;
                wireToSwitch(st, rng, dc, x, y, ex0, ex1, ey0, ey1, isDWall, isBrick, false);
              }
            }
          }
          break;  // 只取第一个天花板
        }
      }
      if (fail > 1000) { fail = 0; added++; }
    }
  }

  // ---- 7. 飞镖陷阱(MakeDungeon_Traps cs L18846-18863, w/500; placeTrap(x,y,0) 1:1) ----
  {
    // placeTrap type=0 分支（WorldGen.cs:3324-3420）：
    // 自采样点下扫首个实心格，其上方放压板(135)；压板行向两侧扫至锚墙（实心或裂砖
    // 481/482/483），挖一格嵌飞镖陷阱(137)；红线沿 L 路径（先 x 后 y）连板→陷阱。
    const CRACKED_SET = new Set<number>(
      ['v_481_cracked_blue_brick', 'v_482_cracked_green_brick', 'v_483_cracked_pink_brick']
        .map((k) => TILE_BY_KEY[k]).filter((t): t is number => t != null));
    const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
    const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block'] ?? 0;   // L3339 邻格回避
    const GLOW_SHROOM = TILE_BY_KEY['v_190_glowing_mushroom_block']!;   // L3385 锚墙回避
    const WOODEN_SPIKE = TILE_BY_KEY['v_232_wooden_spike']!;            // L3363 下方回避
    const typeAt = (x: number, y: number) => (st.inBounds(x, y) && st.flags[st.idx(x, y)] ? st.type[st.idx(x, y)] : 0);
    // SolidTile 或 tileCracked（cs L3366/L3374 侧扫把裂砖当锚）
    const trapSolid = (x: number, y: number) =>
      solidAt(x, y) || (st.inBounds(x, y) && st.flags[st.idx(x, y)] && CRACKED_SET.has(st.type[st.idx(x, y)]));
    const placeTrap0 = (x: number, y: number): boolean => {
      // L3326-3335: 下扫首个实心格（越界放弃）
      let j1 = y;
      while (!solidAt(x, j1)) {
        j1++;
        if (j1 > st.h - 10) return false;
      }
      const px = x, py = j1 - 1;
      const pi = st.idx(px, py);
      // L3339: 20 格内有蘑菇草(70)不放；蜥蜴砖unsafe墙(87)不放
      if (st.wall[pi] === 87) return false;
      for (let yy = py - 20; yy <= py + 20; yy++) {
        for (let xx = px - 20; xx <= px + 20; xx++) {
          if (typeAt(xx, yy) === MUSH_GRASS) return false;
        }
      }
      // L3341+L3345: 岩浆上不放（type 0）
      if (st.liquid[pi] > 0 && st.liquidType[pi] === 2) return false;
      if (px < 3 || py < 3 || px > st.w - 4 || py > st.h - 4) return false; // InWorld(,3)
      // L3352-3356: 压板落点 + 上方两行 3 列须全空（nactive 检查）
      for (const [ax, ay] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]] as const) {
        if (st.flags[st.idx(px + ax, py + ay)]) return false;
      }
      // L3357: 下方不能是尖刺(48)/木尖刺(232)
      const below = typeAt(px, py + 1);
      if (below === SPIKE || below === WOODEN_SPIKE) return false;
      // L3365-3420: type 0 —— 压板行 j2 = py - Next(3)
      const j2 = py - rng.int(0, 2);
      let i1 = px;
      while (!trapSolid(i1, j2)) { i1--; if (i1 < 0) return false; }
      const i2 = i1;
      let i3 = px;
      while (!trapSolid(i3, j2)) { i3++; if (i3 > st.w) return false; }
      const i4 = i3;
      // L3379-3391: 锚墙距离 5..49、脚下须实心、锚位非门(10)/尖刺(48)；双墙随机选边
      const num1 = px - i2, num2 = i4 - px;
      let f3 = num1 > 5 && num1 < 50;
      let f4 = num2 > 5 && num2 < 50;
      if (f3 && !solidAt(i2, j2 + 1)) f3 = false;
      if (f4 && !solidAt(i4, j2 + 1)) f4 = false;
      const badAnchor = (t: number) => t === DOOR || t === SPIKE;
      if (f3 && (badAnchor(typeAt(i2, j2)) || badAnchor(typeAt(i2, j2 + 1)))) f3 = false;
      if (f4 && (badAnchor(typeAt(i4, j2)) || badAnchor(typeAt(i4, j2 + 1)))) f4 = false;
      let i5: number, num3: number;
      if (f3 && f4) {
        num3 = 1; i5 = i2;
        if (rng.int(0, 1) === 0) { i5 = i4; num3 = -1; }
      } else if (f4) { i5 = i4; num3 = -1; }
      else if (f3) { i5 = i2; num3 = 1; }
      else return false;
      if (typeAt(i5, j2) === GLOW_SHROOM) return false;
      // L3391-3396: 压板(135)——背后有墙 style 2（frameX 36），否则 Next(2,4)；地牢恒有墙
      st.setTileSilent(px, py, PLATE, 0, st.wall[pi] > 0 ? 36 : rng.int(2, 3) * 18);
      // L3397-3399: 锚墙挖一格嵌飞镖陷阱(137)；墙在左(frameX 18)朝右，墙在右(frameX 0)朝左
      st.setTileSilent(i5, j2, TRAP, num3 === 1 ? 18 : 0, 0);
      // L3400-3415: 红线 L 路径（先 x 后 y，三段 wire 同原版逐段置位）
      let wx = px, wy = py;
      while (wx !== i5 || wy !== j2) {
        st.wire[st.idx(wx, wy)] |= TileStore.WIRE_RED;
        if (wx > i5) wx--; else if (wx < i5) wx++;
        st.wire[st.idx(wx, wy)] |= TileStore.WIRE_RED;
        if (wy > j2) wy--; else if (wy < j2) wy++;
        st.wire[st.idx(wx, wy)] |= TileStore.WIRE_RED;
      }
      return true;
    };
    // MakeDungeon_Traps：随机点须是地牢墙，placeTrap 成功或连败 1000 次计数
    let added = 0, fail = 0;
    while (added < Math.floor(w / 500)) {
      fail++;
      const x = rng.int(ex0, ex1);
      let y = rng.int(ey0, ey1);
      while (y < gs.worldSurface && y < ey1) y = rng.int(ey0, ey1);
      if (isDWall(x, y) && placeTrap0(x, y)) { fail = 0; added++; }
      if (fail > 1000) { fail = 0; added++; }
    }
  }

  // ---- 8. 地面家具(cs L19287-19613):13 类,2000×w/4200 次尝试 ----
  {
    // 样式表(cs L19317-19365,值=ItemID.Sets.DerivedPlacementDetails 逐项核对):
    // 墙 7 / 8 / 9。ftype3=书架 101(item1414-1416 → 1/2/3)、ftype10=路灯 93
    // (item2645-2647 → placeStyle 22+type-2643 = 24/25/26)、ftype11=烛台 100
    // (item2664-2666 → 22+type-2664 = 22/23/24)——灯/烛台两列曾互换、书架值曾
    // 贴给烛台（2026-08-12 审计修正）
    const S = wallType === 7
      ? [13, 10, 11, 1, 46, 1, 5, 11, 5, 6, 21, 24, 22, 30]
      : wallType === 8
        ? [14, 11, 12, 2, 47, 2, 6, 12, 6, 7, 22, 25, 23, 31]
        : [15, 12, 13, 3, 48, 3, 7, 13, 7, 8, 23, 26, 24, 32];
    const [sChair, sTable, sDresser, sCandle, sStatue, sBookcase, sBed, sPiano, sDresser2, sBench, sTub, sLamp, sCandelabra2, sClock] = S;
    let alchemyLeft = 1 + Math.floor(w / 4200);
    let bewitchLeft = 1 + Math.floor(w / 4200);
    const attempts = Math.floor(2000 * (w / 4200));
    // 死循环防护（2026-08-10，"生成卡死在生物群系"根因）：旧版 n-- 在循环顶无条件
    // 生效——炼金台/施法台未放完时，若有效性检查一直 continue（小世界地牢合法点位
    // 稀少），n 永不前进 → 生成挂死。现改为：①n-- 只在实际尝试放置（过了全部有效性
    // 检查）后才生效；②硬迭代上限兜底（placeFurn 持续失败也能终止）
    let hardGuard = attempts * 50;
    for (let n = 0; n < attempts && hardGuard-- > 0; n++) {
      let x = rng.int(ex0, ex1);
      let y = 0;
      for (let t = 0; t < 200; t++) {
        y = rng.int(Math.floor(gs.worldSurface) + 10, ey1);
        if (airDW(x, y)) break;
        x = rng.int(ex0, ex1);
      }
      if (!airDW(x, y)) continue;
      // 落到地面
      while (!solidAt(x, y) && y < st.h - 200) y++;
      const floorY = y - 1;
      // 量地板跨度
      let xL = x, xR = x;
      while (!st.flags[st.idx(xL, floorY)] && solidAt(xL, floorY + 1)) xL--;
      while (!st.flags[st.idx(xR, floorY)] && solidAt(xR, floorY + 1)) xR++;
      const span = xR - xL - 1;
      const cx0 = Math.floor((xR + xL) / 2);
      if (st.flags[st.idx(cx0, floorY)] || !isDWall(cx0, floorY) || !solidAt(cx0, floorY + 1)
        || (st.flags[st.idx(cx0, floorY + 1)] && st.type[st.idx(cx0, floorY + 1)] === SPIKE)) continue;
      // 家具类型与占地(cs L19383-19454)
      const sizes: Array<[number, number]> = [[5, 4], [4, 3], [3, 5], [4, 6], [3, 3], [5, 3], [5, 4], [5, 4], [5, 4], [5, 3], [2, 4], [3, 3], [2, 5]];
      let ftype = rng.int(0, 12);
      if ((ftype === 10 || ftype === 11 || ftype === 12) && rng.int(0, 3) !== 0) ftype = rng.int(0, 12);
      const wv = st.wall[st.idx(cx0, floorY)];
      const limited = wv >= 94 && wv <= 105;  // 变体墙只允许桌/梳妆台
      const allowed = limited ? ftype === 0 || ftype === 1 || ftype === 4 : true;
      if (!allowed) continue;
      const [halfW, hgt] = sizes[ftype];
      // 清空检查
      let clear = true;
      for (let dx = cx0 - halfW; dx <= cx0 + halfW && clear; dx++) {
        for (let dy = floorY - hgt; dy <= floorY; dy++) {
          if (st.inBounds(dx, dy) && st.flags[st.idx(dx, dy)]) { clear = false; break; }
        }
      }
      if (!clear || span < halfW * 1.75) continue;
      // 优先:炼金台/施法台(cs L19468-19482)。
      // n-- 移到此处（实际尝试放置才回退计数）——有效性 continue 不再消耗重试预算
      if (alchemyLeft > 0 || bewitchLeft > 0) n--;
      if (alchemyLeft > 0 || bewitchLeft > 0) {
        if (alchemyLeft > 0) {
          if (placeFurn(st, cx0, floorY, ALCHEMY, 0)) alchemyLeft--;
        } else if (placeFurn(st, cx0, floorY, BEWITCH, 0)) bewitchLeft--;
        continue;
      }
      switch (ftype) {
        case 0: {
          // 桌+双椅+桌上摆件
          if (!placeFurn(st, cx0, floorY, TABLE, sTable)) break;
          if (!st.flags[st.idx(cx0 - 2, floorY)]) {
            if (placeFurn(st, cx0 - 2, floorY, CHAIR, sChair)) flipFurn(st, cx0 - 2, floorY, CHAIR);
          }
          if (!st.flags[st.idx(cx0 + 2, floorY)]) placeFurn(st, cx0 + 2, floorY, CHAIR, sChair);
          for (let i = cx0 - 1; i <= cx0 + 1; i++) {
            if (rng.int(0, 1) === 0 && !st.flags[st.idx(i, floorY - 2)]) {
              const pick = rng.int(0, 4);
              if (pick <= 1) st.setTileSilent(i, floorY - 2, CANDLE, 0, sCandle * 22); // 样式竖排 Y 步22,亮态 X=0
              else if (pick === 2) st.setTileSilent(i, floorY - 2, WATER_CANDLE, 0, 0);
              else if (pick === 3) st.setTileSilent(i, floorY - 2, BOOKS, 0, 0);
              else st.setTileSilent(i, floorY - 2, BOWLS, 0, 0);
            }
          }
          break;
        }
        case 1: {
          if (!placeFurn(st, cx0, floorY, WORKBENCH, sDresser)) break;
          if (rng.int(0, 1) === 0) {
            if (!st.flags[st.idx(cx0 - 1, floorY)] && placeFurn(st, cx0 - 1, floorY, CHAIR, sChair)) {
              flipFurn(st, cx0 - 1, floorY, CHAIR);
            }
          } else placeFurn(st, cx0 + 2, floorY, CHAIR, sChair);
          for (let i = cx0; i <= cx0 + 1; i++) {
            if (rng.int(0, 1) === 0 && !st.flags[st.idx(i, floorY - 1)]) {
              const pick = rng.int(0, 4);
              if (pick <= 1) st.setTileSilent(i, floorY - 1, CANDLE, 0, sCandle * 22);
              else if (pick === 2) st.setTileSilent(i, floorY - 1, WATER_CANDLE, 0, 0);
              else if (pick === 3) st.setTileSilent(i, floorY - 1, BOOKS, 0, 0);
              else st.setTileSilent(i, floorY - 1, BOWLS, 0, 0);
            }
          }
          break;
        }
        case 2: placeFurn(st, cx0, floorY, STATUE, sStatue); break;
        case 3: placeFurn(st, cx0, floorY, BOOKCASE, sBookcase); break; // 书架 101(item1414-1416,横排)
        case 4: {
          if (placeFurn(st, cx0, floorY, CHAIR, sChair) && rng.int(0, 1) === 0) flipFurn(st, cx0, floorY, CHAIR);
          break;
        }
        case 5: placeFurn(st, cx0, floorY, BED, sBed, 'bottom', rng.int(0, 1) === 0 ? 1 : -1); break;
        case 6: placeFurn(st, cx0, floorY, PIANO, sPiano); break;
        case 7: placeFurn(st, cx0, floorY, DRESSER, sDresser2); break;
        case 8: placeFurn(st, cx0, floorY, BENCH, sBench); break;
        case 9: placeFurn(st, cx0, floorY, BATHTUB, sTub, 'bottom', rng.int(0, 1) === 0 ? 1 : -1); break;
        case 10: placeFurn(st, cx0, floorY, LAMP, sLamp, 'bottom', 1, true, 110); break; // 路灯样式竖排步110(93 表行带实测)
        case 11: placeFurn(st, cx0, floorY, CANDELABRA, sCandelabra2, 'bottom', 1, true, 72); break;
        case 12: placeFurn(st, cx0, floorY, CLOCK, sClock); break;
      }
    }
  }

  // ---- 9. 墙饰:画/骨(cs L19080-19285),420000/w 个 ----
  {
    const count = Math.floor(420000 / w);
    for (let n = 0; n < count; n++) {
      let x = rng.int(ex0, ex1);
      let y = 0;
      for (let t = 0; t < 200; t++) {
        y = rng.int(Math.floor(gs.worldSurface), ey1);
        if (airDW(x, y)) break;
        x = rng.int(ex0, ex1);
      }
      if (!airDW(x, y)) continue;
      // 两次重定心(cs L19089-19109)
      for (let k = 0; k < 2; k++) {
        let a = x, b = x;
        while (st.inBounds(a, y) && !st.flags[st.idx(a, y)] && isDWall(a, y)) a--;
        while (st.inBounds(b, y) && !st.flags[st.idx(b, y)] && isDWall(b, y)) b++;
        x = Math.floor((a + 1 + b - 1) / 2);
        let c = y, d = y;
        while (st.inBounds(x, c) && !st.flags[st.idx(x, c)] && isDWall(x, c)) c--;
        while (st.inBounds(x, d) && !st.flags[st.idx(x, d)] && isDWall(x, d)) d++;
        y = Math.floor((c + 1 + d - 1) / 2);
      }
      // 量净空跨度(三向无实心)
      const spanH = (xx: number, yy: number) => {
        let a = xx, b = xx;
        while (st.inBounds(a, yy) && !st.flags[st.idx(a, yy)] && !st.flags[st.idx(a, yy - 1)] && !st.flags[st.idx(a, yy + 1)]) a--;
        while (st.inBounds(b, yy) && !st.flags[st.idx(b, yy)] && !st.flags[st.idx(b, yy - 1)] && !st.flags[st.idx(b, yy + 1)]) b++;
        return { w: b - a - 1, x0: a + 1, x1: b - 1 };
      };
      const spanV = (xx: number, yy: number) => {
        let a = yy, b = yy;
        while (st.inBounds(xx, a) && !st.flags[st.idx(xx, a)] && !st.flags[st.idx(xx - 1, a)] && !st.flags[st.idx(xx + 1, a)]) a--;
        while (st.inBounds(xx, b) && !st.flags[st.idx(xx, b)] && !st.flags[st.idx(xx - 1, b)] && !st.flags[st.idx(xx + 1, b)]) b++;
        return { h: b - a - 1, y0: a + 1, y1: b - 1 };
      };
      const sh = spanH(x, y), sv = spanV(x, y);
      if (sh.w <= 7 || sv.h <= 5) continue;
      const canH = sh.w > sv.h * 3 && sh.w > 21;
      const canV = sv.h > sh.w * 3 && sv.h > 21;
      let kind = rng.int(0, 2);
      if (st.wall[st.idx(x, y)] === roomWall[0]) kind = 0;
      let guard = 0;
      while (!((kind === 0) || (kind === 1 && canH) || (kind === 2 && canV)) && guard++ < 20) kind = rng.int(0, 2);
      if (!((kind === 0) || (kind === 1 && canH) || (kind === 2 && canV))) continue;
      if (nearPicture2(st, x, y, roomWall[0])) continue;
      const isMain = st.wall[st.idx(x, y)] === roomWall[0];
      const randPic = (): [number, number] => {
        if (rng.int(0, 2) < 2) {
          const map = [12, 13, 14, 15, 18, 19, 23];
          return [HANGING, map[rng.int(0, 6)]];
        }
        const r = rng.int(0, 16);
        const style = r > 13 ? (r === 14 ? 15 : r === 15 ? 16 : 30) : r;
        return [PAINTING, style];
      };
      const randBone = (): [number, number] => rng.int(0, 1) === 0
        ? [HANGING, rng.int(0, 1) === 0 ? 16 : 17]
        : [CATACOMB, rng.int(0, 8)];
      const placeAt = (px: number, py: number) => {
        const [tile, style] = isMain ? randPic() : randBone();
        if (!nearPicture(st, px, py)) placeWallArt(st, px, py, tile, style);
      };
      placeAt(x, y);
      if (kind === 1) {
        // 横向 ±7 续画
        for (const dir of [1, -1]) {
          let px = x, py = y;
          for (let k = 0; k < 2; k++) {
            px += 7 * dir;
            const sv2 = spanV(px, py);
            py = Math.floor((sv2.y0 + sv2.y1) / 2);
            if (Math.abs(y - py) >= 4) break;
            placeAt(px, py);
          }
        }
      } else if (kind === 2) {
        for (const dir of [1, -1]) {
          let px = x, py = y;
          for (let k = 0; k < 3; k++) {
            py += 7 * dir;
            const sh2 = spanH(px, py);
            px = Math.floor((sh2.x0 + sh2.x1) / 2);
            if (Math.abs(x - px) >= 4) break;
            placeAt(px, py);
          }
        }
      }
    }
  }

  // ---- 10. 旗帜(cs L19042-19078),840000/w 个 ----
  {
    const count = Math.floor(840000 / w);
    for (let n = 0; n < count; n++) {
      let x = rng.int(ex0, ex1);
      let y = 0;
      for (let t = 0; t < 200; t++) {
        y = rng.int(ey0, ey1);
        if (airDW(x, y)) break;
        x = rng.int(ex0, ex1);
      }
      if (!airDW(x, y)) continue;
      // 向上找顶
      let j1 = y;
      while (!solidAt(x, j1) && j1 > 10) j1--;
      const j2 = j1 + 1;
      if (!isDWall(x, j2)) continue;
      if (st.flags[st.idx(x, j2 - 1)] && st.type[st.idx(x, j2 - 1)] === SPIKE) continue;
      let clear = true;
      for (let k = 0; k < 4; k++) if (st.flags[st.idx(x, j2 + k)]) { clear = false; break; }
      if (!clear) continue;
      let bad = false;
      for (let dx = -1; dx <= 1 && !bad; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
          if (!st.inBounds(x + dx, j2 + dy)) continue;
          const t = st.flags[st.idx(x + dx, j2 + dy)] ? st.type[st.idx(x + dx, j2 + dy)] : 0;
          if (t === DOOR || t === BANNER) { bad = true; break; }
        }
      }
      if (bad) continue;
      const base = st.wall[st.idx(x, j2)] === roomWall[1] ? 12 : st.wall[st.idx(x, j2)] === roomWall[2] ? 14 : 10;
      // 整条旗帜同一 style(原版 PlaceTile 一次抽取,此前每格独立重摇会混样式)
      const bannerStyle = base + rng.int(0, 1);
      st.setTileSilent(x, j2, BANNER, bannerStyle * 54, 0); // 旗帜样式横排步54(91 表 1998=37×54)
      st.setTileSilent(x, j2 + 1, BANNER, bannerStyle * 54, 18);
      st.setTileSilent(x, j2 + 2, BANNER, bannerStyle * 54, 36);
    }
  }
}

/** WallDungeon 扩散(cs L54737):非实心格连通域内任意墙(≠244)→ 目标变体 */
function wallDungeonSpread(st: TileStore, sx: number, sy: number, wallType: number): void {
  const seen = new Set<number>();
  const q: Array<[number, number]> = [[sx, sy]];
  seen.add(sx * 100000 + sy);
  while (q.length) {
    const [x, y] = q.shift()!;
    if (!st.inBounds(x, y)) continue;
    const i = st.idx(x, y);
    if (!st.flags[i] && st.wall[i] !== wallType && st.wall[i] > 0 && st.wall[i] !== 244) {
      st.wall[i] = wallType;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = (x + dx) * 100000 + (y + dy);
        if (!seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    } else if (st.flags[i]) {
      st.wall[i] = wallType;
    }
  }
}

/**
 * 家具放置:锚点语义 bottom(底行=floorY,水平居中)或 top(顶行=topY,居中)。
 * 成功条件:fw×fh 全净空 + 底行下方全实心(bottom 时)。帧 = style*fw*18 + dx*18 / dy*18。
 * flip=-1 时水平镜像帧。返回是否放置成功。
 */
export function placeFurn(st: TileStore, cx: number, anchorY: number, tile: number, style: number, anchor: 'bottom' | 'top' = 'bottom', flip = 1, support = true, styleRowH?: number, styleColW?: number): boolean {
  const def = TILE_DEFS[tile];
  if (!def) return false;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = anchor === 'bottom' ? anchorY - fh + 1 : anchorY;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy) || st.flags[st.idx(x0 + dx, yTop + dy)]) return false;
    }
  }
  if (anchor === 'bottom' && support) {
    for (let dx = 0; dx < fw; dx++) {
      if (!st.inBounds(x0 + dx, yTop + fh) || !st.flags[st.idx(x0 + dx, yTop + fh)]
        || !TILE_DEFS[st.type[st.idx(x0 + dx, yTop + fh)]]?.solid) return false;
    }
  }
  const sheet = TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
  // 权威布局表(FurnitureStyle.ts,TileObjectData+贴图实测):表内 sheet 直接用,
  // 表外尊重调用参数(竖排 styleRowH / 横排列步 styleColW),最终回退通用横排。
  // 15/139/187 曾漏登记→椅子全落通用横排回退而实为竖排(神庙木椅 2026-08-12),
  // 已补全与 FurnitureStyle.ts 覆盖面同步
  const inTable = [42, 33, 49, 34, 100, 93, 91, 240, 241, 242, 245, 246, 15, 139, 187, 79, 90].includes(sheet);
  let bx: number, by: number;
  if (inTable) [bx, by] = furnitureStyleBase(sheet, style, fw);
  else if (styleRowH !== undefined) { bx = 0; by = style * styleRowH; }
  else { bx = style * (styleColW ?? fw * 18); by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      const fx = flip < 0 ? fw - 1 - dx : dx;
      st.setTileSilent(x0 + dx, yTop + dy, tile, bx + fx * 18, by + dy * 18);
    }
  }
  return true;
}

/** 家具水平镜像(帧 X 翻转:桌椅等 1-3 宽物件整体 +18*fw) */
export function flipFurn(st: TileStore, cx: number, floorY: number, tile: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = floorY - fh + 1;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy)) continue;
      const i = st.idx(x0 + dx, yTop + dy);
      if (st.type[i] === tile) st.frameX[i] += fw * 18;
    }
  }
}

/** 墙饰(画/骨/挂毯):顶行=topY,锚点左上;须净空 */
function placeWallArt(st: TileStore, x: number, y: number, tile: number, style: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const sheet = def.vanilla?.sheet ?? -1;
  const x0 = x - Math.floor(fw / 2);
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, y + dy) || st.flags[st.idx(x0 + dx, y + dy)]) return;
    }
  }
  // 样式基偏移(TileObjectData + Tiles_N.png 尺寸实测):
  //  240(1944×162):横排 36 列×54,wrap36 → 超 36 换下行 54
  //  241(4×3):竖排行 54(wrap0 单列)
  //  242(324×1944):竖排 27 行×72,wrap27 → 超 27 换右列 108
  let bx: number, by: number;
  if (sheet === 240) { bx = (style % 36) * 54; by = Math.floor(style / 36) * 54; }
  else if (sheet === 241) { bx = 0; by = style * 54; }
  else if (sheet === 242) { bx = Math.floor(style / 27) * 108; by = (style % 27) * 72; }
  else { bx = style * fw * 18; by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      st.setTileSilent(x0 + dx, y + dy, tile, bx + dx * 18, by + dy * 18);
    }
  }
}

/** nearPicture(cs L17966):±4×±3 有任意实心 */
function nearPicture(st: TileStore, x: number, y: number): boolean {
  for (let dx = -4; dx <= 3; dx++) {
    for (let dy = -3; dy <= 2; dy++) {
      if (st.inBounds(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

/** nearPicture2(cs L17979):±15/±10(主墙)或 ±8/±5(变体墙)内已有墙饰 */
function nearPicture2(st: TileStore, x: number, y: number, mainWall: number): boolean {
  const wall = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
  const rx = wall === mainWall ? 15 : 8;
  const ry = wall === mainWall ? 10 : 5;
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dy = -ry; dy <= ry; dy++) {
      if (!st.inBounds(x + dx, y + dy) || !st.flags[st.idx(x + dx, y + dy)]) continue;
      const t = st.type[st.idx(x + dx, y + dy)];
      if (t === HANGING || t === CATACOMB || t === PAINTING) return true;
    }
  }
  return false;
}

/**
 * 灯具→墙上开关 + 红线布线(cs L18942-18975/18990-19023):
 * 在灯具 ±12/+3..20 内找两侧皆砖的嵌墙位放开关(136),沿曼哈顿路径铺红线。
 * chandelier=true 时开关位禁邻尖刺(原版两分支条件差异)。
 */
function wireToSwitch(
  st: TileStore, rng: RNG, dc: DungeonCtx,
  lx: number, ly: number,
  ex0: number, ex1: number, ey0: number, ey1: number,
  isDWall: (x: number, y: number) => boolean,
  isBrick: (x: number, y: number) => boolean,
  chandelier: boolean,
): void {
  for (let tries = 0; tries < 1000; tries++) {
    let x = lx + rng.int(-12, 12);
    let y = ly + rng.int(3, 20);
    if (x < ex0 || x > ex1 || y < ey0 || y > ey1) continue;
    if (!st.inBounds(x, y) || st.flags[st.idx(x, y)] || st.flags[st.idx(x, y + 1)]) continue;
    if (!isBrick(x - 1, y) || !isBrick(x + 1, y)) continue;
    if (!canHit(st, x, y, lx, ly)) continue;
    const solidSide = (st.inBounds(x - 1, y) && st.flags[st.idx(x - 1, y)] && st.type[st.idx(x - 1, y)] !== DOOR && TILE_DEFS[st.type[st.idx(x - 1, y)]]?.solid)
      || (st.inBounds(x + 1, y) && st.flags[st.idx(x + 1, y)] && st.type[st.idx(x + 1, y)] !== DOOR && TILE_DEFS[st.type[st.idx(x + 1, y)]]?.solid)
      || (st.inBounds(x, y + 1) && st.flags[st.idx(x, y + 1)] && TILE_DEFS[st.type[st.idx(x, y + 1)]]?.solid);
    if (!solidSide || !isDWall(x, y)) continue;
    if (!chandelier) {
      const tL = st.inBounds(x - 1, y) && st.flags[st.idx(x - 1, y)] ? st.type[st.idx(x - 1, y)] : 0;
      const tR = st.inBounds(x + 1, y) && st.flags[st.idx(x + 1, y)] ? st.type[st.idx(x + 1, y)] : 0;
      if (tL === SPIKE || tR === SPIKE) continue;
    }
    // 放开关(2/3 关态帧 18)并布线
    st.setTileSilent(x, y, DSWITCH, rng.int(0, 2) > 0 ? 18 : 0, 0);
    let wx = x, wy = y;
    while (wx !== lx || wy !== ly) {
      st.wire[st.idx(wx, wy)] |= TileStore.WIRE_RED;
      if (wx > lx) wx--;
      else if (wx < lx) wx++;
      else if (wy > ly) wy--;
      else if (wy < ly) wy++;
    }
    st.wire[st.idx(lx, ly)] |= TileStore.WIRE_RED;
    return;
  }
  void dc;
}

/** Collision.CanHit（1456 Collision.cs:383）1:1：开关↔灯具视线判定。
 *  16px 实体盒（16×16）中心取整即 tile 坐标；主轴步进（|dx|>|dy| 走 x 否则走 y），
 *  每步检查步进方向两侧全整砖（active+tileSolid+!solidTop+slope0+!halfBrick）成对 → 阻挡；
 *  步进后落点格为实心非平台 → 阻挡（穿墙）。y 钳 [1, h-40]、x 钳 [1, w-1]。 */
function canHit(st: TileStore, x1: number, y1: number, x2: number, y2: number): boolean {
  const w = st.w, h = st.h;
  let num = x1, num2 = y1;
  const num3 = Math.max(1, Math.min(w - 1, x2));
  const num4 = Math.max(1, Math.min(h - 40, y2));
  num = Math.max(1, Math.min(w - 1, num));
  num2 = Math.max(1, Math.min(h - 40, num2));
  const fullBrick = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    if (!st.flags[k]) return false;
    const d = TILE_DEFS[st.type[k]];
    return !!d?.solid && !d.platform && st.slope[k] === 0 && !st.half[k];
  };
  for (;;) {
    if (num === num3 && num2 === num4) return true;
    const dAbs = Math.abs(num - num3), dOrd = Math.abs(num2 - num4);
    if (dAbs > dOrd) {
      num += num >= num3 ? -1 : 1;
      if (fullBrick(num, num2 - 1) && fullBrick(num, num2 + 1)) return false;
    } else {
      num2 += num2 >= num4 ? -1 : 1;
      if (fullBrick(num - 1, num2) && fullBrick(num + 1, num2)) return false;
    }
    // do-while 条件：落点格"非活性 / 非实心 / 平台"才继续步进；实心非平台 → 穿墙阻挡
    const k = st.idx(num, num2);
    const d = TILE_DEFS[st.type[k]];
    const passable = !st.flags[k] || !d?.solid || !!d.platform;
    if (!passable) return false;
    if (num < 1 || num >= w - 1 || num2 < 1 || num2 >= h - 40) return false;
  }
}

/** AddBuriedChest（1456 cs:35920）下落段 1:1：自 y 向下扫至 h-10，
 *  首个 SolidTile（半砖/坡面不算）落定；±2 邻域有 Boulders/26/237 → 失败。
 *  样式/主件由调用方显式给定（地牢战利品序），2×2 箱落其上后推入 chests */
function addChest(st: TileStore, chests: ChestSink, x: number, y: number, tile: number, style: number, itemId: number | undefined, locked: boolean): boolean {
  const def = TILE_DEFS[tile];
  if (!def) return false;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= st.w - 1 || yy >= st.h - 1) continue;
      const k = st.idx(xx, yy);
      if (!st.flags[k]) continue;
      const sh = TILE_DEFS[st.type[k]]?.vanilla?.sheet ?? -1;
      if (BOULDER_SHEETS_DP.has(sh) || st.type[k] === TILE_BY_KEY['v_26_altars'] || st.type[k] === TILE_BY_KEY['v_237_lihzahrd_altar']) return false;
    }
  }
  let gy = y;
  for (; gy < st.h - 10; gy++) {
    if (solidTileHB(st, x, gy)) break;
  }
  if (gy >= st.h - 10) return false;
  if (!solidTileHB(st, x, gy)) return false;
  const topY = gy - 2;
  if (topY < 1) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(x + dx, topY + dy) || st.flags[st.idx(x + dx, topY + dy)]) return false;
    }
  }
  const fw = def.vanilla?.fw ?? 2;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(x + dx, topY + dy, tile, style * fw * 18 + dx * 18, dy * 18);
    }
  }
  chests.push({
    x, y: topY, locked,
    items: itemId !== undefined ? [{ id: itemId, stack: 1 }, ...Array(9).fill(null)] : Array(10).fill(null),
  });
  return true;
}
