// 蜂巢(pass 45,HiveBiome.cs 1:1)+ 蜘蛛巢(1456 SpiderCaves L17455 / Spread.Spider L3653 1:1)
// + Webs 全局蛛网 pass(L13659)+ WebsInSpiderCavesAndHoney(L20140)。
// 蜂巢:主巢+隧道链(每巢各不相同)+蜂蜜斑(HoneyPatchBiome);剖面=核心40%蜂蜜/0.6墙86空腔/0.75实心蜂壳;
// 链终点幼虫托台(BOSS 房)。蜘蛛巢:countTiles 门(500≤空腔≤3499)采样 + 波前 BFS 刷墙62
// + 内饰(蛛网罐28/蛛网宝箱939/垂网165/覆饰187/小堆185);后续 pass 补 9/10 蛛网51+蜂巢钟乳石。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS, TILE_MOSS_SHEETS, CONV_STONE_SHEETS, ICES_SNOW_SHEETS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';
import { tileRunner } from './TileRunner';
import { genFrameNeighbors, genSquareTileFrame } from './FinalCleanupPass';
import { solidTile as solidTileHB, poundTile as poundTileHB } from './HalfBrickPass';
import { addProtectedStructure, canPlaceStructure } from './GenState';
import { flipGenSolid, genSolidType } from './GenSolid';
import { checkStalactite } from './ShimmerPass';   // SSSS：PlaceTight 尾部 CheckStalactite
import { noSpiderCavesActuallyNoSpiderCaves } from '../SeedEasterEggs';   // ★IIIII41-T3②

/** ★IIIII81：探针掷流计数器读数（_iii85win 挂 __swOnRoll/__swRollCount；无钩恒 0，
 *  生产路径零开销）——与 rig JJHook.RollCount 同语义，仅用于对拍流水。 */
const __swRc = (): number => (globalThis as { __swRollCount?: number }).__swRollCount ?? 0;

const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const HONEY = TILE_BY_KEY['v_229_honey_block']!;   // 蜂蜜斑 SetTile(229)（HoneyPatchBiome.cs:37/44）
const LARVA = TILE_BY_KEY['v_231_larva']!;
const COBWEB = TILE_BY_KEY['v_51_cobweb']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUDT = TILE_BY_KEY['mud']!;
const LIHARD = TILE_BY_KEY['v_226_lihzahrd_brick']!;

/** Modifiers.IsSolid（Modifiers.cs:551）= active && WorldGen.SolidOrSlopedTile
 *  （cs:70046：tileSolid && !tileSolidTop && !inActive）——**不含** halfBrick/slope==0
 *  门,斜面/半砖泥也算实心。与 SolidTile（solidTileHB）严格区分:蜂巢/蜂蜜斑的
 *  WorldUtils.Gen 扫描链全走本语义 */
function solidOrSloped(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i];
  const d = TILE_DEFS[t];
  return genSolidType(t) && !!d && !d.platform && (st.wire[i] & 32) === 0;
}

/** Shapes.Circle(r)（Shapes.cs:9）行主序枚举:半宽 = min(r, trunc(sqrt((r+1)²-dy²)))
 *  ——判据是 **(r+1)² 非 r²**（Circle(15) 用 256,比 dx²+dy²≤225 圆盘大一圈） */
function circleEach(r: number, fn: (dx: number, dy: number) => void): void {
  const rr = (r + 1) * (r + 1);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
    for (let dx = -half; dx <= half; dx++) fn(dx, dy);
  }
}

/** CreateHiveTunnel(HiveBiome.cs:135)1:1:基础半径 12-20,步数每迭代净 -2,
 *  三阈值各自独立 ±0.5% 抖动且基于基础半径;±10 格墙 87(神庙)/地表空墙 → 整条作废 */
function hiveTunnel(st: TileStore, rng: RNG, gs: GenState, sx: number, sy: number): [number, number] {
  // ★IIIII45（HiveBiome.cs CreateHiveTunnel：1458 cs 注记 246-254， drunken 内参批——
  //   IIIII14 排期⑤清偿）：drunk 域半径/步数重掷并按 (w/4200+1)/2 缩放：
  //     普通态 num=Next(12,21)=int(12,20) / num2=Next(10,21)=int(10,20)
  //     drunk 态   num=Next(8,26) =int(8,25)  / num2=Next(10,41)=int(10,40)
  //                num *= (w/4200+1)/2 ; num2 同乘（double 浮点）
  // ★★IIIII75 定罪主案（HiveBiome.cs:165-175）：普通态两初始化骰在 drunk/remix 域
  //   **恒掷后被覆写**——C# 先 `num=Next(12,21); num2=Next(10,21)` 再进分支，
  //   drunk 支再各补一掷覆盖（remix 支不重掷、只加 Next(3)）。旧 JS 按「域选一掷」
  //   实现每隧道少耗 2 骰 → 全部隧道阈值/游走全漂（#47 双向位移 A=18904 主根因）。
  const drunk = !!gs.seedFlags.drunkWorld;
  const remix = !!gs.seedFlags.remix;
  let baseR = rng.int(12, 20);              // Next(12,21)：普通值；drunk 弃用重掷
  let steps = rng.int(10, 20);              // Next(10,21)：同上
  if (drunk) {
    baseR = rng.int(8, 25);                 // Next(8,26)
    steps = rng.int(10, 40);                // Next(10,41)
    const scale = (st.w / 4200 + 1) / 2;
    baseR = baseR * scale;
    steps = steps * scale;
  } else if (remix) {
    baseR += rng.int(0, 2);                 // Next(3) 加算（HiveBiome.cs:178）
  }
  // ★IIIII75 取证钩（零开销，仅探针挂载时输出；与 rig hv_tp/hv_te 同字段）
  // （2026-08-30 并行编辑遗留 TDZ 修复：__tunMk 曾在首个调用点(:79)之后才声明——
  //   worker 在本段直接 ReferenceError，全链开新世界的探针一齐被堵；仅上提声明，
  //   钩点次序与语义不变）
  const __tunLog = (globalThis as { __swHvLog?: (s: string) => void }).__swHvLog;
  const __tunMk = (globalThis as { __swMark?: (s: string) => void }).__swMark;
  __tunMk?.(`HV_TPM i=${sx} j=${sy} r=${baseR} s=${steps} rc=${__swRc()}`);   // ★IIIII81：与 rig HV_TP 同位（速度骰之前）
  let vx = rng.int(-10, 10) * 0.2, vy = rng.int(-10, 10) * 0.2;
  let px = sx + 0.0, py = sy + 0.0;
  let tunIters = 0;
  __tunLog?.(`TUNP ${sx},${sy} r=${baseR} s=${steps} vX=${vx} vY=${vy}`);
  __tunMk?.(`HV_TVEL v=${vx},${vy} rc=${__swRc()}`);   // ★IIIII81：镜像 rig HV_TV（速度对之后的计数锚）
  while (steps > 0) {
    tunIters++;
    if (py > st.h - 250) steps = 0;
    const r = baseR * (1 + rng.int(-20, 19) * 0.01);
    let next2 = steps - 1;   // 本迭代后的剩余(可能被截断保护清零)
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(st.w - 1, Math.floor(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(st.h - 1, Math.floor(py + r));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        // InWorld(k,l,50)：k>=50 && l>=50 && k<maxX-50 && l<maxY-50（上界**含**，
        //   x==w-50 即越界截断——曾写 `> st.w-50` 漏掉等号 → 边缘巢多跑整轮迭代）
        if (x < 50 || y < 50 || x >= st.w - 50 || y >= st.h - 50) { next2 = 0; }
        else {
          // ±10 格神庙墙(87)→ 截断
          if ((st.inBounds(x - 10, y) && st.wall[st.idx(x - 10, y)] === 87)
            || (st.inBounds(x + 10, y) && st.wall[st.idx(x + 10, y)] === 87)
            || (st.inBounds(x, y - 10) && st.wall[st.idx(x, y - 10)] === 87)
            || (st.inBounds(x, y + 10) && st.wall[st.idx(x, y + 10)] === 87)) next2 = 0;
          // 地表以上且上方 5 格无墙 → 截断(防穿透地表)
          if (y < gs.worldSurface && st.inBounds(x, y - 5) && st.wall[st.idx(x, y - 5)] === 0) next2 = 0;
        }
        const i = st.idx(x, y);
        const d = Math.hypot(x - px, y - py);
        if (d < baseR * 0.4 * (1 + rng.int(-10, 10) * 0.005)) {
          // cs:251-263:honey(true) 恒置（液量仅 1/3 掷 255；★IIIII45 drunk 态在
          //   Next(3) 之后无条件 liquid=255——掷序不变、覆盖率翻倍）；active(false)
          //   保留幽灵 type；halfBrick(false)+slope(0) 一并复位
          if (rng.int(0, 2) === 0) st.liquid[i] = 255;
          if (drunk) st.liquid[i] = 255;
          st.liquidType[i] = 3;
          st.wall[i] = 86;
          st.flags[i] = 0;
          st.half[i] = 0;
          st.slope[i] = 0;
        } else if (d < baseR * 0.75 * (1 + rng.int(-10, 10) * 0.005)) {
          st.liquid[i] = 0;
          // cs:267-274 原文双门：wall∉{86,244} 才铺 225（活木墙 244 上不铺）；
          //   ★cs:271-272 铺蜂壳时 active(true)+halfBrick(false)+slope(0)+type=225
          //   四连写——曾只写 type+active → 斜面泥/苔(60/368)上铺蜂壳残留旧坡
          //   (#47 起 3 格 slope 债 → #53 SmoothWorld 雪崩独立点火源)
          if (st.wall[i] !== 86 && st.wall[i] !== 244) {
            st.flags[i] = 1;
            st.half[i] = 0;
            st.slope[i] = 0;
            st.type[i] = HIVE;
          }
        }
        if (d < baseR * 0.6 * (1 + rng.int(-10, 10) * 0.005)) {
          st.wall[i] = 86;
          // ★IIIII45（HiveBiome.cs createHiveTunnel 尾支）：drunk 世界墙带内
          //   Next(2)==0 再灌满蜜——骰仅 wall 带内消耗（普通世界整支短路零掷）
          if (drunk && rng.int(0, 1) === 0) { st.liquid[i] = 255; st.liquidType[i] = 3; }
        }
      }
    }
    __tunMk?.(`HV_TTE x=${px} y=${py} sl=${next2} rc=${__swRc()}`);
    px += vx; py += vy;
    steps = next2 - 1;   // 原版:num2 = num3 - 1(每迭代净 -2)
    vy += rng.int(-10, 10) * 0.05;
    vx += rng.int(-10, 10) * 0.05;
  }
  __tunLog?.(`TUNE ${sx},${sy} it=${tunIters} x=${px} y=${py}`);
  { const f2 = (globalThis as { __swHvLog?: (s: string, n?: number) => void }).__swHvLog; if (f2 && Math.abs(px - sx) + Math.abs(py - sy) > 50) f2(`BIGWALK ${sx},${sy} -> ${Math.floor(px)},${Math.floor(py)} d=${(px - sx).toFixed(1)},${(py - sy).toFixed(1)}`); }
  return [px, py];
}

