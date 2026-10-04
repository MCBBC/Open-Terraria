import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const mkWorld = (): World => {
  const w = new World(160, 160, 33, 'bj508d');
  for (let x = 12; x <= 140; x++) w.store.setTileSilent(x, 30, 1);
  return w;
};
const hooks = (w: World, p?: Player) => ({
  world: w, player: p, enemies: () => [], critters: () => [], spawnDrop: () => null,
  damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
  notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  showPickupLabel: () => {}, recLog: () => {}, achievements: undefined, scene: {},
});
describe('debug', () => {
  it('leftward key dash', () => {
    const w = mkWorld();
    const p = new Player(40 * 16, 27 * 16, new Inventory());
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.facing = -1;
    // arm
    p.inputDash = false; p.releaseDash ||= !p.inputDash;
    p.fixedUpdate(1/60, hooks(w, p) as never);
    console.log('after arm: facing=', p.facing, 'releaseDash=', p.releaseDash, 'inputDash=', p.inputDash, 'eq dash? dashT=', p.dashT);
    p.inputDash = true; p.releaseDash ||= !p.inputDash;
    console.log('pre-tick: facing=', p.facing, 'releaseDash=', p.releaseDash);
    p.fixedUpdate(1/60, hooks(w, p) as never);
    console.log('post: vx=', p.vx, 'dashDelay=', p.dashDelay, 'facing=', p.facing, 'releaseDash=', p.releaseDash, 'dashed?', p.dashT, 'eoc=', p.eocDash);
  });
});
