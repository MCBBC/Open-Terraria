// SM2 WASM 试点守卫(2026-10-03;管线第一刀)。四锁:
// ①位级锁——WASM VM vs JS 引擎(codegen 主路径)/ JS VM(oracle 回退支)逐像素
//   maxd≤2/255(k2/c13c 场值闸同款验收线;真实 Perlin+合成贴图 × uTime×uColor 网格),
//   + WASM 产物纯函数位级可复现锁(同输入两次逐字节相等);
// ②flag 锁——缺省关:旗不开即使 wasm 就绪也走 JS(sm2Runs++,wasmRuns=0);
// ③回退锁——wasm 不可用(强置)/ 无 WebAssembly 环境 / 形态拒(s1 采样器 pass)
//   → JS 原路径逐位保留,零异常零半态;
// ④计数面——__forceFieldBubbleStats.wasmRuns(试点新增)与 sm2Runs 分账。
// 浏览器侧场值闸/活机探针=scripts/_sm2wasm-fieldgate.mjs / _sm2wasm-pillar.mjs(node 无 WebGL 分工,c13c 判例)。
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore pngjs 无类型声明(同 tests/atlas-append-golden.test.ts 用法)
import { PNG } from 'pngjs';
import {
  drawForceFieldBubble, __resetForceFieldBubbleForTest, __forceFieldBubbleStats,
} from '../src/fx/ForceFieldBubble';
import { defaultUniforms, getPass, runPassOnImageData, setSm2CodegenEnabled } from '../src/fx/SM2Effect';
import {
  ensureSm2Wasm, sm2WasmEnabled, sm2WasmReady, wasmRunPassOnImageData,
  __setSm2WasmFlagForTest, __setSm2WasmUnavailableForTest, __resetSm2WasmForTest, __sm2WasmStats,
} from '../src/wasm/sm2Wasm';
import type { Renderer } from '../src/render/Renderer';

// ---- 最小 fake DOM/ctx(forcefield-gl.test.ts 同款) ----
interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
class FakeCtx2d {
  createImageData(w: number, h: number): FakeBuf {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(_im: FakeBuf): void {}
  getImageData(_x: number, _y: number, w: number, h: number): FakeBuf {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;
    return { data, width: w, height: h };
  }
  drawImage(): void {}
  fillRect(): void {}
  save(): void {}
  restore(): void {}
  setTransform(): void {}
  translate(): void {}
  rotate(): void {}
  beginPath(): void {}
  arc(): void {}
  ellipse(): void {}
  stroke(): void {}
  globalAlpha = 1;
  globalCompositeOperation: string = 'source-over';
  imageSmoothingEnabled = false;
}
function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): unknown {
      return { width: 0, height: 0, getContext: (_k: string) => new FakeCtx2d() };
    },
  };
}
installFakeDom();
type Opts = Parameters<typeof drawForceFieldBubble>[2];
function fakeCtx(): CanvasRenderingContext2D {
  const c = new FakeCtx2d() as unknown as Record<string, unknown>;
  c.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) as unknown as DOMMatrix;
  return c as unknown as CanvasRenderingContext2D;
}
function opts(o: Partial<Opts> = {}): Opts {
  return { cx: 100, cy: 100, radius: 300, tint: [255, 120, 60], frac: 1, breakT: -1, reformT: -1, time: 0.5, ...o };
}
function fakeRenderer2D(): Renderer {
  return { atlas: { ensureVImage: () => ({ width: 128, height: 128 }) } } as unknown as Renderer;
}

// ---- 贴图源:真实 Perlin(pngjs 解码)+ 合成确定性纹理 ----
const SIZE = 128;
function realPerlin(): Uint8ClampedArray {
  const png = PNG.sync.read(readFileSync(new URL('../public/sprites/vanilla/Misc_Perlin.png', import.meta.url)));
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // 最近邻下采样(双线性产物差由场值闸域吸收;此锁贴图侧确定性优先)
      const sx = Math.min(png.width - 1, Math.floor(x * png.width / SIZE));
      const sy = Math.min(png.height - 1, Math.floor(y * png.height / SIZE));
      const si = (sy * png.width + sx) * 4, di = (y * SIZE + x) * 4;
      out[di] = png.data[si]; out[di + 1] = png.data[si + 1];
      out[di + 2] = png.data[si + 2]; out[di + 3] = png.data[si + 3];
    }
  }
  return out;
}
function syntheticTex(): Uint8ClampedArray {
  // LCG 确定性纹理(覆盖全 0..255 域,梯度/边界角点 exercising)
  let s = 0x2F6E2B1 >>> 0;
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i * 4] = s & 0xFF; out[i * 4 + 1] = (s >>> 8) & 0xFF;
    out[i * 4 + 2] = (s >>> 16) & 0xFF; out[i * 4 + 3] = 255;
  }
  return out;
}

const TIMES = [0, 0.2, 3.4, 13.7, 3600.2];
const COLORS: Array<[number, number, number]> = [[1, 1, 1], [2, 2, 2], [1.37, 1.37, 1.37]];

function runJs(data: Uint8ClampedArray, uTime: number, uColor: [number, number, number]): void {
  const pass = getPass('ForceField');
  const u = defaultUniforms();
  u.uTime = uTime; u.uColor = uColor;
  u.uSourceRect = [0, 0, SIZE, SIZE]; u.uImageSize0 = [SIZE, SIZE];
  runPassOnImageData(pass!, data, SIZE, SIZE, u);
}
function runWasm(data: Uint8ClampedArray, uTime: number, uColor: [number, number, number]): boolean {
  const pass = getPass('ForceField');
  const u = defaultUniforms();
  u.uTime = uTime; u.uColor = uColor;
  u.uSourceRect = [0, 0, SIZE, SIZE]; u.uImageSize0 = [SIZE, SIZE];
  return wasmRunPassOnImageData(pass!, data, SIZE, SIZE, u);
}
function maxd(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; }
  return m;
}

