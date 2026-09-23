// BJ314 弧族染色烘焙记忆化闸门（2026-09-23 用户实报「永夜刃挥起来很卡,像 CPU 软像素」）。
// 落刀=SwingArc.tintedFrame 由「单共享 GPU scratch 每层每帧重烘」改「(img,frame,rgb 整型)
// 记忆化 + 有界 LRU 65 + texReady 毒化守卫」——键=fillStyle 截断后的同一输入 ⇒ 缓存命中
// 输出与现烘逐字节恒等（落刀前后 FNV-1a 全等实拍,scripts/_bj314-hash.mjs）;烘焙输出只
// 依赖 (img,frame,rgb 整型)——alpha 全在 globalAlpha 链不进烘焙。
// 闸门面：
//   ① 命中恒等：同 (img,frame,rgb) 二次绘制零新增画布零烘焙指令（★变异判别:摘缓存
//      → multiply/destination-in 指令在二绘重现=红）。
//   ② 键=rgb 整型截断（fillStyle 本就 |0）：10.6 与 10 同键。
//   ③ texReady 守卫：width=0 半加载 img 零烘焙不入缓存（texId.ts 头注「淡色方片」判例）。
//   ④ LRU 有界：>64 键逐条淘汰最旧（禁整表 clear,C6 哨兵案纪律）,热键驻留。
//   ⑤ 跨 img 键隔离（texId 进键,素材包换图不串色）。
//   ⑥ 层 α 不进键（alpha 全在 globalAlpha 链）且主面 α 仍逐层直传。
// 无 jsdom——fake-DOM 记账（sword-trail-tint.test.ts 同法,动态 import 前先装 DOM）。
import { describe, it, expect } from 'vitest';

class RecCtx2d {
  ops: Array<{ op: string; args: unknown[] }> = [];
  private gco = 'source-over';
  private alpha = 1;
  private fs = '';
  clearRect(...a: unknown[]): void { this.ops.push({ op: 'clearRect', args: a }); }
  drawImage(...a: unknown[]): void { this.ops.push({ op: `draw:${this.gco}`, args: a }); }
  fillRect(...a: unknown[]): void { this.ops.push({ op: `fillRect:${this.gco}:${this.fs}`, args: a }); }
  save(): void { this.ops.push({ op: 'save', args: [] }); }
  restore(): void { this.ops.push({ op: 'restore', args: [] }); }
  translate(...a: unknown[]): void { this.ops.push({ op: 'translate', args: a }); }
  rotate(...a: unknown[]): void { this.ops.push({ op: 'rotate', args: a }); }
  scale(...a: unknown[]): void { this.ops.push({ op: 'scale', args: a }); }
  set imageSmoothingEnabled(_v: boolean) { /* 记账面不消费 */ }
  get globalCompositeOperation(): string { return this.gco; }
  set globalCompositeOperation(v: string) { this.gco = v; }
  get globalAlpha(): number { return this.alpha; }
  set globalAlpha(v: number) { this.ops.push({ op: 'alpha', args: [v] }); this.alpha = v; }
  get fillStyle(): string { return this.fs; }
  set fillStyle(v: string) { this.fs = v; }
}

interface Tracker { created: RecCtx2d[]; count(): number }
let tracker: Tracker | null = null;
function installFakeDom(): Tracker {
  const created: RecCtx2d[] = [];
  tracker = {
    created,
    count: () => created.length,
  };
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string) {
      const ctx = new RecCtx2d();
      created.push(ctx);
      return { width: 0, height: 0, getContext(k: string) { return k === '2d' ? ctx : null; } };
    },
  };
  return tracker;
}

const mkLayer = (rgb: [number, number, number], frame = 0, alpha = 0.5) =>
  ({ frame, rotAi: 0, rotAbs: 0, scale: 1, rgb, alpha });

describe('BJ314 弧族染色烘焙记忆化', () => {
  it('① 命中恒等：同 (img,frame,rgb) 二次 drawArcLayers 零新增画布（摘缓存变异→红）', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    const layers = mod.arcLayerList(972, 0.3, 0.5, 0.5);
    const before1 = t.count();   // 模块导入期画布（Renderer/GLSpriteLayer 模块级 scratch）不计
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, layers);
    expect(t.count() - before1).toBe(5);   // 972 五层可见（α≥0.004）→ 5 键 5 烘焙
    const before2 = t.count();
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 50, 50, 1, 1, 1.1, layers);
    expect(t.count() - before2).toBe(0);   // 二绘全命中——零烘焙零新建
  });

  it('② 键=rgb 整型截断（fillStyle 本就 |0）：10.6 与 10 同键命中', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    const before = t.count();
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([10.6, 20, 30])]);
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([10, 20, 30])]);
    expect(t.count() - before).toBe(1);
  });

  it('③ texReady 守卫：width=0 半加载 img 零烘焙不入缓存（texId.ts 头注判例）', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const badImg = { width: 0, height: 680 };
    const before = t.count();
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      badImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([40, 20, 60])]);
    expect(t.count() - before).toBe(0);
  });

  it('④ LRU 有界：>64 键逐条淘汰（FIFO,热键驻留,冷键重烘）', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    const before = t.count();
    for (let i = 0; i < 70; i++) {
      mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
        fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([i + 1, 200, 255])]);
    }
    // 计数=本次新建画布（淘汰只缩活性集合）:70 键=70 新建;活性集=最后 65 键（6..70）
    expect(t.count() - before).toBe(70);
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([1, 200, 255])]);    // 冷键（已淘汰）重烘 +1
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([70, 200, 255])]);   // 热键命中 +0
    expect(t.count() - before).toBe(71);
  });

  it('⑤ 跨 img 键隔离：不同贴图实例同 rgb 各自烘焙（素材包换图不串色）', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const imgA = { width: 170, height: 680 };
    const imgB = { width: 170, height: 680 };
    const before = t.count();
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      imgA as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([40, 20, 60])]);
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      imgB as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([40, 20, 60])]);
    expect(t.count() - before).toBe(2);
  });

  it('⑥ 层 α 不进键（alpha 全在 globalAlpha 链）且主面 α 逐层直传不变', async () => {
    const t = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    const before = t.count();
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([40, 20, 60], 0, 0.5)]);
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, [mkLayer([40, 20, 60], 0, 0.1)]);
    expect(t.count() - before).toBe(1);
    const alphas = main.ops.filter((o) => o.op === 'alpha').map((o) => o.args[0] as number);
    expect(alphas).toContain(0.5);
    expect(alphas).toContain(0.1);
  });
});