/** 蜂蜜坠落块(HiveBiome.cs:206/214):4×4 蜂壳封 2×2 蜜 + 向外砸出凹槽。
 *  蜜核 active(false)+liquid 255+honey——**幽灵 type 保留**（cs:353 无 type 清写,
 *  曾清 0 → 727 格 typ 残差） */
function blockedHoneyCube(st: TileStore, x: number, y: number): void {
  for (let ix = x - 1; ix <= x + 2; ix++) {
    for (let iy = y - 1; iy <= y + 2; iy++) {
      if (!st.inBounds(ix, iy)) continue;
      const i = st.idx(ix, iy);
      if (ix >= x && ix <= x + 1 && iy >= y && iy <= y + 1) {
        st.flags[i] = 0;
        st.liquid[i] = 255; st.liquidType[i] = 3;
      } else {
        st.type[i] = HIVE; st.flags[i] = 1;
      }
    }
  }
}

function dentForHoneyFall(st: TileStore, x: number, y: number, dirIn: number): void {
  const dir = -dirIn;
  y++;
  let num = 0;
  let cx = x;
  while ((num < 4 || solidTileHB(st, cx, y)) && cx > 10 && cx < st.w - 10) {
    num++;
    cx += dir;
    if (solidTileHB(st, cx, y)) {
      // WorldGen.PoundTile（HiveBiome.cs:338）：半砖 toggle（非清除）——
      // 砸后该格不再是 SolidTile，循环随即退出，与原版控制流一致
      poundTileHB(st, cx, y);
      if (!st.flags[st.idx(cx, y + 1)]) {
        st.type[st.idx(cx, y + 1)] = HIVE;
        st.flags[st.idx(cx, y + 1)] = 1;
      }
    }
  }
}

/** 蜂蜜斑微群系(HoneyPatchBiome.cs:8-48)1:1。
 *  锚点:origin 实心 → 拒;向下 ≤80 找首个实心再 +2。门禁:圆 15 实心中丛林土/草
 *  (59/60)占比 ≥75% 且草(60)≥2 → 圆 8 实心 ≥20 → 保护图 16×16 → 近地狱/
 *  ±150 步进 10 有神庙砖 226 或墙 83/3/87 → 拒。
 *  塑形:圆 8 RadialDither(0,10) 蜂壳 229;圆(4,3) Blotches 挖蜜池(矩形掩码
 *  [-6,6]×[0,3] 记 ShapeData + 灌蜜);内轮廓(origin+1,掩码 [1,3])补泥 59;
 *  All(data) 外扩 1 圈、y≥锚行、非实心无蜜 → 蜂壳 229。
 *  RNG:RadialDither 每点 1 掷(Shapes.Circle 行主序自上而下)、Blotches 每点
 *  2 掷(+命中补 4 掷)——与原版逐点对齐。 */
function placeHoneyPatch(
  st: TileStore, rng: RNG, gs: GenState,
  ox: number, oy: number,
): boolean {
  const mkP = (globalThis as { __swMark?: (s: string) => void }).__swMark;
  { const dg = (globalThis as { __swPatchDiag?: (ox: number, oy: number, st: TileStore) => void }).__swPatchDiag; if (dg) dg(ox, oy, st); }
  // HoneyPatchBiome.cs:10-13
  if (st.inBounds(ox, oy) && st.flags[st.idx(ox, oy)] && solidTileHB(st, ox, oy)) { mkP?.('PREJ anchor'); mkP?.('HP_R1'); return false; }
  // cs:14-18:Searches.Down(80)+Conditions.IsSolid（Conditions.cs:84：InWorld(,10)+
  //   active+tileSolid——**无** solidTop/inActive/形状门,与 Modifiers.IsSolid 又不同）
  let ry = -1;
  const condSolid = (px: number, py: number): boolean => {
    if (px < 10 || py < 10 || px >= st.w - 10 || py >= st.h - 10) return false;
    const pi = st.idx(px, py);
    return !!st.flags[pi] && genSolidType(st.type[pi]);
  };
  for (let k = 0; k < 80 && oy + k < st.h; k++) {
    if (condSolid(ox, oy + k)) { ry = oy + k; break; }
  }
  if (ry < 0) { mkP?.('PREJ down'); mkP?.('HP_R2'); return false; }
  ry += 2;
  const rx = ox;
  // ★IIIII81 阶段写集对拍（SW_HVWS=1 时启用；与 rig WSDump 盒±14/编码同构——
  //   inactive 编码=(sheet<<1)|1，active=sheet。无 env 零开销）
  // （2026-08-30 浏览器侧解堵：worker 无 Node global，裸 process 在网页构建直接
  //   ReferenceError——typeof 卫门保持"无 env 零开销"本意，Node 工具链下读值不变）
  const wsOn = typeof process !== 'undefined' && process.env?.SW_HVWS === '1';
  const wsT = new Int32Array(29 * 29);
  const wsA = new Uint8Array(29 * 29);
  const shOf = (t: number): number => { const v = TILE_DEFS[t]?.vanilla?.sheet; return typeof v === 'number' ? v : 9999; };
  const wsV = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] & 1 ? shOf(st.type[i]) : ((shOf(st.type[i]) << 1) | 1);
  };
  const wsDump = (tag: string): void => {
    if (!wsOn) return;
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -14; dx <= 14; dx++) {
        const qx = rx + dx, qy = ry + dy;
        const k = (dx + 14) * 29 + (dy + 14);
        const nv = wsV(qx, qy);
        const na = st.inBounds(qx, qy) && (st.flags[st.idx(qx, qy)] & 1) ? 1 : 0;
        const ov = wsT[k], oa = wsA[k];
        if (ov !== nv || oa !== na) mkP?.(`${tag}C ${qx},${qy} t=${ov}/${nv} a=${oa}/${na}`);
        wsT[k] = nv; wsA[k] = na;
      }
    }
  };
  if (wsOn) {
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -14; dx <= 14; dx++) {
        const k = (dx + 14) * 29 + (dy + 14);
        wsT[k] = wsV(rx + dx, ry + dy);
        wsA[k] = st.inBounds(rx + dx, ry + dy) && (st.flags[st.idx(rx + dx, ry + dy)] & 1) ? 1 : 0;
      }
    }
  }
  // cs:22-26:圆 15 三计数门(Scanner 链:实心 / 60∪59 / 60)
  const circleRows = (hR: number, vR: number, fn: (dx: number, dy: number) => void): void => {
    const rr = (hR + 1) * (hR + 1);
    for (let dy = -vR; dy <= vR; dy++) {
      const num2 = (hR / vR) * dy;
      const half = Math.min(hR, Math.trunc(Math.sqrt(rr - num2 * num2)));
      for (let dx = -half; dx <= half; dx++) fn(dx, dy);
    }
  };
  let solid = 0, mudOrGrass = 0, grass = 0;
  circleRows(15, 15, (dx, dy) => {
    if (!st.inBounds(rx + dx, ry + dy)) return;
    const i = st.idx(rx + dx, ry + dy);
    if (!solidOrSloped(st, rx + dx, ry + dy)) return;   // Modifiers.IsSolid
    solid++;
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (sheet === 60 || sheet === 59) mudOrGrass++;
    if (sheet === 60) grass++;
  });
  if (solid === 0 || mudOrGrass / solid < 0.75 || grass < 2) { mkP?.(`PREJ soil s=${solid} mg=${mudOrGrass} g=${grass}`); mkP?.(`HP_R3 s=${solid} mg=${mudOrGrass} g=${grass}`); return false; }
  mkP?.(`HP_G s=${solid} mg=${mudOrGrass} g=${grass}`);
  // cs:28-32:圆 8 实心 ≥20
  let solid8 = 0;
  circleRows(8, 8, (dx, dy) => {
    if (solidOrSloped(st, rx + dx, ry + dy)) solid8++;
  });
  if (solid8 < 20) { mkP?.(`PREJ solid8=${solid8}`); mkP?.(`HP_R4 s8=${solid8}`); return false; }
  // cs:33-36:保护图 CanPlace(16×16)——全局 StructureMap（GenState.protectedRects）,
  // 与蜂巢主巢/神龛/微光/地下小屋等全部已保护结构互斥 + GeneralPlacementTiles
  // 内容扫描（单参 CanPlace 默认黑名单——蜂巢块 225/神庙砖 226 等活性格拒放）
  const rect = { x0: rx - 8, y0: ry - 8, x1: rx + 8, y1: ry + 8 };
  if (!canPlaceStructure(gs, rect, 0, st)) { mkP?.('PREJ canplace'); mkP?.('HP_R5'); return false; }
  // cs:37-40 + TooCloseToImportantLocations(cs:50-81)
  // cs:50-52 TooCloseToImportantLocations 首门:y >= Main.UnderworldLayer-30。
  //   ★UnderworldLayer = **maxTilesY-200 恒值属性**（Main.cs:2863）,非 GenVars.
  //   lavaLine（Terrain 游走产物,更深）——曾误用 gs.lavaLine 把 (4126,924:ry=943
  //   <1000-230=770?非——943≥lavaLine-30) 的合法斑误拒
  if (ry >= st.h - 200 - 30) { mkP?.('PREJ lava'); mkP?.('HP_R6'); return false; }
  for (let i = rx - 150; i < rx + 150; i += 10) {
    if (i <= 0 || i > st.w - 1) continue;
    for (let j = ry - 150; j < ry + 150; j += 10) {
      if (j <= 0 || j > st.h - 1) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && st.type[ii] === LIHARD) { mkP?.(`PREJ tooclose226 ${i},${j}`); mkP?.('HP_R6'); return false; }
      if (st.wall[ii] === 83 || st.wall[ii] === 3 || st.wall[ii] === 87) { mkP?.(`PREJ toocloseW${st.wall[ii]} ${i},${j}`); mkP?.('HP_R6'); return false; }
    }
  }
  // cs:41:圆 8 + RadialDither(0,10) + IsSolid → SetTile(229)
  const __rect = (() => { if (typeof process === 'undefined') return null; const wv = process.env?.SW_HVRECT; if (!wv) return null; const pr = wv.split(',').map(Number); return pr.length === 4 ? pr : null; })();
  circleRows(8, 8, (dx, dy) => {
    const num2 = Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) / 10));
    const _hitVal = rng.next();
    const _hitBool = _hitVal > num2;
    const _solid = solidOrSloped(st, rx + dx, ry + dy);
    if (__rect && rx + dx >= __rect[0] && ry + dy >= __rect[1] && rx + dx <= __rect[2] && ry + dy <= __rect[3]) {
      const pi = st.inBounds(rx + dx, ry + dy) ? st.idx(rx + dx, ry + dy) : -1;
      mkP?.(`RD ${rx + dx},${ry + dy} hit=${_hitBool ? 1 : 0} act=${pi >= 0 && (st.flags[pi] & 1) ? 1 : 0} ty=${pi >= 0 ? shOf(st.type[pi]) : -1} rc=${__swRc()}`);
    }
    if (_hitBool && _solid) {
      const i = st.idx(rx + dx, ry + dy);
      // Actions.SetTile(229) clearTile=true：先 Clear(~Wire|Actuator)——墙/液体/
      //   slope/half/帧全清,再写 type+active（vanilla 墙被清 0,曾保留 → W64/W15 残差）
      st.type[i] = HONEY; st.flags[i] = 1;
      st.wall[i] = 0;
      st.liquid[i] = 0; st.liquidType[i] = 0;
      st.slope[i] = 0; st.half[i] = 0;
      // setSelfFrames+setNeighborFrames 默认真（Actions.cs:228）：TileFrame 中心+四邻
      //   ——邻格 frameImportant 的 Check* 击杀级联入口
      genFrameNeighbors(st, rng, rx + dx, ry + dy, 'setTile');
    }
  });
  wsDump('HP_S1');
  mkP?.(`HP_S1 rc=${__swRc()}`);
  // cs:43:圆(4,3) + Blotches(scale2,chance0.3) + IsSolid + ClearTile
  //   + RectangleMask(-6,6,0,3).Output(data) + SetLiquid(2=蜂蜜)
  const key = (qx: number, qy: number) => (qx + 16) * 64 + (qy + 16);
  const data = new Set<number>();
  circleRows(4, 3, (dx, dy) => {
    rng.next();   // Blotches 首掷丢弃
    const pts: Array<[number, number]> = [];
    if (rng.next() < 0.3) {
      const bx0 = rng.int(-1, 0), bx1 = rng.int(0, 1);
      const by0 = rng.int(-1, 0), by1 = rng.int(0, 1);
      for (let bi = bx0; bi <= bx1; bi++) for (let bj = by0; bj <= by1; bj++) pts.push([dx + bi, dy + bj]);
    } else {
      pts.push([dx, dy]);
    }
    for (const [qx, qy] of pts) {
      if (!solidOrSloped(st, rx + qx, ry + qy)) continue;
      const i = st.idx(rx + qx, ry + qy);
      st.flags[i] = 0;   // ClearTile（Tile.ClearTile：active/halfBrick/slope 复位,幽灵 type 留）
      st.slope[i] = 0; st.half[i] = 0;
      // ClearTile(frameNeighbors:true)（WorldUtils.cs:58-63）：四邻 TileFrame
      //   ——★12345 链 #47 祭坛债主根因：挖蜜池清掉 (429-431,661) 蜂壳支撑列时
      //   邻帧打到坛底 (430,660) → Check3x2(26) 支撑失守 → KillTile×6 整坛坍塌
      //   （active=false+type=0,水体保留——KillTile cs:63935）
      genFrameNeighbors(st, rng, rx + qx, ry + qy, 'clearTile');
      if (qx >= -6 && qx <= 6 && qy >= 0 && qy <= 3) {
        data.add(key(qx, qy));
        st.liquid[i] = 255; st.liquidType[i] = 3;   // 蜂蜜
      }
    }
  });
  wsDump('HP_S2');
  mkP?.(`HP_S2 rc=${__swRc()}`);
  // cs:44:InnerOutline(data)@origin+(0,1) + IsEmpty + RectangleMask(-6,6,1,3) → 泥 59
  const NEIGH8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const k of data) {
    const qx = Math.trunc(k / 64) - 16, qy = (k % 64) - 16;
    let edge = false;
    for (const [nx, ny] of NEIGH8) {
      if (!data.has(key(qx + nx, qy + ny))) { edge = true; break; }
    }
    if (!edge) continue;
    const px = rx + qx, py = ry + 1 + qy;
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    if (st.flags[i]) continue;                          // IsEmpty
    if (qx < -6 || qx > 6 || qy < 1 || qy > 3) continue;   // RectangleMask
    st.type[i] = MUDT; st.flags[i] = 1;   // SetTile(59) clearTile=true
    st.wall[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    genFrameNeighbors(st, rng, px, py, 'setTile');
  }
  wsDump('HP_S3');
  mkP?.(`HP_S3 rc=${__swRc()}`);
  // cs:45:All(data)@origin + Expand(1) + IsBelowHeight(ry,inclusive) + IsNotSolid
  //   + NoLiquid(蜂蜜) → 蜂壳 229
  for (const k of data) {
    const qx = Math.trunc(k / 64) - 16, qy = (k % 64) - 16;
    for (let ex = -1; ex <= 1; ex++) {
      for (let ey = -1; ey <= 1; ey++) {
        const px = rx + qx + ex, py = ry + qy + ey;
        if (!st.inBounds(px, py) || py < ry) continue;   // IsBelowHeight(含锚行)
        const i = st.idx(px, py);
        if (solidOrSloped(st, px, py)) continue;   // IsNotSolid（= !Modifiers.IsSolid）
        if (st.liquid[i] > 0 && st.liquidType[i] === 3) continue;    // NoLiquid(蜂蜜)
        st.type[i] = HONEY; st.flags[i] = 1;   // SetTile(229) clearTile=true
        st.wall[i] = 0;
        st.liquid[i] = 0; st.liquidType[i] = 0;
        st.slope[i] = 0; st.half[i] = 0;
        genFrameNeighbors(st, rng, px, py, 'setTile');
      }
    }
  }
  wsDump('HP_S4');
  mkP?.(`HP_S4 rc=${__swRc()}`);
  addProtectedStructure(gs, rect, 0);   // cs:46（pad 默认 0）
  mkP?.('HP_E');
  return true;
}

