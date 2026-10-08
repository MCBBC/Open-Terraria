// ★C7 fg 复用臂死算跳水——位等锁+回退链锁（2026-10-08;liquid-gl-batch 判例同构）。
// 【定谳面】fg pass(needsPrep=false) 的复位重扫（P1 全窗 store 重读）与 Unguarded
//  P3 的全部写入,在 fg 复用臂命中路径上无消费者（复用臂直读 bg 账重发射后
//  return）——?liqc7=1 命中即跳过,输出【逐位同】。本锁:
//   T1 位等锁:liqc7 on/off 双 run,bg+fg 批捕获段数/键/quad 数/数据字节逐位同
//     （fg 复用重发射=消费 bg 账,跳过死算不改任何发射面）;
//   T2 复用未命中帧锁:溢出帧（bg 段触发环帽→账不录→fgReuse 假）liqc7 on 必须
//     走完整重prep+CPU 回退链——fg drawImage 数与 off 逐位同（回退链不破）;
//   T3 死算真实发生锁:liqc7 off 时 fg 复用臂命中帧不产生 ctx drawImage（复用臂
//     本就零直画）⇒ on 时同样零——两旗同断言（跳过的块若被错误消费者依赖,
//     T1 先红;本条钉直画面）。
// 像素对拍=scripts/_c7-ab.mjs（node 无 GL/canvas,该面探针锁）。
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import {
  drawVanillaLiquids, resetLiquidBatchForFrame, liqC7SetForTest, liqC7,
} from '../src/render/VanillaLiquidRenderer';
import { liqpolishSetForTest } from '../src/render/perfFlags';
import { TILE_DEFS } from '../src/data/tiles';
import type { LiqBatchEmit } from '../src/render/VanillaLiquidRenderer';

// ---------- 测试用 store:湖+瀑布柱+半砖+夹心干格（liquid-render-prepare-cache 同款） ----------
function makeStore(): TileStore {
  const st = new TileStore(120, 80);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  const set = (x: number, y: number, t: number, liquid = 0, lt = 1, half = 0, wall = 0) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = lt;
    st.half[i] = half; st.wall[i] = wall;
  };
  for (let x = 0; x < 120; x++) set(x, 40, dirt);
  for (let x = 20; x <= 60; x++) for (let y = 30; y <= 39; y++) set(x, y, 0, 255, 1);
  for (let y = 20; y <= 39; y++) set(70, y, 0, 255, 1);
  set(70, 19, dirt);
  const halfId = TILE_DEFS.findIndex((d) => d?.key === 'platform');
  set(80, 39, halfId >= 0 ? halfId : 0, 0, 1, 0);
  if (halfId >= 0) { const i = st.idx(80, 39); st.half[i] = 1; }
  set(80, 38, 0, 255, 1);
  return st;
}

/** 大水store:整窗满水（bg 批环 16384 帽溢出用;水 132²=17424 quad>16384） */
function makeBigStore(): TileStore {
  const st = new TileStore(300, 300);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  for (let x = 1; x < 299; x++) set2(st, x, 260, dirt);
  for (let x = 60; x < 195; x++) for (let y = 60; y < 195; y++) set2(st, x, y, 0, 255, 1);
  return st;
  function set2(s: TileStore, x: number, y: number, t: number, liquid = 0, lt = 1) {
    const i = s.idx(x, y);
    s.type[i] = t; s.flags[i] = t ? 1 : 0; s.liquid[i] = liquid; s.liquidType[i] = lt;
  }
}

// ---------- fake atlas（按文件缓存同一对象=texId 跨 run 稳定=键可比） ----------
function makeAtlas(): SpriteAtlas {
  const cache = new Map<string, { width: number; height: number }>();
  return {
    ensureVImage: (file: string) => {
      let t = cache.get(file);
      if (!t) { t = { width: 144, height: 1360 }; cache.set(file, t); }
      return t;
    },
  } as unknown as SpriteAtlas;
}

/** 桩 ctx（liquid-gl-batch 同构;getTransform=identity=轴对齐批门通过） */
function makeCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const stub: Record<PropertyKey, unknown> = {};
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(t, prop) {
      if (prop === '__calls') return calls;
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        calls.push({ op: String(prop), args });
        if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        return undefined;
      };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  };
  return { ctx: new Proxy(stub, handler) as unknown as CanvasRenderingContext2D, calls };
}

