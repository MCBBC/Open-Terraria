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
// ★NB-A3（2026-09-02）：GERunner 转化尾级联 SquareTileFrame(m,n)（cs:150949 一带，1458 行锚
// /1457 cs:77013 区）——x86 对拍实证：原版每条 tile 转化支写型后必调 SquareTileFrame(m,n)
// （=九宫 TileFrame，把邻格腐化/绯红植被按新地基重挂种 PlantCheck_TryGetNewType、
// LargePiles2→LargePiles 重挂面等）。缺失曾致 hm-probe L3 残差 36,288 格（首差
// T(2396,101) x186/j187=LargePiles2 未重挂、T(2384,102) x24/j3=植被未按新地基重挂种；
// 掷流两侧仍 1:1——本 seed 级联零掷，与 genTileFrame 金标一致）。复用 FinalCleanupPass
// 的认证级实现（SecretSeedDoEndsPass convertCell 同款消费面），禁在此重刻第二套。
import { genSquareTileFrame } from './FinalCleanupPass';
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
/** 内部 tile id → sheet id 直查 LUT（PR-async 性能刀：GERunner 热循环每格一次
 *  TILE_DEFS 对象图游走 ≈40-80ns → Int16Array 直读 ≈2ns;~4.5 亿格合计省 15-30s） */
const SHEET_LUT = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sh = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sh === 'number') SHEET_LUT[i] = sh;
}

/** TileID.Sets（TileID.cs:329-347）：回填门与转化表用 */
const SET_CORRUPT = new Set([23, 661, 25, 112, 163, 398, 400, 636]);
const SET_HALLOW = new Set([109, 492, 117, 116, 164, 402, 403, 115]);
const SET_CRIMSON = new Set([199, 662, 203, 234, 200, 399, 401, 205]);
const sheetOf = (st: TileStore, x: number, y: number): number =>
  SHEET_LUT[st.type[st.idx(x, y)]];

/** GERunner（57 cs:76923-77214 / 56 76385-76683）1:1。good=true 神圣带；false 时按
 *  world.crimson 走猩红/腐化表。hive>200k 门（flag）：全图 225 Hive 计数 >200000 时条带穿
 *  丛林连 225 Hive/230 CrispyHoney 一并转化（57 :77013-77024 / 56 :76433-76445）。
 *  lowTilesGate=Skyblock.lowTiles（cs:76941-76943）：空岛低格档在一切掷骰之前整段早退。
 *  ★PR-async 重构：generator 化——逐【刷写列】yield（单元 ≤ 数百格），rng 消费序/
 *  写序逐字不变；hive 扫描保留在本函数体内逐 runner 新鲜计算（切片 yield），见 F2' 注。 */
