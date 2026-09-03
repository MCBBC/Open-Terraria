// 拍击石系 Spawn_ 环带粒子池化回归（2026-09-03 清偿批）：
//   kind0/kind2 FadingParticle → fx/FadingParticles.ts 真池（ABasicParticle.Update
//   + FadingParticle.Draw 逐值）;kind1 PrettySparkle → VanillaDust prettySparkle
//   专用档（逐粒包络 ps* 扩展 + Scale 二次链 + APF 补积分）。
// 原版锚 = ParticleOrchestrator.cs Spawn_SnappingStone :593-647 / SnappingStoneMelee
// :649-732 / SnappingStoneSummon :734-813（Terarria1457）。
import { describe, it, expect, beforeEach } from 'vitest';
import { fadingParticles, fadingAlphaFactor, fadingScaleAfter } from '../src/fx/FadingParticles';
import { VanillaDust } from '../src/fx/VanillaDust';
import { snappingStoneRingFx } from '../src/fx/orchestraFx';
import { snapStrikeDust } from '../src/stats/SnapStrike';
import type { GameHooks } from '../src/entities/types';
import type { VDust } from '../src/fx/VanillaDust';

/** 恒 0.5 rng：NextFloatDirection=0、Next=0 → bolt 相位/微尘抖动/旋星相位全零档 */
const half: () => number = () => 0.5;

function mkGame() {
  const dusts: Array<{ type: number; perfect: boolean; ret: VDust }> = [];
  const g = {
    playSfxWav: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      vx = 0, vy = 0, alpha = 0, color: { r: number; g: number; b: number; a: number } | null = null,
      scale = 1, noGravity = false, perfect = false, prettySparkle = false) => {
      void w; void h; void alpha; void scale;
      const ret: VDust = {
        active: true, x, y, vx, vy, type, scale, alpha: 0, fadeIn: 0,
        noGravity, noLight: false, noLightEmittance: false, color,
        followEnt: null, attractTo: null, rotation: 0, fx: 0, fy: 0,
        followPlayer: false, followOnce: false, dyeVid: -1,
        prettySparkle: prettySparkle || undefined,
      };
      dusts.push({ type, perfect, ret });
      return ret;
    },
  } as unknown as GameHooks;
  return { g, dusts };
}

beforeEach(() => fadingParticles.clear());

describe('FadingParticle 池（ABasicParticle/FadingParticle.Update 1:1）', () => {
  it('spawn 缺省 = FetchFromPool 复位面（fadeIn 0/fadeOut 1/白 tint α0/静止）', () => {
    const f = fadingParticles.spawn({ x: 10, y: 20, timeToLive: 5, texKey: 'vanilla/Extra_34.png' })!;
    expect(f.vx).toBe(0); expect(f.vy).toBe(0);
    expect(f.fadeIn).toBe(0); expect(f.fadeOut).toBe(1);
    expect(f.scaleX).toBe(1); expect(f.scaleY).toBe(1);
    expect(f.tintA).toBe(0);
    expect(f.delay).toBe(0);
  });

  it('Delay 段只递减：不推进/不老化/不到龄（:47-50）', () => {
    const f = fadingParticles.spawn({ x: 0, y: 0, timeToLive: 3, texKey: 'vanilla/Extra_34.png', delay: 5 })!;
    for (let i = 0; i < 5; i++) fadingParticles.update();
    expect(f.delay).toBe(0);
    expect(f.timeSinceSpawn).toBe(0);      // 老化未启动
    expect(f.x).toBe(0); expect(f.y).toBe(0);
    expect(fadingParticles.count).toBe(1);
    fadingParticles.update();
    expect(f.timeSinceSpawn).toBe(1);
  });

  it('先加速后位移 + Scale 二次链（ABasicParticle :40-49），到龄移除', () => {
    const f = fadingParticles.spawn({
      x: 100, y: 0, vx: 1, vy: 0, ax: 0.5, timeToLive: 4,
      scale: 2, scaleVelX: 0.1, scaleAccX: 0.01, texKey: 'vanilla/Extra_34.png',
    })!;
    fadingParticles.update();   // v=1.5 x=101.5；sv=0.11 s=2.11；t=1
    expect(f.x).toBeCloseTo(101.5, 12);
    expect(f.scaleX).toBeCloseTo(2.11, 12);
    expect(f.scaleX).toBeCloseTo(fadingScaleAfter(2, 0.1, 0.01, 1), 12);
    for (let i = 0; i < 3; i++) fadingParticles.update();
    expect(f.timeSinceSpawn).toBe(4);
    expect(fadingParticles.count).toBe(0);   // t≥TTL 移除
    expect(f.scaleX).toBeCloseTo(fadingScaleAfter(2, 0.1, 0.01, 4), 12);
  });

  it('Draw 透明度包络（FadingParticle.cs :68）= GetLerpValue(0,fadeIn,t01)×GetLerpValue(1,fadeOut,t01)', () => {
    expect(fadingAlphaFactor(0, 0.1, 0.1)).toBe(0);
    expect(fadingAlphaFactor(0.05, 0.1, 0.1)).toBeCloseTo(0.5, 12);
    expect(fadingAlphaFactor(0.1, 0.1, 0.1)).toBe(1);
    expect(fadingAlphaFactor(0.55, 0.1, 0.1)).toBeCloseTo(0.5, 12);
    expect(fadingAlphaFactor(1, 0.1, 0.1)).toBeCloseTo(0, 12);
    // 反向段（fadeOut=0.45 → t01≤0.45 恒 1）；t01=0.2 仍在 fadeIn 段 = 0.2/0.45
    expect(fadingAlphaFactor(0.45, 0.45, 0.45)).toBe(1);
    expect(fadingAlphaFactor(0.2, 0.45, 0.45)).toBeCloseTo(0.2 / 0.45, 12);
  });
});

