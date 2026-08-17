// 原版 "Jungle Temple"(WorldGen.cs:7190 + makeTemple L17158)1:1 移植。
// 之字形下沉房间链(重投至与旧房不相交;锚点=中心;行程 1-2 递增)→ 全房对实心砖连线
// → 房内双遍游走挖腔(墙 87)→ templePather 通道 → outerTempled 封壳 → 入口隧道+门框
// → templeCleaner → 祭坛 237(末间中心 ±15)。
// templePart2 五段(陷阱→箱→雕像→家具→挂饰)是独立注册的 LihzahrdTemplePart2 pass
// (cs:17809,Moss 之后 CaveWalls 之前)——见 runTemplePart2Pass(2026-08-16 拆分)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeDoorClosed } from '../../Door';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { placeFurn } from './DungeonPass';
import { flipGenSolid } from './GenSolid';

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
  // ★写砖必清坡位（cs:33760-33763 房连线列 / 33786-33788 房实心 / 33563-33566
  //   outerTempled / 33499-33503 templeCleaner else / 34161-34165+34181-34185 门框柱,
  //   全部六处 226 写入点都是 active(true)+type=226+liquid=0+slope(0)+halfBrick(false)
  //   五连写）。神庙壳压在丛林泥/洞穴坡面格上,不清坡 → 幻影坡幸存到 @52
  //   （W 批全图残余 351 格根源;与 TileRunner ClearSlope 同族写入语义）。
  st.slope[i] = 0; st.half[i] = 0;
}

/** SolidTile(i, j)（cs:70155）：active + tileSolid + !tileSolidTop + 非半砖 + slope 0。
 *  与 SolidTile2（cs:70178，祭坛锚点门用）差一个 tileSolidTop（平台）条件,勿合并。 */
function solidTileST(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const j = st.idx(x, y);
  if (!st.flags[j]) return false;
  const d = TILE_DEFS[st.type[j]];
  return !!d && d.solid && !d.platform && !st.half[j] && st.slope[j] === 0;
}

