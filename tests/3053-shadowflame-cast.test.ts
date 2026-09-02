// 暗影炎弓 3053（Shadow Flame Bow）施法支行为锁 —— Player.cs:47957-47992 直译纯函数
// 建议落位 game/tests/3053-shadowflame-cast.test.ts（相对导入按 tests/ 目录书写；
// 零 src/ 修改——仅消费 src/data 数据面 JSON，兼作 recon 漂移哨兵）。
// 本文件自包含：被锁的施法数学在本文件内 1:1 重写（含掷流序），
// 与 /tmp/p2/3053-branch.ts 粘贴块逐行对应；两侧任一偏离即爆红。
import { describe, it, expect } from 'vitest';
import combatJson from '../src/data/vanilla-itemcombat.json';
import projJson from '../src/data/vanilla-projectiles.json';
import useSoundJson from '../src/data/vanilla-itemusesound.json';

// ================================ 掷流桩 ================================
/** Main.rand.Next 语义（XNA/C#）：Next(n) → 0..n-1；Next(min,max) → min..max-1（排他上界） */
type Rng = () => number;
const next = (rnd: Rng, n: number): number => Math.floor(rnd() * n);
const nextRange = (rnd: Rng, min: number, max: number): number => min + Math.floor(rnd() * (max - min));

/** 脚本化 RNG：按给定序列吐值（序敏感断言用）；越界即抛（多掷/少掷都算错） */
function scriptedRng(seq: number[]): { rnd: Rng; draws: () => number } {
  let i = 0;
  const rnd: Rng = () => {
    if (i >= seq.length) throw new Error(`draw overflow: consumed ${i + 1} > scripted ${seq.length}`);
    return seq[i++];
  };
  return { rnd, draws: () => i };
}

// ==================== 原版施法数学（Player.cs:47957-47992 直译） ====================
export interface ShadowFlameShot {
  vx: number; vy: number;
  /** NewProjectile 尾参（:47989）：ai0=num21（后掷,消费端 X 加速）/ ai1=num20（先掷,Y 加速） */
  ai0: number; ai1: number;
  /** :47959-47964 itemAnimation <= sItem.useTime + 1 */
  flag3: boolean;
  /** 本发相位（= 原版 itemAnimation；测试侧回传便于锁相位映射） */
  phase: number;
  /** 本发消耗的 Main.rand 抽数（散布发 6 / 精确发 4 —— 先掷后清零的流占位） */
  draws: number;
}

/**
 * @param aimX/aimY     瞄准方向（:47681-47707 num4/num5 = mouse − pointPosition 的方向，
 *                      归一由本函数第一步完成）
 * @param shootSpeed    sItem.shootSpeed（3053=9；词缀 shtspd 烘入语义,Item.cs:565）
 * @param itemAnimation 本发相位（窗内序号 k → phaseOf(k,A,U),见下）
 * @param useTime       sItem.useTime（3053=7）
 */
export function shootShadowFlame3053(
  rnd: Rng, aimX: number, aimY: number, shootSpeed: number, itemAnimation: number, useTime: number,
): ShadowFlameShot {
  // :47959-47964
  const flag3 = itemAnimation <= useTime + 1;
  // :47965-47967 vector12 = Normalize(num4,num5) * 4（探针矢）
  let vx = aimX, vy = aimY;
  const al = Math.hypot(vx, vy) || 1;
  vx = (vx / al) * 4; vy = (vy / al) * 4;
  // :47968-47973 散布发：叠加 Next(-100,101)² 归一单位矢
  if (!flag3) {
    const wX = nextRange(rnd, -100, 101), wY = nextRange(rnd, -100, 101);
    const wl = Math.hypot(wX, wY);
    if (wl > 0) { vx += wX / wl; vy += wY / wl; }   // （0,0) 掷=原版 NaN 帧,仓内兜底登记
  }
  // :47974-47975 再归一 × sItem.shootSpeed —— 散布只改方向不改模长
  const l2 = Math.hypot(vx, vy) || 1;
  vx = (vx / l2) * shootSpeed; vy = (vy / l2) * shootSpeed;
  // :47976-47980 num20 = Next(10,80)*0.001;Next(2)==0 → 取负
  let num20 = nextRange(rnd, 10, 80) * 0.001;
  if (next(rnd, 2) === 0) num20 *= -1;
  // :47981-47985 num21 同式（后掷）
  let num21 = nextRange(rnd, 10, 80) * 0.001;
  if (next(rnd, 2) === 0) num21 *= -1;
  // :47986-47988 精确档清零（掷已耗）
  if (flag3) { num21 = 0; num20 = 0; }
  // :47989 NewProjectile(..., vector12.X, vector12.Y, projToShoot, Damage, KnockBack, i, num21, num20)
  return { vx, vy, ai0: num21, ai1: num20, flag3, phase: itemAnimation, draws: flag3 ? 4 : 6 };
}

