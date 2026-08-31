// 原版 pass 28 "Underworld"（cs:13697-13918 普通世界分支）1:1。
// ①灰烬带+界下清空（★灰烬只写 type 不激活——原版语义，腔体保持空心）
// ②岩浆线 ③1/50 大灰烬丘陵 → Liquid.QuickWater(-2)（cs:13788，2026-08-16 接线：
//   原版在此把云湖/岩浆板整体沉降——漏接曾致 28.9 万 liq 差；QuickWater 全程
//   不掷 genRand，接线零流影响。LiquidInteractionsCleanup（cs:23898）只处理活性
//   黑曜石 56/659——本时点两者均为 0（dump027 实证），可证无操作省略）
// ④1/13 灰烬柱+横团+挖掘 ⑤随机小挖掘 ⑥底部岩浆层 ⑦地狱石脉
// ⑧外缘 17% 带灰烬草 633 + 1/3 灰烬树 634（★633 循环条件含 Next(-1,2)——
//   C# for 条件每迭代重掷，原版 cs:13870，非每列一掷）。
// AddHellHouses 为本槽尾段（runHellFortPass，与原版 pass 内位置等价，不另重播）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
import { growAshTree } from './TreePass';
import { LiquidSim } from '../../liquid/LiquidSim';
import type { World } from '../../World';

const ASH = T.ASH;
const HELLSTONE = TILE_BY_KEY['ore_hellstone']!;
const ASH_GRASS = TILE_BY_KEY['v_633_ash_grass_block']!;

