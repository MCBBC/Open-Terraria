// ★v9.8 根治刀退役态回归锁(2026-10-07,用户明令「最简条件(暂停零渲染负载)下帧率
//  都不稳=算法本身有问题,需要根治」):渲染决策=纯时间门,k 迁移机制整体退役。
//  定谳链(FrameBeat.ts 头注 v9.8):暂停态 rAF 回调流 ≈132/s 超 vsync、间隔 4-9.4ms
//  宽分布(BeginFrame 合并/分裂+超速 ticker)、主线程全程闲——「回调=vsync 网格」假设
//  系统性失效:est(截尾均值)被流形态污染 → minK 门槛翻转 → k 1↔2 = 95-110 波动/
//  120 穿越/暂停振荡等一切历史帧率不稳实报的公共根因;且 k 迁移(对齐语义)与 v6 帧
//  率优先政策(不齐但高优先)自相矛盾——政策既然选了"不齐但高",对齐机制便没有存在
//  理由,只剩 est 抖动驱动 k 翻转这一条实害输出。本文件判据面整体翻正:
//  - 旧 k 迁移语义锁(v1 网格地板判别器/v4 flap/v5-v6 降档线/v7 失拍对齐豁免/v7.1
//    双门/v9.6 棘轮/v9.7 滞回的行为锁)退役=实验轨史档(git 历史+FrameBeat.ts 头注
//    v1-v9.7 各注可考);红判别器族收敛为「变异证红」块:OldMigrationBeat 覆写
//    migrationEnabled 钩+旧序数 shouldRender=「回退到旧 k 迁移」的机械变异,振荡形态
//    复现=红;退役态同流零迁移=绿。
//  - 退役态回归锁=时间门四形态(①干净流恒屏率 ②超速流跟满稳 ③render-bound 帧距=
//    帧耗 ④暂停+云尖峰零振荡)+cap 执法量化+k 恒 1+估计器诊断面(v9.5 清退态原样
//    保留,est 不驱动决策只喂 F5/snapshot)。
//  - GUARD 标定面(TARGET_GUARD_MS=4.5,标定算术见头注 v9.8;初始处方 0.5-1ms 被否决):
//    真实流零咬合(阈 3.83<LIVE corpus 最短间隔 3.9=跟满)+多回调拍抖动带外(cap60@
//    120Hz 两回调拍合计 [15.0,18.3] vs 阈 12.17=零延拍)+cap 值域 {60,120,0} 在
//    60/120Hz 屏全正确量化。
// ★v9.9 相位锚定调度翻正(2026-10-07,同日收口刀;FrameBeat.ts 头注 v9.9):v9.8 纯
//  时间门在超速流上「跟满 125-132」=用户主诉面(fps 读数高于 cap)。本文件语义锁整体
//  翻正为累计器相位锚定:shouldRender=now ≥ _nextDue − DUE_GUARD_MS(0.75,只防 rAF
//  时间戳抖动)、beginRender 相位推进 _nextDue=max(_nextDue+target, now)(慢流重锚不
//  追讨/快流恒 +target=限速)、resetSampling/cap 变更重锚 _nextDue=−1;k 迁移退役与
//  v9.7 hold 均保留。翻正映射:①形态①干净流=锁相 vsync(±10% 抖动残 skip≤1%=相位
//  游走重锁 16.7 顺延帧,GUARD 扫描 0.75-2.0 恒 16-18 跳=非阈值带病);②形态②超速
//  流「跟满 125-132」→「限速 120」(LIVE 流渲染 342/359、读数 p50 119.9 无 130 段);
//  ③形态④暂停段帧距=重锚顺延 {4.5,9,13.5} 有界零振荡;④诚实边界②③(240Hz 跟满/
//  深超速跟满 182)→「限速 120」(累计器不随屏率超 cap);⑤GUARD 语义=干净流零跳变
//  (无余量变异在 due 刀刃上被 fp/时间戳亚毫秒抖动打穿=红)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FrameBeat, GRID_MS, TARGET_GUARD_MS, DUE_GUARD_MS, UPGRADE_WIN_SAMPLES, UPGRADE_HOLD_WINDOWS, UPGRADE_HEADROOM, DOWNGRADE_MARGIN, MISS_SLACK, MISS_GRID_TOL_REL, MISS_GRID_TOL_MS, MISS_STREAK_DOWNGRADE, MISS_STALL_BUDGET_MS, FLOOR_HOLD_WINDOWS, trimmedMeanVsync } from '../src/core/FrameBeat';

const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const BEAT = readFileSync(new URL('../src/core/FrameBeat.ts', import.meta.url), 'utf8');

/** 确定性 LCG(单测须可复现,禁 Math.random) */
function lcgOf(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

const HZ120 = 1000 / 120;
const HZ60 = 1000 / 60;

/** 显示网格 interval 流(按绝对网格步索引;变异/现役共享同一物理显示节拍=公平 A/B) */
function makeIntervals(vsync: number, jitter: number, n: number, seed: number) {
  const lcg = lcgOf(seed);
  return Array.from({ length: n }, () => vsync * (1 + jitter * (2 * lcg() - 1)));
}

/** 重场景成本形态:基础 4ms,25% 帧尖峰 12ms(双峰) */
const costFn = (lcg: ReturnType<typeof lcgOf>) =>
  () => (lcg() < 0.25 ? 12 : 4);

/** 稳态切取(按时间):去预热段 */
const steady = (rendered: number[], t0: number) => rendered.filter((t) => t >= t0);

/**
 * 引擎驱动器:回调时间流喂 FrameBeat,返回渲染帧起点序列。
 * 回调时点模型(真实 Chrome):rAF 只在「上一回调之后的下一网格点」触发;渲染超支
 * 越过网格点时,迟帧的回调在解堵点(busy)即跑,再下一回调回到网格——时间戳单调。
 * make:引擎工厂(变异证红 A/B 用)。
 */
function runBeat(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
  make?: () => FrameBeat;
  onRender?: (beat: FrameBeat, t: number) => void;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0, make = () => new FrameBeat(), onRender } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const beat = make();
  let step = 0;
  let grid = 0;
  let busy = 0;
  let prevT = -1;
  const rendered: number[] = [];
  for (let i = 0; i < callbacks; i++) {
    while (grid <= prevT) grid += intervals[step++ % intervals.length];
    const t = Math.max(grid, busy);
    prevT = t;
    beat.observeVsync(t, cap);
    if (beat.shouldRender(t)) {
      beat.beginRender(t);
      rendered.push(t);
      const c = typeof cost === 'function' ? cost(i, t) : cost;
      busy = t + c;
      beat.endRender(t + c);
      onRender?.(beat, t);
    }
  }
  return { beat, rendered };
}

/** 修前行为复刻(初版调度刃【之前】的 Game.ts start()/frame() 逐行对译;被动门+SuppressDraw) */
function runOld(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0 } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const FIXED = GRID_MS / 1000;
  let step = 0;
  let grid = 0;
  let busy = 0;
  let prevT = -1;
  let lastCapTs = 0;
  let lastTime = 0;
  let acc = 0;
  const rendered: number[] = [];
  for (let i = 0; i < callbacks; i++) {
    while (grid <= prevT) grid += intervals[step++ % intervals.length];
    const t = Math.max(grid, busy);
    prevT = t;
    // 旧被动 frameCap 门(原式:cap>0 且 1000/cap-1ms 未到即跳)
    if (cap > 0 && t - lastCapTs < 1000 / cap - 1) continue;
    lastCapTs = t;
    // frame() 逻辑面:累计器恒 60Hz + subtle 0 步进帧 SuppressDraw(旧分支)
    const dtMs = t - lastTime;
    lastTime = t;
    acc += Math.min(dtMs / 1000, 0.25);
    let steps = 0;
    while (acc >= FIXED && steps < 5) { acc -= FIXED; steps++; }
    if (steps === 0) continue; // 旧 SuppressDraw:0 步进帧不重绘
    rendered.push(t);
    const c = typeof cost === 'function' ? cost(i, t) : cost;
    busy = t + c;
  }
  return { rendered };
}

