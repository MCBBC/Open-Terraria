// ⑧Projectile.Shimmer() 弹幕微光行为移植批（2026-09-07）测试
//   原版 Projectile.Shimmer()（P.cs:22564-22719）+ 调用位 Update :17114-17117
//   `if (shimmerWet) Shimmer();`（湿段 :16895-17113 之后 / HandleMovement :17122 之前,
//   且在 `if (!ignoreWater)` 整段门【外】=豁免弹亦跑）。
//   断言锚点：
//   · 分派骨架逐支（projShimmerStep）:头门 hostify/99·15 态门/502/{469,181,566}/箭族/
//     相刃/弹反族 A(600 钳+−60)/弹反族 B(无 timeLeft 面)/15/99/沉没族/2(936 解锁)/
//     14·16/25·17/缺省无动作
//   · 深浸 Kill 判定格 = CenterX/16 列 × positionY/16 行,双格满微光液柱
//   · 调用位两处：Arrow.wetSectionStep 尾（整段门外+936 特支收口防双跑）与
//     projWetSection 共享体（整段门外+段尾两支路）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projShimmerStep,
  PROJ_SHIMMER_ARROWLIKE,
  PROJ_SHIMMER_PHASEBLADES,
  PROJ_SHIMMER_BOUNCE_B_AISTYLES,
  PROJ_SHIMMER_SINK_AISTYLES,
  type ProjShimmerFace,
} from '../src/entities/projWetSection';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';

const ROOT = join(__dirname, '..');

// ---- 面具工厂（缺省=箭族域:非敌对/aiStyle1/无 kill,便于各支覆写） ----
function makeFace(over: Partial<ProjShimmerFace>): ProjShimmerFace {
  return {
    projId: 1, aiStyle: 1, hostile: false,
    vx: 0, vy: 3, timeLeft: 1000, ai0: 0, ai1: 0,
    wet: true, shimmerWet: true,
    rainbowSlimeUnlocked: false,
    ...over,
  };
}

/** 挖微光液池：col 列 fromRow..toRow 行;deep=true 时 fromRow 格满 255（深浸判定面） */
function makeStore(deep: boolean): TileStore {
  const st = new TileStore(80, 80);
  st.setLiquid(40, 40, deep ? 255 : 100, LIQUID_TYPE.SHIMMER);
  st.setLiquid(40, 39, 255, LIQUID_TYPE.SHIMMER);   // 上一格恒有液微光（判定双格的第二格）
  return st;
}

// ==================================================================================
// ① 数据面（Set 提取对拍）
describe('Shimmer id 域表', () => {
  it('箭族 20 id（:22583）', () => {
    expect([...PROJ_SHIMMER_ARROWLIKE].sort((a, b) => a - b))
      .toEqual([1, 2, 4, 5, 41, 81, 82, 91, 103, 117, 120, 172, 225, 278, 282, 474, 495, 631, 639, 819]);
  });
  it('相刃 19 id（IsAPhaseblade,ProjectileID.cs:33）', () => {
    expect([...PROJ_SHIMMER_PHASEBLADES].sort((a, b) => a - b))
      .toEqual([1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1074, 1075, 1076, 1101, 1102]);
  });
  it('弹反族 B 12 aiStyle（:22627）+ 沉没族 13 aiStyle（:22670）', () => {
    expect([...PROJ_SHIMMER_BOUNCE_B_AISTYLES].sort((a, b) => a - b))
      .toEqual([5, 8, 21, 28, 29, 33, 36, 47, 93, 115, 151, 152]);
    expect([...PROJ_SHIMMER_SINK_AISTYLES].sort((a, b) => a - b))
      .toEqual([7, 9, 13, 35, 53, 130, 134, 137, 138, 149, 160, 197, 204]);
  });
});

