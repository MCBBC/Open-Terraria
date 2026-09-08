// 草族四绘制路径 ×1/4 替换折算语义锁（2026-09-09 落刀批;定谳锚 =
// TileParticles.ts 头注 ★F7 + Game.ts GRASS_COUNTER_SHEETS/grassParticleFold）。
// 原文（Terarria1457 TileDrawing.cs）：四支特殊绘制路径（DrawGrass :8488 /
// DrawAnyDirectionalGrass :8546 / DrawMultiTileGrassInWind :9088 /
// DrawMultiTileVinesInWind :9415）的 `_rand.Next(4)==0` 门包整个 DrawTiles_EmitParticles,
// 且四域 tile 注册后 continue 跳过 DrawSingleTile(:729) → 主路径 :974-977 整帧不评估
// ⇒ 【替换】×1/4 非额外。本仓口径：emitTileParticles 每 3 tick 一扫,probEff =
// rule.prob ×(dust ? num43/8 :1) × grassParticleFold(sheet, swayInWind)。
import { describe, it, expect } from 'vitest';
import { TILE_PARTICLE_RULES, ruleMatches, DUST_COLOR } from '../src/render/TileParticles';
import { GRASS_COUNTER_SHEETS, grassParticleFold, Game } from '../src/core/Game';
import { options } from '../src/core/Options';
import { World } from '../src/world/World';
import { TILE_DEFS } from '../src/data/tiles';

/** 每 tick 期望发射率 = probEff / 3（扫描节拍 3 tick;原版每帧一次机会） */
const perTick = (rule: { prob: number }, sheet: number, sway = true): number =>
  rule.prob * grassParticleFold(sheet, sway) / 3;

