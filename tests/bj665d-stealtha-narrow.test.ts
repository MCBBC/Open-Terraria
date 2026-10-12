// ★BJ665d hbPass entry 级 stealthA 幽灵类型字段收窄（2026-10-12,BJ665c 新登记债单刀清偿）。
//
// 债面（BJ665c 普查登记）：hbPass entry 级 `stealthA?: number`（旧 :6652 hbPass
// 数组类型 / :10414 flush 形参类型）——**零生产者**（4 个 hbPass.push 位 :6656/
// :6664/:6670/:6677 与 hbEntryOf 返回类型均不产）+ **零读者**（flush 解构只取
// { e, expert, hbAnchor }）= 纯幽灵类型字段（类型面谎报）。
//
// 定谳（普查表）：
//  · 玩家段（C13-F6 stealth×Bright α,Main.cs:46882-46900）与 NPC 段不共型驱动：
//    玩家 = remotePlayers 直驱（Renderer.ts :10436 直传 `stealthA: rp.stealth`
//    进 drawHealthBar e 形参面）;NPC = hbPass entry 包裹面（无潜行 α 面——原版
//    NPC 段 :46574-46983 无 stealth 消费）。
//  · 唯一真 stealthA 消费 = drawHealthBar e 级 `if (e.stealthA !== undefined)
//    aQ *= e.stealthA`（:10378）,生产者唯 remotePlayers 直驱对象字面量。
//  落刀 = 类型面拆分：entry 类型去 stealthA（两处）+ 注释钉明「玩家段不经 entry」;
//  drawHealthBar e 级 stealthA 保留（真实消费面,不动）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../src/render/Renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

// ---------------------------------------------------------------------------
// ① 类型面收窄锁（源码锚——类型级债的判别面即源码形;M1 回插即红）
// ---------------------------------------------------------------------------
describe('BJ665d ①entry 级 stealthA 收窄锁（类型诚实）', () => {
  it('entry 收窄形恰 2 处（hbPass 数组类型 + flush 形参）,旧含 stealthA 形零残留', () => {
    expect((rendererSrc.match(/Array<\{ e: Enemy \| TownNPC; expert: boolean; hbAnchor\?: \{ x: number; y: number \} \}>/g) ?? []).length).toBe(2);
    expect(rendererSrc.match(/hbAnchor\?: \{ x: number; y: number \}; stealthA\?: number \}/g) ?? []).toHaveLength(0);
  });

  it('全库 `stealthA?: number` 声明恰 1 处 = drawHealthBar e 级（真实消费面保留）', () => {
    expect((rendererSrc.match(/stealthA\?: number/g) ?? []).length).toBe(1);
    const i = rendererSrc.indexOf('private drawHealthBar(');
    expect(rendererSrc.slice(i, i + 600)).toMatch(/stealthA\?: number/);
  });

  it('玩家直驱唯一点名：`stealthA: rp.stealth` 恰 1 处（remotePlayers 直驱,C13-F6 唯一生产位）', () => {
    expect((rendererSrc.match(/stealthA: rp\.stealth/g) ?? []).length).toBe(1);
    expect(rendererSrc).toMatch(/for \(const rp of this\.remotePlayers\) \{/);
  });

  it('hbEntryOf 返回类型零 stealthA（产锚单源无幽灵面;切片止于类型面）', () => {
    const i = rendererSrc.indexOf('private hbEntryOf(');
    // 类型面 = 签名+返回类型+entry 声明（后续 doc 注释提及「stealthA 入参」属
    // drawHealthBar 消费面文档,不入本锁）
    const seg = rendererSrc.slice(i, rendererSrc.indexOf('if (e.dead', i));
    expect(seg).not.toMatch(/stealthA/);
  });
});

// ---------------------------------------------------------------------------
// ②消费面行为不变锁：玩家 stealth 血条 α 面（remotePlayers 直驱逐位回归）
// ---------------------------------------------------------------------------
type Op = { kind: 'img'; dx: number; dy: number; dw: number; dh: number; alpha: number };

const mkCam = () => ({
  x: 640, y: 360, zoom: 1, viewW: 1280, viewH: 720, punchX: 0, punchY: 0, flipY: false,
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x + this.punchX) * this.zoom + this.viewW / 2, (wy - this.y + this.punchY) * this.zoom + this.viewH / 2];
  },
});

let r: InstanceType<typeof Renderer>;

