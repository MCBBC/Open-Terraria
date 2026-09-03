// 蓝队 F3 回归：焰爆石脉冲弹出射类旗现场定类（Projectile.cs:14414-14418）——
//  `bool flag4 = owner.meleeCrit > owner.rangedCrit; proj.melee = flag4;
//   proj.ranged = !flag4`：弹 1131 SetDefaults 静态 melee（:10613-10624）但每次
//  出射重定类；1121 静态 ranged（:10493-10504）/1132 无任何类旗（:10626-10637）
//  原版均无翻旗。crit 掷随类旗走 Damage() 三连掷（:12906-12912，meleeCrit/rangedCrit
//  含基 4 —— Player.cs:2413/:18458），本仓经 Arrow.critChance 注入同一通道概率。
//  crit 差分用真实来源搭出（equipStats 冻结不可直写）：鹰妖护符 6166 rangedCrit+5、
//  狼人 buff meleeCrit+2（Player.critChance :2201 段）、Tipsy meleeCrit+2。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { trySnapStrike, snapStrikeDust } from '../src/stats/SnapStrike';
import { BuffType } from '../src/stats/Buffs';
import type { ProjClass } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; vanillaId?: number;
  realLife?: number | null; onFire3T?: number;
  hurt: (d: number, kx: number, ky: number, g: unknown) => boolean; hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function mkHooks(enemies: MockEnemy[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: Record<string, unknown> = {
    world: { store } as never,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  hooks.entities = { add: (e: unknown) => { added.push(e); } };
  return { hooks: hooks as unknown as GameHooks, player, added };
}

interface PulseLike {
  projId?: number;
  projClass?: ProjClass;
  critChance?: number;
}
const pulsesOf = (added: unknown[], projId: number): PulseLike[] =>
  added.filter((a) => (a as PulseLike).projId === projId) as PulseLike[];

describe('F3：脉冲弹出射类旗现场定类 + crit 通道注入', () => {
  it('焰爆石 6178 kind1 + 鹰妖护符(rangedCrit+5)：rangedCrit>meleeCrit → 弹 1131 显式 projClass=ranged，crit=(4+远程)/100', () => {
    const { hooks, player, added } = mkHooks([mkEnemy(2, 1080, 1440), mkEnemy(3, 1140, 1440)]);
    player.inv.armor[3] = { id: iid(6178), stack: 1 };          // 焰爆石 → accPyroclast 门
    player.inv.armor[4] = { id: iid(6166), stack: 1 };          // 鹰妖护符 → rangedCrit+5
    expect(player.equipStats.accPyroclast).toBe(true);
    expect(player.critChance('melee')).toBe(0);                 // 近战通道为零值
    expect(player.critChance('ranged')).toBe(5);
    expect(trySnapStrike(hooks, player, 1, 960, 1440, 999))
      .toBe(Math.trunc((70 + 10 * (2 - 2)) * Math.max(1 + player.equipStats.dmgMelee, 1 + player.equipStats.dmgRanged)));   // ★F1:两目标全出 misses=0
    const pulses = pulsesOf(added, 1131);
    expect(pulses.length).toBe(2);                              // num2=2 目标上限
    for (const pu of pulses) {
      expect(pu.projClass).toBe('ranged');                      // ★F3 :14415-14417
      expect(pu.critChance).toBeCloseTo((4 + 5) / 100, 10);     // :12906-12912 ranged 掷臂
    }
  });

  it('焰爆石 kind1：狼人(meleeCrit+2) → projClass=melee 且 crit 吃近战通道；两值持平取 ranged（!flag4）', () => {
    // 近战胜出档（melee=2 > ranged=0）
    const { hooks, player, added } = mkHooks([mkEnemy(1, 1080, 1440)]);
    player.inv.armor[3] = { id: iid(6178), stack: 1 };
    player.buffs.apply(BuffType.Werewolf, 30);
    expect(trySnapStrike(hooks, player, 1, 960, 1440, 999))
      .toBe(Math.trunc((70 + 10 * (2 - 1)) * Math.max(1 + player.equipStats.dmgMelee, 1 + player.equipStats.dmgRanged)));   // ★F1:单目标 misses=1
    const a = pulsesOf(added, 1131)[0];
    expect(a.projClass).toBe('melee');
    expect(a.critChance).toBeCloseTo((4 + 2) / 100, 10);
    // 持平档（0 vs 0）：flag4 = mC>rC 为 false → ranged（原版比较符严格大于）
    const h2 = mkHooks([mkEnemy(2, 1080, 1440)]);
    h2.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(trySnapStrike(h2.hooks, h2.player, 1, 960, 1440, 999))
      .toBe(Math.trunc((70 + 10 * (2 - 1)) * Math.max(1 + h2.player.equipStats.dmgMelee, 1 + h2.player.equipStats.dmgRanged)));   // ★F1
    const b = pulsesOf(h2.added, 1131)[0];
    expect(b.projClass).toBe('ranged');
    expect(b.critChance).toBeCloseTo((4 + 0) / 100, 10);
  });

  it('拍击石 6167 kind0：1121 数据面/显式双致 ranged（原版本就无翻旗）——近战暴击再高也只吃远程掷臂', () => {
    // ★STRICT 边界钉案（蓝队四轮）：先证"恰等于 maxRange=120px 的目标【不】取"
    // （原版 :46492 `num2 < num` 严格小于;旧仓 `>` 宽松判定曾把 120px 收进圈）
    {
      const edge = mkHooks([mkEnemy(21, 1080, 1440)]);          // |1080-960| = 120 = maxRange
      edge.player.inv.armor[3] = { id: iid(6167), stack: 1 };
      expect(pulsesOf(edge.added, 1121)).toHaveLength(0);       // 零脉冲 = STRICT 拒收
      expect(trySnapStrike(edge.hooks, edge.player, 0, 960, 1440, 999))
        .toBe(Math.trunc((40 + 10 * 2) * (1 + edge.player.equipStats.dmgRanged)));   // 全漏配档 =(40+20)
      expect(edge.player.accSnappingStoneCooldown).toBe(360);   // 无目标也置冷
    }
    const { hooks, player, added } = mkHooks([mkEnemy(1, 1040, 1440)]);   // 距 80 < 120 ✓
    player.inv.armor[3] = { id: iid(6167), stack: 1 };          // 拍击石 → accSnappingStone 门
    player.buffs.apply(BuffType.Werewolf, 30);
    player.buffs.apply(BuffType.Tipsy, 30);
    expect(player.critChance('melee')).toBeGreaterThan(player.critChance('ranged'));
    expect(trySnapStrike(hooks, player, 0, 960, 1440, 999))
      .toBe(Math.trunc((40 + 10 * (2 - 1)) * (1 + player.equipStats.dmgRanged)));   // ★F1:misses=1
    const pu = pulsesOf(added, 1121)[0];
    expect(pu).toBeDefined();
    expect(pu.projClass).toBe('ranged');
    expect(pu.critChance).toBeCloseTo((4 + player.critChance('ranged')) / 100, 10);
  });

  it('毁灭臂镗 6179 kind2：1132 原版无任何类旗 → 不钉 projClass 且恒不暴击（阈值<0 档）', () => {
    const { hooks, player, added } = mkHooks([mkEnemy(1, 1180, 1440)]);   // 距触发点 220 < 400
    player.inv.armor[3] = { id: iid(6179), stack: 1 };          // 毁灭臂镗 → accArmletOfRuin 门
    expect(player.equipStats.accArmletOfRuin).toBe(true);
    expect(trySnapStrike(hooks, player, 2, 960, 1440, 999))
      .toBe(Math.trunc((150 + 10 * (2 - 1)) * player.summonDamageMult));   // ★F1:kind2 加伤基座 150
    const pu = pulsesOf(added, 1132)[0];
    expect(pu).toBeDefined();
    expect(pu.projClass).toBeUndefined();                       // 无类旗不伪造
    expect(pu.critChance ?? 0).toBeLessThan(0);                 // rand<threshold 恒假（无掷臂语义）
  });
});

// ==================== ★F3（2026-09-01）拍击石尘段载荷直用 ====================
// 原文 Spawn_SnappingStone 消费式 num=钳(MovementVector.X/256,≤.12)（:600-605），
// X 在出弹端已含单掷 num11×num12（Projectile.cs:14429-31；受击者拍 :14434-36 为
// num11 裸值）。旧码 sizeHalf×(0.3+1.4r) 在尘段【复掷 num12】且收端 |X|/2 再除——
// 本地/远端/环带三面速度分裂。判别：同 X 重跑恒等 + 速度 = 64×num 精确式。
describe('★F3 尘段载荷直用（禁二次掷）', () => {
  const mkDustPool = () => {
    const made: Array<{ type: number; vx: number; vy: number; noGravity: boolean;
      scale: number; noLight: boolean; noLightEmittance: boolean }> = [];
    const pool = {
      spawn: (_x: number, _y: number, _w: number, _h: number, type: number) => {
        const d = { type, vx: 1, vy: 1, scale: 0, fadeIn: 9,
          noGravity: false, noLight: false, noLightEmittance: false };
        made.push(d);
        return d;
      },
    };
    return { pool, made };
  };
  const runKind0 = (mvX: number) => {
    const { pool, made } = mkDustPool();
    const hooks = { vanillaDust: pool } as unknown as GameHooks;
    snapStrikeDust(hooks, 0, 100, 100, mvX);
    expect(made.length).toBe(20);
    return made;
  };
  /** 逐尘期望速：base×64×num×（226 → 1/2,再 1/6 恢复重力支 ×1/2） */
  const expectVel = (made: ReturnType<typeof runKind0>, mvX: number): void => {
    const num = Math.min(0.12, mvX / 256);
    for (const d of made) {
      const f = d.type === 226 ? (d.noGravity ? 0.5 : 0.25) : 1;
      expect(d.vx).toBeCloseTo(64 * num * f, 12);
      expect(d.vy).toBeCloseTo(64 * num * f, 12);
      expect([226, 15]).toContain(d.type);
      expect(d.noLight).toBe(true);
    }
  };

  it('X=16（出弹端载荷形）：num=0.0625 → 速 4×chloro 因子,type15 速跨跑恒等（无二次掷）', () => {
    const a = runKind0(16);
    const b = runKind0(16);
    expectVel(a, 16);
    expectVel(b, 16);
    // 无二次掷判别：type15（非氯尘,无额外因子）速恒 = 64×num——旧码尘段复掷
    // num12 时该值逐跑漂移；chloro Next(3)/1/6 支为原版自有掷,型序不恒等属正常
    const v15a = [...new Set(a.filter((d) => d.type === 15).map((d) => d.vx))];
    const v15b = [...new Set(b.filter((d) => d.type === 15).map((d) => d.vx))];
    expect(v15a.length).toBe(1);
    expect(v15b.length).toBe(1);
    expect(v15a[0]).toBeCloseTo(4, 12);
    expect(v15a[0]).toBe(v15b[0]);
  });
  it('X=64 饱和档：num 钳 0.12 → 速 7.68×chloro 因子', () => {
    expectVel(runKind0(64), 64);
  });
  it('受击者拍裸值形（X=num11 无 num12）：同式直入,不再自行乘 (0.3+1.4r)', () => {
    const a = runKind0(11.313708498984761);   // 16×16 盒 num11=√(16²+16²)/2
    expectVel(a, 11.313708498984761);
  });
});

// ============ ★W-A2（2026-09-03）受击者自脉冲=完整 Spawn_ 本地面 ============
// 原版 Projectile.cs:14431-14437 受击者拍 = RequestParticleSpawn(clientOnly:false)
// （ParticleOrchestrator.cs:52-64 本地 SpawnParticlesDirect + netMode==1 上行）→
// Spawn_ 全段（音+环带+尘）在本端照跑;曾本地只生尘段（音/环带缺,远端 module8 却
// 全段复放）= 本/远端不对称。零目标形态下受击者拍是唯一 Spawn_ 面,便于单拍取证。
describe('★W-A2 受击者拍完整 Spawn_ 本地面（音+环带+尘三段齐）', () => {
  it('kind0 零目标：环带 2 圈起（size=6×钳(vh/256) 原值直入）+Item_72+尘 20+单次广播', () => {
    const parts: Array<{ x: number; y: number; opts: { size?: number } }> = [];
    const wavs: Array<{ file: string }> = [];
    const made: unknown[] = [];
    const broadcasts: number[] = [];
    const player = new Player(60 * 16, 90 * 16, new Inventory());
    player.inv.armor[3] = { id: iid(6167), stack: 1 };            // 拍击石 kind0
    const dustPool = {
      spawn: (_x: number, _y: number, _w: number, _h: number, type: number,
        vx = 0, vy = 0) => {
        const d = { type, vx: vx || 1, vy: vy || 1, scale: 0, fadeIn: 9,
          noGravity: false, noLight: false, noLightEmittance: false };
        made.push(d);
        return d;
      },
    };
    const hooks = {
      world: { store: new TileStore(200, 120) } as never,
      player,
      enemies: () => [] as unknown[],                             // 零目标 → 无逐弹拍
      critters: () => [],
      spawnParticles: (x: number, y: number, _c: string, _n: number, _s?: number,
        opts: { size?: number } = {}) => { void x; void y; parts.push({ x, y, opts }); },
      playSfxWav: (file: string) => { wavs.push({ file }); },
      vanillaDust: dustPool,
      broadcastParticleOrchestra: (type: number) => { broadcasts.push(type); },
    } as unknown as GameHooks;
    const vh = Math.hypot(16, 24) / 2;                            // 盒对角/2 裸值(:14433)
    trySnapStrike(hooks, player, 0, 960, 1440, 999,
      { victimBox: { w: 16, h: 24, cx: 960, cy: 1440 } });
    expect(parts).toHaveLength(2);                                // Spawn_SnappingStone 环带 ×2
    expect(parts[0].opts.size).toBeCloseTo(6 * Math.min(0.12, vh / 256), 12);  // 原值流(非预饱和)
    expect(wavs.some((w) => w.file === 'Item_72')).toBe(true);    // 受击者拍同播三味音
    expect(made).toHaveLength(20);                                // 尘段全量(同拍)
    expect(broadcasts).toHaveLength(1);                           // 上行面保持一处(不双播)
    // 零目标 → 无逐弹拍(逐弹拍在目标循环内);尾节拍音仍无条件(★B2②,非本断言面)
  });
});