/** Hives(pass 45,HiveBiome.Place):隧道链每段从段起点扇形展开,段终点接续 */
export function runBeehivePass(st: TileStore, rng: RNG, gs: GenState): void {
  const __cap = (globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void }).__swWallCap;
  if (__cap) __cap('beehive', gs, st);
  // 段结构探针（与 vanilla HVQProbe 对拍：PLACE/PLACEX/TUN/FOUT/FOUTX/STAND/PATCH/PATCHX）
  const mk = (globalThis as { __swMark?: (s: string) => void }).__swMark;
  const hvStat = (globalThis as { __swHvStat?: (k: string, v?: number) => number }).__swHvStat;
  const hvN = (k: string, v = 1) => { if (hvStat) hvStat(k, v); };
  const s = st.w / 4200;
  // ★IIIII14（cs:16024-16026）：drunk 蜂巢预算 ×0.667（浮点乘不取整——while 循环
  //   `num2 > 0` 比较，vanilla num2 即 double）
  const countRaw = (1 + rng.int(Math.floor(5 * s), Math.max(Math.floor(5 * s) + 1, Math.floor(8 * s)) - 1));
  const count = gs.seedFlags.drunkWorld ? countRaw * 0.667 : countRaw;
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  // 结构互斥走全局 StructureMap（GenState.protectedRects,canPlaceStructure/
  //   addProtectedStructure）——主巢 ±50（CanPlace 无 pad / AddProtectedStructure pad5,
  //   HiveBiome.cs:37/124）与蜂蜜斑 16×16（pad0,HoneyPatchBiome.cs:33/46）原为
  //   本 pass 局部 protectedRects 近似,提升后跨结构互斥（神龛/微光/地下小屋等）生效。
  let placed = 0;
  // 原版驱动(WorldGen.cs:16011-16015):外层预算 num3=10000 **固定**(与巢数无关;
  // 曾 count*100 = 巢少时预算骤减)
  let budget10000 = 10000;
  while (placed < count && budget10000 > 0) {
    budget10000--;
    // 原版 RandomWorldPoint((ws+rl)>>1, 20, 300, 20)（WorldGen.cs:16028，cs:27255
    // 参数序 top,right,bottom,left）：X∈[20,w-21]，Y∈[(ws+rl)/2, h-300]。
    // 此前 right=20/bottom=300 安反轴——横向两侧各砍 300 格（丛林边缘蜂巢绝迹）、
    // 纵向放到 h-21 贴地狱
    const x = rng.int(20, st.w - 21);
    const y = rng.int(yMin, st.h - 301);
    // ★IIIII14（cs:16041-16044）：drunk 每次尝试额外照掷照弃 RandomWorldPoint
    //   ((int)worldSurface,20,300,20)——RandomWorldPoint=固定 2 骰 Next(left,w-right)+
    //   Next(top,h-bottom)（cs:27379-27382），返回值弃用（流位关键，勿省）。
    if (gs.seedFlags.drunkWorld) {
      rng.int(20, st.w - 21);
      rng.int(Math.trunc(gs.worldSurface), st.h - 301);
    }
    { const f2 = (globalThis as { __swHvLog?: (s: string) => void }).__swHvLog; if (f2) f2(`HIVE ${x},${y}`); }
    mk?.(`HV_PNT ${x},${y}`);
    mk?.(`PLACE ${x},${y}`);
    { const dg = (globalThis as { __swHvDiag?: (x: number, y: number, st: TileStore, gs: GenState) => void }).__swHvDiag; if (dg) dg(x, y, st, gs); }
    // ★原版 HiveBiome.Place **无锚点 active 门**（Place 首门=CanPlace 矩形,随后
    //   TooClose/圆15扫描——锚点自身失活不阻断,圆内泥草达标即可过）。曾加
    //   `!flags` 前置跳过 → js 拒了 vanilla 接受的候选(3698,890:锚=失活泥,
    //   圆内 97% 泥/74 草) → hive#3 选址全漂(#47 t#13 段源悖论真身)
    if (!st.inBounds(x, y)) { mk?.('PLACEX'); continue; }
    // ★HiveBiome.Place 前置门(HiveBiome.cs:37-45,此前缺失——主巢可叠既有蜂巢/
    // 蜂蜜斑、可贴丛林神庙生成):
    // (a) structures.CanPlace(±50 矩形,pad 0)——对既有保护区(前巢/斑/神龛/微光等)的交叠自查
    //     + GeneralPlacementTiles 内容扫描（StructureMap.cs:21 单参重载默认表——
    //     矩形内活性蜂巢块 225/神庙砖 226/蘑菇草 70 等 28 id 即拒。曾缺失 →
    //     蜂巢候选可落在既有蜂巢块上,#47 hive#3 选址分歧的主嫌疑）
    if (!canPlaceStructure(gs, { x0: x - 50, y0: y - 50, x1: x + 50, y1: y + 50 }, 0, st)) { mk?.('HV_R1'); mk?.('PLACEX'); continue; }
    // (b) TooCloseToImportantLocations(:295-321:±150 步进 10,活性蜥蜴砖 226
    //     或墙 83/3/87 → 弃;神庙 pass 先于蜂巢,此门在原版是活的)
    let tooClose = false;
    for (let ti = x - 150; ti < x + 150 && !tooClose; ti += 10) {
      if (ti <= 0 || ti > st.w - 1) continue;
      for (let tj = y - 150; tj < y + 150; tj += 10) {
        if (tj <= 0 || tj > st.h - 1) continue;
        const tii = st.idx(ti, tj);
        if ((st.flags[tii] && st.type[tii] === LIHARD) || st.wall[tii] === 83 || st.wall[tii] === 3 || st.wall[tii] === 87) {
          tooClose = true; break;
        }
      }
    }
    if (tooClose) { hvN('rej_tooclose'); mk?.('HV_R2'); mk?.('PLACEX'); continue; }
    // 原版验证(HiveBiome.cs:48-52):Circle(15)（(15+1)² 判据行主序）内 IsSolid
    //   (=SolidOrSlopedTile,斜面/半砖泥也算)中 60/59 占比 ≥75% 且 60 ≥2。
    //   曾用 dx²+dy²≤225 圆盘+SolidTile 语义 → 圆小一圈+斜面泥漏计,边缘候选
    //   (4142,861: 0.729<0.75)被误拒而原版接受
    let solid = 0, mudOrGrass = 0, grass = 0;
    circleEach(15, (dx, dy) => {
      if (!st.inBounds(x + dx, y + dy)) return;
      const i = st.idx(x + dx, y + dy);
      if (!solidOrSloped(st, x + dx, y + dy)) return;
      solid++;
      if (st.type[i] === JUNGLE_GRASS || st.type[i] === MUDT) mudOrGrass++;
      if (st.type[i] === JUNGLE_GRASS) grass++;
    });
    if (solid === 0 || mudOrGrass / solid < 0.75 || grass < 2) { hvN('rej_soil'); mk?.(`HV_R3 s=${solid} mg=${mudOrGrass} g=${grass}`); mk?.('PLACEX'); continue; }
    mk?.(`HV_G s=${solid} mg=${mudOrGrass} g=${grass} rc=${__swRc()}`);
    // 隧道链:2-4 段;每段 2-4 条全部从段起点出发,段位置=最后一条终点
    // ★IIIII45（HiveBiome.cs Place：1458 注记 cs 153-156）：drunk 隧道段数
    //   num2 += Next(7,10)=int(7,9)（普通世界整支短路零掷）
    // ★★★IIIII95（HiveBiome.cs:57-65，1456/1457/1458 三代同文）：remix 臂
    //   num2 += Next(2,5)=int(2,4)——与 CreateHiveTunnel 的 remix 加算(:176-179,
    //   已落)同批三态实现,此前仅 drunk 臂移植 → REMIX 每个成型蜂巢少耗 1 骰、
    //   段数恒少一掷域,全 pass 掷流自第一巢起错位(#47 Hives 大域主根因,#48 起级联)。
    let px = x + 0.0, py = y + 0.0;
    const segEnds: Array<[number, number]> = [];
    const segBase = rng.int(2, 4);
    mk?.(`HV_S0 ${segBase}`);   // ★IIIII81：镜像 rig HV S0（bonus 前基值,流位取证用）
    const segs = segBase + (gs.seedFlags.drunkWorld ? rng.int(7, 9)
      : (gs.seedFlags.remix && (globalThis as { __swSpNoFixArms?: boolean }).__swSpNoFixArms !== true)
        ? rng.int(2, 4) : 0);
    for (let seg = 0; seg < segs; seg++) {
      const tunnels = rng.int(2, 4);
      let ex = px, ey = py;
      for (let t = 0; t < tunnels; t++) {
        hvN('tunnel');
      { const f2 = (globalThis as { __swHvLog?: (s: string, n?: number) => void }).__swHvLog; if (f2) f2(`TUN ${Math.floor(px)},${Math.floor(py)}`, undefined); }
      mk?.(`TUN ${Math.floor(px)},${Math.floor(py)}`);
      [ex, ey] = hiveTunnel(st, rng, gs, Math.floor(px), Math.floor(py));
      }
      px = ex; py = ey;
      segEnds.push([Math.floor(px), Math.floor(py)]);
      mk?.(`HV_SEGEND ${px},${py}`);   // ★IIIII81：镜像 rig HV SEGEND（R 格式段落终点）
    }
    // ★FrameOutAllHiveContents(HiveBiome.cs:128-146):±50 盒(钳 [10,max-10)) 行主序
    //   扫描——wall==86 的每格 SquareWallFrame(i,j)(九邻仅中心 resetFrame=true 耗
    //   1×Next(0,3);86 非大帧墙恒掷)。active-225 的 SquareTileFrame 零掷(225 帧
    //   确定性,frameX/Y 不入 dump)只跳过。曾整段缺失 → 每巢少数千掷 → 后续巢
    //   选址全漂(#47 自债 wal17.7k 的主根因)
    mk?.(`FOUT ${x},${y}`);
    {
      const fx0 = Math.max(10, x - 50), fx1 = Math.min(st.w - 10, x + 50);
      const fy0 = Math.max(10, y - 50), fy1 = Math.min(st.h - 10, y + 50);
      for (let ix = fx0; ix < fx1; ix++) {
        for (let iy = fy0; iy < fy1; iy++) {
          const ii = st.idx(ix, iy);
          // HiveBiome.cs:137-139：active-225 → SquareTileFrame 九宫（tile 侧）——225
          //   自身实心非 frameImportant 恒 no-op,但邻格 frameImportant 族可被击杀
          //   （同 honey patch 邻帧级联,PPPP 补齐）
          if (st.flags[ii] && st.type[ii] === HIVE) genSquareTileFrame(st, rng, ix, iy);
          if (st.wall[ii] === 86) rng.nextInt(3);   // SquareWallFrame 中心格
        }
      }
    }
    mk?.('FOUTX');
    // 蜂蜜坠落块:每个段终点 2×2 实心处放封蜜块+凹槽
    for (let hk = 0; hk < segEnds.length; hk++) {
      const [ex, ey] = segEnds[hk];
      const dir = rng.int(0, 1) === 0 ? -1 : 1;
      let hx = ex, guard = 0, flagged = false;
      while (guard++ < 60 && Math.abs(hx - ex) <= 50
        && !(st.flags[st.idx(hx, ey)] && st.flags[st.idx(hx, ey + 1)]
          && st.flags[st.idx(hx + 1, ey)] && st.flags[st.idx(hx + 1, ey + 1)])) {
        hx += dir;
        if (Math.abs(hx - ex) > 50) { flagged = true; break; }
      }
      flagged = flagged || Math.abs(hx - ex) > 50;
      mk?.(`HV_HF k=${hk} d=${dir} flag=${flagged} end=${hx},${ey}`);
      if (flagged) continue;
      const x2 = hx + dir;
      // SpotActuallyNotInHive:4×4 内有非蜂巢实心则跳过
      let notInHive = false;
      for (let ix = x2 - 1; ix <= x2 + 2; ix++) {
        for (let iy = ey - 1; iy <= ey + 2; iy++) {
          if (ix < 10 || ix > st.w - 10) { notInHive = true; break; }
          if (st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] !== HIVE) { notInHive = true; break; }
        }
        if (notInHive) break;
      }
      if (!notInHive) {
        blockedHoneyCube(st, x2, ey);
        dentForHoneyFall(st, x2, ey, dir);
      } else { mk?.('HV_HFSKIP'); }
    }
    // 幼虫托台(BOSS 房):CreateStandForLarva(HiveBiome.cs:394)——登记 Clamp(5,max-5)
    //   坐标 + **立即**物理搭台（3 列×4 行：上 3 行清空(幽灵保留)、底行铺 225）。
    //   曾把搭台也推迟到 BeeLarva pass（cs:21018）——原版该 pass 会重建同款托台
    //   （幂等兜底）,但 pass 47 现场缺台 = 本 pass 后续蜂蜜斑圆扫描/后续巢选址门
    //   读到错状态。幼虫 tile 231 仍由 BeeLarva pass 放置
    mk?.(`STAND ${Math.floor(px)},${Math.floor(py)}`);
    mk?.(`HV_LA ${px},${py}`);
    const lx = Math.floor(px), ly = Math.floor(py);
    gs.larvaX.push(Math.max(5, Math.min(st.w - 5, lx)));
    gs.larvaY.push(Math.max(5, Math.min(st.h - 5, ly)));
    for (let ix = lx - 1; ix <= lx + 1 && ix > 0 && ix < st.w; ix++) {
      for (let iy = ly - 2; iy <= ly + 1 && iy > 0 && iy < st.h; iy++) {
        if (!st.inBounds(ix, iy)) continue;
        const ii = st.idx(ix, iy);
        if (iy !== ly + 1) {
          st.flags[ii] = 0;   // active(false)——type 保留幽灵
        } else {
          st.type[ii] = HIVE; st.flags[ii] = 1; st.slope[ii] = 0; st.half[ii] = 0;
        }
      }
    }
    // ★IIIII45（HiveBiome.cs Place：1458 注记 cs 108-119）：drunk 追加幼虫台——
    //   从主台位起每尝试两掷 Next(-51,51)=int(-50,50)×2（X/Y 偏移），首格命中
    //   「InWorld ∧ 距主台>10 ∧ 失活 ∧ wall==86」即搭第二座并 break；预算 1000 次。
    //   普通世界整支短路零掷。搭台几何与主台同构 CreateStandForLarva。
    if (gs.seedFlags.drunkWorld) {
      for (let l = 0; l < 1000; l++) {
        const qx = px + rng.int(-50, 50);
        const qy = py + rng.int(-50, 50);
        if (!st.inBounds(Math.floor(qx), Math.floor(qy))) continue;
        const qxi = Math.floor(qx), qyi = Math.floor(qy);
        const qi = st.idx(qxi, qyi);
        if (Math.hypot(qx - px, qy - py) > 10 && !st.flags[qi] && st.wall[qi] === 86) {
          mk?.(`HV_L2 l=${l}`);
          gs.larvaX.push(Math.max(5, Math.min(st.w - 5, qxi)));
          gs.larvaY.push(Math.max(5, Math.min(st.h - 5, qyi)));
          for (let ix = qxi - 1; ix <= qxi + 1 && ix > 0 && ix < st.w; ix++) {
            for (let iy = qyi - 2; iy <= qyi + 1 && iy > 0 && iy < st.h; iy++) {
              if (!st.inBounds(ix, iy)) continue;
              const ii = st.idx(ix, iy);
              if (iy !== qyi + 1) st.flags[ii] = 0;
              else { st.type[ii] = HIVE; st.flags[ii] = 1; st.slope[ii] = 0; st.half[ii] = 0; }
            }
          }
          break;
        }
      }
    }
    // ★AddProtectedStructure(±50, padding 5)(HiveBiome.cs:124,Place 返回**前**):
    //   原版主巢先注册保护区,驱动(WorldGen.cs:16036-16053)才掷蜂蜜斑——斑与本巢
    //   互斥。曾把注册放在斑循环之后 → 斑可落主巢正中。
    //   矩形语义:Rectangle(x-50, y-50, 100, 100) 半开区间 + Inflate(5) → 存 x±55/y±55
    //   （旧局部近似 {x-45..x+55} 左上偏 10 格,已按原版校正）
    addProtectedStructure(gs, { x0: x - 50, y0: y - 50, x1: x + 50, y1: y + 50 }, 5);
    mk?.('HV_E');
    mk?.('PLACEX');
    // ★cs:16036-16053:主巢落成后是"蜂蜜斑"(HoneyPatchBiome)而非卫星巢——
    //   目标数 Next(5)、预算 10000、每次先掷半径 NextDouble*60+30 再掷角度
    //   NextDouble*2π,y 无压缩;落点横向 50 边距内或放置失败则不计
    // ★IIIII163（waterpark）：cs:16049-16052——num6=Next(5) **照掷**，extraLiquid 世界
    //   num6 强制 0（蜂蜜斑循环不进，rad/ang 双骰不耗）。漏此臂=旗标真值 #47 Hives 起
    //   骰流分叉（x86 蜜斑 0 斑 vs JS 乱斑，蜜/泥互化 ±2.9k 格）。
    const patchesRoll = rng.int(0, 4);
    const patches = gs.seedFlags.extraLiquid ? 0 : patchesRoll;
    let done = 0, budget = 10000;
    mk?.(`HV_PATCHN ${patches}`);
    while (done < patches && budget > 0) {
      const rad = rng.next() * 60 + 30;
      const ang = rng.next() * 6.2831854820251465;
      mk?.(`HV_PR r=${rad} a=${ang}`);
      const hx = Math.trunc(Math.cos(ang) * rad) + x;
      const hy = Math.trunc(Math.sin(ang) * rad) + y;
      budget--;
      hvN('honey_try');
      // 驱动门（cs:16049 num11>50 && num11<maxX-50）在 Place 调用**之前**——
      //   越界候选只耗 rad/ang 2 掷,不进 Place（vanilla 探针无此行）
      const patched = hx > 50 && hx < st.w - 50 && (() => {
        mk?.(`PATCH ${hx},${hy}`);
        const ok = placeHoneyPatch(st, rng, gs, hx, hy);
        mk?.('PATCHX');
        return ok;
      })();
      if (patched) { hvN('honey_ok'); done++; }
    }
    placed++;
  }
}

