// 药水/Buff 部分实装缺口批回归（2026-08-22，docs/audit/item-audit-2026-08-22.md
// 药水/食物章节 E 区 + BUFF_DEFS 矩阵 ⚠️ 项）：
//   1. Clairvoyance(29) 补三项：魔伤+5%/魔暴+2/耗魔-2%（Player.cs:11481-11485）
//   2. SugarRush(192) 补镐速 -0.2（:9634-9637 pickSpeed -= 0.2f）
//   3. KiteBuff(383) 数值（★1457 基准：+0.15/-0.1 :10003-10004；旧 1456 钉 +0.25/-0.15 已反转）
//   4. Stinky(120) 授予：臭味药水 2353 → 投掷弹 371 消亡 80px 内 30s
//      （Projectile.cs:75203-75228。★审计原文"药水 1332"有误——1332=Ichor 澳液，
//        1456 ItemID.cs:6245 StinkPotion=2353，按反编译定案）
//   5. Invisibility(10) 敌怪索敌无视：aggro 钳位 -750/-250（Player.cs:25437-25445
//      ——原版无 TargetClosest 硬门,是 aggro 抬升索敌距离）
//   6. Warmth(124) resistCold 受击 ×0.7（NPC 接触 :30961-30963 / 弹幕 :13764-13766）
//      + 46/47 削时确认（★1.4.5.7 新增,1456 反编译无——保留已备案）
//   7. CompanionCube(191)：★审计"微光变身 Hurt(20×难度) :24924-24931"系误植——
//      该行号实为 Stoned(156) 变身伤害（1456 全仓 ByOther(5) 仅 :24929/:25067 两处
//      均在 stoned 分支；弹 653/物品 3628 无任何微光分支,wiki 亦无）。本批不虚构,
//      锁定真实行为：Stoned 变身 Hurt(20×难度) + 宠物失 buff 即散
//   8. 诡药 3001：随机 70-120 + 10/20/30% 档 240/120/60 i-帧（Player.cs:51126-51146）
//      三条消费链（updateUse 主链 / quickDrinkPotion / quickConsume=QuickHeal）
// 标杆：Terarria1456/（Item.cs / Player.cs / Projectile.cs / NPC.cs / ItemID.cs）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { HitTile } from '../src/core/HitTile';
import { BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { TILE_BY_KEY } from '../src/data/tiles';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { hitPlayer, COLD_DAMAGE_NPCS, COLD_DAMAGE_PROJS } from '../src/entities/projTargets';

const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const playerSrc = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
const minionSrc = readFileSync(new URL('../src/entities/MinionProj.ts', import.meta.url), 'utf8');

const mkPlayer = (): Player => new Player(0, 0, new Inventory());

afterEach(() => {
  vi.restoreAllMocks();
});

// ============ 1. Clairvoyance(29) 三缺一补齐（Player.cs:11481-11485） ============
describe('Clairvoyance(29)：蓝上限+20 之外补魔伤/魔暴/耗魔三项', () => {
  it('manaMax +20（既有项不回归）+ maxMana 20→40', () => {
    const p = mkPlayer();
    expect(p.maxMana).toBe(20);
    p.buffs.apply(BuffType.Clairvoyance, 60);
    expect(p.buffs.manaMaxBonus).toBe(20);
    expect(p.maxMana).toBe(40);
  });
  it('魔伤 +5%（magicDamage += 0.05f :11483 → damageMult(\'magic\')）', () => {
    const p = mkPlayer();
    expect(p.damageMult('magic')).toBe(1);
    p.buffs.apply(BuffType.Clairvoyance, 60);
    expect(p.damageMult('magic')).toBeCloseTo(1.05, 5);
    expect(p.damageMult('melee')).toBe(1);   // 仅魔法系
  });
  it('魔暴 +2（magicCrit += 2 :11482 → critChance(\'magic\')）', () => {
    const p = mkPlayer();
    expect(p.critChance('magic')).toBe(0);
    p.buffs.apply(BuffType.Clairvoyance, 60);
    expect(p.critChance('magic')).toBe(2);
    expect(p.critChance('melee')).toBe(0);
    expect(p.critChance('ranged')).toBe(0);
  });
  it('耗魔 -2%（manaCost -= 0.02f :11485 → equipStats.manaCostMul ×0.98）', () => {
    const p = mkPlayer();
    expect(p.equipStats.manaCostMul).toBe(1);
    p.buffs.apply(BuffType.Clairvoyance, 60);
    expect(p.equipStats.manaCostMul).toBeCloseTo(0.98, 5);
  });
});

// ============ 2. SugarRush(192) 镐速 -0.2（Player.cs:9634-9637） ============
describe('SugarRush(192)：挖掘冷却链 pickSpeed -= 0.2', () => {
  /** F4 同款 tryMine 桩（buffs.has 可注） */
  const mkMine = (has: (t: BuffType) => boolean) => {
    const w = new World(40, 40, 20, 'bufffix-sugar');
    w.store.setTileSilent(20, 20, TILE_BY_KEY['stone'], 0, 0);
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      tryMine: (...a: unknown[]) => void;
    };
    g.netCanEditTile = () => true;
    g.inTileRange = () => true;
    g.world = w;
    g.hitTiles = new HitTile();
    g.tickCount = 0;
    g.lastMineHitTick = -999;
    g.mining = null;
    g.hardnessCache = 0;
    g.player = {
      buffs: { has, wellFedTier: 0, hungerPickSpeed: 0 },
      usedAmbrosia: false,
      equipStats: { chiselSpeed: false },
      inv: { heldItem: () => null },
    };
    g.killTileBreakSound = () => {};
    g.spawnParticles = () => {};
    g.tileAboveProtected = () => false;
    g.breakTile = () => {};
    return g;
  };
  const HIT = [20, 20, 10, 'pick', 10, 10] as const;   // power 10 永不破块;useTime 10

  it('有糖分冲刺：冷却 round(10×0.8)=8 —— t=8 落击（无 buff 时被 10t 窗吞）', () => {
    const g = mkMine((t) => t === BuffType.SugarRush);
    g.tickCount = 0;
    g.tryMine(...HIT);                       // 落击 last=0
    expect(g.lastMineHitTick).toBe(0);
    g.tickCount = 7;
    g.tryMine(...HIT);
    expect(g.lastMineHitTick).toBe(0);       // 7 < 8 吞
    g.tickCount = 8;
    g.tryMine(...HIT);
    expect(g.lastMineHitTick).toBe(8);       // 8 ≥ 8 落
  });
  it('无糖分冲刺：冷却 10 —— t=8 仍被吞（-0.2 确在链内而非恒快）', () => {
    const g = mkMine(() => false);
    g.tickCount = 0;
    g.tryMine(...HIT);
    g.tickCount = 8;
    g.tryMine(...HIT);
    expect(g.lastMineHitTick).toBe(0);       // 8 < 10 吞
    g.tickCount = 10;
    g.tryMine(...HIT);
    expect(g.lastMineHitTick).toBe(10);
  });
  it('静态锚：加法链含 SugarRush -0.2 项（Game.ts pickSpeed 链）', () => {
    expect(gameSrc).toContain('- (buffs.has(BuffType.SugarRush) ? 0.2 : 0)');
  });
});

