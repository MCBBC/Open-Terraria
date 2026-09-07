import { it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { ChestData } from '../src/world/World';

it('dbg toggle', () => {
  const w = new World(160, 200, 30, 'open');
  const t = TILE_BY_KEY['chest'];
  console.log('chest tile id:', t);
  w.store.setTileSilent(60, 100, t, 0, 0);
  w.store.setTileSilent(61, 100, t, 18, 0);
  w.store.setTileSilent(60, 101, t, 0, 18);
  w.store.setTileSilent(61, 101, t, 18, 18);
  const chestA: ChestData = { x: 60, y: 100, items: Array(10).fill(null) };
  w.chests.push(chestA);
  const sfx: string[] = [];
  let openRef: ChestData | null = null;
  let closed = 0;
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.achievements = { handleSpecialEvent: () => {} };
  g.sfx = { play: (n: string) => { sfx.push(n); } };
  g.input = { rightDown: true };
  g.chunks = { markDirtyArea: () => {} };
  g.openChestRef = () => openRef;
  g.openChest = (c: ChestData) => { openRef = c; };
  g.closeChestPanel = () => { openRef = null; closed++; };
  openRef = chestA;

  try {
    (g as unknown as { tryOpenChest: (c: ChestData) => void }).tryOpenChest(chestA);
  } catch (e) { console.log('THREW:', e); }
  console.log('sfx:', sfx, 'closed:', closed);
  expect(true).toBe(true);
});
