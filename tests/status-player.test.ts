// 敌对弹幕命中玩家 debuff（Projectile.StatusPlayer，Projectile.cs:11450-11722）：
//  表驱动结算回归。数据 = tools/extract-statusplayer.mjs 提取的
//  src/data/vanilla-statusplayer.json（48 弹型/42 块/零跳过，提取带护栏）；
//  运行时 = src/entities/projTargets.ts statusPlayer（AST 解释器）。
//  本测锁三层：表完整性（型号数/buff 可解析）/ 确定性弹型（恒定时长）/
//  复杂门语义（专家分支、!hostile、!player.frozen、348 顺序掷骰链统计分布）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { statusPlayer } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';
import { BuffType, buffTypeByVanilla } from '../src/stats/Buffs';
import tableJson from '../src/data/vanilla-statusplayer.json';

const TABLE = tableJson as unknown as Record<string, unknown>;

/** 轻量 fake game（statusPlayer 只读 world/player——难度门 + buffs/shimmering） */
function makeGame(difficulty = 0): { game: GameHooks; player: Player } {
  const world = new World(64, 32, 42, '测试');
  world.difficulty = difficulty;
  const player = new Player(8 * 16, 10 * 16, new Inventory());
  const game = {
    world, player,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { game, player };
}

/** 重掷一次并清空 buff 桶（万次级统计循环复用同一 game——World 构造是热点） */
function rollOnce(ctx: { game: GameHooks; player: Player }, projId: number, hostile = true): void {
  ctx.player.buffs.active.clear();
  statusPlayer(ctx.game, projId, hostile);
}

/** 递归收表内全部原版 buff id（leaf 的 b 字段） */
function collectBuffs(node: unknown, out: number[] = []): number[] {
  if (Array.isArray(node)) { node.forEach((n) => collectBuffs(n, out)); return out; }
  if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (typeof n.b === 'number') out.push(n.b);
    for (const k of ['t', 'e', 'a']) if (n[k]) collectBuffs(n[k], out);
    if (Array.isArray(n.i)) n.i.forEach((arm) => collectBuffs((arm as Record<string, unknown>).t, out));
  }
  return out;
}

/** 剩余秒（tick→秒换算后 buffState 存秒；表内常量 d 为 tick） */
const sec = (player: Player, bt: BuffType): number | undefined => player.buffs.active.get(bt);

describe('StatusPlayer 表完整性（Projectile.cs:11450-11722）', () => {
  it('49 弹型全量入表（1127=叶绿孢子云，r15 批新增）', () => {
    expect(Object.keys(TABLE)).toHaveLength(49);
    // 三族抽样：区间族 399-402 / 双型族 55·719 / 双块族 285(!hostile 二次授予)
    for (const t of [1078, 285, 1048, 348, 349, 399, 400, 401, 402, 55, 719, 174, 177, 257]) {
      expect(TABLE[String(t)], `type ${t}`).toBeDefined();
    }
  });
  it('表内全部 buff id 已映射 BuffType（防静默跳过）', () => {
    const ids = [...new Set(Object.values(TABLE).flatMap((v) => collectBuffs(v)))].sort((a, b) => a - b);
    // 397=叶绿孢子 DoT（Buffs.ts ChlorophyteSpore，r15 R15-19 接入）
    expect(ids).toEqual([20, 22, 23, 24, 31, 32, 39, 44, 46, 47, 69, 70, 80, 120, 144, 149, 164, 196, 323, 324, 397]);
    for (const id of ids) expect(buffTypeByVanilla(id), `vanilla buff ${id}`).toBeDefined();
  });
});

