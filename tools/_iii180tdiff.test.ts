// IIII180：轨段起点快照 diff（js-trackdump vs or-trackdump）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
it('trackdump diff', () => {
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const jT = le16(readFileSync('/tmp/iii180-out/js-trackdump.typ')), jA = readFileSync('/tmp/iii180-out/js-trackdump.act'),
    jW = le16(readFileSync('/tmp/iii180-out/js-trackdump.wal')), jH = readFileSync('/tmp/iii180-out/js-trackdump.half'), jS = readFileSync('/tmp/iii180-out/js-trackdump.slope');
  const oT = le16(readFileSync('/tmp/iii180-out/or-trackdump.typ')), oA = readFileSync('/tmp/iii180-out/or-trackdump.act'),
    oW = le16(readFileSync('/tmp/iii180-out/or-trackdump.wal')), oH = readFileSync('/tmp/iii180-out/or-trackdump.half'), oS = readFileSync('/tmp/iii180-out/or-trackdump.slope');
  const buckets = new Map<string, number>();
  let n = 0;
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const jt = jA[i] ? SHEET[jT[i]] : 0, ot = oA[i] ? oT[i] : 0;
    const d = (jt !== ot ? 'T' : '') + ((jA[i] ? 1 : 0) !== (oA[i] ? 1 : 0) ? 'A' : '') + (jW[i] !== oW[i] ? 'W' : '')
      + (jH[i] !== oH[i] ? 'H' : '') + (jS[i] !== oS[i] ? 'S' : '');
    if (!d) continue;
    n++;
    const x = i % W, y = (i / W) | 0;
    const key = `${d}@y${(y / 50) | 0}x${(x / 50) | 0}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    if (samples.length < 30) samples.push(`(${x},${y}) ${d} js t${jt}/a${jA[i] ? 1 : 0}/w${jW[i]}/h${jH[i]}/s${jS[i]} | or t${ot}/a${oA[i] ? 1 : 0}/w${oW[i]}/h${oH[i]}/s${oS[i]}`);
  }
  console.log(`TDIFF total=${n}`);
  for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${v}\t${k}`);
  console.log(samples.join('\n'));
});
