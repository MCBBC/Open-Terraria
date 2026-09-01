import { it } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';

it('stair debug', () => {
  const w = new World(120, 220, 7, 'stair-dbg');
  const st = w.store;
  for (let k = -4; k <= 10; k++) {
    const tx = 50 + k;
    const r0 = 362 + 2 * k - 12;
    if (r0 < 8 || r0 + 8 >= 220) continue;
    st.setTile(tx, r0, 2); st.setSlope(tx, r0, 1);
    st.setTile(tx, r0 + 1, 2);
    st.setTile(tx, r0 + 2, 2); st.setSlope(tx, r0 + 2, 4);
  }
  const b: any = { x: 54 * TILE + 2, y: 340 * TILE, w: 20, h: 42, vx: 0, vy: 0,
    onGround:false, hitWall:false, hitHead:false, collideY:false, tileCollide:true, dropThrough:true };
  for (let i = 0; i < 80; i++) {
    b.vy = Math.min(b.vy + 0.4, 10);
    const preY = b.y;
    moveAndCollide(b, w as never, b.vx, b.vy);
    if (i % 5 === 0 || b.onGround) {
      console.log('t' + i, 'y', preY.toFixed(0), '->', b.y.toFixed(0), 'og', b.onGround,
        'row', Math.floor((b.y + b.h) / 16));
    }
    if (b.onGround && i > 20) break;
  }
});
