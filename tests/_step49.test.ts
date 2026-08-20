import { it } from 'vitest';
import fx from '../src/data/fxPixelShader.json';
const OPS: Record<number, number> = {
  0x01: 2, 0x02: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2, 0x0E: 2, 0x13: 2,
  0x1F: 2, 0x23: 2, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
it('single-step', () => {
  const p = (fx as any).passes.find((x: any) => x.pass === 'WaterProcessor');
  const toks = p.tokens;
  let i = 0; let n = 0;
  while (i < toks.length) {
    const tok = toks[i++]; const op = tok & 0xFFFF;
    if (op === 0xFFFF) break;
    const nOps = OPS[op]; if (nOps === undefined) break;
    const raw = toks.slice(i, i + nOps); i += nOps;
    if (op === 0x51 || op === 0x1F) { n++; continue; }
    if (n >= 20 && n <= 30) {
      console.log(`#${n} op=0x${op.toString(16)} dst=0x${(raw[0]>>>0).toString(16)} srcs=${raw.slice(1).map(t=>(t>>>0).toString(16)).join(',')}`);
    }
    n++;
  }
});
