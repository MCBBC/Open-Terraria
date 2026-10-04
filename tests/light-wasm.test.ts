// ★WASM 第二/四刀(2026-10-03 blur / 2026-10-04 scan):光照核 AS 化——位级金标锁
// + flag/回退锁。对位 tests/sm2-wasm.test.ts 模板。位级线:同一输入下 WASM 核与
// JS 核输出 **逐位相等**(f32 比特域比对;blur=L39-89 段,scan=尾部 scan 核段)。
// 位级策略见 src/wasm/light.as.ts 头注:blur 链式累加器 f64 全程仅 store 落 f32;
// scan RNG 链=f(masterSeed) 纯函数复刻,特例 60-case 留 JS 尾段(拆分定谳)。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LightMap, Mask } from '../src/lighting/LightMap';
import { TileLightScanner, type ScannerWorld, type PerFrameLight } from '../src/lighting/TileLightScanner';
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
  it('产物零 import + lightVersion era guard=2(构建脚本同款自检复跑;v2=scan 核扩入)', async () => {
    const p = fileURLToPath(new URL('../src/wasm/gen/light.wasm', import.meta.url));
    const bytes = readFileSync(p);
    const mod = new WebAssembly.Module(bytes);
    expect(WebAssembly.Module.imports(mod)).toHaveLength(0);
    const inst = new WebAssembly.Instance(mod, {});
    expect((inst.exports as { lightVersion(): number }).lightVersion()).toBe(2);
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

// ====================================================================
// scan 核(v2;2026-10-04 第四刀)——位级金标 + RNG 链等值 + 回退锁
// 对位 blur 核测试形态。位级线:同一世界+同一 FlickerClock 态+同一 master 种子
// 下,JS 核(exportToJs,金标链 lighting-scan-blur-golden 已锁)与 WASM 核
// (lightExport 主循环 + exportWasmTail 特例尾段)输出 r/g/b/mask 逐位相等。
// 拆分定谳/RNG 链/FlickerClock 三问见 src/wasm/light.as.ts 头注。
// ====================================================================

// ---- scan 特征世界(golden features 同构:全 case 类覆盖;蛇形铺格) ----
const SW = 64, SH = 48, S_GROUND = 20, S_LAVA = 44;

function buildScanFeatureWorld(): TileStore {
  const st = new TileStore(SW, SH);
  const put = (sheet: number, x: number, y: number,
    extra: Partial<Record<'frameX' | 'frameY' | 'wall' | 'liquid' | 'liquidType' | 'half' | 'slope' | 'coat' | 'wire' | 'paint' | 'paintWall', number>> = {}) => {
    const id = bySheet(sheet);
    if (id < 0) return;
    st.setTile(x, y, id, extra.frameX ?? 0, extra.frameY ?? 0);
    const i = st.idx(x, y);
    if (extra.wall !== undefined) st.wall[i] = extra.wall;
    if (extra.liquid !== undefined) { st.liquid[i] = extra.liquid; st.liquidType[i] = extra.liquidType ?? 1; }
    if (extra.half !== undefined) st.half[i] = extra.half;
    if (extra.slope !== undefined) st.slope[i] = extra.slope;
    if (extra.coat !== undefined) st.coat[i] = extra.coat;
    if (extra.wire !== undefined) st.wire[i] = extra.wire;
    if (extra.paint !== undefined) st.paint[i] = extra.paint;
    if (extra.paintWall !== undefined) st.paintWall[i] = extra.paintWall;
  };
  // 地表带/地下基底/土墙
  for (let x = 0; x < SW; x++) {
    for (let y = 19; y <= 23; y++) put(0, x, y);
    for (let y = 35; y <= 38; y++) put(1, x, y);
    for (let y = 22; y < SH; y++) st.wall[st.idx(x, y)] = 1;
  }
  let x = 2;
  const row = (y: number, items: Array<[number, Partial<Record<string, number>>]>): void => {
    for (const [sheet, extra] of items) {
      put(sheet, x, y, extra as never);
      x += x >= SW - 3 ? -(SW - 6) : 2;
    }
  };
  // 火把 24 档(含 7/14/23 动态)+ 蜡烛族 + 灯笼 42(demon 调制档 7/9)
  row(8, [0, 3, 7, 14, 20, 23].map((s) => [4, { frameY: s * 22, wall: 1 }]) as never);
  row(12, [0, 5, 20, 25, 30, 42].map((s) => [33, { frameY: s * 22, wall: 1 }]) as never);
  row(14, [1, 6, 23, 31].map((s) => [93, { frameY: s * 54, wall: 1 }]) as never);
  row(16, [1, 20, 31].map((s) => [100, { frameY: s * 36, wall: 1 }]) as never);
  row(16, [[34, { frameX: 0, frameY: 7 * 54, wall: 1 }], [34, { frameX: 108, frameY: 25 * 54, wall: 1 }]] as never);
  row(12, [[42, { frameY: 7 * 36, wall: 1 }], [42, { frameY: 9 * 36, wall: 1 }], [42, { frameY: 49 * 36, wall: 1 }], [42, { frameY: 28 * 36, wall: 1 }], [174, { frameX: 0, wall: 1 }], [372, { frameX: 0, wall: 1 }]] as never);
  // 动态特例:迪斯科球/导线灯泡/传送门炮/药草/书架/梳妆台/烟囱/瓶中魂/微光蜡烛/暗影蜡烛
  row(6, [[126, { frameX: 0 }], [126, { frameX: 36 }], [429, { frameX: 0 }], [429, { frameX: 54 }], [429, { frameX: 144 }], [209, { frameX: 234 }]] as never);
  row(8, [[84, { frameX: 0 }], [84, { frameX: 36 }], [84, { frameX: 90 }], [84, { frameX: 108 }], [49, { frameX: 0, wall: 1 }], [49, { frameX: 36, wall: 1 }]] as never);
  row(10, [[95, { frameX: 0, wall: 1 }], [95, { frameX: 36, wall: 1 }], [96, { frameX: 36, wall: 1 }], [98, { frameY: 0, wall: 1 }], [564, { frameX: 0, wall: 1 }], [92, { frameY: 0, frameX: 0, wall: 1 }]] as never);
  row(14, [[572, { frameY: 0 }], [572, { frameY: 72 }], [658, { frameY: 0, wall: 1 }], [658, { frameY: 54, wall: 1 }], [660, {}], [646, { frameX: 0, wall: 1 }]] as never);
  row(16, [[620, { wall: 1 }], [663, { wall: 1 }], [356, { wall: 1 }], [350, { frameX: 0 }], [519, { frameY: 90 }], [597, { frameX: 108 }]] as never);
  // 迪斯科族/苔藓/彩虹云/星云/熔岩装饰/祭坛/陨石/水晶球/节日灯
  row(6, [[160, {}], [627, {}], [628, {}], [692, {}], [184, { frameX: 110 }], [184, { frameX: 220 }]] as never);
  row(9, [[719, {}], [327, { wall: 1 }], [37, { frameX: 0 }], [26, { frameX: 54 }], [31, { frameX: 36 }], [125, { frameX: 0 }]] as never);
  row(4, [[149, { frameX: 0 }], [149, { frameX: 18 }], [83, { frameX: 18 }], [83, { frameX: 90 }], [20, { frameX: 30 * 18 }], [27, {}]] as never);
  // 彩色玻璃墙 ×液量档
  row(4, ([88, 89, 90, 91, 92, 93, 241] as const).map((wl, i) =>
    [1, { wall: wl, liquid: [0, 100, 200, 255][i % 4], liquidType: 1 }]) as never);
  // 发光墙:宝石七条/彩虹/岩浆瀑布/透光/涂装覆写
  row(5, [[0, { wall: 153 }], [0, { wall: 154 }], [0, { wall: 164 }], [0, { wall: 165 }], [0, { wall: 44 }], [0, { wall: 346 }]] as never);
  row(5, [[0, { wall: 137 }], [0, { wall: 21 }], [0, { wall: 175, paintWall: 5 }], [0, { wall: 357, paintWall: 9 }], [0, { wall: 33 }], [0, { wall: 176 }]] as never);
  // 地表带:水坑四档深(深水微光支)/蜂蜜/半砖/坡面/裂纹砖/致动火把/隐形涂层
  [100, 150, 200, 255].forEach((d, i) => put(0, 4 + i * 3, 19, { liquid: d, liquidType: 1, wall: 1 }));
  put(0, 20, 19, { liquid: 255, liquidType: 3, wall: 1 });
  for (let i = 0; i < 4; i++) put(1, 30 + i * 2, 19, { half: 1, liquid: i === 3 ? 220 : 0, liquidType: 1, wall: 1 });
  for (let s = 1; s <= 4; s++) put(1, 40 + s, 19, { slope: s, wall: 1 });
  for (const s of [481, 482, 483]) put(s, 2 + (s - 481), 18, { wall: 1 });
  put(4, 50, 18, { frameY: 0, wire: 32, wall: 1 });
  put(1, 52, 18, { coat: 2, wall: 1 });
  // AllowLightInWater 族泡水 + 挡阳族
  [54, 541, 328, 459, 748, 750].forEach((s, i) => put(s, 2 + i * 2, 21, { liquid: 255, liquidType: 1, wall: 1 }));
  put(10, 20, 21, { wall: 1 });
  put(51, 22, 21, { wall: 1 });
  put(52, 24, 21, { slope: 1, wall: 1 });
  // 洞穴域:蘑菇组/雕像门控/闪烁组/水母笼/涂装矿/水母块涂装/微光火把块
  row(26, [[70, {}], [71, {}], [72, {}], [190, {}], [348, {}], [528, {}]] as never);
  row(26, [[578, {}], [349, { frameX: 0 }], [349, { frameX: 36 }], [405, { frameX: 0 }], [215, { frameX: 108 }], [592, { frameY: 18 }]] as never);
  row(29, [[316, {}], [317, {}], [318, {}], [22, { paint: 26, wall: 1 }], [739, { paint: 3, wall: 1 }], [204, { paint: 27, wall: 1 }]] as never);
  put(0, 8, 32, { liquid: 255, liquidType: 2, wall: 1 });
  put(0, 12, 32, { liquid: 100, liquidType: 4, wall: 1 });
  put(0, 14, 32, { liquid: 255, liquidType: 4, wall: 1 });
  row(30, [[718, {}], [238, {}], [548, { frameX: 54 * 8 }], [548, { frameX: 0 }], [35, { frameX: 0 }], [695, { frameX: 54 }]] as never);
  // 圣诞灯 origin 回溯(原点格 frameY 高位段=样式 5)+ 上方邻格
  put(171, 20, 34, { frameX: 0, frameY: 54 });
  st.type[33 * SW + 20] = bySheet(1); st.flags[33 * SW + 20] = 1; st.frameY[33 * SW + 20] = 0x1400;
  // 718 上邻 SolidTile3 读面
  put(1, 26, 33, {});
  // 地狱域:hellSky 支路 + 岩浆海 + 地狱火把 + 彩玻璃地狱档
  put(0, 6, 46, { wall: 1 });
  put(0, 10, 46, { wall: 88 });
  put(1, 14, 46, { half: 1, wall: 1 });
  put(0, 14, 45, { liquid: 220, liquidType: 1 });
  for (let i = 0; i < 6; i++) put(0, 20 + i * 2, 47, { liquid: 255, liquidType: 2, wall: 1 });
  put(4, 44, 46, { frameY: 0, wall: 1 });
  return st;
}

function makeScanWorld(st: TileStore, opt: {
  groundLevel?: number; lavaLine?: number; timeOfDay?: number; isDay?: boolean;
  hashOrigin?: { x: number; y: number }; raining?: boolean;
} = {}): ScannerWorld {
  return {
    store: st,
    groundLevel: opt.groundLevel ?? S_GROUND,
    lavaLine: opt.lavaLine ?? S_LAVA,
    clock: { timeOfDay: opt.timeOfDay ?? 0.85, dayCount: 7, eclipse: false, isDay: opt.isDay ?? false },
    hashOrigin: opt.hashOrigin,
    weather: { raining: opt.raining ?? false },
    sundialCooldown: 5, moondialCooldown: 3,
  } as unknown as ScannerWorld;
}

function makeScanFlicker(v: 'night' | 'day' | 'mid' = 'night'): FlickerClock {
  const f = new FlickerClock();
  if (v === 'night') {
    f.mouseTextColor = 210; f.demonTorch = 0.37;
    f.discoR = 200; f.discoG = 80; f.discoB = 40;
    f.essScale = 0.9; f.timeForVisualEffects = 12345;
  } else if (v === 'day') {
    f.mouseTextColor = 255; f.demonTorch = 0.0;
    f.discoR = 0; f.discoG = 255; f.discoB = 0;
    f.timeForVisualEffects = 0;
  } else {
    f.mouseTextColor = 190; f.demonTorch = 1.0;
    f.discoR = 130; f.discoG = 0; f.discoB = 250;
    f.timeForVisualEffects = 98765;
  }
  Object.defineProperty(f, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  return f;
}

const SCAN_PER_FRAME: PerFrameLight[] = [
  { x: 12, y: 12, r: 1, g: 0.6, b: 0.3 },
  { x: 40, y: 30, r: 0.2, g: 0.9, b: 0.4 },
  { x: 5, y: 46, r: 0.8, g: 0.2, b: 0.1 },
];

function maskDiff(a: Uint8Array, b: Uint8Array): { n: number; first: number } {
  let n = 0, first = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { n++; if (first < 0) first = i; }
  return { n, first };
}

function expectMaskEqual(a: Uint8Array, b: Uint8Array, tag: string): void {
  expect(a.length).toBe(b.length);
  const d = maskDiff(a, b);
  if (d.n !== 0) expect.fail(`${tag}: mask ${d.n} 差异,首格 #${d.first}`);
}

/** scan 双臂跑:A=旗关(JS exportToJs)/B=旗开(WASM 主循环+JS 尾段)→ 位级比对。
 *  scanner.random 钉同初种(两侧 reseed 推进链同相);perFrame 同序。 */
async function abScan(tag: string, W: number, H: number,
  build: () => TileStore, worldOpt: Parameters<typeof makeScanWorld>[1] = {},
  rx = 0, ry = 0, flicker: 'night' | 'day' | 'mid' = 'night'): Promise<void> {
  const mk = (): { scanner: TileLightScanner; map: LightMap; world: ScannerWorld; store: TileStore } => {
    const store = build();
    const scanner = new TileLightScanner(makeScanFlicker(flicker));
    (scanner as unknown as { random: FastRandom }).random = new FastRandom(0x9e3779b9);
    const map = new LightMap();
    map.setSize(W, H);
    map.nonVisiblePadding = 18;
    return { scanner, map, world: makeScanWorld(store, worldOpt), store };
  };
  const runsBefore = __lightWasmStats.scanRuns;
  // A 臂:JS
  __setLightWasmFlagForTest(false);
  const a = mk();
  a.scanner.exportTo(a.world, a.map, rx, ry, SCAN_PER_FRAME.map((l) => ({ ...l })));
  // B 臂:WASM
  __setLightWasmFlagForTest(true);
  const b = mk();
  b.scanner.exportTo(b.world, b.map, rx, ry, SCAN_PER_FRAME.map((l) => ({ ...l })));
  expect(__lightWasmStats.scanRuns, `${tag}: wasm scan 支未接通(scanRuns 未增)`).toBe(runsBefore + 1);
  __setLightWasmFlagForTest(null);
  expectBitEqual(a.map.r, b.map.r, `${tag} R`);
  expectBitEqual(a.map.g, b.map.g, `${tag} G`);
  expectBitEqual(a.map.b, b.map.b, `${tag} B`);
  expectMaskEqual(a.map.mask, b.map.mask, `${tag} mask`);
  // RNG 链推进等值(reseed 每 exportTo 恰一步;两侧链同相)
  expect((b.scanner as unknown as { random: FastRandom }).random.getSeed(),
    `${tag}: master 种子链推进分歧`).toBe((a.scanner as unknown as { random: FastRandom }).random.getSeed());
}

describe('light-wasm:scan 核位级金标(JS 核 vs WASM 核+JS 尾段)', () => {
  it('特征世界 64×48(全 case 类:火把 24 档/蜡烛族/特例 switch 高发/液体四类/玻璃墙/发光墙/涂装/半砖坡面/裂纹/圣诞灯回溯/水母笼)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);   // 钉深水微光档(swa=1)
    await abScan('特征世界', SW, SH, buildScanFeatureWorld, {}, 0, 0, 'night');
  });

  it('FlickerClock 活跃三态(disco 中相/demon 极值/mouseTextColor 端点/tve 非零)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    await abScan('时钟night', SW, SH, buildScanFeatureWorld, {}, 0, 0, 'night');
    await abScan('时钟day', SW, SH, buildScanFeatureWorld, { isDay: true, timeOfDay: 0.5 }, 0, 0, 'day');
    await abScan('时钟mid', SW, SH, buildScanFeatureWorld, {}, 0, 0, 'mid');
  });

  it('specialTileLight 密集区(蜡烛/灯笼/篝火满铺;localRand 案 26/37/125/149/215/405/327/519/592/717/718)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    const buildDense = (): TileStore => {
      const st = new TileStore(48, 40);
      const candle = bySheet(33), lantern = bySheet(42), fire = bySheet(215), lamp = bySheet(100);
      for (let y = 4; y < 36; y += 3) {
        for (let x = 2; x < 46; x += 4) {
          const kind = (x + y) % 4;
          st.setTile(x, y, kind === 0 ? candle : kind === 1 ? lantern : kind === 2 ? fire : lamp,
            0, (x * 7 + y * 13) % 6 * 22);
          st.wall[st.idx(x, y)] = 1;
        }
      }
      // gb-override 水晶球泡水(③b→④ 序敏感面)
      const cb = bySheet(125);
      st.setTile(20, 20, cb, 0, 0);
      st.liquid[st.idx(20, 20)] = 255; st.liquidType[st.idx(20, 20)] = 1;
      const cb2 = bySheet(125);
      st.setTile(26, 26, cb2, 0, 0);
      st.liquid[st.idx(26, 26)] = 255; st.liquidType[st.idx(26, 26)] = 2;   // 岩浆+特例格
      return st;
    };
    await abScan('特例密集', 48, 40, buildDense, { groundLevel: 18, lavaLine: 38 }, 0, 0, 'mid');
  });

  it('游戏形世界(buildGameWorld 复用:水/岩浆/实心/玻璃/火把阵)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    await abScan('游戏形scan', 181, 129, () => buildGameWorld(181, 129, 60, 100), { groundLevel: 60, lavaLine: 100 }, 0, 0, 'night');
  });

  it('世界边缘折叠三态:左上角(0,0)/右下角(区域贴世界右下缘)/内部(rx>0,wx0>0 窗口路径)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    await abScan('折叠左上', SW, SH, buildScanFeatureWorld, {}, 0, 0, 'night');
    // 大世界(96×80)+ 64×48 区域贴右下缘(rx+rw=W, ry+rh=H)
    await abScan('折叠右下', 64, 48, () => buildGameWorld(96, 80, 40, 70),
      { groundLevel: 40, lavaLine: 70 }, 96 - 64, 80 - 48, 'night');
    // 内部区域(wx0=rx-1>0 → 窗口路径+hash 锚非零)
    await abScan('折叠内部', 64, 48, () => buildGameWorld(96, 80, 40, 70),
      { groundLevel: 40, lavaLine: 70 }, 17, 13, 'mid');
  });

  it('微光域态(shimmerDarken>0 → dk<1 天光渐灭乘区)', async () => {
    for (let k = 0; k < 60; k++) updateLightDecay(13, false, false, false, { inShimmer: true });
    await abScan('微光域', SW, SH, buildScanFeatureWorld, {}, 0, 0, 'night');
    for (let k = 0; k < 80; k++) updateLightDecay(6, false);   // 还原中性(后续测试不受累)
  });

  it('浮点边界参数:timeOfDay=NaN(skySeed 链 NaN 传播)/mouseTextColor NaN(岩浆/微光发射 NaN)——比较语义 NaN>x 恒 false 两侧同', async () => {
    updateLightDecay(13, false);
    const mkNaNClock = (): ScannerWorld => {
      const w = makeScanWorld(buildScanFeatureWorld(), {});
      (w.clock as { timeOfDay: number }).timeOfDay = NaN;
      return w;
    };
    const mkNaNArm = (): { sc: TileLightScanner; map: LightMap; w: ScannerWorld } => {
      const sc = new TileLightScanner(makeScanFlicker('night'));
      (sc as unknown as { random: FastRandom }).random = new FastRandom(0x9e3779b9);
      const fk = makeScanFlicker('night');
      (fk as unknown as { mouseTextColor: number }).mouseTextColor = NaN;   // 岩浆/微光/闪烁系 NaN
      (sc as unknown as { flicker: FlickerClock }).flicker = fk;
      const map = new LightMap(); map.setSize(SW, SH); map.nonVisiblePadding = 18;
      return { sc, map, w: mkNaNClock() };
    };
    // hourly NaN 不入臂:case 719 RAINBOW_CLOUD_719[NaN%14]=undefined 系 JS 核既有
    // 不可入参面(两臂同崩,非 scan 核行为差)——NaN 域走 timeOfDay/mouseTextColor。
    __setLightWasmFlagForTest(false);
    const a = mkNaNArm();
    a.sc.exportTo(a.w, a.map, 0, 0, []);
    __setLightWasmFlagForTest(true);
    const b = mkNaNArm();
    const runsBefore = __lightWasmStats.scanRuns;
    b.sc.exportTo(b.w, b.map, 0, 0, []);
    expect(__lightWasmStats.scanRuns).toBe(runsBefore + 1);
    __setLightWasmFlagForTest(null);
    expectBitEqual(a.map.r, b.map.r, 'NaN参数 R');
    expectBitEqual(a.map.g, b.map.g, 'NaN参数 G');
    expectBitEqual(a.map.b, b.map.b, 'NaN参数 B');
    expectMaskEqual(a.map.mask, b.map.mask, 'NaN参数 mask');
  });

  it('worker 切片 rebase+hashOrigin:切片窗扫描 ≡ 全量 store 扫描(重叠面逐位;与 JS 尾段 localRandom shim 同锚)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    __setLightWasmFlagForTest(true);
    const W = 96, H = 80, GROUND = 30, LAVA = 70;
    const rx = 40, ry = 30, rw = 32, rh = 24;
    const mk = () => buildScanFeatureWorld;   // 64×48 世界不足以容纳 → 用大世界:
    void mk;
    // 全量臂
    const buildBig = (): TileStore => {
      const st = new TileStore(W, H);
      const dirt = bySheet(0), stone = bySheet(1), torch = bySheet(4), glass = bySheet(54), candle = bySheet(33);
      for (let x = 0; x < W; x++) {
        for (let y = GROUND; y <= GROUND + 4; y++) st.setTile(x, y, dirt);
        for (let y = GROUND + 20; y <= GROUND + 26; y++) st.setTile(x, y, stone);
        for (let y = LAVA + 2; y < H; y++) st.setTile(x, y, stone);
        for (let y = GROUND + 6; y < H; y++) st.wall[st.idx(x, y)] = 1;
      }
      for (let x = 4; x < W; x += 11) st.setTile(x, GROUND - 1, torch, 0, (x % 5) * 22);
      for (let x = 8; x < 28; x++) st.setTile(x, GROUND - 2, glass);
      for (let x = 32; x < 72; x++) for (let y = GROUND - 3; y < GROUND; y++) { st.liquid[st.idx(x, y)] = 255; st.liquidType[st.idx(x, y)] = 1; }
      for (let x = 0; x < W; x++) for (let y = LAVA; y < LAVA + 2; y++) { st.liquid[st.idx(x, y)] = 255; st.liquidType[st.idx(x, y)] = 2; }
      for (let i = 0; i < 8; i++) st.setTile(10 + i * 9, GROUND - 4, candle, 0, (i % 6) * 22);
      return st;
    };
    // 臂 1:全量 store 直接扫描 (rx,ry)
    const stA = buildBig();
    const scA = new TileLightScanner(makeScanFlicker('mid'));
    (scA as unknown as { random: FastRandom }).random = new FastRandom(0x5eed);
    const mapA = new LightMap(); mapA.setSize(rw, rh); mapA.nonVisiblePadding = 6;
    scA.exportTo(makeScanWorld(stA, { groundLevel: GROUND, lavaLine: LAVA }), mapA, rx, ry, SCAN_PER_FRAME.map((l) => ({ ...l })));
    // 臂 2:切片 store(pad 16 窗)+ hashOrigin(rebase 世界标量/点光)
    const pad = 16;
    const sx = Math.max(0, rx - pad), sy = Math.max(0, ry - pad);
    const sw = Math.min(W, rx + rw + pad) - sx, sh = Math.min(H, ry + rh + pad) - sy;
    const stB = new TileStore(sw, sh);
    const st0 = stA;
    const chans: Array<keyof TileStore & ('type' | 'flags' | 'frameX' | 'frameY' | 'wall' | 'liquid' | 'liquidType' | 'half' | 'slope' | 'wire' | 'paint' | 'paintWall' | 'coat')> = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'];
    for (const k of chans) {
      const src = st0[k] as Uint16Array | Uint8Array, dst = stB[k] as Uint16Array | Uint8Array;
      for (let y = 0; y < sh; y++) {
        const s = (sy + y) * W + sx;
        dst.set(src.subarray(s, s + sw), y * sw);
      }
    }
    const scB = new TileLightScanner(makeScanFlicker('mid'));
    (scB as unknown as { random: FastRandom }).random = new FastRandom(0x5eed);
    // worker 同款 shim(LightWorkerProtocol.installClockShims):坐标平移还原绝对世界
    const fkB = (scB as unknown as { flicker: FlickerClock }).flicker;
    const baseShimmer = fkB.shimmerBaseColor;
    fkB.shimmerBaseColor = (x: number, y: number) => baseShimmer.call(fkB, x + sx, y + sy);
    const origLR = (scB as unknown as { localRandom: (x: number, y: number) => unknown }).localRandom.bind(scB);
    (scB as unknown as { localRandom: (x: number, y: number) => unknown }).localRandom =
      (x: number, y: number) => origLR(x + sx, y + sy);
    const mapB = new LightMap(); mapB.setSize(rw, rh); mapB.nonVisiblePadding = 6;
    scB.exportTo(
      makeScanWorld(stB, { groundLevel: GROUND - sy, lavaLine: LAVA - sy, hashOrigin: { x: sx, y: sy } }),
      mapB, rx - sx, ry - sy,
      SCAN_PER_FRAME.map((l) => ({ ...l, x: l.x - sx, y: l.y - sy })));
    __setLightWasmFlagForTest(null);
    expectBitEqual(mapA.r, mapB.r, '切片rebase R');
    expectBitEqual(mapA.g, mapB.g, '切片rebase G');
    expectBitEqual(mapA.b, mapB.b, '切片rebase B');
    expectMaskEqual(mapA.mask, mapB.mask, '切片rebase mask');
  });

  it('RNG 链专项:同初种双 scanner 连续 3 次 exportTo 逐位且种子链推进逐位(每调用恰一步 reseed)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    __setLightWasmFlagForTest(true);
    const mk = () => {
      const sc = new TileLightScanner(makeScanFlicker('night'));
      (sc as unknown as { random: FastRandom }).random = new FastRandom(0xbeef7);
      const m = new LightMap(); m.setSize(48, 32); m.nonVisiblePadding = 6;
      return { sc, m, w: makeScanWorld(buildScanFeatureWorld(), {}) };
    };
    const a = mk(), b = mk();
    const seedsA: number[] = [], seedsB: number[] = [];
    for (let k = 0; k < 3; k++) {
      a.sc.exportTo(a.w, a.m, 0, 0, []);
      b.sc.exportTo(b.w, b.m, 0, 0, []);
      expectBitEqual(a.m.r, b.m.r, `RNG链${k} R`);
      expectBitEqual(a.m.g, b.m.g, `RNG链${k} G`);
      expectBitEqual(a.m.b, b.m.b, `RNG链${k} B`);
      seedsA.push((a.sc as unknown as { random: FastRandom }).random.getSeed());
      seedsB.push((b.sc as unknown as { random: FastRandom }).random.getSeed());
    }
    __setLightWasmFlagForTest(null);
    expect(seedsA).toEqual(seedsB);
    expect(new Set(seedsA).size, '种子链必须逐步推进(每 exportTo 恰一步)').toBe(3);
  });
});

