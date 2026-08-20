import { it } from 'vitest';
import { getPass, defaultUniforms } from '../src/fx/SM2Effect';
import { washShapeValue } from '../src/render/WaterWaves';
it('WaterDistortionObject interpreter probes', () => {
  const pass = getPass('WaterDistortionObject')!;
  const u = defaultUniforms();
  const c = pass.setupConstants(u);
  const regs = new Float64Array(32 * 4);
  const o = new Float64Array(4);
  const run = (vcol: number[], t0: [number, number]) => {
    const tex = new Float64Array(8 * 4);
    tex[0] = t0[0]; tex[1] = t0[1];
    const v0 = new Float64Array(8); v0[0]=vcol[0]; v0[1]=vcol[1]; v0[2]=vcol[2]; v0[3]=vcol[3];
    const r = pass.execPixel(c, regs, tex, v0, o, t0[0], t0[1], []);
    return r!;
  };
  // v0 = (flowX+0.5, flowY+0.5, strength); t0 = quad uv
  // 探针1: r<6.28 内圈 (|uvc|=0.1): uvc=(0.1,0), flow=(-1,0)+0.5=(−0.5,0.5)... 取 flow signed (−0.5,0)
  const p1 = run([-0.5 + 0.5, 0.0 + 0.5, 1.0], [0.6, 0.5]);  // uvc=(0.1,0), flowSigned=(−0.5,0)
  const mine1 = washShapeValue(0.1, 0, -0.5, 0, 1);
  console.log('r<6.28 probe: interp', p1, 'washShapeValue', mine1);
  const p2 = run([-0.5 + 0.5, 0.0 + 0.5, 1.0], [0.85, 0.5]); // uvc=(0.35,0), r=8.79 ∈ [6.28,12.56)
  const mine2 = washShapeValue(0.35, 0, -0.5, 0, 1);
  console.log('mid probe: interp', p2, 'washShapeValue', mine2);
  const p3 = run([-0.5 + 0.5, 0.0 + 0.5, 0.5], [0.95, 0.5]); // uvc=0.45 → r=11.3
  const mine3 = washShapeValue(0.45, 0, -0.5, 0, 0.5);
  console.log('near-outer: interp', p3, 'washShapeValue', mine3);
  const p4 = run([-0.5 + 0.5, 0.0 + 0.5, 0.5], [0.99, 0.5]); // uvc=0.49 → r=12.3 <12.56
  const mine4 = washShapeValue(0.49, 0, -0.5, 0, 0.5);
  console.log('r12.3: interp', p4, 'washShapeValue', mine4);
  const p5 = run([-0.5 + 0.5, 0.0 + 0.5, 0.5], [0.999, 0.5]); // r≈12.55... let's do corners: (0.98,0.9): uvc=(0.48,0.4) r=0.625*25.12=15.7 ≥12.56
  const p5b = run([-0.5 + 0.5, 0.0 + 0.5, 0.5], [0.98, 0.9]);
  const mine5 = washShapeValue(0.48, 0.4, -0.5, 0, 0.5);
  console.log('outer: interp', p5b, 'washShapeValue', mine5, 'unused p5', p5);
});
