// ★v9.11 跟满回归回归锁(2026-10-08 终局刀;用户裁决原话「像是被什么奇怪的算法一直
//  压着,以前我们都可以上 120」定谳后;FrameBeat.ts 头注 v9.11):渲染决策=恒渲(跟满),
//  渲染帧距=回调流本距(流匀则帧距匀,无论流是 120 还是 167),不做任何限速。
//  - 定谳链(用户本机 dist-analyze trace 130909):主循环回调流 167/s(间隔 p50=5.27ms,
//    双峰 4-6/8-9)。cap=120 下 v9.9(累计器 lead 0.75)帧距恒 10.54=95fps 上限(「到不了
//    120」);v9.10(lead=dEst≈5)帧距 5.3/10.5 交替=「压着+抖」。单链数学:回调网格 5.27
//    与 cap 周期 8.33 非整数比(≈1.58)→任何相位限速给不出稳定 120;而流本身帧距 5.27
//    恒定=最平滑(167fps)。历次实报归一(95 上限/压着抖/130 波动)=「限速思想」的产物。
//  - 本文件判据面整体翻正为「跟满语义」锁:帧距=流距逐位(rendered≡回调序列)/零 skip/
//    零迁移/cap 无效化。v9.8/v9.9/v9.10 语义锁(时间门四形态/锁相率/限速带/dEst 提前量)
//    退役=实验轨史档(git 历史+FrameBeat.ts 头注 v9.8/v9.9/v9.10 各注可考)。
//  - 变异证红收敛为「恢复累计器(任一形态)→跟满测试红」:AccumulatorBeat(v9.9 相位锚
//    +v9.10 dEst 机械复刻)与 OldMigrationBeat(v9.7 k 迁移面)同流 A/B=红(skip/帧距
//    混样/重锚顺延/限速钳/拍迁移),现役跟满=绿。
//  - 保留面:估计器诊断面(v9.5 清退态截尾均值,est 不驱动决策只喂 F5/snapshot)/成本窗/
//    失拍账/migrationEnabled=false 闸(v5-v8 判据组原样=史档+红判别器复刻点)/v9.7 hold
//    (no-op)/三档语义源锚/cap 退役保留面(Settings disabled+tooltip)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FrameBeat, GRID_MS, UPGRADE_WIN_SAMPLES, UPGRADE_HOLD_WINDOWS, UPGRADE_HEADROOM, DOWNGRADE_MARGIN, MISS_SLACK, MISS_GRID_TOL_REL, MISS_GRID_TOL_MS, MISS_STREAK_DOWNGRADE, MISS_STALL_BUDGET_MS, FLOOR_HOLD_WINDOWS, trimmedMeanVsync } from '../src/core/FrameBeat';

const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const BEAT = readFileSync(new URL('../src/core/FrameBeat.ts', import.meta.url), 'utf8');
const SETTINGS = readFileSync(new URL('../src/ui/Settings.ts', import.meta.url), 'utf8');
const OPTIONS = readFileSync(new URL('../src/core/Options.ts', import.meta.url), 'utf8');

/** 确定性 LCG(单测须可复现,禁 Math.random) */
function lcgOf(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

const HZ120 = 1000 / 120;
const HZ60 = 1000 / 60;

/** 显示网格 interval 流(按绝对网格步索引) */
function makeIntervals(vsync: number, jitter: number, n: number, seed: number) {
  const lcg = lcgOf(seed);
  return Array.from({ length: n }, () => vsync * (1 + jitter * (2 * lcg() - 1)));
}

/**
 * 引擎驱动器:回调时间流喂 FrameBeat,返回渲染帧起点序列+回调序列。
 * 回调时点模型(真实 Chrome):rAF 只在「上一回调之后的下一网格点」触发;渲染超支
 * 越过网格点时,迟帧的回调在解堵点(busy)即跑——时间戳单调。
 * ★v9.11 跟满语义的「帧距=流距逐位」锁=rendered 与 cbs 逐位相等(零 skip)。
 */
function runBeat(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
  make?: () => FrameBeat;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0, make = () => new FrameBeat() } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const beat = make();
  let step = 0;
  let grid = 0;
  let busy = 0;
  let prevT = -1;
  const rendered: number[] = [];
  const cbs: number[] = [];
  for (let i = 0; i < callbacks; i++) {
    while (grid <= prevT) grid += intervals[step++ % intervals.length];
    const t = Math.max(grid, busy);
    prevT = t;
    cbs.push(t);
    beat.observeVsync(t, cap);
    if (beat.shouldRender(t)) {
      beat.beginRender(t);
      rendered.push(t);
      const c = typeof cost === 'function' ? cost(i, t) : cost;
      busy = t + c;
      beat.endRender(t + c);
    }
  }
  return { beat, rendered, cbs };
}

/** 帧距序列指标:p50/均值/标准差/跳变次数;mean 供 realized fps(1000/mean)判读 */
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
/** 浮点帧距集(1e-6 取整;用于帧距集合逐位比对) */
const gapSet = (gaps: number[]) => new Set(gaps.map((g) => Math.round(g * 1e6) / 1e6));

