import { describe, it, expect } from 'vitest';
import {
  TILE_PARTICLE_RULES, ruleMatches, DUST_COLOR, SHINE_TABLE,
  type TileParticleRule,
} from '../src/render/TileParticles';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

// 方块环境粒子规则表健全性（原版 DrawTiles_EmitParticles Tier 1/2）
describe('方块环境粒子规则表（TileParticles）', () => {
  it('覆盖的 sheet 全部已注册为 tile def', () => {
    const registeredSheets = new Set<number>();
    for (const d of TILE_DEFS) if (d.vanilla?.sheet !== undefined) registeredSheets.add(d.vanilla.sheet);
    const missing: number[] = [];
    for (const sheet of TILE_PARTICLE_RULES.keys()) {
      if (!registeredSheets.has(sheet)) missing.push(sheet);
    }
    expect(missing).toEqual([]);
  });

  it('概率域合法（0, 1]：每 3 tick 一次发射概率不得超过 1', () => {
    const bad: string[] = [];
    TILE_PARTICLE_RULES.forEach((rules, sheet) => {
      for (const r of rules) {
        if (r.prob <= 0 || r.prob > 1) bad.push(`sheet ${sheet} prob=${r.prob}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('高频项对齐原版概率量级：水蜡烛/和平蜡烛 高发射率（1/2 钳 0.95）、熔炉点燃帧 ~0.075（1/40×3）', () => {
    const candle = TILE_PARTICLE_RULES.get(49)?.[0];
    expect(candle?.prob).toBe(0.95);
    const peace = TILE_PARTICLE_RULES.get(372)?.[0];
    expect(peace?.prob).toBe(0.95);
    const furnace = TILE_PARTICLE_RULES.get(17)?.[0];
    expect(furnace?.prob).toBeCloseTo(0.075, 5);
    expect(furnace?.fx0).toBe(18);
    expect(furnace?.fy0).toBe(18);
  });

  it('帧门判定：ruleMatches 边界', () => {
    const furnace: TileParticleRule = { sheet: 17, color: '#FFF', prob: 0.1, fx0: 18, fy0: 18, rise: 1 };
    expect(ruleMatches(furnace, 18, 18)).toBe(true);
    expect(ruleMatches(furnace, 0, 0)).toBe(false);
    expect(ruleMatches(furnace, 18, 0)).toBe(false);
    // 暗影球：fx>=36 阴影 / fx<36 紫尘
    const shadow = TILE_PARTICLE_RULES.get(31)!.find((r) => r.sideways !== undefined)!;
    expect(ruleMatches(shadow, 36, 0)).toBe(true);
    expect(ruleMatches(shadow, 0, 0)).toBe(false);
  });

  it('篝火 215 / 悬挂火盆 592：按列拆三条，出生盒落在火堆 [2,38)px（★2026-08-31 偏移定谳）', () => {
    for (const sheet of [215, 592] as const) {
      const rules = TILE_PARTICLE_RULES.get(sheet)!;
      expect(rules).toHaveLength(3);
      // ★2026-09-09 掷链归属分账（续单件2 勘误,旧注"同构块:外层 Next(4)×Next(3)"
      // 对 215 不成立）：215 主路径全率 1/3/帧（:6901 仅 Next(3),无外层门;
      // Lighting.cs:77-85 缺省每帧发）→ ×3 = 1;592 结构门 :9665 Next(4) × :6917
      // Next(3) = 1/12/帧 → ×3 = 0.25
      const wantProb = sheet === 215 ? 1 : 0.25;
      for (const r of rules) {
        expect(r.prob).toBeCloseTo(wantProb, 5);
        expect(r.dxBox).toBeDefined();
        expect(r.dyBox).toBeDefined();
      }
      // 列帧门 + 出生盒。★精确语义（Dust.NewDust :167-170：X 项 rand.Next(W−4)+4，
      // W=4 ⇒ 恒 +6 零散布）+ 列修正 ±rand(8)。dxBox = 命中格自身相对：
      //   col0 [6,14) / col1 [6,7)(点) / col2 [-1,7) → 绝对羽流 = X0+[6,14)∪{22}∪[31,38)
      const byCol = new Map(rules.map((r) => [r.fx0!, r] as const));
      expect(byCol.get(0)!.dxBox).toEqual([6, 14]);   // 6+rand(8)
      expect(byCol.get(18)!.dxBox).toEqual([6, 7]);   // 恰 +6（绝对 = X0+22）
      expect(byCol.get(36)!.dxBox).toEqual([-1, 7]);  // 6−rand(8)（绝对 = X0+31..38）
      // 三列等权均值 ≈ X0+22（离散中点）：仅比火焰中心(24)偏左 ~2px = 原版固有
      const mid = (box: readonly [number, number]) => (box[0] + box[1] - 1) / 2;
      const mean = (mid(byCol.get(0)!.dxBox!) + 16 + byCol.get(18)!.dxBox![0]
        + 32 + mid(byCol.get(36)!.dxBox!)) / 3;
      expect(mean).toBeGreaterThan(20);
      expect(mean).toBeLessThan(24);
      // 原版初速 vx=±0.4 + ×0.98 阻尼 ⇒ 上升期横向涂抹（防"细直柱"读感）
      for (const r of rules) expect(r.sideways).toBe(0.3);
      // 帧门：仅点火行（215 fy0=0 / 592 fy0=18）各自列命中
      const fy = sheet === 215 ? 0 : 18;
      expect(ruleMatches(byCol.get(0)!, 0, fy)).toBe(true);
      expect(ruleMatches(byCol.get(0)!, 18, fy)).toBe(false);
      expect(ruleMatches(byCol.get(36)!, 36, fy)).toBe(true);
      expect(ruleMatches(byCol.get(36)!, 36, fy === 0 ? 18 : 0)).toBe(false);
    }
    expect(TILE_PARTICLE_RULES.get(215)![0].dyBox).toEqual([0, 4]);   // NewDust Y 项：j*16−4+[4,8)
    expect(TILE_PARTICLE_RULES.get(592)![0].dyBox).toEqual([8, 12]);  // j*16+4+[4,8)
  });

  it('dust 色表覆盖规则引用的所有基础色键', () => {
    expect(DUST_COLOR[6]).toBeDefined();
    expect(DUST_COLOR[14]).toBeDefined();
    expect(DUST_COLOR[5]).toBeDefined();
    expect(DUST_COLOR[41]).toBeDefined();
    expect(DUST_COLOR[242]).toBeDefined();
    expect(DUST_COLOR[172]).toBeDefined();
    expect(DUST_COLOR[43]).toBeDefined();
  });

  it('药草 83 六 style（昼耀/月华/死亡草/叶绿/火焰花/颤骨）各有规则', () => {
    const herbs = TILE_PARTICLE_RULES.get(83)!;
    expect(herbs.length).toBe(6); // Blinkroot 原版无粒子
    // 成熟帧门：fx 为 style*18 时命中
    const fireblossom = herbs.find((r) => r.pred?.(90, 0))!;
    expect(fireblossom).toBeDefined();
    expect(fireblossom.color).toBe(DUST_COLOR[6]);
  });
});

// =====================================================================
// tileShine 矿物闪光系统 1:1（Main.cs 赋值区 7273-10431 × TileDrawing.cs:7537-7654，
// 2026-09-07 逐值复核批）。金标 = 原版 tileShine 全量 55 型（54 标量 + 178 七列拆分），
// 经 tools 脚本逐行提取对账零漂移后冻结于此；表值回退/手改在此爆红。
// =====================================================================
const VANILLA_SHINE: ReadonlyArray<readonly [number, number]> = [
  [221, 925], [222, 875], [223, 825], [129, 300],
  [22, 1150], [6, 1150], [7, 1100], [8, 1000], [9, 1050],
  [166, 1125], [167, 1075], [168, 1025], [169, 975],
  [617, 400], [178, 500], [12, 300],
  [21, 1200], [467, 1200], [441, 1200], [468, 1200],
  [63, 900], [64, 900], [65, 900], [66, 900], [67, 900], [68, 900], [566, 900],
  [45, 1900], [680, 1900], [46, 2000], [681, 2000], [47, 2100], [682, 2100],
  [122, 1800], [686, 1800], [121, 1850], [685, 1850],
  [125, 600], [109, 9000], [110, 9000], [116, 9000], [117, 9000], [118, 8000],
  [107, 950], [108, 900], [111, 850], [211, 500], [639, 300], [239, 1100],
  [346, 2000], [347, 1900], [348, 1800], [370, 1900], [407, 1000], [204, 1150],
];
// TileDrawing.cs:7557-7651 的 newColor 表（未列型 = Color.White）
const VANILLA_SHINE_COLOR: ReadonlyArray<readonly [number, string]> = [
  [63, '#0000FF'], [64, '#FF0000'], [65, '#00FF00'], [66, '#FFFF00'],
  [67, '#FF00FF'], [68, '#FFFFFF'], [566, '#FFFF00'],
  [12, '#FF0000'], [211, '#32FF64'], [204, '#FF0000'], [639, '#0000FF'],
];

describe('tileShine 矿物闪光 1:1（Main.cs × TileDrawing.cs:7537-7654）', () => {
  // 闪光规则签名 = 带 dust 通道的规则（全规则表仅闪光族携带;★F7 2026-09-08：
  // 旧签名 lightGate 系死字段——发射器从不消费,已随注释销账删除）
  const shineRulesOf = (sheet: number): TileParticleRule[] =>
    (TILE_PARTICLE_RULES.get(sheet) ?? []).filter((r) => r.dust !== undefined);

  it('表抽取：55 型全覆盖、shine 值零漂移（178 拆七列 prob=24/500）', () => {
    const scalar = new Map(SHINE_TABLE.map((s) => [s.sheet, s.shine] as const));
    const seen = new Set<number>();
    for (const [sheet, shine] of VANILLA_SHINE) {
      const rules = shineRulesOf(sheet);
      if (sheet === 178) {
        expect(rules).toHaveLength(7);
        for (const r of rules) expect(r.prob).toBeCloseTo(24 / 500, 12);
      } else {
        expect(rules).toHaveLength(1);
        expect(rules[0].prob).toBeCloseTo(24 / shine, 12);
        expect(scalar.get(sheet)).toBe(shine);
      }
      seen.add(sheet);
    }
    expect(seen.size).toBe(VANILLA_SHINE.length);
    expect(SHINE_TABLE).toHaveLength(VANILLA_SHINE.length - 1); // 178 不入标量表
  });

  it('闪光色 1:1（:7557-7651 newColor 表；未列型 = Color.White）', () => {
    for (const [sheet, color] of VANILLA_SHINE_COLOR) {
      expect(shineRulesOf(sheet)[0].color).toBe(color);
    }
    for (const sheet of [22, 6, 239, 129, 21, 125, 617]) {
      expect(shineRulesOf(sheet)[0].color).toBe('#FFFFFF');
    }
    // 178 七列色 [品红,黄,蓝,绿,红,白,黄]（fx/18 = 0..6）
    const cols = shineRulesOf(178);
    const EXPECT = ['#FF00FF', '#FFFF00', '#0000FF', '#00FF00', '#FF0000', '#FFFFFF', '#FFFF00'];
    for (let col = 0; col < 7; col++) {
      const hit = cols.find((r) => r.pred?.(col * 18, 0));
      expect(hit).toBeDefined();
      expect(hit!.color).toBe(EXPECT[col]);
    }
  });

  it('尘通道 1:1：NewDust(...,43,0,0,254,·,0.5f)+velocity×0（:7652-7653）', () => {
    for (const [sheet] of VANILLA_SHINE) {
      for (const r of shineRulesOf(sheet)) {
        expect(r.dust).toBe(43);
        expect(r.dustAlpha).toBe(254);
        expect(r.dustScale).toBe(0.5);
      }
    }
  });

  it('色点回退路：出生盒 = NewDust 内盒 [4,16)²（rand.Next(12)+4）、静止、life 22', () => {
    for (const [sheet] of VANILLA_SHINE) {
      for (const r of shineRulesOf(sheet)) {
        expect(r.dxBox).toEqual([4, 16]);
        expect(r.dyBox).toEqual([4, 16]);
        expect(r.rise).toBe(0);
        expect(r.grav).toBe(0);
        expect(r.life).toBe(22);
      }
    }
  });

  it('箱族帧门 1:1（:7553）：21/441 亮格段 [36,180)∪[396,409]；467/468 仅 [144,180)', () => {
    for (const sheet of [21, 441] as const) {
      const r = shineRulesOf(sheet)[0];
      expect(ruleMatches(r, 36, 0)).toBe(true);
      expect(ruleMatches(r, 178, 0)).toBe(true);
      expect(ruleMatches(r, 180, 0)).toBe(false);
      expect(ruleMatches(r, 35, 0)).toBe(false);
      expect(ruleMatches(r, 396, 0)).toBe(true);
      expect(ruleMatches(r, 409, 0)).toBe(true);
      expect(ruleMatches(r, 410, 0)).toBe(false);
    }
    for (const sheet of [467, 468] as const) {
      const r = shineRulesOf(sheet)[0];
      expect(ruleMatches(r, 144, 0)).toBe(true);
      expect(ruleMatches(r, 179, 0)).toBe(true);
      expect(ruleMatches(r, 143, 0)).toBe(false);
      expect(ruleMatches(r, 180, 0)).toBe(false);
    }
  });

  it('生命水晶 12 全链（用户实报"暗处完全看不见"主修复面）', () => {
    const heart = shineRulesOf(12)[0];
    expect(heart.prob).toBeCloseTo(24 / 300, 12);  // ≡ 原版满光 8/300/帧 ×3 tick 扫描
    expect(heart.color).toBe('#FF0000');           // :7636 newColor(255,0,0)
    expect(heart.pred).toBeUndefined();            // 2×2 每格独立可闪
    // :7539-7543 三通道 max>20 门由发射器 num43=max/30 概率归零吸收（max≤30 ⊇
    // max≤20,同语义单点计算;★F7 曾挂的 rule.lightGate 死字段已删）
    expect(heart.dust).toBe(43);                   // TintableDustLighted
    expect(heart.dustAlpha).toBe(254);
    // 概率域：折算后不得超 1（表内最小 shine=300 → 恒真，结构性保险）
    for (const [sheet] of VANILLA_SHINE) {
      for (const r of shineRulesOf(sheet)) expect(r.prob).toBeLessThanOrEqual(1);
    }
  });
});
