// ★BJ325（2026-09-24,BJ307 债清偿）：VanillaLiquidRenderer 液体渲染宽谓词残余两站
// isSolid → isSolidStrict（=WorldGen.SolidTile 全式,TileStore 单源 BJ308）。
// 定谳（反编译亲读,1457）：
//   站①num4!=0 门 = TileDrawing.cs:4087（DrawTile_LiquidBehindTile 内）
//     `if (num5 == 0 && (num12 != 0 || !WorldGen.SolidTile(tileX, tileY - 1))) y = 0;`
//     num5=上格液位(:3878-3882)、num12=tileCache.blockType()(:3907,1=半砖 2-5=坡面)、
//     SolidTile=WorldGen.cs:70642 全式（active ∧ tileSolid ∧ !tileSolidTop ∧
//     !halfBrick ∧ slope==0 ∧ !inActive）。repo 旧码实心臂用宽谓词 isSolid
//     （缺 !halfBrick∧slope==0 实例两排除）→ 上格半砖/坡面误判实心 → 带源 y0 滞 4。
//   站②IIII256 坡面亮线门（用户明示偏差 2026-09-14）「上格实心=水下顶板不画」——
//     该门镜像站①的 !SolidTile(above) 暴露条件（带顶=可见水面才画线）→ 谓词同源
//     SolidTile 全式；上格半砖时带顶对半砖下方 8px 空腔暴露,亮线应画。
// 判别面（变异=两站任一回退 isSolid → 对应 face 红）：
//   F1 站①:全块水邻格+上格半砖 → 带源 sy=0（宽谓词=4）；F2 站①反真空:上格全实心
//     → sy=4（门不触发,防过修）；F3 站①num4 臂回归锚:自身半砖+上格全实心 → sy=0
//     （num4!=0 臂与谓词正交,BJ308 前已行为,严防 strict 化误伤）。
//   F4 站②:slope2 水邻格+上格半砖 → 亮线 2px drawImage 在场（宽谓词=缺）；
//     F5 站②反真空:上格全实心 → 亮线缺席。
// 台架=BJ307 同款录参 ctx Proxy + TileStore 夹具；waterWaves.setQuality(0) 钳 dy251=0。
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawLiquidBehindTilesOnly } from '../src/render/VanillaLiquidRenderer';
import { waterWaves } from '../src/render/WaterWaves';
import { TILE_DEFS } from '../src/data/tiles';

const STONE = TILE_DEFS.findIndex((d) => d?.key === 'stone');   // tile 2 stone,tileSolid 全式实心

/** BJ307 同款录参 ctx（vitest node 环境无 canvas） */
function makeRecordingCtx() {
  const draws: number[][] = [];
  const base: Record<string, unknown> = {
    canvas: { width: 8192, height: 8192 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      const name = String(prop);
      return (...args: unknown[]) => {
        if (name === 'drawImage') draws.push(args.map((a) => (typeof a === 'number' ? a : -999)));
        if (name === 'getTransform') return { a: 1, b: 0, c: 0, d: 0, e: 0, f: 0 };
        if (name === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(t, prop, v) { t[prop as string] = v; return true; },
  };
  return { ctx: new Proxy(base, handler) as unknown as CanvasRenderingContext2D, draws };
}

/**
 * 夹具（全块/半砖/坡面 × 上格实心形态 2×3）：
 *  A (10,30) 全块 stone,左水255,上格(10,29) 半砖 stone 无液 —— F1:带源 sy=0
 *  B (14,30) 全块 stone,左水255,上格(14,29) 全实心 stone   —— F2:带源 sy=4
 *  C (18,30) 自身半砖 stone,左水255,上格(18,29) 全实心     —— F3:num4 臂 sy=0
 *  D (20,30) slope2 stone,左水255,上格(20,29) 半砖无液     —— F4:亮线在场
 *  E (24,30) slope2 stone,左水255,上格(24,29) 全实心       —— F5:亮线缺席
 */
function makeStore(): TileStore {
  const st = new TileStore(64, 64);
  const set = (x: number, y: number, t: number, liquid = 0, slope = 0, half = 0) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = liquid > 0 ? 1 : 0;
    st.slope[i] = slope; st.half[i] = half;
  };
  // A: 全块(10,30) + 左水(9,30) + 上半砖(10,29)
  set(10, 30, STONE); set(9, 30, 0, 255); set(10, 29, STONE, 0, 0, 1);
  // B: 全块(14,30) + 左水(13,30) + 上全实心(14,29)
  set(14, 30, STONE); set(13, 30, 0, 255); set(14, 29, STONE);
  // C: 自身半砖(18,30) + 左水(17,30) + 上全实心(18,29)
  set(18, 30, STONE, 0, 0, 1); set(17, 30, 0, 255); set(18, 29, STONE);
  // D: slope2(20,30) + 左水(19,30)（slope2 左开放右 blocked）+ 上半砖(20,29)
  set(20, 30, STONE, 0, 2); set(19, 30, 0, 255); set(20, 29, STONE, 0, 0, 1);
  // E: slope2(24,30) + 左水(23,30) + 上全实心(24,29)
  set(24, 30, STONE, 0, 2); set(23, 30, 0, 255); set(24, 29, STONE);
  return st;
}

const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 256, height: 256 }) } as unknown as SpriteAtlas;

