// 弹幕旋转模式回归(PROJ_ROT_RIGHT):贴图朝右族不得回落到默认 +π/2
// (用户报"食人鱼枪的鱼要转 90 度"——根因 = 通用绘制恒 +π/2)
// 数据锚:scripts/_projrot-audit.mjs 扫 AI_001 type 链 + 各 AI 的 rotation 赋值
import { describe, it, expect } from 'vitest';
import { PROJ_ROT_RIGHT } from '../src/entities/Arrow';

describe('PROJ_ROT_RIGHT 朝右贴图族(原版 rotation=ToRotation,非 +π/2)', () => {
  it('食人鱼 190(1156 食人鱼枪,aiStyle 39 :26122-26140 模式)', () => {
    expect(PROJ_ROT_RIGHT.has(190)).toBe(true);
  });

  it('魔法飞弹 16(113,AI_009 :54039)/ Flamelash 34(218,八帧行)', () => {
    expect(PROJ_ROT_RIGHT.has(16)).toBe(true);
    expect(PROJ_ROT_RIGHT.has(34)).toBe(true);
  });

  it('837(AI_001 显式 MIRROR :54715)/ 1023(仅 wiggle 基姿态 0)', () => {
    expect(PROJ_ROT_RIGHT.has(837)).toBe(true);
    expect(PROJ_ROT_RIGHT.has(1023)).toBe(true);
  });

  it('默认族不入表:箭 1/子弹 14(AI_001 默认 +π/2 :54877)', () => {
    expect(PROJ_ROT_RIGHT.has(1)).toBe(false);
    expect(PROJ_ROT_RIGHT.has(14)).toBe(false);
  });
});
