import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { isCrackedAt } from '../src/world/CrackedBricks';

// SW-J1 2026-09-03 回归两账：①手雷族 30/397/517/588 Kill 裂砖专破（Kill_ExplodeTiles
// Projectile.cs:79001-79033 → ExplodeCrackedTiles :80505-80525——爆心=base.Center,
// r4 严格开圆,只杀 CrackedBricks 481-483,普通地形不破）;②TNT 桶 1002 地形面定谳
// （闸门表 :79027-79030 不含 1002 → :79064 `type==1002→num6=10` 死代码 = Kill 不炸
// 地形;本仓曾误 r10 炸地形）。

const mkGame = (world: World) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 原型桩（同 orphan-b2 mkProtoGame 惯例）
  const g = Object.create(Game.prototype) as Record<string, any> & { logs?: unknown[] };
  g.world = world;
  g.player = { cx: 60 * 16, cy: 60 * 16, w: 20, h: 42, equipStats: {}, lastDamageCause: null };
  g.chunks = { markDirtyArea: () => {} };
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.sfx = { play: () => {} };
  g.sfxAt = () => {};
  g.damagePlayer = () => 0;
  g.playSfxFiles = () => true;
  g.recLog = (_k: string, v: unknown) => { g.logs?.push(v); };
  g.dumpChest = () => {};
  g.trackTile = 0;
  return g;
};

describe('SW-J1 手雷族裂砖专破（:79001-79033 → :80505-80525）', () => {
  it('数据面：专破表={30,397,517,588};族内弹 EXPLODE_RADIUS/BOMB_PAYLOAD 全表外', () => {
    expect([...Game.EXPLODE_CRACKED_PROJ].sort((a, b) => a - b)).toEqual([30, 397, 517, 588]);
    for (const id of Game.EXPLODE_CRACKED_PROJ) {
      expect(Game.EXPLODE_RADIUS[id]).toBeUndefined();   // grenade 分派 er=0 → destroyTiles=false
      expect(Game.BOMB_PAYLOAD[id]).toBeUndefined();
    }
  });

  it('行为面：er=0 真实 explodeAt 不破普通地形;r4 开圆内裂砖全碎、圆外裂砖保留', () => {
    const world = new World(64, 64, 7, 'j1');
    const st = world.store;
    const g = mkGame(world);
    const cracked = TILE_BY_KEY['v_481_cracked_blue_brick']!;
    const stone = TILE_BY_KEY['stone']!;
    const ex = 20 * 16 + 8, ey = 20 * 16 + 8;                        // 手雷 Kill Center=格中心
    const disc = Game.explodeDiscTiles(ex, ey, 4, st.w, st.h);
    for (const [x, y] of disc) if ((x + y) % 2 === 0) st.setTileSilent(x, y, cracked);
    for (const [x, y] of disc) if ((x + y) % 2 === 1) st.setTileSilent(x, y, stone);
    st.setTileSilent(20, 26, cracked);                               // 圆外裂砖（距 5.5>4,无裂砖邻）
    // grenade 分派实参式复现（er=EXPLODE_RADIUS[30]??0 → 0/false）+ 回调裂砖盘同式消费
    g.explodeAt(20, 20, 60, Game.EXPLODE_RADIUS[30] ?? 0, (Game.EXPLODE_RADIUS[30] ?? 0) > 0, 64, 0, 30, ex, ey);
    for (const [x, y] of Game.explodeDiscTiles(ex, ey, 4, st.w, st.h)) {
      if (isCrackedAt(st, x, y)) (g as { breakCrackedBrick: (x: number, y: number) => void }).breakCrackedBrick(x, y);
    }
    for (const [x, y] of disc) {
      if ((x + y) % 2 === 1) expect(st.get(x, y), `石头 ${x},${y} 应保留`).toBe(stone);
      else expect(st.get(x, y), `裂砖 ${x},${y} 应碎`).toBe(0);
    }
    expect(st.get(20, 26)).toBe(cracked);                            // 圆外裂砖不在盘内不破
  });
});

describe('SW-J1 TNT 桶 1002 定谳锚（:79027-79030 无 1002,:79064 死代码 → 不炸地形）', () => {
  it('挖毁 654 → 整件清+无掉落;r10 旧盘域地形零破坏（explodeAt r=0/destroyTiles=false）', () => {
    const world = new World(64, 64, 7, 'j1');
    const st = world.store;
    const g = mkGame(world);
    g.logs = [];
    const barrel = TILE_BY_KEY['v_654_tnt_barrel']!;
    const stone = TILE_BY_KEY['stone']!;
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) st.setTileSilent(x, y, stone);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(10 + dx, 10 + dy, barrel, dx * 18, dy * 18);
    g.breakTile(10, 10, false);   // 真实 breakTile → tntBarrelBlast → 真实 explodeAt
    expect(st.get(10, 10)).toBe(0);
    expect(st.get(11, 11)).toBe(0);                                  // 整件清
    const oldDisc = Game.explodeDiscTiles(10 * 16 + 8, 10 * 16 + 8, 10, st.w, st.h);
    for (const [x, y] of oldDisc) {
      if ((x === 10 || x === 11) && (y === 10 || y === 11)) continue; // 桶体四格已清
      expect(st.get(x, y), `旧 r10 盘 ${x},${y} 应保留`).toBe(stone);
    }
    expect(g.logs).toContainEqual(expect.objectContaining({ projId: 1002, r: 0, destroyTiles: false }));
  });
});
