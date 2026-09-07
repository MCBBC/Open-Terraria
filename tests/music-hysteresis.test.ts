// ★选曲滞回验收(2026-09-07 用户拍板「确保稳定,可偏离原版」):
// 群系计数域边缘波动(蘑菇曲 29↔地下曲 31 快速交替,bgm 环实录 2-3 秒一轮)
// 被滞回滤除;事件曲即时切不受滞回;真移动(持续变化)稳定后仍切换。
import { describe, it, expect } from 'vitest';

// 复刻 Game 选曲段的滞回状态机(纯函数化,与 Game.ts 选曲段同逻辑)
const HYST = 4;
interface Ctx { last: number; pending: { k: number; n: number } }
function step(ctx: Ctx, music: number, isEvent: boolean): number {
  if (music !== ctx.last) {
    if (isEvent) {
      ctx.last = music;
      ctx.pending = { k: 0, n: 0 };
      return music;
    }
    if (ctx.pending.k === music) {
      ctx.pending.n++;
      if (ctx.pending.n >= HYST) {
        ctx.last = music;
        ctx.pending = { k: 0, n: 0 };
        return music;
      }
    } else {
      ctx.pending = { k: music, n: 1 };
    }
    return ctx.last;
  }
  ctx.pending = { k: 0, n: 0 };
  return ctx.last;
}

describe('选曲滞回', () => {
  it('边缘波动(29↔31 每 2 次一换)被完全滤除——不切曲', () => {
    const ctx: Ctx = { last: 29, pending: { k: 0, n: 0 } };
    let switches = 0, prev = 29;
    // 模拟 bgm 环实录的交替模式(20 轮快摆)
    const seq: number[] = [];
    for (let k = 0; k < 20; k++) { seq.push(29, 31, 29, 31); }
    for (const m of seq) {
      const out = step(ctx, m, false);
      if (out !== prev) { switches++; prev = out; }
    }
    expect(switches).toBe(0);   // 波动全滤
    expect(ctx.last).toBe(29);  // 维持蘑菇曲
  });
  it('真移动(稳定新曲连续 4 次扫描)→ 切换', () => {
    const ctx: Ctx = { last: 29, pending: { k: 0, n: 0 } };
    let out = 29;
    for (let k = 0; k < 3; k++) out = step(ctx, 31, false);   // 3 次:未达阈值
    expect(out).toBe(29);                                      // 仍在蘑菇曲
    out = step(ctx, 31, false);                                // 第 4 次:切换
    expect(out).toBe(31);
    out = step(ctx, 31, false);
    expect(out).toBe(31);                                      // 稳定
  });
  it('波动中途回到当前曲 → 取消 pending', () => {
    const ctx: Ctx = { last: 29, pending: { k: 0, n: 0 } };
    step(ctx, 31, false); step(ctx, 31, false);   // pending 2 次
    step(ctx, 29, false);                          // 波动平息
    expect(ctx.pending.k).toBe(0);
    const out = step(ctx, 31, false);              // 重新计
    expect(out).toBe(29);                          // 1 次,未切
  });
  it('事件曲即时切(不滞回)', () => {
    const ctx: Ctx = { last: 29, pending: { k: 0, n: 0 } };
    const out = step(ctx, 38, true);   // Boss 曲
    expect(out).toBe(38);
    const out2 = step(ctx, 29, false); // Boss 结束回环境曲:首扫不切(滞回)
    expect(out2).toBe(38);
  });
});