describe('light-wasm:scan 核回退锁(fail-closed)', () => {
  it('旗关:scanRuns 不增,JS 路径照常', async () => {
    updateLightDecay(13, false);
    __setLightWasmFlagForTest(false);
    const sc = new TileLightScanner(makeScanFlicker('night'));
    const m = new LightMap(); m.setSize(32, 24); m.nonVisiblePadding = 4;
    const runs = __lightWasmStats.scanRuns;
    sc.exportTo(makeScanWorld(buildScanFeatureWorld(), {}), m, 0, 0, []);
    expect(__lightWasmStats.scanRuns).toBe(runs);
    __setLightWasmFlagForTest(null);
  });

  it('强置不可用:scan 静默落回 JS 逐位', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    __setLightWasmFlagForTest(true);
    __setLightWasmUnavailableForTest(true);
    const mk = () => {
      const sc = new TileLightScanner(makeScanFlicker('night'));
      (sc as unknown as { random: FastRandom }).random = new FastRandom(0x77);
      const m = new LightMap(); m.setSize(SW, SH); m.nonVisiblePadding = 18;
      return { sc, m };
    };
    const a = mk(); a.sc.exportTo(makeScanWorld(buildScanFeatureWorld(), {}), a.m, 0, 0, []);
    const b = mk(); b.sc.exportTo(makeScanWorld(buildScanFeatureWorld(), {}), b.m, 0, 0, []);
    __setLightWasmUnavailableForTest(null);
    __setLightWasmFlagForTest(null);
    expectBitEqual(a.m.r, b.m.r, 'scan强置不可用 R');
    expectBitEqual(a.m.g, b.m.g, 'scan强置不可用 G');
    expectBitEqual(a.m.b, b.m.b, 'scan强置不可用 B');
    expectMaskEqual(a.m.mask, b.m.mask, 'scan强置不可用 mask');
  });

  it('超容量拒(map > 2^18 格):scanRefusals 计数,调用方落回 JS', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    __setLightWasmFlagForTest(true);
    __resetLightWasmForTest();
    expect(await ensureLightWasm()).toBe(true);
    const refusals = __lightWasmStats.scanRefusals;
    const W = 1 << 9, H = (1 << 18) / W + 1;   // 512×513 = 262656 > 262144
    const sc = new TileLightScanner(makeScanFlicker('night'));
    const m = new LightMap(); m.setSize(W, H); m.nonVisiblePadding = 4;
    const st = new TileStore(W, H);
    sc.exportTo(makeScanWorld(st, { groundLevel: 10, lavaLine: H - 2 }), m, 0, 0, []);
    expect(__lightWasmStats.scanRefusals).toBe(refusals + 1);
    __setLightWasmFlagForTest(null);
  });
});

