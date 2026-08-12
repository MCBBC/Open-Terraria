import { it } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { Inventory } from '../src/items/Inventory';
import { TownShot } from '../src/entities/TownShot';

it('debug', () => {
  const world = new World(200, 200, 100, 'atk');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const guide = new TownNPC('guide', 100 * 16, 99 * 16, new Inventory());
  guide.stationary = true;
  const enemy = { x: 160 * 16, y: 96 * 16, w: 20, h: 40, dead: false, hurt: () => true };
  const shots: TownShot[] = [];
  const game = {
    world, player: { dead: true },
    enemies: () => [enemy],
    spawnTownShot: (s: TownShot) => shots.push(s),
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {}, critters: () => [],
  } as never;
  for (let t = 0; t < 900; t++) guide.fixedUpdate(1 / 60, game);
  console.log('guide pos:', guide.x, guide.y, 'enemy:', enemy.x, 'dist:', enemy.x - guide.x, 'shots:', shots.length);
});
