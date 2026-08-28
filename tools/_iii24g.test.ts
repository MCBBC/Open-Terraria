// IIII24 批诊断 g：全程样本值流【早期中止版】——逐 InternalSample 与
// /tmp/iii24-out/x-allvals.i32（x86 rig SW_ROLLALL 权威流，119,156,144 样本）比对，
// 首个不同值处打印上下文并立刻中止（throw AbortErr 提前结束生成省时）。
// 用法：cd game && SW_III24G=1 npx vitest run tools/_iii24g.test.ts
import { it } from 'vitest';
import { openSync, readSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

class AbortErr extends Error {}
const XPATH = '/tmp/iii24-out/x-allvals.i32';
const XTOTAL = 119_156_144;
const CHUNK = 1 << 20; // 样本数/页

it('allvals early-abort diff', async () => {
  const fx = openSync(XPATH, 'r');
  let xBuf = new Int32Array(CHUNK);
  let xLen = 0;
  let xBase = -1;      // buf 首个全局索引
  let seq = 0;         // 全局比对指针（JS 抽样序号）
  let done = false;

  const loadX = (startIdx: number): void => {
    const want = Math.min(CHUNK, XTOTAL - startIdx);
    const view = Buffer.alloc(Math.max(4, want * 4));
    let got = 0;
    while (got < view.length) {
      const n = readSync(fx, view, got, view.length - got, startIdx * 4 + got);
      if (n <= 0) break;
      got += n;
    }
    xLen = got >> 2;
    xBuf = new Int32Array(view.buffer, view.byteOffset, xLen);
    xBase = startIdx;
  };

  const checkOne = (v: number): void => {
    if (done) return;
    if (seq < xBase || seq >= xBase + xLen) {
      loadX(seq);
      if (xLen === 0) { done = true; console.log(`★ JS 多掷：JS=${seq} > x86 总数 ${XTOTAL}`); throw new AbortErr('extra'); }
    }
    const xv = xBuf[seq - xBase]!;
    if (xv !== v) {
      done = true;
      console.log(`★ FIRST DIFF at sample idx=${seq} jv=${v} xv=${xv}`);
      for (let k = Math.max(0, seq - 8); k < Math.min(xLen + xBase, seq + 6); k++) {
        if (k < xBase || k >= xBase + xLen) loadX(k);
        const xi2 = xBuf[Math.max(0, k - xBase)] ?? -777;
        console.log(`   ${k === seq ? '>>' : '  '} idx=${k} x=${xi2}`);
      }
      throw new AbortErr('firstdiff');
    }
    seq++;
  };

  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (...a: unknown[]) => number;
  proto.internalSample = function (this: unknown, ...args: unknown[]): number {
    const v = orig.apply(this, args) as number;
    try { checkOne(v); } catch (e) { if (!(e instanceof AbortErr)) throw e; }
    return v;
  };
  let marks = '';
  let stopped = '';
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1372357239', evil: -1 as const,
      seedFlags: { notTheBees: true },
      onWorldPartial: (_w, i, pn) => { marks += `#${i}:${pn} `; },
    });
  } catch (e) {
    if (!(e instanceof AbortErr)) throw e;
    stopped = String((e as Error).message);
  } finally {
    proto.internalSample = orig;
    closeSync(fx);
  }
  console.log(`stopped=${stopped} total_samples_at_stop=${seq}`);
  console.log(`slots passed: ${marks.slice(-220)}`);
}, 900_000);