function* geRunnerGen(st: TileStore, rng: RNG, i: number, j: number, speedX: number, speedY: number,
  good: boolean, crimson: boolean, lowTilesGate: boolean): Generator<void, void, void> {
  if (lowTilesGate) return;                              // ★F4③ Skyblock.lowTiles（cs:76941）
  const w = st.w, h = st.h;
  // ★PR-async 内联（2026-09-03）：UnifiedRandom.InternalSample 逐字转录
  //  （decompiled Terraria.Utilities/UnifiedRandom.cs:68-88—— Terraria 自带变体无
  //  inextp 双指针,num2=inext+21 环 55）。rng.seedArray 共享引用直读直写,inext 走
  //  生成器局部（跨 yield 存活,列 yield/返回前回写）;每格省一次方法调用+区间包装,
  //  值序/消费序与 rng.nextIntRange(-10,11) 位级一致（hardmode-async-matrix 锁）。
  // ★rng 是 RNG 包装类(内部 ur=UnifiedRandom)——seedArray/inext 必须经 .vanilla 取
  const ur = (rng as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
  const sa = ur.seedArray;
  const ROLL_HOOK = (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll;
  // ★F2'（2026-09-02 review 回滚外提）：hive 扫描回归本函数内部逐 runner 新鲜扫描
  //  （原版 cs:77013 在 GERunner 体内）——外提版在"runner1 带内转化 225 使计数跌破
  //  20 万阈值"的极端世界会改变 runner2 的 flag=终态偏差;扫描本身是可切片单元,
  //  异步预算无压力。切片单元=256 列。
  let hiveCount = 0;
  for (let hx = 20; hx < w - 20; hx += 256) {
    const hx1 = Math.min(w - 20, hx + 256);
    for (let k = hx; k < hx1; k++) {
      for (let l = 20; l < h - 20; l++) {
        if (st.flags[st.idx(k, l)] && TILE_DEFS[st.type[st.idx(k, l)]]?.vanilla?.sheet === 225) hiveCount++;
      }
    }
    yield;
  }
  const flag = hiveCount > 200000;
  let num2 = rng.nextIntRange(200, 250);                 // Next(200,250)（cs:76961）
  num2 = Math.trunc(num2 * (w / 4200));                  // ×(w/4200) 截断
  const num4 = num2;                                     // 刷半宽
  let vx = i, vy = j;                                    // val
  // ★F1 抖动区间（cs:76969-76970）：Next(-10,11)=右开区间含 +10；旧 nextIntRange(-10,10)
  // 漏上端点 → 初速向量整族偏低一档。
  let dx = rng.nextIntRange(-10, 11) * 0.1, dy = rng.nextIntRange(-10, 11) * 0.1;
  if (speedX !== 0 || speedY !== 0) { dx = speedX; dy = speedY; }
  let running = true;
  let inextLoc = ur.inext;   // ★捕获必须在 V 带掷骰之后(否则重放错位)
  // ★IIIII216（2026-09-03）：GERunner 转化支尾级联 SquareTileFrame(m,n)——1458 原文
  //  good 十支(77036/77041/77046/77051/77056/77061/77066/77071/77076/77081)、crimson
  //  九支(77101-77141)、corrupt 九支(77161-77201)每支 type 写后必调；墙支无。NB-A3
  //  头注宣称接线但调用从未落盘（半重构签名）——基线 g2 L3=36,839 首差
  //  T(2384,102) x24/j3=PlantCheck 按新地基重挂种、T(2396,101) x186/j187=Pile 重挂,
  //  均为级联【写面】缺（inext 同步正确 ⇒ 掷流仍逐位全等,写序列缺段）。
  //  inext 纪律：本生成器热循环内联 InternalSample（inextLoc 局部化、跨 yield 存活）,
  //  级联内掷走 RNG 门面（写 ur.inext 同一实例）——调用前回写、调用后读回,
  //  级联掷落入 V 带菱形抖动之间的原版位次。 HM 期 generatingWorld=true ⇒
  //  TileFrameCosmetic 不走,级联掷=TileFrameImportant 分派/ KillTile 尘掷,与 x86 rig
  //  （HardmodeProbeHook 执行点=GenerateWorld 尾,generatingWorld 仍 true）同口径。
  const cascade = (mm: number, nn: number): void => {
    ur.inext = inextLoc;
    genSquareTileFrame(st, rng, mm, nn);
    inextLoc = ur.inext;
  };
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
        let iN = inextLoc + 1; if (iN > 55) iN = 1;
        let iP = iN + 21; if (iP > 55) iP -= 55;
        let smp = sa[iN] - sa[iP];
        if (smp === 2147483647) smp--;
        smp += (smp >> 31) & 0x7fffffff;
        sa[iN] = smp;
        inextLoc = iN;
        ROLL_HOOK?.(smp, ur);
        if (Math.abs(m - vx) + Math.abs(n - vy) >= num2 * 0.5 * (1 + (Math.trunc(smp * 4.656612875245797e-10 * 21) - 10) * 0.015)) continue;
        const ii = st.idx(m, n);
        const wl = st.wall[ii];
        const sh = SHEET_LUT[st.type[ii]];
        // ★NB-A/IIIII216 级联（2026-09-03 定谳）：原版每支 type 写后紧跟
        //  SquareTileFrame(m,n)（1458 cs:77033-77202 逐支内联；本体 cs:81470）——
        //  3×3 邻域 TileFrame 重框（苔藓/植被邻格改型）+ 失支撑格 KillTile。墙写四支
        //  原版无任何帧调用，故墙侧不接级联。★掷面澄清：HM 期 generatingWorld=true
        //  ⇒ TileFrameCosmetic 不走 ⇒ 实心格级联零掷（x86 hm 段 22,475,354 样本逐位
        //  全等的真因），NB-A3 备注的"掷差致 dx 漂移"表述作废——36,288/36,839 残差是
        //  级联【写面】缺（PlantCheck 重挂种/Pile 重挂/失支撑 KillTile），非掷差。
        //  本批（IIIII216）每支尾 cascade() 才是级联首次真正落盘（NB-A3 时调用缺失）。
        // ★IIII177（2026-09-02）：type 写改**纯 type 直写**（原版 `Main.tile[m,n].type = X`
        //  不置 active/不清帧/漆/涂层——cs:77009-77202 逐支裸赋值）——旧 st.setTile 会把
        //  非活性幽灵格**激活**（flags=1）并清漆/涂层，x86 转化格活性位原样保留：
        //  tooeasy #105 终态 x86 type117 act=60,068/115,410（55,342 格幽灵 117），
        //  JS 全部激活 ⇒ A=110,194/T0>117×57,533/T0>25×39,295 激活伪影（dump 对比实证，
        //  /tmp/iii177-out）。tileFrameGen 的 !active 支（清 half/slope/漆/涂层）与
        //  x86 TileFrame 非活性支同构，级联语义不受本改动影响。
        if (good) {
          // 神圣（57 :77007-77024 / 56 76496-…）：墙 63/65/66/68/69/81→70、216→219、187→222、3/83→28
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68 || wl === 69 || wl === 81) st.setWall(m, n, 70);
          else if (wl === 216) st.setWall(m, n, 219);
          else if (wl === 187) st.setWall(m, n, 222);
          else if (wl === 3 || wl === 83) st.setWall(m, n, 28);
          // tile：2→109 草；1/25/203→117 珍珠岩；53/123/112/234→116 珍珠沙；
          // 661/662→60 丛林草；23/199→109；161/163/200 冰→164 粉冰；396→403、397→402；
          // flag 门：225 Hive→117、230 CrispyHoney→402（cs:76486-76488）
          // ★IIIII216：每支尾 SquareTileFrame(m,n)（1458 cs:77033-77082 逐支内联）
          if (flag && sh === 225) { st.type[ii] = id(117); cascade(m, n); }
          else if (flag && sh === 230) { st.type[ii] = id(402); cascade(m, n); }
          else if (sh === 2) { st.type[ii] = id(109); cascade(m, n); }
          else if (sh === 1 || sh === 25 || sh === 203) { st.type[ii] = id(117); cascade(m, n); }
          else if (sh === 53 || sh === 123 || sh === 112 || sh === 234) { st.type[ii] = id(116); cascade(m, n); }
          else if (sh === 661 || sh === 662) { st.type[ii] = id(60); cascade(m, n); }
          else if (sh === 23 || sh === 199) { st.type[ii] = id(109); cascade(m, n); }
          else if (sh === 161 || sh === 163 || sh === 200) { st.type[ii] = id(164); cascade(m, n); }
          else if (sh === 396) { st.type[ii] = id(403); cascade(m, n); }
          else if (sh === 397) { st.type[ii] = id(402); cascade(m, n); }
        } else if (crimson) {
          // 猩红（57 :77076-77135 / 56 76541-…）：墙 63/65/66/68→81、216→218、187→221
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68) st.setWall(m, n, 81);
          else if (wl === 216) st.setWall(m, n, 218);
          else if (wl === 187) st.setWall(m, n, 221);
          // tile：60/661→662；2/109→199；1/117→203；53/123/116→234；161/164→200；396→401、397→399；
          // flag 门：225 Hive→203、230 CrispyHoney→399（cs:76550-76557）
          // ★IIIII216：每支尾 SquareTileFrame(m,n)（1458 cs:77098-77142 逐支内联）
          if (flag && sh === 225) { st.type[ii] = id(203); cascade(m, n); }
          else if (flag && sh === 230) { st.type[ii] = id(399); cascade(m, n); }
          else if (sh === 60 || sh === 661) { st.type[ii] = id(662); cascade(m, n); }
          else if (sh === 2 || sh === 109) { st.type[ii] = id(199); cascade(m, n); }
          else if (sh === 1 || sh === 117) { st.type[ii] = id(203); cascade(m, n); }
          else if (sh === 53 || sh === 123 || sh === 116) { st.type[ii] = id(234); cascade(m, n); }
          else if (sh === 161 || sh === 164) { st.type[ii] = id(200); cascade(m, n); }
          else if (sh === 396) { st.type[ii] = id(401); cascade(m, n); }
          else if (sh === 397) { st.type[ii] = id(399); cascade(m, n); }
        } else {
          // 腐化（57 :77136-77195 / 56 76605-…）：墙 63/65/66/68→69、216→217、187→220
          if (wl === 63 || wl === 65 || wl === 66 || wl === 68) st.setWall(m, n, 69);
          else if (wl === 216) st.setWall(m, n, 217);
          else if (wl === 187) st.setWall(m, n, 220);
          // tile：60/662→661；2/109→23；1/117→25；53/123/116→112；161/164→163；396→400、397→398；
          // flag 门：225 Hive→25、230 CrispyHoney→398（腐化分支同构）
          // ★IIIII216：每支尾 SquareTileFrame(m,n)（1458 cs:77158-77202 逐支内联）
          if (flag && sh === 225) { st.type[ii] = id(25); cascade(m, n); }
          else if (flag && sh === 230) { st.type[ii] = id(398); cascade(m, n); }
          else if (sh === 60 || sh === 662) { st.type[ii] = id(661); cascade(m, n); }
          else if (sh === 2 || sh === 109) { st.type[ii] = id(23); cascade(m, n); }
          else if (sh === 1 || sh === 117) { st.type[ii] = id(25); cascade(m, n); }
          else if (sh === 53 || sh === 123 || sh === 116) { st.type[ii] = id(112); cascade(m, n); }
          else if (sh === 161 || sh === 164) { st.type[ii] = id(163); cascade(m, n); }
          else if (sh === 396) { st.type[ii] = id(400); cascade(m, n); }
          else if (sh === 397) { st.type[ii] = id(398); cascade(m, n); }
        }
      }
      ur.inext = inextLoc;                                     // yield 边界回写(代价 1 写)
      yield;                                             // PR-async：每刷写列一个单元
    }
    // 速度积分 + 扰动（57 :77197-77212 / 56 76669-76682）：val2.X += Next(-10,11)*0.05，
    // 钳 speedX±1（★F1：同样补 +10 端点）
    vx += dx; vy += dy;
    let sI = inextLoc + 1; if (sI > 55) sI = 1;
    let sP = sI + 21; if (sP > 55) sP -= 55;
    let sV = sa[sI] - sa[sP];
    if (sV === 2147483647) sV--;
    sV += (sV >> 31) & 0x7fffffff;
    sa[sI] = sV;
    inextLoc = sI;
    ROLL_HOOK?.(sV, ur);
    dx += (Math.trunc(sV * 4.656612875245797e-10 * 21) - 10) * 0.05;
    if (dx > speedX + 1) dx = speedX + 1;
    if (dx < speedX - 1) dx = speedX - 1;
    if (vx < -num2 || vy < -num2 || vx > w + num2 || vy > h + num2) running = false;
  }
  ur.inext = inextLoc;                                         // 收尾回写(backfill/后续消费面接续)
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