describe('kind0 拍击石环带（Spawn_SnappingStone :610-627）', () => {
  it('FadingParticle×2：Projectile_1121/蓝 tint(30,180,255,0)/TTL20/fade .1/.1/圈起二次链/Delay=Y×3', () => {
    const { g } = mkGame();
    snappingStoneRingFx(g, 0, 400, 400, 120, 2, half);
    const ring = [...fadingParticles.each()];
    expect(ring.length).toBe(2);
    for (const f of ring) {
      expect(f.texKey).toBe('vanilla/Projectile_1121.png');
      expect([f.tintR, f.tintG, f.tintB, f.tintA]).toEqual([30, 180, 255, 0]);
      expect(f.timeToLive).toBe(20);
      expect(f.fadeIn).toBe(0.1); expect(f.fadeOut).toBe(0.1);
      expect(f.delay).toBe(6);                          // (int)MovementVector.Y×3 = 2×3
      const ms = Math.min(0.12, 120 / 256);             // :602+:606-608 钳 0.12
      expect(f.scaleVelX).toBeCloseTo((6 * ms) / 20, 12);        // :619 (6,6)×num/20
      expect(f.scaleAccX).toBeCloseTo(-((6 * ms) / 20) / 20, 12); // :620 −sv/20
      expect(f.scaleX).toBe(0); expect(f.scaleY).toBe(0);        // Scale=Vector2.Zero
      expect(f.vx).toBe(0); expect(f.vy).toBe(0);                // :614 SetBasicInfo(Zero,Zero)
    }
  });

  it('ms=X/256 原值直入（:602）：小载荷不触顶、大载荷钳 0.12', () => {
    const { g } = mkGame();
    snappingStoneRingFx(g, 0, 0, 0, 25.6, 0, half);   // 25.6/256 = 0.1（<0.12 不钳）
    let f = [...fadingParticles.each()][0];
    expect(f.scaleVelX).toBeCloseTo((6 * 0.1) / 20, 12);
    fadingParticles.clear();
    snappingStoneRingFx(g, 0, 0, 0, 51.2, 0, half);   // 51.2/256 = 0.2 → 钳 0.12
    f = [...fadingParticles.each()][0];
    expect(f.scaleVelX).toBeCloseTo((6 * 0.12) / 20, 12);
  });

  it('尘段只在 snapStrikeDust（环带不再发尘）：ring 零尘', () => {
    const { g, dusts } = mkGame();
    snappingStoneRingFx(g, 0, 0, 0, 120, 0, half);
    expect(dusts.length).toBe(0);
  });
});