/** 浸润带主段签名（drawBand 首式 9 参）：a[1]=sx、a[2]=sy(=y0/num6)、a[5]=x*16、a[6]=y*16 */
function findBand(draws: number[][], tileX: number, tileY: number): number[][] {
  return draws.filter((a) => a.length === 9
    && a[5] === tileX * 16 && a[6] === tileY * 16);
}

/** IIII256 亮线签名：drawImage(tex, rx, 0, w, 2, px, py, rw, 2) —— a[4]=2/a[8]=2 */
function findBrightLine(draws: number[][], tileX: number, tileY: number): number[][] {
  return draws.filter((a) => a.length === 9
    && a[2] === 0 && a[4] === 2 && a[8] === 2
    && a[5] === tileX * 16 && a[6] === tileY * 16);
}

beforeAll(() => {
  (globalThis as unknown as { Image?: unknown }).Image = class {
    src = ''; width = 256; height = 256; complete = true;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    addEventListener() { /* noop */ }
    removeEventListener() { /* noop */ }
  };
  waterWaves.setQuality(0);   // 钳死 IIIII251 bob → dy251=0 确定性
});

describe('BJ325 液体渲染 SolidTile 全式两站（BJ307 债）', () => {
  it('F1 站①: 全块+左水+上格半砖 → 带源 sy=0（宽谓词误判实心时 sy=4）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawLiquidBehindTilesOnly(ctx, atlas, makeStore(), 60, 2, 2, 40, 40, 0, undefined, true);
    const band = findBand(draws, 10, 30);
    expect(band.length).toBeGreaterThanOrEqual(1);
    expect(band[0][2]).toBe(0);   // y0=0 → 亮顶行入带
  });

  it('F2 站①反真空: 上格全实心 → 门不触发,带源 sy=4（防 strict 化过修）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawLiquidBehindTilesOnly(ctx, atlas, makeStore(), 60, 2, 2, 40, 40, 0, undefined, true);
    const band = findBand(draws, 14, 30);
    expect(band.length).toBeGreaterThanOrEqual(1);
    expect(band[0][2]).toBe(4);
  });

  it('F3 站①num4 臂回归锚: 自身半砖+上格全实心 → sy=0（num4!=0 臂正交于谓词）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawLiquidBehindTilesOnly(ctx, atlas, makeStore(), 60, 2, 2, 40, 40, 0, undefined, true);
    const band = findBand(draws, 18, 30);
    expect(band.length).toBeGreaterThanOrEqual(1);
    expect(band[0][2]).toBe(0);
  });

  it('F4 站②: slope2+左水+上格半砖 → IIII256 亮线在场（宽谓词误判实心时缺席）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawLiquidBehindTilesOnly(ctx, atlas, makeStore(), 60, 2, 2, 40, 40, 0, undefined, true);
    const line = findBrightLine(draws, 20, 30);
    expect(line.length).toBe(1);   // 实心层 pass 单次 2px 过画
  });

  it('F5 站②反真空: 上格全实心 → 亮线缺席（水下顶板不画,IIIII256 语义保持）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawLiquidBehindTilesOnly(ctx, atlas, makeStore(), 60, 2, 2, 40, 40, 0, undefined, true);
    expect(findBrightLine(draws, 24, 30)).toHaveLength(0);
  });
});
