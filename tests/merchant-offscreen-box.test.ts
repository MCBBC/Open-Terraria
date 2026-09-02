// 商人离屏消散屏盒族对齐（★M1 2026-09-02）——B6C 同源问题清账：
//   骷髅商(453) CheckActive 双盒链  NPC.cs:78689-78816（旧 TILE*62 Chebyshev 近似退役）
//   游商(368) UnspawnTravelNPC 盒   WorldGen.cs:4920-4957（Main.cs:65985-89 每 tick 调）
// 原版几何（sWidth=1920/sHeight=1200, NPC.cs:6789-6793）：
//   · 屏盒 rectangle2 半幅 = sWidth/2+width / sHeight/2+height
//     （453 SetDefaults 18×40, NPC.cs:14427-14439 → 978/640px）
//   · activeRange rectangle 半幅 = (int)(s×2.1) = 4032/2520（保命盒:
//     盒内 timeLeft 已负也活着——离屏 750t 消散的真门 = 出 activeRange 盒）
//   · 游商盒半幅 = sWidth/2+safeRangeX / sHeight/2+safeRangeY = 1022/639px
//     （safeRangeX/Y=(int)((s/16)×0.52)=62/39, NPC.cs:6172-6175），盒心 = NPC
//     中心所在格格心（num2*16+8 量化, WorldGen.cs:4931-4932）
// 判别例锚定旧近似的两处翻车面：纵向 992→661/660px 级过宽 + 游商欧氏距/格心量化。
import { describe, it, expect } from 'vitest';
import {
  npcScreenBoxHit, travelMerchantBoxHit, skeletonMerchantCheckActiveStep,
  NPC_SCREEN_HALF_X, NPC_SCREEN_HALF_Y, NPC_SAFE_RANGE_X, NPC_SAFE_RANGE_Y, NPC_ACTIVE_TIME,
} from '../src/core/Game';
import { CHECK_ACTIVE_HALF_X, CHECK_ACTIVE_HALF_Y } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';

// 原版实体盒：453/368 SetDefaults 18×40；玩家 20×42（Player.cs:55083-55084）
const SM_W = 18, SM_H = 40, PL_W = 20, PL_H = 42;
const OLD_APPROX = 62 * 16;   // 旧 TILE*62 = 992px 定值（Chebyshev/欧氏两处同抄）

describe('【M1】屏盒族常量 = 原式现算（防手抄漂移）', () => {
  it('safeRange/activeTime 与 NPC.cs 公式逐项一致', () => {
    expect(NPC_SCREEN_HALF_X).toBe(1920 / 2);
    expect(NPC_SCREEN_HALF_Y).toBe(1200 / 2);
    expect(NPC_SAFE_RANGE_X).toBe(Math.trunc((1920 / 16) * 0.52));   // (int)(120×0.52)=62
    expect(NPC_SAFE_RANGE_Y).toBe(Math.trunc((1200 / 16) * 0.52));   // (int)(75×0.52)=39
    expect(NPC_ACTIVE_TIME).toBe(750);
    expect(CHECK_ACTIVE_HALF_X).toBe(Math.trunc(1920 * 2.1));        // 4032
    expect(CHECK_ACTIVE_HALF_Y).toBe(Math.trunc(1200 * 2.1));        // 2520
  });

  it('骷髅商实例盒 = vanilla SetDefaults 18×40（Game.ts 调用点吃 sm.w/sm.h）', () => {
    const sm = new TownNPC('skeleton_merchant', 100 * 16, 100 * 16);
    expect(sm.vanillaId).toBe(453);
    expect(sm.w).toBe(18);
    expect(sm.h).toBe(40);
  });
});

describe('【M1】骷髅商 CheckActive 屏盒（rectangle2, NPC.cs:78691-93）', () => {
  // 盒心 = NPC 中心;半幅 X = 960+18 = 978, Y = 600+40 = 640;再外扩玩家半盒 10/21
  const hit = (dx: number, dy: number) =>
    npcScreenBoxHit(0, 0, SM_W, SM_H, dx, dy, PL_W, PL_H);

  it('盒心即真;X 边界 978+10=988 严格不等号', () => {
    expect(hit(0, 0)).toBe(true);
    expect(hit(987, 0)).toBe(true);
    expect(hit(988, 0)).toBe(false);
    expect(hit(-988, 0)).toBe(false);      // 对称
  });

  it('Y 边界 640+21=661——★旧 992px 纵向过宽 331px 的翻车面', () => {
    expect(hit(0, 660)).toBe(true);
    expect(hit(0, 661)).toBe(false);
    expect(hit(0, -661)).toBe(false);
  });

  it('判别例：旧 TILE*62 Chebyshev 判"在屏"、真值出盒（计时器应走针）', () => {
    // 正下方 670px：旧 670<992 → 恒续命不消散;真值 670≥661 → 出盒
    expect(hit(0, 670)).toBe(false);
    // 正右 990px：旧 990<992 → 续命;真值 990≥988 → 出盒
    expect(hit(990, 0)).toBe(false);
  });
});