beforeAll(async () => {
  const ok = await ensureSm2Wasm();
  expect(ok, 'node 环境 WASM 加载必须成功(管线在位)').toBe(true);
  expect(sm2WasmReady()).toBe(true);
});

afterEach(() => {
  __resetForceFieldBubbleForTest();
  __setSm2WasmFlagForTest(null);
  __setSm2WasmUnavailableForTest(null);
});

afterAll(() => {
  setSm2CodegenEnabled(true);
});

describe('①位级锁:WASM VM vs JS 引擎/JS VM(场值闸 maxd≤2/255)', () => {
  for (const [texName, tex] of [['真实Perlin', realPerlin()], ['合成LCG', syntheticTex()]] as const) {
    for (const uColor of COLORS) {
      for (const uTime of TIMES) {
        it(`${texName} uTime=${uTime} uColor=[${uColor}]`, () => {
          const jsA = new Uint8ClampedArray(tex); runJs(jsA, uTime, uColor);       // JS 引擎(codegen 主路径)
          setSm2CodegenEnabled(false);
          const jsVm = new Uint8ClampedArray(tex); runJs(jsVm, uTime, uColor);     // JS VM(oracle 回退支)
          setSm2CodegenEnabled(true);
          const w1 = new Uint8ClampedArray(tex);
          expect(runWasm(w1, uTime, uColor)).toBe(true);
          const dA = maxd(w1, jsA), dVm = maxd(w1, jsVm);
          expect(dA).toBeLessThanOrEqual(2);   // k2/c13c 场值闸验收线
          expect(dVm).toBeLessThanOrEqual(2);
          const w2 = new Uint8ClampedArray(tex);
          expect(runWasm(w2, uTime, uColor)).toBe(true);
          expect(maxd(w1, w2)).toBe(0);        // WASM 产物纯函数位级可复现
        });
      }
    }
  }
});

describe('②flag 锁(★转正缺省开,2026-10-04;?sm2wasm=0 逃生门走 JS)', () => {
  it('缺省(node 无 location):wasm 就绪即走 WASM(wasmRuns=1,sm2Runs 分账照计)', () => {
    expect(sm2WasmReady()).toBe(true);
    expect(sm2WasmEnabled()).toBe(true);
    const ok = drawForceFieldBubble(fakeCtx(), fakeRenderer2D(), opts());
    expect(ok).toBe(true);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);
    expect(__forceFieldBubbleStats.wasmRuns).toBe(1);
  });
  it('?sm2wasm=1(测试钩):产物走 WASM(wasmRuns=1,sm2Runs 分账照计)', () => {
    __setSm2WasmFlagForTest(true);
    const runsBefore = __sm2WasmStats.runs;
    const ok = drawForceFieldBubble(fakeCtx(), fakeRenderer2D(), opts());
    expect(ok).toBe(true);
    expect(__forceFieldBubbleStats.wasmRuns).toBe(1);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);
    expect(__sm2WasmStats.runs).toBe(runsBefore + 1);
  });
});

describe('③回退锁(JS 原路径逐位保留)', () => {
  it('wasm 强置不可用:静默回 JS,零异常', () => {
    __setSm2WasmFlagForTest(true);
    __setSm2WasmUnavailableForTest(true);
    expect(runWasm(new Uint8ClampedArray(SIZE * SIZE * 4), 3.4, [1, 1, 1])).toBe(false);
    const ok = drawForceFieldBubble(fakeCtx(), fakeRenderer2D(), opts());
    expect(ok).toBe(true);
    expect(__forceFieldBubbleStats.sm2Runs).toBe(1);
    expect(__forceFieldBubbleStats.wasmRuns).toBe(0);
  });
  it('s1/s2 采样器 pass 形态拒(ArmorTwilight)→ false,JS 侧照常', () => {
    const pass = getPass('ArmorTwilight');
    expect(pass).not.toBeNull();
    expect(pass!.singleSamplerS0Only).toBe(false);
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    const u = defaultUniforms();
    u.uSourceRect = [0, 0, SIZE, SIZE]; u.uImageSize0 = [SIZE, SIZE];
    expect(wasmRunPassOnImageData(pass!, data, SIZE, SIZE, u)).toBe(false);
    expect(__sm2WasmStats.refusals).toBeGreaterThanOrEqual(1);
  });
  it('node 无 WebAssembly 环境:加载 fail-closed,JS 产物逐位正常', () => {
    const g = globalThis as Record<string, unknown>;
    const saved = g.WebAssembly as unknown;
    try {
      expect(Reflect.deleteProperty(g, 'WebAssembly')).toBe(true);
      __resetSm2WasmForTest();
      __setSm2WasmFlagForTest(true);
      return ensureSm2Wasm().then((ok) => {
        expect(ok).toBe(false);
        expect(sm2WasmReady()).toBe(false);
        // JS 产物不受影响(与 wasm 就绪路径的 JS 结果逐位一致)
        const ref = new Uint8ClampedArray(syntheticTex()); runJs(ref, 3.4, [1, 1, 1]);
        const data = new Uint8ClampedArray(syntheticTex()); runJs(data, 3.4, [1, 1, 1]);
        expect(maxd(ref, data)).toBe(0);
      }).finally(() => {
        g.WebAssembly = saved;
        __resetSm2WasmForTest();
      });
    } finally {
      // 同步兜底(异步支已在 finally 恢复)
      if (!('WebAssembly' in g)) g.WebAssembly = saved;
    }
  });
});
