// ★BJ78 WaterWaves 区 W1-W4 零语义分配消除守卫（2026-09-14 波纹区补刀）
//
// 前置：BJ77 建 ?swperf 总闸（perfFlags.ts；★2026-09-14 用户实机确认转正缺省开，
// `?swperf=0` = 准出豁免口回退旧行为逐位）。本文件各断言为关/开相对臂比较，
// 转正后语义不变：flag 关 = 旧行为恢复、flag 开 = 优化路径。
// 本文件四层：
//  ① W1/W2 分配面：URLSearchParams 构造计数——sampleDisplace（W1，每帧×表层水格
//     数百次）flag 关每调用一次构造（现行行为）、flag 开走缓存读取面零构造；
//     waveAmpParam 值语义逐案锁定（同一表达式含缺失/0/非数 → 1 fallback）。
//     GLWaterDistortion.uploadWave（W2）与 W1 共用 waveAmpParam——node 无 WebGL
//     不可实例化，分配证据由 waveAmpParam 单测 + 源文本锁 + 实机 URLSearchParams
//     普查（scripts/_bj78-wave-census.mjs）三面覆盖。
//  ② W3 行为面：波场演化序列（fast dx=0 与 general dx≠0 交替）flag 关/开 R/G
//     Float32 逐位一致；Math.min/max 调用计数证快路径真实消除逐像素钳制（非 vacuous）。
//  ③ W4 行为面：updateWaterWaves 原型直调（node 桩）——flag 关/开波场态+帧态值
//     逐位一致；Set 构造计数证每帧 2 常量表真实被消除；_waveCss 引用同一性证
//     帧态对象真实被复用。
//  ④ 结构锁（源文本锚）：四处 `if (swPerf) 快 else 原样` 双支、原路径/IIFE 逐字
//     保留、核公式逐字同序——防静默回退。
// 逐像素权威证据由实机 scripts/_bj78-pixel-ab.mjs（冻结单帧 md5 对拍）兜底。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { waterWaves, setWaveTextures, waveProcessorStep } from '../src/render/WaterWaves';
import { swPerf, swPerfSetForTest, waveAmpParam, waveAmpResetForTest } from '../src/render/perfFlags';
import { Renderer, BJ78_NO_WATER_DISTORT, BJ78_NO_LIQUID_DISTORT } from '../src/render/Renderer';
import { Enemy } from '../src/entities/Enemy';
import { options } from '../src/core/Options';

// ---------- 仪具：构造计数（分配面直接物证；同步窗内换全局构造器） ----------
function countConstruct(name: 'Set' | 'URLSearchParams', body: () => void): number {
  const g = globalThis as unknown as Record<string, unknown>;
  const Base = g[name] as unknown as new (...a: unknown[]) => object;
  const oMinBind = Base;
  let n = 0;
  const Counter = class extends oMinBind { constructor(...a: unknown[]) { super(...a); n++; } };
  g[name] = Counter;
  try { body(); } finally { g[name] = Base; }
  return n;
}

/** Math.min/max 调用计数（同步窗；包装值恒等→不扰动数值面） */
function countMinMax(body: () => void): number {
  const M = Math as unknown as { min: (...a: number[]) => number; max: (...a: number[]) => number };
  const oMin = M.min, oMax = M.max;
  let n = 0;
  M.min = (...a: number[]) => { n++; return oMin(...a); };
  M.max = (...a: number[]) => { n++; return oMax(...a); };
  try { body(); } finally { M.min = oMin; M.max = oMax; }
  return n;
}

const after: Array<() => void> = [];
afterAll(() => {
  swPerfSetForTest(true);           // 归还缺省（★转正后缺省开）
  setWaveTextures(null, null);      // 归还波纹单例纹理态
  for (const f of after) f();
});