// ============ 3. KiteBuff(383) 数值（★1457 基准 Player.cs:10003-10006；2026-08-23 基准切换,旧 1456 钉 +0.25/-0.15 反转） ============
describe('KiteBuff(383)：moveSpeed +0.15 / pickSpeed -0.1（1457 终值）', () => {
  it('moveSpeedMult：仅风筝 = 1.15（1457 :10003 moveSpeed += 0.15f）', () => {
    const p = mkPlayer();
    expect(p.buffs.moveSpeedMult).toBe(1);
    p.buffs.apply(BuffType.KiteBuff, 60);
    expect(p.buffs.moveSpeedMult).toBeCloseTo(1.15, 5);
  });
  it('挖掘冷却链 -0.1（1457 :10004 pickSpeed -= 0.1f；旧 1456 钉 -0.15 已反转）', () => {
    expect(gameSrc).toContain('- (buffs.has(BuffType.KiteBuff) ? 0.1 : 0)');
    expect(gameSrc).not.toContain('- (buffs.has(BuffType.KiteBuff) ? 0.15 : 0)');
    const p = mkPlayer();
    p.buffs.apply(BuffType.KiteBuff, 60);
    expect(p.buffs.pickSpeedMult).toBeCloseTo(0.9, 5);
  });
  it('放置速度 +0.15 两半边不变（1456 :9616-9617 tileSpeed/wallSpeed += 0.15f）', () => {
    expect(gameSrc).toContain('if (this.player.buffs.has(BuffType.KiteBuff)) s += 0.15;');
  });
});

