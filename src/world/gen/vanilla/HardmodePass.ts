// 困难模式世界变换（1.4.5.7 1:1）：击杀血肉墙(113)后的世界转化链。
// ★行锚全面校准为 Terarria1457 实测行号（括注 = 1456 对照；本文件旧注全按 1456 记载）。
// - initializeHardMode（57: cs:31858-31988 / 56: 31734-31860）：V 形神圣/邪恶带（GERunner
//   菱形刷全表转化）+ 洞穴墙回填（ShapeFloodFill+OuterOutline）
//   · dualDungeonsSeed 门（cs:31864-31867）：flag=false 整段跳过双 GERunner/remix 带
//     （cs:31904 的 if(flag) 域），V 带位置三掷照耗、回填照跑
//   · remix 臂（cs:31906-31941）：不做 GERunner，改按地牢对侧地表边缘带（两臂各
//     maxX/7 与 maxX/14 列）自 (int)ws+Next(-1,2) 向下逐列 Convert(i,j,2)
//   · 微型世界回填窗口（cs:31961）：RandomWorldPoint(top,…,left) 下界双态
//     ws>100 ? ws−100 : 20（RandomWorldPoint cs:27374-27382：top,y ∈ Next(top,maxY-190)）
// - GERunner（57: cs:76923-77214 / 56: 76385-76683）：带宽 Next(200,250)×(w/4200)
//   (:76961)、初速 Next(-10,11)*0.1(:76969-76970)、菱形 |dx|+|dy|<带宽/2×(1±1.5% 逐格
//   抖动 Next(-10,11)*0.015)(:77003)、速度扰动 Next(-10,11)*0.05 钳 speedX±1(:77199)、
//   出界终止(:77208)；★Skyblock.lowTiles 早退门（cs:76941-76943，空岛低格档整段跳过、
//   零掷骰）；三套转化表（神圣 :77007+ / 猩红 :77076+ / 腐化 :77136+——墙 id 直存、
//   tile 走 sheet 反查）
// - createBrickBoxForWallOfFlesh（NPC.cs 57:79852-79866 / 56:79837-79866）：击杀点半径
//   w/2/16+1 的魔金砖 140（猩红世界 347 猩红砖）空心盒 + 盒内岩浆清零
// - StartHardmode（57: cs:31990-32008 / 56: 31866-31880）：早退门 netMode==1 ||
//   (hardMode && !force)（cs:31992-31993，重复激活不重跑变换）→ hardMode=true → 变换 →
//   misc[15] 公告 + NotifyProgressionEvent(9)；SetEventFlagCleared（NPC.cs 57:79572 /
//   56:79557）ref eventFlag,19（WOF case NPC.cs 57:80296-80310）——eventFlag 是
//   StartHardmode **之前**捕获的 hardMode 值，首次(=false)才触发灯笼夜 19
// - OnGameEventClearedForTheFirstTime 尾段双地牢批剥墙漆（NPC.cs 57:79607-79650 +
//   ClearUnbreakableWallsWithPaintUpTo cs:32033-32052）→ 本文件 F7 导出对
// RNG 备案（verdict#1b 口径修正）：原版 genRand 就是 Main.rand 的直别名（WorldGen.cs:4362
// `public static UnifiedRandom genRand => Main.rand;`），不存在独立的"世界种子流中段"——
// 生成期路径（startInHardmode）消费的是管线主流当前位；运行时路径（杀肉山）的 Main.rand
// 是会话随机态、逐位不可复现。本实现统一用 new RNG(world.seed) 新流（同种子世界 V 带
// 位置自洽，与原版逐位不同，结构性等价——RNG 面近似登记在先，勿误记为对拍债）。
import { RNG } from '../../../core/rng';
import { TILE_DEFS } from '../../../data/tiles';
import type { World } from '../../World';
import type { TileStore } from '../../TileStore';
import { vanSolidOrSloped } from './GenSolid';
// ★F4②：remix 边缘带逐列 Convert(i,j,2) 复用 SecretSeedDoEndsPass 的 Convert 单格
// 实现（case2 表/cascades/树护栏/KillTile 全链与其 hallowOnSurface、doNoInfection 等
// 消费面同源，禁止另刻第二套表）。本 import 与该模块对本文件的 initializeHardMode
// import 构成一条 ESM 函数级循环——两侧都只在【函数体】消费对方绑定、无顶层求值交叉，
// 实例化/求值序安全（tsc/vitest/esbuild 语义均为延迟绑定）。
import { convertHallowCell } from './SecretSeedDoEndsPass';

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

