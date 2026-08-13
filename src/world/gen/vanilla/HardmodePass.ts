// 困难模式世界变换（1.4.5.6 1:1）：击杀血肉墙(113)后的世界转化链。
// - initializeHardMode（WorldGen.cs:31734-31860）：V 形神圣/邪恶带（GERunner 菱形刷
//   全表转化）+ 洞穴墙回填（ShapeFloodFill+OuterOutline）
// - GERunner（cs:76385-76683）：带宽 Next(200,250)×(w/4200)、菱形 |dx|+|dy|<带宽/2×
//   (1±1.5% 抖动)、速度扰动 ±0.05 钳 speedX±1、出界终止；三套完整转化表
//   （神圣 good / 猩红 crimson / 腐化 else——墙 id 直存、tile 走 sheet 反查）
// - createBrickBoxForWallOfFlesh（NPC.cs:79837-79866）：击杀点半径 w/2/16+1 的
//   魔金砖 140（猩红世界 347 猩红砖）空心盒 + 盒内岩浆清零
// - StartHardmode（cs:31866-31880）：hardMode=true → 变换 → misc[15] 公告 +
//   NotifyProgressionEvent(9)；SetEventFlagCleared(ref eventFlag,19)（NPC.cs:80281-80292）
//   ——eventFlag 是 StartHardmode **之前**捕获的 hardMode 值，首次(=false)才触发灯笼夜 19
// RNG 备案：原版 initializeHardMode 走 genRand（世界种子的独立生成流中段状态），
// 运行时无法复现其消费位置——本实现用 new RNG(world.seed) 新流（同种子世界 V 带位
// 置自洽，与原版逐位不同，结构性等价）。
import { RNG } from '../../../core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import type { World } from '../../World';
import type { TileStore } from '../../TileStore';

/** sheet id → 内部 tile id（反向查；多个 def 同 sheet 取首个——转化表目标均为
 *  唯一实体方块（109 草/117 珍珠岩/…），无歧义） */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sh = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sh === 'number' && !SHEET_TO_INTERNAL.has(sh)) SHEET_TO_INTERNAL.set(sh, i);
}
const id = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

/** TileID.Sets（TileID.cs:329-347）：回填门与转化表用 */
const SET_CORRUPT = new Set([23, 661, 25, 112, 163, 398, 400, 636]);
const SET_HALLOW = new Set([109, 492, 117, 116, 164, 402, 403, 115]);
const SET_CRIMSON = new Set([199, 662, 203, 234, 200, 399, 401, 205]);
const sheetOf = (st: TileStore, x: number, y: number): number =>
  TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;

/** GERunner（cs:76385-76683）1:1。good=true 神圣带；false 时按 world.crimson 走
 *  猩红/腐化表。hive>200k 门（flag）：全图 225 Hive 计数 >200000 时条带穿丛林
 *  连 225 Hive/230 CrispyHoney 一并转化（cs:76433-76445） */
