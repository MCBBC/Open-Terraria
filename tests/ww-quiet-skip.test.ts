// ★MSG-FREQ WaveWorker 消息面降频锁（2026-10-04;WASM 双旗 trace x-ray 定谳:
// WaveWorker 每帧双向 postMessage 118/s×0.26ms = _step 之外最大项）。
// 机制面（跳发判据=静默窗）：
//   · 入窗：连续零跨度 delta（meta[0]===0）= worker 场处内核不动点——确定性内核
//     f(F)=F 与 dx=dy=0 下 f(F_n)=F_{n-1} ⇒ F_{n+1}=f(F_n)=F_n 恒冻结（数学证明,
//     非混沌口径）→ 主线程停发 frame → 双向 postMessage 归零;
//   · 出窗（任一活性信号即恢复逐帧发=「首帧/脏标强制发」）：带跨度脏 delta/
//     相机移动/视口 resize/非 camera 注入/换档/心跳到期/fallback;
//   · 语义不变式：静默窗内场内容逐位冻结（不动点）;progress/intensity 本地
//     逐位推进（与 worker 链同式同序同输入=IEEE 确定性,环境噪声动画不冻结）;
//   · 看门狗共存：跳发=outstanding 0（WorkerGovernance healthy「无在途请求=
//     无证据」永不误杀）;worker 1:1 回执约定不破（只对实收帧回执）。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  waterWaves, WW_QUIET_HEARTBEAT_FRAMES, wwWorkerStats, waterDistortionIntensity,
} from '../src/render/WaterWaves';

const anySys = waterWaves as unknown as Record<string, any> & {
  resetForTest(): void; setQuality(q: number): void; frame(inp: object): void;
  injectWash(...a: number[]): void; readGridR(): Float32Array; readGridG(): Float32Array;
  progress: number; intensity: number;
  _wwOn: boolean; _ww: { postMessage(m: unknown): void; terminate(): void } | null;
  _wwWd: { healthy(now: number, errored: boolean): boolean; fallReason(): string;
    onSend(now: number): void; onResult(now: number): void } | null;
  _wwApplyField(m: object): void;
  _wwQuietRun: number; _wwQuietFrames: number; _wwQuietVW: number; _wwQuietVH: number;
  _wwCapture: { k: string; a: number[] }[] | null;
};

const INP = { camX: 0, camY: 0, zoom: 1, viewW: 40, viewH: 40, tileX: 5, tileY: 5,
  maxTilesX: 100, maxTilesY: 100, worldSurface: 20, rockLayer: 60, windAbs: 0, rain: 0, dt: 1 / 60 };

/** f32 全量场消息（40×40 中性场,head cam 与 INP 同相） */
function fullMsg(progress = 0.5): object {
  return { op: 'field', fmt: 'f32', R: new Float32Array(1600).fill(0.5), G: new Float32Array(1600).fill(0.5),
    gW: 40, gH: 40, progress, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] };
}
/** 零跨度 delta（静默判定载体;meta[0]=0） */
function quietDelta(progress = 0.5): object {
  return { op: 'field', fmt: 'delta', meta: new Uint32Array([0]), data: new Uint8Array(0),
    gW: 40, gH: 40, progress, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] };
}
/** 带跨度脏 delta（span=[y=0,x0=0,len=2];值=中性,只为脏标语义） */
function dirtyDelta(): object {
  return { op: 'field', fmt: 'delta', meta: new Uint32Array([1, 0, 0, 2]),
    data: new Uint8Array([128, 128, 128, 128]),
    gW: 40, gH: 40, progress: 0.5, intensity: 1, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] };
}