/** GERunner（57 cs:76923-77214 / 56 76385-76683）1:1。good=true 神圣带；false 时按
 *  world.crimson 走猩红/腐化表。hive>200k 门（flag）：全图 225 Hive 计数 >200000 时条带穿
 *  丛林连 225 Hive/230 CrispyHoney 一并转化（57 :77013-77024 / 56 :76433-76445）。
 *  lowTilesGate=Skyblock.lowTiles（cs:76941-76943）：空岛低格档在一切掷骰之前整段早退。
 *  ★PR-async 重构：hive 计数外提（两次 runner 调用的计数值恒等,单次计算零偏差）、
 *  改为 generator——逐【刷写列】yield（单元 ≤ 数百格），rng 消费序/写序逐字不变。 */
function* geRunnerGen(st: TileStore, rng: RNG, i: number, j: number, speedX: number, speedY: number,
  good: boolean, crimson: boolean, lowTilesGate: boolean, hiveFlag: boolean): Generator<void, void, void> {
  if (lowTilesGate) return;                              // ★F4③ Skyblock.lowTiles（cs:76941）
  const w = st.w, h = st.h;
  const flag = hiveFlag;                                 // 外提单算（两 runner 同值）
  let num2 = rng.nextIntRange(200, 250);                 // Next(200,250)（cs:76961）
  num2 = Math.trunc(num2 * (w / 4200));                  // ×(w/4200) 截断
  const num4 = num2;                                     // 刷半宽
  let vx = i, vy = j;                                    // val
  // ★F1 抖动区间（cs:76969-76970）：Next(-10,11)=右开区间含 +10；旧 nextIntRange(-10,10)
  // 漏上端点 → 初速向量整族偏低一档。
  let dx = rng.nextIntRange(-10, 11) * 0.1, dy = rng.nextIntRange(-10, 11) * 0.1;
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
        // 菱形刷（cs:77003）：|dm|+|dn| < 带宽/2 × (1±1.5% 逐格抖动)——★F1 同款右开
        // 区间 Next(-10,11)，含 +10 端点
        if (Math.abs(m - vx) + Math.abs(n - vy) >= num2 * 0.5 * (1 + rng.nextIntRange(-10, 11) * 0.015)) continue;
        const ii = st.idx(m, n);
        const wl = st.wall[ii];
        const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
        if (good) {
          // 神圣（57 :77007-77024 / 56 76496-…）：墙 63/65/66/68/69/81→70、216→219、187→222、3/83→28
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
          // 猩红（57 :77076-77135 / 56 76541-…）：墙 63/65/66/68→81、216→218、187→221
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
          // 腐化（57 :77136-77195 / 56 76605-…）：墙 63/65/66/68→69、216→217、187→220
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
      yield;                                             // PR-async：每刷写列一个单元
    }
    // 速度积分 + 扰动（57 :77197-77212 / 56 76669-76682）：val2.X += Next(-10,11)*0.05，
    // 钳 speedX±1（★F1：同样补 +10 端点）
    vx += dx; vy += dy;
    dx += rng.nextIntRange(-10, 11) * 0.05;
    if (dx > speedX + 1) dx = speedX + 1;
    if (dx < speedX - 1) dx = speedX - 1;
    if (vx < -num2 || vy < -num2 || vx > w + num2 || vy > h + num2) running = false;
  }
}

/** 225 Hive 全图计数（57 :77013-77024）。★PR-async：切片 generator（每 256 列一个
 *  单元）+ 单次计算外提——原版两 runner 各自重扫全图（同值重复劳动），此为无偏差微优化。 */
