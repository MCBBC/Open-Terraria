// G9 MagicProj 贴图化回归（原版锚 = Main.DrawProj 通用分支 Main.cs:32360-32371：
// 中心锚 + proj.rotation + proj.scale；旋转模式表 PROJ_ROT_RIGHT 同 Arrow.draw）。
// Arrow 模块整体 mock（node 环境无 Image/document，懒加载真实链在 vitest 下恒 null），
// 逐条断言：projId 缺省兜底、朝右族 atan2+左行镜像、朝上族 +π/2、SetDefaults
// width/height/scale 采纳、多帧行切片帧推进、贴图未就绪回落圆点、傀儡帧冻结。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sprite: null as unknown as { width: number; height: number; naturalWidth: number; naturalHeight: number; complete: boolean } | null,
  frameImg: null as unknown as { width: number; height: number; naturalWidth: number; naturalHeight: number; complete: boolean } | null,
  frames: 1,
  frameCalls: [] as number[],
}));

vi.mock('../src/entities/Arrow', () => ({
  projSprite: () => mocks.sprite,
  projFrameImg: (_id: number, f: number) => { mocks.frameCalls.push(f); return mocks.frameImg; },
  projFrameCount: (_id: number) => mocks.frames,
  // 与 Arrow.ts:166 真实表同值（勿增删——旋转模式断言以此为基准）
  PROJ_ROT_RIGHT: new Set([16, 34, 190, 837, 1023]),
}));

import { MagicProj } from '../src/entities/MagicProj';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import type { Renderer } from '../src/render/Renderer';

/** fake 贴图（HTMLImageElement 就绪形态） */
const fakeImg = (w: number, h: number) => ({ width: w, height: h, naturalWidth: w, naturalHeight: h, complete: true });

interface Op { op: string; x?: number; y?: number; a?: number; dx?: number; dy?: number; dw?: number; dh?: number }

function makeCtx() {
  const ops: Op[] = [];
  return {
    ops,
    fillStyle: '',
    imageSmoothingEnabled: true,
    save() { ops.push({ op: 'save' }); },
    restore() { ops.push({ op: 'restore' }); },
    translate(x: number, y: number) { ops.push({ op: 'translate', x, y }); },
    rotate(a: number) { ops.push({ op: 'rotate', a }); },
    scale(x: number, y: number) { ops.push({ op: 'scale', x, y }); },
    drawImage(_img: unknown, dx: number, dy: number, dw: number, dh: number) { ops.push({ op: 'drawImage', dx, dy, dw, dh }); },
    beginPath() { ops.push({ op: 'beginPath' }); },
    arc(x: number, y: number, r: number) { ops.push({ op: 'arc', x, y }); void r; },
    fill() { ops.push({ op: 'fill' }); },
  };
}

/** Renderer 桩：draw 只取 canvas.getContext('2d') */
function makeRenderer(ctx: ReturnType<typeof makeCtx>) {
  return { canvas: { getContext: () => ctx } } as unknown as Renderer;
}

function makeGame(): GameHooks {
  const world = new World(64, 32, 42, '测试');
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
  } as unknown as GameHooks;
}

const drawOnce = (p: MagicProj) => {
  const ctx = makeCtx();
  p.draw(makeRenderer(ctx), {} as never);
  return ctx.ops;
};

beforeEach(() => {
  mocks.sprite = null;
  mocks.frameImg = null;
  mocks.frames = 1;
  mocks.frameCalls.length = 0;
});

