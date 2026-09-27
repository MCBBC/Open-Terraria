// ★BJ371 剃刀台风 409（2622）三症状落刀判别面（2026-09-27）：
//   ① 白底半透明大方块 = drawProjGhosts 预乘单笔 tintedTex(flatten=true) 把透明域
//      multiply 填成不透明白（页内微测 srcOpaquePx 5028→13872,探针
//      _bj371-typhoon-verdict M1）——修 = flatten=false（保 alpha 形状 =
//      XNA 预乘 src.rgb=tex.rgb×tex.a×color 语义）+ GHOST_TINT[409] (250,250,250)
//      + bodyAlpha 200/255（GetAlpha 409 恒色 P.cs:81148-81151）。
//   ② 缺旋转 = AI 节拍块 rotation += velocity.X×0.1f（:30878）整缺——修 = 子步
//      节拍块（localAI[1]>10 且 1/3 掷）+ draw 侧 rotate(spinRot)。
//   ③ 缺尾迹粒子 = 6× d217 缘尘（:30853-30871）整缺——修 = 同节拍块。
// 原版锚：Projectile.cs:30848-30951（AI）/ Main.cs:32539-32560（专用帧残影块）/
//   Projectile.cs:81148-81151（GetAlpha 恒色）/ Main.cs:8663（projFrames[409]=3）。
// 判别力：变异敏感（flatten 翻回 true → D 红；spin 系数 0.1→0.05 → A 红）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Arrow } from '../src/entities/Arrow';
import { GHOST_TINT, GHOST_PARAMS } from '../src/entities/projGhostTrail';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';
import type { VDust } from '../src/fx/VanillaDust';

// ---------------------------------------------------------------- hooks 桩
function mkHooks(enemies: unknown[] = []) {
  const dusts: Array<VDust & { type: number }> = [];
  const store = new TileStore(400, 400);
  const g = {
    world: { store } as never,
    player: { dead: false, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 20, h: 42 } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c = null, scale = 1, noGravity = false) => {
      const d = {
        active: true, x: _x, y: _y, vx: sx, vy: sy, type, scale, alpha,
        noGravity, fadeIn: 0, color: null, rotation: 0, fx: 0, fy: 0,
        followPlayer: false, followOnce: false, dyeVid: -1, noLight: false, noLightEmittance: false,
      } as unknown as VDust & { type: number };
      dusts.push(d);
      return d;
    },
    entities: { add: () => {}, projectiles: [] as unknown[] },
  } as unknown as GameHooks & { dusts: typeof dusts };
  return { g, dusts };
}

// ---------------------------------------------------------------- 记录型 ctx
type Call = { m: string; a: unknown[] };
function makeR() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === 'canvas') return undefined;
      return (...a: unknown[]) => { calls.push({ m: String(k), a }); };
    },
    set: (_t, k, v) => { calls.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  const r = { canvas: { getContext: () => ctx, width: 1280, height: 800 }, ctx, atlas: null };
  return { calls, r: r as never };
}
/** 烘焙画布桩（document.createElement——projFrameImg/tintedTex 双消费面） */
function stubDocWithRecordingCanvases() {
  const bakes: Array<Call[]> = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const prevDoc = g.document;
  g.document = {
    createElement: (): Record<string, unknown> => {
      const ops: Call[] = [];
      bakes.push(ops);
      const cv: Record<string, unknown> = {
        width: 0, height: 0,
        getContext: (): CanvasRenderingContext2D =>
          new Proxy({} as CanvasRenderingContext2D, {
            get: (_t, k) => ((...a: unknown[]) => { ops.push({ m: String(k), a }); }) as never,
            set: (_t, k, v) => { ops.push({ m: `set:${String(k)}`, a: [v] }); return true; },
          }),
      };
      return cv;
    },
  };
  return { bakes, restore: () => { g.document = prevDoc; } };
}
const fakeImg = (w: number, h: number) =>
  ({ naturalWidth: w, naturalHeight: h, width: w, height: h, complete: true, src: '' });