function geRunner(st: TileStore, rng: RNG, i: number, j: number, speedX: number, speedY: number, good: boolean, crimson: boolean): void {
  const w = st.w, h = st.h;
  let hiveCount = 0;                                     // 225 Hive 全图计数（cs:76433-76445）
  for (let k = 20; k < w - 20; k++) {
    for (let l = 20; l < h - 20; l++) {
      if (st.flags[st.idx(k, l)] && TILE_DEFS[st.type[st.idx(k, l)]]?.vanilla?.sheet === 225) hiveCount++;
    }
  }
  const flag = hiveCount > 200000;
  let num2 = rng.nextIntRange(200, 250);                 // Next(200,250)
  num2 = Math.trunc(num2 * (w / 4200));                  // ×(w/4200) 截断
  const num4 = num2;                                     // 刷半宽
  let vx = i, vy = j;                                    // val
  let dx = rng.nextIntRange(-10, 10) * 0.1, dy = rng.nextIntRange(-10, 10) * 0.1;
  if (speedX !== 0 || speedY !== 0) { dx = speedX; dy = speedY; }
  let running = true;
  while (running) {
    let x0 = Math.trunc(vx - num4 * 0.5), x1 = Math.trunc(vx + num4 * 0.5);
    let y0 = Math.trunc(vy - num4 * 0.5), y1 = Math.trunc(vy + num4 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > w) x1 = w;
    if (y0 < 0) y0 = 0;
    if (y1 > h - 5) y1 = h - 5;
    for (let m = x0; m < x1; m++) {
      for (let n = y0; n < y1; n++) {
        // 菱形刷：|dm|+|dn| < 带宽/2 × (1±1.5% 逐格抖动)
        if (Math.abs(m - vx) + Math.abs(n - vy) >= num2 * 0.5 * (1 + rng.nextIntRange(-10, 10) * 0.015)) continue;
        const ii = st.idx(m, n);
        const wl = st.wall[ii];
        const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
        if (good) {
          // 神圣（cs:76496-76539）：墙 63/65/66/68/69/81→70、216→219、187→222、3/83→28
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68 || wl === 69 || wl === 81) st.setWall(m, n, 70);
          else if (wl === 216) st.setWall(m, n, 219);
          else if (wl === 187) st.setWall(m, n, 222);
          else if (wl === 3 || wl === 83) st.setWall(m, n, 28);
          // tile：2→109 草；1/25/203→117 珍珠岩；53/123/112/234→116 珍珠沙；
          // 661/662→60 丛林草；23/199→109；161/163/200 冰→164 粉冰；396→403、397→402；
          // flag 门：225 Hive→117、230 CrispyHoney→402（cs:76486-76488）
          if (flag && sh === 225) st.setTile(m, n, id(117));
          else if (flag && sh === 230) st.setTile(m, n, id(402));
          else if (sh === 2) st.setTile(m, n, id(109));
          else if (sh === 1 || sh === 25 || sh === 203) st.setTile(m, n, id(117));
          else if (sh === 53 || sh === 123 || sh === 112 || sh === 234) st.setTile(m, n, id(116));
          else if (sh === 661 || sh === 662) st.setTile(m, n, id(60));
          else if (sh === 23 || sh === 199) st.setTile(m, n, id(109));
          else if (sh === 161 || sh === 163 || sh === 200) st.setTile(m, n, id(164));
          else if (sh === 396) st.setTile(m, n, id(403));
          else if (sh === 397) st.setTile(m, n, id(402));
        } else if (crimson) {
          // 猩红（cs:76541-76603）：墙 63/65/66/68→81、216→218、187→221
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68) st.setWall(m, n, 81);
          else if (wl === 216) st.setWall(m, n, 218);
          else if (wl === 187) st.setWall(m, n, 221);
          // tile：60/661→662；2/109→199；1/117→203；53/123/116→234；161/164→200；396→401、397→399；
          // flag 门：225 Hive→203、230 CrispyHoney→399（cs:76550-76557）
          if (flag && sh === 225) st.setTile(m, n, id(203));
          else if (flag && sh === 230) st.setTile(m, n, id(399));
          else if (sh === 60 || sh === 661) st.setTile(m, n, id(662));
          else if (sh === 2 || sh === 109) st.setTile(m, n, id(199));
          else if (sh === 1 || sh === 117) st.setTile(m, n, id(203));
          else if (sh === 53 || sh === 123 || sh === 116) st.setTile(m, n, id(234));
          else if (sh === 161 || sh === 164) st.setTile(m, n, id(200));
          else if (sh === 396) st.setTile(m, n, id(401));
          else if (sh === 397) st.setTile(m, n, id(399));
        } else {
          // 腐化（cs:76605-76667）：墙 63/65/66/68→69、216→217、187→220
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68) st.setWall(m, n, 69);
          else if (wl === 216) st.setWall(m, n, 217);
          else if (wl === 187) st.setWall(m, n, 220);
          // tile：60/662→661；2/109→23；1/117→25；53/123/116→112；161/164→163；396→400、397→398；
          // flag 门：225 Hive→25、230 CrispyHoney→398（腐化分支同构）
          if (flag && sh === 225) st.setTile(m, n, id(25));
          else if (flag && sh === 230) st.setTile(m, n, id(398));
          else if (sh === 60 || sh === 662) st.setTile(m, n, id(661));
          else if (sh === 2 || sh === 109) st.setTile(m, n, id(23));
          else if (sh === 1 || sh === 117) st.setTile(m, n, id(25));
          else if (sh === 53 || sh === 123 || sh === 116) st.setTile(m, n, id(112));
          else if (sh === 161 || sh === 164) st.setTile(m, n, id(163));
          else if (sh === 396) st.setTile(m, n, id(400));
          else if (sh === 397) st.setTile(m, n, id(398));
        }
      }
    }
    // 速度积分 + 扰动（cs:76669-76682）：val2.X += Next(-10,11)*0.05，钳 speedX±1
    vx += dx; vy += dy;
    dx += rng.nextIntRange(-10, 10) * 0.05;
    if (dx > speedX + 1) dx = speedX + 1;
    if (dx < speedX - 1) dx = speedX - 1;
    if (vx < -num2 || vy < -num2 || vx > w + num2 || vy > h + num2) running = false;
  }
}