function* hiveScanGen(st: TileStore): Generator<void, number, void> {
  let hiveCount = 0;
  for (let x0 = 20; x0 < st.w - 20; x0 += 256) {
    const x1 = Math.min(st.w - 20, x0 + 256);
    for (let k = x0; k < x1; k++) {
      for (let l = 20; l < st.h - 20; l++) {
        if (st.flags[st.idx(k, l)] && TILE_DEFS[st.type[st.idx(k, l)]]?.vanilla?.sheet === 225) hiveCount++;
      }
    }
    yield;
  }
  return hiveCount;
}

/** 洞穴墙回填 OnlyWalls 白名单（cs:31979 原文列表照抄：0/54-59/61/185/212-215/2/196-199/
 *  15/40/71/64/204-211——原文表尾多一个重复的 71，bool 数组语义下无差，集合同值） */
const BACKFILL_WALLS = new Set([0, 54, 55, 56, 57, 58, 59, 61, 185, 212, 213, 214, 215, 2, 196, 197, 198, 199, 15, 40, 71, 64, 204, 205, 206, 207, 208, 209, 210, 211]);

/** ShapeFloodFill 配额（cs:31979 new ShapeFloodFill(1000)） */
export const BACKFILL_FLOOD_QUOTA = 1000;

/** ShapeFloodFill.Perform（ShapeFloodFill.cs 全文）1:1：非实心(IsNotSolid)+OnlyWalls
 *  白名单 BFS 泛洪。complete 判据（★F3 定案）=主循环耗尽后【弹出队列丢弃已访问格、
 *  仅当队内还剩未访问格才 false】——旧实现 `quota<=0 && queue.length` 把纯 visited
 *  尾巴（相邻扩邻造成的重复入队）误判成 incomplete。 */
export interface FloodResult { cells: Set<number>; complete: boolean }

export function shapeFloodFillOnlyWalls(
  st: TileStore, sx: number, sy: number, quotaMax: number = BACKFILL_FLOOD_QUOTA,
): FloodResult {
  const cells = new Set<number>();
  const queue: Array<[number, number]> = [[sx, sy]];
  let quota = quotaMax;
  const w = st.w, h = st.h;
  let head = 0;                                          // ★PR-async 微优化：head 指针替代 shift()（O(1) 出队,序不变）
  while (head < queue.length && quota > 0) {
    const [qx, qy] = queue[head++];
    const qi = st.idx(qx, qy);
    if (cells.has(qi)) continue;
    // ★R12-4（2026-08-24）：IsNotSolid（Modifiers.cs:563-571）=
    //  `!active || !SolidOrSlopedTile`——**活性但非实心**的装饰格（火把/藤/平台/
    //  草丛）计入 shape 且继续向外泛洪;旧实现 `flags→continue` 把它们当墙:
    //  ①回填墙斑在装饰处开洞;②shape 计数与 1000 配额消耗漂移 → 后续片落点
    //  全链偏移。改 active && SolidOrSlopedTile 才跳过（vanSolidOrSloped,
    //  GenSolid.cs:70515 1:1）。OnlyWalls 失败仍不扩邻（Chain 短路,ShapeFloodFill
    //  UnitApply false 不入队）——结构保持。
    if (st.flags[qi] && vanSolidOrSloped(st, qx, qy)) continue;   // IsNotSolid
    if (!BACKFILL_WALLS.has(st.wall[qi])) continue;               // OnlyWalls
    cells.add(qi);
    quota--;
    if (qx + 1 < w - 1) queue.push([qx + 1, qy]);
    if (qx - 1 >= 1) queue.push([qx - 1, qy]);
    if (qy + 1 < h - 1) queue.push([qx, qy + 1]);
    if (qy - 1 >= 1) queue.push([qx, qy - 1]);
  }
  // 尾段（ShapeFloodFill.cs:49-58）：逐个弹出丢弃已访问格；遇到未访问格回压并断言
  // incomplete（queue.Count==0 ⇔ complete）。quota 用尽不是判据本身。
  while (head < queue.length) {
    const [rx, ry] = queue[head++];
    if (!cells.has(st.idx(rx, ry))) return { cells, complete: false };
  }
  return { cells, complete: true };
}

