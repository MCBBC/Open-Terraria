// ★BJ665c C13-F5 hbAnchor 运行时死线接通——行为级判别锁（2026-10-12,用户拍板）。
//
// 债面（BJ664b 旁案定谳,物证在案）：hbEntryOf（Renderer.ts:10273）把锚产在
// entry 包裹对象上（:10288 毁灭者 134 destroyerHB 平滑位 / :10298 蠕虫头尾中点）,
// 唯一消费面 flushEntityHealthBars（:10408 旧）解构只取 { e, expert } →
// drawHealthBar 读的 e.hbAnchor（:10346 旧）运行时恒缺 = C13-F5 两面锚死码,
// 此类条恒回落默认锚 e.y+e.h+10+HB_ADD_H。
//
// 落刀形（BJ660 sentrySpawnBox 纯函数单源习语+最小 diff 定谳）：
//  【解构补取 + drawHealthBar 第 4 显式参】——entry 包裹面保留（hbEntryOf 单源
//  不动）,flush 解构补取 hbAnchor 直传;drawHealthBar 内锚 = 入参覆写 ∪ e 本体
//  遗留面。拒绝「hbAnchor 挂 e 本体」方案：渲染层回写实体字段 = 蠕虫尾断帧
//  （entry 无锚产出帧）残留上帧陈旧锚的跨帧污染险;显式入参 = per-call 语义免疫。
//
// 判别力（死线回插必红,坐标级断言非源码串）：
//  ①毁灭者 134：entry.hbAnchor={1000,300} → 条屏位 minDX=1000-18×1.5=973 /
//    minDY=300（BIG_SCALE 1.5;默认锚反事实 = y+h+10+30=190 ≠ 300）+α=(1+1)/2 面。
//  ②蠕虫 vid 10（WORM_MID_HEADS,BIG_SCALE 外=scale 1）：锚={900,250} →
//    minDX=882/minDY=250（默认锚反事实 = 100+50+10+8=168 ≠ 250）。
//  ③e 本体遗留面保留：e.hbAnchor 直挂仍生效（第 4 参缺省回退）。
//  ④无锚实体回落默认锚（vid 1:782/220,与 bj664b 场景锁同值=跨件互证）。
//  ⑤线源锚：flush 解构 hbAnchor + 第 4 参直传唯一性。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../src/render/Renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

type Op = {
  seq: number;
  kind: 'rect' | 'text' | 'img';
  dx?: number; dy?: number; dw?: number; dh?: number;
  alpha: number;
};

let r: InstanceType<typeof Renderer>;

const mkCam = () => ({
  x: 640, y: 360, zoom: 1, viewW: 1280, viewH: 720, punchX: 0, punchY: 0, flipY: false,
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x + this.punchX) * this.zoom + this.viewW / 2, (wy - this.y + this.punchY) * this.zoom + this.viewH / 2];
  },
});

const mkCtx = () => {
  const ops: Op[] = [];
  let seq = 0;
  return {
    ops,
    globalAlpha: 1 as number,
    imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over' as string,
    fillStyle: '', textAlign: 'left' as string, textBaseline: 'alphabetic' as string, font: '',
    save() { /* noop */ }, restore() { /* noop */ }, setTransform() { /* noop */ },
    measureText(t: string) { return { width: t.length * 7 }; },
    fillRect() { /* 名条域,本件不消费 */ },
    fillText() { /* 同上 */ },
    drawImage(_i: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
      dx: number, dy: number, dw: number, dh: number) {
      ops.push({ seq: seq++, kind: 'img', dx, dy, dw, dh, alpha: this.globalAlpha });
    },
  };
};

type FlushRenderer = {
  ctx: unknown; lighting: unknown; atlas: unknown; tintedSprite: unknown;
  remotePlayers: unknown[];
  flushEntityHealthBars(pass: unknown, cam: unknown): void;
};

/** 统一装载：全亮光照 + 假 atlas + tintedSprite 桩（bj664b 夹具纪律） */
const arm = (rr: FlushRenderer) => {
  const ctx = mkCtx();
  rr.ctx = ctx;
  rr.lighting = { lightAt: () => [255, 255, 255] };
  rr.atlas = { ensureVImage: () => ({ img: {} }) };
  (rr as unknown as { tintedSprite: () => unknown }).tintedSprite =
    () => ({ c: {}, x: 0, y: 0, w: 2, h: 12 });
  return ctx;
};

const barSpan = (ops: Op[]) => ({
  l: Math.min(...ops.filter((q) => q.kind === 'img').map((q) => q.dx!)),
  r: Math.max(...ops.filter((q) => q.kind === 'img').map((q) => q.dx! + q.dw!)),
  t: Math.min(...ops.filter((q) => q.kind === 'img').map((q) => q.dy!)),
  b: Math.max(...ops.filter((q) => q.kind === 'img').map((q) => q.dy! + q.dh!)),
  alpha: ops.find((q) => q.kind === 'img')!.alpha,
});

