// ★WASM 第三刀(2026-10-03):水波网格推进核 waves.as.ts + wavesWasm.ts 验收闸。
// 四层(README §5 模板 + light-wasm.test.ts 同构):
//  ① 位级锁——JS _step vs WASM wavesWasmStep 逐【位】(Uint32 域,含 ±0 记号)同值:
//     形状(含 1×1/1×N/N×1 边角)× dx/dy 域(静止/行走/大跳/出界超程)× 三类场值
//     (生产 k/256 量化域/非量化浮点/极端饱和);多步演化序列;双跑确定性。
//  ② flag/回退锁——缺省关、旗开关、强置不可用、容量/形参拒、fire-and-forget 就绪
//     前帧走 JS(③约定)、node 无 wasm 环境语义。
//  ③ 引擎端到端 A/B——waterWaves.frame() 整链(含 swap 语义/相机走动/掉帧补偿
//     2 步)旗关/开逐位一致 + 计数面分账。
//  ④ 结构锁(源文本锚)——_step WASM 分支在位且先于 swPerf 三路径、worker spawn
//     双静态分支在位——防静默解线。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { WaterWaveSystem, WATER_DAMP } from '../src/render/WaterWaves';
import { waterWaves } from '../src/render/WaterWaves';
import { wavesWasmEnabled, wavesWasmReady, ensureWavesWasm, wavesWasmStep,
  __wavesWasmStats, __setWavesWasmFlagForTest, __setWavesWasmUnavailableForTest,
  __resetWavesWasmForTest } from '../src/wasm/wavesWasm';

// ---------- 仪具:确定性 LCG(测试自身零 Math.random——可复现) ----------
let lcgState = 0x2f6e2b1;
const lcg = (): number => { lcgState = (Math.imul(lcgState, 1664525) + 1013904223) >>> 0; return lcgState / 4294967296; };
/** 生产量化域场值(k/256,k∈0..256——C8-D 量化不变式) */
const seedQuant = (n: number): Float32Array => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round(lcg() * 256) / 256;
  return a;
};
/** 非量化浮点场值(生产不产,内核 f64 面仍须逐位同) */
const seedRaw = (n: number): Float32Array => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.5 + (lcg() - 0.5) * 0.9;
  return a;
};
/** 场值位域视图(Float32 → Uint32 逐位;±0 记号差异在此现形) */
const bits = (a: Float32Array): Uint32Array => new Uint32Array(a.buffer, a.byteOffset, a.length);

/** 同形双实例:JS 臂(旗关)与 WASM 臂(旗开)各持独立系统,种子/几何逐位同 */
function makePair(w: number, h: number, seed: (n: number) => Float32Array):
  { js: WaterWaveSystem; wam: WaterWaveSystem; n: number } {
  const mk = (): WaterWaveSystem => {
    const s = new WaterWaveSystem();
    s.resetForTest();
    s.setQuality(3);
    const p = s as unknown as Record<string, unknown>;
    p._gW = w; p._gH = h;
    p._R = seed(w * h); p._G = seed(w * h);
    p._R2 = new Float32Array(w * h).fill(0.5);
    p._G2 = new Float32Array(w * h).fill(0.5);
    return s;
  };
  lcgState = 0x51ed270b;   // 双臂同种子流
  const js = mk();
  lcgState = 0x51ed270b;
  const wam = mk();
  return { js, wam, n: w * h };
}

type Sys = { _step(dx: number, dy: number): void } & WaterWaveSystem;
const stepOf = (s: WaterWaveSystem): (dx: number, dy: number) => void =>
  (s as unknown as { _step: (this: WaterWaveSystem, dx: number, dy: number) => void })
    ._step.bind(s);   // ★bind:方法提取脱绑 this=ESM detach 家族判例（80 案同坑）

/** 位级对拍:两臂各跑一步(dx,dy),断言写场(步进后 _R/_G)Uint32 域零差。
 *  evolved=false(大跳整场归中性 / 中性场不动点=正确语义)时跳过非哑防。 */
function expectBitEqual(js: WaterWaveSystem, wam: WaterWaveSystem, n: number,
  tag: string, evolved = true): void {
  const jr = bits(js.readGridR() as Float32Array), wr = bits(wam.readGridR() as Float32Array);
  const jg = bits(js.readGridG() as Float32Array), wg = bits(wam.readGridG() as Float32Array);
  let bad = 0, first = -1;
  for (let i = 0; i < n; i++) {
    if (jr[i] !== wr[i] || jg[i] !== wg[i]) { if (first < 0) first = i; bad++; }
  }
  expect(bad, `${tag}: ${bad} 格位差,首格 ${first} (JS R=${jr[first]},WAM R=${wr[first]})`).toBe(0);
  // 非哑防:场真实演化(写场含非中性值——中性直通=断言真空;大跳步豁免)
  if (evolved) {
    expect(js.readGridR().some((v) => v !== 0.5), `${tag}: 场未演化(哑夹具)`).toBe(true);
  }
}

