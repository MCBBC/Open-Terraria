// ★BJ211 2026-09-20（BJ209 债②销账——DrawNPCDirect 通用大表 num57 圆周光晕环移植）
//
// 定谳（Terarria1457 Main.cs :23400-23701 亲读；Terarria1458 同段逐锚同号=零变更）：
//   · 通用大表 switch(:23419-23626) 置 num57/num59/num58/num60/color10/amount/
//     amount2，:23645-23656 num74 循环画【本体帧】环拷贝（非 oldPos 域）。
//   · 参与 id 全集 = 426/523/541/568/569/618(两相)/620/661；大表其余 id num57 恒 0。
//   · 568/569 出生相（lai3<60）紫加算环 = drawWitherBirth（已承载）；≥60 常态环=本刀。
//   · 541/568/569/661 GlowMask 轨道环 = NPC_GLOW_ORBIT（已承载，另域不重测）。
//   · 618 Extra_59 白红双闪 = drawDreadnautilusFlash（本刀 1:1 重写：半径 25·p/双环/
//     ×1.8·1.5 系数/rotation=轨道极角）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import {
  NPC_AURA_RINGS, NPC_AURA_RING_IDS, npcAuraRingParams,
  drawNpcAuraRings, drawDreadnautilusFlash,
} from '../src/render/npcExtraParts';
import type { NpcAuraOpts } from '../src/render/npcExtraParts';