// ==================================================================================
// ② 分派逐支
describe('projShimmerStep 逐支（P.cs:22564-22719）', () => {
  it('头门:hostile（aiStyle∉25/17）全域早退;hostile 25/17 豁免照跑', () => {
    const vy0 = makeFace({ hostile: true, vy: 3 });
    projShimmerStep(vy0, makeStore(false), 640, 640, 648);
    expect(vy0.vy).toBe(3);                    // :22566 敌对弹拦在头门
    const vy25 = makeFace({ hostile: true, aiStyle: 25, projId: 999, vy: 12 });
    projShimmerStep(vy25, makeStore(false), 640, 640, 648);
    expect(vy25.vy).toBeCloseTo(10.94);        // :22707-22712 25 支照跑（>10 ×0.97=11.64 再 −0.7）
  });
  it('头门:aiStyle99 ai0=-1 早退 / aiStyle15 ai0∈{2,4} 早退;ai0=0 照跑', () => {
    const yoyo = makeFace({ aiStyle: 99, projId: 534, ai0: -1, vy: 3 });
    projShimmerStep(yoyo, makeStore(false), 640, 640, 648);
    expect(yoyo.vy).toBe(3);                   // :22566 收回态拦
    const flail = makeFace({ aiStyle: 15, projId: 25, ai0: 4, vy: 3 });
    projShimmerStep(flail, makeStore(false), 640, 640, 648);
    expect(flail.vy).toBe(3);                  // :22566 回收态拦
    const flail0 = makeFace({ aiStyle: 15, projId: 25, ai0: 0, vy: 3 });
    projShimmerStep(flail0, makeStore(false), 640, 640, 648);
    expect(flail0.vy).toBeCloseTo(-3.4);       // 弹反(+3→−3) 后 −0.4（未触 −8 钳）
  });
  it('502:vy-=0.4/timeLeft-=5（:22570-22573）', () => {
    const f = makeFace({ projId: 502, aiStyle: 8, vy: 0, timeLeft: 100 });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBe(-0.4);
    expect(f.timeLeft).toBe(95);
  });
  it('469:vy-=0.2,vy<0 时 Kill;181/566 不 Kill（:22575-22581）', () => {
    let killed = 0;
    const f469 = makeFace({ projId: 469, aiStyle: 1, vy: 0, kill: () => { killed++; } });
    projShimmerStep(f469, makeStore(false), 640, 640, 648);
    expect(f469.vy).toBe(-0.2);
    expect(killed).toBe(1);                    // :22578-22580（vy=−0.2<0）
    const f181 = makeFace({ projId: 181, aiStyle: 36, vy: 0, kill: () => { killed++; } });
    projShimmerStep(f181, makeStore(false), 640, 640, 648);
    expect(killed).toBe(1);                    // 181 支无 Kill
  });
  it('箭族 20 id:vy-=0.4 上浮（:22583-22585）', () => {
    for (const id of [1, 2, 819, 639, 81]) {
      const f = makeFace({ projId: id, aiStyle: id === 2 ? 1 : 1, vy: 0 });
      projShimmerStep(f, makeStore(false), 640, 640, 648);
      expect(f.vy).toBe(-0.4);
    }
  });
  it('相刃:ai0=1 早退;否则 ai0/ai1 归零+vy 浮升+vx×1.1 钳 ±14（:22587-22604）', () => {
    const guard = makeFace({ projId: 1059, aiStyle: 3, ai0: 1, vy: 3, vx: 2 });
    projShimmerStep(guard, makeStore(false), 640, 640, 648);
    expect(guard.ai0).toBe(1); expect(guard.vx).toBe(2);   // :22589-22591 原样
    const f = makeFace({ projId: 1059, aiStyle: 3, ai0: 2, ai1: 5, vy: 3, vx: 2 });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.ai0).toBe(0); expect(f.ai1).toBe(0);          // :22592-22593
    expect(f.vy).toBeCloseTo(2.5);                         // 3>−11 且 ≤16 → −0.5
    expect(f.vx).toBeCloseTo(2.2);                         // ×1.1
    const fast = makeFace({ projId: 1060, aiStyle: 3, vx: 20, vy: 20 });
    projShimmerStep(fast, makeStore(false), 640, 640, 648);
    expect(fast.vy).toBeCloseTo(17.5);                     // >16 先 ×0.9=18 再 −0.5
    expect(fast.vx).toBe(14);                              // 22 → 钳 14
  });
  it('弹反族 A（aiStyle1 浅浸）:vy×−1+timeLeft 600 钳 −60+双清旗（:22606-22625）', () => {
    // projId 14=aiStyle1 且不在箭族 20 id 域（1 在箭族=链序先中 :22583 特案）
    const f = makeFace({ projId: 14, vy: 2, timeLeft: 900, wet: true, shimmerWet: true });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBe(-2);
    expect(f.timeLeft).toBe(540);              // 900>600 → 600 → −60
    expect(f.shimmerWet).toBe(false); expect(f.wet).toBe(false);   // :22619-22620
    const below600 = makeFace({ projId: 14, vy: 1, timeLeft: 500 });
    projShimmerStep(below600, makeStore(false), 640, 640, 648);
    expect(below600.timeLeft).toBe(440);       // 不触钳只 −60
  });
  it('深浸 Kill（双格满微光液柱）——判定格=CenterX/16 列 × positionY/16 行', () => {
    let killed = 0;
    const f = makeFace({ projId: 14, vy: 2, kill: () => { killed++; } });
    // posX=640 → ty=40 判定行;centerX=648 → tx=40 判定列（40,40)=255 满格 + (40,39)=255 → Kill
    projShimmerStep(f, makeStore(true), 640, 640, 648);
    expect(killed).toBe(1);
    expect(f.vy).toBe(2);                      // Kill 支不动速度（原文 if/else 互斥）
  });
  it('弹反族 B（aiStyle5/1024/669）:弹反+双清旗但【无】timeLeft 面（:22627-22641）', () => {
    for (const over of [{ aiStyle: 5, projId: 9 }, { aiStyle: 113, projId: 1024 }, { aiStyle: 68, projId: 669 }]) {
      const f = makeFace({ ...over, vy: 2, timeLeft: 900 });
      projShimmerStep(f, makeStore(false), 640, 640, 648);
      expect(f.vy).toBe(-2);
      expect(f.timeLeft).toBe(900);            // B 族不钳不减（与 A 族分野）
      expect(f.shimmerWet).toBe(false);
    }
  });
  it('aiStyle15:弹反 + vy-=0.4 钳 ≥-8,旗不清（:22643-22654）', () => {
    const f = makeFace({ aiStyle: 15, projId: 25, vy: 2, wet: true, shimmerWet: true });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBeCloseTo(-2.4);            // −2 → −0.4
    expect(f.shimmerWet).toBe(true);           // 15 支无双清
    const cap = makeFace({ aiStyle: 15, projId: 25, vy: -8.5 });
    projShimmerStep(cap, makeStore(false), 640, 640, 648);
    expect(cap.vy).toBe(-8);                   // <−8 钳
  });
  it('aiStyle99:弹反+双清旗+钳 ≥−8（上收）（:22656-22668）', () => {
    const f = makeFace({ aiStyle: 99, projId: 534, vy: 2, wet: true, shimmerWet: true });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBe(-8);                     // −2 弹反后 >−8 → 钳 −8
    expect(f.shimmerWet).toBe(false); expect(f.wet).toBe(false);
  });
  it('沉没族 13 aiStyle:入微光即 Kill（:22670-22672）', () => {
    for (const ai of [7, 9, 13, 35, 53, 197, 130, 204]) {
      let killed = 0;
      const f = makeFace({ aiStyle: ai, projId: 999, vy: -5, kill: () => { killed++; } });
      projShimmerStep(f, makeStore(false), 640, 640, 648);
      expect(killed).toBe(1);
      expect(f.vy).toBe(-5);
    }
  });
  it('aiStyle2:vy-=0.7+timeLeft-=20;936 解锁支钳 5+回调,不走 −20（:22674-22697）', () => {
    const f = makeFace({ aiStyle: 2, projId: 3, vy: 1, timeLeft: 100 });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBeCloseTo(0.3);
    expect(f.timeLeft).toBe(80);
    let unlocked = 0;
    const b936 = makeFace({
      aiStyle: 2, projId: 936, vy: 0, timeLeft: 100,
      unlockRainbowSlime: () => { unlocked++; },
    });
    projShimmerStep(b936, makeStore(false), 640, 640, 648);
    expect(unlocked).toBe(1);                  // vy=−0.7<0 → 解锁支（浮升后上升期触达）
    expect(b936.timeLeft).toBe(5);             // :22680-22682 钳 5,无 −20
    const b936up = makeFace({
      aiStyle: 2, projId: 936, vy: 0, timeLeft: 100,
      rainbowSlimeUnlocked: true,
      unlockRainbowSlime: () => { unlocked++; },
    });
    projShimmerStep(b936up, makeStore(false), 640, 640, 648);
    expect(unlocked).toBe(1);                  // 已解锁 → else 支
    expect(b936up.timeLeft).toBe(80);          // :22696 timeLeft-=20
  });
  it('aiStyle14/16:timeLeft>3000 → −60+vy-=0.5（:22699-22705）', () => {
    const f = makeFace({ aiStyle: 14, projId: 24, vy: 0, timeLeft: 3600 });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.timeLeft).toBe(3540);
    expect(f.vy).toBe(-0.5);
    const short = makeFace({ aiStyle: 16, projId: 28, vy: 0, timeLeft: 3000 });
    projShimmerStep(short, makeStore(false), 640, 640, 648);
    expect(short.timeLeft).toBe(3000);         // >3000 门（3000 不减）
  });
  it('aiStyle25/17:vy>10 先 ×0.97,vy-=0.7 钳 ≥-10（:22707-22718）', () => {
    const f = makeFace({ aiStyle: 25, projId: 655, vy: 12 });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBeCloseTo(12 * 0.97 - 0.7);
    const cap = makeFace({ aiStyle: 17, projId: 43, vy: -10.5 });
    projShimmerStep(cap, makeStore(false), 640, 640, 648);
    expect(cap.vy).toBe(-10);
  });
  it('缺省支=无:域外 aiStyle（3 普通剑/19 长矛/61）零动作（:22719 链尽即出）', () => {
    const f = makeFace({ aiStyle: 3, projId: 990, vy: 3, timeLeft: 100, wet: true, shimmerWet: true });
    projShimmerStep(f, makeStore(false), 640, 640, 648);
    expect(f.vy).toBe(3); expect(f.timeLeft).toBe(100);
    expect(f.shimmerWet).toBe(true); expect(f.wet).toBe(true);
  });
});