/** ★IIIII216b：Main.wallLargeFrames 成员表（Main.cs:9889-9905 区全量 grep）——命中者
 *  Framing.WallFrame 走查表支（wallFrameNumber 查表）**零掷**；表外才走 resetFrame 掷骰支。 */
const WALL_LARGE_FRAMES = new Set([146, 147, 167, 179, 185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 354, 355, 358, 359, 362, 363, 366]);

/** OuterOutline POINT_OFFSETS 8 邻序（ModShapes.cs:22-27，useDiagonals=true 语义序 1:1） */
const RING8_OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** ModShapes.OuterOutline(useDiagonals:true, useInterior:true)+Actions.PlaceWall
 *  （cs:31982）。★F5 落点行基定案：泛洪收集的是**相对坐标**（GenAction.UnitApply 以
 *  origin=(x,y−1) 记 OutputData.Add(x−origin.X,y−origin.Y)，GenAction.cs:15-17），外描边
 *  再以 origin=(x,y) 回放每个 datum 及其 8 邻环（ModShapes.cs OuterOutline.Perform:47-65）
 *  ⇒ 全部铺墙落点相对泛洪腔体整体**下移一行**（中心与环一致平移）。wallId 为群系家族
 *  随机支 188-203 之一（cs:31965-31975 掷）。
 *  ★IIIII216b 定罪补刀（HM L3 残 3,825 单斑根因）：Actions.PlaceWall（Actions.cs:537-548）
 *  每次调用尾随 WorldGen.SquareWallFrame(self)+邻 4 组（SquareWallFrame 每组 9×
 *  Framing.WallFrame，其中**仅组中心带 resetFrame:true**，Framing.cs:389-395）——组中心
 *  每次消耗 genRand.Next(0,3) 1 掷（wall==21 再 Next(2) 1 掷；wallLargeFrames 查表支/
 *  WallFrame 头守卫界外/ wall==0 提前返回均零掷）。旧实现 setWall 直写零掷 ⇒ 每漆格
 *  缺 5 掷量级、全批缺 4.5 万掷 ⇒ 后续 attempt 采样点序错位（x86 22 斑 vs JS 22+1 幽灵斑）。
 *  本补刀 1:1 复刻：OuterOutline 迭代序（datum 内=interior 先行+非 shape 邻环）+每 PlaceWall
 *  的 5 组中心掷骰消费（读墙=落墙后现场态，含前序 application 已漆邻格）。 */