// ===================== 测试具装 =====================
function recorder() {
  const ops: Array<Record<string, unknown>> = [];
  let alpha = 1;
  let comp = 'source-over';
  const ctx = {
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    translate: (x: number, y: number) => ops.push({ op: 'translate', x, y }),
    rotate: (r: number) => ops.push({ op: 'rotate', r }),
    scale: (x: number, y: number) => ops.push({ op: 'scale', x, y }),
    drawImage: (img: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number) => ops.push({ op: 'draw', img, sx, sy, sw, sh, dx, dy, alpha }),
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    set(v: number) { alpha = v; ops.push({ op: 'alpha', v }); },
    get() { return alpha; },
  });
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    set(v: string) { comp = v; ops.push({ op: 'composite', v }); },
    get() { return comp; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const atlasStub = {
  ensureVImage: (_k: string) => ({ width: 64, height: 128 }),
} as never;

const FRAME = { sx: 0, sy: 0, sw: 32, sh: 32 };
const OPT: NpcAuraOpts = { scale: 1, addY: 0, opacity: 1 };

function draws(ops: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return ops.filter((o) => o.op === 'draw');
}
function composites(ops: Array<Record<string, unknown>>): string[] {
  return ops.filter((o) => o.op === 'composite').map((o) => o.v as string);
}
function alphas(ops: Array<Record<string, unknown>>): number[] {
  return ops.filter((o) => o.op === 'alpha').map((o) => o.v as number);
}

/** 环参数快捷入口（scale=vanilla.scale×vanillaScale） */
function P(id: number, s: Partial<Parameters<typeof npcAuraRingParams>[1]> = {}) {
  return npcAuraRingParams(id, {
    ai0: 0, ai1: 0, ai2: 0, animT: 0, lai3: 60, tSec: 0, scale: 1, ...s,
  });
}

// ===================== A. id 集合结构锁 =====================
describe('BJ211-A num57 环参与 id 全集结构锁（Main.cs:23419-23626 case 钉值）', () => {
  it('全集 = {426,523,541,568,569,618,620,661} 八 id', () => {
    expect([...NPC_AURA_RING_IDS].sort((a, b) => a - b))
      .toEqual([426, 523, 541, 568, 569, 618, 620, 661]);
  });

  it('大表其余 id num57 恒 0 = 无环（不在表）', () => {
    for (const id of [427, 428, 521, 542, 543, 544, 545, 546, 552, 553, 554, 555,
      556, 557, 558, 559, 560, 561, 562, 563, 566, 567, 570, 571, 572, 573, 574,
      575, 578, 581, 583, 584, 585]) {
      expect(NPC_AURA_RING_IDS.has(id), `id=${id}`).toBe(false);
    }
  });

  it('逐 id 关键档钉死（count/period/env/radius/tint/outA/特档）', () => {
    expect(NPC_AURA_RINGS[426]).toMatchObject({ count: 4, radius: 4, period: 1.2, env: 'half', outA: 255 });
    expect(NPC_AURA_RINGS[426]!.tint).toEqual([160, 240, 232]);      // lerp(White,Turquoise(64,224,208),0.5)
    expect(NPC_AURA_RINGS[523]).toMatchObject({ count: 3, radius: 10, scaleRadius: true, spinPhase: true, phase: 'lai1', outA: 141 });
    expect(NPC_AURA_RINGS[523]!.tint).toEqual([255, 120, 188]);      // HotPink 双段 lerp .5+.8 塌缩
    expect(NPC_AURA_RINGS[541]).toMatchObject({ count: 4, radius: 6, period: 2.4 });
    expect(NPC_AURA_RINGS[541]!.tint).toEqual([255, 235, 128]);      // lerp(White,Gold(255,215,0),0.5)
    expect(NPC_AURA_RINGS[620]).toMatchObject({ count: 4, radius: 6, period: 2.4, env: 'half', outA: 255 });
    expect(NPC_AURA_RINGS[661]).toMatchObject({ count: 6, radius: 6, period: 2.4, ai2Floor: true, outA: 255 });
    expect(NPC_AURA_RINGS[661]!.tint).toBeNull();                    // color10=White → 不染色
    expect(NPC_AURA_RINGS[568]).toMatchObject({ count: 4, radius: 4, period: 1.5, env: 'sixth', outA: 191, spawnGate: true });
    expect(NPC_AURA_RINGS[568]!.tint).toEqual([255, 180, 218]);      // lerp(White,HotPink A127,0.5)
    expect(NPC_AURA_RINGS[569]).toMatchObject({ count: 4, radius: 4, period: 1.5, env: 'sixth', outA: 191, spawnGate: true });
    expect(NPC_AURA_RINGS[618]).toMatchObject({ count: 6, radius: 15, phase: 'ai1p30', tint: null });
  });
});

// ===================== B. 逐 id 参数锁（包络/半径/相位/门） =====================
describe('BJ211-B num58 包络与半径（世界 px=radius·num58，:23652）', () => {
  it('426 period1.2 half：t=0→1 / t=0.3→0.5 / t=0.6→0（fade=1−num58）', () => {
    expect(P(426)!.num58).toBeCloseTo(1, 6);
    expect(P(426)!.radiusWorld).toBeCloseTo(4, 6);
    expect(P(426, { tSec: 0.3 })!.num58).toBeCloseTo(0.5, 6);
    expect(P(426, { tSec: 0.3 })!.radiusWorld).toBeCloseTo(2, 6);
    expect(P(426, { tSec: 0.6 })!.num58).toBeCloseTo(0, 6);
    expect(P(426, { tSec: 0.6 })!.fade).toBeCloseTo(1, 6);
  });

  it('541/620 period2.4 Gold 同 env；568/569 period1.5 sixth=cos/6+0.75', () => {
    expect(P(541)!.num58).toBeCloseTo(1, 6);
    expect(P(541, { tSec: 0.6 })!.num58).toBeCloseTo(0.5, 6);
    expect(P(620)!.num58).toBeCloseTo(1, 6);
    expect(P(568)!.num58).toBeCloseTo(11 / 12, 6);          // cos(0)/6+0.75
    expect(P(568)!.radiusWorld).toBeCloseTo(4 * 11 / 12, 6);
    expect(P(569, { tSec: 0.75 })!.num58).toBeCloseTo(7 / 12, 6);   // cos(π)/6+0.75
  });

  it('568/569 出生门 lai3<60 → null（出生相归 drawWitherBirth）；≥60 出环', () => {
    expect(P(568, { lai3: 59 })).toBeNull();
    expect(P(569, { lai3: 0 })).toBeNull();
    expect(P(568, { lai3: 60 })).not.toBeNull();
  });

  it('523 num58=lai1=0.25+cos(ai1·2π/60)·0.25（:40532）、num60=animT·π/60（:40531）、半径 ×scale', () => {
    expect(P(523)!.num58).toBeCloseTo(0.5, 6);
    expect(P(523)!.radiusWorld).toBeCloseTo(5, 6);           // 10·1·0.5
    expect(P(523, { ai1: 15 })!.num58).toBeCloseTo(0.25, 6); // cos(π/2)=0
    expect(P(523, { ai1: 30 })!.num58).toBeCloseTo(0, 6);    // cos(π)=-1
    expect(P(523, { animT: 30 })!.num60).toBeCloseTo(Math.PI / 2, 6);
    expect(P(523, { scale: 0.5 })!.radiusWorld).toBeCloseTo(2.5, 6);  // num59=10·scale
  });

  it('661 num58 下限=GetLerpValue(0,60,ai2)（:23508）：ai2=30 抬到 ≥0.5、ai2=60 恒 1', () => {
    expect(P(661, { tSec: 1.2 })!.num58).toBeCloseTo(0, 6);            // env 谷底
    expect(P(661, { tSec: 1.2, ai2: 30 })!.num58).toBeCloseTo(0.5, 6); // 下限抬升
    expect(P(661, { ai2: 60 })!.num58).toBeCloseTo(1, 6);
    expect(P(661, { ai2: 60 })!.fade).toBeCloseTo(0, 6);
  });

  it('618 双相：ai0==1（n6/r15/num58=(ai1%30)/30·0.8+0.2）与 ai0==3（n4/r25/num58=(ai1%180)/180）', () => {
    const p1 = P(618, { ai0: 1, ai1: 0 })!;
    expect(p1.count).toBe(6);
    expect(p1.num58).toBeCloseTo(0.2, 6);
    expect(p1.radiusWorld).toBeCloseTo(3, 6);
    expect(P(618, { ai0: 1, ai1: 15 })!.num58).toBeCloseTo(0.6, 6);
    expect(P(618, { ai0: 1, ai1: 90 })).toBeNull();          // num61=90 门
    expect(P(618, { ai0: 1, ai1: 65 })!.num58).toBeCloseTo(5 / 30 * 0.8 + 0.2, 6);
    const p3 = P(618, { ai0: 3, ai1: 90 })!;
    expect(p3.count).toBe(4);
    expect(p3.num58).toBeCloseTo(0.5, 6);
    expect(p3.radiusWorld).toBeCloseTo(12.5, 6);             // 25·0.5
    expect(P(618, { ai0: 3, ai1: 45 })!.radiusWorld).toBeCloseTo(6.25, 6);
    expect(P(618, { ai0: 3, ai1: 180 })).toBeNull();         // num62=180 门
    expect(P(618, { ai0: 2, ai1: 45 })).toBeNull();          // 非蓄力相无环
  });
});

// ===================== C. 绘制面锁（blend 三分支/锚/620 dx0） =====================
describe('BJ211-C 绘制面：环拷贝几何与 XNA 预乘 blend', () => {
  it('426：4 份 source-over α=fade，轨道点 (±2,0)/(0,±2)，锚=本体帧心+addY', () => {
    const e = Enemy.fromVanilla(426, 100, 100) as EnemyT;
    const { ctx, ops } = recorder();
    drawNpcAuraRings(ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0.3 });
    const d = draws(ops);
    expect(d.length).toBe(4);
    // alpha 只设一次（末尾 restore 回 1 是另一条记录）
    expect(alphas(ops)[0]).toBeCloseTo(0.5, 6);
    expect(alphas(ops)[alphas(ops).length - 1]).toBe(1);
    expect(composites(ops)).toEqual(['source-over', 'source-over']);
    const dxs = d.map((o) => (o.dx as number) + FRAME.sw / 2);   // 相对帧心
    const dys = d.map((o) => (o.dy as number) + FRAME.sh / 2 - 0);
    expect(dxs[0]).toBeCloseTo(2, 6);                            // ang=0
    expect(dys[0]).toBeCloseTo(0, 6);
    expect(dxs[1]).toBeCloseTo(0, 6); expect(dys[1]).toBeCloseTo(2, 6);
    expect(dxs[2]).toBeCloseTo(-2, 6);
    expect(dxs[3]).toBeCloseTo(0, 6); expect(dys[3]).toBeCloseTo(-2, 6);
    // 锚：dy 含 addY（addY=5 → 全部 +5）
    const e2 = Enemy.fromVanilla(426, 100, 100) as EnemyT;
    const r2 = recorder();
    drawNpcAuraRings(r2.ctx, e2, atlasStub, FRAME, { ...OPT, tSec: 0.3, addY: 5 });
    expect((draws(r2.ops)[0].dy as number)).toBeCloseTo(-FRAME.sh / 2 + 5, 6);
  });

  it('568 常态环：两步 blend（destination-out cut=191/255·f → lighter f）×4 份', () => {
    const e = Enemy.fromVanilla(568, 100, 100) as EnemyT;
    const { ctx, ops } = recorder();
    drawNpcAuraRings(ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0, lai3: 60 });
    const d = draws(ops);
    expect(d.length).toBe(8);                                     // 4 份 ×2 步
    const comp = composites(ops);
    expect(comp[0]).toBe('destination-out');
    const seq: string[] = [];
    for (let i = 1; i < comp.length; i++) {
      if (comp[i] !== comp[i - 1]) seq.push(comp[i]);
    }
    // 逐份 [削底→加色] ×4，末尾 restore 回 source-over
    expect(seq.join(',')).toBe('lighter,destination-out,lighter,destination-out,lighter,destination-out,lighter,destination-out,source-over');
    const f = 1 - 11 / 12;
    const cut = alphas(ops).filter((_, i) => i % 2 === 0);
    expect(cut.every((a) => Math.abs(a - (191 / 255) * f) < 1e-6)).toBe(true);
    // 半径 4·11/12 → ang=0 份 dx=44/12
    expect((d[0].dx as number) + FRAME.sw / 2).toBeCloseTo(44 / 12, 6);
  });

  it('523：3 份双步 blend，角度含 num60=animT·π/60，半径 5（scale=1）', () => {
    const e = Enemy.fromVanilla(523, 100, 100) as EnemyT;
    const { ctx, ops } = recorder();
    drawNpcAuraRings(ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0 });
    e.ai1 = 0;
    // animT 默认 0 → num60=0
    const d0 = draws(ops);
    expect(d0.length).toBe(6);                                    // 3 份 ×2 步
    const f = 0.5;
    const cut = (141 / 255) * f;
    const a = alphas(ops);
    expect(Math.abs(a[0] - cut)).toBeLessThan(1e-6);
    expect(Math.abs(a[1] - f)).toBeLessThan(1e-6);
    // ang=i/3·2π → (5,0),(-2.5,4.330),(-2.5,-4.330)
    expect((d0[0].dx as number) + 16).toBeCloseTo(5, 6);
    expect((d0[2].dx as number) + 16).toBeCloseTo(-2.5, 6);
    expect((d0[2].dy as number) + 16).toBeCloseTo(4.330127018922193, 6);
    // animT=30 → num60=π/2 → 首份转到 (0,5)
    const r2 = recorder();
    e.animT = 30;
    drawNpcAuraRings(r2.ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0 });
    const d2 = draws(r2.ops);
    expect((d2[0].dx as number) + 16).toBeCloseTo(0, 6);
    expect((d2[0].dy as number) + 16).toBeCloseTo(5, 6);
  });

  it('620：dx0=4·sdir·(mirror?−1:1)（origin 覆写净位移;本体 :7680 在镜像链前=世界恒 +4sdir,环纹素空间按镜像翻号）', () => {
    const e = Enemy.fromVanilla(620, 100, 100) as EnemyT;
    // facing>0：sdir=+1、本体镜像链 mirror=true → tx_dx0=4·1·(−1)=−4；R=3 → ang=0 份 dx=−4+3=−1
    e.facing = 1;
    const r1 = recorder();
    drawNpcAuraRings(r1.ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0.6, mirror: true });
    expect((draws(r1.ops)[0].dx as number) + FRAME.sw / 2).toBeCloseTo(-1, 6);
    // 对照：无镜像 ctx（mirror=false）时同 facing → tx=+4+3=+7（世界同为 +4sdir）
    const r2 = recorder();
    drawNpcAuraRings(r2.ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0.6, mirror: false });
    expect((draws(r2.ops)[0].dx as number) + FRAME.sw / 2).toBeCloseTo(7, 6);
    // facing<0：sdir=−1、无镜像 → tx=−4+3=−1
    e.facing = -1;
    const r3 = recorder();
    drawNpcAuraRings(r3.ctx, e, atlasStub, FRAME, { ...OPT, tSec: 0.6, mirror: false });
    expect((draws(r3.ops)[0].dx as number) + FRAME.sw / 2).toBeCloseTo(-1, 6);
  });

  it('618 ai0==3 相：4 份不染色 source-over α=0.5、半径 12.5；门 ai0==2/lai3 无关', () => {
    const e = Enemy.fromVanilla(618, 100, 100) as EnemyT;
    e.ai0 = 3; e.ai1 = 90;
    const { ctx, ops } = recorder();
    drawNpcAuraRings(ctx, e, atlasStub, FRAME, OPT);
    const d = draws(ops);
    expect(d.length).toBe(4);
    expect(alphas(ops)[0]).toBeCloseTo(0.5, 6);
    expect((d[1].dx as number) + FRAME.sw / 2).toBeCloseTo(0, 6);
    expect((d[1].dy as number) + FRAME.sh / 2).toBeCloseTo(12.5, 6);
    e.ai0 = 2;
    const r0 = recorder();
    drawNpcAuraRings(r0.ctx, e, atlasStub, FRAME, OPT);
    expect(draws(r0.ops).length).toBe(0);
  });

  it('门与缺贴图短路：427 无环 / 568 lai3=59 无环 / 618 ai0==1 ai1=90 无环', () => {
    const e427 = Enemy.fromVanilla(427, 100, 100) as EnemyT;
    const r1 = recorder();
    drawNpcAuraRings(r1.ctx, e427, atlasStub, FRAME, OPT);
    expect(draws(r1.ops).length).toBe(0);
    const e568 = Enemy.fromVanilla(568, 100, 100) as EnemyT;
    const r2 = recorder();
    drawNpcAuraRings(r2.ctx, e568, atlasStub, FRAME, { ...OPT, lai3: 59 });
    expect(draws(r2.ops).length).toBe(0);
    const e618 = Enemy.fromVanilla(618, 100, 100) as EnemyT;
    e618.ai0 = 1; e618.ai1 = 90;
    const r3 = recorder();
    drawNpcAuraRings(r3.ctx, e618, atlasStub, FRAME, OPT);
    expect(draws(r3.ops).length).toBe(0);
  });
});

