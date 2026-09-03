// PR#3 双跑差分门：VM(execPixelVM) ↔ codegen 直线代码 同进程逐像素对拍。
// 通过条件（机器可证视觉正确性）：
//   ① 有限通道 Object.is 全等(含 −0)；NaN 按【值类】比对(位型硬件非确定,
//      见 fx-sm2-bit-golden 头注实证 ArmorAcid)；
//   ② texkill 路径 null ⇔ null；
//   ③ runPassOnImageData 全栈 Uint8 逐字节恒等(两种引擎独立跑同一输入)。
// 差异样本 dump：pass/场景/像素/通道 + 双侧十六进制位型。
import { describe, it, expect, afterAll, vi } from 'vitest';
// 本机多会话常态高负载(load 80+):默认 5s testTimeout 把 63 pass 差分门打成伪红——显式放宽
vi.setConfig({ testTimeout: 600000 });
import {
  defaultUniforms, getPass, passNames, runPassOnImageData, setSm2CodegenEnabled,
  type SM2Uniforms,
} from '../src/fx/SM2Effect';

const W = 8, H = 8;
interface Scene { id: string; uni: (u: SM2Uniforms) => void; rect?: { sx: number; sy: number; sheetW: number; sheetH: number } }
const SCENES: Scene[] = [
  { id: 'S01-white', uni: (u) => { u.uTime = 1.35; } },
  { id: 'S02-gradient', uni: (u) => { u.uColor = [0.13, 0.87, 0.5]; u.uSecondaryColor = [0.9, 0.25, 0.66]; u.uSaturation = 1.7; u.uTime = 2.71; } },
  { id: 'S05-negfold', uni: (u) => { u.uTime = -0.7; } },
  { id: 'S06-bigtime', uni: (u) => { u.uTime = 3599.7; } },
  { id: 'S08-sat-eps', uni: (u) => { u.uSaturation = 1e-3; u.uColor = [0.8, 0.1, 0.35]; } },
  { id: 'S09-rect', uni: (u) => { u.uTime = 1.35; }, rect: { sx: 2, sy: 3, sheetW: 16, sheetH: 16 } },
];

function srcBytes(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = ((x * 37 + y * 17) ^ (x * 11)) & 255;
    d[i + 1] = (x * 29 + y * 53) & 255;
    d[i + 2] = ((x * 5 - y * 13) + 256) & 255;
    d[i + 3] = x === w - 1 ? 26 : 255;
  }
  return d;
}
function crop(sheet: Uint8ClampedArray, sw: number, sx: number, sy: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((sy + y) * sw + sx + x) * 4; const di = (y * W + x) * 4;
    d[di] = sheet[si]; d[di + 1] = sheet[si + 1]; d[di + 2] = sheet[si + 2]; d[di + 3] = sheet[si + 3];
  }
  return d;
}
function mkRun(scene: Scene) {
  const sheetW = scene.rect ? scene.rect.sheetW : W;
  const sheetH = scene.rect ? scene.rect.sheetH : H;
  const sheet = srcBytes(sheetW, sheetH);
  const seed = scene.rect ? crop(sheet, sheetW, scene.rect.sx, scene.rect.sy) : srcBytes(W, H);
  const uni = defaultUniforms();
  scene.uni(uni);
  return { seed: new Uint8ClampedArray(seed), uni };
}

/** 通用采样槽：s0=切片 clamp、s1=恒等 ramp(wrap 由 sampleImageData 承担语义差异无必要——
 *  门只对拍两侧一致性)、s2=中性灰。全 pass 共用。 */
function buildSamplers(seed: Uint8ClampedArray) {
  const s0out = (uu: number, vv: number, o4: Float64Array): void => {
    const i = (((Math.min(H - 1, Math.max(0, vv * H | 0))) * W) + Math.min(W - 1, Math.max(0, uu * W | 0))) * 4;
    o4[0] = seed[i] / 255; o4[1] = seed[i + 1] / 255; o4[2] = seed[i + 2] / 255; o4[3] = seed[i + 3] / 255;
  };
  const rampOut = (uu: number, vv: number, o4: Float64Array): void => {
    o4[0] = uu; o4[1] = vv; o4[2] = 0.5; o4[3] = 1;
  };
  return [s0out, rampOut];
}

