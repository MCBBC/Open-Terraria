// 终零波批：地面族四款逐帧窗专支断言（PetFollower.parrotStep/pandaStep/
// deerclopsStep/cavelingStep——Projectile.cs flag27 链 :63335 起 + 追赶飞行窗
// :61852/:61955/:62290 的逐款真值钉）。
// 直接驱动私有 step 方法（帧机纯 latch 推进,与物理/贴图解耦；物理面由
// groundAI/vanilla-pets 契约覆盖）。注：*.cx 系 x+w/2 派生（构造入参只写 x）。
import { describe, it, expect } from 'vitest';
// ★Enemy 先加载（tests/chester-pet.test.ts 头注同判例——Game-first 导入环）
import { Enemy } from '../src/entities/Enemy';
import { PetFollower } from '../src/entities/PetFollower';

const OWNER = {
  x: 0, y: 0, w: 20, h: 42, cx: 400, cy: 500, facing: 1, dead: false,
  vx: 0, vy: 0,
};

function mk(projId: number, px = 1000): PetFollower {
  return new PetFollower(px, 900, projId, () => OWNER);
}
const pv = (p: PetFollower): Record<string, unknown> => p as unknown as Record<string, unknown>;
type StepFn = (movedX: boolean) => void;
/** 显式借用私有帧机方法（运行时可访问） */
function step(p: PetFollower, movedX: boolean): void {
  const key = p.projId === 208 ? 'parrotStep'
    : p.projId === 825 ? 'pandaStep'
    : p.projId === 958 ? 'deerclopsStep' : 'cavelingStep';
  (Reflect.get(p, key) as StepFn).call(p, movedX);
}

describe('★终零波：208 鹦鹉 parrotStep（P.cs:65826-65848/:62290 同式合并）', () => {
  it('落定态（vy==0∧flag27）：面向玩家双 if 序 + rot 归零 + frame0', () => {
    const p = mk(208);
    pv(p).vy = 0;
    pv(p).flying = false;
    pv(p).dir = 1;
    step(p, false);                                  // 宠物 cx=1008>玩家 400 → player 居左 → −1
    expect(pv(p).dir).toBe(-1);
    expect(pv(p).animRot).toBe(0);
    expect(p['frame']).toBe(0);
    pv(p).dir = -1;
    p['x'] = OWNER.cx - 120;                         // 宠物挪到玩家左侧
    step(p, false);
    expect(pv(p).dir).toBe(1);                       // :65833-65834 独立 if
  });

  it('活动/空中共窗 [1..4] @7t 步进（>4 回 1、<1 钳 1）+ rot=vx×0.075', () => {
    const p = mk(208);
    const s = pv(p);
    s.vy = 3;                                        // 空中 → 不走落定支
    s.frame = 4; s.frameAcc = 6;
    step(p, false);
    expect(p['frame']).toBe(1);                      // >4 回 1
    expect(s.frameAcc).toBe(0);
    s.vx = 3;
    step(p, false);
    expect(s.animRot as number).toBeCloseTo(0.225, 10);
    s.frame = 0;                                     // <1 钳 1 面
    step(p, false);
    expect(p['frame']).toBe(1);
  });
});

describe('★终零波：825 小红熊猫 pandaStep（P.cs:64465-64554+:61852）', () => {
  it('空中定格 frame12（laiG 清）；待机朝向反序族（player 左→dir=+1）', () => {
    const p = mk(825);
    const s = pv(p);
    s.vy = -2; s.laiG = 40; s.frame = 21;
    step(p, false);
    expect(p['frame']).toBe(12);
    expect(s.laiG).toBe(0);
    s.vy = 0; s.onGround = true;
    s.dir = -1;                                      // 宠物 cx≈1008>400：player 居左
    step(p, false);
    expect(pv(p).dir).toBe(1);                       // :64474-64477 反序
  });

  it('行走窗 [13..19]：<13 钉 13、>19 回 14；rate 分档 |v|≤2→每4t（num214=3）', () => {
    const p = mk(825);
    const s = pv(p);
    s.vy = 0; s.onGround = true; s.laiG = 9;
    s.frame = 11;                                    // 走廊外低值 → 快照 13
    s.vx = 1; s.vy = 0;                              // |v|=1 → num214=3（步进周期 4）
    step(p, true);
    expect(p['frame']).toBe(13);
    expect(s.laiG).toBe(0);
    s.frame = 19; s.frameAcc = 1;
    step(p, true);                                   // cnt2 ≤3 不进帧
    expect(p['frame']).toBe(19);
    s.frameAcc = 3;
    step(p, true);                                   // cnt4>3 进帧 → 20 → clamp 14
    expect(p['frame']).toBe(14);
  });

  it('飞行窗 [21..25] @4t 步进 + rot=vx×0.025', () => {
    const p = mk(825);
    const s = pv(p);
    s.flying = true; s.frame = 24; s.frameAcc = 4; s.vx = -2; s.vy = 0;
    step(p, false);
    expect(p['frame']).toBe(25);                     // 24→25
    expect(s.frameAcc).toBe(0);
    s.frameAcc = 4;
    step(p, false);                                  // 26 → 窗外回 21
    expect(p['frame']).toBe(21);
    expect(s.animRot as number).toBeCloseTo(-0.05, 10);
    s.frame = 20;                                    // <21 钉 21
    step(p, false);
    expect(p['frame']).toBe(21);
  });

  it('待机轮盘三段式：3..11 段 12→0；13 段 9t 经 14 归 0', () => {
    const p = mk(825);
    const s = pv(p);
    s.vy = 0; s.onGround = true;
    s.frame = 10; s.frameAcc = 5;
    step(p, false);
    expect(p['frame']).toBe(11);
    s.frameAcc = 5;
    step(p, false);                                  // 12 → >11 → 0
    expect(p['frame']).toBe(0);
    s.frame = 13; s.frameAcc = 8;
    step(p, false);                                  // >8 →14 → ==14 归 0
    expect(p['frame']).toBe(0);
  });
});

