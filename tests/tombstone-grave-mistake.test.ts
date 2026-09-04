// ② 墓碑弹伤害面 + 击杀镇民成就 36 GRAVE_MISTAKE——反编译真值批（2026-09-04）
//   DropTombstone（1457 Player.cs:39429-39439）：非 FTW damage=0/knockBack=0 纯物理；
//   getGoodWorld → damage=70 / knockBack=10 / 弹速 ×1.5，且 SetDefaults（Projectile.cs
//   :1260-1271 等）对 43/201-205/527-531 置 friendly=true + hostile=true。
//   Projectile.Damage（:12549-12580）三面：PVE friendly 臂打敌怪；hostile&friendly 臂
//   （:12631 flag2）打城镇 NPC（:12633 双半开门——FTW 墓碑恒过门，不经巫毒窄门）；
//   EVP（:14846 hostile && damage>0）打本地玩家。击杀归因：Projectile.cs:13702-13706
//   attempt.DidNPCDie() → Player.OnKillNPC（:20623-20636）IsAGravestone && townNPC
//   → NotifyProgressionEvent(36)。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Tombstone } from '../src/entities/Tombstone';
import { TownNPC } from '../src/entities/TownNPC';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

function mkGame(w: World, npcs: TownNPC[], p: Player) {
  const events: number[] = [];
  const damagePlayer = vi.fn(() => 40);
  const hooks = {
    world: w,
    player: p,
    npcs: () => npcs,
    enemies: () => [],
    critters: () => [],
    achievements: { notifyProgressionEvent: (ev: number) => { events.push(ev); } },
    damagePlayer,
    addDamageNumber: () => {}, spawnParticles: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {},
  };
  return { hooks: hooks as unknown as GameHooks, events, damagePlayer };
}

describe('墓碑弹 DropTombstone 伤害参数（Player.cs:39429-39439）', () => {
  it('非 FTW：damage=0 / knockBack=0（Damage 三面首门全早退）', () => {
    const t = new Tombstone(100, 100, 0, '死亡文本', 1, false);
    expect(t.dmg).toBe(0);
    expect(t.knockBack).toBe(0);
  });
  it('FTW：damage=70 / knockBack=10', () => {
    const t = new Tombstone(100, 100, 0, '死亡文本', 1, true);
    expect(t.dmg).toBe(70);
    expect(t.knockBack).toBe(10);
  });
  it('FTW 弹速 ×1.5：vy 初值域 [-6,-3]（非 FTW [-4,-2]）——20 抽统计', () => {
    for (let i = 0; i < 20; i++) {
      const ftw = new Tombstone(100, 100, 0, 'x', 1, true);
      const plain = new Tombstone(100, 100, 0, 'x', 1, false);
      expect(ftw.vy).toBeLessThanOrEqual(-3);
      expect(plain.vy).toBeGreaterThanOrEqual(-4 - 1e-9);
      expect(plain.vy).toBeLessThanOrEqual(-2 + 1e-9);
    }
  });
  it('projId = style 反查 IsAGravestone 域（ProjectileID.cs:29）：0→43、3→203、8→530', () => {
    const t = new Tombstone(100, 100, 0, 'x', 1, false);
    t.style = 0; expect(t.projId).toBe(43);
    t.style = 3; expect(t.projId).toBe(203);
    t.style = 8; expect(t.projId).toBe(530);
  });
});

describe('FTW 墓碑伤害面（Projectile.Damage :12549-12580）', () => {
  const mk = () => {
    const w = new World(200, 200, 100, 'grave');
    const p = new Player(3000, 3000, new Inventory());   // 玩家远置（不接 EVP 面）
    const npc = new TownNPC('nurse', 100 * 16, 99 * 16, new Inventory());
    const { hooks, events, damagePlayer } = mkGame(w, [npc], p);
    return { w, p, npc, hooks, events, damagePlayer };
  };

  it('非 FTW 墓碑穿过镇民/玩家：零伤害、零事件（damage<=0 门）', () => {
    const env = mk();
    env.npc.hp = 10;                                       // 一触即死位
    const t = new Tombstone(env.npc.cx - 7, env.npc.cy - 7, 0, '碑文', 1, false);
    t.fixedUpdate(1 / 60, env.hooks);
    expect(env.npc.dead).toBe(false);
    expect(env.npc.hp).toBe(10);
    expect(env.damagePlayer).not.toHaveBeenCalled();
    expect(env.events).toEqual([]);
  });

  it('FTW 墓碑杀镇民：当拍 dead + 成就 36（OnKillNPC :20623-20636 归因）', () => {
    const env = mk();
    env.npc.hp = 10;                                       // 70-7.5→62 ≥ 10 必死
    const t = new Tombstone(env.npc.cx - 7, env.npc.cy - 7, 0, '碑文', 1, true);
    t.fixedUpdate(1 / 60, env.hooks);
    expect(env.npc.dead).toBe(true);
    expect(env.events).toEqual([36]);                      // NotifyProgressionEvent(36)
  });

  it('FTW 墓碑命中镇民未致死：受伤但无事件（DidNPCDie() 假臂）', () => {
    const env = mk();
    const hpBefore = env.npc.hp;                           // 护士 250：62 伤不致死
    const t = new Tombstone(env.npc.cx - 7, env.npc.cy - 7, 0, '碑文', 1, true);
    t.fixedUpdate(1 / 60, env.hooks);
    expect(env.npc.dead).toBe(false);
    expect(env.npc.hp).toBeLessThan(hpBefore);
    expect(env.events).toEqual([]);
  });

  it('FTW 墓碑打本地玩家（Damage_EVP :14846 hostile 面）：damagePlayer 受理', () => {
    const env = mk();
    const t = new Tombstone(env.p.cx - 7, env.p.cy - 7, 0, '碑文', 1, true);
    t.fixedUpdate(1 / 60, env.hooks);
    expect(env.damagePlayer).toHaveBeenCalledTimes(1);
    const dealt = (env.damagePlayer.mock.calls[0] as unknown as number[])[0];
    expect(dealt).toBeGreaterThan(0);                      // DamageVar ±15% 后 >0
  });

  it('FTW 墓碑离体后续拍不再结算（镇民 8t 无敌帧内不重复吃伤）', () => {
    const env = mk();
    const t = new Tombstone(env.npc.cx - 7, env.npc.cy - 7, 0, '碑文', 1, true);
    t.fixedUpdate(1 / 60, env.hooks);
    const firstHp = env.npc.hp;
    t.fixedUpdate(1 / 60, env.hooks);                      // 仍在重叠域,iframes 8t 内
    expect(env.npc.hp).toBe(firstHp);
  });
});
