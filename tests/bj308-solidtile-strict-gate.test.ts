// ★BJ308（红蓝-V1/V2 复审漏修清偿·件1 主刀）：门②谓词严格化——原版门②
// （TileDrawing.cs:4141-4148 num15=0 悬空门）实心谓词 = WorldGen.SolidTile 全式
// （WorldGen.cs:70642-70664 = active ∧ !inActive ∧ tileSolid ∧ !tileSolidTop ∧
// !halfBrick ∧ slope==0）。★任务书行号锚「TileDrawing.cs:70650」系伪锚（该文件
// 仅 9841 行;真定义在 WorldGen.cs 同区间,行号 70650 恰落 i,j 重载体内）——判据
// 本身经亲读确认。本仓曾以宽谓词 TileStore.isSolid（active+非致动+SOLID_LUT,
// 缺实例面 !halfBrick/!slope 两排除;类型面 !tileSolidTop 已折入 LUT——defs.solid
// ≡ tileSolid∧!tileSolidTop,平台九件套 solid:false）→ 邻格半砖/坡面格误判实心,
// 门②少触发=多画。修 = TileStore.isSolidStrict 单源 + 增强段/浸润带门②两处换用。
// 判别面（门②触发差异三组合,邻格方位按原版门式：slope4 查左/slope3 查右）：
//   邻格=半砖 → 旧画/新不画（真判别）
//   邻格=坡面 → 旧画/新不画（真判别）
//   邻格=平台 → 旧新皆不画（LUT 折叠回归守卫）
//   邻格=纯实心 → 旧新皆画（防过修,门②不误触发）
// 断言面双通道：增强段 LiquidSlope 签名（sx=18*(slope-1)）+ 浸润带底条签名
// （srx=0,ry=4,sw=16,sh=4 → dx=x*16,dy=y*16+12,dw=16,dh=4——fD-only 分支
//  :4089-4093 移植段）。反 vacuous：守卫面断言"仍画"。
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawVanillaLiquids } from '../src/render/VanillaLiquidRenderer';
import { waterWaves } from '../src/render/WaterWaves';
import { TILE_DEFS } from '../src/data/tiles';

const SLAB = TILE_DEFS.findIndex((d) => d?.key === 'v_273_stone_slab');
const PLAT = TILE_DEFS.findIndex((d) => d?.key === 'platform');

/** 记录 drawImage 全参数的桩 ctx（同 BJ307 判例） */
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
 * 门②判别 store（坡面格 y=30,下邻 y=31 水 255 → 门①恒过,单变量=邻格门②实心性）：
 *  F (42,30) slope4 左邻(41,30)=半砖实心      —— 判别面:旧画/新不画
 *  G (46,30) slope3 右邻(47,30)=坡面实心      —— 判别面:旧画/新不画
 *  H (50,30) slope4 左邻(49,30)=平台          —— 守卫:旧新皆不画（LUT 折叠）
 *  I (54,30) slope3 右邻(55,30)=纯实心        —— 守卫:旧新皆画（门②不误触发）
 */
function makeStore(): TileStore {
  const st = new TileStore(120, 80);
  const set = (x: number, y: number, t: number, liquid = 0, slope = 0, half = 0) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = liquid > 0 ? 1 : 0;
    st.slope[i] = slope; st.half[i] = half;
  };
  // F: slope4(42,30) 下水255;左(41,30) 半砖
  set(42, 30, SLAB, 0, 4); set(42, 31, 0, 255); set(41, 30, SLAB, 0, 0, 1);
  // G: slope3(46,30) 下水255;右(47,30) 坡面 slope1
  set(46, 30, SLAB, 0, 3); set(46, 31, 0, 255); set(47, 30, SLAB, 0, 1);
  // H: slope4(50,30) 下水255;左(49,30) 平台（solid:false → LUT 排除）
  set(50, 30, SLAB, 0, 4); set(50, 31, 0, 255); set(49, 30, PLAT);
  // I: slope3(54,30) 下水255;右(55,30) 纯实心
  set(54, 30, SLAB, 0, 3); set(54, 31, 0, 255); set(55, 30, SLAB);
  return st;
}