describe('kind1 焰爆石环带（Spawn_SnappingStoneMelee :649-732）', () => {
  it('红/金 PrettySparkle×2：包络/几何/速度/APF/Scale 加速逐值（rng=0.5 全零相位）', () => {
    const { g, dusts } = mkGame();
    snappingStoneRingFx(g, 1, 400, 400, 999, 0, half);
    const rings = dusts.filter((d) => d.ret.prettySparkle === true);
    expect(rings.length).toBe(2);
    const a0 = Math.PI / 2;                    // π/4+π/4·1+0（num4=0）
    const spd = 14 * 1.5;                      // 基幅 14 ×恒真支 1.5
    const posOff = 14 * 30 * 0.15 + spd * 4;   // 63 + 84 = 147
    const red = rings[0].ret, gold = rings[1].ret;
    expect(red.color).toEqual({ r: 255, g: 0, b: 0, a: 0 });          // :665 Color(1,0,0,.5)
    expect(gold.color).toEqual({ r: 255, g: 242, b: 0, a: 0 });       // :666 Color(1,0.95,0,1)
    for (const [r, sx1, sy1] of [[red, 8.8, 2.2], [gold, 5.6, 1.4]] as const) {
      expect(r.x).toBeCloseTo(400 - Math.cos(a0) * posOff, 9);        // 位偏 147
      expect(r.y).toBeCloseTo(400 - Math.sin(a0) * posOff, 9);
      expect(r.vx).toBeCloseTo(Math.cos(a0) * spd, 9);
      expect(r.vy).toBeCloseTo(Math.sin(a0) * spd, 9);
      expect(r.rotation).toBeCloseTo(a0, 12);                          // :672/:701 vector3 角
      expect(r.ttl).toBe(30);                                          // :677/:706 int num=30
      expect(r.psAge).toBe(0);
      expect(r.scaleX).toBeCloseTo(sx1 * 1.5, 12);                     // :674/:703 ×1.5 恒真支
      expect(r.scaleY).toBeCloseTo(sy1 * 1.5, 12);
      expect(r.scax).toBeCloseTo(-4 / 30, 12);                         // :679/:708 vector/num
      expect(r.scay).toBe(0);
      // APF 赋值序在 Velocity×1.5 之前 → 幅 = 14/30 非 21/30（:681-684/:710-712）
      expect(r.ax).toBeCloseTo(-Math.cos(a0) * 14 / 30, 9);
      expect(r.ay).toBeCloseTo(-Math.sin(a0) * 14 / 30, 9);
      expect(r.psFadeInEnd).toBe(15);        // :675/:704 FadeInEnd=num/2
      expect(r.psFadeOutStart).toBe(15);     // :675/:704 FadeOutStart=num/2
      expect(r.psFadeOutEnd).toBe(30);       // :676/:705 FadeOutEnd=num
      expect(r.psFadeInNorm).toBe(5e-6);     // :675/:704
      expect(r.psFadeOutNorm).toBe(0.95);    // :676/:705
      expect(r.psDrawVert).toBe(false);      // :686/:713 只画水平臂
      expect(r.scale).toBe(1);
    }
    // d6 对（:722-730）：2 轮 × ±臂,ja=0/spd2=0.5 → 幅=14×0.5 沿 ±a0
    const d6 = dusts.filter((d) => d.type === 6);
    expect(d6.length).toBe(4);
    for (const d of d6) {
      expect(d.perfect).toBe(true);                        // NewDustPerfect 通道
      expect(Math.hypot(d.ret.vx, d.ret.vy)).toBeCloseTo(7, 9);
      expect(d.ret.scale).toBe(1.4);
      expect(d.ret.noGravity).toBe(true);
    }
  });
});

describe('kind2 毁灭臂镗环带（Spawn_SnappingStoneSummon :752-787）', () => {
  it('1132 圈×2 + Extra_34 旋星×1：tint(90,110,255,90)/fade .1/.3|.5/二次链/Delay/旋相位', () => {
    const { g } = mkGame();
    snappingStoneRingFx(g, 2, 500, 600, 12345, 1, half);
    const ring = [...fadingParticles.each()];
    expect(ring.length).toBe(3);
    const circles = ring.filter((f) => f.texKey === 'vanilla/Projectile_1132.png');
    const star = ring.find((f) => f.texKey === 'vanilla/Extra_34.png')!;
    expect(circles.length).toBe(2);
    for (const f of circles) {
      expect([f.tintR, f.tintG, f.tintB, f.tintA]).toEqual([90, 110, 255, 90]);
      expect(f.fadeIn).toBe(0.1); expect(f.fadeOut).toBe(0.3);   // :758-759
      expect(f.delay).toBe(3);                                    // Y=1 → ×3
      const sv = (9 * 0.12) / 20;
      expect(f.scaleVelX).toBeCloseTo(sv, 12);                    // :761 (9,9)×num/20
      expect(f.scaleAccX).toBeCloseTo(-sv / 20, 12);              // :762 −sv/20
    }
    expect(star.fadeOut).toBe(0.5);                               // :779
    expect(star.rotVel).toBe(0);                                  // NextFloatDirection=0（rng 0.5）
    expect(star.rot).toBeCloseTo(Math.PI, 12);                    // :785 NextFloat×τ
    expect(star.delay).toBe(3);
    // d172×15/d211×8（:788-813）
    const { g: g2, dusts } = mkGame();
    snappingStoneRingFx(g2, 2, 0, 0, 0, 0, half);
    expect(dusts.filter((d) => d.type === 172).length).toBe(15);
    expect(dusts.filter((d) => d.type === 211).length).toBe(8);
  });
});

