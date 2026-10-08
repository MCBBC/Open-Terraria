// ★liqp3 主循环矩形数学批量向量化+at() 算术化（2026-10-08 液体核第三刀）——语义红线机械闸:
//  【设备矩形逐位（配准不变式）】+【bg 账终值逐位】。node 同模块实例双臂直比:
//  A 臂=liqp3 关（现行链:逐格 4 次缩放乘加 ex0/ex1/ey0/ey1+at() 调用）;
//  B 臂=liqP3SetForTest(true)（列/行共享 LUT+增量下标+at() 算术化——同表达式换
//  承载机制,LUT 条目=同表达式同操作数构造即证逐位,见 VanillaLiquidRenderer.ts
//  liqp3 旗头注）。
//  判据=【绘制调用序列逐位】（记录桩全参数——P1-P7 任一数组值差或 device 矩形差必改
//  drawImage/fillRect/globalAlpha/setTransform 序列;String(number) 全精度序列化）
//  +【P1-P7 账面快照 23 数组逐位】。
//  ★分数变换臂:stub getTransform 返回 T(1.3,0,0,0.9,7.3,−11.7)——主循环身份变换下
//  手工折算设备矩形（devSX=1.3/devSY=0.9 分数）,共享边 ceil/floor 分区 rounding 全程
//  exercise;identity 臂补整数域。四臂组合覆盖 liqp2 正交性（p2∧p3 同开 vs 单开）。
//  T4 变异判别力:变换 ε 注错 → 序列必失配（红;证明序列对 device 矩形差可观测——
//  LUT 若产出任一不同矩形必被 T1-T3 探到）。
// 运行:npx vitest run tests/liquid-liqp3-rect-parity.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import {
  drawVanillaLiquids, liqP2SetForTest, liqP3SetForTest, __liqPrepSnapshotForTest,
  __liqp3LutForTest,
} from '../src/render/VanillaLiquidRenderer';
import { TILE_DEFS } from '../src/data/tiles';

// ---------- 富 store:湖/瀑布/半砖/坡面/致动/幽灵/岩浆/蜂蜜/墙/世界边缘（liqp2 同景） ----------
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
  for (let x = 0; x < 120; x++) set(x, 40, dirt, 0, 1, 0, x % 3 === 0 ? 1 : 0);
  // 湖（表层 128/满液 255 双值——floor(n·16) 档位覆盖）
  for (let x = 20; x <= 60; x++) for (let y = 30; y <= 39; y++) set(x, y, 0, y === 30 ? 128 : 255, 1);
  // 瀑布柱（P3 拖尾全链）
  for (let y = 20; y <= 39; y++) set(70, y, 0, 255, 1);
  set(70, 19, dirt);
  // 半砖 + 上格水
  const halfId = TILE_DEFS.findIndex((d) => d?.key === 'platform');
  set(80, 39, halfId >= 0 ? halfId : 0, 0, 1, 0);
  if (halfId >= 0) { const i = st.idx(80, 39); st.half[i] = 1; }
  set(80, 38, 0, 255, 1);
  // 坡面 slope1-4
  for (let k = 0; k < 4; k++) { set(88 + k, 39, stone); st.slope[st.idx(88 + k, 39)] = k + 1; }
  // 致动格（wire bit32）/幽灵格
  set(95, 39, dirt);
  st.wire[st.idx(95, 39)] = 32;
  set(97, 39, stone);
  st.flags[st.idx(97, 39)] = 0;
  // 岩浆囊/蜂蜜囊（vt=1/2 → sx/sy 源矩形分档）
  for (let x = 100; x <= 104; x++) for (let y = 36; y <= 39; y++) set(x, y, 0, 255, 2);
  for (let x = 106; x <= 110; x++) for (let y = 36; y <= 39; y++) set(x, y, 0, 255, 3);
  // 夹心干格（P2 sandwich）
  set(50, 28, 0, 0, 1);
  set(50, 27, 0, 255, 1);
  return st;
}

type Tfm = { a: number; b: number; c: number; d: number; e: number; f: number };
const TFRAC: Tfm = { a: 1.3, b: 0, c: 0, d: 0.9, e: 7.3, f: -11.7 };   // 分数折算臂
const TID: Tfm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };               // 整数域臂

