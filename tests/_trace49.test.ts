import { it } from 'vitest';
import { getPass, defaultUniforms } from '../src/fx/SM2Effect';
it('trace neutral', () => {
  const pass = getPass('WaterProcessor')!;
  const u = defaultUniforms();
  u.uImageSize0 = [480, 270];
  const c = pass.setupConstants(u);
  const regs = new Float64Array(32 * 4);
  const tex = new Float64Array(8 * 4);
  const v0 = new Float64Array(8); v0.fill(1);
  const o = new Float64Array(4);
  const s0 = () => [0.5, 0.5, 0, 1];
  const r = pass.execPixel(c, regs, tex, v0, o, 0.5, 0.5, [s0]);
  console.log('out', r);
  for (let i = 0; i < 6; i++) console.log(`r${i} =`, [0,1,2,3].map(k=>regs[i*4+k]).map(x=>+x.toFixed(6)).join(', '));
  console.log('c2..c5', [2,3,4,5].map(rr => [0,1,2,3].map(k=>c[rr*4+k]).map(x=>+x.toFixed(6)).join(',')).join(' | '));
});