// ── ★真实 trace 回放流(Trace-20260929T164816 @localhost:4173,主线程 rAF 序列实拍;
//    饱和回声流)——估计器诊断面语料(红判别器 A/B 共享同一物理流)──
const DELTAS_X10 = [124,122,104,123,160,135,114,95,119,96,155,124,126,116,95,115,97,128,129,133,95,147,120,125,93,165,122,131,96,121,122,106,120,118,117,93,117,97,143,129,131,134,97,132,125,100,145,131,134,94,130,122,135,96,143,117,100,128,122,125,90,130,139,124,96,115,143,95,122,152,129,120,115,120,95,123,122,124,116,123,140,123,98,121,116,93,120,115,158,114,116,94,128,126,121,108,121,114,93,119,126,94,117,116,91,142,116,116,93,159,116,91,118,116,94,113,145,97,128,117,95,125,111,129,125,119,92,120,119,121,95,136,109,121,94,119,126,91,128,127,120,122,127,125,90,119,121,95,114,113,91,117,89,133,127,95,127,148,139,122,94,124,120,90,122,114,87,140,112,92,125,122,104,116,134,138,94,144,153,122,106,131,117,93,134,153,152,155,157,147,149,149,201,218,119,123,96,118,121,96,118,91,114,93,134,139,115,122,97,120,115,92,129,137,98,122,117,120,97,124,128,98,138,124,92,117,117,98,123,118,106,119,112,96,113,137,126,94,115,123,118,113,117,91,124,121,90,116,100,127,132,125,98,129,118,126,99,162,118,126,88,146,115,97,126,120,89,124,117,128,90,120,118,97,143,115,101,118,145,123,96,122,124,97,161,127,142,118,96,126,118,113,124,122,98,128,123,123,94,141,118,111,126,124,115,118,131,139,139,99,126,128,120,94,121,129,97,124,125,99,138,116,97,114,124,114,121,113,116,101,117,123,96,132,134,123,96,121,128,94,132,140,143,92,126,129,95,123,121,104,132,128,121,99,134,129,124,94,143,123,99,121,158,119,109,116,175,122,103,124,121,101,123,125,122,131,122,117,102,128,128,122,137,118,94,97,119,141,137,124,90,149,122,96,117,127,125,123,90,91,117,118,135,136,92,120,95,119,125,143,137,122,120,122,121,94,128,142,90,119,96,123,122,122,96,169,124,123,120,94,117,120,93,120,120,94,127,127,90,124,127,89,133,139,119,94,166,133,125,96,115,116,91,113,96,119,115,113,93,129,135,85,119,124,95,111,125,88,138,112,85,134,117,90,109,87,132,113,144,87,115,114,86,115,86,135,121,84,111,115,89,130,127,91,104,81,125,87,111,115,84,129,121,108,78,112,130,83,129,115,198,115,114,127,101,126,103,110,80,108,85,110,112,81,103,81,116,113,86,117,81,107,111,111,112,107,81,133,93,112,106,83,105,93,114,106,84,107,93,115,105,80,104,105,102,100,80,108,118,106,109,77,120,102,77,104,81,102,79,105,106,73,107,96,102,103,102,121,75,102,74,98,74,102,98,76,109,75,118,72,99,72,105,75,105,103,100,106,81,132,80,109,78,106,114,77,116,79,104,95,107,103,77,108,84,140,110,109,76,102,88,101,102,81,105,75,104,97,106,108];
const COSTS_X10 = [107,88,107,143,118,98,80,105,83,132,107,110,102,81,101,77,108,110,117,81,133,103,108,79,150,105,116,81,106,107,80,105,104,102,77,103,80,127,108,109,120,82,115,111,84,129,115,121,80,114,108,119,80,130,101,83,112,106,108,76,113,123,108,82,99,127,79,107,132,110,104,101,105,81,108,105,110,102,109,125,109,84,105,100,77,105,77,144,99,102,79,114,110,104,77,105,100,78,103,109,78,100,99,76,129,102,101,79,142,101,78,101,100,80,98,127,81,112,101,76,106,96,93,106,101,77,103,104,107,81,121,96,105,78,99,112,77,112,106,104,107,101,110,77,101,105,80,100,99,74,103,74,117,110,79,99,132,123,107,80,107,101,75,104,100,73,117,96,78,107,107,81,98,119,123,78,126,136,105,90,113,100,78,119,139,136,136,138,129,132,134,125,198,101,109,81,104,103,76,103,77,97,76,117,124,97,107,82,102,98,76,103,119,80,103,98,104,81,108,111,84,124,109,77,99,104,77,104,103,78,104,98,80,99,121,111,81,101,109,99,98,104,77,108,106,77,101,85,108,113,107,81,112,101,110,84,146,101,111,74,131,101,83,109,103,76,111,101,113,78,101,101,83,129,101,79,102,127,106,78,104,108,80,140,108,124,101,81,110,104,97,107,104,80,111,105,106,80,125,104,94,109,110,82,102,115,119,125,81,110,105,105,80,105,113,79,108,109,83,121,102,83,98,107,97,107,99,101,87,103,106,81,118,114,106,81,104,111,80,112,123,128,76,107,113,81,105,106,82,117,109,106,83,118,109,107,78,125,107,82,105,141,104,91,100,107,107,81,106,107,83,105,109,108,99,108,102,81,111,114,108,122,103,79,81,99,122,121,109,75,135,107,79,102,111,110,107,77,77,101,100,105,122,75,103,79,102,109,128,76,108,104,105,104,79,104,127,76,105,77,106,103,107,79,144,109,104,103,78,100,102,78,101,103,77,103,113,74,107,112,73,113,123,101,76,149,111,108,81,100,100,75,99,78,103,100,94,76,110,120,71,100,109,76,96,109,73,122,97,72,102,101,75,94,74,115,97,126,73,99,98,71,100,71,120,106,70,96,99,73,114,113,73,91,68,111,72,95,99,69,114,103,93,65,97,111,69,113,101,183,95,99,111,86,112,84,95,65,93,69,90,93,64,88,66,93,98,68,100,65,91,93,95,97,91,62,118,66,96,91,68,90,68,95,91,70,92,67,99,88,62,88,87,86,86,63,93,62,86,94,61,104,86,61,87,66,87,64,86,90,58,92,82,86,64,84,105,59,86,59,84,60,82,83,61,88,60,103,58,83,55,87,60,90,84,84,84,56,112,60,91,63,88,96,61,99,62,87,57,89,85,62,93,68,124,91,93,61,87,57,82,85,64,88,59,89,58,90,91,61];