/** ModShapes.OuterOutline(useDiagonals:true, useInterior:true)+Actions.PlaceWall
 *  （cs:31982）。★F5 落点行基定案：泛洪收集的是**相对坐标**（GenAction.UnitApply 以
 *  origin=(x,y−1) 记 OutputData.Add(x−origin.X,y−origin.Y)，GenAction.cs:15-17），外描边
 *  再以 origin=(x,y) 回放每个 datum 及其 8 邻环（ModShapes.cs OuterOutline.Perform:47-65）
 *  ⇒ 全部铺墙落点相对泛洪腔体整体**下移一行**（中心与环一致平移）。旧实现按泛洪原坐标
 *  直绘 = 整片墙高一行。wallId 为群系家族随机支 188-203 之一（cs:31965-31975 掷）。 */
export function paintBackfillOutline(st: TileStore, cells: Set<number>, wallId: number): void {
  for (const ci of cells) {
    const cx = ci % st.w;
    const cy = Math.trunc(ci / st.w) + 1;                // ★F5：origin 换行（相对→绝对）
    const paint = (wx: number, wy: number): void => {
      if (st.inBounds(wx, wy)) st.setWall(wx, wy, wallId);
    };
    paint(cx + 1, cy); paint(cx - 1, cy); paint(cx, cy + 1); paint(cx, cy - 1);
    paint(cx + 1, cy + 1); paint(cx + 1, cy - 1); paint(cx - 1, cy + 1); paint(cx - 1, cy - 1);
    paint(cx, cy);
  }
}

/** initializeHardMode（57 cs:31858-31988 / 56 31734-31860）1:1。
 *  秘种子分支由 world.seedFlags 供旗（运行时 startHardmode 与生成期 doStartInHardmode
 *  共用本函数自然生效）：dualDungeons 门 / remix 边缘带臂 / Skyblock.lowTiles 早退。
 *  ★PR-async：generator 化（单元=刷写列/回填 attempt/剥漆批次），rng 消费序与写序
 *  与同步版逐字一致；同步包装=全量 drain（测试与既有调用面契约不变）。 */