/** 帧距序列指标:p50/均值/标准差/跳变次数(|相邻帧距差|>jumpMs);mean 供 realized
 *  fps(1000/mean)判读 */
function gapStats(rendered: number[], jumpMs = 4) {
  const gaps: number[] = [];
  for (let i = 1; i < rendered.length; i++) gaps.push(rendered[i] - rendered[i - 1]);
  const s = [...gaps].sort((a, b) => a - b);
  const p50 = s[Math.floor(s.length / 2)] ?? 0;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
  let jumps = 0;
  for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > jumpMs) jumps++;
  return { p50, std, jumps, gaps, mean };
}

/** 60 渲染帧滚动 fps 序列(Game.frameDts 读数口径) */
function fpsSeries(rendered: number[], win = 60) {
  const gaps: number[] = [];
  for (let i = 1; i < rendered.length; i++) gaps.push(rendered[i] - rendered[i - 1]);
  const fps: number[] = [];
  for (let j = win; j < gaps.length; j++) {
    let sum = 0;
    for (let k = j - win; k < j; k++) sum += gaps[k];
    fps.push(1000 / (sum / win));
  }
  return fps;
}
const q = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

// ── ★真实 trace 回放流(Trace-20260929T164816 @localhost:4173,主线程 rAF 序列实拍;
//    饱和回声流)——变异证红 A/B 语料(红=旧迁移面 flap 复现;绿=退役态零迁移)──
const DELTAS_X10 = [124,122,104,123,160,135,114,95,119,96,155,124,126,116,95,115,97,128,129,133,95,147,120,125,93,165,122,131,96,121,122,106,120,118,117,93,117,97,143,129,131,134,97,132,125,100,145,131,134,94,130,122,135,96,143,117,100,128,122,125,90,130,139,124,96,115,143,95,122,152,129,120,115,120,95,123,122,124,116,123,140,123,98,121,116,93,120,115,158,114,116,94,128,126,121,108,121,114,93,119,126,94,117,116,91,142,116,116,93,159,116,91,118,116,94,113,145,97,128,117,95,125,111,129,125,119,92,120,119,121,95,136,109,121,94,119,126,91,128,127,120,122,127,125,90,119,121,95,114,113,91,117,89,133,127,95,127,148,139,122,94,124,120,90,122,114,87,140,112,92,125,122,104,116,134,138,94,144,153,122,106,131,117,93,134,153,152,155,157,147,149,149,201,218,119,123,96,118,121,96,118,91,114,93,134,139,115,122,97,120,115,92,129,137,98,122,117,120,97,124,128,98,138,124,92,117,117,98,123,118,106,119,112,96,113,137,126,94,115,123,118,113,117,91,124,121,90,116,100,127,132,125,98,129,118,126,99,162,118,126,88,146,115,97,126,120,89,124,117,128,90,120,118,97,143,115,101,118,145,123,96,122,124,97,161,127,142,118,96,126,118,113,124,122,98,128,123,123,94,141,118,111,126,124,115,118,131,139,139,99,126,128,120,94,121,129,97,124,125,99,138,116,97,114,124,114,121,113,116,101,117,123,96,132,134,123,96,121,128,94,132,140,143,92,126,129,95,123,121,104,132,128,121,99,134,129,124,94,143,123,99,121,158,119,109,116,175,122,103,124,121,101,123,125,122,131,122,117,102,128,128,122,137,118,94,97,119,141,137,124,90,149,122,96,117,127,125,123,90,91,117,118,135,136,92,120,95,119,125,143,137,122,120,122,121,94,128,142,90,119,96,123,122,122,96,169,124,123,120,94,117,120,93,120,120,94,127,127,90,124,127,89,133,139,119,94,166,133,125,96,115,116,91,113,96,119,115,113,93,129,135,85,119,124,95,111,125,88,138,112,85,134,117,90,109,87,132,113,144,87,115,114,86,115,86,135,121,84,111,115,89,130,127,91,104,81,125,87,111,115,84,129,121,108,78,112,130,83,129,115,198,115,114,127,101,126,103,110,80,108,85,110,112,81,103,81,116,113,86,117,81,107,111,111,112,107,81,133,93,112,106,83,105,93,114,106,84,107,93,115,105,80,104,105,102,100,80,108,118,106,109,77,120,102,77,104,81,102,79,105,106,73,107,96,102,103,102,121,75,102,74,98,74,102,98,76,109,75,118,72,99,72,105,75,105,103,100,106,81,132,80,109,78,106,114,77,116,79,104,95,107,103,77,108,84,140,110,109,76,102,88,101,102,81,105,75,104,97,106,108];
const COSTS_X10 = [107,88,107,143,118,98,80,105,83,132,107,110,102,81,101,77,108,110,117,81,133,103,108,79,150,105,116,81,106,107,80,105,104,102,77,103,80,127,108,109,120,82,115,111,84,129,115,121,80,114,108,119,80,130,101,83,112,106,108,76,113,123,108,82,99,127,79,107,132,110,104,101,105,81,108,105,110,102,109,125,109,84,105,100,77,105,77,144,99,102,79,114,110,104,77,105,100,78,103,109,78,100,99,76,129,102,101,79,142,101,78,101,100,80,98,127,81,112,101,76,106,96,93,106,101,77,103,104,107,81,121,96,105,78,99,112,77,112,106,104,107,101,110,77,101,105,80,100,99,74,103,74,117,110,79,99,132,123,107,80,107,101,75,104,100,73,117,96,78,107,107,81,98,119,123,78,126,136,105,90,113,100,78,119,139,136,136,138,129,132,134,125,198,101,109,81,104,103,76,103,77,97,76,117,124,97,107,82,102,98,76,103,119,80,103,98,104,81,108,111,84,124,109,77,99,104,77,104,103,78,104,98,80,99,121,111,81,101,109,99,98,104,77,108,106,77,101,85,108,113,107,81,112,101,110,84,146,101,111,74,131,101,83,109,103,76,111,101,113,78,101,101,83,129,101,79,102,127,106,78,104,108,80,140,108,124,101,81,110,104,97,107,104,80,111,105,106,80,125,104,94,109,110,82,102,115,119,125,81,110,105,105,80,105,113,79,108,109,83,121,102,83,98,107,97,107,99,101,87,103,106,81,118,114,106,81,104,111,80,112,123,128,76,107,113,81,105,106,82,117,109,106,83,118,109,107,78,125,107,82,105,141,104,91,100,107,107,81,106,107,83,105,109,108,99,108,102,81,111,114,108,122,103,79,81,99,122,121,109,75,135,107,79,102,111,110,107,77,77,101,100,105,122,75,103,79,102,109,128,76,108,104,105,104,79,104,127,76,105,77,106,103,107,79,144,109,104,103,78,100,102,78,101,103,77,103,113,74,107,112,73,113,123,101,76,149,111,108,81,100,100,75,99,78,103,100,94,76,110,120,71,100,109,76,96,109,73,122,97,72,102,101,75,94,74,115,97,126,73,99,98,71,100,71,120,106,70,96,99,73,114,113,73,91,68,111,72,95,99,69,114,103,93,65,97,111,69,113,101,183,95,99,111,86,112,84,95,65,93,69,90,93,64,88,66,93,98,68,100,65,91,93,95,97,91,62,118,66,96,91,68,90,68,95,91,70,92,67,99,88,62,88,87,86,86,63,93,62,86,94,61,104,86,61,87,66,87,64,86,90,58,92,82,86,64,84,105,59,86,59,84,60,82,83,61,88,60,103,58,83,55,87,60,90,84,84,84,56,112,60,91,63,88,96,61,99,62,87,57,89,85,62,93,68,124,91,93,61,87,57,82,85,64,88,59,89,58,90,91,61];

