// ★C9c-v3→v4 live 门（v3=2026-09-27 粘性出场处方;v4=2026-09-28 进场简化终态）:
//  v2 出阈（live 态坏拍满 2→回退 warmup）在弱机成为横跳源——lag 20-60ms 震荡跨出阈
//  → live/warmup 交替=两源上屏闪烁;每次回退强制本地全周期=更卡→更深横跳正反馈。
//  v3=粘性 live:出场唯一条件=看门狗级硬故障（healthy() 2s 无回传/异常回执/onerror）。
//  ★v4 定谳（Windows 霜月+本机黄昏双 trace:worker 线程空闲而主线程跑本地光照双跑,
//  light 残部 9.5-12% 墙钟）:v3 修了出场但【进场条件】（连续 8 拍 lag≤25ms）在持续
//  高压下永不满足——lag=send→apply 含主线程消息调度,主线程忙 99% 时 lag 恒
//  50-200ms→8 连拍永不成→warmup 永久=双跑正反馈（v1 同病换阈复发）。v4=hasResult
//  （首个健康结果）即 live;lag 计拍退役为纯诊断;手动模式（?lightlag）保留 v1 绝对
//  阈全语义供探针强扭矩。
//  红判别器=忙机画像序列对照:同序列喂旧 v3 门（8 连拍进场资格复刻件）永不进 live
//  (红=永久双跑)、旧 v2 门横跳(红=闪烁源)、新 v4 门首结果即 live 恒定(绿);
//  真死态（dispose→dead→healthy false）仍正确回落。
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

/** 旧 v3 门步进复刻件（粘性出场+8 连拍进场资格版,2026-09-27）——v4 红判别器
 *  对照件,勿改:v4 定谳面=本件的进场资格在忙机画像下永不满足（warmup 永久化）。 */
function liveGateStepV3(
  live: boolean, good: number, bad: number, lag: number, hasResult: boolean,
): GS {
  const threshold = live ? LIGHT_LIVE_EXIT_MS : LIGHT_LIVE_ENTER_MS;
  if (lag > threshold) { bad++; good = 0; } else if (lag > 0) { good++; bad = 0; }
  if (!live) { if (hasResult && good >= 8) live = true; }
  return { live, good, bad, fell: false };
}

/** 忙机画像:v3 进场资格侧全风暴（lag 50-200ms 震荡,主线程忙 99% 的 send→apply
 *  端到端实测画像——远超进阈 25ms,8 连拍永不成）,穿插短促低位毛刺（不构成
 *  8 连拍）——「持续高压」=霜月/黄昏 trace 的稳态,非 v2 复刻件的间歇风暴。 */
const BUSY_MACHINE: number[] = [];
for (let cycle = 0; cycle < 4; cycle++) {
  for (const lag of [50, 46, 52, 48, 55, 60, 44, 30, 50, 47]) BUSY_MACHINE.push(lag);
}

function runSequence(step: (l: boolean, g: number, b: number, lag: number, hr: boolean) => GS) {
  let s: GS = { live: false, good: 0, bad: 0, fell: false };
  let flips = 0;
  let prev = s.live;
  for (const lag of BUSY_MACHINE) {
    s = step(s.live, s.good, s.bad, lag, true);
    if (s.live !== prev) flips++;
    prev = s.live;
  }
  return { flips, final: s };
}

describe('C9c-v4 进场简化（弱机永久 warmup 根治）', () => {
  it('红判别器:忙机画像（lag 50-200ms 震荡）下旧 v3 门永不进 live（红=永久双跑）', () => {
    const oldR = runSequence(liveGateStepV3);
    expect(oldR.final.live).toBe(false);            // 8 连拍永不成=warmup 永久化(红)
    expect(oldR.flips).toBe(0);                     // 恒 warmup,零翻转
    const oldV2 = runSequence(liveGateStepV2);
    expect(oldV2.final.live).toBe(false);           // v2 同样永拒(红)
  });

  it('绿判别器:同忙机画像下 v4 门首个健康结果即 live,仅进场 1 次翻转恒 live', () => {
    const newR = runSequence(liveGateStep);
    expect(newR.final.live).toBe(true);
    expect(newR.flips).toBe(1);                     // 唯一翻转=第 1 拍 warmup→live 进场
    // 第 1 拍即 live（进场的 hasResult 语义,与 lag 分布无关）
    const first = liveGateStep(false, 0, 0, BUSY_MACHINE[0], true);
    expect(first.live).toBe(true);
  });

  it('v2 复刻件对照:间歇风暴序列仍复现横跳（红判别器信号面 retained）', () => {
    // v2 原画像（平静段可进场+风暴段出场）:旧门横跳源对照保留
    let s: GS = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 8; i++) s = liveGateStepV2(s.live, s.good, s.bad, 5, true);
    expect(s.live).toBe(true);
    s = liveGateStepV2(s.live, s.good, s.bad, 46, true);
    s = liveGateStepV2(s.live, s.good, s.bad, 52, true);
    expect(s.live).toBe(false);                     // v2 出场=横跳源(红)
    // v4 同序列:恒 live
    let t: GS = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 8; i++) t = liveGateStep(t.live, t.good, t.bad, 5, true);
    t = liveGateStep(t.live, t.good, t.bad, 46, true);
    t = liveGateStep(t.live, t.good, t.bad, 52, true);
    expect(t.live).toBe(true);
  });

  it('真死态仍正确回落:dispose→dead→healthy()=false（看门狗级硬故障=唯一出场条件）', () => {
    const lw = new LightWorkerLink();
    expect(lw.healthy()).toBe(true);     // 未建链=首轮放行（既有契约）
    lw.dispose();                        // dead→看门狗判定不健康→引擎 compute() 永久回落
    expect(lw.healthy()).toBe(false);
  });

  it('诊断面:exitReason 字段（F5 既有 9 字段全兼容）+引擎看门狗出场源锚', () => {
    expect(lightGateDiag.exitReason).toBeNull();   // 缺省未出场
    for (const k of ['live', 'good', 'bad', 'p50Ms', 'lastLagMs', 'enterMs', 'exitMs', 'mode', 'ring']) {
      expect(Object.prototype.hasOwnProperty.call(lightGateDiag, k)).toBe(true);
    }
    const ENG = readFileSync(new URL('../src/lighting/LightingEngine.ts', import.meta.url), 'utf8');
    expect(ENG).toContain("lightGateDiag.exitReason = 'watchdog';");
    expect(ENG).toContain('lightGateDiag.live = false;');
  });
});