export function* initializeHardModeGen(world: World, rng: RNG): Generator<void, void, void> {
  const st = world.store, w = st.w, h = st.h;
  const sf = world.seedFlags ?? {};
  const bandsEnabled = !sf.dualDungeons;                 // ★F4① dualDungeonsSeed 门（cs:31864-31867）
  const lowTilesGate = !!world.skyblockLowTiles;         // ★F4③ GERunner 内 Skyblock.lowTiles（cs:76941）
  // ---- V 带位置（cs:31869-31901）：掷序/公式与条带开关无关，门关时照耗 ----
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
  const num6 = world.dungeonX < Math.trunc(w / 2) ? -1 : 1;   // 神圣带放地牢对侧（int 除法截断）
  if (num6 < 0) {
    if (num4 < num3) num4 = Math.trunc(w * num2);
    else num3 = Math.trunc(w * num2);
  } else if (num4 > num3) num4 = Math.trunc(w * (1 - num2));
  else num3 = Math.trunc(w * (1 - num2));
  if (bandsEnabled) {
    if (sf.remix) {
      // ---- ★F4② remix 臂（cs:31906-31941）：不做 GERunner —— 地牢对侧地表边缘带
      //  两翼各 maxX/7 与 maxX/14 列，列顶行=(int)ws+Next(-1,2)（每进入一列掷一次），
      //  向下到 maxY−10：外侧翼无条件 Convert(i,j,2)；内侧翼仅 Crimson/Corrupt tile 转。
      //  Convert case2 表走 SecretSeedDoEndsPass 同源实现（含 SquareWallFrame/
      //  SquareTileFrame 尾级联、树护栏、KillTile）——勿在此重刻第二套表。
      const num7 = Math.trunc(w / 7), num8 = Math.trunc(w / 14);
      const wsInt = Math.floor(world.groundLevel);       // (int)Main.worldSurface
      if (world.dungeonX < Math.trunc(w / 2)) {
        // 地牢在左 → 右缘带：[maxX-num7-num8, maxX)
        for (let i = w - num7 - num8; i < w; i++) {
          let j = wsInt + rng.nextIntRange(-1, 2);
          for (; j < h - 10; j++) {
            const sh = sheetOf(st, i, j);                  // cs 字面裸读 type（活性无关）
            if (i > w - num7) convertHallowCell(st, rng, i, j);
            else if (SET_CRIMSON.has(sh) || SET_CORRUPT.has(sh)) convertHallowCell(st, rng, i, j);
            if ((j & 255) === 255) yield;                  // PR-async：每 256 行一个单元
          }
          yield;                                           // 每列收尾单元
        }
      } else {
        // 地牢在右 → 左缘带：[0, num7+num8)
        for (let k = 0; k < num7 + num8; k++) {
          let l = wsInt + rng.nextIntRange(-1, 2);
          for (; l < h - 10; l++) {
            const sh = sheetOf(st, k, l);                  // cs 字面裸读 type（活性无关）
            if (k < num7) convertHallowCell(st, rng, k, l);
            else if (SET_CRIMSON.has(sh) || SET_CORRUPT.has(sh)) convertHallowCell(st, rng, k, l);
            if ((l & 255) === 255) yield;
          }
          yield;
        }
      }
    } else {
      // hive 计数单算外提（两 runner 同值——原版各扫一遍为重复劳动,PR-async 微优化）
      const hiveCount = yield* hiveScanGen(st);
      const hiveFlag = hiveCount > 200000;
      yield* geRunnerGen(st, rng, num3, 0, 3 * num5, 5.0, true, world.crimson, lowTilesGate, hiveFlag);
      yield* geRunnerGen(st, rng, num4, 0, -3 * num5, 5.0, false, world.crimson, lowTilesGate, hiveFlag);
    }
  }
  // ---- 洞穴墙回填（cs:31944-31986）：25×(w/4200) 片（dualDungeons/remix 不豁免）----
  let budget = Math.trunc(25 * (w / 4200));
  let attempts = 0;
  while (budget > 0) {
    if (++attempts % 15000 === 0) budget--;              // 原版放弃退减（防死循环）
    // RandomWorldPoint(top,right,bottom,left)（cs:27374-27382）/ 三元下界（cs:31961）
    // ★F6 双态下界：ws>100 → top=ws−100；否则 top=20。合并式 max(20, ws−100) 会把
    // ws∈(100,120) 的窗口（top∈(0,20)）错误压回 20。
    const pyMin = world.groundLevel > 100 ? Math.trunc(world.groundLevel) - 100 : 20;
    const px = rng.nextIntRange(1, w - 1);               // Next(left=1, maxX-right=1)
    const py = rng.nextIntRange(pyMin, h - 190);         // Next(top, maxY-bottom)
    if (!st.inBounds(px, py)) continue;
    const ii = st.idx(px, py);
    const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
    let wallId = 0;
    if (SET_CRIMSON.has(sh)) wallId = 192 + rng.nextInt(4);       // 猩红墙 192-195
    else if (SET_CORRUPT.has(sh)) wallId = 188 + rng.nextInt(4);  // 腐化墙 188-191
    else if (SET_HALLOW.has(sh)) wallId = 200 + rng.nextInt(4);   // 神圣墙 200-203
    if (st.flags[ii] && wallId !== 0 && !st.flags[st.idx(px, py - 1)]) {
      // ShapeFloodFill(1000)（泛洪种子=上格 point.Y−1，cs:31979）
      const flood = shapeFloodFillOnlyWalls(st, px, py - 1);
      if (flood.cells.size > 50 && flood.complete) {
        // OuterOutline(origin=(x,y))（cs:31982）——★F5 相对坐标回放下移一行
        paintBackfillOutline(st, flood.cells, wallId);
        budget--;
      }
    }
    yield;                                               // PR-async：每 attempt 一个单元
  }
}

