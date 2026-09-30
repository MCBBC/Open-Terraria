// ★BJ427 液体 P3 瀑布拖尾带露进屏底（2026-10-01 用户实报"岩浆渲染三症状"定谳刀）：
//  ①屏幕底部越贴近岩浆,岩浆底部逐层半透 ②右侧液面比实际高两格 ③角色往下站一点恢复。
// 【机制（反编译 1457 逐行定谳）】LiquidRenderer P3 瀑布拖尾循环界 n < rectangle.Height-10
//  （LiquidRenderer.cs:250-285;本仓 P3 `ly <= min(by1, ph-11)` 同构）——最后处理行
//  L = 窗底 ty1-8;L+1..L+WATERFALL_LENGTH[Type] 收 opacity k=1-s/(len+1) <1 且
//  【永不自纠】（P3 不再到达这些行;满液格 hasVisA 已由 P2 置位 → 照画半透）。
//  原版同带被绘制窗深度掩蔽：GetScreenDrawArea（TileDrawing.cs:6661-6669）
//  lastTileY = (屏底px + offScreenRange)/16 + 5（offScreenRange=200=12.5 格,Main.cs:840）
//  → 带落屏底下方 10-12 格,永不可见。本仓 BJ317 窗底仅 +5 → 带顶三行 ty1-7..ty1-5
//  = 屏底 sB-2..sB：
//    k=0.75/0.5/0.25（岩浆 len=3）×bg 不透明 + fg×0.95 → 复合覆盖 0.84/0.73/0.42
//    = 症状①"逐层半透"（探针 _bj427-lava-band.mjs 实测 0.80-0.83/0.66-0.69 两阶);
//    0.25 行近隐形 → 可见岩浆边界比实际高约 2 格 = 症状②（箭头示屏底右缘);
//    相机下移 → 池底升出屏底带区 → 恢复 = 症状③（探针机位扫描 off=+4 全恢复）。
//  蜂蜜 len=2（k=2/3,1/3）、水 len=10（k=10/11,9/11,8/11）同病（用户"蜂蜜等同病"实)。
// 【刀】liquidDrawWindow 底缘 +5 → +5+LIQUID_WINDOW_MARGIN=9（掩蔽需求 ≥8:ty1-7>sB;
//  = 原版 offScreenRange 各向等深结构）;DEFAULT_OPACITY {0.5,0.9,0.8} → 1457 终值
//  {0.6,0.95,0.95}（LiquidRenderer.cs:108;旧值系误抄复古路 oldDrawWater Main.cs:58528）。
//  本测试四锁：①旧窗底机制锁（拖尾 k 钉值）②修复面（真实窗全可见行 alpha=满,带出屏）
//  ③相机扫描面（off=0..6 全绿=症状③消除）④1457 前景基色面（三液体型钉值）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawVanillaLiquids, liquidDrawWindow, LIQUID_WINDOW_MARGIN, __resetLiquidAnimForTest } from '../src/render/VanillaLiquidRenderer';
import { TILE_DEFS } from '../src/data/tiles';
import { pinGameTimeTicks } from '../src/core/GameTime';

// 深岩浆池：x∈[20,60] 满液 255,行 30..45（16 行深）,地面 y=46;池延伸到窗底之下。
function makeStore(lt: number): TileStore {
  const st = new TileStore(120, 80);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  const set = (x: number, y: number, t: number, liquid = 0, ltype = 1) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = ltype;
  };
  for (let x = 0; x < 120; x++) set(x, 46, dirt);
  for (let x = 20; x <= 60; x++) for (let y = 30; y <= 45; y++) set(x, y, 0, 255, lt);
  return st;
}

interface BodyRec { alpha: number; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }

/** 桩 ctx（记录 drawImage 时 globalAlpha）+ 桩 atlas。 */
function drawRecs(st: TileStore, tx0: number, ty0: number, tx1: number, ty1: number,
  isBackground: boolean, token: number): BodyRec[] {
  const recs: BodyRec[] = [];
  let curAlpha = 1;
  const stub: Record<PropertyKey, unknown> = {};
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        if (prop === 'drawImage') {
          recs.push({ alpha: curAlpha, sx: args[1] as number, sy: args[2] as number,
            sw: args[3] as number, sh: args[4] as number, dx: args[5] as number, dy: args[6] as number });
        }
        if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(t, prop, v) { if (prop === 'globalAlpha') { curAlpha = v as number; return true; } t[prop] = v; return true; },
  };
  const ctx = new Proxy(stub, handler) as unknown as CanvasRenderingContext2D;
  const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 48, height: 1360 }) } as unknown as SpriteAtlas;
  __resetLiquidAnimForTest();
  pinGameTimeTicks(62);
  drawVanillaLiquids(ctx, atlas, st, 40, tx0, ty0, tx1, ty1, 1000, isBackground, 0, 0,
    undefined, false, undefined, token);
  return recs;
}

/** 池心列 x=40 的行→alpha 表（浸润带/其它列排除:恒等变换 dx=x×16）。 */
function alphaByRow(recs: BodyRec[], x = 40): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of recs) {
    if (Math.floor(r.dx / 16) !== x) continue;
    m.set(Math.floor(r.dy / 16), r.alpha);
  }
  return m;
}

// sB（屏底 tile）= 42;旧窗底 = sB+5（BJ317 前本仓形态）;池延伸到 45（> sB-3=39=L）。
const SB = 42;
const OLD_TY1 = SB + 5;

