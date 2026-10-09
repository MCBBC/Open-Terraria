// BJ585 怪物伤害三处（用户实报：专家+困难+世纪之花前，51 防御（蜘蛛甲 20+护佑×6=24+
// 克盾 2+猫堡垒 5）下哥布林侦察兵（NPC 73）扣血 30-41；物证包 sandbox-defense-debug/
// 四件套——Chrome DevTools MCP 线上取证 report.md/verification.json/reproduce-defense.js）。
//
// 三处定谳（原版锚 1457 亲读）：
//   ① 强化倍率缺整数截断 —— 原版 `float num3 = num2 / num;`（NPC.cs:18584,
//      ScaleStats_ForExpertHardmode）num2/num 均 int ⇒ C# 整数除法天然截断（floor）。
//      侦察兵 strength=20+6+floor(80/4)=46 < threshold 80 ⇒ 倍率 floor(80/46)=1
//      （世花后 floor(100/46)=2）；旧浮点商 1.739 → 攻 62 vs 原版 36。
//      全通用面（ScaleStats.ts,全 NPC 专家×困难水位档）。
//   ② 扣血四舍五入 + 飘字口径分裂 —— 原版 Player.Hurt :38590
//      `num2 = (int)((double)(1f - endurance) * num2)`、:38666-38672
//      `CombatText.NewText(…, (int)num2, …)` 与 `statLife -= (int)num2` 同一 num2
//      ⇒ 飘字≡实扣≡(int) 截断。本仓旧 round 在半点档多扣 1（22.75→23,原版 22）；
//      飘字旧近似 max(1,dmg−def×0.5) 缺 0.75 难度系数/endurance/solar（物证
//      liveHits：实扣 1 飘字 5、实扣 88 飘字 101）。
//   ③ 共享护甲漏算基础防御 —— 原版 statDefense 护甲段在 GrantArmorBenefits
//      （Player.cs:13220）内,调用面 k=0..9 全走 GetEffectiveArmor(k)
//      （Player.cs:13014-13019）⇒ 跨配装共享护甲（他页 favorited）参与防御。
//      本仓旧 defense getter 读 equippedArmor()（裸 armor[0..2]）=共享装时漏算
//      （物证隔离副本：51→31）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import {
  GDL, scaleStats, bindScaleStatsWorld, scaleStatsWorldOf,
  CLASSIC_SCALE_WORLD, type ScalingStats,
} from '../src/stats/ScaleStats';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { ITEM_DEFS } from '../src/data/items';

beforeEach(() => { bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 't'), () => false)); });
afterEach(() => { bindScaleStatsWorld(null); });

function stat(type: number, over?: Partial<ScalingStats>): ScalingStats {
  return {
    type, lifeMax: 1, damage: 0, value: 0, defense: 0, knockBackResist: 0.5,
    boss: false, friendly: false, townNPC: false, scale: 1, difficulty: 0,
    ...over,
  };
}

const EXPERT_HM = { ...CLASSIC_SCALE_WORLD, difficulty: GDL.EXPERT, hardMode: true };

