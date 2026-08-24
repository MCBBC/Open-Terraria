import { it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

it('618 direct probe', () => {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks = {
    world: { store, get groundLevel() { return 80; } },
    player, enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {}, spawnDust: () => null,
  } as unknown as GameHooks;
  (hooks as any).entities = { add: () => {}, projectiles: [] };
  const parent = new Arrow(1000, 1000, 0, 0, 70, 5, 617, null, { grav: 0, life: 3600, pierce: 3 });
  const spark = new Arrow(1100, 1100, 12, 0, 35, 0, 618, null, { grav: 0, life: 420, pierce: -1 });
  spark.naParent = parent;
  spark.naLastPX = 1000; spark.naLastPY = 1000;
  console.log('naParent set?', (spark as any).naParent === parent, 'naAi0 before=', (spark as any).naAi0);
  spark.fixedUpdate(1, hooks);
  console.log('after 1: naAi0=', (spark as any).naAi0, 'x=', spark.cx.toFixed(1), 'vx=', spark.vx.toFixed(2), 'dead=', spark.dead);
  expect(true).toBe(true);
});
