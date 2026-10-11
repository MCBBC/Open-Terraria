// ★SM2 池化验证网（2026-10-11,任务#15 刀①;Windows Trace-225221 fit 2571ms+GC 25.6/s
// 对照面定谳——qs-mac-control-face）。
// 覆盖面：
//  ① pool↔fresh 双跑逐位对拍（多 pass×多形态:t0Rect/extraSamplers/v0Rgb/异尺寸）
//  ② 污染序定谳：大 tile→小 tile→异 pass→复跑原始——c/inpool/outregs/temps/regs/
//     tex/v0/o/written/srcData 全脏化后复用,输出须与首跑逐位同（零基线 fill(0) 面）
//  ③ resOut 出参路径 VM/codegen 双引擎对拍+null(texkill) 契约
//  ④ dup 自洽（同场景两次独立执行哈希同——bit-golden dup 层的池化域专项）
// 位级金标网 fx-sm2-bit-golden（63 pass×12 场景,池化缺省开=直接跑池化路径）与
// fx-codegen-parity/fx-sm2-v0-commute 为本刀的既有关闸,此处只做池化专项。
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.setConfig({ testTimeout: 120000 });
import {
  defaultUniforms, getPass, runPassOnImageData,
  setSm2PoolEnabled, setSm2CodegenEnabled,
  type SM2Uniforms, type SM2SamplerOut,
} from '../src/fx/SM2Effect';

// ---------- 夹具 ----------
/** 种子 LCG 确定性输入（同种子同字节——双跑对拍前提） */
function seededInput(w: number, h: number, seed: number): Uint8ClampedArray {
  let s = seed >>> 0;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s >>> 24) & 0xff;
  }
  return d;
}
/** 确定性 s1/s2 出参采样器（wrap 语义由本测试自担,只求确定性） */
function noiseSampler(seed: number): SM2SamplerOut {
  return (u: number, v: number, o4: Float64Array): void => {
    o4[0] = (((u * 7 + seed) % 1) + 1) % 1;
    o4[1] = (((v * 11 + seed * 0.37) % 1) + 1) % 1;
    o4[2] = (((u + v + seed) % 1) + 1) % 1;
    o4[3] = 1;
  };
}
function bytesEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface RunSpec {
  pass: string;
  w: number; h: number;
  uni: (u: SM2Uniforms) => void;
  extras?: SM2SamplerOut[];
  rect?: { sx: number; sy: number; sheetW: number; sheetH: number };
  v0Rgb?: readonly [number, number, number];
}
function runSpec(sp: RunSpec): Uint8ClampedArray {
  const pass = getPass(sp.pass);
  if (!pass) throw new Error(`pass missing: ${sp.pass}`);
  const data = seededInput(sp.w, sp.h, 0x5eed);
  const u = defaultUniforms();
  sp.uni(u);
  runPassOnImageData(pass, data, sp.w, sp.h, u, sp.extras ?? [], sp.rect, sp.v0Rgb);
  return data;
}

afterEach(() => {
  setSm2PoolEnabled(true);      // 恢复缺省（生产缺省面）
  setSm2CodegenEnabled(true);   // 恢复 codegen 缺省
});

const QS_NOISE = [noiseSampler(3), noiseSampler(17)];

describe('SM2 池化 pool↔fresh 逐位对拍', () => {
  const SPECS: RunSpec[] = [
    { pass: 'QueenSlime', w: 74, h: 86, uni: (u) => { u.uTime = 1.35; u.uSourceRect = [4, 6, 74, 86]; u.uImageSize0 = [592, 344]; }, extras: QS_NOISE },
    { pass: 'QueenSlime', w: 74, h: 86, uni: (u) => { u.uTime = 2.71; }, extras: QS_NOISE, rect: { sx: 2, sy: 3, sheetW: 16, sheetH: 16 } },
    { pass: 'ArmorColored', w: 40, h: 56, uni: (u) => { u.uColor = [0.13, 0.87, 0.5]; u.uSecondaryColor = [0.9, 0.25, 0.66]; u.uSaturation = 1.7; u.uTime = 2.71; } },
    { pass: 'ForceField', w: 64, h: 64, uni: (u) => { u.uTime = 0.927; u.uOpacity = 0.37; }, extras: [noiseSampler(5)] },
    { pass: 'ArmorColored', w: 40, h: 56, uni: (u) => { u.uTime = 1.35; }, v0Rgb: [0.25, 0.5, 0.75] },   // v0 中段消费路由
  ];
  for (const sp of SPECS) {
    it(`逐位等价 ${sp.pass} ${sp.w}x${sp.h}${sp.rect ? ' rect' : ''}${sp.v0Rgb ? ' v0' : ''}`, () => {
      setSm2PoolEnabled(false);
      const fresh = runSpec(sp);
      setSm2PoolEnabled(true);
      const pooledCold = runSpec(sp);
      expect(bytesEqual(fresh, pooledCold), 'cold pooled ≠ fresh').toBe(true);
    });
  }
});