interface Cap { img: unknown; key: string; quads: number; data: Float32Array; }
/** bg+fg 同帧驱动（fgReuse 命中面=liqpolish on+bat 在场+无溢出）;返回分段捕获 */
function drawPair(st: TileStore, atlas: SpriteAtlas, token: number):
  { bg: Cap[]; fg: Cap[]; fgCalls: Array<{ op: string; args: unknown[] }> } {
  const bg: Cap[] = []; const fg: Cap[] = [];
  const mkBat = (sink: Cap[]): LiqBatchEmit => ({
    emit(img, key, data, quads) {
      sink.push({ img, key, quads, data: data.slice() });
      return true;
    },
  });
  const { ctx: bgCtx } = makeCtx();
  drawVanillaLiquids(bgCtx, atlas, st, 40, 5, 5, 110, 55, 1000, true, 0, 0,
    undefined, false, undefined, token, null, mkBat(bg), false);
  const fgPair = makeCtx();
  drawVanillaLiquids(fgPair.ctx, atlas, st, 40, 5, 5, 110, 55, 1000, false, 0, 0,
    undefined, false, undefined, token, null, mkBat(fg), false);
  return { bg, fg, fgCalls: fgPair.calls };
}

function capsEqual(a: Cap[], b: Cap[]): string | null {
  if (a.length !== b.length) return `seg count ${a.length} != ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key) return `seg[${i}] key ${a[i].key} != ${b[i].key}`;
    if (a[i].quads !== b[i].quads) return `seg[${i}] quads ${a[i].quads} != ${b[i].quads}`;
    if (a[i].data.length !== b[i].data.length) return `seg[${i}] data len mismatch`;
    for (let k = 0; k < a[i].data.length; k++) {
      if (a[i].data[k] !== b[i].data[k]) return `seg[${i}] data[${k}] ${a[i].data[k]} != ${b[i].data[k]}`;
    }
  }
  return null;
}

beforeAll(() => {
  if (!(globalThis as unknown as { Image?: unknown }).Image) {
    (globalThis as unknown as { Image: unknown }).Image = class {
      src = ''; width = 0; height = 0; complete = false;
      addEventListener() { /* noop */ }
      removeEventListener() { /* noop */ }
    };
  }
});

afterEach(() => {
  liqC7SetForTest(false);
  liqpolishSetForTest(false);
});

describe('★C7 fg 复用臂死算跳水（?liqc7）', () => {
  it('★v9.9 翻正:旗面缺省 true（2026-10-08 转正——A/B diff=0 双分辨率+变异证红+195 回归;语义零变化=无消费者死算移除;?liqc7=0 逃生门）', () => {
    expect(liqC7).toBe(true);
  });

  it('T1 位等锁:liqc7 on/off 双 run,bg/fg 批捕获逐位同（复用臂命中帧）', () => {
    liqpolishSetForTest(true);   // 复用臂门（node 缺省关,测试内点亮）
    const atlas = makeAtlas();
    liqC7SetForTest(false);
    resetLiquidBatchForFrame(-1);
    const off = drawPair(makeStore(), atlas, 101);
    liqC7SetForTest(true);
    resetLiquidBatchForFrame(-1);
    const on = drawPair(makeStore(), atlas, 202);
    // bg 段=刀不触达面,位等复核
    expect(capsEqual(off.bg, on.bg)).toBeNull();
    // fg 段=复用重发射（消费 bg 账）——死算跳过不改发射面
    expect(on.fg.length).toBeGreaterThan(0);   // 复用臂真在走（fg 批非空）
    expect(capsEqual(off.fg, on.fg)).toBeNull();
  });

  it('T2 回退链锁:溢出帧（复用未命中）liqc7 on 仍走完整重prep+CPU 链,fg drawImage 数逐位同', () => {
    liqpolishSetForTest(true);
    const atlas = makeAtlas();
    const fgDrawsOff = (): number => {
      liqC7SetForTest(false);
      resetLiquidBatchForFrame(-1);
      const st = makeBigStore();
      const { ctx: bgCtx } = makeCtx();
      drawVanillaLiquids(bgCtx, atlas, st, 130, 30, 30, 250, 250, 1000, true, 0, 0,
        undefined, false, undefined, 301, null, mkSink(), false);
      const fgPair = makeCtx();
      drawVanillaLiquids(fgPair.ctx, atlas, st, 130, 30, 30, 250, 250, 1000, false, 0, 0,
        undefined, false, undefined, 301, null, mkSink(), false);
      return fgPair.calls.filter((c) => c.op === 'drawImage').length;
    };
    const offN = fgDrawsOff();
    expect(offN).toBeGreaterThan(1000);   // 溢出帧 fg=CPU 逐格回退链真在走
    liqC7SetForTest(true);
    resetLiquidBatchForFrame(-1);
    const st2 = makeBigStore();
    const { ctx: bgCtx2 } = makeCtx();
    drawVanillaLiquids(bgCtx2, atlas, st2, 130, 30, 30, 250, 250, 1000, true, 0, 0,
      undefined, false, undefined, 401, null, mkSink(), false);
    const fgPair2 = makeCtx();
    drawVanillaLiquids(fgPair2.ctx, atlas, st2, 130, 30, 30, 250, 250, 1000, false, 0, 0,
      undefined, false, undefined, 401, null, mkSink(), false);
    const onN = fgPair2.calls.filter((c) => c.op === 'drawImage').length;
    expect(onN).toBe(offN);   // 回退链零变化（溢出帧死算跳水不触发）
  });

  it('T3 直画锁:复用臂命中帧 fg 零 ctx drawImage（on/off 同断言）', () => {
    liqpolishSetForTest(true);
    const atlas = makeAtlas();
    for (const on of [false, true]) {
      liqC7SetForTest(on);
      resetLiquidBatchForFrame(-1);
      const { fgCalls } = drawPair(makeStore(), atlas, on ? 505 : 605);
      const draws = fgCalls.filter((c) => c.op === 'drawImage').length;
      expect(draws).toBe(0);   // 复用臂=纯批重发射,直画零（跳过死算不改此面）
    }
  });

  it('T4 判别锁（变异证红面）:混合可用对（bg 无 bat 账缺席→fg 必须 full 重prep+新鲜发射）on/off 位等', () => {
    // 【判别力】复用臂命中帧 on/off 本就位等（T1;复用数据≡新鲜发射数据）,
    // 对「账缺席帧」无判别力。本锁钉 fg 入口死算跳水的【门】:_bgRunsFrame 缺席
    // 时必须走 full 重prep（复位重扫+P3 重铺）——变异（跳过 ledger 检查）会让
    // fg 主循环吃 bg 残留态（P3 已铺/类型未复位）→ 发射数据变 → 红。
    liqpolishSetForTest(true);
    const atlas = makeAtlas();
    const drawMixed = (token: number): Cap[] => {
      const fg: Cap[] = [];
      const { ctx: bgCtx } = makeCtx();
      drawVanillaLiquids(bgCtx, atlas, makeStore(), 40, 5, 5, 110, 55, 1000, true, 0, 0,
        undefined, false, undefined, token, null, null, false);   // bg 无 bat=账不录
      const fgPair = makeCtx();
      drawVanillaLiquids(fgPair.ctx, atlas, makeStore(), 40, 5, 5, 110, 55, 1000, false, 0, 0,
        undefined, false, undefined, token, null, mkSink2(fg), false);
      return fg;
    };
    liqC7SetForTest(false);
    resetLiquidBatchForFrame(-1);
    const off = drawMixed(707);
    liqC7SetForTest(true);
    resetLiquidBatchForFrame(-1);
    const on = drawMixed(708);
    expect(on.length).toBeGreaterThan(0);   // fg 新鲜发射真在走（主循环批支）
    expect(capsEqual(off, on)).toBeNull();  // 门正确=死算照跑=数据位等
  });
});

/** 溢出测试用批钩（捕获计数,不校验） */
function mkSink(): LiqBatchEmit {
  return { emit() { return true; } };
}
/** T4 捕获批钩 */
function mkSink2(sink: Cap[]): LiqBatchEmit {
  return { emit(img, key, data, quads) { sink.push({ img, key, quads, data: data.slice() }); return true; } };
}
