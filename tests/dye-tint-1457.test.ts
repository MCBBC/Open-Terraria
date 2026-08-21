// 1457 敌怪 debuff 染色链闸门(2026-08-21 补盲):Enemy.debuffTintRGB =
// GetNPCColorTintedByBuffs(1457 NPC.cs:92142-92255)等价——debuff 逐项 RGB 乘区累乘,
// Renderer.drawEnemy(:4809)以 tintedSprite(multiply) 消费。本文件锁乘区数值与求值序;
// 1457 新增两段:397 叶绿孢子(:92169-92174,中毒式 R×0.65 B×0.75)与
// 395 强酸(:92176-92181,剧毒式 G×0.45 R×0.75)。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';

const z = (): Enemy => Enemy.fromVanilla(3, 100, 100)!;   // 3 僵尸(普通怪,可显示 buff)

/** [R,G,B]×255 取整(与 getter 返回同式) */
const rgb = (r: number, g: number, b: number): [number, number, number] =>
  [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];

describe('1457 染色链: 新增两段', () => {
  it('395 强酸 potentAcidT → R×0.75 G×0.45(剧毒式,:92176-92181)', () => {
    const e = z();
    e.potentAcidT = 5;
    expect(e.debuffTintRGB).toEqual(rgb(0.75, 0.45, 1));
  });
  it('397 叶绿孢子 chlorophyteSporeT → R×0.65 B×0.75(中毒式,:92169-92174)', () => {
    const e = z();
    e.chlorophyteSporeT = 5;
    expect(e.debuffTintRGB).toEqual(rgb(0.65, 1, 0.75));
  });
  it('395+397 同持:乘区累乘(R=0.75×0.65,闭式一次乘 npcColor 与逐次乘等价)', () => {
    const e = z();
    e.potentAcidT = 5;
    e.chlorophyteSporeT = 5;
    expect(e.debuffTintRGB).toEqual(rgb(0.75 * 0.65, 0.45, 0.75));
  });
});

describe('1457 染色链: 既有链抽样(回归保护)', () => {
  it('中毒 20 → R×0.65 B×0.75(:92155-92160);剧毒 70 → G×0.45 R×0.75(:92162-92167)', () => {
    const p = z();
    p.poisonT = 5;
    expect(p.debuffTintRGB).toEqual(rgb(0.65, 1, 0.75));
    const v = z();
    v.venomT = 5;
    expect(v.debuffTintRGB).toEqual(rgb(0.75, 0.45, 1));
  });
  it('流血/出血 → G×0.85 B×0.85;迈达斯 → R×0.85 B×0.3;油 → ×0.4 全通道', () => {
    const b = z();
    b.bleedT = 5;
    expect(b.debuffTintRGB).toEqual(rgb(1, 0.85, 0.85));
    const m = z();
    m.midasT = 2;
    expect(m.debuffTintRGB).toEqual(rgb(0.85, 1, 0.3));
    const o = z();
    o.oiledT = 5;
    expect(o.debuffTintRGB).toEqual(rgb(0.4, 0.4, 0.4));
  });
  it('ichor(69) 整色替换 (255,255,0) 非乘区(:92246-92248);叠加中毒仍整色替换', () => {
    const e = z();
    e.ichorT = 5;
    expect(e.debuffTintRGB).toEqual([255, 255, 0]);
    e.poisonT = 5;
    expect(e.debuffTintRGB).toEqual([255, 255, 0]);
  });
  it('多 debuff 求值序 = 原版 if 链(破甲→中毒→剧毒→孢子→强酸→…),乘法可交换故验组合值', () => {
    const e = z();
    e.brokenArmorT = 5;      // ×0.75 全通道
    e.poisonT = 5;           // R×0.65 B×0.75
    e.venomT = 5;            // G×0.45 R×0.75
    expect(e.debuffTintRGB).toEqual(rgb(0.75 * 0.65 * 0.75, 0.75 * 0.45, 0.75 * 0.75));
  });
  it('无 debuff → null(不进 tintedSprite);canDisplayBuffs=false → null(FTW 石巨人族)', () => {
    expect(z().debuffTintRGB).toBeNull();
    // FTW 245-248 canDisplayBuffs=false 由 ScaleStats/刷怪链写入(VanillaSpawner.ts:537;
    // 数据面归 tests/scalestats-batchb-four.test.ts)——此处只验染色门消费
    const golem = Enemy.fromVanilla(245, 0, 0)!;
    golem.canDisplayBuffs = false;
    golem.potentAcidT = 5;
    expect(golem.debuffTintRGB).toBeNull();
  });
});
