import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

describe('dbg', () => {
  it('dbg', () => {
    const w = new World(140, 90, 11, 'dbg');
    const st = w.store;
    w.groundLevel = 24;
    for (let x = 0; x < 140; x++) { st.setTile(x, 60, 1); st.setTile(x, 61, 1); }
    w.clock.timeOfDay = 0.9;
    const player = new Player(70 * TILE, 57 * TILE, new Inventory());
    const hooks = { world: w, player, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
      onEnemyKilled: () => {}, spawnParticles: () => {}, playSfxFiles: () => {} } as unknown as GameHooks;
    const e = Enemy.fromVanilla(659, 40 * TILE, 58 * TILE)!;
    console.log('spawn y', e.y, 'h', e.h, 'bottom', e.y + e.h, 'floorTop', 60 * TILE);
    for (let i = 0; i < 120 && e.vy !== 0; i++) e.fixedUpdate(1 / 60, hooks);
    console.log('after settle: y', e.y, 'vy', e.vy, 'onGround', e.onGround, 'ai0', e.ai0, 'ai2', e.ai2);
    const drive = (e2: Enemy, fn: string) => (e2 as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];
    e.ai0 = -300; e.vx = 0;
    drive(e, 'slimeAI').call(e, hooks, player);
    console.log('after drive: vy', e.vy, 'vx', e.vx, 'ai0', e.ai0, 'facing', e.facing);
  });
});