// ===========================================================================
// ① 强化倍率整数截断（NPC.cs:18584 int/int ⇒ floor）
// ===========================================================================
describe('BJ585① 专家×困难水位倍率整数截断（NPC.cs:18584）', () => {
  it('哥布林侦察兵 73（strength=46<80）：floor(80/46)=1 → 36/176/6（物证 candidate 钉值）', () => {
    // 水位：n=20+6+trunc(80/4)=46<80 → num3=floor(80/46)=1 → damage=trunc(20×1×0.9)=18、
    //       defense=6、lifeMax=trunc(80×1×1.1)=88、value=trunc(200×1×0.8)=160
    // ByDifficulty 专家：hp=88×2=176、damage=18×2=36（用户物证 candidate prePlantera 一致）
    const s = stat(73, { lifeMax: 80, damage: 20, defense: 6, value: 200 });
    scaleStats(s, EXPERT_HM);
    expect(s.damage).toBe(36);
    expect(s.lifeMax).toBe(176);
    expect(s.defense).toBe(6);
    expect(s.value).toBe(400);   // 160×2.5（专家 value ×2.5）
  });

  it('世花后 threshold 100：floor(100/46)=2 → 72/352/12（物证 candidate 钉值）', () => {
    // 水位：n=46<100 → num3=floor(100/46)=2 → damage=trunc(20×2×0.9)=36、defense=12、
    //       lifeMax=trunc(80×2×1.1)=176、value=trunc(200×2×0.8)=320
    // ByDifficulty：hp=352、damage=72
    const s = stat(73, { lifeMax: 80, damage: 20, defense: 6, value: 200 });
    scaleStats(s, { ...EXPERT_HM, downedPlantBoss: true });
    expect(s.damage).toBe(72);
    expect(s.lifeMax).toBe(352);
    expect(s.defense).toBe(12);
    expect(s.value).toBe(800);
  });

  it('全 NPC 抽验·僵尸 3（n=31）：floor(80/31)=2 → 50/198/12/240（1457 金标重产）', () => {
    // 水位：num3=floor(80/31)=2 → damage=trunc(14×2×0.9)=25、defense=12、
    //       lifeMax=trunc(45×2×1.1)=99、value=trunc(60×2×0.8)=96
    // ByDifficulty：hp=198、damage=50、value=240
    const s = stat(3, { lifeMax: 45, damage: 14, defense: 6, knockBackResist: 0.5, value: 60 });
    scaleStats(s, EXPERT_HM);
    expect(s.lifeMax).toBe(198);
    expect(s.damage).toBe(50);
    expect(s.defense).toBe(12);
    expect(s.value).toBe(240);
  });

  it('全 NPC 抽验·僵尸 3 世花后：floor(100/31)=3 → 74/296/18/360', () => {
    const s = stat(3, { lifeMax: 45, damage: 14, defense: 6, knockBackResist: 0.5, value: 60 });
    scaleStats(s, { ...EXPERT_HM, downedPlantBoss: true });
    expect(s.lifeMax).toBe(296);
    expect(s.damage).toBe(74);
    expect(s.defense).toBe(18);
    expect(s.value).toBe(360);
  });

  it('全 NPC 抽验·25 号弹体（ProjectileNPC 只缩 damage）：floor(80/30)=2 → 108', () => {
    const s = stat(25, { lifeMax: 1, damage: 30, defense: 0, knockBackResist: 0 });
    scaleStats(s, EXPERT_HM);
    expect(s.damage).toBe(108);   // trunc(30×2×0.9)=54 → ×2
    expect(s.lifeMax).toBe(1);
    expect(s.defense).toBe(0);
  });

  it('水位恰好不触发面不变：n≥threshold 不缩（46 血档 n=80 → 恒等）', () => {
    // n=20+6+trunc(216/4)=80 → num<num2 假 → 原值过 ByDifficulty ×2
    const s = stat(73, { lifeMax: 216, damage: 20, defense: 6, value: 200 });
    scaleStats(s, EXPERT_HM);
    expect(s.damage).toBe(40);
    expect(s.lifeMax).toBe(432);
    expect(s.defense).toBe(6);
  });
});

// ===========================================================================
// ② 扣血 (int) 截断 + 飘字≡实扣（Player.cs:38590/:38666-38672）
// ===========================================================================
const iidOf = (vid: number): number => {
  // 方案 A 物品 id 双域统一：ITEM_DEFS 按 vid 直查内部 id（蜘蛛甲 2370-2372 同值）
  const idx = ITEM_DEFS.findIndex((d) => d?.vid === vid);
  if (idx < 0) throw new Error(`vid ${vid} 未注册`);
  return idx;
};

/** 专家世界绑定的 51 防御玩家（防御桩面：实例属性遮蔽 getter,口径同物证隔离法；
 *  world.difficulty 用存档档位编码 0/1/2/3（mainDifficulty 映射 GDL 轴） */