/** 装假 worker 臂（b2b R2-F3 同款:手动 _wwOn=true,跳过真 spawn;capture 批手动武装） */
function armFakeWorker(): unknown[] {
  const posted: unknown[] = [];
  anySys._ww = { postMessage(m: unknown) { posted.push(m); }, terminate() { /* no-op */ } };
  anySys._wwOn = true;
  anySys._wwWd = { healthy: () => true, fallReason: () => 'test-stub',
    onSend: () => {}, onResult: () => {} };
  anySys._wwCapture = [];   // 真管线由 _wwSpawnWorker 武装;手动臂同款
  return posted;
}
const framePosts = (posted: unknown[]): number =>
  posted.filter((m) => (m as { op?: string }).op === 'frame').length;

describe('MSG-FREQ 静默窗跳发', () => {
  beforeEach(() => {
    anySys.resetForTest();
    anySys._wwOn = false; anySys._ww = null; anySys._wwWd = null; anySys._wwCapture = null;
    anySys.setQuality(3);
  });

  it('入窗:零跨度 delta 后同相帧停发（双向归零）,progress 本地推进,场逐位冻结', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);                                  // #1 发帧（quietRun=0）,VW/VH 钉 40
    expect(framePosts(posted)).toBe(1);
    anySys._wwApplyField(fullMsg());                    // 网格建立+cam 同相;full 保守不入窗
    anySys._wwApplyField(quietDelta());                 // 零跨度 → quietRun=1
    expect(anySys._wwQuietRun).toBe(1);
    const stat0 = wwWorkerStats().quietSkips;
    const rBits = Float32Array.from(anySys.readGridR());
    const p0 = anySys.progress;
    for (let f = 0; f < 10; f++) anySys.frame(INP);     // 静默窗:跳发
    expect(framePosts(posted)).toBe(1);                 // 双向归零（worker 无帧可步）
    expect(wwWorkerStats().quietSkips).toBe(stat0 + 10);
    expect(Float32Array.from(anySys.readGridR())).toEqual(rBits);   // 场逐位冻结（不动点）
    // progress 本地推进:静默窗内每帧按同式递推（环境噪声动画不冻结）
    const I = waterDistortionIntensity(INP.windAbs, INP.rain, INP.tileX, INP.tileY,
      INP.maxTilesX, INP.maxTilesY, INP.worldSurface, INP.rockLayer);
    let exp = p0;
    for (let f = 0; f < 10; f++) exp = (exp + INP.dt * I * 0.75) % 86400;
    expect(anySys.progress).toBe(exp);                  // 与 worker 链同式同序同输入=逐位同
  });

  it('出窗·脏标:带跨度 delta 解除静默（下一帧恢复发帧）', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());
    anySys._wwApplyField(quietDelta());
    anySys.frame(INP);
    expect(framePosts(posted)).toBe(1);
    anySys._wwApplyField(dirtyDelta());                 // 脏标 → quietRun=0
    expect(anySys._wwQuietRun).toBe(0);
    anySys.frame(INP);
    expect(framePosts(posted)).toBe(2);
  });

  it('出窗·相机/视口:任一变化恢复发帧,同相后回静默', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());
    anySys._wwApplyField(quietDelta());
    anySys.frame(INP);                                  // 静默
    expect(framePosts(posted)).toBe(1);
    anySys.frame({ ...INP, camX: 4 });                  // 相机移动 → 发帧
    expect(framePosts(posted)).toBe(2);
    anySys.frame({ ...INP, viewW: 48 });                // 视口变化 → 发帧（quietRun 仍 1,VW 失配）
    expect(framePosts(posted)).toBe(3);
    anySys.frame({ ...INP, viewW: 48 });                // 与最后发帧同相 → 静默
    expect(framePosts(posted)).toBe(3);
  });

  it('出窗·实体注入:非 camera 注入项（wash）恢复发帧且随批送达', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());
    anySys._wwApplyField(quietDelta());
    anySys.frame(INP);
    expect(framePosts(posted)).toBe(1);
    anySys.injectWash(20, 20, 40, 40, 0.9, 0.5, 0.8);   // capture 批入 wash 项
    anySys.frame(INP);                                  // inj 含非 camera 项 → 发帧
    expect(framePosts(posted)).toBe(2);
    const sent = (posted.filter((m) => (m as { op?: string }).op === 'frame')[1]
      ) as { op: string; inj: { k: string }[] };
    expect(sent.inj.some((e) => e.k === 'wash')).toBe(true);
  });

  it('心跳:连续跳发 N 帧后强制发一帧重验（计数归零,随后回静默）', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());
    anySys._wwApplyField(quietDelta());
    anySys._wwQuietFrames = WW_QUIET_HEARTBEAT_FRAMES;   // 计数到顶 → 本帧不再跳
    anySys.frame(INP);                                  // 到期 → 心跳发帧
    expect(framePosts(posted)).toBe(2);
    expect(anySys._wwQuietFrames).toBe(0);
    anySys.frame(INP);                                  // 随后回静默（quietRun 仍在）
    expect(framePosts(posted)).toBe(2);
  });

  it('出窗·换档:setQuality 清静默（worker forceFull 须有 frame 才能材料化）', () => {
    const posted = armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());
    anySys._wwApplyField(quietDelta());
    anySys.frame(INP);
    expect(framePosts(posted)).toBe(1);
    anySys.setQuality(2);                               // 换档 → quality op + 清静默
    expect(anySys._wwQuietRun).toBe(0);
    anySys.frame(INP);
    expect(framePosts(posted)).toBe(2);
  });

  it('f32/full 场消息保守解除静默（保底重同步面不入窗）', () => {
    armFakeWorker();
    anySys.frame(INP);
    anySys._wwApplyField(fullMsg());                    // 先建网格（否则 delta 守卫 resync）
    anySys._wwApplyField(quietDelta());
    expect(anySys._wwQuietRun).toBe(1);
    anySys._wwApplyField(fullMsg());                    // f32 全量 → quietRun=0
    expect(anySys._wwQuietRun).toBe(0);
  });
});