/** 洞穴墙回填 OnlyWalls 白名单（cs:31854-31857：0/54-59/61/185/212-215/2/196-199/15/40/71/64/204-211） */
const BACKFILL_WALLS = new Set([0, 54, 55, 56, 57, 58, 59, 61, 185, 212, 213, 214, 215, 2, 196, 197, 198, 199, 15, 40, 71, 64, 204, 205, 206, 207, 208, 209, 210, 211]);

/** initializeHardMode（cs:31734-31860）1:1（remix/dualDungeons/skyblock 分支不适用） */
export function initializeHardMode(world: World, rng: RNG): void {
  const st = world.store, w = st.w, h = st.h;
  // ---- V 带位置（cs:31740-31781）----
  const num = rng.nextIntRange(300, 400) * 0.001;        // 神圣带侧比例
  const num2 = rng.nextIntRange(200, 300) * 0.001;       // 邪恶带侧比例
  let num3 = Math.trunc(w * num);                        // 神圣带 x
  let num4 = Math.trunc(w * (1 - num));                  // 邪恶带 x
  let num5 = 1;
  if (rng.nextInt(2) === 0) {
    num4 = Math.trunc(w * num);
    num3 = Math.trunc(w * (1 - num));
    num5 = -1;
  }
  const num6 = world.dungeonX < w / 2 ? -1 : 1;          // 神圣带放地牢对侧
  if (num6 < 0) {
    if (num4 < num3) num4 = Math.trunc(w * num2);
    else num3 = Math.trunc(w * num2);
  } else if (num4 > num3) num4 = Math.trunc(w * (1 - num2));
  else num3 = Math.trunc(w * (1 - num2));
  geRunner(st, rng, num3, 0, 3 * num5, 5.0, true, world.crimson);
  geRunner(st, rng, num4, 0, -3 * num5, 5.0, false, world.crimson);
  // ---- 洞穴墙回填（cs:31783-31860）：25×(w/4200) 片 ----
  let budget = Math.trunc(25 * (w / 4200));
  let attempts = 0;
  while (budget > 0) {
    if (++attempts % 15000 === 0) budget--;              // 原版放弃退减（防死循环）
    // RandomWorldPoint(worldSurface-100, 1, 190, 1)：x∈[1,w-2]、y∈[ws-100,h-191]
    const px = rng.nextIntRange(1, w - 1);
    const py = rng.nextIntRange(Math.max(20, Math.trunc(world.groundLevel) - 100), h - 190);
    if (!st.inBounds(px, py)) continue;
    const ii = st.idx(px, py);
    const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
    let wallId = 0;
    if (SET_CRIMSON.has(sh)) wallId = 192 + rng.nextInt(4);       // 猩红墙 192-195
    else if (SET_CORRUPT.has(sh)) wallId = 188 + rng.nextInt(4);  // 腐化墙 188-191
    else if (SET_HALLOW.has(sh)) wallId = 200 + rng.nextInt(4);   // 神圣墙 200-203
    if (st.flags[ii] && wallId !== 0 && !st.flags[st.idx(px, py - 1)]) {
      // ShapeFloodFill(1000)：非实心 + OnlyWalls 白名单泛洪；OuterOutline(+对角+内腔)
      const cells = new Set<number>();
      let complete = true;
      const queue: Array<[number, number]> = [[px, py - 1]];
      let quota = 1000;
      while (queue.length && quota > 0) {
        const [qx, qy] = queue.shift()!;
        const qi = st.idx(qx, qy);
        if (cells.has(qi)) continue;
        if (st.flags[qi]) continue;                      // IsNotSolid
        if (!BACKFILL_WALLS.has(st.wall[qi])) continue;  // OnlyWalls
        cells.add(qi);
        quota--;
        if (qx + 1 < w - 1) queue.push([qx + 1, qy]);
        if (qx - 1 >= 1) queue.push([qx - 1, qy]);
        if (qy + 1 < h - 1) queue.push([qx, qy + 1]);
        if (qy - 1 >= 1) queue.push([qx, qy - 1]);
      }
      if (quota <= 0 && queue.length) complete = false;
      if (cells.size > 50 && complete) {
        for (const ci of cells) {                        // 腔体 + 8 邻环铺墙
          const cx = ci % st.w, cy = Math.trunc(ci / st.w);
          const paint = (wx: number, wy: number): void => {
            if (st.inBounds(wx, wy)) st.setWall(wx, wy, wallId);
          };
          paint(cx + 1, cy); paint(cx - 1, cy); paint(cx, cy + 1); paint(cx, cy - 1);
          paint(cx + 1, cy + 1); paint(cx + 1, cy - 1); paint(cx - 1, cy + 1); paint(cx - 1, cy - 1);
          paint(cx, cy);
        }
        budget--;
      }
    }
  }
}

