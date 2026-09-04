import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, ROCKETS_SKIP_DAMAGE_FOR_PLAYERS, PREPARE_BOMB_HURT_BOX, FIXED_SELF_DAMAGE_FOR_PLAYERS } from '../src/core/Game';
import { canKillTileAt, checkTileBreakabilityAt } from '../src/entities/Mounts';
import { dirtBallDepositTile } from '../src/entities/DirtBallProj';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET, TILE_BY_KEY } from '../src/data/tiles';

// SW-R3 2026-09-03 红队三轮回归：F-1 skip 豁免集 / F-2+M-4 hurtBox16 全表 /
// F-7b+c+L-2+L-4 裸 active 三面（不实例化 Game,纯静态+纯函数）。
const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

describe('SW-R3 F-1：RocketsSkipDamageForPlayers 豁免集（ProjectileID.cs:189）', () => {
  it('成员 16 型逐 id=原文;与 FIXED_SELF 表交集空', () => {
    expect([...ROCKETS_SKIP_DAMAGE_FOR_PLAYERS].sort((a, b) => a - b))
      .toEqual([338, 339, 340, 341, 803, 804, 805, 806, 807, 808, 809, 810, 862, 863, 930, 1088]);
    for (const id of ROCKETS_SKIP_DAMAGE_FOR_PLAYERS) {
      expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[id]).toBeUndefined();
    }
  });
  it('玩家段与远端广播两处都挂门（:71786 调用侧门 1:1）', () => {
    expect(gameSrc.match(/ROCKETS_SKIP_DAMAGE_FOR_PLAYERS\.has\(projId\)/g)?.length).toBe(2);
  });
});

describe('SW-R3 F-2+M-4：hurtBox16 = PrepareBombToBlow Resize 全表（P.cs:47629-47720）', () => {
  it('128 档→64 / 200 档→100 / 250 档→125 / 280 档→140 / 80 档→40', () => {
    for (const id of [28, 30, 37, 102, 133, 134, 135, 136, 137, 138, 338, 339, 397, 516, 517, 519, 588, 776, 777, 778, 780, 781, 782, 803, 804, 930]) {
      expect(PREPARE_BOMB_HURT_BOX[id]).toBe(64);
    }
    for (const id of [139, 140, 141, 142, 143, 144, 340, 341]) expect(PREPARE_BOMB_HURT_BOX[id]).toBe(100);
    for (const id of [29, 470, 637, 793, 794, 795, 796, 797, 798, 808]) expect(PREPARE_BOMB_HURT_BOX[id]).toBe(125);
    for (const id of [1086, 1087]) expect(PREPARE_BOMB_HURT_BOX[id]).toBe(140);
    expect(PREPARE_BOMB_HURT_BOX[681]).toBe(40);
  });
  it('48 档→24（裂片/湿·液体火箭全组,含 810）;809 不在表（字面 808||808 无 809）→ 链显式 7', () => {
    for (const id of [779, 783, 862, 863, 784, 785, 786, 787, 788, 789, 790, 791, 792, 799, 800, 801, 805, 806, 807, 810, 903, 904, 905, 906, 910, 911]) {
      expect(PREPARE_BOMB_HURT_BOX[id]).toBe(24);
    }
    expect(PREPARE_BOMB_HURT_BOX[809]).toBeUndefined();
    expect(gameSrc).toMatch(/PREPARE_BOMB_HURT_BOX\[projId\]\s*\?\? \(projId === 809 \? 7 : 11\)/);
  });
  it('case grenade 链同源口径（125/140/64/681→40/湿 24 档在位）', () => {
    expect(gameSrc).toMatch(/cw\.shoot === 29 \|\| cw\.shoot === 470 \|\| cw\.shoot === 637 \? 125/);
    expect(gameSrc).toMatch(/cw\.shoot === 1086 \|\| cw\.shoot === 1087 \? 140/);
    expect(gameSrc).toMatch(/cw\.shoot === 681 \? 40/);
  });
  it('F-5：108 链爆/电路触发 hurtBox=130、164 地雷=64（SetDefaults 盒）', () => {
    // 尾参 ,1 = SW-AC1 2026-09-04 kbDir=弹体朝向+1（零速生成弹 Entity.direction 缺省/
    // 自动面 else 档）;kb=10 = SW-AD1 2026-09-04 终态（Wiring.cs:2042 生成参
    // knockBack=10f,经 Projectile.cs:10884 赋值——旧 SW-S1"kb=0 维持"注已被勘误推翻,
    // 见 Game.ts 链爆 SW-AD1 终态注）
    expect(gameSrc).toMatch(/explodeAt\(ex, ey, 500, 10, true, 130, 0, 108, undefined, undefined, 10, 1\)/);
    const devices = readFileSync(new URL('../src/world/wiring/devices.ts', import.meta.url), 'utf8');
    expect(devices).toMatch(/ctx\.explode\(x, y, 500, 10, true, 130, 108\)/);
    expect(devices).toMatch(/ctx\.explode\(x, y, 250, 0, false, 64, 164\)/);
  });
  it('F-8：NewProjectile per-Type 表有 588→180（P.cs:11051-11054）', () => {
    expect(Game.EXPLODE_FUSE[588]).toBe(180);
  });
});

