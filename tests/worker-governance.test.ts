// ★看门狗治理红绿（2026-09-28）——LightWorker/WaveWorker 同治共享语义锁。
//
// 定谳背景（Trace-20260928T132330 三遍亲扫,详见 src/workers/WorkerGovernance.ts 头注）：
//   93s 捕获窗内 LightWorker/WaveWorker 线程不存在,主线程全程本地扛 _step 23.21%
//   +blurLine 8.86%+exportTo 6.43%;窗内无 2s 级长任务 → 稳态 pickup 延迟误杀说证伪,
//   触发点=世界入场首次 spawn/首结果链:warmup 分支 now-startedAt>2000 按墙钟计时,
//   冷模块图取>2s 开局必杀,杀后零重生路径=永久回落。
// 三缺陷 → 三红绿面：
//   ①信号源:旧码「2s 无回传即杀」在 [warmup 冷取][隐藏恢复][主线程忙] 三场景误杀
//     → 新码 outstanding-aware+warmup 宽限+双拍确认闩,三场景全绿;真死场景仍杀（安全性零牺牲）。
//   ②去永久化:回落 → 5s/10s/20s 阶梯重生（wave shadow 双轨=水不静止）;?wwretry=0 逃生门。
//   ③指纹:fallsBy 三分类（onerror/no-result-dead/pickup-timeout）行为锁。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerWatchdog, ladderDelayMs, workerRetryEnabled,
  WORKER_WARMUP_BUDGET_MS, WORKER_STEADY_BUDGET_MS, WORKER_CONFIRM_MS } from '../src/workers/WorkerGovernance';

// ───────────────────────── A. WorkerWatchdog 时序状态机（纯单测,合成时钟） ─────────────────────────

describe('WorkerWatchdog·A1 真死场景（安全性零牺牲——旧判据的合法面保留）', () => {
  it('稳态真死:已产出 worker,在途请求年龄超 2s+双拍确认 → 定谳 no-result-dead', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0); wd.onResult(50);            // 首次往返健康（produced=1 → 稳态预算）
    wd.onSend(1000);                          // 之后 worker 静默停摆
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS - 1, false)).toBe(true);
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS + 1, false)).toBe(true);              // 超预算 → 武装拍
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS + 1 + WORKER_CONFIRM_MS - 1, false)).toBe(true); // 确认窗内
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS + 1 + WORKER_CONFIRM_MS, false)).toBe(false);    // 定谳
    expect(wd.fallReason()).toBe('no-result-dead');
  });

  it('warmup 真死:onerror 直杀（免闩,硬证据）', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0);
    expect(wd.healthy(1, true)).toBe(false);
    expect(wd.fallReason()).toBe('onerror');
  });
});

describe('WorkerWatchdog·A2 误杀三场景翻案（旧码红 → 新码绿）', () => {
  it('[定谳第一因] warmup 冷模块图取 3s:旧码 2s 即杀,新码 15s 预算内全绿', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0);   // 世界入场首快照发出,worker 模块图冷取中
    for (let t = 100; t <= 3000; t += 100) {
      expect(wd.healthy(t, false), `t=${t}ms 不得误杀`).toBe(true);
    }
    // 若此刻首结果终于回达 → 正常转稳态
    wd.onResult(3100);
    expect(wd.healthy(3200, false)).toBe(true);
  });

  it('[潜伏族] 隐藏恢复:outstanding=0 时回传缺席无信息量,跨 10 分钟陈旧恒不杀', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0); wd.onResult(16);   // 隐藏前最后一次往返完成
    // 隐藏 10 分钟:无发送无回传也无轮询;恢复后首拍 outstanding=0
    expect(wd.healthy(16 + 600_000, false)).toBe(true);
    // 恢复后正常收发,恒绿
    wd.onSend(600_050); wd.onResult(600_100);
    expect(wd.healthy(600_200, false)).toBe(true);
  });

  it('[残余竞态豁免] 双拍确认窗内结果回达冲账 → 解武装不定谳', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0); wd.onResult(20);
    wd.onSend(1000);
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS + 10, false)).toBe(true);  // 嫌疑武装
    wd.onResult(1000 + WORKER_STEADY_BUDGET_MS + 30);                            // 排队回达冲账
    expect(wd.healthy(1000 + WORKER_STEADY_BUDGET_MS + 300, false)).toBe(true); // 不定谳
  });

  it('主线程忙（231ms 级重帧,轮询间隔拉长）:在途年龄未超预算恒绿', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0); wd.onResult(16); wd.onSend(20);
    for (let t = 250; t <= 1900; t += 231) expect(wd.healthy(t, false)).toBe(true);
  });
});