/** CreateBrickBoxForWallOfFlesh（NPC.cs:79837-79866）：击杀点空心砖盒+清岩浆。
 *  cxTile/cyTile = 击杀 NPC 中心格；widthPx = 碰撞盒宽。盒半径 = (int)(width/2/16)+1
 *  （C# 整除链：100/2=50 → 50/16=3 → +1=4） */
export function createBrickBoxForWallOfFlesh(st: TileStore, cxTile: number, cyTile: number, widthPx: number, crimson: boolean): void {
  const r = Math.trunc(widthPx / 2 / 16) + 1;
  const brick = crimson ? id(347) : id(140);             // 猩红砖 347 / 魔金砖 140
  for (let i = cxTile - r; i <= cxTile + r; i++) {
    for (let j = cyTile - r; j <= cyTile + r; j++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      const onShell = i === cxTile - r || i === cxTile + r || j === cyTile - r || j === cyTile + r;
      if (onShell && !st.flags[ii]) {
        st.setTile(i, j, brick);
      }
      st.liquid[ii] = 0; st.liquidType[ii] = 0;          // 盒内岩浆清零
    }
  }
}

/** StartHardmode（cs:31866-31880）+ SetEventFlagCleared（NPC.cs:80281-80292）语义。
 *  调用方（Game 击杀流）按原版顺序执行：brickbox → 捕获旧 hardMode → 本函数 →
 *  (!wasHard 时) 灯笼夜 19 → misc[15] 公告 + 成就 9（由返回值委托，调用方消费）。 */
export function startHardmode(world: World): { wasHard: boolean } {
  const wasHard = !!world.flags.hardMode;
  (world.flags as Record<string, boolean>).hardMode = true;
  initializeHardMode(world, new RNG(world.seed));
  return { wasHard };
}