describe('SW-R3 F-7+L-2+L-4：裸 active 三面（不含致动位）', () => {
  it('行为面：已致动格仍可被杀（tileActiveBare 走 bit0,nactive 门退役）', () => {
    const st = new TileStore(32, 32);
    st.setTile(5, 5, TILE_INTERNAL_BY_SHEET.get(0) ?? 1);   // 泥土
    st.setWire(5, 5, TileStore.WIRE_ACTUATED);
    expect(st.hasTile(5, 5)).toBe(true);
    expect(st.isActive(5, 5)).toBe(false);
    expect(canKillTileAt(st, 5, 5)).toBe(true);
  });
  it('行为面：L-4 泥球落点下格=已致动轨道 → 仍拦铺（:79250 裸 active）', () => {
    const st = new TileStore(32, 32);
    const track = TILE_INTERNAL_BY_SHEET.get(314)!;
    st.setTile(6, 6, track);
    st.setWire(6, 6, TileStore.WIRE_ACTUATED);
    const dep = dirtBallDepositTile(st, 6 * 16 + 8, 5 * 16 + 8, 0, 4);
    expect(dep.occupied).toBe(false);
    expect(dep.blocked).toBe(true);
  });
  it('源锚面：Mounts 三函数/传门/ DirtRod/裂片残差+dead 守卫全部在位', () => {
    const mounts = readFileSync(new URL('../src/entities/Mounts.ts', import.meta.url), 'utf8');
    expect(mounts).toMatch(/\(st\.flags\[st\.idx\(x, y\)\] & 1\) !== 0/);              // F-7c bit0
    expect(mounts.match(/tileActiveBare\(st, x, y - 1\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mounts).toMatch(/if \(!st\.inBounds\(x, y\)\) return false;\s*\n\s*const t = st\.type/);   // L-2 自格门删
    expect(gameSrc).toMatch(/if \(!st\.inBounds\(tx, ty\) \|\| !st\.hasTile\(tx, ty\)\) return;/);   // F-7b ②
    expect(gameSrc).toMatch(/if \(st\.hasTile\(tx, ty\)\) return;/);                    // F-7b ④
    const cfp = readFileSync(new URL('../src/entities/ClusterFragmentProj.ts', import.meta.url), 'utf8');
    expect(cfp).toMatch(/if \(this\.dead\) return;/);                                   // L-6
    expect(cfp).toMatch(/else this\.vy = this\.y - bodyY0;/);                           // F-6② 残差
    expect(cfp).not.toMatch(/Math\.min\(this\.vy \+ 0\.2, 16\)/);                       // F-6① 去钳
  });
});
