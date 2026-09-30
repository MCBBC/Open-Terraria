// ★C13b 液体 op-batch——非微光浸润带（水/岩浆/蜂蜜）+ III256 白色水面亮线 + 斜面覆盖
// 增强批化：结构锁+行为锁（2026-09-30;liquid-gl-batch 判例同构）。
// node 可跑面：bat 钩端到端捕获批段（liqband:/liqslack: 键族）+顶点预乘恒等式+
// all-or-nothing 容量预检+软溢出位（不触硬面）+2D 重放+逃生门（?c13b=0）。
// 像素对拍=scripts/_c13b-ab.mjs（GL vs 逐 op shim 同帧 census,node 无 GL/canvas）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import {
  drawVanillaLiquids, drawLiquidBehindTilesOnly, resetLiquidBatchForFrame,
  liqRingOverflow, liqBatchSoftOverflow, liqC13bSetForTest,
  type LiqBatchEmit,
} from '../src/render/VanillaLiquidRenderer';
import { texId } from '../src/render/texId';
import { TILE_DEFS } from '../src/data/tiles';

const VL = readFileSync(join(__dirname, '../src/render/VanillaLiquidRenderer.ts'), 'utf8');
const RD = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');

// ---------- 桩面（liquid-gl-batch 同族） ----------
const fakeAtlas = {
  ensureVImage: () => ({ width: 144, height: 1360 }),
} as unknown as SpriteAtlas;

function makeCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const setLog: Array<{ k: string; v: unknown }> = [];
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
    set(t, prop, v) { setLog.push({ k: String(prop), v }); t[prop] = v; return true; },
  };
  return { ctx: new Proxy(stub, handler) as unknown as CanvasRenderingContext2D, calls, setLog };
}

interface BatCap { img: unknown; key: string; data: Float32Array; quads: number; replay: unknown }
function mkBat(sink: BatCap[]): LiqBatchEmit {
  return {
    emit(img, key, data, quads, replay) {
      sink.push({ img, key, data: data.slice(), quads, replay });
      return true;
    },
  };
}

/** 地下水池（groundLevel 上方远）：带 alpha=0.5 域（墙 0.6/0.9 不涉） */
function makeUndergroundPool(): TileStore {
  const st = new TileStore(140, 100);
  const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  const set = (x: number, y: number, t: number, liquid = 0, lt = 1) => {
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = t ? 1 : 0;
    st.liquid[i] = liquid; st.liquidType[i] = lt;
  };
  for (let x = 0; x < 140; x++) for (let y = 62; y < 66; y++) set(x, y, dirt);   // 池底+下垫
  for (let x = 30; x <= 90; x++) for (let y = 50; y <= 61; y++) set(x, y, 0, 255, 1);   // 池水
  for (let y = 44; y <= 49; y++) for (let x = 28; x <= 92; x++) set(x, y, dirt);        // 池顶板
  return st;
}

beforeAll(() => {
  if (!(globalThis as unknown as { Image?: unknown }).Image) {
    // width=72:16: LiquidSlope 表尺寸（72×16=4 列×18px）——斜面增强批臂要求
    // getSlopeTex 就绪（width>0）;width=0 桩=懒载未就绪跳帧（生产首帧行为）。
    (globalThis as unknown as { Image: unknown }).Image = class {
      src = ''; width = 72; height = 16; complete = false;
      addEventListener() { /* noop */ }
      removeEventListener() { /* noop */ }
    };
  }
});

afterEach(() => {
  liqC13bSetForTest(true);   // 旗复位（逃生门测试翻面回缺省）
  resetLiquidBatchForFrame(-1);
});