describe('BJ427 液体 P3 拖尾带屏底露病（窗缘处理对齐）', () => {
  it('①机制锁（旧窗底 +5）：最后处理行 L=sB-3 之下三行 opacity=0.75/0.5/0.25 永不自纠（岩浆 len=3,k=1-s/4）', () => {
    const st = makeStore(2);   // 岩浆（toVanillaType 2→1）
    const m = alphaByRow(drawRecs(st, 10, 20, 70, OLD_TY1, true, 701));
    // L = ty1-8 = 39：以下行全被 P3 处理 → opacity 1
    for (let y = 30; y <= 39; y++) expect(m.get(y), `row ${y}`).toBe(1);
    // 带三行 = 屏底 sB-2..sB（用户症状①"逐层半透"）——vanilla 拖尾 k 钉值
    //  （LiquidRenderer.cs:259-270 num4 -= num3,k 写 Opacity;最后写入者=L 行 s=1..3）
    expect(m.get(40)).toBeCloseTo(0.75, 12);
    expect(m.get(41)).toBeCloseTo(0.5, 12);
    expect(m.get(42)).toBeCloseTo(0.25, 12);
    // 带下（43-45,屏外）:未被写入未被自纠 → 初始 1（opacity fill(1) 语义）
    for (let y = 43; y <= 45; y++) expect(m.get(y), `row ${y}`).toBe(1);
  });

  it('②修复面（真实窗 liquidDrawWindow）：全可见行（≤sB）alpha=1,拖尾带整体出屏（>sB）', () => {
    const st = makeStore(2);
    // 相机：屏底 px = sB×16（sB=42）,camX 对准池心 640
    const camX = 640, camY = SB * 16 - 400;
    const [tx0, ty0, tx1, ty1] = liquidDrawWindow(camX, camY, 1280, 800, 1, 120, 80);
    expect(ty1).toBe(SB + 5 + LIQUID_WINDOW_MARGIN);   // 底缘 = +5+MARGIN=9
    const m = alphaByRow(drawRecs(st, tx0, ty0, tx1, ty1, true, 702));
    for (let y = 30; y <= SB; y++) expect(m.get(y), `可见行 ${y} 须全不透明`).toBe(1);
    // 带（若画出）全部 > sB（屏外）:L=ty1-8=sB+1,带=sB+2..sB+4
    for (const [y, a] of m) {
      if (a < 1) expect(y, `alpha<1 行 ${y} 须在屏外`).toBeGreaterThan(SB);
    }
    // 带钉值仍在（机制未被第二刀污染）:sB+2=0.75、sB+3=0.5、sB+4=0.25
    expect(m.get(SB + 2)).toBeCloseTo(0.75, 12);
    expect(m.get(SB + 3)).toBeCloseTo(0.5, 12);
  });

  it('③相机扫描面（症状③消除）：camY 下移 0..+6 格逐机位,全可见行 alpha=1', () => {
    for (let off = 0; off <= 6; off++) {
      const sB = SB + off;
      const camX = 640, camY = sB * 16 - 400;
      const [tx0, ty0, tx1, ty1] = liquidDrawWindow(camX, camY, 1280, 800, 1, 120, 80);
      const m = alphaByRow(drawRecs(st0(), tx0, ty0, tx1, ty1, true, 703 + off));
      for (let y = 30; y <= Math.min(sB, 45); y++) {
        expect(m.get(y), `off=${off} 可见行 ${y}`).toBe(1);
      }
    }
  });

  it('④液体族同病面（旧窗底）：水 len=10 k=1-s/11、蜜 len=2 k=1-s/3——用户"蜂蜜等同病"实', () => {
    const w = alphaByRow(drawRecs(makeStore(1), 10, 20, 70, OLD_TY1, true, 710));
    // ★opacity 池 = Float32Array → k 经 f32 量化（Math.fround 钉值）
    expect(w.get(40)).toBeCloseTo(Math.fround(1 - 1 / 11), 12);
    expect(w.get(41)).toBeCloseTo(Math.fround(1 - 2 / 11), 12);
    expect(w.get(42)).toBeCloseTo(Math.fround(1 - 3 / 11), 12);
    const h = alphaByRow(drawRecs(makeStore(3), 10, 20, 70, OLD_TY1, true, 711));
    expect(h.get(40)).toBeCloseTo(Math.fround(1 - 1 / 3), 12);
    expect(h.get(41)).toBeCloseTo(Math.fround(1 - 2 / 3), 12);
  });

  it('⑤1457 前景基色面：DEFAULT_OPACITY 终值 {水0.6,岩浆0.95,蜜0.95}（LiquidRenderer.cs:108）', () => {
    // 旧值 {0.5,0.9,0.8} 系误抄复古路 oldDrawWater（Main.cs:58528 num17=0.5f,仅
    //  NotRetro=false 才走）;本仓管线=DrawNormalLiquids（:650 Opacity×DEFAULT_OPACITY）。
    expect(alphaByRow(drawRecs(makeStore(1), 10, 20, 70, OLD_TY1, false, 720)).get(35)).toBe(0.6);
    expect(alphaByRow(drawRecs(makeStore(2), 10, 20, 70, OLD_TY1, false, 721)).get(35)).toBe(0.95);
    expect(alphaByRow(drawRecs(makeStore(3), 10, 20, 70, OLD_TY1, false, 722)).get(35)).toBe(0.95);
  });
});

function st0(): TileStore { return makeStore(2); }
