// ★BJ417 2026-09-30 三件判别面：
//   ①风筝在场门（重定谳——BJ413「原版无单实例门」漏检已撤）：
//     ItemID.Sets.HasAProjectileThatHasAUsabilityCheck = 风筝全集（ItemID.cs:177）
//     → ItemCheck_CheckCanUse_Inner 尾支（Player.cs:52932-52935）
//     → ItemCheck_CheckUsabilityOfProjectiles（:52994-53005）逐 active owned 弹
//     → Projectile.CheckUsability（Projectile.cs:54404-54410）aiStyle==160 → false。
//     语义=任意 aiStyle160 弹在场 → TryStartUse 整体失败零副作用（不重放出膛）。
//   ②PvP 剑帧制 1457 化（Frame(2,7) 38×38 整帧/悬停=行 6 覆盖帧;1456 4×6+36×37 裁已废）
//   ③成就 Advisor 锚钉值（宽屏大卡=固定左锚 (501,25)=20+560×0.85+5,Main.cs:41755-41762;
//     非右锚!窄屏内联 x=sw-224 已有 vanilla-inv-layout 钉值）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KiteProj, kiteBlockedByOwnedAirborne, type KiteCtx } from '../src/entities/KiteProj';
import { pvpIconFrame, pvpHoverFrame } from '../src/ui/UI';
import { ADVISOR_XY } from '../src/ui/vanillaInvLayout';

const ROOT = resolve(__dirname, '..');

/** 门测试零行为桩：KiteProj 构造器不消费 ctx,判别面只在存活性/netPuppet 域 */
const stubCtx = (() => {
  const base = {
    channel: () => false, letOut: () => false, heldShoot: () => 766, cced: () => false,
    noItems: () => false, pulley: () => false, dead: () => false,
    armPos: () => ({ x: 0, y: 0 }), playerDir: () => 1, faceDir: () => undefined,
    applyKiteBuff: () => undefined, playerTopY: () => 0,
    playerCenter: () => ({ x: 0, y: 0 }), wind: () => 0, cloudAlpha: () => 0,
    inWind: () => false, playReelSfx: () => undefined,
  };
  return base as unknown as KiteCtx;
})();

describe('BJ417 ① 风筝在场门（Projectile.CheckUsability aiStyle160 等价）', () => {
  it('同型风筝弹在场 → 拒', () => {
    const k = new KiteProj(100, 60, 766, stubCtx);
    expect(kiteBlockedByOwnedAirborne([k])).toBe(true);
  });

  it('异型风筝弹在场 → 同样拒（原版门=任意 aiStyle160 非同型门 :54404）', () => {
    const other = new KiteProj(100, 60, 771, stubCtx);
    expect(kiteBlockedByOwnedAirborne([other])).toBe(true);
  });

  it('已消亡（dead）弹不拒 —— CheckUsability 只扫 active（:52996-53002）', () => {
    const k = new KiteProj(100, 60, 766, stubCtx);
    k.dead = true;
    expect(kiteBlockedByOwnedAirborne([k])).toBe(false);
  });

  it('netPuppet（远端傀儡,非 owner==whoAmI 域）不拒 —— 扫描限 owner 本机', () => {
    const k = new KiteProj(100, 60, 766, stubCtx);
    k.netPuppet = true;
    expect(kiteBlockedByOwnedAirborne([k])).toBe(false);
  });

  it('空场 → 不拒（首用放行）', () => {
    expect(kiteBlockedByOwnedAirborne([])).toBe(false);
    const boom = { projId: 6, dead: false };   // 非风筝弹不参与本门
    expect(kiteBlockedByOwnedAirborne([boom])).toBe(false);
  });

  it('门置位 = useCombatWeapon 首守卫（被拒尝试零副作用——在 useSwing/出膛之前,同回旋镖纪律）', () => {
    const src = readFileSync(resolve(ROOT, 'src/core/Game.ts'), 'utf8');
    const guardBoomerang = src.indexOf("cwIn.kind === 'boomerang' && boomerangBlockedByOwned");
    const guardKite = src.indexOf("cwIn.kind === 'kite' && kiteBlockedByOwnedAirborne");
    const caseKite = src.indexOf("case 'kite': {");
    expect(guardBoomerang).toBeGreaterThan(0);
    expect(guardKite).toBeGreaterThan(guardBoomerang);
    expect(caseKite).toBeGreaterThan(guardKite);   // 门在 case 体之前=首守卫位
  });
});

describe('BJ417 ② PvP 剑帧制（1457 Frame(2,7) Main.cs:43419-43434）', () => {
  it('构建面钉值：38×38 @200% 700% + 悬停覆盖层（两构建区同制）', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(src).toContain('width:38px; height:38px');            // classic 构建区
    expect(src.match(/background-size:200% 700%/g)?.length).toBeGreaterThanOrEqual(3);  // classic 钮+覆盖层、vinv 覆盖层
    expect(src).toContain("sword.style.backgroundSize = '200% 700%'");  // vinv 钮（camelCase 侧）
    expect(src.match(/dataset\.pvpHover/g)?.length).toBeGreaterThanOrEqual(2);          // 两构建区各一覆盖层
    expect(src).not.toContain('background-size:400% 600%');      // 1456 旧制清零
    expect(src).not.toContain('width:36px; height:37px');        // 1456 裁窗清零
  });

  it('帧百分比算式钉值（col/(2-1)、row/(7-1)——refreshPvpButtons）', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(src).toContain('${col * 100}% ${(row / 6) * 100}%');
    expect(src).not.toContain('(col / 3)');   // 1456 四列算式清零
    expect(src).not.toContain('(row / 5)');
  });
});

describe('BJ417 ③ 成就 Advisor 锚（Main.cs:41755-41762 固定左锚）', () => {
  it('宽屏大卡 = 固定 (501,25)——num10=(int)(20+560×0.85)+0、num11=20+0、DrawOneAchievement 再 +(5,5)', () => {
    // 原文：num/num2 在 DrawInventory 头恒 0（Main.cs:41716-41717, Advisor 绘制前无再赋值）
    // → x=20+560*0.85+5=501、y=20+0*0.85+5=25。【左锚】非右锚——距屏幕右缘 margin=sw-559 随屏宽走
    expect(ADVISOR_XY).toEqual({ x: 501, y: 25 });
  });

  it('消费面钉值：sw>=1000 → ADVISOR_XY.x（y=20 为 2026-09-13 用户拍板偏差备案,vanilla 25）', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/UI.ts'), 'utf8');
    expect(src).toContain('if (c.sw >= 1000) return { x: ADVISOR_XY.x, y: 20 };');
    expect(src).toContain('y=20;vanilla 25 = 5px 差,偏差备案');   // 偏差登记注释在位
  });
});
