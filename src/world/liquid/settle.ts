// 全图液体沉降（从 Game.settleLiquids 平移的纯函数，主线程 fallback 与 worker 共用）。
// mode='gen'（新建世界）：原版 WorldGen pass 49/97 Settle Liquids（WorldGen.cs:16215+）——
//   外层 10 轮跑到收敛，每轮上限 活量×5，清除生成期晚到的回流（漏斗入口等）。
//   尾部 finalGenMergeCheck = 原版最终 pass 的全图 LiquidCheck(createMergeTilesDuringGen:
//   true)（WorldGen.cs:22639-22650）：生成期常规交互只做类型 strip 不落块，唯独这一步
//   允许残余静态接触结块。原版挂在终 pass；本仓库 gen 管线无对应终 pass，挂在 gen 模式
//   尾部——pass 49 中途沉降也会各跑一次（时点略早于原版；金标 9293480 两侧均 0 块一致）。
// mode='load'（读档）：原版 WorldFile.cs:738-770 时序 1:1——单轮上限 100000，
//   不收敛的少量残留活水交给运行时（尾部 WaterCheck），与原版一致（无外层循环）。
// yield 按真实耗时让出（≥32ms 一次）——worker 内也保留，让 progress postMessage 流出。
import type { World } from '../World';
import { LiquidSim } from './LiquidSim';
import { snapshotGenSolid } from '../gen/vanilla/GenSolid';
import type { RNG } from '../../core/rng';

