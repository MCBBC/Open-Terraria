// ★WASM 第二刀(2026-10-03):光照 blur 核 AS 化——位级金标锁 + flag/回退锁。
// 对位 tests/sm2-wasm.test.ts 模板。位级线:同一输入(三通道 f32 + mask + 水 flick
// LUT + 衰减常数)下 WASM 核与 JS 核(LightMap.blurPass/blurLine,金标链
// lighting-scan-blur-golden 已锁)输出 r/g/b **逐位相等**(f32 比特域比对)。
// 位级策略见 src/wasm/light.as.ts 头注:链式累加器 f64 全程,仅 store 落 f32。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LightMap, Mask } from '../src/lighting/LightMap';
import { TileLightScanner } from '../src/lighting/TileLightScanner';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { FlickerClock } from '../src/lighting/SkyColor';
import { FastRandom } from '../src/lighting/FastRandom';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { updateLightDecay } from '../src/lighting/lightTables';
import {
  __setLightWasmFlagForTest, __setLightWasmUnavailableForTest, __resetLightWasmForTest,
  __lightWasmStats, ensureLightWasm, lightWasmEnabled, lightWasmReady, lightWasmBlur,
} from '../src/wasm/lightWasm';

const bySheet = (s: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);

/** f32 逐位比对(比特域;NaN payload 不在此域——NaN 判等走专用断言) */
function bitDiff(a: Float32Array, b: Float32Array): { n: number; first: number; av: number; bv: number } {
  const ua = new Uint32Array(a.buffer, a.byteOffset, a.length);
  const ub = new Uint32Array(b.buffer, b.byteOffset, b.length);
  let n = 0, first = -1, av = 0, bv = 0;
  for (let i = 0; i < a.length; i++) {
    if (ua[i] !== ub[i]) { n++; if (first < 0) { first = i; av = a[i]; bv = b[i]; } }
  }
  return { n, first, av, bv };
}

function expectBitEqual(a: Float32Array, b: Float32Array, tag: string): void {
  expect(a.length).toBe(b.length);
  const d = bitDiff(a, b);
  if (d.n !== 0) {
    expect.fail(`${tag}: ${d.n} 位差异,首格 #${d.first} js=${d.av} wasm=${d.bv}`);
  }
}

/** 确定性 LCG 填充(0-1 f32 值域;跨臂同序列) */
function fillLcg(map: LightMap, seed: number, density = 1): void {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = map.w * map.h;
  for (let i = 0; i < n; i++) {
    if (density < 1 && next() > density) continue;
    map.r[i] = next() * 1.4;
    map.g[i] = next() * 1.4;
    map.b[i] = next() * 1.4;
  }
}

function setMaskRegion(map: LightMap, x0: number, y0: number, x1: number, y1: number, m: Mask): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map.mask[y * map.w + x] = m;
}

/** 双臂跑 blur:深拷贝图 → A 臂(JS,旗关)/B 臂(WASM,旗开)→ 三通道逐位比对。
 *  随机源钉:LightMap.random 私有,测试态经运行时属性注入同种子(两侧 LUT 同序列)。 */
async function abBlur(tag: string, w: number, h: number,
  build: (map: LightMap) => void, pad = 18): Promise<void> {
  const mk = (): LightMap => {
    const m = new LightMap();
    m.setSize(w, h);
    m.nonVisiblePadding = pad;
    return m;
  };
  const js = mk(), wm = mk();
  build(js); build(wm);
  (js as unknown as { random: FastRandom }).random = new FastRandom(0x1234567);
  (wm as unknown as { random: FastRandom }).random = new FastRandom(0x1234567);
  // A 臂:JS
  __setLightWasmFlagForTest(false);
  js.blur();
  // B 臂:WASM
  __setLightWasmFlagForTest(true);
  const runsBefore = __lightWasmStats.runs;
  wm.blur();
  expect(__lightWasmStats.runs, `${tag}: wasm 支未接通(runs 未增)`).toBe(runsBefore + 1);
  __setLightWasmFlagForTest(null);
  expectBitEqual(js.r, wm.r, `${tag} R`);
  expectBitEqual(js.g, wm.g, `${tag} G`);
  expectBitEqual(js.b, wm.b, `${tag} B`);
  // 种子链推进等值(NextSeed 语义保持;JS 侧推进,两侧同值)
  expect((wm as unknown as { random: FastRandom }).random.getSeed(),
    `${tag}: 种子链推进分歧`).toBe((js as unknown as { random: FastRandom }).random.getSeed());
}