afterAll(() => {
  __setWavesWasmFlagForTest(null);
  __setWavesWasmUnavailableForTest(null);
  __resetWavesWasmForTest();
});

// =====================================================================
// ① 位级锁:形状 × dx/dy 域 × 场值域
// =====================================================================
describe('★WASM 第三刀 位级锁', () => {
  const SHAPES: Array<[number, number]> = [[8, 5], [1, 1], [1, 7], [7, 1], [33, 17], [48, 27], [100, 60]];
  const DELTAS: Array<[number, number]> = [
    [0, 0],        // W3 快路径(静止相机全步 + 任何相机每帧第二步)
    [1, 0], [-1, 0], [0, 1], [0, -1],   // 行走帧(内域主导,边缘带薄)
    [2, -3], [-7, 4],                    // 斜向
    [300, -200], [-5000, 5000],          // 大跳/超程(全中性区语义)
    [50, 50],
  ];

  it('全网格遍历(形状 × dx/dy × k/256 量化域)', async () => {
    const ok = await ensureWavesWasm();
    expect(ok).toBe(true);
    expect(wavesWasmReady()).toBe(true);
    __setWavesWasmFlagForTest(true);
    let cases = 0;
    for (const [w, h] of SHAPES) {
      for (const [dx, dy] of DELTAS) {
        const { js, wam, n } = makePair(w, h, seedQuant);
        const hasContent = (js.readGridR() as Float32Array).some((v) => v !== 0.5);
        stepOf(js)(dx, dy);
        stepOf(wam)(dx, dy);
        expectBitEqual(js, wam, n, `k/256 ${w}x${h} d=(${dx},${dy})`,
          hasContent && Math.abs(dx) < w && Math.abs(dy) < h);
        cases++;
      }
    }
    expect(cases).toBe(SHAPES.length * DELTAS.length);
    expect(__wavesWasmStats.runs).toBeGreaterThan(0);
  });

  it('非量化浮点场值域:逐位同(f64 算术面)', async () => {
    __setWavesWasmFlagForTest(true);
    for (const [w, h] of [[40, 24], [9, 9]] as Array<[number, number]>) {
      for (const [dx, dy] of [[0, 0], [1, -1]] as Array<[number, number]>) {
        const { js, wam, n } = makePair(w, h, seedRaw);
        stepOf(js)(dx, dy);
        stepOf(wam)(dx, dy);
        expectBitEqual(js, wam, n, `raw ${w}x${h} d=(${dx},${dy})`);
      }
    }
  });

  it('极端饱和场(全 0/全 1/交替):钳制面逐位同', async () => {
    __setWavesWasmFlagForTest(true);
    const w = 16, h = 12;
    const ext: Float32Array[] = [
      new Float32Array(w * h).fill(0),
      new Float32Array(w * h).fill(1),
      (() => { const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = i % 2; return a; })(),
      new Float32Array(w * h).fill(0.5),
    ];
    for (const seed of ext) {
      const mkSeed = (): Float32Array => seed.slice();
      const { js, wam, n } = makePair(w, h, mkSeed);
      const hasContent = (seed as Float32Array).some((v) => v !== 0.5);
      stepOf(js)(1, 0);
      stepOf(wam)(1, 0);
      expectBitEqual(js, wam, n, `ext ${seed[0]}/${seed[1]}`, hasContent);
    }
  });

  it('多步演化序列(静止→走动→大跳→静止):逐步逐位同', async () => {
    __setWavesWasmFlagForTest(true);
    const w = 64, h = 40;
    const { js, wam, n } = makePair(w, h, seedQuant);
    const seq: Array<[number, number]> = [
      [0, 0], [0, 0], [1, 0], [1, 0], [0, 0], [-1, 1], [200, -100], [0, 0], [1, 1], [-3, 0], [0, 0],
    ];
    for (let k = 0; k < seq.length; k++) {
      const hasContent = (js.readGridR() as Float32Array).some((v) => v !== 0.5)
        || (js.readGridG() as Float32Array).some((v) => v !== 0.5);
      stepOf(js)(seq[k][0], seq[k][1]);
      stepOf(wam)(seq[k][0], seq[k][1]);
      expectBitEqual(js, wam, n, `seq[${k}] d=(${seq[k][0]},${seq[k][1]})`,
        hasContent && Math.abs(seq[k][0]) < w && Math.abs(seq[k][1]) < h);
    }
  });

  it('WASM 产物确定性:同输入重跑逐位复现', async () => {
    __setWavesWasmFlagForTest(true);
    const w = 48, h = 32, n = w * h;
    const { wam } = makePair(w, h, seedQuant);
    const p = wam as unknown as Record<string, unknown>;
    stepOf(wam)(2, -1);
    const inR = (wam.readGridR() as Float32Array).slice();
    const inG = (wam.readGridG() as Float32Array).slice();
    const step0 = (): Float32Array[] => {
      p._R = inR.slice(); p._G = inG.slice();
      p._R2 = new Float32Array(n).fill(0.5);
      p._G2 = new Float32Array(n).fill(0.5);
      stepOf(wam)(0, 0);
      return [(wam.readGridR() as Float32Array).slice(), (wam.readGridG() as Float32Array).slice()];
    };
    const a1 = step0();
    const a2 = step0();
    for (let i = 0; i < n; i++) {
      expect(bits(a1[0])[i]).toBe(bits(a2[0])[i]);
      expect(bits(a1[1])[i]).toBe(bits(a2[1])[i]);
    }
  });
});