export function paintBackfillOutline(st: TileStore, rng: RNG, cells: Set<number>, wallId: number): void {
  const w = st.w;
  // SquareWallFrame 的 5 个 resetFrame:true 组中心偏移（cs:81501-81512：self,+x,−x,−y,+y）
  const GROUPS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1]];
  /** Framing.WallFrame(center, resetFrame:true) 掷骰消费（Framing.cs:327-331 头守卫+389-395） */
  const squareWallFrameRolls = (gx: number, gy: number): void => {
    if (gx <= 0 || gy <= 0 || gx >= w - 1 || gy >= st.h - 1) return;   // 头守卫：界外零掷
    const wall = st.wall[st.idx(gx, gy)]!;
    if (wall === 0) return;                                            // wall==0 提前返回零掷
    if (WALL_LARGE_FRAMES.has(wall)) return;                           // 查表支零掷
    rng.nextIntRange(0, 3);                                            // Next(0,3) 帧号支 1 掷（值不入 dump）
    if (wall === 21) rng.nextIntRange(0, 2);                           // cs:391 wall21 追加 Next(2)
  };
  const paint = (wx: number, wy: number): void => {
    if (!st.inBounds(wx, wy)) return;
    st.setWall(wx, wy, wallId);
    for (const [gx, gy] of GROUPS) squareWallFrameRolls(wx + gx, wy + gy);
  };
  for (const ci of cells) {
    const cx = ci % w;
    const cy = Math.trunc(ci / w) + 1;                   // ★F5：origin 换行（相对→绝对）
    paint(cx, cy);                                       // useInterior：datum 本体先行
    for (const [ox, oy] of RING8_OFFSETS) {
      // 邻环资格=vanilla _data.Contains(datum+offset)（泛洪相对域）——绝对域同构判定
      if (!cells.has((cy - 1 + oy) * w + (cx + ox))) paint(cx + ox, cy + oy);
    }
  }
}