// =====================================================================
// ① W1/W2：wamp 读取面分配消除 + 值语义
// =====================================================================
describe('★BJ78 W1/W2 wamp 读取面', () => {
  const g = globalThis as unknown as { location?: { search: string } };

  it('waveAmpParam 值语义=原逐调用解析逐位同值（含缺失/0/非数→1 fallback）', () => {
    const origSearch = g.location?.search;
    after.push(() => { if (origSearch !== undefined) g.location = { search: origSearch }; });
    const cases: Array<[string, number]> = [
      ['?wamp=2', 2], ['?wamp=1.5', 1.5], ['?wamp=0', 1], ['?wamp=abc', 1], ['', 1], ['?other=9', 1],
    ];
    for (const [search, want] of cases) {
      waveAmpResetForTest();
      g.location = { search };
      expect(waveAmpParam()).toBe(want);
    }
  });

  it('waveAmpParam 缓存：同 search 只构造一次 URLSearchParams；search 变化自动失效', () => {
    g.location = { search: '?wamp=2' };
    waveAmpResetForTest();
    const first = countConstruct('URLSearchParams', () => waveAmpParam());
    const warm = countConstruct('URLSearchParams', () => { waveAmpParam(); waveAmpParam(); });
    expect(first).toBe(1);
    expect(warm).toBe(0);
    g.location = { search: '?wamp=3' };
    let v = 0;
    const rekey = countConstruct('URLSearchParams', () => { v = waveAmpParam(); });
    expect(v).toBe(3);
    expect(rekey).toBe(1);
  });

  it('W1 sampleDisplace：flag 关=每调用 1 次构造（现行行为）；flag 开=缓存后零构造', () => {
    const origSearch = g.location?.search;
    after.push(() => {
      if (origSearch !== undefined) g.location = { search: origSearch }; else delete g.location;
      setWaveTextures(null, null);
    });
    g.location = { search: '?wamp=2' };
    // 纹理夹具（sampleDisplace 的 !_noiseData 早退门；4×4 确定性噪）
    const noise = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 37) % 256;
    setWaveTextures({ w: 4, h: 4, data: noise }, { data: new Uint8ClampedArray(64).fill(255) });
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    waterWaves.frame({ camX: 0, camY: 0, zoom: 1, viewW: 64, viewH: 64, tileX: 2, tileY: 2,
      maxTilesX: 120, maxTilesY: 80, worldSurface: 30, rockLayer: 60, windAbs: 0, rain: 0, dt: 1 / 60 });
    waterWaves.progress = 123.45;
    const out: [number, number] = [0, 0];
    const sample = () => { for (let i = 0; i < 40; i++) waterWaves.sampleDisplace(i * 3.1, i * 5.7, out); };

    swPerfSetForTest(false);
    const cOff = countConstruct('URLSearchParams', sample);
    expect(cOff).toBeGreaterThanOrEqual(40);          // 现行行为：每调用一次构造

    swPerfSetForTest(true);
    waveAmpResetForTest();
    const cOnWarm = countConstruct('URLSearchParams', () => waterWaves.sampleDisplace(3.1, 5.7, out));
    expect(cOnWarm).toBeLessThanOrEqual(1);           // 缓存冷启动至多 1 次
    const cOn = countConstruct('URLSearchParams', sample);
    expect(cOn).toBe(0);                              // 热路径零构造
    swPerfSetForTest(false);
  });

  it('W1 值逐位：flag 关/开同波场态 sampleDisplace 输出完全一致（?wamp=2 生效面）', () => {
    g.location = { search: '?wamp=2' };
    const noise = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 37) % 256;
    setWaveTextures({ w: 4, h: 4, data: noise }, { data: new Uint8ClampedArray(64).fill(255) });
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    waterWaves.frame({ camX: 0, camY: 0, zoom: 1, viewW: 64, viewH: 64, tileX: 2, tileY: 2,
      maxTilesX: 120, maxTilesY: 80, worldSurface: 30, rockLayer: 60, windAbs: 0.3, rain: 0, dt: 1 / 60 });
    // 播撒非中性波场（h−0.5 ≠ 0 → amp 项进入位移；中性场下 amp 被 0 消数=断言真空）
    const seedR = waterWaves.readGridR();
    for (let i = 0; i < seedR.length; i++) seedR[i] = 0.5 + Math.sin(i * 1.7) * 0.29;
    waterWaves.progress = 77.5;
    const run = (): [number, number][] => {
      const rows: [number, number][] = [];
      const o: [number, number] = [0, 0];
      for (let i = 0; i < 40; i++) {
        waterWaves.sampleDisplace(i * 3.1, i * 5.7, o);
        rows.push([o[0], o[1]]);
      }
      return rows;
    };
    waveAmpResetForTest();
    swPerfSetForTest(false);
    const off = run();
    swPerfSetForTest(true);
    const on = run();
    expect(on).toEqual(off);
    expect(off.some(([dx]) => dx !== 0)).toBe(true);  // 防哑夹具（位移恒 0 = 断言真空）
    // 非空证臂：amp=1 臂（search 无 wamp）输出必须与 amp=2 臂不同——
    // 证明本断言对 amp 值真敏感（否则 flag-on 值腐蚀不可检）
    g.location = { search: '' };
    waveAmpResetForTest();
    const amp1 = run();
    expect(amp1).not.toEqual(on);
    g.location = { search: '?wamp=2' };
    swPerfSetForTest(false);
  });
});