export function runTemplePass(st: TileStore, rng: RNG, gs: GenState): void {
  const __cap = (globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void }).__swWallCap;
  if (__cap) __cap('temple', gs, st);
  const tmMark = (s: string) => { const f = (globalThis as { __swTmMark?: (s: string) => void }).__swTmMark; if (f) f(s); };
  const { w, h } = st;
  const s = w / 4200;
  // 种子点(cs:15917-15992):y = Next(rockLayer, maxTilesY-600)(rockLayer 先钳 ≤ h-601);
  // x = ((NextDouble()*num3+0.1)*-dungeonSide+0.5)*w,num3 起 0.25,每 1e6 次失败
  // num3 = min(0.35, num3+0.05) 递增(cs:15978-15989);落点须为丛林草 60(cs:15972)。
  // num3==0.35 后再失败 10 轮放弃——★T7(cs:15992-16001):失败后原版**无条件**
  // 强制补建 makeTemple(maxTilesX - generatingDungeonPositionX, rockLayer + 100)
  // (remix 分支除外,本仓不支持),不缺席(见下方 sx<0 分支)。
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
  // ★T7(cs:15992-16001):种子点失败时原版无条件强制补建——锚点
  //   (maxTilesX - generatingDungeonPositionX, rockLayer + 100)。此前直接
  //   return,异常种子/丛林草缺失时神庙整体缺席(祭坛+神庙箱+木刺全失)。
  if (sx < 0) {
    sx = st.w - gs.generatingDungeonPositionX;
    sy = Math.floor(gs.rockLevel) + 100;
  }
  tmMark('seed');
  // ---- 房间链(L17185-17231):重投至与全部旧房不相交;overlap 每次相交测试 1% 递增 ----
  let roomCount = rng.int(Math.max(2, Math.floor(10 * s)), Math.floor(16 * s) - 1);
  const rooms: Room[] = [];
  // ★cs:33596-33599 `int num3 = 1; if (genRand.Next(2) == 0) num3 = -1;`——
  //   Next(2)==0（sample<0.5）取 **-1**。曾写反（<0.5→+1）→ 房间链行进方向整体
  //   镜像（本种子神庙左移 58 格、房间集合全错 → #46 自债 typ28k/act15k/wal19k）
  let dir: 1 | -1 = rng.nextInt(2) === 0 ? -1 : 1;   // num2
  const startDir = dir;                   // num3
  let runLen = rng.int(1, 2);             // num8:行程阈值,每次换向后 +1
  let runStep = 0;                        // num9
  let cx = sx, cy = sy;                   // num6/num7:上一间中心
  for (let n = 0; n < roomCount; n++) {
    // ★cs:33636 `int num19 = -10;` 声明在 for-i **体内**——每房重置;曾跨房累积,
    //  房距越滚越宽+掷骰漂移(F2 代理附带发现)
    let overlap = -10;                    // num13
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
      // ★T4(cs:33648-33659):UnderworldLayer 截断——num16+70 >= UnderworldLayer-10
      //   (本仓 UnderworldLayer = h-200,Main.cs:2863)命中时 num2=i+1(cs:33651)
      //   提前终结房间链并换大房间尺寸;cs:33677-33680 if(flag2) break 跳过相交
      //   重投。此前缺失,房间链可一路沉入地狱层。
      const uwCut = baseY + 70 >= (st.h - 200) - 10;
      if (last || uwCut) {
        const w0 = rng.int(55, 64), h0 = rng.int(45, 49);
        rw = Math.floor(w0 * 1.6);
        rh = Math.floor(Math.min(h0, w0) * 1.35);
        baseY += rng.int(5, 9);
        if (uwCut) roomCount = n + 1;   // num2 = i + 1(cs:33651)
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
      // cs:33677-33680:if (flag2) break——地狱截断房直接采纳,跳过与旧房的相交重投
      if (uwCut) break;
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
  // (原版无 rooms.length<3 闸——曾自制;T4 地狱截断后深种子世界可能截到 1-2 房,
  //  该闸会把整座神庙连同祭坛一起吞掉=花后进度断链,已删。下游仅相对下标,安全)
  tmMark('rooms');
  {
    const f = (globalThis as { __swTmRooms?: (r: Room[], sx: number, sy: number) => void }).__swTmRooms;
    if (f) f(rooms.map((r) => ({ ...r })), sx, sy);
  }
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
      // ★cs:33852-33853 挖腔=active(false)+wall=87——type 保留为幽灵（原版直写
      //   失活从不清 type；清 0 会造 ~12k RAW typ 差）。挖腔前刚被 226 实心填充
      //   覆写，故此处幽灵恒 226；pather 走廊穿神庙外原石时幽灵=原石型
      st.flags[i] = 0; st.wall[i] = 87;
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
  tmMark('carve');
  // ---- templePather 通道(L17392-17458):从种子游走穿各房,方块清空+墙 87 ----
  const pather = (px: number, py: number, destX: number, destY: number): [number, number] => {
    { const f = (globalThis as { __swTmPath?: (s: string) => void }).__swTmPath; if (f) f(`${px},${py}->${destX},${destY}`); }
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
          st.flags[i] = 0; st.wall[i] = 87;   // cs:33541-33542 active(false)+wall=87，幽灵 type 保留
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
      // ★cs:33944-33951：基础随机点两掷**无条件先掷**，末房再用中心±10 两掷覆写
      //   （4 掷/迭代）。曾只掷覆写 2 掷 → 每末房迭代 -2 掷（本种子 -10）→ 木刺段
      //   流位漂移（act 差 ~1k）
      let destX = rng.int(inner.x, inner.x + inner.w - 1);
      let destY = rng.int(inner.y, inner.y + inner.h - 1);
      if (n === rooms.length - 1) {
        destX = inner.x + Math.floor(inner.w / 2) + rng.int(-10, 9);
        destY = inner.y + Math.floor(inner.h / 2) + rng.int(-10, 9);
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
          // ★cs:33966 `if (num3 > 0)`——num3 是房间链**终态**方向（每房尾 num3=num14
          //   滚动更新），非 startDir。曾用 startDir → 额外通道目标偏 → pather 重试
          //   次数差 → 掷流后移（-26 掷、木刺 232 摆位漂移）
          tx = b2.x + (n === 0
            ? (dir > 0 ? Math.floor(b2.w * 0.8) : Math.floor(b2.w * 0.2))
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
  tmMark('pather');
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
  // ★T1(cs:34064-34073):第二遍 y 为完整区间 num58..num59——曾误写 floor(oy1/2)
  //   作上界,该遍下半区几乎空转,封壳出现单侧缺口
  for (let x = ox1; x >= ox0; x--) for (let y = oy0; y < oy1; y++) outerTempled(x, y);
  for (let y = oy0; y < oy1; y++) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  for (let y = oy1; y >= oy0; y--) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  tmMark('outer');
  // ---- 入口隧道(L17500-17527):固定高度、固定间隔下沉,穿出神庙即停 ----
  const edir = -startDir;
  let ex = sx + 0.0, ey = sy + 0.0;
  const tunH = rng.int(2, 4);
  const dropEvery = rng.int(9, 13);
  let tick = 0;
  let tunDeep = sy;   // num74(cs:34100):入口隧道挖砖最深行——门位扫描上界
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
        if (y > tunDeep) tunDeep = y;   // ★T3(cs:34131-34133):记录最深挖砖行
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
      }
    }
    if (!inside) break;
  }
  tunDeep += 2;   // num74 += 2(cs:34136)
  // ---- 门框(L17528-17578):柱/洞/门 tile 10 style 11 ----
  const i1 = sx;
  let jy = sy;
  if (!st.inBounds(i1, jy)) return;
  // ★T3(cs:34139-34149):门位向下扫实心,上界=隧道挖砖最深行 num74;到顶仍空则
  //   ClearEverything + 强制铺 226 兜底(cs:34145-34148)。此前用"jy < h-2"作
  //   无关上界且无兜底——门框可能悬空或扫描跑穿神庙底。
  while (!st.flags[st.idx(i1, jy)]) {
    jy++;
    if (jy >= tunDeep) {
      jy = tunDeep;
      const i = st.idx(i1, jy);
      st.type[i] = BRICK; st.flags[i] = 1; st.wall[i] = 0;
      st.slope[i] = 0; st.half[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
      break;
    }
  }
  jy -= 4;   // num81 -= 4（原 j1）
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
      st.flags[i] = 0; st.wall[i] = 87;   // cs:34171-34173 active(false)+wall=87，type 保留
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
        st.flags[i] = 0; st.wall[i] = 87;   // cs:34197-34199 active(false)+wall=87，type 保留
      }
    }
  }
  // 原版 makeTemple 尾部（1456 WorldGen.cs:34176）：PlaceTile(i1, num81=jy, 10, style 11)。
  // PlaceTile case 10（:59867）条件 B：j+1/j+2 空 + j+3 实心 → PlaceDoor(i, j+1)（:31938，
  // 门占 j..j+2）。此处 jy=地板-4：门顶=jy、门底=jy+2，站地板 jy+3。
  // 此前放 jy-2 = 整门悬空 2 格（标注实测）
  placeDoorClosed(st, i1, jy, 11);
  tmMark('door');
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
      st.flags[i] = 0; st.wall[i] = 87;   // cs:33493-33495 active(false)+wall=87，type 保留
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
  tmMark('cleaner');
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
  let mainPath = false;
  for (let tries = 0; tries < 1000 && altarX < 0; tries++) {
    // ★cs:34244-34245 采样点=Place3x2 中心锚（占位 [i-1..i+1]×[j-1..j]、锚定行
    //   j+1 三列 SolidTile2）。曾把采样点当 3×2 左上角用（占位/锚均下移 1 行）+
    //   自加 wall==87 前置门——PlaceTile(237) 前导门因 tileSolid[237]=false 恒过，
    //   唯一真门=Place3x2 清空+SolidTile2 锚。错位+错门 → 1000 次全拒 → 走兜底
    //   （掷数 +1978、神庙装饰/祭坛全偏）
    const ax = acx + 15 - rng.int(0, 29);
    const ay = acy + 15 - rng.int(0, 29);
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!st.inBounds(ax + dx, ay + dy) || st.flags[st.idx(ax + dx, ay + dy)]) { ok = false; break; }
      }
      if (ok && !solidTile2(ax + dx, ay + 1)) ok = false;
    }
    if (!ok) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        st.setTileSilent(ax + dx, ay + dy, ALTAR, (dx + 1) * 18, (dy + 1) * 18);
      }
    }
    altarX = ax; altarY = ay; mainPath = true;
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
              st.flags[j] = 0;   // cs:34291-34293 active(false)——type 保留
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
  // cs:34250-34251：主路径 lAltar = 采样锚 - frame/18（中心底格 fx=18/fy=18 → 3×2
  // 左上角）；兜底路径锚点本就是左上角（cs:34288-34289）。mainPath 区分两者。
  gs.lAltarX = altarX - (mainPath ? 1 : 0); gs.lAltarY = altarY - (mainPath ? 1 : 0);
  tmMark('altar');
  // ---- 尾部木刺 232 预算段（cs:34315-34483 1:1）：num111 = 房数×1.1×(1±25%)。
  //      每轮随机选一间 → 房内随机点（须墙 87 且空），Next(2) 定竖/横走线方向,
  //      沿该向找首个实心后回退一格,以落点为心 ±(3..9) 方框把【贴走线面】的实心格
  //      转 232（SolidTile 且反向邻格非实心才转;排除框内见门/祭坛）;单轮有放置
  //      才扣预算,连续 1000 轮无放置也扣预算。★T2:此前整段缺失——全仓 232 只有
  //      引用没有放置,神庙木刺为零,本段即其唯一放置源。drunkWorldGen 的三处
  //      ±2 加刺分支本仓世界类型不支持,跳过。
  {
    const SPIKE = TILE_BY_KEY['v_232_wooden_spike']!;
    const DOOR_T = TILE_BY_KEY['door_closed']!;
    let budget = rooms.length * 1.1;
    budget *= 1 + rng.int(-25, 25) * 0.01;                 // cs:34315-34316
    let fails = 0;                                         // num113
    while (budget > 0) {
      fails++;
      const room = rooms[rng.int(0, rooms.length - 1)];    // num115 = Next(num2)
      let px = rng.int(room.x, room.x + room.w - 1);       // num116
      let py = rng.int(room.y, room.y + room.h - 1);       // num117
      if (st.inBounds(px, py) && st.wall[st.idx(px, py)] === 87 && !st.flags[st.idx(px, py)]) {
        let placed = false;                                // flag6
        if (rng.int(0, 1) === 0) {
          // 竖直走线（cs:34335-34390）：排除框查门 10 **与** 祭坛 237（cs:34349-34358）
          const d = rng.int(0, 1) === 0 ? 1 : -1;          // num118
          while (st.inBounds(px, py) && !st.flags[st.idx(px, py)]) py += d;
          py -= d;
          let flip = rng.int(0, 1);                        // num119
          const rad = rng.int(3, 9);                       // num120 = Next(3,10)
          let clear = true;
          scan: for (let xx = px - rad; xx < px + rad; xx++) {
            for (let yy = py - rad; yy < py + rad; yy++) {
              if (!st.inBounds(xx, yy)) continue;
              const k = st.idx(xx, yy);
              if (st.flags[k] && (st.type[k] === DOOR_T || st.type[k] === ALTAR)) { clear = false; break scan; }
            }
          }
          if (clear) {
            for (let xx = px - rad; xx < px + rad; xx++) {
              for (let yy = py - rad; yy < py + rad; yy++) {
                if (!st.inBounds(xx, yy)) continue;
                const k = st.idx(xx, yy);
                // 反向邻格实心 = 本格被埋,不转（cs:34366）
                if (!solidTileST(st, xx, yy) || st.type[k] === SPIKE || solidTileST(st, xx, yy - d)) continue;
                st.type[k] = SPIKE;                        // 原格已实心,仅改 type
                placed = true;
                const eyy = flip === 0 ? yy - 1 : yy + 1;  // 朝走线面外伸一格(cs:34369-34379)
                if (st.inBounds(xx, eyy)) {
                  const ke = st.idx(xx, eyy);
                  st.type[ke] = SPIKE; st.flags[ke] = 1;
                }
                flip++; if (flip > 1) flip = 0;
              }
            }
          }
          if (placed) { fails = 0; budget -= 1; }
        } else {
          // 水平走线（cs:34393-34476）：排除框只查门 10,不查祭坛——原版不对称,
          // 勿"补全"（cs:34417-34423）
          const d = rng.int(0, 1) === 0 ? 1 : -1;          // num125
          while (st.inBounds(px, py) && !st.flags[st.idx(px, py)]) px += d;
          px -= d;
          let flip = rng.int(0, 1);                        // num126
          const rad = rng.int(3, 9);                       // num127
          let clear = true;
          scan: for (let xx = px - rad; xx < px + rad; xx++) {
            for (let yy = py - rad; yy < py + rad; yy++) {
              if (!st.inBounds(xx, yy)) continue;
              const k = st.idx(xx, yy);
              if (st.flags[k] && st.type[k] === DOOR_T) { clear = false; break scan; }
            }
          }
          if (clear) {
            for (let xx = px - rad; xx < px + rad; xx++) {
              for (let yy = py - rad; yy < py + rad; yy++) {
                if (!st.inBounds(xx, yy)) continue;
                const k = st.idx(xx, yy);
                if (!solidTileST(st, xx, yy) || st.type[k] === SPIKE || solidTileST(st, xx - d, yy)) continue;
                st.type[k] = SPIKE;
                placed = true;
                const exx = flip === 0 ? xx - 1 : xx + 1;
                if (st.inBounds(exx, yy)) {
                  const ke = st.idx(exx, yy);
                  st.type[ke] = SPIKE; st.flags[ke] = 1;
                }
                flip++; if (flip > 1) flip = 0;
              }
            }
          }
          if (placed) { fails = 0; budget -= 1; }
        }
      }
      if (fails > 1000) { fails = 0; budget -= 1; }        // cs:34480-34484
    }
  }
  tmMark('spikes');
  // ---- makeTemple 尾（cs:34487-34491）：房间 bbox 四侧各外扩 10 → GenVars ----
  // 原版在函数尾写 GenVars.tLeft/tRight/tTop/tBottom/tRooms 供**独立注册**的
  // LihzahrdTemplePart2 pass（cs:17809）消费；早退路径不写（字段保持初值 0，
  // Part2 预算 0×掷骰照掷=原版语义）。2026-08-16 拆分前 templePart2 内联于此。
  {
    let tL = Infinity, tR = -Infinity, tT = Infinity, tB = -Infinity;
    for (const r of rooms) {
      tL = Math.min(tL, r.x); tR = Math.max(tR, r.x + r.w);
      tT = Math.min(tT, r.y); tB = Math.max(tB, r.y + r.h);
    }
    gs.tLeft = Math.floor(tL) - 10;
    gs.tRight = Math.ceil(tR) + 10;
    gs.tTop = Math.floor(tT) - 10;
    gs.tBottom = Math.ceil(tB) + 10;
    gs.tRooms = rooms.length;
  }
  // 注：LihzahrdAltar 终保 pass（cs:21753-21791）原版是 TileCleanup(21327) 之后、
  // MicroBiomes(21785) 之前的独立 pass（Pots/Traps/TileCleanup 可能扰动祭坛后再
  // 重放）。2026-08-13 前并入本函数末尾（执行位≈15911），已外提为
  // runLihzahrdAltarPass 独立槽位（WorldGen.ts「蜥蜴祭坛」槽）。
}