describe('WorkerWatchdog·A3 指纹分类行为锁', () => {
  it('warmup 超预算静默死 → no-result-dead', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0);
    expect(wd.healthy(WORKER_WARMUP_BUDGET_MS, false)).toBe(true);        // 年龄恰 15000=预算 → 未武装
    expect(wd.healthy(WORKER_WARMUP_BUDGET_MS + 1, false)).toBe(true);    // 超预算 → 武装拍
    expect(wd.healthy(WORKER_WARMUP_BUDGET_MS + 1 + WORKER_CONFIRM_MS, false)).toBe(false);
    expect(wd.fallReason()).toBe('no-result-dead');
  });

  it('回传管道饱和（末次端到端延迟 ≥2s）→ pickup-timeout', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(10); wd.onResult(2510);         // lag=2500 ≥ 稳态预算=饱和签名
    wd.onSend(2610);                          // 此后再无产出
    expect(wd.healthy(2610 + WORKER_STEADY_BUDGET_MS, false)).toBe(true);      // 年龄恰 2000=预算
    expect(wd.healthy(2610 + WORKER_STEADY_BUDGET_MS + 1, false)).toBe(true);  // 武装拍
    expect(wd.healthy(2610 + WORKER_STEADY_BUDGET_MS + 1 + WORKER_CONFIRM_MS, false)).toBe(false);
    expect(wd.fallReason()).toBe('pickup-timeout');
  });

  it('onerror 直杀 → onerror', () => {
    const wd = new WorkerWatchdog();
    wd.onSend(0); wd.onResult(20);
    wd.healthy(100, true);
    expect(wd.fallReason()).toBe('onerror');
  });
});

// ───────────────────────── B. 阶梯重生参数与逃生门 ─────────────────────────

describe('B 阶梯重生参数与逃生门', () => {
  it('阶梯 5s/10s/20s,封顶续 20s', () => {
    expect(ladderDelayMs(0)).toBe(5000);
    expect(ladderDelayMs(1)).toBe(10000);
    expect(ladderDelayMs(2)).toBe(20000);
    expect(ladderDelayMs(3)).toBe(20000);
    expect(ladderDelayMs(99)).toBe(20000);
    expect(ladderDelayMs(-1)).toBe(5000);
  });

  it('?wwretry=0 = 逃生门（现场解析）', () => {
    vi.stubGlobal('location', { search: '?wwretry=0' });
    expect(workerRetryEnabled()).toBe(false);
    vi.stubGlobal('location', { search: '?x=1' });
    expect(workerRetryEnabled()).toBe(true);
    vi.stubGlobal('location', { search: '?wwretry=1' });
    expect(workerRetryEnabled()).toBe(true);
    vi.unstubAllGlobals();
    expect(workerRetryEnabled()).toBe(true);   // 无 location（node）→ 缺省开
  });
});

// ───────────────────────── C. WaterWaves 集成（全新模块注册表 + FakeWorker + 合成时钟） ─────────────────────────

type FakeMsg = { op?: string; fmt?: string; R?: Float32Array; G?: Float32Array; gW?: number; gH?: number;
  progress?: number; intensity?: number; waveOff?: [number, number]; cam?: [number, number, number]; scroll?: [number, number] };

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor(public url: string | URL, public opts?: unknown) {}
  postMessage(m: unknown): void { this.posted.push(m); }
  terminate(): void { this.terminated = true; }
}

/** f32 全量场消息（网格与本地 _ensure(w,h) 同尺寸,值全 0.5=中性场） */
function fieldMsg(gW: number, gH: number, progress: number): FakeMsg {
  const n = gW * gH;
  return { op: 'field', fmt: 'f32', R: new Float32Array(n).fill(0.5), G: new Float32Array(n).fill(0.5),
    gW, gH, progress, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] };
}