/** 同步包装（全量 drain）——既有测试/调用面契约不变。 */
export function initializeHardMode(world: World, rng: RNG): void {
  const it = initializeHardModeGen(world, rng);
  for (let r = it.next(); !r.done; r = it.next()) void r.value;
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

/** StartHardmode（57 cs:31990-32008 / 56 31866-31880）+ SetEventFlagCleared
 *  （NPC.cs 57:79572/80306 / 56:79557/80306）语义。
 *  ★F2 早退门（cs:31992-31993 `if (Main.netMode == 1 || (Main.hardMode && !force)) return`）：
 *  已激活世界重复杀肉山只重铺砖盒（调用方 brickbox 在先），**不再**跑 initializeHardMode
 *  （原版 netMode==1 客户端支在本仓无拓扑对应，省略——联机权威在主机侧独立结算）。
 *  调用方（Game 击杀流）按原版顺序执行：brickbox → 捕获旧 hardMode → 本函数 →
 *  (!wasHard 时) 灯笼夜 19 + 双地牢墙漆档 → misc[15] 公告 + 成就 9（由返回值委托，
 *  调用方消费）。
 *  ★PR-async：同步路径改为【全量 drain 组合步进】，终态与逐字版完全一致；
 *  世界瓦片工作 = initializeHardMode + (dualDungeons 且首翻) Dungeon 档剥漆全图扫描
 *  （原 NPC.cs:79650 在 LanternNight 19 之后同 tick 同步跑——现并入 job 由调用方
 *  分步驱动,其余 boss 事件的 onGameEventClearedForDualDungeons 同步路径不变）。 */
export function startHardmode(world: World): { wasHard: boolean } {
  const wasHard = !!world.flags.hardMode;
  (world.flags as Record<string, boolean>).hardMode = true;
  const it = startHardmodeStepsGen(world, wasHard, false);
  for (let r = it.next(); !r.done; r = it.next()) void r.value;
  return { wasHard };
}

/** 组合步进流：conversion → (dualDungeons 首翻) Dungeon 档剥漆。
 *  includeDualClear=false = 既有 sync startHardmode 契约（Game 的 WOF 链显式调用
 *  onGameEventClearedForDualDungeons 的位置保持原序）。 */
function* startHardmodeStepsGen(world: World, wasHard: boolean,
  includeDualClear: boolean): Generator<void, void, void> {
  if (!wasHard) {
    yield* initializeHardModeGen(world, new RNG(world.seed));
    if (includeDualClear && world.seedFlags?.dualDungeons) {
      yield* clearUnbreakableWallsWithPaintUpToGen(world, DUAL_DUNGEON_WALL_TIERS.Dungeon);
    }
  }
}

/** 肉山死亡异步 job（PR-async 主入口）：Game 击杀流即刻拿 wasHard（公告/旗标/灯笼夜
 *  照原版序同步触发），世界瓦片转换由调用方每 tick `step()` 预算驱动。
 *  wasHard=true（重复激活）⇒ job 立即完成（F2 门：只重铺砖盒，无世界工作）。 */
export interface HardmodeJob { wasHard: boolean; step(): boolean }
export function startHardmodeJob(world: World): HardmodeJob {
  const wasHard = !!world.flags.hardMode;
  (world.flags as Record<string, boolean>).hardMode = true;
  const it = startHardmodeStepsGen(world, wasHard, true);
  let done = wasHard;                                    // F2 门：重复激活无世界工作
  return {
    wasHard,
    step(): boolean {
      if (done) return true;
      const r = it.next();
      if (r.done) { done = true; return true; }
      return false;
    },
  };
}

// ============================================================
// ★F7 双地牢事件尾段·批剥墙漆（NPC.cs:79607-79650 OnGameEventClearedForTheFirstTime
// 的 dualDungeons 分支 + WorldGen.cs:32033-32052 ClearUnbreakableWallsWithPaintUpTo 本体）
// ============================================================
/** DualDungeonUnbreakableWallTiers（Terraria.GameContent.Generation.Dungeon/
 *  DualDungeonUnbreakableWallTiers.cs:3-9；Temple=5 本链不用故不列） */
export const DUAL_DUNGEON_WALL_TIERS = {
  EarlyGame: 0, EvilBoss: 1, JungleBoss: 2, Dungeon: 3, Hallow: 4,
} as const;

/** TileID.Sets.MatchingUnsafeWall（TileID.cs:425 `Factory.CreateUshortSet(0, (tile→wall)…)`；
 *  SetFactory.cs:131-148：首参=defaultState=未列出 type 的替换墙，其后按 (key,value) 对）。
 *  仅列出「骨架砖/感染块/地牢砖/蜂块」等对应面——与 dual dungeon 生成墙 350 落点族吻合。 */
const MATCHING_UNSAFE_WALL = new Map<number, number>([
  [38, 349],   // GrayBrick → StoneUnsafe
  [39, 6],     // RedBrick → RedBrickWall
  [161, 71],   // IceBlock → IceUnsafe
  [25, 3],     // Ebonstone → EbonstoneUnsafe
  [203, 83],   // Crimstone → CrimstoneUnsafe
  [396, 187],  // Sandstone → SandstoneWall
  [59, 64],    // Mud → MudWall
  [60, 64],    // JungleGrass → MudWall
  [225, 86],   // Hive → HiveUnsafe
  [117, 28],   // Pearlstone → PearlstoneBrickUnsafe
  [41, 7],     // BlueSlabDungeonBrick → BlueDungeonUnsafe
  [44, 9],     // PinkSlabDungeonBrick → PinkDungeonUnsafe
  [43, 8],     // GreenSlabDungeonBrick → GreenDungeonUnsafe
  [226, 87],   // TempleBrick → LihzahrdBrickUnsafe
]);

/** ClearUnbreakableWallsWithPaintUpTo(tierColor)（WorldGen.cs:32033-32052）：全图把
 *  「双地牢不可破标记墙 350 且墙漆低四位 ≤ 档色」的格还原成其下 tile 的配套可破墙并清漆；
 *  paintWall 存档通道见 DitherSnakePass 注（tier+16 编码的中间档同 nibble 同判）。
 *  ★PR-async：generator 化（每 256 列一个单元）；同步包装契约不变。 */
export function* clearUnbreakableWallsWithPaintUpToGen(world: World, tierColor: number): Generator<void, void, void> {
  const st = world.store;
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.wall[i] === 350 && (st.paintWall[i] & 0xF) <= tierColor) {
        st.wall[i] = MATCHING_UNSAFE_WALL.get(sheetOf(st, x, y)) ?? 0;   // 缺表 tile → defaultState 0
        st.paintWall[i] = 0;
      }
    }
    if ((x & 255) === 255) yield;
  }
}

