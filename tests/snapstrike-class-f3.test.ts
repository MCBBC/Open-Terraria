// 蓝队 F3 回归：焰爆石脉冲弹出射类旗现场定类（Projectile.cs:14414-14418）——
//  `bool flag4 = owner.meleeCrit > owner.rangedCrit; proj.melee = flag4;
//   proj.ranged = !flag4`：弹 1131 SetDefaults 静态 melee（:10613-10624）但每次
//  出射重定类；1121 静态 ranged（:10493-10504）/1132 无任何类旗（:10626-10637）
//  原版均无翻旗。crit 掷随类旗走 Damage() 三连掷（:12906-12912，meleeCrit/rangedCrit
//  含基 4 —— Player.cs:2413/:18458），本仓经 Arrow.critChance 注入同一通道概率。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { trySnapStrike } from '../src/stats/SnapStrike';
import type { ProjClass } from '../src/entities/projTargets';

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
  hurt: (d: number, kx: number, ky: number, g: never) => boolean; hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function setup(): { hooks: ReturnType<typeof mkHooks>; player: Player; added: unknown[] } {
  return mkHooks();
}
function mkHooks() {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks = {
    world: { store } as never,
    player,
    enemies: () => [] as MockEnemy[],
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
  (hooks as unknown as { entities: { add: (e: unknown) => void } }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks: hooks as unknown as import('../src/entities/types').GameHooks, player, added };
}

/** 双 crit 设值（Player.critChance 直读 equipStats；新玩家无 buff 干扰项） */
const setCrit = (player: Player, melee: number, ranged: number): void => {
  const es = player as unknown as { equipStats: Record<string, number> };
  es.equipStats.critMelee = melee;
  es.equipStats.critRanged = ranged;
};
interface PulseLike {
  projId?: number;
  projClass?: ProjClass;
  critChance?: number;
  damage?: number;
}

describe('F3：脉冲弹出射类旗现场定类 + crit 通道注入', () => {
  it('焰爆石 6178 kind1：rangedCrit > meleeCrit → 弹 1131 显式 projClass=ranged，crit=（4+远程暴击）/100', () => {
    const { hooks, player, added } = setup();
    player.inv.armor[3] = { id: iid(6178), stack: 1 };          // 焰爆石 → accPyroclast 门
    setCrit(player, 0, 30);                                     // 远程暴击胜出 → flag4=false
    const victim = mkEnemy(1, 960, 1440), far1 = mkEnemy(2, 1080, 1440);
    (hooks.enemies as unknown as () => MockEnemy[]) = () => [victim, far1];
    void victim;
    expect(trySnapStrike(hooks, player, 1, 960, 1440, 999)).toBe(true);
    const pulses = added.filter((a) => (a as PulseLike).projId === 1131) as PulseLike[];
    expect(pulses.length).toBe(2);                              // num2=2 目标上限
    for (const pu of pulses) {
      expect(pu.projClass).toBe('ranged');                      // ★F3 :14415-14417
      expect(pu.critChance).toBeCloseTo((4 + 30) / 100, 10);    // :12906-12912 ranged 掷臂
    }
  });

  it('焰爆石 kind1：meleeCrit > rangedCrit → projClass=melee，crit 吃近战通道；两值持平取 ranged（!flag4）', () => {
    // 近战胜出档
    const { hooks, player, added } = setup();
    player.inv.armor[3] = { id: iid(6178), stack: 1 };
    setCrit(player, 45, 10);
    (hooks.enemies as unknown as () => MockEnemy[]) = () => [mkEnemy(1, 960, 1440)];
    expect(trySnapStrike(hooks, player, 1, 960, 1440, 999)).toBe(true);
    const a = added[added.length - 1] as PulseLike;
    expect(a.projClass).toBe('melee');
    expect(a.critChance).toBeCloseTo((4 + 45) / 100, 10);
    // 持平档：flag4 = mC>rC 为 false → ranged（原版比较符严格大于）
    const h2 = setup();
    h2.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    setCrit(h2.player, 20, 20);
    (h2.hooks.enemies as unknown as () => MockEnemy[]) = () => [mkEnemy(1, 960, 1440)];
    expect(trySnapStrike(h2.hooks, h2.player, 1, 960, 1440, 999)).toBe(true);
    const b = h2.added[h2.added.length - 1] as PulseLike;
    expect(b.projClass).toBe('ranged');
    expect(b.critChance).toBeCloseTo((4 + 20) / 100, 10);
  });

  it('拍击石 6167 kind0：1121 数据面/显式双致 ranged（原版本就无翻旗），crit =（4+远程暴击）/100', () => {
    const { hooks, player, added } = setup();
    const es = player as unknown as { equipStats: Record<string, unknown> };
    es.equipStats.accSnappingStone = true;                      // 兜底门直通（trySnapStrike :45）
    setCrit(player, 40, 12);                                    // 近战再高也不翻旗（1121 无现场定类支）
    (hooks.enemies as unknown as () => MockEnemy[]) = () => [mkEnemy(1, 960, 1440)];
    expect(trySnapStrike(hooks, player, 0, 960, 1440, 999)).toBe(true);
    const pu = added.find((a) => (a as PulseLike).projId === 1121) as PulseLike | undefined;
    expect(pu).toBeDefined();
    expect(pu!.projClass).toBe('ranged');
    expect(pu!.critChance).toBeCloseTo((4 + 12) / 100, 10);     // 只吃远程掷臂
  });

  it('毁灭臂镗 6179 kind2：1132 原版无任何类旗 → 不钉 projClass 且恒不暴击（阈值<0 档）', () => {
    const { hooks, player, added } = setup();
    const es = player as unknown as { equipStats: Record<string, unknown> };
    es.equipStats.accArmletOfRuin = true;
    setCrit(player, 50, 50);
    (hooks.enemies as unknown as () => MockEnemy[]) = () => [mkEnemy(1, 960, 1440)];
    expect(trySnapStrike(hooks, player, 2, 960, 1440, 999)).toBe(true);
    const pu = added.find((a) => (a as PulseLike).projId === 1132) as PulseLike | undefined;
    expect(pu).toBeDefined();
    expect(pu!.projClass).toBeUndefined();                      // 无类旗不伪造
    expect(pu!.critChance ?? 0).toBeLessThan(0);                // rand<threshold 恒假（无掷臂语义）
  });
});
