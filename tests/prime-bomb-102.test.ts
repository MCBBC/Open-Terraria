// SW-U1 2026-09-04：Skeletron Prime 炮弹 102（BombSkeletronPrime）专属实体回归。
// 标杆 Terarria1457/Terraria/Projectile.cs——纯函数面（不实例化 Game）：
//  ① Kill_ExplodeTiles FTW 闸门（:79027-79035 `102 && getGoodWorld &&
//     !tenthAnniversaryWorld` → num6=4）四象限 × 半径
//  ② AI_016 重力门（:48332/:48377-48394）+ 终端钳（:47996-47998）+
//     落地引信钳（:48004-48006）+ Kill 态盒/伤（PrepareBombToBlow :47688-47693）
import { describe, it, expect } from 'vitest';
import {
  BombSkeletronPrimeProj,
  primeBombTerrainRadius, primeBombGravityStep, primeBombFallClamp, primeBombLandingFuse,
} from '../src/entities/BombSkeletronPrimeProj';

describe('SW-U1 Prime 炮弹 102（aiStyle16 引信族）', () => {
  it('Kill_ExplodeTiles FTW 闸门四象限（:79027-79035）:FTW×非十周年=r4,余三象限零地形', () => {
    expect(primeBombTerrainRadius(true, false)).toBe(4);    // for the worthy
    expect(primeBombTerrainRadius(true, true)).toBe(0);     // FTW×十周年=不炸
    expect(primeBombTerrainRadius(false, false)).toBe(0);   // 普通档
    expect(primeBombTerrainRadius(false, true)).toBe(0);    // celebrationmk10
  });

  it('重力门 ai[0]>5（:48377 第二析取支）+落地摩擦/重力/ai0 钳 10（:48379-48394）', () => {
    expect(primeBombGravityStep(0, 12, -5.8)).toEqual({ ai0: 1, vx: 12, vy: -5.8 });   // 门未开
    expect(primeBombGravityStep(4, 12, -5.8)).toEqual({ ai0: 5, vx: 12, vy: -5.8 });
    expect(primeBombGravityStep(5, 12, -5.8).vy).toBe(-5.6);                            // 第 6 拍开门
    expect(primeBombGravityStep(9, 1, 0)).toEqual({ ai0: 10, vx: 0.97, vy: 0.2 });      // 落地摩擦+重力
    expect(primeBombGravityStep(9, 0.005, 0).vx).toBe(0);                               // |vx|<0.01 归零
    expect(primeBombGravityStep(9, 0.005, -2).vx).toBe(0.005);                          // 空中无摩擦
    expect(primeBombGravityStep(20, 0, 3).ai0).toBe(10);                                // 开门拍钳 10
  });

  it('终端钳 10（:47996-47998）/落地引信钳 3（:48004-48006,vy==0 且余量>3）', () => {
    expect(primeBombFallClamp(14)).toBe(10);
    expect(primeBombFallClamp(10)).toBe(10);
    expect(primeBombFallClamp(9.9)).toBe(9.9);
    expect(primeBombFallClamp(-3)).toBe(-3);                        // 只钳下落向
    expect(primeBombLandingFuse(3590, 0)).toBe(3);                  // 落地 → 同拍 Kill
    expect(primeBombLandingFuse(3590, -2.4)).toBe(3590);            // 空中不钳
    expect(primeBombLandingFuse(2, 0)).toBe(2);                     // 余量≤3 不回抬
  });

  it('Kill 态实件（SetDefaults :1898-1903 22²/damage 0 + PrepareBombToBlow 128²×40 面）', () => {
    const b = new BombSkeletronPrimeProj(640, 640, 4, -3);
    expect([b.w, b.h, b.damage, b.projId]).toEqual([22, 22, 0, 102]);
    expect([b.x, b.y]).toEqual([640 - 11, 640 - 11]);               // 入参 = 出膛弹心
    expect(b.frame).toBe(0);
  });
});
