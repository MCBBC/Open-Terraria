// 临时诊断（跑完即删）：r7 落水后浮态状态轨迹
import { describe, it, expect } from 'vitest';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const TILE = 16;

function makeHooks(waterAt?: { x: number; y: number; w?: number }) {
  const store = new TileStore(200, 120);
  if (waterAt) {
    const w = waterAt.w ?? 1;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < 3; dy++) store.setLiquid(waterAt.x + dx, waterAt.y + dy, 200, 1);
    }
  }
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  player.inv.selected = 5;
  player.inv.slots[5] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!, stack: 1 };
  const hooks: GameHooks = {
    world: {
      store,
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0 },
      flags: {},
      scene: null,
    } as never,
    player: player as never,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, store, player };
}

describe('scratch', () => {
  it('trace', () => {
    const { hooks, player } = makeHooks({ x: 64, y: 95, w: 30 });
    const b = new Bobber(player.cx, player.y - 10, 6, -4, 30, 3, 15, () => player);
    let landed = false;
    for (let k = 0; k < 200; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    console.log('landed', landed, 'x', b.x.toFixed(2), 'y', b.y.toFixed(2), 'cy', b.cy.toFixed(2));
    const st = (hooks.world as unknown as { store: TileStore }).store;
    for (let k = 0; k < 2000; k++) {
      b.fixedUpdate(1, hooks);
      if (k < 12 || k % 100 === 0 || b.dead) {
        const iT = Math.floor(b.cx / TILE), jT = Math.floor(b.cy / TILE);
        const liq = st.inBounds(iT, jT) ? st.liquid[st.idx(iT, jT)] : -1;
        console.log(`k=${k} dead=${b.dead} float=${b.floating} wet=${b.wet} swet=${b.shimmerWet} ai1=${b.ai1.toFixed(1)} lAI1=${(b as unknown as { lAI1: number }).lAI1.toFixed(1)} y=${b.y.toFixed(3)} cy=${b.cy.toFixed(3)} vy=${(b as unknown as { vy: number }).vy.toFixed(4)} tile=(${iT},${jT}) liq=${liq} biteT=${b.biteT}`);
      }
      if (b.biteT > 0) { console.log('BITED at k=', k); break; }
      if (b.dead && k > 12) break;
    }
    expect(landed).toBe(true);
  });
});
