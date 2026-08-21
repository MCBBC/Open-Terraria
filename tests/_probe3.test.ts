import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';

describe('probe3', () => {
  it('enemy pos semantics', () => {
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    const e = Enemy.fromVanilla(1, player.cx + 8, player.cy)!;
    console.log('player:', player.x, player.y, player.w, player.h, player.cx, player.cy, 'facing', player.facing);
    console.log('slime:', e.x, e.y, e.w, e.h, e.hp, e.hpMax, 'lifeMax', e.def.lifeMax);
    expect(true).toBe(true);
  });
});