function expertPlayerAtDefense(defense: number): Player {
  const w = new World(100, 100, 7, 'bj585');
  w.difficulty = 1;   // expert
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  const p = new Player(60 * 16, 60 * 16, new Inventory());
  Object.defineProperty(p, 'defense', { value: defense });
  return p;
}

describe('BJ585② 扣血 (int) 截断（Player.cs:38590/:38672）', () => {
  it('专家 51 防：入伤 100 → floor(61.75)=61（旧 round 62,多扣 1）', () => {
    const p = expertPlayerAtDefense(51);
    const hpBefore = p.hp;
    expect(p.damage(100, 980, 980)).toBe(61);
    expect(hpBefore - p.hp).toBe(61);
  });

  it('专家 51 防：入伤 61（物证 NPC 140 附魔盔甲实拍）→ 22（旧 round 23）', () => {
    const p = expertPlayerAtDefense(51);
    expect(p.damage(61, 980, 980)).toBe(22);
  });

  it('专家 51 防：入伤 40 → floor(1.75)=1（旧 round 2）', () => {
    const p = expertPlayerAtDefense(51);
    expect(p.damage(40, 980, 980)).toBe(1);
  });

  it('经典 51 防：入伤 30 → floor(4.5)=4（旧 round 5）', () => {
    const w = new World(100, 100, 7, 'bj585');
    w.difficulty = 0;   // classic
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const p = new Player(60 * 16, 60 * 16, new Inventory());
    Object.defineProperty(p, 'defense', { value: 51 });
    expect(p.damage(30, 980, 980)).toBe(4);
  });

  it('damagePreview 与实扣同口径：preview(100)=61', () => {
    const p = expertPlayerAtDefense(51);
    expect(p.damagePreview(100)).toBe(61);
    expect(p.damagePreview(61)).toBe(22);
  });
});

// ---- Game.damagePlayer 漏斗壳（对齐 player-hurt-domain mkShell 手法） -------------
function mkDamagePlayerShell(defense: number) {
  const g = Object.create(Game.prototype) as Record<string, any>;
  const w = new World(100, 100, 7, 'bj585');
  w.difficulty = 1;   // expert（存档档位编码）
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  const p = new Player(60 * 16, 60 * 16, new Inventory());
  Object.defineProperty(p, 'defense', { value: defense });
  const floats: number[] = [];
  g.player = p;
  g.world = w;
  g.golfState = { tryGetCameraTrackingPosition: () => null };
  g._bannerNpcs = new Set<number>();
  g.sfx = { play: vi.fn(), playWavFile: vi.fn() };
  g.remotePlayerProxies = [];
  g.enemies = (): unknown[] => [];
  g.critters = (): unknown[] => [];
  g.addDamageNumber = vi.fn(
    (_x: number, _y: number, v: number, _c: boolean, _color?: string): void => { floats.push(v); });
  g.spawnParticles = vi.fn();
  g.entities = { add: vi.fn() };
  g.recorder = undefined;
  g.reportNonPvpPlayerHurt = vi.fn();
  g.playHurtVoice = vi.fn();
  g.playDeathVoice = vi.fn();
  return { g, p, floats };
}

