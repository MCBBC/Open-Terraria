import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const W = 160, H = 90, FLOOR = 60;
describe('probe4', () => {
  it('454 speed trace', () => {
    const w = new World(W, H, 11, 'p4');
    for (let x = 0; x < W; x++) { w.store.setTile(x, FLOOR, 1); w.store.setTile(x, FLOOR + 1, 1); }
    for (let x = 45; x <= 75; x++) for (let y = FLOOR - 4; y <= FLOOR - 1; y++) w.store.setTile(x, y, 1);
    w.clock.timeOfDay = 0.9;
    const player = new Player(80 * TILE, (FLOOR - 3) * TILE, new Inventory());
    const hooks = { world: w, player, enemies: () => [], critters: () => [], npcs: () => [],
      spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, onEnemyKilled: () => {},
      spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {}, cutTile: () => {},
      scene: {} } as unknown as GameHooks;
    const e = Enemy.fromVanilla(454, 50 * TILE, (FLOOR - 3) * TILE)!;
    e.y = (FLOOR - 3) * TILE;
    e.vx = 10; e.vy = 0;
    console.log('w', e.w, 'h', e.h, 'wormNext', !!e.wormNext, 'wormFollow', !!e.wormFollow);
    const drive = (e as unknown as { wormAI: (g: GameHooks, p: Player | null) => void }).wormAI;
    for (let t = 0; t < 80; t++) {
      drive.call(e, hooks, player);
      if (t % 10 === 0) console.log(t, 'vx', e.vx.toFixed(2), 'vy', e.vy.toFixed(2), 'x', e.x.toFixed(0), 'dead', e.dead);
    }
    expect(true).toBe(true);
  });
});
