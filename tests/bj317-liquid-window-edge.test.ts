// ★BJ317 液体绘制窗边界采样判别面（2026-09-23 用户实报"水贴屏幕边缘被渲染成瀑布
// 下流样式,内移即恢复"定谳）：
//  【机制】LiquidRenderer P2 可见液位只跑内窗（vanilla LiquidRenderer.cs k∈[2,W-2)），
//   ±2 pad 列 hasVisA 恒假 → 内窗边缘水格的窗外邻格被当"无可见液体"→ P4 误置
//   HasLeft/Right/TopEdge → 误用边缘变体带（sx=0/32 侧柱纹理;表面格丢 srcY=1280）。
//   ★该管线级误判原版同样存在（pad 收敛为假=原版语义），原版靠 GetScreenDrawArea
//   绘制窗外扩 offScreenRange/16=12.5 格把它推到屏外（TileDrawing.cs:6661）。
//  【修】本仓 Renderer.drawLiquids 窗口走 liquidDrawWindow 单源：左/右/上外扩
//   LIQUID_WINDOW_MARGIN=4 格（底缘沿用原版 +5）→ 伪影列/行出屏。
//  三面：①窗口纯函数（margin/世界钳/缩放）②管线机制锁（伪影恰限于窗口边缘 1 列,
//   与原版管线 1:1；内移 1 格即恢复原带）③修复面（窗缘外扩 ≥1 格出屏）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawVanillaLiquids, liquidDrawWindow, LIQUID_WINDOW_MARGIN } from '../src/render/VanillaLiquidRenderer';
import { TILE_DEFS } from '../src/data/tiles';

// ---------- store：宽湖（x∈[20,60] y∈[30,39] 满水 255）+ 地面 y=40 ----------
function makeStore(): TileStore {
  const st = new TileStore(120, 80);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  const set = (x: number, y: number, t: number, liquid = 0, lt = 1) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = lt;
  };
  for (let x = 0; x < 120; x++) set(x, 40, dirt);
  for (let x = 20; x <= 60; x++) for (let y = 30; y <= 39; y++) set(x, y, 0, 255, 1);
  return st;
}

interface BodyRec { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** 桩 ctx（记录 drawImage 全参）+ 桩 atlas（48×1360 全带可画）。 */
function drawRecs(st: TileStore, tx0: number, ty0: number, tx1: number, ty1: number): BodyRec[] {
  const recs: BodyRec[] = [];
  const stub: Record<PropertyKey, unknown> = {};
  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        if (prop === 'drawImage') {
          recs.push({ sx: args[1] as number, sy: args[2] as number, sw: args[3] as number,
            sh: args[4] as number, dx: args[5] as number, dy: args[6] as number,
            dw: args[7] as number, dh: args[8] as number });
        }
        if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  };
  const ctx = new Proxy(stub, handler) as unknown as CanvasRenderingContext2D;
  const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 48, height: 1360 }) } as unknown as SpriteAtlas;
  // nowMs=1000：animFrame=floor(1×(0×25+6))%16=6、waterfallFrame=floor(0.5)%16=0（确定性）
  drawVanillaLiquids(ctx, atlas, st, 40, tx0, ty0, tx1, ty1, 1000, false, 0, 0,
    undefined, false, undefined, 7);
  return recs;
}

/** 记录 → tile 键表（恒等变换下 dx=dstX+floor(n2×16)，湖心格 n2=0 → dx=x×16）。 */
function byTile(recs: BodyRec[]): Map<string, BodyRec> {
  const m = new Map<string, BodyRec>();
  for (const r of recs) m.set(`${Math.floor(r.dx / 16)},${Math.floor(r.dy / 16)}`, r);
  return m;
}