describe('grassParticleFold：×1/4 替换折算（替换非额外）', () => {
  it('×1/4 生效：交集未预折 sheet（24/34/42/61/71/83/110）折算因子 = 0.25', () => {
    for (const s of [24, 34, 42, 61, 71, 83, 110]) {
      expect(GRASS_COUNTER_SHEETS.has(s)).toBe(true);
      expect(grassParticleFold(s, true)).toBe(0.25);
    }
  });

  it('折算后每 tick 率 = 原版草路径帧率（块概率 × 1/4）', () => {
    // 24 腐化植物：块 :7447 Next(500) → 草路径 1/4×1/500/帧
    expect(perTick(TILE_PARTICLE_RULES.get(24)![0], 24)).toBeCloseTo(1 / 2000, 15);
    // 61 丛林植物：块 :7533 Next(60)（fx==144 门）→ 1/240/帧
    expect(perTick(TILE_PARTICLE_RULES.get(61)![0], 61)).toBeCloseTo(1 / 240, 15);
    // 71 蘑菇：块 :7486 Next(500)（color==0 门）→ 1/2000/帧
    expect(perTick(TILE_PARTICLE_RULES.get(71)![0], 71)).toBeCloseTo(1 / 2000, 15);
    // 34 吊灯：块 :7384 Next(40) → 1/160/帧
    expect(perTick(TILE_PARTICLE_RULES.get(34)![0], 34)).toBeCloseTo(1 / 160, 15);
    // 83 药草 style0 昼耀：EmitAlchemyHerbParticles :9792 Next(100) → 1/400/帧
    const herb0 = TILE_PARTICLE_RULES.get(83)!.find((r) => r.pred?.(0, 0))!;
    expect(perTick(herb0, 83)).toBeCloseTo(1 / 400, 15);
  });

  it('非交集 sheet 不折算（因子恒 1）：熔炉 17/水蜡烛 49/蘑菇 72/路灯 93/篝火 215/泡泡机 244/音乐盒 139', () => {
    // ★72 与 71 同块（:7486 (71||72) Next(500)）但 72 ∉ SwaysInWindBasic（TileID.cs:273）
    //   → 主路径全率,不折——71 折 72 不折即本判别力
    for (const s of [17, 49, 72, 93, 215, 244, 139]) {
      expect(GRASS_COUNTER_SHEETS.has(s)).toBe(false);
      expect(grassParticleFold(s, true)).toBe(1);
      expect(grassParticleFold(s, false)).toBe(1);
    }
  });

  it('110 闪光支也折算（lightNum43 组合）：有效概率 = 24/9000 × num43/8 × 1/4', () => {
    const r110 = TILE_PARTICLE_RULES.get(110)!.find((r) => r.dust !== undefined)!;
    const eff = (num43: number, sway = true) =>
      r110.prob * (num43 / 8) * grassParticleFold(110, sway);
    // 满光 num43=8：原版草路径满光 = 1/4 × 8/9000 = 2/9000/帧;本仓每 tick = 6/9000/3 = 2/9000
    expect(eff(8)).toBeCloseTo(6 / 9000, 15);
    expect(perTick(r110, 110)).toBeCloseTo(2 / 9000, 15);
    // 半光 num43=4：1/4 × 4/9000 = 1/9000/帧
    expect(eff(4)).toBeCloseTo(3 / 9000, 15);
    expect(perTick(r110, 110) * (4 / 8)).toBeCloseTo(1 / 9000, 15);
    // 全暗 num43=0：概率归零（:7539 三通道门由 0 吸收）
    expect(eff(0)).toBe(0);
    // 设置关 → 回落主路径全率（满光 8/9000/帧）
    expect(eff(8, false)).toBeCloseTo(24 / 9000, 15);
  });

  it('592 悬挂火盆豁免再折（表内已含外层 Next(4) :9665 × 内层 Next(3) :6917 = 1/12/帧）', () => {
    expect(grassParticleFold(592, true)).toBe(1);
    expect(grassParticleFold(592, false)).toBe(1);
    for (const r of TILE_PARTICLE_RULES.get(592)!) {
      expect(r.prob).toBeCloseTo(0.25, 10);            // 1/4 × 1/3 × 3(扫描)
      expect(r.prob / 3).toBeCloseTo(1 / 12, 10);      // 每 tick = 原版 1/12/帧 ✓
    }
  });

  it('WindyGrass 子域随设置回落（原文 ShouldSwayInWind :7836-7840）;非设置门域恒折', () => {
    // 设置关 → WindyGrass 域整域回落主路径 :974-977 全率
    for (const s of [24, 61, 71, 83, 110, 3, 84, 113, 637]) {
      expect(grassParticleFold(s, false)).toBe(1);
    }
    // 34/42（MultiTileVine）/184（AnyDirectional）/27/705（MultiTileGrass）：
    // 原文注册 case 无设置门 → 开关两态恒折
    for (const s of [34, 42, 184, 27, 705]) {
      expect(grassParticleFold(s, true)).toBe(0.25);
      expect(grassParticleFold(s, false)).toBe(0.25);
    }
  });
});

