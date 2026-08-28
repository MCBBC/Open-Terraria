// IIII24 批诊断 j：FinishNotTheBees 段【逐掷值级对拍】——把 js 侧 FNTBIN..FNTBOUT
// 的样本流落盘，与 x-allvals2.i32 对应行窗做前缀比对，打印首个分叉掷及上下文。
import { it } from 'vitest';
import { openSync, readSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const XPATH = '/tmp/iii24-out/x-allvals2.i32';
const CHUNK = 1 << 20;
const X_BEGIN1 = 68_617_938;                       // run2 CALLBEGIN1 rc
const X_NTB7L0 = 187_774_082 - X_BEGIN1;           // NTB#7 段起点线号（0-based）
const X_SPAN = 221_707_005 - 187_774_082;          // 覆盖至 FNTBOUT 的行数

it('fntb value diff', async () => {
  const fx = openSync(XPATH, 'r');
  const loadX = (startLine0: number): Int32Array => {
    const want = Math.min(CHUNK, 153_205_228 - startLine0);
    const view = Buffer.alloc(Math.max(4, want * 4));
    let got = 0;
    while (got < view.length) {
      const n = readSync(fx, view, got, view.length - got, startLine0 * 4 + got);
      if (n <= 0) break;
      got += n;
    }
    return new Int32Array(view.buffer, view.byteOffset, got >> 2);
  };
  let buf = new Int32Array(40_000_000);
  let n = 0;
  let capOn = false, offSeen = false;
  let fntbIn = -1, firstIn = -1, seventhIn = -1, ntbOuts = 0;
  let seq = 0;

  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (...a: unknown[]) => number;
  proto.internalSample = function (this: unknown, ...args: unknown[]): number {
    const v = orig.apply(this, args) as number;
    seq++;
    if (capOn && !offSeen && n < buf.length) { buf[n++] = v; }
    return v;
  };
  const g0 = globalThis as { __swNTBCap?: (p: string) => void; __swFCMark?: (t: string) => void };
  g0.__swNTBCap = (ph: string): void => {
    if (ph === 'in') {
      ntbOuts++;
      if (ntbOuts === 7) { seventhIn = seq; capOn = true; }   // 自 NTB#7 入口起捕获
    } else { /* out */ }
  };
  g0.__swFCMark = (t: string): void => {
    if (t === 'FNTBIN') { fntbIn = seq; }
    else if (t === 'FNTBOUT') { offSeen = true; }
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1372357239', evil: -1 as const,
      seedFlags: { notTheBees: true },
    });
  } finally {
    proto.internalSample = orig;
    delete g0.__swNTBCap; delete g0.__swFCMark;
  }

  // 值级前缀比对（自 NTB#7 起点对齐）
  console.log(`seventhIn=${seventhIn} fntbIn=${fntbIn} captured n=${n} (x span ${X_SPAN})`);
  const COMP = Math.min(n, X_SPAN);
  let d = -1;
  let xBuf = new Int32Array(0);
  let base = -1;
  for (let k = 0; k < COMP; k++) {
    const line = X_NTB7L0 + k;
    if (!(line >= base && line < base + xBuf.length)) {
      base = line;
      xBuf = loadX(base);
      if (xBuf.length === 0) break;
    }
    const xv = xBuf[line - base]!;
    if (xv !== buf[k]) { d = k; break; }
  }
  if (d < 0) {
    console.log(`★ 前 ${COMP} 行值全等；长度差 j-n-span = ${n - X_SPAN}`);
  } else {
    console.log(`★ 首分叉 @rel=${d}${d <= 11_626_776 ? '（NTB#7 扫内）' : `（Finish 域内偏移=${d - 11_626_776}）`}`);
    const W0 = Math.max(0, d - 5);
    xBuf = loadX(W0);
    for (let k = 0; k <= 13; k++) {
      const rel = W0 + k;
      const xi = (rel - W0 < xBuf.length) ? xBuf[rel - W0] : NaN;
      console.log(`   ${rel === d ? '>>' : '  '} rel=${rel} x=${xi} j=${buf[rel] ?? 'EOF'}${rel === d ? ' <==DIVERGE' : ''}`);
    }
  }
  closeSync(fx);
}, 900_000);