describe('BJ317 液体绘制窗边界采样', () => {
  it('①窗口纯函数：左/右/上外扩 MARGIN=4、下缘 +5、缩放无关、世界钳', () => {
    // 屏左 tile=1960、屏右=2040、屏顶=225、屏底=280（z=1）
    const w = liquidDrawWindow(32000, 4000, 1280, 800, 1, 4200, 1200);
    expect(w).toEqual([1960 - LIQUID_WINDOW_MARGIN, 225 - LIQUID_WINDOW_MARGIN, 2040 + LIQUID_WINDOW_MARGIN, 280]);
    // z=2：屏幕半宽换算 tile 后 margin 恒 4 格（tile 计量与 zoom 无关）
    const w2 = liquidDrawWindow(32000, 4000, 1280, 800, 2, 4200, 1200);
    expect(w2[0]).toBe(Math.floor((32000 - 1280 / 2 / 2) / 16) - LIQUID_WINDOW_MARGIN);
    // 世界钳：相机贴世界左缘 → tx0 钳 2（边界声明:世界缘处伪影格可能仍在屏内,原版同相）
    const we = liquidDrawWindow(100, 4000, 1280, 800, 1, 4200, 1200);
    expect(we[0]).toBe(2);
    // 修复面：窗缘格（=管线误判格）必在可见屏外 ≥1 格
    const screenLeftTile = Math.floor((32000 - 1280 / 2 / 1) / 16);
    expect(w[0]).toBeLessThanOrEqual(screenLeftTile - 1);
    const screenTopTile = Math.floor((4000 - 800 / 2 / 1) / 16);
    expect(w[1]).toBeLessThanOrEqual(screenTopTile - 1);
  });

  it('②管线机制锁：窗口切湖时边缘列误用 sx=0 边缘变体+表面格丢 1280 静态带；恰限 1 列（=原版管线 1:1）', () => {
    const st = makeStore();
    // 切窗：tx0=30 落湖心（湖 x∈[20,60]），pool 左翼出窗
    const cut = byTile(drawRecs(st, 30, 20, 70, 45));
    // 窗缘列 x=30：表面格误用 sx=0（左缘变体列）而非 sx=16；isSurface 门（fx==16）失守
    // → 不走 srcY=1280 静态带,走 animFrame 动画带（nowMs=1000 → 6×80=480）
    const edgeSurf = cut.get('30,30');
    expect(edgeSurf).toBeDefined();
    expect(edgeSurf!.sx).toBe(0);
    expect(edgeSurf!.sy).toBe(6 * 80);
    // 窗缘列体部格：sx=0 + oy16（边缘变体）而非 sx=16+oy48（池体）
    const edgeBody = cut.get('30,31');
    expect(edgeBody).toBeDefined();
    expect(edgeBody!.sx).toBe(0);
    expect(edgeBody!.sy % 80).toBe(16);
    // 内移一格即恢复：x=31 表面格 sx=16 + srcY=1280 静态带；体部 sx=16+oy48
    const inSurf = cut.get('31,30');
    expect(inSurf!.sx).toBe(16);
    expect(inSurf!.sy).toBe(1280);
    const inBody = cut.get('31,31');
    expect(inBody!.sx).toBe(16);
    expect(inBody!.sy % 80).toBe(48);
    // 对照窗：tx0=22（湖翼入窗,同一批世界格全为内窗格）
    const full = byTile(drawRecs(st, 22, 20, 70, 45));
    const fullSurf = full.get('30,30');
    expect(fullSurf!.sx).toBe(16);
    expect(fullSurf!.sy).toBe(1280);
    // 收敛面：x≥31 的全部共同格在两窗下源带逐位一致（伪影恰限窗缘 1 列,原版同构）
    let compared = 0;
    for (const [k, rCut] of cut) {
      if (k.startsWith('30,')) continue;   // 窗缘列例外
      const rFull = full.get(k);
      if (!rFull) continue;
      expect({ k, ...rCut }).toEqual({ k, ...rFull });
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
  });

  it('③修复面：右缘/上缘同构——窗缘列 sx=32 变体、窗缘行误置表面带', () => {
    const st = makeStore();
    // 右缘切湖：tx1=50 落湖心（湖右翼 x∈[51,60] 出窗）
    const cutR = byTile(drawRecs(st, 20, 20, 50, 45));
    const edgeR = cutR.get('50,31');
    expect(edgeR).toBeDefined();
    expect(edgeR!.sx).toBe(32);              // 右缘变体列
    expect(edgeR!.sy % 80).toBe(16);
    const inR = cutR.get('49,31');
    expect(inR!.sx).toBe(16);
    expect(inR!.sy % 80).toBe(48);
    // 上缘切湖：ty0=33（表面行 30-32 出窗,窗缘行 33=体部格）
    const cutT = byTile(drawRecs(st, 20, 33, 70, 45));
    const edgeT = cutT.get('40,33');
    expect(edgeT).toBeDefined();
    expect(edgeT!.sx).toBe(16);
    expect(edgeT!.sy % 80).toBe(0);          // 误置表面带（fx=16∧fy=0 → isSurface 假阳性）
    const inT = cutT.get('40,34');
    expect(inT!.sy % 80).toBe(48);           // 一格之下即池体带
  });
});
