// 音效录制双通道回归（2026-09-03 用户需求：F5 长按录制窗记录音效播放序列，
// BGM 与 SFX 分开记——"有时听到错误的音效"排查面）：
//   ① AudioRecorder 双通道窗语义：toggle 同步开合 / 导出 sfx·bgm 分列 / 尾段无窗有效
//   ② Sfx 事件面：wav 触发面结局码全集（ok/q/sup/skip/mut/att/fail）+
//     Item_1 挥砍轮换真文件直接可见（"挥砍音不对"头号候选）+ 补播 'out' 实际出声 +
//     'syn' 合成兜底（"音色不对"直接证据）+ 循环轨 loop/loopX + UISfx 出身 tag
//   ③ AudioSystem BGM 事件面：sel 选曲切换（带前曲）/ fail 取曲失败 / mute / stop 实停
// 断言（node 环境 mock AudioContext / rAF / fetch，不触真声/网络）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioRecorder } from '../src/debug/AudioRecorder';
import { Sfx, applySfxPackOverrides } from '../src/core/Sfx';
import { AudioSystem } from '../src/core/Audio';
import { UISfx } from '../src/vui/UISfx';

// ---------- Sfx 侧 mock（与 sfx-first-play.test.ts 同款 + 合成兜底 osc 桩——
//            'syn' 断言路径会真跑 osc 合成,须存活到 emit 之后） ----------
let decodeImpl: (ab: ArrayBuffer) => Promise<AudioBuffer> = async () => fakeBuf();
class MockGain {
  gain = {
    value: 0,
    setTargetAtTime: () => {},
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };
  connect(dest: unknown) { return dest; }
  disconnect() { /* noop */ }
}
class MockOsc {
  type = '';
  frequency = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
  connect(dest: unknown) { return dest; }
  start() { /* 起振 */ }
  stop() { /* noop */ }
}
class MockSrc {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect(dest: unknown) { return dest; }
  start() { /* 起振 */ }
  stop() { /* noop */ }
}
class MockAC {
  state = 'running';
  currentTime = 0;
  destination = {};
  sampleRate = 44100;
  decodeAudioData = (ab: ArrayBuffer) => decodeImpl(ab);
  createBufferSource() { return new MockSrc(); }
  createGain() { return new MockGain(); }
  createOscillator() { return new MockOsc(); }
  createBuffer(_ch: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  createBiquadFilter() {
    return {
      type: '',
      frequency: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: (d: unknown) => d,
    };
  }
  async resume() { this.state = 'running'; }
}
function fakeBuf(): AudioBuffer {
  return { duration: 0.1, length: 4410, sampleRate: 44100 } as unknown as AudioBuffer;
}
const windowBackup = (globalThis as { window?: unknown }).window;
const fetchBackup = (globalThis as { fetch?: unknown }).fetch;
const rafBackup = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** 事件收集器：挂到 Sfx.onEvent / AudioSystem.onEvent */
function collector() {
  const evs: Array<{ ch: string; k: string; d: unknown; tag: string }> = [];
  const sfxHook = (k: string, d: unknown, tag: string) => evs.push({ ch: 'sfx', k, d, tag });
  const bgmHook = (k: string, d: unknown) => evs.push({ ch: 'bgm', k, d, tag: '' });
  return { evs, sfxHook, bgmHook };
}
const lastOf = <T,>(a: T[]): T | undefined => a[a.length - 1];   // 项目 lib<es2022,无 Array.at
const ks = (evs: ReturnType<typeof collector>['evs'], ch?: string) =>
  evs.filter((e) => !ch || e.ch === ch).map((e) => e.k);

beforeEach(() => {
  decodeImpl = async () => fakeBuf();
  (globalThis as { window?: unknown }).window = { AudioContext: MockAC };
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 0;   // AudioSystem.startLoop
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = windowBackup;
  (globalThis as { fetch?: unknown }).fetch = fetchBackup;
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = rafBackup;
  Sfx.onEvent = null;
  vi.restoreAllMocks();
  applySfxPackOverrides(new Map());   // 清覆盖表 + 驱逐各实例解码缓存/负缓存
});

// ================= ① AudioRecorder 双通道 =================

describe('AudioRecorder 双通道窗语义', () => {
  function makeRec() {
    const ar = new AudioRecorder();
    let t = 0;
    ar.wire(() => t, () => ({ worldName: '测试世界', seed: 1, w: 10, h: 10, hardMode: false, dayTime: true }));
    const rawSfx = ar.sfx.log.bind(ar.sfx);
    const rawBgm = ar.bgm.log.bind(ar.bgm);
    ar.sfx.log = (k: string, d: unknown) => { rawSfx(k, d); t++; };
    ar.bgm.log = (k: string, d: unknown) => { rawBgm(k, d); t++; };
    return ar;
  }

  it('窗前事件不入导出；toggle 两通道同步开合', () => {
    const ar = makeRec();
    ar.sfx.log('wav', { f: 'Item_11', o: 'ok' });       // 窗前
    ar.bgm.log('sel', { id: 1 });                        // 窗前
    expect(ar.toggle()).toBe(true);                      // 开窗
    expect(ar.recording).toBe(true);
    ar.sfx.log('wav', { f: 'Dig_0', o: 'ok' });
    ar.bgm.log('sel', { id: 10, p: 1 });
    const d = ar.export();
    expect(d.sfx.events.map((e) => e.k)).toEqual(['wav']);      // 只含窗内
    expect(d.bgm.events.map((e) => e.k)).toEqual(['sel']);
    expect(d.sfx.meta.worldName).toBe('测试世界');               // 世界元信息随通道出
    expect(ar.toggle()).toBe(false);                     // 关窗（两通道同步）
    expect(ar.recording).toBe(false);
    // 关窗后 export 仍取该窗全量（lastStart 语义继承）
    expect(ar.export().sfx.meta.eventCount).toBe(1);
  });

  it('尾段无窗有效；sfx/bgm 分列互不混环', () => {
    const ar = makeRec();
    ar.sfx.log('wav', { f: 'Item_11', o: 'ok' });
    ar.bgm.log('sel', { id: 10 });
    const tail = ar.tail(10, 10);
    expect(tail.sfx).toHaveLength(1);
    expect(tail.bgm).toHaveLength(1);
    expect(tail.sfx![0].k).toBe('wav');
    expect(tail.bgm![0].k).toBe('sel');
  });
});

// ================= ② Sfx 事件面 =================

describe('Sfx 录制事件面', () => {
  it('触发面结局码全集：ok/q/att/sup/mut', async () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    applySfxPackOverrides(new Map([['Item_11', new Uint8Array(8)]]));
    expect(s.playWavFile('Item_11', 0.8)).toBe(true);
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'Item_11', v: 0.8, o: 'q' } });
    await flush();                                        // 解码完成
    expect(s.playWavFile('Item_11', 0.8)).toBe(true);     // 二调命中缓存
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'Item_11', o: 'ok' } });
    // att：距离衰减归零（监听器默认 (0,0)，2500px 外不播）
    expect(s.playWavFile('Item_11', 1, 99999, 0)).toBe(false);
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'Item_11', o: 'att' } });
    // sup：载入静音门
    s.suppress = true;
    expect(s.playWavFile('Item_11')).toBe(false);
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { o: 'sup' } });
    s.suppress = false;
    // mut：静音门（ensure 拒绝建 ctx/返回 null——muted 是单实例可靠触发面）
    s.muted = true;
    expect(s.playWavFile('Item_11')).toBe(false);
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { o: 'mut' } });
    s.muted = false;
    // 位置带坐标时入载荷（整数取整,防 JSON 膨胀）
    s.playWavFile('Item_11', 1, 100.7, -32.2);
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { x: 101, y: -32 } });
  });

  it('skip：单实例在播跳过（Roar 族多段掷骰收敛为单声的取证面）', async () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    applySfxPackOverrides(new Map([['Roar_0', new Uint8Array(8)]]));
    s.playWavFile('Roar_0');
    await flush();                                        // 缓冲就绪 + 补播占槽
    s.playWavFile('Roar_0');                              // 槽被占（onended 未触发）
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'Roar_0', o: 'skip' } });
  });

  it('fail → 负缓存；play() 随之走合成兜底并记 syn（"音色不对"直接证据）', async () => {
    decodeImpl = async () => { throw new Error('bad wav'); };
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0);   // hit 恒取 NPC_Hit_1
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    s.play('hit', 1);
    await flush();                                        // 解码失败 → 负缓存
    s.play('hit', 1);                                     // 负缓存窗内 → fail → 合成
    const last2 = evs.slice(-2);
    expect(last2[0]).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'NPC_Hit_1', o: 'fail' } });
    expect(last2[1]).toMatchObject({ ch: 'sfx', k: 'syn', d: { n: 'hit' } });
    expect(randSpy).toHaveBeenCalled();
  });

  it('Item_1 轮换真文件直接可见（2/3 概率换播 Item_18/19——录制面认文件不靠猜）', () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);        // roll=2 → Item_19
    (globalThis as { window?: unknown }).window = {};     // mut 结局即可,轮换已先行
    s.playWavFile('Item_1');
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { f: 'Item_19' } });
  });

  it('补播 out 记实际出声 tick + 终值音量（衰减×FILE_CASE_VOL 已乘）', async () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    s.setListener(0, 0);
    applySfxPackOverrides(new Map([['Zombie_0', new Uint8Array(8)]]));
    s.playWavFile('Zombie_0', 1, 1250, 0);                // 距离 1250/2500 → 衰减 0.5
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'wav', d: { o: 'q' } });
    await flush();
    const out = lastOf(evs.filter((e) => e.k === 'out'));
    expect(out).toMatchObject({ ch: 'sfx', d: { f: 'Zombie_0', v: 0.2 } });   // 衰减0.5(1250/2500)×ZombieMoan档0.4=0.2
  });

  it('循环轨 loop/loopX 起停成对（缓冲就绪即实起）', async () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    const s = new Sfx();
    applySfxPackOverrides(new Map([['Fuse', new Uint8Array(8)]]));
    s.playWavFile('Fuse');                                // 预热缓冲
    await flush();
    const h = s.startTrackedLoop('bombFuse', 0.2, 100, 100);
    expect(h).not.toBeNull();
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'loop', d: { f: 'Fuse', v: 0.2, x: 100, y: 100 } });
    h!.stop();
    expect(lastOf(evs)).toMatchObject({ ch: 'sfx', k: 'loopX', d: { f: 'Fuse' } });
  });

  it('UISfx 出身 tag：菜单单例事件 tag=ui（游戏内 UI 音可辨）', () => {
    const { evs, sfxHook } = collector();
    Sfx.onEvent = sfxHook;
    (globalThis as { window?: unknown }).window = {};     // mut 结局即可
    UISfx.click();                                        // menuTick 触发面
    const last = lastOf(evs)!;
    expect(last.tag).toBe('ui');
    expect(last.d).toMatchObject({ f: 'Menu_Tick' });
  });
});