/** LihzahrdTemplePart2 pass（cs:17809-17817 注册体 1:1）：神庙陈设五段独立槽
 *  （Moss(17573) 之后、CaveWalls(17819) 之前——WorldGen.ts「神庙陈设」槽）。
 *  ★pass 头翻转（cs:17813-17814 `tileSolid[162]=false; tileSolid[226]=true`：
 *  162 薄冰非实/226 蜥蜴砖实）；尾 cs:17816 `tileSolid[232]=false`（木刺非实心，
 *  CaveWalls 头 cs:17823 重放、BeeLarva 尾 cs:21048 还原 true）。2026-08-16 拆分前
 *  内联于 runTemplePass（执行位≈15911，比原版 Part2 注册位早约 1900 行）。 */
export function runTemplePart2Pass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  flipGenSolid([162], false);
  flipGenSolid([226], true);
  templePart2(st, rng, gs, chests);
  flipGenSolid([232], false);
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
 *  失败推进语义逐掷对齐（陷阱段 fails>100 直接扣预算；其余段 fails>10000 break）。
 *  采样域读 GenVars（runTemplePass 尾写入的**外扩后** bbox——cs:34487-34491，
 *  T5：外扩 10 是写入侧语义；rx/by 的 -1 是 Next 上界排他换算）。 */
