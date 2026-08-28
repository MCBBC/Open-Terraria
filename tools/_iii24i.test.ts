// IIII24 批诊断 i：分段样本计数对拍——用现有 NtbCap 钩与 FCMark 钩记录
// j-side 各段边界（NotTheBees ×7、FNTBIN/OUT、FS、SC），与 x86 权威表比对；
// 再在 NotTheBees#7 与 FNTB 段内对 x-allvals2.i32 做值级前缀比对，定位首分叉掷。
// 用法：cd game && SW_III24I=1 npx vitest run tools/_iii24i.test.ts
import { it } from 'vitest';
import { openSync, readSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const XPATH = '/tmp/iii24-out/x-allvals2.i32';
const CHUNK = 1 << 20;
// x86 权威锚（/tmp/iii24-out/x-chron2.txt）
const X_BEGIN1 = 68_617_938;
const X_CALLS: Array<[number, number]> = [
  [68_617_938, 83_520_564], [105_421_593, 117_093_139], [122_197_229, 133_808_669],
  [134_624_950, 146_156_937], [148_720_668, 158_731_818], [165_631_827, 177_268_334],
  [187_774_082, 199_400_858],
];
const X_FNTB = [199_400_858, 221_707_005];
const X_FS = [221_707_005, 221_707_005];
const X_SC = [221_707_005, 222_823_167];

class AbortErr extends Error {}

it('segment counters vs x86', async () => {
  const fx = openSync(XPATH, 'r');
  let xBuf = new Int32Array(CHUNK);
  let xLen = 0, xBase = -1;
  const loadX = (startLine0: number): void => {
    const want = Math.min(CHUNK, 153_205_228 - startLine0);
    const view = Buffer.alloc(Math.max(4, want * 4));
    let got = 0;
    while (got < view.length) {
      const n = readSync(fx, view, got, view.length - got, startLine0 * 4 + got);
      if (n <= 0) break;
      got += n;
    }
    xLen = got >> 2;
    xBuf = new Int32Array(view.buffer, view.byteOffset, xLen);
    xBase = startLine0;
  };
  let marks: Array<{ t: string; s: number }> = [];
  let ntbIn: number[] = [];
  let ntbCalls = 0;
  let phaseNtb = false;
  let seq = 0;

  const lineOf = (globalIdx: number): number => globalIdx - X_BEGIN1;   // 0-based 线号

  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (...a: unknown[]) => number;
  let stop = false;
  proto.internalSample = function (this: unknown, ...args: unknown[]): number {
    const v = orig.apply(this, args) as number;
    seq++;
    return v;
  };

  const g0 = globalThis as { __swNTBCap?: (p: string) => void; __swFCMark?: (t: string) => void };
  g0.__swNTBCap = (p: string): void => {
    if (p === 'in') { ntbIn.push(seq); phaseNtb = true; }
    else {
      ntbCalls++;
      marks.push({ t: `NTB${ntbCalls}`, s: seq });
      phaseNtb = false;
    }
  };
  g0.__swFCMark = (t: string): void => { marks.push({ t, s: seq }); };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1372357239', evil: -1 as const,
      seedFlags: { notTheBees: true },
    });
  } finally {
    proto.internalSample = orig;
    delete g0.__swNTBCap; delete g0.__swFCMark;
    closeSync(fx);
  }

  // 分段计数对比表
  console.log('== 段界与段长对比（j 侧 vs x86） ==');
  const jNtb = marks.filter((m) => m.t.startsWith('NTB'));
  // 全局时间轴平移：以第一个 NTB 开始为零点不可得（NtbCap 没有 in 序号？有：in 时未记）——补记：
  void phaseNtb; void AbortErr;
  // 重新读取 marks 中 NTBn（段末序号），x 端 CALLEND 对应同一段末。
  for (let k = 0; k < Math.min(7, jNtb.length); k++) {
    const ji = ntbIn[k] ?? -1;
    const jd = jNtb[k].s - ji;
    const xd = X_CALLS[k][1] - X_CALLS[k][0] + 1;
    console.log(`NTB${k + 1}: j_end=${jNtb[k].s} 段长~${jd} | x 段长=${xd} Δ=${jd - xd}`);
  }
  const byT = (t: string): number => { const m = marks.filter((mm) => mm.t === t); return m.length ? m[0].s : -1; };
  // 全量序列（按序去重后打印段长）
  console.log('marks seq:', marks.map((m) => `${m.t}@${m.s}`).join(' '));
  const fIn = byT('FNTBIN'), fOut = byT('FNTBOUT'), scIn = byT('SCIN'), scOut = byT('SCOUT');
  console.log(`FNTB: j=[${fIn},${fOut}] len=${fOut - fIn} | x len=${X_FNTB[1] - X_FNTB[0]} Δ=${fOut - fIn - (X_FNTB[1] - X_FNTB[0])}`);
  console.log(`SC  : j=[${scIn},${scOut}] len=${scOut - scIn} | x len=${X_SC[1] - X_SC[0]} Δ=${scOut - scIn - (X_SC[1] - X_SC[0])}`);
}, 900_000);