// ============ 4. Stinky(120) 授予：臭味药水 2353 → 弹 371（:75203-75228） ============
describe('Stinky(120)：投掷弹 371 消亡 80px 内授予 30s（审计"1332"系 Ichor 误植）', () => {
  const mkDeath = (px: number, py: number) => {
    const applied: Array<[BuffType, number]> = [];
    const g = Object.create(Game.prototype) as unknown as {
      onProjectileDeath: (...a: unknown[]) => void;
    } & Record<string, unknown>;
    g.player = {
      dead: false, cx: px, cy: py, x: px - 10, y: py - 21, w: 20, h: 42,
      buffs: { apply: (t: BuffType, s: number) => applied.push([t, s]) },
    };
    return { g, applied };
  };
  it('弹 371 消亡：80px 内玩家 AddBuff(120, 1800t=30s)', () => {
    const { g, applied } = mkDeath(100, 100);
    g.onProjectileDeath(371, 95, 95, 10, 10);   // 弹心 (100,100) 距离 0
    expect(applied).toEqual([[BuffType.Stinky, 30]]);
  });
  it('80px 外不授；370（恋爱药水弹）/452 等他弹不误授', () => {
    const far = mkDeath(300, 100);
    far.g.onProjectileDeath(371, 95, 95, 10, 10);      // 距离 200 > 80
    expect(far.applied).toEqual([]);
    const other = mkDeath(100, 100);
    other.g.onProjectileDeath(370, 95, 95, 10, 10);    // 119 恋爱=纯视觉未实装,不授
    expect(other.applied).toEqual([]);
  });
  it('数据链：itemfunc 2353 shoot=371（投掷桥自动生成弹体）+ 鸟粪弹 1080 既有 10s 半边不回归', () => {
    const f = itemFuncOfVid(2353)!;
    expect(f.shoot).toBe(371);
    expect(f.consumable).toBeTruthy();
    expect(gameSrc).toContain('projId === 371');
  });
});

// ============ 5. Invisibility(10) 敌怪索敌无视（:25437-25445 aggro 钳位） ============
describe('Invisibility(10)：aggro 钳位 -750(未挥击)/-250(挥击)——索敌距离+750 曼哈顿', () => {
  it('无 buff 0；喝下未挥击 -750；挥击中 -250；buff 消失回 0', () => {
    const p = mkPlayer();
    expect(p.aggro).toBe(0);
    p.buffs.apply(BuffType.Invisibility, 60);
    expect(p.aggro).toBe(-750);
    p.useTime = 10;                       // 挥击窗（itemAnimation>0 档）
    expect(p.aggro).toBe(-250);
    p.useTime = 0;
    expect(p.aggro).toBe(-750);
    p.buffs.remove(BuffType.Invisibility);
    expect(p.aggro).toBe(0);
  });
  it('只降不升：潜行态 -600（星旋套半潜行）不被隐身抬回（:25437 条件 aggro > -750 才写）', () => {
    const p = mkPlayer();
    // 实例位遮蔽 equipStats（getter 无 setter,走 defineProperty；冻结对象不可
    // Proxy 覆写→摊开副本改字段）：星旋套 + 半潜行 → 基准 -round(1200×0.5) = -600
    const patched = { ...p.equipStats, vortexSet: true };
    Object.defineProperty(p, 'equipStats', { value: patched, configurable: true });
    (p as unknown as { stealth: number }).stealth = 0.5;
    expect(p.aggro).toBe(-600);           // 无隐身基准
    p.buffs.apply(BuffType.Invisibility, 60);
    expect(p.aggro).toBe(-750);           // -600 > -750 → 钳到 -750
    p.useTime = 10;
    expect(p.aggro).toBe(-600);           // 挥击档：-600 ≤ -250 → else-if 不触发,保持
  });
});