describe('确定性弹型（单 ApplyBuffTo 无门）', () => {
  it.each([
    [119, BuffType.Frostburn2, 240],   // 冰晶刃 → 霜燃2 240t（:11480-11482）
    [359, BuffType.Frostburn2, 420],   // 冰晶杖 → 420t（:11484-11486）
    [188, BuffType.OnFire3, 1200],     // 火焰陷阱 → 地狱火 1200t（:11488-11490）
    [961, BuffType.Frozen, 20],        // 鹿角怪冰锥 → 冰冻 20t（:11496-11698）
    [682, BuffType.WitheredWeapon, 300], // DD2 萤火虫电击 → 枯萎武器 300t（:11546-11548）
    [299, BuffType.Cursed, 240],       // 暗影焰 → 诅咒 240t（:11614-11616）
    [98, BuffType.Poisoned, 600],      // 毒镖 → 中毒 600t（:11660-11662）
    [1053, BuffType.OnFire, 300],      // 熔岩巨砾 → 着火 300t（:11664-11666）
    [184, BuffType.Poisoned, 900],     // 毒镖陷阱 → 900t（:11668-11670）
    [980, BuffType.Venom, 300],        // 毒液镖陷阱 → 毒液 300t（:11672-11674）
    [288, BuffType.Ichor, 900],        // 金浴 → 灵液 900t（:11648-11650）
  ] as const)('type %i → %s %it 恒定', (projId, bt, ticks) => {
    const ctx = makeGame();
    for (let i = 0; i < 20; i++) {
      rollOnce(ctx, projId);
      expect(sec(ctx.player, bt)).toBeCloseTo(ticks / 60, 6);
    }
  });

  it('时长区间：Next(a,b) 含头不含尾（1078/472/437/293）', () => {
    const ctx = makeGame();
    const seen: Record<number, number[]> = { 1078: [], 472: [], 437: [], 293: [] };
    for (let i = 0; i < 400; i++) {
      for (const t of [1078, 472, 437, 293]) {
        rollOnce(ctx, t);
        const bt = t === 1078 ? BuffType.OnFire : t === 472 ? BuffType.Webbed
          : t === 437 ? BuffType.Electrified : BuffType.Blackout;
        seen[t].push((sec(ctx.player, bt) ?? 0) * 60);
      }
    }
    // 1078 Next(300,600) / 472 Next(30,150) / 437 60×Next(4,9) / 293 60×Next(2,7)
    expect(Math.min(...seen[1078])).toBeGreaterThanOrEqual(300);
    expect(Math.max(...seen[1078])).toBeLessThanOrEqual(599);
    expect(Math.min(...seen[472])).toBeGreaterThanOrEqual(30);
    expect(Math.max(...seen[472])).toBeLessThanOrEqual(149);
    expect(Math.min(...seen[437])).toBeGreaterThanOrEqual(240);
    expect(Math.max(...seen[437])).toBeLessThanOrEqual(480);
    expect(Math.min(...seen[293])).toBeGreaterThanOrEqual(120);
    expect(Math.max(...seen[293])).toBeLessThanOrEqual(360);
  });
});

