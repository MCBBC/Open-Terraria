// QQQC 探针：const 链（1321365005+theConstant）全程低层掷流录制 + pass 标记
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_QQQC === '1';
(RUN ? it : it.skip)('qqqc low-level roll capture (const)', async () => {
  const out = process.env.SW_QQQC_OUT ?? '/tmp/qqq-out/qc-js-const.txt';
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (this: UnifiedRandom) => number;
  let n = 0;
  let buf: string[] = [];
  const h = openSync(out, 'w');
  const flush = () => { if (buf.length) { writeSync(h, buf.join('')); buf = []; } };
  proto.internalSample = function (this: UnifiedRandom) {
    const v = orig.call(this);
    buf.push(`${v}\n`);
    if (++n % 2_000_000 === 0) flush();
    return v;
  };
  const marks: string[] = [];
  (globalThis as { __swSegQ?: unknown }).__swSegQ = (name: string, detail?: unknown) => {
    marks.push(`S ${name}${detail !== undefined ? JSON.stringify(detail) : ''}@${n}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1321365005', evil: 0,
      seedFlags: { theConstant: true } as never,
      onWorldPartial: (_w, i, nm) => { marks.push(`P ${i} ${nm}@${n}`); },
    });
  } finally {
    proto.internalSample = orig;
    delete (globalThis as { __swSegQ?: unknown }).__swSegQ;
    flush();
    closeSync(h);
  }
  let off = 0;
  const text = `${marks.join('\n')}\nTOTAL ${n}\n`;
  while (off < text.length) off += writeSync(2, text.slice(off));
}, 600_000);