/** initializeHardMode（57 cs:31858-31988 / 56 31734-31860）1:1。
 *  秘种子分支由 world.seedFlags 供旗（运行时 startHardmode 与生成期 doStartInHardmode
 *  共用本函数自然生效）：dualDungeons 门 / remix 边缘带臂 / Skyblock.lowTiles 早退。
 *  ★PR-async：generator 化（单元=刷写列/回填 attempt/剥漆批次），rng 消费序与写序
 *  与同步版逐字一致；同步包装=全量 drain（测试与既有调用面契约不变）。 */
export function* initializeHardModeGen(world: World, rng: RNG): Generator<void, void, void> {
  // ★IIII177 DSEG 段界标记（一次性取证仪,缺省零开销）：掷流窗对拍用段界（观测不消费）
  const seg177 = (t: string): void => {
    (globalThis as { __swSeg?: (tag: string) => void }).__swSeg?.(t);
  };
  seg177('IIII177 HM-IN');
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
  seg177(`IIII177 HM-HEAD num3=${num3} num4=${num4} num5=${num5} num6=${num6}`);
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
      seg177('IIII177 GER1-IN');
      yield* geRunnerGen(st, rng, num3, 0, 3 * num5, 5.0, true, world.crimson, lowTilesGate);
      seg177('IIII177 GER1-OUT');
      seg177('IIII177 GER2-IN');
      yield* geRunnerGen(st, rng, num4, 0, -3 * num5, 5.0, false, world.crimson, lowTilesGate);
      seg177('IIII177 GER2-OUT');
    }
  }
  // ---- 洞穴墙回填（cs:31944-31986）：25×(w/4200) 片（dualDungeons/remix 不豁免）----
  seg177('IIII177 ALT-IN');
  // ★IIIII216 取证桩（SW_HM_ALT_STATS=1；缺省零开销）：回填段 attempt/成功/退减计数
  const altStats = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SW_HM_ALT_STATS === '1')
    ? { a: 0, s: 0, c: 0, floods: 0, log: [] as string[] }
    : null;
  let budget = Math.trunc(25 * (w / 4200));
  let attempts = 0;
  while (budget > 0) {
    if (++attempts % 15000 === 0) budget--;              // 原版放弃退减（防死循环）
    if (altStats) { altStats.a++; if (attempts % 15000 === 0) altStats.c++; }
    // RandomWorldPoint(top,right,bottom,left)（cs:27374-27382）/ 三元下界（cs:31961）
    // ★F6 双态下界：ws>100 → top=ws−100；否则 top=20。合并式 max(20, ws−100) 会把
    // ws∈(100,120) 的窗口（top∈(0,20)）错误压回 20。
    const pyMin = world.groundLevel > 100 ? Math.trunc(world.groundLevel) - 100 : 20;
    const px = rng.nextIntRange(1, w - 1);               // Next(left=1, maxX-right=1)
    const py = rng.nextIntRange(pyMin, h - 190);         // Next(top, maxY-bottom)
    if (!st.inBounds(px, py)) continue;
    const ii = st.idx(px, py);
    const sh = SHEET_LUT[st.type[ii]];
    if (altStats) {
      // ★IIIII216b p 行：attempt 点态+流位置（与 x86 SW_ALT: p 行同构对齐）
      const rollCount = (globalThis as { __swRollCount?: number }).__swRollCount ?? -1;
      altStats.log.push(`P ${attempts}: ${px},${py} t${sh < 0 ? 9999 : sh} a${st.flags[ii] ? 1 : 0} u${st.flags[st.idx(px, py - 1)] ? 1 : 0} r${rollCount}`);
    }
    let wallId = 0;
    if (SET_CRIMSON.has(sh)) wallId = 192 + rng.nextInt(4);       // 猩红墙 192-195
    else if (SET_CORRUPT.has(sh)) wallId = 188 + rng.nextInt(4);  // 腐化墙 188-191
    else if (SET_HALLOW.has(sh)) wallId = 200 + rng.nextInt(4);   // 神圣墙 200-203
    if (st.flags[ii] && wallId !== 0 && !st.flags[st.idx(px, py - 1)]) {
      // ShapeFloodFill(1000)（泛洪种子=上格 point.Y−1，cs:31979）
      const flood = shapeFloodFillOnlyWalls(st, px, py - 1);
      if (altStats) {
        altStats.floods++;
        altStats.log.push(`F ${attempts}: ${px},${py} n${flood.cells.size} c${flood.complete}`);
        // ★IIIII216 取证：x86 ShapeFloodFill.Perform+Chain(IsNotSolid,OnlyWalls,Output)
        //   字面对照器（同世界态双跑）——成败/n 差异即引擎实现差
        const q2: Array<[number, number]> = [[px, py - 1]];
        const hash2 = new Set<number>();
        let num2 = 1000;
        while (q2.length > 0 && num2 > 0) {
          const [qx2, qy2] = q2.shift()!;
          const k2 = qy2 * w + qx2;
          if (!hash2.has(k2)) {
            const i2 = st.idx(qx2, qy2);
            const act2 = st.flags[i2] !== 0;
            const notSolid = !act2 || !vanSolidOrSloped(st, qx2, qy2);
            if (notSolid && BACKFILL_WALLS.has(st.wall[i2])) {
              hash2.add(k2);
              num2--;
              if (qx2 + 1 < w - 1) q2.push([qx2 + 1, qy2]);
              if (qx2 - 1 >= 1) q2.push([qx2 - 1, qy2]);
              if (qy2 + 1 < h - 1) q2.push([qx2, qy2 + 1]);
              if (qy2 - 1 >= 1) q2.push([qx2, qy2 - 1]);
            }
          }
        }
        let comp2 = true;
        while (q2.length > 0) {
          const [rx2, ry2] = q2.shift()!;
          if (!hash2.has(ry2 * w + rx2)) { comp2 = false; break; }
        }
        const x86Ok = hash2.size > 50 && comp2;
        const jsOk = flood.cells.size > 50 && flood.complete;
        if (hash2.size !== flood.cells.size || comp2 !== flood.complete) {
          altStats.log.push(`DIFF@${attempts}: ${px},${py} x86 n${hash2.size}/c${comp2} vs js n${flood.cells.size}/c${flood.complete}`);
        } else if (x86Ok !== jsOk) {
          altStats.log.push(`GATEDIFF@${attempts}: ${px},${py} n${flood.cells.size}`);
        }
      }
      if (flood.cells.size > 50 && flood.complete) {
        // OuterOutline(origin=(x,y))（cs:31982）——★F5 相对坐标回放下移一行
        paintBackfillOutline(st, rng, flood.cells, wallId);
        if (altStats) altStats.log.push(`${attempts}: ${px},${py} w${wallId} n${flood.cells.size}`);
        budget--;
        if (altStats) altStats.s++;
      }
    }
    yield;                                               // PR-async：每 attempt 一个单元
  }
  seg177('IIII177 ALT-OUT');
  if (altStats) {
    console.log(`[IIIII216 ALT] attempts=${altStats.a} successes=${altStats.s} c15000=${altStats.c} ` +
      `floods=${altStats.floods} budgetLeft=${budget} samples=${JSON.stringify(altStats.log)}`);
  }
  seg177('IIII177 HM-OUT');
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

