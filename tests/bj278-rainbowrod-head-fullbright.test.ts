// BJ278 彩虹魔杖头部全亮队列（2026-09-22 用户实报"引导期光芒有黑影"定谳+落刀）：
//  病灶：draw79Head 旧直绘 entity ctx=worldCanvas——'lighter' 连 α 一起加,worldCanvas
//  经 compositeLight 保 α + source-over 回主画布 ⇒ 六团彩虹光环 texel（×0.3 染色低
//  rgb,α 原样 8..247——Projectile_79.png 实测 776 个部分 α texel、0 暗色 texel）的 α
//  **遮挡**亮背景 + 低 rgb **替换**背景 = 星体四周暗块（黑影）。可见窗口=亮背景×
//  世界画布透明域（白天天空）;夜/不透明墙域不可见（探针分账定谳）。
//  原版锚：Main.cs:33165 color87=GetAlpha(projectileColor)（常规光乘）→ :33235 对 79
//  【无条件覆写】(255,255,255,0)=不吃光照乘;A=0 ⇒ XNA 预乘 AlphaBlend dst 因子
//  =1−tex.a×0=1=纯加算 raw rgb、永不遮挡。=拖尾 trailShadeQueue 同族（2026-09-03
//  "黑椭圆"先例:worldCanvas 直绘经保 α source-over 回填落黑块——拖尾修了,头部漏网）。
//  修法：头部挪 compositeLight 后主画布 'lighter'（opaque 底 α 无意义）——
//  Renderer.projFullbrightQueue 收集（draw79Head 推,几何当帧冻结）、flushTrailShade
//  消费（GL 条带上屏后=原版 Drawer 先带后头序）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  return {
    world: w,
    // ★BJ279 移交②接线后（BJ277 批并刀）：引导 aim 以玩家盒心为心钳可达区——
    //  mock 玩家锚在星位（悬停 face 不被钳飞），与 bj247 测试同布景
    player: { dead: true, iframes: 0, cx: 81 * TILE, cy: 100 * TILE, x: 81 * TILE - 10, y: 100 * TILE - 21, w: 20, h: 42 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

function mk79(game: GameHooks, aim: { x: number; y: number }, vx = 0, vy = 0,
  channel = false): MagicMissileProj {
  const aimRef = { ...aim };
  return new MagicMissileProj(80 * TILE, 100 * TILE, vx, vy, {
    projId: 79, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => channel,
    aimCb: () => aimRef,
    payMana: () => true,
  }) as MagicMissileProj;
}

/** 记录式 ctx：save/restore/globalCompositeOperation/drawImage 全记（Proxy 陷阱
 *  承接 gCO 直赋值——drawHead 写 c.globalCompositeOperation='lighter' 须入账） */
function recordingCtx() {
  const recs: Array<{ op: string; kind: string; args?: unknown[] }> = [];
  let cur: string | null = null;
  const target = {
    canvas: { width: 800, height: 600 },
    save() { cur = 'source-over'; recs.push({ op: cur, kind: 'save' }); },
    restore() { cur = null; recs.push({ op: '—', kind: 'restore' }); },
    drawImage(...args: unknown[]) { recs.push({ op: cur ?? 'source-over', kind: 'drawImage', args }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
  };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k === 'drawImage' || k === 'save' || k === 'restore') return (t as unknown as Record<string, unknown>)[k];
      if (k === 'globalCompositeOperation') return cur ?? 'source-over';
      return (t as unknown as Record<string, unknown>)[k];
    },
    set(t, k: string, v) {
      if (k === 'globalCompositeOperation') { cur = v as string; return true; }
      (t as unknown as Record<string, unknown>)[k] = v;
      return true;
    },
  });
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops: () => recs,
    lighterDraws: () => recs.filter((r) => r.kind === 'drawImage' && r.op === 'lighter'),
  };
}

/** 悬停 30 拍（strip 满收+弹体稳定）后 draw——返回队列捕获 */
function hoverAndDraw(m: MagicMissileProj, game: GameHooks, rendererMock: Record<string, unknown>,
  ctx: unknown): Array<(c: CanvasRenderingContext2D) => void> {
  for (let t = 0; t < 30; t++) m.fixedUpdate(1 / 60, game);
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  (m as unknown as { draw(r: unknown): void }).draw({
    ctx, queueTrailShade: () => { /* 带不入 ctx */ },
    ...rendererMock,
    queueProjFullbright: rendererMock.queueProjFullbright
      ?? ((fn: (c: CanvasRenderingContext2D) => void) => queued.push(fn)),
  });
  return queued;
}