describe('BJ665c ①毁灭者 134 锚 = entry.hbAnchor（坐标级,平滑位经 wire 生效）', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null;
      addEventListener() { /* noop */ }
    };
    const anyStub = (): Record<string, unknown> => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
      set: () => true,
      apply: () => anyStub(),
      construct: () => anyStub(),
    });
    (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
    (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
    (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
    r = new Renderer(null as never);
  }, 120000);

  it('锚 {1000,300} → 条屏位 minDX=973（1000-27,BIG_SCALE 1.5）/ minDY=300;默认锚反事实 190 被否', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = arm(rr);
    // 夹具 = hbEntryOf 真实产物形状（锚在 entry 包裹面,BJ665c 后为活线,非幻影）
    rr.flushEntityHealthBars([{
      e: { cx: 500, cy: 320, y: 100, h: 50, hp: 50, maxHp: 100, vanillaId: 134, ai0: 0 },
      expert: false,
      hbAnchor: { x: 1000, y: 300 },
    }], mkCam());
    const bar = barSpan(ctx.ops);
    expect(ctx.ops.filter((q) => q.kind === 'img').length).toBeGreaterThan(0);
    expect(bar.l).toBe(973);            // 1000 - 18×1.5（scale 1.5 = HB_BIG_SCALE 134）
    expect(bar.t).toBe(300);            // 锚 Y 直取（无 +10/NPCAddHeight 面,:46730 同相）
    expect(bar.r).toBe(1027);           // 973+36×1.5
    expect(bar.b).toBe(318);            // 12×1.5
    // 默认锚反事实（死线态回落位）:wy=y+h+10+HB_ADD_H[134]=100+50+10+30=190 ≠ 300
    expect(bar.t).not.toBe(190);
    // C13-F5 α 面（同一 wire 活线）：全亮 aQ=1 → (1+1)/2=1 → globalAlpha 0.95
    expect(bar.alpha).toBeCloseTo(0.95);
  });
});

describe('BJ665c ②蠕虫头 vid 10 锚 = 头尾中点（坐标级,scale 1）', () => {
  it('锚 {900,250} → 条屏位 minDX=882（900-18）/ minDY=250;默认锚反事实 168 被否', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = arm(rr);
    rr.flushEntityHealthBars([{
      e: { cx: 460, cy: 280, y: 100, h: 50, hp: 50, maxHp: 100, vanillaId: 10, ai0: 0 },
      expert: false,
      hbAnchor: { x: 900, y: 250 },   // = (头+尾)/2 中点（hbEntryOf :10298 同形）
    }], mkCam());
    const bar = barSpan(ctx.ops);
    expect(ctx.ops.filter((q) => q.kind === 'img').length).toBeGreaterThan(0);
    expect(bar.l).toBe(882);            // 900 - 18×1（vid 10 不在 BIG_SCALE）
    expect(bar.t).toBe(250);
    expect(bar.r).toBe(918);            // 882+36
    expect(bar.b).toBe(262);
    // 默认锚反事实:wy=100+50+10+HB_ADD_H[10]=100+50+10+8=168 ≠ 250
    expect(bar.t).not.toBe(168);
    expect(bar.alpha).toBeCloseTo(0.95);
  });
});

describe('BJ665c ③e 本体遗留面 + ④无锚回落默认锚（双面不回归）', () => {
  it('e.hbAnchor 直挂（entry 无锚,第 4 参缺省回退 e 本体面）仍生效', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = arm(rr);
    rr.flushEntityHealthBars([{
      e: { cx: 800, cy: 200, y: 170, h: 40, hp: 50, maxHp: 100, vanillaId: 1, ai0: 0,
        hbAnchor: { x: 840, y: 210 } },
      expert: false,
    }], mkCam());
    const bar = barSpan(ctx.ops);
    expect(bar.l).toBe(822);            // 840 - 18
    expect(bar.t).toBe(210);
  });

  it('无锚实体回落默认锚（vid 1: 782/220 = BJ664b 场景锁同值,跨件互证）', () => {
    const rr = r as unknown as FlushRenderer;
    const ctx = arm(rr);
    rr.flushEntityHealthBars([{
      e: { cx: 800, cy: 200, y: 170, h: 40, hp: 50, maxHp: 100, vanillaId: 1, ai0: 0 },
      expert: false,
    }], mkCam());
    const bar = barSpan(ctx.ops);
    expect(bar.l).toBe(782);            // 800-18（默认式 wx=e.cx-18·scale）
    expect(bar.t).toBe(220);            // 170+40+10（默认式 wy,HB_ADD_H[1] 无档）
  });
});

describe('BJ665c ⑤线源锚（wire 唯一性,防回插死线漂移）', () => {
  it('flush 解构补取 hbAnchor + 第 4 参直传（各恰一处;裸 drawHealthBar(e, expert, cam) 两参调用零残留）', () => {
    expect(rendererSrc.match(/for \(const \{ e, expert, hbAnchor \} of pass\) this\.drawHealthBar\(e, expert, cam, hbAnchor\);/g)?.length).toBe(1);
    expect(rendererSrc.match(/this\.drawHealthBar\(e, expert, cam\)/g) ?? []).toHaveLength(0);
    // drawHealthBar 内锚合并行 = 入参覆写 ∪ e 本体遗留面
    expect(rendererSrc).toMatch(/const hbA = hbAnchorOverride \?\? e\.hbAnchor;/);
    expect(rendererSrc).toMatch(/if \(hbA\) \{ wx = hbA\.x - 18 \* scale; wy = hbA\.y; \}/);
  });
});