const arm = (remotePlayers: unknown[]) => {
  const ops: Op[] = [];
  const ctx = {
    globalAlpha: 1, imageSmoothingEnabled: true, globalCompositeOperation: 'source-over',
    fillStyle: '', textAlign: '', textBaseline: '', font: '',
    save() { /* noop */ }, restore() { /* noop */ }, setTransform() { /* noop */ },
    measureText() { return { width: 0 }; },
    fillRect() { /* noop */ }, fillText() { /* noop */ },
    drawImage(_i: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
      dx: number, dy: number, dw: number, dh: number) {
      ops.push({ kind: 'img', dx, dy, dw, dh, alpha: this.globalAlpha });
    },
  };
  const rr = r as unknown as {
    ctx: unknown; lighting: unknown; atlas: unknown; tintedSprite: unknown;
    remotePlayers: unknown[]; flushEntityHealthBars(pass: unknown, cam: unknown): void;
  };
  rr.ctx = ctx;
  rr.lighting = { lightAt: () => [255, 255, 255] };
  rr.atlas = { ensureVImage: () => ({ img: {} }) };
  (rr as unknown as { tintedSprite: () => unknown }).tintedSprite =
    () => ({ c: {}, x: 0, y: 0, w: 2, h: 12 });
  rr.remotePlayers = remotePlayers;
  rr.flushEntityHealthBars([], mkCam());   // NPC pass 空,玩家段独走 remotePlayers
  return ops;
};

describe('BJ665d ②玩家 stealth α 面行为锁（C13-F6 :46887 stealth×Brightness 直驱回归）', () => {
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

  const rp = (stealth: number) => ({
    cx: 700, cy: 300, y: 260, h: 40, hp: 50, maxHp: 100, dead: false, stealth,
  });

  it('stealth=0.5 → globalAlpha = 0.95×0.5 = 0.475（α 直乘面逐位）;条屏位 (682,310) 默认锚', () => {
    const ops = arm([rp(0.5)]);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops[0].alpha).toBeCloseTo(0.475);
    expect(Math.min(...ops.map((q) => q.dx))).toBe(682);   // 700-18（vid null→0,scale 1）
    expect(Math.min(...ops.map((q) => q.dy))).toBe(310);   // 260+40+10（默认锚,玩家无 1.5 档）
  });

  it('stealth=1 → 0.95;stealth=0.25 → 0.2375（α 随 stealth 线性,收窄零波及）', () => {
    expect(arm([rp(1)])[0].alpha).toBeCloseTo(0.95);
    expect(arm([rp(0.25)])[0].alpha).toBeCloseTo(0.2375);
  });

  it('NPC entry（无 stealthA 面）恒 0.95 全亮——收窄后 NPC/玩家两段分型不串', () => {
    const ops = arm([]);
    expect(ops.length).toBe(0);   // 空 pass + 空 remotePlayers = 零笔
    const rr = r as unknown as {
      ctx: unknown; lighting: unknown; atlas: unknown; tintedSprite: unknown;
      remotePlayers: unknown[]; flushEntityHealthBars(pass: unknown, cam: unknown): void;
    };
    const ops2: Op[] = [];
    const ctx = {
      globalAlpha: 1, imageSmoothingEnabled: true, globalCompositeOperation: 'source-over',
      fillStyle: '', textAlign: '', textBaseline: '', font: '',
      save() { /* noop */ }, restore() { /* noop */ }, setTransform() { /* noop */ },
      measureText() { return { width: 0 }; },
      fillRect() { /* noop */ }, fillText() { /* noop */ },
      drawImage(_i: unknown, _sx: number, _sy: number, _sw: number, _sh: number,
        dx: number, dy: number, dw: number, dh: number) {
        ops2.push({ kind: 'img', dx, dy, dw, dh, alpha: this.globalAlpha });
      },
    };
    rr.ctx = ctx;
    rr.lighting = { lightAt: () => [255, 255, 255] };
    rr.atlas = { ensureVImage: () => ({ img: {} }) };
    (rr as unknown as { tintedSprite: () => unknown }).tintedSprite =
      () => ({ c: {}, x: 0, y: 0, w: 2, h: 12 });
    rr.remotePlayers = [];
    rr.flushEntityHealthBars([{
      e: { cx: 800, cy: 200, y: 170, h: 40, hp: 50, maxHp: 100, vanillaId: 1, ai0: 0 },
      expert: false,
    }], mkCam());
    expect(ops2.length).toBeGreaterThan(0);
    expect(ops2[0].alpha).toBeCloseTo(0.95);   // NPC 无潜行 α 面（收窄面=类型诚实,行为零变）
  });
});
