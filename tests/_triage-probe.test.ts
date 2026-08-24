// 临时分诊探针（跑完即删）——trusty-mounts 修正落地 y 验证
import { describe, it, expect } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
function makeStore(wet: boolean): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  if (wet) for (let x = 0; x < W; x++) for (let y = 96; y < 100; y++) store.setLiquid(x, y, 255, 1);
  return store;
}
const mkEnemy = (id: number, cx: number, cy: number) => {
  const e = { id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; } };
  return e;
};

describe('probe', () => {
  it('wet jump with corrected spawn y', () => {
    for (const wet of [false, true]) {
      const store = makeStore(wet);
      const pl = new Player(60 * 16, 90 * 16, new Inventory());
      const enemies = [mkEnemy(1, 60 * 16, 100 * 16 - 62)];
      const hooks: GameHooks = {
        world: { store } as never,
        player: pl as never,
        enemies: () => enemies,
        critters: () => [],
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
      } as never;
      (hooks as unknown as { entities: unknown }).entities = { add: () => {}, projectiles: [] };
      const m = new MinionProj(60 * 16, 100 * 16 - 22, 1112, 10, 2, false, 0, false, () => pl);
      m.fixedUpdate(1, hooks);
      console.log('wet=', wet, 'vy', (m as never as { vy: number }).vy,
        'onGround', (m as never as { onGround: boolean }).onGround);
    }
    expect(true).toBe(true);
  });
});
