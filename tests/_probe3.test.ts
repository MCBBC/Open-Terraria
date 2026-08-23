import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_DEFS } from '../src/data/tiles';

const W = 160, H = 90, FLOOR = 60;
describe('probe3', () => {
  it('door detection trace', () => {
    const w = new World(W, H, 11, 'p3');
    for (let x = 0; x < W; x++) { w.store.setTile(x, FLOOR, 1); w.store.setTile(x, FLOOR + 1, 1); }
    w.clock.timeOfDay = 0.9;
    w.clock.bloodMoon = true;
    let doorId = -1;
    for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 10) { doorId = i; break; }
    for (let dy = 0; dy < 3; dy++) w.store.setTile(31, FLOOR - 1 - dy, doorId);
    const player = new Player(40 * TILE, (FLOOR - 3) * TILE, new Inventory());
    const hooks = { world: w, player, enemies: () => [], critters: () => [], npcs: () => [],
      spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, onEnemyKilled: () => {},
      spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {}, cutTile: () => {},
      breakTile: () => {}, scene: { zoneGraveyard: false } } as unknown as GameHooks;
    const e = Enemy.fromVanilla(3, 29 * TILE, (FLOOR - 2) * TILE)!;
    e.y = FLOOR * TILE - e.h;
    console.log('box', e.x, e.x + e.w, 'w', e.w, 'h', e.h);
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (t % 40 === 0) console.log(t, 'x', e.x.toFixed(1), 'facing', e.facing, 'warm', e.doorWarm, 'hit', e.doorHit, 'ai3', e.ai3, 'vx', e.vx.toFixed(2), 'vy', e.vy.toFixed(2));
    }
    console.log('tile at (31,58):', w.store.type[w.store.idx(31, 58)]);
    expect(true).toBe(true);
  });
});
