// 风场演变回归(2026-08-26 用户报"新存档都大风吹/风全为 0"两轮):
// ①新角色(<120 血)早期钳 ±0.35(Main.cs:58286-58289 !flag 分支)→cue45 门
//  (|wind|≥0.4,Main.cs:11739)永不打开=开局无风声;
// ②构造器不再预掷 windCounter(原版静态默认 0=首 tick 即掷,Main.cs 无 worldgen
//  初始化)——首 tick 双掷(增量+extreme)后 target 立即落位;
// ③≥120 血角色风可自由超过 0.4(原版允许大风)。
import { describe, it, expect } from 'vitest';
import { WeatherState } from '../src/world/weather/Weather';
import type { WeatherCtx } from '../src/world/weather/Weather';

const SEED = 12345;

function mkCtx(strong: boolean): WeatherCtx {
  return {
    dayRate: 1, dayTime: true, dayTimeTicks: 27000,
    playerStrongEnough: strong, playerReadyForKingSlime: false,
    expertMode: false, atmo: 1, aboveRockLayer: true,
    graveyardIntensity: 0, hardMode: false, noOtherEvent: true,
    downedSlimeKing: false, maxTilesX: 4200, worldSurface: 300, viewCenterY: 300 * 16,
  };
}

function run(strong: boolean, ticks: number, seed = SEED): { maxTarget: number; finalTarget: number; finalCur: number } {
  const w = new WeatherState(seed);
  const ctx = mkCtx(strong);
  let maxTarget = 0;
  for (let i = 0; i < ticks; i++) {
    w.update(ctx);
    maxTarget = Math.max(maxTarget, Math.abs(w.windSpeedTarget));
  }
  return { maxTarget, finalTarget: Math.abs(w.windSpeedTarget), finalCur: Math.abs(w.windSpeedCurrent) };
}

describe('风场演变(早期钳/首 tick 掷/大风允许)', () => {
  it('新角色(<120 血):1200t(20s)内 |target| 恒 ≤0.35(早期钳,cue45 门 0.4 永不开)', () => {
    const r = run(false, 1200);
    expect(r.maxTarget, `maxTarget=${r.maxTarget}`).toBeLessThanOrEqual(0.35 + 1e-9);
  });

  it('构造器不预掷:首 tick 即完成掷骰(t=2 时 target 已偏离 worldgen 初值档)', () => {
    // worldgen 初值 = rng.int(-800,800)×0.001(±0.8);首 tick 三级增量至少 ±0.025
    // 且 extreme 必掷(计数器 0→-1)——4 个种子抽查:tick2 的 |target| 不应仍等于初值
    for (const seed of [SEED, 1, 777, 20260826]) {
      const w = new WeatherState(seed);
      const ctx = mkCtx(true);
      const init = Math.abs(w.windSpeedTarget);
      w.update(ctx); w.update(ctx);
      const t2 = Math.abs(w.windSpeedTarget);
      // 首轮重掷可能恰好落回同值(±0.85 档命中初值)概率极低;抽查种子不命中
      expect(t2 === init && init > 0.5, `seed=${seed}: 两 tick 后 target 仍钉在初值 ${init}`).toBe(false);
    }
  });

  it('强制极端风:强玩家 |target|∈[0,0.86] 且 40 种子必现 >0.3 档;弱玩家钳 ≤0.36', () => {
    // 极端掷分支(Main.cs:59805-59817)产出【均匀区间】:13/30→[掷币:恰 0(带
    // 7200-28800t 长冷)|U±0.2];余 65%→U±0.4;再余→U±0.85;弱玩家两道 ±0.35 钳。
    // 强制触发 = 预置 windCounter=1 + extremeWindCounter=1(下 tick 周期与极端同至)
    const runForced = (seed: number, strong: boolean): number => {
      const w = new WeatherState(seed);
      const ctx = mkCtx(strong);
      w.update(ctx);
      w.windCounter = 1;
      w.extremeWindCounter = 1;
      w.update(ctx);
      return Math.abs(w.windSpeedTarget);
    };
    let sawBig = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t = runForced(seed, true);
      expect(t, `seed=${seed}: 强玩家极端 |target|=${t} 超 0.86 上界`).toBeLessThanOrEqual(0.86);
      if (t > 0.3) sawBig++;
      const tw = runForced(seed + 1000, false);
      expect(tw, `seed=${seed + 1000}: 弱玩家极端钳失效 |target|=${tw}`).toBeLessThanOrEqual(0.36);
    }
    // P(|t|>0.3)≈22%/种子 → 40 种子全不中概率 <0.1%
    expect(sawBig, `40 种子无一出现 >0.3 档(sawBig=${sawBig})`).toBeGreaterThan(0);
  });

  it('新角色 windGain 上限推算:钳 0.35 × MUL 色不变,cue45 门不开', () => {
    // 数值闭环:num7 = (0.35×0.7+0.3)×0.9 = 0.4905 < 门 0.4?? 不——门是风速不是 num7:
    // 门 = |windSpeedCurrent| ≥ 0.4,而钳后 current ≤ target ≤ 0.35 → 门恒关 ✓
    const r = run(false, 1200);
    expect(r.finalCur).toBeLessThan(0.4);
  });
});