function templePart2(
  st: TileStore, rng: RNG, gs: GenState,
  chests: ChestSink,
): void {
  const lx = gs.tLeft, rx = gs.tRight - 1;
  const ty = gs.tTop, by = gs.tBottom - 1;
  const tRooms = gs.tRooms;

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
  // ★cs:34530 `Main.tileSolid[232] = false`（尖刺陷阱段后、宝箱段前）：木刺非实心,
  //   后续箱/雕像/家具/挂饰段的 SolidTile 锚定不再踩在 232 上。函数尾 cs:34701
  //   还原 true（见函数尾）——净效果为零,纯段内作用域。
  flipGenSolid([232], false);

  // ---- 2. 神庙宝箱（cs:34521-34545）：预算 = 房数×0.35×(1±15%) ----
  //  AddBuriedChest(mainItem=1293 蜥蜴能量电池, notNearOtherChests:true, style 16)
  {
    let budget = tRooms * 0.35 * (1 + rng.int(-15, 15) * 0.01);
    let fails = 0;
    while (budget > 0) {
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      // ★T6:已删除自制"祭坛±3 回避"前置门——原版 cs:34531-34538 无此门,真正排除
      //   在 AddBuriedChest 内部（cs:35992-35999,以落地行 k 为锚 5×5 查
      //   Boulders/26/237 拒）;本仓 placeBuriedChest 已带等价检查。
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        // notNearOtherChests:true(cs:34532 原版实参)
        if (placeBuriedChest(st, rng, gs, chests, x2, y2, { style: 16, loot: 'vi_1293_lihzahrd_power_cell', notNearOtherChests: true })) {
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
  // ★cs:34701 `Main.tileSolid[232] = true`：函数尾还原（对应段内 cs:34530 翻转）
  flipGenSolid([232], true);
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
