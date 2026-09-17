// 裂天剑 3787 / 天界碎裂剑 660 行为锁（2026-09-17 用户实报「一排剑+仅光标处伤害」批）。
// 根因定谳：Projectile_660.png = 532×38 横条 14 帧 38×38，原版 DrawProj 专支【横切】
// Rectangle(38*proj.frame,0,38,38)（1457 Main.cs:30974-30980），frame=出生 Next(14)
// 掷定恒定（Projectile.cs:56651）；Main.projFrames[660] 无赋值（恒 1）——本仓 Arrow
// 曾按 1 帧整图绘制 = 一把剑画出 14 连排，而判定盒仍为 SetDefaults 10×10（仅光标处）。
// 三剑本体 = 出手侧专支（Player.cs:49314-49330）useTime4<useAnimation12 一挥三施,
// 每发单剑出生在光标周 Lerp(20,60) 环带上、独立伤害判定（penetrate 缺省 1/独立弹体）。
// 本文件三面：①帧切片（真 Arrow 模块 projFrameCount/projGridRect + PNG IHDR 实尺）
// ②SetDefaults 数值逐字（数据面 recon 哨兵）③出手几何 1:1 直译（掷流序敏感）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projFrameCount, projGridRect } from '../src/entities/Arrow';
import { sprayCyclePlan, REUSE_DELAY_TICKS } from '../src/core/Game';
import combatJson from '../src/data/vanilla-itemcombat.json';
import projJson from '../src/data/vanilla-projectiles.json';
import projFramesJson from '../src/data/vanilla-projframes.json';
import { PROJ_ALPHA0 } from '../src/entities/Arrow';

/** PNG IHDR 尺寸（字节 16-24 大端宽高） */
function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(new URL(rel, import.meta.url));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ==================== 原版出手几何（Player.cs:49314-49330 直译） ====================
type Rng = () => number;

export interface FractureShot {
  /** 出生点 = pointPosition + unit(f)×Lerp(20,60,rand)（:49319-49321） */
  sx: number; sy: number;
  /** 速度 = normalize(鼠标−出生)×shootSpeed 与基准向 Lerp 0.25（:49326-49329） */
  vx: number; vy: number;
  /** 本发消耗 Main.rand 抽数（掷方位×1、掷半径×1;重掷每轮 +2） */
  draws: number;
}

/** canHit 桩：开放空间恒 true（几何锁不需要真实地形;重掷路径由脚本 RNG 驱动） */
function fireSkyFracture3787(
  rnd: Rng,
  mouse: { x: number; y: number },
  hand: { x: number; y: number },
  canHit: () => boolean = () => true,
  shootSpeed = 8.75,
): FractureShot {
  let f = rnd() * Math.PI * 2;                       // :49315 f = NextFloat×2π
  let draws = 1;
  let sx = 0, sy = 0;
  for (let tries = 0; tries < 50; tries++) {         // :49319-49325 重掷 ≤50
    const rad = 20 + 40 * rnd();                     // Lerp(20,60,NextFloat)
    sx = hand.x + Math.cos(f) * rad;
    sy = hand.y + Math.sin(f) * rad;
    draws++;
    // CanHit(pointPosition, spawn + (spawn−point).SafeNormalize×8)（:49322-49324）
    if (canHit()) break;
    f = rnd() * Math.PI * 2;
    draws++;
  }
  // :49326-49329 v5 = MouseWorld−spawn → SafeNormalize(基准向)×speed → Lerp(基准,0.25)
  let tvx = mouse.x - sx, tvy = mouse.y - sy;
  const bvx = Math.cos(Math.atan2(mouse.y - hand.y, mouse.x - hand.x)) * shootSpeed;
  const bvy = Math.sin(Math.atan2(mouse.y - hand.y, mouse.x - hand.x)) * shootSpeed;
  const tl = Math.hypot(tvx, tvy);
  if (tl > 0) { tvx = tvx / tl * shootSpeed; tvy = tvy / tl * shootSpeed; }
  else { tvx = bvx; tvy = bvy; }
  const vx = tvx + (bvx - tvx) * 0.25;
  const vy = tvy + (bvy - tvy) * 0.25;
  return { sx, sy, vx, vy, draws };
}