// =====================================================================
// ② W3：_step 快路径（dx=dy=0）行为面
// =====================================================================
describe('★BJ78 W3 _step 快路径', () => {
  const BASE = { zoom: 1, viewW: 800, viewH: 520, tileX: 60, tileY: 40,
    maxTilesX: 120, maxTilesY: 80, worldSurface: 30, rockLayer: 60, windAbs: 0.4, rain: 0 };

  /** 演化序列：general(dx=250) → fast(×2 步) → general(dx=10) → fast —— 双支全覆盖 */
  function runSeq(): { R: Float32Array; G: Float32Array } {
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
    const seed = waterWaves.readGridR();
    for (let i = 0; i < seed.length; i++) seed[i] = 0.5 + Math.sin(i * 0.37) * 0.21;
    waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
    waterWaves.frame({ ...BASE, camX: 1042, camY: 500, dt: 1 / 20 });
    waterWaves.frame({ ...BASE, camX: 1042, camY: 500, dt: 1 / 20 });
    return { R: waterWaves.readGridR().slice(0), G: waterWaves.readGridG().slice(0) };
  }

  it('flag 关/开：波场 R/G 演化序列逐位一致（快路径核公式逐字同序）', () => {
    swPerfSetForTest(false);
    const off = runSeq();
    swPerfSetForTest(true);
    const on = runSeq();
    expect(on.R.length).toBe(off.R.length);
    expect(on.R.length).toBeGreaterThan(20000);       // 夹具非哑（200×130 网格）
    let diff = 0;
    for (let i = 0; i < off.R.length; i++) {
      if (off.R[i] !== on.R[i] || off.G[i] !== on.G[i]) diff++;
    }
    expect(diff).toBe(0);
    expect(off.R.some((v) => v !== 0.5)).toBe(true);  // 场真实演化（非中性直通=断言真空防）
    swPerfSetForTest(false);
  });

  it('flag 开时逐像素 Math.min/max 真实被消除（dx=0 步计数≈0，非 vacuous）', () => {
    // 计数窗只罩 dx=0 帧（首帧建立滚动态在窗外——dx≠0 的第一步本就合法走原路径）
    const setup = () => {
      waterWaves.resetForTest();
      waterWaves.setQuality(3);
      waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
      const seed = waterWaves.readGridR();
      for (let i = 0; i < seed.length; i++) seed[i] = 0.5 + Math.sin(i * 0.37) * 0.21;
    };
    const fastOnlySeq = () => {
      waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
      waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
      waterWaves.frame({ ...BASE, camX: 1000, camY: 500, dt: 1 / 20 });
    };
    setup();
    swPerfSetForTest(false);
    const off = countMinMax(fastOnlySeq);
    setup();
    swPerfSetForTest(true);
    const on = countMinMax(fastOnlySeq);
    expect(off).toBeGreaterThan(500000);   // 原路径：每像素 6 次 × 26000 texel × 2 步 × 3 帧
    expect(on).toBeLessThan(200);          // 快路径：仅 intensity/_ensure 的每帧少数几次
    swPerfSetForTest(false);
  });

  it('纯函数金标仍在位（内核公式未漂移）', () => {
    // 中性场不动点 + 邻域脉冲（公式金标，快/原路径同源）
    const [r, gg] = waveProcessorStep(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    expect(r).toBe(0.5);
    expect(gg).toBe(0.5);
    const [r2] = waveProcessorStep(0.9, 0.5, 0.5, 0.5, 0.5, 0.5);
    expect(r2).toBeGreaterThan(0.5);
  });
});

// =====================================================================
// ③ W4：updateWaterWaves 常量 Set/闭包/帧态对象消除（node 桩行为面）
// =====================================================================
describe('★BJ78 W4 updateWaterWaves', () => {
  const upd = (Renderer.prototype as unknown as { updateWaterWaves: (...a: unknown[]) => void }).updateWaterWaves;

  function makeWorld(): { store: TileStore; w: number; h: number; groundLevel: number; rockLevel: number } {
    const st = new TileStore(120, 80);
    for (let x = 20; x <= 60; x++) {
      for (let y = 40; y <= 50; y++) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = 1;
      }
    }
    return { store: st, w: 120, h: 80, groundLevel: 40, rockLevel: 62 };
  }

  function makeEntities(): unknown[] {
    const npc = Object.create(Enemy.prototype) as Record<string, unknown>;
    Object.assign(npc, { dead: false, x: 350, y: 620, w: 24, h: 30, vx: 2.5, vy: 0,
      wet: true, wetCount: 0, honeyWet: false, lavaWet: false });
    // 弹幕族：projId=7（CanDistortWater 例外表内→滤除）/ 999（表外且中心在水→注入）/
    // 512（NoLiquidDistortion 表内→滤除）
    const p1 = { projId: 7, dead: false, x: 360, y: 660, w: 10, h: 10, vx: 5, vy: 0 };
    const p2 = { projId: 999, dead: false, x: 380, y: 680, w: 10, h: 10, vx: 6, vy: 0 };
    const p3 = { projId: 512, dead: false, x: 400, y: 680, w: 10, h: 10, vx: 6, vy: 0 };
    return [npc, p1, p2, p3];
  }

  function runUpdateSeq(flag: boolean): { snap: Record<string, unknown>; cssRefs: unknown[] } {
    const oldQ = options.data.waveQuality;
    options.data.waveQuality = 3;
    after.push(() => { options.data.waveQuality = oldQ; });
    swPerfSetForTest(flag);
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    const world = makeWorld();
    const player = { dead: false, x: 330, y: 600, w: 20, h: 42, vx: 2, vy: 0,
      inWater: false, wetCount: 0, inHoney: false, inLava: false };
    const entities = makeEntities();
    const stub = { atlas: undefined, _waveQ: -1, _cssW: 0, _waveCss: null,
      _waveLiquidInView: true, _waveLastMs: 0 } as unknown as Renderer;
    const cssRefs: unknown[] = [];
    for (let k = 0; k < 5; k++) {
      upd.call(stub, { x: 640, y: 640 }, world, player, entities, [], 800, 520, 1);
      cssRefs.push((stub as unknown as { _waveCss: unknown })._waveCss);
    }
    const ww = waterWaves as unknown as Record<string, unknown>;
    const snap = {
      R: (waterWaves.readGridR() as Float32Array).slice(0),
      G: (waterWaves.readGridG() as Float32Array).slice(0),
      progress: waterWaves.progress, intensity: waterWaves.intensity,
      stepsLast: ww._stepsLast, inView: (stub as unknown as { _waveLiquidInView: boolean })._waveLiquidInView,
      waveCss: JSON.parse(JSON.stringify((stub as unknown as { _waveCss: unknown })._waveCss)),
    };
    return { snap, cssRefs };
  }

  it('flag 关/开：updateWaterWaves 驱动 5 帧后波场态/帧态值逐位一致', () => {
    const nowOrig = performance.now.bind(performance);
    performance.now = () => 555000;   // 冻结：dt 序列两臂恒等
    try {
      const off = runUpdateSeq(false);
      const on = runUpdateSeq(true);
      const a = off.snap, b = on.snap;
      expect((a.R as Float32Array).length).toBeGreaterThan(20000);
      let diff = 0;
      for (let i = 0; i < (a.R as Float32Array).length; i++) {
        if ((a.R as Float32Array)[i] !== (b.R as Float32Array)[i]
          || (a.G as Float32Array)[i] !== (b.G as Float32Array)[i]) diff++;
      }
      expect(diff).toBe(0);
      expect(b.progress).toBe(a.progress);
      expect(b.intensity).toBe(a.intensity);
      expect(b.stepsLast).toBe(a.stepsLast);
      expect(b.inView).toBe(a.inView);
      expect(b.waveCss).toEqual(a.waveCss);
      expect((a.R as Float32Array).some((v) => v !== 0.5)).toBe(true);  // 场真实演化（防哑）
    } finally {
      performance.now = nowOrig;
      swPerfSetForTest(false);
    }
  });

  it('Set 构造计数：flag 关每次调用 ≥2、flag 开=0（常量表真实被消除）', () => {
    const nowOrig = performance.now.bind(performance);
    performance.now = () => 555000;
    swPerfSetForTest(false);
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    const world = makeWorld();
    const player = { dead: false, x: 330, y: 600, w: 20, h: 42, vx: 2, vy: 0,
      inWater: false, wetCount: 0, inHoney: false, inLava: false };
    const entities = makeEntities();
    const mkStub = () => ({ atlas: undefined, _waveQ: -1, _cssW: 0, _waveCss: null,
      _waveLiquidInView: true, _waveLastMs: 0 } as unknown as Renderer);
    const call = (stub: Renderer) => upd.call(stub, { x: 640, y: 640 }, world, player, entities, [], 800, 520, 1);
    try {
      const off = countConstruct('Set', () => call(mkStub()));
      swPerfSetForTest(true);
      const on = countConstruct('Set', () => call(mkStub()));
      expect(off).toBeGreaterThanOrEqual(2);
      expect(on).toBe(0);
    } finally {
      performance.now = nowOrig;
      swPerfSetForTest(false);
    }
  });

  it('_waveCss 引用同一性：flag 关每帧新对象 / flag 开持久槽复用（对象分配消除）', () => {
    const nowOrig = performance.now.bind(performance);
    performance.now = () => 555000;
    try {
      const off = runUpdateSeq(false);
      const on = runUpdateSeq(true);
      expect(new Set(off.cssRefs).size).toBe(5);          // 原行为：每帧新对象
      expect(new Set(on.cssRefs).size).toBe(1);           // 快路径：同一持久对象
    } finally {
      performance.now = nowOrig;
      swPerfSetForTest(false);
    }
  });
});