// ===================== 蜘蛛巢（1456 SpiderCaves L17455 + Spread.Spider L3653 1:1） =====================
const POT = TILE_BY_KEY['pot']!;
const DECO165 = TILE_BY_KEY['v_165_cave_decos']!;
const DECO187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const SMALL185 = TILE_BY_KEY['v_185_small_decos']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const MAX_TILE_COUNT = 3500; // 原版 maxTileCount（countTiles 硬顶）
/** wall!=0 即封（cs:9526 jungle=false 分支）。旧版把 1/2 当"无墙"是过时适配
 *  （"TerrainPass 预填 1/2"实为误记——本仓墙初始化全 0，地表 2/40 由
 *  DirtWallBackgrounds（pass 6/原版 7）写入，与原版时序一致）。 */
const wallSealed = (wl: number) => wl !== 0;

/** 原版 WorldGen.SolidTile（cs:70155）：active && tileSolid && !tileSolidTop && !halfBrick
 *  && slope==0 && !inActive。生成期幽灵 tile（有 type 无 flags）不算实心。
 *  tileSolid 走 GenSolid：本 pass 头 379 已翻非实心（cs:17459）——曾漏 !solidTop/
 *  !half/slope==0 三门（斜面/半砖腔壁被当实心 → 洪泛计数与扩散门双偏） */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const def = TILE_DEFS[st.type[i]];
  if (!def) return false;
  return genSolidType(st.type[i]) && !def.platform && !st.half[i] && st.slope[i] === 0 && (st.wire[i] & 32) === 0;
}