describe('★终零波：958 独眼巨鹿宠 deerclopsStep（P.cs:63386-63427+:61955）', () => {
  it('空中定格 frame4；行走窗 [5..12] snap 5、frameCounter+=|v| 每7t', () => {
    const p = mk(958);
    const s = pv(p);
    s.vy = 2; s.laiG = 30; s.frame = 9;
    step(p, true);
    expect(p['frame']).toBe(4);
    expect(s.laiG).toBe(0);
    s.vy = 0; s.onGround = true;
    s.vx = 2; s.vy = 0;
    s.frame = 3;                                     // <5 → 快照 5
    step(p, true);
    expect(p['frame']).toBe(5);
    s.frame = 12; s.frameAcc = 6;
    step(p, true);
    expect(p['frame']).toBe(5);                      // 13 → 窗外回 5
  });

  it('待机眨眼轮：先 localAI[0]++ 再判 >200 → frame=1+(n−200)/6、≥218 收 0 并重掷', () => {
    const p = mk(958);
    const s = pv(p);
    s.vy = 0; s.onGround = true;
    s.laiG = 199;                                    // 拍内自增 200 → 未过门 → 待机帧 0
    step(p, false);
    expect(p['frame']).toBe(0);
    s.laiG = 205;                                    // 自增 206 → 1+floor(6/6)=2
    step(p, false);
    expect(p['frame']).toBe(2);
    s.laiG = 216;                                    // 自增 217 → 1+floor(17/6)=3
    step(p, false);
    expect(p['frame']).toBe(3);
    s.laiG = 217;                                    // 自增 218 ≥218 → 收 0 + 重掷 rand(100)
    step(p, false);
    expect(p['frame']).toBe(0);
    expect(s.laiG as number).toBeLessThan(100);
  });

  it('追赶飞：sign(vx) 定向 + <13 先钉 13 + 窗 [13..16] @4t + rot 钳 ±0.4', () => {
    const p = mk(958);
    const s = pv(p);
    s.flying = true; s.vx = -50; s.vy = 0; s.frame = 15; s.frameAcc = 4;
    step(p, false);
    expect(pv(p).dir).toBe(-1);
    expect(p['frame']).toBe(16);
    expect(s.animRot as number).toBeCloseTo(-0.4, 10);   // vx×0.025=−1.25 → 钳 −0.4
    s.frame = 16; s.frameAcc = 4;
    step(p, false);                                      // 17 → 窗外回 13
    expect(p['frame']).toBe(13);
    s.frame = 9;                                         // <13 先钉 13
    step(p, false);
    expect(p['frame']).toBe(13);
  });
});

describe('★终零波：1027 掘地蜂群 cavelingStep（P.cs:63576-63631）', () => {
  it('升/降分帧 2/4 + 腾空 rot=vy/10·π/4·(−dir)', () => {
    const p = mk(1027);
    const s = pv(p);
    s.onGround = true; s.flying = false;
    s.vy = -3; s.dir = 1; s.frame = 0;
    step(p, true);
    expect(p['frame']).toBe(2);
    expect(s.animRot as number).toBeCloseTo((-3 / 10) * (Math.PI / 4) * (-1), 10);
    s.vy = 5; s.frame = 0;
    step(p, true);
    expect(p['frame']).toBe(4);
    expect(s.animRot as number).toBeCloseTo((5 / 10) * (Math.PI / 4) * (-1), 10);
  });

  it('行走窗 [0..3] rate=max(1,(int)(|v|/2)) >5t；待机朝向与 958 反极性（player 左→+1）', () => {
    const p = mk(1027);
    const s = pv(p);
    s.onGround = true; s.flying = false;
    s.vy = 0; s.vx = 10;                             // |v|/2=5 → max(1,5)=5/tick
    s.frame = 0; s.frameAcc = 0;
    step(p, true);
    step(p, true);                                   // 累计 10 >5 → 进帧一次
    expect(p['frame']).toBe(1);
    s.frame = 3; s.frameAcc = 5;
    step(p, true);                                   // 4 → 窗外回 0
    expect(p['frame']).toBe(0);
    s.vx = 0; s.vy = 0;
    s.dir = -1;                                      // 宠物 cx>400：player 居左
    step(p, false);
    expect(pv(p).dir).toBe(1);                       // 反极性（:63590-63593）
    expect(p['frame']).toBe(0);
    expect(s.animRot).toBe(0);                       // 静止 rot 归零（:63622）
  });

  it('追赶飞行维持登记偏差表现（通用定格 1，特化渐隐降落链未建模）', () => {
    const p = mk(1027);
    const s = pv(p);
    s.flying = true; s.frame = 3;
    step(p, false);
    expect(p['frame']).toBe(1);
    expect(s.animRot).toBeUndefined();
  });
});
