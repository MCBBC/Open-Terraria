import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

function makeHooks(store: TileStore): GameHooks {
  const hooks = {
    world: { store } as never,
    player: { equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false } as never,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  };
  return hooks as unknown as GameHooks;
}

describe('rope probe', () => {
  it('noTileCollide state of rope projs', () => {
    const stone = TILE_BY_KEY['v_1_stone'];
    console.log('stone id', stone);
    for (const pid of [171, 475, 505, 506]) {
      const a = new Arrow(100, 100, 4, 4, 0, 0, pid, null, { grav: 0.2, gravDelay: 30, life: 400, pierce: 6 });
      console.log('proj', pid, 'noTileCollide=', (a as unknown as { noTileCollide: boolean }).noTileCollide,
        'w/h', (a as unknown as { w: number }).w, (a as unknown as { h: number }).h,
        'grav', (a as unknown as { grav: number }).grav, 'life', (a as unknown as { life: number }).life);
    }
    expect(true).toBe(true);
  });
  it('does 475 plant rope on solid hit', () => {
    const store = new TileStore(400, 240);
    const stone = TILE_BY_KEY['v_1_stone'] ?? 1;
    // Fill a solid wall at tile x=20,y=10
    for (let y = 8; y < 14; y++) store.setTileSilent(20, y, stone, 0, 0);
    const g = makeHooks(store);
    const a = new Arrow(20 * 16 - 30, 10 * 16 + 8, 2, 0, 0, 0, 475, null, { grav: 0.2, gravDelay: 30, life: 400, pierce: 6 });
    let ticks = 0;
    while (!a.dead && ticks < 200) { a.fixedUpdate(1 / 60, g); ticks++; }
    console.log('dead after', ticks);
    let planted = 0;
    for (let y = 0; y < 240; y++) if ((TILE_DEFS[store.get(19, y)]?.rope)) planted++;
    for (let y = 0; y < 240; y++) if ((TILE_DEFS[store.get(20, y)]?.rope)) planted++;
    console.log('planted rope tiles:', planted);
    expect(true).toBe(true);
  });
});
