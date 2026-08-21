import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

function makeHooks(enemies: Array<Record<string, unknown>> = [], store?: TileStore) {
  const st = store ?? new TileStore(200, 120);
  const hooks: GameHooks = {
    world: { store: st } as never,
    player: { equipStats: {}, cx: 50 * 16, cy: 90 * 16, x: 790, y: 1400, w: 20, h: 42, dead: false } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  return hooks;
}
function mkEnemy(id: number, x: number, y: number, w = 16, h = 16) {
  const e: Record<string, unknown> = { id, x, y, w, h, dead: false, hurtLog: [] as unknown[] };
  e.hurt = (...a: unknown[]) => { (e.hurtLog as unknown[]).push(a); return false; };
  return e;
}

describe('gem probe', () => {
  it('homing turns toward enemy', () => {
    const g = makeHooks([mkEnemy(1, 800, 800)]);
    const a = new Arrow(500, 800, 8, 0, 10, 1, 121, null, { gem: { homing: true }, grav: 0, life: 100, pierce: 1 });
    a.fixedUpdate(1 / 60, g);
    console.log('homing vy:', a.vy, 'vx:', a.vx);
    expect(Math.abs(a.vy)).toBeGreaterThan(0);
  });
  it('fastThenSlow decel', () => {
    const g = makeHooks();
    const a = new Arrow(500, 800, 8, 0, 10, 1, 124, null, { gem: { fastThenSlow: true }, grav: 0, life: 300, pierce: 1 });
    console.log('ctor life:', a.life, 'pierce:', a.pierce);
    a.fixedUpdate(1 / 60, g);
    console.log('after 1 step vx:', a.vx);
    expect(a.vx).toBeCloseTo(7.76, 5);
    expect(a.life).toBe(600);
  });
  it('swirl twins sway', () => {
    const g = makeHooks();
    const a = new Arrow(500, 800, 8, 0, 10, 1, 123, null, { gem: { swirlTwins: true }, grav: 0, life: 100, pierce: 1 });
    const x0 = a.x, y0 = a.y;
    a.fixedUpdate(1 / 60, g);
    console.log('swirl dx:', a.x - x0, 'dy:', a.y - y0);
    expect(a.y - y0).toBeGreaterThan(0);
  });
  it('bigger hitbox', () => {
    const e = mkEnemy(1, 500 + 35, 800 - 8);  // 16px proj at x=500..516
    const g = makeHooks([e]);
    const a = new Arrow(500, 800 - 8, 0.01, 0, 10, 1, 126, null, { gem: { biggerHitbox: true }, grav: 0, life: 100, pierce: 5 });
    a.fixedUpdate(1 / 60, g);
    console.log('bigger hurtLog:', (e.hurtLog as unknown[]).length, 'pierce ctor:', a.pierce);
    expect((e.hurtLog as unknown[]).length).toBe(1);
  });
  it('aoe explosion on kill', () => {
    const near = mkEnemy(1, 500 + 40, 800);
    const far = mkEnemy(2, 500 + 400, 800);
    const g = makeHooks([near, far]);
    const a = new Arrow(500, 800, 0, 0, 100, 2, 122, null, { gem: { aoeExplosion: true }, grav: 0, life: 1, pierce: 1 });
    a.fixedUpdate(1 / 60, g);
    console.log('aoe near:', (near.hurtLog as unknown[]).length, (near.hurtLog as unknown[])[0]?.slice(0, 2),
      'far:', (far.hurtLog as unknown[]).length, 'dead:', a.dead);
    expect(a.dead).toBe(true);
    expect((near.hurtLog as unknown[]).length).toBe(1);
    expect((far.hurtLog as unknown[]).length).toBe(0);
  });
  it('canBounce dead-code check', () => {
    const st = new TileStore(200, 120);
    for (let x = 40; x < 60; x++) st.setTile(x, 49, 1);
    const g = makeHooks([], st);
    const a = new Arrow(40 * 16, 49 * 16 + 8, 8, 0, 10, 1, 597, null, { gem: { canBounce: true }, grav: 0, life: 100, pierce: 5 });
    console.log('ctor pierce (canBounce +2):', a.pierce);
    for (let i = 0; i < 30 && !a.dead; i++) a.fixedUpdate(1 / 60, g);
    console.log('canBounce dead:', a.dead, 'vx:', a.vx);
    expect(a.pierce).toBe(7);
  });
});