// ---------- 桩 ctx:全调用序列记录（名+可序列化实参;getTransform 返回指定变换） ----------
type Seq = string[];
function recordingCtx(tfm: Tfm) {
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
        const m = a as Tfm;
        return `T(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
      }
      return 'obj';
    });
    calls.push(prop + '|' + parts.join(','));
    if (prop === 'getTransform') return { ...tfm };
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

/** 双臂跑同窗同 store（p2/p3 旗组合入参）。token 每臂独立递增保证 needsPrep 重算。
 *  ★node 环境 canvas 桩去能像素（先例:liquid-liqp2-p1-parity.test.ts）→ 红线主判据
 *  =【序列逐位+账面快照逐位】;设备矩形随 drawImage 全参数入序列（devSX/devSY 手工
 *  折算路径=主循环身份变换,分数臂 exercise ceil/floor 分区）。 */
function runBoth(
  st: TileStore, win: [number, number, number, number], tfm: Tfm,
  p2: boolean, p3: boolean,
): [ReturnType<typeof __liqPrepSnapshotForTest>, ReturnType<typeof __liqPrepSnapshotForTest>, Seq, Seq] {
  const [tx0, ty0, tx1, ty1] = win;
  const a = recordingCtx(tfm);
  liqP2SetForTest(p2); liqP3SetForTest(false);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, true, 0, 0,
    undefined, false, undefined, 101);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 101);
  drawVanillaLiquids(a.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 102);   // 跨帧→复位重扫副本
  const snapA = __liqPrepSnapshotForTest();
  const b = recordingCtx(tfm);
  liqP2SetForTest(p2); liqP3SetForTest(p3);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, true, 0, 0,
    undefined, false, undefined, 201);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 201);
  drawVanillaLiquids(b.ctx, mkAtlas(), st, 40, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 202);
  const snapB = __liqPrepSnapshotForTest();
  liqP2SetForTest(false); liqP3SetForTest(false);   // 复位 off 臂（他测不串旗;转正后缺省=开,测试自管旗）
  return [snapA, snapB, a.calls, b.calls];
}

/** 账面逐位比较（全部 23 数组+容量） */
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
      console.error(`[liqp3-parity] 账面失配 ${k}: ${diffs} 处, 首处 idx=${firstDiff} off=${va[firstDiff]} on=${vb[firstDiff]}`);
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

describe('liqp3 矩形数学批量向量化——设备矩形逐位红线', () => {
  it('T1 内区窗×分数变换:p3 off≡on 序列逐位+账面逐位（ceil/floor 分区 rounding 域）', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [5, 5, 100, 55], TFRAC, false, true);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T1b 内区窗×identity 变换:off≡on（整数域补）', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [5, 5, 100, 55], TID, false, true);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T1c liqp2 正交组合:p2∧p3 同开 ≡ p2 单开（灰度叠臂逐位）', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [5, 5, 100, 55], TFRAC, true, true);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T2 越界窗(px0=-3,py0=-3,tx1=130,ty1=85):OOB padding 臂×分数变换 off≡on', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [-3, -3, 130, 85], TFRAC, false, true);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T3 无水窗（纯实心岩层）:off≡on（主循环空转,LUT 建表不产出矩形）', () => {
    const st = makeStore();
    const [sa, sb, seqA, seqB] = runBoth(st, [8, 60, 40, 75], TFRAC, false, true);
    assertSnapEq(sa, sb);
    expect(seqB).toEqual(seqA);
  });

  it('T4 变异判别力:变换 ε 注错 → 序列必失配（device 矩形面可观测性自证）', () => {
    const st = makeStore();
    const [, , , seqBase] = runBoth(st, [5, 5, 100, 55], TFRAC, false, true);
    // 同臂同 store,变换微扰（devSY 0.9→0.94）——设备矩形必漂,序列必红。
    // 证明:drawImage 全参数序列对 dx0/dy0/dw/dh 任一差敏感 ⇒ T1-T3 全等
    // ⇔ liqp3 LUT/算术化产出逐位同矩形（判别力充分）。
    const [, , , seqMut] = runBoth(st, [5, 5, 100, 55], { a: 1.3, b: 0, c: 0, d: 0.94, e: 7.3, f: -11.7 }, false, true);
    expect(seqMut).not.toEqual(seqBase);
  });

  it('T5 rowEy 代数锁:on 臂行表全表=同式重构逐位（py0=ty0−2,ph=ty1−ty0+5 已知域）', () => {
    const st = makeStore();
    const win: [number, number, number, number] = [5, 5, 100, 55];
    runBoth(st, win, TFRAC, false, true);
    // runBoth 末次调用=on 臂 token202（同窗）⇒ _p3RowEy 持该调用建表:
    // rowEy[ly·33+f] = ((py0+ly)·16+f)·devSY+devTF,py0=5−2=3,ph=55−5+1+4=55。
    const lut = __liqp3LutForTest();
    const rowEy = lut.rowEy();
    const py0 = win[1] - 2, ph = win[3] - win[1] + 1 + 4;
    expect(rowEy.length).toBeGreaterThanOrEqual(ph * lut.rc);
    for (let ly = 0; ly < ph; ly += 7) {         // 抽样 8 行（含末行）
      for (const f of [0, 1, 11, 12, 16, 28, 32]) {
        expect(rowEy[ly * lut.rc + f]).toBe(((py0 + ly) * 16 + f) * TFRAC.d + TFRAC.f);
      }
    }
  });
});