// ================= ③ AudioSystem BGM 事件面 =================

describe('AudioSystem BGM 录制事件面', () => {
  it('sel 选曲切换带前曲；id=0（静音选择）同样入账', () => {
    const { evs, bgmHook } = collector();
    const sys = new AudioSystem();
    sys.onEvent = bgmHook;
    sys.playMusic(10);
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'sel', d: { id: 10 } });
    sys.playMusic(11);
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'sel', d: { id: 11, p: 10 } });
    sys.playMusic(0);
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'sel', d: { id: 0, p: 11 } });
    sys.playMusic(0);                                     // 幂等：curMusic 未变不记
    expect(ks(evs).filter((k) => k === 'sel')).toHaveLength(3);
  });

  it('fail：取曲失败入账（限时负缓存窗口内"BGM 没声"根因）', async () => {
    const { evs, bgmHook } = collector();
    const sys = new AudioSystem();
    sys.onEvent = bgmHook;
    (globalThis as { fetch?: unknown }).fetch = () => Promise.reject(new Error('offline'));
    await (sys as unknown as { buffer: (id: number) => Promise<unknown> }).buffer(38);
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'fail', d: { id: 38 } });
  });

  it('mute：静音开关入账', () => {
    const { evs, bgmHook } = collector();
    const sys = new AudioSystem();
    sys.onEvent = bgmHook;
    sys.toggleMute();
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'mute', d: { on: 1 } });
    sys.toggleMute();
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'mute', d: { on: 0 } });
  });

  it('stop：fade 归零拆轨入账（curMusic=0 硬停路径）', () => {
    const { evs, bgmHook } = collector();
    const sys = new AudioSystem();
    sys.onEvent = bgmHook;
    let stopped = 0;
    const priv = sys as unknown as {
      pool: Map<number, { src: { stop: () => void }; gain: { gain: { value: number } }; fade: number }>;
      curMusic: number;
      tickFade: (d: number) => void;
    };
    priv.pool.set(10, { src: { stop: () => { stopped++; } }, gain: { gain: { value: 0.5 } }, fade: 0.4 });
    priv.curMusic = 0;                                    // 原版 :338-340 → 立即归零硬停
    priv.tickFade(0.005);
    expect(stopped).toBe(1);
    expect(lastOf(evs)).toMatchObject({ ch: 'bgm', k: 'stop', d: { id: 10 } });
    expect(priv.pool.has(10)).toBe(false);
  });
});