/** 原版 SolidTile2（cs:70178）：active && tileSolid && slope==0 && !halfBrick && !inActive
 *  ——**无** tileSolidTop 门（PlacePot 地面/PlaceSmallPile/Place3x2 底座用） */
function solidTile2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  return genSolidType(st.type[i]) && !st.half[i] && st.slope[i] === 0 && (st.wire[i] & 32) === 0;
}

/** countTiles/nextCount（cs:9493-9600）1:1（本 pass 实参 jungle=false, lavaOk=true）：
 *  ★DFS 原序（x-1→x+1→y-1→y+1）+ CountedTiles **只登记非实心格**（cs:9585）——
 *  实心邻格（含蘑菇草 70）可被多路重复访问，shroom 按**访问次数**累加（曾用栈 BFS+
 *  全格 seen → shroom 欠计，蘑菇腔 reject 门 `shroomCount>1→num6=0`（cs:17511）失灵）。
 *  封顶：触界/墙 244/微光液/墙!=0 → count=3500；lavaOk=true 故岩浆只计数不封。
 *  ★2026-08-18 显式栈化：原为真递归（深至 3500）——Chrome worker 栈仅主线程约半
 *  （实测空帧 4544 vs 8840），3500 层真实帧在 worker 必爆栈（用户"雕像宝箱"槽
 *  21% 崩溃根因）。逆序压栈后出序 = 递归 pre-order 逐帧等价（先根后子、子序
 *  x-1→x+1→y-1→y+1 不变），封顶/重复访问/shroom 语义全部保持。 */
function countTiles(st: TileStore, x: number, y: number): { count: number; shroom: number } {
  const __ft = (globalThis as { __swFloodTrace?: (phase: string, x: number, y: number, count: number, shroom: number, cells?: number[]) => void }).__swFloodTrace;
  const __fb = (globalThis as { __swFloodBox?: (phase: string, x: number, y: number) => void }).__swFloodBox;
  if (__ft) __ft('start', x, y, 0, 0);
  if (__fb) __fb('start', x, y, );
  let count = 0, shroom = 0;
  const counted = new Set<number>();
  const stack: number[] = [x, y];
  while (stack.length) {
    const cy = stack.pop()!, cx = stack.pop()!;
    if (count >= MAX_TILE_COUNT) continue;                           // cs:9506 头部早退
    if (cx <= 1 || cx >= st.w - 1 || cy <= 1 || cy >= st.h - 1) { count = MAX_TILE_COUNT; continue; }
    const i = st.idx(cx, cy);
    if (counted.has(i)) continue;                                    // cs:9523（仅非实心格曾登记）
    if (st.wall[i] === 244) { count = MAX_TILE_COUNT; continue; }    // cs:9515 活木墙
    if (st.liquid[i] > 0 && st.liquidType[i] === 4) { count = MAX_TILE_COUNT; continue; } // 微光
    if (wallSealed(st.wall[i])) { count = MAX_TILE_COUNT; continue; } // cs:9526 jungle=false
    if (st.flags[i] && st.type[i] === MUSHROOM_GRASS) shroom++;      // cs:9565（每次访问都计）
    if (!solidTile(st, cx, cy)) {
      counted.add(i);                                                // cs:9585
      count++;
      // 逆序压栈（出序 = 递归子序 x-1→x+1→y-1→y+1）
      stack.push(cx, cy + 1, cx, cy - 1, cx + 1, cy, cx - 1, cy);
    }
  }
  if (__ft) __ft('end', x, y, count, shroom, [...counted]);
  return { count, shroom };
}

/** PlacePot（cs:54082-54115）1:1：2×2（y-1..y 行），随机 3 变体在 X 轴、style 在 Y 轴；
 *  占用格须空、脚下四连门 nactive+!half+!slope+tileSolid（=SolidTile2 语义，
 *  原版无 tileSolidTop 门）；Next(3) 仅在放置成功时消费（cs:54104） */
function placePot(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  for (let k = 0; k < 2; k++) {
    for (let l = -1; l < 1; l++) {
      if (!st.inBounds(x + k, y + l) || st.flags[st.idx(x + k, y + l)]) return false;
    }
    if (!solidTile2(st, x + k, y + 1)) return false;
  }
  const variant = rng.int(0, 2) * 36; // 原版仅在放置成功时消费 Next(3)
  for (let k = 0; k < 2; k++) {
    for (let l = -1; l < 1; l++) {
      st.setTileSilent(x + k, y + l, POT, k * 18 + variant, (l + 1) * 18 + style * 36);
      st.half[st.idx(x + k, y + l)] = 0;  // cs:54124 halfBrick(false)（setTileSilent 不清）
    }
  }
  return true;
}

/** PlaceTight(spiders:true)（cs:38329/38368）1:1：垂挂蛛网 165（1×2，fx=108+variation*18）。
 *  ★SSSS 三补（#63 残 T0>165×527 主根因）：
 *  ① 头门 anyShimmer/幼虫 231（cs:38345）：微光格或 231 占位 → 拒（掷骰前）；
 *  ② 放置写 ClearSlope（cs:38382-38386 两格 slope0+half0）；
 *  ③ 尾部 CheckStalactite(x,y)（cs:38353-38356）：GetDesiredStalagtiteStyle
 *     （cs:38746）对泥土支撑（type 0 不在风格表）fail → 整对 KillTile；特殊支撑
 *     （367/368/396/397/147/161/25/203/...）→ style≠11 → 1×Next(3) 重定型掷
 *     （帧改写八通道不可见，掷移流可见）；石/苔藓支撑且 wall==62 → desired=11
 *     无掷存活。杀链级联经 killStalactiteTile 九邻 frame165 重查（邻网连环杀）。 */