// ---------- 行为锁 ----------
describe('★C13b 非微光浸润带批臂（bg pass 端到端）', () => {
  it('批捕获:水带落 liqband: 段（与主循环 liq: 段并存）;α=0.5 域;rgb 预乘恒等（cols=null）', () => {
    const st = makeUndergroundPool();
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(31);
    drawVanillaLiquids(ctx, fakeAtlas, st, 10, 5, 5, 130, 70, 1000, true, 0, 0,
      undefined, false, undefined, 31, null, mkBat(caps), false);
    const bandRuns = caps.filter((c) => c.key.startsWith('liqband:'));
    const bodyRuns = caps.filter((c) => c.key.startsWith('liq:'));
    expect(bandRuns.length).toBeGreaterThanOrEqual(1);   // 池底 fU 带+侧壁带已批
    expect(bodyRuns.length).toBeGreaterThanOrEqual(1);   // 水体主循环批（liqgl 现行）并存
    let bandQuads = 0;
    const alphaDom = new Set<number>();
    for (const c of bandRuns) {
      for (let q = 0; q < c.quads; q++) {
        const o = q * 48;
        const a = c.data[o + 7];
        expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1);
        alphaDom.add(a);
        // cols=null → rgb = 1×α 预乘恒等式（12 分量逐位 === α）
        for (let v = 0; v < 6; v++) {
          expect(c.data[o + v * 8 + 4]).toBe(a);
          expect(c.data[o + v * 8 + 5]).toBe(a);
          expect(c.data[o + v * 8 + 6]).toBe(a);
        }
        // uv 域合法（有限+近似 [0,1]）
        for (let v = 0; v < 6; v++) {
          expect(Number.isFinite(c.data[o + v * 8 + 2])).toBe(true);
          expect(Number.isFinite(c.data[o + v * 8 + 3])).toBe(true);
        }
        bandQuads++;
      }
    }
    expect(bandQuads).toBeGreaterThan(5);
    for (const a of alphaDom) expect([0.5, 0.6, 0.9, 1]).toContain(a);   // :4126-4151 α 域
  });

  it('重放面:带段 2D 逐 quad 回放（drawImage 数=quad 数;globalAlpha 自环恢复）', () => {
    const st = makeUndergroundPool();
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(32);
    drawVanillaLiquids(ctx, fakeAtlas, st, 10, 5, 5, 130, 70, 1000, true, 0, 0,
      undefined, false, undefined, 32, null, mkBat(caps), false);
    const band = caps.find((c) => c.key.startsWith('liqband:'))!;
    expect(band).toBeDefined();
    const rctx = makeCtx();
    (band.replay as (c: CanvasRenderingContext2D) => void)(rctx.ctx);
    expect(rctx.calls[0].op).toBe('save');
    expect(rctx.calls[rctx.calls.length - 1].op).toBe('restore');
    const draws = rctx.calls.filter((c) => c.op === 'drawImage');
    expect(draws.length).toBe(band.quads);
    // 源矩形自 _batMeta 恢复（sw/sh 与环几何一致;此处桩验证形参透传）
    for (const d of draws) expect((d.args[2] as number)).toBeGreaterThan(0);
  });

  it('逃生门:?c13b=0 → 水带回逐 op 原链（无 liqband 段;ctx.drawImage 直画）;liqgl 主循环批不受扰', () => {
    liqC13bSetForTest(false);
    const st = makeUndergroundPool();
    const caps: BatCap[] = [];
    const { ctx, calls } = makeCtx();
    resetLiquidBatchForFrame(33);
    drawVanillaLiquids(ctx, fakeAtlas, st, 10, 5, 5, 130, 70, 1000, true, 0, 0,
      undefined, false, undefined, 33, null, mkBat(caps), false);
    expect(caps.filter((c) => c.key.startsWith('liqband:')).length).toBe(0);
    expect(caps.filter((c) => c.key.startsWith('liq:')).length).toBeGreaterThanOrEqual(1);
    expect(calls.filter((c) => c.op === 'drawImage').length).toBeGreaterThan(5);   // 带 CPU 直画
  });
});

