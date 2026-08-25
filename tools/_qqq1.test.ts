// QQQQ 探针 v5：全程低层录制 + 紧凑段标记
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_QQQ_LOW === '1';
(RUN ? it : it.skip)('low-level roll capture', async () => {
  const out = process.env.SW_QQQ_OUT ?? '/tmp/qqq-out/jsall.txt';
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
  const QUIET = new Set(['treeTry', 'iceTry', 'trapTry', 'campTry', 'swordTry']);
  const marks: string[] = [];
  (globalThis as { __swSeg?: unknown }).__swSeg = (name: string, detail?: unknown) => {
    if (QUIET.has(name)) return;
    marks.push(`S ${name}${detail !== undefined ? JSON.stringify(detail) : ''}@${n}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0,
      onWorldPartial: (_w, i, nm) => { marks.push(`P ${i} ${nm}@${n}`); },
    });
  } finally {
    proto.internalSample = orig;
    delete (globalThis as { __swSeg?: unknown }).__swSeg;
    flush();
    closeSync(h);
  }
  let off = 0;
  const text = `${marks.join('\n')}\nTOTAL ${n}\n`;
  while (off < text.length) off += writeSync(2, text.slice(off));
}, 600_000);
