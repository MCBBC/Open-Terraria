// ★SM2 wasm 全 pass 化 go/no-go 判谳闸（2026-10-11,任务#20;用户令「能 wasm 的都 wasm」）。
// 判谳面:wasm↔JS 双跑逐位对拍——
//  ① 63 pass × 位级金标 12 场景(含 t0Rect/方向/光照源) maxd 必须=0
//     (宿主 Math 导入=与 JS V8 同源→逐位一致可保;≠0 = go/no-go 红灯,回用户拍板)
//  ② s1/s2 三规范形采样器端到端(wrapUV 双线性钳=染料 noise / wrapUV 最近邻=
//     QueenSlime Extra_180/179 / mod 回绕双线性=HallowBoss ramp)——逐位
//  ③ 全栈 runPassOnImageData 路由位等(wasm 命中 vs 强制 JS 双跑)
// 前置:ensureSm2Wasm()(node 经 fs 读 gen/sm2.wasm,实例化含 Math 导入)。
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
vi.setConfig({ testTimeout: 600000 });
import * as fs from 'node:fs';
import {
  defaultUniforms, getPass, passNames, runPassOnImageData, sampleImageInto,
  setSm2PoolEnabled, describeSampler,
  type SM2Uniforms, type SM2SamplerOut,
} from '../src/fx/SM2Effect';
import { ensureSm2Wasm, sm2WasmReady, __setSm2WasmFlagForTest, SM2TexMode } from '../src/wasm/sm2Wasm';

// ---------- 位级金标 12 场景(fx-sm2-bit-golden SCENES 同式复刻) ----------
interface Scene { id: string; uni: (u: SM2Uniforms) => void; rect?: { sx: number; sy: number; sheetW: number; sheetH: number } }
const SCENES: Scene[] = [
  { id: 'S01-white',        uni: (u) => { u.uTime = 1.35; } },
  { id: 'S02-gradient',     uni: (u) => { u.uColor = [0.13, 0.87, 0.5]; u.uSecondaryColor = [0.9, 0.25, 0.66]; u.uSaturation = 1.7; u.uTime = 2.71; } },
  { id: 'S03-t0',           uni: () => {} },
  { id: 'S04-t0927',        uni: (u) => { u.uTime = 0.927; } },
  { id: 'S05-negfold',      uni: (u) => { u.uTime = -0.7; } },
  { id: 'S06-bigtime',      uni: (u) => { u.uTime = 3599.7; } },
  { id: 'S07-spatial',      uni: (u) => { u.uDrawPosition = [131.5, 77.25]; u.uTargetPosition = [88, 401]; u.uShaderSpecificData = [0.25, -0.75, 2, 3]; u.uOpacity = 0.37; } },
  { id: 'S08-sat-eps',      uni: (u) => { u.uSaturation = 1e-3; u.uColor = [0.8, 0.1, 0.35]; } },
  { id: 'S09-rect',         uni: (u) => { u.uTime = 1.35; }, rect: { sx: 2, sy: 3, sheetW: 16, sheetH: 16 } },
  { id: 'S10-direction',    uni: (u) => { u.uDirection = -1; u.uRotation = 2.31; u.uImageSize1 = [256, 256]; u.uImageSize2 = [64, 32]; } },
  { id: 'S11-size0-explicit', uni: (u) => { u.uImageSize0 = [97, 51]; u.uTime = 11.11; } },
  { id: 'S12-lightsource',  uni: (u) => { u.uLightSource = [0.1, 0.2, 0.3, 0.4]; u.uLegacyArmorSourceRect = [4, 6, 40, 56]; u.uLegacyArmorSheetSize = [128, 192]; } },
];

function seededInput(w: number, h: number, seed: number): Uint8ClampedArray {
  let s = seed >>> 0;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s >>> 24) & 0xff;
  }
  return d;
}
function bytesEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return -1;
  let maxd = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxd) maxd = d;
  }
  return maxd;
}
/** 采样器规范形构造(与生产三站闭包【逐字同式】——直接用真 sampleImageInto) */
function noiseWrapBilinear(seed: number): { s: SM2SamplerOut; desc: Parameters<typeof describeSampler>[1] } {
  const w = 32, h = 32;
  const data = seededInput(w, h, seed);
  const f = (u: number, v: number, o4: Float64Array): void => {
    sampleImageInto(data, w, h, u - Math.floor(u), v - Math.floor(v), false, o4);   // vanillaDyes noise 逐字
  };
  return { s: f, desc: { data, w, h, mode: SM2TexMode.WRAPUV_BILINEAR_CLAMP } };
}
function queenNearest(seed: number): { s: SM2SamplerOut; desc: Parameters<typeof describeSampler>[1] } {
  const w = 64, h = 64;
  const data = seededInput(w, h, seed);
  const f = (u: number, v: number, o4: Float64Array): void => {
    const u2 = u - Math.floor(u), v2 = v - Math.floor(v);
    const x = Math.min(w - 1, (u2 * w) | 0), y = Math.min(h - 1, (v2 * h) | 0);
    const o = (y * w + x) * 4;
    o4[0] = data[o] / 255; o4[1] = data[o + 1] / 255; o4[2] = data[o + 2] / 255; o4[3] = data[o + 3] / 255;
  };
  return { s: f, desc: { data, w, h, mode: SM2TexMode.WRAPUV_NEAREST } };
}
function rampWrapBilinear(seed: number): { s: SM2SamplerOut; desc: Parameters<typeof describeSampler>[1] } {
  const w = 64, h = 32;
  const data = seededInput(w, h, seed);
  const f = (u: number, v: number, o4: Float64Array): void => {
    sampleImageInto(data, w, h, u, v, true, o4);   // HallowBoss ramp 逐字(mod 回绕双线性)
  };
  return { s: f, desc: { data, w, h, mode: SM2TexMode.BILINEAR_WRAP } };
}