export async function settleWorldLiquids(
  world: World,
  mode: 'gen' | 'load',
  onProgress?: (p: number) => void,
  /** pass 链 RNG（生成管线槽传入）：gen 模式沉降的掷骰（254→255 Next(30)/KillTile
   *  尘掷族）走 pass 链流——原版 gen 期 genRand≡Main.rand 同对象，#97 二次沉降
   *  自身耗掷 55,987（passchain stream 定标）。缺省=私有 mulberry32（兼容路径） */
  rng?: RNG,
  /** 原版 #49 SettleLiquids 头的 oceanDepths 液体类型归水全扫（cs:16222-16229）。
   *  ★仅 pass 49 有——#97 SettleLiquidsPart2（cs:21051）无此前导（QuickCleanup
   *  cs:18005 有自己的窗口版）；由 liquidSettlePass 置 true，worker 尾部二次
   *  沉降保持缺省 false。DDDDD 批补齐（四链现值该域无非水液体=惰性 1:1） */
  oceanStrip = false,
): Promise<void> {
  if (oceanStrip && mode === 'gen') {
    // cs:16222-16229：全图（0..w × 0..h）扫描，oceanDepths（cs:10978：y ≤
    // oceanLevel=(worldSurface+rockLayer)/2+40 且 x < 380 || x > w-380）内
    // 液体>0 且类型≠水 → 归水。liquidType(0) 只写类型位不动量
    const st = world.store;
    const oceanLevel = (world.groundLevel + world.rockLevel) / 2 + 40; // cs:4393
    for (let x = 0; x < st.w; x++) {
      const inBand = x < 380 || x > st.w - 380;    // beachDistance=380（cs:4102）
      if (!inBand) continue;
      for (let y = 0; y < st.h; y++) {
        if (y > oceanLevel) break;                 // cs:10980 double 比较（整数 y 等价）
        const i = y * st.w + x;
        if (st.liquid[i] > 0 && st.liquidType[i] !== 1) st.liquidType[i] = 1;
      }
    }
  }
  const sim = new LiquidSim(world);
  if (rng) sim.passRand = (max) => rng.nextInt(max);
  // XXXXX 批：级联帧引擎掷骰源（与 passRand 同一实例——int/nextInt/next 同流）
  sim.passRng = rng ?? null;
  // isGeneratingOrLoadingWorld（WorldGen.cs:11089 / WorldFile.cs:738）：生成与读档
  // 两态都置位——CreateLiquidMergeTile 走 LiquidOverwriteStrip 分支不落块（防沉降期
  // 全图结黑曜石），运行期由 Game.liquid 保持 false 走落块路径
  sim.isGeneratingOrLoadingWorld = true;
  // 生成期标记：QuickWater 首尾跑 ShimmerRemoveWater（Liquid.cs:105-141 的
  // isGeneratingOrLoadingWorld 分支；读档 generatingWorld=false 该步骤早退）
  if (mode === 'gen') {
    sim.generatingWorld = true;
    sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
    // ★落水越 waterLine 转岩浆（Liquid.cs:177-190，H 批备案的缺口）：非蜜/微光液体
    //   下落到 y>waterLine → 岩浆（世界生成期深洞岩浆池来源）。读档期原版置
    //   maxTilesY 天然豁免（WorldFile.cs:739）→ 不设值即同义。地牢豁免：落点在
    //   outerPotentialDungeonBounds 半图盒内且水源墙 ∈ wallDungeon{7,8,9,94-99}
    //   （Main.cs:10507-10515）→ 回水（:186-188）
    if (world.genWaterLine > 0) {
      sim.genWaterLine = world.genWaterLine;
      const d = world.genDungeonExempt;
      if (d) {
        sim.dungeonWaterExempt = (x, y, w) =>
          x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
          && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
      }
    }
    // 生成期 Main.tileSolid 覆写快照注入（裂纹砖 481-483=false/484=false/192=false 等
    // ——原版液体模块读被各 pass 改写后的全局面板，solidNP LUT 须同步）。★先注入
    // 再 wg 包裹——wg 快照须含覆写（否则 191=true 覆写会在 wg(false) 复原时翻回实心）
    sim.applyGenSolidOverrides(snapshotGenSolid());
    // Liquid.worldGenTilesIgnoreWater(true)（cs:21067/16239，pass 委托首）：10 关闭门/
    // 190/191/192 全程非实心；pass 尾（轮环后、quickSettle=false 之后）恢复（cs:21110/16293）
    sim.worldGenTilesIgnoreWater(true);
  }
  onProgress?.(0.05);
  sim.quickWater();
  onProgress?.(0.35);
  await new Promise((r) => setTimeout(r, 0));
  sim.waterCheck();
  sim.quickSettle = true;
  // 轮上限：读档 = WorldFile 单轮 100000（L752）；生成期 = 每轮 活量×5（WorldGen.cs:16252 num5）
  const MAX_ROUNDS = mode === 'gen' ? 10 : 1; // 读档无外层循环（WorldFile.cs:746-762）
  let iter = 0;
  let lastYield = performance.now();
  // 原版收敛比例(:755-762 与生成期 :16274-16277 同式):num5=初始活量(活量回升则抬升),
  // p=(num5-当前)/num5 单调不减——生成期 progress.Set(num6/3+0.33)、读档 50%+num7*50%
  let num5 = sim.numLiquid + sim.bufferLen;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // ★vanilla 轮上限 = 轮始活量×5（:16252/21079 num3*5）——无下限。#97 x86 实证：
    //   尾轮 2 振子格 numLiquid=2 → 每轮恰 10 迭代打满预算 break（下限 1000 会多跑
    //   8×990 迭代 = 掷流/末态双漂移）。无提前收敛出口（10 轮恒跑满:轮尾 WaterCheck
    //   每轮都能把稳定浅洼重新激活）
    const MAX_ITER = mode === 'gen' ? (sim.numLiquid + sim.bufferLen) * 5 : 100000;
    let roundIter = 0;
    while (sim.numLiquid > 0 && roundIter < MAX_ITER) {
      sim.updateLiquid();
      iter++; roundIter++;
      if (roundIter % 2000 === 0) {
        const cur = sim.numLiquid + sim.bufferLen;
        if (cur > num5) num5 = cur;
        onProgress?.(num5 > 0 ? (num5 - cur) / num5 : 0);
        if (performance.now() - lastYield >= 32) {
          await new Promise((r) => setTimeout(r, 0));
          lastYield = performance.now();
        }
      }
    }
    // ★load 模式跳过轮尾扫描(原版 WorldFile.cs:738-770 只有一次终态 WaterCheck;
    // 轮尾扫描是生成期 pass 49 十轮结构 :16286 的,load 单轮下与终态背靠背白跑一次全图)
    if (mode === 'gen') sim.waterCheck();
    // vanilla 无收敛早退（:16259 while(num<10) 恒 10 轮;load 单轮同义）——JS 曾有的
    // `numLiquid===0 break` 掐掉了尾轮 WaterCheck 反复再激活的流掷尾段
  }
  sim.quickSettle = false;
  // 原版 pass 尾恢复（cs:21110/16293：worldGenTilesIgnoreWater(false)——在 ClearPendingLiquid
  // 之后）；finalGenMergeCheck（本仓 #102 补挂段）按原版 Finish 时点在恢复之后跑。
  sim.worldGenTilesIgnoreWater(false);
  // ★尾部 WaterCheck 仅读档路径有（WorldFile.cs:765-769：quickSettle=false → WaterCheck →
  //   isGeneratingOrLoadingWorld=false；该路径全程未开 worldGenTilesIgnoreWater 窗口）。
  //   生成期两 pass（cs:16286-16293 / 21109-21113）在 worldGenTilesIgnoreWater(false)
  //   恢复后【无任何 WaterCheck】直接结束——若恢复后补跑一次，10/190/191/192（关门门/
  //   蘑菇块/活木/活叶）已翻回实心，轮内合法驻留其间的水/岩浆会被 clear 分支整片抹零
  //   （#49 残差 L=47 根因：丛林活木 191 河床水池被尾部 WC 清空，vanilla 末态保留
  //   238/255——x86 对拍实证）
  if (mode === 'load') sim.waterCheck();
  // ★DDDDDD 批（2026-08-21）归位：全图 LiquidCheck(createMergeTilesDuringGen:true)
  //   （WorldGen.cs:22639-50）原版挂在 **FinalCleanup pass 体末**（cs:22304 委托内、
  //   ShimmerCleanUp 之后）——曾挂在 #49/#97 沉降尾（时点早 8 pass，"管线无终 pass"
  //   时代的备案；金标四链该域两侧均零接触故隐身）。现由 WorldGen 终清理槽直调
  //   finalGenMergeScan()，settle 本体恢复 #49/#97 strip-only 原版口径。
  sim.dispose();
  onProgress?.(1);
}

/** 生成收尾全图 LiquidCheck(createMergeTilesDuringGen:true)（WorldGen.cs:22639-50，
 *  FinalCleanup pass 体末、ShimmerCleanUp 之后）——DDDDDD 批从 settleWorldLiquids
 *  尾归位到本独立入口，由 WorldGen 终清理槽在 runFinalCleanupPass 之后直调。
 *  sim 装配口径=settle 尾态：gen-solid 覆写注入（LUT 同步）+ wg 窗关（#97 已恢复）
 *  + isGeneratingOrLoadingWorld/generatingWorld 置位（createMergeTile 落块分支）。
 *  ★收 store 参（LiquidSim 全程只读 world.store——探针基座重放路径无 World 壳）。 */
export function finalGenMergeScan(store: World['store'], rng?: RNG): void {
  const sim = new LiquidSim({ store } as World);
  if (rng) sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng ?? null;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.applyGenSolidOverrides(snapshotGenSolid());
  sim.finalGenMergeCheck();
  sim.dispose();
}