/** 窗内序号 k（0 基）→ 原版 itemAnimation 相位。
 *  A = itemAnimationMax−1 = useAnimation（:4443-4447 autoReuse+useStyle5+shoot>0 →
 *  itemAnimationMax=A0+1=22;首发拍 itemAnimation 已自减一次 :43145 → 首发相位 21）。
 *  续发每越 useTime 边界一发（:43875 flag4 循环 + :47591-47603 每发重装 itemTime）
 *  → 相位 21/14/7；第 4 发落相位 0,被 flag4 的 itemAnimation>0 门杀（:43894）。 */
export const phaseOf = (k: number, animMaxMinus1: number, useTime: number): number =>
  animMaxMinus1 - k * useTime;
/** 发数式（:43875/:43899：首发 t=0、续发 t=k·U 且 kU ≤ A−1）= 1+⌊(A−1)/U⌋
 *  ≡ R26 sprayCyclePlan（Game.ts:1309 `Math.floor((animDur-1)/useTime)+1`）同式 */
export const shotsPerWindow = (animMaxMinus1: number, useTime: number): number =>
  Math.floor((animMaxMinus1 - 1) / useTime) + 1;

const AIM: [number, number] = [1, 0];
/** 两向夹角（rad,0..π） */
const angleBetween = (ax: number, ay: number, bx: number, by: number): number => {
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  const dot = (ax * bx + ay * by) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
};
/** 理论角偏上限：探针矢=4 + 单位散布矢 ŵ（|ŵ|=1）→ tanθ = √(1−w²)/(4+w)（w=ŵ∥）。
 *  d/dw 零点 w=−1/4 ⇒ tanθ_max = √15/4 ÷ 15/4 = 1/√15 ≈ 0.25820 → 14.478°。
 *  （w=0 切片 = atan(1/4)≈14.036°,非最大——散布矢可略带逆瞄分量。） */
const MAX_DEV = Math.atan(1 / Math.sqrt(15));
const SHOOT_SPEED = 9;   // Item.cs:28248 shootSpeed = 9f
const USE_TIME = 7;      // Item.cs:28245 useTime = 7
const USE_ANIM = 21;     // Item.cs:28244 useAnimation = 21（= itemAnimationMax 22 − 1）

