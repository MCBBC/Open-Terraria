/**
 * 守卫老人回家传送备用臂（★红蓝批 R2 修正,2026-09-01）：
 * 原版触发条件 OR 右项 `type==37 && Main.tileDungeon[脚格]`（NPC.cs:53973）——
 * tileDungeon 全集 = {41,43,44,677,678,679}（Main.cs:8131-8136）。老人白天站在
 * 地牢砖上但不在驻地（home 精确同格）→ 双视野矩形无活玩家 → 拽回驻地。
 * 修前本仓该臂整缺：白天老人游走到地牢深处永不回防。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';

const F = 100;
const STONE_BRICK_OLD = TILE_BY_KEY['v_41_old_brick']
  ?? TILE_BY_KEY['v_41_blue_brick'] ?? TILE_BY_KEY['dungeon_brick'] ?? TILE_BY_KEY['stone'];

function dungeonWorld(): World {
  const world = new World(200, 200, 100, 'oldman-warp');
  const st = world.store;
  for (let x = 20; x <= 180; x++) {
    st.setTileSilent(x, F, STONE_BRICK_OLD);   // 地面整条铺地牢砖 → 脚格恒 tileDungeon
  }
  return world;
}

function makeGame(world: World, npcs: unknown[]) {
  return {
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => [],
      npcs: () => npcs,
      critters: () => [],
      spawnTownShot: () => {},
      spawnParticles: () => {}, spawnBurst: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
    } as never,
  };
}

describe('守卫老人地牢拽回臂（type37 && tileDungeon[脚格]）', () => {
  it('白天地牢砖上远离驻地 → 被拽回 home 三列内且脚行落地', () => {
    const world = dungeonWorld();
    // 老人 home 驻地在 130；现位于 104 列(26 格外)——白天旗关闭,
    // 仅靠 tileDungeon 备用臂触发
    const npc = new TownNPC('old_man', 104 * 16, (F - 2) * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, [npc]);
    let warped = false;
    for (let t = 0; t < 60; t++) {
      npc.fixedUpdate(1 / 60, game);
      if ((npc as unknown as { teleportedHome: boolean }).teleportedHome) { warped = true; break; }
    }
    expect(warped).toBe(true);
    expect(Math.abs(npc.cx - (130 * 16 + 8))).toBeLessThanOrEqual(16);
    expect(Math.floor((npc.y + npc.h + 1) / 16)).toBe(F);
  });

  it('非地牢砖地面（普通石地面）：白天无 flag 臂 → 不触发传送', () => {
    const world = new World(200, 200, 100, 'oldman-nodungeontile');
    const st = world.store;
    for (let x = 20; x <= 180; x++) st.setTileSilent(x, F, TILE_BY_KEY['stone']);
    const npc = new TownNPC('old_man', 104 * 16, (F - 2) * 16);
    npc.home = { x: 130, y: F - 1 };
    const { game } = makeGame(world, [npc]);
    for (let t = 0; t < 120; t++) npc.fixedUpdate(1 / 60, game);
    expect((npc as unknown as { teleportedHome: boolean }).teleportedHome).toBe(false);
  });
});
