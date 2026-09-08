// 草族四绘制路径 ×1/4 替换语义锁（TileParticles.ts 文件头注 ★F7——2026-09-08 定谳、
// 2026-09-09 落刀）。原文：DrawGrass(:8508 掷+:8512-8515 发射)/DrawAnyDirectionalGrass
// (:8566+:8570-8573)/DrawMultiTileGrassInWind(:9146+:9150-9153)/
// DrawMultiTileVinesInWind(:9665+:9669-9672)——`_rand.Next(4)==0` 门包整个
// DrawTiles_EmitParticles,且四域 tile 注册后 `continue` 跳过 DrawSingleTile(:729),
// 主路径唯一发射点 :974-977 对它们整帧不评估 ⇒ 是【替换 ×1/4】而非【额外】。
// 落刀：Game.ts grassParticleFold（emitTileParticles probEff 乘区）——此锁防两向漂移：
//   ① 将来在四域 sheet 上新增规则而未按 ×1/4 折算并更新头注 → 交集爆红提示；
//   ② 将来误实现红队原始提议的"额外概率支"（叠加双发）→ 110 有效概率爆红；
//   ③ 将来误把 592（表内已含结构门 1/4）再折 / 误把 WindyGrass 域设置回落拆掉 → 各自爆红。
import { describe, it, expect } from 'vitest';
import { TILE_PARTICLE_RULES, SHINE_TABLE } from '../src/render/TileParticles';
import { GRASS_COUNTER_SHEETS, grassParticleFold } from '../src/core/Game';

// TileDrawing.cs 注册循环 :539-727（各 case 顶左格 AddSpecialPoint 后 continue）
// + ShouldSwayInWind :7836-7851 × TileID.cs:273 SwaysInWindBasic 白名单
const WINDY_GRASS = new Set([3, 20, 24, 61, 703, 71, 73, 74, 83, 84, 110, 113,
  201, 227, 529, 590, 595, 615, 624, 700, 656, 701, 637]);
const ANY_DIRECTIONAL_GRASS = new Set([184]);                    // :718-719（LongMoss,帧无关）
const MULTI_TILE_GRASS = new Set([27, 236, 238, 702, 233, 652, 651, 530, 705,
  485, 489, 490, 521, 522, 523, 524, 525, 526, 527, 493, 519]);  // :605-691
const MULTI_TILE_VINE = new Set([34, 698, 454, 42, 270, 271, 572, 581, 660,
  91, 95, 126, 444, 465, 591, 592]);                             // :554-603
const GRASS_GATE_DOMAIN = new Set([
  ...WINDY_GRASS, ...ANY_DIRECTIONAL_GRASS, ...MULTI_TILE_GRASS, ...MULTI_TILE_VINE,
]);

describe('草族四绘制路径域 × 本仓规则表交集（F7 ×1/4 落地 tripwire）', () => {
  it('域全集逐型全等：GRASS_COUNTER_SHEETS = 四域并集 61 型（TileDrawing.cs :539-727/:718-719 + TileID.cs:273）', () => {
    expect(GRASS_COUNTER_SHEETS.size).toBe(61);
    const union = new Set([...WINDY_GRASS, ...ANY_DIRECTIONAL_GRASS, ...MULTI_TILE_GRASS, ...MULTI_TILE_VINE]);
    expect(union.size).toBe(61);                         // 四域互不交叠
    for (const s of union) expect(GRASS_COUNTER_SHEETS.has(s)).toBe(true);
    // VineThread 爬藤走 TileCounterType.Vine（:766）→ DrawVines(:9058) 无 EmitParticles,不入域
    for (const s of [52, 62, 115, 205, 382, 528, 636, 638, 549]) {
      expect(GRASS_COUNTER_SHEETS.has(s)).toBe(false);
    }
  });

  it('交集 = {24,34,42,61,71,83,110,592}——四域新增规则必须先按 ×1/4 折算并更新头注', () => {
    const affected = [...TILE_PARTICLE_RULES.keys()]
      .filter((s) => GRASS_GATE_DOMAIN.has(s))
      .sort((a, b) => a - b);
    // 24 腐化植物 / 61 丛林植物 / 71 蘑菇 / 83 药草（WindyGrass 域）
    // 34 吊灯 / 42 吊挂灯笼 / 592 悬挂火盆（MultiTileVine 域）/ 110 闪光（WindyGrass 域）
    expect(affected).toEqual([24, 34, 42, 61, 71, 83, 110, 592]);
  });

  it('tileShine 闪光支与四域唯一交点 = 110 HallowedPlants（Main.cs:7681, shine 9000）', () => {
    const hit = SHINE_TABLE.map((s) => s.sheet).filter((s) => GRASS_GATE_DOMAIN.has(s));
    expect(hit).toEqual([110]);
  });

  it('表值锁：110 闪光 rule.prob 仍 = 24/9000（块级概率;折算在发射器 probEff 乘区）', () => {
    const r110 = TILE_PARTICLE_RULES.get(110)!.find((r) => r.dust !== undefined)!;
    expect(r110.prob).toBeCloseTo(24 / 9000, 12);
    // 帧无关（110 无原版帧门,TileDrawing.cs:7553 仅 21/441/467/468 有）
    expect(r110.fx0).toBeUndefined();
    expect(r110.fy0).toBeUndefined();
    expect(r110.pred).toBeUndefined();
  });

  it('有效概率锁（×1/4 已落地）：满光单扫有效概率 = 24/9000 × 8/8 × 1/4 = 6/9000', () => {
    const r110 = TILE_PARTICLE_RULES.get(110)!.find((r) => r.dust !== undefined)!;
    expect(grassParticleFold(110, true)).toBe(0.25);
    expect(r110.prob * (8 / 8) * grassParticleFold(110, true)).toBeCloseTo(6 / 9000, 15);
  });

  it('592 例外锁：表内已含结构门 1/4（外层 :9665 × 内层 :6917）→ 折算器不再折', () => {
    expect(grassParticleFold(592, true)).toBe(1);
    for (const r of TILE_PARTICLE_RULES.get(592)!) expect(r.prob).toBeCloseTo(0.25, 10);
  });

  it('WindyGrass 设置回落锁：swayInWind=false 域内全率（原文 :7836-7840 → 主路径 :974-977）', () => {
    for (const s of [24, 61, 71, 83, 110]) {
      expect(grassParticleFold(s, true)).toBe(0.25);
      expect(grassParticleFold(s, false)).toBe(1);
    }
    // 非 WindyGrass 域成员（34 MultiTileVine / 184 AnyDirectional / 27 MultiTileGrass）
    // 原文注册无设置门 → 与设置无关,恒折
    for (const s of [34, 184, 27]) {
      expect(grassParticleFold(s, true)).toBe(0.25);
      expect(grassParticleFold(s, false)).toBe(0.25);
    }
  });
});
