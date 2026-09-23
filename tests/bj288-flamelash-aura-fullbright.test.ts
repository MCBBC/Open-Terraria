// BJ288 34 白热充能光环收编全亮队列（红蓝 T1 漏修#2;与 BJ278 79 黑影同族）：
//  原版 Main.cs:33680-33694：color105=(255,255,255,127)×0.75=(191,191,191,95) 固定色
//  【无 GetAlpha 光乘】=全亮;XNA 预乘 AlphaBlend：rgb 面 191/255 恒加算、α 面 95/255
//  只进 dst 衰减因子（1−texA×95/255）。旧直绘 worldCanvas source-over+ga=α 面 0.373
//  = 被 compositeLight 光乘 + rgb 减半 + 遮挡亮背景。修 = 收编 BJ278
//  projFullbrightQueue（compositeLight 后主画布 'lighter' 加算,ga=rgb 面 191/255;
//  α 面 dst 衰减在 opaque 加算底不可表达 = 79 A=0 同族登记残差）。
//  node 无 DOM → document 桩供 whiteHot34/projFrameImg 的 canvas 烘焙面（tinted79
//  "六团跳"同族处置——本文件光环四团经桩全可绘,几何/固定色/α 面逐参断言）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { MagicMissileProj } from '../src/entities/MissileProj';
import type { GameHooks } from '../src/entities/types';

function emptyWorld(): World {
  const w = new World(400, 400, 30, 'open');
  for (let x = 0; x < 400; x++) w.store.setTileSilent(x, 380, 1, 0, 0);
  return w;
}

function makeGame(w: World): GameHooks {
  // 玩家锚在弹位（盒心=光标 → 引导钳恒等,悬停面不被钳飞;bj278 同布景）
  return {
    world: w,
    player: { dead: true, iframes: 0, cx: 80 * TILE, cy: 100 * TILE, x: 80 * TILE - 10, y: 100 * TILE - 21, w: 20, h: 42 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

/** document 桩（node 无 DOM）：createElement 返回无实绘 canvas 壳——
 *  只保 width/height 通道与 no-op 2d 上下文 */
function stubDocument(): void {
  vi.stubGlobal('document', {
    createElement: (_tag: string) => ({
      width: 32, height: 32,
      getContext: () => ({
        imageSmoothingEnabled: false,
        globalCompositeOperation: 'source-over',
        fillStyle: '',
        drawImage() { /* no-op */ },
        fillRect() { /* no-op */ },
      }),
    }),
  });
}

/** 记录式 ctx：save/restore/translate/rotate/drawImage + gCO/globalAlpha 直赋全记
 *  （drawImage 捕获当刻 gCO/ga——闭包面逐参断言用;save/restore 栈式=
 *  内层四团 save/restore 不清外层 'lighter' 面） */
function recordingCtx() {
  const recs: Array<{ kind: string; args?: unknown[]; gco?: string; ga?: number }> = [];
  let gco: string | null = null;
  let ga = 1;
  const stack: Array<{ gco: string | null; ga: number }> = [];
  const target = {
    canvas: { width: 800, height: 600 },
    save() { stack.push({ gco, ga }); recs.push({ kind: 'save' }); },
    restore() {
      const s = stack.pop();
      if (s) { gco = s.gco; ga = s.ga; }
      recs.push({ kind: 'restore' });
    },
    translate(...args: unknown[]) { recs.push({ kind: 'translate', args }); },
    rotate(...args: unknown[]) { recs.push({ kind: 'rotate', args }); },
    drawImage(...args: unknown[]) { recs.push({ kind: 'drawImage', args, gco: gco ?? 'source-over', ga }); },
    imageSmoothingEnabled: false,
  };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k === 'globalCompositeOperation') return gco ?? 'source-over';
      if (k === 'globalAlpha') return ga;
      return (t as unknown as Record<string, unknown>)[k];
    },
    set(t, k: string, v) {
      if (k === 'globalCompositeOperation') { gco = v as string; recs.push({ kind: 'gco', args: [v] }); return true; }
      if (k === 'globalAlpha') { ga = v as number; recs.push({ kind: 'ga', args: [v] }); return true; }
      (t as unknown as Record<string, unknown>)[k] = v;
      return true;
    },
  });
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops: () => recs,
    draws: (gcoWant?: string) => recs.filter((r) => r.kind === 'drawImage' && (!gcoWant || r.gco === gcoWant)),
  };
}

/** 悬停 34（v=0,rot=0,frame=0）+ redT 直置（draw 面锁不需 AI 链） */
function mk34(game: GameHooks, redT: number): MagicMissileProj {
  const m = new MagicMissileProj(80 * TILE, 100 * TILE, 0, 0, {
    projId: 34, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => true, aimCb: () => ({ x: 80 * TILE, y: 100 * TILE }), payMana: () => true,
  }) as MagicMissileProj;
  (m as unknown as { redT: number })['redT'] = redT;
  return m;
}

