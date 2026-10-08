// ★liqp2 P1 扫描承载面提速（2026-10-08 液体核第二刀）——语义红线机械闸:
//  bg 账终值与全窗重读【逐位一致】。本测试在 node 同模块实例下双臂直比:
//  A 臂=?liqp2 关（现行链:闭包 at/逐格除法/inBounds/idx/liquidCacheIsSolid/
//    tileSolidLut 逐格调用）;B 臂=liqP2SetForTest(true)（LUT+边界外提+增量下标
//    +单形 atM——同表达式换承载机制）。
//  判据=【绘制调用序列逐位一致】:桩 ctx 记录全部方法名+可序列化实参（drawImage
//  全参数/globalAlpha/setTransform/fillRect…）——P1-P7 任何数组值差异必然改变
//  绘制参数序列（液位→源/目标矩形、type→纹理选择、实心→拖尾/边存在）,序列全等
//  = prep 账逐位一致的充分证明。三窗口覆盖:内区窗/越界窗（px0<0/ty1≥world h——
//  OOB padding 臂）/无水窗;双帧序（token 1→2）覆盖 BJ77 复位重扫副本。
//  LC 变异判别力:T4 经 __liqp2LutForTest() 钩改 LUT 条目 → 序列必须失配（红）。
// 运行:npx vitest run tests/liquid-liqp2-p1-parity.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import {
  drawVanillaLiquids, liqP2SetForTest, __liqp2LutForTest, __liqPrepSnapshotForTest,
} from '../src/render/VanillaLiquidRenderer';
import { TILE_DEFS } from '../src/data/tiles';

// ---------- 富	store:湖/瀑布/半砖/坡面/致动/幽灵/岩浆/蜂蜜/墙/世界边缘 ----------
function makeStore(): TileStore {
  const st = new TileStore(120, 80);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  const stone = TILE_DEFS.findIndex((d) => d?.key === 'stone');
  const set = (x: number, y: number, t: number, liquid = 0, lt = 1, half = 0, wall = 0) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = lt;
    st.half[i] = half; st.wall[i] = wall;
  };
  // 地面(y=40 dirt 一层,带墙)
  for (let x = 0; x < 120; x++) set(x, 40, dirt, 0, 1, 0, x % 3 === 0 ? 1 : 0);
  // 湖:x∈[20,60] y∈[30,39] 满水（液位梯度:表层 128/底层 255——非满液位覆盖
  //  LUT 舍入路径;128/255 与 255/255 双值）
  for (let x = 20; x <= 60; x++) for (let y = 30; y <= 39; y++) set(x, y, 0, y === 30 ? 128 : 255, 1);
  // 瀑布柱:x=70 从 y=20 落到 y=39（悬空源→拖尾全链）
  for (let y = 20; y <= 39; y++) set(70, y, 0, 255, 1);
  set(70, 19, dirt);
  // 半砖: x=80,y=39 半砖 + 上格水
  const halfId = TILE_DEFS.findIndex((d) => d?.key === 'platform');
  set(80, 39, halfId >= 0 ? halfId : 0, 0, 1, 0);
  if (halfId >= 0) { const i = st.idx(80, 39); st.half[i] = 1; }
  set(80, 38, 0, 255, 1);
  // 坡面:x=88-91 y=39 stone 带 slope1-4
  for (let k = 0; k < 4; k++) { set(88 + k, 39, stone); st.slope[st.idx(88 + k, 39)] = k + 1; }
  // 致动格:x=95 y=39 dirt + wire bit32（liquidCacheIsSolid 的 !inActive 门）
  set(95, 39, dirt);
  st.wire[st.idx(95, 39)] = 32;
  // 幽灵格:x=97 y=39 type≠0 flags=0（active 门排除）
  set(97, 39, stone);
  st.flags[st.idx(97, 39)] = 0;
  // 岩浆囊:x∈[100,104] y∈[36,39]
  for (let x = 100; x <= 104; x++) for (let y = 36; y <= 39; y++) set(x, y, 0, 255, 2);
  // 蜂蜜囊:x∈[106,110] y∈[36,39]
  for (let x = 106; x <= 110; x++) for (let y = 36; y <= 39; y++) set(x, y, 0, 255, 3);
  // 夹心干格:x=50 y=28（上下水夹——P2 sandwich 分支,湖上方）
  set(50, 28, 0, 0, 1);
  set(50, 27, 0, 255, 1);
  return st;
}