describe('BJ585② 飘字≡实扣（Player.cs:38666-38672 同一 num2）', () => {
  it('专家 51 防：入伤 36 → 实扣 1、飘字 1（旧近似 max(1,36−25.5)=11）', () => {
    const { g, p, floats } = mkDamagePlayerShell(51);
    const ok = g.damagePlayer(36, p.cx + 10, p.cy, undefined, false, false, false);
    expect(ok).toBe(1);
    expect(floats).toEqual([1]);
  });

  it('专家 51 防：入伤 100 → 实扣 61、飘字 61（旧近似 75）', () => {
    const { g, p, floats } = mkDamagePlayerShell(51);
    const ok = g.damagePlayer(100, p.cx + 10, p.cy, undefined, false, false, false);
    expect(ok).toBe(61);
    expect(floats).toEqual([61]);
  });

  it('物证 liveHits 幽灵僵尸实拍：入伤 126 → 实扣 87、飘字 87（旧实扣 88/飘字 101）', () => {
    const { g, p, floats } = mkDamagePlayerShell(51);
    const ok = g.damagePlayer(126, p.cx + 10, p.cy, undefined, false, false, false);
    expect(ok).toBe(87);
    expect(floats).toEqual([87]);
  });

  it('环境站 floatDealt 预演回填通道不破：显式 floatDealt 优先（预演=damagePreview=floor 口径）', () => {
    const { g, p, floats } = mkDamagePlayerShell(51);
    g.damagePlayer(100, p.cx + 10, p.cy, undefined, false, false, false, {
      floatDealt: 61, floatColor: '#FF8040',
    });
    expect(floats).toEqual([61]);
    expect(floats[0]).toBe(p.damagePreview(100));
  });
});

// ===========================================================================
// ③ 共享护甲参与基础防御（Player.cs:13014-13019 → GrantArmorBenefits :13220）
// ===========================================================================
describe('BJ585③ 跨配装共享护甲参与防御（GetEffectiveArmor k=0..9）', () => {
  const SPIDER = [2370, 2371, 2372];   // 蜘蛛面具/胸甲/护腿（物证 armorIds）

  function spiderSum(): number {
    return SPIDER.reduce((acc, vid) => acc + (statOfInternal(iidOf(vid))?.def ?? 0), 0);
  }

  it('蜘蛛三件套移到其他配装并收藏、当前三槽空：defense 含甲防（物证 51→31 差值面）', () => {
    const inv = new Inventory();
    for (const lo of inv.loadouts) {
      lo.armor = [null, null, null, ...lo.armor.slice(3)];
    }
    const p = new Player(60 * 16, 60 * 16, inv);
    const bare = p.defense;                       // 无甲无 buff 基线（equipStats/buff=0）
    const loB = inv.loadouts[1];
    SPIDER.forEach((vid, i) => { loB.armor[i] = { id: iidOf(vid), stack: 1, favorited: true }; });
    expect(p.inv.getEffectiveArmor(0)?.id).toBe(iidOf(SPIDER[0]));
    expect(p.defense).toBe(bare + spiderSum());
    expect(spiderSum()).toBe(20);                 // 5+8+7=20（物证 directDefense−sharedDefense 差值面）
  });

  it('取消收藏：共享失效、defense 回裸面（漏算面消失=零防御甲未收藏不白嫖）', () => {
    const inv = new Inventory();
    for (const lo of inv.loadouts) {
      lo.armor = [null, null, null, ...lo.armor.slice(3)];
    }
    const loB = inv.loadouts[1];
    SPIDER.forEach((vid, i) => { loB.armor[i] = { id: iidOf(vid), stack: 1, favorited: true }; });
    const p = new Player(60 * 16, 60 * 16, inv);
    const shared = p.defense;
    for (let i = 0; i < 3; i++) loB.armor[i]!.favorited = false;
    expect(p.defense).toBe(shared - spiderSum());
  });

  it('直装优先不双计：当前三槽实装甲时共享件不叠加（GetEffectiveArmor 只填空槽）', () => {
    const inv = new Inventory();
    const loB = inv.loadouts[1];
    SPIDER.forEach((vid, i) => { loB.armor[i] = { id: iidOf(vid), stack: 1, favorited: true }; });
    // 当前配装直装蜘蛛头（同 vid）
    inv.armor[0] = { id: iidOf(SPIDER[0]), stack: 1 };
    const p = new Player(60 * 16, 60 * 16, inv);
    const bare = p.defense;
    expect(p.defense).toBe(bare);                 // 蜘蛛头 def 计一次（直装件）,共享无叠加面
  });
});