// ── ★真实实报流(Trace-20261006T033001,用户机 subtle+cap120)──
//  主循环链 rAF FunctionCall 实拍,s10-s13 在册稳态切片(无 stall,max delta 13.5ms)。
//  DELTAS=相邻回调间隔 ×10(含 3.9-7.2ms merge/split 短回调=v9.4 门咬合带样本);
//  COSTS=渲染帧成本 ×10(0=原会话被门 skip 的 tick)。v9.8 时间门形态②语料:
//  阈 3.83 < 最短间隔 3.9 = 零咬合跟满(头注 v9.8 GUARD 标定①)。
const LIVE_DELTAS_X10 = [65,72,81,88,87,86,75,81,88,78,84,90,77,81,67,81,68,83,48,91,127,83,103,105,95,74,77,81,84,79,87,86,79,81,83,85,91,82,58,68,80,87,53,70,74,79,81,86,79,87,84,68,78,90,57,61,83,76,80,74,83,83,85,76,66,81,59,85,69,78,79,83,78,79,78,84,91,63,80,76,65,73,87,82,66,76,78,89,75,89,63,79,68,91,65,76,79,75,69,89,76,82,89,77,84,92,94,70,79,91,82,77,83,86,87,76,92,90,68,85,90,83,63,88,71,54,80,79,68,91,80,115,48,82,73,82,86,90,76,82,70,88,54,84,76,87,56,85,79,75,83,84,80,71,73,65,99,130,78,55,97,95,135,61,58,83,90,79,84,82,82,65,83,60,84,87,54,68,73,86,89,79,87,83,75,88,84,80,85,92,82,75,91,86,81,84,60,85,129,82,65,80,85,89,78,84,79,86,86,88,79,81,83,81,69,63,75,93,49,79,77,77,75,82,86,90,75,84,100,77,77,84,80,70,81,64,77,94,51,66,90,81,86,73,84,89,80,79,94,79,86,85,64,86,65,84,63,67,73,85,72,85,79,88,86,86,86,82,75,83,83,91,85,75,87,80,84,77,71,71,92,62,82,82,110,92,97,79,94,76,83,89,87,74,84,77,73,66,81,91,39,85,74,80,87,79,84,83,91,83,74,94,82,79,66,90,56,94,75,65,63,77,80,92,73,87,80,75,86,51,90,61,81,87,67,82,72,82,84,87,65,89,60,84,70,77,81,67,75,89,79,85,75,76,62,75,89,63,73];
const LIVE_COSTS_X10 = [0,48,43,52,45,63,40,52,41,50,40,52,44,59,38,66,38,60,40,0,50,59,40,83,43,51,47,48,42,53,44,55,42,49,38,47,41,51,43,0,51,53,37,45,61,43,50,40,63,45,56,45,54,40,49,37,42,53,42,49,38,54,41,56,40,50,40,0,49,43,53,39,51,39,63,39,60,51,0,64,0,53,44,53,44,65,41,60,40,51,39,0,51,55,41,64,42,44,57,46,66,45,65,44,52,46,69,44,64,45,54,43,53,45,55,42,61,44,51,40,49,42,46,0,62,0,41,61,43,49,41,50,39,49,38,45,41,61,40,59,38,48,39,0,52,43,48,0,60,41,56,40,54,37,49,36,46,40,59,42,0,50,48,51,0,43,48,41,59,43,56,39,45,37,0,57,0,47,42,49,38,55,39,48,37,49,42,50,43,50,41,47,39,53,40,47,43,0,51,59,56,0,42,46,40,47,37,48,43,47,40,48,38,48,38,55,0,49,39,42,50,40,49,38,60,39,50,40,46,38,59,41,60,38,50,40,0,51,0,51,42,50,47,53,42,63,45,53,42,61,40,48,42,0,54,0,54,43,53,42,50,39,48,41,55,39,49,43,47,40,61,42,48,41,60,40,53,41,50,38,71,40,57,39,53,39,49,40,50,46,50,44,53,43,61,41,49,39,49,51,0,52,43,46,42,48,41,51,41,50,44,50,44,50,39,52,42,0,64,52,37,40,47,39,57,42,60,40,77,41,0,51,41,50,44,47,39,55,39,65,40,53,38,0,47,58,39,46,53,40,67,42,51,41,54,0,52,44,40,55];

// ── ★v9.8 变异体(红判别器):「回退到旧 k 迁移」的机械复刻──
//  覆写 migrationEnabled 钩=true(整链恢复 v9.7 迁移决策面:容量扫拍/minK 地板/滞回
//  升拍/失拍降档)+ 旧序数落拍 shouldRender(k/ordinal 回到渲染决策面)。退役理由与
//  振荡定谳链见 FrameBeat.ts 头注 v9.8。
class OldMigrationBeat extends FrameBeat {
  protected override migrationEnabled(): boolean { return true; }
  override shouldRender(now: number): boolean {
    if (this.ordinal < this.k) return false;
    if (this.k * this.vsyncPeriod >= this.targetMs() - TARGET_GUARD_MS) return true;
    return now - this.lastRenderAt >= this.targetMs() - TARGET_GUARD_MS;
  }
}

/** 修前(v1=60Hz 网格地板)复刻:targetMs 的网格地板——digest 修前/修后对照的旧侧。 */
class OldGridFloorBeat extends OldMigrationBeat {
  private gridCap = 0;
  override observeVsync(now: number, cap: number): void {
    this.gridCap = cap;
    super.observeVsync(now, cap);
  }
  override targetMs(cap = this.gridCap): number {
    return Math.max(GRID_MS, cap > 0 ? 1000 / cap : 0);
  }
}

/** 修前(v4=升拍 p50 制)复刻:v4 失效形态(边界震荡 1↔2 flap)的旧判据组——
 *  p95 扫拍降+无余量升,经迁移面复活后与退役态 A/B。 */
class OldV4Beat extends OldMigrationBeat {
  override capacityBreach(): boolean {
    return this.costP95() > this.budget();           // v4 降拍:p95 扫拍
  }
  override upgradeCleared(): boolean {
    return this.costP50() < this.budget(this.k - 1); // v4 升拍:无余量
  }
}

/** 估计器红判别器旧侧(截尾均值;现役本体即此——诊断面逐位一致锁的参照) */
class LegacyEstBeat extends FrameBeat {
  protected override estimateVsync(): number {
    return this.legacyEstimate();
  }
}

/** GUARD 变异体(★v9.9 翻正:无余量累计器——shouldRender 比较 now ≥ _nextDue 裸刀刃):
 *  干净流上 due 累加链与回调累加链的 fp 舍入差(~1e-9)/rAF 时间戳亚毫秒抖动落在阈值
 *  刀刃上=随机跳帧(红面)。影子 due 复刻累计器推进式(只去 DUE_GUARD_MS 余量) */
