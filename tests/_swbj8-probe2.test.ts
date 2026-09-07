// SW-BJ8 probe: Game.npcShopSell / npcShopSellHeld end-to-end with real Inventory
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (id === undefined) throw new Error(`vid ${vid} not registered`);
  return id;
};

function fakeGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  const inv = new Inventory();
  g.player = { inv, banks: [[], [], [], []], equipStats: { discount: false }, taxMoney: 0 };
  g.npcShopOpen = true;
  g.shopHappinessMul = 1;
  g.shopSellbackMemo = new Map<string, number>();
  g.shopBuybackStock = [];
  g.dialogNpc = null;
  g.sfx = { play: () => {}, playFiles: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  return { g, inv };
}

describe('SW-BJ8 probe: npcShopSell held/slot paths', () => {
  it('npcShopSell sells a gel stack (vid 23)', () => {
    const { g, inv } = fakeGame();
    const gel = iidOf(23);
    inv.slots[10] = { id: gel, stack: 50 };
    const ok = (Game.prototype as any).npcShopSell.call(g, 10);
    console.log('slot sell ok =', ok, 'slot now =', inv.slots[10], 'coins =', (Game.prototype as any).coinsOwned.call(g));
    expect(ok).toBe(true);
    expect(inv.slots[10]).toBeNull();
    expect((Game.prototype as any).coinsOwned.call(g)).toBe(10);
  });

  it('npcShopSellHeld sells a torch stack (vid 8)', () => {
    const { g, inv } = fakeGame();
    const torch = iidOf(8);
    inv.slots[11] = { id: torch, stack: 10 };
    // take to cursor like UI.pickUp would
    const held = { id: torch, stack: 10 };
    inv.slots[11] = null;
    const ok = (Game.prototype as any).npcShopSellHeld.call(g, held);
    console.log('held sell ok =', ok, 'coins =', (Game.prototype as any).coinsOwned.call(g), 'buyback =', g.shopBuybackStock);
    expect(ok).toBe(true);
    expect((Game.prototype as any).coinsOwned.call(g)).toBe(10);
  });

  it('npcShopSell with shopOpen=false (simulating lost state) returns false', () => {
    const { g, inv } = fakeGame();
    g.npcShopOpen = false;
    const gel = iidOf(23);
    inv.slots[10] = { id: gel, stack: 50 };
    const ok = (Game.prototype as any).npcShopSell.call(g, 10);
    console.log('closed-shop slot sell =', ok);
    expect(ok).toBe(false);
  });
});