describe('light-wasm:scan 核性能(min-of-N 口径;位级归 golden/位级锁)', () => {
  it('exportTo JS vs WASM(1080p 181×129 与 zoom-out 303×201 双口径)', async () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    const bench = (tag: string, W: number, H: number, GROUND: number, LAVA: number): void => {
      const run = (): number => {
        const sc = new TileLightScanner(makeScanFlicker('night'));
        (sc as unknown as { random: FastRandom }).random = new FastRandom(0x9e3779b9);
        const m = new LightMap(); m.setSize(W, H); m.nonVisiblePadding = 18;
        const world = makeScanWorld(buildGameWorld(W, H, GROUND, LAVA), { groundLevel: GROUND, lavaLine: LAVA });
        for (let k = 0; k < 6; k++) sc.exportTo(world, m, 0, 0, []);   // 预热
        let best = Infinity;
        for (let k = 0; k < 40; k++) {
          const t = performance.now();
          sc.exportTo(world, m, 0, 0, []);
          const dt = performance.now() - t;
          if (dt < best) best = dt;
        }
        return best;
      };
      const sc2 = new TileLightScanner(makeScanFlicker('night'));
      (sc2 as unknown as { random: FastRandom }).random = new FastRandom(0x9e3779b9);
      __setLightWasmFlagForTest(false);
      const js = run();
      __setLightWasmFlagForTest(true);
      const was = run();
      // 三段总账(WASM 态):scan + blur + present(zoom-out 口径判定)
      const world2 = makeScanWorld(buildGameWorld(W, H, GROUND, LAVA), { groundLevel: GROUND, lavaLine: LAVA });
      const m2 = new LightMap(); m2.setSize(W, H); m2.nonVisiblePadding = 18;
      const pub = new Uint8Array(W * H);
      let bestTotal = Infinity;
      for (let k = 0; k < 40; k++) {
        const t = performance.now();
        sc2.exportTo(world2, m2, 0, 0, []);
        m2.blur();
        const scale = 1.2 * 255;
        const ar = m2.r, ag = m2.g, ab = m2.b;
        for (let i = 0; i < pub.length; i++) {
          const vr = ar[i] * scale;
          pub[i] = vr >= 255 ? 255 : vr | 0;
        }
        const dt = performance.now() - t;
        if (dt < bestTotal) bestTotal = dt;
      }
      __setLightWasmFlagForTest(null);
      console.log(`[scan-bench] ${tag}: JS ${js.toFixed(3)}ms → WASM ${was.toFixed(3)}ms (${(js / was).toFixed(2)}×);三段总账(scan+blur+present)=${bestTotal.toFixed(3)}ms`);
      expect(was, `${tag}: WASM scan 回退`).toBeLessThan(js);
    };
    bench('1080p 181x129', 181, 129, 60, 100);
    bench('zoom-out 303x201', 303, 201, 80, 140);
  });
});
