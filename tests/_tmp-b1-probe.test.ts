import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { canHitPoint } from '../src/physics/LineOfSight';

describe('probe', () => {
  it('scan debug', () => {
    const CX = 30 * 16 + 8, CY = 16 * 16 + 8;
    const w = new World(64, 64, 42, 'probe');
    const n = new TownNPC('dyer', CX - 10, CY - 21);
    const me = n as unknown as Record<string, number>;
    // eslint-disable-next-line no-console
    console.log('npc x,y,cx,cy,w,h=', me.x, me.y, me.cx, me.cy, me.w, me.h);
    const foes = [{ x: CX + 80, y: CY - 20, w: 18, h: 40, dead: false,
      damage: 30, def: { friendly: false } }];
    const e = foes[0] as unknown as { x: number; y: number; w: number; h: number };
    const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
    // eslint-disable-next-line no-console
    console.log('foe ecx,ecy=', ecx, ecy, 'hypot=', Math.hypot(ecx - me.cx, ecy - me.cy),
      'los=', canHitPoint(w.store, me.cx, me.cy, ecx, ecy));
    expect(true).toBe(true);
  });
});
