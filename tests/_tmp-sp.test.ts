import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { statusPlayer } from '../src/entities/projTargets';
import { BuffType, buffTypeByVanilla } from '../src/stats/Buffs';

it('debug', () => {
  const world = new World(64, 32, 42, '测试');
  const player = new Player(8 * 16, 10 * 16, new Inventory());
  const game = { world, player, enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {}, spawnParticles: () => {},
    playSfx: () => {}, playSfxFiles: () => {} } as never;
  console.log('buffTypeByVanilla(324)=', buffTypeByVanilla(324));
  try { statusPlayer(game, 119); } catch (e) { console.log('THREW', e); }
  console.log('active=', [...player.buffs.active.entries()]);
  expect(true).toBe(true);
});