export function runUnderworldPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  // 一次性探针钩（同 WebsPass 模式）：Underworld 入口快照（债时间线用）
  const g0 = globalThis as { __swUwCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swUwCap?.(gs, st); } catch { /* probe */ }
  const { w, h } = st;
  // ① 边界 + 灰烬带 + 界下清空
  let boundary = h - rng.int(150, 189);               // Next(150,190)
  const lavaSeed = h - rng.int(40, 69);               // Next(40,70)
  for (let x = 0; x < w; x++) {
    gp?.set3(x / w, 0, 0.15);   // 进度锚：边界游走≈窗前 15%（包内估计）
    boundary += rng.int(-3, 3);                       // Next(-3,4)
    if (boundary < h - 190) boundary = h - 190;
    if (boundary > h - 160) boundary = h - 160;
    for (let y = boundary - 20 - rng.int(0, 2); y < h; y++) {   // Next(3)
      const i = st.idx(x, y);
      if (y >= boundary) {
        st.flags[i] = 0;                              // active(false)：type 保留（幽灵，原版语义）
        st.liquid[i] = 0; st.liquidType[i] = 0;
      } else {
        st.type[i] = ASH;                             // ★只写 type 不激活——腔体保持空心
      }
    }
  }
  // ② 岩浆线
  let lavaY = lavaSeed;
  for (let x = 10; x < w - 10; x++) {
    lavaY += rng.int(-10, 10);                        // Next(-10,11)
    if (lavaY > h - 60) lavaY = h - 60;
    if (lavaY < h - 100) lavaY = h - 120;
    for (let y = lavaY; y < h - 10; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  // ③ 1/50 列大灰烬丘陵
  for (let x = 0; x < w; x++) {
    gp?.set3(x / w, 0.15, 0.35);   // 进度锚：岩浆线散布（估）
    if (rng.next() * 50 >= 1) continue;               // ≡ Next(50)==0
    let y = h - 65;
    while (!st.flags[st.idx(x, y)] && y > h - 135) y--;
    tileRunner(st, rng, gs, rng.int(0, w - 1), y + rng.int(20, 49), {
      strength: rng.int(15, 19), steps: 1000, type: ASH, addTile: true,
      speedX: 0, speedY: rng.int(1, 2), noYChange: true,
    });
  }
  // Liquid.QuickWater(-2)（cs:13788，③与④之间）：全图液体直接搬运沉降。
  // 生成期语义：isGeneratingOrLoadingWorld=常规交互只 strip 不落块；generatingWorld=
  // 首尾 ShimmerRemoveWater（本时点无微光腔 → 无操作）。LiquidSim 仅需 store/seed
  // 结构（quickWater 路径不触及其它 World 字段），一次性实例用后 dispose。
  {
    const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
    sim.isGeneratingOrLoadingWorld = true;
    sim.generatingWorld = true;
    // ★IIIII100d（GFB-C #28 三格液杀）：pass 链 RNG 必须接入 passRng/passRand——
    //   KillTile 尾 SquareTileFrame 级联帧引擎的 TileFrameImportant case165
    //   （CheckStalactite 钟乳石失锚整支）带 `if (ctx.rng)` 门；缺线 ⇒ 支整体跳过
    //   ⇒ 蜘蛛网(51) cut-kill 后悬空/失承的 cave-deco(165) 族漏杀
    //   （mile8 GFB-C #28 @1682,730 三格 T0>165，rig KSTK 栈定罪）。
    sim.passRand = (max) => rng.nextInt(max);
    sim.passRng = rng;
    // Liquid.cs:177-190 落水越 waterLine → 岩浆（深洞岩浆池来源）。地牢豁免分支
    // （:186-188）本时点可证无操作：地牢墙族 {7,8,9,94-99} 在 dump027 为 0
    // （Dungeon pass 32 在其后）——不接线。
    sim.genWaterLine = gs.waterLine;
    // ★IIIII58：REMIX 落水分型带（Liquid.cs:182-185 首臂）——同 settle/WorldGen 接线
    if (!!gs.seedFlags.remix) {
      sim.remixWaterRule = true;
      sim.remixLavaLine = gs.lavaLine;
      sim.remixRockLevel = gs.rockLevel;
      sim.remixOceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    }
    // ★IIIII62：LavaCheck 沙漠 blast 门旗标（Liquid.cs:1457）——remix/dual 不喷洒
    sim.remixWorldGen = !!gs.seedFlags.remix;
    sim.dualDungeonsSeed = !!gs.seedFlags.dualDungeons;
    sim.quickWater();
    sim.dispose();
  }
  // ④ 1/13 列灰烬柱 + 横向灰烬团 + 挖掘隧道
  // ★IIIII14（cs:13812/13821）：drunk/remix 中带（0.4w-0.6w）主柱与侧柱各加一道
  //   `Next(3)==0` 放行门——骰**恒掷**（C# || 左侧先求值），普通世界短路不掷。
  //   ★IIIII58：门谓词原文是 `(!drunkWorldGen && !remixWorldGen)`——此前只接了
  //   drunk 分量，REMIX 中带灰烬柱照常全放 → #28 Y/T 大面积差（r4 实证）。
  const drunkUW = !!gs.seedFlags.drunkWorld;
  const remixUW = !!gs.seedFlags.remix;
  const inCentralBandUW = (x: number) => x > w * 0.4 && x < w * 0.6;
  for (let x = 0; x < w; x++) {
    gp?.set3(x / w, 0.35, 0.75);   // 进度锚：灰烬丘陵主体（估）
    if (rng.next() * 13 >= 1) continue;               // ≡ Next(13)==0
    let y = h - 65;
    while ((st.liquid[st.idx(x, y)] > 0 || st.flags[st.idx(x, y)]) && y > h - 140) y--;
    if ((!drunkUW && !remixUW) || rng.int(0, 2) === 0 || !inCentralBandUW(x)) {
      tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
        strength: rng.int(5, 29), steps: 1000, type: ASH, addTile: true,
        speedX: 0, speedY: rng.int(1, 2), noYChange: true,
      });
    }
    let scale = rng.int(1, 2);                        // Next(1,3)
    if (rng.next() * 3 < 1) scale *= 0.5;             // ≡ Next(3)==0
    if ((!drunkUW && !remixUW) || rng.int(0, 2) === 0 || !inCentralBandUW(x)) {
      if (rng.next() < 0.5) {                         // ≡ Next(2)==0
        tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
          strength: Math.trunc(rng.int(5, 14) * scale), steps: Math.trunc(rng.int(10, 14) * scale),
          type: ASH, addTile: true, speedX: 1, speedY: 0.3,
        });
      }
      if (rng.next() < 0.5) {
        const s2 = rng.int(1, 2);
        tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
          strength: Math.trunc(rng.int(5, 14) * s2), steps: Math.trunc(rng.int(10, 14) * s2),
          type: ASH, addTile: true, speedX: -1, speedY: 0.3,
        });
      }
    }
    // Next(-10,10)×2 → 闭区间映射 int(-10,9)（曾误 int(-10,10)=Next(-10,11) 竖向差 1）
    tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
      strength: rng.int(5, 14), steps: rng.int(5, 9), type: -2,
      speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
    });
    if (rng.next() * 3 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
        strength: rng.int(10, 29), steps: rng.int(10, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
    }
    if (rng.next() * 5 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-15, 14), y + rng.int(-15, 9), {
        strength: rng.int(15, 29), steps: rng.int(5, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
    }
  }
  // ⑤ 随机小挖掘（w 个）
  for (let n = 0; n < w; n++) {
    gp?.set3(n / w, 0.75, 1);   // 进度锚：挖掘隧道尾段（估）
    tileRunner(st, rng, gs, rng.int(20, w - 21), rng.int(h - 180, h - 11), {
      strength: rng.int(2, 6), steps: rng.int(2, 6), type: -2,
    });
  }
  // ★IIIII14（cs:13850-13856）：drunk **或 remix** 中带（0.35w-0.65w）追加挖液
  // runner ×2w（type=-2 灌岩浆腔洞）——原版门谓词 `if (drunkWorldGen || remixWorldGen)`
  // （cs:13850），此前只接 drunk 分量 → REMIX 少 8400 个 runner 掷（r4 实证）。
  if (!!gs.seedFlags.drunkWorld || !!gs.seedFlags.remix) {
    for (let n = 0; n < w * 2; n++) {
      tileRunner(st, rng, gs,
        rng.int(Math.trunc(w * 0.35), Math.trunc(w * 0.65) - 1),
        rng.int(h - 180, h - 11),
        { strength: rng.int(5, 19), steps: rng.int(5, 9), type: -2 });
    }
  }
  // ⑥ 底部岩浆层（h-145/144 两行）
  for (let x = 0; x < w; x++) {
    for (const dy of [145, 144]) {
      const i = st.idx(x, h - dy);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  // ⑦ 地狱石脉（面积×0.0008）
  for (let n = 0, cnt = Math.trunc(w * h * 0.0008); n < cnt; n++) {
    tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(h - 140, h - 1), {
      strength: rng.int(2, 6), steps: rng.int(3, 6), type: HELLSTONE,
    });
  }
  void gs;
}

/** ★IIIII58：GenerateUnderworldStartingMound（cs:23823-23899，remix 专属）——
 *  出生 mound：x∈[(int)(w×0.38f), (int)(w×0.62f)) 熔岩海中央的灰烬陆桥。
 *  主循环逐列游走（下降 Next(1,4)-1 / 出带回升 / 中列外沿 Next(4)==0 抖动链），
 *  列身从 num3 到海底整柱 new Tile()→active+57；随后 [num,num2+15)×[h-300,h-115)
 *  液清+暴露灰烬草化、[h-200,h-115) 灰烬树。QuickWater(-2) 首尾各一。
 *  ★浮点陷阱：0.38f/0.62f 是 f32 字面量——4200×0.38f=1595.99998…截断为 1595，
 *  与 double 直乘差 1；必须 Math.fround 模拟。 */
export function generateUnderworldStartingMound(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const fmul = (a: number, b: number) => Math.fround(Math.fround(a) * Math.fround(b));
  const xLo = Math.trunc(fmul(w, 0.38));               // (int)((float)w * 0.38f)
  const xHi = Math.trunc(fmul(w, 0.62));               // (int)((float)w * 0.62f)
  const yStop = h - 135;                               // num4：mound 台地顶界
  const yTop = h - 160;                                // num5：抖动上界
  const halfL = Math.trunc(w / 2) - 5, halfR = Math.trunc(w / 2) + 5;

  // Liquid.QuickWater(-2)（进图首拍）
  {
    const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
    sim.isGeneratingOrLoadingWorld = true;
    sim.generatingWorld = true;
    // ★IIIII100d：同 UW-body——passRng 缺线会静默跳过级联帧引擎 case165
    sim.passRand = (max) => rng.nextInt(max);
    sim.passRng = rng;
    sim.genWaterLine = gs.waterLine;
    // ★IIIII58：REMIX 落水分型带（Liquid.cs:182-185 首臂）——同 settle/WorldGen 接线
    if (!!gs.seedFlags.remix) {
      sim.remixWaterRule = true;
      sim.remixLavaLine = gs.lavaLine;
      sim.remixRockLevel = gs.rockLevel;
      sim.remixOceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    }
    // ★IIIII62：LavaCheck 沙漠 blast 门旗标（Liquid.cs:1457）——remix/dual 不喷洒
    sim.remixWorldGen = !!gs.seedFlags.remix;
    sim.dualDungeonsSeed = !!gs.seedFlags.dualDungeons;
    sim.quickWater();
    sim.dispose();
  }

  let colY = h - 1;                                    // num3
  let landed = false;                                  // flag
  let i = xLo;
  while ((colY < h - 1 || i < xHi) && i < w) {
    if (!landed) {
      colY -= rng.int(1, 3);                           // Next(1,4)
      if (colY < yStop) landed = true;
    } else if (i >= xHi) {
      colY += rng.int(1, 3);
      if (colY > h - 1) colY = h - 1;
    } else {
      if ((i <= halfL || i >= halfR) && rng.int(0, 3) === 0) {
        if (rng.int(0, 2) === 0) colY += rng.int(-1, 1);
        else if (rng.int(0, 5) === 0) colY += rng.int(-2, 2);
        else if (rng.int(0, 7) === 0) colY += rng.int(-4, 4);
      }
      if (colY < yTop) colY = yTop;
      if (colY > yStop) colY = yStop;
    }
    // 柱顶上方 20 格清液（cs:23863 for(num6=num3;>num3-20;--))
    for (let q = colY; q > colY - 20 && q >= 0; q--) st.liquid[st.idx(i, q)] = 0;
    // 整柱 new Tile() → active+ash（全字段重置：墙/电路/液体/帧/漆全清）
    for (let j = colY; j < h; j++) {
      const ii = st.idx(i, j);
      st.type[ii] = ASH; st.flags[ii] = 1;
      st.wall[ii] = 0; st.wire[ii] = 0;
      st.liquid[ii] = 0; st.liquidType[ii] = 0;
      st.half[ii] = 0; st.slope[ii] = 0;
      st.frameX[ii] = 0; st.frameY[ii] = 0;
    }
    i++;
  }

  // Liquid.QuickWater(-2)（填柱后）
  {
    const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
    sim.isGeneratingOrLoadingWorld = true;
    sim.generatingWorld = true;
    // ★IIIII100d：同 UW-body——passRng 缺线会静默跳过级联帧引擎 case165
    sim.passRand = (max) => rng.nextInt(max);
    sim.passRng = rng;
    sim.genWaterLine = gs.waterLine;
    // ★IIIII58：REMIX 落水分型带（Liquid.cs:182-185 首臂）——同 settle/WorldGen 接线
    if (!!gs.seedFlags.remix) {
      sim.remixWaterRule = true;
      sim.remixLavaLine = gs.lavaLine;
      sim.remixRockLevel = gs.rockLevel;
      sim.remixOceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    }
    // ★IIIII62：LavaCheck 沙漠 blast 门旗标（Liquid.cs:1457）——remix/dual 不喷洒
    sim.remixWorldGen = !!gs.seedFlags.remix;
    sim.dualDungeonsSeed = !!gs.seedFlags.dualDungeons;
    sim.quickWater();
    sim.dispose();
  }

  // [num, num2+15) × [h-300, h-115)：清液 + 暴露灰烬草化（8 邻任一非活性）
  for (let k = xLo; k < xHi + 15 && k < w; k++) {
    for (let l = h - 300; l < yStop + 20; l++) {
      const ii = st.idx(k, l);
      st.liquid[ii] = 0;
      if (st.type[ii] !== ASH || !st.flags[ii]) continue;
      let exposed = false;
      for (let ox = -1; ox <= 1 && !exposed; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(k + ox, l + oy)) { exposed = true; break; }
          if (!st.flags[st.idx(k + ox, l + oy)]) { exposed = true; break; }
        }
      }
      if (exposed) st.type[ii] = ASH_GRASS;
    }
  }
  // [h-200, h-115)：灰烬树（Next(3)==0）
  for (let m = xLo; m < xHi + 15 && m < w; m++) {
    for (let n = h - 200; n < yStop + 20; n++) {
      const ii = st.idx(m, n);
      if (st.type[ii] !== ASH_GRASS || !st.flags[ii]) continue;
      if (n - 1 < 0 || st.flags[st.idx(m, n - 1)]) continue;
      if (rng.int(0, 2) === 0) growAshTree(st, rng, m, n);
    }
  }
}