const INP = {
  camX: 0, camY: 0, zoom: 1, viewW: 320, viewH: 240,   // → 栅格 80×60
  tileX: 50, tileY: 40, maxTilesX: 8400, maxTilesY: 2400,
  worldSurface: 100, rockLayer: 800, windAbs: 0.5, rain: 0, dt: 1 / 30,
};

describe('C WaterWaves 看门狗治理集成（红绿全链）', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', { search: '' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** 装载全新模块注册表 + fake performance 时钟 + 可追踪 FakeWorker */
  async function harness(search = '') {
    if (search) vi.stubGlobal('location', { search });
    const Tracked = class extends FakeWorker {
      constructor(u: string | URL, o?: unknown) { super(u, o); (Tracked as unknown as { instances: FakeWorker[] }).instances.push(this); }
      static instances: FakeWorker[] = [];
    };
    vi.stubGlobal('Worker', Tracked as unknown as typeof Worker);
    const WW = await import('../src/render/WaterWaves');
    vi.useFakeTimers({ toFake: ['performance'] });
    const waves = WW.waterWaves;
    waves.resetForTest();
    waves.setQuality(2);
    return {
      waves,
      stats: () => WW.wwWorkerStats(),
      instances: () => (Tracked as unknown as { instances: FakeWorker[] }).instances,
    };
  }

  it('C1 [定谳第一因·红绿] 开局冷模块图取:warmup 15s 预算内不误杀（旧码 2s 必杀）', async () => {
    const h = await harness();
    h.waves.frame({ ...INP });                       // 首帧:spawn+本地跑
    vi.advanceTimersByTime(100);
    h.waves.frame({ ...INP });                       // 进 worker 模式
    expect(h.stats().on).toBe(true);
    // 模拟冷取:10s 内无任何场回达,逐帧轮询（旧码 now-startedAt>2000 在 t≈2s 杀）
    for (let s = 1; s <= 10; s++) {
      vi.advanceTimersByTime(1000);
      h.waves.frame({ ...INP });
      expect(h.stats().falls, `t=${s}s 不得误杀`).toBe(0);
      expect(h.stats().on).toBe(true);
    }
    // 15s 预算耗尽:武装拍（未定谳）→ 确认窗后定谳回落（真死终须回落,安全性保留）
    vi.advanceTimersByTime(5300);
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(0);                 // 武装拍不算回落
    vi.advanceTimersByTime(300);
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(1);
    expect(h.stats().on).toBe(false);
    expect(h.stats().fallsBy['no-result-dead']).toBe(1);
  });

  it('C2 稳态真死回落 → 指纹 no-result-dead → 阶梯 5s 重生（shadow 双轨）→ 首场切主', async () => {
    const h = await harness();
    h.waves.frame({ ...INP });                       // f1 t=0:首帧 spawn+本地跑
    vi.advanceTimersByTime(50);
    h.waves.frame({ ...INP });                       // f2 t=50:worker 模式（onSend@50）
    expect(h.instances().length).toBe(1);
    // 一场健康回达 → 稳态预算档（outstanding 清零）
    h.instances()[0].onmessage!({ data: fieldMsg(80, 60, 100) });
    expect(h.stats().fields).toBe(1);
    // f3 t=2150:outstanding=0 轮询绿 → onSend@2150（之后 worker 静默停摆）
    vi.advanceTimersByTime(2100);
    h.waves.frame({ ...INP });
    // f4 t=4250:在途年龄 2100>2000 → 嫌疑武装拍;f5 t=4550:确认窗过 → 定谳回落
    vi.advanceTimersByTime(2100);
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(300);
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(1);
    expect(h.stats().fallsBy['no-result-dead']).toBe(1);
    expect(h.stats().on).toBe(false);
    expect(h.instances()[0].terminated).toBe(true);

    // 阶梯第一步 5s:到期前不重生
    vi.advanceTimersByTime(4000);
    h.waves.frame({ ...INP });
    expect(h.stats().respawns).toBe(0);
    expect(h.instances().length).toBe(1);
    // 到期 → 重生（实例 2,shadow 双轨）
    vi.advanceTimersByTime(1100);
    h.waves.frame({ ...INP });
    expect(h.instances().length).toBe(2);
    expect(h.stats().respawns).toBe(1);
    expect(h.stats().on).toBe(true);
    // shadow 双轨:本地模拟连续（progress 推进=水不静止）+worker 已收帧
    const pShadow = h.waves.progress;
    vi.advanceTimersByTime(33);
    h.waves.frame({ ...INP });
    expect(h.waves.progress).not.toBe(pShadow);
    expect(h.instances()[1].posted.some((m) => (m as { op?: string }).op === 'frame')).toBe(true);
    // 首场到达 → 切主（纯 worker 模式,本地模拟退役=progress 冻结待场消息喂）
    h.instances()[1].onmessage!({ data: fieldMsg(80, 60, 200) });
    vi.advanceTimersByTime(33);
    h.waves.frame({ ...INP });
    const pWorker = h.waves.progress;
    vi.advanceTimersByTime(33);
    h.waves.frame({ ...INP });
    expect(h.waves.progress).toBe(pWorker);
    expect(h.stats().falls).toBe(1);                 // 无新增回落
  });

  it('C3 第二次真死 → 阶梯第二步 10s（行为锁）', async () => {
    const h = await harness();
    h.waves.frame({ ...INP });                       // f1 t=0 spawn
    vi.advanceTimersByTime(50);
    h.waves.frame({ ...INP });                       // f2 t=50 worker 模式
    h.instances()[0].onmessage!({ data: fieldMsg(80, 60, 100) });
    vi.advanceTimersByTime(2100);                    // f3 t=2150 onSend（此后停摆）
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(2100);                    // f4 t=4250 武装
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(300);                     // f5 t=4550 定谳
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(1);
    vi.advanceTimersByTime(5100);                    // 第一阶梯 5s 到期重生
    h.waves.frame({ ...INP });
    expect(h.instances().length).toBe(2);
    h.instances()[1].onmessage!({ data: fieldMsg(80, 60, 150) });   // 实例 2 健康首场 → 稳态预算档
    vi.advanceTimersByTime(2100);                    // f7 t=11750 onSend（此后停摆）
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(2100);                    // f8 t=13850 武装
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(300);                     // f9 t=14150 定谳
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(2);
    expect(h.stats().fallsBy['no-result-dead']).toBe(2);
    vi.advanceTimersByTime(6000);                    // 第二阶梯 10s 未到期（仅 6s）
    h.waves.frame({ ...INP });
    expect(h.instances().length).toBe(2);
    expect(h.stats().respawns).toBe(1);
    vi.advanceTimersByTime(4100);                    // 累计 10.1s 到期
    h.waves.frame({ ...INP });
    expect(h.instances().length).toBe(3);
    expect(h.stats().respawns).toBe(2);
  });

  it('C4 ?wwretry=0 逃生门:回落即终态,零重生（旧语义保留）', async () => {
    const h = await harness('?wwretry=0');
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(50);
    h.waves.frame({ ...INP });
    h.instances()[0].onmessage!({ data: fieldMsg(80, 60, 100) });
    vi.advanceTimersByTime(2100);
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(2100);
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(300);
    h.waves.frame({ ...INP });
    expect(h.stats().falls).toBe(1);
    vi.advanceTimersByTime(60_000);                  // 任意久:永不重生
    h.waves.frame({ ...INP });
    expect(h.instances().length).toBe(1);
    expect(h.stats().respawns).toBe(0);
    expect(h.stats().on).toBe(false);
  });

  it('C5 onerror 硬证据:免等预算直杀,指纹 onerror（旧版仅 log 要等满预算）', async () => {
    const h = await harness();
    h.waves.frame({ ...INP });
    vi.advanceTimersByTime(50);
    h.waves.frame({ ...INP });
    h.instances()[0].onerror!({ message: '404 worker chunk' });
    vi.advanceTimersByTime(33);
    h.waves.frame({ ...INP });                       // 下一帧 healthy(errored=true) 直杀
    expect(h.stats().falls).toBe(1);
    expect(h.stats().fallsBy.onerror).toBe(1);
    expect(h.stats().on).toBe(false);
  });
});