describe('660 天界碎裂剑帧切片（Main.cs:30974-30980 横切 38×frame）', () => {
  it('帧数 = 14（Main.projFrames 无 660 赋值,由 PROJ_GRID cols×rows 供出）', () => {
    expect((projFramesJson as Record<string, number>)['660']).toBeUndefined();   // 竖条表确无此型（横条不入）
    expect(projFrameCount(660)).toBe(14);
  });

  it('帧矩形公式：X=frame×38、Y=0、38×38——0/1/13 金标断言（:30977 直译）', () => {
    expect(projGridRect(660, 0)).toEqual({ sx: 0, sy: 0, sw: 38, sh: 38, count: 14 });
    expect(projGridRect(660, 1)).toEqual({ sx: 38, sy: 0, sw: 38, sh: 38, count: 14 });
    expect(projGridRect(660, 13)).toEqual({ sx: 494, sy: 0, sw: 38, sh: 38, count: 14 });
  });

  it('全帧域 0..13 逐帧对拍原版表达式', () => {
    for (let f = 0; f < 14; f++) {
      const r = projGridRect(660, f);
      expect(r).not.toBeNull();
      expect(r!.sx).toBe(f * 38);                     // Rectangle(38*proj.frame, 0, …)
      expect(r!.sy).toBe(0);
      expect(r!.sw).toBe(38);
      expect(r!.sh).toBe(38);
    }
  });

  it('越界钳制：负帧→0、超域→末帧 13（出生 Next(14) 值域内,防御位）', () => {
    expect(projGridRect(660, -3)).toEqual(projGridRect(660, 0));
    expect(projGridRect(660, 99)).toEqual(projGridRect(660, 13));
  });

  it('贴图实尺 532×38（14×38 横条,IHDR 直读）——整图绘制即 14 连排「一排剑」病灶', () => {
    const p = pngSize('../public/sprites/vanilla/Projectile_660.png');
    expect([p.w, p.h]).toEqual([532, 38]);
    expect(p.w / 38).toBe(14);
  });

  it('贴图与伤害判定分离：帧 38×38 ≠ SetDefaults 判定盒 10×10（Projectile.cs:7099）', () => {
    const p660 = (projJson as unknown as Record<string, Record<string, number>>)['660'];
    expect(p660.width).toBe(10);
    expect(p660.height).toBe(10);
  });
});

describe('3787 裂天剑 SetDefaults 逐字（Item.cs:33532-33547 / Projectile.cs:7098-7107）', () => {
  const it3787 = (combatJson as unknown as Record<string, Record<string, unknown>>)['3787'];
  const p660 = (projJson as unknown as Record<string, Record<string, number>>)['660'];

  it('物品面：38 伤/4 useTime/12 useAnimation/shoot 660/speed 8.75/蓝 17/暴击 20/击退 6', () => {
    expect(it3787).toMatchObject({
      damage: 38, useTime: 4, useAnimation: 12, shoot: 660, shootSpeed: 8.75,
      mana: 17, crit: 20, knockBack: 6,
      noMelee: true, magic: true, autoReuse: true,
    });
  });

  it('弹体面：aiStyle 1/w×h 10/timeLeft 600/EU 1/friendly+magic+ignoreWater', () => {
    expect(p660).toMatchObject({
      aiStyle: 1, width: 10, height: 10, timeLeft: 600, extraUpdates: 1,
      friendly: true, magic: true, ignoreWater: true,
    });
    // α=255（PROJ_ALPHA0 :7099——AI 白闪门 `if (alpha > 0)` 一次臂的前提）
    expect(PROJ_ALPHA0[660]).toBe(255);
  });

  it('一挥三施：sprayCyclePlan(12,4) = 3 剑（R26 式 1+⌊11/4⌋）', () => {
    const plan = sprayCyclePlan(12, 4);
    expect(plan).not.toBeNull();
    expect(plan!.shots).toBe(3);
    expect(plan!.window).toBe(12);
  });

  it('reuseDelay = 18（case 3787 :33536 useAnimation+6,REUSE_DELAY_TICKS 承载）', () => {
    expect(REUSE_DELAY_TICKS[3787]).toBe(18);
  });

  it('慢施对（F-03 公式接线锁）：窗 31−1−18 / U_eff 10 → 2 发（rd 并入模型备案值）', () => {
    // Game.ts 3787 支实参形：slowMagicSprayPlan(slow, 12, 4, 12, animDur=31, 18)
    // animDur=31 = ⌊12×2.5⌋+1（slowMagicWindowGrow 增量 19 → 12+19）
    const plan = sprayCyclePlan(Math.max(1, 31 - 1 - 18), Math.max(1, Math.floor(4 * 2.5)));
    expect(plan!.shots).toBe(2);
  });
});