describe('MSG-FREQ progress/intensity 本地所有', () => {
  beforeEach(() => {
    anySys.resetForTest();
    anySys._wwOn = false; anySys._ww = null; anySys._wwWd = null; anySys._wwCapture = null;
    anySys.setQuality(3);
  });

  it('apply 守卫:稳态 worker 模式场消息不回写 progress/intensity;非 worker 模式旧行为保留', () => {
    armFakeWorker();
    anySys.frame(INP);                                  // 本地推进过一轮
    const pSteady = anySys.progress;
    const iSteady = anySys.intensity;
    anySys._wwApplyField({ ...fullMsg(9), intensity: 9 });   // 稳态:消息值被守卫
    expect(anySys.progress).toBe(pSteady);
    expect(anySys.intensity).toBe(iSteady);
    anySys._wwOn = false;                               // 退回非 worker 模式（含测试直喂臂）
    anySys._wwApplyField(fullMsg(9));
    expect(anySys.progress).toBe(9);                    // 旧行为:消息喂
  });

  it('确定性:稳态 worker 链（本地推进）与本地模拟链逐位同（同输入序列）', () => {
    // A=本地模拟臂（_wwOn=false,frame() 走本地路径）;B=稳态 worker 臂（假 worker
    // 无回达,每帧发帧+本地推进）。progress 递推式同序同输入 → IEEE 确定性逐位同。
    const seq = (f: number) => ({ ...INP, dt: f % 5 === 4 ? 1 / 30 : 1 / 60 });
    anySys.resetForTest(); anySys.setQuality(3);        // A 臂
    const A: number[] = [];
    for (let f = 0; f < 30; f++) { anySys.frame(seq(f)); A.push(anySys.progress); }
    anySys.resetForTest(); anySys.setQuality(3);
    armFakeWorker();                                    // B 臂
    const B: number[] = [];
    for (let f = 0; f < 30; f++) { anySys.frame(seq(f)); B.push(anySys.progress); }
    expect(B).toEqual(A);
  });
});
