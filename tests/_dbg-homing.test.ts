import { it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

it('dbg bee', () => {
  const W = 200, H = 120;
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const enemy: any = { id: 1, x: 60 * 16 - 208, y: 90 * 16 + 88, w: 16, h: 24, dead: false, cx: 60 * 16 - 200, cy: 90 * 16 + 100, hp: 100000, hits: [], hurt(d: number) { enemy.hp -= d; enemy.hits.push(d); return true; } };
  const hooks = {
    world: { store }, player, enemies: () => [enemy], critters: () => [], spawnDrop: () => null,
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {}, spawnDust: () => null,
  } as unknown as GameHooks;
  (hooks as any).entities = { add: () => {}, projectiles: [] };
  const bee = new Arrow(60 * 16, 90 * 16, -5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3, extraUpdates: 3 });
  for (let i = 0; i < 40 && !bee.dead; i++) bee.fixedUpdate(1, hooks);
  console.log('bee dead=', bee.dead, 'vx=', bee.vx.toFixed(3), 'vy=', bee.vy.toFixed(3),
    'alpha=', bee.alpha, 'delay=', (bee as any).bee36Delay, 'aim=', JSON.stringify((bee as any).bee36Aim),
    'locked=', (bee as any).bee36AimLocked, 'x=', bee.cx, 'y=', bee.cy);
  expect(true).toBe(true);
});