// ===================== D. Extra_59 双闪重写锁（case 618 :23587-23623） =====================
describe('BJ211-D drawDreadnautilusFlash 1:1 重写（半径 25·p/双环/×1.8·1.5/rotation=极角）', () => {
  it('ai0==3 ai1=90：p=0.5 → R=12.5、bright=0.25、8 份（红×1.8+白×1.5）、rotate=极角', () => {
    const e = Enemy.fromVanilla(618, 200, 300) as EnemyT;
    e.ai0 = 3; e.ai1 = 90; e.visAngle = 0.3;
    const { ctx, ops } = recorder();
    drawDreadnautilusFlash(ctx, e, atlasStub);
    const d = draws(ops);
    expect(d.length).toBe(8);                                     // 2 loop ×4
    const sc = ops.filter((o) => o.op === 'scale');
    expect(sc.length).toBe(8);
    expect(sc[0].x).toBeCloseTo(1.8, 6);                          // vector9×1.8
    expect(sc[0].y).toBeCloseTo(1.8 * 0.875, 6);                  // sy=0.5+0.5·0.75
    expect(sc[4].x).toBeCloseTo(1.5, 6);                          // ×1.5
    expect(sc[4].y).toBeCloseTo(1.5 * 0.875, 6);
    const rot = ops.filter((o) => o.op === 'rotate');
    expect(rot[0].r).toBeCloseTo(0.3, 6);                         // 极角+visAngle
    expect(rot[1].r).toBeCloseTo(0.3 + Math.PI / 2, 6);
    const tr = ops.filter((o) => o.op === 'translate');
    expect(tr[0].x).toBeCloseTo(200 + Math.cos(0.3) * 12.5, 6);   // R=25·0.5
    expect(tr[0].y).toBeCloseTo(300 + Math.sin(0.3) * 12.5, 6);
    expect(alphas(ops).every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
    expect(composites(ops)[0]).toBe('lighter');                   // A=0 纯加算
  });

  it('门：ai0≠3 / ai1≥180 不画；vanillaScale 进 sprite scale', () => {
    const e = Enemy.fromVanilla(618, 0, 0) as EnemyT;
    e.ai0 = 2; e.ai1 = 90;
    const r0 = recorder();
    drawDreadnautilusFlash(r0.ctx, e, atlasStub);
    expect(draws(r0.ops).length).toBe(0);
    e.ai0 = 3; e.ai1 = 180;
    const r1 = recorder();
    drawDreadnautilusFlash(r1.ctx, e, atlasStub);
    expect(draws(r1.ops).length).toBe(0);
    e.ai1 = 90; e.vanillaScale = 2;
    const r2 = recorder();
    drawDreadnautilusFlash(r2.ctx, e, atlasStub);
    const sc = r2.ops.filter((o) => o.op === 'scale');
    expect(sc[0].x).toBeCloseTo(2 * 1.8, 6);
    expect(sc[0].y).toBeCloseTo(2 * 1.8 * 0.875, 6);
  });
});