// =====================================================================
// 续单三件定谳（2026-09-09）：NatureFly 草域折算 / 篝火 215 掷链归属 / 灯笼 42 行键
// =====================================================================
describe('续单三件定谳（2026-09-09）', () => {
  it('件1 NatureFly 草域折算（行为级）：草(3)设置开→0 蝇（×1/4 生效）;设置关→1 蝇（回落全率）;仙人掌(80,域外)→1 蝇（不折）', () => {
    // 壳依赖=world.store / world.weather?.windSpeedCurrent / spawnParticles?（natureFlyFx 可选链）
    const run = (tileId: number, sway: boolean): number => {
      const w = new World(40, 40, 7, 'nf-fold');
      w.store.setTileSilent(20, 20, tileId);
      w.store.liquid[w.store.idx(20, 20)] = 0;          // 防生成残液吞 !liquidHere 门
      const calls: unknown[] = [];
      const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
      g.world = { store: w.store, weather: { windSpeedCurrent: 0 } };   // 无风 → p=0.3
      g.spawnParticles = (...a: unknown[]) => { calls.push(a); };
      const rand = Math.random;
      let seqIdx = 0;
      Math.random = () => [0.5, 0.0005][seqIdx++ % 2]!; // 掷1=0.5 / 掷2=0.0005(<1/600)
      const prev = options.data.swayInWind;
      options.data.swayInWind = sway;
      try {
        (g as unknown as { emitTileOrchestraAmbient(x0: number, y0: number, x1: number, y1: number): void })
          .emitTileOrchestraAmbient(20, 20, 20, 20);    // 1×1 窗=只扫本格
      } finally {
        Math.random = rand;
        options.data.swayInWind = prev;
      }
      return calls.length;
    };
    // 探针瓦片按 vanilla sheet 运行期查表（键名无关）：3 高草 ∈ NATURE_FLIES ∩ WindyGrass;
    // 80 仙人掌 ∈ NATURE_FLIES 域外（★'grass' 键是 sheet 2 草块,不在 NatureFly 集,勿用）
    const tallgrass = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 3);
    const cactus = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 80);
    expect(tallgrass).toBeGreaterThanOrEqual(0);
    expect(cactus).toBeGreaterThanOrEqual(0);
    // 折算后 gate1 阈 = min(1, 0.3×0.25×3)=0.225 → 掷1=0.5 不过 → 0 蝇（旧无折码 0.5<0.9 过 → 1 蝇）
    expect(run(tallgrass, true)).toBe(0);
    // 设置关 → WindyGrass 回落主路径全率（阈 0.9）→ 1 蝇
    expect(run(tallgrass, false)).toBe(1);
    // 域外 80 不折 → 恒 1 蝇
    expect(run(cactus, true)).toBe(1);
  });

  it('件2 篝火 215 无外层门：每 tick 1/3 = 原文 :6901 Next(3) 主路径全率;592 每 tick 1/12 = :9665 Next(4)×:6917 Next(3)', () => {
    for (const r of TILE_PARTICLE_RULES.get(215)!) {
      expect(r.prob).toBe(1);
      expect(r.prob / 3).toBeCloseTo(1 / 3, 12);
    }
    for (const r of TILE_PARTICLE_RULES.get(592)!) {
      expect(r.prob / 3).toBeCloseTo(1 / 12, 12);
    }
  });

  it('件3 灯笼 42 行键：原文 case=fy/36 ∧ fy/18 奇行——四落点 {270,1062,1818,1854} 各恰一色;旧错位 {126,522,900,918} 与上邻偶行全不命中', () => {
    const rules = TILE_PARTICLE_RULES.get(42)!;
    expect(rules).toHaveLength(4);
    const at = (fx: number, fy: number) => rules.filter((r) => ruleMatches(r, fx, fy));
    // 原文落点（:7171 奇行门 + switch num14）：7→58 / 29→59 / 50→57 / 51→242
    expect(at(0, 270)).toHaveLength(1);
    expect(at(0, 270)![0].color).toBe(DUST_COLOR[58]);
    expect(at(0, 1062)).toHaveLength(1);
    expect(at(0, 1062)![0].color).toBe(DUST_COLOR[59]);
    expect(at(0, 1818)).toHaveLength(1);
    expect(at(0, 1818)![0].color).toBe(DUST_COLOR[57]);
    expect(at(0, 1854)).toHaveLength(1);
    expect(at(0, 1854)![0].color).toBe(DUST_COLOR[242]);
    // 旧 pred（fy/18==case）错位四落点——在原文全不发射（900/918 连奇行门都不过;
    // 126/522 过门但落 switch 无 case 的 style 3/14）
    for (const fy of [126, 522, 900, 918]) expect(at(0, fy)).toHaveLength(0);
    // 奇行门：各样式上邻偶行（fy=style*36,fy/18 偶）不命中
    for (const fy of [252, 1044, 1800, 1836]) expect(at(0, fy)).toHaveLength(0);
    // 列门：fx≠0 不命中
    expect(at(18, 270)).toHaveLength(0);
    // 掷链分档：58→1/50、59→1/40、57→1/10、242→1/40（×3 扫描）
    expect(rules.find((r) => r.color === DUST_COLOR[58])!.prob).toBeCloseTo(3 / 50, 12);
    expect(rules.find((r) => r.color === DUST_COLOR[57])!.prob).toBeCloseTo(3 / 10, 12);
  });
});
