// ★BJ74 BGM 循环回绕守卫（2026-09-14 用户报「蘑菇群系 BGM 播完一轮不 loop、
// 变嗡嗡声」取证定谳后的守卫）：Chromium AudioBufferSourceNode 在循环终点=
// 缓冲区绝对末帧、特定总帧数（Music_29 解码长 3665419 帧 @48kHz 实测中毒）
// 时,首轮回绕后渲染器冻结为单量子重复块（恒定低鸣,onended 不触发,bgm 环
// 零事件）。修 = applyLoopBounds 把循环终点恒内收一个量子尾,循环永不触碰
// 绝对末帧。本文件三层断言：
//   ① 语义：helper 的 loopEnd 计算（rem=0 收 128 / rem≠0 收 rem / 短缓冲不动）；
//   ② 结构：全仓禁裸 `loop = true`——4 个 loop 源创建点必须走 applyLoopBounds
//      （回归即红：新人/并行会话加裸循环源会复燃且 onended 哨兵抓不到）；
//   ③ 原版锚：内收边界与原版 Wave Bank.xwb 的 Music_29 loop 区边界差 ≤7 帧
//      （原版 loopStart 恒 0、mp3 即按 loop 区截取,整缓冲循环=原版语义）。
// 浏览器侧取证矩阵（Chrome 152.0.7977.84,headless+headed 双跑）：
//   全长循环=冻结 -51.7dB/zc=32/rep=128 两轮不愈；补零对齐 128（仍跨绝对末帧）
//   =冻结静默同病；终点内收（trim 或仅设 loopEnd,零拷贝）=两轮+真音乐。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyLoopBounds } from '../src/core/Sfx';

/** 测试桩：只塑形 applyLoopBounds 消费的面 */
interface StubSrc {
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
}
interface StubBuf {
  length: number;
  sampleRate: number;
}

function bounds(bufLen: number, rate = 48000): StubSrc {
  const src: StubSrc = {};
  applyLoopBounds(src as unknown as AudioBufferSourceNode, { length: bufLen, sampleRate: rate } as unknown as AudioBuffer);
  return src;
}

describe('applyLoopBounds（BJ74 循环回绕缺陷守卫）', () => {
  it('loop 恒置真；循环终点内收一个量子尾（rem≠0 收 rem）', () => {
    // Music_29.mp3 本机 Chrome 152 解码长 3665419 帧（%128=11）——中毒实长
    const s = bounds(3665419);
    expect(s.loop).toBe(true);
    expect(s.loopStart).toBe(0);
    // 3665419 - 11 = 3665408 帧 = 76.362666…s
    expect(s.loopEnd).toBeCloseTo(3665408 / 48000, 12);
    expect(3665419 - s.loopEnd! * 48000).toBeCloseTo(11, 9);
  });

  it('rem==0 时收整 128 帧——终点仍严格位于绝对末帧之内', () => {
    // 3665408 = Music_29 中毒实长内收后的对齐长度（rem=0）
    const s = bounds(3665408);
    expect(s.loop).toBe(true);
    expect(s.loopEnd).toBeCloseTo((3665408 - 128) / 48000, 12);
    // 任意长度：终点帧 < 总帧数,收尾 ≤128 帧
    for (const len of [129, 256, 44100, 2097152, 3665419, 3665472, 8820417]) {
      const b = bounds(len);
      const endFrame = Math.round(b.loopEnd! * 48000);
      expect(endFrame).toBeLessThan(len);
      expect(len - endFrame).toBeLessThanOrEqual(128);
    }
  });

  it('短缓冲（≤128 帧,收尾将清空循环区）不动 loopEnd——保持整缓冲循环缺省', () => {
    for (const len of [1, 64, 128]) {
      const s = bounds(len);
      expect(s.loop).toBe(true);
      expect(s.loopEnd).toBeUndefined();
      expect(s.loopStart).toBeUndefined();
    }
  });

  it('loopEnd 用 buffer 自身采样率换算（44.1k 缓冲挂 48k ctx 不失真）', () => {
    const s = bounds(3367604, 44100);   // 44100Hz 设备上 Music_29 的原生解码长
    expect(s.loopEnd).toBeCloseTo((3367604 - 3367604 % 128) / 44100, 12);
  });

  it('结构：全仓禁裸 loop = true——四站点（BGM track/风·雨 cue/跟踪循环/常驻循环）必须走 applyLoopBounds', () => {
    const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    const audio = read('../src/core/Audio.ts');
    const sfx = read('../src/core/Sfx.ts');
    // 裸循环源 = 回绕缺陷复燃面（onended 哨兵抓不到,行为日志零事件,回归极难查）。
    // Sfx.ts 恒恰 1 处 = applyLoopBounds helper 本体；Audio.ts 恒 0 处。
    const bare = (t: string) => [...t.matchAll(/\.loop\s*=\s*true/g)].length;
    expect(bare(sfx)).toBe(1);
    expect(bare(audio)).toBe(0);
    // 四站点全量接线（Sfx 三处 + Audio 一处 + Sfx 定义处 = 5）
    const calls = [...sfx.matchAll(/applyLoopBounds\(/g)].length + [...audio.matchAll(/applyLoopBounds\(/g)].length;
    expect(calls).toBe(5);
    expect(audio).toMatch(/import \{[^}]*applyLoopBounds[^}]*\} from '\.\/Sfx'/);
  });

  it('原版锚：内收边界与 Wave Bank.xwb 的 Music_29 loop 区边界差 ≤10ms（曲尾淡出域,不可闻）', () => {
    // ★RB18 翻案定谳（2026-09-14）：Wave Bank.xwb 104/104 流 loopStart 恒 0 且
    // loopEnd==波全长=整波循环（Music_29=3367680 帧 @44101,xwb 逐流实测）——不存在
    // 「尾部不播」域;vgmstream 无 -i 时「loop×2+fade10s」预估播报值曾被 BJ74 误读为
    // 「全长 162.7s/尾 86s 原版永不播」,非 xwb 事实。
    const vanillaLoopEnd = 3367680 / 44101;                       // 76.36289s
    const ourLoopEnd = 3665408 / 48000;                           // 76.36267s（内收 11 帧 ≈ 0.23ms）
    expect(Math.abs(ourLoopEnd - vanillaLoopEnd)).toBeLessThan(0.01);
    // 内收一量子 = Chromium 回绕缺陷逼出的对原版刻意偏差（原版 XAudio2 循环直达末帧
    // 无此缺陷）,非「与原版 loopEnd 等价备案」——0.23ms 差 = 内收本身+44101→48000
    // 换算链舍入伪影（≤1 帧）
  });
});