class NoGuardAccumBeat extends FrameBeat {
  private myDue = -1;
  override shouldRender(now: number): boolean {
    if (this.cap <= 0) return true;
    if (this.myDue < 0) return true;
    return now >= this.myDue;
  }
  override beginRender(now: number): void {
    super.beginRender(now);
    this.myDue = this.myDue < 0 ? now + this.targetMs() : Math.max(this.myDue + this.targetMs(), now);
  }
  override resetSampling(): void {
    super.resetSampling();
    this.myDue = -1;
  }
}

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.8 时间门四形态(退役态回归锁;语义见 FrameBeat.ts 头注 v9.8)', () => {
  it('形态①干净流恒屏率:120Hz±10% 抖动 cap120 → 累计器锁相 vsync,k=1,帧距 p50≈8.3,锁相率 ≥98.7%', () => {
    // ★v9.9 翻正:旧「逐回调全渲零 skip 零跳变(裸时间门跟满)」→「累计器锁相:渲染率
    //  120±带内抖动、帧距 p50 恒 8.3;±10% 抖动残 skip(≤1%)=相位游走重锁的 16.7 顺延
    //  帧(GUARD 扫描 0.75-2.0 恒 16-18 跳=锁相余量,非 v9.4 门咬合带病)」
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 2400, jitter: 0.1 });
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    expect(rendered.length).toBeGreaterThanOrEqual(2370);   // 锁相率 ≥98.7%(measured 2390/2400)
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBeLessThanOrEqual(40);               // 顺延帧少数派(measured 18)
    expect(st.p50).toBeGreaterThan(HZ120 - 0.5);
    expect(st.p50).toBeLessThan(HZ120 + 0.5);
    expect(1000 / st.mean).toBeGreaterThan(117);            // 渲染率=cap 带(measured 119.9)
    expect(1000 / st.mean).toBeLessThan(123);
  });

  it('形态②超速流限速 120(真实语料 Trace-20261006T033001):132/s merge/split 宽分布 → 累计器限速,读数 p50≈120 无 130 段', () => {
    // ★v9.9 翻正:旧「跟满 125-132:零咬合逐回调全渲,读数稳 125 带零 120 穿越」→
    //  「限速 120(用户主诉判别面):渲染数<回调数(相位锚 skip=限速本相),读数 p50
    //  ≈120、p05>112、无 130 段(max<126);变异证红=v9.8 裸时间门同流 359/359 跟满
    //  125.5。est 诊断面(minK={1})保留
    const beat = new FrameBeat();
    let t = 0;
    const rendered: number[] = [];
    const minKs = new Set<number>();
    for (let i = 0; i < LIVE_DELTAS_X10.length; i++) {
      t += LIVE_DELTAS_X10[i] / 10;
      beat.observeVsync(t, 120);
      minKs.add(beat.minK());
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        beat.endRender(t + LIVE_COSTS_X10[i] / 10);
      }
    }
    expect(rendered.length).toBeLessThan(LIVE_DELTAS_X10.length);   // 限速生效(measured 342/359)
    expect(rendered.length).toBeGreaterThanOrEqual(320);            // 不过度钳(skip ≤11%)
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    expect(minKs).toEqual(new Set([1]));                    // 诊断面:est 不跌破地板门槛(零翻转)
    const gaps: number[] = [];
    for (let i = 1; i < rendered.length; i++) gaps.push(rendered[i] - rendered[i - 1]);
    const sp = [...gaps].sort((a, b) => a - b);
    expect(sp[Math.floor(sp.length / 2)]).toBeGreaterThan(7.5);   // 帧距 p50≈8.33(measured 8.20)
    expect(sp[Math.floor(sp.length / 2)]).toBeLessThan(9.2);
    expect(Math.max(...gaps)).toBeLessThan(19);             // 顺延帧 17.1 有界(非 33ms 整拍空档)
    const fps = fpsSeries(rendered);
    expect(q(fps, 0.5)).toBeGreaterThan(115);               // 读数限速 120 带(measured 119.9)
    expect(q(fps, 0.5)).toBeLessThan(123);
    expect(q(fps, 0.05)).toBeGreaterThan(112);              // 带内抖动下沿(measured 117.9)
    expect(Math.max(...fps)).toBeLessThan(126);             // 无 130 段(measured max 122.0)
  });

  it('形态②超速流限速 120(σ0.9 合成 ticker 125Hz):渲染率钳到 120 带、限速 skip 有界、k=1', () => {
    // ★v9.9 翻正:旧「零咬合 skipAfterWarm=0、读数 >123 跟满 ticker 原生率」→「限速
    //  120:125Hz ticker 被累计器钳到 120±带内抖动,限速 skip 存在且有界(measured
    //  199/4600≈4.3%),顺延帧 17.7 有界」
    const lcg = lcgOf(97);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, lcg()))) * Math.cos(2 * Math.PI * lcg());
    const beat = new FrameBeat();
    const rendered: number[] = [];
    let t = 0;
    let throttleSkips = 0;
    for (let i = 0; i < 5000; i++) {
      t += 8.0 + 0.9 * gauss();
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        beat.endRender(t + 4);
      } else if (i >= 400) throttleSkips++;
    }
    expect(beat.k).toBe(1);
    expect(throttleSkips).toBeGreaterThan(0);          // 限速生效(skip=限速本相,非门咬合)
    expect(rendered.length).toBeLessThan(5000);
    expect(rendered.length).toBeGreaterThan(4600);     // 渲染率 120±(measured 4785)
    const st = gapStats(rendered.slice(400));
    expect(1000 / st.mean).toBeGreaterThan(117);       // 限速 120 带(measured 119.8)
    expect(1000 / st.mean).toBeLessThan(123);
    expect(Math.max(...st.gaps)).toBeLessThan(19);     // 顺延帧有界(measured 17.7)
  });

  it('形态③render-bound 帧距=帧耗:cap120 帧耗 25ms → 帧距恒 25ms=40fps,零跳变零 flap(容量语义由时间门天然承载)', () => {
    const rb = runBeat({ vsync: HZ120, cap: 120, cost: 25, callbacks: 1200 });
    expect(rb.beat.k).toBe(1);
    expect(rb.beat.lastReason).toBe('init');
    const st = gapStats(rb.rendered.slice(40));
    expect(st.p50).toBeGreaterThan(24);
    expect(st.p50).toBeLessThan(26);
    expect(st.jumps).toBe(0);
    expect(1000 / st.mean).toBeGreaterThan(38);
    expect(1000 / st.mean).toBeLessThan(42);
  });

  it('形态④暂停+云尖峰零振荡:CLOUD 4.5/9.0 宽分布流(无 hold/有 hold 双臂)→ k=1 零迁移,帧距被相位锚定钳成有界周期态(无 est 驱动的 60↔爬升翻转)', () => {
    // ★v9.9 翻正:旧「暂停段帧距=流本相 {4.5,9.0}(裸时间门跟满)」→「暂停段帧距=
    //  累计器重锚顺延 {4.5,9.0,13.5} 有界周期态(13.5=一拍顺延;4.5=深落后重锚后即时
    //  落拍),零振荡面不变;恢复段帧距被相位锚钳入 {7.9,15.8} 限速带(7.9ms ticker<
    //  target → 每回调落拍+相位游走顺延)」。hold 双臂=兼容保留面不变
    for (const withHold of [false, true] as const) {
      const beat = new FrameBeat();
      const ks: number[] = [];
      const reasons: string[] = [];
      const gaps: number[] = [];
      const pauseGaps: number[] = [];
      let t = 0;
      let last = -1;
      for (let i = 0; i < 1100; i++) {
        const paused = i >= 200 && i < 800;
        if (withHold) beat.hold(paused);
        t += paused ? (i % 2 === 0 ? 4.5 : 9.0) : 7.9;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          if (last >= 0) {
            gaps.push(t - last);
            if (paused) pauseGaps.push(t - last);
          }
          last = t;
          beat.endRender(t + 3.5);
          ks.push(beat.k);
          reasons.push(beat.lastReason);
        }
      }
      expect(ks.every((k) => k === 1)).toBe(true);
      expect(reasons.every((r) => r === 'init')).toBe(true);
      expect(beat.lastReason).toBe('init');
      // 暂停段帧距=重锚顺延有界周期态({4.5,9.0,13.5};浮点累加取整到 1e-6 后比对)
      expect(new Set(pauseGaps.map((g) => Math.round(g * 1e6) / 1e6))).toEqual(new Set([4.5, 9, 13.5]));
      // 恢复后健康段帧距=相位锚限速带 {7.9,15.8}(钳入 [7.5,16.5],无振荡无 30ms+)
      expect(Math.max(...gaps.slice(-250))).toBeLessThan(16.5);
      expect(Math.min(...gaps.slice(-250))).toBeGreaterThan(7.5);
    }
  });
});