describe('snapStrikeDust 收缩（kind1/kind2 残臂退役——环带函数为唯一尘源）', () => {
  it('kind1/kind2 零尘（双端此前 ×2 超原版）；kind0 保持 20 颗', () => {
    const { g: g1, dusts: d1 } = mkGame();
    snapStrikeDust(g1, 1, 0, 0, 120);
    snapStrikeDust(g1, 2, 0, 0, 120);
    expect(d1.length).toBe(0);
    const { g: g0, dusts: d0 } = mkGame();
    let calls = 0;
    (g0 as unknown as { vanillaDust: unknown }).vanillaDust = {
      spawn: () => { calls++; return null; },   // 池满桩——只数调用意图
    };
    snapStrikeDust(g0, 0, 0, 0, 120);
    expect(calls).toBe(20);
    expect(d0.length).toBe(0);
  });
});

describe('VanillaDust prettySparkle 专用档 update（APF 补积分+Scale 二次链+psAge）', () => {
  it('APF 逐拍积分（ princess/stardust 减速弧修复）+ 定值消亡', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 0, 0, 0, 21, 0, 0, { r: 255, g: 0, b: 0, a: 0 }, 1,
      { perfect: true, prettySparkle: true })!;
    d.ttl = 30;
    d.ax = -14 / 30;
    vd.update(0, 0, 1e9, 1e9);
    expect(d.vx).toBeCloseTo(21 - 14 / 30, 12);   // ★APF 修复：旧链 ax 不积分
    expect(d.psAge).toBe(1);
    expect(d.ttl).toBe(29);
    for (let i = 0; i < 29; i++) vd.update(0, 0, 1e9, 1e9);
    expect(d.ttl).toBe(0);
    expect(d.active).toBe(false);
  });

  it('Scale 二次链（ABasicParticle :47-49）：sv += sa; s += sv——闭式对拍', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 0, 0, 0, 0, 0, 0, { r: 255, g: 0, b: 0, a: 0 }, 1,
      { perfect: true, prettySparkle: true })!;
    d.scaleX = 13.2; d.scaleY = 3.3;
    d.scax = -4 / 30; d.scay = 0;
    for (let k = 1; k <= 15; k++) {
      vd.update(0, 0, 1e9, 1e9);
      expect(d.scaleX).toBeCloseTo(fadingScaleAfter(13.2, 0, -4 / 30, k), 12);
      expect(d.scaleY).toBe(3.3);
      expect(d.psAge).toBe(k);
    }
  });

  it('缺省包络字段（princess/stardust 旧站）不写 ps* → 池复用归位、update 面零回归', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 0, 0, 0, 1, 1, 0, { r: 255, g: 255, b: 255, a: 0 }, 0.5,
      { perfect: true, prettySparkle: true })!;
    expect(d.psFadeInEnd).toBeUndefined();
    expect(d.psDrawVert).toBeUndefined();
    expect(d.scax).toBeUndefined();
    expect(d.ttl).toBe(60);                    // prettySparkle 缺省 TTL
    const s0 = d.scale;                        // NewDust 链含 ±0.2 抖（Perfect 只覆写位/速）
    expect(d.scaleX).toBe(s0); expect(d.scaleY).toBe(s0);   // 双轴 = 池抖后 scale
    vd.update(0, 0, 1e9, 1e9);
    expect(d.psAge).toBe(1);
    expect(d.scaleX).toBe(s0); expect(d.scaleY).toBe(s0);   // 无动力学 → 不动
  });
});
