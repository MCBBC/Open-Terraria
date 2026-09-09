// SoundPlayOverrides 对账测试（Terraria.Audio/SoundPlayOverrides.cs 全文提取，
// 2026-08-20）。原版结论：**无 SoundID→音效/音调替换表**——结构体仅
// `float? Volume`，是 PlayTrackedSound/PlayTrackedLoopedSound 的按次音量覆写；
// 1456 全量调用点恰好 1 条（Player.cs:28111-28114 吸血鬼炽灼嘶声环）。
// 本文件逐条断言：
//   ① 机制乘区序 = DetermineIntendedVolume（ActiveSound.cs:138-161）：
//      clamp(atten × Style.Volume × Volume覆写 × 音轨, 0, 1)——本仓
//      startLoopFile 目标音量 = min(1, vol[覆写] × base[Style.Volume] ×
//      trackVolumeFor(音轨))，FakeCtx 直断言 gain.setTargetAtTime 终值；
//   ② 唯一表项 sizzle：素材在库（CreateTrackable("sizzle")）+ SoundType.Sound
//      → master 轨（不被环境音滑杆吞）；
//   ③ 表项接线（Player.cs:28107-28121）：updateSunScorchValues 起轨初始覆写 =
//      当前 lerp（非 1）、base=1（WithVolume(1f)）、每帧 setVolume(lerp) 跟随
//      （≈ activeSound.Volume=:28118）、counter 归零拆轨（≈ loopingCondition）、
//      死亡档 −2 / 存活档 −6 衰减（:28100-28106）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Sfx, AMBIENT_FILES, trackVolumeFor } from '../src/core/Sfx';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

// ---------- FakeCtx（weather-visual.test.ts 同款 AudioContext mock） ----------
class FakeGain {
  gain = { value: 0, setTargetAtTime: vi.fn() };
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class FakeSrc {
  buffer: unknown = null;
  loop = false;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
  static instances: FakeCtx[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeGain());
  createBufferSource = vi.fn(() => new FakeSrc());
  decodeAudioData = vi.fn(async () => ({ fake: 'buffer' }) as unknown as AudioBuffer);
  constructor() { FakeCtx.instances.push(this); }
}

const windowBackup = (globalThis as { window?: unknown }).window;
const fetchBackup = (globalThis as { fetch?: unknown }).fetch;
beforeEach(() => {
  FakeCtx.instances = [];
  (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx as unknown as typeof AudioContext };
  (globalThis as { fetch?: unknown }).fetch = vi.fn(async () =>
    ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response);
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = windowBackup;
  (globalThis as { fetch?: unknown }).fetch = fetchBackup;
});

/** 起一条循环轨并等解码链完成，取 (sfx, gain) 供终值断言 */
async function loopWithGain(file: string, vol: number, base: number, master = 1, ambient = 1) {
  const sfx = new Sfx();
  sfx.master = master;
  sfx.ambient = ambient;
  const h = sfx.playLoopFile(file, vol, base);
  expect(h).not.toBeNull();
  await new Promise((r) => setTimeout(r, 20));
  expect(h!.playing).toBe(true);
  const fake = FakeCtx.instances[FakeCtx.instances.length - 1];
  const gain = fake.createGain.mock.results[0].value as FakeGain;
  return { sfx, h: h!, gain };
}

describe('SoundPlayOverrides 机制（ActiveSound.cs:36-42/:138-161 同构）', () => {
  it('乘区序：目标音量 = min(1, Volume覆写 × Style.Volume × 音轨)（:147 num *= Style.Volume * Volume）', async () => {
    // master 0.5、覆写 0.8、Style.Volume 1 → 0.4
    const { gain } = await loopWithGain('sizzle', 0.8, 1, 0.5);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 0, 0.2);
  });

  it('Style.Volume(base) 与覆写(vol) 是两个独立乘区（WithVolume(1f) 之外可叠加）', async () => {
    const { gain } = await loopWithGain('sizzle', 0.5, 0.6, 1);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.3, 0, 0.2);
  });

  it('终值钳 1（DetermineIntendedVolume :160 MathHelper.Clamp(num,0,1)）', async () => {
    const { gain } = await loopWithGain('sizzle', 1.5, 1, 1);   // vol 钳 1
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.2);
  });

  it('覆写逐帧重算（ActiveSound.Update :123-136 每帧 Volume 重算）：setVolume 即新覆写', async () => {
    const { h, gain } = await loopWithGain('sizzle', 0.8, 1, 0.5);
    h.setVolume(0.2);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.1, 0, 0.2);   // 0.2×1×0.5
    h.setVolume(1);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, 0, 0.2);
  });

  it('覆写 0 = 静音起振（lerp=0 时原版根本不起轨——:28109 lerpValue != 0 门）', async () => {
    const { h, gain } = await loopWithGain('sizzle', 0, 1, 0.5);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.2);
    h.stop();
  });
});