// ---------------- 游戏形世界(热循环 bench 同构:水/岩浆/实心/玻璃/火把) ----------------
function buildGameWorld(W: number, H: number, GROUND: number, LAVA: number): TileStore {
  const st = new TileStore(W, H);
  const dirt = bySheet(0), stone = bySheet(1), torch = bySheet(4), glass = bySheet(54);
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y <= GROUND + 4; y++) st.setTile(x, y, dirt);
    for (let y = GROUND + 40; y <= GROUND + 52; y++) st.setTile(x, y, stone);
    for (let y = LAVA + 2; y < H; y++) st.setTile(x, y, stone);
  }
  for (let x = 4; x < W; x += 16) st.setTile(x, GROUND - 1, torch, 0, (x % 6) * 22);
  for (let x = 10; x < Math.min(30, W); x++) st.setTile(x, GROUND - 2, glass);
  for (let x = 40; x < Math.min(150, W); x++) for (let y = GROUND - 3; y < GROUND; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 1;
  }
  for (let x = 0; x < W; x++) for (let y = LAVA; y < LAVA + 2; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 2;
  }
  for (let x = 0; x < W; x++) for (let y = GROUND + 6; y < H; y++) st.wall[st.idx(x, y)] = 1;
  return st;
}

function makeFlicker(): FlickerClock {
  const f = new FlickerClock();
  f.mouseTextColor = 210;
  f.demonTorch = 0.37;
  f.discoR = 200; f.discoG = 80; f.discoB = 40;
  Object.defineProperty(f, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  return f;
}

afterAll(() => {
  __setLightWasmFlagForTest(null);
  __setLightWasmUnavailableForTest(null);
  __resetLightWasmForTest();
});

describe('light-wasm:加载与 ABI', () => {
  it('产物零 import + lightVersion era guard=1(构建脚本同款自检复跑)', async () => {
    const p = fileURLToPath(new URL('../src/wasm/gen/light.wasm', import.meta.url));
    const bytes = readFileSync(p);
    const mod = new WebAssembly.Module(bytes);
    expect(WebAssembly.Module.imports(mod)).toHaveLength(0);
    const inst = new WebAssembly.Instance(mod, {});
    expect((inst.exports as { lightVersion(): number }).lightVersion()).toBe(1);
  });

  it('node 域加载就绪 + 容量回读', async () => {
    __resetLightWasmForTest();
    expect(await ensureLightWasm()).toBe(true);
    expect(lightWasmReady()).toBe(true);
  });
});

describe('light-wasm:flag 三态(★转正缺省开,2026-10-04)', () => {
  it('缺省开:旗读 true(node 域 name 通道空串=无禁用标记);?lightwasm=0 逃生门禁用', () => {
    __setLightWasmFlagForTest(null);
    expect(lightWasmEnabled()).toBe(true);
  });

  it('worker name 通道:document 缺席域读 globalThis.name(node 即此域)', () => {
    const g = globalThis as { name?: string };
    const saved = g.name;
    __setLightWasmFlagForTest(null);
    try {
      g.name = 'LightWorker';
      expect(lightWasmEnabled()).toBe(true);    // ★转正:缺省开(旧名无禁用标记)
      g.name = 'sw-lightwasm=0';
      expect(lightWasmEnabled()).toBe(false);   // 禁用标记(逃生门注入串)
      g.name = 'xlightwasm=0y';
      expect(lightWasmEnabled()).toBe(false);   // 子串匹配(注入格式演化容忍)
    } finally {
      g.name = saved;
    }
  });

  it('测试钩开关与恢复', () => {
    __setLightWasmFlagForTest(true);
    expect(lightWasmEnabled()).toBe(true);
    __setLightWasmFlagForTest(false);
    expect(lightWasmEnabled()).toBe(false);
    __setLightWasmFlagForTest(null);
  });
});

describe('light-wasm:位级金标(JS 核 vs WASM 核)', () => {
  it('游戏形 181×129(1080p region 口径:水/岩浆/实心/玻璃 mask 混合面)', async () => {
    await abBlur('游戏形181x129', 181, 129, (m) => {
      fillLcg(m, 0x5162020, 0.35);
      setMaskRegion(m, 40, 59, 150, 62, Mask.Water);        // 水坑(LUT 支)
      setMaskRegion(m, 0, 102, 181, 104, Mask.Solid);       // 岩浆底
      setMaskRegion(m, 10, 56, 30, 57, Mask.CrackedBricks); // 裂纹砖
      setMaskRegion(m, 60, 20, 90, 24, Mask.Honey);         // 蜂蜜(逐通道异值)
      setMaskRegion(m, 0, 68, 181, 129, Mask.Solid);        // 地下实心
    });
  });

  it('全水 worst-case(每格 LUT 支全活)', async () => {
    await abBlur('全水', 160, 120, (m) => {
      fillLcg(m, 0xabcdef, 1);
      for (let i = 0; i < m.mask.length; i++) m.mask[i] = Mask.Water;
    });
  });

  it('全实心 / 全蜂蜜 / 全裂纹 三档(衰减常数面)', async () => {
    for (const [tag, m] of [['全实心', Mask.Solid], ['全蜂蜜', Mask.Honey], ['全裂纹', Mask.CrackedBricks]] as const) {
      await abBlur(tag, 100, 80, (mm) => {
        fillLcg(mm, 0x777, 0.8);
        for (let i = 0; i < mm.mask.length; i++) mm.mask[i] = m;
      });
    }
  });

  it('全零图 + mask 混档小图(死亡链全程)', async () => {
    await abBlur('全零', 64, 48, () => { /* 全 0 */ });
    await abBlur('混档小图', 33, 21, (m) => {
      fillLcg(m, 0x31337, 0.5);
      setMaskRegion(m, 0, 0, 33, 7, Mask.Solid);
      setMaskRegion(m, 0, 7, 33, 14, Mask.Water);
      setMaskRegion(m, 0, 14, 33, 21, Mask.Honey);
      setMaskRegion(m, 5, 5, 28, 16, Mask.CrackedBricks);
    }, 6);
  });

  it('退化几何:1×N / N×1 / 1×1 / pad=0 / pad=min>>1', async () => {
    await abBlur('1xN', 1, 40, (m) => fillLcg(m, 0x11, 0.9), 0);
    await abBlur('Nx1', 40, 1, (m) => fillLcg(m, 0x22, 0.9), 0);
    await abBlur('1x1', 1, 1, (m) => { m.r[0] = 0.5; m.g[0] = 0.25; m.b[0] = 0.75; }, 0);
    await abBlur('pad0', 32, 32, (m) => fillLcg(m, 0x33, 1), 0);
    await abBlur('padHalf', 32, 32, (m) => fillLcg(m, 0x44, 1), 16);   // min>>1=16
  });

  it('浮点边界模糊弹:±0 / NaN / Inf / 阈值邻域 / 非规格化(NaN 比较语义同 JS)', async () => {
    await abBlur('浮点边界', 48, 48, (m) => {
      fillLcg(m, 0x999, 1);
      const n = m.w * m.h;
      const specials = [0, -0, NaN, Infinity, -Infinity, 5e-324, 0.01849999, 0.0185, 0.01850001,
        1.4e-45, 3.4028235e38, 0.91, 0.56, 255 / 306];
      for (let k = 0; k < specials.length; k++) {
        m.r[k * 3] = specials[k]; m.g[k * 3 + 1] = specials[k]; m.b[k * 3 + 2] = specials[k];
        m.r[n - 1 - k] = specials[k]; m.b[n - 1 - k] = specials[k] * 0.5;
      }
      setMaskRegion(m, 0, 0, 48, 16, Mask.Water);
      setMaskRegion(m, 0, 16, 48, 32, Mask.Solid);
    });
  });

  it('WASM 纯函数可复现(同输入双跑逐位)', async () => {
    __setLightWasmFlagForTest(true);
    const mk = (): LightMap => {
      const m = new LightMap();
      m.setSize(90, 70);
      m.nonVisiblePadding = 12;
      fillLcg(m, 0xc0ffee, 0.7);
      setMaskRegion(m, 10, 10, 80, 60, Mask.Water);
      (m as unknown as { random: FastRandom }).random = new FastRandom(42);
      return m;
    };
    const a = mk(), b = mk();
    a.blur(); a.blur(); b.blur(); b.blur();
    __setLightWasmFlagForTest(null);
    expectBitEqual(a.r, b.r, '复现 R');
    expectBitEqual(a.g, b.g, '复现 G');
    expectBitEqual(a.b, b.b, '复现 B');
  });

  it('mask 输入不被核改写(原位纪律:blur 只写 r/g/b)', async () => {
    __setLightWasmFlagForTest(true);
    const m = new LightMap();
    m.setSize(50, 50);
    m.nonVisiblePadding = 10;
    fillLcg(m, 0x2222, 1);
    setMaskRegion(m, 0, 0, 50, 50, Mask.Water);
    const maskCopy = m.mask.slice();
    m.blur();
    __setLightWasmFlagForTest(null);
    expect(Buffer.from(m.mask).equals(Buffer.from(maskCopy))).toBe(true);
  });
});

describe('light-wasm:回退锁(fail-closed)', () => {
  it('旗关:零 WASM 触达(runs 不增),JS 路径照常', async () => {
    __setLightWasmFlagForTest(false);
    const m = new LightMap();
    m.setSize(40, 30);
    fillLcg(m, 0x55, 1);
    const runs = __lightWasmStats.runs;
    m.blur();
    expect(__lightWasmStats.runs).toBe(runs);
    __setLightWasmFlagForTest(null);
  });

  it('强置不可用:ready=false,blur 静默落回 JS 逐位', async () => {
    __setLightWasmFlagForTest(true);
    __setLightWasmUnavailableForTest(true);
    const mk = (): LightMap => {
      const m = new LightMap();
      m.setSize(60, 45);
      m.nonVisiblePadding = 10;
      fillLcg(m, 0x66, 1);
      setMaskRegion(m, 5, 5, 55, 40, Mask.Water);
      (m as unknown as { random: FastRandom }).random = new FastRandom(0x77);
      return m;
    };
    const a = mk(), b = mk();
    a.blur();   // JS
    b.blur();   // 不可用 → JS
    __setLightWasmUnavailableForTest(null);
    __setLightWasmFlagForTest(null);
    expectBitEqual(a.r, b.r, '强置不可用 R');
    expectBitEqual(a.g, b.g, '强置不可用 G');
    expectBitEqual(a.b, b.b, '强置不可用 B');
  });

  it('node 无 WebAssembly 环境:加载 fail-closed(loadFail 计数),JS 产物逐位正常', async () => {
    const g = globalThis as { WebAssembly?: unknown };
    const saved = g.WebAssembly as unknown;
    __setLightWasmFlagForTest(true);
    try {
      expect(Reflect.deleteProperty(g, 'WebAssembly')).toBe(true);
      __resetLightWasmForTest();
      expect(await ensureLightWasm()).toBe(false);
      expect(lightWasmReady()).toBe(false);
      expect(__lightWasmStats.loadFail).toBeGreaterThan(0);
      const mk = (): LightMap => {
        const m = new LightMap();
        m.setSize(30, 20);
        fillLcg(m, 0x88, 1);
        (m as unknown as { random: FastRandom }).random = new FastRandom(0x99);
        return m;
      };
      const a = mk(), b = mk();
      a.blur();
      b.blur();   // failed 态 → JS
      expectBitEqual(a.r, b.r, '无 wasm R');
      expectBitEqual(a.g, b.g, '无 wasm G');
      expectBitEqual(a.b, b.b, '无 wasm B');
    } finally {
      if (saved === undefined) {
        if (!('WebAssembly' in g)) g.WebAssembly = WebAssembly;
      } else {
        g.WebAssembly = saved;
      }
      __resetLightWasmForTest();
      __setLightWasmFlagForTest(null);
    }
  });

  it('超容量拒(w×h > 2^18):refusals 计数,调用方落回 JS', async () => {
    __setLightWasmFlagForTest(true);
    __resetLightWasmForTest();
    expect(await ensureLightWasm()).toBe(true);   // 前序回退锁 reset 后重建就绪态
    const cells = (1 << 18) + 1;               // 262145 格
    const r = new Float32Array(cells), g2 = new Float32Array(cells), b = new Float32Array(cells);
    const mask = new Uint8Array(cells), lut = new Uint8Array(cells);
    const refusals = __lightWasmStats.refusals;
    // 513×512=262656 > 262144 → JS 侧容量拒
    const ok = lightWasmBlur(r, g2, b, mask, lut, 513, 512, 10, 0.91, 0.56, 0.8, 0.8, 0.87, 0.91, 0.68, 0.64, 0.55);
    expect(ok).toBe(false);
    expect(__lightWasmStats.refusals).toBe(refusals + 1);
    __setLightWasmFlagForTest(null);
  });

  it('非法几何拒(w/h ≤ 0):返回 false 不触核', async () => {
    __setLightWasmFlagForTest(true);
    __resetLightWasmForTest();
    expect(await ensureLightWasm()).toBe(true);
    const r = new Float32Array(16), g2 = new Float32Array(16), b = new Float32Array(16);
    const mask = new Uint8Array(16), lut = new Uint8Array(16);
    expect(lightWasmBlur(r, g2, b, mask, lut, 0, 16, 0, 0.91, 0.56, 0.8, 0.8, 0.87, 0.91, 0.68, 0.64, 0.55)).toBe(false);
    expect(lightWasmBlur(r, g2, b, mask, lut, 16, 0, 0, 0.91, 0.56, 0.8, 0.8, 0.87, 0.91, 0.68, 0.64, 0.55)).toBe(false);
    __setLightWasmFlagForTest(null);
  });
});

describe('light-wasm:引擎端到端 A/B( LightingEngine 本地路径全周期)', () => {
  /** 同世界双引擎:旗关/旗开各跑同帧序列,公共采样对逐位比对。
   *  随机源钉:work/active 双图 random 固定种子(水 flick LUT 链);scanner.random
   *  初始种子固定(0x9e3779b9),exportTo 每周期 reseed=确定性链;水母笼(316-318)
   *  为 Math.random 态机,夹具排除(parity 测试混沌类 c 同判例)。 */
  function runEngineArm(wasm: boolean): { r: Uint8Array; g: Uint8Array; b: Uint8Array; rw: number; rh: number } {
    __setLightWasmFlagForTest(wasm);
    const W = 96, H = 72, GROUND = 30, LAVA = 62;
    const store = buildGameWorld(W, H, GROUND, LAVA);
    const world = { store, groundLevel: GROUND, lavaLine: LAVA,
      clock: { timeOfDay: 0.85, dayCount: 7 } } as unknown as LightingWorld;
    const e = new LightingEngine(world);
    e.setSnapshotRegion(8, 6, 80, 60);
    // 钉双图随机源(私有字段运行时注入;两侧同种子序列)
    const pin = (m: LightMap): void => { (m as unknown as { random: FastRandom }).random = new FastRandom(0xbeef); };
    pin((e as unknown as { work: LightMap }).work);
    pin((e as unknown as { active: LightMap }).active);
    const fk = (e as unknown as { flicker: FlickerClock }).flicker;
    fk.mouseTextColor = 210; fk.demonTorch = 0.37;
    fk.discoR = 200; fk.discoG = 80; fk.discoB = 40;
    Object.defineProperty(fk, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
    updateLightDecay(1, false);   // 与生产调用序同构(decay 先于 compute;纯水档无状态漂移)
    e.heldLight = { tx: 30, ty: 24, r: 1, g: 0.95, b: 0.8 };
    e.dirty = true;
    e.compute(0);                 // runFullCycle:scan→blur(wasm 支)→present→发布
    __setLightWasmFlagForTest(null);
    return { r: e.r, g: e.g, b: e.b, rw: e.rw, rh: e.rh };
  }

  it('同快照同帧序:公共面 r/g/b 逐位相等', () => {
    const js = runEngineArm(false);
    const wm = runEngineArm(true);
    expect(wm.rw).toBe(js.rw);
    expect(wm.rh).toBe(js.rh);
    expect(wm.r.length).toBe(js.r.length);
    let dr = 0, dg = 0, db = 0;
    for (let i = 0; i < js.r.length; i++) {
      if (js.r[i] !== wm.r[i]) dr++;
      if (js.g[i] !== wm.g[i]) dg++;
      if (js.b[i] !== wm.b[i]) db++;
    }
    expect(dr).toBe(0);
    expect(dg).toBe(0);
    expect(db).toBe(0);
  });
});
