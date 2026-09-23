// ★BJ307（2026-09-23 用户实报"临近水面的斜坡方块渲染异常——水被画到斜坡上,
// 色值 #083DBF"定谳判别面）：
// 根因 = VanillaLiquidRenderer 斜面格水体覆盖增强（2026-08-21 用户定案"做得更好"）
// 的触发谓词缺原版浸润带两道门,把原版刻意不画的坡面格画了整格 LiquidSlope 水色
// （LiquidSlope_0 主色 (9,61,191)=#093DBF,用户取色 #083DBF=AA 邻域像素 (8,60,190)）：
//   门①下方旗 >240（TileDrawing.cs:4023-4026 flag4；:4044 五旗全空 return）——
//      海面表层格液位恒 238（93%）≤240 → 原版不画。
//   门②slope3/4 悬空（:4141-4148 num15=0 整带不画）——slope4 左邻无液且不实 /
//      slope3 右邻同 → 坡面背侧无支撑。
// 物证（debug-report-Starter_World-2026-09-23 tiles.areaCamera enc 行解码,x0=6116）：
//   (6155,314)=273 slope3 liquid0,下邻(6155,315)水238,右邻空   → 门①②双拦
//   (6170,314)=272 slope4 liquid0,下邻(6170,315)水238,左邻实心 → 门①拦
// 断言面 = 增强循环 drawImage 目标签名（源 sx=18*(slope-1)、目标 (x*16,y*16+num6)、
// 宽 16）；测试内 waterWaves.setQuality(0) 钳死 dy251=0（sampleDisplace quality0 早退）。
// 反 vacuous：C/E 场景断言"仍画"——防把增强整个删除/过修的变异。
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawVanillaLiquids } from '../src/render/VanillaLiquidRenderer';
import { waterWaves } from '../src/render/WaterWaves';
import { TILE_DEFS } from '../src/data/tiles';

const SLAB = TILE_DEFS.findIndex((d) => d?.key === 'v_273_stone_slab');
const COG = TILE_DEFS.findIndex((d) => d?.key === 'v_272_cog_block');

/** 记录 drawImage 全参数的桩 ctx（vitest node 环境无 canvas 实现） */
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
 * 物证复刻 store（海面线几何,y=31 行为水面,y=30 行为海面线上第一格坡面）：
 *  A (22,30) 273 slope3 下液238 右空 左/上实心  —— 物证1 (6155,314)
 *  B (26,30) 272 slope4 下液238 左实 右实 上实  —— 物证2 (6170,314)
 *  C (30,30) 273 slope3 下液255 右空            —— 保留面:下满液仍画（08-21 定案）
 *  D (34,30) 273 slope4 下液255 左空无液 右实   —— 保留面:悬空门(与下液多寡无关)
 *  E (38,30) 273 slope2 左液255 其余空          —— 保留面:侧液面（无240门语义）
 */
function makeStore(): TileStore {
  const st = new TileStore(120, 80);
  const set = (x: number, y: number, t: number, liquid = 0, slope = 0) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = liquid > 0 ? 1 : 0;
    st.slope[i] = slope;
  };
  // A: slope3 格(22,30);左(21,30)实心、上(22,29)实心、右(23,30)空、下(22,31)水238
  set(21, 30, SLAB); set(22, 29, SLAB); set(22, 30, SLAB, 0, 3); set(22, 31, 0, 238);
  // B: slope4 格(26,30);左(25,30)/右(27,30)/上(26,29)实心、下(26,31)水238
  set(25, 30, COG); set(27, 30, COG); set(26, 29, COG); set(26, 30, COG, 0, 4); set(26, 31, 0, 238);
  // C: slope3 格(30,30);左/上实心、右(31,30)水255(有液→门②悬空不触发)、下满水255
  set(29, 30, SLAB); set(30, 29, SLAB); set(30, 30, SLAB, 0, 3); set(30, 31, 0, 255); set(31, 30, 0, 255);
  // D: slope4 格(34,30);左(33,30)空无液、右(35,30)实心、下(34,31)满水255
  set(35, 30, SLAB); set(34, 30, SLAB, 0, 4); set(34, 31, 0, 255);
  // E: slope2 格(38,30);左(37,30)满水255、右/上/下空
  set(38, 30, SLAB, 0, 2); set(37, 30, 0, 255);
  return st;
}

/** 增强绘制签名过滤。drawImage 9 参序 = (img, sx, sy, sw, sh, dx, dy, dw, dh)：
 *  增强调用 drawImage(slopeTex, sx=18*(slope-1), sy=num6, 16, sh,
 *  dx=x*16, dy=y*16+num6(+dy251,本测试钳0), 16, sh) ⇒ dx=a[5], dy=a[6], dh=a[8]。 */
function findSlopeOverlay(draws: number[][], tileX: number, tileY: number, slope: number): number[][] {
  const sx = 18 * (slope - 1);
  return draws.filter((a) => a.length === 9
    && a[1] === sx
    && a[5] === tileX * 16
    && a[6] === tileY * 16
    && a[7] === 16);
}

const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 256, height: 256 }) } as unknown as SpriteAtlas;

beforeAll(() => {
  // Image 桩【无条件替换】（vitest node 环境的 polyfill Image（若有）width=0 →
  // 增强懒加载门 im.width>0 恒假 → 增强静默不画 = 断言面全空转；width=72/16
  // = LiquidSlope 表真实尺寸,喂过懒加载门。文件级替换,vitest 文件隔离无外溢）
  (globalThis as unknown as { Image?: unknown }).Image = class {
    src = ''; width = 72; height = 16; complete = true;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    addEventListener() { /* noop */ }
    removeEventListener() { /* noop */ }
  };
  // 钳死 IIIII251 波 bob（quality0 → sampleDisplace 早退 → dy251=0 确定性）
  waterWaves.setQuality(0);
});

describe('BJ307 斜坡液体覆盖增强触发门（原版浸润带对齐）', () => {
  it('物证1: slope3 下液238(≤240) 右空 → 不画（门①五旗空 + 门②悬空双拦）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawVanillaLiquids(ctx, atlas, makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
    expect(findSlopeOverlay(draws, 22, 30, 3)).toHaveLength(0);
  });

  it('物证2: slope4 下液238(≤240) 左实 → 不画（门①拦）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawVanillaLiquids(ctx, atlas, makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
    expect(findSlopeOverlay(draws, 26, 30, 4)).toHaveLength(0);
  });

  it('保留面: slope3 下满液255 → 仍画整格 LiquidSlope（08-21 定案语义,防过修）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawVanillaLiquids(ctx, atlas, makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
    const hits = findSlopeOverlay(draws, 30, 30, 3);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0][8]).toBe(16);   // 目标 dh=sh=16-num6, num6=floor(1/32)*2=0 → 整格
  });

  it('保留面: slope4 下满液255 但左邻空无液 → 不画（门②悬空,与液位无关）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawVanillaLiquids(ctx, atlas, makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
    expect(findSlopeOverlay(draws, 34, 30, 4)).toHaveLength(0);
  });

  it('保留面: slope2 左邻满液255 → 仍画（侧液无240门,触发集不缩水）', () => {
    const { ctx, draws } = makeRecordingCtx();
    drawVanillaLiquids(ctx, atlas, makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
    const hits = findSlopeOverlay(draws, 38, 30, 2);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});