describe('覆写表全集 = 1 条（Player.cs:28111-28114 吸血鬼炽灼嘶声环）', () => {
  it('SoundID.VampireSizzle 素材在库（CreateTrackable("sizzle")，SoundID.cs:1039）', () => {
    // IIII225 校注：音频管线 2026-09-03 起落盘 mp3/opus（public/sounds 全库无 .wav），
    // 原 RIFF 断言钉死 wav 变体=格式迁移陈旧——素材在库意图不变,三变体任一在库即过
    const dir = fileURLToPath(new URL('../public/sounds/', import.meta.url));
    const candidates = ['sizzle.wav', 'sizzle.mp3', 'sizzle.opus'];
    const present = candidates.filter((f) => existsSync(join(dir, f)));
    expect(present.length).toBeGreaterThan(0);
    const head = readFileSync(join(dir, present[0])).subarray(0, 3);
    const isWav = present[0].endsWith('.wav') && head[0] === 0x52;
    const isMp3 = present[0].endsWith('.mp3') && (head[0] === 0x49 || head[0] === 0xff);
    const isOpus = present[0].endsWith('.opus') && [...head.slice(0, 4)].join('') === 'OggS';
    expect(isWav || isMp3 || isOpus).toBe(true);
  });

  it('SoundType.Sound（CreateTrackable 默认 :1180）→ master 轨，不被环境音滑杆吞', () => {
    expect(AMBIENT_FILES.has('sizzle')).toBe(false);
    expect(trackVolumeFor('sizzle', 0.1, 0.5)).toBe(0.5);   // ambient 替换不生效
    expect(trackVolumeFor('sizzle', 0.9, 0.5)).toBe(0.5);
  });

  it('WithVolume(1f)：base 乘区恒 1（接线侧 startLoopSfx 第三参）', async () => {
    const { h, gain } = await loopWithGain('sizzle', 0.6, 1, 1);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.6, 0, 0.2);
    h.stop();
  });
});

// ---------- 表项接线（Player.updateSunScorchValues，Player.cs:28107-28121） ----------
/** 最小 GameHooks：记录 startLoopSfx(file, vol, base) 与句柄 setVolume 序列
 *  （stopped 须读时求值——勿解构提前固化） */
function sizzleHooks() {
  const calls: Array<[string, number, number]> = [];
  const vols: number[] = [];
  let stopped = 0;
  const game = {
    startLoopSfx: (file: string, vol: number, base: number) => {
      calls.push([file, vol, base]);
      return {
        stop: () => { stopped++; },
        setVolume: (v: number) => { vols.push(v); },
        get playing() { return true; },
        get dead() { return false; },
      };
    },
  } as unknown as GameHooks;
  return { game, calls, vols, getStopped: () => stopped };
}

function burningPlayer(counter: number): Player {
  const p = new Player(10 * 16, 35 * 16 - 42 + 1, new Inventory());
  p.vampireBurningInSunlight = true;
  p.sunScorchCounter = counter;
  return p;
}

describe('表项接线：updateSunScorchValues 的覆写参数', () => {
  it('起轨初始覆写 = 当前 lerp（:28111-28114 overrides.Volume=lerpValue），base=1', () => {
    const { game, calls } = sizzleHooks();
    const p = burningPlayer(59);                       // +1 → 60，lerp = 60/120 = 0.5
    p.updateSunScorchValues(game);
    expect(calls).toEqual([['sizzle', 0.5, 1]]);
  });

  it('每帧覆写跟随（:28117-28118 activeSound.Volume = lerpValue）', () => {
    const { game, vols } = sizzleHooks();
    const p = burningPlayer(99);                       // 起轨 lerp=100/120 → 每帧 +1 跟随
    p.updateSunScorchValues(game);                     // 100：起轨 + 同帧首随
    p.updateSunScorchValues(game);                     // 101：setVolume
    p.updateSunScorchValues(game);                     // 102：setVolume
    expect(vols).toEqual([100 / 120, 101 / 120, 102 / 120]);
  });

  it('counter 归零拆轨（loopingCondition：IsActiveAndInGame counter>0 门）', () => {
    const hooks = sizzleHooks();
    const p = burningPlayer(5);
    p.updateSunScorchValues(hooks.game);               // 6：起轨
    expect(hooks.getStopped()).toBe(0);
    p.vampireBurningInSunlight = false;
    p.updateSunScorchValues(hooks.game);               // 6−6=0：lerp=0 → 拆轨
    expect(p.sunScorchCounter).toBe(0);
    expect(hooks.getStopped()).toBe(1);
  });

  it('死亡档衰减 −2（:28100-28105 UpdateDead 调用链）、存活档 −6', () => {
    const dead = burningPlayer(10);
    dead.dead = true;
    dead.updateSunScorchValues(sizzleHooks().game);
    expect(dead.sunScorchCounter).toBe(8);             // −2
    const alive = burningPlayer(10);
    alive.vampireBurningInSunlight = false;
    alive.updateSunScorchValues(sizzleHooks().game);
    expect(alive.sunScorchCounter).toBe(4);            // −6
  });

  it('counter 钳 0-300（:28106 Utils.Clamp）', () => {
    const p = burningPlayer(300);                      // 满档再烧不超 300
    p.updateSunScorchValues(sizzleHooks().game);
    expect(p.sunScorchCounter).toBe(300);
  });
});
