import { it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import type { GameHooks } from '../src/entities/types';
import { Minecart } from '../src/entities/Minecart';
import { frameTrackArea, placeTrack, getOnTrack } from '../src/world/MinecartTrack';
const TRACK = TILE_BY_KEY['v_314_minecart_track'] ?? -1;
function line(st: TileStore, x0: number, y: number, n: number, style = 0): void {
  for (let k = 0; k < n; k++) { placeTrack(st, x0 + k, y, style); frameTrackArea(st, x0 + k, y); }
}
it('dbg13', () => {
  const st = new TileStore(80, 30);
  line(st, 8, 12, 40);
  const p = new Player(0, 0, new Inventory());
  const cart = new Minecart();
  cart.mountId = 13; cart.applyMountStats();
  const snap = getOnTrack(st, 9, 12, 9 * TILE, 12 * TILE - 40, cart.w, cart.h);
  cart.x = snap!.x; cart.y = snap!.y; cart.mounted = true;
  const calls: number[] = [];
  const game = {
    world: { store: st, flags: {}, isExpert: false }, player: p,
    enemies: () => [{ x: 9 * 16, y: 12 * 16, w: 20, h: 20, dead: false, iframes: 0, friendly: false,
      hurt: (d: number) => { calls.push(d); return true; } }],
    critters: () => [], spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, hitTrackSwitch: () => {},
  } as unknown as GameHooks;
  console.log('h', cart.h, 'run', cart.runSpeed, 'seat', cart.x, cart.y);
  cart.vx = 10;
  cart.fixedUpdate(1 / 60, game);
  console.log('vx', cart.vx, 'vy', cart.vy, 'onTrack', cart.onTrackNow, 'dmg', calls);
});