/** 读档自愈网（PR-async 收口②）：hardMode=true 而 hardModeConverted 缺 ⇒ 半成品
 *  转换态泄漏到存档（防御未来一切回归）——推 force 转换 job 重跑幂等映射收敛。 */
export function hardmodeRepairJob(world: World): { step(): boolean } {
  const it = startHardmodeStepsGen(world, !!world.flags.hardMode, false, true);
  let done = false;
  return {
    step(): boolean {
      if (done) return true;
      const r = it.next();
      if (r.done) { done = true; return true; }
      return false;
    },
  };
}

/** 组合步进流：conversion → (dualDungeons 首翻) Dungeon 档剥漆。
 *  includeDualClear=false = 既有 sync startHardmode 契约（Game 的 WOF 链显式调用
 *  onGameEventClearedForDualDungeons 的位置保持原序）。 */
function* startHardmodeStepsGen(world: World, wasHard: boolean,
  includeDualClear: boolean, force = false): Generator<void, void, void> {
  if (!wasHard || force) {
    yield* initializeHardModeGen(world, new RNG(world.seed));
    if (includeDualClear && world.seedFlags?.dualDungeons) {
      yield* clearUnbreakableWallsWithPaintUpToGen(world, DUAL_DUNGEON_WALL_TIERS.Dungeon);
    }
  }
  // ★转换完成标记（PR-async 收口②）：落盘随 flags 持久化——读档自愈网消费
  //  （hardMode=true 而本标记缺 ⇒ 半成品转换态,推 repair job 重跑幂等转换）
  (world.flags as Record<string, boolean>).hardModeConverted = true;
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
/** 事件 id → 剥漆档位（NPC.cs:79607-79650 switch 单源；0-5/7/9/10/12/20-23 原版
 *  空转或无 case → null=零行为）。 */
export function dualDungeonTierOf(gameEventId: number): number | null {
  switch (gameEventId) {
    case 11:
    case 13:
      return DUAL_DUNGEON_WALL_TIERS.EarlyGame;
    case 14:
      return DUAL_DUNGEON_WALL_TIERS.EvilBoss;
    case 8:
      return DUAL_DUNGEON_WALL_TIERS.JungleBoss;
    case 15:
    case 19:
      return DUAL_DUNGEON_WALL_TIERS.Dungeon;
    case 16:
    case 17:
    case 18:
    case 24:
      return DUAL_DUNGEON_WALL_TIERS.Hallow;
    default:
      return null;
  }
}

export function onGameEventClearedForDualDungeons(world: World, gameEventId: number): void {
  if (!world.seedFlags?.dualDungeons) return;
  const tier = dualDungeonTierOf(gameEventId);
  if (tier !== null) clearUnbreakableWallsWithPaintUpTo(world, tier);
}

/** ★PR-async 收口①：其余 boss 事件剥漆的 job 工厂——与肉山转换 job 同队列分步驱动。
 *  非双地牢/无档位事件 → null（原版空转零行为,调用方跳过入队）。 */
export function clearUnbreakableWallsJob(world: World, gameEventId: number): { step(): boolean } | null {
  if (!world.seedFlags?.dualDungeons) return null;
  const tier = dualDungeonTierOf(gameEventId);
  if (tier === null) return null;
  const it = clearUnbreakableWallsWithPaintUpToGen(world, tier);
  let done = false;
  return {
    step(): boolean {
      if (done) return true;
      const r = it.next();
      if (r.done) { done = true; return true; }
      return false;
    },
  };
}