// ── ★真实实报流(Trace-20261006T033001,用户机 subtle+cap120)──
//  主循环链 rAF FunctionCall 实拍,s10-s13 在册稳态切片(无 stall,max delta 13.5ms)。
//  v9.11 跟满语料:超速流(≈126/s)逐回调全渲、帧距=流距逐位;变异证红=累计器同流
//  限速 120(skip 16/359,读数钳 120——95fps 上限/压着抖同族)。
const LIVE_DELTAS_X10 = [65,72,81,88,87,86,75,81,88,78,84,90,77,81,67,81,68,83,48,91,127,83,103,105,95,74,77,81,84,79,87,86,79,81,83,85,91,82,58,68,80,87,53,70,74,79,81,86,79,87,84,68,78,90,57,61,83,76,80,74,83,83,85,76,66,81,59,85,69,78,79,83,78,79,78,84,91,63,80,76,65,73,87,82,66,76,78,89,75,89,63,79,68,91,65,76,79,75,69,89,76,82,89,77,84,92,94,70,79,91,82,77,83,86,87,76,92,90,68,85,90,83,63,88,71,54,80,79,68,91,80,115,48,82,73,82,86,90,76,82,70,88,54,84,76,87,56,85,79,75,83,84,80,71,73,65,99,130,78,55,97,95,135,61,58,83,90,79,84,82,82,65,83,60,84,87,54,68,73,86,89,79,87,83,75,88,84,80,85,92,82,75,91,86,81,84,60,85,129,82,65,80,85,89,78,84,79,86,86,88,79,81,83,81,69,63,75,93,49,79,77,77,75,82,86,90,75,84,100,77,77,84,80,70,81,64,77,94,51,66,90,81,86,73,84,89,80,79,94,79,86,85,64,86,65,84,63,67,73,85,72,85,79,88,86,86,86,82,75,83,83,91,85,75,87,80,84,77,71,71,92,62,82,82,110,92,97,79,94,76,83,89,87,74,84,77,73,66,81,91,39,85,74,80,87,79,84,83,91,83,74,94,82,79,66,90,56,94,75,65,63,77,80,92,73,87,80,75,86,51,90,61,81,87,67,82,72,82,84,87,65,89,60,84,70,77,81,67,75,89,79,85,75,76,62,75,89,63,73];
const LIVE_COSTS_X10 = [0,48,43,52,45,63,40,52,41,50,40,52,44,59,38,66,38,60,40,0,50,59,40,83,43,51,47,48,42,53,44,55,42,49,38,47,41,51,43,0,51,53,37,45,61,43,50,40,63,45,56,45,54,40,49,37,42,53,42,49,38,54,41,56,40,50,40,0,49,43,53,39,51,39,63,39,60,51,0,64,0,53,44,53,44,65,41,60,40,51,39,0,51,55,41,64,42,44,57,46,66,45,65,44,52,46,69,44,64,45,54,43,53,45,55,42,61,44,51,40,49,42,46,0,62,0,41,61,43,49,41,50,39,49,38,45,41,61,40,59,38,48,39,0,52,43,48,0,60,41,56,40,54,37,49,36,46,40,59,42,0,50,48,51,0,43,48,41,59,43,56,39,45,37,0,57,0,47,42,49,38,55,39,48,37,49,42,50,43,50,41,47,39,53,40,47,43,0,51,59,56,0,42,46,40,47,37,48,43,47,40,48,38,48,38,55,0,49,39,42,50,40,49,38,60,39,50,40,46,38,59,41,60,38,50,40,0,51,0,51,42,50,47,53,42,63,45,53,42,61,40,48,42,0,54,0,54,43,53,42,50,39,48,41,55,39,49,43,47,40,61,42,48,41,60,40,53,41,50,38,71,40,57,39,53,39,49,40,50,46,50,44,53,43,61,41,49,39,49,51,0,52,43,46,42,48,41,51,41,50,44,50,44,50,39,52,42,0,64,52,37,40,47,39,57,42,60,40,77,41,0,51,41,50,44,47,39,55,39,65,40,53,38,0,47,58,39,46,53,40,67,42,51,41,54,0,52,44,40,55];