let wasmOk = false;
beforeAll(async () => {
  __setSm2WasmFlagForTest(true);
  wasmOk = await ensureSm2Wasm();
});
afterAll(() => { __setSm2WasmFlagForTest(null); });

describe('SM2 wasm 全 pass 判谳(go/no-go)', () => {
  it('wasm 就绪(node fs 通道)', () => {
    expect(wasmOk, 'wasm 加载失败=环境面(见 loadFail)').toBe(true);
    expect(sm2WasmReady()).toBe(true);
  });

  it('63 pass × 12 场景 wasm↔JS 逐位对拍 maxd=0', async () => {
    expect(wasmOk).toBe(true);
    let worst = { pass: '', scene: '', maxd: 0 };
    let ran = 0;
    for (const name of passNames()) {
      const pass = getPass(name)!;
      for (const sc of SCENES) {
        const w = 24, h = 20;
        const u = defaultUniforms();
        sc.uni(u);
        // JS 臂(旗关=路由旁路,JS 原链)
        __setSm2WasmFlagForTest(false);
        const dJs = seededInput(w, h, 0x5eed);
        runPassOnImageData(pass, dJs, w, h, u, [], sc.rect);
        // wasm 臂(旗开=路由命中)
        __setSm2WasmFlagForTest(true);
        const dWasm = seededInput(w, h, 0x5eed);
        runPassOnImageData(pass, dWasm, w, h, u, [], sc.rect);
        const maxd = bytesEqual(dJs, dWasm);
        ran++;
        if (maxd > worst.maxd) worst = { pass: name, scene: sc.id, maxd };
        expect(maxd, `${name}/${sc.id} maxd=${maxd}(首差样本见上)`).toBe(0);
      }
    }
    console.log(`[wasm-parity] ${ran} 组合全对拍, worst maxd=${worst.maxd} (${worst.pass}/${worst.scene})`);
  });

  it('s1/s2 三规范形端到端逐位(QueenSlime 双噪声/染料 noise/ramp)', () => {
    expect(wasmOk).toBe(true);
    const w = 40, h = 36;
    const cases: Array<{ name: string; pass: string; extras: SM2SamplerOut[]; descCount: number }> = [
      { name: 'QueenSlime wrapUV-nearest×2', pass: 'QueenSlime', extras: [], descCount: 2 },
      { name: 'ArmorAcid wrapUV-bilinear', pass: 'ArmorAcid', extras: [], descCount: 1 },
      { name: 'ForceField bilinear', pass: 'ForceField', extras: [], descCount: 1 },
    ];
    for (const c of cases) {
      const pass = getPass(c.pass)!;
      // 构造描述符采样器(生产三站闭包同式)并登记
      const extras: SM2SamplerOut[] = [];
      if (c.pass === 'QueenSlime') {
        const a = queenNearest(7), b = queenNearest(23);
        describeSampler(a.s, a.desc); describeSampler(b.s, b.desc);
        extras.push(a.s, b.s);
      } else if (c.pass === 'ArmorAcid') {
        const n = noiseWrapBilinear(11);
        describeSampler(n.s, n.desc);
        extras.push(n.s);
      } else {
        const r = rampWrapBilinear(13);
        describeSampler(r.s, r.desc);
        extras.push(r.s);
      }
      const u = defaultUniforms();
      u.uTime = 1.35;
      __setSm2WasmFlagForTest(false);
      const dJs = seededInput(w, h, 0x5eed);
      runPassOnImageData(pass, dJs, w, h, u, extras);
      __setSm2WasmFlagForTest(true);
      const dWasm = seededInput(w, h, 0x5eed);
      runPassOnImageData(pass, dWasm, w, h, u, extras);
      const maxd = bytesEqual(dJs, dWasm);
      expect(maxd, `${c.name} maxd=${maxd}`).toBe(0);
      console.log(`[wasm-parity] ${c.name}: 逐位 ✓`);
    }
  });

  it('v0Rgb×多采样器组合逐位(v0 中段消费族受累面)', () => {
    expect(wasmOk).toBe(true);
    const w = 40, h = 36;
    // ArmorAcid=v0 中段消费受累名单成员(fx-sm2-v0-commute 定谳族),s1=noise
    const pass = getPass('ArmorAcid')!;
    const n = noiseWrapBilinear(31);
    describeSampler(n.s, n.desc);
    const u = defaultUniforms();
    u.uTime = 2.71;
    const v0: readonly [number, number, number] = [0.25, 0.62, 0.9];
    __setSm2WasmFlagForTest(false);
    const dJs = seededInput(w, h, 0x5eed);
    runPassOnImageData(pass, dJs, w, h, u, [n.s], undefined, v0);
    __setSm2WasmFlagForTest(true);
    const dWasm = seededInput(w, h, 0x5eed);
    runPassOnImageData(pass, dWasm, w, h, u, [n.s], undefined, v0);
    const maxd = bytesEqual(dJs, dWasm);
    expect(maxd, `v0Rgb 组合 maxd=${maxd}`).toBe(0);
    console.log('[wasm-parity] ArmorAcid v0Rgb+s1: 逐位 ✓');
  });
});