// ---------------------------------------------------------------- 用例
describe('BJ371 剃刀台风 409（2622）', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('[A] 节拍块（恒触发档）：触发子步 spinRot += vx×0.1 / α−5 钳 50 / 帧=(L1/3)%3 / 6×d217+noLight', () => {
    const { g, dusts } = mkHooks();
    const a = new Arrow(1600, 1600, 6, 0, 85, 5, 409, { grav: 0 });
    for (let t = 0; t < 20; t++) a.fixedUpdate(1 / 60, g);   // 20 tick × 3 子步 = L1=60
    // 触发子步 = L1∈(10,60] = 50 次；无目标 → 速度方向不变 vx=速率
    // Σvx(触发子步) = Σ_{k=11..60}(6+0.0025(k−1)) = 304.3125 → spinRot=30.43125
    expect(a.spinRot).toBeCloseTo(30.43125, 4);
    expect(a.alpha).toBe(50);                                 // 255−5×50 → 钳 50（:30872-30877）
    const d217 = dusts.filter((d) => d.type === 217);
    expect(d217.length).toBe(300);                            // 6 粒×50 触发（:30853-30871）
    expect(d217.every((d) => d.noGravity && d.noLight)).toBe(true);
    expect(d217.every((d) => d.scale === 1.4)).toBe(true);
    expect((a as unknown as { ty409Frame: number }).ty409Frame)
      .toBe(Math.floor(60 / 3) % 3);                          // =2（:30879）
    // 速度爬升面不受节拍块扰动（:30949-30951 每子步 +0.0025）
    expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(6 + 60 * 0.0025, 4);
  });

  it('[B] 未触发面（掷不中/L1≤10）：零自旋/零尘/α 台账值不动', () => {
    const { g, dusts } = mkHooks();
    const a = new Arrow(1600, 1600, 6, 0, 85, 5, 409, { grav: 0 });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);           // rand(3)=2 恒不中
    for (let t = 0; t < 20; t++) a.fixedUpdate(1 / 60, g);    // L1=60>10 但掷不中
    expect(a.spinRot).toBe(0);
    expect(a.alpha).toBe(255);                                // PROJ_ALPHA0 台账初值
    expect(dusts.filter((d) => d.type === 217)).toHaveLength(0);
    expect((a as unknown as { ty409Frame: number }).ty409Frame).toBe(0);
    expect(a.lightRGB ?? null).toBeNull();
  });

  it('[C] GetAlpha 409 恒色档：GHOST_TINT[409]=(250,250,250)/aMul=1 + 专用帧残影参数 P(1,10,2,0.5)', () => {
    expect(GHOST_TINT[409]).toBeDefined();
    const t = GHOST_TINT[409]!({ id: 409, i: 1, start: 1, end: 10, fade: 0.6,
      ai0: 0, ai1: 0, timeLeft: 300, opacity: 1, bodyScale: 1, vxLen: 6, rng: () => 0 });
    expect(t).not.toBeNull();
    expect(t!.rgb).toEqual([250, 250, 250]);                  // :81148-81151 (250,250,250,200)
    expect(t!.aMul).toBe(1);                                  // A≡fade 档（200 侧由 bodyAlpha 承载）
    expect(GHOST_PARAMS[409]).toMatchObject({ start: 1, end: 10, step: 2, gScale: 0.5 });  // :32543-32556
  });

  it('[D] 绘制面：本体 rotate=spinRot（非速度角）+ 残影 5 槽 α=200/255×(10−i)/15 + 帧锚 sy=68×frame + 染面保形（destination-in=flatten false）', () => {
    const { g } = mkHooks();
    const a = new Arrow(1600, 1600, 6, 0, 85, 5, 409, { grav: 0 });
    setProjSpriteOverride(409, fakeImg(68, 204) as unknown as ImageBitmap);
    for (let t = 0; t < 20; t++) a.fixedUpdate(1 / 60, g);    // frame=2, spinRot≈30.43
    const doc = stubDocWithRecordingCanvases();
    try {
      const { calls, r } = makeR();
      a.draw(r as never, {} as never);
      const spin = a.spinRot;
      // ---- 本体姿态：rotate(spinRot) 在场，rotate(atan2(0,6)=0) 不在场 ----
      const rotVals = calls.filter((c) => c.m === 'rotate').map((c) => c.a[0] as number);
      expect(rotVals).toContain(spin);
      expect(rotVals).not.toContain(0);                       // 旧速度角档=0 → 已摘
      // ---- 残影 5 槽：9 参 drawImage + source-over + α=200/255×(10−i)/15 ----
      let gaCur = 1; let gcCur = 'source-over';
      const stack: Array<[number, string]> = [];
      const ghost: Array<{ ga: number; sy: number }> = [];
      for (const c of calls) {
        if (c.m === 'save') stack.push([gaCur, gcCur]);
        else if (c.m === 'restore') { const p = stack.pop(); if (p) { gaCur = p[0]; gcCur = p[1]; } }
        else if (c.m === 'set:globalAlpha') gaCur = c.a[0] as number;
        else if (c.m === 'set:globalCompositeOperation') gcCur = c.a[0] as string;
        else if (c.m === 'drawImage' && (c.a.length ?? 0) >= 9) {
          ghost.push({ ga: gaCur, sy: c.a[2] as number });    // (tex,sx,sy,sw,sh,...)
        }
      }
      const expFade = [9 / 15, 7 / 15, 5 / 15, 3 / 15, 1 / 15];   // i=1,3,5,7,9（:32547 步 2）
      expect(ghost).toHaveLength(5);
      expect(ghost.map((q) => q.ga).map((v) => +v.toFixed(6)))
        .toEqual(expFade.map((f) => +((200 / 255) * f).toFixed(6)));
      expect(ghost.every((q) => q.sy === 68 * 2)).toBe(true);     // 帧锚 y13=68×frame（:32544）
      // ---- 染面保形：每个 multiply 烘焙面必带 destination-in 回贴（flatten=false）----
      const tintBakes = doc.bakes.filter((ops) =>
        ops.some((c) => c.m === 'set:globalCompositeOperation' && c.a[0] === 'multiply'));
      expect(tintBakes.length).toBeGreaterThanOrEqual(1);
      for (const ops of tintBakes) {
        expect(ops.some((c) => c.m === 'set:globalCompositeOperation' && c.a[0] === 'destination-in')).toBe(true);
      }
      const styles = tintBakes.flatMap((ops) => ops
        .filter((c) => c.m === 'set:fillStyle').map((c) => String(c.a[0])));
      expect(styles).toContain('rgb(250,250,250)');           // GHOST_TINT[409] 染色值
    } finally {
      doc.restore();
    }
  });
});
