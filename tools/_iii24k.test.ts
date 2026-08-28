// IIII24 批诊断 k：OGD 子事件流对拍——js 侧采集 OCOL/OCELL/OWRITE/OTRYTREE/OPLANT/
// OVC 事件（带坐标），导出为文本，与 x-chron 同段过滤行做逐行对齐。
import { it } from 'vitest';
import { writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const X_CHRON = process.env.SW_XCHRON ?? '/tmp/iii24-out/x-chron6.txt';
const OUTJ = '/tmp/iii24-out/j-ogd.txt';

it('ogd event stream', async () => {
  let seq = 0;
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (...a: unknown[]) => number;
  proto.internalSample = function (this: unknown, ...args: unknown[]): number {
    const v = orig.apply(this, args) as number;
    seq++;
    return v;
  };
  const lines: string[] = [];
  let inWin = false, winEnded = false;
  const g0 = globalThis as { __swNTBCap?: (p: string) => void; __swFCMark?: (t: string, a?: number, b?: number) => void };
  g0.__swNTBCap = (ph: string): void => {
    if (!winEnded && ph === 'in') ntbIns7();
    if (winEnded) return;
  };
  let ntbCount = 0;
  function ntbIns7(): void {
    ntbCount++;
    if (ntbCount === 7) inWin = true;
  }
  g0.__swFCMark = (t: string, a?: number, b?: number): void => {
    if (inWin) lines.push(`${t} ${a ?? 0} ${b ?? 0} rc=${seq}`);
    if (t === 'FNTBOUT') { winEnded = true; }
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
  writeFileSync(OUTJ, lines.join('\n'));
  console.log(`j ogd events=${lines.length}`);
}, 900_000);