// ============ 6. Warmth(124) resistCold 受击 ×0.7（:30961-30963 / :13764-13766） ============
describe('Warmth(124)：寒冷系敌怪接触/敌弹受击 ×0.7', () => {
  const mkDmgGame = (warmth: boolean) => {
    const p = mkPlayer();
    p.hp = 100;
    if (warmth) p.buffs.apply(BuffType.Warmth, 60);
    const seen: number[] = [];
    (p as unknown as { damage: (dmg: number, ...a: unknown[]) => number }).damage =
      (dmg: number) => { seen.push(dmg); return 0; };
    const g = Object.create(Game.prototype) as unknown as {
      damagePlayer: (...a: unknown[]) => number;
    } & Record<string, unknown>;
    g.player = p;
    g.world = { difficulty: 0, flags: {}, seedFlags: {} };
    g.net = null;
    g.remotePlayerProxies = [];
    g.bannerNpcActive = () => false;
    g.hasPaladinShield = () => false;
    g.addDamageNumber = () => {};
    g.playSfxFiles = () => {};
    g.spawnParticles = () => {};
    g.recLog = () => {};
    g.entities = { projectiles: [], add: () => {} };
    return { g, p, seen };
  };
  it('NPC 接触：冰霜史莱姆(147) 100 → 70（(int)(100×0.7) 截断）;普通僵尸(1) 不减', () => {
    const cold = mkDmgGame(true);
    cold.g.damagePlayer(100, 0, 0, { vanillaId: 147, dead: false, cx: 0, cy: 0 } as never, true);
    expect(cold.seen).toEqual([70]);
    const warmless = mkDmgGame(false);
    warmless.g.damagePlayer(100, 0, 0, { vanillaId: 147, dead: false, cx: 0, cy: 0 } as never, true);
    expect(warmless.seen).toEqual([100]);
    const normal = mkDmgGame(true);
    normal.g.damagePlayer(100, 0, 0, { vanillaId: 1, dead: false, cx: 0, cy: 0 } as never, true);
    expect(normal.seen).toEqual([100]);
  });
  it('弹幕侧：敌弹 109（冰雪弹,coldDamage）100 → 经典档 140=trunc(70)×2;非表弹 200', () => {
    const mkHitGame = (warmth: boolean) => {
      const p = mkPlayer();
      if (warmth) p.buffs.apply(BuffType.Warmth, 60);
      const seen: number[] = [];
      const g = {
        player: p,
        world: { difficulty: 0 },
        damagePlayer: (dmg: number) => { seen.push(dmg); return dmg; },
      };
      return { p, g, seen };
    };
    const warm = mkHitGame(true);
    hitPlayer({ x: -5, y: -5, w: 10, h: 10, projId: 109 } as never, warm.g as never, 100);
    expect(warm.seen).toEqual([140]);       // trunc(100×0.7)=70 → 经典 ×2
    const cold2 = mkHitGame(false);
    hitPlayer({ x: -5, y: -5, w: 10, h: 10, projId: 109 } as never, cold2.g as never, 100);
    expect(cold2.seen).toEqual([200]);      // 100 ×2
    const nonCold = mkHitGame(true);
    hitPlayer({ x: -5, y: -5, w: 10, h: 10, projId: 13 } as never, nonCold.g as never, 100);  // 13 非寒弹
    expect(nonCold.seen).toEqual([200]);
  });
  it('寒冷表完备：NPC 16 型（含 668 鹿角怪/629 冰雪宝箱怪/345 冰雪女王）;敌弹 29 型', () => {
    expect(COLD_DAMAGE_NPCS.size).toBe(16);
    for (const id of [143, 144, 145, 147, 150, 154, 169, 184, 185, 206, 243, 343, 345, 352, 629, 668]) {
      expect(COLD_DAMAGE_NPCS.has(id), `NPC ${id}`).toBe(true);
    }
    expect(COLD_DAMAGE_PROJS.size).toBe(29);
    for (const id of [109, 174, 253, 343, 912]) expect(COLD_DAMAGE_PROJS.has(id), `弹 ${id}`).toBe(true);
  });
  it('46/47 削时确认（★1.4.5.7 新增,1456 无此逻辑——按 1457 保留已备案）：÷4/÷2 + 新获 Warmth 削既有', () => {
    const p = mkPlayer();
    p.buffs.apply(BuffType.Warmth, 900);
    p.buffs.apply(BuffType.Chilled, 32);
    expect(p.buffs.active.get(BuffType.Chilled)).toBeCloseTo(8, 5);    // 32/4
    p.buffs.apply(BuffType.Frozen, 30);
    expect(p.buffs.active.get(BuffType.Frozen)).toBeCloseTo(15, 5);    // 30/2
    const q = mkPlayer();
    q.buffs.apply(BuffType.Chilled, 32);                                // 先冻后暖
    expect(q.buffs.active.get(BuffType.Chilled)).toBeCloseTo(32, 5);
    q.buffs.apply(BuffType.Warmth, 900);
    expect(q.buffs.active.get(BuffType.Chilled)).toBeCloseTo(8, 5);    // 立即 ÷4
  });
});

