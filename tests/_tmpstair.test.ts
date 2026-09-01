import { it } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';

it('min variant', () => {
  // A: 单柱 full brick 直落
  {
    const w = new World(40, 120, 7, 'm1');
    const st = w.store;
    st.setTile(20, 20, 2);
    const b: any = { x: 20*TILE, y: 14*TILE, w: 20, h: 42, vx: 0, vy: 0,
      onGround:false,hitWall:false,hitHead:false,collideY:false,tileCollide:true,dropThrough:true };
    for (let i=0;i<40&&!b.onGround;i++){ b.vy=Math.min(b.vy+0.4,10); moveAndCollide(b,w as never,b.vx,b.vy); }
    console.log('A brick:',b.onGround,'y',b.y.toFixed(0));
  }
  // B: 单柱 slope1 于其上直落
  {
    const w = new World(40, 120, 7, 'm2');
    const st = w.store;
    st.setTile(20, 21, 2);
    st.setTile(20, 20, 2); st.setSlope(20, 20, 1);
    const b: any = { x: 20*TILE, y: 14*TILE, w: 20, h: 42, vx: 0, vy: 0,
      onGround:false,hitWall:false,hitHead:false,collideY:false,tileCollide:true,dropThrough:true };
    for (let i=0;i<60&&!b.onGround;i++){ b.vy=Math.min(b.vy+0.4,10); moveAndCollide(b,w as never,b.vx,b.vy); }
    console.log('B slope1:',b.onGround,'y',b.y.toFixed(0),'feetRow',Math.floor((b.y+b.h)/16));
  }
});