// =====================================================================
// ② flag/回退锁
// =====================================================================
describe('★WASM 第三刀 flag/回退锁', () => {
  it('缺省关(node 无旗):enabled()=false', () => {
    __setWavesWasmFlagForTest(null);
    expect(wavesWasmEnabled()).toBe(false);
  });

  it('旗钩开关语义', () => {
    __setWavesWasmFlagForTest(true);
    expect(wavesWasmEnabled()).toBe(true);
    __setWavesWasmFlagForTest(false);
    expect(wavesWasmEnabled()).toBe(false);
    __setWavesWasmFlagForTest(null);
  });

  it('强置不可用 → wavesWasmStep 恒 false 且 runs 不增;JS 步进不受扰', async () => {
    await ensureWavesWasm();
    const runs0 = __wavesWasmStats.runs;
    __setWavesWasmUnavailableForTest(true);
    expect(wavesWasmReady()).toBe(false);
    const a = new Float32Array(64).fill(0.5);
    const b = new Float32Array(64).fill(0.5);
    expect(wavesWasmStep(a, b, a, b, 8, 8, 0, 0, WATER_DAMP)).toBe(false);
    expect(__wavesWasmStats.runs).toBe(runs0);
    __setWavesWasmUnavailableForTest(null);
  });

  it('形参/容量拒:短数组、非整 dx、NaN damp、超容量几何', async () => {
    await ensureWavesWasm();
    const runs0 = __wavesWasmStats.runs;
    const ref0 = __wavesWasmStats.refusals;
    const a = new Float32Array(16).fill(0.5);
    expect(wavesWasmStep(a, a, a, a, 8, 8, 0, 0, WATER_DAMP)).toBe(false);       // 长度 < n
    expect(wavesWasmStep(new Float32Array(64), new Float32Array(64),
      new Float32Array(64), new Float32Array(64), 8, 8, 0.5, 0, WATER_DAMP)).toBe(false);   // 非整 dx
    expect(wavesWasmStep(new Float32Array(64), new Float32Array(64),
      new Float32Array(64), new Float32Array(64), 8, 8, 0, 0, NaN)).toBe(false);  // NaN damp
    expect(wavesWasmStep(new Float32Array(4), new Float32Array(4),
      new Float32Array(4), new Float32Array(4), 4096, 4096, 0, 0, WATER_DAMP)).toBe(false); // n>cap(短数组先拒? 容量先)
    expect(wavesWasmStep(new Float32Array(4), new Float32Array(4),
      new Float32Array(4), new Float32Array(4), 0, 8, 0, 0, WATER_DAMP)).toBe(false);       // 几何非法
    expect(__wavesWasmStats.runs).toBe(runs0);
    expect(__wavesWasmStats.refusals).toBeGreaterThan(ref0);
  });

  it('flag 关时零触达:runs 不增', async () => {
    __setWavesWasmFlagForTest(false);
    const runs0 = __wavesWasmStats.runs;
    const { js, wam } = makePair(8, 8, seedQuant);
    stepOf(js)(0, 0);
    stepOf(wam)(0, 0);
    expect(__wavesWasmStats.runs).toBe(runs0);
    // 两臂仍逐位同(WASM 支未走,双臂都是 JS)
    for (let i = 0; i < 64; i++) {
      expect(bits(wam.readGridR() as Float32Array)[i]).toBe(bits(js.readGridR() as Float32Array)[i]);
    }
  });
});

