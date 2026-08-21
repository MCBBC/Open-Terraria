import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';

describe('probe4 chlorophyte', () => {
  it('updateUse drives 1226', () => {
    const id = ITEM_BY_KEY['vi_1226_ChlorophyteClaymore'];
    console.log('itemId:', id, 'def:', JSON.stringify(ITEM_DEFS[id]).slice(0, 200));
    const w = new World(120, 120, 30, 'p4');
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.inv.add(id, 1);
    const added: unknown[] = [];
    g.player = player;
    g.world = w;
    g.entities = { critters: [], npcs: [], enemies: [], add: (e: unknown) => added.push(e) };
    g.input = { mouseDown: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
    g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [0, 0] };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    (g as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    console.log('added:', added.length, added.map((a) => (a as { constructor: { name: string } }).constructor.name));
    console.log('counter:', player.chlorophyteBladeCounter, 'useTime:', player.useTime, 'facing:', player.facing);
    const arrow = added[0] as { vx: number; vy: number; damage: number; knockback: number; projId: number };
    console.log('arrow:', arrow?.vx, arrow?.vy, arrow?.damage, arrow?.knockback, arrow?.projId);
    expect(added.length).toBe(1);
  });
});
