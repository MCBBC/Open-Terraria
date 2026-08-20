import { it } from 'vitest';
import { getPass, defaultUniforms } from '../src/fx/SM2Effect';
it('uniforms landing', () => {
  const pass = getPass('HorizonClouds')!;
  const u = defaultUniforms();
  u.uColor = [1, 0.9647, 0.8];
  u.uDrawPosition = [100, 50];
  u.uShaderSpecificData = [200, 60, 0.8, 0];
  const c = pass.setupConstants(u);
  for (let r = 0; r < 9; r++) console.log(`c${r}`, [0,1,2,3].map(k=>+c[r*4+k].toFixed(4)));
  console.log('symbols', (pass as any).symbols ?? 'private');
});