describe('★cap 执法(时间门量化;k 恒 1——旧 minK 地板/拍迁移语义退役)', () => {
  it('cap60@120Hz:每 2 回调一渲,帧距恒 16.7 零跳变', () => {
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 2400 });
    expect(beat.k).toBe(1);
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(GRID_MS - 1);
    expect(st.p50).toBeLessThan(GRID_MS + 1);
  });

  it('cap30@120Hz:每 4 回调一渲,帧距恒 33.3', () => {
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 30, cost: 5, callbacks: 2400 });
    expect(beat.k).toBe(1);
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(1000 / 30 - 1);
    expect(st.p50).toBeLessThan(1000 / 30 + 1);
  });

  it('cap60@120Hz ±10% 抖动:限速 60 稳定——累计器每 2 回调拍落一次(p50=16.7、渲染率 60),顺延帧有界', () => {
    // ★v9.9 翻正:旧「两回调拍合计带 [15.0,18.3] 全在阈 12.17 之上→零延拍(GUARD=4.5
    //  标定②)」→「限速 60:p50 恒 16.7、渲染率 60.0;±10% 抖动下 ~3% 相位游走重锁
    //  顺延帧(3 回调 25ms)有界,非 33ms 整拍空档」
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 2400, jitter: 0.1 });
    expect(beat.k).toBe(1);
    const st = gapStats(rendered.slice(40));
    expect(st.p50).toBeGreaterThan(GRID_MS - 1.5);
    expect(st.p50).toBeLessThan(GRID_MS + 1.5);
    expect(1000 / st.mean).toBeGreaterThan(59);            // 限速 60 稳定(measured 60.0)
    expect(1000 / st.mean).toBeLessThan(61);
    expect(Math.max(...st.gaps)).toBeLessThan(26);         // 顺延帧 25.2 有界(非 33ms)
    expect(st.jumps).toBeLessThan(300);                    // 顺延帧少数派(measured ~150/2360)
  });

  it('cap 收紧 0→30 即时生效:帧距转 33.3,k/reason 不迁移(时间门直接承载 cap,旧 floor 迁移面退役)', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    let cap = 0;
    const gaps: number[] = [];
    let last = -1;
    for (let i = 0; i < 200; i++) {
      if (i === 80) cap = 30;
      while (grid <= prevT) grid += HZ120;
      const t = Math.max(grid, busy);
      prevT = t;
      beat.observeVsync(t, cap);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        if (last >= 0) gaps.push(t - last);
        last = t;
        busy = t + 5;
        beat.endRender(t + 5);
      }
    }
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    const after = gaps.slice(-25);            // 收紧后段(每 4 回调一渲)
    expect(Math.min(...after)).toBeGreaterThan(32);
    expect(Math.max(...after)).toBeLessThan(35);
  });

  it('cap60@60Hz(缺省档)与 cap120@60Hz:屏率绑顶——cap120 逐回调全渲恒 60,cap60 累计器锁相 ≥95%', () => {
    // ★v9.9 翻正:旧「每回调一渲恒 60(阈低于屏率间隔,屏率绑顶)」→「cap120@60Hz
    //  累计器在慢流上每回调补拍=仍逐回调全渲;cap60@60Hz(target=回调间隔)锁相率
    //  ≥95.8%(±10% 抖动带内偶发顺延,measured 1192/1200)」
    const a = runBeat({ vsync: HZ60, cap: 60, cost: 5, callbacks: 1200, jitter: 0.1 });
    expect(a.beat.k).toBe(1);
    expect(a.rendered.length).toBeGreaterThanOrEqual(1150);   // 锁相率 ≥95.8%(measured 1192)
    const stA = gapStats(a.rendered.slice(40));
    expect(stA.p50).toBeGreaterThan(HZ60 - 1.5);
    expect(stA.p50).toBeLessThan(HZ60 + 1.5);
    const b = runBeat({ vsync: HZ60, cap: 120, cost: 5, callbacks: 1200 });
    expect(b.rendered.length).toBe(1200);
    expect(b.beat.k).toBe(1);
  });

  it('诚实边界②(头注 v9.9):高刷屏 240Hz cap120 → 限速 120——累计器不随屏率超 cap,每 2 回调拍落一次,帧距恒 8.33', () => {
    // ★v9.9 翻正:旧「时间门跟满交付 240(阈 3.83<单回调间隔 4.17;cap=意图天花板+
    //  GUARD 松弛)」→「限速 120:240Hz 流上累计器每 2 回调拍落一次,渲染数=回调数一半,
    //  帧距恒 8.33 零跳变(cap 执法面回归:屏率不再是天花板)」
    const { beat, rendered } = runBeat({ vsync: 1000 / 240, cap: 120, cost: 1, callbacks: 2400 });
    expect(beat.k).toBe(1);
    expect(rendered.length).toBe(1200);                     // 每 2 回调拍落一次(measured 1200)
    const st = gapStats(rendered.slice(40));
    expect(st.p50).toBeGreaterThan(8);
    expect(st.p50).toBeLessThan(8.7);                       // 帧距恒 8.33(measured 8.33)
    expect(1000 / st.mean).toBeGreaterThan(118);
    expect(1000 / st.mean).toBeLessThan(122);               // 限速 120(measured 120.0)
    expect(st.jumps).toBe(0);
  });

  it('诚实边界③(头注 v9.9):深超速 fiction(恒 5.5ms ticker=182Hz)限速 120——累计器钳到 cap±带内抖动,渲染数<回调数', () => {
    // ★v9.9 翻正:旧「深超速跟满交付 182(旧 minK 地板 91fps 钳制随 k 迁移退役)」→
    //  「限速 120:5.5ms ticker 被相位锚钳到 120±(渲染 1980/3000),帧距 {5.5,11} 交替
    //  均值 8.33;真实合成器 ticker 观测带 126-132/s 同族收敛」
    const beat = new FrameBeat();
    const rendered: number[] = [];
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      t += 5.5;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        beat.endRender(t + 2);
      }
    }
    expect(beat.k).toBe(1);
    expect(rendered.length).toBeLessThan(3000);             // 限速生效(measured 1980)
    expect(rendered.length).toBeGreaterThan(1900);
    const st = gapStats(rendered.slice(200));
    expect(1000 / st.mean).toBeGreaterThan(117);            // 限速 120(measured 119.95)
    expect(1000 / st.mean).toBeLessThan(123);
    expect(Math.max(...st.gaps)).toBeLessThan(12.5);        // 帧距 {5.5,11} 有界(measured 11)
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.8 变异证红(双向):恢复旧 k 迁移面 → 振荡形态复现(红);退役态同流零迁移(绿)', () => {
  it('红→绿(暂停+云尖峰流,v9.7 定谳形态):旧迁移面 est 跨 7.08 地板门槛 → floor 落刀 k=2(瞬间 60)+恢复后升拍梯爬回=振荡复现;退役态 k=1 恒+零迁移', () => {
    const drive = (make: () => FrameBeat) => {
      const beat = make();
      const ks: number[] = [];
      const reasons: string[] = [];
      let t = 0;
      for (let i = 0; i < 1100; i++) {
        const paused = i >= 200 && i < 800;
        t += paused ? (i % 2 === 0 ? 4.5 : 9.0) : 7.9;   // CLOUD 形态(31 窗截尾均值 ≈6.85<7.08)
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          beat.endRender(t + 3.5);
          ks.push(beat.k);
          reasons.push(beat.lastReason);
        }
      }
      return { beat, ks, reasons };
    };
    // 红(变异:旧 k 迁移面复活)——est 污染 → minK 门槛翻转 → 地板落刀+升拍梯
    const red = drive(() => new OldMigrationBeat());
    expect(red.ks).toContain(2);
    expect(red.reasons).toContain('floor');
    expect(red.reasons).toContain('upgrade');
    // 绿(退役态):无 est 无 k 无迁移,振荡形态消灭
    const green = drive(() => new FrameBeat());
    expect(green.ks.every((k) => k === 1)).toBe(true);
    expect(green.reasons.every((r) => r === 'init')).toBe(true);
    expect(green.beat.k).toBe(1);
  });

  it('红→绿(回声 trace 流 Trace-20260929,v4 判据组):旧迁移面 p95 扫拍↔无余量升拍打架 → k 反复 flap(修前形态实锤);退役态零迁移稳驻全渲', () => {
    const replay = (make: () => FrameBeat) => {
      const beat = make();
      let t = 0;
      let rendered = 0;
      const ks: number[] = [];
      for (let i = 0; i < DELTAS_X10.length; i++) {
        t += DELTAS_X10[i] / 10;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          beat.endRender(t + COSTS_X10[i] / 10);
          rendered++;
          ks.push(beat.k);
        }
      }
      const flips = ks.slice(1).filter((k, i) => k !== ks[i]).length;
      return { beat, rendered, flips };
    };
    const red = replay(() => new OldV4Beat());
    expect(red.flips).toBeGreaterThanOrEqual(6);   // flap=红(v4 失效形态复现)
    const green = replay(() => new FrameBeat());
    expect(green.flips).toBe(0);                   // 退役态零迁移
    expect(green.beat.k).toBe(1);
    expect(green.rendered).toBeGreaterThan(620);   // 每回调皆渲
  });

  it('红→绿(GUARD 变异:无余量累计器=due 刀刃裸奔):干净流上无 DUE_GUARD_MS 的累计器被 fp/时间戳亚毫秒抖动在阈值刀刃上随机跳帧(红);0.75ms 余量吸收=累计器在干净流零跳变(绿)', () => {
    // ★v9.9 翻正:旧「阈落 ±10% 抖动带内(裸时间门)随机跳帧红 vs 带外放置 4.5 零跳变
    //  绿」→「累计器形态:干净流零跳变为绿面(cap60 两回调拍=fp 刀刃最暴露档);
    //  无余量变异(now ≥ _nextDue)下 due 累加链(GRID_MS)与回调累加链(2×HZ120)的
    //  fp 舍入差 ~1e-9 落在阈上 → 随机 skip → 帧距 16.7 翻转=红(DUE_GUARD_MS 语义=
    //  时间戳抖动防跳帧;±10% 宽抖动流的锁相顺延与非门值无关,见形态①注)」
    const neo = runBeat({ vsync: HZ120, cap: 60, cost: 4, callbacks: 2400 });
    expect(gapStats(neo.rendered.slice(40)).jumps).toBe(0);   // 绿:干净流累计器零跳变
    const neo120 = runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 2400 });
    expect(gapStats(neo120.rendered.slice(40)).jumps).toBe(0);
    const old_ = runBeat({ vsync: HZ120, cap: 60, cost: 4, callbacks: 2400, make: () => new NoGuardAccumBeat() });
    // 红:无余量累计器在 due 刀刃上被 fp 舍入差打穿 → 随机 skip(measured 10 跳)
    expect(gapStats(old_.rendered.slice(40)).jumps).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.8 退役态锁(k 恒 1/诊断面/hold 兼容/不追赶)', () => {
  it('k 恒 1 跨流族(轻载/render-bound/超速/暂停云流/收紧)且 lastReason 恒 init——拍字段冻结为退役态', () => {
    const streams: FrameBeat[] = [];
    streams.push(runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 600 }).beat);
    streams.push(runBeat({ vsync: HZ120, cap: 120, cost: 25, callbacks: 600 }).beat);
    streams.push(runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 600 }).beat);
    const beat = new FrameBeat();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      beat.hold(i >= 300);
      t += i % 2 === 0 ? 4.5 : 9.0;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) { beat.beginRender(t); beat.endRender(t + 3.5); }
    }
    streams.push(beat);
    for (const b of streams) {
      expect(b.k).toBe(1);
      expect(b.lastReason).toBe('init');
    }
  });

  it('hold 兼容保留(v9.7 语义):暂停期渲染照走时间门,观测面不冻(est 照常采样),snapshot.hold 诊断面', () => {
    const beat = new FrameBeat();
    const snap0 = beat.snapshot();
    expect(snap0.hold).toBe(false);
    expect(snap0.k).toBe(1);
    let t = 0;
    let pauseRenders = 0;
    const estBefore: number[] = [];
    for (let i = 0; i < 700; i++) {
      const paused = i >= 100;
      beat.hold(paused);
      t += paused ? (i % 2 === 0 ? 4.5 : 9.0) : HZ120;
      beat.observeVsync(t, 60);
      if (paused) estBefore.push(beat.vsyncPeriod);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        beat.endRender(t + 3);
        if (paused) pauseRenders++;
      }
    }
    expect(pauseRenders).toBeGreaterThan(200);      // 渲染照走(时间门不受 hold 冻结)
    expect(beat.snapshot().hold).toBe(true);
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    expect(estBefore[estBefore.length - 1]).toBeLessThan(7.5);  // 观测面不冻:est 跟随暂停期云形态
  });

  it('失拍吸附语义保留(时间门天然不追赶中途):合成器停滞 30ms 后首回调即渲,无解堵连发', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    const rendered: number[] = [];
    for (let i = 0; i < 600; i++) {
      while (grid <= prevT) grid += HZ120;
      let t = Math.max(grid, busy);
      if (i === 300) t += 30;                  // 合成器侧停滞 30ms(回调断流一次)
      prevT = t;
      beat.observeVsync(t, 0);                 // cap=0 UNCAPPED:逐回调全渲口径
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        busy = t + 5;
        beat.endRender(t + 5);
      }
    }
    expect(rendered.length).toBe(600);          // 停滞帧照录,恢复首回调即渲(无 skip 无连发)
    const gaps = rendered.slice(1).map((r, i) => r - rendered[i]);
    const missIdx = gaps.findIndex((g) => g > 25);
    expect(missIdx).toBeGreaterThan(0);         // 停滞帧距被如实记录
    expect(gaps[missIdx + 1]).toBeLessThan(HZ120 + 4);  // 下一帧距即回正常(不追赶补渲)
  });

  it('成本诊断面保留:costP50/costP95 照常采样(F5/snapshot 消费,不驱动决策)', () => {
    const beat = new FrameBeat();
    beat.observeVsync(0, 0);
    for (let i = 0; i < 60; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 0);
      beat.beginRender(t);
      beat.endRender(t + (i % 10 === 9 ? 12 : 4));    // 10% 尖峰
    }
    expect(beat.costP50()).toBe(4);
    expect(beat.costP95()).toBe(12);
    const snap = beat.snapshot();
    expect(snap.p50).toBe(4);
    expect(snap.p95).toBe(12);
    expect(snap.reason).toBe('init');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★估计器诊断面锁(v9.5 清退态原样保留;est 只喂 F5/snapshot 不驱动决策)', () => {
  /** 估计器驱动器:delta 流喂引擎,逐回调记录 vsyncPeriod(拍状态机不动,纯估计面) */
  const replayEstimate = (make: () => FrameBeat, deltas: number[], costs?: number[]) => {
    const beat = make();
    const est: number[] = [];
    let t = 0;
    deltas.forEach((d, i) => {
      t += d;
      beat.observeVsync(t, 120);
      if (costs) {
        beat.beginRender(t);
        beat.endRender(t + costs[i]);
      }
      est.push(beat.vsyncPeriod);
    });
    return est;
  };
  const TRACE_DELTAS = DELTAS_X10.map((v) => v / 10);   // ×10 定点还原 ms

  it('★估计器与截尾均值逐位一致(回声真实流带成本/健康流/杀手流三流;任何估计器结构变更须新证据另立项)', () => {
    const traceCosts = COSTS_X10.map((v) => v / 10);
    const lcg = lcgOf(21);
    const healthy = Array.from({ length: 2000 }, () => (lcg() < 0.052 ? 7.2 + lcg() * 0.75 : 7.93 + lcg() * 0.14));
    const killer = Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? 20 : 13.3));
    const streams: { deltas: number[]; costs?: number[] }[] = [
      { deltas: TRACE_DELTAS, costs: traceCosts }, { deltas: healthy }, { deltas: killer },
    ];
    for (const { deltas, costs } of streams) {
      const est = replayEstimate(() => new FrameBeat(), deltas, costs);
      const ref = replayEstimate(() => new LegacyEstBeat(), deltas, costs);
      expect(est).toEqual(ref);                // 逐位一致(估计器=v9.5 清退态,诊断面)
    }
  });

  it('★截尾均值处方直锁(双峰恢复真值/小窗安全)', () => {
    expect(trimmedMeanVsync([])).toBe(GRID_MS);                       // 空窗=GRID 先验
    expect(trimmedMeanVsync([8.33, 8.33, 8.33])).toBeCloseTo(8.33, 2);
    // 双峰 20/13.3 交替(真 16.67):截尾均值恢复真值,中位数制会按窗奇偶翻转
    const bimodal = Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 20 : 13.3));
    expect(trimmedMeanVsync(bimodal)).toBeGreaterThan(15);
  });

  it('★金标健康流(机器时间戳语义 7.93±0.07 + 5.2% 余数 7.2-7.95):截尾均值保持机器语义读数(不被名义 8.33 拉高)', () => {
    const lcg = lcgOf(21);
    const healthy = Array.from({ length: 2000 }, () => (lcg() < 0.052 ? 7.2 + lcg() * 0.75 : 7.93 + lcg() * 0.14));
    const est = replayEstimate(() => new FrameBeat(), healthy);
    expect(q(est.slice(-400), 0.5)).toBeLessThan(8.1);
  });

  it('★v1 杀手流(60Hz 双峰 20/13.3 交替,真 16.67):截尾均值对双峰恢复真值——地板级联不复发', () => {
    const killer = Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? 20 : 13.3));
    const est = replayEstimate(() => new FrameBeat(), killer);
    expect(q(est.slice(-400), 0.5)).toBeGreaterThan(15);
  });

  it('★估计式不变性(洁净流):锁定 120Hz 网格=精确 8.33;全 2×vsync 并调流=16.67', () => {
    const locked = Array.from({ length: 600 }, () => HZ120);
    const estLocked = replayEstimate(() => new FrameBeat(), locked);
    expect(estLocked[estLocked.length - 1]).toBeCloseTo(HZ120, 2);
    const merged = Array.from({ length: 600 }, () => 2 * HZ120);
    const estMerged = replayEstimate(() => new FrameBeat(), merged);
    expect(estMerged[estMerged.length - 1]).toBeCloseTo(2 * HZ120, 2);
  });

  it('★切屏恢复(120→60):截尾均值随流重建,200 回调内估计回到 60Hz 带(≥15)', () => {
    const stream = [...Array.from({ length: 600 }, () => HZ120), ...Array.from({ length: 300 }, () => HZ60)];
    const est = replayEstimate(() => new FrameBeat(), stream);
    expect(est[799]).toBeGreaterThanOrEqual(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★digest 修前/修后节拍对照(vs 初版被动门+SuppressDraw;帧距序列跳变次数+p50 判别)', () => {
  const N = 2400;        // 20s@120Hz / 40s@60Hz 仿真
  const jitter = 0.1;    // ±10% rAF 回调抖动(真实 rAF 常见量级)
  const TRIM = 40;       // 去 vsync 估计/拍选择预热段(帧数)

  it('120Hz cap60(缺省档):修后限速 60 稳定——渲染率高于修前(被动门),p50 不变,方差降', () => {
    // ★v9.9 翻正:旧「修后跳变≪修前(jumps ≤ max(2, stO×0.2))」→「限速 60:累计器
    //  p50 恒 16.7、渲染率 60.0 vs 修前 56.7(帧率更高);±10% 抖动顺延帧使 jump 绝对数
    //  不可比(渲染帧数同量级下 347 vs 197),诚实对比面=p50/方差/渲染率三轴」
    const seed = 42;
    const neo = runBeat({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(3);      // p50 不变(0.17)
    expect(stN.std).toBeLessThan(stO.std);                           // 方差降(2.79<2.94)
    expect(1000 / stN.mean).toBeGreaterThan(1000 / stO.mean);        // 渲染率 60.0 vs 56.7
  });

  it('120Hz cap0:修前 SuppressDraw 相位游走,修后零迁移+帧距不慢于旧', () => {
    const seed = 43;
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const old_ = runOld({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    const flipsN = ksN.slice(1).filter((k, i) => k !== ksN[i]).length;
    expect(flipsN).toBe(0);                                                // 档位零迁移(k 恒 1)
    expect(stN.p50).toBeLessThanOrEqual(stO.p50 + 2);                      // 修后帧距不慢于旧
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);             // 无 33ms 整拍空档
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.45 * HZ120);           // 无解堵聚帧
  });

  it('★cap120@120Hz 轻载:旧码网格地板恒 60fps(红)→新码恒 120fps(绿);p50 8.3 而非 16.7', () => {
    const seed = 45;
    const cost = 4;
    const neo = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter });
    const old_ = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, make: () => new OldGridFloorBeat() });
    // 红(修前):网格地板 → 稳态 k=2 恒 60fps
    expect(old_.beat.k).toBe(2);
    const stO = gapStats(steady(old_.rendered, 5000));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);
    expect(stO.p50).toBeLessThan(GRID_MS + 2);
    // 绿(修后):累计器锁相恒 120fps,k 恒 1(reason 恒 init);★v9.9 翻正:旧「jumps=0
    //  且 ≤ 旧码」→「±10% 抖动残 skip(10 跳/1792 帧=0.6%)=相位游走重锁顺延,有界即绿;
    //  120fps vs 旧码网格地板 60fps 的 fps 对照承载判别」
    expect(neo.beat.k).toBe(1);
    expect(neo.beat.lastReason).toBe('init');
    const stN = gapStats(steady(neo.rendered, 5000));
    expect(stN.p50).toBeGreaterThan(HZ120 - 1);
    expect(stN.p50).toBeLessThan(HZ120 + 1);
    expect(stN.jumps).toBeLessThanOrEqual(40);
    expect(1000 / stN.mean).toBeGreaterThan(115);     // 120fps(measured 119.6)vs 旧码 60
  });

  it('★cap120@120Hz 重场景(帧耗抖动 4/12ms):零迁移驻全速,12ms 帧=流本相顺延(无 flap),旧网格地板码恒钉 k=2', () => {
    const seed = 46;
    const cost = costFn(lcgOf(seed));
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const old_ = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, make: () => new OldGridFloorBeat() });
    const flipsN = ksN.slice(1).filter((k, i) => k !== ksN[i]).length;
    expect(flipsN).toBe(0);                            // 零迁移(k 恒 1)
    expect(neo.beat.k).toBe(1);
    const stN = gapStats(neo.rendered.slice(TRIM));
    expect(stN.p50).toBeGreaterThan(HZ120 - 1);
    expect(stN.p50).toBeLessThan(GRID_MS + 2);
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.45 * HZ120);
    expect(old_.beat.k).toBe(2);                       // 旧码网格地板钉死
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);
    expect(stN.p50).toBeLessThan(stO.p50);             // 修后帧距更短(fps 更高)
  });

  it('60Hz cap60(多数用户场景):修后无回归(跳变不增,p50 不变)', () => {
    const seed = 44;
    const neo = runBeat({ vsync: HZ60, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ60, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(stO.jumps);
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('三档语义锁(源锚)', () => {
  it('Game.start():subtle 走 beat 门(observeVsync/shouldRender/beginRender/endRender 接线)', () => {
    expect(GAME).toContain("import { FrameBeat } from './FrameBeat';");
    expect(GAME).toContain('this.beat.observeVsync(now, options.data.frameCap)');
    expect(GAME).toContain('if (!this.beat.shouldRender(now))');
    expect(GAME).toContain('this.beat.beginRender(now)');
    // ★v9.9 翻正:三档统一记账(累计器相位推进依赖 begin/endRender 成对)
    expect(GAME).toContain('this.beat.endRender(performance.now())');
    expect(GAME).not.toContain("if (mode === 'subtle') this.beat.endRender");
  });

  it('Game.start():被跳回调先于 _paintedFrames++ 早退(whenFirstPaint 只认真实渲染帧)', () => {
    const iSkip = GAME.indexOf('if (!this.beat.shouldRender(now))');
    const iPaint = GAME.indexOf('this._paintedFrames++');
    expect(iSkip).toBeGreaterThan(-1);
    expect(iPaint).toBeGreaterThan(-1);
    expect(iSkip).toBeLessThan(iPaint);
    // ★v9.9 翻正:被动门退役(三档统一累计器)——旧 iCapSkip 断言随语义退役
  });

  it('SuppressDraw 旧分支已退役(0 步进帧照画,与 improved-subtle 同相)', () => {
    expect(GAME).not.toMatch(/frameSkipMode === 'subtle' && steps === 0/);
    expect(GAME).toContain('62624');   // 注释锚:EndDraw 忙等 present 网格
  });

  it('★v9.9 翻正:on/off 档统一走 beat 累计器(旧被动门退役——阈 1000/cap-1 在超速双峰流上随机咬合=摆动源,用户实报 on/off 无法 120)', () => {
    expect(GAME).toContain('this.beat.hold(this.paused || this._entryFreeze != null || this._tpVeil)');
    expect(GAME).not.toContain('1000 / cap - 1');   // 旧被动门已退役
  });

  it('FrameBeat.ts vanilla 锚齐备(1457 亲读行号)', () => {
    expect(BEAT).toContain('17129');   // 三态 IsFixedTimeStep
    expect(BEAT).toContain('17182');   // SuppressDraw 仅旧路径
    expect(BEAT).toContain('improvedSubtleFrameSkip');
    expect(BEAT).toContain('62624');   // EndDraw 忙等
    expect(BEAT).toContain('67615');   // 默认值
  });

  it('★网格地板已废除(targetMs 不再 max(GRID_MS,·);否决注在头注——防"忠实原版"回改)', () => {
    expect(BEAT).not.toContain('Math.max(GRID_MS');
    expect(BEAT).toContain('cap > 0 ? 1000 / cap : this.vsyncPeriod');
    expect(BEAT).toContain('网格地板否决注');
  });

  it('★v6 降档线源锚(判据组保留在迁移闸内=史档+红判别器复刻面;政策语义在头注)', () => {
    expect(BEAT).toContain('this.budget(this.k + 1) * DOWNGRADE_MARGIN');
    expect(BEAT).toContain('DOWNGRADE_MARGIN = 1.1');
    expect(BEAT).toContain('帧率优先');
    expect(BEAT).toContain('★v6 降档边界=帧率优先');
  });

  it('常数处方锁(判据常数族保留=迁移闸内史档+红判别器复刻面;★v9.8:时间门余量 4.5=真实流带外标定;★v9.9:累计器过门余量 0.75=时间戳抖动带)', () => {
    expect(TARGET_GUARD_MS).toBe(4.5);
    expect(DUE_GUARD_MS).toBe(0.75);
    expect(UPGRADE_WIN_SAMPLES).toBe(30);
    expect(UPGRADE_HOLD_WINDOWS).toBe(2);
    expect(UPGRADE_HEADROOM).toBe(0.9);
    expect(DOWNGRADE_MARGIN).toBe(1.1);
    expect(MISS_SLACK).toBe(0.7);
    expect(MISS_GRID_TOL_REL).toBe(0.2);
    expect(MISS_GRID_TOL_MS).toBe(2);
    expect(MISS_STREAK_DOWNGRADE).toBe(4);
    expect(MISS_STALL_BUDGET_MS).toBe(200);
    expect(FLOOR_HOLD_WINDOWS).toBe(2);
    expect(GRID_MS).toBeCloseTo(1000 / 60);
  });

  it('★v9.9 相位锚定源锚(防回改):shouldRender=累计器门(now ≥ _nextDue − DUE_GUARD_MS)+UNCAPPED/未锚定守卫(无序数门/无裸时间门/无 capSkips);beginRender 相位推进+resetSampling/cap 变更重锚;migrationEnabled 闸=false 且判据组整段保留在闸内(退役=停用决策面非删代码);resetSampling k 恒 1;est≡截尾均值(诊断面);v9.8/v9.9 登记在头注', () => {
    // ★v9.9 翻正:旧「shouldRender=纯时间门 now−lastRenderAt ≥ target−TARGET_GUARD_MS」
    //  →「累计器相位锚定门 now ≥ _nextDue − DUE_GUARD_MS(_nextDue=−1 未锚定哨兵)+
    //  beginRender 相位推进 + resetSampling/cap 变更重锚」;k 迁移退役面原样保留
    const iShould = BEAT.indexOf('shouldRender(now: number): boolean');
    const iCapBreach = BEAT.indexOf('protected capacityBreach');
    expect(iShould).toBeGreaterThan(-1);
    expect(iCapBreach).toBeGreaterThan(iShould);
    const shouldSrc = BEAT.slice(iShould, iCapBreach);
    expect(shouldSrc).toContain('if (this.cap <= 0) return true;');
    expect(shouldSrc).toContain('if (this._nextDue < 0) return true;');
    expect(shouldSrc).toContain('now >= this._nextDue - DUE_GUARD_MS');
    expect(shouldSrc).not.toContain('now - this.lastRenderAt');
    expect(shouldSrc).not.toContain('this.ordinal');
    expect(shouldSrc).not.toContain('capSkips');
    // 相位锚定面:常数存在+beginRender 推进式+重锚哨兵(cap 变更/resetSampling)
    expect(BEAT).toContain('export const DUE_GUARD_MS');
    expect(BEAT).toContain('Math.max(this._nextDue + this.targetMs(), now)');
    expect(BEAT).toContain('this._nextDue = -1');
    // 退役闸本体=false;迁移决策面整段保留在闸内(红判别器 OldMigrationBeat 复刻点)
    expect(BEAT).toContain('protected migrationEnabled(): boolean');
    expect(BEAT).toMatch(/migrationEnabled\(\): boolean \{\s*return false;/);
    const iGate = BEAT.indexOf('if (this.migrationEnabled()) {');
    expect(iGate).toBeGreaterThan(-1);
    // 迁移动作面(降拍扫/地板/升拍/失拍降档)整段在闸内;判据公式本体在 protected 钩
    expect(BEAT.slice(iGate)).toContain("this.lastReason = 'capacity'");
    expect(BEAT.slice(iGate)).toContain("this.lastReason = 'floor'");
    expect(BEAT.slice(iGate)).toContain("this.lastReason = 'upgrade'");
    expect(BEAT.slice(iGate)).toContain("this.lastReason = 'miss-streak'");
    expect(BEAT).toContain('this.budget(this.k + 1) * DOWNGRADE_MARGIN');
    expect(BEAT).toContain('this.costP50() < this.budget(this.k) * UPGRADE_HEADROOM');
    // resetSampling:k 恒 1(不再归地板)
    expect(BEAT).toContain('this.k = 1;');
    // 估计器=v9.5 清退态(截尾均值,诊断面)
    expect(BEAT).toContain('return this.legacyEstimate()');
    // 头注 v9.8/v9.9 登记(用户裁决原话+退役理由+相位锚定翻正)
    expect(BEAT).toContain('★v9.8 根治刀');
    expect(BEAT).toContain('最简条件(暂停零渲染负载)下帧率都不稳=算法本身有问题,需要根治');
    expect(BEAT).toContain('★v9.9');
  });

  it('★v9.7 hold 兼容源锚(保留面):hold 早退在状态机前;floorRaiseDue 钩在;Game 侧 paused 单源接线先于 observeVsync;判据线/估计器零触碰', () => {
    expect(BEAT).toContain('hold(on: boolean): void');
    expect(BEAT).toContain('protected floorRaiseDue(): boolean');
    const iHoldBlock = BEAT.indexOf('if (this.holdOn) {');
    const iMachine = BEAT.indexOf('const vsync = this.vsyncPeriod;');
    expect(iHoldBlock).toBeGreaterThan(-1);
    expect(iHoldBlock).toBeLessThan(iMachine);
    // Game 侧接线:paused 单源+入场冻结窗+传送幕帘,且先于 observeVsync
    expect(GAME).toContain('this.beat.hold(this.paused || this._entryFreeze != null || this._tpVeil)');
    const iWire = GAME.indexOf('this.beat.hold(');
    const iObs = GAME.indexOf('this.beat.observeVsync(now, options.data.frameCap)');
    expect(iWire).toBeGreaterThan(-1);
    expect(iWire).toBeLessThan(iObs);
    // 诊断面:snapshot().hold
    const snap = new FrameBeat();
    expect(snap.snapshot().hold).toBe(false);
    snap.hold(true);
    expect(snap.snapshot().hold).toBe(true);
  });
});