function placeTightWebs(st: TileStore, rng: RNG, x: number, y: number): boolean {
  const gi = st.idx(x, y);
  if (st.liquid[gi] > 0 && st.liquidType[gi] === 4) return false;   // anyShimmer（+1 编码 4）
  if (st.flags[gi] && st.type[gi] === LARVA) return false;          // cs:38345 type==231
  rng.int(0, 1); // preferSmall 掷（cs:38349 genRand.Next(2)）——★XXXX 定谳：spiders
  //   语境该旗**不可达**（IL +005C ldarg.s spiders → brfalse +151；+0063 起即 spiders
  //   两格写分支并 ret）——UUUU"小型分支 IL +0063"系误读（+0063=spiders 分支起点），
  //   其试接 2→1130 正因建模了原版永不执行的支。掷保留仅保流位，写侧恒两格垂网。
  const variation = rng.int(0, 2);
  if (!solidTile(st, x, y - 1)) return false;
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
  if (!st.inBounds(x, y + 1) || st.flags[st.idx(x, y + 1)]) return false;
  const fx = 108 + variation * 18;
  st.setTileSilent(x, y, DECO165, fx, 0);
  st.setTileSilent(x, y + 1, DECO165, fx, 18);
  st.slope[st.idx(x, y)] = 0; st.half[st.idx(x, y)] = 0;            // ClearSlope（cs:38382）
  st.slope[st.idx(x, y + 1)] = 0; st.half[st.idx(x, y + 1)] = 0;
  checkStalactite(st, rng, x, y);                                   // cs:38353 尾部复核
  return true;
}

/** Place3x2（cs:52097，经 PlaceTile case 187 派发）1:1：3×2 覆饰锚 x-1..x+1 ×
 *  y-1..y（★曾偏 +1 列锚 x..x+2）；三列底座 SolidTile2(y+1)；186/187 的
 *  InvalidTileForPilesOrSpeleothems 底座巨石门在蜘蛛 pass 时点恒空集（巨石陷阱
 *  pass 更晚），备案不查。fx=style*54+col*18，fy=0/18。
 *  ★SSSS：PlaceTile 全门补——前置清（cs:59500 !active→Clear(Tile|Paint|Slope)，
 *  放置失败也清）+ case 187 分支尾 SquareTileFrame（cs:60019，成败皆跑）+
 *  成功尾 SquareTileFrame（cs:60281，tile.active() 才跑）→ 帧杀引擎级联
 *  （邻格 165/28/185/187 Check* 复核，#63 残 T0>28×41/T187>28×38 主根因）。
 *  中心 (x,y) 引擎分派走 C3X2 族 check3x2（含 186 金币堆三档掷——187 不触发）。 */
function placeDeco187(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
  // PlaceTile 前置清（cs:59500）——锚格 inactive 清残坡/半砖（#93 placeExposed 同源）
  const pi = st.idx(x, y);
  if (!st.flags[pi]) {
    st.type[pi] = 0; st.frameX[pi] = 0; st.frameY[pi] = 0;
    st.half[pi] = 0; st.slope[pi] = 0; st.paint[pi] = 0;
  }
  let ok = true;
  for (let k = x - 1; k <= x + 1 && ok; k++) {
    for (let l = y - 1; l <= y && ok; l++) {
      if (st.inBounds(k, l) && st.flags[st.idx(k, l)]) ok = false;
    }
    if (ok && !solidTile2(st, k, y + 1)) ok = false;
  }
  if (!ok) {
    genSquareTileFrame(st, rng, x, y);   // ② cs:60019 分支尾——Place3x2 失败也跑
    return false;
  }
  for (let k = x - 1; k <= x + 1; k++) {
    for (let l = y - 1; l <= y; l++) {
      st.setTileSilent(k, l, DECO187, style * 54 + (k - (x - 1)) * 18, l === y - 1 ? 0 : 18);
    }
  }
  genSquareTileFrame(st, rng, x, y);     // ② cs:60019 分支尾
  genSquareTileFrame(st, rng, x, y);     // ③ cs:60281 成功尾
  return true;
}

/** PlaceSmallPile（cs:46831）1:1：size0=1×1（fx=style*18）；size1=2×1（fx=style*36，
 *  fy=18）。地面 = SolidTile2（cs:46856/46880，无 tileSolidTop 门）。
 *  ★SSSS：anyLava 头门补（cs:46846 —— 岩浆格拒置，地狱边缘巢腔可命中）；
 *  size1 的 InvalidTileForPilesOrSpeleothems 双底座门（cs:46860）维持备案不查
 *  （生成期此阶段无巨石族）。PlaceSmallPile 无 SquareTileFrame 尾（原版直写）。 */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  const gi = st.idx(x, y);
  if (st.liquid[gi] > 0 && st.liquidType[gi] === 2) return false;   // anyLava（+1 编码 2）
  if (pileSize === 1) {
    if (!solidTile2(st, x, y + 1) || !solidTile2(st, x + 1, y + 1)) return false;
    if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
    if (!st.inBounds(x + 1, y) || st.flags[st.idx(x + 1, y)]) return false;
    st.setTileSilent(x, y, SMALL185, pileStyle * 36, 18);
    st.setTileSilent(x + 1, y, SMALL185, pileStyle * 36 + 18, 18);
    return true;
  }
  if (!solidTile2(st, x, y + 1)) return false;
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return false;
  st.setTileSilent(x, y, SMALL185, pileStyle * 18, 0);
  return true;
}

/** Spread.Spider（L3653）1:1：波前 BFS 逐层扩散。
 *  每格：地狱线/地表线随机带（Next(5)×2）双重拦截——★深门 = Main.UnderworldLayer
 *  （= h-200 恒值属性 Main.cs:2863，曾误用 gs.lavaLine（Terrain 游走产物，本图
 *  ≈790 < 1000）→ 蜘蛛巢整体浅 200+ 格、deep 带 62>0 1.5万格差的主根因）；
 *  实心或已有墙 → 实心且无墙时背面刷 62 后止步；
 *  空格无墙 → 刷 62 + SquareWallFrame(中心格 resetFrame) 1×Next(0,3)（cs:3682/
 *  Framing.cs:390——曾漏此掷 → 后续掷全错位）+ 清液体 + 内饰（地面 1/3：
 *  1/15 蛛网宝箱(939/箱型15)否则蛛网罐 style19-20；天花板 1/3 垂网 165；
 *  否则地面放覆饰 187 style9-13 + 1/3 小堆 185×2）。
 *  ★重复入队格无 hashSet 去重（cs:3672 直处理）→ 门掷/掷骰按重复次数重复消费，原样保留 */
function spreadSpider(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, x: number, y: number): void {
  const __v = (globalThis as { __swSpiderVisit?: (cx: number, cy: number, kind: string, before: number, after: number, wave: number) => void }).__swSpiderVisit;
  // IIIII：分支级陈设日志（与 vanilla SpiderProbe 分支级织入逐行对拍；无钩零开销）
  const __d = (globalThis as { __swSpiderDeco?: (s: string) => void }).__swSpiderDeco;
  const seen = new Set<number>();
  const key = (px: number, py: number) => px * 100000 + py;
  let frontier: Array<[number, number]> = [[x, y]];
  const DIRS: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let waveN = 0;
  while (frontier.length) {
    const layer = frontier;
    frontier = [];
    for (const [cx, cy] of layer) {
      if (cx < 1 || cx >= st.w - 1 || cy < 1 || cy >= st.h - 1) { __v?.(cx, cy, 'R0:-:-', 0, 0, waveN); continue; }
      const g1 = rng.int(0, 4);
      if (cy >= st.h - 200 - g1) { __v?.(cx, cy, `R1:${g1}`, 0, 0, waveN); continue; } // Main.UnderworldLayer(h-200) - Next(5)
      const g2 = rng.int(0, 4);
      if (cy < gs.worldSurface + g2) { __v?.(cx, cy, `R2:${g1}:${g2}`, 0, 0, waveN); continue; }
      __v?.(cx, cy, `G:${g1}:${g2}`, 0, 0, waveN);
      seen.add(key(cx, cy));
      const i = st.idx(cx, cy);
      const before = (st.flags[i] ? 1 : 0) | (st.wall[i] ? 2 : 0) | (st.liquid[i] ? 4 : 0);
      __d?.(`${waveN} H ${cx},${cy} a=${st.flags[i] ? 1 : 0} w=${st.wall[i]} t=${TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1} l=${st.liquid[i]}`);
      if (solidTile(st, cx, cy) || wallSealed(st.wall[i])) {
        let paint = 0;
        if (st.flags[i] && !wallSealed(st.wall[i])) { st.wall[i] = 62; paint = 1; }
        __d?.(`${waveN} SW ${cx},${cy} p=${paint}`);
        __v?.(cx, cy, 'S', before, before | 2, waveN);
        continue;
      }
      __d?.(`${waveN} AIR ${cx},${cy}`);
      st.wall[i] = 62;
      rng.nextInt(3);   // SquareWallFrame(cx,cy) 中心格 WallFrame(resetFrame:true)（cs:3682）
      if (!st.flags[i]) {
        st.liquid[i] = 0; st.liquidType[i] = 0;
        const bs = solidTile(st, cx, cy + 1);
        const r3 = bs ? rng.int(0, 2) : -1;
        __d?.(`${waveN} FLR ${cx},${cy} bs=${bs ? 1 : 0} r3=${r3}`);
        if (bs && r3 === 0) {
          if (rng.int(0, 14) === 0) {
            // notNearOtherChests:true(cs:3708 原版实参)——±25×±8 已有 BasicChest 则拒。
            // ★QQQQQ（s22222 #63 定谳）：TileObject.Place 预清场（TileObject.cs:79-90）
            //   已由 JJJJ 批在 placeBuriedChest 写侧 1:1 落地（killTileChest：cut/
            //   Breakable 覆盖格先杀后写箱，含 51&墙62 的 1×Next(4)（1456 cs:63904 /
            //   1457 cs:64369）+ 尾
            //   SquareTileFrame 九宫孤儿级联）——IIIII 时代的"事后补杀镜像"（回滚→
            //   重杀→重写）随之退役：镜像会在 loot 之后再消费一遍覆盖格杀掷（s22222
            //   巢#11 箱覆 2 张蛛网 51 → +2×Next(4) 幽灵掷），掷流自此 +2 偏移 →
            //   波内陈设分叉（(985,789) FLR r3 0 vs 2）→ 巢#12 起采样锚全漂（vanilla
            //   633,694 vs JS 2124,865）→ #63 W=28.5k 墙带。9293480/12345 期镜像
            //   无症状纯因覆盖格 ∈零掷族（165 垂网 killDustRollsPer=0）。
            const chok = placeBuriedChest(st, rng, gs, chests, cx, cy, { style: 15, loot: 'vi_939_web_slinger', notNearOtherChests: true });
            __d?.(`${waveN} CH ${cx},${cy} ok=${chok ? 1 : 0} a=${st.flags[i] ? 1 : 0} t=${TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1}`);
          } else {
            const psty = rng.int(19, 20);
            const pok = placePot(st, rng, cx, cy, psty);
            __d?.(`${waveN} POT ${cx},${cy} sty=${psty} ok=${pok ? 1 : 0} a=${st.flags[i] ? 1 : 0} t=${TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1}`);
          }
        }
        if (!st.flags[i]) {
          const us = solidTile(st, cx, cy - 1);
          const r3b = us ? rng.int(0, 2) : -1;
          __d?.(`${waveN} CEIL ${cx},${cy} g=${us ? 1 : 0} r3=${r3b} a=${st.flags[i] ? 1 : 0}`);
          if (us && r3b === 0) {
            const i0 = st.idx(cx, cy), i1 = st.idx(cx, cy + 1);
            const sheetOf0 = TILE_DEFS[st.type[i0]]?.vanilla?.sheet ?? -1, sheetOf1 = TILE_DEFS[st.type[i1]]?.vanilla?.sheet ?? -1;
            const pre = `s${solidTile(st, cx, cy - 1) ? 1 : 0},a${st.flags[i0] ? 1 : 0},t${sheetOf0}`
              + `,a1_${st.flags[i1] ? 1 : 0},t1_${sheetOf1},sh${st.liquid[i0] > 0 && st.liquidType[i0] === 4 ? 1 : 0}`;
            placeTightWebs(st, rng, cx, cy);
            __d?.(`${waveN} TIGHT ${cx},${cy} pre=${pre} post=a${st.flags[i0] ? 1 : 0},t${TILE_DEFS[st.type[i0]]?.vanilla?.sheet ?? -1}`
              + `,a1_${st.flags[i1] ? 1 : 0},t1_${TILE_DEFS[st.type[i1]]?.vanilla?.sheet ?? -1}`);
          } else if (solidTile(st, cx, cy + 1)) {
            const dsty = 9 + rng.int(0, 4);
            const dok = placeDeco187(st, rng, cx, cy, dsty);
            __d?.(`${waveN} D187 ${cx},${cy} sty=${dsty} ok=${dok ? 1 : 0} a=${st.flags[i] ? 1 : 0} t=${TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1}`);
            const r3c = rng.int(0, 2);
            __d?.(`${waveN} PR3 ${cx},${cy} r=${r3c}`);
            if (r3c === 0) {
              if (!st.flags[i]) {
                const p1s = 34 + rng.int(0, 3);
                const p1ok = placeSmallPile(st, cx, cy, p1s, 1);
                __d?.(`${waveN} P1 ${cx},${cy} sty=${p1s} ok=${p1ok ? 1 : 0} a=${st.flags[i] ? 1 : 0}`);
              }
              if (!st.flags[i]) {
                const p0s = 48 + rng.int(0, 5);
                const p0ok = placeSmallPile(st, cx, cy, p0s, 0);
                __d?.(`${waveN} P0 ${cx},${cy} sty=${p0s} ok=${p0ok ? 1 : 0} a=${st.flags[i] ? 1 : 0}`);
              }
            }
          }
        }
      }
      const after = (st.flags[i] ? 1 : 0) | (st.wall[i] ? 2 : 0) | (st.liquid[i] ? 4 : 0);
      __v?.(cx, cy, 'A', before, after, waveN);
      for (const [dx, dy] of DIRS) {
        if (!seen.has(key(cx + dx, cy + dy))) frontier.push([cx + dx, cy + dy]);
      }
    }
    waveN++;
  }
}