// ==================================================================================
// ③ 调用位落点（源级钉——结构与位次回归）
describe('调用位落点（源级钉）', () => {
  const arrowLines = readFileSync(join(ROOT, 'src/entities/Arrow.ts'), 'utf8').split('\n');
  const wetLines = readFileSync(join(ROOT, 'src/entities/projWetSection.ts'), 'utf8').split('\n');

  function blockFrom(lines: string[], anchor: string, occurrence = 1): string {
    let seen = 0, start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor)) { seen++; if (seen === occurrence) { start = i; break; } }
    }
    expect(start, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
    let depth = 0, opened = false;
    const out: string[] = [];
    for (let i = start; i < lines.length; i++) {
      out.push(lines[i]);
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; opened = true; }
        else if (ch === '}') depth--;
      }
      if (opened && depth === 0) break;
    }
    return out.join('\n');
  }

  it('Arrow.wetSectionStep:Shimmer 调用位在湿段块【外】=整段门豁免弹亦跑（:17114 位次）', () => {
    const blk = blockFrom(arrowLines, 'private wetSectionStep(game: GameHooks)');
    expect(blk).toContain('if (this.shimmerWet) {');
    expect(blk).toContain('projShimmerStep(sf, game.world.store, this.x, this.y, this.cx)');
    // 调用位在 `if (!projectileData(...).ignoreWater) {...}` 段体闭合之后（整段门外）
    const gateEnd = blk.indexOf('if (this.wetCount > 0) this.wetCount--;');
    const call = blk.indexOf('if (this.shimmerWet) {');
    expect(call).toBeGreaterThan(gateEnd);
    // 面适配：timeLeft≡life 直读写
    expect(blk).toContain('timeLeft: this.life');
    expect(blk).toContain('this.vx = sf.vx; this.vy = sf.vy; this.life = sf.timeLeft;');
  });
  it('Arrow:B1-X3 936 特支块已收口=分派+特支不双跑（vy-=0.7/timeLeft-=20 单份）', () => {
    const whole = arrowLines.join('\n');
    expect(whole).not.toContain('if (this.projId === 936 && !this.hostile) {');
    expect(whole).toContain('unlockRainbowSlime: () => this.shimmerUnlock(game)');
    // 湿段调用位是 936 浮升/衰变唯一消费位
    const hits = arrowLines.filter((l) => l.includes('projShimmerStep(')).length;
    expect(hits).toBe(1);
  });
  it('共享体:整段门外+段尾两支路接 shimmer 回调（:17114 位次,豁免弹亦跑）', () => {
    const fn = blockFrom(wetLines, 'export function projectileWetSection(');
    // 豁免早退支（ignoreWater）内有一次调用
    const early = fn.indexOf('if (ignoreWater) {');
    const gateRet = fn.indexOf('if (flags.shimmerWet) hooks?.shimmer?.(st, x, y, w, h);', early);
    expect(gateRet).toBeGreaterThan(early);
    // 段尾（wetCount-- 后）有第二次调用
    const tail = fn.indexOf('if (flags.wetCount > 0) flags.wetCount--;');
    const tailCall = fn.indexOf('if (flags.shimmerWet) hooks?.shimmer?.(st, x, y, w, h);', tail);
    expect(tailCall).toBeGreaterThan(tail);
    // ProjWetHooks.shimmer 全步回调签名（接口在函数块外,整文件查）
    expect(wetLines.join('\n')).toContain('shimmer?: (st: TileStore');
  });
});
