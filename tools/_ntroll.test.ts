// NTROLL 一次性探针：notraps 链 #66 Temple 全程低层录制（用完即删）
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom, RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_NTROLL === '1';
(RUN ? it : it.skip)('low-level roll capture notraps', async () => {
  const out = '/tmp/qqq-out/jsrolls-nt.txt';
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
  (globalThis as { __swSeg?: unknown }).__swSeg = (name: string, detail?: unknown) => {
    marks.push(`S ${name}${detail !== undefined ? JSON.stringify(detail) : ''}@${n}`);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    marks.push(`R ${s}@${n}`);
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1896728457', evil: 1,
      seedFlags: { noTraps: true },
      onWorldPartial: (_w, i, nm) => { marks.push(`P ${i} ${nm}@${n}`); },
    });
  } finally {
    proto.internalSample = orig;
    RNGp.reseed = oReseed;
    delete (globalThis as { __swSeg?: unknown }).__swSeg;
    flush();
    closeSync(out && h);
  }
  let off = 0;
  const text = `${marks.join('\n')}\nTOTAL ${n}\n`;
  while (off < text.length) off += writeSync(2, text.slice(off));
}, 600_000);