describe('条件门语义', () => {
  it('276 专家必中 / 经典 50% 概率（:11527-11535）', () => {
    const cl = makeGame(0), ex = makeGame(1);
    let classicHit = 0;
    for (let i = 0; i < 4000; i++) {
      rollOnce(cl, 276);
      if (cl.player.buffs.has(BuffType.Poisoned)) classicHit++;
    }
    for (let i = 0; i < 200; i++) {
      rollOnce(ex, 276);
      expect(ex.player.buffs.has(BuffType.Poisoned)).toBe(true); // 专家恒中
    }
    expect(classicHit / 4000).toBeGreaterThan(0.4);
    expect(classicHit / 4000).toBeLessThan(0.6);
  });

  it('!hostile 门：399-402/253 仅非敌对弹自伤路径生效（:11591-11593/:11652-11654）', () => {
    // 缺省 hostile=true（Damage_EVP 语义）→ 块不触发
    const a = makeGame();
    statusPlayer(a.game, 399);
    expect(a.player.buffs.has(BuffType.OnFire)).toBe(false);
    const b = makeGame();
    statusPlayer(b.game, 253);
    expect(b.player.buffs.has(BuffType.Frostburn2)).toBe(false);
    // hostile=false（BombsHurtPlayers 爆炸自伤语义）→ 触发
    const c = makeGame();
    statusPlayer(c.game, 399, false);
    expect(sec(c.player, BuffType.OnFire)).toBeGreaterThanOrEqual(180 / 60);
    expect(sec(c.player, BuffType.OnFire)).toBeLessThanOrEqual(360 / 60);
    const d = makeGame();
    statusPlayer(d.game, 253, false);
    expect(sec(d.player, BuffType.Frostburn2)).toBe(600 / 60);
  });

  it('285 双块：hostile 弹仍吃首块 Confused（:11460-11470 无 hostile 门）', () => {
    const { game, player } = makeGame();
    statusPlayer(game, 285); // hostile=true → 仅首块
    expect(player.buffs.has(BuffType.Confused)).toBe(true);
    expect(sec(player, BuffType.Confused)! * 60).toBeLessThanOrEqual(180);
  });

  it('!player.frozen 门：174 冰锥已冰冻时跳过 Frozen 臂（:11680-11690）', () => {
    const ctx = makeGame();
    // 未冰冻 → Chilled 恒中 + Frozen 概率臂
    let frozenSeen = 0;
    for (let i = 0; i < 2000; i++) {
      rollOnce(ctx, 174);
      expect(sec(ctx.player, BuffType.Chilled)).toBe(1200 / 60); // Chilled 恒 1200t
      if (ctx.player.buffs.has(BuffType.Frozen)) frozenSeen++;
    }
    expect(frozenSeen).toBeGreaterThan(0); // 1/20 门有命中
    // 已冰冻（frozen=true）→ Frozen 臂恒不触发
    for (let i = 0; i < 300; i++) {
      ctx.player.buffs.active.clear();
      ctx.player.buffs.apply(BuffType.Frozen, 1);
      statusPlayer(ctx.game, 174);
      expect(sec(ctx.player, BuffType.Chilled)).toBe(1200 / 60);
      expect(sec(ctx.player, BuffType.Frozen)).toBe(1); // 维持原时长,未被刷新
    }
  });

  it('581 星旋减益 专家/经典两档（:11504-11514）', () => {
    const exG = makeGame(1), clG = makeGame(0);
    const ex: number[] = [];
    for (let i = 0; i < 300; i++) {
      rollOnce(exG, 581);
      ex.push((sec(exG.player, BuffType.VortexDebuff) ?? 0) * 60);
    }
    expect(Math.min(...ex)).toBeGreaterThanOrEqual(300); // 专家 Next(300,540) 恒中
    expect(Math.max(...ex)).toBeLessThanOrEqual(539);
    let hit = 0;
    for (let i = 0; i < 3000; i++) {
      rollOnce(clG, 581);
      if (clG.player.buffs.has(BuffType.VortexDebuff)) hit++;
    }
    expect(hit / 3000).toBeGreaterThan(0.4); // 经典 50%
    expect(hit / 3000).toBeLessThan(0.6);
  });

  it('348 霜涛顺序掷骰链统计分布（:11554-11576）', () => {
    // Chilled 双分支:1/2→600t,else→300t
    // Frozen:Next(3)!=0 外门(2/3) → Next(16)==0→60t / else Next(12)==0→40t /
    //   else Next(8)==0→20t——三级是【顺序独立掷骰】(elif 各自再掷),概率:
    //   P60=2/3×1/16、P40=2/3×(15/16)(1/12)、P20=2/3×(15/16)(11/12)(1/8)
    let chilled600 = 0, frozen60 = 0, frozen40 = 0, frozen20 = 0, frozenNone = 0;
    const ctx = makeGame();
    const N = 60000;
    for (let i = 0; i < N; i++) {
      rollOnce(ctx, 348);
      if (sec(ctx.player, BuffType.Chilled) === 600 / 60) chilled600++;
      const f = sec(ctx.player, BuffType.Frozen);
      if (f === 60 / 60) frozen60++;
      else if (f === 40 / 60) frozen40++;
      else if (f === 20 / 60) frozen20++;
      else frozenNone++;
    }
    expect(chilled600 / N).toBeGreaterThan(0.5 - 0.04);
    expect(chilled600 / N).toBeLessThan(0.5 + 0.04);
    // 顺序掷骰的联合分布(非独立并行掷骰)——容差 ±15% 相对
    expect(frozen60 / N).toBeGreaterThan((2 / 3 / 16) * 0.85);
    expect(frozen60 / N).toBeLessThan((2 / 3 / 16) * 1.15);
    expect(frozen40 / N).toBeGreaterThan(((2 / 3) * (15 / 16) / 12) * 0.85);
    expect(frozen40 / N).toBeLessThan(((2 / 3) * (15 / 16) / 12) * 1.15);
    expect(frozen20 / N).toBeGreaterThan(((2 / 3) * (15 / 16) * (11 / 12) / 8) * 0.85);
    expect(frozen20 / N).toBeLessThan(((2 / 3) * (15 / 16) * (11 / 12) / 8) * 1.15);
    expect(frozen60 + frozen40 + frozen20 + frozenNone).toBe(N);
  });

  it('96/101 诅咒焰三级链（:11633-11647）', () => {
    let hit180 = 0, hit120 = 0, none = 0;
    const ctx = makeGame();
    const N = 60000;
    for (let i = 0; i < N; i++) {
      rollOnce(ctx, 96);
      const v = sec(ctx.player, BuffType.CursedInferno);
      if (v === 180 / 60) hit180++;
      else if (v === 120 / 60) hit120++;
      else none++;
    }
    // P(180)=1/6+(5/6)(1/4)=0.375（一二级同为 180t,顺序链首中即停）；
    // P(120)=(5/6)(3/4)(1/2)=0.3125
    expect(hit180 / N).toBeGreaterThan(0.375 * 0.9);
    expect(hit180 / N).toBeLessThan(0.375 * 1.1);
    expect(hit120 / N).toBeGreaterThan(0.3125 * 0.9);
    expect(hit120 / N).toBeLessThan(0.3125 * 1.1);
    expect(none).toBeGreaterThan(0);
  });

  it('AddBuff max 合并：重复命中不缩短（BuffState.apply 语义）', () => {
    const { game, player } = makeGame();
    statusPlayer(game, 119); // 240t
    player.buffs.tick(2);    // 余 220t
    statusPlayer(game, 119);
    expect(sec(player, BuffType.Frostburn2)).toBeCloseTo(240 / 60, 5); // 续期回满
  });

  it('AddBuff max 合并：已挂更短 buff 不覆盖长档（176 两级链 :11712-11720）', () => {
    // 1/4→1200t / else 1/2→300t：多次命中后取历史最大档
    const ctx = makeGame();
    let best = 0;
    for (let i = 0; i < 2000; i++) {
      rollOnce(ctx, 176);
      best = Math.max(best, (sec(ctx.player, BuffType.Poisoned) ?? 0) * 60);
    }
    expect(best).toBe(1200);
  });
});
