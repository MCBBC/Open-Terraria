import { it, expect } from 'vitest';
import { World } from '../src/world/World';
const { Player } = await import('../src/entities/Player');
const { Inventory } = await import('../src/items/Inventory');
it('F21 probe clone', { timeout: 30000 }, async () => {
  const t0 = Date.now();
  console.log('imports done', t0);
  const { Enemy } = await import('../src/entities/Enemy');
  const w = new World(60, 60, 42, 'redblue-r5');
  console.log('world built', Date.now() - t0);
  for (let x = 12; x <= 40; x++) w.store.setTileSilent(x, 30, 1 /* dirt */);
  console.log('tiles done', Date.now() - t0);
  const p = new Player(20 * 16, 27 * 16, new Inventory());
  console.log('player built', Date.now() - t0);
  const settleHooks: any = {
    world: w, player: p, enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, scene: {},
  };
  for (let i = 0; i < 12; i++) {
    const ti = Date.now();
    p.fixedUpdate(1 / 60, settleHooks as never);
    if (Date.now() - ti > 100) console.log('slow tick', i, Date.now() - ti, 'ms');
  }
  console.log('settle', Date.now() - t0, 'ms; player y=', p.y.toFixed(0), 'onGround', p.onGround);
  const e = new Enemy(20 * 16, 28 * 16, 'zombie', w);
  (e as unknown as { def: { damage: number } }).def = { damage: 100 };
  let got = -1;
  const hooks = { ...settleHooks, damagePlayer: (d: number) => { got = d; }, enemies: () => [e] };
  const t1 = Date.now();
  (e as unknown as { fixedUpdate: (dt: number, g: unknown) => void }).fixedUpdate(1 / 60, hooks as never);
  console.log('enemy tick ms', Date.now() - t1, 'got', got);
  expect(Date.now() - t0).toBeLessThan(20000);
}, 30000);