/** SpiderCaves pass（L17455）1:1：w*0.005 个巢；采样 x∈[200,w-200) y∈[(ws+rock)/2,h-230)；
 *  countTiles 门 500≤空腔<3500（重试上限 w/2，超限放弃该巢；重掷 y 域换 rockLevel+30） */
export function runSpiderNestPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  // ★IIIII41-T3②（cs:17471-17546）：SpiderCaves pass 的 arachnophobia 门——
  //   `if (!Skyblock.denyAllGeneration && !Variations.noSpiderCavesActuallyNoSpiderCaves)`
  //   包住**整段 pass 体**：蜘蛛巢生成（Spread.Spider）与头尾 tileSolid 翻转
  //   （379→false/225 支/162→true）全部跳过 = 蜘蛛洞穴内容面整域消失。
  //   门语义（GenVars.Variations :269-278）：noSpiderCaves ∧ activeSecretSeedCount<4；
  //   本仓单秘路由精确等价（多秘计数另案，SeedEasterEggs.ts 头注）。count≥4
  //   （noSpiderCavesILiedMoreSpiderCaves :281-290）反而在 pass 尾**加密度**
  //   （DoNoSpiderCavesILiedMoreSpiderCaves :2626/:17539）+ WebsAndHoney 墙62蜂蜜化
  //   （:20185-20192）——组合债登记，不在本批。
  if (noSpiderCavesActuallyNoSpiderCaves(gs.seedFlags)) return;
  const __cap = (globalThis as { __swSpiderGsCap?: (gs: GenState, st: TileStore) => void }).__swSpiderGsCap;
  if (__cap) __cap(gs, st);
  // ★pass 头 tileSolid 翻转（cs:17459 `Main.tileSolid[379] = false`）：泡泡块非实心
  //   （countTiles 的 SolidTile 洪泛不再被 379 阻断）。本仓生成期不放置 379,行为无差,
  //   存档时间线——原版由 UndergroundJungleTrees 头（cs:17956,本仓缺该 pass,备案）还原。
  flipGenSolid([379], false);
  // ★UUUUUU（cs:17517 `if (notTheBees) Main.tileSolid[225] = true`）：蜂蜜块回实心——
  //   蜂巢世界 SpiderNest 采样/countTiles 洪泛把 225 计实心；尾 cs:17519 翻回 false。
  if (gs.seedFlags.notTheBees) flipGenSolid([225], true);
  const __m = (globalThis as { __swSpiderNest?: (s: string) => void }).__swSpiderNest;
  // QQQQQ：候选级采样日志（countTiles 门对拍用；无钩零开销）
  const __c = (globalThis as { __swSpiderCand?: (n: number, t: number, x: number, y: number, count: number, shroom: number) => void }).__swSpiderCand;
  // ★IIIII50（1458 cs:17479-17493）：巢数分支链——if(ntb∧FTW∧!celebration){组合域
  //   乘子群,本仓未建模(备案)} else if(roundLandmasses){num/=2} else if(getGood)
  //   {num2×3}。纯 FTW 链此前走基线数量=漏接；本仓先落**互斥门语义**(前两臂均以
  //   旗标精确判否)，组合域首臂仍备案不半移植。
  const ntbFtwNoCeleb = !!gs.seedFlags.notTheBees && !!gs.seedFlags.getGoodWorld
    && !gs.seedFlags.tenthAnniversary;
  const count = Math.floor(st.w * 0.005)
    * (!ntbFtwNoCeleb && !gs.seedFlags.roundLandmasses && gs.seedFlags.getGoodWorld ? 3 : 1);
  const retryCap = Math.floor(st.w / 2);
  const yMin = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  for (let n = 0; n < count; n++) {
    let x = rng.int(200, st.w - 201);
    let y = rng.int(yMin, st.h - 231);
    // ★IIIII98（Terarria1458 cs:17488-17492）：REMIX 深度带覆写——普通首选
    //   Next((worldSurface+rockLayer)/2, maxY-230) 照掷，remix 再掷
    //   Next((int)worldSurface,(int)rockLayer) **覆写**（先掷后覆写=恒耗双骰，
    //   IIII95 深度带家族同款：漏掷 → 巢采样整带错位+重试环少骰）。
    const remixSn = !!gs.seedFlags.remix;
    if (remixSn) y = rng.int(Math.trunc(gs.worldSurface), Math.trunc(gs.rockLevel) - 1);
    let c = countTiles(st, x, y);
    __c?.(n, 0, x, y, c.count, c.shroom);
    let tries = 0;
    while ((c.count >= MAX_TILE_COUNT || c.count < 500) && tries < retryCap) {
      tries++;
      // cs:17502-17504：重掷 x 仍 [200,w-200)，y 换 [rockLayer+30, h-230)
      x = rng.int(200, st.w - 201);
      y = rng.int(gs.rockLevel + 30, st.h - 231);
      // ★IIIII98（cs:17505-17507）：重试环内同样覆写
      if (remixSn) y = rng.int(Math.trunc(gs.worldSurface), Math.trunc(gs.rockLevel) - 1);
      c = countTiles(st, x, y);
      __c?.(n, tries, x, y, c.count, c.shroom);
      if (c.shroom > 1) c.count = 0;
    }
    __m?.(`NEST#${n} x=${x} y=${y} count=${c.count} shroom=${c.shroom} tries=${tries}`);
    if (tries < retryCap) spreadSpider(st, rng, gs, chests, x, y);
  }
  // ★pass 尾 tileSolid 翻转（cs:17521 `Main.tileSolid[162] = true`）：薄冰回实心
  //   （FragileIce cs:16783 曾翻非实心）——此后 UndergroundHouses 头（cs:17077）与
  //   LihzahrdTemplePart2 头（cs:17813）会再各自翻转。本仓 SpiderNest 槽在薄冰之后,
  //   时序与原版一致（FragileIce 16756 < SpiderCaves 17455）。
  // ★UUUUUU（cs:17519 `if (notTheBees) Main.tileSolid[225] = false`）：蜂蜜块还原非实心
  if (gs.seedFlags.notTheBees) flipGenSolid([225], false);
  flipGenSolid([162], true);
}

/** WebsInSpiderCavesAndHoney pass（L20140）1:1：
 *  墙86 蜂巢腔 → 液体转蜂蜜 + 1/3 钟乳石(165)；墙62 蜘蛛巢 → 清液体 +
 *  空格 9/10 放蛛网 51（±2-4 内有实心才放） */
/** PlaceUncheckedStalactite（cs:38368-38688）非 spiders 语境 1:1——
 *  ★VVVVV（#85 Webs_And_Honey 主根因）：wall 86 的 PlaceTight(spiders:false)
 *  曾硬编码"蜂巢单格 fx=162+var*18 fy=72"——①每调 PlaceTight 恒耗 2 掷
 *  （实参求值 Next(2) preferSmall + Next(3) variation，cs:38349——与放置成败
 *  无关；旧版仅在实心门内耗 1 掷=流位漂移）②家族分派整缺（沙 0/石 54/巢 162/
 *  硬沙 378/泥 432/丛林泥 486；preferSmall 单格 fy72 vs 双格 fy0/18——蜂巢 225
 *  恒单格）③地面支（钟乳石笋 fy90 单格/fy36+54 双格上长）整缺④尾部
 *  CheckStalactite 复核缺（支撑 fail→整对杀+style 重定型 1×Next(3) 掷）。
 *  写侧 ClearSlope（cs:38382 等）+CopyPaintAndCoating（锚格漆拷贝）。 */
