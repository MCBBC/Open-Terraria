// BoulderMech.Check2x2 巨石族移植单测（WorldGen.cs:48811-49232 判定矩阵）
import { describe, expect, it, vi } from 'vitest';
import { checkBoulderFamily } from '../src/world/BoulderMech';
import { TileStore } from '../src/world/TileStore';

/** 内部 id 伪造表：sheet→internal 由消费方注入；此处用 internal==sheet 的恒等假表 */
function mkStore(): Pick<TileStore,
  'inBounds' | 'idx' | 'type' | 'flags' | 'frameX' | 'frameY' | 'half' | 'slope' | 'wire'> {
  const W = 16, H = 16;
  const type = new Uint16Array(W * H);
  const flags = new Uint8Array(W * H);
  const frameX = new Uint16Array(W * H);
  const frameY = new Uint16Array(W * H);
  const half = new Uint8Array(W * H);
  const slope = new Uint8Array(W * H);
  const wire = new Uint8Array(W * H);
  return {
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
    idx: (x: number, y: number) => y * W + x,
    type, flags, frameX, frameY, half, slope, wire,
  };
}

const TILE_DEF_LOOKUP_SHEET_VIA_TID = (tid: number) => ({ vanilla: { sheet: tid } });
void TILE_DEF_LOOKUP_SHEET_VIA_TID;

function fixture(st: ReturnType<typeof mkStore>) {
  // 锚 (6,6)；内部 id 恒等于 sheet（ctx.sheetOfInternal=identity）。
  // 贴图帧按 Check2x2 反推公式生成：frameX=(x-ax)*18+fxo, frameY=(y-ay)*18
  return {
    put4(sheet: number, ax = 6, ay = 6) {
      for (let m = ax; m < ax + 2; m++) {
        for (let n = ay; n < ay + 2; n++) {
          const i = st.idx(m, n);
          st.type[i] = sheet;
          st.flags[i] = 1;   // 活跃位（幽灵保域后 Check2x2 成员判据消费）
          st.frameX[i] = (m - ax) * 18;
          st.frameY[i] = (n - ay) * 18;
        }
      }
    },
    clear(x: number, y: number) { st.type[st.idx(x, y)] = 0; st.flags[st.idx(x, y)] = 0; },
    solidStone(x: number, y: number) {
      st.type[st.idx(x, y)] = 1;   // 1=dirt(assume solid)
      st.flags[st.idx(x, y)] = 1;
    },
    wireBelow() {
      st.wire[st.idx(6, 8)] |= 1;
      st.wire[st.idx(7, 8)] |= 1;
    },
    actuateSupport() {
      st.wire[st.idx(6, 8)] |= 32;   // WIRE_ACTUATED
      st.wire[st.idx(7, 8)] |= 32;
    },
  };
}

function run(st: ReturnType<typeof mkStore>, opts?: { aboveSheet?: number }) {
  const converted: Array<[number, number, number]> = [];
  const killed: Array<[number, number]> = [];
  checkBoulderFamily(st as unknown as Parameters<typeof checkBoulderFamily>[0], 6, 6, {
    sheetOfInternal: (id) => id,
    breakCell: (x, y) => killed.push([x, y]),
    convert: (ax, ay, sheet) => converted.push([ax, ay, sheet]),
  });
  void opts;
  return { converted, killed };
}

describe('BoulderMech（Check2x2 移植）', () => {
  it('下方两格实心 → 不释放', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(138); f.solidStone(6, 8); f.solidStone(7, 8);
    const r = run(st);
    expect(r.converted).toEqual([]);
    expect(r.killed).toEqual([]);
  });

  it('下方两格全空 → 摧毁四格并 convert(138→proj99/dmg70)', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(138);
    const r = run(st);
    expect(r.killed.length).toBe(4);
    expect(new Set(r.killed.map((k) => k.join(',')))).toEqual(new Set(['6,6', '7,6', '6,7', '7,7']));
    expect(r.converted).toEqual([[6, 6, 138]]);
  });

  it('仅一格空、另一格实心 → 有支撑不释放（要求两格全非实心）', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(138); f.solidStone(7, 8);   // 左下空、右下实心
    const r = run(st);
    expect(r.converted.length).toBe(0);
  });

  it('上方有箱族(467) → 庇护不释放（cs:48980 黑名单）', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(138);
    for (const [ax] of [[6], [7]]) {
      const i = st.idx(ax, 5);
      st.type[i] = 467;
      st.flags[i] = 1;
      st.frameX[i] = (ax - 6) * 18;
      st.frameY[i] = 0;
    }
    const r = run(st);
    expect(r.converted).toEqual([]);
  });

  it('致动(inActive)支撑即释放——R20-I4 翻案位', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(138); f.solidStone(6, 8); f.solidStone(7, 8); f.actuateSupport();
    const r = run(st);
    expect(r.converted).toEqual([[6, 6, 138]]);
  });

  it('非家族类型直通忽略', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(2);   // 非家族
    const r = run(st);
    expect(r.converted).toEqual([]);
    expect(r.killed).toEqual([]);
  });

  it('654 表行取 dmg400 / proj1002（出生偏移特例由 Game 侧处理）', () => {
    const st = mkStore();
    const f = fixture(st);
    f.put4(654);
    const r = run(st);
    expect(r.converted[0][2]).toBe(654);
  });

  it('vi 反复进入 destroy 熔断不可重入（单次调用内 breakCell 触发不再级联 self-check）', async () => {
    // _destroying 熔断是模块级：这里仅验证同调用里杀格后 convert 只发生一次
    const st = mkStore();
    const f = fixture(st);
    f.put4(484);
    const spyConvert = vi.fn(() => {});
    const killed: Array<[number, number]> = [];
    checkBoulderFamily(st as unknown as Parameters<typeof checkBoulderFamily>[0], 6, 6, {
      sheetOfInternal: (id) => id,
      breakCell: (x, y) => killed.push([x, y]),
      convert: (...a) => { spyConvert(...a); },
    });
    expect(killed.length).toBe(4);
    expect(spyConvert).toHaveBeenCalledTimes(1);
  });
});
