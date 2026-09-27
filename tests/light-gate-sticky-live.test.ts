// ★C9c-v3 粘性 live 门（2026-09-27 处方,用户实报弱机光照延迟更新闪烁定谳）:
//  v2 出阈（live 态坏拍满 2→回退 warmup）在弱机成为横跳源——lag 20-60ms 震荡跨出阈
//  → live/warmup 交替=两源上屏闪烁;每次回退强制本地全周期=更卡→更深横跳正反馈。
//  v3=粘性 live:lag 只作【进场资格】,入后出场唯一条件=看门狗级硬故障
//  （healthy() 2s 无回传/异常回执/onerror）。
//  红判别器=弱机画像序列对照:同序列喂旧 v2 门（本文件内置复刻件）N 次横跳(红)、
//  新 v3 门零横跳恒 live(绿);真死态（dispose→dead→healthy false）仍正确回落。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  liveGateStep, lightGateDiag,
  LIGHT_LIVE_ENTER_MS, LIGHT_LIVE_EXIT_MS,
} from '../src/lighting/LightingEngine';
import { LightWorkerLink } from '../src/lighting/LightWorkerLink';

type GS = { live: boolean; good: number; bad: number; fell: boolean };

/** 旧 v2 门步进复刻件（lag 驱动出场版,2026-09-25）——红判别器对照件,勿改 */
function liveGateStepV2(
  live: boolean, good: number, bad: number, lag: number, hasResult: boolean,
): GS {
  const threshold = live ? LIGHT_LIVE_EXIT_MS : LIGHT_LIVE_ENTER_MS;
  if (lag > threshold) { bad++; good = 0; } else if (lag > 0) { good++; bad = 0; }
  let fell = false;
  if (!live) { if (hasResult && good >= 8) live = true; }
  else if (bad >= 2) { live = false; good = 0; bad = 0; fell = true; }
  return { live, good, bad, fell };
}

/** 弱机画像:平静段（18-24ms ≤ 进阈 25ms,够 8 连好拍再进场）与风暴段（44-60ms
 *  全部超出阈 41.7ms,2 拍即触发旧门出场）交替 3 轮——用户机 lag 20-60ms 震荡画像 */
const WEAK_MACHINE: number[] = [];
for (let cycle = 0; cycle < 3; cycle++) {
  for (let i = 0; i < 9; i++) WEAK_MACHINE.push(18 + (i % 4) * 2);
  WEAK_MACHINE.push(46, 52, 48, 55, 60, 44);
}

function runSequence(step: (l: boolean, g: number, b: number, lag: number, hr: boolean) => GS) {
  let s: GS = { live: false, good: 0, bad: 0, fell: false };
  let flips = 0;
  let prev = s.live;
  for (let i = 0; i < 8; i++) s = step(s.live, s.good, s.bad, 5, true);   // 健康期进场
  prev = s.live;
  expect(prev).toBe(true);
  let falls = 0;
  for (const lag of WEAK_MACHINE) {
    s = step(s.live, s.good, s.bad, lag, true);
    if (s.fell) falls++;
    if (s.live !== prev) flips++;
    prev = s.live;
  }
  return { flips, falls, final: s };
}

describe('C9c-v3 粘性 live 门（弱机横跳定谳）', () => {
  it('红判别器:弱机画像序列下旧 v2 门横跳（出场>0）,新 v3 门零横跳恒 live', () => {
    const oldR = runSequence(liveGateStepV2);
    const newR = runSequence(liveGateStep);
    expect(oldR.falls).toBeGreaterThanOrEqual(3);   // 旧门:每轮风暴至少出场 1 次=横跳源(红)
    expect(oldR.flips).toBeGreaterThanOrEqual(oldR.falls);
    expect(newR.falls).toBe(0);                     // 新门:零 lag 出场
    expect(newR.flips).toBe(0);                     // 新门:零 live/warmup 横跳(绿)
    expect(newR.final.live).toBe(true);
  });

  it('进场资格不变:连续 8 拍 ≤进阈+已有结果才进 live;风暴期好拍连续性被打断则滞留 warmup', () => {
    let s: GS = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 8; i++) s = liveGateStep(s.live, s.good, s.bad, 24, true);
    expect(s.live).toBe(true);
    // 全风暴序列:好拍永远凑不齐 8 连→不得进场（资格语义 retained）
    let t: GS = { live: false, good: 0, bad: 0, fell: false };
    for (const lag of [50, 46, 52, 48, 55, 60, 44, 30, 50, 47]) t = liveGateStep(t.live, t.good, t.bad, lag, true);
    expect(t.live).toBe(false);
  });

  it('真死态仍正确回落:dispose→dead→healthy()=false（看门狗级硬故障=唯一出场条件）', () => {
    const lw = new LightWorkerLink();
    expect(lw.healthy()).toBe(true);     // 未建链=首轮放行（既有契约）
    lw.dispose();                        // dead→看门狗判定不健康→引擎 compute() 永久回落
    expect(lw.healthy()).toBe(false);
  });

  it('诊断面:exitReason 新增字段（F5 既有 9 字段全兼容）+引擎看门狗出场源锚', () => {
    expect(lightGateDiag.exitReason).toBeNull();   // 缺省未出场
    for (const k of ['live', 'good', 'bad', 'p50Ms', 'lastLagMs', 'enterMs', 'exitMs', 'mode', 'ring']) {
      expect(Object.prototype.hasOwnProperty.call(lightGateDiag, k)).toBe(true);
    }
    const ENG = readFileSync(new URL('../src/lighting/LightingEngine.ts', import.meta.url), 'utf8');
    expect(ENG).toContain("lightGateDiag.exitReason = 'watchdog';");
    expect(ENG).toContain('lightGateDiag.live = false;');
  });
});