describe('【M1】骷髅商 CheckActive 单步（NPC.cs:78689-78816 时序 1:1）', () => {
  const step = skeletonMerchantCheckActiveStep;

  it('屏盒相交（必同时在 activeRange 盒内,978<4032/640<2520）→ 750−1 续命', () => {
    expect(step(5, true, true)).toEqual({ timeLeft: 749, despawn: false });
  });

  it('activeRange 盒内倒计时带：timeLeft>0 活着,逐 tick 递减', () => {
    expect(step(749, true, false)).toEqual({ timeLeft: 748, despawn: false });
    expect(step(2, true, false)).toEqual({ timeLeft: 1, despawn: false });
  });

  it('timeLeft 归零 → 即使仍在 activeRange 盒内也消散（:78791-94 强翻 flag2）', () => {
    expect(step(1, true, false)).toEqual({ timeLeft: 0, despawn: true });
    expect(step(0, true, false)).toEqual({ timeLeft: -1, despawn: true });
  });

  it('玩家出 activeRange 盒 → 当 tick 即消,余量不看（:78795-98 !flag2 直判）', () => {
    expect(step(750, false, false)).toEqual({ timeLeft: 749, despawn: true });
    expect(step(749, false, false)).toEqual({ timeLeft: 748, despawn: true });
  });

  it('盒内离屏（978/640~4032/2520 带）：整 750 tick（NewNPC 起值 :8570）消散', () => {
    let r = step(NPC_ACTIVE_TIME, true, false);
    let ticks = 1;
    while (!r.despawn) { r = step(r.timeLeft, true, false); ticks++; }
    expect(ticks).toBe(750);
  });

  it('回屏一格立即续命（timeLeft=-50 → 749）', () => {
    expect(step(-50, true, true)).toEqual({ timeLeft: 749, despawn: false });
  });
});

describe('【M1】游商 UnspawnTravelNPC 盒（WorldGen.cs:4931-4943）', () => {
  // NPC 中心钉在 100 号格格心 (1608,1608)：盒心恰=自身中心,量化旁路
  const NX = 100 * 16 + 8, NY = 100 * 16 + 8;
  const hit = (dx: number, dy: number) =>
    travelMerchantBoxHit(NX, NY, NX + dx, NY + dy, PL_W, PL_H);

  it('半幅 = 960+62 / 600+39 = 1022/639,外扩玩家半盒 → 1032/660 边界', () => {
    expect(hit(0, 0)).toBe(true);
    expect(hit(1031, 0)).toBe(true);
    expect(hit(1032, 0)).toBe(false);
    expect(hit(0, 659)).toBe(true);
    expect(hit(0, 660)).toBe(false);
  });

  it('轴不对称：横 1031 纵 659 各自独立判（旧欧氏距 992 定值两轴皆错）', () => {
    // 正下方 700px：旧 hypot(0,700)=700<992 → 留场;真值 700≥660 → 当 tick 消散
    expect(hit(0, 700)).toBe(false);
    // 正右 1020px：旧 1020>992 → 消散;真值 1020<1032 → 留场（反向翻车面）
    expect(hit(1020, 0)).toBe(true);
  });

  it('盒心 = 格心量化（num2*16+8）：格内偏移 ≤8px 不动盒', () => {
    const ox = NX + 7;                                   // 同在 100 号格,偏 7px
    // 盒心仍 1608：与格心对齐的边界值照旧生效
    expect(travelMerchantBoxHit(ox, NY, NX + 1031, NY, PL_W, PL_H)).toBe(true);
    expect(travelMerchantBoxHit(ox, NY, NX + 1032, NY, PL_W, PL_H)).toBe(false);
  });
});
