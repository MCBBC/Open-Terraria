import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { projGravSpec } from '../src/data/vanillaItemCombat';

describe('probe 267 grav', () => {
  it('spec + vy trace', () => {
    const spec = projGravSpec(267);
    console.log('spec(267) =', JSON.stringify(spec));
    const w = new World(160, 200, 30, 'open');
    for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
    const game = {
      world: w, player: null, enemies: () => [], critters: () => [], projectiles: () => [],
      entities: { nextId: 1, add: () => {} },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
      spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
      damagePlayer: () => 0, notifyInventoryChanged: () => {}, onEnemyKilled: () => {},
      spawnEnemy: () => {}, cutTile: () => {}, addLightAt: () => {},
      spawnDust: () => null, broadcastParticleOrchestra: () => {},
    } as unknown as GameHooks;
    const d = new Arrow(10 * 16, 40 * 16, 8, 0, 10, 1, 267, null, {});
    console.log('grav=', d.grav, 'delay=', d.gravDelay, 'EU=', d.extraUpdates);
    for (let t = 0; t < 21; t++) {
      d.fixedUpdate(1, game);
      if (t >= 17) console.log('t', t + 1, 'age', (d as unknown as { age: number }).age, 'vy', d.vy);
    }
  });
});