// =====================================================================
// ③ 引擎端到端 A/B(frame() 整链,含 swap/相机走动/掉帧补偿)
// =====================================================================
describe('★WASM 第三刀 引擎端到端 A/B', () => {
  const BASE = { zoom: 1, viewW: 800, viewH: 520, tileX: 60, tileY: 40,
    maxTilesX: 8400, maxTilesY: 2400, worldSurface: 300, rockLayer: 900, windAbs: 0.4, rain: 0 };

  function runSeq(): { R: Float32Array; G: Float32Array; prog: number; inten: number } {
    const sys = new WaterWaveSystem();
    sys.resetForTest();
    sys.setQuality(3);
    sys.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
    const seed = sys.readGridR();
    lcgState = 0x77777;
    for (let i = 0; i < seed.length; i++) seed[i] = Math.round(lcg() * 256) / 256;
    const g = sys.readGridG();
    for (let i = 0; i < g.length; i++) g[i] = Math.round(lcg() * 256) / 256;
    sys.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });   // 静止步(W3/快)
    sys.frame({ ...BASE, camX: 1042, camY: 500, dt: 1 / 20 });   // 走动步(dx≠0)
    sys.frame({ ...BASE, camX: 1042, camY: 500, dt: 1 / 3 });    // 掉帧补偿(2 步)
    sys.frame({ ...BASE, camX: 300, camY: 900, dt: 1 / 20 });    // 大跳(泛形全中性区)
    sys.frame({ ...BASE, camX: 300, camY: 900, dt: 1 / 20 });    // 静止步
    return { R: (sys.readGridR() as Float32Array).slice(), G: (sys.readGridG() as Float32Array).slice(),
      prog: sys.progress, inten: sys.intensity };
  }

  it('frame() 五帧序列:旗关/开终态逐位一致 + runs 分账', async () => {
    await ensureWavesWasm();
    __setWavesWasmFlagForTest(false);
    const off = runSeq();
    const runs0 = __wavesWasmStats.runs;
    __setWavesWasmFlagForTest(true);
    const on = runSeq();
    expect(__wavesWasmStats.runs).toBeGreaterThan(runs0);   // WASM 支真实被消费
    expect(on.R.length).toBe(off.R.length);
    expect(bits(on.R).length).toBe(bits(off.R).length);
    let bad = 0;
    for (let i = 0; i < off.R.length; i++) {
      if (bits(off.R)[i] !== bits(on.R)[i] || bits(off.G)[i] !== bits(on.G)[i]) bad++;
    }
    expect(bad).toBe(0);
    expect(on.prog).toBe(off.prog);
    expect(on.inten).toBe(off.inten);
    expect(off.R.some((v) => v !== 0.5)).toBe(true);   // 场真实演化(防哑)
    __setWavesWasmFlagForTest(false);
  });
});

// =====================================================================
// ④ 结构锁(源文本锚——防静默解线)
// =====================================================================
describe('★WASM 第三刀 结构锁(源文本锚)', () => {
  const waveSrc = readFileSync(new URL('../src/render/WaterWaves.ts', import.meta.url), 'utf8');
  const loaderSrc = readFileSync(new URL('../src/wasm/wavesWasm.ts', import.meta.url), 'utf8');

  it('_step WASM 分支在位且先于 swPerf 三路径', () => {
    expect(waveSrc).toContain('if (wavesWasmEnabled()) {');
    const iWasm = waveSrc.indexOf('if (wavesWasmEnabled()) {');
    const iSwPerf = waveSrc.indexOf('if (swPerf && dx === 0 && dy === 0) {');
    expect(iWasm).toBeGreaterThan(0);
    expect(iSwPerf).toBeGreaterThan(iWasm);   // WASM 支在前(fail-closed 落回序)
    expect(waveSrc).toContain('wavesWasmStep(R, G, R2, G2, w, h, dx, dy, WATER_DAMP)');
    // 拷回后的 swap 与 JS 路径同语义
    expect(waveSrc).toContain('this._R = R2; this._G = G2; this._R2 = R; this._G2 = G;');
  });

  it('worker spawn 双静态分支在位(name 旗通道)', () => {
    expect(waveSrc).toContain("{ type: 'module', name: 'sw-wavewasm=1' }");
    expect(waveSrc).toContain("{ type: 'module', name: 'WaveWorker' }");
    expect(waveSrc).toContain('if (wavesWasmEnabled()) {');
  });

  it('loader 四约定面在位', () => {
    expect(loaderSrc).toContain("get('wavewasm') === '1'");
    expect(loaderSrc).toContain("n.includes('wavewasm=1')");
    expect(loaderSrc).toContain('export const __wavesWasmStats');
    expect(loaderSrc).toContain('export function __setWavesWasmFlagForTest');
    expect(loaderSrc).toContain('export function ensureWavesWasm');
  });
});