describe('出手几何（Player.cs:49314-49330 直译,掷流序敏感）', () => {
  it('开放空间：出生点在光标周 Lerp(20,60) 环带,速度指向光标（Lerp 0.25 混合）', () => {
    let i = 0;
    const seq = [0.1, 0.9, 0.3];                     // f、半径、（canHit 桩恒真不再掷）
    const rnd: Rng = () => seq[i++ % seq.length];
    const mouse = { x: 3000, y: 2000 };
    const hand = { x: 2000, y: 2100 };
    const s = fireSkyFracture3787(rnd, mouse, hand);
    // 环带：hand + unit(f)×[20,60]
    const dist = Math.hypot(s.sx - hand.x, s.sy - hand.y);
    expect(dist).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(dist).toBeLessThanOrEqual(60 + 1e-9);
    // 速度向：与 (鼠标−出生) 同向偏基准 25% 混合 → 内积>0 且非零
    const toMouse = { x: mouse.x - s.sx, y: mouse.y - s.sy };
    const dot = s.vx * toMouse.x + s.vy * toMouse.y;
    expect(dot).toBeGreaterThan(0);
    // 模长 ≤ shootSpeed（等模长两矢 Lerp 不增模）
    const sp = Math.hypot(s.vx, s.vy);
    expect(sp).toBeGreaterThan(0);
    expect(sp).toBeLessThanOrEqual(8.75 + 1e-9);
    expect(s.draws).toBe(2);                         // f 1 抽 + 半径 1 抽
  });

  it('CanHit 重掷路径：被挡方位重掷（每轮 +2 抽）,≤50 次上界', () => {
    let i = 0;
    const seq = [0.1, 0.9, 0.2, 0.5, 0.3, 0.7];      // (f,rad)×3 轮,第 3 轮过
    const rnd: Rng = () => seq[i++ % seq.length];
    let calls = 0;
    const s = fireSkyFracture3787(rnd, { x: 100, y: 100 }, { x: 0, y: 0 },
      () => ++calls < 2 ? false : true);
    expect(s.draws).toBe(4);                         // 首掷 2 抽 + 重掷 2 抽
    expect(calls).toBe(2);
  });

  it('三剑独立伤害：每发全额 cw.damage（38,无分摊）——独立弹体各自判定', () => {
    // 出手侧（Game.ts 3787 支）每发 new Arrow(…, cw.damage, …) 三次;数据面锁基数
    const it3787 = (combatJson as unknown as Record<string, Record<string, number>>)['3787'];
    const p660 = (projJson as unknown as Record<string, Record<string, number>>)['660'];
    expect(it3787.damage).toBe(38);
    // penetrate 缺省 1（Projectile.cs:7098 无 penetrate 行）→ 单发单判,三剑各自结算
    expect(p660.penetrate).toBeUndefined();
  });
});