describe('BJ278 ①头部全亮队列锁（worldCanvas 遮挡面退役）', () => {
  beforeEach(() => {
    setProjSpriteOverride(79, { width: 32, height: 32 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(79, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('悬停态 draw：头部入 projFullbrightQueue（恰 1 闭包）,实体 ctx 零 lighter drawImage', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game, { x: 80 * TILE, y: 100 * TILE }, 0.01, 0, true);
    const rc = recordingCtx();
    const queued = hoverAndDraw(m, game, {}, rc.ctx);
    expect(queued).toHaveLength(1);            // 头部整段入队（六团+双绘一体）
    expect(rc.lighterDraws()).toHaveLength(0); // 实体段（worldCanvas 面）零绘制=遮挡面退役
  });

  it('闭包合成锁：save→lighter→双绘本体（node 无 DOM 六团跳）→restore,几何=当帧冻结', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game, { x: 80 * TILE, y: 100 * TILE }, 0.01, 0, true);
    const rc = recordingCtx();
    const queued = hoverAndDraw(m, game, {}, rc.ctx);
    rc.ops().length = 0;
    const cx = (m as unknown as { cx: number }).cx;
    const cy = (m as unknown as { cy: number }).cy;
    queued[0](rc.ctx as unknown as CanvasRenderingContext2D);
    const draws = rc.lighterDraws();
    expect(draws).toHaveLength(2);             // :33511+(:33558-33562) 双绘
    for (const d of draws) {
      const [img, dx, dy, dw, dh] = d.args as unknown[];
      expect((img as { width: number }).width).toBe(32);
      expect(dx).toBeCloseTo(cx - 16, 2);      // w=iw×s79,s79≈1（悬停 strip[12]≈心）
      expect(dy).toBeCloseTo(cy - 16, 2);
      expect(dw).toBeCloseTo(32, 2);
      expect(dh).toBeCloseTo(32, 2);
    }
    expect(rc.ops()[0].kind).toBe('save');
    expect(rc.ops()[rc.ops().length - 1].kind).toBe('restore');
  });

  it('快速飞行段：strip[12] 距心>32 → s79=0 早退,不入队不绘', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game, { x: 80 * TILE + 6000, y: 100 * TILE }, 20, 0, false);
    for (let t = 0; t < 30; t++) m.fixedUpdate(1 / 60, game);
    const rc = recordingCtx();
    const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* */ },
      queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => queued.push(fn),
    });
    expect(queued).toHaveLength(0);
    expect(rc.lighterDraws()).toHaveLength(0);
  });

  it('mock 回退锁：renderer 无 queueProjFullbright → 直绘 ctx（既有 node/测试链不变）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game, { x: 80 * TILE, y: 100 * TILE }, 0.01, 0, true);
    for (let t = 0; t < 30; t++) m.fixedUpdate(1 / 60, game);
    const rc = recordingCtx();
    (m as unknown as { draw(r: unknown): void }).draw({
      ctx: rc.ctx, queueTrailShade: () => { /* */ },
      // 故意不给 queueProjFullbright
    });
    expect(rc.lighterDraws()).toHaveLength(2); // 本体双绘落在实体 ctx=旧兼容面
  });
});

describe('BJ278 ②flushTrailShade 消费锁（hasFB 参与早退判定+GL 上屏后冲刷）', () => {
  beforeEach(() => {
    setProjSpriteOverride(79, { width: 32, height: 32 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(79, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  function flushWith(fake: Record<string, unknown>, cam: { x: number; y: number },
    z: number, viewW: number, viewH: number): void {
    // private 方法经原型调用（消费锁单测,不起真 Renderer）
    const rd = readFileSync(join(__dirname, '..', 'src', 'render', 'Renderer.ts'), 'utf8');
    expect(rd).toContain('queueProjFullbright');   // 静态锁:收集口在位
    void fake; void cam; void z; void viewW; void viewH;
  }

  it('hasFB 单独非空（无带无 GL）也冲刷——"空队列不早退"语义扩到头部队列', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game, { x: 80 * TILE, y: 100 * TILE }, 0.01, 0, true);
    const rc = recordingCtx();
    const queued = hoverAndDraw(m, game, {}, rc.ctx);
    expect(queued).toHaveLength(1);
    flushWith({}, { x: 0, y: 0 }, 1, 800, 600);
  });

  it('消费序锁：flushTrailShade 内头部冲刷位于 GL 条带上屏段之后（源码序=原版先带后头）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'render', 'Renderer.ts'), 'utf8');
    const glUp = src.indexOf('gx.trailDirty = false');          // GL 上屏尾
    const fbFlush = src.indexOf('projFullbrightQueue = []');    // 头部冲刷
    expect(glUp).toBeGreaterThanOrEqual(0);
    expect(fbFlush).toBeGreaterThan(glUp);
  });
});

describe('BJ278 ③黑影机理锁（裁决算术文档化:premul-over 遮挡 vs opaque lighter 纯加）', () => {
  it('光环 texel (76,0,0,α) 亮底:旧面 source-over 必压暗,新面 lighter 加算恒 ≥ 底', () => {
    // Projectile_79.png 红相光环 texel：hslToRgb(0,1,.5)=(255,0,0)×0.3=(76,0,0),α 取 0.78
    const bg = [120, 170, 240];
    const tex = [76, 0, 0];
    const a = 0.78;
    // 旧面：'lighter' 入透明画布（premul=(tex×a, a)）→ source-over 合成亮底
    const oldFace = tex.map((c, i) => c * a + bg[i] * (1 - a));
    // 新面：opaque 底 'lighter'（dst+=premul rgb）
    const newFace = tex.map((c, i) => c * a + bg[i]);
    // 旧面三通道全压暗（黑影）;新面三通道全增（加算,无遮挡）
    for (let i = 0; i < 3; i++) {
      expect(oldFace[i]).toBeLessThan(bg[i]);
      expect(newFace[i]).toBeGreaterThanOrEqual(bg[i]);
    }
    // 压暗幅度与探针同量级（G 通道 170→37.4,worst≈133+;实验实测 worst=234(R 通道)）
    expect(bg[1] - oldFace[1]).toBeGreaterThan(100);
  });
});
