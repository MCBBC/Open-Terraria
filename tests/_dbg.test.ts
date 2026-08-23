import { describe, expect, it } from 'vitest';
import { MinionProj } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/MinionProj';
import { Player } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/Player';
import { Inventory } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/items/Inventory';
import { TileStore } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/TileStore';
import type { GameHooks } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/entities/types';

function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24) {
  const e: any = { id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; } };
  return e;
}
function makeHooks(enemies: any[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: { store, flags: { hardMode: false } } as never,
    player: player as never,
    enemies: () => enemies, critters: () => [], spawnDrop: () => null, damagePlayer: () => {},
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {},
  };
  (hooks as any).entities = { add: (e: unknown) => { projectiles.push(e); }, projectiles };
  return { hooks, store, player, projectiles, enemies };
}

describe('dbg', () => {
  it('423 dash geometry', () => {
    const e = mkEnemy(1, 2508, 1440);
    const a = makeHooks([e]);
    const m = new MinionProj(2000, 1500, 423, 10, 2, false, 0, false, () => a.player);
    const p = m as any;
    m.fixedUpdate(1, a.hooks);
    console.log('a62A0=', p.a62A0, 'a62A1=', p.a62A1, 'a62EU=', p.a62EU, 'vx=', m.vx, 'vy=', m.vy);
    console.log('m.cx=', m.cx, 'm.cy=', m.cy, 'e.top=', e.y, 'aim=', e.cx, e.y - 80);
    console.log('num23=', Math.hypot(e.cx - m.cx, (e.y - 80) - m.cy));
    expect(true).toBe(true);
  });
});