// ---------- 桩 ctx:全调用序列记录（名+可序列化实参）----------
type Seq = string[];
function recordingCtx() {
  const calls: Seq = [];
  const rec = (prop: string) => (...args: unknown[]) => {
    const parts = args.map((a) => {
      if (a === null) return 'null';
      if (a === undefined) return 'u';
      if (typeof a === 'number') return String(a);
      if (typeof a === 'boolean') return a ? '1' : '0';
      if (typeof a === 'string') return a;
      if (Array.isArray(a) || a instanceof Float32Array || a instanceof Float64Array) return 'arr';
      if (typeof a === 'object' && 'a' in (a as object)) {
        const m = a as { a: number; b: number; c: number; d: number; e: number; f: number };
        return `T(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
      }
      return 'obj';
    });
    calls.push(prop + '|' + parts.join(','));
    if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 0, e: 0, f: 0 };
    if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
    return undefined;
  };
  const stub: Record<PropertyKey, unknown> = {};
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(t, prop) {
      if (prop in t) return t[prop];
      return rec(String(prop));
    },
    set(t, prop, v) { t[prop] = v; return true; },
  };
  return { ctx: new Proxy(stub, handler) as unknown as CanvasRenderingContext2D, calls };
}

const mkAtlas = () => ({
  width: 256, height: 1360,
  ensureVImage: () => ({ width: 256, height: 1360 }),
}) as unknown as SpriteAtlas;

/** 双臂跑同窗同 store:返回 [off 账面, on 账面, off 序列, on 序列]（每臂全新桩
 *  ctx;token 每臂独立递增保证 needsPrep 重算——off 先跑后 on,store 只读不变。
 *  ★node 环境 canvas 桩去能主循环绘制（先例:liquid-render-prepare-cache.test.ts
 *  "像素级等价由实机探针兜底"）→ 红线主判据=【P1-P7 账面快照逐位】,序列为辅） */
function runBoth(st: TileStore, win: [number, number, number, number], groundLevel = 40): [ReturnType<typeof __liqPrepSnapshotForTest>, ReturnType<typeof __liqPrepSnapshotForTest>, Seq, Seq] {
  const [tx0, ty0, tx1, ty1] = win;
  const a = recordingCtx();
  liqP2SetForTest(false);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, true, 0, 0,
    undefined, false, undefined, 101);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 101);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 102);   // 跨帧→复位重扫副本（node swPerf 关恒跑）
  const snapA = __liqPrepSnapshotForTest();
  const b = recordingCtx();
  liqP2SetForTest(true);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, true, 0, 0,
    undefined, false, undefined, 201);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 201);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, groundLevel, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 202);
  const snapB = __liqPrepSnapshotForTest();
  liqP2SetForTest(false);   // 还原缺省关（他测不串旗）
  return [snapA, snapB, a.calls, b.calls];
}

/** 账面逐位比较（全部 23 数组+容量）——任一数组任一元素不等即列出差异摘要 */
function assertSnapEq(a: ReturnType<typeof __liqPrepSnapshotForTest>, b: ReturnType<typeof __liqPrepSnapshotForTest>): void {
  expect(b.n).toBe(a.n);
  const keys = ['level', 'visLevel', 'opacity', 'isSolid', 'hasLiquid', 'hasWall', 'hasVis',
    'type', 'visType', 'lW', 'rW', 'bW', 'tW', 'vlW', 'vrW', 'vbW', 'vtW',
    'hasLE', 'hasRE', 'hasTE', 'hasBE', 'isHalf', 'fx', 'fy'] as const;
  for (const k of keys) {
    const va = a[k] as ArrayLike<number>, vb = b[k] as ArrayLike<number>;
    let firstDiff = -1, diffs = 0;
    for (let i = 0; i < va.length; i++) {
      if (va[i] !== vb[i]) { if (firstDiff < 0) firstDiff = i; diffs++; }
    }
    if (diffs > 0) {
      console.error(`[liqp2-parity] 账面失配 ${k}: ${diffs} 处, 首处 idx=${firstDiff} off=${va[firstDiff]} on=${vb[firstDiff]}`);
    }
    expect(diffs).toBe(0);
  }
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

describe('liqp2 P1 承载面提速——bg 账逐位红线', () => {
  it('T1 内区窗:off≡on 账面逐位+序列逐位', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [5, 5, 100, 55]);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T2 越界窗(px0=-3,py0=-3,tx1=130,ty1=85):OOB padding 臂逐位', () => {
    const st = makeStore();
    const [sa, sb] = runBoth(st, [-3, -3, 130, 85]);
    assertSnapEq(sa, sb);
  });

  it('T3 无水窗（纯实心岩层）:off≡on', () => {
    const st = makeStore();
    const [sa, sb] = runBoth(st, [8, 60, 40, 75]);
    assertSnapEq(sa, sb);
  });

  it('T4 变异判别力:level LUT 条目改值→账面必失配（红）', () => {
    const st = makeStore();
    const [sa] = runBoth(st, [5, 5, 100, 55]);
    const lut = __liqp2LutForTest();
    const k128 = lut.lvl[128], k255 = lut.lvl[255];
    lut.lvl[128] = 0.25;   // 表层液位 128 命中档
    lut.lvl[255] = 0.5;    // 满液位档
    try {
      const [, sbMut] = runBoth(st, [5, 5, 100, 55]);
      // 变异必须被探针探到（判别力自证）——level/visLevel 面必漂
      const diffs = sa.level.reduce((s, v, i) => s + (v !== sbMut.level[i] ? 1 : 0), 0)
        + sa.visLevel.reduce((s, v, i) => s + (v !== sbMut.visLevel[i] ? 1 : 0), 0);
      expect(diffs).toBeGreaterThan(0);
    } finally {
      lut.lvl[128] = k128; lut.lvl[255] = k255;   // 还原
    }
  });

  it('T5 atM 单形函数与闭包 at 下标值恒等（lx·ph+ly 全域抽查）', () => {
    // 直接锁 atM 数学区:ph ∈ {65,128,200} × lx,ly 全边界组合
    const lut = __liqp2LutForTest();
    for (const ph of [65, 128, 200]) {
      lut.setPh(ph);
      for (const lx of [0, 1, 62, 129]) for (const ly of [0, 1, 64, 127, 199]) {
        expect(lut.atM(lx, ly)).toBe(lx * ph + ly);
      }
    }
  });
});
