// ★红魔鬼三叉戟 115 两案判别锁（2026-10-13 用户实报「三叉戟贴图是反的+越来越大」）。
//  定谳（反编译 1457 唯一标杆,1456 世代行号 :24806-24826/:24753 已按 1457 重锚）：
//  ① 原版「变大」机制=AI_027 呼吸脉冲（Projectile.cs:26849-26891）：localAI[1]≥15
//    门起（:26849 if(<15)++ else{脉动}）,phase0 scale−0.02/α+30（≥250→钉 255 翻相,
//    :26870-26879）/ phase1 scale+0.02/α−30（≤0→钉 0 翻相,:26880-26889）。α 出场
//    255（SetDefaults :2047）经 GetAlpha A 通道直通=【不透明】（:81444-81456
//    `new Color(255,255,255,alpha)`）→ 首脉冲拍即翻相 1,scale 有界 [0.98,1.16]
//    往复——原版只有 18% 呼吸,【非无界增大】;闪烁相位=小而实/大而隐。
//  ② 本仓两案同根（Dart.ts dartStep 旧码）：
//    - 病根 A：通用渐入 fade −50/t（原版 115 α 唯一写面=脉冲,无渐入）→ 脉冲
//      phase0 的 α+30 永追不上 250 翻相门 → pulseDir 钉死 0 → scale −0.02/t
//      无界缩 → ~65 拍过零负 scale → drawImage 负宽高=贴图镜像（「反的」）,
//      且 |scale| 过零后无界涨（「越来越大」）;
//    - 病根 B：draw 通用 ga=(255−α)/255 与 GetAlpha A=α 直通语义相反（闪烁
//      相位颠倒;Arrow 载体 BJ236 判例 case 116/132/156/157/173 同梯=α/255）。
//  ③ 刀（Dart.ts）：fade 豁免列收编 115 / 脉冲门改挂 localAI[1] 镜像 ai115L1 /
//    draw 115 专属支（阶梯+projFullbrightQueue source-over,BJ530 44 判例同构）/
//    DART_STYLE[115] 摘 fade:50。本文件锁 ①态机逐值 ②有界性（两案判别）
//    ③fade 摘除 ④draw 阶梯/傀儡档。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Dart } from '../src/entities/Dart';
import { setProjSpriteOverride } from '../src/entities/Arrow';

function dartHooks() {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 70, 2); // 地板(70 行)
  const player = { x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16, dead: false, vx: 0, vy: 0 };
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: () => {} },
  } as never;
  return { hooks, player };
}

/** 记录式 ctx（save/translate/rotate/globalAlpha/drawImage 全记,无 DOM） */
function recordingCtx() {
  const recs: Array<{ op: string; args?: unknown[] }> = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect() {}, strokeRect() {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recs };
}

/** 捕获式 draw：返回实体层记录 + projFullbrightQueue 闭包 */
function drawCaptured(d: Dart): {
  entityDraws: Array<{ op: string; args?: unknown[] }>;
  queued: Array<(c: CanvasRenderingContext2D) => void>;
} {
  const rc = recordingCtx();
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  d.draw({
    ctx: rc.ctx,
    mainPlayer: undefined,
    queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
  } as never, {} as never);
  return { entityDraws: rc.recs, queued };
}

describe('115 呼吸脉冲态机（AI_027 :26849-26891）', () => {
  it('fade 摘除锁：脉冲起拍（t11）前 α 恒 255——原版无通用渐入（旧病 −50/t 归零）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    for (let i = 0; i < 5 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    expect(d['alpha']).toBe(255);
    for (let i = 0; i < 5 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    expect(d['alpha']).toBe(255);
  });

  it('态机逐值锁：t11 首脉冲拍 phase0（scale 0.98/α 钉 255/翻相 1）→ t20 峰（1.16/α 0）→ t29 谷（0.98/α 255）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    for (let i = 0; i < 11 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    expect(d['ai115L1']).toBe(15);                 // localAI[1] 镜像到 15（:26849 门）
    expect(d['scale']).toBeCloseTo(0.98, 6);       // phase0 −0.02（:26872）
    expect(d['alpha']).toBe(255);                  // min(255,285) 钉值（:26876）
    expect(d['pulseDir']).toBe(1);                 // 翻相（:26877,α 出场 255=A 直通不透明）
    for (let i = 0; i < 9 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);  // → t20
    expect(d['scale']).toBeCloseTo(1.16, 6);       // phase1 9 拍 +0.02（:26882）
    expect(d['alpha']).toBe(0);                    // ≤0 钉 0（:26886）
    for (let i = 0; i < 9 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);  // → t29
    expect(d['scale']).toBeCloseTo(0.98, 6);
    expect(d['alpha']).toBe(255);                  // ≥250 钉 255（:26876）
  });

  it('两案判别锁：全寿命 scale 有界 [0.98,1.16] 永不过零（过零=drawImage 负宽高镜像+|scale| 无界涨根因）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < 300 && !d.dead; i++) {
      d.fixedUpdate(1 / 60, hooks);
      mn = Math.min(mn, d['scale']); mx = Math.max(mx, d['scale']);
    }
    expect(mn).toBeGreaterThanOrEqual(0.98 - 1e-9);
    expect(mx).toBeLessThanOrEqual(1.16 + 1e-9);
  });
});

describe('115 draw GetAlpha 阶梯（P.cs:81444-81456）+ capture 复绘（BJ530 44 判例同构）', () => {
  beforeEach(() => {
    setProjSpriteOverride(115, { width: 16, height: 16 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(115, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('l1<5 → Transparent 档：不入队不绘（:81450-81453）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    const { entityDraws, queued } = drawCaptured(d);
    expect(queued).toHaveLength(0);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
  });

  it('灰梯档 ga=(l1−5)/10：6 拍 l1=10 → ga=0.5（:81454 灰梯 num13 直通）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    for (let i = 0; i < 6 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    expect(d['ai115L1']).toBe(10);
    const { queued } = drawCaptured(d);
    expect(queued).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBeCloseTo(0.5, 6);
  });

  it('≥15 档 A=α 直通：t12 α=225 → ga=225/255（旧通用 (255−α)/255≈0.118 相位反证不在案）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    for (let i = 0; i < 12 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    expect(d['alpha']).toBe(225);                  // phase1 首拍（:26883 −30）
    const { queued } = drawCaptured(d);
    expect(queued).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBeCloseTo(225 / 255, 6);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha)
      .not.toBeCloseTo((255 - 225) / 255, 3);
  });

  it('傀儡恒定档：netPuppet 不跑 dartStep（ai115L1 恒 0）→ 按 ≥15 档 α/255=1 直绘', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    (d as unknown as { netPuppet: boolean }).netPuppet = true;
    const { queued } = drawCaptured(d);
    expect(queued).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
  });

  it('实体层零 drawImage（乘光面退役,GetAlpha RGB 恒白不读光照）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    for (let i = 0; i < 6 && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
    const { entityDraws } = drawCaptured(d);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
  });
});