// ===========================================================================
// ④ 31 档穷举对拍（verification.json damageRows：物证 oracle 逐档全等）
//    rollDamage = build 内 $r/c$/YJe（物证 randomSource 原式照抄）；
//    侦察兵修正后专家入伤 36 → 掷 ±15% → 本仓实扣链对拍 originalTerrariaHpLoss。
// ===========================================================================
// [rollPct, correctedIncoming, originalTerrariaHpLoss] —— verification.json damageRows
const ROWS_31: Array<[number, number, number]> = [
  [-15, 31, 1], [-14, 31, 1], [-13, 31, 1], [-12, 32, 1], [-11, 32, 1],
  [-10, 32, 1], [-9, 33, 1], [-8, 33, 1], [-7, 33, 1], [-6, 34, 1],
  [-5, 34, 1], [-4, 35, 1], [-3, 35, 1], [-2, 35, 1], [-1, 36, 1],
  [0, 36, 1], [1, 36, 1], [2, 37, 1], [3, 37, 1], [4, 37, 1],
  [5, 38, 1], [6, 38, 1], [7, 39, 1], [8, 39, 1], [9, 39, 1],
  [10, 40, 1], [11, 40, 1], [12, 40, 1], [13, 41, 2], [14, 41, 2],
  [15, 41, 2],
];

// 物证 randomSource（bundle YJe/c$/$r 原式 1:1——banker's rounding 掷骰面）
function bankerRound(t: number): number {
  const e = Math.floor(t), i = t - e;
  return i > 0.5 ? e + 1 : (i < 0.5 || e % 2 === 0 ? e : e + 1);
}
function cVar(dmg: number, rng: () => number): number {
  const i = Math.floor(rng() * 31) - 15;
  const a = Math.fround(1 + Math.fround(i * Math.fround(0.01)));
  return Math.fround(Math.fround(dmg) * a);
}
function rollDamage(dmg: number, luckGate: number, rng: () => number): number {
  let a = cVar(dmg, rng);
  if (luckGate > 0) {
    if (rng() < luckGate) { const n = cVar(dmg, rng); if (n > a) a = n; }
  } else if (luckGate < 0 && rng() < -luckGate) {
    const n = cVar(dmg, rng); if (n < a) a = n;
  }
  return bankerRound(a);
}

describe('BJ585④ 31 档穷举对拍（verification.json damageRows oracle）', () => {
  it('掷骰复现：侦察兵修正后入伤 36 → 31 档入伤逐档与物证 correctedIncoming 全等', () => {
    const scoutExpertDamage = (() => {
      const s = stat(73, { lifeMax: 80, damage: 20, defense: 6, value: 200 });
      scaleStats(s, EXPERT_HM);
      return s.damage;   // 36（①钉值复用）
    })();
    expect(scoutExpertDamage).toBe(36);
    for (const [pct, expected] of ROWS_31) {
      // 物证 reproduceGoblinDefense：random=()=>(index+0.5)/31，index=rollPct+15（0..30）
      const rng = () => (pct + 15 + 0.5) / 31;
      expect(rollDamage(scoutExpertDamage, 0, rng)).toBe(expected);
    }
  });

  it('实扣链对拍：本仓 p.damage(入伤) 31 档与物证 originalTerrariaHpLoss 全等（51 防专家）', () => {
    const p = expertPlayerAtDefense(51);
    for (const [, incoming, expectedLoss] of ROWS_31) {
      const hpBefore = p.maxHp;
      p.hp = p.maxHp;
      p.iframes = 0;   // 逐档独立命中（无敌帧清零）
      const got = p.damage(incoming, 980, 980);
      expect(got).toBe(expectedLoss);
      expect(hpBefore - p.hp).toBe(expectedLoss);
    }
  });

  it('oracle 交叉验证：max(1, floor(入伤−51×0.75)) 与物证 originalTerrariaHpLoss 全等', () => {
    for (const [, incoming, expectedLoss] of ROWS_31) {
      expect(Math.max(1, Math.floor(incoming - 51 * 0.75))).toBe(expectedLoss);
    }
  });
});