describe('G9 MagicProj 贴图化', () => {
  it('projId 缺省（旧 7 参签名零改动兼容）：projId=0、判定盒 6×6、纯圆点兜底', () => {
    const p = new MagicProj(100, 100, 6, 0, 10, 45, '#A040FF');
    expect(p.projId).toBe(0);
    expect(p.w).toBe(6);
    expect(p.h).toBe(6);
    const ops = drawOnce(p);
    expect(ops.some((o) => o.op === 'arc')).toBe(true);
    expect(ops.some((o) => o.op === 'drawImage')).toBe(false);
  });

  it('projId>0 且贴图就绪：不画圆点，走 drawImage（Main.cs:32360-32371 中心锚）', () => {
    mocks.sprite = fakeImg(20, 30);
    // 837：朝右族（PROJ_ROT_RIGHT）、SetDefaults 26×26、scale 缺省 1
    const p = new MagicProj(100, 100, 6, 0, 10, 45, '#A040FF', 837);
    expect(p.w).toBe(26);
    expect(p.h).toBe(26);
    expect(p.drawScale).toBe(1);
    const ops = drawOnce(p);
    expect(ops.some((o) => o.op === 'drawImage')).toBe(true);
    expect(ops.some((o) => o.op === 'arc')).toBe(false);
    // translate = Center（x + w/2, y + h/2）
    const tr = ops.find((o) => o.op === 'translate')!;
    expect(tr.x).toBe(100 + 13);
    expect(tr.y).toBe(100 + 13);
    // 向右直飞：atan2(0,6)=0，无镜像
    const rot = ops.find((o) => o.op === 'rotate')!;
    expect(rot.a).toBeCloseTo(0, 6);
    expect(ops.some((o) => o.op === 'scale')).toBe(false);
    // 原生尺寸 × scale（dw=20 dh=30，非判定盒 26）
    const di = ops.find((o) => o.op === 'drawImage')!;
    expect(di.dw).toBe(20);
    expect(di.dh).toBe(30);
  });

  it('朝右族向左飞行：先 scale(-1,1) 再 rotate(π−ang)（spriteDirection 镜像语义）', () => {
    mocks.sprite = fakeImg(20, 30);
    const p = new MagicProj(100, 100, -6, 2, 10, 45, '#A040FF', 837);
    const ops = drawOnce(p);
    const sc = ops.find((o) => o.op === 'scale')!;
    expect(sc.x).toBe(-1);
    expect(sc.y).toBe(1);
    const rot = ops.find((o) => o.op === 'rotate')!;
    const ang = Math.atan2(2, -6);
    expect(rot.a).toBeCloseTo(Math.PI - ang, 6);
  });

  it('朝上族（默认档）：rotate = atan2(vy,vx) + π/2；SetDefaults scale 采纳', () => {
    mocks.sprite = fakeImg(10, 24);
    // 20：非 PROJ_ROT_RIGHT、4×4、scale 0.65（Vilethorn 弹档，aiStyle 1）
    const p = new MagicProj(100, 100, 6, 0, 10, 45, '#A040FF', 20);
    expect(p.w).toBe(4);
    expect(p.h).toBe(4);
    expect(p.drawScale).toBeCloseTo(0.65, 6);
    const ops = drawOnce(p);
    const rot = ops.find((o) => o.op === 'rotate')!;
    expect(rot.a).toBeCloseTo(Math.PI / 2, 6);
    expect(ops.some((o) => o.op === 'scale')).toBe(false);
    const di = ops.find((o) => o.op === 'drawImage')!;
    expect(di.dw).toBeCloseTo(10 * 0.65, 6);
    expect(di.dh).toBeCloseTo(24 * 0.65, 6);
  });

  it('多帧行：projFrameCount>1 走 projFrameImg 切片，帧号按 age/5 推进', () => {
    mocks.sprite = fakeImg(20, 30);
    mocks.frameImg = fakeImg(20, 10);   // 单帧行切片（原 30 高 3 帧 → 行高 10）
    mocks.frames = 3;                   // 837 真实帧行数（vanilla-projframes.json）
    const p = new MagicProj(100, 100, 6, 0, 10, 600, '#A040FF', 837);
    const game = makeGame();
    drawOnce(p);
    expect(mocks.frameCalls).toEqual([0]);
    for (let i = 0; i < 7; i++) p.fixedUpdate(1 / 60, game);
    drawOnce(p);
    expect(mocks.frameCalls).toEqual([0, Math.floor(7 / 5) % 3]);   // age=7 → 帧 1
  });

  it('贴图未就绪（未加载 / 零宽）：回落圆点兜底，不画半截贴图', () => {
    mocks.sprite = { width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: false };
    const p = new MagicProj(100, 100, 6, 0, 10, 45, '#A040FF', 837);
    let ops = drawOnce(p);
    expect(ops.some((o) => o.op === 'arc')).toBe(true);
    expect(ops.some((o) => o.op === 'drawImage')).toBe(false);
    // 多帧行族切片缺失（frameImg null）→ 退化整图；整图也未就绪 → 同样兜底
    mocks.frames = 3;
    mocks.sprite = null;
    ops = drawOnce(p);
    expect(ops.some((o) => o.op === 'arc')).toBe(true);
    expect(ops.some((o) => o.op === 'drawImage')).toBe(false);
  });

  it('联机傀儡：netPuppet 分支不推进 age（帧冻结在 0，同 Arrow.age 语义）', () => {
    mocks.sprite = fakeImg(20, 30);
    mocks.frameImg = fakeImg(20, 10);
    mocks.frames = 3;
    const p = new MagicProj(100, 100, 6, 0, 10, 600, '#A040FF', 837);
    p.netPuppet = true;
    const game = makeGame();
    for (let i = 0; i < 12; i++) p.fixedUpdate(1 / 60, game);   // 纯 netPuppetStep 外推
    drawOnce(p);
    expect(mocks.frameCalls).toEqual([0]);
  });
});