describe('fx-codegen-parity：codegen ↔ VM 位级差分门', () => {
  let failures = 0;
  it('63 pass × 场景矩阵逐位一致(uint8/Object.is)', () => {
    expect(passNames().length).toBe(63);
    for (const name of passNames()) {
      const pass = getPass(name)!;
      expect(pass).toBeTruthy();
      for (const sc of SCENES) {
        const { seed, uni } = mkRun(sc);
        // A. 直连逐像素（v0 双变体：恒白=历史域；dim 光色=v0 化批新增域）
        const V0_VARS: Array<[number, number, number]> = [[1, 1, 1], [0.3, 0.35, 0.42]];
        for (const v0rgb of V0_VARS) {
        for (let cell = 0; cell < W * H; cell++) {
          const x = cell % W, y = (cell / W) | 0;
          const tx = sc.rect ? (sc.rect.sx + x + 0.5) / sc.rect.sheetW : (x + 0.5) / W;
          const ty = sc.rect ? (sc.rect.sy + y + 0.5) / sc.rect.sheetH : (y + 0.5) / H;
          const c = pass.setupConstants(uni);
          const samplers = buildSamplers(seed);
          setSm2CodegenEnabled(false);
          const regsA = new Float64Array(32 * 4), texA = new Float64Array(8 * 4), vA = new Float64Array(8), oA = new Float64Array(4);
          vA[0] = v0rgb[0]; vA[1] = v0rgb[1]; vA[2] = v0rgb[2]; vA[3] = 1;
          const vm = pass.execPixel(c, regsA, texA, vA, oA, tx, ty, samplers);
          setSm2CodegenEnabled(true);
          const regsB = new Float64Array(32 * 4), texB = new Float64Array(8 * 4), vB = new Float64Array(8), oB = new Float64Array(4);
          vB[0] = v0rgb[0]; vB[1] = v0rgb[1]; vB[2] = v0rgb[2]; vB[3] = 1;
          const gen = pass.execPixel(c, regsB, texB, vB, oB, tx, ty, samplers);
          if ((vm === null) !== (gen === null)) { failures++; continue; }
          if (vm && gen) for (let k = 0; k < 4; k++) {
            const a = vm[k], b = gen[k];
            const sameClass = (Number.isNaN(a) && Number.isNaN(b));
            if (!sameClass && !Object.is(a, b)) {
              failures++;
              if (failures <= 12) console.error(`DIFF ${name}/${sc.id} v0=${v0rgb} (${x},${y}) ch${k}: VM=${a} GEN=${b}`);
            }
          }
        }
        }
        // B. 全栈 uint8（v0 双变体同上）
        for (const v0rgb of V0_VARS) {
          setSm2CodegenEnabled(false);
          const dVM = new Uint8ClampedArray(seed);
          runPassOnImageData(pass, dVM, W, H, uni, [], sc.rect, v0rgb);
          setSm2CodegenEnabled(true);
          const dGen = new Uint8ClampedArray(seed);
          runPassOnImageData(pass, dGen, W, H, uni, [], sc.rect, v0rgb);
          for (let i = 0; i < dVM.length; i++) if (dVM[i] !== dGen[i]) {
            failures++;
            if (failures <= 12) console.error(`STACK-DIFF ${name}/${sc.id} v0=${v0rgb} byte#${i}: VM=${dVM[i]} GEN=${dGen[i]}`);
          }
        }
      }
    }
    setSm2CodegenEnabled(true);                       // 恢复生产默认
    expect(failures).toBe(0);
  });
  afterAll(() => setSm2CodegenEnabled(true));
});
