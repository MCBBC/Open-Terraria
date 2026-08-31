import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TOWN_ATTACK_TYPE } from '../src/data/vanillaTownAttack';
import { canHitLine } from '../src/physics/LineOfSight';

const F = 100;
describe('probe', () => {
  it('dance', () => {
    const world = new World(200, 200, 100, 'p');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, F, TILE_BY_KEY['dirt']!);
    const npc = new TownNPC('nurse', 100 * 16, F * 16);
    const pl = { x: 100 * 16 + 60, y: F * 16 - 40, w: 20, h: 40, dead: false, sitting: false };
    console.log('ATT', TOWN_ATTACK_TYPE[18], 'vid', (npc as unknown as { vanillaId: number }).vanillaId,
      'npcY', (npc as unknown as { y: number }).y, 'npcH', (npc as unknown as { h: number }).h,
      'cy', (npc as unknown as { cy: number }).cy);
    console.log('dist', Math.hypot((pl as { x: number }).x + 10 - (npc as unknown as { cx: number }).cx,
      (pl as unknown as { cy: number }).cy - (npc as unknown as { cy: number }).cy));
    console.log('canHitTop', canHitLine(world.store, (npc as unknown as { cx: number }).cx,
      (npc as unknown as { y: number }).y, 0, 0,
      (pl as { x: number }).x + (pl as { w: number }).w / 2, (pl as { y: number }).y, 0, 0));
  });
});