describe('★C13b 实心层带+III256 亮线批臂（drawLiquidBehindTilesOnly solidLayer=true）', () => {
  /** 岸面:土岸+坡面岸块（slope1 左岸水在右/slope2 右岸水在左——坡面门开放侧=水侧,
   *  III256 亮线门 Uq=0∧上格不实∧(fL∨fR) 触发面） */
  function makeShore(): TileStore {
    const st = new TileStore(140, 100);
    const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
    const set = (x: number, y: number, t: number, liquid = 0, lt = 1) => {
      const i = st.idx(x, y);
      st.type[i] = t; st.flags[i] = t ? 1 : 0;
      st.liquid[i] = liquid; st.liquidType[i] = lt;
    };
    for (let x = 0; x < 140; x++) set(x, 60, dirt);                       // 地面
    for (let x = 40; x <= 90; x++) for (let y = 52; y <= 59; y++) set(x, y, 0, 255, 1);   // 池
    // 坡面岸块:左岸 (39,59) slope1（开放侧=右=水）;右岸 (91,59) slope2（开放侧=左=水）
    set(39, 59, dirt); st.setSlope(39, 59, 1);
    set(91, 59, dirt); st.setSlope(91, 59, 2);
    return st;
  }

  it('批捕获:solidLayer 带 liqband: 段;亮线 quad（源高 2px）入段;α 域合法', () => {
    const st = makeShore();
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(41);
    drawLiquidBehindTilesOnly(ctx, fakeAtlas, st, 60, 5, 5, 130, 70, 0,
      undefined, true, 0, false, null, null, mkBat(caps));
    const bandRuns = caps.filter((c) => c.key.startsWith('liqband:'));
    expect(bandRuns.length).toBeGreaterThanOrEqual(1);
    let lineQuads = 0;
    for (const c of bandRuns) {
      for (let q = 0; q < c.quads; q++) {
        const o = q * 48;
        const a = c.data[o + 7];
        expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1);
        lineQuads++;   // 计数面;亮线判据在重放源矩形（下测）
      }
    }
    expect(lineQuads).toBeGreaterThan(3);
  });

  it('亮线批化:重放 drawImage 序列含源高 2px 条（III256 源矩形 rx,0,min(rw,texW-rx),2）', () => {
    const st = makeShore();
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(42);
    drawLiquidBehindTilesOnly(ctx, fakeAtlas, st, 60, 5, 5, 130, 70, 0,
      undefined, true, 0, false, null, null, mkBat(caps));
    const rctx = makeCtx();
    for (const c of caps) {
      if (!c.key.startsWith('liqband:')) continue;
      (c.replay as (rc: CanvasRenderingContext2D) => void)(rctx.ctx);
    }
    const draws = rctx.calls.filter((c) => c.op === 'drawImage');
    // 亮线 quad:源矩形（sx,sy,sw,sh=drawImage args[1..4]）sh===2 且 sy===0（Liquid_N 顶 2px 亮边）
    const lines = draws.filter((d) => (d.args[4] as number) === 2 && (d.args[2] as number) === 0);
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('逃生门:?c13b=0 → 实心层带回逐 op 原链（无 liqband 段）', () => {
    liqC13bSetForTest(false);
    const st = makeShore();
    const caps: BatCap[] = [];
    const { ctx, calls } = makeCtx();
    resetLiquidBatchForFrame(43);
    drawLiquidBehindTilesOnly(ctx, fakeAtlas, st, 60, 5, 5, 130, 70, 0,
      undefined, true, 0, false, null, null, mkBat(caps));
    expect(caps.filter((c) => c.key.startsWith('liqband:')).length).toBe(0);
    expect(calls.filter((c) => c.op === 'drawImage').length).toBeGreaterThan(3);
  });
});

describe('★C13b 斜面覆盖增强批臂（bg pass,LiquidSlope 覆盖）', () => {
  it('批捕获:坡面邻水格 liqslack: 段（懒载表就绪前提;a=1 不透明）', () => {
    const st = makeUndergroundPool();
    // 坡面块贴水（池内侧壁替换成 slope1/2 实心块 → BJ307 门开面）
    const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
    for (let i = 0; i < 8; i++) {
      const sx = 32 + i * 4;
      const si = st.idx(sx, 61);
      st.type[si] = dirt; st.flags[si] = 1; st.liquid[si] = 0;
      st.setSlope(sx, 61, 2);
    }
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(51);
    drawVanillaLiquids(ctx, fakeAtlas, st, 10, 5, 5, 130, 70, 1000, true, 0, 0,
      undefined, false, undefined, 51, null, mkBat(caps), false);
    const slack = caps.filter((c) => c.key.startsWith('liqslack:'));
    expect(slack.length).toBeGreaterThanOrEqual(1);
    for (const c of slack) {
      for (let q = 0; q < c.quads; q++) {
        const o = q * 48;
        expect(c.data[o + 7]).toBe(1);            // 背景层不透明
        expect(c.data[o + 4]).toBe(1);            // cols=null 预乘恒等（a=1）
      }
    }
  });
});

describe('★C13b 软溢出位（带批帽触发不触硬面判别器）', () => {
  it('带批填满环:liqBatchSoftOverflow()=true ∧ liqRingOverflow()=false（gate/复用面不受扰）', () => {
    // 250×140 交替水/土行:水行上邻土行 → fU 顶条带 1 quad/格,~17k quad > 16384 帽
    const st = new TileStore(250, 140);
    const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
    for (let y = 1; y < 139; y++) {
      for (let x = 1; x < 249; x++) {
        const i = st.idx(x, y);
        if (y % 2 === 0) { st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 255; st.liquidType[i] = 1; }
        else { st.type[i] = dirt; st.flags[i] = 1; st.liquid[i] = 0; }
      }
    }
    const caps: BatCap[] = [];
    const { ctx } = makeCtx();
    resetLiquidBatchForFrame(61);
    expect(liqRingOverflow()).toBe(false);
    drawLiquidBehindTilesOnly(ctx, fakeAtlas, st, 200, 1, 1, 248, 138, 0,
      undefined, true, 0, false, null, null, mkBat(caps));
    expect(liqBatchSoftOverflow()).toBe(true);
    expect(liqRingOverflow()).toBe(false);   // 软位不进硬面（gate 回退/fg 复用停用不触发）
    let total = 0;
    for (const c of caps) total += c.quads;
    expect(total).toBeLessThanOrEqual(16384);   // 环帽
    expect(total).toBeGreaterThan(16000);       // 触帽面（否则 fixture 不足判别力）
  });
});

// ---------- 结构锁（源码锚;防并行会话漂移） ----------
describe('★C13b 结构锁', () => {
  it('VanillaLiquidRenderer:旗/双臂门/软溢出/预检/亮线同批/坡面臂/发射位锚', () => {
    expect(VL).toContain("get('c13b') !== '0'");
    expect(VL).toContain('export function liqC13bSetForTest(');
    expect(VL).toContain('let bandBatC13b = false');
    expect(VL).toContain('bandBatOn = polishBand;   // 微光臂=现行门（liqpolish 域;旗关臂逐位原链）');
    expect(VL).toContain('bandBatC13b = liqC13b;    // ★C13b 臂（独立逃生门）');
    expect(VL).toContain('let _batSoftOvf = false');
    expect(VL).toContain('export function liqBatchSoftOverflow(): boolean { return _batSoftOvf; }');
    expect(VL).toContain('cols: Float32Array | null, colOff: number, soft = false,');
    expect(VL).toContain('if (soft) _batSoftOvf = true; else _batOverflow = true;');
    expect(VL).toContain('_batSoftOvf = false;   // ★C13b 软溢出位随帧复位');
    expect(VL).toContain('if (_batN + need <= LIQ_RING_CAP) {');
    expect(VL).toContain('bsKey = `liqband:${texId(drawTex)}`; }');
    expect(VL).toContain('bsKey = `liqband:${texId(tex)}`; }');
    expect(VL).toContain('bandQuadEmit(tex, bsKey, rx, 0, Math.min(rw, tex.width - rx), 2,');
    expect(VL).toContain('const slopeBatOn = liqC13b && bat != null && frameToken !== undefined');
    expect(VL).toContain('slKey = `liqslack:${texId(slopeTex)}`;');
    expect(VL).toContain('if (slopeBatOn) flushSlopeRun();   // ★C13b:段收口');
    expect(VL).toContain('(polish || liqC13b) ? (bat ?? null) : null');
    // 发射失败=2D 原位重放（宁回退不丢;flushAddRuns2DAndEmit emitAdd 判例同式）
    expect(VL).toContain("if (!ok) replayLiqRun2D(ctx, s0, nQ, img, cols);");
    expect(VL).toContain("if (!ok) replayLiqRun2D(ctx, s0, nQ, img, false);   // 入口门拒=2D 原位重放（flushBandRun 同式）");
  });

  it('Renderer:实心层钩双旗正交门（liqpolish ∨ liqC13b）+导入锚', () => {
    expect(RD).toContain('liqgl, liqC13b, emitVanillaLiquidGate');
    expect(RD).toContain("(liqpolish || liqC13b) && liqgl && this._accMode === 'acc' && !this.isCpuRender()");
  });

  it('现行锁不回退:liqgl/liqpolish 结构锚保持（liquid-gl-batch 同款串仍在盘）', () => {
    expect(VL).toContain('const LIQ_RING_CAP = 16384');
    expect(VL).toContain('const flushBandRun = (');
    expect(VL).toContain('function batQuad(');
    expect(VL).toContain("get('liqgl') !== '0'");
    expect(VL).toContain('if (bsImg !== drawTex) { flushBandRun(); bsImg = drawTex; bsKey = `liqband:${texId(drawTex)}`; bsCols = true; }');
  });
});