// ── ★v9.10 时代定谳语料(Trace-20261008T114436,用户机 dist-analyze)──
//  主循环链 rAF FunctionCall('loop')实拍,去双重记账后 2538 回调/21.6s;×10 定点还原
//  ms。会话本相=回调流 117.7/s 宽抖动(p5 4.9/p50 8.2/p95 14.2,max 31.7——超/欠速混合)。
//  v9.11 跟满锁语料:逐回调全渲、帧距=流距逐位(该语料曾定谳 v9.10 处方,今随累计器
//  退役改作跟满语义锁)。
const T114436_DELTAS_X10 = [
114,116,105,128,84,69,87,79,90,90,74,75,68,82,69,81,97,126,88,46,69,71,52,80,48,143,161,71,63,82,77,56,56,25,109,93,49,48,134,87,100,97,77,65,61,76,58,55,95,107,88,61,83,104,134,85,81,102,128,114,71,59,84,86,82,58,10,79,108,84,55,24,163,86,56,110,87,89,49,50,79,8,116,161,116,90,92,80,68,69,92,108,74,84,57,88,105,128,94,79,61,67,127,82,57,125,84,58,99,112,86,90,106,62,114,77,136,92,61,68,84,56,14,68,65,160,80,59,109,108,82,74,93,88,95,103,81,79,63,78,110,102,126,87,64,70,53,54,76,148,80,85,137,70,63,87,124,74,56,68,59,16,75,56,47,71,116,130,122,143,110,100,67,68,85,107,87,129,96,86,73,73,100,78,79,61,80,56,52,69,84,76,55,53,71,66,69,129,80,109,79,60,163,66,68,68,51,67,66,41,52,68,74,50,87,56,159,90,78,62,63,61,15,74,9,55,78,160,79,85,58,49,68,75,59,65,71,83,56,92,86,78,88,93,71,74,86,147,84,158,87,75,87,110,133,85,83,82,54,83,82,59,81,70,20,154,138,92,84,85,112,102,107,53,67,138,99,86,52,130,81,170,53,63,121,86,139,84,98,53,66,58,49,76,79,49,78,45,90,91,85,104,71,68,83,62,63,78,114,86,84,78,90,96,102,57,75,60,67,136,104,144,113,129,105,137,90,73,47,62,69,72,85,104,85,118,86,56,67,32,82,109,87,132,74,56,12,79,54,50,54,86,81,76,82,59,58,69,96,106,126,73,93,89,70,72,101,130,86,79,50,137,67,48,87,74,75,23,51,70,143,93,121,92,79,52,64,73,56,54,84,64,50,51,75,85,53,66,53,85,223,93,74,75,94,70,84,72,138,93,56,86,99,133,90,142,91,54,75,81,81,59,61,160,152,82,71,81,97,107,129,75,139,86,137,92,126,90,108,74,82,84,108,95,63,57,110,135,125,80,66,74,62,65,67,81,82,147,75,66,60,52,57,89,76,57,82,130,98,125,85,60,120,81,117,72,75,91,101,80,61,96,87,142,69,80,75,139,84,111,103,83,67,77,83,122,100,85,54,89,59,49,14,61,146,147,124,107,70,72,102,85,97,83,64,114,99,70,57,71,57,75,65,58,73,91,83,74,84,55,55,80,60,144,77,55,76,83,91,69,63,73,62,54,77,72,139,170,95,57,52,76,51,73,68,59,88,61,69,89,78,141,96,88,65,120,82,71,72,88,75,52,82,55,46,76,73,76,26,83,78,64,90,66,31,68,65,83,77,86,84,85,85,96,64,81,89,69,67,91,73,63,67,84,67,39,76,80,99,110,84,103,218,85,114,73,59,62,79,88,148,85,124,78,67,72,59,70,74,66,152,79,120,51,97,81,151,73,131,90,61,113,79,85,53,64,13,68,65,36,93,73,89,82,105,83,91,73,63,78,170,89,68,52,81,49,97,86,134,84,113,101,108,64,50,53,69,24,87,65,82,70,51,81,78,55,88,56,91,69,158,82,116,96,58,52,73,55,63,56,91,73,81,78,95,82,56,91,135,83,59,67,95,25,61,69,163,93,120,91,74,88,79,84,81,75,75,106,91,100,78,70,80,126,87,149,84,141,91,140,129,127,113,84,55,70,83,80,80,98,99,72,50,56,63,99,92,105,79,115,65,73,82,79,53,89,76,79,85,110,89,131,56,78,80,84,92,139,65,59,89,80,88,126,83,162,88,82,50,53,27,86,134,85,148,90,64,67,56,55,157,90,128,81,153,90,65,59,87,54,51,90,56,66,91,56,51,69,150,86,70,118,74,69,78,136,84,143,139,97,95,69,48,24,78,65,50,22,72,93,26,81,82,69,106,80,94,79,108,82,104,211,86,125,85,60,78,82,178,82,80,51,61,50,75,88,135,84,145,80,93,69,63,92,53,100,111,88,58,79,93,101,130,90,92,62,114,85,155,79,139,73,106,94,57,114,67,48,50,28,82,55,51,69,57,65,56,54,103,89,73,115,80,151,89,151,83,97,91,118,71,49,81,50,65,62,145,79,73,84,137,93,93,67,46,144,133,74,53,64,69,80,94,37,85,93,89,59,95,75,149,82,108,85,119,80,69,88,108,83,70,52,55,67,60,54,68,97,93,93,82,82,85,85,90,76,83,77,93,59,67,84,104,76,69,14,71,67,45,62,73,59,61,68,85,127,93,96,136,91,73,64,128,84,116,67,138,79,54,78,108,90,127,105,147,100,55,69,54,60,80,71,70,85,75,77,77,86,23,142,70,45,57,62,45,72,74,58,65,75,52,63,93,63,65,52,163,83,117,67,50,48,80,70,61,68,71,68,77,76,72,61,86,51,66,77,105,103,147,86,73,87,119,79,63,86,151,82,66,93,73,78,64,48,129,85,111,66,54,145,73,65,68,63,79,72,46,134,89,94,123,91,87,61,79,133,154,78,55,80,59,106,131,112,116,64,83,61,97,98,70,62,49,64,75,90,77,53,9,64,59,69,53,121,140,64,74,84,122,106,133,105,49,61,63,68,64,90,82,106,101,81,85,93,86,51,85,74,80,136,83,102,97,127,88,131,84,139,85,139,77,122,90,127,84,60,59,75,56,71,96,65,51,49,90,88,67,76,89,95,82,90,82,79,91,61,88,92,58,55,80,105,117,113,72,66,72,53,83,92,128,49,99,84,135,81,115,94,86,104,104,128,83,101,133,83,98,67,80,91,107,92,70,87,75,64,79,83,84,72,92,140,87,100,115,67,68,63,63,22,151,137,82,88,98,87,74,53,93,83,124,88,49,83,70,55,26,92,53,94,77,76,88,69,65,85,81,75,96,53,60,79,100,67,74,64,72,87,60,79,62,67,92,78,63,143,82,77,53,82,76,19,142,149,89,66,47,71,93,88,96,79,104,90,85,107,92,99,95,97,80,100,94,108,137,75,157,63,43,82,57,97,75,111,57,76,71,69,76,73,70,94,66,83,77,57,73,100,106,108,90,99,126,85,54,96,87,63,89,77,139,91,50,81,82,81,50,92,90,125,49,97,90,133,84,151,82,67,74,126,88,145,83,121,65,114,62,51,48,46,74,121,117,79,57,90,86,90,48,18,120,49,114,46,103,79,152,67,57,72,68,19,145,87,77,52,81,118,169,65,82,70,72,168,86,100,65,78,91,130,77,108,86,53,162,87,95,83,138,68,49,72,81,61,81,62,50,50,56,67,93,68,70,78,34,62,80,156,80,84,128,87,50,77,74,112,121,110,122,106,71,57,123,78,51,48,74,44,99,82,74,66,92,146,85,114,69,123,67,129,85,72,79,119,88,127,97,132,111,121,71,61,23,90,128,86,140,70,71,78,49,61,75,45,76,59,79,71,149,93,133,81,120,69,72,84,109,94,127,77,77,92,70,48,55,68,88,51,104,146,71,67,90,78,151,91,91,136,81,124,52,168,74,165,88,148,94,99,81,70,75,90,111,51,114,50,60,85,52,28,134,168,135,113,116,88,90,68,54,68,15,83,128,71,141,73,48,46,14,62,26,72,64,80,51,61,291,89,83,63,102,71,44,60,63,113,88,121,93,95,92,75,66,75,101,81,53,59,70,87,84,63,38,65,87,50,99,85,133,87,140,79,86,128,52,90,90,135,86,89,55,80,84,165,87,56,75,116,69,69,80,157,85,106,82,90,55,50,11,106,69,105,88,93,73,49,53,74,62,82,139,91,171,97,114,124,69,44,49,71,77,46,69,81,91,72,84,91,74,92,144,82,61,99,96,69,47,68,64,88,91,66,82,82,69,58,98,91,84,68,65,85,92,113,128,87,75,71,123,82,63,72,93,111,76,99,88,51,58,73,58,75,62,79,56,77,90,41,116,97,75,62,64,91,97,84,142,87,86,56,44,60,115,89,70,46,51,58,19,78,61,90,106,119,89,66,82,97,73,75,77,72,71,92,71,165,82,117,94,92,140,78,119,114,90,77,135,103,81,102,111,82,88,73,115,65,60,124,91,101,138,82,151,88,112,96,78,51,61,53,61,80,154,83,50,48,64,83,52,62,51,51,72,72,76,64,93,73,91,70,86,85,72,146,79,95,88,111,96,128,48,58,128,88,132,82,112,59,89,90,103,52,108,101,66,70,86,57,86,91,65,47,141,124,158,70,76,63,74,83,138,82,105,88,90,114,93,130,67,51,84,55,71,53,86,87,65,77,90,63,125,129,66,50,45,80,44,84,149,84,106,65,61,69,49,48,73,164,78,120,64,63,83,65,28,54,102,84,103,56,99,89,152,73,109,95,88,65,55,129,129,84,117,119,84,59,88,51,73,45,50,63,55,138,151,68,52,87,86,62,45,64,74,59,69,65,65,69,68,68,162,86,150,91,99,109,97,117,77,53,46,53,94,126,85,152,79,105,84,48,88,90,65,50,73,64,68,65,165,78,70,93,113,66,79,74,91,69,52,26,88,56,65,91,131,79,123,73,113,67,67,86,128,80,91,90,133,88,155,90,103,67,54,152,107,114,116,99,88,50,132,80,103,83,128,66,79,84,131,85,65,74,78,104,63,67,48,95,87,63,83,116,94,62,75,133,71,94,56,72,87,183,63,54,53,51,120,82,51,105,85,103,146,101,72,68,89,114,89,94,86,71,100,90,68,74,68,104,93,142,92,142,87,68,67,20,74,65,52,83,54,62,71,78,153,82,86,90,94,99,59,59,71,23,58,174,88,144,74,67,75,84,86,49,85,87,82,52,73,50,49,65,84,67,30,55,65,79,71,63,85,72,73,228,79,91,86,120,83,122,85,73,156,69,76,124,101,65,72,77,90,317,166,91,127,99,65,55,121,101,70,51,124,104,94,134,123,103,87,71,74,56,79,55,109,88,87,72,67,73,86,22,70,149,88,149,92,138,84,154,83,82,48,86,51,126,88,50,43,65,90,125,90,80,80,64,42,51,75,92,62,46,56,58,180,64,105,60,72,47,73,134,143,49,65,85,69,65,83,79,80,141,87,148,86,65,60,84,67,98,69,49,81,93,74,60,47,60,60,28,139,158,72,82,55,82,85,76,14,48,66,170,120,130,79,91,51,60,54,90,98,129,78,82,81,102,84,142,82,123,83,69,85,140,78,60,79,79,45,54,55,91,45,70,148,143,113,99,96,67,72,136,83,150,91,132,86,129,88,107,67,55,69,76,22,111,176,113,104,113,120,96,119,120,104,93,58,95,81,98,85,131,82,76,49,94,83,136,55,80,86,67,50,52,62,151,132,128,91,111,77,99,109,107,86,95,99,103,118,101,65,85,70,92,117,85,64,45,149,59,80,84,73,95,114,90,105,100,121,66,58,79,86,75,93,65,55,75,106,78,87,83,80,84,83,93,84,66,77,82,67,80,81,60,84,57,77,131,83,146,80,136,82,156,83,102,94,139,62,67,64,44,82,83,87,113,124,87,64,78,125,95,137,66,45,64,30,48,59,64,93,210,91,92,48,50,63,75,70,57,54,61,70,114,52,45,44,90,52,71,55,72,145,94,135,81,99,137,80,162,85,110,92,48,81,78,58,88,81,105,110,46,49,140,75,107,64,75,88,43,124,92,116,91,116,86,60,46,73,7,93,91,109,125,88,130,116,64,66,99,136,85,69,92,83,72,75,91,120,78,74,77,160,83,140,85,118,83
];