/** 增强段 LiquidSlope 签名（同 BJ307 判例：9 参 (img,sx,sy,sw,sh,dx,dy,dw,dh)） */
function findSlopeOverlay(draws: number[][], tileX: number, tileY: number, slope: number): number[][] {
  const sx = 18 * (slope - 1);
  return draws.filter((a) => a.length === 9
    && a[1] === sx
    && a[5] === tileX * 16
    && a[6] === tileY * 16
    && a[7] === 16);
}

/** 浸润带底条签名（fD-only 分支:drawImage(tex, 0, 4, 16, 4, x*16, y*16+12, 16, 4)） */
function findBandBottomStrip(draws: number[][], tileX: number, tileY: number): number[][] {
  return draws.filter((a) => a.length === 9
    && a[1] === 0 && a[2] === 4 && a[3] === 16 && a[4] === 4
    && a[5] === tileX * 16 && a[6] === tileY * 16 + 12
    && a[7] === 16 && a[8] === 4);
}

function draw(): number[][] {
  const { ctx, draws } = makeRecordingCtx();
  drawVanillaLiquids(ctx, { width: 256, height: 256, ensureVImage: () => ({ width: 256, height: 256 }) } as unknown as SpriteAtlas,
    makeStore(), 60, 5, 5, 100, 55, 1000, true, 0, 0);
  return draws;
}

const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 256, height: 256 }) } as unknown as SpriteAtlas;
void atlas;

beforeAll(() => {
  // Image 桩（同 BJ307 判例:width=72/16 喂增强懒加载门;文件级替换无外溢）
  (globalThis as unknown as { Image?: unknown }).Image = class {
    src = ''; width = 72; height = 16; complete = true;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    addEventListener() { /* noop */ }
    removeEventListener() { /* noop */ }
  };
  // 钳死 IIIII251 波 bob（quality0 → sampleDisplace 早退 → dy=0 确定性）
  waterWaves.setQuality(0);
});

describe('BJ308 TileStore.isSolidStrict（WorldGen.SolidTile 全式谓词）', () => {
  it('谓词单元面:纯实心 true / 半砖 false / 坡面 false / 平台 false / 致动 false / 空 false', () => {
    const st = makeStore();
    expect(st.isSolidStrict(55, 30)).toBe(true);    // I 右邻纯实心
    expect(st.isSolidStrict(41, 30)).toBe(false);   // F 左邻半砖
    expect(st.isSolidStrict(47, 30)).toBe(false);   // G 右邻坡面
    expect(st.isSolidStrict(49, 30)).toBe(false);   // H 左邻平台（LUT 折叠）
    expect(st.isSolidStrict(42, 30)).toBe(false);   // 坡面格本体（谓词逐格,实例面排除不豁免自身）
    // 致动格:isSolid 基础面已排（WIRE_ACTUATED）
    const wire = st.wire[st.idx(55, 30)];
    st.wire[st.idx(55, 30)] = wire | TileStore.WIRE_ACTUATED;
    expect(st.isSolidStrict(55, 30)).toBe(false);
  });

  it('判别面F: slope4 左邻半砖 → 门②触发,增强+浸润带均不画（旧宽谓词误判实心=多画）', () => {
    const draws = draw();
    expect(findSlopeOverlay(draws, 42, 30, 4)).toHaveLength(0);
    expect(findBandBottomStrip(draws, 42, 30)).toHaveLength(0);
  });

  it('判别面G: slope3 右邻坡面 → 门②触发,增强+浸润带均不画', () => {
    const draws = draw();
    expect(findSlopeOverlay(draws, 46, 30, 3)).toHaveLength(0);
    expect(findBandBottomStrip(draws, 46, 30)).toHaveLength(0);
  });

  it('守卫面H: slope4 左邻平台 → 不画（tileSolidTop 折叠面回归守卫,旧新同值）', () => {
    const draws = draw();
    expect(findSlopeOverlay(draws, 50, 30, 4)).toHaveLength(0);
    expect(findBandBottomStrip(draws, 50, 30)).toHaveLength(0);
  });

  it('守卫面I: slope3 右邻纯实心 → 门②不触发仍画（防过修,双通道留断言）', () => {
    const draws = draw();
    expect(findSlopeOverlay(draws, 54, 30, 3).length).toBeGreaterThanOrEqual(1);
    expect(findBandBottomStrip(draws, 54, 30).length).toBeGreaterThanOrEqual(1);
  });
});