/** 同步包装（全量 drain）——其余 boss 事件链（11/13/14/8/15/16-18/24）的既有调用面不变。 */
export function clearUnbreakableWallsWithPaintUpTo(world: World, tierColor: number): void {
  const it = clearUnbreakableWallsWithPaintUpToGen(world, tierColor);
  for (let r = it.next(); !r.done; r = it.next()) void r.value;
}

/** OnGameEventClearedForTheFirstTime 尾段双地牢分支（NPC.cs:79607-79650）。挂点=
 *  Game 各首胜链在 LanternNight.onGameEventCleared 之后同门调用（肉山 :7155 区、
 *  boss 链 :7165 区）；事件 0-5/7/9/10/12/20-23 在原版 switch 里空转或无 case → 零行为。 */
export function onGameEventClearedForDualDungeons(world: World, gameEventId: number): void {
  if (!world.seedFlags?.dualDungeons) return;
  switch (gameEventId) {
    case 11:
    case 13:
      clearUnbreakableWallsWithPaintUpTo(world, DUAL_DUNGEON_WALL_TIERS.EarlyGame);
      break;
    case 14:
      clearUnbreakableWallsWithPaintUpTo(world, DUAL_DUNGEON_WALL_TIERS.EvilBoss);
      break;
    case 8:
      clearUnbreakableWallsWithPaintUpTo(world, DUAL_DUNGEON_WALL_TIERS.JungleBoss);
      break;
    case 15:
    case 19:
      clearUnbreakableWallsWithPaintUpTo(world, DUAL_DUNGEON_WALL_TIERS.Dungeon);
      break;
    case 16:
    case 17:
    case 18:
    case 24:
      clearUnbreakableWallsWithPaintUpTo(world, DUAL_DUNGEON_WALL_TIERS.Hallow);
      break;
    default:
      break;
  }
}