/**
 * ⑧ 灰烬草 633 + 灰烬树 634（cs:13869-13915 原为 pass 内联段，★IIIII14 抽出以便
 * drunk 的时序移位）。普通世界：**外缘 17% 带**、AddHellHouses **前**（原序不变）；
 * drunk 世界（cs:13876 `else if (!drunkWorldGen)` 跳过 + cs:13906 追加段）：
 * AddHellHouses **后**、**全图**同链——残屋环上照长灰烬草/灰烬树。
 * ★IIIII58：REMIX 走 GenerateUnderworldStartingMund 分支（cs:13874），此两支皆跳。
 */
export function underworldAshGrassTrees(st: TileStore, rng: RNG, gs: GenState, full: boolean): void {
  const { w, h } = st;
  const outer = (x: number) => full || x < w * 0.17 || x > w * 0.83;
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    // ★条件内 Next(-1,2) 每迭代重掷（原版 cs:13870 for 条件逐次求值）——
    //   曾按每列一掷实现，漏 ~20 万掷使尾段树/地狱屋流整体错位
    for (let y = h - 300; y < h - 100 + rng.int(-1, 1); y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH || !st.flags[i]) continue;
      let exposed = false;
      for (let ox = -1; ox <= 1 && !exposed; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(x + ox, y + oy)) { exposed = true; break; }
          if (!st.flags[st.idx(x + ox, y + oy)]) { exposed = true; break; }
        }
      }
      if (exposed) st.type[i] = ASH_GRASS;           // 8 邻任一暴露（含界外）
    }
  }
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    for (let y = h - 200; y < h - 50; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH_GRASS || !st.flags[i]) continue;
      if (y - 1 < 0 || st.flags[st.idx(x, y - 1)]) continue;
      if (rng.int(0, 2) === 0) growAshTree(st, rng, x, y);   // Next(3)==0 → TryGrowingTreeByType(634)
    }
  }
}
