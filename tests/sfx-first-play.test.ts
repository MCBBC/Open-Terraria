// 首播补播回归（2026-08-21 用户报"发射子弹/部分音效第一声永远静默，第二声起正常"）：
// 根因 = 按需加载首播窗口：ensureBuffer 未命中同步返回 null → playWavFile
// return false 丢声（fire-and-forget），解码完成后第二声起才命中真声。
// 修复 = ①playWavFile 未命中→deferPlay 排队，解码完成后按原参数补播一次，
// 返回 true（"有声可闻"——play 的合成兜底 / Game.playSfxFiles 的通用 hit 回退
// 不叠加出声）；负缓存命中才返回 false 走合成（契约保留）。
// ②首次取得 AudioContext 即预热 WARMUP_NAMES（枪族 Item_36/41 此前不在
// 世界载入预热面 = 报障直接缺口）。
// 断言（node 环境 mock AudioContext + 资源包覆盖注入字节，不触真声/网络）：
//   ① 未缓存首调：同步不出声、返回 true；decode 完成后补播被调（缓冲/音量正确）
//   ② 已缓存二调：同步立即出声
//   ③ 加载失败→负缓存：首调 true 不补播、次调 false（合成兜底契约保留）
//   ④ suppress 门在补播时点生效（排队后置门→补播被拦）
//   ⑤ 距离衰减 ≥2500 → false 且不排队（atten 语义不变）
//   ⑥ 首次 ensure 触发 WARMUP_NAMES 预热（枪族/菜单/挖掘入缓存）且仅一次
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Sfx, WARMUP_NAMES, applySfxPackOverrides } from '../src/core/Sfx';

// ---------- mock AudioContext（node 环境无 WebAudio） ----------
let decodeImpl: (ab: ArrayBuffer) => Promise<AudioBuffer> = async () => fakeBuf();
let created: MockSrc[] = [];

function fakeBuf(): AudioBuffer {
  return { duration: 0.1, length: 4410, sampleRate: 44100 } as unknown as AudioBuffer;
}

class MockGain {
  gain = { value: 0, setTargetAtTime: () => {} };
  connect(dest: unknown) { return dest; }
  disconnect() { /* noop */ }
}

class MockSrc {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  dest: unknown = null;
  connect(dest: unknown) { this.dest = dest; return dest; }
  start() { /* 起振 */ }
  stop() { /* noop */ }
}

class MockAC {
  state = 'running';
  currentTime = 0;
  destination = {};
  decodeAudioData = (ab: ArrayBuffer) => decodeImpl(ab);
  createBufferSource() { const s = new MockSrc(); created.push(s); return s; }
  createGain() { return new MockGain(); }
  async resume() { this.state = 'running'; }
}

const windowBackup = (globalThis as { window?: unknown }).window;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const srcsOf = () => created;
const gainOf = (s: MockSrc) => (s.dest as MockGain).gain.value;

