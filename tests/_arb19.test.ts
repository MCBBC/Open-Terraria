import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SM2Pass, defaultUniforms, type SM2Sampler } from '../src/fx/SM2Effect';
it('FilterWaterDistortion trace', () => {
  const j = JSON.parse(readFileSync('/tmp/fxScreenShader.json', 'utf8'));
  const p = j.passes.find((x: any) => x.pass === 'FilterWaterDistortion');
  const pass = new SM2Pass(p);
  const u = defaultUniforms();
  u.uScreenResolution = [1512, 862];
  u.uScreenPosition = [10, 20];
  u.uTargetPosition = [5, 8];
  u.uImageOffset = [0, 0];
  u.uIntensity = 1.2;
  u.uOpacity = 1;
  u.uProgress = 100;
  u.uImageSize1 = [256, 256];
  u.uImageSize2 = [378, 216];
  u.uImageSize3 = [378, 216];
  const c = pass.setupConstants(u);
  console.log('c0..c11:', [0,1,2,3,4,5,6,7,8,9,10,11].map(r=>[0,1,2,3].map(k=>+c[r*4+k].toFixed(4)).join(',')).join(' | '));
  const regs = new Float64Array(32 * 4);
  const o = new Float64Array(4);
  const tex = new Float64Array(8 * 4);
  tex[0] = 700; tex[1] = 400;
  const v = new Float64Array(8 * 4); v.fill(1);
  const log: string[] = [];
  const mk = (name: string, val: [number,number,number,number]): SM2Sampler => (uu, vv) => {
    log.push(`${name}(${uu.toFixed(4)}, ${vv.toFixed(4)})`);
    return val;
  };
  const r = pass.execPixel(c, regs, tex, v, o, 700 / 1512, 400 / 862, [
    mk('S0screen', [0.3, 0.5, 0.7, 0.8]),
    mk('S1noiseA', [0.7, 0.2, 0.4, 0.8]),
    mk('S2wavebuf', [0.5, 0.5, 0, 1]),
    mk('S3waterMask', [0.1, 0.1, 0.1, 0.6]),
  ]);
  console.log(log.join('\n'));
  console.log('out', r);
  console.log('t0 assumed (700,400,0,0); uProgress=100 c1/c2 =', c[4], c[8]);
});