// =====================================================================
// ④ 结构锁（源文本锚——防快路径吃掉原路径/防原路径被改）
// =====================================================================
describe('★BJ78 结构锁(源文本锚)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const waveSrc = read('../src/render/WaterWaves.ts');
  const glSrc = read('../src/render/GLWaterDistortion.ts');
  const rendererSrc = read('../src/render/Renderer.ts');
  const flagSrc = read('../src/render/perfFlags.ts');

  it('W1：双支结构在位，原 IIFE 逐字保留于 else 支', () => {
    expect(waveSrc).toContain("const waveAmp = swPerf ? waveAmpParam() : (() => { try { return Number(new URLSearchParams(location.search).get('wamp')) || 1; } catch { return 1; } })();");
  });

  it('W2：双支结构在位，原 IIFE 逐字保留于 else 支', () => {
    expect(glSrc).toContain("const amp = swPerf ? waveAmpParam() : (() => { try { return Number(new URLSearchParams(location.search).get('wamp')) || 1; } catch { return 1; } })();");
  });

  it('W3：快路径门+核公式逐字同序+原路径逐字保留', () => {
    expect(waveSrc).toContain('if (swPerf && dx === 0 && dy === 0) {');
    // 核公式（各支逐字同串）——★BJ270 2026-09-22 起 4 处：W3 + BJ270 内域 +
    // BJ270 边缘闭包(edgePx) + 原路径(豁免臂);四支互为逐字同序拷贝,
    // 行为面由 tests/bj270-waves-interior.test.ts 双支对拍守卫
    expect(waveSrc.match(/const newH = \(signedC \+ 2 \* \(S \* 0\.25 - signedC\) \+ wv \* Math\.abs\(wv\)\) \* WATER_DAMP;/g)?.length).toBe(4);
    expect(waveSrc.match(/let rq = Math\.round\(\(q < 0 \? 0 : q > 512 \? 1 : q \/ 512\) \* 256\);/g)?.length).toBe(4);
    // 原路径逐像素钳制/索引逐字保留
    expect(waveSrc).toContain('const sx0 = x - dx;');
    expect(waveSrc).toContain('const xL = Math.min(w - 1, Math.max(0, sx0 - 1));');
    expect(waveSrc).toContain('const xM = Math.min(w - 1, Math.max(0, sx0));');
    expect(waveSrc).toContain('const xR = Math.min(w - 1, Math.max(0, sx0 + 1));');
    expect(waveSrc).toContain('const i = y * w + x;');
    // 快路径外提不变式（clamp 塌缩为边界三元 + i=rowM+x）
    expect(waveSrc).toContain('const xL = x > 0 ? x - 1 : 0;');
    expect(waveSrc).toContain('const i = rowM + x;');
  });

  it('W4：双支结构在位，原闭包/原 Set/原字面量逐字保留于 else 支', () => {
    expect(rendererSrc).toContain('const NO_WATER_DISTORT = swPerf ? BJ78_NO_WATER_DISTORT : new Set([7, 8, 150, 151, 152, 493, 494]);');
    expect(rendererSrc).toContain('const NO_LIQUID_DISTORT = swPerf ? BJ78_NO_LIQUID_DISTORT : new Set([511, 512, 513]);');
    expect(rendererSrc).toContain('const inLiquidAt = swPerf ? _waveCtxInLiquidAt');
    expect(rendererSrc).toContain('const push = swPerf ? _waveCtxPush');
    expect(rendererSrc).toContain('const pushPlayer = swPerf ? _waveCtxPushPlayer');
    expect(rendererSrc).toContain('this._waveCss = { cssW, cssH, cssScale, cssZoom, camL, camT };   // 原行为');
    expect(rendererSrc).toContain('wcss.cssW = cssW; wcss.cssH = cssH; wcss.cssScale = cssScale;');
    // 原闭包体逐字保留（else 支）
    expect(rendererSrc).toContain('const tx = (wx / TILE) | 0, ty = (wy / TILE) | 0;');
    expect(rendererSrc).toContain('return st.inBounds(tx, ty) && st.liquid[st.idx(tx, ty)] > 0;');
    expect(rendererSrc).toContain('(s: WaveEntitySample) => injectEntity(s, camL, camT, cssW, cssH, cssZoom)');
    // frame 双支（复用槽 + 原字面量）
    expect(rendererSrc).toContain('const fi = _waveFrameInp;');
    expect(rendererSrc).toContain('fi.maxTilesX = world.w; fi.maxTilesY = world.h;');
    expect(rendererSrc).toContain('waterWaves.frame({');
  });

  it('perfFlags：waveAmpParam 缓存面在位（按 search 键控+reset 测试面）', () => {
    expect(flagSrc).toContain('export function waveAmpParam');
    expect(flagSrc).toContain('q !== _wampSearchKey');
    expect(flagSrc).toContain('waveAmpResetForTest');
  });

  it('W4 弹幕两表逐值=Terarria1457 ProjectileID.cs:289/:425（测试独立硬编码）', () => {
    expect([...BJ78_NO_WATER_DISTORT].sort((a, b) => a - b)).toEqual([7, 8, 150, 151, 152, 493, 494]);   // CanDistortWater 例外表
    expect([...BJ78_NO_LIQUID_DISTORT].sort((a, b) => a - b)).toEqual([511, 512, 513]);                   // NoLiquidDistortion
  });
});

// swPerf 引用保活（闸门缺省关断言在 BJ77 守卫文件）
void swPerf;   // 转正后缺省开;翻面 API 语义见 perfFlags 头注
