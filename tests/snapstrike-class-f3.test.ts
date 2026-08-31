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
import { trySnapStrike } from '../src/stats/SnapStrike';
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
    damagePlayer: () => {},
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