describe('BJ288 ①34 白热光环入全亮队列（worldCanvas 直绘面退役）', () => {
  beforeEach(() => {
    setProjSpriteOverride(34, { width: 32, height: 32 } as unknown as HTMLImageElement);
    stubDocument();
  });
  afterEach(() => {
    setProjSpriteOverride(34, { width: 0, height: 0 } as unknown as HTMLImageElement);
    vi.unstubAllGlobals();
  });

  it('redT>0 悬停 draw：光环整段入 projFullbrightQueue（恰 1 闭包）,实体 ctx 只剩本体 1 绘', () => {
    const game = makeGame(emptyWorld());
    const m = mk34(game, 10);
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* 带不入 ctx */ },
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => queued.push(fn),
    });
    expect(queued).toHaveLength(1);              // 光环四团整段入队（BJ278 79 头部同族）
    expect(rc.draws('lighter')).toHaveLength(0); // 实体段（worldCanvas 面）零 lighter=光乘遮挡面退役
    expect(rc.draws()).toHaveLength(1);          // 只剩本体 1 绘（旧实现=光环 4+本体 1）
  });

  it('闭包合成锁：save→lighter→ga=191/255（color105.rgb 面）→4 绘（几何=当帧冻结）→restore', () => {
    const game = makeGame(emptyWorld());
    const m = mk34(game, 10);
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* */ },
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => queued.push(fn),
    });
    const rc2 = recordingCtx();
    queued[0](rc2.ctx);
    const ops = rc2.ops();
    expect(ops[0].kind).toBe('save');
    expect(ops.some((o) => o.kind === 'gco' && o.args![0] === 'lighter')).toBe(true);
    expect(ops.some((o) => o.kind === 'ga' && o.args![0] === 191 / 255)).toBe(true);  // rgb 面（α 面 95/255→dst 因子,不建模见头注）
    expect(ops[ops.length - 1].kind).toBe('restore');
    // 四团几何：悬停 v=0 → lerpS=0 → drawRot=0、t2d=1；anchor=vector81=(cx,cy)；
    // offset=(4,0) 转 drawRot+k·π/2 → (4,0)/(0,4)/(−4,0)/(0,−4)；drawImage=白模中心原点 scale16
    const draws = rc2.draws('lighter');
    expect(draws).toHaveLength(4);
    const cx = 80 * TILE + 16, cy = 100 * TILE + 16;
    const wantOff = [[4, 0], [0, 4], [-4, 0], [0, -4]];
    for (let k = 0; k < 4; k++) {
      const [img, dx, dy, dw, dh] = draws[k].args as [HTMLCanvasElement, number, number, number, number];
      expect(img.width).toBe(32);                              // whiteHot34 白模（本体帧 source-in 等价合成）
      expect(dw).toBe(32);                                     // rw=wf.width×t2d=32
      expect(dh).toBe(5);                                      // rh=wf.height×t2d（PROJ_FRAMES[34]=6 → 帧高 5）
      expect(dx).toBeCloseTo(-dw / 2, 6);                      // origin=帧心
      expect(dy).toBeCloseTo(-dh / 2, 6);
      const tr = ops.filter((o) => o.kind === 'translate')[k].args as number[];
      expect(tr[0]).toBeCloseTo(cx + wantOff[k][0], 6);        // vector81 + spinningpoint12.RotatedBy(k·π/2)
      expect(tr[1]).toBeCloseTo(cy + wantOff[k][1], 6);
      const rot = ops.filter((o) => o.kind === 'rotate')[k].args as number[];
      expect(rot[0]).toBe(0);                                  // num340=drawRot（悬停=0）
    }
  });

  it('redT=0（t2d=0）：不入队不绘光环（:33682 GetLerpValue 门）', () => {
    const game = makeGame(emptyWorld());
    const m = mk34(game, 0);
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* */ },
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => queued.push(fn),
    });
    expect(queued).toHaveLength(0);
    expect(rc.draws()).toHaveLength(1);          // 只剩本体
  });

  it('mock 回退锁：renderer 无 queueProjFullbright → 直绘实体 ctx（既有 node/测试链不变）', () => {
    const game = makeGame(emptyWorld());
    const m = mk34(game, 10);
    const rc = recordingCtx();
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* */ },
      // 故意不给 queueProjFullbright
    });
    const draws = rc.draws('lighter');
    expect(draws).toHaveLength(4);               // 光环四团落实体 ctx=旧兼容面
    for (const d of draws) expect(d.ga).toBe(191 / 255);
  });
});