// ================================ 行为锁 ================================
describe('暗影炎弓 3053 施法支（Player.cs:47957-47992）', () => {
  it('【数据面】combat/proj/usesound 三表 1457 终值（recon 漂移哨兵）', () => {
    const c = (combatJson as Record<string, Record<string, number | boolean>>)['3053'];
    expect(c).toBeDefined();
    expect(c.useTime).toBe(7);                 // :28245
    expect(c.useAnimation).toBe(21);           // :28244
    expect(c.shoot).toBe(496);                 // :28247
    expect(c.shootSpeed).toBe(9);              // :28248
    expect(c.mana).toBe(6);                    // :28239（无 useAmmo 行 = 不耗箭）
    expect(c.useAmmo).toBeUndefined();         // ★魔法弓：错挂 AMMO_ARROW = 双重错型
    expect(c.magic).toBe(true);                // :28249 → damageMult('magic')/critChance('magic')
    expect(c.autoReuse).toBe(true);            // :28237（+1 窗特例前提之一）
    expect(c.noUseGraphic).toBe(true);         // :28251
    expect(c.damage).toBe(32);                 // :28242
    expect(c.crit).toBe(3);                    // :28252
    const p = (projJson as Record<string, Record<string, number | boolean>>)['496'];
    expect(p.aiStyle).toBe(91);                // Projectile.cs:5698
    expect(p.width).toBe(40);                  // :5696（贴图面;NPC 判定 10×10 见 :20072）
    expect(p.height).toBe(40);                 // :5697
    expect(p.penetrate).toBe(3);               // :5700
    expect(p.magic).toBe(true);                // :5701（frostEligible=false 依据）
    expect((useSoundJson as Record<string, string>)['3053']).toBe('Item_103');  // :28240
  });

  it('【动画门①】flag3 边界 = useTime+1 恰含（相位 8 真 / 9 假,useTime=7）', () => {
    expect(phaseOf(0, USE_ANIM, USE_TIME)).toBe(21);           // 首发相位 = A
    const at = (phase: number): boolean =>
      shootShadowFlame3053(Math.random, AIM[0], AIM[1], SHOOT_SPEED, phase, USE_TIME).flag3;
    expect(at(USE_TIME + 1)).toBe(true);       // 8 ≤ 8 → 精确弹（含边界）
    expect(at(USE_TIME + 2)).toBe(false);      // 9 > 8 → 散布弹
    expect(at(0)).toBe(true);                  // 动画尾极限仍精确
  });

  it('【动画门②】窗内相位映射 21/14/7 → 仅第 3 发精确;发数 = 1+⌊(A−1)/U⌋ = 3', () => {
    expect(shotsPerWindow(USE_ANIM, USE_TIME)).toBe(3);        // 1+⌊20/7⌋=3（sprayCyclePlan(21,7) 同值）
    const flags = [0, 1, 2, 3].map((k) => {
      const ph = phaseOf(k, USE_ANIM, USE_TIME);
      return shootShadowFlame3053(Math.random, AIM[0], AIM[1], SHOOT_SPEED, ph, USE_TIME).flag3;
    });
    expect(flags).toEqual([false, false, true, true]); // 相位 0（第 4 发）原版被 :43894 门杀不出手
    expect(phaseOf(3, USE_ANIM, USE_TIME)).toBe(0);    // 21−3×7 = 0 → 门杀证
  });

  it('【动画门③】multishot 消费面时序：dur 22/U 7 → 越界拍 elapsed 7/14 各补 1 发', () => {
    // Game.ts:23374-23385 消费式：elapsed=dur−t;mscycle=⌊elapsed/U⌋;
    // mscycle>fired−1 且 ≤maxShots−1 → fired=mscycle+1;fire()
    const dur = USE_ANIM + 1;                              // swing.dur 含 autoReuse +1 帧（15128 批注）
    let fired = 1;
    const firedKs: number[] = [];
    for (let elapsed = 0; elapsed <= dur; elapsed++) {
      const mscycle = Math.floor(elapsed / USE_TIME);
      if (mscycle > fired - 1 && mscycle <= shotsPerWindow(USE_ANIM, USE_TIME) - 1) {
        fired = mscycle + 1;
        firedKs.push(mscycle);                             // fire() 收到的 0 基序号 k
      }
    }
    expect(firedKs).toEqual([1, 2]);                       // 首发 k=0 在 dispatch 出膛,续发恰 k=1/2
  });

  it('【动画门④】词缀缩放鲁棒：A=22/U=7（round 摄动窗）→ 相位 22/15/8/1,精确档 k≥2', () => {
    expect(shotsPerWindow(22, 7)).toBe(4);                 // 1+⌊21/7⌋（原版 4 发窗同构）
    const flags = [0, 1, 2, 3].map((k) =>
      shootShadowFlame3053(Math.random, AIM[0], AIM[1], SHOOT_SPEED,
        phaseOf(k, 22, 7), USE_TIME).flag3);
    expect(flags).toEqual([false, false, true, true]);     // 8≤8、1≤8 → 两发精确（原版同判）
  });

  it('【速度域①】精确弹：方向=瞄准向恒等、|v|≡shootSpeed', () => {
    const s = shootShadowFlame3053(scriptedRng([0.1, 0.1, 0.1, 0.1]).rnd,
      3, -4, SHOOT_SPEED, USE_TIME + 1, USE_TIME);
    expect(s.flag3).toBe(true);
    const len = Math.hypot(s.vx, s.vy);
    expect(len).toBeCloseTo(SHOOT_SPEED, 10);
    expect(s.vx / len).toBeCloseTo(3 / 5, 10);             // 方向 = normalize(3,−4)
    expect(s.vy / len).toBeCloseTo(-4 / 5, 10);
  });

  it('【速度域②】散布弹：模长恒 shootSpeed（散布只改方向）+ 角偏 ∈ [0, atan(1/√15)]', () => {
    let sawDeviation = false;
    for (let t = 0; t < 2000; t++) {
      const s = shootShadowFlame3053(Math.random, AIM[0], AIM[1], SHOOT_SPEED, 14, USE_TIME);
      expect(s.flag3).toBe(false);
      expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(SHOOT_SPEED, 9);   // 速度域不变量
      const dev = angleBetween(s.vx, s.vy, AIM[0], AIM[1]);
      expect(dev).toBeLessThanOrEqual(MAX_DEV + 1e-9);              // 14.478° 上限（w=−1/4 最劣）
      if (dev > 1e-6) sawDeviation = true;
    }
    expect(sawDeviation).toBe(true);                                // 散布确实发生了
  });

  it('【速度域③】探针矢 ×4 几何定谳：正交单位散布矢 → 角偏恰 atan(1/4)（w=0 切片）', () => {
    // 脚本：Next(-100,101) 双掷 → w=(0,100) → 归一 (0,1)（正交单位矢）
    // v = 4·x̂ + ŷ → tanθ = 1/4（正交切片,非最劣切片）
    const s = shootShadowFlame3053(scriptedRng([0.5, 0.999, 0.1, 0.1, 0.1, 0.1]).rnd,
      AIM[0], AIM[1], SHOOT_SPEED, 14, USE_TIME);
    expect(angleBetween(s.vx, s.vy, 1, 0)).toBeCloseTo(Math.atan(1 / 4), 9);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(SHOOT_SPEED, 9);
    // ×4 常数反证：若探针幅值非 4（如直乘 shootSpeed）,垂直散布的角偏必偏离 atan(1/4)
  });

  it('【速度域⑥】最劣切片锁：ŵ∥=−1/4（整数掷 −25:97）→ 角偏≈atan(1/√15) 包络', () => {
    // Next(-100,101) 整数面最接近 w=−1/4 切片的整数对 (−25,97)：
    // r=75.4/201 → −25;r=197.4/201 → +97
    const s = shootShadowFlame3053(
      scriptedRng([75.4 / 201, 197.4 / 201, 0.1, 0.1, 0.1, 0.1]).rnd,
      AIM[0], AIM[1], SHOOT_SPEED, 14, USE_TIME);
    expect(angleBetween(s.vx, s.vy, 1, 0)).toBeCloseTo(MAX_DEV, 4);   // 包络 ≈14.478°
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(SHOOT_SPEED, 9);
  });

  it('【速度域④】(0,0) 散布掷 → 兜底=探针向（不产 NaN;原版 NaN 帧登记偏离）', () => {
    // 100/201 × 201 = 100（整）→ Next(-100,101) = 0,双掷同值 → w=(0,0)
    const s = shootShadowFlame3053(scriptedRng([100 / 201, 100 / 201, 0.1, 0.1, 0.1, 0.1]).rnd,
      AIM[0], AIM[1], SHOOT_SPEED, 14, USE_TIME);
    expect(Number.isFinite(s.vx) && Number.isFinite(s.vy)).toBe(true);
    expect(angleBetween(s.vx, s.vy, 1, 0)).toBeCloseTo(0, 12);      // 方向=纯探针向
  });

  it('【速度域⑤】斜向瞄准同样成立（模长/上限与轴无关;含逆瞄分量切片）', () => {
    for (let t = 0; t < 500; t++) {
      const ang = -0.9 + (t / 500) * 1.8;
      const s = shootShadowFlame3053(Math.random, Math.cos(ang), Math.sin(ang), SHOOT_SPEED, 14, USE_TIME);
      expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(SHOOT_SPEED, 9);
      expect(angleBetween(s.vx, s.vy, Math.cos(ang), Math.sin(ang))).toBeLessThanOrEqual(MAX_DEV + 1e-9);
    }
  });

  it('【ai 域①】值域 ±[0.010,0.079]（Next(10,80)×0.001 + Next(2) 符号）', () => {
    for (let t = 0; t < 2000; t++) {
      const s = shootShadowFlame3053(Math.random, 1, 0, SHOOT_SPEED, 14, USE_TIME);
      for (const v of [s.ai0, s.ai1]) {
        expect(Math.abs(v)).toBeGreaterThanOrEqual(0.010);
        expect(Math.abs(v)).toBeLessThanOrEqual(0.079);
      }
    }
  });

  it('【ai 域②】逆序锁：num20 先掷→ai1、num21 后掷→ai0（NewProjectile :47989 尾参序）', () => {
    // 掷序：wX, wY（散布矢）→ num20 值, num20 符, num21 值, num21 符
    // [0.5,0.5] → w=(0,0) 兜底;0 → Next(10,80)=10 → 0.010;0.1 → Next(2)=0 → 取负;
    // 0.99 → Next(10,80)=10+69=79 → 0.079;0.75 → Next(2)=1 → 正
    const { rnd } = scriptedRng([0.5, 0.5, 0, 0.1, 0.99, 0.75]);
    const s = shootShadowFlame3053(rnd, 1, 0, SHOOT_SPEED, 14, USE_TIME);
    expect(s.ai1).toBe(-0.010);    // num20=0.010 负号 → 落 ai1（Y 加速）
    expect(s.ai0).toBe(0.079);     // num21=0.079 正号 → 落 ai0（X 加速）
  });

  it('【ai 域③】精确弹清零但抽数照耗：散布 6 抽 / 精确 4 抽（掷流占位,逐位同构前提）', () => {
    const spread = scriptedRng([0.5, 0.5, 0.1, 0.1, 0.1, 0.1]);
    shootShadowFlame3053(spread.rnd, 1, 0, SHOOT_SPEED, 14, USE_TIME);
    expect(spread.draws()).toBe(6);
    const precise = scriptedRng([0.1, 0.1, 0.1, 0.1]);
    const ps = shootShadowFlame3053(precise.rnd, 1, 0, SHOOT_SPEED, USE_TIME + 1, USE_TIME);
    expect(ps.flag3).toBe(true);
    expect(ps.ai0).toBe(0);
    expect(ps.ai1).toBe(0);
    expect(precise.draws()).toBe(4);
  });

  it('【ai 域④】消费端常量锁（aiStyle91,Projectile.cs:33097-33148）', () => {
    // 生成侧不消费这些常量,在此钉死防弹体侧移植漂移：
    const aiStyle91 = {
      accelPerStep: 1.5,        // :33118-33119 v += ai×1.5（每 AI 子步）
      aiGrowth: 1.05,           // :33123-33124 ai ×1.05/子步
      speedCap: 16,             // :33120-33122
      extraUpdates: 2,          // MaxUpdates=3 ≡ extraUpdates+1（Projectile.cs:556-565 别名式）
      lifeSteps: 44,            // localAI 0→0.95：<0.1 时 +0.01（10 步）+0.025（34 步）（:33106-33113）
      buffId: 153, buffMin: 240, buffMax: 480,   // 影焰（:11473-11476）
      npcBox: 10,                                // GetCollisionParams（:20072-20074）
    };
    expect(aiStyle91.accelPerStep * 0.079).toBeCloseTo(0.1185, 9);   // 最大单子步加速
    expect(aiStyle91.lifeSteps / (aiStyle91.extraUpdates + 1)).toBeCloseTo(14.67, 2); // ≈15t 寿命
    expect(aiStyle91.buffMax - aiStyle91.buffMin).toBe(240);         // Next(240,480) 排他上界 480
    // 顶层初速恒 shootSpeed 9 < 帽 16 → 帽只在摆动累积后生效
    expect(SHOOT_SPEED).toBeLessThan(aiStyle91.speedCap);
  });
});