// ── ★v9.11 变异体(红判别器):「恢复累计器」的机械复刻=v9.9 相位锚定(_nextDue 步进)
//  + v9.10 dEst 预测式提前量(3 样本环形中位,钳 [2, target×0.9],首 3 样本 0.75 兜底)
//  + fp 刀刃容差 1e-6——累计器任一形态复活的机械变异(影子字段自持,不依赖已拆引擎面)。
//  红面(头注 v9.11 定谳链):skip/帧距混样/重锚顺延/限速钳。
class AccumulatorBeat extends FrameBeat {
  private myDue = -1;
  private ring: number[] = [];
  private lastTs = -1;
  override shouldRender(now: number): boolean {
    if (this.cap <= 0) return true;
    if (this.myDue < 0) return true;
    const lead = this.ring.length < 3
      ? 0.75
      : Math.min(Math.max([...this.ring].sort((a, b) => a - b)[1], 2), this.targetMs() * 0.9);
    return now >= this.myDue - lead - 1e-6;
  }
  override observeVsync(now: number, cap: number): void {
    if (this.lastTs >= 0 && now - this.lastTs <= 250) {
      this.ring.push(now - this.lastTs);
      if (this.ring.length > 3) this.ring.shift();
    }
    this.lastTs = now;
    super.observeVsync(now, cap);
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

/** ★v9.7 k 迁移面机械变异(红判别器):migrationEnabled 钩覆写=true(整链恢复容量扫拍/
 *  minK 地板/滞回升拍/失拍降档)+旧序数落拍 shouldRender(4.5=已退役时间门常数内联) */
class OldMigrationBeat extends FrameBeat {
  protected override migrationEnabled(): boolean { return true; }
  override shouldRender(now: number): boolean {
    if (this.ordinal < this.k) return false;
    return now - this.lastRenderAt >= 1000 / 120 - 4.5;
  }
}

/** 语料回放驱动器(渲染成本=轻载 3ms 会话本相;cap=120) */
const replayCorpus = (make: () => FrameBeat, deltas: number[], costs?: number[]) => {
  const beat = make();
  const cbs: number[] = [];
  const rendered: number[] = [];
  let t = 0;
  for (let i = 0; i < deltas.length; i++) {
    t += deltas[i];
    beat.observeVsync(t, 120);
    cbs.push(t);
    if (beat.shouldRender(t)) {
      beat.beginRender(t);
      rendered.push(t);
      beat.endRender(t + (costs ? costs[i] : 3));
    }
  }
  return { beat, cbs, rendered };
};

/** 暂停+云尖峰流驱动器(CLOUD 4.5/9.0 宽分布;恢复段 7.9;可选 hold) */
const drivePauseCloud = (make: () => FrameBeat, withHold: boolean) => {
  const beat = make();
  const ks: number[] = [];
  const reasons: string[] = [];
  const pauseGaps: number[] = [];
  const gaps: number[] = [];
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
  return { beat, ks, reasons, gaps, pauseGaps };
};

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.11 跟满语义锁(帧距=流距逐位/零 skip/零迁移)', () => {
  it('形态①干净流:120Hz±10% 抖动 cap120 → 逐回调全渲(rendered≡回调序列逐位),k=1 零迁移', () => {
    const { beat, rendered, cbs } = runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 2400, jitter: 0.1 });
    expect(rendered).toEqual(cbs);                          // 跟满:渲染序列=回调序列(零 skip)
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    const st = gapStats(rendered.slice(40));
    expect(st.p50).toBeGreaterThan(HZ120 - 0.5);            // 帧距 p50=流距 8.33
    expect(st.p50).toBeLessThan(HZ120 + 0.5);
    expect(1000 / st.mean).toBeGreaterThan(117);            // 读数=流原生率(measured 119.9)
    expect(1000 / st.mean).toBeLessThan(123);
  });

  it('形态②超速流跟满(真实语料 Trace-20261006T033001,≈126/s):零 skip,读数=流原生率(非 120 钳),est 诊断面零翻转', () => {
    // 用户裁决面(头注 v9.11):v9.9 同流限速 120(343/359 渲染、读数 p50 119.9)=「被压着」;
    // v9.11 跟满=逐回调全渲、读数 p50≈126.7(流原生率)。红对照见变异证红块。
    const beat = new FrameBeat();
    let t = 0;
    const cbs: number[] = [];
    const rendered: number[] = [];
    const minKs = new Set<number>();
    for (let i = 0; i < LIVE_DELTAS_X10.length; i++) {
      t += LIVE_DELTAS_X10[i] / 10;
      beat.observeVsync(t, 120);
      minKs.add(beat.minK());
      cbs.push(t);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        beat.endRender(t + LIVE_COSTS_X10[i] / 10);
      }
    }
    expect(rendered).toEqual(cbs);                          // 跟满:零 skip
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    expect(minKs).toEqual(new Set([1]));                    // 诊断面:est 不跌破地板门槛(零翻转)
    const fps = fpsSeries(rendered);
    expect(q(fps, 0.5)).toBeGreaterThan(124);               // 跟满读数=流原生率(measured ~126.6,非 120 钳)
    expect(q(fps, 0.5)).toBeLessThan(131);
  });

  it('形态②b 用户实报语料(Trace-20261008T114436,117.7/s 超欠速混合):rendered≡回调序列逐位,帧距=流距', () => {
    // 该语料定谳过 v9.10 处方(累计器 2372→2438 渲染回收),v9.11 起改作跟满语义锁:
    // 「压着+抖」的真身=限速思想,恒渲后帧距=流距逐位(流本相即最优)。
    const CORPUS = T114436_DELTAS_X10.map((v) => v / 10);
    const { beat, rendered, cbs } = replayCorpus(() => new FrameBeat(), CORPUS);
    expect(rendered).toEqual(cbs);                          // 跟满:逐位相等
    expect(rendered.length).toBe(CORPUS.length);            // 零 skip
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    const fps = fpsSeries(rendered);
    expect(q(fps, 0.5)).toBeGreaterThan(110);               // 读数=流原生率带(measured ~117.7)
    expect(q(fps, 0.5)).toBeLessThan(126);
  });

  it('形态③render-bound 帧距=帧耗:cap120 帧耗 25ms → 逐回调全渲,帧距=流距(busy 钉死)=40fps 恒定零跳变', () => {
    const rb = runBeat({ vsync: HZ120, cap: 120, cost: 25, callbacks: 1200 });
    expect(rb.rendered).toEqual(rb.cbs);
    expect(rb.beat.k).toBe(1);
    expect(rb.beat.lastReason).toBe('init');
    const st = gapStats(rb.rendered.slice(40));
    expect(st.p50).toBeGreaterThan(24);
    expect(st.p50).toBeLessThan(26);
    expect(st.jumps).toBe(0);
    expect(1000 / st.mean).toBeGreaterThan(38);
    expect(1000 / st.mean).toBeLessThan(42);
  });

  it('形态④暂停+云尖峰(hold 双臂):k=1 零迁移,暂停段帧距=流本相 {4.5,9.0}(重锚顺延 13.5 面随累计器退役),恢复段帧距恒 7.9', () => {
    for (const withHold of [false, true] as const) {
      const { beat, ks, reasons, gaps, pauseGaps } = drivePauseCloud(() => new FrameBeat(), withHold);
      expect(ks.every((k) => k === 1)).toBe(true);
      expect(reasons.every((r) => r === 'init')).toBe(true);
      expect(beat.lastReason).toBe('init');
      expect(gapSet(pauseGaps)).toEqual(new Set([4.5, 9]));   // 帧距=流距逐位(流本相)
      const tail = gaps.slice(-250);
      expect(gapSet(tail)).toEqual(new Set([7.9]));           // 恢复段帧距恒 7.9(流本相)
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★cap 无效化(cap=意图非节拍;设置面 disabled 见 Settings 源锚)', () => {
  it('cap 0/30/60/120/240 同流零差异:全部逐回调全渲(rendered≡回调序列),k 恒 1', () => {
    for (const cap of [0, 30, 60, 120, 240]) {
      const { beat, rendered } = runBeat({ vsync: HZ120, cap, cost: 4, callbacks: 1200, jitter: 0.1 });
      expect(rendered.length).toBe(1200);                   // cap 不钳不咬(跟满)
      expect(beat.k).toBe(1);
      expect(beat.lastReason).toBe('init');
    }
  });

  it('cap 变更 0→30→60→120 即时生效但零渲染差异:rendered≡回调序列连续(无重锚 skip),k/reason 恒 1/init', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    const cbs: number[] = [];
    const rendered: number[] = [];
    for (let i = 0; i < 400; i++) {
      const cap = i < 80 ? 0 : i < 140 ? 30 : i < 200 ? 60 : 120;
      while (grid <= prevT) grid += HZ120;
      const t = Math.max(grid, busy);
      prevT = t;
      cbs.push(t);
      beat.observeVsync(t, cap);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        busy = t + 5;
        beat.endRender(t + 5);
      }
    }
    expect(rendered).toEqual(cbs);                          // cap 变更=诊断面语义,渲染面无感
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
  });

  it('屏率绑顶面翻正:240Hz cap120 跟满 240(帧距 4.17)、cap60@120Hz 跟满 120(帧距 8.33)——cap 不再是天花板(v9.9 限速面退役)', () => {
    const hi = runBeat({ vsync: 1000 / 240, cap: 120, cost: 1, callbacks: 2400 });
    expect(hi.rendered).toEqual(hi.cbs);                    // 跟满 240(旧累计器限 120=红,见变异块)
    const stH = gapStats(hi.rendered.slice(40));
    expect(stH.p50).toBeGreaterThan(4.0);
    expect(stH.p50).toBeLessThan(4.4);
    expect(1000 / stH.mean).toBeGreaterThan(235);
    expect(1000 / stH.mean).toBeLessThan(245);
    const a = runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 2400 });
    expect(a.rendered).toEqual(a.cbs);                      // 跟满 120(旧累计器限 60=红,见变异块)
    const stA = gapStats(a.rendered.slice(40));
    expect(stA.p50).toBeGreaterThan(HZ120 - 0.5);
    expect(stA.p50).toBeLessThan(HZ120 + 0.5);
    expect(stA.jumps).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.11 变异证红(双向):恢复累计器任一形态 → 跟满语义红;现役同流绿', () => {
  it('红(累计器 LIVE 超速流):skip 限速钳(渲染<回调、读数钳 120)=「被压着」复现;绿:零 skip 跟满读数=流原生率', () => {
    const deltas = LIVE_DELTAS_X10.map((v) => v / 10);
    const costs = LIVE_COSTS_X10.map((v) => v / 10);
    const green = replayCorpus(() => new FrameBeat(), deltas, costs);
    const red = replayCorpus(() => new AccumulatorBeat(), deltas, costs);
    expect(green.rendered).toEqual(green.cbs);              // 绿:跟满零 skip
    const fpsG = fpsSeries(green.rendered);
    expect(q(fpsG, 0.5)).toBeGreaterThan(124);              // 绿:读数=流原生率(measured ~126.6)
    expect(red.rendered.length).toBeLessThan(red.cbs.length);   // 红:累计器 skip(限速本相;measured 343/359)
    expect(red.rendered.length).toBeGreaterThanOrEqual(320);    // 不过度钳(skip ≤11%)
    const fpsR = fpsSeries(red.rendered);
    expect(q(fpsR, 0.5)).toBeLessThan(123);                 // 红:读数被钳 120 带(measured 119.9)
  });

  it('红(累计器深超速 5.5ms ticker):帧距 {5.5,11} 混样(skip)=「压着+抖」复现;绿:逐回调全渲帧距恒 5.5(流距逐位)', () => {
    const drive = (make: () => FrameBeat) => {
      const beat = make();
      const rendered: number[] = [];
      let t = 0;
      for (let i = 0; i < 3000; i++) {
        t += 5.5;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) { beat.beginRender(t); rendered.push(t); beat.endRender(t + 2); }
      }
      return rendered;
    };
    const green = drive(() => new FrameBeat());
    expect(green.length).toBe(3000);                        // 绿:跟满零 skip
    expect(gapSet(gapStats(green.slice(200)).gaps)).toEqual(new Set([5.5]));  // 帧距=流距逐位
    const red = drive(() => new AccumulatorBeat());
    expect(red.length).toBeLessThan(3000);                  // 红:累计器 skip(measured ~1980)
    expect(red.length).toBeGreaterThan(1900);
    const stR = gapStats(red.slice(200));
    expect(stR.std).toBeGreaterThan(2);                     // 红:帧距 {5.5,11} 混样=抖
  });

  it('红(累计器暂停+云尖峰):重锚顺延帧距 13.5 混入=「限速思想造帧距」复现;绿:暂停段帧距=流本相 {4.5,9}', () => {
    const red = drivePauseCloud(() => new AccumulatorBeat(), false);
    expect(gapSet(red.pauseGaps)).toEqual(new Set([4.5, 9, 13.5]));   // 红:重锚顺延(measured v9.9)
    const green = drivePauseCloud(() => new FrameBeat(), false);
    expect(gapSet(green.pauseGaps)).toEqual(new Set([4.5, 9]));       // 绿:流本相
  });

  it('红(累计器 240Hz cap120):每 2 回调一渲(屏率天花板被钳)=「以前可以上 120」的反面复现;绿:跟满 240', () => {
    const drive = (make: () => FrameBeat) => runBeat({ vsync: 1000 / 240, cap: 120, cost: 1, callbacks: 2400, make });
    const green = drive(() => new FrameBeat());
    expect(green.rendered).toEqual(green.cbs);              // 绿:2400/2400 跟满
    const red = drive(() => new AccumulatorBeat());
    expect(red.rendered.length).toBeLessThan(1300);         // 红:累计器限 120(measured ~1200)
    expect(red.rendered.length).toBeGreaterThan(1100);
    const stR = gapStats(red.rendered.slice(40));
    expect(stR.p50).toBeGreaterThan(8);                     // 红:帧距 8.33(半流距)
    expect(stR.p50).toBeLessThan(8.7);
  });

  it('红(k 迁移面 OldMigrationBeat,暂停+云尖峰流 v9.7 定谳形态):est 跨 7.08 地板门槛 → floor 落刀 k=2+升拍梯爬回=振荡复现;绿:零迁移', () => {
    const red = drivePauseCloud(() => new OldMigrationBeat(), false);
    expect(red.ks).toContain(2);
    expect(red.reasons).toContain('floor');
    expect(red.reasons).toContain('upgrade');
    const green = drivePauseCloud(() => new FrameBeat(), false);
    expect(green.ks.every((k) => k === 1)).toBe(true);
    expect(green.reasons.every((r) => r === 'init')).toBe(true);
    expect(green.beat.k).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★v9.11 退役态锁(k 恒 1/诊断面/hold 兼容/不追赶)', () => {
  it('k 恒 1 跨流族(轻载/render-bound/收紧/暂停云流)且 lastReason 恒 init——拍字段冻结为退役态', () => {
    const streams: FrameBeat[] = [];
    streams.push(runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 600 }).beat);
    streams.push(runBeat({ vsync: HZ120, cap: 120, cost: 25, callbacks: 600 }).beat);
    streams.push(runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 600 }).beat);
    const { beat } = drivePauseCloud(() => new FrameBeat(), true);
    streams.push(beat);
    for (const b of streams) {
      expect(b.k).toBe(1);
      expect(b.lastReason).toBe('init');
    }
  });

  it('hold 兼容保留(v9.7 语义 no-op):暂停期渲染照常(恒渲不受 hold 冻结),观测面不冻(est 照常采样),snapshot.hold 诊断面', () => {
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
    expect(pauseRenders).toBe(600);                 // 恒渲:暂停期每回调照渲(hold 不冻结渲染)
    expect(beat.snapshot().hold).toBe(true);
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('init');
    expect(estBefore[estBefore.length - 1]).toBeLessThan(7.5);  // 观测面不冻:est 跟随暂停期云形态
  });

  it('失拍吸附语义保留(恒渲天然不追赶中途):合成器停滞 30ms 后首回调即渲,无解堵连发', () => {
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
      beat.observeVsync(t, 0);                 // cap=0:逐回调全渲口径
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

/** 估计器红判别器旧侧(截尾均值;现役本体即此——诊断面逐位一致锁的参照) */
class LegacyEstBeat extends FrameBeat {
  protected override estimateVsync(): number {
    return this.legacyEstimate();
  }
}

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
describe('三档语义锁(源锚)', () => {
  it('Game.start():beat 调用面接线(observeVsync/shouldRender/beginRender/endRender/hold);v9.11 分支合并(cap=意图非节拍注)', () => {
    expect(GAME).toContain("import { FrameBeat } from './FrameBeat';");
    expect(GAME).toContain('this.beat.hold(this.paused || this._entryFreeze != null || this._tpVeil)');
    expect(GAME).toContain('this.beat.observeVsync(now, options.data.frameCap)');
    expect(GAME).toContain('if (!this.beat.shouldRender(now))');
    expect(GAME).toContain('this.beat.beginRender(now)');
    expect(GAME).toContain('this.beat.endRender(performance.now())');
    expect(GAME).not.toContain("if (mode === 'subtle') this.beat.endRender");
    // ★v9.11:三档节拍分支合并(渲染面恒跟满后分支无代码差)+旧被动门退役
    expect(GAME).not.toContain("const mode = options.data.frameSkipMode");
    expect(GAME).not.toContain('1000 / cap - 1');
    expect(GAME).toContain('cap=意图非节拍');
    expect(GAME).toContain('62624');   // 原版锚注释:EndDraw 忙等 present 网格
  });

  it('Game.start():shouldRender 门先于 _paintedFrames++(whenFirstPaint 只认真实渲染帧;现役恒渲=分支保留面)', () => {
    const iSkip = GAME.indexOf('if (!this.beat.shouldRender(now))');
    const iPaint = GAME.indexOf('this._paintedFrames++');
    expect(iSkip).toBeGreaterThan(-1);
    expect(iPaint).toBeGreaterThan(-1);
    expect(iSkip).toBeLessThan(iPaint);
  });

  it('SuppressDraw 旧分支已退役(0 步进帧照画,与 improved-subtle 同相)', () => {
    expect(GAME).not.toMatch(/frameSkipMode === 'subtle' && steps === 0/);
    expect(GAME).toContain('62624');   // 注释锚:EndDraw 忙等 present 网格
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

  it('常数处方锁(判据常数族保留=迁移闸内史档+红判别器复刻面;★v9.11:渲染门常数族 TARGET_GUARD_MS/DUE_* 随累计器整族退役)', () => {
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

  it('★v9.11 引擎源锚(防回改):shouldRender 恒真(无累计器/无时间门/无 cap 钳);累计器面(_nextDue/cbRing/dueLeadMs/门常数族)类体拆净;migrationEnabled 闸=false 且判据组整段保留在闸内;resetSampling k 恒 1;est≡截尾均值(诊断面)', () => {
    const iShould = BEAT.indexOf('shouldRender(now: number): boolean');
    const iCapBreach = BEAT.indexOf('protected capacityBreach');
    expect(iShould).toBeGreaterThan(-1);
    expect(iCapBreach).toBeGreaterThan(iShould);
    const shouldSrc = BEAT.slice(iShould, iCapBreach);
    expect(shouldSrc).toContain('return true;');
    expect(shouldSrc).not.toContain('_nextDue');
    expect(shouldSrc).not.toContain('dueLeadMs');
    expect(shouldSrc).not.toContain('lastRenderAt');
    expect(shouldSrc).not.toContain('1000 / cap');
    expect(BEAT).toContain('void now;');
    // 类体:累计器机制面拆净(决策参数不再存在;头注史档注不计——从 class 起切)
    const cls = BEAT.slice(BEAT.indexOf('export class FrameBeat'));
    expect(cls).not.toContain('cbRing');
    expect(cls).not.toContain('this._nextDue');
    expect(cls).not.toContain('dueLeadMs');
    expect(cls).not.toContain('TARGET_GUARD_MS');
    expect(cls).not.toContain('DUE_GUARD_MS');
    expect(cls).not.toContain('VSYNC_LEAD_RING');
    expect(cls).not.toContain('DUE_LEAD_MIN_MS');
    expect(cls).not.toContain('DUE_FP_EPS_MS');
    // 退役闸本体=false;迁移决策面整段保留在闸内(红判别器 OldMigrationBeat 复刻点)
    expect(BEAT).toContain('protected migrationEnabled(): boolean');
    expect(BEAT).toMatch(/migrationEnabled\(\): boolean \{\s*return false;/);
    const iGate = BEAT.indexOf('if (this.migrationEnabled()) {');
    expect(iGate).toBeGreaterThan(-1);
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
  });

  it('★v9.11 头注登记锚(用户裁决原话+单链数学+产品定谳+历次实报归一;v9.8/v9.9/v9.10 史档注保留)', () => {
    expect(BEAT).toContain('★v9.11 终局刀=跟满回归');
    expect(BEAT).toContain('像是被什么奇怪的算法一直压着,以前我们都可以上 120');
    expect(BEAT).toContain('累计器限速就是那只手');
    expect(BEAT).toContain('回调网格 5.27ms 与 cap 周期 8.33ms 非整数比');
    expect(BEAT).toContain('cap=意图非节拍');
    expect(BEAT).toContain('历次实报归一');
    expect(BEAT).toContain('读数=合成器实际节拍');
    // 史档:头注 v9.8/v9.9/v9.10 各注保留(退役=归档非抹史)
    expect(BEAT).toContain('★v9.8 根治刀');
    expect(BEAT).toContain('最简条件(暂停零渲染负载)下帧率都不稳=算法本身有问题,需要根治');
    expect(BEAT).toContain('★v9.9');
    expect(BEAT).toContain('★v9.10 预测式提前量');
    expect(BEAT).toContain('与 B2 的区别');
  });

  it('★v9.7 hold 兼容源锚(保留面):hold 早退在状态机前;floorRaiseDue 钩在;Game 侧 paused 单源接线先于 observeVsync;判据线/估计器零触碰', () => {
    expect(BEAT).toContain('hold(on: boolean): void');
    expect(BEAT).toContain('protected floorRaiseDue(): boolean');
    const iHoldBlock = BEAT.indexOf('if (this.holdOn) {');
    const iMachine = BEAT.indexOf('const vsync = this.vsyncPeriod;');
    expect(iHoldBlock).toBeGreaterThan(-1);
    expect(iHoldBlock).toBeLessThan(iMachine);
    // Game 侧接线:paused 单源+入场冻结窗+传送幕帘,且先于 observeVsync
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

  it('★v9.11 cap 退役保留面源锚:Settings frameCap 行 disabled+tooltip(Options 字段兼容存档);l10n 产物两语言含新键(既有键面不动)', () => {
    // Settings:disabled 行(hint=新 l10n 键;模式行仍显示存档值)
    expect(SETTINGS).toContain("{ disabled: true, hint: Lang.text('Mods.SandboxWorld.Settings.FrameCapFollowHint') }");
    expect(SETTINGS).toContain('btn.disabled = true');
    expect(SETTINGS).toContain("Lang.text('Mods.SandboxWorld.Settings.FrameCap')");
    // Options:字段保留(兼容存档;引擎不读 options——cap 经 observeVsync 注入)
    expect(OPTIONS).toContain('frameCap: number;');
    expect(OPTIONS).toContain('frameCap: 60,');
    // l10n 产物:新键两语言在位(build-l10n 重建;既有 FrameCap/FrameCapOff 键面不动)
    for (const f of ['public/l10n/zh-Hans.json', 'public/l10n/en-US.json']) {
      const j = JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
      const v = j.Mods?.['SandboxWorld.Settings.FrameCapFollowHint'] ?? j['Mods.SandboxWorld.Settings.FrameCapFollowHint'];
      expect(v, f).toBeTruthy();
    }
    // 引擎不读 options(cap=意图,经 observeVsync 注入——Settings 面退役不牵引擎面)
    expect(BEAT).not.toContain('options.data');
  });
});