beforeEach(() => {
  decodeImpl = async () => fakeBuf();
  created = [];
  (globalThis as { window?: unknown }).window = { AudioContext: MockAC };
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = windowBackup;
  vi.unstubAllGlobals();
  applySfxPackOverrides(new Map());   // 清覆盖表 + 驱逐各实例解码缓存/负缓存
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('Sfx 首播补播（首声不丢）', () => {
  it('未缓存首调：同步不出声但返回 true，decode 完成后按原参数补播', async () => {
    const gate = deferred<AudioBuffer>();
    decodeImpl = () => gate.promise;
    applySfxPackOverrides(new Map([['Test_Gun', new Uint8Array(8)]]));   // 注入字节绕开 fetch
    const buf = fakeBuf();
    const sfx = new Sfx();
    expect(sfx.playWavFile('Test_Gun', 0.5)).toBe(true);   // 旧实现此处 false = 首声丢失
    expect(srcsOf().length).toBe(0);                        // 同步未出声（解码在途）
    gate.resolve(buf);
    await flush();
    expect(srcsOf().length).toBe(1);                        // ★补播被调
    expect(srcsOf()[0].buffer).toBe(buf);
    expect(gainOf(srcsOf()[0])).toBeCloseTo(0.5);           // 触发时音量语义保持
  });

  it('已缓存二调：同步立即出声（缓存命中路径不回归）', async () => {
    applySfxPackOverrides(new Map([['Test_Gun', new Uint8Array(8)]]));
    const sfx = new Sfx();
    expect(sfx.playWavFile('Test_Gun', 1)).toBe(true);
    await flush();
    const n = srcsOf().length;                              // 首调补播已完成
    expect(sfx.playWavFile('Test_Gun', 1)).toBe(true);
    expect(srcsOf().length).toBe(n + 1);                    // 同步立即，无需等微任务
  });

  it('加载失败→负缓存：首调 true 不补播，次调 false 走合成兜底（契约保留）', async () => {
    decodeImpl = async () => { throw new Error('decode fail'); };
    applySfxPackOverrides(new Map([['Bad_File', new Uint8Array(4)]]));
    const sfx = new Sfx();
    expect(sfx.playWavFile('Bad_File', 1)).toBe(true);      // 已排队
    await flush();
    expect(srcsOf().length).toBe(0);                        // 失败不补播
    expect(sfx.playWavFile('Bad_File', 1)).toBe(false);     // 负缓存→调用方合成兜底
  });

  it('suppress 门在补播时点生效（排队后置门→补播被拦）', async () => {
    const gate = deferred<AudioBuffer>();
    decodeImpl = () => gate.promise;
    applySfxPackOverrides(new Map([['Test_Gun', new Uint8Array(8)]]));
    const sfx = new Sfx();
    expect(sfx.playWavFile('Test_Gun', 1)).toBe(true);
    sfx.suppress = true;                                    // 载入门在窗口内落下
    gate.resolve(fakeBuf());
    await flush();
    expect(srcsOf().length).toBe(0);                        // 门语义不变：补播同样被拦
  });

  it('距离衰减 ≥2500 → false 且不排队补播（atten 语义不变）', async () => {
    applySfxPackOverrides(new Map([['Test_Gun', new Uint8Array(8)]]));
    const sfx = new Sfx();
    sfx.setListener(0, 0);
    expect(sfx.playWavFile('Test_Gun', 1, 2600, 0)).toBe(false);
    await flush();
    expect(srcsOf().length).toBe(0);
  });
});

describe('Sfx 高频预热（WARMUP_NAMES）', () => {
  it('首次 ensure 触发预热：枪族三件/菜单/挖掘入缓存；仅预热一次', async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      expect(String(url)).toMatch(/^sounds\/[\w.]+\.wav$/);
      return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const sfx = new Sfx();
    sfx.play('menuTick', 1);            // 首手势：play → playWavFile → ensure → warmup
    await flush();
    const priv = sfx as unknown as { buffers: Map<string, AudioBuffer> };
    // WARMUP_NAMES 展开面抽查：枪族 Item_11/36/41（报障主面）+ 弓 + 菜单 + 挖掘/砍树
    for (const f of ['Item_11', 'Item_36', 'Item_41', 'Item_5', 'Menu_Tick', 'Dig_0', 'Grass']) {
      expect(priv.buffers.has(f), f).toBe(true);
    }
    // 清单规模 sanity：预热 fetch 量级受控（WARMUP_NAMES 展开约 60 文件）
    expect(WARMUP_NAMES.length).toBeGreaterThan(20);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(20);
    expect(fetchMock.mock.calls.length).toBeLessThan(120);
    // 第二次播放命中缓存，不再触发预热 fetch
    const before = fetchMock.mock.calls.length;
    expect(sfx.playWavFile('Menu_Tick', 1)).toBe(true);
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