// ============ 7. CompanionCube(191)——审计误植定谳 + 真实行为锁定 ============
describe('CompanionCube(191)：审计"微光变身 Hurt(20)"系 Stoned 行误植（不虚构）', () => {
  it('1456 定谳：:24924-24931 = Stoned(156) 变身 Hurt(20×难度,ByOther(5))——仓库已实装', () => {
    // 1456 全仓 PlayerDeathReason.ByOther(5) 仅 :24929/:25067 两处,均在 stoned 分支;
    // 弹 653/物品 3628 无任何微光分支（Projectile.cs 653 段 :46655/:46804-46860 仅
    // 岩浆尖叫/黑暗捅人 Hurt(3,ByOther(6))）。本仓真实消费 = Player.ts 石化过渡段
    expect(playerSrc).toContain('getAttackDamageScaledByDifficulty(20, mainDifficulty(game.world))');
    expect(playerSrc).toContain("this.lastDamageCause = { kind: 'petrified' }");
  });
  it('宠物真实行为：失 buff 即散（MinionProj.companionCubeStep 生命期门）+ buff 映射 191', () => {
    expect(minionSrc).toContain('owner.buffs.has(BuffType.CompanionCube)');
    expect(BUFF_DEFS[BuffType.CompanionCube]?.vanillaBuff).toBe(191);
    // 黑暗捅人 Hurt(3, ByOther(6)) 半边（:46856 player.Hurt(...,3,0)）也在位
    expect(minionSrc).toContain('companionCubeStep');
  });
});

// ============ 8. 诡药 3001：随机 70-120 + i-帧三档（:51126-51146） ============
describe('诡药 3001：随机回复 + 10/20/30% 档 240/120/60 i-帧', () => {
  const mkRoll = () => {
    const g = Object.create(Game.prototype) as unknown as {
      strangeBrewRoll: () => number;
    } & Record<string, unknown>;
    const p = mkPlayer();
    g.player = p;
    return { g, p };
  };
  it('四档确定性：r=0.01→heal70+i240 / r=0.2→80+i120 / r=0.5→95+i60 / r=0.9→115+无', () => {
    const cases: Array<[number, number, number]> = [
      [0.01, 70, 240],   // 70+⌊0.01×51⌋=70;NextFloat ≤0.1 → 240
      [0.2, 80, 120],    // 70+⌊0.2×51⌋=80;≤0.3 → 120
      [0.5, 95, 60],     // 70+⌊0.5×51⌋=95;≤0.6 → 60
      [0.9, 115, 0],     // 70+⌊0.9×51⌋=115;>0.6 → 无 i-帧
    ];
    for (const [r, heal, frames] of cases) {
      const { g, p } = mkRoll();
      p.iframes = 0;
      const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(r).mockReturnValueOnce(r);
      expect(g.strangeBrewRoll()).toBe(heal);
      expect(p.iframes).toBe(frames);
      spy.mockRestore();
    }
  });
  it('i-帧只取 max 不缩短既有无敌帧；值域 70..120 全域可达', () => {
    const { g, p } = mkRoll();
    p.iframes = 100;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.05);
    g.strangeBrewRoll();
    expect(p.iframes).toBe(240);            // max(100,240)
    p.iframes = 300;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.05);
    g.strangeBrewRoll();
    expect(p.iframes).toBe(300);            // 既有更长不缩短
    vi.restoreAllMocks();
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) seen.add(mkRoll().g.strangeBrewRoll());
    expect(seen.size).toBe(51);             // 70..120 全域
    for (let v = 70; v <= 120; v++) expect(seen.has(v), `heal ${v}`).toBe(true);
  });
  it('三条消费链全接：updateUse 主链 / quickDrinkPotion / quickConsume(QuickHeal)', () => {
    expect(gameSrc).toContain('fvid === 3001 ? this.strangeBrewRoll() : ff.healLife');
    expect(gameSrc).toContain('qvid === 3001 ? this.strangeBrewRoll() : ff.healLife');
    expect(gameSrc).toContain('vid === 3001 ? this.strangeBrewRoll() : f.healLife');
    expect(itemFuncOfVid(3001)!.healLife).toBe(70);   // 表基值（运行时随机覆写）
  });
});