describe('SM2 池化污染序', () => {
  it('大→小→异 pass→复跑原始:全 scratch 脏化后输出与 fresh 逐位同', () => {
    const target: RunSpec = { pass: 'QueenSlime', w: 74, h: 86, uni: (u) => { u.uTime = 1.35; u.uSourceRect = [4, 6, 74, 86]; u.uImageSize0 = [592, 344]; }, extras: QS_NOISE };
    const big: RunSpec = { pass: 'ForceField', w: 128, h: 128, uni: (u) => { u.uTime = 7.77; }, extras: [noiseSampler(9)] };
    const small: RunSpec = { pass: 'ArmorColored', w: 17, h: 13, uni: (u) => { u.uTime = 0.001; u.uOpacity = 0.02; } };

    setSm2PoolEnabled(false);
    const freshTarget = runSpec(target);

    setSm2PoolEnabled(true);
    const cold = runSpec(target);                 // 冷池首跑
    void runSpec(big);                            // 大 tile:srcData 增长+c/outregs 全写面变化
    void runSpec(small);                          // 小 tile:srcData 复用(大于所需)+written 异集
    void runSpec({ ...big, w: 33, h: 21 });       // 同 pass 异尺寸再脏一轮
    const warm = runSpec(target);                 // 复跑原始:须与冷池/fresh 逐位同

    expect(bytesEqual(cold, freshTarget), 'cold ≠ fresh').toBe(true);
    expect(bytesEqual(warm, freshTarget), 'warm(污染后) ≠ fresh').toBe(true);
  });
  it('同场景两次独立执行哈希自洽(dup 层池化域)', () => {
    const sp: RunSpec = { pass: 'ArmorColored', w: 40, h: 56, uni: (u) => { u.uColor = [0.13, 0.87, 0.5]; u.uTime = 2.71; } };
    setSm2PoolEnabled(true);
    const a = runSpec(sp);
    const b = runSpec(sp);
    expect(bytesEqual(a, b), 'dup 自洽破坏=跨调用状态泄漏').toBe(true);
  });
});

describe('execPixel resOut 出参契约（VM/codegen 双引擎）', () => {
  it('resOut 与 fresh 元组逐位同(codegen)', () => {
    const pass = getPass('QueenSlime')!;
    const c = pass.setupConstants({ ...defaultUniforms(), uTime: 1.35 });
    const regs = new Float64Array(128), tex = new Float64Array(32), v0 = new Float64Array(8), o = new Float64Array(4);
    const samplers = [undefined, noiseSampler(3), noiseSampler(17), undefined];
    const r1 = pass.execPixel(c, regs, tex, v0, o, 0.3, 0.7, samplers);
    expect(r1).not.toBeNull();
    const buf: [number, number, number, number] = [0, 0, 0, 0];
    const r2 = pass.execPixel(c, regs, tex, v0, o, 0.3, 0.7, samplers, buf);
    expect(r2).toBe(buf);                       // 原引用返回
    expect([r1![0], r1![1], r1![2], r1![3]]).toEqual([buf[0], buf[1], buf[2], buf[3]]);
  });
  it('resOut 与 fresh 元组逐位同(VM 回退)', () => {
    setSm2CodegenEnabled(false);
    const pass = getPass('QueenSlime')!;
    const c = pass.setupConstants({ ...defaultUniforms(), uTime: 1.35 });
    const regs = new Float64Array(128), tex = new Float64Array(32), v0 = new Float64Array(8), o = new Float64Array(4);
    const samplers = [undefined, noiseSampler(3), noiseSampler(17), undefined];
    const r1 = pass.execPixel(c, regs, tex, v0, o, 0.3, 0.7, samplers);
    const buf: [number, number, number, number] = [0, 0, 0, 0];
    const r2 = pass.execPixel(c, regs, tex, v0, o, 0.3, 0.7, samplers, buf);
    expect(r2).toBe(buf);
    expect([r1![0], r1![1], r1![2], r1![3]]).toEqual([buf[0], buf[1], buf[2], buf[3]]);
  });
});

describe('全栈 runPassOnImageData 池化×引擎双跑', () => {
  it('pool ON:VM 与 codegen 输出逐位同(全栈)', () => {
    const sp: RunSpec = { pass: 'QueenSlime', w: 74, h: 86, uni: (u) => { u.uTime = 1.35; u.uSourceRect = [4, 6, 74, 86]; u.uImageSize0 = [592, 344]; }, extras: QS_NOISE };
    setSm2PoolEnabled(true);
    setSm2CodegenEnabled(false);
    const vmOut = runSpec(sp);
    setSm2CodegenEnabled(true);
    const genOut = runSpec(sp);
    expect(bytesEqual(vmOut, genOut), '全栈 VM≠codegen(池化路径)').toBe(true);
  });
});