const STAL_MOSS = TILE_MOSS_SHEETS;   // Main.tileMoss——★BJ210 收编单源（§6i）
function placeUncheckedStalactiteGen(st: TileStore, x: number, y: number, preferSmall: boolean, variation: number): void {
  const SHEETC = (tx: number, ty: number): number => {
    if (!st.inBounds(tx, ty)) return -1;
    const i = st.idx(tx, ty);
    return st.flags[i] ? (TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1) : -1;
  };
  const put = (px: number, py: number, fx: number, fy: number, fromPaint: number): void => {
    if (!st.inBounds(px, py)) return;
    st.setTileSilent(px, py, DECO165, fx, fy);
    st.slope[st.idx(px, py)] = 0; st.half[st.idx(px, py)] = 0;   // ClearSlope
    st.paint[st.idx(px, py)] = fromPaint;                        // CopyPaintAndCoating
  };
  const act = (tx: number, ty: number): boolean => st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] !== 0;
  if (solidTile(st, x, y - 1) && !act(x, y) && !act(x, y + 1)) {
    // —— 天花板支（cs:38373）：锚=上格 ——
    const up = SHEETC(x, y - 1);
    const fromPaint = st.paint[st.idx(x, y - 1)];
    const fams: Array<[ReadonlySet<number>, number]> = [
      [new Set(ICES_SNOW_SHEETS), 0],                                            // 沙（雪冰族={147}∪Ices——★BJ218 单源 data/tiles.ts:ICES_SNOW_SHEETS,TileID.cs:297,§6j）
      [new Set(CONV_STONE_SHEETS), 54],                                          // 石（+moss 并集；Conversion.Stone :26——★BJ210 单源拷贝,§6i）
      [new Set([396, 397]), 378], [new Set([368]), 432], [new Set([367]), 486],
    ];
    for (const [set, base] of fams) {
      if (!set.has(up) && !(base === 54 && STAL_MOSS.has(up))) continue;
      if (preferSmall) put(x, y, base + variation * 18, 72, fromPaint);
      else { put(x, y, base + variation * 18, 0, fromPaint); put(x, y + 1, base + variation * 18, 18, fromPaint); }
    }
    if (up === 225) put(x, y, 162 + variation * 18, 72, fromPaint);              // 蜂巢恒单格
    return;
  }
  // —— 地面支（cs:38528）：!spiders && SolidTile(y+1) && 双格净空 ——
  if (!solidTile(st, x, y + 1) || act(x, y) || act(x, y - 1)) return;
  const down = SHEETC(x, y + 1);
  const fromPaint = st.paint[st.idx(x, y + 1)];
  if (down === 1 || STAL_MOSS.has(down) || down === 117 || down === 25 || down === 203) {
    if (preferSmall) put(x, y, 54 + variation * 18, 90, fromPaint);
    else { put(x, y - 1, 54 + variation * 18, 36, fromPaint); put(x, y, 54 + variation * 18, 54, fromPaint); }
  }
  if (down === 225) put(x, y, 162 + variation * 18, 90, fromPaint);
  const floorFams: Array<[number, number]> = [[396, 378], [397, 378], [368, 432], [367, 486]];
  for (const [t2, base] of floorFams) {
    if (down !== t2) continue;
    if (preferSmall) put(x, y, base + variation * 18, 90, fromPaint);
    else { put(x, y - 1, base + variation * 18, 36, fromPaint); put(x, y, base + variation * 18, 54, fromPaint); }
  }
}

/** PlaceTight(spiders:false)（cs:38329-38357）——WebsAndHoney 的 wall 86 支 */
function placeTightGen(st: TileStore, rng: RNG, x: number, y: number): void {
  const gi = st.idx(x, y);
  if (st.liquid[gi] > 0 && st.liquidType[gi] === 4) return;      // anyShimmer
  if (st.flags[gi] && st.type[gi] === LARVA) return;             // type==231
  // ★实参求值序（C# 左→右）：Next(2)=preferSmall 先、Next(3)=variation 后——
  //   两掷与放置门无关恒耗（#85 流位根因）
  const preferSmall = rng.int(0, 1) === 0;
  const variation = rng.int(0, 2);
  placeUncheckedStalactiteGen(st, x, y, preferSmall, variation);
  if (st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === DECO165) {
    checkStalactite(st, rng, x, y);                              // cs:38353-38356
  }
}

export function runWebsInSpiderCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★PPPPP（cs:20146-20150）：饥荒世界扫描起点 worldSurface → **50**（地表带也布
  //  蛛网/蜂巢钟乳石——配合草墙 pass 的蜘蛛墙 62 地表化）。
  const jStart = gs.seedFlags?.theConstant ? 50 : Math.floor(gs.worldSurface);
  for (let i = 100; i < st.w - 100; i++) {
    for (let j = jStart; j < st.h - 100; j++) {
      const idx = st.idx(i, j);
      if (st.wall[idx] === 86) {
        if (st.liquid[idx] > 0) st.liquidType[idx] = 3; // honey(true)（cs:20155）
        if (rng.int(0, 2) === 0) placeTightGen(st, rng, i, j);
      }
      if (st.wall[idx] === 62) {
        st.liquid[idx] = 0; st.liquidType[idx] = 0;     // liquid=0+lava(false)（cs:20166）
      }
      if (st.wall[idx] === 62 && !st.flags[idx] && rng.int(0, 9) !== 0) {
        const r = rng.int(2, 4);                        // Next(2,5)（cs:20174）
        let nearSolid = false;
        for (let k = i - r; k <= i + r; k++) {
          for (let l = j - r; l <= j + r; l++) {
            if (solidTile(st, k, l)) { nearSolid = true; break; }
          }
        }
        if (nearSolid) {
          // PlaceTile(i,j,51) 1:1（cs:20181）：液体门（本语境 liquid 刚清=恒过，备案）
          // + 前置清（cs:59500 !active→Clear 残值 type/帧/坡/半砖/漆——残值 type
          // 参与上游判定须抹）+ default 支 active+type（帧 0/0）+ 尾 SquareTileFrame
          // （cs:60281——邻格 165/28/185 等 Check* 级联）。pass 尾 TileFrame(i,j)
          // （cs:20182）：51 非 tileFrameImportant/非仙人掌藤族 → no-op（备案）。
          st.type[idx] = 0; st.frameX[idx] = 0; st.frameY[idx] = 0;
          st.half[idx] = 0; st.slope[idx] = 0; st.paint[idx] = 0;
          st.type[idx] = COBWEB; st.flags[idx] = 1;
          genSquareTileFrame(st, rng, i, j);
        }
      }
    }
  }
}

/** Webs pass（L13659）1:1：w*h*0.0006 次天花板蛛网 runner（前 numMCaves 次锚定山洞口）。
 *  TileRunner(51, addTile:true, ±1 横速, -1 升速, 4-10 半径, 2-3 步) */
export function runWebsPass(st: TileStore, rng: RNG, gs: GenState): void {  const count = Math.floor(st.w * st.h * 0.0006);
  const numMCaves = gs.numMCaves ?? 0;
  for (let i = 0; i < count; i++) {
    let j = rng.int(20, st.w - 21);
    let num = rng.int(Math.floor(gs.worldSurfaceHigh), st.h - 21);
    if (i < numMCaves && gs.mCaveX && gs.mCaveY) {
      j = gs.mCaveX[i]; num = gs.mCaveY[i];
    }
    if (!st.inBounds(j, num) || st.flags[st.idx(j, num)]) continue;
    if (!(num > gs.worldSurface || st.wall[st.idx(j, num)] > 0)) continue;
    while (num > Math.floor(gs.worldSurfaceLow) && !st.flags[st.idx(j, num)]) num--;
    num++;
    const dir = rng.int(0, 1) === 0 ? -1 : 1;
    while (j > 10 && j < st.w - 10 && !st.flags[st.idx(j, num)]) j += dir;
    j -= dir;
    if (!st.inBounds(j, num)) continue;
    if (!(num > gs.worldSurface || st.wall[st.idx(j, num)] > 0)) continue;
    tileRunner(st, rng, gs, j, num, {
      strength: rng.int(4, 10), steps: rng.int(2, 3), type: COBWEB,
      addTile: true, speedX: dir, speedY: -1,
    });
  }
}

/** BeeLarvaInBeehives pass（cs:21018-21050）1:1：蜂巢 pass 只登记 larvaX/Y，
 *  幼虫放置（3 宽 ×4 高清空、底行铺蜂巢 225 整砖 + PlaceTile(231)）挪到管线尾
 *  （原版注册序 21018：LongMoss(20915) 之后、SettleLiquidsPart2(21051) 之前）。
 *  零掷骰——不影响 RNG 流。 */
export function runBeeLarvaPass(st: TileStore, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:21022 `Main.tileSolid[229] = true`）：蜂蜜块回实心——
  //   Piles 头（cs:18907）曾翻非实心且尾不还原,原版在此（BeeLarva 注册序 21018
  //   在 Piles 18900 之后）补回。★本仓蜂巢幼虫槽在矿骨堆**之前**执行,故本句先于
  //   Piles 头翻转 → 229 终态与本仓序偏差联动（生成末态 false,原版 true）,备案。
  flipGenSolid([229], true);
  for (let n = 0; n < gs.larvaX.length; n++) {
    const x = gs.larvaX[n], y = gs.larvaY[n];
    for (let j = x - 1; j <= x + 1; j++) {
      for (let k = y - 2; k <= y + 1; k++) {
        if (!st.inBounds(j, k)) continue;
        const i = st.idx(j, k);
        if (k !== y + 1) {
          st.flags[i] = 0;                       // active(false)，type 留待幼虫覆写
        } else {
          st.type[i] = HIVE; st.flags[i] = 1;    // 底行 225：active + slope(0) + halfBrick(false)
          st.slope[i] = 0; st.half[i] = 0;
        }
      }
    }
    // PlaceTile(x, y, 231)（本仓近似：3×3 幼虫块，占 x-1..x+1 × y-2..y）
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const tx = x - 1 + dx, ty = y - 2 + dy;
        if (!st.inBounds(tx, ty)) continue;
        const i = st.idx(tx, ty);
        st.type[i] = LARVA; st.flags[i] = 1;
        st.frameX[i] = dx * 18; st.frameY[i] = dy * 18;
      }
    }
  }
  // ★pass 尾 tileSolid 翻转（cs:21047-21048 `Main.tileSolid[232/162] = true`）：
  //   木刺/薄冰回实心（LihzahrdTemplePart2 尾 cs:17816 翻非实心的 232、FragileIce
  //   cs:16783 翻非实心的 162）。生成期此后再无两者的翻转写点。
  flipGenSolid([232, 162], true);
}
